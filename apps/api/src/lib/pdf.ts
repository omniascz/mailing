/**
 * Minimal, dependency-free PDF generator for report exports.
 *
 * Produces a valid PDF 1.4 document (Helvetica, WinAnsi) with a title,
 * key/value summary sections, and simple tables, with automatic pagination.
 * We deliberately avoid a heavyweight PDF/Chromium dependency here — report
 * exports are plain tabular data, so a small writer is enough.
 *
 * Text encoding note: the built-in Helvetica font uses WinAnsi (Latin-1++),
 * which does NOT cover Czech/Slovak carons (č, ř, š, ž, ě, ů, …). Those are
 * transliterated to their base letters so output is always readable rather
 * than mojibake. For full Unicode we'd need to embed a TrueType font.
 */

const PAGE_W = 595.28; // A4 width in pt
const PAGE_H = 841.89; // A4 height in pt
const MARGIN = 48;
const LINE_H = 15;

export interface PdfKeyValue {
  heading: string;
  rows: Array<[string, string]>;
}

export interface PdfTable {
  heading: string;
  columns: string[];
  rows: string[][];
}

export interface PdfDoc {
  title: string;
  subtitle?: string;
  sections: Array<PdfKeyValue | PdfTable>;
}

function isTable(s: PdfKeyValue | PdfTable): s is PdfTable {
  return (s as PdfTable).columns !== undefined;
}

/** Map Czech/Slovak diacritics (and a few others) to WinAnsi-safe base letters. */
const TRANSLIT: Record<string, string> = {
  č: 'c',
  Č: 'C',
  ř: 'r',
  Ř: 'R',
  š: 's',
  Š: 'S',
  ž: 'z',
  Ž: 'Z',
  ě: 'e',
  Ě: 'E',
  ů: 'u',
  Ů: 'U',
  ď: 'd',
  Ď: 'D',
  ť: 't',
  Ť: 'T',
  ň: 'n',
  Ň: 'N',
  ľ: 'l',
  Ľ: 'L',
  ĺ: 'l',
  Ĺ: 'L',
  ŕ: 'r',
  Ŕ: 'R',
};

/** Encode a JS string to a WinAnsi byte string usable inside a PDF literal. */
function toWinAnsi(input: string): string {
  let out = '';
  for (const ch of input) {
    const mapped = TRANSLIT[ch] ?? ch;
    for (const c of mapped) {
      const code = c.charCodeAt(0);
      // Keep printable Latin-1; replace anything outside with '?'.
      if (code >= 0x20 && code <= 0xff) {
        out += c;
      } else {
        out += '?';
      }
    }
  }
  // Escape PDF string delimiters.
  return out.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** A single positioned text run in a content stream. */
interface TextOp {
  x: number;
  y: number;
  size: number;
  text: string;
}

/**
 * Lay a PdfDoc out into one or more pages of positioned text ops.
 */
function layout(doc: PdfDoc): TextOp[][] {
  const pages: TextOp[][] = [];
  let page: TextOp[] = [];
  let y = PAGE_H - MARGIN;

  const newPage = () => {
    pages.push(page);
    page = [];
    y = PAGE_H - MARGIN;
  };
  const ensure = (needed: number) => {
    if (y - needed < MARGIN) newPage();
  };
  const write = (text: string, size: number, indent = 0) => {
    ensure(LINE_H);
    page.push({ x: MARGIN + indent, y, size, text });
    y -= LINE_H;
  };
  const gap = (h = LINE_H / 2) => {
    y -= h;
  };

  write(doc.title, 20);
  if (doc.subtitle) write(doc.subtitle, 11);
  gap();

  for (const section of doc.sections) {
    ensure(LINE_H * 3);
    write(section.heading, 14);
    gap(4);

    if (isTable(section)) {
      const colCount = section.columns.length;
      const usableW = PAGE_W - MARGIN * 2;
      const colW = usableW / colCount;
      const renderRow = (cells: string[], size: number) => {
        ensure(LINE_H);
        cells.forEach((cell, i) => {
          const maxChars = Math.max(4, Math.floor(colW / (size * 0.5)));
          const clipped = cell.length > maxChars ? `${cell.slice(0, maxChars - 1)}…` : cell;
          page.push({ x: MARGIN + i * colW, y, size, text: clipped });
        });
        y -= LINE_H;
      };
      renderRow(section.columns, 10);
      for (const row of section.rows) renderRow(row, 10);
    } else {
      for (const [k, v] of section.rows) {
        write(`${k}:  ${v}`, 11, 8);
      }
    }
    gap();
  }

  pages.push(page);
  return pages;
}

/** Build a content stream string for a page of text ops. */
function contentStream(ops: TextOp[]): string {
  let s = '';
  for (const op of ops) {
    s += `BT /F1 ${op.size} Tf ${op.x.toFixed(2)} ${op.y.toFixed(2)} Td (${toWinAnsi(op.text)}) Tj ET\n`;
  }
  return s;
}

/**
 * Render a PdfDoc to a PDF byte Buffer.
 */
export function renderPdf(doc: PdfDoc): Buffer {
  const pages = layout(doc);

  // Object plan:
  //  1: Catalog
  //  2: Pages
  //  3: Font (Helvetica, WinAnsi)
  //  For each page i (0-based): page obj = 4 + i*2, content obj = 5 + i*2
  const objects: string[] = [];
  const pageObjIds: number[] = [];
  const firstPageObj = 4;

  pages.forEach((ops, i) => {
    const pageObj = firstPageObj + i * 2;
    const contentObj = pageObj + 1;
    pageObjIds.push(pageObj);

    const stream = contentStream(ops);
    const pageDict =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W.toFixed(2)} ${PAGE_H.toFixed(2)}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObj} 0 R >>`;
    objects[pageObj] = `${pageObj} 0 obj\n${pageDict}\nendobj\n`;
    objects[contentObj] =
      `${contentObj} 0 obj\n<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}endstream\nendobj\n`;
  });

  const kids = pageObjIds.map((id) => `${id} 0 R`).join(' ');
  objects[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageObjIds.length} >>\nendobj\n`;
  objects[3] = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`;

  // Assemble body + xref.
  const header = '%PDF-1.4\n';
  let body = '';
  const offsets: number[] = [];
  let cursor = Buffer.byteLength(header, 'latin1');
  const totalObjs = objects.length; // sparse array; index 0 unused

  for (let i = 1; i < totalObjs; i++) {
    const obj = objects[i];
    if (!obj) continue;
    offsets[i] = cursor;
    body += obj;
    cursor += Buffer.byteLength(obj, 'latin1');
  }

  const xrefStart = cursor;
  const objCount = totalObjs; // includes free object 0
  let xref = `xref\n0 ${objCount}\n0000000000 65535 f \n`;
  for (let i = 1; i < totalObjs; i++) {
    const off = offsets[i] ?? 0;
    xref += `${off.toString().padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objCount} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(header + body + xref + trailer, 'latin1');
}
