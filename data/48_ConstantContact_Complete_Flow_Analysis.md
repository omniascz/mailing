# Constant Contact – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v Constant Contact prochází data, lidé a akce – od sales přes 60denní trial, drag & drop editor design, event registration s payment processing, automatizace, segmentation, social posting, až po phone support, cancellation friction, a auto-upgrade trap. Speciální focus na **CC jako SMB & nonprofit platform** s 30+ let historie a phone-first support.

> Tento dokument doplňuje `47_ConstantContact_Features_DeepDive.md` o **procesní pohled**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
>
> - **Constant Contact = americká klasika** (založeno 1995, 30+ let)
> - **HQ:** Waltham, Massachusetts, USA
> - **Vlastnictví:** Clearlake Capital + Siris Capital (od 2021)
> - **Phone support 6 dní v týdnu** na všech placených plánech (unikátní!)
> - **Event Management** integrované (klíčový diferenciátor)
> - **97% deliverability** (publikováno oficiálně)
> - **30denní money-back guarantee** + **60denní free trial**
> - **Nonprofit discount až 30%**
> - **Free plan zrušen v červnu 2025** = velký change!
> - **Auto-upgrade trap** (při překročení limitu)
> - **Hard to cancel** (jen telefonicky)
> - **Overage fees** $0.002/email
> - **300+ integrací** (Shopify, Eventbrite, Canva, etc.)
> - **SMS jen USA** (Standard + Premium)

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Sales & qualification flow (US SMB-driven)](#2-sales-flow)
3. [60denní free trial signup flow](#3-trial-signup)
4. [Trial → Paid conversion](#4-trial-conversion)
5. [Account setup + BrandKit](#5-account-setup)
6. [Importing contacts flow](#6-importing-contacts)
7. [Drag & drop editor flow](#7-editor-flow)
8. [Email campaign send flow](#8-campaign-send)
9. [Welcome email automation (Lite)](#9-welcome-automation)
10. [Resend to non-openers](#10-resend-flow)
11. [Pre-built workflows (Standard tier)](#11-prebuilt-workflows)
12. [Custom automation (Premium-only)](#12-custom-automation)
13. [Event Management flow (KEY!)](#13-event-management-flow)
14. [Landing page + Forms flow](#14-landing-forms)
15. [Social media posting flow](#15-social-posting)
16. [SMS marketing flow (jen US)](#16-sms-flow)
17. [Segmentace + Dynamic Content (Premium)](#17-segmentace-flow)
18. [AI Writing Assistant flow](#18-ai-writing)
19. [Google Ads + Facebook Ads (Premium)](#19-paid-ads-flow)
20. [Ecommerce integration (Shopify, WooCommerce)](#20-ecommerce-flow)
21. [Reporting + Analytics](#21-reporting)
22. [Phone Support workflow](#22-phone-support)
23. [Nonprofit verification + 30% discount](#23-nonprofit-flow)
24. [Auto-upgrade trap mechanika](#24-auto-upgrade-flow)
25. [Cancellation flow (phone-only friction!)](#25-cancellation)
26. [Datová mapa: co vidí kdo](#26-data-map)
27. [Známé úzkoprofilové místa](#27-bottlenecks)

---

## 1. Mapa všech aktérů

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│         CONSTANT CONTACT PLATFORM ECOSYSTEM                          │
│         Constant Contact, Inc. · HQ Waltham, MA, USA                 │
│         Založeno 1995 · 30+ let historie                             │
│         Phone: 877-358-5969 · 97% deliverability                     │
│         Free plan ZRUŠEN červen 2025                                 │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [Constant Contact tým]                                              │
│   ├─ Executive leadership (privately held)                           │
│   ├─ Customer service team (PHONE!)                                  │
│   ├─ Marketing advisors (Premium)                                    │
│   ├─ Sales team (upgrade-focused)                                    │
│   ├─ Onboarding specialists                                          │
│   ├─ Retention team (cancellation calls)                             │
│   ├─ Engineering (large company)                                     │
│   ├─ Vlastníci: Clearlake Capital + Siris Capital                    │
│   └─ AI/ML team (recent expansion 2025-2026)                         │
│           │                                                          │
│           ▼                                                          │
│                                                                      │
│   ┌────────────────────────────────────────────┐                     │
│   │   Constant Contact uživatelský účet        │                     │
│   │                                            │                     │
│   │   USER LIMITS PER TIER:                    │                     │
│   │   ├─ Lite: 1 user                          │                     │
│   │   ├─ Standard: 3 users                     │                     │
│   │   └─ Premium: Unlimited users              │                     │
│   │                                            │                     │
│   │   PLATFORM FEATURES:                       │                     │
│   │   ├─ Email campaigns (core)                │                     │
│   │   ├─ Drag & drop editor                    │                     │
│   │   ├─ AI Writing Assistant                  │                     │
│   │   ├─ 200+ templates + BrandKit             │                     │
│   │   ├─ Event Management (UNIQUE!)            │                     │
│   │   ├─ Social posting (FB, IG, LinkedIn)     │                     │
│   │   ├─ SMS marketing (US only)               │                     │
│   │   ├─ Landing pages + forms                 │                     │
│   │   ├─ Automation (limited!)                 │                     │
│   │   ├─ Segmentation                          │                     │
│   │   ├─ Reporting                             │                     │
│   │   ├─ Google + FB Ads (Premium)             │                     │
│   │   ├─ SEO tools (Premium)                   │                     │
│   │   ├─ AI content recommendations (Premium)  │                     │
│   │   └─ 300+ integrations                     │                     │
│   │                                            │                     │
│   │   PHONE SUPPORT:                           │                     │
│   │   ├─ 6 dní v týdnu                         │                     │
│   │   ├─ All paid plans                        │                     │
│   │   ├─ US: 877-358-5969                      │                     │
│   │   └─ Marketing advisors (Premium)          │                     │
│   └──────────────┬─────────────────────────────┘                     │
│                  │                                                   │
│                  ▼                                                   │
│   [Marketing channels]                                               │
│       │                                                              │
│       ├─→ Email (core)                                               │
│       ├─→ SMS (US only, Standard + Premium)                          │
│       ├─→ Facebook posts + ads                                       │
│       ├─→ Instagram posts + ads                                      │
│       ├─→ LinkedIn (posts)                                           │
│       ├─→ Landing pages                                              │
│       ├─→ Event pages                                                │
│       └─→ Google Ads (Premium)                                       │
│                  │                                                   │
│                  ▼                                                   │
│   [Customers / End audience]                                         │
│       │                                                              │
│       ├─→ Subscribers (general)                                      │
│       ├─→ Event registrants                                          │
│       ├─→ Donors (nonprofit)                                         │
│       ├─→ Customers (commerce)                                       │
│       ├─→ Members (community)                                        │
│       └─→ Leads (acquisition)                                        │
│                                                                      │
│   [Integration ecosystem]                                            │
│   ┌────────────────────────────────────────────┐                     │
│   │   - Shopify / WooCommerce / BigCommerce    │                     │
│   │   - Eventbrite (deep)                      │                     │
│   │   - Canva (design)                         │                     │
│   │   - Stripe (payments)                      │                     │
│   │   - Salesforce / HubSpot (CRM)             │                     │
│   │   - WordPress / Wix / Squarespace          │                     │
│   │   - Microsoft 365 / Google Workspace       │                     │
│   │   - Zapier (1 000+ apps)                   │                     │
│   │   - LinkedIn Lead Gen Forms                │                     │
│   │   - Facebook Lead Ads                      │                     │
│   └────────────────────────────────────────────┘                     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér                        | Vstupní bod         | Co dělá                  | Co vidí        |
| ---------------------------- | ------------------- | ------------------------ | -------------- |
| **Account owner**            | Login + billing     | Vše, billing, users      | Vše            |
| **Standard user (3 total)**  | Login               | Kampaně, automatizace    | Per role       |
| **Premium user (unlimited)** | Login               | Kampaně, automatizace    | Per role       |
| **End subscriber**           | Email / SMS / event | Engage                   | Vlastní data   |
| **Event registrant**         | Event landing page  | Sign up + pay            | Event details  |
| **CC customer service**      | Phone / chat        | Issue resolution         | s consent      |
| **CC marketing advisor**     | Premium support     | Strategy guidance        | s consent      |
| **CC sales team**            | Upgrade calls       | Plan upgrades            | s consent      |
| **CC retention team**        | Cancellation calls  | Save customer            | s consent      |
| **Integration partner**      | API / OAuth         | Data sync                | Per scope      |
| **Eventbrite**               | OAuth               | Event sync               | Event data     |
| **Shopify**                  | OAuth               | Product/customer sync    | Ecommerce data |
| **Canva**                    | Embed               | Design import            | Design data    |
| **Stripe**                   | OAuth               | Event payment processing | Payment data   |

---

## 2. Sales & qualification flow (US SMB-driven)

### 2.1 Lead acquisition

```
Constant Contact lead sources:
- constantcontact.com inbound (massive organic)
- Google search ads
- Brand search (huge brand)
- Partnerships (Shopify, Eventbrite ecosystems)
- Affiliate program
- Referrals from existing customers
- Real estate community events
- Nonprofit conferences
- Marketing automation reviews
- Content marketing (blog, webinars)
```

### 2.2 Self-service first

```
Typický flow:
1. Search "email marketing for small business"
2. Constant Contact comes up (top brand)
3. Visit constantcontact.com
4. "Start Free Trial" (60 dní, no credit card!)
5. Sign up → trial active
6. Self-explore + use
7. Phone support if needed
8. Convert to paid (Lite/Standard/Premium)
```

⚠️ **60-day trial = nejvyšší free trial** v branži (vs. 7-14 dní konkurence).

### 2.3 Qualification criteria

```
Constant Contact fits pokud:

✅ US-based SMB nebo nonprofit
✅ 500-5 000 kontaktů (sweet spot)
✅ Cíl: simple email marketing
✅ Hodnota: phone support
✅ Eventy = klíčová aktivita
✅ Nonprofit (až 30% discount!)
✅ Real estate / community org
✅ Familiar workflow priority
✅ Beginner-friendly need
✅ 30+ let track record valued

❌ Free plan need (zrušen!)
❌ Advanced automation
❌ Pokročilé personalization
❌ Mezinárodní SMS
❌ Velmi velký e-shop
❌ B2B SaaS
❌ DTC ecommerce serious
❌ AI-as-foundation
❌ EU/UK/CZ trhy primary
❌ Price-sensitive growth
```

### 2.4 Pricing transparency

```
Pricing communication:
- Constantcontact.com/pricing public
- 3 tiers (Lite, Standard, Premium)
- Calculator-style based on kontakty
- ALE: hidden costs commonly:
  - Overage emails $0.002
  - Inbox preview $10
  - SMS add-on $10
  - Auto-upgrade no consent
```

### 2.5 Premium upsell flow

```
Premium upsell strategy:
- "Need automation? Upgrade to Premium!"
- "Need dynamic content? Premium!"
- "Need AI recommendations? Premium!"
- "Need ads integration? Premium!"
   ↓
Aggressive Premium positioning
   ↓
Significant tier separation (gating critical features)
```

⚠️ **Premium upsell = revenue strategy** Constant Contactu.

---

## 3. 60denní free trial signup flow

### 3.1 Trial signup

```
Free trial flow:
1. constantcontact.com → "Start Free Trial"
2. Form fields:
   - Email
   - Password
   - First name, last name
   - Company name
   - Industry (dropdown)
   - Business size
3. NO credit card required!
4. Verify email
5. Trial dashboard
6. Onboarding wizard
```

### 3.2 60denní trial scope

Per Ecommerceparadise:

> _"A 60-day free trial remains available with no credit card required — this is a meaningful trial period relative to the 7–14 day trials most competitors offer."_

```
Trial scope:
- 60 dní zdarma
- All basic features
- 100 emails maximum during trial
- Test capabilities
- Build first campaigns
- Get hands-on experience
- No credit card commitment
```

### 3.3 Trial limits per Flowium

> _"The trial gives you access to all the basic features, including: drag-and-drop email builder, professional templates, contact segmentation, basic automation, support team, and more. You can try them out in test campaigns that allow up to 100 sends."_

⚠️ **Limit 100 emails during trial** = test scope, ne production use.

### 3.4 Onboarding wizard

```
First-time setup:
1. Goals selection
   - Newsletter
   - Promotion
   - Event
   - Nonprofit
   - Other
2. Industry identification
3. Brand colors picker
4. Logo upload
5. First template suggestion
6. Sample contact import
7. First campaign draft
   ↓
Marketing advisor offer (Premium)
```

### 3.5 Trial vs. competition

```
Free trial comparison:

Constant Contact: 60 days, no card
Mailchimp: Free forever (500 contacts)
MailerLite: Free forever (1000 contacts)
Brevo: Free forever (unlimited contacts)
ActiveCampaign: 14 days
HubSpot: Free CRM forever + 14d Marketing
Klaviyo: No trial (paid only $20+)
GetResponse: 30 days
   ↓
CC trial = longest among paid-only platforms
```

---

## 4. Trial → Paid Conversion

### 4.1 Trial expiration

```
Trial countdown:
- Day 1: Welcome email
- Day 7: First week check-in
- Day 14: Mid-trial reminder
- Day 30: Halfway point + upgrade nudge
- Day 45: "15 days left" alert
- Day 55: "5 days left, choose plan!"
- Day 60: Trial ends → MUST choose paid or stop
```

### 4.2 Conversion options

```
Po 60 dnech:

Option A: Subscribe (paid plan)
- Vybrat Lite ($12), Standard ($35), Premium ($80)
- Vstupní cena pro 500 kontaktů
- Auto-billing aktivováno

Option B: Stop using
- Account inaktivní
- Data zachována (limited)
- Možná return later

Option C: 30-day money-back guarantee
- Try paid plan
- Full refund within 30 dní
- Pre-2025 byl free plan = už není
```

### 4.3 Sales team intervention

```
Trial → Sales flow:

Day 30+ heavy users:
- Sales team identifies engagement
- Phone call / email outreach
- Plan recommendation
- Upgrade incentives
- Annual prepay discount (15%)
- Custom plan possible (large lists)
```

### 4.4 Pre-2025 vs. post-June 2025

```
PRE-JUNE 2025:
- Permanent free plan
- 0-100 contacts free
- Upgrade optional
- More users entered ecosystem

POST-JUNE 2025:
- ❌ No free plan
- 60-day trial only
- After 60 days = paid or stop
- Higher barrier to entry
```

⚠️ **June 2025 change** = strategic move toward higher revenue per user, lost low-end customers.

### 4.5 Annual prepay incentive

```
Annual prepay:
- Save up to 15% off
- Nonprofit: up to 30% off
- Payment upfront
- Lock in pricing for year
- Discourages mid-year cancel
   ↓
Strategic retention tool
```

---

## 5. Account setup + BrandKit

### 5.1 First-time setup

```
Account setup steps:

1. Business profile:
   - Company name
   - Address
   - Phone
   - Industry
   - Website URL

2. BrandKit setup:
   - Logo upload (1 + variations)
   - Brand colors (primary, secondary)
   - Fonts (web fonts)
   - Image library start
   - Email signature template

3. Email setup:
   - From name (sender)
   - From email (verified)
   - Reply-to email
   - Physical mailing address (required, CAN-SPAM)

4. Domain authentication (Standard+):
   - SPF setup
   - DKIM setup
   - DMARC setup
   - Verify via DNS records

5. Contact list:
   - Import method choice
   - Initial sample import (test)
   - List naming
   - Permission setup

6. First campaign:
   - Newsletter / promotion / event
   - Template selection
   - Drag & drop building
   - Test send
```

### 5.2 BrandKit application

```
BrandKit benefits:
- Applies to all templates
- Consistent visual identity
- Quick template generation
- Brand compliance
- Multi-template usage
- Logo placement automatic
- Color scheme consistency
   ↓
Pro multi-location / franchise = klíčové
```

### 5.3 Domain authentication importance

```
Authenticated domain benefits:
- Better deliverability (97% achievement)
- Less spam filtering
- Professional sender appearance
- Brand recognition
- CAN-SPAM compliance
- DMARC reporting
```

⚠️ **Authentication = key pro 97% deliverability** claim.

### 5.4 Phone support during setup

```
Onboarding phone:
- Day 1: Welcome call (Premium)
- Setup help (any tier on request)
- Strategy discussion (Premium)
- Migration assistance
- First campaign together
- Continuous availability 6 dní/týden
```

---

## 6. Importing Contacts Flow

### 6.1 Import methods

```
Contact import options:

1. CSV / Excel upload:
   - Drag-drop file
   - Column mapping
   - Validation
   - Duplicate detection
   - Suppression check
   - Tag/segment assignment

2. Direct integration:
   - Google Contacts
   - Outlook
   - Gmail
   - Microsoft 365
   - Salesforce / HubSpot CRM

3. From other email tools:
   - Mailchimp (migration tool)
   - AWeber
   - GetResponse
   - Other ESP exports

4. Manual entry:
   - Single contact add
   - Bulk paste
   - Form submission

5. Forms + Landing Pages:
   - New sign-ups auto-add
   - Welcome series trigger
```

### 6.2 Permission compliance

Per oficiální:

> _"Constant Contact's terms of service require customers to uphold permission-based lists."_

```
Permission requirements:
- Express consent (opt-in)
- Verified opt-in source
- CAN-SPAM compliant (USA)
- GDPR compliant (EU)
- CASL compliant (Canada)
- TCPA compliant (SMS)
- Documentation retained
```

⚠️ **CC has strict permission policy** – list quality enforced.

### 6.3 Suppression management

```
Suppression flow:
- Hard bounces → auto-suppress
- Spam complaints → auto-suppress
- Unsubscribes → auto-suppress
- Manual suppression (admin)
- Cross-account suppression
- Re-engagement option (limited)
```

### 6.4 List hygiene

```
List hygiene tools:
- Bounce handling
- Engagement tracking
- Inactive identification (90+ days)
- Re-engagement campaigns
- Sunset rules (remove inactive)
- Email validation (Standard+)
```

---

## 7. Drag & drop editor flow

### 7.1 Editor workflow

```
Email creation flow:

1. New campaign → Type:
   - Regular email
   - Automated email
   - Event invitation
   - Welcome series step

2. Template selection:
   - 200+ templates
   - Filter by:
     - Industry
     - Occasion
     - Style
     - Use case
   - BrandKit applied auto
   - Recent templates
   - Custom templates (Premium)

3. Drag & drop building:
   - Text blocks
   - Image blocks
   - Button CTAs
   - Dividers
   - Columns / layouts
   - Social icons
   - Video embeds
   - Coupons (events)
   - Polls / surveys
   - Product blocks (Shopify)

4. AI Writing Assistant:
   - Click "Write with AI"
   - Prompt input
   - Generate copy
   - Edit + refine
   - Apply to email

5. Personalization:
   - Insert contact field
   - First name greeting
   - Custom field tokens
   - Dynamic content (Premium)

6. Preview:
   - Desktop view
   - Mobile view
   - Inbox preview (Standard+, $10 extra)

7. Send setup:
   - Audience selection
   - Schedule
   - A/B test (Standard+)
   - UTM tracking
   - Goals + tracking

8. Final review:
   - Spam check
   - Link verification
   - Image verification
   - Send / Schedule
```

### 7.2 Templates 2026

Per EmailVendorSelection:

> _"Templates: Recent changes increased email templates to 200+. Some of the new ones are modern-looking."_

⚠️ Templates byly historicky **kritizovány** – nyní (2025-2026) modernizace.

### 7.3 BrandKit application

```
BrandKit v editoru:
- Auto-apply na new template
- Pre-set colors
- Pre-set fonts
- Logo placed
- Image library accessible
- Update once → applies everywhere
```

### 7.4 AI Writing Assistant flow

```
AI Assistant flow:

1. Click "AI Writing Assistant"
2. Input prompt:
   - "Promotional email for summer sale"
   - "Newsletter intro for July edition"
   - "Event invitation for fundraiser"
3. Tone selection:
   - Friendly
   - Professional
   - Urgent
   - Casual
4. Length selection
5. Generate
6. Multiple variations offered
7. Edit + refine
8. Apply to email block
```

---

## 8. Email Campaign Send Flow

### 8.1 Campaign send process

```
Send flow:

1. Campaign ready
2. Audience selection:
   - All contacts
   - Specific list(s)
   - Segment
   - Tag-based
3. Sender info verified
4. From name + email
5. Subject line + preheader
6. A/B test setup (optional, Standard+)
7. Schedule:
   - Send now
   - Specific date/time
   - Time zone aware
   - Resend to non-openers (auto)
8. Compliance check:
   - Unsubscribe link present
   - Physical address present
   - CAN-SPAM verify
9. Final preview
10. Confirm send
   ↓
Email enters delivery queue
   ↓
97% deliverability (oficiální)
```

### 8.2 Resend to non-openers

```
Resend feature flow:

Original send:
- Sent to 10 000 contacts
- 30% opened (3 000)
- 70% didn't open (7 000)

Resend setup:
- Wait 24-72 hodin
- New subject line (different)
- Same body content
- Auto-send to non-openers only
   ↓
Result:
- Additional 10-20% open rate
- Lift v total reach
- Bez extra content creation
```

⚠️ **Klíčová funkce** dostupná i v Lite tier.

### 8.3 A/B testing (Standard+)

```
A/B test types:

Subject line A/B:
- 2 variants
- Send 50/50 (or smaller test sample)
- Determine winner by open rate
- Auto-send winner to remaining

Time A/B:
- Test different send times
- Optimize for engagement

Content A/B (Premium):
- Different content blocks
- Different CTAs
- Different images

Send time A/B:
- Determine optimal time
- Send time optimization
```

### 8.4 Delivery reporting

```
Per campaign:
- Sent: 10 000
- Delivered: 9 700 (97%)
- Bounced: 300 (3%)
- Opened: 3 000 (31%)
- Clicked: 600 (6%)
- Unsubscribed: 50 (0.5%)
- Spam complaints: 5 (0.05%)
   ↓
Real-time tracking
```

---

## 9. Welcome Email Automation (Lite)

### 9.1 Welcome email setup

```
Welcome flow (Lite tier - single step!):

1. Settings → Automation → Welcome email
2. Configure:
   - Subject line
   - Email content (drag & drop)
   - From name/email
3. Audience: New sign-ups
4. Trigger:
   - User adds via form
   - User imports list
   - User adds manually
5. Delay: Immediate or scheduled (e.g., 1 hour)
6. Activate
   ↓
Single-step ONLY!
```

### 9.2 Per Mailsoftly critique

> _"The Lite plan offers only single-step automations: a welcome email when someone subscribes, a birthday message, or an anniversary email. That is the extent of it."_

⚠️ **Lite = pouze SINGLE-STEP** = velmi omezené.

### 9.3 Welcome vs. competition

```
Welcome automation:

Constant Contact Lite ($12):
- 1 welcome email
- Single step
- Basic personalization

MailerLite Free ($0):
- Welcome series (multiple emails)
- Conditional logic
- Time delays
- Dynamic content

Brevo Free ($0):
- Marketing automation flows
- Workflow builder
- Conditional branches
   ↓
Constant Contact Lite = limited
```

---

## 10. Resend to Non-Openers

### 10.1 Resend flow (key feature)

```
Resend setup:

1. Original campaign sent
2. After 24-72 hodin → analyze:
   - Who opened?
   - Who didn't?
3. Setup resend:
   - Audience: non-openers (auto-segmented)
   - New subject line (require)
   - Same body OR modified
4. Schedule resend
5. Auto-send to non-openers
   ↓
Reach improvement 10-20%
```

### 10.2 Strategy

```
Resend strategy:
- Different subject line (key!)
- Same content OK
- 24-72 hour gap typical
- One resend max (CAN-SPAM)
- Subject line A/B (Premium)
- ROI uplift bez extra design
```

### 10.3 Use case

```
Newsletter resend:

Original (Tuesday 10am):
- 10 000 sent
- 3 000 opened
- 7 000 not opened

Resend (Wednesday 7pm):
- Same content
- New subject: "ICYMI: [original subject]"
- Sent to 7 000 non-openers
- Result: 1 200 additional opens
   ↓
Total reach: 4 200 (vs. 3 000 original)
40% lift in opens
```

---

## 11. Pre-built Workflows (Standard tier)

### 11.1 Standard tier workflows

Per Mailsoftly:

> _"The Standard plan introduces multi-step automations, which is an improvement. You can create simple drip sequences with time delays between messages."_

```
Standard tier pre-built (3 only):

1. Welcome series:
   - Email 1: Immediate welcome
   - Email 2: Day 3 - About company
   - Email 3: Day 7 - First offer
   - Email 4: Day 14 - Best products

2. Birthday/Anniversary:
   - Birthday email annually
   - Subscriber anniversary
   - Customer milestone

3. Resend to non-openers:
   - Auto-resend logic
   - Different subject
   - Engagement-based
```

### 11.2 Per EmailVendorSelection critique

> _"You still don't get custom automations, only three pre-built workflows. For the cost of the Standard plan, this is a glaring omission."_

⚠️ **3 pre-built = málo** vs. konkurence MailerLite 7+, Klaviyo 100+.

### 11.3 Multi-step builder limitations

```
Standard builder reality:
- Linear sequences
- Time-based delays
- Send-based triggers
- No behavior triggers
- No conditional branching
- No visual workflow editor (basic)
- No dynamic paths
   ↓
Beginner-friendly but limited
```

---

## 12. Custom Automation (Premium-only)

### 12.1 Premium automation

Per Mailsoftly:

> _"Premium unlocks what Constant Contact calls 'advanced automation,' including dynamic content and more complex trigger conditions."_

```
Premium automation features:

TRIGGERS:
- Subscriber events (signup, etc.)
- Date-based (birthday, anniversary)
- Behavioral (clicked, opened)
- Ecommerce (purchase, abandoned cart)
- Custom events (API)
- List membership

ACTIONS:
- Send email
- Send SMS (US only)
- Wait/delay
- Add tag
- Update field
- Move to segment
- Webhook trigger

CONDITIONS:
- If/then logic
- Multiple paths
- Conditional content
- Dynamic content blocks
- A/B test paths

INTEGRATIONS:
- Shopify (cart/purchase)
- WooCommerce
- Salesforce
- HubSpot
```

### 12.2 Visual flow builder

```
Premium flow builder:
- Visual drag-drop interface
- Multi-step workflows
- Branching logic
- A/B test paths
- Goal tracking
- Performance metrics
- Pause/resume controls
- Clone existing flows
```

### 12.3 Vs. konkurence

```
Premium tier ($80/mo) comparison:

Constant Contact Premium:
- "Advanced automation"
- Dynamic content
- 24x send capacity

Klaviyo Email ($60+/mo for 5K):
- 100+ pre-built flows
- Predictive analytics
- Dynamic content all tiers
- Revenue attribution

ActiveCampaign Plus ($70/mo for 5K):
- 500+ recipes
- Best-in-class builder
- CRM integration
- Lead scoring
   ↓
CC Premium = "OK but not great"
```

⚠️ **CC Premium za $80 nabízí méně automatizace** než Klaviyo/AC za podobnou cenu.

---

## 13. Event Management Flow (KEY!)

### 13.1 Per EmailVendorSelection

> _"Has event management and SMS marketing: Constant Contact goes beyond email with integrated event management."_

> _"You run and promote events. Constant Contact's event marketing tools are an interesting functionality if you run online and in-person events."_

### 13.2 Event Creation flow

```
Event setup workflow:

1. Events → Create new event
2. Event details:
   - Name + description
   - Date + time + timezone
   - Location (physical or virtual)
   - Capacity (optional)
   - Multiple sessions (if recurring)

3. Registration form:
   - Standard fields (name, email)
   - Custom fields (dietary, etc.)
   - Required vs. optional
   - Group registration option

4. Pricing setup:
   - Free OR paid event
   - Multiple ticket tiers
   - Pricing (Standard adult, Student, VIP)
   - Discount codes
   - Stripe integration (for payments)

5. Landing page:
   - Auto-generated event page
   - Custom URL
   - SEO settings
   - Social sharing buttons
   - Embed code (for website)

6. Promotion:
   - Email campaign
   - Social posts
   - SMS reminder (US)
   - Facebook event sync

7. Activation
   ↓
Event LIVE for registration
```

### 13.3 Registration flow (attendee perspective)

```
Attendee perspective:

1. Receive event email
2. Click registration link
3. Land on event page
4. View details + pricing
5. Click "Register Now"
6. Fill form:
   - Name, email, phone
   - Custom fields
7. Select ticket type
8. Payment (if paid):
   - Stripe checkout
   - Credit card
   - Apple/Google Pay
9. Confirmation:
   - Confirmation email auto
   - Calendar invite (.ics file)
   - Add to wallet (mobile)
10. Pre-event reminders:
    - 1 týden před: reminder
    - 1 den před: final reminder
    - Day-of: location/link
```

### 13.4 Event Day flow

```
Event day workflow:

PRE-EVENT (1 hour before):
- Check-in setup
- Final guest list
- Walk-in capacity

CHECK-IN:
- Mobile app or web
- Search guest by name/email
- Check-in tap
- Print badge (if integration)
- Track attendance real-time

DURING EVENT:
- SMS update if changes (US)
- Photo capture
- Notes/feedback

POST-EVENT:
- Thank you email (auto)
- Feedback survey (auto)
- Photo gallery share
- Add to general newsletter
- Follow-up nurture sequence
```

### 13.5 Use case patterns

```
Real estate open house:
- Recurring weekly events
- Multiple property tours
- Group invites
- Lead capture
- Follow-up automation

Nonprofit fundraiser:
- Annual gala
- Multiple ticket tiers
- Silent auction integration
- Sponsorship tracking
- Tax receipts
- Donor follow-up

Workshop / Training:
- Multi-session series
- Recurring registrations
- Certificate issuance
- Course material delivery
- Refresher invitations

Community event:
- Free registration
- Capacity management
- Volunteer signup
- Sponsor visibility
```

### 13.6 Event reporting

```
Event metrics:
- Registrations over time
- Revenue (if paid)
- Conversion rate (page views → registrations)
- Source attribution (email vs. social)
- Demographics (per fields)
- Show-up rate (registered vs. attended)
- Post-event survey results
```

### 13.7 Why Event Management = KEY

```
Event Management impact:
- Switching cost (replacement = multiple tools)
- Integrated billing (one bill)
- Single source of truth (contacts)
- Email + event in one workflow
- Stripe payment processing built-in
- Calendar integration auto
- Marketing CRM unified
   ↓
Often THE reason CC chosen over Mailchimp
```

⚠️ **Event Management = retention driver** Constant Contactu.

---

## 14. Landing Page + Forms Flow

### 14.1 Landing page builder

```
Landing page creation:

1. Pages → New landing page
2. Template selection (50+ templates)
3. Drag-drop building:
   - Hero section
   - Lead form
   - Value props
   - Testimonials
   - CTA
   - Footer
4. Mobile responsive auto
5. Custom URL or subdomain
6. SEO settings (Premium)
7. Tracking setup (Google Analytics, FB Pixel)
8. A/B testing (Standard+)
9. Publish
```

### 14.2 Form types

Per EmailVendorSelection:

> _"Strong list-building options with 200+ forms and lead magnets."_

```
Form types available:

INLINE FORMS:
- Embed on website
- Match site styling
- Multiple per page

POP-UP FORMS:
- Delay triggered
- Exit intent
- Scroll-based
- Page-specific

SLIDE-IN:
- Bottom corner
- Less intrusive
- Better UX

WELCOME MAT:
- Full-screen takeover
- High conversion
- New visitors

FLOATING BAR:
- Top or bottom
- Persistent
- Always visible

TWO-STEP OPT-IN:
- Click first → email second
- Higher completion
- Lower commitment

MULTI-STEP:
- Progressive disclosure
- Higher completion
- Lead qualification
```

### 14.3 Form-to-automation flow

```
Form submission flow:

1. Visitor fills form
2. Form data → Constant Contact
3. Contact added (or updated)
4. Tags assigned (per form)
5. Segment membership updated
6. Welcome automation triggered
7. Confirmation email
8. Thank you page
9. Optional: lead scoring update
10. CRM sync (if integrated)
```

### 14.4 Lead magnets

```
Lead magnet capabilities:
- Free downloads (PDF, ebook)
- Discount code generation
- Free shipping codes
- Member-only content
- Webinar registration
- Resource library access
- Newsletter subscription
- Event early-bird access
```

---

## 15. Social Media Posting Flow

### 15.1 Social posting

Per oficiální:

> _"Put your business out there the easy way. Turn emails into social posts, share content to multiple platforms in a flash."_

```
Social posting flow:

1. Create post (or convert from email)
2. Add content:
   - Text caption
   - Image / video
   - Link
3. Select channels:
   - Facebook (Page)
   - Instagram (Business)
   - LinkedIn (Company)
4. Schedule:
   - Immediate
   - Scheduled time
   - Best time recommendations
5. Cross-channel preview
6. Publish / Schedule
```

### 15.2 Email → Social conversion

```
Auto-convert flow:

1. Email created
2. "Share to social" option
3. Auto-extract:
   - Subject as headline
   - Hero image
   - Key copy points
   - CTA link
4. Optimize per channel:
   - FB: longer text OK
   - IG: visual-first
   - LinkedIn: professional tone
5. Preview each
6. Schedule together or separately
   ↓
One email = multiple social posts
```

### 15.3 Social Inbox (Premium)

```
Social Inbox features:
- Unified comment view
- Mentions tracking
- Reply from CC
- Customer service
- Engagement metrics
- Sentiment analysis (limited)
```

### 15.4 Reporting

```
Social reporting:
- Reach
- Engagement rate
- Clicks (back to website)
- Conversions (if tracked)
- Best performing posts
- Optimal timing
- Hashtag performance
```

---

## 16. SMS Marketing Flow (jen US)

### 16.1 SMS setup

```
SMS setup (US only):

Prerequisites:
- US phone numbers in database
- TCPA-compliant opt-in
- Standard ($10 add-on) or Premium tier
- US business

Setup:
1. Get dedicated short code or long code
2. SMS opt-in flow
3. Compliance language
4. Quiet hours setup
5. Frequency caps
6. Opt-out automatic ("STOP")
```

### 16.2 SMS campaign flow

```
SMS send flow:

1. New SMS campaign
2. Audience: SMS-eligible contacts
3. Compose:
   - 160 chars (1 SMS)
   - Personalization
   - URL shortener (track clicks)
4. Compliance:
   - Sender ID
   - "Reply STOP" included
5. Test send (test number)
6. Schedule / Send
7. Tracking:
   - Delivery
   - Clicks
   - Opt-outs
```

### 16.3 Pricing

```
SMS costs:

Lite plan:
- ❌ No SMS

Standard plan:
- Add-on: $10/měsíc for 500 SMS
- Beyond: location-dependent pricing

Premium plan:
- 500 SMS included
- Beyond: location-dependent
- Additional blocks available
```

### 16.4 Use cases (US)

```
SMS effective for:
- Event reminders (24h, 1h before)
- Flash sales (urgent)
- Order confirmations
- Appointment reminders
- Donation drives
- VIP exclusive offers
- Real estate showings
- Customer service alerts
```

### 16.5 International limit

```
SMS limitation:
- ✅ USA only
- ❌ EU/UK
- ❌ Canada
- ❌ APAC
   ↓
For international:
- Brevo (global SMS)
- Klaviyo (global)
- Twilio direct
```

---

## 17. Segmentace + Dynamic Content (Premium)

### 17.1 Segmentation tier comparison

```
Per tier segmentation:

LITE:
- Basic tags
- List-based
- 1 simple segment

STANDARD:
- Engagement-based
- Tag combinations
- Behavioral segmentation (basic)
- Custom field segmentation
- Multiple segments

PREMIUM:
- Advanced segmentation
- Dynamic content per segment
- Marketing CRM unified
- Behavioral + transactional
- Revenue-based segments
- Predictive (limited)
```

### 17.2 Segment creation flow

```
Segment builder:

1. Audience → New segment
2. Define conditions:
   - Contact field equals X
   - Tag is Y
   - Activity in last Z days
   - Purchase history (Premium)
3. AND / OR combinations
4. Preview count
5. Save segment
6. Auto-update real-time
7. Use in campaigns / automation
```

### 17.3 Dynamic Content (Premium-only)

Per oficiální:

> _"Dynamic content blocks allow you to customize emails by showing or hiding content based on a recipient's contact details like city, state, job title, or other custom fields."_

```
Dynamic content flow:

1. Email block in editor
2. Add dynamic conditions:
   - If city = Boston → show A
   - If city = NYC → show B
   - Else → show default
3. Multiple conditions per block
4. Preview per persona
5. Test sends
6. Live deployment
   ↓
Per-recipient content automatic
```

### 17.4 Use case dynamic content

```
Geographic personalization:
- City-specific offers
- State compliance variations
- Regional events

Industry personalization:
- B2B job title content
- Industry-specific messaging
- Use case examples

Customer tier:
- VIP exclusive content
- Loyalty tier benefits
- Member-only sections

Purchase history:
- Cross-sell relevant
- Upgrade nudge
- Re-purchase reminder
```

---

## 18. AI Writing Assistant Flow

### 18.1 AI flow

```
AI Writing flow:

1. In editor → click "AI Writing"
2. Input prompt:
   - "Generate email for summer sale"
   - "Welcome series first email"
   - "Event invitation copy"
3. Options:
   - Tone (casual, formal, urgent)
   - Length (short, medium, long)
   - Style (informative, persuasive)
4. Generate
5. Multiple variations (3-5)
6. Choose best
7. Edit / refine
8. Apply to email
```

### 18.2 AI Content Recommendations (Premium)

```
AI Recommendations flow:

1. Premium dashboard
2. AI analyzes:
   - Past campaign performance
   - Audience behavior
   - Industry benchmarks
3. Suggestions:
   - Best send times
   - Subject line optimizations
   - Content topics
   - Audience targeting
4. Apply suggestions
5. Continuous learning
```

### 18.3 AI Multichannel Planner (Premium)

```
Planner flow:

1. Define campaign goal
2. AI suggests:
   - Channel mix (email + SMS + social)
   - Timing sequence
   - Content variations
   - Audience segments
3. Review + approve
4. Auto-create campaigns
5. Track performance unified
6. AI optimization continuous
```

### 18.4 AI maturity check

Per Ecommerceparadise:

> _"In 2025 and 2026, Constant Contact has added AI tools (AI copy generator, AI-driven content recommendations, multichannel campaign planner)."_

⚠️ **AI = recent addition** (2025-2026), catch-up s konkurencí (Klaviyo, Brevo AI-native).

---

## 19. Google Ads + Facebook Ads (Premium)

### 19.1 Google Ads sync

```
Google Customer Match flow:

1. Premium tier → Ad Manager
2. Connect Google Ads account
3. Select segment in CC
4. Sync to Google Customer Match
5. Hash matching (~50-70% match rate)
6. Use in Google campaigns:
   - Search ads
   - Display
   - YouTube
   - Discover
7. ROI tracking back to CC
```

### 19.2 Facebook/Meta Ads sync

```
Meta Ads sync flow:

1. Premium tier → Ad Manager
2. Connect Facebook Business Manager
3. Select segment
4. Sync to Custom Audience
5. Use in FB / Instagram campaigns:
   - Retargeting non-openers
   - Lookalike audiences
   - Lead Ads → CC
6. Cross-channel attribution
```

### 19.3 Cross-channel use case

```
Retargeting non-engagers:

1. Email campaign sent
2. Track engagement (opens, clicks)
3. Auto-segment "non-engagers"
4. Sync to FB + Google
5. Display ads to non-engagers
6. Search ads if they Google brand
7. Extended reach: +25-40%
   ↓
Premium only!
```

---

## 20. Ecommerce Integration (Shopify, WooCommerce)

### 20.1 Shopify integration flow

```
Shopify connection:

1. CC → Integrations → Shopify
2. OAuth authentication
3. Permission grants:
   - Products
   - Customers
   - Orders
   - Inventory
4. Sync inicialization:
   - Historical orders import
   - Customer database import
   - Product catalog sync
5. Real-time ongoing sync
6. Setup automatic workflows (Premium):
   - Abandoned cart
   - Post-purchase
   - Browse abandonment
   - Win-back
```

### 20.2 Ecommerce features per tier

```
Tier breakdown:

LITE:
- Basic product import
- Newsletter mentions

STANDARD:
- Product blocks v emailech
- Basic ecommerce data
- Conversion tracking

PREMIUM (full ecommerce):
- Ecommerce templates auto
- Abandoned cart automation
- Browse abandonment
- Post-purchase sequences
- Revenue attribution
- Dynamic content per customer
- Product recommendations
- Win-back automation
```

### 20.3 Per Mailsoftly critique

> _"Product recommendation engines, abandoned cart sequences with dynamic content, and revenue attribution are only available on the Premium plan."_

⚠️ **Klíčové ecommerce features = Premium-only** = $80+/mo.

### 20.4 DTC ecommerce reality

```
DTC ecommerce comparison:

CC Premium ($80+ for 500 contacts):
- Basic ecommerce features
- Limited automation
- Bez predictive analytics

Klaviyo Email ($20 for 500 contacts):
- Ecommerce native
- 100+ pre-built flows
- Predictive analytics
- Revenue attribution
- Better Shopify integration

Mailchimp Standard ($20+):
- Decent ecommerce features
- Better automation
- Lower price point
   ↓
Pro serious ecommerce → Klaviyo / Mailchimp better
```

---

## 21. Reporting + Analytics

### 21.1 Reporting hierarchy

```
Per tier reporting:

LITE:
- Open / click rates
- Delivery / bounce
- Unsubscribe rates
- Basic by campaign

STANDARD:
- Drill-down per campaign
- Behavior tracking
- A/B test results
- Segment performance
- Heatmaps (limited)

PREMIUM:
- Revenue attribution
- Multi-touch attribution
- Custom reports
- Real-time dashboards
- Cohort analysis (basic)
- Benchmarking
```

### 21.2 Per campaign metrics

```
Standard campaign metrics:
- Sent count
- Delivered count
- Open rate
- Click-through rate
- Conversion rate (Premium)
- Bounce rate
- Unsubscribe rate
- Spam complaint rate
- Revenue (Premium)
- ROI (Premium)
```

### 21.3 Per Sonary

> _"Marketers and business owners can keep track of major metrics like open, delivery, and conversion rates, all in one place. Furthermore, they can monitor their ecommerce activities within the reporting and analytics section of Constant Contact in real-time."_

### 21.4 Reporting limitations

```
Reporting gaps:
- Limited custom dashboards
- Cohort analysis basic
- Export options limited
- Predictive analytics minimal
- vs. Klaviyo/Mailchimp = weaker
```

---

## 22. Phone Support Workflow

### 22.1 Phone support flow

```
Customer calls support:

1. Customer dials 877-358-5969 (US)
2. IVR menu navigation
3. Route to:
   - Billing
   - Technical support
   - Marketing advisor (Premium)
   - Account management
4. Agent (human!) picks up
5. Account lookup
6. Issue diagnosis
7. Resolution:
   - In-call resolution
   - Email follow-up
   - Escalation if needed
8. Confirmation + ticket number
```

### 22.2 Support tiers

```
Support availability:

LITE:
- Phone: 6 dní v týdnu
- Email
- Live chat (limited)
- Self-service KB

STANDARD:
- Phone: 6 dní v týdnu
- Email
- Live chat
- Faster response

PREMIUM:
- Priority phone (jump queue)
- Marketing advisors
- Strategy sessions
- 1-on-1 onboarding
- Email + live chat
```

### 22.3 Phone hours

```
Phone hours (USA timezone):
- Po-Pá: 8am-9pm ET
- So: 9am-6pm ET
- Ne: closed
- Holidays: limited hours
```

⚠️ **Pro non-USA timezone = limit** (no 24/7).

### 22.4 Phone vs. competition

```
Phone support comparison:

Constant Contact: ✅ All paid plans
Mailchimp: enterprise only
MailerLite: limited
Brevo: limited
ActiveCampaign: limited
HubSpot: paid plans
Klaviyo: enterprise only
GetResponse: yes on paid
   ↓
CC = best phone support in SMB email marketing
```

### 22.5 Per Sonary user

> _"Whenever I go to a new company, I take Constant Contact with me. It is useful for the basics and does them very well."_

> _"There are tools that require entire teams to manage then there's Constant Contact."_

⚠️ **Phone support + ease of use** = stickiness drivers.

---

## 23. Nonprofit Verification + 30% Discount

### 23.1 Verification flow

```
Nonprofit verification:

1. Sign up for free trial
2. Request nonprofit pricing
3. Provide:
   - 501(c)(3) IRS letter
   - Tax exemption documentation
   - Organization details
4. Verification team review (1-3 days)
5. Approval
6. Discount applied to account
7. Renewal verification annually
```

### 23.2 Discount structure

```
Nonprofit pricing:

Prepay 12 months:
- For-profit: up to 15% off
- Nonprofit: up to 30% off

Prepay 6 months:
- For-profit: smaller discount
- Nonprofit: smaller discount

Monthly billing:
- Standard rates
- No prepay savings
```

### 23.3 Nonprofit-specific features

```
Nonprofit benefits:
- Discount up to 30%
- Donor segmentation
- Donation tracking integration
- Fundraising email templates
- Event management (galas, fundraisers)
- Tax receipt automation
- Annual giving campaigns
- Volunteer coordination
- Community engagement focus
```

### 23.4 Use case nonprofits

```
Annual fundraising flow:

JAN - Annual planning
   ↓
APR - Spring appeal email
   ↓
MAY - Volunteer recruitment
   ↓
JUN - Mid-year event (fundraiser gala)
   ↓
SEP - Back to school campaigns
   ↓
NOV - Giving Tuesday campaign
   ↓
DEC - Year-end appeal (heavy)
   ↓
JAN - Tax receipts auto-sent
```

---

## 24. Auto-upgrade trap mechanika

### 24.1 Trap mechanism

Per Mailsoftly:

> _"Constant Contact automatically upgrades you to the next contact tier mid-billing-cycle. This happens without a confirmation prompt."_

> _"For example, going from 5,000 to 5,001 contacts on the Lite plan jumps your bill from $80/mo to $120/mo."_

### 24.2 Flow

```
Auto-upgrade flow:

1. User on Lite plan ($80/mo at 5000 contacts)
2. Adds new contacts (via signup, import)
3. Contact count: 5 001 (1 over!)
4. CC automatically:
   - Detects threshold crossed
   - Mid-cycle adjustment
   - Bill jumps to $120/mo
   - NO confirmation prompt
   - NO advance warning
5. User sees larger bill
6. Surprise!
   ↓
NO way to opt-out auto-upgrade
```

### 24.3 Send limit trap

Per CheckThat.ai:

> _"If you exceed your email send limit for two consecutive months, Constant Contact automatically upgrades you to a higher tier without asking."_

```
Send limit auto-upgrade:

Month 1: User exceeds send limit
   ↓ overage fee $0.002/email
Month 2: User exceeds again
   ↓ CC auto-upgrades to higher tier
Month 3: User pays for new tier (without knowing why)
```

### 24.4 Way to return to lower tier

Per Mailsoftly:

> _"The only way to return to a lower tier is to reduce your contact count below the threshold and wait for the next billing cycle."_

```
Downgrade process:
1. Reduce contact count below threshold
2. Wait for next billing cycle
3. Auto-downgrade (eventually)
4. Re-evaluate monthly
   ↓
Friction = retention!
```

⚠️ **Auto-upgrade trap = strategic revenue tool** Constant Contactu.

### 24.5 Strategy to avoid

```
Anti-trap strategy:
- Monitor contact count weekly
- Set internal alerts (90% of limit)
- Remove inactive subscribers regularly
- Plan list growth strategically
- Consider Premium tier proactively
- Annual prepay (more stable pricing)
- Document plan in writing
```

---

## 25. Cancellation Flow (phone-only friction!)

### 25.1 Per EmailVendorSelection

> _"Hard to cancel: Many users report difficulties cancelling their Constant Contact subscription. You have to call customer service and talk to them to cancel."_

### 25.2 Cancellation flow

```
Cancellation steps:

1. User decides to cancel
2. Cannot self-cancel online
3. Must call: 877-358-5969
4. Business hours only (no weekends)
5. Phone wait (5-10 min typical)
6. Retention agent (trained)
7. Retention attempts:
   - "Why are you leaving?"
   - "Let me offer discount"
   - "Try Standard instead"
   - "Pause account instead"
   - "Custom plan possible"
8. If firm:
   - Cancellation processed
   - Confirmation number
   - Email confirmation
9. Refund (if in 30 days):
   - Full refund possible
10. Account access until end of period
```

### 25.3 Per Ecommerceparadise critique

> _"The rating reflects the platform's real competitive position in 2026: it charges premium prices for a feature set that the broader market has moved beyond, lacks a permanent free plan, and makes cancellation unnecessarily difficult."_

⚠️ **Cancellation friction = retention strategy**.

### 25.4 Pro-tipy

```
Successful cancellation:
- Call during business hours (faster)
- Be direct ("I want to cancel")
- Decline retention offers if firm
- Get confirmation number
- Verify next billing won't occur
- Save email confirmation
- Watch credit card statement
- Cancel via card issuer if needed
```

### 25.5 30-day money-back guarantee

```
Refund eligibility:
- Within 30 days of signup
- Full refund
- No questions asked
- Cancel via phone
- Account closed
   ↓
Important safety net
```

⚠️ **Po 30 dnech = no prorated refund**.

---

## 26. Datová mapa: co vidí kdo

| Data                  | Account owner | User (per role) | End subscriber | Event registrant | CC support | Sales team | Retention team | API client |
| --------------------- | :-----------: | :-------------: | :------------: | :--------------: | :--------: | :--------: | :------------: | :--------: |
| Account settings      |      ✅       |      view       |       ❌       |        ❌        | s consent  | s consent  |       ❌       | per scope  |
| Billing               |      ✅       |       ❌        |       ❌       |        ❌        | s consent  | s consent  |   s consent    |     –      |
| User management       |      ✅       |       ❌        |       ❌       |        ❌        | s consent  |     ❌     |       ❌       | per scope  |
| Contacts              |      ✅       |       ✅        |  own profile   |        ❌        | s consent  |     ❌     |   s consent    |     ✅     |
| Lists & Segments      |      ✅       |       ✅        |       ❌       |        ❌        | s consent  |     ❌     |       ❌       | per scope  |
| Campaigns             |      ✅       |       ✅        |       ❌       |        ❌        | s consent  | s consent  |   s consent    | per scope  |
| Automation            |      ✅       |       ✅        |       ❌       |        ❌        | s consent  | s consent  |       ❌       | per scope  |
| Templates             |      ✅       |       ✅        |       ❌       |        ❌        | s consent  |     ❌     |       ❌       | per scope  |
| Events                |      ✅       |       ✅        |      view      | own registration | s consent  |     ❌     |       ❌       | per scope  |
| Forms & Landing Pages |      ✅       |       ✅        |      view      |       view       | s consent  |     ❌     |       ❌       | per scope  |
| Reports               |      ✅       |       ✅        |       ❌       |        ❌        | s consent  | s consent  |   s consent    | per scope  |
| Integrations          |      ✅       |      view       |       ❌       |        ❌        | s consent  | s consent  |       ❌       |     –      |
| BrandKit              |      ✅       |      view       |       ❌       |        ❌        | s consent  |     ❌     |       ❌       |     –      |
| Social posts          |      ✅       |       ✅        |      view      |        ❌        | s consent  |     ❌     |       ❌       | per scope  |
| SMS                   |   ✅ (Std+)   |    ✅ (Std+)    |      own       |        ❌        | s consent  | s consent  |   s consent    | per scope  |
| Domain authentication |      ✅       |      view       |       ❌       |        ❌        | s consent  |     ❌     |       ❌       |     –      |
| Audit logs            |      ✅       |       ❌        |       ❌       |        ❌        | s consent  |     ❌     |   s consent    |     –      |
| Stripe (Events)       |      ✅       |      view       |       ❌       | own transactions | s consent  |     ❌     |       ❌       |     –      |

---

## 27. Známé úzkoprofilové místa

### 27.1 Free plan zrušen (June 2025)

```
Pre-June 2025: free plan available
Post-June 2025: ❌
   ↓
Higher barrier to entry
Lost low-end customers
Strategic shift to revenue focus
```

### 27.2 Pricing aggressive scaling

```
Lite plan:
- 500 → 1000 kontaktů: $12 → $50 (+317%!)
- Punishes growth
- Forces tier upgrade
```

### 27.3 Auto-upgrade trap

```
Friction:
- No confirmation
- Mid-cycle adjustment
- Surprise bills
- Difficult downgrade
   ↓
Frustration pattern
```

### 27.4 Hard to cancel

```
Cancellation:
- Phone-only
- Retention attempts
- Friction by design
- No self-serve
   ↓
Negative UX
```

### 27.5 Slabší automatizace

```
Lite: 1-step only
Standard: 3 workflows
Premium: $80+ for "advanced"
   ↓
MailerLite $10 nabízí více
Brevo $9 nabízí více
ActiveCampaign $15 nabízí mnohem více
```

### 27.6 Premium pricing pro mid-tier features

Per Ecommerceparadise:

> _"It charges premium-tier prices while delivering a feature set that the broader market now treats as mid-tier."_

### 27.7 SMS jen USA

```
SMS limit:
- US only
- Žádný EU/UK/CZ/PL
- Žádný international scale
   ↓
Non-US business = problem
```

### 27.8 Dynamic content Premium-only

```
Dynamic content gating:
- Premium $80+
- Konkurence (MailerLite, Brevo) na Starter
   ↓
SMB unable to personalize without Premium
```

### 27.9 Overage fees + hidden costs

```
Hidden costs:
- Overage emails: $0.002
- Inbox preview: $10
- SMS add-on: $10
- Premium template library: extra
- Real cost: 2-3× sticker
```

### 27.10 Aging interface (relative)

```
Interface modernity:
- Improved 2025-2026
- But still feels dated
- vs. modern MailerLite/Brevo
- Functional but less polished
```

### 27.11 AI catch-up mode

```
AI tools:
- Added 2025-2026
- Not AI-native
- vs. Brevo, Klaviyo AI-foundation
- Catching up
```

### 27.12 Limited B2B features

```
B2B gaps:
- No lead scoring
- No CRM pipeline
- No sales sequences
- No multi-touch attribution
   ↓
B2B = HubSpot / ActiveCampaign better
```

### 27.13 Reporting depth limited

```
Reporting gaps:
- Custom dashboards limited
- Cohort analysis basic
- Predictive minimal
- vs. Klaviyo analytics
```

### 27.14 Pre-built workflows: jen 3 (Standard)

```
Standard tier $35/mo:
- 3 pre-built workflows ONLY
- vs. MailerLite 7+
- vs. Klaviyo 100+
- vs. ActiveCampaign 500+
   ↓
Glaring omission per reviews
```

### 27.15 Sales pressure pro Premium

```
Upgrade pressure:
- Sales calls frequently
- "Need automation? Upgrade!"
- "Dynamic content? Premium!"
- Features aggressively gated
   ↓
User frustration pattern
```

### 27.16 Mobile app basic

```
Mobile app:
- Quick monitoring OK
- Limited campaign creation
- Automation basic
- Web-first design
```

### 27.17 Není pro DTC ecommerce serious

```
DTC reality:
- Klaviyo lepší (price + features)
- Mailchimp lepší ecommerce
- Omnisend lepší DTC focus
   ↓
Migration pattern: CC → Klaviyo common
```

### 27.18 30+ years = legacy debt

```
Legacy considerations:
- Long history = trust
- ALE: legacy code
- ALE: legacy UX patterns
- ALE: aging architecture
   ↓
Modernization in progress 2025-2026
```

### 27.19 Limited mezinárodní

```
International limits:
- USA-focused
- SMS US-only
- Phone support USA timezone
- GDPR compliant but EU-secondary
   ↓
For international = Brevo / Mailchimp lepší
```

### 27.20 Není CDP

```
CDP gaps:
- Not unified customer data platform
- Limited data orchestration
- Email-tool + light CRM
   ↓
Pro data-driven = Bloomreach / Klaviyo / SALESmanago
```

---

## 28. Doporučení pro design vlastních procesů

### Pro Constant Contact users obecně:

1. **60denní trial = test thoroughly** before committing
2. **Decide tier carefully** – Lite vs. Standard vs. Premium significant differences
3. **Monitor contact count weekly** – avoid auto-upgrade trap
4. **Set internal threshold alerts** (90% of plan limit)
5. **Annual prepay = 15% off** (or 30% nonprofit) – significant savings
6. **Clean list regularly** – remove inactives (avoid contact tier creep)
7. **BrandKit setup early** – consistent across templates
8. **Domain authentication required** – for 97% deliverability
9. **Phone support proactively** – use for strategy, not just issues
10. **Track all hidden costs** – budget realistically (2-3× sticker)
11. **Document cancellation procedure** – avoid surprise renewal
12. **Use 30-day money-back guarantee** if not satisfied
13. **Event management = differentiator** – leverage if applicable
14. **Resend to non-openers** – key feature, use consistently
15. **AI Writing Assistant** – speed campaign creation
16. **Test before send** – inbox preview ($10 extra) worth it for important sends
17. **Segment for relevance** – higher engagement, lower unsubscribe
18. **A/B test subject lines** – Standard+ tier, low effort high impact
19. **Social posting integration** – multiply content reach
20. **Annual review of plan fit** – ensure not overpaying

### Pro nonprofits specifically:

1. **Apply for nonprofit discount immediately** (up to 30% off)
2. **Annual prepay = compounded savings**
3. **Event management = critical** – fundraisers, galas, community
4. **Donor segmentation** – RFM equivalent for donations
5. **Tax receipt automation** – year-end critical
6. **Volunteer coordination** – use platform
7. **Annual appeal automation** – November/December heavy
8. **Giving Tuesday campaigns** – special focus
9. **Community newsletter** – consistent monthly cadence
10. **Donor journey mapping** – first gift → recurring

### Pro real estate businesses:

1. **Event management = open houses!** – key use case
2. **Property updates email** – automation
3. **Market reports** – monthly newsletter
4. **Past client newsletter** – referrals
5. **Lead nurturing** – property-specific
6. **Geographic segmentation** – local relevance
7. **Phone support = critical** for non-technical agents
8. **Mobile app** – on-the-go check-in

### Pro event organizers:

1. **Event Management = primary** – CC excels here
2. **Multi-event coordination** – series setup
3. **Pre-event automation** – reminders critical
4. **Post-event follow-up** – feedback, photos
5. **Sponsor coordination** – tracking
6. **Volunteer signup forms** – built-in
7. **Capacity management** – wait lists
8. **Payment processing** – Stripe integrated

### Pro ecommerce (small scale):

1. **Evaluate Klaviyo first** – often better for ecommerce
2. **CC if other features matter** (events, etc.)
3. **Premium tier required** – for full ecommerce features
4. **Shopify integration setup**
5. **Abandoned cart automation** – Premium
6. **Post-purchase sequence** – Premium
7. **Revenue attribution** – Premium
8. **Consider migration** if outgrowing

### Avoid Constant Contact if:

- Need permanent free plan
- Heavy automation required
- DTC ecommerce serious
- International primary
- Mobile-first business
- AI-driven personalization
- B2B SaaS
- Cost-sensitive growth
- Czech/Slovak/Polish/German trh primary
- WhatsApp/RCS need

---

_Dokument zpracován z oficiálních zdrojů constantcontact.com (Pricing, Premium, About), G2 reviews, EmailVendorSelection (12/2025), Sender.net Review (1/2026), Flowium (1/2026), Mailsoftly (4/2026), CheckThat.ai (3/2026), Ecommerceparadise Review (4/2026). Pro nejaktuálnější detaily je nutný kontakt s Constant Contact (877-358-5969) nebo registrace 60denního zkušebního účtu._
