/**
 * Workflow action executor (task 5.4).
 *
 * Each action type implements: execute(run, node, context) → ActionResult
 *
 * Actions:
 *   send_email, send_sms, send_whatsapp, send_push, show_in_app, make_voice_call,
 *   wait, condition, add_tag, remove_tag, update_field, move_to_list,
 *   remove_from_list, send_webhook, internal_notification
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  contacts,
  emailEvents,
  type WorkflowNode,
  type WorkflowRun,
} from '../../db/schema/index.js';
import { redis } from '../../lib/redis.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActionContext {
  orgId: string;
  contact: ContactData | null;
}

export interface ContactData {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  customFields: Record<string, unknown>;
  tags: string[];
  listIds: string[];
}

export type ActionResult =
  | { type: 'next'; nextNodeId: string | null } // proceed to next node on the given edge
  | { type: 'branch'; branch: 'true' | 'false' } // condition branch
  | { type: 'wait'; until: Date } // schedule resume
  | { type: 'complete' } // terminal
  | { type: 'error'; message: string }; // failure

// ─── Merge tag substitution ───────────────────────────────────────────────────

export function substituteMergeTags(
  template: string,
  contact: ContactData | null,
  extra: Record<string, unknown> = {},
): string {
  const vars: Record<string, string> = {
    first_name: contact?.firstName ?? '',
    last_name: contact?.lastName ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    ...Object.fromEntries(
      Object.entries(contact?.customFields ?? {}).map(([k, v]) => [`custom.${k}`, String(v ?? '')]),
    ),
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v ?? '')])),
  };

  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => vars[key.trim()] ?? `{{${key}}}`);
}

// ─── Individual action handlers ───────────────────────────────────────────────

async function executeSendEmail(
  node: WorkflowNode,
  run: WorkflowRun,
  ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as {
    campaignId?: string;
    subject?: string;
    templateId?: string;
  };

  // Queue email via BullMQ — workers/src handles the actual send
  const { queues } = await import('../../lib/queues.js').catch(() => ({ queues: null }));
  if (queues) {
    await (
      queues as unknown as Record<string, { add: (name: string, data: unknown) => Promise<void> }>
    ).email
      ?.add('workflow-email', {
        orgId: ctx.orgId,
        contactId: run.contactId,
        workflowRunId: run.id,
        campaignId: config.campaignId,
        templateId: config.templateId,
        subject: config.subject ? substituteMergeTags(config.subject, ctx.contact) : undefined,
      })
      .catch(() => {});
  }

  return { type: 'next', nextNodeId: null };
}

async function executeSendSms(
  node: WorkflowNode,
  run: WorkflowRun,
  ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as { message: string };
  if (!config.message) return { type: 'error', message: 'SMS message text is required' };
  if (!ctx.contact?.phone) return { type: 'next', nextNodeId: null }; // skip if no phone

  const message = substituteMergeTags(config.message, ctx.contact);
  // Queue SMS job
  const { queues } = await import('../../lib/queues.js').catch(() => ({ queues: null }));
  if (queues) {
    await (
      queues as unknown as Record<string, { add: (name: string, data: unknown) => Promise<void> }>
    ).sms
      ?.add('workflow-sms', {
        orgId: ctx.orgId,
        contactId: run.contactId,
        workflowRunId: run.id,
        phone: ctx.contact.phone,
        message,
      })
      .catch(() => {});
  }

  return { type: 'next', nextNodeId: null };
}

async function executeSendWebhook(
  node: WorkflowNode,
  run: WorkflowRun,
  ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    bodyTemplate?: string;
  };

  if (!config.url) return { type: 'error', message: 'Webhook URL is required' };

  const method = (config.method ?? 'POST').toUpperCase();
  const body = config.bodyTemplate
    ? substituteMergeTags(config.bodyTemplate, ctx.contact, {
        workflow_run_id: run.id,
        org_id: ctx.orgId,
      })
    : JSON.stringify({
        workflowRunId: run.id,
        contactId: run.contactId,
        orgId: ctx.orgId,
        timestamp: new Date().toISOString(),
      });

  try {
    const res = await fetch(config.url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(config.headers ?? {}) },
      body: method !== 'GET' ? body : undefined,
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });
    if (!res.ok) {
      return { type: 'error', message: `Webhook returned ${res.status}` };
    }
  } catch (err) {
    return { type: 'error', message: `Webhook failed: ${(err as Error).message}` };
  }

  return { type: 'next', nextNodeId: null };
}

async function executeWait(
  node: WorkflowNode,
  _run: WorkflowRun,
  _ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as {
    duration?: number;
    unit?: 'minutes' | 'hours' | 'days';
    until?: string; // ISO datetime
  };

  let until: Date;

  if (config.until) {
    until = new Date(config.until);
    if (isNaN(until.getTime())) {
      return { type: 'error', message: `Invalid until date: ${config.until}` };
    }
  } else {
    const duration = config.duration ?? 1;
    const unit = config.unit ?? 'hours';
    const ms =
      unit === 'minutes'
        ? duration * 60_000
        : unit === 'hours'
          ? duration * 3_600_000
          : duration * 86_400_000;
    until = new Date(Date.now() + ms);
  }

  return { type: 'wait', until };
}

async function executeCondition(
  node: WorkflowNode,
  _run: WorkflowRun,
  ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as {
    field: string;
    op: string;
    value?: unknown;
    withinDays?: number;
  };

  let result = false;
  const contact = ctx.contact;

  if (!contact) return { type: 'branch', branch: 'false' };

  switch (config.field) {
    case 'has_tag': {
      result = contact.tags.includes(String(config.value));
      break;
    }
    case 'not_has_tag': {
      result = !contact.tags.includes(String(config.value));
      break;
    }
    case 'email_opened': {
      // Check email_events for an open within withinDays
      const since = config.withinDays
        ? new Date(Date.now() - config.withinDays * 86_400_000)
        : new Date(0);
      const [row] = await db
        .select({ id: emailEvents.id })
        .from(emailEvents)
        .where(
          and(
            eq(emailEvents.contactId, contact.id),
            eq(emailEvents.orgId, ctx.orgId),
            eq(emailEvents.eventType, 'open'),
            sql`${emailEvents.createdAt} >= ${since.toISOString()}`,
          ),
        )
        .limit(1);
      result = !!row;
      break;
    }
    case 'email_clicked': {
      const [row] = await db
        .select({ id: emailEvents.id })
        .from(emailEvents)
        .where(
          and(
            eq(emailEvents.contactId, contact.id),
            eq(emailEvents.orgId, ctx.orgId),
            eq(emailEvents.eventType, 'click'),
          ),
        )
        .limit(1);
      result = !!row;
      break;
    }
    default: {
      // Generic field comparison
      const fieldValue = getContactField(contact, config.field);
      result = compareValues(fieldValue, config.op, config.value);
    }
  }

  return { type: 'branch', branch: result ? 'true' : 'false' };
}

function getContactField(contact: ContactData, field: string): unknown {
  if (field.startsWith('custom.')) {
    return contact.customFields[field.slice(7)];
  }
  const map: Record<string, unknown> = {
    email: contact.email,
    first_name: contact.firstName,
    last_name: contact.lastName,
    phone: contact.phone,
  };
  return map[field];
}

function compareValues(actual: unknown, op: string, expected: unknown): boolean {
  const a = String(actual ?? '').toLowerCase();
  const e = String(expected ?? '').toLowerCase();
  switch (op) {
    case 'eq':
      return a === e;
    case 'neq':
      return a !== e;
    case 'contains':
      return a.includes(e);
    case 'not_contains':
      return !a.includes(e);
    case 'starts_with':
      return a.startsWith(e);
    case 'ends_with':
      return a.endsWith(e);
    case 'is_set':
      return actual != null && actual !== '';
    case 'is_not_set':
      return actual == null || actual === '';
    case 'gt':
      return Number(actual) > Number(expected);
    case 'gte':
      return Number(actual) >= Number(expected);
    case 'lt':
      return Number(actual) < Number(expected);
    case 'lte':
      return Number(actual) <= Number(expected);
    default:
      return false;
  }
}

async function executeAddTag(
  node: WorkflowNode,
  run: WorkflowRun,
  ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as { tagName: string };
  if (!config.tagName || !run.contactId) return { type: 'next', nextNodeId: null };

  // Find or create tag, then attach to contact
  const { tags, contactTags } = await import('../../db/schema/index.js');
  const [tag] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.orgId, ctx.orgId), eq(tags.name, config.tagName)))
    .limit(1);

  if (tag) {
    await db
      .insert(contactTags)
      .values({ contactId: run.contactId, tagId: tag.id })
      .onConflictDoNothing()
      .catch(() => {});
  }

  return { type: 'next', nextNodeId: null };
}

async function executeRemoveTag(
  node: WorkflowNode,
  run: WorkflowRun,
  ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as { tagName: string };
  if (!config.tagName || !run.contactId) return { type: 'next', nextNodeId: null };

  const { tags, contactTags } = await import('../../db/schema/index.js');
  const [tag] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.orgId, ctx.orgId), eq(tags.name, config.tagName)))
    .limit(1);

  if (tag) {
    await db
      .delete(contactTags)
      .where(and(eq(contactTags.contactId, run.contactId), eq(contactTags.tagId, tag.id)))
      .catch(() => {});
  }

  return { type: 'next', nextNodeId: null };
}

async function executeUpdateField(
  node: WorkflowNode,
  run: WorkflowRun,
  ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as { field: string; value: unknown };
  if (!config.field || !run.contactId) return { type: 'next', nextNodeId: null };

  const allowedFields: Record<string, unknown> = {};
  if (config.field === 'first_name') allowedFields.firstName = config.value;
  else if (config.field === 'last_name') allowedFields.lastName = config.value;
  else if (config.field === 'phone') allowedFields.phone = config.value;

  if (Object.keys(allowedFields).length > 0) {
    await db
      .update(contacts)
      .set({ ...allowedFields, updatedAt: new Date() })
      .where(and(eq(contacts.id, run.contactId), eq(contacts.orgId, ctx.orgId)))
      .catch(() => {});
  }

  return { type: 'next', nextNodeId: null };
}

async function executeMoveToList(
  node: WorkflowNode,
  run: WorkflowRun,
  _ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as { listId: string };
  if (!config.listId || !run.contactId) return { type: 'next', nextNodeId: null };

  const { contactLists } = await import('../../db/schema/index.js');
  await db
    .insert(contactLists)
    .values({ contactId: run.contactId, listId: config.listId })
    .onConflictDoNothing()
    .catch(() => {});

  return { type: 'next', nextNodeId: null };
}

async function executeRemoveFromList(
  node: WorkflowNode,
  run: WorkflowRun,
  _ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as { listId: string };
  if (!config.listId || !run.contactId) return { type: 'next', nextNodeId: null };

  const { contactLists } = await import('../../db/schema/index.js');
  await db
    .delete(contactLists)
    .where(and(eq(contactLists.contactId, run.contactId), eq(contactLists.listId, config.listId)))
    .catch(() => {});

  return { type: 'next', nextNodeId: null };
}

async function executeInternalNotification(
  node: WorkflowNode,
  run: WorkflowRun,
  ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as { to: string; subject: string; body?: string };
  if (!config.to || !config.subject) return { type: 'next', nextNodeId: null };

  // Queue notification email (fire-and-forget via BullMQ)
  const { queues } = await import('../../lib/queues.js').catch(() => ({ queues: null }));
  if (queues) {
    await (
      queues as unknown as Record<string, { add: (name: string, data: unknown) => Promise<void> }>
    ).email
      ?.add('internal-notification', {
        orgId: ctx.orgId,
        to: config.to,
        subject: substituteMergeTags(config.subject, ctx.contact),
        body: config.body ? substituteMergeTags(config.body, ctx.contact) : undefined,
        workflowRunId: run.id,
      })
      .catch(() => {});
  }

  return { type: 'next', nextNodeId: null };
}

// ─── Smart channel selector (5.6) ─────────────────────────────────────────────

async function executeSmartChannel(
  node: WorkflowNode,
  run: WorkflowRun,
  ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as {
    preferredChannel?: 'email' | 'sms' | 'push' | 'whatsapp' | 'in_app';
    useAi?: boolean;
  };

  if (!run.contactId) return { type: 'next', nextNodeId: null };

  try {
    const { selectBestChannel } = await import('./smart-channel.js');
    const result = await selectBestChannel(
      run.contactId,
      ctx.orgId,
      config.preferredChannel,
      config.useAi ?? false,
    );

    // Store chosen channel in run data so the next node can read it
    run.data = { ...(run.data ?? {}), smartChannel: result.channel };

    // Branch on channel name so edges can be labelled 'email'|'sms'|'push'
    return { type: 'branch', branch: result.channel as 'true' | 'false' };
  } catch {
    return { type: 'next', nextNodeId: null };
  }
}

// ─── A/B split (5.7) ─────────────────────────────────────────────────────────

async function executeSplit(
  node: WorkflowNode,
  run: WorkflowRun,
  _ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as {
    /** Weights for each variant, e.g. [50, 50] or [33, 33, 34] */
    weights?: number[];
    /** Variant labels, e.g. ['A', 'B'] */
    variants?: string[];
  };

  const weights = config.weights ?? [50, 50];
  const variants = config.variants ?? weights.map((_, i) => String.fromCharCode(65 + i)); // A, B, C…

  if (!run.contactId) {
    // No contact — assign first variant
    return { type: 'branch', branch: variants[0] as 'true' | 'false' };
  }

  // Deterministic hash: sha256(contactId + nodeId) % total_weight
  const { createHash } = await import('node:crypto');
  const hashHex = createHash('sha256').update(`${run.contactId}:${node.id}`).digest('hex');
  const hashInt = parseInt(hashHex.slice(0, 8), 16); // first 4 bytes → 32-bit uint
  const total = weights.reduce((s, w) => s + w, 0);
  const bucket = hashInt % total;

  let cumulative = 0;
  let chosen: string = variants[0] ?? 'true';
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i]!;
    if (bucket < cumulative) {
      chosen = variants[i] ?? chosen;
      break;
    }
  }

  // Persist the branch on the run row (executor will save it)
  run.splitBranch = chosen;

  return { type: 'branch', branch: chosen as 'true' | 'false' };
}

