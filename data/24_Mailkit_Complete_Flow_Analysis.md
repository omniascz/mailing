# Mailkit – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v Mailkitu prochází data, lidé a akce – od master account ownerа přes 4-level access rights, sub-accounts pro agency/multi-market, API-first integrace, až po koncového subscribera.

> Tento dokument doplňuje `23_Mailkit_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** Mailkit umí, tento popisuje, **kdo s tím interaguje a jak data tečou**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
>
> - **Premium positioning** – sales-driven, no self-serve, qualification process
> - **Vlastní uzavřená infrastruktura** (no cloud, no third-party processors) – UNIKÁTNÍ
> - **ISO certifikace 7 standardů** (27001, 27701, 9001, 22301, 27017, 27018, 20000)
> - **Member of CSA, M3AAWG, Signal Spam** – prestigious industry orgs
> - **4 levels of access rights** per account a per sub-account
> - **Sub-accounts** – agency / multi-market / multi-brand
> - **API-first approach** s detailní dokumentací
> - **Pricing "on demand"** – custom per klient
> - **Engagement Score** – proprietary scoring
> - **AMP for Email** support integrated
> - **300+ templates**
> - **Helpdesk v EN + CZ**

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Sales & qualification flow (no self-serve!)](#2-sales-flow)
3. [Onboarding flow](#3-onboarding-flow)
4. [4 levels of access rights](#4-access-rights)
5. [Account Owner / Master Admin flow](#5-account-owner-flow)
6. [Sub-account architecture flow](#6-sub-account-flow)
7. [Sub-account Admin flow](#7-sub-account-admin)
8. [Marketing user flow](#8-marketing-user-flow)
9. [Reporter / View-only flow](#9-reporter-flow)
10. [Subscriber lifecycle](#10-subscriber-lifecycle)
11. [Email lifecycle s vlastní infrastrukturou](#11-email-lifecycle)
12. [Automation execution model](#12-automation-execution)
13. [Engagement Score calculation flow](#13-engagement-score-flow)
14. [Dynamic content rendering (variables, loops, conditions)](#14-dynamic-content-flow)
15. [AMP for Email flow](#15-amp-flow)
16. [SMS flow](#16-sms-flow)
17. [Transactional email flow](#17-transactional-flow)
18. [API-first integration flow](#18-integration-flow)
19. [Data sources flow](#19-data-sources)
20. [Deliverability flow (vlastní infra)](#20-deliverability-flow)
21. [Compliance + ISO audits flow](#21-compliance-flow)
22. [Datová mapa: co vidí kdo](#22-datová-mapa)
23. [Známé úzkoprofilové místa](#23-úzkoprofilové-místa)

---

## 1. Mapa aktérů

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│         MAILKIT PLATFORM ECOSYSTEM                                 │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [Mailkit Internal Team (Praha)]                                   │
│   ├─ Sales team (qualification + custom proposals)                 │
│   ├─ Account Management (per klient)                               │
│   ├─ Helpdesk (Czech + English)                                    │
│   ├─ Technical Support                                             │
│   ├─ Deliverability team (CSA/M3AAWG membership)                   │
│   ├─ Implementation / integration team                             │
│   ├─ DevOps (vlastní infrastruktura)                               │
│   ├─ Compliance team (ISO audits)                                  │
│   └─ Billing team                                                  │
│           │ (premium service touchpoints)                          │
│           ▼                                                        │
│                                                                    │
│   ┌──────────────────────────────────────────┐                     │
│   │   Master Account                         │                     │
│   │                                          │                     │
│   │   4 LEVELS OF ACCESS RIGHTS:             │                     │
│   │   ├─ Level 1: Owner / Master Admin       │◄── full + billing  │
│   │   ├─ Level 2: Administrator              │◄── operational lead │
│   │   ├─ Level 3: Manager / Marketing user   │◄── daily tasks      │
│   │   └─ Level 4: Reporter / View-only       │◄── reports only     │
│   │                                          │                     │
│   │   + Sub-accounts (per package):          │                     │
│   │   ├─ Master users (cross-account)        │                     │
│   │   └─ Sub-account specific users          │                     │
│   │                                          │                     │
│   │   Each sub-account has own 4 levels      │                     │
│   └──────────────┬───────────────────────────┘                     │
│                  │                                                 │
│                  ▼                                                 │
│   Sub-accounts (per master):                                       │
│   ┌──────────────────────────────────────────┐                     │
│   │   Sub-account A (Client A / Market A)    │                     │
│   │   ├─ Own users (4 levels)                │                     │
│   │   ├─ Own lists, contacts, campaigns      │                     │
│   │   ├─ Own templates                       │                     │
│   │   ├─ Own integration                     │                     │
│   │   └─ Own domain settings                 │                     │
│   ├──────────────────────────────────────────┤                     │
│   │   Sub-account B (Client B / Market B)    │                     │
│   │   └─ ...                                 │                     │
│   ├──────────────────────────────────────────┤                     │
│   │   Sub-account C ...                      │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
│   [Subscribers / Contacts]                                         │
│       ├─→ marketing emails (campaigns + automations)               │
│       ├─→ behavior tracking                                        │
│       ├─→ SMS messages                                             │
│       ├─→ transactional emails                                     │
│       ├─→ AMP-enabled interactive emails                           │
│       └─→ preference management                                    │
│                                                                    │
│   [API + Data Sources Integration]                                 │
│       ├─→ Custom API integrations (primary)                        │
│       ├─→ Webhook events                                           │
│       ├─→ SFTP bulk transfers                                      │
│       ├─→ Direct database connections                              │
│       └─→ Per-client custom integration projects                   │
│                                                                    │
│   [Vlastní infrastruktura (NO CLOUD)]                              │
│       ├─→ Pražské data centers                                     │
│       ├─→ Multi-IP pools                                           │
│       ├─→ Direct ISP relationships                                 │
│       └─→ Engagement-based routing                                 │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér                           | Vstupní bod                 | Co dělá                       | Co vidí                   |
| ------------------------------- | --------------------------- | ----------------------------- | ------------------------- |
| **Owner / Master Admin**        | Created during contract     | Full + billing + sub-accounts | Vše napříč sub-accounts   |
| **Administrator (Level 2)**     | Pozvánka od Owner           | Operational lead              | Per account / sub-account |
| **Marketing user (Level 3)**    | Pozvánka                    | Daily marketing               | Per permissions           |
| **Reporter (Level 4)**          | Pozvánka                    | View reports only             | Read-only                 |
| **Cross-account user**          | Master + sub-account access | Multi-account management      | Per assigned scope        |
| **Subscriber / Contact**        | Form, API, integration      | Receives emails               | Své emaily                |
| **API Client**                  | API key                     | Custom integration            | Per scope                 |
| **Data source**                 | Configured connection       | Live data sync                | Per integration scope     |
| **Mailkit Account Manager**     | Dedicated per klient        | Account success               | Read access               |
| **Mailkit Implementation team** | During onboarding           | Setup + integration           | Per project scope         |
| **Mailkit Helpdesk**            | Support requests            | Issue resolution              | Read access s consent     |
| **External agency**             | Agency master account       | Manage clients                | Per sub-accounts          |

---

## 2. Sales & qualification flow (no self-serve!)

Mailkit NEPOUŽÍVÁ self-serve sign-up jako ExpertSender / SAP Emarsys.

### 2.1 Lead acquisition

Typicky:

- **Inbound** přes mailkit.com (contact form)
- **Word-of-mouth** v industry
- **CSA / M3AAWG** networking
- **Industry events** (DACH, EU mailing conferences)
- **Reference from existing customers**
- **Outbound** prospecting (mid-market+)

### 2.2 Initial inquiry flow

```
Prospect submits form: mailkit.com → "Contact us"
   ↓
Mailkit sales responds (typically 1-2 business days)
   ↓
