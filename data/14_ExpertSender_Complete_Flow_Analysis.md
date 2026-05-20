# ExpertSender – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v ExpertSender prochází data, lidé a akce – od Account Ownera přes specializované uživatele, dedicated CSM, integrace, až po koncového customer profile.

> Tento dokument doplňuje `13_ExpertSender_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** ExpertSender umí, tento popisuje, **kdo s tím interaguje a jak data tečou**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
>
> - **Service-driven model** – každý klient má **dedicated Customer Success Manager** (CSM), ne self-service
> - **No public pricing, no self-serve sign-up** – vstupní bod je demo + consultation
> - **Strategic onboarding** 4–8+ týdnů, ne instant launch
> - **CDP architectura** – Single Customer 360° Profile s identity resolution napříč anonymous + identified
> - **Multichannel native** – email + SMS + web push + mobile push + on-site v jediné platformě
> - **Custom RBAC** – role-based access control, granular permissions (ne fixed predefined jako Mailchimp/MailerLite)
> - **E-commerce-only positioning** – features designed exclusively for online retail
> - **EU hosting (Gdańsk)** + ISO 27001 + Silver Microsoft Partner
> - **Migration team built-in** – zdarma asistovaná migrace from previous ESP

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Sales & demo flow (před signup)](#2-sales-demo-flow)
3. [Onboarding flow (4-8 týdnů)](#3-onboarding-flow)
4. [User roles & permissions (RBAC)](#4-user-roles)
5. [Account Owner flow](#5-account-owner-flow)
6. [Administrator flow](#6-administrator-flow)
7. [Marketer / Campaign Manager flow](#7-marketer-flow)
8. [Customer Success Manager (CSM) flow](#8-csm-flow)
9. [Customer profile lifecycle](#9-customer-profile)
10. [Identity resolution flow](#10-identity-resolution)
11. [RFM analysis flow](#11-rfm-flow)
12. [Email lifecycle](#12-email-lifecycle)
13. [Multichannel workflow execution](#13-workflow-execution)
14. [E-commerce data flow](#14-ecommerce-flow)
15. [Product recommendations flow](#15-recommendations-flow)
16. [Transactional email flow](#16-transactional-flow)
17. [API & Integration flow](#17-integration-flow)
18. [GDPR & Compliance flow](#18-gdpr-flow)
19. [Datová mapa: co vidí kdo](#19-datová-mapa)
20. [Známé úzkoprofilové místa](#20-úzkoprofilové-místa)

---

## 1. Mapa aktérů

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│         EXPERTSENDER PLATFORM ECOSYSTEM                            │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [ExpertSender Internal Team]                                      │
│   ├─ Dedicated CSM (per klient!)                                   │
│   ├─ Strategic consultant                                          │
│   ├─ Technical support (24/7 standard tier)                        │
│   ├─ Migration team (onboarding)                                   │
│   ├─ Deliverability team                                           │
│   ├─ Sales / New Business team                                     │
│   ├─ Trust & Safety                                                │
│   └─ Account / billing team                                        │
│           │ (regular touchpoints + ad-hoc support)                 │
│           ▼                                                        │
│                                                                    │
│   ┌──────────────────────────────────────────┐                     │
│   │   ExpertSender Account                   │                     │
│   │                                          │                     │
│   │   ├─ Account Owner (1 osoba)             │◄── full + close acc │
│   │   ├─ Administrator(s)                    │◄── operational lead │
│   │   ├─ Marketer(s) / Campaign Manager(s)   │◄── content + sends  │
│   │   ├─ Analyst(s) / Reporting              │◄── view only         │
│   │   ├─ Developer(s) / API user             │◄── API + integrace  │
│   │   ├─ Designer (custom role)              │◄── per RBAC         │
│   │   └─ Custom roles unlimited (RBAC)       │◄── per definition   │
│   │                                          │                     │
│   │   + Multi-account support (Enterprise):  │                     │
│   │     pro multi-brand / agency model       │                     │
│   └──────────────┬───────────────────────────┘                     │
│                  │                                                 │
│                  ▼                                                 │
│   [Customer Data Platform (CDP)]                                   │
│       │                                                            │
│       ├─→ Single Customer 360° Profile                             │
│       │  (anonymní → identifikovaný stitching)                     │
│       │                                                            │
│       ├─→ E-commerce platform (Shopify/Magento/PrestaShop/...)     │
│       │                                                            │
│       └─→ Activation across:                                       │
│           - Email                                                  │
│           - SMS                                                    │
│           - Web push                                               │
│           - Mobile push + In-app                                   │
│           - On-site (popups, banners, recommendations)             │
│           - Ad audiences (Meta, Google)                            │
│                  │                                                 │
│                  ▼                                                 │
│   [Customers / Visitors]                                           │
│       - Anonymous browsing                                         │
│       - Identified subscribers                                     │
│       - Cross-device journeys                                      │
│       - Cross-channel engagement                                   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér                           | Vstupní bod                      | Co dělá                           | Co vidí               |
| ------------------------------- | -------------------------------- | --------------------------------- | --------------------- |
| **Account Owner**               | Po contract signing              | Vše + billing + close account     | Vše                   |
| **Administrator**               | Pozvánka od Owner                | Operational management            | Vše krom billing      |
| **Marketer / Campaign Manager** | Pozvánka                         | Build + send campaigns, workflows | Marketing tools       |
| **Analyst**                     | Pozvánka                         | View reports & analytics          | Read-only             |
| **Developer**                   | Pozvánka + API key               | API integration, technical setup  | Per role + API        |
| **Designer (custom)**           | Pozvánka s custom role           | Design templates                  | Per RBAC              |
| **Custom role users**           | Pozvánka s custom RBAC           | Per definition                    | Per definition        |
| **Dedicated CSM**               | Assigned at onboarding           | Strategy, reviews, optimization   | Customer account read |
| **Customer / Profile**          | Form, integration, anon tracking | Browses, buys, opens emails       | Své komunikace        |
| **API Client**                  | API key                          | Per scope                         | Per scope             |
| **E-commerce platform**         | Plugin / integration             | Sync data continuously            | Per integration scope |
| **ExpertSender Staff**          | Interní                          | Support, deliverability, T&S      | Limited               |

---

## 2. Sales & demo flow (před signup)

ExpertSender NEPOUŽÍVÁ self-serve sign-up. Vstupní bod je **dedicated sales process**.

### 2.1 Lead qualification

```
Potenciální klient vyplní form na expertsender.com:
- Request demo
- Get pricing
- Contact form
- Or LinkedIn outreach from sales
   ↓
Sales team contact within 24h
   ↓
**Qualifying call** (15-30 min):
- Current platform používá?
- Subscriber count?
- Monthly visits to your store?
- E-commerce platform?
- Key challenges?
- Decision-making timeline?
- Budget range?
- Geographic regions?
   ↓
**Qualification criteria** (per oficiální):
- Minimálně 30K unique visits/month
- Mid-to-large e-commerce
- Looking for partner not just tool
- Budget for $450+/month start
   ↓
If qualified → Demo scheduled
If not qualified → Recommendation to alternatives (MailerLite, Brevo, etc.)
```

### 2.2 Demo proces

```
Demo (45-60 min, online):
- Platform walkthrough
- Customer success stories (4F, Answear, Taranko)
- ROI calculator
- Feature deep-dive based on client needs
- Q&A
- Technical demo for integrations
   ↓
Follow-up email s materials
   ↓
Optional: second demo s technical team if complex setup
   ↓
**Custom proposal** generated:
- Pricing structure
- Features included
- Onboarding plan
- SLA
- Implementation timeline
- Migration support if applicable
   ↓
Contract negotiation
   ↓
Sign contract
   ↓
