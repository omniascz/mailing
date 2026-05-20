# SALESmanago – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v SALESmanago prochází data, lidé a akce – od onboardingu přes Customer Engagement Platform setup, partner network engagement, až po koncového customer journey.

> Tento dokument doplňuje `25_SALESmanago_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** SALESmanago umí, tento popisuje, **kdo s tím interaguje a jak data tečou**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
>
> - **Polský produkt (Kraków, Benhauer sp. z o.o.)** – jeden z předních CEE hráčů
> - **AI-driven CDXP** – Customer Data Platform + Customer Experience Platform v jedné
> - **No-code platform** – marketing teams nepotřebují dev
> - **350 zaměstnanců + 1 000+ reselling partners** internationally
> - **3 000+ klientů ve 50 zemích** (Starbucks, Vodafone, Lacoste, New Balance, Victoria's Secret, Adidas, Converse, Crocs)
> - **Sales-driven model** – no self-serve sign-up
> - **Pricing od €199/měsíc** custom per klient
> - **Strategic Growth Plan approach** – consultative, not transactional
> - **EU-based + GDPR-compliant**
> - **Partner-led implementations** often
> - **Post-acquisition (SilverTree Equity)** strategic shifts
> - **Modular add-on architektura** post-2024 redesign

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Sales & qualification flow](#2-sales-flow)
3. [Growth Plan creation flow](#3-growth-plan-flow)
4. [Onboarding flow (s partner involvement)](#4-onboarding-flow)
5. [User roles & permissions](#5-user-roles)
6. [Account Owner / Master Admin flow](#6-account-owner-flow)
7. [Marketing user flow](#7-marketing-user-flow)
8. [Analyst flow (CDP focus)](#8-analyst-flow)
9. [Customer profile lifecycle](#9-customer-profile)
10. [Visitor → Lead → Customer journey flow](#10-visitor-lead-customer)
11. [CDP data ingestion flow](#11-cdp-data-flow)
12. [Real-time segmentation flow](#12-segmentation-flow)
13. [Email lifecycle](#13-email-lifecycle)
14. [Marketing Automation execution model](#14-automation-execution)
15. [AI personalization flow](#15-ai-personalization-flow)
16. [Recommendation Frames flow](#16-recommendation-flow)
17. [Web Experience execution (pop-ups, banners)](#17-web-experience-flow)
18. [Zero-party data collection flow](#18-zero-party-flow)
19. [Omnichannel orchestration flow](#19-omnichannel-flow)
20. [API & Integration flow](#20-integration-flow)
21. [Partner-led implementation flow](#21-partner-flow)
22. [GDPR & Compliance flow](#22-gdpr-flow)
23. [Datová mapa: co vidí kdo](#23-datová-mapa)
24. [Známé úzkoprofilové místa](#24-úzkoprofilové-místa)

---

## 1. Mapa všech aktérů

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│         SALESMANAGO ECOSYSTEM                                      │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [SALESmanago Internal Team (Kraków, 350 employees)]               │
│   ├─ Sales team (regional + global)                                │
│   ├─ Customer Success Managers (per klient)                        │
│   ├─ Partner Program Managers                                      │
│   ├─ Implementation Consultants                                    │
│   ├─ Data Scientists (AI/ML team)                                  │
│   ├─ Technical Support                                             │
│   ├─ Workshops + Training team                                     │
│   ├─ DevOps + Engineering                                          │
│   └─ Customer-side advisors                                        │
│                                                                    │
│  [Partner Network – 1 000+ reselling partners]                     │
│   ├─ Digital agencies (largest segment)                            │
│   ├─ Marketing automation specialists                              │
│   ├─ E-commerce consultancies                                      │
│   ├─ System integrators                                            │
│   └─ Per region: Poland, DACH, UK, Iberia, France, IT, CEE, LatAm  │
│           │ (lead onboarding + ongoing support)                    │
│           ▼                                                        │
│                                                                    │
│   ┌──────────────────────────────────────────┐                     │
│   │   SALESmanago Account                    │                     │
│   │                                          │                     │
│   │   User roles (typical):                  │                     │
│   │   ├─ Account Owner / Master Admin        │◄── full access     │
│   │   ├─ Marketing Manager                   │◄── operational lead │
│   │   ├─ Marketing user                      │◄── daily tasks      │
│   │   ├─ Analyst / Data user                 │◄── CDP + reports    │
│   │   ├─ Designer / Editor                   │◄── content only     │
│   │   └─ Read-only / Viewer                  │◄── reports only     │
│   │                                          │                     │
│   │   + Multi-account support (per package)  │                     │
│   │   + Partner access (if applicable)       │                     │
│   │                                          │                     │
│   │   + Dedicated CSM per klient             │                     │
│   └──────────────┬───────────────────────────┘                     │
│                  │                                                 │
│                  ▼                                                 │
│   [Visitors / Contacts / Customers]                                │
│       │                                                            │
│       ├─→ Anonymous web tracking                                   │
│       ├─→ Identified leads (form, identification)                  │
│       ├─→ Active customers (purchases)                             │
│       ├─→ VIP customers (high LTV)                                 │
│       └─→ Dormant / at-risk (re-engagement)                        │
│                  │                                                 │
│                  ▼                                                 │
│   [Customer Engagement Platform (CEP) modules]                     │
│       ├─→ CDP (Audiences) - 360° profiles                          │
│       ├─→ Web Experience (pop-ups, banners, on-site)               │
│       ├─→ Email Marketing (AI Email Design Studio)                 │
│       ├─→ Marketing Automation (Workflows)                         │
│       ├─→ AI Personalization (Recommendation Frames)               │
│       ├─→ Product Collections (Deep Behavioral)                    │
│       ├─→ Customer Preference Center                               │
│       └─→ Omnichannel Execution (SMS, web push, mobile, ads)       │
│                  │                                                 │
│                  ▼                                                 │
│   [Integrations]                                                   │
│       ├─→ E-commerce (Shopify, Magento, WooCommerce, etc.)         │
│       ├─→ CRM (Salesforce, HubSpot, Dynamics)                      │
│       ├─→ Ad platforms (Meta, Google, TikTok)                      │
│       ├─→ Analytics (Google Analytics)                             │
│       ├─→ API + Webhooks                                           │
│       └─→ Custom integrations (via partners)                       │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér                             | Vstupní bod                   | Co dělá                          | Co vidí              |
| --------------------------------- | ----------------------------- | -------------------------------- | -------------------- |
| **Account Owner / Master Admin**  | Created during contract setup | Full + billing + users           | Vše                  |
| **Marketing Manager**             | Pozvánka                      | Operational lead                 | Per scope            |
| **Marketing user**                | Pozvánka                      | Daily tasks                      | Per permissions      |
| **Analyst / Data user**           | Pozvánka                      | CDP + reports + segments         | Read + segment build |
| **Designer / Editor**             | Pozvánka                      | Content + templates              | Per role             |
| **Read-only / Viewer**            | Pozvánka                      | View reports only                | Read-only            |
| **Anonymous visitor**             | Website visit                 | Browses (tracked)                | Své interaction      |
| **Identified Lead**               | Form, identification          | Receives marketing               | Své komunikace       |
| **Customer**                      | Purchase                      | Receives campaigns + automations | Své komunikace       |
| **Customer in Preference Center** | Self-service portal           | Manages preferences              | Své account          |
| **Dedicated CSM (SALESmanago)**   | Assigned at sign-up           | Strategy, optimization           | Read s consent       |
| **Partner Account Manager**       | Per reseller partner          | Implementation + support         | Per client scope     |
| **Implementation Consultant**     | During onboarding             | Setup + training                 | Per project scope    |
| **API Client**                    | API credentials               | Custom integration               | Per scope            |

---

## 2. Sales & qualification flow

### 2.1 Lead acquisition channels

```
Inbound:
- salesmanago.com → Request demo form
- Content marketing (blog, webinars, case studies)
- Industry events (e-commerce conferences)
- G2 / Capterra reviews
- Word-of-mouth (partner referrals)

