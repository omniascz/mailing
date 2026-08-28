/**
 * The public end of a poll: one GET per answer, no login.
 *
 * Same shape as the unsubscribe and view-in-browser routes — a signed token in
 * the path, verified with the shared tracking secret, and an HTML page back.
 * Deliberately not a second mechanism: `verifyTrackingToken` is the one place
 * that decides whether a link in an email is authentic, and a poll link carries
 * exactly what an unsubscribe link carries — somebody's identity.
 *
 * ─── No token, no vote ───────────────────────────────────────────────────────
 *
 * A missing or unverifiable token is refused, not counted anonymously. An
 * anonymous vote would be a vote anybody could cast from a terminal, as many
 * times as they liked, which is not a softer version of a poll — it is a
 * different thing wearing the same name. The link always carries a token, so a
 * request without one is either forged or truncated, and neither should move a
 * number the customer will read as "what our audience thinks".
 *
 * ─── What the recipient sees ─────────────────────────────────────────────────
 *
 * A page, not a redirect and not a blank 204. The recipient clicked something
 * in an email and has to be told it worked; a browser that lands on an empty
 * response reads as a broken link, and the next click is a support ticket.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyTrackingToken } from '@forgemsg/shared';
import { recordPollVote } from '../../services/polls/index.js';

/** Everything on this page is user text, so nothing goes in unescaped. */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function page(title: string, body: string): string {
  return (
    `<!doctype html><html lang="cs"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="robots" content="noindex">` +
    `<title>${escapeHtml(title)}</title></head>` +
    `<body style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;` +
    `max-width:520px;margin:64px auto;padding:0 24px;color:#111827;line-height:1.6;">` +
    body +
    `</body></html>`
  );
}

export default async function pollRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/poll/:token
   * Record the vote the token names and confirm it.
   */
  app.get(
    '/api/v1/poll/:token',
    { schema: { tags: ['Public'], summary: 'Record a poll answer' } },
    async (req, reply) => {
      const { token } = z.object({ token: z.string().min(1).max(2048) }).parse(req.params);

      const payload = verifyTrackingToken(token);
      if (!payload || payload.type !== 'poll') {
        return reply
          .code(400)
          .header('Content-Type', 'text/html; charset=utf-8')
          .send(
            page(
              'Odkaz neplatí',
              `<h1>Tenhle odkaz neplatí</h1><p>Nepodařilo se ověřit, od koho přišel, ` +
                `takže jsme hlas nezapočítali. Zkuste kliknout přímo v e-mailu.</p>`,
            ),
          );
      }

      try {
        const result = await recordPollVote(payload);
        const answer = escapeHtml(result.optionLabel);
        const question = escapeHtml(result.question);
        const note = result.alreadyVoted
          ? `<p style="color:#6b7280;">Váš hlas jsme zaznamenali už dřív, takže zůstává tenhle.</p>`
          : '';
        return reply
          .header('Content-Type', 'text/html; charset=utf-8')
          .send(
            page(
              'Děkujeme za odpověď',
              `<h1>Děkujeme</h1>` +
                (question ? `<p>${question}</p>` : '') +
                `<p style="font-size:20px;font-weight:600;">${answer}</p>` +
                note,
            ),
          );
      } catch {
        return reply
          .code(400)
          .header('Content-Type', 'text/html; charset=utf-8')
          .send(
            page(
              'Anketa není dostupná',
              `<h1>Anketa už není dostupná</h1><p>Kampaň nebo odpověď mezitím zmizela, ` +
                `takže jsme hlas nezapočítali.</p>`,
            ),
          );
      }
    },
  );
}
