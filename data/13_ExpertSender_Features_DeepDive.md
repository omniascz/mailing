# ExpertSender – hloubková analýza funkcí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Zdroje:** oficiální dokumentace expertsender.com + analytické weby a recenze (G2, Capterra, GetApp, SoftwareAdvice, Research.com, SpotSaaS, SoftwareSuggest, SoftwareFinder, Authencio, Shopify CDP guide, CDP.com) ověřené v dubnu–květnu 2026.
**Rozsah:** kompletní funkcionalita platformy v roce 2026 – Customer Data Platform (CDP), omnichannel marketing automation (Email, SMS, Web Push, Mobile Push, on-site), RFM analytics, deliverability, dedicated support model.

> **Důležitý kontext:** ExpertSender je **polský původ (Gdańsk)**, založeno **2009** (jedna z nejstarších email marketing firem na trhu, 17+ let). Mezi nejvýznamnějšími hráči z původně-CEE oblasti, dnes globální působnost s **20 miliardami zpráv ročně pro 1 000+ značek**. Offices v **Gdańsku (HQ), Pekingu a São Paulu**.
>
> **Velký pivot 2023–2025:** ExpertSender se transformoval z **email service provider (ESP)** na **multichannel CDP** (Customer Data Platform) zaměřený výhradně na **e-commerce**. Současný marketing claim: "platform designed exclusively for e-commerce".
>
> **Filozofie:** **Enterprise-grade for SMB+** – power user-friendly UI, "industrial-strength interface". **Vyžaduje dedicated support** + onboarding, ne self-service tool. Není to "lite" platform jako MailerLite.
>
> **Pozice na trhu:** ExpertSender patří mezi **top 5 v Polsku** + významný hráč v CEE regionu. Pro polské velké e-commerce (4F, Answear, Taranko) je častou volbou. Mimo CEE pozicionovaný jako **mid-market alternativa** k Klaviyo / Emarsys / Bloomreach pro e-commerce.

---

## Obsah

