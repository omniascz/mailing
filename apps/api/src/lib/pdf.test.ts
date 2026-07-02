import { describe, it, expect } from 'vitest';
import { renderPdf } from './pdf.js';

describe('renderPdf', () => {
  it('produces a structurally valid PDF', () => {
    const buf = renderPdf({
      title: 'Campaign report',
      subtitle: 'Subject: Hello  ·  Sent: 2026-07-02 10:00',
      sections: [
        { heading: 'Summary', rows: [['openRate', '42.5'], ['clickRate', '3.1']] },
        {
          heading: 'Links',
          columns: ['URL', 'Clicks', '%'],
          rows: [['https://example.com/very/long/url/that/should/be/clipped', '10', '100%']],
        },
      ],
    });
    const s = buf.toString('latin1');
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(s).toContain('/Type /Catalog');
    expect(s).toContain('startxref');
    expect(s).toContain('(Campaign report)');
    expect(buf.length).toBeGreaterThan(400);
  });

  it('transliterates Czech diacritics rather than emitting mojibake', () => {
    const buf = renderPdf({ title: 'Přehled kampaně', sections: [] });
    const s = buf.toString('latin1');
    // ř→r, ě→e, ň→n, ě→e
    expect(s).toContain('(Prehled kampane)');
  });

  it('paginates long tables across multiple pages', () => {
    const rows = Array.from({ length: 120 }, (_, i) => [`row ${i}`, String(i)]);
    const buf = renderPdf({
      title: 'Big',
      sections: [{ heading: 'Rows', columns: ['Name', 'N'], rows }],
    });
    const s = buf.toString('latin1');
    const pageCount = (s.match(/\/Type \/Page[^s]/g) ?? []).length;
    expect(pageCount).toBeGreaterThan(1);
  });
});
