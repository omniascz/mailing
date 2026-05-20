# Inxmail – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v Inxmail prochází data, lidé a akce – od demo request přes Platform/Mail Relay decision, CSA founding member infrastructure, visual workflows automation, až po koncového subscribera. Speciální focus na DACH enterprise compliance + multilingual UI (incl. CZ + PL).

> Tento dokument doplňuje `35_Inxmail_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** Inxmail umí, tento popisuje, **kdo s tím interaguje a jak data tečou**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
>
> - **Německý produkt z Freiburgu** (1999, **27+ let** v industry – jeden z nejstarších DACH platforms)
> - **Founding member CSA** – industry standard-setter
> - **Owner-managed company** (Inhabergeführt) – stability + long-term vision
> - **2,000+ customers** (mid-market+ → enterprise)
> - **PUBLIC pricing!** (€200+/month Platform, €70+/month Mail Relay)
> - **Pricing per emails sent** (contacts unlimited!)
> - **Modular architecture:** Platform vs. Mail Relay
> - **98% delivery rate** (11% above industry average)
> - **9.2/10 OMR Reviews** (German B2B platform)
> - **ISO 27001 certified**
> - **EU servers exclusively** (German jurisdiction)
> - **9-10 UI languages** (incl. **Czech + Polish + Chinese!**)
> - **REST API** + SSO + extensive integrations (esp. SAP ecosystem)
> - **Personal contact person** + dedicated support hours/month
> - **CDN/webspace included** (1 GB per campaign space)
> - **AI-supported text suggestions**
> - **Visual workflows** automation
> - **Inxmail Commerce** specialization
> - **No standard free trial** (test accounts s special conditions)

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Sales & qualification flow](#2-sales-flow)
3. [Demo request flow](#3-demo-flow)
4. [Test account / staging flow](#4-test-account)
5. [Platform vs. Mail Relay decision flow](#5-platform-vs-relay)
6. [Onboarding flow](#6-onboarding-flow)
7. [User roles & permissions (role-based)](#7-user-roles)
8. [SSO setup flow](#8-sso-flow)
9. [Personal contact person flow](#9-personal-contact)
10. [Daily user workflow (Platform)](#10-daily-workflow)
11. [Daily user workflow (Mail Relay)](#11-mail-relay-workflow)
12. [Recipient lifecycle](#12-recipient-lifecycle)
13. [Email lifecycle s CSA-certified infrastructure](#13-email-lifecycle)
14. [Visual workflows execution](#14-workflows-execution)
15. [AI text suggestions flow](#15-ai-flow)
16. [Trigger-based transactional flow](#16-transactional-flow)
17. [SMTP Mail Relay flow](#17-smtp-flow)
18. [Inxmail Commerce flow](#18-inxmail-commerce-flow)
19. [Form submission + Double Opt-in flow](#19-forms-flow)
20. [API & Integration flow (SAP ecosystem focus)](#20-integration-flow)
21. [Multi-language campaign flow](#21-multilang-flow)
22. [A/B testing flow](#22-ab-testing-flow)
23. [GDPR compliance flow](#23-gdpr-flow)
24. [Enterprise SLA & support flow](#24-enterprise-flow)
25. [Datová mapa: co vidí kdo](#25-datová-mapa)
26. [Známé úzkoprofilové místa](#26-úzkoprofilové-místa)

---

## 1. Mapa všech aktérů

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│         INXMAIL PLATFORM ECOSYSTEM (Founded 1999, Freiburg)        │
│         FOUNDING MEMBER CSA · Made in Germany · ISO 27001          │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [Inxmail GmbH (Freiburg, Germany)]                                │
│   Owner-managed company (Inhabergeführt)                           │
│   ├─ Sales team (DACH primary, English supported)                  │
│   ├─ Customer Success / Account Management                         │
│   ├─ Personal contact persons (per klient!)                        │
│   ├─ Technical Support (German + English)                          │
│   ├─ Implementation specialists                                    │
│   ├─ Deliverability team (CSA founding member!)                    │
│   ├─ Compliance team (GDPR + ISO 27001)                            │
│   ├─ Engineering / Product team                                    │
│   ├─ Industry vertical specialists                                 │
│   │   (retail, media, energy, tourism, insurance, manufacturing)   │
│   └─ Enterprise consultants                                        │
│           │                                                        │
│           ▼                                                        │
│                                                                    │
│   ┌──────────────────────────────────────────┐                     │
│   │   INXMAIL PRODUCTS                       │                     │
│   │                                          │                     │
│   │   1. Inxmail Platform (€200+/month)      │                     │
│   │      Full email marketing platform       │                     │
│   │                                          │                     │
│   │   2. Inxmail Mail Relay (€70+/month)     │                     │
│   │      SMTP infrastructure only            │                     │
│   │                                          │                     │
│   │   3. Inxmail Commerce                    │                     │
│   │      E-commerce specialization           │                     │
│   │      (extension or integrated)           │                     │
│   └──────────────┬───────────────────────────┘                     │
│                  │                                                 │
│                  ▼                                                 │
│   ┌──────────────────────────────────────────┐                     │
│   │   Inxmail Account                        │                     │
│   │                                          │                     │
│   │   USER ROLES (role-based):               │                     │
│   │   ├─ Account Owner (1)                   │◄── full access      │
│   │   ├─ Administrator (multi)               │◄── operational lead │
│   │   ├─ Marketing user (multi)              │◄── daily tasks      │
│   │   ├─ Designer / Editor (multi)           │◄── content only     │
│   │   ├─ Analyst / Reports user (multi)      │◄── reports only     │
│   │   ├─ Read-only / Viewer (multi)          │◄── view only        │
│   │   ├─ Enterprise SSO users                │◄── per IdP role     │
│   │   └─ Custom roles (granular permissions) │                     │
│   │                                          │                     │
│   │   + Personal contact person assigned     │                     │
│   │   + 2h support/month (Platform)          │                     │
│   │   + 1h support/month (Mail Relay)        │                     │
│   └──────────────┬───────────────────────────┘                     │
│                  │                                                 │
│                  ▼                                                 │
│   [Recipients / Subscribers]                                       │
│       │                                                            │
│       ├─→ Newsletter campaigns                                     │
│       ├─→ Trigger-based transactional emails                       │
│       ├─→ Welcome / lifecycle emails                               │
│       ├─→ Subscription communications                              │
│       ├─→ Industry-specific emails                                 │
│       │   (per industry: retail/media/energy/tourism/etc.)         │
│       ├─→ Multi-language emails (per recipient!)                   │
│       ├─→ Forms s Double Opt-in                                    │
│       └─→ Preference management                                    │
│                  │                                                 │
│                  ▼                                                 │
│   [Integrations - extensive DACH B2B focus]                        │
│   ┌──────────────────────────────────────────┐                     │
│   │   SAP ecosystem (DACH B2B!):             │                     │
│   │   - SAP Marketing Cloud                  │                     │
│   │   - SAP Sales Cloud                      │                     │
│   │   - SAP Business One                     │                     │
│   │                                          │                     │
│   │   CRM systems:                           │                     │
│   │   - Sage CRM                             │                     │
│   │   - CAS genesisWorld (DACH CRM)          │                     │
│   │   - combit CRM (DACH CRM)                │                     │
│   │   - CURSOR-CRM (DACH CRM)                │                     │
│   │   - Microsoft Dynamics 365               │                     │
│   │   - Salesforce Sales Cloud               │                     │
│   │                                          │                     │
│   │   E-commerce:                            │                     │
│   │   - Adobe Commerce (Magento 2)           │                     │
│   │   - Magento                              │                     │
│   │   - Shopware (DACH e-commerce!)          │                     │
│   │   - Shopify                              │                     │
│   │   - Spryker                              │                     │
│   │                                          │                     │
│   │   Analytics:                             │                     │
│   │   - Google Analytics 360                 │                     │
│   │   - Webtrends                            │                     │
│   │   - Apteco Orbit                         │                     │
│   │   - Econda                               │                     │
│   │                                          │                     │
│   │   Marketing tools:                       │                     │
│   │   - DynaCampaign                         │                     │
│   │   - advastamedia/O                       │                     │
│   │   - Fiona CMS                            │                     │
│   │   - Nosto (recommendations)              │                     │
│   │                                          │                     │
│   │   Social:                                │                     │
│   │   - Facebook                             │                     │
│   │   - LinkedIn                             │                     │
│   │                                          │                     │
│   │   REST API + webhooks (extensive!)       │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
│   [Made in Germany + EU Infrastructure]                            │
│   ┌──────────────────────────────────────────┐                     │
│   │   Servers EXCLUSIVELY v EU               │                     │
│   │   - German jurisdiction                  │                     │
│   │   - NO US subprocessors (core)           │                     │
│   │   - ISO 27001 certified                  │                     │
│   │   - GDPR-compliant + DPA standard        │                     │
│   │                                          │                     │
│   │   CSA Founding Member                    │                     │
│   │   - Industry credibility unparalleled    │                     │
│   │   - 98% delivery rate (11% above ind!)   │                     │
│   │   - Whitelisted by major DACH ISPs       │                     │
│   │                                          │                     │
│   │   TLS/SPF/DKIM/DMARC                     │                     │
│   │   Dedicated IPs (optional)               │                     │
│   │   SLAs (on request)                      │                     │
│   │   CDN/webspace (1 GB/campaign included)  │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér                            | Vstupní bod          | Co dělá                     | Co vidí               |
| -------------------------------- | -------------------- | --------------------------- | --------------------- |
| **Account Owner**                | Contract signing     | Full + billing + users      | Vše                   |
| **Administrator**                | Pozvánka             | Operational lead, user mgmt | Per scope             |
| **Marketing user**               | Pozvánka             | Daily marketing tasks       | Per permissions       |
| **Designer / Editor**            | Pozvánka             | Content + templates         | Per role              |
| **Analyst / Reports**            | Pozvánka             | Reports + BI                | Read + analyze        |
| **Read-only / Viewer**           | Pozvánka             | View only                   | Read-only             |
| **Enterprise SSO user**          | IdP login            | Per IdP role                | Per assigned          |
| **Recipient / Subscriber**       | Form, integration    | Receives emails             | Své emaily            |
| **Personal Contact Person**      | Assigned per klient  | Strategy + ops support      | Read s consent        |
| **Inxmail Support**              | Email, phone, ticket | Issue resolution            | Read s consent        |
| **Inxmail Sales**                | Inquiry contact      | Upgrades + new contracts    | Read s consent        |
| **Implementation specialist**    | Project assignment   | Setup + integration         | Read s consent        |
| **Industry vertical specialist** | Per industry         | Industry guidance           | Read s consent        |
| **API Client**                   | API key              | Custom integration          | Per scope             |
| **SAP integration**              | OAuth / API          | Bidirectional sync          | Per integration scope |
| **CRM integration**              | OAuth / API          | Customer sync               | Per integration scope |
| **Shopware integration**         | OAuth / Plugin       | E-commerce sync             | Per integration scope |

---

## 2. Sales & qualification flow

### 2.1 Lead acquisition

```
Lead sources:
- inxmail.de inbound (contact form, demo request)
- DACH industry events
- Partner referrals
- DACH industry conferences
- 27+ let v industry (word-of-mouth)
- Industry-specific marketing (retail/media/energy/etc.)
- SAP partner network
- OMR Reviews (German B2B platform)
- Long-term customer references
```

### 2.2 Initial inquiry flow

```
Prospect contacts Inxmail via:
- inxmail.de form ("Request demo")
- Email to sales
- Phone call (Freiburg)
- Partner referral
   ↓
