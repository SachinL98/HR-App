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
import { CreateRunDto, PayGroupDto, SalaryDto, BankDto } from './dto';
import { MailService, emailBody } from '../auth/mail.service';
import { planOf } from '../org/plan';
import { FileStore } from '../documents/file-store';
import { renderPayslipPdf } from './payslip-pdf';
import { amount, toCsv } from './csv';

interface BankDetails {
  holder: string;
  bank: string;
  branch?: string;
  account: string;
}

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
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private files: FileStore,
  ) {}

  private periodLabel(d: Date) {
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }

  // ───────────── bank details (for the bank transfer file) ─────────────

  /** Who has bank details on file, without showing the numbers. */
  async bankStatus(
    c: Ctx,
  ): Promise<Record<string, { set: boolean; last4: string | null }>> {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const rows = await tx.member.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, bankDetailsEnc: true },
      });
      return Object.fromEntries(
        rows.map((m): [string, { set: boolean; last4: string | null }] => {
          if (!m.bankDetailsEnc) return [m.id, { set: false, last4: null }];
          const b = decryptJson<BankDetails>(c.tenantId, m.bankDetailsEnc);
          return [m.id, { set: true, last4: b.account.slice(-4) }];
        }),
      );
    });
  }

  setBank(c: Ctx, memberId: string, dto: BankDto) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const m = await tx.member.findFirst({
        where: { id: memberId, status: 'ACTIVE' },
      });
      if (!m) throw new NotFoundException('Member not found');
      const control = await this.dualControl(tx);
      if (control.on && memberId === c.memberId)
        throw new ForbiddenException(
          'You cannot change your own bank details here. Ask another payroll manager.',
        );
      await tx.member.update({
        where: { id: memberId },
        data: {
          bankDetailsEnc: encryptJson(c.tenantId, {
            holder: dto.holder.trim(),
            bank: dto.bank.trim(),
            branch: dto.branch?.trim() || undefined,
            account: dto.account.replace(/\s/g, ''),
          } satisfies BankDetails),
        },
      });
      await this.audit(tx, c, 'payroll.bank.set', memberId);
      return { ok: true };
    });
  }

  // ───────────── exports ─────────────

  /** A run as a spreadsheet: totals per person, every pay line, or the bank transfer list. */
  async exportRun(c: Ctx, id: string, kind: 'summary' | 'lines' | 'bank') {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({
        where: { id },
        include: {
          payGroup: true,
          payslips: {
            include: {
              member: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  workEmail: true,
                  employeeNo: true,
                  bankDetailsEnc: true,
                },
              },
            },
          },
        },
      });
      if (!run) throw new NotFoundException('Payroll run not found');
      const period = this.periodLabel(run.periodStart);
      const cur = run.payGroup.currency;
      const slips = run.payslips
        .map((p) => ({
          p,
          name: `${p.member.firstName} ${p.member.lastName}`,
          gross: decryptJson<number>(c.tenantId, p.grossEnc),
          net: decryptJson<number>(c.tenantId, p.netEnc),
          ...decryptJson<Lines>(c.tenantId, p.linesEnc),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const slug =
        `${run.payGroup.name}-${run.periodStart.toISOString().slice(0, 7)}`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-');
      let rows: (string | number | null)[][];
      if (kind === 'summary') {
        rows = [
          [
            'Employee number',
            'Name',
            'Email',
            'Gross',
            'Deductions',
            'Net',
            'Employer contributions',
            'Unpaid days',
            'Currency',
          ],
          ...slips.map((s) => [
            s.p.member.employeeNo ?? '',
            s.name,
            s.p.member.workEmail,
            amount(s.gross),
            amount(s.gross - s.net),
            amount(s.net),
            amount(
              s.lines
                .filter((l) => l.kind === 'employer')
                .reduce((a, l) => a + l.amount, 0),
            ),
            Number(s.p.unpaidDays),
            cur,
          ]),
        ];
      } else if (kind === 'lines') {
        rows = [
          [
            'Employee number',
            'Name',
            'Code',
            'Description',
            'Type',
            'Amount',
            'Currency',
          ],
          ...slips.flatMap((s) =>
            s.lines.map((l) => [
              s.p.member.employeeNo ?? '',
              s.name,
              l.code,
              l.label,
              l.kind,
              amount(l.amount),
              cur,
            ]),
          ),
        ];
      } else {
        if (run.status !== 'APPROVED' && run.status !== 'FINALIZED')
          throw new ConflictException(
            'The bank file is available once the run is approved',
          );
        const missing = slips
          .filter((s) => !s.p.member.bankDetailsEnc)
          .map((s) => s.name);
        if (missing.length)
          throw new BadRequestException(
            `No bank details on file for: ${missing.join(', ')}. Add them on the Salaries page.`,
          );
        rows = [
          [
            'Account holder',
            'Bank',
            'Branch',
            'Account number',
            'Amount',
            'Currency',
            'Reference',
          ],
          ...slips
            .filter((s) => s.net > 0)
            .map((s) => {
              const b = decryptJson<BankDetails>(
                c.tenantId,
                s.p.member.bankDetailsEnc!,
              );
              return [
                b.holder,
                b.bank,
                b.branch ?? '',
                b.account,
                amount(s.net),
                cur,
                `Salary ${period}`,
              ];
            }),
        ];
      }
      await this.audit(tx, c, `payroll.export.${kind}`, id);
      return { csv: toCsv(rows), fileName: `payroll-${kind}-${slug}.csv` };
    });
  }

  // ───────────── payslip as a PDF ─────────────

  payslipPdf(c: Ctx, id: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const p = await tx.payslip.findFirst({
        where: { id },
        include: {
          run: { include: { payGroup: { select: { currency: true } } } },
          member: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeNo: true,
            },
          },
        },
      });
      const own = p?.memberId === c.memberId && p.run.status === 'FINALIZED';
      if (!p || !(own || can(c.subject, 'payroll.view')))
        throw new NotFoundException('Payslip not found');
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: c.tenantId },
      });
      // The company's payslip letterhead: the newest "payslip" template that has one.
      const tpl = await tx.documentTemplate.findFirst({
        where: { kind: 'payslip', archived: false, fileId: { not: null } },
        orderBy: { updatedAt: 'desc' },
      });
      const letterhead = tpl?.fileId
        ? (await this.files.get(tx, c.tenantId, tpl.fileId)).bytes
        : undefined;
      const detail = decryptJson<Lines>(c.tenantId, p.linesEnc);
      const period = this.periodLabel(p.run.periodStart);
      const bytes = await renderPayslipPdf({
        company: tenant.legalName,
        employee: `${p.member.firstName} ${p.member.lastName}`,
        employeeNo: p.member.employeeNo,
        period,
        currency: p.run.payGroup.currency,
        gross: decryptJson<number>(c.tenantId, p.grossEnc),
        net: decryptJson<number>(c.tenantId, p.netEnc),
        unpaidDays: Number(p.unpaidDays),
        lines: detail.lines,
        ruleVersion: detail.ruleVersion,
        letterhead,
        layout: (tpl?.layout ?? undefined) as never,
      });
      await this.audit(tx, c, 'payroll.payslip.pdf', id);
      return {
        bytes,
        fileName: `payslip-${period.toLowerCase().replace(/\s+/g, '-')}-${p.member.lastName.toLowerCase().replace(/[^a-z0-9]+/g, '')}.pdf`,
      };
    });
  }

  /** Payroll needs Silver or above; the statutory UK/Sri Lanka rules need Gold. */
  private async requireTier(tx: Tx, tenantId: string, regime?: Regime) {
    const sub = await tx.subscription.findUniqueOrThrow({
      where: { tenantId },
    });
    const plan = planOf(sub);
    const need = regime ? RANK.GOLD : RANK.SILVER;
    if (RANK[plan.tier] < need)
      throw new ForbiddenException(
        plan.state === 'trial_ended' || plan.state === 'canceled'
          ? 'Your plan has ended. Payroll is read-only until you choose a plan that includes it.'
          : regime
            ? 'Statutory tax rules need the Gold plan or above'
            : 'Payroll needs the Silver plan or above',
      );
  }

  /**
   * Two-person control. When a company has two or more people who can run payroll, nobody may approve or release
   * a run they prepared, or change their own pay. A company with a single payroll person is exempt (there is
   * nobody else), and the action is still written to the activity log.
   */
  private async dualControl(tx: Tx) {
    const members = await tx.member.findMany({
      where: { status: 'ACTIVE' },
      include: { jobRole: true, grants: true },
    });
    const n = members.filter((m) =>
      can(
        {
          isOwner: m.isOwner,
          departmentId: m.departmentId,
          roleDefaults: m.jobRole?.defaultPermissions ?? [],
          grants: m.grants.map((g) => ({
            action: g.action,
            scopeType: g.scopeType,
            scopeIds: g.scopeIds,
          })),
        },
        'payroll.manage',
      ),
    );
    return { on: n.length >= 2, managerIds: n.map((m) => m.id) };
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
      const control = await this.dualControl(tx);
      if (control.on && memberId === c.memberId)
        throw new ForbiddenException(
          'You cannot change your own pay. Ask another payroll manager to do it.',
        );
      const existing = await tx.salaryStructure.findUnique({
        where: { memberId },
      });
      if (existing && !dto.reason?.trim())
        throw new BadRequestException(
          'Say why the salary is changing, so there is a record.',
        );
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
      await tx.salaryChange.create({
        data: {
          tenantId: c.tenantId,
          memberId,
          changedById: c.memberId,
          payGroupId: g.id,
          basicEnc: data.basicEnc,
          componentsEnc: data.componentsEnc,
          taxProfile: data.taxProfile,
          effectiveFrom: data.effectiveFrom,
          reason: dto.reason?.trim() || (existing ? undefined : 'First salary'),
        },
      });
      await this.audit(
        tx,
        c,
        !control.on && memberId === c.memberId
          ? 'payroll.salary.set.self.solo'
          : 'payroll.salary.set',
        memberId,
      );
      return { ok: true };
    });
  }

  /** Every change to one person's pay, newest first, with who made it and why. */
  salaryHistory(c: Ctx, memberId: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const m = await tx.member.findFirst({
        where: { id: memberId },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!m) throw new NotFoundException('Member not found');
      const rows = await tx.salaryChange.findMany({
        where: { memberId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      const people = await tx.member.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.changedById))] } },
        select: { id: true, firstName: true, lastName: true },
      });
      const name = new Map(
        people.map((p) => [p.id, `${p.firstName} ${p.lastName}`]),
      );
      const groups = await tx.payGroup.findMany({
        select: { id: true, name: true, currency: true },
      });
      const group = new Map(groups.map((g) => [g.id, g]));
      await this.audit(tx, c, 'payroll.salary.history.view', memberId);
      return {
        member: m,
        changes: rows.map((r) => ({
          id: r.id,
          at: r.createdAt,
          by: name.get(r.changedById) ?? 'Former member',
          reason: r.reason,
          effectiveFrom: r.effectiveFrom,
          payGroup: group.get(r.payGroupId) ?? null,
          basic: decryptJson<number>(c.tenantId, r.basicEnc),
          components: decryptJson<Component[]>(c.tenantId, r.componentsEnc),
        })),
      };
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
          createdById: c.memberId,
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
      const control = await this.dualControl(tx);
      const ids = [
        r.createdById,
        r.submittedById,
        r.approvedById,
        r.finalizedById,
      ].filter(Boolean) as string[];
      const who = await tx.member.findMany({
        where: { id: { in: [...new Set(ids)] } },
        select: { id: true, firstName: true, lastName: true },
      });
      const nm = (id: string | null) => {
        const p = who.find((w) => w.id === id);
        return p ? `${p.firstName} ${p.lastName}` : null;
      };
      return {
        ...head,
        people: {
          preparedBy: nm(r.createdById),
          submittedBy: nm(r.submittedById),
          approvedBy: nm(r.approvedById),
          finalizedBy: nm(r.finalizedById),
        },
        // Two-person control is on, and you sent this run in: someone else has to approve it.
        dualControl: control.on,
        youMustWait:
          control.on &&
          r.submittedById === c.memberId &&
          (r.status === 'IN_REVIEW' || r.status === 'APPROVED'),
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
    // Once a run is sent for approval the figures are frozen: what was reviewed is what gets approved.
    if (r.status !== 'DRAFT')
      throw new ConflictException(
        'This run is locked. Send it back to draft to make changes.',
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
    const emails: { to: string; label: string }[] = [];
    return this.prisma
      .withTenant(c.tenantId, async (tx) => {
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
        const control = await this.dualControl(tx);
        // Four eyes: the person who sent a run for approval cannot approve or release it.
        if (
          control.on &&
          (to === 'APPROVED' || to === 'FINALIZED') &&
          r.submittedById === c.memberId
        )
          throw new ForbiddenException(
            'Another payroll manager must approve and release this run, because you sent it for approval.',
          );
        const now = new Date();
        // Compare-and-swap on the status, so two people clicking at once cannot both move the same run.
        const swapped = await tx.payrollRun.updateMany({
          where: { id, status: r.status },
          data: {
            status: to,
            ...(to === 'IN_REVIEW'
              ? { submittedById: c.memberId, submittedAt: now }
              : {}),
            ...(to === 'APPROVED'
              ? { approvedById: c.memberId, approvedAt: now }
              : {}),
            ...(to === 'FINALIZED'
              ? { finalizedById: c.memberId, finalizedAt: now }
              : {}),
            ...(to === 'DRAFT'
              ? {
                  approvedById: null,
                  approvedAt: null,
                  submittedById: null,
                  submittedAt: null,
                }
              : {}),
          },
        });
        if (!swapped.count)
          throw new ConflictException(
            'Someone else just changed this run. Reload and check its status.',
          );
        const updated = await tx.payrollRun.findUniqueOrThrow({
          where: { id },
        });
        if (to === 'IN_REVIEW')
          await notify(
            tx,
            c.tenantId,
            control.managerIds.filter((m) => m !== c.memberId),
            {
              event: 'payroll.run.review',
              title: 'A pay run is waiting for your approval',
              link: `/payroll/runs/${id}`,
            },
          );
        if (to === 'FINALIZED') {
          const slips = await tx.payslip.findMany({
            where: { runId: id },
            select: { memberId: true, member: { select: { workEmail: true } } },
          });
          const period = this.periodLabel(r.periodStart);
          for (const s of slips)
            emails.push({ to: s.member.workEmail, label: period });
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
        await this.audit(
          tx,
          c,
          !control.on &&
            (to === 'APPROVED' || to === 'FINALIZED') &&
            r.submittedById === c.memberId
            ? `payroll.run.${to.toLowerCase()}.solo`
            : `payroll.run.${to.toLowerCase()}`,
          id,
        );
        return updated;
      })
      .then(async (updated) => {
        // Staff are told by email once the run has been saved. The email holds a link, never the figures.
        const web = process.env.WEB_URL ?? 'http://localhost:3000';
        for (const e of emails) {
          const m = emailBody({
            heading: `Your ${e.label} payslip is ready`,
            lines: ['Sign in to view it or download it as a PDF.'],
            button: { label: 'Open my payslips', url: `${web}/payslips` },
          });
          await this.mail.send(
            e.to,
            `Your ${e.label} payslip is ready`,
            m.text,
            m.html,
          );
        }
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