[Customer now in onboarding]
```

### 2.3 Pilot / POC option

For larger deals, ExpertSender může offer:

- **30-90 day pilot** s limited features
- POC proof-of-concept
- Reduced commitment
- Performance benchmarks measured
- Decision after pilot

### 2.4 Pricing negotiation typical

- **Year 1:** higher price, longer commitment
- **Annual prepayment** discount
- **Multi-year contracts** for additional discount
- **Feature bundles** vs. à la carte
- **Add-ons:** dedicated IPs, premium support, custom integrations
- **Multi-account** pro multi-brand

---

## 3. Onboarding flow (4-8 týdnů)

After contract signing, **strategic onboarding** begins.

### 3.1 Phase 1: Kickoff (Week 1)

```
Contract signed
   ↓
Customer Success Manager (CSM) assigned
   ↓
**Kickoff meeting** (1-2 hours):
- Introductions (CSM + customer team)
- Goals + KPIs alignment
- Project plan walkthrough
- Stakeholder identification
- Timeline confirmation
   ↓
**Project plan** delivered:
- Week-by-week tasks
- Owner per task
- Dependencies
- Go-live target date
```

### 3.2 Phase 2: Technical Setup (Week 1-3)

```
Account provisioned
   ↓
Domain authentication:
- Add sending domain
- DKIM + SPF + DMARC setup
- Branded tracking domain
- DNS records verified
   ↓
Integration setup:
- E-commerce platform connection (Shopify/Magento/etc.)
- OAuth or API key configuration
- Initial data sync (customers, orders, products)
- Webhook subscriptions
   ↓
Tracking script installation:
- JavaScript snippet on website
- Custom event tracking configuration
- Cookie consent integration (GDPR)
   ↓
Mobile SDK (if applicable):
- iOS + Android SDK integration
- Push token registration
   ↓
Initial data import:
- Existing subscribers migration
- Historical orders
- Product catalog
   ↓
**Test data review** with CSM
```

### 3.3 Phase 3: Migration (Week 2-4, parallel)

Pokud klient přechází from previous platform (Mailchimp, Klaviyo, ESP):

```
Migration team kickoff
   ↓
Audit previous platform:
- Subscriber lists structure
- Active automations
- Templates library
- Custom fields
- Integrations
- Historical campaign data
   ↓
Migration plan:
- Data export from old platform
- Field mapping to ExpertSender
- Workflow recreation (manual; cannot export-import)
- Template mapping
- Consent preservation
   ↓
Migration execution:
- Subscribers imported
- Tags + custom fields preserved
- Workflows recreated in ExpertSender
- Templates rebuilt
- Active automations paused on old platform → activated on ExpertSender
   ↓
Parallel run (1-2 weeks):
- Both platforms running
- Monitor for issues
- Cutover when stable
   ↓
Old platform deactivation
   ↓
[Migration complete]
```

### 3.4 Phase 4: Configuration (Week 3-5)

```
User accounts setup:
- Owner + admins created
- Custom roles defined per team structure
- Marketers, designers, analysts added
   ↓
Segments + RFM analysis:
- Initial segments defined
- RFM scoring configured
- Predictive scores activated (CLV, churn, NPD)
   ↓
Templates library:
- Brand kit setup
- Email templates designed
- Landing pages
- Pop-ups
   ↓
Initial workflows:
- Welcome series
- Abandoned cart
- Post-purchase
- Re-engagement
   ↓
Test campaigns:
- Internal test sends
- Stakeholder reviews
- Approval workflows
```

### 3.5 Phase 5: Training (Week 5-7)

```
Training sessions:
- Platform overview (all users)
- Power user training (marketers, admins)
- Advanced workflow building (advanced marketers)
- Reporting + analytics
- API + developer training (if applicable)
   ↓
Documentation handoff:
- Customer-specific runbook
- Standard operating procedures
- Best practices guide
- Troubleshooting docs
   ↓
Q&A sessions
```

### 3.6 Phase 6: Go-live (Week 6-8)

```
Final QA
   ↓
**Soft launch:**
- Activate workflows
- Send first campaigns to limited audience
- Monitor deliverability
- Performance review
   ↓
**Full go-live:**
- All workflows active
- Full audience reach
- Real-time monitoring
   ↓
**Post-launch support:**
- First 2-4 weeks intensive CSM support
- Daily check-ins
- Quick issue resolution
- Initial optimization
```

### 3.7 Phase 7: Optimization (Week 8+)

```
Quarterly Business Reviews (QBR) begin
   ↓
Ongoing optimization:
- Campaign performance review
- A/B testing implementation
- Segmentation refinement
- New workflow development
- Predictive model improvements
   ↓
[Ongoing partnership]
```

---

## 4. User roles & permissions (RBAC)

ExpertSender používá **Role-Based Access Control (RBAC)** s custom roles. Méně rigidní než předefinované roly v Mailchimp/MailerLite.

### 4.1 Default role typy (per documentation hints)

Z reviews + dokumentace se objevují tyto základní role:

#### A) Account Owner

- 1 per account (or per sub-account in multi-account setup)
- **Full access + billing + close account**
- Cannot be removed without ownership transfer

#### B) Administrator

- Full operational access
- User management
- Integration management
- Domain authentication
- **No close account**

#### C) Marketer / Campaign Manager

- Campaign creation + sending
- Workflow management
- Segment management
- Template management
- Limited admin

#### D) Analyst / Reporting

- Read-only access
- Reports + analytics
- No editing

#### E) Developer / API user

- API access management
- Integration setup
- Technical configuration
- Custom event tracking setup

#### F) Custom roles (RBAC)

- Build per permission needs
- Granular permissions per feature
- Multi-account scoping possible
- Per-list/segment restrictions

### 4.2 Permission categories (granular)

#### Account & Settings

- Account management
- Billing access
- User management
- Integration management
- Domain settings
- API key management

#### Customer Data

- View customer profiles
- Edit customer profiles
- Delete customer profiles
- Import customers
- Export customers (security-sensitive)
- View customer events

#### Segmentation

- View segments
- Create/edit segments
- Delete segments
- View RFM analysis

#### Campaigns

- View campaigns
- Create campaigns
- Edit campaigns
- Send campaigns
- Schedule campaigns
- Delete campaigns

#### Workflows

- View workflows
- Create/edit workflows
- Activate workflows
- Deactivate workflows
- Delete workflows

#### Templates

- View templates
- Create/edit templates
- Delete templates
- Brand kit management

#### Channels

- Email management
- SMS management
- Push notifications
- On-site personalization
- Per-channel permissions granular

#### Reports

- View reports
- Create custom reports
- Schedule reports
- Export reports

#### Technical

- API access
- Webhook configuration
- Custom integration setup

### 4.3 Permission matrix (typical setup)

| Akce                    | Owner | Admin | Marketer | Analyst | Developer |  Custom  |
| ----------------------- | :---: | :---: | :------: | :-----: | :-------: | :------: |
| **Account & Billing**   |       |       |          |         |           |          |
| Close account           |  ✅   |  ❌   |    ❌    |   ❌    |    ❌     |    ❌    |
| Manage billing          |  ✅   |  ❌   |    ❌    |   ❌    |    ❌     | per role |
| Manage users            |  ✅   |  ✅   |    ❌    |   ❌    |    ❌     | per role |
| **Customer Data**       |       |       |          |         |           |          |
| View customers          |  ✅   |  ✅   |    ✅    |   ✅    | per role  | per role |
| Edit customers          |  ✅   |  ✅   |    ✅    |   ❌    | per role  | per role |
| Export customers        |  ✅   |  ✅   |    ❌    |   ❌    |    ❌     | per role |
| Import customers        |  ✅   |  ✅   |    ✅    |   ❌    |    ✅     | per role |
| Delete customers        |  ✅   |  ✅   |    ❌    |   ❌    |    ❌     | per role |
| **Segmentation**        |       |       |          |         |           |          |
| View segments           |  ✅   |  ✅   |    ✅    |   ✅    | per role  | per role |
| Create segments         |  ✅   |  ✅   |    ✅    |   ❌    | per role  | per role |
| RFM analysis            |  ✅   |  ✅   |    ✅    |   ✅    | per role  | per role |
| **Campaigns**           |       |       |          |         |           |          |
| Create campaign         |  ✅   |  ✅   |    ✅    |   ❌    | per role  | per role |
| Send campaign           |  ✅   |  ✅   |    ✅    |   ❌    | per role  | per role |
| **Workflows**           |       |       |          |         |           |          |
| Build workflows         |  ✅   |  ✅   |    ✅    |   ❌    | per role  | per role |
| Activate workflows      |  ✅   |  ✅   |    ✅    |   ❌    | per role  | per role |
| **Templates**           |       |       |          |         |           |          |
| Create/edit             |  ✅   |  ✅   |    ✅    |   ❌    | per role  | per role |
| **Channels**            |       |       |          |         |           |          |
| Email send              |  ✅   |  ✅   |    ✅    |   ❌    | per role  | per role |
| SMS send                |  ✅   |  ✅   |    ✅    |   ❌    | per role  | per role |
| Push send               |  ✅   |  ✅   |    ✅    |   ❌    | per role  | per role |
| On-site management      |  ✅   |  ✅   |    ✅    |   ❌    | per role  | per role |
| **Reports & Analytics** |       |       |          |         |           |          |
| View reports            |  ✅   |  ✅   |    ✅    |   ✅    | per role  | per role |
| Custom reports          |  ✅   |  ✅   |    ✅    |   ✅    | per role  | per role |
| **Technical**           |       |       |          |         |           |          |
| Manage integrations     |  ✅   |  ✅   |    ❌    |   ❌    |    ✅     | per role |
| Manage API keys         |  ✅   |  ✅   |    ❌    |   ❌    |    ✅     | per role |
| Domain settings         |  ✅   |  ✅   |    ❌    |   ❌    |    ✅     | per role |

### 4.4 Multi-account setup (Enterprise)

```
Parent Account (master)
├── Owner of master
└── Multiple sub-accounts
    ├── Brand A
    │   ├── Sub-account admin
    │   ├── Users per RBAC
    │   ├── Isolated data
    │   ├── Own segments + campaigns
    │   └── Own integrations
    │
    ├── Brand B
    │   └── ...
    │
    └── Brand C
        └── ...
