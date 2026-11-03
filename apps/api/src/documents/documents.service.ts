import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PDFDocument } from 'pdf-lib';
import { PrismaService, Tx } from '../prisma/prisma.service';
import type { Ctx } from '../common/ctx';
import { can } from '../org/permissions';
import { decryptJson } from '../common/field-crypto';
import { notify } from '../notifications/notify';
import { FileStore } from './file-store';
import { FIELDS, fill, longDate, parse, slug } from './merge';
import { renderPdf } from './pdf';
import {
  DocDecisionDto,
  DocRequestDto,
  IssueDto,
  PreviewDto,
  SealDto,
  TemplateDto,
  TemplateUpdateDto,
} from './dto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const newCode = () => {
  const b = randomBytes(12);
  const s = [...b].map((x) => CROCKFORD[x % 32]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
};

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private files: FileStore,
  ) {}

  private audit(tx: Tx, c: Ctx, action: string, targetId: string) {
    return tx.auditLog.create({
      data: { tenantId: c.tenantId, actorId: c.memberId, action, targetId },
    });
  }

  fields() {
    return Object.entries(FIELDS).map(([name, label]) => ({ name, label }));
  }

  // ───────────── templates ─────────────

  private check(body: string) {
    const p = parse(body);
    if (p.unknown.length)
      throw new BadRequestException(
        `Unknown merge field${p.unknown.length > 1 ? 's' : ''}: ${p.unknown.map((u) => `{{${u}}}`).join(', ')}`,
      );
    return p;
  }

  templates(c: Ctx) {
    return this.prisma.withTenant(c.tenantId, (tx) =>
      tx.documentTemplate.findMany({
        where: { archived: false },
        orderBy: { name: 'asc' },
      }),
    );
  }

  requestable(c: Ctx) {
    return this.prisma.withTenant(c.tenantId, (tx) =>
      tx.documentTemplate.findMany({
        where: { archived: false, requestable: true },
        select: { id: true, name: true, kind: true },
        orderBy: { name: 'asc' },
      }),
    );
  }

  createTemplate(c: Ctx, dto: TemplateDto) {
    const p = this.check(dto.body);
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const t = await tx.documentTemplate.create({
        data: {
          tenantId: c.tenantId,
          name: dto.name,
          kind: dto.kind,
          format: 'text',
          html: dto.body,
          fields: p.fields,
          requestable: dto.requestable ?? false,
          createdById: c.memberId,
        },
      });
      await this.audit(tx, c, 'document.template.create', t.id);
      return t;
    });
  }

  updateTemplate(c: Ctx, id: string, dto: TemplateUpdateDto) {
    const p = dto.body !== undefined ? this.check(dto.body) : null;
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const cur = await tx.documentTemplate.findFirst({
        where: { id, archived: false },
      });
      if (!cur) throw new NotFoundException('Template not found');
      const changed = dto.body !== undefined && dto.body !== cur.html;
      const t = await tx.documentTemplate.update({
        where: { id },
        data: {
          name: dto.name,
          requestable: dto.requestable,
          ...(changed && p
            ? { html: dto.body, fields: p.fields, version: cur.version + 1 }
            : {}),
        },
      });
      await this.audit(tx, c, 'document.template.update', id);
      return t;
    });
  }

  archiveTemplate(c: Ctx, id: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const r = await tx.documentTemplate.updateMany({
        where: { id, archived: false },
        data: { archived: true, requestable: false },
      });
      if (!r.count) throw new NotFoundException('Template not found');
      await this.audit(tx, c, 'document.template.archive', id);
      return { archived: true };
    });
  }

  // ───────────── stamp and signatures ─────────────

  async addSeal(c: Ctx, dto: SealDto) {
    const bytes = Buffer.from(dto.imageBase64, 'base64');
    if (bytes.length > 1_000_000)
      throw new BadRequestException('The image is larger than 1 MB');
    try {
      // Rejects anything that is not a real PNG before it is stored.
      const probe = await PDFDocument.create();
      await probe.embedPng(bytes);
    } catch {
      throw new BadRequestException(
        'The image must be a valid PNG (a transparent background works best)',
      );
    }
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      if (dto.kind === 'signature' && !dto.signatoryId)
        throw new BadRequestException(
          'A signature must be tied to the person it belongs to',
        );
      if (dto.signatoryId) {
        const m = await tx.member.findFirst({
          where: { id: dto.signatoryId, status: 'ACTIVE' },
        });
        if (!m) throw new BadRequestException('Unknown signatory');
      }
      const f = await this.files.put(tx, c.tenantId, {
        ownerId: c.memberId,
        purpose: 'seal',
        fileName: `${slug(dto.label)}.png`,
        mimeType: 'image/png',
        bytes,
      });
      const s = await tx.companySeal.create({
        data: {
          tenantId: c.tenantId,
          kind: dto.kind,
          label: dto.label,
          signatoryId: dto.signatoryId,
          fileId: f.id,
        },
      });
      await this.audit(tx, c, 'document.seal.add', s.id);
      return { id: s.id, kind: s.kind, label: s.label, token: this.token(s) };
    });
  }

  private token(s: { kind: string; label: string }) {
    return s.kind === 'stamp' ? '{{stamp}}' : `{{signature.${slug(s.label)}}}`;
  }

  seals(c: Ctx) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const rows = await tx.companySeal.findMany({
        where: { active: true },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map((s) => ({
        id: s.id,
        kind: s.kind,
        label: s.label,
        signatoryId: s.signatoryId,
        token: this.token(s),
      }));
    });
  }

  removeSeal(c: Ctx, id: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const r = await tx.companySeal.updateMany({
        where: { id, active: true },
        data: { active: false },
      });
      if (!r.count) throw new NotFoundException('Stamp or signature not found');
      await this.audit(tx, c, 'document.seal.remove', id);
      return { removed: true };
    });
  }

  // ───────────── generating ─────────────

  private async values(tx: Tx, c: Ctx, templateId: string, memberId: string) {
    const [t, m, tenant] = await Promise.all([
      tx.documentTemplate.findFirst({
        where: { id: templateId, archived: false },
      }),
      tx.member.findFirst({
        where: { id: memberId },
        include: { jobRole: true, department: true },
      }),
      tx.tenant.findUniqueOrThrow({ where: { id: c.tenantId } }),
    ]);
    if (!t) throw new NotFoundException('Template not found');
    if (!m) throw new NotFoundException('Member not found');

    const v: Record<string, string> = {
      'member.full_name': `${m.firstName} ${m.lastName}`,
      'member.first_name': m.firstName,
      'member.last_name': m.lastName,
      'member.employee_no': m.employeeNo ?? '',
      'member.work_email': m.workEmail,
      'member.job_title': m.jobRole?.name ?? '',
      'member.department': m.department?.name ?? '',
      'member.start_date': m.startDate ? longDate(m.startDate) : '',
      'member.end_date': m.endDate ? longDate(m.endDate) : '',
      'member.employment_type': m.employmentType
        .toLowerCase()
        .replace('_', '-'),
      'company.name': tenant.displayName,
      'company.legal_name': tenant.legalName,
      today: longDate(new Date()),
    };
    const sensitive = t.fields.some((f) => f.startsWith('salary.'));
    if (sensitive) {
      if (!can(c.subject, 'payroll.view'))
        throw new ForbiddenException(
          'This template includes salary, which needs payroll access',
        );
      const s = await tx.salaryStructure.findFirst({
        where: { memberId },
        include: { payGroup: true },
      });
      if (!s)
        throw new BadRequestException(
          'This person has no salary set up in payroll',
        );
      v['salary.basic_monthly'] = new Intl.NumberFormat('en-GB', {
        minimumFractionDigits: 2,
      }).format(decryptJson<number>(c.tenantId, s.basicEnc));
      v['salary.currency'] = s.payGroup.currency;
    }
    return { t, m, tenant, v, sensitive };
  }

  preview(c: Ctx, dto: PreviewDto) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const { t, v } = await this.values(tx, c, dto.templateId, dto.memberId);
      const p = parse(t.html ?? '');
      return {
        title: t.name,
        text: fill(t.html ?? '', v),
        needsStamp: p.stamp,
        needsSignatures: p.signatures,
      };
    });
  }

  issue(c: Ctx, dto: IssueDto) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const { t, m, tenant, v, sensitive } = await this.values(
        tx,
        c,
        dto.templateId,
        dto.memberId,
      );
      const p = parse(t.html ?? '');

      const chosen = dto.sealIds?.length
        ? await tx.companySeal.findMany({
            where: { id: { in: dto.sealIds }, active: true },
          })
        : [];
      if (chosen.length !== (dto.sealIds?.length ?? 0))
        throw new BadRequestException(
          'A chosen stamp or signature is not available',
        );
      const stamp = chosen.find((s) => s.kind === 'stamp');
      if (p.stamp && !stamp)
        throw new BadRequestException('This template needs the company stamp');
      const sigs = p.signatures.map((name) => {
        const s = chosen.find(
          (x) => x.kind === 'signature' && slug(x.label) === name,
        );
        if (!s)
          throw new BadRequestException(
            `This template needs the signature "${name}"`,
          );
        return s;
      });

      let request: { id: string; details: unknown } | null = null;
      if (dto.requestId) {
        const r = await tx.request.findFirst({
          where: { id: dto.requestId, type: 'DOCUMENT' },
        });
        const d = (r?.details ?? {}) as { templateId?: string };
        if (
          !r ||
          r.status !== 'APPROVED' ||
          r.requesterId !== m.id ||
          d.templateId !== t.id
        )
          throw new BadRequestException(
            'That request is not an approved request for this person and template',
          );
        request = r;
      }

      const grab = async (s: { fileId: string; label: string }) => ({
        label: s.label,
        bytes: (await this.files.get(tx, c.tenantId, s.fileId)).bytes,
      });
      const code = newCode();
      const base = process.env.WEB_URL ?? 'http://localhost:3000';
      const pdf = await renderPdf({
        company: tenant.legalName,
        title: t.name,
        body: fill(t.html ?? '', v),
        stamp: stamp ? await grab(stamp) : undefined,
        signatures: await Promise.all(sigs.map(grab)),
        verifyUrl: `${base}/verify/${code}`,
        code,
      });
      const file = await this.files.put(tx, c.tenantId, {
        ownerId: m.id,
        purpose: 'document',
        fileName: `${slug(t.name)}-${slug(m.lastName)}.pdf`,
        mimeType: 'application/pdf',
        bytes: pdf,
      });

      // The snapshot never keeps salary figures; they live in the (encrypted) PDF only.
      const snapshot = Object.fromEntries(
        Object.entries(v).filter(([k]) => !k.startsWith('salary.')),
      );
      const doc = await tx.issuedDocument.create({
        data: {
          tenantId: c.tenantId,
          templateId: t.id,
          templateVer: t.version,
          subjectId: m.id,
          requestId: dto.requestId,
          issuedById: c.memberId,
          fileId: file.id,
          sealIds: chosen.map((s) => s.id),
          verifyCode: code,
          data: { ...snapshot, containsSalary: sensitive },
        },
      });
      if (request)
        await tx.request.update({
          where: { id: request.id },
          data: {
            details: {
              ...(request.details ?? {}),
              documentId: doc.id,
            },
          },
        });
      if (m.id !== c.memberId)
        await notify(tx, c.tenantId, [m.id], {
          event: 'document.issued',
          title: `Your ${t.name} is ready`,
          link: '/documents',
        });
      await this.audit(tx, c, 'document.issue', doc.id);
      return { id: doc.id, verifyCode: code };
    });
  }

  list(c: Ctx, memberId?: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const issuer = can(c.subject, 'document.issue');
      const rows = await tx.issuedDocument.findMany({
        where: {
          ...(issuer
            ? memberId
              ? { subjectId: memberId }
              : {}
            : { subjectId: c.memberId, revokedAt: null }),
        },
        orderBy: { issuedAt: 'desc' },
        take: 200,
        include: {
          template: { select: { name: true, kind: true } },
          subject: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      return rows.map((d) => ({
        id: d.id,
        name: d.template.name,
        kind: d.template.kind,
        subject: d.subject,
        issuedAt: d.issuedAt,
        revokedAt: d.revokedAt,
        verifyCode: d.verifyCode,
      }));
    });
  }

  pdf(c: Ctx, id: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const d = await tx.issuedDocument.findFirst({
        where: { id },
        include: { template: { select: { name: true } } },
      });
      const issuer = can(c.subject, 'document.issue');
      if (!d || !(issuer || (d.subjectId === c.memberId && !d.revokedAt)))
        throw new NotFoundException('Document not found');
      const { bytes, file } = await this.files.get(tx, c.tenantId, d.fileId);
      if (d.subjectId !== c.memberId)
        await this.audit(tx, c, 'document.view', id);
      return { bytes, fileName: file.fileName };
    });
  }

  revoke(c: Ctx, id: string) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const r = await tx.issuedDocument.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (!r.count) throw new NotFoundException('Document not found');
      await this.audit(tx, c, 'document.revoke', id);
      return { revoked: true };
    });
  }

  /** Public check page: no sign-in and no personal data. */
  async verify(code: string) {
    const d = await this.prisma.system.issuedDocument.findUnique({
      where: { verifyCode: code.toUpperCase() },
      include: {
        template: { select: { name: true } },
        tenant: { select: { displayName: true } },
      },
    });
    if (!d) return { valid: false as const, found: false as const };
    return {
      valid: !d.revokedAt,
      found: true as const,
      revoked: !!d.revokedAt,
      document: d.template.name,
      company: d.tenant.displayName,
      issuedAt: d.issuedAt,
    };
  }

  // ───────────── requests for documents ─────────────

  createRequest(c: Ctx, dto: DocRequestDto) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const t = await tx.documentTemplate.findFirst({
        where: { id: dto.templateId, archived: false, requestable: true },
      });
      if (!t) throw new NotFoundException('That document cannot be requested');
      const open = await tx.request.count({
        where: {
          type: 'DOCUMENT',
          requesterId: c.memberId,
          status: 'PENDING',
          details: { path: ['templateId'], equals: t.id },
        },
      });
      if (open)
        throw new ConflictException(
          'You already have a pending request for this',
        );
      const r = await tx.request.create({
        data: {
          tenantId: c.tenantId,
          type: 'DOCUMENT',
          status: 'PENDING',
          requesterId: c.memberId,
          reason: dto.purpose,
          details: { templateId: t.id, templateName: t.name },
        },
      });
      await this.audit(tx, c, 'document.request', r.id);
      return r;
    });
  }

  myRequests(c: Ctx) {
    return this.prisma.withTenant(c.tenantId, (tx) =>
      tx.request.findMany({
        where: { type: 'DOCUMENT', requesterId: c.memberId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );
  }

  inbox(c: Ctx) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const rows = await tx.request.findMany({
        where: {
          type: 'DOCUMENT',
          status: 'PENDING',
          requesterId: { not: c.memberId },
        },
        orderBy: { createdAt: 'asc' },
        include: {
          requester: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              departmentId: true,
            },
          },
        },
      });
      return rows.filter((r) =>
        can(c.subject, 'document.request.approve', {
          departmentId: r.requester.departmentId,
          memberId: r.requesterId,
        }),
      );
    });
  }

  decide(c: Ctx, id: string, dto: DocDecisionDto) {
    return this.prisma.withTenant(c.tenantId, async (tx) => {
      const r = await tx.request.findFirst({
        where: { id, type: 'DOCUMENT', status: 'PENDING' },
        include: { requester: { select: { departmentId: true } } },
      });
      if (!r) throw new NotFoundException('No pending request with that id');
      if (r.requesterId === c.memberId)
        throw new ForbiddenException('You cannot decide your own request');
      if (
        !can(c.subject, 'document.request.approve', {
          departmentId: r.requester.departmentId,
          memberId: r.requesterId,
        })
      )
        throw new ForbiddenException('You cannot decide this request');
      if (dto.decision === 'REJECTED' && !dto.comment?.trim())
        throw new BadRequestException('Please say why, so the person knows');
      await tx.approvalAction.create({
        data: {
          tenantId: c.tenantId,
          requestId: id,
          step: 0,
          actorId: c.memberId,
          decision: dto.decision,
          comment: dto.comment,
        },
      });
      const u = await tx.request.update({
        where: { id },
        data: { status: dto.decision, decidedAt: new Date() },
      });
      const d = (r.details ?? {}) as { templateName?: string };
      await notify(tx, c.tenantId, [r.requesterId], {
        event: `document.request.${dto.decision.toLowerCase()}`,
        title:
          dto.decision === 'APPROVED'
            ? `Your request for ${d.templateName ?? 'a document'} was approved`
            : `Your request for ${d.templateName ?? 'a document'} was declined`,
        body: dto.comment,
        link: '/documents',
      });
      await this.audit(
        tx,
        c,
        `document.request.${dto.decision.toLowerCase()}`,
        id,
      );
      return u;
    });
  }
}
