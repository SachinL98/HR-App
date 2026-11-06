/** Writes spreadsheet-safe CSV (RFC 4180). Cells that start with = + - @ are neutralised so a name cannot run as a formula. */
export function csvCell(v: string | number | null | undefined) {
  let s = v === null || v === undefined ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsv = (rows: (string | number | null | undefined)[][]) =>
  '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

/** Money as plain decimal text for spreadsheets and bank files. */
export const amount = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