Inxmail Sales responds (typically 1-2 business days)
   ↓
**Discovery call (German/English):**
- Business type
- Industry vertical (retail/media/energy/tourism/insurance/manufacturing?)
- Current ESP (migration source)
- Email volume needs
- Contact base size (unlimited in Inxmail!)
- Channel requirements (Platform vs. Mail Relay)
- E-commerce focus? (Inxmail Commerce)
- SAP ecosystem? (DACH B2B advantage)
- Compliance requirements (GDPR strict?)
- Multi-language needs?
- Enterprise features needed (SSO, SLAs)?
- Budget range
- Timeline
   ↓
**Qualification:**
- Mid-market+ fit
- DACH/EU primary focus?
- B2B/B2C balance
- Enterprise features needed?
- Implementation timeline realistic?
- Industry expertise match?
```

### 2.3 Qualification criteria

Inxmail targets:

- **DACH mid-market+ enterprise**
- **B2B + B2C** both
- **Email volume:** Significant monthly (justifies €200+/month)
- **Industry expertise** valued (retail/media/energy/tourism/insurance/manufacturing)
- **GDPR-strict** organizations
- **Multi-language needs** common
- **SAP ecosystem** users
- **Shopware** e-commerce
- **DACH CRM** users (CAS, combit, CURSOR)

### 2.4 Recommendation: Platform vs. Mail Relay

```
Need newsletters + campaigns? → Platform (€200+/month)
Need only system emails? → Mail Relay (€70+/month)
Need both + e-commerce? → Platform + Inxmail Commerce
Pure transactional dev focus? → Mail Relay
B2C marketing team? → Platform
IT department only? → Mail Relay
```

### 2.5 Demo + workshop

```
Demo 1 (60-90 min):
- Inxmail Platform walkthrough
- Industry-specific use cases (per vertical)
- Visual workflows demonstration
- AI text suggestions demo
- Multi-language showcase (CZ/PL if relevant!)
- CSA founding member positioning
- 98% delivery rate evidence
- Reference customer stories
- Q&A
   ↓
Technical deep dive:
- REST API capabilities
- Integration architecture (SAP, CRM, e-commerce)
- Multi-language requirements
- Compliance review
- Security architecture (ISO 27001)
- SSO integration (if enterprise)
- DACH CRM integration (CAS/combit/CURSOR)
- Shopware integration (DACH e-commerce)
   ↓
Use case workshop:
- Map current customer journeys
- Identify automation opportunities
- Design industry-specific workflows
- ROI projection
- Multi-language strategy
```

### 2.6 Test account activation

Per oficiální:

> _"We offer test accounts separately (with special conditions)."_

```
After demo:
- Test account requested
- Special conditions explained
- Sandbox environment
- Limited features
- Time-limited
- Sales-managed
   ↓
Trial usage:
- Test platform with prospect's data
- Build test campaign
- Test integration
- Review reports
   ↓
Conversion conversation:
- Trial outcomes review
- Pricing proposal
- Implementation plan
- Personal contact assignment
```

### 2.7 Custom proposal generation

```
Inxmail prepares custom proposal:
- Platform or Mail Relay (or both)
- Monthly package vs. annual quota
- Email volume tier
- CDN/webspace included
- Support hours/month
- Inxmail Commerce add-on (if applicable)
- SSO + enterprise features
- Dedicated IPs (optional)
- SLAs (on request)
- Custom integrations (if needed)
- Implementation services
- Training scope
- Personal contact person assignment
   ↓
Proposal sent
   ↓
Negotiation:
- Volume flexibility
- Multi-year discount
- Support hour add-ons
- Custom integrations
```

### 2.8 Contract signing

```
Contract documents:
- Master Service Agreement
- DPA (GDPR compliant, in German)
- SLA (per tier)
- Statement of Work (implementation)
- Custom integration SOW (if applicable)
   ↓
Signed (electronic or in-person)
   ↓
[Project kickoff scheduled]
   ↓
Personal contact person assigned
```

---

## 3. Demo request flow

### 3.1 Demo request

Per oficiální:

> _"We would be happy to present a live demo to you in a personal initial consultation. Simply go to the page: Request demo – we will clarify your volume and requirements and recommend the right package or quota for you."_

```
Visit inxmail.de
   ↓
Click "Request demo"
   ↓
Form:
- Name + email
- Company name
- Phone
- Country
- Industry vertical
- Email volume estimate
- Use case description
- Preferred language (DE/EN/etc.)
   ↓
Submit
   ↓
**Inxmail Sales responds within 1-2 business days**
   ↓
Initial consultation call:
- Volume requirements clarification
- Use case understanding
- Recommended package
- Recommended quota
- Live demo scheduling
```

### 3.2 Product tour

Per oficiální:

> _"You can get a quick look at the tool via our product tour."_

- **Self-guided product tour**
- **No sales engagement** initially
- **Available na inxmail.de**
- **High-level feature overview**

### 3.3 Personal initial consultation

```
Live demo scheduled (60-90 min)
   ↓
**Personal consultation** s expert
   ↓
Demo content:
- Inxmail Platform tour
- Specific use cases per vertical
- Visual workflows demo
- AI features demo
- Multi-language showcase
- Integration capabilities (SAP, CRM, e-commerce)
- Reports + analytics
- Q&A
   ↓
