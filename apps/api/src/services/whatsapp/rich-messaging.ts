/**
 * WhatsApp rich media + interactive messaging (task 7.8).
 *
 * Extends MetaWhatsAppAdapter with:
 *   - Media messages: image, video, document, audio, sticker
 *   - Interactive messages: button (up to 3 buttons), list (sections + rows)
 *   - Location messages
 *   - Reply tracking (button_click, list_selection → event pipeline)
 */

import { type MetaWhatsAppConfig } from '../../channels/whatsapp/meta-adapter.js';
import { onApiEvent } from '../workflows/triggers.js';
import type { DeliveryResult, Recipient } from '@forgemsg/shared';

const API_VERSION = 'v21.0';
const META_BASE = `https://graph.facebook.com/${API_VERSION}`;

// ─── Rich message types ───────────────────────────────────────────────────────

export interface MediaMessage {
  type: 'image' | 'video' | 'document' | 'audio' | 'sticker';
  /** URL of the media to send (Meta fetches it) */
  link?: string;
  /** Pre-uploaded media_id from Meta */
  id?: string;
  /** Caption text (image / video / document only) */
  caption?: string;
  /** Filename for document messages */
  filename?: string;
}

export interface ButtonMessage {
  body: string;
  /** Max 3 buttons */
  buttons: Array<{
    id: string;   // your identifier, returned on click
    title: string; // max 20 chars
  }>;
  header?: string; // optional text header
  footer?: string; // optional footer text
}

export interface ListMessage {
  body: string;
  buttonLabel: string; // CTA button text, max 20 chars
  sections: Array<{
    title: string;
    rows: Array<{
      id: string;
      title: string;
      description?: string;
    }>;
  }>;
  header?: string;
  footer?: string;
}

export interface LocationMessage {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

// ─── Meta API request builders ────────────────────────────────────────────────

function buildMediaPayload(to: string, msg: MediaMessage) {
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

function buildButtonPayload(to: string, msg: ButtonMessage) {
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

function buildListPayload(to: string, msg: ListMessage) {
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

function buildLocationPayload(to: string, msg: LocationMessage) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'location',
    location: {
      latitude: msg.latitude,
      longitude: msg.longitude,
      ...(msg.name && { name: msg.name }),
      ...(msg.address && { address: msg.address }),
    },
  };
}

// ─── RichWhatsAppSender ───────────────────────────────────────────────────────

export class RichWhatsAppSender {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(private readonly cfg: MetaWhatsAppConfig) {
    this.baseUrl = `${META_BASE}/${cfg.phoneNumberId}/messages`;
    this.headers = {
      Authorization: `Bearer ${cfg.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private async post(body: unknown, recipientId: string): Promise<DeliveryResult> {
    const resp = await fetch(this.baseUrl, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    const json = (await resp.json()) as { messages?: Array<{ id: string }>; error?: { message: string; code: number } };

    if (!resp.ok || json.error) {
      throw new Error(json.error?.message ?? `Meta API HTTP ${resp.status}`);
    }

    return {
      messageId: json.messages?.[0]?.id ?? '',
      status: 'sent',
      provider: 'meta',
      recipientId,
    };
  }

  // ── Public send methods ───────────────────────────────────────────────────

  async sendMedia(recipient: Recipient, msg: MediaMessage): Promise<DeliveryResult> {
    const to = (recipient.phone ?? '').replace(/^\+/, '');
    const payload = buildMediaPayload(to, msg);
    return this.post(payload, recipient.contactId);
  }

  async sendButton(recipient: Recipient, msg: ButtonMessage): Promise<DeliveryResult> {
    const to = (recipient.phone ?? '').replace(/^\+/, '');
    const payload = buildButtonPayload(to, msg);
    return this.post(payload, recipient.contactId);
  }

  async sendList(recipient: Recipient, msg: ListMessage): Promise<DeliveryResult> {
    const to = (recipient.phone ?? '').replace(/^\+/, '');
    const payload = buildListPayload(to, msg);
    return this.post(payload, recipient.contactId);
  }

  async sendLocation(recipient: Recipient, msg: LocationMessage): Promise<DeliveryResult> {
    const to = (recipient.phone ?? '').replace(/^\+/, '');
    const payload = buildLocationPayload(to, msg);
    return this.post(payload, recipient.contactId);
  }

  // ── Upload media to Meta ──────────────────────────────────────────────────

  /**
   * Upload a file to Meta's media endpoint and return the media_id.
   * Use the returned id in sendMedia({id: '...'}).
   */
  async uploadMedia(
    mimeType: string,
    fileBuffer: Buffer,
    fileName: string,
  ): Promise<string> {
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', mimeType);
    formData.append('file', new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), fileName);

    const resp = await fetch(
      `${META_BASE}/${this.cfg.phoneNumberId}/media`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.cfg.accessToken}` },
        body: formData,
        signal: AbortSignal.timeout(60_000),
      },
    );

    const json = (await resp.json()) as { id?: string; error?: { message: string } };

    if (!resp.ok || json.error) {
      throw new Error(json.error?.message ?? `Media upload failed HTTP ${resp.status}`);
    }

    return json.id!;
  }
}

// ─── Interactive reply tracking ───────────────────────────────────────────────

export interface InteractiveReply {
  type: 'button_reply' | 'list_reply';
  buttonId?: string;
  listId?: string;
  title: string;
  contactPhone: string;
  messageId: string;
}

/**
 * Parse an interactive reply from a Meta webhook and fire a workflow event.
 */
export async function handleInteractiveReply(
  orgId: string,
  contactId: string,
  reply: InteractiveReply,
): Promise<void> {
  const eventName = reply.type === 'button_reply' ? 'wa_button_click' : 'wa_list_selection';

  await onApiEvent(orgId, contactId, eventName, {
    buttonId: reply.buttonId,
    listId: reply.listId,
    title: reply.title,
    phone: reply.contactPhone,
    messageId: reply.messageId,
  });
}