Outbound:
- SDR team prospecting
- LinkedIn outreach
- Partner-introduced leads
- Event leads
```

### 2.2 Initial inquiry flow

```
Prospect submits form: salesmanago.com → Request demo
   ↓
SALESmanago sales responds (typically 1 business day)
   ↓
**Discovery call (60-90 min):**
- Business type (e-commerce, retail, services)
- Industry vertical
- Current marketing stack
- Contact database size
- Email volume monthly
- Revenue + growth rate
- Geographic distribution
- E-commerce platform
- Current pain points
- Strategic goals
- Decision-making process
- Timeline
- Budget range
   ↓
**Qualification check:**
- Mid-market+ fit
- E-commerce focus alignment
- Budget compatibility
- Geographic coverage
- Reseller partner involvement (if applicable)
```

### 2.3 Qualification criteria

SALESmanago targets **mid-market e-commerce**:

- **50K+ contacts ideally**
- **€500K+ revenue/year**
- **B2C focus** (some B2B works)
- **Multiple sales channels** ideally
- **Complex personalization needs**
- **Budget €5K+/year** annual minimum typical

For pricing entry (€199+/month):

- Small mid-market (10K-50K contacts)
- Lower complexity initially
- Growth trajectory expected

### 2.4 Partner involvement decision

```
During discovery:
- Prospect's location?
- Existing agency relationship?
- Implementation needs?
   ↓
SALESmanago may recommend partner:
- Local language support
- On-the-ground implementation
- Ongoing optimization
   ↓
Partner Account Manager assigned:
- Joint discovery with SALESmanago
- Partner-led ongoing relationship
- Partner handles implementation
- SALESmanago provides platform support
```

### 2.5 Demo + technical discussion

```
Demo 1 (60-90 min):
- Platform walkthrough
- Industry-specific use cases
- AI personalization showcase
- ROI calculator
- Reference customer stories (Starbucks, Lacoste, etc.)
- Q&A
   ↓
Technical deep dive (s client IT/data team):
- Integration architecture
- E-commerce platform integration
- Data migration approach
- Custom integration scope
- Security + compliance review
- API capabilities
   ↓
Use case workshop:
- Map current customer journeys
- Identify automation opportunities
- Recommend SALESmanago features
- ROI projection
```

### 2.6 Growth Plan creation

Per oficiální:
_"starting with a custom Growth Plan tailored to your business"_

```
SALESmanago CSM + sales prepare Growth Plan:
- Strategic assessment
- 4 Growth Framework phases mapped:
  1. Acquisition
  2. Conversion
  3. Engagement
  4. Loyalty & Scale
- KPI alignment
- Tool selection per phase
- Implementation timeline
- Success metrics
- ROI projection
   ↓
Growth Plan presented to client
   ↓
Iterations / customization
```

### 2.7 Proposal generation

```
Custom proposal includes:
- CEP package recommendation
- Add-ons selection (per Growth Plan)
- Pricing tier (od €199/měsíc base)
- Contract terms (annual vs. multi-year)
- Implementation scope (in-house vs. partner)
- Support level (Standard / Premium / Enterprise)
- Training scope
- Custom integration scope (if applicable)
   ↓
Proposal sent
   ↓
Negotiation:
- Pricing flexibility
- Term length
- Add-on adjustments
- Custom integrations
```

### 2.8 Contract signing

```
Contract documents:
- Master Service Agreement
- DPA (Data Processing Agreement)
- SLA (per tier)
- Statement of Work (implementation)
- Partner agreement (if applicable)
   ↓
Signed
   ↓
[Project kickoff scheduled]
```

---

## 3. Growth Plan creation flow

### 3.1 Why Growth Plan matters

**Consultative approach** differentiator:

- Not just tool sale
- Strategic partnership
- Outcomes-focused
- Customized roadmap

### 3.2 Growth Plan workshop

```
Pre-workshop preparation:
- Client provides business data
- Current state assessment
- KPI baselines
- Goals identification
   ↓
Workshop (s SALESmanago consultant + client):
- 1-2 day strategic session
- Map customer journeys
- Identify automation opportunities
- Prioritize use cases
- Set 90-day, 180-day, 365-day goals
- Define success metrics
   ↓
Output: Custom Growth Plan document
```

### 3.3 Growth Plan structure

```
Section 1: Strategic Assessment
- Current state analysis
- Gaps identified
- Opportunities prioritized

Section 2: Growth Framework Application
- Phase 1: Acquisition strategies
  - Web Experience tactics
  - Lead capture optimization
  - Acquisition campaigns
- Phase 2: Conversion strategies
  - Cart abandonment
  - Browse abandonment
  - First purchase incentives
- Phase 3: Engagement strategies
  - Welcome series
  - Newsletter optimization
  - Personalization
- Phase 4: Loyalty & Scale strategies
  - VIP nurture
  - Win-back campaigns
  - Loyalty program integration

Section 3: Implementation Roadmap
- Phase 1 (months 1-3): Foundation
- Phase 2 (months 4-6): Optimization
- Phase 3 (months 7-12): Scale

Section 4: KPIs + Success Metrics
- Conversion rate targets
- Email engagement targets
- Revenue attribution goals
- LTV improvement
- ROI projections

Section 5: Ongoing Optimization
- Quarterly Business Reviews
- Continuous improvement cycle
- New feature adoption
```

### 3.4 Per-phase Growth Plan execution

```
Each phase has:
- Specific tactics to implement
- Tools / features used
- Team responsible
- Timeline
- Expected outcomes
- Measurement metrics
   ↓
Quarterly review:
- Performance vs. goals
- Adjustments needed
- Next quarter focus
```

---

## 4. Onboarding flow (s partner involvement)

### 4.1 Project kickoff (Week 1)

```
Contract signed
   ↓
**SALESmanago assigns:**
- Dedicated CSM
- Implementation Consultant
- Technical support contact

**Partner (if applicable) assigns:**
- Partner Account Manager
- Implementation lead
- Local language support

**Client side:**
- Project sponsor
- Marketing lead
- IT lead
- Compliance/Legal (if applicable)
- E-commerce team
   ↓
**Kickoff workshop (1-2 days):**
- Introductions across teams
- Growth Plan walkthrough
- Goals + KPIs alignment
- Communication cadence
- Risk identification
- Success criteria
- Project plan delivery
```

### 4.2 Setup phase (Week 1-4)

```
Account provisioning:
- SALESmanago creates account
- Master Admin credentials
- User roles configured
- Default settings
   ↓
Domain authentication:
- DKIM records
- SPF records
- DMARC policy
- Branded tracking domain
- Email verification
   ↓
Brand kit setup:
- Colors, fonts, logos
- Template defaults
- Email defaults
- Brand consistency
```

### 4.3 Integration phase (Week 2-8)

```
E-commerce platform integration:
- Shopify / Magento / WooCommerce / BigCommerce / custom
- OAuth or API connection
- Customer + order + product sync setup
- Tracking script installation on website
- Webhook configuration
- Test sync
- Production sync
   ↓
CRM integration (if applicable):
- Salesforce / HubSpot / Dynamics
- Contact sync setup
- Field mapping
- Bidirectional sync
   ↓
Ad platform integration:
- Meta Business connection
- Google Ads connection
- TikTok Ads (if applicable)
- Audience sync setup
   ↓
Custom integrations (via partner if complex):
- Per business need
- API + webhooks
- Custom data flows
```

### 4.4 CDP setup (Week 4-8)

```
Customer Data Platform configuration:
- Custom field schema design
- Tag taxonomy
- Lifecycle stage definitions
- Engagement Score config
- Audience segments design
- Identity resolution rules
   ↓
Historical data migration:
- Existing contacts import
- Order history import
- Engagement history (if available)
- Product catalog sync
   ↓
Data validation:
- Sample profiles reviewed
- Identity resolution verified
- Segments tested
```

### 4.5 Web Experience setup (Week 4-10)

```
Monitoring code installation:
- JavaScript snippet on all pages
- Cookie consent integration (GDPR)
- E-commerce data layer
   ↓