// ─── Goal node (5.7) ─────────────────────────────────────────────────────────

async function executeGoal(
  node: WorkflowNode,
  run: WorkflowRun,
  ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as {
    /** Event that constitutes conversion: 'purchase' | 'form_submit' | custom */
    goalEvent?: string;
    /** Check email_events table for open/click goal */
    emailEventType?: 'open' | 'click';
  };

  let converted = false;

  if (config.emailEventType && run.contactId) {
    const [row] = await db
      .select({ id: emailEvents.id })
      .from(emailEvents)
      .where(
        and(
          eq(emailEvents.contactId, run.contactId),
          eq(emailEvents.orgId, ctx.orgId),
          eq(emailEvents.eventType, config.emailEventType),
        ),
      )
      .limit(1);
    converted = !!row;
  } else if (config.goalEvent) {
    // Check workflow_events for a custom event that occurred after run started
    const { workflowEvents } = await import('../../db/schema/index.js');
    const since = run.startedAt ?? run.createdAt;
    const [row] = await db
      .select({ id: workflowEvents.id })
      .from(workflowEvents)
      .where(
        and(
          eq(workflowEvents.orgId, ctx.orgId),
          eq(workflowEvents.contactId, run.contactId!),
          eq(workflowEvents.eventName, config.goalEvent),
          sql`${workflowEvents.createdAt} >= ${since}`,
        ),
      )
      .limit(1);
    converted = !!row;
  }

  if (converted) {
    // Mark the run as converted — executor will persist this
    run.converted = true;
    run.convertedAt = new Date();
  }

  // Goal nodes are pass-through — always continue to next node
  return { type: 'next', nextNodeId: null };
}

