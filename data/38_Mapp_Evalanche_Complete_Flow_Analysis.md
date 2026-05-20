# Mapp & Evalanche – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v Mapp Marketing Cloud a Evalanche prochází data, lidé a akce. Pokrývá obě platformy odděleně (Mapp B2C/D2C CDP + Evalanche B2B marketing automation), s důrazem na DACH enterprise compliance + Best-of-Breed approach (Evalanche) vs. unified CDP+automation (Mapp).

> Tento dokument doplňuje `37_Mapp_Evalanche_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** Mapp + Evalanche umí, tento popisuje, **kdo s tím interaguje a jak data tečou**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
>
> - **Dvě oddělené platformy** v jednom dokumentu (Mapp + Evalanche)
> - **Mapp** = B2C/D2C enterprise CDP + cross-channel automation
> - **Evalanche** = B2B marketing automation specialist (SC-Networks GmbH)
> - **Mapp** servery v EU options, **Evalanche** EXCLUSIVELY v Germany
> - **Mapp** unified all-in-one, **Evalanche** Best-of-Breed
> - **Mapp** AI predictive (churn, CLV), **Evalanche** AI content assist
> - **Mapp** consumer journeys, **Evalanche** B2B lead nurturing
> - **Mapp** mobile push + in-app, **Evalanche** print + analog
> - **Mapp** retail/fashion/finance/travel, **Evalanche** Maschinenbau/IT/Pharma
> - **Mapp** B2C CDP, **Evalanche** multivariate scoring + Buyer Personas
> - **Mapp** 5 UI languages, **Evalanche** DE primary + multi
> - Obě **ISO 27001** (Evalanche TÜV-certified)
> - Obě **GDPR-compliant**, **DACH mid-market+ enterprise**

---

## Obsah

### Část 1: Mapp Marketing Cloud flows

1. [Mapp aktéři](#1-mapp-aktéři)
2. [Mapp sales flow](#2-mapp-sales)
3. [Mapp onboarding](#3-mapp-onboarding)
4. [Mapp user roles](#4-mapp-roles)
5. [Mapp daily workflow](#5-mapp-daily)
6. [Mapp CDP data ingestion](#6-mapp-cdp-flow)
7. [Mapp cross-channel orchestration](#7-mapp-cross-channel-flow)
8. [Mapp AI predictive flow](#8-mapp-ai-flow)
9. [Mapp recipient lifecycle](#9-mapp-recipient)

### Část 2: Evalanche (SC-Networks) flows

10. [Evalanche aktéři](#10-evalanche-aktéři)
11. [Evalanche sales flow](#11-evalanche-sales)
12. [Evalanche PowerSets quick start flow](#12-powersets-flow)
13. [Evalanche onboarding](#13-evalanche-onboarding)
14. [Evalanche user roles + agency multi-tenant](#14-evalanche-roles)
15. [Evalanche Campaign Designer workflow](#15-campaign-designer)
16. [Evalanche Lead Management + Scoring flow](#16-lead-management)
17. [Evalanche Progressive Profiling flow](#17-progressive-profiling)
18. [Evalanche Best-of-Breed integration flow](#18-best-of-breed)
19. [Evalanche multi-tenant flow](#19-multi-tenant)
20. [Evalanche SAP CRM handoff flow](#20-sap-crm)
21. [Evalanche print + analog channel flow](#21-print-analog)

### Část 3: Společné aspekty

22. [Email lifecycle (oba)](#22-email-lifecycle)
23. [GDPR compliance flow (oba)](#23-gdpr-flow)
24. [Datová mapa](#24-datová-mapa)
25. [Známé úzkoprofilové místa](#25-úzkoprofilové-místa)

---

# Část 1: Mapp Marketing Cloud flows

## 1. Mapp aktéři

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│         MAPP MARKETING CLOUD ECOSYSTEM                             │
│         B2C/D2C Enterprise CDP + Cross-Channel Automation          │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [Mapp Digital (San Diego US + EU offices)]                        │
│   ├─ Sales team (DACH + international)                             │
│   ├─ Customer Success Manager (per klient)                         │
│   ├─ Technical Support                                             │
│   ├─ Implementation specialists                                    │
│   ├─ Industry vertical experts                                     │
│   │   (retail, eCommerce, finance, travel, fashion)                │
│   ├─ Data scientists (AI features)                                 │
│   ├─ Compliance team (GDPR)                                        │
│   └─ Professional Services                                         │
│           │                                                        │
│           ▼                                                        │
│                                                                    │
│   ┌──────────────────────────────────────────┐                     │
│   │   Mapp Marketing Cloud Account           │                     │
│   │                                          │                     │
│   │   USER ROLES (typical):                  │                     │
│   │   ├─ Account Owner / Admin               │                     │
│   │   ├─ CMO / Marketing Director            │                     │
│   │   ├─ Email Marketing Specialist          │                     │
│   │   ├─ CRM / Data Analyst                  │                     │
│   │   ├─ Campaign Manager                    │                     │
│   │   ├─ Content / Designer                  │                     │
│   │   ├─ Mobile Marketing Specialist         │                     │
│   │   ├─ Analytics user                      │                     │
│   │   └─ Read-only / Viewer                  │                     │
│   └──────────────┬───────────────────────────┘                     │
│                  │                                                 │
│                  ▼                                                 │
│   [Customers / Subscribers v CDP]                                  │
│       │                                                            │
│       ├─→ Email campaigns                                          │
│       ├─→ SMS messages                                             │
│       ├─→ Mobile push (iOS + Android)                              │
│       ├─→ Web push notifications                                   │
│       ├─→ In-app messages                                          │
│       ├─→ Website banners + overlays                               │
│       └─→ Personalized content                                     │
│                  │                                                 │
│                  ▼                                                 │
│   [Integrations]                                                   │
│   ┌──────────────────────────────────────────┐                     │
│   │   E-commerce:                            │                     │
│   │   - Shopify                              │                     │
│   │   - Magento                              │                     │
│   │   - Shopware (DACH)                      │                     │
│   │                                          │                     │
│   │   SMS gateways:                          │                     │
│   │   - Infobip, Mitto SMS, Sinch            │                     │
│   │                                          │                     │
│   │   Analytics + data:                      │                     │
│   │   - Google Tag Manager                   │                     │
│   │   - Segment                              │                     │
│   │   - Lytics                               │                     │
│   │   - Data Virtuality                      │                     │
│   │                                          │                     │
│   │   Testing:                               │                     │
│   │   - Kameleoon, VWO Engage                │                     │
│   │                                          │                     │
│   │   Loyalty / Engagement:                  │                     │
│   │   - Playable, Nosto                      │                     │
│   │                                          │                     │
│   │   Print:                                 │                     │
│   │   - optilyz                              │                     │
│   │                                          │                     │
│   │   CMS:                                   │                     │
│   │   - WordPress                            │                     │
│   │                                          │                     │
│   │   Consent:                               │                     │
│   │   - Usercentrics                         │                     │
│   │                                          │                     │
│   │   Reviews:                               │                     │
│   │   - Trustpilot                           │                     │
│   │                                          │                     │
│   │   iPaaS:                                 │                     │
│   │   - Zapier                               │                     │
│   │                                          │                     │
│   │   APIs + Webhooks (flexible framework)   │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## 2. Mapp sales flow

### 2.1 Lead acquisition

```
Lead sources:
- mapp.com inbound (demo request)
- Industry events (retail, fashion, e-commerce)
- Partner referrals
- Industry research reports
- Word-of-mouth
- Outbound prospecting (mid-market+)
```

### 2.2 Discovery flow

```
Prospect contacts Mapp via:
- mapp.com form
- Email to sales
- Partner referral
   ↓
