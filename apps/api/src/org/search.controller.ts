import { Controller, Get, Query } from '@nestjs/common';
import { CurrentCtx } from '../common/ctx';
import type { Ctx } from '../common/ctx';
import { PrismaService } from '../prisma/prisma.service';
import { can } from './permissions';

interface Audience {
  all?: boolean;
  departments?: string[];
  roles?: string[];
  members?: string[];
}

/** One search box for people, notices and documents. It only returns what the person could already open. */
@Controller('search')
export class SearchController {
  constructor(private prisma: PrismaService) {}

  @Get()
  search(@CurrentCtx() c: Ctx, @Query('q') raw?: string) {
    const q = (raw ?? '').trim().slice(0, 60);
    if (q.length < 2) return { people: [], notices: [], documents: [] };
    const like = { contains: q, mode: 'insensitive' as const };
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const me = await tx.member.findUniqueOrThrow({
        where: { id: c.memberId },
      });
      const [people, roles, depts, notices, docs] = await Promise.all([
        tx.member.findMany({
          where: {
            status: 'ACTIVE',
            OR: [
              { firstName: like },
              { lastName: like },
              { workEmail: like },
              { preferredName: like },
            ],
          },
          orderBy: { firstName: 'asc' },
          take: 6,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            workEmail: true,
            jobRoleId: true,
            departmentId: true,
          },
        }),
        tx.jobRole.findMany({ select: { id: true, name: true } }),
        tx.department.findMany({ select: { id: true, name: true } }),
        // Notices follow the same audience rules as the Notices page.
        tx.notice.findMany({
          where: {
            title: like,
            publishAt: { lte: new Date() },
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          orderBy: { publishAt: 'desc' },
          take: 20,
        }),
        // Issuers see every document; everyone else only their own that are still valid.
        tx.issuedDocument.findMany({
          where: {
            OR: [
              { template: { name: like } },
              { verifyCode: { startsWith: q.toUpperCase() } },
            ],
            ...(can(c.subject, 'document.issue')
              ? {}
              : { subjectId: c.memberId, revokedAt: null }),
          },
          orderBy: { issuedAt: 'desc' },
          take: 5,
          include: {
            template: { select: { name: true } },
            subject: { select: { firstName: true, lastName: true } },
          },
        }),
      ]);
      const role = new Map(roles.map((r) => [r.id, r.name]));
      const dept = new Map(depts.map((d) => [d.id, d.name]));
      const publisher = can(c.subject, 'notice.publish');
      return {
        people: people.map((p) => ({
          id: p.id,
          name: `${p.firstName} ${p.lastName}`,
          detail:
            [
              p.jobRoleId && role.get(p.jobRoleId),
              p.departmentId && dept.get(p.departmentId),
            ]
              .filter(Boolean)
              .join(' · ') || p.workEmail,
        })),
        notices: notices
          .filter((n) => {
            const a = n.audience as Audience;
            return (
              n.authorId === c.memberId ||
              publisher ||
              a.all ||
              (me.departmentId && a.departments?.includes(me.departmentId)) ||
              (me.jobRoleId && a.roles?.includes(me.jobRoleId)) ||
              a.members?.includes(c.memberId)
            );
          })
          .slice(0, 5)
          .map((n) => ({ id: n.id, title: n.title })),
        documents: docs.map((d) => ({
          id: d.id,
          name: d.template.name,
          detail:
            d.subjectId === c.memberId
              ? 'Issued to you'
              : `${d.subject.firstName} ${d.subject.lastName}`,
        })),
      };
    });
  }
}
