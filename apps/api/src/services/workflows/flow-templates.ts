/**
 * Pre-built workflow templates (task 5.8).
 *
 * Templates are static JSON definitions. When a user picks one, a new
 * workflow row is created from the template (POST /workflows/templates/:id/use).
 *
 * Templates:
 *   welcome-series     — 3-email onboarding drip after list subscribe
 *   abandoned-cart     — 2-step recovery after purchase_event absence
 *   onboarding         — tag-based product feature tour
 *   re-engagement      — win-back sequence for inactive contacts
 */

import type { WorkflowNode, WorkflowEdge } from '../../db/schema/workflows.js';
import { DUNNING_TEMPLATE } from './templates/dunning.js';

export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'onboarding' | 'ecommerce' | 'engagement' | 'retention';
  triggerType: string;
  estimatedDurationDays: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// ─── Template definitions ─────────────────────────────────────────────────────

const WELCOME_SERIES: FlowTemplate = {
  id: 'welcome-series',
  name: 'Welcome Series',
  description: 'Three-email drip sequence triggered when a contact subscribes to a list.',
  category: 'onboarding',
  triggerType: 'list_subscribe',
  estimatedDurationDays: 7,
  nodes: [
    {
      id: 'trigger-1',
      type: 'trigger',
      config: { triggerType: 'list_subscribe' },
      position: { x: 300, y: 50 },
    },
    {
      id: 'email-1',
      type: 'send_email',
      config: {
        subject: 'Welcome to {{org_name}}, {{first_name}}!',
        templateId: null,
        description: 'Immediate welcome email',
      },
      position: { x: 300, y: 180 },
    },
    {
      id: 'wait-1',
      type: 'wait',
      config: { duration: 2, unit: 'days' },
      position: { x: 300, y: 310 },
    },
    {
      id: 'email-2',
      type: 'send_email',
      config: {
        subject: 'Getting started with {{org_name}}',
        templateId: null,
        description: 'Day 2 — feature highlights',
      },
      position: { x: 300, y: 440 },
    },
    {
      id: 'wait-2',
      type: 'wait',
      config: { duration: 5, unit: 'days' },
      position: { x: 300, y: 570 },
    },
    {
      id: 'email-3',
      type: 'send_email',
      config: {
        subject: 'Your first week with {{org_name}} — tips & resources',
        templateId: null,
        description: 'Day 7 — social proof + CTA',
      },
      position: { x: 300, y: 700 },
    },
  ],
  edges: [
    { id: 'e1', source: 'trigger-1', target: 'email-1' },
    { id: 'e2', source: 'email-1',   target: 'wait-1'  },
    { id: 'e3', source: 'wait-1',    target: 'email-2' },
    { id: 'e4', source: 'email-2',   target: 'wait-2'  },
    { id: 'e5', source: 'wait-2',    target: 'email-3' },
  ],
};

const ABANDONED_CART: FlowTemplate = {
  id: 'abandoned-cart',
  name: 'Abandoned Cart Recovery',
  description: 'Two-touch recovery sequence for contacts who added items but did not purchase.',
  category: 'ecommerce',
  triggerType: 'api_event',
  estimatedDurationDays: 3,
  nodes: [
    {
      id: 'trigger-1',
      type: 'trigger',
      config: { triggerType: 'api_event', eventName: 'cart_abandoned' },
      position: { x: 300, y: 50 },
    },
    {
      id: 'wait-1',
      type: 'wait',
      config: { duration: 1, unit: 'hours' },
      position: { x: 300, y: 180 },
    },
    {
      id: 'goal-1',
      type: 'goal',
      config: { goalEvent: 'purchase', description: 'Contact completed purchase' },
      position: { x: 300, y: 310 },
    },
    {
      id: 'condition-1',
      type: 'condition',
      config: { field: 'custom.cart_value', op: 'gt', value: '0' },
      position: { x: 300, y: 440 },
    },
    {
      id: 'email-1',
      type: 'send_email',
      config: {
        subject: 'You left something behind, {{first_name}}!',
        templateId: null,
        description: 'Reminder — items still in cart',
      },
      position: { x: 150, y: 570 },
    },
    {
      id: 'wait-2',
      type: 'wait',
      config: { duration: 2, unit: 'days' },
      position: { x: 150, y: 700 },
    },
    {
      id: 'email-2',
      type: 'send_email',
      config: {
        subject: 'Last chance — your cart expires soon',
        templateId: null,
        description: 'Day 2 — urgency + discount offer',
      },
      position: { x: 150, y: 830 },
    },
  ],
  edges: [
    { id: 'e1', source: 'trigger-1',   target: 'wait-1'      },
    { id: 'e2', source: 'wait-1',      target: 'goal-1'      },
    { id: 'e3', source: 'goal-1',      target: 'condition-1' },
    { id: 'e4', source: 'condition-1', target: 'email-1',  label: 'true'  },
    { id: 'e5', source: 'email-1',     target: 'wait-2'      },
    { id: 'e6', source: 'wait-2',      target: 'email-2'     },
  ],
};

