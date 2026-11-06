import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { IsUUID, Matches } from 'class-validator';
import type { Response } from 'express';
import { CurrentCtx, Public } from '../common/ctx';
import type { Ctx } from '../common/ctx';
import { PrismaService } from '../prisma/prisma.service';
import { notify } from '../notifications/notify';
import { hashToken, newToken } from '../auth/auth.service';
import { buildIcs, type IcsEvent } from './ics';

class DelegationDto {
  @IsUUID() toId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) startsOn!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) endsOn!: string;
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const at = (s: string) => new Date(`${s}T00:00:00Z`);

/** Cover while you are away, and a secret link so Google, Outlook or Apple Calendar can show the team calendar. */
@Controller()
export class ApprovalsExtraController {
  constructor(private prisma: PrismaService) {}

  // ───────── cover while away ─────────

  @Get('delegations')
  list(@CurrentCtx() c: Ctx) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const today = at(day(new Date()));
      const rows = await tx.delegation.findMany({
        where: {
          revokedAt: null,
          endsOn: { gte: today },
          OR: [{ fromId: c.memberId }, { toId: c.memberId }],
        },
        orderBy: { startsOn: 'asc' },
      });
      const people = await tx.member.findMany({
        where: {
          id: { in: [...new Set(rows.flatMap((r) => [r.fromId, r.toId]))] },
        },
        select: { id: true, firstName: true, lastName: true },
      });
      const name = (id: string) => {
        const p = people.find((x) => x.id === id);
        return p ? `${p.firstName} ${p.lastName}` : 'Former member';
      };
      const view = (r: (typeof rows)[number]) => ({
        id: r.id,
        from: { id: r.fromId, name: name(r.fromId) },
        to: { id: r.toId, name: name(r.toId) },
        startsOn: r.startsOn,
        endsOn: r.endsOn,
        active: r.startsOn <= today && r.endsOn >= today,
      });
      return {
        given: rows.filter((r) => r.fromId === c.memberId).map(view),
        received: rows.filter((r) => r.toId === c.memberId).map(view),
      };
    });
  }

  @Post('delegations')
  create(@CurrentCtx() c: Ctx, @Body() dto: DelegationDto) {
    if (dto.endsOn < dto.startsOn)
      throw new BadRequestException('The end date is before the start date');
    const span =
      (at(dto.endsOn).getTime() - at(dto.startsOn).getTime()) / 86400_000;
    if (!(span >= 0) || span > 90)
      throw new BadRequestException('Cover can last at most 90 days');
    if (dto.toId === c.memberId)
      throw new BadRequestException('Choose someone else to cover for you');
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const to = await tx.member.findFirst({
        where: { id: dto.toId, status: 'ACTIVE' },
      });
      if (!to) throw new NotFoundException('That person was not found');
      const d = await tx.delegation.create({
        data: {
          tenantId: c.tenantId,
          fromId: c.memberId,
          toId: to.id,
          startsOn: at(dto.startsOn),
          endsOn: at(dto.endsOn),
        },
      });
      const me = await tx.member.findUniqueOrThrow({
        where: { id: c.memberId },
      });
      await notify(tx, c.tenantId, [to.id], {
        event: 'delegation.created',
        title: `${me.firstName} ${me.lastName} asked you to cover their approvals`,
        body: `${dto.startsOn} to ${dto.endsOn}`,
        link: '/approvals',
      });
      await tx.auditLog.create({
        data: {
          tenantId: c.tenantId,
          actorId: c.memberId,
          action: 'delegation.create',
          targetId: d.id,
        },
      });
      return { id: d.id };
    });
  }

  @Delete('delegations/:id')
  revoke(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const r = await tx.delegation.updateMany({
        where: { id, fromId: c.memberId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (!r.count) throw new NotFoundException('Cover not found');
      await tx.auditLog.create({
        data: {
          tenantId: c.tenantId,
          actorId: c.memberId,
          action: 'delegation.revoke',
          targetId: id,
        },
      });
      return { ok: true };
    });
  }

  // ───────── calendar feed ─────────

  @Get('calendar-feed')
  feedStatus(@CurrentCtx() c: Ctx) {
    return this.prisma.withTenant(c.tenantId, async (tx) => ({
      exists: !!(await tx.calendarFeed.findUnique({
        where: { memberId: c.memberId },
      })),
    }));
  }

  /** Creates the link, or replaces it (the old link stops working). */
  @Post('calendar-feed')
  rotate(@CurrentCtx() c: Ctx) {
    const token = newToken();
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      await tx.calendarFeed.upsert({
        where: { memberId: c.memberId },
        create: {
          tenantId: c.tenantId,
          memberId: c.memberId,
          tokenHash: hashToken(token),
        },
        update: { tokenHash: hashToken(token), createdAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          tenantId: c.tenantId,
          actorId: c.memberId,
          action: 'calendar.feed.rotate',
        },
      });
      return { path: `/calendar/feed/${token}.ics` };
    });
  }

  @Delete('calendar-feed')
  stopFeed(@CurrentCtx() c: Ctx) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      await tx.calendarFeed.deleteMany({ where: { memberId: c.memberId } });
      return { ok: true };
    });
  }

  /** Public, because calendar apps cannot sign in. The secret in the link is the key. */
  @Public()
  @Get('calendar/feed/:file')
  async feed(
    @Param('file') file: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const m = /^([A-Za-z0-9_-]{20,64})\.ics$/.exec(file);
    if (!m) throw new NotFoundException();
    const feed = await this.prisma.system.calendarFeed.findUnique({
      where: { tokenHash: hashToken(m[1]) },
    });
    const member = feed
      ? await this.prisma.system.member.findFirst({
          where: { id: feed.memberId, status: 'ACTIVE' },
        })
      : null;
    if (!feed || !member) throw new NotFoundException();

    const ics = await this.prisma.withTenant(feed.tenantId, async (tx) => {
      const from = new Date(Date.now() - 30 * 86400_000);
      const to = new Date(Date.now() + 365 * 86400_000);
      const events: IcsEvent[] = [];

      for (const h of await tx.holiday.findMany({
        where: { date: { gte: from, lte: to } },
      }))
        events.push({
          uid: `holiday-${h.id}@seamless-source-hr`,
          title: `Holiday: ${h.name}`,
          allDay: { start: day(h.date), end: day(h.date) },
        });

      // Time off for you and your department, from the approved days on the calendar.
      const team = await tx.member.findMany({
        where: {
          status: 'ACTIVE',
          OR: [
            { id: member.id },
            ...(member.departmentId
              ? [{ departmentId: member.departmentId }]
              : []),
          ],
        },
        select: { id: true, firstName: true, lastName: true },
      });
      const days = await tx.dayStatus.findMany({
        where: {
          memberId: { in: team.map((t) => t.id) },
          type: { in: ['LEAVE', 'WFH'] },
          requestId: { not: null },
          date: { gte: from, lte: to },
        },
        orderBy: { date: 'asc' },
      });
      const groups = new Map<
        string,
        { memberId: string; type: string; start: string; end: string }
      >();
      for (const d of days) {
        const g = groups.get(d.requestId!);
        const k = day(d.date);
        if (!g)
          groups.set(d.requestId!, {
            memberId: d.memberId,
            type: d.type,
            start: k,
            end: k,
          });
        else g.end = k > g.end ? k : g.end;
      }
      for (const [rid, g] of groups) {
        const p = team.find((t) => t.id === g.memberId);
        if (!p) continue;
        events.push({
          uid: `request-${rid}@seamless-source-hr`,
          title: `${p.firstName} ${p.lastName}: ${g.type === 'LEAVE' ? 'on leave' : 'working from home'}`,
          allDay: { start: g.start, end: g.end },
        });
      }

      // Meetings you are part of.
      const meetings = await tx.meeting.findMany({
        where: {
          canceledAt: null,
          startsAt: { gte: from, lte: to },
          OR: [
            { organizerId: member.id },
            {
              attendees: { some: { memberId: member.id, rsvp: { not: 'NO' } } },
            },
          ],
        },
      });
      for (const mt of meetings)
        events.push({
          uid: `meeting-${mt.id}@seamless-source-hr`,
          title: mt.title,
          start: mt.startsAt,
          end: mt.endsAt,
          location: mt.location ?? undefined,
          description: mt.meetUrl ?? undefined,
        });

      const org = await tx.tenant.findUniqueOrThrow({
        where: { id: feed.tenantId },
      });
      return buildIcs(`${org.displayName} team calendar`, events);
    });
    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, max-age=900',
      'X-Content-Type-Options': 'nosniff',
    });
    return ics;
  }
}