**Discovery call:**
- Business type (B2C / B2B)
- Current ESP
- Reason for switching (deliverability?, compliance?, etc.)
- Email volume (campaigns + transactional)
- Contact database size
- Geographic distribution
- Integration needs
- Compliance requirements (ISO needs?)
- Budget range
- Timeline
- Decision-making process
```

### 2.3 Qualification process

Per oficiální:
_"We want to get to know you better before establishing cooperation and if we find that something is preventing us from doing so with regard to best-practice procedures, we will try to find solution together."_

```
Mailkit evaluates:
- Is sender a good fit? (best-practice compliance)
- Email acquisition methods? (no purchased lists!)
- Engagement patterns expected?
- Industry vertical compatibility?
- Compliance risk assessment
- Reputation impact assessment
   ↓
Decision:
A) Good fit → proceed with proposal
B) Borderline → try to find solution together
C) Not fit → polite decline (rare, but happens)
   ↓
**Mailkit protects sender reputation** of entire platform
- Won't onboard high-risk senders
- Protects CSA / M3AAWG membership
- Protects shared infrastructure reputation
```

### 2.4 Demo + technical discussion

```
Demo presentation (60-90 min):
- Platform walkthrough
- Vlastní infrastruktura advantages
- ISO certifikace
- Engagement Score explanation
- Deliverability case studies
- Reference customer stories
   ↓
Technical deep dive (s client IT/data team):
- API integration architecture
- Data sources integration
- Custom integration scope
- Security review (ISO advantages)
- Compliance review
   ↓
Use case workshop:
- Map current workflows
- Identify gap analysis
- Specific Mailkit advantages per use case
```

### 2.5 Proposal generation

```
Mailkit prepares custom proposal:
- Package recommendation (Lite/Pro/Enterprise)
- Number of contacts pricing tier
- Monthly email volume tier
- Sub-accounts (if applicable)
- SMS volume (if applicable)
- Support level
- Implementation timeline
- Custom integration scope
- Custom contract terms
   ↓
Proposal sent to client
   ↓
Negotiation phase:
- Pricing
- Add-ons
- Custom integrations
- Multi-year commitment options
- Termination clauses
```

### 2.6 Contract signing

```
Contract signed:
- Master Service Agreement
- DPA (Data Processing Agreement)
- SLA (Service Level Agreement) per tier
- Custom integration SOW (if applicable)
   ↓
[Project kickoff scheduled]
```

### 2.7 Pilot / POC (optional)

For large deals:

- 30-60 day pilot possible
- Limited features / test environment
- Use case validation
- Performance benchmarking

---

## 3. Onboarding flow

### 3.1 Project kickoff (Week 1)

```
Contract signed
   ↓
**Mailkit assigns:**
- Dedicated Account Manager
- Implementation specialist
- Technical support contact
- Deliverability advisor
   ↓
**Client side:**
- Project sponsor
- Marketing lead
- IT lead
- Compliance/Legal (if applicable)
   ↓
**Kickoff workshop (1-2 days, remote or on-site):**
- Introductions
- Goals + KPIs alignment
- Project plan walkthrough
- Communication cadence
- Risk identification
- Success criteria
   ↓
Project plan delivered:
- Phased rollout
- Milestones
- Owners
- Decision gates
```

### 3.2 Setup phase (Week 1-4)

```
Account provisioning:
- Mailkit creates master account
- Owner / Master Admin credentials
- Initial 4 levels configured
- Sub-accounts created (if applicable)
- Brand kit setup per sub-account
   ↓
Domain authentication:
- DKIM records configured per sending domain
- SPF records updated
- DMARC policy defined
- Branded tracking domain (CNAME)
- BIMI (if applicable)
   ↓
Verification:
- Mailkit validates DNS records
- Test sends from each domain
- ISP relationships activated (CSA, etc.)
```

### 3.3 Integration phase (Week 2-8)

```
API integration:
- API credentials generated
- Documentation provided
- Client dev team integrates internal systems
- Test endpoints
- Production cutover plan
   ↓
Data sources setup (if applicable):
- Identify data sources (CRM, e-commerce, ERP)
- Configure connections
- Field mapping
- Sync schedule
- Test syncs
   ↓
Initial data migration:
- Historical contacts import
- Order history (if e-commerce)
- Engagement history (if available)
- Custom field setup
- List structure setup
```

### 3.4 Templates + creative (Week 4-8)

```
Brand kit setup per sub-account:
- Colors, fonts, logos
- Email defaults (header, footer, unsubscribe)
- Brand consistency
   ↓
Master templates designed:
- Newsletter template
- Promotional template
- Transactional templates
- Welcome series templates
- Specific use case templates
   ↓
AMP-enabled versions (if applicable):
- AMP form templates
- Live content templates
- Interactive elements
   ↓
Test rendering across email clients
```

### 3.5 Automation setup (Week 6-10)

```
Workflow design workshops:
- Welcome series
- Cart abandonment
- Post-purchase
- Re-engagement
- Birthday / anniversary
- Lifecycle stages
- Custom B2B workflows (if applicable)
   ↓
Build workflows in Mailkit:
- Drag-drop builder
- Configure triggers
- Set up conditions / branches
- Configure goals
- Test thoroughly
   ↓
Engagement Score configuration:
- Define scoring rules
- Calibrate weights
- Test with historical data
```

### 3.6 Training (Week 8-12)

```
Multi-track training:

Track 1: Marketing team
- Campaign creation
- Template usage
- Visual creator
- Segmentation
- Basic reporting

Track 2: Advanced users
- Automation Center deep dive
- Dynamic content (variables, loops, conditions)
- AMP for Email
- Advanced segmentation
- Engagement Score

Track 3: Admin team
- User management (4 levels)
- Sub-account management
- Integration management
- API key management
- Security settings

Track 4: Analytics team
- Reports + dashboards
- Custom reports
- Engagement Score interpretation
- ROI tracking
```

### 3.7 Go-live (Week 10-14)

```
Pre-launch QA:
- All workflows tested
- Domain authentication verified
- Integration tested end-to-end
- Compliance review final
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
- Intensive Account Manager support
- Daily check-ins
- Performance optimization
- Quick bug fixes
```

### 3.8 Ongoing (Post-launch)

```
Transition to BAU:
- Account Manager monthly cadence
- Quarterly Business Review (QBR)
- Performance optimization
- New feature adoption
- Strategy planning
   ↓
Compliance audits:
- Annual ISO 27001 recertification
- DPA reviews
- Best practices updates
```

---

## 4. 4 levels of access rights

Per oficiální features:
_"Set up to 4 levels of access rights for each account and sub-account."_

### 4.1 Level 1: Owner / Master Admin

- **Highest tier**
- Created during contract setup
- **Full administrative control**
- Cross-account access
- Manages:
  - Billing
  - All users across master + sub-accounts
  - Account settings
  - Sub-account creation
  - Domain settings
  - Integration management
  - API key management
  - Compliance settings
  - Close account
- Cannot be deleted directly (s safeguards)

### 4.2 Level 2: Administrator

- **Operational lead** per account/sub-account
- User management within scope
- Configuration changes
- Cannot manage billing (typically)
- Cannot close account
- Per account/sub-account assignment

### 4.3 Level 3: Manager / Marketing user

- **Daily operational tasks**
- Campaigns + automations + segments
- Content creation
- Template management
- Send permissions (with limits)
- View reports
- No user management
- No settings changes

### 4.4 Level 4: Reporter / View-only

- **Read-only access**
- Reports + analytics
- No editing, sending
- No configuration access
- For stakeholders, executives, auditors

### 4.5 Per account/sub-account configuration

```
For each account / sub-account separately:
- Define which users have which level
- Granular permissions per level
- User can have:
  - Level 4 in Sub-account A
  - Level 2 in Sub-account B
  - Level 3 in Master account
