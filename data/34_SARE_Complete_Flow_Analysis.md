# SARE – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v SARE prochází data, lidé a akce – od free trial signup přes Digitree Group ekosystém, ML-driven Channel Scoring, omnichannel orchestration, až po koncového subscribera.

> Tento dokument doplňuje `33_SARE_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** SARE umí, tento popisuje, **kdo s tím interaguje a jak data tečou**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
> - **Polský produkt z Warszawy** – email marketing leader v Polsku
> - **Součást Digitree Group** – parent company synergies
> - **Annual revenue $12.4M v 2026**
> - **Klienti od 2009+** (long-term industry presence)
> - **Channel Scoring (UNIKÁTNÍ)** – ML-driven channel assessment
> - **CDP & database management** integrated
> - **Omnichannel native** (email + SMS + web push + surveys)
> - **Secure SMTP** pro transactional + marketing
> - **Dedicated Client Service consultant** per klient
> - **Industry research + reports publishing** (thought leadership)
> - **Enterprise features:** SSO, permissions, audits, SLA, regulatory compliance
> - **Shoper integration** (Polish e-commerce platform - UNIQUE)
> - **A/B/X testing** s automatic winner selection
> - **Polish + English UI** (Polish primary)
> - **Free trial available** (no credit card)
> - **No public pricing** – sales-driven custom quotes
> - **Polish RODO + UODO compliance** native

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Sales & qualification flow](#2-sales-flow)
3. [Free trial signup flow](#3-trial-flow)
4. [Onboarding flow](#4-onboarding-flow)
5. [Dedicated Client Service consultant flow](#5-consultant-flow)
6. [User roles & permissions](#6-user-roles)
7. [Account Owner flow](#7-account-owner-flow)
8. [Marketing user flow](#8-marketing-user-flow)
9. [Analyst flow (CDP + BI focus)](#9-analyst-flow)
10. [Recipient lifecycle](#10-recipient-lifecycle)
11. [Email lifecycle s Polish ISP optimization](#11-email-lifecycle)
12. [Marketing automation execution (scenarios + paths)](#12-automation-execution)
13. [Channel Scoring flow (UNIKÁTNÍ)](#13-channel-scoring-flow)
14. [Omnichannel orchestration flow](#14-omnichannel-flow)
15. [CDP data ingestion flow](#15-cdp-flow)
16. [A/B/X testing flow (auto-winner)](#16-ab-testing-flow)
17. [Surveys flow](#17-surveys-flow)
18. [Abandoned cart + product page flow](#18-cart-flow)
19. [Recurring messages flow](#19-recurring-flow)
20. [API & Integration flow](#20-integration-flow)
21. [Secure SMTP flow (transactional)](#21-smtp-flow)
22. [Enterprise compliance flow (SSO, audits, SLA)](#22-enterprise-flow)
23. [Industry research + reports flow (thought leadership)](#23-research-flow)
24. [RODO/GDPR compliance flow](#24-rodo-flow)
25. [Datová mapa: co vidí kdo](#25-datová-mapa)
26. [Známé úzkoprofilové místa](#26-úzkoprofilové-místa)

---

## 1. Mapa všech aktérů

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│         SARE PLATFORM ECOSYSTEM (Part of Digitree Group)           │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [Digitree Group (parent)]                                         │
│   ├─ Digital campaigns expertise                                   │
│   ├─ Own technology + tools                                        │
│   ├─ Unique data + research                                        │
│   └─ Specialists ecosystem                                         │
│           │                                                        │
│           ▼                                                        │
│  [SARE S.A. (Warszawa, Polsko)]                                    │
│   ├─ Sales team (Polish primary)                                   │
│   ├─ Customer Success / Client Service team                        │
│   ├─ Dedicated consultants (per klient!)                           │
│   ├─ Technical Support                                             │
│   ├─ Research + Reports team                                       │
│   ├─ Engineering / Product team                                    │
│   ├─ Deliverability team (Polish ISP relationships)                │
│   ├─ Compliance team (RODO + Polish banking)                       │
│   └─ Enterprise support team                                       │
│           │                                                        │
│           ▼                                                        │
│                                                                    │
│   ┌──────────────────────────────────────────┐                     │
│   │   SAREsystem Account                     │                     │
│   │                                          │                     │
│   │   USER ROLES (typical):                  │                     │
│   │   ├─ Account Owner                       │◄── full access      │
│   │   ├─ Administrator                       │◄── operational lead │
│   │   ├─ Marketing user                      │◄── daily tasks      │
│   │   ├─ Designer / Editor                   │◄── content only     │
│   │   ├─ Analyst / Data user                 │◄── CDP + reports    │
│   │   ├─ Read-only / Viewer                  │◄── reports only     │
│   │   ├─ Enterprise SSO users                │◄── per IdP role     │
│   │   └─ Custom roles per business           │◄── granular perms   │
│   │                                          │                     │
│   │   + Dedicated Client Service consultant  │                     │
│   │     per klient (consultative approach)   │                     │
│   └──────────────┬───────────────────────────┘                     │
│                  │                                                 │
│                  ▼                                                 │
│   [Recipients / Subscribers v CDP databases]                       │
│       │                                                            │
│       ├─→ Receive email campaigns                                  │
│       ├─→ Receive SMS messages                                     │
│       ├─→ Receive web push notifications                           │
│       ├─→ Complete surveys / questionnaires                        │
│       ├─→ Receive transactional emails (via secure SMTP)           │
│       ├─→ Channel Scoring continuous evaluation                    │
│       └─→ Preference management                                    │
│                  │                                                 │
│                  ▼                                                 │
│   [Integrations]                                                   │
│   ┌──────────────────────────────────────────┐                     │
│   │   E-commerce (Polish-friendly!):         │                     │
│   │   - Shoper (POLISH e-commerce platform)  │                     │
│   │   - Shopify                              │                     │
│   │   - WooCommerce (WordPress)              │                     │
│   │   - PrestaShop                           │                     │
│   │                                          │                     │
│   │   Analytics:                             │                     │
│   │   - Google Analytics 360                 │                     │
│   │                                          │                     │
│   │   Social:                                │                     │
│   │   - Facebook Apps and Tabs               │                     │
│   │                                          │                     │
│   │   CMS:                                   │                     │
│   │   - WordPress                            │                     │
│   │                                          │                     │
│   │   iPaaS:                                 │                     │
│   │   - Zapier (5000+ apps)                  │                     │
│   │                                          │                     │
│   │   API + Webhooks (extensive!)            │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
│   [Channels (Omnichannel)]                                         │
│   ┌──────────────────────────────────────────┐                     │
│   │   Email (primary channel)                │                     │
│   │   SMS                                    │                     │
│   │   Web Push notifications                 │                     │
│   │   Surveys / Questionnaires               │                     │
│   │   Secure SMTP (transactional)            │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
│   [Polish ISP relationships]                                       │
│   ┌──────────────────────────────────────────┐                     │
│   │   - WP.pl                                │                     │
│   │   - Onet.pl                              │                     │
│   │   - Interia.pl                           │                     │
│   │   - International ISPs (Gmail, etc.)     │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
│   [Polish Research + Reports]                                      │
│   ┌──────────────────────────────────────────┐                     │
│   │   Industry research publishing           │                     │
│   │   Consumer behavior studies              │                     │
│   │   Marketing communication reports        │                     │
│   │   Polish market data                     │                     │
│   │   Educational materials                  │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér | Vstupní bod | Co dělá | Co vidí |
|---|---|---|---|
| **Account Owner** | Contract signing | Full + billing + users | Vše |
| **Administrator** | Pozvánka od Owner | Operational lead + user mgmt | Per scope |
| **Marketing user** | Pozvánka | Daily marketing tasks | Per permissions |
| **Designer / Editor** | Pozvánka | Content + templates | Per role |
| **Analyst / Data user** | Pozvánka | CDP + reports + BI | Read + segment build |
| **Read-only / Viewer** | Pozvánka | View reports only | Read-only |
| **Enterprise SSO user** | IdP login | Per IdP role | Per assigned |
| **Recipient / Subscriber** | Form, integration | Receives multi-channel | Své emaily / messages |
| **Dedicated Consultant** | Assigned at signup | Strategy + support | Read s consent |
| **SARE Client Service** | Per-klient touchpoint | Daily operational help | Read s consent |
| **SARE Sales** | Inquiry contact | Upgrades + new contracts | Read s consent |
| **SARE Research team** | External | Publishes reports | – |
| **API Client** | API key | Custom integration | Per scope |
| **Shoper integration** | Native | E-commerce sync | Per integration scope |
| **Shopify integration** | OAuth | E-commerce sync | Per integration scope |
| **Zapier connection** | OAuth | iPaaS workflows | Per Zap scope |

---

## 2. Sales & qualification flow

### 2.1 Lead acquisition

```
Lead sources:
- sare.pl inbound (contact form, free trial)
- Industry events (Polish marketing conferences)
- Research / reports authority (SARE published reports)
- Partner referrals (Digitree Group)
- Polish industry community
- Outbound prospecting (mid-market+)
- Word-of-mouth (long-term clients)
```

### 2.2 Initial inquiry flow

```
Prospect contacts SARE via:
- sare.pl form
- Phone call
- Email
- Free trial signup
   ↓
