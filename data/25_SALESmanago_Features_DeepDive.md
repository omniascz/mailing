# SALESmanago – hloubková analýza funkcí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Zdroje:** oficiální dokumentace salesmanago.com + analytické weby a recenze (G2, Capterra, GetApp, SoftwareAdvice, Crunchbase, LinkedIn) ověřené v dubnu–květnu 2026.
**Rozsah:** kompletní funkcionalita platformy v roce 2026 – Customer Engagement Platform (CEP) kombinující Customer Data Platform (CDP) + Omnichannel Marketing Automation + AI personalizaci + analytics.

> **Důležitý kontext:** SALESmanago je **polský produkt** založený společností **Benhauer sp. z o.o.** v **Krakově** (ul. Grzegórzecka 21, 31-532 Kraków, Poland). **Financial Times rankuje SALESmanago jako fastest growing marketing automation platform v Evropě** (claim z oficiální materiálů).
>
> **Pozice:** **AI-driven CDXP** (Customer Data Platform & Customer Experience Platform). **3 000–3 600+ klientů ve 50 zemích**. Per oficiální: *"the only no-code, AI driven CDXP (all in One Customer Data Platform & Customer Experience Platform)"*.
>
> **Klíčové reference klienti:** **Starbucks, Vodafone, Lacoste, New Balance, Victoria's Secret, Adidas, Converse, Crocs, Nahdi, Tanners** – velké globální značky.
>
> **Velikost firmy:** **350 zaměstnanců** (consultants, data scientists, engineers). Síť **1 000+ reselling partners** internationally.
>
> **Akvizice / investor:** **SilverTree Equity** (private equity round). Per recenze: *"Over the past three years, following the acquisition, SALESmanago has undergone significant shifts in strategy, personnel, board composition, and management."*
>
> **Klíčové diferenciátory:**
> - **CDP + Marketing Automation v jedné platformě** (native integration)
> - **AI-driven personalization** (deep ML)
> - **EU-based + GDPR-compliant** (data v EU)
> - **No-code platform** – marketing teams nepotřebují dev
> - **Modular add-on architektura** – pay-for-what-you-use
> - **E-commerce focused** – tools designed s e-commerce marketers
> - **Customer Engagement Platform (CEP)** positioning (2024+ rebrand)
> - **Mid-market scalability** focus (mezi enterprise a SMB)
> - **5-10x conversion boost** + **40% annual growth** claims
> - **G2 recognized** – industry awards
> - **Pricing od €199/měsíc** (entry tier, custom per klient)

---

## Obsah

