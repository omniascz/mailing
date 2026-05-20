# Braze – hloubková analýza funkcí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Zdroje:** oficiální dokumentace braze.com + analytické weby (Gartner Peer Insights, G2, Vendr, SelectHub, Research.com, GetVero, AIChief, FinancialContent) ověřené v dubnu–květnu 2026.
**Rozsah:** kompletní funkcionalita platformy v roce 2026 – BrazeAI™ Suite (Decisioning Studio, Agent Console, Operator, Liquid Assistant), Canvas orchestration, 13 channels (email, mobile, web, SMS, WhatsApp, RCS, etc.), real-time stream processing, Connected Content, Catalogues, Currents, SQL Query Builder s AI, OfferFit acquisition Agentic AI direction.

> **Důležitý kontext:** Braze (NASDAQ: BRZE) je **publicly traded customer engagement platform leader** pro B2C / mobile-first brands. **Není to "marketing automation tool"** – je to **Customer Engagement Platform (CEP)** s real-time stream processing architecture.
>
> **Pozice:** **Leader Gartner Magic Quadrant 2025** (3rd consecutive year), **#1 G2 Push Notification Grid**, **Leader 2023 IDC MarketScape**. **Voted G2 "Best of Marketing and Digital Advertising Software Product" 2025**.
>
> **Velikost:** **Customer base examples:** Microsoft, Etsy, HBO Max, Grubhub, McDonald's, Burger King, NBA, Panera Bread, Erewhon, Wellhub, Tonies, Bazaar.
>
> **Klíčové diferenciátory:**
>
> - **BrazeAI™ Suite** – AI-native orchestration (NE jen AI-assisted!)
> - **13 digital channels** podpora (z jediné platformy)
> - **Real-time stream processing** (NE batch!)
> - **Sub-second latency** at scale
> - **Canvas Flow** – nejvyspělejší journey builder v kategorii
> - **BrazeAI Decisioning Studio** – reinforcement learning místo A/B testing
> - **BrazeAI Agent Console** – custom AI agents v Canvas
> - **BrazeAI Operator** – conversational natural-language interface
> - **OfferFit acquisition** ($303.2M, 2025) → Agentic AI direction
> - **Connected Content** – API-driven dynamic personalization
> - **Catalogues** – product/content catalog management
> - **Currents** – real-time data streaming out
> - **SQL Query Builder s AI assistant**
> - **Zero-copy Canvas Triggers** (Snowflake, BigQuery direct)
> - **ChatGPT Native App SDK**
> - **Value-based pricing** (zveřejněno Jan 29, 2026)
> - **Platform Editions + Active Users + Flexible Credits**
> - **13-15% revenue invested in R&D**
> - **Q3 FY2026 BrazeAI Decisioning Studio:** $4.8M revenue contribution
>
> **Filozofie:** _"Be Absolutely Engaging™"_ – Braze umožňuje brands turn action into interaction through autonomous, 1:1 personalized experiences.

---

## Obsah

