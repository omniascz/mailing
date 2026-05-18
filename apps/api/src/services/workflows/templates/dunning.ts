/**
 * Dunning workflow template (#314).
 *
 * Triggered when Stripe emits `invoice.payment_failed` (mapped to
 * api_event 'payment_failed' by services/commerce/payments.ts).
 *
 * Strategy — 3 escalating reminders + retry attempts + eventual
 * cancellation tag for manual intervention.
 *
 *   t=0    :  immediate polite email ("your payment failed")
 *   t=2d   :  second reminder (firm), retry charge via Stripe
 *   t=5d   :  final notice + add risk tag
 *   t=7d   :  mark account as past_due + notify account owner via in-app
 */

import type { FlowTemplate } from '../flow-templates.js';

export const DUNNING_TEMPLATE: FlowTemplate = {
  id: 'dunning-payment-failed',
  name: 'Dunning — Failed Payment Recovery',
  description:
    'Escalating recovery sequence after a Stripe payment fails: 3 emails + 2 retry attempts over 7 days, then flag the account.',
  category: 'retention',
  triggerType: 'api_event',
  estimatedDurationDays: 7,
  nodes: [
    {
      id: 'trigger-1',
      type: 'trigger',
      config: { triggerType: 'api_event', eventName: 'payment_failed' },
      position: { x: 300, y: 50 },
    },
    {
      id: 'goal-1',
      type: 'goal',
      config: {
        goalEvent: 'payment_succeeded',
        description: 'Contact completed payment — exit workflow',
      },
      position: { x: 300, y: 180 },
    },
    // Day 0 — soft reminder
    {
      id: 'email-1',
      type: 'send_email',
      config: {
        subject: 'Platba selhala — prosíme o aktualizaci',
        templateId: null,
        description: 'Day 0 — polite notice, link to update card',
      },
      position: { x: 300, y: 310 },
    },
    {
      id: 'wait-1',
      type: 'wait',
      config: { duration: 2, unit: 'days' },
      position: { x: 300, y: 440 },
    },
    // Day 2 — retry charge via Stripe + firmer reminder
    {
      id: 'retry-1',
      type: 'stripe_retry_charge',
      config: { description: 'Retry failed invoice through Stripe' },
      position: { x: 300, y: 570 },
    },
    {
      id: 'email-2',
      type: 'send_email',
      config: {
        subject: 'Druhé upozornění: vaše předplatné vyprší',
        templateId: null,
        description: 'Day 2 — firm tone',
      },
      position: { x: 300, y: 700 },
    },
    {
      id: 'wait-2',
      type: 'wait',
      config: { duration: 3, unit: 'days' },
      position: { x: 300, y: 830 },
    },
    // Day 5 — final warning + tag
    {
      id: 'retry-2',
      type: 'stripe_retry_charge',
      config: { description: 'Second retry attempt' },
      position: { x: 300, y: 960 },
    },
    {
      id: 'email-3',
      type: 'send_email',
      config: {
        subject: 'Poslední upozornění — váš účet bude pozastaven',
        templateId: null,
        description: 'Day 5 — final notice',
      },
      position: { x: 300, y: 1090 },
    },
    {
      id: 'tag-1',
      type: 'add_tag',
      config: { tagName: 'payment-at-risk' },
      position: { x: 300, y: 1220 },
    },
    {
      id: 'wait-3',
      type: 'wait',
      config: { duration: 2, unit: 'days' },
      position: { x: 300, y: 1350 },
    },
    // Day 7 — past_due: notify account owner via in-app
    {
      id: 'notify-1',
      type: 'notify_owner',
      config: {
        channel: 'in_app',
        message: 'Account {{org_name}} is past due after 7 days of failed payment retries.',
      },
      position: { x: 300, y: 1480 },
    },
    {
      id: 'tag-2',
      type: 'add_tag',
      config: { tagName: 'past-due' },
      position: { x: 300, y: 1610 },
    },
  ],
  edges: [
    { id: 'e1',  source: 'trigger-1', target: 'goal-1'   },
    { id: 'e2',  source: 'goal-1',    target: 'email-1'  },
    { id: 'e3',  source: 'email-1',   target: 'wait-1'   },
    { id: 'e4',  source: 'wait-1',    target: 'retry-1'  },
    { id: 'e5',  source: 'retry-1',   target: 'email-2'  },
    { id: 'e6',  source: 'email-2',   target: 'wait-2'   },
    { id: 'e7',  source: 'wait-2',    target: 'retry-2'  },
    { id: 'e8',  source: 'retry-2',   target: 'email-3'  },
    { id: 'e9',  source: 'email-3',   target: 'tag-1'    },
    { id: 'e10', source: 'tag-1',     target: 'wait-3'   },
    { id: 'e11', source: 'wait-3',    target: 'notify-1' },
    { id: 'e12', source: 'notify-1',  target: 'tag-2'    },
  ],
};
