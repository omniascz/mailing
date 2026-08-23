/**
 * Extended email template library — 40 additional templates.
 * Merged into TEMPLATES in index.ts.
 */
import type { TemplateMeta, TemplateCategory } from './index.js';

const GS = {
  backgroundColor: '#f1f5f9',
  contentBackgroundColor: '#ffffff',
  fontFamily: 'Arial, Helvetica, sans-serif',
  linkColor: '#2563eb',
  textColor: '#1f2937',
  contentWidth: 600,
};

function t(
  id: string,
  name: string,
  category: TemplateCategory,
  description: string,
  subject: string,
  preheader: string,
  blocks: object[],
): TemplateMeta {
  return {
    id,
    name,
    category,
    description,
    thumbnailUrl: null,
    schema: { subject, preheader, globalStyles: GS, blocks },
  };
}

const sp = (h = 20) => ({
  id: `sp${Math.random().toString(36).slice(2, 7)}`,
  type: 'spacer',
  height: h,
});
const div = () => ({
  id: `dv${Math.random().toString(36).slice(2, 7)}`,
  type: 'divider',
  color: '#e2e8f0',
  thickness: 1,
  widthPercent: 100,
});
const txt = (content: string, size = '15px', color = '#374151', align = 'left') => ({
  id: `tx${Math.random().toString(36).slice(2, 7)}`,
  type: 'text',
  content,
  fontSize: size,
  fontFamily: 'Arial, Helvetica, sans-serif',
  color,
  lineHeight: '1.6',
  textAlign: align,
});
const btn = (text: string, url = '{{cta_url|default:"#"}}', bg = '#2563eb') => ({
  id: `bt${Math.random().toString(36).slice(2, 7)}`,
  type: 'button',
  text,
  url,
  backgroundColor: bg,
  textColor: '#ffffff',
  borderRadius: '6px',
  fontSize: '15px',
  textAlign: 'center',
});
const hero = (title: string, sub: string, bg = '#1e293b') => ({
  id: `hr${Math.random().toString(36).slice(2, 7)}`,
  type: 'hero',
  backgroundColor: bg,
  minHeight: '180px',
  content: [
    {
      id: `ha${Math.random().toString(36).slice(2, 7)}`,
      type: 'text',
      content: `<h1 style="color:#f8fafc;margin:0;font-size:26px;font-weight:700;">${title}</h1>`,
      fontSize: '26px',
      fontFamily: 'Arial, Helvetica, sans-serif',
      color: '#f8fafc',
      lineHeight: '1.3',
      textAlign: 'center',
    },
    {
      id: `hb${Math.random().toString(36).slice(2, 7)}`,
      type: 'text',
      content: `<p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">${sub}</p>`,
      fontSize: '14px',
      fontFamily: 'Arial, Helvetica, sans-serif',
      color: '#94a3b8',
      lineHeight: '1.5',
      textAlign: 'center',
    },
  ],
});
const footer = () =>
  txt(
    '<p style="font-size:12px;color:#9ca3af;text-align:center;">© {{current_year}} {{company|default:"Company"}} · <a href="{{unsubscribe_url}}">Unsubscribe</a> · <a href="{{preference_center_url}}">Preferences</a></p>',
    '12px',
    '#9ca3af',
    'center',
  );