Pop-up + banner design:
- Welcome pop-up
- Exit-intent pop-up
- Cart abandonment pop-up
- Newsletter signup forms
- Newsletter banners
   ↓
On-site personalization rules:
- Per-segment content
- Returning visitor recognition
- VIP visitor experience
   ↓
Testing + activation
```

### 4.6 Email setup (Week 6-10)

```
Master templates designed:
- Newsletter template
- Promotional template
- Transactional templates
- Welcome series templates
   ↓
AI Email Design Studio explored:
- Generate sample emails
- Brand kit application
- A/B variants
   ↓
Recommendation Frames configured:
- Frame templates
- Strategy selection (collaborative, content-based, etc.)
- Item count, filtering
   ↓
Initial campaigns prepared:
- Welcome series
- Brand introduction
- First newsletter
```

### 4.7 Automation setup (Week 8-12)

```
Workflow design sessions:
- Welcome series (multi-step)
- Cart abandonment (multi-channel)
- Browse abandonment
- Post-purchase journey
- Win-back campaign
- Birthday automation
- VIP nurture
- Re-engagement
   ↓
Build workflows v drag-drop builder:
- Configure triggers
- Add nodes
- Set conditions
- Configure goals
- Test mode
   ↓
QA + approval
   ↓
Activate workflows
```

### 4.8 Training (Week 10-14)

```
Multi-track training:

Track 1: Marketing team
- Platform basics
- Campaign creation
- Segmentation
- Workflow management
- Reports interpretation

Track 2: Advanced users (CDP specialists)
- CDP deep dive
- Audience building
- Custom attributes
- Identity resolution
- AI features

Track 3: Analytics team
- Reports + dashboards
- Custom reports
- Data extraction
- ROI tracking

Track 4: Admins
- User management
- Security
- Integration management
- API access
```

### 4.9 Go-live (Week 12-16)

```
Pre-launch QA:
- All workflows tested end-to-end
- Domain authentication verified
- Integration tested
- Compliance review
   ↓
Soft launch:
- Limited audience (10-20%)
- Daily monitoring
- Quick issue resolution
   ↓
Full launch:
- 100% audience activated
- Continuous monitoring
   ↓
**Hypercare period** (4-6 weeks):
- Daily check-ins s CSM
- Performance optimization
- Quick bug fixes
- Workshop refresher
```

### 4.10 Integration health check

Per Capterra critique:
_"it would be helpful for the clients if SalesManago conducts a health check at the end of each integration"_

⚠️ **Doporučení:** Request explicit health check post-implementation:

- Verify purchases tracking
- Verify dashboards
- Verify automation triggers
- Verify customer data sync

### 4.11 Transition to BAU

```
Post-launch:
- CSM monthly cadence
- Quarterly Business Review (QBR)
- Performance optimization
- New feature adoption
- Partner ongoing support
   ↓
Annual strategic review:
- Roadmap alignment
- New use cases
- Expansion opportunities
- Contract renewal
```

---

## 5. User roles & permissions

### 5.1 Default roles (typical for SALESmanago)

⚠️ Exact role naming not always publicly documented. Typical structure pro enterprise CDP+CEP platforms:

#### Account Owner / Master Admin

- **Highest tier**
- Created during contract setup
- **Full administrative control**
- Billing access
- User management
- Sub-account management (if applicable)
- Integration management
- API key management
- Compliance settings
- Close account

#### Marketing Manager / Administrator

- **Operational lead**
- User management within scope
- Configuration changes
- Cannot manage billing
- Cannot close account

#### Marketing user

- **Daily operational tasks**
- Campaigns + workflows + segments
- Content creation
- Templates
- Send permissions
- View reports
- No user management

#### Analyst / Data user

- **CDP + analytics focus**
- Build audiences + segments
- Reports + dashboards
- No send permissions typically
- Read-heavy access

#### Designer / Editor

- **Content focused**
- Templates + design
- Limited customer data
- No send permissions

#### Read-only / Viewer

- **View reports only**
- No editing
- Stakeholders, executives

### 5.2 Permission categories

#### Account & Settings

- Account info
- Billing access
- User management
- Integration management
- Domain settings
- API key management
- Compliance settings

#### CDP / Audiences

- View contacts / profiles
- Edit profiles
- Build segments
- Manage tags
- Import / export

#### Email

- Create campaigns
- Edit campaigns
- Send campaigns
- Templates management

#### Workflows / Automation

- Create workflows
- Edit workflows
- Activate workflows

#### Web Experience

- Create pop-ups
- Manage banners
- On-site personalization

#### AI Features

- Use Recommendation Frames
- Configure AI Email Design
- ChatGPT integration

#### Reports

- View reports
- Custom dashboards
- Data export

#### Integrations

- View integrations
- Manage integrations

### 5.3 Permission matrix (typical)

| Akce                    | Master Admin | Mkt Manager | Mkt User | Analyst  | Designer |  Viewer  |
| ----------------------- | :----------: | :---------: | :------: | :------: | :------: | :------: |
| **Account & Billing**   |              |             |          |          |          |          |
| Close account           |      ✅      |     ❌      |    ❌    |    ❌    |    ❌    |    ❌    |
| Manage billing          |      ✅      |     ❌      |    ❌    |    ❌    |    ❌    |    ❌    |
| Account settings        |      ✅      |     ✅      |    ❌    |    ❌    |    ❌    |    ❌    |
| **User Management**     |              |             |          |          |          |          |
| Add/edit users          |      ✅      |     ✅      |    ❌    |    ❌    |    ❌    |    ❌    |
| **CDP / Audiences**     |              |             |          |          |          |          |
| View profiles           |      ✅      |     ✅      |    ✅    |    ✅    | limited  |   view   |
| Edit profiles           |      ✅      |     ✅      |    ✅    |    ✅    |    ❌    |    ❌    |
| Import/Export           |      ✅      |     ✅      | per role | per role |    ❌    |    ❌    |
| Build segments          |      ✅      |     ✅      |    ✅    |    ✅    |    ❌    |   view   |
| **Email**               |              |             |          |          |          |          |
| Create campaigns        |      ✅      |     ✅      |    ✅    |    ❌    |    ✅    |   view   |
| Send campaigns          |      ✅      |     ✅      |    ✅    |    ❌    |    ❌    |    ❌    |
| Templates               |      ✅      |     ✅      |    ✅    |    ❌    |    ✅    |   view   |
| **Workflows**           |              |             |          |          |          |          |
| Create / edit           |      ✅      |     ✅      |    ✅    |    ❌    |    ❌    |   view   |
| Activate                |      ✅      |     ✅      |    ✅    |    ❌    |    ❌    |    ❌    |
| **Web Experience**      |              |             |          |          |          |          |
| Pop-ups / Banners       |      ✅      |     ✅      |    ✅    |    ❌    |    ✅    |   view   |
| On-site personalization |      ✅      |     ✅      |    ✅    |    ❌    | per role |   view   |
| **AI Features**         |              |             |          |          |          |          |
| Recommendation Frames   |      ✅      |     ✅      |    ✅    |   view   | per role |   view   |
| AI Email Design         |      ✅      |     ✅      |    ✅    |    ❌    |    ✅    |   view   |
| ChatGPT integration     |      ✅      |     ✅      |    ✅    | per role | per role |   view   |
| **Reports**             |              |             |          |          |          |          |
| View                    |      ✅      |     ✅      |    ✅    |    ✅    |   view   |    ✅    |
| Custom dashboards       |      ✅      |     ✅      | per role |    ✅    |    ❌    |   view   |
| Export                  |      ✅      |     ✅      | per role |    ✅    |    ❌    | per role |
| **Integrations**        |              |             |          |          |          |          |
| Manage                  |      ✅      |     ✅      |    ❌    |    ❌    |    ❌    |    ❌    |
| **API**                 |              |             |          |          |          |          |
| Manage API keys         |      ✅      |     ✅      |    ❌    |    ❌    |    ❌    |    ❌    |

### 5.4 User invitation flow

```
Master Admin: Settings → Users → Add new
   ↓
Email + Personal details
   ↓
Role selection
   ↓
