# Migrační scénáře – 27 platforem 2026

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Komplexní migrační scénáře napříč 27 platformami, 3 hlavní skupiny: A) Downsizing/Upgrading, B) CZ/SK lokální migrace, C) Size progression paths SMB → Mid → Enterprise. Per scénář: rationale, timeline, data migration steps, risks, costs, partner involvement, common pitfalls.

> **TL;DR:** Migrace email/CDP platforem jsou nejnáročnější marketing projekty. Špatná migrace = ztráta dat, deliverability propad, časový pokluz, $$$ rebuild. Tento dokument říká, jak migrovat správně + jaké jsou typické chyby.

> ⚠️ **Disclaimer:** Migrační scénáře jsou typické patterny pozorované v industry 2024-2026. Tvoje situace má specifika – consult always s implementation partnerem nebo vendor's professional services team.

---

## Obsah

1. [Úvod: kdy migrovat a proč](#1-uvod)
2. [Universal migration framework](#2-framework)
3. [SKUPINA A: Downsizing & Upgrading paths](#3-skupina-a)
4. [SKUPINA B: CZ/SK lokální migrace](#4-skupina-b)
5. [SKUPINA C: Size progression paths](#5-skupina-c)
6. [Common migration pitfalls](#6-pitfalls)
7. [Migration costs estimates](#7-costs)
8. [Migration partner network](#8-partners)
9. [Pre-migration audit checklist](#9-audit)
10. [Post-migration validation](#10-validation)

---

## 1. Úvod: kdy migrovat a proč

### 1.1 Top důvody pro migraci 2026

```
1. PRICING PRESSURE
- Vendor pricing increases
- Tier upgrade forced
- Free plan elimination
- Hidden costs unsustainable
→ Migrace na cheaper alternative

2. FEATURE GAPS
- Need predictive AI
- Need CDP capabilities
- Need cross-channel
- Need automation depth
→ Migrace na advanced platform

3. SCALING NEEDS
- DB grew 10×
- Multi-region expansion
- Multiple brands consolidation
- Enterprise features need
→ Migrace na enterprise platform

4. CONSOLIDATION
- Multiple tools → single
- Marketing + Sales + Service unified
- Vendor reduction strategy
→ Migrace na all-in-one

5. VENDOR ISSUES
- Bad support
- Frequent outages
- Roadmap dissatisfaction
- Acquisition concerns
→ Migrace na competitor

6. STRATEGIC ALIGNMENT
- New CRM (Salesforce)
- New e-comm platform
- New parent company
- Industry-specific needs
→ Migrace na aligned platform

7. COMPLIANCE NEEDS
- GDPR requirements
- DACH-strict
- Industry-specific (HIPAA, etc.)
- Multi-jurisdiction
→ Migrace na compliance-strong

8. CDP MATURITY NEED
- Tags + lists nestačí
- Need true CDP
- Multi-source ingestion
- Identity resolution
→ Migrace na true CDP
```

### 1.2 Kdy NEMIGRovat (red flags)

```
RED FLAGS proti migraci:

1. NEDOSTATEK BUSINESS CASE
- "Konkurence to má" ≠ migrace
- ROI nejasné
- Switching costs nezapočítané

2. ŠPATNÉ TIMING
- Mid-campaign (peak season)
- Black Friday před
- Team v transition
- Budget cycle špatný

3. NESPRÁVNÝ TARGET
- Migrace na "horší" platformu
- Feature parity nezajištěna
- Compliance gap

4. NEDOSTATEK RESOURCES
- Žádný partner
- Žádný internal champion
- Žádný budget pro implementation

5. PŘEHNANÉ OČEKÁVÁNÍ
- "Nová platforma vyřeší vše"
- Žádný plán optimalizace
- Žádné training/governance

6. DATA QUALITY ISSUES
- Špinavá DB
- Žádný consent log
- Žádné historical data
- Spam complaints already

→ NEJDŘÍVE TO VYŘEŠIT, PAK MIGRovat
```

### 1.3 Pravidla úspěšné migrace

```
TOP 10 PRAVIDEL:

1. PLAN MIN 6 MĚSÍCŮ PŘEDEM
- Enterprise: 6-12 měsíců
- Mid-market: 3-6 měsíců
- SMB: 1-3 měsíce

2. PARALLEL RUN MIN 30 DNŮ
- Old + new running concurrent
- Validation period
- Rollback option open

3. DATA AUDIT NEJDŘÍVE
- Pre-migration cleanup
- Consent verification
- Historical data scope

4. IP WARMUP CRITICAL
- Dedicated IP: 4-8 týdnů warmup
- Shared IP: instant available
- Reputation continuity plan

5. STAKEHOLDER ALIGNMENT
- Executive sponsor
- Cross-team coordination
- Communication plan

6. TESTING RIGOROUS
- Test sends
- Workflow testing
- Integration testing
- Performance testing

7. ROLLBACK PLAN
- Worst case scenario
- Data backups
- Decision points

8. POST-MIGRATION OPTIMIZATION
- 90-day review
- Performance benchmarks
- Team training continuation

9. VENDOR ACCOUNTABILITY
- Implementation contracts
- SLA commitments
- Performance milestones

10. DON'T RUSH
- "Tomorrow we go live" = disaster
- Quality > Speed
- Iterative phases preferred
```

---

## 2. Universal Migration Framework

### 2.1 Phase 1: Discovery (2-4 týdny)

```
DISCOVERY ACTIVITIES:

1. AUDIT CURRENT STATE
- Current platform usage
- Workflows inventory
- Data quality assessment
- Integration mapping
- Team skills inventory
- Pricing analysis

2. DEFINE FUTURE STATE
- Business goals alignment
- Required features
- Channel needs
- Compliance requirements
- Budget parameters

3. VENDOR EVALUATION
- 2-3 platform candidates
- RFP process (enterprise)
- Reference customer calls
- Demo + trial
- Partner ecosystem evaluation

4. BUSINESS CASE
- TCO 3-year comparison
- ROI projections
- Risk assessment
- Migration cost estimate
- Strategic value
```

### 2.2 Phase 2: Selection (1-2 týdny)

```
SELECTION ACTIVITIES:

1. FINAL VENDOR DECISION
- Stakeholder alignment
- Contract negotiation
- Partner selection
- Timeline agreement

2. PROJECT KICKOFF
- Project team formation
- Communication plan
- Tools setup
- Risk register
```

### 2.3 Phase 3: Setup (4-12 týdnů)

```
SETUP ACTIVITIES:

1. PLATFORM SETUP
- Account provisioning
- User accounts setup
- Domain authentication
- Custom domain setup
- Branding configuration

2. INTEGRATION BUILD
- CRM integration
- E-commerce integration
- Web tracking SDK
- Custom integrations
- API connections

3. DATA MIGRATION
- Pre-migration cleanup
- Data mapping
- Migration scripts
- Test imports
- Production import

4. TEMPLATE MIGRATION
- Email templates rebuild
- Landing pages
- Pop-ups + forms
- Branding alignment
```

### 2.4 Phase 4: Configuration (4-12 týdnů)

```
CONFIGURATION ACTIVITIES:

1. WORKFLOW BUILDOUT
- Welcome series
- Abandoned cart
- Re-engagement
- Triggered emails
- Custom journeys

2. SEGMENTATION
- Behavioral segments
- Demographic segments
- Custom segments
- Predictive segments

3. CONTENT MIGRATION
- Email creative migration
- Content library setup
- Asset transfer

4. AUTOMATION RULES
- Trigger conditions
- Multi-step workflows
- Exit conditions
- Loop prevention
```

### 2.5 Phase 5: Testing (2-6 týdnů)

```
TESTING ACTIVITIES:

1. UNIT TESTING
- Individual workflows test
- Integration test
- Template rendering
- Multi-device testing

2. END-TO-END TESTING
- Full journey simulation
- Segment activation test
- Cross-channel test
- Performance test

3. UAT (User Acceptance Testing)
- Stakeholder review
- Edge case validation
- Approval process

4. PARALLEL TESTING
- Old + new simultaneously
- Performance comparison
- Validation metrics
```

### 2.6 Phase 6: Launch (1-2 týdny)

```
LAUNCH ACTIVITIES:

1. IP WARMUP (if dedicated)
- 4-8 týdny warmup plan
- Gradual volume ramp
- Reputation building

2. SOFT LAUNCH
- Subset of campaigns
- Limited audience
- Performance monitoring

3. FULL CUTOVER
- Full audience migration
- Old platform sunset
- Final data sync

4. POST-LAUNCH MONITORING
- Daily metrics review
- Issue tracking
- Quick response team
```

### 2.7 Phase 7: Optimization (Ongoing)

```
OPTIMIZATION ACTIVITIES:

1. 30-DAY REVIEW
- Performance vs. benchmarks
- Issue retrospective
- Team feedback

2. 90-DAY REVIEW
- ROI assessment
- Workflow optimization
- Advanced features rollout

3. CONTINUOUS IMPROVEMENT
- A/B testing program
- New features adoption
- Team skill development
- Vendor relationship
```

---

## 3. SKUPINA A: Downsizing & Upgrading Paths

### 3.1 Scenario A1: Mailchimp → Klaviyo (DTC ecommerce growth)

```
RATIONALE:
- DTC ecommerce roste z $1M na $10M+ ARR
- Mailchimp pricing scales aggressively při růstu
- Klaviyo native Shopify integration
- Predictive AI native (CLV, churn, propensity)
- DTC industry standard

TARGET CUSTOMER PROFILE:
- DTC e-shop $1M-50M ARR
- 10K-500K kontaktů
- Shopify-based
- Performance marketing-driven
- Subscription / repeat purchases

TIMELINE: 2-3 měsíce

WEEK 1-2: Discovery + Setup
- Klaviyo account setup
- Shopify integration (auto-sync)
- Domain authentication migration
- Brand setup

WEEK 3-4: Data Migration
- Audience export Mailchimp
- Klaviyo import + segmentation
- Historical data evaluation
- Consent verification

WEEK 5-8: Workflow Rebuild
- Welcome series
- Abandoned cart
- Post-purchase
- Win-back
- VIP customer flows

WEEK 9-10: Testing + Launch
- Parallel testing
- Subscriber list migration final
- Sunset Mailchimp
- Performance monitoring

RISKS:
⚠️ Loss of segmentation data
⚠️ Email template rebuild required
⚠️ Different automation logic
⚠️ Reporting differences
⚠️ Klaviyo learning curve

COSTS:
- Year 1: $5K-15K self-implementation
- Year 1 partner-led: $15K-50K
- Subscription jump: 1.5-2× typically
- Worth it pro $1M+ ARR DTC

COMMON PITFALLS:
- Underestimating data migration complexity
- Skipping consent verification
- Rushed workflow rebuild
- Insufficient testing
```

### 3.2 Scenario A2: Constant Contact → MailerLite (escape pricing trap)

```
RATIONALE:
- Constant Contact free plan eliminated June 2025
- CC pricing aggressive scaling 500→1K+ contacts
- MailerLite modern UI + ecom features
- CC SMS US-only (international issue)
- Better value for SMB

TARGET CUSTOMER PROFILE:
- SMB $0-1M revenue
- 500-25K kontaktů
- US or international
- Email-focused (some SMS optional)
- Newsletter + light automation

TIMELINE: 1-2 měsíce

WEEK 1: Discovery
- MailerLite account setup
- Pricing comparison
- Feature gap analysis
- Migration plan

WEEK 2-3: Data Migration
- CC audience export
- MailerLite import
- Subscriber consent verification
- List hygiene

WEEK 4: Template + Workflow Migration
- Email templates rebuild
- Welcome series rebuild
- Basic automation setup

WEEK 5-6: Testing + Launch
- Subset test sends
- Parallel run 2 týdny
- Full cutover
- CC cancellation (phone-only!)

RISKS:
⚠️ CC cancellation phone-only (trap)
⚠️ Different template editor
⚠️ Event management features (CC unique)
⚠️ Reporting differences

COSTS:
- Year 1: $2K-5K self-implementation
- Subscription savings: 30-50% typical
- Quick ROI 6-12 měsíců

COMMON PITFALLS:
- Forgetting CC phone-cancellation requirement
- Not exporting CC event management data
- Missing CC nonprofit discount equivalents
- Underestimating template rebuild
```

### 3.3 Scenario A3: Salesforce MC → Bloomreach (cost optimization)

```
RATIONALE:
- Salesforce MC implementation $100K-500K+
- Premier Success 30% of license fees!
- Multiple SKUs confusion
- Bloomreach typically 30-50% lower TCO
- Bloomreach native CDP advantage
- Better for B2C ecom

TARGET CUSTOMER PROFILE:
- B2C ecommerce enterprise
- 100K-10M kontaktů
- $10M-1B+ revenue
- Not deeply tied to Salesforce CRM
- Want CDP-native architecture

TIMELINE: 6-12 měsíců

MONTH 1-2: Discovery + Selection
- Detailed audit current Salesforce setup
- Bloomreach evaluation + demo
- Partner selection
- Contract negotiation
- Project kickoff

MONTH 3-4: Setup + Integration
- Bloomreach account setup
- E-commerce integration
- Web tracking SDK
- CRM integration (lighter)
- Custom data sources

MONTH 5-6: Data Migration
- Customer data migration
- Historical campaign data
- Segments migration
- Consent verification

MONTH 7-8: Workflow Rebuild
- Journey migration
- AI/predictive setup
- Recommendation engine
- Multi-channel orchestration

MONTH 9-10: Testing + UAT
- Stakeholder testing
- Edge cases validation
- Performance benchmarking
- IP warmup

MONTH 11-12: Launch + Optimization
- Phased cutover
- Salesforce MC sunset
- Optimization
- Team training

RISKS:
⚠️ Salesforce CRM integration challenges
⚠️ Custom Salesforce features migration
⚠️ Stakeholder buy-in (Salesforce loyalty)
⚠️ Mid-migration roadmap changes

COSTS:
- Year 1: $100K-500K (implementation + setup)
- Year 1 subscription: $50K-300K Bloomreach
- Savings 3-year: 30-50% vs. Salesforce
- ROI typically 18-24 měsíců

COMMON PITFALLS:
- Underestimating Salesforce data complexity
- Missing custom Salesforce features
- Insufficient parallel running
- Stakeholder resistance
- Salesforce contract exit clauses
```

### 3.4 Scenario A4: HubSpot Enterprise → ActiveCampaign (right-sizing)

```
RATIONALE:
- HubSpot Enterprise $3 600+/mo
- Pricing scales with contacts
- ActiveCampaign Plus $49 / Enterprise $145+
- Better automation depth (500+ recipes)
- Not all Hubs needed (Sales + Service maybe)

TARGET CUSTOMER PROFILE:
- Mid-market B2B
- 10K-100K kontaktů
- HubSpot Enterprise but not using all features
- Marketing-heavy use case
- Sales CRM is separate (or simpler)

TIMELINE: 3-4 měsíce

WEEK 1-2: Discovery
- HubSpot usage audit
- Feature gap analysis
- ActiveCampaign evaluation
- Pricing comparison

WEEK 3-6: Setup + Data Migration
- ActiveCampaign account setup
- HubSpot contacts export
- AC import + segmentation
- Custom field mapping

WEEK 7-12: Workflow Rebuild
- Marketing workflows
- Lead scoring rules
- Email templates
- Landing pages

WEEK 13-16: Testing + Launch
- Parallel testing
- Subset launches
- Full cutover
- HubSpot Marketing Hub sunset (keep Sales/Service if needed)

RISKS:
⚠️ Sales/Service Hub dependency
⚠️ CRM data integrity
⚠️ Reporting differences
⚠️ Different lead scoring methodology

COSTS:
- Year 1: $25K-75K implementation
- Subscription savings: 50-70% typical
- ROI 12-18 měsíců

COMMON PITFALLS:
- Cutting too many Hubs at once
- Missing CRM integration complexity
- Underestimating workflow logic differences
- Insufficient team retraining
```

### 3.5 Scenario A5: SAP Emarsys → SALESmanago (mid-market right-sizing)

```
RATIONALE:
- SAP Emarsys enterprise pricing ($5K+/mo)
- 6-12 měsíců implementation
- Overkill for mid-market
- SALESmanago strong CEE alternative
- AI Studio + CDP native
- Better mid-market fit

TARGET CUSTOMER PROFILE:
- CEE retail / B2C
- 50K-500K kontaktů
- Mid-market $10M-100M revenue
- AI + CDP needs
- Cost-conscious

TIMELINE: 4-6 měsíců

MONTH 1: Discovery
- Emarsys usage audit
- SALESmanago evaluation
- AI feature comparison
- Implementation partner selection

MONTH 2-3: Setup + Migration
- SALESmanago setup
- Data export from Emarsys
- Multi-source integration
- Custom integrations

MONTH 4-5: Workflow Rebuild
- AI Studio setup
- Predictive segments
- Multi-channel orchestration
- Loyalty integration

MONTH 6: Testing + Launch
- Parallel testing
- Phased cutover
- Emarsys sunset

RISKS:
⚠️ Aggressive sales tactics SALESmanago (reported)
⚠️ AI feature parity
⚠️ Loyalty integration complexity
⚠️ Reporting differences

COSTS:
- Year 1: $25K-100K implementation
- Subscription savings 40-60% typical
- ROI 12-24 měsíců

COMMON PITFALLS:
- SALESmanago contract terms scrutiny
- Underestimating implementation complexity
- Missing SAP backend integration
- Stakeholder resistance
```

---

## 4. SKUPINA B: CZ/SK lokální migrace

### 4.1 Scenario B1: SmartEmailing ↔ Ecomail (klasické switching)

```
RATIONALE:
- Najbližšní kompetitiři v CZ
- SmartEmailing → Ecomail: modernější UI + ecom features
- Ecomail → SmartEmailing: Mergado integrace, funnels
- Pricing comparable
- Velmi častý migration pattern

TARGET CUSTOMER PROFILE:
- CZ/SK SMB-mid e-shopy
- 1K-50K kontaktů
- Lokální podpora critical
- Email-focused
- Marketing manager má lokální preference

TIMELINE: 4-6 týdnů

WEEK 1: Discovery
- Tool comparison
- Workflow inventory
- Pricing comparison

WEEK 2: Setup + Data Migration
- New tool setup
- Data export source platform
- Import + cleanup
- Subscriber verification

WEEK 3-4: Workflow Rebuild
- Email templates rebuild
- Automation rebuild
- Mergado integration (if applicable)
- Other integrations

WEEK 5: Testing
- Test sends
- Parallel testing
- Subset migration

WEEK 6: Launch + Cutover
- Full migration
- Original tool sunset
- Performance monitoring

RISKS:
⚠️ Similar tools = less obvious benefit
⚠️ Template rebuild required
⚠️ Workflow logic differences
⚠️ Reporting differences

COSTS:
- Year 1: $2K-10K self-implementation
- Subscription comparable
- ROI mostly operational/UI

COMMON PITFALLS:
- Underestimating template rebuild
- Skipping automation testing
- Mergado integration (SmartEmailing → Ecomail loses Mergado)
- Insufficient parallel testing
```

### 4.2 Scenario B2: Ecomail → Leadhub (mid-market growth)

```
RATIONALE:
- E-shop roste z SMB na mid-market
- Ecomail SMB-mid sweet spot
- Leadhub mid-market sweet spot
- Pokročilá personalization needed
- CDP-lite capabilities
- Multi-channel orchestration

TARGET CUSTOMER PROFILE:
- CZ/SK e-shop $1M-20M revenue
- 5K-100K kontaktů
- Growing past SMB tools
- CDP-lite needs emerging
- More sophisticated automation

TIMELINE: 2-3 měsíce

WEEK 1-2: Discovery
- Ecomail audit
- Leadhub evaluation
- CDP need assessment
- Pricing comparison

WEEK 3-6: Setup + Migration
- Leadhub setup
- Data migration
- E-comm integration
- Custom integrations

WEEK 7-10: Workflow Rebuild
- Advanced workflows
- Personalization setup
- Multi-channel orchestration
- AI segmentation

WEEK 11-12: Testing + Launch
- Parallel testing
- Phased cutover
- Ecomail sunset

RISKS:
⚠️ Implementation complexity jump
⚠️ Team learning curve
⚠️ Cost increase
⚠️ Custom integrations

COSTS:
- Year 1: $15K-50K implementation
- Subscription increase 3-5×
- ROI 12-18 měsíců s right-fit

COMMON PITFALLS:
- Migrating too early (not ready for CDP)
- Underestimating learning curve
- Insufficient training budget
- Missing partner involvement
```

### 4.3 Scenario B3: Leadhub → Targito (CDP need)

```
RATIONALE:
- Leadhub CDP-lite capabilities
- Targito full CDP architecture
- "Nejpoužívanější CDP v ČR" claim
- 40+ activatable modules
- Targito AI (2024) integration

TARGET CUSTOMER PROFILE:
- CZ/SK mid-market
- 20K-500K kontaktů
- Multi-channel orchestration need
- True CDP need (not lite)
- Multiple data sources

TIMELINE: 4-6 měsíců

MONTH 1: Discovery
- Leadhub audit
- Targito evaluation
- CDP need validation
- ROI projections

MONTH 2-3: Setup + Migration
- Targito setup
- Multi-source ingestion setup
- Identity resolution config
- Data migration

MONTH 4-5: Workflow Rebuild
- Module activation
- Workflow design
- Channel orchestration
- AI setup

MONTH 6: Testing + Launch
- Parallel testing
- Phased cutover
- Leadhub sunset

RISKS:
⚠️ Implementation complexity high
⚠️ Custom integration requirements
⚠️ Team CDP learning curve
⚠️ Cost significant increase

COSTS:
- Year 1: $50K-150K implementation
- Subscription increase 2-3×
- ROI 18-24 měsíců

COMMON PITFALLS:
- CDP scope creep
- Underestimating multi-source complexity
- Insufficient governance setup
- Team capability gap
```

### 4.4 Scenario B4: Targito → Bloomreach (enterprise scale)

```
RATIONALE:
- Targito CZ-focused
- Need international expansion
- Bloomreach global enterprise CDXP
- Loomi AI engine
- 2. největší ecom dataset
- Mid-market+ scale

TARGET CUSTOMER PROFILE:
- CZ/SK mid-market → international
- 100K+ kontaktů
- Multi-region expansion
- DTC ecommerce focus
- True enterprise CDXP need

TIMELINE: 6-12 měsíců

MONTH 1-2: Discovery
- Targito audit
- Bloomreach evaluation
- Partner selection (Actum Digital, Adastra)
- Detailed planning

MONTH 3-6: Setup + Migration
- Bloomreach setup
- Multi-region setup
- Data migration
- E-comm integration
- Custom integrations

MONTH 7-10: Workflow Rebuild
- Customer Data Engine
- Loomi AI setup
- Multi-channel orchestration
- Personalization at scale

MONTH 11-12: Testing + Launch
- Parallel testing
- Phased cutover
- Targito sunset

RISKS:
⚠️ Implementation 6-12 měsíců
⚠️ Custom integration complexity
⚠️ Team capability requirements
⚠️ Cost significant ($5K-15K/mo Bloomreach)

COSTS:
- Year 1: $100K-300K implementation
- Subscription 3-5× increase
- ROI 18-30 měsíců

COMMON PITFALLS:
- Bloomreach event-based pricing surprise
- Underestimating implementation time
- Partner ecosystem dependency
- Stakeholder change management
```

### 4.5 Scenario B5: Boldem → SmartEmailing/Ecomail (outgrowing SMB)

```
RATIONALE:
- Boldem SMB+/nonprofit fokus
- Roste databáze + automation needs
- SmartEmailing/Ecomail mid-market features
- Better automation depth
- Better integrations

TARGET CUSTOMER PROFILE:
- CZ/SK SMB roste na mid-market
- 5K-30K kontaktů
- Need pokročilejší automation
- Integration needs

TIMELINE: 4-6 týdnů

WEEK 1: Discovery
- Tool selection (SmartEmailing vs. Ecomail)
- Pricing comparison
- Feature gap analysis

WEEK 2-3: Setup + Migration
- Data export from Boldem
- Import + cleanup
- Templates rebuild

WEEK 4-5: Workflow Rebuild
- Automation rebuild
- Integration setup
- Testing

WEEK 6: Launch + Cutover
- Parallel testing
- Full migration
- Boldem sunset

RISKS:
⚠️ Cost increase 2-3×
⚠️ Learning curve
⚠️ Feature complexity

COSTS:
- Year 1: $3K-10K self-implementation
- Subscription 2-3× increase
- ROI 12-18 měsíců

COMMON PITFALLS:
- Migrating prematurely
- Underestimating new tool complexity
- Insufficient training
```

---

## 5. SKUPINA C: Size progression paths SMB → Mid → Enterprise

### 5.1 SMB → MID progression paths

#### 5.1.1 Path C1: MailerLite → Klaviyo (DTC growth)

```
RATIONALE:
- MailerLite SMB-friendly
- DTC roste z SMB na mid
- Klaviyo industry standard DTC
- Predictive AI native
- Shopify deep integration

TIMELINE: 2-3 měsíce
COST: $10K-30K Year 1
SAVINGS REAL: $0 (typical 2-3× cost increase)
JUSTIFICATION: Revenue growth, predictive AI

WHEN TO MIGRATE:
- $500K-1M+ ARR DTC
- 5K-20K kontaktů
- Shopify-based
- Performance marketing-driven
```

#### 5.1.2 Path C2: Mailchimp → ActiveCampaign (B2B sophistication)

```
RATIONALE:
- Mailchimp B2C SMB
- B2B needs more automation
- ActiveCampaign 500+ recipes
- Light CRM included
- Better B2B fit

TIMELINE: 2-3 měsíce
COST: $10K-30K Year 1
SAVINGS REAL: $0 (typical cost increase)
JUSTIFICATION: B2B automation depth

WHEN TO MIGRATE:
- B2B SaaS / services
- 5K-50K kontaktů
- Outgrowing Mailchimp Standard
- Need lead scoring + automation
```

#### 5.1.3 Path C3: Brevo → HubSpot (B2B all-in-one)

```
RATIONALE:
- Brevo cheap omnichannel
- B2B needs CRM + marketing
- HubSpot all-in-one
- Sales + Marketing alignment
- Enterprise-ready

TIMELINE: 3-6 měsíců
COST: $30K-100K Year 1
SAVINGS REAL: $0 (typical $890+/mo HubSpot)
JUSTIFICATION: Sales + Marketing unification

WHEN TO MIGRATE:
- B2B mid-market
- 5K-50K kontaktů
- Sales team growing
- Multi-tool consolidation goal
```

#### 5.1.4 Path C4: Constant Contact → Klaviyo (ecom maturation)

```
RATIONALE:
- CC SMB email
- E-shop roste
- Klaviyo DTC standard
- Predictive analytics

TIMELINE: 2-3 měsíce
COST: $10K-30K Year 1
JUSTIFICATION: E-commerce sophistication

WHEN TO MIGRATE:
- E-shop $1M+ ARR
- 5K-25K kontaktů
- DTC focus
```

### 5.2 MID → ENTERPRISE progression paths

#### 5.2.1 Path C5: Klaviyo → Bloomreach (mid-market+ enterprise)

```
RATIONALE:
- Klaviyo DTC sweet spot
- Mid-market+ needs broader CDXP
- Bloomreach 11 channels
- Loomi AI
- Multi-brand orchestration

TIMELINE: 6-12 měsíců
COST: $100K-300K Year 1
JUSTIFICATION: Enterprise CDXP, multi-channel

WHEN TO MIGRATE:
- $50M+ revenue
- 500K+ kontaktů
- Multi-channel critical
- True CDP need
- Multi-brand portfolio
```

#### 5.2.2 Path C6: ActiveCampaign → SAP Emarsys (DACH retail enterprise)

```
RATIONALE:
- AC mid-market
- DACH retail enterprise needs
- SAP Emarsys retail king
- Omnichannel native
- SAP backend integration

TIMELINE: 6-12 měsíců
COST: $200K-500K Year 1
JUSTIFICATION: DACH retail enterprise scale

WHEN TO MIGRATE:
- DACH retail enterprise
- 100K+ kontaktů
- SAP backend
- Omnichannel critical
```

#### 5.2.3 Path C7: HubSpot Pro → Salesforce MC + Data 360 (CRM scale)

```
RATIONALE:
- HubSpot mid-market
- Enterprise CRM + Marketing alignment
- Salesforce ecosystem
- Data 360 + Einstein + Agentforce

TIMELINE: 6-12 měsíců
COST: $200K-500K Year 1
JUSTIFICATION: Enterprise CRM + Marketing unified

WHEN TO MIGRATE:
- Multi-cloud enterprise
- 100K+ contacts
- Sales-driven complex
- Multi-region
```

#### 5.2.4 Path C8: SALESmanago → ExpertSender (PL enterprise B2C)

```
RATIONALE:
- SALESmanago mid-market CEE
- ExpertSender enterprise B2C
- Higher deliverability
- Enterprise scale

TIMELINE: 6-12 měsíců
COST: $100K-300K Year 1
JUSTIFICATION: PL enterprise B2C scale

WHEN TO MIGRATE:
- PL enterprise B2C
- 500K+ kontaktů
- High volume sending
- Deliverability priority
```

### 5.3 Regional-specific progression paths

#### 5.3.1 Path C9: DACH SMB→Enterprise (CleverReach → SAP Emarsys / Mapp)

```
RATIONALE:
- CleverReach DACH SMB-mid
- DACH retail enterprise → SAP Emarsys
- DACH B2B enterprise → Mapp/Evalanche
- Inxmail alternative B2B

PROGRESSION PATH:
SMB: CleverReach / rapidmail
MID: CleverReach Plus / Inxmail Professional
ENTERPRISE: SAP Emarsys (retail) / Mapp/Evalanche (B2B+) / Inxmail Enterprise

TIMELINE per step: 3-6 měsíců
COST per step: $50K-200K
```

#### 5.3.2 Path C10: PL SMB→Enterprise (GetResponse → SALESmanago → ExpertSender)

```
RATIONALE:
- GetResponse SMB-mid PL origin
- SALESmanago mid-market AI
- ExpertSender enterprise B2C

PROGRESSION PATH:
SMB: GetResponse Email Marketing
MID: GetResponse Plus + Marketer / SALESmanago Standard
ENTERPRISE: SALESmanago Enterprise / ExpertSender / SARE

TIMELINE per step: 3-6 měsíců
COST per step: $50K-200K
```

#### 5.3.3 Path C11: CZ/SK SMB→Enterprise (Ecomail/SmartEmailing → Leadhub/Targito → Bloomreach)

```
RATIONALE:
- CZ/SK SMB: Ecomail / SmartEmailing / Boldem
- CZ/SK mid-market: Leadhub / Targito
- CZ/SK enterprise: Bloomreach / SALESmanago / Targito Enterprise

PROGRESSION PATH:
SMB ($0-1M revenue):
- Ecomail Basic / SmartEmailing Mini / Boldem

GROWING SMB ($1M-5M):
- Ecomail Profi / SmartEmailing Standard / Mailkit
- Ecomail Marketer / SmartEmailing Plus

MID-MARKET ($5M-50M):
- Leadhub Mid
- Targito Mid
- SALESmanago Standard

ENTERPRISE ($50M+):
- Bloomreach Engagement (CDXP)
- Targito Enterprise
- SAP Emarsys (if DACH retail)
- Salesforce MC (if Salesforce CRM)

TIMELINE per step: 3-6 měsíců
COST per step: $30K-150K
```

#### 5.3.4 Path C12: US SMB→Enterprise (Mailchimp → Klaviyo → Salesforce MC / Braze)

```
RATIONALE:
- Mailchimp SMB
- Klaviyo DTC mid-market
- Salesforce MC enterprise / Braze mobile-first

PROGRESSION PATH:
SMB: Mailchimp / Constant Contact (legacy)
MID: Klaviyo (DTC) / HubSpot (B2B) / ActiveCampaign
ENTERPRISE: Salesforce MC / Braze (mobile) / Bloomreach

TIMELINE per step: 3-6 měsíců
COST per step: $50K-300K
```

---

## 6. Common Migration Pitfalls

### 6.1 Top 15 chyby

```
1. ŠPATNÝ TIMING
- Peak season migration (BFCM, Christmas)
- Mid-campaign migration
- Team v transition
- Budget cycle mismatch

2. NEDOSTATEČNÁ DISCOVERY
- Skipping current state audit
- Underestimating workflow complexity
- Missing integration dependencies
- Ignoring team capabilities

3. PŘEHNANÉ OČEKÁVÁNÍ
- "Nová platforma vyřeší vše"
- Magic AI thinking
- Quick win thinking
- ROI overpromise

4. NEDOSTATEK PARALLEL RUN
- "Cutover overnight"
- No rollback option
- Insufficient validation
- Quick failures

5. ŠPATNÉ IP STRATEGY
- No IP warmup plan (dedicated)
- Reputation reset
- Volume spike
- Spam complaints surge

6. DATA QUALITY ISSUES
- Migrating dirty DB
- Lost consent records
- Duplicate profiles
- Missing custom fields

7. INTEGRATION GAPS
- Custom systems forgotten
- API rate limits
- Webhook reliability
- Real-time sync issues

8. TEAM CAPABILITY GAP
- Insufficient training
- New tool learning curve
- Skill gap unaddressed
- Resistance to change

9. STAKEHOLDER ALIGNMENT
- Executive sponsor weak
- Cross-team conflicts
- Communication gaps
- Power struggles

10. PARTNER QUALITY
- Wrong partner selection
- Partner capacity issues
- Partner experience gap
- Communication problems

11. COMPLIANCE OVERSIGHT
- Consent not transferred
- GDPR records missing
- Audit trail lost
- Multi-jurisdiction confusion

12. WORKFLOW REBUILD UNDERESTIMATE
- "Just copy paste"
- Logic differences ignored
- Edge cases missed
- Testing insufficient

13. REPORTING DIFFERENCES
- Metrics definitions different
- Historical data lost
- Attribution model change
- BI integration gaps

14. CONTRACT EXIT ISSUES
- Old vendor exit clauses
- Multi-year commitments
- Data export limitations
- Notice period requirements

15. POST-MIGRATION NEGLECT
- No 30/60/90 day review
- No ongoing optimization
- Team support drops
- Vendor relationship deteriorates
```

### 6.2 Per-scenario specific pitfalls

```
DOWNSIZING MIGRATIONS:
⚠️ Cutting too many features at once
⚠️ Team resistance
⚠️ Vendor exit clauses
⚠️ ROI overestimation

UPGRADING MIGRATIONS:
⚠️ Implementation complexity underestimate
⚠️ Cost overrun
⚠️ Team capability gap
⚠️ Feature paralysis

CZ/SK MIGRATIONS:
⚠️ Mergado integration (SmartEmailing → Ecomail)
⚠️ Lokální support transitions
⚠️ Custom CZ integrations
⚠️ ČJ template issues

CDP MIGRATIONS:
⚠️ Multi-source ingestion complexity
⚠️ Identity resolution setup
⚠️ Real-time architecture
⚠️ Governance design

ENTERPRISE MIGRATIONS:
⚠️ 6-12 měsíční timeline
⚠️ Multi-stakeholder alignment
⚠️ Custom integrations
⚠️ Compliance multi-jurisdiction
⚠️ Implementation $100K-500K+
```

---

## 7. Migration Costs Estimates

### 7.1 Cost breakdown per migration type

```
DOWNSIZING / SAME-TIER MIGRACE:
$2K-25K typically

Components:
- Self-implementation: $0-5K
- Partner-led basic: $5K-15K
- Template rebuild: $2K-5K
- Training: $1K-3K
- Contingency: $2K-5K

UPGRADING SMB → MID:
$10K-50K typically

Components:
- Implementation: $5K-25K
- Custom integration: $5K-15K
- Workflow rebuild: $5K-15K
- Training: $2K-5K
- Contingency: $5K-10K

UPGRADING MID → ENTERPRISE:
$50K-300K typically

Components:
- Implementation partner: $25K-150K
- Custom integration: $10K-50K
- Workflow rebuild: $10K-50K
- Training + governance: $5K-25K
- Compliance: $5K-25K
- Contingency: $10K-50K

ENTERPRISE → ENTERPRISE:
$100K-500K+ typically

Components:
- Implementation: $50K-250K
- Custom integration: $25K-100K
- Workflow rebuild: $25K-100K
- Training + governance: $10K-50K
- Compliance multi-jurisdiction: $10K-50K
- Project management: $25K-100K
- Contingency: $25K-100K
```

### 7.2 Hidden migration costs

```
OFTEN MISSED:

1. PARALLEL RUN COSTS
- Both platforms running 30-90 dní
- Double subscription period
- Resource duplication

2. TEAM PRODUCTIVITY LOSS
- 20-50% productivity during migration
- 2-6 měsíců typically
- Opportunity cost significant

3. INTEGRATION REBUILD
- Custom systems integration
- API rate limit upgrades
- Webhook reliability infrastructure

4. CONTENT MIGRATION
- Email templates rebuild
- Landing pages rebuild
- Asset library transfer

5. TRAINING + CERTIFICATION
- Team training time
- Certification programs
- Knowledge transfer

6. COMPLIANCE LEGAL
- GDPR consultation
- Multi-jurisdiction review
- Audit trail setup

7. EXIT COSTS PREVIOUS VENDOR
- Notice period subscription
- Data export fees
- Contract penalties

8. PR + COMMUNICATION
- Customer communication
- Subscriber re-confirmation
- Brand consistency

9. OPPORTUNITY COSTS
- Delayed campaigns
- Missed seasonal opportunities
- Resource diversion

10. POST-LAUNCH OPTIMIZATION
- 90-day review costs
- Ongoing partner support
- Performance tuning
```

---

## 8. Migration Partner Network

### 8.1 CZ/SK migration partners

```
TOP CZ/SK PARTNERS:

ACTUM DIGITAL:
- Bloomreach Engagement partner
- Czech consultancy
- Multi-vendor experience
- Enterprise focus

ADASTRA:
- Bloomreach Engagement key partner
- CZ/SK origin
- Enterprise scale
- Custom integrations

MERGADO:
- E-commerce focus
- SmartEmailing ekosystém
- Mid-market CZ/SK

REENGAGE / ECOMAIL CONSULTING:
- Ecomail specific
- SMB-mid focus

OTHER CZ AGENCIES:
- TAVI (CZ ecom)
- ROI Hunter (performance + email)
- Performance Media (email)
- Specific tools each
```

### 8.2 DACH migration partners

```
TOP DACH PARTNERS:

SAP CONSULTING:
- SAP Emarsys
- Enterprise retail focus

DEEPSPACE:
- Mapp/Evalanche specialist
- DACH B2B + B2C

ELASTIQUE:
- DACH digital agency
- Multiple tools

OTHER:
- Region-specific agencies
- Tool-specific partners
```

### 8.3 PL migration partners

```
TOP PL PARTNERS:

ALLEGRO ADVISORS:
- E-commerce focused

MARKETOWICZ:
- SALESmanago specialist

OTHER:
- Region-specific agencies
- Tool-specific partners
```

### 8.4 Global migration partners

```
TOP GLOBAL PARTNERS:

CAPGEMINI:
- Enterprise scale
- Multi-vendor
- Global presence

DELOITTE DIGITAL:
- Salesforce specialist
- Enterprise
- Multi-cloud

ACCENTURE INTERACTIVE:
- Enterprise scale
- Multi-vendor
- Global presence

IBM CONSULTING:
- Enterprise scale
- Watson AI integration

OTHER:
- PWC, EY (Big 4)
- Region-specific giants
- Boutique specialists
```

### 8.5 Partner selection criteria

```
KEY CRITERIA:

1. RELEVANT EXPERIENCE
- Same target platform
- Same industry
- Same size customer
- References available

2. CERTIFICATION
- Platform partner status
- Tier (Gold/Platinum)
- Certified specialists count

3. APPROACH
- Methodology proven
- Process documentation
- Project management

4. TEAM
- Senior consultants
- Dedicated team
- Local language

5. PRICING
- Fixed price vs. T&M
- Milestone-based
- Risk-sharing options

6. TIMELINE COMMITMENT
- Realistic estimates
- Milestone tracking
- Penalty/bonus structure

7. POST-PROJECT SUPPORT
- Ongoing relationship
- Quarterly reviews
- Training continuation

8. CULTURAL FIT
- Communication style
- Geographic presence
- Time zone alignment
```

---

## 9. Pre-Migration Audit Checklist

### 9.1 Comprehensive audit checklist

```
PŘED MIGRACÍ ZKONTROLUJ:

CURRENT STATE:
☐ Subscriber count current
☐ Active vs. inactive split
☐ Consent records complete
☐ List hygiene baseline
☐ Bounce rate baseline
☐ Engagement metrics baseline
☐ Revenue baseline
☐ Sender domain authentication
☐ IP reputation status

WORKFLOWS:
☐ All workflows documented
☐ Logic flows mapped
☐ Trigger conditions noted
☐ Email templates inventory
☐ A/B test history
☐ Segmentation rules
☐ Custom fields used

INTEGRATIONS:
☐ E-commerce platform integrations
☐ CRM integration
☐ Web tracking SDK
☐ Custom integrations
☐ API usage patterns
☐ Webhook destinations

DATA QUALITY:
☐ Data dictionary
☐ Custom fields used
☐ Behavioral history scope
☐ Transactional data
☐ Consent timestamps
☐ Source attribution

TEAM CAPABILITIES:
☐ User accounts inventory
☐ Skill levels assessment
☐ Training needs
☐ Champion identification

VENDOR CONTRACT:
☐ Renewal date
☐ Exit clauses
☐ Notice period
☐ Data export rights
☐ Penalty clauses

COMPLIANCE:
☐ GDPR records
☐ ePrivacy compliance
☐ Consent management
☐ Multi-jurisdiction
☐ Audit trail
```

### 9.2 Risk assessment

```
RISK CATEGORIES:

HIGH RISK (must address):
☐ Critical workflows complexity
☐ Custom integration count
☐ Data quality issues
☐ Compliance gaps
☐ Team skill gaps
☐ Vendor exit penalties

MEDIUM RISK (should address):
☐ Template rebuild scope
☐ Reporting differences
☐ Integration complexity
☐ Stakeholder alignment

LOW RISK (monitor):
☐ Pricing transition
☐ UI differences
☐ Brand consistency
```

---

## 10. Post-Migration Validation

### 10.1 30/60/90 day reviews

```
30-DAY REVIEW:
☐ Send volume metrics
☐ Deliverability metrics
☐ Engagement metrics
☐ Revenue metrics
☐ Issue tracking
☐ Team feedback
☐ Quick wins identification

60-DAY REVIEW:
☐ Workflow performance
☐ Integration stability
☐ AI/predictive performance
☐ Customer feedback
☐ ROI tracking
☐ Optimization opportunities

90-DAY REVIEW:
☐ Strategic alignment
☐ Business case validation
☐ ROI realized
☐ Team adoption
☐ Vendor relationship
☐ Future roadmap
```

### 10.2 Key metrics to validate

```
DELIVERABILITY METRICS:
- Inbox placement rate
- Bounce rate (hard + soft)
- Spam complaint rate
- Sender reputation
- Blocklist status

ENGAGEMENT METRICS:
- Open rate
- Click-through rate
- Click-to-open ratio
- Conversion rate
- Unsubscribe rate

REVENUE METRICS:
- Email revenue
- Revenue per email
- Customer LTV impact
- ROI calculation

OPERATIONAL METRICS:
- Workflow execution
- Integration uptime
- API response time
- Support ticket volume
- Team productivity

COMPLIANCE METRICS:
- Consent records integrity
- Suppression list functioning
- Right-to-be-forgotten requests
- Audit trail completeness
```

---

## 11. Závěr 2026

### 11.1 Klíčové migration insights

1. **Migrace = nejnáročnější marketing projekt** typically
2. **6-12 měsíců** enterprise standard timeline
3. **Year 1 TCO 2-5×** subscription cost typical
4. **Parallel run 30-90 dní** kriticky
5. **IP warmup** kriticky pro dedicated IP migrations
6. **Data quality first**, then migrate
7. **Partner selection** = key success factor
8. **Stakeholder alignment** = often missed
9. **Team training** = ongoing not one-time
10. **Compliance migration** = legal review required
11. **Workflow rebuild** = always longer than expected
12. **Integration complexity** = always underestimated
13. **Post-migration optimization** = where ROI realized
14. **Vendor exit** = often complicated
15. **Don't rush** = quality > speed

### 11.2 Migration success principles

```
1. PLAN > EXECUTION
- Detailed planning
- Risk identification
- Stakeholder buy-in
- Realistic timeline

2. TEAM > TOOLS
- Capability development
- Change management
- Communication
- Training continuation

3. DATA > TEMPLATES
- Data quality first
- Consent verification
- Identity resolution
- Historical preservation

4. TESTING > LAUNCH
- Parallel running
- Edge case testing
- Performance validation
- Rollback options

5. ITERATION > BIG BANG
- Phased rollouts
- Quick wins first
- Continuous optimization
- Long-term commitment
```

### 11.3 Final recommendation

```
PRO TVŮJ MIGRATION:

1. AUDIT BEFORE DECIDING
- Current state thorough
- Business case clear
- Data quality assessed

2. EVALUATE THOROUGHLY
- 2-3 vendors competing
- Reference customer calls
- Demo extensively
- Partner ecosystem

3. PLAN COMPREHENSIVELY
- 6+ měsíců timeline
- Realistic resourcing
- Risk mitigation
- Stakeholder alignment

4. EXECUTE WITH RIGOR
- Parallel running
- Testing extensive
- Communication continuous
- Quality > speed

5. OPTIMIZE CONTINUOUSLY
- 30/60/90 reviews
- Long-term partnership
- Capability development
- Strategic alignment
```

---

## 12. Decision tree: kdy a kam migrovat

### 12.1 Decision framework

```
START:
Migration je správné rozhodnutí?

→ Q1: Je nový business case clear (ROI > switching cost)?
  - YES → continue
  - NO → STOP, vyřeš current platform first

→ Q2: Je team kapacita dostatečná (resources, skills, time)?
  - YES → continue
  - NO → STOP nebo invest v capability building

→ Q3: Je timing dobré (mimo peak season, budget cycle align)?
  - YES → continue
  - NO → DELAY o 3-6 měsíců

→ Q4: Jsou data ready (clean, consented, complete)?
  - YES → continue
  - NO → CLEANUP first (3-6 měsíců typically)

→ Q5: Je partner identified (interní champion + external partner)?
  - YES → PROCEED with migration plan
  - NO → SELECT partner first

PŘÍKLAD SCENARIO:

Mid-market e-shop $20M revenue:
- Current: Mailchimp ($800/mo)
- Need: predictive AI + automation depth
- Target candidates:
  - Klaviyo ($1500-2500/mo) - DTC standard
  - ActiveCampaign ($800-1500/mo) - automation
  - Brevo ($400-800/mo) - cheap

→ Q1: ROI clear? YES (DTC growth)
→ Q2: Team ready? YES (with training)
→ Q3: Timing? Q1 after BFCM = YES
→ Q4: Data ready? Need 60-day cleanup
→ Q5: Partner? Self-implementation possible

DECISION: Migrate to Klaviyo Q1 next year
TIMELINE: 2-3 měsíce + 60 dní pre-cleanup
BUDGET: $25K-50K Year 1
```

---

_Dokument zpracován z 54 detailních deep-dive analýz (01-54) a verified web sources 2026. Migration scenarios jsou typické patterny – tvoje situace má specifika. Vždy consult s implementation partnerem před začátkem migrace._
