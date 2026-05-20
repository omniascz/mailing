# ActiveCampaign – hloubková analýza funkcí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Zdroje:** oficiální dokumentace activecampaign.com, help.activecampaign.com + analytické weby a recenze (EmailVendorSelection, EmailToolTester, Sender, EngageBay, Marketer's Choice, GetAIPerks, Automation Atlas, BusinessEautomation, Spadoom 2026 pricing report) ověřené v dubnu–květnu 2026.
**Rozsah:** kompletní funkcionalita platformy v roce 2026 – marketing automation, email marketing, integrovaný CRM (deals + pipelines + accounts), Active Intelligence AI, sales automation, transactional email, omnichannel (SMS, WhatsApp, site messages).

> **Důležitý kontext:** ActiveCampaign je **americký produkt (Chicago, IL)**, založeno **2003** Jasonem VandeBoomem. Jeden z nejstarších hráčů v industry (22+ let), původně bootstrapped. **180 000+ zákazníků** ve 170+ zemích k 2026.
>
> **Pozice:** **mid-market automation specialist** – často chválený za **best automation engine v segmentu**. Mezi Mailchimp/MailerLite (simple) a HubSpot/Salesforce (enterprise) – ideální pro firmy 10–500 zaměstnanců, které potřebují deep automation bez enterprise overhead.
>
> **Klíčový diferenciátor:** **automation hloubka** – branching workflows, conditional triggers, **900+ pre-built automation recipes**, advanced segmentation, lead scoring. Často citovaný jako **"best automation engine" v segmentu**.
>
> **Velký pivot 2024–2025:** ActiveCampaign **přestal být pure email/CRM platform** a stal se **"AI-powered marketing platform"** s Active Intelligence engine. Současně přibyl **modulární add-on model** – Enhanced CRM (Pipelines / Sales Engagement), SMS, WhatsApp, Transactional Email, Custom Reporting jako separate add-ons.
>
> **Pricing 2024–2026 changes** kontroverzní:
>
> - **November 2025:** changed billing pro **new users** = **all contacts count toward billing** (incl. unsubscribed, bounced, unconfirmed). Old users grandfathered into per-active billing.
> - **2024 pricing overhaul** přesunul features do vyšších tierů – mid-tier upgrades nucenější.
> - Some users report **doubled bills** without feature changes.

---

## Obsah

