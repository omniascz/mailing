# CDP Capabilities Deep Dive – 27 platforem srovnání 2026

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Kdo je skutečný CDP (Customer Data Platform), kdo je jen email tool s tagy. Analýza CDP capabilities napříč všemi 27 platformami pokrytými v sérii.
**Zdroje:** oficiální dokumentace per platforma, G2 reviews, CDP Institute, Gartner CDP Magic Quadrant 2025, vlastní deep-dive dokumenty 01-54.

> **TL;DR:** "CDP" je v 2026 marketingová zkratka, kterou používá kdekdo. Skutečný CDP má jen 7 platforem z 27. Většina ostatních jsou **email tools s tagy a lists**, což není to samé. Tento dokument říká, kdo je co a proč na tom záleží.

---

## Obsah

1. [Co je skutečný CDP (definice CDP Institute)](#1-definice)
2. [Klasifikace 27 platforem (3 tiers)](#2-klasifikace)
3. [Tier 1: Skutečné CDP (7 platforem)](#3-tier-1)
4. [Tier 2: CDP-lite / Hybrid (7 platforem)](#4-tier-2)
5. [Tier 3: Email tool s tagy (13 platforem)](#5-tier-3)
6. [CDP capability matrix](#6-capability-matrix)
7. [Identity resolution: kdo to umí](#7-identity-resolution)
8. [Real-time profile updates](#8-real-time)
9. [Multi-source data ingestion](#9-multi-source)
10. [Predictive scoring (CLV, churn)](#10-predictive)
11. [Activation napříč kanály](#11-activation)
12. [Consent management + GDPR](#12-consent)
13. [Klíčové rozdíly: CDP vs. CRM vs. Email tool](#13-rozdily)
14. [Doporučení podle CDP potřeb](#14-doporuceni)

---

## 1. Co je skutečný CDP (definice CDP Institute)

### 1.1 Per CDP Institute (David Raab, founder)

> _"A Customer Data Platform is packaged software that creates a persistent, unified customer database that is accessible to other systems."_

### 1.2 Tři klíčové pilíře CDP

```
CDP MUSÍ MÍT:

1. PACKAGED SOFTWARE
   - Out-of-box product
   - Ne custom build
   - Ne data warehouse alone
   - Vendor-managed

2. PERSISTENT UNIFIED DATABASE
   - Permanent customer profiles
   - Cross-source integration
   - 360° view
   - Always-on availability

3. ACCESSIBLE TO OTHER SYSTEMS
   - APIs first-class
   - Activation napříč kanály
   - Real-time data export
   - Bi-directional flows
```

### 1.3 CDP vs. data warehouse vs. CRM vs. DMP

```
CDP:
- Customer-focused
- Identified individuals (1st party)
- Persistent unified profile
- Marketer-friendly (no SQL needed)
- Activation focus

CRM:
- Sales-focused
- Known accounts/contacts
- Manual data entry
- Sales process tracking
- Account/deal records

DATA WAREHOUSE:
- All business data
- BI/analytics focus
- Engineer-managed
- Query-heavy
- Not real-time typically

DMP (Data Management Platform):
- Anonymous audiences
- 3rd party cookies (dying)
- Ad targeting focus
- Aggregated data
- Less GDPR-friendly
```

### 1.4 CDP capabilities full stack

```
COMPLETE CDP STACK:

1. DATA INGESTION
   - SDK + API + Batch
   - Online + Offline data
   - Real-time + Batch
   - Multi-source

2. IDENTITY RESOLUTION
   - Multi-device matching
   - Deterministic + Probabilistic
   - Cross-channel identity
   - Anonymous → Known

3. UNIFIED PROFILE
   - 360° customer view
   - Behavioral history
   - Transactional data
   - Preferences + consent

4. SEGMENTATION
   - Real-time updating
   - Behavioral
   - Predictive
   - Custom rules

5. PREDICTIVE ANALYTICS
   - LTV
   - Churn risk
   - Purchase propensity
   - Next-best action

6. ACTIVATION
   - Email/SMS/Push/Web/Ads
   - Real-time triggers
   - Cross-channel orchestration

7. CONSENT MANAGEMENT
   - GDPR compliance
   - ePrivacy
   - Multi-jurisdiction
   - Audit trails

8. REPORTING
   - Cross-channel attribution
   - Customer journey
   - Cohort analysis
   - Custom dashboards
```

---

## 2. Klasifikace 27 platforem (3 tiers)

### 2.1 Quick reference

```
TIER 1: SKUTEČNÉ CDP (7 platforem)
- Bloomreach Engagement
- SAP Emarsys
- Salesforce Data 360 + MC
- Mapp/Evalanche
- SALESmanago
- Targito
- Braze (CDP-like, debate)

TIER 2: CDP-LITE / HYBRID (7 platforem)
- HubSpot
- Klaviyo
- ActiveCampaign
- Leadhub
- ExpertSender
- Brevo
- Inxmail

TIER 3: EMAIL TOOL S TAGY (13 platforem)
- Mailchimp
- MailerLite
- GetResponse
- Constant Contact
- Ecomail
- SmartEmailing
- Mailkit
- CleverReach
- rapidmail
- Boldem
- Newsletter2Go
- SARE
- EmailLabs
```

### 2.2 Klíčový test "jsem CDP?"

```
TEST: Vyplň tabulku per platforma

✅ Persistent database (ne email-centric)?
✅ Identity resolution (multi-device)?
✅ Real-time profile updates (<100ms)?
✅ Multi-source ingestion (online+offline)?
✅ Predictive scoring native?
✅ Cross-channel activation?
✅ Marketer-friendly (no SQL)?

7/7 = TIER 1 CDP
4-6/7 = TIER 2 CDP-lite
0-3/7 = TIER 3 email tool s tagy
```

---

## 3. Tier 1: Skutečné CDP (7 platforem)

### 3.1 Bloomreach Engagement – Customer Data Engine (CDE)

```
CDP MATURITY: ✅✅✅ TOP TIER

PER OFICIÁLNÍ:
"When you buy Marketing Automation you get access
to our customer data engine (CDE), which combines
data unification, identity resolution, and other
CDP capabilities with journey orchestration, AI,
and marketing analytics."

KEY FEATURES:
- Ground-up CDP architecture (Exponea origin 2016)
- In-memory framework (real-time)
- Multi-source ingestion (online + offline + custom)
- Identity resolution (deterministic + probabilistic)
- 360° customer profiles
- Predictive analytics (CLV, churn, propensity)
- Real-time activation
- Marketer-friendly UI (drag & drop)
- Standalone CDP option (separate from MA)

USE CASES:
- MALL.CZ (CZ ecom)
- HP Tronic/Datart (CZ + SK)
- SIKO (CZ koupelny)
- Allwyn/Sazka (lottery)
- American Eagle, JD Sports, Pandora (global)

VERDIKT:
- Reference CDP pro mid-market+ ecommerce
- "Most loved CDP" claim (Raj De Datta, CEO)
- Implementation: 6-12 měsíců
- Pricing: $3K+/mo typical
```

### 3.2 SAP Emarsys – Customer Engagement Platform

```
CDP MATURITY: ✅✅✅ TOP TIER (retail focus)

KEY FEATURES:
- Native CDP integrated s omnichannel
- SAP backend integration (post-2020)
- Retail-specific data model
- Smart Insights AI
- Loyalty integration native
- Multi-touch attribution
- Predictive segments
- Real-time triggers

USE CASES:
- Tesco CE, Aldi, Lidl (DACH retail)
- CZ retail (Albert?)
- Global retailers 1500+

VERDIKT:
- Best for DACH retail enterprise
- SAP ecosystem advantage
- Implementation: 6-12 měsíců
- Pricing: $5K+/mo
```

### 3.3 Salesforce Data 360 + Marketing Cloud

```
CDP MATURITY: ✅✅✅ TOP TIER (enterprise)

KEY FEATURES:
- Data Cloud (formerly CDP)
- Unified data napříč Salesforce ecosystem
- Genie real-time engine
- Einstein AI integration
- Agentforce AI agents
- Cross-cloud activation
- Marketing Cloud Personalization

USE CASES:
- T-Mobile CZ, KB, Vodafone
- Banks, telcos, large enterprises
- Multi-cloud customers

VERDIKT:
- King of enterprise CDP
- Vendor lock-in (Salesforce CRM)
- Implementation: 6-12+ měsíců
- Pricing: $$$$ enterprise
- Multiple SKUs confusion
```

### 3.4 Mapp/Evalanche – DACH CDP

```
CDP MATURITY: ✅✅✅ TOP TIER (DACH)

KEY FEATURES:
- Mapp Cloud platform
- DACH-strict GDPR
- B2B + B2C use cases
- Predictive analytics
- Customer journey orchestration
- Real-time activation

USE CASES:
- Sixt, ImmoScout24
- dm-drogerie markt
- DACH enterprise

VERDIKT:
- Best DACH enterprise CDP
- GDPR fortress
- Implementation: 6-12 měsíců
- Pricing: enterprise quote
```

### 3.5 SALESmanago – CEE CDP

```
CDP MATURITY: ✅✅✅ TOP TIER (CEE)

KEY FEATURES:
- CDP foundation built-in
- AI Studio integrated
- Customer Intelligence Platform
- Behavioral tracking native
- Cross-channel activation
- CEE language support

USE CASES:
- Notino (CZ/PL beauty)
- Tipsport (CZ sports betting)
- MIBO Allegro
- PL CEE enterprise

VERDIKT:
- Best CEE mid-market CDP
- AI-first positioning
- Implementation: 3-6 měsíců
- Pricing: $1K+/mo
- Some sales tactics criticism
```

### 3.6 Targito – CZ CDP

```
CDP MATURITY: ✅✅ STRONG (CZ-focused)

KEY FEATURES:
- "Nejpoužívanější CDP v ČR" claim
- Per Sherpas Tech research (313 e-shops sample)
- Czech-built CDP
- Omnichannel orchestration
- Targito AI (2024 launch)
- 40+ activatable modules

USE CASES:
- ZOOT (CZ fashion)
- Bonami (CZ home goods)
- UniCredit Group (banking)
- SG Furniture

VERDIKT:
- Best CZ-built CDP option
- Mid-market sweet spot
- Implementation: 6-12 týdnů
- Pricing: custom (sales-driven)
- Limited internationally
```

### 3.7 Braze – CDP-like

```
CDP MATURITY: ✅✅ STRONG (debate: CDP or CEP?)

KEY FEATURES:
- Customer Engagement Platform (CEP)
- Real-time data ingestion at scale
- Identity resolution
- Mobile-first focus
- Massive scale (TB events/day)
- Sage AI integration

USE CASES:
- Tinder, Headspace, IBM, HBO Max
- Anthropic
- High-scale apps

VERDIKT:
- More CEP than pure CDP
- Best for mobile-first scale
- Implementation: 6-12 měsíců
- Pricing: $$$$ enterprise
```

---

## 4. Tier 2: CDP-Lite / Hybrid (7 platforem)

### 4.1 HubSpot – CRM with CDP features

```
CDP MATURITY: ✅✅ HYBRID

KEY POINTS:
- CRM-first, CDP-second
- Customer Platform (2024 rebrand)
- Unified data napříč Hubs (Marketing, Sales, Service)
- Breeze AI integration
- Limited multi-source vs. true CDP
- B2B focus (not best for B2C ecom)

CDP CAPABILITIES:
✅ Persistent profiles (CRM-style)
✅ Some identity resolution
✅ Real-time updates (in-platform)
⚠️ Limited multi-source (vs. true CDP)
✅ Some predictive (Breeze AI)
✅ Activation napříč Hubs
✅ Marketer-friendly UI

VERDIKT:
- "CDP-aware CRM"
- Strong B2B sweet spot
- Less suitable for high-volume B2C ecom
```

### 4.2 Klaviyo – DTC CDP

```
CDP MATURITY: ✅✅ HYBRID (DTC focus)

KEY POINTS:
- Ecommerce-focused CDP
- Deep Shopify integration
- Real-time profile updates
- Behavioral tracking native
- Predictive analytics strong (CLV, churn)
- Activation focus (email + SMS + push)

CDP CAPABILITIES:
✅ Persistent profiles
✅ Identity resolution (cookies + email)
✅ Real-time updates
⚠️ Multi-source limited (ecom focus)
✅ Predictive strong (industry leader DTC)
✅ Multi-channel activation
✅ Marketer-friendly

VERDIKT:
- Best DTC ecommerce "CDP"
- Não is true enterprise CDP
- 250 000+ customers
```

### 4.3 ActiveCampaign – CRM + Marketing Automation

```
CDP MATURITY: ✅ LITE HYBRID

KEY POINTS:
- CRM-style contact database
- Strong automation
- Some predictive features
- Less true CDP
- B2B + B2C mid-market

CDP CAPABILITIES:
✅ Persistent profiles
✅ Some identity resolution
✅ Real-time triggers
⚠️ Multi-source limited
✅ Some predictive
✅ Multi-channel activation
✅ Marketer-friendly

VERDIKT:
- CRM + MA combo
- Less true CDP than Klaviyo
- Better automation depth
```

### 4.4 Leadhub – CZ CDP-lite

```
CDP MATURITY: ✅✅ HYBRID (CZ)

KEY POINTS:
- CZ mid-market focus
- CDP capabilities native
- Pokročilá personalization
- Limited internationally

CDP CAPABILITIES:
✅ Customer profiles unified
✅ Identity resolution basic
✅ Real-time updates
⚠️ Multi-source limited
⚠️ Predictive limited
✅ Multi-channel
✅ Marketer-friendly CZ

VERDIKT:
- CZ-only realisticky
- Mid-market CDP option
- Lokální podpora
```

### 4.5 ExpertSender – Enterprise data

```
CDP MATURITY: ✅ LITE

KEY POINTS:
- Enterprise B2C focus
- PL origin
- Data-driven personalization
- Less true CDP architecture
- Strong deliverability

CDP CAPABILITIES:
✅ Customer profiles
⚠️ Identity resolution basic
✅ Some real-time
⚠️ Multi-source limited
✅ Some predictive (AI scoring)
✅ Email + SMS activation
✅ Marketer-friendly

VERDIKT:
- Strong B2C enterprise email
- Less true CDP
- PL/CEE market focus
```

### 4.6 Brevo – Light CDP

```
CDP MATURITY: ✅ LITE

KEY POINTS:
- All-in-one platform
- CRM features native
- Some CDP capabilities
- SMB-mid focus
- Cheap pricing model

CDP CAPABILITIES:
✅ Persistent contacts
⚠️ Identity resolution basic
✅ Some real-time
⚠️ Multi-source limited
⚠️ Predictive lite
✅ Multi-channel
✅ Marketer-friendly

VERDIKT:
- Light CDP capabilities
- SMB-mid sweet spot
- Better than pure email tools
```

### 4.7 Inxmail – B2B data

```
CDP MATURITY: ✅ LITE (B2B)

KEY POINTS:
- DACH B2B enterprise
- Od 1999!
- B2B-specific data model
- Account-based marketing

CDP CAPABILITIES:
✅ B2B customer profiles
⚠️ Identity resolution B2B-style
✅ Some real-time
⚠️ Multi-source limited
✅ Some predictive
✅ Email-focused activation
✅ Marketer-friendly DACH

VERDIKT:
- B2B-focused "CDP"
- Less true CDP architecture
- Strong DACH B2B option
```

---

## 5. Tier 3: Email Tool s Tagy (13 platforem)

### 5.1 Charakteristika Tier 3

```
TIER 3 = EMAIL TOOL S TAGY:

CO MAJÍ:
- Contact database (email-centric)
- Tags + lists
- Basic segmentation
- Email campaigns
- Some automation
- Web tracking (basic)
- ESP reporting

CO NEMAJÍ:
- True identity resolution
- Multi-device matching
- Real-time profile updates < 100ms
- Multi-source ingestion
- Cross-channel orchestration
- Native predictive (mostly)
- True CDP architecture

ANO, "CRM-like" features, ALE
✗ NE skutečný CDP
```

### 5.2 Per platform breakdown

```
MAILCHIMP:
- CDP capabilities: minimální
- "Audience" = list (ne CDP)
- "Customer Journey Builder" = workflow
- Some predictive (Standard+)
- Marketing CRM (lite)
→ EMAIL TOOL

MAILERLITE:
- CDP capabilities: minimální
- Subscriber lists
- Some segmentation
- Limited predictive
→ EMAIL TOOL

GETRESPONSE:
- CDP capabilities: limited
- Lists + segments
- Some automation
- Webinars + funnels (unique)
→ EMAIL TOOL+ (funnels)

CONSTANT CONTACT:
- CDP capabilities: minimální
- Marketing CRM (lite, Premium)
- Limited automation
- "Audiences" = lists
→ EMAIL TOOL

ECOMAIL:
- CDP capabilities: lite
- Cross-channel limited
- CZ/SK focus
- Some automation
→ EMAIL TOOL+

SMARTEMAILING:
- CDP capabilities: lite
- Funnels + automation
- Mergado integrace
- CZ klasika
→ EMAIL TOOL+ (funnels)

MAILKIT:
- CDP capabilities: limited
- Deliverability focus
- Less automation
- CZ profesionálové
→ EMAIL TOOL (deliverability specialista)

CLEVERREACH:
- CDP capabilities: limited
- DACH SMB-mid
- Lists + automation
→ EMAIL TOOL

RAPIDMAIL:
- CDP capabilities: minimální
- DACH GDPR-strict
- Lists primarily
→ EMAIL TOOL

BOLDEM:
- CDP capabilities: minimální
- CZ SMB
- Lists + basic automation
→ EMAIL TOOL

NEWSLETTER2GO:
- = Brevo Engage
- Brevo capabilities apply
→ EMAIL TOOL+ (via Brevo)

SARE:
- CDP capabilities: limited
- PL enterprise B2C
- Mobile + email
→ EMAIL TOOL+ (mobile)

EMAILLABS:
- API-first transactional
- CDP NOT primary
- Deliverability focus
→ TRANSACTIONAL ESP
```

---

## 6. CDP Capability Matrix

### 6.1 Detailní capability scoring

| Platforma               | Persistent | Identity Resolution | Real-time | Multi-source | Predictive | Activation |   UI   |
| ----------------------- | :--------: | :-----------------: | :-------: | :----------: | :--------: | :--------: | :----: |
| **Bloomreach**          |   ✅✅✅   |       ✅✅✅        |  ✅✅✅   |    ✅✅✅    |   ✅✅✅   |   ✅✅✅   | ✅✅✅ |
| **SAP Emarsys**         |   ✅✅✅   |       ✅✅✅        |  ✅✅✅   |    ✅✅✅    |   ✅✅✅   |   ✅✅✅   |  ✅✅  |
| **Salesforce Data 360** |   ✅✅✅   |       ✅✅✅        |  ✅✅✅   |    ✅✅✅    |   ✅✅✅   |   ✅✅✅   |  ✅✅  |
| **Mapp/Evalanche**      |   ✅✅✅   |       ✅✅✅        |   ✅✅    |     ✅✅     |    ✅✅    |   ✅✅✅   |  ✅✅  |
| **SALESmanago**         |   ✅✅✅   |        ✅✅         |  ✅✅✅   |     ✅✅     |   ✅✅✅   |   ✅✅✅   |  ✅✅  |
| **Targito**             |    ✅✅    |        ✅✅         |   ✅✅    |     ✅✅     |     ✅     |    ✅✅    |  ✅✅  |
| **Braze**               |   ✅✅✅   |        ✅✅         |  ✅✅✅   |    ✅✅✅    |    ✅✅    |   ✅✅✅   |  ✅✅  |
| **HubSpot**             |    ✅✅    |        ✅✅         |   ✅✅    |      ✅      |    ✅✅    |    ✅✅    | ✅✅✅ |
| **Klaviyo**             |    ✅✅    |        ✅✅         |   ✅✅    |     ✅✅     |   ✅✅✅   |    ✅✅    | ✅✅✅ |
| **ActiveCampaign**      |    ✅✅    |         ✅          |   ✅✅    |      ✅      |    ✅✅    |    ✅✅    |  ✅✅  |
| **Leadhub**             |    ✅✅    |         ✅          |   ✅✅    |      ✅      |     ✅     |    ✅✅    |  ✅✅  |
| **ExpertSender**        |     ✅     |         ✅          |    ✅     |      ✅      |     ✅     |    ✅✅    |   ✅   |
| **Brevo**               |     ✅     |         ✅          |    ✅     |      ✅      |     ✅     |    ✅✅    |  ✅✅  |
| **Inxmail**             |     ✅     |         ✅          |    ✅     |      ✅      |     ✅     |     ✅     |   ✅   |
| **Mailchimp**           |     ✅     |         ❌          |    ✅     |      ❌      |     ✅     |     ✅     |  ✅✅  |
| **MailerLite**          |     ✅     |         ❌          |    ✅     |      ❌      |     ❌     |     ✅     |  ✅✅  |
| **GetResponse**         |     ✅     |         ❌          |    ✅     |      ❌      |     ✅     |     ✅     |  ✅✅  |
| **Constant Contact**    |     ✅     |         ❌          |    ❌     |      ❌      |     ✅     |     ✅     |   ✅   |
| **Ecomail**             |     ✅     |         ❌          |    ✅     |      ❌      |     ❌     |     ✅     |   ✅   |
| **SmartEmailing**       |     ✅     |         ❌          |    ✅     |      ❌      |     ❌     |     ✅     |   ✅   |
| **Mailkit**             |     ✅     |         ❌          |    ❌     |      ❌      |     ❌     |     ✅     |   ✅   |
| **CleverReach**         |     ✅     |         ❌          |    ✅     |      ❌      |     ❌     |     ✅     |   ✅   |
| **rapidmail**           |     ✅     |         ❌          |    ❌     |      ❌      |     ❌     |     ✅     |   ✅   |
| **Boldem**              |     ✅     |         ❌          |    ❌     |      ❌      |     ❌     |     ✅     |   ✅   |
| **Newsletter2Go**       |     ✅     |         ❌          |    ✅     |      ❌      |     ❌     |     ✅     |   ✅   |
| **SARE**                |     ✅     |         ❌          |    ✅     |      ❌      |     ❌     |     ✅     |   ✅   |
| **EmailLabs**           |     ✅     |         ❌          |    ❌     |      ❌      |     ❌     |     ✅     | – API  |

**Score 14-21 = TIER 1 CDP**
**Score 8-13 = TIER 2 CDP-lite**
**Score 0-7 = TIER 3 Email tool**

---

## 7. Identity Resolution: kdo to umí

### 7.1 Identity resolution levels

```
LEVEL 0: ŽÁDNÉ
- Pouze email-based identity
- 1 email = 1 customer
- Žádný cross-device matching
- Anonymous = lost

LEVEL 1: BASIC
- Email primary
- Cookie tracking (single device)
- Manual merge possible
- Limited probabilistic

LEVEL 2: DETERMINISTIC
- Email + Phone + Customer ID
- Login-based matching
- Cookie-to-known mapping
- Cross-device když login

LEVEL 3: PROBABILISTIC
- Device fingerprinting
- Behavioral matching
- IP + UA + timing
- Cross-device bez login
- Configurable rules

LEVEL 4: ADVANCED ML
- Machine learning identity graph
- Multi-touch attribution
- Anonymous-to-known journey
- Confidence scoring
- Continuous learning
```

### 7.2 Per platform identity resolution

```
LEVEL 4 (Advanced ML):
- Bloomreach Engagement
- SAP Emarsys
- Salesforce Data 360
- Braze (mobile focus)

LEVEL 3 (Probabilistic):
- Mapp/Evalanche
- SALESmanago

LEVEL 2 (Deterministic):
- Klaviyo
- HubSpot
- ActiveCampaign
- Targito
- Leadhub

LEVEL 1 (Basic):
- Brevo, Inxmail, ExpertSender
- Newsletter2Go

LEVEL 0 (None):
- Mailchimp, MailerLite, GetResponse
- Constant Contact, Ecomail
- SmartEmailing, Mailkit
- CleverReach, rapidmail
- Boldem, SARE, EmailLabs
```

### 7.3 Proč to záleží

```
DŮSLEDEK Level 0-1:
- "Customer" je vlastně email address
- Anonymous visitor = ztracen
- Multi-device = duplicate profile
- Cross-channel orchestration = limit
- Reporting attribution = limit

DŮSLEDEK Level 3-4:
- Customer = real person
- Anonymous → Known journey
- True multi-device tracking
- Cross-channel orchestration
- Sophisticated attribution
```

---

## 8. Real-time Profile Updates

### 8.1 Real-time tiers

```
TIER A: < 100ms (true real-time)
- Bloomreach Engagement (in-memory framework)
- SAP Emarsys
- Salesforce Genie
- Braze (real-time at scale)

TIER B: < 1s
- Klaviyo
- SALESmanago
- HubSpot
- Mapp/Evalanche

TIER C: < 10s
- ActiveCampaign
- Brevo
- Targito
- Leadhub
- ExpertSender

TIER D: < 1min (near-real-time)
- Mailchimp
- MailerLite
- GetResponse
- Most Tier 3

TIER E: Batch (minutes-hours)
- Constant Contact
- Older platforms
- Some Tier 3 only
```

### 8.2 Proč real-time záleží

```
USE CASES vyžadující < 100ms:
- Web personalization on-page
- Real-time recommendations
- Cart abandonment instant
- Geofencing triggers
- High-frequency interactions

USE CASES OK s < 1s:
- Email triggers
- SMS triggers
- Push notifications
- Most marketing automation

USE CASES OK s batch:
- Newsletter sending
- Weekly campaigns
- Daily digest
- Periodic reports
```

---

## 9. Multi-source Data Ingestion

### 9.1 Source types

```
ONLINE SOURCES:
- Website (JavaScript SDK)
- Mobile app (iOS + Android SDKs)
- E-commerce platform (Shopify, WooCommerce, etc.)
- Email tools (legacy)
- Social media (Facebook, Instagram)
- Chat platforms (Intercom, Zendesk)
- Web forms

OFFLINE SOURCES:
- POS (in-store)
- ERP systems (SAP, Microsoft Dynamics)
- CRM (Salesforce, HubSpot)
- Loyalty programs
- Call center logs
- Direct mail responses
- Event attendance

THIRD-PARTY:
- Ad platforms (Google, Meta)
- Reviews + ratings
- Survey data
- Market research
- Lookalike audiences

CUSTOM:
- Any API source
- Webhook ingestion
- Batch imports
- Real-time streams
```

### 9.2 Per platform multi-source

```
COMPREHENSIVE (Tier 1):
- Bloomreach: ✅✅✅ all + custom
- SAP Emarsys: ✅✅✅ all + SAP
- Salesforce Data 360: ✅✅✅ all + Salesforce
- Braze: ✅✅✅ all + mobile SDKs
- Mapp: ✅✅✅
- SALESmanago: ✅✅
- Targito: ✅✅ all CZ tools

MODERATE (Tier 2):
- HubSpot: ✅ all HubSpot + integrations
- Klaviyo: ✅ ecom + email
- ActiveCampaign: ✅ ecom + email
- Leadhub: ✅ CZ tools
- ExpertSender: ✅
- Inxmail: ✅ B2B
- Brevo: ✅ basic

LIMITED (Tier 3):
- Email + web tracking only
- Some Shopify/WooCommerce
- Manual imports
- Integrations limited
```

---

## 10. Predictive Scoring (CLV, churn)

### 10.1 Predictive scoring native

```
NATIVE PREDICTIVE (auto-calculated):

TIER 1 (industry leader):
- Klaviyo: CLV, churn, predicted next order
- Bloomreach: CLV, churn, propensity, next-best
- SAP Emarsys: CLV, churn, retail patterns
- Salesforce Einstein: cross-cloud predictive

TIER 2 (solid):
- Braze: scale-based predictions
- SALESmanago: AI Studio scoring
- HubSpot: lead scoring + predictive
- ActiveCampaign: win probability
- Mapp: CLV + churn

TIER 3 (lite):
- Brevo: some predictive
- Mailchimp: customer lifetime value (basic)
- Klaviyo (Free): basic
- Inxmail: B2B scoring

TIER 4 (none):
- MailerLite, Constant Contact
- Ecomail, SmartEmailing, Mailkit
- CleverReach, rapidmail, Boldem
- Newsletter2Go, SARE, EmailLabs
```

### 10.2 Klíčové předikce

```
1. CUSTOMER LIFETIME VALUE (CLV):
- Co customer hodnotí
- Lifetime revenue prediction
- Top platforms: Klaviyo, Bloomreach, Emarsys

2. CHURN PROBABILITY:
- Likelihood customer leaves
- Early warning system
- Top platforms: same + Salesforce, Braze

3. PURCHASE PROPENSITY:
- Probability to buy next 30 days
- Conversion targeting
- Top platforms: Klaviyo (DTC standard)

4. NEXT-BEST ACTION:
- Most likely conversion path
- Personalization driver
- Top platforms: Bloomreach, Salesforce

5. PREDICTED NEXT ORDER DATE:
- When customer buys next
- DTC industry-leader = Klaviyo
- Reactivation triggers

6. ENGAGEMENT FREQUENCY:
- Optimal contact cadence
- Anti-fatigue prevention
- Top platforms: Salesforce, Klaviyo, Bloomreach
```

---

## 11. Activation napříč kanály

### 11.1 Channels activation

```
TIER 1 CDP - FULL ACTIVATION:
- Email + SMS + Push + In-App
- Web personalization
- Paid ads sync (Google, Meta)
- Custom channels via webhook
- Real-time triggers all

TIER 2 - MOST CHANNELS:
- Email + SMS + Push (mostly)
- Some web personalization
- Some ads sync
- Limited custom channels

TIER 3 - EMAIL CENTRIC:
- Email primary
- Some SMS (limited geo)
- Limited push
- No web personalization
- No real-time orchestration
```

### 11.2 Per platform activation breadth

| Platforma            | Email |   SMS   | Push | In-App | Web | Ads | Custom |
| -------------------- | :---: | :-----: | :--: | :----: | :-: | :-: | :----: |
| **Bloomreach**       |  ✅   |   ✅    |  ✅  |   ✅   | ✅  | ✅  |   ✅   |
| **SAP Emarsys**      |  ✅   |   ✅    |  ✅  |   ✅   | ✅  | ✅  |   ✅   |
| **Salesforce MC**    |  ✅   |   ✅    |  ✅  |   ✅   | ✅  | ✅  |   ✅   |
| **Braze**            |  ✅   |   ✅    |  ✅  |   ✅   | ✅  | ✅  |   ✅   |
| **Mapp**             |  ✅   |   ✅    |  ✅  |   –    | ✅  | ✅  |   ✅   |
| **SALESmanago**      |  ✅   |   ✅    |  ✅  |   –    | ✅  | ✅  |   –    |
| **Targito**          |  ✅   |   ✅    |  –   |   –    | ✅  | ✅  |   –    |
| **Klaviyo**          |  ✅   |   ✅    |  ✅  |   –    |  –  | ✅  |   –    |
| **HubSpot**          |  ✅   |   ✅    |  –   |   –    | ✅  | ✅  |   –    |
| **ActiveCampaign**   |  ✅   |   ✅    |  –   |   –    | ✅  |  –  |   –    |
| **Brevo**            |  ✅   |   ✅    |  –   |   –    |  –  |  –  |   –    |
| **Mailchimp**        |  ✅   |   $$    |  –   |   –    |  –  | ✅  |   –    |
| **MailerLite**       |  ✅   |   ✅    |  –   |   –    |  –  |  –  |   –    |
| **GetResponse**      |  ✅   |   ✅    |  –   |   –    | ✅  |  –  |   –    |
| **Constant Contact** |  ✅   | US-only |  –   |   –    |  –  | ✅  |   –    |
| **Ecomail**          |  ✅   |   ✅    |  –   |   –    |  –  |  –  |   –    |
| **SmartEmailing**    |  ✅   |   ✅    |  –   |   –    |  –  |  –  |   –    |
| **Mailkit**          |  ✅   |   ✅    |  –   |   –    |  –  |  –  |   –    |
| **CleverReach**      |  ✅   |    –    |  –   |   –    |  –  |  –  |   –    |
| **rapidmail**        |  ✅   |    –    |  –   |   –    |  –  |  –  |   –    |
| **Boldem**           |  ✅   |   ✅    |  –   |   –    |  –  |  –  |   –    |
| **Leadhub**          |  ✅   |   ✅    |  –   |   –    |  –  |  –  |   –    |
| **Inxmail**          |  ✅   |    –    |  –   |   –    |  –  |  –  |   –    |
| **SARE**             |  ✅   |   ✅    |  –   |   –    |  –  |  –  |   –    |
| **EmailLabs**        |  ✅   |   ✅    |  –   |   –    |  –  |  –  |   –    |
| **ExpertSender**     |  ✅   |   ✅    |  –   |   –    |  –  |  –  |   –    |
| **Newsletter2Go**    |  ✅   |   ✅    |  –   |   –    |  –  |  –  |   –    |

---

## 12. Consent Management + GDPR

### 12.1 Consent management capabilities

```
GDPR FORTRESS (DACH heritage):
- Mapp/Evalanche: ✅✅✅ DACH-strict
- rapidmail: ✅✅✅ GDPR-first
- Inxmail: ✅✅✅ od 1999 GDPR-aware
- CleverReach: ✅✅ DACH-strict

ENTERPRISE-GRADE:
- Bloomreach: ✅✅✅ consent + privacy
- SAP Emarsys: ✅✅✅
- Salesforce: ✅✅✅
- HubSpot: ✅✅ GDPR features

CZ/SK GDPR:
- Targito: ✅✅ CZ GDPR
- Ecomail: ✅✅ CZ GDPR
- SmartEmailing: ✅✅
- Mailkit: ✅✅
- Leadhub: ✅✅
- Boldem: ✅✅

US-FRIENDLY (less GDPR):
- Mailchimp: ✅ CAN-SPAM + GDPR
- Constant Contact: ✅ CAN-SPAM
- Klaviyo: ✅ growing GDPR

PL GDPR:
- SALESmanago: ✅✅
- ExpertSender, SARE, EmailLabs: ✅✅
- GetResponse: ✅✅
```

### 12.2 Klíčové GDPR features

```
CONSENT MANAGEMENT REQUIREMENTS:
- Granular consent per channel
- Consent audit trail
- Right to be forgotten
- Data portability
- Subject access requests
- ePrivacy compliance
- Cookie consent integration
- Multi-jurisdiction support

KDO TO MÁ:
- Tier 1 + DACH heritage: ✅
- Tier 2: většinou ✅
- Tier 3: ✅ basic
```

---

## 13. Klíčové rozdíly: CDP vs. CRM vs. Email tool

### 13.1 Quick comparison

```
SKUTEČNÝ CDP:
- Customer-centric (1 person = 1 profile)
- Multi-source data
- Real-time updates
- Predictive built-in
- Marketer-friendly
- Activation-focused
- Cross-channel native

CRM (e.g. Salesforce CRM, HubSpot):
- Account/contact-centric
- Sales process focus
- Manual data entry
- Less predictive
- Sales-friendly
- Pipeline-focused
- Less activation

EMAIL TOOL S TAGY:
- List-centric (email = customer)
- Single source primarily
- Batch updates
- Limited predictive
- Email-marketer friendly
- Email-channel focused
- Cross-channel limited
```

### 13.2 Kdy CDP, kdy CRM, kdy email tool

```
CDP MAKES SENSE PRO:
- B2C ecommerce mid-market+
- Multi-channel orchestration
- Personalization at scale
- Real-time triggers critical
- Customer 360° need
- Predictive priority

CRM MAKES SENSE PRO:
- B2B sales-driven
- Long sales cycles
- Account-based marketing
- Pipeline tracking primary
- Service integration

EMAIL TOOL MAKES SENSE PRO:
- SMB simple email
- Newsletter primary
- Limited budget
- Quick TTV need
- Cross-channel not critical
- < 5K customers typical
```

### 13.3 Hybrid models 2026

```
TREND: Convergence

CRM + CDP merger:
- HubSpot Customer Platform (2024 rebrand)
- Salesforce Data 360 + CRM unified
- Less separation needed

EMAIL TOOL + CDP-lite:
- Klaviyo (DTC CDP-like)
- ActiveCampaign (CRM + automation)
- Brevo (CRM + email + SMS)
- Mailchimp Marketing CRM

ECOMMERCE + CDP:
- Klaviyo (DTC standard)
- Bloomreach (mid-market+)
- SAP Emarsys (retail)

2027 PREDICTION:
- Convergence continues
- "Pure" categories blur
- AI-foundation becomes table stakes
- True CDP differentiation = predictive + agentic
```

---

## 14. Doporučení podle CDP potřeb

### 14.1 Pro DTC ecommerce (Shopify)

```
TOP PRO ECOM CDP:
1. Klaviyo (DTC standard, predictive industry leader)
2. Bloomreach Engagement (CDXP, mid-market+)
3. SAP Emarsys (if DACH retail)

AVOID:
- HubSpot (B2B fokus)
- Tier 3 email tools (limited)
```

### 14.2 Pro B2B SaaS

```
TOP B2B CDP:
1. HubSpot (Customer Platform)
2. Salesforce CRM + Data 360
3. ActiveCampaign (mid-market)
4. Inxmail (B2B specific DACH)

AVOID:
- Klaviyo (B2C)
- Bloomreach (B2C focus)
```

### 14.3 Pro DACH retail enterprise

```
TOP DACH CDP:
1. SAP Emarsys (king)
2. Mapp/Evalanche (DACH enterprise)
3. Bloomreach (omnichannel)
4. Salesforce MC + Data 360

AVOID:
- US-centric tools
- SMB tools
```

### 14.4 Pro CZ/SK mid-market

```
TOP CZ/SK CDP:
1. Bloomreach (CZ/SK origin advantage)
2. Targito (CZ-built)
3. SALESmanago (CEE)
4. Leadhub (CZ mid-market)

AVOID:
- US-only tools (CC)
- DACH-only (Inxmail bez CZ partnera)
```

### 14.5 Pro mobile-first apps

```
TOP MOBILE CDP:
1. Braze (mobile-first king)
2. Bloomreach (mobile + 11 channels)
3. Salesforce MobilePush

AVOID:
- Email-only tools
- Tier 3
```

### 14.6 Pro low-budget SMB

```
TOP SMB pseudo-CDP:
1. Klaviyo (ecom, Free do 250)
2. Brevo (light CDP)
3. HubSpot Free CRM
4. ActiveCampaign (mid-market)

REALITY CHECK:
- Skutečný CDP = $3K+/mo
- SMB typically ne potřebuje CDP
- Email tool s automation často stačí
```

### 14.7 Quick decision

```
START HERE:

Q1: Kolik kanálů aktivuješ?
- 1 (email): Email tool OK
- 2-3 (email + SMS + push): CDP-lite OK
- 4+ (omnichannel): True CDP

Q2: Jaká je velikost?
- < 5K customers: Email tool
- 5K-50K: CDP-lite
- 50K+: True CDP makes sense

Q3: Je real-time kritické?
- Newsletter only: Email tool
- Some triggers: CDP-lite
- Real-time critical: True CDP

Q4: Multi-source data?
- Email only: Email tool
- + Shopify/web: CDP-lite
- ERP + POS + CRM: True CDP

Q5: Budget?
- < $100/mo: Email tool
- $100-1500/mo: CDP-lite
- $1500+/mo: True CDP
```

---

## 15. Závěr 2026

### 15.1 Klíčové insights

1. **Skutečný CDP = 7 platforem** z 27 (26% market)
2. **Tier 2 CDP-lite = 7 platforem** (26%)
3. **Email tools s tagy = 13 platforem** (48%) – ne CDP
4. **"CDP" marketing claim** často přehnaný
5. **CDP price floor** = $3K+/mo typical
6. **Implementation 6-12 měsíců** standard
7. **Identity resolution** = klíčový rozdíl Tier 1 vs. 3
8. **Real-time architecture** = engineering investment
9. \*\*CEE má vlastní CDP (Bloomreach, SALESmanago, Targito)
10. **DACH dominance** s Emarsys, Mapp
11. **Convergence** CDP + CRM + email tools 2026+
12. **True CDP value** = predictive + cross-channel
13. **SMB often nepotřebuje true CDP** – email tool stačí
14. **Mid-market+ B2C ecom** = strong CDP fit
15. **AI + CDP** = perfect match (Bloomreach Loomi, Klaviyo predictive)

### 15.2 2027 outlook

```
PŘEDPOKLAD pro 2027+:

- Convergence pokračuje
- AI-foundation standard
- True CDP gap zmenšuje
- Privacy regulations stricter
- 1st-party data critical
- 3rd-party cookies dying
- Identity resolution evolves
- ePrivacy compliance critical
- DACH/EU = GDPR fortress advantage
- Mobile-first CDP rise (Braze pattern)
```

### 15.3 Final recommendation

```
PRO ROZHODOVÁNÍ O CDP:

1. NEDŮVĚŘUJ MARKETING CLAIMS
   - Many "CDP" jsou email tools
   - Demo every CDP feature
   - Identity resolution test
   - Multi-source ingest test
   - Real-time test

2. ASSESS REAL CDP NEED
   - Kolik kanálů?
   - Velikost DB?
   - Multi-source?
   - Real-time?
   - Budget?

3. START SMALL, SCALE
   - Email tool first (SMB)
   - CDP-lite mid-market
   - True CDP enterprise

4. CONSIDER IMPLEMENTATION
   - 6-12 měsíců standard CDP
   - Partner often required
   - Budget 2-3× annual fee Year 1

5. FUTURE-PROOF
   - AI-native preferred
   - Open APIs critical
   - Cross-channel native
   - Privacy-first design
```

---

_Dokument zpracován z 54 detailních deep-dive analýz (01-54) a verified web sources 2026. CDP definitions per CDP Institute (David Raab). Capabilities evolve - re-check vendor docs quarterly._
