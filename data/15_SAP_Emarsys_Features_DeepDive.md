# SAP Emarsys (SAP Engagement Cloud) – hloubková analýza funkcí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Zdroje:** oficiální dokumentace emarsys.com, sap.com/products/crm, help.emarsys.com, help.sap.com + analytické weby a recenze (Gartner, G2, Spadoom, Publicare, Sybit, FIS, learning.sap.com) ověřené v dubnu–květnu 2026.
**Rozsah:** kompletní funkcionalita platformy v roce 2026 – Engagement Cloud (Emarsys Edition), omnichannel marketing automation, AI personalization, Tactics, Smart Insight, Predict, Loyalty, Mobile Engage, Web Channel + integrace s SAP ekosystémem.

> **Důležitý kontext – rebrand 2025:** SAP **změnil název** "SAP Emarsys" na **"SAP Engagement Cloud"** v pozdním 2025. Současný stav (2026):
> - **SAP Engagement Cloud** = nová zastřešující značka (broader category)
> - **Emarsys Edition** = legacy Emarsys platform (standalone, can be used without other SAP products)
> - **Enterprise Edition** = nová edition s deep integrací do SAP ekosystému (S/4HANA, Sales Cloud, CDP, CDC)
>
> **Mnoho lidí stále říká "Emarsys"** – v dokumentu budeme používat oba termíny zaměnitelně.

> **Kontext historie:** Emarsys založen 2000 ve **Vídni (Rakousko)** – evropský origin. **2020 koupený SAP** za ~$500M. Postupná integrace do SAP CX (Customer Experience) suite. V 2025 finalizace integrace jako "Engagement Cloud".
>
> **Pozice na trhu:** **Leader v Gartner Magic Quadrant for Personalization Engines** – **7 let v řadě** (2020-2026). Mezi top 5 enterprise platformami pro B2C personalizaci. **Particularly strong v DACH retail** – odhadem ~20 % německého e-commerce trhu.
>
> **Filozofie:** **"Built for marketers, not developers"** – pre-built strategies (Tactics), visual builders, minimum coding required. Velmi silný v **retail vertical** s **60+ pre-built Tactics** out-of-the-box.

---

## Obsah

