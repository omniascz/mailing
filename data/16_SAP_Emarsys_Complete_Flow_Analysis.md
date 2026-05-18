# SAP Emarsys (SAP Engagement Cloud) – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v Emarsys prochází data, lidé a akce – od Account Ownera přes specializované uživatele, CSM, partner ecosystem, integrace, až po koncového customer profile.

> Tento dokument doplňuje `15_SAP_Emarsys_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** Emarsys umí, tento popisuje, **kdo s tím interaguje a jak data tečou**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
> - **Enterprise platform** – ne self-service, vyžaduje 4-6 měsíců implementace
> - **4 default roles** (Account Owner, Administrator, Operator, Restricted, BI Administrator) + custom roles s **page-level permissions**
> - **Account Owner role je nejvyšší** – nemodifikovatelná, **created by SAP/CSM**
> - **Default role nelze modifikovat** – jen duplikovat + customize
> - **Multi-account permissions** – centralizované user management napříč regionálními/brandovými accounts
> - **Single Sign-On (SSO)** s SAP Cloud Identity (CDC/IAS)
> - **Strict security:** IP allowlisting + 2-step auth (combined required)
> - **Tactics-driven workflow** – pre-built strategies místo blank-slate
> - **Smart Insight eRFM** definuje lifecycle stages (cannot redefine after setup)
> - **Multi-source data ingestion** – SAP + non-SAP + first-party tracking
> - **Service-driven model** – každý klient má dedicated CSM + implementation partner

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Sales & qualification flow](#2-sales-flow)
3. [Implementation flow (4-6 měsíců)](#3-implementation-flow)
4. [Default roles & permissions](#4-roles-permissions)
5. [Custom roles flow](#5-custom-roles-flow)
6. [Account Owner flow](#6-account-owner-flow)
7. [Administrator flow](#7-administrator-flow)
8. [Operator (Marketer) flow](#8-operator-flow)
9. [Restricted user flow (onboarding)](#9-restricted-flow)
10. [BI Administrator flow (Smart Insight)](#10-bi-admin-flow)
11. [Multi-account flow (multi-brand / multi-region)](#11-multi-account-flow)
12. [Dedicated CSM relationship flow](#12-csm-flow)
13. [Customer profile lifecycle](#13-customer-profile)
14. [Smart Insight eRFM flow](#14-smart-insight-flow)
15. [Tactics deployment flow](#15-tactics-flow)
16. [Multichannel workflow execution](#16-workflow-execution)
17. [API & SAP ekosystém integration flow](#17-integration-flow)
18. [GDPR & Compliance flow](#18-gdpr-flow)
19. [Datová mapa: co vidí kdo](#19-datová-mapa)
20. [Známé úzkoprofilové místa](#20-úzkoprofilové-místa)

---

## 1. Mapa aktérů

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│         SAP EMARSYS / ENGAGEMENT CLOUD ECOSYSTEM                   │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [SAP / Emarsys Internal Team]                                     │
│   ├─ Dedicated CSM (per klient!)                                   │
│   ├─ Strategic consultant / Strategic CSM (Premium tier)           │
│   ├─ Technical support 24/7 (Enterprise SLA)                       │
│   ├─ Implementation team (during onboarding)                       │
│   ├─ Deliverability team                                           │
│   ├─ Trust & Safety                                                │
│   ├─ Account / billing team (SAP commercial)                       │
│   ├─ Product specialists (Smart Insight, Predict, Mobile)          │
│   └─ Joule AI support                                              │
│           │ (continuous touchpoints + QBR)                         │
│           ▼                                                        │
│                                                                    │
│  [SAP Implementation Partners]                                     │
│   ├─ Publicare (DACH retail)                                       │
│   ├─ Spadoom (Switzerland, EU)                                     │
│   ├─ Sybit (DACH)                                                  │
│   ├─ deepblue networks                                             │
│   └─ regional SAP partners                                         │
│           │ (initial implementation + ongoing services)            │
│           ▼                                                        │
│                                                                    │
│   ┌──────────────────────────────────────────┐                     │
│   │   Emarsys / Engagement Cloud Account     │                     │
│   │                                          │                     │
│   │   4 default roles:                       │                     │
│   │   ├─ Account Owner (1, created by SAP)   │◄── full + security  │
│   │   ├─ Administrator                       │◄── operational lead │
│   │   ├─ Operator (Marketer)                 │◄── daily tasks      │
│   │   ├─ Restricted (onboarding)             │◄── minimal access   │
│   │   └─ BI Administrator (Smart Insight)    │◄── analytics only   │
│   │                                          │                     │
│   │   + Custom roles (page-level perms)      │                     │
│   │                                          │                     │
│   │   + Multi-account permissions             │                     │
│   │     (centralizované user mgmt napříč      │                     │
│   │     regional/brand accounts)              │                     │
│   │                                          │                     │
│   │   + Mention Me / external CSM read-only   │                     │
│   │     (view-only specialized roles)         │                     │
│   └──────────────┬───────────────────────────┘                     │
│                  │                                                 │
│                  ▼                                                 │
│   [SAP Ekosystém + non-SAP integrace]                              │
│       │                                                            │
│       ├─→ SAP Commerce Cloud (plug-and-play)                       │
│       ├─→ SAP Sales Cloud V2 / Service Cloud V2                    │
│       ├─→ SAP S/4HANA                                              │
│       ├─→ SAP Customer Data Platform (CDP)                         │
│       ├─→ SAP Customer Identity (CDC)                              │
│       ├─→ SAP Datasphere                                           │
│       ├─→ Shopify, Magento, BigCommerce, custom platforms          │
│       ├─→ Salesforce CRM (non-SAP)                                 │
│       ├─→ Ad platforms (Meta, Google, TikTok, Pinterest)           │
│       └─→ Direct Mail providers                                    │
│                  │                                                 │
│                  ▼                                                 │
│   [Customer Profiles / Single Customer View]                       │
│       - Anonymous Web Extend tracking                              │
│       - Identified subscribers across channels                     │
│       - Cross-device, cross-channel journeys                       │
│       - Smart Insight eRFM cohort assignment                       │
│       - Predict recommendations                                    │
│                  │                                                 │
│                  ▼                                                 │
│   [Activation across channels]                                     │
│       - Email (VCE editor)                                         │
│       - SMS (with RCS upgrade path)                                │
│       - Mobile push + In-app                                       │
│       - Web push                                                   │
│       - Web Channel (on-site personalization)                      │
│       - Digital Ads (audience sync)                                │
│       - Direct Mail                                                │
│       - Mobile wallet                                              │
│       - In-store / POS                                             │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér | Vstupní bod | Co dělá | Co vidí |
|---|---|---|---|
| **Account Owner** | Created by SAP/CSM during setup | Full + security + multi-account | Vše |
| **Administrator** | Pozvánka od Owner | Operational lead | Vše kromě Account Owner exclusives + Smart Insight |
| **Operator (Marketer)** | Pozvánka | Daily marketing tasks | Marketing tools |
| **Restricted** | Pozvánka (onboarding) | Minimal access for training | Limited |
| **BI Administrator** | Pozvánka | Smart Insight + dashboards | Analytics only |
| **Custom role users** | Pozvánka s custom permissions | Per definition | Per definition |
| **Multi-account user** | Cross-account permission | Multiple regional/brand accounts | Per assigned accounts |
| **Dedicated CSM** | Assigned at sign-up | Strategy, QBRs, optimization | Read access to account |
| **Implementation partner** | Engaged during setup | Initial setup + ongoing services | Per RBAC granted |
| **Customer / Profile** | Form, integration, anon tracking | Browses, buys, opens, engages | Své komunikace |
| **API Client** | API credentials | Per endpoint permissions | Per scope |
| **SAP integration** | Native integration | Auto-sync data | Per data model |
| **External CSM read-only** | Special permission | View-only specific functions | Limited view |

---

## 2. Sales & qualification flow

Emarsys NEPOUŽÍVÁ self-serve sign-up – jako ExpertSender.

### 2.1 Lead acquisition

Typicky:
- **Inbound** přes emarsys.com / sap.com
- **SAP existing customer outreach** (cross-sell)
- **Industry events / conferences** (NRF, K5, SAP Sapphire)
- **Partner-introduced** (Publicare, Spadoom, etc.)
- **Gartner research** influence
- **LinkedIn / enterprise outreach**

### 2.2 Qualification

```
Prospect contact → SAP / Emarsys sales team responds (24-48h)
   ↓
Discovery call (30-45 min):
- Current marketing stack?
- Subscriber count?
- Order volume?
- E-commerce platform?
- Existing SAP investment?
- Key business challenges?
- Decision-making process + timeline?
- Budget range?
- Geographic regions?
- Verticals (retail, travel, finance, etc.)?
   ↓
**Qualifying criteria typicky:**
- Mid-to-large B2C / e-commerce
- 100K+ contacts ideally
- Budget >$2K/měsíc + implementation
- Looking for enterprise solution (not Mailchimp alternative)
- Time horizon 6-12 months commitment
   ↓
