# Klaviyo – hloubková analýza funkcí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Zdroje:** oficiální dokumentace help.klaviyo.com, developers.klaviyo.com, klaviyo.com/pricing + analytické weby (EmailToolTester, Retainful, Mailsoftly, CheckThat.ai, Automation Atlas, Hustler Marketing, Tekpon, FirstPier, Stormy AI) ověřené v dubnu–květnu 2026.
**Rozsah:** kompletní funkcionalita platformy v roce 2026 – Klaviyo B2C CRM, email + SMS + WhatsApp + reviews + Customer Hub + analytics + AI Agents.

> **Důležitý kontext:** Klaviyo IPO na NYSE (ticker **KVYO**) v září 2023. Od té doby silně investuje do AI a CDP (rebrand na **Klaviyo Data Platform / KDP** v zimě 2025). Co-CEOs Andrew Bialecki & Chano Fernandez od ledna 2026. **169 000+ businesses** používá platformu (klaviyo investor relations).
>
> **Velký billing shift 18. února 2025:** Klaviyo přešlo z "usage-based" (paying per send) na "**active profile-based**" (paying per stored profile) billing. Tato změna překvapila tisíce stores – účet vzrostl bez přidání jediného subscribera.

---

## Obsah

1. [Co je Klaviyo a pro koho je](#1-co-je-klaviyo)
2. [Tarify a cenová struktura](#2-tarify)
3. [Active profile-based pricing](#3-active-profile-pricing)
4. [SMS credits a Mobile Messaging](#4-sms-credits)
5. [Klaviyo Data Platform (KDP) – datový základ](#5-kdp)
6. [Profiles, Lists, Segments](#6-profiles-segments)
7. [Predictive Analytics & AI](#7-predictive-analytics)
8. [Flows (Automation)](#8-flows)
9. [Campaigns (Email & SMS)](#9-campaigns)
10. [Email Editor a Personalization](#10-email-editor)
11. [Sign-up Forms](#11-sign-up-forms)
12. [Reviews](#12-reviews)
13. [Marketing Analytics & Reports](#13-analytics)
14. [Customer Agent AI & Marketing Agent](#14-ai-agents)
15. [Customer Hub & Service Hub](#15-customer-hub)
16. [Push Notifications & Mobile](#16-push-notifications)
17. [Deliverability & Authentication](#17-deliverability)
18. [API, Integrace, App Marketplace](#18-api-integrace)
19. [Compliance, Data residency, Security](#19-compliance)
20. [Limity a nedostatky](#20-limity)

---

## 1. Co je Klaviyo

- **Společnost:** Klaviyo, Inc. – veřejně obchodovaná (NYSE: **KVYO**, IPO září 2023)
- **HQ:** Boston, Massachusetts (USA)
- **Vznik:** 2012, founder Andrew Bialecki + Ed Hallen
- **Co-CEOs (2026):** Andrew Bialecki & Chano Fernandez (od ledna 2026)
- **Velikost (2026):** 169 000+ businesses; primárně e-commerce
- **Positioning:** **„B2C CRM"** – marketingově se distancují od „email tool" labelu, prodávají platformu pro customer data + multichannel engagement
- **Specializace:** **DTC / e-commerce-first**, zejména **Shopify** (deepest integration v industry)
- **Lokalizace UI:** angličtina, němčina, francouzština, španělština, italština, portugalština. **Čeština, slovenština, polština NEJSOU** v UI podporovány.

### Filozofie produktu

Co-founder Andrew Bialecki: *"The fundamental unit in Klaviyo is a customer, or profile. Our products exist to allow you to understand your customers and maximize the relationships with them."*

Klaviyo je vystavěno **kolem customer profile** – ne kolem campaigns. Každý profile má kompletní historii včetně:
- Order history
- Browse behavior
- Email/SMS engagement
- Form submissions
- Predictive metrics (CLV, churn risk, next order date)
- Custom event data
- Cross-device tracking

```
┌─────────────────────────────────────────────────────────────────┐
│                  KLAVIYO B2C CRM PLATFORM                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Email          │  │ SMS / MMS    │  │ WhatsApp        │      │
│  │ Campaigns      │  │ Marketing    │  │                 │      │
│  │ + Flows        │  │              │  │                 │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Reviews        │  │ Push (web    │  │ Customer Hub /  │      │
│  │                │  │ + mobile)    │  │ Service Hub     │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐                           │
│  │ Marketing      │  │ AI Agents:   │                           │
│  │ Analytics      │  │ Marketing    │                           │
│  │ (BI tool)      │  │ + Customer   │                           │
│  └────────────────┘  └──────────────┘                           │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│       KLAVIYO DATA PLATFORM (KDP) + AI vrstva                   │
│       Profiles │ Events │ Metrics │ Catalog │ Segments          │
│       Predictive: CLV, churn, next order, RFM                   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│   350+ native integrations (Shopify deepest)                    │
│   US-hosted (EU residency option for Enterprise)                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Tarify a cenová struktura

Klaviyo má **3 hlavní self-serve plány** + **Enterprise (Klaviyo One)**:

### 2.1 Free Plan

- **0 USD/měsíc**
- Až **250 active profiles**
- **500 emailů/měsíc**
- **150 SMS/MMS credits/měsíc**
- Email support **prvních 60 dní** (pak self-service)
- Klaviyo branding v emailech
- Většina features dostupná (segmentation, flows, integrations)
- **Co nedostanete:** Predictive analytics (CLV, churn), AI segmentation, advanced reporting

### 2.2 Email plan

- Od **$20/měsíc** pro 501–500 profiles (čerstvé pricing data 2026)
- Scales podle **active profile count**: 58+ tier thresholds
- Examples:
  - 5 000 profiles: ~$100/měsíc
  - 10 000 profiles: ~$150/měsíc
  - 25 000 profiles: ~$400/měsíc
  - 50 000 profiles: ~$720/měsíc
  - 100 000 profiles: ~$1 500/měsíc
  - 250 000 profiles: manual billing (sales)
- **Email send allowance:** 10× profile count měsíčně (default)
- **150 free SMS credits/měsíc** included
- **Features identické napříč tiers** (pricing jen scale by profiles, ne unlock features)

### 2.3 Email + SMS plan

- Od **$35/měsíc** pro 251–500 profiles
- **1 250 SMS credits** included v base tier
- Vyšší credits podle profile count
- WhatsApp messaging zahrnuto
- Scales podle profiles + SMS credits

### 2.4 Klaviyo One (Enterprise)

- **Mandatory** když monthly spend překročí **$10 000**
- **+20 % na top of total spend** model
- Pod tímto thresholdem custom contract pricing
- **Features:**
  - Dedicated Customer Success Manager
  - Advanced API limits
  - Priority deliverability support
  - SLAs
  - Custom data residency options
  - Advanced security features
  - Co-founder support

### 2.5 Add-ons (samostatně účtované)

| Add-on | Cena 2026 | Co dělá |
|---|---|---|
| **Reviews** | $25+/měsíc | Sběr a zobrazení produktových recenzí |
| **Marketing Analytics** | $100+/měsíc (vyžaduje 1 001+ profiles) | Advanced BI dashboards, attribution |
| **Customer Agent AI** | $140/měsíc intro / $200 regular | AI conversational support agent (50 conversations included, +$0.70/conv overage) |
| **Customer Hub** | $30/měsíc | Customer-facing portal |
| **Helpdesk** | $264/měsíc | Service ticketing |
| **Advanced Data Platform** | $500/měsíc | Includes all Marketing Analytics + data warehousing |
| **Dedicated IP** | Add-on, Pro+ contact required | Vlastní IP pro deliverability |

> **Pozor:** Advanced Data Platform **zahrnuje** Marketing Analytics features – nepořizujete oba současně.

### 2.6 Klíčové pricing facts (2026)

- **Features identické napříč tiers** – cena se zvyšuje **jen** kvůli profile count, ne kvůli unlock
- **No annual discount** na self-serve plánech (jen monthly billing); annual u Enterprise
- **Šance přejít na manual billing** > 250 000 profiles
- **Pricing transparency:** klaviyo.com/pricing má interactive calculator do mid-market; nad 50K profiles vyžaduje sales contact

### 2.7 Skryté náklady – co kritici nejčastěji uvádějí

1. **Active profile-based billing** (od 18. února 2025) – všichni subscribed contacts se počítají, ne jen ti, kterým se aktivně posílá
2. **Inactive profiles** still cost – pravidelný list cleanup je nutný
3. **SMS credits overage** – kupují se v balíčcích
4. **MMS** consumes 3–15 credits (per country, per attachment)
5. **International SMS** výrazně dražší než US
6. **Reviews je add-on** – $25+/měsíc navíc
7. **Marketing Analytics** $100+/měsíc add-on
8. **Klaviyo One overhead** +20 % nad threshold

---

## 3. Active profile-based pricing

Klíčový model. **Active profile = subscribed contact, který CAN receive marketing emails/SMS.**

### 3.1 Co se počítá do active profiles

- ✅ Email subscribers (opt-in marketing)
- ✅ SMS subscribers
- ✅ Both email + SMS subscribers (counts as 1 if same person)
- ❌ Unsubscribed (after opt-out)
- ❌ Suppressed (bounced, complained)
- ❌ Profiles bez consent / opt-in

### 3.2 Tier auto-upgrade

- Když profile count cross threshold → **auto-upgrade na next tier** at start of next billing cycle
- Tier downgrade lze ručně, pokud profile count je nižší
- **Není možnost stay on lower tier** if exceeded

### 3.3 Cost optimization strategie

1. **List cleanup** – suprese non-engagers (např. žádný open za 6 měsíců)
2. **Re-engagement campaigns** – nejprve, pak suprese
3. **Sunset workflows** – auto-suprese long-inactive
4. **Hard-bounce auto-clean** – Klaviyo dělá automaticky
5. **Soft-bounce monitoring** – manual cleanup
6. **Spam complaints** – auto-supresion

### 3.4 Pre-Feb 2025 vs. post-Feb 2025

| Aspect | Před | Po (současný stav) |
|---|---|---|
| Billing basis | Per send (kolik emailů poslala) | Per active profile |
| Inactive profiles | Free if not emailed | Counted toward billing |
| Predictability | Variable per month | Predictable per profile count |
| Incentive | Send more (more cost) | Clean lists (less cost) |

---

## 4. SMS credits a Mobile Messaging

### 4.1 SMS credit system

- **1 credit = 1 SMS segment** (do 160 znaků)
- **MMS** = 3–15 credits per país
- **International** = výrazně více credits
- **Toll-free** number free
- **Branded sender ID** option

### 4.2 SMS Cost Per Message (US)

- $0.0092–$0.0120 per SMS (volume-based)
- Volume discounts ve vyšších tiers

### 4.3 SMS Credit allocation per plan

| Plan | Free SMS credits/měsíc |
|---|---|
| Free | 150 |
| Email plan | 150 (token) |
| Email + SMS | 1 250 (base tier) až 80 000+ (high tiers) |

### 4.4 Overage

- Při překročení credits buy more
- **Unused credits do NOT roll over** – reset každý měsíc

### 4.5 WhatsApp

- Součást Email + SMS plan
- WhatsApp Business API integration
- Marketing templates musí být schválené WhatsApp pre-send
- Per-message costs (similar to SMS)

---

## 5. Klaviyo Data Platform (KDP)

V zimě 2025 rebrand z **„Klaviyo CDP"** na **„Klaviyo Data Platform (KDP)"** – signál posunu k AI-powered marketing personalization.

### 5.1 Co je KDP

**„Klaviyo Data Platform unifies customer data and enables real-time activation for marketing, customer service, and analytics – and it's built into Klaviyo B2C CRM."**

Na rozdíl od tradičních CDPs (Segment, mParticle, Treasure Data) je KDP **vertikálně integrované** – data sídlí v Klaviyo, ne v separátní vrstvě.

### 5.2 KDP capabilities

- **Data Ingestion:** native integrace + webhooks + API + SFTP (Enterprise)
- **Identity Resolution:** stitching anonymous → known (cookie ID → email → SMS)
- **Data Modeling:** profiles, events, metrics, catalog (products)
- **RFM Analysis:** customizable scoring model (Recency, Frequency, Monetary)
- **Custom CLV models:** train na vlastních metrics
- **Predictive metrics:** CLV, churn risk, next order date, gender prediction
- **Real-time activation:** segments → campaigns/flows/audiences

### 5.3 KDP data sources

- E-commerce platforms (Shopify, WooCommerce, Magento, BigCommerce, Wix)
- CRMs (Salesforce, HubSpot)
- POS systems
- Subscription billing (Recharge, Bold, Stay AI)
- Reviews platforms
- Ads platforms (Meta, Google, TikTok)
- Custom: webhooks, API, SFTP

### 5.4 KDP outputs

- Klaviyo email/SMS campaigns
- Klaviyo flows
- **Audience sync** – export segments to:
  - Meta Ads
  - Google Ads
  - TikTok Ads
  - Pinterest Ads
- **Reverse ETL** – send data back to data warehouse (Enterprise)

---

## 6. Profiles, Lists, Segments

### 6.1 Profile

Klaviyo's **central object**. Každý profile obsahuje:

- **Standard properties:** Email, phone, first name, last name, organization, address, time zone, language, country
- **Custom properties:** unlimited custom fields
- **Subscription status:** marketing consent per channel (email, SMS, WhatsApp, push)
- **Suppression reasons:** bounce, complaint, unsubscribed
- **Activity timeline:** every event chronologically
- **Predictive metrics:** auto-calculated
- **List memberships**
- **Segment memberships**
- **Profile identifiers:** email, phone, external ID, anonymous ID

### 6.2 Events

Klaviyo's **event-driven model**. Každá akce profile = event.

**Default events** (auto-tracked via integrations):
- **Active on Site** – page view
- **Viewed Product**
- **Added to Cart**
- **Started Checkout**
- **Placed Order**
- **Fulfilled Order**
- **Refunded Order**
- **Cancelled Order**
- **Subscribed to List**
- **Unsubscribed**
- **Received Email** / **Opened Email** / **Clicked Email** / **Marked Email as Spam** / **Bounced Email**
- **Received SMS** / **Clicked SMS** / **Replied to SMS**
- **Form Submission**

**Custom events** – plně customizable via API:
- Any action s libovolnými properties
- e.g. "Started Quiz", "Booked Demo", "Completed Lesson"
- Vyhledatelné, segmentovatelné, použitelné jako flow triggers

### 6.3 Lists

**Static collections**:
- **Newsletter list** – obecný list pro general subscribers
- **List per source** – e.g. „Pop-up signups", „Footer signups"
- **List per consent** – e.g. „SMS subscribers"
- **Manual lists** – import a stay static
- **Auto-add via signup forms**

Profile může být v multiple lists současně.

### 6.4 Segments

**Dynamic collections** – auto-update based on conditions.

#### Segment criteria

- **Profile properties** – any standard or custom
- **List membership** – in/not in list X
- **Segment membership** – in/not in segment X (nested)
- **Event-based** – performed/not performed event X with parameters
  - Time range
  - Count (X times)
  - Property values (e.g. event $value > $50)
- **Predictive analytics** – CLV, churn risk, gender, next order date
- **Subscriber preferences** – marketing consent
- **Source/origin**
- **Geolocation** – country, region
- **Time zone**

#### Segment examples

```
"VIP customers"
  IS in list "Newsletter"
  AND Predicted CLV > $500
  AND Has placed > 3 orders in last 12 months

"At-risk churners"
  AND Predicted churn risk = High
  AND Last order date > 90 days ago
  AND CLV > $200

"Engaged non-customers"
  AND Has opened > 5 emails in last 30 days
  AND Has not placed an order ever
  AND Subscribed to Newsletter
```

### 6.5 Difference: List vs. Segment

| | List | Segment |
|---|---|---|
| Type | Static | Dynamic |
| Update | Manual | Auto |
| Use | Source tracking, consent | Behavioral targeting |
| Filter | None | Up to dozens of conditions |
| Profile join | Manual or trigger | Auto-based on criteria |

### 6.6 Tags

Klaviyo nemá tagy ve smyslu Mailchimpu. Místo toho používá:
- **Custom properties** – pro arbitrary labels
- **Lists** – pro source/consent grouping
- **Segments** – pro behavioral grouping

---

## 7. Predictive Analytics & AI

Klaviyo's **flagship feature** v ecommerce kategorii.

### 7.1 Predictive metrics (auto-calculated)

Available na **paid plans 1 001+ profiles**:

#### Customer Lifetime Value (CLV)

- **Historic CLV** – total spent past
- **Predicted CLV** – 365-day forecast
- ML model trained per Klaviyo aggregated patterns + your store data
- **Use cases:**
  - VIP segments (top 10 % predicted CLV)
  - Lookalike audiences in Meta/Google Ads
  - Branch flows by CLV (different welcome series for high vs. low predicted CLV)

#### Churn Risk

- **Low / Medium / High** classification
- Based on engagement decline, purchase patterns
- **Use cases:**
  - Re-engagement flow trigger
  - VIP retention campaigns
  - Discount targeting

#### Predicted Date of Next Order

- ML predicts when next purchase likely
- Trigger replenishment flows X days before
- Use cases:
  - Consumable products (shampoo, supplements, pet food)
  - Subscription nudges

#### Average Order Value (Historic + Predicted)

- AOV trends per profile
- Branch flows by spend power

#### Average Days Between Orders

- Frequency metric

#### Number of orders (Historic + Predicted)

- Loyalty signal

#### Gender Prediction

- Based on first name + census data
- "Likely male / female / uncertain"
- **Note:** approximation – use s caution

### 7.2 RFM Analysis (2024+)

Recency, Frequency, Monetary analysis – classic retail framework.

**RFM Cohorts (default):**
- **Champions** – best customers
- **Loyal Customers**
- **Potential Loyalists**
- **New Customers**
- **Promising**
- **Need Attention**
- **About to Sleep**
- **At Risk**
- **Cannot Lose Them**
- **Hibernating**
- **Lost**

**Customization:**
- Custom RFM scoring model
- Exclude $0 orders or specific subscribers from RFM calculation
- Auto-update jak data flow

### 7.3 AI Segmentation (Pro+)

- AI suggests segments based na behavior patterns
- Natural language description → auto-generate segment criteria
- Predicts segment performance pre-creation

### 7.4 AI Subject Line Generator

- Generates subject lines per email
- Predicts open rate
- A/B test variants suggested

### 7.5 Predictive A/B Testing

- AI determines winner sooner than statistical significance
- Resource allocation optimization

### 7.6 Marketing Agent (2025+)

AI agent that:
- Generates email content
- Builds flows from prompt
- Suggests segments
- Analyzes campaign performance

### 7.7 Customer Agent AI (add-on, $140–200/měsíc)

Autonomní conversational support AI:
- Chats with customers
- Resolves common issues
- Escalates to human when needed
- 50 conversations included; +$0.70/conv overage

---

## 8. Flows (Automation)

Klaviyo's **automation engine**. Called "Flows" not "Workflows" or "Journeys".

### 8.1 Flow vs. Campaign

| | Flow | Campaign |
|---|---|---|
| Trigger | Automated event/action | Manual one-shot |
| Audience | Dynamic, per-trigger | Static at send time |
| Frequency | Continuous | Single send |
| Use case | Welcome, abandoned cart, post-purchase | Newsletter, promo, announcement |

### 8.2 Flow triggers

**Klíčový concept:** Klaviyo flow trigger je **event**, ne audience.

#### Pre-built flow templates

- **Welcome Series** – trigger: "Subscribed to List"
- **Abandoned Cart** – trigger: "Started Checkout" (s 1+ delay)
- **Browse Abandonment** – trigger: "Viewed Product"
- **Post-Purchase** – trigger: "Placed Order"
- **Cross-sell / Upsell** – trigger: "Placed Order" + specific products
- **Replenishment** – trigger: "Placed Order" or "Predicted Date of Next Order"
- **Winback / Re-engagement** – trigger: "Lapsed customer"
- **Birthday** – trigger: date property
- **VIP** – trigger: list-add / CLV threshold
- **Back-in-Stock** – trigger: "Subscribed to Back in Stock"
- **Price Drop** – trigger: product price change

#### Custom flows triggers

- **Metric trigger** – any event in Klaviyo
- **List trigger** – added/removed from list
- **Segment trigger** – joined/left segment
- **Date-based trigger** – property X days from today
- **API trigger** – external system fires

### 8.3 Flow components

#### Conditional splits
- **If/else** based on profile properties, events, predictive metrics
- Multi-branch
- Up to dozens of conditions

#### Trigger splits
- Initial branching based on **trigger event properties**
- e.g. abandoned cart with cart value > $X vs. < $X

#### Time delays
- Wait fixed period (minutes, hours, days)
- **Smart Send Time** – Klaviyo AI picks optimal time per profile (Pro+)

#### Actions

- **Send email**
- **Send SMS**
- **Send WhatsApp**
- **Send push notification**
- **Update profile property**
- **Add to list**
- **Remove from list**
- **Add to suppression list**
- **Webhook** – call external URL
- **Send to ads audience** – sync to Meta/Google ads

#### Flow filters
- Apply at flow-level to **exclude profiles** from entering
- Common: subscribed to email, not in test segment, not currently in another similar flow

### 8.4 Flow features

- **Smart Sending** (default ON) – prevent over-emailing same recipient
- **Quiet Hours** – no sends during configured hours
- **Frequency caps**
- **Goal tracking** – primary conversion event per flow
- **Flow live preview** – step through flow as test profile
- **Analytics per step** – conversions, revenue, drop-off

### 8.5 Flow performance reporting

- Total recipients
- Per-step metrics:
  - Sent
  - Delivered
  - Open rate
  - Click rate
  - Conversion rate
  - **Revenue attributed**
- Flow-level revenue
- Conversion goal tracking

---

## 9. Campaigns

### 9.1 Campaign types

- **Regular email campaign**
- **A/B test campaign** – variants of subject, content, send time
- **SMS campaign**
- **WhatsApp campaign**
- **Push notification campaign**

### 9.2 Campaign builder

```
Create campaign:
1. Select audience (segment or list)
2. Add exclusions
3. Configure send settings (sender, subject, preview)
4. Design email (drag-drop or HTML)
5. Configure tracking
6. Schedule or send
```

### 9.3 Smart Send Time

- AI-determined optimal time per recipient
- ML based na historical engagement
- Available per Pro+

### 9.4 Send time options

- Send now
- Schedule for specific time
- **Smart Send Time** (Pro+)
- **Time zone send** – local time per recipient
- **Throttling** – spread send over hours/days

### 9.5 A/B Testing

- Test:
  - Subject line
  - Preview text
  - Content
  - Send time
  - Sender name
- Sample size configurable
- **Winner auto-send** – po sample, zbytek vítěznou variantou
- **AI-powered A/B testing** – determines winner sooner

### 9.6 Multi-language campaigns

- Per-language content blocks
- Auto-detect recipient language from profile property
- Manual override available

---

## 10. Email Editor a Personalization

### 10.1 Drag-and-drop editor

- **Blocks:**
  - Text
  - Image
  - Button
  - Divider
  - Spacer
  - HTML
  - Table
  - Video (animated GIFs supported)
  - **Product block** (Shopify-integration)
  - **Recommendation block** – AI-driven
  - **Loyalty/Rewards block**
  - **Form/Survey block**
  - **Coupon block** – unique codes
  - **Reviews block** – pull from Klaviyo Reviews

### 10.2 Template library

- 100+ pre-built responsive templates
- Industry-specific (e-commerce, beauty, fashion, etc.)
- **Saved templates** library

### 10.3 Personalization

#### Personalization syntax

Klaviyo uses **handlebars-like** syntax:
```
Hello {{ first_name|default:"there" }},

Your CLV is ${{ predicted_clv|floatformat:0 }}.
```

#### Dynamic content blocks

- **Show/hide based on profile property**
- **Show/hide based on segment membership**
- **Show/hide based on event history**

#### Catalog data integration

- **Product blocks** dynamicky pull from Shopify/WooCommerce catalog
- Auto-update price, image, name, availability
- Personalized recommendations (AI):
  - Best sellers
  - Similar to viewed
  - Cross-sell based on order history
  - Trending in category

### 10.4 AI Content Generator

- Generate subject lines
- Generate body copy
- Tone adjustment
- Translation
- Available across plans (limited credits per tier)

### 10.5 Brand kit

- Save brand colors, fonts, logo
- Apply across templates

---

## 11. Sign-up Forms

### 11.1 Form types

- **Popup form** (modal)
- **Flyout form** (corner slide-in)
- **Embedded form** (HTML on page)
- **Full-page form**
- **Multi-step form** (progressive)

### 11.2 Form features

- Drag-drop builder
- Field types: text, email, phone, dropdown, checkbox, radio, date, hidden
- **Trigger rules:** exit intent, scroll %, time on page, page URL
- **Frequency caps** per visitor
- **Mobile-optimized**
- **Custom CSS**
- **A/B test forms**
- **Form submissions tracked as events**

### 11.3 Integration s subscription

- Form submit → add to selected list
- → Profile created/updated
- → Welcome flow triggered
- → Tracking pixel fires (Active on Site)

### 11.4 Compliance

- **Double opt-in option** (recommended, GDPR)
- **GDPR consent fields**
- **SMS opt-in flow** (TCPA US, explicit consent)
- **Captcha** option

---

## 12. Reviews

Klaviyo Reviews je **add-on** od $25/měsíc.

### 12.1 Capabilities

- **Auto-request reviews post-purchase** (configurable timing)
- **Email + SMS request channels**
- **Photo/video reviews**
- **Star ratings**
- **Q&A on product pages**
- **Display on Shopify/WooCommerce** product pages
- **Display in emails** (Reviews block)
- **Moderation queue**
- **Reply to reviews**
- **Auto-publish based on rating threshold**
- **Reviews data feeds back to KDP** – review = event, segmentable

### 12.2 Reviews Display

- Star widget
- Reviews carousel
- Featured reviews
- Q&A widget
- Social proof badges

### 12.3 Integration

- **Native Shopify** – deepest
- **WooCommerce, BigCommerce, Wix Stores**

---

## 13. Marketing Analytics

Marketing Analytics add-on ($100+/měsíc) přidává BI capabilities.

### 13.1 Standard Reports (included in all paid plans)

- **Campaign reports** – per-campaign metrics
- **Flow reports** – per-flow + per-step
- **Profile reports** – list growth, source breakdown
- **Form reports** – conversion
- **Revenue reports** – attributed to channel
- **Email engagement** – overall
- **SMS engagement**

### 13.2 Marketing Analytics add-on features

- **Multi-touch attribution** – first-touch, last-touch, U-shape, linear
- **Custom dashboards**
- **Custom reports** with metric/dimension picker
- **Goal tracking**
- **Cohort analysis**
- **Funnel reports**
- **Retention curves**
- **Comparison periods** (YoY, MoM)
- **Saved scheduled reports** – email/Slack delivery

### 13.3 Advanced Data Platform ($500/měsíc)

Includes Marketing Analytics + data warehousing:
- **Bigger query** capabilities
- **Custom SQL** access
- **External data integration**
- **Reverse ETL** – export to warehouse
- **Snowflake / BigQuery** native connection

### 13.4 Email/SMS-level metrics

Per send:
- Delivered, bounces (hard/soft)
- Opens (raw + unique)
- Clicks, CTR
- Top links
- Unsubscribes, spam complaints
- Conversions (orders)
- **Revenue attributed**
- Device/email client breakdown

---

## 14. Customer Agent AI & Marketing Agent

### 14.1 Customer Agent AI (add-on)

- **Conversational AI** trained na vašich KB articles + product catalog
- Multi-channel: email, SMS, web chat
- **AI-powered ticket tagging**
- **Skills-based routing** – auto-assign to right human agent
- **50 conversations/month** included v intro pricing
- **$0.70/conversation overage**
- **$140/měsíc intro pricing through March 31, 2026**; potom **$200/měsíc**

### 14.2 Marketing Agent (built-in)

AI agent for marketing operations:
- Generate campaign content
- Build flows from natural language prompt
- Suggest segments
- Analyze performance
- Recommend optimizations
- A/B test ideas

### 14.3 Klaviyo AI strategy 2026

Klaviyo positions itself as **„AI-first B2C CRM"** – heavy AI investment direction:
- Multi-agent platform
- Marketing Agent for ops
- Customer Agent for support
- Predictive infrastructure
- AI-generated content + segments

---

## 15. Customer Hub & Service Hub

### 15.1 Customer Hub (add-on, $30/měsíc)

Customer-facing portal:
- View order history
- Manage subscriptions
- Update preferences
- Track shipments
- Reorder
- Manage loyalty points (if applicable)
- Customizable branding

### 15.2 Service Hub / Helpdesk (add-on, $264/měsíc)

Full ticketing system:
- Email + chat + SMS support inbox
- AI-powered ticket tagging
- Skills-based routing
- Knowledge Base
- SLAs
- CSAT surveys
- Internal team notes
- Reports

### 15.3 Loyalty (newer, 2026)

- Points-based program
- Tiers (Bronze, Silver, Gold)
- Earning rules: purchase, referral, review
- Redemption: discount, products, free shipping
- Wallet pass support

---

## 16. Push Notifications & Mobile

### 16.1 Web push

- Browser-native push (Chrome, Firefox, Safari, Edge)
- Trigger from campaign or flow
- Subscribed via service worker
- Personalization tokens
- Geo-targeting

### 16.2 Mobile push (s SDK)

- iOS + Android SDK
- Token storage v Klaviyo profile
- Multi-channel orchestration (push + email + SMS)
- Deep linking

### 16.3 In-app messages

- For mobile apps with SDK
- Behavior-triggered
- Rich media

---

## 17. Deliverability & Authentication

### 17.1 Infrastructure

- **US-hosted** primary
- **EU data residency** available (Enterprise / Klaviyo One)
- **Shared IP pools** – multi-tier by reputation
- **Dedicated IP** – add-on, Pro+ (volume-dependent)

### 17.2 Authentication setup

| Protokol | Setup |
|---|---|
| **SPF** | Add include for Klaviyo's sending servers |
| **DKIM** | 2× CNAME records (configurable subdomain) |
| **DMARC** | TXT record on _dmarc, recommended start at p=none |
| **BIMI** | Per DMARC reject + verified logo |
| **MX records** | Pro Reviews routing (optional) |
| **Branded tracking domain** | Setup pro click links (replace klaviyo.com/click) |

### 17.3 Domain authentication flow

```
Settings → Domains and hosting → Authenticate domain
   ↓
Enter sending domain (e.g. mail.yourstore.com)
   ↓
Klaviyo generates DNS records
   ↓
You add to DNS provider
   ↓
Klaviyo validates (5 min – 48h)
   ↓
[Authenticated]
   ↓
Emails now sign with your DKIM
```

### 17.4 Branded sending domain

- **Strongly recommended** – avoids "via klaviyomail.com"
- **CNAME branded tracking domain** – clean click URLs
- **Send From your domain** vs. Klaviyo subdomain

### 17.5 List hygiene & Deliverability

- **Auto-suppression** hard bounces
- **Soft bounce monitoring**
- **Spam complaint auto-suppression**
- **Engagement-based suppression** workflows (manual setup recommended)
- **Sunset workflow** – auto-supress non-engagers

### 17.6 Deliverability features

- **Smart Sending** prevents email fatigue (default on)
- **Frequency caps** per channel
- **Quiet Hours**
- **Sub-account warm-up** for new senders
- **Reputation monitoring**

### 17.7 Gmail/Yahoo 2024+ compliance

- **One-click unsubscribe (RFC 8058)** – auto-implemented
- **DKIM + DMARC required** – Klaviyo enforces
- **Spam complaint rate < 0.3 %** – monitored
- **List hygiene best practices** – Klaviyo guides aktivně

---

## 18. API, Integrace

### 18.1 API

- **Base URL:** `https://a.klaviyo.com/api/`
- **Latest API revision:** date-based versioning (e.g. `revision: 2024-10-15`)
- **Auth:** private API key in `Authorization: Klaviyo-API-Key {key}` header

### 18.2 API key types

- **Public key (Site ID)** – 6-char ID, safe to expose (used in JS)
- **Private key** – `pk_` prefix + long string, server-side only

#### Private key scopes

- **Full Access Key** – all read + write
- **Read-Only Key** – view only
- **Custom Key** – per-endpoint scope

> **Důležité:** Klaviyo nemůže zobrazit private key after creation – store immediately.

### 18.3 Hlavní API endpoints

| Resource | Operace |
|---|---|
| `/profiles` | CRUD profiles |
| `/profiles/{id}` | Get/update specific |
| `/lists` | List management |
| `/segments` | Segment management |
| `/events` | Track events |
| `/metrics` | Metric definitions |
| `/campaigns` | Campaign CRUD |
| `/flows` | Flow management |
| `/templates` | Template CRUD |
| `/catalogs` | Product catalog |
| `/coupons` / `/coupon-codes` | Coupon management |
| `/reviews` | Reviews data |
| `/forms` | Form data |
| `/data-privacy/deletion-jobs` | GDPR delete |
| `/accounts` | Account info |
| `/webhooks` | Webhook subscriptions |

### 18.4 OAuth 2.0 (pro public apps)

- Pre App Marketplace
- Required from June 30, 2025
- Scopes-based authorization

### 18.5 Webhooks

Real-time event notifications:
- Profile created/updated/subscribed
- Campaign sent
- Flow events
- E-commerce events

### 18.6 SDKs (oficiální)

- **JavaScript** (client + server)
- **Python**
- **PHP**
- **Ruby**
- **Node.js**
- **iOS** (Swift)
- **Android** (Kotlin)

### 18.7 Native integrations

**350+ integrations**, vybrané:

#### E-commerce (deepest)
- **Shopify** (flagship integration, deepest)
- **WooCommerce**
- **BigCommerce**
- **Magento / Adobe Commerce**
- **Wix Stores**
- **Squarespace Commerce**
- **PrestaShop**
- **Salesforce Commerce Cloud**

#### Reviews
- **Klaviyo Reviews** (native, recommended)
- Yotpo, Judge.me, Stamped.io, Okendo

#### Subscriptions
- **Recharge** (deepest)
- Bold Subscriptions
- Stay AI
- ReCharge
- Subbly

#### Shipping/Logistics
- ShipStation, ShipBob, AfterShip

#### Loyalty
- Smile.io, Yotpo Loyalty, LoyaltyLion

#### Customer Service
- Gorgias, Zendesk, Re:amaze

#### Ads
- Meta Ads (audience sync)
- Google Ads
- TikTok Ads
- Pinterest Ads
- Snapchat Ads

#### Forms
- Typeform, Jotform, OptinMonster, Privy, Justuno

#### Analytics
- Google Analytics, Triple Whale, Northbeam, Polar Analytics

#### iPaaS
- Zapier, Make, Workato, Tray.io

### 18.8 Klaviyo Tracking

- **JavaScript snippet** (klaviyo.js) installed on website
- Tracks:
  - Active on Site
  - Viewed Product
  - Added to Cart
  - Started Checkout
- Custom event tracking via `klaviyo("track", "Event Name", {...properties})`

---

## 19. Compliance

### 19.1 Data residency

- **US-hosted** default (Boston region + AWS US)
- **EU data residency** dostupné pro Klaviyo One (Enterprise)
- **DPA available** (Data Processing Agreement)
- **EU-US Data Privacy Framework** certified

### 19.2 GDPR features

- **GDPR-compliant forms**
- **Double opt-in** support
- **Subscription preferences per channel**
- **Right to Be Forgotten:**
  - API: `POST /data-privacy/deletion-jobs`
  - UI: Profile → Actions → Delete profile (GDPR compliant)
- **Data export** per profile

### 19.3 Consent tracking

- Per profile:
  - Email marketing consent
  - SMS marketing consent
  - WhatsApp consent
  - Push consent
  - Source of consent
  - Timestamp + IP

### 19.4 Certifications

- **SOC 2 Type II**
- **ISO 27001**
- **GDPR compliant**
- **CCPA compliant**
- **HIPAA-eligible** (Klaviyo One)
- **PCI DSS** (for payment data)

### 19.5 Security

- **2FA** (TOTP, SMS)
- **SSO/SAML** (Klaviyo One Enterprise)
- **SCIM** provisioning (Enterprise) – auto user provisioning
- **MFA enforcement** option
- **IP whitelist** for API
- **Audit logs** (Enterprise)
- **Encryption at rest + in transit**

---

## 20. Limity a nedostatky

### 20.1 Pricing & cost

- **Active profile-based billing** (from Feb 2025) – inactive profiles cost money
- **Steep scaling** – pricing rises rychle s contact count
- **Klaviyo One +20 % overhead** at $10K/month threshold
- **No annual discount** na self-serve plans
- **Add-ons stack up:** Reviews $25 + Marketing Analytics $100 + Customer Agent $140+ = quickly expensive
- **SMS credits drahé internationally**

### 20.2 Funkční limity

- **E-commerce-first** – B2B use cases less polished
- **CRM = customer-focused, not deal-focused** – nemá deal pipelines, quotes, sales sequences jako HubSpot
- **No native sales tools** – sequences, meetings, calls chybí
- **No native landing pages** (was launched ale limited)
- **No native social media tools**
- **Marketing Analytics is paid add-on** – ostatním platformám included

### 20.3 Shopify dependency

- **Deepest integration = Shopify** – stores na WooCommerce/Custom dostávají menší featureset
- Některé předikční modely vyžadují **Shopify Plus** features

### 20.4 UI/UX

- **No Czech/Slovak/Polish UI** – jen ~6 jazyků
- **Steep learning curve** – data model je advanced
- **Settings split** mezi mnoho menus (configuration sprawl)

### 20.5 Compliance gaps

- **Default US data residency** – pro EU companies suboptimal mimo Enterprise
- **Audit logs jen Enterprise**

### 20.6 Specific issues

- **No native lead scoring** v tradičním smyslu (jen predictive metrics)
- **No multi-account / sub-accounts** for agencies (existuje Portfolio feature ale limited)
- **Custom Klaviyo Object types** nejsou – jen Profile + Event + Catalog
- **Reviews add-on** přidává významný cost
- **Customer Agent quickly expensive** at volume

### 20.7 Migration

- Export contacts/lists: ✅ snadné (CSV)
- Export segments: kritéria lze re-create, ale historical data ne
- Export flows: ❌ no native export, must rebuild
- Export templates: ✅ HTML export

---

## 21. Shrnutí: Pro koho a proti komu

### Klaviyo je dobrá volba pokud
- Provozujete **DTC e-commerce store**, zejména **Shopify**
- Hledáte **deepest e-commerce-specific features** (abandoned cart, post-purchase, RFM, CLV)
- Chcete **predictive analytics** built-in (ne dodatečné add-ons)
- Posíláte **highly targeted** campaigns based on behavior
- Máte **engaged email list** (active profile-based pricing favors this)
- Hledáte **multichannel** (email + SMS + WhatsApp + push) v jednom
- Chcete **AI-powered personalization** out-of-the-box

### Klaviyo není dobrá volba pokud
- Jste **B2B / SaaS** – HubSpot, Salesforce, ActiveCampaign lépe
- Máte **velkou inactive databázi** – active profile pricing penalizuje
- Vaše hlavní use case je **B2B sales pipeline** – Klaviyo není CRM v sales smyslu
- Pracujete primárně v **češtině/slovenštině/polštině** – UI nepodporuje
- Máte **smaller list** s frequent sends – Mailchimp/Brevo levnější
- Potřebujete **content marketing toolkit** (blogy, landing pages, SEO) – HubSpot Content Hub komplexnější
- **Bootstrappujete** – pricing scaluje agresivně

### Klaviyo vs. konkurence

| Konkurence | Kdy lepší než Klaviyo |
|---|---|
| **Mailchimp** | Small lists, basic email, casual sends |
| **Brevo** | Volume-based pricing pro velké inactive lists; transactional focus |
| **HubSpot** | B2B; full CRM s deals; multi-Hub vision |
| **ActiveCampaign** | Deep automation logic, lower cost mid-tier |
| **Omnisend** | Direct competitor, 40-60 % levnější u SMS-heavy use cases |
| **Drip** | E-commerce alternativa, cheaper for some scenarios |
| **Customer.io** | Product-led SaaS s event-driven journeys |
| **Postmark / Mailgun** | Pure transactional fokus |

---

*Dokument zpracován z oficiálních zdrojů help.klaviyo.com, developers.klaviyo.com, klaviyo.com/pricing a renomovaných analytických webů. Pro nejaktuálnější ceny vždy ověřit na klaviyo.com/pricing.*
