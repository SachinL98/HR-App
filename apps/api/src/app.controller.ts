import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './common/ctx';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private prisma: PrismaService) {}

  /** Is the process up? Use for liveness. */
  @Public()
  @Get('health')
  health() {
    return { ok: true };
  }

  /** Can it serve traffic? Checks the database. Use for readiness and load balancers. */
  @Public()
  @Get('health/ready')
  async ready() {
    try {
      await this.prisma.system.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch {
      throw new ServiceUnavailableException('Database is not reachable');
    }
  }
}
