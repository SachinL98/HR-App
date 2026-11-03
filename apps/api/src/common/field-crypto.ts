import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from 'crypto';

/**
 * Field-level encryption for sensitive values (salaries, payslips, bank details).
 * AES-256-GCM with a per-company key derived (HKDF) from one master key, and the
 * company id bound in as authenticated data, so a value copied into another
 * company's row will not decrypt.
 *
 * Production: set FIELD_ENCRYPTION_KEY to 32 random bytes, base64 encoded
 * (`openssl rand -base64 32`), ideally sourced from a KMS. Losing the key means
 * losing the data, so back it up separately from the database.
 */
const VERSION = 1;

function master(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (raw) {
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32)
      throw new Error('FIELD_ENCRYPTION_KEY must be 32 bytes, base64 encoded');
    return key;
  }
  if (process.env.NODE_ENV === 'production')
    throw new Error('FIELD_ENCRYPTION_KEY must be set in production');
  return createHash('sha256').update('dev-only-field-key').digest();
}

if (process.env.NODE_ENV === 'production') master(); // fail at boot, not at first payslip

const tenantKey = (tenantId: string) =>
  Buffer.from(hkdfSync('sha256', master(), tenantId, 'hr-field-v1', 32));

export function encryptJson(
  tenantId: string,
  value: unknown,
): Uint8Array<ArrayBuffer> {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', tenantKey(tenantId), iv);
  c.setAAD(Buffer.from(tenantId));
  const body = Buffer.concat([
    c.update(JSON.stringify(value), 'utf8'),
    c.final(),
  ]);
  return new Uint8Array(
    Buffer.concat([Buffer.from([VERSION]), iv, c.getAuthTag(), body]),
  );
}

export function decryptJson<T>(tenantId: string, data: Uint8Array): T {
  const buf = Buffer.from(data);
  if (buf[0] !== VERSION) throw new Error('Unknown encryption version');
  const d = createDecipheriv(
    'aes-256-gcm',
    tenantKey(tenantId),
    buf.subarray(1, 13),
  );
  d.setAAD(Buffer.from(tenantId));
  d.setAuthTag(buf.subarray(13, 29));
  const out = Buffer.concat([d.update(buf.subarray(29)), d.final()]);
  return JSON.parse(out.toString('utf8')) as T;
}
