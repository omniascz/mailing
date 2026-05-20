import { describe, it, expect } from 'vitest';
import { renderIsdocInvoice } from './isdoc-export.js';
import type { LineItem } from './products.js';
import type { CzParty } from './invoicing-cz.js';

const seller: CzParty = {
  name: 'ForgeMsg s.r.o.',
  ico: '12345678',
  dic: 'CZ12345678',
  street: 'Vinohradská 1512/19',
  city: 'Praha 2',
  zip: '12000',
  country: 'CZ',
  email: 'info@forgemsg.cz',
};

const buyer: CzParty = {
  name: 'Kavárna U Lípy',
  ico: '87654321',
  street: 'Hlavní 10',
  city: 'Brno',
  zip: '60200',
  country: 'CZ',
};

const lineItems: LineItem[] = [
  {
    sku: 'LIC-PRO',
    name: 'MailForge Pro (měsíční)',
    qty: 1,
    unitPrice: 990,
    total: 990,
    taxRate: 21,
  },
  { sku: 'SETUP', name: 'Implementace', qty: 2, unitPrice: 500, total: 1000, taxRate: 21 },
];

describe('renderIsdocInvoice', () => {
  it('produces a valid-looking ISDOC XML with key headers', () => {
    const xml = renderIsdocInvoice({
      invoiceNumber: '20260424',
      issueDate: new Date('2026-04-24T00:00:00Z'),
      taxPointDate: new Date('2026-04-24T00:00:00Z'),
      dueDate: new Date('2026-05-08T00:00:00Z'),
      variableSymbol: '20260424',
      currency: 'CZK',
      seller,
      buyer,
      lineItems,
      bankAccount: '2301234567/2010',
      iban: 'CZ6520100000002301234567',
    });

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('xmlns="http://isdoc.cz/namespace/2013"');
    expect(xml).toContain('<ID>20260424</ID>');
    expect(xml).toContain('<IssueDate>2026-04-24</IssueDate>');
    expect(xml).toContain('<TaxPointDate>2026-04-24</TaxPointDate>');
    expect(xml).toContain('<LocalCurrencyCode>CZK</LocalCurrencyCode>');
  });

  it('includes seller + buyer parties with IDs and addresses', () => {
    const xml = renderIsdocInvoice({
      invoiceNumber: '20260001',
      issueDate: new Date('2026-01-02Z'),
      taxPointDate: new Date('2026-01-02Z'),
      dueDate: new Date('2026-01-16Z'),
      currency: 'CZK',
      seller,
      buyer,
      lineItems,
    });
    expect(xml).toContain('<AccountingSupplierParty>');
    expect(xml).toContain('ForgeMsg s.r.o.');
    expect(xml).toContain('<ID>12345678</ID>');
    expect(xml).toContain('<AccountingCustomerParty>');
    expect(xml).toContain('Kavárna U Lípy');
    expect(xml).toContain('<CompanyID>CZ12345678</CompanyID>');
  });

  it('computes VAT totals correctly', () => {
    const xml = renderIsdocInvoice({
      invoiceNumber: '20260001',
      issueDate: new Date('2026-01-02Z'),
      taxPointDate: new Date('2026-01-02Z'),
      dueDate: new Date('2026-01-16Z'),
      currency: 'CZK',
      seller,
      buyer,
      lineItems,
    });
    // 1990 * 0.21 = 417.90, plus 1990 net = 2407.90 grand total
    expect(xml).toContain('<TaxExclusiveAmount>1990.00</TaxExclusiveAmount>');
    expect(xml).toContain('<TaxInclusiveAmount>2407.90</TaxInclusiveAmount>');
    expect(xml).toContain('<TaxAmount>417.90</TaxAmount>');
    expect(xml).toContain('<PayableAmount>2407.90</PayableAmount>');
  });

  it('escapes XML special characters in party names and notes', () => {
    const xml = renderIsdocInvoice({
      invoiceNumber: '20260001',
      issueDate: new Date('2026-01-02Z'),
      taxPointDate: new Date('2026-01-02Z'),
      dueDate: new Date('2026-01-16Z'),
      currency: 'CZK',
      seller: { ...seller, name: 'Jones & Co. <div>' },
      buyer,
      lineItems,
      notes: 'Payment due "net 14"',
    });
    expect(xml).toContain('Jones &amp; Co. &lt;div&gt;');
    expect(xml).toContain('&quot;net 14&quot;');
  });

  it('renders an InvoiceLine per line item', () => {
    const xml = renderIsdocInvoice({
      invoiceNumber: '20260001',
      issueDate: new Date('2026-01-02Z'),
      taxPointDate: new Date('2026-01-02Z'),
      dueDate: new Date('2026-01-16Z'),
      currency: 'CZK',
      seller,
      buyer,
      lineItems,
    });
    const matches = xml.match(/<InvoiceLine>/g);
    expect(matches).toHaveLength(2);
  });
});
