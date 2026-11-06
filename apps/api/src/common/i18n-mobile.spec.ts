import { en, si, ta } from '../../../mobile/src/i18n/dictionaries';

/** The words in the mobile app. These checks stop a translation from breaking a screen. */
const OPTIONAL = new Set(['verb']); // only English needs {verb} ("is" or "are")
const vars = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .filter((x) => !OPTIONAL.has(x))
    .sort();
const source = en as Record<string, string>;
const langs = {
  Sinhala: si as Record<string, string>,
  Tamil: ta as Record<string, string>,
};

describe('mobile translations', () => {
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
    it(`${name} covers all of the English list (apart from the {verb} helpers)`, () => {
      const missing = Object.keys(source).filter((k) => !(k in dict));
      expect(missing).toEqual([]);
    });
  }
});
