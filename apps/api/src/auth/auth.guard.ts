import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { can, PermissionAction } from '../org/permissions';
import { Ctx } from '../common/ctx';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async canActivate(ec: ExecutionContext) {
    const targets = [ec.getHandler(), ec.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('public', targets))
      return true;

    const req = ec.switchToHttp().getRequest<Request & { ctx?: Ctx }>();
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) throw new UnauthorizedException();

    let payload: { sub: string; mid: string; tid: string };
    try {
      payload = await this.jwt.verifyAsync(header.slice(7));
    } catch {
      throw new UnauthorizedException();
    }

    const member = await this.prisma.withTenant(payload.tid, (tx) =>
      tx.member.findUnique({
        where: { id: payload.mid },
        include: { jobRole: true, grants: true },
      }),
    );
    if (!member || member.status !== 'ACTIVE' || member.userId !== payload.sub)
      throw new UnauthorizedException();

    const ctx: Ctx = {
      userId: payload.sub,
      memberId: member.id,
      tenantId: payload.tid,
      subject: {
        isOwner: member.isOwner,
        departmentId: member.departmentId,
        roleDefaults: member.jobRole?.defaultPermissions ?? [],
        grants: member.grants.map((g) => ({
          action: g.action,
          scopeType: g.scopeType,
          scopeIds: g.scopeIds,
        })),
      },
    };
    req.ctx = ctx;

    const needed = this.reflector.getAllAndOverride<PermissionAction>(
      'permission',
      targets,
    );
    if (needed && !can(ctx.subject, needed)) throw new ForbiddenException();
    return true;
  }
}