Follow-up:
- Custom proposal
- Test account offer
- Next steps
```

---

## 4. Test account / staging flow

### 4.1 Test account

Per oficiální:

> _"We offer test accounts separately (with special conditions)."_

```
Sales-approved test account
   ↓
**Special conditions** apply:
- Time-limited
- Volume-limited
- Feature-restricted
- Sales-managed
   ↓
Sandbox environment
   ↓
Test with prospect's actual data:
- Real domain (sub-domain)
- Real recipients (small test list)
- Real integrations (test mode)
- Real templates
   ↓
Evaluate platform
   ↓
Decision to proceed
```

### 4.2 Staging environment (paid option)

Per oficiální:

> _"Yes, staging is available as an option."_

**For paid customers:**

- **Pre-production environment**
- **Test campaigns safely**
- **Integration testing**
- **QA before live**
- **Custom development testing**

```
Production account → Staging environment
   ↓
Mirror of production (typically)
- Same workflows
- Same templates
- Test data
   ↓
Use cases:
- New workflow testing
- Template updates
- Integration changes
- API changes
- Major campaign QA
   ↓
Validate before production
   ↓
Promote to production
```

### 4.3 Why staging matters

**Pro enterprise:**

- **Risk reduction**
- **Compliance testing**
- **Custom dev validation**
- **Integration debugging**
- **No live customer impact** during tests

---

## 5. Platform vs. Mail Relay decision flow

### 5.1 Decision tree

```
Customer evaluation:
   ↓
Question 1: Need marketing campaigns + newsletters?
   YES → Platform
   NO → Continue
   ↓
Question 2: Need visual editor / templates?
   YES → Platform
   NO → Continue
   ↓
Question 3: Need visual workflows / automation?
   YES → Platform
   NO → Continue
   ↓
Question 4: Need only system-generated emails?
   YES → Mail Relay
   NO → Re-evaluate (Platform likely)
   ↓
Question 5: Need both?
   YES → Platform (includes transactional)
   ↓
[Recommendation made]
```

### 5.2 Customer profile mapping

#### Inxmail Platform (€200+/month):

- **Marketing team** users
- **Newsletter publishers**
- **B2C + B2B campaigns**
- **E-commerce s marketing**
- **Multi-channel needs**
- **Visual editor preferred**
- **Workflow automation**
- **A/B testing**

#### Inxmail Mail Relay (€70+/month):

- **IT department** users
- **Pure transactional needs**
- **High-volume system emails**
- **SaaS applications**
- **Application developers**
- **Lower budget pro transactional**
- **No marketing functionality needed**

### 5.3 Hybrid scenarios

```
Scenario 1: E-commerce with marketing + transactional
→ Platform (handles both)

Scenario 2: Large enterprise s very high-volume transactional
→ Mail Relay (cost-efficient pro transactional)
→ Platform separately pro marketing (if needed)

Scenario 3: Startup pure SaaS
→ Mail Relay (just need notifications)
→ Upgrade to Platform later if marketing needed
```

### 5.4 Pricing comparison example

For 100K emails/month:

```
Option A: Inxmail Platform
- €200+/month base
- Volume tier added
- Total: ~€300-400/month
- Includes marketing features

Option B: Inxmail Mail Relay
- €70+/month base
- Volume tier added
- Total: ~€150-200/month
- Transactional only
```

⚠️ **Mail Relay = 50% savings** if marketing features not needed.

### 5.5 Upgrade path

```
Mail Relay → Platform:
- Same account, different tier
- Sales contact
- Volume pricing adjusted
- Features unlocked
- 2h/month support (vs. 1h)
- CDN/webspace activated
   ↓
[Platform features available]
```

---

## 6. Onboarding flow

### 6.1 Project kickoff (Week 1)

```
Contract signed
   ↓
**Inxmail assigns:**
- Personal contact person (long-term partnership!)
- Implementation specialist
- Technical support contact
- Deliverability advisor
- Industry vertical specialist (if relevant)
- Compliance contact (enterprise)
   ↓
**Client side:**
- Project sponsor
- Marketing lead
- IT lead
- Compliance/Legal (if regulated industry)
- E-commerce manager (if applicable)
   ↓
**Kickoff workshop (1-2 days):**
- Introductions across teams
- Goals + KPIs alignment
- Project plan walkthrough
- Communication cadence
- Risk identification
- Success criteria
```

### 6.2 Setup phase (Week 1-3)

```
Account provisioning:
- Inxmail creates account
- Account Owner credentials
- User roles configured
- Brand kit setup (logo, colors)
   ↓
Domain authentication:
- DKIM records configured
- SPF records updated
- DMARC policy defined
- Branded tracking domain (CNAME)
- Subdomain setup pro marketing
   ↓
Verification:
- Inxmail validates DNS
- Test sends from each domain
- CSA whitelisting activated
```

### 6.3 Integration phase (Week 2-6)

```
DACH-specific integrations:
- SAP Marketing Cloud (if applicable)
- SAP Sales Cloud / Business One
- DACH CRM (CAS, combit, CURSOR-CRM)
- Shopware (DACH e-commerce!)
   ↓
International integrations:
- Adobe Commerce / Magento
- Shopify
- Salesforce
- Microsoft Dynamics 365
   ↓
Analytics integration:
- Google Analytics 360
- Webtrends
- Apteco Orbit
   ↓
Custom integrations (via REST API):
- ERP systems
- Custom apps
- Custom dev
```

### 6.4 Database + recipient setup (Week 3-6)

```
Database design:
- Custom fields schema
- Tag taxonomy
- Segment definitions
- Lifecycle stages
   ↓
Historical data migration:
- Existing recipients import (CSV)
- Custom field population
- GDPR consent confirmation
- Marketing consent flags
   ↓
Data validation:
- Sample profiles review
- Segment testing
- Consent audit
```

### 6.5 Templates + brand kit (Week 4-8)

```
Brand kit setup:
- Colors, fonts, logos
- Email defaults
- Brand consistency rules
   ↓
Master templates designed:
- Newsletter template
- Promotional template
- Transactional templates
- Welcome series templates
- Industry-specific templates (per vertical)
- Multi-language variants
```

### 6.6 Workflows setup (Week 6-10)

```
Workflow design workshops:
- Welcome series
- Cart abandonment (s Inxmail Commerce)
- Browse abandonment
- Post-purchase
- Re-engagement
- Birthday / anniversary
- Subscription renewals (Media)
- Industry-specific lifecycle
   ↓
Build workflows v Inxmail:
- Visual workflow builder
- Configure triggers
- Set conditions / branches
- Configure goals
- Multi-language content
- Test thoroughly
```

### 6.7 Training (Week 8-12)

```
Multi-track training:

Track 1: Marketing team
- Platform basics
- Campaign creation
- Drag-drop editor
- Segmentation
- Workflow management
- AI text suggestions
- Reports interpretation

Track 2: Advanced users
- Multi-language campaigns
- Visual workflows deep
- A/B testing
- Inxmail Commerce
- API basics

Track 3: Analytics team
- Reports + dashboards
- Custom reports
- Data export
- ROI tracking

Track 4: Admins
- User management
- Enterprise SSO setup
- Security
- API key management
- Permissions

Track 5: IT / Developers
- REST API
- Mail Relay
- Webhooks
- Integration setup
```

### 6.8 Go-live (Week 10-14)

```
Pre-launch QA:
- All workflows tested end-to-end
- Domain authentication verified
- Integration tested
- Compliance review (GDPR + ISO 27001)
- CSA-certified infrastructure active
   ↓
Soft launch:
- Limited audience (10-20%)
- Daily monitoring
- Personal contact person available
   ↓
Full launch:
- 100% audience activated
- Continuous monitoring
   ↓
**Hypercare period (4-6 weeks):**
- Daily check-ins s personal contact
- Performance optimization
- Quick bug fixes
- Workflow refinement
```

### 6.9 Transition to BAU

```
Post-launch:
- Personal contact monthly cadence
- 2h support included monthly (Platform)
- Performance optimization
- New feature adoption
- Industry insights shared
   ↓
