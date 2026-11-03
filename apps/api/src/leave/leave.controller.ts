import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentCtx, RequirePermission } from '../common/ctx';
import type { Ctx } from '../common/ctx';
import { LeaveService } from './leave.service';
import { CreateRequestDto, DecisionDto } from './dto';

class StepDto {
  @IsIn(['manager', 'dept_head', 'member', 'permission']) kind!:
    'manager' | 'dept_head' | 'member' | 'permission';
  @IsOptional() @IsUUID() memberId?: string;
  @IsOptional() @IsString() action?: string;
}
class WorkflowDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepDto)
  steps!: StepDto[];
}

@Controller()
export class LeaveController {
  constructor(private svc: LeaveService) {}

  @Get('balances/me')
  balances(@CurrentCtx() c: Ctx, @Query('on') on?: string) {
    return this.svc.balances(c, on);
  }

  @Post('requests')
  create(@CurrentCtx() c: Ctx, @Body() dto: CreateRequestDto) {
    return this.svc.create(c, dto);
  }

  @Get('requests/mine')
  mine(@CurrentCtx() c: Ctx) {
    return this.svc.mine(c);
  }

  @Get('requests/inbox')
  inbox(@CurrentCtx() c: Ctx) {
    return this.svc.inbox(c);
  }

  @Get('requests/:id')
  get(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(c, id);
  }

  @Post('requests/:id/decision')
  decide(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecisionDto,
  ) {
    return this.svc.decide(c, id, dto);
  }

  @Post('requests/:id/cancel')
  cancel(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.cancel(c, id);
  }

  @Get('workflows/:type')
  getWorkflow(@CurrentCtx() c: Ctx, @Param('type') type: string) {
    return this.svc.getWorkflow(c, type === 'wfh' ? 'WFH' : 'LEAVE');
  }

  @Put('workflows/:type')
  @RequirePermission('leave.approve')
  setWorkflow(
    @CurrentCtx() c: Ctx,
    @Param('type') type: string,
    @Body() dto: WorkflowDto,
  ) {
    return this.svc.setWorkflow(c, type === 'wfh' ? 'WFH' : 'LEAVE', dto.steps);
  }
}
