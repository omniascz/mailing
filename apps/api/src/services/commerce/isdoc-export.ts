/**
 * ISDOC 6.0.2 invoice export (#364/#388).
 *
 * ISDOC is the Czech electronic invoicing standard developed by SPIS and
 * adopted by all major Czech accounting packages (Pohoda, Money S3, Abra,
 * Helios). This module produces the XML representation of an invoice that
 * callers can attach to the invoice email so the recipient's accountant can
 * one-click-import it.
 *
 * Namespace:            http://isdoc.cz/namespace/2013
 * Subset implemented:   `<Invoice>` with minimal header + line items + VAT
 *                       recapitulation. Advanced features (advance payments,
 *                       credit notes, deposit documents) are not covered.
 *
 * Spec: http://www.isdoc.cz/
 */

import type { LineItem } from './products.js';
import type { CzParty } from './invoicing-cz.js';
import { computeVatBreakdown } from './invoicing-cz.js';

export interface IsdocInvoiceInput {
  invoiceNumber: string;
  issueDate: Date;
  taxPointDate: Date; // datum uskutečnění zdanitelného plnění
  dueDate: Date;
  variableSymbol?: string;
  constantSymbol?: string;
  paymentMeansCode?: number; // 42 = bank transfer per ISDOC
  bankAccount?: string; // ČSOB / Česká spořitelna-style "1234567890/0100"
  iban?: string;
  currency: string; // "CZK"
  seller: CzParty;
  buyer: CzParty;
  lineItems: LineItem[];
  notes?: string;
}

/**
 * Render an ISDOC 6.0.2 `<Invoice>` XML document.
 * The returned string includes the XML prolog and is ready to be written to
 * disk / attached to an outbound email as `.isdoc`.
 */
export function renderIsdocInvoice(input: IsdocInvoiceInput): string {
  const breakdown = computeVatBreakdown(input.lineItems);
  const issue = formatDate(input.issueDate);
  const taxPoint = formatDate(input.taxPointDate);
  const due = formatDate(input.dueDate);

  const lines = input.lineItems.map((item, idx) => renderLine(item, idx + 1)).join('\n');

  const vatRows = breakdown.buckets.map((b) => renderVatDetail(b, input.currency)).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Invoice xmlns="http://isdoc.cz/namespace/2013" version="6.0.2">',
    `  <DocumentType>1</DocumentType>`,
    `  <ID>${escape(input.invoiceNumber)}</ID>`,
    `  <UUID>${cryptoUuid()}</UUID>`,
    `  <IssueDate>${issue}</IssueDate>`,
    `  <TaxPointDate>${taxPoint}</TaxPointDate>`,
    `  <VATApplicable>true</VATApplicable>`,
    `  <Note>${escape(input.notes ?? '')}</Note>`,
    `  <LocalCurrencyCode>${escape(input.currency)}</LocalCurrencyCode>`,
    `  <CurrRate>1</CurrRate>`,
    `  <RefCurrRate>1</RefCurrRate>`,
    renderParty('AccountingSupplierParty', input.seller),
    renderParty('AccountingCustomerParty', input.buyer),
    `  <InvoiceLines>`,
    lines,
    `  </InvoiceLines>`,
    `  <TaxTotal>`,
    vatRows,
    `    <TaxAmount>${breakdown.vatTotal.toFixed(2)}</TaxAmount>`,
    `  </TaxTotal>`,
    `  <LegalMonetaryTotal>`,
    `    <TaxExclusiveAmount>${breakdown.subtotal.toFixed(2)}</TaxExclusiveAmount>`,
    `    <TaxInclusiveAmount>${breakdown.grandTotal.toFixed(2)}</TaxInclusiveAmount>`,
    `    <AlreadyClaimedTaxInclusiveAmount>0</AlreadyClaimedTaxInclusiveAmount>`,
    `    <DifferenceTaxInclusiveAmount>${breakdown.grandTotal.toFixed(2)}</DifferenceTaxInclusiveAmount>`,
    `    <PayableRoundingAmount>0</PayableRoundingAmount>`,
    `    <PaidDepositsAmount>0</PaidDepositsAmount>`,
    `    <PayableAmount>${breakdown.grandTotal.toFixed(2)}</PayableAmount>`,
    `  </LegalMonetaryTotal>`,
    renderPaymentMeans(input, due, breakdown.grandTotal),
    '</Invoice>',
  ].join('\n');
}

// ─── Internals ───────────────────────────────────────────────────────────────

function renderParty(tag: string, p: CzParty): string {
  return [
    `  <${tag}>`,
    `    <Party>`,
    `      <PartyIdentification>`,
    `        <ID>${escape(p.ico ?? '')}</ID>`,
    `      </PartyIdentification>`,
    `      <PartyName>`,
    `        <Name>${escape(p.name)}</Name>`,
    `      </PartyName>`,
    `      <PostalAddress>`,
    `        <StreetName>${escape(p.street)}</StreetName>`,
    `        <CityName>${escape(p.city)}</CityName>`,
    `        <PostalZone>${escape(p.zip)}</PostalZone>`,
    `        <Country><IdentificationCode>${escape(p.country)}</IdentificationCode></Country>`,
    `      </PostalAddress>`,
    p.dic
      ? `      <PartyTaxScheme><CompanyID>${escape(p.dic)}</CompanyID><TaxScheme>VAT</TaxScheme></PartyTaxScheme>`
      : '',
    `    </Party>`,
    `  </${tag}>`,
  ]
    .filter(Boolean)
    .join('\n');
}