**Discovery call (English/German typical):**
- Business type (B2C / D2C fit?)
- Industry vertical (retail/eCommerce/finance/travel/fashion?)
- Customer base size (mid-market+ fit?)
- Channel requirements (email + SMS + mobile + web push + in-app?)
- Mobile app presence?
- Data sources (websites, e-commerce, CRM, loyalty)
- GDPR/data residency requirements
- Budget range
- Timeline
   ↓
Qualification:
- B2C/D2C fit
- Mid-market+ budget
- Complex needs justify platform
```

### 2.3 Demo + workshop

```
Demo 1 (60-90 min):
- Mapp Marketing Cloud overview
- CDP capabilities walkthrough
- AI analytics demonstration
- Cross-channel orchestration
- Reference customer stories
- ROI examples (B2C/D2C industries)
- Q&A
   ↓
Technical deep dive:
- API capabilities
- Integration architecture
- Data residency options
- GDPR compliance review
- Security architecture
- Mobile app SDK
- Custom requirements
   ↓
Use case workshop:
- Map current customer journeys
- Identify cross-channel opportunities
- Design CDP unification strategy
- ROI projection
```

### 2.4 Custom proposal

```
Mapp prepares proposal:
- Mapp Marketing Cloud tier
- Profile count pricing
- Email volume
- SMS / push volumes
- AI features included
- Integration scope
- Professional services
- Customer Success Manager
- Standard support
- Custom contract terms
   ↓
Proposal sent
   ↓
Negotiation:
- Volume flexibility
- Multi-year commitment
- Add-ons
- SLA terms
   ↓
Contract signing
```

---

## 3. Mapp onboarding

### 3.1 Project kickoff (Week 1)

```
Contract signed
   ↓
**Mapp assigns:**
- Customer Success Manager (CSM)
- Implementation specialist
- Technical support
- Industry vertical expert
- Data scientist (AI setup)
- Compliance contact
   ↓
**Client side:**
- Project sponsor
- Marketing lead
- IT lead
- Data team
- Mobile app team
- Compliance/Legal
   ↓
**Kickoff workshop (2-3 days):**
- Introductions across teams
- Goals + KPIs alignment
- Success criteria
- Communication cadence
- Implementation plan
```

### 3.2 CDP setup (Week 1-4)

```
Account provisioning:
- Mapp creates account
- Master admin credentials
- Roles configured
   ↓
Domain authentication:
- DKIM + SPF + DMARC setup
- Branded tracking domain
   ↓
**CDP foundation:**
- Customer data model design
- Custom attributes schema
- Lifecycle stages
- Segment definitions
- Persona setup
   ↓
Data sources integration:
- Website tracking script
- E-commerce platform
- CRM
- Loyalty platform
- Mobile app SDK
- API connections
   ↓
Historical data migration:
- Existing customer data import
- Order history
- Engagement history
- GDPR consent confirmation
   ↓
Identity resolution configuration
   ↓
[CDP foundation ready]
```

### 3.3 Mobile app integration (Week 3-6)

```
Mobile app team:
- Install Mapp SDK (iOS + Android)
- Configure event tracking
- Push notification setup
- In-app message setup
- Deep linking
- Custom event tracking
   ↓
Test + validate
   ↓
[Mobile integration live]
```

### 3.4 AI / Predictive setup (Week 4-8)

```
Mapp data scientist:
- Train predictive models s historical data
- Configure churn prediction
- Configure CLV forecasting
- Configure next-best-action
- Validate model performance
- Set thresholds
   ↓
[AI features active]
```

### 3.5 Templates + brand kit (Week 4-8)

```
Brand kit setup:
- Colors, fonts, logos
- Email defaults
- Mobile push defaults
- In-app message styles
   ↓
Master templates:
- Email templates (per use case)
- SMS templates
- Mobile push templates
- In-app templates
- Web banner templates
   ↓
[Templates ready]
```

### 3.6 Cross-channel workflows (Week 6-10)

```
Workflow design workshops:
- Welcome series (cross-channel!)
- Cart abandonment
- Browse abandonment
- Post-purchase
- Re-engagement
- Win-back
- Lifecycle stages
- Loyalty program triggers
- App engagement
   ↓
Build workflows v Mapp:
- Multi-channel sequences
- Cross-channel logic
- AI-driven decisions
- Test thoroughly
   ↓
[Workflows ready]
```

### 3.7 Training (Week 8-12)

```
Multi-track training:
- Marketing team
- Email specialists
- Mobile marketing
- Data analysts
- Admins
- IT / Developers
```

### 3.8 Go-live (Week 10-14)

```
Pre-launch QA → Soft launch → Full launch → Hypercare
   ↓
[BAU transition]
```

---

## 4. Mapp user roles

### 4.1 Typical roles

#### Account Owner / Admin

- Full control
- Billing
- User management

#### CMO / Marketing Director

- Strategic oversight
- Reports + dashboards
- Budget approval

#### Email Marketing Specialist

- Email campaigns
- Templates
- A/B testing

#### CRM / Data Analyst

- CDP exploration
- Segment building
- Reports

#### Campaign Manager

- Workflows
- Cross-channel coordination
- Goals tracking

#### Content / Designer

- Templates design
- Content creation
- Brand consistency

#### Mobile Marketing Specialist

- Push notifications
- In-app messages
- App-specific campaigns

#### Analytics user

- Reports + BI
- Predictive insights
- ROI tracking

#### Read-only / Viewer

- View only

### 4.2 Granular permissions

- Per channel
- Per segment
- Per workflow
- Per report
- Custom roles

---

## 5. Mapp daily workflow

### 5.1 Daily activities

```
Login → Dashboard
   ↓
Activities:
- Review yesterday's campaign performance
- Check AI predictive insights
- Build/edit campaigns
- Manage workflows
- Build segments
- Cross-channel coordination
- Mobile push optimization
- A/B testing analysis
```

### 5.2 Create campaign

```
Campaign → New
   ↓
Step 1: Channel selection
- Email / SMS / Mobile push / Web push / In-app / Web banner
- Multi-channel (workflow)
   ↓
Step 2: Audience
- CDP segment
- Predictive segment
- AI-suggested audience
- Channel preferences
   ↓
Step 3: Design
- Drag-drop editor (per channel)
- Personalization
- Dynamic content
- AI optimization
   ↓
Step 4: Test
- Preview
- A/B test variants
- Send test
   ↓
Step 5: Send / Schedule
- Send now
- Schedule
- AI-optimal timing
   ↓
Confirm
```

### 5.3 Build cross-channel workflow

```
Workflows → New
   ↓
Configure trigger:
- Customer behavior
- Predictive signal (high churn risk)
- Transactional event
- Date-based
- Custom event
   ↓