SARE Sales responds (typically 1-2 business days)
   ↓
**Discovery call (Polish/English):**
- Business type
- Industry vertical (banking? e-commerce? B2B?)
- Polish market focus?
- Contact database size
- Email volume needs
- Channel requirements (email only? omnichannel?)
- Current ESP (migration source)
- Compliance requirements (RODO, KNF, banking)
- Budget range
- Timeline
- Decision-making process
   ↓
**Qualification:**
- Mid-market+ fit
- Polish market focus
- Budget compatibility
- Enterprise features needed?
- Implementation timeline realistic?
```

### 2.3 Qualification criteria

SARE targets:
- **Polish mid-market + enterprise**
- **B2C + B2B both**
- **Email volume:** 10K+ monthly emails typically
- **Database size:** 10K+ contacts
- **Multi-channel needs** often
- **Compliance-conscious** (banking, finance, healthcare)
- **Polish market focus** primary

### 2.4 Demo + workshop

```
Demo 1 (60-90 min):
- SAREsystem platform walkthrough
- Industry-specific use cases
- Channel Scoring demonstration
- Reference customer stories (VB Leasing, Polish Stem Cell Bank)
- ROI examples
- Q&A
   ↓
Technical deep dive:
- API capabilities
- Integration architecture
- E-commerce platform integration
- Compliance review
- Security architecture (enterprise)
- SSO integration (if applicable)
   ↓
Use case workshop:
- Map current customer journeys
- Identify automation opportunities
- Design Channel Scoring strategy
- ROI projection
```

### 2.5 Free trial activation

```
After demo:
- Free trial activated (no credit card!)
- Sandbox environment
- Limited features
- Time-limited (typically 14-30 days)
- Dedicated trial consultant
   ↓
Trial usage:
- Test platform v vlastním use case
- Build test campaign
- Test automation
- Review reports
   ↓
Conversion conversation:
- Trial outcomes review
- Pricing proposal
- Implementation plan
```

### 2.6 Custom proposal generation

```
SARE prepares custom proposal:
- SAREsystem tier recommendation
- Number of contacts pricing
- Email volume tier
- Channel modules (SMS, web push, surveys)
- Integration scope
- Implementation services
- Training scope
- Dedicated consultant assignment
- Enterprise features (if applicable)
- Custom contract terms
   ↓
Proposal sent
   ↓
Negotiation:
- Pricing flexibility
- Add-ons
- Multi-year commitment
- SLA terms
- Custom integrations
```

### 2.7 Contract signing

```
Contract documents:
- Master Service Agreement
- DPA (RODO compliant, in Polish)
- SLA (per tier)
- Statement of Work (implementation)
- Custom integration SOW (if applicable)
   ↓
Signed (electronic or in-person)
   ↓
[Project kickoff scheduled]
   ↓
Dedicated Client Service consultant assigned
```

---

## 3. Free trial signup flow

### 3.1 Self-serve trial signup

Per GetApp:
> *"Free Trial: Available (No Credit Card required)"*

```
Visit sare.pl
   ↓
"Bezpłatny test" / "Free trial" button
   ↓
Signup form:
- Email
- Name
- Company name
- Phone (often required)
- Country
- Language preference (Polish/English)
   ↓
**NO credit card required**
   ↓
Email verification
   ↓
Account created
   ↓
**Sales follow-up immediately** (within hours)
   ↓
Dedicated trial consultant introduces
   ↓
Onboarding wizard
```

### 3.2 Trial features

- **Limited time** (typically 14-30 days)
- **Limited recipients** (test database)
- **Limited email volume**
- **Core features available** for testing
- **Limited automation depth**
- **Trial branding** in emails (typical)

### 3.3 Trial limitations

- **Cannot fully evaluate** without sales engagement
- **Sandbox environment** typical
- **Limited integrations** during trial
- **Limited support** vs. paid customers

### 3.4 Trial-to-paid conversion

```
Trial end approaches
   ↓
Sales consultant contacts:
- Trial outcomes discussion
- Use case validation
- Custom proposal
- Pricing offer
- Implementation plan
   ↓
Decision:
- Convert to paid plan
- Extend trial
- Decline
   ↓
If converting:
- Contract signing
- Onboarding kickoff
```

---

## 4. Onboarding flow

### 4.1 Project kickoff (Week 1)

```
Contract signed
   ↓
**SARE assigns:**
- Dedicated Client Service consultant
- Implementation specialist
- Technical support contact
- Deliverability advisor
- Compliance contact (if enterprise)
   ↓
**Client side:**
- Project sponsor
- Marketing lead
- IT lead
- Compliance/Legal (Polish banking/finance)
   ↓
**Kickoff workshop (1-2 days):**
- Introductions across teams
- Goals + KPIs alignment
- Project plan walkthrough
- Communication cadence
- Risk identification
- Success criteria
```

### 4.2 Setup phase (Week 1-3)

```
Account provisioning:
- SARE creates account
- Master Admin credentials
- User roles configured
- Brand kit setup
   ↓
Domain authentication:
- DKIM records configured
- SPF records updated
- DMARC policy defined
- Branded tracking domain (CNAME)
   ↓
Verification:
- SARE validates DNS
- Test sends from each domain
- Polish ISP relationships activated
```

### 4.3 Integration phase (Week 2-6)

```
E-commerce integration (if applicable):
- Shoper (Polish e-shop)
- Shopify
- WooCommerce
- PrestaShop
- API configuration
- Tracking script installation
- Webhook setup
- Test sync
   ↓
CRM integration (if applicable):
- Salesforce / HubSpot via API/Zapier
- Custom CRM
- Bi-directional sync
   ↓
Analytics integration:
- Google Analytics 360
- Conversion tracking
   ↓
Custom integrations (via API):
- ERP, custom systems
- Polish banking systems
- Custom dev as needed
```

### 4.4 CDP setup (Week 3-6)

```
Database design:
- Custom fields schema
- Tag taxonomy
- Segment definitions
- Lifecycle stages
- Channel Scoring config
   ↓
Historical data migration:
- Existing contacts import
- Order history (if e-commerce)
- Engagement history (if available)
- Custom field population
- GDPR consent confirmation
   ↓
Data validation:
- Sample profiles review
- Segment testing
- Consent audit
```

### 4.5 Templates + brand kit (Week 4-8)

```
Brand kit setup:
- Colors, fonts, logos
- Email defaults (header, footer)
- Brand consistency rules
   ↓
Master templates designed:
- Newsletter template
- Promotional template
- Transactional templates
- Welcome series templates
- Industry-specific templates
- Component library populated
```

### 4.6 Automation setup (Week 6-10)

```
Workflow design workshops:
- Welcome series
- Cart abandonment
- Browse abandonment
- Post-purchase
- Re-engagement
- Birthday / anniversary
- Lifecycle stages
- Channel Scoring integration
   ↓
Build workflows in SARE:
- Drag-drop builder
- Configure triggers
- Set conditions / branches
- Configure goals
- Test thoroughly
   ↓
