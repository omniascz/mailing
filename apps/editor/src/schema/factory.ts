import type {
  Block,
  BlockType,
  TextBlock,
  ImageBlock,
  ButtonBlock,
  DividerBlock,
  SpacerBlock,
  SocialBlock,
  FooterBlock,
  ColumnsBlock,
  HeroBlock,
  DynamicBlock,
  EmailSchema,
} from './blocks.js';

let counter = 0;
/**
 * Stable, deterministic id generator for blocks. Uses crypto.randomUUID when
 * available (browser/Node) and falls back to an incrementing counter for
 * environments that lack it (e.g. some SSR shims). Output is opaque to the
 * render engine.
 */
function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  counter += 1;
  return `${prefix}_${counter.toString(36)}_${Date.now().toString(36)}`;
}

export function createEmptyEmail(): EmailSchema {
  return {
    subject: 'Untitled email',
    preheader: '',
    globalStyles: {
      backgroundColor: '#f3f4f6',
      contentBackgroundColor: '#ffffff',
      fontFamily: 'Arial, Helvetica, sans-serif',
      linkColor: '#2563eb',
      textColor: '#111827',
      contentWidth: 600,
    },
    blocks: [],
  };
}

export function createBlock(type: BlockType): Block {
  switch (type) {
    case 'text':
      return {
        id: newId('text'),
        type: 'text',
        content: 'Start typing your content...',
        fontSize: '16px',
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: '#111827',
        lineHeight: '1.5',
        textAlign: 'left',
      } satisfies TextBlock;
    case 'image':
      return {
        id: newId('img'),
        type: 'image',
        src: 'https://via.placeholder.com/600x300?text=Image',
        alt: '',
        align: 'center',
      } satisfies ImageBlock;
    case 'button':
      return {
        id: newId('btn'),
        type: 'button',
        text: 'Click me',
        url: 'https://example.com',
        backgroundColor: '#2563eb',
        textColor: '#ffffff',
        borderRadius: '6px',
        align: 'center',
        size: 'md',
      } satisfies ButtonBlock;
    case 'divider':
      return {
        id: newId('div'),
        type: 'divider',
        color: '#e5e7eb',
        thickness: 1,
        widthPercent: 100,
      } satisfies DividerBlock;
    case 'spacer':
      return {
        id: newId('sp'),
        type: 'spacer',
        height: 20,
      } satisfies SpacerBlock;
    case 'columns':
      return {
        id: newId('col'),
        type: 'columns',
        columns: [[], []],
        columnRatios: [1, 1],
      } satisfies ColumnsBlock;
    case 'hero':
      return {
        id: newId('hero'),
        type: 'hero',
        backgroundColor: '#111827',
        minHeight: '240px',
        content: [],
      } satisfies HeroBlock;
    case 'social':
      return {
        id: newId('soc'),
        type: 'social',
        networks: [
          { type: 'facebook', url: 'https://facebook.com' },
          { type: 'twitter', url: 'https://twitter.com' },
          { type: 'instagram', url: 'https://instagram.com' },
        ],
        iconSize: 32,
        align: 'center',
      } satisfies SocialBlock;
    case 'footer':
      return {
        id: newId('foot'),
        type: 'footer',
        content: '© {{current_year}} Your Company. All rights reserved.',
        showUnsubscribe: true,
        textAlign: 'center',
        fontSize: '12px',
        color: '#6b7280',
      } satisfies FooterBlock;
    case 'dynamic':
      return {
        id: newId('dyn'),
        type: 'dynamic',
        condition: {
          operator: 'AND',
          rules: [{ field: 'tags', op: 'has_tag', value: 'VIP' }],
        },
        ifContent: [],
        elseContent: [],
        label: 'Show to VIP contacts',
      } satisfies DynamicBlock;
  }
}
