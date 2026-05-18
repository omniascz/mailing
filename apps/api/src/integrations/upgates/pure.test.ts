import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  verifyUpgatesWebhookSignature,
  normalizeUpgatesOrderPayload,
  normalizeUpgatesAdminUrl,
  buildUpgatesAuthHeader,
} from './pure.js';

describe('verifyUpgatesWebhookSignature', () => {
  it('accepts a correctly signed payload', () => {
    const secret = 's3cret';
    const body = JSON.stringify({ order_number: 'U-2026-0001' });
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyUpgatesWebhookSignature(body, sig, secret)).toBe(true);
  });

  it('rejects a wrong secret', () => {
    const body = JSON.stringify({ order_number: 'U-2026-0001' });
    const sig = crypto.createHmac('sha256', 'right').update(body).digest('hex');
    expect(verifyUpgatesWebhookSignature(body, sig, 'wrong')).toBe(false);
  });

  it('rejects malformed signatures', () => {
    expect(verifyUpgatesWebhookSignature('body', 'short', 'secret')).toBe(false);
  });
});

describe('normalizeUpgatesOrderPayload', () => {
  it('flattens customer + products', () => {
    const raw = {
      order_number: 'U-2026-0001',
      date: '2026-04-24T10:15:30+02:00',
      status: 'new',
      total_with_vat: '2490.00',
      currency: 'CZK',
      customer: {
        email: 'anna@example.cz',
        firstname_invoice: 'Anna',
        surname_invoice: 'Dvořáková',
      },
      products: [
        { code: 'BOOK-01', title: 'Kniha o Praze', quantity: 2, unit_price_with_vat: '499.00' },
        { title: 'Pohled', quantity: 1, unit_price_with_vat: '1492.00' },
      ],
    };
    const order = normalizeUpgatesOrderPayload(raw);
    expect(order).toMatchObject({
      externalOrderId: 'U-2026-0001',
      customerEmail: 'anna@example.cz',
      status: 'new',
      totalAmount: '2490.00',
      currency: 'CZK',
    });
    expect(order.items).toHaveLength(2);
    expect(order.items[0]).toMatchObject({ sku: 'BOOK-01', qty: 2, price: 499 });
    expect(order.orderedAt).toBeInstanceOf(Date);
  });

  it('defaults missing currency to CZK', () => {
    const order = normalizeUpgatesOrderPayload({
      order_number: 'X',
      customer: {},
      products: [],
    });
    expect(order.currency).toBe('CZK');
    expect(order.customerEmail).toBeNull();
  });

  it('accepts legacy items[] payload shape', () => {
    const order = normalizeUpgatesOrderPayload({
      orderNumber: 'Y-42',
      customer: { email: 'x@y.z' },
      items: [{ name: 'Legacy', amount: 3, price: 10 }],
    });
    expect(order.externalOrderId).toBe('Y-42');
    expect(order.items).toEqual([{ name: 'Legacy', qty: 3, price: 10 }]);
  });
});

describe('normalizeUpgatesAdminUrl', () => {
  it('adds https:// when missing', () => {
    expect(normalizeUpgatesAdminUrl('shop.admin.upgates.com')).toBe(
      'https://shop.admin.upgates.com',
    );
  });

  it('lowercases and strips trailing slashes', () => {
    expect(normalizeUpgatesAdminUrl('https://SHOP.ADMIN.Upgates.COM/')).toBe(
      'https://shop.admin.upgates.com',
    );
  });
});

describe('buildUpgatesAuthHeader', () => {
  it('produces a Basic auth header with base64 login:key', () => {
    const h = buildUpgatesAuthHeader('admin', 'secret');
    expect(h).toBe(`Basic ${Buffer.from('admin:secret').toString('base64')}`);
  });
});
