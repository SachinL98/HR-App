import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
  type RGB,
} from 'pdf-lib';
import * as QRCode from 'qrcode';

export interface PdfImage {
  /** 'stamp' or the signature's slug, matching the token typed in the template. */
  key: string;
  label: string;
  bytes: Uint8Array;
}

/** Where the text sits on the page, in points (A4 is 595 x 842). */
export interface Layout {
  top: number;
  bottom: number;
  left: number;
  right: number;
  size: number;
  color: string; // #rrggbb
  justify: boolean;
  /** Height of the verification line and QR above the bottom edge (letterhead only). */
  footer: number;
}

/** Tuned for a typical letterhead: logo and address on top, contact strip at the bottom. */
export const LETTERHEAD_LAYOUT: Layout = {
  top: 135,
  bottom: 120,
  left: 40,
  right: 80,
  size: 12,
  color: '#1f2937',
  justify: true,
  footer: 22,
};

export interface PdfInput {
  company: string;
  title: string;
  body: string; // plain text, blank line between paragraphs; image tokens are markers
  stamp?: PdfImage;
  signatures: PdfImage[];
  verifyUrl: string;
  code: string;
  /** Canva (or any) design used as the page background: a PNG or a PDF. */
  letterhead?: { bytes: Uint8Array };
  layout?: Partial<Layout>;
}

const A4: [number, number] = [595.28, 841.89];
const M = 56;

/** The built-in fonts only cover Latin text; anything else would make pdf-lib throw. */
export const safe = (s: string) =>
  Array.from(s, (ch) => {
    const n = ch.codePointAt(0) ?? 63;
    if (n === 9 || n === 10 || (n >= 32 && n <= 126) || (n >= 160 && n <= 255))
      return ch;
    if (ch === '’' || ch === '‘') return "'";
    if (ch === '“' || ch === '”') return '"';
    if (ch === '–' || ch === '—') return '-';
    return '?';
  }).join('');

export const hex = (h: string): RGB => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h);
  if (!m) return rgb(0.12, 0.16, 0.22);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

interface Line {
  text: string;
  last: boolean; // last line of its paragraph (never stretched)
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: Line[] = [];
  const push = (t: string, last: boolean) => lines.push({ text: t, last });
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) line = next;
    else {
      if (line) push(line, false);
      line = word;
    }
  }
  push(line, true);
  return lines;
}

// eslint-disable-next-line no-control-regex
const IMAGE_LINE = /^\u0001(?:(stamp)|sig:([a-z0-9_]+))\u0002$/;

/** Embeds a letterhead (PNG or the first page of a PDF) once and returns a function that draws it behind a page. */
export async function embedBackground(
  pdf: PDFDocument,
  bytes?: Uint8Array,
): Promise<(p: PDFPage) => void> {
  if (!bytes) return () => undefined;
  const isPdf = Buffer.from(bytes.slice(0, 5)).toString('latin1') === '%PDF-';
  if (isPdf) {
    const [pg] = await pdf.embedPdf(await PDFDocument.load(bytes), [0]);
    return (p) => p.drawPage(pg, { x: 0, y: 0, width: A4[0], height: A4[1] });
  }
  const img = await pdf.embedPng(bytes);
  return (p) => p.drawImage(img, { x: 0, y: 0, width: A4[0], height: A4[1] });
}

