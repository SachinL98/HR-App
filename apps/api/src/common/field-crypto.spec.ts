import { decryptJson, encryptJson } from './field-crypto';

describe('field encryption', () => {
  const a = '11111111-1111-1111-1111-111111111111';
  const b = '22222222-2222-2222-2222-222222222222';

  it('round-trips and does not store plaintext', () => {
    const enc = encryptJson(a, { basic: 4200.5 });
    expect(Buffer.from(enc).toString('utf8')).not.toContain('4200');
    expect(decryptJson<{ basic: number }>(a, enc)).toEqual({ basic: 4200.5 });
  });

  it('uses a fresh nonce each time', () => {
    expect(
      Buffer.from(encryptJson(a, 1)).equals(Buffer.from(encryptJson(a, 1))),
    ).toBe(false);
  });

  it("will not decrypt under another company's key", () => {
    expect(() => decryptJson(b, encryptJson(a, { x: 1 }))).toThrow();
  });

  it('detects tampering', () => {
    const enc = encryptJson(a, { x: 1 });
    enc[enc.length - 1] ^= 1;
    expect(() => decryptJson(a, enc)).toThrow();
  });
});