function renderLine(item: LineItem, seq: number): string {
  const rate = item.taxRate ?? 21;
  const lineExtension = round2(item.total);
  const taxAmount = round2(lineExtension * (rate / 100));
  return [
    `    <InvoiceLine>`,
    `      <ID>${seq}</ID>`,
    `      <InvoicedQuantity unitCode="PCE">${item.qty}</InvoicedQuantity>`,
    `      <LineExtensionAmount>${lineExtension.toFixed(2)}</LineExtensionAmount>`,
    `      <LineExtensionAmountTaxInclusive>${(lineExtension + taxAmount).toFixed(2)}</LineExtensionAmountTaxInclusive>`,
    `      <LineExtensionTaxAmount>${taxAmount.toFixed(2)}</LineExtensionTaxAmount>`,
    `      <UnitPrice>${item.unitPrice.toFixed(2)}</UnitPrice>`,
    `      <UnitPriceTaxInclusive>${(item.unitPrice * (1 + rate / 100)).toFixed(2)}</UnitPriceTaxInclusive>`,
    `      <ClassifiedTaxCategory>`,
    `        <Percent>${rate}</Percent>`,
    `        <VATCalculationMethod>0</VATCalculationMethod>`,
    `      </ClassifiedTaxCategory>`,
    `      <Item>`,
    `        <Description>${escape(item.name)}</Description>`,
    item.sku
      ? `        <SellersItemIdentification><ID>${escape(item.sku)}</ID></SellersItemIdentification>`
      : '',
    `      </Item>`,
    `    </InvoiceLine>`,
  ]
    .filter(Boolean)
    .join('\n');
}

function renderVatDetail(
  b: { rate: number; base: number; tax: number; total: number },
  currency: string,
): string {
  return [
    `    <TaxSubTotal>`,
    `      <TaxableAmount>${b.base.toFixed(2)}</TaxableAmount>`,
    `      <TaxAmount>${b.tax.toFixed(2)}</TaxAmount>`,
    `      <TaxInclusiveAmount>${b.total.toFixed(2)}</TaxInclusiveAmount>`,
    `      <AlreadyClaimedTaxableAmount>0</AlreadyClaimedTaxableAmount>`,
    `      <AlreadyClaimedTaxAmount>0</AlreadyClaimedTaxAmount>`,
    `      <AlreadyClaimedTaxInclusiveAmount>0</AlreadyClaimedTaxInclusiveAmount>`,
    `      <DifferenceTaxableAmount>${b.base.toFixed(2)}</DifferenceTaxableAmount>`,
    `      <DifferenceTaxAmount>${b.tax.toFixed(2)}</DifferenceTaxAmount>`,
    `      <DifferenceTaxInclusiveAmount>${b.total.toFixed(2)}</DifferenceTaxInclusiveAmount>`,
    `      <TaxCategory>`,
    `        <Percent>${b.rate}</Percent>`,
    `      </TaxCategory>`,
    `      <LocalCurrencyCode>${escape(currency)}</LocalCurrencyCode>`,
    `    </TaxSubTotal>`,
  ].join('\n');
}

function renderPaymentMeans(input: IsdocInvoiceInput, due: string, grand: number): string {
  const means = input.paymentMeansCode ?? 42; // bank transfer
  return [
    `  <PaymentMeans>`,
    `    <Payment>`,
    `      <PaidAmount>${grand.toFixed(2)}</PaidAmount>`,
    `      <PaymentMeansCode>${means}</PaymentMeansCode>`,
    `      <Details>`,
    input.bankAccount ? `        <PaymentDueDate>${due}</PaymentDueDate>` : '',
    input.bankAccount ? `        <ID>${escape(input.bankAccount)}</ID>` : '',
    input.iban ? `        <IBAN>${escape(input.iban)}</IBAN>` : '',
    input.variableSymbol
      ? `        <VariableSymbol>${escape(input.variableSymbol)}</VariableSymbol>`
      : '',
    input.constantSymbol
      ? `        <ConstantSymbol>${escape(input.constantSymbol)}</ConstantSymbol>`
      : '',
    `      </Details>`,
    `    </Payment>`,
    `  </PaymentMeans>`,
  ]
    .filter(Boolean)
    .join('\n');
}

function formatDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function cryptoUuid(): string {
  // Platform-safe UUID v4 generator for environments where `crypto.randomUUID`
  // is available (Node 19+ / browsers). Falls back to a deterministic v4
  // template driven by Math.random only when the primitive isn't exposed.
  const g = globalThis as typeof globalThis & {
    crypto?: { randomUUID?: () => string };
  };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