1. [Co je Braze a pro koho je](#1-co-je-braze)
2. [Tarify a pricing (value-based)](#2-tarify)
3. [Klíčové diferenciátory vs. competitors](#3-diferenciatory)
4. [BrazeAI™ Suite (kompletní)](#4-brazeai-suite)
5. [BrazeAI Decisioning Studio (reinforcement learning)](#5-decisioning-studio)
6. [BrazeAI Agent Console (custom AI agents)](#6-agent-console)
7. [BrazeAI Operator (conversational interface)](#7-operator)
8. [BrazeAI Liquid Assistant](#8-liquid-assistant)
9. [Canvas (journey orchestration)](#9-canvas)
10. [13 digital channels overview](#10-channels-overview)
11. [Email channel](#11-email)
12. [Push notifications + Mobile](#12-push-mobile)
13. [In-App Messages + Content Cards](#13-iam-content-cards)
14. [SMS + WhatsApp + RCS](#14-sms-whatsapp-rcs)
15. [Connected TV, Paid Media, Web](#15-other-channels)
16. [Real-time stream processing architecture](#16-stream-processing)
17. [Connected Content (API-driven personalization)](#17-connected-content)
18. [Catalogues (product/content management)](#18-catalogues)
19. [Currents (real-time data streaming)](#19-currents)
20. [SQL Query Builder + Liquid templating](#20-sql-liquid)
21. [Zero-copy Canvas Triggers](#21-zero-copy)
22. [Segmentation a Predictive AI](#22-segmentation)
23. [OfferFit acquisition (Agentic AI)](#23-offerfit)
24. [Integrace + APIs + SDKs](#24-integrace)
25. [Forrester TEI ROI metrics](#25-roi)
26. [Compliance, GDPR, security](#26-compliance)
27. [Reference customers (Microsoft, HBO Max, etc.)](#27-customers)
28. [Limity a nedostatky](#28-limity)

---

## 1. Co je Braze

- **Společnost:** Braze, Inc.
- **Ticker:** **NASDAQ: BRZE** (publicly traded)
- **HQ:** New York City, USA
- **Industry:** Customer Engagement Platform (CEP)
- **Pozice:** **Leader Gartner Magic Quadrant 2025** (3rd consecutive year)
- **Acquisitions:** **OfferFit** ($303.2M, 2025 - Agentic AI)
- **R&D investment:** **13-15% of revenue** (per FinancialContent analysis)
- **Q4 FY2026 revenue guidance:** **$197.5M-$198.5M** (23% YoY growth)
- **FY2026 revenue guidance:** **$730.5M-$731.5M**
- **FY2026 adjusted EPS guidance:** **$0.42-$0.43**
- **FY2027 target:** **8% non-GAAP operating income margin**
- **Web:** braze.com

### Filozofie produktu

Per oficiální (G2):

> _"Braze is the leading customer engagement platform that empowers brands to Be Absolutely Engaging.™ Braze helps brands deliver great customer experiences that drive value both for consumers and for their businesses. Built on a foundation of composable intelligence, BrazeAI™ allows marketers to combine and activate AI agents, models, and features at every touchpoint throughout the Braze Customer Engagement Platform for smarter, faster, and more meaningful customer engagement."_

> _"From cross-channel messaging and journey orchestration to AI-powered decisioning and optimization, Braze enables companies to turn action into interaction through autonomous, 1:1 personalized experiences."_

### Co Braze JE

Per oficiální:

> _"Braze is a customer engagement platform that powers lasting connections between consumers and brands they love. Braze allows any marketer to collect and take action on any amount of data from any source, so they can creatively engage with customers in real time, across channels from one platform."_

**Klíčové:**

- **Customer Engagement Platform** (NE marketing automation tool)
- **Real-time** focus (NE batch processing)
- **Cross-channel orchestration** (13 channels z jediné platformy)
- **AI-native** (NE jen AI features bolt-on)
- **B2C / mobile-first** focus
- **Mid-to-large enterprises** primary target

### Pro koho je

```
Cílový profil:
- Mid-market + Enterprise (B2C / D2C / consumer apps)
- Mobile-first / app-driven companies
- Retail, media, gaming, travel, financial services
- Hundreds of thousands → millions MAUs
- Real-time personalization requirement
- Cross-channel messaging strategy
- Marketing operations team (dedicated)
- Budget $60K+/year typical
- Implementation timeline 3-6 months
```

### Per GetVero analysis

> _"Your MAU count is in the hundreds of thousands or millions and you need real-time personalization at that scale. You need RCS, LINE, or WhatsApp Commerce — channels Customer.io doesn't offer. BrazeAI Decisioning Studio is a genuine requirement, not just a nice-to-have. You have (or plan to hire) a dedicated marketing operations team. You're in retail, media, gaming, travel, or financial services at enterprise scale. Your budget is $60K+/year and your implementation timeline is flexible."_

### Per Research.com use cases

```
Marketing Teams: Automate personalized, data-driven campaigns
across multiple channels to improve customer engagement and retention.

Customer Success Managers: Use customer behavior insights to build
targeted communication strategies for better outcomes.

Product Teams: Leverage in-app messaging and push notifications
to keep users engaged with the app and enhance the user experience.

Data Analysts: Access deep segmentation and analytics tools to
analyze customer data and optimize campaign performance.

Growth Teams: Scale personalized engagement campaigns, use A/B
testing to optimize campaigns, and increase customer lifetime value.
```

```
┌─────────────────────────────────────────────────────────────────┐
│                  BRAZE PLATFORM (NASDAQ: BRZE)                  │
│              Customer Engagement Platform · Leader 2025         │
│              "Be Absolutely Engaging™"                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ BrazeAI™ Suite │  │ Canvas       │  │ Campaigns       │      │
│  │ - Decisioning  │  │ Orchestration│  │ (single +       │      │
│  │   Studio       │  │ (journey     │  │  multi-channel) │      │
│  │ - Agent        │  │  builder)    │  │                 │      │
│  │   Console      │  │              │  │                 │      │
│  │ - Operator     │  │              │  │                 │      │
│  │ - Liquid       │  │              │  │                 │      │
│  │   Assistant    │  │              │  │                 │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │             13 DIGITAL CHANNELS (one platform!)            │ │
│  │  Email · Push · In-App · Content Cards · SMS · WhatsApp ·  │ │
│  │  RCS · LINE · Web · Connected TV · Paid Media · Webhooks · │ │
│  │  ChatGPT Native App SDK                                    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Connected      │  │ Catalogues   │  │ Currents        │      │
│  │ Content        │  │ (product/    │  │ (data streaming │      │
│  │ (API-driven    │  │  content     │  │  to warehouses) │      │
│  │  personaliz.)  │  │  catalogs)   │  │                 │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ SQL Query      │  │ Zero-copy    │  │ Predictive AI   │      │
│  │ Builder        │  │ Canvas       │  │ + ML            │      │
│  │ s AI assistant │  │ Triggers     │  │ Recommendations │      │
│  │                │  │ (Snowflake,  │  │                 │      │
│  │                │  │  BigQuery)   │  │                 │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Liquid         │  │ Real-time    │  │ OfferFit        │      │
│  │ templating     │  │ stream       │  │ acquisition     │      │
│  │ + personali-   │  │ processing   │  │ ($303.2M, 2025  │      │
│  │ zation         │  │ (sub-second  │  │  Agentic AI)    │      │
│  │                │  │  latency)    │  │                 │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│   PRICING (per Vendr, January 29, 2026 public launch):          │
│   - Value-based pricing                                         │
│   - Platform Editions + Active Users + Flexible Credits         │
│   - Core / Pro / Enterprise tiers                               │
│   - Pro: $80K-$250K/year (per Vendr)                            │
│   - Enterprise 2M+ MAUs: $300K-$1M+/year                        │
│   - Implementation: $25K-$100K+ (3-6 months)                    │
│   - No permanent free plan                                      │
├─────────────────────────────────────────────────────────────────┤
│   RECOGNITION:                                                  │
│   - Leader 2025 Gartner Magic Quadrant (3rd year)               │
│   - #1 G2 Push Notification Grid                                │
│   - Leader 2023 IDC MarketScape                                 │
│   - G2 "Best of Marketing and Digital Advertising 2025"         │
│   - Forrester TEI: 457% ROI, payback < 6 months                 │
├─────────────────────────────────────────────────────────────────┤
│   CUSTOMER EXAMPLES:                                            │
│   Microsoft · Etsy · HBO Max · Grubhub · McDonald's · NBA ·     │
│   Burger King · Panera Bread · Erewhon · Wellhub · Tonies       │
└─────────────────────────────────────────────────────────────────┘
```

### Typické use cases

- **DTC retail brands** (Erewhon, Bazaar)
- **Streaming services** (HBO Max)
- **Food delivery** (Grubhub, McDonald's, Burger King)
- **Sports / Media** (NBA)
- **Fitness apps** (Wellhub)
- **Consumer products** (Tonies)
- **Restaurant chains** (Panera Bread)
- **Mobile apps general**
- **Gaming companies**
- **Travel + hospitality**
- **Financial services B2C**

---

## 2. Tarify a pricing (value-based)

### 2.1 Value-based pricing (zveřejněno Jan 29, 2026)

Per Vendr:

> _"Braze pricing is structured around monthly active users (MAUs) and message volume, with costs scaling based on your audience size and engagement intensity. The platform offers multiple tiers—typically Core, Pro, and Enterprise—each unlocking additional features, channels, and support levels."_

### 2.2 Pricing dimensions

```
Braze value-based pricing dimensions:
1. Platform Edition (Core / Pro / Enterprise)
2. Active Users (MAUs)
3. Flexible Credits (message volume + AI usage)
```

### 2.3 Tier overview

#### Braze Core (entry-level)

- Email
- Push notifications
- In-app messaging
- Basic segmentation
- Campaign tools
- **Suitable for:** Companies beginning customer engagement journey

#### Braze Pro (mid-tier)

- Canvas Flow (multi-step journey orchestration)
- Braze Intelligence Suite (predictive analytics, send-time optimization)
- SMS channel
- Webhooks
- Enhanced segmentation
- **Suitable for:** Growth-stage companies, mid-market brands
- **Pricing:** **$80,000-$250,000/year** (per Vendr)

#### Braze Enterprise (top-tier)

- Vše z Pro
- **Braze Currents** (real-time data streaming)
- Multiple workspaces
- Dedicated customer success
- Premium support
- Custom SLAs
- Advanced personalization capabilities
- **Designed for:** Large-scale, multi-channel deployments

### 2.4 Vendr enterprise data

Per Vendr:

- **Enterprise (2M+ MAUs):** $300K-$1M+/year
- **Mid-market (500K-1.5M MAUs):** Pro tier negotiation
- **Implementation:** $25K-$100K+ one-time
- **Implementation duration:** 3-6 months

### 2.5 Per AIChief

> _"Braze does not offer a free plan, but it operates on custom pricing based on usage volume, feature access, and integration requirements."_

### 2.6 Data point billing

Per GetVero:

> _"Braze bills on data points. Every custom event, attribute, or purchase logged to a user profile counts as a billable unit. Standard engagement data — email opens, push clicks — doesn't count, but custom data does. Teams with high-frequency event tracking can burn through their allocation faster than expected."_

⚠️ **Critical billing detail:**

- **Standard engagement data:** Free (opens, clicks)
- **Custom data:** Billable (custom events, attributes, purchases)
- **High-frequency event tracking:** Risk of overage

### 2.7 Pricing factors

Per Vendr:

```
Cost factors:
- Platform fee (recurring base for platform access + baseline MAU)
- MAU overages (charges when contracted threshold exceeded)
- Message volume (some contracts have send limits, then overage)
- Feature tier (Pro/Enterprise unlocks advanced)
- Add-ons:
  - Braze Currents (data streaming)
  - Additional workspaces
  - Premium onboarding
  - Dedicated customer success
```

### 2.8 Add-on modules

```
Common add-ons:
- Braze Currents (Enterprise+)
- Additional workspaces (multi-brand)
- Premium onboarding
- Dedicated customer success manager
- Premium support
- Custom SLAs
- BrazeAI advanced features (credit-based)
```

### 2.9 Negotiation tactics

Per Vendr:

> _"Multi-year commitments and competitive evaluations commonly yield discounts off list pricing. Buyers who negotiate MAU overage rates and message volume caps upfront often achieve more predictable total costs."_

> _"In Vendr's dataset, buyers with 500K–1.5M MAUs on Pro tier contracts often secure pricing through volume-based negotiation and competitive leverage."_

### 2.10 Vs. competitors (Vendr data)

| Vendor            | Approach              | Pricing model                          |
| ----------------- | --------------------- | -------------------------------------- |
| **Braze**         | CEP leader            | Value-based: Platform + MAUs + Credits |
| **Iterable**      | Competitive alt       | MAU-based, often more cost-effective   |
| **Klaviyo**       | DTC e-commerce        | Contact-based                          |
| **Customer.io**   | Product team-friendly | No data point limits                   |
| **Salesforce MC** | Enterprise suite      | Custom enterprise                      |

### 2.11 G2 reviewer concerns

> _"As we lean more into Agentic workflows and AI-driven orchestration, the credit-based consumption or 'AI-utility' pricing can become unpredictable."_

> _"Pricing has not been improved yet, the AI integration in in testing phase and there are some bugs in the outpur, Recommend to human verify the outputs."_

---

## 3. Klíčové diferenciátory vs. competitors

### 3.1 BrazeAI™ Suite (composable intelligence)

Per oficiální:

> _"Built on a foundation of composable intelligence, BrazeAI™ allows marketers to combine and activate AI agents, models, and features at every touchpoint throughout the Braze Customer Engagement Platform."_

⚠️ **AI-native** (NE jen AI features přidaný k existing platformě)

### 3.2 13 digital channels

Per FinancialContent:

> _"Customer Engagement Platform (CEP): The core offering, providing real-time personalization and cross-channel messaging across 13 digital channels (mobile, web, email, SMS, connected TV, etc.)."_

⚠️ **Most channels v kategorii:**

- Vs. Klaviyo: ~6 channels
- Vs. Mailchimp: ~5 channels
- Vs. Customer.io: ~8 channels
- **Vs. Braze: 13 channels**

### 3.3 Real-time stream processing

Per FinancialContent:

> _"Real-Time Data Processing: Proprietary stream processing architecture for instant data processing, enabling truly real-time engagement."_

Per oficiální:

> _"Feel confident with a platform that operates with sub-second latency, regardless of your data and send volumes."_

⚠️ **NE batch processing** (jako mnoho ESP):

- **Sub-second latency**
- **Stream architecture**
- **Truly real-time** trigger to delivery
- **Critical for** apps, gaming, time-sensitive offers

### 3.4 Canvas (most mature journey builder)

Per GetVero:

> _"Braze Canvas is the most mature journey builder in the category. It includes Action Paths, Audience Paths, Experiment Paths, Delay Steps, and Message Steps. Canvas handles the most complex multi-channel, multi-step journeys that enterprise marketing teams run."_

### 3.5 BrazeAI Decisioning Studio (vs. A/B testing)

Per G2 reviewer:

> _"Braze continues to outpace the market by shifting from simple automation to true AI-native orchestration. In 2026, the standout feature is definitely the BrazeAI™ Decisioning Studio. Unlike old-school A/B testing, it uses reinforcement learning to autonomously decide the best channel, timing, and offer for each user in real-time."_

⚠️ **Reinforcement learning** místo:

- Manual A/B testing
- Pre-set winner selection
- Static decision rules

### 3.6 OfferFit acquisition ($303.2M)

Per FinancialContent:

> _"A significant growth driver is Braze's strategic focus on artificial intelligence (AI), exemplified by the acquisition of OfferFit for approximately $303.2 million, which bolsters its AI capabilities."_

⚠️ **Major AI acquisition 2025:**

- **OfferFit** = AI experimentation platform
- **$303.2M** acquisition value
- **Agentic AI direction** strengthened
- **Reinforcement learning** specialist

### 3.7 BrazeAI Q3 FY2026 revenue impact

Per FinancialContent:

> _"BrazeAI Decisioning Studio contributed $4.8 million in revenue during Q3 FY2026."_

⚠️ **AI monetization** validated:

- **$4.8M/quarter** just od Decisioning Studio
- **AI-utility pricing** model working

### 3.8 Connected Content

Per Gartner reviewer:

> _"Canvas with all the messaging steps available, SQL Query Builder with AI assistant, Drag and Drop editor, duplication between different workspaces, Connected Content, Catalogues, API-Triggered messaging"_

**Connected Content:**

- **API-driven personalization**
- **Real-time content from APIs**
- **Dynamic content blocks**

### 3.9 Zero-copy Canvas Triggers (2025)

Per GetVero:

> _"Braze introduced Zero-copy Canvas Triggers in 2025 for direct Snowflake and BigQuery segmentation."_

⚠️ **Enterprise data warehouse direct:**

- **Snowflake** direct queries
- **BigQuery** direct queries
- **No data duplication**
- **Real-time warehouse triggers**

### 3.10 Vs. konkurence comparison

| Aspect                     | Braze                               | Klaviyo        | Customer.io           | Salesforce MC    | Iterable        |
| -------------------------- | ----------------------------------- | -------------- | --------------------- | ---------------- | --------------- |
| **Focus**                  | B2C / mobile-first CEP              | DTC e-commerce | Product team-friendly | Enterprise suite | Cross-channel   |
| **Channels**               | **13**                              | 6              | 8                     | 10+              | 8               |
| **Architecture**           | **Stream (real-time)**              | Stream         | Stream                | Batch + stream   | Stream          |
| **Journey builder**        | **Canvas (most mature)**            | Flow           | Journeys              | Journey Builder  | Workflow Studio |
| **AI native**              | **Yes (BrazeAI Suite)**             | Klaviyo AI     | LLM actions           | Einstein         | Workflow AI     |
| **Reinforcement learning** | **✅ Decisioning Studio**           | ❌             | ❌                    | Limited          | ❌              |
| **AI Agents**              | **✅ Agent Console**                | ❌             | ❌                    | ❌               | ❌              |
| **MAU billing**            | ✅ + Credits + Data points          | Contacts       | No limits             | Custom           | MAU             |
| **Data warehouse direct**  | **✅ Zero-copy Snowflake/BigQuery** | Limited        | Limited               | Limited          | Limited         |
| **Mobile SDK**             | **✅ Mature (10+ years)**           | Limited        | ✅                    | ✅               | ✅              |
| **WhatsApp Commerce**      | **✅**                              | Limited        | ❌                    | ✅               | Limited         |
| **RCS**                    | **✅**                              | ❌             | ❌                    | ✅               | ❌              |
| **LINE**                   | **✅**                              | ❌             | ❌                    | ✅               | ❌              |
| **Public company**         | ✅ NASDAQ: BRZE                     | ✅ NYSE: KVYO  | ❌ Private            | ✅ CRM           | ❌ Private      |
| **Customer profile**       | Enterprise B2C                      | DTC SMB→Mid    | Product teams         | Enterprise B2B+  | Mid→Enterprise  |

---

## 4. BrazeAI™ Suite (kompletní)

### 4.1 BrazeAI™ overview

Per oficiální:

> _"AI is everywhere—turn it into advantage. With Braze and BrazeAI™, you create faster, test smarter, and keep customer engagement personal at every step."_

> _"Unify and activate your data in real time as fuel for BrazeAI™ to help anticipate customer behavior and to deliver relevant, impactful experiences—all without relying on technical teams."_

### 4.2 BrazeAI components

```
BrazeAI Suite (2026):
├─ BrazeAI Decisioning Studio
│  - Reinforcement learning
│  - Replaces A/B testing
│  - Continuous AI personalization
│  - Optimizes toward any metric automatically
│
├─ BrazeAI Agent Console
│  - Custom AI agents
│  - Deploy v Canvas
│  - Content generation
│  - Data enrichment
│  - Intelligent orchestration
│
├─ BrazeAI Operator
│  - Conversational interface
│  - Natural language → campaigns
│  - Query data via chat
│  - Build campaigns via chat
│
├─ BrazeAI Liquid Assistant
│  - Complex Liquid coding → conversational
│  - Hyper-personalized logic
│  - Dynamic product catalogs in minutes
│
├─ AI Content QA Tool
│  - OpenAI GPT-4 powered
│  - Message quality checks
│  - Brand consistency
│
├─ AI Recommendation Engine (beta)
│  - ML-driven recommendations
│  - Personalized items
│  - Real-time scoring
│
├─ Intelligent Timing
│  - Per-user send time optimization
│  - ML-predicted optimal moments
│
├─ Intelligent Selection
│  - Auto-routes users to winning Canvas variants
│  - Continuous learning
│
├─ Intelligent Channel
│  - Optimal channel per user
│  - Cross-channel orchestration
│
└─ Smarter Segments
   - AI-suggested segments
   - Behavioral pattern detection
```

### 4.3 Launched at Forge 2025

Per GetVero:

> \*"Braze launched three new AI products at Forge 2025:
>
> - BrazeAI Agent Console — create custom agents inside Canvas for content generation, data enrichment, and intelligent orchestration
> - BrazeAI Decisioning Studio — replaces A/B testing with continuous AI personalization that optimizes toward any metric automatically
> - BrazeAI Operator — a conversational, natural-language interface for building campaigns and querying data"\*

⚠️ **Major 2025 launch** = current 2026 standard.

### 4.4 Shift toward AI-managed engagement

Per GetVero:

> _"The Intelligence Suite also includes Intelligent Timing and Intelligent Selection for Canvas. Intelligent Timing predicts optimal send times per user; Intelligent Selection auto-routes users to winning journey variants. Together, they represent a shift toward AI-managed engagement rather than AI-assisted campaign creation."_

⚠️ **AI-managed** ≠ **AI-assisted**:

- AI-assisted: human builds, AI helps
- **AI-managed: AI autonomously decides + executes**
- Reinforcement learning self-improves

### 4.5 G2 reviewer feedback

> _"Braze has integrate with AI into the platform and made our work much more easier by identifying new market opportunities and tailoring our marketing content based on the target segment which makes it more engaging for the users."_

> _"The addition of AI Agents for content QA and localization has also streamlined our global operations, ensuring brand consistency across 10+ languages without manual bottlenecks."_

### 4.6 AI revenue contribution

Per FinancialContent:

- **BrazeAI Decisioning Studio Q3 FY2026:** **$4.8M revenue**
- **AI products monetizing actively**

---

## 5. BrazeAI Decisioning Studio (reinforcement learning)

### 5.1 Core concept

Per GetVero:

> _"BrazeAI Decisioning Studio — replaces A/B testing with continuous AI personalization that optimizes toward any metric automatically"_

Per FinancialContent:

> _"BrazeAI Decisioning Studio: Utilizes reinforcement learning for autonomous campaign optimization based on KPIs."_

### 5.2 Reinforcement learning principle

```
Traditional A/B testing:
   ↓
- Hypothesis: variant A vs variant B
- Split traffic 50/50
- Wait pro statistical significance
- Pick winner
- Push winner 100%
   ↓
Problems:
- Loses time exploring
- Static "winner" until next test
- Multiple variants = exponential complexity
- Doesn't adapt per user

BrazeAI Decisioning Studio:
   ↓
- Continuous learning
- Per-user optimization
- Multi-armed bandit approach
- Automatic exploration vs exploitation
- Reinforcement learning agent
   ↓
Results:
- Optimizes during traffic
- Per-user different decisions
- Many variants tested efficiently
- Continuously adapts
```

### 5.3 What gets optimized

```
Decisioning Studio optimizes:
- Best channel (email vs push vs SMS)
- Best timing (when to send)
- Best content (which variant)
- Best offer (which discount/promotion)
- Best message (subject line, body)
   ↓
Toward any metric:
- Conversion rate
- Revenue
- Engagement
- Retention
- Custom KPI
```

### 5.4 Per G2 reviewer

> _"In 2026, the standout feature is definitely the BrazeAI™ Decisioning Studio. Unlike old-school A/B testing, it uses reinforcement learning to autonomously decide the best channel, timing, and offer for each user in real-time."_

### 5.5 Use case examples

```
Example 1: Retention campaign
- Users at risk of churning
- 5 different incentive offers available
- Decisioning Studio:
  - Tests each per user
  - Learns who responds to what
  - Routes high-value offer to high-value users
  - Routes minor incentive to less-likely converters
- Result: Optimal cost vs. retention

Example 2: Cross-sell
- 20 different products to recommend
- 8 different message variants
- 4 different channels
- Decisioning Studio:
  - Per-user combinatorial optimization
  - Learns continuously
  - Maximizes revenue per user
- Result: Higher cross-sell vs. static rules

Example 3: Onboarding
- New users need conversion
- Multiple paths possible
- Decisioning Studio:
  - Learns optimal sequence per user type
  - Adjusts pacing per response
  - Picks channel based on user behavior
- Result: Higher activation rates
```

### 5.6 Vendr context

Per Vendr:

- **BrazeAI Decisioning Studio** = Pro tier+ feature
- **Credit-based** pricing
- **Additional cost** beyond base platform

### 5.7 OfferFit integration

Per FinancialContent:

- **OfferFit acquisition $303.2M (2025)**
- **OfferFit** = reinforcement learning experimentation
- **Strengthens Decisioning Studio**
- **Agentic AI direction**

---

## 6. BrazeAI Agent Console (custom AI agents)

### 6.1 Concept

Per FinancialContent:

> _"BrazeAI Agent Console: Allows creation and deployment of custom AI agents for automated workflows."_

Per GetVero:

> _"BrazeAI Agent Console — create custom agents inside Canvas for content generation, data enrichment, and intelligent orchestration"_

### 6.2 What agents can do

```
AI Agents v Canvas:
- Content generation
  - Subject lines
  - Body copy
  - Personalized variants
  - Localization (10+ languages)
- Data enrichment
  - Profile augmentation
  - Inferred attributes
  - Behavioral analysis
- Intelligent orchestration
  - Decision-making
  - Routing logic
  - Conditional actions
```

### 6.3 Agent deployment v Canvas

```
Canvas journey s AI Agent step:
   ↓
1. User enters Canvas
   ↓
2. Standard journey logic
   ↓
3. **AI Agent step:**
   - Analyzes user profile
   - Decides next action
   - Generates content
   - Routes to next step
   ↓
4. Personalized continuation
   ↓
5. Conversion / completion
```

### 6.4 Per G2 reviewer

> _"The addition of AI Agents for content QA and localization has also streamlined our global operations, ensuring brand consistency across 10+ languages without manual bottlenecks."_

### 6.5 Use case examples

```
Content QA Agent:
- Reviews drafts before send
- Checks brand voice consistency
- Flags inappropriate content
- Suggests improvements

Localization Agent:
- Translates campaigns to 10+ languages
- Maintains brand voice
- Cultural adaptation
- Format adjustments

Personalization Agent:
- Generates user-specific subject lines
- Creates dynamic body content
- Tailors offers per user
- Real-time decisions

Data Enrichment Agent:
- Infers user attributes from behavior
- Builds richer profiles
- Augments segmentation
- Predicts intent
```

---

## 7. BrazeAI Operator (conversational interface)

### 7.1 Concept

Per GetVero:

> _"BrazeAI Operator — a conversational, natural-language interface for building campaigns and querying data"_

### 7.2 What it does

```
Natural language → action:

"Create a campaign for users who haven't opened
in 30 days, offer 15% off, send via email"
   ↓
BrazeAI Operator:
- Identifies segment definition
- Creates segment
- Builds campaign
- Configures offer
- Sets channel
- Presents draft for approval
- Marketer reviews + activates

"Show me revenue from email campaigns last quarter"
   ↓
BrazeAI Operator:
- Queries data
- Aggregates revenue
- Returns chart/number
- Conversational response
```

### 7.3 Benefits

```
Operator benefits:
- Non-technical marketers empowered
- Faster campaign creation
- Reduced learning curve
- Conversational data queries
- Natural language vs. complex UI
```

### 7.4 Limits

```
Operator limitations:
- AI accuracy varies
- Human review still recommended
- Complex logic still needs UI
- Per G2: "AI integration in testing phase and there are some bugs"
```

---

## 8. BrazeAI Liquid Assistant

### 8.1 Concept

Per G2 reviewer:

> _"I'm also incredibly impressed with the BrazeAI™ Liquid Assistant. It has turned complex Liquid coding into a conversational task, allowing our team to build hyper-personalized logic (like dynamic product catalogs) in minutes rather than hours."_

### 8.2 What is Liquid

```
Liquid = Braze's templating language
   ↓
Used for:
- Variable substitution: {{user.name}}
- Conditional logic: {% if user.country == "US" %}
- Loops: {% for product in catalog %}
- Complex personalization
- Dynamic content blocks
   ↓
Powerful but complex
Steep learning curve
```

### 8.3 Liquid Assistant

```
Marketer's request:
"I want to show different products based on user's
purchase history. If they bought shoes, show
matching socks. If shirts, show pants."
   ↓
BrazeAI Liquid Assistant:
- Translates request to Liquid code
- Generates conditional logic
- Suggests product attributes
- Provides working code
- Explains how it works
   ↓
Marketer:
- Reviews
- Adjusts (if needed)
- Applies to template
   ↓
Hours saved (vs. learning Liquid manually)
```

### 8.4 Benefits

```
Liquid Assistant benefits:
- Non-developer marketers empowered
- Hyper-personalization easier
- Dynamic product catalogs simpler
- Reduced engineering dependency
- Faster experimentation
```

---

## 9. Canvas (journey orchestration)

### 9.1 Per oficiální

Per oficiální:

> _"Design, visualize, and launch dynamic user journeys with intuitive building block components."_

> _"Automatically adapt your engagement strategy with branching logic that guides your audience down specific journey paths based on real-time preferences and behaviors."_

### 9.2 Per GetVero

> _"Braze Canvas is the most mature journey builder in the category. It includes Action Paths, Audience Paths, Experiment Paths, Delay Steps, and Message Steps. Canvas handles the most complex multi-channel, multi-step journeys that enterprise marketing teams run."_

### 9.3 Canvas components

```
Canvas building blocks:
- Action Paths (event-triggered branches)
- Audience Paths (attribute-based branches)
- Experiment Paths (A/B test branches)
- Delay Steps (wait conditions)
- Message Steps (send via channel)
- Trigger Steps (entry points)
- API Triggers
- Webhook Steps
- Decision Splits
- AI Agent Steps (NEW 2025)
- Decisioning Steps (NEW 2025)
```

### 9.4 Canvas Flow

Per Vendr:

> _"Canvas Flow (multi-step journey orchestration)"_

**Canvas Flow features:**

- Visual drag-drop editor
- Multi-channel orchestration
- Real-time triggers
- Branching logic
- A/B variant testing
- Personalization per step
- AI optimization integration

### 9.5 Pre-built journeys

Per oficiální:

> _"Simplify journey orchestration and establish best in class engagement with turnkey, pre-built journeys for key use cases and industries."_

**Pre-built journeys:**

- Welcome series
- Onboarding flows
- Cart abandonment
- Re-engagement
- Retention
- Cross-sell / upsell
- Industry-specific (retail, media, travel, etc.)

### 9.6 Real-time trigger

Per oficiální:

> _"Automatically trigger journeys and messaging based on in-the-moment customer behaviors, cross-channel interactions, and updates happening within your tech stack."_

### 9.7 Bazaar case study

Per oficiální:

> _"Bazaar increased revenue by 21% using Canvas to trigger real-time restock journeys."_

### 9.8 Complexity tradeoff

Per GetVero:

> _"The complexity ceiling is also a usability challenge. G2 reviewers note that Canvas becomes difficult to navigate as journeys grow complex. Braze's ease of setup score on G2 is 7.5/10 — lower than most competitors in the category."_

⚠️ Canvas = powerful BUT complex pro non-experts.

### 9.9 Canvas + AI features (2025+)

```
Canvas s AI:
- AI Agent Steps (Agent Console output)
- Decisioning Studio integration
- Intelligent Timing per user
- Intelligent Selection auto-routing
- Smart segments
- Generative AI content
```

### 9.10 Audience Path usability issue

Per G2 reviewer:

> _"In the Audience Path: when we apply a filter and need to repeat the same filter by changing just one detail in the field, we have to redo it in all fields because there is no option to copy and paste. In the Canvas, we also cannot select and copy to paste in another part of the same canvas, nor can we select multiple items/fields at once."_

⚠️ Known usability limitations.

---

## 10. 13 digital channels overview

### 10.1 Per FinancialContent

> _"Customer Engagement Platform (CEP): The core offering, providing real-time personalization and cross-channel messaging across 13 digital channels (mobile, web, email, SMS, connected TV, etc.)."_

### 10.2 Channel inventory

```
Braze 13 channels (2026):
1. Email
2. Push notifications (iOS, Android)
3. In-App Messages
4. Content Cards
5. SMS
6. WhatsApp
7. RCS Messaging
8. LINE (Asia)
9. Web (browser push, on-site)
10. Connected TV
11. Paid Media (audience sync)
12. Webhooks (any third-party)
13. ChatGPT Native App SDK
```

### 10.3 Per oficiální

> _"Seamlessly blend in-product and out of product channels— including email, mobile app, SMS, WhatsApp, web, paid media—from one interface"_

### 10.4 In-product vs out-of-product

```
In-product channels:
- In-App Messages
- Content Cards
- Push notifications
- Web on-site personalization

Out-of-product channels:
- Email
- SMS
- WhatsApp
- RCS
- LINE
- Paid media (re-targeting)
- Connected TV
```

### 10.5 One platform advantage

```
Pre-Braze approach:
- Email tool A
- Push tool B
- SMS tool C
- In-app tool D
- WhatsApp tool E
- ...
   ↓
Fragmentation problems:
- Multiple vendors
- Duplicated data
- Inconsistent messaging
- Hard to coordinate
- Multiple costs

Braze approach:
- All channels in one platform
- Unified user profile
- Single Canvas orchestrates all
- Frequency capping cross-channel
- Single source of truth
   ↓
Coordinated engagement
```

---

## 11. Email channel

### 11.1 Email capabilities

```
Braze email features:
- Drag-drop email editor
- Email template library
- Liquid templating personalization
- Connected Content (real-time API)
- A/B testing (manual + AI)
- Send time optimization
- Subject line testing
- Pre-headers
- Reply tracking
- Engagement tracking (opens, clicks)
- Suppression management
- Compliance (CAN-SPAM, GDPR)
```

### 11.2 Email deliverability

```
Braze email deliverability:
- Dedicated IP options
- IP warm-up support
- SPF/DKIM/DMARC
- Bounce handling
- Spam complaint management
- ISP relations team
- Professional services (deliverability consulting)
```

### 11.3 Per FinancialContent

> _"Professional Services: Onboarding, email deliverability, and dedicated technical support."_

### 11.4 Email + Connected Content

```
Email s Connected Content:
- Pull dynamic content from APIs
- Real-time product data
- Inventory checks
- Personalized recommendations
- Weather-based content
- Pricing variations
   ↓
Email opens → fresh content displayed
Not stale snapshot at send time
```

### 11.5 Interactive email components

Per FinancialContent:

> _"Smarter segments, interactive email components..."_

**Interactive components:**

- AMP for Email support
- In-email forms
- Carousels
- Hover effects
- Real-time content updates

---

## 12. Push notifications + Mobile

### 12.1 Mobile SDK

```
Braze Mobile SDKs:
- iOS SDK (Swift, Obj-C)
- Android SDK (Kotlin, Java)
- React Native
- Flutter
- Xamarin
- Cordova
- Unity (gaming!)
- Other mobile frameworks
```

### 12.2 Push notifications

```
Push notification features:
- iOS push (APNs)
- Android push (FCM)
- Rich push (images, video)
- Interactive buttons
- Deep links
- Personalization per user
- Send time optimization
- Quiet hours respect
- Frequency capping
- Geolocation-based
- Beacon-triggered
```

### 12.3 #1 G2 Push Notification Grid

Per oficiální:

- **#1 G2 Push Notification Grid**
- **Category leader**
- **Most mature mobile SDK**

### 12.4 Use cases

```
Push notification use cases:
- App engagement reminders
- Transaction alerts
- Location-based offers
- Real-time updates (sports scores)
- Breaking news
- Order status
- Abandoned cart (mobile)
- Re-engagement
```

---

## 13. In-App Messages + Content Cards

### 13.1 In-App Messages (IAM)

```
In-App Messages:
- Modals
- Banners
- Full-screen overlays
- HTML in-app
- Web in-app
- Native designs (iOS, Android)
- Triggered by:
  - Session start
  - User actions
  - Custom events
  - Real-time conditions
```

### 13.2 Per Gartner reviewer

> _"My favorite part of Braze was the ability to contact users in-app, without any overhead or bottlenecks from our engineering team."_

⚠️ Klíčové: Marketing team může nasadit IAM **bez engineering involvement** (vs. tradiční app features needing code release).

### 13.3 Content Cards

```
Content Cards:
- Inbox-like persistent messages
- Display in dedicated section v app
- Cards with:
  - Image
  - Title
  - Description
  - CTA button
  - Deep link
- User can:
  - View at their leisure
  - Dismiss
  - Click through
- Use cases:
  - Promotions
  - News
  - Tutorials
  - Recommendations
  - Loyalty info
```

### 13.4 IAM + Content Cards combined

```
Use case:
- IAM: Immediate action needed (promotional offer expiring)
- Content Card: Persistent reference (loyalty status)
   ↓
Both inside app
Both managed v Braze
Both triggered + personalized
   ↓
Coordinated experience
```

---

## 14. SMS + WhatsApp + RCS

### 14.1 SMS

```
SMS features:
- Global SMS sending
- Two-way SMS
- Compliance (TCPA, GDPR)
- Short codes
- Long codes
- Toll-free
- Carrier relationships
- Delivery tracking
```

⚠️ **SMS = Pro tier+ feature** per Vendr.

### 14.2 WhatsApp

Per FinancialContent:

> _"Expanded Channel Capabilities: Deepened support for WhatsApp Commerce, Flows, and Carousels"_

```
WhatsApp Commerce:
- Product catalogs
- In-WhatsApp shopping
- Flows (Meta's WhatsApp Flows)
- Carousels (multi-product)
- Quick replies
- Templates (Meta-approved)
- Two-way conversations
- Customer service integration
```

### 14.3 RCS Messaging

Per FinancialContent:

> _"RCS Messaging"_

```
RCS (Rich Communication Services):
- Next-gen SMS replacement
- Rich media (images, video)
- Carousels
- Suggested replies
- Read receipts
- Verified sender (logo, brand colors)
- Action buttons
- Better engagement vs. SMS
   ↓
Major brands adopting RCS
Braze early supporter
```

### 14.4 LINE (Asia)

```
LINE:
- Japan, Taiwan, Thailand markets
- Major messaging platform Asia
- Braze native integration
- Critical pro Asian customers
```

### 14.5 Per GetVero

> _"You need RCS, LINE, or WhatsApp Commerce — channels Customer.io doesn't offer"_

⚠️ **Braze advantage** in messaging breadth.

---

## 15. Connected TV, Paid Media, Web

### 15.1 Connected TV

```
Connected TV (CTV):
- Smart TVs
- Streaming devices
- Advertising integration
- Audience sync
- Cross-channel coordination
   ↓
Future-of-engagement channel
```

### 15.2 Paid Media (audience sync)

```
Paid Media integration:
- Sync audiences to:
  - Google Ads
  - Facebook / Meta
  - TikTok
  - Other ad platforms
- Suppression lists (don't ad-target paid customers)
- Re-targeting coordination
- Cross-channel attribution
```

### 15.3 Web (browser push, on-site)

```
Web channels:
- Browser push notifications
- On-site banners
- Web modals
- Personalized landing pages
- Real-time content
```

### 15.4 Webhooks

```
Webhooks:
- Send to any external service
- Trigger third-party actions
- Integration v Canvas journeys
- Custom workflows
- Examples:
  - Internal ticket creation
  - CRM updates
  - Inventory triggers
  - Custom integrations
```

### 15.5 ChatGPT Native App SDK

Per FinancialContent:

> _"ChatGPT Native App SDK"_

⚠️ **NEW channel:** ChatGPT app integration:

- Direct integration s ChatGPT
- Conversational engagement
- AI-native customer touchpoint
- Forward-looking feature

---

## 16. Real-time stream processing architecture

### 16.1 Per FinancialContent

> _"Real-Time Data Processing: Proprietary stream processing architecture for instant data processing, enabling truly real-time engagement."_

> _"The Braze Data Platform (BDP) unifies and activates data from various sources."_

### 16.2 Per oficiální

> _"Feel confident with a platform that operates with sub-second latency, regardless of your data and send volumes."_

### 16.3 Stream vs. Batch

```
Batch processing (traditional ESPs):
- Data collected
- Processed in batches (hourly, daily)
- Triggers fire after batch
- Latency: hours+
- Real-time impossible

Stream processing (Braze):
- Data events as stream
- Processed instantly (sub-second)
- Triggers fire immediately
- Latency: sub-second
- True real-time engagement
```

### 16.4 Use case examples

```
Real-time use cases:

E-commerce:
- User views product 3 times in 5 min
- Real-time trigger: push notification
- Sub-second response
- User still on site/app

Streaming:
- User finishes show
- Real-time recommendation push
- Within 30 seconds of completion

Gaming:
- Player completes level
- Achievement notification immediately
- Engagement window critical

Travel:
- Flight delay detected
- Push notification + SMS within 10s
- Customer informed faster than airport
```

### 16.5 At scale

```
Braze handles:
- Hundreds of thousands of events/second
- Billions of events daily
- Sub-second processing at scale
- No degradation s volume
```

### 16.6 Patents

Per FinancialContent:

> _"Notable Patents: Braze has significantly grown its IP portfolio, with patents covering: Systems and methods for controlling contacts with a client's users (U.S..."_

⚠️ **Patent-protected** technology.

---

## 17. Connected Content (API-driven personalization)

### 17.1 Connected Content concept

Per Gartner reviewer:

> _"Canvas with all the messaging steps available, SQL Query Builder with AI assistant, Drag and Drop editor, duplication between different workspaces, **Connected Content**, Catalogues, API-Triggered messaging"_

### 17.2 What it does

```
Connected Content:
- Pull dynamic content from APIs
- At message open time (not send time)
- Real-time data integration
- Personalized content blocks
- Examples:
  - Current weather
  - Live inventory
  - Real-time pricing
  - Sports scores
  - Stock prices
  - Personalized recommendations from your API
   ↓
Content always fresh
Not stale snapshot from when sent
```

### 17.3 Implementation

```
Setup steps:
1. Configure Connected Content endpoint
   - URL of your API
   - Auth (API key)
2. Define schema (response structure)
3. Use v template:
   {% connected_content https://api.yourcompany.com/recommendations?user_id={{user.id}} %}
   {{response.product_name}}
   {% endconnected_content %}
4. At send time + open time:
   - Braze calls your API
   - Inserts response
   - Renders personalized content
```

### 17.4 Use cases

```
Weather-based promotions:
- Email send time: 9am
- Open time: 11am (different weather)
- Connected Content fetches current weather
- "Rainy day! Stock up on umbrellas"

Real-time inventory:
- "Last 3 in stock" updated at open
- Avoids "out of stock" after click

Personalized recommendations:
- API returns user's top 5 products
- Email shows current top picks
- Always fresh recommendations

Dynamic pricing:
- Flash sale ending in 2 hours
- Email shows live countdown
- Updates at each open
```

### 17.5 Limitations

```
Connected Content:
- Response time critical (API must be fast)
- Caching considerations
- Fallback content needed (if API fails)
- Cost (API calls per open)
- Security (API key management)
```

---

## 18. Catalogues (product/content management)

### 18.1 Catalogues feature

Per Gartner reviewer:

> _"Catalogues"_

### 18.2 What are Catalogues

```
Catalogues in Braze:
- Product catalogs uploaded
- Content catalogs (articles, videos)
- Stored v Braze for personalization
- Reference v Liquid templates
- Updated periodically
- Used for:
  - Product recommendations
  - Content suggestions
  - Personalized galleries
  - Dynamic feeds
```

### 18.3 Catalogue structure

```
Example catalog:
{
  "products": [
    {
      "id": "prod_123",
      "name": "Blue Sneakers",
      "price": 79.99,
      "image": "...",
      "category": "shoes",
      "color": "blue"
    },
    ...
  ]
}
   ↓
Uploaded to Braze
   ↓
Referenced v campaign:
{% for product in catalog.products where product.category == "shoes" %}
  Show {{product.name}}
{% endfor %}
```

### 18.4 Use cases

```
E-commerce:
- Product recommendations
- Cart abandonment (specific products)
- New arrivals showcase
- Personalized feeds

Media:
- Content recommendations
- Recently watched
- Related articles

Travel:
- Destination suggestions
- Personalized itineraries
- Activity recommendations
```

### 18.5 Catalogues + AI

Per FinancialContent:

> _"AI Recommendation Engine: Beta version uses ML for personalized item recommendations."_

```
AI + Catalogues:
- ML scores each product per user
- Returns top-N recommendations
- Personalized per user
- Continuously learns
```

---

## 19. Currents (real-time data streaming)

### 19.1 Currents concept

Per Vendr:

> _"Braze Currents (data streaming) — Enterprise tier feature"_

### 19.2 What Currents does

```
Currents (outbound data streaming):
- Streams Braze engagement data
- To customer's data warehouse
- In real time
- Continuous flow
   ↓
Destinations:
- Snowflake
- Redshift
- BigQuery
- Databricks
- S3
- Kafka
- Other warehouses / streams
```

### 19.3 Data streamed

```
Currents data types:
- Email events (sent, delivered, opened, clicked, bounced)
- Push events
- IAM events
- Content Card events
- SMS events
- WhatsApp events
- User attribute changes
- Custom event logs
- Canvas progression
- Campaign metrics
- All engagement data
```

### 19.4 Use cases

```
Use cases for Currents:

Data warehousing:
- All engagement data v warehouse
- Custom analytics
- Cross-channel attribution
- ROI calculation

BI tools:
- Tableau / Looker / Power BI
- Custom dashboards
- Executive reporting

Customer 360:
- Combine s other systems
- Full customer profile
- Cross-platform analysis

ML / Data Science:
- Training data for models
- Predictive analytics
- Custom segmentation
```

### 19.5 Per GetVero

> _"Braze Currents streams engagement data back out to warehouses in real time. For enterprise teams wanting bidirectional warehouse integration, Braze has closed a significant capability gap."_

### 19.6 Currents pricing

```
Currents:
- Enterprise tier feature
- Add-on option (lower tiers)
- Per data volume pricing
- Per destination pricing
   ↓
Premium feature
```

---

## 20. SQL Query Builder + Liquid templating

### 20.1 SQL Query Builder

Per Gartner reviewer:

> _"SQL Query Builder with AI assistant"_

Per FinancialContent:

> _"Generative AI: Enhancements in Query Builder and SQL Segment Extension for natural language reporting and segmentation."_

### 20.2 SQL capabilities

```
SQL Query Builder:
- Query Braze data directly
- Build complex segments
- Custom reports
- AI assistant:
  - Natural language → SQL
  - "Show me users who bought shoes
    and live in California"
  - AI generates SQL
  - Returns results
   ↓
Power user feature
```

### 20.3 SQL Segment Extension

```
SQL Segment Extension:
- Define segments via SQL
- More flexible than UI builder
- Complex business logic
- Subqueries supported
- Joins (within Braze data)
   ↓
Beyond UI segment builder
```

### 20.4 Liquid templating

```
Liquid templating:
- Variable substitution: {{user.first_name}}
- Conditional logic: {% if %} {% endif %}
- Loops: {% for %} {% endfor %}
- Filters: {{user.name | upcase}}
- Date formatting
- Math operations
- Connected Content calls
- Catalogue references
   ↓
Powerful personalization language
   ↓
BrazeAI Liquid Assistant helps generate
```

### 20.5 Example complex Liquid

```liquid
{% if user.country == "US" %}
  Hello {{user.first_name}}, check out our American Black Friday sale!
{% elsif user.country == "DE" %}
  Hallo {{user.first_name}}, entdecke unseren Sale!
{% else %}
  Hello {{user.first_name}}, our global sale is on!
{% endif %}

{% connected_content
   https://api.yourcompany.com/recommendations?user_id={{user.id}}
   :basic_auth your_api %}

{% for product in response.products limit:3 %}
  - {{product.name}}: ${{product.price}}
{% endfor %}
{% endconnected_content %}
```

---

## 21. Zero-copy Canvas Triggers

### 21.1 Per GetVero

> _"Braze introduced Zero-copy Canvas Triggers in 2025 for direct Snowflake and BigQuery segmentation."_

Per FinancialContent:

> _"Enhanced Data Agility: 'Zero-copy Canvas Triggers' for real-time access and action on warehouse data."_

### 21.2 Concept

```
Traditional approach:
- Data v warehouse (Snowflake)
- Export segments to Braze
- Update periodically
- Lag time between warehouse and Braze
- Data duplication
   ↓
Problems:
- Stale data
- ETL costs
- Storage costs (2x)
- Sync complications

Zero-copy Canvas Triggers:
- Braze queries warehouse directly
- No copy of data needed
- Real-time access
- Always fresh
- Single source of truth
```

### 21.3 Supported warehouses

```
Zero-copy supports:
- Snowflake
- Google BigQuery
- (more likely)
```

### 21.4 Use cases

```
Use case: B2B subscription company
- Subscription data in Snowflake
- Risk scores calculated v warehouse
- Real-time changes
- Braze Canvas:
  - Zero-copy trigger reads warehouse
  - User flagged as "at risk"
  - Canvas fires retention journey
  - No data duplication
  - Real-time response

Use case: E-commerce
- Inventory v BigQuery
- Real-time stock levels
- Braze Canvas:
  - Zero-copy trigger reads stock
  - Restock notification when item available
  - Per-user wishlist matching
  - Real-time response
```

### 21.5 Enterprise advantage

Per GetVero:

> _"For enterprise teams wanting bidirectional warehouse integration, Braze has closed a significant capability gap."_

⚠️ **Closed capability gap** vs. competitors.

---

## 22. Segmentation a Predictive AI

### 22.1 Segmentation capabilities

Per Research.com:

> _"Its core strength lies in unifying user data from diverse sources to build detailed customer profiles, allowing marketers to segment audiences based on behavior, preferences, and demographics. This dynamic segmentation updates in real time, enabling highly targeted messaging tailored to individual user actions and needs."_

### 22.2 Segmentation features

```
Braze segmentation:
- Demographic segments
- Behavioral segments
- Real-time updates
- Multi-condition logic
- Custom events
- Custom attributes
- Computed fields
- Lookalike segments (ML)
- Predictive segments
- AI-suggested segments
   ↓
Dynamic + real-time
```

### 22.3 Smarter Segments (AI)

Per FinancialContent:

> _"Smarter segments..."_

```
Smarter Segments:
- AI analyzes user data
- Identifies behavioral patterns
- Suggests segments automatically
- Marketer reviews + activates
- Discovers segments humans miss
```

### 22.4 Predictive AI

Per FinancialContent:

> _"Predictive Analytics: Machine learning forecasts user behavior."_

Per Research.com:

> _"The platform also incorporates advanced personalization using machine learning and predictive analytics, which helps forecast user behavior and automate decision-making within campaigns."_

```
Predictive features:
- Churn prediction
- LTV prediction
- Best send time per user
- Best channel per user
- Best offer per user
- Engagement scoring
- Conversion likelihood
```

### 22.5 AI Recommendation Engine (beta)

Per FinancialContent:

> _"AI Recommendation Engine: Beta version uses ML for personalized item recommendations."_

```
Item recommendations:
- ML scores products per user
- Personalized recommendations
- Real-time updates
- Integration s Catalogues
- Email + push + IAM
```

### 22.6 Automated identity resolution

Per FinancialContent:

> _"Usability and Optimization: Smarter segments, interactive email components, automated identity resolution, and message prioritization."_

```
Identity resolution:
- Unifies user across devices
- Anonymous → known transition
- Cross-device linking
- Single user profile
- Reduced duplication
```

### 22.7 Message prioritization

```
Message prioritization:
- AI determines important messages
- Avoids fatigue
- Critical messages prioritized
- Promotional messages throttled if needed
- User experience optimized
```

---

## 23. OfferFit acquisition (Agentic AI)

### 23.1 OfferFit acquisition

Per FinancialContent:

> _"A significant growth driver is Braze's strategic focus on artificial intelligence (AI), exemplified by the acquisition of OfferFit for approximately $303.2 million, which bolsters its AI capabilities."_

### 23.2 What was OfferFit

```
OfferFit (pre-acquisition):
- AI experimentation platform
- Reinforcement learning specialist
- Automated 1:1 personalization
- Used by major brands
- Replaces A/B testing
   ↓
Acquisition rationale:
- Strengthens BrazeAI Suite
- Adds reinforcement learning expertise
- Powers Decisioning Studio
- Agentic AI direction
- Talent acquisition
```

### 23.3 OfferFit + Braze integration

```
Post-acquisition integration:
- OfferFit capabilities → BrazeAI Decisioning Studio
- OfferFit team → BrazeAI team
- Existing OfferFit customers → migrated/integrated
- Patents + IP transferred
- Reinforcement learning core competency
```

### 23.4 Strategic significance

```
$303.2M = major acquisition for Braze:
- Q3 FY2026 revenue: $730M estimated annual
- ~5 months of Braze revenue
- Significant investment
- Demonstrates AI commitment
- Long-term strategic move
```

### 23.5 Agentic AI direction

```
Agentic AI = AI that acts autonomously
   ↓
Braze direction:
- AI agents make decisions
- AI agents generate content
- AI agents orchestrate journeys
- AI agents optimize campaigns
   ↓
Future vision:
- Marketers set goals
- AI executes autonomously
- Continuous improvement
- Human oversight (review)
```

---

## 24. Integrace + APIs + SDKs

### 24.1 Per FinancialContent

> _"Compliance and Security: Robust measures and compliance with global regulations (GDPR, CCPA, HIPAA) to ensure data protection and privacy."_

### 24.2 Integration types

```
Braze integrations:
- 100+ partner integrations
- Mobile SDKs (iOS, Android, React Native, Flutter, Unity, etc.)
- Web SDK
- Server-side APIs (REST)
- Data warehouse direct (Snowflake, BigQuery)
- Currents (data streaming out)
- Webhooks (any third-party)
- iPaaS (Zapier, Workato)
- ETL (Fivetran, Hightouch, Census)
- Customer data platforms (Segment, mParticle, Rudderstack)
```

### 24.3 Customer Data Platforms (CDPs)

```
Common CDP integrations:
- Segment (most popular)
- mParticle
- Rudderstack
- Tealium
- Treasure Data
   ↓
CDP → Braze:
- User profiles
- Events streamed
- Attributes synced
   ↓
Braze receives clean data
```

### 24.4 Data warehouse integrations

```
Warehouse integrations:
- Snowflake (zero-copy direct)
- BigQuery (zero-copy direct)
- Redshift (Currents export)
- Databricks
- Other warehouses
```

### 24.5 Per Gartner reviewer

> _"Reliable and flexible data connectivity (import and export)"_

> _"Good documentation (e.g. 'see me in Postman' for REST Endpoints)"_

### 24.6 REST API

```
Braze REST API:
- /users endpoints (CRUD)
- /campaigns endpoints
- /canvas endpoints
- /messages endpoints
- /catalogs endpoints
- /export endpoints
- /events endpoints
- Webhook delivery
   ↓
Full programmatic control
```

### 24.7 SDK availability

```
Mobile SDKs:
- iOS (Swift, Obj-C)
- Android (Kotlin, Java)
- React Native
- Flutter
- Cordova
- Xamarin
- Unity (gaming!)

Web SDK:
- JavaScript browser SDK
- Server-side integrations

Per-platform:
- Roku (TV)
- tvOS
- Other emerging platforms
```

---

## 25. Forrester TEI ROI metrics

### 25.1 Forrester Total Economic Impact

Per Braze publication:

> _"Forrester TEI: 457% ROI, payback < 6 months"_

⚠️ **Forrester TEI** = Total Economic Impact study commissioned for marketing claims.

### 25.2 Metrics highlights

```
Forrester TEI key findings:
- 457% ROI over 3 years
- Payback period < 6 months
- Composite organization analysis
- Based on customer interviews
```

### 25.3 Reference customer ROI examples

```
Bazaar:
- 21% revenue increase
- Canvas real-time restock journeys

Wellhub:
- 25% of net-new revenue from campaign
- 70% click rates
- 3X sign-up volume increase
- Up to 5% conversion rate increase

Tonies:
- 117% increase in free-to-paid conversions

Erewhon:
- 20% lift in mobile order engagement
- ~50% of recipients place mobile order within 90 days
- ~2X increase in volume after launching
- ~33% reduction in time to stand up campaign

Panera Bread:
- 50+ hours saved through automated content creation
- Streamlined campaign management
```

### 25.4 Per oficiální case studies

> _"Our long-standing partnership with Braze has allowed us to continuously refine our customer communication strategy. We've leveraged Braze's capabilities to optimize message timing and personalization, resulting in stronger engagement and a noticeable improvement in the overall customer experience."_

---

## 26. Compliance, GDPR, security

### 26.1 Per FinancialContent

> _"Compliance and Security: Robust measures and compliance with global regulations (GDPR, CCPA, HIPAA) to ensure data protection and privacy."_

### 26.2 Per Research.com

> _"Security and compliance with data privacy laws like GDPR and CCPA are built into the system, supporting user consent management and secure data handling."_

### 26.3 Compliance frameworks

```
Braze compliance:
- GDPR (EU)
- CCPA (California)
- HIPAA (healthcare, US)
- SOC 2 Type II
- ISO 27001
- PCI DSS (likely)
- TCPA (US SMS)
- CAN-SPAM (US email)
- CASL (Canada)
```

### 26.4 Data privacy features

```
Data privacy capabilities:
- Right to be Forgotten (GDPR)
- Data Subject Access Requests (DSAR)
- Data export
- Consent management
- Subscription preferences
- Granular opt-out
- Audit logs
- Encryption at rest + in transit
```

### 26.5 EU data residency

```
EU data center options:
- Braze EU cluster
- GDPR compliance
- Data residency v EU
- For European customers
```

### 26.6 Security features

```
Security:
- 2FA / MFA
- SSO (SAML)
- Role-based access (RBAC)
- IP whitelisting
- API key management
- Audit logs
- Compliance certifications
```

---

## 27. Reference customers

### 27.1 Customer examples

Per multiple sources:

**Enterprise B2C:**

- **Microsoft**
- **Etsy**
- **HBO Max**

**Food delivery / restaurants:**

- **Grubhub**
- **McDonald's**
- **Burger King**
- **Panera Bread**
- **Erewhon**

**Sports / Media:**

- **NBA**

**Consumer products:**

- **Tonies** (children's audio)

**Fitness:**

- **Wellhub**

**Other:**

- **Bazaar** (e-commerce)
- **Many more enterprise B2C brands**

### 27.2 Industries served

```
Primary industries:
- Retail / e-commerce
- Media / streaming
- Gaming
- Travel / hospitality
- Financial services (B2C)
- Food delivery / restaurants
- Fitness / health
- Consumer mobile apps
- Subscription services
- Sports / entertainment
```

### 27.3 Per Gartner reviewer (10 years experience)

> _"I've been working with the platform nearly 10 years, now in my 3rd company using it. What I like the most: reliable and flexible data connectivity (import and export), good documentation, intuitive and easy to use, making complex tech comprehensible for non-tech team members, matching well Marketing Engagement requirements towards building an omni-channel CRM, strong Customer Success Managers, Team is open for feedback, listens to the Customers and keeps improving the product, helpful in looking for workarounds when something is not available out-of-the-box, great community around the product (e.g. Braze Bonfire, all events)."_

⚠️ **3 companies, 10 years** = customer loyalty + portability.

### 27.4 Braze Bonfire community

Per Gartner reviewer:

> _"great community around the product (e.g. Braze Bonfire, all events)"_

**Braze Bonfire:**

- Community of customers
- Events + meetups
- Knowledge sharing
- Best practices

### 27.5 Per Cross The Tracks (festival)

> _"At Cross The Tracks, what stands out most about Braze is how intuitive and powerful the platform is across the entire lifecycle of our campaigns. The UI/UX is a real highlight, particularly the Canvas builder, whose drag-and-drop interface and decision paths make it easy to create and manage complex customer journeys for different audience segments like early-bird buyers, VIPs, and returning attendees—saving us hours of manual work each week."_

> _"Braze also integrates seamlessly with our ticketing platform and data warehouse, allowing us to use real-time purchase and engagement data to trigger highly relevant messaging, such as lineup announcements or last-call ticket pushes. In terms of performance, the platform is reliable even during high-pressure moments like ticket launches, ensuring messages are delivered quickly and consistently when timing is critical."_

---

## 28. Limity a nedostatky

### 28.1 NENÍ B2B SaaS / enterprise marketing tool

⚠️ **Klíčový limit:**

- Braze = **B2C / D2C focused**
- **NE B2B SaaS marketing automation**
- Pro B2B: HubSpot / Marketo / Pardot lepší
- Pro B2B SaaS: Customer.io / Iterable

### 28.2 No permanent free plan

Per AIChief:

> _"Braze does not offer a free plan"_

⚠️ Vyžaduje **custom contract**:

- Sales-driven
- Minimum commitment
- Enterprise budgets

### 28.3 Higher cost barrier

Per Vendr:

- **Pro tier:** $80K-$250K/year
- **Enterprise (2M+ MAUs):** $300K-$1M+/year
- **Implementation:** $25K-$100K+

⚠️ Pro SMB: prohibitive cost.

### 28.4 Complex implementation

Per GetVero:

> _"Common Braze criticism: complex setup, Canvas navigation at scale, and unexpected data point billing overages."_

⚠️ **Implementation challenges:**

- 3-6 months typical duration
- Engineering resources required
- Mobile SDK integration
- Data architecture decisions
- Custom event design

### 28.5 Canvas complexity ceiling

Per GetVero:

> _"The complexity ceiling is also a usability challenge. G2 reviewers note that Canvas becomes difficult to navigate as journeys grow complex. Braze's ease of setup score on G2 is 7.5/10 — lower than most competitors in the category."_

⚠️ Canvas = powerful BUT:

- Hard to navigate at scale
- Limited copy/paste
- Multi-select missing
- Complex journeys hard to maintain

### 28.6 G2 reviewer usability issues

> _"In the Audience Path: when we apply a filter and need to repeat the same filter by changing just one detail in the field, we have to redo it in all fields because there is no option to copy and paste. In the Canvas, we also cannot select and copy to paste in another part of the same canvas, nor can we select multiple items/fields at once."_

⚠️ **UX productivity issues** v Canvas.

### 28.7 Data point billing surprises

Per GetVero:

> _"Common Braze criticism: ... unexpected data point billing overages."_

> _"Braze bills on data points. Every custom event, attribute, or purchase logged to a user profile counts as a billable unit. Teams with high-frequency event tracking can burn through their allocation faster than expected."_

⚠️ **Billing complexity:**

- Custom events billable
- High-frequency = overage risk
- Hard to predict costs upfront
- Need careful event design

### 28.8 AI pricing unpredictability

Per G2 reviewer:

> _"As we lean more into Agentic workflows and AI-driven orchestration, the credit-based consumption or 'AI-utility' pricing can become unpredictable."_

⚠️ **AI-utility pricing:**

- Credit-based consumption
- Unpredictable spend
- BrazeAI features add costs
- Budget forecasting hard

### 28.9 AI integration v testing phase

Per G2 reviewer:

> _"the AI integration in in testing phase and there are some bugs in the outpur, Recommend to human verify the outputs."_

⚠️ AI products mature but:

- Bugs occasionally
- Human review recommended
- Not 100% production-ready (some features)

### 28.10 Help tickets quality issue

Per Gartner reviewer:

> _"help tickets becomes less helpful as you grow more experienced - responses do not match expectations/ depth"_

⚠️ Support pro advanced users:

- Generic responses sometimes
- Doesn't match expert level
- Becomes less helpful s experience

### 28.11 Pace of updates challenging

Per Gartner reviewer:

> _"pace of updates can be hard to follow"_

⚠️ Rapid product development:

- Hard to keep up with new features
- Training needed continuously
- Documentation may lag

### 28.12 Dashboard customization limited

Per Gartner reviewer:

> _"dashboard customisation per relevant features or per user role would be helpful"_

⚠️ Limited dashboard customization per role.

### 28.13 Uneven development focus

Per Gartner reviewer:

> _"uneven development focus - newer features get attention while existing limitations remain"_

⚠️ Strategic feature development:

- New AI features prioritized
- Older feature limitations persist
- UX improvements slower

### 28.14 Transition learning curve

Per G2 reviewer:

> _"Transitioned from another CX platform, so there were some learnings and new processes to implement since Braze handles things like dynamic fields and user journeys differently compared to our previous provider."_

⚠️ Migration challenges:

- Different paradigm (dynamic fields, journeys)
- Re-training team
- Process re-design
- Initial productivity dip

### 28.15 Mobile-first bias

```
Braze strengths:
- Mobile apps
- Push notifications
- In-app messages
- Real-time triggers

Braze weakness:
- Web-only businesses less optimal
- B2B without mobile less ideal
- Email-only businesses overkill
```

### 28.16 Less suited for SMB

Per Research.com:

> _"Braze is primarily designed for mid-to-large enterprises; however, small businesses with growing needs can also benefit from its capabilities."_

⚠️ **SMB unsuitable:**

- Cost too high
- Complexity overkill
- Implementation too long
- ROI hard to justify

### 28.17 Mid-market lower fit (vs. enterprise)

```
Sweet spot: Enterprise B2C
- Hundreds of thousands → millions MAUs
- Dedicated marketing operations team
- Complex multi-channel strategy
- Budget $60K+/year

Mid-market struggles:
- May not need all features
- Pricing leverage limited
- Implementation overhead
- Internal resource requirements
```

### 28.18 Steep mobile SDK setup

```
Mobile SDK requires:
- Engineering team integration
- App release cycle
- Testing across devices
- Push notification certificate setup
- IAM configuration
- Custom event design
   ↓
Not "plug and play"
3-6 months typical
```

---

## 29. Shrnutí: Pro koho a proti komu

### Braze je dobrá volba pokud

- Provozujete **B2C / D2C consumer brand**
- Provozujete **mobile-first business** (app-driven)
- Cíl je **real-time customer engagement** (sub-second!)
- MAU count v **hundreds of thousands → millions**
- Provozujete **retail, media, gaming, travel, financial services** at enterprise scale
- Provozujete **streaming service** (HBO Max-like)
- Provozujete **food delivery / restaurants** (Grubhub-like)
- Provozujete **sports / entertainment** (NBA-like)
- Provozujete **DTC e-commerce at enterprise scale**
- Hledáte **most channels** (13 z jedné platformy)
- Vyžadujete **RCS, LINE, WhatsApp Commerce**
- Cíl je **AI-native orchestration** (NE jen AI features)
- Hledáte **reinforcement learning** (Decisioning Studio)
- Cíl je **AI agents v journeys** (Agent Console)
- Vyžadujete **sub-second latency** at scale
- Cíl je **most mature journey builder** (Canvas)
- Vyžadujete **direct data warehouse access** (Snowflake/BigQuery zero-copy)
- Vyžadujete **real-time data streaming out** (Currents)
- Máte **dedicated marketing operations team**
- Budget **$60K+/year** (typically $80K-$1M+)
- **Implementation timeline 3-6 months** acceptable
- Vyžadujete **enterprise-grade compliance** (GDPR, CCPA, HIPAA)
- Cíl je **public company stability** (BRZE)
- Cenu **Forrester TEI 457% ROI** validated

### Braze není dobrá volba pokud

- Provozujete **B2B SaaS** – HubSpot / Marketo / Pardot lepší
- Provozujete **SMB** – Mailchimp / Brevo / Klaviyo lepší
- Budget **< $60K/year** – přístup nemožný (no free plan)
- Implementation **must be < 1 month** – Braze typically 3-6 months
- **Email-only business** – overkill, simpler ESPs sufficient
- **Web-only business (no mobile app)** – partial value
- Cíl je **content creator newsletter business** – Beehiiv / Substack / Kit
- Cíl je **paid newsletter** – Beehiiv / Substack
- Hledáte **CZ/SK/PL specifické features** – local platforms (SmartEmailing, SALESmanago)
- Hledáte **DACH expertise** – CleverReach / Inxmail / Emarsys
- Provozujete **non-mobile-first business** – jiné CEPs better fit
- Vyžadujete **predictable pricing** – Braze data point + AI credits unpredictable
- **No technical team** – plug-and-play tools (Mailchimp) better
- Cíl je **transactional email infrastructure** – SendGrid / Mailgun / EmailLabs
- Provozujete **complex CRM B2B** – Salesforce / HubSpot
- Cíl je **community-building** – Discord / Circle

### Braze vs. konkurence

| Konkurence                     | Kdy lepší než Braze                               |
| ------------------------------ | ------------------------------------------------- |
| **Klaviyo**                    | DTC Shopify-first, simpler, contact-based pricing |
| **Iterable**                   | Cost-effective alt, similar capabilities          |
| **Customer.io**                | Product teams, no data point billing, simpler     |
| **Salesforce Marketing Cloud** | Full Salesforce ecosystem, B2B+                   |
| **Adobe Journey Optimizer**    | Adobe Experience Cloud ecosystem                  |
| **HubSpot**                    | B2B sales-led, full CRM                           |
| **Marketo / Pardot**           | B2B SaaS marketing automation                     |
| **Mailchimp**                  | SMB, simple, all-in-one starter                   |
| **Brevo**                      | All-in-one s transactional, French                |
| **SALESmanago**                | PL AI-driven CDXP, mid-market EU                  |
| **Bloomreach Engagement**      | CZ origin CDXP, less expensive                    |
| **Insider**                    | Similar CEP, sometimes cost-competitive           |
| **MoEngage**                   | Asian markets specialist                          |
| **CleverTap**                  | Mobile-first analytics + engagement               |

---

_Dokument zpracován z oficiálních zdrojů braze.com a praktických zdrojů (Gartner Peer Insights, G2, Vendr, SelectHub, Research.com, GetVero, AIChief, FinancialContent). Pro nejaktuálnější detaily je nutný engagement s Braze sales / consultant teamem._
