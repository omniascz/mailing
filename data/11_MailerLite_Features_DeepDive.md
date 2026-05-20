# MailerLite – hloubková analýza funkcí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Zdroje:** oficiální dokumentace mailerlite.com/help, mailerlite.com/pricing, mailerlite.com/features + analytické weby (EmailToolTester, EmailVendorSelection, Sender, ThatMarketingBuddy, CostBench, Mailotrix, Sprout24, SendX) ověřené v dubnu–květnu 2026.
**Rozsah:** kompletní funkcionalita platformy v roce 2026 – Email Marketing, Automation, Landing Pages, Websites, Forms & Popups, Surveys & Quizzes, Digital Products, Paid Newsletters + samostatný MailerSend pro transactional email.

> **Důležitý kontext:** MailerLite je litevského původu (Vilnius, založeno 2010 jako bootstrapped startup, později akvizirovaný za **~€90M**). Jeden z **nejštědřejších freemium plánů v industry** + **transparentní pricing**. Zaměření na **solopreneurs, content creators, malé a střední firmy**.
>
> **Klíčový pivot 2025:** V září 2025 MailerLite **snížil free plan z 1 000 na 500 subscribers** (effectively dvojnásobně zvýšil náklady pro malé tvůrce). Současně proběhla akvizice **FreshMail (Polsko)** v únoru 2025 – existing FreshMail customers byly migrovány na MailerLite, což posílilo evropskou přítomnost.
>
> **Filozofie:** "Keep it Lite" – designovat **powerful products without compromising usability**. UI/UX patří mezi nejlepší v industry.

---

## Obsah

