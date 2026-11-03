import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import { PermissionAction, Subject } from '../org/permissions';

export interface Ctx {
  userId: string;
  memberId: string;
  tenantId: string;
  subject: Subject;
}

export const Public = () => SetMetadata('public', true);
export const RequirePermission = (action: PermissionAction) =>
  SetMetadata('permission', action);

export const CurrentCtx = createParamDecorator(
  (_: unknown, ec: ExecutionContext): Ctx =>
    ec.switchToHttp().getRequest<Request & { ctx: Ctx }>().ctx,
);