1. [Co je ExpertSender a pro koho je](#1-co-je-expertsender)
2. [Tarify a pricing model](#2-tarify)
3. [E-commerce-only positioning](#3-ecommerce-only)
4. [Customer Data Platform (CDP) jádro](#4-cdp)
5. [Identity resolution a Single Customer Profiles](#5-identity-resolution)
6. [Segmentation (dynamic + RFM)](#6-segmentation)
7. [Email Marketing kanál](#7-email)
8. [SMS Marketing kanál](#8-sms)
9. [Web Push Notifications](#9-web-push)
10. [Mobile Push & In-App](#10-mobile-push)
11. [On-site personalization (Pop-ups, Banners, Recommendations)](#11-on-site)
12. [Marketing Automation Workflows](#12-automation)
13. [Predictive Analytics & AI](#13-predictive)
14. [Product Recommendations engine](#14-recommendations)
15. [Transactional Email](#15-transactional)
16. [Deliverability & IP infrastruktura](#16-deliverability)
17. [API, Integrace, Plugins](#17-api-integrace)
18. [Dedicated support model](#18-support-model)
19. [Compliance, GDPR, ISO 27001](#19-compliance)
20. [Limity a nedostatky](#20-limity)

---

## 1. Co je ExpertSender

- **Společnost:** ExpertSender S.A. (akciová společnost) / ExpertSender sp. z o.o.
- **HQ:** **Gdańsk, Polsko** – ul. Cypriana Kamila Norwida 1, 80-280 Gdańsk
- **Pobočky:** Gdańsk (HQ), **Peking (Asia)**, **São Paulo (Latin America)**
- **Vznik:** **2009** (17+ let v industry, jedna z nejstarších email marketing firem)
- **Founder a CEO:** Krzysztof Jarecki (CEO)
- **Klíčoví exec.:** Anna Flis (CEO/Vice President), Eduardo Teixeira (COO), Zbigniew Choszcz (CFO)
- **Velikost:** 1 000+ klientů celosvětově, **20+ miliard zpráv ročně**
- **Pozice:** **Multichannel CDP + Marketing Automation hub** pro **mid-to-large e-commerce**
- **Specializace:** **Exclusively e-commerce** (oficiální claim 2025+); secondary verticals: travel & hospitality, finance & banking, automotive, media & publishing
- **Tržní úroveň:** Mid-market + Enterprise SMB
- **Lokalizace UI:** **English, Polish, Portuguese** (kvůli offices v Brazílii). **Čeština ani slovenština nejsou** v UI.

### Filozofie produktu

ExpertSender se distancuje od **"general email tools"** (Mailchimp, MailerLite). Marketing claim: **"Marketing Automation that actually drives e-commerce sales"** – kritika ostatních platforem za to, že automatizace sama o sobě negeneruje ROI bez data + segmentation + správného timing.

Velký důraz na:

- **Dedicated account manager** pro každého klienta
- **Strategic onboarding** – ne self-service jako u Mailchimpu
- **Migration assistance** zdarma (vlastní migration team)
- **Industry-strength infrastructure** (20B zpráv/rok)

```
┌─────────────────────────────────────────────────────────────────┐
│                  EXPERTSENDER PLATFORM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Email          │  │ SMS          │  │ Web Push        │      │
│  │ Marketing      │  │ Marketing    │  │ Notifications   │      │
│  │ + Transactional│  │              │  │                 │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Mobile Push    │  │ On-site      │  │ Product         │      │
│  │ + In-App       │  │ (popups,     │  │ Recommendations │      │
│  │                │  │  banners)    │  │ engine          │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Predictive AI  │  │ A/B testing  │  │ Reports &       │      │
│  │ (CLV, churn,   │  │ + Multivar.  │  │ Analytics       │      │
│  │  STO, NPD)     │  │              │  │                 │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   CUSTOMER DATA PLATFORM (CDP) jádro                            │
│   Single Customer 360° Profile                                  │
│   Identity Resolution: cookie ↔ email ↔ phone ↔ user ID         │
│   RFM Analysis | Behavioral Segments | Real-time Events         │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   E-commerce-specific integrace:                                │
│   Shopify | WooCommerce | Magento (Adobe Commerce) | PrestaShop │
│                                                                 │
│   + Dedicated Customer Success Manager (každý klient!)          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│   EU-hosted (Gdańsk) | ISO 27001 | Silver Microsoft Partner     │
│   Fully GDPR compliant | Custom contracts                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Tarify a pricing model

### 2.1 Pricing přístup

ExpertSender **nepoužívá self-serve pricing** jako Mailchimp / MailerLite. Místo toho:

- **Custom pricing per klient** – sales-driven model
- **Demo + consultation required** before sign-up
- **Volume-based scaling** – počet kontaktů, zpráv, kanálů
- **Annual contracts** typically
- **Onboarding included** – ne extra fee

### 2.2 Vstupní bod (2026)

- **Start grow from $450 USD/měsíc** (oficiální claim na expertsender.com)
- Pro velké e-commerce: typicky **$1 000–$5 000+/měsíc**
- Enterprise: $10K+/měsíc reálné

### 2.3 Cílový klient – qualifying criteria

ExpertSender explicitně uvádí, kdo je vhodný klient:

- **Minimálně 30 000 unique visits/měsíc** na vašem e-shopu
- **Looking for partner, not just tool** – chcete dedicated expert support
- **Ne hledáte pure email marketing tool** – chcete revenue-driving system
- **Mid-to-large e-commerce** s real data volume

⚠️ Pro **malé e-shopy s <30K visits/měsíc** ExpertSender **není fit** – preferují Klaviyo / Brevo / GetResponse.

### 2.4 Pricing struktura (typically)

| Komponent                  | Co ovlivňuje cenu                              |
| -------------------------- | ---------------------------------------------- |
| **Active contacts**        | Hlavní pricing driver                          |
| **Channels enabled**       | Email only / + SMS / + Push / Full omnichannel |
| **Volume of messages**     | Per channel monthly volume                     |
| **Dedicated IP**           | Add-on (placeno per IP + maintenance fee)      |
| **Custom integrations**    | Per project                                    |
| **Service level**          | Onboarding hours, strategy consulting          |
| **API request volume**     | Higher tiers                                   |
| **Account managers count** | 1 standard, multiple Enterprise                |

### 2.5 Pricing nejasnosti (industry critique)

G2 review: _"It should allow users to buy/add/remove dedicated IP to/from their pools, without the need to ask the technical support team to do it and more importantly paying only for the new IP (instead of paying for the new IP and for the 'adding a new IP cost')."_

- **Dedicated IP changes manual** – ne self-service
- **Některé operations s extra fee** (IP přidání)
- **Pricing not publicly transparent** – nevýhoda pro rychlou evaluation

### 2.6 Co je v ceně included

- Dedicated account manager
- Standard onboarding
- Email + zvolené channels
- Migration assistance from previous platform
- ISO 27001 hosting
- GDPR compliance support
- Standard API limits
- Standard support (chat + email + phone)
- Knowledge base access

### 2.7 Typicky add-ons (extra fee)

- Additional dedicated IPs
- Custom integration development
- Strategy consulting hours nad standard
- Premium SLA
- Multiple-account setup (multi-brand)

### 2.8 Free trial

- **Demo + consultation** (ne self-serve free trial jako Mailchimp)
- Po demo: pilot / POC možný
- 14-day trial referenced v některých zdrojích (limited self-serve trial period s reduced features)

### 2.9 ROI claims (case studies)

- **4F (polský sportswear):** up to **12× ROI** through marketing automation
- **Szopex:** **64% increase v open rate** (multichannel automation)
- **Answear (fashion e-commerce):** revenue growth
- **Taranko:** improved customer communication efficiency

Hlavní ROI driver per ExpertSender claim: **personalized multichannel + RFM analysis + real-time triggers** > generic batch sends.

---

## 3. E-commerce-only positioning

ExpertSender **explicitly designs itself for e-commerce**, ne general purpose. Toto je důležitý rozdíl od Mailchimpu / Brevo / GetResponse.

### 3.1 Cíloví zákazníci

- **Mid-to-large e-commerce stores** (Shopify, Magento, custom platforms)
- **Subscription box services** (recurring shipments)
- **Marketplace sellers** (multi-product catalogs)
- **D2C brands** s vlastním e-shopem
- **Travel & hospitality** (bookings, loyalty)
- **Finance & banking** (transactional + marketing)
- **Automotive** (lead nurturing pro dealers)
- **Media & publishing** (subscription model)

### 3.2 Vertikály ne ideal

- B2B SaaS s sales-led model (HubSpot lepší)
- Pure content creators (ConvertKit / Beehiiv / MailerLite lepší)
- Bloggery / solopreneurs (overkill)
- NGO bez budget pro dedicated support
- Pure newsletter publishers

### 3.3 E-commerce-specific features built-in

- **Abandoned cart automation** (per channel)
- **Browse abandonment** flows
- **Post-purchase sequences**
- **Replenishment reminders** (consumables – ML predicted next order date)
- **Cross-sell / Upsell engines**
- **Win-back campaigns**
- **VIP customer programs**
- **Product recommendations** v emailech + on-site
- **Stock alerts** (back in stock, low stock)
- **Dynamic pricing** alerts
- **Cart sharing** (multi-device)
- **Review request automation**

### 3.4 Klíčové integrace

- **Magento / Adobe Commerce** (deep)
- **Shopify** + Shopify Plus
- **WooCommerce**
- **PrestaShop** (popular v Polsku!)
- **BigCommerce**
- Custom platforms via API

---

## 4. CDP

ExpertSender se v 2025+ pozicionuje primárně jako **CDP (Customer Data Platform)** s built-in messaging, ne jako tradiční ESP.

### 4.1 Co je ExpertSender CDP

Per Shopify CDP guide (2026): _"Automation-centric CDPs, like ExpertSender CDP, are designed to simplify campaign execution. They can automatically perform marketing actions like sending an email, triggering a push notification, or implementing ad retargeting, all based on customer behavior."_

Architectural shift od ESP k CDP:

```
ESP architectura (tradiční):
- Stores: email, name, phone (contact data)
- Sends: campaigns
- Tracks: opens, clicks, bounces
- Limited: customer profile insights

CDP architectura (ExpertSender 2025+):
- Stores: **"Golden Record"** per customer
  - Demographics
  - Transactional history (orders, returns, refunds)
  - Behavioral data (browsing, search, cart events)
  - Engagement (email, SMS, push, on-site)
  - Predictive scores (CLV, churn, NPD)
  - Identity links (anonymous IDs)
- Sends: campaigns + journey orchestration
- Tracks: all customer touchpoints + outcomes
- Powers: AI predictions + real-time activation
```

### 4.2 Data ingestion sources

ExpertSender CDP přijímá data z:

#### E-commerce platforms

- Shopify, WooCommerce, Magento, PrestaShop
- Customer accounts
- Order events (placed, shipped, delivered, returned, refunded)
- Cart events
- Product views, searches

#### CRM systems

- Salesforce, HubSpot, custom CRMs
- Customer data sync
- Deal/opportunity data

#### POS systems

- In-store purchase data
- Loyalty program activity
- Cross-channel attribution

#### Web tracking

- Site visits via JS snippet
- Pages viewed
- Time on page
- Search queries
- Custom events

#### Mobile apps

- SDK integration
- App events
- In-app purchases
- Push subscription state

#### External

- Webhooks
- API ingestion
- Custom imports (CSV, SFTP)

### 4.3 Data unification

```
Raw data from multiple sources
   ↓
Data cleaning + deduplication
   ↓
Identity resolution (matching)
   ↓
Profile creation / update
   ↓
"Single Customer 360° Profile"
   ↓
Real-time activation
```

### 4.4 Persistent profiles

- **All historical data retained** – not 90-day window like DMPs
- **Profile timeline** chronological view
- **Cross-device, cross-channel** view
- **Anonymous + identified** stitching
- **GDPR-compliant deletion** flow

### 4.5 Real-time vs. batch

ExpertSender CDP funguje **real-time**:

- Customer browses → events recorded immediately
- Predictive scores update na novou událost
- Segments re-evaluate continuously
- Workflow triggers fire within seconds

---

## 5. Identity resolution a Single Customer Profiles

### 5.1 Identity resolution proces

```
Visitor lands on website (anonymous)
   ↓
Cookie ID assigned (e.g. "anon_xyz123")
   ↓
Pageviews, product views tracked
   ↓
Customer enters email (form, checkout)
   ↓
Anonymous profile → identified profile (matched via cookie)
   ↓
On second device: same email used
   ↓
Profile merged (cross-device)
   ↓
Phone number provided
   ↓
SMS subscription linked to same profile
   ↓
Single unified profile across all touchpoints
```

### 5.2 Customer identifiers used

- **Email address** (primary)
- **Phone number**
- **Cookie ID** (anonymous tracking)
- **User account ID** (when logged in)
- **Mobile device ID** (app users)
- **Loyalty card number** (in-store)
- **Custom external ID**

### 5.3 Single Customer 360° Profile contains

#### Demographics

- Name, age, gender (if collected)
- Location (city, region, country)
- Language preference
- Consent status per channel

#### Transactional

- Order history (all orders chronologically)
- AOV (current + historic)
- Total spent
- Categories purchased
- Brands purchased
- Returns/refunds
- Loyalty status

#### Behavioral

- Page views (chronological)
- Time on site sessions
- Search queries
- Cart events
- Wishlist items
- Product views
- Custom events

#### Engagement

- Email: sent, opened, clicked, bounced, unsubscribed
- SMS: delivered, clicked, opted-out
- Push: delivered, clicked, opt-in state
- On-site: popups seen, dismissed, converted

#### Predictive scores (ML-generated)

- **CLV (Customer Lifetime Value)** – predicted total spend
- **Churn probability** – % likely to churn next N days
- **Next purchase date (NPD)** – predicted timing
- **Send Time Optimization (STO)** – optimal sending time per user
- **Product affinity** – categories likely to buy
- **Discount sensitivity** – respond to discounts vs. brand

#### Segments

- Membership in dynamic segments
- RFM cohort (Champions, Loyal, etc.)
- Custom segments

---

## 6. Segmentation (dynamic + RFM)

ExpertSender's **segmentation strength** je často citována v reviews jako klíčový asset.

### 6.1 Dynamic segments

- **Auto-update real-time** based na customer behavior
- Filter criteria:
  - Profile attributes
  - Transactional data
  - Behavioral events
  - Predictive scores
  - Engagement metrics
  - Subscription consent
  - Source (acquisition channel)
  - Geographic
  - Time-based
- **Logical operators:** AND, OR, NOT, parentheses
- **Unlimited segments** (per plan)

### 6.2 RFM Analysis (klíčový feature)

**Recency, Frequency, Monetary** scoring framework:

- **Recency:** how recently did customer purchase
- **Frequency:** how often do they purchase
- **Monetary:** how much do they spend

#### RFM scoring

ExpertSender automaticky vypočítává RFM scores per profile (1–5 per dimension, total 1–15 nebo per dimension 1–125):

Common cohorts:

- **Champions** – best customers (high R, F, M)
- **Loyal Customers** – consistent buyers
- **Potential Loyalists** – new but engaged
- **New Customers** – first-time buyers
- **Promising** – early signals positive
- **Need Attention** – declining engagement
- **About to Sleep** – declining recency
- **At Risk** – high value but declining
- **Cannot Lose Them** – top spenders going inactive
- **Hibernating** – inactive
- **Lost** – churned

### 6.3 Segment-driven activation

```
Segment "At Risk" auto-updates
   ↓
Customer transitions from "Loyal" → "At Risk"
   ↓
Automation triggers:
- Workflow: At-risk re-engagement
   ↓
Email 1: "We miss you" + 15% discount
Email 2 (3 days): VIP offer + free shipping
Email 3 (7 days): Final reminder + survey
Web push: gentle reminder
SMS (if opted in): time-sensitive offer
```

### 6.4 Segment types

#### Behavioral segments

- "Viewed product X but didn't buy"
- "Added to cart, abandoned within 24h"
- "Opened last 3 newsletters but no purchase"
- "Browsed category Y in last 7 days"

#### Transactional segments

- "Top 10% by lifetime value"
- "Purchased category X, never Y"
- "AOV > €100"
- "More than 5 orders last 12 months"

#### Predictive segments

- "Predicted CLV > €500"
- "Churn risk High + still subscribed"
- "Predicted next purchase within 7 days"

#### Engagement segments

- "Engaged email subscribers (opened last 30 days)"
- "Cold list (no open last 90 days)"
- "Web push subscribers active last 14 days"

#### Hybrid (most powerful)

- "Champions cohort + opened last 14 days + browsed jewelry category"
- "At Risk + predicted CLV > €1000 + email engaged"

---

## 7. Email Marketing

### 7.1 Email capabilities

#### Editor types

- **Drag-and-drop editor** (intuitive, modern)
- **HTML editor** (custom code)
- **Hybrid** – drag-drop with HTML blocks
- **Saved templates** library

#### Personalization

- **Merge fields** s syntax `[[field_name]]`
- **Dynamic content blocks** (per segment)
- **Product recommendations** blocks (AI-powered)
- **Conditional content** (if/then logic)
- **Multi-language** templates
- **Dynamic images** (per profile)

#### Send-time options

- Send now
- Schedule
- **Send Time Optimization (STO)** – AI per user
- Time-zone send (local time)
- Throttled sending (spread over hours/days)

### 7.2 Campaign types

- **Regular campaigns** (broadcast)
- **A/B test campaigns** (multiple variants)
- **Multivariate testing** (content + subject + time)
- **Triggered campaigns** (event-based)
- **Recurring campaigns** (RSS, daily/weekly)
- **Transactional emails** (order conf, shipping)

### 7.3 A/B testing

- **Test variants:** subject, content, sender, time
- **Sample size** configurable
- **Statistical significance** auto-detection
- **Winner auto-send** to remaining audience
- **Multivariate testing** (test 3+ variables simultaneously)

### 7.4 Email infrastructure (G2 reviewers highlight)

ExpertSender's **deliverability infrastructure** je often citována jako klíčový asset:

- **Throttling controls** – customize send rate
- **IP reputation management** – multi-IP pools
- **Engagement-based routing** – best engagers via best IPs
- **Dedicated IP pools** (paid add-on)
- **Subdomain authentication**
- **MX records monitoring**
- **Spam test pre-send**

G2 review: _"It has almost all the crucial and strategic features any experienced email marketing could dream about. Throttling and IP reputation still are game changers and it will allow you go that in-depth."_

### 7.5 Per-email tracking

- Sent, delivered, bounced (hard/soft)
- Opens (unique + total), open rate
- Clicks + CTR, top links
- Click maps (heatmap)
- Geographic distribution
- Device/email client breakdown
- Conversions (orders), revenue attribution
- Time-to-conversion

---

## 8. SMS Marketing

### 8.1 SMS capabilities

- **Bulk SMS campaigns**
- **Transactional SMS** (order confirmations, shipping alerts)
- **Two-way SMS** (limited regions)
- **Personalization** s merge fields
- **TCPA/GDPR compliance** flow
- **Per-country pricing** (credits-based or per-message)
- **Link tracking** (shortened URLs)

### 8.2 Use cases

- Time-sensitive promos (flash sales)
- Cart abandonment (1-2h after)
- Shipping notifications
- VIP customer alerts
- Event reminders
- OTP / 2FA (transactional)
- Birthday offers

### 8.3 SMS v automation workflows

- Trigger SMS as workflow step
- Combine s email + push pro multichannel sequences
- Conditional logic: "if email not opened in 24h → send SMS"

### 8.4 Compliance

- **Opt-in requirement** (explicit consent)
- **Opt-out keywords** (STOP, REMOVE, etc.)
- **Sender ID** customizable per country
- **Quiet hours** enforcement (TCPA US compliance)
- **GDPR consent tracking**

### 8.5 Limitations

- **Per-country pricing** varies – expensive internationally
- **Some regions limited** support
- **WhatsApp integration** newer (per latest features)

---

## 9. Web Push Notifications

### 9.1 Capabilities

- **Browser-native push** (Chrome, Firefox, Edge, Safari)
- **Subscription** via service worker on site
- **Personalized content** s merge fields
- **Rich notifications** (image, action buttons)
- **Geo-targeting**
- **Frequency caps**
- **Click tracking**
- **Triggered from automation** or campaign

### 9.2 Use cases

- Cart abandonment (push to non-subscribers cookie-based)
- Flash sale alerts
- New product launches
- Stock alerts
- Price drop notifications
- Editorial content (media/publishing)

### 9.3 Anonymous user push

**Key advantage:** Web push works for **anonymous visitors** who haven't given email yet:

- Visitor consents to push
- Cookie ID stored
- Push subscription linked to anonymous profile
- Later when visitor signs up → push subscription linked to email profile

### 9.4 Push v workflows

```
Trigger: Cart abandoned (anonymous)
   ↓
Wait 1 hour
   ↓
Send web push: "Forgot your cart? Click here"
   ↓
If clicks → drives to checkout
   ↓
If converts → exit workflow
   ↓
If no convert in 24h:
   - Did visitor give email since?
     YES → send email cart abandonment
     NO → send 2nd push s discount
```

---

## 10. Mobile Push & In-App

### 10.1 Mobile push

- **iOS + Android SDK** integration
- **Token storage** v customer profile
- **Personalization tokens**
- **Rich notifications** (image, action buttons)
- **Deep linking**
- **Geofencing** (some plans)
- **Frequency caps**

### 10.2 In-App messages

- **Native popups** v mobile aplikaci
- **Behavior-triggered**
- **Onboarding sequences**
- **Promotional banners**
- **Surveys / feedback**
- **Rich media support**

### 10.3 Use cases

- Order status updates
- Cart reminders
- Personalized product recommendations
- Loyalty rewards alerts
- Time-sensitive offers
- Re-engagement

---

## 11. On-site personalization

### 11.1 Web personalization features

- **Pop-ups** (modal, slide-in, sticky bar)
- **Banners** (top/bottom of page)
- **Product recommendations** widgets
- **Personalized content blocks**
- **Exit-intent triggers**
- **Behavioral triggers** (time, scroll, click)

### 11.2 Pop-up types

- **Welcome popup** (first-time visitor)
- **Email capture** (lead magnet)
- **Discount offer** (returning visitor)
- **Cart abandonment** (when leaving cart page)
- **Newsletter signup**
- **Exit-intent**
- **Promotional countdown**

### 11.3 Behavioral triggers

- Time on page
- Scroll depth %
- Exit intent
- Click on specific element
- Returning vs. new visitor
- Page URL match
- Cart state
- Segment membership (logged-in users)

### 11.4 Real-time personalization

- Show different content based na:
  - Segment membership
  - Purchase history
  - Browse behavior
  - Predicted preferences
- Dynamic product recommendations
- Personalized hero images
- Tailored CTAs

---

## 12. Marketing Automation Workflows

### 12.1 Workflow capabilities

- **Visual drag-and-drop builder**
- **Multi-trigger workflows**
- **Branching conditions** (yes/no, multi-path)
- **Timing controls** (delays, schedules, time travel)
- **Multi-channel** (email + SMS + push + on-site)
- **Goal tracking** + exit conditions

### 12.2 Workflow triggers

#### Behavioral

- Page visited (specific URL)
- Custom event (any tracked event)
- Form submission
- Cart abandonment
- Browse abandonment
- Search query
- Wishlist add

#### Transactional

- Order placed
- Specific product purchased
- Order cancelled / refunded
- First purchase
- Repeat purchase
- AOV threshold reached

#### Engagement

- Email opened / clicked
- SMS clicked
- Push opened
- On-site popup converted

#### Lifecycle

- Subscribed to channel
- Unsubscribed
- Bounced
- Joined segment
- Left segment

#### Predictive

- Churn risk threshold
- CLV threshold
- Predicted purchase date approaching
- Affinity score change

#### Date-based

- Anniversary (birthday, signup)
- Specific date
- Date offset from custom field

### 12.3 Workflow actions

- **Send email** (designed inline or pre-built)
- **Send SMS**
- **Send web push**
- **Send mobile push**
- **Show on-site popup/banner**
- **Update profile property**
- **Add tag**
- **Add to segment** (forced)
- **Remove from segment**
- **Add to suppression**
- **Webhook** – call external URL
- **Trigger product recommendations**

### 12.4 Workflow rules / flow control

- **Delay** (time-based wait)
- **Wait until event** (event-based wait)
- **Condition** (branch yes/no based on criteria)
- **Split test** (A/B different paths)
- **Goal** (conversion event, exit if met)
- **Exit condition** (filter, remove if no longer matches)
- **Time travel** (delay in recipient's local time)

### 12.5 Common workflow patterns

#### Welcome series (multichannel)

```
Trigger: Subscribed to email
   ↓
Send welcome email
   ↓
Wait 2 days
   ↓
Send brand story email
   ↓
Wait 5 days
   ↓
Condition: Has purchased?
   YES → Exit (success)
   NO → Send first-purchase incentive email
   ↓
Wait 7 days, condition: still no purchase
   ↓
Send web push: "Still thinking about us?"
   ↓
Wait 10 days
   ↓
Send SMS (if opt-in): final offer
```

#### Abandoned cart (multichannel)

```
Trigger: Cart abandoned (>30 min)
   ↓
Wait 1 hour
   ↓
Send email: "Forgot something?"
   ↓
Wait 3 hours
   ↓
Condition: Email opened?
   YES → Continue waiting 24h
   NO → Send web push (silent reminder)
   ↓
After 24h, condition: Purchased?
   YES → Exit
   NO → Send email: 10% discount
   ↓
After 48h, condition: Purchased?
   YES → Exit
   NO → Send SMS: final reminder + free shipping
```

#### Post-purchase upsell

```
Trigger: Order placed (specific category)
   ↓
Wait 3 days (delivery time)
   ↓
Send "How are you enjoying" email
   ↓
Wait 7 days
   ↓
Send review request email
   ↓
Wait 14 days
   ↓
Send cross-sell email (related products)
   ↓
Wait 30 days
   ↓
Trigger: Predicted next purchase date approaching?
   YES → Send replenishment reminder
```

### 12.6 Workflow weakness (G2 critique)

Některá G2 review uvádí: _"Automation tools and features are really weak compared to the competition."_

Toto je **kontroverzní bod** – jiné reviews chválí automation. Pravděpodobně závisí na use case:

- Klaviyo má hlubší automation pro DTC
- ActiveCampaign má pokročilejší branching logic
- ExpertSender je solidní mid-market, ne best-in-class

---

## 13. Predictive Analytics & AI

### 13.1 ExpertSender's AI approach

**Důležitý disclaimer per Authencio review:** _"It is important to distinguish this from Generative AI (like ChatGPT). ExpertSender's AI focuses on backend logistics using machine learning."_

ExpertSender používá **traditional ML pro marketing automation**, ne generative AI pro content creation (na rozdíl od Klaviyo Marketing Agent / HubSpot Breeze).

### 13.2 Predictive scores

#### CLV (Customer Lifetime Value)

- Historic + Predicted (next 12 months)
- ML model trained on order history + behavior
- Use cases:
  - VIP segments (top 10% predicted)
  - Lookalike audiences for ads
  - Budget allocation
  - Branch flows by spend power

#### Churn Probability

- ML predicts % likely to churn next N days
- Based on engagement decline + purchase patterns
- Use cases:
  - Trigger retention flows pre-churn
  - VIP rescue campaigns
  - Discount targeting

#### Predicted Next Purchase Date (NPD)

- ML predicts when next purchase likely
- Trigger replenishment X days before
- Especially powerful pro **consumables** (kosmetika, doplňky, krmivo)

#### Send Time Optimization (STO)

- Per-user optimal send time
- Based na historical engagement patterns
- Increases open rates significantly

### 13.3 Predictive segments

```
Segment: "Top VIPs at Risk"
   - Predicted CLV > $500
   - Churn risk: High
   - Subscribed: Yes
   ↓
Use: priority retention campaign + dedicated CSM outreach
```

### 13.4 Limitations vs. modern AI

- **No autonomous agents** (jako Klaviyo Customer Agent)
- **No generative content** (jako HubSpot Breeze, GetResponse AI Email Generator)
- **No conversational AI**
- **Focus on backend ML**, ne user-facing AI tooling

---

## 14. Product Recommendations engine

ExpertSender's **proprietary product recommendation engine**.

### 14.1 Recommendation strategies

#### Collaborative filtering

- "Customers who bought X also bought Y"
- Based on aggregate customer behavior

#### Content-based

- "Similar to what you viewed"
- Based on product attributes (category, price, brand)

#### Personalized

- Per profile preferences + history
- ML-driven

#### Trending

- Hot products right now
- Based on real-time aggregate behavior

#### Cross-sell / Upsell

- Complementary products
- Higher-priced alternatives

### 14.2 Recommendation contexts

- **Email blocks** – dynamic recommendations v každém email
- **On-site widgets** – product page, cart, checkout
- **Pop-ups** – personalized recommendations
- **Push notifications** – product-specific
- **Web push** – cart-related products

### 14.3 Personalization rules

- Show recommendations based on:
  - Browse history
  - Purchase history
  - Wishlist
  - Cart content
  - Segment membership
  - Predicted affinity

---

## 15. Transactional Email

### 15.1 Capabilities

- **Built-in transactional API** (ne separate platform like MailerSend!)
- **High-throughput** infrastructure
- **Per-recipient personalization**
- **Templates** with variables
- **Attachments** support
- **Same deliverability** as marketing (or even better with dedicated pools)

### 15.2 Use cases

- Order confirmations
- Shipping notifications
- Password resets
- Account notifications
- Receipts
- Refund confirmations

### 15.3 Unified vs. separate transactional

**ExpertSender advantage:** transactional + marketing v jedné platformě (na rozdíl od MailerLite ↔ MailerSend split).

Benefits:

- Unified customer profile
- Single dashboard
- One billing
- Shared templates
- Cross-context analytics (e.g. did marketing email lead to purchase tracked via transactional confirmation)

### 15.4 Brevo srovnání

Brevo i ExpertSender mají integrated transactional + marketing. ExpertSender je více **e-commerce-specific**, Brevo **multi-vertical**.

---

## 16. Deliverability & IP infrastruktura

### 16.1 Infrastructure scale

- **20+ billion messages annually** (claim 2024+)
- **Multiple data centers** (primarily EU)
- **Multi-IP pools** s reputation tiering
- **Dedicated IPs** available (add-on)
- **Real-time monitoring**
- **Bounce management** automatic

### 16.2 Authentication setup

| Protokol                    | Setup                                      |
| --------------------------- | ------------------------------------------ |
| **SPF**                     | Include for ExpertSender's sending servers |
| **DKIM**                    | CNAME records on sending subdomain         |
| **DMARC**                   | TXT record on \_dmarc                      |
| **BIMI**                    | After DMARC reject + verified logo         |
| **Sender ID**               | Microsoft authentication                   |
| **Branded tracking domain** | Setup pro click links                      |

### 16.3 Domain authentication flow

```
Account settings → Domains
   ↓
Add sending domain
   ↓
ExpertSender generates DNS records
   ↓
Add to your DNS provider
   ↓
ExpertSender validates
   ↓
[Authenticated]
   ↓
Emails signed with your domain
```

### 16.4 Deliverability tools

- **Throttling controls** (per IP, per recipient)
- **IP reputation monitoring**
- **Engagement-based routing** – best engagers via best IPs
- **List validation** – pre-send checks
- **Bounce categorization** (hard, soft, complaint)
- **Suppression management**
- **Feedback Loop (FBL)** integration
- **Spam complaint auto-suppression**

### 16.5 Dedicated IP

- Available as **add-on** (paid)
- **Manual setup** via support team (G2 critique – ne self-service)
- **Recommended pro high volume** senders (1M+ emails/měsíc)
- **Custom warm-up plan**
- **IP rotation** (multiple IPs)

### 16.6 Gmail/Yahoo 2024+ compliance

- **One-click unsubscribe (RFC 8058)** – auto-implemented
- **DKIM + DMARC enforced**
- **Spam complaint rate < 0.3%** monitored
- **Functional unsubscribe** immediate

---

## 17. API, Integrace

### 17.1 API

- **REST API** (modern, well-documented)
- **API authentication** (key-based)
- **Rate limits** vary by plan
- **High-volume support** pro enterprise
- G2 reviews: _"Its API works very well too"_

### 17.2 Hlavní API endpoints

| Resource         | Operace                   |
| ---------------- | ------------------------- |
| `/subscribers`   | CRUD subscribers          |
| `/lists`         | List management           |
| `/segments`      | Segment management        |
| `/campaigns`     | Campaign CRUD             |
| `/workflows`     | Automation management     |
| `/transactional` | Send transactional emails |
| `/events`        | Track custom events       |
| `/products`      | Product catalog           |
| `/orders`        | Order data ingestion      |
| `/reports`       | Reports access            |
| `/webhooks`      | Webhook subscriptions     |

### 17.3 Webhooks

Real-time event notifications:

- Subscriber events (subscribed, unsubscribed, bounced)
- Campaign events (sent, opened, clicked)
- E-commerce events (order, cart abandon)
- Form submissions
- Workflow events

### 17.4 Native integrace

**Klíčové e-commerce integrace** (deep):

- **Magento / Adobe Commerce**
- **Shopify** + Shopify Plus
- **WooCommerce**
- **PrestaShop**
- **BigCommerce**
- Custom platforms via API

### 17.5 Další integrace

#### CRM

- Salesforce
- HubSpot
- Microsoft Dynamics
- Pipedrive

#### Analytics

- Google Analytics
- Adobe Analytics

#### Customer Service

- Zendesk
- Freshdesk

#### Ads

- Facebook/Meta Ads (Custom Audiences sync)
- Google Ads (audiences)

#### iPaaS

- Zapier
- Make (Integromat)
- Workato

### 17.6 Plugins

- **Magento extension** (deep native)
- **Shopify app**
- **WordPress / WooCommerce plugin**
- **PrestaShop module**

### 17.7 JavaScript tracking

- **JS snippet** for web tracking
- **Custom event tracking** via JS
- **Form integration** via JS
- **Cookie management** for anonymous tracking

---

## 18. Dedicated support model

ExpertSender's klíčový diferenciátor je **service-driven approach** vs. self-service.

### 18.1 Dedicated Account Manager

**Každý klient dostává:**

- Dedicated point of contact
- Knows your business + data
- Helps design campaigns
- Reviews performance regularly
- Suggests new tests

### 18.2 Strategic onboarding

- **Initial onboarding** (typically 4-8 weeks)
- **Data integration setup**
- **Template mapping**
- **Initial workflows configuration**
- **Team training**
- **First campaign launch** support

### 18.3 Migration assistance

- **Migration team** dedicated
- **No downtime** during switch
- **Data + integrations migration** assisted
- **Pre-built scenarios** ready
- Available **regardless of support plan**

### 18.4 Support channels

- **Email** (24/7)
- **Phone** (business hours, multilingual)
- **Live chat**
- **Knowledge base** (English, Polish, Portuguese)
- **Dedicated account manager** Slack/email
- **Quarterly business reviews** (Enterprise)

### 18.5 Languages

- English
- Polish (native)
- Portuguese (Brazilian office)
- Chinese (Beijing office for APAC)

### 18.6 Support critique

G2 reviews převážně **positivní** o supportu:

- _"Customer support is very friendly and will provide detailed explanations"_
- _"Support always helpful... didn't have any unsolved issues"_
- _"Excellent communicators"_
- _"Brilliant customer care"_

Some critique:

- _"Slow response times or system lags during off-hours or on slower networks"_
- Dedicated IP changes require support intervention

---

## 19. Compliance

### 19.1 EU hosting + ISO 27001

- **HQ Gdańsk, Polsko** – EU jurisdiction
- **EU data residency** default
- **ISO 27001 certified** (security)
- **Silver Microsoft Partner**
- Hosting in EU data centers

### 19.2 GDPR features

- **Fully GDPR compliant** (oficiální claim)
- **GDPR consent fields** v forms
- **Per-channel consent tracking**
- **Audit trail** (IP, timestamp, source)
- **Right to Be Forgotten:**
  - UI: subscriber profile → delete
  - API: DELETE endpoint
- **Data export** per subscriber
- **DPA available**

### 19.3 Consent tracking

Per profile:

- Email subscription consent (timestamp, IP, source)
- SMS opt-in
- Web push opt-in
- Mobile push opt-in
- Marketing vs. transactional separation
- GDPR consent fields per form

### 19.4 Compliance certifications

- **GDPR compliant**
- **ISO 27001:2013**
- **CASL** (Canadian)
- **CAN-SPAM** (US)
- **CCPA** (California)
- **eIDAS** (EU electronic identification)
- LGPD (Brazilian, via São Paulo office)

### 19.5 Security

- **2FA** (TOTP, SMS)
- **SSO/SAML** (Enterprise)
- **IP whitelist** for API
- **Audit logs**
- **Encryption** at rest + in transit
- **Role-based access control (RBAC)**
- **Password policies**

### 19.6 Industry compliance

ExpertSender member organizací podle reviews:

- Email marketing best practices initiatives
- GDPR working groups
- ECO (Electronic Commerce Organization) Germany
- IAB Europe

---

## 20. Limity a nedostatky

### 20.1 Není pro malé klienty

- **Minimum 30K visits/month** recommended
- **Custom pricing** = sales process required (no self-serve)
- **$450 USD/měsíc minimum start** typicky
- Pro solopreneurs / malé firmy je **overkill** + **drahé**
- **No free plan** (vs. Mailchimp, MailerLite, Brevo)

### 20.2 UI/UX critique

- **"Utilitarian and feature-dense"** UI (Authencio review)
- **Steep learning curve** pro beginners
- _"Interface can feel a bit dated and overwhelming for new users"_ (G2)
- _"Marketing Manager used to the simplicity of Mailchimp may find the workflow logic and data mapping intimidating initially"_
- **Drag-and-drop editor** OK ale not best-in-class
- **Tech-heavy product** – designed for power users
- **Mobile interface** less polished

### 20.3 Setup complexity

- **Developer resources may be needed** pro CDP features
- **Data synchronization** ne always no-code
- **Initial setup** longer (4-8+ weeks typical onboarding)
- **Magento integration deep** ale complex
- **Custom integrations** require dev work

### 20.4 Automation depth critique

- _"Automation tools and features are really weak compared to the competition"_ (G2)
- Méně sofistikované branching než ActiveCampaign / Klaviyo
- Less templates v automation library
- Some workflow logic limitations

### 20.5 Self-service limitations

- **No public pricing** – muset request demo
- **No self-service free trial** (jen demo + consultation)
- **Dedicated IP changes** vyžadují support intervention (G2 critique)
- **Report templates can't be saved** (G2 critique)
- **Some operations need technical support**

### 20.6 Locale support

- **No Czech / Slovak UI** – velký mínus pro CZ/SK trh
- **3 languages only** (English, Polish, Portuguese)
- Documentation primarily English (PL + PT subset)

### 20.7 AI capabilities limited

- **ML-based predictive scores** (CLV, churn, NPD, STO)
- **No generative AI** for content creation
- **No autonomous AI agents**
- **No conversational AI**
- Behind Klaviyo (Customer Agent, Marketing Agent) and HubSpot (Breeze) in AI roadmap

### 20.8 Reporting limitations

- _"More built-in templates and easier third-party integrations would enhance the overall user experience"_
- **Can't save report templates** – musí reconfigure each time
- **Custom dashboards** more limited
- **Multi-touch attribution** less sophisticated

### 20.9 Pricing transparency

- **No public pricing** – hard for evaluation
- **Add-ons can stack** (dedicated IPs, custom integrations)
- **Annual contracts typical** – less flexible
- **Some hidden costs** (IP setup fees)

### 20.10 Specific missing features

- **No native webinars** (vs. GetResponse)
- **No native course creation** (vs. GetResponse)
- **No native digital products sales** (vs. MailerLite)
- **No paid newsletters** built-in
- **No native CRM** (light) – assumes external CRM integration
- **No autonomous AI agents**
- **No native review collection** (uses external)
- **No multi-language UI** beyond 3 languages
- **No WhatsApp Business** native (limited)

### 20.11 Migration challenges

- **Custom workflows** must be recreated on other platforms
- **Historical event data** not portable in standard format
- **Predictive scores** locked-in
- **CDP data structure** may differ from competitors

---

## 21. Shrnutí: Pro koho a proti komu

### ExpertSender je dobrá volba pokud

- Provozujete **mid-to-large e-commerce** (30K+ visits/měsíc minimum)
- Hledáte **multichannel platform** (email + SMS + push + on-site v jednom)
- Vážíte si **dedicated account manager** + strategic guidance
- Chcete **migration support** zdarma
- Potřebujete **CDP + activation** v jedné platformě (ne separate)
- Cíl je **revenue-driving system**, ne basic email tool
- Operate v **Polsku, CEE, LATAM, nebo Asii** (offices v těchto regionech)
- Provozujete **e-commerce s complex catalog** (Magento, deep integration)
- Hledáte **GDPR-compliant EU platform**
- Máte budget pro **mid-market enterprise** (~$1K+/měsíc)
- Potřebujete **high-volume sender** infrastructure (1M+ emails/měsíc)
- Provozujete subscription business (recurring shipments, replenishment ML)
- Chcete **traditional ML** předpovědi (CLV, churn, NPD)

### ExpertSender není dobrá volba pokud

- Jste **small business / solopreneur** – overkill + nedostupné
- Hledáte **self-service free trial / freemium** – ExpertSender neoffer
- Pracujete v **češtině/slovenštině** – UI nepodporuje (jen EN/PL/PT)
- Jste **B2B SaaS** – HubSpot, Salesforce lepší
- Potřebujete **deep generative AI** (HubSpot Breeze, Klaviyo Marketing Agent)
- Hlavní use case je **pure newsletter publishing** – Substack, Beehiiv, ConvertKit lepší
- Potřebujete **online courses, webinars built-in** – GetResponse lepší
- Hledáte **simple, intuitive UI** – MailerLite, Mailchimp lepší
- Chcete **transparent pricing** without sales call – ExpertSender vyžaduje demo
- Provozujete **DTC s deep Shopify integration** – Klaviyo silnější
- Hledáte **autonomous AI agents** – Klaviyo/HubSpot dál
- Nepotřebujete **dedicated support** – platíte za nedostupnou hodnotu

### ExpertSender vs. konkurence

| Konkurence                     | Kdy lepší než ExpertSender                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| **Klaviyo**                    | Pure DTC e-commerce, Shopify deeper, predictive analytics + AI agents, US-focused              |
| **Mailchimp**                  | Small business, brand recognition, simple UI, self-serve                                       |
| **Brevo**                      | Multi-vertical (ne jen e-commerce), volume-based pricing, transparent self-serve, multilingual |
| **HubSpot**                    | Full B2B CRM, multi-Hub vision, complete revenue platform                                      |
| **ActiveCampaign**             | Deeper automation, more sophisticated workflows                                                |
| **GetResponse**                | Webinars, courses, content monetization, 27 languages incl. CZ/SK                              |
| **SAP Emarsys**                | Enterprise loyalty, complex retail org structures                                              |
| **Bloomreach**                 | Bigger DTC + content personalization, more enterprise                                          |
| **Salesforce Marketing Cloud** | Pure enterprise, Salesforce ecosystem integration                                              |
| **MailerLite**                 | Solopreneurs, content creators, simple use cases                                               |

---

_Dokument zpracován z oficiálních zdrojů expertsender.com a praktických zdrojů (G2, Capterra, GetApp, SoftwareAdvice, Research.com, SpotSaaS, SoftwareSuggest, SoftwareFinder, Authencio, Shopify CDP guide, CDP.com). Pro nejaktuálnější detaily je nutný demo s ExpertSender sales teamem (no public pricing)._