Annual strategic review:
- Roadmap alignment
- New use cases
- Volume planning
- Contract renewal
```

---

## 7. User roles & permissions (role-based)

### 7.1 Role-based user management

Per oficiální:

> _"role-based user management"_

**Role-based access control:**

- **Multiple default roles**
- **Custom roles** possible
- **Granular permissions**
- **Per-feature access**
- **Per-list access**

### 7.2 Default roles (typical)

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
- User management
- Integration management
- Configuration
- Cannot manage billing typically

#### Marketing user

- **Daily marketing** tasks
- Campaigns + workflows + segments
- Content creation
- Reports
- No user management

#### Designer / Editor

- **Content focused**
- Templates + design
- Limited recipient data
- No send permissions typically

#### Analyst / Reports user

- **Reports + analytics**
- Build dashboards
- Data export
- No send permissions

#### Read-only / Viewer

- **View only**
- For executives, auditors

#### Custom roles

- **Per business needs**
- **Granular permissions**

### 7.3 Permission matrix (typical)

| Akce               | Owner | Admin | Marketing | Designer | Analyst  |  Viewer  |
| ------------------ | :---: | :---: | :-------: | :------: | :------: | :------: |
| Account settings   |  ✅   |  ✅   |    ❌     |    ❌    |    ❌    |    ❌    |
| Billing            |  ✅   |  ❌   |    ❌     |    ❌    |    ❌    |    ❌    |
| User management    |  ✅   |  ✅   |    ❌     |    ❌    |    ❌    |    ❌    |
| Recipients view    |  ✅   |  ✅   |    ✅     | limited  |   view   |   view   |
| Recipients edit    |  ✅   |  ✅   |    ✅     |    ❌    |    ❌    |    ❌    |
| Segments build     |  ✅   |  ✅   |    ✅     |    ❌    |   view   |   view   |
| Templates          |  ✅   |  ✅   |    ✅     |    ✅    |   view   |   view   |
| Campaigns create   |  ✅   |  ✅   |    ✅     |    ✅    |    ❌    |   view   |
| Campaigns send     |  ✅   |  ✅   |    ✅     |    ❌    |    ❌    |    ❌    |
| Workflows create   |  ✅   |  ✅   |    ✅     |   view   |   view   |   view   |
| Workflows activate |  ✅   |  ✅   |    ✅     |    ❌    |    ❌    |    ❌    |
| Forms              |  ✅   |  ✅   |    ✅     |    ✅    |   view   |   view   |
| Reports            |  ✅   |  ✅   |    ✅     |   view   |    ✅    |    ✅    |
| Integrations       |  ✅   |  ✅   | per role  |    ❌    |   view   |    ❌    |
| API keys           |  ✅   |  ✅   |    ❌     |    ❌    |    ❌    |    ❌    |
| SSO config         |  ✅   |  ✅   |    ❌     |    ❌    |    ❌    |    ❌    |
| Audit logs         |  ✅   |  ✅   |    ❌     |    ❌    | per role | per role |

### 7.4 User invitation flow

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
User activates + sets password
   ↓
[Active per role]
```

### 7.5 User administration sometimes requires support

Per GetApp:

> _"user administration sometimes requires contacting support"_

⚠️ **Some user management operations** require Inxmail support help (especially complex setups).

---

## 8. SSO setup flow

### 8.1 SSO support

Per oficiální:

> _"Seamless connection to your systems with APIs, SSO, and personal support."_

**Enterprise SSO:**

- **SAML 2.0 support**
- **Active Directory** integration
- **Google Workspace**
- **Microsoft 365**
- **Custom IdPs**

### 8.2 SSO setup flow

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
Exchange metadata:
- IdP → Inxmail
- Inxmail → IdP
   ↓
Test SSO flow:
- IdP login → Inxmail access
- Logout → SSO logout
   ↓
Role mapping:
- IdP groups → Inxmail roles
- Automatic provisioning
   ↓
[SSO active for all users]
```

### 8.3 Why SSO matters

- **Centralized authentication**
- **Single password** per user
- **Faster onboarding** (auto-provisioning)
- **Better security** (MFA at IdP level)
- **Compliance** (audit trail v IdP)
- **De-provisioning** automatic when user leaves company

---

## 9. Personal contact person flow

### 9.1 Personal contact person

Per oficiální:

> _"Personal contact person and 2 hours of user support/month (platform) or 1 hour/month (mail relay)."_

**Dedicated person per klient:**

- **Long-term relationship**
- **Operational support**
- **Strategic guidance**
- **Knowledge sharing**

### 9.2 Contact person interaction flow

```
Client has question / needs help
   ↓
Multiple contact options:
- Email personal contact
- Phone personal contact
- Schedule call
- Inxmail support portal
   ↓
Contact person responds (typically business day)
   ↓
Resolution options:
- Quick answer
- Detailed guidance
- Schedule strategy session
- Escalate to technical team
- Schedule training
   ↓
[Issue resolved + knowledge transfer]
```

### 9.3 Support hours

**Platform: 2 hours/month included**
**Mail Relay: 1 hour/month included**

```
Support hours used for:
- Strategic consultations
- Workflow design help
- Template design help
- Technical troubleshooting
- Compliance questions
- Best practices guidance
- Performance optimization
```

### 9.4 More support hours optional

Per oficiální:

> _"More support/SLAs optional."_

- **Additional hours** purchasable
- **Premium SLA** tiers
- **Custom support agreements**

### 9.5 Real customer praise

Per Software Advice:

> _"Deutsche Ansprechpartner, Nähe zur Software-Entwicklung, durchwegs gute Erfahrungen"_

> _"Users think Inxmail offers responsive and knowledgeable customer support, with fast answers and helpful service for most needs."_

### 9.6 Per GetApp

> _"Widespread user sentiment highlights fast, competent, and solution-oriented support for both standard and complex issues."_

---

## 10. Daily user workflow (Platform)

### 10.1 Daily Marketing workflow

```
Login → Marketing Dashboard
   ↓
Activities:
- Build segments
- Create campaigns
- Build / monitor workflows
- Manage forms
- Review reports
- Use AI text suggestions
- A/B testing
- Multi-language management
```

### 10.2 Create campaign

```
Newsletter / Campaign → New
   ↓
Step 1: Setup
- Campaign name
- Subject line + personalization
- Sender (verified)
- Reply-to
- UTM parameters
   ↓
Step 2: Recipients
- Select list / segment
- Database filters
- Exclusion lists
   ↓
Step 3: Design
- Drag-drop editor
- Template library (industry-specific)
- **AI text suggestions** for subject, body
- Personalization tokens
- Dynamic content blocks
- Multi-language content (per recipient!)
   ↓
Step 4: A/B Test (optional)
- Configure variants
- Auto-winner setup
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
   ↓
**Email volume deducted from quota**
```

### 10.3 Build workflow

```
Workflows → New workflow
   ↓
A) Pre-built workflow template
B) Custom visual builder
   ↓
Configure trigger:
- Behavioral
- Transactional
- Date-based
- Custom event (API)
   ↓
Build canvas:
- Drag-drop nodes
- Add wait nodes
- Set conditions / branches
- Configure send nodes
- Set goals
- Configure exit conditions
   ↓
Test mode
   ↓
Activate
   ↓
[Workflow live]
```

### 10.4 Segment building

```
Recipients → Segments → New
   ↓
Configure conditions:
- Contact attributes
- Behavioral data
- Transactional data
- Engagement scores
- Date conditions
   ↓
Combine s AND/OR/NOT
   ↓
Preview segment size
   ↓
Save (dynamic / static)
   ↓
[Segment available]
```

### 10.5 Multi-language campaign

```
Create campaign
   ↓
Enable multi-language
   ↓
For each language:
- Subject line variant
- Body content variant
- AI text suggestions
- Personalization tokens
   ↓
Send: Inxmail auto-selects per recipient language
   ↓
[Recipients receive native-language email]
```

---

## 11. Daily user workflow (Mail Relay)

### 11.1 Mail Relay daily workflow

```
Mail Relay = pure SMTP infrastructure
   ↓
Daily activities (mostly automated):
- Monitor sending volume
- Check delivery reports
- Manage API keys
- Update templates (if applicable)
- Review bounces / suppression
- Track sender reputation
```

### 11.2 No marketing features

⚠️ Mail Relay users **don't:**

- Build campaigns
- Use drag-drop editor
- Create workflows
- Manage forms
- A/B test
- Use AI suggestions

### 11.3 Typical Mail Relay use

```
Application sends transactional email
   ↓
Via Inxmail SMTP / REST API
   ↓