```

Similar concept jako GetResponse MAX nebo HubSpot Business Units.

### 4.5 User invitation flow

```
Admin: Settings → Users → Add user
   ↓
Enter email + role selection
   - Predefined role (Admin, Marketer, etc.)
   - OR Custom role
   ↓
If Custom role, configure permissions per feature
   ↓
For multi-account: assign access to specific account(s)
   ↓
Send invitation
   ↓
Invitee email
   ↓
User clicks "Accept" + sets password
   ↓
[Active user]
```

### 4.6 SSO/SAML (Enterprise)

- **SSO/SAML support** available pro Enterprise
- Integration s Okta, OneLogin, Azure AD
- **2FA enforcement** option
- **Audit logs** for compliance

---

## 5. Account Owner flow

### 5.1 Onboarding (post-contract)

```
Contract signed → Owner credentials provided
   ↓
First login
   ↓
Welcome from dedicated CSM
   ↓
Kickoff meeting scheduled
   ↓
Onboarding plan reviewed
   ↓
Domain authentication setup s technical team
   ↓
Initial team members invited
   ↓
Integration kickoff
   ↓
Strategic onboarding begins (4-8 weeks)
```

### 5.2 Daily Owner workflow (post-launch)

```
Login → Dashboard
   ↓
Account overview:
- Total active customers
- Monthly send volume per channel
- Revenue attributed
- Active workflows count
- Recent campaign performance
- Deliverability metrics
- Predictive scores trends
   ↓
Strategic activities:
- Plan-tier review vs. growth
- Add-on usage review
- CSM relationship health
- Team performance
- ROI tracking
- New use case identification
```

### 5.3 Kritické Owner-only akce

#### Close account

```
Owner → Settings → Account → Close account
   ↓
Confirmation flow
   ↓
**CSM notified** – attempts retention conversation
   ↓
Contract terms review (early termination penalties possible)
   ↓
If proceeding:
- Data export offered (CSM helps)
- 30-day grace period for data retrieval
- Account scheduled for closure
- Data deleted per GDPR retention
```

#### Manage contracts

- Annual renewal discussions s CSM 60-90 days pre-renewal
- Plan changes mid-contract require formal request
- Add-on additions can be flexible

#### Strategic relationship

- Quarterly Business Reviews (QBR) s CSM + leadership
- Roadmap input
- Feature requests escalation
- Partner advisory board (top customers)

---

## 6. Administrator flow

Administrator = top-level operational role.

### 6.1 Daily Administrator workflow

```
Login → Dashboard
   ↓
Operational checks:
- Yesterday's campaign metrics
- Active workflow health
- Deliverability stats
- Failed/error workflows
- Integration sync status
- User management requests
- API key usage
   ↓
Actions:
- User management (invite, edit, remove)
- Custom role management
- Domain settings review
- Integration troubleshooting
- API key rotation
- Audit log review
```

### 6.2 User management flow

```
Admin: Settings → Users → Add user
   ↓
Enter email + role
   ↓
If Custom role:
- Define permission set per feature
- Per-list/segment restrictions
   ↓
Multi-account scoping (if applicable)
   ↓
Send invitation
   ↓
User accepts + activates
   ↓
[New user in account]
```

### 6.3 Integration management

```
Admin: Settings → Integrations
   ↓
Active integrations list
   ↓
Per integration:
- View status
- Edit configuration
- Re-authorize OAuth (if expired)
- View sync logs
- Disable/Remove
   ↓
Add new integration:
- Choose from native list
- OAuth flow OR API key
- Configure data mapping
- Test sync
- Activate
```

### 6.4 API key management

```
Admin: Settings → API → Keys
   ↓
Generate new key
   ↓
Name + scope/permissions
   ↓
**Key generated and displayed**
   ↓
Copy + store securely
   ↓
**Used by integrations, custom scripts, dev work**
   ↓
Optional: rotate keys quarterly
```

### 6.5 Domain authentication

```
Admin: Settings → Domains
   ↓
Add sending domain
   ↓
ExpertSender generates DNS records:
- DKIM CNAME (2x)
- SPF include
- DMARC TXT (optional, recommended)
- Branded tracking domain CNAME
   ↓
Add records to DNS provider
   ↓
ExpertSender validates
   ↓
[Domain authenticated]
   ↓
Emails sign with your domain
```

---

## 7. Marketer / Campaign Manager flow

Marketer = výkonný marketing user, daily campaign + workflow management.

### 7.1 Daily Marketer workflow

```
Login → Dashboard
   ↓
Activities:
- Build segments (incl. RFM-driven)
- Schedule campaigns
- Review workflow performance
- Optimize workflow logic
- A/B test setup
- Template updates
- Pop-up management
- Predictive scores monitoring
   ↓
Strategic:
- Customer journey mapping
- Cross-channel orchestration planning
- New automation idea testing
```

### 7.2 Create campaign

```
Campaigns → Create campaign
   ↓
Type:
- Regular
- A/B test
- Multivariate
- Triggered (event-based)
   ↓
Audience:
- Segment selection (or list)
- Suppression lists
- Predictive segment override
   ↓
Setup:
- Subject + preview text
- From name + email (verified)
- Reply-to
- Conversion goal
- UTM parameters
   ↓
Design:
- Drag-drop editor
- Custom HTML option
- Personalization tokens
- Dynamic content blocks
- Product recommendations block
   ↓
Tracking:
- Open + click tracking
- Conversion tracking (orders)
- Revenue attribution
- Custom events
   ↓
Preview & Test:
- Preview per device
- Send test
- Spam test
- Inbox preview
   ↓
Send/Schedule:
- Send now
- Schedule
- STO (Send Time Optimization, AI per user)
- Time-zone send
- Throttled
   ↓
Confirm
```

### 7.3 Build multichannel workflow

```
Workflows → Create new
   ↓
