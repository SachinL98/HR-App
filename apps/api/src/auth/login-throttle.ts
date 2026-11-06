import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Failed-attempt counters kept in the database (not in memory) so a lockout holds across servers,
 * restarts and serverless instances. Five misses lock a key; each repeat doubles the wait up to 16x.
 */
const LOCK_AFTER = 5;

@Injectable()
export class LoginThrottle {
  constructor(private prisma: PrismaService) {}

  /** Seconds left on the lock, or 0 when the key is free. */
  async lockedFor(key: string): Promise<number> {
    const r = await this.prisma.system.loginThrottle.findUnique({
      where: { key },
    });
    if (!r?.lockedUntil) return 0;
    const left = r.lockedUntil.getTime() - Date.now();
    return left > 0 ? Math.ceil(left / 1000) : 0;
  }

  async fail(key: string, baseMinutes: number, doubling: boolean) {
    const r = await this.prisma.system.loginThrottle.findUnique({
      where: { key },
    });
    let fails = (r?.fails ?? 0) + 1;
    let round = r?.round ?? 0;
    let lockedUntil = r?.lockedUntil ?? null;
    if (fails >= LOCK_AFTER) {
      const mult = doubling ? 2 ** Math.min(round, 4) : 1;
      lockedUntil = new Date(Date.now() + baseMinutes * 60_000 * mult);
      round += 1;
      fails = 0;
    }
    await this.prisma.system.loginThrottle.upsert({
      where: { key },
      create: { key, fails, round, lockedUntil },
      update: { fails, round, lockedUntil },
    });
  }

  async clear(key: string) {
    await this.prisma.system.loginThrottle.deleteMany({ where: { key } });
  }
}