Channel Scoring activation:
- ML model setup
- Initial scoring
- Calibrate with historical data
```

### 4.7 Training (Week 8-12)

```
Multi-track training:

Track 1: Marketing team
- Platform basics
- Campaign creation
- Segmentation
- Workflow management
- Reports interpretation

Track 2: Advanced users
- CDP deep dive
- Channel Scoring usage
- Advanced segmentation
- A/B/X testing
- BI dashboards

Track 3: Analytics team
- Reports + dashboards
- Custom reports
- Data export
- ROI tracking
- BI features

Track 4: Admins
- User management
- Enterprise SSO setup
- Security
- API access
- Permissions
```

### 4.8 Go-live (Week 10-14)

```
Pre-launch QA:
- All workflows tested end-to-end
- Domain authentication verified
- Integration tested
- Compliance review
- Channel Scoring active
   ↓
Soft launch:
- Limited audience (10-20%)
- Daily monitoring
- Channel Scoring evaluation
   ↓
Full launch:
- 100% audience activated
- Continuous monitoring
   ↓
**Hypercare period (4-6 weeks):**
- Daily check-ins with consultant
- Performance optimization
- Quick bug fixes
- Channel Scoring refinement
```

### 4.9 Transition to BAU

```
Post-launch:
- Dedicated consultant monthly cadence
- Quarterly Business Review (QBR)
- Performance optimization
- New feature adoption
- Industry research insights shared
   ↓
Annual strategic review:
- Roadmap alignment
- New use cases
- Expansion opportunities
- Contract renewal
```

---

## 5. Dedicated Client Service consultant flow

### 5.1 Why dedicated consultant matters

Per Polish Stem Cell Bank reference:
> *"We highly value the quality of customer service, and our dedicated consultant reliably supports us in our daily work with the system. They are always willing to share their knowledge, so we can say that the SARE system is a professional tool backed by the substantive expertise of its staff."*

Per VB Leasing reference:
> *"the invaluable assistance of the Client Service team"*

**Consultative approach is KEY differentiator** of SARE.

### 5.2 Consultant responsibilities

```
Per klient, dedicated consultant:
- Day-to-day operational support
- Strategic guidance
- Knowledge sharing
- Best practices recommendations
- Industry insights
- Campaign optimization advice
- Channel Scoring tuning
- Troubleshooting
- Training reinforcement
- Quarterly Business Reviews (QBR)
```

### 5.3 Consultant interaction flow

```
Client has question / needs help
   ↓
Multiple contact options:
- Email consultant directly
- Phone consultant
- Schedule call
- Slack/Teams if configured
   ↓
Consultant responds (typically within hours)
   ↓
Resolution options:
- Quick answer
- Detailed guidance
- Schedule strategy session
- Escalate to technical team
- Industry research insight
   ↓
[Issue resolved + knowledge transfer]
```

### 5.4 Quarterly Business Reviews (QBR)

```
Quarterly review with dedicated consultant:
- Performance vs. goals
- Campaign analysis
- Channel Scoring effectiveness
- New use case opportunities
- Industry trends + research
- Roadmap discussions
- Next quarter planning
   ↓
Strategic alignment maintained
```

### 5.5 Consultant value proposition

**Beyond tool support:**
- **Industry expertise** sharing
- **Strategic guidance**
- **Research authority** (SARE publishes industry reports)
- **Network effects** (consultant learns from multiple clients)
- **Polish market insights** unique
- **Continuous education**

---

## 6. User roles & permissions

### 6.1 Default roles (typical)

#### Account Owner
- **Highest tier** access
- **Created during contract setup**
- Full administrative control
- Billing access
- User management
- All settings
- Close account

#### Administrator
- **Full operational** access
- User management within scope
- Integration management
- Configuration
- Cannot manage billing typically

#### Marketing user
- **Daily marketing** tasks
- Campaigns + automation + segments
- Content creation
- Reports
- No user management
- No billing

#### Designer / Editor
- **Content focused**
- Templates + design
- Limited recipient data
- No send permissions typically

#### Analyst / Data user
- **CDP + analytics focus**
- Build segments
- Reports + BI dashboards
- Data export
- No send permissions

#### Read-only / Viewer
- **View reports only**
- For stakeholders, executives, auditors

#### Custom roles
- **Per business needs**
- **Granular permissions**

### 6.2 Permission categories

#### Account & Settings
- Account info
- Billing access
- User management
- Domain settings
- API key management
- Integration management

#### CDP / Databases
- View contacts
- Edit contacts
- Build segments
- Manage tags
- Import / export

#### Email
- Create campaigns
- Edit campaigns
- Send campaigns
- Templates management

#### Automation
- Create workflows
- Edit workflows
- Activate workflows

#### Channels
- Email sending
- SMS sending
- Web push sending
- Survey deployment

#### Channel Scoring
- View scores
- Configure scoring rules
- Use in workflows

#### Reports & BI
- View reports
- Build dashboards
- Export data
- BI access

### 6.3 Permission matrix (typical)

| Akce | Owner | Admin | Marketing | Designer | Analyst | Viewer | Custom |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Account & Billing** |  |  |  |  |  |  |  |
| Close account | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | per role |
| Manage billing | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | per role |
| Account settings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | per role |
| **User Management** |  |  |  |  |  |  |  |
| Add/edit users | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | per role |
| **CDP / Databases** |  |  |  |  |  |  |  |
| View contacts | ✅ | ✅ | ✅ | limited | ✅ | view | per role |
| Edit contacts | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | per role |
| Build segments | ✅ | ✅ | ✅ | ❌ | ✅ | view | per role |
| Export | ✅ | ✅ | per role | ❌ | ✅ | ❌ | per role |
| **Email** |  |  |  |  |  |  |  |
| Create campaigns | ✅ | ✅ | ✅ | ✅ | ❌ | view | per role |
| Send campaigns | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | per role |
| **Automation** |  |  |  |  |  |  |  |
| Create workflows | ✅ | ✅ | ✅ | ❌ | view | view | per role |
| Activate | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | per role |
| **Channels** |  |  |  |  |  |  |  |
| SMS sending | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | per role |
| Web push | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | per role |
| Surveys | ✅ | ✅ | ✅ | ✅ | view | view | per role |
| **Channel Scoring** |  |  |  |  |  |  |  |
| View scores | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | per role |
| Configure scoring | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | per role |
| **Reports & BI** |  |  |  |  |  |  |  |
| View | ✅ | ✅ | ✅ | view | ✅ | ✅ | per role |
| Build dashboards | ✅ | ✅ | per role | ❌ | ✅ | view | per role |
| Export | ✅ | ✅ | per role | ❌ | ✅ | per role | per role |
| **Integrations** |  |  |  |  |  |  |  |
| Manage | ✅ | ✅ | per role | ❌ | view | ❌ | per role |
| **API** |  |  |  |  |  |  |  |
| Manage API keys | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | per role |
| **Enterprise** |  |  |  |  |  |  |  |
| SSO configuration | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | per role |
| Audit logs | ✅ | ✅ | ❌ | ❌ | per role | per role | per role |

### 6.4 User invitation flow

```
Owner/Admin: Settings → Users
   ↓
+ Add user
   ↓
Email + name
   ↓
Role selection (default or custom)
   ↓
Granular permissions
   ↓
SSO assignment (if enterprise)
   ↓
2FA requirement
   ↓
Send invitation
   ↓
User activates
   ↓
[Active per role]
```

### 6.5 Enterprise SSO

For enterprise customers:
- **SAML 2.0**
- **Active Directory**
- **Google Workspace**
- **Microsoft 365**
- **Custom IdPs**
- **Centralized provisioning**
- **Automatic role mapping**

---

## 7. Account Owner flow

### 7.1 Owner responsibilities

```
Account Owner = highest tier
   ↓
Created during contract signing
   ↓
Manages:
- Billing + payment
- Contract management
- User management (all levels)
- Account settings
- Domain settings
- Integration access
- API key management
- Enterprise SSO
- Compliance settings
- Dedicated consultant relationship
- Close account option
```

### 7.2 Daily Owner workflow

```
Login → Master Dashboard
   ↓
Account overview:
- Today's campaign performance (all channels)
- Active workflow count
- CDP database health
- Channel Scoring trends
- Integration status
- ROI summary
   ↓
