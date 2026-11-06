import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import type { Tx } from '../prisma/prisma.service';
import { decryptBytes, encryptBytes } from '../common/field-crypto';

/**
 * Encrypted file storage. Every file is encrypted with the company's key before it is
 * written, so a copied disk or backup is unreadable on its own.
 * Two places to keep the bytes:
 *  - disk (default): FILE_STORAGE_DIR, which must be a persistent, backed-up volume.
 *  - database: FILE_STORAGE=db (automatic on Vercel, where the disk is read-only). The encrypted
 *    bytes sit in the FileBlob table, isolated per company by row-level security and
 *    covered by the database's own backups. Uploads are capped well below the size where this gets awkward.
 */
@Injectable()
export class FileStore {
  private root = resolve(process.env.FILE_STORAGE_DIR ?? './.data/files');
  private useDb =
    process.env.FILE_STORAGE === 'db' ||
    (process.env.FILE_STORAGE !== 'disk' && !!process.env.VERCEL);

  async put(
    tx: Tx,
    tenantId: string,
    f: {
      ownerId?: string;
      purpose: string;
      fileName: string;
      mimeType: string;
      bytes: Uint8Array;
    },
  ) {
    const key = join(tenantId, `${randomUUID()}.bin`);
    const enc = encryptBytes(tenantId, f.bytes);
    if (!this.useDb) {
      const path = join(this.root, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, enc);
    }
    const file = await tx.file.create({
      data: {
        tenantId,
        ownerId: f.ownerId,
        storageKey: key,
        fileName: f.fileName,
        mimeType: f.mimeType,
        sizeBytes: f.bytes.length,
        sha256: createHash('sha256').update(f.bytes).digest('hex'),
        wrappedKey: new Uint8Array(0), // per-company derived key; see field-crypto
        scanStatus: 'clean', // generated or format-checked here; add AV scanning before accepting arbitrary uploads
        purpose: f.purpose,
      },
    });
    if (this.useDb)
      await tx.fileBlob.create({
        data: { fileId: file.id, tenantId, data: new Uint8Array(enc) },
      });
    return file;
  }

  async get(tx: Tx, tenantId: string, fileId: string) {
    const f = await tx.file.findFirst({ where: { id: fileId } });
    if (!f) throw new NotFoundException('File not found');
    let enc: Uint8Array;
    if (this.useDb) {
      const b = await tx.fileBlob.findUnique({ where: { fileId: f.id } });
      if (!b) throw new NotFoundException('File not found');
      enc = b.data;
    } else {
      enc = await readFile(join(this.root, f.storageKey));
    }
    return { file: f, bytes: decryptBytes(tenantId, Buffer.from(enc)) };
  }
}