A) From scratch on canvas
B) Template
   ↓
A) Configure:
   1. Trigger:
      - Behavioral (page visited, custom event)
      - Transactional (order placed, cart abandoned)
      - Engagement (email opened/clicked)
      - Lifecycle (subscribed, unsubscribed)
      - Predictive (churn threshold, CLV change)
      - Date-based
      - Custom
   ↓
   2. Workflow filters (entry conditions)
   ↓
   3. Build flow body:
      - Email send (designed inline)
      - SMS send
      - Web push send
      - Mobile push send
      - On-site action
      - Delay (with Time Travel)
      - Wait until event
      - Condition (yes/no branching)
      - A/B split
      - Update profile property
      - Add/remove tag
      - Add to segment
      - Webhook
      - Goal (conversion event)
      - Exit condition
   ↓
   4. Multi-channel orchestration:
      - Email first
      - If no open → web push
      - If no convert → SMS
      - If still no → final email
   ↓
   5. Goal tracking + exit
   ↓
   6. Test (preview as profile, send test)
   ↓
   7. Activate
   ↓
[Workflow Live]
```

### 7.4 Segment building (RFM-driven)

```
Segments → Create segment
   ↓
Choose type:
- Standard (manual criteria)
- RFM-based (cohort selection)
- Predictive-based (score thresholds)
- Hybrid
   ↓
Add filter conditions:
- Profile attributes
- Transactional metrics
- Behavioral events
- Engagement metrics
- Predictive scores (CLV, churn, NPD)
- RFM cohort membership
- Segment membership (nested)
- Time-based conditions
   ↓
Combine with AND/OR/NOT operators
   ↓
Preview segment size (real-time)
   ↓
Save segment
   ↓
[Dynamic segment active]
   ↓
Use in campaigns, workflows, audience sync
```

---

## 8. Customer Success Manager (CSM) flow

ExpertSender's klíčový differentiator – **dedicated CSM per klient**.

### 8.1 CSM responsibilities

- **Strategic partnership** (ne pure technical support)
- **Quarterly Business Reviews (QBR)**
- **Performance optimization** suggestions
- **New use case identification**
- **Feature request triage**
- **Escalation point** for issues
- **Migration coordination** (during onboarding)
- **Training delivery**
- **Best practices sharing**

### 8.2 CSM interaction model

```
Weekly check-ins (early days, first 3 months):
- 30-60 min call
- Performance review
- Issue resolution
- Next steps planning
   ↓
Monthly check-ins (after stabilization):
- 30-min call
- Metrics review
- New ideas discussion
- Escalations
   ↓
Quarterly Business Reviews (QBR):
- 1-2 hour deep dive
- Performance vs. goals
- ROI tracking
- Roadmap alignment
- Strategic planning
- New tests / experiments planning
   ↓
Annual strategic review:
- Year-over-year performance
- Contract renewal discussion
- Strategic roadmap
- Major initiatives
```

### 8.3 CSM access to account

- **Read access** to customer account (per consent)
- **Limited debug access** with explicit permission
- **Cannot send on customer's behalf** without explicit approval
- **Activity logged** in audit logs
- **GDPR-compliant** access

### 8.4 CSM value claim

ExpertSender's case studies cite **CSM impact** as key ROI driver:

- 4F case study: dedicated strategist contributed to 12× ROI
- Continuous optimization vs. static setup
- "Partner not just tool" positioning

### 8.5 CSM critique

Některé G2 reviews note:

- **Quality of CSM varies** per individual
- **Some CSMs more responsive** than others
- **Coverage during off-hours** (different regions)
- Resolution speed depends on tier of support

---

## 9. Customer profile lifecycle

### 9.1 Identity creation paths

#### A) Anonymous tracking (cookie)

```
Visitor lands on website (no cookie)
   ↓
ExpertSender JS snippet drops cookie ID
   ↓
**Anonymous profile created** in CDP
   ↓
Track:
- Page views
- Time on page
- Search queries
- Cart events
- Product views
   ↓
**Anonymous profile s rich behavior data**
   ↓
NO email/phone yet
```

#### B) Email capture (form submission)

```
Anonymous visitor (cookie set)
   ↓
Visitor sees pop-up / signup form
   ↓
Submits email
   ↓
ExpertSender:
- Validates email
- Checks for existing profile (anonymous via cookie)
- **MERGES** anonymous + identified profiles
- Single profile s all history
- Records consent (timestamp, IP, source)
   ↓
Status: Active (or Pending if double opt-in)
   ↓
Workflow trigger: Subscribed
   ↓
Welcome series begins
```

#### C) E-commerce account creation

```
Customer creates account on Shopify (or other platform)
   ↓
E-commerce webhook → ExpertSender CDP
   ↓
ExpertSender:
- Identifies if anonymous profile exists (cookie match)
- Creates or merges profile
- Records customer data (name, email, phone, address)
- Records marketing_consent flag
- Adds to designated segment
   ↓
[Identified profile s e-commerce link]
```

#### D) Purchase without account (guest checkout)

```
Guest visitor places order
   ↓
E-commerce webhook → ExpertSender
   ↓
Profile created/updated:
- Anonymous → guest (with email)
- Order recorded
- Behavioral history retained
   ↓
Note: marketing consent depends on opt-in during checkout
   ↓
If opted in: workflow trigger fires
If not: profile exists but no marketing communication
```

#### E) Manual import (CSV / API)

```
Admin: import contacts from CSV
   ↓
Field mapping (email, name, custom fields)
   ↓
Consent confirmation (must be opt-in)
   ↓
Validation (email syntax, deduplication)
   ↓
Import processed
   ↓
**Identity resolution attempts:**
- Match by email to existing profiles (anonymous or other)
- Merge if found
- Create new if not
   ↓
[Imported profiles in CDP]
```

#### F) Mobile app sign-up

```
User installs mobile app
   ↓
SDK registers device + push token
   ↓
Anonymous mobile profile
   ↓
User signs up s email
   ↓
Profile merged (mobile + web)
   ↓
[Cross-device profile]
```

### 9.2 Subscriber states

```
Anonymous → cookie tracking, no email
   ↓
Identified-Guest → email known, no marketing opt-in
   ↓
Subscribed → email + marketing consent
   ↓
Various transitions:
- Unsubscribed (opt-out)
- Bounced (hard bounce)
- Spam complaint
- Deleted (manual or GDPR)
- Reactivated (re-subscribe)
```

### 9.3 Engagement & tracking continuous

```
Identified subscriber
   ↓
Receives campaign / automation message (email/SMS/push)
   ↓
Engagement recorded:
- Open, click (email)
- Click (SMS via shortened URL)
- Click (push)
- On-site behavior (web/mobile)
   ↓
Profile updates:
- Last activity timestamp
- Engagement scores
- Tag updates
- Predictive scores recalculated
   ↓
Segments re-evaluated real-time
   ↓
Workflow triggers fire if new conditions met
```

### 9.4 Preference Center

```
Email footer: "Manage preferences" link
   ↓
ExpertSender-hosted preference page (s tokenem)
   ↓
Customer sees:
- Per-channel subscription status (email, SMS, push)
- Personal info (editable)
- Preferences (frequency, topics, categories)
- "Unsubscribe from all" master toggle
- "Delete my account" (GDPR)
   ↓
Update preferences
   ↓
Profile updated immediately
   ↓
Workflow triggers fire (consent changes)
```

### 9.5 Unsubscribe

```
Customer clicks Unsubscribe
   ↓
Per channel:
- Email: remove from email marketing
- SMS: STOP keyword reply
- Web push: browser-side unsubscribe
- Mobile push: app settings
   ↓
ExpertSender:
- Updates channel-specific consent
- Logs unsubscribe event (timestamp, IP, source)
- Workflow trigger: Unsubscribed
   ↓
**Profile retained** (data preservation)
- But excluded from that channel
- Can resubscribe later via form
```

### 9.6 Bounce handling

#### Hard bounce

```
ISP returns 5xx
   ↓
