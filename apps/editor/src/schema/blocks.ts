import { z } from 'zod';

/**
 * Block JSON schema for the ForgeMsg email editor.
 *
 * Every block has a unique `id`, a discriminant `type`, and a shared `styles`
 * object for padding/margin/background/radius. Type-specific props live on the
 * block itself. The schema is tree-shaped because ColumnsBlock, HeroBlock, and
 * DynamicBlock all recursively embed other blocks.
 */

export const networkTypeSchema = z.enum([
  'facebook',
  'twitter',
  'instagram',
  'linkedin',
  'youtube',
]);

export const blockStylesSchema = z.object({
  padding: z.string().optional(),
  margin: z.string().optional(),
  backgroundColor: z.string().optional(),
  borderRadius: z.string().optional(),
  border: z.string().optional(),
});
export type BlockStyles = z.infer<typeof blockStylesSchema>;

const baseBlockShape = {
  id: z.string().min(1),
  styles: blockStylesSchema.optional(),
};

// ---------------------------------------------------------------------------
// Condition subset used by DynamicBlock.
//
// Intentionally small: full segment logic lives in apps/api. DynamicBlock only
// needs single-contact predicate evaluation at render time, so we support the
// operators a non-SQL in-memory evaluator can handle.
// ---------------------------------------------------------------------------

export const dynamicRuleOpSchema = z.enum([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'not_contains',
  'in',
  'not_in',
  'is_set',
  'is_not_set',
  'has_tag',
  'not_has_tag',
]);
export type DynamicRuleOp = z.infer<typeof dynamicRuleOpSchema>;

export const dynamicRuleSchema = z.object({
  field: z.string().min(1),
  op: dynamicRuleOpSchema,
  value: z.unknown().optional(),
});
export type DynamicRule = z.infer<typeof dynamicRuleSchema>;

export interface DynamicCondition {
  operator: 'AND' | 'OR';
  rules: DynamicRule[];
  groups?: DynamicCondition[];
  negate?: boolean;
}

export const dynamicConditionSchema: z.ZodType<DynamicCondition> = z.lazy(() =>
  z.object({
    operator: z.enum(['AND', 'OR']),
    rules: z.array(dynamicRuleSchema),
    groups: z.array(dynamicConditionSchema).optional(),
    negate: z.boolean().optional(),
  }),
);

// ---------------------------------------------------------------------------
// Leaf blocks
// ---------------------------------------------------------------------------

export const textBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('text'),
  content: z.string(), // HTML; user text goes here
  fontSize: z.string().default('16px'),
  fontFamily: z.string().default('Arial, Helvetica, sans-serif'),
  color: z.string().default('#111827'),
  lineHeight: z.string().default('1.5'),
  textAlign: z.enum(['left', 'center', 'right', 'justify']).default('left'),
});
export type TextBlock = z.infer<typeof textBlockSchema>;

export const imageBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('image'),
  src: z.string().url().or(z.string().startsWith('/')),
  alt: z.string().default(''),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  link: z.string().url().optional(),
  align: z.enum(['left', 'center', 'right']).default('center'),
});
export type ImageBlock = z.infer<typeof imageBlockSchema>;

export const buttonBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('button'),
  text: z.string().min(1),
  url: z.string().url(),
  backgroundColor: z.string().default('#2563eb'),
  textColor: z.string().default('#ffffff'),
  borderRadius: z.string().default('6px'),
  align: z.enum(['left', 'center', 'right']).default('center'),
  size: z.enum(['sm', 'md', 'lg']).default('md'),
});
export type ButtonBlock = z.infer<typeof buttonBlockSchema>;

export const dividerBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('divider'),
  color: z.string().default('#e5e7eb'),
  thickness: z.number().int().min(1).max(20).default(1),
  widthPercent: z.number().int().min(1).max(100).default(100),
});
export type DividerBlock = z.infer<typeof dividerBlockSchema>;

export const spacerBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('spacer'),
  height: z.number().int().min(1).max(500).default(20),
});
export type SpacerBlock = z.infer<typeof spacerBlockSchema>;

/**
 * Raw HTML the customer wrote themselves — the escape hatch for anything the
 * editor has no block for.
 *
 * The content is NOT trusted. It is sanitised at render time, in
 * render/sanitize.ts, against an allowlist; nothing is validated here beyond a
 * length bound, because a zod schema is the wrong place to decide what HTML is
 * safe and a second opinion on that question is how the two disagree.
 */
export const codeBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('code'),
  /** Bounded so one block cannot be the whole message. */
  html: z.string().max(50_000),
});
export type CodeBlock = z.infer<typeof codeBlockSchema>;

