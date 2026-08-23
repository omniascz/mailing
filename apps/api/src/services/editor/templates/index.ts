/**
 * Built-in email template library.
 *
 * Each template is a full EmailSchema-compatible JSON object.
 * Categories: newsletter, promo, transactional, event, onboarding, seasonal, ecommerce, b2b, saas
 *
 * The list is intentionally kept as plain TS data (no filesystem reads at runtime)
 * so the templates work in any environment without file-system access.
 */

import { EXTENDED_TEMPLATES } from './extended.js';
import { EXTENDED_TEMPLATES_2 } from './extended2.js';
import { CZECH_TEMPLATES } from './czech.js';

export type TemplateCategory =
  | 'newsletter'
  | 'promo'
  | 'transactional'
  | 'event'
  | 'onboarding'
  | 'seasonal'
  | 'ecommerce'
  | 'b2b'
  | 'saas';

/**
 * Language a template is written in.
 *
 * Chosen over carrying several languages inside one template. A multilingual
 * template would mean every text, subject and button label became a
 * locale→string map, which is a change to EmailSchema itself: the renderer, the
 * editor canvas and all 71 existing templates would have to follow. The
 * language of an email is a property of the whole email — its tone, its length,
 * its greeting — not a swappable string table, and a Czech order confirmation
 * is a different email from an English one, not a translation of it.
 *
 * So a variant is its own entry, and `family` is what ties variants together.
 */
export type TemplateLocale = 'en' | 'cs' | 'sk';

export interface TemplateMeta {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  thumbnailUrl: string | null;
  schema: object;
  /**
   * Absent means 'en'. Not an inference — the 71 templates that predate this
   * field are English, and writing the field onto each of them would be 71
   * edits that change nothing. `localeOf` is the single place that resolves it.
   */
  locale?: TemplateLocale;
  /**
   * Groups variants of the same email across languages, e.g. 'order-confirmation'.
   * Absent means the template has no siblings.
   */
  family?: string;
}

/** The language of a template. Absent locale means English — see TemplateMeta. */
export function localeOf(t: TemplateMeta): TemplateLocale {
  return t.locale ?? 'en';
}

const DEFAULT_GLOBAL_STYLES = {
  backgroundColor: '#f1f5f9',
  contentBackgroundColor: '#ffffff',
  fontFamily: 'Arial, Helvetica, sans-serif',
  linkColor: '#2563eb',
  textColor: '#1f2937',
  contentWidth: 600,
};