If qualified → Demo scheduled
If not qualified → Recommendation to alternatives or smaller SAP Edition
```

### 2.3 Demo + sales proces

```
Demo 1 (60-90 min):
- Platform walkthrough
- Customer success stories (PUMA, Reiss, FC Bayern, etc.)
- Vertical-specific demo
- ROI calculator
- Q&A
   ↓
**Use case workshop** (90-120 min):
- Map current workflows
- Identify gap analysis
- Demo specific use cases (Tactics relevant for client)
- Discuss SAP ecosystem advantages
   ↓
**Technical deep dive** (with client IT/data team):
- Integration architecture
- Data flow design
- Migration approach
- Security review
- Compliance review
   ↓
**Stakeholder alignment**:
- Multiple demos to different stakeholders (CMO, CDO, CTO, CDO)
- Reference calls (existing customers)
- Site visits (real-life Emarsys deployments)
   ↓
**Proposal generated**:
- Edition selection (Emarsys Edition vs. Enterprise Edition)
- Channels + add-ons
- Pricing tier
- Implementation plan + partner selection
- SLA tier
- Multi-year commitment options
   ↓
**Contract negotiation**:
- Year 1 + multi-year discounts
- Implementation costs
- Add-on pricing
- Multi-account allowances
- Custom integration scope
- Termination clauses
   ↓
**Contract signed**
   ↓
[Project kickoff scheduled]
```

### 2.4 Pilot / POC option

Pro large deals SAP may offer:
- **30-60 day pilot** with limited features
- **POC** with sandbox environment
- **Use case validation** before full commitment
- **Benchmark metrics** measured during pilot

### 2.5 Partner selection

Implementation typicky **přes partner** (ne SAP přímo):
- **SAP recommends** based on geography + vertical
- **Customer may have preference**
- **RFP process** sometimes for partner selection
- **Implementation cost** negotiated with partner
- **Joint project** between SAP + partner + customer

---

## 3. Implementation flow (4-6 měsíců)

Strategický onboarding po podpisu kontraktu.

### 3.1 Phase 1: Project kickoff (Week 1-2)

```
Contract signed
   ↓
**Project team assigned:**
- Customer: Project sponsor, project manager, marketing lead, IT lead
- SAP: CSM, technical lead, product specialist
- Partner: Lead consultant, technical implementer, designer
   ↓
**Kickoff workshop** (2-3 days, on-site or remote):
- Introductions across teams
- Goals + KPIs alignment
- Project plan walkthrough
- Stakeholder map
- Communication cadence
- Risk identification
- Success criteria
   ↓
**Project plan** delivered:
- Phased rollout
- Owner per task
- Dependencies + milestones
- Go-live target
- Decision gates
```

### 3.2 Phase 2: Discovery (Week 2-4)

```
Detailed discovery workshops:
- Current marketing landscape audit
- Data audit (sources, quality, structure)
- Integration audit (SAP + non-SAP)
- Compliance requirements
- Brand guidelines
- Existing automation programs
- Customer lifecycle definition
- Loyalty program (if exists)
   ↓
Architecture design:
- Integration architecture (SAP ecosystem + e-commerce + others)
- Data flow diagram
- Identity resolution strategy
- Multi-account structure (if multi-brand)
- Channel orchestration plan
   ↓
**Smart Insight design**:
- eRFM scoring boundaries
- Lifecycle stage definitions (LOCKED after setup!)
- Cohort transition rules
   ↓
**Tactics plan**:
- Priority Tactics for go-live
- Custom Tactics needed
- Phase 2/3 Tactics
```

### 3.3 Phase 3: Technical setup (Week 4-12)

#### Account provisioning
```
SAP provisions Emarsys account
   ↓
Domain authentication:
- Sending domain setup (DKIM, SPF, DMARC)
- Branded tracking domain
- BIMI configuration
- DNS records propagation
   ↓
Initial Account Owner created (by SAP/CSM)
   ↓
Security configuration:
- IP allowlist setup
- 2-step authentication enforcement (if combined)
- Multiple email domain verification
- API credentials generation
```

#### Data integration
```
SAP ecosystem integration:
- SAP Commerce Cloud plug-and-play
- SAP Sales Cloud / Service Cloud connection
- SAP CDP / CDC integration
- SAP S/4HANA connection
- SAP Datasphere setup (analytics)
   ↓
Non-SAP integration (if applicable):
- Shopify/Magento/BigCommerce
- Custom platforms via API
- Loyalty/Reviews/Reviews platforms
- Print provider (direct mail)
- Ad platforms (audience sync)
   ↓
Web Extend installation:
- JavaScript snippet on website
- Custom event tracking
- Cookie consent integration (GDPR)
- E-commerce data layer setup
   ↓
Mobile SDK integration (if applicable):
- iOS + Android SDK
- Push token registration
- App event tracking
```

#### Initial data load
```
Historical data import:
- Customers from CRM/e-commerce
- Order history
- Product catalog
- Web behavior (if available)
- Loyalty data
   ↓
**Identity resolution** processing:
- Stitch anonymous + identified
- Cross-device matching
- Email + phone + ID matching
   ↓
**Single Customer Profiles** created
   ↓
Initial validation s CSM
```

### 3.4 Phase 4: Smart Insight + Predict setup (Week 8-12)

```
Smart Insight configuration s CSM:
- eRFM scoring boundaries set
- Lifecycle stages defined (LOCKED after this)
- Initial cohort calculation
- Validation against historical data
   ↓
Predict training:
- Historical orders ingested
- Browse history processed
- Customer-product affinity calculated
- Models trained per recommendation strategy
   ↓
Initial recommendations validated
   ↓
Predict deployed:
- Email blocks
- Web widgets
- Mobile push integration
```

### 3.5 Phase 5: Tactics implementation (Week 12-18)

```
Priority Tactics deployment:
- Welcome series (multi-step, multi-channel)
- Cart abandonment (3-touch sequence)
- Browse abandonment
- Post-purchase (review request, cross-sell, replenishment)
- Loyalty welcome
- Birthday Tactic
- VIP welcome
- At-risk re-engagement
- Win-back / lapsed customer
   ↓
Each Tactic:
1. Download from Tactics library
2. Customize templates (brand voice)
3. Adjust timing per business
4. Configure channels + variants
5. Test thoroughly
6. Internal review + approval
7. Activate
   ↓
[6-10 Tactics live for go-live]
```

### 3.6 Phase 6: Templates & creative (parallel Week 12-18)

```
Brand kit setup:
- Brand colors, fonts
- Logo variants
- Imagery library
   ↓
Email templates designed (VCE):
- Master template (responsive)
- Tactic-specific templates
- Newsletter template
- Promotional templates
- Transactional templates
   ↓
Mobile push templates
Web push templates
On-site banners + popups
   ↓
SMS templates (if applicable)
Direct mail creative (if applicable)
```

### 3.7 Phase 7: Training (Week 18-22)

```
**Multi-track training:**

Track 1: Marketer (Operator) training
- VCE editor mastery
- Tactics use
- Segment building
- Campaign execution
- Reporting basics

Track 2: Power user (Admin) training
- Automation Center deep dive
- Custom programs from scratch
- Predict + Smart Insight advanced use
- Cross-channel orchestration

Track 3: Analyst (BI Admin) training
- Strategic Dashboard mastery
- Smart Insight analytics
- Custom dashboards
- Reports + export

Track 4: Admin / IT training
- User management
- Security configuration
- API + integrations
- Audit logs review

Track 5: Account Owner training
- Strategic dashboard
- Multi-account if applicable
- Business reviews
- Strategic decision frameworks
   ↓
Documentation handoff:
- Customer-specific runbook
- SOPs per role
- Best practices
- Troubleshooting guide
```

### 3.8 Phase 8: Go-live (Week 22-26)

```
Pre-launch QA:
- All Tactics tested with QA profiles
- Cross-channel orchestration verified
- Frequency caps tested
- Edge cases reviewed
   ↓
**Soft launch:**
- Activate Tactics for limited audience (10-20%)
- Monitor closely
- Daily check-ins with CSM
- Quick issue resolution
   ↓
**Full launch:**
- 100% audience activated
- All channels live
- Continuous monitoring
   ↓
**Hypercare period** (4-6 weeks):
- Intensive CSM support
- Daily metrics review
- Optimization recommendations
- Rapid bug fixes
```

### 3.9 Phase 9: Optimization (Ongoing)

```
Transition to BAU + CSM partnership
   ↓
Monthly optimization reviews
   ↓
Quarterly Business Reviews (QBR):
- Performance vs. goals
- ROI tracking
- New Tactic adoption
- Roadmap input
- Strategic planning for next quarter
   ↓
Annual strategic review
   ↓