Granular permissions (per role + customization)
   ↓
Send invitation
   ↓
User activates + sets password
   ↓
[Active user]
```

---

## 6. Account Owner / Master Admin flow

### 6.1 Master Admin responsibilities

```
Master Admin = highest tier
   ↓
Created during contract signing
   ↓
Manages:
- Billing
- User management
- Account settings
- Domain settings
- Integration access
- API key management
- Compliance settings
- Partner relationship
- CSM relationship
- Close account option
```

### 6.2 Daily Master Admin workflow

```
Login → Master Dashboard
   ↓
Account overview:
- Today's campaign performance
- Active workflow count
- Total contacts vs. plan
- CDP database health
- Integration status
- Engagement Score trends
- Revenue attribution
   ↓
Strategic activities:
- Plan tier vs. usage
- Team performance audit
- ROI tracking
- Partner / CSM communication
- Growth Plan progress review
```

### 6.3 Billing management

```
Master Admin: Settings → Billing
   ↓
View:
- Current plan + tier
- Contact count vs. limit
- Email send volume vs. limit
- Add-ons usage
- SMS credits
- Next billing date
- Invoice history
   ↓
Actions:
- Add-on requests (via sales)
- Plan changes (via sales)
- Update payment method
- Download invoices
```

### 6.4 Manage users

```
Master Admin: User management
   ↓
View all users s roles
   ↓
Add / edit / deactivate users
   ↓
Granular permission configuration
   ↓
Audit logs
```

### 6.5 Strategic CSM partnership

```
Quarterly Business Reviews (QBR):
- Performance vs. Growth Plan
- New use case opportunities
- Roadmap discussions
- ROI tracking
- Next quarter planning

Monthly check-ins:
- Operational review
- Issue resolution
- Optimization recommendations
```

---

## 7. Marketing user flow

### 7.1 Daily Marketing workflow

```
Login → Marketing Dashboard
   ↓
Activities:
- Build segments
- Create campaigns (newsletters, promotional)
- Build / monitor workflows
- Manage pop-ups + banners
- Update templates
- Review performance reports
- A/B testing
- Set up Recommendation Frames
```

### 7.2 Create campaign

```
Email Marketing → New campaign
   ↓
Step 1: Setup
- Campaign name (internal)
- Subject line + personalization
- Sender (verified)
- Reply-to
   ↓
Step 2: Audience
- Select segment(s)
- Exclusion lists
- Audience size preview
   ↓
Step 3: Design
- AI Email Design Studio (generate)
- Or template-based
- Or custom HTML
- Recommendation Frame insertion
- Personalization tokens
   ↓
Step 4: Test
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

### 7.3 Build workflow

```
Marketing Automation → New workflow
   ↓
A) Blank canvas
B) From pre-built framework
   ↓
Build canvas:
- Drag-drop nodes
- Configure trigger
- Add wait nodes
- Set conditions / branches
- Configure sending nodes (email, SMS, push)
- Set goals
- Configure exit conditions
   ↓
Test mode (preview as contact)
   ↓
Activate
   ↓
[Workflow live]
```

### 7.4 Segment building (real-time)

```
CDP → Audiences → New segment
   ↓
Configure conditions:
- Contact attributes
- Behavioral data
- Transactional data
- Declarative data (zero-party)
- Engagement Score
- Subscription source
- Date conditions
- Custom events
   ↓
Combine s AND/OR/NOT
   ↓
Preview segment size (real-time)
   ↓
Save (dynamic)
   ↓
[Segment auto-updates]
```

### 7.5 Web Experience management

```
Web Experience → New pop-up / banner
   ↓
Configure:
- Type (pop-up, banner, etc.)
- Trigger (time, scroll, exit, segment)
- Audience (segment match)
- Frequency caps
- Design (drag-drop builder)
   ↓
Test
   ↓
Activate
   ↓
[Live on website]
```

---

## 8. Analyst flow (CDP focus)

### 8.1 Use case

- **Marketing analyst / data analyst**
- **CDP specialist**
- **Insights / strategy team**
- **External consultant**

### 8.2 Daily Analyst workflow

```
Login → CDP Dashboard
   ↓
Analysis activities:
- Review profile evolution
- Build complex segments
- Audience analysis
- Cohort analysis
- Engagement Score trends
- Revenue attribution
- Custom reports
- Export data
```

### 8.3 CDP exploration

```
Analyst: CDP → Audiences
   ↓
Filter contacts:
- By behavior
- By transaction
- By demographic
- By engagement
- By predictive scores
   ↓
Drill into individual profiles:
- 360° view
- Activity timeline
- Engagement history
- Order history
   ↓
Build segments based on findings
```

### 8.4 Custom reports

```
Reports → Custom dashboard
   ↓
Configure:
- Metric selection
- Date range
- Filters
- Charts / visualizations
   ↓
Save dashboard
   ↓
Share s team
   ↓
Schedule periodic export (per role)
```

### 8.5 Audience insights

```
Analyst identifies:
- Top performing segments
- Underperforming areas
- Cohort behavior patterns
- Channel preferences
- Product affinity
   ↓
Recommendations to marketing team
   ↓
Strategy adjustments
```

---

## 9. Customer profile lifecycle

### 9.1 Profile creation paths

#### A) Anonymous web tracking

```
Visitor lands on website (no cookie)
   ↓
Monitoring code drops cookie ID
   ↓
**Anonymous profile created** v CDP
   ↓
Track:
- Page views
- Time on page
- Product views
- Search queries
- Cart events
- Custom events
   ↓
**Anonymous profile s rich behavior** but no email yet
```

#### B) Email capture (form)

```
Anonymous visitor (cookie set)
   ↓
Sees signup form / popup (Web Experience)
   ↓
Submits email
   ↓
SALESmanago:
- Validates email
- Checks existing profile
- **MERGES** anonymous + identified profiles
- Single profile s all browse history
- Records consent
   ↓
Status: Active (or Pending if double opt-in)
   ↓
Welcome workflow activates
```

#### C) E-commerce account creation

```
Customer creates account na Shopify (etc.)
   ↓
Integration webhook → SALESmanago
   ↓
SALESmanago:
- Identity resolution (cookie match)
- Profile created/merged
- Marketing consent flag respected
   ↓
[Identified profile s e-commerce link]
```

#### D) Order placement

```
Customer purchases on Shopify
   ↓
Integration webhook → SALESmanago
   ↓
SALESmanago:
- Identity resolution
- Order recorded
- LTV updated
- Lifecycle stage transition
- Engagement Score updated
   ↓
Post-purchase workflow triggers
```

#### E) Manual import / API

```
External system POST to API
   ↓
SALESmanago creates / updates
   ↓
Identity resolution
   ↓
GDPR consent verified
   ↓
Add to segments
   ↓
Workflows trigger
```

### 9.2 Profile lifecycle stages

```
States:
├─ Anonymous visitor (cookie only)
├─ Identified Lead (email captured, no purchase)
├─ Active Customer (made purchase)
├─ VIP Customer (high LTV)
├─ Engaged Customer (regular interactions)
├─ At-risk Customer (declining engagement)
├─ Dormant Customer (no recent activity)
├─ Lost Customer (long inactive)
└─ Unsubscribed
```

### 9.3 Continuous profile updates

```
Every interaction = profile update:
- Page view → behavior data
- Email open → engagement
- Click → engagement + interest
- Order → transactional + LTV
- Form submission → declarative
- Preference Center update → zero-party
   ↓
Real-time CDP updates:
- Profile attributes refreshed
- Engagement Score recalculated
- Predictive scores updated
- Segment membership re-evaluated
- Workflow triggers fire
```

### 9.4 Identity resolution

```
Multiple touchpoints per customer:
- Web cookie
- Email address
- Phone number
- Customer ID (e-commerce)
- Loyalty ID
   ↓
SALESmanago identity resolution:
- Email-based matching
- Cookie + email match (when form submitted)
- Customer ID match (e-commerce sync)
- Cross-device tracking (email-based)
- Merge profiles where appropriate
   ↓
Single Customer Profile
```

