/**
 * @forgemsg/web-sdk — In-app messaging JS SDK (task 7.11).
 *
 * <5KB gzipped. Zero dependencies. Works in any browser.
 *
 * Usage:
 *   <script src="https://cdn.forgemsg.com/sdk/v1.js"></script>
 *   <script>
 *     ForgeMsg.init({ publicKey: 'fm_pub_xxx', contactId: 'user-uuid' });
 *   </script>
 *
 * Or as ES module:
 *   import { ForgeMsg } from '@forgemsg/web-sdk';
 *   ForgeMsg.init({ publicKey: 'fm_pub_xxx', contactId: 'user-uuid' });
 *
 * SECURITY: use a PUBLIC (publishable) key — `fm_pub_...`. Never embed a secret
 * `fm_live_`/`fm_test_` key in browser JS; the server rejects public keys on
 * every secret route, so a public key is safe to ship to the client.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ForgeMsgConfig {
  /** Public (publishable) key — `fm_pub_...`. Safe to embed in browser JS. */
  publicKey?: string;
  /**
   * @deprecated Use `publicKey` with an `fm_pub_` key. Embedding a secret
   * `fm_live_`/`fm_test_` key in the browser leaks full API access.
   */
  apiKey?: string;
  contactId?: string;
  /** API base URL (defaults to production) */
  apiBase?: string;
  /** How long to wait before showing first message (ms, default 2000) */
  initialDelay?: number;
  /** Unique session ID — auto-generated if not provided */
  sessionId?: string;
}

export interface InAppMessagePayload {
  id: string;
  widgetType: 'banner' | 'modal' | 'slideout';
  position: 'top' | 'bottom' | 'center' | 'left' | 'right';
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  backgroundColor?: string;
  textColor?: string;
  imageUrl?: string;
  autoCloseSeconds?: number;
}

// ─── Internal state ───────────────────────────────────────────────────────────

let _config: ForgeMsgConfig | null = null;
let _sessionId: string = '';
let _shownInSession = new Set<string>();

function getSessionId(): string {
  if (_sessionId) return _sessionId;

  // Try sessionStorage first (clears on tab close)
  try {
    let sid = sessionStorage.getItem('_fm_sid');
    if (!sid) {
      sid = generateId();
      sessionStorage.setItem('_fm_sid', sid);
    }
    _sessionId = sid;
  } catch {
    _sessionId = generateId();
  }

  return _sessionId;
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── API client ───────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit): Promise<unknown> {
  if (!_config) throw new Error('ForgeMsg not initialized');

  const base = _config.apiBase ?? 'https://api.forgemsg.com';
  const key = _config.publicKey ?? _config.apiKey ?? '';
  const resp = await fetch(`${base}${path}`, {
    ...opts,
    headers: {
      'X-API-Key': key,
      'Content-Type': 'application/json',
      ...(opts?.headers ?? {}),
    },
  });

  if (!resp.ok) return null;
  return resp.json();
}

async function fetchMessages(): Promise<InAppMessagePayload[]> {
  const params = new URLSearchParams({
    session_id: getSessionId(),
    page_url: location.href,
  });
  if (_config?.contactId) params.set('contact_id', _config.contactId);

  const data = await apiFetch(`/api/v1/in-app/messages/sdk?${params}`);
  const result = data as { data?: InAppMessagePayload[] };
  return result?.data ?? [];
}

async function track(
  messageId: string,
  eventType: 'shown' | 'clicked' | 'dismissed',
): Promise<void> {
  await apiFetch('/api/v1/in-app/track', {
    method: 'POST',
    body: JSON.stringify({
      messageId,
      sessionId: getSessionId(),
      contactId: _config?.contactId,
      pageUrl: location.href,
      eventType,
    }),
  });
}

// ─── Widget rendering ─────────────────────────────────────────────────────────

function injectStyles(): void {
  if (document.getElementById('_fm_styles')) return;

  const style = document.createElement('style');
  style.id = '_fm_styles';
  style.textContent = `
    .fm-widget{position:fixed;z-index:2147483647;font-family:system-ui,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,.15);border-radius:12px;padding:16px 20px;max-width:400px;width:calc(100% - 32px);transition:transform .3s ease,opacity .3s ease}
    .fm-widget.fm-banner{width:100%;max-width:100%;border-radius:0;left:0;right:0}
    .fm-widget.fm-banner.fm-top{top:0}
    .fm-widget.fm-banner.fm-bottom{bottom:0}
    .fm-widget.fm-modal{top:50%;left:50%;transform:translate(-50%,-50%)}
    .fm-widget.fm-slideout.fm-right{right:16px;bottom:16px}
    .fm-widget.fm-slideout.fm-left{left:16px;bottom:16px}
    .fm-widget.fm-top{top:16px;left:50%;transform:translateX(-50%)}
    .fm-widget.fm-bottom{bottom:16px;left:50%;transform:translateX(-50%)}
    .fm-title{font-weight:700;font-size:16px;margin:0 0 8px}
    .fm-body{font-size:14px;margin:0 0 12px;line-height:1.5}
    .fm-cta{display:inline-block;padding:8px 20px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;cursor:pointer;border:none;background:#4f46e5;color:#fff}
    .fm-close{position:absolute;top:10px;right:14px;background:none;border:none;font-size:18px;cursor:pointer;opacity:.5;line-height:1}
    .fm-close:hover{opacity:1}
    .fm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:2147483646}
    .fm-img{width:100%;border-radius:8px;margin-bottom:12px;max-height:160px;object-fit:cover}
  `;
  document.head.appendChild(style);
}