async function executeCascade(
  node: WorkflowNode,
  run: WorkflowRun,
  ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as {
    steps: Array<{
      channel: 'email' | 'sms' | 'push' | 'whatsapp' | 'viber';
      delayHours: number;
      condition: 'not_opened' | 'not_clicked' | 'not_delivered';
    }>;
  };

  if (!config.steps || config.steps.length === 0) {
    return { type: 'next', nextNodeId: null };
  }

  // Initialize cascade tracking on first execution
  const cascadeData = (run.data as Record<string, unknown>) || {};
  const currentStep = (cascadeData.cascadeStep as number) ?? 0;

  // On resume/re-entry: evaluate condition from the step we just sent
  if (currentStep > 0 && cascadeData.cascadeStep !== undefined) {
    const sentStep = config.steps[currentStep - 1];
    if (!sentStep) return { type: 'next', nextNodeId: null };
    const shouldProceed = await evaluateCascadeCondition(
      sentStep.condition,
      ctx.orgId,
      run.contactId,
      node.id,
    );

    if (!shouldProceed) {
      // Condition not met — exit cascade
      return { type: 'next', nextNodeId: null };
    }
  }

  // Send current step if it exists
  if (currentStep < config.steps.length) {
    const step = config.steps[currentStep];
    if (!step) return { type: 'next', nextNodeId: null };
    await executeCascadeStep(step, run, ctx);

    // Always schedule next check using this step's delay
    // (allows resume point to evaluate condition and decide on next step or exit)
    const nextExecutionAt = new Date(Date.now() + step.delayHours * 3_600_000);
    return {
      type: 'wait',
      until: nextExecutionAt,
    };
  }

  return { type: 'next', nextNodeId: null };
}