### 9.5 Predictive scores

Per profile, SALESmanago calculates:

- **Engagement Score**
- **Customer Lifetime Value (CLV)**
- **Churn probability**
- **Next Purchase Date (NPD)**
- **Product affinity**

Updated continuously based on signals.

### 9.6 Preference Center

```
Email footer: "Manage preferences" link
   ↓
SALESmanago Preference Center
   ↓
Customer sees:
- Topic preferences
- Frequency preferences
- Channel preferences (email, SMS, push)
- Personal info edit
- Wishlist management
- Order history
- Master unsubscribe
- GDPR rights (export, delete)
   ↓
Updates flow back to CDP
   ↓
**Zero-party data** captured
```

### 9.7 Unsubscribe

```
Customer clicks unsubscribe
   ↓
SALESmanago-hosted page
   ↓
Options:
- Specific channel (email)
- All marketing
- Reason survey
   ↓
Status: Unsubscribed
   ↓
GDPR audit
   ↓
Profile retained s suppression
```

### 9.8 GDPR delete

```
Customer requests deletion
   ↓
SALESmanago:
- Removes personal data
- Anonymizes events
- Auto-suppression
- Audit log
- Confirmation email
```

---

## 10. Visitor → Lead → Customer journey flow

### 10.1 Stage 1: Anonymous Visitor

```
First visit to website
   ↓
Monitoring code drops cookie
   ↓
SALESmanago tracks:
- Pages visited
- Time on site
- Products viewed
- Search queries
- Click events
   ↓
Anonymous profile in CDP
   ↓
Web Experience may trigger:
- Welcome pop-up (after X seconds)
- Exit-intent pop-up
- Newsletter signup form
```

### 10.2 Stage 2: Anonymous → Lead

```
Visitor fills form OR signs up for newsletter
   ↓
SALESmanago:
- Captures email + name + other fields
- Records GDPR consent
- **Merges anonymous + identified profile**
- All previous behavior attributed
- Identity resolution
   ↓
Status: Lead (identified, not yet customer)
   ↓
Welcome workflow activates:
- Welcome email 1: Thank you + brand intro
- Wait 3 days
- Welcome email 2: First-time discount
- Wait 5 days
- Welcome email 3: Best sellers
   ↓
Lead nurturing continues
```

### 10.3 Stage 3: Lead → Customer

```
Lead makes first purchase
   ↓
Shopify webhook → SALESmanago
   ↓
Order recorded:
- Items, total, date
- Customer profile updated
- LTV initialized
- Lifecycle stage: New Customer
   ↓
Post-purchase workflow activates:
- Order confirmation (transactional)
- Wait 1 day
- Welcome customer email
- Wait 7 days
- Review request
- Wait 30 days
- Cross-sell email s Recommendation Frame
```

### 10.4 Stage 4: Customer → Active Customer

```
Customer makes 2nd, 3rd purchase
   ↓
SALESmanago:
- LTV updates
- Frequency increases
- Engagement Score climbs
- Lifecycle stage: Active Customer
   ↓
Regular newsletter audience
- Dynamic 1-to-1 recommendations
- Personalized content
- Targeted campaigns
```

### 10.5 Stage 5: Active → VIP

```
Customer crosses VIP threshold (e.g., LTV > €5 000)
   ↓
SALESmanago:
- Lifecycle stage: VIP
- VIP audience membership
   ↓
VIP welcome workflow:
- Exclusive welcome email
- Loyalty program invitation
- Premium product previews
- Dedicated communication
   ↓
VIP retention strategies activated
```

### 10.6 Stage 6: Engaged → At-risk

```
Customer activity declines:
- No recent purchases
- Email open rate dropping
- No site visits
- Engagement Score declining
   ↓
SALESmanago detects:
- Lifecycle stage: At-risk
- Re-engagement workflow triggers
   ↓
Re-engagement sequence:
- Email 1: "We miss you" + discount
- Email 2: Best sellers + recommendations
- Email 3: Final offer + survey
- SMS escalation (if opted in)
   ↓
If responds → back to Active
If not → moves to Dormant
```

### 10.7 Stage 7: At-risk → Dormant → Lost

```
No engagement for 6+ months
   ↓
Lifecycle stage: Dormant → Lost
   ↓
Suppression / unsubscribe to protect deliverability
   ↓
Win-back campaign (rare, targeted)
   ↓
If no response → archive
```

---

## 11. CDP data ingestion flow

### 11.1 Data sources

```
Multiple sources feed CDP:

1. Website (monitoring code)
   - JavaScript snippet
   - Real-time events
   - Behavioral data

2. E-commerce platform
   - Customer create/update
   - Order events
   - Cart events
   - Product views
   - Webhooks real-time

3. Mobile app (if integrated)
   - App events
   - Push tokens
   - In-app behavior

4. CRM (if integrated)
   - Contact sync
   - Sales activities
   - Custom fields

5. Email/SMS engagement
   - Opens, clicks
   - Captured natively

6. Forms / Preference Center
   - Zero-party data
   - Explicit preferences

7. API / Custom events
   - External system data
   - Custom event types

8. Bulk import
   - CSV uploads
   - SFTP transfers
```

### 11.2 Real-time ingestion flow

```
Event occurs (e.g., page view)
   ↓
Monitoring code captures + sends to SALESmanago
   ↓
SALESmanago real-time processing:
- Validates event
- Identifies contact (cookie / email)
- Creates / updates profile
- Updates attributes
- Recalculates segments
- Updates Engagement Score
- Updates predictive scores
- Triggers workflows (if match)
   ↓
Profile reflects new event
```

### 11.3 Identity resolution flow

```
Multiple identifiers per customer:
- Cookie ID
- Email
- Phone
- Customer ID
- Loyalty ID
   ↓
Resolution logic:
- Email = primary identifier
- Cookie → email link when form submitted
- Customer ID → email match
- Cross-device via email
   ↓
Single Customer Profile maintained
```

### 11.4 Data enrichment

```
SALESmanago enriches profiles:
- Geographic (from IP)
- Device info
- Browser info
- Engagement Score
- Predictive scores
- Lifecycle stage
- Segments
   ↓
Real-time updates
```

---

## 12. Real-time segmentation flow

### 12.1 Segment creation

```
Marketing user: CDP → Audiences → New segment
   ↓
Configure conditions (drag-drop):
- Profile attributes
- Behavioral conditions
- Transactional conditions
- Engagement conditions
- Predictive scores
- Date conditions
   ↓
Combine s AND/OR/NOT
   ↓
Preview real-time size
   ↓
Save (dynamic segment)
```

### 12.2 Real-time evaluation

```
Every CDP update event:
- Profile changes detected
- All dynamic segments re-evaluated
- Membership updated:
  - Added to segments matching new state
  - Removed from segments no longer matching
   ↓
Workflow triggers fire if segment-entry trigger configured
```

### 12.3 Segment use

#### In campaigns

- Audience selection
- Exclusion segments
- A/B test audiences

#### In workflows

- Entry trigger
- Conditions within workflow
- Exit conditions

#### In Web Experience

- Audience targeting
- Personalized content
- Pop-up audiences

#### In Ad audiences

- Sync to Facebook Custom Audiences
- Sync to Google Ads
- Lookalike sources

### 12.4 Behavioral segmentation examples

```
Examples of real-time segments:

"Browsed but didn't buy Product X v 7 days"
- Viewed product X recently
- No purchase of X in 7 days
- Active status

"High Engagement Score declining"
- Was top 10% Engagement
- Score decreased 30%+ in 30 days
- No recent purchase

"VIP at risk"
- Customer LTV > €5 000
- No purchase in 60+ days
- Email open rate declined

"New customer welcome window"
- First purchase < 30 days
- Hasn't received welcome series
- Active status
```

---

