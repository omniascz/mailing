# Salesforce Marketing Cloud – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v Salesforce Marketing Cloud prochází data, lidé a akce – od enterprise sales přes implementation partner selection, Trailhead certifikace, Data Extensions modeling, Journey Builder design, AMPscript development, Einstein AI + Agentforce, cross-cloud orchestrace, až po multi-region governance a audit logs.

> Tento dokument doplňuje `49_SalesforceMC_Features_DeepDive.md` o **procesní pohled**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
> - **Salesforce Marketing Cloud = enterprise standard** s minimum $1,250/měsíc
> - **Multi-product family** – ne jeden nástroj, ale 6+ produktů
> - **Implementation = 3-12 měsíců** (vs. SaaS hours-days)
> - **Implementation partner často nutný** (Salesforce Certified Partner)
> - **AMPscript = proprietary language** (specific skills required)
> - **Trailhead certifications** (Admin, Email Specialist, Developer, Consultant)
> - **Marketing Cloud Next launched October 2025** (Agentforce AI)
> - **"+" editions** přidávají Marketing Cloud Next features
> - **No public pricing** (sales contact required)
> - **AppExchange ecosystem** (1000+ apps)
> - **Multi-region compliance** (GDPR, CCPA, HIPAA, FedRAMP)

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Sales & qualification flow (enterprise)](#2-sales-flow)
3. [Discovery + Demo workflow](#3-discovery-demo)
4. [Implementation Partner selection](#4-partner-selection)
5. [Implementation timeline (3-12 měsíců)](#5-implementation)
6. [Trailhead training + Certifications](#6-trailhead)
7. [Data architecture: Data Extensions](#7-data-extensions)
8. [Email Studio campaign flow](#8-email-studio-flow)
9. [Journey Builder design flow](#9-journey-builder-flow)
10. [Mobile Studio SMS + Push flow](#10-mobile-studio-flow)
11. [WhatsApp + 2-way conversations flow](#11-whatsapp-flow)
12. [Account Engagement (B2B) flow](#12-account-engagement-flow)
13. [Marketing Cloud Personalization deployment](#13-personalization-flow)
14. [Data Cloud (CDP) integration](#14-data-cloud-flow)
15. [Marketing Cloud Intelligence reporting](#15-intelligence-flow)
16. [Einstein AI activation](#16-einstein-flow)
17. [Agentforce for Marketing flow (NEW 2025!)](#17-agentforce-flow)
18. [AMPscript development workflow](#18-ampscript-flow)
19. [Cross-cloud orchestration (Marketing + Sales + Service)](#19-cross-cloud)
20. [Compliance + Privacy management](#20-compliance-flow)
21. [Multi-org + Multi-brand management](#21-multi-org)
22. [AppExchange app integration](#22-appexchange-flow)
23. [Premier Support flow](#23-premier-support)
24. [Datová mapa: co vidí kdo](#24-data-map)
25. [Známé úzkoprofilové místa](#25-bottlenecks)

---

## 1. Mapa všech aktérů

```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│         SALESFORCE MARKETING CLOUD ECOSYSTEM                           │
│         Salesforce, Inc. · HQ San Francisco · NYSE: CRM                │
│         Marketing Cloud Engagement (B2C) + Account Engagement (B2B)    │
│         + Personalization + Intelligence + Data Cloud                  │
│         + Marketing Cloud Next (Oct 2025 GA - Agentforce AI)           │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  [Salesforce tým]                                                      │
│   ├─ CEO Marc Benioff (founder)                                        │
│   ├─ Account Executives (enterprise sales)                             │
│   ├─ Solution Engineers (technical pre-sales)                          │
│   ├─ Customer Success Managers (CSMs)                                  │
│   ├─ Trailhead team (education)                                        │
│   ├─ Salesforce Labs (free apps)                                       │
│   ├─ Premier Support team                                              │
│   ├─ Professional Services (paid implementation)                       │
│   ├─ Marketing Cloud product team                                      │
│   ├─ Agentforce team (Marketing Cloud Next)                            │
│   ├─ Engineering (massive)                                             │
│   └─ Certified Partners (1000s globally)                               │
│           │                                                            │
│           ▼                                                            │
│                                                                        │
│   ┌────────────────────────────────────────────┐                       │
│   │   Salesforce Org / Tenant                  │                       │
│   │                                            │                       │
│   │   ROLES + PERMISSIONS:                     │                       │
│   │   ├─ System Administrator (full access)    │                       │
│   │   ├─ Marketing Cloud Administrator         │                       │
│   │   ├─ Marketing Manager                     │                       │
│   │   ├─ Marketing User (operational)          │                       │
│   │   ├─ Email Specialist                      │                       │
│   │   ├─ Mobile Specialist                     │                       │
│   │   ├─ Content Editor                        │                       │
│   │   ├─ Analytics User                        │                       │
│   │   ├─ Approver / Reviewer                   │                       │
│   │   └─ Custom roles (Enterprise edition)     │                       │
│   │                                            │                       │
│   │   MARKETING CLOUD MODULES:                 │                       │
│   │   ├─ Email Studio                          │                       │
│   │   ├─ Journey Builder                       │                       │
│   │   ├─ Mobile Studio                         │                       │
│   │   ├─ Content Builder                       │                       │
│   │   ├─ Advertising Studio                    │                       │
│   │   ├─ Audience Builder                      │                       │
│   │   ├─ Automation Studio                     │                       │
│   │   ├─ Einstein AI                           │                       │
│   │   ├─ Marketing Cloud Next (Engagement+)    │                       │
│   │   └─ Account Engagement (B2B)              │                       │
│   │                                            │                       │
│   │   ADDITIONAL PRODUCTS:                     │                       │
│   │   ├─ Marketing Cloud Personalization       │                       │
│   │   ├─ Marketing Cloud Intelligence          │                       │
│   │   └─ Data Cloud (CDP)                      │                       │
│   └──────────────┬─────────────────────────────┘                       │
│                  │                                                     │
│                  ▼                                                     │
│   [Cross-Cloud ecosystem]                                              │
│       │                                                                │
│       ├─→ Sales Cloud (CRM)                                            │
│       │   - Leads, Accounts, Contacts, Opportunities                   │
│       │   - Bidirectional sync                                         │
│       │                                                                │
│       ├─→ Service Cloud                                                │
│       │   - Cases, Service Console                                     │
│       │   - Customer Service                                           │
│       │                                                                │
│       ├─→ Commerce Cloud                                               │
│       │   - Cart abandonment events                                    │
│       │   - Order data                                                 │
│       │                                                                │
│       ├─→ Data Cloud                                                   │
│       │   - Unified customer profiles                                  │
│       │   - Real-time activation                                       │
│       │                                                                │
│       └─→ Slack (integrated)                                           │
│                  │                                                     │
│                  ▼                                                     │
│   [Marketing channels]                                                 │
│   ┌────────────────────────────────────────────┐                       │
│   │   - Email (massive scale)                  │                       │
│   │   - SMS (200+ countries)                   │                       │
│   │   - MMS (multimedia)                       │                       │
│   │   - Push notifications (mobile)            │                       │
│   │   - In-app messaging                       │                       │
│   │   - WhatsApp Business (native 2025+)       │                       │
│   │   - LINE messaging                         │                       │
│   │   - Web (Personalization)                  │                       │
│   │   - Paid ads (Google, Facebook, LinkedIn)  │                       │
│   │   - Direct mail (via partners)             │                       │
│   │   - Voice (via partners)                   │                       │
│   └────────────────────────────────────────────┘                       │
│                                                                        │
│   [Customers / End audience]                                           │
│       - Email subscribers (millions typical)                           │
│       - Mobile app users                                               │
│       - Web visitors (tracked)                                         │
│       - B2B leads + contacts                                           │
│       - Customers (post-purchase)                                      │
│                                                                        │
│   [AppExchange ecosystem]                                              │
│       - 1000+ apps                                                     │
│       - Litmus, Email on Acid, Validity                                │
│       - LeanData, ZoomInfo, Drift                                      │
│       - Custom apps + partner apps                                     │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér | Vstupní bod | Co dělá | Co vidí |
|---|---|---|---|
| **System Admin** | Salesforce Setup | Full configuration | Vše |
| **MC Administrator** | MC Setup | MC-specific config | MC scope |
| **Marketing Manager** | MC interface | Strategy + approval | Per scope |
| **Marketing User** | MC interface | Campaign execution | Per role |
| **Email Specialist** | Email Studio | Email creation | Per scope |
| **Mobile Specialist** | Mobile Studio | SMS/Push | Per scope |
| **Content Editor** | Content Builder | Content creation | Per scope |
| **Analytics User** | Reports + Intelligence | Reporting | Per scope |
| **Approver/Reviewer** | Approval workflows | Sign-off | Approval scope |
| **End subscriber/lead** | Email/SMS/Web | Engage | Vlastní data |
| **Implementation Partner** | Engaged for project | Setup + customization | s consent |
| **Salesforce AE** | Sales cycle | Account management | s consent |
| **Salesforce CSM** | Post-sale | Adoption | s consent |
| **Premier Support** | Support tickets | Issue resolution | s consent |
| **Trailhead learners** | trailhead.salesforce.com | Self-learning | Public materials |
| **AppExchange devs** | AppExchange | App development | Per integration |
| **Agentforce AI** | Marketing Cloud Next | Autonomous tasks | Configured scope |
| **Einstein AI** | Embedded | AI predictions | Aggregated data |

---

## 2. Sales & qualification flow (enterprise)

### 2.1 Enterprise sales cycle

```
Marketing Cloud sales cycle:

PROSPECTING (Month 1-2):
- Inbound (website forms)
- Outbound (AE outreach)
- Partner referrals
- Existing Salesforce expansion
- Industry events (Dreamforce, etc.)
- Account-Based Marketing

DISCOVERY (Month 2-3):
- Stakeholder interviews
- Current state assessment
- Pain points identification
- Goals + KPIs alignment
- Tech stack review
- Budget conversation

SOLUTION DESIGN (Month 3-4):
- Custom solution proposal
- Product mix recommendation
  - Engagement vs. Account Engagement
  - Personalization yes/no
  - Intelligence yes/no
  - Data Cloud yes/no
- Implementation timeline
- Partner recommendation
- ROI modeling

EVALUATION (Month 4-5):
- Demo sessions
- POC (proof of concept) sometimes
- Reference calls
- Technical deep dives
- Security review
- Legal review

NEGOTIATION (Month 5-6):
- Multi-year contracts typical
- Pricing negotiation
- Custom terms
- Add-on bundles
- Premier Support
- SLAs

CLOSE (Month 6):
- Signed contract
- Implementation kick-off
- Partner engaged
- Internal team identified
- Project plan
```

⚠️ **Enterprise sales = 3-9 měsíců** typically.

### 2.2 Qualification criteria

```
Marketing Cloud fits pokud:

✅ Enterprise B2C (Engagement) or B2B (Account Engagement)
✅ 100K+ kontaktů (sweet spot pro Engagement)
✅ 10K-100K B2B kontaktů (Account Engagement)
✅ Multi-channel marketing
✅ Existing Salesforce CRM (key!)
✅ Budget $200K+ Year 1
✅ Dedicated marketing operations team (3+ FTEs)
✅ 3-12 měsíců implementation OK
✅ Long-term commitment (3+ years)
✅ Industries: retail, financial, healthcare, telco, travel, manufacturing
✅ Multi-region operations
✅ Enterprise compliance (HIPAA, GDPR, etc.)

❌ SMB (<100 employees, <100K contacts)
❌ DTC startup (Klaviyo lepší)
❌ Quick iteration mode
❌ No Salesforce CRM
❌ Limited budget
❌ No dedicated team
❌ Want self-service tool
❌ Need modern intuitive UX
❌ Need free plan
```

### 2.3 Common sales challenges

```
Sales objections:

PRICE:
- "$1,250+/měsíc too high"
- Response: ROI modeling
- Multi-year discounts

COMPLEXITY:
- "Too complex to use"
- Response: Trailhead + partners
- Implementation support

TIME-TO-VALUE:
- "Too slow to launch"
- Response: Phased implementation
- Quick wins first

VENDOR LOCK-IN:
- "Hard to migrate later"
- Response: Investment justified
- Salesforce ecosystem stability

COMPETITION (HubSpot, Klaviyo, Adobe):
- Reference customers
- Differentiation talk
- Industry-specific value
```

---

## 3. Discovery + Demo workflow

### 3.1 Discovery questions

```
Salesforce AE/SE discovery:

ABOUT BUSINESS:
- Industry vertical
- Company size (employees, revenue)
- Number of brands
- Geographic regions
- Languages
- Compliance requirements

ABOUT MARKETING:
- Current tools
- Team size + structure
- Contact base size
- Email volume monthly
- Channels (email, SMS, push, etc.)
- Marketing goals + KPIs

ABOUT TECH STACK:
- Existing Salesforce CRM?
- CDP in place?
- Analytics platform?
- DTC stack (Shopify, etc.)?
- IT readiness?

ABOUT BUDGET:
- Marketing tech budget
- Implementation budget
- Internal resources available
- Decision-making timeline
```

### 3.2 Demo workflow

```
Multi-stage demo:

1. EXECUTIVE OVERVIEW (1 hour):
   - High-level vision
   - Customer success stories
   - Industry case studies
   - ROI examples

2. PRODUCT DEEP DIVE (2-3 hours):
   - Email Studio walkthrough
   - Journey Builder live demo
   - Personalization examples
   - Reports + analytics
   - AI capabilities

3. INTEGRATION DEMO (1-2 hours):
   - Sales Cloud sync
   - Data flow examples
   - Cross-cloud workflows
   - API capabilities

4. TECHNICAL DEEP DIVE (2-3 hours):
   - Architecture overview
   - Security model
   - Compliance walkthrough
   - Data Extensions modeling
   - AMPscript examples

5. CUSTOMIZATION DEMO (2-3 hours):
   - Custom-to-customer scenarios
   - Specific use cases
   - "Day in the life" demos
```

### 3.3 Reference calls

```
Reference customer calls:
- Salesforce-coordinated
- Similar industry preferred
- Similar size preferred
- 30-60 minute calls
- Honest feedback
- Implementation reality
- Ongoing satisfaction
```

---

## 4. Implementation Partner Selection

### 4.1 Partner ecosystem

```
Salesforce Partner Network:

PARTNER TIERS:
- Registered (entry level)
- Crest (mid-level)
- Summit (top tier)
- Specializations: Marketing Cloud specific

PARTNER TYPES:
- Global SIs: Accenture, Deloitte, IBM, Capgemini, PwC
- Mid-size: Slalom, Cognizant, Wipro
- Specialists: Cheetah Digital, Salt Marketing, Brightline
- Boutique: 100s globally

PARTNER LOCATIONS:
- Strong in US, UK, DACH, Nordics, Western Europe
- Growing in Eastern Europe (Czech Republic included)
- Strong APAC (Australia, India, Japan)
```

### 4.2 Partner selection process

```
Partner evaluation flow:

1. Shortlist (3-5 partners):
   - Salesforce recommendations
   - Industry research
   - Reference checks
   - Partner ratings on AppExchange

2. RFP process:
   - Capabilities document
   - Case studies request
   - Technical assessment
   - Cost estimate
   - Timeline estimate

3. Partner demos:
   - Show similar projects
   - Methodology presentation
   - Team introductions

4. Reference checks:
   - 3-5 reference calls
   - Similar industry
   - Project complexity
   - Outcome verification

5. Negotiation:
   - Fixed price vs. T&M
   - Milestones
   - Penalties
   - Success metrics
   - Knowledge transfer

6. Selection + Contract
```

### 4.3 Partner cost ranges

```
Implementation partner costs:

SMALL implementation:
- $50K-$150K
- 3-6 měsíců
- Single product
- Limited customization

MEDIUM implementation:
- $150K-$400K
- 6-9 měsíců
- Multiple products
- Moderate customization

LARGE implementation:
- $400K-$1M+
- 9-12+ měsíců
- Full Marketing Cloud
- Heavy customization
- Multi-brand
- Multi-region
```

### 4.4 Partner responsibilities

```
Partner deliverables:

ARCHITECTURE:
- Data model design
- Data Extensions schema
- Journey design
- Integration architecture

CONFIGURATION:
- Marketing Cloud setup
- User roles + permissions
- Email send configuration
- Domain authentication
- IP setup

DEVELOPMENT:
- AMPscript development
- Custom integrations
- Data import workflows
- API integrations

TEMPLATE DESIGN:
- Email templates (branded)
- Landing pages
- Forms

JOURNEY DESIGN:
- Welcome series
- Win-back campaigns
- Cross-sell journeys
- Compliance journeys

TRAINING:
- Admin training
- User training
- Knowledge transfer
- Documentation

GO-LIVE SUPPORT:
- First sends supervision
- Issue resolution
- Optimization
- Performance tuning
```

---

## 5. Implementation Timeline (3-12 měsíců)

### 5.1 Typical phased approach

```
Phase 1: DISCOVERY + DESIGN (Month 1-2)
- Business requirements
- Technical requirements
- Data architecture
- Use case definition
- Success metrics
- Project plan

Phase 2: FOUNDATION (Month 2-3)
- Marketing Cloud provisioning
- User setup
- Domain authentication (SPF, DKIM, DMARC)
- IP setup + warming
- Basic configuration
- Sandbox environment

Phase 3: DATA SETUP (Month 3-4)
- Data Extensions design
- Data import workflows
- Salesforce CRM integration
- Data Cloud setup (if applicable)
- Identity resolution
- Initial data load

Phase 4: ASSETS + TEMPLATES (Month 4-5)
- Brand templates
- Email templates
- Forms + landing pages
- Content blocks library
- Approval workflows

Phase 5: JOURNEYS + AUTOMATION (Month 5-6)
- Welcome series
- Engagement journeys
- Transactional flows
- Win-back campaigns
- Re-engagement
- Lifecycle automation

Phase 6: TESTING + QA (Month 6-7)
- End-to-end testing
- Personalization testing
- Performance testing
- Security testing
- UAT (User Acceptance Testing)
- Compliance audit

Phase 7: GO-LIVE (Month 7-8)
- Phased migration
- Soft launch
- Monitoring
- Issue resolution
- Performance optimization

Phase 8: OPTIMIZATION + EXPANSION (Month 8+)
- Performance review
- Optimization
- Additional channels (SMS, push)
- Additional brands
- Continuous improvement
```

### 5.2 Realistic timeline factors

```
Timeline determinants:

ACCELERATORS:
- Clear requirements
- Strong project manager
- Existing data quality
- Limited customization
- Single product (Engagement only)
- Internal expertise

DECELERATORS:
- Multi-brand
- Multi-region (compliance per region)
- Heavy customization
- Multiple products
- Poor data quality
- Internal staffing gaps
- Vendor selection delays
- Change requests during impl
- Multi-stakeholder approval
```

### 5.3 Per Codleo

> *"Onboarding teams may need Salesforce Premier Support, Trailhead courses, or consulting services, especially if their workflows are complicated. By planning for these extra expenses, businesses can get the most out of the platform while staying within their budget."*

⚠️ **Implementation = největší capital cost** Year 1.

---

## 6. Trailhead training + Certifications

### 6.1 Trailhead = Salesforce learning platform

```
Trailhead.salesforce.com:
- Free for individuals
- Modular learning ("trails")
- Hands-on challenges
- Salesforce playgrounds
- Community support
- Badges + points
- Progress tracking
```

### 6.2 Marketing Cloud certifications

```
Certifications available:

MARKETING CLOUD ADMINISTRATOR:
- Foundational
- $200 exam fee
- 60 questions
- 105 minutes
- 67% passing
- Renewed: 1 release/year (Spring/Summer/Winter)

MARKETING CLOUD EMAIL SPECIALIST:
- Email-focused
- $200 exam
- Topics: Email creation, sends, content, deliverability
- 60 questions, 105 minutes
- 65% passing

MARKETING CLOUD DEVELOPER:
- Technical
- AMPscript, SSJS, APIs
- $200 exam
- 60 questions, 105 minutes
- 67% passing

MARKETING CLOUD CONSULTANT:
- Solution architect level
- $200 exam
- Advanced design
- 60 questions, 105 minutes
- 67% passing

MARKETING CLOUD ACCOUNT ENGAGEMENT SPECIALIST:
- B2B / Pardot
- $200 exam

MARKETING CLOUD ACCOUNT ENGAGEMENT CONSULTANT:
- B2B advanced
- $200 exam
```

### 6.3 Certification path

```
Recommended path:

LEVEL 1 (Junior):
1. Marketing Cloud Administrator
   - Foundation
   - 30-50 hours study

LEVEL 2 (Mid-level):
2. Marketing Cloud Email Specialist
   - Operational
   - 40-60 hours study

LEVEL 3 (Senior):
3. Marketing Cloud Developer (technical track)
   OR
3. Marketing Cloud Consultant (architect track)
   - 60-100 hours study

LEVEL 4 (Expert):
4. Marketing Cloud Architect designation
   - Multiple certs combined
   - Demonstrated experience
```

### 6.4 Cost of certification team

```
Team certification cost:

5-person team, fully certified:
- 5 Admin: $1,000
- 3 Email Specialist: $600
- 1 Developer: $200
- 1 Consultant: $200
- Total exam fees: $2,000
- Study time: ~$30K-$50K (opportunity cost)
- Maintenance: 1 release/year per cert
   ↓
Total certification investment: $30K-$50K Year 1
```

### 6.5 Internal vs. external

```
Certification strategy:

INTERNAL CERTIFICATION:
- Long-term ownership
- Knowledge stays in-house
- Higher upfront investment
- 6-12 měsíců to ramp

EXTERNAL CONSULTANTS:
- Certified partners available
- $150-$300/hour typical
- Specialized expertise
- Faster ramp-up
- Higher per-project cost
```

---

## 7. Data architecture: Data Extensions

### 7.1 Data Extensions = klíčový koncept

```
Data Extensions overview:
- Custom tables in Marketing Cloud
- Schema flexible (define columns)
- Relational (parent-child)
- Bulk + streaming import
- API accessible
- Used for:
  - Subscribers (sendable)
  - Reference data (non-sendable)
  - Transactional data
  - Behavioral data
  - Personalization data
```

### 7.2 Data architecture design

```
Typical data model:

LEVEL 1: SUBSCRIBER DATA EXTENSIONS
- Master subscriber list
- Email, phone, name
- Marketing preferences
- Subscription status
- Source attribution

LEVEL 2: PROFILE DATA EXTENSIONS
- Demographics
- Custom attributes
- Behavioral attributes
- Engagement scores
- Lifecycle stage

LEVEL 3: BEHAVIORAL DATA
- Web events
- Mobile events
- Purchase history
- Engagement history
- Campaign history

LEVEL 4: TRANSACTIONAL DATA
- Orders
- Subscriptions
- Loyalty points
- Service tickets
- Payments

LEVEL 5: CAMPAIGN DATA
- Sends
- Opens
- Clicks
- Conversions
- Attribution

RELATIONSHIPS:
- Parent-child via subscriber key
- Lookup vs. embedded data
- Performance considerations
```

### 7.3 Data import workflows

```
Data import methods:

BATCH IMPORT:
- CSV upload (manual)
- SFTP automated drop
- Scheduled imports
- Validation + error handling

STREAMING IMPORT:
- API calls
- Real-time push from Salesforce CRM
- Webhook triggers
- Event-driven updates

CDC (Change Data Capture):
- From Salesforce CRM
- Real-time sync
- Bidirectional

CUSTOM INTEGRATIONS:
- ETL tools (Informatica, Talend)
- iPaaS (MuleSoft, Boomi)
- Custom code
```

### 7.4 Data hygiene

```
Data hygiene practices:

REGULAR CLEANSING:
- Duplicate management
- Email validation
- Bounce handling
- Inactive identification
- Data quality scoring

SUPPRESSION LISTS:
- Unsubscribe list
- Hard bounce list
- Spam complaints
- Suppression by region
- Global vs. local suppression

PRIVACY MANAGEMENT:
- Data subject access requests (GDPR)
- Right to be forgotten
- Consent management
- Preference centers
- Subscription centers
```

---

## 8. Email Studio Campaign Flow

### 8.1 Email creation workflow

```
Email Studio campaign flow:

1. SETUP:
   - Create new email
   - Select template
   - Brand styling auto-applied
   - Subject + preheader

2. CONTENT:
   - Drag-drop content blocks
   - HTML/code (optional)
   - Personalization tokens
   - Dynamic content blocks
   - AMPscript (advanced)
   - Content from library
   - Image upload
   - Buttons + CTAs

3. PERSONALIZATION:
   - Static tokens (%%firstname%%)
   - Dynamic content (AMPscript)
   - Profile attributes
   - Behavioral data
   - Predictive AI (Einstein)

4. TESTING:
   - Mobile preview
   - Inbox preview (Litmus)
   - Send test email
   - Spam test
   - Link verification
   - Render check

5. AUDIENCE:
   - Select Data Extension
   - Apply filters
   - Suppression check
   - Preview count

6. SEND CONFIGURATION:
   - From name/email
   - Reply-to
   - Send date/time
   - Send classification
   - Throttling

7. APPROVAL:
   - Submit for review
   - Approver notification
   - Comments + changes
   - Final approval

8. SEND:
   - Immediate or scheduled
   - Time zone aware
   - Send time optimization (Einstein)
   - Monitoring real-time

9. TRACKING:
   - Sends delivered
   - Opens (real-time)
   - Clicks
   - Conversions
   - Revenue (if tracked)
   - Per-recipient detail
```

### 8.2 Approval workflow

```
Enterprise approval flow:

Submission:
- Author submits draft
- Initial QA check

Review stages:
1. Marketing peer review (style, content)
2. Brand compliance review
3. Legal review (if needed)
4. Manager approval
5. Final QA
   ↓
Approved → Send queue
Rejected → Back to author
```

### 8.3 Send-time optimization (Einstein)

```
Einstein STO flow:

1. Marketing creates campaign
2. Defines send window (e.g., 24 hours)
3. Einstein analyzes:
   - Per-recipient engagement history
   - Time-of-day patterns
   - Day-of-week preferences
   - Device usage
   - Time zone
4. Stages individual sends
5. Each recipient gets optimal time
6. Performance reported per cohort
   ↓
Lift: 10-25% in opens typically
```

---

## 9. Journey Builder Design Flow

### 9.1 Journey design workflow

```
Journey Builder design:

1. PLANNING:
   - Use case definition
   - Audience identification
   - Goal definition
   - Channel selection
   - Success metrics

2. CANVAS DESIGN:
   - Entry source (trigger)
   - Path activities:
     - Email
     - SMS
     - Wait
     - Decision Split
     - Engagement Split
     - Update Contact
     - Custom Activity
   - Exit criteria
   - Goals tracking

3. AUDIENCE CONFIGURATION:
   - Source Data Extension
   - Entry filter
   - Re-entry rules
   - Exit conditions

4. ASSET CREATION:
   - Email templates (per step)
   - SMS messages
   - Push notifications
   - Personalization

5. TESTING:
   - Test contacts
   - Walk through journey
   - Validate paths
   - Check timing
   - Verify content

6. ACTIVATION:
   - Validate journey
   - Run validation tool
   - Activate live
   - Monitor entries
   - Performance tracking

7. OPTIMIZATION:
   - Performance analysis
   - A/B test paths
   - Adjust timing
   - Refine content
   - Goal achievement
```

### 9.2 Journey types

```
Common journey types:

LIFECYCLE JOURNEYS:
- Welcome series (new subscribers)
- Onboarding (new customers)
- Post-purchase (orders)
- Anniversary
- Birthday
- Re-engagement (inactive)
- Win-back (churned)

TRIGGERED JOURNEYS:
- Cart abandonment
- Browse abandonment
- Wish list updates
- Stock alerts
- Price drops
- Newsletter sign-up

PROMOTIONAL JOURNEYS:
- Sale campaigns
- Product launches
- Seasonal (Black Friday, Christmas)
- Event-driven

LOYALTY JOURNEYS:
- Tier upgrades
- Points expiring
- VIP exclusive
- Reward notifications

SERVICE JOURNEYS:
- Case follow-up
- Customer satisfaction
- NPS surveys
- Renewal reminders

B2B JOURNEYS (Account Engagement):
- Lead nurturing
- ABM campaigns
- Trial activation
- Sales handoff
- Customer expansion
```

### 9.3 Cross-Journey Orchestration (NEW Oct 2025)

```
Cross-Journey Orchestration:

Connected journeys:
- Welcome series → Engagement journey
- Cart abandon → Post-purchase
- Service case → Re-engagement
   ↓
Customer flows naturally between
   ↓
Holistic journey graph (CJG)
Customer-centric view
```

---

## 10. Mobile Studio SMS + Push Flow

### 10.1 SMS campaign flow

```
SMS Studio workflow:

SETUP:
- Configure SMS sender (short code, long code)
- Country/region setup
- Compliance language template
- Opt-in/opt-out workflows

CAMPAIGN CREATION:
1. New SMS campaign
2. Audience selection
3. Message composition:
   - 160 chars per SMS
   - Personalization tokens
   - URL shortening
   - Multimedia (MMS)
4. Compliance check:
   - Opt-out clause
   - Sender ID
5. Test send
6. Schedule / Send

TRACKING:
- Delivery status
- Click tracking (shortened URLs)
- Opt-outs (auto-suppressed)
- 2-way responses
```

### 10.2 Push notification flow

```
Push notification workflow:

PREREQUISITES:
- Mobile SDK integrated
- Device tokens registered
- App registered in Marketing Cloud

CAMPAIGN:
1. Select mobile app
2. Compose:
   - Title (60 chars)
   - Body (longer)
   - Rich media (image)
   - Deep link (open specific screen)
   - Custom data
3. Audience:
   - All users
   - Segment
   - Personalized
4. Schedule:
   - Immediate
   - Scheduled
   - Time zone aware
   - Geo-fenced (location-based)
5. Send
6. Track:
   - Delivery
   - Open rate
   - Conversion
```

### 10.3 In-app messaging

```
In-app messaging workflow:

TYPES:
- Banner (top/bottom)
- Modal (overlay)
- Card (inline)
- Full-screen takeover

TRIGGERS:
- App launch
- Specific screen view
- User action
- Behavioral

PERSONALIZATION:
- Per-user content
- Localization
- A/B test variants

USE CASES:
- Onboarding tutorials
- Feature announcements
- Promotional offers
- Compliance notices
- Surveys
```

### 10.4 Group messaging (bulk SMS)

```
Group messaging:
- Optimized for bulk SMS
- Compliance-aware
- Throttling automatic
- Best for: large segments
- Per-recipient personalization
```

---

## 11. WhatsApp + 2-way conversations flow

### 11.1 WhatsApp setup (NEW 2025+)

```
WhatsApp Business setup:

PREREQUISITES:
- WhatsApp Business Platform account
- Verified business
- Phone number provisioning
- Templates approved by Meta

INTEGRATION:
- Native Marketing Cloud (post-Oct 2025)
- Previously: 3rd-party integration
- API setup

TEMPLATES:
- Pre-approved by WhatsApp
- Categories: marketing, utility, authentication
- Personalization variables
- Multi-language

USE CASES:
- Order confirmations
- Shipping updates
- Customer service
- Promotional campaigns
- 2-way conversations
- AI bot routing
```

### 11.2 2-way conversation flow

```
Conversational flow:

1. Customer initiates:
   - Sends WhatsApp message
   - Inbound to Marketing Cloud

2. AI bot first response (Agentforce):
   - Natural language understanding
   - Intent classification
   - Auto-response if simple

3. Human handoff (if complex):
   - Route to agent
   - Context provided
   - Full conversation history
   - Service Cloud integration

4. Resolution:
   - Issue resolved
   - Customer satisfied
   - Conversation closed

5. Follow-up:
   - Satisfaction survey
   - Logged in Marketing Cloud
   - Sentiment analysis
   - Feed loop to AI
```

### 11.3 Conversational commerce

```
Commerce via WhatsApp:

Use case examples:
- Product catalog browse
- Add to cart via chat
- Checkout via chat
- Order tracking
- Returns initiation
- Payment processing
   ↓
End-to-end commerce experience
High conversion rates
98%+ message open rates
```

---

## 12. Account Engagement (B2B) Flow

### 12.1 B2B-specific workflow

```
Account Engagement (Pardot) flow:

1. LEAD CAPTURE:
   - Forms (web, gated content)
   - Landing pages
   - Social connectors
   - List imports
   - Salesforce sync

2. LEAD SCORING:
   - Score = engagement metric
   - Grade = fit metric
   - Combined: ABCD grading
   - Real-time updates
   - Threshold-based actions

3. LEAD NURTURING:
   - Engagement Studio (visual builder)
   - Drip campaigns
   - Behavior-based paths
   - Time delays
   - Conditional logic

4. LEAD ROUTING:
   - When score threshold reached:
     - Assigned to sales user
     - Salesforce notification
     - Round-robin or rules-based
     - Territory-based routing

5. SALES HANDOFF:
   - Lead → Salesforce contact/lead
   - Connected Campaign tracking
   - Sales follow-up
   - Email tracking (Sales Cloud)

6. OPPORTUNITY:
   - Created in Salesforce
   - Marketing attribution
   - Multi-touch reporting
   - Pipeline impact

7. CLOSED-WON:
   - Customer status
   - Move to onboarding
   - Cross-sell journey
   - Renewal automation

8. RETENTION + EXPANSION:
   - Customer marketing
   - Renewal reminders
   - Up-sell opportunities
   - Advocacy programs
```

### 12.2 Engagement Studio

```
Engagement Studio = B2B journey builder:

VISUAL DESIGN:
- Drag-drop builder
- Steps: Action, Trigger, Rule, Wait
- Multiple paths
- Branching logic

ACTIONS:
- Send email
- Add to list
- Assign to user
- Notify user
- Update field
- Adjust score

TRIGGERS:
- Email opened
- Email clicked
- Form submitted
- Page visited
- Custom redirect

RULES:
- Score threshold
- Grade match
- Custom field equals
- Membership in list
- Behavior count

WAITS:
- Time delays
- Specific date
- Working hours

USE CASES:
- Welcome new MQL
- Re-engage cold leads
- ABM campaigns
- Event follow-up
- Newsletter management
```

### 12.3 ABM (Account-Based Marketing)

```
ABM workflow in Account Engagement:

1. Target account selection
2. Decision-maker identification
3. Personalized content per account
4. Multi-touch coordination
5. Sales + Marketing alignment
6. Account-level reporting
7. Pipeline attribution
   ↓
Account Engagement+ enhances with AI
```

---

## 13. Marketing Cloud Personalization Deployment

### 13.1 Web personalization setup

```
Personalization deployment:

1. SITE INTEGRATION:
   - JavaScript snippet (like analytics tag)
   - Placed on all pages
   - Captures behavior in real-time

2. DATA INTEGRATION:
   - Marketing Cloud Engagement data
   - Salesforce CRM data
   - Commerce Cloud orders
   - Custom data sources
   - Real-time streaming

3. CAMPAIGN CREATION:
   - Hero section variations
   - Product recommendations
   - Content recommendations
   - Search results
   - Email content

4. MACHINE LEARNING:
   - Affinity modeling
   - Predictive next-best-action
   - Recommendation engines
   - Auto-optimization

5. TESTING + ACTIVATION:
   - A/B/N testing
   - Control vs. variants
   - Statistical significance
   - Activate winners
```

### 13.2 Email personalization

```
Email personalization via MC Personalization:

1. Email template prepared in Engagement
2. Content block calls Personalization API
3. Real-time decisioning:
   - Visitor profile pulled
   - Behavioral history analyzed
   - ML predicts best content
   - Returns personalized blocks
4. Email rendered with personalized content
5. Sent to recipient
   ↓
Open-time personalization (best practice)
Content always relevant
Even hours after send
```

### 13.3 Mobile + in-app personalization

```
Mobile personalization:

1. SDK integrated in mobile app
2. User behavior tracked real-time
3. Personalized content delivered:
   - App home screen
   - Product recommendations
   - In-app messages
   - Push notifications (timing)
4. Continuous learning
```

---

## 14. Data Cloud (CDP) Integration

### 14.1 Data Cloud setup

```
Data Cloud deployment:

1. DATA INGESTION:
   - Connect Salesforce clouds:
     - Sales Cloud
     - Service Cloud
     - Commerce Cloud
     - Marketing Cloud
   - External sources:
     - ERP systems
     - Data warehouses
     - Mobile apps
     - Web analytics
   - Real-time streams
   - Batch imports

2. IDENTITY RESOLUTION:
   - Match person across systems
   - Email matching
   - Phone matching
   - Custom identifiers
   - Probabilistic matching

3. UNIFIED PROFILE:
   - Single customer view
   - Cross-channel behavior
   - Complete history
   - Real-time updates

4. CALCULATED INSIGHTS:
   - Customer LTV
   - Churn risk score
   - Next-best-action
   - Engagement score
   - Lifecycle stage

5. SEGMENTATION:
   - Real-time segments
   - ML-driven segments
   - Predictive audiences
   - Lookalike modeling

6. ACTIVATION:
   - To Marketing Cloud Engagement
   - To Personalization
   - To Ad platforms
   - To Sales/Service Cloud
   - APIs (custom destinations)
```

### 14.2 Use case: unified personalization

```
Unified personalization flow:

1. Customer browses website
   - Web behavior tracked → Data Cloud
2. Customer calls support
   - Service case → Data Cloud
3. Customer purchases
   - Order data → Data Cloud
   ↓
Data Cloud unifies all data
   ↓
Real-time profile updated
   ↓
Marketing Cloud Engagement uses Data Cloud profile:
- Sends relevant email
- Personalized content
- Knows recent service issue
- Knows purchase history
   ↓
Unified, relevant experience
```

### 14.3 Per oficiální

> *"Data Unification: With Data 360, Account Engagement customers can build segments using all their Salesforce and non-Salesforce data in one unified platform."*

---

## 15. Marketing Cloud Intelligence Reporting

### 15.1 Intelligence setup

```
Marketing Cloud Intelligence flow:

1. DATA CONNECTIONS:
   - 200+ pre-built connectors
   - Marketing channels (Google, Facebook, LinkedIn)
   - Web analytics (GA4)
   - Commerce platforms
   - CRM data
   - Marketing automation (MC Engagement)
   - Custom APIs

2. DATA MODELING:
   - Common data model
   - Calculated metrics
   - Cross-channel attribution
   - Custom KPIs

3. DASHBOARD CREATION:
   - Executive dashboards
   - Channel dashboards
   - Campaign dashboards
   - ROI dashboards
   - Custom views

4. AI INSIGHTS:
   - Automated insights
   - Anomaly detection
   - Trend analysis
   - Performance recommendations

5. REPORTING:
   - Real-time updates
   - Scheduled reports
   - Export capabilities
   - Mobile dashboards
```

### 15.2 Use cases

```
Common Intelligence use cases:

EXECUTIVE REPORTING:
- Marketing performance overview
- ROI by channel
- Budget utilization
- KPI tracking

CHANNEL OPTIMIZATION:
- Compare email vs. social vs. paid
- ROI per channel
- Audience overlap
- Budget allocation guidance

CAMPAIGN ANALYSIS:
- Multi-touch attribution
- Campaign comparison
- ROI per campaign
- Optimization recommendations

VENDOR MANAGEMENT:
- Agency performance
- Vendor ROI
- Cost per result
- Budget tracking
```

### 15.3 Intelligence+ (NEW)

```
Intelligence+ adds:
- Agentforce-powered analytics
- AI-driven recommendations
- Auto-generated insights
- Predictive forecasting
```

---

## 16. Einstein AI activation

### 16.1 Einstein activation flow

```
Einstein deployment:

1. ENABLEMENT:
   - Marketing Cloud edition includes Einstein basic
   - Higher tiers = more capabilities
   - Some features = add-ons

2. SETUP:
   - Connect to data
   - Define use cases
   - Configure thresholds
   - Train models (data required)

3. DEPLOYMENT:
   - Send Time Optimization: enable per journey
   - Subject Line: enable in editor
   - Engagement Scoring: enable in segments
   - Recommendations: configure in templates

4. MONITORING:
   - Performance tracking
   - Model accuracy
   - Refresh frequency

5. OPTIMIZATION:
   - Tune parameters
   - Adjust use cases
   - Retrain models
```

### 16.2 Einstein use cases

```
Einstein activated capabilities:

EINSTEIN SEND TIME OPTIMIZATION:
- Per-recipient best send time
- ML-based
- 10-25% open rate lift

EINSTEIN ENGAGEMENT SCORING:
- 0-100 score per recipient
- Likelihood to engage
- Used for segmentation

EINSTEIN SUBJECT LINE:
- AI-generated suggestions
- Performance predictions
- A/B test recommendations

EINSTEIN CONTENT SELECTION:
- Best content per recipient
- Personalization rules
- ML-driven decisioning

EINSTEIN COPY INSIGHTS:
- Tone analysis
- Readability
- Engagement prediction
```

### 16.3 Einstein vs. Agentforce

```
Einstein = embedded AI (existing 2017+)
Agentforce = autonomous AI agents (2024+, GA Oct 2025)
   ↓
Both work together
Agentforce = next evolution
```

---

## 17. Agentforce for Marketing Flow (NEW 2025!)

### 17.1 Agentforce deployment

```
Agentforce setup:

1. UPGRADE TO + EDITION:
   - Engagement → Engagement+
   - Account Engagement → Account Engagement+
   - Etc.

2. CONFIGURATION:
   - Define agent goals
   - Set boundaries
   - Approval workflows
   - Audit logging

3. AGENT CAPABILITIES:
   - Campaign creation
   - Content generation
   - Segment building
   - Journey design
   - Performance optimization

4. HUMAN-IN-LOOP:
   - Review + approval
   - Override capabilities
   - Manual adjustments
   - Audit trails
```

### 17.2 Agentforce workflow example

```
Real-world example:

USER REQUEST:
"Create a Black Friday campaign for our top 
 1000 VIP customers who haven't purchased
 in 60 days. Email + SMS combo with 25% off."

AGENTFORCE ACTIONS:
1. Analyzes VIP segment
2. Filters 60+ day inactive
3. Generates email content (3 variants)
4. Generates SMS content
5. Builds journey:
   - Day 0: Email (3 variants A/B)
   - Day 2: SMS reminder (non-openers)
   - Day 4: Email final reminder
6. Sets up tracking
7. Recommends send times
8. Drafts approval request

HUMAN REVIEW:
- Marketing reviews content
- Approves or edits
- Authorizes send

EXECUTION:
- Agentforce launches campaign
- Real-time monitoring
- Auto-optimization
- Reports back results
```

### 17.3 Per oficiální

> *"These agents aren't just helpers — they act like expert teammates who understand your goals and act on your behalf."*

### 17.4 Productivity impact

```
Pre-Agentforce campaign creation:
- Strategist: 4 hours
- Copywriter: 8 hours
- Designer: 6 hours
- Operations: 4 hours
- Approval: 2 hours
- Total: 24 hours typical

With Agentforce:
- AI: minutes
- Human review: 1-2 hours
- Total: 2-3 hours

Productivity lift: 8-12×
```

---

## 18. AMPscript Development Workflow

### 18.1 AMPscript usage

```
AMPscript = Salesforce proprietary lang:

PURPOSE:
- Personalization in emails
- Conditional logic
- Data Extension queries
- Loop content
- Mathematical operations

LOCATIONS:
- Email body
- Subject line
- Preheader
- Landing pages
- CloudPages

SYNTAX:
- %%[ ... ]%% blocks
- %%=v(@variable)=%% output
- %%=Concat()=%% functions
- Branching: IF/ELSEIF/ELSE

EXAMPLES:

Basic personalization:
%%[
  SET @name = [FirstName]
  IF EMPTY(@name) THEN
    SET @name = "valued customer"
  ENDIF
]%%
Dear %%=v(@name)=%%,

Data Extension lookup:
%%[
  SET @rows = LookupRows("LoyaltyData", "EmailAddress", emailaddr)
  IF RowCount(@rows) > 0 THEN
    SET @row = Row(@rows, 1)
    SET @tier = Field(@row, "Tier")
  ENDIF
]%%
Your tier: %%=v(@tier)=%%
```

### 18.2 Development workflow

```
AMPscript dev cycle:

1. REQUIREMENTS:
   - Identify personalization need
   - Define data sources
   - Define logic

2. DEVELOPMENT:
   - Write AMPscript
   - Test in sandbox
   - Debug syntax
   - Optimize performance

3. TESTING:
   - Render testing
   - Edge case testing
   - Data variability test
   - Performance test (large sends)

4. CODE REVIEW:
   - Peer review
   - Standards compliance
   - Error handling
   - Performance

5. DEPLOYMENT:
   - Promote to production
   - Monitor first sends
   - Validate output

6. MAINTENANCE:
   - Update for new requirements
   - Refactor as needed
   - Documentation
```

### 18.3 Skills required

```
AMPscript developer profile:
- Salesforce Marketing Cloud Developer cert
- HTML/CSS knowledge
- Programming logic basics
- Data Extension understanding
- API basics
- Source: rare specialty
- Cost: $80K-$150K/year typical (FTE)
- OR partner consultant: $150-$300/hour
```

### 18.4 Server-Side JavaScript (SSJS)

```
SSJS = alternative pro complex logic:

ADVANTAGES vs. AMPscript:
- Familiar JS syntax
- Better error handling
- HTTP calls support
- Try/catch
- Async patterns

USE CASES:
- Complex data manipulation
- API calls
- Error handling-heavy
- Loops + iterations

CONS:
- Performance can be slower
- Still SF-specific
```

---

## 19. Cross-Cloud Orchestration (Marketing + Sales + Service)

### 19.1 Cross-cloud flow

```
End-to-end customer lifecycle:

PROSPECT:
- Visits website (tracked by Marketing Cloud)
- Fills form → Lead in Salesforce
   ↓
MARKETING:
- Marketing Cloud welcome journey
- Nurture campaigns
- Score increases
- Reaches MQL threshold
   ↓
SALES:
- Lead handed to Salesforce Sales
- Sales rep notified
- Opportunity created
- Sales emails (1:1) via MC
   ↓
COMMERCE:
- Purchase via Commerce Cloud
- Order data → Data Cloud → MC
- Welcome new customer
   ↓
SERVICE:
- Customer issue
- Service Cloud case
- Auto-pause marketing
- Service resolution
- Satisfaction survey via MC
   ↓
MARKETING (retention):
- Customer journey continues
- Cross-sell campaigns
- Loyalty program
- Renewal automation
- Advocacy programs
   ↓
ALL UNIFIED in Data Cloud
ALL VISIBLE across teams
```

### 19.2 Per Research.com

> *"Integrated Salesforce Ecosystem: Tight connectivity with other Salesforce products, including Sales Cloud and Service Cloud, provides a unified view of the customer journey. This integration aligns marketing efforts with sales and service, enhancing cross-team collaboration."*

### 19.3 Connected Campaigns (B2B)

```
Connected Campaigns:
- Account Engagement campaign
- Synced to Salesforce Campaign
- Bidirectional updates
- ROI attribution
- Multi-touch reporting
- Sales visibility
```

---

## 20. Compliance + Privacy Management

### 20.1 GDPR compliance flow

```
GDPR-specific flow:

CONSENT CAPTURE:
- Forms with consent checkboxes
- Granular preferences
- Source documentation
- Timestamps

CONSENT STORAGE:
- Per-subscriber preferences
- Multiple consents tracked
- History maintained

DATA SUBJECT REQUESTS:
- Right to access (export)
- Right to be forgotten (deletion)
- Right to rectification (update)
- Right to data portability

CONSENT MANAGEMENT:
- Preference centers
- Subscription centers
- Easy unsubscribe
- Granular opt-outs

DATA RESIDENCY:
- EU data center option
- Cross-border restrictions
- Data sovereignty

AUDIT TRAILS:
- All actions logged
- Permanent records
- Compliance reports
```

### 20.2 HIPAA compliance (healthcare)

```
HIPAA-specific:
- BAA (Business Associate Agreement)
- HIPAA-compliant cloud
- PHI encryption
- Access controls strict
- Audit logging
- Healthcare-specific certifications
```

### 20.3 Subscription centers

```
Preference Center:
- Self-service preferences
- Multiple subscriptions
- Frequency preferences
- Channel preferences (email/SMS)
- Easy access (footer link)
- Personalized per subscriber
```

---

## 21. Multi-org + Multi-brand Management

### 21.1 Multi-brand setup

```
Multi-brand reality:

SINGLE INSTANCE, MULTIPLE BRANDS:
- One Marketing Cloud instance
- Multiple Business Units (BUs)
- Brand-specific:
  - Templates
  - Senders
  - Data Extensions
  - Users
  - Permissions

USE CASES:
- Multinational retailer (multiple brands)
- Conglomerate (different products)
- Franchise model
- Multi-location chains
```

### 21.2 Business Units (BUs)

```
Business Unit structure:

Parent BU:
├── Brand A BU
│   ├── Region 1
│   └── Region 2
├── Brand B BU
└── Brand C BU
   ├── Sub-brand C1
   └── Sub-brand C2

EACH BU:
- Separate users
- Separate Data Extensions
- Separate templates
- Separate sends
- Separate reporting
- Shared if desired
```

### 21.3 Per oficiální

```
Multi-org features:
- User Role Hierarchy
- Permission inheritance
- Cross-BU sharing (optional)
- Brand isolation
- Centralized governance
- Reporting roll-ups
```

---

## 22. AppExchange App Integration

### 22.1 AppExchange ecosystem

```
AppExchange = Salesforce marketplace:

CATEGORIES:
- Marketing tools
- Sales tools
- Service tools
- Analytics
- Integration apps
- Industry-specific

INSTALLATION:
- One-click install
- Marketplace browse
- Filter by:
  - Rating
  - Reviews
  - Industry
  - Use case
  - Price

POPULAR MARKETING APPS:
- Litmus (email testing)
- Email on Acid
- Validity (deliverability)
- ZoomInfo (data enrichment)
- LeanData (lead routing)
- Drift (chat → MC)
- Salesforce Labs apps (free)
```

### 22.2 Integration flow

```
App integration workflow:

1. Discover on AppExchange
2. Review:
   - Use case fit
   - Reviews
   - Pricing
   - Documentation
3. Install:
   - Sandbox first (recommended)
   - Permission grants
   - Configuration
4. Test:
   - Functionality
   - Performance
   - Security
5. Production deploy
6. Monitor + support
```

### 22.3 Per MagicFuse

> *"This can range from $25 per month to $46,000 per month, so it can have a real impact on overall cost."*

⚠️ **AppExchange costs add up** quickly.

---

## 23. Premier Support Flow

### 23.1 Support tiers

```
Salesforce support levels:

STANDARD (included):
- Self-service Help & Training
- Online case submission
- Business hours response
- Community support

PREMIER ($10K+/year):
- 24/7 support
- 1-hour critical response
- Dedicated CSM
- Strategy reviews
- Training credits
- Health checks

SIGNATURE (custom):
- Dedicated team
- Highest priority
- Strategic guidance
- Continuous engagement
- Designated contacts
```

### 23.2 Support workflow

```
Premier support flow:

1. Issue identification
2. Submit case via:
   - Help & Training portal
   - Phone (priority)
   - CSM contact
3. Severity classification:
   - Severity 1: Critical (1 hour response)
   - Severity 2: Major (2 hour)
   - Severity 3: Minor (4 hour)
   - Severity 4: Question (24 hour)
4. Engineer assigned
5. Investigation + resolution
6. Communication updates
7. Resolution + verification
8. Post-mortem (Sev 1)
```

### 23.3 Customer Success Manager (CSM)

```
CSM responsibilities (Premier+):

- Quarterly business reviews
- Roadmap discussions
- Best practices sharing
- Health check sessions
- Adoption monitoring
- Renewal planning
- Expansion discussions
   ↓
Strategic relationship
```

---

## 24. Datová mapa: co vidí kdo

| Data | System Admin | MC Admin | Marketing Manager | User | End subscriber | Salesforce CSM | Support | API |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| All settings | ✅ | view | ❌ | ❌ | ❌ | s consent | s consent | per scope |
| Billing | ✅ | view | ❌ | ❌ | ❌ | s consent | s consent | – |
| Users | ✅ | ✅ | view | ❌ | ❌ | s consent | s consent | per scope |
| Data Extensions | ✅ | ✅ | view | per role | own data | s consent | s consent | ✅ |
| Email Sends | ✅ | ✅ | ✅ | ✅ | own received | s consent | s consent | per scope |
| Journeys | ✅ | ✅ | ✅ | per role | ❌ | s consent | s consent | per scope |
| Templates | ✅ | ✅ | ✅ | per role | ❌ | s consent | s consent | per scope |
| Content Builder | ✅ | ✅ | ✅ | per role | ❌ | s consent | s consent | per scope |
| Mobile Studio | ✅ | ✅ | ✅ | per role | own received | s consent | s consent | per scope |
| Reports | ✅ | ✅ | ✅ | per role | ❌ | s consent | s consent | per scope |
| Einstein AI | ✅ | ✅ | view | view | ❌ | s consent | s consent | – |
| Agentforce | ✅ | ✅ | ✅ | per role | ❌ | s consent | s consent | per scope |
| Audit logs | ✅ | view | ❌ | ❌ | ❌ | s consent | s consent | – |
| Sandboxes | ✅ | ✅ | view | per role | ❌ | s consent | s consent | per scope |
| Data Cloud | ✅ | per role | view | per role | own data | s consent | s consent | per scope |
| Salesforce CRM sync | ✅ | ✅ | view | view | own data | s consent | s consent | per scope |
| AppExchange apps | ✅ | ✅ | view | view | ❌ | s consent | s consent | per scope |
| Subscription preferences | – | – | – | – | ✅ own | – | – | – |

---

## 25. Známé úzkoprofilové místa

### 25.1 Implementation time (3-12 měsíců)

```
Implementation reality:
- Small: 3-6 měsíců
- Medium: 6-9 měsíců
- Large: 9-12+ měsíců
   ↓
Time-to-value LONG
Vs. Klaviyo: weeks
Vs. Mailchimp: days
```

### 25.2 Implementation cost ($50K-$500K+)

```
Cost reality:
- Implementation partner: $50K-$500K
- Internal team: $50K-$200K
- Training/certs: $30K-$100K
- Custom templates: $10K-$50K
- Year 1 total: $130K-$800K+
- Plus subscriptions
```

### 25.3 Komplexita

Per Research.com:
> *"Complex and unintuitive user interface with a steep learning curve for beginners."*

```
Complexity drivers:
- Multiple disparate products
- AMPscript proprietary
- Data Extensions design
- Multi-cloud integration
- Workflow design
- Permission setup
   ↓
Not for beginners
Specialist skills required
```

### 25.4 AMPscript skills rare

```
AMPscript reality:
- Proprietary language
- Limited community
- Non-portable skills
- Hard to hire
- Expensive consultants
   ↓
Vendor lock-in via skills
```

### 25.5 Multiple products integration

```
Product family challenges:
- Engagement
- Account Engagement
- Personalization
- Intelligence
- Data Cloud
   ↓
Each acquired separately
Not seamless integration
Often custom work needed
Multiple admin interfaces
```

### 25.6 Enterprise pricing

```
Pricing entry barrier:
- Minimum $1,250/měsíc Engagement
- Plus implementation
- Plus add-ons
- Plus AppExchange
   ↓
Excludes SMB entirely
```

### 25.7 No public pricing

```
Pricing opacity:
- No published tiers
- Sales contact required
- Custom negotiations
- 3-6 měsíců sales cycle
   ↓
Friction for evaluation
```

### 25.8 Lock-in via ecosystem

```
Lock-in factors:
- AMPscript proprietary skills
- Data Extensions custom data model
- AppExchange dependencies
- Salesforce CRM integration
- Migration cost massive
   ↓
"Hotel California" pattern
```

### 25.9 Slow innovation (relative)

```
AI catch-up:
- Klaviyo agentic 2024
- Braze BrazeAI 2025
- Brevo AI-native

Salesforce:
- Agentforce launched late 2024
- Marketing Cloud Next Oct 2025
- Still rolling out features
   ↓
Catching up, not leading
```

### 25.10 Approval workflow overhead

```
Enterprise approval reality:
- Multiple stakeholders
- Legal review
- Brand compliance
- Manager approval
- Often 5+ approvers
   ↓
Slow campaign launch
Iteration slow
```

### 25.11 Limited modern UX

```
Interface modernity:
- Functional but enterprise-traditional
- Multiple sub-UIs
- Not as polished as modern tools
- Improvement ongoing but slow
   ↓
Vs. Klaviyo/MailerLite: less delightful
```

### 25.12 Sandboxes separate cost

```
Sandbox reality:
- Production = main env
- Sandboxes = separate
- Each sandbox costs extra
- $5K-$20K/year per sandbox
   ↓
DevOps + testing expensive
```

### 25.13 Compliance complexity

```
Multi-region compliance:
- GDPR (EU)
- CCPA (US)
- LGPD (Brazil)
- HIPAA (US healthcare)
- Each with own requirements
- Setup complexity high
- Mistakes = legal risk
```

### 25.14 Multi-region data residency

```
Data residency complexity:
- EU customers → EU data center
- US customers → US
- Cross-border restrictions
- Data localization laws
- Architecture decisions complex
```

### 25.15 Marketing Cloud Next still maturing

```
2025-2026 reality:
- GA Oct 2025
- Features rolling out
- "+" editions evolving
- Best practices forming
- Early adopter territory
   ↓
"Bleeding edge" for some clients
```

### 25.16 Not for DTC startups

```
DTC startup fit:
- Klaviyo: better for ecom DTC
- Mailchimp: better for SMB ecom
- Constant Contact: events
- Brevo: budget-friendly
   ↓
Marketing Cloud = overkill for startup DTC
```

### 25.17 Not for CZ/SK/PL/DACH SMB

```
SMB regional fit:
- CZ/SK: Leadhub, Ecomail, SmartEmailing
- DACH: CleverReach, Inxmail, rapidmail
- PL: SARE, ExpertSender, EmailLabs
- Marketing Cloud: enterprise only
   ↓
SMB regional = local tools better
```

### 25.18 Steep partner cost dependency

```
Partner dependency:
- DIY implementation rare
- Partner cost $50K-$500K
- Multi-year engagements
- Switching partners painful
   ↓
Long-term ongoing partner relationships
```

### 25.19 Trailhead time investment

```
Training investment:
- 100-500 hours per person
- Multiple certifications
- Annual maintenance
- Time off work
   ↓
Significant ramp-up time
```

### 25.20 Vendor consolidation pressure

```
Salesforce strategy:
- Consolidate ecosystem
- Push existing customers to Marketing Cloud
- Tight integration as moat
- Pricing tied to multi-product
   ↓
Strategic risk if Salesforce changes pricing
```

---

## 26. Doporučení pro design vlastních procesů

### Pro enterprise considering Marketing Cloud:

1. **Confirm fit první** – >100K kontaktů, enterprise B2C/B2B, budget OK
2. **Salesforce CRM první** – CRM-first approach makes MC easier
3. **Partner selection critical** – RFP 3-5 partners, references checked
4. **Phased implementation** – start small, expand
5. **Internal team investment** – 2-5 FTEs dedicated
6. **Certifications priority** – Trailhead for whole team
7. **Sandbox use** – test in non-prod first
8. **Data architecture first** – Data Extensions design critical
9. **Realistic timeline** – 6-12 měsíců Year 1
10. **Budget for hidden costs** – AppExchange, customizations, training

### Pro existing Salesforce customers:

1. **Engagement+ upgrade strategy** – evaluate Marketing Cloud Next
2. **Data Cloud integration** – unify customer data
3. **Agentforce adoption** – early adopter advantages
4. **Cross-cloud workflows** – Marketing + Sales + Service
5. **Trailhead training** – existing skills transferable
6. **Premier Support** – worth it for production critical
7. **Quarterly business reviews** – with CSM
8. **Innovation programs** – beta features early access

### Pro multi-brand enterprises:

1. **Business Unit (BU) design** – brand isolation
2. **Centralized governance** – brand standards
3. **Shared resources strategy** – templates, content
4. **Localization workflows** – per region
5. **Multi-language support** – CZ + PL included
6. **Compliance per region** – GDPR + others
7. **Reporting roll-ups** – executive view
8. **Permission models** – brand-specific access

### Pro Account Engagement (B2B):

1. **Sales alignment first** – joint Sales+Marketing
2. **Lead scoring strategy** – BANT or custom
3. **ABM approach** – target accounts identified
4. **Engagement Studio expertise** – journey design
5. **Sales notifications** – proper routing
6. **Connected Campaigns** – ROI attribution
7. **Account Engagement+ adoption** – AI features
8. **B2B Marketing Analytics** – advanced reporting

### Avoid Marketing Cloud if:

- SMB (<100K contacts)
- DTC startup
- No Salesforce CRM
- Limited budget (<$200K Year 1)
- No dedicated team
- Need self-service tool
- Want modern intuitive UX
- Quick setup (hours/days)
- AI-as-foundation (Brevo/Klaviyo better)
- CZ/SK/DACH/PL SMB market
- Newsletter/content creator business
- Mobile-first (Braze better)

---

*Dokument zpracován z oficiálních zdrojů salesforce.com (Marketing Cloud pricing, Engagement, Account Engagement, Personalization, Intelligence, Data Cloud, Marketing Cloud Next pages), G2 reviews (2026), Research.com Reviews (2026), Codleo blog (2026), MagicFuse, Twelverays, OMR Reviews. Pro nejaktuálnější detaily je nutný kontakt s Salesforce sales nebo Salesforce Certified Partner.*
