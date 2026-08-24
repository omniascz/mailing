/**
 * Everything a customer typed, on its way into the body of an email.
 *
 * ─── Why this is not "email clients ignore <script> anyway" ──────────────────
 *
 * They do, and it is irrelevant. The same rendered HTML is served by
 * view-in-browser (api/services/campaigns/browser-view.ts calls this very
 * renderer and returns the string to a browser on our own domain), so a
 * `<script>` that a mail client drops is executing script in our origin the
 * moment the recipient clicks "view in browser". Measured on master before
 * this file existed: a text block containing `<script>alert(1)</script>`
 * arrived in the output verbatim.
 *
 * ─── Why text blocks go through it too ───────────────────────────────────────
 *
 * The code block is the obvious way in, but it is not the only one. Text
 * blocks have always embedded their content unescaped — `renderText` did
 * `parseMergeTags(...)` and dropped the result straight into a `<td>`. Putting
 * the sanitiser only on the new block would leave the older, wider hole open
 * and put two different rules on the same kind of input.
 *
 * ─── The control channel ─────────────────────────────────────────────────────
 *
 * `renderEmail` decides whether to append the compliance footer by searching
 * the assembled body for `data-fm-optout="1"`, and `renderPlainText` uses the
 * `<<fm-optout>>` sentinel the same way. Those are private signals between two
 * halves of the renderer. Customer HTML that can write them can switch off the
 * opt-out — verified on master: a text block containing
 * `<p data-fm-optout="1">Unsubscribe (not really)</p>` produced an email with
 * no unsubscribe link at all. Both markers are stripped here, which is why
 * they can stay cheap string checks on the other side.
 */

import sanitizeHtml from 'sanitize-html';

/** The private marker renderEmail looks for. Customer HTML must never carry it. */
export const OPT_OUT_MARKER_ATTR = 'data-fm-optout';
/** The private sentinel renderPlainText looks for. */
export const OPT_OUT_TEXT_SENTINEL = '<<fm-optout>>';

/**
 * Tags an email body may contain.
 *
 * Chosen from what the 81 built-in templates already use plus the table
 * scaffolding a hand-written block needs. Absent on purpose: `script`,
 * `style` (a stylesheet is a way to reach the rest of the document on the
 * view-in-browser page), `iframe`, `object`, `embed`, `form`, `input`,
 * `button`, `link`, `meta`, `base`, `svg` (which carries its own script
 * surface).
 */
export const ALLOWED_TAGS = [
  'p',
  'br',
  'hr',
  'div',
  'span',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'small',
  'sub',
  'sup',
  'mark',
  'a',
  'img',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'blockquote',
  'pre',
  'code',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'caption',
  'colgroup',
  'col',
  'center',
  'font',
] as const;

/**
 * URL schemes a link may use. `javascript:` is the omission that matters;
 * `data:` is left out of href on purpose (data:text/html is a navigation into
 * an attacker-controlled document) and allowed for images only.
 */
const HREF_SCHEMES = ['http', 'https', 'mailto', 'tel'];
const SRC_SCHEMES = ['http', 'https', 'cid', 'data'];

/**
 * CSS properties allowed inside a `style` attribute.
 *
 * An allowlist rather than a blocklist because the interesting attacks are the
 * ones nobody enumerated: `behavior:` (old IE), `expression()`, `-moz-binding`,
 * and `url(javascript:…)`. Everything here is a property an email layout
 * actually needs.
 */
const STYLE_PROPERTIES = [
  'background',
  'background-color',
  'background-image',
  'background-position',
  'background-repeat',
  'background-size',
  'border',
  'border-bottom',
  'border-collapse',
  'border-color',
  'border-left',
  'border-radius',
  'border-right',
  'border-spacing',
  'border-style',
  'border-top',
  'border-width',
  'color',
  'display',
  'float',
  'font',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'height',
  'letter-spacing',
  'line-height',
  'list-style',
  'list-style-type',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'max-height',
  'max-width',
  'min-height',
  'min-width',
  'opacity',
  'overflow',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'text-align',
  'text-decoration',
  'text-transform',
  'vertical-align',
  'white-space',
  'width',
  'word-break',
  'word-wrap',
  'mso-hide',
];

/** Any allowed property may hold any of these — no url(javascript:) among them. */
const STYLE_VALUE = [
  /^(?!.*(?:javascript|expression|behavior|vbscript|-moz-binding)\s*:)[^;{}]*$/i,
];

const styleAllowlist: Record<string, RegExp[]> = {};
for (const prop of STYLE_PROPERTIES) styleAllowlist[prop] = STYLE_VALUE;

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...ALLOWED_TAGS],
  allowedAttributes: {
    // No `on*` anywhere: sanitize-html drops every attribute not named here,
    // so event handlers go without needing to be listed.
    '*': [
      'style',
      'class',
      'align',
      'valign',
      'width',
      'height',
      'bgcolor',
      'dir',
      'lang',
      'title',
    ],
    a: ['href', 'target', 'rel', 'name', 'style', 'class', 'title'],
    img: ['src', 'alt', 'width', 'height', 'style', 'class', 'border', 'align', 'title'],
    table: [
      'role',
      'border',
      'cellpadding',
      'cellspacing',
      'width',
      'align',
      'bgcolor',
      'style',
      'class',
    ],
    td: ['colspan', 'rowspan', 'align', 'valign', 'width', 'height', 'bgcolor', 'style', 'class'],
    th: ['colspan', 'rowspan', 'align', 'valign', 'width', 'height', 'bgcolor', 'style', 'class'],
    font: ['color', 'face', 'size'],
    col: ['span', 'width', 'style'],
    colgroup: ['span', 'width', 'style'],
  },
  allowedSchemes: HREF_SCHEMES,
  allowedSchemesByTag: { img: SRC_SCHEMES },
  // A scheme-less or relative URL stays as written; the renderer's own links
  // are absolute and merge tags resolve before this runs.
  allowProtocolRelative: false,
  allowedStyles: { '*': styleAllowlist },
  // Comments can carry the marker as text and are useless in a body.
  allowedIframeHostnames: [],
  disallowedTagsMode: 'discard',
  // Keep the text inside a dropped tag rather than the tag itself: a
  // `<script>` disappears entirely (nonTextTags), but a `<form>` keeps the
  // fields' visible labels.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe'],
};

/**
 * Strip the renderer's own control markers from customer text.
 *
 * Done as a string pass rather than as an attribute rule because the marker
 * has to go whether it appears as an attribute, inside a comment, or as bare
 * text in the plain-text half where there is no HTML to parse.
 */
export function stripControlMarkers(input: string): string {
  return input
    .replace(new RegExp(`${OPT_OUT_MARKER_ATTR}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'gi'), '')
    .replace(new RegExp(OPT_OUT_MARKER_ATTR, 'gi'), '')
    .split(OPT_OUT_TEXT_SENTINEL)
    .join('');
}

/**
 * Sanitise a fragment of customer-authored HTML for the email body.
 *
 * Runs AFTER merge-tag substitution on purpose: a resolved value is part of
 * the document the recipient sees, and a contact whose first name is
 * `<img src=x onerror=alert(1)>` is a real thing an importer can produce.
 */
export function sanitizeUserHtml(input: string): string {
  if (!input) return '';
  return sanitizeHtml(stripControlMarkers(input), OPTIONS);
}

/**
 * Plain-text side: no HTML survives, so the only thing to remove is the
 * sentinel. Tag stripping is the plain-text renderer's own job.
 */
export function sanitizeUserText(input: string): string {
  return stripControlMarkers(input);
}
