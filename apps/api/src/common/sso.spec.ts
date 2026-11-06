import { signSso, verifySso } from './sso';

const secret = 'a'.repeat(40);

describe('single sign-on tokens', () => {
  it('round-trips for the right audience', () => {
    const t = signSso('A@X.com', 'hr', secret);
    expect(verifySso(t, 'hr', secret)?.email).toBe('a@x.com');
  });
  it('rejects the wrong audience, secret or a tampered token', () => {
    const t = signSso('a@x.com', 'hr', secret);
    expect(verifySso(t, 'dash', secret)).toBeNull();
    expect(verifySso(t, 'hr', 'b'.repeat(40))).toBeNull();
    const [p, s] = t.split('.');
    const forged = Buffer.from(
      JSON.stringify({ email: 'boss@x.com', aud: 'hr', exp: 9e9, n: '1' }),
    ).toString('base64url');
    expect(verifySso(`${forged}.${s}`, 'hr', secret)).toBeNull();
    expect(verifySso(`${p}.x`, 'hr', secret)).toBeNull();
    expect(verifySso('garbage', 'hr', secret)).toBeNull();
  });
  it('expires after a minute', () => {
    const now = Date.now();
    const t = signSso('a@x.com', 'hr', secret, now);
    expect(verifySso(t, 'hr', secret, now + 30_000)).not.toBeNull();
    expect(verifySso(t, 'hr', secret, now + 61_000)).toBeNull();
  });
});