1. [Co je ActiveCampaign a pro koho je](#1-co-je-activecampaign)
2. [Tarify a pricing model](#2-tarify)
3. [Modulární add-on architektura](#3-add-ons)
4. [Lists, Contacts, Tags, Segmentation](#4-contacts-segmentation)
5. [Email Marketing & Campaigns](#5-email-campaigns)
6. [Marketing Automation (flagship)](#6-automation)
7. [Pre-built automation recipes (900+)](#7-recipes)
8. [Active Intelligence AI](#8-active-intelligence)
9. [Forms & Landing Pages](#9-forms-pages)
10. [Site Messages a Site Tracking](#10-site-messages)
11. [Integrated CRM: Deals & Pipelines](#11-crm)
12. [Accounts (companies / B2B)](#12-accounts)
13. [Sales Engagement (1:1 emails, AI)](#13-sales-engagement)
14. [SMS, WhatsApp, MMS channels](#14-sms-whatsapp)
15. [Transactional Email (Postmark)](#15-transactional)
16. [Lead Scoring](#16-lead-scoring)
17. [Reports & Custom Reporting](#17-reports)
18. [E-commerce integrations](#18-ecommerce)
19. [API, Integrations, App Marketplace (970+)](#19-api-integrations)
20. [Limity a nedostatky](#20-limity)

---

## 1. Co je ActiveCampaign

- **Společnost:** ActiveCampaign, LLC
- **HQ:** **Chicago, IL, USA** (with EU office in Dublin a APAC office v Sydney)
- **Vznik:** **2003** – Jason VandeBoom (founder, dlouho CEO)
- **CEO 2026:** Andre Hoesterey (named v 2024)
- **Velikost:** **180 000+ zákazníků** v 170+ zemích
- **Pozice:** **mid-market marketing automation + CRM platform**
- **Specializace:** **deep automation, behavior-based marketing, integrated CRM**
- **Cílový segment:** SMB → mid-market (10-500 zaměstnanců, growing e-commerce, B2B services, courses, agencies)
- **Lokalizace UI:** **angličtina, španělština, portugalština, francouzština, italština, němčina, polština** + další. **Čeština ani slovenština nejsou** v UI.

### Filozofie produktu

**"Customer experience automation"** – mantra ActiveCampaignu. Cíl: automate every customer touchpoint za pomoci behavior-based triggers a integrated CRM.

Marketing claim 2026: **"Most positively-reviewed marketing automation platform in the world"** – consistently high ratings na G2, Capterra (typically 4.5/5).

```
┌─────────────────────────────────────────────────────────────────┐
│                  ACTIVECAMPAIGN PLATFORM                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Email          │  │ Marketing    │  │ Forms &         │      │
│  │ Marketing      │  │ Automation   │  │ Landing Pages   │      │
│  │ + Campaigns    │  │ (flagship)   │  │                 │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Site Tracking  │  │ Site Messages│  │ Lead Scoring    │      │
│  │ (behavior)     │  │ (on-site)    │  │ (predictive)    │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ 900+ Pre-built │  │ Active       │  │ Conditional     │      │
│  │ Automation     │  │ Intelligence │  │ Content,        │      │
│  │ Recipes        │  │ AI engine    │  │ Personalize     │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│   INTEGRATED CRM (add-on Plus+):                                │
│   ├─ Deals (opportunities/sales)                                │
│   ├─ Pipelines (visual sales process)                           │
│   ├─ Accounts (companies/B2B)                                   │
│   ├─ Tasks & Activities                                         │
│   ├─ 1:1 Emails (from CRM)                                      │
│   └─ Sales Engagement add-on (B2B, AI)                          │
├─────────────────────────────────────────────────────────────────┤
│   CHANNEL ADD-ONS:                                              │
│   ├─ SMS (US + global)                                          │
│   ├─ MMS (US only)                                              │
│   ├─ WhatsApp Business                                          │
│   └─ Transactional Email (Postmark integration)                 │
├─────────────────────────────────────────────────────────────────┤
│   ACTIVE INTELLIGENCE AI:                                       │
│   ├─ Predictive Sending                                         │
│   ├─ Win Probability                                            │
│   ├─ Sentiment Analysis                                         │
│   ├─ Generative AI content                                      │
│   ├─ AI-powered subject lines                                   │
│   └─ Smart segments                                             │
├─────────────────────────────────────────────────────────────────┤
│   970+ INTEGRATIONS (largest in mid-market):                    │
│   ├─ E-commerce (Shopify, WooCommerce, BigCommerce, Magento)    │
│   ├─ CRM (Salesforce, Microsoft Dynamics native sync)           │
│   ├─ Productivity (Slack, Zapier, Make, Pipedrive)              │
│   └─ Specialized (Calendly, Typeform, ManyChat, etc.)           │
├─────────────────────────────────────────────────────────────────┤
│   US-hosted primary | EU/AU data residency available            │
│   GDPR + CCPA + ISO 27001                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Tarify a pricing model

ActiveCampaign **přepracoval pricing 2024–2025** s modulárním add-on modelem. **Žádný free plan** – pouze 14denní free trial.

### 2.1 Plans overview (2026, annual billing pricing)

ActiveCampaign nabízí **4 hlavní plány**:

#### Starter

- Od **$15/měsíc** (annual) pro **1 000 contacts, 1 user**
- Monthly billing: ~$19/měsíc
- **10× email send limit** (10 000 emailů/měsíc pro 1K contacts)
- **Limited automation** (only 1 trigger, 100 actions celkem)
- Drag-and-drop editor
- **150+ email templates**
- Basic forms
- AB testing emails
- Site tracking
- Basic Marketing CRM
- Live chat + email support
- **Žádné landing pages, AI, predictive sending**

#### Plus (most popular)

- Od **$49/měsíc** (annual) pro **1 000 contacts, 1 user**
- Monthly: ~$59/měsíc
- **10× email send limit**
- **Unlimited automation actions**
- **Branching workflows**
- **Generative AI** (Active Intelligence)
- **Landing pages**
- **Site messages**
- **Forms** (advanced)
- **Lead scoring**
- **Facebook Custom Audiences sync**
- **Conversion tracking**
- **Retargeting ads** integrations
- **Advanced reporting**
- **Enhanced CRM add-on dostupný** (Pipelines / Sales Engagement)
- **Sub-accounts** (limited)

#### Pro (Professional)

- Od **$79–$99/měsíc** (annual) pro **1 000 contacts, 3 users**
- **12× email send limit**
- Vše z Plus +
- **Predictive Sending** (AI per-recipient optimal time)
- **Conditional Content** v emailech
- **Attribution & conversion tracking**
- **A/B testing in automations**
- **Cross-channel marketing**
- **Advanced segmentation**
- **Salesforce integration** (basic)
- **Priority support**

#### Enterprise

- Od **$145–$259/měsíc** (annual) pro **1 000 contacts, 5 users**
- **15× email send limit**
- Vše z Pro +
- **Custom objects**
- **Single Sign-On (SSO)**
- **Custom mailserver domain**
- **Salesforce / Microsoft Dynamics** deep integration
- **Dedicated account team**
- **Premium segmentation**
- **Sandbox accounts**
- **HIPAA support**
- **Custom reporting** (full)
- **Premium support** + SLA

### 2.2 Pricing per contact tier (Plus plan example, annual)

| Subscribers | Plus price/měsíc |
| ----------- | ---------------- |
| 1 000       | $49              |
| 2 500       | $79–95           |
| 5 000       | $145             |
| 10 000      | $234             |
| 25 000      | $399             |
| 50 000      | $649             |
| 100 000     | $1 199+          |

### 2.3 14-day free trial

- **No credit card required**
- **100 contacts** + **100 emails** limit during trial
- **Email-only support** (no live chat)
- Trial accounts based on **Professional plan** features
- Test **Sales Engagement add-on** + **Salesforce integration**

### 2.4 Billing model změny (2025)

**Klíčová změna November 2025** (pro **new users** only):

```
PŘED Nov 2025 (legacy, grandfathered):
- Billing based on ACTIVE contacts
- Unsubscribed, bounced, unconfirmed NEPOČÍTALY
- Pravidelný cleanup snižoval bill

PO Nov 2025 (new users):
- Billing based on ALL contacts incl.:
  - Unsubscribed
  - Bounced
  - Unconfirmed
  - Spam complainers
- Even inactive contacts add to bill
```

⚠️ **Kontroverzní změna** – uživatelé musí pravidelně **manually delete** unsubscribed/bounced kontakty pro snížení nákladů.

### 2.5 Add-ons (separately priced)

ActiveCampaign **modulární** model – základ plán + add-ons:

#### Enhanced CRM add-on

Two flavors:

- **Pipelines** – B2C focused
- **Sales Engagement** – B2B focused (more advanced)

Pricing varies podle base plan + počet sales users:

- ~$40–80/měsíc na user pro Pipelines
- ~$95–180/měsíc na user pro Sales Engagement

#### SMS add-on

- Available na Plus, Pro, Enterprise
- **Pre-paid credits** model (recurring monthly)
- Per-message pricing varies podle země
- ~$0.015–$0.045 per SMS

#### MMS (US only)

- Add-on (multimedia messages)

#### WhatsApp Business

- New 2024+
- **Combine s Plus/Pro/Enterprise plan**
- Specific WhatsApp plans dostupné

#### Transactional Email

- Powered by **Postmark** (acquired by ActiveCampaign 2022)
- Pre-paid recurring credits
- Use pro order confirmations, password resets, atd.
- Add-on price varies podle volume

#### Custom Reporting

- Available add-on (Plus, Pro)
- Included in Enterprise plan
- Advanced report templates
- Custom dashboards

### 2.6 Discounts

- **Annual billing:** ~20% off vs. monthly
- **Non-profits:** dodatečných 20% off
- **No setup fees**
- **No hidden onboarding costs**

### 2.7 Cena vs. konkurence (10K subscribers)

| Platform                        | Cena/měsíc (mid-tier) |
| ------------------------------- | --------------------- |
| **ActiveCampaign Plus**         | $234                  |
| **ActiveCampaign Pro**          | $400+                 |
| **Mailchimp Standard**          | $135                  |
| **GetResponse Email Marketing** | $79                   |
| **Klaviyo Email**               | $150                  |
| **Brevo Business**              | $65                   |
| **MailerLite Advanced**         | $80                   |
| **HubSpot Marketing Pro**       | $890+                 |

⚠️ ActiveCampaign **je na vyšší straně** v mid-tier kategorii. Cena ospravedlnitelná pouze pokud používáte **deep automation** features.

### 2.8 Recent pricing controversy

V 2024–2026 ActiveCampaign zvedl ceny několikrát:

- **2024 pricing overhaul** – přesun features do vyšších tierů
- **November 2025** – billing change (all contacts)
- Někteří users reportují **doubled bills** without feature changes
- Critique: "feels like forced upsell"

ROI ospravedlnitelný pokud **using advanced automation actively**.

---

## 3. Modulární add-on architektura

**Klíčový architectural shift 2024+:** ActiveCampaign rozdělil features do base plans + modulárních add-ons. Modular benefit: **only pay for what you use**.

### 3.1 Base plan components

Každý plán includes:

- Email marketing (campaigns, templates)
- Marketing automation (depth varies per plan)
- Basic CRM (contacts, lists, tags)
- Forms (basic)
- Site tracking
- Reports (basic)

### 3.2 Enhanced CRM (Pipelines)

Add-on pro **B2C / e-commerce / SMB**:

- Visual sales pipelines
- Deal management
- Stages + probability
- Sales automations
- Deal scoring
- Sales reports
- Email sequences (1:1)
- Tasks & activities
- Account management
- 1:1 emails

### 3.3 Sales Engagement (B2B advanced)

Add-on pro **B2B sales-led**:

- Vše z Pipelines +
- **AI-powered win probability**
- **Sentiment analysis** (analyzes 1:1 email replies)
- **Automated 1:1 emails**
- **Email sequences** (multi-step)
- **AI insights**
- **Salesforce integration** deeper
- **More custom objects**

### 3.4 SMS module

- Send SMS from automations
- Standalone SMS campaigns
- Pre-paid credits
- Per-country pricing
- US, UK, Canada, AU primary; growing other regions

### 3.5 WhatsApp Business

- WhatsApp Business API integration
- Bulk WhatsApp messages
- WhatsApp v automation flows
- 1:1 customer service (CSAT)
- Enterprise-level support

### 3.6 MMS (US only)

- Multimedia messages (images, video)
- US carriers only
- Add-on credit-based

### 3.7 Transactional Email

- **Postmark-powered** (acquisition 2022)
- High deliverability transactional emails
- Order confirmations
- Password resets
- App notifications
- Separate from marketing channels
- Pre-paid credits

### 3.8 Custom Reporting

- Advanced report templates
- Custom dashboards
- Scheduled reports
- Export options
- Multi-account aggregate views

### 3.9 Modular benefit

Per oficiální ActiveCampaign claim:
_"ActiveCampaign's modular approach means you choose the plan and add-ons that fit your current needs, without being forced into bundles or paying for features you don't use."_

---

## 4. Lists, Contacts, Tags, Segmentation

### 4.1 Contacts (core entity)

- **Standard fields:** name, last name, email, phone, organization
- **Custom fields** (unlimited per plan):
  - Text, paragraph, number, date, dropdown, list box, radio, checkbox, hidden
  - **Custom objects** (Enterprise) – relational data extended
- **Contact tags** – flat tag system (multi-tag per contact)
- **Lists** – grouping mechanism (different from tags)

### 4.2 Lists

Lists v ActiveCampaign jsou **multi-list architektura** (like Mailchimp Audiences, ale Multi-list):

- Contact can be in **multiple lists simultaneously**
- Per-list opt-in tracking
- Per-list opt-out tracking
- List-specific tags / segments
- Easy migration between lists via automation

### 4.3 Tags

- **Flat tag system** (no hierarchy)
- **Multi-tag per contact** unlimited
- Add via:
  - Manual
  - Automation action
  - Form submission
  - Import
  - API
- Tags fire automations as triggers
- Tags as segment criteria
- **Tag explorer** – visual tag management

### 4.4 Custom fields

#### Types

- **Text** (single line)
- **Paragraph** (multi-line)
- **Number**
- **Date** (use pro date-based automations)
- **Dropdown** (single select)
- **List box** (multi-select)
- **Radio buttons**
- **Checkbox** (single or multi)
- **Hidden** (technical fields)

#### Use cases

- Customer attributes (industry, role, segment)
- Date triggers (birthday, anniversary, renewal)
- Survey responses (preferences, NPS)
- E-commerce data (LTV, AOV, last purchase)
- Lead scoring inputs

### 4.5 Custom Objects (Enterprise)

- **Custom data tables** beyond standard contact/account fields
- Examples:
  - Products viewed
  - Subscriptions held
  - Membership tiers
  - Custom event records
- Relational data – contact has many custom objects
- Use v segmentation + automation

### 4.6 Segmentation

**Powerful segment builder:**

#### Filter criteria

- **Contact data** (fields, tags, lists)
- **Email engagement** (opened/clicked specific campaigns)
- **Site activity** (visited specific pages, time spent)
- **Custom event data**
- **E-commerce data** (orders, AOV, products)
- **Lead score**
- **Geolocation** (IP-based)
- **Date conditions**
- **Custom fields**
- **Custom objects** (Enterprise)
- **Deal data** (CRM)

#### Operators

- AND, OR, NOT
- Nested conditions (parentheses)
- Equal, contains, between, before/after, etc.

#### Dynamic vs. static

- **Saved segments** – dynamic, auto-update
- **Real-time evaluation** – matches always current

#### Segment types

- **Smart segments** – AI-suggested based on patterns (Active Intelligence)
- **Predefined** – common scenarios
- **Custom** – fully flexible

### 4.7 Subscriber status

- **Active** (subscribed, can receive)
- **Unsubscribed** (opted out)
- **Bounced** (hard bounce)
- **Spam complaint**
- **Unconfirmed** (form filled, awaiting double opt-in)
- **Deleted**

### 4.8 Import options

- **CSV upload**
- **Copy-paste**
- **Manual entry**
- **API import**
- **Integration sync** (Shopify, etc.)
- **Migration tool** (from competitor platforms)
- **Field mapping** advanced
- **Duplicate handling** (update vs. skip)
- **Tag with import source**
- **GDPR consent verification**

### 4.9 Export

- CSV download
- Filter before export
- Custom fields included
- Tag information
- Per-contact full data export (GDPR)

---

## 5. Email Marketing & Campaigns

### 5.1 Campaign types

| Type               | Use case                           |
| ------------------ | ---------------------------------- |
| **Standard**       | Normal newsletter/promo            |
| **Automated**      | Sent from automation workflow      |
| **Auto-responder** | Single email triggered by signup   |
| **RSS triggered**  | Auto-generated from RSS feed       |
| **Split test**     | A/B test                           |
| **Date-based**     | Send on specific date or recurring |

### 5.2 Drag-and-drop editor

- **Modern visual builder**
- **Mobile-responsive** automatic
- **Block-based** structure:
  - Text, image, button, video, divider, spacer
  - Social icons, RSS feed
  - HTML block
  - **Conditional content blocks** (Pro+) – show/hide based on segment
  - **Personalization tags**
  - **Site message blocks**
- **Live preview** (desktop, tablet, mobile)
- **Saved blocks** library
- **Brand kit** (colors, fonts, logos)

### 5.3 Templates

- **150+ pre-built templates** (Starter+)
- **Categories:** newsletter, promotional, e-commerce, event, course
- **Customizable** all elements
- **Template gallery** organized
- **Custom HTML templates** (Plus+)

### 5.4 Personalization

- **Personalization tags** syntax `%FIRSTNAME%`, `%FIELDNAME%`
- **Default values** for missing data
- **Conditional content blocks** (Pro+):
  - Show/hide content based on segment
  - Per-recipient different content
- **Dynamic content** based na lead score, tags, behavior
- **Personalized images** (some configurations)

### 5.5 A/B testing

- **Subject line, sender, content** variants
- **Up to 5 variants**
- **Sample size** configurable
- **Winner determination:** open rate, click rate, replies, conversions
- **Auto-winner send** to remainder
- **A/B in automations** (Pro+) – test workflow paths

### 5.6 Predictive Sending (Pro+)

- **AI determines optimal send time per recipient**
- Based on each individual's engagement history
- Significantly higher open rates typical (15-30% increase)
- ML model trained per account
- Set as default for campaigns

### 5.7 Conditional Content (Pro+)

- **Single email, multiple versions**
- Conditions per block:
  - Segment membership
  - Custom field value
  - Tag presence
  - Behavior
  - Lead score range
- Same email "renders" differently per recipient

### 5.8 Send options

- **Send now**
- **Schedule** date + time
- **Predictive sending** (per recipient AI)
- **Time-zone based** (recipient's local time)
- **Account & industry-based** send times (Active Intelligence)
- **Throttled delivery** (gradual send)

### 5.9 Email design system

- **Brand kit** (colors, fonts, logo)
- **Saved sections** – reusable email blocks
- **Master templates**
- **Variable insert helpers**
- **AMP for Email** support (some features)

### 5.10 RSS-driven campaigns

- Auto-generated from RSS feed
- Frequency (daily, weekly, etc.)
- Custom template per RSS

---

## 6. Marketing Automation (flagship)

ActiveCampaign's **flagship feature** – often cited as **best automation engine v mid-market segmentu**.

### 6.1 Automation builder

**Visual canvas**:

- **Drag-and-drop nodes**
- **Branching workflows**
- **Nested conditions**
- **Multi-channel** (email, SMS, push, WhatsApp)
- **Real-time evaluation**
- **Live testing** (preview as contact)

### 6.2 Triggers (entry points)

#### Behavioral

- **Subscribes** to list
- **Tag added/removed**
- **Submits form**
- **Email opened/clicked**
- **Visits page** (site tracking)
- **Custom event** triggered (API)
- **Replies to email** (1:1)
- **Site message viewed/clicked**

#### Transactional / E-commerce

- **Order placed**
- **Order updated**
- **Product purchased** (specific)
- **Cart abandoned**
- **Subscription event** (started, ended, renewed)
- **Refund / cancellation**

#### Time-based

- **Date in field** (birthday, anniversary, renewal)
- **Specific date** (one-time)
- **Recurring** (yearly, monthly)
- **Anniversary trigger** (recurring annually)

#### CRM-related

- **Deal stage changed**
- **Deal owner assigned**
- **Deal won/lost**
- **Task completed**
- **Account updated**

#### Multi-trigger (Plus+)

- **Up to 5 triggers** per automation
- **OR logic** – any trigger fires entry
- Useful for multi-entry path workflows

### 6.3 Actions (nodes)

#### Sending

- **Send email** (designed inline)
- **Send notification email** (internal team)
- **Send SMS** (add-on)
- **Send WhatsApp** (add-on)
- **Send site message** (Plus+)

#### Contact manipulation

- **Add/remove tag**
- **Add/remove from list**
- **Update field** (custom fields)
- **Update contact lead score**
- **Subscribe to list** (different)
- **Unsubscribe** from list/all

#### Deal/CRM actions (s CRM add-on)

- **Create deal**
- **Update deal stage**
- **Update deal owner**
- **Update deal value**
- **Create task**
- **Update lead score**

#### Conditions / Logic

- **If/Else** (branching based on condition)
- **Wait** (delay – time or until event)
- **Goal** (conversion event, exit on success)
- **Split test (A/B)** workflow paths
- **Math operation** (number fields)
- **Notify user** (internal alert)

#### External

- **Webhook** – call external URL
- **API call** – trigger external action

### 6.4 Conditional logic

```
If/Else node:
- Single condition (e.g. "Has tag 'VIP'")
- Multiple conditions (AND/OR/NOT)
- Nested conditions (parentheses)
- Wait conditions (wait until event)
- Goal-based exits
```

Pro+ adds:

- **A/B test in workflows** (split paths, measure performance)
- **Conditional content** within automation emails

### 6.5 Goals

- **Define conversion event** mid-workflow
- **Exit when goal met** (success path)
- **Track conversion rate** per workflow
- Goals can be:
  - Tag added
  - Custom field value
  - Specific page visited
  - Order placed
  - Custom event
  - Lead score threshold

### 6.6 Wait nodes

- **Time wait** (X minutes/hours/days/weeks)
- **Wait until specific date** (Saturday 9 AM)
- **Wait until event** (Cart purchased, page visited)
- **Wait until condition met**
- **Maximum wait** option (stop waiting after X)

### 6.7 Common automation patterns

#### Welcome series

```
Trigger: Subscribes to "Newsletter" list
   ↓
Wait 1 hour
   ↓
Send Email 1: "Welcome + brand story"
   ↓
Wait 3 days
   ↓
Send Email 2: "Free resource / lead magnet"
   ↓
Wait 5 days
   ↓
Goal: Visited pricing page?
   YES → Send sales sequence
   NO → Continue education series
   ↓
Wait 7 days
   ↓
Send Email 3: "Customer success story"
   ↓
... (continues based on engagement)
```

#### Cart abandonment

```
Trigger: Cart abandoned (>1 hour without checkout)
   ↓
Wait 1 hour
   ↓
Send Email: "Forgot something?" with cart items
   ↓
Wait 24 hours
   ↓
If/Else: Purchased?
   YES → Goal achieved (exit)
   NO → Send Email: 10% discount
   ↓
Wait 48 hours
   ↓
If/Else: Purchased?
   YES → Goal achieved
   NO → Send SMS (if opted in): final reminder
   ↓
Exit
```

#### Lead nurturing (B2B)

```
Trigger: Downloaded whitepaper
   ↓
Add tag "Lead: whitepaper [Topic]"
   ↓
Wait 2 days
   ↓
Send 1:1 sales email (template, personalized)
   ↓
Wait 5 days
   ↓
If/Else: Lead score > 50?
   YES → Create CRM Deal in "Qualified" stage
        Assign to SDR
        Notify SDR via Slack
        End automation (sales takes over)
   NO → Continue nurturing
   ↓
Wait 7 days
   ↓
Send case study email
   ↓
... (continues building lead score)
```

#### Customer onboarding

```
Trigger: Order placed (first time)
   ↓
Wait 1 day
   ↓
Send Email: "Welcome + getting started guide"
   ↓
Wait 3 days
   ↓
Send Email: Tutorial video
   ↓
If/Else: Watched video (custom event)?
   YES → Send "What's next" email
   NO → Send reminder + simpler tutorial
   ↓
Wait 7 days
   ↓
Send NPS survey
   ↓
If/Else: Score >= 9?
   YES → Add to "Promoters" list
        Send referral request
   ELSE → Add to feedback follow-up flow
```

### 6.8 Automation management

- **Bulk operations** – pause, activate, delete multiple
- **Templates** – save automation as template
- **Workflow status:**
  - Active
  - Paused
  - Draft
  - Archived
- **Re-entry rules** per automation
- **Statistics per node**

### 6.9 Per-group automation permissions (advanced)

Per oficiální docs:

- **Account Admin** can see all automations
- **User groups can have restricted access** to specific automations
- Per-group **Marketing vs. Sales** automation isolation
- Granular control over who can edit which workflows

### 6.10 Automation analytics

- **Per-automation stats:**
  - Active contacts in workflow
  - Completed
  - Goal achieved (conversion rate)
  - Drop-off per step
- **Path analysis** – see which branches most popular
- **Time to conversion**
- **Revenue attributed** per workflow (e-commerce)

---

## 7. Pre-built automation recipes (900+)

ActiveCampaign **knihovna 900+ pre-built automation recipes**.

### 7.1 Recipes overview

- **Free recipes** (downloadable from automation library)
- **Community-contributed** s ActiveCampaign-verified
- **Categories:** Welcome, E-commerce, Lead Gen, B2B Sales, Customer Success, Re-engagement, Education, Webinar, Course, Event
- **Per-vertical:** retail, SaaS, agency, consultancy, non-profit, real estate, etc.

### 7.2 How recipes work

```
Marketer browses Recipe Library
   ↓
Filters by category, use case, vertical
   ↓
Preview recipe (visual overview)
   ↓
Click "Use this recipe"
   ↓
Recipe imported into account
   ↓
Customize:
- Add specific content (templates)
- Adjust timing
- Modify branching for business
- Configure lists/tags
   ↓
Test
   ↓
Activate
```

### 7.3 Recipe categories

#### Welcome & Onboarding

- Single welcome email
- Welcome series (3-5 emails)
- Course welcome
- Membership welcome
- Free trial onboarding

#### E-commerce

- Abandoned cart (single email)
- Multi-step abandoned cart
- Post-purchase upsell
- Browse abandonment
- Win-back lapsed customer
- VIP customer flow
- Birthday discount
- Anniversary
- Replenishment reminder

#### Lead Generation (B2B)

- Lead magnet delivery
- Educational nurturing
- Webinar series
- Free trial conversion
- Sales-qualified handoff

#### Customer Success

- NPS survey + follow-up
- Renewal reminders
- Upsell automation
- Onboarding milestones
- Customer education

#### Re-engagement

- Win-back inactive (4-step)
- Sunset policy (final attempt + suppress)
- Lapsed customer (e-commerce)
- Re-permission campaigns

#### Course & Education

- Course welcome
- Lesson reminders
- Course completion
- Upsell to advanced courses
- Drip educational content

#### Event

- Event registration confirmation
- Event reminders (X days, X hours)
- Event follow-up
- Webinar attendee vs. no-show

### 7.4 Recipe quality

- **ActiveCampaign-vetted recipes** s tutorials
- **Community-shared** with ratings
- **Frequently updated** s best practices
- **Multi-language support** (some recipes)

### 7.5 Recipe vs. building from scratch

| Aspekt                  | Recipe         | From scratch |
| ----------------------- | -------------- | ------------ |
| Speed                   | 5-15 min       | Hours        |
| Best practices built-in | ✅             | depends      |
| Customization required  | ✅ (minor)     | full         |
| Learning curve          | Low            | Higher       |
| Originality             | Common pattern | Unique       |

---

## 8. Active Intelligence AI

ActiveCampaign's **AI engine** – mix of predictive ML + generative AI.

### 8.1 Active Intelligence overview

**Suite of AI capabilities** vyvíjená napříč platformou:

### 8.2 Predictive Sending (Pro+)

- **AI determines optimal send time per recipient**
- Based on individual engagement history
- ML model trained per account
- Set as default for campaigns
- Significant open rate boost typical

### 8.3 Smart Send Times

- **Account & industry-based** optimal send times
- Available v all plans
- Less granular than Predictive Sending (per-account vs. per-recipient)

### 8.4 Generative AI (Plus+)

- **AI-powered subject line generation**
- **Email content generation** (draft from prompt)
- **AI rewriter** – tone adjustment
- **Smart suggestions** during composition

### 8.5 Win Probability (Sales Engagement add-on)

- **AI calculates likelihood of deal closing**
- Based on:
  - Deal stage history
  - Contact engagement
  - Email response patterns
  - Time in pipeline
  - Activity volume
- Helps prioritize sales effort
- Predict deal forecast

### 8.6 Sentiment Analysis (Sales Engagement)

- **Analyzes 1:1 email replies**
- Determines emotional tone (positive, negative, neutral)
- Flags negative responses for follow-up
- Identifies engaged vs. cold prospects

### 8.7 Smart Segments

- **AI suggests segments** based on patterns
- Identifies high-value cohorts
- Recommends segmentation for engagement boost

### 8.8 Lead scoring (AI-enhanced)

- **Rule-based + AI-enhanced**
- Behavior-based scoring
- Decay over time
- Threshold triggers

### 8.9 AI roadmap 2026

- More **autonomous AI features** evolving
- **AI-driven workflow suggestions**
- **Predictive segment recommendations**
- **AI-powered content personalization**
- Catching up to Klaviyo Marketing Agent / HubSpot Breeze

### 8.10 Active Intelligence limitations

- **Generative AI less mature** than HubSpot Breeze
- **No autonomous agents** like Klaviyo Customer Agent
- **Focus on predictive ML** historically strong
- **Newer generative features** added 2024-2025

---

## 9. Forms & Landing Pages

### 9.1 Forms

#### Form types

- **Inline** (embed v page)
- **Floating bar** (top/bottom of page)
- **Modal** (popup)
- **Slide-in** (corner notification)
- **Floating box** (sticky on page)

#### Features

- **Drag-drop builder**
- **Field types:** text, email, phone, dropdown, checkbox, radio, date, hidden, paragraph
- **Conditional fields** (show/hide based on previous answers)
- **Multi-step forms** (progressive profiling)
- **GDPR consent** fields
- **Captcha** support
- **Custom CSS**
- **A/B test forms** (Plus+)
- **Trigger automations** on submit
- **Add tags / lists** on submit
- **Pre-fill** for known contacts

### 9.2 Form triggers

- **Time on page**
- **Scroll depth %**
- **Exit intent**
- **Click on element**
- **Frequency caps** per visitor
- **URL targeting**
- **Returning vs. new visitor**

### 9.3 Landing Pages (Plus+)

- **Drag-drop builder**
- **Templates** library
- **Mobile responsive**
- **Custom domains**
- **A/B testing**
- **Forms integration**
- **SEO settings**
- **Connect to automations**
- **Custom HTML/CSS** (Pro+)

### 9.4 Use cases

- Lead capture (newsletter, free trial)
- Webinar registration
- Product launch
- Event signup
- Course landing
- Squeeze pages

---

## 10. Site Messages a Site Tracking

### 10.1 Site Tracking

**JavaScript snippet on website:**

- Track page views per contact
- Time on page
- Custom events
- E-commerce events
- Returning vs. new visitor

Use cases:

- **Behavior-based automations** ("Visited pricing page" → sales follow-up)
- **Lead scoring** updates
- **Personalization** triggers

### 10.2 Site Messages (Plus+)

- **In-website messages**
- Show on specific pages
- Personalized per contact
- Triggers:
  - Page visit
  - Time on page
  - Scroll depth
  - Exit intent
  - Custom segment match
- Types:
  - Banner
  - Modal popup
  - Slide-in
  - Notification

### 10.3 Use cases

#### Returning customer

```
Visitor returns to site (logged in)
   ↓
Site Tracking identifies
   ↓
Site Message: "Welcome back, [Name]! Here's a 10% code"
```

#### VIP segment

```
VIP customer visits product page
   ↓
Site Message: "Exclusive VIP pricing on this product"
```

#### Behavior trigger

```
Visitor browsed 3+ products in last hour
   ↓
Site Message: "Need help choosing? Chat with us"
```

### 10.4 Integrate s automation

```
Trigger: Site Message clicked
   ↓
Add tag "Engaged Visitor"
   ↓
Send follow-up email
```

---

## 11. Integrated CRM: Deals & Pipelines

ActiveCampaign **integrated CRM** je add-on (Pipelines / Sales Engagement).

### 11.1 CRM structure

```
Pipeline (visual sales process)
├── Stages (Lead, Qualified, Proposal, Negotiation, Won, Lost)
│   ├── Deals (opportunities)
│   │   ├── Deal owner
│   │   ├── Deal value
│   │   ├── Probability
│   │   ├── Expected close date
│   │   ├── Tasks
│   │   ├── Activities
│   │   ├── Notes
│   │   ├── Email history
│   │   ├── Associated contacts (with Deal Roles)
│   │   └── Custom fields
│   └── ...
└── ...
```

### 11.2 Pipelines

- **Multiple pipelines per account** (e.g. New Business, Renewals, Partnerships)
- **Customizable stages** per pipeline
- **Pipeline permissions** – restrict access per user group
- **Pipeline dashboards** – per-pipeline analytics

### 11.3 Deal management

#### Deal stages

- **Custom stages** per pipeline
- **Stage probabilities** (% of close)
- **Forecast value** auto-calculated
- **Stage automation** (auto-move based on conditions)

#### Deal fields

- **Standard:** value, expected close, owner, contact, account
- **Custom fields** per deal
- **Custom objects** (Enterprise) – relational data

#### Deal automation

- **Move to next stage** based on event
- **Update deal field** based on contact action
- **Create task** when entering stage
- **Notify owner** on action
- **Update lead score** based on deal stage

### 11.4 Deal Roles

Per oficiální docs:

- **Default roles:** Contributor, Decision Maker
- **Custom roles** can be created
- **Per contact per deal** role assignment
- **Roles visible only on Deal Details page**
- **Cannot be assigned from contact profile**
- **Use for segmentation** v marketing

Example use:

```
Deal: "Enterprise SaaS purchase"
- Contact A: Decision Maker
- Contact B: Contributor
- Contact C: Influencer (custom role)
- Contact D: Champion (custom role)
```

### 11.5 Deal owner

- **Each deal has owner** (single user)
- **Permissions:**
  - Admin sees all deals
  - **Deal owners see only their deals** (if group setting enables)
  - Per-pipeline group access control
- **Reassignment:**
  - Admin can reassign
  - Permission to "Reassign Accounts"
- **Owner-based filtering** v reports

### 11.6 1:1 Emails (from CRM)

- **Send 1:1 emails** from deal record
- **Templates** pre-built
- **Automation actions:** "Send a 1:1 email"
- **Track open + click**
- **Reply parsing** (sentiment analysis Sales Engagement)
- **Email permissions:**
  - Per user setting
  - "Only I can see emails from this address" vs. "Anyone can see"

### 11.7 Tasks

- **Task types:** Call, Email, Meeting, Custom
- **Assign to user**
- **Due date** + reminder
- **Auto-create** v automation
- **Mobile app** task management
- **Task views** per user

### 11.8 Sales automation

- **Sales automations** trigger on:
  - Deal stage change
  - Deal field update
  - Email reply
  - Task completion
  - Custom event
- **Actions:**
  - Send 1:1 email
  - Create task
  - Move deal stage
  - Update deal field
  - Notify user
  - Update lead score

### 11.9 Reports per deal

- **Deal value summary**
- **Conversion rate** per stage
- **Time in stage** analysis
- **Sales rep performance**
- **Forecast** (probability-weighted)
- **Pipeline velocity**
- **Win/loss analysis**

---

## 12. Accounts (companies / B2B)

ActiveCampaign added **Accounts** layer pro B2B – company-level data.

### 12.1 Account structure

```
Account (company)
├── Account fields (industry, size, region, custom)
├── Contacts (1 to many relationship)
│   ├── Contact A
│   ├── Contact B
│   └── ...
├── Deals (associated)
├── Activities timeline
├── Notes
└── Account owner
```

### 12.2 Account fields

#### Standard fields

- Account name
- Website
- Industry
- Size (employees)
- Address
- Phone

#### Custom account fields

- Per-account custom data
- Use v segmentation

### 12.3 Account ↔ Contact relationship

- **One contact per one account** (limitation!)
- Contact can be removed from account, reassigned
- **Multiple contacts per account**
- Account view shows all associated contacts

### 12.4 Account activity stream

- **Recent activities** related to account
- 4 types of email events
- Deal updates
- Task activities
- Notes added
- **3 latest shown** + "View all"

### 12.5 Account ownership

- **Account owner** field
- **Only Admins** and users with **"Reassign Accounts"** permission can change owner
- **Per-account permissions** less granular than deals
- All users see account info (no permission check)

### 12.6 Account use cases

- **B2B target account marketing** (ABM)
- **Account-based reporting** (account-level metrics)
- **Cross-contact orchestration** (multiple decision-makers)
- **Account expansion** (existing customer upsell)
- **Account segmentation** in marketing

### 12.7 Account vs. Contact tags

- Tags on contact (individual level)
- Tags on account? Limited – primarily contact-based
- Custom account fields are alternative

---

## 13. Sales Engagement (1:1 emails, AI)

**B2B-focused add-on** s advanced sales features.

### 13.1 Sales Engagement vs. Pipelines

| Feature                | Pipelines (B2C) | Sales Engagement (B2B) |
| ---------------------- | --------------- | ---------------------- |
| Pipelines + stages     | ✅              | ✅                     |
| Deal management        | ✅              | ✅                     |
| Tasks                  | ✅              | ✅                     |
| 1:1 emails             | basic           | advanced               |
| **AI Win Probability** | ❌              | ✅                     |
| **Sentiment Analysis** | ❌              | ✅                     |
| **Email sequences**    | ❌              | ✅                     |
| **AI insights**        | ❌              | ✅                     |
| **Salesforce deeper**  | basic           | ✅                     |
| Pricing                | lower           | higher                 |

### 13.2 Email sequences (Sales Engagement)

- **Multi-step 1:1 email sequences**
- **Auto-pause** if reply
- **Branch logic** based on reply sentiment
- **Templates** for B2B outreach
- **Track per-sequence metrics**

### 13.3 Win Probability AI

- **% likelihood deal closes**
- Updated continuously
- Based on:
  - Deal stage history
  - Contact engagement (emails, site visits)
  - Email response patterns
  - Time in pipeline
  - Activity volume
- **Forecast** weighted by win probability

### 13.4 Sentiment Analysis

- **Analyzes 1:1 email replies**
- Tone detection: positive, neutral, negative
- **Flags negative replies** for immediate follow-up
- **Identifies engaged** vs. cold prospects
- **Sentiment trend** per contact

### 13.5 AI insights

- Recommendations per deal:
  - "Reach out – contact hasn't engaged 14 days"
  - "Send case study – contact viewed pricing"
  - "Sentiment improving – good time for proposal"

---

## 14. SMS, WhatsApp, MMS channels

### 14.1 SMS

#### Setup

- **Add-on** (Plus+)
- **Pre-paid credits** (recurring monthly)
- Per-country pricing
- Sender ID config per country

#### Features

- **Bulk SMS campaigns**
- **SMS v automation actions**
- **Two-way SMS** (limited regions)
- **STOP keyword handling**
- **Quiet hours**
- **TCPA compliance** (US)
- **Personalization** s merge fields
- **Link tracking** (shortened URLs)
- **Opt-in tracking**

#### Pricing

- **$0.015–$0.045 per SMS** typical
- Varies podle země a sender ID setup
- Credits per month

### 14.2 MMS (US only)

- **Multimedia messages** (images, video)
- **US carriers only**
- **Add-on credit-based**
- Higher cost per message vs. SMS
- Limited use case beyond US

### 14.3 WhatsApp Business

#### Setup

- **WhatsApp Business API**
- **Phone number verification**
- **Business profile setup**
- **Approved templates** for transactional + marketing

#### Features

- **Bulk WhatsApp messages**
- **WhatsApp v automation flows**
- **Two-way conversations**
- **Rich media** (images, video, documents)
- **Template messages**
- **Conversation tracking**
- **Enterprise-level support**

#### Pricing

- **Combine s Plus/Pro/Enterprise plan**
- Specific **WhatsApp plans** available
- Per-conversation pricing (WhatsApp Business)

#### Use cases

- Customer service
- Order confirmations
- Shipping notifications
- Marketing (with consent)
- Re-engagement
- 1:1 sales

### 14.4 Multi-channel orchestration

```
Workflow: Cart abandonment

Step 1: Email (immediate after cart abandon)
   ↓
Wait 24h
   ↓
If/Else: Email opened?
   YES → Wait + see if purchase happens
   NO → SMS (opt-in required)
   ↓
Wait 48h, if no purchase:
   WhatsApp message: personal touch
   ↓
Final: 10% discount email
```

---

## 15. Transactional Email (Postmark)

### 15.1 Postmark acquisition

- **ActiveCampaign acquired Postmark v 2022**
- Postmark = transactional email specialist
- High-deliverability reputation
- Integrated into ActiveCampaign platform 2023+

### 15.2 Transactional Email add-on

- **Pre-paid recurring credits**
- **Use for non-marketing emails:**
  - Order confirmations
  - Shipping notifications
  - Password resets
  - App notifications
  - Receipts
- **Separate infrastructure** from marketing
- **Different IP pools** (transactional-only)
- **Higher deliverability** focus

### 15.3 Postmark API

- **Modern REST API**
- **High throughput**
- **Webhook events**
- **Templates** with variables
- **Inbound parsing**
- **Email validation**

### 15.4 Combined marketing + transactional

ActiveCampaign advantage:

- **Single platform** for marketing + transactional
- **Unified contact view** (transactional events visible in profile)
- **Trigger marketing workflows** from transactional events (order placed → post-purchase flow)

Vs. competitors:

- **Mailchimp + Mandrill** (similar setup)
- **Brevo** (unified native, less separate)
- **MailerLite + MailerSend** (separated, awkward)
- **Klaviyo** (limited transactional)

### 15.5 Pricing

- **Pre-paid monthly credits**
- Varies podle volume
- **Higher per-message cost** than SMTP relays alone
- But includes platform integration value

---

## 16. Lead Scoring

### 16.1 Lead Scoring overview

- **Available na Plus+**
- **Rule-based scoring**
- **Behavior-based**
- **Decay over time**
- **Threshold triggers**

### 16.2 Scoring rules

#### Point sources

- **Email engagement** (+5 per open, +10 per click)
- **Page visits** (+15 visited pricing page)
- **Form submissions** (+25 per submit)
- **Custom events** (configurable)
- **Tag added** (varies)
- **Deal stage** changes (in CRM)

#### Negative scoring (decay)

- **Time-based decay** (-5 per week without engagement)
- **Negative actions** (-10 unsubscribed from list, -20 bounce)

### 16.3 Lead Score field

- **Numerical custom field**
- **Auto-updates** based on rules
- **Use v segmentation**:
  - "Lead score > 50"
  - "Lead score increased by 20 in 30 days"
- **Use v automation triggers**:
  - "Lead score >= 100" → notify sales

### 16.4 Multi-scoring (Pro+)

- **Multiple score fields** per contact
- Examples:
  - **Marketing engagement score**
  - **Sales-ready score**
  - **Product affinity score** (per product line)
- Each scores different aspect

### 16.5 Use cases

- **MQL (Marketing Qualified Lead) identification:** score > X
- **SQL (Sales Qualified Lead) handoff:** notify sales when threshold
- **Re-engagement:** re-engage when score declines
- **Personalization:** different content per score range
- **Segment prioritization:** high-score = priority

---

## 17. Reports & Custom Reporting

### 17.1 Standard reports

#### Campaign reports

- Sent, delivered, bounced
- Opens (unique + total), open rate
- Clicks, CTR, top links
- Geographic distribution
- Device + email client
- Comparison to previous campaigns

#### Automation reports

- Per-automation stats
- Goal achievement rate
- Per-step performance
- Drop-off analysis
- Time to conversion

#### Contact reports

- List growth over time
- Source attribution
- Engagement scores
- Activity timeline

#### Form reports

- Submissions
- Conversion rate
- Per-form A/B results

#### Site tracking reports

- Top pages visited
- Per-contact site activity
- Conversion funnel

### 17.2 Deal & CRM reports

- **Pipeline overview**
- **Deal stage conversion**
- **Sales rep performance**
- **Time in stage**
- **Win/loss analysis**
- **Forecast** (probability-weighted)
- **Activity reports**

### 17.3 E-commerce reports (Plus+)

- **Revenue per campaign**
- **Revenue per automation**
- **Top products sold**
- **Customer lifetime value** (basic)
- **Order data**
- **Conversion attribution**

### 17.4 Attribution (Pro+)

- **Conversion tracking**
- **Multi-touch attribution**
- **Source attribution**
- **Per-channel revenue**
- **ROI per campaign**

### 17.5 Custom Reporting (add-on)

- **Advanced report templates**
- **Custom dashboards**
- **Drag-drop dashboard builder**
- **Scheduled reports** (email delivery)
- **Export options** (CSV, PDF)
- **Filters per dashboard**
- **Multi-account aggregate** (Enterprise)

### 17.6 Active Intelligence reports

- **Predictive sending performance**
- **Win probability accuracy**
- **AI-driven insights**
- **Smart suggestions**

---

## 18. E-commerce integrations

### 18.1 Native e-commerce integrations

#### Shopify (deepest)

- **Customer + order + product sync**
- **Real-time webhooks**
- **Abandoned cart events**
- **Product catalog**
- **Order data v automations**
- **Revenue attribution**

#### WooCommerce

- **Plugin-based**
- **Same depth as Shopify**
- WordPress native

#### BigCommerce

- **Native integration**
- **Order + customer sync**

#### Magento (Adobe Commerce)

- **Native integration**
- **Pro+ plan**

#### Shopify Plus

- **Enhanced features**
- **Pro+ plan**

### 18.2 E-commerce automation patterns

#### Abandoned cart

- Triggered by cart event
- Dynamic cart contents in email
- Multi-step recovery

#### Post-purchase

- Order placed trigger
- Welcome new customer
- Cross-sell related products
- Review request
- Replenishment (if repeating product)

#### Browse abandonment

- Track product views
- Trigger if no purchase in X hours
- Show recently viewed in email

#### Customer LTV

- Track lifetime value
- Segment by CLV bands
- VIP treatment for top spenders

#### Win-back

- No purchase in X days → automation
- Multi-step re-engagement
- Final offer

### 18.3 Product catalog

- **Sync from e-commerce platform**
- **Use products in emails** (dynamic blocks)
- **Personalized recommendations** (basic)
- **Product feeds** for personalization

### 18.4 Revenue attribution

- **Per-email revenue**
- **Per-automation revenue**
- **Per-campaign ROI**
- **Conversion windows** configurable
- **Multi-touch attribution** (Pro+)

### 18.5 E-commerce reporting

- **Revenue overview**
- **Top products attributed**
- **Per-segment revenue**
- **Conversion rate by source**
- **Customer LTV trends**

---

## 19. API, Integrations, App Marketplace (970+)

### 19.1 API

- **REST API** v3
- **API key authentication** (per user)
- **JSON request/response**
- **Rate limits** vary by plan
- **Documented** comprehensively

### 19.2 API endpoints

- `/contacts` – CRUD contacts
- `/lists` – list management
- `/segments` – segmentation
- `/campaigns` – campaign management
- `/automations` – workflow management
- `/deals` – CRM deals
- `/accounts` – B2B accounts
- `/tags` – tag management
- `/forms` – form data
- `/events` – custom event tracking
- `/transactional` – transactional email (Postmark)
- `/reports` – analytics

### 19.3 Webhooks

- **Per-event subscriptions**
- **Real-time event notifications**
- **Configurable per integration**
- Events:
  - Contact created/updated/unsubscribed
  - Campaign sent/opened/clicked
  - Automation completed
  - Deal events
  - Form submissions

### 19.4 Native integrations (970+)

**Largest integration marketplace v mid-market segment**.

#### E-commerce

Shopify, WooCommerce, BigCommerce, Magento, Wix Stores, Squarespace Commerce, custom

#### CRM

Salesforce (deep), Microsoft Dynamics, HubSpot CRM, Pipedrive, Copper, Zoho CRM

#### Payment

Stripe, PayPal, Square

#### Forms / Surveys

Typeform, Jotform, Google Forms, SurveyMonkey, Gravity Forms, Ninja Forms

#### Productivity

Slack, Microsoft Teams, Google Workspace, Office 365, Asana, Trello, Monday.com, ClickUp

#### Calendar / Booking

Calendly, Acuity Scheduling, ScheduleOnce

#### Webinars

Zoom, GoToWebinar, WebinarJam, Demio

#### Chat

Intercom, Drift, LiveChat, Olark

#### Social

Facebook (Custom Audiences), Instagram, Twitter/X

#### Ads

Facebook Ads, Google Ads, Bing Ads, LinkedIn Ads (audience sync)

#### Content / CMS

WordPress, Webflow, Wix

#### iPaaS

**Zapier** (deep), **Make (Integromat)**, Tray.io, Workato, Pabbly Connect, Integrately

#### Specialized

ManyChat (chatbots), Convertful (popups), Sumo (lead gen), Privy, OptinMonster

### 19.5 ActiveCampaign App Store

- **Browse 970+ apps**
- **Categories** organized
- **Verified vs. community apps**
- **Easy installation** (mostly OAuth)
- **Documentation per integration**

### 19.6 Integration depth varies

- **Native integrations** (best) – real-time, bi-directional
- **Zapier integrations** (decent) – may have delays
- **Custom API** – full control

### 19.7 Mobile apps

- **iOS app** (contacts, campaigns, deals)
- **Android app**
- **Lighter than desktop UI**

---

## 20. Limity a nedostatky

### 20.1 Pricing concerns

- **No free plan** (vs. Mailchimp, MailerLite, Brevo)
- **Pricing scales aggressively** as list grows
- **November 2025 billing change** – all contacts count (new users)
- **Add-ons stack** quickly:
  - SMS credits
  - WhatsApp credits
  - CRM add-on
  - Transactional credits
  - Custom Reporting
- **Doubled bills** reported by some users (2024-2025 pricing changes)
- **Mid-market focus** = nedostupné pro small businesses

### 20.2 Starter plan limitations

- **Severely limited automation** (100 actions, 1 trigger)
- **No landing pages**
- **No AI features**
- **No predictive sending**
- **No conditional content**
- **No e-commerce revenue reports**
- Most users **outgrow within months** → forced upgrade

### 20.3 UI/UX issues

- **Less polished** than Klaviyo / MailerLite v některých oblastech
- **Reporting dashboard less visual** than Mailchimp
- **Older interface elements** v některých sekcích
- **Mobile app limited**
- **Learning curve** pro full power

### 20.4 Automation gotchas

- **Conditional automations** require workarounds na Starter
- **Re-entry rules** sometimes confusing
- **Failed contacts** require manual re-add
- **Performance issues** s very complex workflows (1000+ contacts active)
- **Workflow templates** less polished than Klaviyo flows

### 20.5 CRM limitations

- **CRM is add-on** – costs extra
- **One contact per one account** (limitation!)
- **Account permissions less granular** than deal permissions
- **Account-level marketing** less developed
- **Custom objects only Enterprise**
- **B2B features less developed** than HubSpot Sales Hub
- **Sales Engagement still maturing** vs. Outreach.io / Salesloft

### 20.6 AI features behind some

- **Generative AI less mature** than HubSpot Breeze
- **No autonomous AI agents** (vs. Klaviyo Customer Agent)
- **Predictive features** decent but not best-in-class
- **AI roadmap** catching up

### 20.7 Reports limitations

- **Custom Reporting is add-on** (extra cost)
- **Limited multi-touch attribution** (Pro+)
- **Less visual** than dedicated BI tools
- **No native BI integrations** beyond standard exports

### 20.8 Channel limitations

- **MMS US only**
- **SMS expensive** internationally
- **WhatsApp Business** newer, less mature
- **No native webinars** (use Zoom integration)
- **No native online courses** (use external)
- **No native digital products sale**
- **No paid newsletters**

### 20.9 E-commerce gaps vs. Klaviyo

- **Less polished Shopify integration**
- **No predictive analytics** (CLV, churn, NPD)
- **No automatic RFM cohorts**
- **No AI product recommendations** in emails
- **Less DTC-specific** features

### 20.10 User permissions complexity

- **Group-based permissions** (not user-based)
- **Some configurations** require Admin
- **Per-pipeline access** complex
- **Deal owner visibility** rules subtle
- **API credentials per user** – deletion breaks integrations

### 20.11 Locale support

- **8-10 main languages** v UI
- **No Czech / Slovak** v UI
- **Documentation primarily English**

### 20.12 Compliance / Security

- **HIPAA available Enterprise only**
- **SSO/SAML only Enterprise**
- **Sandbox accounts only Enterprise**
- **Audit logs limited** outside Enterprise

### 20.13 Migration challenges

- **Workflows non-exportable** to other platforms
- **Custom objects** ActiveCampaign-specific
- **Lead scoring rules** not portable
- **CRM data export** requires careful planning
- **Some integrations** require rebuild

### 20.14 Support quality

- **Email support** standard tier (Starter)
- **Live chat** Plus+
- **Priority support** Pro+
- **Dedicated team** Enterprise only
- **Response times** vary
- **Knowledge base** comprehensive but not always current

### 20.15 Hidden costs awareness

Per Marketer's Choice critique:

- **Headline $15 price misleading** for actual business needs
- **Plus jump $49** is "best value upgrade"
- **Pro adds significant cost** ($60+ mid-tier)
- **Enterprise** justifiable only for high-volume + complex teams

---

## 21. Shrnutí: Pro koho a proti komu

### ActiveCampaign je dobrá volba pokud

- **Mid-market firma** (10-500 zaměstnanců) hledající deep automation
- **Behavior-based marketing** je core priority
- Provozujete **growing e-commerce** (Shopify, WooCommerce) s automation needs
- **B2B services / SaaS / agency** s lead nurturing
- **Course creator** s membership automation
- Cíl je **integrate marketing + sales** v jedné platformě
- Vážíte si **900+ pre-built recipes** ready to deploy
- Hledáte **best automation engine v segmentu** (často chválené)
- Potřebujete **conditional content + predictive sending**
- Chcete **integrated CRM** (deals, pipelines) s marketing
- Máte **budget $50-300+/měsíc** pro mid-market needs
- Operate v **US, UK, EU** (good support all regions)
- Hledáte **970+ integrations** (largest marketplace v mid-market)
- Provozujete subscription business s renewal cycles

### ActiveCampaign není dobrá volba pokud

- **Small business / solopreneur** s tight budget – overkill
- Pure **content creator** / newsletter publisher – MailerLite/Beehiiv lepší
- **DTC e-commerce s Shopify deep** – Klaviyo silnější
- Hledáte **enterprise platform** s full RBAC + governance – HubSpot, Salesforce
- Pracujete v **češtině/slovenštině** – UI nepodporuje
- Hledáte **transparent free plan** – ActiveCampaign nenabízí
- Provozujete **simple newsletter without automation** – overkill
- Potřebujete **webinars + courses built-in** – GetResponse lepší
- Hledáte **pure transactional email** – Postmark/SendGrid standalone lepší
- **Enterprise s complex SAP/Salesforce integration** – Salesforce Marketing Cloud / Adobe lepší
- **Pure paid newsletter platform** – Substack, Beehiiv lepší

### ActiveCampaign vs. konkurence

| Konkurence                     | Kdy lepší než ActiveCampaign                                            |
| ------------------------------ | ----------------------------------------------------------------------- |
| **Mailchimp**                  | Brand recognition, simpler UI, free plan, basic needs                   |
| **MailerLite**                 | Solopreneur simplicity, content creators, transparent pricing           |
| **Brevo**                      | Volume-based pricing, transactional v base, multilingual, transparent   |
| **Klaviyo**                    | DTC e-commerce, Shopify depth, predictive analytics, AI agents          |
| **HubSpot**                    | Full B2B CRM, multi-Hub, enterprise governance, marketing+sales+service |
| **GetResponse**                | Webinars + courses + funnels, 27 languages incl. CZ/SK                  |
| **ConvertKit (Kit)**           | Pure creator-focused, more author features                              |
| **Drip**                       | Smaller e-commerce, simpler automation                                  |
| **Beehiiv**                    | Newsletter publishing, monetization                                     |
| **Salesforce Marketing Cloud** | Pure enterprise, Salesforce ecosystem                                   |
| **SAP Emarsys**                | Enterprise B2C retail, omnichannel scale                                |
| **ExpertSender**               | E-commerce CDP s dedicated service                                      |

---

_Dokument zpracován z oficiálních zdrojů activecampaign.com, help.activecampaign.com a praktických zdrojů (EmailVendorSelection, EmailToolTester, Sender, EngageBay, Marketer's Choice, GetAIPerks, Automation Atlas, BusinessEautomation, Spadoom). Pro nejaktuálnější ceny vždy ověřit na activecampaign.com/pricing._