Build canvas:
- Add nodes (email, SMS, push, in-app, web)
- Wait nodes
- Condition nodes
- AI decision nodes
- Goal nodes
   ↓
Test mode
   ↓
Activate
   ↓
[Workflow live]
```

---

## 6. Mapp CDP data ingestion

### 6.1 Data sources

```
Multiple sources feed CDP:

1. Mapp tracking script (web)
   - Page views
   - Clicks
   - Searches
   - Cart events

2. Mobile app SDK
   - App opens
   - Screen views
   - In-app events
   - Push receipts

3. E-commerce integrations
   - Shopify / Magento / Shopware
   - Customer + order events

4. CRM integrations
   - Customer master data

5. Loyalty platforms
   - Points, tiers, redemptions

6. APIs + custom events
   - Business-specific events

7. Email/SMS/push engagement
   - Captured natively

8. Third-party data (optional)
   - Segment, Lytics, etc.
```

### 6.2 Identity resolution

```
Multiple identifiers:
- Cookie ID
- Email
- Phone
- Customer ID
- Device ID (mobile)
   ↓
Mapp resolution logic:
- Email = primary
- Cookie → email when form submitted
- Customer ID → email match
- Mobile device → email/customer ID
   ↓
Single Customer Profile maintained
```

### 6.3 Real-time vs. batch

- **Real-time:** website events, mobile app events, transactional
- **Batch:** historical data, CRM bulk sync, legacy system sync
- **Hybrid:** webhook events + scheduled refresh

### 6.4 First-party data focus

- **Compliant data collection**
- **Cookie consent management**
- **Usercentrics integration**
- **Privacy-first** approach

---

## 7. Mapp cross-channel orchestration

### 7.1 Channels orchestrated

- **Email**
- **SMS**
- **Mobile push** (iOS + Android)
- **Web push** (browser)
- **In-app messages**
- **Website banners + overlays**

### 7.2 Multi-channel workflow example

```
Trigger: Customer at high churn risk (AI prediction)
   ↓
Wait 1 day
   ↓
**Channel selection logic:**
- Email engagement high → Email
- Mobile app active → In-app message
- Both → email + in-app (different content)
   ↓
Send Email: Special re-engagement offer
   ↓
Wait 3 days
   ↓
Condition: Engaged?
   YES → Goal (exit, success)
   NO → Continue
   ↓
Send Mobile push: Reminder
   ↓
Wait 5 days
   ↓
Condition: Purchased?
   YES → Goal (exit, success)
   NO → Continue
   ↓
Send SMS: Final offer (high-cost channel, last resort)
   ↓
Exit
```

### 7.3 Cross-channel frequency caps

- Per channel limits
- Cross-channel total limits
- Per-campaign category
- Quiet hours respect

### 7.4 Personalization across channels

- Same recipient, different channels
- Content adapted per channel
- Mobile push: short, urgent
- Email: detailed, rich
- In-app: contextual
- Web banner: subtle nudge

---

## 8. Mapp AI predictive flow

### 8.1 AI models

- **Churn probability** (will customer leave?)
- **CLV forecasting** (lifetime value prediction)
- **Next-best-action** (what to send next?)
- **Propensity to purchase**
- **Engagement prediction**

### 8.2 AI scoring flow

```
Mapp processes customer data:
- Historical behavior
- Recent activity
- Transaction patterns
- Engagement trends
- Demographic data
   ↓
**AI models calculate:**
- Churn score (0-1)
- CLV ($X estimated)
- Next-best-action recommendation
- Propensity scores
   ↓
**Profile updates s scores**
   ↓
Used in:
- Segment building
- Workflow triggers
- Campaign targeting
- Content personalization
   ↓
Reports show AI impact
```

### 8.3 Use cases

#### Churn prevention

```
AI flags: 1,200 customers at high churn risk
   ↓
Auto-trigger re-engagement workflow
   ↓
Personalized content based on past behavior
   ↓
Measure success: churn rate reduction
```

#### CLV optimization

```
AI segments customers by CLV:
- Top 10%: VIP treatment
- Middle: Growth focus
- Low CLV but high potential: Upsell campaigns
- Low CLV + low potential: Cost-efficient channel
   ↓
ROI-optimized marketing spend
```

#### Next-best-action

```
For each customer, AI recommends:
- Best content to send
- Best channel
- Best timing
   ↓
Auto-execute or marketer review
   ↓
Higher conversion rates
```

---

## 9. Mapp recipient lifecycle

### 9.1 Recipient creation paths

#### A) Website form submission

```
Visitor submits form
   ↓
Mapp tracking captures
   ↓
Profile created v CDP
   ↓
Consent recorded
   ↓
Status: Pending (double opt-in if required)
   ↓
Welcome workflow triggered
```

#### B) Mobile app first launch

```
App user installs + opens
   ↓
Mapp SDK captures device ID
   ↓
Anonymous profile created
   ↓
Once user logs in / provides email:
- Identity resolved
- Profile enriched
   ↓
Active profile
```

#### C) E-commerce purchase (Shopify/Magento/Shopware)

```
Customer makes purchase
   ↓
Webhook → Mapp
   ↓
Profile created/updated
   ↓
Order data attached
   ↓
Post-purchase workflow triggered
```

#### D) CRM sync

```
CRM customer added
   ↓
Sync → Mapp
   ↓
Profile created/updated
   ↓
Marketing consent respected
```

#### E) API integration

```
External system POST to Mapp API
   ↓
Profile created/updated
   ↓
[Profile active]
```

### 9.2 Profile lifecycle

```
[Anonymous] (web/app tracking)
   ↓
[Identified] (form submit, login)
   ↓
[Active subscriber]
   ↓
**AI scoring continuous:**
- Churn risk evolving
- CLV updating
- Engagement tracking
   ↓
Transitions:
- Unsubscribed (per channel or global)
- Bounced
- Inactive (engagement decline)
- Deleted (GDPR)
```

### 9.3 Preference center

```
Mapp-hosted preference center
- Channel preferences (email, SMS, push)
- Topic preferences
- Frequency
- Personal info edit
- GDPR rights
   ↓
Updates feed back to CDP
   ↓
