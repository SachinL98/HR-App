import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { LeaveType } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import type { Ctx } from '../common/ctx';
import { can, PermissionAction } from '../org/permissions';
import { notify } from '../notifications/notify';
import { MailService, emailBody } from '../auth/mail.service';
import { carryExpiry, entitlement } from './entitlement';
import { planOf } from '../org/plan';

/** An email to send once the database transaction has committed (never inside it). */
interface Outgoing {
  to: string;
  subject: string;
  heading: string;
  lines: string[];
  link?: string;
}
import { CreateRequestDto, DecisionDto } from './dto';
import {
  DayWeight,
  iso,
  overlaps,
  parseDay,
  periodFor,
  requestDays,
  sum,
} from './dates';

type Step = {
  kind: 'manager' | 'dept_head' | 'member' | 'permission';
  memberId?: string;
  action?: string;
};
const DEFAULT_STEPS: Step[] = [{ kind: 'manager' }];
const APPROVE: Record<'LEAVE' | 'WFH', PermissionAction> = {
  LEAVE: 'leave.approve',
  WFH: 'wfh.approve',
};
const TIER_RANK = {
  FREE: 0,
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 4,
} as const;

/** Starter leave types and quotas every new company gets. Admins can change them. */
export async function seedLeaveDefaults(
  tx: Tx,
  tenantId: string,
  createdById: string,
) {
  const types = [
    { name: 'Annual leave', code: 'ANNUAL', amount: 14 },
    { name: 'Sick leave', code: 'SICK', amount: 7 },
    { name: 'Casual leave', code: 'CASUAL', amount: 7 },
    { name: 'Unpaid leave', code: 'UNPAID', amount: null, paid: false },
  ];
  for (const t of types) {
    const lt = await tx.leaveType.create({
      data: { tenantId, name: t.name, code: t.code, paid: t.paid ?? true },
    });
    if (t.amount !== null)
      await tx.quotaPolicy.create({
        data: {
          tenantId,
          subject: 'LEAVE',
          leaveTypeId: lt.id,
          period: 'YEAR',
          amountDays: t.amount,
          scopeType: 'COMPANY',
          createdById,
        },
      });
  }
  await tx.quotaPolicy.create({
    data: {
      tenantId,
      subject: 'WFH',
      period: 'MONTH',
      amountDays: 8,
      scopeType: 'COMPANY',
      createdById,
    },
  });
}