export const TEMPLATES: TemplateMeta[] = [
  // ─────────────────────── NEWSLETTER ────────────────────────────────────────
  {
    id: 'nl-001',
    name: 'Monthly Newsletter',
    category: 'newsletter',
    description: 'Classic newsletter with hero image, two-column articles, and footer.',
    thumbnailUrl: null,
    schema: {
      subject: '{{company}} — Monthly Newsletter',
      preheader: 'Here is what happened this month.',
      globalStyles: DEFAULT_GLOBAL_STYLES,
      blocks: [
        {
          id: 'b1',
          type: 'hero',
          backgroundColor: '#1e293b',
          minHeight: '200px',
          content: [
            {
              id: 'b1a',
              type: 'text',
              content: '<h1 style="color:#f8fafc;margin:0;font-size:28px;">Monthly Newsletter</h1>',
              fontSize: '28px',
              fontFamily: 'Arial, Helvetica, sans-serif',
              color: '#f8fafc',
              lineHeight: '1.3',
              textAlign: 'center',
            },
            {
              id: 'b1b',
              type: 'text',
              content: '<p style="color:#94a3b8;margin:8px 0 0;">{{current_date}}</p>',
              fontSize: '14px',
              fontFamily: 'Arial, Helvetica, sans-serif',
              color: '#94a3b8',
              lineHeight: '1.5',
              textAlign: 'center',
            },
          ],
        },
        { id: 'b2', type: 'spacer', height: 24 },
        {
          id: 'b3',
          type: 'text',
          content:
            '<p>Hello {{first_name|default:"there"}},</p><p>Here is a roundup of what happened this month at {{company|default:"our company"}}.</p>',
          fontSize: '16px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#1f2937',
          lineHeight: '1.6',
          textAlign: 'left',
        },
        { id: 'b4', type: 'divider', color: '#e2e8f0', thickness: 1, widthPercent: 100 },
        {
          id: 'b5',
          type: 'columns',
          columnRatios: [1, 1],
          gap: '12px',
          columns: [
            [
              {
                id: 'b5a',
                type: 'text',
                content:
                  '<h2 style="font-size:18px;margin:0 0 8px;">Article Title</h2><p style="margin:0 0 12px;color:#475569;">Short description of the first article goes here. Keep it punchy.</p>',
                fontSize: '15px',
                fontFamily: 'Arial, Helvetica, sans-serif',
                color: '#1f2937',
                lineHeight: '1.6',
                textAlign: 'left',
              },
              {
                id: 'b5b',
                type: 'button',
                text: 'Read more',
                url: '{{article_1_url|default:"#"}}',
                backgroundColor: '#2563eb',
                textColor: '#ffffff',
                borderRadius: '6px',
                align: 'left',
                size: 'sm',
              },
            ],
            [
              {
                id: 'b5c',
                type: 'text',
                content:
                  '<h2 style="font-size:18px;margin:0 0 8px;">Article Title</h2><p style="margin:0 0 12px;color:#475569;">Short description of the second article goes here. Keep it punchy.</p>',
                fontSize: '15px',
                fontFamily: 'Arial, Helvetica, sans-serif',
                color: '#1f2937',
                lineHeight: '1.6',
                textAlign: 'left',
              },
              {
                id: 'b5d',
                type: 'button',
                text: 'Read more',
                url: '{{article_2_url|default:"#"}}',
                backgroundColor: '#2563eb',
                textColor: '#ffffff',
                borderRadius: '6px',
                align: 'left',
                size: 'sm',
              },
            ],
          ],
        },
        { id: 'b6', type: 'spacer', height: 16 },
        {
          id: 'b7',
          type: 'footer',
          content: '© {{current_year}} {{company|default:"Company"}}. All rights reserved.',
          showUnsubscribe: true,
          color: '#94a3b8',
          fontSize: '12px',
          textAlign: 'center',
        },
      ],
    },
  },
  {
    id: 'nl-002',
    name: 'Weekly Digest',
    category: 'newsletter',
    description: 'Minimal weekly digest — logo, curated links list, footer.',
    thumbnailUrl: null,
    schema: {
      subject: 'Your weekly digest — {{current_date}}',
      preheader: 'Top stories handpicked for you.',
      globalStyles: DEFAULT_GLOBAL_STYLES,
      blocks: [
        {
          id: 'b1',
          type: 'text',
          content: '<h1 style="font-size:24px;margin:0;">Weekly Digest</h1>',
          fontSize: '24px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#111827',
          lineHeight: '1.3',
          textAlign: 'center',
          styles: { padding: '32px 24px 8px' },
        },
        {
          id: 'b2',
          type: 'text',
          content: '<p style="color:#6b7280;margin:0;">{{current_date}}</p>',
          fontSize: '13px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#6b7280',
          lineHeight: '1.5',
          textAlign: 'center',
          styles: { padding: '0 24px 24px' },
        },
        { id: 'b3', type: 'divider', color: '#e5e7eb', thickness: 1, widthPercent: 80 },
        {
          id: 'b4',
          type: 'text',
          content:
            '<ul style="margin:0;padding:0 0 0 20px;"><li style="margin-bottom:12px;"><a href="#">Story headline one — short teaser text here</a></li><li style="margin-bottom:12px;"><a href="#">Story headline two — short teaser text here</a></li><li style="margin-bottom:12px;"><a href="#">Story headline three — short teaser text here</a></li></ul>',
          fontSize: '15px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#1f2937',
          lineHeight: '1.7',
          textAlign: 'left',
        },
        { id: 'b5', type: 'spacer', height: 24 },
        {
          id: 'b6',
          type: 'footer',
          content:
            'You are receiving this because you subscribed to {{company|default:"our"}} digest.',
          showUnsubscribe: true,
          color: '#9ca3af',
          fontSize: '12px',
          textAlign: 'center',
        },
      ],
    },
  },

  // ─────────────────────── PROMO ──────────────────────────────────────────────
  {
    id: 'promo-001',
    name: 'Flash Sale',
    category: 'promo',
    description: 'Bold hero with countdown, discount code, and CTA button.',
    thumbnailUrl: null,
    schema: {
      subject: '⚡ Flash Sale — {{discount}}% off ends tonight!',
      preheader: 'Limited time offer. Use code {{code}} at checkout.',
      globalStyles: {
        ...DEFAULT_GLOBAL_STYLES,
        backgroundColor: '#0f172a',
        contentBackgroundColor: '#1e293b',
      },
      blocks: [
        {
          id: 'b1',
          type: 'hero',
          backgroundColor: '#dc2626',
          minHeight: '220px',
          content: [
            {
              id: 'b1a',
              type: 'text',
              content: '<h1 style="color:#ffffff;font-size:40px;margin:0;">FLASH SALE</h1>',
              fontSize: '40px',
              fontFamily: 'Arial, Helvetica, sans-serif',
              color: '#ffffff',
              lineHeight: '1.1',
              textAlign: 'center',
            },
            {
              id: 'b1b',
              type: 'text',
              content:
                '<p style="color:#fef2f2;font-size:20px;margin:8px 0 0;">{{discount|default:"20"}}% OFF everything</p>',
              fontSize: '20px',
              fontFamily: 'Arial, Helvetica, sans-serif',
              color: '#fef2f2',
              lineHeight: '1.3',
              textAlign: 'center',
            },
          ],
        },
        {
          id: 'b2',
          type: 'text',
          content:
            '<p style="color:#e2e8f0;text-align:center;margin:0;">Use code at checkout:</p><p style="color:#facc15;font-size:28px;font-weight:bold;text-align:center;letter-spacing:4px;margin:8px 0;">{{code|default:"SAVE20"}}</p>',
          fontSize: '16px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#e2e8f0',
          lineHeight: '1.6',
          textAlign: 'center',
          styles: { padding: '24px', backgroundColor: '#1e293b' },
        },
        {
          id: 'b3',
          type: 'button',
          text: 'Shop Now',
          url: '{{shop_url|default:"#"}}',
          backgroundColor: '#facc15',
          textColor: '#0f172a',
          borderRadius: '8px',
          align: 'center',
          size: 'lg',
        },
        { id: 'b4', type: 'spacer', height: 16 },
        {
          id: 'b5',
          type: 'text',
          content:
            '<p style="color:#64748b;text-align:center;font-size:12px;">Offer expires at midnight. Cannot be combined with other discounts.</p>',
          fontSize: '12px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#64748b',
          lineHeight: '1.5',
          textAlign: 'center',
        },
        {
          id: 'b6',
          type: 'footer',
          content: '© {{current_year}} {{company|default:"Company"}}',
          showUnsubscribe: true,
          color: '#475569',
          fontSize: '12px',
          textAlign: 'center',
          styles: { backgroundColor: '#0f172a' },
        },
      ],
    },
  },
  {
    id: 'promo-002',
    name: 'Product Launch',
    category: 'promo',
    description: 'Clean product launch email with image, features, and CTA.',
    thumbnailUrl: null,
    schema: {
      subject: 'Introducing {{product_name}} — available now',
      preheader: 'Something new is here. Be among the first to try it.',
      globalStyles: DEFAULT_GLOBAL_STYLES,
      blocks: [
        {
          id: 'b1',
          type: 'text',
          content:
            '<h1 style="font-size:30px;margin:0;">Introducing</h1><h2 style="font-size:36px;color:#2563eb;margin:4px 0 0;">{{product_name|default:"Our New Product"}}</h2>',
          fontSize: '30px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#111827',
          lineHeight: '1.2',
          textAlign: 'center',
          styles: { padding: '40px 24px 24px' },
        },
        {
          id: 'b2',
          type: 'image',
          src: '{{product_image|default:"https://placehold.co/600x300"}}',
          alt: '{{product_name|default:"Product"}}',
          align: 'center',
        },
        {
          id: 'b3',
          type: 'text',
          content:
            '<p style="font-size:17px;color:#374151;">{{product_description|default:"Describe what makes your product special. Focus on the customer benefit, not the features."}}</p>',
          fontSize: '17px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#374151',
          lineHeight: '1.7',
          textAlign: 'left',
        },
        {
          id: 'b4',
          type: 'button',
          text: 'See it in action',
          url: '{{product_url|default:"#"}}',
          backgroundColor: '#2563eb',
          textColor: '#ffffff',
          borderRadius: '6px',
          align: 'center',
          size: 'lg',
        },
        { id: 'b5', type: 'spacer', height: 24 },
        {
          id: 'b6',
          type: 'footer',
          content: '© {{current_year}} {{company|default:"Company"}}',
          showUnsubscribe: true,
          color: '#9ca3af',
          fontSize: '12px',
          textAlign: 'center',
        },
      ],
    },
  },

  // ─────────────────────── TRANSACTIONAL ──────────────────────────────────────
  {
    id: 'tx-001',
    name: 'Order Confirmation',
    category: 'transactional',
    description: 'Clean order confirmation with order details table and tracking CTA.',
    thumbnailUrl: null,
    schema: {
      subject: 'Your order #{{order_id}} is confirmed',
      preheader: 'Thank you for your purchase! Here is your receipt.',
      globalStyles: DEFAULT_GLOBAL_STYLES,
      blocks: [
        {
          id: 'b1',
          type: 'text',
          content: '<h1 style="font-size:24px;color:#059669;margin:0;">✓ Order Confirmed</h1>',
          fontSize: '24px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#059669',
          lineHeight: '1.3',
          textAlign: 'center',
          styles: { padding: '32px 24px 8px' },
        },
        {
          id: 'b2',
          type: 'text',
          content:
            '<p>Hi {{first_name|default:"there"}},</p><p>Thank you for your order! Here is a summary:</p>',
          fontSize: '16px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#1f2937',
          lineHeight: '1.6',
          textAlign: 'left',
        },
        {
          id: 'b3',
          type: 'text',
          content:
            '<table style="width:100%;border-collapse:collapse;"><tr style="background:#f8fafc;"><td style="padding:10px;border:1px solid #e2e8f0;font-weight:600;">Order #</td><td style="padding:10px;border:1px solid #e2e8f0;">{{order_id|default:"12345"}}</td></tr><tr><td style="padding:10px;border:1px solid #e2e8f0;font-weight:600;">Total</td><td style="padding:10px;border:1px solid #e2e8f0;">{{order_total|default:"0.00"}} {{currency|default:"CZK"}}</td></tr><tr style="background:#f8fafc;"><td style="padding:10px;border:1px solid #e2e8f0;font-weight:600;">Shipping to</td><td style="padding:10px;border:1px solid #e2e8f0;">{{shipping_address|default:"Your address"}}</td></tr></table>',
          fontSize: '15px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#1f2937',
          lineHeight: '1.5',
          textAlign: 'left',
        },
        { id: 'b4', type: 'spacer', height: 16 },
        {
          id: 'b5',
          type: 'button',
          text: 'Track Your Order',
          url: '{{tracking_url|default:"#"}}',
          backgroundColor: '#2563eb',
          textColor: '#ffffff',
          borderRadius: '6px',
          align: 'center',
          size: 'md',
        },
        { id: 'b6', type: 'spacer', height: 24 },
        {
          id: 'b7',
          type: 'footer',
          content:
            '© {{current_year}} {{company|default:"Company"}} — Questions? Reply to this email.',
          showUnsubscribe: false,
          color: '#9ca3af',
          fontSize: '12px',
          textAlign: 'center',
        },
      ],
    },
  },
  {
    id: 'tx-002',
    name: 'Password Reset',
    category: 'transactional',
    description: 'Simple, focused password reset email with expiry warning.',
    thumbnailUrl: null,
    schema: {
      subject: 'Reset your {{company|default:"account"}} password',
      preheader: 'Click the button below to reset your password. Link expires in 1 hour.',
      globalStyles: DEFAULT_GLOBAL_STYLES,
      blocks: [
        {
          id: 'b1',
          type: 'text',
          content: '<h1 style="font-size:24px;margin:0;">Reset your password</h1>',
          fontSize: '24px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#111827',
          lineHeight: '1.3',
          textAlign: 'center',
          styles: { padding: '40px 24px 16px' },
        },
        {
          id: 'b2',
          type: 'text',
          content:
            '<p>Hi {{first_name|default:"there"}},</p><p>We received a request to reset the password for your account. Click the button below to choose a new password. This link is valid for <strong>1 hour</strong>.</p><p>If you did not request this, you can safely ignore this email.</p>',
          fontSize: '16px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#374151',
          lineHeight: '1.7',
          textAlign: 'left',
        },
        {
          id: 'b3',
          type: 'button',
          text: 'Reset Password',
          url: '{{reset_url|default:"#"}}',
          backgroundColor: '#dc2626',
          textColor: '#ffffff',
          borderRadius: '6px',
          align: 'center',
          size: 'md',
        },
        { id: 'b4', type: 'spacer', height: 16 },
        {
          id: 'b5',
          type: 'text',
          content:
            '<p style="font-size:13px;color:#6b7280;">Or copy this link into your browser:<br><a href="{{reset_url|default:\'#\'}}">{{reset_url|default:"https://example.com/reset"}}</a></p>',
          fontSize: '13px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#6b7280',
          lineHeight: '1.6',
          textAlign: 'center',
        },
        {
          id: 'b6',
          type: 'footer',
          content: '© {{current_year}} {{company|default:"Company"}}',
          showUnsubscribe: false,
          color: '#9ca3af',
          fontSize: '12px',
          textAlign: 'center',
        },
      ],
    },
  },

  // ─────────────────────── EVENT ───────────────────────────────────────────────
  {
    id: 'event-001',
    name: 'Webinar Invitation',
    category: 'event',
    description: 'Webinar invite with date, agenda, and registration CTA.',
    thumbnailUrl: null,
    schema: {
      subject:
        'You\'re invited: {{webinar_title|default:"Webinar"}} — {{event_date|default:"Save the date"}}',
      preheader: 'Join us for a free live webinar. Seats are limited.',
      globalStyles: DEFAULT_GLOBAL_STYLES,
      blocks: [
        {
          id: 'b1',
          type: 'hero',
          backgroundColor: '#312e81',
          minHeight: '200px',
          content: [
            {
              id: 'b1a',
              type: 'text',
              content:
                '<p style="color:#a5b4fc;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin:0;">Free Webinar</p>',
              fontSize: '13px',
              fontFamily: 'Arial, Helvetica, sans-serif',
              color: '#a5b4fc',
              lineHeight: '1.3',
              textAlign: 'center',
            },
            {
              id: 'b1b',
              type: 'text',
              content:
                '<h1 style="color:#ffffff;font-size:26px;margin:8px 0;">{{webinar_title|default:"Join Our Webinar"}}</h1>',
              fontSize: '26px',
              fontFamily: 'Arial, Helvetica, sans-serif',
              color: '#ffffff',
              lineHeight: '1.2',
              textAlign: 'center',
            },
            {
              id: 'b1c',
              type: 'text',
              content:
                '<p style="color:#c7d2fe;margin:8px 0 0;">📅 {{event_date|default:"Date TBC"}} &nbsp;|&nbsp; 🕐 {{event_time|default:"Time TBC"}}</p>',
              fontSize: '15px',
              fontFamily: 'Arial, Helvetica, sans-serif',
              color: '#c7d2fe',
              lineHeight: '1.4',
              textAlign: 'center',
            },
          ],
        },
        {
          id: 'b2',
          type: 'text',
          content:
            '<p>Hi {{first_name|default:"there"}},</p><p>We would love to have you join us for a free live session where we will cover:</p><ul><li>Topic one</li><li>Topic two</li><li>Topic three</li></ul>',
          fontSize: '16px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#1f2937',
          lineHeight: '1.7',
          textAlign: 'left',
        },
        {
          id: 'b3',
          type: 'button',
          text: 'Reserve My Spot',
          url: '{{registration_url|default:"#"}}',
          backgroundColor: '#4f46e5',
          textColor: '#ffffff',
          borderRadius: '6px',
          align: 'center',
          size: 'lg',
        },
        { id: 'b4', type: 'spacer', height: 16 },
        {
          id: 'b5',
          type: 'text',
          content:
            '<p style="font-size:13px;color:#6b7280;text-align:center;">Seats are limited. A recording will be shared with registered attendees only.</p>',
          fontSize: '13px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#6b7280',
          lineHeight: '1.5',
          textAlign: 'center',
        },
        {
          id: 'b6',
          type: 'footer',
          content: '© {{current_year}} {{company|default:"Company"}}',
          showUnsubscribe: true,
          color: '#9ca3af',
          fontSize: '12px',
          textAlign: 'center',
        },
      ],
    },
  },

  // ─────────────────────── ONBOARDING ─────────────────────────────────────────
  {
    id: 'onboarding-001',
    name: 'Welcome Email',
    category: 'onboarding',
    description: 'Warm welcome email for new users with next-step CTAs.',
    thumbnailUrl: null,
    schema: {
      subject: 'Welcome to {{company|default:"the platform"}}, {{first_name|default:"there"}}! 🎉',
      preheader: 'Your account is ready. Here is how to get started.',
      globalStyles: DEFAULT_GLOBAL_STYLES,
      blocks: [
        {
          id: 'b1',
          type: 'hero',
          backgroundColor: '#2563eb',
          minHeight: '160px',
          content: [
            {
              id: 'b1a',
              type: 'text',
              content: '<h1 style="color:#ffffff;font-size:28px;margin:0;">Welcome aboard! 🎉</h1>',
              fontSize: '28px',
              fontFamily: 'Arial, Helvetica, sans-serif',
              color: '#ffffff',
              lineHeight: '1.2',
              textAlign: 'center',
            },
          ],
        },
        {
          id: 'b2',
          type: 'text',
          content:
            '<p>Hi {{first_name|default:"there"}},</p><p>Thanks for joining {{company|default:"us"}}! Your account is all set. Here are three things to get you started:</p>',
          fontSize: '16px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#1f2937',
          lineHeight: '1.7',
          textAlign: 'left',
        },
        {
          id: 'b3',
          type: 'columns',
          columnRatios: [1, 2],
          gap: '16px',
          columns: [
            [
              {
                id: 'b3a',
                type: 'text',
                content:
                  '<div style="background:#dbeafe;border-radius:50%;width:48px;height:48px;line-height:48px;text-align:center;font-size:24px;">1️⃣</div>',
                fontSize: '24px',
                fontFamily: 'Arial, Helvetica, sans-serif',
                color: '#1f2937',
                lineHeight: '1',
                textAlign: 'center',
              },
            ],
            [
              {
                id: 'b3b',
                type: 'text',
                content:
                  '<h3 style="margin:0 0 4px;">Complete your profile</h3><p style="margin:0;color:#4b5563;font-size:14px;">Add your details so we can personalise your experience.</p>',
                fontSize: '14px',
                fontFamily: 'Arial, Helvetica, sans-serif',
                color: '#4b5563',
                lineHeight: '1.5',
                textAlign: 'left',
              },
            ],
          ],
        },
        { id: 'b4', type: 'spacer', height: 8 },
        {
          id: 'b5',
          type: 'columns',
          columnRatios: [1, 2],
          gap: '16px',
          columns: [
            [
              {
                id: 'b5a',
                type: 'text',
                content:
                  '<div style="background:#d1fae5;border-radius:50%;width:48px;height:48px;line-height:48px;text-align:center;font-size:24px;">2️⃣</div>',
                fontSize: '24px',
                fontFamily: 'Arial, Helvetica, sans-serif',
                color: '#1f2937',
                lineHeight: '1',
                textAlign: 'center',
              },
            ],
            [
              {
                id: 'b5b',
                type: 'text',
                content:
                  '<h3 style="margin:0 0 4px;">Explore the dashboard</h3><p style="margin:0;color:#4b5563;font-size:14px;">Discover all the features available to you.</p>',
                fontSize: '14px',
                fontFamily: 'Arial, Helvetica, sans-serif',
                color: '#4b5563',
                lineHeight: '1.5',
                textAlign: 'left',
              },
            ],
          ],
        },
        { id: 'b6', type: 'spacer', height: 8 },
        {
          id: 'b7',
          type: 'columns',
          columnRatios: [1, 2],
          gap: '16px',
          columns: [
            [
              {
                id: 'b7a',
                type: 'text',
                content:
                  '<div style="background:#fef3c7;border-radius:50%;width:48px;height:48px;line-height:48px;text-align:center;font-size:24px;">3️⃣</div>',
                fontSize: '24px',
                fontFamily: 'Arial, Helvetica, sans-serif',
                color: '#1f2937',
                lineHeight: '1',
                textAlign: 'center',
              },
            ],
            [
              {
                id: 'b7b',
                type: 'text',
                content:
                  '<h3 style="margin:0 0 4px;">Invite your team</h3><p style="margin:0;color:#4b5563;font-size:14px;">Great things happen when you collaborate.</p>',
                fontSize: '14px',
                fontFamily: 'Arial, Helvetica, sans-serif',
                color: '#4b5563',
                lineHeight: '1.5',
                textAlign: 'left',
              },
            ],
          ],
        },
        { id: 'b8', type: 'spacer', height: 16 },
        {
          id: 'b9',
          type: 'button',
          text: 'Get Started',
          url: '{{dashboard_url|default:"#"}}',
          backgroundColor: '#2563eb',
          textColor: '#ffffff',
          borderRadius: '6px',
          align: 'center',
          size: 'lg',
        },
        { id: 'b10', type: 'spacer', height: 24 },
        {
          id: 'b11',
          type: 'footer',
          content: '© {{current_year}} {{company|default:"Company"}}',
          showUnsubscribe: true,
          color: '#9ca3af',
          fontSize: '12px',
          textAlign: 'center',
        },
      ],
    },
  },

  // ─────────────────────── SEASONAL ────────────────────────────────────────────
  {
    id: 'seasonal-001',
    name: 'Holiday Greeting',
    category: 'seasonal',
    description: 'Warm seasonal greeting card with personalised message.',
    thumbnailUrl: null,
    schema: {
      subject: '🎄 Happy Holidays from {{company|default:"us"}}!',
      preheader: 'Wishing you a wonderful season. A personal note from our team.',
      globalStyles: {
        ...DEFAULT_GLOBAL_STYLES,
        backgroundColor: '#0f172a',
        contentBackgroundColor: '#1e293b',
      },
      blocks: [
        {
          id: 'b1',
          type: 'hero',
          backgroundColor: '#991b1b',
          minHeight: '200px',
          content: [
            {
              id: 'b1a',
              type: 'text',
              content: '<h1 style="color:#fef2f2;font-size:32px;margin:0;">🎄 Happy Holidays!</h1>',
              fontSize: '32px',
              fontFamily: 'Arial, Helvetica, sans-serif',
              color: '#fef2f2',
              lineHeight: '1.2',
              textAlign: 'center',
            },
            {
              id: 'b1b',
              type: 'text',
              content:
                '<p style="color:#fca5a5;margin:8px 0 0;">From all of us at {{company|default:"our team"}}</p>',
              fontSize: '15px',
              fontFamily: 'Arial, Helvetica, sans-serif',
              color: '#fca5a5',
              lineHeight: '1.4',
              textAlign: 'center',
            },
          ],
        },
        {
          id: 'b2',
          type: 'text',
          content:
            '<p style="color:#e2e8f0;">Dear {{first_name|default:"friend"}},</p><p style="color:#e2e8f0;">As the year draws to a close, we want to take a moment to thank you for your support. It has been an incredible year and none of it would be possible without you.</p><p style="color:#e2e8f0;">Wishing you and yours a joyful holiday season and a prosperous new year!</p>',
          fontSize: '16px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#e2e8f0',
          lineHeight: '1.7',
          textAlign: 'left',
          styles: { backgroundColor: '#1e293b' },
        },
        { id: 'b3', type: 'spacer', height: 16 },
        {
          id: 'b4',
          type: 'footer',
          content: '© {{current_year}} {{company|default:"Company"}}',
          showUnsubscribe: true,
          color: '#475569',
          fontSize: '12px',
          textAlign: 'center',
          styles: { backgroundColor: '#0f172a' },
        },
      ],
    },
  },

  // ─────────────────────── E-COMMERCE ──────────────────────────────────────────
  {
    id: 'ecom-001',
    name: 'Abandoned Cart',
    category: 'ecommerce',
    description: 'Recover abandoned carts with product recap, urgency, and discount.',
    thumbnailUrl: null,
    schema: {
      subject: '{{first_name|default:"Hey"}}, you left something behind 🛒',
      preheader: 'Your cart is waiting. Complete your order before it sells out.',
      globalStyles: DEFAULT_GLOBAL_STYLES,
      blocks: [
        {
          id: 'b1',
          type: 'text',
          content: '<h1 style="font-size:26px;margin:0;">Your cart is waiting 🛒</h1>',
          fontSize: '26px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#111827',
          lineHeight: '1.3',
          textAlign: 'center',
          styles: { padding: '32px 24px 8px' },
        },
        {
          id: 'b2',
          type: 'text',
          content:
            '<p>Hi {{first_name|default:"there"}},</p><p>You left some great items in your cart. They are still available, but we cannot guarantee for how long!</p>',
          fontSize: '16px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#374151',
          lineHeight: '1.7',
          textAlign: 'left',
        },
        {
          id: 'b3',
          type: 'columns',
          columnRatios: [1, 2],
          gap: '16px',
          columns: [
            [
              {
                id: 'b3a',
                type: 'image',
                src: '{{product_image|default:"https://placehold.co/140x140"}}',
                alt: '{{product_name|default:"Product"}}',
                align: 'center',
              },
            ],
            [
              {
                id: 'b3b',
                type: 'text',
                content:
                  '<h3 style="margin:0 0 4px;">{{product_name|default:"Your Item"}}</h3><p style="margin:0 0 8px;color:#6b7280;font-size:14px;">{{product_variant|default:""}}</p><p style="margin:0;font-size:20px;font-weight:700;color:#111827;">{{product_price|default:"0.00"}} {{currency|default:"CZK"}}</p>',
                fontSize: '15px',
                fontFamily: 'Arial, Helvetica, sans-serif',
                color: '#111827',
                lineHeight: '1.5',
                textAlign: 'left',
              },
              {
                id: 'b3c',
                type: 'button',
                text: 'Complete Purchase',
                url: '{{cart_url|default:"#"}}',
                backgroundColor: '#16a34a',
                textColor: '#ffffff',
                borderRadius: '6px',
                align: 'left',
                size: 'md',
              },
            ],
          ],
        },
        { id: 'b4', type: 'divider', color: '#e5e7eb', thickness: 1, widthPercent: 100 },
        {
          id: 'b5',
          type: 'text',
          content:
            '<p style="text-align:center;color:#374151;">Still deciding? Use code <strong>COMEBACK10</strong> for 10% off your order.</p>',
          fontSize: '15px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#374151',
          lineHeight: '1.6',
          textAlign: 'center',
        },
        { id: 'b6', type: 'spacer', height: 16 },
        {
          id: 'b7',
          type: 'footer',
          content: '© {{current_year}} {{company|default:"Company"}}',
          showUnsubscribe: true,
          color: '#9ca3af',
          fontSize: '12px',
          textAlign: 'center',
        },
      ],
    },
  },
];