Strategic activities:
- Plan usage vs. contract
- Team performance
- Compliance status
- Consultant communication
- Industry research insights review
```

### 7.3 Billing management

```
Owner: Settings → Billing
   ↓
View:
- Current plan + tier
- Contact count vs. limit
- Email volume vs. limit
- SMS credits
- Channel module usage
- Next billing date
- Invoice history
   ↓
Actions:
- Plan changes (via sales)
- Add-on requests
- Update payment method
- Download invoices
- Custom contract amendments
```

### 7.4 Strategic consultant partnership

```
Quarterly Business Reviews:
- Performance vs. goals
- New use cases
- Industry research insights
- Roadmap discussions
- Renewal planning

Monthly check-ins:
- Operational status
- Issue resolution
- Optimization opportunities
- Team training needs

Research access:
- Industry reports
- Custom research requests (premium clients)
- Educational webinars
```

---

## 8. Marketing user flow

### 8.1 Daily Marketing workflow

```
Login → Marketing Dashboard
   ↓
Activities:
- Build segments
- Create campaigns
- Build / monitor workflows
- Send emails / SMS / web push
- Deploy surveys
- Review reports
- Channel Scoring optimization
- A/B/X testing
```

### 8.2 Create campaign

```
Email Marketing → New campaign
   ↓
Step 1: Setup
- Campaign name
- Subject line + personalization
- Sender (verified)
- Reply-to
- UTM parameters
   ↓
Step 2: Audience
- Select database
- Filter by segment
- **Channel Scoring filter** (e.g., email score > 60)
- Exclusion lists
   ↓
Step 3: Design
- Drag-drop editor
- Templates library
- Component library
- Personalization tokens
- Dynamic content blocks
- Product blocks (e-commerce)
   ↓
Step 4: A/B/X Test (optional)
- Configure variants
- Auto-winner setup
- Sample size
   ↓
Step 5: Test
- Preview (desktop, mobile)
- Send test
- Spam test
   ↓
Step 6: Send / Schedule
- Send now
- Schedule
- Time-zone delivery
- Throttled send
   ↓
Confirm
```

### 8.3 Build workflow

```
Automation → New scenario
   ↓
A) Pre-built scenario template
B) Custom path builder
   ↓
Configure trigger:
- Behavioral
- Transactional
- Date-based
- Channel Score-based
- Custom event
   ↓
Build canvas:
- Drag-drop nodes
- Add wait nodes
- Set conditions
- Configure send nodes (email, SMS, web push, survey)
- **Channel Scoring routing** decisions
- Set goals
- Configure exit conditions
   ↓
Test mode
   ↓
Activate
   ↓
[Workflow live]
```

### 8.4 Segment building

```
CDP → Segments → New segment
   ↓
Configure conditions:
- Contact attributes
- Behavioral data
- Transactional data
- **Channel Scoring filters**
- Engagement scores
- Custom events
- Date conditions
   ↓
Combine s AND/OR/NOT
   ↓
Preview segment size
   ↓
Save (dynamic)
   ↓
[Dynamic segment available]
```

### 8.5 Channel Scoring usage

```
When creating campaign:
- Check Channel Scoring per audience
- Filter by email score (e.g., > 60)
- OR target by SMS score
- OR multi-channel based on scoring
   ↓
Optimize delivery for best engagement
```

---

## 9. Analyst flow (CDP + BI focus)

### 9.1 Use case

- **Polish marketing analyst**
- **Data analyst**
- **CDP specialist**
- **Strategy team**
- **Banking analyst** (regulatory)

### 9.2 Daily Analyst workflow

```
Login → CDP Dashboard
   ↓
Analysis activities:
- CDP exploration
- Build complex segments
- Cohort analysis
- Channel Scoring trends
- Revenue attribution
- Custom BI dashboards
- Export data
- Predictive insights
```

### 9.3 CDP exploration

```
Analyst: CDP → Databases
   ↓
Filter contacts:
- By behavior
- By transaction
- By demographic
- By engagement
- By Channel Scoring
- By predictive scores
   ↓
Drill into profiles:
- 360° view
- Activity timeline
- Channel engagement history
- Order history
   ↓
Build segments based on findings
```

### 9.4 Custom BI dashboards

```
Reports → BI → Custom dashboard
   ↓
Configure:
- Metric selection
- Date range
- Filters
- Charts / visualizations
- Multi-source data
   ↓
Save dashboard
   ↓
Share s team
   ↓
Schedule periodic export
```

### 9.5 Channel Scoring analysis

```
Analyst: Reports → Channel Scoring
   ↓
View:
- Score distribution per channel
- Score trends over time
- High vs. low scorer analysis
- Channel effectiveness
- Conversion correlation
   ↓
Insights:
- Best channel mix per segment
- Optimization opportunities
- Re-engagement candidates
```

### 9.6 Industry research access

Per Digitree:
> *"SARE specialists have been conducting research and publishing reports on consumer behavior"*

Analysts get access to:
- Industry research reports
- Benchmarks
- Best practices
- Educational materials

---

## 10. Recipient lifecycle

### 10.1 Recipient creation paths

#### A) Form submission
```
Visitor fills SARE form (embedded or popup)
   ↓
Submit
   ↓
SARE:
- Validates email
- Captcha check
- **GDPR/RODO consent recorded**
- IP + timestamp logged
   ↓
Status: Pending (double opt-in default)
   ↓
Confirmation email sent
   ↓
Recipient clicks confirm
   ↓
Status: Active
   ↓
Add to database
   ↓
Welcome workflow triggers
```

#### B) Shoper integration (Polish e-commerce!)
```
Customer registers v Shoper shop
   ↓
Shoper webhook → SARE
   ↓
Contact created s marketing consent flag
   ↓
Add to designated database
   ↓
Tag: "Source: Shoper"
   ↓
Welcome workflow if active
   ↓
[Polish e-commerce specific advantage!]
```

#### C) Shopify / WooCommerce / PrestaShop integration
```
E-commerce customer event
   ↓
Webhook → SARE
   ↓
Recipient created/updated
   ↓
Synced to CDP
   ↓
Segment membership updated
```

#### D) API integration
```
External system POST to SARE API
   ↓
SARE validates auth
   ↓
Creates/updates recipient
   ↓
Channel Scoring starts
   ↓
[Recipient active]
```

#### E) Manual import (CSV)
```
Admin: CDP → Import
   ↓
CSV upload
   ↓
Field mapping
   ↓
**GDPR/RODO consent confirmation required**
   ↓
Validation
   ↓
Import processed
   ↓
[Recipients added]
```

### 10.2 Recipient status

```
[Pending] (double opt-in default)
   ↓
[Active] ← can receive multi-channel
   ↓
**Channel Scoring continuously evaluated**
   ↓
Transitions:
- Unsubscribed (per channel or global)
- Bounced
- Spam complaint
- Inactive (engagement-based)
- Deleted (GDPR/RODO)
```

### 10.3 Engagement tracking + Channel Scoring

```
Active recipient interacts with channels:
- Email open/click
- SMS click
- Web push interaction
- Survey response
   ↓
**Channel Scoring updates per channel:**
- Email engagement → email score
- SMS engagement → SMS score
- Web push engagement → web push score
   ↓
Profile + segments + workflows re-evaluated
```

### 10.4 Preference center

```
Email footer: "Manage preferences"
   ↓
SARE-hosted preference page (Polish/English)
   ↓
Recipient sees:
- Channel preferences (email, SMS, web push)
- Topic preferences
- Personal info edit
- Master unsubscribe
- GDPR/RODO rights
   ↓
Update
   ↓
Profile updated
- Channel preferences feed Channel Scoring
```

### 10.5 Unsubscribe

```
Recipient clicks unsubscribe
   ↓
SARE-hosted page
   ↓
Options:
- Specific channel unsubscribe
- All marketing
- Reason survey (optional)
   ↓
Status: Unsubscribed per channel
   ↓
**Channel Scoring updates** (score = 0 for unsubscribed channel)
   ↓
GDPR/RODO audit logged
   ↓
Workflow exits
```

### 10.6 Bounce handling

```
ISP 5xx response
   ↓
