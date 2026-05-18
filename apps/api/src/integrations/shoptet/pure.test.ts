import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  verifyShoptetWebhookSignature,
  normalizeShoptetOrderPayload,
  normalizeEshopUrl,
} from './pure.js';

describe('verifyShoptetWebhookSignature', () => {
  it('accepts a correctly signed payload', () => {
    const secret = 'shhh';
    const body = JSON.stringify({ event: 'order.create', orderCode: 'E20260424001' });
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyShoptetWebhookSignature(body, sig, secret)).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const secret = 'shhh';
    const body = JSON.stringify({ event: 'order.create' });
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyShoptetWebhookSignature(body + 'x', sig, secret)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const body = 'foo';
    const sig = crypto.createHmac('sha256', 'right').update(body).digest('hex');
    expect(verifyShoptetWebhookSignature(body, sig, 'wrong')).toBe(false);
  });

  it('rejects a malformed signature length', () => {
    expect(verifyShoptetWebhookSignature('foo', 'short', 'secret')).toBe(false);
  });
});

describe('normalizeShoptetOrderPayload', () => {
  it('flattens customer + items from a realistic Shoptet payload', () => {
    const raw = {
      code: 'E20260424001',
      creationTime: '2026-04-24T10:15:30+02:00',
      status: 'pending',
      totalPrice: '1249.00',
      currency: 'CZK',
      customer: {
        email: 'petr@example.cz',
        firstName: 'Petr',
        lastName: 'Novák',
        phone: '+420777123456',
      },
      items: [
        { name: 'Kniha o Praze', amount: 2, itemPriceWithVat: '499.00', code: 'BOOK-01' },
        { name: 'Pohled', amount: 1, itemPriceWithVat: '251.00' },
      ],
    };
    const order = normalizeShoptetOrderPayload(raw);
    expect(order).toMatchObject({
      externalOrderId: 'E20260424001',
      customerEmail: 'petr@example.cz',
      status: 'pending',
      totalAmount: '1249.00',
      currency: 'CZK',
    });
    expect(order.items).toHaveLength(2);
    expect(order.items[0]).toMatchObject({ sku: 'BOOK-01', name: 'Kniha o Praze', qty: 2, price: 499 });
    expect(order.orderedAt).toBeInstanceOf(Date);
  });

  it('defaults to CZK currency when missing', () => {
    const order = normalizeShoptetOrderPayload({ code: 'X', items: [], customer: {} });
    expect(order.currency).toBe('CZK');
    expect(order.customerEmail).toBeNull();
    expect(order.items).toEqual([]);
  });

  it('falls back to id when code is missing', () => {
    const order = normalizeShoptetOrderPayload({ id: 9999 });
    expect(order.externalOrderId).toBe('9999');
  });
});

describe('normalizeEshopUrl', () => {
  it('adds https:// when missing', () => {
    expect(normalizeEshopUrl('example.myshoptet.com')).toBe('https://example.myshoptet.com');
  });

  it('strips trailing slashes', () => {
    expect(normalizeEshopUrl('https://obchod.example.cz/')).toBe('https://obchod.example.cz');
    expect(normalizeEshopUrl('https://obchod.example.cz///')).toBe('https://obchod.example.cz');
  });

  it('lowercases the host', () => {
    expect(normalizeEshopUrl('https://OBCHOD.Example.CZ')).toBe('https://obchod.example.cz');
  });

  it('preserves custom paths without trailing slash', () => {
    expect(normalizeEshopUrl('https://example.com/eshop/')).toBe('https://example.com/eshop');
  });
});