```

### 4.6 Granular permissions per level

Configurable per level:

- **Account settings access**
- **Billing visibility**
- **User management**
- **Contact data access** (per list)
- **Campaign creation**
- **Campaign send**
- **Automation creation**
- **Automation activation**
- **Templates access**
- **Reports access**
- **Integration management**
- **API key access**
- **Domain settings**
- **GDPR delete access**
- **Audit log access**

### 4.7 Permission matrix (typical)

| Akce                         | L1 Owner | L2 Admin  | L3 Marketing | L4 Reporter |
| ---------------------------- | :------: | :-------: | :----------: | :---------: |
| **Account & Billing**        |          |           |              |             |
| Close account                |    ✅    |    ❌     |      ❌      |     ❌      |
| Manage billing               |    ✅    |    ❌     |      ❌      |     ❌      |
| Account settings             |    ✅    |    ✅     |      ❌      |     ❌      |
| Create sub-accounts          |    ✅    |    ❌     |      ❌      |     ❌      |
| **User Management**          |          |           |              |             |
| Add/edit users (master)      |    ✅    |    ❌     |      ❌      |     ❌      |
| Add/edit users (sub-account) |    ✅    |    ✅     |      ❌      |     ❌      |
| Cross-account access         |    ✅    | per scope |      ❌      |     ❌      |
| **Contacts**                 |          |           |              |             |
| View contacts                |    ✅    |    ✅     |      ✅      |    view     |
| Edit contacts                |    ✅    |    ✅     |      ✅      |     ❌      |
| Import contacts              |    ✅    |    ✅     |      ✅      |     ❌      |
| Export contacts              |    ✅    |    ✅     |   per role   |     ❌      |
| Delete contacts              |    ✅    |    ✅     |   per role   |     ❌      |
| **Lists / Segments**         |          |           |              |             |
| Manage lists                 |    ✅    |    ✅     |      ✅      |    view     |
| Create segments              |    ✅    |    ✅     |      ✅      |    view     |
| **Campaigns**                |          |           |              |             |
| Create / edit                |    ✅    |    ✅     |      ✅      |    view     |
| Send                         |    ✅    |    ✅     |      ✅      |     ❌      |
| **Automations**              |          |           |              |             |
| Create / edit                |    ✅    |    ✅     |      ✅      |    view     |
| Activate                     |    ✅    |    ✅     |      ✅      |     ❌      |
| **Templates**                |          |           |              |             |
| Create / edit                |    ✅    |    ✅     |      ✅      |    view     |
| **SMS**                      |          |           |              |             |
| Send SMS                     |    ✅    |    ✅     |      ✅      |     ❌      |
| Manage credits               |    ✅    |    ✅     |      ❌      |     ❌      |
| **Transactional**            |          |           |              |             |
| API access                   |    ✅    |    ✅     |   per role   |     ❌      |
| **Engagement Score**         |          |           |              |             |
| View scores                  |    ✅    |    ✅     |      ✅      |     ✅      |
| Configure scoring            |    ✅    |    ✅     |      ❌      |     ❌      |
| **Reports**                  |          |           |              |             |
| View                         |    ✅    |    ✅     |      ✅      |     ✅      |
| Custom dashboards            |    ✅    |    ✅     |   per role   |    view     |
| Export                       |    ✅    |    ✅     |   per role   |  per role   |
| **Integrations**             |          |           |              |             |
| Manage                       |    ✅    |    ✅     |      ❌      |     ❌      |
| **API**                      |          |           |              |             |
| Manage API keys              |    ✅    |    ✅     |      ❌      |     ❌      |
| **Domains**                  |          |           |              |             |
| Domain authentication        |    ✅    |    ✅     |      ❌      |     ❌      |
| **Audit Logs**               |          |           |              |             |
| View                         |    ✅    |    ✅     |      ❌      |  per role   |

---

## 5. Account Owner / Master Admin flow

### 5.1 Owner responsibilities

```
Master Account Owner / Master Admin = highest tier
   ↓
Created during contract signing
   ↓
Manages cross master + all sub-accounts:
- Billing
- User management (all levels, all sub-accounts)
- Sub-account creation
- Account settings (master + per sub-account)
- Domain settings
- Integration access
- API key management
- Compliance settings
- Close account option
```

### 5.2 Daily Owner workflow

```
Login → Master Dashboard
   ↓
Cross-account overview:
- Today's campaign performance (all sub-accounts)
- Active automation count (per sub-account)
- Total subscribers across all sub-accounts
- Integration health
- Failed sends / bounces alerts
- Engagement Score trends
   ↓
Strategic activities:
- Plan tier vs. usage review
- Sub-account performance comparison
- User audit
- Compliance review
- ROI tracking across portfolio
```

### 5.3 Billing management

```
Owner: Master account → Billing
   ↓
View:
- Current package + tier
- Master + per-sub-account allocations
- Contact count vs. limit
- Email send volume vs. limit
- SMS credits
- Add-ons usage
- Next billing date
- Invoice history
   ↓
Actions:
- Plan changes (Lite → Pro → Enterprise)
- Add sub-accounts
- Add seats
- Update payment method
- Download invoices
- Custom contract amendments (via Mailkit sales)
```

### 5.4 Sub-account creation

```
Owner: Master account → Sub-accounts → Create new
   ↓
Configure:
- Sub-account name
- Brand kit (colors, fonts, logos)
- Sender domains
- Default settings
- Allocated contacts limit
- Allocated email volume
   ↓
Assign Sub-account Admin (Level 2)
   ↓
Sub-account ready for setup
```

### 5.5 Manage users across accounts

```
Owner: User management view
   ↓
See all users across master + sub-accounts
   ↓
Per user:
- Email + personal info
- Account access (master / which sub-accounts)
- Level per account
- Status (active / deactivated)
- Audit log
   ↓
Actions:
- Add cross-account user
- Edit access
- Change levels per account
- Deactivate
- Delete (s safeguards)
```

### 5.6 Compliance + ISO management

```
Owner: Compliance dashboard
   ↓
View:
- ISO certification status
- Audit history
- DPA agreements
- Sender reputation per domain
- CSA membership status
- Industry compliance reports
   ↓
Actions:
- Download compliance certificates
- Schedule annual audit support
- Update DPAs s changes
```

### 5.7 Close account / cancel

```
Owner: Master account → Account settings → Cancel contract
   ↓
**Sales team contacts for cancellation**
- Premium service: not self-service
- Reasoning discussion
- Retention attempts (improvements?)
- Migration assistance offered
   ↓
Formal cancellation:
- Contract amendment / termination
- Data retention period
- Final invoicing
- Data export support
   ↓
Account closes per contract terms
```

---

## 6. Sub-account architecture flow

### 6.1 Sub-account purposes

#### Agency model

```
Master Account (Agency)
├── Agency Owner / Master Admin
├── Agency team users
│   ├── Cross-account access (for managing all clients)
│   └── Per-client access (specialists)
│
├── Sub-account: Client A
│   ├── Sub-account Admin
│   ├── Client A users (optionally)
│   ├── Own contacts, lists, campaigns
│   ├── Own templates
│   ├── Own domains
│   └── Own integration
│
├── Sub-account: Client B
│   └── ...
│
└── Sub-account: Client C
    └── ...
```

#### Multi-market company

```
Master Account (HQ)
├── Global team
│
├── Sub-account: UK
│   ├── UK team
│   ├── UK customers
│   ├── UK domains (mailkit.uk, etc.)
│   ├── UK brand kit
│   └── UK integrations
│
├── Sub-account: DE
│   └── DE specifics
│
├── Sub-account: FR
│   └── FR specifics
│
└── Sub-account: CZ
    └── CZ specifics
```

#### Multi-brand company

```
Master Account (Parent corp)
├── Corporate HQ users
│
├── Sub-account: Brand A
│   ├── Brand A specific
│   └── Independent operations
│
├── Sub-account: Brand B
│   └── ...
│
└── Sub-account: Brand C
    └── ...
```

### 6.2 Sub-account configuration

```
Per sub-account separately:
- Brand kit (colors, fonts, logos)
- Sender domains (DKIM, SPF, DMARC)
- Branded tracking domain
- Email defaults (header, footer)
- Default sender info
- Default unsubscribe text
- Contact list structure
- Custom field schema
- Integration connections
- Engagement Score config
- 4 levels access rights setup
```

### 6.3 Cross-account user flow

```
Master Owner adds cross-account user:
   ↓
Configure:
- Email + name
- Master account access? (Y/N + level)
- Sub-account A access? (Y/N + level)
- Sub-account B access? (Y/N + level)
- ...
   ↓
User invitation sent
   ↓
User activates account
   ↓
