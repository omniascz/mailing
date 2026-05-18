/**
 * FastCentrik pure helpers (#368/#392).
 *
 * FastCentrik delivers order data as XML; product catalogue is exported as
 * the Heureka-flavoured product feed. This module handles parsing the order
 * XML into the shared NormalizedOrder shape.
 *
 * We use a minimal hand-rolled XML parser tuned for FastCentrik's flat
 * `<ORDER>` / `<ORDERS>` shape — pulling a full XML library in for one
 * schema is overkill and prevents streaming larger exports.
 */

export interface FastCentrikNormalizedOrderItem {
  sku?: string;
  name: string;
  qty: number;
  price: number;
}

export interface FastCentrikNormalizedOrder {
  externalOrderId: string;
  customerEmail: string | null;
  status: string;
  totalAmount: string;
  currency: string;
  items: FastCentrikNormalizedOrderItem[];
  orderedAt: Date | null;
}

// ─── XML mini-parser ─────────────────────────────────────────────────────────

/**
 * Minimal, allocation-light XML element parser. Returns a tree of
 * `{ tag, attrs, children | text }` nodes. Not a conformant parser — handles
 * the well-behaved XML FastCentrik emits (no CDATA, no namespaces, no mixed
 * content) and throws on malformed input.
 */
export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

export function parseXml(input: string): XmlNode {
  const stripped = input
    .replace(/<\?xml[^?]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
  const root = { tag: '#root', attrs: {}, children: [], text: '' } as XmlNode;
  let pos = 0;
  const stack: XmlNode[] = [root];

  while (pos < stripped.length) {
    const nextOpen = stripped.indexOf('<', pos);
    if (nextOpen < 0) break;

    const leadingText = stripped.slice(pos, nextOpen).trim();
    if (leadingText && stack[stack.length - 1]) {
      stack[stack.length - 1]!.text += decodeEntities(leadingText);
    }

    const nextClose = stripped.indexOf('>', nextOpen);
    if (nextClose < 0) throw new Error('Unterminated XML tag');
    const raw = stripped.slice(nextOpen + 1, nextClose).trim();

    if (raw.startsWith('/')) {
      // Closing tag
      const closingTag = raw.slice(1).trim();
      const top = stack[stack.length - 1];
      if (!top || top.tag !== closingTag) {
        throw new Error(`Mismatched closing tag </${closingTag}>`);
      }
      stack.pop();
    } else {
      const selfClose = raw.endsWith('/');
      const inner = selfClose ? raw.slice(0, -1).trim() : raw;
      const { tag, attrs } = splitTag(inner);
      const node: XmlNode = { tag, attrs, children: [], text: '' };
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(node);
      if (!selfClose) stack.push(node);
    }

    pos = nextClose + 1;
  }
  if (stack.length !== 1) {
    throw new Error(`Unclosed XML elements: ${stack.map((n) => n.tag).slice(1).join(',')}`);
  }
  return root;
}

function splitTag(inner: string): { tag: string; attrs: Record<string, string> } {
  const trimmed = inner.trim();
  const spaceIdx = trimmed.search(/\s/);
  if (spaceIdx < 0) return { tag: trimmed, attrs: {} };
  const tag = trimmed.slice(0, spaceIdx);
  const attrSrc = trimmed.slice(spaceIdx + 1);
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][\w.:-]*)\s*=\s*"([^"]*)"|([a-zA-Z_:][\w.:-]*)\s*=\s*'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrSrc)) !== null) {
    const name = (m[1] ?? m[3])!;
    const value = (m[2] ?? m[4]) ?? '';
    attrs[name] = decodeEntities(value);
  }
  return { tag, attrs };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Find the first child with a matching tag (case-insensitive), recursively. */
function findChild(node: XmlNode, tag: string): XmlNode | undefined {
  const needle = tag.toLowerCase();
  const stack: XmlNode[] = [node];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const c of cur.children) {
      if (c.tag.toLowerCase() === needle) return c;
      stack.push(c);
    }
  }
  return undefined;
}

function findChildren(node: XmlNode, tag: string): XmlNode[] {
  const needle = tag.toLowerCase();
  return node.children.filter((c) => c.tag.toLowerCase() === needle);
}

function text(node: XmlNode | undefined): string {
  return node ? node.text.trim() : '';
}

// ─── Order normalizers ──────────────────────────────────────────────────────

/**
 * Normalize a single `<ORDER>` node. Expected shape (FastCentrik docs):
 *   <ORDER>
 *     <ORDER_CODE>F-2026-0001</ORDER_CODE>
 *     <STATUS>new</STATUS>
 *     <CURRENCY>CZK</CURRENCY>
 *     <TOTAL_PRICE>2490.00</TOTAL_PRICE>
 *     <CREATED_AT>2026-04-24T10:15:30Z</CREATED_AT>
 *     <CUSTOMER>
 *       <EMAIL>anna@example.cz</EMAIL>
 *       <FIRST_NAME>Anna</FIRST_NAME>
 *     </CUSTOMER>
 *     <ITEMS>
 *       <ITEM><CODE>BOOK-01</CODE><NAME>Kniha</NAME><QTY>2</QTY><PRICE>499.00</PRICE></ITEM>
 *     </ITEMS>
 *   </ORDER>
 */
export function normalizeFastCentrikOrder(node: XmlNode): FastCentrikNormalizedOrder {
  const customerNode = findChild(node, 'CUSTOMER');
  const itemsNode = findChild(node, 'ITEMS');
  const createdAt = text(findChild(node, 'CREATED_AT')) || text(findChild(node, 'DATE'));

  const items: FastCentrikNormalizedOrderItem[] = itemsNode
    ? findChildren(itemsNode, 'ITEM').map((item) => ({
        ...(text(findChild(item, 'CODE'))
          ? { sku: text(findChild(item, 'CODE')) }
          : {}),
        name: text(findChild(item, 'NAME')),
        qty: Number(text(findChild(item, 'QTY')) || text(findChild(item, 'QUANTITY')) || 1),
        price: Number(text(findChild(item, 'PRICE')) || text(findChild(item, 'UNIT_PRICE')) || 0),
      }))
    : [];

  return {
    externalOrderId: text(findChild(node, 'ORDER_CODE')) || text(findChild(node, 'ID')),
    customerEmail: (customerNode && text(findChild(customerNode, 'EMAIL'))) || null,
    status: text(findChild(node, 'STATUS')) || 'unknown',
    totalAmount: text(findChild(node, 'TOTAL_PRICE')) || '0',
    currency: text(findChild(node, 'CURRENCY')) || 'CZK',
    items,
    orderedAt: createdAt ? new Date(createdAt) : null,
  };
}

/** Parse a full FastCentrik `<ORDERS>` feed into normalized orders. */
export function parseFastCentrikOrdersFeed(xml: string): FastCentrikNormalizedOrder[] {
  const root = parseXml(xml);
  const orderNodes: XmlNode[] = [];
  const stack: XmlNode[] = [root];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const c of cur.children) {
      if (c.tag.toLowerCase() === 'order') orderNodes.push(c);
      else stack.push(c);
    }
  }
  return orderNodes.map(normalizeFastCentrikOrder);
}