1. [Co je SALESmanago a pro koho je](#1-co-je-salesmanago)
2. [Tarify a pricing model (od €199/měsíc)](#2-tarify)
3. [Customer Engagement Platform (CEP) architektura](#3-cep-architektura)
4. [Customer Data Platform (CDP, certifikovaná)](#4-cdp)
5. [Audiences (centralized customer data)](#5-audiences)
6. [Web Experience (visitors → leads)](#6-web-experience)
7. [Email Marketing & AI Email Design](#7-email-marketing)
8. [Marketing Automation (workflows)](#8-marketing-automation)
9. [AI-driven personalization](#9-ai-personalization)
10. [Recommendation Frames](#10-recommendation-frames)
11. [Product Collections (Deep Behavioral)](#11-product-collections)
12. [Zero-party data collection](#12-zero-party-data)
13. [Omnichannel execution (email, SMS, web push, ads)](#13-omnichannel)
14. [Customer Preference Center](#14-preference-center)
15. [Reports & Analytics](#15-reports)
16. [Integrations & API](#16-api-integrace)
17. [Growth Framework + Growth Plan](#17-growth-framework)
18. [Partner program (1000+ resellers)](#18-partner-program)
19. [Compliance, GDPR, EU hosting](#19-compliance)
20. [Limity a nedostatky](#20-limity)

---

## 1. Co je SALESmanago

- **Společnost:** Benhauer sp. z o.o. (parent)
- **Brand:** SALESmanago
- **HQ:** **Kraków, Polsko** (ul. Grzegórzecka 21, 31-532 Kraków)
- **Vznik:** ~2011 (vendor history – ověřit)
- **Velikost:** **350 zaměstnanců** (consultants, data scientists, engineers)
- **Reach:** **3 000+ klientů (oficiální 2026: až 3 600+) ve 50 zemích**
- **Pozice:** **AI-driven CDXP** (CDP + CEP) – Customer Engagement Platform
- **Specializace:** **mid-market a enterprise e-commerce**, retail, fashion, beauty, jewelry
- **Lokalizace UI:** **angličtina + polština + další jazyky** (multi-region)
- **Web:** salesmanago.com
- **Investor:** **SilverTree Equity** (private equity acquisition)
- **Channel:** **1 000+ reselling partners** internationally

### Filozofie produktu

**"AI Commerce Growth Platform"** – marketing positioning.

Per oficiální:
*"We help you get set up and running quickly. Our goal is to minimise the time and effort needed for your team to achieve growth objectives. Flexible, proven workflows and intuitive tools let you drag and drop easily. Be the hero."*

### Reference customers

**Tier 1 global brands** (per oficiální claim):
- **Starbucks**
- **Vodafone**
- **Lacoste**
- **New Balance**
- **Victoria's Secret**
- **Adidas**
- **Converse**
- **Crocs**

**Mid-market klienti:**
- **Nahdi** (pharmacy, Saudi)
- **Tanners** (UK e-commerce)
- **iSpot** (Apple Premium Partner, Poland)
- **Dekosas.com** (home/office, 20K+ products)
- Polish fashion brands
- European e-commerce
- Latin American brands

### Industry awards

- **Financial Times** ranks SALESmanago as **fastest growing marketing automation platform v Evropě**
- **G2 recognition** for excellence
- Various industry recognitions

```
┌─────────────────────────────────────────────────────────────────┐
│         SALESMANAGO CUSTOMER ENGAGEMENT PLATFORM (CEP)          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐      │
│  │  CUSTOMER DATA PLATFORM (CDP) – CORE                  │      │
│  │  ├─ Unified customer profiles (360°)                  │      │
│  │  ├─ Real-time data collection                         │      │
│  │  ├─ Transactional + behavioral + declarative data     │      │
│  │  ├─ Identity resolution                               │      │
│  │  ├─ Real-time segmentation                            │      │
│  │  └─ Audience management                               │      │
│  └───────────────────────────────────────────────────────┘      │
│                          │                                      │
│           ┌──────────────┴──────────────┐                       │
│           │                             │                       │
│  ┌────────▼────────┐         ┌──────────▼──────────┐            │
│  │  MARKETING      │         │  WEB EXPERIENCE     │            │
│  │  AUTOMATION     │         │  + Personalization  │            │
│  │  - Workflows    │         │  - Pop-ups          │            │
│  │  - Triggers     │         │  - Banners          │            │
│  │  - Multi-step   │         │  - On-site recs     │            │
│  └─────────────────┘         └─────────────────────┘            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────┐        │
│  │  AI LAYER – DEEP PERSONALIZATION                    │        │
│  │  ├─ AI Email Design Studio                          │        │
│  │  ├─ Recommendation Frames                           │        │
│  │  ├─ Product Collections (Deep Behavioral)           │        │
│  │  ├─ ChatGPT integration                             │        │
│  │  ├─ Machine Learning models                         │        │
│  │  └─ Predictive analytics                            │        │
│  └─────────────────────────────────────────────────────┘        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────┐        │
│  │  OMNICHANNEL EXECUTION                              │        │
│  │  ├─ Email (newsletter, dynamic 1-to-1)              │        │
│  │  ├─ Web Push                                        │        │
│  │  ├─ SMS                                             │        │
│  │  ├─ Pop-ups + on-site                               │        │
│  │  ├─ Mobile Push (app)                               │        │
│  │  ├─ Digital Ads (audience sync)                     │        │
│  │  └─ Live Chat (some configurations)                 │        │
│  └─────────────────────────────────────────────────────┘        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────┐        │
│  │  ZERO-PARTY DATA COLLECTION                         │        │
│  │  ├─ Customer Preference Center                      │        │
│  │  ├─ Progressive profiling                           │        │
│  │  ├─ Surveys + quizzes                               │        │
│  │  └─ Explicit preferences                            │        │
│  └─────────────────────────────────────────────────────┘        │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│   GROWTH FRAMEWORK + GROWTH PLAN (custom per klient)            │
│   ├─ Acquisition strategies                                     │
│   ├─ Conversion optimization                                    │
│   ├─ Engagement & retention                                     │
│   └─ Loyalty & scale                                            │
├─────────────────────────────────────────────────────────────────┤
│   + EU-based & GDPR-compliant (data v EU)                       │
│   + Mid-market scalability focus                                │
│   + 350 employees, 1000+ reseller partners                      │
│   + Dedicated CSM per klient                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Typické use cases

- **Mid-market e-commerce** s 50K+ kontaktů
- **Multi-store / multi-brand** retail
- **Fashion + beauty** brands
- **Marketplaces** s personalization needs
- **B2B s long sales cycles** (limited use)
- **Subscription businesses**
- **Loyalty program** management

---

## 2. Tarify a pricing model

### 2.1 Pricing approach

Per oficiální pricing page (salesmanago.com/info/salesmanago-pricing.htm):
*"Every business is different. That's why our pricing is too. Every SALESmanago customer gets a fully customised package to fit their goals. **From €199 per month.**"*

⚠️ **Pricing model:**
- **Sales-driven** (no self-serve)
- **Custom packages** per klient
- **Entry tier od €199/měsíc**
- **Higher tiers** scale based na contacts + features

### 2.2 Pricing factors

- **Number of contacts** (CDP database size)
- **Email volume** monthly
- **SMS volume** (if applicable)
- **Mobile push volume**
- **Number of features** activated (modular add-ons)
- **Sub-accounts** (multi-brand / multi-region)
- **Integration complexity**
- **Support tier** (Standard / Premium / Enterprise)
- **AI features access** (advanced tiers)

### 2.3 Modular add-on architektura

Per oficiální:
*"And we enhanced our CEP with modular add-on solutions directly corresponding with your business challenges"*

Core + add-ons:
- **Core:** CDP + Marketing Automation
- **Add-ons:**
  - Customer Data Platform (full features)
  - Web Experience
  - Email Marketing advanced
  - Mobile Marketing (push, app)
  - SMS module
  - AI Recommendations
  - Loyalty module
  - Advanced analytics
  - Custom integrations

### 2.4 Estimovaný pricing range

⚠️ Custom per klient, ale typical ranges (per industry context):

| Tier | Range | Typical klient |
|---|---|---|
| **Entry** | €199 – €500/měsíc | Small mid-market, low contacts |
| **Standard** | €500 – €2 000/měsíc | Mid-market e-commerce |
| **Advanced** | €2 000 – €5 000/měsíc | Established mid-market |
| **Enterprise** | €5 000+/měsíc | Large brands, enterprise needs |
| **Custom** | Custom | Strategic accounts (Starbucks, etc.) |

### 2.5 Demo + custom quote process

```
Prospect submits form: salesmanago.com → Request demo
   ↓
SALESmanago sales responds (typically 1-2 business days)
   ↓
Discovery call (30-60 min):
- Business type
- E-commerce platform
- Contact database size
- Email volume needs
- Multichannel needs
- Integration requirements
- Geographic scope
- Budget range
   ↓
Custom Growth Plan generated
   ↓
Demo + workshop
   ↓
Proposal s pricing
   ↓
Contract negotiation
```

### 2.6 Growth Plan offering

Per oficiální:
*"Think of us as an extension of your marketing team, always focused on delivering value, starting with a custom Growth Plan tailored to your business."*

**Custom Growth Plan:**
- Strategic roadmap pro každého klienta
- KPI alignment
- Tool selection per use case
- Implementation phases
- Success metrics

### 2.7 Cenové porovnání (mid-market estimate)

| Platform | Mid-market start | Enterprise typical |
|---|---|---|
| **SALESmanago** | **€199/měsíc** (entry) | €5K+/měsíc |
| **Klaviyo** | $720/měsíc (50K) | $5K+/měsíc |
| **HubSpot Marketing Hub** | $890+/měsíc | $10K+/měsíc |
| **ActiveCampaign Plus** | $234/měsíc (10K) | $1.5K+/měsíc |
| **Brevo Business** | €65/měsíc (10K) | €1K+/měsíc |
| **SAP Emarsys** | $1.5K-$5K/měsíc | $10K+/měsíc |
| **Bloomreach Engagement** | $3K+/měsíc | $15K+/měsíc |
| **ExpertSender** | $450+/měsíc | $1K-$10K+/měsíc |

**SALESmanago competitive:** entry pricing dostupnější než Bloomreach/Emarsys/Adobe, ale vyšší než pure email marketing tools.

### 2.8 Free trial / Free plan

- **No free plan** (vendor-driven model)
- **Demo dostupné** přes sales
- **Pilot možný** pro large deals
- **Partner accounts** discounted rates pro reseller programs

---

## 3. Customer Engagement Platform (CEP) architektura

SALESmanago **redesigned platforma** v 2024+ jako Customer Engagement Platform.

### 3.1 CEP overview

Per oficiální:
*"We have redesigned our Customer Engagement Platform (CEP) to offer built-in fundamentals—a certified CDP and marketing automation—delivering deep customer insights and personalisation."*

**Core CEP components:**
1. **Certified CDP**
2. **Marketing Automation**
3. **AI Personalization**
4. **Omnichannel Execution**
5. **Modular add-ons**

### 3.2 Built-in vs. add-ons

**Built-in fundamentals (vždy v plánu):**
- Certified CDP
- Marketing Automation
- Email marketing core
- Basic personalization
- Standard reports

**Add-ons (modular, per klient):**
- Customer Data Platform advanced features
- Web Experience full
- Mobile (push, app)
- SMS
- AI Recommendations advanced
- Loyalty
- Advanced analytics
- Custom integrations

### 3.3 4 critical areas

Per oficiální:
*"Our platform... introduces innovative tools across four critical areas:"*

#### 1. Audiences
**Centralise customer data**
- Single Customer Profile (360°)
- Real-time data ingestion
- Identity resolution
- Behavioral + transactional + declarative data
- Audience segmentation

#### 2. Web Experience
**Turn visitors into leads**
- Pop-ups
- Banners
- On-site personalization
- Recommendation widgets
- Form capture
- Exit-intent
- A/B testing

#### 3. Marketing Automation
**Multi-channel orchestration**
- Workflows (drag-drop)
- Triggers (behavioral, transactional)
- Multi-step sequences
- Conditional branching
- Goal-based exits

#### 4. AI Personalization
**Deep behavioral targeting**
- Recommendation Frames
- Product Collections
- AI Email Design Studio
- ChatGPT integration
- Machine Learning models

### 3.4 SALESmanago Growth Framework

Per oficiální:
*"The SALESmanago Growth Framework allows you to easily build a roadmap for success."*

**Framework phases:**
1. **Acquisition** – attract new customers
2. **Conversion** – maximize sales
3. **Engagement** – build relationships
4. **Loyalty & Scale** – sustainable growth

### 3.5 Lifecycle Engagement Platform

Per oficiální:
*"The SALESmanago Lifecycle Engagement Platform deeply personalises omnichannel customer journeys for growth, loyalty and scale."*

Customer lifecycle stages:
- Anonymous visitor
- Identified prospect
- New customer
- Active customer
- VIP
- At-risk
- Lost / dormant

Per-stage strategies + automation.

---

## 4. Customer Data Platform (CDP, certifikovaná)

**Certified CDP** je centrální feature SALESmanago.

### 4.1 CDP capabilities

#### Data ingestion
- **Website behavior** (page views, clicks, time on site, scroll depth)
- **E-commerce events** (cart, checkout, purchase, browse)
- **Email engagement** (open, click)
- **SMS engagement**
- **Mobile app events**
- **Form submissions**
- **Custom events** via API
- **External data sources** (CRM, ERP, POS)

#### Identity resolution
- Cookie ID → identified contact when email captured
- Cross-device matching (email-based)
- Anonymous → identified profile merge
- Historical data preserved

#### Real-time profile updates
- Events processed real-time
- Profile immediately reflects new data
- Segments re-evaluated
- Workflow triggers fire

### 4.2 Single Customer Profile (360°)

Per profile:
- **Demographics** (name, email, phone, address, age, gender)
- **Behavioral data** (pages, products viewed, time on site)
- **Transactional data** (orders, AOV, LTV, frequency)
- **Engagement data** (email, SMS opens, clicks)
- **Declarative data** (preferences, surveys)
- **Tags + custom attributes**
- **Loyalty data** (points, tier)
- **Predictive scores** (CLV, churn risk)
- **Engagement Score**

### 4.3 Behavioral, transactional, declarative

#### Behavioral data
- Page views
- Time on page
- Scroll depth
- Click events
- Search queries
- Cart additions

#### Transactional data
- Orders
- Products purchased
- Categories preferred
- Average Order Value
- Purchase frequency
- Lifetime Value

#### Declarative data (zero-party)
- Preferences (explicit)
- Survey responses
- Form fields
- Wishlist items
- Preference Center selections

### 4.4 Real-time segmentation

- **Dynamic segments** (auto-update)
- **Multi-source criteria** (behavioral + transactional + declarative)
- **Real-time evaluation**
- **Workflow-ready segments**
- **Audience export** for ads

### 4.5 GDPR-compliant CDP

- EU hosting
- Consent management
- Per-channel consent
- Right to be Forgotten
- DSAR support
- DPA available

---

## 5. Audiences (centralized customer data)

Per oficiální features (Section 3.3):
*"Manage contacts with the Customer Data Platform, create deep 360° profiles, precisely define your target audience. Serve as a source for all personalisation, increase loyalty and retention."*

### 5.1 Audience management

- **Centralized customer database**
- **360° profiles**
- **Real-time segmentation**
- **Custom attributes**
- **Tags hierarchy**
- **Audience lifecycle**

### 5.2 Segmentation capabilities

#### Filter criteria
- **Contact attributes** (custom fields, tags)
- **Email engagement** (specific campaigns, recency)
- **Site activity** (visited pages, time, behavior)
- **E-commerce data** (orders, AOV, products, categories)
- **Engagement Score** thresholds
- **Predictive scores** (CLV, churn risk)
- **Subscription source** (form, integration)
- **Date conditions** (registration, birthday)
- **Geographic** (IP + custom)
- **Custom events**

#### Operators
- AND, OR, NOT
- Nested conditions
- Numeric ranges
- Date ranges
- Custom expressions

### 5.3 Behavior-based targeting

Per oficiální:
*"Target contacts based on their online activity and specific email interactions"*

Example segments:
- Visitors who viewed Product X but didn't purchase
- Customers who purchased Category A but never B
- High engagers who haven't bought v 30 days
- VIP customers (LTV > €5 000)
- At-risk customers (Engagement Score declining)

### 5.4 Audience export

- Export to Facebook Custom Audiences
- Export to Google Ads
- Export to TikTok Ads
- Export to other ad platforms
- Real-time sync supported

---

## 6. Web Experience (visitors → leads)

### 6.1 Web Experience module

Per oficiální:
*"Web Experience to turn visitors into leads"*

Capabilities:
- **Real-time visitor monitoring**
- **Pop-ups** (entry, exit-intent, scroll, click)
- **Banners** (top, bottom, sticky)
- **On-site personalization** (content blocks)
- **Product recommendations** widgets
- **Form capture**
- **A/B testing**
- **Visitor identification**

### 6.2 Real-time visitor monitoring

- **Live visitor counter**
- **Visitor activity timeline**
- **Behavioral signals tracked**
- **Identification when contact info captured**
- **Anonymous tracking** s cookie

### 6.3 Pop-up types

- **Welcome pop-up** (new visitor)
- **Exit-intent** (leaving without purchase)
- **Scroll-triggered** (engaged with content)
- **Time-on-page** (X seconds)
- **Click-triggered** (clicked specific element)
- **Cart abandonment** (cart left)
- **Account-based** (specific segment match)

### 6.4 On-site personalization

- **Per-visitor content** display
- **Dynamic banners** based na segment
- **Product recommendations** widgets
- **Personalized hero images**
- **Customized CTAs**

### 6.5 A/B testing

- **Pop-up variants**
- **Form variants**
- **Banner variants**
- **CTA variants**
- **Audience subsets**
- **Conversion tracking**

---

## 7. Email Marketing & AI Email Design

### 7.1 Email Marketing capabilities

- **Standard newsletters** (bulk sends)
- **Dynamic 1-to-1 emails** s recommendations
- **Triggered emails** (automation-driven)
- **Transactional emails**
- **A/B testing**
- **Pre-built templates**
- **Custom HTML option**

### 7.2 AI Email Design Studio

**Innovative feature:**
- **AI generates email designs**
- **Per-recipient personalization**
- **Brand-consistent output**
- **Quick creation** (minutes vs. hours)
- **Customization possible**

### 7.3 Dynamic 1-to-1 emails

Per reference testimonial:
*"higher CTR and 206% higher OR for dynamic emails with 1-to-1 recommendations compared to mass emails"*

Per-recipient unique content:
- Product recommendations
- Dynamic blocks per profile
- Behavior-based content
- Predicted preferences

### 7.4 Email templates

- **Pre-built library**
- **Customizable**
- **Mobile-responsive**
- **Brand kit support**
- **Saved blocks**

### 7.5 Personalization

- **Variables** (custom fields)
- **Dynamic content blocks**
- **Conditional content**
- **Recommendation Frames** (AI)
- **Product Collections** integration
- **Loyalty data** display

### 7.6 A/B testing limitations

Per Capterra review:
*"more efficient A/B testing for email subjects (currently, multiple emails have to be created for testing)"*

⚠️ A/B testing **less efficient** než competitors – requires creating multiple emails vs. inline variant management.

### 7.7 Send-time optimization

- Time-zone send
- Send-time AI (per recipient v vyšších tierech)
- Throttled delivery

---

## 8. Marketing Automation (workflows)

### 8.1 Workflow builder

- **No-code drag & drop builder**
- **Visual canvas**
- **Multi-step sequences**
- **Branching conditions**
- **Multi-channel** (email + SMS + push + ads)
- **Real-time evaluation**

### 8.2 Triggers

#### Behavioral
- Visited specific page
- Viewed product
- Searched query
- Spent X time on site
- Clicked element

#### Transactional
- Cart abandoned
- Order placed
- Specific product purchased
- Refund / cancellation
- Subscription event

#### Email/SMS engagement
- Email opened
- Email clicked
- Link clicked
- SMS clicked

#### Date-based
- Birthday
- Anniversary
- Custom date
- Recurring dates

#### Score-based
- Engagement Score threshold
- Predictive score change
- Lead score reached

#### External
- API event
- Webhook
- CDP segment change

### 8.3 Actions (nodes)

#### Sending
- Send email
- Send SMS
- Send web push
- Send mobile push
- Show on-site banner / pop-up
- Display dynamic content

#### Contact manipulation
- Add / remove tag
- Update field
- Update Engagement Score
- Update audience
- Add / remove from list

#### Logic
- Wait (delay)
- Condition (if/else)
- A/B split
- Goal node
- Random split

#### External
- Webhook
- API call
- Sync to Facebook / Google Ads

### 8.4 Pre-defined frameworks

Per GetApp:
*"Pre-defined frameworks and an intuitive interface allow teams to execute complex strategies without extensive technical resources."*

**Pre-built frameworks** pro common use cases:
- Welcome series
- Cart abandonment
- Post-purchase
- Win-back
- Birthday campaigns
- VIP nurture
- Lifecycle automation
- Lead nurturing

### 8.5 Workflow examples

#### Cart abandonment
```
Trigger: Cart abandoned > 1h
   ↓
Wait 1h
   ↓
Send Email 1: Cart reminder s product images
   ↓
Wait 24h
   ↓
Condition: Purchased?
   YES → Exit
   NO → Send Email 2: Discount offer
   ↓
Wait 48h
   ↓
Condition: Purchased?
   YES → Exit
   NO → Send SMS final reminder
   ↓
Exit
```

#### VIP welcome
```
Trigger: Customer becomes VIP (LTV > threshold)
   ↓
Send Email: VIP welcome + exclusive benefits
   ↓
Wait 7 days
   ↓
Send personalized recommendations
   ↓
Wait 14 days
   ↓
Schedule live chat outreach
   ↓
Send loyalty program enrollment
   ↓
End
```

---

## 9. AI-driven personalization

Per oficiální:
*"AI-driven personalization" is core differentiator*

### 9.1 AI capabilities

- **Recommendation Frames** (AI product recommendations)
- **Product Collections** (Deep Behavioral Personalization)
- **AI Email Design Studio**
- **ChatGPT integration**
- **Machine Learning models** (CLV, churn, propensity)
- **Predictive analytics**
- **AI-driven content creation**

### 9.2 ChatGPT integration

Per LinkedIn material:
*"Chat GPT integration" listed as core feature*

Use cases:
- Email content generation
- Subject line suggestions
- Marketing copy creation
- Product descriptions
- Customer service responses

### 9.3 Deep Behavioral Personalization

Per LinkedIn:
*"Deep Behavioral Personalization - a concept... putting it to use with SALESmanago's new feature - Product Collections"*

**Captures all engagement signals:**
- Browse patterns
- Search queries
- Cart events
- Wishlists
- Purchase history
- Time-on-page
- Click sequences

→ Used pro hyper-personalized recommendations.

### 9.4 Predictive analytics

- **Customer Lifetime Value** (CLV)
- **Churn probability**
- **Next Purchase Date** (NPD)
- **Product affinity**
- **Engagement scoring**

### 9.5 AI Email Design Studio

- **AI generates email designs** based na prompt
- **Brand kit application** automatic
- **Per-segment variations**
- **A/B test variants generated**
- **Quick iteration**

---

## 10. Recommendation Frames

### 10.1 Recommendation Frames overview

**Proprietary AI recommendation engine.**

Used pro:
- Email recommendations (1-to-1)
- On-site widgets
- Web push content
- SMS link recommendations

### 10.2 Recommendation strategies

#### Collaborative filtering
- Customers like you bought X
- Based on aggregate behavior

#### Content-based
- Similar products
- Product attribute matching

#### Personalized ML
- Per-profile recommendations
- Browse + purchase history weighted

#### Trending
- Popular right now
- Per category

#### Cross-sell / Upsell
- Complementary products
- Higher-tier alternatives

#### Search-based
- Based na recent searches

### 10.3 Frame configuration

- **Drag-drop frame builder**
- **Strategy selection**
- **Item count configuration**
- **Filter criteria**
- **Fallback rules**

### 10.4 Reporting

- Performance per frame
- Click-through per recommendation
- Revenue attributed
- A/B test results

---

## 11. Product Collections (Deep Behavioral)

### 11.1 Product Collections

**Newer feature** (introduced 2024+) – per LinkedIn discussions.

**Captures complexity of customer-product interaction.**

### 11.2 Capabilities

- **Behavior-driven product grouping**
- **Real-time updates** based on browse patterns
- **Per-customer collections**
- **Multi-dimensional categorization**
- **Deep learning models**

### 11.3 Use cases

#### Personalized newsletter
- Each customer sees products from their behavioral collection
- Per-recipient unique product selection
- Higher conversion vs. bulk newsletter

#### Email recommendation blocks
- Dynamic product collection per email
- Auto-updated based on recent behavior

#### On-site personalization
- Show customer's specific collection on homepage
- Recommend new products fitting their pattern

### 11.4 Implementation

- **Live integration** demo'd in webinars
- **No-code configuration**
- **Real-time activation**
- **Performance tracking**

---

## 12. Zero-party data collection

### 12.1 Zero-party data

Per oficiální:
*"innovative tools like zero-party data collection"*

**Zero-party data** = data explicitly shared by customer (preferences, intentions).

### 12.2 Collection methods

#### Customer Preference Center
- Customer-managed preferences
- Topic preferences
- Frequency preferences
- Channel preferences
- Product category interests

#### Surveys + quizzes
- In-email surveys
- On-site quizzes
- "What's your style?" type questions

#### Progressive profiling
- Multi-step forms
- Gradual data collection
- Non-intrusive

#### Wishlists
- Explicit product interest
- Used pro recommendations

#### Personalization quizzes
- "Help us recommend better"
- Style preferences
- Use case preferences

### 12.3 Why zero-party matters

V era of cookieless future:
- **First-party data limited** (own website)
- **Third-party cookies disappearing**
- **Zero-party explicit consent** strongest signal
- **GDPR-friendly** by design
- **Predictive value high** (intent signals)

### 12.4 SALESmanago zero-party use

- Survey responses → segmentation
- Preference Center → channel + content control
- Quiz answers → personalization
- Wishlist → product recommendations

---

## 13. Omnichannel execution

### 13.1 Email

- Newsletters
- Dynamic 1-to-1
- Triggered automation emails
- Transactional
- A/B testing

### 13.2 SMS

- Bulk SMS campaigns
- Automation-driven SMS
- Two-way SMS (limited regions)
- Link tracking
- Personalization

### 13.3 Web Push

- **Notifications** to web browsers (Chrome, Firefox)
- Subscribed users get push messages
- Use cases:
  - Cart abandonment (silent push)
  - Promotional alerts
  - Stock alerts
  - Order updates

### 13.4 Mobile Push

- **iOS + Android app push**
- Requires app integration
- Rich notifications
- Deep linking

### 13.5 On-site banners + pop-ups

- Web Experience module
- Personalized per visitor

### 13.6 Digital Ads sync

- Facebook Custom Audiences
- Google Ads
- TikTok Ads
- Other platforms

### 13.7 Live chat (some configurations)

- Sales conversations
- Customer support
- AI-powered (some)

### 13.8 Cross-channel orchestration

- Same customer profile across channels
- Frequency caps cross-channel
- Channel preferences respected
- Coordinated messaging timing

---

## 14. Customer Preference Center

Per oficiální feature list.

### 14.1 Preference Center capabilities

- **Self-service portal** pro subscribers
- **Topic preferences** (what they want to receive)
- **Frequency preferences** (how often)
- **Channel preferences** (email, SMS, push)
- **Personal data** edit
- **Wishlist management**
- **Order history**
- **Loyalty status**

### 14.2 Configuration

- Custom design per brand
- Brand kit application
- Multi-language support
- Topic taxonomy per business
- Channel options per business

### 14.3 Use cases

- **Reduce unsubscribes** (per oficiální stat: ~70% opt out due to too many messages)
- **Increase engagement** s relevant content
- **Zero-party data** collection
- **GDPR compliance** (explicit consent)

### 14.4 Embed methods

- Link from email footer
- Profile page on website
- Account dashboard
- Direct URL

---

## 15. Reports & Analytics

### 15.1 Standard reports

#### Campaign reports
- Sent, delivered, bounced
- Opens, CTR
- Conversion rate
- Revenue attribution

#### Workflow reports
- Per-workflow performance
- Per-step metrics
- Goal achievement
- Drop-off analysis

#### CDP reports
- Audience size trends
- Segment performance
- Engagement Score distribution

#### E-commerce reports
- Revenue per campaign
- Per-segment revenue
- Top performing products
- Cart abandonment recovery rate

### 15.2 Dashboards

- **Email Marketing Dashboard**
- **Web Experience Dashboard**
- **CDP Dashboard**
- **Workflow Dashboard**
- **Revenue Dashboard**
- **Custom dashboards**

### 15.3 Critique on reporting

Per Capterra review:
*"expanded options for data extraction (e.g., you can extract data for users who opened an email but not for those who clicked)"*

⚠️ **Some data extraction limited** – not all metrics easily exportable.

### 15.4 Unified Data Analysis

Per oficiální:
*"Unified Data Analysis – Monitor and analyse website visitor behaviour, seamlessly integrating eCommerce data and tracking email interactions"*

Cross-channel reporting.

---

## 16. Integrations & API

### 16.1 Native integrations

#### E-commerce platforms
- **Shopify + Shopify Plus**
- **Magento** (Adobe Commerce)
- **WooCommerce**
- **BigCommerce**
- **PrestaShop**
- **Salesforce Commerce Cloud**
- Custom platforms

#### CRM systems
- **Salesforce** (CRM sync)
- **HubSpot CRM**
- **Microsoft Dynamics**

#### Ad platforms
- **Facebook Ads / Meta**
- **Google Ads**
- **TikTok Ads**
- **Other**

#### Other
- **Google Analytics**
- **Live chat** (various)
- **Zapier** (5 000+ apps)

### 16.2 API

- **REST API**
- **Detailed documentation**
- **Webhook events**
- **Batch + real-time endpoints**

### 16.3 Custom integrations

- **Custom development** projects available
- **Partner network** can help
- **Tracking script** + API combination
- **SFTP** bulk transfers

### 16.4 Implementation partners

**1 000+ reselling partners** internationally:
- **Polish partners** (largest)
- **DACH partners**
- **UK partners**
- **Spanish + Italian partners**
- **Latin American partners**

Partners often handle:
- Implementation
- Training
- Custom integrations
- Ongoing optimization
- Local language support

### 16.5 Partner critique

Per Capterra review:
*"A big advantage was the excellent support from the partner program account manager, who guided me step by step"*

Per critique:
*"There were some gaps in the integration when I started using it... I believe it would be helpful for the clients if SalesManago conducts a health check at the end of each integration."*

⚠️ **Integration health checks** sometimes missed.

---

## 17. Growth Framework + Growth Plan

### 17.1 Growth Framework

Per oficiální:
*"SALESmanago's Growth Framework offers a clear path to achieving your eCommerce goals of acquisition, conversion, and engagement, while delivering personalised experiences to customers and ensuring sustainable growth."*

**4 stages:**
1. **Acquisition** – attract
2. **Conversion** – sell
3. **Engagement** – relationship
4. **Loyalty & Scale** – growth

### 17.2 Custom Growth Plan

Per oficiální:
*"starting with a custom Growth Plan tailored to your business"*

**Per-customer custom roadmap:**
- Strategic assessment
- KPI alignment
- Tool selection
- Implementation phases
- Success metrics
- Ongoing optimization

### 17.3 Why this matters

- **Strategic partnership** approach
- **Not just tool sale**
- **Outcomes-focused**
- **Consultative engagement**

---

## 18. Partner program (1000+ resellers)

### 18.1 Partner network

**1 000+ reselling partners** internationally.

Partner types:
- **Digital agencies**
- **Marketing automation specialists**
- **E-commerce consultancies**
- **System integrators**

### 18.2 Partner benefits

- **Reseller margins** / commissions
- **Co-branded marketing**
- **Training + certifications**
- **Dedicated partner manager**
- **Lead sharing**
- **Joint sales support**

### 18.3 Partner-managed clients

Many clients onboarded via partners:
- **Partner handles implementation**
- **Partner provides ongoing support**
- **Partner-specific account managers**
- **Joint quarterly reviews**

### 18.4 Geographic reach

**1 000+ partners across 50+ countries:**
- Poland (largest)
- DACH
- UK + Ireland
- Iberia (Spain, Portugal)
- France + Benelux
- Italy
- CEE (Czech, Slovak, Hungary, Romania)
- Latin America
- Middle East
- Asia Pacific (growing)

---

## 19. Compliance, GDPR, EU hosting

### 19.1 EU hosting

Per oficiální:
*"EU-based and GDPR-compliant – As a European provider, we ensure all data remains within the EU, offering industry-leading compliance and security."*

⚠️ Crunchbase listing indicates **U.S. Server Location** – ale oficiální materiály claim EU. Pravděpodobně **multi-region** s primary EU.

### 19.2 GDPR features

- **GDPR consent fields** v forms
- **Per-channel consent**
- **Double opt-in** support
- **Audit trail** per consent
- **Right to be Forgotten**:
  - UI: contact delete
  - API: DELETE endpoint
- **Data export per subscriber**
- **DPA available**

### 19.3 Customer Preference Center

- Self-service preference management
- Easy unsubscribe
- Channel-specific preferences
- GDPR-aligned

### 19.4 Compliance certifications

- **GDPR compliant**
- **ISO 27001** (typical for enterprise CDPs)
- **SOC 2** (likely – ověřit s vendorem)
- **CCPA** (likely)

### 19.5 Industry-specific compliance

- **PCI compliance** (for payment data)
- **Healthcare** depending on configuration
- **Financial services** depending

### 19.6 Security features

- **2FA / MFA**
- **API key management**
- **Encryption** at rest + in transit
- **Role-based access**
- **Audit logs**
- **EU data residency** option

---

## 20. Limity a nedostatky

### 20.1 Accessibility

- **No self-serve sign-up**
- **No public pricing** transparent (od €199 entry, ale custom)
- **Sales-driven model**
- **Long sales cycle** (mid-market+)
- **No free plan**
- **Custom contracts** required

### 20.2 Post-acquisition challenges

Per Software Advice review:
*"Over the past three years, following the acquisition, SALESmanago has undergone significant shifts in strategy, personnel, board composition, and management—changes that at times made collaboration more difficult."*

⚠️ **Acquisition by SilverTree Equity** caused some growing pains. Per review further: *"We felt some growing pains, but we understood this was a necessary step for a company aiming to make major strides."*

### 20.3 Complexity

- **Steep learning curve** v některých částech
- *"Not all features are intuitive at first"* (Capterra)
- **Requires training + workshops**
- **Better s partner support**

### 20.4 A/B testing limitations

Per review:
*"more efficient A/B testing for email subjects (currently, multiple emails have to be created for testing)"*

⚠️ A/B testing **less efficient** než competitors.

### 20.5 Reporting / data extraction

Per review:
*"expanded options for data extraction (e.g., you can extract data for users who opened an email but not for those who clicked)"*

⚠️ **Granular data extraction** sometimes limited.

### 20.6 Mass management

Per review:
*"simpler, faster mass management of tags and user details"*

⚠️ **Bulk operations** sometimes slow / unwieldy.

### 20.7 Integration health gaps

Per review:
*"I wasn't involved during the initial tool implementation, but there were some gaps in the integration when I started using it... it would be helpful for the clients if SalesManago conducts a health check at the end of each integration. This could include verifying if purchases are being sent correctly, ensuring dashboards are tracking them properly, etc."*

⚠️ **Integration health checks** sometimes missed, leading to data gaps.

### 20.8 Customization complexity

For non-typical use cases (non-e-commerce):
*"we needed a more customized approach, and SalesManago introduced several improvements for us over a few months"*

⚠️ Less polished pro **non-e-commerce** use cases (B2B services, content businesses).

### 20.9 Czech / Slovak localization limits

- **English + Polish** primary
- **Czech / Slovak** UI limited
- Documentation primarily English

### 20.10 SMS features less intuitive

Per review:
*"Not all features are intuitive at first, especially when it comes to SMS campaigns."*

### 20.11 Less feature-rich vs. Klaviyo

- **Less polished Shopify integration** než Klaviyo
- **Fewer pre-built templates** než Klaviyo flows
- **Less e-commerce-specific** features (Klaviyo's DTC focus deeper)

### 20.12 Less enterprise vs. SAP Emarsys

- **Less Gartner positioning** (no Magic Quadrant leadership)
- **Less SAP ecosystem** integration
- **Smaller scale** (3 000+ klientů vs. SAP's enterprise)

### 20.13 Migration challenges

- **Workflows non-exportable** to other platforms
- **Custom CDP attributes** SALESmanago-specific
- **Templates rebuild** required

### 20.14 No webinars / courses native

- No built-in webinars (vs. GetResponse)
- No online courses
- No paid newsletters
- No digital products sale

### 20.15 No autonomous AI agents (yet)

- **AI features** strong but mostly rule-based + ML
- **No autonomous agents** (vs. Klaviyo Customer Agent, HubSpot Breeze)
- **AI roadmap evolving**

---

## 21. Shrnutí: Pro koho a proti komu

### SALESmanago je dobrá volba pokud
- Provozujete **mid-market e-commerce** (50K+ kontaktů)
- Potřebujete **CDP + Marketing Automation v jedné platformě**
- Cíl je **AI-driven personalization** at scale
- Provozujete **fashion / beauty / retail / jewelry**
- Hledáte **EU-based + GDPR-compliant** platform
- Pracujete v **CEE / Polsko / DACH** region (largest partner presence)
- Vyžadujete **no-code platform** pro marketing teams
- Cíl je **deep behavioral personalization**
- Hledáte **strategic partnership** s Growth Plan approach
- Provozujete **multi-channel** (email + SMS + web push + ads)
- Máte budget **€199+/měsíc** rostoucí s growth
- Pracujete s **partnerem / agency** (1 000+ partner network)
- Cíl je **zero-party data collection**
- Provozujete **subscription / loyalty** programs

### SALESmanago není dobrá volba pokud
- Jste **small business / startup** – sales-driven model je friction
- Hledáte **self-serve freemium** – Mailchimp, MailerLite, Ecomail lepší
- Provozujete **pure DTC Shopify** s deep integration needs – Klaviyo silnější
- Hledáte **transparent public pricing** – SALESmanago custom only
- Potřebujete **deep B2B CRM** – HubSpot, ActiveCampaign lepší
- Provozujete **pure content / publishing** – Substack, Beehiiv, Kit lepší
- Potřebujete **best-in-class deliverability** s premium reputation – Mailkit, SAP Emarsys
- Hledáte **autonomous AI agents** – Klaviyo Customer Agent dál
- Provozujete **webinars + courses** built-in – GetResponse lepší
- **Czech-only operations** – Ecomail / SmartEmailing lepší native CZ
- Hledáte **enterprise Salesforce ecosystem** – Salesforce Marketing Cloud
- Hlavní jazyk je **Czech / Slovak** – limited localization

### SALESmanago vs. konkurence

| Konkurence | Kdy lepší než SALESmanago |
|---|---|
| **Klaviyo** | Pure DTC Shopify, transparent pricing, autonomous AI agents |
| **HubSpot** | Full B2B CRM, multi-Hub, marketing+sales+service |
| **Brevo** | Volume-based pricing, transactional v base, simpler SMB |
| **ActiveCampaign** | Deeper automation engine, integrated CRM s deals/pipelines |
| **Mailchimp** | Brand recognition, self-service, free plan |
| **MailerLite** | Solopreneur simplicity, content creators |
| **SAP Emarsys** | Pure enterprise B2C retail, omnichannel scale, Gartner Leader |
| **Bloomreach Engagement** | CZ origin, deep content personalization, DTC |
| **GetResponse** | Webinars + courses + 27 languages incl. CZ/SK |
| **ExpertSender** | Polský origin, similar mid-market focus |
| **Adobe Journey Optimizer** | Adobe Experience Cloud ecosystem |
| **Braze** | App-first mobile companies, real-time messaging |
| **Bloomreach** | DTC content personalization, Czech origin |
| **Ecomail / SmartEmailing** | Pure CZ/SK market with native localization |

---

*Dokument zpracován z oficiálních zdrojů salesmanago.com a praktických zdrojů (G2, Capterra, GetApp, SoftwareAdvice, Crunchbase, LinkedIn customer testimonials). Pro nejaktuálnější detaily je nutný engagement s SALESmanago sales teamem.*