function renderWidget(msg: InAppMessagePayload): void {
  injectStyles();

  const bg = msg.backgroundColor ?? '#ffffff';
  const fg = msg.textColor ?? '#000000';

  // Overlay for modal
  let overlay: HTMLElement | null = null;
  if (msg.widgetType === 'modal') {
    overlay = document.createElement('div');
    overlay.className = 'fm-overlay';
    overlay.id = `_fm_overlay_${msg.id}`;
    document.body.appendChild(overlay);
  }

  const widget = document.createElement('div');
  widget.id = `_fm_widget_${msg.id}`;
  widget.className = `fm-widget fm-${msg.widgetType} fm-${msg.position}`;
  widget.style.cssText = `background:${bg};color:${fg}`;

  let html = `<button class="fm-close" aria-label="Close">&times;</button>`;
  if (msg.imageUrl) html += `<img class="fm-img" src="${escHtml(msg.imageUrl)}" alt="">`;
  html += `<p class="fm-title">${escHtml(msg.title)}</p>`;
  html += `<p class="fm-body">${escHtml(msg.body)}</p>`;
  if (msg.ctaLabel && msg.ctaUrl) {
    html += `<a class="fm-cta" href="${escHtml(msg.ctaUrl)}" data-fm-cta>${escHtml(msg.ctaLabel)}</a>`;
  }

  widget.innerHTML = html;
  document.body.appendChild(widget);

  // Track shown
  void track(msg.id, 'shown');

  // Auto-close
  if (msg.autoCloseSeconds && msg.autoCloseSeconds > 0) {
    setTimeout(() => closeWidget(msg.id, 'dismissed', overlay), msg.autoCloseSeconds * 1000);
  }

  // Close button
  widget.querySelector('.fm-close')?.addEventListener('click', () => {
    closeWidget(msg.id, 'dismissed', overlay);
  });

  // CTA click
  widget.querySelector('[data-fm-cta]')?.addEventListener('click', () => {
    void track(msg.id, 'clicked');
  });

  // Overlay click closes modal
  overlay?.addEventListener('click', () => closeWidget(msg.id, 'dismissed', overlay));
}

function closeWidget(
  messageId: string,
  event: 'dismissed' | 'clicked',
  overlay: HTMLElement | null,
): void {
  document.getElementById(`_fm_widget_${messageId}`)?.remove();
  overlay?.remove();
  if (event === 'dismissed') void track(messageId, 'dismissed');
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const ForgeMsg = {
  /**
   * Initialize the SDK and start polling for matching in-app messages.
   */
  init(config: ForgeMsgConfig): void {
    _config = config;
    if (config.sessionId) _sessionId = config.sessionId;

    const delay = config.initialDelay ?? 2_000;

    if (typeof document === 'undefined') return; // SSR guard

    // Show messages after initial delay
    setTimeout(() => {
      void ForgeMsg.refresh();
    }, delay);

    // Re-check on navigation (SPA support)
    let lastHref = location.href;
    setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        void ForgeMsg.refresh();
      }
    }, 1_000);
  },

  /** Fetch + render messages matching current context. */
  async refresh(): Promise<void> {
    if (!_config) return;

    const messages = await fetchMessages();

    for (const msg of messages) {
      if (!_shownInSession.has(msg.id)) {
        _shownInSession.add(msg.id);
        renderWidget(msg);
      }
    }
  },

  /** Identify the current user (call after login). */
  identify(contactId: string): void {
    if (_config) _config.contactId = contactId;
  },

  /** Manually track a custom event. */
  async track(event: string, properties?: Record<string, unknown>): Promise<void> {
    await apiFetch('/api/v1/events', {
      method: 'POST',
      body: JSON.stringify({ event, contactId: _config?.contactId, properties }),
    });
  },

  /**
   * Ask to be told when a product comes back into stock.
   *
   *   const ok = await ForgeMsg.notifyWhenBackInStock('SKU-123', 'a@example.com');
   *
   * The address is required and is the only identifier a page may send: the
   * publishable key is visible in the page source, so the API refuses a
   * `contactId` from it — see the note on the endpoint.
   *
   * Returns whether the request was accepted. `apiFetch` answers `null` for
   * every non-2xx, which is fine for fire-and-forget tracking and NOT fine
   * here: a form that says "we'll let you know" when the call was rate-limited
   * or refused is lying to the visitor, so the outcome is reported.
   */
  async notifyWhenBackInStock(sku: string, email: string): Promise<boolean> {
    const res = await apiFetch('/api/v1/back-in-stock/subscribe', {
      method: 'POST',
      body: JSON.stringify({ sku, email }),
    });
    return res !== null;
  },

  /** Ask to be told when a product's price drops below what it is now. */
  async notifyOnPriceDrop(sku: string, email: string): Promise<boolean> {
    const res = await apiFetch('/api/v1/price-drop/subscribe', {
      method: 'POST',
      body: JSON.stringify({ sku, email }),
    });
    return res !== null;
  },
};

// Browser global for script tag usage
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)['ForgeMsg'] = ForgeMsg;
}
