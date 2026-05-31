/**
 * @forgemsg/react-email — render React Email templates and feed the
 * resulting HTML + text into a MailForge `emails.send` call.
 *
 * Designed as a drop-in for code that already uses Resend's `react:`
 * prop. Pass a React element where Resend expected a `react` prop and
 * we'll handle the render + send.
 *
 * ```tsx
 * import { sendReactEmail } from '@forgemsg/react-email';
 * import { mailforge } from '@forgemsg/next';
 * import OrderReceipt from '@/emails/order-receipt';
 *
 * await sendReactEmail(mailforge, {
 *   from: 'orders@your.com',
 *   to: 'jane@example.com',
 *   subject: 'Your receipt',
 *   react: <OrderReceipt orderId="123" total={49.99} />,
 * });
 * ```
 *
 * The renderer is supplied by the caller — typically `@react-email/render`.
 * Keeping it pluggable means this package has zero React-specific
 * dependencies and works with custom JSX runtimes.
 */

import type { ForgemsgClient, SendEmailParams, SendOptions, SendEmailResult } from '@forgemsg/sdk';

/**
 * The bits of a React element we touch. We avoid pulling in `@types/react`
 * by typing it structurally — anything `react.createElement` returns is
 * acceptable, including JSX results from any runtime.
 */
export type ReactElementLike = { type: unknown; props: unknown; key?: unknown };

/**
 * Renderer signature compatible with `render` from `@react-email/render`
 * and `react-dom/server`'s `renderToStaticMarkup` (with a thin wrapper).
 *
 * The renderer should produce email-friendly HTML — inlined styles, no
 * `<script>`, table-based layouts when the source demands them.
 */
export type EmailRenderer = (
  element: ReactElementLike,
  options?: { plainText?: boolean },
) => string | Promise<string>;

/** Default renderer using @react-email/render, when available. */
async function resolveDefaultRenderer(): Promise<EmailRenderer> {
  try {
    // Dynamic import keeps @react-email/render an optional peer.
    // String-built spec keeps tsc from trying to resolve it at compile time.
    const spec = '@react-email/' + 'render';
    const mod = (await import(/* @vite-ignore */ spec).catch(() => null)) as
      | {
          render: (
            el: unknown,
            opts?: { plainText?: boolean },
          ) => string | Promise<string>;
        }
      | null;
    if (mod?.render) {
      return ((el, opts) => mod.render(el, opts)) as EmailRenderer;
    }
  } catch {
    // fall through
  }
  throw new Error(
    '[@forgemsg/react-email] @react-email/render is not installed. ' +
      'Either install it (npm install @react-email/render) or pass a custom ' +
      '`renderer` option.',
  );
}

export interface SendReactEmailParams extends Omit<SendEmailParams, 'html' | 'text'> {
  /** React element to render into the email body. */
  react: ReactElementLike;
  /**
   * Optional plain-text body. When omitted, we auto-derive one from the
   * React element by calling the renderer with `plainText: true`.
   */
  text?: string;
  /** Optional override — useful for renderToStaticMarkup-based stacks. */
  renderer?: EmailRenderer;
}

/**
 * Render `react` to HTML (and optionally plain text), then forward
 * everything else verbatim to `client.emails.send`.
 */
export async function sendReactEmail(
  client: ForgemsgClient,
  params: SendReactEmailParams,
  opts: SendOptions = {},
): Promise<SendEmailResult> {
  const { react, text, renderer, ...rest } = params;
  const renderImpl = renderer ?? (await resolveDefaultRenderer());

  const html = await renderImpl(react);
  // Only auto-derive plain text when the caller hasn't supplied one.
  const plainText = text ?? (await renderImpl(react, { plainText: true }));

  return client.emails.send({ ...rest, html, text: plainText }, opts);
}

/**
 * Batch counterpart — renders each `react` element in parallel and
 * forwards the result to `client.emails.batch`.
 */
export async function sendReactEmailBatch(
  client: ForgemsgClient,
  items: SendReactEmailParams[],
  opts: SendOptions = {},
): Promise<{ data: SendEmailResult[] }> {
  if (items.length === 0) return { data: [] };
  const renderImpl = items[0]!.renderer ?? (await resolveDefaultRenderer());
  const prepared: SendEmailParams[] = await Promise.all(
    items.map(async (i) => {
      const { react, text, renderer: _renderer, ...rest } = i;
      const html = await renderImpl(react);
      const plainText = text ?? (await renderImpl(react, { plainText: true }));
      return { ...rest, html, text: plainText };
    }),
  );
  return client.emails.batch(prepared, opts);
}

// Re-export the renderer type so consumers can adapt other engines
// (renderToStaticMarkup, mjml, juice-rendered HTML) cleanly.
export type { ForgemsgClient } from '@forgemsg/sdk';