User logs in:
- Sees account selector (s assigned accounts)
- Switch between accounts via top nav
- Permissions per assigned level per account
```

### 6.4 Sub-account isolation

#### Data isolation (default)

- Contacts isolated per sub-account
- Lists / segments isolated
- Campaigns isolated
- Automations isolated
- Reports isolated

#### Optional sharing (master settings)

- Templates can be shared
- Brand assets can be shared
- API integrations can be shared
- Custom configuration

### 6.5 Aggregate reporting (master view)

```
Master Admin: Reports → Cross-account
   ↓
View:
- Total subscribers (all sub-accounts)
- Total emails sent (all sub-accounts)
- Per-sub-account performance comparison
- Aggregate engagement
- Aggregate revenue (if e-commerce)
- Top-performing sub-accounts
   ↓
Export aggregate reports
```

### 6.6 Sub-account scaling

```
Per package (Lite / Pro / Enterprise):
- Different sub-account limits
- Lite: limited / few sub-accounts
- Pro: more sub-accounts
- Enterprise: unlimited / very many
   ↓
Adding sub-accounts:
- Contact Mailkit sales (typically)
- Custom pricing per sub-account
- May trigger package upgrade
```

---

## 7. Sub-account Admin flow

### 7.1 Sub-account Admin role

```
Per oficiální: 4 levels per sub-account
   ↓
Sub-account Admin = Level 2 within sub-account
- Operational lead pro that specific sub-account
- User management within sub-account
- Settings configuration
- Integration management
- No master account access (unless explicitly granted)
```

### 7.2 Daily Sub-account Admin workflow

```
Login → Sub-account dashboard (this client / market)
   ↓
Activities:
- Review yesterday's metrics
- Check automation health
- Manage users within sub-account
- Configure integrations
- Manage domains
- Review reports
- Coordinate s master team (if needed)
```

### 7.3 User management within sub-account

```
Sub-account Admin: Users
   ↓
+ Add user to this sub-account
   ↓
Configure:
- Email
- Level (1-4 within sub-account scope)
- Granular permissions
- 2FA requirement
   ↓
Invitation sent
   ↓
[User active within sub-account]
```

### 7.4 Sub-account configuration

```
Sub-account Admin: Settings
   ↓
Configure:
- Sub-account name
- Brand kit
- Sender domains (within allocated)
- Email defaults
- Default settings
- Notification preferences
   ↓
Cannot:
- Modify master account
- Manage other sub-accounts
- Change billing (master decisions)
```

### 7.5 Integration management

```
Sub-account Admin: Integration
   ↓
Add integrations specific to this sub-account:
- API connections
- Data sources
- E-commerce platform
- CRM
   ↓
Configure mapping
   ↓
Test
   ↓
Activate
   ↓
[Integration live for this sub-account only]
```

---

## 8. Marketing user flow

### 8.1 Daily Marketing user workflow

```
Login → Dashboard (per assigned account)
   ↓
Activities:
- Create / send campaigns
- Build / monitor automations
- Manage segments
- Update templates
- Review reports
- Manage forms / popups (if available)
- A/B testing
```

### 8.2 Create campaign

```
Campaigns → New campaign
   ↓
Step 1: Setup
- Campaign name (internal)
- Subject line + personalization
- Preheader
- Sender (verified domain)
- Reply-to
- UTM parameters
   ↓
Step 2: Audience
- Lists / segments
- Exclusion lists
- Engagement Score filtering
   ↓
Step 3: Design
- Visual creator (drag-drop)
- Template (300+ library)
- AMP support enabled?
- Custom HTML option
   ↓
Step 4: Personalization
- Insert variables
- Conditions (if/else)
- Loops (for product feeds, etc.)
- Dynamic content blocks
- Default fallback values
   ↓
Step 5: Test
- Preview (desktop, mobile, AMP)
- Send test email
- Spam test
- Inbox placement preview
   ↓
Step 6: Send / Schedule
- Send now
- Schedule date + time
- Time-zone based
- Throttled delivery
   ↓
Confirm
```

### 8.3 Build automation

```
Automations → New automation
   ↓
A) Blank canvas
B) Template-based
   ↓
Build canvas:
- Drag-drop nodes
- Triggers: subscribed, tag added, order placed, custom event
- Wait nodes
- Conditional branches
- Send email / SMS / transactional
- Update fields / tags
- Goal nodes
- Webhook nodes
   ↓
Configure each node
   ↓
Test mode
- Walk through as test contact
- Verify each step
   ↓
Activate
   ↓
[Workflow live]
```

### 8.4 Segment building

```
Contacts → Segments → New segment
   ↓
Configure conditions:
- Contact attributes (custom fields, tags)
- Email engagement
- SMS engagement
- E-commerce data (s integrací)
- Engagement Score (threshold/range)
- Subscription source
- Date conditions
- Activity timeline
   ↓
Combine s AND/OR/NOT
   ↓
Preview segment size
   ↓
Save
   ↓
[Dynamic segment available pro campaigns + workflows]
```

### 8.5 Template management

```
Templates → New / Edit
   ↓
Visual creator:
- Drag-drop blocks
- Brand kit application
- Personalization tokens
- Variables, loops, conditions
- Product feed blocks
- AMP elements
- Custom HTML option
   ↓
Test rendering across email clients
   ↓
Save template
   ↓
[Available pro campaigns + automations]
```

---

## 9. Reporter / View-only flow

### 9.1 Use case

- **Executives** wanting dashboard view
- **Stakeholders** monitoring performance
- **Auditors** reviewing compliance
- **External consultants** read-only access
- **Compliance officers**

### 9.2 Reporter workflow

```
Login → Reports dashboard
   ↓
View (no editing):
- Campaign performance reports
- Automation performance
- Subscriber growth
- Engagement Score trends
- Revenue reports (if applicable)
- Per-sub-account performance (if multi-account access)
   ↓
Actions:
- Filter by date range
- Compare periods
- Export (per role)
- No edit, no send, no configure
```

### 9.3 Custom dashboards (per role)

- View pre-configured dashboards
- Some flexibility to filter
- Cannot create new dashboards (typically)
- Cannot modify settings

---

## 10. Subscriber lifecycle

### 10.1 Subscription creation paths

#### A) API integration

```
External system POSTs to Mailkit API
   ↓
Mailkit validates:
- Email syntax
- Duplicate check
- GDPR consent confirmation (passed in payload)
   ↓
Contact created/updated
   ↓
Status: Active (or Pending if double opt-in)
   ↓
Add to specified lists, tags
   ↓
Workflows trigger
```

#### B) Form submission

```
Visitor fills Mailkit form (or client form via API)
   ↓
Submit
   ↓
Mailkit validates
   ↓
Double opt-in (default for compliance)
   ↓
Confirmation email sent
   ↓
Subscriber confirms
   ↓
Status: Active
   ↓
Add to list, tags
   ↓
Workflow trigger
```

#### C) Data source sync

```
External data source (CRM, e-commerce, ERP)
   ↓
Mailkit data source connector
   ↓
Live sync OR scheduled batch
   ↓
Contacts created/updated
   ↓
Custom field updates
   ↓
Trigger workflows (if events match)
```

#### D) Bulk import (CSV / SFTP)

```
Admin: Import contacts
   ↓
CSV upload OR SFTP transfer
   ↓
Field mapping
   ↓
**Mandatory GDPR consent confirmation:**
- Source provenance
- Purpose
- Consent text version
- Validity period
   ↓
Validation processed
   ↓
Import completed
```

### 10.2 Subscriber status

```
[Pending] (if double opt-in)
   ↓
[Active] ← can receive
   ↓
**Engagement Score continuously updates**
   ↓
Various transitions:
- Unsubscribed
- Bounced
- Spam complaint
- Deleted (GDPR)
```

### 10.3 Engagement tracking

```
Active subscriber receives email
   ↓
Open tracked (pixel)
Click tracked (URL wrapper)
   ↓
**Engagement Score updates:**
- Open = +X points
- Click = +Y points
- No engagement = -Z points (time-decay)
   ↓
Profile updates:
- Last activity timestamp
- Engagement metrics
- Tags (if workflow triggers)
- Segments re-evaluated
- Workflow triggers fire
```

### 10.4 Preference center

```
Email footer: "Manage preferences" link
   ↓
Mailkit-hosted preference page
   ↓
