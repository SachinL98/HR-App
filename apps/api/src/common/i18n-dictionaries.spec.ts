import { en } from '../../../web/src/lib/i18n/en';
import { si } from '../../../web/src/lib/i18n/si';
import { ta } from '../../../web/src/lib/i18n/ta';

/** The words people see in the web app. These checks stop a translation from breaking a page. */
// Only English needs {verb} ("is" or "are"); Sinhala and Tamil do not change the word.
const OPTIONAL = new Set(['verb']);
const vars = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .filter((x) => !OPTIONAL.has(x))
    .sort();
const langs = {
  Sinhala: si as Record<string, string>,
  Tamil: ta as Record<string, string>,
};
const source = en as Record<string, string>;

describe('translations', () => {
  it('has no empty English text', () => {
    // "approvals.is" and ".are" are deliberately empty in some languages, never in English.
    for (const [k, v] of Object.entries(source))
      expect({ k, ok: v.trim().length > 0 }).toEqual({ k, ok: true });
  });

  for (const [name, dict] of Object.entries(langs)) {
    it(`${name} only uses keys that exist in English`, () => {
      expect(Object.keys(dict).filter((k) => !(k in source))).toEqual([]);
    });
    it(`${name} keeps every {placeholder} the English text has`, () => {
      const bad = Object.entries(dict)
        .filter(
          ([k, v]) =>
            k in source &&
            v !== '' &&
            JSON.stringify(vars(v)) !== JSON.stringify(vars(source[k])),
        )
        .map(([k]) => k);
      expect(bad).toEqual([]);
    });
    it(`${name} covers (nearly) all of the English list`, () => {
      const have = Object.keys(dict).length;
      const total = Object.keys(source).length;
      // Anything missing shows in English, but a gap this big would mean a screen was forgotten.
      expect(have / total).toBeGreaterThan(0.95);
    });
  }
});
