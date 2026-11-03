import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentCtx, Public, RequirePermission } from '../common/ctx';
import type { Ctx } from '../common/ctx';
import { DocumentsService } from './documents.service';
import {
  DocDecisionDto,
  DocRequestDto,
  IssueDto,
  PreviewDto,
  SealDto,
  TemplateDto,
  TemplateUpdateDto,
} from './dto';

@Controller()
export class DocumentsController {
  constructor(private svc: DocumentsService) {}

  // templates
  @Get('document-fields')
  fields() {
    return this.svc.fields();
  }

  @Get('document-templates')
  @RequirePermission('document.issue')
  templates(@CurrentCtx() c: Ctx) {
    return this.svc.templates(c);
  }

  @Get('document-templates/requestable')
  requestable(@CurrentCtx() c: Ctx) {
    return this.svc.requestable(c);
  }

  @Post('document-templates')
  @RequirePermission('document.template.manage')
  createTemplate(@CurrentCtx() c: Ctx, @Body() dto: TemplateDto) {
    return this.svc.createTemplate(c, dto);
  }

  @Patch('document-templates/:id')
  @RequirePermission('document.template.manage')
  updateTemplate(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TemplateUpdateDto,
  ) {
    return this.svc.updateTemplate(c, id, dto);
  }

  @Delete('document-templates/:id')
  @RequirePermission('document.template.manage')
  archive(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.archiveTemplate(c, id);
  }

  // stamp and signatures
  @Get('seals')
  @RequirePermission('document.issue')
  seals(@CurrentCtx() c: Ctx) {
    return this.svc.seals(c);
  }

  @Post('seals')
  @RequirePermission('document.template.manage')
  addSeal(@CurrentCtx() c: Ctx, @Body() dto: SealDto) {
    return this.svc.addSeal(c, dto);
  }

  @Delete('seals/:id')
  @RequirePermission('document.template.manage')
  removeSeal(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.removeSeal(c, id);
  }

  // issuing
  @Post('documents/preview')
  @RequirePermission('document.issue')
  preview(@CurrentCtx() c: Ctx, @Body() dto: PreviewDto) {
    return this.svc.preview(c, dto);
  }

  @Post('documents')
  @RequirePermission('document.issue')
  issue(@CurrentCtx() c: Ctx, @Body() dto: IssueDto) {
    return this.svc.issue(c, dto);
  }

  @Get('documents')
  list(@CurrentCtx() c: Ctx, @Query('memberId') memberId?: string) {
    return this.svc.list(c, memberId);
  }

  @Get('documents/:id/pdf')
  async pdf(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { bytes, fileName } = await this.svc.pdf(c, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName.replace(/[^\w.-]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(bytes);
  }

  @Post('documents/:id/revoke')
  @RequirePermission('document.issue')
  revoke(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.revoke(c, id);
  }

  // requests for documents
  @Post('document-requests')
  createRequest(@CurrentCtx() c: Ctx, @Body() dto: DocRequestDto) {
    return this.svc.createRequest(c, dto);
  }

  @Get('document-requests/mine')
  myRequests(@CurrentCtx() c: Ctx) {
    return this.svc.myRequests(c);
  }

  @Get('document-requests/inbox')
  inbox(@CurrentCtx() c: Ctx) {
    return this.svc.inbox(c);
  }

  @Post('document-requests/:id/decision')
  decide(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DocDecisionDto,
  ) {
    return this.svc.decide(c, id, dto);
  }

  // public
  @Public()
  @Get('verify/:code')
  verify(@Param('code') code: string) {
    return this.svc.verify(code.slice(0, 20));
  }
}