Workflows respect preferences
```

---

# Část 2: Evalanche (SC-Networks) flows

## 10. Evalanche aktéři

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│         EVALANCHE ECOSYSTEM (SC-Networks GmbH, Starnberg)          │
│         B2B Marketing Automation · Made in Germany                 │
│         25+ Jahre Erfahrung · ISO 27001 TÜV · Best-of-Breed        │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [SC-Networks GmbH (Starnberg, Germany)]                           │
│   ├─ Sales team (DACH primary)                                     │
│   ├─ Customer Success                                              │
│   ├─ Technical Support                                             │
│   ├─ Implementation specialists                                    │
│   ├─ B2B industry experts                                          │
│   │   (Maschinenbau, IT, Pharma, Energy, Chemicals)                │
│   ├─ Compliance team (ISO 27001 + DSGVO)                           │
│   ├─ Partner network                                               │
│   │   (FlyMint, itmX, Marini Systems, Uniserv, Nextage)            │
│   └─ Premium Partner Programm                                      │
│           │                                                        │
│           ▼                                                        │
│                                                                    │
│   ┌──────────────────────────────────────────┐                     │
│   │   Evalanche Account                      │                     │
│   │                                          │                     │
│   │   USER ROLES (B2B-focused):              │                     │
│   │   ├─ Account Owner / Admin               │                     │
│   │   ├─ Marketing Lead                      │                     │
│   │   ├─ Marketing Automation Specialist     │                     │
│   │   ├─ Content Designer                    │                     │
│   │   ├─ Lead Management Specialist          │                     │
│   │   ├─ Sales (CRM-integrated view)         │                     │
│   │   ├─ Analyst                             │                     │
│   │   ├─ Read-only / Viewer                  │                     │
│   │   └─ Agency users (multi-tenant)         │                     │
│   │                                          │                     │
│   │   + Multi-Tenant architecture:           │                     │
│   │     - Multi-brand                        │                     │
│   │     - Multi-unit (subsidiaries)          │                     │
│   │     - Agency multi-client                │                     │
│   └──────────────┬───────────────────────────┘                     │
│                  │                                                 │
│                  ▼                                                 │
│   [B2B Prospects + Customers]                                      │
│       │                                                            │
│       ├─→ Email campaigns (hyperpersonalized)                      │
│       ├─→ Landing pages (lead gen)                                 │
│       ├─→ Forms (Progressive Profiling)                            │
│       ├─→ Nurturing sequences                                      │
│       ├─→ Print materials (Fax, Brief)                             │
│       ├─→ Whitepaper downloads                                     │
│       ├─→ Webinar registrations                                    │
│       └─→ Sales handoff (qualified leads)                          │
│                  │                                                 │
│                  ▼                                                 │
│   [Best-of-Breed Integrations]                                     │
│   ┌──────────────────────────────────────────┐                     │
│   │   CRM systems (B2B):                     │                     │
│   │   - SAP CRM (native!)                    │                     │
│   │   - itmX crm (DACH partner)              │                     │
│   │   - Salesforce                           │                     │
│   │   - Microsoft Dynamics 365               │                     │
│   │   - DACH CRMs                            │                     │
│   │                                          │                     │
│   │   Partner solutions (add-ons):           │                     │
│   │   - Marini Systems (adapter hub)         │                     │
│   │   - Uniserv (address verification)       │                     │
│   │   - Nextage (multi-variant templates)    │                     │
│   │   - FlyMint (consulting + implementation)│                     │
│   │                                          │                     │
│   │   APIs:                                  │                     │
│   │   - SOAP (legacy enterprise)             │                     │
│   │   - REST (modern)                        │                     │
│   │                                          │                     │
│   │   Print partners:                        │                     │
│   │   - Direct mail / Brief integrations     │                     │
│   │   - Fax integrations                     │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
│   [Made in Germany Infrastructure]                                 │
│   ┌──────────────────────────────────────────┐                     │
│   │   Servers EXCLUSIVELY v Germany          │                     │
│   │   ISO 27001 TÜV-certified (annual!)      │                     │
│   │   DSGVO native                           │                     │
│   │   TÜV SÜD certified (1st email tool!)    │                     │
│   │   25+ Jahre Erfahrung                    │                     │
│   │   TOP100 Mittelstand 2012                │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## 11. Evalanche sales flow

### 11.1 Lead acquisition

```
Lead sources:
- sc-networks.com inbound
- DACH B2B events (Lead Management Summit, etc.)
- Partner referrals (FlyMint, itmX, etc.)
- Industry research
- B2B word-of-mouth
- 25+ years industry presence
- Reference customer recommendations
```

### 11.2 Discovery flow

```
Prospect contacts SC-Networks:
- sc-networks.com form
- Partner referral
- Event lead capture
   ↓
**Discovery call (German primary, English):**
- Business type (B2B?)
- Industry vertical (Maschinenbau? IT? Pharma? Chemicals? Energy?)
- Existing CRM (SAP? Salesforce? itmX?)
- Multi-brand / multi-unit?
- Agency vs. direct?
- Lead management maturity
- Database size
- Email volume
- Compliance requirements
- Best-of-Breed vs. all-in-one preference
- Budget range
- Timeline
   ↓
Qualification:
- B2B mid-market+ fit
- Best-of-Breed approach compatible
- Budget compatibility
- Implementation timeline realistic
```

### 11.3 Demo + workshop

```
Demo 1 (60-90 min):
- Evalanche platform walkthrough
- Campaign Designer demo
- Lead Management + Scoring demo
- Progressive Profiling demo
- Multi-tenant architecture (if relevant)
- Reference customer stories (Schunk, Jauch Quartz, etc.)
- Q&A
   ↓
Use case workshop:
- Map current B2B sales process
- Identify lead generation opportunities
- Design nurturing strategy
- CRM integration plan
- ROI projection
```

### 11.4 PowerSets recommendation

```
Sales recommends PowerSets based on industry:
- B2B Lead Gen PowerSet
- B2B Nurturing PowerSet
- Event marketing PowerSet
- Multi-tenant PowerSet
   ↓
Faster implementation
Lower learning curve
```

### 11.5 Custom proposal

```
SC-Networks prepares proposal:
- Evalanche tier (usage-based)
- Profile count
- Email volume
- Landing page traffic
- Lead Management features
- Multi-tenant scope (if applicable)
- PowerSets included
- Partner add-ons (FlyMint consulting, etc.)
- Implementation services
- Training
- Support tier
   ↓
Proposal sent
   ↓
Negotiation
   ↓
Contract signing
```

---

## 12. Evalanche PowerSets quick start flow

### 12.1 PowerSets advantage

Per oficiální:

> _"Mit den Evalanche PowerSets startest Du schneller in die Marketing Automation."_

```
Without PowerSets: 3-6 months to implement
With PowerSets: 2-6 weeks faster start
```

### 12.2 PowerSet types

- **Email PowerSets** (templates + design system)
- **Landing Page PowerSets**
- **Campaign PowerSets** (full workflows)
- **Industry-specific PowerSets**
- **Multi-tenant PowerSets**

### 12.3 PowerSets implementation

```
Choose PowerSet
   ↓
Apply to account
   ↓
Customize:
- Brand colors / fonts
- Logo
- Content adaptation
- Industry-specific tweaks
   ↓
**AI assists content creation**
   ↓
Quick deployment
   ↓
[Production-ready]
```

### 12.4 Use cases

```
Scenario: B2B IT company, 50 employees
   ↓
Choose:
- B2B Lead Gen PowerSet
- B2B Nurturing PowerSet
   ↓
Apply + customize (1-2 weeks)
   ↓
Launch lead generation campaign
   ↓
First leads within 30 days
```

---

## 13. Evalanche onboarding

### 13.1 Project kickoff (Week 1)

```
Contract signed
   ↓
**SC-Networks assigns:**
- Customer Success contact
- Implementation specialist
- Technical support
- B2B industry expert
- Compliance contact
- Premium Partner (if applicable, like FlyMint)
   ↓
**Client side:**
- Project sponsor (CMO / CSO)
- Marketing lead
- Sales lead (CRM integration)
- IT lead
- Data team
- Compliance/Legal
   ↓
**Kickoff workshop (1-2 days):**
- Introductions
- Goals + KPIs (B2B sales pipeline focus)
- Success criteria
- Implementation plan
- CRM integration scope
```

### 13.2 Setup phase (Week 1-3)

```
Account provisioning:
- Multi-tenant setup if applicable
- Brand kit
- User roles
   ↓
