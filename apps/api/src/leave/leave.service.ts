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
  constructor(private prisma: PrismaService) {}

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
        const entitled = q ? Number(q.amountDays) : null;
        lines.push({
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
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      if (dto.endDate < dto.startDate)
        throw new BadRequestException('The end date is before the start date');
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
          if (u.used + u.pending + p.days > Number(q.amountDays)) {
            if (dto.type === 'WFH' || lt?.overQuota !== 'flag')
              throw new ConflictException(
                `Not enough ${dto.type === 'WFH' ? 'work from home days' : (lt?.name ?? 'leave').toLowerCase()} left for ${p.start} to ${p.end} (${Number(q.amountDays) - u.used - u.pending} remaining)`,
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
          requesterId: { not: c.memberId },
        },
        orderBy: { createdAt: 'asc' },
        include: this.view,
      });
      const out = [];
      for (const r of pending) if (await this.canDecide(tx, c, r)) out.push(r);
      return out;
    });
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
      };
    },
  ) {
    if (r.requesterId === c.memberId) return false;
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
    if (step.kind === 'manager') return r.requester.managerId === c.memberId;
    if (step.kind === 'member') return step.memberId === c.memberId;
    if (step.kind === 'dept_head') {
      const d = r.requester.departmentId
        ? await tx.department.findUnique({
            where: { id: r.requester.departmentId },
          })
        : null;
      return d?.headId === c.memberId;
    }
    return false;
  }

  decide(c: Ctx, id: string, dto: DecisionDto) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const r = await tx.request.findFirst({
        where: { id },
        include: {
          requester: {
            select: { id: true, departmentId: true, managerId: true },
          },
        },
      });
      if (!r || r.status !== 'PENDING')
        throw new NotFoundException('There is no pending request with that id');
      if (r.requesterId === c.memberId)
        throw new ForbiddenException('You cannot decide your own request');
      if (!(await this.canDecide(tx, c, r)))
        throw new ForbiddenException('You cannot decide this request');
      if (dto.decision !== 'APPROVED' && !dto.comment?.trim())
        throw new BadRequestException(
          'Please add a comment so the requester knows why',
        );

      const wf = r.workflowId
        ? await tx.approvalWorkflow.findUnique({ where: { id: r.workflowId } })
        : null;
      const steps = (wf?.steps as Step[] | undefined) ?? DEFAULT_STEPS;
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

      const updated = await tx.request.update({
        where: { id },
        data: {
          status,
          currentStep,
          decidedAt: status === 'PENDING' ? null : new Date(),
        },
      });
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
      if (status !== 'PENDING')
        await notify(tx, c.tenantId, [r.requesterId], {
          event: `request.${status.toLowerCase()}`,
          title: `Your ${r.type === 'WFH' ? 'work from home' : 'leave'} request was ${status.replace('_', ' ').toLowerCase()}`,
          body: dto.comment,
          link: '/leave',
        });
      return updated;
    });
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
      if (steps.length > 1 && TIER_RANK[sub.tier] < TIER_RANK.SILVER)
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
