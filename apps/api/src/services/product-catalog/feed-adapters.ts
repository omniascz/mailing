/**
 * Product-feed adapters (#379-#382).
 *
 * Parses CZ/international product feeds into the shared NormalizedProduct
 * shape. Lives separately from `feed-ingestion.ts` so tests don't pull in
 * the DB layer.
 *
 * Supported formats:
 *   - Heureka XML   (`<SHOP><SHOPITEM>…</SHOPITEM></SHOP>`)
 *   - Zbozi.cz XML  (`<SHOP><SHOPITEM>…</SHOPITEM></SHOP>` — similar but
 *                   different element names)
 *   - Google Shopping RSS / Atom
 *   - custom_xml    — wildcard XML with a configured mapping (future work)
 */

import { parseXml, type XmlNode } from '../../integrations/fastcentrik/pure.js';

export interface NormalizedProduct {
  externalId: string;
  sku: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  imageUrl: string | null;
  url: string | null;
  categories: string[];
  stock: number | null;
}

export type FeedFormat = 'heureka' | 'zbozi' | 'google_shopping' | 'custom_xml';

/** Dispatch to the correct adapter based on format. */
export function parseProductFeed(format: FeedFormat, xml: string): NormalizedProduct[] {
  switch (format) {
    case 'heureka':
      return parseHeurekaFeed(xml);
    case 'zbozi':
      return parseZboziFeed(xml);
    case 'google_shopping':
      return parseGoogleShoppingFeed(xml);
    case 'custom_xml':
      // Placeholder — custom mapping arrives with #393 follow-up
      return [];
    default:
      throw new Error(`Unsupported feed format: ${format as string}`);
  }
}

// ─── Heureka ────────────────────────────────────────────────────────────────

/**
 * Heureka.cz XML feed spec. Each product is a `<SHOPITEM>` with:
 *   ITEM_ID, PRODUCTNAME, DESCRIPTION, URL, IMGURL, PRICE_VAT, CURRENCY,
 *   CATEGORYTEXT, DELIVERY_DATE, PRODUCTNO (sku)
 */
export function parseHeurekaFeed(xml: string): NormalizedProduct[] {
  const root = parseXml(xml);
  const items = collectByTag(root, 'SHOPITEM');
  return items.map((item) => ({
    externalId: text(item, 'ITEM_ID') || text(item, 'ITEMGROUP_ID') || text(item, 'PRODUCTNO'),
    sku: text(item, 'PRODUCTNO') || text(item, 'ITEM_ID'),
    name: text(item, 'PRODUCTNAME') || text(item, 'NAME') || '',
    description: text(item, 'DESCRIPTION') || null,
    price: Number(text(item, 'PRICE_VAT') || text(item, 'PRICE') || 0),
    currency: text(item, 'CURRENCY') || 'CZK',
    imageUrl: text(item, 'IMGURL') || null,
    url: text(item, 'URL') || null,
    categories: collectCategoryText(item),
    stock: text(item, 'DELIVERY_DATE') === '0' ? null : null,
  }));
}

function collectCategoryText(item: XmlNode): string[] {
  return collectByTag(item, 'CATEGORYTEXT')
    .map((n) => n.text.trim())
    .filter((t) => t.length > 0);
}

// ─── Zbozi.cz ───────────────────────────────────────────────────────────────

/**
 * Zbozi.cz XML feed spec. Mostly mirrors Heureka but uses different tag
 * names — ITEM instead of SHOPITEM, PRODUCT_NAME instead of PRODUCTNAME.
 */
export function parseZboziFeed(xml: string): NormalizedProduct[] {
  const root = parseXml(xml);
  const items = collectByTag(root, 'ITEM');
  return items.map((item) => ({
    externalId: text(item, 'ITEM_ID') || text(item, 'PRODUCTNO'),
    sku: text(item, 'PRODUCTNO') || text(item, 'ITEM_ID'),
    name: text(item, 'PRODUCT_NAME') || text(item, 'NAME') || '',
    description: text(item, 'DESCRIPTION') || null,
    price: Number(text(item, 'PRICE_VAT') || text(item, 'PRICE') || 0),
    currency: text(item, 'CURRENCY') || 'CZK',
    imageUrl: text(item, 'IMGURL') || null,
    url: text(item, 'URL') || null,
    categories: collectByTag(item, 'CATEGORY')
      .map((n) => n.text.trim())
      .filter((t) => t.length > 0),
    stock: null,
  }));
}

// ─── Google Shopping ─────────────────────────────────────────────────────────

/**
 * Google Shopping uses RSS 2.0 + the `g:` namespace. `<item>` elements contain
 * `g:id`, `g:title`, `g:description`, `g:link`, `g:image_link`, `g:price`,
 * `g:product_type`, `g:availability`.
 */
export function parseGoogleShoppingFeed(xml: string): NormalizedProduct[] {
  const root = parseXml(xml);
  const items = collectByTag(root, 'item');
  return items.map((item) => {
    const priceRaw = text(item, 'g:price') || text(item, 'price');
    const [amountStr, currencyStr] = priceRaw.split(/\s+/);
    return {
      externalId: text(item, 'g:id') || text(item, 'id'),
      sku: text(item, 'g:mpn') || text(item, 'g:id') || text(item, 'id'),
      name: text(item, 'g:title') || text(item, 'title') || '',
      description: text(item, 'g:description') || text(item, 'description') || null,
      price: Number(amountStr) || 0,
      currency: currencyStr ?? 'CZK',
      imageUrl: text(item, 'g:image_link') || null,
      url: text(item, 'g:link') || text(item, 'link') || null,
      categories: [text(item, 'g:product_type')].filter((c) => c.length > 0),
      stock: text(item, 'g:availability') === 'in stock' ? 1 : null,
    };
  });
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function collectByTag(root: XmlNode, tag: string): XmlNode[] {
  const needle = tag.toLowerCase();
  const out: XmlNode[] = [];
  const stack: XmlNode[] = [root];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const c of cur.children) {
      if (c.tag.toLowerCase() === needle) out.push(c);
      else stack.push(c);
    }
  }
  return out;
}

function text(node: XmlNode, childTag: string): string {
  const child = findChildByTag(node, childTag);
  return child ? child.text.trim() : '';
}

function findChildByTag(node: XmlNode, childTag: string): XmlNode | undefined {
  const needle = childTag.toLowerCase();
  for (const c of node.children) {
    if (c.tag.toLowerCase() === needle) return c;
  }
  return undefined;
}
