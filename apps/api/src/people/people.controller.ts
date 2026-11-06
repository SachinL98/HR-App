import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { PDFDocument } from 'pdf-lib';
import { CurrentCtx, RequirePermission } from '../common/ctx';
import type { Ctx } from '../common/ctx';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { can } from '../org/permissions';
import { notify } from '../notifications/notify';
import { FileStore } from '../documents/file-store';
import {
  ChecklistTemplateDto,
  MemberDocumentDto,
  StartChecklistDto,
  TaskDoneDto,
} from './dto';

interface Item {
  title: string;
  who: 'employee' | 'manager' | 'hr';
  dueDays?: number;
}

const FILE_MAX = 1_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Everything about a person that is more than a row in the People list: checklists and kept documents. */
@Controller()
export class PeopleController {
  constructor(
    private prisma: PrismaService,
    private files: FileStore,
  ) {}

  private audit(tx: Tx, c: Ctx, action: string, targetId?: string) {
    return tx.auditLog.create({
      data: { tenantId: c.tenantId, actorId: c.memberId, action, targetId },
    });
  }

  private async member(tx: Tx, id: string) {
    const m = await tx.member.findFirst({ where: { id } });
    if (!m) throw new NotFoundException('Member not found');
    return m;
  }

  // ───────────── checklist templates ─────────────

  @Get('checklist-templates')
  @RequirePermission('checklist.manage')
  templates(@CurrentCtx() c: Ctx) {
    return this.prisma.withTenant(c.tenantId, (tx) =>
      tx.checklistTemplate.findMany({
        where: { archived: false },
        orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      }),
    );
  }

