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
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { encryptJson } from '../common/field-crypto';
import { CurrentCtx, RequirePermission } from '../common/ctx';
import type { Ctx } from '../common/ctx';
import { ThemeDto } from '../auth/dto';
import { MailService } from '../auth/mail.service';
import { hashToken, newToken } from '../auth/auth.service';
import { planOf } from './plan';
import {
  can,
  isPermission,
  PERMISSIONS,
  PermissionAction,
} from './permissions';
import {
  DepartmentDto,
  InviteDto,
  JobRoleDto,
  ProfileDto,
  SetGrantsDto,
  UpdateDepartmentDto,
  UpdateJobRoleDto,
  UpdateMemberDto,
} from './dto';

const audit = (
  tx: Tx,
  c: Ctx,
  action: string,
  targetId?: string,
  meta?: object,
) =>
  tx.auditLog.create({
    data: { tenantId: c.tenantId, actorId: c.memberId, action, targetId, meta },
  });

const memberView = {
  id: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  workEmail: true,
  departmentId: true,
  jobRoleId: true,
  managerId: true,
  status: true,
  isOwner: true,
  photoFileId: true,
  employeeNo: true,
  startDate: true,
} as const;

@Controller()
export class OrgController {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  // ───────── me & company ─────────

  @Get('me')
  me(@CurrentCtx() c: Ctx) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const m = await tx.member.findUniqueOrThrow({
        where: { id: c.memberId },
        select: { ...memberView, jobRole: { select: { name: true } } },
      });
      const permissions = (
        Object.keys(PERMISSIONS) as PermissionAction[]
      ).filter((a) => can(c.subject, a));
      const u = await this.prisma.system.user.findUniqueOrThrow({
        where: { id: c.userId },
        select: { emailVerified: true, mfaEnabled: true, locale: true },
      });
      return {
        ...m,
        permissions,
        account: {
          emailVerified: !!u.emailVerified,
          mfaEnabled: u.mfaEnabled,
          locale: u.locale,
        },
      };
    });
  }

  @Get('org')
  org(@CurrentCtx() c: Ctx) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const t = await tx.tenant.findUniqueOrThrow({
        where: { id: c.tenantId },
        select: {
          id: true,
          slug: true,
          displayName: true,
          legalName: true,
          country: true,
          timeZone: true,
          currency: true,
          phone: true,
          website: true,
          logoFileId: true,
          themePrimary: true,
          themeAccent: true,
          themeMode: true,
          themeRadius: true,
          subscription: {
            select: {
              tier: true,
              status: true,
              seats: true,
              trialEndsAt: true,
              currentPeriodEnd: true,
              updatedAt: true,
            },
          },
        },
      });
      const end = t.subscription?.trialEndsAt;
      const trialDaysLeft = end
        ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400_000))
        : null;
      const sub = t.subscription;
      const plan = sub ? planOf(sub) : null;
      const used = plan
        ? await tx.member.count({
            where: { status: { in: ['ACTIVE', 'INVITED'] } },
          })
        : 0;
      return {
        ...t,
        trialDaysLeft,
        // What the company can use right now, once a lapsed trial or payment is taken into account.
        plan: plan && {
          tier: plan.tier,
          chosen: plan.chosen,
          state: plan.state,
          graceEndsAt: plan.graceEndsAt,
          seatLimit: plan.seatLimit,
          seatsUsed: used,
        },
      };
    });
  }

  @Patch('org/profile')
  @RequirePermission('branding.manage')
  profile(@CurrentCtx() c: Ctx, @Body() dto: ProfileDto) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const t = await tx.tenant.update({
        where: { id: c.tenantId },
        data: dto,
      });
      await audit(tx, c, 'org.profile.update');
      return t;
    });
  }

  /** Admin-set colour theme, applied to every member's web and mobile UI. */
  @Patch('org/theme')
  @RequirePermission('branding.manage')
  theme(@CurrentCtx() c: Ctx, @Body() dto: ThemeDto) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const t = await tx.tenant.update({
        where: { id: c.tenantId },
        data: dto,
        select: {
          themePrimary: true,
          themeAccent: true,
          themeMode: true,
          themeRadius: true,
        },
      });
      await audit(tx, c, 'org.theme.update', undefined, dto);
      return t;
    });
  }

  // ───────── departments ─────────

  @Get('departments')
  departments(@CurrentCtx() c: Ctx) {
    return this.prisma.withTenant(c.tenantId, (tx) =>
      tx.department.findMany({ orderBy: { name: 'asc' } }),
    );
  }

  @Post('departments')
  @RequirePermission('department.manage')
  createDepartment(@CurrentCtx() c: Ctx, @Body() dto: DepartmentDto) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      if (dto.parentId)
        await this.mustExist(
          tx.department.findFirst({ where: { id: dto.parentId } }),
          'Parent department',
        );
      const d = await tx.department.create({
        data: {
          tenantId: c.tenantId,
          name: dto.name,
          parentId: dto.parentId ?? null,
        },
      });
      await audit(tx, c, 'department.create', d.id);
      return d;
    });
  }

  @Patch('departments/:id')
  @RequirePermission('department.manage')
  updateDepartment(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      await this.mustExist(
        tx.department.findFirst({ where: { id } }),
        'Department',
      );
      if (dto.parentId) {
        if (dto.parentId === id)
          throw new BadRequestException(
            'A department cannot be its own parent',
          );
        await this.mustExist(
          tx.department.findFirst({ where: { id: dto.parentId } }),
          'Parent department',
        );
        // Reject cycles: walk up from the new parent.
        let cur: string | null = dto.parentId;
        while (cur) {
          if (cur === id)
            throw new BadRequestException('That would create a loop');
          cur =
            (await tx.department.findUnique({ where: { id: cur } }))
              ?.parentId ?? null;
        }
      }
      if (dto.headId)
        await this.mustExist(
          tx.member.findFirst({ where: { id: dto.headId } }),
          'Head',
        );
      const d = await tx.department.update({ where: { id }, data: dto });
      await audit(tx, c, 'department.update', id);
      return d;
    });
  }

  @Delete('departments/:id')
  @RequirePermission('department.manage')
  deleteDepartment(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      await this.mustExist(
        tx.department.findFirst({ where: { id } }),
        'Department',
      );
      if (
        (await tx.member.count({ where: { departmentId: id } })) ||
        (await tx.department.count({ where: { parentId: id } }))
      )
        throw new ConflictException(
          'Move its members and sub-departments first',
        );
      await tx.department.delete({ where: { id } });
      await audit(tx, c, 'department.delete', id);
      return { ok: true };
    });
  }

  // ───────── company roles ─────────

  @Get('roles')
  roles(@CurrentCtx() c: Ctx) {
    return this.prisma.withTenant(c.tenantId, (tx) =>
      tx.jobRole.findMany({ orderBy: { name: 'asc' } }),
    );
  }

  private checkPerms(c: Ctx, list?: string[]) {
    for (const p of list ?? []) {
      if (!isPermission(p))
        throw new BadRequestException(`Unknown permission ${p}`);
      if (!can(c.subject, p))
        throw new ForbiddenException(`You cannot hand out ${p}`);
    }
  }

  /** A role carries admin powers, so handing it to someone is handing out those powers. */
  private async checkRoleAssignable(c: Ctx, tx: Tx, jobRoleId: string) {
    const role = await this.mustExist(
      tx.jobRole.findFirst({ where: { id: jobRoleId } }),
      'Role',
    );
    this.checkPerms(c, role.defaultPermissions);
  }

  @Post('roles')
  @RequirePermission('role.manage')
  createRole(@CurrentCtx() c: Ctx, @Body() dto: JobRoleDto) {
    this.checkPerms(c, dto.defaultPermissions);
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const r = await tx.jobRole.create({
        data: {
          tenantId: c.tenantId,
          name: dto.name,
          description: dto.description,
          defaultPermissions: dto.defaultPermissions ?? [],
        },
      });
      await audit(tx, c, 'role.create', r.id);
      return r;
    });
  }

  @Patch('roles/:id')
  @RequirePermission('role.manage')
  updateRole(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobRoleDto,
  ) {
    this.checkPerms(c, dto.defaultPermissions);
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      await this.mustExist(tx.jobRole.findFirst({ where: { id } }), 'Role');
      const r = await tx.jobRole.update({ where: { id }, data: dto });
      await audit(tx, c, 'role.update', id, dto);
      return r;
    });
  }

  @Delete('roles/:id')
  @RequirePermission('role.manage')
  deleteRole(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      await this.mustExist(tx.jobRole.findFirst({ where: { id } }), 'Role');
      if (await tx.member.count({ where: { jobRoleId: id } }))
        throw new ConflictException('Reassign members with this role first');
      await tx.jobRole.delete({ where: { id } });
      await audit(tx, c, 'role.delete', id);
      return { ok: true };
    });
  }

  // ───────── members ─────────

  @Get('members')
  members(@CurrentCtx() c: Ctx) {
    return this.prisma.withTenant(c.tenantId, (tx) =>
      tx.member.findMany({ select: memberView, orderBy: { firstName: 'asc' } }),
    );
  }

  @Patch('members/:id')
  @RequirePermission('member.manage')
  updateMember(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const m = await this.mustExist(
        tx.member.findFirst({ where: { id } }),
        'Member',
      );
      if (m.isOwner && id !== c.memberId)
        throw new ForbiddenException(
          'The owner can only be changed by the owner',
        );
      if (m.isOwner && dto.status && dto.status !== 'ACTIVE')
        throw new BadRequestException('The owner cannot be deactivated');
      if (dto.departmentId)
        await this.mustExist(
          tx.department.findFirst({ where: { id: dto.departmentId } }),
          'Department',
        );
      if (
        id === c.memberId &&
        !c.subject.isOwner &&
        (dto.jobRoleId !== undefined || dto.managerId !== undefined)
      )
        throw new ForbiddenException(
          'You cannot change your own job role or line manager',
        );
      if (dto.jobRoleId) await this.checkRoleAssignable(c, tx, dto.jobRoleId);
      if (dto.managerId) {
        if (dto.managerId === id)
          throw new BadRequestException('A member cannot manage themselves');
        await this.mustExist(
          tx.member.findFirst({ where: { id: dto.managerId } }),
          'Manager',
        );
      }
      const { nationalId, startDate, employeeNo, ...plain } = dto;
      if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate))
        throw new BadRequestException('Start date must look like 2023-08-15');
      const updated = await tx.member.update({
        where: { id },
        data: {
          ...plain,
          ...(employeeNo !== undefined
            ? { employeeNo: employeeNo.trim() || null }
            : {}),
          ...(startDate !== undefined
            ? {
                startDate: startDate
                  ? new Date(`${startDate}T00:00:00Z`)
                  : null,
              }
            : {}),
          ...(nationalId !== undefined
            ? {
                nationalIdEnc: nationalId.trim()
                  ? encryptJson(c.tenantId, nationalId.trim())
                  : null,
              }
            : {}),
        },
        select: memberView,
      });
      await audit(tx, c, 'member.update', id, {
        ...dto,
        nationalId: dto.nationalId !== undefined ? '(changed)' : undefined,
      });
      return updated;
    });
  }

  // ───────── permissions (delegated admin powers) ─────────

  @Get('permissions/catalog')
  catalog() {
    return Object.entries(PERMISSIONS).map(([action, label]) => ({
      action,
      label,
    }));
  }

  @Get('members/:id/permissions')
  @RequirePermission('permission.grant')
  getGrants(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.withTenant(c.tenantId, (tx) =>
      tx.permissionGrant.findMany({ where: { memberId: id } }),
    );
  }

  /** Replaces all of a member's direct grants. You can only hand out powers you hold yourself. */
  @Put('members/:id/permissions')
  @RequirePermission('permission.grant')
  setGrants(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetGrantsDto,
  ) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const m = await this.mustExist(
        tx.member.findFirst({ where: { id } }),
        'Member',
      );
      if (m.isOwner)
        throw new BadRequestException('The owner already has every permission');
      if (id === c.memberId)
        throw new ForbiddenException('You cannot change your own permissions');

      for (const g of dto.grants) {
        if (!isPermission(g.action))
          throw new BadRequestException(`Unknown permission ${g.action}`);
        // Escalation guard: the granter must hold this power for the same scope.
        if (
          g.scopeType === 'COMPANY'
            ? !can(c.subject, g.action)
            : !g.scopeIds.every((s) =>
                can(
                  c.subject,
                  g.action as PermissionAction,
                  g.scopeType === 'DEPARTMENT'
                    ? { departmentId: s }
                    : { memberId: s },
                ),
              )
        )
          throw new ForbiddenException(
            `You cannot grant ${g.action} at that scope`,
          );
        if (g.scopeType === 'COMPANY' && g.scopeIds.length)
          throw new BadRequestException('Company scope takes no ids');
        if (g.scopeType !== 'COMPANY') {
          if (!g.scopeIds.length)
            throw new BadRequestException(
              'Pick at least one department or member',
            );
          const found =
            g.scopeType === 'DEPARTMENT'
              ? await tx.department.count({ where: { id: { in: g.scopeIds } } })
              : await tx.member.count({ where: { id: { in: g.scopeIds } } });
          if (found !== new Set(g.scopeIds).size)
            throw new BadRequestException('Unknown scope id');
        }
      }
      await tx.permissionGrant.deleteMany({ where: { memberId: id } });
      await tx.permissionGrant.createMany({
        data: dto.grants.map((g) => ({
          tenantId: c.tenantId,
          memberId: id,
          action: g.action,
          scopeType: g.scopeType,
          scopeIds: g.scopeIds,
          grantedById: c.memberId,
        })),
      });
      await audit(tx, c, 'permission.set', id, { grants: dto.grants });
      return tx.permissionGrant.findMany({ where: { memberId: id } });
    });
  }

  // ───────── invites ─────────

  @Get('invites')
  @RequirePermission('member.invite')
  invites(@CurrentCtx() c: Ctx) {
    return this.prisma.withTenant(c.tenantId, (tx) =>
      tx.invite.findMany({
        where: { acceptedAt: null, revokedAt: null },
        select: {
          id: true,
          email: true,
          departmentId: true,
          jobRoleId: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  @Post('invites')
  @RequirePermission('member.invite')
  invite(@CurrentCtx() c: Ctx, @Body() dto: InviteDto) {
    const email = dto.email.toLowerCase();
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const sub = await tx.subscription.findUniqueOrThrow({
        where: { tenantId: c.tenantId },
      });
      const used = await tx.member.count({
        where: { status: { in: ['ACTIVE', 'INVITED'] } },
      });
      const pending = await tx.invite.count({
        where: {
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      const plan = planOf(sub);
      const limit = plan.seatLimit;
      if (used + pending >= limit)
        throw new ConflictException(
          plan.state === 'trial_ended' || plan.state === 'canceled'
            ? `Your plan has ended, so you are on the Free plan, which allows ${limit} users. Choose a plan to invite more.`
            : `Your ${plan.tier.toLowerCase()} plan allows ${limit} users. Upgrade to invite more.`,
        );
      if (
        await tx.member.findFirst({
          where: { workEmail: email, status: { not: 'LEFT' } },
        })
      )
        throw new ConflictException('That person is already a member');

      if (dto.departmentId)
        await this.mustExist(
          tx.department.findFirst({ where: { id: dto.departmentId } }),
          'Department',
        );
      if (dto.jobRoleId) await this.checkRoleAssignable(c, tx, dto.jobRoleId);
      if (dto.managerId)
        await this.mustExist(
          tx.member.findFirst({ where: { id: dto.managerId } }),
          'Manager',
        );

      const token = newToken();
      const invite = await tx.invite.create({
        data: {
          tenantId: c.tenantId,
          email,
          departmentId: dto.departmentId,
          jobRoleId: dto.jobRoleId,
          managerId: dto.managerId,
          invitedById: c.memberId,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 7 * 86400_000),
        },
      });
      await audit(tx, c, 'invite.create', invite.id, { email });
      const link = `${process.env.WEB_URL ?? 'http://localhost:3000'}/accept-invite?token=${token}`;
      await this.mail.send(
        email,
        'You have been invited to join your company on Seamless Source HR',
        `Accept your invite (valid 7 days): ${link}`,
      );
      // The link is only echoed back outside production, to make local testing easy.
      return {
        id: invite.id,
        email,
        expiresAt: invite.expiresAt,
        ...(process.env.NODE_ENV === 'production' ? {} : { devLink: link }),
      };
    });
  }

  @Delete('invites/:id')
  @RequirePermission('member.invite')
  revokeInvite(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      await this.mustExist(
        tx.invite.findFirst({ where: { id, acceptedAt: null } }),
        'Invite',
      );
      await tx.invite.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      await audit(tx, c, 'invite.revoke', id);
      return { ok: true };
    });
  }

  private async mustExist<T>(
    p: PromiseLike<T | null>,
    what: string,
  ): Promise<T> {
    const v = await p;
    if (!v) throw new NotFoundException(`${what} not found`);
    return v;
  }
}
