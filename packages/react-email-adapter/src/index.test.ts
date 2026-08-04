import { describe, it, expect, vi } from 'vitest';
import {
  sendReactEmail,
  sendReactEmailBatch,
  type ReactElementLike,
  type EmailRenderer,
} from './index.js';

const fakeElement: ReactElementLike = { type: 'div', props: { children: 'hello' } };

describe('sendReactEmail', () => {
  it('renders html, derives plain text, and forwards to client.emails.send', async () => {
    const send = vi.fn().mockResolvedValue({ id: 'em_1' });
    const client = { emails: { send } } as never;
    const renderer: EmailRenderer = (el, opts) =>
      opts?.plainText ? 'hello' : `<p>${(el as ReactElementLike).type as string}</p>`;

    const res = await sendReactEmail(client, {
      from: 'a@x.com',
      to: 'b@x.com',
      subject: 'Hi',
      react: fakeElement,
      renderer,
    });
    expect(res).toEqual({ id: 'em_1' });
    expect(send).toHaveBeenCalledOnce();
    const [payload] = send.mock.calls[0]!;
    expect(payload.html).toBe('<p>div</p>');
    expect(payload.text).toBe('hello');
    expect(payload.from).toBe('a@x.com');
  });

  it('uses caller-provided text and skips plain-text derivation', async () => {
    const send = vi.fn().mockResolvedValue({ id: 'em_2' });
    const client = { emails: { send } } as never;
    const renderer: EmailRenderer = vi.fn().mockResolvedValue('<p>hi</p>');

    await sendReactEmail(client, {
      from: 'a@x.com',
      to: 'b@x.com',
      subject: 'Hi',
      react: fakeElement,
      text: 'precomputed',
      renderer,
    });

    // Called exactly once — for HTML only, plain text was supplied.
    expect(renderer).toHaveBeenCalledTimes(1);
  });

  it('forwards idempotency options unchanged', async () => {
    const send = vi.fn().mockResolvedValue({ id: 'em_3' });
    const client = { emails: { send } } as never;
    const renderer: EmailRenderer = () => '<p>x</p>';

    await sendReactEmail(
      client,
      {
        from: 'a@x.com',
        to: 'b@x.com',
        subject: 'Hi',
        react: fakeElement,
        renderer,
      },
      { idempotencyKey: 'order-42' },
    );

    const [, opts] = send.mock.calls[0]!;
    expect(opts).toEqual({ idempotencyKey: 'order-42' });
  });

  it('passes through cc, bcc, reply_to, headers, attachments', async () => {
    const send = vi.fn().mockResolvedValue({ id: 'em_4' });
    const client = { emails: { send } } as never;
    const renderer: EmailRenderer = () => '<p>x</p>';

    await sendReactEmail(client, {
      from: 'a@x.com',
      to: 'b@x.com',
      subject: 'Hi',
      cc: 'cc@x.com',
      bcc: ['bcc@x.com'],
      reply_to: 'reply@x.com',
      headers: { 'X-Tag': 'value' },
      attachments: [{ filename: 'r.pdf', content: 'YWJj' }],
      react: fakeElement,
      renderer,
    });

    const [payload] = send.mock.calls[0]!;
    expect(payload.cc).toBe('cc@x.com');
    expect(payload.bcc).toEqual(['bcc@x.com']);
    expect(payload.reply_to).toBe('reply@x.com');
    expect(payload.headers).toEqual({ 'X-Tag': 'value' });
    expect(payload.attachments).toEqual([{ filename: 'r.pdf', content: 'YWJj' }]);
  });
});

describe('sendReactEmailBatch', () => {
  it('renders each item and calls client.emails.batch once', async () => {
    const batch = vi.fn().mockResolvedValue({ data: [{ id: 'em_a' }, { id: 'em_b' }] });
    const client = { emails: { batch } } as never;
    const renderer: EmailRenderer = (_el, opts) => (opts?.plainText ? 't' : '<p>h</p>');

    const out = await sendReactEmailBatch(client, [
      {
        from: 'a@x.com',
        to: 'one@x.com',
        subject: '1',
        react: fakeElement,
        renderer,
      },
      {
        from: 'a@x.com',
        to: 'two@x.com',
        subject: '2',
        react: fakeElement,
        renderer,
      },
    ]);

    expect(out.data.length).toBe(2);
    expect(batch).toHaveBeenCalledOnce();
    const [items] = batch.mock.calls[0]!;
    expect(items[0].html).toBe('<p>h</p>');
    expect(items[1].subject).toBe('2');
  });

  it('returns empty array on empty input without calling batch', async () => {
    const batch = vi.fn();
    const client = { emails: { batch } } as never;
    const out = await sendReactEmailBatch(client, []);
    expect(out).toEqual({ data: [] });
    expect(batch).not.toHaveBeenCalled();
  });
});
