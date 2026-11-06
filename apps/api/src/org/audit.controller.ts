import { Controller, Get, Query } from '@nestjs/common';
import { CurrentCtx, RequirePermission } from '../common/ctx';
import type { Ctx } from '../common/ctx';
import { PrismaService } from '../prisma/prisma.service';

/** Read-only view of who did what. The table is append-only for the app role. */
@Controller('audit')
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @RequirePermission('audit.view')
  list(
    @CurrentCtx() c: Ctx,
    @Query('before') before?: string,
    @Query('action') action?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const cursor = /^\d{1,18}$/.test(before ?? '') ? BigInt(before!) : null;
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const rows = await tx.auditLog.findMany({
        where: {
          ...(cursor ? { id: { lt: cursor } } : {}),
          ...(action ? { action: { startsWith: action.slice(0, 40) } } : {}),
        },
        orderBy: { id: 'desc' },
        take: take + 1,
      });
      const page = rows.slice(0, take);
      const actors = await tx.member.findMany({
        where: {
          id: {
            in: [
              ...new Set(page.map((r) => r.actorId).filter(Boolean)),
            ] as string[],
          },
        },
        select: { id: true, firstName: true, lastName: true },
      });
      const name = new Map(
        actors.map((a) => [a.id, `${a.firstName} ${a.lastName}`]),
      );
      return {
        // Details (meta) are left out on purpose: they can hold names and other personal data.
        items: page.map((r) => ({
          id: r.id.toString(),
          action: r.action,
          targetType: r.targetType,
          targetId: r.targetId,
          actor: r.actorId
            ? (name.get(r.actorId) ?? 'Former member')
            : 'System',
          createdAt: r.createdAt,
        })),
        next: rows.length > take ? page[page.length - 1].id.toString() : null,
      };
    });
  }
}