  @Post('checklist-templates')
  @RequirePermission('checklist.manage')
  createTemplate(@CurrentCtx() c: Ctx, @Body() dto: ChecklistTemplateDto) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const t = await tx.checklistTemplate.create({
        data: {
          tenantId: c.tenantId,
          name: dto.name,
          kind: dto.kind,
          items: dto.items.map((i) => ({ ...i })),
        },
      });
      await this.audit(tx, c, 'checklist.template.create', t.id);
      return t;
    });
  }

  @Delete('checklist-templates/:id')
  @RequirePermission('checklist.manage')
  archiveTemplate(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const r = await tx.checklistTemplate.updateMany({
        where: { id, archived: false },
        data: { archived: true },
      });
      if (!r.count) throw new NotFoundException('Template not found');
      await this.audit(tx, c, 'checklist.template.archive', id);
      return { ok: true };
    });
  }

  // ───────────── checklists for a person ─────────────

  @Post('members/:id/checklists')
  @RequirePermission('checklist.manage')
  start(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StartChecklistDto,
  ) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const m = await this.member(tx, id);
      const t = await tx.checklistTemplate.findFirst({
        where: { id: dto.templateId, archived: false },
      });
      if (!t) throw new NotFoundException('Template not found');
      const items = t.items as unknown as Item[];
      const today = new Date();
      const list = await tx.checklist.create({
        data: {
          tenantId: c.tenantId,
          memberId: m.id,
          name: t.name,
          kind: t.kind,
          startedById: c.memberId,
          tasks: {
            create: items.map((i, n) => ({
              tenantId: c.tenantId,
              title: i.title,
              who: i.who,
              // A task for the line manager of someone with no manager falls back to HR.
              assigneeId:
                i.who === 'employee'
                  ? m.id
                  : i.who === 'manager'
                    ? m.managerId
                    : null,
              dueDate:
                i.dueDays === undefined
                  ? null
                  : new Date(
                      `${isoDay(new Date(today.getTime() + i.dueDays * 86400_000))}T00:00:00Z`,
                    ),
              position: n,
            })),
          },
        },
        include: { tasks: true },
      });
      const count = new Map<string, number>();
      for (const task of list.tasks)
        if (task.assigneeId && task.assigneeId !== c.memberId)
          count.set(task.assigneeId, (count.get(task.assigneeId) ?? 0) + 1);
      for (const [who, n] of count)
        await notify(tx, c.tenantId, [who], {
          event: 'checklist.assigned',
          title: `${n} task${n === 1 ? '' : 's'} for ${t.name}: ${m.firstName} ${m.lastName}`,
          link: '/dashboard',
        });
      await this.audit(tx, c, 'checklist.start', list.id);
      return { id: list.id, tasks: list.tasks.length };
    });
  }

  @Get('members/:id/checklists')
  forMember(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const m = await this.member(tx, id);
      const allowed =
        id === c.memberId ||
        m.managerId === c.memberId ||
        can(c.subject, 'checklist.manage');
      if (!allowed) throw new ForbiddenException();
      const lists = await tx.checklist.findMany({
        where: { memberId: id },
        orderBy: { createdAt: 'desc' },
        include: { tasks: { orderBy: { position: 'asc' } } },
      });
      const people = await tx.member.findMany({
        where: {
          id: {
            in: lists.flatMap((l) =>
              l.tasks.map((t) => t.assigneeId).filter(Boolean),
            ) as string[],
          },
        },
        select: { id: true, firstName: true, lastName: true },
      });
      const name = new Map(
        people.map((p) => [p.id, `${p.firstName} ${p.lastName}`]),
      );
      return lists.map((l) => ({
        id: l.id,
        name: l.name,
        kind: l.kind,
        createdAt: l.createdAt,
        tasks: l.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          who: t.who,
          assignee: t.assigneeId ? (name.get(t.assigneeId) ?? null) : null,
          dueDate: t.dueDate,
          doneAt: t.doneAt,
          // Whether the viewer may tick it off.
          canTick:
            t.assigneeId === c.memberId || can(c.subject, 'checklist.manage'),
        })),
      }));
    });
  }

  /** Open tasks waiting on me (and, for people who manage checklists, the ones nobody owns). */
  @Get('checklists/mine')
  mine(@CurrentCtx() c: Ctx) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const manager = can(c.subject, 'checklist.manage');
      const rows = await tx.checklistTask.findMany({
        where: {
          doneAt: null,
          OR: [
            { assigneeId: c.memberId },
            ...(manager ? [{ assigneeId: null }] : []),
          ],
        },
        orderBy: [{ dueDate: 'asc' }, { position: 'asc' }],
        take: 50,
        include: {
          checklist: {
            select: {
              name: true,
              member: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      });
      return rows.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        checklist: t.checklist.name,
        member: t.checklist.member,
      }));
    });
  }

  @Post('checklist-tasks/:id/done')
  tick(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TaskDoneDto,
  ) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const t = await tx.checklistTask.findFirst({ where: { id } });
      if (!t) throw new NotFoundException('Task not found');
      if (t.assigneeId !== c.memberId && !can(c.subject, 'checklist.manage'))
        throw new ForbiddenException('This task is not yours');
      await tx.checklistTask.update({
        where: { id },
        data: dto.done
          ? { doneAt: new Date(), doneById: c.memberId }
          : { doneAt: null, doneById: null },
      });
      await this.audit(
        tx,
        c,
        dto.done ? 'checklist.task.done' : 'checklist.task.undo',
        id,
      );
      return { ok: true };
    });
  }

  // ───────────── documents kept on a profile ─────────────

  private sniff(bytes: Buffer): { mime: string; ext: string } {
    if (bytes.subarray(0, 5).toString('latin1') === '%PDF-')
      return { mime: 'application/pdf', ext: 'pdf' };
    if (bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a')
      return { mime: 'image/png', ext: 'png' };
    if (bytes.subarray(0, 3).toString('hex') === 'ffd8ff')
      return { mime: 'image/jpeg', ext: 'jpg' };
    throw new BadRequestException('The file must be a PDF, PNG or JPEG');
  }

  @Post('members/:id/documents')
  @RequirePermission('member.manage')
  addDocument(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MemberDocumentDto,
  ) {
    const bytes = Buffer.from(dto.fileBase64, 'base64');
    if (!bytes.length || bytes.length > FILE_MAX)
      throw new BadRequestException(
        'The file must be larger than 0 and at most 1.4 MB',
      );
    const type = this.sniff(bytes);
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const m = await this.member(tx, id);
      if (
        !can(c.subject, 'member.manage', {
          memberId: m.id,
          departmentId: m.departmentId,
        })
      )
        throw new ForbiddenException();
      if (type.mime === 'application/pdf') {
        try {
          const pdf = await PDFDocument.load(bytes);
          if (pdf.getPageCount() > 100) throw new Error('long');
        } catch {
          throw new BadRequestException('That PDF could not be read');
        }
      }
      const f = await this.files.put(tx, c.tenantId, {
        ownerId: m.id,
        purpose: 'member_doc',
        fileName: dto.fileName.replace(/[^\w. -]/g, '_').slice(0, 100),
        mimeType: type.mime,
        bytes,
      });
      const d = await tx.memberDocument.create({
        data: {
          tenantId: c.tenantId,
          memberId: m.id,
          title: dto.title,
          kind: dto.kind,
          fileId: f.id,
          visibleToMember: dto.visibleToMember ?? true,
          uploadedById: c.memberId,
        },
      });
      await this.audit(tx, c, 'member.document.add', d.id);
      return { id: d.id };
    });
  }

  @Get('members/:id/documents')
  listDocuments(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const m = await this.member(tx, id);
      const admin = can(c.subject, 'member.manage', {
        memberId: m.id,
        departmentId: m.departmentId,
      });
      if (!admin && id !== c.memberId) throw new ForbiddenException();
      const rows = await tx.memberDocument.findMany({
        where: { memberId: id, ...(admin ? {} : { visibleToMember: true }) },
        orderBy: { createdAt: 'desc' },
        include: { member: { select: { id: true } } },
      });
      return rows.map((d) => ({
        id: d.id,
        title: d.title,
        kind: d.kind,
        visibleToMember: d.visibleToMember,
        createdAt: d.createdAt,
      }));
    });
  }

  @Get('member-documents/:id/file')
  async file(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const out = await this.prisma.withTenant(c.tenantId, async (tx) => {
      const d = await tx.memberDocument.findFirst({
        where: { id },
        include: { member: { select: { id: true, departmentId: true } } },
      });
      const admin =
        !!d &&
        can(c.subject, 'member.manage', {
          memberId: d.member.id,
          departmentId: d.member.departmentId,
        });
      const own = !!d && d.memberId === c.memberId && d.visibleToMember;
      if (!d || !(admin || own))
        throw new NotFoundException('Document not found');
      const { bytes, file } = await this.files.get(tx, c.tenantId, d.fileId);
      if (d.memberId !== c.memberId)
        await this.audit(tx, c, 'member.document.view', id);
      return { bytes, file };
    });
    res.set({
      'Content-Type': out.file.mimeType,
      'Content-Disposition': `inline; filename="${out.file.fileName.replace(/[^\w. -]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(out.bytes);
  }

  @Delete('member-documents/:id')
  @RequirePermission('member.manage')
  removeDocument(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const d = await tx.memberDocument.findFirst({
        where: { id },
        include: { member: { select: { id: true, departmentId: true } } },
      });
      if (
        !d ||
        !can(c.subject, 'member.manage', {
          memberId: d.member.id,
          departmentId: d.member.departmentId,
        })
      )
        throw new NotFoundException('Document not found');
      await tx.memberDocument.delete({ where: { id } });
      await this.audit(tx, c, 'member.document.remove', id);
      return { ok: true };
    });
  }
}
