import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

/** Checks the shared integration token and returns the one company it may read. 404 when integration is not configured. */
export function requireIntegration(auth?: string): string {
  const token = process.env.INTEGRATION_TOKEN;
  const slug = process.env.INTEGRATION_TENANT;
  if (!token || !slug) throw new NotFoundException();
  const want = Buffer.from(`Bearer ${token}`);
  const got = Buffer.from(auth ?? '');
  if (got.length !== want.length || !timingSafeEqual(want, got))
    throw new UnauthorizedException();
  return slug;
}