Subscriber sees (per design):
- Subscribed lists (toggles)
- Per-channel preferences (email, SMS)
- Personal info (editable)
- Communication frequency
- Topic preferences
- Master unsubscribe
- GDPR rights (export, delete)
   ↓
Update preferences
   ↓
Profile updated
```

### 10.5 Unsubscribe

```
Subscriber clicks unsubscribe
   ↓
Mailkit-hosted page
   ↓
Options:
- Unsubscribe from specific list
- Unsubscribe from all
- Reason survey (optional)
   ↓
Status: Unsubscribed
   ↓
GDPR audit logged
   ↓
Workflow trigger fires
   ↓
Data retained per GDPR
```

### 10.6 Bounce + spam handling

#### Hard bounce

```
ISP 5xx
   ↓
Mailkit detects
   ↓
Status: Bounced
   ↓
Auto-suppression
   ↓
**Reputation tracking** (engagement-based routing affected)
```

#### Spam complaint

```
ISP FBL → Mailkit (direct relationships!)
   ↓
Real-time alert
   ↓
Auto-suppression
   ↓
**Critical: M3AAWG / CSA reputation impact**
   ↓
Internal review if pattern emerges
```

### 10.7 GDPR delete

```
Subscriber requests deletion
   ↓
Method A: Admin manual
Method B: API DELETE
Method C: Preference center self-service
   ↓
Mailkit:
- Removes personal data
- Anonymizes events
- Auto-suppression permanent
- **No third-party processors** (simplified GDPR!)
- Audit log entry
- Confirmation email
```

---

## 11. Email lifecycle s vlastní infrastrukturou

```
┌─────────────────────────────────────────────────────────────────┐
│  1. USER drafts campaign / automation email                     │
│     - Audience (lists, segments, Engagement Score)              │
│     - Configure trigger (for automation)                        │
│     - Design + personalize (variables, loops, conditions)       │
│                            │                                    │
│                            ▼                                    │
│  2. PRE-SEND CHECKS                                             │
│     - Sender verified?                                          │
│     - Domain DKIM/SPF/DMARC?                                    │
│     - Audience valid?                                           │
│     - Package limits OK?                                        │
│     - **Engagement Score threshold checks** (if configured)     │
│                            │                                    │
│                            ▼                                    │
│  3. SEND TIME DETERMINATION                                     │
│     - Send now                                                  │
│     - Scheduled                                                 │
│     - Time-zone delivery                                        │
│     - **Engagement-based routing** (high engagers prioritized)  │
│                            │                                    │
│                            ▼                                    │
│  4. PER-RECIPIENT GENERATION                                    │
│     - Variables resolved                                        │
│     - Conditions evaluated                                      │
│     - Loops rendered (product feeds, etc.)                      │
│     - Dynamic content blocks                                    │
│     - AMP content (if applicable)                               │
│     - Tracking pixels embedded                                  │
│     - Click trackers wrapped                                    │
│                            │                                    │
│                            ▼                                    │
│  5. SMTP SEND from MAILKIT OWN INFRASTRUCTURE (Praha)           │
│     - **No cloud, no third-party processors**                   │
│     - Multi-IP pool selection                                   │
│     - **Engagement-based IP routing**                           │
│     - DKIM signed                                               │
│     - SPF compliant                                             │
│     - DMARC aligned                                             │
│     - List-Unsubscribe RFC 8058                                 │
│     - **CSA-whitelisted infrastructure**                        │
│                            │                                    │
│                            ▼                                    │
│  6. ISP RECEIVES                                                │
│     - **Direct ISP relationships** (faster processing)          │
│     - Auth checks                                               │
│     - Reputation check (Mailkit premium rep)                    │
│     - Content filters                                           │
│                            │                                    │
│                            ▼                                    │
│  7. ROUTING                                                     │
│     - **Inbox** (high probability due to reputation)            │
│     - Promotions                                                │
│     - Spam (rare due to Mailkit reputation)                     │
│                            │                                    │
│                            ▼                                    │
│  8. RECIPIENT INTERACTION                                       │
│     - Open → pixel → tracked                                    │
│     - Click → Mailkit redirect → tracked                        │
│     - AMP interactions (if applicable)                          │
│     - Site tracker fires (if integrated)                        │
│                            │                                    │
│                            ▼                                    │
│  9. PROFILE UPDATE                                              │
│     - Engagement metrics                                        │
│     - **Engagement Score recalculation**                        │
│     - Segments re-evaluated                                     │
│     - Workflow triggers fire                                    │
│                            │                                    │
│                            ▼                                    │
│ 10. REPORTING                                                   │
│     - Real-time stats                                           │
│     - Revenue attribution (e-commerce)                          │
│     - Engagement Score dashboards                               │
│     - **Direct ISP feedback integration**                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 12. Automation execution model

### 12.1 Workflow activation

```
Marketer builds automation
   ↓
Test mode (preview as contact)
   ↓
Activate
   ↓
Mailkit validation:
- All triggers configured
- All actions valid
- No broken paths
- Engagement Score conditions valid
   ↓
[Active]
   ↓
Engine evaluates continuously
```

### 12.2 Trigger evaluation

```
Event occurs (subscription, order, tag, Engagement Score threshold, atd.)
   ↓
Mailkit evaluates active workflows
   ↓
For each matching workflow:
- Check entry conditions
- Check re-entry settings
- Add contact to workflow execution
```

### 12.3 Per-contact execution

```
Contact enters at trigger
   ↓
Each node processed sequentially:
- Send email → queue (s vlastní infrastrukturou processing)
- Send SMS → SMS gateway
- Wait → schedule continuation
- Condition → evaluate (incl. Engagement Score)
- Update field → modify contact
- Goal → check if achieved
- Webhook → call external URL
   ↓
Continue until:
- End of workflow
- Goal achieved
- Removed from trigger condition
- Manually removed
```

### 12.4 Engagement Score in automation

```
Workflow can use Engagement Score:

Condition node: Is Engagement Score > 80?
   YES → Send VIP-tier offer
   NO → Send standard offer

Trigger node: Engagement Score crossed threshold
   ↓
Workflow starts (e.g. VIP welcome, or re-engagement)
```

### 12.5 Advanced trigger campaigns

Per testimonial: _"advanced trigger campaign creation"_

- **Multi-condition triggers**
- **Real-time event response**
- **Cross-channel orchestration**
- **Frequency caps** cross-channel
- **Engagement-aware routing**

---

## 13. Engagement Score calculation flow

### 13.1 Engagement Score system

Per oficiální:
_"Our Engagement Score makes establishing and maintaining customer relationships way easier."_

Proprietary scoring system per subscriber.

### 13.2 Scoring factors (typical)

```
Per contact, Mailkit calculates score based on:

Positive factors (+):
- Email opened recently → +X
- Email clicked recently → +Y
- Multiple clicks in sequence → +Z
- SMS clicked → +W
- Site activity (s integrací) → +V
- Order placed → +U

Negative factors (-):
- No opens v 30 days → -X
- No clicks v 60 days → -Y
- Bounced email → -Z (high penalty)
- Spam complaint → -∞ (suppression)
- Marked as junk → -big penalty

Time decay:
- Recent activity weighted higher
- Older activity gradually less weight
- Frequency boosts (consistent engagement)
```

### 13.3 Score calculation flow

```
Per email event:
   ↓
Mailkit captures event (open, click, bounce, etc.)
   ↓
Score calculation engine triggered:
- Retrieve contact's current score
- Apply event weight
- Apply time decay to historical events
- Recalculate composite score
   ↓
Score updated on contact profile
   ↓
Segment membership re-evaluated
   ↓
Workflow triggers fire (if threshold crossed)
```

### 13.4 Score-based segmentation

```
Marketer builds segment:
- "Engagement Score > 80" = VIP segment
- "Engagement Score 40-80" = active mid-tier
- "Engagement Score < 40" = at-risk
- "Engagement Score declined 20+ pts last 30 days" = declining
   ↓
Use v campaigns + automations
```

### 13.5 Use cases

#### Inbox placement optimization

- Send to high engagers first
- Better initial open rates = better ISP reputation
- Suppress low engagers from broad sends

#### Lifecycle management

