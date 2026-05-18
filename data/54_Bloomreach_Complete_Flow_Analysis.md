# Bloomreach Engagement – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v Bloomreach Engagement prochází data, lidé a akce – od sales přes implementation s partnery (Actum, Adastra), Customer Data Engine ingestion, real-time triggers, journey orchestration, Loomi AI optimization, omnichannel execution (email + SMS + push + web + ads), až po reporting a continuous optimization. Speciální focus na **české zákazníky** (MALL.CZ, HP Tronic/Datart, SIKO, Allwyn/Sazka, Spokojený pes).

> Tento dokument doplňuje `53_Bloomreach_Features_DeepDive.md` o **procesní pohled**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
> - **Bloomreach Engagement = původně Exponea** (Bratislava, 2016)
> - **Akvizice:** 26. ledna 2021 Bloomreach Inc. (USA) za $900M valuation
> - **CDXP = CDP + Marketing Automation** v jednom (ne 2 nástroje)
> - **Event-based pricing** (ne contact-based!)
> - **In-memory framework** = real-time processing
> - **Loomi AI engine** napříč platformou
> - **6-12 měsíců implementation** typical
> - **Engineering hub:** Bratislava + Brno + Mountain View
> - **Implementation partners:** Actum Digital, Adastra (CZ/SK)
> - **1 400+ zákazníků** globally
> - **Český origin** = silné v CEE regionu
> - **Sales-driven pricing** (custom quote)
> - **Module fee + Usage fee** struktura
> - **Annual subscriptions** standardně
> - **MACH Alliance member**

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Sales & qualification flow (enterprise)](#2-sales-flow)
3. [Demo + discovery + custom quote flow](#3-demo-quote)
4. [Onboarding + implementation (3-12 měsíců)](#4-onboarding)
5. [Partner-led implementation (Actum, Adastra)](#5-partner-implementation)
6. [Customer Data Engine (CDE) ingestion](#6-cde-ingestion)
7. [Identity resolution flow](#7-identity-resolution)
8. [Real-time event processing](#8-real-time-events)
9. [Loomi AI training + optimization](#9-loomi-training)
10. [Scenario builder + journey orchestration](#10-scenarios)
11. [Email campaign flow](#11-email-flow)
12. [SMS flow (global!)](#12-sms-flow)
13. [Mobile push + In-App flow](#13-mobile-flow)
14. [Web personalization + Weblayers](#14-web-flow)
15. [Advertising audience sync](#15-ads-flow)
16. [Segmentation + Dynamic Audiences](#16-segmentation-flow)
17. [A/B testing + Experimentation](#17-ab-flow)
18. [Recommendations engine flow](#18-recs-flow)
19. [Reporting + Analytics consumption](#19-reporting-flow)
20. [Webhooks + API integration patterns](#20-api-flow)
21. [MALL.CZ personalized video case (technical)](#21-mall-case)
22. [HP Tronic weblayer case (technical)](#22-hptronic-case)
23. [Allwyn/Sazka unified channels case](#23-allwyn-case)
24. [Continuous optimization cycle](#24-continuous-optimization)
25. [Renewal + expansion flow](#25-renewal)
26. [Datová mapa: co vidí kdo](#26-data-map)
27. [Známé úzkoprofilové místa](#27-bottlenecks)

---

## 1. Mapa všech aktérů

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│         BLOOMREACH ENGAGEMENT ECOSYSTEM                              │
│         Bloomreach Inc. · Mountain View, CA, USA                     │
│         Bývalá Exponea (Bratislava, 2016)                            │
│         Akvizice: 26.1.2021                                          │
│         1 400+ brandů worldwide                                      │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [Bloomreach tým]                                                    │
│   ├─ CEO: Raj De Datta (co-founder 2009)                             │
│   ├─ Bratislava + Brno engineering hub                               │
│   ├─ US sales + management                                           │
│   ├─ EU sales + customer success                                     │
│   ├─ Consulting team (technical)                                     │
│   ├─ Loomi AI / ML team                                              │
│   ├─ Partner alliance team                                           │
│   └─ Customer support (multi-tier)                                   │
│           │                                                          │
│           ▼                                                          │
│                                                                      │
│   ┌────────────────────────────────────────────┐                     │
│   │   Bloomreach Engagement customer instance  │                     │
│   │                                            │                     │
│   │   ROLES (typical enterprise setup):        │                     │
│   │   ├─ Admin (technical + business)          │                     │
│   │   ├─ Marketing manager                     │                     │
│   │   ├─ Email marketer                        │                     │
│   │   ├─ Campaign analyst                      │                     │
│   │   ├─ Data analyst (SQL queries)            │                     │
│   │   ├─ Web personalization manager           │                     │
│   │   ├─ Mobile marketer                       │                     │
│   │   ├─ Designer/copy                         │                     │
│   │   └─ Developer (integrations)              │                     │
│   │                                            │                     │
│   │   CORE MODULES:                            │                     │
│   │   ├─ Customer Data Engine (CDE)            │                     │
│   │   ├─ Email module                          │                     │
│   │   ├─ SMS module (global)                   │                     │
│   │   ├─ Mobile push + In-app                  │                     │
│   │   ├─ Web personalization (Weblayers)       │                     │
│   │   ├─ Advertising integrations              │                     │
│   │   ├─ Scenarios (journey builder)           │                     │
│   │   ├─ Reports + analytics                   │                     │
│   │   ├─ Loomi AI (included all plans)         │                     │
│   │   └─ Webhooks + API                        │                     │
│   └──────────────┬─────────────────────────────┘                     │
│                  │                                                   │
│                  ▼                                                   │
│   [Implementation partner]                                           │
│       │                                                              │
│       ├─→ Actum Digital (CZ)                                         │
│       │     Praha + Brno · e-commerce focus                          │
│       ├─→ Adastra (CZ)                                               │
│       │     BI + CRM heritage · enterprise focus                     │
│       ├─→ Other certified partners                                   │
│       └─→ Internal team (self-implementation)                        │
│                  │                                                   │
│                  ▼                                                   │
│   [Data sources ingestion]                                           │
│       │                                                              │
│       ├─→ E-commerce platform (Shopify, custom, SAP CC)              │
│       ├─→ ERP (SAP, Microsoft Dynamics, etc.)                        │
│       ├─→ POS (in-store retail)                                      │
│       ├─→ CRM (Salesforce, HubSpot, custom)                          │
│       ├─→ Website (JavaScript SDK)                                   │
│       ├─→ Mobile apps (iOS + Android SDKs)                           │
│       ├─→ Customer service (Zendesk, etc.)                           │
│       ├─→ Email tools (legacy migration)                             │
│       └─→ Custom event sources (API)                                 │
│                  │                                                   │
│                  ▼                                                   │
│   [Output channels]                                                  │
│       │                                                              │
│       ├─→ Email (drag & drop campaigns)                              │
│       ├─→ SMS (global)                                               │
│       ├─→ Mobile push + In-app                                       │
│       ├─→ Web (weblayers, dynamic content)                           │
│       ├─→ Google Ads (Customer Match)                                │
│       ├─→ Meta Ads (Facebook, Instagram)                             │
│       ├─→ TikTok, Pinterest, LinkedIn                                │
│       └─→ Custom via webhook (WhatsApp, voice, print)                │
│                  │                                                   │
│                  ▼                                                   │
│   [End customers / Audience]                                         │
│       │                                                              │
│       ├─→ Anonymous web visitors                                     │
│       ├─→ Subscribers (email)                                        │
│       ├─→ Customers (transactional)                                  │
│       ├─→ Loyalty members                                            │
│       ├─→ Mobile app users                                           │
│       └─→ Cross-channel unified profiles                             │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér | Vstupní bod | Co dělá | Co vidí |
|---|---|---|---|
| **Customer admin** | Web login | Vše, billing, users | Vše |
| **Marketing manager** | Web login | Strategy, campaigns | Per role |
| **Email marketer** | Web login | Email campaigns | Per role |
| **Data analyst** | SQL interface | Custom queries, reports | Per scope |
| **Developer** | API + webhooks | Integrations, custom code | Per scope |
| **End customer** | Email / SMS / push / web | Engage | Vlastní profil |
| **Anonymous visitor** | Web | Browse, get tracked | Cookie ID |
| **Bloomreach support** | Help desk | Issue resolution | s consent |
| **Bloomreach consultant** | Engagement | Strategy, implementation | s consent |
| **Bloomreach sales** | Sales process | Discovery, contracts | s consent |
| **Actum Digital** | Partner portal | Implementation, ongoing | Per project |
| **Adastra** | Partner portal | Implementation, ongoing | Per project |
| **Custom partner** | Per agreement | Per agreement | Per agreement |

---

## 2. Sales & qualification flow (enterprise)

### 2.1 Lead sources Bloomreach

```
Bloomreach lead sources:
- bloomreach.com inbound (medium organic)
- Analyst reports (Gartner, Forrester)
- Industry conferences (NRF, Shoptalk)
- Partner referrals (Actum, Adastra)
- Customer referrals (NPS-driven)
- Outbound sales (enterprise)
- Existing Bloomreach Discovery/Content
  customers cross-sell to Engagement
- Exponea legacy customers
- Webinars + content marketing
- LinkedIn ads (B2B)
```

### 2.2 Qualification kritéria

```
Bloomreach fits pokud:

✅ Mid-market+ ecommerce (€5M+ revenue)
✅ B2C primary (B2B limited fit)
✅ Multi-channel customer base
✅ Real-time personalization need
✅ CDP need + Marketing Automation
✅ Tech-mature team
✅ Implementation budget (6-12 mo)
✅ Annual contract OK
✅ Long-term partnership mindset
✅ Loyalty + retention focus
✅ Cross-channel orchestration priority

❌ SMB / startup (< €5M)
❌ Pure B2B SaaS
❌ Single-channel only
❌ Need quick TTV (< 3 mo)
❌ Public pricing required
❌ Limited internal tech team
❌ Budget < $50K/year all-in
❌ Need free trial first
❌ Multi-vendor preference
```

### 2.3 Outbound sales flow

```
Enterprise outbound:
1. Account research (revenue, tech stack, growth)
2. Stakeholder identification (CMO, CTO, COO)
3. Cold outreach (email, LinkedIn)
4. Discovery call request
5. Initial 30-min call
6. Stakeholder workshop
7. Demo personalized
8. Technical deep-dive
9. Reference customer call
10. Proposal + pricing
11. Negotiation
12. Contract signing
13. Implementation kick-off
```

### 2.4 Inbound sales flow

```
Inbound lead flow:
1. Visit bloomreach.com
2. Resources consumed (whitepapers, case studies)
3. Demo request form filled
4. SDR qualification call (15-30 min)
5. AE assigned
6. Discovery call
7. Personalized demo
8. Stakeholder meetings
9. Technical evaluation
10. Pricing proposal
11. Contract
```

### 2.5 Sales cycle reality

```
Sales cycle length:
- SMB-like deals: avoid (not target)
- Mid-market: 3-6 měsíců
- Enterprise: 6-12+ měsíců
- Multi-region: 12-18 měsíců

Stakeholders involved:
- CMO (champion typically)
- CTO/CIO (technical)
- CFO (budget approver)
- Procurement (large orgs)
- Legal (DPA, GDPR)
- Marketing ops (user)
- Data team (CDP)
```

---

## 3. Demo + discovery + custom quote flow

### 3.1 Demo flow

```
Demo experience:

1. Discovery call (60 min):
   - Current setup (email tool, CDP, etc.)
   - Pain points
   - Goals (KPIs)
   - Timeline
   - Budget range
   - Decision-makers
   - Competitive evaluations

2. Tailored demo (90 min):
   - Specific use cases shown
   - Customer 360 walkthrough
   - Journey builder demo
   - Loomi AI features
   - Real-time examples
   - Industry-specific scenarios

3. Technical deep-dive (90 min):
   - Architecture overview
   - API + webhooks
   - Data ingestion options
   - Migration approach
   - Security + GDPR
   - SLA + support

4. Reference customer call:
   - Optional but recommended
   - Similar industry/size
   - Open Q&A
   - Honest feedback

5. Custom proposal:
   - Module selection
   - Event volume estimate
   - Pricing structure
   - Implementation scope
   - Partner recommendation
   - Timeline + milestones
```

### 3.2 Custom quote calculation

```
Quote inputs:

Module selection:
- Email: Y/N
- SMS: Y/N
- Mobile push: Y/N
- Web personalization: Y/N
- Advertising: Y/N
- Custom channels: Y/N
- Reports: Y/N (basic vs. advanced)

Usage volume:
- Monthly events estimate
- Email sends per month
- SMS sends per month
- Push notifications per month
- Weblayer impressions
- API calls

Customer profile:
- Total customers (informational)
- Active customers (informational)
- Growth rate expected
- Geographic regions

Modifiers:
- Annual vs. multi-year
- Implementation scope
- Partner involvement
- Support tier
- Custom integrations
   ↓
Custom quote dorucen
```

### 3.3 Per Bloomreach reality

```
Pricing realities:
- Žádný public list price
- Sales-driven custom quote
- Annual minimums
- Multi-year discounts available
- Implementation separately quoted
- Support tier separately

Typical ranges (industry estimates):
- Mid-market: $36K-$120K/year
- Upper mid: $120K-$360K/year
- Enterprise: $360K+/year
- + Implementation 1-3× annual
- + Partner fees (Actum/Adastra)
```

### 3.4 Negotiation patterns

```
Negotiation levers:
- Multi-year commitment → 10-20% off
- Annual upfront → small discount
- Module bundling → discount
- Reference customer agreement → discount
- Co-marketing case study → discount
- New region expansion → growth pricing
- Migration credits from competitor → bonus
```

⚠️ **Sales-driven custom** = standard enterprise SaaS approach.

---

## 4. Onboarding + implementation (3-12 měsíců)

### 4.1 Implementation phases

```
Implementation timeline:

PHASE 1: Strategy + Discovery (2-4 týdny)
- Use case prioritization
- Success metrics (KPIs)
- Stakeholder alignment
- Roadmap creation
- Quick wins identification

PHASE 2: Technical Setup (4-8 týdnů)
- Account provisioning
- User management setup
- BrandKit configuration
- Authentication setup
- DNS + email authentication
- API key provisioning

PHASE 3: Data Integration (4-12 týdnů)
- Source system identification
- Data mapping
- Identity resolution rules
- Migration historical data
- Real-time event streaming setup
- QA + validation

PHASE 4: Use Case Implementation (8-16 týdnů)
- Welcome series
- Abandoned cart
- Post-purchase
- Re-engagement
- Custom scenarios
- A/B test setup
- Personalization rules

PHASE 5: Testing + UAT (4-8 týdnů)
- End-to-end testing
- Edge case handling
- Performance testing
- Compliance verification
- User acceptance

PHASE 6: Launch (2-4 týdny)
- Phased rollout
- Real-time monitoring
- Performance optimization
- Issue resolution
- Stakeholder updates

PHASE 7: Optimization (continuous)
- Quarterly business reviews
- Use case expansion
- Performance optimization
- Loomi AI training
- New feature adoption
```

### 4.2 Implementation challenges

```
Common challenges:
- Data quality issues (source systems)
- Identity resolution rules
- Migration completeness
- Edge case handling
- Custom integration scope creep
- Internal team learning curve
- Stakeholder alignment
- Compliance complexity (GDPR)
- Multi-region coordination
- Performance optimization
```

### 4.3 Per oficiální G2 user

> *"Time to market geeft ons de grootste voordeel. We kunnen snel schakelen voor campagnes in soms wel 10 landen."*

(Překlad: "Time-to-market nám dává největší výhodu. Můžeme rychle přepínat kampaně někdy až v 10 zemích.")

```
Post-implementation benefit:
- Multi-country campaigns: rapid
- 10+ markets manageable
- One platform, many regions
- Consistent personalization
- Localized execution
```

### 4.4 Self-implementation vs. partner

```
Self-implementation:
- Cost: 0 partner fees
- Risk: high
- Timeline: 6-12+ měsíců
- Team: 3-5 FTE during
- Knowledge: built internally
- Best for: tech-mature teams

Partner-led (Actum, Adastra):
- Cost: $50K-300K typical
- Risk: lower
- Timeline: 3-9 měsíců
- Team: 1-2 FTE during
- Knowledge: external + transfer
- Best for: standard implementations
```

---

## 5. Partner-led implementation (Actum, Adastra)

### 5.1 Klíčoví CZ/SK partneři

```
ACTUM DIGITAL:
- Praha (HQ) + Brno
- Founded 2002
- Bloomreach certified
- Specialization: e-commerce, retail
- References: SIKO, etc.
- Services:
  - Implementation
  - Custom development
  - Ongoing support
  - Strategy consulting
  - Migration projects

ADASTRA:
- Praha (HQ) + multi-country
- BI + CRM heritage
- Bloomreach long-term partner
- Specialization: enterprise, banking, telco
- References: UBB, Raiffeisen, O2 CZ
- Services:
  - Implementation
  - Data engineering
  - Campaign management
  - Custom analytics
  - Strategic consulting
```

### 5.2 Per Adastra (oficiální)

> *"This recognition reflects our long-term partnership with Bloomreach and our combined ability to deliver world-class, data-driven customer experience solutions for data-rich organizations."*

### 5.3 Per Actum (oficiální o SIKO)

> *"Once completed a managed development roadmap had to be established to satisfy the needs of the customers on B2C websites in 3 countries. Furthermore, the need for hyperpersnalized communication led to implementation of Bloomreach Engagement platform."*

### 5.4 Partner-led flow

```
Partner engagement flow:

1. Bloomreach AE introduces partner
2. Joint stakeholder meeting
3. Partner scope assessment
4. Partner statement of work (SOW)
5. Implementation kick-off
6. Joint project management
7. Bloomreach consultant + partner team
8. Regular sync meetings (weekly)
9. UAT joint testing
10. Launch joint support
11. Handover documentation
12. Ongoing partner support (optional)
```

### 5.5 Partner certifications

```
Partner certification levels:
- Certified Partner (basic)
- Premier Partner (advanced)
- Elite Partner (top tier)

Requirements:
- Implementation count
- Customer satisfaction
- Technical capabilities
- Ongoing training
- Business volume
```

### 5.6 Per SIKO use case (Actum)

```
SIKO + Actum + Bloomreach:

Year 1:
- Bloomreach Engagement implementation
- Web personalization setup
- Email automation
- Multi-country (CZ, SK, HU)

Year 2-3:
- Continuous optimization
- New use cases
- Hyperpersonalization expansion
- Hungarian market launch
- Internal team training

Long-term:
- Strategic partnership
- Ongoing development
- Tech transformation
```

---

## 6. Customer Data Engine (CDE) ingestion

### 6.1 Data sources

```
Typical data sources ingested:

E-COMMERCE PLATFORM:
- Products catalog
- Orders + transactions
- Cart data (real-time)
- Customer accounts
- Inventory data
- Returns + refunds

WEBSITE:
- Page views (JavaScript SDK)
- Click events
- Form submissions
- Search queries
- Filter interactions
- Time on page

MOBILE APP:
- iOS SDK events
- Android SDK events
- App version
- Session data
- Push tokens
- In-app behavior

CRM:
- Contact data
- Lifecycle stages
- Support tickets
- Sales interactions
- Account data

ERP:
- Customer master data
- Transactions
- Financial data
- Loyalty status

POS:
- In-store purchases
- Loyalty card scans
- In-store events
- Staff interactions

THIRD-PARTY:
- Email engagement (legacy)
- SMS engagement
- Ad platform data
- Social media data
- Customer reviews

CUSTOM:
- Any event via API
- Server-side ingestion
- Batch imports
- Real-time streams
```

### 6.2 Ingestion methods

```
Ingestion methods:

REAL-TIME:
- JavaScript SDK (web)
- Mobile SDKs (iOS, Android)
- API events
- Webhook ingestion
- Server-to-server

BATCH:
- CSV imports
- Database imports
- Scheduled syncs
- API bulk endpoints

STREAMING:
- Kafka integration
- AWS Kinesis
- Real-time database sync
- Change data capture (CDC)
```

### 6.3 Data unification flow

```
Unification process:

1. Event arrives at CDE
2. Identity matching:
   - Email match
   - Cookie ID match
   - Phone match
   - Customer ID match
   - Device ID match
3. Profile created or updated
4. Event stored
5. Real-time scores calculated:
   - LTV
   - Churn risk
   - Engagement score
6. Segment membership updated
7. Triggers evaluated
8. Actions executed
   ↓
ALL < 100ms typical
```

### 6.4 Data quality

```
Quality checks:
- Duplicate detection
- Invalid email validation
- Phone number normalization
- Geographic enrichment
- Profile completeness scoring
- Consent verification
- GDPR compliance markers
```

---

## 7. Identity resolution flow

### 7.1 Identity matching strategies

```
Deterministic matching:
- Email = Email (exact)
- Customer ID = Customer ID
- Phone = Phone (normalized)
- Cookie ID (same device)

Probabilistic matching:
- Behavior patterns
- Device fingerprinting
- Geographic patterns
- Time-based correlation
   ↓
Configurable rules
Customer can decide preference
```

### 7.2 Cross-device + cross-channel

```
Identity unification scenarios:

SCENARIO 1: Anonymous → Known
- Anonymous visitor browses
- Subscribes newsletter
- Email = identity anchor
- All past anonymous events → known profile

SCENARIO 2: Cross-device
- Mobile app login (user ID)
- Same user on web (cookie)
- Email match → unified
- All events merged across devices

SCENARIO 3: Online + Offline
- Web purchase (customer ID)
- In-store purchase (loyalty card)
- Phone in CRM matches
- Online + offline behavior unified
```

### 7.3 Profile management

```
Profile structure:

DEFAULT FIELDS:
- Email (unique)
- First name, last name
- Phone
- Address
- Date of birth
- Gender
- Language
- Country

CUSTOM ATTRIBUTES:
- LTV
- Churn score
- Engagement score
- Last purchase date
- Total orders
- Average order value
- Preferred categories
- Loyalty tier
- Custom fields per business

EVENT HISTORY:
- All past events
- Behavioral data
- Transactional data
- Communication interactions
- Engagement metrics

PREDICTIONS (Loomi):
- Next likely purchase
- Best send time
- Preferred channel
- Optimal frequency
- Churn probability
```

---

## 8. Real-time event processing

### 8.1 Event types

```
Event categories:

BROWSING EVENTS:
- page_view
- product_view
- category_view
- search_performed
- filter_applied
- cart_view

INTERACTION EVENTS:
- click (button, link)
- form_submission
- email_open
- email_click
- push_received
- push_opened

TRANSACTIONAL EVENTS:
- purchase
- order_status_change
- refund
- subscription_renewed
- subscription_cancelled

CART EVENTS:
- add_to_cart
- remove_from_cart
- cart_abandoned
- cart_purchased

CUSTOMER EVENTS:
- registration
- login
- logout
- profile_update
- preference_change
- consent_change

CUSTOM EVENTS:
- Any business-specific event
- Defined per customer
- Via API
```

### 8.2 Processing flow

```
Real-time event flow:

1. Event captured at source
2. Sent to Bloomreach (SDK/API)
3. Validation (schema, auth)
4. Profile lookup/creation
5. Event stored in CDE
6. Real-time triggers evaluated:
   - Scenarios listening?
   - Conditions met?
   - Frequency caps OK?
   - Consent valid?
7. Actions executed (if triggered):
   - Email queued
   - SMS sent
   - Push sent
   - Weblayer prepared
   - Webhook fired
8. Performance metrics updated
9. Loomi AI learns from outcome
   ↓
ALL typically < seconds
```

### 8.3 Trigger configuration

```
Trigger setup in scenarios:

EVENT TRIGGER:
- "Customer abandons cart"
- Filter: cart_value > €50
- Wait: 30 minutes
- Action: send abandoned cart email

TIME TRIGGER:
- "Day of birthday"
- Action: send birthday email + discount

BEHAVIORAL TRIGGER:
- "Customer browses 3+ products in category X"
- Action: show category-specific recommendation

LIFECYCLE TRIGGER:
- "Customer not purchased in 90 days"
- Action: re-engagement series

CUSTOM TRIGGER:
- API-defined event
- Webhook initiation
- Any business logic
```

---

## 9. Loomi AI training + optimization

### 9.1 Loomi AI training

```
Loomi AI learns from:

CUSTOMER BEHAVIOR:
- Email opens (per user)
- Click patterns
- Purchase behavior
- Browse history
- Channel preferences

CAMPAIGN PERFORMANCE:
- Subject lines effectiveness
- Send times optimal
- Content variations
- A/B test results
- Conversion patterns

CROSS-CUSTOMER PATTERNS:
- Similar customer behavior
- Industry benchmarks
- Time-of-day patterns
- Day-of-week patterns
- Seasonal trends
```

### 9.2 Loomi AI optimization features

```
Optimization capabilities:

SEND TIME OPTIMIZATION:
- Per-customer optimal send time
- Time zone aware
- Behavior-based prediction
- Day-of-week patterns
- Hour-of-day patterns

SUBJECT LINE OPTIMIZATION:
- A/B testing automated
- Sentiment analysis
- Length optimization
- Emoji effectiveness
- Personalization tokens

CONTENT OPTIMIZATION:
- Image selection
- CTA button placement
- Copy variations
- Recommended products
- Dynamic offers

AUDIENCE OPTIMIZATION:
- Segment refinement
- Lookalike audiences
- Excluded customers
- Engagement-based segments
- Predicted segments

CAMPAIGN OPTIMIZATION:
- Frequency capping
- Channel selection
- Sequence ordering
- Drop-off prevention
- Goal optimization
```

### 9.3 Continuous learning loop

```
Loomi learning cycle:

1. Initial setup (Day 0):
   - Baseline data ingested
   - Industry benchmarks applied
   - Default AI models

2. First 30 days:
   - Learning customer base
   - Building predictions
   - Initial A/B tests
   - Pattern recognition

3. Day 30+:
   - Personalized predictions
   - Optimized send times
   - Better recommendations
   - Smarter segmentation

4. Day 90+:
   - Mature predictions
   - Reliable LTV scores
   - Accurate churn detection
   - Highly personalized

5. Ongoing:
   - Continuous A/B tests
   - Drift detection
   - Model retraining
   - New feature adoption
   ↓
Always learning, always improving
```

### 9.4 Per Allwyn case study

```
Allwyn Loomi adoption:

Pre-Bloomreach:
- 2 legacy campaign systems
- Manual orchestration
- Limited personalization
- Disjointed channels

Post-Bloomreach (Loomi):
- 1 unified platform
- 11 channels orchestrated
- AI-driven personalization
- Multi-team workspace
- Rapid adoption across departments
   ↓
"Simple, intuitive UI"
```

---

## 10. Scenario builder + journey orchestration

### 10.1 Scenario building

```
Scenario builder workflow:

1. New scenario → choose template:
   - Welcome series
   - Abandoned cart
   - Post-purchase
   - Re-engagement
   - Win-back
   - Custom (blank)

2. Set entry trigger:
   - Event-based
   - Time-based
   - Segment-based
   - Custom

3. Build flow (drag & drop):
   - Add steps
   - Configure each step:
     - Channel
     - Content
     - Timing
     - Conditions
   - Connect steps
   - Add branches

4. Configure conditions:
   - If/else logic
   - Multiple paths
   - Time conditions
   - Behavior conditions

5. Set exit criteria:
   - Goal achieved
   - Time elapsed
   - Action taken
   - Manual exit

6. A/B test setup (optional):
   - Path variations
   - Statistical settings
   - Winner criteria

7. Test mode:
   - Run with test profiles
   - Verify each step
   - Check edge cases

8. Activate scenario
9. Monitor performance
10. Optimize ongoing
```

### 10.2 Per G2 review

> *"Despite its power, the interface is intuitive. Marketers can build complex, personalized customer journeys and perform A/B testing without needing a constant line to the dev team."*

### 10.3 Pre-built scenarios

```
Out-of-box scenarios:

WELCOME SERIES:
- Day 0: Welcome + discount
- Day 3: Brand story
- Day 7: Best products
- Day 14: Cross-category

ABANDONED CART:
- 30 min: Reminder email
- 4 hours: SMS reminder
- 24 hours: Discount offer
- 72 hours: Final urgency

POST-PURCHASE:
- Day 0: Order confirmation
- Day 1: Shipping notification
- Day 7: Care tips
- Day 30: Review request
- Day 60: Repurchase

RE-ENGAGEMENT:
- 90 days inactive: Soft outreach
- 120 days: Discount offer
- 180 days: Last chance
- Exit: Win-back or sunset

VIP TIER:
- Loyalty milestone reached
- Welcome to tier
- Exclusive benefits
- Personalized offers

BIRTHDAY/ANNIVERSARY:
- Day of: Discount
- 7 days before: Reminder
- 3 days after: Re-engage if not used
```

---

## 11. Email campaign flow

### 11.1 Email campaign creation

```
Email campaign workflow:

1. Campaign → New email
2. Type selection:
   - Newsletter (one-off)
   - Triggered (in scenario)
   - Transactional
3. Audience definition:
   - All customers (rare)
   - Segment selection
   - Custom query
4. Template selection:
   - Pre-built templates
   - Custom templates
   - From scratch
5. Content creation:
   - Drag & drop editor
   - HTML editor (advanced)
   - Personalization tokens
   - Dynamic content blocks
   - Product recommendations
6. Subject line:
   - A/B testing setup
   - Loomi AI suggestions
7. Send time:
   - Immediate
   - Scheduled
   - Optimal time (Loomi)
   - Per-recipient optimization
8. Compliance:
   - Unsubscribe link
   - Physical address
   - GDPR consent verified
9. Test sends:
   - Preview multiple devices
   - Test profiles
   - Inbox testing
10. Final review + launch
11. Real-time monitoring
12. Post-campaign analytics
```

### 11.2 Personalization layers

```
Personalization depth:

LEVEL 1 - Basic:
- {firstName} token
- {customField} tokens
- Static segments

LEVEL 2 - Dynamic:
- Conditional blocks
- Different content per segment
- Geographic personalization
- Time zone aware sending

LEVEL 3 - Real-time:
- Live inventory
- Real-time pricing
- Recent behavior
- Predicted next action
- Recommended products

LEVEL 4 - AI-driven (Loomi):
- 1:1 personalization
- Predicted optimal content
- Dynamic image selection
- Auto-generated subject lines
- Self-optimizing campaigns
```

### 11.3 Dynamic content example

```
Email with dynamic blocks:

Block 1: Hero image
- If: VIP customer
  → "Welcome back, [Name]" + product
- If: First-time customer  
  → "Welcome to [Brand]" + intro
- If: Returning churned
  → "We miss you, [Name]" + special offer

Block 2: Product recommendations
- Source: Loomi AI per-recipient
- Algorithm: collaborative filtering
- Fallback: trending products
- Quantity: 4 products

Block 3: CTA
- VIP: "View exclusive collection"
- New: "Shop bestsellers"
- Returning: "See what's new"

Block 4: Footer
- Standard
- Unsubscribe + preferences
- Physical address
```

---

## 12. SMS Flow (global!)

### 12.1 SMS campaign workflow

```
SMS campaign flow:

1. Campaign → New SMS
2. Audience:
   - SMS opted-in only
   - Compliance verification
3. Compose message:
   - 160 chars (1 SMS)
   - Or longer (multipart)
   - URL shortener integrated
   - Personalization tokens
4. Compliance:
   - Sender ID
   - "Reply STOP" included
   - GDPR consent verified
5. Test send
6. Schedule:
   - Quiet hours respected
   - Time zone aware
   - Optimal time (Loomi)
7. Send
8. Tracking:
   - Delivery confirmation
   - URL clicks
   - 2-way responses
   - Opt-outs
```

### 12.2 Global SMS coverage

```
Bloomreach SMS reach:

✅ Europe (all major)
✅ USA + Canada
✅ UK + Ireland
✅ APAC (limited)
✅ Latin America
✅ Middle East (selected)
✅ Africa (selected)

ROZDÍL od Constant Contact:
- CC: USA only
- Bloomreach: globally

Pricing varies:
- Per geo
- Per volume
- Per carrier
- Per number type (long code, short code)
```

### 12.3 Use case SMS

```
Effective SMS use cases:

CART ABANDONMENT (real-time):
- 4 hours after abandonment
- Personalized to cart contents
- Discount code optional
- Direct link to cart

FLASH SALE:
- Urgent messaging
- Time-limited offer
- Personalized discount
- Direct link

EVENT REMINDER:
- 1 day before
- Day-of
- 1 hour before
- Location/link

DELIVERY UPDATES:
- Shipped notification
- Out-for-delivery
- Delivered
- Track link

LOYALTY:
- Tier upgrade notification
- Special offer
- Birthday wish + discount
- VIP access
```

---

## 13. Mobile push + In-App flow

### 13.1 Mobile push flow

```
Push notification workflow:

1. Setup phase:
   - SDK integration in app
   - Push tokens collected
   - Profile linked to token
   - Permission status tracked

2. Campaign creation:
   - Title + body text
   - Rich media (image, video)
   - Action buttons
   - Deeplinking URL
   - Personalization tokens

3. Audience:
   - All subscribers (rare)
   - Segment-based
   - Behavior-based
   - Geo-fenced

4. Scheduling:
   - Immediate
   - Scheduled time
   - Optimal per-user
   - Triggered (event-based)

5. Send + track:
   - Delivery confirmation
   - Open rate
   - Click rate (deeplink)
   - Conversion attribution
```

### 13.2 In-App messaging

```
In-app messages flow:

TYPES:
- Banner (top/bottom)
- Modal pop-up
- Full-screen takeover
- Floating button
- Card carousel
- Custom HTML

TRIGGERS:
- App opened
- Specific screen viewed
- Action taken (button click)
- Time-based (after X seconds)
- Behavior pattern

CONTENT:
- Onboarding flows
- Promotional offers
- Surveys
- Feedback collection
- Feature announcements
- Customer service intercept

OPTIMIZATION:
- A/B testing
- Loomi AI optimization
- Per-user targeting
- Frequency capping
```

### 13.3 Per Allwyn case (mobile focus)

```
Allwyn mobile activation:

Before Bloomreach:
- Rich push under-utilized
- In-app messages limited
- Mobile = secondary channel

With Bloomreach:
- 11 channels including mobile rich push
- In-app messaging activated
- Mobile = primary engagement
- Real-time personalization mobile
- VIP management via mobile
   ↓
Lottery/gaming UX modernized
```

---

## 14. Web personalization + Weblayers

### 14.1 Weblayer setup flow

```
Weblayer creation:

1. JavaScript SDK on website
2. Cookie tracking enabled
3. New weblayer → choose type:
   - Pop-up
   - Banner
   - Slide-in
   - Welcome mat
   - Inline
4. Design (drag & drop):
   - Layout
   - Content blocks
   - Images
   - Forms
   - CTA buttons
5. Trigger configuration:
   - Page-specific
   - Exit intent
   - Scroll percentage
   - Time on page
   - Specific behavior
   - Custom events
6. Audience targeting:
   - New visitors
   - Returning visitors
   - Specific segment
   - Geographic
   - Device type
7. Frequency capping:
   - Once per visit
   - Once per day
   - Once per customer
   - Custom rules
8. A/B testing
9. Activate
10. Monitor performance
```

### 14.2 Dynamic content on web

```
Dynamic content scenarios:

HERO BANNER:
- Per-customer hero image
- Welcome message personalized
- Offer relevant to user
- Loyalty tier visible

PRODUCT GRID:
- Recommended products
- Recently viewed
- Cross-sell
- Personalized order

CONTENT BLOCKS:
- Article recommendations
- Personalized blog posts
- Category-specific content

CTA BUTTONS:
- Loyalty-tier specific
- Behavior-driven
- Time-sensitive offers
```

### 14.3 Per HP Tronic flow

```
HP Tronic / Datart welcome weblayer:

1. New visitor enters Datart.cz
2. Cookie set, identified as new
3. JavaScript SDK detects
4. Weblayer triggered:
   - €20 voucher offer
   - No email needed
   - Direct copy code
5. Customer copies voucher
6. Shops on Datart
7. Voucher applied at checkout
   ↓
Result CZ: 16.4% conversion (+136%)
Result SK: 15.2% conversion (+133%)
```

⚠️ **Key:** "No back-end implementation needed" – pouze JS SDK + Bloomreach config.

---

## 15. Advertising Audience Sync

### 15.1 Audience sync flow

```
Ads audience sync:

1. Create segment in Bloomreach
2. Select sync destination:
   - Google Customer Match
   - Meta Custom Audiences
   - TikTok Custom Audiences
   - LinkedIn Matched Audiences
3. Map data fields:
   - Email (hashed)
   - Phone (hashed)
   - Mobile advertiser ID
4. Sync settings:
   - One-time sync
   - Real-time updates
   - Bi-directional
5. Activate sync
6. Use audience in ad platform
7. Track ROAS back in Bloomreach
   ↓
Cross-channel attribution
```

### 15.2 Ad use cases

```
Smart retargeting:

NON-ENGAGERS:
- Email subscribers who don't open
- Sync to FB + Google
- Display ads
- Win them back

CART ABANDONERS:
- Real-time cart event
- Sync immediately
- Dynamic product ads
- Recover sales

LOOKALIKES:
- Seed: high-LTV customers
- Sync to Meta
- Create lookalike
- Acquisition ads

EXCLUSIONS:
- Existing customers
- Sync to ad platforms
- Exclude from acquisition ads
- Save spend

REACTIVATION:
- Churned customers
- Sync to platforms
- Special offer ads
- Win-back attempts
```

### 15.3 ROAS attribution

```
Cross-channel attribution:

1. Ad clicked → conversion (Google)
2. Email triggered → conversion (Bloomreach)
3. Push received → app open → purchase (Mobile)
4. Multi-touch model applied:
   - First touch
   - Last touch
   - Linear
   - Time decay
   - Data-driven (Loomi)
5. ROI calculated per channel
6. Budget reallocation insights
   ↓
Smart attribution
```

---

## 16. Segmentation + Dynamic Audiences

### 16.1 Segment creation

```
Segment builder flow:

1. Audiences → New segment
2. Define conditions:
   - Attribute conditions (age, country)
   - Behavior conditions (purchased X)
   - Event conditions (visited page Y)
   - Predictive (high churn risk)
3. AND / OR / NOT logic
4. Nested conditions
5. Real-time vs. static
6. Preview count
7. Save segment
8. Use in:
   - Campaigns
   - Scenarios
   - Web personalization
   - Ad sync
   - Reports
```

### 16.2 Predictive segments (Loomi)

```
Predictive segments:

LIFETIME VALUE:
- High LTV ($1000+)
- Medium LTV
- Low LTV
- Predicted growth

CHURN RISK:
- High risk (likely to churn)
- Medium risk
- Stable
- Loyal

PURCHASE PROPENSITY:
- Likely to purchase 7 days
- Likely to purchase 30 days
- Inactive
- Browsing only

CHANNEL PREFERENCE:
- Email responsive
- SMS responsive
- Push responsive
- Multi-channel

ENGAGEMENT:
- Highly engaged
- Moderately engaged
- Low engaged
- Sleeper
```

### 16.3 RFM analysis

```
RFM segmentation:

Recency (R):
- 1: 0-30 days
- 2: 31-60 days
- 3: 61-90 days
- 4: 91-180 days
- 5: 180+ days

Frequency (F):
- 1: 10+ purchases
- 2: 5-9 purchases
- 3: 3-4 purchases
- 4: 2 purchases
- 5: 1 purchase

Monetary (M):
- 1: $1000+ total
- 2: $500-999
- 3: $200-499
- 4: $100-199
- 5: $0-99

5×5×5 = 125 cells
Personalized messaging each:
- Champions (R5,F5,M5)
- Loyal customers
- At-risk
- Hibernating
- Lost
```

---

## 17. A/B Testing + Experimentation

### 17.1 A/B test setup

```
A/B test flow:

1. Identify hypothesis
   - "Subject A vs B"
   - "Image position A vs B"
   - "CTA copy A vs B"
   - "Timing A vs B"

2. Setup test:
   - Variation A
   - Variation B (or more)
   - Split percentage
   - Sample size calculator
   - Statistical significance threshold

3. Run test:
   - Wait for sufficient sample
   - Real-time results
   - Confidence intervals

4. Winner determined:
   - Statistical significance reached
   - Loomi AI can predict winner
   - Sequential testing supported

5. Apply winner:
   - 100% remaining audience
   - Document learnings
   - Apply to future campaigns
```

### 17.2 Multivariate testing

```
MVT capabilities:
- 4+ variations
- Multiple dimensions
- Combinations tested
- Larger sample needed
- More insights per test
- Used for big decisions
```

### 17.3 Per G2 review

> *"Marketers can build complex, personalized customer journeys and perform A/B testing without needing a constant line to the dev team."*

⚠️ **Self-serve A/B testing** = key marketer empowerment.

---

## 18. Recommendations Engine Flow

### 18.1 Recommendation setup

```
Recommendations config:

1. Choose algorithm:
   - Collaborative filtering
   - Content-based
   - Hybrid
   - Real-time behavior
   - Loomi optimized

2. Define context:
   - Email (different per email)
   - Web (different per page)
   - Push notifications
   - In-app
   - SMS (text-based)

3. Set parameters:
   - Number of products
   - Include/exclude rules
   - Inventory checks
   - Price range
   - Category filters
   - Diversity rules

4. Use in templates:
   - Drag & drop block
   - Configurable per slot
   - Auto-personalized

5. A/B test algorithms:
   - Test collaborative vs. behavior
   - Test 4 vs. 6 products
   - Optimize per use case
```

### 18.2 Per G2 user

> *"I like that Bloomreach offers dynamic recommendations based on the user, utilizing different algorithms. It's pretty okay for personalization, recommending products based on the data you provide."*

### 18.3 Use case product recommendations

```
Email with recommendations:

1. Email triggered for customer Jane
2. Loomi looks at Jane's:
   - Past purchases
   - Browse history
   - Similar customers
   - Inventory available
3. Generates 4 product recs:
   - 2 collaborative-based
   - 2 behavior-based
4. Inserted into email
5. Email sent
6. Click tracking
7. Conversion attribution
8. Algorithm learns from outcome
```

---

## 19. Reporting + Analytics Consumption

### 19.1 Reporting hierarchy

```
Reporting layers:

LIVE DASHBOARDS:
- Real-time KPIs
- Campaign performance
- Channel performance
- Revenue impact

OUT-OF-BOX REPORTS:
- Campaign performance
- Channel attribution
- Customer journey
- Funnel analysis
- Cohort analysis
- Revenue reports

CUSTOM REPORTS:
- SQL-like queries
- Drag & drop builder
- Real-time data
- Scheduled delivery
- Export options (CSV, API)

PREDICTIVE REPORTS:
- LTV forecasting
- Churn prediction
- Revenue forecasts
- Growth scenarios
```

### 19.2 Per G2 critique

> *"While the campaign execution is great, the reporting dashboards leave a bit to be desired. Building out custom, granular reports on email performance or A/B tests can feel clunky and take longer than they should."*

```
Reporting realities:
- Out-of-box reports: GOOD
- Custom dashboards: clunky (per users)
- Real-time data: EXCELLENT
- SQL access: powerful but requires skill
- Export options: COMPREHENSIVE
- Loomi insights: ADVANCED
```

### 19.3 Stakeholder consumption

```
Per role report consumption:

EXECUTIVES (weekly):
- Revenue attribution
- Channel mix
- LTV trends
- Top campaigns

MARKETING MANAGERS (daily):
- Campaign performance
- A/B test results
- Audience health
- Funnel drop-offs

EMAIL MARKETERS (per campaign):
- Open rates
- CTR
- Conversion
- Revenue per email
- Engagement breakdown

DATA ANALYSTS (custom):
- SQL queries
- Custom dashboards
- Deep dive analyses
- Predictive models
```

---

## 20. Webhooks + API Integration Patterns

### 20.1 Outbound webhooks

```
Webhook flow:

1. Event occurs in Bloomreach
2. Webhook fires automatically
3. POST to external endpoint
4. Custom code receives
5. Data processed
6. Optional callback to Bloomreach
7. Profile updated

Use cases:
- Send data to Motionlab (video gen)
- Update CRM system
- Trigger custom logic
- Sync to third-party
- Real-time integrations
```

### 20.2 API capabilities

```
Bloomreach API:

INBOUND (data into Bloomreach):
- Track events
- Update profiles
- Bulk operations
- Real-time push

OUTBOUND (data from Bloomreach):
- Retrieve profiles
- Get segment members
- Export data
- Read campaign stats

CONTROL:
- Start/stop campaigns
- Pause scenarios
- Update content
- Manage users

REAL-TIME:
- Streaming endpoints
- WebSocket support
- Event triggers
```

### 20.3 Custom channel example

```
WhatsApp custom integration:

1. Set up WhatsApp Business API
2. Connect via webhook
3. Bloomreach scenario:
   - Trigger: abandoned cart
   - Action: send WhatsApp message
   - Channel: webhook → WhatsApp API
4. WhatsApp delivers message
5. 2-way: customer responds
6. Response webhook → Bloomreach
7. Profile updated
8. Subsequent actions triggered
   ↓
Custom channel beyond native
```

---

## 21. MALL.CZ Personalized Video Case (Technical)

### 21.1 Full technical flow

```
MALL.CZ personalized video campaign:

PŘÍPRAVA:
- Cílová audience: 20 000 gamerů
- Cíl: Windows brand + device sales
- Personalized video per recipient
- Integration: Bloomreach + Motionlab

KROKY:

1. Bloomreach segmentation:
   - Filter: gamer profile
   - Behavior: gaming page views
   - Purchase history: PC parts
   - Demographic: target group

2. Audience export:
   - 20 000 records
   - Per-recipient data
   - Names, addresses
   - Preferences

3. Webhook to Motionlab:
   - Bloomreach sends data
   - Motionlab API receives
   - Personalization variables

4. Motionlab video generation:
   - Per-recipient video
   - Name + address inserted
   - Personalized scenes
   - Render queue

5. Video URL return:
   - Motionlab → Bloomreach API
   - URL per recipient
   - Stored in profile

6. Email campaign:
   - Drag & drop email
   - Personalized video embed
   - Per-recipient URL
   - CTA to MALL.TV

7. Email send:
   - Bloomreach sends 20 000 emails
   - Optimal time per user (Loomi)
   - Real-time tracking

8. Tracking:
   - Email opens
   - Video plays
   - CTA clicks
   - Purchases attributed

VÝSLEDKY (oficiální):
- CTR: 11× control group
- Purchase value: +701%
- 20 000 personalized videos delivered
- Brand awareness lift significant
```

### 21.2 Per Bloomreach oficiální

> *"Knowing personalization and segmentation were involved, it was safe to assume that Bloomreach Engagement had an important role in this campaign. However, Bloomreach's role extended further than helping personalize the video, the email campaign, and segmenting the audience receiving it. Bloomreach Engagement played the part of technical enablement with the data flow."*

> *"Webhooks enable custom integrations with APIs outside of Bloomreach, allowing data to be sent to or brought in from a third party."*

### 21.3 Why this case demonstrates power

```
MALL.CZ case shows:

✅ Real-time webhook orchestration
✅ Third-party API integration
✅ Custom workflow possible
✅ Massive scale (20K videos)
✅ Per-recipient personalization
✅ Multi-vendor coordination
✅ Email + video custom channel
✅ ROI demonstrable
   ↓
NOT possible with simple email tools
```

---

## 22. HP Tronic Weblayer Case (Technical)

### 22.1 Implementation timeline

```
HP Tronic / Datart weblayer:

PRE-IMPLEMENTATION:
- HP Tronic tried coupons via email
- Results poor
- Conversion challenges
- New approach needed

IMPLEMENTATION (1 month!):
- Bloomreach Engagement implementation
- JavaScript SDK on Datart.cz
- Cookie tracking enabled
- Weblayer designed
- Voucher logic created
- A/B testing setup

WEBLAYER SETUP:
- Trigger: new visitor (cookie-based)
- Display: welcome overlay
- Offer: €20 voucher
- Mechanism: copy code on-site
- No email required (key!)
- Direct use at checkout

LAUNCH:
- Weblayer activated
- Real-time monitoring
- A/B testing variations
- Optimization continuous

RESULTS:
- CZ: 16.4% conversion (+136%)
- SK: 15.2% conversion (+133%)
- Time-to-value: 2-3 weeks
- "No back-end implementation needed"
```

### 22.2 Per HP Tronic team

> *"You can really take a different approach with your customers when you have all of your customer data in one place. We really like that approach. We didn't need that many personnel resources from our side to get started with weblayers. You don't really need any back-end implementation or integration. You can run weblayers in two or three weeks."*

### 22.3 Key takeaway

```
Why HP Tronic case is significant:

✅ Quick time-to-value (2-3 weeks!)
✅ No back-end implementation needed
✅ Cookie-based identification
✅ No email required for first interaction
✅ Direct on-site value
✅ Measurable conversion lift
✅ Multi-country same approach (CZ + SK)
✅ Replicable use case

Demonstrates Bloomreach can deliver value FAST
when use case is well-defined.
```

---

## 23. Allwyn/Sazka Unified Channels Case

### 23.1 Allwyn implementation

```
Allwyn (Sazka) journey:

PRE-BLOOMREACH:
- 2 legacy campaign systems
- Disjointed tools
- Fragmented campaigns
- Personalization gaps
- Mobile underutilized
- Disconnected experience

CHALLENGE:
- Scale across 11 channels
- Unify customer view
- Personalize at 1:1
- Better mobile engagement
- VIP management

IMPLEMENTATION:
- Bloomreach Engagement
- Loomi AI activated
- 11 channels orchestrated
- Multi-team workspace

POST-BLOOMREACH:
- 1 platform
- 11 channels unified:
  - Email
  - SMS
  - Mobile push
  - In-app messaging
  - Web
  - Banner ads
  - Direct mail (some)
  - Social ads
  - VIP communications
  - Customer service
  - Loyalty platform
- Rapid team adoption
- "Simple, intuitive UI"
```

### 23.2 Per Allwyn (oficiální)

> *"One platform = campaign orchestration unlocked. Loomi AI replaced two legacy campaign systems, centralizing all messaging in a single workspace for multiple teams."*

> *"With 11 communication channels under one roof, Allwyn can deliver the right message, to the right customer, at the right time — across web, email, mobile, and more."*

### 23.3 Why Allwyn case is significant

```
Allwyn case demonstrates:

✅ Enterprise-scale orchestration
✅ Legacy system replacement
✅ Multi-channel unification
✅ Multi-team collaboration
✅ Gaming/lottery industry fit
✅ VIP management capabilities
✅ Mobile-first activation
✅ Rapid team adoption
   ↓
Suitable pro complex regulated industries
```

---

## 24. Continuous Optimization Cycle

### 24.1 Optimization rhythm

```
Continuous optimization:

DAILY:
- Real-time campaign monitoring
- Issue detection + resolution
- Performance tweaks

WEEKLY:
- Campaign performance review
- A/B test results
- Segment health
- Trigger optimization

MONTHLY:
- Use case expansion
- New scenarios launched
- Audience refinements
- Channel mix optimization

QUARTERLY:
- Business review
- KPI progress
- Strategic roadmap
- Bloomreach team meeting
- New feature adoption

ANNUALLY:
- Renewal preparation
- ROI analysis
- Strategic planning
- Contract negotiation
- Module expansion
```

### 24.2 Bloomreach Customer Success engagement

```
Customer Success cadence:

ONBOARDING (Months 1-3):
- Weekly check-ins
- Implementation oversight
- Quick win identification
- Knowledge transfer

ACTIVE OPTIMIZATION (Months 3-12):
- Bi-weekly check-ins
- Performance optimization
- Best practice sharing
- New feature introduction

MATURE (Year 2+):
- Monthly business reviews
- Quarterly strategic sessions
- Annual roadmap planning
- Expansion opportunities

CHURN RISK:
- Immediate intervention
- Executive escalation
- Custom solutions
- Retention specialist
```

### 24.3 Loomi AI continuous learning

```
AI optimization ongoing:

DAY 1: Baseline applied
DAY 30: Personal predictions begin
DAY 90: Mature predictions
DAY 180: Highly accurate
DAY 365+: Continuously refining

Self-optimization:
- A/B tests automatic
- Send times learning
- Subject lines optimizing
- Content variations
- Audience refinement
   ↓
Marketer focus shifts to strategy
```

---

## 25. Renewal + Expansion Flow

### 25.1 Renewal process

```
Renewal timeline (12 mo. cycle):

Month 9 (6 mo. before renewal):
- Customer Success initiates QBR
- ROI documentation
- Success metrics review
- Pain points identified

Month 10:
- Renewal options presented
- Expansion opportunities
- Pricing discussion
- New modules considered

Month 11:
- Contract negotiation
- Multi-year discount evaluation
- Implementation new modules
- Final approvals

Month 12:
- Contract signed
- Renewal complete
- Implementation ramps up
```

### 25.2 Expansion patterns

```
Common expansion paths:

CHANNEL EXPANSION:
- Add SMS module
- Add mobile push
- Add web personalization
- Add ads sync

GEOGRAPHIC EXPANSION:
- New country launches
- Multi-language support
- Localized campaigns
- Regional teams

USE CASE EXPANSION:
- Loyalty programs
- VIP management
- Predictive analytics
- Advanced reporting

CROSS-SELL:
- Bloomreach Discovery (search)
- Bloomreach Content (CMS)
- Bloomreach Clarity (conversational AI)
   ↓
Full Bloomreach platform
```

### 25.3 Reference customer program

```
Reference customer benefits:
- Case study co-creation
- Discount on renewal (10-20%)
- Early access to features
- Advisory board membership
- Speaking opportunities (Bloomreach Summit)
- Network with peers
- Influence roadmap
```

---

## 26. Datová mapa: co vidí kdo

| Data | Admin | Marketing manager | Email marketer | Data analyst | Developer | End customer | Anonymous visitor | Bloomreach support | Partner team | API client |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Account settings | ✅ | view | ❌ | ❌ | ❌ | ❌ | ❌ | s consent | s consent | per scope |
| Billing | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | s consent | ❌ | ❌ |
| Users + roles | ✅ | view | ❌ | ❌ | ❌ | ❌ | ❌ | s consent | s consent | per scope |
| Customer profiles | ✅ | ✅ | ✅ | ✅ | per scope | own profile | ❌ | s consent | per project | ✅ |
| Anonymous visitors | ✅ | view | view | ✅ | per scope | ❌ | own session | s consent | per project | per scope |
| Events history | ✅ | ✅ | view | ✅ | per scope | own events | own events | s consent | per project | per scope |
| Segments | ✅ | ✅ | ✅ | ✅ | per scope | ❌ | ❌ | s consent | per project | per scope |
| Predictive scores | ✅ | view | view | ✅ | per scope | ❌ | ❌ | s consent | per project | per scope |
| Scenarios | ✅ | ✅ | ✅ | view | per scope | ❌ | ❌ | s consent | per project | per scope |
| Campaigns | ✅ | ✅ | ✅ | view | per scope | received content | ❌ | s consent | per project | per scope |
| Templates | ✅ | ✅ | ✅ | view | per scope | ❌ | ❌ | s consent | per project | per scope |
| Weblayers | ✅ | ✅ | ✅ | view | per scope | view displays | view displays | s consent | per project | per scope |
| Reports | ✅ | ✅ | view | ✅ | per scope | ❌ | ❌ | s consent | per project | per scope |
| Custom queries (SQL) | ✅ | view | ❌ | ✅ | per scope | ❌ | ❌ | s consent | per project | per scope |
| Webhooks | ✅ | ❌ | ❌ | view | ✅ | ❌ | ❌ | s consent | per project | – |
| API keys | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | s consent | per project | – |
| Loomi AI insights | ✅ | ✅ | ✅ | ✅ | per scope | ❌ | ❌ | s consent | per project | per scope |
| Implementation logs | ✅ | view | ❌ | view | ✅ | ❌ | ❌ | s consent | ✅ | – |
| Audit logs | ✅ | ❌ | ❌ | view | ❌ | ❌ | ❌ | s consent | s consent | – |
| Consent management | ✅ | view | view | view | per scope | own consent | own consent | s consent | per project | per scope |

---

## 27. Známé úzkoprofilové místa

### 27.1 Žádné public pricing

```
Pricing opacity:
- No price list public
- Sales-driven custom quote
- Multi-call discovery required
- Comparison shopping difficult
   ↓
Friction for evaluation
```

### 27.2 Event-based pricing eskalace

Per G2 critique:
> *"Initially, during negotiations, they will underestimate the number of processed events you actually need to lure you in with a lower investment. Once you are signed up, they will insist you are far below the processed events you require."*

⚠️ **Sales tactic concern** – underestimation pattern.

### 27.3 Technicky náročný

```
Technical complexity:
- SQL-like query knowledge
- Webhook setup
- API integrations
- Custom code often
- Multi-system coordination
   ↓
Marketing alone insufficient
```

### 27.4 6-12 měsíců implementation

```
Implementation reality:
- Multi-phase rollout
- Data migration complex
- Custom integrations
- Team training
- UAT extensive
- Phased launch
   ↓
Quick wins limited
Long-term value high
```

### 27.5 High learning curve

```
Learning curve:
- 3-6 months proficiency
- 6-12 months mastery
- Continuous learning
- Multi-role expertise needed
   ↓
Onboarding investment significant
```

### 27.6 Reporting méně robustní

```
Reporting gaps:
- Custom dashboards clunky
- Out-of-box templates limited
- Some metrics buried
- Real-time data good
   ↓
Per users feedback: needs improvement
```

### 27.7 Implementation cost significant

```
TCO Year 1:
- Annual subscription
- Implementation $25K-300K+
- Partner fees (Actum, Adastra)
- Internal team time
- Training
   ↓
2-3× annual subscription Year 1
```

### 27.8 Consultant required pro advanced

```
Self-serve limits:
- Basic OK
- Complex → consultant
- Custom integrations → developer
- Reporting → analyst
   ↓
Multi-role team mandatory
```

### 27.9 SMB exclusion

```
SMB unfit:
- Pricing too high
- Complexity too high
- Implementation too long
- Sales-driven process
   ↓
Klaviyo / Brevo / MailerLite better
```

### 27.10 Klaviyo competitive pressure

```
DTC ecommerce competition:
- Klaviyo cheaper entry
- Shopify deeper integration
- Faster TTV
- DTC-first development
   ↓
Bloomreach loses DTC pure-plays
```

### 27.11 Reporting clunky

```
Reporting UX:
- Manual config heavy
- Out-of-box limited
- Custom = SQL-like
   ↓
Self-service difficult
```

### 27.12 Sales-driven approach

```
Sales process:
- Multiple discovery calls
- Custom quotes
- Annual contracts
- Multi-stakeholder
   ↓
Long sales cycle
```

### 27.13 Partner dependency

```
Partner reliance:
- Actum, Adastra dominant CZ/SK
- Quality varies
- Cost varies
- Lock-in concerns
```

### 27.14 Conversational AI (Clarity) newer

```
Clarity maturity:
- Newer product (2024-2025)
- Less proven
- Limited deployments visible
- Use cases evolving
```

### 27.15 Není print/direct mail native

```
Channel gaps:
- ✅ Digital channels
- ❌ Print catalog
- ❌ Direct mail (US scale)
- ❌ Voice/call center
```

### 27.16 Loomi AI catch-up vs. AI-natives

```
AI race ongoing:
- Loomi = 2024 unified rebrand
- Klaviyo predictive years
- Salesforce Einstein 5+ let
- Competition real
```

### 27.17 Limited B2B features

```
B2B gaps:
- No lead scoring native
- No sales pipeline (CRM)
- Limited account-based
- B2C-first development
   ↓
HubSpot / Marketo lepší pro B2B
```

### 27.18 Není headless commerce native

```
Headless reality:
- Bloomreach Content = headless CMS
- Engagement = standalone
- Integration s headless OK
- Native composability work
```

### 27.19 Slovak/Czech origin perception

```
Origin optics:
- USA: "European product"
- Europe: positive
- CZ/SK: pride + trust
- LatAm: less awareness
- APAC: limited recognition
```

### 27.20 Renewal pressure events

```
Renewal pressure:
- Event growth = price increases
- Underestimation tactic concern
- Multi-year locks expensive
- Migration cost daunting
   ↓
Lock-in once committed
```

---

## 28. Doporučení pro design vlastních procesů

### Pro Bloomreach Engagement zákazníky obecně:

1. **Discovery thorough** – understand event volume realistically (avoid underestimation trap)
2. **Multi-vendor evaluation** – Klaviyo, Salesforce MC, Emarsys comparison
3. **Reference customers** – talk to existing CZ/SK/DACH customers
4. **Partner selection** – evaluate Actum vs. Adastra vs. self
5. **Phased rollout** – quick wins first (HP Tronic 2-3 weeks weblayer)
6. **Data migration plan** – complete data audit pre-migration
7. **Identity resolution rules** – critical config, get expert help
8. **Compliance setup** – GDPR + ePrivacy
9. **Loomi AI training time** – budget 90 days to maturity
10. **Multi-team coordination** – break down silos
11. **Performance monitoring** – real-time dashboards
12. **A/B testing culture** – use built-in capabilities
13. **Documentation rigor** – knowledge transfer continuous
14. **Loomi AI insights** – review weekly, act monthly
15. **Channel orchestration** – avoid channel-by-channel thinking
16. **Use case roadmap** – 12-month plan
17. **Renewal preparation** – start 6 months before
18. **Expansion strategy** – channel addition phased
19. **Cross-team training** – multi-role expertise
20. **Quarterly business reviews** – use Bloomreach CS team

### Pro CZ/SK customers specifically:

1. **Czech origin = trust** – Exponea Bratislava roots
2. **Local CZ/SK partneři available** (Actum, Adastra)
3. **CEE-specific case studies** – MALL, Datart, SIKO, Sazka
4. **Multi-country expansion** – CZ + SK + HU + PL pattern
5. **Czech language UI available**
6. **CZ-specific compliance** (GDPR, Czech data law)
7. **Local references** – speak to MALL.CZ, HP Tronic
8. **Currency support** – CZK, EUR, USD
9. **VAT handling** – proper Czech VAT
10. **Local time zones** – respect customer hours

### Pro retail / multi-channel businesses:

1. **POS + online unified** – critical for omnichannel
2. **In-store loyalty integration**
3. **Mobile app first** – Allwyn pattern
4. **Real-time personalization** – Loomi AI
5. **Cross-channel orchestration**
6. **Frequency capping global**
7. **Channel attribution sophistication**
8. **Inventory-aware recommendations**

### Pro hospitality / gaming:

1. **VIP management critical** (Allwyn case)
2. **Real-time engagement** for live events
3. **Mobile-first** (lottery + gaming)
4. **Regulatory compliance** (gambling laws)
5. **Loyalty programs sophisticated**
6. **Multi-channel orchestration**

### Pro CDP-first organizations:

1. **CDE = foundation** – build everything on it
2. **Identity resolution rigorous**
3. **Data quality continuous**
4. **Profile completeness scoring**
5. **Consent management central**
6. **Cross-channel unification priority**
7. **Predictive analytics core**

### Avoid Bloomreach pokud:

- SMB / startup
- Pure DTC Shopify (Klaviyo better)
- B2B SaaS (HubSpot better)
- Single-channel email (Mailchimp better)
- Need quick TTV (< 3 months)
- Limited tech team
- Budget < $50K/year
- Need free trial
- Public pricing requirement
- Multi-vendor preference

---

*Dokument zpracován z oficiálních zdrojů bloomreach.com (Engagement, Case Studies, Loomi AI), G2 reviews, Gartner Peer Insights, Wikipedia (Bloomreach), TechCrunch (akvizice 26.1.2021), Slovak Spectator, PitchBook (Exponea profile), Capterra, SaaSworthy, Actum Digital + Adastra partner pages, MALL.CZ + HP Tronic + Allwyn + Spokojený pes + SIKO case studies. Pro nejaktuálnější detaily je nutný kontakt s Bloomreach (bloomreach.com/pricing) nebo certified partnery (Actum Digital, Adastra).*
