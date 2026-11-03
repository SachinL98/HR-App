import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, Tx } from '../prisma/prisma.service';
import type { Ctx } from '../common/ctx';
import { can } from '../org/permissions';
import { decryptJson, encryptJson } from '../common/field-crypto';
import { notify } from '../notifications/notify';
import {
  calculate,
  Component,
  Line,
  Regime,
  TaxProfile,
  workingDaysIn,
} from './engine';
import { CreateRunDto, PayGroupDto, SalaryDto } from './dto';

const RANK = { FREE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 } as const;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface Lines {
  lines: Line[];
  ruleVersion: string | null;
}

@Injectable()
export class PayrollService {
  constructor(private prisma: PrismaService) {}

  /** Payroll needs Silver or above; the statutory UK/Sri Lanka rules need Gold. */
  private async requireTier(tx: Tx, tenantId: string, regime?: Regime) {
    const sub = await tx.subscription.findUniqueOrThrow({
      where: { tenantId },
    });
    const need = regime ? RANK.GOLD : RANK.SILVER;
    if (RANK[sub.tier] < need)
      throw new ForbiddenException(
        regime
          ? 'Statutory tax rules need the Gold plan or above'
          : 'Payroll needs the Silver plan or above',
      );
  }

  // ───────────── pay groups ─────────────

  payGroups(c: Ctx) {
    return this.prisma.withTenant(c.tenantId, (tx) =>
      tx.payGroup.findMany({ orderBy: { name: 'asc' } }),
    );
  }