- Identify customer health trend
- Predict churn risk
- Trigger re-engagement campaigns
- Identify upsell candidates

#### Sender reputation protection

- Avoid sending to consistently disengaged
- Reduces spam complaint risk
- Maintains Mailkit's premium reputation

---

## 14. Dynamic content rendering (variables, loops, conditions)

### 14.1 Per oficiální capabilities

_"Work with variables, loops and conditions."_

### 14.2 Variables

```
Email template:
"Dobrý den, {{firstName}}!"
   ↓
At send time, per recipient:
- Retrieve firstName from contact
- Replace token with actual value
- Default fallback if empty: "vážený zákazníku"
   ↓
Generated email: "Dobrý den, Petr!"
```

### 14.3 Loops

```
Email template:
{% for product in subscriber.cart %}
  <div class="product">
    <img src="{{product.image}}" />
    <h3>{{product.name}}</h3>
    <p>{{product.price}} Kč</p>
    <a href="{{product.checkoutUrl}}">Koupit nyní</a>
  </div>
{% endfor %}
   ↓
At send time:
- Retrieve subscriber's cart from data source
- For each item, render product block
- Combine into final HTML
```

Use cases:

- **Cart contents** (abandonment emails)
- **Order line items** (confirmation emails)
- **Product recommendations** (multiple items)
- **Newsletter article list** (digest emails)
- **Loyalty point history**

### 14.4 Conditions

```
Email template:
{% if subscriber.tier == "VIP" %}
  <div class="vip-section">
    <h2>Exkluzivně pro VIP</h2>
    [VIP content]
  </div>
{% elif subscriber.tier == "Premium" %}
  <div class="premium-section">
    [Premium content]
  </div>
{% else %}
  <div class="standard-section">
    [Standard content]
  </div>
{% endif %}
```

Use cases:

- **Loyalty tier differentiation**
- **Gender-specific content**
- **Geographic targeting**
- **Engagement-based content**
- **B2B vs. B2C content variations**

### 14.5 Combined power

```
Per recipient:
   ↓
Mailkit engine processes:
1. Resolve all variables (custom fields, computed)
2. Evaluate all conditions
3. Render all loops
4. Combine into final HTML
5. Apply AMP markup (if applicable)
6. Embed tracking
   ↓
Per-recipient unique email
   ↓
Send via vlastní infrastruktura
```

---

## 15. AMP for Email flow

### 15.1 AMP for Email

Per oficiální:
_"AMP support integrated directly into the editor"_

AMP for Email = interactive email standard supported by Gmail, Yahoo, Outlook.com.

### 15.2 AMP capabilities enabled

#### Forms inside emails

- Surveys
- Reservations
- Account updates
- All without clicking link

#### Real-time content

- Live pricing
- Inventory status
- Account balance
- Loyalty points

#### Interactive elements

- Carousels
- Tabs / accordions
- Selectors / picklists
- Dynamic galleries

#### Dynamic data

- Live cart contents
- Recent orders
- Personalized recommendations

### 15.3 AMP integration v Mailkit editoru

```
Visual creator:
- Toggle "AMP version" on
- Add AMP-specific blocks:
  - amp-form
  - amp-list (for live data)
  - amp-carousel
  - amp-selector
- Configure endpoints for live data
   ↓
Mailkit handles AMP markup automatically
   ↓
Test AMP version separately
   ↓
Send dual MIME (AMP + HTML fallback)
```

### 15.4 AMP-supported recipients

- Gmail (most users)
- Outlook.com
- Yahoo Mail
- Few other clients

### 15.5 Fallback for non-AMP clients

- **MIME multipart email**
- AMP version for supported clients
- HTML fallback for others
- **No degradation of experience**

### 15.6 Use cases

- **Live order tracking** v emailu
- **In-email reservation forms** (hotels, restaurants)
- **Survey s instant submission**
- **Interactive product browsing**
- **Live discount countdown**

---

## 16. SMS flow

### 16.1 SMS setup

```
Admin: SMS settings
   ↓
Configure:
- Sender ID (country-specific)
- Pre-paid credits
- Default settings (quiet hours)
- STOP keyword
   ↓
[SMS module ready]
```

### 16.2 SMS campaign

```
Campaigns → SMS campaign
   ↓
Configure:
- Sender ID
- Recipients (segment / list)
- Message text (s variables)
- Link tracking
- Schedule
   ↓
Preview + Test
   ↓
Send / Schedule
   ↓
Recipients receive SMS
   ↓
Track delivery + clicks
```

### 16.3 SMS in automation

```
Workflow node "Send SMS":
- Configure message
- Insert tokens
- Multi-channel sequence
   ↓
Per workflow execution:
- Personalize per contact
- Send via SMS gateway
- Track delivery
```

### 16.4 Multi-channel orchestration

```
Cart abandonment example:
- Email first (more detail)
- If no engagement → SMS escalation
- If still no purchase → second SMS final
- Frequency caps cross-channel respected
```

### 16.5 Compliance

- Opt-in required (separate from email!)
- STOP keyword auto-handling
- Quiet hours enforced
- Per-country regulations
- ÚOOÚ compliance (CZ)

---

## 17. Transactional email flow

### 17.1 Transactional setup

```
API credentials for transactional
   ↓
Configure default sender
   ↓
Create templates with variables, loops, conditions
   ↓
[API ready]
```

### 17.2 Transactional send via API

```
Application:
   POST /api/transactional/send
   Headers:
     Authorization: Bearer {api_key}
   Body:
     - to (recipient)
     - template_id
     - variables (merge data)
   ↓
Mailkit:
- Validates auth
- Renders template (variables, loops, conditions)
- AMP markup (if applicable)
- Sends via vlastní infrastruktura
- Tracks delivery, opens, clicks
   ↓
Recipient receives email
   ↓
Logged v contact activity timeline
```

### 17.3 Mailkit transactional advantages

- **Same infrastructure** as marketing (no separate pool)
- **Excellent deliverability** (premium reputation)
- **AMP support** v transactional
- **Loops + conditions** for line items
- **Per-template tracking**
- **Reliable SLA**

### 17.4 Use cases

- Order confirmations s line items (loops!)
- Shipping notifications
- Password resets
- Account verifications
- Receipts s itemized
- Authentication codes
- Payment notifications
- Membership renewals

---

## 18. API-first integration flow

### 18.1 API approach

Mailkit's preferred integration model is **API-first**, not plugin-based.

Per testimonial:
_"easy to connect our internal system via API, which was helped by very detailed and well written documentation"_

### 18.2 API credentials creation

```
Admin: API → New credentials
   ↓
Generate API key
   ↓
Name + scope
   ↓
**Key displayed** – copy + secure
   ↓
Configure granular permissions:
- Per endpoint
- Read vs. write
- Rate limits per tier
   ↓
[API key active]
```

### 18.3 API request flow

```
Application:
   POST https://api.mailkit.eu/v1/[endpoint]
   Headers:
     Authorization: Bearer {api_key}
     Content-Type: application/json
   Body: { data }
   ↓
Mailkit:
- Validates auth
- Rate limit check
- Permission validation
- Validates payload
   ↓
Response 200/201
   ↓
Action performed
```

### 18.4 Custom integration projects

For complex integrations:

```
Client identifies integration need
   ↓
Discovery s Mailkit implementation team:
- Data flow architecture
- Endpoint requirements
- Authentication
- Frequency / volume
- Error handling
- Monitoring
   ↓
Custom development project:
- Client dev team OR
- Mailkit implementation team
- Mailkit provides API support
   ↓
Testing phase:
- Sandbox / test environment
- End-to-end test
- Load test
   ↓
Production cutover
   ↓
Monitoring + maintenance
```

### 18.5 Common integration patterns

#### CRM integration

- Real-time contact sync (CRM → Mailkit)
- Engagement events sync (Mailkit → CRM)
- Custom fields mapping
- Lifecycle stage updates

#### E-commerce integration

- Customer create/update sync
- Order events real-time
- Cart abandonment events
- Product catalog sync
- Revenue attribution

#### ERP integration

- Customer data master
- Transactional events
- Inventory data
- Custom event triggers

#### Custom data warehouses

- Daily/hourly batch sync
- Custom fields population
- Segment-feeding queries