Inxmail processes:
- Auth
- DKIM signing
- DMARC alignment
- Delivers via CSA-certified infrastructure
   ↓
Reports show:
- Sent volume
- Delivery rate
- Bounces
- Spam complaints
   ↓
[Operational visibility]
```

### 11.4 Mail Relay reports

Limited vs. Platform:

- Sent volume
- Delivery rate
- Bounce rate
- Spam complaint rate
- IP reputation
- (No marketing reports / no engagement reports typically)

---

## 12. Recipient lifecycle

### 12.1 Recipient creation paths

#### A) Form submission s Double Opt-in

```
Visitor fills Inxmail form (embedded)
   ↓
Submit
   ↓
Inxmail:
- Validates email
- Captcha check
- **GDPR consent recorded**
- IP + timestamp logged
   ↓
Status: Pending (DACH standard!)
   ↓
**Bestätigungsmail** sent (Double Opt-in)
   ↓
Recipient clicks confirm
   ↓
IP + timestamp of confirmation logged
   ↓
**Full GDPR audit trail**
   ↓
Status: Active
   ↓
Add to list
   ↓
Welcome workflow triggers
```

#### B) Shopware integration (DACH e-commerce!)

```
Customer registers v Shopware shop
   ↓
Shopware webhook → Inxmail
   ↓
Contact created s marketing consent flag
   ↓
Add to designated list
   ↓
Tag: "Source: Shopware"
   ↓
Welcome workflow if active
   ↓
[DACH e-commerce advantage]
```

#### C) SAP Marketing Cloud sync

```
Customer v SAP Marketing Cloud
   ↓
Sync (real-time OR batch) → Inxmail
   ↓
Bidirectional updates
   ↓
SAP master data preserved
   ↓
Inxmail handles email delivery
```

#### D) CRM sync (CAS / combit / CURSOR / Salesforce / Dynamics)

```
CRM contact updated
   ↓
Sync → Inxmail
   ↓
Recipient created/updated
   ↓
Marketing consent respected
   ↓
Segments updated
```

#### E) REST API integration

```
External system POST to Inxmail API
   ↓
Inxmail validates auth
   ↓
Creates/updates recipient
   ↓
[Recipient active]
```

#### F) Manual import (CSV)

```
Admin: Recipients → Import
   ↓
CSV upload
   ↓
Field mapping
   ↓
**GDPR consent confirmation required**
   ↓
Validation
   ↓
Import processed
   ↓
[Recipients added]
```

### 12.2 Recipient status

```
[Pending] (Double Opt-in default - DACH standard!)
   ↓
[Active] ← can receive
   ↓
Transitions:
- Unsubscribed (Abmeldung)
- Bounced (auto-detection)
- Spam complaint
- Inactive (engagement-based)
- Deleted (GDPR)
```

### 12.3 Engagement tracking

```
Active recipient receives email
   ↓
Interactions tracked:
- Opens (pixel)
- Clicks (URL wrapper)
- Conversions (if tracked)
   ↓
Profile updates:
- Last activity
- Engagement metrics
- Tags (if workflow triggers)
- Segments re-evaluated
```

### 12.4 Preference center

```
Email footer: "Manage preferences" / "Einstellungen"
   ↓