export const EXTENDED_TEMPLATES: TemplateMeta[] = [
  // ── NEWSLETTER ──────────────────────────────────────────────────────────────
  t(
    'nl-003',
    'Weekly Digest',
    'newsletter',
    'Link-heavy digest format for curated content.',
    'Your weekly digest — {{current_date}}',
    "This week's top picks, just for you.",
    [
      hero('Your Weekly Digest', '{{current_date}}'),
      sp(),
      txt(
        '<p>Hi {{first_name|default:"there"}}, here are the top links and stories we curated this week.</p>',
      ),
      div(),
      txt(
        '<p><strong>1. {{article_title_1|default:"Top Story This Week"}}</strong><br>{{article_summary_1|default:"A brief summary of the first article goes here."}} <a href="{{article_url_1|default:#}}">Read more →</a></p>',
      ),
      txt(
        '<p><strong>2. {{article_title_2|default:"Second Story"}}</strong><br>{{article_summary_2|default:"A brief summary of the second article goes here."}} <a href="{{article_url_2|default:#}}">Read more →</a></p>',
      ),
      txt(
        '<p><strong>3. {{article_title_3|default:"Third Story"}}</strong><br>{{article_summary_3|default:"Summary of the third article."}} <a href="{{article_url_3|default:#}}">Read more →</a></p>',
      ),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'nl-004',
    'Product Update',
    'newsletter',
    "What's new in your product — changelog-style.",
    "What's new in {{company}} — {{current_date}}",
    'See the latest features and improvements.',
    [
      hero("What's New", 'Product update · {{current_date}}', '#0f172a'),
      sp(),
      txt('<p>Hi {{first_name|default:"there"}}, here is what we shipped this month.</p>'),
      div(),
      txt(
        '<h3 style="margin:0 0 6px;color:#1f2937;">🚀 New Feature: {{feature_name|default:"Feature Name"}}</h3><p>{{feature_description|default:"Describe the new feature and how it helps users accomplish their goals faster."}}</p>',
      ),
      btn('Try It Now'),
      div(),
      txt(
        '<h3 style="margin:0 0 6px;color:#1f2937;">🔧 Improvement: {{improvement_name|default:"Improvement Name"}}</h3><p>{{improvement_description|default:"Briefly describe what was improved and why it matters."}}</p>',
      ),
      div(),
      txt(
        '<h3 style="margin:0 0 6px;color:#1f2937;">🐛 Bug Fixes</h3><p>{{bug_fix_list|default:"• Fixed an issue where X would happen under Y conditions."}}</p>',
      ),
      sp(8),
      footer(),
    ],
  ),

  t(
    'nl-005',
    'Announcement',
    'newsletter',
    'Single big announcement with prominent CTA.',
    '{{announcement_headline|default:"Big news from us"}}',
    "You won't want to miss this.",
    [
      hero(
        '{{announcement_headline|default:"Big News"}}',
        '{{announcement_subtitle|default:"We have something exciting to share."}}',
        '#7c3aed',
      ),
      sp(24),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>{{announcement_body|default:"We are thrilled to announce something that will change the way you work. This is the moment we have been building toward, and we could not be more excited to share it with you."}}</p>',
        '16px',
      ),
      sp(8),
      btn('Learn More', '{{announcement_url|default:#}}', '#7c3aed'),
      sp(24),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'nl-006',
    'Founder Letter',
    'newsletter',
    'Personal letter-style newsletter from the CEO/founder.',
    'A note from {{sender_name|default:"our founder"}}',
    'A personal message we wanted to share.',
    [
      sp(8),
      txt(
        '<p style="font-size:22px;font-weight:700;color:#1f2937;">A note from {{sender_name|default:"our founder"}}</p>',
        '22px',
        '#1f2937',
      ),
      div(),
      sp(8),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>{{letter_paragraph_1|default:"I wanted to take a moment to write to you personally. Building this company has been one of the most rewarding experiences of my life, and it would not be possible without you."}}</p><p>{{letter_paragraph_2|default:"This month I want to share what we have learned, where we are going, and why I am more excited than ever about the future."}}</p><p>{{letter_paragraph_3|default:"Thank you for being part of this journey. I read every reply to these emails."}}</p><p style="margin-top:24px;">Warmly,<br><strong>{{sender_name|default:"Your Name"}}</strong></p>',
        '16px',
      ),
      div(),
      sp(8),
      footer(),
    ],
  ),

  // ── PROMO ───────────────────────────────────────────────────────────────────
  t(
    'promo-003',
    'Flash Sale',
    'promo',
    'Urgency-driven flash sale with countdown and bold CTA.',
    '⚡ Flash Sale — {{discount_pct|default:"30"}}% off ends tonight',
    'Hurry — only a few hours left.',
    [
      hero('⚡ Flash Sale', '{{discount_pct|default:"30"}}% OFF — Today Only', '#dc2626'),
      sp(16),
      // Was a 'countdown' block. The renderer has no branch for that type, so
      // it emitted nothing at all — the urgency this template is built around
      // was invisible in every inbox. Replaced with a deadline the renderer can
      // actually draw rather than adding a block type, which would be a new
      // feature rather than making the existing ones agree.
      txt(
        '<p style="background:#fef2f2;color:#dc2626;font-weight:700;text-align:center;padding:14px;border-radius:8px;margin:0;">Ends {{sale_end_time|default:"tonight at 23:59"}}</p>',
      ),
      sp(16),
      txt(
        '<p style="text-align:center;font-size:16px;">Use code <strong style="font-size:20px;color:#dc2626;letter-spacing:2px;">{{promo_code|default:"FLASH30"}}</strong> at checkout.</p>',
        '16px',
        '#374151',
        'center',
      ),
      sp(8),
      btn('Shop Now', '{{shop_url|default:#}}', '#dc2626'),
      sp(24),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'promo-004',
    'Product Launch',
    'promo',
    'Launching a new product with image and buy CTA.',
    'Introducing {{product_name|default:"our new product"}} 🎉',
    "It's finally here.",
    [
      hero(
        'Introducing {{product_name|default:"New Product"}}',
        '{{product_tagline|default:"The product you have been waiting for."}}',
        '#0369a1',
      ),
      sp(16),
      {
        id: 'img1',
        type: 'image',
        src: '{{product_image_url|default:""}}',
        alt: '{{product_name|default:"Product"}}',
        width: '100%',
        link: '{{product_url|default:#}}',
      },
      sp(16),
      txt(
        '<p>{{product_description|default:"We built this because we wanted something better. After months of work, it is finally ready. Here is what makes it special."}}</p>',
      ),
      txt(
        '<ul><li>{{feature_1|default:"Saves you hours every week"}}</li><li>{{feature_2|default:"Works with your existing tools"}}</li><li>{{feature_3|default:"Backed by a 30-day guarantee"}}</li></ul>',
      ),
      sp(8),
      btn('Get Yours Now', '{{product_url|default:#}}', '#0369a1'),
      sp(24),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'promo-005',
    'VIP Early Access',
    'promo',
    'Exclusive early access offer for loyal subscribers.',
    'You\'re invited — exclusive early access for {{first_name|default:"you"}}',
    "Because you're one of our best customers.",
    [
      hero("You're Invited 🌟", 'Exclusive Early Access — VIPs Only', '#92400e'),
      sp(16),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>As one of our most valued customers, you get first access to {{new_thing|default:"something we are very proud of"}} — 48 hours before everyone else.</p><p>This offer expires on <strong>{{offer_expiry|default:"tomorrow at midnight"}}</strong> and is available only to a select group.</p>',
        '16px',
      ),
      sp(8),
      btn('Claim Early Access', '{{access_url|default:#}}', '#b45309'),
      sp(16),
      txt(
        '<p style="font-size:13px;color:#9ca3af;text-align:center;">This offer is exclusive to you. Please do not forward this email.</p>',
        '13px',
        '#9ca3af',
        'center',
      ),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'promo-006',
    'Referral Reward',
    'promo',
    'Notify a subscriber they earned a referral reward.',
    'You earned a reward 🎁 — {{reward_value|default:"$20 credit"}}',
    'Your referral paid off.',
    [
      hero(
        'You Earned a Reward 🎁',
        '{{reward_value|default:"$20 credit"}} added to your account',
        '#059669',
      ),
      sp(16),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>Great news — <strong>{{referred_name|default:"someone you referred"}}</strong> just signed up. As promised, we have added <strong>{{reward_value|default:"$20"}}</strong> to your account.</p><p>Keep sharing and keep earning.</p>',
        '16px',
      ),
      btn('See Your Balance', '{{account_url|default:#}}', '#059669'),
      sp(24),
      div(),
      sp(8),
      footer(),
    ],
  ),

  // ── TRANSACTIONAL ───────────────────────────────────────────────────────────
  t(
    'trans-003',
    'Welcome (Simple)',
    'transactional',
    'Clean, minimal welcome email after sign-up.',
    'Welcome to {{company|default:"our product"}}, {{first_name|default:"there"}}!',
    "You're in. Here's how to get started.",
    [
      sp(16),
      txt(
        '<p style="font-size:28px;font-weight:700;color:#1f2937;text-align:center;">Welcome aboard 👋</p>',
        '28px',
        '#1f2937',
        'center',
      ),
      sp(8),
      txt(
        '<p style="text-align:center;">Hi {{first_name|default:"there"}}, we are thrilled to have you.</p>',
        '16px',
        '#374151',
        'center',
      ),
      div(),
      sp(16),
      txt(
        '<p><strong>Step 1:</strong> {{step_1|default:"Complete your profile so we can personalise your experience."}}</p><p><strong>Step 2:</strong> {{step_2|default:"Explore the main dashboard and try the core feature."}}</p><p><strong>Step 3:</strong> {{step_3|default:"Invite a team member to collaborate."}}</p>',
      ),
      sp(8),
      btn('Get Started', '{{onboarding_url|default:#}}'),
      sp(24),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'trans-004',
    'Password Reset',
    'transactional',
    'Secure password reset email with expiry notice.',
    'Reset your {{company|default:"account"}} password',
    'You requested a password reset.',
    [
      sp(16),
      txt(
        '<p style="font-size:22px;font-weight:700;color:#1f2937;text-align:center;">Reset Your Password</p>',
        '22px',
        '#1f2937',
        'center',
      ),
      sp(8),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>We received a request to reset the password for your account. Click the button below to choose a new one. This link expires in <strong>30 minutes</strong>.</p>',
      ),
      sp(8),
      btn('Reset Password', '{{reset_url}}', '#dc2626'),
      sp(16),
      txt(
        '<p style="font-size:13px;color:#9ca3af;">If you did not request this, you can safely ignore this email. Your password will not be changed.</p>',
        '13px',
        '#9ca3af',
      ),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'trans-005',
    'Invoice',
    'transactional',
    'Invoice notification with amount due and payment link.',
    'Invoice #{{invoice_number|default:"INV-001"}} — {{amount_due|default:"$99.00"}} due',
    'Your invoice is ready.',
    [
      sp(16),
      txt(
        '<p style="font-size:22px;font-weight:700;color:#1f2937;">Invoice #{{invoice_number|default:"INV-001"}}</p>',
        '22px',
        '#1f2937',
      ),
      div(),
      txt(
        '<p><strong>Bill to:</strong> {{billing_name|default:"Customer Name"}}<br>{{billing_email|default:"customer@example.com"}}</p>',
      ),
      txt(
        '<p><strong>Due date:</strong> {{due_date|default:"30 days from issue"}}<br><strong>Amount due:</strong> <span style="font-size:20px;font-weight:700;color:#059669;">{{amount_due|default:"$99.00"}}</span></p>',
      ),
      div(),
      txt('<p>{{invoice_line_items|default:"1× Professional Plan — $99.00"}}</p>'),
      div(),
      sp(8),
      btn('Pay Now', '{{payment_url|default:#}}', '#059669'),
      sp(16),
      txt(
        '<p style="font-size:13px;color:#9ca3af;">Questions? Reply to this email or contact {{support_email|default:"support@company.com"}}.</p>',
        '13px',
        '#9ca3af',
      ),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'trans-006',
    'Order Shipped',
    'transactional',
    'Order shipment notification with tracking link.',
    'Your order is on the way 📦 — #{{order_number|default:"ORD-001"}}',
    'Your order has shipped!',
    [
      hero(
        'Your Order Is On The Way 📦',
        'Estimated delivery: {{estimated_delivery|default:"3–5 business days"}}',
        '#0891b2',
      ),
      sp(),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>Good news — order <strong>#{{order_number|default:"ORD-001"}}</strong> has been shipped. Here are the details:</p>',
      ),
      txt(
        '<p><strong>Carrier:</strong> {{carrier|default:"DHL"}}<br><strong>Tracking number:</strong> {{tracking_number|default:"1Z999AA10123456784"}}<br><strong>Estimated delivery:</strong> {{estimated_delivery|default:"3–5 business days"}}</p>',
      ),
      btn('Track Your Package', '{{tracking_url|default:#}}', '#0891b2'),
      sp(16),
      txt(
        '<p style="font-size:13px;color:#9ca3af;">If you have questions about your order, contact {{support_email|default:"support@company.com"}}.</p>',
        '13px',
        '#9ca3af',
      ),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'trans-007',
    'Account Alert',
    'transactional',
    'Security or account change notification.',
    'Account alert: {{alert_type|default:"new login detected"}}',
    'Action may be required.',
    [
      sp(16),
      txt(
        '<p style="font-size:22px;font-weight:700;color:#dc2626;text-align:center;">⚠️ Account Alert</p>',
        '22px',
        '#dc2626',
        'center',
      ),
      div(),
      sp(8),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>We noticed <strong>{{alert_description|default:"a new login to your account from an unrecognised device"}}</strong>.</p><p><strong>Time:</strong> {{alert_time|default:"just now"}}<br><strong>Location:</strong> {{alert_location|default:"Unknown"}}<br><strong>Device:</strong> {{alert_device|default:"Unknown browser"}}</p><p>If this was you, no action is needed. If not, secure your account immediately.</p>',
      ),
      btn('Secure My Account', '{{security_url|default:#}}', '#dc2626'),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'trans-008',
    'Subscription Renewal',
    'transactional',
    'Reminder that subscription is about to auto-renew.',
    'Your subscription renews on {{renewal_date|default:"next month"}}',
    'Just a heads-up about your upcoming renewal.',
    [
      sp(16),
      txt(
        '<p style="font-size:22px;font-weight:700;color:#1f2937;">Upcoming Renewal</p>',
        '22px',
        '#1f2937',
      ),
      div(),
      sp(8),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>Your <strong>{{plan_name|default:"Professional"}} plan</strong> renews on <strong>{{renewal_date|default:"30 days from today"}}</strong> for <strong>{{renewal_amount|default:"$99.00"}}</strong>. No action is needed if you would like to continue.</p>',
      ),
      txt(
        '<p>If you need to update your payment method or cancel, you can do so below before the renewal date.</p>',
      ),
      btn('Manage Subscription', '{{billing_url|default:#}}'),
      div(),
      sp(8),
      footer(),
    ],
  ),

  // ── EVENT ───────────────────────────────────────────────────────────────────
  t(
    'event-002',
    'Webinar Invite',
    'event',
    'Invite subscribers to an upcoming webinar.',
    'Join us live: {{webinar_title|default:"Our Upcoming Webinar"}}',
    'Save your spot — limited seats.',
    [
      hero(
        '{{webinar_title|default:"Join Our Live Webinar"}}',
        '{{webinar_date|default:"Date TBD"}} · {{webinar_time|default:"Time TBD"}} {{timezone|default:"UTC"}}',
        '#4338ca',
      ),
      sp(),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>You are invited to join <strong>{{webinar_title|default:"our upcoming webinar"}}</strong> where we will cover:</p>',
      ),
      txt(
        '<ul><li>{{topic_1|default:"Key insight or topic one"}}</li><li>{{topic_2|default:"Key insight or topic two"}}</li><li>{{topic_3|default:"Live Q&A with our experts"}}</li></ul>',
      ),
      txt(
        '<p><strong>🗓 Date:</strong> {{webinar_date|default:"TBD"}}<br><strong>🕐 Time:</strong> {{webinar_time|default:"TBD"}} {{timezone|default:"UTC"}}<br><strong>📍 Where:</strong> Online (link sent after registration)</p>',
      ),
      sp(8),
      btn('Reserve My Spot', '{{registration_url|default:#}}', '#4338ca'),
      sp(16),
      txt(
        '<p style="font-size:13px;color:#9ca3af;">Can not make it live? Register anyway — we will send the recording.</p>',
        '13px',
        '#9ca3af',
      ),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'event-003',
    'Event Reminder',
    'event',
    '24-hour reminder email for a registered event.',
    'Reminder: {{event_name|default:"your event"}} is tomorrow',
    "Don't forget — it's almost time.",
    [
      hero(
        'See You Tomorrow! 👋',
        '{{event_name|default:"Your Event"}} starts in less than 24 hours',
        '#0369a1',
      ),
      sp(),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>Just a reminder that <strong>{{event_name|default:"your event"}}</strong> is happening <strong>tomorrow</strong>. Here are your details:</p>',
      ),
      txt(
        '<p><strong>📅 Date:</strong> {{event_date|default:"Tomorrow"}}<br><strong>🕐 Time:</strong> {{event_time|default:"TBD"}} {{timezone|default:"UTC"}}<br><strong>📍 Location:</strong> {{event_location|default:"Online"}}</p>',
      ),
      btn('Add to Calendar', '{{calendar_url|default:#}}', '#0369a1'),
      sp(8),
      txt(
        '<p>{{event_access_instructions|default:"Your access link will be sent 15 minutes before the event starts."}}</p>',
      ),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'event-004',
    'Post-Event Follow-up',
    'event',
    'Thank attendees and share recording/resources after an event.',
    'Thank you for attending {{event_name|default:"our event"}}!',
    "Here's the recording and key resources.",
    [
      hero('Thanks for Joining Us! 🙌', '{{event_name|default:"Event"}} wrap-up', '#059669'),
      sp(),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>Thank you for attending {{event_name|default:"our event"}}. It was wonderful to have you. Here is everything you need from the session:</p>',
      ),
      btn('Watch the Recording', '{{recording_url|default:#}}', '#059669'),
      sp(8),
      txt(
        '<p><strong>Resources mentioned:</strong></p><p>{{resource_links|default:"• Slide deck: [link]<br>• Further reading: [link]<br>• Template mentioned: [link]"}}</p>',
      ),
      div(),
      txt('<p>Have questions or feedback? Reply to this email — we read every message.</p>'),
      div(),
      sp(8),
      footer(),
    ],
  ),

  // ── ONBOARDING ──────────────────────────────────────────────────────────────
  t(
    'onboard-002',
    'Day 3 — Getting Started',
    'onboarding',
    'Day 3 onboarding email: first feature spotlight.',
    'Ready to try {{feature_name|default:"the core feature"}}?',
    "Here's a quick tip to help you get the most out of us.",
    [
      sp(16),
      txt(
        '<p style="font-size:20px;font-weight:700;color:#1f2937;">Day 3: Try {{feature_name|default:"the Core Feature"}}</p>',
        '20px',
        '#1f2937',
      ),
      div(),
      sp(8),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>You have been with us for a few days. Now is a great time to try <strong>{{feature_name|default:"the feature that saves our users the most time"}}</strong>.</p><p>{{feature_explanation|default:"Here is how it works in 3 steps: open the dashboard, click the big button, and you are done. Most users see results within the first session."}}</p>',
      ),
      btn('Try It Now', '{{feature_url|default:#}}'),
      sp(16),
      txt(
        '<p style="font-size:13px;color:#9ca3af;">Reply to this email if you need help — we are here for you.</p>',
        '13px',
        '#9ca3af',
      ),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'onboard-003',
    'Day 7 — Success Milestone',
    'onboarding',
    'Day 7 check-in celebrating early success.',
    'You\'re off to a great start, {{first_name|default:""}}! 🎉',
    "Here's what you've accomplished so far.",
    [
      hero('One Week In 🎉', "Here's what you have accomplished", '#0891b2'),
      sp(),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>A week in and you are already making progress! Here is a quick look at your stats so far:</p>',
      ),
      txt(
        '<p><strong>{{stat_label_1|default:"Emails sent"}}:</strong> {{stat_value_1|default:"—"}}<br><strong>{{stat_label_2|default:"Contacts imported"}}:</strong> {{stat_value_2|default:"—"}}<br><strong>{{stat_label_3|default:"Automations active"}}:</strong> {{stat_value_3|default:"—"}}</p>',
      ),
      div(),
      txt(
        '<p>Next step: {{next_step|default:"Set up your first automation to save even more time."}}</p>',
      ),
      btn('Continue Setup', '{{next_step_url|default:#}}', '#0891b2'),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'onboard-004',
    'Trial Expiry Warning',
    'onboarding',
    '3 days left in trial — upgrade nudge.',
    'Your trial ends in 3 days',
    "Don't lose your progress.",
    [
      sp(16),
      txt(
        '<p style="font-size:22px;font-weight:700;color:#dc2626;text-align:center;">⏰ 3 Days Left</p>',
        '22px',
        '#dc2626',
        'center',
      ),
      div(),
      sp(8),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>Your free trial of <strong>{{company|default:"our product"}}</strong> ends in <strong>3 days</strong>. Everything you have built will be paused when the trial expires.</p><p>Upgrade now to keep your {{progress_items|default:"contacts, automations, and campaigns"}} and continue without interruption.</p>',
      ),
      btn('Upgrade Before It Ends', '{{upgrade_url|default:#}}', '#dc2626'),
      sp(16),
      txt(
        '<p style="font-size:13px;color:#9ca3af;">Questions about pricing? Reply to this email — we are happy to help.</p>',
        '13px',
        '#9ca3af',
      ),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'onboard-005',
    'Upgrade Nudge (Limit Hit)',
    'onboarding',
    'User hit a plan limit — suggest upgrade.',
    'You\'ve reached your {{limit_name|default:"send limit"}} — here\'s how to go further',
    'Time to level up.',
    [
      sp(16),
      txt(
        '<p style="font-size:22px;font-weight:700;color:#1f2937;">You Have Reached Your Limit</p>',
        '22px',
        '#1f2937',
      ),
      div(),
      sp(8),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>You have used up your <strong>{{limit_name|default:"monthly send limit"}}</strong> on the <strong>{{current_plan|default:"Free"}}</strong> plan.</p><p>Upgrade to <strong>{{next_plan|default:"Pro"}}</strong> to unlock unlimited {{feature_unlocked|default:"sends"}} and much more.</p>',
      ),
      btn('View Upgrade Options', '{{upgrade_url|default:#}}'),
      div(),
      sp(8),
      footer(),
    ],
  ),

  // ── SEASONAL ────────────────────────────────────────────────────────────────
  t(
    'seasonal-002',
    'Black Friday',
    'seasonal',
    'Black Friday / Cyber Monday sale email.',
    '⬛ Black Friday: {{discount_pct|default:"40"}}% off everything',
    'The biggest sale of the year.',
    [
      hero('⬛ BLACK FRIDAY', '{{discount_pct|default:"40"}}% OFF — Limited Time', '#000000'),
      sp(16),
      // Same as cd1: a countdown block the renderer never drew.
      txt(
        '<p style="background:#111827;color:#fbbf24;font-weight:700;text-align:center;padding:14px;border-radius:8px;margin:0;">Ends {{sale_end_time|default:"Sunday at 23:59"}}</p>',
      ),
      sp(16),
      txt(
        '<p style="text-align:center;font-size:16px;">Use code <strong style="font-size:22px;color:#fbbf24;letter-spacing:3px;">{{promo_code|default:"BLACK40"}}</strong></p>',
        '16px',
        '#374151',
        'center',
      ),
      btn('Shop Now', '{{shop_url|default:#}}', '#fbbf24'),
      sp(8),
      txt(
        '<p style="font-size:12px;color:#9ca3af;text-align:center;">Sale ends {{sale_end_time|default:"midnight Sunday"}}. While stocks last.</p>',
        '12px',
        '#9ca3af',
        'center',
      ),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'seasonal-003',
    'Christmas & New Year',
    'seasonal',
    'Festive season greetings with optional offer.',
    '🎄 Happy Holidays from {{company|default:"us"}}!',
    'Wishing you a wonderful season.',
    [
      hero('Happy Holidays! 🎄🎁', 'Wishing you joy and celebration', '#15803d'),
      sp(),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>As the year comes to a close, we wanted to take a moment to thank you for being part of our community. It means the world to us.</p><p>{{holiday_message|default:"We wish you and yours a wonderful holiday season and a happy New Year. We will be back with even more exciting things in January."}}</p>',
        '16px',
      ),
      div(),
      txt(
        '<p style="text-align:center;font-size:14px;color:#6b7280;">As a thank-you, enjoy <strong>{{holiday_discount|default:"20% off"}}</strong> with code <strong>{{holiday_code|default:"THANKYOU"}}</strong> until December 31.</p>',
        '14px',
        '#6b7280',
        'center',
      ),
      btn('Shop the Gift', '{{gift_url|default:#}}', '#15803d'),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'seasonal-004',
    "Valentine's Day",
    'seasonal',
    "Valentine's Day promotional email.",
    '💝 Share the love — {{discount_pct|default:"20"}}% off this Valentine\'s',
    'Because love deserves a gift.',
    [
      hero('💝 Share the Love', 'Valentine\'s Day — {{discount_pct|default:"20"}}% off', '#be123c'),
      sp(),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>Valentine\'s Day is the perfect time to show the people you care about how much they mean to you. We have curated something special to help you do just that.</p>',
      ),
      btn("Shop Valentine's Gifts", '{{gift_url|default:#}}', '#be123c'),
      sp(8),
      txt(
        '<p style="font-size:13px;color:#9ca3af;text-align:center;">Offer ends {{offer_expiry|default:"February 14"}}. Use code {{promo_code|default:"LOVE20"}}.</p>',
        '13px',
        '#9ca3af',
        'center',
      ),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'seasonal-005',
    'Spring / Easter',
    'seasonal',
    'Spring sale or Easter greeting email.',
    '🌸 Spring is here — {{offer_headline|default:"fresh deals just for you"}}',
    'New season, new deals.',
    [
      hero(
        '🌸 Hello, Spring!',
        '{{offer_headline|default:"Fresh deals to celebrate the new season"}}',
        '#16a34a',
      ),
      sp(),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>Spring is finally here and we are celebrating with {{offer_description|default:"some of our best offers of the year. Whether you are looking to refresh your setup or try something new, we have you covered."}}.</p>',
      ),
      btn('See Spring Deals', '{{offer_url|default:#}}', '#16a34a'),
      div(),
      sp(8),
      footer(),
    ],
  ),

  // ── ECOMMERCE ───────────────────────────────────────────────────────────────
  t(
    'ecom-002',
    'Abandoned Cart',
    'ecommerce',
    'Recover abandoned carts with a personalized reminder.',
    'You left something behind, {{first_name|default:"there"}} 🛒',
    'Your cart is waiting for you.',
    [
      hero(
        'Your Cart Is Waiting 🛒',
        'You left {{cart_item_count|default:"1"}} item(s) behind',
        '#0369a1',
      ),
      sp(),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>You were so close! You left {{cart_item_count|default:"something"}} in your cart. It is still available, but we cannot hold it forever.</p>',
      ),
      {
        id: 'pr1',
        type: 'product',
        name: '{{cart_item_name|default:"Product in cart"}}',
        price: '{{cart_item_price|default:"$0.00"}}',
        image: '{{cart_item_image|default:""}}',
        url: '{{cart_url|default:#}}',
        buttonText: 'Buy Now',
        buttonColor: '#0369a1',
      },
      sp(8),
      btn('Complete My Purchase', '{{cart_url|default:#}}', '#0369a1'),
      sp(16),
      txt(
        '<p style="font-size:13px;color:#9ca3af;">Need help? Contact us at {{support_email|default:"support@company.com"}}.</p>',
        '13px',
        '#9ca3af',
      ),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'ecom-003',
    'Review Request',
    'ecommerce',
    'Post-purchase review request with star rating CTA.',
    'How did we do, {{first_name|default:"there"}}? ⭐',
    'Your feedback helps us improve.',
    [
      sp(16),
      txt(
        '<p style="font-size:22px;font-weight:700;color:#1f2937;text-align:center;">How Was Your Order? ⭐</p>',
        '22px',
        '#1f2937',
        'center',
      ),
      div(),
      sp(),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>We hope you are loving your recent purchase of <strong>{{product_name|default:"your order"}}</strong>. Taking 30 seconds to leave a review helps thousands of other customers make better decisions.</p>',
      ),
      btn('Leave a Review', '{{review_url|default:#}}', '#f59e0b'),
      sp(16),
      txt(
        '<p style="font-size:13px;color:#9ca3af;">Not happy? Reply to this email and we will make it right.</p>',
        '13px',
        '#9ca3af',
      ),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'ecom-004',
    'Back in Stock',
    'ecommerce',
    'Alert subscribers when a wished item is back in stock.',
    '{{product_name|default:"Your wishlist item"}} is back in stock! 🎉',
    'Hurry — it sells out fast.',
    [
      hero(
        'Back In Stock! 🎉',
        '{{product_name|default:"The item you wanted"}} is available again',
        '#7c3aed',
      ),
      sp(),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>Great news — <strong>{{product_name|default:"the item you were waiting for"}}</strong> is back in stock. Based on demand, it usually sells out within {{sellout_timeframe|default:"24 hours"}}.</p>',
      ),
      {
        id: 'pr2',
        type: 'product',
        name: '{{product_name|default:"Product"}}',
        price: '{{product_price|default:"$0.00"}}',
        image: '{{product_image|default:""}}',
        url: '{{product_url|default:#}}',
        buttonText: 'Buy Now',
        buttonColor: '#7c3aed',
      },
      btn('Buy Before It Sells Out', '{{product_url|default:#}}', '#7c3aed'),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'ecom-005',
    'Price Drop Alert',
    'ecommerce',
    'Alert when a watched product drops in price.',
    '💰 Price drop on {{product_name|default:"your wishlist item"}}!',
    "Now's the time to grab it.",
    [
      hero(
        'Price Drop! 💰',
        '{{product_name|default:"Your saved item"}} just got cheaper',
        '#059669',
      ),
      sp(),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>You saved <strong>{{product_name|default:"a product"}}</strong> and it just dropped from <strong style="text-decoration:line-through;">{{old_price|default:"$XX"}}</strong> to <strong style="color:#059669;font-size:20px;">{{new_price|default:"$YY"}}</strong>.</p>',
      ),
      btn('Buy at the New Price', '{{product_url|default:#}}', '#059669'),
      sp(8),
      txt(
        '<p style="font-size:13px;color:#9ca3af;">Price may change. Offer available while stocks last.</p>',
        '13px',
        '#9ca3af',
      ),
      div(),
      sp(8),
      footer(),
    ],
  ),

  // ── B2B ─────────────────────────────────────────────────────────────────────
  t(
    'b2b-001',
    'Cold Outreach (Plain)',
    'newsletter',
    'Plain-text-style cold outreach from a sales rep.',
    '{{subject_line|default:"Quick question for you"}}',
    '{{preheader|default:"A short note from our team."}}',
    [
      sp(8),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>{{opening_line|default:"I came across your company and noticed you are doing interesting work in the space. I wanted to reach out personally."}}</p><p>{{value_proposition|default:"We help companies like yours achieve X without Y. Most of our customers see results within the first 30 days."}}</p><p>Would it be worth a 15-minute call to explore if there is a fit?</p><p>{{cta_question|default:"Does Thursday or Friday work for you?"}}</p><p>Best,<br>{{sender_name|default:"Your Name"}}<br>{{sender_title|default:"Title"}}<br>{{company|default:"Company"}}</p>',
        '15px',
      ),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'b2b-002',
    'Case Study Share',
    'newsletter',
    'Share a customer case study with relevant prospects.',
    'How {{customer_name|default:"a customer like you"}} achieved {{result|default:"great results"}}',
    'Real results. Real company.',
    [
      hero(
        'Customer Story',
        'How {{customer_name|default:"a company"}} achieved {{result|default:"great results"}}',
        '#1d4ed8',
      ),
      sp(),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>I thought you would find this relevant: <strong>{{customer_name|default:"one of our customers"}}</strong> had a similar challenge to yours and here is what happened when they used {{company|default:"our solution"}}:</p>',
      ),
      txt(
        '<p>📈 <strong>{{metric_1|default:"Result 1"}}:</strong> {{metric_value_1|default:"X → Y in Z time"}}<br>📉 <strong>{{metric_2|default:"Result 2"}}:</strong> {{metric_value_2|default:"Reduced X by Y%"}}</p>',
      ),
      btn('Read the Full Case Study', '{{case_study_url|default:#}}', '#1d4ed8'),
      sp(8),
      txt(
        '<p>Would something like this be valuable for {{prospect_company|default:"your team"}}?</p><p>{{sender_name|default:"Your Name"}}</p>',
      ),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'b2b-003',
    'Demo Invite',
    'newsletter',
    'Invite a prospect to a product demo.',
    'See {{company|default:"our product"}} in action — book your demo',
    '15 minutes could change how you work.',
    [
      hero('See It In Action 🎬', 'Book a 15-minute live demo', '#0f172a'),
      sp(),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>The best way to understand what {{company|default:"our product"}} can do for {{prospect_company|default:"your team"}} is to see it live. I would love to walk you through:</p>',
      ),
      txt(
        '<ul><li>{{demo_point_1|default:"How to solve problem X in under 5 minutes"}}</li><li>{{demo_point_2|default:"The feature that saves our customers 10+ hours per week"}}</li><li>{{demo_point_3|default:"How to migrate from your current tool — faster than you think"}}</li></ul>',
      ),
      btn('Book Your Demo', '{{demo_url|default:#}}'),
      sp(8),
      txt(
        '<p style="font-size:13px;color:#9ca3af;">No sales pressure — just a focused look at what is possible.</p>',
        '13px',
        '#9ca3af',
      ),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'b2b-004',
    'Proposal Follow-up',
    'newsletter',
    'Follow up on a sent proposal to re-engage a prospect.',
    'Following up on the proposal I sent, {{first_name|default:"there"}}',
    'Did you get a chance to review it?',
    [
      sp(8),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>I wanted to follow up on the proposal I sent over {{proposal_days_ago|default:"a few days ago"}} for {{proposal_topic|default:"our engagement"}}.</p><p>I know things get busy. I am just checking if you had a chance to review it and if you have any questions I can answer.</p><p>{{follow_up_offer|default:"I am also happy to adjust the scope or pricing if needed — just say the word."}}</p>',
        '15px',
      ),
      btn('View the Proposal', '{{proposal_url|default:#}}'),
      sp(8),
      txt(
        '<p>Looking forward to hearing your thoughts.</p><p>{{sender_name|default:"Your Name"}}</p>',
        '15px',
      ),
      div(),
      sp(8),
      footer(),
    ],
  ),

  // ── SAAS ────────────────────────────────────────────────────────────────────
  t(
    'saas-001',
    'Feature Announcement',
    'newsletter',
    'New feature launch to existing users.',
    'New in {{company|default:"your app"}}: {{feature_name|default:"Feature Name"}} 🚀',
    'You asked for it. Here it is.',
    [
      hero(
        '{{feature_name|default:"New Feature"}} is live 🚀',
        "Something you've been waiting for",
        '#6366f1',
      ),
      sp(),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>We just shipped <strong>{{feature_name|default:"a major new feature"}}</strong> — and it directly addresses feedback from users like you.</p><p>{{feature_description|default:"Here is what it does: it automates X, saves you from Y, and connects with Z. Setup takes under 2 minutes."}}</p>',
      ),
      btn('Try {{feature_name|default:"New Feature"}}', '{{feature_url|default:#}}', '#6366f1'),
      sp(16),
      txt(
        '<p style="font-size:13px;color:#9ca3af;">Have ideas for what to build next? Reply to this email — we are listening.</p>',
        '13px',
        '#9ca3af',
      ),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'saas-002',
    'Monthly Usage Report',
    'newsletter',
    'Monthly account usage summary for power users.',
    'Your {{month|default:"monthly"}} usage report is ready',
    'See how you used your account this month.',
    [
      sp(16),
      txt(
        '<p style="font-size:22px;font-weight:700;color:#1f2937;">Your {{month|default:"Monthly"}} Report</p>',
        '22px',
        '#1f2937',
      ),
      div(),
      sp(8),
      txt(
        '<p>Hi {{first_name|default:"there"}}, here is a summary of your account activity for <strong>{{report_period|default:"this month"}}</strong>:</p>',
      ),
      txt(
        '<p>📧 <strong>{{metric_label_1|default:"Emails sent"}}:</strong> {{metric_value_1|default:"0"}}<br>👥 <strong>{{metric_label_2|default:"Active contacts"}}:</strong> {{metric_value_2|default:"0"}}<br>⚡ <strong>{{metric_label_3|default:"Automations triggered"}}:</strong> {{metric_value_3|default:"0"}}<br>📈 <strong>{{metric_label_4|default:"Average open rate"}}:</strong> {{metric_value_4|default:"0%"}}</p>',
      ),
      div(),
      txt(
        '<p>{{usage_insight|default:"You are in the top 20% of users this month. Keep it up!"}}</p>',
      ),
      btn('View Full Report', '{{report_url|default:#}}'),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'saas-003',
    'Churn Winback',
    'newsletter',
    'Re-engage a cancelled or churned user.',
    'We miss you, {{first_name|default:"there"}} — come back?',
    'A lot has changed since you left.',
    [
      sp(16),
      txt(
        '<p style="font-size:24px;font-weight:700;color:#1f2937;text-align:center;">We Miss You 👋</p>',
        '24px',
        '#1f2937',
        'center',
      ),
      div(),
      sp(8),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>It has been {{days_inactive|default:"a while"}} since we last saw you. We have been busy and there is a lot new since you left:</p>',
      ),
      txt(
        '<ul><li>{{update_1|default:"New feature that addresses your most common pain point"}}</li><li>{{update_2|default:"Better pricing — more value for your money"}}</li><li>{{update_3|default:"A completely redesigned experience"}}</li></ul>',
      ),
      txt(
        '<p>To welcome you back, here is a <strong>{{winback_offer|default:"30% discount for 3 months"}}</strong> — no strings attached.</p>',
      ),
      btn('Come Back', '{{winback_url|default:#}}', '#7c3aed'),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'saas-004',
    'NPS Survey',
    'newsletter',
    'Net Promoter Score survey email.',
    'Quick question for you, {{first_name|default:"there"}} — 2 minutes',
    'How likely are you to recommend us?',
    [
      sp(16),
      txt(
        '<p style="font-size:22px;font-weight:700;color:#1f2937;text-align:center;">Quick Question 🙏</p>',
        '22px',
        '#1f2937',
        'center',
      ),
      div(),
      sp(8),
      txt(
        '<p>Hi {{first_name|default:"there"}},</p><p>On a scale of 0–10, how likely are you to recommend <strong>{{company|default:"us"}}</strong> to a friend or colleague?</p>',
      ),
      txt(
        '<p style="text-align:center;"><a href="{{nps_url_0|default:#}}" style="margin:0 4px;padding:8px 12px;background:#f1f5f9;color:#374151;text-decoration:none;border-radius:4px;font-weight:700;">0</a><a href="{{nps_url_1|default:#}}" style="margin:0 4px;padding:8px 12px;background:#f1f5f9;color:#374151;text-decoration:none;border-radius:4px;font-weight:700;">1</a><a href="{{nps_url_2|default:#}}" style="margin:0 4px;padding:8px 12px;background:#f1f5f9;color:#374151;text-decoration:none;border-radius:4px;font-weight:700;">2</a><a href="{{nps_url_3|default:#}}" style="margin:0 4px;padding:8px 12px;background:#f1f5f9;color:#374151;text-decoration:none;border-radius:4px;font-weight:700;">3</a><a href="{{nps_url_4|default:#}}" style="margin:0 4px;padding:8px 12px;background:#f1f5f9;color:#374151;text-decoration:none;border-radius:4px;font-weight:700;">4</a><a href="{{nps_url_5|default:#}}" style="margin:0 4px;padding:8px 12px;background:#f1f5f9;color:#374151;text-decoration:none;border-radius:4px;font-weight:700;">5</a><a href="{{nps_url_6|default:#}}" style="margin:0 4px;padding:8px 12px;background:#f1f5f9;color:#374151;text-decoration:none;border-radius:4px;font-weight:700;">6</a><a href="{{nps_url_7|default:#}}" style="margin:0 4px;padding:8px 12px;background:#059669;color:#fff;text-decoration:none;border-radius:4px;font-weight:700;">7</a><a href="{{nps_url_8|default:#}}" style="margin:0 4px;padding:8px 12px;background:#059669;color:#fff;text-decoration:none;border-radius:4px;font-weight:700;">8</a><a href="{{nps_url_9|default:#}}" style="margin:0 4px;padding:8px 12px;background:#16a34a;color:#fff;text-decoration:none;border-radius:4px;font-weight:700;">9</a><a href="{{nps_url_10|default:#}}" style="margin:0 4px;padding:8px 12px;background:#15803d;color:#fff;text-decoration:none;border-radius:4px;font-weight:700;">10</a></p>',
        '14px',
        '#374151',
        'center',
      ),
      sp(8),
      txt(
        '<p style="font-size:12px;color:#9ca3af;text-align:center;">0 = Not likely at all · 10 = Extremely likely. Takes less than 2 minutes.</p>',
        '12px',
        '#9ca3af',
        'center',
      ),
      div(),
      sp(8),
      footer(),
    ],
  ),

  t(
    'saas-005',
    'Reactivation (No Login)',
    'newsletter',
    'Re-engage users who have not logged in recently.',
    '{{first_name|default:"Hey"}}, we noticed you have not been around lately',
    'Your account is getting dusty.',
    [
      sp(16),
      txt(
        '<p style="font-size:20px;font-weight:700;color:#1f2937;">Is everything okay, {{first_name|default:"there"}}?</p>',
        '20px',
        '#1f2937',
      ),
      div(),
      sp(8),
      txt(
        '<p>We noticed you have not logged in for <strong>{{days_inactive|default:"30 days"}}</strong>. We want to make sure {{company|default:"our product"}} is still working for you.</p><p>{{re_engagement_hook|default:"We recently launched several improvements that might change your mind. Or if something is not working for you, we would love to know so we can fix it."}}</p>',
      ),
      btn('Log Back In', '{{login_url|default:#}}'),
      sp(8),
      txt(
        '<p style="font-size:13px;color:#9ca3af;">If you want to close your account, you can do so in your account settings.</p>',
        '13px',
        '#9ca3af',
      ),
      div(),
      sp(8),
      footer(),
    ],
  ),
];
