/**
 * Somebody is told when a sending address gets listed.
 *
 * The sweep has run on a six-hourly cron since it was written and has never
 * told anyone anything: it set `dedicated_ips.blacklist_count` and logged a
 * line in a worker nobody reads. On a shared pool a listing is the most
 * expensive thing you can be unaware of, because every tenant on the pool is
 * paying for it while it stands.
 *
 * ─── The order of the two writes is the whole design ─────────────────────────
 *
 * `notified_at` is written AFTER the send returns, never before and never in
 * the same statement as the insert. If it were written first, a send that
 * failed would leave a finding that looks announced: the next sweep would see
 * `notified_at IS NOT NULL`, stay quiet, and the listing would sit there
 * unreported for as long as it lasted. That is #133's shape — a function that
 * marks the state and sends nothing is worse than one that does not exist —
 * and it is why the failure path here leaves the column null on purpose rather
 * than by omission.
 *
 * The cost of that ordering is a duplicate alert if the send succeeds and the
 * UPDATE then fails. That is the right way round: an operator who hears twice
 * about a real listing is inconvenienced; one who never hears is not.
 *
 * ─── What a sweep that read nothing must not do ──────────────────────────────
 *
 * `BlacklistCheckResult.inconclusive` marks a result where at least one zone
 * refused the query or did not answer. Such a result is not evidence of
 * anything: an address it reports as clean may be listed on a zone we could not
 * read. So a result that is inconclusive AND found no listing is skipped
 * entirely — no rows opened, no rows cleared, previous state untouched. An
 * outage at Spamhaus must not read as a delisting.
 *
 * A result that DID find a listing is acted on even when other zones were
 * unreadable: that direction only ever adds caution.
 *
 * ─── Who hears about it ──────────────────────────────────────────────────────
 *
 * SYSTEM_EMAIL_FROM, which is both the sender and the recipient. There is no
 * operator address on `dedicated_ips` to route to, and notifying the
 * organisation's users would mail everyone in the account about an
 * infrastructure fault they cannot act on. The mail is unsigned, because system
 * mail has no DKIM key until the platform domain exists — accepted, because an
 * operational alert that arrives unsigned is worth more than one that waits.
 */