### 18.6 Webhooks

```
Admin: Webhooks → Add new
   ↓
Configure:
- Target URL
- Events subscribed (multi-select):
  - Subscriber events (create, update, unsubscribe)
  - Campaign events (sent, open, click)
  - Order events (s integrací)
  - Form submissions
  - Engagement Score changes
- Signature verification (HMAC)
   ↓
Mailkit POSTs on each event
   ↓
External app processes
```

### 18.7 SFTP integration

```
For bulk operations:
- SFTP credentials provided
- Scheduled imports (e.g. daily customer data)
- Scheduled exports (e.g. engagement reports)
- Automated workflows
```

---

## 19. Data sources flow

Per oficiální:
_"Interconnect using the API or data sources."_

### 19.1 Data source vs. API

- **API:** application-to-application, real-time
- **Data sources:** Mailkit pulling data from external system, scheduled

### 19.2 Data source types

#### Direct database connections

- MySQL, PostgreSQL, SQL Server, Oracle
- Configured by Mailkit
- Scheduled sync
- Mapping defined

#### File-based (SFTP)

- CSV files placed on SFTP
- Mailkit pulls automatically
- Field mapping
- Schedule (daily, hourly)

#### Custom API polling

- Mailkit calls external API
- Schedule-based
- Updates / inserts contacts

### 19.3 Data source configuration

```
Admin: Data sources → New
   ↓
Configure:
- Source type (DB, SFTP, API)
- Connection details
- Authentication
- Field mapping (source → Mailkit fields)
- Sync schedule
- Conflict resolution (update vs. skip)
- GDPR consent handling
- Error notification
   ↓
Test sync
   ↓
Activate
   ↓
[Data flows automatically]
```

### 19.4 Use cases

- **Daily customer data refresh** from CRM
- **Order history nightly sync**
- **Product catalog updates**
- **Loyalty points / status updates**
- **Behavioral data feeds**

---

## 20. Deliverability flow (vlastní infra)

### 20.1 Vlastní infrastructure advantage

```
Email send request:
   ↓
Mailkit routing engine:
- Receive email
- **Vlastní MTA processing**
- Multi-IP pool selection
- Engagement-based routing
   ↓
**Direct ISP transmission:**
- Direct relationships s Seznam.cz
- Direct relationships s major EU ISPs
- CSA-whitelisted by major German ISPs
- M3AAWG best practices
   ↓
ISP processing:
- Faster pipeline (direct routing)
- Better reputation visibility
- Real-time feedback loops
   ↓
Inbox placement (high probability)
```

### 20.2 Reputation management

```
Continuous monitoring:
- Per-IP reputation scores
- Per-domain reputation
- Inbox placement rates
- ISP feedback
- Spam complaint rates
- Bounce rates
- Engagement-based metrics
   ↓
Mailkit deliverability team:
- Daily reputation review
- Investigates any anomalies
- Proactive issue resolution
- Strategic optimization
   ↓
Customer notifications:
- Reputation alerts to clients (if needed)
- Recommendations for improvement
- Strategic deliverability advice
```

### 20.3 Engagement-based routing

```
Per send:
- High engagers → premium IP pool
- Mid engagers → standard pool
- Low engagers → cautious pool (or suppressed)
   ↓
Reputation protected:
- Best engagers get best IP reputation
- Reputation reinforced positively
- Low engagers don't degrade premium IPs
```

### 20.4 CSA membership benefits

- **German major ISPs whitelisting**:
  - web.de
  - GMX
  - T-Online
  - 1&1
  - others
- Pre-defined inbox placement
- Continuous monitoring required by CSA
- Premium positioning maintained

### 20.5 M3AAWG involvement

- Industry intelligence sharing
- Anti-abuse best practices
- Multi-stakeholder collaboration
- Trust signals across industry

### 20.6 Authentication enforcement

```
Domain authentication mandatory:
- SPF (include for Mailkit)
- DKIM (CNAME records)
- DMARC (TXT record, policy: p=reject recommended)
- Branded tracking domain (CNAME)
- BIMI (advanced)
   ↓
Mailkit validates all before sending
   ↓
Strong authentication = better deliverability
```

### 20.7 List hygiene flow

```
Continuous monitoring:
- Hard bounces → auto-suppression
- Soft bounces → tracking + retry
- Spam complaints → immediate suppression + investigation
- Engagement Score declining → at-risk flag
- Long-term inactive → recommend re-engagement / suppression
   ↓
Recommendations to clients:
- Re-engage at-risk subscribers
- Suppress unrecoverable
- Maintain sender reputation
```

---

## 21. Compliance + ISO audits flow

### 21.1 ISO certification maintenance

```
Annual recertification cycle:
- External auditor engaged
- Audit prep (3 months prior)
- On-site / remote audit
- Findings + remediation
- Certificate renewed
   ↓
For each of 7 ISO standards
   ↓
Continuous compliance maintained
```

### 21.2 GDPR compliance flow

```
Per oficiální (vlastní infra):
"We do not share your data with anyone, there are no other processors,
and therefore our clients have certainty that no mistake can be made."
   ↓
Simplified GDPR compliance:
- No sub-processors agreements needed
- No cross-border transfers
- No US adequacy issues
- Direct DPA with client
   ↓
Compliance audit advantages:
- Simpler data flow diagrams
- Single processor chain
- Predictable jurisdiction
- Lower compliance overhead
```

### 21.3 Per-client compliance

```
Client DPA setup:
- Standard DPA template
- Custom clauses (per industry)
- Sub-processors list (Mailkit only)
- Sign-off
   ↓
Annual reviews:
- DPA refresh
- Compliance attestation
- Audit support (if client audits Mailkit)
   ↓
Industry-specific compliance:
- Banking: provide additional attestations
- Healthcare: HIPAA-aligned (via ISO 27701)
- Government: enhanced security review
```

### 21.4 ISO 27001 audits

```
Annual cycle:
- Internal audits (multiple)
- Management review
- External certification audit
- Continuous improvement
   ↓
Audit findings tracked
   ↓
Remediation actions
   ↓
Certificate renewed
```

### 21.5 Right to Be Forgotten

```
Subscriber requests deletion
   ↓
Method A: Admin manual
Method B: API DELETE
Method C: Preference center self-service
   ↓
Mailkit processes:
- Removes personal data
- Anonymizes events
- Auto-suppression
- Audit log entry (compliance)
- Confirmation email
- **No sub-processors to notify** (simplified)
```

### 21.6 DSAR (Data Subject Access Request)

```
Subscriber requests data
   ↓
Admin: Generate GDPR export
   ↓
Mailkit produces:
- Profile data
- Activity events
- Communication history
- Consent records
- Engagement Score history
   ↓
Provide to subscriber (30 days max per GDPR)
```

---

## 22. Datová mapa: co vidí kdo

