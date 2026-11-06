import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Hand-off tokens for single sign-on between the HR app and the Developer Dashboard.
 * `payload.signature`, both base64url; the signature is HMAC-SHA256 over the payload with SSO_SECRET.
 * Short-lived and addressed to one app (`aud`), so a token for one cannot be used on the other.
 */
export type SsoAudience = 'hr' | 'dash';
export interface SsoClaims {
  email: string;
  aud: SsoAudience;
  exp: number; // unix seconds
  n: string;
  /** Profile the sender vouches for, so the other app can create the person on first arrival. */
  name?: string;
  role?: string | null;
}
export const SSO_TTL_SECONDS = 60;

const b64 = (b: Buffer) => b.toString('base64url');
const sign = (payload: string, secret: string) =>
  b64(createHmac('sha256', secret).update(payload).digest());

export const ssoSecret = () => {
  const s = process.env.SSO_SECRET;
  return s && s.length >= 32 ? s : null;
};

export function signSso(
  email: string,
  aud: SsoAudience,
  secret: string,
  now = Date.now(),
  profile?: { name: string; role: string | null },
): string {
  const claims: SsoClaims = {
    email: email.toLowerCase(),
    aud,
    exp: Math.floor(now / 1000) + SSO_TTL_SECONDS,
    n: randomBytes(8).toString('hex'),
    ...(profile ? { name: profile.name, role: profile.role } : {}),
  };
  const payload = b64(Buffer.from(JSON.stringify(claims)));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySso(
  token: string,
  aud: SsoAudience,
  secret: string,
  now = Date.now(),
): SsoClaims | null {
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra !== undefined) return null;
  const want = Buffer.from(sign(payload, secret));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const c = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as SsoClaims;
    if (c.aud !== aud || typeof c.email !== 'string') return null;
    if (typeof c.exp !== 'number' || c.exp * 1000 < now) return null;
    return c;
  } catch {
    return null;
  }
}
