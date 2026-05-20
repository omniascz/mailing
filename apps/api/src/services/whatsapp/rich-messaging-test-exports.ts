/**
 * Test-only exports for rich-messaging builder functions.
 * Not imported in production code.
 */

export { RichWhatsAppSender } from './rich-messaging.js';

// Re-export the private builder functions for unit testing
// by duplicating the pure logic here (no side effects).

export type {
  ButtonMessage,
  ListMessage,
  MediaMessage,
  LocationMessage,
} from './rich-messaging.js';

export function buildButtonPayloadForTest(
  to: string,
  msg: {
    body: string;
    buttons: Array<{ id: string; title: string }>;
    header?: string;
    footer?: string;
  },
) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      ...(msg.header && { header: { type: 'text', text: msg.header } }),
      body: { text: msg.body },
      ...(msg.footer && { footer: { text: msg.footer } }),
      action: {
        buttons: msg.buttons.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  };
}

export function buildListPayloadForTest(
  to: string,
  msg: {
    body: string;
    buttonLabel: string;
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>;
    header?: string;
    footer?: string;
  },
) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      ...(msg.header && { header: { type: 'text', text: msg.header } }),
      body: { text: msg.body },
      ...(msg.footer && { footer: { text: msg.footer } }),
      action: {
        button: msg.buttonLabel.slice(0, 20),
        sections: msg.sections.map((s) => ({
          title: s.title,
          rows: s.rows.map((r) => ({
            id: r.id,
            title: r.title,
            ...(r.description && { description: r.description }),
          })),
        })),
      },
    },
  };
}

export function buildMediaPayloadForTest(
  to: string,
  msg: { type: string; link?: string; id?: string; caption?: string; filename?: string },
) {
  const mediaObj: Record<string, unknown> = {};
  if (msg.link) mediaObj.link = msg.link;
  if (msg.id) mediaObj.id = msg.id;
  if (msg.caption) mediaObj.caption = msg.caption;
  if (msg.filename) mediaObj.filename = msg.filename;

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: msg.type,
    [msg.type]: mediaObj,
  };
}