@Injectable()
export class LeaveService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  private async deliver(out: Outgoing[]) {
    const web = process.env.WEB_URL ?? 'http://localhost:3000';
    for (const o of out) {
      const m = emailBody({
        heading: o.heading,
        lines: o.lines,
        button: o.link ? { label: 'Open', url: `${web}${o.link}` } : undefined,
      });
      await this.mail.send(o.to, o.subject, m.text, m.html);
    }
  }

  /** People who would act on this request now: the step's person, plus anyone covering for them. */
  private async approversFor(
    tx: Tx,
    r: {
      requesterId: string;
      currentStep: number;
      workflowId: string | null;
      requester: { departmentId: string | null; managerId: string | null };
    },
  ) {
    const wf = r.workflowId
      ? await tx.approvalWorkflow.findUnique({ where: { id: r.workflowId } })
      : null;
    const steps = (wf?.steps as Step[] | undefined) ?? DEFAULT_STEPS;
    const step = steps[r.currentStep] ?? steps[steps.length - 1];
    let ids: (string | null | undefined)[] = [];
    if (step.kind === 'manager') ids = [r.requester.managerId];
    else if (step.kind === 'member') ids = [step.memberId];
    else if (step.kind === 'dept_head' && r.requester.departmentId)
      ids = [
        (
          await tx.department.findUnique({
            where: { id: r.requester.departmentId },
          })
        )?.headId,
      ];
    let people = ids.filter(Boolean) as string[];
    if (!people.length) {
      // Nobody is named for this step (for example, no manager): the owners decide.
      people = (
        await tx.member.findMany({
          where: { isOwner: true, status: 'ACTIVE' },
          select: { id: true },
        })
      ).map((m) => m.id);
    }
    const today = parseDay(iso(new Date()));
    const cover = await tx.delegation.findMany({
      where: {
        fromId: { in: people },
        revokedAt: null,
        startsOn: { lte: today },
        endsOn: { gte: today },
      },
    });
    return [...new Set([...people, ...cover.map((d) => d.toId)])].filter(
      (id) => id !== r.requesterId,
    );
  }

  /** Whose approvals this person is covering right now. */
  private async covering(tx: Tx, memberId: string) {
    const today = parseDay(iso(new Date()));
    const rows = await tx.delegation.findMany({
      where: {
        toId: memberId,
        revokedAt: null,
        startsOn: { lte: today },
        endsOn: { gte: today },
      },
    });
    return new Set(rows.map((d) => d.fromId));
  }

  /** Who in the requester's team is already off (or has asked to be) on those dates. */
  private async teamOff(
    tx: Tx,
    r: {
      requesterId: string;
      type: string;
      startDate: Date | null;
      endDate: Date | null;
      requester: { departmentId: string | null };
    },
  ) {
    if (
      !r.requester.departmentId ||
      !r.startDate ||
      !r.endDate ||
      r.type !== 'LEAVE'
    )
      return null;
    const team = await tx.member.findMany({
      where: {
        departmentId: r.requester.departmentId,
        status: 'ACTIVE',
        id: { not: r.requesterId },
      },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!team.length) return null;
    const ids = team.map((m) => m.id);
    const [approved, pending] = await Promise.all([
      tx.dayStatus.findMany({
        where: {
          memberId: { in: ids },
          type: 'LEAVE',
          date: { gte: r.startDate, lte: r.endDate },
        },
        select: { memberId: true },
      }),
      tx.request.findMany({
        where: {
          requesterId: { in: ids },
          type: 'LEAVE',
          status: 'PENDING',
          startDate: { lte: r.endDate },
          endDate: { gte: r.startDate },
        },
        select: { requesterId: true },
      }),
    ]);
    const off = new Set([
      ...approved.map((a) => a.memberId),
      ...pending.map((p) => p.requesterId),
    ]);
    return {
      total: team.length + 1,
      off: off.size,
      names: team
        .filter((m) => off.has(m.id))
        .slice(0, 5)
        .map((m) => `${m.firstName} ${m.lastName}`),
    };
  }

  // ───────── helpers ─────────

  private async rules(
    tx: Tx,
    tenantId: string,
    from: string,
    to: string,
    countWeekends = false,
    departmentId?: string | null,
  ) {
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });
    const hs = await tx.holiday.findMany({
      where: { date: { gte: parseDay(from), lte: parseDay(to) } },
    });
    const holidays = new Set(
      hs
        .filter(
          (h) =>
            h.departmentIds.length === 0 ||
            (departmentId && h.departmentIds.includes(departmentId)),
        )
        .map((h) => iso(h.date)),
    );
    return {
      tenant,
      rules: { workWeek: tenant.workWeek, holidays, countWeekends },
    };
  }

  /** Most specific quota wins: member, then department, then company. */
  /**
   * What a person can use in one period: the allowance (building up monthly if set that way) plus any
   * unused days carried from last period, which may expire. Only leave types with a yearly allowance carry over.
   */
  private async entitlementFor(
    tx: Tx,
    tenant: { id: string; fiscalYearStart: number },
    member: { id: string; departmentId: string | null; startDate: Date | null },
    lt: LeaveType | null,
    q: { period: string; amountDays: unknown },
    p: { start: string; end: string },
    accrualDate: string,
    useDate: string,
  ) {
    const amount = Number(q.amountDays);
    const period = q.period === 'MONTH' ? 'MONTH' : 'YEAR';
    const carryMax = lt ? Number(lt.carryOverMax) : 0;
    const accrual = lt?.accrual === 'monthly' ? 'monthly' : 'upfront';
    let prevUnused = 0;
    let usedUpToExpiry = 0;
    if (lt && period === 'YEAR' && carryMax > 0) {
      const before = iso(new Date(parseDay(p.start).getTime() - 86400_000));
      const prev = periodFor(before, 'YEAR', tenant.fiscalYearStart);
      // Someone who joined after last period ended had nothing to carry.
      if (!member.startDate || iso(member.startDate) <= prev.end) {
        const u = await this.usage(
          tx,
          tenant.id,
          member,
          'LEAVE',
          lt.id,
          prev.start,
          prev.end,
        );
        prevUnused = amount - u.used;
      }
      const exp = carryExpiry(p.start, lt.carryOverExpiryMonths);
      if (exp && useDate > exp)
        usedUpToExpiry = (
          await this.usage(tx, tenant.id, member, 'LEAVE', lt.id, p.start, exp)
        ).used;
    }
    return entitlement({
      amount,
      period,
      periodStart: p.start,
      accrualDate,
      useDate,
      carryMax,
      carryExpiryMonths: lt?.carryOverExpiryMonths ?? null,
      accrual,
      prevUnused,
      usedUpToExpiry,
    });
  }

  private async quotaFor(
    tx: Tx,
    subject: 'LEAVE' | 'WFH',
    leaveTypeId: string | null,
    member: { id: string; departmentId: string | null },
  ) {
    const all = await tx.quotaPolicy.findMany({
      where: { subject, leaveTypeId },
    });
    return (
      all.find((q) => q.scopeType === 'MEMBER' && q.scopeId === member.id) ??
      all.find(
        (q) =>
          q.scopeType === 'DEPARTMENT' && q.scopeId === member.departmentId,
      ) ??
      all.find((q) => q.scopeType === 'COMPANY') ??
      null
    );
  }

  /** Days the member has used (approved) and has waiting (pending) inside one period. */
  private async usage(
    tx: Tx,
    tenantId: string,
    member: { id: string; departmentId: string | null },
    subject: 'LEAVE' | 'WFH',
    leaveTypeId: string | null,
    start: string,
    end: string,
    skipRequestId?: string,
  ) {
    const reqs = await tx.request.findMany({
      where: {
        requesterId: member.id,
        type: subject,
        leaveTypeId,
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: parseDay(end) },
        endDate: { gte: parseDay(start) },
        ...(skipRequestId ? { id: { not: skipRequestId } } : {}),
      },
    });
    const lt = leaveTypeId
      ? await tx.leaveType.findUnique({ where: { id: leaveTypeId } })
      : null;
    let used = 0;
    let pending = 0;
    for (const r of reqs) {
      const s = iso(r.startDate!) < start ? start : iso(r.startDate!);
      const e = iso(r.endDate!) > end ? end : iso(r.endDate!);
      const { rules } = await this.rules(
        tx,
        tenantId,
        s,
        e,
        lt?.countWeekends,
        member.departmentId,
      );
      const days = sum(
        requestDays(
          s,
          e,
          iso(r.startDate!) < start ? 'FULL' : r.startPart,
          iso(r.endDate!) > end ? 'FULL' : r.endPart,
          rules,
        ),
      );
      if (r.status === 'APPROVED') used += days;
      else pending += days;
    }
    return { used, pending };
  }

  async balances(c: Ctx, onDate = iso(new Date())) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const me = await tx.member.findUniqueOrThrow({
        where: { id: c.memberId },
      });
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: c.tenantId },
      });
      const types = await tx.leaveType.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
      });
      const lines: {
        key: string;
        label: string;
        subject: string;
        leaveTypeId: string | null;
        period: string;
        periodStart: string;
        periodEnd: string;
        entitled: number | null;
        yearly: number | null;
        carriedOver: number;
        carriedLeft: number;
        carryExpires: string | null;
        accrual: string;
        used: number;
        pending: number;
        remaining: number | null;
      }[] = [];
      const targets: {
        subject: 'LEAVE' | 'WFH';
        lt: (typeof types)[number] | null;
      }[] = [
        ...types.map((lt) => ({ subject: 'LEAVE' as const, lt })),
        { subject: 'WFH' as const, lt: null },
      ];
      for (const t of targets) {
        const q = await this.quotaFor(tx, t.subject, t.lt?.id ?? null, me);
        const p = periodFor(
          onDate,
          q?.period ?? (t.subject === 'WFH' ? 'MONTH' : 'YEAR'),
          tenant.fiscalYearStart,
        );
        const u = await this.usage(
          tx,
          c.tenantId,
          me,
          t.subject,
          t.lt?.id ?? null,
          p.start,
          p.end,
        );
        const ent = q
          ? await this.entitlementFor(
              tx,
              tenant,
              me,
              t.lt,
              q,
              p,
              onDate,
              onDate,
            )
          : null;
        const entitled = ent ? ent.total : null;
        lines.push({
          yearly: q ? Number(q.amountDays) : null,
          carriedOver: ent?.carried ?? 0,
          carriedLeft: ent?.carriedLeft ?? 0,
          carryExpires: ent?.expires ?? null,
          accrual: t.lt?.accrual ?? 'upfront',
          key: t.lt?.code ?? 'WFH',
          label: t.lt?.name ?? 'Work from home',
          subject: t.subject,
          leaveTypeId: t.lt?.id ?? null,
          period: q?.period ?? 'YEAR',
          periodStart: p.start,
          periodEnd: p.end,
          entitled,
          used: u.used,
          pending: u.pending,
          remaining: entitled === null ? null : entitled - u.used - u.pending,
        });
      }
      return lines;
    });
  }

  // ───────── requests ─────────

  create(c: Ctx, dto: CreateRequestDto) {
    const outbox: Outgoing[] = [];
    return this.prisma
      .withTenant(c.tenantId, async (tx) => {
        if (dto.endDate < dto.startDate)
          throw new BadRequestException(
            'The end date is before the start date',
          );
        // A cap keeps one request from looping over millions of days.
        if (
          (parseDay(dto.endDate).getTime() -
            parseDay(dto.startDate).getTime()) /
            86400_000 >
          366
        )
          throw new BadRequestException('A request can cover at most one year');
        const startPart = dto.startPart ?? 'FULL';
        const endPart = dto.endPart ?? 'FULL';
        const me = await tx.member.findUniqueOrThrow({
          where: { id: c.memberId },
        });

        let lt: LeaveType | null = null;
        if (dto.type === 'LEAVE') {
          if (!dto.leaveTypeId)
            throw new BadRequestException('Choose a leave type');
          lt = await tx.leaveType.findFirst({
            where: { id: dto.leaveTypeId, active: true },
          });
          if (!lt) throw new NotFoundException('Leave type not found');
          if ((startPart !== 'FULL' || endPart !== 'FULL') && !lt.allowHalfDay)
            throw new BadRequestException(
              'This leave type does not allow half days',
            );
        } else if (dto.leaveTypeId) {
          throw new BadRequestException('Work from home has no leave type');
        }

        const { rules } = await this.rules(
          tx,
          c.tenantId,
          dto.startDate,
          dto.endDate,
          lt?.countWeekends,
          me.departmentId,
        );
        const days = requestDays(
          dto.startDate,
          dto.endDate,
          startPart,
          endPart,
          rules,
        );
        const total = sum(days);
        if (total === 0)
          throw new BadRequestException(
            'Those dates are all days off, so there is nothing to request',
          );

        // No double booking against your own pending or approved requests.
        const clash = await tx.request.findFirst({
          where: {
            requesterId: c.memberId,
            type: { in: ['LEAVE', 'WFH'] },
            status: { in: ['PENDING', 'APPROVED'] },
            startDate: { lte: parseDay(dto.endDate) },
            endDate: { gte: parseDay(dto.startDate) },
          },
        });
        if (
          clash &&
          overlaps(
            dto.startDate,
            dto.endDate,
            iso(clash.startDate!),
            iso(clash.endDate!),
          )
        )
          throw new ConflictException(
            'You already have a request that covers some of these dates',
          );

        // Quota, checked period by period (a request can span two months).
        const q = await this.quotaFor(tx, dto.type, lt?.id ?? null, me);
        let overQuota = false;
        if (q) {
          const tenant = await tx.tenant.findUniqueOrThrow({
            where: { id: c.tenantId },
          });
          const byPeriod = new Map<
            string,
            { start: string; end: string; days: number }
          >();
          for (const d of days) {
            const p = periodFor(d.date, q.period, tenant.fiscalYearStart);
            const cur = byPeriod.get(p.start) ?? { ...p, days: 0 };
            cur.days += d.weight;
            byPeriod.set(p.start, cur);
          }
          for (const p of byPeriod.values()) {
            const u = await this.usage(
              tx,
              c.tenantId,
              me,
              dto.type,
              lt?.id ?? null,
              p.start,
              p.end,
            );
            const ent = await this.entitlementFor(
              tx,
              tenant,
              me,
              lt,
              q,
              p,
              dto.endDate < p.end ? dto.endDate : p.end,
              dto.startDate > p.start ? dto.startDate : p.start,
            );
            if (u.used + u.pending + p.days > ent.total) {
              if (dto.type === 'WFH' || lt?.overQuota !== 'flag')
                throw new ConflictException(
                  `Not enough ${dto.type === 'WFH' ? 'work from home days' : (lt?.name ?? 'leave').toLowerCase()} available for ${p.start} to ${p.end} (${Math.max(0, ent.total - u.used - u.pending)} remaining${lt?.accrual === 'monthly' ? ', building up each month' : ''})`,
                );
              overQuota = true;
            }
          }
        }

        const wf = await tx.approvalWorkflow.findFirst({
          where: { requestType: dto.type, isDefault: true },
        });
        const r = await tx.request.create({
          data: {
            tenantId: c.tenantId,
            type: dto.type,
            status: 'PENDING',
            requesterId: c.memberId,
            workflowId: wf?.id,
            leaveTypeId: lt?.id,
            startDate: parseDay(dto.startDate),
            endDate: parseDay(dto.endDate),
            startPart,
            endPart,
            days: total,
            reason: dto.reason,
            details: overQuota ? { overQuota: true } : undefined,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: c.tenantId,
            actorId: c.memberId,
            action: 'request.create',
            targetId: r.id,
          },
        });
        // Tell whoever has to decide.
        const approvers = await this.approversFor(tx, {
          requesterId: c.memberId,
          currentStep: 0,
          workflowId: wf?.id ?? null,
          requester: { departmentId: me.departmentId, managerId: me.managerId },
        });
        const what = dto.type === 'WFH' ? 'work from home' : 'leave';
        const span = `${dto.startDate}${dto.endDate !== dto.startDate ? ` to ${dto.endDate}` : ''}`;
        await notify(tx, c.tenantId, approvers, {
          event: 'request.pending',
          title: `${me.firstName} ${me.lastName} asked for ${what}`,
          body: span,
          link: '/approvals',
        });
        const people = await tx.member.findMany({
          where: { id: { in: approvers } },
          select: { workEmail: true },
        });
        for (const p of people)
          outbox.push({
            to: p.workEmail,
            subject: `${me.firstName} ${me.lastName} asked for ${what}`,
            heading: `${me.firstName} ${me.lastName} asked for ${what}`,
            lines: [`Dates: ${span}.`, 'It is waiting for your decision.'],
            link: '/approvals',
          });
        return r;
      })
      .then(async (r) => {
        await this.deliver(outbox);
        return r;
      });
  }

  private view = {
    requester: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        departmentId: true,
        managerId: true,
        isOwner: true,
      },
    },
    actions: {
      orderBy: { createdAt: 'asc' as const },
      include: { actor: { select: { firstName: true, lastName: true } } },
    },
  };

  mine(c: Ctx) {
    return this.prisma.withTenant(c.tenantId, (tx) =>
      tx.request.findMany({
        where: { requesterId: c.memberId, type: { in: ['LEAVE', 'WFH'] } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { actions: true },
      }),
    );
  }

  async get(c: Ctx, id: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const r = await tx.request.findFirst({
        where: { id },
        include: this.view,
      });
      if (!r) throw new NotFoundException('Request not found');
      // Requests are private: the requester and people who can act on them.
      if (r.requesterId !== c.memberId && !(await this.canDecide(tx, c, r)))
        throw new NotFoundException('Request not found');
      return r;
    });
  }

  /** Pending requests this person can decide, never their own. */
  inbox(c: Ctx) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const pending = await tx.request.findMany({
        where: {
          status: 'PENDING',
          type: { in: ['LEAVE', 'WFH'] },
        },
        orderBy: { createdAt: 'asc' },
        include: this.view,
      });
      const out = [];
      for (const r of pending)
        if (await this.canDecide(tx, c, r))
          out.push({ ...r, teamOff: await this.teamOff(tx, r) });
      return out;
    });
  }

  /**
   * Nobody approves their own request, except a company owner with no manager and no other owner or cover:
   * nobody else exists to decide it, so it would wait forever. They decide it themselves, and the history shows who did.
   */
  private async mustSelfApprove(
    tx: Tx,
    r: {
      requesterId: string;
      currentStep: number;
      workflowId: string | null;
      requester: {
        departmentId: string | null;
        managerId: string | null;
        isOwner?: boolean;
      };
    },
  ) {
    if (!r.requester.isOwner) return false;
    return (await this.approversFor(tx, r)).length === 0;
  }

  private async canDecide(
    tx: Tx,
    c: Ctx,
    r: {
      type: string;
      requesterId: string;
      currentStep: number;
      workflowId: string | null;
      requester: {
        id: string;
        departmentId: string | null;
        managerId: string | null;
        isOwner?: boolean;
      };
    },
  ) {
    if (r.requesterId === c.memberId) return this.mustSelfApprove(tx, r);
    if (r.type !== 'LEAVE' && r.type !== 'WFH') return false;
    // Anyone holding the approve permission for this person's scope can always act.
    if (
      can(c.subject, APPROVE[r.type], {
        departmentId: r.requester.departmentId,
        memberId: r.requester.id,
      })
    )
      return true;
    const wf = r.workflowId
      ? await tx.approvalWorkflow.findUnique({ where: { id: r.workflowId } })
      : null;
    const steps = (wf?.steps as Step[] | undefined) ?? DEFAULT_STEPS;
    const step = steps[r.currentStep] ?? steps[steps.length - 1];
    // Someone covering for the person this step belongs to can act too.
    const cover = await this.covering(tx, c.memberId);
    const mine = (id: string | null | undefined) =>
      !!id && (id === c.memberId || cover.has(id));
    if (step.kind === 'manager') return mine(r.requester.managerId);
    if (step.kind === 'member') return mine(step.memberId);
    if (step.kind === 'dept_head') {
      const d = r.requester.departmentId
        ? await tx.department.findUnique({
            where: { id: r.requester.departmentId },
          })
        : null;
      return mine(d?.headId);
    }
    return false;
  }

  decide(c: Ctx, id: string, dto: DecisionDto) {
    const outbox: Outgoing[] = [];
    return this.prisma
      .withTenant(c.tenantId, async (tx) => {
        const r = await tx.request.findFirst({
          where: { id },
          include: {
            requester: {
              select: {
                id: true,
                departmentId: true,
                managerId: true,
                isOwner: true,
              },
            },
          },
        });
        if (!r || r.status !== 'PENDING')
          throw new NotFoundException(
            'There is no pending request with that id',
          );
        if (
          r.requesterId === c.memberId &&
          !(await this.mustSelfApprove(tx, r))
        )
          throw new ForbiddenException('You cannot decide your own request');
        if (!(await this.canDecide(tx, c, r)))
          throw new ForbiddenException('You cannot decide this request');
        if (dto.decision !== 'APPROVED' && !dto.comment?.trim())
          throw new BadRequestException(
            'Please add a comment so the requester knows why',
          );

        const wf = r.workflowId
          ? await tx.approvalWorkflow.findUnique({
              where: { id: r.workflowId },
            })
          : null;
        const steps = (wf?.steps as Step[] | undefined) ?? DEFAULT_STEPS;
        // With several steps, each one needs a different person: nobody approves their own chain twice.
        if (steps.length > 1 && dto.decision === 'APPROVED') {
          const before = await tx.approvalAction.findFirst({
            where: { requestId: id, actorId: c.memberId, decision: 'APPROVED' },
          });
          if (before)
            throw new ForbiddenException(
              'You already approved an earlier step. Someone else has to approve the next one.',
            );
        }
        await tx.approvalAction.create({
          data: {
            tenantId: c.tenantId,
            requestId: id,
            step: r.currentStep,
            actorId: c.memberId,
            decision: dto.decision,
            comment: dto.comment,
          },
        });

        let status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' =
          'PENDING';
        let currentStep = r.currentStep;
        if (dto.decision === 'REJECTED') status = 'REJECTED';
        else if (dto.decision === 'CHANGES_REQUESTED')
          status = 'CHANGES_REQUESTED';
        else if (r.currentStep + 1 < steps.length) currentStep += 1;
        else status = 'APPROVED';

        // Compare-and-swap, so two people deciding at the same moment cannot both count.
        const swapped = await tx.request.updateMany({
          where: { id, status: 'PENDING', currentStep: r.currentStep },
          data: {
            status,
            currentStep,
            decidedAt: status === 'PENDING' ? null : new Date(),
          },
        });
        if (!swapped.count)
          throw new ConflictException(
            'Someone else just decided this request. Reload to see the result.',
          );
        const updated = await tx.request.findUniqueOrThrow({ where: { id } });
        if (status === 'APPROVED')
          await this.materialize(tx, c.tenantId, updated.id);
        await tx.auditLog.create({
          data: {
            tenantId: c.tenantId,
            actorId: c.memberId,
            action: `request.${dto.decision.toLowerCase()}`,
            targetId: id,
          },
        });
        if (status !== 'PENDING') {
          const title = `Your ${r.type === 'WFH' ? 'work from home' : 'leave'} request was ${status.replace('_', ' ').toLowerCase()}`;
          await notify(tx, c.tenantId, [r.requesterId], {
            event: `request.${status.toLowerCase()}`,
            title,
            body: dto.comment,
            link: '/leave',
          });
          const who = await tx.member.findUnique({
            where: { id: r.requesterId },
            select: { workEmail: true },
          });
          if (who)
            outbox.push({
              to: who.workEmail,
              subject: title,
              heading: title,
              lines: dto.comment ? [`Comment: ${dto.comment}`] : [],
              link: '/leave',
            });
        } else {
          // On to the next step: tell that person.
          const next = await this.approversFor(tx, {
            requesterId: r.requesterId,
            currentStep,
            workflowId: r.workflowId,
            requester: r.requester,
          });
          await notify(tx, c.tenantId, next, {
            event: 'request.pending',
            title: 'A request is waiting for your approval',
            link: '/approvals',
          });
        }
        return updated;
      })
      .then(async (u) => {
        await this.deliver(outbox);
        return u;
      });
  }

  /**
   * Nudges approvers about requests that have waited more than a day, at most once a day per request.
   * Runs from a timer (see reminders.ts) and works across all companies.
   */
  async remindPending(now = new Date()) {
    const cutoff = new Date(now.getTime() - 24 * 3600_000);
    const stale = await this.prisma.system.request.findMany({
      where: {
        status: 'PENDING',
        type: { in: ['LEAVE', 'WFH'] },
        createdAt: { lt: cutoff },
      },
      select: { id: true, tenantId: true, details: true },
      take: 500,
    });
    const due = stale.filter((r) => {
      const at = (r.details as { remindedAt?: string } | null)?.remindedAt;
      return !at || new Date(at) < cutoff;
    });
    const byTenant = new Map<string, string[]>();
    for (const r of due)
      byTenant.set(r.tenantId, [...(byTenant.get(r.tenantId) ?? []), r.id]);
    let sent = 0;
    for (const [tenantId, ids] of byTenant) {
      const outbox: Outgoing[] = [];
      await this.prisma.withTenant(tenantId, async (tx) => {
        const rows = await tx.request.findMany({
          where: { id: { in: ids }, status: 'PENDING' },
          include: this.view,
        });
        for (const r of rows) {
          const approvers = await this.approversFor(tx, r);
          await notify(tx, tenantId, approvers, {
            event: 'request.reminder',
            title: `Still waiting: ${r.requester.firstName} ${r.requester.lastName}'s request`,
            link: '/approvals',
          });
          const people = await tx.member.findMany({
            where: { id: { in: approvers } },
            select: { workEmail: true },
          });
          for (const p of people)
            outbox.push({
              to: p.workEmail,
              subject: `Reminder: a request is waiting for you`,
              heading: `${r.requester.firstName} ${r.requester.lastName} is waiting for an answer`,
              lines: ['This request has been waiting for more than a day.'],
              link: '/approvals',
            });
          await tx.request.update({
            where: { id: r.id },
            data: {
              details: {
                ...((r.details as object | null) ?? {}),
                remindedAt: now.toISOString(),
              },
            },
          });
          sent += 1;
        }
      });
      await this.deliver(outbox);
    }
    return { reminded: sent };
  }

  /** Writes the approved days onto the availability calendar. */
  private async materialize(tx: Tx, tenantId: string, requestId: string) {
    const r = await tx.request.findUniqueOrThrow({
      where: { id: requestId },
      include: { requester: true },
    });
    const lt = r.leaveTypeId
      ? await tx.leaveType.findUnique({ where: { id: r.leaveTypeId } })
      : null;
    const s = iso(r.startDate!);
    const e = iso(r.endDate!);
    const { rules } = await this.rules(
      tx,
      tenantId,
      s,
      e,
      lt?.countWeekends,
      r.requester.departmentId,
    );
    const days: DayWeight[] = requestDays(s, e, r.startPart, r.endPart, rules);
    await tx.dayStatus.createMany({
      data: days.map((d) => ({
        tenantId,
        memberId: r.requesterId,
        date: parseDay(d.date),
        part: d.part,
        type: r.type === 'LEAVE' ? ('LEAVE' as const) : ('WFH' as const),
        requestId: r.id,
      })),
    });
  }

  /** Requester withdraws a request. Approved ones can be withdrawn only before they start. */
  cancel(c: Ctx, id: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const r = await tx.request.findFirst({
        where: { id, requesterId: c.memberId },
      });
      if (!r) throw new NotFoundException('Request not found');
      if (!['PENDING', 'APPROVED', 'CHANGES_REQUESTED'].includes(r.status))
        throw new ConflictException('This request is already closed');
      if (r.status === 'APPROVED') {
        if (iso(r.startDate!) <= iso(new Date()))
          throw new ConflictException(
            'This has already started. Ask your manager to change it.',
          );
        await tx.dayStatus.deleteMany({ where: { requestId: id } });
      }
      const u = await tx.request.update({
        where: { id },
        data: { status: 'CANCELED', decidedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          tenantId: c.tenantId,
          actorId: c.memberId,
          action: 'request.cancel',
          targetId: id,
        },
      });
      return u;
    });
  }

  // ───────── approval workflow (multi-step is a Silver+ feature) ─────────

  setWorkflow(c: Ctx, type: 'LEAVE' | 'WFH', steps: Step[]) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const sub = await tx.subscription.findUniqueOrThrow({
        where: { tenantId: c.tenantId },
      });
      if (steps.length > 1 && TIER_RANK[planOf(sub).tier] < TIER_RANK.SILVER)
        throw new ForbiddenException(
          'Multi-step approvals are on the Silver plan and above',
        );
      if (steps.length < 1 || steps.length > 5)
        throw new BadRequestException('Use between 1 and 5 steps');
      for (const s of steps) {
        if (!['manager', 'dept_head', 'member', 'permission'].includes(s.kind))
          throw new BadRequestException('Unknown step type');
        if (
          s.kind === 'member' &&
          !(
            s.memberId &&
            (await tx.member.findFirst({ where: { id: s.memberId } }))
          )
        )
          throw new BadRequestException('Pick a member for that step');
      }
      await tx.approvalWorkflow.deleteMany({
        where: { requestType: type, isDefault: true },
      });
      const wf = await tx.approvalWorkflow.create({
        data: {
          tenantId: c.tenantId,
          requestType: type,
          name: `${type} approval`,
          steps: steps as never,
          isDefault: true,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: c.tenantId,
          actorId: c.memberId,
          action: 'workflow.set',
          targetId: wf.id,
        },
      });
      return wf;
    });
  }

  getWorkflow(c: Ctx, type: 'LEAVE' | 'WFH') {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const wf = await tx.approvalWorkflow.findFirst({
        where: { requestType: type, isDefault: true },
      });
      return {
        type,
        steps: (wf?.steps as Step[] | undefined) ?? DEFAULT_STEPS,
        custom: !!wf,
      };
    });
  }
}