**Continuous platform innovation:**
- New features adoption
- AI capabilities expansion
- Channel additions
- Use case maturation
```

---

## 4. Default roles & permissions

Emarsys používá **4 default roles** + custom roles s **page-level permissions**.

### 4.1 Account Owner

Per oficiální docs:

- **Created by SAP/CSM** during account setup
- **Non-modifiable** default role
- **Highest tier** access
- Exclusive permissions:
  - **Account-level Security Settings** (IP allowlist, 2-step auth, security levels)
  - **Email domain configuration** (account-level)
  - **API credentials creation + endpoint permissions** (advanced)
  - **Multi-account permissions setup** (with SAP backend config)
  - **Ownership transfer** (s SAP support)
  - **Smart Insight account-level settings**

### 4.2 Administrator

- **Full access** ke všem SAP Emarsys features
- **Cannot access:**
  - Account Owner exclusive features (Security Settings, multi-account perms)
  - **Smart Insight** (unless explicitly granted)
- **Can do:**
  - User management (create, edit, delete users)
  - Custom role creation
  - Integration management
  - API endpoint permission management
  - Campaign management (full)
  - Automation programs (full)
  - Templates (full)
  - Reports (full)
  - Domain authentication

### 4.3 Operator (Marketer)

- **Daily marketing tasks role**
- Access to:
  - **Email campaigns** (create, edit, send)
  - **Segments** (create, edit)
  - **Automation programs** (create, edit, activate)
  - **Templates** (use existing, edit)
  - **Tactics** (download, customize, activate)
  - **Reports** (view, some custom)
- Cannot:
  - User management
  - Account-level settings
  - Integration setup
  - API management
  - Domain settings

### 4.4 Restricted

- **Onboarding role** s minimal access
- Used during initial training period
- Limited features access (specific pages)
- Typically:
  - View campaigns
  - Limited template work
  - No send permissions
  - No sensitive data access
- Migrated to fuller role after training completion

### 4.5 BI Administrator

- **Smart Insight focused** role
- Access:
  - Smart Insight (full)
  - Strategic Dashboard
  - Reports + Analytics
  - Segments (view, often edit)
- Cannot:
  - Send campaigns
  - Edit automation programs (often)
  - User management
- Ideal for:
  - Data analyst
  - Marketing analyst
  - Customer insights specialist

### 4.6 Permission matrix (default roles)

| Akce | Owner | Admin | Operator | Restricted | BI Admin |
|---|:---:|:---:|:---:|:---:|:---:|
| **Account & Security** |  |  |  |  |  |
| Account Security Settings | ✅ | ❌ | ❌ | ❌ | ❌ |
| Email domain config | ✅ | view | ❌ | ❌ | ❌ |
| IP allowlist | ✅ | ❌ | ❌ | ❌ | ❌ |
| 2-step auth enforcement | ✅ | ❌ | ❌ | ❌ | ❌ |
| Multi-account permissions | ✅ | ❌ | ❌ | ❌ | ❌ |
| **User Management** |  |  |  |  |  |
| Add/edit/delete users | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create custom roles | ✅ | ✅ | ❌ | ❌ | ❌ |
| **API & Integrations** |  |  |  |  |  |
| Create API credentials | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage API endpoints | ✅ | ✅ | ❌ | ❌ | ❌ |
| Setup integrations | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Customers (Contacts)** |  |  |  |  |  |
| View contacts | ✅ | ✅ | ✅ | limited | view |
| Edit contacts | ✅ | ✅ | ✅ | ❌ | ❌ |
| Import contacts | ✅ | ✅ | ✅ | ❌ | ❌ |
| Export contacts | ✅ | ✅ | limited | ❌ | ❌ |
| **Segments** |  |  |  |  |  |
| View segments | ✅ | ✅ | ✅ | view | ✅ |
| Create/edit segments | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Email Campaigns** |  |  |  |  |  |
| Create campaign | ✅ | ✅ | ✅ | ❌ | ❌ |
| Send campaign | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Automation Center** |  |  |  |  |  |
| View programs | ✅ | ✅ | ✅ | view | view |
| Create/edit programs | ✅ | ✅ | ✅ | ❌ | ❌ |
| Activate programs | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Tactics** |  |  |  |  |  |
| Browse Tactics | ✅ | ✅ | ✅ | view | view |
| Download + customize | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Templates** |  |  |  |  |  |
| Create/edit templates | ✅ | ✅ | ✅ | limited | ❌ |
| **Smart Insight** |  |  |  |  |  |
| View Smart Insight | ✅ | per perm | ❌ | ❌ | ✅ |
| Edit Smart Insight | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Predict** |  |  |  |  |  |
| Use Predict | ✅ | ✅ | ✅ | ❌ | view |
| **Strategic Dashboard** |  |  |  |  |  |
| View dashboard | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Mobile Engage** |  |  |  |  |  |
| Manage mobile push | ✅ | ✅ | ✅ | ❌ | ❌ |
| **SMS** |  |  |  |  |  |
| Send SMS | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Loyalty** |  |  |  |  |  |
| Manage loyalty | ✅ | ✅ | per perm | ❌ | view |
| **Reports** |  |  |  |  |  |
| View reports | ✅ | ✅ | ✅ | ❌ | ✅ |
| Custom dashboards | ✅ | ✅ | per perm | ❌ | ✅ |

### 4.7 Special pravidla

Per oficiální docs:

- **Default roles are NOT modifiable** – pouze view-only
- **Click edit icon to view** default role permissions
- **To customize, duplicate** default role + modify
- **Or create empty role** + activate permissions
- **Page-level permissions** – granular per UI page

### 4.8 Original creator privileges

Pokud original creator user is **unavailable** (left company, etc.):
- **Other users CAN change:** Link categories, standard segments, Campaigns, Automation Center programs, VCE campaigns
- **Other users CANNOT change:** Voucher pools, Mailboxes, Exports, Forms
- **Link categories cannot be deleted** by non-creator

---

## 5. Custom roles flow

### 5.1 Create custom role

```
Account Owner / Admin: Settings → Users → Roles → Add Role
   ↓
Two methods:
A) Duplicate existing default role + modify
B) Create empty role + activate permissions

Option A (duplicate):
- Select default role to copy
- Rename
- Modify permissions (page-by-page)

Option B (empty):
- Create new empty role
- Name + description
- Activate desired permissions
- Save
   ↓
**Page-level permissions** configuration:
For each platform page:
- Enable/disable access
- Read vs. Edit permissions where applicable
   ↓
Save role
```

### 5.2 Permission granularity

Each platform feature has **page-level permissions**. Examples:

#### Contacts module
- Contact List view
- Contact create
- Contact edit
- Contact import
- Contact export
- Contact delete

#### Email Campaigns
- Campaign list view
- Campaign creation
- Campaign edit
- Campaign send
- Campaign delete
- Campaign reporting

#### Automation Center
- Program list view
- Program creation
- Program edit
- Program activation
- Program testing

#### Smart Insight
- Smart Insight access
- eRFM view
- eRFM edit
- Reports
- Lifecycle stages view

#### Personalization
- VCE editor
- Saved blocks
- Personalization scripts

### 5.3 Custom role examples

#### "Email Campaign Manager"
- Email campaigns: full control
- Templates: edit
- Segments: view + edit
- Reports: view
- No automation programs
- No user management

#### "Analyst"
- Smart Insight: view + edit
- Strategic Dashboard: view
- Reports: full
- Segments: view only
- No campaign sending
- No content editing

#### "Designer"
- Templates: full
- VCE editor: full
- Brand kit: edit
- No campaign sending
- No customer data access
- No automation

#### "External agency (limited)"
- Campaigns: view + draft only
- Templates: view + edit
- Segments: view only
- No send permissions
- No customer data export
- No billing

### 5.4 Assigning custom role to user

```
Admin: Settings → Users → Add User
   ↓
Email + Personal details
   ↓
Role selection:
- Default role (Owner, Admin, Operator, Restricted, BI Admin)
- OR Custom role (from created list)
   ↓
For multi-account setup: assign access to specific accounts
   ↓
Send invitation
   ↓
User receives email + activates
```

### 5.5 SSO/SAML configuration

Per oficiální docs:
- **SAP Cloud Identity (SCI)** integration
- **OpenID Connect** + JWT
- **SAML 2.0** support
- Single Sign-On for enterprise customers
- IdP integration (Okta, OneLogin, Azure AD)
- **MFA enforcement** option
- **IP restriction + 2-step auth** combination (very strict)

---

## 6. Account Owner flow

### 6.1 Account Owner creation

```
Sales contract signed
   ↓
SAP provisions account
   ↓
**SAP creates Account Owner credentials** for designated customer admin
   ↓
Customer-side Account Owner activates
   ↓
First login s temporary password → set new
   ↓
2FA setup
   ↓
[Account Owner active]
```

### 6.2 Daily Account Owner workflow

```
Login → Strategic Dashboard
   ↓
High-level overview:
- Total customer engagement metrics
- Channel performance summary
- Tactic ROI
- Smart Insight cohort distribution
- Active programs count
   ↓
