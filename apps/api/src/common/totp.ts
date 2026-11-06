import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/** Time-based one-time passwords (RFC 6238): the 6-digit codes authenticator apps show. */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30;

export const newSecret = () => base32(randomBytes(20));

function base32(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function unbase32(s: string) {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s.replace(/=+$/, '').toUpperCase()) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('Bad base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const stepNow = (t = Date.now()) => Math.floor(t / 1000 / STEP);

function code(secret: string, step: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', unbase32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n =
    ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

/**
 * Checks a code, allowing one step either side for clock drift. Returns the matching step
 * (so the caller can refuse to accept the same step twice) or null.
 */
export function checkTotp(
  secret: string,
  input: string,
  lastStep?: number | null,
  now = Date.now(),
): number | null {
  const clean = input.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const cur = stepNow(now);
  for (const s of [cur, cur - 1, cur + 1]) {
    if (lastStep != null && s <= lastStep) continue;
    const a = Buffer.from(code(secret, s));
    const b = Buffer.from(clean);
    if (a.length === b.length && timingSafeEqual(a, b)) return s;
  }
  return null;
}

export const otpauthUrl = (secret: string, account: string, issuer: string) =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`;

export const codeAt = code; // exposed for tests