async function executeSendViber(
  node: WorkflowNode,
  run: WorkflowRun,
  ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as { templateId?: string; body?: string };
  const { queues } = await import('../../lib/queues.js').catch(() => ({ queues: null }));
  if (queues) {
    await (
      queues as unknown as Record<string, { add: (name: string, data: unknown) => Promise<void> }>
    ).viber
      ?.add('workflow-viber', {
        orgId: ctx.orgId,
        contactId: run.contactId,
        workflowRunId: run.id,
        templateId: config.templateId,
        body: config.body ? substituteMergeTags(config.body, ctx.contact) : undefined,
      })
      .catch(() => {});
  }
  return { type: 'next', nextNodeId: null };
}

async function executeCascadeStep(
  step: {
    channel: 'email' | 'sms' | 'push' | 'whatsapp' | 'viber';
    delayHours: number;
    condition: 'not_opened' | 'not_clicked' | 'not_delivered';
  },
  run: WorkflowRun,
  ctx: ActionContext,
): Promise<void> {
  try {
    const { queues } = await import('../../lib/queues.js');

    switch (step.channel) {
      case 'email':
        if (queues && (queues as Record<string, unknown>).email) {
          const emailQueue = (queues as Record<string, unknown>).email as {
            add: (name: string, data: unknown) => Promise<void>;
          };
          await emailQueue.add('cascade-email', {
            orgId: ctx.orgId,
            contactId: run.contactId,
            workflowRunId: run.id,
          });
        }
        break;

      case 'sms':
        if (ctx.contact?.phone && queues && (queues as Record<string, unknown>).sms) {
          const smsQueue = (queues as Record<string, unknown>).sms as {
            add: (name: string, data: unknown) => Promise<void>;
          };
          await smsQueue.add('cascade-sms', {
            orgId: ctx.orgId,
            contactId: run.contactId,
            workflowRunId: run.id,
            phone: ctx.contact.phone,
          });
        }
        break;

      case 'push':
      case 'whatsapp':
        // Placeholder for push/whatsapp queuing
        break;

      case 'viber':
        if (queues && (queues as Record<string, unknown>).viber) {
          const viberQueue = (queues as Record<string, unknown>).viber as {
            add: (name: string, data: unknown) => Promise<void>;
          };
          await viberQueue.add('cascade-viber', {
            orgId: ctx.orgId,
            contactId: run.contactId,
            workflowRunId: run.id,
            phone: ctx.contact?.phone,
          });
        }
        break;
    }
  } catch {
    // Silently fail if queues not available
  }
}