Strategic activities:
- Performance vs. goals review
- Quarterly Business Review preparation
- Roadmap discussions with CSM
- Multi-account oversight (if applicable)
- Budget + contract management
- Strategic decisions on new use cases
   ↓
Security review:
- User access audit
- API credentials review
- IP allowlist validation
- 2-step auth status
```

### 6.3 Kritické Account Owner exclusives

#### Security Settings
```
Account Settings → Security Settings
   ↓
Configure:
- Account security level
- Required password complexity
- Session timeouts
- IP allowlist
- 2-step authentication enforcement
   ↓
**Note:** 2-step auth and IP control work together
   - IP allowlist defines safe locations
   - Users from non-allowlisted IPs must use 2-step auth
   ↓
Save settings
```

#### Email domains
```
Account Owner adds email domains:
- Domain receives activation emails
- Account-related notifications routed here
- **Each account needs at least one domain**
   ↓
Add additional domains as needed
```

#### API credentials creation
```
Account Settings → API Credentials
   ↓
Choose credential type:
- **OpenID Connect** (modern, OAuth 2.0 + JWT)
- **OpenID Connect (SAP Cloud Identity)** – with SAP IAM
- **WSSE** (legacy, only pre-Feb 24, 2025 contracts)
   ↓
Generate credentials
   ↓
**Edit + enable permissions per API endpoint:**
- Granular per endpoint (e.g. /contacts, /segments)
- Save changes
   ↓
[API credentials active]
```

### 6.4 Multi-account permission setup

```
Account Owner: requests multi-account from SAP support
   ↓
**Backend configuration required** (not self-service)
   ↓
Once configured:
- User can have permissions across multiple accounts
- Same login, different account contexts
- Easy navigation between regional/brand accounts
   ↓
Permission setup:
- Per-account role assignment
- Cross-account roles possible
- Centralized billing
```

### 6.5 Ownership transfer

Pokud Account Owner pohřešovaný / odejde:
```
Contact SAP support
   ↓
Identity verification + legal proof
   ↓
SAP processes ownership transfer manually
   ↓
New Account Owner credentials issued
   ↓
Previous Owner deactivated (or downgraded)
```

⚠️ **NE self-service** – stejně jako MailerLite, ExpertSender.

---

## 7. Administrator flow

Administrator = top operational role.

### 7.1 Daily Administrator workflow

```
Login → Operational dashboard
   ↓
Checks:
- Yesterday's campaign metrics
- Active program health
- Frozen / error states
- Failed automations
- Bounce + complaint rates
- Integration sync status
- New user invitations pending
   ↓
Actions:
- User management (invite, edit, deactivate)
- Custom role management
- Integration troubleshooting
- API endpoint permission tweaks
- Domain settings review
- Approve operator actions if approval workflow
```

### 7.2 User management flow

```
Admin: Settings → Users → Add User
   ↓
Email + Personal details
   ↓
Role assignment:
- Default role
- OR Custom role
   ↓
For multi-account: specify account access
   ↓
Send invitation
   ↓
User accepts + sets password
   ↓
[Active user]
   ↓
Admin can later:
- Edit role
- Reset password
- Deactivate user
- Audit user activity (via logs)
```

### 7.3 Custom role creation

```
Settings → Users → Roles → Add Role
   ↓
Duplicate existing default OR create empty
   ↓
Configure page-by-page permissions:
- Iterate through each platform area
- Enable/disable access
- Sometimes Read vs. Edit distinction
   ↓
Save role
   ↓
[Role ready to assign]
```

### 7.4 Integration management

```
Admin: Settings → Integrations
   ↓
View active integrations
   ↓
Per integration:
- Status check
- Configuration edit
- Re-authorize if expired
- Logs review
- Disable/Remove if needed
   ↓
Add new integration:
- Choose from native list
- OAuth or API key
- Configure mapping
- Test sync
- Activate
```

### 7.5 API endpoint permission management

```
Admin: API credentials
   ↓
Select API credential
   ↓
**Edit endpoint permissions:**
- Per endpoint enable/disable
- Granular permissions (read vs. write)
- Save changes
   ↓
Changes apply immediately to API clients using these credentials
```

### 7.6 Domain authentication

Standard flow:
- Add sending domain
- DKIM + SPF + DMARC records
- Validate
- Activate

---

## 8. Operator (Marketer) flow

### 8.1 Daily Operator workflow

```
Login → Dashboard
   ↓
Activities:
- Build segments (incl. Smart Insight-driven)
- Schedule campaigns
- Review automation program performance
- Optimize Tactics
- A/B test setup
- Template updates
- New campaign creation
- Customer journey adjustments
```

### 8.2 Create campaign (email example)

```
Email → Campaigns → Create new campaign
   ↓
Type:
- Regular
- A/B test
- Triggered
- RSS
   ↓
Setup:
- Subject + preview text (AI-assisted if available)
- Sender name + email (verified)
- Reply-to
- Internal name + tags
   ↓
Recipients:
- Segment(s) selection
- Smart Insight cohort filter
- Exclusion lists
- Multi-condition criteria
   ↓
Design:
- VCE editor (drag-drop)
- Pre-built templates
- Brand kit
- Personalization tokens
- Dynamic content blocks
- Predict recommendations block
- Custom HTML option
   ↓
Tracking:
- Conversion goal
- UTM parameters
- Link categories
   ↓
Preview & Test:
- Per-device preview
- Send test
- Spam test
- Inbox preview (if enabled)
   ↓
Send / Schedule:
- Send now
- Scheduled date/time
- Send Time Optimization (per recipient AI)
- Time-zone send
- Throttled delivery
   ↓
Confirm
```

### 8.3 Build Automation Center program

```
Automation Center → New program
   ↓
A) Blank canvas (build from scratch)
B) From Tactic template
   ↓
A) Build from scratch:
   Step 1: Entry node (trigger)
   - Event-based (custom event, profile property change)
   - Segment-based (entered segment, left segment)
   - Date-based
   - Behavior (Web Extend event)
   - API trigger
   ↓
   Step 2: Add nodes:
   - Wait (delay)
   - Quick filter (segment narrowing)
   - Decision (conditional branching yes/no)
   - A/B split test
   - Filter switch (multi-path)
   - Exclude (remove from path)
   - Send email
   - Send SMS
   - Send push (mobile + web)
   - Update field
   - Add to contact list
   - Remove from contact list
   - Webhook
   - Goal (conversion event)
   - End
   ↓
   Step 3: Configure each node:
   - Templates for sends
   - Conditions
   - Time delays
   - Goals
   ↓
   Step 4: Set goal + exit conditions
   ↓
   Step 5: Test program
   - QA profiles
   - Walk through each node
   - Verify channel sends
   ↓
   Step 6: Activate
   ↓
[Program Active]
```

### 8.4 Deploy Tactic

```
Automation → Tactics
   ↓
Browse library (filter by category, status, package)
   ↓
Select Tactic card
   ↓
Review variants per package + add-ons
   ↓
Channel selection
   ↓
Review summary
   ↓
Create Tactic (downloads to account)
   ↓
Wait few minutes for generation
   ↓
Click "Go to Automation Center program"
   ↓
Customize:
- Edit templates (brand voice)
- Adjust timing
- Modify branching
- Tweak segments
- Configure channels
   ↓
Test
   ↓
Activate
```

### 8.5 Segment building

```
Contacts → Segments → New segment
   ↓
Choose type:
- Standard segment (manual criteria)
- Smart Insight segment (RFM cohort based)
- Combined segment (combine multiple)
- Quick segment (per-campaign one-off)
   ↓
Build criteria:
- Profile attributes
- Transactional data
- Behavioral events (Web Extend)
- Smart Insight cohort membership
- Predictive scores
- Loyalty data
- Engagement metrics
- Subscription status
   ↓
Combine s AND/OR/NOT operators
   ↓
Preview segment size (real-time)
   ↓
Save
   ↓
[Dynamic segment active]
```

---

## 9. Restricted user flow (onboarding)

### 9.1 Use case

- **New hire** during training period
- **External contractor** with limited duration
- **Trial / evaluation** users
- **Junior team member** before promotion

### 9.2 Initial access

```
Admin: invite user as Restricted role
   ↓
User receives invitation
   ↓
Activates account
   ↓
[Restricted user with minimal access]
   ↓
Limited features visible:
- View campaigns (often)
- Templates (sometimes)
- Limited reports
- No customer data
- No sending
- No automation programs
```

### 9.3 Training period

```
Restricted user works alongside more senior:
- Observes workflows
- Practices on test environment
- Gradually learns platform
   ↓
After training milestone (typically 2-4 weeks):
- Admin reviews user's progress
- Promotes to Operator role (or Custom)
   ↓
[User now Operator]
```

### 9.4 Why use Restricted?

- **Security best practice** – minimal access initially
- **Prevent accidents** during learning
- **Compliance** – limit data exposure
- **Audit trail clarity**

---

## 10. BI Administrator flow (Smart Insight)

### 10.1 Use case

- **Marketing analyst / data analyst**
- **Customer insights specialist**
- **Performance reporting lead**
- **External research consultant**

### 10.2 BI Admin workflow

```
Login → Smart Insight Dashboard
   ↓
