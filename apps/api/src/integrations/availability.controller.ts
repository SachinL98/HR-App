import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { Public } from '../common/ctx';
import { PrismaService } from '../prisma/prisma.service';
import { requireIntegration } from './integration-auth';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Read-only feed for the company's other tools (the Developer Dashboard uses it for sprint capacity).
 * One shared token, bound to one company by slug, so it can never reach another tenant's data.
 * Without both variables set the endpoint does not exist.
 *   INTEGRATION_TOKEN  long random string, sent as `Authorization: Bearer …`
 *   INTEGRATION_TENANT slug of the company this token may read
 */
@Controller('integrations')
export class AvailabilityController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get('availability')
  async availability(
    @Headers('authorization') auth?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const slug = requireIntegration(auth);

    if (!from || !to || !DATE.test(from) || !DATE.test(to))
      throw new BadRequestException('from and to must be YYYY-MM-DD');
    const a = day(from);
    const b = day(to);
    if (b < a || (b.getTime() - a.getTime()) / 86_400_000 > MAX_DAYS)
      throw new BadRequestException(`Range must be 0 to ${MAX_DAYS} days`);

    const tenant = await this.prisma.system.tenant.findUnique({
      where: { slug },
      select: { id: true, timeZone: true, workWeek: true },
    });
    if (!tenant) throw new NotFoundException();

    return this.prisma.withTenant(tenant.id, async (tx) => {
      const [members, statuses, holidays] = await Promise.all([
        tx.member.findMany({
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            workEmail: true,
            firstName: true,
            lastName: true,
            jobRole: { select: { name: true } },
          },
        }),
        tx.dayStatus.findMany({
          where: {
            date: { gte: a, lte: b },
            type: { in: ['LEAVE', 'WFH', 'OUT_OF_OFFICE'] },
          },
          select: { memberId: true, date: true, part: true, type: true },
          orderBy: { date: 'asc' },
        }),
        tx.holiday.findMany({
          where: { date: { gte: a, lte: b }, departmentIds: { isEmpty: true } },
          select: { date: true, name: true },
          orderBy: { date: 'asc' },
        }),
      ]);
      const byId = new Map(members.map((m) => [m.id, m]));
      return {
        timeZone: tenant.timeZone,
        workWeek: tenant.workWeek,
        members: members.map((m) => ({
          id: m.id,
          email: m.workEmail.toLowerCase(),
          name: `${m.firstName} ${m.lastName}`,
          role: m.jobRole?.name ?? null,
        })),
        // type: LEAVE | WFH | OUT_OF_OFFICE; part: FULL | AM | PM
        days: statuses.flatMap((s) => {
          const m = byId.get(s.memberId);
          return m
            ? [
                {
                  email: m.workEmail.toLowerCase(),
                  date: iso(s.date),
                  part: s.part,
                  type: s.type,
                },
              ]
            : [];
        }),
        holidays: holidays.map((h) => ({ date: iso(h.date), name: h.name })),
      };
    });
  }
}