async function evaluateCascadeCondition(
  condition: 'not_opened' | 'not_clicked' | 'not_delivered',
  orgId: string,
  contactId: string | null,
  _nodeId: string,
): Promise<boolean> {
  if (!contactId) return true; // No contact → allow next step

  const { emailEvents } = await import('../../db/schema/index.js');

  switch (condition) {
    case 'not_opened': {
      // Check if any email_open event for this contact in the last window
      const [openEvent] = await db
        .select()
        .from(emailEvents)
        .where(
          and(
            eq(emailEvents.orgId, orgId),
            eq(emailEvents.contactId, contactId),
            eq(emailEvents.eventType, 'open'),
            sql`${emailEvents.createdAt} >= NOW() - INTERVAL '24 hours'`,
          ),
        )
        .limit(1);
      return !openEvent;
    }

    case 'not_clicked': {
      const [clickEvent] = await db
        .select()
        .from(emailEvents)
        .where(
          and(
            eq(emailEvents.orgId, orgId),
            eq(emailEvents.contactId, contactId),
            eq(emailEvents.eventType, 'click'),
            sql`${emailEvents.createdAt} >= NOW() - INTERVAL '24 hours'`,
          ),
        )
        .limit(1);
      return !clickEvent;
    }

    case 'not_delivered': {
      const [deliveredEvent] = await db
        .select()
        .from(emailEvents)
        .where(
          and(
            eq(emailEvents.orgId, orgId),
            eq(emailEvents.contactId, contactId),
            eq(emailEvents.eventType, 'deliver'),
            sql`${emailEvents.createdAt} >= NOW() - INTERVAL '24 hours'`,
          ),
        )
        .limit(1);
      return !deliveredEvent;
    }

    default:
      return true;
  }
}