ExpertSender marks Hard Bounce
   ↓
Auto-suppression from email channel
   ↓
Profile status updated
   ↓
Other channels still active (SMS, push)
```

#### Soft bounce

```
ISP returns 4xx
   ↓
ExpertSender retries (multiple attempts)
   ↓
If repeated → escalate to Hard Bounce
   ↓
If recovered → status restored
```

### 9.7 Spam complaint

```
Recipient marks as spam
   ↓
ISP FBL → ExpertSender
   ↓
Auto-suppression all channels
   ↓
Logged for sender reputation tracking
   ↓
Internal review if pattern emerges
```

### 9.8 Profile timeline

V profile UI viditelný chronological timeline:

- All page views
- All product views, searches
- All cart events
- All orders
- All email sends, opens, clicks
- All SMS interactions
- All push interactions
- All form submissions
- All workflow enrollments
- All segment memberships changes
- All predictive score changes

---

## 10. Identity resolution flow

### 10.1 Identity matching logic

```
Multiple identifiers per profile:
- Email address
- Phone number
- Cookie ID(s) (multiple devices)
- User account ID
- Mobile device ID
- Loyalty card number
- Custom external ID
   ↓
ExpertSender uses **deterministic matching**:
- Email match → merge
- Phone match → merge
- Cookie match → merge (within same browser/device)
- External ID match → merge
   ↓
Cross-device stitching:
- Same email entered on multiple devices → all cookies linked
- Phone provided + email → both identifiers linked
- Mobile app login s email → mobile + web profiles merged
```

### 10.2 Stitching example

```
Step 1: User visits site on iPhone (cookie A)
   - Anonymous profile A_iphone
   - Views products, adds to cart

Step 2: Same user visits on laptop (cookie B)
   - Anonymous profile B_laptop
   - Different session, no link yet

Step 3: User signs up on laptop (provides email)
   - Profile B_laptop identified
   - cookie B + email linked

Step 4: User opens email on iPhone
   - Click tracked
   - iPhone session identified via email link
   - cookie A → matched to email
   - **Profiles A_iphone + B_laptop MERGE**
   - Single unified profile

Result: One profile s:
- Both cookies tracked
- All browse history from both devices
- All cart events
- All email engagement
- All future activity unified
```

### 10.3 Merge conflict handling

When two profiles merge, conflicts can arise:

- **First name** differs → primary profile wins (last updated)
- **Email** differs → both stored (additional emails property)
- **Custom fields** → merge with conflict resolution rules
- **Consent** → most recent timestamp wins
- **Subscription status** → most restrictive wins (privacy)

### 10.4 Manual merge

In rare cases, manual merge needed:

```
Admin: Customers → Search for duplicate
   ↓
Find duplicate profiles (same person, separate records)
   ↓
Select primary profile
   ↓
Click "Merge with..."
   ↓
Select secondary profile
   ↓
Review conflict resolution rules
   ↓
Confirm merge
   ↓
Secondary profile data moved to primary
   ↓
Secondary deleted
```

---

## 11. RFM analysis flow

### 11.1 RFM scoring continuous

```
For each customer:
   ↓
Calculate **Recency:**
- Days since last purchase
- Score 1-5 (5 = most recent)
   ↓
Calculate **Frequency:**
- Number of orders in time window
- Score 1-5 (5 = most frequent)
   ↓
Calculate **Monetary:**
- Total spent in time window
- Score 1-5 (5 = highest)
   ↓
Combined RFM score (e.g. R5F5M5 = Champion)
   ↓
Auto-assign to RFM cohort
```

### 11.2 RFM cohort transitions

Customers move between cohorts based on behavior:

```
"New Customer" (just bought first time)
   ↓ continues buying →
"Potential Loyalists"
   ↓ continues engaging →
"Loyal Customers"
   ↓ top spending + recent →
"Champions"

Alternative path:
"Champions"
   ↓ no purchase for X days →
"At Risk"
   ↓ no engagement for 2X days →
"Cannot Lose Them"
   ↓ no purchase for very long →
"Hibernating"
   ↓ inactive long-term →
"Lost"
```

### 11.3 Cohort-triggered automation

```
Customer enters cohort "At Risk"
   ↓
Workflow trigger: "Joined segment: At Risk"
   ↓
Re-engagement campaign:
- Email 1: "We miss you" + 15% discount
- Wait 3 days
- Email 2: Curated picks based on past purchases
- Wait 7 days
- Web push: gentle reminder
- Wait 10 days
- SMS (if opted in): time-sensitive offer
   ↓
Goal: purchase → exit (returned to active cohort)
```

### 11.4 RFM customization

```
Admin: Settings → RFM configuration
   ↓
Customize:
- Time window (last 30, 90, 180, 365 days)
- Score boundaries per dimension
- Cohort definitions
- Exclusions (test orders, refunds, $0 orders)
   ↓
Save → recalculation triggered
   ↓
Cohort memberships update
```

### 11.5 RFM analytics

```
Reports → RFM Analysis
   ↓
View:
- Cohort distribution (% in each)
- Customer counts per cohort
- Revenue per cohort
- AOV per cohort
- Trends over time
- Cohort transitions (sankey diagram)
   ↓
Identify:
- Largest cohorts
- Highest-value cohorts
- Growth cohorts
- At-risk cohorts requiring attention
```

---

## 12. Email lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  1. USER drafts campaign/workflow email                         │
│     - Select audience (segment, RFM cohort)                     │
│     - Configure trigger (for workflow)                          │
│     - Design + personalization                                  │
│     - Product recommendations block                             │
│                            │                                    │
│                            ▼                                    │
│  2. PRE-SEND CHECKS (ExpertSender auto):                        │
│     - Sender verified?                                          │
│     - Domain authentication status                              │
│     - Audience valid?                                           │
│     - Volume within plan?                                       │
│     - Spam test pass?                                           │
│     - Content compliance check                                  │
│                            │                                    │
│                            ▼                                    │
│  3. SEND TIME determination:                                    │
│     - Manual time                                               │
│     - Send Time Optimization (STO, AI per user)                 │
│     - Time-zone send                                            │
│     - Throttled (spread over period)                            │
│                            │                                    │
│                            ▼                                    │
│  4. PER-RECIPIENT EMAIL GENERATION                              │
│     - Merge fields resolved (Single Customer 360°)              │
│     - Dynamic content evaluated (per segment)                   │
│     - Product recommendations (AI per profile)                  │
│     - Personalized images (if configured)                       │
│     - Tracking pixels embedded                                  │
│     - Click trackers wrapped                                    │
│                            │                                    │
│                            ▼                                    │
│  5. IP ROUTING (engagement-based)                               │
│     - Best engagers → best IP pool                              │
│     - New subscribers → warming pool                            │
│     - Re-engagement → separate pool                             │
│     - Throttling applied                                        │
│                            │                                    │
│                            ▼                                    │
│  6. SMTP SEND from ExpertSender EU infra                        │
│     - From: configured verified sender                          │
│     - DKIM signed with your domain key                          │
│     - SPF: ExpertSender mailfrom                                │
│     - DMARC compliant                                           │
│     - List-Unsubscribe RFC 8058                                 │
│     - One-click unsubscribe                                     │
│                            │                                    │
│                            ▼                                    │
│  7. ISP RECEIVES (Gmail/Outlook/Yahoo):                         │
│     - SPF + DKIM + DMARC checks                                 │
│     - Reputation check (IP + domain)                            │
│     - Content filters                                           │
│     - Engagement history                                        │
│                            │                                    │
│                            ▼                                    │
│  8. ROUTING:                                                    │
│     - Inbox / Primary                                           │
│     - Promotions                                                │
│     - Spam                                                      │
│                            │                                    │
│                            ▼                                    │
│  9. RECIPIENT INTERACTION:                                      │
│     - Open → pixel → "Opened" event                             │
│     - Click → ExpertSender redirect → "Clicked" event           │
│     - Web tracking script fires page events on landing          │
│                            │                                    │
│                            ▼                                    │
│ 10. ATTRIBUTION:                                                │
│     - Email → page → purchase = revenue attribution             │
│     - Configurable attribution window (default 7-day)           │
│     - Multi-touch attribution available                         │
│                            │                                    │
│                            ▼                                    │
│ 11. PROFILE UPDATE:                                             │
│     - Engagement metrics                                        │
│     - Predictive scores recalculated                            │
│     - Segments re-evaluated                                     │
│     - RFM cohort potentially updated                            │
│                            │                                    │
│                            ▼                                    │
│ 12. WORKFLOW TRIGGERS:                                          │
│     - "Opened" event → if workflow trigger matches              │
│     - "Clicked" → cross-sell flows                              │
│     - "Order placed" via attribution → post-purchase            │
│                            │                                    │
│                            ▼                                    │
│ 13. REPORTING:                                                  │
│     - Real-time stats                                           │
│     - Revenue attributed                                        │
│     - Per-campaign + per-workflow analytics                     │
│     - Multi-channel attribution                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 13. Multichannel workflow execution

### 13.1 Workflow activation

```
Marketer builds workflow (drag-drop)
   ↓
