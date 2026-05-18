import { describe, it, expect } from 'vitest';
import { renderPlainText } from './plain-text.js';
import type { EmailSchema } from '../schema/blocks.js';

function baseSchema(overrides: Partial<EmailSchema> = {}): EmailSchema {
  return {
    subject: 'Hello',
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
    ...overrides,
  };
}

describe('renderPlainText', () => {
  it('emits just the subject when there are no blocks or preheader', () => {
    expect(renderPlainText(baseSchema({ subject: 'Hi there' }))).toBe('Hi there');
  });

  it('includes the preheader on its own line', () => {
    expect(
      renderPlainText(baseSchema({ subject: 'Subj', preheader: 'Sneak peek' })),
    ).toBe('Subj\n\nSneak peek');
  });

  it('renders text blocks and strips inline HTML', () => {
    const out = renderPlainText(
      baseSchema({
        blocks: [
          {
            id: '1',
            type: 'text',
            content: '<p>Welcome <strong>back</strong>!</p>',
            fontSize: '16px',
            fontFamily: 'Arial',
            color: '#111',
            lineHeight: '1.5',
            textAlign: 'left',
          },
        ],
      }),
    );
    expect(out).toContain('Welcome back!');
    expect(out).not.toContain('<p>');
    expect(out).not.toContain('<strong>');
  });

  it('renders buttons as text → url', () => {
    const out = renderPlainText(
      baseSchema({
        blocks: [
          {
            id: '1',
            type: 'button',
            text: 'Buy now',
            url: 'https://example.com/buy',
            backgroundColor: '#000',
            textColor: '#fff',
            borderRadius: '4px',
            size: 'md',
            align: 'center',
          },
        ],
      }),
    );
    expect(out).toContain('Buy now → https://example.com/buy');
  });

  it('renders images with alt + link', () => {
    const out = renderPlainText(
      baseSchema({
        blocks: [
          {
            id: '1',
            type: 'image',
            src: 'https://cdn.example.com/hero.png',
            alt: 'Hero banner',
            align: 'center',
            link: 'https://example.com/landing',
          },
        ],
      }),
    );
    expect(out).toContain('[Hero banner: https://example.com/landing]');
  });

  it('renders dividers as ----------', () => {
    const out = renderPlainText(
      baseSchema({
        blocks: [
          { id: '1', type: 'divider', thickness: 1, color: '#000', widthPercent: 100 },
        ],
      }),
    );
    expect(out).toContain('----------');
  });

  it('resolves merge tags in all fields', () => {
    const out = renderPlainText(
      baseSchema({
        subject: 'Hi {{first_name|default:"there"}}',
        blocks: [
          {
            id: '1',
            type: 'text',
            content: 'Order #{{order_id}} is ready.',
            fontSize: '14px',
            fontFamily: 'Arial',
            color: '#111',
            lineHeight: '1.5',
            textAlign: 'left',
          },
        ],
      }),
      {
        context: {
          contact: {
            firstName: 'Petr',
            order_id: 'A-42',
          },
        },
      },
    );
    expect(out).toContain('Hi Petr');
    expect(out).toContain('Order #A-42 is ready.');
  });

  it('renders dynamic block IF branch when condition matches', () => {
    const out = renderPlainText(
      baseSchema({
        blocks: [
          {
            id: 'dyn1',
            type: 'dynamic',
            label: 'VIP greeting',
            condition: {
              operator: 'AND',
              rules: [{ field: 'tier', op: 'eq', value: 'vip' }],
            },
            ifContent: [
              {
                id: 'i1',
                type: 'text',
                content: 'VIP only message',
                fontSize: '14px',
                fontFamily: 'Arial',
                color: '#111',
                lineHeight: '1.5',
                textAlign: 'left',
              },
            ],
            elseContent: [
              {
                id: 'e1',
                type: 'text',
                content: 'Standard message',
                fontSize: '14px',
                fontFamily: 'Arial',
                color: '#111',
                lineHeight: '1.5',
                textAlign: 'left',
              },
            ],
          },
        ],
      }),
      { context: { contact: { tier: 'vip' } } },
    );
    expect(out).toContain('VIP only message');
    expect(out).not.toContain('Standard message');
  });

  it('renders dynamic block ELSE branch when condition fails', () => {
    const out = renderPlainText(
      baseSchema({
        blocks: [
          {
            id: 'dyn1',
            type: 'dynamic',
            label: 'VIP greeting',
            condition: {
              operator: 'AND',
              rules: [{ field: 'tier', op: 'eq', value: 'vip' }],
            },
            ifContent: [
              {
                id: 'i1',
                type: 'text',
                content: 'VIP only',
                fontSize: '14px',
                fontFamily: 'Arial',
                color: '#111',
                lineHeight: '1.5',
                textAlign: 'left',
              },
            ],
            elseContent: [
              {
                id: 'e1',
                type: 'text',
                content: 'Standard',
                fontSize: '14px',
                fontFamily: 'Arial',
                color: '#111',
                lineHeight: '1.5',
                textAlign: 'left',
              },
            ],
          },
        ],
      }),
      { context: { contact: { tier: 'standard' } } },
    );
    expect(out).toContain('Standard');
    expect(out).not.toContain('VIP only');
  });

  it('includes Unsubscribe URL when footer.showUnsubscribe is true', () => {
    const out = renderPlainText(
      baseSchema({
        blocks: [
          {
            id: 'foot',
            type: 'footer',
            content: 'My Company · Praha',
            showUnsubscribe: true,
            fontSize: '12px',
            color: '#666',
            textAlign: 'center',
          },
        ],
      }),
      {
        context: {
          system: { unsubscribeUrl: 'https://example.com/unsub/abc' },
        },
      },
    );
    expect(out).toContain('My Company · Praha');
    expect(out).toContain('Unsubscribe: https://example.com/unsub/abc');
  });
});