Daily/Weekly analysis:
- Cohort distribution review (% in each eRFM stage)
- Cohort transitions (sankey)
- Revenue per cohort
- Customer value trends
- Lifecycle stage movement
   ↓
Custom reporting:
- Build dashboards
- Configure reports
- Schedule exports
   ↓
Strategic outputs:
- Performance summaries
- Stakeholder briefings
- Trend analysis
- Recommendation reports
```

### 10.3 Smart Insight access

```
BI Admin opens Smart Insight
   ↓
View:
- eRFM cohort distribution
- Lifecycle stages
- Per-cohort metrics (revenue, AOV, engagement)
- Velocity (movement between cohorts)
- Cohort sizes over time
- Customer value evolution
   ↓
Can:
- Adjust eRFM scoring (limited – original setup primary)
- Build cohort-based segments
- Export cohort data
- Create dashboards
```

### 10.4 Strategic Dashboard

```
BI Admin: Strategic Dashboard
   ↓
View by strategy:
- "Increase repeat purchase rate"
- "Reduce churn"
- "Improve VIP retention"
- "Acquire new customers"
   ↓
Per strategy:
- Performance metrics
- Goal progress
- Linked Tactics
- Recommendations
   ↓
Click "Get Better Results with Tactics" → see relevant Tactics
   ↓
Drill into specific Tactic for performance details
```

---

## 11. Multi-account flow (multi-brand / multi-region)

### 11.1 Multi-account setup

```
Account Owner: contacts SAP support
   ↓
Backend configuration by SAP (NOT self-service)
   ↓
Multi-account permissions activated:
- Parent account (often "master")
- Sub-accounts per brand / region / business unit
   ↓
**Centralized user management:**
- User can have permissions across multiple accounts
- Same login, switch between contexts
- Per-account role assignment
   ↓
Activated multi-account mode
```

### 11.2 Architecture

```
Parent Account (master)
├── Account Owner (global)
└── Multiple sub-accounts
    ├── Account A (Brand A / Region A)
    │   ├── Account-specific Admin
    │   ├── Users assigned
    │   ├── Isolated data
    │   ├── Own segments + campaigns
    │   ├── Own templates
    │   ├── Own integrations
    │   └── Own loyalty program
    │
    ├── Account B (Brand B / Region B)
    │   └── ...
    │
    └── Account C (...)
        └── ...
```

### 11.3 Cross-account user navigation

```
User logs in
   ↓
Sees account selector (if multi-account access)
   ↓
Choose account
   ↓
UI loads in that account context
   ↓
Switch via top-right menu to other accounts
```

### 11.4 Use cases

- **Multi-brand retailer** (e.g. PUMA + sub-brands)
- **Multi-region B2C** (DACH, France, UK, US accounts)
- **Multi-business unit** (Online + Wholesale + Retail)
- **Agency model** (managing client accounts)

### 11.5 Limitations

- **Cannot share contacts** between sub-accounts (intentional isolation)
- **Templates** can be shared (with permission)
- **Programs must be recreated** per account (no easy clone across)
- **Reports per account** isolated
- **Aggregate reporting** at parent level (limited)
- **Backend config required** for setup changes

---

## 12. Dedicated CSM relationship flow

### 12.1 Customer Success structure

```
SAP Engagement Cloud Customer
   ↓
**Dedicated CSM assigned** at sign-up
   ↓
Continuity guarantee (post-rebrand commitment from SAP)
   ↓
CSM is single point of contact for:
- Strategic guidance
- Performance reviews
- Roadmap discussions
- Escalations
- Best practice sharing
- New feature adoption
- Renewal discussions
```

### 12.2 CSM cadence

```
Phase 1: Implementation (weekly)
- 30-60 min calls
- Implementation progress
- Issue resolution
- Decision points

Phase 2: Post-launch hypercare (weekly, 4-6 weeks)
- Performance monitoring
- Quick optimization
- Bug triage

Phase 3: Stabilization (bi-weekly to monthly)
- Performance review
- New idea testing
- Tactic adoption

Phase 4: Mature partnership (monthly + quarterly)
- Monthly: performance + tactical
- Quarterly: strategic QBR (deep dive, roadmap, planning)

Phase 5: Annual
- Annual strategic review
- Contract renewal discussions
- Major roadmap planning
```

### 12.3 Quarterly Business Review (QBR)

```
QBR preparation (2 weeks before):
- CSM gathers performance data
- Builds business review deck
- Identifies wins, gaps, opportunities

QBR session (2-3 hours):
- Performance vs. KPIs
- ROI tracking
- Tactic adoption + effectiveness
- Channel optimization opportunities
- New use cases identification
- Roadmap alignment
- Risk identification
- Next quarter planning

QBR output:
- Action items
- Owners + deadlines
- Next QBR scheduled
- Follow-up resources
```

### 12.4 CSM access

```
CSM gets:
- **Read access** to customer account (per consent)
- Limited debug access with explicit permission
- Cannot send campaigns without approval
- Activity logged in audit logs
- Mention Me / partner CSM gets view-only specialized roles

Customer can revoke CSM access anytime
```

### 12.5 CSM service tiers

#### Standard CSM
- Monthly touchpoints
- Quarterly QBR
- Standard SLA

#### Premium CSM (strategic)
- Bi-weekly touchpoints
- Quarterly QBR + monthly deep dives
- Faster escalation paths
- Roadmap input priority
- Beta feature access

### 12.6 CSM critique (Gartner reviews)

Some critique from real customers:
- *"Customer success team is supposed to share business expertise on the best way to use the tool"* (implying gap)
- Quality variability per CSM individual
- *"Implementation team has no expertise whatsoever: they just seem to copy/paste the same implementation agenda"*
- Some customers feel CSM is "checkbox" not value-add

⚠️ **Variability** je documented issue – not all CSMs equally strategic.

---

## 13. Customer profile lifecycle

### 13.1 Profile creation paths

#### A) Anonymous Web Extend tracking
```
Visitor lands on website (no cookie)
   ↓
Web Extend JS snippet drops cookie ID
   ↓
**Anonymous profile created** in CDP-like data layer
   ↓
Track:
- Page views
- Time on page
- Product views
- Cart events
- Search queries
- Custom events
   ↓
**Anonymous profile s rich behavior**
   ↓
NO email/phone yet
```

#### B) Email capture (form, signup)
```
Anonymous visitor (cookie set)
   ↓
Sees signup form / popup
   ↓
Submits email
   ↓
Emarsys:
- Validates email
- Checks existing profile (cookie + email match)
- **MERGES** anonymous + identified profiles
- Single profile s all browse history retained
- Records consent (timestamp, IP, source)
   ↓
Status: Active (or Pending if double opt-in)
   ↓
Welcome program / Tactic activates
```

#### C) E-commerce account creation
```
Customer creates account on SAP Commerce / Shopify / etc.
   ↓
Plug-and-play integration → Emarsys profile sync
   ↓
Emarsys:
- Identity resolution attempt (cookie match if visitor)
- Profile created/merged
- Customer data populated
- Marketing_consent flag respected
- Lifecycle stage assigned (typically "New Customer")
   ↓
[Identified profile s e-commerce link]
```

#### D) SAP ecosystem sync
```
Customer record in SAP CDP / Sales Cloud / S/4HANA
   ↓
Real-time or batch sync to Emarsys
   ↓
Single Customer Profile created/updated
   ↓
Relational data attached:
- Orders
- Service interactions
- B2B context (if applicable)
- Loyalty data
   ↓
[Profile s full SAP context]
```

#### E) Mobile app sign-up
```
User installs mobile app
   ↓
Mobile Engage SDK registers device + push token
   ↓
Anonymous mobile profile
   ↓
User signs in s email/account
   ↓
Profile merged (mobile + web cross-device)
   ↓
[Cross-device profile]
```

#### F) POS / In-store (omnichannel)
```
Customer makes purchase in physical store
   ↓
POS data → Emarsys (via integration)
   ↓
Profile identified (loyalty card, email at checkout, etc.)
   ↓
Profile updated:
- In-store order recorded
- Cross-channel attribution
- Lifecycle stage updated
   ↓
[True omnichannel profile]
```

### 13.2 Profile states & transitions

```
States:
├─ Anonymous (cookie only, no identification)
├─ Identified Guest (email known, no marketing consent)
├─ Subscribed Active (email + marketing consent)
├─ Subscribed Engaged (recent engagement)
├─ Subscribed Inactive (no recent engagement)
├─ Unsubscribed (opted out)
├─ Bounced (delivery failure)
├─ Spam Complainer
└─ Deleted (GDPR / manual)

Smart Insight Lifecycle:
├─ New Customer (first 30 days post first purchase)
├─ Active Customer
├─ Loyal Customer
├─ VIP / Champion
├─ Defecting
├─ Lost
└─ Inactive (never converted)