Domain authentication:
- DKIM + SPF + DMARC
- Branded tracking
   ↓
[Foundation ready]
```

### 13.3 CRM integration phase (Week 2-6)

```
**Critical pro B2B:**
- SAP CRM native integration (if used)
- itmX CRM partnership
- Salesforce / Dynamics
- Custom CRMs via API
   ↓
Configure:
- Bidirectional sync
- Field mapping
- Lead handoff rules
- SLA on lead push
   ↓
Test thoroughly
   ↓
[CRM integration live]
```

### 13.4 PowerSets deployment (Week 2-6)

```
Apply PowerSets:
- Emails (templates)
- Landing Pages
- Forms (Progressive Profiling)
- Campaigns
   ↓
Customize per brand
   ↓
[Quick deployment]
```

### 13.5 Buyer Personas + Scoring setup (Week 4-8)

```
Define Buyer Personas:
- Decision Maker
- Influencer
- User
- Per industry / role
   ↓
Configure Multivariate Scoring:
- Behavioral criteria
- Profile criteria
- Engagement criteria
- Persona match
   ↓
Set thresholds:
- MQL threshold
- SQL threshold
- Sales handoff trigger
   ↓
[Lead Management ready]
```

### 13.6 Campaigns + workflows (Week 6-10)

```
Build campaigns v Campaign Designer:
- Welcome series
- Nurturing tracks (per persona)
- Lead qualification
- Event campaigns
- Whitepaper download flows
- Webinar follow-up
- Post-event nurturing
   ↓
Test thoroughly
   ↓
[Campaigns live]
```

### 13.7 Training (Week 8-12)

```
Multi-track training:
- Marketing team
- Lead Management
- Sales team (CRM-side view)
- Designers
- Analysts
- Admins
- IT / Developers
```

### 13.8 Go-live (Week 10-14)

```
Pre-launch QA → Soft launch → Full launch → Hypercare
   ↓
[BAU transition]
```

---

## 14. Evalanche user roles + agency multi-tenant

### 14.1 User roles (typical B2B)

#### Account Owner / Admin

- Full control
- Billing
- User management

#### Marketing Lead

- Strategy oversight
- Reports + dashboards
- Budget management

#### Marketing Automation Specialist

- Campaign Designer
- Workflows
- Templates

#### Content Designer

- Landing pages
- Email templates
- Brand consistency

#### Lead Management Specialist

- Scoring rules
- Buyer Personas
- Sales handoff

#### Sales (CRM-integrated view)

- Lead queue
- Lead details
- CRM sync visibility

#### Analyst

- Reports + BI
- Marketing Cockpit
- ROI tracking

#### Read-only / Viewer

- View only

### 14.2 Agency multi-tenant flow

```
Agency account
   ↓
Multi-tenant configuration:
- Tenant per client
- Isolated data
- Per-client branding
- Per-client users
- Per-client billing (optional)
- Per-client reports
   ↓
Agency staff:
- Manage multiple tenants
- Switch between clients
- Single sign-on
   ↓
Per-client efficiency
```

### 14.3 Schunk example (per LinkedIn)

```
Schunk Group:
- 34 subsidiaries
- Multi-tenant Evalanche
- Per-subsidiary lead management
- Group-level reporting
- Centralized brand control
- Distributed marketing execution
```

---

## 15. Evalanche Campaign Designer workflow

### 15.1 Visual builder

Per FlyMint:

> _"Visueller Kampagnen-Designer (keine Programmierkenntnisse notwendig)"_

```
Campaign Designer interface
   ↓
Drag-drop components:
- Email send
- Wait
- Condition
- Persona check
- Score update
- Tag actions
- Form trigger
- Landing page trigger
- Print job (analog!)
- Webhook
- CRM push
   ↓
Click-to-assemble
   ↓
Test
   ↓
Activate
   ↓
[Workflow live]
```

### 15.2 B2B Nurturing example

```
Lead downloads whitepaper
   ↓
Profile created v Evalanche
   ↓
Scoring +10 (engaged)
   ↓
Wait 3 days
   ↓
**Persona check:**
- Decision Maker → send case study
- Influencer → send technical paper
- User → send tutorial
   ↓
Wait 7 days
   ↓
**Score check:**
- Score > 50 → send webinar invite
- Score 30-50 → send another content piece
- Score < 30 → continue nurture
   ↓
Repeat until threshold
   ↓
**Score > 80:**
- Mark MQL
- Push to SAP CRM
- Sales notification
   ↓
Exit campaign
```

### 15.3 Form-triggered campaigns

Per V7:

> _"You can now easily define that a campaign is started automatically after the completed form has been submitted."_

```
Lead fills form (e.g., whitepaper download)
   ↓
Form submission triggers campaign
   ↓
Campaign starts immediately:
- Send whitepaper
- Apply tags
- Add to nurture
- Score increase
   ↓
Workflow continues
```

### 15.4 Dynamic profile entry

Per V7:

> _"profiles start the campaign dynamically as soon as they correspond to one of your predefined definitions"_

```
Profile updates (e.g., job title changes)
   ↓
Now matches campaign entry criteria
   ↓
Auto-added to campaign
   ↓
Workflow begins
```

### 15.5 Modular campaigns

Per V7:

> _"copying profiles from one campaign to another"_

- Cross-campaign profile movement
- Modular scenarios
- Reusable components

---

## 16. Evalanche Lead Management + Scoring flow

### 16.1 Lead Management end-to-end

Per oficiální:

> _"Mit Evalanche Lead Management automatisierst Du jeden Schritt im Verkaufsprozess: von der Lead-Generierung bis hin zur Übergabe an den Vertrieb."_

```
[1. Lead Generation]
- Landing pages
- Forms (gated content)
- Webinar registrations
   ↓
[2. Lead Capture]
- Form submission
- Tracking script (web)
- Manual import
- API
   ↓
[3. Lead Qualification]
- Multivariate scoring
- Persona check
- Progressive Profiling
   ↓
[4. Lead Nurturing]
- Automated nurturing sequences
- Persona-based content
- Score-driven branches
   ↓
[5. Sales Handoff]
- Threshold reached
- Push to CRM
- Sales notification
   ↓
[6. Sales Cycle]
- CRM ownership
- Marketing closed-loop tracking
   ↓
[7. Customer / Won]
- Post-purchase nurturing
- Customer retention
- Upsell / cross-sell
```

### 16.2 Multivariate Scoring flow

```
Lead profile updates trigger scoring:

**Behavioral scoring:**
- Email opens: +1
- Email clicks: +5
- Landing page visits: +3
- Webinar registration: +20
- Whitepaper download: +15

**Profile scoring:**
- Job title (Decision Maker): +30
- Company size (enterprise): +20
- Industry match: +15
- Geographic match: +10

**Engagement scoring:**
- Recent activity: +15
- High frequency: +10
- Long-term engagement: +5

**Persona scoring:**
- Matches Decision Maker persona: +25
- Matches Influencer: +10
- Matches User: +5

**Combined score:**
- Sum of all criteria
- Updated real-time
- Used in workflows + segmentation
```

### 16.3 Sales handoff flow

```
Lead score reaches threshold (e.g., 80)
   ↓