## 13. Email lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│  1. USER drafts campaign                                        │
│     - AI Email Design Studio OR template                        │
│     - Recommendation Frames inserted                            │
│     - Personalization tokens                                    │
│     - Audience selection                                        │
│                            │                                    │
│                            ▼                                    │
│  2. PRE-SEND CHECKS                                             │
│     - Sender verified                                           │
│     - Domain DKIM/SPF/DMARC                                     │
│     - Audience valid                                            │
│     - Plan limits                                               │
│                            │                                    │
│                            ▼                                    │
│  3. SEND TIME                                                   │
│     - Send now                                                  │
│     - Scheduled                                                 │
│     - Time-zone delivery                                        │
│     - AI send time optimization (advanced tiers)                │
│                            │                                    │
│                            ▼                                    │
│  4. PER-RECIPIENT GENERATION                                    │
│     - Personalization resolved                                  │
│     - Recommendation Frames render per profile                  │
│     - Product Collections per profile                           │
│     - Dynamic content blocks                                    │
│     - Tracking pixels embedded                                  │
│                            │                                    │
│                            ▼                                    │
│  5. SMTP SEND                                                   │
│     - DKIM signed                                               │
│     - SPF compliant                                             │
│     - DMARC aligned                                             │
│     - List-Unsubscribe RFC 8058                                 │
│                            │                                    │
│                            ▼                                    │
│  6. ISP RECEIVES                                                │
│     - Auth checks                                               │
│     - Reputation check                                          │
│     - Content filters                                           │
│                            │                                    │
│                            ▼                                    │
│  7. ROUTING (Inbox / Promotions / Spam)                         │
│                            │                                    │
│                            ▼                                    │
│  8. RECIPIENT INTERACTION                                       │
│     - Open → tracked                                            │
│     - Click → tracked                                           │
│     - Site tracker continues on landing                         │
│                            │                                    │
│                            ▼                                    │
│  9. PROFILE UPDATE (REAL-TIME)                                  │
│     - CDP profile updated                                       │
│     - Engagement Score recalculated                             │
│     - Segments re-evaluated                                     │
│     - Workflow triggers fire                                    │
│                            │                                    │
│                            ▼                                    │
│ 10. REPORTING                                                   │
│     - Email Marketing Dashboard                                 │
│     - Revenue attribution (e-commerce)                          │
│     - Real-time stats                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 14. Marketing Automation execution model

### 14.1 Workflow activation

```
Marketing user builds workflow
   ↓
Test mode
   ↓
Activate
   ↓
SALESmanago engine evaluates triggers continuously
```

### 14.2 Per-contact execution

```
Contact enters at trigger
   ↓
Each node processed sequentially:
- Send email → SMTP queue
- Send SMS → SMS gateway
- Send web push → notification system
- Send mobile push → app notification
- Show on-site banner → Web Experience activation
- Wait → schedule continuation
- Condition → evaluate
- Update profile → modify CDP
- Goal → check achievement
- Webhook → external call
   ↓
Continue until end / goal / removal
```

### 14.3 Re-entry rules

- Per workflow setting
- Run once vs. multiple
- Minimum gap between re-entries

### 14.4 Workflow analytics

- Active contacts in workflow
- Completed
- Goal achieved
- Per-step performance
- Drop-off analysis
- Revenue attribution

---

## 15. AI personalization flow

### 15.1 AI personalization layer

```
Per recipient email send:
   ↓
SALESmanago AI engine activates:
- Retrieve profile (CDP)
- Apply ML models:
  - Recommendation algorithms
  - Predictive scores
  - Behavioral patterns
- Generate personalized content:
  - Product recommendations (Recommendation Frames)
  - Product Collections (Deep Behavioral)
  - Personalized subject lines (if AI subject enabled)
  - Dynamic content blocks
   ↓
Per-recipient unique email generated
```

### 15.2 ChatGPT integration

```
Marketing user opens AI assistant (within platform)
   ↓
Prompt: "Generate subject line for promotional email about winter sale"
   ↓
ChatGPT generates options (5-10 variants)
   ↓
User reviews + selects
   ↓
Used in campaign
```

### 15.3 AI Email Design Studio

```
Marketing user: New email → AI Design
   ↓
Provide:
- Topic / goal
- Brand kit
- Target audience
- Style preferences
   ↓
AI generates email design:
- Layout
- Imagery suggestions
- Copy
- CTAs
- Recommendation Frame placement
   ↓
User reviews + customizes
   ↓
Send or save as template
```

### 15.4 Predictive scoring continuous

```
Every interaction updates predictive scores:
- CLV recalculation
- Churn probability update
- Next Purchase Date prediction
- Product affinity refresh
   ↓
Used in:
- Segmentation
- Workflow triggers
- Personalization decisions
- Channel routing
```

---

## 16. Recommendation Frames flow

### 16.1 Frame configuration

```
Marketing user: Recommendation Frames → New frame
   ↓
Configure:
- Frame name
- Algorithm:
  - Collaborative filtering
  - Content-based
  - Personalized ML
  - Trending
  - Cross-sell
  - Search-based
- Item count (e.g., 4, 6, 8 products)
- Filtering rules (categories, price range)
- Fallback rules (if no recommendations)
   ↓
Save frame
   ↓
Available for email + on-site
```

### 16.2 Email send with frame

```
Email contains Recommendation Frame block
   ↓
Per recipient at send time:
- Frame algorithm executes
- Retrieves products per profile
- Applies filters
- Renders product blocks
   ↓
Per-recipient unique product selection
```

### 16.3 On-site rendering

```
Visitor browses website
   ↓
SALESmanago Web Experience widget shows Recommendation Frame
   ↓
Real-time algorithm execution per visitor
   ↓
Dynamic product display
```

### 16.4 Performance tracking

- Click-through per frame
- Revenue attributed per frame
- A/B testing different algorithms
- Per-frame analytics

---

## 17. Web Experience execution

### 17.1 Pop-up activation flow

```
Visitor lands on website
   ↓
Monitoring code identifies visitor:
- Anonymous or returning?
- Segment membership?
- Past behavior?
   ↓
Web Experience engine evaluates pop-up rules:
- Trigger conditions (time, scroll, exit, etc.)
- Audience match (segment)
- Frequency caps
- URL targeting
   ↓
If match → pop-up displays
   ↓
Visitor interacts:
- Submits form → lead capture
- Closes → frequency cap incremented
- Ignores → no action
```

### 17.2 Banner / on-site content

```
Visitor on website
   ↓
SALESmanago serves personalized content per segment:
- VIP visitor → exclusive banner
- New visitor → welcome message
- Returning customer → personalized recommendations
- Cart abandonment context → reminder banner
   ↓
Real-time rendering
```

### 17.3 Pop-up types and use cases

#### Welcome pop-up

- New visitor (no cookie history)
- After 5-10 seconds on site
- Newsletter signup + 10% discount

#### Exit-intent pop-up

- Mouse leaves viewport
- "Wait! Get 15% off"
- Lead capture

#### Cart abandonment pop-up

- Cart abandoned > X minutes
- "Forget something? Complete purchase + 5% off"

#### Scroll-triggered

- 70% scroll on product page
- Related products + discount

#### Time-based

- 90 seconds on page
- Newsletter signup

### 17.4 Frequency caps

```
Per visitor:
- Max pop-ups per session
- Max pop-ups per day
- Per-pop-up frequency
- Cool-down periods
   ↓
Prevent annoying visitors
   ↓
Better UX = better conversion
```

---

## 18. Zero-party data collection flow

### 18.1 Preference Center setup

```
Admin / Designer: Customer Preference Center
   ↓
Configure:
- Topic preferences (categories of interest)
- Frequency preferences (daily, weekly, monthly)
- Channel preferences (email, SMS, push)
- Wishlist
- Custom fields
- Brand design
   ↓
Publish
   ↓
Link in email footers + website
```

### 18.2 Customer experience

```
Customer clicks "Manage preferences" link
   ↓
Preference Center loads
   ↓
Customer sees current preferences
   ↓
Updates:
- Toggle topics
- Adjust frequency
- Update channels
- Add to wishlist
   ↓
Submit
   ↓
SALESmanago updates profile
   ↓
**Zero-party data captured**
   ↓
Segments re-evaluated
   ↓
Future communications respect preferences
```

### 18.3 Surveys + quizzes