/**
 * Share buttons for the RECIPIENT — "forward this", "post this".
 *
 * Not an extension of `social`, which is the sender's own profile links: that
 * block points AT the sender and its URLs are fixed for the campaign, while
 * this one points at the campaign and its URL differs per recipient. Merging
 * them would put two unrelated things behind one type and force every consumer
 * to branch on a mode flag.
 */
export const shareNetworkSchema = z.enum(['email', 'facebook', 'x', 'linkedin', 'whatsapp']);
export type ShareNetwork = z.infer<typeof shareNetworkSchema>;

export const shareBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('share'),
  networks: z.array(shareNetworkSchema).min(1).default(['email', 'facebook', 'x', 'whatsapp']),
  /** Prefilled subject/title for the share, before merge tags are resolved. */
  shareText: z.string().max(200).default(''),
  label: z.string().max(120).default(''),
  align: z.enum(['left', 'center', 'right']).default('center'),
  fontSize: z.string().default('13px'),
  color: z.string().default('#2563eb'),
});
export type ShareBlock = z.infer<typeof shareBlockSchema>;

export const socialBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('social'),
  networks: z.array(
    z.object({
      type: networkTypeSchema,
      url: z.string().url(),
    }),
  ),
  iconSize: z.number().int().min(16).max(64).default(32),
  align: z.enum(['left', 'center', 'right']).default('center'),
});
export type SocialBlock = z.infer<typeof socialBlockSchema>;

/**
 * Product block (#Klaviyo parity) — a single merchandised product card:
 * image, title, price (with optional strike-through compare-at), short
 * description, and a CTA button. String fields intentionally allow merge tags
 * ({{product.title}}, {{product.price}}, …) so the same block can render a
 * fixed product OR a per-recipient recommendation — hence NO .url() validation
 * on src/link fields (a raw merge tag is not a valid URL until resolved).
 */
export const productBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('product'),
  title: z.string(),
  imageSrc: z.string(),
  price: z.string(),
  compareAtPrice: z.string().default(''),
  description: z.string().default(''),
  productUrl: z.string(),
  ctaText: z.string().default('Shop now'),
  ctaBackgroundColor: z.string().default('#2563eb'),
  ctaTextColor: z.string().default('#ffffff'),
  titleColor: z.string().default('#111827'),
  priceColor: z.string().default('#111827'),
  fontFamily: z.string().default('Arial, Helvetica, sans-serif'),
  imagePosition: z.enum(['top', 'left', 'right']).default('top'),
  align: z.enum(['left', 'center', 'right']).default('center'),
});
export type ProductBlock = z.infer<typeof productBlockSchema>;

/**
 * Video block — email clients can't play inline video, so this renders a
 * clickable thumbnail with a play-button overlay that links to the video
 * (YouTube/Vimeo/hosted). src fields skip .url() validation so a merge tag or
 * relative path is allowed (resolved at render time), mirroring ProductBlock.
 */
export const videoBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('video'),
  videoUrl: z.string(),
  thumbnailSrc: z.string(),
  alt: z.string().default(''),
  width: z.number().int().positive().optional(),
  playButtonColor: z.string().default('#ffffff'),
  overlayColor: z.string().default('rgba(0,0,0,0.35)'),
  align: z.enum(['left', 'center', 'right']).default('center'),
});
export type VideoBlock = z.infer<typeof videoBlockSchema>;

/**
 * Coupon block — a merchandised discount-code card. `code` accepts a literal
 * value OR a merge tag ({{coupon_code:batchId}}) so per-recipient unique codes
 * resolve at send time. Optional CTA button links to the store.
 */
export const couponBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('coupon'),
  code: z.string(),
  headline: z.string().default('Your discount'),
  description: z.string().default(''),
  expiryText: z.string().default(''),
  codeBackgroundColor: z.string().default('#f3f4f6'),
  codeTextColor: z.string().default('#111827'),
  borderColor: z.string().default('#2563eb'),
  borderStyle: z.enum(['solid', 'dashed', 'dotted']).default('dashed'),
  ctaText: z.string().default(''),
  ctaUrl: z.string().default(''),
  ctaBackgroundColor: z.string().default('#2563eb'),
  ctaTextColor: z.string().default('#ffffff'),
  fontFamily: z.string().default('Arial, Helvetica, sans-serif'),
  align: z.enum(['left', 'center', 'right']).default('center'),
});
export type CouponBlock = z.infer<typeof couponBlockSchema>;

export const footerBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('footer'),
  content: z.string(),
  // unsubscribeLink is auto-injected by render engine via merge tag.
  showUnsubscribe: z.boolean().default(true),
  textAlign: z.enum(['left', 'center', 'right']).default('center'),
  fontSize: z.string().default('12px'),
  color: z.string().default('#6b7280'),
});
export type FooterBlock = z.infer<typeof footerBlockSchema>;