eRFM Cohort transitions over time per profile
```

### 13.3 Web Extend tracking continuous

```
Identified subscriber browses site
   ↓
Web Extend JS:
- Tracks page views
- Product views
- Cart events
- Search queries
- Custom events (configured per implementation)
   ↓
Real-time events → profile
   ↓
**Smart Insight cohort potentially re-calculated**
   ↓
**Predict recommendations re-trained**
   ↓
Segments re-evaluated
   ↓
Automation programs trigger if matches
```

### 13.4 Preference Center

```
Email footer / app: "Update preferences" link
   ↓
Emarsys-hosted preference page (s tokenem)
   ↓
Customer sees:
- Per-channel subscription (email, SMS, push)
- Personal data (editable per permissions)
- Communication preferences (frequency, topics, brands)
- Loyalty status
- "Unsubscribe from all" master toggle
- "Delete my account" (GDPR)
   ↓
Update preferences
   ↓
Profile updated immediately
   ↓
Programs trigger (Subscription changed events)
```

### 13.5 Unsubscribe flow

```
Customer clicks Unsubscribe
   ↓
Channel-specific:
- Email: removed from email marketing
- SMS: STOP keyword
- Push: app/browser unsubscribe
- Web push: browser-side
   ↓
Per-channel consent revoked
- Other channels often still active (unless "unsubscribe all" chosen)
   ↓
Profile data retained for legitimate interests
   ↓
"Unsubscribed" event fires → may trigger save program
```

### 13.6 Bounce + complaint handling

#### Hard bounce
```
ISP returns 5xx
   ↓
Emarsys marks Hard Bounce
   ↓
Auto-suppression from email
   ↓
Other channels still potentially active
```

#### Spam complaint
```
ISP FBL → Emarsys
   ↓
Auto-suppression all channels typically
   ↓
Sender reputation impact tracking
   ↓
Internal review if pattern emerges
```

### 13.7 Identity resolution edge cases

- **Multiple emails per person** → multi-email profile (additional emails property)
- **Email change** → manual merge or new profile (per business rules)
- **Anonymous to identified merge** → cookie + email match
- **Cross-device matching** → email-based with device fingerprint backup
- **Edge cases** require CSM consultation

---

## 14. Smart Insight eRFM flow

### 14.1 Initial Smart Insight setup (onboarding)

```
Strategic onboarding workshop with CSM
   ↓
Business context discussion:
- Industry vertical (retail, fashion, beauty, etc.)
- Customer lifecycle definition
- Typical purchase cycles
- Seasonal variations
- VIP definition (top X% spenders?)
- Churn definition (X days without purchase?)
   ↓
**eRFM scoring boundaries** set:
- Recency boundaries (e.g. Active = <30d, Engaged = <90d)
- Frequency boundaries (e.g. Loyal = 5+ orders, VIP = 10+)
- Monetary boundaries (e.g. Champion = top 10% spend)
   ↓
**Lifecycle stages defined:**
- New Customer (first 30/60/90 days)
- Active Customer
- Loyal Customer
- VIP
- Defecting
- Lost
- Inactive
   ↓
**LOCKED at account level** – cannot be redefined later per account
   ↓
Initial calculation across all profiles
   ↓
Validation against historical data
   ↓
[Smart Insight live]
```

### 14.2 Continuous cohort updates

```
Daily eRFM recalculation:
- Each profile re-scored
- Cohort assignments updated
- Lifecycle stage transitions detected
   ↓
**Trigger events for transitions:**
- Customer "About to Sleep" → "At Risk" → triggers re-engagement
- Customer "New" → "Loyal" → triggers VIP welcome
- Customer "VIP" → "Defecting" → triggers VIP rescue
   ↓
Real-time tactic activation
```

### 14.3 Smart Insight Dashboard

```
BI Admin / Analyst opens dashboard
   ↓
View:
- Cohort distribution (current snapshot)
- Cohort distribution trend (over time)
- Sankey diagram (cohort transitions)
- Per-cohort metrics:
  - Customer count
  - Revenue
  - AOV
  - Engagement rate
  - Channel preferences
- Cohort velocity (movement speed)
   ↓
Insights:
- Largest cohorts
- Highest-value cohorts
- Fastest-growing cohorts
- At-risk cohorts requiring attention
- Lost / churning cohorts trends
```

### 14.4 Smart Insight segments

```
Pre-built segments based on lifecycle stages + eRFM cohorts
   ↓
Used in:
- Campaigns (segment selection)
- Programs (entry triggers)
- Tactics (pre-configured)
- Predict (audience scoping)
- Reports
   ↓
Cannot redefine lifecycle stage definitions per account (LOCKED)
   ↓
But can build standard segments on top of Smart Insight + other criteria
```

### 14.5 Tactic-Smart Insight integration

Tactics use Smart Insight cohorts as triggers:

```
Tactic: "Win-back at-risk VIPs"

Entry: Customer enters "At Risk" cohort
   AND was previously in "VIP" cohort
   ↓
Send email: Exclusive VIP-only offer
   ↓
Wait 5 days
   ↓
Decision: Customer responded?
   YES → exit (success)
   NO → Send push: VIP rescue offer (larger)
   ↓
Wait 10 days
   ↓
Decision: Responded?
   YES → exit
   NO → SMS (final) + direct mail (premium catalog)
```

---

## 15. Tactics deployment flow

### 15.1 Tactic discovery

```
Operator / Marketer: Automation menu → Tactics
   OR
Strategic Dashboard → "Get Better Results with Tactics"
   ↓
Tactics list view s filters:
- Status (Inactive / In design / Active / Needs attention / In error)
- Category (acquisition, engagement, retention, etc.)
- Strategy (linked to Strategic Dashboard strategies)
- Search by keywords
```

### 15.2 Tactic download + customization

```
Click Tactic card
   ↓
View Tactic details:
- Description
- Strategy linkage
- Channels included
- Package variants (Basic / Premium / Enterprise)
- Pre-built segments used
- Estimated setup time
   ↓
Select package variant (per add-ons available)
   ↓
Select channels (from available)
   ↓
Review summary
   ↓
"Create Tactic" → downloads to account
   ↓
**Wait few minutes for generation**
   ↓
Click "Go to Automation Center program"
   ↓
Open in Automation Center
   ↓
Customization phase begins
```

### 15.3 Tactic customization

```
Open Tactic program in Automation Center
   ↓
Customize per business:

Templates:
- Edit email templates (brand voice, content)
- Update SMS templates
- Update push templates
- Brand kit applied

Timing:
- Adjust wait times per business cycle
- Configure Time Travel (local time)

Segments:
- Pre-built segments can be tweaked (with care)
- Cannot use Combined segments
- Cannot redefine lifecycle stages

Decision branches:
- Tweak conditions per business
- Add/remove branches if needed

Channels:
- Adjust channel mix
- Configure frequency caps

Goal:
- Set conversion event
- Configure attribution

Exit conditions:
- Configure when to remove customers
   ↓
Test mode:
- QA profile walkthrough
- Send test
- Verify each step
   ↓
Activate
   ↓
[Tactic Live]
```

### 15.4 Tactic management

```
Active Tactics monitored:
- Performance metrics per Tactic
- Linked program performance
- Goal achievement rate
- Per-channel breakdown
   ↓
Actions:
- Pause / resume
- Edit (must pause first)
- Clone for variation
- Unlink program from Tactic
- Delete program
```

### 15.5 Tactic status transitions

```
Inactive (downloaded but not configured)
   ↓
In design (customization in progress)
   ↓
Active (running)
   ↓
Various transitions:
- Active → Paused (manual)
- Active → Needs attention (issue detected)
- Active → Frozen (operational issue)
- Active → In error (config error)
- Paused → Active (resume)
- Any → Inactive (delete)
```

---

## 16. Multichannel workflow execution

### 16.1 Multi-channel orchestration

Emarsys excels v cross-channel coordination – core competency.

### 16.2 Channel-aware workflow

```
Tactic entry: Customer enters "Cart abandoned" trigger
   ↓
Wait 1h
   ↓
Send EMAIL (primary channel, detail-rich)
   ↓
Wait 3h
   ↓
Quick filter: Email opened?
   YES → Wait 24h, proceed to next step
   NO → Send WEB PUSH (silent reminder)
   ↓
Wait 24h
   ↓
Decision: Purchased?
   YES → Goal (exit successfully)
   NO → Quick filter: Email engagement history?
        High engager → Send EMAIL discount
        Low engager → Send SMS (escalation)
   ↓
Wait 48h
   ↓
Decision: Purchased?
   YES → Goal
   NO → Final step:
        - Push (if app user)
        - Direct mail (if VIP segment)
        - SMS (last resort)
   ↓
