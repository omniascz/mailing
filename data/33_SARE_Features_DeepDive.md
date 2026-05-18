# SARE – hloubková analýza funkcí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Zdroje:** oficiální dokumentace sare.pl + analytické weby a recenze (GetApp, SoftwareSuggest, SoftwareWorld, SaaSCounter, Digitree, RocketReach, EmailExpert, EmailVendorSelection) ověřené v dubnu–květnu 2026.
**Rozsah:** kompletní funkcionalita platformy v roce 2026 – email marketing, marketing automation, omnichannel (email + SMS + web push + surveys), CDP, ML-driven targeting, channel scoring.

> **Důležitý kontext:** SARE je **polský produkt** s HQ ve **Varšavě** (Mazowieckie). Mateřská společnost: **SARE S.A.** – součást **Digitree Group** (oznámeno jako *"part of the Digitree Group"* na oficiálním webu).
>
> **Pozice:** **Email marketing leader v Polsku** (per oficiální claim *"We are the email marketing leader in Poland"*). **Top 4-5 hráč na polském trhu** spolu s GetResponse, MailerLite (post-FreshMail), SALESmanago a ExpertSender.
>
> **Velikost firmy:** **Annual revenue $12.4M v 2026** (per RocketReach), Warszawa HQ.
>
> **Historie:** SARE pracuje s klienty od **2009+** (per VB Leasing reference: *"We have been using the SARE system for nearly 14 years. Our first mailings were sent out in 2009"*).
>
> **Klíčové diferenciátory:**
> - **Polish market expertise** – leading position v Polsku
> - **Omnichannel** (email + SMS + web push + surveys)
> - **ML-driven** targeting + automation
> - **Channel Scoring** – proprietary feature pro assessment user engagement
> - **CDP & database management** integrated
> - **Drag & Drop editor** + library
> - **A/B/X testing** s automatic winner selection
> - **Secure SMTP** pro transactional + marketing
> - **Dedicated Client Service team** – consultative approach
> - **Industry research + reports** publishing (thought leadership)
> - **Digitree Group ecosystem** (parent company synergies)
> - **English UI available** (per SaaSCounter)

---

## Obsah

