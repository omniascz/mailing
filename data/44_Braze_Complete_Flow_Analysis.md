# Braze – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v Braze prochází data, lidé a akce – od sales přes mobile SDK integration, Canvas journey orchestration, BrazeAI Suite operations, real-time stream processing, cross-channel messaging, Currents data streaming, OfferFit Agentic AI integration, až po monitoring, ROI měření, a long-term enterprise customer management. Speciální focus na **Braze jako enterprise B2C Customer Engagement Platform** s real-time stream processing architecture.

> Tento dokument doplňuje `43_Braze_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** Braze umí, tento popisuje, **kdo s tím interaguje a jak data tečou**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
> - **Braze je publicly traded** (NASDAQ: BRZE)
> - **Enterprise B2C focus** – NE B2B, NE SMB
> - **Real-time stream processing** (sub-second latency)
> - **13 digital channels** z jediné platformy
> - **BrazeAI Suite** = AI-native (NE bolt-on)
> - **OfferFit acquisition $303.2M** (Agentic AI direction)
> - **Canvas** = nejvyspělejší journey builder v kategorii
> - **Zero-copy Canvas Triggers** (Snowflake, BigQuery direct)
> - **Currents** real-time data streaming OUT
> - **Connected Content** API-driven personalization
> - **Catalogues** product/content management
> - **13-15% R&D investment**
> - **Q3 FY2026 BrazeAI Decisioning Studio:** $4.8M revenue
> - **Forrester TEI: 457% ROI, payback < 6 months**
> - **Forge 2025** = annual conference (AI products launched)
> - **Braze Bonfire** community
> - **Implementation 3-6 months** typically
> - **Pro tier $80K-$250K/year, Enterprise $300K-$1M+/year**

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Sales & qualification flow (enterprise B2C)](#2-sales-flow)
3. [Pricing negotiation flow (Vendr-style)](#3-pricing-negotiation)
4. [Onboarding & implementation flow (3-6 months)](#4-onboarding)
5. [Mobile SDK integration flow](#5-mobile-sdk)
6. [Data model + custom events design](#6-data-model)
7. [Canvas journey design flow](#7-canvas-design)
8. [BrazeAI Suite activation flow](#8-brazeai-activation)
9. [BrazeAI Decisioning Studio campaign flow](#9-decisioning-flow)
10. [BrazeAI Agent Console deployment](#10-agent-console-flow)
11. [BrazeAI Operator usage flow](#11-operator-flow)
12. [Email campaign flow](#12-email-flow)
13. [Push notification flow](#13-push-flow)
14. [In-App Messages + Content Cards flow](#14-iam-flow)
15. [SMS / WhatsApp / RCS flow](#15-multichannel-flow)
16. [Real-time stream processing flow](#16-stream-flow)
17. [Connected Content flow](#17-connected-content-flow)
18. [Catalogues management flow](#18-catalogues-flow)
19. [Currents data streaming flow](#19-currents-flow)
20. [Zero-copy Canvas Triggers flow](#20-zero-copy-flow)
21. [Segmentation + Predictive AI flow](#21-segmentation-flow)
22. [Customer Engagement lifecycle](#22-customer-engagement)
23. [Analytics + Reporting flow](#23-analytics-flow)
24. [ROI measurement (Forrester TEI 457%)](#24-roi-flow)
25. [Multi-workspace / multi-brand flow](#25-workspaces)
26. [GDPR / CCPA compliance flow](#26-compliance)
27. [Customer Success + Support flow](#27-success-flow)
28. [Braze Bonfire community flow](#28-bonfire)
29. [Datová mapa: co vidí kdo](#29-data-map)
30. [Známé úzkoprofilové místa](#30-bottlenecks)

---

## 1. Mapa všech aktérů

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│         BRAZE PLATFORM ECOSYSTEM (NASDAQ: BRZE)                      │
│         Customer Engagement Platform · "Be Absolutely Engaging™"     │
│         Enterprise B2C · Real-time stream processing                 │
│         13 channels · BrazeAI Suite · Canvas orchestration           │
│         Leader Gartner Magic Quadrant 2025 (3rd year)                │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [Braze, Inc. (NASDAQ: BRZE)]                                        │
│   ├─ Executive (CEO, CFO, CRO, CTO, CPO)                             │
│   ├─ Sales (Enterprise + Mid-market AEs)                             │
│   ├─ Solutions Consultants (technical pre-sales)                     │
│   ├─ Customer Success Managers (CSMs)                                │
│   ├─ Technical Account Managers (TAMs)                               │
│   ├─ Professional Services                                           │
│   ├─ Email Deliverability Team                                       │
│   ├─ Onboarding specialists                                          │
│   ├─ Support Engineering                                             │
│   ├─ Engineering (Product + R&D 13-15% revenue)                      │
│   ├─ BrazeAI Team (post-OfferFit acquisition)                        │
│   ├─ Marketing (Forge conference, Bonfire community)                 │
│   ├─ Partner ecosystem                                               │
│   └─ Compliance + Security                                           │
│           │                                                          │
│           ▼                                                          │
│                                                                      │
│   ┌────────────────────────────────────────────┐                     │
│   │   Braze Workspace                          │                     │
│   │                                            │                     │
│   │   USER ROLES (custom roles + permissions): │                     │
│   │   ├─ Admin (workspace owner)               │                     │
│   │   ├─ Manager (campaigns + Canvases)        │                     │
│   │   ├─ Marketer (campaigns)                  │                     │
│   │   ├─ Analyst (read-only + reports)         │                     │
│   │   ├─ Developer (SDK + API)                 │                     │
│   │   ├─ Custom roles (granular)               │                     │
│   │                                            │                     │
│   │   FEATURES:                                │                     │
│   │   ├─ Campaigns                             │                     │
│   │   ├─ Canvas (journey orchestration)        │                     │
│   │   ├─ Segments (real-time)                  │                     │
│   │   ├─ Templates                             │                     │
│   │   ├─ Catalogues                            │                     │
│   │   ├─ BrazeAI Suite                         │                     │
│   │   ├─ Currents (data out)                   │                     │
│   │   ├─ Connected Content                     │                     │
│   │   ├─ Analytics + Reports                   │                     │
│   │   └─ Settings + Integration                │                     │
│   │                                            │                     │
│   │   MULTIPLE WORKSPACES (Enterprise):        │                     │
│   │   ├─ Brand A workspace                     │                     │
│   │   ├─ Brand B workspace                     │                     │
│   │   ├─ Regional workspaces                   │                     │
│   │   └─ Sandbox / staging                     │                     │
│   └──────────────┬─────────────────────────────┘                     │
│                  │                                                   │
│                  ▼                                                   │
│   [Customer's Tech Stack]                                            │
│       │                                                              │
│       ├─→ Mobile Apps (iOS, Android)                                 │
│       │   - Braze iOS SDK                                            │
│       │   - Braze Android SDK                                        │
│       │   - React Native / Flutter / Unity                           │
│       │                                                              │
│       ├─→ Web                                                        │
│       │   - Braze Web SDK                                            │
│       │   - On-site personalization                                  │
│       │                                                              │
│       ├─→ Server-side                                                │
│       │   - REST API integration                                     │
│       │   - Server-side events                                       │
│       │   - User attribute updates                                   │
│       │                                                              │
│       ├─→ Data Layer                                                 │
│       │   - CDP (Segment, mParticle, Rudderstack)                    │
│       │   - Data warehouse (Snowflake, BigQuery)                     │
│       │   - ETL (Fivetran, Hightouch, Census)                        │
│       │                                                              │
│       └─→ Third-party tools                                          │
│           - Webhooks                                                 │
│           - Connected Content APIs                                   │
│           - Catalog feeds                                            │
│                  │                                                   │
│                  ▼                                                   │
│   [Customers / End Users]                                            │
│       │                                                              │
│       ├─→ Mobile app users                                           │
│       ├─→ Web users                                                  │
│       ├─→ Email subscribers                                          │
│       ├─→ SMS / WhatsApp recipients                                  │
│       ├─→ Push notification receivers                                │
│       ├─→ In-app message viewers                                     │
│       └─→ Connected TV viewers                                       │
│                                                                      │
│   [13 CHANNELS for delivery]                                         │
│   ┌────────────────────────────────────────────┐                     │
│   │   1. Email                                 │                     │
│   │   2. Push notifications                    │                     │
│   │   3. In-App Messages                       │                     │
│   │   4. Content Cards                         │                     │
│   │   5. SMS                                   │                     │
│   │   6. WhatsApp                              │                     │
│   │   7. RCS Messaging                         │                     │
│   │   8. LINE (Asia)                           │                     │
│   │   9. Web (browser push + on-site)          │                     │
│   │   10. Connected TV                         │                     │
│   │   11. Paid Media (audience sync)           │                     │
│   │   12. Webhooks (any third-party)           │                     │
│   │   13. ChatGPT Native App SDK               │                     │
│   └────────────────────────────────────────────┘                     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér | Vstupní bod | Co dělá | Co vidí |
|---|---|---|---|
| **Workspace Admin** | Login + ownership | Settings, users, billing | Vše |
| **Manager** | Login + permissions | Campaigns + Canvases manage | Per workspace |
| **Marketer** | Login | Build campaigns, Canvas | Per scope |
| **Analyst** | Login (read-only) | Reports, analytics | Read-only |
| **Developer** | API + SDK | Integration, events | Technical |
| **End User** | App / email / push | Engage | Své interactions |
| **Braze CSM** | s consent | Strategic guidance | s consent |
| **Braze TAM** | s consent | Technical guidance | s consent |
| **Braze Sales** | Inquiry | New contracts | s consent |
| **Braze Support** | Ticket | Issue resolution | s consent |
| **Braze AI Team** | s consent | OfferFit + Decisioning Studio | s consent |
| **Mobile App SDK** | Code-level | Events + user data | Send to Braze |
| **Web SDK** | Code-level | Web events | Send to Braze |
| **REST API** | Server-side | Programmatic actions | Per scope |
| **CDP (Segment, etc.)** | Integration | Data flow | – |
| **Data warehouse (Snowflake)** | Zero-copy | Direct queries | – |
| **Webhooks** | Outbound | Third-party trigger | – |
| **Currents destination** | Outbound | Real-time data | All Braze events |
| **Connected Content API** | Inbound (your API) | Dynamic content | – |

---

## 2. Sales & qualification flow (enterprise B2C)

### 2.1 Lead acquisition

```
Lead sources:
- braze.com inbound (highest quality)
- Industry events (Forge conference!)
- Analyst reports (Gartner MQ Leader visibility)
- Customer referrals (Braze Bonfire community)
- Partner referrals
- Direct sales outreach (enterprise)
- Competitive evaluations (vs. Klaviyo, Iterable, Customer.io)
- Content marketing (Braze blog)
- Webinars + thought leadership
- Award visibility (G2 #1 Push, etc.)
```

### 2.2 Qualification criteria

```
Braze qualifies prospects on:

✅ B2C / D2C focus (not B2B SaaS!)
✅ Mobile-first business (apps important)
✅ MAU count (hundreds of thousands → millions)
✅ Multi-channel ambitions (NE just email)
✅ Real-time engagement need
✅ Marketing operations team (dedicated)
✅ Budget $80K+/year (Pro tier+)
✅ Implementation timeline 3-6 months acceptable
✅ Industry fit (retail, media, gaming, travel, financial, etc.)

❌ B2B SaaS (HubSpot/Marketo better)
❌ SMB / startup (Mailchimp/Brevo better)
❌ Budget < $60K (no fit)
❌ Email-only business (overkill)
❌ Web-only (mobile critical to Braze value)
❌ No technical team (implementation impossible)
```

### 2.3 Per GetVero qualification

> *"Your MAU count is in the hundreds of thousands or millions and you need real-time personalization at that scale. You need RCS, LINE, or WhatsApp Commerce — channels Customer.io doesn't offer. BrazeAI Decisioning Studio is a genuine requirement, not just a nice-to-have. You have (or plan to hire) a dedicated marketing operations team. You're in retail, media, gaming, travel, or financial services at enterprise scale. Your budget is $60K+/year and your implementation timeline is flexible."*

### 2.4 Discovery flow

```
**Discovery call (Account Executive + Solutions Consultant):**

Discovery questions:
1. Business model:
   - B2C / D2C?
   - Industry?
   - Mobile / web / both?
   - Current MAU count?
   - Growth trajectory?

2. Current stack:
   - Current ESP / CEP?
   - CDP (Segment, mParticle, etc.)?
   - Data warehouse (Snowflake, BigQuery)?
   - Mobile SDK currently?
   - Marketing automation tools?

3. Pain points:
   - What's not working with current stack?
   - Real-time gaps?
   - Channel gaps?
   - AI capabilities desired?
   - Personalization needs?

4. Use cases:
   - Top 3 priority use cases?
   - Cross-channel orchestration needed?
   - Specific channels (RCS, LINE, WhatsApp)?
   - Mobile-first features needed?

5. Team:
   - Marketing team size?
   - Marketing ops dedicated?
   - Engineering resources?
   - Data team?

6. Budget + timeline:
   - Budget range?
   - Decision timeline?
   - Implementation start?
   - Migration from competitor?

7. Compliance:
   - GDPR / CCPA / HIPAA?
   - EU data residency needed?
```

### 2.5 Demo flow

```
**Solutions Consultant demo:**

Phase 1: Platform overview (15 min)
- Braze value proposition
- Real-time architecture (sub-second!)
- 13 channels (visual demo)
- BrazeAI Suite overview

Phase 2: Canvas walkthrough (20 min)
- Drag-drop journey builder
- Real-time triggers
- Cross-channel coordination
- Branching logic
- Pre-built templates

Phase 3: BrazeAI features (20 min)
- Decisioning Studio demo
- Agent Console example
- Operator conversational interface
- Liquid Assistant
- AI Content QA

Phase 4: Use case scenarios (15 min)
- Customer's industry-specific
- Reference customer examples
- Anticipated ROI

Phase 5: Q&A + next steps (20 min)
```

### 2.6 POC / Pilot consideration

```
For larger prospects:
- Proof of concept (POC) discussion
- Pilot pricing
- Limited scope
- Success criteria defined
- Timeline 3-6 months
   ↓
If POC successful → full contract
```

---

## 3. Pricing negotiation flow (Vendr-style)

### 3.1 Per Vendr insight

> *"Multi-year commitments and competitive evaluations commonly yield discounts off list pricing. Buyers who negotiate MAU overage rates and message volume caps upfront often achieve more predictable total costs."*

### 3.2 Pricing dimensions

```
Braze pricing negotiation dimensions:

1. Platform Edition:
   - Core / Pro / Enterprise
   - Each unlocks features

2. Active Users (MAUs):
   - Baseline included
   - Overage rates
   - Negotiate threshold + overage cost

3. Message Volume:
   - Total messages per period
   - Per-channel caps
   - Overage rates

4. Flexible Credits (AI):
   - BrazeAI usage credits
   - Decisioning Studio
   - Agent Console
   - Operator
   - Predictable budgeting

5. Add-ons:
   - Currents (data streaming)
   - Multiple workspaces
   - Premium support
   - Dedicated CSM
   - Implementation services
```

### 3.3 Vendr pricing benchmarks

```
Per Vendr observed:
- Pro tier: $80,000-$250,000/year
- Enterprise (500K-1.5M MAUs): mid-range pricing
- Enterprise (2M+ MAUs): $300K-$1M+/year
- Implementation: $25K-$100K+ one-time
- Implementation duration: 3-6 months
```

### 3.4 Negotiation tactics

```
Buyer leverage tactics:
- Multi-year commitment (2-3 years)
  → 10-20% discount typical
- Competitive evaluation (Iterable, Klaviyo, etc.)
  → Pricing pressure
- MAU overage caps
  → Upfront agreement avoids surprises
- Message volume caps
  → Predictable spend
- Currents add-on bundling
  → Negotiate package
- Premium support included
  → vs. additional cost

Vendor counter-tactics:
- Highlight Forrester TEI 457% ROI
- Customer reference calls
- Migration support
- Implementation included (partial)
- BrazeAI value-add positioning
- Multi-year discount in exchange for commitment
```

### 3.5 Common contract terms

```
Standard contract:
- 12-month or 24-month term
- Annual prepay
- Auto-renewal
- MAU thresholds with overage rates
- Message volume thresholds
- AI credits allocation
- DPA (GDPR)
- SLA (varies by tier)
- Support tier
- Account management
```

### 3.6 Per Vendr competitive context

> *"Braze competes in the customer engagement and marketing automation space with platforms like Iterable, Klaviyo, Customer.io, and Salesforce Marketing Cloud. Pricing structures and total costs vary significantly across these alternatives."*

> *"In observed Vendr transactions, both vendors commonly negotiate below list for multi-year commitments, with Iterable occasionally offering more aggressive pricing to win competitive deals."*

---

## 4. Onboarding & implementation flow (3-6 months)

### 4.1 Onboarding phases

```
Phase 1: Kickoff (Week 1-2)
- Welcome + introductions
- CSM + TAM assigned
- Onboarding playbook
- Stakeholder identification
- Goals + success criteria
- Project plan

Phase 2: Discovery + Planning (Week 3-4)
- Current state audit
- Data architecture review
- Use case prioritization
- Channel strategy
- Integration mapping
- Timeline finalization

Phase 3: Foundation (Week 5-8)
- Mobile SDK integration (engineering)
- Web SDK integration
- Data model design
- Custom events specification
- User attribute mapping
- Initial integrations
- DNS + email setup

Phase 4: Configuration (Week 9-12)
- User profile design
- Segments definition
- Catalogues setup
- Connected Content endpoints
- Email templates
- Push setup (certificates)
- IAM design

Phase 5: First Campaigns (Week 13-16)
- Welcome series
- Onboarding flow
- Re-engagement
- Basic Canvas journeys
- Testing + QA
- Soft launch

Phase 6: Optimization (Week 17-24)
- Performance monitoring
- A/B testing
- AI features activation
- Advanced Canvas journeys
- Multi-channel orchestration
- Decisioning Studio (if Pro+)

Phase 7: Full Production (Week 25+)
- All major campaigns live
- Continuous optimization
- Quarterly business reviews
- Long-term partnership
```

### 4.2 Per FinancialContent

> *"Professional Services: Onboarding, email deliverability, and dedicated technical support."*

### 4.3 Roles during onboarding

```
Customer roles needed:
- Project Manager
- Marketing Lead
- Marketing Ops
- Engineering Lead (mobile SDK)
- Data Engineer (CDP + warehouse)
- Designer (email, IAM)
- Compliance / Legal (DPA review)
- Executive Sponsor

Braze roles assigned:
- Customer Success Manager (CSM)
- Technical Account Manager (TAM)
- Onboarding Specialist
- Solutions Architect
- Email Deliverability Specialist
- Support Engineering
```

### 4.4 Implementation cost

Per Vendr:
- **Implementation: $25K-$100K+ one-time**
- **Duration: 3-6 months**

```
Implementation services:
- Project management
- Technical guidance
- Data architecture
- Custom training
- Integration support
- Migration assistance (if from competitor)
- First campaign development
- QA + launch support
```

### 4.5 Migration from competitor

```
If migrating from competitor (Klaviyo, Iterable, etc.):

Migration phases:
1. Audit current setup
2. Map data model differences
3. Re-architect (Braze paradigm)
4. Migrate user data
5. Migrate campaigns
6. Migrate templates
7. Run parallel briefly
8. Cut over
9. Decommission old platform

Challenges:
- Different paradigms (per G2 reviewer: "dynamic fields and user journeys differently")
- Data structure differences
- Re-training team
- Initial productivity dip
- Mobile SDK swap (app release)
```

### 4.6 Per G2 reviewer migration

> *"Transitioned from another CX platform, so there were some learnings and new processes to implement since Braze handles things like dynamic fields and user journeys differently compared to our previous provider. Training and transition management provided was comprehensive."*

---

## 5. Mobile SDK integration flow

### 5.1 Mobile SDK importance

```
Mobile SDK = foundation of Braze value:
- Custom events
- User attributes
- Push notifications
- In-App Messages
- Content Cards
- Real-time triggers
- Cross-channel coordination
- Mobile-first features
   ↓
Without mobile SDK:
- Braze = expensive ESP
- Limited value
- Web + email only
```

### 5.2 SDK integration flow

```
Step 1: Engineering team review
- Read Braze documentation
- Identify implementation scope
- Resource planning

Step 2: SDK installation
- iOS: Swift Package Manager / CocoaPods
- Android: Gradle dependency
- React Native: npm install
- Flutter: pub add
- Unity: Asset Store / Package
- Other frameworks

Step 3: Initialization
- App ID configuration
- API endpoint setup
- Auth (API key)
- Per environment (dev, staging, prod)

Step 4: Push notification setup
- iOS: APNs certificates
- Android: FCM credentials
- Permissions request
- Token handling

Step 5: Event tracking
- Design custom events
- Implement event logging
- Test event flow
- Verify in Braze dashboard

Step 6: User attribute tracking
- Map user model to Braze attributes
- Implement attribute updates
- Test profile creation

Step 7: In-App Messages
- IAM display configuration
- Custom UI handling (optional)
- Trigger testing

Step 8: Content Cards
- Cards display configuration
- Update handling
- Click tracking

Step 9: Testing
- Test devices
- Beta testing
- QA cycles

Step 10: App store release
- Submit to App Store + Play Store
- Wait for approval
- Production deployment
   ↓
[Mobile SDK live]
```

### 5.3 Time estimate

```
Mobile SDK integration typically:
- 2-4 weeks engineering work
- Multiple sprint cycles
- 1-2 senior mobile engineers
- iOS + Android in parallel
- Plus app review cycles
- Plus testing
   ↓
3-6 months total for full mobile integration
(part of overall implementation)
```

### 5.4 Common SDK challenges

```
Common issues:
- Push notification permissions (iOS opt-in rates)
- APNs certificate management
- FCM credential rotation
- Custom UI for IAM (if needed)
- Deep link routing
- Identity resolution (anonymous → known user)
- Multi-device handling
- Background fetch
- App version compatibility
- SDK version updates
   ↓
Braze provides:
- Comprehensive docs
- Engineering support
- TAM guidance
- Community resources (Bonfire)
```

### 5.5 Server-side complement

```
Server-side integration for:
- Backend-triggered campaigns
- Server-side events (purchases, signups)
- User attribute updates
- Identity resolution
- Cross-platform consistency
   ↓
Via REST API
```

---

## 6. Data model + custom events design

### 6.1 Importance of data model

```
Braze data model = foundation:
- Custom events
- User attributes
- Computed fields
- Catalogues
- Segments
- Personalization
- Reporting
   ↓
Get this wrong = pain forever
Get this right = unlocked value
```

### 6.2 User attributes design

```
User attributes:
- Standard attributes (built-in):
  - first_name, last_name
  - email, phone
  - country, language
  - dob, gender
  - etc.

- Custom attributes (your design):
  - subscription_tier
  - lifetime_value
  - last_purchase_date
  - product_categories_bought
  - loyalty_points
  - preferences (any)
  - inferred attributes
   ↓
Design carefully:
- What's segmentable?
- What's personalization?
- What changes frequently?
- What's billable (data points)?
```

### 6.3 Custom events design

Per GetVero:
> *"Braze bills on data points. Every custom event, attribute, or purchase logged to a user profile counts as a billable unit. Standard engagement data — email opens, push clicks — doesn't count, but custom data does."*

⚠️ **Critical:** Event design affects billing.

```
Event design principles:

DO:
✅ Important business events
✅ Triggerable events (drive campaigns)
✅ Segmentable behaviors
✅ Conversion events
✅ Specific events (not generic)

DON'T:
❌ Every micro-interaction
❌ Page views (use frequency caps)
❌ Generic "user_action" events
❌ Frequently fired events (cost!)
❌ Events without business value
```

### 6.4 Event taxonomy example

```
E-commerce event taxonomy:

User events:
- account_created
- profile_updated
- preferences_changed

Browse events:
- product_viewed (frequency capped)
- category_viewed
- search_performed

Cart events:
- item_added_to_cart
- item_removed_from_cart
- cart_abandoned

Purchase events:
- purchase_completed
- subscription_started
- subscription_renewed
- subscription_cancelled

Engagement events:
- review_submitted
- rating_given
- shared_product

Email events: (free, built-in)
- email_opened, email_clicked, etc.

Push events: (free, built-in)
- push_opened, push_received, etc.
```

### 6.5 Properties on events

```
Event s properties:
purchase_completed:
- order_id
- total_value
- currency
- products (array)
- discount_applied
- payment_method
- shipping_method
- (etc.)
   ↓
Used for:
- Segmentation ("users who bought > $500")
- Personalization ("show order details")
- Catalogue references
- Reports
```

### 6.6 Computed fields

```
Computed fields:
- Calculated from events + attributes
- Examples:
  - days_since_last_purchase
  - total_purchases_count
  - average_order_value
  - engagement_score
  - churn_risk_score
   ↓
Updated continuously
Used for segmentation + personalization
```

### 6.7 Identity resolution

Per FinancialContent:
> *"Usability and Optimization: Smarter segments, interactive email components, **automated identity resolution**, and message prioritization."*

```
Identity resolution flow:

Anonymous user:
- Visits website
- Has browser ID (anonymous_id)
- Events tracked anonymously

User signs up:
- Account created
- email + user_id assigned
   ↓
Braze identity resolution:
- Anonymous_id linked to user_id
- Anonymous events merged to user profile
- Single unified profile
   ↓
Cross-device:
- User logs in on phone
- Same user_id
- Events linked across devices
   ↓
Unified customer view
```

---

## 7. Canvas journey design flow

### 7.1 Canvas design process

```
Step 1: Define use case
- What's the goal?
- What's the trigger?
- What's the audience?
- What's the success metric?

Step 2: Map out journey
- Whiteboard / Miro
- Trigger entry
- Steps + branches
- Channels per step
- Exit conditions

Step 3: Identify variables
- Personalization needed
- Dynamic content
- Connected Content APIs
- Catalogue references

Step 4: Design messages
- Templates created
- Personalization tokens
- Multi-channel coordination
- A/B variants

Step 5: Build in Canvas
- Drag-drop steps
- Configure each step
- Add branching logic
- Set delays
- Configure exit conditions

Step 6: QA + Test
- Test entry
- Test branching
- Test message delivery
- Test personalization
- Test multi-channel

Step 7: Launch (gradual)
- Soft launch (small audience)
- Monitor performance
- Scale up
- Full activation

Step 8: Optimize
- Performance review
- A/B test variants
- AI optimization (Decisioning Studio)
- Refinement
```

### 7.2 Canvas building blocks

```
Components:
- Trigger step (entry point)
- Delay step (wait time)
- Message step (send via channel)
- Decision split (logic branch)
- Action Path (event-triggered)
- Audience Path (attribute-based)
- Experiment Path (A/B test)
- API trigger
- Webhook step
- Wait Until (condition wait)
- Exit step (defined exit)
- AI Agent step (Agent Console output)
- Decisioning step (Studio integration)
```

### 7.3 Per oficiální Bazaar case study

> *"Bazaar increased revenue by 21% using Canvas to trigger real-time restock journeys."*

```
Bazaar restock Canvas example:
- Trigger: Item back in stock
- Audience: Users who viewed/wishlisted
- Real-time stream processes
- Canvas fires immediately
- Multi-channel:
  - Push notification
  - Email
  - SMS (high-value users)
- Personalized content (which item)
- Click → product page
- Conversion tracked
   ↓
21% revenue lift
```

### 7.4 Wellhub case study (per oficiální)

> *"The customer engagement campaign drove 25% of the net-new revenue associated with Wellhub's new subscriber revenue stream, led to up to 70% click rates, increased sign-up volume by 3X, and increased conversion rates by up to 5% through survey implementation and customized flows."*

### 7.5 Tonies case study

> *"Tonies saw a 117% increase in free-to-paid content conversions."*

### 7.6 Erewhon case study

> *"In partnership with Braze, Erewhon now delivers thoughtful, personalized experiences that resonate with their loyalty program members—thus far, they've seen a 20% lift in mobile order engagement with ~50% of recipients placing a mobile order within 90 days. They've also seen a ~2X increase in volume after launching with Braze and a ~33% reduction in time to stand up a campaign."*

### 7.7 Canvas at scale challenges

Per GetVero:
> *"The complexity ceiling is also a usability challenge. G2 reviewers note that Canvas becomes difficult to navigate as journeys grow complex."*

```
Mature Braze customer challenges:
- 50+ active Canvases
- Visual navigation difficult
- Audit trail complex
- Owner tracking
- Naming conventions critical
- Documentation needed
- Governance processes required
```

---

## 8. BrazeAI Suite activation flow

### 8.1 BrazeAI activation prerequisites

```
Prerequisites for full BrazeAI:
1. Pro tier+ subscription (most features)
2. Sufficient data volume
   - Need data for ML training
   - Limited efficacy on small data
3. AI credits allocated
4. Compute capacity
5. Training period
6. Human review processes
```

### 8.2 BrazeAI features rollout order

```
Typical adoption order:

Phase 1: Generative AI helpers
- Subject line suggestions
- Body copy assistance
- Translation
- Liquid Assistant
   ↓
Phase 2: Intelligent features
- Intelligent Timing (per-user send times)
- Intelligent Selection (auto-route to winners)
- Smarter Segments (AI suggestions)
   ↓
Phase 3: AI Content QA
- Pre-send quality checks
- Brand consistency
- Localization QA
   ↓
Phase 4: Recommendation Engine
- Personalized product recs
- ML-driven
   ↓
Phase 5: Agent Console
- Custom AI agents
- Embedded in Canvas
- Content + decisions
   ↓
Phase 6: Decisioning Studio
- Reinforcement learning
- Replaces A/B testing
- Major operational shift
   ↓
Phase 7: Operator
- Conversational interface
- Power user feature
```

### 8.3 Per G2 reviewer (Forge 2025 reflection)

> *"Braze continues to outpace the market by shifting from simple automation to true AI-native orchestration. In 2026, the standout feature is definitely the BrazeAI™ Decisioning Studio. Unlike old-school A/B testing, it uses reinforcement learning to autonomously decide the best channel, timing, and offer for each user in real-time."*

> *"I'm also incredibly impressed with the BrazeAI™ Liquid Assistant. It has turned complex Liquid coding into a conversational task, allowing our team to build hyper-personalized logic (like dynamic product catalogs) in minutes rather than hours."*

> *"The addition of AI Agents for content QA and localization has also streamlined our global operations, ensuring brand consistency across 10+ languages without manual bottlenecks."*

### 8.4 AI usage monitoring

```
AI credits monitoring:
- Track usage per feature
- Budget alerts
- Per-month forecasting
- Cost per outcome calculation
- ROI evaluation
   ↓
Pricing predictability:
- Set caps where possible
- Monitor closely first months
- Adjust as needed
```

### 8.5 Per G2 reviewer pricing concern

> *"As we lean more into Agentic workflows and AI-driven orchestration, the credit-based consumption or 'AI-utility' pricing can become unpredictable."*

⚠️ **Budget caution.**

### 8.6 Human-in-the-loop

Per G2 reviewer:
> *"Recommend to human verify the outputs."*

```
Human review still recommended for:
- AI-generated content (subject lines, copy)
- AI-generated decisions (when stakes high)
- AI translations
- AI agent outputs
   ↓
AI assists, humans validate
```

---

## 9. BrazeAI Decisioning Studio campaign flow

### 9.1 Decisioning Studio setup

```
Step 1: Define objective
- KPI to optimize:
  - Conversion rate
  - Revenue per user
  - Engagement
  - Retention
  - Custom metric

Step 2: Define variants
- Multiple channels to test
- Multiple timings
- Multiple offers
- Multiple content variations
- AI explores combinations

Step 3: Define audience
- Segment for campaign
- Eligibility criteria
- Exclusions

Step 4: Configure Decisioning Studio
- Learning period (initial exploration)
- Exploitation/exploration balance
- Statistical confidence thresholds
- Update frequency

Step 5: Launch
- AI starts exploring
- All variants get traffic
- Learning begins

Step 6: Monitor
- Performance dashboard
- AI confidence levels
- Per-variant performance
- Per-user decisions

Step 7: Optimization
- AI converges
- Best variants get more traffic
- Continuous adjustment
- Self-improving over time

Step 8: Long-term
- Continuous learning
- Adapts to changes
- New variants added
- AI re-optimizes
```

### 9.2 Reinforcement learning loop

```
Decisioning Studio RL loop:

For each user:
1. Observe user state (attributes, behavior)
2. Decide action (which variant)
3. Send + observe outcome (conversion?)
4. Update model (learn from outcome)
5. Better decision next time

Across all users:
- Continuous learning
- Multi-armed bandit
- Exploration vs exploitation
- Personalization at scale
```

### 9.3 Per Vendr context

```
Decisioning Studio:
- Pro tier+ feature
- AI credits-based
- Premium pricing
- Significant value claim
- Justifies higher tier
```

### 9.4 Vs. traditional A/B testing

```
Traditional A/B:
- Hypothesis
- Split 50/50
- Wait for significance
- Pick winner
- Push winner 100%
- Lose value during exploration
- Static winner until next test

Decisioning Studio:
- Continuous exploration
- Per-user optimization
- Multiple variants efficiently
- Real-time updates
- No "losing" period
- Adapts to changes
   ↓
Result: Higher overall performance
```

### 9.5 Q3 FY2026 revenue impact

Per FinancialContent:
- **BrazeAI Decisioning Studio Q3 FY2026:** **$4.8M revenue**

⚠️ Premium feature driving real revenue.

---

## 10. BrazeAI Agent Console deployment

### 10.1 Agent Console setup

```
Step 1: Identify agent use cases
- Content generation
- Data enrichment
- Intelligent orchestration
- Quality assurance
- Localization
- Personalization decisions

Step 2: Design agent
- Define agent purpose
- Configure model (LLM choice)
- Set context + instructions
- Define inputs/outputs
- Set guardrails

Step 3: Deploy in Canvas
- Add AI Agent step to Canvas
- Configure agent reference
- Set inputs (user data, etc.)
- Define output usage

Step 4: Test
- Sample user data
- Verify agent output
- Quality checks
- Edge cases

Step 5: Activate
- Limited audience first
- Monitor performance
- Quality maintained
- Cost monitoring

Step 6: Scale
- Wider audiences
- Multiple agent types
- Cross-Canvas usage

Step 7: Optimize
- Refine prompts
- Adjust model
- Improve outputs
- A/B test agents
```

### 10.2 Agent types

```
Common agent types:

Content Generation Agent:
- Input: User profile + product context
- Output: Personalized email body
- Model: GPT-4 / Claude

Subject Line Agent:
- Input: Campaign context + user
- Output: Optimized subject line
- A/B testing variants

Localization Agent:
- Input: English content + target language
- Output: Translated + culturally adapted
- 10+ languages supported

Content QA Agent (uses GPT-4):
- Input: Draft message
- Output: Quality score + suggestions
- Brand consistency check

Data Enrichment Agent:
- Input: User profile + events
- Output: Inferred attributes
- Categorization

Decision Agent:
- Input: User state + options
- Output: Recommended action
- Reasoning included
```

### 10.3 Per FinancialContent

> *"BrazeAI Agent Console: Allows creation and deployment of custom AI agents for automated workflows."*

> *"AI Content QA tool: Leverages OpenAI's GPT-4 for message quality checks."*

### 10.4 Per G2 reviewer

> *"The addition of AI Agents for content QA and localization has also streamlined our global operations, ensuring brand consistency across 10+ languages without manual bottlenecks."*

---

## 11. BrazeAI Operator usage flow

### 11.1 Operator workflow

```
Step 1: Marketer has goal
- "I want to re-engage users who haven't
  opened email in 30 days"

Step 2: Asks Operator (conversational)
- Types in natural language
- "Create a re-engagement campaign for
  inactive email subscribers"

Step 3: Operator generates draft
- Identifies segment
- Creates campaign structure
- Suggests channels
- Drafts content
- Returns plan

Step 4: Marketer reviews
- Validates segment
- Reviews content
- Adjusts as needed
- Conversational refinement

Step 5: Approval + activation
- Marketer activates
- Campaign launches
- AI-built faster than manual
```

### 11.2 Data queries via Operator

```
Marketer asks:
"Show me revenue from email campaigns last quarter"

Operator:
- Queries Braze data
- Aggregates revenue
- Filters to email campaigns
- Filters to last quarter
- Returns chart + number

Conversational follow-up:
"Break that down by month"
   ↓
Operator drills down
Returns monthly breakdown

"Show me the top 3 campaigns"
   ↓
Operator returns top 3
```

### 11.3 Productivity gains

```
Operator benefits:
- Non-technical marketers empowered
- Faster campaign creation (10x sometimes)
- Easier data exploration
- Lower learning curve
- Reduced expert dependency
```

### 11.4 Limitations

Per G2:
> *"the AI integration in in testing phase and there are some bugs in the outpur, Recommend to human verify the outputs."*

⚠️ Human review essential.

---

## 12. Email campaign flow

### 12.1 Email campaign types

```
Campaign types:
- Single send (broadcast)
- Triggered (event-based)
- Recurring (scheduled)
- Lifecycle (within Canvas)
   ↓
All build similarly
```

### 12.2 Email campaign creation flow

```
Step 1: Campaign type selection
- Single send / triggered / Canvas

Step 2: Audience selection
- Existing segment
- Build new segment
- Send to all
- Custom audience

Step 3: Email design
- Template selection (or new)
- Drag-drop editor
- HTML coding (advanced)
- Liquid personalization
- Connected Content
- Catalogues
- Interactive components (AMP for Email)

Step 4: Personalization
- Variable substitution
- Conditional content
- Dynamic recommendations
- AI-generated variants

Step 5: A/B testing setup (optional)
- Variants defined
- Sample size
- Winning metric
- OR: Decisioning Studio integration

Step 6: Send settings
- Send time (immediate, scheduled, optimized)
- Time zone handling
- Frequency caps
- Quiet hours

Step 7: Tracking
- UTMs
- Conversion events
- Custom tracking

Step 8: Review + approval
- QA checks
- AI Content QA (optional)
- Stakeholder approval

Step 9: Send
- Triggered immediately
- Or scheduled

Step 10: Monitor
- Real-time delivery dashboard
- Engagement metrics
- Conversion tracking
- Optimization opportunities
```

### 12.3 Email deliverability flow

```
Email send via Braze:
- Braze infrastructure (proprietary)
- Dedicated IP options
- SPF/DKIM/DMARC compliance
- ISP relationships
- Reputation monitoring
   ↓
Recipient inbox arrival
   ↓
Tracking:
- Open (with privacy considerations)
- Click
- Reply (if reply tracking)
- Bounce (soft/hard)
- Spam complaint
- Unsubscribe
   ↓
Webhook events / Currents stream
   ↓
Analytics
```

### 12.4 Per FinancialContent

> *"Professional Services: Onboarding, email deliverability, and dedicated technical support."*

```
Email deliverability team helps:
- IP warm-up strategy
- Authentication setup
- ISP relationship advocacy
- Reputation recovery
- Best practices
- List hygiene guidance
```

---

## 13. Push notification flow

### 13.1 Push notification setup

```
Setup prerequisites:
- iOS: APNs certificates configured
- Android: FCM credentials
- Mobile SDK integrated
- User opted in (iOS especially)
```

### 13.2 Push campaign flow

```
Step 1: Campaign type
- Single send
- Triggered
- Geofenced
- Beacon-triggered
- Canvas-orchestrated

Step 2: Audience
- Push-eligible users
- Platform (iOS, Android, both)
- Segment definition

Step 3: Content design
- Title (limited chars)
- Body (limited chars)
- Image (rich push)
- Custom buttons
- Deep links

Step 4: Personalization
- Liquid variables
- Dynamic content
- Connected Content
- Localization

Step 5: Send timing
- Immediate
- Scheduled
- Per-user optimized (Intelligent Timing)
- Quiet hours respect
- Frequency capping

Step 6: Send
- Native channel (APNs / FCM)
- Real-time delivery
- Tracking automatic

Step 7: Monitor
- Sent count
- Delivered
- Opened
- Click-through
- Conversion
- App opens
```

### 13.3 Push notification analytics

```
Push-specific metrics:
- Delivery rate (carrier issues)
- Open rate (notification opened)
- Direct opens (clicked notification)
- Influenced opens (opened app later)
- Click-through (CTA clicked)
- Uninstall correlation
- Per-platform performance
```

### 13.4 #1 G2 Push Notification Grid

Per Braze positioning:
- **#1 in category**
- **Most mature mobile SDK**
- **10+ years experience**
- **Continuous improvements**

---

## 14. In-App Messages + Content Cards flow

### 14.1 In-App Messages (IAM) flow

```
IAM design flow:

Step 1: Define trigger
- Session start
- Custom event
- Real-time trigger
- Specific screen visit
- Custom audience

Step 2: Choose template
- Modal
- Banner
- Full-screen
- HTML in-app
- Web in-app

Step 3: Design content
- Drag-drop or HTML
- Personalization
- Image / video
- CTA buttons
- Deep links

Step 4: Display rules
- Trigger conditions
- Frequency caps
- Eligibility
- Priority (vs. other IAMs)

Step 5: Test
- Test devices
- All user states

Step 6: Launch
- Limited audience
- Monitor performance

Step 7: Optimize
- A/B testing
- Performance metrics
- User feedback
```

### 14.2 IAM use cases

```
IAM common use cases:
- Onboarding tutorials
- Feature announcements
- Promotional offers
- Survey requests
- Permission asks (push opt-in)
- Cross-sell / upsell
- Cart abandonment in-app
- Account verification reminders
- Loyalty program promotion
```

### 14.3 Content Cards flow

```
Content Cards design:

Step 1: Define purpose
- Persistent message
- Inbox-like
- User reviews at leisure

Step 2: Design card
- Image
- Title
- Description
- CTA button
- Deep link

Step 3: Audience + targeting
- Segment-based
- Personalized

Step 4: Display rules
- Expiration date
- Pinning (priority)
- Categories

Step 5: Implementation
- Mobile app displays card section
- Cards appear when published
- User can:
  - View
  - Dismiss
  - Click through

Step 6: Tracking
- Impressions
- Clicks
- Dismissals
- Conversion
```

### 14.4 Per Gartner reviewer

> *"My favorite part of Braze was the ability to contact users in-app, without any overhead or bottlenecks from our engineering team."*

⚠️ **Marketing autonomy** key value.

---

## 15. SMS / WhatsApp / RCS flow

### 15.1 SMS flow

```
SMS prerequisites:
- Phone numbers collected
- TCPA / GDPR consent
- Sender IDs provisioned
- Short codes / long codes / toll-free

SMS campaign flow:
1. Audience selection (SMS-eligible)
2. Compose message (160 char standard)
3. Personalization (Liquid)
4. Compliance check (opt-out language)
5. Send (immediate / scheduled)
6. Two-way handling (optional)
7. Track delivery + responses
```

### 15.2 WhatsApp flow

Per FinancialContent:
> *"Expanded Channel Capabilities: Deepened support for WhatsApp Commerce, Flows, and Carousels"*

```
WhatsApp setup:
1. Meta Business account
2. WhatsApp Business API
3. Templates submitted to Meta for approval
4. Sender verification
5. Customer opt-in

WhatsApp campaign flow:
1. Audience (WhatsApp opt-in)
2. Template selection (approved)
3. Personalization
4. Add components:
   - Quick replies
   - Buttons
   - Carousels
   - Catalogs
5. Send
6. Two-way conversations
7. Customer service handoff (optional)
```

### 15.3 WhatsApp Commerce

```
WhatsApp Commerce features:
- Product catalogs in WhatsApp
- In-WhatsApp shopping
- Cart management
- Checkout (some markets)
- Order tracking
- Customer service integration
   ↓
End-to-end commerce in WhatsApp
```

### 15.4 RCS flow

Per FinancialContent:
> *"RCS Messaging"*

```
RCS setup:
1. Carrier relationships
2. Brand verification
3. Sender registration

RCS campaign flow:
1. Audience (RCS-capable devices)
2. Rich content design:
   - Verified sender (logo, colors)
   - Rich media
   - Carousels
   - Suggested replies
3. Personalization
4. Send (native messaging app)
5. Track engagement
6. Two-way conversations
```

### 15.5 LINE flow

```
LINE (Asia):
1. LINE Official Account
2. Audience opt-in
3. Templates
4. Personalization
5. Send via LINE
6. Track
```

### 15.6 Multi-channel orchestration

```
Cross-channel in Canvas:
- Day 1: Email
- Day 3 (if not opened): Push
- Day 7 (if not converted): SMS
- Day 14 (if still inactive): WhatsApp
   ↓
Coordinated via Canvas
- Frequency caps cross-channel
- Intelligent Channel selection
- Decisioning Studio optimizes
```

---

## 16. Real-time stream processing flow

### 16.1 Stream processing architecture

Per FinancialContent:
> *"Real-Time Data Processing: Proprietary stream processing architecture for instant data processing, enabling truly real-time engagement."*

### 16.2 Event flow

```
Event happens in customer's system:
- User clicks button v app
- User completes purchase
- User enters location
- Custom event triggered
   ↓
Mobile/Web SDK or REST API:
- Sends event to Braze
- Includes user_id + properties
- Real-time transmission
   ↓
Braze ingestion layer:
- Receives event
- Validates
- Routes to processing
   ↓
Stream processing:
- Updates user profile
- Updates segments (real-time!)
- Evaluates triggers
- Checks Canvas eligibility
   ↓
If triggered:
- Canvas fires
- Message dispatch
- Sub-second latency
   ↓
Recipient receives message
- Push within milliseconds
- Email within seconds
- SMS within seconds
```

### 16.3 Per oficiální claim

> *"Feel confident with a platform that operates with sub-second latency, regardless of your data and send volumes."*

### 16.4 Use case: real-time restock

```
Customer wishlists item (out of stock)
   ↓
Item back in stock (inventory system → Braze)
   ↓
Braze stream processes:
- User segment "wishlist_item_X" matched
- Canvas trigger fires
- User-specific message generated
   ↓
Push notification sent (within seconds)
   ↓
User receives push
- "Your wishlist item is back!"
- Direct link to product
   ↓
User clicks → purchases
   ↓
Conversion tracked
   ↓
Bazaar reports 21% revenue lift from this approach
```

### 16.5 Patents

Per FinancialContent:
> *"Notable Patents: Braze has significantly grown its IP portfolio, with patents covering: Systems and methods for controlling contacts with a client's users (U.S..."*

⚠️ Patent-protected real-time architecture.

---

## 17. Connected Content flow

### 17.1 Connected Content setup

```
Step 1: Build API endpoint
- Your API returns dynamic content
- JSON response format
- Fast response time (< 1s ideally)
- Authentication (API key)

Step 2: Configure in Braze
- Add Connected Content endpoint
- Configure auth
- Test calls

Step 3: Use in templates
- Liquid syntax
- {% connected_content URL %}
- Access response data
- Render dynamic content

Step 4: Caching considerations
- Cache headers
- Performance optimization
- Fallback content

Step 5: Test
- Various user states
- API failures (fallback)
- Response time
- Content accuracy
```

### 17.2 Connected Content execution

```
Email send time:
- Braze constructs email
- Connected Content URL pending
- Sent to recipient

Email open time:
- Recipient opens email
- Email client renders
- Connected Content URL called
- Your API returns current data
- Email shows fresh content
   ↓
Always-fresh personalization
```

### 17.3 Use cases

```
Connected Content use cases:

Weather:
{% connected_content https://weatherapi.com?city={{user.city}} %}
- Show current weather
- Recommend products accordingly

Inventory:
{% connected_content https://api.yoursite.com/stock?sku={{product.sku}} %}
- Show "3 left in stock"
- Always accurate

Pricing:
{% connected_content https://api.yoursite.com/price?id={{product.id}} %}
- Real-time pricing
- Sale ending countdowns

Recommendations:
{% connected_content https://api.yoursite.com/recs?user={{user.id}} %}
- Current top picks
- Per-user fresh
```

### 17.4 Performance considerations

```
Connected Content trade-offs:
- More personalized (good)
- More API calls (cost)
- Slower email rendering (if API slow)
- Fallback needed (if API down)
- Cache strategically
   ↓
Use selectively for max value
```

---

## 18. Catalogues management flow

### 18.1 Catalogue setup

```
Step 1: Define schema
- Product / content structure
- Required attributes
- Optional attributes

Step 2: Upload data
- CSV upload
- API push
- Webhook updates
- Periodic sync

Step 3: Reference in templates
- Liquid loops
- Per-user product picks
- Dynamic feeds
```

### 18.2 Catalogue update flow

```
Customer's product database changes:
- New products added
- Prices updated
- Inventory levels change
- Categories adjusted
   ↓
Sync to Braze:
- API push (real-time)
- Scheduled sync (hourly/daily)
- CSV re-upload
   ↓
Braze catalog updated
   ↓
Next email send uses fresh data
   ↓
Or Connected Content for real-time at open
```

### 18.3 Recommendation flow

Per FinancialContent:
> *"AI Recommendation Engine: Beta version uses ML for personalized item recommendations."*

```
AI Recommendation flow:

User profile (events + attributes)
   ↓
Catalogue data (products available)
   ↓
ML scoring:
- Per-user-per-product score
- Behavioral patterns
- Similar users
- Trends
   ↓
Top-N recommendations returned
   ↓
Used in:
- Email recommendations section
- Push notifications
- IAM
- Content Cards
   ↓
Personalized at scale
```

---

## 19. Currents data streaming flow

### 19.1 Currents architecture

```
Customer enables Currents:
   ↓
Configure destinations:
- Snowflake
- BigQuery
- Redshift
- Databricks
- S3
- Kafka
   ↓
Authentication setup
   ↓
Stream activated
```

### 19.2 Data flow

```
Event happens in Braze:
- Email delivered
- Push opened
- IAM clicked
- User attribute changed
- Canvas progression
- ANY engagement event
   ↓
Real-time stream to:
- Customer's data warehouse
- Or message queue
- Or storage
   ↓
Customer's downstream:
- BI dashboards
- Custom analytics
- ML training data
- Customer 360 view
- Compliance archiving
```

### 19.3 Per GetVero

> *"Braze Currents streams engagement data back out to warehouses in real time. For enterprise teams wanting bidirectional warehouse integration, Braze has closed a significant capability gap."*

### 19.4 Use cases

```
Currents use cases:

Custom analytics:
- All Braze data in warehouse
- Tableau / Looker / Power BI
- Custom KPIs
- Cross-source analysis

Customer 360:
- Braze events + transactional data + CRM
- Single unified view
- Holistic analysis

ML training:
- Engagement data
- Train custom models
- Feed back to Braze segments

Compliance:
- Audit trail
- Long-term storage
- Regulatory requirements

Cross-platform reporting:
- Marketing + Sales + Support data
- Holistic ROI
```

### 19.5 Pricing

```
Currents:
- Enterprise tier feature
- Or add-on
- Volume-based pricing
- Per destination pricing
- Premium add-on
```

---

## 20. Zero-copy Canvas Triggers flow

### 20.1 Zero-copy concept

Per GetVero:
> *"Braze introduced Zero-copy Canvas Triggers in 2025 for direct Snowflake and BigQuery segmentation."*

### 20.2 Setup flow

```
Step 1: Connect Braze to Snowflake / BigQuery
- Auth setup
- Permissions
- Network access

Step 2: Define query
- SQL query on warehouse
- Returns user_ids to trigger
- Real-time or scheduled

Step 3: Configure Canvas
- Add Zero-copy Trigger step
- Reference query
- Schedule frequency

Step 4: Activate
- Canvas monitors warehouse
- Triggers on results
- Real-time response
```

### 20.3 Use case example

```
B2B subscription company:
- Subscription data in Snowflake
- "At risk of churn" flag computed daily
- Real-time updates

Braze Canvas:
- Zero-copy Trigger reads Snowflake
- Identifies "at risk" users
- Fires retention journey:
  - Personalized email
  - In-app message
  - Maybe SMS
- Monitors engagement
- Adapts based on response
   ↓
No data duplication
Real-time response
Single source of truth (Snowflake)
```

### 20.4 Benefits

```
Zero-copy advantages:
- No data duplication
- Always fresh data
- Single source of truth
- Reduces ETL costs
- Real-time decisions
- Lower storage costs (no 2x data)
- Faster setup (no sync)
```

---

## 21. Segmentation + Predictive AI flow

### 21.1 Segmentation flow

```
Step 1: Identify segment purpose
- Campaign targeting
- Canvas eligibility
- Reporting cohort
- Personalization audience

Step 2: Build segment
- UI builder (visual)
- OR: SQL Query Builder
- OR: AI suggestion (Smarter Segments)
- Define conditions:
  - User attributes
  - Custom events (frequency, recency)
  - Computed fields
  - Time ranges
  - Multiple conditions (AND/OR)

Step 3: Real-time evaluation
- Segments update continuously
- User added when conditions met
- User removed when conditions not met

Step 4: Use segment
- Campaign audience
- Canvas trigger
- Suppression list
- Personalization audience

Step 5: Monitor
- Segment size over time
- Membership flow
- Performance per segment
```

### 21.2 Predictive segments

```
Predictive AI segments:
- Churn risk (likely to leave)
- High LTV potential
- Engagement decay
- Conversion likelihood
- Best channel preference
   ↓
ML-computed continuously
Per-user scores
Used for targeted campaigns
```

### 21.3 Smarter Segments (AI suggestions)

```
AI analyzes data:
- Behavioral patterns
- Correlations
- High-value cohorts
   ↓
Suggests segments to marketer:
- "Users who bought twice + browse weekly"
- "High-LTV iOS users from California"
- "At-risk users in last 30 days"
   ↓
Marketer reviews + activates
Discovers segments humans miss
```

### 21.4 Message prioritization

Per FinancialContent:
> *"...automated identity resolution, and message prioritization."*

```
Message prioritization:
- Multiple campaigns eligible per user
- Conflict resolution needed
- AI determines priority:
  - Critical (transactional) > marketing
  - Time-sensitive > evergreen
  - High-value > low-value
- Frequency capping respected
- User experience optimized
```

---

## 22. Customer Engagement lifecycle

### 22.1 Lifecycle stages

```
Customer lifecycle in Braze:

1. Acquisition
   - First visit
   - Anonymous tracking
   - First touchpoint

2. Activation
   - Account created
   - Identity resolved
   - First app open / engagement

3. Onboarding
   - Welcome series
   - Feature discovery
   - First purchase
   - Habit formation

4. Engagement
   - Regular usage
   - Repeat purchases
   - Loyalty building

5. Retention
   - Re-engagement campaigns
   - At-risk identification
   - Win-back programs

6. Loyalty
   - VIP treatment
   - Personalization
   - Brand advocacy

7. Reactivation
   - Lapsed users
   - Win-back
   - New value proposition

8. Churn / Exit
   - Final unsubscribe
   - Inactive removal
   - GDPR delete
```

### 22.2 Canvas per stage

```
Stage-specific Canvases:

Onboarding Canvas:
- Welcome series (email)
- Feature tutorials (IAM)
- First-time UX (push reminders)
- Progress tracking

Activation Canvas:
- First purchase incentive
- Habit-building sequence
- Engagement reminders

Loyalty Canvas:
- VIP recognition
- Exclusive offers
- Tier progression
- Personalized recommendations

Re-engagement Canvas:
- Lapsed user detection
- Win-back offers
- Channel preferences
- Final notice
```

### 22.3 Per oficiální

> *"Customer Engagement Platform addresses the need for coordinated, data-driven engagement by facilitating the delivery of consistent and personalized experiences that support user retention, conversion, and lifecycle management."*

---

## 23. Analytics + Reporting flow

### 23.1 Analytics dashboard

```
Braze analytics levels:
- Campaign analytics
- Canvas analytics
- Channel performance
- Segment analytics
- User analytics (individual)
- AI feature analytics
- Custom reports
```

### 23.2 Real-time reporting

```
Real-time metrics:
- Sent count
- Delivered
- Opened (caveats: Apple Mail Privacy)
- Clicked
- Converted
- Revenue attributed
- Per-channel breakdown
- Per-variant comparison
```

### 23.3 Per Research.com

> *"Real-time analytics and reporting are central to Braze, providing immediate visibility into campaign performance metrics such as click-through rates, conversions, and engagement. This allows businesses to quickly adjust tactics and optimize messaging for improved results."*

### 23.4 Custom reports

```
Custom reports for:
- Executive dashboards
- Department-specific
- Campaign deep-dives
- Cohort analysis
- Funnel analysis
- Attribution modeling
- ROI calculation
```

### 23.5 Export options

```
Data export:
- CSV downloads
- API access (REST)
- Currents (real-time streaming)
- Scheduled reports (email)
- BI tool integration (via warehouse)
```

### 23.6 Per Gartner reviewer

> *"making complex tech comprehensible for non-tech team members"*

⚠️ Reports designed for both technical and non-technical users.

---

## 24. ROI measurement (Forrester TEI 457%)

### 24.1 Forrester TEI methodology

```
Forrester TEI study:
- Customer interviews
- Composite organization
- 3-year analysis
- Costs vs. benefits
- Risk-adjusted
- Independent third party
```

### 24.2 Braze ROI claim

> *"Forrester TEI: 457% ROI, payback < 6 months"*

### 24.3 ROI drivers

```
Braze ROI sources:

Revenue impact:
- Higher conversion rates
- Better retention
- Cross-sell uplift
- Upsell success
- Win-back revenue

Cost reduction:
- Marketing team efficiency (AI)
- Tool consolidation (13 channels in 1)
- Reduced agency dependency
- Faster campaign creation (Operator)
- Lower engineering needs

Productivity gains:
- Marketing ops efficiency
- AI-assisted creation
- Automated optimization
- Pre-built journeys

Risk reduction:
- Better compliance (GDPR built-in)
- Enterprise-grade security
- Single vendor stability (public company)
```

### 24.4 Customer ROI examples

Per oficiální:

**Bazaar:** 21% revenue increase from real-time restock journeys

**Wellhub:** 25% net-new revenue from campaign, 70% click rates, 3X sign-up volume, up to 5% conversion increase

**Tonies:** 117% increase in free-to-paid conversions

**Erewhon:** 20% lift in mobile order engagement, ~50% recipients place mobile order within 90 days, ~2X volume increase, ~33% campaign stand-up time reduction

**Panera Bread:** 50+ hours saved through automated content creation

### 24.5 ROI calculation flow

```
Customer ROI tracking:

Step 1: Baseline establishment
- Pre-Braze metrics
- Current performance
- Operational costs

Step 2: Goal setting
- Specific KPIs
- Target improvements
- Timeline

Step 3: Ongoing measurement
- Real-time analytics
- Cohort comparison
- Attribution modeling

Step 4: Quarterly reviews
- Performance vs. baseline
- ROI calculation
- Optimization opportunities
- Strategic adjustments

Step 5: Annual review
- Full-year ROI
- Renewal justification
- Expansion decisions
```

---

## 25. Multi-workspace / multi-brand flow

### 25.1 Multi-workspace architecture

```
Enterprise tier feature:
- Multiple workspaces
- Per-brand isolation
- Per-region isolation
- Per-environment (prod, staging)
```

### 25.2 Use cases

```
Multi-brand company:
- Brand A workspace
- Brand B workspace
- Brand C workspace
   ↓
Each:
- Separate users
- Separate data
- Separate campaigns
- Separate analytics
- Shared compliance
   ↓
Centralized management option

Multi-region:
- US workspace
- EU workspace (data residency)
- APAC workspace
   ↓
Compliance per region
Localized campaigns

Per-environment:
- Production workspace
- Staging workspace
- Sandbox for testing
   ↓
Safe testing
No production impact
```

### 25.3 Per Gartner reviewer

> *"duplication between different workspaces"*

⚠️ Workspaces support content duplication for efficiency.

### 25.4 Workspace management

```
Workspace admin can:
- Add/remove users
- Configure SSO
- Set permissions
- Manage integrations
- Configure API keys
- Monitor usage
- Review billing
```

---

## 26. GDPR / CCPA compliance flow

### 26.1 Per FinancialContent

> *"Compliance and Security: Robust measures and compliance with global regulations (GDPR, CCPA, HIPAA) to ensure data protection and privacy."*

### 26.2 Right to Be Forgotten flow

```
User requests deletion:
   ↓
Customer system flags request
   ↓
API call to Braze:
- POST /users/delete
- user_id provided
   ↓
Braze:
- Marks user for deletion
- Removes from active data
- Anonymizes events
- Adds to permanent suppression
- Audit log entry
   ↓
Confirmation returned
   ↓
GDPR / CCPA compliance maintained
```

### 26.3 DSAR (Data Subject Access Request)

```
DSAR flow:
   ↓
User requests their data
   ↓
Customer system → Braze API
- GET /users/{user_id}/export
   ↓
Braze:
- Compiles user profile
- All attributes
- All events
- All campaigns received
- Returns JSON export
   ↓
Customer provides to user
- Within regulatory timeframes
- 30 days GDPR
```

### 26.4 Consent management

```
Consent tracking:
- Marketing consent (per channel)
- Push notification consent
- SMS consent (TCPA)
- WhatsApp opt-in
- Email subscription
- Geo-targeting consent
- Profiling consent
- Personalization consent
   ↓
Per-channel granularity
Audit trail
```

### 26.5 EU data residency

```
EU customers:
- Braze EU cluster available
- Data stored in EU
- GDPR full compliance
- Schrems II considerations
```

---

## 27. Customer Success + Support flow

### 27.1 Customer Success Manager (CSM)

```
CSM responsibilities:
- Account strategic guidance
- Quarterly business reviews
- Goal alignment
- Feature adoption monitoring
- Renewal preparation
- Expansion opportunities
- Customer advocacy
```

### 27.2 Technical Account Manager (TAM)

```
TAM responsibilities:
- Technical guidance
- Integration support
- Best practices
- Architecture review
- Performance optimization
- New feature adoption
- Technical escalations
```

### 27.3 Per Gartner reviewer

> *"strong Customer Success Managers, Team is open for feedback, listens to the Customers and keeps improving the product, helpful in looking for workarounds when something is not available out-of-the-box"*

### 27.4 Support tiers

```
Support tiers:
- Standard (included)
- Premium (add-on)
- Enterprise (custom)
   ↓
Each:
- Different response times
- Different escalation paths
- Different feature access
```

### 27.5 Per Gartner reviewer concern

> *"help tickets becomes less helpful as you grow more experienced - responses do not match expectations/ depth"*

⚠️ Generic responses for advanced users.

### 27.6 Quarterly Business Reviews (QBR)

```
QBR flow:
1. CSM schedules
2. Customer + Braze attend
3. Review:
   - Performance metrics
   - Goal progress
   - Feature adoption
   - ROI calculation
   - Roadmap discussions
4. Identify:
   - Successes to replicate
   - Gaps to address
   - Expansion opportunities
5. Action items + timeline
```

---

## 28. Braze Bonfire community flow

### 28.1 Bonfire community

Per Gartner reviewer:
> *"great community around the product (e.g. Braze Bonfire, all events)"*

```
Braze Bonfire:
- Customer community
- Knowledge sharing
- Best practices
- Feature requests
- Networking
- Local meetups
- Online forums
```

### 28.2 Forge conference

```
Forge = annual Braze conference:
- Keynote announcements
- Product launches (BrazeAI 2025!)
- Customer case studies
- Expert sessions
- Networking
- Training opportunities
   ↓
Major industry event
Customer engagement focus
```

### 28.3 Per Gartner reviewer 10-year experience

> *"I've been working with the platform nearly 10 years, now in my 3rd company using it... great community around the product (e.g. Braze Bonfire, all events)."*

⚠️ **Community loyalty** = customer retention factor.

---

## 29. Datová mapa: co vidí kdo

| Data | Workspace Admin | Manager | Marketer | Analyst | Developer | Braze CSM | End User | API |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Workspace settings | ✅ | view | view | ❌ | view | s consent | ❌ | per scope |
| User management | ✅ | per role | view | view | ❌ | s consent | ❌ | per scope |
| Billing | ✅ | view | ❌ | ❌ | ❌ | s consent | ❌ | – |
| API keys | ✅ | ✅ | view | ❌ | ✅ | s consent | ❌ | – |
| User profiles | ✅ | ✅ | ✅ | view | ✅ | s consent | own (DSAR) | ✅ |
| User attributes | ✅ | ✅ | ✅ | view | ✅ | s consent | own | ✅ |
| Custom events | ✅ | view | view | view | ✅ | s consent | own | ✅ |
| Segments | ✅ | ✅ | ✅ | view | view | s consent | ❌ | per scope |
| Campaigns | ✅ | ✅ | ✅ | view | view | s consent | ❌ | per scope |
| Canvases | ✅ | ✅ | ✅ | view | view | s consent | ❌ | per scope |
| Templates | ✅ | ✅ | ✅ | view | view | s consent | ❌ | per scope |
| Catalogues | ✅ | ✅ | view | view | ✅ | s consent | ❌ | ✅ |
| Connected Content | ✅ | ✅ | view | ❌ | ✅ | s consent | ❌ | ✅ |
| BrazeAI usage | ✅ | view | view | view | view | s consent | ❌ | per scope |
| Decisioning Studio | ✅ | ✅ | ✅ | view | view | s consent | ❌ | per scope |
| Currents config | ✅ | view | ❌ | ❌ | ✅ | s consent | ❌ | per scope |
| Currents data | ✅ | view | view | ✅ | ✅ | – | own | ✅ |
| Analytics | ✅ | ✅ | ✅ | ✅ | view | s consent | own | per scope |
| Reports | ✅ | ✅ | view | ✅ | view | s consent | ❌ | per scope |
| Integrations | ✅ | ✅ | view | view | ✅ | s consent | ❌ | per scope |
| Audit logs | ✅ | view | ❌ | view | view | s consent | ❌ | per scope |
| Compliance settings | ✅ | view | ❌ | view | view | s consent | ❌ | per scope |

---

## 30. Známé úzkoprofilové místa

### 30.1 NENÍ B2B SaaS

⚠️ **Klíčový limit:**
- Braze = B2C/D2C consumer focus
- B2B SaaS: použij HubSpot / Marketo / Pardot
- B2B SaaS s product engagement: Customer.io / Iterable

### 30.2 NENÍ SMB

⚠️ **Klíčový limit:**
- Enterprise B2C target
- No free plan
- Minimum $60K+/year typical
- Implementation 3-6 months
- SMB: použij Mailchimp / Brevo / Klaviyo SMB

### 30.3 Implementation complexity

```
Implementation challenges:
- 3-6 months typical
- Engineering resources required
- Mobile SDK integration (apps)
- Data architecture decisions
- Custom event design
- $25K-$100K+ implementation cost
   ↓
Not "plug and play"
Significant commitment
```

### 30.4 Canvas complexity at scale

Per GetVero:
> *"Canvas becomes difficult to navigate as journeys grow complex. Braze's ease of setup score on G2 is 7.5/10."*

⚠️ Mature customers struggle s:
- 50+ Canvases governance
- Visual navigation
- Documentation
- Owner tracking
- Naming conventions

### 30.5 Per G2 usability issues

> *"In the Audience Path: when we apply a filter and need to repeat the same filter by changing just one detail in the field, we have to redo it in all fields because there is no option to copy and paste. In the Canvas, we also cannot select and copy to paste in another part of the same canvas."*

⚠️ UX productivity issues:
- No copy/paste in filters
- No multi-select
- Canvas duplication limited
- Repetitive work required

### 30.6 Data point billing surprises

Per GetVero:
> *"Common Braze criticism: unexpected data point billing overages."*

⚠️ **Billing complexity:**
- Custom events billable
- High-frequency tracking risk
- Hard to predict upfront
- Need careful event design

### 30.7 AI pricing unpredictability

Per G2:
> *"the credit-based consumption or 'AI-utility' pricing can become unpredictable"*

⚠️ AI features = additional credits = budget unpredictability.

### 30.8 AI integration v testing phase

Per G2:
> *"the AI integration in in testing phase and there are some bugs in the outpur"*

⚠️ Newer AI features need human review.

### 30.9 Help tickets quality

Per Gartner:
> *"help tickets becomes less helpful as you grow more experienced"*

⚠️ Generic responses for advanced users.

### 30.10 Pace of updates

Per Gartner:
> *"pace of updates can be hard to follow"*

⚠️ Rapid product development = training challenges.

### 30.11 Dashboard customization limited

Per Gartner:
> *"dashboard customisation per relevant features or per user role would be helpful"*

⚠️ Per-role customization gaps.

### 30.12 Uneven development focus

Per Gartner:
> *"uneven development focus - newer features get attention while existing limitations remain"*

⚠️ AI features prioritized, older issues persist.

### 30.13 Mobile-first bias

```
Strengths:
- Mobile apps + push
- In-app messages
- Real-time mobile triggers

Weaknesses:
- Web-only businesses suboptimal
- Email-only overkill
```

### 30.14 Migration challenges

Per G2:
> *"Braze handles things like dynamic fields and user journeys differently compared to our previous provider"*

⚠️ Different paradigm = re-training, re-architecting.

### 30.15 Higher cost barrier

Per Vendr:
- $80K-$1M+/year typical
- Implementation $25K-$100K+
- AI credits additional
- Currents add-on additional
   ↓
Prohibitive pro most companies

---

## 31. Doporučení pro design vlastních procesů

### Pro Braze users obecně:

1. **B2C / D2C / mobile-first** profile confirmation
2. **MAU planning** (hundreds of thousands → millions)
3. **Dedicated marketing ops team** (essential)
4. **Implementation budget** ($25K-$100K+, 3-6 months)
5. **Mobile SDK integration** (engineering capacity)
6. **Data model design** (custom events strategically!)
7. **Catalogue setup** (product data flow)
8. **Connected Content endpoints** (API performance)
9. **Authentication setup** (SPF/DKIM/DMARC)
10. **Multi-stream / multi-workspace** (multi-brand)
11. **BrazeAI rollout strategy** (phased)
12. **Decisioning Studio activation** (Pro+ tier)
13. **Currents** (Enterprise data warehouse needs)
14. **Zero-copy Canvas Triggers** (warehouse direct)
15. **Migration plan** (if from competitor)
16. **Training programs** (continuous)
17. **Braze Bonfire community** (engage!)
18. **Forge conference** (annual attendance)
19. **QBR cadence** (quarterly with CSM)
20. **Forrester TEI ROI** measurement

### Pro enterprise customers:

1. **Multi-workspace** architecture
2. **Multiple dedicated IPs**
3. **Premium support tier**
4. **Custom SLA**
5. **DPA** signed
6. **EU data residency** (if EU customer)
7. **Compliance audit** capability
8. **Advanced segmentation** strategy
9. **Custom integrations** roadmap
10. **Strategic partnership** with Braze

### Pro AI-forward customers:

1. **BrazeAI Suite** full activation
2. **Decisioning Studio** for major campaigns
3. **Agent Console** for content + decisions
4. **Operator** for marketing team efficiency
5. **Liquid Assistant** for complex personalization
6. **AI Content QA** for brand consistency
7. **Smarter Segments** for discovery
8. **Recommendation Engine** for products
9. **Intelligent Timing** + **Selection**
10. **OfferFit integration** (Agentic AI)

### Pro mobile-first companies:

1. **Mobile SDK** quality integration
2. **Push notification** strategy
3. **In-App Messages** ownership (marketing)
4. **Content Cards** for persistent comms
5. **Identity resolution** done right
6. **Cross-device** tracking
7. **App version** compatibility
8. **Deep linking** strategy
9. **iOS vs Android** considerations
10. **Permission management** (push opt-in)

### Pro cross-channel orchestrators:

1. **13 channels** strategic use
2. **Canvas multi-channel** journeys
3. **Frequency capping** cross-channel
4. **Intelligent Channel** (AI selection)
5. **Channel sequencing** logic
6. **Per-user channel** preferences
7. **WhatsApp Commerce** for B2C
8. **RCS** future-forward
9. **LINE** for Asian markets
10. **Connected TV** emerging channel

---

*Dokument zpracován z oficiálních zdrojů braze.com a praktických zdrojů (Gartner Peer Insights, G2, Vendr, SelectHub, Research.com, GetVero, AIChief, FinancialContent). Pro nejaktuálnější detaily je nutný engagement s Braze sales / consultant teamem.*
