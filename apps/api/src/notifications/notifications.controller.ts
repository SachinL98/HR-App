import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentCtx } from '../common/ctx';
import type { Ctx } from '../common/ctx';
import { PrismaService } from '../prisma/prisma.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list(@CurrentCtx() c: Ctx, @Query('unread') unread?: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const where = {
        memberId: c.memberId,
        ...(unread === '1' ? { readAt: null } : {}),
      };
      const [items, unreadCount] = await Promise.all([
        tx.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        tx.notification.count({
          where: { memberId: c.memberId, readAt: null },
        }),
      ]);
      return { items, unreadCount };
    });
  }

  @Post('read-all')
  readAll(@CurrentCtx() c: Ctx) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const r = await tx.notification.updateMany({
        where: { memberId: c.memberId, readAt: null },
        data: { readAt: new Date() },
      });
      return { updated: r.count };
    });
  }

  @Post(':id/read')
  read(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const r = await tx.notification.updateMany({
        where: { id, memberId: c.memberId, readAt: null },
        data: { readAt: new Date() },
      });
      return { updated: r.count };
    });
  }
}