End
```

### 16.3 Cross-channel coordination logic

- **Customer opens email** → don't also send push (avoid redundancy)
- **Customer engaged on web** → time email send to match engagement window
- **Customer prefers SMS** → escalate to SMS faster
- **VIP customer** → premium channels (direct mail, dedicated phone)
- **App user** → push first, email backup

### 16.4 Frequency caps cross-channel

```
Global frequency caps configured:
- Max emails per customer per week
- Max SMS per month
- Max push per day
- Max total messages per customer per week
   ↓
Tactics respect caps:
- If approaching cap → priority routing
- If at cap → skip step OR delay
   ↓
Suppression list for over-messaged customers
```

### 16.5 Contact-level channel preferences

Profile-level:
- "Prefers email" → email always primary
- "Prefers push" → push first
- "Quiet hours: 8pm-8am" → no sends in those hours
- "No marketing on weekends" → respected
- "Language: German" → German content always

### 16.6 Predict integration with multichannel

```
At each send step:
- Predict generates personalized product recommendations
- Per customer
- Per channel context (email = larger image, SMS = product name)
- Per recent behavior (browsed, purchased, wishlisted)
   ↓
Dynamic content per customer per channel
```

---

## 17. API & SAP ekosystém integration flow

### 17.1 API credentials creation

```
Account Owner / Admin: API Credentials → Create new
   ↓
Choose credential type:

OpenID Connect (modern, recommended):
- OAuth 2.0 + JWT
- Token endpoint provided
- Client ID + secret
- Token-based auth

OpenID Connect (SAP Cloud Identity):
- Integrated s SAP IAM
- Single sign-on path
- Enterprise-grade

WSSE (legacy):
- Username + secret-based
- Only for pre-Feb 24, 2025 contracts
- Being deprecated
   ↓
Configure API endpoint permissions:
- Granular per endpoint
- Read vs. Write
- Save changes
   ↓
[API credentials active]
```

### 17.2 API request flow

```
Application:
   POST /api/v2/contacts (or relevant endpoint)
   Headers:
     Authorization: Bearer {JWT_token}
     Content-Type: application/json
   Body: { contact data + custom fields }
   ↓
Emarsys:
- Validates JWT
- Rate limit check
- Permission check (per endpoint)
- Validates payload
   ↓
Response 200/201
   ↓
Contact created/updated in Emarsys CDP
   ↓
Identity resolution if applicable
   ↓
Programs trigger if matches
```

### 17.3 Event tracking

```
E-commerce / app → POST /events
   {
     "event_type": "ViewedProduct",
     "contact_id": "12345" (or email),
     "properties": {
       "product_id": "P-001",
       "category": "Apparel",
       "brand": "BrandX"
     }
   }
   ↓
Emarsys:
- Resolves profile
- Records event
- Updates Smart Insight + Predict
- Triggers programs if matches
```

### 17.4 SFTP / WebDAV bulk transfer

```
Daily customer data sync (large enterprise):
- Customer file uploaded to SFTP
- Emarsys processes overnight
- Profile updates batch processed

Product catalog updates:
- Product file uploaded
- Catalog refresh
- Predict re-training

Bulk imports:
- CSV files via SFTP
- Validation + processing
- Profile creates / updates
```

### 17.5 Webhook subscriptions

```
Admin configures webhooks:
- Target URL
- Events subscribed (multi-select):
  - Subscriber events
  - Campaign events
  - Order events
  - Program events
- Signature verification (HMAC)
   ↓
Emarsys POSTs on each event
   ↓
Application processes
```

### 17.6 SAP ecosystem deep integration

#### SAP Commerce Cloud (deepest)
```
Order placed in SAP Commerce
   ↓
Real-time event → Emarsys
   ↓
Order data fully populated:
- Customer
- Order items
- Total + currency
- Shipping address
- Loyalty redemption
   ↓
**Order confirmation Tactic** triggers
   ↓
**Post-purchase journey** begins
```

#### SAP CDP integration
```
Customer creates account / updates profile in SAP CDP
   ↓
Real-time sync to Emarsys
   ↓
Single Customer Profile populated
   ↓
Identity resolution across SAP systems
```

#### SAP Sales Cloud V2 (B2B)
```
Lead in SAP Sales Cloud
   ↓
Marketing nurture in Emarsys
   ↓
Behavior data sync (engaged, opened, clicked)
   ↓
Lead score in Sales Cloud updated
   ↓
SDR alerted when MQL → SQL
```

#### SAP S/4HANA
```
Inventory data in S/4HANA
   ↓
Real-time stock levels → Emarsys
   ↓
Out-of-stock alerts trigger different campaigns
   ↓
"Back in stock" notifications when inventory returns
```

#### SAP Datasphere (analytics)
```
Marketing data from Emarsys → Datasphere
   ↓
Combined s ERP + sales + service data
   ↓
Cross-functional analytics
   ↓
ML training on combined dataset
```

### 17.7 Non-SAP integration

```
Shopify / Magento integration:
- Plugin or API
- OAuth authorization
- Customer + order + product sync
- Real-time webhooks

Salesforce CRM integration:
- API-based sync
- Contact + lead + opportunity data
- Marketing-sales coordination

Ad platforms (Meta, Google):
- Audience sync API
- Real-time segment push
- Lookalike audience generation

Direct mail providers:
- API to print provider
- Personalized catalogs / postcards
- Triggered from automation
```

---

## 18. GDPR & Compliance flow

### 18.1 EU hosting + ISO 27001

```
Emarsys servers v EU (multiple regions)
   ↓
ISO 27001:2013 certified
   ↓
SAP enterprise security standards
   ↓
GDPR by design
   ↓
EU data residency default for EU customers
```

### 18.2 Right to Be Forgotten

```
Customer requests deletion
   ↓
Method A: UI
- Admin: Contact → Delete (GDPR option)
- Confirmation
- Process

Method B: API
- DELETE /api/contacts/{id}
- Specialized GDPR endpoint
- Or use ExpertSender-style deletion job

Method C: Customer self-service
- Preference Center → "Delete my account"
- Email verification
- Submit
   ↓
Emarsys:
- Removes profile data
- Anonymizes related events
- Suppresses across channels
- Logs deletion (audit)
- Email confirmation
   ↓
GDPR retention period: typically immediate for personal data
   ↓
Some aggregate data may persist (without PII)
```

### 18.3 Data export per contact (DSAR)

```
Admin: Contact → Export GDPR data
OR
API: GET /contacts/{id}/gdpr-export
   ↓
Emarsys generates JSON/CSV with:
- Profile data
- All events
- Subscriptions
- Campaign sends
- Form submissions
- Consent history
- Loyalty data
- All channel interactions
   ↓
Download link provided
```

### 18.4 Consent tracking

Per profile:
- Email subscription consent (timestamp, IP, source, form)
- SMS opt-in
- Web push opt-in
- Mobile push opt-in
- Per-list / per-channel consent
- Marketing vs. transactional separation
- Consent text version (versioned)
- Double opt-in audit
- Per-channel opt-out timestamp

### 18.5 Permission management

Per oficiální Publicare partner documentation:
- **Legally compliant opt-in/opt-out** flows
- **GDPR-compliant channel-specific** subscription
- **Custom preference centers** designable
- **Permission management logics** customizable
- **Welcome routes** for new opt-ins

### 18.6 Security configuration

#### Account Security Settings
```
Account Owner: Security Settings
   ↓
Configure:
- Account security level
- Password complexity
- Session timeouts
- IP allowlist
- 2-step authentication enforcement
   ↓
**Combined enforcement:**
- IP allowlist defines "safe" locations
- Users from non-allowlist IPs MUST use 2-step auth
   ↓
SAP recommends enabling but denies responsibility if not used
```

#### Audit logs
- All admin actions logged
- All data access logged
- API calls logged
- CSM access logged (with consent)
- Exportable for compliance audits

### 18.7 Compliance certifications

- **GDPR compliant**
- **ISO 27001:2013**
- **ISO 22301** (business continuity)
- **SOC 2 Type II**
- **CCPA, CASL, CAN-SPAM**
- **PDPA (Singapore)**
- **LGPD (Brazil)**
- **EU-US Data Privacy Framework**
- **SAP enterprise compliance** standards

### 18.8 SAP for Me support portal

```
Account Owner / Admin: SAP for Me portal access
   ↓
Submit support incidents
   ↓
Component: **CEC-EMA** (SAP support component)
   ↓
SAP support team responds per SLA tier
   ↓