SARE:
- Status: Bounced
- Auto-suppression
- **Polish ISP reputation tracking**
   ↓
[Future sends suppressed]
```

### 10.7 GDPR/RODO delete

```
Recipient requests deletion
   ↓
Method A: Admin manual
Method B: API DELETE
Method C: Preference center self-service
Method D: Email request to support
   ↓
SARE:
- Removes personal data
- Anonymizes events
- Auto-suppression
- Audit log entry
- Confirmation email (RODO compliant)
```

---

## 11. Email lifecycle s Polish ISP optimization

```
┌─────────────────────────────────────────────────────────────────┐
│  1. USER drafts campaign                                        │
│     - Audience (database, segment, Channel Scoring filter)      │
│     - Design + personalize                                      │
│                            │                                    │
│                            ▼                                    │
│  2. PRE-SEND CHECKS                                             │
│     - Sender verified?                                          │
│     - Domain DKIM/SPF/DMARC?                                    │
│     - Audience valid?                                           │
│     - Channel Scoring filtering applied                         │
│     - Plan limits OK?                                           │
│     - **A/B/X test setup?**                                     │
│                            │                                    │
│                            ▼                                    │
│  3. SEND TIME                                                   │
│     - Send now                                                  │
│     - Scheduled                                                 │
│     - Time-zone delivery                                        │
│     - ML-driven optimal time (advanced tiers)                   │
│                            │                                    │
│                            ▼                                    │
│  4. PER-RECIPIENT GENERATION                                    │
│     - Personalization tokens resolved                           │
│     - Dynamic content evaluated                                 │
│     - Channel Scoring routing (multi-channel campaigns)         │
│     - Product feed blocks rendered                              │
│     - Tracking pixels embedded                                  │
│     - Click trackers wrapped                                    │
│                            │                                    │
│                            ▼                                    │
│  5. SMTP SEND from SARE INFRASTRUCTURE (EU/Polish)              │
│     - **Secure SMTP server**                                    │
│     - DKIM signed                                               │
│     - SPF compliant                                             │
│     - DMARC aligned                                             │
│     - List-Unsubscribe RFC 8058                                 │
│                            │                                    │
│                            ▼                                    │
│  6. ISP RECEIVES                                                │
│     - **Polish ISP relationships:**                             │
│        - WP.pl                                                  │
│        - Onet.pl                                                │
│        - Interia.pl                                             │
│        - Other Polish ISPs                                      │
│     - International ISPs:                                       │
│        - Gmail, Outlook, etc.                                   │
│     - Auth + reputation checks                                  │
│                            │                                    │
│                            ▼                                    │
│  7. ROUTING                                                     │
│     - Inbox (high probability for Polish ISPs!)                 │
│     - Promotions                                                │
│     - Spam (rare due to reputation)                             │
│                            │                                    │
│                            ▼                                    │
│  8. RECIPIENT INTERACTION                                       │
│     - Open → pixel → tracked                                    │
│     - Click → SARE redirect → tracked                           │
│     - Conversion tracking on landing page                       │
│                            │                                    │
│                            ▼                                    │
│  9. PROFILE UPDATE (REAL-TIME)                                  │
│     - CDP profile updated                                       │
│     - **Channel Scoring recalculated** (email score)            │
│     - Segments re-evaluated                                     │
│     - Workflow triggers fire                                    │
│                            │                                    │
│                            ▼                                    │
│ 10. REPORTING                                                   │
│     - Real-time stats                                           │
│     - **A/B/X auto-winner detection**                           │
│     - Channel Scoring impact analysis                           │
│     - Revenue attribution                                       │
│     - BI dashboards updated                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 12. Marketing automation execution (scenarios + paths)

### 12.1 Workflow activation

```
User builds scenario (path)
   ↓
Test mode (preview)
   ↓
Activate
   ↓
SARE validation:
- All triggers configured
- All actions valid
- No broken paths
- Channel Scoring rules valid
   ↓
[Active]
   ↓
Engine evaluates continuously
```

### 12.2 Trigger evaluation

```
Event occurs (subscription, order, behavior, Channel Score change, etc.)
   ↓
SARE evaluates active scenarios
   ↓
For each matching scenario:
- Check entry conditions
- Check re-entry settings
- Add recipient to scenario execution
```

### 12.3 Per-recipient execution

```
Recipient enters at trigger
   ↓
Each node processed:
- Send email → queue
- Send SMS → SMS gateway
- Send web push → notification
- Send survey → survey link
- Wait → schedule continuation
- Condition → evaluate (incl. Channel Score)
- Update field → modify profile
- Goal → check achievement
- Webhook → external call
   ↓
**Channel Scoring used for channel routing:**
- Best channel selected per recipient
- Higher engagement
- Better ROI
   ↓
Continue until end / goal / removal
```

### 12.4 Re-entry rules

- Per scenario setting
- Run once vs. multiple
- Minimum gap between re-entries

### 12.5 Workflow analytics

- Per-scenario performance
- Per-step metrics
- Channel-by-channel breakdown
- Drop-off analysis
- Conversion tracking
- ROI calculation

---

## 13. Channel Scoring flow (UNIKÁTNÍ)

### 13.1 Channel Scoring system

**SARE's proprietary feature.**

Per GetApp:
> *"channel scoring, designed to assess user engagement in email and SMS channels"*

Per Digitree:
> *"Channel scoring identifies the most effective channels to drive conversions."*

### 13.2 Score calculation

```
Per recipient, SARE tracks:
- Email opens
- Email clicks
- SMS clicks
- Web push interactions
- Conversion behaviors
   ↓
**ML model calculates Channel Score:**
- Email score: 0-100
- SMS score: 0-100
- Web push score: 0-100
- (Possible) Survey response score
   ↓
**Continuous updates:**
- Real-time after each interaction
- Time-decay applied (recent activity weighted higher)
- ML refinement ongoing
```

### 13.3 Scoring factors

#### Positive (+)
- Recent email open → +X
- Recent click → +Y
- Engagement frequency → +Z
- Conversion attribution → +W
- Survey response → +V

#### Negative (-)
- No engagement period → -X
- Spam complaint → -∞ (immediate suppression)
- Hard bounce → -∞ (immediate suppression)
- Unsubscribe → 0 (channel off)

#### Time decay
- Recent activity weighted higher
- Old activity gradually less weight
- Frequency boosts consistent engagement

### 13.4 Score-based use cases

#### Pre-send channel selection
```
Workflow trigger: Send promotional message
   ↓
Check Channel Score per recipient:
- Email score: 75
- SMS score: 45
- Web push score: 20
   ↓
**Decision: Send Email** (highest score)
   ↓
Recipient receives via best channel
   ↓
Higher engagement, better ROI
```

#### Channel switching
```
Recipient declines engagement:
- Email score dropping over 30 days
- SMS score stable
   ↓
**Auto-switch primary channel to SMS**
   ↓
Re-engagement attempt via better channel
```

#### Multi-channel orchestration
```
Workflow: Cart abandonment
   ↓
Channel Score check:
- Email score > 50 → Send email
- SMS score > 50 → Also send SMS (24h later)
- Both < 30 → Skip or re-permission
   ↓
**Channel-aware multi-touch**
```

#### Re-engagement
```
Channel Score declining
   ↓
Triggers re-engagement workflow
   ↓
Test multiple channels:
- New content
- Different timing
- Cross-channel attempt
   ↓
Recover engagement OR move to dormant
```

### 13.5 Score-based segmentation

```
Build segments:
- "Email champions": Email score > 80
- "SMS preferred": SMS score > email score
- "Multi-channel engaged": all scores > 60
- "At-risk": all scores declining 20%+ in 30 days
- "Dormant": all scores < 30
   ↓
Targeted campaigns per segment
```

### 13.6 Score dashboards

```
Analyst: Reports → Channel Scoring
   ↓
View:
- Score distribution per channel
- Score trends over time
- High vs. low scorer analysis
- Channel effectiveness comparison
- Conversion correlation
   ↓
Insights:
- Best channel mix per audience
- Optimization opportunities
- Audience health
```

---

## 14. Omnichannel orchestration flow

### 14.1 Channels available