// Merge core + extended batches
TEMPLATES.push(...EXTENDED_TEMPLATES);
TEMPLATES.push(...EXTENDED_TEMPLATES_2);
TEMPLATES.push(...CZECH_TEMPLATES);

// ─── Thumbnails ─────────────────────────────────────────────────────────────────

/** Category → accent colour for generated placeholder thumbnails. */
const CATEGORY_COLOR: Record<TemplateCategory, string> = {
  newsletter: '#1e293b',
  promo: '#dc2626',
  transactional: '#059669',
  event: '#4f46e5',
  onboarding: '#2563eb',
  seasonal: '#b45309',
  ecommerce: '#0369a1',
  b2b: '#0f172a',
  saas: '#4338ca',
};

/**
 * Draw a thumbnail from the template's actual blocks.
 *
 * The previous version took `(name, category)` and drew the same card every
 * time: a coloured bar, the first letter of the name, three grey placeholder
 * rectangles. Seventy-one templates, seventy-one identical tiles differing only
 * in hue — a gallery nobody can browse, and a test ("gives every template a
 * thumbnail") that passed because this function always returns a string.
 *
 * A real render is out of reach without a headless browser, which is not worth
 * a template gallery. But the schema already says what the email looks like:
 * the order of the blocks, which of them is a hero, what colour that hero is,
 * where the buttons are, whether there are product cards or a coupon. Walking
 * it produces a wireframe that differs per template and is derived from the
 * thing it depicts — which is what a thumbnail is for.
 */