// ---------------------------------------------------------------------------
// Container blocks (recursive)
// ---------------------------------------------------------------------------

export interface ColumnsBlock {
  id: string;
  type: 'columns';
  styles?: BlockStyles;
  columns: Block[][];
  columnRatios: number[];
  gap?: string;
}

export interface HeroBlock {
  id: string;
  type: 'hero';
  styles?: BlockStyles;
  backgroundImage?: string;
  backgroundColor?: string;
  overlayColor?: string;
  minHeight?: string;
  content: Block[];
}

export interface DynamicBlock {
  id: string;
  type: 'dynamic';
  styles?: BlockStyles;
  condition: DynamicCondition;
  ifContent: Block[];
  elseContent: Block[];
  label?: string;
}

export type LeafBlock =
  | TextBlock
  | ImageBlock
  | ButtonBlock
  | DividerBlock
  | SpacerBlock
  | SocialBlock
  | CodeBlock
  | ShareBlock
  | ProductBlock
  | VideoBlock
  | CouponBlock
  | FooterBlock;

export type Block = LeafBlock | ColumnsBlock | HeroBlock | DynamicBlock;

// Recursive schemas use z.lazy() so the union can self-reference. We can't use
// z.discriminatedUnion here because container schemas are typed as ZodType (the
// lazy self-reference doesn't produce a ZodObject), and discriminatedUnion
// requires ZodObject arms. z.union gives the same runtime validation.
// Input type intentionally `any` — defaults on leaf schemas mean the input
// shape includes optional fields that aren't present in the output Block type.
export const blockSchema: z.ZodType<Block, z.ZodTypeDef, any> = z.lazy(() =>
  z.union([
    textBlockSchema,
    imageBlockSchema,
    buttonBlockSchema,
    dividerBlockSchema,
    spacerBlockSchema,
    socialBlockSchema,
    codeBlockSchema,
    shareBlockSchema,
    productBlockSchema,
    videoBlockSchema,
    couponBlockSchema,
    footerBlockSchema,
    columnsBlockSchema,
    heroBlockSchema,
    dynamicBlockSchema,
  ]),
);

export const columnsBlockSchema: z.ZodType<ColumnsBlock> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      type: z.literal('columns'),
      styles: blockStylesSchema.optional(),
      columns: z.array(z.array(blockSchema)),
      columnRatios: z.array(z.number().positive()),
      gap: z.string().optional(),
    })
    .refine((v) => v.columns.length === v.columnRatios.length, {
      message: 'columns and columnRatios must have matching lengths',
    }),
);

export const heroBlockSchema: z.ZodType<HeroBlock> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    type: z.literal('hero'),
    styles: blockStylesSchema.optional(),
    backgroundImage: z.string().optional(),
    backgroundColor: z.string().optional(),
    overlayColor: z.string().optional(),
    minHeight: z.string().optional(),
    content: z.array(blockSchema),
  }),
);

export const dynamicBlockSchema: z.ZodType<DynamicBlock> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    type: z.literal('dynamic'),
    styles: blockStylesSchema.optional(),
    condition: dynamicConditionSchema,
    ifContent: z.array(blockSchema),
    elseContent: z.array(blockSchema),
    label: z.string().optional(),
  }),
);

// ---------------------------------------------------------------------------
// Email-level schema
// ---------------------------------------------------------------------------

export const globalStylesSchema = z.object({
  backgroundColor: z.string().default('#f3f4f6'),
  contentBackgroundColor: z.string().default('#ffffff'),
  fontFamily: z.string().default('Arial, Helvetica, sans-serif'),
  linkColor: z.string().default('#2563eb'),
  textColor: z.string().default('#111827'),
  contentWidth: z.number().int().min(320).max(800).default(600),
});
export type GlobalStyles = z.infer<typeof globalStylesSchema>;

export const emailSchema = z.object({
  subject: z.string().min(1).max(998),
  preheader: z.string().max(200).default(''),
  globalStyles: globalStylesSchema,
  blocks: z.array(blockSchema),
});
export type EmailSchema = z.infer<typeof emailSchema>;

// Convenience type guard helpers
export function isContainerBlock(block: Block): block is ColumnsBlock | HeroBlock | DynamicBlock {
  return block.type === 'columns' || block.type === 'hero' || block.type === 'dynamic';
}

export const BLOCK_TYPES = [
  'text',
  'image',
  'button',
  'divider',
  'spacer',
  'columns',
  'hero',
  'social',
  'code',
  'share',
  'product',
  'video',
  'coupon',
  'footer',
  'dynamic',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];