const ONBOARDING_TOUR: FlowTemplate = {
  id: 'onboarding-tour',
  name: 'Product Onboarding Tour',
  description: 'Tag-driven feature tour that adapts based on whether the contact has activated each feature.',
  category: 'onboarding',
  triggerType: 'tag_added',
  estimatedDurationDays: 14,
  nodes: [
    {
      id: 'trigger-1',
      type: 'trigger',
      config: { triggerType: 'tag_added', tagName: 'trial_started' },
      position: { x: 300, y: 50 },
    },
    {
      id: 'email-1',
      type: 'send_email',
      config: {
        subject: 'Start here: your setup checklist',
        templateId: null,
        description: 'Setup checklist email',
      },
      position: { x: 300, y: 180 },
    },
    {
      id: 'wait-1',
      type: 'wait',
      config: { duration: 3, unit: 'days' },
      position: { x: 300, y: 310 },
    },
    {
      id: 'condition-1',
      type: 'condition',
      config: { field: 'has_tag', op: 'eq', value: 'feature_a_used' },
      position: { x: 300, y: 440 },
    },
    {
      id: 'email-2a',
      type: 'send_email',
      config: {
        subject: 'Level up: discover Feature B',
        templateId: null,
        description: 'Feature A done — pitch Feature B',
      },
      position: { x: 150, y: 570 },
    },
    {
      id: 'email-2b',
      type: 'send_email',
      config: {
        subject: 'Complete your setup — try Feature A',
        templateId: null,
        description: 'Feature A not used — nudge',
      },
      position: { x: 450, y: 570 },
    },
    {
      id: 'wait-2',
      type: 'wait',
      config: { duration: 7, unit: 'days' },
      position: { x: 300, y: 700 },
    },
    {
      id: 'email-3',
      type: 'send_email',
      config: {
        subject: 'Your trial ends soon — here is what you have achieved',
        templateId: null,
        description: 'Day 14 — trial summary + upgrade CTA',
      },
      position: { x: 300, y: 830 },
    },
  ],
  edges: [
    { id: 'e1', source: 'trigger-1',   target: 'email-1'     },
    { id: 'e2', source: 'email-1',     target: 'wait-1'      },
    { id: 'e3', source: 'wait-1',      target: 'condition-1' },
    { id: 'e4', source: 'condition-1', target: 'email-2a',   label: 'true'  },
    { id: 'e5', source: 'condition-1', target: 'email-2b',   label: 'false' },
    { id: 'e6', source: 'email-2a',    target: 'wait-2'      },
    { id: 'e7', source: 'email-2b',    target: 'wait-2'      },
    { id: 'e8', source: 'wait-2',      target: 'email-3'     },
  ],
};

const RE_ENGAGEMENT: FlowTemplate = {
  id: 're-engagement',
  name: 'Re-engagement (Win-Back)',
  description: 'Reactivate contacts who have not opened an email in 90+ days.',
  category: 'retention',
  triggerType: 'manual',
  estimatedDurationDays: 14,
  nodes: [
    {
      id: 'trigger-1',
      type: 'trigger',
      config: { triggerType: 'manual', description: 'Run against inactive segment' },
      position: { x: 300, y: 50 },
    },
    {
      id: 'smart-1',
      type: 'smart_channel',
      config: { useAi: false },
      position: { x: 300, y: 180 },
    },
    {
      id: 'email-1',
      type: 'send_email',
      config: {
        subject: 'We miss you, {{first_name}}',
        templateId: null,
        description: 'Re-engagement — email path',
      },
      position: { x: 150, y: 310 },
    },
    {
      id: 'sms-1',
      type: 'send_sms',
      config: { message: 'Hi {{first_name}}, we miss you! Check out what is new: {{link}}' },
      position: { x: 450, y: 310 },
    },
    {
      id: 'wait-1',
      type: 'wait',
      config: { duration: 7, unit: 'days' },
      position: { x: 300, y: 440 },
    },
    {
      id: 'condition-1',
      type: 'condition',
      config: { field: 'email_opened', op: 'eq', withinDays: 7 },
      position: { x: 300, y: 570 },
    },
    {
      id: 'email-2',
      type: 'send_email',
      config: {
        subject: 'One last thing — a special offer just for you',
        templateId: null,
        description: 'Final re-engagement with discount',
      },
      position: { x: 450, y: 700 },
    },
    {
      id: 'remove-1',
      type: 'remove_from_list',
      config: { listId: null, description: 'Remove from active list' },
      position: { x: 150, y: 700 },
    },
    {
      id: 'tag-1',
      type: 'add_tag',
      config: { tagName: 'inactive' },
      position: { x: 150, y: 830 },
    },
  ],
  edges: [
    { id: 'e1', source: 'trigger-1',   target: 'smart-1'     },
    { id: 'e2', source: 'smart-1',     target: 'email-1',    label: 'email' },
    { id: 'e3', source: 'smart-1',     target: 'sms-1',      label: 'sms'   },
    { id: 'e4', source: 'email-1',     target: 'wait-1'      },
    { id: 'e5', source: 'sms-1',       target: 'wait-1'      },
    { id: 'e6', source: 'wait-1',      target: 'condition-1' },
    { id: 'e7', source: 'condition-1', target: 'remove-1',   label: 'false' },
    { id: 'e8', source: 'condition-1', target: 'email-2',    label: 'true'  },
    { id: 'e9', source: 'remove-1',    target: 'tag-1'       },
  ],
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const FLOW_TEMPLATES: FlowTemplate[] = [
  WELCOME_SERIES,
  ABANDONED_CART,
  ONBOARDING_TOUR,
  RE_ENGAGEMENT,
  DUNNING_TEMPLATE,
];

export function getFlowTemplate(id: string): FlowTemplate | undefined {
  return FLOW_TEMPLATES.find((t) => t.id === id);
}