Inxmail-hosted preference page (recipient's language!)
   ↓
Recipient sees:
- Subscribed lists (toggles)
- Personal info (editable)
- Master unsubscribe
- GDPR rights
- Language preference
   ↓
Update
   ↓
Profile updated
```

### 12.5 Unsubscribe

```
Recipient clicks Abmelden
   ↓
Inxmail-hosted page
   ↓
Options:
- Specific list
- All marketing
- Reason survey (optional)
   ↓
Status: Unsubscribed
   ↓
GDPR audit logged
   ↓
Data retained per GDPR
```

### 12.6 Bounce handling

```
ISP 5xx response
   ↓
Inxmail:
- Bounce-Management:
- Status: Bounced
- Auto-suppression
- **CSA reputation tracking**
- DACH ISP feedback loop monitoring
   ↓
[Future sends suppressed]
```

### 12.7 GDPR delete

```
Recipient requests deletion
   ↓
Method A: Admin manual
Method B: API DELETE
Method C: Preference center self-service
Method D: Email request to support
   ↓
Inxmail:
- Removes personal data
- Anonymizes events
- Auto-suppression
- Audit log entry
- Confirmation email (GDPR compliant)
- DPA documentation maintained
```

---

## 13. Email lifecycle s CSA-certified infrastructure

```
┌─────────────────────────────────────────────────────────────────┐
│  1. USER drafts campaign                                        │
│     - Audience (lists, segments)                                │
│     - Design + AI text suggestions                              │
│                            │                                    │
│                            ▼                                    │
│  2. PRE-SEND CHECKS                                             │
│     - Sender verified?                                          │
│     - Domain DKIM/SPF/DMARC?                                    │
│     - Audience valid?                                           │
│     - Volume quota OK?                                          │
│     - GDPR compliance footer                                    │
│     - **CSA standards** met?                                    │
│                            │                                    │
│                            ▼                                    │
│  3. SEND TIME                                                   │
│     - Send now                                                  │
│     - Scheduled                                                 │
│     - Time-zone delivery                                        │
│     - Throttled send                                            │
│                            │                                    │
│                            ▼                                    │
│  4. PER-RECIPIENT GENERATION                                    │
│     - Personalization tokens resolved                           │
│     - Dynamic content evaluated                                 │
│     - **Multi-language detection** (per recipient!)             │
│     - Product feed blocks rendered (Inxmail Commerce)           │
│     - Tracking pixels embedded                                  │
│     - Click trackers wrapped                                    │
│                            │                                    │
│                            ▼                                    │
│  5. SMTP SEND from INXMAIL GERMAN/EU INFRASTRUCTURE             │
│     - **Servers EXCLUSIVELY v EU**                              │
│     - **Founding member CSA infrastructure**                    │
│     - Multi-IP pool (separated marketing vs. transactional)     │
│     - Dedicated IPs (optional)                                  │
│     - DKIM signed                                               │
│     - SPF compliant                                             │
│     - DMARC aligned                                             │
│     - List-Unsubscribe RFC 8058                                 │
│                            │                                    │
│                            ▼                                    │
│  6. ISP RECEIVES                                                │
│     - **CSA founding member whitelisting active:**              │
│        - GMX → fast inbox placement                             │
│        - web.de → fast inbox placement                          │
│        - T-Online → fast inbox placement                        │
│        - 1&1 → fast inbox placement                             │
│        - Other DACH ISPs                                        │
│        - International EU ISPs                                  │
│     - 98% delivery rate (11% above industry avg!)               │
│                            │                                    │
│                            ▼                                    │
│  7. ROUTING                                                     │
│     - **Inbox (high probability!)**                             │
│     - Promotions                                                │
│     - Spam (rare due to CSA founding member status)             │
│                            │                                    │
│                            ▼                                    │
│  8. RECIPIENT INTERACTION                                       │
│     - Open → pixel → tracked                                    │
│     - Click → Inxmail redirect → tracked                        │
│     - Conversion tracking (if configured)                       │
│                            │                                    │
│                            ▼                                    │
│  9. PROFILE UPDATE (REAL-TIME)                                  │
│     - Engagement metrics                                        │
│     - Segments re-evaluated                                     │
│     - Workflow triggers fire                                    │
│                            │                                    │
│                            ▼                                    │
│ 10. REPORTING                                                   │
│     - Real-time KPI dashboard                                   │
│     - Per-link click maps                                       │
│     - Multi-language performance                                │
│     - Volume tracking (quota consumption)                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 14. Visual workflows execution

### 14.1 Workflow activation

```
User builds visual workflow
   ↓
Test mode (preview + sample run)
   ↓
Activate
   ↓
Inxmail validation:
- All triggers configured
- All nodes valid
- No broken paths
- Multi-language content present
   ↓
[Active]
   ↓
Engine evaluates continuously
```

### 14.2 Trigger evaluation

```
Event occurs (subscription, order, behavior, etc.)
   ↓
Inxmail evaluates active workflows
   ↓
For each matching workflow:
- Check entry conditions
- Check re-entry settings
- Add recipient to execution
```

### 14.3 Per-recipient execution

```
Recipient enters at trigger
   ↓
Each node processed:
- Send email → queue (newsletter / transactional)
- Wait → schedule continuation
- Condition → evaluate
- Update field → modify profile
- Goal → check achievement
- Webhook → external call
   ↓
Continue until end / goal / removal
```

### 14.4 Workflow analytics

- Per-workflow performance
- Per-step metrics
- Drop-off analysis
- Conversion tracking
- ROI calculation

### 14.5 Re-entry rules

- Per workflow setting
- Run once vs. multiple
- Minimum gap between re-entries

---

## 15. AI text suggestions flow

### 15.1 AI flow

Per oficiální:

> _"intuitive email creation with drag-and-drop, AI-supported text suggestions"_

```
Marketer writes initial draft v editor
   ↓
**AI button** → Request suggestions
   ↓
AI processes:
- Subject line variations
- Body content suggestions
- Tone adjustments
- Multi-language options
   ↓
Suggestions displayed
   ↓
Marketer reviews:
- Accept suggestion
- Modify suggestion
- Reject suggestion
- Request more
   ↓
[Improved content saved]
```

### 15.2 AI limitations

- **Suggestions only** (not autonomous)
- **Marketer-driven** acceptance
- **Less sophisticated** than Klaviyo Customer Agent
- **Useful for productivity** boost

### 15.3 Multi-language AI

- **Suggestions per language**
- **Translation suggestions**
- **Tone matching** per culture
- **Helpful pro DACH companies** s international audiences

---

## 16. Trigger-based transactional flow

### 16.1 Setup flow

```
Configure transactional templates:
- Templates v Inxmail Platform
- Variables defined
- Multi-language variants
   ↓
Configure triggers:
- API endpoint
- Workflow trigger
- Custom event
   ↓
Test integration
   ↓
[Production-ready]
```

### 16.2 Transactional send flow

```
Application event (e.g., order placed)
   ↓
API call to Inxmail Platform:
   POST /transactional/send
   - to (recipient)
   - template_id
   - variables (merge data)
   - language (optional)
   ↓
Inxmail:
- Selects template
- Renders s variables
- Multi-language detection
- Sends via secure SMTP
- Tracks delivery
   ↓
Recipient receives email v native language
   ↓
Reports + analytics updated
```

### 16.3 Use cases

- Order confirmations
- Shipping notifications
- Password resets
- Account verifications
- Receipts / invoices
- Authentication codes
- Subscription renewals
- Anniversary mailings
- Re-engagement triggers

### 16.4 Trigger volume

- **High-volume capable**
- **Real-time processing**
- **Quota-based pricing** (per emails sent)
- **Separate IP pools** (optional)

---

## 17. SMTP Mail Relay flow

### 17.1 Mail Relay setup

```
Admin: Mail Relay → SMTP config
   ↓
Generate SMTP credentials:
- Hostname (smtp.inxmail.de)
- Port (typically 587 with TLS)
- Username
- Password / API key
   ↓
Configure:
- DKIM signing
- SPF compliance
- DMARC alignment
- Per-application credentials
- IP whitelisting (security)
   ↓
[Secure SMTP active]
```

### 17.2 Application sending via SMTP

```
Application generates transactional event
   ↓
Connect to Inxmail SMTP server
   ↓
Authenticate
   ↓
Send email s content
   ↓
Inxmail processes:
- Validates auth
- Applies DKIM/SPF/DMARC
- Routes via CSA-certified infrastructure
- Delivers to recipient
   ↓
Tracking:
- Delivery confirmed
- Bounce handling
- Reports updated
```

### 17.3 Application sending via REST API

```
Application calls Inxmail API:
   POST /mailrelay/send
   - to
   - from
   - subject
   - body (HTML/text)
   - headers
   ↓
Inxmail renders + sends
   ↓
Response with message ID
   ↓
Tracking via webhook (optional)
```

### 17.4 Mail Relay use cases

```
SaaS application:
- User signs up → password reset → email confirmation
- Each step: SMTP send to user
- All via Inxmail Mail Relay

E-commerce:
- Order placed → confirmation
- Shipping update → notification
- Order delivered → review request
- All via Inxmail Mail Relay (OR Platform if marketing integrated)

System notifications:
- Error alerts
- System updates
- Monitoring alerts
- All via Inxmail Mail Relay
```

### 17.5 Deliverability advantage

- **CSA founding member infrastructure**
- **98% delivery rate**
- **DACH ISP reputation**
- **Better than ad-hoc SMTP** by far

---

## 18. Inxmail Commerce flow

### 18.1 Inxmail Commerce setup

```
Customer s e-commerce business
   ↓
Connect e-commerce platform:
- Adobe Commerce (Magento 2)
- Magento
- **Shopware (DACH e-commerce!)**
- Shopify
- Spryker
   ↓
Configure:
- Product feed
- Order webhooks
- Cart events
- Customer sync
   ↓
[Inxmail Commerce active]
```

### 18.2 Visual campaign builder (e-commerce specific)

```
Inxmail Commerce: Visual campaign builder
   ↓
Configure e-commerce campaign:
- Trigger (cart abandoned, browse, etc.)
- Product feed integration
- Personalized recommendations
- Promotional logic
- Discount automation
   ↓
Activate
   ↓
[E-commerce workflows live]
```

### 18.3 E-commerce automation flows

#### Cart abandonment

```
Customer adds to cart
   ↓
Leaves without checkout
   ↓
Webhook → Inxmail Commerce
   ↓
Wait 1h
   ↓
Send reminder s cart contents:
- Product images (from feed)
- Prices
- CTA "Complete purchase"
   ↓
Wait 24h
   ↓
Condition: Purchased?
   YES → Exit
   NO → Send discount offer
   ↓
Wait 48h
   ↓
Final reminder
   ↓
Exit
```

#### Browse abandonment

```
Customer views product
   ↓
Doesn't add to cart
   ↓
Wait 1 day
   ↓
Send personalized email:
- Viewed product
- Similar products (recommendations)
- Customer reviews
- Special offer
   ↓
Track engagement
```

### 18.4 Limitations

Per Software Advice review:

> _"die Möglichkeit im visuellen Kampagnen-Builder von Inxmail Commerce eigene Actions entwickeln zu können"_

⚠️ **Custom actions** in visual builder limited:

- Pre-built actions primary
- Less custom dev v workflow
- Workaround via API + workflows
- Less flexible than open frameworks

---

## 19. Form submission + Double Opt-in flow

### 19.1 Form creation

```
Marketer: Forms → New form
   ↓
Configure:
- Form name
- Fields (text, email, phone, dropdown, etc.)
- **GDPR consent fields** (DSGVO required!)
- **Double Opt-in enabled** (default DACH!)
- Captcha
- Style customization
- Multi-language form variants
   ↓
Connect:
- Target list
- Tags on submit
- Workflow trigger
   ↓
Save + Publish
   ↓
Get embed code
   ↓
Embed na website
```

### 19.2 Form submission flow

```
Visitor fills form
   ↓
Submit
   ↓
Inxmail receives:
- Validates fields
- Captcha check
- Duplicate email check
- **GDPR consent logged** (IP + timestamp + text version)
   ↓
Recipient created:
- Add to specified list
- Apply tags
- Trigger workflows
   ↓
Status: Pending (Double Opt-in - DACH standard!)
   ↓
**Bestätigungsmail sent v recipient's language**
- Custom designed template
- Single CTA "Anmeldung bestätigen"
- Confirmation URL with token
   ↓
**Recipient must click confirmation link**
   ↓
Inxmail verifies:
- Token valid
- Email matches
- Not expired
   ↓
Status: Active
   ↓
**Confirmation IP + timestamp logged**
   ↓
**Full GDPR audit trail:**
- Source form
- Submission timestamp + IP
- Consent text version
- Confirmation timestamp + IP
   ↓
Add to designated list
   ↓
Trigger welcome workflow (if configured)
```

### 19.3 Double Opt-in importance pro DACH

- **DACH legal requirement**
- **GDPR compliance**
- **Reduces complaints**
- **Better reputation**
- **CSA standards** enforced

---

## 20. API & Integration flow (SAP ecosystem focus)

### 20.1 REST API setup

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
   POST https://api.inxmail.de/v1/[endpoint]
   Headers:
     Authorization: Bearer {api_key}
     Content-Type: application/json
   Body: { data }
   ↓
Inxmail:
- Validates auth
- Rate limit check
- Permission validation
- Validates payload
   ↓
Response 200/201
   ↓
Action performed:
- Recipient created/updated
- Campaign triggered
- Transactional sent
- Report retrieved
- etc.
```

### 20.3 SAP Marketing Cloud integration (DACH B2B!)

**Bidirectional sync:**

```
SAP Marketing Cloud master data
   ↓
Real-time sync ←→ Inxmail
   ↓
Inxmail benefits:
- SAP customer master data
- SAP segments
- SAP campaign data
   ↓
SAP benefits:
- Inxmail engagement data
- Email metrics
- Delivery confirmations
   ↓
[Unified DACH B2B marketing]
```

### 20.4 SAP Sales Cloud integration

```
SAP Sales Cloud → Inxmail
   ↓
Lead data sync
   ↓
Sales activities feed
   ↓
Marketing-Sales alignment
   ↓
ROI attribution
```

### 20.5 DACH CRM integrations (UNIKÁTNÍ pro DACH B2B)

#### CAS genesisWorld

```
CAS genesisWorld → Inxmail
   ↓
DACH B2B CRM advantage
   ↓
Contact + activity sync
   ↓
Bidirectional updates
```

#### combit CRM

```
combit CRM ←→ Inxmail
   ↓
DACH-specific integration
   ↓
Contact + opportunity data
```

#### CURSOR-CRM

```
CURSOR-CRM ←→ Inxmail
   ↓
DACH B2B integration
   ↓
Industry-specific (oft energie sector!)
```

### 20.6 Shopware integration (DACH e-commerce!)

```
Shopware shop ←→ Inxmail
   ↓
**Native DACH e-commerce!**
   ↓
- Customer sync
- Order data
- Cart events
- Product feed
- Webhooks
   ↓
Inxmail Commerce automation enabled
   ↓
[DACH-specific advantage]
```

### 20.7 Standard integrations

- **Adobe Commerce / Magento**
- **Shopify**
- **Spryker**
- **Microsoft Dynamics 365**
- **Salesforce Sales Cloud**

### 20.8 Webhook setup

```
Inxmail: Webhook configuration
   ↓
Events subscribed:
- Recipient events (subscribed, unsubscribed)
- Campaign events (sent, opened, clicked, bounced)
- Workflow events
- Transactional events
- Custom events
   ↓
Target URL
   ↓
HMAC signature verification
   ↓
[Webhooks active]
   ↓
On event:
- POST to target URL
- External app processes
```

---

## 21. Multi-language campaign flow

### 21.1 Multi-language UI per user

Each user selects preferred UI language:

- German (default)
- English
- **Czech (UNIKÁTNÍ pro DACH!)**
- **Polish (UNIKÁTNÍ pro DACH!)**
- French
- Italian
- Spanish
- Turkish
- Chinese (Simplified)
- Chinese (Traditional)

### 21.2 Multi-language campaign creation

```
Marketer creates campaign
   ↓
Enable multi-language mode
   ↓
For each target language:
- Subject line variant
- Body content variant
- **AI text suggestions** per language
- Personalization tokens
- Multi-language preview
   ↓
Recipient language detection logic:
- Per recipient profile field
- Per geographic
- Per IP detection
- Per past engagement
   ↓
Send: Inxmail auto-selects per recipient
   ↓
Each recipient gets native-language email
```

### 21.3 Multi-language deployment

```
Campaign launched
   ↓
Per recipient:
- Language detected
- Variant selected
- Personalization applied
- Email sent
   ↓
Reports show:
- Per-language performance
- Engagement comparison
- Conversion per language
```

### 21.4 Use cases

#### B2B DACH company with CEE operations

```
Inxmail Platform:
- German variant for DACH audience
- Czech variant for CZ operations
- Polish variant for PL operations
- English variant for international
   ↓
One campaign → 4 native experiences
```

#### Tourism company across Europe

```
Inxmail:
- Multi-language campaigns
- Per-recipient language detection
- Personalized travel offers
- Higher engagement
   ↓
ROI increase from native-language messaging
```

#### Manufacturing with international sales

```
- German for DACH
- French for FR/BE
- Italian for IT
- Spanish for ES
- Polish for PL operations
- Czech for CZ operations
- English for international
   ↓
**Single campaign, 7 native experiences**
```

---

## 22. A/B testing flow

### 22.1 A/B test creation

```
Marketer creates campaign
   ↓
Enable A/B testing
   ↓
Configure variants:
- Variant A: Subject "X"
- Variant B: Subject "Y"
- (More variants possible)
   ↓
Sample size per variant
   ↓
Winner determination:
- Open rate
- Click rate
- Conversion (s tracking)
   ↓
Auto-winner OR manual decision
   ↓
Activate test
```

### 22.2 Test execution

```
Test sample sent:
- Variant A → X% audience
- Variant B → Y% audience
   ↓
Real-time tracking
   ↓
Engagement collected
   ↓
**Winner detected** (statistical significance)
   ↓
**Auto-send to remaining audience:**
- Winning variant sent
- "On the fly" optimization
   ↓
Reports show:
- Per-variant performance
- Winner explanation
```

---

## 23. GDPR compliance flow

### 23.1 EU hosting exclusively

Per oficiální:

> _"Inxmail places the highest value on data security, legal certainty and hosts its servers exclusively in the EU."_

```
Data flow:
- All data → EU servers exclusively
- NO US subprocessors for core
- German jurisdiction guaranteed
- Schrems II compliant
```

### 23.2 ISO 27001 + GDPR

Per oficiální:

> _"Inxmail is ISO 27001 certified and processes personal data in accordance with the GDPR – with order processing."_

- **ISO 27001 certified**
- **GDPR-compliant**
- **DPA (Auftragsverarbeitungsvertrag) standard**

### 23.3 Double Opt-in default

Per oficiální:

> _"double opt-in, encrypted sending, and role-based user management"_

- **Double Opt-in default ON**
- **DACH standard**
- **GDPR compliance**

### 23.4 Right to Be Forgotten

```
Recipient requests deletion
   ↓
Method A: Admin manual
Method B: API DELETE
Method C: Preference center self-service
Method D: Written request to Inxmail
   ↓
Inxmail:
- Removes personal data
- Anonymizes events
- Auto-suppression
- Audit log entry
- Confirmation email (GDPR compliant)
- DPA documentation maintained
```

### 23.5 DSAR (Data Subject Access Request)

```
Recipient requests their data
   ↓
Admin: Generate GDPR export
OR support request
   ↓
Inxmail produces:
- Profile data
- Activity events
- Consent records
- Communication history
   ↓
Provide within 30 days (GDPR requirement)
```

### 23.6 Industry-specific compliance

- **Banking + finance** (DACH regulations)
- **Insurance**
- **Healthcare**
- **Government**
- **Energy regulations**

---

## 24. Enterprise SLA & support flow

### 24.1 SLA on request

Per oficiální:

> _"dedicated IPs and SLAs on request"_

**Enterprise SLA includes:**

- Uptime guarantee (99.9%+)
- Response time SLAs
- Issue resolution targets
- Escalation paths
- Penalties for breaches

### 24.2 SLA management

```
Enterprise contract signed s SLA
   ↓
Monthly SLA reports:
- Uptime metrics
- Response times
- Issue resolution stats
- Volume tracking
   ↓
Quarterly reviews:
- SLA performance
- Improvements needed
- Contract renewal
```

### 24.3 Dedicated IPs

- **Optional pro high-volume**
- **Better sender reputation control**
- **Premium tier feature**
- **Custom SLA tied to dedicated IP**

### 24.4 Support hours management

```
Platform: 2h support/month included
Mail Relay: 1h support/month included
   ↓
Track usage:
- Hours consumed
- Hours remaining
- Optional additional hours
   ↓
Personal contact person:
- Strategic guidance
- Knowledge sharing
- Quick issue resolution
   ↓
Escalation paths:
- Technical support team
- Implementation specialist
- Industry vertical expert
- Executive escalation (enterprise)
```

### 24.5 More support optional

Per oficiální:

> _"More support/SLAs optional."_

- **Additional support hours** purchasable
- **Premium SLA tiers**
- **Custom support agreements**
- **24/7 enterprise support** (potentially)

---

## 25. Datová mapa: co vidí kdo

| Data               | Owner | Admin | Mkt User | Designer | Analyst  |  Viewer  |  Subscriber   |    API    | Contact Person |
| ------------------ | :---: | :---: | :------: | :------: | :------: | :------: | :-----------: | :-------: | :------------: |
| Account settings   |  ✅   |  ✅   |    ❌    |    ❌    |    ❌    |    ❌    |      ❌       | per scope |      read      |
| Billing            |  ✅   |  ❌   |    ❌    |    ❌    |    ❌    |    ❌    |      ❌       | per scope |      read      |
| User management    |  ✅   |  ✅   |    ❌    |    ❌    |    ❌    |    ❌    |      ❌       | per scope |      read      |
| All recipients     |  ✅   |  ✅   |    ✅    | limited  |   view   |   view   |   jen sebe    |    ✅     |      read      |
| Edit recipients    |  ✅   |  ✅   |    ✅    |    ❌    |    ❌    |    ❌    |      ❌       |    ✅     |       ❌       |
| Build segments     |  ✅   |  ✅   |    ✅    |    ❌    |   view   |   view   |       –       |    ✅     |      read      |
| Email campaigns    |  ✅   |  ✅   |    ✅    |    ✅    |   view   |   view   | jen co dostal |    ✅     |      read      |
| Send campaigns     |  ✅   |  ✅   |    ✅    |    ❌    |    ❌    |    ❌    |      ❌       |    ✅     |       ❌       |
| Workflows          |  ✅   |  ✅   |    ✅    |   view   |   view   |   view   |      ❌       |    ✅     |      read      |
| Activate workflows |  ✅   |  ✅   |    ✅    |    ❌    |    ❌    |    ❌    |      ❌       |    ✅     |       ❌       |
| Templates          |  ✅   |  ✅   |    ✅    |    ✅    |   view   |   view   |       –       |    ✅     |      read      |
| Forms              |  ✅   |  ✅   |    ✅    |    ✅    |   view   |   view   |    submit     |    ✅     |      read      |
| A/B tests          |  ✅   |  ✅   |    ✅    |   view   |   view   |   view   |       –       |    ✅     |      read      |
| Reports            |  ✅   |  ✅   |    ✅    |   view   |    ✅    |    ✅    |      ❌       |    ✅     |      read      |
| Inxmail Commerce   |  ✅   |  ✅   | per role |   view   |   view   |   view   |       –       |    ✅     |      read      |
| Integrations       |  ✅   |  ✅   | per role |    ❌    |   view   |    ❌    |       –       | per scope |      read      |
| API keys           |  ✅   |  ✅   |    ❌    |    ❌    |    ❌    |    ❌    |      ❌       |     –     |      read      |
| SSO config         |  ✅   |  ✅   |    ❌    |    ❌    |    ❌    |    ❌    |      ❌       |     –     |      read      |
| Audit logs         |  ✅   |  ✅   |    ❌    |    ❌    | per role | per role |      ❌       | per scope |      read      |
| Mail Relay config  |  ✅   |  ✅   |    ❌    |    ❌    |    ❌    |    ❌    |       –       |    ✅     |      read      |
| GDPR delete        |  ✅   |  ✅   | per role |    ❌    | per role |    ❌    |    request    |    ✅     |    execute     |

---

## 26. Známé úzkoprofilové místa

### 26.1 No standard free trial

⚠️ **No public free trial:**

- Test accounts s special conditions
- Sales engagement required
- Less self-serve evaluation
- vs. SMB competitors s free tier

### 26.2 Higher entry cost vs. SMB

- **Platform €200+/month** entry
- **Mail Relay €70+/month** entry
- **vs. CleverReach** free plan
- **Mid-market+ positioning** intentional

### 26.3 Less intuitive than SMB competitors

Per Capterra:

> _"Die Software ist im Vergleich zu Konkurrenzprodukten (mit ähnlichem Funktionsumfang) relativ schwierig zu bedienen."_

⚠️ **Learning curve** higher than Mailchimp / MailerLite simplicity.

### 26.4 HTML editing sometimes needed

Per Capterra:

> _"Um einen Artikel im Newsletter hinzuzufügen, zu löschen oder zu verschieben müssen wir den HTML-Code des Templates bearbeiten."_

⚠️ **Some operations require HTML editing** v legacy templates.

### 26.5 No JavaScript conversion tracking

Per Software Advice:

> _"Ein JavaScript-Conversiontracking wäre ebenso gern gesehen"_

⚠️ Historically missing – check current state.

### 26.6 Inxmail Commerce custom actions limited

Per Software Advice:

> _"die Möglichkeit im visuellen Kampagnen-Builder von Inxmail Commerce eigene Actions entwickeln zu können"_

⚠️ **Pre-built actions only** v visual builder.

### 26.7 Mobile views need improvement

Per Capterra:

> _"Mobilansichten mit besseren Funktionen ausstatten"_

⚠️ **Mobile UI** less polished.

### 26.8 Sign-up process clunky

Per Capterra:

> _"Anmeldeprozess hakelig"_

⚠️ **Onboarding flow** could be smoother.

### 26.9 User administration requires support

Per GetApp:

> _"user administration sometimes requires contacting support"_

⚠️ **Complex user management** sometimes requires support.

### 26.10 Support flexibility issues

Per GetApp:

> _"some feel it can be slow or less flexible for specific requests"_

⚠️ **Some support requests** less flexible.

### 26.11 Less AI-driven vs. modern competitors

- **AI text suggestions** present
- **Not autonomous AI agents**
- **Less predictive ML**
- **vs. Klaviyo / HubSpot / Brevo Aura / SALESmanago**

### 26.12 No webinars / courses

- **No webinar hosting** (vs. GetResponse)
- **No online courses**
- **No paid newsletters**

### 26.13 Less omnichannel than modern platforms

- **Email-focused** primarily
- **Less native SMS** / web push / surveys
- **vs. SALESmanago / SARE / ExpertSender**

### 26.14 Less DTC-focused than Klaviyo

- **No native Shopify ML deep**
- **Less DTC-specific** templates
- **Less e-commerce ML** sophistication

### 26.15 Less landing pages

- **No native landing page builder** prominently
- **vs. GetResponse / HubSpot / Mailchimp**

### 26.16 Mid-market+ entry barrier

- **Not for SMB** primarily
- **€200+/month minimum**
- **Sales engagement** needed

### 26.17 Per-volume pricing scaling at high volume

⚠️ Pro velmi high-volume (10M+ emails/month):

- **Per-email pricing** scales linearly
- **Compare to flat-fee** alternatives
- **May be expensive** at scale

### 26.18 Less brand recognition globally

- **DACH leader** but globally less known
- **Outside DACH:** less visibility

---

## 27. Doporučení pro design vlastních procesů

Pokud Inxmail používáte v týmu, doporučujeme:

1. **Domain authentication day 1** – DKIM + SPF + DMARC + branded tracking
2. **Personal contact person využívat strategicky** – core value of Inxmail
3. **Choose Platform vs. Mail Relay carefully** – different needs, different cost
4. **CSA founding member positioning** comunikace pro internal stakeholders
5. **Multi-language strategy** plan – CZ/PL UI + multi-language campaigns
6. **Custom fields strategy** – plan upfront
7. **Tag taxonomy** – flat structure s prefixes
8. **Templates library** build reusable masters
9. **Brand kit consistent**
10. **Visual workflows patterns** library
11. **A/B testing culture** – always run tests
12. **AI text suggestions** integrate into workflow
13. **DACH-specific integrations** leverage (SAP, Shopware, DACH CRMs)
14. **Shopware integration** if e-commerce (DACH advantage!)
15. **SAP ecosystem integration** if applicable
16. **DACH CRM integration** (CAS, combit, CURSOR)
17. **Industry vertical specialist** consultations
18. **Inxmail Commerce** if e-commerce business
19. **Mail Relay separate** pro pure transactional
20. **Volume planning** – per emails sent pricing
21. **Quota monitoring** – avoid overages
22. **CDN/webspace** utilize (1 GB included)
23. **Support hours management** – 2h/month Platform, 1h Mail Relay
24. **Enterprise SSO** if applicable
25. **GDPR compliance documentation** maintain
26. **Audit logs review** regularly
27. **Double Opt-in always** (DACH standard + DSGVO)
28. **Staging environment** pro complex changes
29. **Backup strategy** periodic export
30. **Migration plan** if scaling beyond Inxmail

---

_Dokument zpracován z oficiálních zdrojů inxmail.de a praktických zdrojů (GetApp, Capterra, Software Advice, OMR Reviews, SourceForge, TechnologyCounter). Pro nejaktuálnější detaily je nutný engagement s Inxmail sales / personal contact person teamem._