**Auto-qualification:**
- Mark as MQL or SQL
- Apply lifecycle tag
   ↓
**Push to CRM:**
- Map fields
- Push lead details
- Push engagement history
- Push score
- Push persona
   ↓
**Sales notification:**
- Email alert
- CRM task creation
- Slack message (optional)
- Sales rep ownership
   ↓
**Closed-loop tracking:**
- Marketing tracks: contributed to deal
- Sales tracks: deal progression
- Pipeline impact measurable
```

---

## 17. Evalanche Progressive Profiling flow

### 17.1 Progressive Profiling concept

Per FlyMint:

> _"Progressive Profiling"_

**Idea:** Don't ask for all info at once. Build profile incrementally s each interaction.

### 17.2 Flow example

```
Visit 1: Landing page → Whitepaper download
   Form fields: Email only
   ↓
Profile created (just email)
   ↓
Visit 2: Lands on another whitepaper
   **Smart form pre-fills email**
   Asks: First name, Last name
   ↓
Profile enriched
   ↓
Visit 3: Webinar registration
   **Smart form pre-fills name + email**
   Asks: Company, Job title
   ↓
Profile enriched
   ↓
Visit 4: Demo request
   **Smart form pre-fills 4 fields**
   Asks: Phone, Company size, Use case
   ↓
**Full profile complete**
   ↓
High-quality lead
```

### 17.3 Smart forms

Per FlyMint:

> _"Smart, pre-filled entry forms"_

- **Pre-fill known data**
- **Reduce friction**
- **Conversion rate improvement**
- **Ask only what's needed**

### 17.4 Per oficiální V7

> _"Boost your event marketing with highly selective content for a designated geo location."_

- Smart forms can be **geo-targeted**
- **Persona-aware**
- **Context-sensitive** field requests

---

## 18. Evalanche Best-of-Breed integration flow

### 18.1 Best-of-Breed philosophy

Per Business.digital:

> _"Best-of-Breed-Ansatz integriert sich in bestehende Systeme statt sie zu ersetzen."_

**Approach:**

- **Doesn't replace** existing systems
- **Integrates** s CRM, ERP, e-commerce
- **Specialized marketing tool**
- **Complements** rather than competes

### 18.2 Integration architecture

```
Customer's existing landscape:
- CRM (SAP, Salesforce, itmX, etc.)
- ERP
- E-commerce platform
- Custom systems
   ↓
**Evalanche integrates as marketing layer:**
- Bidirectional sync s CRM
- Lead handoff
- Data enrichment back to CRM
- Email engagement → CRM activity log
   ↓
[Unified marketing + sales process]
```

### 18.3 SAP CRM integration

```
SAP CRM ←→ Evalanche
   ↓
Bidirectional sync:
- Contacts (master in SAP)
- Activities (marketing engagement)
- Lead status (marketing scoring)
- Campaign attribution
   ↓
SAP benefits:
- Marketing engagement visibility
- Lead quality data
- Campaign attribution

Evalanche benefits:
- SAP master data
- Customer information
- Sales status feedback
```

### 18.4 itmX CRM integration (DACH partner)

Per LinkedIn (Jauch Quartz):

```
itmX crm + Evalanche
   ↓
Joint solution:
- itmX = sales/CRM
- Evalanche = marketing automation
- Tight integration
- DACH B2B-specific
   ↓
Use case: Jauch Quartz electrotechnical
- Customer journey digital
- Marketing-sales tight integration
- Improved lead qualification
- Automated personalized campaigns
- Reduced manual effort
```

### 18.5 Adapter hub (Marini Systems)

Per V7:

> _"With the adapter hub of our partner Marini Systems you have the possibility to configure connections of Evalanche to third-party systems independently"_

```
Marini Systems adapter hub
   ↓
Self-service integrations
   ↓
Configure connections:
- ERP systems
- Custom apps
- Industry-specific tools
- No custom dev needed
   ↓
[Flexible integration possible]
```

### 18.6 Address verification (Uniserv)

```
Form entry
   ↓
**Uniserv address correction:**
- Check syntax errors
- Verify against postal databases
- Auto-correct
   ↓
Clean data v Evalanche
```

### 18.7 SOAP + REST APIs

Per V7:

- **SOAP** (legacy enterprise systems)
- **REST** (modern)
- **Comprehensive** endpoints

---

## 19. Evalanche multi-tenant flow

### 19.1 Multi-tenant architecture

Per oficiální:

> _"Multi-Tenant ermöglicht separate Kampagnen für drei Produktmarken"_

```
Group account
   ↓
Multiple tenants:
- Brand A (product line A)
- Brand B (product line B)
- Brand C (product line C)
- Subsidiary 1
- Subsidiary 2
- ...
- Subsidiary 34 (Schunk example!)
   ↓
Per-tenant:
- Isolated data
- Per-brand templates
- Per-brand domain
- Per-brand reporting
- Per-brand users
   ↓
Group-level:
- Master reporting
- Brand consistency rules
- Centralized governance
- Shared resources optional
```

### 19.2 Use cases

#### Multi-brand company

```
Parent company s 3 brands
   ↓
Per-brand Evalanche tenant
   ↓
Per-brand:
- Domains
- Templates
- Campaigns
- Subscribers
   ↓
Group sees consolidated reports
```

#### Subsidiary management (Schunk example)

```
Schunk Group s 34 subsidiaries
   ↓
Per-subsidiary tenant
   ↓
Per-subsidiary:
- Local marketing
- Local campaigns
- Local subscribers
- Local reports
   ↓
Group-level:
- Master data sync
- Cross-subsidiary reporting
- Centralized standards
```

#### Agency use

```
Marketing agency s 50 clients
   ↓
Per-client tenant
   ↓
Per-client billing
   ↓
Agency staff:
- Switch between clients
- Manage from single login
- Cross-client templates (optional)
```

### 19.3 Per oficiální V7 (multi-variant pro agencies)

> _"In cooperation with nextage we now offer agencies a configuration set for multi-variant, multilingual template scenarios."_

- **Agency-specific** templates
- **Per-client variants**
- **Multi-language support**
- **Faster client onboarding**

---

## 20. Evalanche SAP CRM handoff flow

### 20.1 SAP CRM native integration

```
Lead activity v Evalanche
   ↓
Scoring update real-time
   ↓
**Score reaches threshold (e.g., 80):**
   ↓
**Auto-handoff to SAP CRM:**
- Push lead profile
- Push engagement history
- Push score
- Push persona
- Push attribution data
- Create lead/contact v SAP
- Assign to sales rep
   ↓
**Sales rep notification:**
- SAP email alert
- SAP task created
- CRM dashboard updated
   ↓
**Sales takes over**
   ↓
**Closed-loop tracking:**
- SAP → Evalanche: deal stage updates
- Evalanche: marketing attribution
- Group reports: marketing ROI
```

### 20.2 B2B Maschinenbauer example

Per Business.digital:

> _"Ein B2B-Maschinenbauer mit SAP CRM will Lead Management digitalisieren. Mit Evalanche: Landing Pages für Whitepaper-Downloads. Formulare erfassen Interessenten und scoren sie automatisch. Campaign Designer steuert Nurturing-Sequences: Nach Whitepaper kommt Case Study, dann Webinar-Einladung. Scoring identifiziert kaufbereite Leads und übergibt sie ans SAP CRM. Multi-Tenant ermöglicht separate Kampagnen für drei Produktmarken."_

**Real-world flow:**

```
1. Prospect visits landing page (whitepaper download)
   ↓
