# Pricing & TCO Analysis – 27 platforem srovnání 2026

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Total Cost of Ownership (TCO) napříč 27 platformami pro 3 scénáře velikosti databáze: 10K, 50K, 200K kontaktů. Hidden costs, implementation costs, Year 1 vs. Year 2+, scaling jam patterns.

> **TL;DR:** Vstupní ceník je často daleko od reality. Hidden costs (overage fees, SMS add-ons, implementation, premium support, training) mohou Year 1 zvednout 2-5×. Tento dokument říká, co skutečně budeš platit.

> ⚠️ **Disclaimer:** Ceny aktuální k květnu 2026 dle oficiálních webů a public sources. Enterprise pricing je téměř vždy sales-driven – uvedené čísla jsou industry estimates + případové studie. Pro tvou konkrétní situaci vždy kontaktuj vendor.

---

## Obsah

1. [Pricing modely klasifikace](#1-pricing-modely)
2. [Scenario 1: 10K kontaktů (SMB-mid)](#2-scenario-10k)
3. [Scenario 2: 50K kontaktů (mid-market)](#3-scenario-50k)
4. [Scenario 3: 200K kontaktů (enterprise SMB)](#4-scenario-200k)
5. [Hidden costs – co ti nikdo neřekne](#5-hidden-costs)
6. [Implementation costs (Year 1 reality)](#6-implementation)
7. [Year 1 vs. Year 2+ TCO](#7-year-comparison)
8. [Annual prepay slevy + negotiation leverage](#8-discounts)
9. [Pricing red flags + traps](#9-red-flags)
10. [TCO per use case recommendations](#10-recommendations)

---

## 1. Pricing modely klasifikace

### 1.1 5 hlavních pricing modelů

```
MODEL A: PER CONTACT (klasický)
- Cena scaluje s velikostí DB
- Předvídatelné při stabilní DB
- Trap: rychlé skoky mezi tieri

Příklady:
- Mailchimp, Klaviyo, MailerLite
- Constant Contact, ActiveCampaign
- Ecomail, SmartEmailing, Targito
- Boldem

MODEL B: PER SEND (unlimited contacts)
- Pay per email sent
- Neomezené kontakty
- Trap: kompletní opt-out tracking critical

Příklady:
- Brevo (unlimited contacts)
- Mailkit (unlimited contacts)
- EmailLabs (per 1000 sendů)
- SARE (volume-based)

MODEL C: PER ORGANIZATION (flat fee)
- Enterprise flat
- Features scaling per tier
- Trap: per-org může být $1500-15000/mo

Příklady:
- Salesforce MC (Engagement Pro)
- HubSpot tiers (Marketing Hub)

MODEL D: PER EVENT (usage-based)
- Pay per behavioral event
- Unique k Bloomreach
- Trap: events rychle eskalují

Příklady:
- Bloomreach Engagement (jediný!)

MODEL E: MODULE + USAGE (kombinace)
- Module fee (modul) + usage fee
- Enterprise CDP typically
- Trap: oba scaling current

Příklady:
- SAP Emarsys
- Mapp/Evalanche
- Bloomreach Engagement
- Braze
- Salesforce Data 360

MODEL F: PER USER (rare)
- Pay per user seat
- Salesforce Starter Suite primarily

Příklady:
- Salesforce Starter Suite ($25/user)
```

### 1.2 Predictability ranking

```
NEJVÍCE PREDIKABILNÍ:
1. Per Organization (flat tier-based)
2. Per Contact (klasický scaling)
3. Per User (linear)

STŘEDNĚ PREDIKABILNÍ:
4. Per Send (volume forecasting)

NEJMÉNĚ PREDIKABILNÍ:
5. Per Event (Bloomreach trap)
6. Module + Usage (komplexní)
```

---

## 2. Scenario 1: 10K kontaktů (SMB-mid)

### 2.1 Předpoklady scenario

```
USE CASE: SMB-mid e-shop / B2B SaaS
- 10 000 active kontaktů
- 30 000 sendů / měsíc (3 sendy avg)
- 1-2 marketing managers
- Bez SMS (pro porovnání)
- Self-implementation typically
- Bez premium support
```

### 2.2 Měsíční ceny – 10K kontaktů

| Platforma            | Plan              |            $/mo |    Roční | Notes                      |
| -------------------- | ----------------- | --------------: | -------: | -------------------------- |
| **Mailchimp**        | Standard          |             $87 |   $1 044 | bez SMS                    |
| **HubSpot**          | Marketing Starter |             $50 |     $600 | limited features           |
| **HubSpot**          | Marketing Pro     |            $890 |  $10 680 | full features              |
| **Brevo**            | Business          |             $52 |     $624 | unlimited cont., 20K sends |
| **Klaviyo**          | Email             |            $175 |   $2 100 | base predictive            |
| **Klaviyo**          | Email + SMS       |          varies |        – | + SMS pricing              |
| **GetResponse**      | Marketer          |             $89 |   $1 068 | webinars + funnels         |
| **MailerLite**       | Advanced          |             $73 |     $876 | full features              |
| **ActiveCampaign**   | Plus              |            $169 |   $2 028 | automation depth           |
| **Ecomail**          | Marketer          |  1 499 Kč ($65) |     $780 | CZ leader SMB              |
| **SmartEmailing**    | Plus              | 2 490 Kč ($108) |   $1 296 | CZ klasika                 |
| **Mailkit**          | Profi             | 3 990 Kč ($173) |   $2 076 | CZ deliverability          |
| **Boldem**           | Premium Plus      | 2 490 Kč ($108) |   $1 296 | CZ levné                   |
| **CleverReach**      | Plus              |      €99 ($107) |   $1 284 | DACH SMB                   |
| **rapidmail**        | Volume            |      €99 ($107) |   $1 284 | DACH SMB                   |
| **GetResponse**      | Plus              |             $59 |     $708 | basic automation           |
| **Constant Contact** | Standard          |            $120 |   $1 440 | Premium tier               |
| **Constant Contact** | Premium           |            $200 |   $2 400 | full                       |
| **Inxmail**          | Professional      |     €299 ($322) |   $3 864 | DACH B2B                   |
| **SALESmanago**      | Mid-tier          |           $750+ |  $9 000+ | enterprise mid             |
| **Leadhub**          | Mid-tier          |           $500+ |  $6 000+ | CZ mid-market              |
| **Targito**          | Mid-tier          |           $750+ |  $9 000+ | CZ CDP                     |
| **ExpertSender**     | Custom            |           $500+ |  $6 000+ | PL enterprise              |
| **Mapp/Evalanche**   | Enterprise        |         $1 500+ | $18 000+ | DACH CDP                   |
| **SAP Emarsys**      | Custom            |         $2 500+ | $30 000+ | enterprise retail          |
| **Salesforce MC**    | Growth            |         $1 500+ | $18 000+ | flat per org               |
| **Bloomreach**       | Custom            |         $3 000+ | $36 000+ | CDXP                       |
| **Braze**            | Enterprise        |         $5 000+ | $60 000+ | mobile-first scale         |
| **SARE**             | Enterprise        |               – |        – | PL focused                 |
| **EmailLabs**        | API-based         |          varies |        – | per 1000 sendů             |

### 2.3 Top 5 doporučení pro 10K kontaktů

```
BEST VALUE pro SMB-mid e-comm:
1. Klaviyo Email ($175) - DTC ecom
2. Ecomail Marketer (65 USD) - CZ leader
3. ActiveCampaign Plus ($169) - automation depth
4. Brevo Business ($52) - cheap omnichannel
5. MailerLite Advanced ($73) - moderna UI

BEST VALUE pro B2B SaaS:
1. HubSpot Marketing Pro ($890) - full CRM+marketing
2. ActiveCampaign Plus ($169) - mid-market B2B
3. Brevo Business ($52) - cheap B2B
4. Mailchimp Standard ($87) - basic B2B

AVOID at 10K:
- Salesforce MC ($1500+ flat = overkill)
- SAP Emarsys ($2500+ = too enterprise)
- Bloomreach ($3000+ = too enterprise)
- Braze ($5000+ = mobile-first scale only)
```

---

## 3. Scenario 2: 50K kontaktů (mid-market)

### 3.1 Předpoklady scenario

```
USE CASE: Mid-market e-shop / B2B
- 50 000 active kontaktů
- 200 000 sendů / měsíc
- 2-3 marketing managers
- + Light SMS (5K SMS / měsíc)
- Možnost partner implementation
- Premium support uvažujeme
```

### 3.2 Měsíční ceny – 50K kontaktů

| Platforma            | Plan                 |      $/mo |    Roční | Notes                    |
| -------------------- | -------------------- | --------: | -------: | ------------------------ |
| **Mailchimp**        | Standard             |      $230 |   $2 760 | rychle roste             |
| **Mailchimp**        | Premium              |      $640 |   $7 680 | full features            |
| **HubSpot**          | Marketing Pro        |     $890+ | $10 680+ | + contacts adds          |
| **HubSpot**          | Marketing Enterprise |   $3 600+ | $43 200+ | full                     |
| **Brevo**            | Business             |      $52+ |    $624+ | unlim cont., sends scale |
| **Klaviyo**          | Email                |      $720 |   $8 640 | predictive scale         |
| **Klaviyo**          | Email + SMS          |     $850+ | $10 200+ | + SMS bundle             |
| **GetResponse**      | Creator+             |      $189 |   $2 268 | webinars                 |
| **MailerLite**       | Advanced             |      $189 |   $2 268 | scales reasonably        |
| **ActiveCampaign**   | Plus                 |     $400+ |  $4 800+ | mid-market sweet spot    |
| **ActiveCampaign**   | Enterprise           |     $700+ |  $8 400+ | full                     |
| **Ecomail**          | Custom               | 4 500+ Kč |        – | CZ enterprise            |
| **SmartEmailing**    | Custom               | 5 000+ Kč |        – | CZ klasika scale         |
| **Mailkit**          | Profi+               | 7 990+ Kč |        – | CZ deliverability scale  |
| **Boldem**           | Custom               |         – |        – | CZ levné scale           |
| **CleverReach**      | Custom               |     €200+ |  $2 400+ | DACH SMB                 |
| **rapidmail**        | Volume               |     €200+ |  $2 400+ | DACH                     |
| **Constant Contact** | Premium              |     $400+ |  $4 800+ | scales rychle            |
| **Inxmail**          | Professional         |     €599+ |  $7 188+ | B2B DACH                 |
| **SALESmanago**      | Standard             |   $1 500+ | $18 000+ | mid-market               |
| **Leadhub**          | Mid                  |   $1 500+ | $18 000+ | CZ mid-market            |
| **Targito**          | Mid                  |   $1 500+ | $18 000+ | CZ CDP                   |
| **ExpertSender**     | Mid                  |   $1 200+ | $14 400+ | PL enterprise            |
| **Mapp/Evalanche**   | Enterprise           |   $2 500+ | $30 000+ | DACH CDP                 |
| **SAP Emarsys**      | Enterprise           |   $5 000+ | $60 000+ | retail enterprise        |
| **Salesforce MC**    | Growth               |   $1 500+ | $18 000+ | flat                     |
| **Salesforce MC**    | Advanced             |   $3 250+ | $39 000+ | premium                  |
| **Bloomreach**       | Custom               |   $5 000+ | $60 000+ | CDXP                     |
| **Braze**            | Enterprise           |   $7 500+ | $90 000+ | mobile scale             |
| **SARE**             | Enterprise           |   $2 500+ | $30 000+ | PL B2C                   |
| **EmailLabs**        | Custom               |    varies |        – | per 1000 sendů           |

### 3.3 Top 5 doporučení pro 50K kontaktů

```
BEST VALUE pro mid-market e-comm:
1. Klaviyo Email ($720) - DTC standard
2. ActiveCampaign Enterprise ($700+) - automation
3. Brevo Business ($52+) - cheap unlim contacts
4. Mailchimp Premium ($640) - if Mailchimp legacy
5. MailerLite Advanced ($189) - cost-effective

BEST VALUE pro mid-market B2B:
1. HubSpot Marketing Pro ($890+) - B2B standard
2. ActiveCampaign Enterprise ($700+) - automation
3. Salesforce MC Growth ($1 500) - if Salesforce CRM
4. Inxmail Professional (€599+) - DACH B2B

BEST VALUE pro CZ/SK mid-market:
1. Leadhub Mid ($1 500+) - CZ CDP-lite
2. Targito Mid ($1 500+) - CZ CDP
3. Ecomail Custom (4 500+ Kč) - CZ leader
4. SmartEmailing Custom (5 000+ Kč) - CZ klasika

SWEET SPOT alerting at 50K:
- CDPs start making sense ($1500+/mo)
- Email tools start feeling limiting
- Multi-channel needs emerge
- Predictive analytics ROI proven
```

---

## 4. Scenario 3: 200K kontaktů (enterprise SMB)

### 4.1 Předpoklady scenario

```
USE CASE: Enterprise SMB / Mid-market
- 200 000 active kontaktů
- 1 000 000 sendů / měsíc
- 3-5 marketing managers + analyst
- Multi-channel (email + SMS + push + web)
- Partner-led implementation
- Premium support + training
- Dedicated IP option
- Some level of CDP need
```

### 4.2 Měsíční ceny – 200K kontaktů

| Platforma            | Plan                 |     $/mo |     Roční | Notes                 |
| -------------------- | -------------------- | -------: | --------: | --------------------- |
| **Mailchimp**        | Premium              |  $1 600+ |  $19 200+ | scales fast           |
| **HubSpot**          | Marketing Enterprise |  $3 600+ |  $43 200+ | + contact adds        |
| **Brevo**            | Business+            |    $400+ |   $4 800+ | unlim cont. magic     |
| **Klaviyo**          | Email                |   $2 880 |   $34 560 | predictive enterprise |
| **Klaviyo**          | Enterprise           |   custom |         – | typically $3K+        |
| **GetResponse**      | Custom               |    $500+ |   $6 000+ | scales                |
| **MailerLite**       | Advanced+            |    $400+ |   $4 800+ | scales                |
| **ActiveCampaign**   | Enterprise           |  $1 500+ |  $18 000+ | enterprise            |
| **Ecomail**          | Custom               |  $1 000+ |  $12 000+ | CZ enterprise         |
| **SmartEmailing**    | Custom               |  $1 200+ |  $14 400+ | CZ                    |
| **Mailkit**          | Profi+               |  $1 500+ |  $18 000+ | CZ deliverability     |
| **CleverReach**      | Custom               |    $500+ |   $6 000+ | DACH                  |
| **rapidmail**        | Custom               |    $400+ |   $4 800+ | DACH                  |
| **Constant Contact** | Premium              |  $1 500+ |  $18 000+ | mid-market max        |
| **Inxmail**          | Enterprise           |  $2 000+ |  $24 000+ | DACH B2B              |
| **SALESmanago**      | Custom               |  $3 000+ |  $36 000+ | enterprise CEE        |
| **Leadhub**          | Enterprise           |  $3 000+ |  $36 000+ | CZ enterprise         |
| **Targito**          | Enterprise           |  $3 000+ |  $36 000+ | CZ CDP                |
| **ExpertSender**     | Enterprise           |  $2 500+ |  $30 000+ | PL B2C                |
| **Mapp/Evalanche**   | Enterprise           |  $4 000+ |  $48 000+ | DACH enterprise CDP   |
| **SAP Emarsys**      | Custom               |  $8 000+ |  $96 000+ | retail enterprise     |
| **Salesforce MC**    | Advanced             |  $3 250+ |  $39 000+ | flat + usage          |
| **Salesforce MC**    | Premier              |  $4 200+ |  $50 400+ | corporate             |
| **Bloomreach**       | Custom               |  $7 000+ |  $84 000+ | CDXP enterprise       |
| **Braze**            | Enterprise           | $10 000+ | $120 000+ | mobile-first          |
| **SARE**             | Custom               |  $4 000+ |  $48 000+ | PL enterprise         |

### 4.3 Top 5 doporučení pro 200K kontaktů

```
BEST VALUE pro 200K B2C ecom:
1. Klaviyo Enterprise (custom, ~$3K+) - DTC standard
2. Brevo Business+ ($400+) - amazing unlim contacts!
3. Bloomreach Custom ($7 000+) - if CDXP need
4. SAP Emarsys ($8 000+) - if DACH retail
5. ActiveCampaign Enterprise ($1 500+) - automation

BEST VALUE pro 200K B2B:
1. HubSpot Marketing Enterprise ($3 600+) - B2B standard
2. Salesforce MC Advanced ($3 250+) - if Salesforce CRM
3. Inxmail Enterprise ($2 000+) - DACH B2B specific
4. ActiveCampaign Enterprise ($1 500+) - mid-market

BEST VALUE pro CZ/SK 200K:
1. Leadhub Enterprise ($3 000+) - CZ enterprise
2. Targito Enterprise ($3 000+) - CZ CDP
3. Bloomreach Custom ($7 000+) - CZ origin advantage!
4. SALESmanago Custom ($3 000+) - CEE

200K = TRUE ENTERPRISE TIER:
- CDPs start at $3K-7K+ /mo (typically)
- Implementation $50K-200K+ Year 1
- Annual prepay slevy 10-30%
- Multi-year contracts standard
- Dedicated CSM included
- Premium support critical
```

---

## 5. Hidden costs – co ti nikdo neřekne

### 5.1 Klasické hidden costs

```
1. OVERAGE FEES (per contact / per send)
- Mailchimp: $$$ per overage block
- Klaviyo: scales rychle při push over limit
- ActiveCampaign: contact tiers jump
- Constant Contact: overage = upgrade pressure

2. SMS ADD-ONS
- Mailchimp SMS: $$$ separate pricing
- HubSpot SMS: separate module
- Klaviyo SMS: per-message pricing
- US-only platforms: nepoužitelné CZ/EU
- CZ/EU SMS: per-message pricing varies

3. IMPLEMENTATION COSTS
- Self-implementation: čas (skrytá cena)
- Partner-led: $5K-500K+
- Enterprise: $50K-500K typical Year 1
- Training + migration costs

4. PREMIUM SUPPORT
- Mailchimp 24/7: included in higher tiers
- HubSpot CSM: Enterprise tier
- Salesforce Premier Success: 30% of license fees!
- Klaviyo Customer Success Manager: enterprise
- Bloomreach: included some tiers

5. DEDICATED IP
- Mailchimp: $$ add-on
- Klaviyo: enterprise tier
- ExpertSender: included enterprise
- SAP Emarsys: included
- Salesforce: extra cost

6. EXTRA SEATS / USERS
- HubSpot: per-user pricing higher tiers
- Salesforce: per-user mandatory
- Most others: included usually

7. CUSTOM INTEGRATIONS
- API rate limits enterprise
- Custom connectors: $$
- Salesforce MuleSoft: separate licence
- Bloomreach custom: implementation cost

8. TRAINING + CERTIFICATION
- HubSpot Academy: free
- Salesforce Trailhead: free
- Bloomreach: paid training
- SAP Emarsys: enterprise training packages
- Klaviyo Academy: free
```

### 5.2 Per platform hidden cost warnings

```
MAILCHIMP:
⚠️ Pricing tiers jump aggressively
⚠️ SMS = US-only realisticky
⚠️ Premier support = high tier required
⚠️ Some features locked higher tiers

HUBSPOT:
⚠️ Starter → Pro = MASSIVE jump ($20 → $890)
⚠️ Per-contact pricing scales
⚠️ Marketing + Sales + Service = $$$
⚠️ Onboarding fees Pro+ ($3K)

KLAVIYO:
⚠️ SMS pricing separate (per-message)
⚠️ Premium AI features higher tier
⚠️ Enterprise CSM = custom

ACTIVECAMPAIGN:
⚠️ Tier jumps aggressively
⚠️ Plus → Pro → Enterprise jumps
⚠️ Predictive in Plus+ only

CONSTANT CONTACT:
⚠️ Free plan ZRUŠEN červen 2025!
⚠️ Premium features locked top tier
⚠️ Cancellation phone-only (trap)

SALESFORCE MC:
⚠️ Multiple SKUs confusion:
  - Engagement editions
  - Account Engagement (Pardot)
  - + Data 360
  - + Agentforce
⚠️ Premier Success = 30% of license fees!
⚠️ Implementation $25K-500K+
⚠️ Per-user limits enterprise tier

SAP EMARSYS:
⚠️ Implementation 6-12 měsíců
⚠️ Custom pricing always
⚠️ SAP backend integration cost extra
⚠️ Training packages expensive

BLOOMREACH:
⚠️ Event-based pricing eskaluje rychle
⚠️ G2 critique: "underestimate events to lure in"
⚠️ Module + usage = 2 cost dimensions
⚠️ Implementation $25K-200K typical

BRAZE:
⚠️ Mobile event volumes scale fast
⚠️ Enterprise floor $5K+/mo typical
⚠️ Premium support packages
⚠️ Implementation 6-12 měsíců

SALESMANAGO:
⚠️ Aggressive sales tactics reported
⚠️ Custom pricing always
⚠️ Implementation 3-6 měsíců

TARGITO / LEADHUB / EXPERTSENDER:
⚠️ Custom pricing only
⚠️ Implementation 3-6 měsíců
⚠️ CZ specifická pricing varies

MAPP / EVALANCHE:
⚠️ Two products confusion
⚠️ Enterprise-only realisticky
⚠️ DACH-strict pricing
```

---

## 6. Implementation costs (Year 1 reality)

### 6.1 Difficulty tier → cost

```
EASY ($0-5K Year 1 implementation):
- Mailchimp, MailerLite, Brevo
- Constant Contact, Boldem
- CleverReach, rapidmail
- Self-implementation possible
- 1-3 dny basic, 1-2 týdny advanced

MEDIUM ($5K-25K Year 1):
- Ecomail, SmartEmailing
- Klaviyo (DTC complex)
- ActiveCampaign (automation depth)
- GetResponse, Mailkit
- Inxmail New / Professional
- Partner often beneficial
- 2-8 týdnů typical

HARD ($25K-100K Year 1):
- Targito, Leadhub
- SALESmanago
- ExpertSender, SARE
- Inxmail Enterprise
- Partner-led typical
- 8-24 týdnů typical

VERY HARD ($100K-500K+ Year 1):
- Salesforce MC + Data 360 + Agentforce
- SAP Emarsys (with SAP integration)
- Bloomreach Engagement
- Mapp/Evalanche
- Braze (mobile-first complex)
- HubSpot Enterprise (full setup)
- Multi-vendor partner team
- 12-32+ týdnů typical
- + Multi-year migration project
```

### 6.2 Co implementation zahrnuje

```
TYPICAL IMPLEMENTATION:

1. DATA MIGRATION (10-30% of effort)
- Customer DB migration
- Historical data import
- List cleaning + deduplication
- Custom field mapping
- Validation testing

2. TECHNICAL SETUP (20-40%)
- API integrations
- Webhook setup
- Tracking SDK installation
- Authentication (SPF/DKIM/DMARC)
- Custom domains
- Email templates migration

3. WORKFLOW BUILDOUT (20-30%)
- Welcome series setup
- Abandoned cart workflows
- Re-engagement flows
- Triggered automations
- Custom journeys design

4. TRAINING + DOCUMENTATION (10-20%)
- Team training sessions
- Documentation creation
- Process design
- Governance setup

5. TESTING + LAUNCH (10-20%)
- Test sends
- A/B test setup
- Deliverability monitoring
- IP warmup (if dedicated)
- Soft launch
- Full migration cut-over
```

### 6.3 Implementation cost factors

```
FACTORS THAT INCREASE COST:

1. Database size
- 10K: small
- 50K: medium
- 200K+: large
- 1M+: very large

2. Custom integrations
- Standard ERP/CRM: included
- Custom systems: extra
- Multiple data sources: extra

3. Workflow complexity
- Basic: few flows
- Mid: 10-30 flows
- Enterprise: 50+ flows
- Multi-channel orchestration

4. Team complexity
- Single marketer: simple training
- Multi-team: governance design
- Global: multi-region setup

5. Compliance requirements
- Single jurisdiction: simple
- Multi-jurisdiction (EU + US + ROW): complex
- HIPAA / regulated: additional

6. Quality requirements
- Standard: acceptable
- High deliverability: extra setup
- High availability: SLA setup
```

---

## 7. Year 1 vs. Year 2+ TCO

### 7.1 Year 1 vs. Year 2 cost breakdown

```
YEAR 1 = HIGH (one-time + recurring):

SUBSCRIPTION (60-80% TCO):
- Annual platform fee
- Often with discount Year 1
- Sometimes free trial period

IMPLEMENTATION (20-30% TCO Year 1):
- One-time cost
- Largest in Year 1
- Może być 1-3× annual subscription

TRAINING (5-10% TCO Year 1):
- Team certification
- Knowledge transfer
- Documentation

INTEGRATIONS (5-10% TCO Year 1):
- Custom development
- Connector setup
- API rate limits negotiation

YEAR 2+ = LOWER (mostly recurring):

SUBSCRIPTION (80-95% TCO):
- Often higher than Year 1 (no intro discount)
- Possibly annual prepay savings
- Possibly tier upgrade

ONGOING OPTIMIZATION (5-10% TCO):
- Workflow optimization
- A/B testing programs
- Custom development

SUPPORT (varies):
- Premier support
- CSM time
- Professional services
```

### 7.2 Per platform Year 1 vs. Year 2 example (50K kontaktů)

```
SALESFORCE MC EXAMPLE:

YEAR 1:
- Subscription: $1500 × 12 = $18 000
- Implementation: $100 000
- Training: $10 000
- Premier Success: $5 400 (30% of license)
- TOTAL Year 1: $133 400

YEAR 2:
- Subscription: $20 000 (price increase + tier)
- Premier Success: $6 000
- Ongoing dev: $10 000
- TOTAL Year 2: $36 000

3-YEAR TCO: $200K+


KLAVIYO EXAMPLE:

YEAR 1:
- Subscription: $720 × 12 = $8 640
- Implementation (DIY): $0
- Training (free): $0
- TOTAL Year 1: $8 640

YEAR 2:
- Subscription: $9 500 (slight increase)
- TOTAL Year 2: $9 500

3-YEAR TCO: $28K


BLOOMREACH EXAMPLE:

YEAR 1:
- Subscription: $5 000 × 12 = $60 000
- Implementation (partner): $80 000
- Training: $10 000
- TOTAL Year 1: $150 000

YEAR 2:
- Subscription: $66 000 (5-10% increase)
- Ongoing optimization: $20 000
- TOTAL Year 2: $86 000

3-YEAR TCO: $300K+
```

### 7.3 TCO calculator framework

```
TCO YEAR 1 =
  Subscription × 12 months
  + Implementation cost
  + Training cost
  + Integration cost
  + Support package

TCO YEAR 2+ =
  Subscription × 12 (often +5-15% annual)
  + Ongoing optimization
  + Support package
  + Possible upgrades

3-YEAR TCO =
  Year 1 + (Year 2 × 1) + (Year 3 × 1.1)

WATCH FOR:
- Annual price increases (5-15% typical)
- Tier upgrade pressure
- Add-on creep
- Feature gating creep
- "AI add-on" upsells
```

---

## 8. Annual prepay slevy + negotiation leverage

### 8.1 Annual prepay slevy

```
TYPICKÉ SLEVY:

10-15% sleva za annual prepay:
- Mailchimp, MailerLite
- ActiveCampaign
- Most SMB tools

15-25% za annual:
- Klaviyo, HubSpot
- ActiveCampaign Enterprise
- Brevo

20-30% za multi-year:
- Salesforce MC (3-year deals)
- SAP Emarsys
- Bloomreach
- Braze
- Enterprise tier all platforms

NONPROFIT SLEVY:
- Constant Contact: 20-30%
- Mailchimp: discount available
- HubSpot: discount available
- Boldem: special nonprofit pricing
- Most enterprise: nonprofit programs
```

### 8.2 Negotiation leverage

```
HIGH LEVERAGE (significant savings possible):

1. ENTERPRISE TIERS
- Most platforms negotiable enterprise
- Volume discounts 20-50%+
- Custom pricing reality

2. MULTI-YEAR COMMITMENTS
- 2-year deals: 10-20% off
- 3-year deals: 20-30% off
- 5-year deals: 30-40% off

3. COMPETITIVE BIDS
- 2-3 vendors competing
- Switching costs leverage
- "I have competing quote"

4. REFERENCEABILITY
- "We'll be a case study"
- Public reference value
- PR opportunities

5. EARLY ADOPTER
- New features beta
- Geographic expansion
- New industry

6. STRATEGIC ACCOUNT
- Future expansion potential
- Cross-sell opportunities
- Industry positioning

LOW LEVERAGE (limited savings):

1. SMB TIERS
- Self-serve pricing
- Limited negotiation
- Standard discounts only

2. SHORT-TERM
- Quarterly commitments
- Monthly billing
- Trial → paid

3. SINGLE VENDOR
- No competing bid
- Limited switching cost
- Established usage
```

### 8.3 Tips na vyjednávání

```
PŘED NEGOTIATION:
1. Get competing quotes (2-3 vendors)
2. Understand vendor's quarter-end
3. Calculate switching costs
4. Identify key features critical
5. Prepare reference offer

BĚHEM NEGOTIATION:
1. Ask for: discount, longer trial, extra training, premium support included
2. Multi-year commitment for major discount
3. Free implementation for big deal
4. Custom features in roadmap commitment
5. Quarterly business review (QBR) included

PO NEGOTIATION:
1. Get all terms v writing
2. Renewal terms locked
3. Price increase caps (5-7% typical)
4. SLA agreements
5. Exit clauses
```

---

## 9. Pricing red flags + traps

### 9.1 Top 10 pricing red flags

```
1. AGRESIVNÍ TIER SCALING
Example: Constant Contact Lite 500 cont. = $12, 1000 cont. = $50 (+317%!)
Watch for: Contact threshold jumps

2. FREE PLAN ZRUŠEN
Example: Constant Contact eliminated free 6/2025
Watch for: Vendors potentially eliminating free tiers

3. AI ADD-ON CREEP
Example: Salesforce Agentforce extra cost
Watch for: AI features behind paywall higher tiers

4. SMS GEOGRAPHIC LIMITS
Example: Constant Contact SMS = US-only
Watch for: SMS pricing varies by country dramatically

5. EVENT-BASED PRICING TRAP
Example: Bloomreach "underestimate events to lure in" (G2)
Watch for: Usage scaling unpredictable

6. PREMIER SUPPORT %
Example: Salesforce Premier = 30% of license!
Watch for: Support packages as % of subscription

7. PER-USER PRICING
Example: Salesforce per-user vs. flat
Watch for: Team scaling cost

8. ANNUAL PRICE INCREASES
Example: 5-15% annual increases typical
Watch for: Multi-year cap negotiation

9. IMPLEMENTATION INFLATION
Example: $100K implementation creep $250K+
Watch for: Scope creep clauses

10. CANCELLATION DIFFICULTY
Example: Constant Contact phone-only cancellation
Watch for: Exit clauses in contracts
```

### 9.2 Per platform pricing traps detail

```
CONSTANT CONTACT TRAPS:
⚠️ Free plan eliminated June 2025
⚠️ Lite → Standard jump aggressive
⚠️ 1K contacts pricing surge
⚠️ Phone-only cancellation
⚠️ SMS US-only

MAILCHIMP TRAPS:
⚠️ Audience overage fees
⚠️ "Audiences" = single list confusion
⚠️ Premier support tier required
⚠️ SMS add-on US-focused
⚠️ Standard plan limited automation

HUBSPOT TRAPS:
⚠️ Starter → Pro jump $20 → $890!
⚠️ Marketing Hub + Sales Hub + Service Hub = $$$
⚠️ Contact pricing scales aggressively
⚠️ Onboarding fees ($3K Pro+)
⚠️ Per-seat pricing higher tiers

KLAVIYO TRAPS:
⚠️ SMS per-message pricing
⚠️ Predictive in higher tiers
⚠️ Enterprise CSM custom
⚠️ Free plan: 250 contacts only

ACTIVECAMPAIGN TRAPS:
⚠️ Tier jumps aggressively
⚠️ Predictive in Plus+ only
⚠️ Enterprise add-on cost
⚠️ Per-contact tier scaling

SALESFORCE MC TRAPS:
⚠️ Multiple SKUs confusion
⚠️ Premier Success 30%!
⚠️ Per-user costs
⚠️ Implementation $25K+
⚠️ Engagement Pro $1 250 + Engagement+ $2 000

BLOOMREACH TRAPS:
⚠️ Event-based pricing eskaluje
⚠️ "Underestimate events" warning
⚠️ Module + usage 2 dimensions
⚠️ Implementation costs

BRAZE TRAPS:
⚠️ Event volumes mobile scale
⚠️ Enterprise floor high
⚠️ Implementation 6-12 měsíců
⚠️ Premium support packages

SAP EMARSYS TRAPS:
⚠️ Custom pricing only
⚠️ SAP backend integration extra
⚠️ Training packages expensive
⚠️ Implementation 6-12 měsíců

SALESMANAGO TRAPS:
⚠️ Aggressive sales tactics
⚠️ Custom pricing always
⚠️ Multi-year contracts pressure

TARGITO / LEADHUB / EXPERTSENDER TRAPS:
⚠️ Custom pricing only
⚠️ CZ specifická pricing
⚠️ Implementation 3-6 měsíců

MAPP / EVALANCHE TRAPS:
⚠️ Two products confusion
⚠️ Enterprise-only realisticky

BREVO TRAPS:
⚠️ Per-send pricing pro big volume
⚠️ Pricing tier features locked

MAILERLITE TRAPS:
⚠️ Less feature-rich vs. competitors
⚠️ Limited mid-market+ features

GETRESPONSE TRAPS:
⚠️ Webinars + funnels nejsou best-in-class
⚠️ Pricing for large DB scales

ECOMAIL / SMARTEMAILING / MAILKIT TRAPS:
⚠️ CZ pricing varies kvartálně
⚠️ Custom pricing pro velké DB
⚠️ Implementation costs

INXMAIL TRAPS:
⚠️ B2B-focused (B2C limit)
⚠️ DACH-fokus
⚠️ Pricing enterprise tier

BOLDEM TRAPS:
⚠️ Limited features
⚠️ CZ-only realisticky
```

---

## 10. TCO per use case recommendations

### 10.1 Pro SMB e-shop (10K kontaktů)

```
NEJLEVNĚJŠÍ:
1. Brevo Business $52/mo ($624/year)
2. MailerLite Advanced $73/mo ($876/year)
3. Mailchimp Standard $87/mo ($1 044/year)

NEJLEPŠÍ HODNOTA:
1. Klaviyo Email $175/mo - DTC standard
2. Ecomail Marketer ~$65/mo - CZ leader
3. ActiveCampaign Plus $169/mo - automation

AVOID:
- HubSpot Pro ($890+) - overkill
- Enterprise tier all - overkill
```

### 10.2 Pro mid-market (50K kontaktů)

```
NEJLEPŠÍ HODNOTA:
1. Klaviyo Email $720/mo - DTC standard
2. ActiveCampaign Enterprise $700+ - automation
3. HubSpot Pro $890+ - B2B
4. Mailchimp Premium $640 - SMB legacy

ENTERPRISE BUDGET:
1. SAP Emarsys $5K+ - DACH retail
2. Bloomreach $5K+ - CDXP
3. Salesforce MC $1.5K-3K - if Salesforce CRM
4. SALESmanago $1.5K+ - CEE
```

### 10.3 Pro enterprise (200K+ kontaktů)

```
TRUE ENTERPRISE TIER:
1. Salesforce MC + Data 360 (if Salesforce CRM)
2. SAP Emarsys (DACH retail)
3. Bloomreach Engagement (CZ/SK origin + global)
4. Braze (mobile-first apps)
5. Mapp/Evalanche (DACH B2B)

REGIONAL ENTERPRISE:
- CZ/SK: Bloomreach, Targito, Leadhub, SALESmanago
- DACH: SAP Emarsys, Mapp, Inxmail
- PL: SALESmanago, ExpertSender, SARE
- US: Salesforce, HubSpot Enterprise, Klaviyo Enterprise

BUDGET RANGE:
- Year 1 TCO: $50K-500K typical
- Year 2+ TCO: $30K-200K typical
- Multi-year multi-million for true enterprise
```

### 10.4 Pro nonprofit / education

```
BEST FOR NONPROFITS:
1. Constant Contact (20-30% discount)
2. Mailchimp (nonprofit discount)
3. HubSpot (nonprofit program)
4. Boldem (CZ nonprofits specific)
5. SmartEmailing (CZ nonprofit support)

AVOID:
- Enterprise tier (overkill)
- Per-event pricing (unpredictable)
```

### 10.5 Pro transactional + bulk sending

```
BEST FOR TRANSACTIONAL:
1. EmailLabs (PL API-first)
2. Brevo Transactional
3. Mailkit (CZ deliverability)
4. SendGrid (mimo tuto sérii)
5. Postmark (mimo)

PRICING MODEL:
- Per 1000 sendů
- Volume-based dramatically scales
- Unlimited contacts (transactional)
```

### 10.6 Final TCO decision framework

```
1. DEFINE TRUE NEEDS
- Velikost DB?
- Channels?
- Predictive?
- CDP?
- Geo?

2. CALCULATE TCO 3-YEAR
- Subscription × 36
- + Implementation
- + Training
- + Integration
- + Support

3. COMPARE 3 ALTERNATIVES
- 1 "ideální" volba
- 1 "rozumná" volba
- 1 "minimum viable"

4. NEGOTIATE
- Multi-year commitment
- Reference customer status
- Annual prepay

5. WATCH OUT FOR
- Hidden costs (sekce 5)
- Pricing traps (sekce 9)
- Implementation creep
- Annual increases

6. RE-EVALUATE
- Quarterly performance review
- Annual TCO recalculation
- 2-year tipping point re-evaluate
```

---

## 11. Závěr 2026

### 11.1 Klíčové TCO insights

1. **Vstupní ceník ≠ TCO** – často 2-5× rozdíl
2. **Implementation costs** = klíčový faktor Year 1
3. **Enterprise = $50K-500K Year 1** typical
4. **CDP entry point ~$3K+/mo** standard
5. **Premier Support 30% Salesforce** = warning
6. **Annual prepay 10-30% slevy** standard
7. **Multi-year deals** = biggest savings opportunity
8. **Event-based pricing** = unpredictable trap (Bloomreach)
9. **CZ/SK custom pricing** = sales-driven typically
10. **DACH GDPR fortress** = premium pricing OK
11. **Mobile-first scale** = Braze enterprise floor $5K+
12. **SMS regional limits** = significant TCO variance
13. **Free plans rare** (7/27 platforms, CC eliminated 6/2025)
14. **Tier jumps aggressive** at certain thresholds
15. **Negotiation leverage maximum** at enterprise level

### 11.2 Final recommendation

```
PRO TVŮJ TCO:

1. CALCULATE 3-YEAR TCO
   - Ne jen monthly
   - Include implementation
   - Include support
   - Include integrations
   - Include training

2. NEGOTIATE EVERY ELEMENT
   - Multi-year for biggest savings
   - Reference customer status
   - Free professional services
   - Premium support included
   - Custom feature commitments

3. WATCH FOR TRAPS
   - Tier jumps
   - Event-based pricing
   - SMS regional limits
   - Free plan elimination
   - AI add-on creep

4. RE-EVALUATE PERIODICALLY
   - Quarterly TCO review
   - 2-year tipping point
   - Renewal renegotiation
   - Switching cost analysis

5. CONSIDER ALTERNATIVES
   - 2-3 vendor competition
   - Build vs. buy
   - Open-source alternatives
   - Hybrid approaches
```

---

_Dokument zpracován z 54 detailních deep-dive analýz (01-54) a verified web sources 2026. Pricing aktuální k květnu 2026 dle oficiálních zdrojů. Enterprise pricing varies dle negotiation - vždy získat custom quote. Pro detail per platformu viz individuální dokumenty._
