import { checkTotp, codeAt, newSecret, stepNow } from './totp';

describe('totp', () => {
  // RFC 6238 test vector: secret "12345678901234567890" at T=59s is 94287082 (8 digits); 6 digits = 287082.
  const rfc = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  it('matches the RFC 6238 test vector', () => {
    expect(codeAt(rfc, stepNow(59_000))).toBe('287082');
  });
  it('accepts a code once, and not twice or from far away', () => {
    const s = newSecret();
    const now = 1_700_000_000_000;
    const c = codeAt(s, stepNow(now));
    const step = checkTotp(s, c, null, now);
    expect(step).toBe(stepNow(now));
    expect(checkTotp(s, c, step, now)).toBeNull(); // replay
    expect(checkTotp(s, c, null, now + 5 * 60_000)).toBeNull(); // too old
    expect(checkTotp(s, '12345', null, now)).toBeNull(); // wrong shape
  });
});
