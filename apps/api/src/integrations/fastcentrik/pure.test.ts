import { describe, it, expect } from 'vitest';
import {
  parseXml,
  normalizeFastCentrikOrder,
  parseFastCentrikOrdersFeed,
} from './pure.js';

describe('parseXml', () => {
  it('parses a simple XML tree', () => {
    const tree = parseXml('<?xml version="1.0"?><root><a>1</a><b attr="x">2</b></root>');
    expect(tree.children).toHaveLength(1);
    const root = tree.children[0]!;
    expect(root.tag).toBe('root');
    expect(root.children).toHaveLength(2);
    expect(root.children[0]!.tag).toBe('a');
    expect(root.children[0]!.text).toBe('1');
    expect(root.children[1]!.attrs.attr).toBe('x');
    expect(root.children[1]!.text).toBe('2');
  });

  it('handles self-closing tags', () => {
    const tree = parseXml('<root><empty /><b>x</b></root>');
    const root = tree.children[0]!;
    expect(root.children[0]!.tag).toBe('empty');
    expect(root.children[0]!.children).toEqual([]);
    expect(root.children[1]!.text).toBe('x');
  });

  it('decodes XML entities', () => {
    const tree = parseXml('<root><a>Jones &amp; Co.</a></root>');
    expect(tree.children[0]!.children[0]!.text).toBe('Jones & Co.');
  });

  it('strips comments', () => {
    const tree = parseXml('<root><!-- comment --><a>x</a></root>');
    expect(tree.children[0]!.children).toHaveLength(1);
  });

  it('throws on mismatched closing tags', () => {
    expect(() => parseXml('<root><a></b></root>')).toThrow();
  });
});

describe('normalizeFastCentrikOrder', () => {
  it('flattens a complete FastCentrik order', () => {
    const xml = `<?xml version="1.0"?>
      <ORDERS>
        <ORDER>
          <ORDER_CODE>F-2026-0001</ORDER_CODE>
          <STATUS>new</STATUS>
          <CURRENCY>CZK</CURRENCY>
          <TOTAL_PRICE>2490.00</TOTAL_PRICE>
          <CREATED_AT>2026-04-24T10:15:30Z</CREATED_AT>
          <CUSTOMER>
            <EMAIL>anna@example.cz</EMAIL>
            <FIRST_NAME>Anna</FIRST_NAME>
          </CUSTOMER>
          <ITEMS>
            <ITEM><CODE>BOOK-01</CODE><NAME>Kniha</NAME><QTY>2</QTY><PRICE>499.00</PRICE></ITEM>
            <ITEM><NAME>Pohled</NAME><QTY>1</QTY><PRICE>1492.00</PRICE></ITEM>
          </ITEMS>
        </ORDER>
      </ORDERS>`;
    const tree = parseXml(xml);
    const order = normalizeFastCentrikOrder(tree.children[0]!.children[0]!);

    expect(order).toMatchObject({
      externalOrderId: 'F-2026-0001',
      customerEmail: 'anna@example.cz',
      status: 'new',
      totalAmount: '2490.00',
      currency: 'CZK',
    });
    expect(order.items).toHaveLength(2);
    expect(order.items[0]).toMatchObject({ sku: 'BOOK-01', name: 'Kniha', qty: 2, price: 499 });
    expect(order.orderedAt).toBeInstanceOf(Date);
  });

  it('defaults currency to CZK when missing', () => {
    const xml = `<ORDERS><ORDER><ORDER_CODE>X</ORDER_CODE></ORDER></ORDERS>`;
    const tree = parseXml(xml);
    const order = normalizeFastCentrikOrder(tree.children[0]!.children[0]!);
    expect(order.currency).toBe('CZK');
    expect(order.items).toEqual([]);
    expect(order.customerEmail).toBeNull();
  });
});

describe('parseFastCentrikOrdersFeed', () => {
  it('parses a multi-order feed', () => {
    const xml = `<ORDERS>
      <ORDER><ORDER_CODE>A-1</ORDER_CODE><CUSTOMER><EMAIL>a@x</EMAIL></CUSTOMER></ORDER>
      <ORDER><ORDER_CODE>A-2</ORDER_CODE><CUSTOMER><EMAIL>b@x</EMAIL></CUSTOMER></ORDER>
      <ORDER><ORDER_CODE>A-3</ORDER_CODE></ORDER>
    </ORDERS>`;
    const orders = parseFastCentrikOrdersFeed(xml);
    expect(orders).toHaveLength(3);
    expect(orders[0]!.externalOrderId).toBe('A-1');
    expect(orders[0]!.customerEmail).toBe('a@x');
    expect(orders[2]!.customerEmail).toBeNull();
  });
});