- **Email** (primary, most-used)
- **SMS**
- **Web Push**
- **Surveys / Questionnaires**
- **Secure SMTP** (transactional)

### 14.2 Multi-channel workflow example

```
Trigger: Cart abandoned
   ↓
Wait 1h
   ↓
**Channel Scoring evaluation:**
- Email score, SMS score, web push score
   ↓
Decision tree:
   - If Email score highest → Send Email
   - If SMS score highest → Send SMS
   - If both high → Email first, SMS after 24h
   ↓
Wait per channel response
   ↓
Condition: Purchased?
   YES → Goal (exit)
   NO → Next step (different channel for variety)
   ↓
Wait 48h
   ↓
Send web push reminder (if applicable)
   ↓
Final survey: "Why didn't you complete purchase?"
   ↓
Exit
```

### 14.3 Cross-channel preferences

- **Per-channel opt-in/opt-out**
- **Per-channel preferences** (frequency, topics)
- **Master unsubscribe option**
- **Channel Scoring-driven** intelligent routing

### 14.4 Frequency caps

- **Cross-channel caps** to prevent over-messaging
- **Per-channel caps**
- **Per-campaign type caps**
- **Quiet hours** (Polish business hours respect)

### 14.5 Channel preferences feeding back

```
Customer updates preference center:
- "I prefer SMS over email"
   ↓
Preference saved
   ↓
**Channel Scoring boosted** for SMS
   ↓
Future workflows prioritize SMS for this contact
   ↓
[Personalization improves]
```

---

## 15. CDP data ingestion flow

### 15.1 Data sources

```
Multiple sources feed CDP:

1. SAREsystem forms
   - Direct sign-ups
   - Real-time

2. E-commerce platforms
   - Shoper (Polish!)
   - Shopify
   - WooCommerce
   - PrestaShop
   - Customer + order + product events

3. CRM integrations
   - Salesforce
   - HubSpot CRM
   - Custom CRMs

4. Mobile/web tracking
   - Website behavior
   - App events (if integrated)

5. Email/SMS/web push engagement
   - Captured natively

6. Surveys / Questionnaires
   - Response data
   - Zero-party data

7. API / Custom events
   - External system data
   - Custom event types

8. Manual / Bulk import
   - CSV uploads
```

### 15.2 Real-time ingestion

```
Event occurs (e.g., page view)
   ↓
Tracking script / API call → SARE
   ↓
SARE processes:
- Validate event
- Identify recipient (cookie / email)
- Create / update profile
- Update attributes
- **Recalculate Channel Score**
- Recalculate segments
- Trigger workflows
   ↓
Profile reflects new event
```

### 15.3 Identity resolution

```
Multiple identifiers per customer:
- Cookie ID
- Email
- Phone
- Customer ID
   ↓
SARE resolution logic:
- Email = primary
- Cookie → email when form submitted
- Customer ID → email match
- Cross-device via email
   ↓
Single Customer Profile maintained
```

### 15.4 Data enrichment

```
SARE enriches profiles:
- Geographic (from IP)
- Device info
- Browser info
- Channel Scoring (3+ channels)
- Predictive scores
- Lifecycle stage
- Segments
   ↓
Real-time updates
```

---

## 16. A/B/X testing flow (auto-winner)

### 16.1 A/B/X test creation

Per Digitree:
> *"The system provides A/B/X tests with automatic winner selection, allowing optimization to happen 'on the fly.'"*

```
Marketer creates campaign
   ↓
Enable A/B/X testing
   ↓
Configure variants (2-N):
- Variant A: Subject "X"
- Variant B: Subject "Y"
- Variant C: Subject "Z"
- etc.
   ↓
Configure sample size:
- Per variant (e.g., 10% each)
- Or auto-calculated for statistical significance
   ↓
Configure winner criteria:
- Open rate
- Click rate
- Conversion rate (s tracking)
- Engagement composite
   ↓
Configure auto-send:
- After what time period?
- After what sample size?
- Confidence threshold?
   ↓
Activate test
```

### 16.2 Test execution

```
Test sample sent:
- Variant A → 10% audience
- Variant B → 10% audience
- Variant C → 10% audience
   ↓
Real-time tracking
   ↓
Engagement collected
   ↓
**ML calculates winner:**
- Statistical significance check
- Best performer identification
- Auto-decision made
   ↓
**Auto-send to remaining audience:**
- Winning variant sent to 70%
- "On the fly" optimization
   ↓
Reports show:
- Per-variant performance
- Winner explanation
- Statistical confidence
- Recommendations
```

### 16.3 Why this matters

- **No manual winner picking**
- **Faster optimization**
- **Statistical rigor**
- **Continuous learning**
- **ROI improvement**

---

## 17. Surveys flow

### 17.1 Survey creation

```
Marketer/Designer: Surveys → New survey
   ↓
Configure:
- Survey name
- Title + description
- Questions (multiple types):
  - Open text
  - Multiple choice
  - Multi-select
  - Rating (1-5, 1-10)
  - NPS
  - Dropdown
  - Matrix
- Logic branching
- Personalization
- Style customization
   ↓
Configure deployment:
- Standalone URL
- Embed in email
- Website embed
- Triggered from automation
   ↓
Configure response handling:
- Tag application based on answer
- Trigger automation on response
- Update profile fields
- Notifications
   ↓
Save + Activate
```

### 17.2 Survey deployment

#### Email embed
```
In email: include survey link
   ↓
Recipient clicks
   ↓
Lands on SARE-hosted survey page
   ↓
Completes survey
   ↓
Data captured to profile
```

#### Standalone URL
```
Share via:
- Email
- SMS
- Social media
- Website link
- QR code (offline)
   ↓
Anyone clicks → standalone page
   ↓
Survey completed
```

#### Triggered from automation
```
Workflow node: Send survey
   ↓
Survey link sent via best channel (Channel Scoring)
   ↓
Recipient interacts
   ↓
Response data feeds back to workflow
   ↓
Continue workflow based on response
```

### 17.3 Response collection

```
Real-time response capture:
- Profile updated
- Tags applied based on answers
- Custom fields populated
- Automation triggers
   ↓
**Zero-party data captured**
- Explicit preferences
- Intent signals
- Customer feedback
```

### 17.4 Reports

```
Survey reports:
- Response rate
- Per-question analytics
- NPS score calculation
- Sentiment trends
- Cross-tabulation
- Export options
```

---

## 18. Abandoned cart + product page flow

### 18.1 Setup requirements

```
E-commerce platform connected:
- Shoper (Polish!)
- Shopify
- WooCommerce
- PrestaShop
   ↓
Tracking script installed na website
   ↓
Webhooks configured:
- Cart events
- Product page events
- Checkout events
- Order events
   ↓
[Real-time event sync]
```

### 18.2 Abandoned cart workflow

```
Customer adds to cart
   ↓
Customer leaves without checkout
   ↓
**Webhook → SARE: Cart abandoned event**
   ↓
Wait period (e.g., 1h)
   ↓
**Channel Scoring evaluation:**
- Pick best channel per recipient
   ↓
Send reminder via best channel:
- Email s cart contents (image, price, description)
- OR SMS reminder
- OR web push notification
   ↓
Wait 24h
   ↓
Condition: Purchased?
   YES → Exit (success)
   NO → Send discount offer
   ↓
Wait 48h
   ↓
Final reminder via secondary channel
   ↓
Exit
```

### 18.3 Product page abandonment workflow

```
Customer views product page > 5 min
   ↓
Customer leaves without purchase
   ↓
**Webhook → SARE: Product page abandoned**
   ↓
Wait 1 day
   ↓
**Channel Scoring evaluation**
   ↓
Send personalized message:
- Product images
- Customer reviews / testimonials
- Special offer (if applicable)
- Direct link to product
   ↓
Track engagement
   ↓
Continue follow-up sequence
```

### 18.4 Revenue attribution

```
Email send recorded
   ↓
Recipient clicks
   ↓
Lands on shop
   ↓
Conversion window (e.g., 7 days):
- If order placed → revenue attributed
   ↓
Reports show:
- Revenue per campaign
- Revenue per workflow
- ROI per channel
- Channel Scoring impact
```

---