```
Marketing user creates survey:
- Multi-question form
- Targeted audience
- Embed in email or website
   ↓
Customers respond
   ↓
Answers populate CDP profile:
- Custom fields
- Preferences
- Intent signals
   ↓
**Zero-party data captured**
   ↓
Used for personalization
```

### 18.4 Progressive profiling

```
Forms designed to collect data gradually:
- Form 1: Email + name only (low friction)
- Form 2 (later): + interests + preferences
- Form 3 (later): + birthday + product preferences
   ↓
Gradual profile enrichment
   ↓
**Zero-party data builds over time**
```

### 18.5 Why zero-party matters

- Explicit consent strongest
- GDPR-friendly
- High predictive value (intent)
- Customer-controlled

---

## 19. Omnichannel orchestration flow

### 19.1 Multi-channel workflow

```
Workflow design includes multiple channels:

Trigger: Cart abandoned
   ↓
Wait 1h
   ↓
**Email** Step 1 (detail + recommendations)
   ↓
Wait 24h
   ↓
Condition: Email engaged?
   YES → Wait + see if purchase
   NO → **Web Push** silent reminder
   ↓
Wait 24h
   ↓
Condition: Purchased?
   YES → Goal achieved
   NO → **Email** Step 2 (10% discount)
   ↓
Wait 48h
   ↓
Condition: Purchased?
   YES → Goal
   NO → **SMS** (if opted in)
   ↓
End
```

### 19.2 Cross-channel coordination

- **Same profile** across channels
- **Frequency caps** cross-channel
- **Channel preferences** respected (from Preference Center)
- **Engagement-based routing** (per recipient)
- **Time-zone aware**

### 19.3 Channel preferences logic

```
Customer profile has preferences:
- Email: opted in
- SMS: opted in
- Web push: opted in
- Mobile push: not opted in
   ↓
Workflow respects:
- Skip channels customer hasn't opted in
- Prioritize preferred channels
- Limit frequency per channel
```

---

## 20. API & Integration flow

### 20.1 API access

```
Master Admin: API → Generate key
   ↓
Configure:
- Scope (read, write per resource)
- Rate limits per tier
- Active period
   ↓
**Key generated** – secure storage
   ↓
[API key active]
```

### 20.2 API request flow

```
Client application:
   POST https://api.salesmanago.com/[endpoint]
   Headers:
     Authorization: Bearer {api_key}
     Content-Type: application/json
   Body: { data }
   ↓
SALESmanago:
- Validates auth
- Rate limit check
- Validates payload
   ↓
Action performed (CDP update, event, segment, etc.)
   ↓
Response 200
```

### 20.3 Webhooks

```
SALESmanago configures webhooks:
- Target URL
- Events subscribed
- Signature verification
   ↓
On events (subscriber, campaign, order, etc.):
- POST to target URL
- External app processes
```

### 20.4 E-commerce integration

```
Shopify (etc.) → SALESmanago integration setup:
- OAuth authorization
- Configure sync:
  - Customer create/update
  - Order events
  - Cart events
  - Product feed
- Tracking script install
- Webhooks active
   ↓
Initial sync (hours pro large stores):
- Customers → CDP
- Orders → events + LTV calc
- Products → catalog
   ↓
Continuous webhook sync
```

### 20.5 CRM integration

```
Salesforce (etc.) → SALESmanago:
- API connection
- Bi-directional sync
- Contact + lead sync
- Custom field mapping
- Real-time updates
```

### 20.6 Ad platform integration

```
Meta Business / Google Ads → SALESmanago:
- OAuth connection
- Audience sync setup (CDP segments → ad audiences)
- Lookalike audience generation
- Suppression audiences
- Real-time sync
```

---

## 21. Partner-led implementation flow

### 21.1 Partner network model

```
SALESmanago Partner Program:
- 1 000+ reselling partners globally
- Per-region presence
- Various specializations:
  - Implementation
  - Optimization
  - Training
  - Industry verticals
```

### 21.2 Client-partner-SALESmanago triangle

```
                   SALESmanago
                  /          \
                 /            \
         Sale agreement    Platform support
              /                  \
             ↓                    ↓
       Partner ────────────── Client
              \                /
               \              /
            Service delivery
            (implementation,
             optimization, training)
```

### 21.3 Partner-led onboarding

```
Partner discovers / nurtures client lead
   ↓
Joint discovery s SALESmanago sales
   ↓
Client signs s SALESmanago
   ↓
Partner becomes:
- Implementation lead
- Ongoing optimization
- Local language support
- Day-to-day relationship
   ↓
SALESmanago CSM:
- Strategic oversight
- Platform technical support
- Joint QBRs
```

### 21.4 Partner critique (positive)

Per Capterra review:
_"A big advantage was the excellent support from the partner program account manager, who guided me step by step and clearly explained how to use the tool."_

### 21.5 Partner geographic strengths

- **Poland** (HQ) - largest partner concentration
- **DACH** - strong network
- **UK** + Ireland - growing
- **Iberia** (Spain, Portugal)
- **France** + Benelux
- **Italy**
- **CEE** (Czech, Slovak, Hungary)
- **Latin America** - growing
- **Middle East** + Asia Pacific

---

## 22. GDPR & Compliance flow

### 22.1 EU hosting

Per oficiální:
_"EU-based and GDPR-compliant – As a European provider, we ensure all data remains within the EU, offering industry-leading compliance and security."_

⚠️ Note: Crunchbase indicates U.S. server location – pravděpodobně **multi-region** s EU primary.

### 22.2 GDPR features

- **GDPR consent fields** v forms
- **Per-channel consent** tracking
- **Double opt-in** support
- **Audit trail** per consent
- **Right to be Forgotten**:
  - UI: profile delete
  - API: DELETE endpoint
  - Self-service via Preference Center
- **Data export** per subscriber (DSAR)
- **DPA available**

### 22.3 Right to Be Forgotten

```
Subscriber requests deletion
   ↓
Method A: Admin → Profile → Delete
Method B: API DELETE
Method C: Customer Preference Center self-service
   ↓
SALESmanago:
- Removes personal data
- Anonymizes events
- Auto-suppression permanent
- Audit log entry
- Confirmation email
```

### 22.4 DSAR (Data Subject Access Request)

```
Subscriber requests their data
   ↓
Admin: Generate GDPR export
OR API: GET /contacts/{id}/data
   ↓
SALESmanago produces:
- Profile data
- All events
- Communication history
- Consent records
- Engagement Score history
- Predictive scores
   ↓
Provide within 30 days
```

### 22.5 Compliance certifications

- **GDPR compliant**
- **ISO 27001** (typical for enterprise CDPs)
- Various other certifications per vendor

### 22.6 Security features

- **2FA / MFA**
- **API key management**
- **Encryption** at rest + in transit
- **Role-based access**
- **Audit logs**
- **EU data residency** option

---

## 23. Datová mapa: co vidí kdo