// ─── Automated 1:1 personal email (#198) ────────────────────────────────────

async function executeSendPersonalEmail(
  node: WorkflowNode,
  run: WorkflowRun,
  ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as {
    fromEmail: string;
    fromName?: string;
    replyTo?: string;
    subject: string;
    body: string; // plain-text body with merge tags
  };

  if (!config.fromEmail || !config.subject || !config.body) {
    return { type: 'error', message: 'send_personal_email requires fromEmail, subject, and body' };
  }

  const { buildMergeVars, substitutePersonalMergeTags, buildPersonalHtml } =
    await import('../crm/one-to-one-email.js');

  const vars = buildMergeVars(ctx.contact ?? {});
  const subject = substitutePersonalMergeTags(config.subject, vars);
  const bodyText = substitutePersonalMergeTags(config.body, vars);
  const bodyHtml = buildPersonalHtml(bodyText);

  const { queues } = await import('../../lib/queues.js').catch(() => ({ queues: null }));
  if (queues) {
    await (
      queues as unknown as Record<string, { add: (name: string, data: unknown) => Promise<void> }>
    ).email
      ?.add('personal-email', {
        orgId: ctx.orgId,
        contactId: run.contactId,
        workflowRunId: run.id,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
        replyTo: config.replyTo ?? config.fromEmail,
        subject,
        bodyText,
        bodyHtml,
        isPersonal: true,
      })
      .catch(() => {});
  }

  return { type: 'next', nextNodeId: null };
}

// ─── Assign task with round-robin (#188) ─────────────────────────────────────

async function executeAssignTask(
  node: WorkflowNode,
  run: WorkflowRun,
  ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as {
    title?: string;
    type?: 'call' | 'email' | 'meeting' | 'todo';
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    dueDays?: number;
    /** Explicit list of user IDs to round-robin among. If omitted, use all org users. */
    assigneeIds?: string[];
  };

  if (!run.contactId) return { type: 'next', nextNodeId: null };

  const title = config.title
    ? substituteMergeTags(config.title, ctx.contact)
    : `Follow up with ${ctx.contact?.firstName ?? 'contact'}`;

  // Determine assignee via round-robin (Redis counter)
  let assignedUserId: string | null = null;
  if (config.assigneeIds && config.assigneeIds.length > 0) {
    const rrKey = `rr:assign_task:${ctx.orgId}:${node.id}`;
    const idx = await redis.incr(rrKey);
    assignedUserId = config.assigneeIds[(idx - 1) % config.assigneeIds.length]!;
  } else {
    // Pick from org users
    const { users } = await import('../../db/schema/index.js');
    const { isNull: isNullDrizzle } = await import('drizzle-orm');
    const orgUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.orgId, ctx.orgId), isNullDrizzle(users.deletedAt)))
      .limit(50);
    if (orgUsers.length > 0) {
      const rrKey = `rr:assign_task:${ctx.orgId}:${node.id}`;
      const idx = await redis.incr(rrKey);
      assignedUserId = orgUsers[(idx - 1) % orgUsers.length]!.id;
    }
  }

  // Create the task
  const { createTask } = await import('../crm/tasks.js');
  const dueAt = config.dueDays ? new Date(Date.now() + config.dueDays * 86_400_000) : undefined;

  await createTask(ctx.orgId, {
    title,
    type: config.type ?? 'todo',
    priority: config.priority ?? 'medium',
    contactId: run.contactId,
    assignedUserId,
    dueAt,
  }).catch(() => {}); // don't fail the workflow run on task creation errors

  return { type: 'next', nextNodeId: null };
}

// ─── Nested automation (#213) ─────────────────────────────────────────────────