## 19. Recurring messages flow

### 19.1 Recurring message setup

```
Automation → New recurring message
   ↓
Configure:
- Recurrence pattern:
  - Daily
  - Weekly (specific day)
  - Monthly (specific date or day)
  - Custom interval
- Send time
- Audience (dynamic segment)
- Content template
- End conditions (optional, e.g., after 12 sends)
   ↓
Activate
   ↓
[Auto-runs per schedule]
```

### 19.2 Use cases

#### Weekly digest
```
Every Monday 9:00 AM:
- Send weekly digest
- Audience: Active subscribers
- Content: Last week's blog posts
- Personalized by reading history
```

#### Monthly subscription reminder
```
Every 1st of month:
- Send subscription status
- Audience: Active paying subscribers
- Content: Renewal info
- Account details
```

#### Birthday automation
```
Daily check:
- Recipients with birthday today
- Send personalized greeting + offer
- Channel Scoring-driven channel
```

### 19.3 Per Digitree

> *"Automated sends, abandoned cart flows, and recurring messages work around the clock."*

- **24/7 automation**
- **No manual intervention**
- **Scalable**

---

## 20. API & Integration flow

### 20.1 API access

Per GetApp:
> *"Yes, SARE has an API available for use."*

```
Admin: Settings → API
   ↓
Generate API key
   ↓
Configure:
- Name + description
- Scope (read/write per resource)
- Rate limits
- IP whitelist (security)
   ↓
**Key generated** – copy + secure
   ↓
[API key active]
```

### 20.2 API request flow

```
Client application:
   POST https://api.sare.pl/v1/[endpoint]
   Headers:
     Authorization: Bearer {api_key}
     Content-Type: application/json
   Body: { data }
   ↓
SARE:
- Validates auth
- Rate limit check
- Permission validation
- Validates payload
   ↓
Response 200/201
   ↓
Action performed
- CDP update
- Event tracked
- Campaign triggered
- etc.
```

### 20.3 Common API use cases

- **Add recipient** to database
- **Update profile** attributes
- **Trigger custom event**
- **Send transactional email**
- **Retrieve reports**
- **Manage segments**
- **List campaigns**

### 20.4 Webhooks

```
SARE webhook setup:
- Target URL
- Events subscribed:
  - Recipient events
  - Campaign events
  - Survey responses
  - Channel Score changes
  - Custom events
- Signature verification (HMAC)
   ↓
On event:
- POST to target URL
- External app processes
```

### 20.5 E-commerce integration

```
Shoper (or Shopify/WooCommerce/PrestaShop):
   ↓
Native integration plugin / OAuth
   ↓
Configure:
- API connection
- Default database mapping
- Field mapping
- Sync schedule
- Tracking script install
- Webhooks active
   ↓
Initial sync (hours for large stores):
- Customers
- Orders
- Products
   ↓
[Continuous real-time sync]
```

### 20.6 Zapier integration

```
Zapier connection:
- 5000+ apps available
- Trigger SARE actions from external apps
- Push data from SARE to external apps
- Visual workflow builder
- No-code automation
```

---

## 21. Secure SMTP flow (transactional)

### 21.1 Secure SMTP setup

```
Admin: Settings → SMTP
   ↓
Generate SMTP credentials:
- Hostname
- Port (typically 587 with TLS)
- Username
- Password / API key
   ↓
Configure:
- DKIM signing
- SPF compliance
- DMARC alignment
- Per-application credentials
- IP whitelisting
   ↓
[Secure SMTP active]
```

### 21.2 Transactional send via SMTP

```
Application generates transactional event:
- Order confirmation
- Password reset
- Account verification
- Receipt
   ↓
Application sends via SARE SMTP:
- Connect to SARE SMTP server
- Authenticate
- Send email with content
   ↓
SARE processes:
- Validates auth
- Applies DKIM/SPF/DMARC
- Routes via Polish ISP relationships
- Delivers to recipient
   ↓
Tracking:
- Delivery confirmed
- Opens tracked (pixel)
- Clicks tracked
- Logged v reports
```

### 21.3 Transactional via API

```
Application calls SARE API:
   POST /transactional/send
   Headers: API auth
   Body:
     - to (recipient)
     - template_id
     - variables (merge data)
   ↓
SARE renders + sends
   ↓
Response 200
```

### 21.4 Transactional use cases

- Order confirmations
- Shipping notifications
- Password resets
- Account verifications
- Receipts / invoices
- Authentication codes
- Payment notifications
- Subscription renewals

### 21.5 Deliverability advantage

- **Polish ISP relationships strong**
- **DKIM/SPF/DMARC enforced**
- **High deliverability**
- **Dedicated transactional infrastructure**
- **Tracked + monitored**

---

## 22. Enterprise compliance flow (SSO, audits, SLA)

### 22.1 Enterprise setup

For Polish banks, financial services, large corporates:

```
Enterprise client onboarding
   ↓
Implementation includes:
- SSO integration setup
- Granular permissions design
- Audit logging configuration
- SLA agreement signing
- Compliance documentation
- Dedicated support tier
```

### 22.2 SSO setup flow

```
Enterprise: Settings → SSO
   ↓
Configure IdP:
- SAML 2.0 (most common)
- Active Directory
- Google Workspace
- Microsoft 365
- Custom IdPs
   ↓
Configure metadata exchange
   ↓
Test SSO flow:
- IdP login → SARE access
- Logout → SSO logout
   ↓
Role mapping:
- IdP groups → SARE roles
- Automatic provisioning
   ↓
[SSO active]
```

### 22.3 Granular permissions

```
Enterprise admin:
- Define custom roles
- Per-feature permissions
- Per-database access
- Per-channel access
- Per-action permissions
- Per-report access
   ↓
Assign users via IdP groups OR manual
```

### 22.4 Audit logs

```
All activity logged:
- User login / logout
- Data access
- Configuration changes
- Campaign sends
- API access
- GDPR delete actions
- SSO events
   ↓
Audit logs:
- Searchable
- Filterable
- Exportable (CSV, JSON)
- Retention period (compliance)
   ↓
Compliance reports:
- Regulatory audits
- Internal reviews
- Security reviews
```

### 22.5 SLA management

```
Enterprise SLA includes:
- Uptime guarantee (99.9%+)
- Response time guarantees
- Support tier
- Issue escalation
- Penalties for breaches
- Reporting cadence
   ↓
Monthly SLA reports:
- Uptime metrics
- Response times
- Issue resolution stats
   ↓
Quarterly reviews:
- SLA performance
- Improvements needed
- Contract renewal
```

### 22.6 Regulatory compliance

**Polish banking (KNF, UODO):**
- Bank-specific compliance
- Recordkeeping requirements
- Banking secrecy
- Customer data protection

**EU:**
- GDPR/RODO
- MiFID II (financial)
- PSD2 (banking)

**Industry:**
- ISO 27001 likely
- SOC 2 (potentially)
- Healthcare regulations (Polish)

---

## 23. Industry research + reports flow (thought leadership)

### 23.1 Research authority

Per Digitree:
> *"SARE specialists have been conducting research and publishing reports on consumer behavior and marketing communication for years, which are widely cited in industry media and educational materials."*

### 23.2 Research process

```
SARE research team conducts:
- Consumer behavior studies
- Email engagement research
- Polish market trends
- Industry-specific insights
- Benchmark studies
   ↓
Data sources:
- SARE platform aggregate data (anonymized)
- Customer surveys
- Industry partnerships
- Independent research
- Polish market data
   ↓
Publication channels:
- sare.pl blog
- Industry conferences
- Whitepapers
- Webinars
- Media citations
- Educational materials
```

### 23.3 Customer access to research

```
SARE customers benefit from:
- Industry research access
- Polish market benchmarks
- Best practices insights
- Educational webinars
- Custom research (premium clients)
   ↓
**Strategic guidance** beyond tool support
```

### 23.4 Research impact

- **Polish industry standard-setting**
- **Educational contribution**
- **Thought leadership**
- **Customer guidance**
- **Marketing partner positioning** (Digitree Group)

### 23.5 Per Digitree

> *"Behind SARE are people who implement and run campaigns for demanding brands — and data you can rely on."*