2. Form submission → Evalanche
   ↓
3. Whitepaper sent + Tracked
   ↓
4. Scoring: +15
   ↓
5. Wait 5 days
   ↓
6. Send case study (persona-based)
   ↓
7. Click tracking + Scoring: +10
   ↓
8. Wait 7 days
   ↓
9. Send webinar invitation
   ↓
10. Webinar registration: +25
   ↓
11. Webinar attendance: +20
   ↓
12. **Total score: 70+ → MQL threshold met**
   ↓
13. Push to SAP CRM
   ↓
14. Sales rep assigned (per geographic / product line)
   ↓
15. Sales contacts lead
   ↓
16. Deal pipeline starts
```

### 20.3 Marketing Cockpit shows results

Per Business.digital:

> _"Marketing Cockpit zeigt Pipeline-Beitrag jeder Kampagne."_

- **Marketing Cockpit dashboard**
- **Per-campaign pipeline contribution**
- **ROI per campaign**
- **Attribution clarity**

---

## 21. Evalanche print + analog channel flow

### 21.1 Print integration

Per FlyMint:

> _"Gerade in Branchen, in denen Fax oder Brief weiterhin wichtige Kommunikationskanäle sind (z. B. Handwerk, Apotheken), hat Evalanche die passende Marketing-Power an Bord."_

**UNIKÁTNÍ pro DACH B2B:**

- **Fax** still relevant (Handwerk, Apotheken)
- **Direct mail / Brief**
- **Combined s digital**
- **Multi-channel B2B**

### 21.2 Multi-channel campaign s print

```
B2B campaign:
   ↓
Step 1: Email send (initial outreach)
   ↓
Wait 5 days
   ↓
Step 2: Print job triggered
- Direct mail send (physical letter)
- Personalized content
- High-value materials
   ↓
Wait 7 days
   ↓
Step 3: Follow-up email
   ↓
Step 4: Sales rep call (if engaged)
```

### 21.3 Why analog matters

Per FlyMint:

> _"Nutzt die haptischen Vorteile analoger Medien, um länger und nachhaltiger im Kopf zu bleiben: E-Mail ist ideal für schnelle 'Instant'-Kommunikation – Print punktet beim Brand Building und bei nachhaltiger Wirkung."_

**Print advantages:**

- **Tactile experience**
- **Longer retention**
- **Brand building**
- **Higher perceived value**
- **Cuts through email clutter**

### 21.4 Use cases

#### Handwerk (craftsmen)

```
Local craftsman business
   ↓
Customer database
   ↓
Multi-channel campaign:
- Email (digital reminders)
- Postcard (seasonal promotion)
- Fax (still used for orders!)
   ↓
Comprehensive reach
```

#### Apotheken (pharmacies)

```
Pharmacy customer communication
   ↓
Channels:
- Email (newsletter)
- Direct mail (catalogues)
- Fax (still relevant for B2B with doctors)
   ↓
Regulatory compliance maintained
```

---

# Část 3: Společné aspekty

## 22. Email lifecycle (oba)

### 22.1 Email lifecycle common pattern

```
┌─────────────────────────────────────────────────────────────────┐
│  1. USER drafts campaign                                        │
│     - Audience (segment / persona)                              │
│     - Design + personalize                                      │
│                            │                                    │
│                            ▼                                    │
│  2. PRE-SEND CHECKS                                             │
│     - Sender verified?                                          │
│     - Domain DKIM/SPF/DMARC?                                    │
│     - Audience valid?                                           │
│     - GDPR compliance                                           │
│                            │                                    │
│                            ▼                                    │
│  3. SEND TIME                                                   │
│     - Send now / Scheduled                                      │
│                            │                                    │
│                            ▼                                    │
│  4. PER-RECIPIENT GENERATION                                    │
│     - Personalization tokens                                    │
│     - Dynamic content                                           │
│     - Tracking pixels                                           │
│     - Click trackers                                            │
│                            │                                    │
│                            ▼                                    │
│  5. SMTP SEND                                                   │
│     - Mapp: EU infrastructure                                   │
│     - Evalanche: EXCLUSIVELY Germany                            │
│     - DKIM signed, SPF compliant, DMARC aligned                 │
│                            │                                    │
│                            ▼                                    │
│  6. ISP RECEIVES                                                │
│     - DACH ISPs (GMX, web.de, T-Online, 1&1)                    │
│     - International ISPs                                        │
│                            │                                    │
│                            ▼                                    │
│  7. ROUTING                                                     │
│     - Inbox (high probability)                                  │
│                            │                                    │
│                            ▼                                    │
│  8. RECIPIENT INTERACTION                                       │
│     - Mapp: cross-channel engagement tracked                    │
│     - Evalanche: scoring + persona update                       │
│                            │                                    │
│                            ▼                                    │
│  9. PROFILE UPDATE                                              │
│     - Mapp: CDP + AI scores update                              │
│     - Evalanche: Multivariate scoring + persona                 │
│                            │                                    │
│                            ▼                                    │
│ 10. REPORTING                                                   │
│     - Mapp: Cross-channel reports                               │
│     - Evalanche: Marketing Cockpit pipeline impact              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 23. GDPR compliance flow (oba)

### 23.1 Mapp GDPR

- **European heritage**
- **GDPR-native compliance**
- **Data residency** v EU options
- **Consent management** built-in
- **Usercentrics partner**
- **Right to be Forgotten**
- **DSAR support**

### 23.2 Evalanche GDPR

- **DSGVO native**
- **Servers EXCLUSIVELY v Germany**
- **ISO 27001 TÜV-certified** (annual)
- **TÜV SÜD certified** (1st email tool!)
- **Double Opt-in default** (DACH standard)
- **DPA (Auftragsverarbeitungsvertrag) standard**

### 23.3 Right to Be Forgotten (oba)

```
Recipient requests deletion
   ↓
Admin/API initiated
   ↓
Platform removes personal data
   ↓
Anonymized events
   ↓
Audit log entry
   ↓
Confirmation email (GDPR compliant)
```

---

## 24. Datová mapa

### 24.1 Mapp datová mapa