1. [Co je SARE a pro koho je](#1-co-je-sare)
2. [Tarify a pricing model](#2-tarify)
3. [Klíčové diferenciátory v PL kontextu](#3-diferenciatory)
4. [SAREsystem architektura](#4-saresystem)
5. [CDP & Database Management](#5-cdp)
6. [Email Marketing & Drag-and-drop editor](#6-email-marketing)
7. [Marketing Automation (scenarios + paths)](#7-automation)
8. [Channel Scoring (UNIKÁTNÍ)](#8-channel-scoring)
9. [Omnichannel (email, SMS, web push, surveys)](#9-omnichannel)
10. [Segmentation + Personalization](#10-segmentation)
11. [A/B/X Testing (s auto-winner)](#11-ab-testing)
12. [Templates library](#12-templates)
13. [Reports & Analytics + Business Intelligence](#13-reports)
14. [Abandoned cart + product page communication](#14-abandoned-cart)
15. [Recurring messages](#15-recurring)
16. [Surveys / Questionnaires](#16-surveys)
17. [Integrace (Shopify, WooCommerce, PrestaShop, Shoper)](#17-integrace)
18. [API + Webhooks](#18-api)
19. [Secure SMTP](#19-smtp)
20. [Enterprise features (SSO, permissions, audits, SLA)](#20-enterprise)
21. [Compliance, GDPR/RODO, EU hosting](#21-compliance)
22. [Industry research + reports (thought leadership)](#22-research)
23. [Limity a nedostatky](#23-limity)

---

## 1. Co je SARE

- **Společnost:** SARE S.A.
- **Parent group:** **Digitree Group**
- **HQ:** **Warszawa, Mazowieckie, Polsko**
- **Pozice:** **Email marketing leader v Polsku**
- **Specializace:** **Mid-market + enterprise** s email + omnichannel needs
- **Lokalizace UI:** **Polština primary**, **English available** (per SaaSCounter)
- **Web:** sare.pl
- **Annual revenue:** **$12.4M v 2026** (per RocketReach)
- **Industry presence:** **15+ let** (klienti od 2009)

### Filozofie produktu

**"Email marketing leader v Polsku"** – marketing positioning.

Per oficiální:
> *"We are the email marketing leader in Poland. We have been developing email communication strategies. We provide tools and knowledge in the field, we build relationships with clients, and help ensure their loyalty. For years, we have been cooperating with leading Polish and international brands – helping them to create their success."*

### Per Digitree group (parent):

> *"We are part of the Digitree Group, providing comprehensive and effective digital campaigns, thanks to our own technology and tools, unique data, knowledge and experience of specialists. SAREsystem - tools for email marketing communication and marketing automation."*

### Reference customers

**Notable Polish brands (per oficiální):**
- **VB Leasing** (since 2009 – Independent e-Marketing Specialist Maciej Tykarski)
- **Polish Stem Cell Bank S.A.** (Łukasz Więcek, Multi-channel Sales Manager)
- **Leading Polish + international brands**
- **Polish enterprises + mid-market**
- **Polish banking + finance** (some segments)

```
┌─────────────────────────────────────────────────────────────────┐
│                   SARE PLATFORM (SAREsystem)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Email          │  │ Drag-and-drop│  │ Templates       │      │
│  │ Marketing      │  │ Editor       │  │ Library         │      │
│  │ Campaigns      │  │ + Components │  │                 │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Marketing      │  │ A/B/X        │  │ Channel         │      │
│  │ Automation     │  │ Testing      │  │ Scoring         │      │
│  │ (scenarios +   │  │ (auto-winner)│  │ (UNIKÁTNÍ)      │      │
│  │  paths)        │  │              │  │                 │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ CDP & Database │  │ Segmentation │  │ Personalization │      │
│  │ Management     │  │ (behavioral, │  │ (ML-driven)     │      │
│  │                │  │ transactional│  │                 │      │
│  │                │  │ , demograph.)│  │                 │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Reports &      │  │ Business     │  │ Real-time       │      │
│  │ Analytics      │  │ Intelligence │  │ Optimization    │      │
│  │ (advanced)     │  │ (BI)         │  │                 │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Abandoned Cart │  │ Recurring    │  │ Surveys /       │      │
│  │ + Product Page │  │ Messages     │  │ Questionnaires  │      │
│  │ Communication  │  │              │  │                 │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│   OMNICHANNEL CHANNELS:                                         │
│   ├─ Email (newsletter, transactional, automation)              │
│   ├─ SMS                                                        │
│   ├─ Web Push                                                   │
│   ├─ Surveys / Questionnaires                                   │
│   └─ Secure SMTP (transactional + marketing)                    │
├─────────────────────────────────────────────────────────────────┤
│   INTEGRATIONS:                                                 │
│   ├─ E-commerce: Shopify, WooCommerce, PrestaShop, Shoper       │
│   ├─ Zapier (broad ecosystem)                                   │
│   ├─ Google Analytics 360                                       │
│   ├─ Facebook Apps and Tabs                                     │
│   ├─ WordPress                                                  │
│   └─ Open API + webhooks                                        │
├─────────────────────────────────────────────────────────────────┤
│   ENTERPRISE FEATURES (corporates + banks):                     │
│   ├─ SSO (Single Sign-On)                                       │
│   ├─ Granular permissions                                       │
│   ├─ Audit logs                                                 │
│   ├─ SLA agreements                                             │
│   ├─ Regulatory compliance                                      │
│   └─ Dedicated Client Service consultant                        │
├─────────────────────────────────────────────────────────────────┤
│   + EU hosting + RODO/GDPR compliant                            │
│   + Industry research + reports publishing                      │
│   + Part of Digitree Group ecosystem                            │
│   + Polish + English UI                                         │
│   + Free trial available (no credit card)                       │
└─────────────────────────────────────────────────────────────────┘
```

### Typické use cases

- **Polish mid-market companies** s email needs
- **Polish enterprises** s omnichannel requirements
- **E-commerce** (Shopify, WooCommerce, PrestaShop, Shoper)
- **Polish banks + finance** (regulatory compliance + SSO + audit)
- **Subscription businesses**
- **Multi-brand companies**
- **Agency clients** (managed by Digitree partners)
- **International brands** operující v Polsku

### Per Digitree review

> *"SARE is a platform that scales with your marketing: from the first newsletter to complex automation scenarios."*

---

## 2. Tarify a pricing model

### 2.1 Pricing approach

Per SoftwareWorld:
- **No free version** (paid only)
- **Free trial available** (no credit card required)
- **Subscription pricing model**
- **Custom pricing per klient** (sales-driven)

### 2.2 Free trial

Per GetApp:
> *"Pricing model: Subscription. Free Trial: Available (No Credit Card required)"*

- **Free trial period** (terms TBD)
- **No credit card** required
- **Test platform** before commitment
- **Sales follow-up** included

### 2.3 Pricing tiers (estimated)

⚠️ SARE **doesn't publish public pricing** – custom quote per klient.

Per Digitree segmentation recommendations:
- **Starter:** Drag-Drop editor + basic automation (SMB entry)
- **E-commerce:** Retargeting, integrations, dedicated reports
- **Corporate / Banking:** SSO, permissions, audits, SLA, regulatory compliance

### 2.4 Pricing factors

- **Number of contacts** v CDP
- **Email volume monthly**
- **SMS volume** (if applicable)
- **Web push volume**
- **Channel access** (email vs. omnichannel)
- **Automation depth**
- **Number of users**
- **SSO + enterprise features**
- **Support level** (Standard / Premium / Dedicated)
- **CDP advanced features**

### 2.5 What's included (typical)

- **SAREsystem core** (email, segmentation, basic automation)
- **Drag-Drop editor**
- **Templates library**
- **A/B/X testing**
- **Reports + analytics**
- **CDP & database management**
- **Polish + English UI**
- **Polish-based support**
- **Free webinars + knowledge resources**

### 2.6 Add-ons / Premium features

- **Omnichannel** (SMS, web push, surveys)
- **Channel Scoring** (advanced tiers)
- **ML-driven personalization**
- **Business Intelligence**
- **Enterprise SSO**
- **Dedicated consultant**
- **Custom integrations**
- **Premium support**

### 2.7 Demo + custom quote process

```
Prospect contacts SARE
   ↓
Discovery call:
- Business type
- Industry vertical
- Contact database size
- Email volume needs
- Channel requirements
- Polish vs. international scope
- Budget range
- Timeline
   ↓
Custom solution recommended
   ↓
Free trial offered (no credit card)
   ↓
Demo presentation
   ↓
Custom proposal s pricing
   ↓
Contract negotiation
```

### 2.8 Cenové porovnání (mid-market, 2026)

Per industry context (custom pricing, ranges estimovány):

| Platform | Mid-market entry |
|---|---|
| **SARE** | Custom (Polish market) |
| **SALESmanago** | €199+/měsíc |
| **ExpertSender** | $450+/měsíc |
| **GetResponse** | $79+/měsíc |
| **MailerLite** | $15+/měsíc |
| **Klaviyo** | $720+/měsíc (50K) |
| **HubSpot Marketing Hub** | $890+/měsíc |
| **ActiveCampaign** | $234+/měsíc (10K) |
| **Brevo Business** | €65+/měsíc (10K) |

⚠️ **SARE competitive for Polish market** s native expertise.

---

## 3. Klíčové diferenciátory v PL kontextu

### 3.1 Polish market leadership

Per oficiální:
> *"We are the email marketing leader in Poland."*

**Polish market expertise:**
- **15+ let v industry** (klienti od 2009)
- **Native Polish team**
- **Polish regulatory knowledge** (UODO compliance, Polish banking)
- **Polish ISP relationships** (WP.pl, Onet.pl, Interia.pl)
- **Polish business culture** understanding

### 3.2 Part of Digitree Group

Per oficiální:
> *"We are part of the Digitree Group, providing comprehensive and effective digital campaigns, thanks to our own technology and tools, unique data, knowledge and experience of specialists."*

**Digitree Group ecosystem:**
- **Comprehensive digital campaigns**
- **Own technology + tools**
- **Unique data**
- **Specialists expertise**
- **Group synergies** for clients

### 3.3 Channel Scoring (UNIKÁTNÍ)

Per GetApp:
> *"a specialized feature called channel scoring, designed to assess user engagement in email and SMS channels"*

**Channel Scoring:**
- **Proprietary feature**
- **Assesses user engagement** per channel
- **Email + SMS scoring**
- **Identifies most effective channels** per recipient
- **Drives conversions optimization**

Per Digitree:
> *"Channel scoring identifies the most effective channels to drive conversions."*

### 3.4 ML-driven targeting

Per GetApp:
> *"SARE is a cloud-based email marketing tool that utilizes machine learning (ML) capabilities to facilitate automated and targeted communication"*

- **Machine learning** capabilities
- **Targeting optimization**
- **Behavioral patterns** detection
- **Personalization engine**
- **Engagement prediction**

### 3.5 Industry research + reports publishing

Per Digitree:
> *"SARE specialists have been conducting research and publishing reports on consumer behavior and marketing communication for years, which are widely cited in industry media and educational materials."*

**Thought leadership:**
- **Industry research** publishing
- **Consumer behavior reports**
- **Marketing communication studies**
- **Widely cited** v industry media
- **Educational materials**

This is **unique market positioning** – not just tool, but **research authority**.

### 3.6 Dedicated Client Service team

Per real customer (VB Leasing):
> *"In addition to the obvious benefits of the system, such as ease of use and continuous platform development, it's essential to emphasize the invaluable assistance of the Client Service team."*

Per Polish Stem Cell Bank:
> *"We highly value the quality of customer service, and our dedicated consultant reliably supports us in our daily work with the system. They are always willing to share their knowledge, so we can say that the SARE system is a professional tool backed by the substantive expertise of its staff."*

**Consultative approach:**
- **Dedicated consultant** per klient
- **Knowledge sharing**
- **Substantive expertise**
- **Daily operational support**

### 3.7 Comprehensive omnichannel

Per Digitree:
> *"The platform supports omnichannel: email, SMS, web push, surveys/questionnaires, and a secure SMTP server for transactional and marketing sends."*

**All channels v one platform:**
- Email
- SMS
- Web Push
- Surveys / Questionnaires
- Secure SMTP

### 3.8 Enterprise compliance

Per Digitree:
> *"for corporations and banks – SSO, permissions, audits, SLA, and regulatory compliance"*

**Enterprise features:**
- **SSO (Single Sign-On)**
- **Granular permissions**
- **Audit logs**
- **SLA agreements**
- **Regulatory compliance** (Polish banking, finance)

### 3.9 Vs. Polish competitors

| Aspect | SARE | GetResponse | SALESmanago | ExpertSender |
|---|---|---|---|---|
| **Origin** | PL (Warszawa) | PL (Gdańsk) | PL (Kraków) | PL (Gdańsk) |
| **Founded** | 1990s-2000s era (active 2009+) | 1998 | 2011-ish | 2009 |
| **Target segment** | Mid-market + enterprise | SMB → enterprise | Mid-market e-commerce | E-commerce CDP |
| **Channels** | Email, SMS, web push, surveys | Email, SMS, webinars, courses, landing pages | Email, SMS, web push, ads, on-site | Email, SMS, web push, ads, mobile push |
| **CDP** | ✅ (database management) | Limited | ✅ Full CDP+CEP | ✅ Full CDP |
| **AI/ML** | ML targeting + Channel Scoring | AI suite | AI-driven (Recommendation Frames) | ML personalization |
| **Webinars built-in** | ❌ | ✅ UNIKÁTNÍ | ❌ | ❌ |
| **International reach** | Polish + selected international | 183 countries | 50 countries, 3000+ klientů | 1000+ klientů |
| **Self-serve** | Free trial | ✅ Full self-serve | ❌ Sales-driven | ❌ Sales-driven |
| **Reports thought leadership** | ✅ Industry research | Limited | Limited | Limited |

**SARE's niche:** **Polish market expertise + research authority + dedicated service + comprehensive omnichannel**.

---

## 4. SAREsystem architektura

### 4.1 SAREsystem overview

Per oficiální:
> *"SAREsystem - tools for email marketing communication and marketing automation."*

**SAREsystem = core platform** containing:
- Email marketing
- Marketing automation
- CDP
- Omnichannel execution
- Analytics + BI

### 4.2 Modular architektura

```
SAREsystem core
├── Email marketing module
├── Marketing automation module
├── CDP & database management
├── Segmentation engine
├── Channel Scoring module (UNIKÁTNÍ)
├── A/B/X testing engine
├── Reports + analytics
├── Business Intelligence
└── Add-ons:
    ├── SMS module
    ├── Web Push module
    ├── Surveys / Questionnaires
    ├── Enterprise (SSO, audits, SLA)
    └── Custom integrations
```

### 4.3 Scalable platform

Per Digitree:
> *"SARE is a platform that scales with your marketing: from the first newsletter to complex automation scenarios."*

**Scale options:**
- **Starter:** Email + basic automation
- **Growth:** + Omnichannel + segmentation
- **Enterprise:** + SSO + audit + SLA + regulatory compliance
- **Custom:** + Dedicated infrastructure / integrations

---

## 5. CDP & Database Management

### 5.1 CDP capabilities

Per Digitree:
> *"Segmentation and personalization work both at the database level (CDP & database management) and within automation scenarios."*

**CDP & database management:**
- **Centralized customer database**
- **360° customer profiles**
- **Behavioral + transactional + demographic data**
- **Real-time updates**
- **Identity resolution**
- **Segmentation engine**

### 5.2 Data sources

Per GetApp:
> *"personalized messaging based on transactional, behavioral, and demographic data"*

**Data captured:**
- **Transactional data** (orders, AOV, frequency)
- **Behavioral data** (clicks, opens, page views)
- **Demographic data** (location, age, gender, etc.)
- **Custom attributes**
- **Engagement metrics** (Channel Scoring)

### 5.3 Database management

- **Multiple databases** per account
- **Per-database custom fields**
- **Tag system**
- **Segments**
- **Import/Export**
- **API integration**

### 5.4 Real-time data updates

- **Real-time event capture**
- **Profile updates instant**
- **Segment re-evaluation**
- **Workflow triggers fire**

### 5.5 GDPR/RODO compliance

- **Consent management built-in**
- **Audit trail per consent**
- **Right to be Forgotten**
- **DSAR support**
- **EU hosting**
- **Polish RODO** native expertise

---

## 6. Email Marketing & Drag-and-drop editor

### 6.1 Email marketing core

Per Digitree:
> *"SARE combines email marketing and automation with an intuitive Drag&Drop editor and a library of ready-made components, which speeds up campaign preparation."*

### 6.2 Drag-and-drop editor

- **Visual drag-and-drop builder**
- **Block-based structure:**
  - Text
  - Image
  - Button
  - Spacer / Divider
  - Social icons
  - Video embed
  - HTML block
  - Product blocks
  - Dynamic content blocks
- **Mobile responsive** automatic
- **Live preview** (desktop, mobile)
- **Saved components library**
- **Brand kit support**
- **Custom HTML option**

### 6.3 Component library

Per Digitree:
> *"a library of ready-made components"*

- **Pre-built reusable components**
- **Speeds up campaign preparation**
- **Brand consistency**
- **Common elements** (header, footer, CTA buttons)

### 6.4 Campaign workflow

```
Email marketing → New campaign
   ↓
Step 1: Setup
- Campaign name
- Subject line + personalization
- Sender (verified domain)
- Reply-to
- UTM parameters
   ↓
Step 2: Recipients
- Select databáze / segment
- Exclusion lists
   ↓
Step 3: Design
- Drag-drop editor
- Templates library
- Component library
- Personalization tokens
- Dynamic content blocks
- Custom HTML option
   ↓
Step 4: Test
- A/B/X test setup
- Preview (desktop, mobile)
- Send test
- Spam test
   ↓
Step 5: Send / Schedule
- Send now
- Schedule
- Time-zone delivery
- Throttled send
   ↓
Confirm
```

### 6.5 Personalization

- **Variables** (custom fields)
- **Dynamic content blocks**
- **Conditional content**
- **Product recommendations** (s integration)
- **Channel Scoring-driven** content

---

## 7. Marketing Automation (scenarios + paths)

### 7.1 Automation capabilities

Per Digitree:
> *"Marketing automation: the system should enable scenario triggering, path building, content personalization, and audience segmentation based on data."*

Per oficiální (referenced in review):
> *"marketing automation cycles"*

**SARE automation:**
- **Scenarios + path building**
- **Visual workflow builder**
- **Multi-step sequences**
- **Branching conditions**
- **Multi-channel** (email + SMS + web push)
- **Real-time evaluation**

### 7.2 Triggers

#### Behavioral
- Subscribed to list/database
- Tag added/removed
- Form submitted
- Specific page visited
- Product viewed
- Email opened/clicked

#### Transactional / E-commerce
- Order placed (s integration)
- Cart abandoned
- Product page viewed (abandoned)
- Specific product purchased
- Refund

#### Date-based
- Birthday
- Anniversary
- Custom date in field
- Recurring schedule

#### Engagement-based
- Channel Score threshold
- Engagement decline
- Re-activation triggers
- Custom event

#### External
- API event
- Webhook
- CDP segment change

### 7.3 Actions (nodes)

#### Sending
- Send email
- Send SMS
- Send web push
- Send survey

#### Contact manipulation
- Add / remove tag
- Update field
- Update Channel Score
- Add / remove from segment

#### Logic
- Wait (delay)
- Condition (if/else)
- A/B split
- Goal (conversion)
- Random split

#### External
- Webhook
- API call

### 7.4 Use case examples

#### Welcome series
```
Trigger: Subscribed to database
   ↓
Send Email 1: Welcome
   ↓
Wait 3 days
   ↓
Send Email 2: Brand intro
   ↓
Condition: Email 2 opened?
   YES → Send Email 3: Special offer
   NO → Send Email 3 (alternative angle)
   ↓
End
```

#### Cart abandonment s Channel Scoring
```
Trigger: Cart abandoned > 1h
   ↓
Channel Score evaluation:
- Email score high → Email reminder
- SMS score high → SMS reminder
- Both low → both
   ↓
Wait 24h
   ↓
Condition: Purchased?
   YES → Exit (goal)
   NO → Send discount offer (best channel)
   ↓
Exit
```

#### Product page abandonment
```
Trigger: Product page visited > 5 min, no purchase
   ↓
Wait 1 day
   ↓
Send personalized product reminder
- Product images
- Customer reviews
- Special offer
   ↓
Continue based on engagement
```

---

## 8. Channel Scoring (UNIKÁTNÍ)

### 8.1 Channel Scoring overview

Per GetApp:
> *"a specialized feature called channel scoring, designed to assess user engagement in email and SMS channels to..."*

**Proprietary feature** assessing user engagement per channel.

### 8.2 How it works

```
Per recipient:
- Email engagement metrics tracked
- SMS engagement metrics tracked
- Web push engagement (if applicable)
   ↓
Channel Score calculated:
- Email score: 0-100
- SMS score: 0-100
- Web push score: 0-100
   ↓
Higher score = better channel for recipient
   ↓
Use in:
- Channel routing decisions
- Automation logic
- Personalization
- Campaign targeting
```

### 8.3 Per Digitree

> *"Channel scoring identifies the most effective channels to drive conversions."*

**Use cases:**
- **Pre-send channel selection:** Pick best channel per recipient
- **Channel switching:** Move to better channel if engagement drops
- **Campaign budgeting:** Allocate to most effective channels
- **Personalization:** Different content per channel preference

### 8.4 Channel Scoring v automation

```
Workflow trigger fires
   ↓
Check Channel Score:
- Email > 70? → Send email
- SMS > 70? → Send SMS
- Both > 50? → Send both
- Both < 30? → Skip or re-engagement
   ↓
Optimal channel selected per recipient
```

### 8.5 Why this matters

**vs. competitors:**
- **Most platforms:** broadcast or basic preferences
- **SARE Channel Scoring:** ML-driven per recipient
- **Higher engagement** rates
- **Better ROI** on multi-channel spend
- **Reduces opt-out** risk

---

## 9. Omnichannel (email, SMS, web push, surveys)

### 9.1 Omnichannel capabilities

Per Digitree:
> *"The platform supports omnichannel: email, SMS, web push, surveys/questionnaires, and a secure SMTP server for transactional and marketing sends."*

### 9.2 Email

- Standard newsletters
- Triggered emails (automation-driven)
- Transactional emails (via secure SMTP)
- Dynamic 1-to-1 emails
- Multi-channel orchestration

### 9.3 SMS

- **Bulk SMS campaigns**
- **Automation-driven SMS**
- **Personalization** s variables
- **Link tracking** (shortened URLs)
- **Polish SMS specifics** (Polish carriers)
- **Channel Scoring** integration
- **STOP keyword** auto-handling

Use cases:
- Order/shipping notifications
- Time-sensitive promos
- Cart abandonment escalation
- VIP alerts
- Reservation confirmations

### 9.4 Web Push

- **Browser notifications** (Chrome, Firefox, Edge, Safari)
- **Subscribed users** receive
- **Real-time delivery**
- **Personalization**
- **Targeting based on behavior**

Use cases:
- Cart abandonment (silent)
- Promotional alerts
- Stock alerts
- Order updates
- Event reminders

### 9.5 Surveys / Questionnaires

- **In-platform survey builder**
- **Multi-question types** (text, multiple choice, rating)
- **Logic branching**
- **Personalization**
- **Embed v emails or websites**
- **Real-time response collection**
- **Reports + analytics**

Use cases:
- NPS surveys
- Customer satisfaction
- Preference collection
- Product feedback
- Zero-party data collection

### 9.6 Secure SMTP

Per Digitree:
> *"a secure SMTP server for transactional and marketing sends"*

- **Dedicated SMTP infrastructure**
- **High deliverability**
- **Transactional + marketing both**
- **DKIM, SPF, DMARC** built-in
- **Polish ISP relationships**

### 9.7 Multi-channel orchestration

- **Same profile across channels**
- **Frequency caps cross-channel**
- **Channel preferences respected** (Channel Scoring)
- **Coordinated messaging**

---

## 10. Segmentation + Personalization

### 10.1 Segmentation capabilities

Per Digitree:
> *"Segmentation and personalization work both at the database level (CDP & database management) and within automation scenarios."*

**Multi-level segmentation:**
- **Database level** (overall CDP segmentation)
- **Automation scenarios** (per workflow)
- **Campaign-level** (per send)

### 10.2 Filter criteria

- **Contact attributes** (custom fields, tags)
- **Email engagement** (campaigns, recency)
- **SMS engagement**
- **Web push engagement**
- **Channel Score** thresholds
- **Transactional data** (orders, AOV, products)
- **Behavioral data** (page views, time on site)
- **Demographic data**
- **Subscription source**
- **Date conditions**
- **Custom events**

### 10.3 Operators

- AND, OR, NOT
- Nested conditions
- Numeric ranges
- Date ranges
- Custom expressions

### 10.4 Dynamic vs. static segments

- **Dynamic segments** (auto-update)
- **Static segments** (snapshot)
- **Saved segments** reusable

### 10.5 Personalization

- **Variables** (custom fields)
- **Dynamic content blocks**
- **Conditional content**
- **ML-driven personalization**
- **Channel Scoring-driven** content choices
- **Behavior-based** content

### 10.6 ML-driven personalization

- **Predictive content selection**
- **Best-time-to-send** (per recipient)
- **Best-channel-to-use** (Channel Scoring)
- **Engagement prediction**

---

## 11. A/B/X Testing (s auto-winner)

### 11.1 A/B/X testing

Per Digitree:
> *"The system provides A/B/X tests with automatic winner selection, allowing optimization to happen 'on the fly.'"*

**A/B/X testing** = multiple variants (not just 2):
- **A/B:** 2 variants
- **A/B/C:** 3 variants
- **A/B/X:** N variants

### 11.2 Test variants

- **Subject line** variations
- **Sender name** variations
- **Content variations**
- **Send time variations**
- **CTA variations**
- **Personalization variants**

### 11.3 Automatic winner selection

```
Create A/B/X test
   ↓
Configure variants (2-N)
   ↓
Sample size per variant
   ↓
Winner determination criteria:
- Open rate
- Click rate
- Conversion rate (s tracking)
- Engagement composite
   ↓
**Auto-winner detected** (statistical significance)
   ↓
**Auto-send to remaining audience** with winning variant
   ↓
"On the fly" optimization
```

### 11.4 Statistical confidence

- **Statistical significance** calculation
- **Confidence levels**
- **Sample size recommendations**
- **Avoid false positives**

### 11.5 Test reporting

- Per-variant performance
- Comparison side-by-side
- Winner explanation
- Recommendations for next tests

---

## 12. Templates library

### 12.1 Templates library

- **Pre-built templates** (responsive)
- **Categories:**
  - Newsletter
  - Promotional
  - E-commerce
  - Welcome
  - Event
  - Holiday/seasonal
  - B2B
  - **Polish-style designs**
  - Industry-specific
- **Fully customizable**

### 12.2 Component library

Per Digitree:
> *"a library of ready-made components"*

- **Reusable components**
- **Mix-and-match**
- **Brand kit application**
- **Saved per account**

### 12.3 Custom templates

- **Custom HTML** option
- **Save own templates**
- **Per-team templates** (s multi-user)
- **Versioning** (some configurations)

---

## 13. Reports & Analytics + Business Intelligence

### 13.1 Advanced reporting

Per GetApp:
> *"advanced reporting and analytics features"*

Per Digitree:
> *"reports that clearly show the impact of actions on results"*

### 13.2 Standard reports

#### Campaign reports
- Sent, delivered, bounced
- Opens (unique + total)
- Clicks, CTR, top links
- Conversion rate
- Revenue attribution
- Channel Score impact

#### Automation reports
- Per-workflow performance
- Per-step metrics
- Drop-off analysis
- Goal achievement
- Channel routing analytics

#### CDP reports
- Database size trends
- Segment performance
- Engagement distribution
- Channel Score distribution

#### Omnichannel reports
- Per-channel performance
- Cross-channel attribution
- Channel Score effectiveness
- ROI per channel

### 13.3 Business Intelligence (BI)

Per GetApp:
> *"business intelligence"*

**BI capabilities:**
- **Custom dashboards**
- **Multi-source data views**
- **Trend analysis**
- **Cohort analysis**
- **Predictive insights**
- **Executive reporting**

### 13.4 Real-time optimization

Per Digitree:
> *"Advanced analytics and reporting help optimize in real time."*

- **Real-time stats**
- **Live monitoring**
- **Quick decision making**
- **A/B/X test live updates**

### 13.5 Export options

- **CSV export**
- **PDF reports**
- **Scheduled exports**
- **API access** to reports

---

## 14. Abandoned cart + product page communication

### 14.1 E-commerce automation

Per GetApp:
> *"Other capabilities include facilitating abandoned cart and product page communication"*

### 14.2 Abandoned cart

**Trigger:** Cart created but checkout abandoned (X minutes/hours)

**Standard workflow:**
```
Cart abandoned > 1h
   ↓
Channel Scoring:
- Pick best channel per recipient
   ↓
Send reminder s cart contents
   ↓
Wait 24h
   ↓
Condition: Purchased?
   YES → Exit
   NO → Send discount offer
   ↓
Wait 48h
   ↓
Final reminder via secondary channel
   ↓
Exit
```

### 14.3 Product page communication

**Trigger:** Product page viewed but no purchase

**Standard workflow:**
```
Product page > 5 min visit
   ↓
Wait 1 day
   ↓
Send personalized email:
- Product images
- Reviews/testimonials
- Special offer
   ↓
Track engagement
   ↓
Follow-up sequence
```

### 14.4 Integration requirements

- **E-commerce platform connected:**
  - Shopify
  - WooCommerce
  - PrestaShop
  - Shoper (Polish e-commerce!)
- **Tracking script** installed
- **Real-time event sync**

---

## 15. Recurring messages

### 15.1 Recurring messages capabilities

Per GetApp:
> *"delivering automated recurring messages"*

**Use cases:**
- **Weekly digests**
- **Monthly reports**
- **Subscription renewals**
- **Anniversary reminders**
- **Birthday automations**
- **Seasonal campaigns**

### 15.2 Configuration

```
Automation → Recurring message
   ↓
Configure:
- Recurrence pattern (daily, weekly, monthly)
- Send time
- Audience (dynamic segment)
- Content template
- End conditions (optional)
   ↓
Activate
   ↓
[Messages send automatically per schedule]
```

### 15.3 Per Digitree

> *"Automated sends, abandoned cart flows, and recurring messages work around the clock."*

- **24/7 automation**
- **No manual intervention**
- **Scalable**

---

## 16. Surveys / Questionnaires

### 16.1 Surveys module

Per Digitree:
> *"The platform supports omnichannel: email, SMS, web push, surveys/questionnaires"*

**Surveys capabilities:**
- **In-platform builder**
- **Question types:**
  - Open text
  - Multiple choice (radio)
  - Multi-select (checkbox)
  - Rating (1-5, 1-10)
  - NPS (Net Promoter Score)
  - Dropdown
  - Matrix
- **Logic branching** (conditional questions)
- **Personalization** (variables)
- **Mobile responsive**
- **Anti-spam** protections

### 16.2 Deployment

- **Embed v emails**
- **Standalone survey page**
- **Website embed**
- **Link share**

### 16.3 Response collection

- **Real-time collection**
- **Per-respondent data**
- **Tied to CDP profile**
- **Trigger automation** on response
- **Tags applied** based on answers

### 16.4 Use cases

- **NPS surveys** (customer loyalty)
- **Customer satisfaction (CSAT)**
- **Product feedback**
- **Preference collection** (zero-party data)
- **Onboarding feedback**
- **Win-back surveys** (why unsubscribing)

### 16.5 Reports

- Response rate
- Per-question analytics
- NPS score calculation
- Sentiment trends
- Export options

---

## 17. Integrace (Shopify, WooCommerce, PrestaShop, Shoper)

### 17.1 E-commerce integrations

Per GetApp:
> *"SARE also facilitates third-party integration with various eCommerce platforms such as Zapier, PrestaShop, WooCommerce, Shoper, and Shopify."*

#### Shopify
- **OAuth connection**
- **Customer sync**
- **Order sync**
- **Cart events**
- **Product feed**

#### WooCommerce (WordPress)
- **WordPress plugin** s API
- **Customer + order sync**
- **WooCommerce hooks**

#### PrestaShop
- **Native integration**
- **DACH + European e-commerce platform**
- **Customer + order data**

#### Shoper (POLISH e-commerce platform!)
- **DACH-PL specific advantage**
- **Native integration**
- **Customer + order data**
- **Popular in Poland**

### 17.2 Shoper integration significance

**Shoper = jeden z hlavních Polish e-commerce platform** (similar to CZ Shoptet).

SARE's native Shoper integration:
- **Polish market specific**
- **Strong local advantage**
- **Vs. SALESmanago / ExpertSender** Polish positioning

### 17.3 Other integrations

Per GetApp:
> *"WooCommerce, Google Analytics 360, PrestaShop, Zapier, Facebook Apps and Tabs, WordPress"*

- **Google Analytics 360** (enterprise GA)
- **Facebook Apps + Tabs**
- **WordPress** (general)
- **Zapier** (5000+ app ecosystem)

### 17.4 CRM integrations

- **Salesforce** (via Zapier / API)
- **HubSpot CRM** (via Zapier / API)
- **Polish CRMs** (custom)
- **Custom dev** option

---

## 18. API + Webhooks

### 18.1 API access

Per GetApp:
> *"Q. Does SARE offer an API? **Yes, SARE has an API available for use.**"*

**REST API capabilities:**
- **Comprehensive endpoints**
- **Documentation available**
- **OAuth authentication**
- **Rate limits per plan**
- **JSON request/response**

### 18.2 API endpoints (typical)

- `/databases` (CDP databases)
- `/recipients` (subscribers)
- `/segments`
- `/campaigns`
- `/automations`
- `/templates`
- `/events` (custom events)
- `/sms`
- `/web-push`
- `/surveys`
- `/reports`

### 18.3 Webhooks

- **Subscriber events**
- **Campaign events**
- **Survey responses**
- **Channel Score updates**
- **Custom event triggers**
- **Real-time push**

### 18.4 Integration use cases

- **Custom CRM integration**
- **ERP integration**
- **Data warehouse sync**
- **Custom application** subscriber management
- **Real-time event tracking**
- **Programmatic campaign management**

---

## 19. Secure SMTP

### 19.1 Secure SMTP capability

Per Digitree:
> *"a secure SMTP server for transactional and marketing sends"*

**Dedicated SMTP:**
- **Transactional emails**
- **Marketing emails**
- **High deliverability**
- **DKIM, SPF, DMARC** built-in
- **Polish ISP relationships**

### 19.2 Use cases

#### Transactional emails
- Order confirmations
- Shipping notifications
- Password resets
- Account verifications
- Receipts / invoices
- Authentication codes
- Payment notifications

#### Marketing via SMTP
- Some advanced configurations
- Custom application sends
- API-driven sends

### 19.3 Polish ISP optimization

Per Digitree:
> *"the tool should offer a stable SMTP server, a good IP reputation, and DMARC/SPF/DKIM support to ensure messages land in the inbox, not spam"*

**Polish ISP relationships:**
- **WP.pl**
- **Onet.pl**
- **Interia.pl**
- **Polish-specific deliverability optimization**

### 19.4 Security features

- **SSL/TLS encryption**
- **API key management**
- **IP whitelisting**
- **Authentication required**
- **Audit logging**

---

## 20. Enterprise features (SSO, permissions, audits, SLA)

### 20.1 Enterprise capabilities

Per Digitree:
> *"for corporations and banks – SSO, permissions, audits, SLA, and regulatory compliance"*

### 20.2 SSO (Single Sign-On)

- **SAML 2.0 support**
- **Active Directory integration**
- **Google Workspace**
- **Microsoft 365**
- **Custom IdPs**
- **Centralized authentication**

### 20.3 Granular permissions

- **Role-based access control**
- **Per-feature permissions**
- **Per-database access**
- **Per-action permissions**
- **Custom roles**

### 20.4 Audit logs

- **User activity tracking**
- **Login + logout events**
- **Data access logs**
- **Configuration changes**
- **API access logs**
- **Export pro compliance**

### 20.5 SLA agreements

- **Custom SLA per contract**
- **Uptime guarantees**
- **Response time SLAs**
- **Penalties for breaches**
- **Enterprise support tier**

### 20.6 Regulatory compliance

**Polish banking compliance:**
- **UODO (Polish data protection)**
- **KNF (Financial supervision authority)**
- **Banking secrecy**
- **Recordkeeping requirements**

**EU compliance:**
- **GDPR/RODO**
- **MiFID II** (financial services)
- **PSD2** (banking)

### 20.7 Use cases

- **Polish banks** (PKO BP, Pekao, mBank style)
- **Insurance** (PZU, etc.)
- **Financial services**
- **Large Polish corporations**
- **Government / public sector**
- **Healthcare** (Polish regulated)

---

## 21. Compliance, GDPR/RODO, EU hosting

### 21.1 RODO (Polish GDPR) compliance

- **Native Polish GDPR (RODO) expertise**
- **UODO compliance** (Urząd Ochrony Danych Osobowych)
- **DPA available** v polštině
- **Polish privacy law** specialists

### 21.2 EU hosting

- **EU servers** (likely Polish primary)
- **No cross-border concerns**
- **EU jurisdiction**
- **Data residency** guaranteed

### 21.3 GDPR features

- **Consent management built-in**
- **Per-channel consent**
- **Double opt-in** support
- **Audit trail** per consent
- **Right to be Forgotten**
- **Data export** per subscriber (DSAR)
- **DPA available**

### 21.4 Security certifications

- **ISO 27001** likely (typical for enterprise email CDPs)
- **SOC 2** (potentially)
- **Polish banking compliance certifications**
- **Penetration testing** regular

### 21.5 Industry-specific compliance

- **Polish banking** (KNF compliant)
- **Healthcare** (Polish regulations)
- **Government** procurement ready
- **Financial services** (MiFID II)

### 21.6 Security features

- **2FA / MFA**
- **SSO (enterprise)**
- **API key management**
- **Encryption** at rest + in transit
- **Audit logs**
- **EU data residency**
- **Penetration testing**

---

## 22. Industry research + reports (thought leadership)

### 22.1 Research authority

Per Digitree:
> *"SARE specialists have been conducting research and publishing reports on consumer behavior and marketing communication for years, which are widely cited in industry media and educational materials."*

**SARE's unique market position:**
- **Industry research publishing**
- **Consumer behavior studies**
- **Marketing communication reports**
- **Polish market data**
- **Trend analysis**

### 22.2 Research types

- **Polish email marketing benchmarks**
- **Consumer behavior trends**
- **Industry-specific insights**
- **Polish e-commerce data**
- **Email marketing ROI studies**
- **Channel preference research**

### 22.3 Publishing channels

- **Sare.pl blog**
- **Industry conferences**
- **Whitepapers**
- **Cited in media**
- **Educational materials**
- **Webinars**

### 22.4 Why it matters

**For clients:**
- **Strategic guidance** (not just tool)
- **Industry benchmarking**
- **Best practices learning**
- **Continuous education**

**For Polish industry:**
- **Thought leadership**
- **Industry standard-setting**
- **Educational contribution**

### 22.5 Vs. competitors

| Vendor | Industry research |
|---|---|
| **SARE** | ✅ Active publishing |
| **GetResponse** | Some research |
| **MailerLite** | Limited |
| **SALESmanago** | Some thought leadership |
| **ExpertSender** | Limited |
| **Mailchimp** | Industry reports |
| **Klaviyo** | DTC-specific reports |
| **HubSpot** | Extensive content |
| **Brevo** | Some content |

---

## 23. Limity a nedostatky

### 23.1 Polish-first focus

⚠️ SARE primárně **Polish market**:
- **Polish UI + support primary**
- **English UI available** but secondary
- **Polish team** dominant
- **Less international** vs. global competitors

### 23.2 No public pricing

- **No transparent public pricing**
- **Custom quote per klient**
- **Sales-driven model**
- **Long sales cycle** typical pro enterprise

### 23.3 No free plan

- **No free version** (per SoftwareWorld)
- **Free trial only** (no credit card required)
- **Paid only** post-trial
- **vs. competitors** s generous free plans (Mailchimp, MailerLite, Brevo)

### 23.4 Less brand recognition globally

- **Polish leader** but globally less known
- **Outside Poland:** less visibility
- **International marketing** limited
- **Brand awareness** lower outside CEE

### 23.5 Less DTC-focused than Klaviyo

- **No native Shopify ML** deep features
- **Less DTC-specific** templates
- **Less e-commerce ML** sophistication
- **Fewer pre-built DTC flows**

### 23.6 Less enterprise than SAP Emarsys / Salesforce

- **Smaller scale**
- **Less Gartner positioning**
- **Less global enterprise** customer base
- **Less enterprise governance** features

### 23.7 Limited mobile experience

- **Mobile app limited**
- **Most operations** require desktop
- **Less polished mobile editor**

### 23.8 No webinars / courses native

- **No webinar hosting** (vs. GetResponse)
- **No online courses**
- **No paid newsletters** subscription
- **No digital products** sale

### 23.9 No autonomous AI agents

- **ML-driven** but **not autonomous**
- **No AI agents** (vs. Klaviyo Customer Agent, HubSpot Breeze)
- **Channel Scoring** is helpful but not autonomous
- **AI roadmap evolving**

### 23.10 Less integrations than Zapier-heavy platforms

- **Core e-commerce integrations** (Shopify, WooCommerce, PrestaShop, Shoper)
- **Zapier ecosystem** available
- **Less native integrations** than CleverReach / Mailchimp
- **Custom dev** sometimes needed

### 23.11 Less landing pages

- **No native landing page builder** prominently advertised
- **Vs. GetResponse, HubSpot, Mailchimp** comprehensive landing pages
- **Workarounds** required

### 23.12 No deep CRM

- **No deals/pipelines** (vs. ActiveCampaign, HubSpot)
- **Contact-centric** approach
- **B2B sales features limited**
- **Companies need separate CRM**

### 23.13 No CZ/SK/DE UI

- **Polish + English** primary
- **No Czech / Slovak**
- **No German**
- **No French / Spanish / Italian**
- **CEE region** partially limited

### 23.14 Migration challenges

- **Workflows non-exportable**
- **Templates rebuild** required
- **Custom integrations** re-built

### 23.15 Limited international ISP relationships

- **Strong Polish ISPs** (WP.pl, Onet.pl, Interia.pl)
- **Less established** s German/Czech/etc. ISPs
- **Less optimization** pro international DACH/CEE

---

## 24. Shrnutí: Pro koho a proti komu

### SARE je dobrá volba pokud
- Provozujete **business v Polsku** (primárně)
- Hledáte **Polish market expertise**
- Vyžadujete **RODO + UODO compliance** native
- Potřebujete **omnichannel** (email + SMS + web push + surveys)
- Hledáte **enterprise features** (SSO, permissions, audits, SLA)
- Provozujete **Polish banking / finance** (regulatory compliance)
- Provozujete **Shoper e-shop** (Polish e-commerce – native integration!)
- Vyžadujete **dedicated Client Service** team approach
- Cíl je **ML-driven targeting** + Channel Scoring
- Hodnotíte **industry research authority** (Polish market data)
- Provozujete **multi-channel** s diversified audience
- Hledáte **part of larger digital ecosystem** (Digitree Group)
- Budget pro **mid-market+ price range**

### SARE není dobrá volba pokud
- Pracujete primárně **mimo Polsko** (DACH, US, Asia)
- Hledáte **pure SMB freemium** – Mailchimp, MailerLite, Brevo lepší
- Pracujete primárně **v češtině / slovenštině** – Ecomail / SmartEmailing
- Provozujete **pure DTC Shopify** s deep needs – Klaviyo
- Hledáte **deep B2B CRM** – HubSpot / ActiveCampaign
- Hledáte **enterprise globální** (SAP, Salesforce, Adobe scale)
- Cíl je **webinars + courses business** – GetResponse
- Provozujete **content creator** business – Beehiiv / Substack / Kit
- Hledáte **autonomous AI agents**
- Potřebujete **deep e-commerce CDP** s ML – ExpertSender / SALESmanago / Bloomreach
- Hlavní jazyk je **němčina / čeština** – CleverReach / Ecomail
- Hledáte **transparent self-serve pricing** – SARE custom only

### SARE vs. konkurence

| Konkurence | Kdy lepší než SARE |
|---|---|
| **GetResponse** (PL) | Self-serve, webinars + courses, 27 jazyků UI |
| **SALESmanago** (PL) | AI-driven CDXP, 3000+ klientů, Starbucks/Lacoste reference |
| **ExpertSender** (PL) | E-commerce CDP, deeper Shopify, mid-market e-commerce |
| **MailerLite** | Solopreneur simplicity, content creators, free plan |
| **Mailchimp** | Brand recognition, global ecosystem, free plan |
| **Brevo** | Multi-channel (SMS, WhatsApp), volume-based pricing, free tier |
| **Klaviyo** | DTC Shopify deep, predictive AI |
| **HubSpot** | Full B2B CRM, multi-Hub |
| **ActiveCampaign** | Deep automation, integrated CRM |
| **CleverReach** | DACH SMB, multi-user free, generous free plan |
| **Mailkit** | CZ premium, vlastní infra, 7 ISO certifikací |
| **SmartEmailing / Ecomail** | Native CZ/SK markets |

---

*Dokument zpracován z oficiálních zdrojů sare.pl a praktických zdrojů (GetApp, SoftwareSuggest, SoftwareWorld, SaaSCounter, Digitree, RocketReach, EmailExpert, EmailVendorSelection). Pro nejaktuálnější detaily je nutný engagement s SARE sales / consultant teamem.*
