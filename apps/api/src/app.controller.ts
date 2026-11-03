import { Controller, Get } from '@nestjs/common';
import { Public } from './common/ctx';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  health() {
    return { ok: true };
  }
}
