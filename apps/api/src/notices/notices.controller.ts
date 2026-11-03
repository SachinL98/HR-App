import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import { CurrentCtx, RequirePermission } from '../common/ctx';
import type { Ctx } from '../common/ctx';
import { PrismaService } from '../prisma/prisma.service';
import { can } from '../org/permissions';
import { notify } from '../notifications/notify';

class CreateNoticeDto {
  @IsString() @Length(1, 140) title!: string;
  /** Plain text. It is escaped on display, never rendered as HTML. */
  @IsString() @Length(1, 10000) body!: string;
  @IsOptional() @IsBoolean() important?: boolean;
  @IsOptional() @IsBoolean() requireAck?: boolean;
  @IsOptional() @IsBoolean() everyone?: boolean;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  departmentIds?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  roleIds?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  memberIds?: string[];
  @IsOptional() @IsDateString() expiresAt?: string;
}

type Audience = {
  all?: boolean;
  departments?: string[];
  roles?: string[];
  members?: string[];
};

@Controller('notices')
export class NoticesController {
  constructor(private prisma: PrismaService) {}

  @Post()
  @RequirePermission('notice.publish')
  create(@CurrentCtx() c: Ctx, @Body() dto: CreateNoticeDto) {
    const audience: Audience = dto.everyone
      ? { all: true }
      : {
          departments: dto.departmentIds ?? [],
          roles: dto.roleIds ?? [],
          members: dto.memberIds ?? [],
        };
    if (
      !audience.all &&
      !audience.departments?.length &&
      !audience.roles?.length &&
      !audience.members?.length
    )
      throw new BadRequestException('Choose who should see this notice');
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const n = await tx.notice.create({
        data: {
          tenantId: c.tenantId,
          authorId: c.memberId,
          title: dto.title,
          body: dto.body,
          important: dto.important ?? false,
          requireAck: dto.requireAck ?? false,
          audience,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        },
      });
      const people = await tx.member.findMany({
        where: {
          status: 'ACTIVE',
          id: { not: c.memberId },
          ...(audience.all
            ? {}
            : {
                OR: [
                  { departmentId: { in: audience.departments } },
                  { jobRoleId: { in: audience.roles } },
                  { id: { in: audience.members } },
                ],
              }),
        },
        select: { id: true },
      });
      await notify(
        tx,
        c.tenantId,
        people.map((p) => p.id),
        {
          event: 'notice.published',
          title: n.important ? `Important: ${n.title}` : n.title,
          link: '/notices',
        },
      );
      return n;
    });
  }

  /** Notices addressed to me (everyone, my department, my role, or me by name). */
  @Get()
  list(@CurrentCtx() c: Ctx) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const me = await tx.member.findUniqueOrThrow({
        where: { id: c.memberId },
      });
      const now = new Date();
      const all = await tx.notice.findMany({
        where: {
          publishAt: { lte: now },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: [{ important: 'desc' }, { publishAt: 'desc' }],
        take: 100,
        include: { reads: { where: { memberId: c.memberId } } },
      });
      const publisher = can(c.subject, 'notice.publish');
      return all
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
        .map(({ reads, ...n }) => ({
          ...n,
          readAt: reads[0]?.readAt ?? null,
          ackAt: reads[0]?.ackAt ?? null,
        }));
    });
  }

  @Post(':id/read')
  read(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { acknowledge?: boolean },
  ) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const n = await tx.notice.findFirst({ where: { id } });
      if (!n) throw new NotFoundException('Notice not found');
      const ack = body?.acknowledge === true && n.requireAck;
      await tx.noticeRead.upsert({
        where: { noticeId_memberId: { noticeId: id, memberId: c.memberId } },
        create: {
          noticeId: id,
          memberId: c.memberId,
          tenantId: c.tenantId,
          ackAt: ack ? new Date() : null,
        },
        update: ack ? { ackAt: new Date() } : {},
      });
      return { ok: true };
    });
  }

  /** Who has read / acknowledged. Authors and publishers only. */
  @Get(':id/reads')
  @RequirePermission('notice.publish')
  reads(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) =>
      tx.noticeRead.findMany({
        where: { noticeId: id },
        include: {
          member: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
    );
  }

  @Delete(':id')
  @RequirePermission('notice.publish')
  remove(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const n = await tx.notice.findFirst({ where: { id } });
      if (!n) throw new NotFoundException('Notice not found');
      if (n.authorId !== c.memberId && !c.subject.isOwner)
        throw new ForbiddenException('Only the author or owner can remove it');
      await tx.notice.delete({ where: { id } });
      return { deleted: true };
    });
  }
}