async function executeStartWorkflow(
  node: WorkflowNode,
  run: WorkflowRun,
  ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as {
    workflowId?: string;
    /** Pass down a subset of the parent run's data as child context */
    passData?: Record<string, unknown>;
  };

  if (!config.workflowId)
    return { type: 'error', message: 'start_workflow: workflowId is required' };

  try {
    const { startWorkflowRun } = await import('./executor.js');
    if (run.contactId) {
      await startWorkflowRun(config.workflowId, ctx.orgId, run.contactId, {
        parentRunId: run.id,
        ...config.passData,
      });
    }
  } catch {
    // Child workflow not found or inactive — log but don't fail the parent run
  }

  return { type: 'next', nextNodeId: null };
}

// ─── Loyalty actions (#239) ───────────────────────────────────────────────────

async function executeEnrollInLoyalty(
  node: WorkflowNode,
  run: WorkflowRun,
  ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as { programId?: string };
  if (!config.programId)
    return { type: 'error', message: 'enroll_in_loyalty: programId is required' };
  if (!run.contactId) return { type: 'next', nextNodeId: null };

  try {
    const { workflowEnrollAction } = await import('../loyalty/enrollment.js');
    await workflowEnrollAction(ctx.orgId, run.contactId, config.programId);
  } catch {
    // Enrollment failure should not break the workflow run
  }
  return { type: 'next', nextNodeId: null };
}

async function executeAwardLoyaltyPoints(
  node: WorkflowNode,
  run: WorkflowRun,
  ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as {
    programId?: string;
    points?: number;
    description?: string;
  };
  if (!config.programId || !config.points) {
    return { type: 'error', message: 'award_loyalty_points: programId and points are required' };
  }
  if (!run.contactId) return { type: 'next', nextNodeId: null };

  try {
    const { getMemberByContact, creditPoints } = await import('../loyalty/enrollment.js');
    const member = await getMemberByContact(ctx.orgId, config.programId, run.contactId);
    if (member) {
      const { tieredUp, tierName } = await creditPoints(ctx.orgId, member.id, config.points, {
        description: config.description ?? 'Workflow bonus points',
        type: 'bonus',
        actorType: 'workflow',
        actorId: run.workflowId,
      });
      // Fire tier-up trigger if applicable
      if (tieredUp && member.currentTierId && tierName) {
        const { onLoyaltyTierUp } = await import('./triggers.js');
        await onLoyaltyTierUp(
          ctx.orgId,
          run.contactId,
          config.programId,
          member.currentTierId,
          tierName,
        );
      }
    }
  } catch {
    // Don't fail the run
  }
  return { type: 'next', nextNodeId: null };
}

// ─── Sync to Ad Audience (#307) ───────────────────────────────────────────────

async function executeSyncToAdAudience(
  node: WorkflowNode,
  run: WorkflowRun,
  ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as { adAccountId?: string; audienceName?: string };
  if (!config.adAccountId || !config.audienceName) {
    return {
      type: 'error',
      message: 'sync_to_ad_audience: adAccountId and audienceName are required',
    };
  }
  try {
    if (!run.contactId) return { type: 'next', nextNodeId: null };
    const contactId = run.contactId;
    const contact = await db.query.contacts.findFirst({
      where: (c, { eq }) => eq(c.id, contactId),
    });
    if (!contact?.email) return { type: 'next', nextNodeId: null };

    const { syncAudienceToAdPlatform } = await import('../ads/audience-sync.js');
    await syncAudienceToAdPlatform(ctx.orgId, {
      adAccountId: config.adAccountId,
      audienceName: config.audienceName,
    });
  } catch {
    // Non-fatal: ad sync failure should not abort the workflow run
  }
  return { type: 'next', nextNodeId: null };
}

// ─── Stripe retry charge (#314 dunning) ──────────────────────────────────────

async function executeStripeRetryCharge(
  node: WorkflowNode,
  run: WorkflowRun,
  ctx: ActionContext,
): Promise<ActionResult> {
  const invoiceId =
    (node.config as { invoiceId?: string }).invoiceId ??
    (run.data as { invoiceId?: string }).invoiceId;
  if (!invoiceId) return { type: 'next', nextNodeId: null };

  try {
    const { retryStripeInvoice } = await import('../commerce/payments.js');
    await retryStripeInvoice(ctx.orgId, invoiceId);
  } catch {
    // Non-fatal: failed retries continue the dunning workflow
  }
  return { type: 'next', nextNodeId: null };
}

// ─── Notify workspace owner (#314 dunning) ───────────────────────────────────

