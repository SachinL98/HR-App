import { PLAN_LIMITS } from './permissions';

export type Tier = keyof typeof PLAN_LIMITS;
export type PlanState =
  | 'trial' // free trial running
  | 'trial_grace' // trial over, full access for a few more days
  | 'trial_ended' // trial over: Free plan
  | 'active' // paid up
  | 'past_due' // payment failed, still within the grace period
  | 'canceled'; // cancelled and the paid time is over: Free plan

export interface SubLike {
  tier: Tier;
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  seats: number;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  updatedAt?: Date;
}

export const TRIAL_GRACE_DAYS = 3;
export const PAST_DUE_GRACE_DAYS = 7;
const DAY = 86400_000;

export interface Plan {
  /** The plan the company is treated as being on right now (Free once a trial or payment has lapsed). */
  tier: Tier;
  /** The plan they chose or trialled. */
  chosen: Tier;
  state: PlanState;
  /** When full access ends, for the grace states. */
  graceEndsAt: Date | null;
  seatLimit: number;
}

/**
 * What a company may use today. A trial gives the Gold plan for 14 days, then 3 more days of grace; after that
 * the company is on Free. A failed payment keeps the plan for 7 days. Lapsing never deletes anything: it only
 * locks gated features to read-only and stops new invitations beyond the Free limit.
 */
export function planOf(sub: SubLike, now = new Date()): Plan {
  const free = (state: PlanState, graceEndsAt: Date | null = null): Plan => ({
    tier: 'FREE',
    chosen: sub.tier,
    state,
    graceEndsAt,
    seatLimit: PLAN_LIMITS.FREE.seats,
  });
  const keep = (state: PlanState, graceEndsAt: Date | null = null): Plan => ({
    tier: sub.tier,
    chosen: sub.tier,
    state,
    graceEndsAt,
    seatLimit: Math.min(sub.seats, PLAN_LIMITS[sub.tier].seats),
  });

  switch (sub.status) {
    case 'TRIALING': {
      if (!sub.trialEndsAt || sub.trialEndsAt > now) return keep('trial');
      const grace = new Date(
        sub.trialEndsAt.getTime() + TRIAL_GRACE_DAYS * DAY,
      );
      return now <= grace ? keep('trial_grace', grace) : free('trial_ended');
    }
    case 'ACTIVE':
      return keep('active');
    case 'PAST_DUE': {
      const from = sub.currentPeriodEnd ?? sub.updatedAt ?? now;
      const grace = new Date(from.getTime() + PAST_DUE_GRACE_DAYS * DAY);
      return now <= grace ? keep('past_due', grace) : free('canceled');
    }
    default:
      // Cancelled: paid time already bought still counts.
      return sub.currentPeriodEnd && sub.currentPeriodEnd > now
        ? keep('active', sub.currentPeriodEnd)
        : free('canceled');
  }
}

/** What each plan unlocks, for the billing page. Keep in step with the checks in the payroll and leave code. */
export const PLAN_FEATURES: { tier: Tier; seats: number; items: string[] }[] = [
  {
    tier: 'FREE',
    seats: PLAN_LIMITS.FREE.seats,
    items: [
      'Calendar, leave and work from home',
      'Notices, documents and org chart',
    ],
  },
  {
    tier: 'BRONZE',
    seats: PLAN_LIMITS.BRONZE.seats,
    items: ['Everything in Free', 'More people'],
  },
  {
    tier: 'SILVER',
    seats: PLAN_LIMITS.SILVER.seats,
    items: [
      'Everything in Bronze',
      'Payroll and payslips',
      'Multi-step approvals',
    ],
  },
  {
    tier: 'GOLD',
    seats: PLAN_LIMITS.GOLD.seats,
    items: ['Everything in Silver', 'UK and Sri Lanka tax rules'],
  },
  {
    tier: 'PLATINUM',
    seats: Number.MAX_SAFE_INTEGER,
    items: ['Everything in Gold', 'Unlimited people'],
  },
];