| Data                       | L1 Owner | L2 Admin  | L3 Marketing | L4 Reporter |  Subscriber   |    API    | Account Mgr |
| -------------------------- | :------: | :-------: | :----------: | :---------: | :-----------: | :-------: | :---------: |
| Master account settings    |    ✅    |    ❌     |      ❌      |     ❌      |      ❌       | per scope |    read     |
| Billing                    |    ✅    |    ❌     |      ❌      |     ❌      |      ❌       | per scope |    read     |
| Sub-account creation       |    ✅    |    ❌     |      ❌      |     ❌      |      ❌       | per scope |    read     |
| Sub-account settings       |    ✅    |    ✅     |      ❌      |     ❌      |      ❌       | per scope |    read     |
| Cross-account view         |    ✅    | per scope |      ❌      |  per scope  |      ❌       | per scope |    read     |
| User management (master)   |    ✅    |    ❌     |      ❌      |     ❌      |      ❌       | per scope |    read     |
| User management (sub)      |    ✅    |    ✅     |      ❌      |     ❌      |      ❌       | per scope |    read     |
| All contacts (per scope)   |    ✅    |    ✅     |      ✅      |    view     |   jen sebe    |    ✅     |    read     |
| Edit contacts              |    ✅    |    ✅     |      ✅      |     ❌      |      ❌       |    ✅     |     ❌      |
| Export contacts            |    ✅    |    ✅     |   per role   |     ❌      |    request    | per scope |     ❌      |
| GDPR delete                |    ✅    |    ✅     |   per role   |     ❌      |    request    | per scope |     ❌      |
| Lists / Segments           |    ✅    |    ✅     |      ✅      |    view     |       –       |    ✅     |    read     |
| Tags                       |    ✅    |    ✅     |      ✅      |    view     |       –       |    ✅     |    read     |
| Campaigns                  |    ✅    |    ✅     |      ✅      |    view     | jen co dostal |    ✅     |    read     |
| Send campaigns             |    ✅    |    ✅     |      ✅      |     ❌      |      ❌       |    ✅     |     ❌      |
| Automations                |    ✅    |    ✅     |      ✅      |    view     |      ❌       |    ✅     |    read     |
| Templates                  |    ✅    |    ✅     |      ✅      |    view     |       –       |    ✅     |    read     |
| Visual creator             |    ✅    |    ✅     |      ✅      |    view     |       –       | per scope |    read     |
| AMP support                |    ✅    |    ✅     |      ✅      |    view     | (interactive) | per scope |    read     |
| Variables/loops/conditions |    ✅    |    ✅     |      ✅      |    view     |       –       | per scope |    read     |
| Engagement Score           |    ✅    |    ✅     |      ✅      |     ✅      |      ❌       |    ✅     |    read     |
| Configure scoring          |    ✅    |    ✅     |      ❌      |     ❌      |      ❌       | per scope |    read     |
| SMS module                 |    ✅    |    ✅     |      ✅      |     ❌      |       –       | per scope |    read     |
| SMS credits                |    ✅    |    ✅     |     view     |     ❌      |       –       | per scope |    read     |
| Transactional              |    ✅    |    ✅     |   per role   |     ❌      |       –       |    ✅     |    read     |
| Reports                    |    ✅    |    ✅     |      ✅      |     ✅      |      ❌       |    ✅     |    read     |
| Cross-account reports      |    ✅    | per scope |      ❌      |  per scope  |      ❌       | per scope |    read     |
| Integrations               |    ✅    |    ✅     |      ❌      |     ❌      |      ❌       | per scope |    read     |
| API keys                   |    ✅    |    ✅     |      ❌      |     ❌      |      ❌       |     –     |    read     |
| Data sources               |    ✅    |    ✅     |      ❌      |     ❌      |      ❌       | per scope |    read     |
| Domains                    |    ✅    |    ✅     |      ❌      |     ❌      |      ❌       | per scope |    read     |
| Audit logs                 |    ✅    |    ✅     |      ❌      |  per role   |      ❌       | per scope |    read     |
| ISO certificates           |    ✅    |   view    |     view     |    view     |       –       |     –     |    read     |

---

## 23. Známé úzkoprofilové místa

### 23.1 Accessibility

- **No self-serve sign-up** – qualification + sales required
- **No public pricing** (vs. competitors transparent)
- **Selektivní klientela** – Mailkit may decline
- **Premium pricing** – out of reach pro SMB
- **Long sales cycle** (2-3 měsíce typical)
- **Custom contract** required

### 23.2 Less out-of-box integrations

- **Fewer native plugins** vs. competitors (Mailchimp, Klaviyo, ActiveCampaign)
- **No native Shopify plugin** (per current state)
- **No native Shoptet plugin** (per current state – interesting given CZ origin)
- **No native WordPress plugin** prominently advertised
- **API-first approach** = development required
- **Less plug-and-play** experience
- Heavy reliance on **custom integration projects**

### 23.3 UI/UX

- **More technical interface** vs. Mailchimp/MailerLite
- **Less modern visual design**
- **Steeper learning curve**
- **Aimed at professional users** (not solopreneurs)
- **Mobile experience limited**
- **Less how-to videos** / tutorials than competitors

### 23.4 Implementation complexity

- **2-6 months typical implementation** for enterprise
- **API integration required** for most clients
- **Multi-stakeholder onboarding** (IT, marketing, compliance)
- **Custom configurations** standard
- **Not "ready in 5 minutes"**

### 23.5 Pricing complexity

- **Custom quote per klient**
- **Add-ons** stack (SMS, dedicated IP, custom integrations)
- **Sub-account costs** scale
- **Less transparency**

### 23.6 No deep CRM

- **No deals/pipelines** (vs. ActiveCampaign, HubSpot)
- **Contact-centric** approach
- **B2B sales features limited**
- Companies need separate CRM

### 23.7 No deep e-commerce features

- **No native Shopify** (per current state)
- **No native Shoptet** (per current state)
- **No automatic product recommendations ML**
- **No predictive CLV/churn**
- **No automatic RFM cohorts**
- **Custom integration** required pro deep e-commerce

### 23.8 Limited form / landing page builder

- **Form builder limited** vs. competitors
- **No native landing page builder** (per current state)
- **Heavy custom dev** required pro lead gen

### 23.9 No autonomous AI / generative AI

- **No generative AI for content** (vs. ActiveCampaign Active Intelligence)
- **No AI subject line generation**
- **No predictive sending AI per recipient**
- **No autonomous agents** (vs. Klaviyo Customer Agent)
- **Engagement Score is rule-based** (sophisticated but not deep ML)
- **AI roadmap behind** competitors v 2026

### 23.10 No webinars / courses / paid newsletters

- **No webinars built-in** (vs. GetResponse)
- **No online courses**
- **No paid newsletter** subscription
- **No digital products** sale

### 23.11 Templates count vs. expectations

- **300+ templates** is decent, ale:
- Mailchimp 1000+
- Klaviyo customizable
- ActiveCampaign large library
- Mailkit positions on quality over quantity

### 23.12 International scaling

- **Strong v CZ + EU**
- **Less US presence**
- **Less Asia/Pacific presence**
- **Czech-first orientation** (helpdesk EN + CZ only)

### 23.13 No agency commission program

- **Sub-accounts available** (agency model supported)
- **But no formal commission** per new customer (vs. Ecomail's commission)
- **Agency relationship per contract**

### 23.14 Documentation marketing content

- **Documentation good** for API (per testimonial)
- **Less blog content / how-to videos** than competitors
- **Less marketing collateral**
- **Less SEO-optimized content**

### 23.15 Migration tools

- **Mostly manual migration**
- **Custom dev required** pro re-implementation
- **Templates rebuild** required
- **Automations** must be re-built

### 23.16 No agency commission

- **Sub-accounts available** but no commission program

---

## 24. Doporučení pro design vlastních procesů

Pokud Mailkit používáte v týmu, doporučujeme:

1. **Domain authentication day 1** – DKIM + SPF + DMARC + branded tracking
2. **4 levels access rights** – plan structure upfront, no overlapping responsibilities
3. **Sub-account architektura** – plan per business unit / market / brand upfront
4. **Dedicated Service Account** pro API integrace (ne osobní users)
5. **API documentation** – distribute to dev team
6. **Engagement Score config** – calibrate s historical data
7. **Brand kit consistent** napříč sub-accounts
8. **Templates library** – build reusable masters
9. **Loops + conditions strategy** – plan personalization upfront
10. **AMP exploration** – pilot one AMP campaign before broad use
11. **Compliance documentation** – leverage ISO certificates for client trust
12. **Account Manager partnership** – využívat strategicky
13. **Quarterly Business Review** – monitor performance + roadmap
14. **List hygiene continuous** – maintain premium reputation
15. **Engagement-based routing** – let Mailkit optimize
16. **Custom integrations** – plan thoroughly, budget appropriately
17. **Data sources** – consider for high-volume sync needs
18. **Annual ISO audit** – participate, leverage for client trust
19. **DSAR + Right to Be Forgotten** processes documented
20. **Migration plan** – periodic export of contacts + key configurations
21. **Multi-market strategy** – sub-account per market
22. **Agency model** (if applicable) – plan client onboarding standardized
23. **Mailkit helpdesk** – use proactively (EN + CZ)

---

_Dokument zpracován z oficiálních zdrojů mailkit.com a praktických zdrojů (G2, SMTPedia, Crunchbase, Email Vendor Selection, customer testimonials). Pro nejaktuálnější detaily je nutný engagement s Mailkit sales / account management teamem._
