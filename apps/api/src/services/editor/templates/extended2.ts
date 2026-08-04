/**
 * Extended email template library — batch 2 (#11 CC-gap: more templates).
 * Merged into TEMPLATES in index.ts. Self-contained compact helpers.
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

let seq = 0;
const uid = (p: string) => `${p}${(seq++).toString(36)}`;

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

const sp = (h = 20) => ({ id: uid('sp'), type: 'spacer', height: h });
const div = () => ({
  id: uid('dv'),
  type: 'divider',
  color: '#e2e8f0',
  thickness: 1,
  widthPercent: 100,
});
const txt = (content: string, size = '15px', color = '#374151', align = 'left') => ({
  id: uid('tx'),
  type: 'text',
  content,
  fontSize: size,
  fontFamily: 'Arial, Helvetica, sans-serif',
  color,
  lineHeight: '1.6',
  textAlign: align,
});
const btn = (text: string, url = '{{cta_url|default:"#"}}', bg = '#2563eb') => ({
  id: uid('bt'),
  type: 'button',
  text,
  url,
  backgroundColor: bg,
  textColor: '#ffffff',
  borderRadius: '6px',
  fontSize: '15px',
  textAlign: 'center',
  align: 'center',
  size: 'md',
});
const hero = (title: string, sub: string, bg = '#1e293b') => ({
  id: uid('hr'),
  type: 'hero',
  backgroundColor: bg,
  minHeight: '180px',
  content: [
    {
      id: uid('ha'),
      type: 'text',
      content: `<h1 style="color:#f8fafc;margin:0;font-size:26px;font-weight:700;">${title}</h1>`,
      fontSize: '26px',
      fontFamily: 'Arial, Helvetica, sans-serif',
      color: '#f8fafc',
      lineHeight: '1.3',
      textAlign: 'center',
    },
    {
      id: uid('hb'),
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

const BATCH2: TemplateMeta[] = [
  // ── NEWSLETTER ──────────────────────────────────────────────────────────────
  t(
    'nl-007',
    'Case Study Spotlight',
    'newsletter',
    'Highlight a customer success story with metrics.',
    'How {{customer_name|default:"a customer"}} achieved {{result|default:"great results"}}',
    'A real story from a real customer.',
    [
      hero('Customer Spotlight', '{{customer_name|default:"Customer"}}', '#0f766e'),
      sp(),
      txt('<p>Hi {{first_name|default:"there"}}, we love sharing what our customers achieve.</p>'),
      div(),
      txt(
        '<p style="font-size:20px;font-weight:700;color:#0f766e;">“{{quote|default:"This changed the way our whole team works."}}”</p><p style="color:#6b7280;">— {{customer_contact|default:"Happy Customer"}}, {{customer_name|default:"Company"}}</p>',
      ),
      txt(
        '<p><strong>The results:</strong></p><ul><li>{{metric_1|default:"3x faster onboarding"}}</li><li>{{metric_2|default:"40% cost reduction"}}</li><li>{{metric_3|default:"98% satisfaction"}}</li></ul>',
      ),
      btn('Read the full story', '{{case_study_url|default:#}}', '#0f766e'),
      sp(),
      div(),
      footer(),
    ],
  ),
  t(
    'nl-008',
    'Community Roundup',
    'newsletter',
    'Community highlights, events and member shoutouts.',
    'Community roundup — {{current_date}}',
    'What the community has been up to.',
    [
      hero('Community Roundup', '{{current_date}}', '#4338ca'),
      sp(),
      txt(
        '<p>Hi {{first_name|default:"there"}}, here is what happened in our community this month.</p>',
      ),
      div(),
      txt(
        '<h3 style="margin:0 0 6px;">🌟 Member Spotlight</h3><p>{{member_spotlight|default:"Meet a standout member of our community and what they built."}}</p>',
      ),
      txt(
        '<h3 style="margin:0 0 6px;">📅 Upcoming Events</h3><p>{{events_list|default:"See what is coming up and reserve your spot."}}</p>',
      ),
      btn('Join the conversation', '{{community_url|default:#}}', '#4338ca'),
      sp(),
      div(),
      footer(),
    ],
  ),

  // ── PROMO ───────────────────────────────────────────────────────────────────
  t(
    'promo-007',
    'Seasonal Sale',
    'promo',
    'Seasonal category-wide sale with coupon block.',
    '{{season|default:"Summer"}} Sale — up to {{discount_pct|default:"50"}}% off',
    'Our biggest seasonal event is here.',
    [
      hero(
        '{{season|default:"Summer"}} Sale',
        'Up to {{discount_pct|default:"50"}}% off',
        '#ea580c',
      ),
      sp(16),
      {
        id: uid('cp'),
        type: 'coupon',
        code: '{{promo_code|default:"SEASON50"}}',
        headline: 'Your exclusive code',
        description: 'Apply at checkout for your discount.',
        expiryText: 'Ends {{sale_end|default:"soon"}}',
        codeBackgroundColor: '#fff7ed',
        codeTextColor: '#9a3412',
        borderColor: '#ea580c',
        borderStyle: 'dashed',
        ctaText: 'Shop the sale',
        ctaUrl: '{{shop_url|default:"#"}}',
        ctaBackgroundColor: '#ea580c',
        ctaTextColor: '#ffffff',
        fontFamily: 'Arial, Helvetica, sans-serif',
        align: 'center',
      },
      sp(24),
      div(),
      footer(),
    ],
  ),
  t(
    'promo-008',
    'Last Chance',
    'promo',
    'Final reminder that an offer is about to expire.',
    '⏳ Last chance — {{offer|default:"your discount"}} ends tonight',
    'Do not miss out.',
    [
      hero('⏳ Last Chance', '{{offer|default:"Your discount"}} ends tonight', '#b91c1c'),
      sp(16),
      txt(
        '<p style="text-align:center;">Hi {{first_name|default:"there"}}, this is your final reminder. After tonight, this offer is gone for good.</p>',
        '16px',
        '#374151',
        'center',
      ),
      sp(8),
      btn('Claim it now', '{{offer_url|default:#}}', '#b91c1c'),
      sp(24),
      div(),
      footer(),
    ],
  ),
  t(
    'promo-009',
    'Bundle Offer',
    'promo',
    'Cross-sell a discounted product bundle.',
    'Save more with the {{bundle_name|default:"complete"}} bundle',
    'Everything you need, one great price.',
    [
      hero(
        'The {{bundle_name|default:"Complete"}} Bundle',
        'Buy together and save {{bundle_savings|default:"25%"}}',
        '#7c3aed',
      ),
      sp(16),
      txt(
        '<p>Get everything you need in one bundle and save {{bundle_savings|default:"25%"}} versus buying separately.</p>',
      ),
      txt(
        '<ul><li>{{bundle_item_1|default:"Item one"}}</li><li>{{bundle_item_2|default:"Item two"}}</li><li>{{bundle_item_3|default:"Item three"}}</li></ul>',
      ),
      btn('Get the bundle', '{{bundle_url|default:#}}', '#7c3aed'),
      sp(),
      div(),
      footer(),
    ],
  ),

  // ── TRANSACTIONAL ───────────────────────────────────────────────────────────
  t(
    'trans-010',
    'Shipping Notification',
    'transactional',
    'Order shipped with tracking details.',
    'Your order #{{order_id|default:"12345"}} has shipped 📦',
    'It is on the way.',
    [
      txt(
        '<h1 style="font-size:24px;color:#059669;text-align:center;margin:0;">📦 Your order shipped!</h1>',
        '24px',
        '#059669',
        'center',
      ),
      sp(8),
      txt('<p>Hi {{first_name|default:"there"}}, good news — your order is on its way.</p>'),
      txt(
        '<p><strong>Tracking number:</strong> {{tracking_number|default:"1Z999..."}}<br><strong>Carrier:</strong> {{carrier|default:"Standard Shipping"}}<br><strong>Estimated delivery:</strong> {{eta|default:"2-4 business days"}}</p>',
      ),
      btn('Track your package', '{{tracking_url|default:#}}', '#059669'),
      sp(),
      div(),
      txt(
        '<p style="font-size:12px;color:#9ca3af;text-align:center;">© {{current_year}} {{company|default:"Company"}}</p>',
        '12px',
        '#9ca3af',
        'center',
      ),
    ],
  ),
  t(
    'trans-011',
    'Receipt',
    'transactional',
    'Payment receipt with line items.',
    'Receipt for your payment — {{amount|default:"$0.00"}}',
    'Thank you for your payment.',
    [
      txt(
        '<h1 style="font-size:22px;text-align:center;margin:0;">Payment received</h1>',
        '22px',
        '#111827',
        'center',
      ),
      sp(8),
      txt(
        '<p>Hi {{first_name|default:"there"}}, thank you for your payment. Here is your receipt.</p>',
      ),
      txt(
        '<table style="width:100%;border-collapse:collapse;"><tr style="background:#f8fafc;"><td style="padding:10px;border:1px solid #e2e8f0;">{{item_name|default:"Subscription"}}</td><td style="padding:10px;border:1px solid #e2e8f0;text-align:right;">{{amount|default:"$0.00"}}</td></tr><tr><td style="padding:10px;border:1px solid #e2e8f0;font-weight:700;">Total</td><td style="padding:10px;border:1px solid #e2e8f0;text-align:right;font-weight:700;">{{amount|default:"$0.00"}}</td></tr></table>',
      ),
      sp(8),
      txt(
        '<p style="font-size:13px;color:#6b7280;">Paid on {{payment_date|default:"today"}} · {{payment_method|default:"Card ending 0000"}}</p>',
        '13px',
        '#6b7280',
      ),
      div(),
      txt(
        '<p style="font-size:12px;color:#9ca3af;text-align:center;">© {{current_year}} {{company|default:"Company"}}</p>',
        '12px',
        '#9ca3af',
        'center',
      ),
    ],
  ),
  t(
    'trans-012',
    'Trial Ending',
    'transactional',
    'Notify a user their free trial is ending soon.',
    'Your trial ends in {{days_left|default:"3"}} days',
    'Keep your access — upgrade now.',
    [
      hero('Your trial is ending', '{{days_left|default:"3"}} days left', '#d97706'),
      sp(16),
      txt(
        '<p>Hi {{first_name|default:"there"}}, your free trial of {{company|default:"our product"}} ends on <strong>{{trial_end_date|default:"soon"}}</strong>.</p><p>Upgrade now to keep all your data and features without interruption.</p>',
      ),
      btn('Upgrade my account', '{{upgrade_url|default:#}}', '#d97706'),
      sp(),
      div(),
      footer(),
    ],
  ),

  // ── E-COMMERCE ────────────────────────────────────────────────────────────────
  t(
    'ecom-005',
    'Back in Stock',
    'ecommerce',
    'Notify a shopper a wished item is available again.',
    "{{product_name|default:'Your item'}} is back in stock 🎉",
    'It sold out fast — grab it now.',
    [
      hero(
        'Back in Stock 🎉',
        '{{product_name|default:"Your item"}} is available again',
        '#16a34a',
      ),
      sp(16),
      {
        id: uid('pr'),
        type: 'product',
        title: '{{product_name|default:"Your Item"}}',
        imageSrc: '{{product_image|default:""}}',
        price: '{{product_price|default:"0.00"}}',
        compareAtPrice: '',
        description:
          '{{product_description|default:"The item you wanted is available again — but not for long."}}',
        productUrl: '{{product_url|default:"#"}}',
        ctaText: 'Buy now',
        ctaBackgroundColor: '#16a34a',
        ctaTextColor: '#ffffff',
        titleColor: '#111827',
        priceColor: '#111827',
        fontFamily: 'Arial, Helvetica, sans-serif',
        imagePosition: 'top',
        align: 'center',
      },
      sp(16),
      div(),
      footer(),
    ],
  ),
  t(
    'ecom-006',
    'Post-Purchase Cross-Sell',
    'ecommerce',
    'Recommend complementary products after purchase.',
    'You might also love these 💡',
    'Handpicked to go with your order.',
    [
      hero('Picked for you', 'Based on your recent order', '#0369a1'),
      sp(16),
      txt(
        '<p>Hi {{first_name|default:"there"}}, thanks for your order! Here are a few things that pair perfectly.</p>',
      ),
      {
        id: uid('pr'),
        type: 'product',
        title: '{{rec_title|default:"Recommended Product"}}',
        imageSrc: '{{rec_image|default:""}}',
        price: '{{rec_price|default:"0.00"}}',
        compareAtPrice: '',
        description: '{{rec_description|default:"A great match for what you just bought."}}',
        productUrl: '{{rec_url|default:"#"}}',
        ctaText: 'Add to cart',
        ctaBackgroundColor: '#0369a1',
        ctaTextColor: '#ffffff',
        titleColor: '#111827',
        priceColor: '#111827',
        fontFamily: 'Arial, Helvetica, sans-serif',
        imagePosition: 'left',
        align: 'left',
      },
      sp(16),
      div(),
      footer(),
    ],
  ),
  t(
    'ecom-007',
    'Review Request',
    'ecommerce',
    'Ask a customer to review a recent purchase.',
    'How did we do? Review your order',
    'Your feedback helps other shoppers.',
    [
      hero('How did we do?', 'Share your experience', '#7c3aed'),
      sp(16),
      txt(
        '<p>Hi {{first_name|default:"there"}}, thanks for shopping with us! We would love to hear what you thought of {{product_name|default:"your purchase"}}.</p><p>It takes less than a minute and helps other shoppers.</p>',
      ),
      btn('Leave a review', '{{review_url|default:#}}', '#7c3aed'),
      sp(),
      div(),
      footer(),
    ],
  ),
  t(
    'ecom-008',
    'Win-Back',
    'ecommerce',
    'Re-engage a lapsed customer with an incentive.',
    'We miss you, {{first_name|default:"friend"}} 💜',
    'Here is something to welcome you back.',
    [
      hero('We miss you 💜', 'Come back for something special', '#be185d'),
      sp(16),
      txt(
        '<p>Hi {{first_name|default:"there"}}, it has been a while! To welcome you back, here is {{incentive|default:"15% off"}} your next order.</p>',
      ),
      {
        id: uid('cp'),
        type: 'coupon',
        code: '{{promo_code|default:"WELCOME15"}}',
        headline: 'A gift for you',
        description: 'Valid on your next order.',
        expiryText: 'Expires in 7 days',
        codeBackgroundColor: '#fdf2f8',
        codeTextColor: '#9d174d',
        borderColor: '#be185d',
        borderStyle: 'dashed',
        ctaText: 'Shop now',
        ctaUrl: '{{shop_url|default:"#"}}',
        ctaBackgroundColor: '#be185d',
        ctaTextColor: '#ffffff',
        fontFamily: 'Arial, Helvetica, sans-serif',
        align: 'center',
      },
      sp(16),
      div(),
      footer(),
    ],
  ),

  // ── EVENT ─────────────────────────────────────────────────────────────────────
  t(
    'event-004',
    'Event Reminder',
    'event',
    'Reminder for an upcoming event a contact registered for.',
    "Reminder: {{event_name|default:'our event'}} is {{when|default:'tomorrow'}}",
    'See you soon — here are the details.',
    [
      hero('See you soon!', '{{event_name|default:"Our Event"}}', '#4f46e5'),
      sp(16),
      txt(
        '<p>Hi {{first_name|default:"there"}}, this is a friendly reminder that <strong>{{event_name|default:"the event"}}</strong> is {{when|default:"coming up"}}.</p><p>📅 {{event_date|default:"Date"}}<br>🕐 {{event_time|default:"Time"}}<br>📍 {{event_location|default:"Location / link"}}</p>',
      ),
      btn('View event details', '{{event_url|default:#}}', '#4f46e5'),
      sp(),
      div(),
      footer(),
    ],
  ),
  t(
    'event-005',
    'Post-Event Thank You',
    'event',
    'Thank attendees and share the recording/resources.',
    'Thanks for joining {{event_name|default:"us"}}!',
    'Here is your recording and resources.',
    [
      hero('Thank you for coming!', '{{event_name|default:"Our Event"}}', '#0f766e'),
      sp(16),
      txt(
        '<p>Hi {{first_name|default:"there"}}, thank you for attending! As promised, here are the recording and resources.</p>',
      ),
      btn('Watch the recording', '{{recording_url|default:#}}', '#0f766e'),
      sp(8),
      txt(
        '<p style="text-align:center;font-size:14px;color:#6b7280;">Missed something? All slides and links are in the resource pack.</p>',
        '14px',
        '#6b7280',
        'center',
      ),
      div(),
      footer(),
    ],
  ),

  // ── ONBOARDING ─────────────────────────────────────────────────────────────────
  t(
    'onboarding-004',
    'Getting Started Tips',
    'onboarding',
    'Actionable tips to help new users succeed early.',
    '3 tips to get the most out of {{company|default:"us"}}',
    'Small steps, big results.',
    [
      hero('Let us help you succeed', '3 quick tips to get started', '#2563eb'),
      sp(16),
      txt(
        '<p>Hi {{first_name|default:"there"}}, here are three tips our most successful users swear by.</p>',
      ),
      txt(
        '<p><strong>1. {{tip_1_title|default:"Set up your profile"}}</strong><br>{{tip_1_body|default:"It only takes a minute and unlocks personalisation."}}</p>',
      ),
      txt(
        '<p><strong>2. {{tip_2_title|default:"Connect your tools"}}</strong><br>{{tip_2_body|default:"Bring your data in to see the full picture."}}</p>',
      ),
      txt(
        '<p><strong>3. {{tip_3_title|default:"Invite a teammate"}}</strong><br>{{tip_3_body|default:"Collaboration makes everything better."}}</p>',
      ),
      btn('Open your dashboard', '{{dashboard_url|default:#}}'),
      sp(),
      div(),
      footer(),
    ],
  ),
  t(
    'onboarding-005',
    'Feature Discovery',
    'onboarding',
    'Introduce a powerful feature new users often miss.',
    'Did you know you can {{feature_verb|default:"automate this"}}?',
    'A hidden gem worth trying.',
    [
      hero('A feature you will love', '{{feature_name|default:"Automations"}}', '#7c3aed'),
      sp(16),
      txt(
        '<p>Hi {{first_name|default:"there"}}, many users do not realise they can {{feature_benefit|default:"save hours every week with automations"}}.</p><p>{{feature_description|default:"Here is how it works and why it matters."}}</p>',
      ),
      btn('Try it now', '{{feature_url|default:#}}', '#7c3aed'),
      sp(),
      div(),
      footer(),
    ],
  ),

  // ── SEASONAL ───────────────────────────────────────────────────────────────────
  t(
    'seasonal-002',
    'Black Friday',
    'seasonal',
    'High-impact Black Friday promo.',
    '🖤 Black Friday — {{discount_pct|default:"50"}}% off everything',
    'Our biggest sale of the year.',
    [
      hero('BLACK FRIDAY', '{{discount_pct|default:"50"}}% OFF EVERYTHING', '#000000'),
      sp(16),
      txt(
        '<p style="text-align:center;">One day. Everything on sale. Use code below at checkout.</p>',
        '16px',
        '#374151',
        'center',
      ),
      {
        id: uid('cp'),
        type: 'coupon',
        code: '{{promo_code|default:"BLACKFRIDAY"}}',
        headline: 'Black Friday code',
        description: 'Applies to your entire cart.',
        expiryText: 'Today only',
        codeBackgroundColor: '#f3f4f6',
        codeTextColor: '#111827',
        borderColor: '#111827',
        borderStyle: 'solid',
        ctaText: 'Shop now',
        ctaUrl: '{{shop_url|default:"#"}}',
        ctaBackgroundColor: '#111827',
        ctaTextColor: '#ffffff',
        fontFamily: 'Arial, Helvetica, sans-serif',
        align: 'center',
      },
      sp(16),
      div(),
      footer(),
    ],
  ),
  t(
    'seasonal-003',
    'New Year',
    'seasonal',
    'New year message with a fresh-start offer.',
    'Happy New Year from {{company|default:"us"}} 🎉',
    'Here is to a great year ahead.',
    [
      hero('Happy New Year! 🎉', 'A fresh start awaits', '#1d4ed8'),
      sp(16),
      txt(
        '<p>Hi {{first_name|default:"there"}}, thank you for being with us this past year. To kick off the new one, here is a little something to help you start strong.</p>',
      ),
      btn('Start the year right', '{{offer_url|default:#}}', '#1d4ed8'),
      sp(),
      div(),
      footer(),
    ],
  ),

  // ── B2B ─────────────────────────────────────────────────────────────────────────
  t(
    'b2b-003',
    'Demo Follow-Up',
    'b2b',
    'Follow up after a sales demo with next steps.',
    'Great speaking with you, {{first_name|default:"there"}}',
    'Next steps and resources from our call.',
    [
      sp(16),
      txt(
        '<p style="font-size:20px;font-weight:700;">Thanks for your time today</p>',
        '20px',
        '#1f2937',
      ),
      div(),
      sp(8),
      txt(
        '<p>Hi {{first_name|default:"there"}}, it was great walking you through {{product_name|default:"our platform"}}. As promised, here is a summary and the resources we discussed.</p>',
      ),
      txt(
        '<p><strong>Next steps:</strong></p><ul><li>{{next_step_1|default:"Review the proposal attached"}}</li><li>{{next_step_2|default:"Loop in your team"}}</li><li>{{next_step_3|default:"Book a follow-up call"}}</li></ul>',
      ),
      btn('Book a follow-up', '{{meeting_url|default:#}}', '#0f766e'),
      sp(),
      div(),
      footer(),
    ],
  ),
  t(
    'b2b-004',
    'Whitepaper Offer',
    'b2b',
    'Offer a gated whitepaper or report to nurture leads.',
    'Free report: {{report_title|default:"Industry Trends 2026"}}',
    'The data you need, in one place.',
    [
      hero('Free Industry Report', '{{report_title|default:"Trends 2026"}}', '#0f172a'),
      sp(16),
      txt(
        '<p>Hi {{first_name|default:"there"}}, we compiled the latest data and insights into a free report so you can make smarter decisions.</p><p>Inside you will find benchmarks, trends and actionable recommendations.</p>',
      ),
      btn('Download the report', '{{report_url|default:#}}', '#0f172a'),
      sp(),
      div(),
      footer(),
    ],
  ),

  // ── SAAS ─────────────────────────────────────────────────────────────────────────
  t(
    'saas-003',
    'Usage Summary',
    'saas',
    'Monthly usage recap to reinforce product value.',
    'Your {{company|default:"account"}} summary for {{current_date}}',
    'See what you accomplished this month.',
    [
      hero('Your monthly summary', '{{current_date}}', '#4338ca'),
      sp(16),
      txt('<p>Hi {{first_name|default:"there"}}, here is what you accomplished this month:</p>'),
      txt(
        '<table style="width:100%;border-collapse:collapse;"><tr style="background:#f8fafc;"><td style="padding:10px;border:1px solid #e2e8f0;">{{metric_label_1|default:"Actions taken"}}</td><td style="padding:10px;border:1px solid #e2e8f0;text-align:right;font-weight:700;">{{metric_value_1|default:"0"}}</td></tr><tr><td style="padding:10px;border:1px solid #e2e8f0;">{{metric_label_2|default:"Time saved"}}</td><td style="padding:10px;border:1px solid #e2e8f0;text-align:right;font-weight:700;">{{metric_value_2|default:"0h"}}</td></tr></table>',
      ),
      btn('View full report', '{{dashboard_url|default:#}}', '#4338ca'),
      sp(),
      div(),
      footer(),
    ],
  ),
  t(
    'saas-004',
    'Seat Invitation',
    'saas',
    'Invite a teammate to join a workspace.',
    '{{inviter_name|default:"A teammate"}} invited you to {{company|default:"a workspace"}}',
    'Join your team in seconds.',
    [
      hero("You're invited", 'Join {{workspace_name|default:"the workspace"}}', '#2563eb'),
      sp(16),
      txt(
        '<p>Hi there, <strong>{{inviter_name|default:"a teammate"}}</strong> has invited you to collaborate in {{workspace_name|default:"their workspace"}} on {{company|default:"our platform"}}.</p>',
      ),
      btn('Accept invitation', '{{invite_url|default:#}}'),
      sp(8),
      txt(
        '<p style="font-size:13px;color:#9ca3af;text-align:center;">This invitation expires in 7 days.</p>',
        '13px',
        '#9ca3af',
        'center',
      ),
      div(),
      footer(),
    ],
  ),
  t(
    'saas-005',
    'Payment Failed',
    'saas',
    'Dunning email when a payment fails.',
    'Action needed: your payment could not be processed',
    'Update your payment method to keep access.',
    [
      hero('Payment issue', 'We could not process your payment', '#b91c1c'),
      sp(16),
      txt(
        '<p>Hi {{first_name|default:"there"}}, we tried to charge your card for {{amount|default:"your subscription"}} but it did not go through.</p><p>To avoid any interruption, please update your payment details.</p>',
      ),
      btn('Update payment method', '{{billing_url|default:#}}', '#b91c1c'),
      sp(8),
      txt(
        '<p style="font-size:13px;color:#6b7280;text-align:center;">We will automatically retry in a few days.</p>',
        '13px',
        '#6b7280',
        'center',
      ),
      div(),
      footer(),
    ],
  ),
];

// Namespace ids with a batch-2 prefix so they never collide with batch-1 ids.
export const EXTENDED_TEMPLATES_2: TemplateMeta[] = BATCH2.map((t) => ({
  ...t,
  id: `b2-${t.id}`,
}));
