# Targito – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v Targito prochází data, lidé a akce – od sales konzultace přes 6-12týdenní onboarding s certifikovaným PM, CDP data integraci, drag & drop scenario builder, Targito AI generování obsahu, omnichannel orchestrace (email, SMS, web, social, offline), RFM segmentace, Contact Policy frequency capping, až po analytiku a partner ecosystem. Speciální focus na **Targito jako nejpoužívanější CDP v ČR** (per Sherpas Tech research, sample 313 e-shopů).

> Tento dokument doplňuje `51_Targito_Features_DeepDive.md` o **procesní pohled**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
> - **Targito = český CDP** (15+ let, Targito.com s.r.o., IČO 28445937)
> - **Sídlo:** Jungmannovo náměstí 753/18, Praha 1 – Nové Město
> - **Historie:** SPORT 3000 (2008) → VIVmail (2012) → VIVmail.cz (2016) → **Targito (2021)**
> - **Zakladatel:** Vladan Hejnic (od ~2012)
> - **CEO:** Jan Baštýř (od února 2024, předtím CTO)
> - **#1 nejpoužívanější CDP v ČR** (per Sherpas Tech, sample 313 e-shopů)
> - **40+ aktivovatelných modulů**
> - **Targito AI** – generování kompletních marketingových zpráv
> - **Hundreds of implementations** experience (oficiální claim)
> - **Custom pricing** (sales-driven, NOT public)
> - **Onboarding s certifikovaným PM** OR via partner agency
> - **Klíčoví zákazníci:** UniCredit, ZOOT (+400% CR), Bonami (+42% revenue), SG Furniture
> - **B2B + E-commerce** dual focus
> - **Czech support** + Czech skloňování native
> - **Modulární architektura** – aktivuj jen co potřebuješ
> - **Open ecosystem** – partner agency network

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Sales & qualification flow](#2-sales-flow)
3. [Consultation request flow](#3-consultation)
4. [Onboarding s certifikovaným PM](#4-onboarding-pm)
5. [Onboarding via partner agency](#5-onboarding-partner)
6. [Implementation timeline 6-12 týdnů](#6-implementation)
7. [CDP data integration flow](#7-cdp-integration)
8. [Identity resolution + 360° view](#8-identity-resolution)
9. [Email creation flow + drag & drop](#9-email-creation)
10. [Targito AI generation flow](#10-ai-generation)
11. [Web personalization deployment](#11-web-personalization)
12. [Automation scenario builder flow](#12-automation)
13. [RFM segmentation activation](#13-rfm)
14. [Contact Policy setup (frequency cap)](#14-contact-policy)
15. [Omnichannel orchestrace](#15-omnichannel)
16. [SMS campaign flow](#16-sms)
17. [Module activation flow (40+ modulů)](#17-modules)
18. [E-commerce integration flow](#18-ecommerce-integration)
19. [B2B use case (UniCredit pattern)](#19-b2b)
20. [Analytics & reporting flow](#20-analytics)
21. [Partner agency collaboration](#21-partner-collab)
22. [Customer support workflow](#22-support)
23. [Datová mapa: co vidí kdo](#23-data-map)
24. [Známé úzkoprofilové místa](#24-bottlenecks)

---

## 1. Mapa všech aktérů

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│         TARGITO PLATFORM ECOSYSTEM                                   │
│         Targito.com s.r.o. · IČO 28445937                            │
│         Jungmannovo náměstí 753/18, Praha 1                          │
│         Založeno 2008, brand od 2021                                 │
│         "Nejpoužívanější CDP v ČR" (Sherpas Tech)                    │
│         Phone: 775 602 ...                                           │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [Targito tým]                                                       │
│   ├─ CEO: Jan Baštýř (od února 2024)                                 │
│   ├─ Zakladatel: Vladan Hejnic (mentor role)                         │
│   ├─ Předchozí CEO: Martin Štěpaník (2020-2023)                      │
│   ├─ Project Managers (PM) – onboarding leads                        │
│   ├─ Customer Success team                                           │
│   ├─ Technical Support team                                          │
│   ├─ Engineering team                                                │
│   ├─ Product team                                                    │
│   ├─ AI/ML team (Targito AI)                                         │
│   ├─ Sales team (consultation-driven)                                │
│   └─ Partner Manager (agency relations)                              │
│           │                                                          │
│           ▼                                                          │
│                                                                      │
│   ┌────────────────────────────────────────────┐                     │
│   │   Targito uživatelský účet                 │                     │
│   │                                            │                     │
│   │   PLATFORM CAPABILITIES:                   │                     │
│   │   ├─ CDP (Customer Data Platform)          │                     │
│   │   ├─ Targito AI (content generation)       │                     │
│   │   ├─ Web Personalization                   │                     │
│   │   ├─ Email Marketing                       │                     │
│   │   ├─ SMS Marketing                         │                     │
│   │   ├─ Social Integration                    │                     │
│   │   ├─ Offline Integration                   │                     │
│   │   ├─ Drag & Drop Scenario Builder          │                     │
│   │   ├─ RFM Segmentation                      │                     │
│   │   ├─ Contact Policy (frequency cap)        │                     │
│   │   ├─ Analytics & Reporting                 │                     │
│   │   ├─ 40+ Activatable Modules               │                     │
│   │   └─ Language Mutations (CZ/SK/PL/EN)      │                     │
│   │                                            │                     │
│   │   USER ROLES (typical):                    │                     │
│   │   ├─ Admin (full access)                   │                     │
│   │   ├─ Marketing Manager                     │                     │
│   │   ├─ Email Specialist                      │                     │
│   │   ├─ Data Analyst                          │                     │
│   │   └─ Read-only viewer                      │                     │
│   └──────────────┬─────────────────────────────┘                     │
│                  │                                                   │
│                  ▼                                                   │
│   [Marketing channels]                                               │
│       │                                                              │
│       ├─→ Email (primary)                                            │
│       ├─→ SMS                                                        │
│       ├─→ Web personalization                                        │
│       ├─→ Social media integration                                   │
│       └─→ Offline (POS, in-store)                                    │
│                  │                                                   │
│                  ▼                                                   │
│   [Customers / End audience]                                         │
│       │                                                              │
│       ├─→ E-commerce customers (B2C)                                 │
│       ├─→ B2B customers                                              │
│       ├─→ Subscribers                                                │
│       └─→ Web visitors (personalized)                                │
│                                                                      │
│   [Partner ecosystem]                                                │
│   ┌────────────────────────────────────────────┐                     │
│   │   CERTIFIED PARTNER AGENCIES                │                    │
│   │   - Implementation partners                 │                    │
│   │   - Strategic consultants                   │                    │
│   │   - Creative agencies                       │                    │
│   │   - Performance marketing                   │                    │
│   │                                             │                    │
│   │   TECHNOLOGY PARTNERS                       │                    │
│   │   - E-shop platforms (Shoptet, Magento)     │                    │
│   │   - CRM providers                           │                    │
│   │   - Analytics tools                         │                    │
│   │   - SMS providers                           │                    │
│   │                                             │                    │
│   │   STRATEGIC PARTNERS                        │                    │
│   │   - Industry experts                        │                    │
│   │   - Vertical specialists                    │                    │
│   └────────────────────────────────────────────┘                     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér | Vstupní bod | Co dělá | Co vidí |
|---|---|---|---|
| **Account owner** | Login | Vše, billing, users | Vše |
| **Marketing manager** | Login | Strategie, campaigns | Per role |
| **Email specialist** | Login | Email design, send | Per role |
| **Data analyst** | Login | Reports, analytics | Read + analytics |
| **End customer** | Email/SMS/web | Engage | Vlastní data |
| **Targito PM (onboarding)** | Direct | Implementation help | s consent |
| **Targito CS team** | Phone / email | Issue resolution | s consent |
| **Targito support** | Phone / chat / email | Technical issues | s consent |
| **Targito sales** | Consultation request | Quote + qualify | Initial info |
| **Partner agency** | OAuth / login | Client work | Per scope |
| **Integration partner** | API | Data sync | Per scope |
| **E-shop platform** | API | Order/customer sync | E-shop data |

---

## 2. Sales & qualification flow

### 2.1 Lead acquisition

```
Targito lead sources:
- targito.com direct inbound
- Czech SEO ("CDP ČR", "email marketing", "marketing automation")
- Partner agency referrals
- Word-of-mouth (mature CZ market)
- Past case studies (ZOOT, Bonami)
- Industry conferences (Marketing Festival, etc.)
- Sherpas Tech research mentions
- LinkedIn presence
- Targito blog content
- Komunita Targito (LinkedIn community)
```

### 2.2 Qualification criteria

```
Targito fits pokud:

✅ Mid-market český/slovenský business
✅ 5 000 - 500 000+ kontaktů
✅ E-commerce nebo B2B
✅ Data-driven marketing focus
✅ In-house marketing team
✅ Multi-channel komunikace need
✅ CDP requirement (ne jen email)
✅ Budget pro custom pricing
✅ 6-12 týdnů implementation OK
✅ Long-term vendor commitment OK

❌ Malý e-shop < 1 000 kontaktů
❌ Startup s rapid launch need
❌ Self-service preferred
❌ Free plan need
❌ International primary (US/UK/APAC)
❌ Salesforce ecosystem-only
❌ DTC Shopify-only (Klaviyo lepší)
❌ Mobile-app-first (Braze lepší)
```

### 2.3 Per oficiální positioning

> *"I am interested in a consultation"* (key CTA on website)

⚠️ **Consultation-first** = no self-service signup.

### 2.4 Qualification process

```
Targito qualification:

INITIAL CONSULTATION:
- Discovery call (30-60 min)
- Business goals
- Current marketing stack
- Pain points
- Budget range
- Timeline expectations

DEMO (qualified leads):
- Custom demo
- Use case focus
- Industry-specific scenarios
- Real platform walk-through
- Q&A

PROPOSAL:
- Custom quote based on:
  - Velikost databáze
  - Aktivované moduly
  - Channels
  - Implementation scope
  - Support tier
- Implementation plan
- Timeline + milestones

DECISION:
- Internal procurement
- Stakeholder buy-in
- Contract negotiation
- Annual or longer commitment
```

### 2.5 Sales cycle length

```
Typical Targito sales cycle:
- Discovery: 1-2 weeks
- Demo: 1 week
- Proposal: 1-2 weeks
- Decision: 2-8 weeks
- Total: 4-12+ weeks
   ↓
Mid-market deal cycle
```

### 2.6 Per Sherpas Tech endorsement

```
Sherpas research impact:
- Sample of 313 Czech e-shops
- Targito = most-used CDP claim
- Independent study (credibility)
- Marketing for Targito
- Validation pro prospects
- Reduces buyer risk
```

---

## 3. Consultation request flow

### 3.1 Web flow

```
targito.com consultation request:

1. Visit targito.com
2. Read platform pages:
   - CDP
   - AI
   - Web personalization
   - Omnichannel
   - Automation & Scenarios
   - Analytics & reporting
3. Read solutions:
   - E-commerce
   - B2B
4. Read case studies (ZOOT, Bonami, etc.)
5. Click "I am interested in a consultation"
6. Form submission:
   - Name + company
   - Email + phone
   - Company size
   - Industry
   - Current tools
   - Pain points
   - Timeline
7. Submit
8. Sales contact within ~24-48 hours
9. Discovery call scheduled
```

### 3.2 Per oficiální site experience

```
Site experience:
- Czech + English versions
- Mobile responsive
- Clean, modern design
- Case study prominence
- Customer logos visible
- Sherpas Tech endorsement
- Consultation CTA primary
- No self-service signup
- Blog content
```

### 3.3 Initial response

```
Targito sales response:
- 24-48 hour reply typically
- Discovery call scheduled
- Brief qualification pre-call
- Custom demo preparation
- Industry-specific examples ready
```

---

## 4. Onboarding s certifikovaným PM

### 4.1 Per oficiální

> *"If you are not working with a certified agency, our experienced project manager will guide you through the onboarding process. They will be available to you from day one, helping with implementation and ensuring that all steps go smoothly and according to plan. We have completed hundreds of implementations and know how to solve many of the pitfalls."*

### 4.2 PM-led onboarding flow

```
Targito PM onboarding (direct):

WEEK 1: DISCOVERY + KICKOFF
- Project kickoff meeting
- Goals + KPIs alignment
- Stakeholder identification
- Tech stack review
- Data sources inventory
- Success criteria definition
- Communication plan

WEEK 2-3: ARCHITECTURE
- Integration design
- Data model definition
- Account structure
- User roles + permissions
- Module activation roadmap
- Pilot scope agreement

WEEK 3-6: SETUP + INTEGRATION
- Account configuration
- E-shop integration
- CRM integration (if exists)
- Web tracking deployment
- SMS provider setup
- Data sync setup
- Initial template library

WEEK 6-8: CONTENT + AUTOMATION
- Email templates
- Drag & drop automation builds
- First scenarios (welcome, cart, etc.)
- Targito AI training
- Segmentation strategy
- Contact Policy setup

WEEK 8-9: TESTING + QA
- Data validation
- Send tests
- Workflow QA
- Personalization tests
- Performance verification
- Inbox testing

WEEK 9-10: TRAINING
- Admin training (2-4 hours)
- Marketer training (4-8 hours)
- Best practices session
- Documentation walkthrough
- Q&A sessions

WEEK 10-12: LAUNCH + HYPERCARE
- Soft launch (limited scope)
- Performance monitoring
- Initial optimizations
- Full deployment
- Hypercare period (2 weeks)
- Transition to support
```

### 4.3 PM responsibilities

```
Targito PM duties:
- Single point of contact
- Project planning + tracking
- Stakeholder management
- Risk identification
- Issue resolution
- Knowledge transfer
- Training coordination
- Quality assurance
- Launch readiness
- Post-launch support
```

### 4.4 "Pitfalls avoidance"

Per oficiální:
> *"We have completed hundreds of implementations and know how to solve many of the pitfalls."*

```
Common pitfalls Targito PM handles:
- Data quality issues
- Integration complexity
- User permissions confusion
- Email deliverability setup
- Scenario logic errors
- Performance bottlenecks
- Training gaps
- Change management resistance
- Stakeholder alignment issues
- Success metrics confusion
```

### 4.5 Hypercare period

```
Hypercare (first 2 weeks post-launch):
- Daily check-ins
- Issue rapid response
- Performance monitoring
- Optimization recommendations
- User support enhanced
- Configuration adjustments
   ↓
Smooth transition to BAU operations
```

---

## 5. Onboarding via partner agency

### 5.1 Per oficiální

> *"At Targito, we build long-term partnerships that extend the value of our platform. As a technology platform, we don't want to be a black box. On the contrary, we open up space for cooperation with various suppliers and agencies."*

### 5.2 Partner agency model

```
Partner agency onboarding:

CUSTOMER ENGAGES AGENCY:
- Agency = primary contact
- Agency manages relationship
- Targito = behind-the-scenes
- Agency handles strategy
- Targito provides platform

AGENCY VALUE-ADD:
- Strategic consultation
- Creative production
- Performance marketing
- Industry expertise
- Ongoing optimization
- Reporting + insights

TARGITO SUPPORT:
- Platform training (agency staff)
- Technical support
- Account management
- Strategic input (if requested)
- Documentation
```

### 5.3 Partner certification

```
Certified partner status:
- Training completed
- Implementation experience
- Successful customer projects
- Ongoing support capability
- Marked as "certified"
   ↓
Customer confidence + Targito quality control
```

### 5.4 Agency typesa

```
Typical Targito partner agencies:

E-COMMERCE SPECIALIZED:
- Czech digital agencies
- Focus on Shoptet, Magento
- E-commerce expertise

PERFORMANCE MARKETING:
- ROI-focused
- Paid + organic combined
- Data-driven

CREATIVE AGENCIES:
- Brand-focused
- Visual identity
- Campaign creative

STRATEGIC CONSULTING:
- Marketing transformation
- CDP strategy
- Long-term partners
```

### 5.5 Customer value of partner approach

```
Why use partner:
- Faster ramp-up (agency knows platform)
- Strategic guidance built-in
- Ongoing optimization
- Creative production
- Less in-house investment needed
- Industry expertise
- Best practices applied
   ↓
Higher ROI on Targito investment
```

---

## 6. Implementation timeline 6-12 týdnů

### 6.1 Standard timeline

```
6-12 weeks typical Targito implementation:

WEEKS 1-2: PLANNING (10-20% effort)
- Discovery
- Architecture
- Project kickoff

WEEKS 2-6: BUILD (40-50% effort)
- Configuration
- Integrations
- Data migration
- Initial setup

WEEKS 6-9: CONTENT + AUTOMATION (20-30% effort)
- Templates
- Workflows
- Segments
- Personalization

WEEKS 9-11: TESTING + TRAINING (10-15% effort)
- QA
- User training
- Documentation

WEEKS 11-12: LAUNCH (5-10% effort)
- Soft launch
- Full deployment
- Hypercare start
```

### 6.2 Faktory ovlivňující timeline

```
Faster (closer to 6 weeks):
- Simple e-shop integration
- Clean data
- Limited integrations
- In-house tech team
- Clear requirements
- Few modules
- Single channel start

Slower (closer to 12+ weeks):
- Complex multi-system integrations
- Dirty data (cleanup needed)
- Multiple legacy systems
- Strict compliance requirements
- Multi-brand setup
- Many active modules
- Custom development
```

### 6.3 Critical path items

```
Critical path:
1. Data sources identification + access
2. E-shop platform integration
3. Customer data import + cleansing
4. Identity resolution validation
5. First email send (DNS/auth setup)
6. First automation activation
7. Web tracking deployment
8. Reporting validation
```

### 6.4 Risk factors

```
Implementation risks:

DATA RISKS:
- Source data quality
- Privacy compliance (GDPR)
- Consent management
- Identity matching accuracy

TECH RISKS:
- Legacy system integration
- API rate limits
- Performance at scale
- Security requirements

ORGANIZATIONAL RISKS:
- Stakeholder availability
- Change management
- Training time
- Resource allocation

VENDOR RISKS:
- Coordination with multiple partners
- Communication overhead
- Expectations alignment
```

---

## 7. CDP data integration flow

### 7.1 Data sources

```
Targito CDP integrations:

E-SHOP PLATFORMS:
- Shoptet
- Magento
- WooCommerce
- Custom solutions

CRM SYSTEMS:
- Salesforce
- HubSpot
- Pipedrive
- Custom CRMs

ANALYTICS:
- Google Analytics
- Custom analytics
- Heatmap tools

OFFLINE:
- POS systems
- ERP systems
- Custom imports

ADVERTISING:
- Google Ads
- Meta Ads
- LinkedIn Ads
```

### 7.2 Integration methods

```
Integration approaches:

NATIVE INTEGRATIONS:
- Pre-built connectors
- Plug-and-play
- Maintained by Targito
- Faster deployment

API INTEGRATIONS:
- REST API
- Webhooks
- Real-time data flow
- Custom development

BATCH IMPORTS:
- CSV uploads
- Scheduled jobs
- Bulk data sync
- Historical loads

WEB TRACKING:
- JavaScript pixel
- Event tracking
- Page views
- Conversion tracking
```

### 7.3 Data sync flow

```
Typical data sync:

REAL-TIME (immediate):
- Web events
- Cart events
- Newsletter signups
- Form submissions

NEAR REAL-TIME (1-15 min):
- Order data
- Profile updates
- CRM changes
- Engagement events

HOURLY:
- Aggregated metrics
- Computed fields
- Score updates
- Segment refreshes

DAILY:
- Bulk reports
- Historical analyses
- Large data sets
- Reconciliation
```

### 7.4 Data hygiene

```
Data quality processes:

VALIDATION:
- Email format check
- Required fields verification
- Duplicate detection
- Bot filtering

CLEANSING:
- Normalization (case, format)
- Standardization (addresses)
- Enrichment (when applicable)
- Suppression handling

GOVERNANCE:
- GDPR compliance
- Consent tracking
- Data retention policies
- Access controls
- Audit logs
```

---

## 8. Identity resolution + 360° view

### 8.1 Per oficiální

> *"Targito CDP unifies data from all sources – website, e-shop, CRM, e-mails and another channels – into a single 360° view of the customer. All information is linked into a single profile that is always up to date and complete."*

### 8.2 Identity resolution

```
Identity matching:

DETERMINISTIC MATCHING:
- Email address match
- Phone number match
- Customer ID match
- Account login match
- 100% confidence

PROBABILISTIC MATCHING:
- Behavior pattern matching
- Device fingerprinting
- Location patterns
- ML-based scoring
- Confidence-graded

HIERARCHY:
1. Try deterministic first
2. Fall back to probabilistic
3. Confidence threshold
4. Manual review (high-value)
5. Continuous improvement
```

### 8.3 Profile data structure

```
360° customer profile contains:

IDENTITY:
- Email, phone, IDs
- Personal data (name, etc.)
- Geographic
- Demographic

PREFERENCES:
- Communication channels
- Frequency preferences
- Content interests
- Languages

BEHAVIORAL:
- Web visits
- Product views
- Cart events
- Search history
- Engagement patterns

TRANSACTIONAL:
- Order history
- Spending patterns
- Product preferences
- AOV, LTV calculations

ENGAGEMENT:
- Email opens, clicks
- SMS responses
- Web interactions
- Social engagement
- Support tickets

PREDICTIVE:
- LTV prediction
- Churn risk
- Product affinity
- Next purchase likelihood
- Engagement score

CONSENT:
- Email opt-in status
- SMS consent
- Profiling consent
- Cookies consent
- Audit trail
```

### 8.4 Real-time updates

```
Profile updates lifecycle:

EVENT CAPTURE:
- Customer visits website
- Adds product to cart
- Browses category

DATA INGESTION:
- Event captured by Targito
- Processed in real-time
- Identity matched

PROFILE UPDATE:
- Profile enriched
- Behavior recorded
- Segments re-evaluated
- Predictions updated

ACTIVATION:
- Triggers fired (if applicable)
- Personalization applied
- Channels notified
- Real-time response possible
```

---

## 9. Email creation flow + drag & drop

### 9.1 Email creation flow

```
Email creation in Targito:

1. New email campaign
2. Audience selection:
   - Existing segment
   - New segment created
   - All subscribers
   - Specific list
3. Template selection:
   - From library
   - Custom build
   - Previous campaign clone
4. Content building:
   - Drag-drop blocks
   - Text blocks
   - Image blocks
   - Product blocks (e-commerce)
   - CTA buttons
   - Dynamic content
   - Conditional blocks
5. Personalization:
   - Custom fields
   - Skloňování (CZ!)
   - Dynamic pricing
   - Product recommendations
   - Per-recipient content
6. AI assistance (optional):
   - Targito AI generation
   - Subject line suggestions
   - Content suggestions
7. Preview + test:
   - Desktop view
   - Mobile view
   - Inbox preview
   - Spam testing
8. Schedule + send:
   - Immediate
   - Scheduled time
   - Send time optimization
9. Tracking activated:
   - Open tracking
   - Click tracking
   - Conversion tracking
```

### 9.2 Per oficiální capability

> *"You create templates using drag & drop editor that supports all the features you would expect from a modern tool: simple yet powerful template system, block replacement, conditional display and dynamic connection to external data sources."*

### 9.3 Advanced features

```
Email advanced features:

CONDITIONAL DISPLAY:
- Show block IF condition met
- Hide block IF condition met
- Multiple conditions (AND/OR)
- Real-time evaluation

DYNAMIC CONTENT:
- Per-recipient blocks
- Product recommendations
- Personalized pricing
- Behavioral content

EXTERNAL DATA:
- API-fed content
- Real-time inventory
- Live pricing
- Weather (smart campaigns)
- Time-based content

A/B TESTING:
- Subject line
- Sender name
- Content variations
- Send time
- Multi-variant testing
```

### 9.4 Czech-specific features

```
Czech features:

SKLOŇOVÁNÍ:
- Vocative case (oslovení)
- Per-name correct grammar
- "Vážený pane Nováku"
- Female form auto
- Multiple name parts

LANGUAGE MUTATIONS:
- Multiple language versions
- Auto-assign by profile
- Translation management
- Consistent design

LOCAL HOLIDAYS:
- Czech-specific dates
- Slovak coordination
- Holiday-aware campaigns
```

---

## 10. Targito AI generation flow

### 10.1 Per oficiální

> *"A pokud je třeba ulehčit s tvorbou obsahu, je tu naše Targito AI – na základě vašich zadání a dat připravíme kompletní marketingovou zprávu, od vzhledu po vybrané produkty, při dodržení všech byznysových pravidel."*

### 10.2 AI generation workflow

```
Targito AI flow:

1. New email/campaign creation
2. Click "Targito AI generate"
3. Input parameters:
   - Campaign goal
   - Target segment
   - Product focus (if any)
   - Tone/style
   - Length preference
   - Business rules (apply)
4. AI generates:
   - Visual design
   - Subject line
   - Body copy
   - Selected products (e-commerce)
   - CTA recommendations
5. Marketer reviews
6. Edit / refine
7. Approve / send
   ↓
Hours of work → minutes
```

### 10.3 Business rules respect

```
AI business rules:
- Brand voice maintained
- Compliance rules respected
- Inventory awareness
- Pricing rules
- Discount limitations
- Customer tier rules
- Frequency limits
- Channel preferences
   ↓
Trustworthy AI output
```

### 10.4 Use cases

```
Targito AI applications:

DAILY:
- Newsletter content
- Promotional emails
- Segment-specific communications
- Welcome series adaptations

PERSONALIZED:
- Per-recipient unique emails
- Dynamic product recommendations
- Behavioral triggers
- Personalized offers

A/B VARIATIONS:
- Multiple subject lines
- Body copy variants
- CTA variations
- Quick iteration

MULTI-LANGUAGE:
- CZ original
- SK adaptation
- PL adaptation
- EN translation
```

### 10.5 Per oficiální positioning

> *"AI – Artificial intelligence that makes money - not just advice."*

⚠️ **AI focus na revenue impact**, ne pouze insights.

---

## 11. Web personalization deployment

### 11.1 Setup flow

```
Web personalization deployment:

1. Tracking pixel installation:
   - JavaScript snippet
   - Placed on all pages
   - Anonymous + identified tracking
2. Personalization zones:
   - Define areas on website
   - Hero banner
   - Product recommendations
   - Sidebar
   - Pop-ups (modal)
   - Sticky elements
3. Rules engine:
   - Audience definition
   - Trigger conditions
   - Content variations
   - Schedule
4. A/B testing:
   - Multiple variants
   - Performance comparison
   - Auto-winner selection
5. Performance tracking:
   - Engagement
   - Conversion
   - Revenue attribution
```

### 11.2 Real-time decision flow

```
Real-time personalization:

VISITOR ARRIVES:
- Tracking pixel fires
- Anonymous OR identified
- Profile lookup (if known)

DECISION ENGINE:
- Evaluate audience membership
- Check active rules
- Determine best variant
- Within < 100ms

CONTENT DELIVERY:
- Right content displayed
- Without page flicker
- SEO-friendly
- Mobile-responsive

ENGAGEMENT TRACKING:
- Clicks, views
- Time on page
- Conversion events
- Funnel progression

CDP UPDATE:
- Behavior recorded
- Profile enriched
- Predictions updated
- Segments updated
```

### 11.3 Use case examples

```
Web personalization scenarios:

NEW VISITOR:
- Generic homepage
- Welcome popup (after time on site)
- Lead capture form

RETURNING ANONYMOUS:
- Recently viewed products
- Browse-based recommendations
- Last category visited

IDENTIFIED CUSTOMER (logged in):
- "Welcome back, Pavel!"
- Recommended for you
- Last order related items
- Loyalty status visible

HIGH-VALUE CUSTOMER:
- VIP messaging
- Exclusive offers
- Priority service options

AT-RISK CUSTOMER:
- Re-engagement messaging
- Win-back offers
- Personalized urgency
```

---

## 12. Automation scenario builder flow

### 12.1 Per oficiální

> *"Automation is created in a simple drag & drop editor, where you can build the logic of individual steps, conditions, and branching without programming."*

### 12.2 Scenario builder workflow

```
Building automation in Targito:

1. New scenario
2. Set trigger:
   - Event-based (cart abandonment)
   - Schedule-based (birthday)
   - Behavioral (browse threshold)
   - API call (external system)
3. Define entry criteria
4. Build flow with drag-drop:
   - Add wait step (delay)
   - Add email send
   - Add SMS send
   - Add condition (if/else)
   - Add branch (multi-path)
   - Add update profile
   - Add tag
   - Add webhook
5. Configure each step:
   - Content selection
   - Wait duration
   - Condition logic
   - Personalization
6. Set exit conditions:
   - Goal achievement
   - Time limit
   - Manual exit
7. Set re-entry rules
8. Test scenario
9. Activate
```

### 12.3 Scenario complexity examples

```
Welcome series scenario:

T+0: Trigger: new subscriber
  ↓
T+0: Email 1: Welcome + brand intro
  ↓ Wait 3 days
T+3: Decision: opened welcome?
  ├─ YES: Email 2: Detailed product tour
  └─ NO: Email 2 alt: Re-send welcome (different subject)
  ↓ Wait 4 days
T+7: Email 3: First offer (discount code)
  ↓ Wait 7 days
T+14: Decision: converted?
  ├─ YES: Add to "buyer" segment, exit
  └─ NO: Email 4: Last chance + urgency
  ↓ Wait 7 days
T+21: Exit: standard newsletter cadence
```

```
Abandoned cart scenario:

T+0: Trigger: cart abandoned
  ↓
T+1 hour: Email: "Forgot something?"
  ↓ Decision: completed checkout?
  ├─ YES: Exit (purchase achieved)
  └─ NO: Continue
  ↓ Wait 23 hours
T+1 day: Email: "Still interested?"
  ↓ Decision: completed?
  ├─ YES: Exit
  └─ NO: Continue
  ↓ Wait 48 hours
T+3 days: Email: "Last chance: 10% off"
  ↓ Decision: completed?
  ├─ YES: Exit
  └─ NO: Continue
  ↓ Wait 24 hours
T+4 days: SMS reminder (if SMS subscribed)
  ↓ Exit after this
```

### 12.4 Maintenance benefits

Per oficiální:
> *"This keeps your work clear and easy to maintain."*

```
Maintenance advantages:
- Visual flow representation
- Easy to understand
- Quick modifications
- Clone and adapt
- Performance per step visible
- Logical structure
```

---

## 13. RFM segmentation activation

### 13.1 Per oficiální (Moduly)

> *"Working with purchasing behavior thanks to RFM segmentation"*

### 13.2 RFM module activation

```
RFM module setup:

1. Activate RFM module
2. Configure parameters:
   - Recency window (typical: 365 days)
   - Frequency threshold
   - Monetary cutoffs
3. Score calculation:
   - Recency (1-5 score)
   - Frequency (1-5 score)
   - Monetary (1-5 score)
4. Combined RFM score
5. Auto-segment assignment:
   - Champions (555, 554, 545, 454, 455, 444)
   - Loyal Customers (543, 444, 435, 355, 354, 345, 344, 335)
   - Potential Loyalist (553, 551, 552, 541, 542, 533, 532, 531, 452, 451, 442, 441, 431, 453, 433, 432, 423, 353, 352, 351)
   - New Customers (512, 511, 422, 421, 412, 411, 311)
   - Promising (525, 524, 523, 522, 521, 515, 514, 513, 425, 424, 413, 414, 415, 315, 314, 313)
   - Need Attention (535, 534, 443, 434, 343, 334, 325, 324)
   - About to Sleep (331, 321, 312, 221, 213, 231, 241, 251)
   - At Risk (255, 254, 245, 244, 253, 252, 243, 242, 235, 234, 225, 224, 153, 152, 145, 143, 142, 135, 134, 133, 125, 124)
   - Cannot Lose Them (155, 154, 144, 214, 215, 115, 114, 113)
   - Hibernating (332, 322, 233, 232, 223, 222, 132, 123, 122, 212, 211)
   - Lost (111, 112, 121, 131, 141, 151)
6. Real-time updates
7. Use in campaigns
```

### 13.3 RFM-driven campaigns

```
Per RFM segment campaigns:

CHAMPIONS:
- VIP recognition
- Exclusive previews
- Loyalty rewards
- Refer-a-friend
- Premium tier upgrades

LOYAL CUSTOMERS:
- Cross-sell opportunities
- Up-sell to premium
- Loyalty milestone celebrations
- Beta access

POTENTIAL LOYALIST:
- Engagement boosters
- Personal offers
- Tutorials + tips
- Activation campaigns

NEW CUSTOMERS:
- Welcome series
- Onboarding content
- First-purchase follow-up
- Second-purchase incentive

AT RISK:
- Win-back campaigns
- Discount offers
- "We miss you" messaging
- Personalized incentives

LOST:
- Final attempt
- Major discount (last resort)
- Or suppress (avoid waste)
```

### 13.4 Real-time RFM updates

```
RFM evolution tracking:

Customer moves segments:
- New purchase → Recency improves
- High frequency → Frequency improves
- Big spend → Monetary improves
- No activity → All decline

Targito tracks segment shifts:
- Auto-triggers possible
- "Promotion" to higher segment celebration
- "Demotion" alerts marketers
- Reactivation triggers
- Suppression rules
```

⚠️ **RFM = mature feature** = nutné pro e-commerce maturity.

---

## 14. Contact Policy setup (frequency cap)

### 14.1 Per oficiální

> *"Monitor communication frequency using contact policy"*

### 14.2 Contact Policy setup

```
Contact Policy configuration:

1. Activate Contact Policy module
2. Define cap rules:

GLOBAL CAPS:
- Max X emails per týden
- Max Y SMS per měsíc
- Max Z total touches per den
- Quiet hours (no sends 22:00-08:00)
- Weekend rules

PER-CHANNEL CAPS:
- Email: 3 per týden
- SMS: 4 per měsíc
- Web personalizace: unlimited
- Social: 2 per týden

PER-SEGMENT OVERRIDES:
- VIP: more touches allowed
- New customer: standard
- At-risk: increased frequency
- Cancelled: minimal

PER-PURPOSE EXEMPTIONS:
- Transactional emails: exempt
- Order confirmations: always
- Service updates: always
- Marketing: capped

PRIORITY RULES:
- High-priority overrides
- Welcome series priority
- Order-related priority
- Marketing lower priority
```

### 14.3 Cap enforcement flow

```
When campaign would exceed cap:

1. Send attempt
2. Check Contact Policy:
   - Total touches this period?
   - Per-channel limit reached?
   - Quiet hours?
   - Customer-specific overrides?
3. Decision:
   ├─ Within limits: Send
   ├─ Above cap: Suppress
   ├─ Quiet hours: Queue for later
   └─ Override: Send anyway
4. Log decision (audit trail)
5. Update touch count
```

### 14.4 Use case examples

```
Contact Policy scenarios:

CYBER MONDAY WEEK:
- Multiple campaigns planned
- Cap of 1 email per day
- Customers don't get 5+ emails/day
- Better engagement maintained

CUSTOMER JUST PURCHASED:
- Order confirmation (transactional, exempt)
- Shipping update (transactional, exempt)
- Cross-sell email (marketing, capped)
- Review request (marketing, capped)
- Cap protects customer

WIN-BACK CAMPAIGN:
- Increased touches allowed
- Multiple channels (email + SMS)
- Within reasonable urgency limits
- Don't push away further

HIGH-VALUE CUSTOMER:
- Custom cap (more touches OK)
- VIP communication
- Within respect limits
```

### 14.5 Customer satisfaction impact

```
Contact Policy benefits:
- Lower unsubscribe rates
- Higher engagement long-term
- Better deliverability
- Brand respect
- Customer satisfaction
- Compliance protection
- ROI optimization
```

⚠️ **Contact Policy = sophisticated feature** = enterprise-grade.

---

## 15. Omnichannel orchestrace

### 15.1 Per oficiální

> *"One data, one story - consistent across channels."*

### 15.2 Cross-channel coordination

```
Omnichannel orchestration flow:

CUSTOMER STATE:
- Email engagement
- SMS engagement
- Web behavior
- Social interaction
- Past purchases
- Support interactions

UNIFIED PROFILE (Targito CDP):
- All data combined
- Single source of truth
- Real-time updates

ORCHESTRATION ENGINE:
- Best channel for next message?
- Best time?
- Best content?
- Frequency check?
- Goal alignment?

CHANNEL DELIVERY:
- Send via chosen channel
- Track engagement
- Update profile
- Inform next decision

LEARNING LOOP:
- Performance per channel
- Customer preferences
- Optimization continuous
```

### 15.3 Channel selection logic

```
Channel selection rules:

EMAIL:
- Long-form content
- Detailed information
- Promotional offers
- Newsletters
- Default for non-urgent

SMS:
- Time-sensitive
- High urgency
- Order updates
- Appointment reminders
- Limited-time offers

WEB PERSONALIZATION:
- Active browsing visitors
- Returning visitors
- Contextual messaging
- In-session influence

SOCIAL:
- Public awareness
- Lookalike audiences
- Retargeting
- Brand engagement

OFFLINE (if integrated):
- In-store experience
- POS-triggered
- Direct mail (rare)
- Sales call follow-up
```

### 15.4 Consistency benefits

```
Omnichannel consistency:

CUSTOMER EXPERIENCE:
- Recognized across channels
- Coherent messaging
- No "starting over"
- Personalized everywhere

BRAND VALUE:
- Professional image
- Trust building
- Loyalty enhanced
- Long-term relationships

OPERATIONAL EFFICIENCY:
- Centralized control
- Reduced duplicate work
- Unified reporting
- Better resource allocation
```

---

## 16. SMS campaign flow

### 16.1 SMS setup

```
SMS campaign setup:

1. SMS module activated
2. Sender configured:
   - Sender ID (alphanumeric or short code)
   - Compliance verified
   - Regional compliance (CZ, SK, PL, EU)
3. Opt-in flow:
   - Web forms (SMS checkbox)
   - SMS keyword opt-in
   - Email-based confirmation
4. Subscriber list managed
5. Templates prepared
6. Campaign created
```

### 16.2 SMS campaign flow

```
SMS send flow:

1. New SMS campaign
2. Audience selection
3. Compose:
   - 160 chars (1 SMS)
   - Multi-part SMS (long messages)
   - Personalization
   - URL shorteners (track clicks)
4. Compliance:
   - "Reply STOP" included
   - Sender ID visible
   - Regulatory compliance
5. Contact Policy check
6. Schedule / Send
7. Tracking:
   - Delivery
   - Clicks
   - Opt-outs
   - Conversions
```

### 16.3 Use cases

```
SMS effective for:

E-COMMERCE:
- Cart abandonment last-attempt
- Order confirmations (if integrated)
- Shipping updates
- Flash sales
- Limited-time offers

B2B:
- Appointment reminders
- Event reminders
- Critical updates
- Account alerts

CUSTOMER SERVICE:
- Resolution updates
- Survey requests
- Feedback collection

LOYALTY:
- VIP exclusive offers
- Birthday messages
- Member updates
- Reward notifications
```

### 16.4 Multi-language SMS

```
Multi-language SMS:
- Czech SMS
- Slovak SMS
- Polish SMS
- English SMS
- Per-recipient language
- Auto-assignment by profile
   ↓
Important for CE region
```

---

## 17. Module activation flow (40+ modulů)

### 17.1 Per oficiální

> *"Stačí je aktivovat a začít používat. Rozděleny jsou podle oblasti, kterou obohacují, nebo podle funkcionality, kterou přidávají."*

### 17.2 Module activation workflow

```
Module activation:

1. Review module catalog (40+ available)
2. Select needed module
3. Click "Activate"
4. Configuration wizard:
   - Basic setup
   - Permissions
   - Initial data
5. Module available immediately
6. Configure usage:
   - Adapt to business
   - Set rules
   - Define audiences
7. Train users (if needed)
8. Monitor performance
9. Iterate or expand
```

### 17.3 Module categories

```
Targito modules organized:

DATA & SEGMENTATION:
- RFM Segmentation
- Predictive Segments
- Custom Fields
- Cross-Object Segmentation
- Behavioral Segments

PERSONALIZATION:
- Web Personalization
- Email Personalization
- Dynamic Content
- Real-time Recommendations
- Conditional Blocks

CHANNELS:
- Email Advanced
- SMS Channel
- Web Channel
- Social Channel
- Offline Channel

AUTOMATION:
- Scenario Builder
- Advanced Workflows
- Cross-Channel Orchestration
- Predictive Triggers
- Behavioral Triggers

REPORTING:
- Standard Reports
- Custom Dashboards
- Revenue Attribution
- ROI Analysis
- Cohort Analysis

GOVERNANCE:
- Contact Policy
- Compliance Audit
- Consent Management
- Privacy Controls
- Audit Logs

INDUSTRY SPECIFIC:
- E-commerce Suite
- B2B Suite
- Multi-brand
- Multi-language
- Loyalty Integration

AI:
- Targito AI Content
- Predictive Models
- Smart Send Time
- Auto-Segmentation
- Content Recommendations
```

### 17.4 Strategic activation pattern

```
Typical activation roadmap:

PHASE 1 (Month 1-3):
- Core CDP
- Email
- Basic Segmentation
- First Scenarios (Welcome, Cart)
- Standard Reports

PHASE 2 (Month 4-6):
- RFM Segmentation
- Advanced Automation
- Contact Policy
- Web Personalization
- Custom Dashboards

PHASE 3 (Month 7-12):
- SMS Channel
- Targito AI
- Cross-Channel Orchestration
- Predictive Models
- Loyalty Integration

PHASE 4 (Year 2+):
- Industry-specific modules
- Advanced AI
- Multi-brand expansion
- Offline integration
- Custom development
```

⚠️ **Phased activation** = manageable change + quick wins.

---

## 18. E-commerce integration flow

### 18.1 E-shop platform integrations

```
Supported e-shop platforms:

CZECH:
- Shoptet (largest CZ e-shop platform)
- Upgates
- Webareal
- Eshop Rychle

INTERNATIONAL:
- Magento (Adobe Commerce)
- WooCommerce
- Shopify
- BigCommerce
- PrestaShop

CUSTOM:
- API integration available
- Custom development possible
- ERP connector options
```

### 18.2 Integration setup

```
E-shop integration flow:

1. Choose integration method:
   - Native (pre-built)
   - API (custom)
   - File-based (batch)

2. Native integration:
   - Install Targito plugin/extension
   - Authorize connection
   - Configure data mapping
   - Schedule sync (real-time + batch)
   - Initial historical import

3. Data sync setup:
   - Customers (full sync + ongoing)
   - Products (catalog sync)
   - Orders (real-time)
   - Cart events (real-time)
   - Browse events (web tracking)

4. Web tracking:
   - JavaScript pixel
   - Event tracking
   - Conversion tracking
   - Cross-device tracking

5. Validation:
   - Test customer flow
   - Test order tracking
   - Test cart events
   - Verify data accuracy
```

### 18.3 E-commerce workflow benefits

```
Integrated e-commerce flows:

REAL-TIME:
- Customer browses → triggered automation
- Cart abandoned → recovery sequence
- Purchase → post-purchase nurture
- Reorder reminder → automated

PERSONALIZATION:
- Per-product recommendations
- Browse-based emails
- Purchase history awareness
- Dynamic pricing display
- Inventory-aware messaging

REPORTING:
- Revenue attribution
- ROI per campaign
- Customer LTV
- Cohort performance
- Funnel analysis
```

### 18.4 ROI examples

```
E-commerce ROI per Targito:

ZOOT:
- +400% Conversion Rate
- +46% retention revenue share

BONAMI:
- 42% revenue lift (within a month)

PATTERN:
- Mid-market e-shops
- Czech market
- Data unification = key
- AI + personalization = lift
- Retention focus
```

---

## 19. B2B use case (UniCredit pattern)

### 19.1 UniCredit testimonial

Per oficiální:
> *"At UniCredit Group, we place maximum emphasis on the security of our clients' data. Therefore, every software and vendor selected must undergo a rigorous screening and selection process to ensure that all legal requirements for data security are met. Targito meets these high standards. We appreciate their ability to 'tailor' a product to our needs."*

⚠️ **Banking-grade security** validation.

### 19.2 B2B specifics

```
Targito B2B workflow:

ACCOUNT-LEVEL DATA:
- Multiple contacts per account
- Buying committee mapping
- Account-level scoring
- Account engagement tracking

LEAD MANAGEMENT:
- Lead capture
- Lead scoring
- Lead nurturing
- Sales handoff
- Pipeline integration

B2B AUTOMATION:
- Long sales cycle support
- Multi-touch sequences
- Stage-based nurturing
- Content delivery
- Webinar promotion
- Event registration

INTEGRATION:
- CRM connection (Salesforce, HubSpot, etc.)
- Sales tool integration
- LinkedIn integration
- Custom B2B fields
```

### 19.3 IEA 2019 award

Per oficiální:
> *"We have automated almost all of our communication with our customers and B2B partners, which was awarded first place in the categories of emailing campaigns and B2B services by the independent jury of the IEA competition in 2019."*

⚠️ **Industrial Email Award** = external B2B validation.

### 19.4 B2B sweet spot

```
Targito B2B fit:
- Czech/Slovak B2B firms
- Financial services (UniCredit pattern!)
- Mid-market B2B
- Long sales cycles (30+ days)
- Compliance-sensitive industries
- Multi-stakeholder buying
- ABM strategy possible
- Existing CRM (integration)
- Marketing-sales alignment
```

---

## 20. Analytics & reporting flow

### 20.1 Per oficiální

> *"Analytics & reporting – Don't act blindly - make decisions based on data."*

### 20.2 Analytics dashboard hierarchy

```
Targito reporting structure:

EXECUTIVE DASHBOARD:
- Total revenue from Targito
- ROI on platform investment
- Channel performance summary
- Top campaigns
- KPI achievement

CAMPAIGN-LEVEL:
- Per-campaign performance
- Send metrics
- Engagement metrics
- Conversion metrics
- Revenue attribution

CUSTOMER-LEVEL:
- Per-customer journey
- LTV calculation
- Engagement score
- RFM evolution
- Predictive insights

SEGMENT-LEVEL:
- Segment growth
- Cross-segment movement
- Performance comparison
- Optimization opportunities

CHANNEL-LEVEL:
- Per-channel ROI
- Cross-channel attribution
- Channel optimization
- Mix analysis

AUTOMATION-LEVEL:
- Workflow performance
- Per-step drop-off
- A/B test results
- Goal achievement rates

PREDICTIVE-LEVEL:
- Churn forecasts
- LTV projections
- Next purchase predictions
- Engagement probability
```

### 20.3 Reporting flow

```
Standard reporting cycle:

DAILY:
- Real-time monitoring
- Active campaigns tracking
- Alerts on anomalies
- Performance check

WEEKLY:
- Campaign review meeting
- KPI tracking
- Optimization decisions
- A/B test reviews

MONTHLY:
- Strategic review
- Cohort analysis
- ROI calculation
- Plan adjustments

QUARTERLY:
- Executive review
- Annual planning
- Module ROI evaluation
- Vendor relationship review
```

### 20.4 Real-time monitoring

```
Real-time capabilities:
- Live campaign tracking
- Conversion stream
- Active automation monitoring
- Alert system
- Custom dashboards
- Per-team views
- API access for BI tools
```

### 20.5 Export + BI integration

```
Data export options:
- CSV export
- API access
- BI tool connectors
- Data warehouse sync
- Custom integrations
   ↓
For external analytics platforms
```

---

## 21. Partner agency collaboration

### 21.1 Per oficiální

> *"At Targito, we build long-term partnerships that extend the value of our platform."*

### 21.2 Agency collaboration patterns

```
Common partner relationships:

FULL-SERVICE AGENCY:
- Strategy + execution
- All Targito work managed
- Customer minimal involvement
- Premium model

CONSULTING + INHOUSE:
- Agency strategic guidance
- Customer team executes
- Best of both worlds
- Skill transfer focus

PROJECT-BASED:
- Specific implementations
- New module rollouts
- Campaign creative
- Strategic consulting

ONGOING OPTIMIZATION:
- Monthly retainer
- Continuous improvement
- Performance optimization
- Strategic insights
```

### 21.3 Partner agency value-adds

```
What agencies bring:

STRATEGIC:
- Industry expertise
- Best practices
- Competitive insights
- Roadmap planning
- ROI optimization

OPERATIONAL:
- Day-to-day execution
- Creative production
- Technical implementation
- QA + testing
- Reporting + insights

SCALE:
- Faster ramp-up
- Specialized skills
- Lower in-house costs
- Quality assurance
- Continuous improvement

KNOWLEDGE:
- Cross-customer insights
- Industry benchmarks
- Latest Targito features
- Best practices
- Strategic vision
```

### 21.4 Targito-agency-customer triangle

```
3-way relationship:

CUSTOMER ↔ AGENCY:
- Primary relationship
- Business goals
- Strategic alignment
- Day-to-day work

AGENCY ↔ TARGITO:
- Platform expertise
- Technical support
- Strategic partnership
- Co-marketing

CUSTOMER ↔ TARGITO:
- Behind-the-scenes mostly
- License agreement
- Strategic input (occasional)
- Direct support backup
```

---

## 22. Customer support workflow

### 22.1 Per oficiální

> *"The fast and professional customer support, which is always ready to advise, is also a great help."*

### 22.2 Support channels

```
Targito support:

DIRECT CHANNELS:
- Phone (775 602 ... per Firmy.cz)
- Email support
- Support portal
- Live chat (likely)
- Customer success manager

DOCUMENTATION:
- Help center (support.targito.com area)
- Video tutorials
- Best practices guides
- Czech language primary
- English secondary

COMMUNITY:
- Komunita Targito (LinkedIn)
- User groups
- Webinars
- Knowledge sharing

PARTNER ESCALATION:
- Via certified agency
- Higher-tier support
- Strategic guidance
```

### 22.3 Support response times

```
Typical Targito support:
- Email: 24-48 hours business days
- Phone: business hours
- Critical issues: faster response
- Standard support: included
- Premium support: faster + dedicated CSM
```

### 22.4 Customer success management

```
CSM responsibilities (likely):
- Account health monitoring
- Quarterly business reviews
- New feature adoption
- Module expansion guidance
- Renewal facilitation
- Strategic alignment
- Voice of customer
```

---

## 23. Datová mapa: co vidí kdo

| Data | Account owner | Admin | Marketing user | Read-only | End customer | Targito PM | Targito support | Partner agency |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Account settings | ✅ | ✅ | view | ❌ | ❌ | s consent | s consent | per scope |
| Billing | ✅ | ❌ | ❌ | ❌ | ❌ | s consent | s consent | ❌ |
| User management | ✅ | ✅ | ❌ | ❌ | ❌ | s consent | s consent | per scope |
| CDP profiles | ✅ | ✅ | ✅ | view | own profile | s consent | s consent | per scope |
| Identity resolution | ✅ | ✅ | view | ❌ | ❌ | s consent | s consent | per scope |
| Segments | ✅ | ✅ | ✅ | view | ❌ | s consent | s consent | per scope |
| Email templates | ✅ | ✅ | ✅ | view | ❌ | s consent | s consent | per scope |
| Campaigns | ✅ | ✅ | ✅ | view | ❌ | s consent | s consent | per scope |
| Automation | ✅ | ✅ | ✅ | view | ❌ | s consent | s consent | per scope |
| RFM segments | ✅ | ✅ | ✅ | view | ❌ | s consent | s consent | per scope |
| Contact Policy | ✅ | ✅ | view | ❌ | ❌ | s consent | s consent | per scope |
| Reports | ✅ | ✅ | ✅ | view | ❌ | s consent | s consent | per scope |
| Web tracking config | ✅ | ✅ | view | ❌ | ❌ | s consent | s consent | per scope |
| SMS config | ✅ | ✅ | view | ❌ | ❌ | s consent | s consent | per scope |
| Targito AI | ✅ | ✅ | ✅ | view | ❌ | s consent | s consent | per scope |
| Integrations | ✅ | ✅ | view | ❌ | ❌ | s consent | s consent | per scope |
| API keys | ✅ | view | ❌ | ❌ | ❌ | s consent | ❌ | ❌ |
| Module activation | ✅ | ✅ | ❌ | ❌ | ❌ | s consent | s consent | per scope |
| Audit logs | ✅ | view | ❌ | ❌ | ❌ | s consent | s consent | ❌ |
| Personalizace web | ✅ | ✅ | ✅ | view | sees applied | s consent | s consent | per scope |

---

## 24. Známé úzkoprofilové místa

### 24.1 No public pricing

```
Pricing barrier:
- Custom pricing only
- Sales call required
- Negotiation needed
- Comparison harder
- Budget approval delays
   ↓
Friction for evaluation
```

### 24.2 6-12 týdnů implementation

```
Implementation reality:
- Not "instant on"
- Project commitment
- Resource allocation
- Stakeholder coordination
- Change management
- Training time
   ↓
Pro startups too heavy
```

### 24.3 Mid-market focus

```
Market positioning:
- SMB: too sophisticated
- Enterprise: smaller vs. Salesforce/Bloomreach
- Sweet spot: mid-market CZ
- Compressed by competitors
```

### 24.4 Czech focus = international limit

```
Geographic reality:
- Primary: CZ
- Secondary: SK, PL
- Limited: international
- No major US/UK customers
- Limited DACH presence
   ↓
For international expansion = Klaviyo / Bloomreach lepší
```

### 24.5 No self-service signup

```
Friction:
- ❌ No instant signup
- ❌ No free trial
- ✅ Consultation required
- Slower lead-to-customer
   ↓
Loses speed-sensitive prospects
```

### 24.6 AI catch-up

```
AI maturity:
- Targito AI = relatively recent
- Vs. Klaviyo agentic AI lead
- Vs. SALESmanago deep AI
- Vs. Bloomreach Brain AI
- Catching up vs. AI-native competitors
```

### 24.7 Smaller team scale

```
Company scale:
- Targito = mid-size Czech company
- Vs. Salesforce 70 000+ zaměstnanců
- Vs. Klaviyo 1 500+ zaměstnanců
- Vs. Bloomreach 1 000+ zaměstnanců
- Smaller R&D, slower large features
```

### 24.8 Limited public roadmap

```
Roadmap transparency:
- Limited public roadmap
- Customer feedback driven
- Less predictable releases
- New features added regularly
- But no detailed schedule
```

### 24.9 No major Gartner recognition

```
Analyst presence:
- Strong CZ player
- Not in major analyst reports
- Limited international validation
- Sherpas CZ recognition
- IEA 2019 award
   ↓
For procurement validation = less external proof
```

### 24.10 Bloomreach competitive pressure

```
Bloomreach (CZ origin = direct competitor):
- Larger scale post-acquisition
- More AI sophisticated
- Enterprise reach
- Same heritage (Czech tech)
- Direct competition mid+
```

### 24.11 Není pro Shoptet-only deep

```
Shoptet specifics:
- Leadhub = deepest Shoptet integration (CZ unique)
- Ecomail = good Shoptet
- Targito = integration exists, less specialized
- For Shoptet-only e-shop = Leadhub edge
```

### 24.12 No SaaS startup self-service

```
SaaS model:
- Sales-led process
- Vs. Mailchimp/MailerLite/Brevo: self-service
- Higher friction
- Longer cycles
- More commitment required
```

### 24.13 Limited massive community

```
Community scale:
- "Komunita Targito" (LinkedIn)
- Smaller than Klaviyo Academy
- Smaller than Mailchimp community
- More intimate but less massive
- For peer learning = limited
```

### 24.14 Není mobile-first

```
Mobile capabilities:
- Email + SMS standard
- Web personalization
- ❌ No prominent mobile push
- ❌ No in-app messaging
- ❌ No WhatsApp prominent
- For mobile-app-first = Braze lepší
```

### 24.15 Není pro DTC SaaS DTC pure

```
DTC specifics:
- Klaviyo = DTC Shopify native (lepší)
- Omnisend = DTC focused
- Targito = e-commerce broad (not DTC-only)
- For pure DTC pure = Klaviyo edge
```

### 24.16 Pricing barrier for SMB

```
SMB exclusion:
- Custom pricing
- Implementation cost
- Project manager required
- All barriers for SMB
   ↓
SMB lost to Ecomail / SmartEmailing / Leadhub
```

### 24.17 Documentation public limited

```
Documentation reality:
- Help center exists
- Less massive vs. Klaviyo/Mailchimp
- Czech primary
- English limited
- For DIY learning = challenging
```

### 24.18 Limited published case studies

```
Case study reality:
- ZOOT, Bonami, UniCredit highlighted
- Less detailed quantitative data public
- Mostly testimonials
- Limited public metrics
- Vs. Klaviyo extensive ROI cases
   ↓
For sales validation = less ammunition
```

### 24.19 No standalone CDP recognized

```
CDP positioning:
- Targito = email-CDP hybrid
- "Nejpoužívanější CDP v ČR" (per Sherpas)
- But not in CDP Institute global leaders
- Not in Gartner CDP Magic Quadrant
- Standalone CDP credibility lower than mParticle, Segment
```

### 24.20 Vendor risk smaller company

```
Vendor risk:
- Targito = privately held
- Czech company
- Smaller than global giants
- Acquisition risk (possible)
- Stability over 15 let = good signal
- But less institutional vs. Salesforce
   ↓
For enterprise risk-averse = larger vendor preferred
```

---

## 25. Doporučení pro design vlastních procesů

### Pro Targito customery obecně:

1. **Start with discovery** – proper requirements before implementation
2. **Allocate dedicated resources** – internal champion + technical lead
3. **Phase module activation** – don't enable all 40+ at once
4. **Plan 6-12 týdnů** – realistic timeline for production
5. **Choose path:** in-house PM OR partner agency
6. **Data quality first** – garbage in, garbage out
7. **Identity resolution validation** – key for CDP success
8. **Start with priority use cases** – welcome, cart, post-purchase
9. **Activate RFM early** – mature segmentation foundation
10. **Setup Contact Policy** – customer respect from day 1
11. **Train multiple users** – avoid single point of failure
12. **Document configurations** – for handover + audits
13. **Plan quarterly reviews** – Targito CSM/PM input valuable
14. **Leverage Targito AI gradually** – proof of concept first
15. **Measure ROI per module** – justify ongoing investment

### Pro e-commerce specifically:

1. **E-shop integration first priority** (deep integration)
2. **Real-time order data sync**
3. **Web tracking deployment** day 1
4. **Cart abandonment flow** – quick ROI win
5. **Post-purchase nurture** – LTV increase
6. **Product catalog sync** – personalization foundation
7. **RFM activation early** – e-commerce gold
8. **Browse abandonment** – next-level engagement
9. **Loyalty integration** – retention focus
10. **Multi-language if applicable** (CZ + SK + PL common)

### Pro B2B specifically:

1. **CRM integration critical** (Salesforce, HubSpot)
2. **Lead scoring setup** early
3. **Long-cycle nurture planning**
4. **Account-based view** (multiple contacts)
5. **Sales handoff workflows**
6. **Webinar promotion automation**
7. **Content gating strategy**
8. **Sales notifications setup**
9. **B2B-specific reporting**
10. **Compliance considerations** (UniCredit pattern)

### Pro partner agency model:

1. **Choose certified partner** – validated quality
2. **Define scope clearly** – avoid scope creep
3. **Maintain knowledge transfer** – build internal capability
4. **Set performance KPIs** – measure agency value
5. **Regular review meetings** – stay aligned
6. **Direct Targito relationship** – for escalations
7. **Annual contract reviews** – optimize fees
8. **Document everything** – ownership questions
9. **Maintain access to data** – portability
10. **Strategic vs. operational split** – clear roles

### Avoid Targito if:

- SMB with < 1000 contacts (use Leadhub / Ecomail)
- Need self-service signup
- Want free plan
- Startup with rapid launch
- Pure Shopify DTC (use Klaviyo)
- Enterprise Fortune 500 global (use Salesforce / Bloomreach)
- Mobile-app-first business (use Braze)
- B2B SaaS deep (use HubSpot)
- Pure transactional needs (use Mailkit)
- Content creator newsletter (use Beehiiv / Substack)

---

*Dokument zpracován z oficiálních zdrojů targito.com (Platform, CDP, AI, Omnichannel, Moduly, E-commerce, B2B, Partneři, Spolupráce & podpora), Sherpas Tech research (313 e-shopů sample), Obchodní rejstřík ČR (justice.cz, IČO 28445937), LinkedIn Targito, Penize.cz, Podnikatel.cz, Finance.cz, Firmy.cz, Targito blog. Pro nejaktuálnější pricing detaily je nutný kontakt s Targito sales prostřednictvím konzultace na targito.com.*