  createPayGroup(c: Ctx, dto: PayGroupDto) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      await this.requireTier(tx, c.tenantId, dto.taxRegime ?? null);
      const t = await tx.tenant.findUniqueOrThrow({
        where: { id: c.tenantId },
      });
      const g = await tx.payGroup.create({
        data: {
          tenantId: c.tenantId,
          name: dto.name,
          currency: (dto.currency ?? t.currency).toUpperCase(),
          payDay: dto.payDay,
          taxRegime: dto.taxRegime ?? null,
        },
      });
      await this.audit(tx, c, 'payroll.paygroup.create', g.id);
      return g;
    });
  }

  // ───────────── salaries ─────────────

  setSalary(c: Ctx, memberId: string, dto: SalaryDto) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      await this.requireTier(tx, c.tenantId);
      const [m, g] = await Promise.all([
        tx.member.findFirst({ where: { id: memberId, status: 'ACTIVE' } }),
        tx.payGroup.findFirst({ where: { id: dto.payGroupId } }),
      ]);
      if (!m) throw new NotFoundException('Member not found');
      if (!g) throw new BadRequestException('Unknown pay group');
      const codes = new Set(dto.components.map((x) => x.code));
      if (codes.size !== dto.components.length)
        throw new BadRequestException('Each pay component needs a unique code');
      const data = {
        tenantId: c.tenantId,
        payGroupId: g.id,
        basicEnc: encryptJson(c.tenantId, dto.basic),
        componentsEnc: encryptJson(c.tenantId, dto.components),
        taxProfile: dto.taxProfile
          ? ({ ...dto.taxProfile } as Record<string, string | boolean>)
          : undefined,
        effectiveFrom: new Date(`${dto.effectiveFrom}T00:00:00.000Z`),
      };
      await tx.salaryStructure.upsert({
        where: { memberId },
        create: { memberId, ...data },
        update: data,
      });
      await this.audit(tx, c, 'payroll.salary.set', memberId);
      return { ok: true };
    });
  }

  salaries(c: Ctx) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const rows = await tx.salaryStructure.findMany({
        include: {
          member: {
            select: { id: true, firstName: true, lastName: true, status: true },
          },
          payGroup: { select: { id: true, name: true, currency: true } },
        },
      });
      return rows.map((r) => ({
        memberId: r.memberId,
        member: r.member,
        payGroup: r.payGroup,
        taxProfile: r.taxProfile,
        effectiveFrom: r.effectiveFrom,
        basic: decryptJson<number>(c.tenantId, r.basicEnc),
        components: decryptJson<Component[]>(c.tenantId, r.componentsEnc),
      }));
    });
  }

  // ───────────── runs ─────────────

  private async build(tx: Tx, c: Ctx, runId: string) {
    const run = await tx.payrollRun.findUniqueOrThrow({
      where: { id: runId },
      include: { payGroup: true },
    });
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: c.tenantId },
    });
    const start = run.periodStart;
    const end = run.periodEnd;
    const year = start.getUTCFullYear();
    const month = start.getUTCMonth() + 1;
    const workingDays = workingDaysIn(year, month, tenant.workWeek);
    const regime = (run.payGroup.taxRegime as Regime) ?? null;
    if (regime) await this.requireTier(tx, c.tenantId, regime);

    const structures = await tx.salaryStructure.findMany({
      where: {
        payGroupId: run.payGroupId,
        effectiveFrom: { lte: end },
        member: { status: 'ACTIVE' },
      },
    });

    // Unpaid leave: days approved for leave types that are not paid.
    const unpaidRows = await tx.dayStatus.findMany({
      where: {
        type: 'LEAVE',
        date: { gte: start, lte: end },
        memberId: { in: structures.map((s) => s.memberId) },
        requestId: { not: null },
      },
      select: { memberId: true, part: true, requestId: true },
    });
    const reqIds = [...new Set(unpaidRows.map((r) => r.requestId as string))];
    const unpaidTypes = (
      await tx.leaveType.findMany({
        where: { paid: false },
        select: { id: true },
      })
    ).map((t) => t.id);
    const unpaidReq = new Set(
      (
        await tx.request.findMany({
          where: { id: { in: reqIds }, leaveTypeId: { in: unpaidTypes } },
          select: { id: true },
        })
      ).map((r) => r.id),
    );
    const unpaid = new Map<string, number>();
    for (const r of unpaidRows)
      if (unpaidReq.has(r.requestId as string))
        unpaid.set(
          r.memberId,
          (unpaid.get(r.memberId) ?? 0) + (r.part === 'FULL' ? 1 : 0.5),
        );

    await tx.payslip.deleteMany({ where: { runId } });
    let ruleVersion: string | null = null;
    for (const s of structures) {
      const stored = {
        basic: decryptJson<number>(c.tenantId, s.basicEnc),
        components: decryptJson<Component[]>(c.tenantId, s.componentsEnc),
      };
      const days = unpaid.get(s.memberId) ?? 0;
      const res = calculate({
        basic: stored.basic,
        components: stored.components,
        unpaidDays: days,
        workingDays,
        regime,
        taxProfile: (s.taxProfile as TaxProfile | null) ?? undefined,
      });
      ruleVersion = res.ruleVersion;
      await tx.payslip.create({
        data: {
          tenantId: c.tenantId,
          runId,
          memberId: s.memberId,
          linesEnc: encryptJson(c.tenantId, {
            lines: res.lines,
            ruleVersion: res.ruleVersion,
          } satisfies Lines),
          grossEnc: encryptJson(c.tenantId, res.gross),
          netEnc: encryptJson(c.tenantId, res.net),
          unpaidDays: days,
        },
      });
    }
    await tx.payrollRun.update({ where: { id: runId }, data: { ruleVersion } });
    return structures.length;
  }

  createRun(c: Ctx, dto: CreateRunDto) {
    const [y, m] = dto.month.split('-').map(Number);
    const periodStart = new Date(Date.UTC(y, m - 1, 1));
    const periodEnd = new Date(Date.UTC(y, m, 0));
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      await this.requireTier(tx, c.tenantId);
      const g = await tx.payGroup.findFirst({ where: { id: dto.payGroupId } });
      if (!g) throw new BadRequestException('Unknown pay group');
      const dup = await tx.payrollRun.findFirst({
        where: { payGroupId: g.id, periodStart },
      });
      if (dup)
        throw new ConflictException(
          'There is already a payroll run for this pay group and month',
        );
      const run = await tx.payrollRun.create({
        data: {
          tenantId: c.tenantId,
          payGroupId: g.id,
          periodStart,
          periodEnd,
        },
      });
      const people = await this.build(tx, c, run.id);
      await this.audit(tx, c, 'payroll.run.create', run.id);
      return { ...run, payslipCount: people };
    });
  }

  runs(c: Ctx) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const rows = await tx.payrollRun.findMany({
        orderBy: { periodStart: 'desc' },
        include: {
          payGroup: { select: { name: true, currency: true } },
          _count: { select: { payslips: true } },
        },
      });
      return rows;
    });
  }

  run(c: Ctx, id: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const r = await tx.payrollRun.findFirst({
        where: { id },
        include: {
          payGroup: true,
          payslips: {
            include: {
              member: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      });
      if (!r) throw new NotFoundException('Payroll run not found');
      const payslips = r.payslips.map((p) => ({
        id: p.id,
        member: p.member,
        unpaidDays: p.unpaidDays,
        gross: decryptJson<number>(c.tenantId, p.grossEnc),
        net: decryptJson<number>(c.tenantId, p.netEnc),
        ...decryptJson<Lines>(c.tenantId, p.linesEnc),
      }));
      const sum = (f: (p: (typeof payslips)[number]) => number) =>
        Math.round(payslips.reduce((a, p) => a + f(p), 0) * 100) / 100;
      const employer = (p: (typeof payslips)[number]) =>
        p.lines
          .filter((l) => l.kind === 'employer')
          .reduce((a, l) => a + l.amount, 0);
      const { payslips: _drop, ...head } = r;
      void _drop;
      return {
        ...head,
        payslips,
        totals: {
          gross: sum((p) => p.gross),
          net: sum((p) => p.net),
          employerCost: sum((p) => p.gross + employer(p)),
        },
      };
    });
  }

  recompute(c: Ctx, id: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const r = await this.editable(tx, id);
      const n = await this.build(tx, c, r.id);
      await this.audit(tx, c, 'payroll.run.recompute', id);
      return { payslipCount: n };
    });
  }

  private async editable(tx: Tx, id: string) {
    const r = await tx.payrollRun.findFirst({ where: { id } });
    if (!r) throw new NotFoundException('Payroll run not found');
    if (r.status === 'FINALIZED' || r.status === 'APPROVED')
      throw new ConflictException(
        'This run is locked. Reopen it to make changes.',
      );
    return r;
  }

  async move(
    c: Ctx,
    id: string,
    to: 'IN_REVIEW' | 'APPROVED' | 'FINALIZED' | 'DRAFT',
  ) {
    const from: Record<string, string[]> = {
      IN_REVIEW: ['DRAFT'],
      APPROVED: ['IN_REVIEW'],
      FINALIZED: ['APPROVED'],
      DRAFT: ['IN_REVIEW', 'APPROVED'], // sent back for changes
    };
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const r = await tx.payrollRun.findFirst({ where: { id } });
      if (!r) throw new NotFoundException('Payroll run not found');
      if (!from[to].includes(r.status))
        throw new ConflictException(
          `A ${r.status.toLowerCase().replace('_', ' ')} run cannot move to ${to.toLowerCase().replace('_', ' ')}`,
        );
      if (
        to === 'IN_REVIEW' &&
        !(await tx.payslip.count({ where: { runId: id } }))
      )
        throw new BadRequestException(
          'This run has no payslips. Set salaries for the pay group first.',
        );
      const updated = await tx.payrollRun.update({
        where: { id },
        data: {
          status: to,
          approvedById:
            to === 'APPROVED' ? c.memberId : to === 'DRAFT' ? null : undefined,
          finalizedAt: to === 'FINALIZED' ? new Date() : undefined,
        },
      });
      if (to === 'FINALIZED') {
        const slips = await tx.payslip.findMany({
          where: { runId: id },
          select: { memberId: true },
        });
        const label = `${MONTHS[r.periodStart.getUTCMonth()]} ${r.periodStart.getUTCFullYear()}`;
        await notify(
          tx,
          c.tenantId,
          slips.map((s) => s.memberId),
          {
            event: 'payslip.issued',
            title: `Your ${label} payslip is ready`,
            link: '/payslips',
          },
        );
      }
      await this.audit(tx, c, `payroll.run.${to.toLowerCase()}`, id);
      return updated;
    });
  }

  // ───────────── payslips (the employee's own view) ─────────────

  minePayslips(c: Ctx) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const rows = await tx.payslip.findMany({
        where: { memberId: c.memberId, run: { status: 'FINALIZED' } },
        orderBy: { run: { periodStart: 'desc' } },
        include: {
          run: { include: { payGroup: { select: { currency: true } } } },
        },
      });
      return rows.map((p) => ({
        id: p.id,
        periodStart: p.run.periodStart,
        periodEnd: p.run.periodEnd,
        currency: p.run.payGroup.currency,
        net: decryptJson<number>(c.tenantId, p.netEnc),
      }));
    });
  }

  payslip(c: Ctx, id: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const p = await tx.payslip.findFirst({
        where: { id },
        include: {
          run: { include: { payGroup: { select: { currency: true } } } },
          member: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      const own = p?.memberId === c.memberId && p.run.status === 'FINALIZED';
      if (!p || !(own || can(c.subject, 'payroll.view')))
        throw new NotFoundException('Payslip not found');
      await this.audit(tx, c, 'payroll.payslip.view', id);
      return {
        id: p.id,
        member: p.member,
        periodStart: p.run.periodStart,
        periodEnd: p.run.periodEnd,
        currency: p.run.payGroup.currency,
        status: p.run.status,
        unpaidDays: p.unpaidDays,
        gross: decryptJson<number>(c.tenantId, p.grossEnc),
        net: decryptJson<number>(c.tenantId, p.netEnc),
        ...decryptJson<Lines>(c.tenantId, p.linesEnc),
      };
    });
  }

  private audit(tx: Tx, c: Ctx, action: string, targetId: string) {
    return tx.auditLog.create({
      data: { tenantId: c.tenantId, actorId: c.memberId, action, targetId },
    });
  }
}
