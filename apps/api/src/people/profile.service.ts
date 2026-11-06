import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FileStore } from '../documents/file-store';
import { PrismaService, type Tx } from '../prisma/prisma.service';

export const PHOTO_MAX = 400_000;

/** The type of an image from its first bytes (never from what the browser claims). */
export function sniffImage(b: Buffer): { mime: string; ext: string } {
  if (b.subarray(0, 3).toString('hex') === 'ffd8ff')
    return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a')
    return { mime: 'image/png', ext: 'png' };
  if (
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return { mime: 'image/webp', ext: 'webp' };
  throw new BadRequestException('Use a JPG, PNG or WebP photo.');
}

/** A person's own profile: photo and the contact details they can edit themselves. */
@Injectable()
export class ProfileService {
  constructor(
    private prisma: PrismaService,
    private files: FileStore,
  ) {}

  async get(tenantId: string, memberId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const m = await tx.member.findUniqueOrThrow({
        where: { id: memberId },
        select: {
          firstName: true,
          lastName: true,
          preferredName: true,
          phone: true,
          workEmail: true,
          employeeNo: true,
          photoFileId: true,
          jobRole: { select: { name: true } },
          department: { select: { name: true } },
        },
      });
      return {
        firstName: m.firstName,
        lastName: m.lastName,
        preferredName: m.preferredName ?? '',
        phone: m.phone ?? '',
        email: m.workEmail,
        employeeNo: m.employeeNo,
        jobRole: m.jobRole?.name ?? null,
        department: m.department?.name ?? null,
        hasPhoto: !!m.photoFileId,
      };
    });
  }

  update(
    tenantId: string,
    memberId: string,
    d: { preferredName?: string; phone?: string },
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await tx.member.update({
        where: { id: memberId },
        data: {
          ...(d.preferredName !== undefined
            ? { preferredName: d.preferredName.trim() || null }
            : {}),
          ...(d.phone !== undefined ? { phone: d.phone.trim() || null } : {}),
        },
      });
      return { ok: true };
    });
  }

  async setPhoto(tenantId: string, memberId: string, base64: string) {
    const bytes = Buffer.from(base64, 'base64');
    if (!bytes.length) throw new BadRequestException('Choose a photo first.');
    if (bytes.length > PHOTO_MAX)
      throw new BadRequestException(
        'That photo is too large. Try a smaller one.',
      );
    const type = sniffImage(bytes);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const m = await tx.member.findUniqueOrThrow({
        where: { id: memberId },
        select: { photoFileId: true },
      });
      const f = await this.files.put(tx, tenantId, {
        ownerId: memberId,
        purpose: 'avatar',
        fileName: `photo.${type.ext}`,
        mimeType: type.mime,
        bytes,
      });
      await tx.member.update({
        where: { id: memberId },
        data: { photoFileId: f.id },
      });
      if (m.photoFileId)
        await tx.file.deleteMany({ where: { id: m.photoFileId } }); // the old photo's blob goes with it
      return { ok: true };
    });
  }

  removePhoto(tenantId: string, memberId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const m = await tx.member.findUniqueOrThrow({
        where: { id: memberId },
        select: { photoFileId: true },
      });
      await tx.member.update({
        where: { id: memberId },
        data: { photoFileId: null },
      });
      if (m.photoFileId)
        await tx.file.deleteMany({ where: { id: m.photoFileId } });
      return { ok: true };
    });
  }

  /** The photo bytes of anyone in the company, or 404. */
  async photo(tenantId: string, memberId: string) {
    return this.prisma.withTenant(tenantId, async (tx: Tx) => {
      const m = await tx.member.findFirst({
        where: { id: memberId },
        select: { photoFileId: true },
      });
      if (!m?.photoFileId) throw new NotFoundException();
      const { bytes, file } = await this.files.get(tx, tenantId, m.photoFileId);
      return { bytes, mime: file.mimeType };
    });
  }

  /** Looks a member up by work email inside one company (used by the Developer Dashboard integration). */
  async memberIdByEmail(tenantId: string, email: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const m = await tx.member.findFirst({
        where: {
          workEmail: { equals: email, mode: 'insensitive' },
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      if (!m) throw new NotFoundException();
      return m.id;
    });
  }
}