Save as Draft
   ↓
Test mode:
- Preview as specific customer
- Send test through full flow
- Validate per-channel send
   ↓
**Activate**
   ↓
ExpertSender validation:
- All steps configured
- Triggers valid
- Channels enabled
- Templates designed
   ↓
[Status: Active]
   ↓
Workflow engine starts evaluation
```

### 13.2 Multi-channel orchestration

```
Trigger fires (e.g. Cart abandoned)
   ↓
Customer enters workflow
   ↓
Step 1: Wait 1h
   ↓
Step 2: Send EMAIL (cart reminder)
   ↓
Step 3: Wait 3h
   ↓
Step 4: Condition - Email opened?
   YES → Continue waiting for purchase
   NO → Step 5: Send WEB PUSH (silent reminder)
   ↓
Step 5: Wait 24h
   ↓
Step 6: Condition - Purchased?
   YES → Exit (goal achieved)
   NO → Step 7: Send EMAIL (10% discount)
   ↓
Step 7: Wait 48h
   ↓
Step 8: Condition - Purchased?
   YES → Exit
   NO → Step 9: Send SMS (final reminder, if opt-in)
   ↓
Step 9: Wait 7 days
   ↓
Step 10: Send EMAIL (cross-sell)
   ↓
Exit workflow
```

### 13.3 Cross-channel data sharing

- Email open → updates SMS workflow logic
- Push click → impacts email send time
- On-site behavior → triggers SMS
- All channels share same profile data
- Real-time updates across channels

### 13.4 Channel selection logic

For each step, marketer chooses optimal channel:

- **Email** – detailed content, longer engagement
- **SMS** – urgent, time-sensitive, high open rate
- **Web push** – passive reminder, no email needed
- **Mobile push** – app users, contextual
- **On-site** – when customer returns to site

### 13.5 Frequency caps cross-channel

```
Global frequency cap config:
- Max emails per customer per week
- Max SMS per month
- Max push per day
   ↓
Workflow respect caps:
- If at cap → skip step OR delay
- If approaching cap → priority routing
   ↓
Suppression for over-messaged customers
```

---

## 14. E-commerce flow

### 14.1 Integration data sync

```
E-commerce platform (Shopify/Magento/etc.)
   ↓
Continuous webhook sync to ExpertSender:
- Customers (created, updated)
- Orders (placed, shipped, refunded)
- Products (added, updated)
- Cart events (added, removed, abandoned)
- Wishlist events
- Customer service events (returns, complaints)
   ↓
ExpertSender CDP updates:
- Customer profiles
- Product catalog
- Behavioral history
- Transactional history
- Predictive scores recalculated
```

### 14.2 Real-time event triggers

```
Customer event → Webhook fires
   ↓
ExpertSender ingests event (within seconds)
   ↓
Profile updates
   ↓
Workflow trigger evaluation:
- Does any active workflow match this event?
- If yes → customer enters workflow
   ↓
Real-time activation across channels
```

### 14.3 Abandoned cart flow (e-commerce specific)

```
Customer adds product to cart
   ↓
Shopify cart event → ExpertSender
   ↓
ExpertSender tracks cart state per customer
   ↓
If checkout not completed within 30 min:
- Workflow trigger: "Cart abandoned"
   ↓
Wait 1h (cool-off period)
   ↓
Email: "Forgot something?"
- Pulls cart contents dynamically
- Product images, prices, direct checkout link
   ↓
Wait 24h
   ↓
Condition: Order placed in last 24h?
   YES → Exit
   NO → Email: 10% discount code
   ↓
[Multi-channel continues...]
```

### 14.4 Post-purchase upsell flow

```
Order placed → "Order placed" event
   ↓
Workflow: Post-purchase based on category
   ↓
Branch by product:
- Skincare → tutorial email + similar products
- Supplements → consumption guide + replenishment reminder
- Apparel → care guide + matching items
- Electronics → setup guide + accessories
   ↓
Each branch:
- Day 0: Order confirmation (transactional, auto)
- Day 3: Welcome / tutorial
- Day 7: Review request
- Day 14: Cross-sell related
- Day 30: VIP welcome (if CLV threshold)
- Day 60+: Replenishment (if predicted NPD approaching)
```

### 14.5 Browse abandonment flow

```
Customer browses product (Logged in, identified)
   ↓
ExpertSender JS tracks: "Viewed product"
   ↓
After 30 minutes without "Added to cart":
- Workflow trigger: Browse abandonment
   ↓
Wait 1h
   ↓
Email: "Take another look"
- Dynamic product block s viewed item
- Related products
- Discount offer
   ↓
Wait 24h, condition: still browsing same product?
   YES → Send web push "Still interested?"
   NO → Cross-sell different category
```

### 14.6 Predictive replenishment flow

```
Customer placed order day 0
   ↓
ML calculates Next Purchase Date (NPD)
   ↓
For consumables, NPD might be 60 days
   ↓
Workflow trigger: NPD - 7 days (configurable)
   ↓
On day 53:
- Email: "Time to restock?"
- Product block s exact item from past order
- Convenient reorder link
   ↓
On day 60 (predicted):
- Web push: "Still need it? Order now"
   ↓
On day 70 (overdue):
- SMS: special offer for prompt reorder
```

---

## 15. Product recommendations flow

### 15.1 Recommendation engine setup

```
Initial training (onboarding):
- Historical orders ingested
- Browse history processed
- Customer-product affinity calculated
- Collaborative filtering model trained
- Content-based model trained
   ↓
Ongoing learning:
- New orders update models
- Customer feedback (click/no click) refines
- New products added to catalog
   ↓
Real-time recommendations ready
```

### 15.2 Per-channel activation

#### In emails

```
Email template contains "Recommendations block"
   ↓
On send time:
- For each recipient:
  - Query recommendation engine
  - Get top N products per strategy
  - Render in email
   ↓
Personalized email per recipient
```

#### On-site

```
Customer browses website
   ↓
JS snippet requests recommendations
   ↓
Engine returns per context:
- Homepage: trending + personal
- Product page: similar + frequently bought
- Cart page: complementary
- Checkout: last-minute add-ons
   ↓
Widgets display
```

#### Push notifications

```
Workflow includes "Send push with recommendations"
   ↓
On execution:
- Query engine for top 1 product for this customer
- Include image + name + price in push
- Deep link to product
```

### 15.3 Strategy selection

Marketer can choose strategy per use case:

- **Collaborative filtering** – "Customers like you bought X"
- **Content-based** – "Similar to what you viewed"
- **Personalized** – ML per profile
- **Trending** – aggregate popular
- **Cross-sell** – complementary
- **Upsell** – higher-priced alternatives

---

## 16. Transactional email flow

### 16.1 Setup

```
Admin: Settings → Transactional → API
   ↓
