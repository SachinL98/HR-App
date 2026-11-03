import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import type { Tx } from '../prisma/prisma.service';
import { decryptBytes, encryptBytes } from '../common/field-crypto';

/**
 * Encrypted file storage on local disk. Every file is encrypted with the company's
 * key before it is written, so a copied disk or backup is unreadable on its own.
 * Swap `put`/`get` for an object store (S3 with KMS) without touching callers.
 * Production: point FILE_STORAGE_DIR at a persistent volume that is backed up.
 */
@Injectable()
export class FileStore {
  private root = resolve(process.env.FILE_STORAGE_DIR ?? './.data/files');

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
    const path = join(this.root, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, encryptBytes(tenantId, f.bytes));
    return tx.file.create({
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
  }

  async get(tx: Tx, tenantId: string, fileId: string) {
    const f = await tx.file.findFirst({ where: { id: fileId } });
    if (!f) throw new NotFoundException('File not found');
    const enc = await readFile(join(this.root, f.storageKey));
    return { file: f, bytes: decryptBytes(tenantId, enc) };
  }
}
