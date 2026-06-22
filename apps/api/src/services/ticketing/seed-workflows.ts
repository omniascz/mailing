/**
 * Seed ready-to-run ticketing automations into an org. Each is a concrete
 * workflow (trigger → [wait] → send_email with inline cs/sk copy) listening on a
 * `ticketing.*` api_event — fired either by ingestion (cart_abandoned,
 * event_attended, …) or by the ticketing crons (day_of_reminder,
 * fill_the_house_offer, discover_digest). Orgs customize the copy after seeding.
 *
 * Self-contained: the send_email nodes carry inline html (no campaign/template
 * dependency), which the workflow-email path sends via the transactional engine.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { workflows } from '../../db/schema/index.js';
import type { WorkflowNode, WorkflowEdge } from '../../db/schema/workflows.js';

export interface SeedDef {
  key: string;
  name: string;
  /** api_event name this workflow triggers on. */
  eventName: string;
  /** Optional delay before the send. */
  waitHours?: number;
  subject: string;
  html: string;
}

const wrap = (inner: string) =>
  `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">${inner}<p style="font-size:12px;color:#94a3b8;margin-top:32px">{{unsubscribe}}</p></div>`;

/** The seed catalog (cs default copy + merge tags). */
export const SEED_DEFS: SeedDef[] = [
  {
    key: 'abandoned_cart',
    name: 'Ticketing — Abandoned cart recovery',
    eventName: 'ticketing.cart_abandoned',
    waitHours: 1,
    subject: 'Dokončete objednávku vstupenek 🎟️',
    html: wrap('<p>Ahoj {{first_name}},</p><p>nechal/a jste vstupenky v košíku. Místa se rychle plní — dokončete nákup, než zmizí.</p><p><a href="{{cart_url}}">Dokončit objednávku →</a></p>'),
  },
  {
    key: 'post_event_review',
    name: 'Ticketing — Post-event review',
    eventName: 'ticketing.event_attended',
    waitHours: 18,
    subject: 'Jak se vám akce líbila?',
    html: wrap('<p>Ahoj {{first_name}},</p><p>děkujeme, že jste dorazil/a. Jak se vám líbilo? Ohodnoťte akci jedním klikem.</p><p><a href="{{review_url}}">Ohodnotit →</a></p>'),
  },
  {
    key: 'referral',
    name: 'Ticketing — Referral (bring a friend)',
    eventName: 'ticketing.order_paid',
    waitHours: 72,
    subject: 'Přiveďte kamaráda a oba získáte slevu 🎁',
    html: wrap('<p>Ahoj {{first_name}},</p><p>líbil se vám zážitek? Sdílejte ho — váš kamarád dostane slevu na první vstupenku a vy taky.</p><p><a href="{{referral_url}}">Získat odkaz →</a></p>'),
  },
  {
    key: 'renewal_dunning',
    name: 'Ticketing — Season-pass renewal',
    eventName: 'ticketing.subscription_past_due',
    subject: 'Obnovte své předplatné',
    html: wrap('<p>Ahoj {{first_name}},</p><p>vaše předplatné/permanentka čeká na obnovu. Neztraťte své místo na nadcházející sezónu.</p><p><a href="{{renew_url}}">Obnovit →</a></p>'),
  },
  {
    key: 'waitlist_freed',
    name: 'Ticketing — Waitlist freed',
    eventName: 'ticketing.waitlist_freed',
    subject: 'Uvolnilo se místo! 🎟️',
    html: wrap('<p>Ahoj {{first_name}},</p><p>na akci, kterou sledujete, se uvolnilo místo. Máte přednost — ale jen krátce.</p><p><a href="{{buy_url}}">Koupit teď →</a></p>'),
  },
  {
    key: 'lottery_won',
    name: 'Ticketing — Lottery winner',
    eventName: 'ticketing.lottery_won',
    subject: 'Vyhráli jste možnost koupit vstupenky 🎉',
    html: wrap('<p>Gratulujeme {{first_name}}!</p><p>V losování jste získal/a možnost koupit vstupenky. Vyzvedněte si je do uvedeného termínu.</p><p><a href="{{buy_url}}">Vyzvednout →</a></p>'),
  },
  {
    key: 'day_of_reminder',
    name: 'Ticketing — Day-of reminder',
    eventName: 'ticketing.day_of_reminder',
    subject: 'Vaše akce se blíží 🎭',
    html: wrap('<p>Ahoj {{first_name}},</p><p>nezapomeňte — vaše akce se blíží. Vstupenku a QR kód máte v aplikaci nebo na odkazu níže.</p><p><a href="{{ticket_url}}">Zobrazit vstupenku →</a></p>'),
  },
  {
    key: 'fill_the_house_offer',
    name: 'Ticketing — Fill-the-house offer',
    eventName: 'ticketing.fill_the_house_offer',
    subject: 'Poslední místa — speciální nabídka',
    html: wrap('<p>Ahoj {{first_name}},</p><p>na akci, která by vás mohla zajímat, zbývá pár posledních míst. Máme pro vás speciální nabídku.</p><p><a href="{{buy_url}}">Zarezervovat →</a></p>'),
  },
  {
    key: 'discover_digest',
    name: 'Ticketing — Discover digest',
    eventName: 'ticketing.discover_digest',
    subject: 'Tipy na akce vybrané pro vás ✨',
    html: wrap('<p>Ahoj {{first_name}},</p><p>na základě toho, co jste navštívil/a, jsme pro vás vybrali nadcházející akce:</p><p>{{recommendations}}</p>'),
  },
];

/** Build the nodes + edges for a seed definition (pure, testable). */
export function buildWorkflowGraph(def: SeedDef): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const nodes: WorkflowNode[] = [{ id: 'trigger', type: 'trigger', config: {} }];
  const edges: WorkflowEdge[] = [];

  let prev = 'trigger';
  if (def.waitHours && def.waitHours > 0) {
    nodes.push({ id: 'wait', type: 'wait', config: { duration: def.waitHours, unit: 'hours' } });
    edges.push({ id: 'e_trigger_wait', source: 'trigger', target: 'wait' });
    prev = 'wait';
  }
  nodes.push({
    id: 'send',
    type: 'send_email',
    config: { subject: def.subject, html: def.html },
  });
  edges.push({ id: `e_${prev}_send`, source: prev, target: 'send' });

  return { nodes, edges };
}

export interface SeedResult {
  created: string[];
  skipped: string[];
}

/** Seed all ticketing workflows into an org. Idempotent (skips by name). */
export async function seedTicketingWorkflows(orgId: string): Promise<SeedResult> {
  const result: SeedResult = { created: [], skipped: [] };

  for (const def of SEED_DEFS) {
    const [existing] = await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(and(eq(workflows.orgId, orgId), eq(workflows.name, def.name)))
      .limit(1);

    if (existing) {
      result.skipped.push(def.key);
      continue;
    }

    const { nodes, edges } = buildWorkflowGraph(def);
    await db.insert(workflows).values({
      orgId,
      name: def.name,
      description: `Auto-seeded ticketing automation (${def.key}). Customize the copy as needed.`,
      triggerType: 'api_event',
      triggerConfig: { eventName: def.eventName },
      nodes,
      edges,
      status: 'draft', // org reviews + activates
    } as never);
    result.created.push(def.key);
  }

  return result;
}