| Data                 | Owner | Marketing | Analyst  | Designer |  Mobile  |    API    |  Subscriber   |
| -------------------- | :---: | :-------: | :------: | :------: | :------: | :-------: | :-----------: |
| Account settings     |  ✅   |    ❌     |    ❌    |    ❌    |    ❌    | per scope |      ❌       |
| All profiles         |  ✅   |    ✅     |    ✅    | limited  | per role |    ✅     |   jen sebe    |
| CDP unified data     |  ✅   |    ✅     |    ✅    | limited  |   view   |    ✅     |       –       |
| AI predictive scores |  ✅   |    ✅     |    ✅    |   view   |   view   | per scope |      ❌       |
| Email campaigns      |  ✅   |    ✅     |   view   |    ✅    |   view   |    ✅     | jen co dostal |
| SMS campaigns        |  ✅   |    ✅     |   view   |   view   |   view   |    ✅     | jen co dostal |
| Mobile push          |  ✅   | per role  |   view   |   view   |    ✅    |    ✅     | jen co dostal |
| In-app messages      |  ✅   | per role  |   view   |   view   |    ✅    |    ✅     |    in-app     |
| Web banners          |  ✅   |    ✅     |   view   |    ✅    |   view   |    ✅     |  on website   |
| Workflows            |  ✅   |    ✅     |   view   |   view   |   view   |    ✅     |      ❌       |
| Activate workflows   |  ✅   |    ✅     |    ❌    |    ❌    | per role |    ✅     |      ❌       |
| Reports              |  ✅   |    ✅     |    ✅    |   view   |   view   |    ✅     |      ❌       |
| Integrations         |  ✅   | per role  |   view   |    ❌    |    ❌    | per scope |       –       |
| API keys             |  ✅   |    ❌     |    ❌    |    ❌    |    ❌    |     –     |       –       |
| GDPR delete          |  ✅   | per role  | per role |    ❌    |    ❌    |    ✅     |    request    |

### 24.2 Evalanche datová mapa

| Data                 | Owner | Marketing  | Lead Mgmt  |  Designer  |      Sales       |  Analyst   |    API    | Subscriber |
| -------------------- | :---: | :--------: | :--------: | :--------: | :--------------: | :--------: | :-------: | :--------: |
| Account settings     |  ✅   |     ❌     |     ❌     |     ❌     |        ❌        |     ❌     | per scope |     ❌     |
| All profiles         |  ✅   |     ✅     |     ✅     |  limited   | view (qualified) |     ✅     |    ✅     |  jen sebe  |
| Multivariate scoring |  ✅   |     ✅     |     ✅     |    view    |       view       |     ✅     |    ✅     |     ❌     |
| Buyer Personas       |  ✅   |     ✅     |     ✅     |    view    |       view       |    view    |    ✅     |     –      |
| Campaign Designer    |  ✅   |     ✅     |    view    |    view    |       view       |    view    |    ✅     |     –      |
| Landing Pages        |  ✅   |     ✅     |     ✅     |     ✅     |       view       |    view    |    ✅     |   submit   |
| Forms (Progressive)  |  ✅   |     ✅     |     ✅     |     ✅     |       view       |    view    |    ✅     |   submit   |
| PowerSets            |  ✅   |     ✅     |     ✅     |     ✅     |       view       |    view    |    ✅     |     –      |
| Lead Management      |  ✅   |     ✅     |     ✅     |    view    |        ✅        |    view    |    ✅     |     –      |
| Sales handoff to CRM |  ✅   |     ✅     |     ✅     |     ❌     |     receive      |    view    |    ✅     |     ❌     |
| Multi-tenant         |  ✅   | per tenant | per tenant | per tenant |    per tenant    | per tenant | per scope | per tenant |
| Print campaigns      |  ✅   |     ✅     |    view    |    view    |       view       |    view    |    ✅     |  receive   |
| Marketing Cockpit    |  ✅   |     ✅     |     ✅     |    view    |       view       |     ✅     |    ✅     |     ❌     |
| SAP CRM integration  |  ✅   |     ✅     |     ✅     |     ❌     |        ✅        |    view    | per scope |     –      |
| API keys             |  ✅   |     ❌     |     ❌     |     ❌     |        ❌        |     ❌     |     –     |     –      |
| GDPR delete          |  ✅   |  per role  |     ✅     |     ❌     |     per role     |     ❌     |    ✅     |  request   |

---

## 25. Známé úzkoprofilové místa

### 25.1 Mapp limity

#### Less market awareness

- Limited brand recognition vs. HubSpot / Salesforce
- Smaller community
- Fewer integrations než market leaders

#### Less granular segmentation

- Per Research.com less granular than competitors

#### Manual data import/export

- Some manual workflows needed

#### Email tool bugs

- Per Capterra: HTML creator has bugs
- Templates not always responsive

#### Customer support varies

- Per G2: support quality inconsistent

#### Complexity

- Steep learning curve

#### Higher cost

- Premium pricing
- Not for SMB

#### Limited UI languages

- 5 only (EN, FR, DE, IT, ES)
- No CEE (no CZ/SK/PL)

#### B2C/D2C focus = limited B2B

- B2B features less developed
- B2B should use Evalanche

### 25.2 Evalanche limity

#### Less SMB-friendly

- Mid-market + enterprise only
- Per Business.digital: "Für KMU gibt es zugänglichere Alternativen"

#### Steep learning curve

- Per OMR Reviews: complex
- Initial setup difficult

#### Higher pricing

- Not for small budgets

#### Outdated interface feel

- Per OMR Reviews: "interface can feel outdated"
- Despite V7 modernization

#### Reporting could be improved

- Per OMR Reviews

#### B2B focus = limited B2C

- B2C should use Mapp
- DTC should use Klaviyo / Mapp

#### Lower brand awareness

- "Hidden Champion" status
- Less international visibility

#### No public pricing

- Sales-driven only

#### Limited integrations vs. market leaders

- Best-of-Breed = fewer pre-built
- Custom dev sometimes needed

#### No autonomous AI

- KI assistive only
- Not full AI agents

### 25.3 Společné limity

- **No SMB freemium**
- **Custom pricing** only
- **Learning curve** steep
- **Mid-market+ entry barrier**
- **Less brand awareness** globally
- **No autonomous AI agents** vs. modern competitors

---

## 26. Doporučení pro design vlastních procesů

### 26.1 Pro Mapp users

1. **Domain authentication day 1**
2. **CDP data model design** carefully
3. **Mobile app SDK** integration if applicable
4. **AI features train na historical data**
5. **Cross-channel strategy** plan
6. **Frequency caps cross-channel** prevent over-messaging
7. **GDPR compliance documentation**
8. **Identity resolution rules**
9. **Customer Success Manager** využívat strategically
10. **Predictive segments** leverage
11. **Mobile push best practices**
12. **In-app messaging strategy**
13. **Personalization across channels**
14. **A/B testing culture**
15. **Reports + dashboards** custom for team

### 26.2 Pro Evalanche users

1. **Domain authentication day 1**
2. **PowerSets adopt** pro faster start
3. **Buyer Personas definitively** before scoring
4. **Multivariate Scoring tuning**
5. **CRM integration first** (especially SAP CRM)
6. **Best-of-Breed mindset** maintain
7. **Multi-tenant design** if applicable
8. **Progressive Profiling** smart forms
9. **Print integration** for DACH B2B
10. **Premium Partner consulting** if available (FlyMint)
11. **Marketing Cockpit** dashboard regular review
12. **Sales handoff SLA** define clearly
13. **Lead scoring threshold** tuning
14. **DSGVO documentation** maintain
15. **ISO 27001 compliance** leverage v procurement

---

_Dokument zpracován z oficiálních zdrojů mapp.com + sc-networks.com a praktických zdrojů (GetApp, Capterra, G2, OMR Reviews, SoftwareAdvice, SoftwareSuggest, Research.com, FitGap, Business.digital, FlyMint, email-marketing-forum.de, LinkedIn). Pro nejaktuálnější detaily je nutný engagement s Mapp / SC-Networks sales teamem._