1. [Co je MailerLite a pro koho je](#1-co-je-mailerlite)
2. [Tarify a cenová struktura](#2-tarify)
3. [Subscriber-based pricing](#3-pricing-model)
4. [FreshMail akvizice a evropská strategie](#4-freshmail)
5. [Lists, Subscribers, Groups, Segments](#5-contacts-segmentation)
6. [Email Marketing & Campaigns](#6-email-campaigns)
7. [Drag-and-drop Editor a Templates](#7-editor-templates)
8. [Marketing Automation Workflows](#8-automation)
9. [Forms, Popups, Surveys & Quizzes](#9-forms-popups)
10. [Landing Pages](#10-landing-pages)
11. [Websites Builder](#11-websites)
12. [Digital Products & Paid Newsletters](#12-digital-products)
13. [E-commerce features](#13-ecommerce)
14. [AI Writing Assistant a AI features](#14-ai-tools)
15. [MailerSend (separate transactional)](#15-mailersend)
16. [Reports & Analytics](#16-reports)
17. [Deliverability & Authentication](#17-deliverability)
18. [API, Integrace, App Marketplace](#18-api-integrace)
19. [Compliance, GDPR, EU hosting](#19-compliance)
20. [Limity a nedostatky](#20-limity)

---

## 1. Co je MailerLite

- **Společnost:** MailerLite, UAB
- **HQ:** **Vilnius, Litva** (Lithuania) – primary, + offices remote napříč světem
- **Vznik:** **2010** jako bootstrapped start-up
- **Co-founder:** Ilma Tiki (autorka knihy "Leaving the Basecamp" – o cestě k €90M akvizici)
- **Akvizice:** ~**€90M** (přesné datum a kupec ne vždy veřejně potvrzeno; firma operuje samostatně)
- **Velikost:** **1.5 milionu+ uživatelů globálně** (claim 2026)
- **Pozice:** **affordable email marketing pro solopreneurs a malé firmy** – kvalitní free plan, transparentní pricing, intuitivní UI
- **Lokalizace UI:** angličtina + multilingual self-service help (po FreshMail akvizici: **angličtina, španělština, polština**). UI samotné v podstatě anglické s ad-hoc překlady, **ne tak rozsáhlá lokalizace** jako GetResponse. **Čeština ani slovenština v UI nejsou.**

### Filozofie produktu

MailerLite's marketing claim: _"Keep it Lite"_ – **focus on usability**, ne kvantita features. Mnozí marketers volí MailerLite právě proto, že je **jednodušší než Mailchimp/HubSpot**.

```
┌─────────────────────────────────────────────────────────────────┐
│                  MAILERLITE PLATFORM                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Email Marketing│  │ Automation   │  │ Forms & Popups  │      │
│  │ Campaigns      │  │ Workflows    │  │ Surveys, Quizzes│      │
│  │ RSS, Auto-resend│ │              │  │                 │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Landing Pages  │  │ Websites     │  │ Digital Products│      │
│  │                │  │ (Builder +   │  │ + Paid          │      │
│  │                │  │  blog)       │  │ Newsletters     │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐                           │
│  │ AI Writing     │  │ E-commerce   │                           │
│  │ Assistant      │  │ Tracking     │                           │
│  └────────────────┘  └──────────────┘                           │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│   Subscribers, Groups, Segments, Custom Fields                  │
├─────────────────────────────────────────────────────────────────┤
│   EU-hosted (ISO 27001 certified data center)                   │
│   GDPR-friendly by design                                       │
├─────────────────────────────────────────────────────────────────┤
│   SEPARATE: MailerSend (transactional email + SMS API)          │
│   Same company, samostatný product                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Tarify a cenová struktura

MailerLite má v 2026 **4 hlavní plány** s velmi přehlednou strukturou.

### 2.1 Free plan

- **$0/měsíc**
- **500 subscribers** (snížení z 1 000 v září 2025!)
- **12 000 emailů/měsíc**
- Drag-and-drop email editor
- Email automation (basic, 1 trigger per workflow)
- **Up to 10 landing pages**
- Forms & popups (limited)
- **Surveys & quizzes**
- Website builder (1 site)
- Subscriber management
- **24/7 support pro prvních 30 dní** (after community only)
- **14-day premium trial** s full feature access
- **MailerLite branding** v emailech
- **No templates** – start from blank canvas (limitace!)

### 2.2 Growing Business plan

- Od **$10/měsíc** (annual saves 10%)
- **500 subscribers** start tier
- **Unlimited monthly emails** ⭐ klíčový USP
- **3 users** included
- **90+ email templates** + landing page templates
- **No MailerLite logo** v emailech
- **RSS campaigns**
- **Auto-resend campaigns** (re-send to non-openers s different subject)
- **Unlimited websites + landing pages**
- **Dynamic content blocks**
- **Paid newsletters** (Stripe integration)
- **Digital products** sales
- **Unsubscribe page builder**
- **24/7 email support**
- **Subscriber management**
- **Basic automation** (1 trigger per workflow stále)

### 2.3 Advanced plan

- Od **$20/měsíc** (annual saves 10%)
- **500 subscribers** start tier
- Vše z Growing Business +
- **Unlimited account users** ⭐
- **Custom HTML editor**
- **Promo popup triggers** (advanced popup logic)
- **AI writing assistant** (subject lines, body copy)
- **24/7 live chat support**
- **Multi-trigger automations** (až 3 triggers per automation)
- **Advanced A/B testing** (content + subject)
- **Facebook Custom Audiences sync**
- **Dynamic content blocks** (deeper)
- **Click maps + heatmaps**
- **Opens by location**
- **Advanced website features** – password protection, custom code injections
- **Pre-built automation templates** (15+)
- **Multi-step automation workflows**
- **Branching conditions**
- **Faster email delivery**

### 2.4 Enterprise plan

- **Custom pricing** (typicky pro 100K+ subscribers)
- All Advanced features +
- **Dedicated IP address** ($50/měsíc add-on jinde)
- **Dedicated Customer Success Manager**
- **Landing page & newsletter design service**
- **Custom integrations**
- **Priority deliverability**
- **Custom contracts + SLAs**
- **Enhanced security features**

### 2.5 Cenové tier examples (Advanced plan)

| Subscribers | Price/měsíc |
| ----------- | ----------- |
| 500         | $20         |
| 1 000       | $20–22      |
| 2 500       | $36         |
| 5 000       | $50         |
| 10 000      | $80–90      |
| 25 000      | $160        |
| 50 000      | $300        |
| 100 000     | $500        |
| 500 000     | $1 900      |

⚠️ **95× price increase** od 500 → 500K subscribers na Advanced.

### 2.6 Billing options

- **Monthly billing** – standard prices
- **Annual billing** – **10% saved** (auto applied at checkout)
- **No setup fees, no hidden costs**
- **No pay-as-you-go** option

### 2.7 Free trials

- **14-day premium trial** zdarma (no credit card required)
- Po trial → features locked, data preserved
- Pro paid plány also 14-day trial dostupný

### 2.8 Upgrade rules

- **Auto-upgrade pokud subscriber count překročí limit** – card charged for next tier
- **Notification před limit překročením**
- **Free plan: sendings locked** at exceed (campaigns + automation), nutno upgrade nebo cleanup
- **Manual downgrade dostupný** pokud subscriber count nižší
- **Refunds nejsou** – downgrade na Free anytime

### 2.9 Skryté náklady – co je třeba vědět

1. **Free plan reduction** (Sept 2025): 1 000 → 500 subscribers – dvojnásobné náklady pro mnoho users
2. **Templates locked na Growing+** – Free musí start from blank canvas (frustrující!)
3. **Multi-trigger automations jen Advanced** – Free/Growing single trigger
4. **AI Writing Assistant jen Advanced** – ne Growing
5. **24/7 live chat jen Advanced** – ostatní email only
6. **30-day support limit na Free** – nooblové users dostávají nejméně support
7. **Dedicated IP only Enterprise** – ne add-on
8. **SMS marketing NEPODPOROVÁNO** – musí přes MailerSend separate platform
9. **No native WhatsApp**
10. **No native deep CRM**
11. **Digital product sales:** Stripe/PayPal poplatky 2.9% + $0.30

---

## 3. Pricing model

### 3.1 Subscriber-based pricing

MailerLite účtuje **podle počtu aktivních subscribers**, ne podle počtu emailů.

#### Co se počítá

- ✅ **Active subscribers** (opt-in, can receive marketing)
- ❌ **Unsubscribed** subscribers – nepočítají se
- ❌ **Bounced** – nepočítají se
- ❌ **Spam complainers** – nepočítají se

⚠️ **Pozor:** v MailerLite **inactive subscribers ALE OPT-IN** se počítají. Pravidelný cleanup pomáhá.

### 3.2 Unlimited monthly emails (paid plans) – key USP

- Všechny paid plány = **unlimited emails**
- Posílejte tolikrát, kolik chcete – cena se nemění
- Advantage pro frequent senders (daily newsletters)
- Free plán je limited (12 000 emailů/měsíc)

### 3.3 Cena scaling

|                 | Free | Growing Business | Advanced |
| --------------- | ---- | ---------------- | -------- |
| 500 subscribers | $0   | $10              | $20      |
| 2 500           | –    | $21              | $36      |
| 10 000          | –    | $50              | $80      |
| 50 000          | –    | $230             | $300     |
| 100 000         | –    | $500             | $500+    |

Po 100K → Enterprise plán s custom pricing.

### 3.4 Comparison s konkurencí (10K subscribers/month)

| Platform                        | Cena/měsíc |
| ------------------------------- | ---------- |
| **MailerLite Advanced**         | $80–90     |
| **Mailchimp Standard**          | $135       |
| **GetResponse Email Marketing** | $79        |
| **Klaviyo Email**               | $150       |
| **Brevo Business**              | $65        |
| **ActiveCampaign Plus**         | $179       |
| **HubSpot Marketing Pro**       | $890+      |

MailerLite je **typicky 30–40 % levnější** než Mailchimp na podobném tier, i když na 100K+ subscribers je rozdíl menší.

---

## 4. FreshMail akvizice a evropská strategie

### 4.1 FreshMail kontext

- **FreshMail** byl polský email marketing tool (založeno 2008, Krakov)
- Silná pozice na **polském trhu** + některé další CEE regiony
- Mid-market positioning
- Velmi populární mezi PL freelancery a malými firmami

### 4.2 Akvizice (únor 2025)

- MailerLite koupil FreshMail
- **Existing FreshMail customers migrace** na MailerLite
- Migration tools + dedicated support team
- Mapping FreshMail templates → MailerLite
- Self-service migration center
- Migration assistance **regardless of support plan**

### 4.3 Důsledky

- **Posílení evropské přítomnosti** MailerLite
- **Polská lokalizace** help center (kromě angličtiny a španělštiny)
- **Více polských zákazníků** + ekosystém
- **Posílení deliverability** v CEE region

### 4.4 Co FreshMail customers ztratili

- **Polské UI** (FreshMail mělo plnou polskou lokalizaci, MailerLite jen self-service docs v PL)
- Některé features specifické pro FreshMail (např. některé funnel templates)
- Polskou customer support team integrated do MailerLite (multilingual)

### 4.5 Migration features

- **Subscribers migration** – automatic
- **Templates mapping** – manual nebo agency assistance (1 email + 1 form mapped zdarma)
- **Custom fields** preservation
- **Lists/groups structure** preservation
- **Historical statistics** – limited migration

---

## 5. Lists, Subscribers, Groups, Segments

### 5.1 Subscribers (Contacts)

- **Standard fields:** email, name, last name, company, country, time zone, language
- **Custom fields** – unlimited (text, number, date, dropdown)
- **Tags** – flat tag system
- **Subscriber status:**
  - Active
  - Unsubscribed
  - Bounced
  - Spam complaint
  - Pending (double opt-in)
  - Unconfirmed (form not confirmed)

### 5.2 Groups (lists ekvivalent)

- **Groups = MailerLite's term for lists**
- Subscriber lze v multiple groups současně
- **Default group** + **custom groups**
- **Per-group settings:**
  - Default sender
  - Confirmation message (double opt-in)
  - Opt-in method
  - Unsubscribe behavior

### 5.3 Segments

- **Dynamic** – auto-update based na criteria
- Filter criteria:
  - Subscriber field values
  - Group membership
  - Email engagement (opened/clicked specific campaign)
  - Custom field values
  - Date-based
  - Activity-based
  - Geographic
  - Source-based
- **Multiple conditions** s AND/OR logic
- **Unlimited segments**

### 5.4 Tags

- Flat tag system
- Add via:
  - Manual
  - Automation action
  - Form submission
  - Import
  - API
- Multiple tags per subscriber
- Use jako automation trigger nebo segment filter

### 5.5 Custom Fields

- **Per account** (not per list)
- Types:
  - **Text**
  - **Number**
  - **Date** – for date-based automations
  - **Email** (additional emails)
  - **URL**
  - **Phone**
- Merge field syntax v emailech: `{$field_name}`

### 5.6 Subscriber lifecycle states

```
Pending (after form, before confirmation)
   ↓ (confirmed double opt-in)
Active (paying tier; can receive)
   ↓ Various paths:
   - Unsubscribed (opt-out)
   - Bounced (hard bounce)
   - Spam complaint
   - Deleted (manual or GDPR)
```

### 5.7 Import & Export

- **CSV upload**
- **Copy-paste**
- **Integration sync**
- **API import**
- **Validation:** email syntax check, duplicate detection
- **Export:**
  - Administrator role only
  - CSV download
  - Includes custom fields + tags

---

## 6. Email Marketing & Campaigns

### 6.1 Typy kampaní

| Typ                  | Kdy použít                        |
| -------------------- | --------------------------------- |
| **Regular**          | Standard newsletter / promo       |
| **A/B Split**        | Test variants                     |
| **Auto-resend**      | Re-send to non-openers (Growing+) |
| **RSS campaign**     | Auto-generated from RSS feed      |
| **Automation email** | Email v rámci workflow            |

### 6.2 Campaign builder workflow

```
Campaigns → Create campaign
   ↓
Step 1: Type selection
   ↓
Step 2: Setup
   - Campaign name
   - Subject + preview (with AI assist on Advanced)
   - From name + email (verified)
   - Reply-to
   - Language
   ↓
Step 3: Recipients
   - Groups (multi-select)
   - Segments
   - Exclude lists
   ↓
Step 4: Design
   - Drag-drop editor
   - Pre-built templates (Growing+)
   - Custom HTML (Advanced)
   - Brand kit
   ↓
Step 5: Preview & Test
   - Preview by device
   - Inbox preview
   - Send test email
   - Spam test
   ↓
Step 6: Send or Schedule
   - Send now
   - Schedule date/time
   - Time-zone send (per recipient)
   - Smart send (AI optimal time)
   ↓
Confirm
```

### 6.3 A/B Testing

- Variants of:
  - Subject line (default)
  - Sender name
  - Email content (Advanced)
  - Send time
- **Up to 5 variants**
- **Winner determination:** open rate / click rate / click-through
- **Sample size** + duration configurable
- **Auto winner send** to rest

### 6.4 Auto-resend campaigns

**MailerLite-specific feature** (Growing+):

- Original campaign sent
- After X hours (default 24h), if subscriber didn't open:
- **Auto re-send s different subject** to those non-openers
- Boost open rates by 10–30%

### 6.5 RSS campaigns

- **Auto-generated** z blog RSS feed
- Subscribers get email pri new posts
- **Frequency:** real-time / daily / weekly
- Pre-defined template s blog post inserts
- Skvělé pro bloggery + content creators

### 6.6 Send-time options

- **Send now**
- **Schedule** for specific time
- **Smart sending** (Advanced) – AI-determined optimal time
- **Time-zone send** – local time per recipient

### 6.7 Personalization

- **Merge fields syntax:** `{$first_name|default:"there"}`
- **Default fallback** values
- **Dynamic content blocks** (Growing+) – per segment

---

## 7. Editor a Templates

### 7.1 Drag-and-drop editor

#### Blocks

- Text
- Image (with built-in editor)
- Button
- Video (embeds)
- Divider, spacer
- Social media (icons + links)
- HTML block
- RSS block
- **30+ e-commerce blocks** (Growing+)
- Product block
- Survey/Quiz block (Growing+)
- Coupon block
- Form block

#### Features

- **Mobile responsive** automatic
- **Live preview** (desktop, tablet, mobile)
- **Brand kit** – save colors, fonts, logo
- **Saved blocks** – reusable across campaigns
- **AI Writing Assistant** (Advanced)

### 7.2 Rich-text editor

- Alternative jednodušší editor
- WYSIWYG, basic formatting
- Quick draft option

### 7.3 Custom HTML editor (Advanced)

- Full code control
- For developers / agencies
- Support for MJML-like responsive
- Code editor s syntax highlighting

### 7.4 Email templates

- **Free plan:** **0 templates** (start from blank!) ⚠️
- **Growing Business:** **90+ email templates** + landing page templates
- **Advanced:** Same + custom HTML capability

#### Template categories

- Newsletters
- Promotions
- E-commerce (product showcase)
- Events
- Welcome
- Holiday/seasonal
- Webinar promotion
- Course launches

### 7.5 AI Writing Assistant (Advanced)

- **Subject line generation** – from prompt or email body
- **Body copy** – generate from topic prompt
- **Tone adjustment** – professional, friendly, persuasive, etc.
- **Translation** – multi-language
- **Shortening/lengthening**
- **Re-write** existing content

---

## 8. Marketing Automation Workflows

### 8.1 Architecture

Workflow = **trigger** + **steps** (Rules + Actions).

- **Trigger:** event that starts workflow
- **Rules:** control flow (delay, condition, A/B split)
- **Actions:** what happens to subscribers

### 8.2 Plan availability

| Plán             | Workflows  | Triggers per workflow |
| ---------------- | ---------- | --------------------- |
| Free             | ✅ (basic) | 1                     |
| Growing Business | ✅         | 1                     |
| **Advanced**     | ✅         | **Up to 3**           |
| Enterprise       | ✅         | Up to 3               |

**Key Advanced advantage:** multiple triggers = multiple entry paths to one workflow.

### 8.3 Triggers (7 default)

#### A) Joins a group

- Trigger when subscriber added to specific group
- Most common for welcome sequences

#### B) Updated field

- Trigger when specific subscriber field updates
- Manual update, survey submission, automation action
- Use case: birthday reminders, status changes

#### C) Date-based

- Three sub-types:
  - **Anniversary trigger** – yearly recurring (birthdays, signup anniversaries)
  - **Exact date** – one-time scheduled
  - **Date offset** – X days before/after a date field

System checks date fields **daily at 4:00 AM GMT/UTC +00:00**.
Date format required: **YYYY-MM-DD**.

#### D) Clicks a link

- Trigger when subscriber clicks specific link
- Allow re-entry option (re-trigger every click)

#### E) Form completion

- Trigger when specific form submitted

#### F) Joins a segment

- Trigger when subscriber meets segment criteria

#### G) E-commerce triggers (Growing+)

- **Purchases a specific product**
- **Abandoned cart**
- **First purchase**
- **VIP threshold reached**
- More e-commerce events

### 8.4 Steps (Rules + Actions)

#### Rules

- **Delay** – wait specific time, until date, or until event
- **Condition** – branch based on:
  - Custom field value
  - Group membership
  - Campaign activity (opened/clicked specific)
  - Tags
  - Segment membership
- **A/B test** – split subscribers, test different paths
- **Continue from chosen step** – jump within workflow

#### Actions

- **Send email** – designed within workflow
- **Update field** – set custom field value
- **Add to group** / Remove from group
- **Add tag** / Remove tag
- **Webhook** – call external URL with secret key
- **Mark as unsubscribed**
- **Copy to group**

### 8.5 Pre-built automation templates (Advanced)

- **15+ pre-built workflows**:
  - Welcome series
  - Abandoned cart
  - Webinar registration + reminders
  - Course launch
  - Product upsell
  - Re-engagement
  - Birthday celebration
  - Anniversary
  - Lead magnet delivery
  - Post-purchase
  - Cross-sell
  - VIP customer
  - Survey follow-up
  - Event reminder

### 8.6 Workflow execution

```
Subscriber meets trigger condition
   ↓
Enters workflow at step 1
   ↓
Each step processed sequentially:
- Action: execute (send email, update field, etc.)
- Rule: evaluate (condition branch, A/B split, delay)
   ↓
Continue until workflow complete or subscriber removed
```

### 8.7 Re-entry rules

- Per workflow setting
- **Allow subscribers re-enter automation** (checkbox)
- If unchecked: subscriber completes once
- If checked: re-triggers each time condition met

### 8.8 Add subscribers manually

- Three-dot menu na workflow → Add subscribers
- Choose: start from beginning OR specific step
- **Bypasses trigger checks** but follows conditions within
- Cannot add if already in workflow or completed

### 8.9 Webhook step

```
Workflow → + → Webhook step
   ↓
Configure:
- Webhook URL (external endpoint)
- Secret Key (from MailerLite Webhook settings)
   ↓
MailerLite POSTs to URL when subscriber reaches step
   ↓
External system processes
   ↓
Subscriber continues to next step
```

### 8.10 Workflow analytics

- **Activity tab** per workflow:
  - In queue
  - Completed
  - Failed
  - Canceled
- **Per-step metrics:**
  - Email opens, clicks
  - Conversion rate
  - Drop-off
- **Re-add failed subscribers** to specific step

### 8.11 Workflow limitations

- **No advanced branching** like ActiveCampaign / GetResponse
- **No advanced filtering** within workflow
- **No predictive analytics** integration
- **No multi-account workflow sharing**

---

## 9. Forms, Popups, Surveys & Quizzes

### 9.1 Form types

- **Embedded form** – HTML/JS code
- **Pop-up form** – modal, exit-intent, time-triggered
- **Promotional popup** (Advanced) – advanced triggers
- **Sticky bar / Slide-in**
- **Multi-step form** (progressive profiling)

### 9.2 Form features

- Drag-drop builder
- Field types: text, email, phone, dropdown, checkbox, radio, date, hidden
- **GDPR consent fields**
- **Captcha** support
- **Custom CSS**
- **Mobile responsive**
- **Multi-language**
- **A/B testing forms** (Advanced)

### 9.3 Form triggers (popups)

- **Time on page**
- **Scroll depth %**
- **Exit intent** (Advanced)
- **Click on element**
- **Frequency caps** per visitor
- **Page-specific targeting** (URL match)
- **Returning vs. new visitor**

### 9.4 Surveys & Quizzes

**MailerLite-specific feature** (available on all plans):

- **Drag-drop survey builder**
- **Question types:** multiple choice, single select, rating scale, text response
- **Conditional logic** – different paths per answer
- **Quiz scoring** – assign points per answer
- **Results page** – show outcome
- **Auto-update subscriber fields** based on answers
- **Trigger automation** based on responses

#### Use cases

- Customer feedback
- Personality quizzes (lead magnet)
- Product recommendation quizzes
- NPS surveys
- Event interest collection

### 9.5 Integration s subscribers

- Form submit → add to group
- → Update custom fields
- → Add tags
- → Trigger automation
- → Optional welcome email

---

## 10. Landing Pages

### 10.1 Capabilities

- **Drag-and-drop builder**
- **Templates** (Growing+) – 90+
- **Mobile responsive**
- **Custom domain** support
- **A/B testing** (Advanced)
- **Embedded forms** integration
- **Payment integration** (Stripe) for digital products
- **SEO tools** – meta tags, OG
- **Custom CSS/HTML** (Advanced)

### 10.2 Plan limits

- **Free:** Up to 10 landing pages
- **Growing Business:** Unlimited
- **Advanced:** Unlimited + higher traffic, advanced features

### 10.3 Use cases

- Lead generation
- Product launch
- Webinar registration (paired with external webinar tools)
- Course sales
- Newsletter signup
- Event registration
- Squeeze pages

---

## 11. Websites Builder

### 11.1 Features

- **Website builder included on Free plan** (1 site)
- **Unlimited websites on Growing+**
- Multi-page sites
- **Blog functionality** built-in
- Custom domain support
- SSL automatic
- **Hosting included**
- **Drag-drop page editor**
- **AI-powered website builder** (Advanced)
- **Password protection** (Advanced)
- **Custom code injections** (Advanced)
- **Custom favicon** (Advanced)

### 11.2 Blog

- Native blog support
- Post categories + tags
- SEO tools
- RSS feed (use s RSS campaigns!)
- Comment system

### 11.3 Limitations

- **Ne plnohodnotný CMS** jako WordPress
- **Limited customization** vs. Webflow/Wix
- **No e-commerce store** capabilities (jen digital products via landing pages)
- **No multi-language** site versions
- **Limited templates** vs. dedicated builders

---

## 12. Digital Products & Paid Newsletters

### 12.1 Digital Products (Growing+)

- **Sell digital products** directly:
  - eBooks
  - Templates
  - Music files
  - Videos
  - Courses (basic; ne plnohodnotná LMS)
- **Stripe integration** for payments
- **PayPal** support
- **Auto-delivery** post-purchase
- **One-time** purchase
- **Hosted product page**

### 12.2 Paid Newsletters (Growing+)

- **Substack-like model** – paid newsletter subscriptions
- **Recurring billing** (Stripe)
- **Members-only emails**
- **Pricing tiers** (monthly, yearly)
- **Subscriber portal** for managing subscription
- **Free preview emails** option

### 12.3 Use cases

- Content creators monetize audience
- Niche publication subscribers
- Coaching content
- Premium analysis newsletter

### 12.4 Limitations vs. dedicated tools

- **Less feature-rich** than Substack, Beehiiv, Ghost
- **Limited member management**
- **No native podcast hosting**
- **No author profiles** / multi-author support
- **Payment processing fees** Stripe standard (2.9% + $0.30)

---

## 13. E-commerce features

### 13.1 Native integrations

- **Shopify** (deep)
- **WooCommerce**
- **Wix Stores**
- **Squarespace Commerce**
- **BigCommerce**
- **PrestaShop**

### 13.2 E-commerce blocks

**30+ e-commerce blocks** (Growing+):

- Product showcase
- Cart preview
- Product recommendations
- Order details
- Shipping info
- Review request
- Discount code

### 13.3 E-commerce automations

- **Abandoned cart recovery**
- **Welcome series for first-time customers**
- **Post-purchase follow-up**
- **Cross-sell / Upsell** based on purchase
- **Win-back** for lapsed customers
- **VIP customers** (high spenders)
- **Review request** post-purchase

### 13.4 E-commerce reports

- Revenue per campaign
- Top products sold
- Customer lifetime value (basic)
- Order data
- Conversion rate

### 13.5 Limitations vs. Klaviyo

- **No automatic predictive analytics** (CLV, churn risk)
- **Less polished Shopify integration** depth
- **No advanced segmentation** based on AOV trends
- **No automatic RFM cohorts**
- **No browse abandonment** workflows (cart yes)

Pro DTC e-commerce s focus na revenue je Klaviyo silnější. MailerLite je good fit pro small e-commerce s tight budget.

---

## 14. AI Writing Assistant a AI features

### 14.1 AI Writing Assistant (Advanced)

- **Subject line generation** – multiple variants from prompt
- **Email body copy** – from topic prompt
- **Tone adjustment:**
  - Friendly
  - Professional
  - Casual
  - Persuasive
  - Urgent
- **Translation** to multiple languages
- **Shortening / lengthening**
- **Re-writing** existing copy
- **Continue writing** – complete drafted content

### 14.2 AI Website Builder (Advanced)

- Answer questions about your business
- AI generates personalized website
- Multi-page generation
- Brand-aligned design
- Customizable post-generation

### 14.3 Smart Send Time (Advanced)

- AI-optimized send time per recipient
- Based on engagement history
- ML model

### 14.4 AI Image Generator (Advanced, newer)

- Generate images from text prompts
- For email content
- Brand-style alignment

### 14.5 AI limitations vs. konkurence

- **No autonomous agents** (jako HubSpot Breeze, Klaviyo Customer Agent)
- **No predictive analytics** (CLV, churn) jako Klaviyo
- **No AI workflow generation** (jako HubSpot)
- **Focus na content generation, ne na orchestration**

---

## 15. MailerSend (separate transactional)

**Klíčový bod:** MailerLite NEMÁ built-in transactional email. Pro transactional musíte použít **MailerSend** – samostatný produkt **od stejné firmy**.

### 15.1 MailerSend overview

- **Samostatný produkt** od MailerLite, Inc.
- Specializovaný transactional email + SMS API
- Vlastní platforma, vlastní pricing
- **API-first approach**
- Used by developers, not marketers

### 15.2 Features

- **REST API** (modern, well-documented)
- **SMTP relay**
- **Webhooks**
- **Email validation API**
- **Templates** s drag-drop editor
- **Variables / dynamic content**
- **Attachments** support
- **Inbound parsing**
- **Detailed logs**
- **Suppression management**
- **SMS API** (selected regions)

### 15.3 Pricing

- **Free tier:** 3 000 emails/month
- **Paid:** od $28/měsíc pro 50K emails
- Volume-based scaling

### 15.4 Use case

- Order confirmations
- Password resets
- Shipping notifications
- Account notifications
- App-triggered emails
- Email validation pre-send

### 15.5 MailerLite + MailerSend kombinace

```
MailerLite (marketing)
   ↓ sync (optional)
MailerSend (transactional)
   ↓ same underlying infrastructure
   ↓ unified deliverability
```

### 15.6 Limitace vs. integrated platforms

- **No unified contact view** across marketing + transactional
- **Separate billing** + separate dashboards
- **Separate API endpoints**
- **Marketing automation can't trigger transactional** directly (only via webhook to MailerSend)

Pro firmy, které chtějí marketing + transactional v jedné platformě, je **Brevo** silnější (best-in-class transactional + marketing v jednom).

---

## 16. Reports

### 16.1 Campaign reports

- **Sent, Delivered, Bounce rate**
- **Opens** (unique + total), Open rate
- **Clicks**, CTR, top links
- **Click map** (visual heatmap on email)
- **Opens by location** (Advanced)
- **Device & email client** breakdown
- **24h chart** performance
- **Per-recipient activity**

### 16.2 Automation reports

- Per-workflow stats
- Per-step performance
- Conversion tracking
- Drop-off analysis

### 16.3 Subscriber reports

- List growth
- Source attribution
- Engagement scores
- Activity timeline

### 16.4 Form reports

- Submission counts
- Conversion rate
- A/B test results

### 16.5 Survey/Quiz reports

- Response counts
- Answer distribution
- Score distribution
- Completion rate

### 16.6 E-commerce reports

- Revenue per campaign
- Conversion rate
- AOV
- Top products

### 16.7 Limitations

- **No multi-touch attribution** like HubSpot Enterprise
- **No custom dashboard builder**
- **No predictive analytics views**
- **Limited cross-campaign comparison**
- **Simple drill-down only**

---

## 17. Deliverability

### 17.1 Infrastructure

- **EU-hosted servers** (Lithuania primarily)
- **ISO 27001 certified** data center
- **Shared IP pools** – multi-tier reputation
- **Dedicated IP** – Enterprise only
- **Sender Reputation monitoring**

### 17.2 Account monitoring (anti-spam policy)

- MailerLite **actively monitors** account lists + content
- Spam policy enforcement
- Account suspension možná pro:
  - Purchased lists
  - High spam complaint rate
  - Affiliate marketing without consent
  - Adult content / illegal activity
  - List rental

### 17.3 Authentication

| Protokol                    | Setup                       |
| --------------------------- | --------------------------- |
| **SPF**                     | Include for MailerLite      |
| **DKIM**                    | 2× CNAME records            |
| **DMARC**                   | TXT record                  |
| **Sender verification**     | Email + domain verification |
| **Branded tracking domain** | CNAME (recommended)         |

### 17.4 Domain authentication flow

```
Account settings → Domains → Add domain
   ↓
Verify ownership (DNS verification)
   ↓
DKIM + SPF setup wizard
   ↓
Add DNS records
   ↓
Validate (5 min – 48h)
   ↓
[Authenticated] – emails now signed with your domain
```

### 17.5 List hygiene

- **Auto-suppression** hard bounces
- **Soft bounce monitoring**
- **Spam complaint auto-suppression**
- **Inactive subscriber detection** – manual cleanup recommended
- **Re-engagement campaign tools**

### 17.6 Gmail/Yahoo 2024+ compliance

- **One-click unsubscribe** (RFC 8058) auto-implemented
- **DKIM + DMARC enforced**
- **Spam complaint rate** monitored < 0.3%
- **Functional unsubscribe** immediate

---

## 18. API, Integrace

### 18.1 API

- **Base URL:** `https://api.mailerlite.com/api/v2/` (legacy) nebo `https://connect.mailerlite.com/api/` (newer)
- **Authentication:** API key in header
- **JSON request/response**
- **Rate limits:** standard tier limits

### 18.2 Hlavní API endpoints

| Resource       | Operace                 |
| -------------- | ----------------------- |
| `/subscribers` | CRUD subscribers        |
| `/groups`      | Group management        |
| `/segments`    | Read segments           |
| `/fields`      | Custom field management |
| `/campaigns`   | Campaign CRUD           |
| `/automations` | Workflow info           |
| `/forms`       | Form data               |
| `/webhooks`    | Webhook subscriptions   |
| `/sites`       | Website data            |
| `/stats`       | Statistics              |

### 18.3 Webhooks

- **Subscriber events:** created, updated, unsubscribed, bounced, spam
- **Campaign events:** sent, opened, clicked
- **Automation events:** completed, failed
- **Form submissions**

### 18.4 SDKs

- **PHP** (oficiální)
- **Python** (oficiální)
- **Ruby**
- **Node.js**
- **C#/.NET**

### 18.5 Native integrace

**150+ integrations**, vybrané:

#### E-commerce

- Shopify
- WooCommerce
- BigCommerce
- Wix Stores
- Squarespace Commerce
- PrestaShop

#### Forms

- Typeform
- Jotform
- Google Forms (via Zapier)

#### CMS

- WordPress (plugin)
- Webflow

#### Payment

- Stripe (for paid newsletters, digital products)
- PayPal

#### Webinars

- Zoom
- Webinarjam

#### Booking

- Calendly

#### Productivity

- Slack
- Google Workspace

#### Analytics

- Google Analytics

#### Ads

- Facebook/Meta (Custom Audiences sync – Advanced)
- Google Ads

#### iPaaS

- **Zapier** – 5 000+ apps
- **Make (Integromat)**
- **Pabbly Connect**
- **Integrately** – 1 000+ apps

### 18.6 Plugins

- **WordPress** – MailerLite for WordPress (official)
- **WooCommerce** plugin
- **Wix** native integration
- **Shopify** app

### 18.7 Embed library

- **JavaScript snippet** for forms + tracking
- **Click & Open tracking**
- **Form embedding**

---

## 19. Compliance

### 19.1 EU hosting

- Servers v EU (Lithuania)
- ISO 27001 certified data center
- GDPR-friendly default
- DPA available

### 19.2 GDPR features

- **GDPR consent fields** v forms
- **Per-group opt-in tracking**
- **Audit trail** per consent (IP, timestamp)
- **Double opt-in option** per group
- **Right to be Forgotten:**
  - UI: Subscriber → Delete from account permanently
  - API: DELETE subscriber endpoint
  - Auto-suppression after delete
- **Data export per subscriber**
- **DPA available** electronically

### 19.3 Compliance certifications

- **GDPR compliant**
- **ISO 27001** (data center)
- **SOC 2 Type II** (in progress / depending on tier)
- **CCPA** compliant
- **CASL** (Canadian)
- **CAN-SPAM** (US)

### 19.4 Security

- **2FA** (TOTP, SMS)
- **Per-user permissions**
- **API key management**
- **Encryption** at rest + in transit
- **Spam policy enforcement**
- **Account monitoring** for malicious use

### 19.5 Anti-spam policy enforcement

MailerLite je **přísný** s anti-spam:

- **Purchased lists** – immediate suspension
- **High bounce rate** – account review
- **Spam complaints** – warnings → suspension
- **Affiliate marketing** strict rules
- **No adult content, gambling, certain financial services**

Toto je **double-edged sword:** podporuje quality deliverability, ale občas suspendoval **legitimní users**.

---

## 20. Limity a nedostatky

### 20.1 Plán limity

- **Free plan reduced** (500 from 1 000) – Sept 2025 změna
- **Free plan: no templates** – frustrující pro nooblce
- **Multi-trigger automations jen Advanced** ($20+)
- **AI Writing jen Advanced**
- **24/7 live chat jen Advanced**
- **30-day support na Free** – limited beginning users

### 20.2 Funkcionální limity

- **Žádný built-in transactional email** – musí MailerSend separately
- **Žádný SMS marketing** – musí external
- **Žádný WhatsApp**
- **Žádné webinars** – external (Zoom, atd.)
- **Žádné online courses** (jen základní digital products)
- **Žádný plnohodnotný CRM** (jen subscriber management)
- **Žádné predictive analytics** (CLV, churn)
- **Žádné advanced lead scoring**
- **Žádné autonomous AI agents**
- **Žádné multi-channel automation** (jen email)

### 20.3 Automation limity

- **Single trigger** na Free + Growing Business
- **3 triggers max** na Advanced
- **No advanced branching** like ActiveCampaign
- **No predictive analytics** integration
- **No multi-account workflow sharing**
- **No multi-step time-based delays**
- **Limited workflow templates** vs. HubSpot

### 20.4 E-commerce limity

- **Less polished než Klaviyo** pro DTC
- **No automatic RFM cohorts**
- **No browse abandonment** (cart yes)
- **No CLV / churn prediction**
- **No AI product recommendations** v emailech
- **Limited Shopify depth**

### 20.5 UI/UX

- **Polish + minor lang lokalizace** v help center, ale UI essentially anglické
- **No Czech / Slovak in UI** – velký mínus pro CZ/SK trh
- **Editor občas buggy v Safari**
- **Mobile app limited** vs. konkurence

### 20.6 Account management

- **Anti-spam policy strict** – občas false-positive suspensions
- **No native API for user management**
- **Custom user role limited** options
- **No SSO/SAML** (mimo Enterprise)
- **No SCIM provisioning**

### 20.7 Migration

- **No native flow export to other platforms**
- **Templates HTML export OK**
- **Subscribers CSV/API export**
- **Historical campaign data limited** portability

### 20.8 Pricing surprises

- **Auto-upgrade** without explicit consent
- **No refunds**
- **Free plan reduction (Sept 2025)** affected many small users
- **Templates locked behind Growing+** – Free users have hard time
- **Annual saves 10%** but commits for full year

---

## 21. Shrnutí: Pro koho a proti komu

### MailerLite je dobrá volba pokud

- Jste **solopreneur, content creator, blogger** s small list
- Hledáte **best free plan** v industry (i s redukcí 2025)
- Chcete **transparentní subscriber-based pricing** bez surprises
- Cíl je **simple email marketing + landing pages + websites** v jednom
- Vážíte si **intuitivní UI** – jeden z nejhezčích v kategorii
- Provozujete **paid newsletter** (Substack alternative)
- Prodáváte **digital products** (eBooks, templates)
- Máte **frequent send pattern** – unlimited emails na paid plans
- Hledáte **affordable alternative** k Mailchimpu
- Jste v **EU** a zajímá vás GDPR + EU hosting

### MailerLite není dobrá volba pokud

- Pracujete primárně v **češtině/slovenštině** – UI nepodporuje
- Provozujete **velký DTC e-commerce** (Klaviyo silnější)
- Potřebujete **deep marketing automation** (ActiveCampaign, GetResponse, HubSpot lepší)
- Hledáte **B2B sales-led platform** (HubSpot lepší)
- Potřebujete **multichannel** (email + SMS + WhatsApp + push) – MailerLite jen email
- Hlavní use case je **transactional email** – Brevo nebo MailerSend separate lepší
- Potřebujete **webinars built-in** (GetResponse lepší)
- Vyžadujete **online courses platform** s plnou LMS (Teachable, Thinkific lepší)
- Provozujete **enterprise** s 250K+ subscribers a complex needs
- Máte **velkou inactive databázi** – subscriber pricing penalizuje

### MailerLite vs. konkurence

| Konkurence           | Kdy lepší než MailerLite                                                    |
| -------------------- | --------------------------------------------------------------------------- |
| **Mailchimp**        | Brand recognition, větší template library, větší ecosystem                  |
| **Brevo**            | Volume-based pricing pro inactive lists, transactional v base, multichannel |
| **GetResponse**      | Webinars, courses, funnels built-in; 27 jazyků UI včetně CZ/SK              |
| **HubSpot**          | Full B2B CRM, deep sales, multi-Hub                                         |
| **Klaviyo**          | DTC e-commerce, Shopify depth, predictive analytics                         |
| **ActiveCampaign**   | Deep automation, branching, lead scoring                                    |
| **ConvertKit (Kit)** | Pure creator-focused, more author features                                  |
| **Beehiiv**          | Newsletter-first, better monetization tools                                 |
| **Substack**         | Subscription newsletter focus, viral mechanics                              |

---

_Dokument zpracován z oficiálních zdrojů mailerlite.com/help, mailerlite.com/pricing, mailerlite.com/features a renomovaných analytických webů. Pro nejaktuálnější ceny vždy ověřit na mailerlite.com/pricing._