interface ThumbBlock {
  type?: string;
  backgroundColor?: string;
  height?: number;
  columns?: unknown[];
}

function svgThumbnail(schema: unknown, category: TemplateCategory): string {
  const accent = CATEGORY_COLOR[category] ?? '#334155';
  const blocks = ((schema as { blocks?: ThumbBlock[] })?.blocks ?? []).slice(0, 12);

  const W = 240;
  const H = 180;
  const PAD = 16;
  const inner = W - PAD * 2;

  /** Vertical weight of each block type, so the wireframe keeps its proportions. */
  const weight = (b: ThumbBlock): number => {
    switch (b.type) {
      case 'hero':
        return 3.2;
      case 'product':
        return 2.6;
      case 'coupon':
        return 2.2;
      case 'columns':
        return 2;
      case 'image':
      case 'video':
        return 2.4;
      case 'button':
        return 1.1;
      case 'footer':
        return 1.4;
      case 'divider':
        return 0.35;
      case 'spacer':
        return 0.5;
      default:
        return 1.3; // text
    }
  };

  const total = blocks.reduce((a, b) => a + weight(b), 0) || 1;
  const avail = H - PAD * 2;
  const parts: string[] = [
    `<rect width="${W}" height="${H}" fill="#f1f5f9"/>`,
    `<rect x="${PAD - 6}" y="${PAD - 6}" width="${inner + 12}" height="${avail + 12}" rx="4" fill="#ffffff"/>`,
  ];

  let y = PAD;
  for (const b of blocks) {
    const h = Math.max(2, (weight(b) / total) * avail);
    const fill = typeof b.backgroundColor === 'string' ? b.backgroundColor : accent;
    switch (b.type) {
      case 'hero':
        parts.push(
          `<rect x="${PAD}" y="${y}" width="${inner}" height="${h}" rx="2" fill="${fill}"/>`,
        );
        parts.push(
          `<rect x="${PAD + 24}" y="${y + h / 2 - 4}" width="${inner - 48}" height="6" rx="2" fill="#ffffff" opacity="0.85"/>`,
        );
        break;
      case 'button':
        parts.push(
          `<rect x="${PAD + inner / 2 - 32}" y="${y}" width="64" height="${h}" rx="3" fill="${accent}"/>`,
        );
        break;
      case 'divider':
        parts.push(
          `<rect x="${PAD}" y="${y + h / 2}" width="${inner}" height="1" fill="#cbd5e1"/>`,
        );
        break;
      case 'spacer':
        break;
      case 'product':
        parts.push(`<rect x="${PAD}" y="${y}" width="${h}" height="${h}" rx="2" fill="#cbd5e1"/>`);
        parts.push(
          `<rect x="${PAD + h + 6}" y="${y + 3}" width="${inner - h - 40}" height="5" rx="2" fill="#94a3b8"/>`,
        );
        parts.push(
          `<rect x="${PAD + h + 6}" y="${y + 14}" width="40" height="5" rx="2" fill="${accent}"/>`,
        );
        break;
      case 'coupon':
        parts.push(
          `<rect x="${PAD + 20}" y="${y}" width="${inner - 40}" height="${h}" rx="3" fill="#ffffff" stroke="${accent}" stroke-dasharray="4 3"/>`,
        );
        parts.push(
          `<rect x="${PAD + inner / 2 - 26}" y="${y + h / 2 - 3}" width="52" height="6" rx="2" fill="${accent}"/>`,
        );
        break;
      case 'columns': {
        const n = Math.max(1, (b.columns ?? []).length);
        const cw = (inner - (n - 1) * 6) / n;
        for (let i = 0; i < n; i++) {
          parts.push(
            `<rect x="${PAD + i * (cw + 6)}" y="${y}" width="${cw}" height="${h}" rx="2" fill="#e2e8f0"/>`,
          );
        }
        break;
      }
      case 'footer':
        parts.push(
          `<rect x="${PAD}" y="${y}" width="${inner}" height="${h}" rx="2" fill="#e2e8f0"/>`,
        );
        parts.push(
          `<rect x="${PAD + inner / 2 - 30}" y="${y + h / 2 - 2}" width="60" height="4" rx="2" fill="#94a3b8"/>`,
        );
        break;
      case 'image':
      case 'video':
        parts.push(
          `<rect x="${PAD}" y="${y}" width="${inner}" height="${h}" rx="2" fill="#cbd5e1"/>`,
        );
        break;
      default: {
        // Text: two ragged lines, so a block of copy reads as copy.
        const lines = h > 12 ? 2 : 1;
        for (let i = 0; i < lines; i++) {
          const w = inner - (i === lines - 1 ? 40 : 0);
          parts.push(
            `<rect x="${PAD}" y="${y + i * 8}" width="${w}" height="5" rx="2" fill="#cbd5e1"/>`,
          );
        }
      }
    }
    y += h;
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    parts.join('') +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Draw a wireframe for any template that has no thumbnail of its own.
for (const tpl of TEMPLATES) {
  if (!tpl.thumbnailUrl) tpl.thumbnailUrl = svgThumbnail(tpl.schema, tpl.category);
}

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export function getTemplateById(id: string): TemplateMeta | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function getTemplatesByCategory(category: TemplateCategory): TemplateMeta[] {
  return TEMPLATES.filter((t) => t.category === category);
}

export function getAllCategories(): TemplateCategory[] {
  return [...new Set(TEMPLATES.map((t) => t.category))];
}

export function getTemplatesByLocale(locale: TemplateLocale): TemplateMeta[] {
  return TEMPLATES.filter((t) => localeOf(t) === locale);
}

/** Languages actually present in the library — what the gallery can offer as a filter. */
export function getAllLocales(): TemplateLocale[] {
  return [...new Set(TEMPLATES.map(localeOf))];
}

/**
 * Variants of one email across languages, keyed by locale.
 * Empty for a template with no `family`, which is most of them.
 */
export function getFamily(family: string): TemplateMeta[] {
  return TEMPLATES.filter((t) => t.family === family);
}