**Research authority creates trust:**
- Customers see SARE as **expert partner**
- Not just tool vendor
- Strategic advisor positioning

---

## 24. RODO/GDPR compliance flow

### 24.1 EU hosting

- **EU servers** primary
- **Polish jurisdiction** likely
- **No cross-border** transfers
- **Data residency** guaranteed

### 24.2 RODO features (Polish GDPR)

- **Polish RODO compliance**
- **UODO (Urząd Ochrony Danych Osobowych)** alignment
- **GDPR consent fields** v forms
- **Per-channel consent**
- **Double opt-in** support
- **Audit trail per consent**
- **Right to be Forgotten**
- **Data export** (DSAR)
- **DPA available v polštině**

### 24.3 Consent management

```
Form submission:
- GDPR consent checkbox required
- Per-channel consent (email, SMS, web push)
- Source documentation
- Timestamp + IP logging
- Consent text version archived
   ↓
**Full RODO audit trail**
```

### 24.4 Right to Be Forgotten

```
Recipient requests deletion
   ↓
Method A: Admin manual (account holder)
Method B: API DELETE
Method C: Preference center self-service
Method D: Email request to support
   ↓
SARE:
- Removes personal data
- Anonymizes events
- Auto-suppression permanent
- Audit log entry
- Confirmation email (RODO compliant)
- DSGVO documentation maintained
```

### 24.5 DSAR (Data Subject Access Request)

```
Recipient requests their data
   ↓
Admin: Generate GDPR/RODO export
   ↓
SARE produces:
- Profile data
- Activity events
- Communication history
- Consent records
- Channel Scoring history
- Predictive scores
   ↓
Provide within 30 days (RODO requirement)
```

### 24.6 Compliance certifications

- **GDPR/RODO compliant**
- **UODO compliance**
- **Likely ISO 27001** (typical for Polish enterprise platforms)
- **SOC 2** (potentially)
- **Polish banking compliance** (KNF)

### 24.7 Industry-specific compliance

- **Polish banking** (KNF requirements)
- **Financial services** (MiFID II)
- **Healthcare** (Polish regulations)
- **Government** procurement ready

---

## 25. Datová mapa: co vidí kdo

| Data | Owner | Admin | Mkt User | Designer | Analyst | Viewer | Subscriber | API | Consultant |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Account settings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | per scope | read |
| Billing | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | per scope | read |
| User management | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | per scope | read |
| All CDP profiles | ✅ | ✅ | ✅ | limited | ✅ | view | jen sebe | ✅ | read |
| Edit profiles | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Build segments | ✅ | ✅ | ✅ | ❌ | ✅ | view | – | ✅ | read |
| Channel Scoring (view) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | read |
| Channel Scoring (config) | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | per scope | read |
| Email campaigns | ✅ | ✅ | ✅ | ✅ | view | view | jen co dostal | ✅ | read |
| Send campaigns | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Automation scenarios | ✅ | ✅ | ✅ | view | view | view | ❌ | ✅ | read |
| Activate workflows | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| SMS sending | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Web push | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Surveys | ✅ | ✅ | ✅ | ✅ | view | view | submit | ✅ | read |
| Secure SMTP | ✅ | ✅ | per role | ❌ | ❌ | ❌ | – | ✅ | read |
| Templates | ✅ | ✅ | ✅ | ✅ | view | view | – | ✅ | read |
| A/B/X tests | ✅ | ✅ | ✅ | view | view | view | – | ✅ | read |
| Reports | ✅ | ✅ | ✅ | view | ✅ | ✅ | ❌ | ✅ | read |
| BI dashboards | ✅ | ✅ | per role | ❌ | ✅ | view | ❌ | per scope | read |
| Integrations | ✅ | ✅ | per role | ❌ | view | ❌ | – | per scope | read |
| API keys | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | – | read |
| SSO config | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | – | read |
| Audit logs | ✅ | ✅ | ❌ | ❌ | per role | per role | ❌ | per scope | read |
| Industry research | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | – | – | provide |
| RODO delete | ✅ | ✅ | per role | ❌ | per role | ❌ | request | ✅ | execute |

---

## 26. Známé úzkoprofilové místa

### 26.1 Polish-first focus

⚠️ SARE primárně **Polish market**:
- Polish UI + support primary
- English UI secondary
- Polish team dominant
- Less international vs. global competitors

### 26.2 No public pricing

- **No transparent public pricing**
- **Sales-driven custom quotes**
- **Long sales cycle** (mid-market+)
- **Less SMB-friendly** than self-serve competitors

### 26.3 No free plan

- **No free version** (per SoftwareWorld)
- **Free trial only** (no credit card)
- **Paid only** post-trial
- vs. Mailchimp / MailerLite / Brevo free plans

### 26.4 Less brand recognition globally

- **Polish leader** but globally less known
- **Outside Poland:** less visibility
- **International marketing** limited

### 26.5 Less DTC-focused than Klaviyo

- **No native Shopify ML deep**
- **Less DTC templates**
- **Less e-commerce ML** sophistication

### 26.6 Less enterprise globální than SAP Emarsys / Salesforce

- **Smaller scale**
- **Less global enterprise customers**
- **Less Gartner positioning**

### 26.7 Limited mobile experience

- **Mobile app limited**
- **Most operations** require desktop

### 26.8 No webinars / courses native

- **No webinar hosting** (vs. GetResponse)
- **No online courses**
- **No paid newsletters**

### 26.9 No autonomous AI agents

- **ML-driven** but **not autonomous**
- **No AI agents** (vs. Klaviyo Customer Agent, HubSpot Breeze)
- **Channel Scoring is rule-based ML**, not autonomous

### 26.10 Less integrations than Zapier-heavy platforms

- **Core e-commerce** integrations
- **Zapier ecosystem**
- **Less native integrations** than Mailchimp/CleverReach

### 26.11 No native landing pages

- **No landing page builder** prominently
- **Vs. GetResponse, HubSpot, Mailchimp**
- **Workarounds** required

### 26.12 No deep CRM

- **No deals/pipelines**
- **Contact-centric**
- **B2B sales features limited**

### 26.13 No CZ/SK/DE UI

- **Polish + English** primary
- **No Czech / Slovak / German / French**
- **CEE region** partially limited

### 26.14 Migration challenges

- **Workflows non-exportable**
- **Templates rebuild required**
- **Custom integrations** re-built

### 26.15 International ISP relationships limited

- **Strong Polish ISPs**
- **Less established** s German/Czech/etc. ISPs
- **Less optimization** pro international

---

## 27. Doporučení pro design vlastních procesů

Pokud SARE používáte v týmu, doporučujeme:

1. **Domain authentication day 1** – DKIM + SPF + DMARC + branded tracking
2. **Dedicated consultant využívat strategicky** – core value of SARE
3. **Quarterly Business Reviews** – with consultant
4. **Channel Scoring enable early** – let ML learn from data
5. **Multi-channel strategy** plan – email + SMS + web push + surveys
6. **CDP custom fields strategy** – plan upfront
7. **Tag taxonomy** – flat structure s prefixes
8. **Segments naming convention** – consistent
9. **A/B/X testing culture** – always run tests
10. **Survey strategy** – zero-party data collection
11. **Shoper integration** if Polish e-shop (NATIVE advantage!)
12. **Shopify integration** if applicable
13. **Templates library** build reusable masters
14. **Brand kit consistent**
15. **Workflow templates** patterns library
16. **Frequency caps cross-channel** prevent over-messaging
17. **Channel preferences feedback loop**
18. **Reports + BI dashboards** custom for team
19. **Industry research access** leverage
20. **Enterprise SSO** if applicable
21. **RODO compliance documentation** maintain
22. **Audit logs review** regularly
23. **Polish ISP deliverability monitoring**
24. **Backup strategy** periodic export
25. **Migration plan** if scaling beyond SARE

---

*Dokument zpracován z oficiálních zdrojů sare.pl a praktických zdrojů (GetApp, SoftwareSuggest, SoftwareWorld, SaaSCounter, Digitree, RocketReach, EmailExpert, EmailVendorSelection). Pro nejaktuálnější detaily je nutný engagement s SARE sales / consultant teamem.*