export async function renderPdf(i: PdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(safe(i.title));
  pdf.setProducer('Seamless Source HR');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const hasLetterhead = !!i.letterhead;
  const L: Layout = hasLetterhead
    ? { ...LETTERHEAD_LAYOUT, ...i.layout }
    : {
        top: M,
        bottom: M + 60,
        left: M,
        right: M,
        size: 11,
        color: '#111827',
        justify: false,
        footer: 30,
        ...i.layout,
      };
  const ink = hex(L.color);
  const width = A4[0] - L.left - L.right;
  const lineH = L.size * 1.5;

  const background = await embedBackground(pdf, i.letterhead?.bytes);

  const addPage = () => {
    const p = pdf.addPage(A4);
    background(p);
    return p;
  };
  let page: PDFPage = addPage();
  let y = A4[1] - (hasLetterhead ? L.top : M);
  const ensure = (h: number) => {
    if (y - h < L.bottom) {
      page = addPage();
      y = A4[1] - (hasLetterhead ? L.top : M);
    }
  };

  if (!hasLetterhead) {
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
  }

  const images = new Map<string, PdfImage>();
  for (const s of i.signatures) images.set(s.key, s);
  if (i.stamp) images.set('stamp', i.stamp);
  const used = new Set<string>();

  const drawImage = async (img: PdfImage, h: number, caption: boolean) => {
    const png = await pdf.embedPng(img.bytes);
    const w = Math.min(170, (png.width / png.height) * h);
    ensure(h + 8 + (caption ? 14 : 0));
    page.drawImage(png, { x: L.left, y: y - h, width: w, height: h });
    y -= h + (caption ? 6 : 16);
    if (caption) {
      page.drawText(safe(img.label), {
        x: L.left,
        y: y - 8,
        size: 8.5,
        font,
        color: rgb(0.35, 0.35, 0.4),
      });
      y -= 16;
    }
  };

  for (const raw of i.body.split('\n')) {
    const m = IMAGE_LINE.exec(raw.trim());
    if (m) {
      const key = m[1] ? 'stamp' : m[2];
      const img = images.get(key);
      if (img) {
        used.add(key);
        await drawImage(img, key === 'stamp' ? 70 : 54, false);
      }
      continue;
    }
    if (!raw.trim()) {
      y -= lineH;
      continue;
    }
    for (const ln of wrap(safe(raw), font, L.size, width)) {
      ensure(lineH);
      if (ln.text) {
        const words = ln.text.split(' ');
        if (L.justify && !ln.last && words.length > 1) {
          // Spread the leftover space evenly between words so both edges line up.
          const natural = font.widthOfTextAtSize(ln.text, L.size);
          const space = font.widthOfTextAtSize(' ', L.size);
          const gap = space + (width - natural) / (words.length - 1);
          let x = L.left;
          for (const w of words) {
            page.drawText(w, { x, y, size: L.size, font, color: ink });
            x += font.widthOfTextAtSize(w, L.size) + gap;
          }
        } else {
          page.drawText(ln.text, {
            x: L.left,
            y,
            size: L.size,
            font,
            color: ink,
          });
        }
      }
      y -= lineH;
    }
  }

  // Anything chosen but not placed by a token goes after the text, with a caption.
  const loose = [...images.entries()].filter(([k]) => !used.has(k));
  if (loose.length) {
    y -= 10;
    for (const [k, img] of loose)
      await drawImage(img, k === 'stamp' ? 70 : 54, true);
  }

  // Every page carries the verification code; the last page also has the QR.
  const qr = await pdf.embedPng(
    await QRCode.toBuffer(i.verifyUrl, { margin: 1, width: 180 }),
  );
  const grey = rgb(0.4, 0.4, 0.45);
  const pages = pdf.getPages();
  pages.forEach((p, n) => {
    p.drawText(safe(`Verify this document: ${i.verifyUrl}   Code ${i.code}`), {
      x: hasLetterhead ? L.left + (n === pages.length - 1 ? 40 : 0) : M,
      y: hasLetterhead ? L.footer : 30,
      size: hasLetterhead ? 6.5 : 8,
      font,
      color: grey,
    });
    if (pages.length > 1)
      p.drawText(`Page ${n + 1} of ${pages.length}`, {
        x: A4[0] - M - 50,
        y: hasLetterhead ? L.footer : 30,
        size: 8,
        font,
        color: grey,
      });
  });
  const last = pages[pages.length - 1];
  if (hasLetterhead)
    last.drawImage(qr, { x: L.left, y: L.footer - 6, width: 32, height: 32 });
  else last.drawImage(qr, { x: A4[0] - M - 54, y: 44, width: 54, height: 54 });

  return pdf.save();
}
