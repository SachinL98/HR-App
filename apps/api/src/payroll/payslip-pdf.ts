import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import {
  LETTERHEAD_LAYOUT,
  embedBackground,
  hex,
  safe,
  type Layout,
} from '../documents/pdf';

interface Line {
  label: string;
  kind: 'earning' | 'deduction' | 'employer';
  amount: number;
}

export interface PayslipPdfInput {
  company: string;
  employee: string;
  employeeNo?: string | null;
  period: string; // "March 2026"
  currency: string;
  gross: number;
  net: number;
  unpaidDays: number;
  lines: Line[];
  ruleVersion: string | null;
  letterhead?: Uint8Array;
  layout?: Partial<Layout>;
}

const A4: [number, number] = [595.28, 841.89];
const money = (n: number, cur: string) =>
  `${cur} ${new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`.replace(
    /\s/g,
    ' ',
  );

/** One-page payslip. Sits on the company's letterhead when the payslip template has one. */
export async function renderPayslipPdf(
  i: PayslipPdfInput,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(safe(`Payslip ${i.period} ${i.employee}`));
  pdf.setProducer('Seamless Source HR');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const draw = await embedBackground(pdf, i.letterhead);
  const L: Layout = i.letterhead
    ? { ...LETTERHEAD_LAYOUT, ...i.layout }
    : {
        top: 56,
        bottom: 60,
        left: 56,
        right: 56,
        size: 11,
        color: '#111827',
        justify: false,
        footer: 30,
      };
  const ink = hex(L.color);
  const grey = rgb(0.4, 0.42, 0.48);
  const width = A4[0] - L.left - L.right;
  let page: PDFPage = pdf.addPage(A4);
  draw(page);
  let y = A4[1] - L.top;
  const ensure = (h: number) => {
    if (y - h < L.bottom) {
      page = pdf.addPage(A4);
      draw(page);
      y = A4[1] - L.top;
    }
  };
  const text = (
    t: string,
    x: number,
    size: number,
    f: PDFFont = font,
    c = ink,
  ) => page.drawText(safe(t), { x, y, size, font: f, color: c });
  const right = (t: string, size: number, f: PDFFont = font, c = ink) => {
    const s = safe(t);
    page.drawText(s, {
      x: L.left + width - f.widthOfTextAtSize(s, size),
      y,
      size,
      font: f,
      color: c,
    });
  };
  const rule = () =>
    page.drawLine({
      start: { x: L.left, y },
      end: { x: L.left + width, y },
      thickness: 0.6,
      color: rgb(0.82, 0.84, 0.88),
    });

  text('PAYSLIP', L.left, 20, bold);
  y -= 18;
  text(i.period, L.left, 12, font, grey);
  y -= 30;
  text(i.employee, L.left, 13, bold);
  right(i.company, 11, font, grey);
  y -= 15;
  if (i.employeeNo)
    text(`Employee number ${i.employeeNo}`, L.left, 9.5, font, grey);
  if (i.unpaidDays)
    right(
      `${i.unpaidDays} unpaid day${i.unpaidDays === 1 ? '' : 's'} this month`,
      9.5,
      font,
      grey,
    );
  y -= 26;

  const section = (title: string, rows: Line[]) => {
    if (!rows.length) return;
    ensure(30 + rows.length * 18);
    text(title.toUpperCase(), L.left, 9, bold, grey);
    y -= 6;
    rule();
    y -= 16;
    for (const r of rows) {
      ensure(18);
      text(r.label, L.left, 10.5);
      right(money(r.amount, i.currency), 10.5);
      y -= 18;
    }
    y -= 10;
  };
  section(
    'Earnings',
    i.lines.filter((l) => l.kind === 'earning'),
  );
  const earned = i.lines
    .filter((l) => l.kind === 'earning')
    .reduce((a, l) => a + l.amount, 0);
  if (Math.abs(earned - i.gross) > 0.005) {
    text('Gross pay', L.left, 10.5, bold);
    right(money(i.gross, i.currency), 10.5, bold);
    y -= 24;
  }
  section(
    'Deductions',
    i.lines.filter((l) => l.kind === 'deduction'),
  );

  ensure(60);
  rule();
  y -= 24;
  text('NET PAY', L.left, 13, bold);
  right(money(i.net, i.currency), 15, bold);
  y -= 34;

  section(
    'Employer contributions (not deducted from your pay)',
    i.lines.filter((l) => l.kind === 'employer'),
  );
  if (i.ruleVersion) {
    ensure(16);
    text(`Calculated with ${i.ruleVersion} rules.`, L.left, 8.5, font, grey);
  }
  return pdf.save();
}
