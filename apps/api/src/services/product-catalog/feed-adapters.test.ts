import { describe, it, expect } from 'vitest';
import {
  parseHeurekaFeed,
  parseZboziFeed,
  parseGoogleShoppingFeed,
  parseProductFeed,
} from './feed-adapters.js';

describe('parseHeurekaFeed', () => {
  it('extracts the canonical Heureka shopitem fields', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <SHOP>
        <SHOPITEM>
          <ITEM_ID>101</ITEM_ID>
          <PRODUCTNAME>Kniha o Praze</PRODUCTNAME>
          <DESCRIPTION>Průvodce hlavním městem.</DESCRIPTION>
          <URL>https://eshop.cz/kniha</URL>
          <IMGURL>https://eshop.cz/img/kniha.jpg</IMGURL>
          <PRICE_VAT>499.00</PRICE_VAT>
          <CURRENCY>CZK</CURRENCY>
          <PRODUCTNO>BOOK-01</PRODUCTNO>
          <CATEGORYTEXT>Knihy | Cestování</CATEGORYTEXT>
        </SHOPITEM>
        <SHOPITEM>
          <ITEM_ID>102</ITEM_ID>
          <PRODUCTNAME>Pohled</PRODUCTNAME>
          <PRICE_VAT>29</PRICE_VAT>
        </SHOPITEM>
      </SHOP>`;
    const products = parseHeurekaFeed(xml);
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({
      externalId: '101',
      sku: 'BOOK-01',
      name: 'Kniha o Praze',
      price: 499,
      currency: 'CZK',
      imageUrl: 'https://eshop.cz/img/kniha.jpg',
      url: 'https://eshop.cz/kniha',
    });
    expect(products[0]!.categories).toContain('Knihy | Cestování');
    expect(products[1]!.price).toBe(29);
    expect(products[1]!.currency).toBe('CZK');
  });
});

describe('parseZboziFeed', () => {
  it('extracts Zbozi.cz <ITEM> fields', () => {
    const xml = `<SHOP>
      <ITEM>
        <ITEM_ID>Z-42</ITEM_ID>
        <PRODUCTNO>ZS-42</PRODUCTNO>
        <PRODUCT_NAME>Zbozi produkt</PRODUCT_NAME>
        <PRICE_VAT>990</PRICE_VAT>
        <URL>https://x</URL>
        <IMGURL>https://img</IMGURL>
        <CATEGORY>Elektronika</CATEGORY>
      </ITEM>
    </SHOP>`;
    const products = parseZboziFeed(xml);
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      externalId: 'Z-42',
      sku: 'ZS-42',
      name: 'Zbozi produkt',
      price: 990,
      categories: ['Elektronika'],
    });
  });
});

describe('parseGoogleShoppingFeed', () => {
  it('parses g: namespaced RSS items', () => {
    const xml = `<?xml version="1.0"?>
      <rss>
        <channel>
          <item>
            <g:id>G-1</g:id>
            <g:title>Ultra Widget</g:title>
            <g:description>Very good widget</g:description>
            <g:link>https://shop/widget</g:link>
            <g:image_link>https://shop/img</g:image_link>
            <g:price>1499.00 CZK</g:price>
            <g:product_type>Tools &gt; Widgets</g:product_type>
            <g:availability>in stock</g:availability>
          </item>
        </channel>
      </rss>`;
    const products = parseGoogleShoppingFeed(xml);
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      externalId: 'G-1',
      name: 'Ultra Widget',
      price: 1499,
      currency: 'CZK',
      imageUrl: 'https://shop/img',
      url: 'https://shop/widget',
      stock: 1,
    });
    expect(products[0]!.categories).toContain('Tools > Widgets');
  });

  it('treats missing availability as null stock', () => {
    const xml = `<rss><channel><item>
      <g:id>G-2</g:id>
      <g:title>No stock info</g:title>
      <g:price>99 CZK</g:price>
    </item></channel></rss>`;
    const [product] = parseGoogleShoppingFeed(xml);
    expect(product!.stock).toBeNull();
  });
});

describe('parseProductFeed (dispatch)', () => {
  it('routes to the correct adapter', () => {
    const heu = parseProductFeed('heureka', '<SHOP><SHOPITEM><ITEM_ID>1</ITEM_ID></SHOPITEM></SHOP>');
    const zbo = parseProductFeed('zbozi', '<SHOP><ITEM><ITEM_ID>z1</ITEM_ID></ITEM></SHOP>');
    expect(heu).toHaveLength(1);
    expect(zbo).toHaveLength(1);
    expect(heu[0]!.externalId).toBe('1');
    expect(zbo[0]!.externalId).toBe('z1');
  });

  it('returns an empty array for custom_xml until mapping is configured', () => {
    expect(parseProductFeed('custom_xml', '<x/>')).toEqual([]);
  });
});