Configure:
- Default sender
- Branded templates
- DKIM authentication
- API key
   ↓
[Transactional ready]
```

### 16.2 API send flow

```
E-commerce store → POST /transactional/send
   {
     "template_id": "order_confirmation",
     "recipient": {
       "email": "customer@example.com",
       "profile_id": "12345"
     },
     "variables": {
       "order_number": "ORD-2026-001",
       "items": [...],
       "total": "€89.99"
     }
   }
   ↓
ExpertSender:
- Validates API key
- Renders template with variables
- Per-recipient personalization
- Tracks open + click
- Records event in CDP
   ↓
Sends via dedicated transactional infrastructure
   ↓
Logged in customer profile activity timeline
```

### 16.3 Unified vs. separate transactional

**Key advantage:** transactional + marketing v jedné CDP.

Benefits:

- Customer profile shows BOTH marketing + transactional in single timeline
- Transactional events trigger marketing workflows (e.g. order placed → post-purchase flow)
- Unified analytics
- Single billing
- Shared templates if needed

### 16.4 Common transactional use cases

- Order confirmations
- Shipping notifications
- Delivery confirmations
- Return / refund notifications
- Password resets
- Account verification
- Receipt / invoice
- Customer service responses

### 16.5 Hybrid example

```
Order placed (transactional trigger)
   ↓
Transactional email sent: Order confirmation
   ↓
**Same event** also triggers marketing workflow:
   - Post-purchase welcome
   - Tutorial sequence
   - Review request
   ↓
Customer profile shows full lifecycle in one timeline
```

---

## 17. API & Integration flow

### 17.1 API key creation

```
Admin: Settings → API → Keys
   ↓
+ Create API key
   ↓
Configure:
- Name (descriptive)
- Permissions / scopes
- IP whitelist (optional)
- Expiration (optional)
   ↓
Generate
   ↓
**Key displayed once** – copy + secure storage
   ↓
[Key active]
```

### 17.2 API request flow

```
Application code:
   POST https://api.expertsender.com/v2/Subscribers
   Headers:
     X-Auth-Token: {api_key}
     Content-Type: application/json
   Body: { subscriber data }
   ↓
ExpertSender:
- Validates auth
- Rate limit check
- Permission check (key scope)
- Validates payload
   ↓
Response 200/201
   ↓
Subscriber created/updated in CDP
   ↓
Identity resolution attempted
   ↓
Workflow triggers if applicable
```

### 17.3 Event tracking API

```
E-commerce store / app → POST /events
   {
     "event_type": "ViewedProduct",
     "profile_id": "12345",  // or email/external_id
     "properties": {
       "product_id": "P-001",
       "category": "Shoes",
       "price": 89.99
     }
   }
   ↓
ExpertSender:
- Resolves profile (create if not exists)
- Records event
- Updates predictive scores
- Triggers workflows if matches
```

### 17.4 Webhook subscriptions

```
Admin: Settings → Webhooks
   ↓
Add webhook:
- Target URL
- Events subscribed (multi-select)
- Authentication (secret key)
   ↓
ExpertSender POSTs on each event:
- Subscriber created/updated/unsubscribed
- Campaign sent/opened/clicked
- E-commerce events (order, cart abandon)
- Workflow events
   ↓
Application processes
- Verify signature
- Update internal systems
```

### 17.5 Integration setup flow (Shopify example)

```
Admin: Integrations → Shopify
   ↓
"Connect Shopify" button
   ↓
OAuth flow:
- Redirect to Shopify
- Customer authorizes
- ExpertSender receives token
   ↓
Configuration:
- Default list for new customers
- Sync historical data toggle (initial backfill)
- Tags/segments mapping
- Webhook configuration (automatic)
- Tracking script (provided for theme installation)
   ↓
Initial sync (can be 30 min – several hours for large stores):
- Customers → profiles
- Orders → events
- Products → catalog
- Abandoned carts → cart events
   ↓
Continuous sync active via webhooks
   ↓
[Integration complete]
```

---

## 18. GDPR & Compliance flow

### 18.1 EU hosting + ISO 27001

```
ExpertSender servers v Gdańsku, Polsko (EU)
   ↓
EU data residency default
   ↓
ISO 27001:2013 certified
   ↓
Silver Microsoft Partner
   ↓
GDPR-friendly by design
   ↓
DPA available electronically
```

### 18.2 Right to Be Forgotten

```
Customer requests deletion
   ↓
Method A: UI
- Admin: search customer → Actions → Delete (GDPR)
- Confirmation
- Delete

Method B: API
- DELETE /api/subscribers/{id}
- Or specialized GDPR endpoint

Method C: Customer self-service
- Preference center → "Delete my account"
- Verification (email confirmation)
- Submit
   ↓
ExpertSender:
- Removes profile data
- Anonymizes related events
- Suppresses email/phone permanently
- Logs deletion event (audit)
- Email confirmation
   ↓
GDPR retention period applies (typically immediate for personal data)
```

### 18.3 Data export per customer

```
Admin: Customer profile → Actions → Export GDPR data
OR
API: GET /subscribers/{id}/gdpr-export
   ↓
ExpertSender generates JSON/CSV:
- Profile data (all attributes)
- All events chronologically
- All channel subscriptions
- All campaign sends
- All form submissions
- Consent history
   ↓
Provides download (time-limited link)
```

### 18.4 Consent tracking

For each profile:

- Email subscription consent (timestamp, IP, source)
- SMS opt-in (timestamp, IP)
- Web push opt-in
- Mobile push opt-in
- Per-list consent (if multi-list)
- GDPR consent fields (form submissions)
- Double opt-in audit (if applicable)
- Per-channel opt-out timestamp

### 18.5 Consent management

```
Customer fills form s GDPR consent
   ↓
Form submission records:
- Email
- Timestamp
- IP address
- User agent
- Source (form ID)
- Consent checkbox state (true if checked)
- Consent text version (versioned)
   ↓
Audit trail v profile
   ↓
Can be exported on request
```

### 18.6 Compliance scenarios

#### Data Subject Access Request (DSAR)

```
Customer requests their data
   ↓
Admin: Generate GDPR export
   ↓
Provide to customer within 30 days (GDPR requirement)
```

#### Data deletion request

```
Customer requests deletion
   ↓
Admin: Process deletion
   ↓
Confirm within 30 days
   ↓
Notify customer
```

#### Consent withdrawal

```
Customer unsubscribes
   ↓
Immediate marketing suppression
   ↓
But profile data retained for legitimate interests
   ↓
