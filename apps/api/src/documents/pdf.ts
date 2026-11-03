import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import * as QRCode from 'qrcode';

export interface PdfImage {
  label: string;
  bytes: Uint8Array;
}
export interface PdfInput {
  company: string;
  title: string;
  body: string; // plain text, blank line between paragraphs
  stamp?: PdfImage;
  signatures: PdfImage[];
  verifyUrl: string;
  code: string;
}

const A4: [number, number] = [595.28, 841.89];
const M = 56;

/** The built-in fonts only cover Latin text; anything else would make pdf-lib throw. */
const safe = (s: string) =>
  Array.from(s, (ch) => {
    const n = ch.codePointAt(0) ?? 63;
    if (n === 9 || n === 10 || (n >= 32 && n <= 126) || (n >= 160 && n <= 255))
      return ch;
    if (ch === '\u2019' || ch === '\u2018') return "'";
    if (ch === '\u201C' || ch === '\u201D') return '"';
    if (ch === '\u2013' || ch === '\u2014') return '-';
    return '?';
  }).join('');

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function renderPdf(i: PdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(safe(i.title));
  pdf.setProducer('HR App');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage(A4);
  let y = A4[1] - M;
  const width = A4[0] - M * 2;
  const ensure = (h: number) => {
    if (y - h < M + 60) {
      page = pdf.addPage(A4);
      y = A4[1] - M;
    }
  };

  page.drawText(safe(i.company), {
    x: M,
    y,
    size: 16,
    font: bold,
    color: rgb(0.1, 0.1, 0.15),
  });
  y -= 10;
  page.drawLine({
    start: { x: M, y },
    end: { x: A4[0] - M, y },
    thickness: 0.8,
    color: rgb(0.8, 0.8, 0.85),
  });
  y -= 34;
  page.drawText(safe(i.title), { x: M, y, size: 13, font: bold });
  y -= 26;

  const size = 11;
  for (const line of wrap(safe(i.body), font, size, width)) {
    ensure(size * 1.6);
    if (line) page.drawText(line, { x: M, y, size, font });
    y -= size * 1.6;
  }

  // Signatures side by side, then the stamp.
  const blocks = [...i.signatures, ...(i.stamp ? [i.stamp] : [])];
  if (blocks.length) {
    ensure(110);
    y -= 14;
    let x = M;
    for (const b of blocks) {
      const img = await pdf.embedPng(b.bytes);
      const h = 54;
      const w = Math.min(150, (img.width / img.height) * h);
      page.drawImage(img, { x, y: y - h, width: w, height: h });
      page.drawText(safe(b.label), {
        x,
        y: y - h - 12,
        size: 8.5,
        font,
        color: rgb(0.35, 0.35, 0.4),
      });
      x += Math.max(w, 110) + 28;
      if (x > A4[0] - M - 110) break;
    }
  }

  // Every page carries the verification code; the last page also has the QR.
  const qr = await pdf.embedPng(
    await QRCode.toBuffer(i.verifyUrl, { margin: 1, width: 180 }),
  );
  const pages = pdf.getPages();
  pages.forEach((p, n) => {
    p.drawText(safe(`Verify this document: ${i.verifyUrl}   Code ${i.code}`), {
      x: M,
      y: 30,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.45),
    });
    p.drawText(`Page ${n + 1} of ${pages.length}`, {
      x: A4[0] - M - 50,
      y: 30,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.45),
    });
  });
  const last = pages[pages.length - 1];
  last.drawImage(qr, { x: A4[0] - M - 54, y: 44, width: 54, height: 54 });

  return pdf.save();
}