async function executeNotifyOwner(
  node: WorkflowNode,
  run: WorkflowRun,
  ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as { channel?: 'in_app' | 'email'; message?: string };
  const message = substituteMergeTags(config.message ?? 'Workflow alert', ctx.contact, {
    org_name: ctx.orgId,
  });

  await redis.publish(
    `org:${ctx.orgId}:notifications`,
    JSON.stringify({
      type: 'workflow_alert',
      channel: config.channel ?? 'in_app',
      message,
      workflowRunId: run.id,
      at: new Date().toISOString(),
    }),
  );
  return { type: 'next', nextNodeId: null };
}

async function executeRunCode(
  node: WorkflowNode,
  run: WorkflowRun,
  ctx: ActionContext,
): Promise<ActionResult> {
  const config = node.config as {
    script?: string;
    timeoutMs?: number;
    maxOutputBytes?: number;
    /** When true, script failure short-circuits the workflow run. */
    failOnError?: boolean;
  };
  if (!config.script) {
    return { type: 'error', message: 'run_code node missing `script`' };
  }

  const { runUserCode } = await import('./serverless-runner.js');
  const result = await runUserCode({
    orgId: ctx.orgId,
    script: config.script,
    input: {
      contact: ctx.contact,
      runData: run.data ?? {},
    },
    timeoutMs: config.timeoutMs,
    maxOutputBytes: config.maxOutputBytes,
  });

  // Merge script output into run data so downstream nodes can reference it.
  if (result.ok && result.output && typeof result.output === 'object') {
    run.data = { ...(run.data ?? {}), ...(result.output as Record<string, unknown>) };
  }
  if (!result.ok && config.failOnError) {
    return { type: 'error', message: `run_code failed: ${result.error ?? 'unknown'}` };
  }
  return { type: 'next', nextNodeId: null };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function executeAction(
  node: WorkflowNode,
  run: WorkflowRun,
  ctx: ActionContext,
): Promise<ActionResult> {
  switch (node.type) {
    case 'send_email':
      return executeSendEmail(node, run, ctx);
    case 'send_sms':
      return executeSendSms(node, run, ctx);
    case 'send_whatsapp':
      // Same pattern as SMS; queue WhatsApp job
      return { type: 'next', nextNodeId: null };
    case 'send_push':
      return { type: 'next', nextNodeId: null }; // queued by workers
    case 'show_in_app':
      return { type: 'next', nextNodeId: null }; // in-app notification via WS push
    case 'make_voice_call':
      return { type: 'next', nextNodeId: null }; // voice bot job
    case 'wait':
      return executeWait(node, run, ctx);
    case 'condition':
      return executeCondition(node, run, ctx);
    case 'add_tag':
      return executeAddTag(node, run, ctx);
    case 'remove_tag':
      return executeRemoveTag(node, run, ctx);
    case 'update_field':
      return executeUpdateField(node, run, ctx);
    case 'move_to_list':
      return executeMoveToList(node, run, ctx);
    case 'remove_from_list':
      return executeRemoveFromList(node, run, ctx);
    case 'send_webhook':
      return executeSendWebhook(node, run, ctx);
    case 'internal_notification':
      return executeInternalNotification(node, run, ctx);
    case 'smart_channel':
      return executeSmartChannel(node, run, ctx);
    case 'split':
      return executeSplit(node, run, ctx);
    case 'goal':
      return executeGoal(node, run, ctx);
    case 'send_viber':
      return executeSendViber(node, run, ctx);
    case 'cascade':
      return executeCascade(node, run, ctx);
    case 'send_personal_email':
      return executeSendPersonalEmail(node, run, ctx);
    case 'assign_task':
      return executeAssignTask(node, run, ctx);
    case 'start_workflow':
      return executeStartWorkflow(node, run, ctx);
    case 'enroll_in_loyalty':
      return executeEnrollInLoyalty(node, run, ctx);
    case 'award_loyalty_points':
      return executeAwardLoyaltyPoints(node, run, ctx);
    case 'sync_to_ad_audience':
      return executeSyncToAdAudience(node, run, ctx);
    case 'stripe_retry_charge':
      return executeStripeRetryCharge(node, run, ctx);
    case 'notify_owner':
      return executeNotifyOwner(node, run, ctx);
    case 'run_code':
      return executeRunCode(node, run, ctx);
    case 'trigger':
      // Trigger nodes don't execute — they're the entry point
      return { type: 'next', nextNodeId: null };
    default:
      return { type: 'error', message: `Unknown node type: ${(node as WorkflowNode).type}` };
  }
}
