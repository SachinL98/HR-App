import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentCtx, RequirePermission } from '../common/ctx';
import type { Ctx } from '../common/ctx';
import { PayrollService } from './payroll.service';
import { CreateRunDto, PayGroupDto, SalaryDto } from './dto';

@Controller()
export class PayrollController {
  constructor(private svc: PayrollService) {}

  @Get('pay-groups')
  @RequirePermission('payroll.view')
  payGroups(@CurrentCtx() c: Ctx) {
    return this.svc.payGroups(c);
  }

  @Post('pay-groups')
  @RequirePermission('payroll.manage')
  createPayGroup(@CurrentCtx() c: Ctx, @Body() dto: PayGroupDto) {
    return this.svc.createPayGroup(c, dto);
  }

  @Get('payroll/salaries')
  @RequirePermission('payroll.view')
  salaries(@CurrentCtx() c: Ctx) {
    return this.svc.salaries(c);
  }

  @Put('members/:id/salary')
  @RequirePermission('payroll.manage')
  setSalary(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SalaryDto,
  ) {
    return this.svc.setSalary(c, id, dto);
  }

  @Get('payroll/runs')
  @RequirePermission('payroll.view')
  runs(@CurrentCtx() c: Ctx) {
    return this.svc.runs(c);
  }

  @Post('payroll/runs')
  @RequirePermission('payroll.manage')
  createRun(@CurrentCtx() c: Ctx, @Body() dto: CreateRunDto) {
    return this.svc.createRun(c, dto);
  }

  @Get('payroll/runs/:id')
  @RequirePermission('payroll.view')
  run(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.run(c, id);
  }

  @Post('payroll/runs/:id/recompute')
  @RequirePermission('payroll.manage')
  recompute(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.recompute(c, id);
  }

  @Post('payroll/runs/:id/submit')
  @RequirePermission('payroll.manage')
  submit(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.move(c, id, 'IN_REVIEW');
  }

  @Post('payroll/runs/:id/approve')
  @RequirePermission('payroll.manage')
  approve(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.move(c, id, 'APPROVED');
  }

  @Post('payroll/runs/:id/reopen')
  @RequirePermission('payroll.manage')
  reopen(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.move(c, id, 'DRAFT');
  }

  @Post('payroll/runs/:id/finalize')
  @RequirePermission('payroll.manage')
  finalize(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.move(c, id, 'FINALIZED');
  }

  @Get('payslips/mine')
  mine(@CurrentCtx() c: Ctx) {
    return this.svc.minePayslips(c);
  }

  @Get('payslips/:id')
  payslip(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.payslip(c, id);
  }
}
