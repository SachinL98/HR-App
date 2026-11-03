import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export type Tx = Prisma.TransactionClient;

function client(url: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

/**
 * Two connections:
 *  - `withTenant` runs as hr_app inside a transaction with app.tenant_id set,
 *    so PostgreSQL row-level security isolates every query to one company.
 *  - `system` runs as hr_system (BYPASSRLS) and is only for lookups that
 *    happen before a tenant is known (login, invite tokens).
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly app = client(
    process.env.DATABASE_URL ?? 'postgresql://hr_app:pw@localhost:5432/hr',
  );
  readonly system = client(
    process.env.DATABASE_SYSTEM_URL ??
      'postgresql://hr_system:pw@localhost:5432/hr',
  );

  withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }

  async onModuleDestroy() {
    await Promise.all([this.app.$disconnect(), this.system.$disconnect()]);
  }
}
