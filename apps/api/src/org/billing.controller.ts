import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Headers,
  NotFoundException,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import type { Request } from 'express';
import { CurrentCtx, Public, RequirePermission } from '../common/ctx';
import type { Ctx } from '../common/ctx';
import { PrismaService } from '../prisma/prisma.service';
import { PLAN_FEATURES, planOf } from './plan';

class BillingEventDto {
  @IsUUID() tenantId!: string;
  @IsIn(['FREE', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM']) tier!:
    'FREE' | 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  @IsIn(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED']) status!:
    'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  @IsOptional() @IsInt() @Min(1) @Max(100000) seats?: number;
  @IsOptional() @IsIn(['month', 'year']) billingInterval?: 'month' | 'year';
  @IsOptional() @IsISO8601() currentPeriodEnd?: string;
  /** Your payment provider's customer id, kept for reference. */
  @IsOptional() @IsString() customerId?: string;
  /** Unix seconds when the event was signed. Events older than five minutes are refused (replay protection). */
  @IsInt() timestamp!: number;
}

/** The company's plan and usage, and the one door a payment provider uses to change it. */
@Controller('billing')
export class BillingController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @RequirePermission('billing.manage')
  overview(@CurrentCtx() c: Ctx) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const sub = await tx.subscription.findUniqueOrThrow({
        where: { tenantId: c.tenantId },
      });
      const plan = planOf(sub);
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
      return {
        plan: {
          ...plan,
          seatsUsed: used,
          invitesPending: pending,
          overLimit: used > plan.seatLimit,
        },
        subscription: {
          tier: sub.tier,
          status: sub.status,
          seats: sub.seats,
          interval: sub.billingInterval,
          trialEndsAt: sub.trialEndsAt,
          currentPeriodEnd: sub.currentPeriodEnd,
        },
        features: PLAN_FEATURES.map((f) => ({
          ...f,
          seats: f.seats > 1_000_000 ? null : f.seats,
        })),
      };
    });
  }

  /**
   * Called by your payment provider (or a small adapter in front of it) when a plan changes, a payment fails or a
   * subscription is cancelled. Sign the exact request body with HMAC-SHA256 using BILLING_WEBHOOK_SECRET and send
   * the hex digest in the x-signature header (optionally prefixed "sha256="). Not available until the secret is set.
   */
  @Public()
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-signature') signature: string | undefined,
    @Body() dto: BillingEventDto,
  ) {
    const secret = process.env.BILLING_WEBHOOK_SECRET;
    if (!secret) throw new NotFoundException();
    const given = Buffer.from((signature ?? '').replace(/^sha256=/, ''), 'hex');
    const want = createHmac('sha256', secret)
      .update(req.rawBody ?? Buffer.alloc(0))
      .digest();
    if (given.length !== want.length || !timingSafeEqual(given, want))
      throw new UnauthorizedException('Bad signature');
    if (Math.abs(Date.now() / 1000 - dto.timestamp) > 300)
      throw new BadRequestException('This event is too old');
    const t = await this.prisma.system.subscription.findUnique({
      where: { tenantId: dto.tenantId },
    });
    if (!t) throw new NotFoundException('Unknown company');
    try {
      await this.prisma.system.subscription.update({
        where: { tenantId: dto.tenantId },
        data: {
          tier: dto.tier,
          status: dto.status,
          seats: dto.seats,
          billingInterval: dto.billingInterval,
          currentPeriodEnd: dto.currentPeriodEnd
            ? new Date(dto.currentPeriodEnd)
            : undefined,
          stripeCustomerId: dto.customerId,
          // A paid or cancelled plan is no longer on trial.
          trialEndsAt: dto.status === 'TRIALING' ? undefined : null,
        },
      });
    } catch (e) {
      // The provider's customer id belongs to one company only.
      if ((e as { code?: string }).code === 'P2002')
        throw new ConflictException(
          'That customer id is already linked to another company',
        );
      throw e;
    }
    await this.prisma.system.auditLog.create({
      data: {
        tenantId: dto.tenantId,
        action: `billing.${dto.status.toLowerCase()}`,
        meta: { tier: dto.tier, seats: dto.seats ?? null },
      },
    });
    return { ok: true };
  }
}
