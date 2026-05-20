/**
 * Commerce products / line items (#310).
 * Extends the existing product catalog with price tiers, recurring billing flag,
 * and full CRUD for use in quotes and invoices.
 */

import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { products } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export interface LineItem {
  productId?: string;
  sku: string;
  name: string;
  description?: string;
  qty: number;
  unitPrice: number;
  discount?: number; // percentage 0-100
  taxRate?: number; // percentage 0-100
  total: number; // computed: qty * unitPrice * (1 - discount/100)
  recurring?: boolean;
  recurringInterval?: 'monthly' | 'yearly';
}

export function computeLineItem(item: Omit<LineItem, 'total'>): LineItem {
  const discount = item.discount ?? 0;
  const total = item.qty * item.unitPrice * (1 - discount / 100);
  return { ...item, total: Math.round(total * 100) / 100 };
}

export function computeTotals(lineItems: LineItem[], taxRate = 0) {
  const subtotal = lineItems.reduce((s, i) => s + i.total, 0);
  const discountTotal = lineItems.reduce(
    (s, i) => s + (i.discount ? i.qty * i.unitPrice * (i.discount / 100) : 0),
    0,
  );
  const taxTotal = subtotal * (taxRate / 100);
  const total = subtotal + taxTotal;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discountTotal: Math.round(discountTotal * 100) / 100,
    taxTotal: Math.round(taxTotal * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listProducts(
  orgId: string,
  opts?: { active?: boolean; limit?: number; offset?: number },
) {
  return db
    .select()
    .from(products)
    .where(
      opts?.active !== undefined
        ? and(eq(products.orgId, orgId), eq(products.active, opts.active))
        : eq(products.orgId, orgId),
    )
    .orderBy(desc(products.createdAt))
    .limit(opts?.limit ?? 100)
    .offset(opts?.offset ?? 0);
}

export async function getProduct(orgId: string, productId: string) {
  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.orgId, orgId), eq(products.id, productId)));
  if (!row) throw AppError.notFound('Product not found');
  return row;
}

export async function createProduct(
  orgId: string,
  input: {
    sku: string;
    name: string;
    description?: string;
    price: number | string;
    currency?: string;
    imageUrl?: string;
    url?: string;
    categories?: string[];
    tags?: string[];
    stock?: number;
    active?: boolean;
    metadata?: Record<string, unknown>;
  },
) {
  const [row] = await db
    .insert(products)
    .values({ orgId, ...input, price: String(input.price) })
    .returning();
  return row;
}

export async function updateProduct(
  orgId: string,
  productId: string,
  input: Partial<{
    name: string;
    description: string;
    price: number | string;
    currency: string;
    imageUrl: string;
    stock: number;
    active: boolean;
    metadata: Record<string, unknown>;
  }>,
) {
  const [row] = await db
    .update(products)
    .set({
      ...input,
      price: input.price != null ? String(input.price) : undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(products.orgId, orgId), eq(products.id, productId)))
    .returning();
  if (!row) throw AppError.notFound('Product not found');
  return row;
}

export async function deleteProduct(orgId: string, productId: string) {
  const [row] = await db
    .update(products)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(products.orgId, orgId), eq(products.id, productId)))
    .returning({ id: products.id });
  if (!row) throw AppError.notFound('Product not found');
}

// Build line items from product IDs (for quote/invoice auto-fill)
export async function buildLineItemsFromProducts(
  orgId: string,
  items: Array<{ productId: string; qty: number; discount?: number }>,
) {
  return Promise.all(
    items.map(async (item) => {
      const product = await getProduct(orgId, item.productId);
      return computeLineItem({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        description: product.description ?? undefined,
        qty: item.qty,
        unitPrice: parseFloat(String(product.price)),
        discount: item.discount ?? 0,
      });
    }),
  );
}