Full deletion only on explicit request
```

### 18.7 Audit logs

- All admin actions logged
- All user changes logged
- All data access logged
- CSM access logged (with consent)
- API access logged
- Retention per compliance requirements
- Searchable by admin
- Exportable for audits

---

## 19. Datová mapa: co vidí kdo

| Data                  | Owner | Admin | Marketer | Analyst | Developer |  Custom  |    CSM    |   Customer    |    API    |
| --------------------- | :---: | :---: | :------: | :-----: | :-------: | :------: | :-------: | :-----------: | :-------: |
| Account & Billing     |  ✅   |  ❌   |    ❌    |   ❌    |    ❌     | per role |   read    |      ❌       | per scope |
| User management       |  ✅   |  ✅   |    ❌    |   ❌    |    ❌     | per role |    ❌     |      ❌       | per scope |
| All customer profiles |  ✅   |  ✅   |    ✅    |   ✅    | per role  | per role |   read    |   jen sebe    |    ✅     |
| Edit profiles         |  ✅   |  ✅   |    ✅    |   ❌    | per role  | per role |    ❌     |      ❌       |    ✅     |
| Export customers      |  ✅   |  ✅   |    ❌    |   ❌    |    ❌     | per role |    ❌     |    request    |    ✅     |
| Customer events       |  ✅   |  ✅   |    ✅    |   ✅    | per role  | per role |   read    |    jen své    |    ✅     |
| Segments              |  ✅   |  ✅   |    ✅    |   ✅    | per role  | per role |   read    |      ❌       |    ✅     |
| RFM analysis          |  ✅   |  ✅   |    ✅    |   ✅    | per role  | per role |   read    |      ❌       |    ✅     |
| Predictive scores     |  ✅   |  ✅   |    ✅    |   ✅    | per role  | per role |   read    |      ❌       |    ✅     |
| Campaigns             |  ✅   |  ✅   |    ✅    |  view   | per role  | per role |   read    | jen co dostal |    ✅     |
| Send campaigns        |  ✅   |  ✅   |    ✅    |   ❌    | per role  | per role |    ❌     |      ❌       |    ✅     |
| Workflows             |  ✅   |  ✅   |    ✅    |  view   | per role  | per role |   read    |      ❌       |    ✅     |
| Templates             |  ✅   |  ✅   |    ✅    |   ❌    | per role  | per role |   read    |      ❌       |    ✅     |
| Email channel         |  ✅   |  ✅   |    ✅    |   ❌    | per role  | per role |     –     |       –       |    ✅     |
| SMS channel           |  ✅   |  ✅   |    ✅    |   ❌    | per role  | per role |     –     |       –       |    ✅     |
| Push channel          |  ✅   |  ✅   |    ✅    |   ❌    | per role  | per role |     –     |       –       |    ✅     |
| On-site (popups)      |  ✅   |  ✅   |    ✅    |   ❌    | per role  | per role |     –     |       –       | per scope |
| Recommendations       |  ✅   |  ✅   |    ✅    |   ❌    | per role  | per role |     –     |       –       | per scope |
| Transactional         |  ✅   |  ✅   | per role |   ❌    |    ✅     | per role |     –     |       –       |    ✅     |
| Reports & analytics   |  ✅   |  ✅   |    ✅    |   ✅    | per role  | per role |   read    |      ❌       |    ✅     |
| Custom reports        |  ✅   |  ✅   |    ✅    |   ✅    | per role  | per role |   read    |      ❌       |    ✅     |
| Integrations          |  ✅   |  ✅   |    ❌    |   ❌    |    ✅     | per role |     –     |       –       | per scope |
| API keys              |  ✅   |  ✅   |    ❌    |   ❌    |    ✅     | per role |     –     |       –       |     –     |
| Domains               |  ✅   |  ✅   |    ❌    |   ❌    |    ✅     | per role |     –     |       –       | per scope |
| Audit logs            |  ✅   |  ✅   |    ❌    |   ❌    |    ❌     | per role |     –     |       –       | per scope |
| GDPR delete           |  ✅   |  ✅   | per role |   ❌    | per role  | per role |     –     |    request    | per scope |
| Multi-account view    |  ✅   |  ✅   |    ❌    |   ❌    |    ❌     | per role | per scope |      ❌       | per scope |

---

## 20. Známé úzkoprofilové místa

### 20.1 Sales process

- **No self-serve sign-up** – muset přes demo + sales call
- **Long sales cycle** – often 1-3 months for enterprise
- **No transparent pricing** – difficult for fast evaluation
- **Qualifying criteria strict** (30K+ visits/month minimum)
- **No free plan** vs. Mailchimp / MailerLite / Brevo

### 20.2 Onboarding

- **4-8 weeks onboarding** typical – ne instant launch
- **Developer resources may be needed** for full setup
- **Initial investment** in time + people
- **Complex integration** (Magento especially deep + complex)
- **Migration takes time** (parallel running 1-2 weeks)

### 20.3 UI/UX issues

- **"Utilitarian and feature-dense"** UI critique
- **Steep learning curve** pro beginners
- **Not as polished** as Klaviyo / Mailchimp
- **Dated feel** in some areas (per G2 critique)
- **Mobile interface** less polished
- **3 UI languages only** (EN, PL, PT) – no Czech/Slovak

### 20.4 Automation limitations

- **G2 critique:** "Automation tools and features are really weak compared to competition"
- **Less sophisticated branching** than ActiveCampaign
- **Workflow templates library** smaller than HubSpot
- **Some workflow logic** requires support intervention

### 20.5 Reporting limitations

- **Cannot save report templates** (G2 critique)
- **Multi-touch attribution** less sophisticated
- **Custom dashboards** more limited
- **Export options** limited in some areas

### 20.6 Self-service limitations

- **Dedicated IP changes** require support intervention (not self-service)
- **Some workflow tweaks** require CSM help
- **Custom integration development** through ExpertSender team

### 20.7 AI capabilities behind competitors

- **No generative AI** for content creation
- **No autonomous AI agents** (vs. Klaviyo Customer Agent)
- **No conversational AI**
- **Focus on traditional ML** (CLV, churn, NPD)
- **Behind Klaviyo, HubSpot** in AI roadmap

### 20.8 Missing features

- **No native webinars** (vs. GetResponse)
- **No native course creation**
- **No native digital products sales**
- **No paid newsletters**
- **No native CRM** (light)
- **No WhatsApp Business** native (limited)
- **No review collection** native
- **No native A/B testing of workflow paths** (just per-email)

### 20.9 Integration limitations

- **Custom integrations** typically require ExpertSender team
- **iPaaS native** (Zapier) less feature-rich than direct
- **Some workflow exports/imports** not supported

### 20.10 Pricing & commercial

- **Annual contracts typical** – less flexible
- **Add-ons can stack quickly** (dedicated IPs, custom integrations)
- **Mid-contract changes** require formal process
- **No public pricing** complicates budgeting

### 20.11 CSM dependency

- **Heavy reliance on CSM** for optimal use
- **Quality varies per individual CSM**
- **Coverage during off-hours** depends on region
- **CSM relationship** is significant onboarding investment

### 20.12 Migration challenges

- **Workflows cannot export** to other platforms
- **Predictive scores locked-in**
- **Historical event data** limited portability
- **Identity resolution data** specific to ExpertSender CDP
- **Custom code/integrations** must be rebuilt

### 20.13 Data residency limits

- **Primary EU hosting** good for EU customers
- **Brazilian customers via São Paulo office** but data residency check needed
- **APAC customers via Beijing** but compliance varies
- **No US data residency** standard

---

## 21. Doporučení pro design vlastních procesů

Pokud ExpertSender používáte v týmu, doporučujeme:

1. **Use dedicated CSM** – nejvíc value z platformy
2. **Strategic onboarding** – nezkratovat 4-8 týdnů
3. **Domain authentication** první týden – DKIM + DMARC + branded tracking domain
4. **Custom roles strategy** – build per-job-function (Marketer, Designer, Analyst, Developer)
5. **API key servisní účet** – named per integration (Shopify, Magento, custom)
6. **Multi-channel orchestration** plán – ne jen email
7. **RFM analysis** review quarterly – cohort transitions
8. **Predictive scores monitoring** – CLV, churn, NPD trends
9. **Naming convention** pro workflows, segments, templates
10. **Test profile** dedicated pro QA workflows
11. **Quarterly QBR s CSM** – strategic optimization
12. **Migration plan** – pravidelný export profiles + key configuration backup
13. **Anti-spam compliance** – list quality + engagement scoring
14. **GDPR documentation** – consent audit + retention policies
15. **Backup workflows** – periodic export of workflow definitions
16. **Multi-account setup** (pokud multi-brand) – plánovat strategically
17. **Webhook strategy** – pro external system integration
18. **A/B test culture** – pravidelný subject + content + STO testing
19. **On-site personalization** plán – product page widgets, popup strategy
20. **Frequency caps** cross-channel – prevent over-messaging

---

_Dokument zpracován z oficiálních zdrojů expertsender.com a praktických zdrojů (G2, Capterra, GetApp, SoftwareAdvice, Research.com, SpotSaaS, SoftwareSuggest, SoftwareFinder, Authencio, Shopify CDP guide, CDP.com). Pro nejaktuálnější detaily je nutný demo s ExpertSender sales teamem._
