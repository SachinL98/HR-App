import { amount, csvCell, toCsv } from './csv';

describe('csv', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('Lee, Ann')).toBe('"Lee, Ann"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(12.5)).toBe('12.5');
  });
  it('neutralises spreadsheet formulas but leaves negative numbers alone', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+44 7000')).toBe("'+44 7000");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell(-3)).toBe('-3');
  });
  it('writes rows with a byte-order mark and CRLF', () => {
    expect(
      toCsv([
        ['a', 'b'],
        [1, 2],
      ]),
    ).toBe('﻿a,b\r\n1,2\r\n');
    expect(amount(1234.5)).toBe('1234.50');
    expect(amount(0.1 + 0.2)).toBe('0.30');
  });
});