Issue tracking + resolution
```

---

## 19. Datová mapa: co vidí kdo

| Data | Owner | Admin | Operator | Restricted | BI Admin | Custom | CSM | Customer | API |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Account Security | ✅ | ❌ | ❌ | ❌ | ❌ | per role | – | – | – |
| Multi-account perms | ✅ | ❌ | ❌ | ❌ | ❌ | per role | – | – | – |
| User management | ✅ | ✅ | ❌ | ❌ | ❌ | per role | – | – | per scope |
| API credentials | ✅ | ✅ | ❌ | ❌ | ❌ | per role | – | – | – |
| API endpoint perms | ✅ | ✅ | ❌ | ❌ | ❌ | per role | – | – | – |
| Email domain config | ✅ | view | ❌ | ❌ | ❌ | per role | – | – | per scope |
| All customer profiles | ✅ | ✅ | ✅ | limited | view | per role | read | jen sebe | ✅ |
| Edit customer profiles | ✅ | ✅ | ✅ | ❌ | ❌ | per role | ❌ | ❌ | ✅ |
| Export customers | ✅ | ✅ | limited | ❌ | ❌ | per role | ❌ | request | per scope |
| Segments | ✅ | ✅ | ✅ | view | ✅ | per role | read | ❌ | ✅ |
| Smart Insight | ✅ | per perm | ❌ | ❌ | ✅ | per role | read | ❌ | ✅ |
| eRFM cohort assignment | ✅ | ✅ | ✅ | view | ✅ | per role | read | ❌ | ✅ |
| Predict | ✅ | ✅ | ✅ | ❌ | view | per role | – | – | ✅ |
| Email campaigns | ✅ | ✅ | ✅ | view | ❌ | per role | read | jen co dostal | ✅ |
| Send campaigns | ✅ | ✅ | ✅ | ❌ | ❌ | per role | ❌ | ❌ | ✅ |
| Automation Center | ✅ | ✅ | ✅ | view | view | per role | read | ❌ | ✅ |
| Tactics | ✅ | ✅ | ✅ | view | view | per role | read | ❌ | ✅ |
| Templates / VCE | ✅ | ✅ | ✅ | limited | ❌ | per role | read | ❌ | ✅ |
| Mobile Engage | ✅ | ✅ | ✅ | ❌ | ❌ | per role | – | – | ✅ |
| SMS | ✅ | ✅ | ✅ | ❌ | ❌ | per role | – | – | ✅ |
| Web Channel | ✅ | ✅ | ✅ | ❌ | ❌ | per role | – | – | ✅ |
| Loyalty Engine | ✅ | ✅ | per perm | ❌ | view | per role | – | – | ✅ |
| Digital Ads | ✅ | ✅ | ✅ | ❌ | ❌ | per role | – | – | per scope |
| Direct Mail | ✅ | ✅ | per perm | ❌ | ❌ | per role | – | – | per scope |
| Reports & Strategic Dashboard | ✅ | ✅ | ✅ | ❌ | ✅ | per role | read | ❌ | ✅ |
| Integrations | ✅ | ✅ | ❌ | ❌ | ❌ | per role | – | – | per scope |
| Audit logs | ✅ | ✅ | ❌ | ❌ | ❌ | per role | – | – | per scope |
| GDPR delete | ✅ | ✅ | per role | ❌ | per role | per role | – | request | per scope |
| Cross-account view (multi) | ✅ | ❌ | ❌ | ❌ | ❌ | per role | per scope | ❌ | per scope |

---

## 20. Známé úzkoprofilové místa

### 20.1 Sales & onboarding

- **No self-serve sign-up** – sales-driven only
- **Long sales cycle** – 2-6 months typical
- **No transparent pricing** – complicates evaluation
- **Qualifying criteria strict** (100K+ contacts ideal)
- **No free trial / freemium**
- **Implementation 4-6 months** typical
- **Partner often required** ($30K-$500K+ implementation)
- **SAP integration complexity** for full benefit

### 20.2 UI/UX complexity

- **Complex interface** – not as polished as Klaviyo / Mailchimp
- **Multiple paradigms** (Automation Center + Interactions + Tactics)
- **Learning curve significant** for marketers new to enterprise
- **Some legacy UI elements**
- **Strategic Dashboard daunting** initially
- **Navigation depth** – features spread across menus

### 20.3 Role / permission limits

- **Default roles NOT modifiable** – must duplicate to customize
- **5 default roles only**
- **Page-level permissions** require granular configuration
- **Account Owner is highest** – non-modifiable, created by SAP
- **Ownership transfer** requires SAP support (not self-service)
- **Multi-account permissions** require backend SAP config
- **Smart Insight cannot redefine lifecycle stages** post-setup

### 20.4 Smart Insight limitations

- **Lifecycle stages LOCKED** after setup (account level)
- **eRFM scoring boundaries** mostly fixed
- **Customization later requires CSM** intervention
- **Definition changes affect all historical analysis**

### 20.5 Tactic limitations

Per oficiální docs:
- **Combined segments NOT supported** in Tactics
- **Lifecycle stage definitions cannot change** at Tactic level
- **Pre-built segments only** in Tactic nodes
- **Web behavior segments editable** but careful with referenced fields
- **If changing days defined, update Wait nodes**
- **Some Tactics package-locked** (lower tier = limited Tactics)

### 20.6 Reporting limitations

- **Cannot easily save report templates** (Gartner critique)
- **Custom dashboard creation** more complex than Klaviyo
- **Multi-touch attribution** requires SAP Datasphere
- **Per-customer drill-down** sometimes complex

### 20.7 Implementation variability

Per real Gartner reviews:
- *"Implementation team has no expertise whatsoever"*
- *"Training phase basic, no adaptation to company situation"*
- *"Customer success team supposed to share business expertise"* (implying gap)
- **Quality varies per individual** (CSM, implementer)

### 20.8 AI features behind some competitors

- **Generative AI** newer, less mature
- **AI Agents (autonomous)** less developed than Klaviyo Marketing Agent
- **Joule integration ongoing**
- **Behind Salesforce AI** v enterprise integration
- **Predictive ML strong** (Predict, Smart Insight) ale traditional

### 20.9 Channel/feature gaps

- **No native online courses / LMS**
- **No native webinars**
- **No native digital products sale**
- **No paid newsletter**
- **No native review collection**
- **No native CRM** (assumes SAP Sales Cloud or external)
- **B2B features less developed** than HubSpot Sales Hub
- **WhatsApp Business native** still limited
- **Conversational AI** less developed

### 20.10 Multi-language UI limits

- **6-8 main languages** v UI
- **No Czech / Slovak** v UI
- **Help center primarily English + German**

### 20.11 Vendor lock-in concerns

- **Tight SAP integration** = harder migration
- **Custom workflows** not portable
- **Predictive scores** proprietary
- **eRFM definitions** Emarsys-specific
- **Predict recommendations** trained on platform
- **Tactics non-exportable**

### 20.12 SAP ecosystem dependency (Enterprise Edition)

- **Most value if using SAP S/4HANA, CDP, CDC**
- **If non-SAP shop:** Emarsys Edition only (less benefit)
- **Enterprise Edition pricing premium** justifies only with SAP investment

### 20.13 Operational gotchas

- **Programs in Frozen / Error states** require intervention
- **Notification emails important** – missed alerts cause issues
- **Original creator restrictions** on some assets (Vouchers, Mailboxes)
- **API auth migration** (WSSE → OpenID) ongoing
- **SFTP credentials** maintenance overhead

### 20.14 Migration challenges (off Emarsys)

- **Workflows cannot export**
- **Predictive scores locked-in**
- **Smart Insight data** specific format
- **Predict training** must restart on new platform
- **Historical event data** limited portability
- **Custom integrations** must be rebuilt
- **Multi-channel orchestration** must be redesigned

---

## 21. Doporučení pro design vlastních procesů

Pokud Emarsys / Engagement Cloud používáte v týmu, doporučujeme:

1. **Strategic onboarding nezkratovat** – 4-6 měsíců investice nutná
2. **Implementation partner** – SAP-certified pro váš vertical
3. **Dedicated CSM relationship** investovat – key value driver
4. **Smart Insight setup carefully** – LOCKED after, work s CSM
5. **Custom roles strategy** – build per-job-function s page-level perms
6. **API credentials** per integration (named, scoped) – ne shared
7. **Multi-account planning** (pokud multi-brand) – setup upfront
8. **Domain authentication** první týden – DKIM + DMARC + branded tracking
9. **Security configuration** strict – IP allowlist + 2-step auth combination
10. **Tactics adoption plan** – start s 6-10 core Tactics for go-live
11. **Brand kit + template library** – consistent across all channels
12. **Multi-channel orchestration** – plan from start, ne after
13. **Frequency caps cross-channel** – prevent over-messaging
14. **Predictive scores monitoring** – CLV, churn trends review monthly
15. **Quarterly Business Review s CSM** – strategic optimization
16. **GDPR compliance documentation** – consent audit + retention policies
17. **Migration plan / backup** – periodic export profiles + key configuration
18. **Joule AI exploration** – adopt as it matures
19. **Mobile SDK integration** (if app) – early in implementation
20. **In-store data flow** (if omnichannel) – integrate POS early

---

*Dokument zpracován z oficiálních zdrojů emarsys.com, sap.com/products/crm, help.emarsys.com, help.sap.com, learning.sap.com a praktických zdrojů (Gartner Peer Insights, G2, Spadoom, Publicare, Sybit). Pro nejaktuálnější detaily je nutný engagement s SAP / Emarsys sales + implementation teamem.*
