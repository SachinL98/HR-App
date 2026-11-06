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
import { Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import type { Ctx } from '../common/ctx';
import { PayrollService } from './payroll.service';
import { BankDto, CreateRunDto, PayGroupDto, SalaryDto } from './dto';

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

  @Get('members/:id/salary/history')
  @RequirePermission('payroll.view')
  salaryHistory(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.salaryHistory(c, id);
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

  @Get('payroll/bank-status')
  @RequirePermission('payroll.manage')
  bankStatus(@CurrentCtx() c: Ctx) {
    return this.svc.bankStatus(c);
  }

  @Put('members/:id/bank')
  @RequirePermission('payroll.manage')
  setBank(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BankDto,
  ) {
    return this.svc.setBank(c, id, dto);
  }

  @Get('payroll/runs/:id/export/summary')
  @RequirePermission('payroll.view')
  exportSummary(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.csv(c, id, 'summary', res);
  }

  @Get('payroll/runs/:id/export/lines')
  @RequirePermission('payroll.view')
  exportLines(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.csv(c, id, 'lines', res);
  }

  /** Bank account numbers are in this one, so it needs the manage permission. */
  @Get('payroll/runs/:id/export/bank')
  @RequirePermission('payroll.manage')
  exportBank(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.csv(c, id, 'bank', res);
  }

  private async csv(
    c: Ctx,
    id: string,
    kind: 'summary' | 'lines' | 'bank',
    res: Response,
  ) {
    const { csv, fileName } = await this.svc.exportRun(c, id, kind);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(Buffer.from(csv, 'utf8'));
  }

  @Get('payslips/:id/pdf')
  async payslipPdf(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { bytes, fileName } = await this.svc.payslipPdf(c, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(bytes);
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
