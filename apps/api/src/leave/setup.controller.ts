import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentCtx, RequirePermission } from '../common/ctx';
import type { Ctx } from '../common/ctx';
import { can } from '../org/permissions';
import {
  HolidaysDto,
  LeaveTypeDto,
  OutOfOfficeDto,
  QuotaDto,
  RangeQuery,
} from './dto';
import { iso, parseDay } from './dates';

@Controller()
export class SetupController {
  constructor(private prisma: PrismaService) {}

  // ───────── leave types ─────────

  @Get('leave-types')
  leaveTypes(@CurrentCtx() c: Ctx) {
    return this.prisma.withTenant(c.tenantId, (tx) =>
      tx.leaveType.findMany({ orderBy: { name: 'asc' } }),
    );
  }

  @Post('leave-types')
  @RequirePermission('quota.manage')
  createLeaveType(@CurrentCtx() c: Ctx, @Body() dto: LeaveTypeDto) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      if (await tx.leaveType.findFirst({ where: { code: dto.code } }))
        throw new ConflictException('That code is taken');
      const lt = await tx.leaveType.create({
        data: { tenantId: c.tenantId, ...dto },
      });
      await tx.auditLog.create({
        data: {
          tenantId: c.tenantId,
          actorId: c.memberId,
          action: 'leavetype.create',
          targetId: lt.id,
        },
      });
      return lt;
    });
  }

  // ───────── quotas ─────────

  @Get('quotas')
  quotas(@CurrentCtx() c: Ctx) {
    return this.prisma.withTenant(c.tenantId, (tx) =>
      tx.quotaPolicy.findMany({ orderBy: { subject: 'asc' } }),
    );
  }

  /** Sets (or replaces) one quota. Most specific scope wins when a member's allowance is worked out. */
  @Put('quotas')
  setQuota(@CurrentCtx() c: Ctx, @Body() dto: QuotaDto) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const target =
        dto.scopeType === 'DEPARTMENT'
          ? { departmentId: dto.scopeId }
          : dto.scopeType === 'MEMBER'
            ? { memberId: dto.scopeId }
            : undefined;
      if (!can(c.subject, 'quota.manage', target))
        throw new ForbiddenException('You cannot set quotas for that scope');
      if (dto.scopeType !== 'COMPANY') {
        if (!dto.scopeId)
          throw new BadRequestException('Pick a department or member');
        const ok =
          dto.scopeType === 'DEPARTMENT'
            ? await tx.department.findFirst({ where: { id: dto.scopeId } })
            : await tx.member.findFirst({ where: { id: dto.scopeId } });
        if (!ok) throw new NotFoundException('Scope not found');
      } else if (dto.scopeId)
        throw new BadRequestException('Company scope takes no id');
      if (dto.subject === 'LEAVE' ? !dto.leaveTypeId : !!dto.leaveTypeId)
        throw new BadRequestException(
          dto.subject === 'LEAVE'
            ? 'Choose a leave type'
            : 'Work from home has no leave type',
        );
      if (
        dto.leaveTypeId &&
        !(await tx.leaveType.findFirst({ where: { id: dto.leaveTypeId } }))
      )
        throw new NotFoundException('Leave type not found');

      await tx.quotaPolicy.deleteMany({
        where: {
          subject: dto.subject,
          leaveTypeId: dto.leaveTypeId ?? null,
          scopeType: dto.scopeType,
          scopeId: dto.scopeId ?? null,
        },
      });
      const q = await tx.quotaPolicy.create({
        data: {
          tenantId: c.tenantId,
          subject: dto.subject,
          leaveTypeId: dto.leaveTypeId,
          period: dto.period,
          amountDays: dto.amountDays,
          scopeType: dto.scopeType,
          scopeId: dto.scopeId,
          createdById: c.memberId,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: c.tenantId,
          actorId: c.memberId,
          action: 'quota.set',
          targetId: q.id,
          meta: dto as never,
        },
      });
      return q;
    });
  }

  @Delete('quotas/:id')
  deleteQuota(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const q = await tx.quotaPolicy.findFirst({ where: { id } });
      if (!q) throw new NotFoundException('Quota not found');
      const target =
        q.scopeType === 'DEPARTMENT'
          ? { departmentId: q.scopeId }
          : q.scopeType === 'MEMBER'
            ? { memberId: q.scopeId ?? undefined }
            : undefined;
      if (!can(c.subject, 'quota.manage', target))
        throw new ForbiddenException('You cannot change quotas for that scope');
      await tx.quotaPolicy.delete({ where: { id } });
      return { ok: true };
    });
  }

  // ───────── company holidays ─────────

  @Get('holidays')
  holidays(@CurrentCtx() c: Ctx, @Query('year') year?: string) {
    const y = Number(year) || new Date().getUTCFullYear();
    return this.prisma.withTenant(c.tenantId, (tx) =>
      tx.holiday.findMany({
        where: {
          date: { gte: parseDay(`${y}-01-01`), lte: parseDay(`${y}-12-31`) },
        },
        orderBy: { date: 'asc' },
      }),
    );
  }

  @Post('holidays')
  @RequirePermission('holiday.manage')
  addHolidays(@CurrentCtx() c: Ctx, @Body() dto: HolidaysDto) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      if (!dto.holidays.length || dto.holidays.length > 100)
        throw new BadRequestException('Send between 1 and 100 holidays');
      const deptIds = [
        ...new Set(dto.holidays.flatMap((h) => h.departmentIds ?? [])),
      ];
      if (
        deptIds.length &&
        (await tx.department.count({ where: { id: { in: deptIds } } })) !==
          deptIds.length
      )
        throw new NotFoundException('Unknown department');
      const res = await tx.holiday.createMany({
        data: dto.holidays.map((h) => ({
          tenantId: c.tenantId,
          name: h.name,
          date: parseDay(h.date),
          departmentIds: h.departmentIds ?? [],
        })),
        skipDuplicates: true,
      });
      await tx.auditLog.create({
        data: {
          tenantId: c.tenantId,
          actorId: c.memberId,
          action: 'holiday.add',
          meta: { count: res.count },
        },
      });
      return { added: res.count };
    });
  }

  @Delete('holidays/:id')
  @RequirePermission('holiday.manage')
  deleteHoliday(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      if (!(await tx.holiday.findFirst({ where: { id } })))
        throw new NotFoundException('Holiday not found');
      await tx.holiday.delete({ where: { id } });
      return { ok: true };
    });
  }

  // ───────── availability calendar ─────────

  /** Everyone in the company can see who is in, working from home, on leave or out. Reasons are never included. */
  @Get('calendar')
  calendar(@CurrentCtx() c: Ctx, @Query() q: RangeQuery) {
    const from = q.from.slice(0, 10);
    const to = q.to.slice(0, 10);
    if (to < from) throw new BadRequestException('The end is before the start');
    if ((parseDay(to).getTime() - parseDay(from).getTime()) / 86400_000 > 366)
      throw new BadRequestException('Ask for at most a year at a time');
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: c.tenantId },
      });
      const members = await tx.member.findMany({
        where: {
          status: 'ACTIVE',
          ...(q.departmentId ? { departmentId: q.departmentId } : {}),
          ...(q.memberId ? { id: q.memberId } : {}),
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          departmentId: true,
        },
        orderBy: { firstName: 'asc' },
      });
      const days = await tx.dayStatus.findMany({
        where: {
          memberId: { in: members.map((m) => m.id) },
          date: { gte: parseDay(from), lte: parseDay(to) },
        },
        select: {
          memberId: true,
          date: true,
          part: true,
          type: true,
          startTime: true,
          endTime: true,
        },
        orderBy: { date: 'asc' },
      });
      const holidays = await tx.holiday.findMany({
        where: { date: { gte: parseDay(from), lte: parseDay(to) } },
        select: { id: true, name: true, date: true, departmentIds: true },
        orderBy: { date: 'asc' },
      });
      return {
        workWeek: tenant.workWeek,
        timeZone: tenant.timeZone,
        members,
        days: days.map((d) => ({
          ...d,
          date: iso(d.date),
          startTime: d.startTime?.toISOString().slice(11, 16) ?? null,
          endTime: d.endTime?.toISOString().slice(11, 16) ?? null,
        })),
        holidays: holidays.map((h) => ({ ...h, date: iso(h.date) })),
      };
    });
  }

  // ───────── out of office (no approval) ─────────

  @Post('out-of-office')
  async outOfOffice(@CurrentCtx() c: Ctx, @Body() dto: OutOfOfficeDto) {
    if (dto.to <= dto.from)
      throw new BadRequestException(
        'The end time must be after the start time',
      );
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      // Times are wall-clock times in the company's time zone, stored as entered.
      const row = await tx.dayStatus.create({
        data: {
          tenantId: c.tenantId,
          memberId: c.memberId,
          date: parseDay(dto.date),
          part: 'FULL',
          type: 'OUT_OF_OFFICE',
          startTime: new Date(`${dto.date}T${dto.from}:00.000Z`),
          endTime: new Date(`${dto.date}T${dto.to}:00.000Z`),
          note: dto.reason,
        },
      });
      return { id: row.id, date: dto.date, from: dto.from, to: dto.to };
    });
  }

  @Delete('out-of-office/:id')
  removeOutOfOffice(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const r = await tx.dayStatus.deleteMany({
        where: { id, memberId: c.memberId, type: 'OUT_OF_OFFICE' },
      });
      if (!r.count) throw new NotFoundException('Not found');
      return { ok: true };
    });
  }
}