1. [Co je SAP Engagement Cloud / Emarsys](#1-co-je-emarsys)
2. [Rebrand 2025: Engagement Cloud editions](#2-rebrand)
3. [Tarify a pricing model](#3-tarify)
4. [Retail-first & B2C positioning](#4-retail-first)
5. [Single Customer Profile & data layer](#5-data-layer)
6. [Smart Insight (RFM + Lifecycle)](#6-smart-insight)
7. [Predict (AI product recommendations)](#7-predict)
8. [Tactics (pre-built strategies)](#8-tactics)
9. [Automation Center & Interactions](#9-automation)
10. [Email channel & VCE editor](#10-email)
11. [Mobile Engage (push + in-app)](#11-mobile-engage)
12. [Web Channel](#12-web-channel)
13. [SMS channel](#13-sms)
14. [Loyalty Engine](#14-loyalty)
15. [Digital Ads & Direct Mail](#15-digital-ads)
16. [Generative AI & Joule integration](#16-ai)
17. [API, integrace, SAP ekosystém](#17-api-integrace)
18. [Dedicated CSM model & implementation](#18-csm-model)
19. [Compliance, GDPR, EU hosting](#19-compliance)
20. [Limity a nedostatky](#20-limity)

---

## 1. Co je Emarsys

- **Společnost:** Emarsys eMarketing Systems GmbH (Vídeň) → SAP SE (Walldorf, Německo)
- **HQ:** **Vídeň, Rakousko** (původní Emarsys office, stále R&D hub) + SAP HQ Walldorf
- **Akvizice SAPem:** **2020** za ~$500M
- **Vznik (Emarsys):** **2000** ve Vídni
- **Velikost (2026):** 1 500+ značek používá platformu, **billions of messages denně**
- **Pozice:** **Enterprise omnichannel customer engagement platform** pro retail/e-commerce/B2C
- **Gartner status:** Leader v Magic Quadrant for Personalization Engines **7 let v řadě** (2020–2026)
- **Specializace:** **Retail, e-commerce, B2C** (telco, finance, travel & hospitality secondary)
- **Lokalizace UI:** **angličtina, němčina, francouzština, italština, španělština, portugalština** + další enterprise jazyky. **Čeština ani slovenština nejsou** v UI.

### Filozofie produktu

**"Built for marketers, not for developers"** – ne tak technicky jako Salesforce Marketing Cloud nebo Adobe Journey Optimizer. Důraz na **out-of-the-box use cases** s **60+ pre-built Tactics** pro retail.

Klíčové diferenciátory vs. konkurence:
- **Tactics library** – ready-to-deploy campaign blueprints
- **Smart Insight** – built-in RFM + lifecycle segmentation
- **Predict** – proprietary product recommendation engine
- **Dedicated Customer Success Manager** per klient
- **Industry-specific playbooks** pro retail, fashion, beauty, sport, travel
- **Deep SAP ecosystem integration** (post-acquisition advantage)

```
┌─────────────────────────────────────────────────────────────────┐
│              SAP ENGAGEMENT CLOUD (Emarsys Edition)             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Email          │  │ SMS / RCS    │  │ Mobile Engage   │      │
│  │ Campaigns      │  │              │  │ (push + in-app) │      │
│  │ + VCE Editor   │  │              │  │ + mobile wallet │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Web Channel    │  │ Digital Ads  │  │ Direct Mail     │      │
│  │ (on-site       │  │ (audience    │  │ (postal +       │      │
│  │  personalize)  │  │  sync)       │  │  catalogs)      │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐                           │
│  │ Conversational │  │ In-store     │                           │
│  │ (chat/social   │  │ engagement   │                           │
│  │  messaging)    │  │ (POS)        │                           │
│  └────────────────┘  └──────────────┘                           │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│   AUTOMATION & PERSONALIZATION                                  │
│   ├─ Tactics (60+ pre-built strategies)                         │
│   ├─ Automation Center (visual workflow builder)                │
│   ├─ Interactions (event-based programs)                        │
│   └─ Personalization Engine                                     │
├─────────────────────────────────────────────────────────────────┤
│   INTELLIGENCE LAYER                                            │
│   ├─ Smart Insight (RFM + Lifecycle segmentation)               │
│   ├─ Predict (AI product recommendations)                       │
│   ├─ Strategic Dashboard                                        │
│   ├─ Joule AI (SAP-wide gen AI integration)                     │
│   └─ Predictive analytics (CLV, churn, NPD, STO)                │
├─────────────────────────────────────────────────────────────────┤
│   DATA LAYER (Single Customer Profile)                          │
│   ├─ Web Extend (behavioral tracking)                           │
│   ├─ Relational data model                                      │
│   ├─ Open Data Access (API + queryable)                         │
│   └─ Standard Product Catalog                                   │
├─────────────────────────────────────────────────────────────────┤
│   SAP ECOSYSTEM INTEGRATION                                     │
│   ├─ SAP Commerce Cloud (plug-and-play)                         │
│   ├─ SAP Sales Cloud V2 / Service Cloud V2                      │
│   ├─ SAP S/4HANA                                                │
│   ├─ SAP Customer Data Platform (CDP)                           │
│   ├─ SAP Customer Identity (CDC)                                │
│   └─ SAP Datasphere                                             │
├─────────────────────────────────────────────────────────────────┤
│   + Dedicated CSM per klient (continuity guarantee)             │
│   + Enterprise SLA + multi-region hosting                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Rebrand 2025: Engagement Cloud editions

### 2.1 Co se stalo

Pozdní 2025: SAP **rebranded "SAP Emarsys" na "SAP Engagement Cloud"** s **editions-based approach**.

### 2.2 Současné edition (2026)

#### Emarsys Edition
- **Pokračování legacy Emarsys produktu** – stejná platforma, stejné capabilities
- **Standalone use** – lze používat **bez ostatních SAP produktů**
- Pricing: contact-based + channel add-ons
- **Typicky $1 500 – $5 000+/měsíc** podle database size + channels
- Pro existing Emarsys customers: **bez disruption** – stejný CSM, stejný support, stejné features
- **Cílový klient:** mid-market retail/e-commerce bez SAP infrastruktury

#### Enterprise Edition
- **Nová edition** s deep integrací do SAP ekosystému
- Built pro firmy už používající **SAP S/4HANA, Sales Cloud V2, Service Cloud V2, Commerce Cloud**
- **Vyšší pricing** (often $5K-$20K+/měsíc)
- Plug-and-play integrace s SAP CDP, CDC, Datasphere
- B2B + B2C unified marketing
- **Cílový klient:** enterprise s existing SAP investment

### 2.3 Důsledky pro existing customers

Per oficiální SAP:
- **"Continuity is paramount"**
- Customers continue using their existing solution
- **Same CSM** continues
- **Same support team**
- Ongoing innovations apply across editions
- **No forced migration**

### 2.4 Co je nového v 2026

#### Q1 2026 Release announcements:

- **Universal Schema Builder** – simplified data modelling across systems
- **AI-Assisted Content Creation** – generate compelling content for all campaign messages
- **Asset Tagging tool** v Segmentation – organize audiences faster
- **Standard Product Catalog API** v Open Data – queryable product data
- **SAP Engagement Cloud SDK** – unifying iOS/Android/Web pro Mobile Push, Web Push, In-app
- **Emarsys SDK Expo Plugin pilot** – pro React Native developers
- **Joule AI integration** deepening – SAP-wide gen AI

### 2.5 Naming v dokumentu

V tomto dokumentu používáme:
- **"Emarsys"** = legacy platforma (still official Emarsys Edition)
- **"SAP Engagement Cloud"** = nová zastřešující značka
- **"Enterprise Edition"** = pokud zmiňujeme nový enterprise tier specifically
- **"Engagement Cloud"** = lze používat zaměnitelně

---

## 3. Tarify a pricing model

### 3.1 Pricing přístup

Emarsys **nepoužívá self-serve pricing** ani public price list. Stejně jako ExpertSender:

- **Custom pricing per klient** – sales-driven
- **Demo + consultation** required
- **Volume-based scaling**
- **Annual contracts** typically (often 2-3 leté)
- **Onboarding included** ale s implementation fee

### 3.2 Typical pricing ranges (2026)

Per Spadoom 2026 pricing guide (industry analysis):

#### Emarsys Edition
- **Entry level:** $1 500 – $3 000/měsíc (small retailers, <100K contacts)
- **Mid-market:** $3 000 – $5 000+/měsíc (100K–500K contacts)
- **Large mid-market:** $5 000 – $10 000/měsíc (500K–1M contacts)
- **Enterprise:** $10 000+ /měsíc (1M+ contacts)

#### Enterprise Edition (s SAP integrace)
- Začíná typicky $5 000+/měsíc
- Často $20 000+ /měsíc pro full SAP deployment
- Multi-year contracts s flexible add-ons

### 3.3 Pricing struktura

| Komponent | Co ovlivňuje cenu |
|---|---|
| **Base platform fee** | Fixed core fee |
| **Active contacts** | Per-tier (typically 50K, 100K, 250K, 500K, 1M+) |
| **Email volume** | Some plans include unlimited, others metered |
| **SMS volume** | Per-message (credits) |
| **Mobile push volume** | Per-message or tier |
| **Web push** | Often included |
| **Channels enabled** | Email only / + SMS / + Push / Full omnichannel |
| **Predict module** | Add-on (often included) |
| **Smart Insight** | Add-on (often included) |
| **Loyalty Cloud** | Add-on |
| **Digital Ads connector** | Add-on |
| **Direct Mail integration** | Add-on |
| **Tactics package level** | Different Tactics tiers |
| **CSM service level** | Standard / Premium / Strategic |
| **API rate limits** | Higher tiers |
| **Multi-account / multi-brand** | Add-on |

### 3.4 Implementation costs

Implementation (přes SAP partner nebo SAP Services):
- **Small/mid retail:** $30K – $80K one-time
- **Mid-market:** $80K – $200K
- **Enterprise:** $200K – $500K+ (complex SAP integration scenarios)

Includes:
- Data migration
- System integration (e-commerce platform, CDP, ERP)
- Tactics setup
- Template design
- Team training
- Go-live support

### 3.5 What's included standard

- Email + chosen channels
- Smart Insight (eRFM, lifecycle segmentation)
- Predict (AI recommendations)
- Tactics library
- Automation Center
- Strategic Dashboard
- Reports & analytics
- Dedicated CSM
- 24/7 support (Enterprise SLA)
- ISO 27001 + GDPR compliance
- Multi-account capability

### 3.6 Add-ons typically

- Additional dedicated IPs
- Premium support packages
- Custom integrations development
- Direct Mail connector
- Mobile wallet
- Advanced Loyalty Cloud
- Conversational channels (WhatsApp Business)

### 3.7 Pricing vs. konkurence (2026)

Per Spadoom analysis:

| Platform | Mid-market starting | Enterprise typical |
|---|---|---|
| **Klaviyo** | $720/měsíc (50K) | $5K+/měsíc |
| **HubSpot Marketing Hub Enterprise** | $3 600/měsíc | $10K+/měsíc |
| **Salesforce Marketing Cloud** | $5K+/měsíc | $25K+/měsíc |
| **Adobe Journey Optimizer** | $10K+/měsíc | $50K+/měsíc |
| **Braze** | $4K+/měsíc | $20K+/měsíc |
| **SAP Emarsys Edition** | **$1.5K – $5K/měsíc** | **$10K+/měsíc** |
| **SAP Engagement Cloud Enterprise** | $5K+/měsíc | $20K+/měsíc |
| **Bloomreach Engagement** | $3K+/měsíc | $15K+/měsíc |

Pozn.: Emarsys Edition **competitive** v mid-market, Enterprise Edition v enterprise tier.

### 3.8 Free trial

- **No public free trial** (jako ExpertSender)
- Demo + consultation (45-90 min)
- Pilot / POC možný pro large deals
- Reference site visits offered

---

## 4. Retail-first & B2C positioning

Emarsys je **explicitly designed pro retail/e-commerce/B2C**. Toto je výrazný diferenciátor.

### 4.1 Primary verticals

#### Retail (largest segment)
- Fashion & apparel (PUMA, Reiss, etc.)
- Beauty & cosmetics
- Sport & outdoor
- Home & garden
- Electronics retailers
- Department stores
- Specialty retailers

#### E-commerce (online + omnichannel)
- D2C brands
- Marketplace sellers
- Subscription boxes
- Cross-border e-commerce

#### Travel & Hospitality
- Hotel chains
- Booking platforms
- Tour operators
- Cruise lines

#### Sports & Entertainment
- NHL teams (San Jose Sharks)
- FC Bayern Munich
- Other sports clubs
- Entertainment venues

#### Telecommunications
- B2C telco
- ISPs
- Mobile carriers

#### Financial Services (B2C)
- Retail banks
- Insurance B2C
- Investment platforms

#### Media & Publishing
- News brands
- Subscription content
- Streaming services

### 4.2 60+ pre-built Tactics

Emarsys's flagship differentiator. **Out-of-the-box campaign templates** designed by Emarsys based on **best practices from 1 500+ brands**.

Examples per category:

#### Acquisition tactics
- Welcome series (multi-step)
- Newsletter signup confirmation
- First purchase incentive
- Lead nurturing sequence

#### Engagement tactics
- Browse abandonment
- Cart abandonment (multi-channel)
- Wishlist reminders
- Price drop alerts
- Stock alerts (back in stock)

#### Retention tactics
- Loyalty welcome
- Birthday celebration
- Anniversary
- VIP rewards
- Tier-up notifications
- Referral program

#### Reactivation tactics
- Win-back campaign (multi-stage)
- Lapsed customer re-engagement
- Lapsed VIP rescue
- Unsubscribe save

#### Lifecycle tactics
- New customer (first 30/60/90 days)
- Loyal customer cross-sell
- At-risk customer retention
- Hibernating winback

#### Transactional tactics
- Order confirmation
- Shipping notifications
- Delivery confirmation
- Review request
- Replenishment reminder (consumables)

### 4.3 Tactics design

Per oficiální Emarsys Help:
- **Pre-built Automation Center programs** AND **Interactions programs**
- **Each Tactic** has different versions per pricing package + add-ons
- **Channel selection** during setup (email, SMS, push, web)
- **Customization required** before activation (Tactics need tweaking)
- **Pre-built segments** included (Smart Insight + web behavior)

### 4.4 Why retail-first matters

- **Industry-specific data models** (orders, products, categories built-in)
- **Pre-configured eRFM** (extended RFM s retail nuances)
- **Product Recommendations** (Predict) tuned for retail
- **Catalog management** native
- **Mobile wallet integration** (Apple Wallet, Google Pay loyalty)
- **In-store engagement** support (POS data → online comms)
- **Sport sponsorship use cases** common (fan engagement)

---

## 5. Single Customer Profile & data layer

Emarsys uses **unified customer profile** across all channels and data sources.

### 5.1 Data ingestion sources

#### E-commerce platforms
- **SAP Commerce Cloud** (deepest plug-and-play)
- Shopify, Magento (Adobe Commerce), BigCommerce, Salesforce Commerce Cloud
- Custom platforms via API

#### CRM systems
- **SAP Sales Cloud V2** / Service Cloud V2 (native)
- Salesforce CRM (via integration)
- Custom CRMs via API

#### ERP / Operational data
- **SAP S/4HANA** (deep integration, real-time)
- Other ERPs via API

#### Customer Data
- **SAP Customer Data Platform (CDP)**
- **SAP Customer Identity (CDC)** for IAM
- External CDPs via API

#### Web tracking
- **Web Extend** (Emarsys's tracking script)
- Page views, product views, cart events, search queries
- Custom events

#### Mobile apps
- **Mobile Engage SDK** (iOS + Android)
- App events, in-app purchases
- Push tokens

#### POS / In-store
- POS data via API
- Loyalty card scans
- In-store browse history

#### Webhooks + API
- Real-time events from any source
- Custom integration

### 5.2 Single Customer Profile contents

Each profile contains:
- **Demographics & contact info** (name, email, phone, address)
- **Preferences** (channel preferences, language, communication frequency)
- **Subscription status per channel**
- **Order history** (all orders chronologically)
- **Browse history** (page views, products viewed, searches)
- **Cart events** (add, remove, abandon)
- **Wishlist items**
- **Email/SMS/push engagement**
- **Predictive scores** (CLV, churn risk, NPD)
- **Smart Insight cohort** (lifecycle stage, eRFM cohort)
- **Loyalty program** data (tier, points, rewards)
- **In-store activity** (if integrated)
- **Tags + custom fields**

### 5.3 Relational data model

Emarsys supports **relational data tables** (not just flat profile):
- Customers → Orders → Line items → Products
- Customers → Sessions → Pageviews
- Customers → Loyalty → Points → Transactions

Enables **complex queries** for segmentation.

### 5.4 Web Extend (tracking)

- JavaScript snippet on website
- **First-party tracking** (cookie-based)
- Page views, product views, cart events, search, custom events
- **Cross-device stitching** via email/login
- **Anonymous + identified** unified profile

### 5.5 Open Data Access

Per Q1 2026 release:
- **Queryable access** to product identities, attributes, pricing, availability
- **Full audit trail** for reporting
- **Track price drops** over time
- **Standard Product Catalog API** (pilot)

### 5.6 Data residency

- **Multiple regions** available: EU (primary), US, APAC, LATAM
- **EU hosting** standard pro European customers
- **ISO 27001 certified**
- **SAP enterprise security** post-acquisition

---

## 6. Smart Insight (RFM + Lifecycle)

Emarsys's **flagship analytics module**.

### 6.1 Co je Smart Insight

**eRFM (extended RFM)** + **Customer Lifecycle stage** classification.

```
Customer lifecycle stages (default):
├─ New Customer (first purchase)
├─ Active Customer (engaged)
├─ Loyal Customer (multi-purchase)
├─ VIP / Champion (top tier)
├─ Defecting (declining engagement)
├─ Lost (churned)
└─ Inactive (never converted)

eRFM cohorts (refined):
├─ Champions (high R, F, M)
├─ Loyal Customers
├─ Potential Loyalists
├─ Recent Customers
├─ Promising
├─ Needs Attention
├─ About to Sleep
├─ At Risk
├─ Cannot Lose Them
├─ Hibernating
└─ Lost
```

### 6.2 eRFM customization

Per oficiální Help:
- **Setup during onboarding** s CSM
- **Customizable scoring** per dimension (R, F, M)
- **Time windows** configurable
- **Lifecycle stage definitions** locked after setup (cannot change per account)
- **Pre-built segments** based on eRFM auto-created

### 6.3 Smart Insight Dashboard

- Cohort distribution (% in each stage)
- Customer counts per cohort
- Revenue per cohort
- AOV per cohort
- Cohort transitions over time (sankey)
- Cohort velocity (movement speed)

### 6.4 Integrace with Tactics

- Tactics use **Smart Insight segments** as triggers
- Customer enters cohort → tactic activates
- Customer leaves cohort → tactic adjusts

Example:
```
Customer transitions to "At Risk"
   ↓
Tactic "At-Risk Re-engagement" auto-activates
   ↓
Multi-channel sequence begins (email + push + SMS)
   ↓
If customer responds (purchase) → moves to "Recent Customer"
   ↓
Different tactic activates
```

---

## 7. Predict (AI product recommendations)

Emarsys's **proprietary recommendation engine**.

### 7.1 Predict capabilities

Real-time **AI-driven product recommendations** in:
- Emails (dynamic blocks per recipient)
- On-site widgets (homepage, product page, cart, checkout)
- Mobile push notifications
- Web push
- Direct mail
- Display ads

### 7.2 Recommendation strategies

#### Collaborative filtering
"Customers like you bought X"
- Based on aggregate customer behavior
- Updates real-time as data grows

#### Content-based
"Similar to what you viewed"
- Product attributes (category, brand, price)
- Image similarity (some Predict variants)

#### Personalized
ML-driven per profile
- Browse history weight
- Purchase history weight
- Wishlist signals
- Cart events

#### Trending
Aggregate popular
- Hot products right now
- Per category trending

#### Cross-sell / Upsell
- Complementary products
- Higher-priced alternatives
- Bundle suggestions

#### Search-based
- Based on search queries
- Search-to-purchase optimization

### 7.3 Personalization per context

```
Homepage email block:
- "Recommended for you" (personalized)
- "Trending in your favorite category"

Cart abandonment email:
- Cart items dynamically
- "Customers also added" recommendations

Post-purchase email:
- "Complete the look" (cross-sell)
- "You might also like" (related)

Browse abandonment email:
- Last viewed product
- "Similar items"
- "Recently viewed by you"
```

### 7.4 Predict Web Extend integration

- Web Extend tracks browse behavior
- Predict trains models on data
- Real-time recommendations on website
- Updates as customer browses

### 7.5 Predict reporting

- Recommendation performance metrics
- Click-through per strategy
- Revenue attributed per recommendation slot
- A/B testing different strategies

---

## 8. Tactics

**Flagship feature** Emarsys – 60+ pre-built strategies.

### 8.1 Tactics overview

Per oficiální Emarsys Help:

*"Tactics are pre-built Automation Center and Interactions programs designed to achieve a specific marketing goal. Each one must be customized to a greater or lesser extent before you can use it."*

### 8.2 Categories of Tactics

- **Acquisition** (welcome series, lead nurturing)
- **Engagement** (browse/cart abandonment, wishlist)
- **Retention** (loyalty welcome, VIP)
- **Reactivation** (winback, lapsed customer)
- **Lifecycle** (new customer journey, defection prevention)
- **Transactional** (order confirmation, replenishment)
- **Seasonal** (Black Friday, Christmas, sales events)
- **B2B-specific** (lead scoring, sales enablement)
- **Loyalty-specific** (tier promotion, points expiry)

### 8.3 Tactic structure

Each Tactic contains:
- **Trigger** (entry condition)
- **Channel sequence** (multi-channel orchestration)
- **Pre-built segments** (Smart Insight + behavioral)
- **Wait nodes** (timing)
- **Decision branches** (conditional logic)
- **Templates** (email, SMS, push templates)
- **Goal definition** (conversion event)
- **Exit conditions**

### 8.4 Tactic versions per package

- **Different versions** depending on pricing package + add-ons
- Higher tiers = more sophisticated Tactics available
- E.g.:
  - Basic: 2-email welcome series
  - Premium: 5-step welcome with multi-channel + personalization

### 8.5 Customization required

Tactics **must be customized** before activation:
- Brand voice in templates
- Specific products/offers
- Timing per business
- Segments fine-tuning
- Channel preferences

### 8.6 Tactics customization limits

Per oficiální docs:
- Tactics use **pre-built segments only**
- **Combined segments not supported** in Tactics
- **Lifecycle stages cannot be redefined** at Tactic level
- **Web behavior segments editable** but careful with field references

### 8.7 Tactic deployment flow

```
Marketer: Automation menu → Tactics
   ↓
Browse Tactics library (filtered by category/status)
   ↓
Select Tactic card
   ↓
Choose package variant
   ↓
Select channels
   ↓
Review summary
   ↓
"Create Tactic" – downloads to account
   ↓
Wait a few minutes for generation
   ↓
Click "Go to Automation Center program"
   ↓
Customize:
- Edit templates
- Adjust timing
- Modify branching
- Tweak segments
   ↓
Test
   ↓
Activate
```

### 8.8 Tactics status tracking

Programs grouped by status:
- **Inactive** – not created yet
- **In design** – being built/tested
- **Active** – running
- **Needs attention** – paused, frozen, pending
- **In error** – frozen or error mode

### 8.9 Strategic Dashboard integration

Tactics linked to **Strategy** (e.g. "Increase repeat purchase rate"):
- Strategic Dashboard shows strategy performance
- Click "Get Better Results with Tactics" → see Tactics for that strategy
- Performance per Tactic tracked at strategy level

---

## 9. Automation Center & Interactions

Two parallel automation paradigms v Emarsys.

### 9.1 Automation Center

**Visual workflow builder** for **programs** (sequences of actions).

- Drag-and-drop canvas
- Triggers + nodes + branches
- Pre-built templates
- Real-time activation
- Multi-channel coordination

### 9.2 Interactions

**Event-based programs** for **real-time triggered campaigns**.

- Triggered by specific events
- Real-time execution
- Simpler than Automation Center
- Used for transactional + immediate response
- Web push, transactional emails, real-time alerts

### 9.3 When to use what

| Use case | Automation Center | Interactions |
|---|---|---|
| Welcome series (multi-step) | ✅ | ❌ |
| Cart abandonment (multi-channel) | ✅ | ❌ |
| Order confirmation (immediate) | ❌ | ✅ |
| Birthday email | ✅ | ❌ |
| Browse abandonment | ✅ | ✅ (depending) |
| Lifecycle journey | ✅ | ❌ |
| Real-time pricedrop alert | ❌ | ✅ |
| Loyalty tier promotion | ✅ | ❌ |

### 9.4 Automation Center nodes

- **Entry node** (trigger)
- **Wait node** (delay)
- **Channel nodes** (Send email, Send SMS, Send push, Send web push)
- **Branching nodes:**
  - Quick filter (segment narrowing)
  - Decision (conditional branching)
  - A/B split test
  - Filter switch (multi-path)
  - Exclude (remove from path)
- **Action nodes:**
  - Update field
  - Add to contact list
  - Remove from contact list
  - Subscribe/unsubscribe channel
  - Webhook
  - Custom action
- **Goal node** (conversion event)
- **End node**

### 9.5 Multi-channel coordination

```
Cart abandonment program example:

Entry: Cart abandoned (>30 min)
   ↓
Wait 1h
   ↓
Send email: Reminder
   ↓
Wait 3h
   ↓
Quick filter: Email opened?
   YES → Wait 24h, then Decision: Purchased?
         YES → Goal (exit)
         NO → Send email: 10% discount
   NO → Send web push: Silent reminder
         ↓
         Wait 24h
         ↓
         Send email: 10% discount
   ↓
Wait 48h, Decision: Purchased?
   YES → Goal (exit)
   NO → Send SMS (if opted in): Final reminder
   ↓
End
```

### 9.6 Real-time evaluation

- Workflows evaluate continuously
- Profile changes trigger re-evaluation
- Multi-channel orchestration cross-references
- Frequency caps cross-channel respected

### 9.7 Frozen / Error states

Programs can enter:
- **Frozen** – paused due to errors or operational issues
- **Error** – setup issue prevents execution
- **Pending** – approval needed
- **Paused** – manually paused
- **Pause pending** – paused soon

Notifications sent to marketers automatically.

---

## 10. Email channel & VCE editor

### 10.1 Visual Content Editor (VCE)

Emarsys's email editor:
- **Drag-and-drop** modern interface
- **Block-based** structure
- **Responsive design** automatic
- **Brand kit** integration
- **Saved blocks** library
- **Personalization tokens** (merge fields)
- **Dynamic content** (conditional blocks)
- **Product blocks** (Predict integration)
- **Loyalty blocks** (points, rewards display)
- **Multi-language templates**

### 10.2 Email types

- **Newsletter campaigns** (broadcast)
- **A/B test campaigns**
- **Triggered campaigns** (event-based)
- **Automation emails** (within programs)
- **Transactional emails**
- **RSS-driven** (some configurations)

### 10.3 Personalization

- **Merge fields** s syntax
- **Conditional content blocks** (if/then)
- **Dynamic product recommendations** (Predict)
- **Personalized images** (creative variants)
- **Subject line personalization**
- **Send time per recipient**

### 10.4 Send-time optimization

- **STO (Send Time Optimization)** – AI per user
- Time-zone send
- Quiet hours (per region)
- Throttling control

### 10.5 A/B Testing

- Subject lines
- Sender names
- Content variants
- Send times
- Up to 5 variants typical
- **Auto-winner send** to remainder

### 10.6 Preview & test

- Per-device preview
- Litmus integration (some plans)
- Send test
- Spam test
- Inbox placement preview

### 10.7 Deliverability infrastructure

- **Multi-IP pools** (reputation tiered)
- **Dedicated IPs** (Enterprise tier)
- **Subdomain authentication**
- **DKIM + SPF + DMARC** enforced
- **BIMI** support
- **MX-level monitoring**
- **Sender Score reputation** monitoring

---

## 11. Mobile Engage (push + in-app)

### 11.1 Mobile Engage features

- **iOS + Android SDK** integration
- **Push notifications**
- **In-app messages**
- **Rich notifications** (image, action buttons)
- **Deep linking**
- **Geo-fencing** (advanced tier)
- **Beacons** (in-store proximity)
- **App events** tracking
- **Push token management**

### 11.2 In-app messages

- **Native popups** v mobile aplikaci
- **Behavior-triggered**
- **Onboarding sequences**
- **Promotional banners**
- **Surveys**
- **Rich media** (images, videos)

### 11.3 Mobile wallet integration

- Apple Wallet
- Google Pay
- Loyalty cards stored
- Personalized passes
- Dynamic updates (points balance, tier status)

### 11.4 SDK v Q1 2026

Per release notes:
- **SAP Engagement Cloud SDK** (pilot) – unifying iOS/Android/Web
- **First-party data collection** uniform
- **Mobile Push, Web Push, In-app** unified channel
- **Emarsys SDK Expo Plugin** pro React Native

### 11.5 Use cases

- Order status updates
- Cart abandonment push
- Flash sale alerts
- Personalized product recommendations
- Loyalty points balance alerts
- Geofencing (when near store)
- New product launches

---

## 12. Web Channel

**On-site personalization** module.

### 12.1 Capabilities

- **Personalized content blocks** na website
- **Dynamic product recommendations** widgets
- **Pop-ups** (modal, slide-in, sticky)
- **Banners** (top/bottom)
- **Exit-intent triggers**
- **Behavioral triggers** (time, scroll, click)
- **Segment-based content** (per logged-in user)
- **Anonymous visitor** personalization

### 12.2 Content delivery

Web Extend script delivers personalized content:
- Replace static blocks s personalized
- Show/hide elements based on segment
- Dynamic product carousels
- Personalized hero images

### 12.3 Use cases

- Returning visitor: "Welcome back, [Name]"
- New visitor: First-time discount offer
- VIP customer: Exclusive collection preview
- Browse abandonment: Highlight last viewed
- Cart abandonment: Save your cart popup

### 12.4 Performance tracking

- Impressions per personalization
- CTR
- Conversion attribution
- A/B test results
- Lift over control

---

## 13. SMS channel

### 13.1 Capabilities

- **Bulk SMS campaigns**
- **Triggered SMS** (event-based)
- **Transactional SMS**
- **Two-way SMS** (limited regions)
- **RCS** (Rich Communication Services) – newer
- **Personalization** s merge fields
- **TCPA/GDPR compliance**
- **Per-country pricing**

### 13.2 Use cases

- Time-sensitive promos
- Order confirmations
- Shipping notifications
- VIP alerts
- Cart abandonment (last channel)
- Birthday offers
- Event reminders

### 13.3 Integration with channels

SMS often used as **escalation** in multi-channel:
- Email first → if no engagement, SMS as last resort
- Or **complementary** – SMS for time-sensitive, email for content

### 13.4 Compliance

- Opt-in tracking per recipient
- STOP keyword handling
- Quiet hours enforcement
- Country-specific regulations
- Sender ID per country

---

## 14. Loyalty Engine

**SAP Engagement Cloud Loyalty** – integrovaný loyalty solution.

### 14.1 Capabilities

- **Points-based program**
- **Tier-based program** (Bronze, Silver, Gold, Platinum)
- **Hybrid** programs (points + tiers)
- **Earning rules:**
  - Purchase (X points per €)
  - Referral
  - Review submission
  - Social share
  - Birthday bonus
  - Anniversary
- **Redemption:**
  - Discount codes
  - Free shipping
  - Free products
  - Tier upgrades
  - Experiences

### 14.2 Loyalty data v profile

Each profile shows:
- Current tier
- Points balance
- Lifetime points earned
- Points expiry date
- Tier expiration
- Recent transactions
- Available rewards

### 14.3 Loyalty in automation

```
Tactic: "Tier promotion welcome"

Trigger: Customer promoted to Gold tier
   ↓
Send email: "Welcome to Gold!" + benefits explanation
   ↓
Wait 7 days
   ↓
Send SMS: "Try your Gold benefit – free shipping"
   ↓
Wait 30 days
   ↓
Send push: "Reminder – your Gold benefits"
```

### 14.4 Wallet integration

- Apple Wallet / Google Pay loyalty cards
- Dynamic balance updates
- Tier status pass
- Personalized rewards

### 14.5 Loyalty analytics

- Engagement by tier
- Average points per customer
- Redemption rates
- Tier velocity (promotion/demotion rates)
- Revenue per tier

---

## 15. Digital Ads & Direct Mail

### 15.1 Digital Ads connector

- **Audience sync** s ad platforms:
  - Meta Ads (Facebook, Instagram)
  - Google Ads
  - TikTok Ads
  - Pinterest Ads
  - Snapchat Ads
- **Lookalike audiences** based on segments
- **Suppression audiences** (exclude existing customers)
- **Retargeting** based on behavior
- **Real-time sync** (not batch)

### 15.2 Use cases

- Re-target cart abandoners s Facebook ads
- Lookalike audiences based on VIPs
- Exclude existing customers from acquisition campaigns
- Cross-platform unified frequency caps

### 15.3 Direct Mail integration

- **Postal mail** triggered from automation
- Print provider integration
- Personalized catalogs
- Postcards with QR codes
- Combine s digital channels

### 15.4 Use cases for direct mail

- VIP customer catalogs
- Lapsed customer winback
- Seasonal campaigns
- High-AOV customers
- B2B nurturing

### 15.5 Conversational channels

- **WhatsApp Business** (growing)
- **Facebook Messenger**
- **Apple Messages for Business**
- **AI-driven dialogues**
- **Real-time customer service** integration

---

## 16. Generative AI & Joule integration

### 16.1 AI Layer history

Emarsys traditionally focused na **predictive ML** (CLV, churn, recommendations) – ne generative AI.

V 2024-2026 SAP integrace AI rozšiřuje:
- **Joule AI** – SAP-wide generative AI integrated
- **AI-Assisted Content Creation** (Q1 2026 release)
- **AI subject line generation**
- **AI content blocks**
- **AI image generation** (newer)
- **Real-time AI dialogues**

### 16.2 Joule AI

SAP's AI assistant integrated across SAP products including Engagement Cloud:
- **Conversational interface** with marketers
- **Generate campaign ideas**
- **Suggest segments**
- **Analyze performance** (natural language)
- **Create content** (subject lines, body copy)
- **Cross-product context** (knows your SAP data)

### 16.3 Predictive AI (legacy strength)

- **CLV prediction** (Customer Lifetime Value)
- **Churn prediction**
- **Next Purchase Date (NPD)**
- **Send Time Optimization (STO)**
- **Product affinity scores**
- **Engagement scoring**

### 16.4 AI-powered recommendations

- Predict engine s ML personalization
- Real-time updates
- Multi-strategy blending

### 16.5 AI roadmap 2026

Per Q1 2026 release:
- **Universal Schema Builder** – AI-assisted data modeling
- **AI-Assisted Content Creation** for all messages
- **Enhanced AI-powered analytics**
- **Real-time AI guidance** within workflows

---

## 17. API, integrace, SAP ekosystém

### 17.1 API

- **REST API** + legacy SOAP (deprecated for new contracts)
- **OpenID Connect (SAP Cloud Identity)** – modern auth pro post-Feb 2025 contracts
- **OAuth 2.0 + JWT**
- **WSSE** – legacy auth pre-Feb 2025 contracts only
- **Granular API permissions** per endpoint

### 17.2 API endpoints

Per oficiální docs:
- `/contacts` – CRUD contacts
- `/contactlists` – list management
- `/segments` – segment management
- `/email/campaigns` – email management
- `/automations` – automation programs
- `/predict` – recommendations
- `/loyalty` – loyalty data
- `/web-extend` – web tracking
- `/events` – event tracking
- `/products` – product catalog (Open Data)
- `/sms` – SMS sending
- `/mobile` – mobile push

### 17.3 SFTP + WebDAV

- **SFTP** – bulk data import/export
- **WebDAV** – alternative file transfer
- **Key-based SFTP auto-imports** – secure scheduled imports
- Used pro:
  - Daily customer data sync
  - Product catalog updates
  - Bulk imports

### 17.4 Webhooks

- Real-time event notifications
- Configurable per event type
- Signature verification

### 17.5 SDKs

- **Web SDK** (JavaScript)
- **iOS SDK** (Swift)
- **Android SDK** (Kotlin)
- **React Native** plugin (Expo)
- **SAP Engagement Cloud SDK** (unified, pilot in 2026)

### 17.6 SAP ekosystém native integrace

**Key competitive advantage** post-acquisition.

#### Plug-and-play (deep)
- **SAP Commerce Cloud** – order confirmation, cart abandonment, post-purchase
- **SAP Sales Cloud V2** – B2B lead nurturing, contact sync
- **SAP Service Cloud V2** – service-marketing integration
- **SAP Customer Data Platform (CDP)** – unified data model
- **SAP Customer Identity (CDC)** – permission-based data
- **SAP S/4HANA** – ERP data direct
- **SAP Datasphere** – analytics data

#### Use cases
- Real-time inventory data → personalized recommendations
- Order data from S/4HANA → triggered campaigns
- CRM contact updates → segment refresh
- Service interactions → smart engagement

### 17.7 Non-SAP integrace

#### E-commerce
- Shopify, Magento (Adobe Commerce), BigCommerce, Salesforce Commerce Cloud, custom

#### CRM
- Salesforce, Microsoft Dynamics, custom

#### Analytics
- Google Analytics, Adobe Analytics

#### Customer Service
- Zendesk, Salesforce Service Cloud, Freshdesk

#### Ads
- Meta, Google, TikTok, Pinterest, Snapchat

#### Loyalty / Reviews
- Yotpo, Bazaarvoice, Annex Cloud

#### iPaaS
- MuleSoft (SAP-owned), Workato, Boomi, Zapier (limited)

#### Print
- Direct mail providers

### 17.8 Implementation partners

SAP Emarsys má large partner ecosystem:
- **Publicare** (DACH, retail)
- **Spadoom** (Switzerland, EU)
- **Sybit** (DACH)
- **deepblue networks**
- Various regional SAP partners

Většina enterprise implementations vyžaduje partner (ne self-implementation).

---

## 18. Dedicated CSM model & implementation

### 18.1 Dedicated CSM (Customer Success Manager)

**Per oficiální SAP communication:**
*"The Customer Success experience remains unchanged. Customers will continue working with the same dedicated Customer Success Manager and support teams who know their business, their goals, and their implementation."*

#### CSM responsibilities
- **Strategic partnership** (ne pure technical support)
- **Quarterly Business Reviews (QBR)**
- **Performance optimization**
- **New use case identification**
- **Roadmap input collection**
- **Escalation point**
- **Best practices sharing**
- **Tactic adoption guidance**

### 18.2 Implementation typical flow

```
Phase 1: Sales (1-2 months)
- Demo + qualifying
- Proposal
- Contract negotiation
- Implementation partner selection (typical)

Phase 2: Discovery (2-4 weeks)
- Stakeholder workshops
- Data audit
- Integration architecture design
- Tactics planning
- Project plan

Phase 3: Technical Setup (4-8 weeks)
- SAP / e-commerce integration
- Data migration
- Web Extend installation
- Mobile SDK integration
- Domain authentication
- Initial data sync

Phase 4: Smart Insight setup (2-3 weeks)
- eRFM configuration
- Lifecycle stages definition
- Segment library setup

Phase 5: Tactics implementation (4-8 weeks)
- Welcome series
- Cart abandonment
- Browse abandonment
- Post-purchase
- Re-engagement
- Loyalty integration

Phase 6: Templates & Brand (2-4 weeks)
- Email template design
- Mobile push templates
- Web push templates
- On-site banners

Phase 7: Training (1-2 weeks)
- Marketer training (Tactics)
- Power user training (Automation Center)
- Analyst training (Strategic Dashboard)
- Admin training (User management)

Phase 8: Go-live + Optimization (Ongoing)
- Soft launch (limited audience)
- Full launch
- 4 weeks intensive support
- Transition to BAU + CSM
```

### 18.3 Customer Success critique

Some Gartner Peer Insights critique:
- Implementation team variability ("copy/paste agenda" complaint)
- Training "basic, not adapted to company situation"
- CSM expertise varies per individual
- Resolution speed depends on tier

### 18.4 Support tiers

- **Standard** – business hours, email + ticket
- **Premium** – 24/7 + faster SLA
- **Strategic** – dedicated CSM + QBR + roadmap input

### 18.5 Component / contact via SAP for Me

Per docs:
- Component: **CEC-EMA** (SAP support component)
- Submit incidents via SAP for Me portal
- Account Owner access required

---

## 19. Compliance

### 19.1 Data residency

- **Multiple regions:** EU (primary), US, APAC, LATAM
- **EU hosting** standard for European customers
- **ISO 27001 certified**
- **SAP enterprise security** post-acquisition
- **Trust Center** at trust.sap.com

### 19.2 GDPR features

- **GDPR consent fields** v forms
- **Per-channel consent** tracking
- **Audit trail** (IP, timestamp, source)
- **Right to Be Forgotten:**
  - UI: contact → Delete
  - API: DELETE endpoint
- **Data export** per contact
- **DPA available**
- **EU-US Data Privacy Framework** certified

### 19.3 Consent management

Per oficiální Publicare partner documentation:
- **Legally compliant opt-in/opt-out** flows
- **GDPR-compliant channel-specific** subscription
- **Per-channel preference centers**
- **Permission management logics** customizable
- **Welcome routes** for new opt-ins

### 19.4 Security features

- **2-step authentication** (TOTP)
- **IP address allowlisting**
- **SSO/SAML** (Enterprise)
- **Multiple email domain verification** required
- **Account Owner security settings**
- **Audit logs**
- **Encryption at rest + in transit**

### 19.5 Compliance certifications

- **GDPR compliant**
- **ISO 27001:2013** (info security)
- **ISO 22301** (business continuity)
- **SOC 2 Type II** (operations)
- **CCPA** (California)
- **CASL** (Canadian)
- **CAN-SPAM** (US)
- **PDPA** (Singapore)
- **LGPD** (Brazil)
- **SAP enterprise compliance** standards apply

### 19.6 API authentication evolution

- **WSSE** – legacy (only for pre-Feb 24, 2025 contracts)
- **OpenID Connect** – modern OAuth 2.0 + JWT
- **OpenID Connect (SAP Cloud Identity)** – integrated s SAP IAM
- New contracts must use OAuth-based auth

---

## 20. Limity a nedostatky

### 20.1 Pricing & accessibility

- **No public pricing** – sales-driven only
- **No free plan / free trial** (self-serve)
- **Mid-market starting at $1.5K/měsíc** – out of reach for small business
- **Implementation costs significant** ($30K-$500K+)
- **Annual contracts** typical – less flexibility
- **Complex pricing structure** s add-ons (CSM time, channels, Tactics tiers)

### 20.2 Implementation complexity

- **4-6 months typical implementation** for enterprise
- **Partner often required** (not self-implementation)
- **SAP integration complexity** (S/4HANA setup)
- **Data migration extensive** for established brands
- **Tactics customization** takes time
- **Team training necessary** (specialized roles)

### 20.3 UI/UX critique

- **Complex interface** – not as polished as Klaviyo
- **Learning curve significant** for marketers new to enterprise platforms
- **Some legacy UI elements** (despite improvements)
- **Multi-product feel** (Automation Center + Interactions + Tactics)
- **Strategic Dashboard sophisticated** but daunting initially

### 20.4 Tactics customization limits

Per oficiální docs:
- **Combined segments not supported** in Tactics
- **Lifecycle stage definitions locked** at account level
- **Pre-built segments only** in Tactic nodes
- **Some Tactic versions package-locked** (lower tier = limited Tactics)

### 20.5 Reporting limitations

- **Cannot easily save report templates** (G2 critique – similar to ExpertSender)
- **Custom dashboard creation** more complex than Klaviyo
- **Multi-touch attribution** requires SAP Datasphere or external tool
- **Export options** sometimes limited

### 20.6 Implementation team variability

Per Gartner Peer Insights critique:
- *"Implementation team has no expertise whatsoever: they just seem to copy/paste the same implementation agenda"*
- *"Training phase to fully understand how to use the tool was basic"*
- *"When we asked for more guidance on specific use case, we're always redirected towards support team"*
- *"Customer success team is supposed to share business expertise on the best way to use the tool"*

⚠️ **Variability per CSM/implementation team** je documented issue.

### 20.7 Channel/feature gaps

- **No native online courses / LMS** (vs. GetResponse)
- **No native webinars** (vs. GetResponse)
- **No native digital products sale** (vs. MailerLite, GetResponse)
- **No paid newsletter** subscription (vs. MailerLite, GetResponse, Substack)
- **No native review collection** (uses external Yotpo etc.)
- **No native CRM** – assumes external SAP Sales Cloud or other
- **B2B features less developed** než HubSpot Sales Hub
- **No native call center features**

### 20.8 AI features behind some competitors

- **Generative AI** newer, less mature než Klaviyo Marketing Agent / HubSpot Breeze
- **AI Agents (autonomous)** less developed
- **Joule integration ongoing** – still evolving
- **Behind Salesforce AI** v enterprise integration

### 20.9 Multi-language limits

- **6-8 main languages v UI**
- **No Czech / Slovak** v UI
- Help center primarily English + German + few European

### 20.10 Vendor lock-in concerns

- **Tight SAP integration** = harder to migrate later
- **Custom workflows** not portable
- **Predictive scores** proprietary
- **eRFM definitions** Emarsys-specific
- **Predict recommendations** trained on platform
- **Data export** possible but complex re-implementation elsewhere

### 20.11 SAP ecosystem dependency (Enterprise Edition)

- **Most value if you use SAP S/4HANA, CDP, CDC**
- **If non-SAP shop:** Emarsys Edition only (less SAP ecosystem benefit)
- **Enterprise Edition pricing premium** justifies only with SAP investment

### 20.12 Reporting + analytics

- **Strategic Dashboard** good but enterprise-oriented
- **Granular per-customer reporting** sometimes complex
- **Custom date ranges + cohort analysis** sophisticated but needs training
- **Export to BigQuery / Snowflake** requires SAP Datasphere

### 20.13 Mobile

- **Mobile app for marketers** less polished
- **Mobile Engage SDK** strong but requires dev effort
- **In-app messages** sophisticated but require app SDK integration

---

## 21. Shrnutí: Pro koho a proti komu

### Emarsys (SAP Engagement Cloud) je dobrá volba pokud
- Jste **mid-to-large retail / e-commerce brand** s 100K+ contacts
- Hledáte **omnichannel platform** (email + SMS + push + web + ads + direct mail)
- Vážíte si **pre-built Tactics** – nechcete budovat workflows from scratch
- Cíl je **AI-powered personalization** at scale
- Provozujete **loyalty program** + chcete integrované
- Operate v **DACH, EU retail** – strong regional presence
- Máte budget **$2K+/měsíc** + implementation budget
- Hledáte **dedicated CSM** s strategic input
- Provozujete **multi-brand / multi-region**
- Používáte **SAP ekosystém** (S/4HANA, Commerce Cloud, Sales Cloud) – Enterprise Edition
- Potřebujete **enterprise compliance + security** (ISO, SOC 2, GDPR)
- Provozujete subscription business s replenishment patterns
- Máte **physical retail + online** (omnichannel s in-store engagement)
- Provozujete **sport / entertainment** s fan engagement

### Emarsys není dobrá volba pokud
- Jste **small business / startup** – overkill + nedostupné
- Nemáte budget pro **$2K+/měsíc + implementation**
- Hledáte **self-service / freemium** – Emarsys not free
- Provozujete **B2B SaaS sales-led** – HubSpot, Salesforce lepší
- Hlavní use case je **pure newsletter publishing** – Substack, Beehiiv, ConvertKit
- Potřebujete **rychlé self-implementation** – Emarsys vyžaduje partner / months
- Provozujete **content creator business** (courses, paid newsletters)
- Pracujete v **češtině/slovenštině** – UI nepodporuje
- Hledáte **deeply transparent pricing** – Emarsys vyžaduje sales process
- Nemáte data infrastructure pro full CDP setup
- Hledáte **simple email tool** s rychlým launchem

### Emarsys vs. konkurence

| Konkurence | Kdy lepší než Emarsys |
|---|---|
| **Klaviyo** | Pure DTC Shopify e-commerce, transparent pricing, AI agents, US-first |
| **HubSpot** | Full B2B CRM, multi-Hub vision, sales-led organizations |
| **Salesforce Marketing Cloud** | Pure enterprise, Salesforce ecosystem, custom development |
| **Adobe Journey Optimizer** | Enterprise s Adobe Experience Cloud, content-heavy |
| **Braze** | App-first companies, real-time messaging |
| **Bloomreach Engagement** | DTC s deep content personalization |
| **Mailchimp** | Small business, brand recognition, self-serve |
| **MailerLite / Brevo** | SMB, simple use cases, transparent pricing |
| **GetResponse** | Webinars + courses + funnels, 27 languages incl. CZ/SK |
| **ActiveCampaign** | Mid-market deep automation, simpler than enterprise |
| **ExpertSender** | Mid-market e-commerce s personalized service, polský / CEE origin |

---

*Dokument zpracován z oficiálních zdrojů emarsys.com, sap.com/products/crm, help.emarsys.com, help.sap.com, learning.sap.com a praktických zdrojů (Gartner, G2, Spadoom, Publicare, Sybit, FIS). Pro nejaktuálnější detaily je nutný demo s SAP sales teamem.*
