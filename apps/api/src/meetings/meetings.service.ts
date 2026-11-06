import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Ctx } from '../common/ctx';
import { can } from '../org/permissions';
import { notify } from '../notifications/notify';
import { AvailabilityDto, CreateMeetingDto, RsvpDto } from './dto';

const fmt = (d: Date) =>
  d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const day = (d: Date) => new Date(d.toISOString().slice(0, 10));

@Injectable()
export class MeetingsService {
  constructor(private prisma: PrismaService) {}

  create(c: Ctx, dto: CreateMeetingDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt)
      throw new BadRequestException('A meeting must end after it starts');
    if (endsAt.getTime() - startsAt.getTime() > 12 * 3600_000)
      throw new BadRequestException('Meetings can be at most 12 hours long');
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: c.tenantId },
      });
      const ids = new Set<string>(dto.memberIds ?? []);
      const via = new Map<string, string>();
      if (dto.departmentIds?.length) {
        const fromDepts = await tx.member.findMany({
          where: {
            status: 'ACTIVE',
            departmentId: { in: dto.departmentIds },
          },
          select: { id: true, departmentId: true },
        });
        for (const m of fromDepts) {
          if (!ids.has(m.id) && m.departmentId) via.set(m.id, m.departmentId);
          ids.add(m.id);
        }
      }
      ids.delete(c.memberId);
      const found = await tx.member.findMany({
        where: { id: { in: [...ids] }, status: 'ACTIVE' },
        select: { id: true },
      });
      if (found.length !== ids.size)
        throw new BadRequestException('Some invitees are not active members');

      const m = await tx.meeting.create({
        data: {
          tenantId: c.tenantId,
          organizerId: c.memberId,
          title: dto.title,
          description: dto.description,
          startsAt,
          endsAt,
          timeZone: dto.timeZone ?? tenant.timeZone,
          location: dto.location,
          meetUrl: dto.meetUrl,
          attendees: {
            create: [
              {
                tenantId: c.tenantId,
                memberId: c.memberId,
                rsvp: 'YES' as const,
              },
              ...[...ids].map((memberId) => ({
                tenantId: c.tenantId,
                memberId,
                viaGroup: via.get(memberId),
              })),
            ],
          },
        },
        include: { attendees: true },
      });
      await notify(tx, c.tenantId, [...ids], {
        event: 'meeting.invited',
        title: `Invited: ${m.title}`,
        body: fmt(m.startsAt),
        link: `/calendar?view=day&date=${m.startsAt.toISOString().slice(0, 10)}`,
      });
      return m;
    });
  }

  /** Meetings the caller organizes or is invited to. */
  list(c: Ctx, from: string, to: string) {
    const a = new Date(from);
    const b = new Date(to);
    if (isNaN(+a) || isNaN(+b) || b < a)
      throw new BadRequestException('Invalid date range');
    if (b.getTime() - a.getTime() > 400 * 86400_000)
      throw new BadRequestException('Date range too large');
    return this.prisma.withTenant(c.tenantId, (tx) =>
      tx.meeting.findMany({
        where: {
          canceledAt: null,
          startsAt: { lt: b },
          endsAt: { gt: a },
          attendees: { some: { memberId: c.memberId } },
        },
        orderBy: { startsAt: 'asc' },
        include: {
          organizer: { select: { id: true, firstName: true, lastName: true } },
          attendees: {
            include: {
              member: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      }),
    );
  }

  rsvp(c: Ctx, id: string, dto: RsvpDto) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const row = await tx.meetingAttendee.findFirst({
        where: { meetingId: id, memberId: c.memberId },
        include: { meeting: true },
      });
      if (!row || row.meeting.canceledAt)
        throw new NotFoundException('Meeting not found');
      await tx.meetingAttendee.update({
        where: { meetingId_memberId: { meetingId: id, memberId: c.memberId } },
        data: { rsvp: dto.rsvp },
      });
      if (row.meeting.organizerId !== c.memberId)
        await notify(tx, c.tenantId, [row.meeting.organizerId], {
          event: 'meeting.rsvp',
          title: `RSVP ${dto.rsvp.toLowerCase()}: ${row.meeting.title}`,
        });
      return { rsvp: dto.rsvp };
    });
  }

  cancel(c: Ctx, id: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const m = await tx.meeting.findFirst({
        where: { id, canceledAt: null },
        include: { attendees: true },
      });
      if (!m) throw new NotFoundException('Meeting not found');
      if (m.organizerId !== c.memberId && !can(c.subject, 'meeting.manage_all'))
        throw new ForbiddenException('Only the organizer can cancel this');
      await tx.meeting.update({
        where: { id },
        data: { canceledAt: new Date() },
      });
      await notify(
        tx,
        c.tenantId,
        m.attendees.map((a) => a.memberId).filter((x) => x !== c.memberId),
        {
          event: 'meeting.canceled',
          title: `Canceled: ${m.title}`,
          body: fmt(m.startsAt),
        },
      );
      return { canceled: true };
    });
  }

  /** For each person: clashing meetings, plus leave / WFH / holiday that day. */
  availability(c: Ctx, dto: AvailabilityDto) {
    const a = new Date(dto.startsAt);
    const b = new Date(dto.endsAt);
    if (b <= a) throw new BadRequestException('End must be after start');
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const members = await tx.member.findMany({
        where: { id: { in: dto.memberIds }, status: 'ACTIVE' },
        select: { id: true, firstName: true, lastName: true },
      });
      const clashes = await tx.meetingAttendee.findMany({
        where: {
          memberId: { in: dto.memberIds },
          rsvp: { not: 'NO' },
          meeting: { canceledAt: null, startsAt: { lt: b }, endsAt: { gt: a } },
        },
        include: {
          meeting: {
            select: {
              id: true,
              title: true,
              organizerId: true,
              attendees: { select: { memberId: true } },
            },
          },
        },
      });
      const days = await tx.dayStatus.findMany({
        where: {
          memberId: { in: dto.memberIds },
          date: { gte: day(a), lte: day(b) },
          type: { in: ['LEAVE', 'WFH', 'HOLIDAY'] },
        },
      });
      return members.map((m) => ({
        member: m,
        // Titles of meetings you are not part of stay private; you only learn the person is busy.
        meetings: clashes
          .filter((x) => x.memberId === m.id)
          .map((x) => {
            const mine =
              x.meeting.organizerId === c.memberId ||
              x.meeting.attendees.some((a) => a.memberId === c.memberId);
            return { id: x.meeting.id, title: mine ? x.meeting.title : 'Busy' };
          }),
        status: days.filter((d) => d.memberId === m.id).map((d) => d.type),
        free:
          !clashes.some((x) => x.memberId === m.id) &&
          !days.some((d) => d.memberId === m.id && d.type !== 'WFH'),
      }));
    });
  }
}