| Data                       | Master Admin | Mkt Mgr | Mkt User | Analyst  | Designer |  Viewer  |   Subscriber   |    API    |
| -------------------------- | :----------: | :-----: | :------: | :------: | :------: | :------: | :------------: | :-------: |
| Account settings           |      ✅      |   ✅    |    ❌    |    ❌    |    ❌    |    ❌    |       ❌       | per scope |
| Billing                    |      ✅      |   ❌    |    ❌    |    ❌    |    ❌    |    ❌    |       ❌       | per scope |
| User management            |      ✅      |   ✅    |    ❌    |    ❌    |    ❌    |    ❌    |       ❌       | per scope |
| Integration management     |      ✅      |   ✅    |    ❌    |    ❌    |    ❌    |    ❌    |       ❌       | per scope |
| Domain settings            |      ✅      |   ✅    |    ❌    |    ❌    |    ❌    |    ❌    |       ❌       | per scope |
| All CDP profiles           |      ✅      |   ✅    |    ✅    |    ✅    | limited  |   view   |    jen sebe    |    ✅     |
| Edit profiles              |      ✅      |   ✅    |    ✅    |    ✅    |    ❌    |    ❌    |       ❌       |    ✅     |
| Build segments             |      ✅      |   ✅    |    ✅    |    ✅    |    ❌    |   view   |       ❌       |    ✅     |
| Audiences                  |      ✅      |   ✅    |    ✅    |    ✅    |   view   |   view   |       –        |    ✅     |
| Tags                       |      ✅      |   ✅    |    ✅    |    ✅    |   view   |   view   |       –        |    ✅     |
| Predictive scores          |      ✅      |   ✅    |    ✅    |    ✅    |   view   |   view   |       ❌       |    ✅     |
| Engagement Score           |      ✅      |   ✅    |    ✅    |    ✅    |   view   |   view   |       ❌       |    ✅     |
| Email campaigns            |      ✅      |   ✅    |    ✅    |   view   |    ✅    |   view   | jen co dostal  |    ✅     |
| Send campaigns             |      ✅      |   ✅    |    ✅    |    ❌    |    ❌    |    ❌    |       ❌       |    ✅     |
| AI Email Design            |      ✅      |   ✅    |    ✅    |    ❌    |    ✅    |   view   |       –        | per scope |
| Workflows                  |      ✅      |   ✅    |    ✅    |   view   |   view   |   view   |       ❌       |    ✅     |
| Activate workflows         |      ✅      |   ✅    |    ✅    |    ❌    |    ❌    |    ❌    |       ❌       |    ✅     |
| Web Experience             |      ✅      |   ✅    |    ✅    |   view   |    ✅    |   view   | (sees on site) | per scope |
| Pop-ups / Banners          |      ✅      |   ✅    |    ✅    |    ❌    |    ✅    |   view   |       –        | per scope |
| Recommendation Frames      |      ✅      |   ✅    |    ✅    |   view   | per role |   view   |       –        | per scope |
| Product Collections        |      ✅      |   ✅    |    ✅    |    ✅    |   view   |   view   |       –        | per scope |
| ChatGPT integration        |      ✅      |   ✅    |    ✅    | per role | per role |   view   |       –        | per scope |
| Customer Preference Center |      ✅      |   ✅    |    ✅    |   view   |    ✅    |   view   |    jen své     | per scope |
| Reports + dashboards       |      ✅      |   ✅    |    ✅    |    ✅    |   view   |    ✅    |       ❌       |    ✅     |
| Custom dashboards          |      ✅      |   ✅    | per role |    ✅    |    ❌    |   view   |       ❌       | per scope |
| API keys                   |      ✅      |   ✅    |    ❌    |    ❌    |    ❌    |    ❌    |       ❌       |     –     |
| Audit logs                 |      ✅      |   ✅    |    ❌    | per role |    ❌    | per role |       ❌       | per scope |
| GDPR delete                |      ✅      |   ✅    | per role | per role |    ❌    |    ❌    |    request     | per scope |

---

## 24. Známé úzkoprofilové místa

### 24.1 Accessibility

- **No self-serve sign-up**
- **No public pricing** transparent (od €199 entry mentioned, ale custom)
- **Sales-driven model**
- **Long sales cycle**
- **No free plan**
- **Custom contracts** required
- **Mid-market focus** = less SMB-friendly

### 24.2 Post-acquisition (SilverTree Equity)

Per real customer review:
_"Over the past three years, following the acquisition, SALESmanago has undergone significant shifts in strategy, personnel, board composition, and management—changes that at times made collaboration more difficult."_

⚠️ **Acquisition caused growing pains:**

- Strategy shifts
- Personnel changes
- Some collaboration challenges
- Now optimistic per same customer ("first releases from this push have been really encouraging")

### 24.3 Complexity / steep learning curve

Per Capterra:
_"Not all features are intuitive at first, especially when it comes to SMS campaigns."_

- Requires training + workshops
- Partner involvement often necessary
- Non-trivial to master independently

### 24.4 A/B testing limitations

Per review:
_"more efficient A/B testing for email subjects (currently, multiple emails have to be created for testing)"_

⚠️ **A/B testing** less efficient than competitors – requires creating multiple emails vs. inline variant management.

### 24.5 Data extraction gaps

Per review:
_"expanded options for data extraction (e.g., you can extract data for users who opened an email but not for those who clicked)"_

⚠️ **Granular data extraction** sometimes limited.

### 24.6 Mass management

Per review:
_"simpler, faster mass management of tags and user details"_

⚠️ **Bulk operations** sometimes slow / unwieldy.

### 24.7 Integration health checks missing

Per review:
_"there were some gaps in the integration when I started using it... it would be helpful for the clients if SalesManago conducts a health check at the end of each integration"_

⚠️ **Integration health checks** sometimes missed, leading to data gaps.

### 24.8 Non-typical use cases

Per review:
_"Since we're not a typical e-commerce company, we needed a more customized approach"_

⚠️ Less polished pro **non-e-commerce** use cases (B2B services, content businesses).

### 24.9 Localization limits

- **Polish + English** primary
- **Czech / Slovak UI** limited
- **Other CEE languages** varying support
- Documentation primarily English / Polish

### 24.10 Less DTC-focused vs. Klaviyo

- **Less polished Shopify integration**
- **Fewer pre-built DTC templates**
- **Less e-commerce-specific** depth (Klaviyo's focus deeper)

### 24.11 Less enterprise vs. SAP Emarsys

- **Less Gartner Magic Quadrant** positioning
- **Less SAP ecosystem** integration
- **Smaller scale** (3 000+ vs. SAP's enterprise scale)

### 24.12 SMS less intuitive

Per review:
_"Not all features are intuitive at first, especially when it comes to SMS campaigns."_

⚠️ SMS workflows complex.

### 24.13 No autonomous AI agents (yet)

- AI features strong (Recommendation Frames, ChatGPT, predictive ML)
- But **no autonomous AI agents** (vs. Klaviyo Customer Agent, HubSpot Breeze)
- AI roadmap evolving

### 24.14 Migration challenges

- **Workflows non-exportable**
- **Custom CDP attributes** SALESmanago-specific
- **Templates rebuild** required
- **Custom integrations** must be rebuilt

### 24.15 No webinars / courses / paid newsletters

- No built-in webinars (vs. GetResponse)
- No online courses
- No paid newsletter subscription
- No digital products sale

---

## 25. Doporučení pro design vlastních procesů

Pokud SALESmanago používáte v týmu, doporučujeme:

1. **Growth Plan investice** – ne preskakovat, je core differentiator
2. **Dedicated CSM partnership** – využívat strategicky
3. **Partner network** – pokud nemáte in-house experts, partner adds value
4. **Domain authentication day 1** – DKIM + SPF + DMARC
5. **Tracking script install** carefully – foundation of CDP
6. **Integration health check** explicit po implementaci
7. **CDP custom fields strategy** – plan upfront, document
8. **Tag taxonomy** – flat structure s prefixes
9. **Segments naming convention** – consistent
10. **Engagement Score config** – calibrate s historical data
11. **Customer Preference Center** – setup early, leverage zero-party
12. **Recommendation Frames** – test multiple algorithms
13. **Product Collections** explore – newer Deep Behavioral
14. **AI Email Design Studio** – pilot before broad use
15. **ChatGPT integration** – use selectively, brand voice consistency
16. **Multi-channel orchestration** – plan from start
17. **Frequency caps cross-channel** – prevent over-messaging
18. **A/B testing strategy** despite limitations – worth effort
19. **Reports + dashboards** – build custom for team needs
20. **Partner involvement** – clear scope of work
21. **Quarterly Business Reviews** – with CSM, leverage strategically
22. **Workflow templates** – build reusable patterns
23. **GDPR compliance** documentation – Preference Center as central
24. **Mass operations workarounds** – batch tools, API where possible
25. **Migration plan** – periodic export contacts + key configurations

---

_Dokument zpracován z oficiálních zdrojů salesmanago.com a praktických zdrojů (G2, Capterra, GetApp, SoftwareAdvice, Crunchbase, LinkedIn customer testimonials). Pro nejaktuálnější detaily je nutný engagement s SALESmanago sales / CSM teamem._