import { and, eq, isNull, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { ipBlacklistEvents } from '../../db/schema/index.js';
import { env } from '../../config/env.js';
import { sendTransactionalEmail } from '../../lib/queues.js';
import type { BlacklistCheckResult } from './blacklist-monitor.js';

export interface OpenFinding {
  id: string;
  ipAddress: string;
  zone: string;
  returnCode: string | null;
  firstSeenAt: Date;
}

export interface AlertSummary {
  /** Findings recorded for the first time in this run. */
  opened: number;
  /** Open findings whose zone no longer lists the address. */
  cleared: number;
  /** Findings this run successfully announced. */
  notified: number;
  /**
   * Addresses whose result was skipped because it was inconclusive and found
   * nothing — see the note above. Reported so a caller can tell "nothing to
   * say" from "we could not look".
   */
  skippedInconclusive: number;
  /** True when an alert was owed and the send did not go through. */
  sendFailed: boolean;
}

/** Seam so a test can drive the alert without an SMTP path. */
export interface AlertDeps {
  send(input: {
    to: string;
    from: string;
    fromName?: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<unknown>;
}

const defaultDeps: AlertDeps = {
  send: (input) => sendTransactionalEmail(input),
};

function renderAlert(findings: OpenFinding[]): { subject: string; html: string; text: string } {
  const addresses = [...new Set(findings.map((f) => f.ipAddress))];
  const subject =
    addresses.length === 1
      ? `[MailForge] Sending IP ${addresses[0]} is on a blocklist`
      : `[MailForge] ${addresses.length} sending IPs are on a blocklist`;

  const lines = findings.map(
    (f) => `${f.ipAddress} — listed on ${f.zone}${f.returnCode ? ` (${f.returnCode})` : ''}`,
  );

  const text = [
    addresses.length === 1
      ? 'A sending IP is listed on a DNS blocklist.'
      : `${addresses.length} sending IPs are listed on DNS blocklists.`,
    '',
    ...lines,
    '',
    'Mail from a listed address is rejected or filtered by the providers that',
    'consult that list. On a shared pool this affects every account sending',
    'through it.',
    '',
    'Delisting is requested at the blocklist operator; the cause has to be',
    'fixed first, or the listing returns.',
  ].join('\n');

  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:24px;color:#1e293b">
<h2 style="margin:0 0 16px">${addresses.length === 1 ? 'A sending IP is on a blocklist' : `${addresses.length} sending IPs are on blocklists`}</h2>
<ul style="font-size:14px;line-height:1.7;padding-left:20px">
${findings.map((f) => `  <li><code>${f.ipAddress}</code> — listed on <strong>${f.zone}</strong>${f.returnCode ? ` <code>${f.returnCode}</code>` : ''}</li>`).join('\n')}
</ul>
<p style="font-size:14px;line-height:1.6">Mail from a listed address is rejected or filtered by the providers that consult that list. On a shared pool this affects every account sending through it.</p>
<p style="font-size:14px;line-height:1.6">Delisting is requested at the blocklist operator; the cause has to be fixed first, or the listing returns.</p>
</body></html>`;

  return { subject, html, text };
}

/**
 * Record what a sweep found, and announce anything not announced yet.
 *
 * Called with the per-address results a sweep produced. Safe to call with an
 * empty list: an account with no dedicated addresses has nothing to check, and
 * silence is the correct output — that is "the engine has not sent from a
 * dedicated address", not "we have no data".
 */
export async function recordAndAlert(
  results: BlacklistCheckResult[],
  deps: AlertDeps = defaultDeps,
): Promise<AlertSummary> {
  const summary: AlertSummary = {
    opened: 0,
    cleared: 0,
    notified: 0,
    skippedInconclusive: 0,
    sendFailed: false,
  };

  for (const r of results) {
    // Read nothing, change nothing. See the header.
    if (r.inconclusive && r.totalListings === 0) {
      summary.skippedInconclusive++;
      continue;
    }

    const listedZones = r.listings.map((l) => l.zone);

    for (const listing of r.listings) {
      // ON CONFLICT over the partial unique index: a listing that is already
      // open just moves its last_seen_at, and notified_at is left exactly as it
      // is — re-listing does not re-announce, and an un-announced finding stays
      // un-announced until a send succeeds.
      const inserted = await db.execute(sql`
        INSERT INTO ip_blacklist_events (ip_address, zone, return_code)
        VALUES (${r.ip}, ${listing.zone}, ${listing.returnCode})
        ON CONFLICT (ip_address, zone) WHERE cleared_at IS NULL
        DO UPDATE SET last_seen_at = now()
        RETURNING (xmax = 0) AS inserted
      `);
      const wasNew = (inserted as unknown as Array<{ inserted: boolean }>)[0]?.inserted === true;
      if (wasNew) summary.opened++;
    }

    // Close what this sweep read and did not find. Only reachable here because
    // the inconclusive-and-empty case returned above; a result carrying a real
    // listing may still have unreadable zones, and those are NOT cleared —
    // `listedZones` only ever grows the set that stays open.
    const stillOpen = await db
      .select({ id: ipBlacklistEvents.id, zone: ipBlacklistEvents.zone })
      .from(ipBlacklistEvents)
      .where(and(eq(ipBlacklistEvents.ipAddress, r.ip), isNull(ipBlacklistEvents.clearedAt)));

    const unreadable = new Set([...r.rejected, ...r.unreachable].map((z) => z.zone));
    const toClear = stillOpen
      .filter((row) => !listedZones.includes(row.zone) && !unreadable.has(row.zone))
      .map((row) => row.id);

    if (toClear.length > 0) {
      await db
        .update(ipBlacklistEvents)
        .set({ clearedAt: new Date() })
        .where(inArray(ipBlacklistEvents.id, toClear));
      summary.cleared += toClear.length;
    }
  }

  // Everything still open and never successfully announced, in one message.
  // One email for the whole sweep rather than one per finding: four addresses
  // going onto the same list is one incident, and four mails about it is how
  // an alert channel gets a filter rule.
  const owed = await db
    .select({
      id: ipBlacklistEvents.id,
      ipAddress: ipBlacklistEvents.ipAddress,
      zone: ipBlacklistEvents.zone,
      returnCode: ipBlacklistEvents.returnCode,
      firstSeenAt: ipBlacklistEvents.firstSeenAt,
    })
    .from(ipBlacklistEvents)
    .where(and(isNull(ipBlacklistEvents.notifiedAt), isNull(ipBlacklistEvents.clearedAt)));

  if (owed.length === 0) return summary;

  const { subject, html, text } = renderAlert(owed);

  try {
    await deps.send({
      to: env.SYSTEM_EMAIL_FROM,
      from: env.SYSTEM_EMAIL_FROM,
      fromName: env.SYSTEM_EMAIL_FROM_NAME,
      subject,
      html,
      text,
    });
  } catch (err) {
    // Deliberately no stamp. The next sweep finds these findings still
    // un-announced and tries again; stamping here would silence them forever.
    summary.sendFailed = true;
    console.error(
      `[blacklist-alerts] ${owed.length} finding(s) could not be announced; left unnotified so the next sweep retries:`,
      err,
    );
    return summary;
  }

  await db
    .update(ipBlacklistEvents)
    .set({ notifiedAt: new Date() })
    .where(
      inArray(
        ipBlacklistEvents.id,
        owed.map((f) => f.id),
      ),
    );
  summary.notified = owed.length;

  return summary;
}
