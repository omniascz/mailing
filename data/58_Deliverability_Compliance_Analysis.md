# Deliverability + Compliance napříč 27 platformami – hloubková analýza

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Konsolidovaná analýza deliverability claims, GDPR compliance, autentizace (SPF/DKIM/DMARC), blacklist management, opt-in praktik, a regulatorní compliance napříč všemi 27 platformami.

> Tento dokument je **vertikální deep-dive** napříč všemi platformami. Pro detaily jednotlivých platforem viz dokumenty 01-54.

---

## Obsah

1. [Deliverability claims (97% claims explained)](#1-deliverability-claims)
2. [Autentizace (SPF / DKIM / DMARC) per platforma](#2-autentizace)
3. [GDPR compliance level](#3-gdpr)
4. [Per platforma: deliverability profile](#4-per-platforma)
5. [Compliance certifikace (ISO, SOC 2, atd.)](#5-certifikace)
6. [Blacklist management + IP reputation](#6-blacklist)
7. [Opt-in praktiky + double opt-in](#7-opt-in)
8. [Dedicated IPs + Shared IPs](#8-ip-strategie)
9. [Regulatorní compliance per region](#9-regulatorni)
10. [Red flags + známé problémy](#10-red-flags)

---

## 1. Deliverability claims (97% claims explained)

### 1.1 Publikovaná čísla

```
PLATFORMY S PUBLIKOVANÝM DELIVERABILITY:

Constant Contact: 97% ⭐
- Per oficiální claim
- Most publicly transparent
- "Other companies are strangely shy about
   their deliverability rates. We're not."

Mailkit: 98%+ ⭐
- Per oficiální (CZ transactional)
- Specialized transactional infrastructure

EmailLabs: ~99% ⭐
- Per oficiální (PL pure SMTP)
- Transactional specialist

Klaviyo: 95-98%
- Per oficiální documentation
- DTC ecommerce focus

SAP Emarsys: 95%+
- Enterprise retail
- Per case studies

Mailchimp: 96-99%
- Internal data
- Tier-dependent (Premium = best)

Brevo: 95%+
- Improved historically
- Per oficiální data

ZBYTEK = nepublikuje konkrétní %
nebo jen claims bez data
```

### 1.2 Co znamená "97%" reálně

```
97% deliverability MŮŽE znamenat:

INTERPRETACE A (optimistická):
- 97% emails reach inbox
- 3% bounce/blocked/spam
- = excellent score

INTERPRETACE B (skeptická):
- 97% delivered to server (= not bounced)
- "Inbox placement" = jiná metrika
- Inbox placement reálně 70-90%
- Spam folder placement = 7-20%

INTERPRETACE C (industry standard):
- Various measurement methodologies
- Self-reported = méně reliable
- Third-party reports (e.g. Litmus, Sender Score)
   = more reliable

KEY METRIKY:
- Delivery rate (server accepted)
- Inbox placement rate (skutečné inbox)
- Spam folder rate
- Bounce rate
- Engagement-weighted reputation
```

### 1.3 Industry benchmarks 2026

```
Per Litmus/Sender Score reports 2026:

EMAIL MARKETING TOOLS:
- Inbox placement average: 85%
- Best in class: 92%+
- Below average: <80%
- Industry varies (DTC vs. B2B vs. Newsletter)

GEOGRAPHIC VARIATIONS:
- USA: 80-90% inbox typical
- EU: 75-85% inbox typical
- APAC: 70-80% inbox typical
- LATAM: 70-80% inbox typical
- Spam-heavy regions challenging

SENDER REPUTATION FACTORS:
- IP reputation
- Domain reputation
- Engagement metrics
- Spam complaint rate
- List hygiene
- Authentication setup
```

### 1.4 Faktory ovlivňující deliverability

```
PLATFORMA-INDEPENDENT factors:

LIST QUALITY (most important!):
- Permission-based lists
- Active engagement
- Regular cleaning
- Sunset inactive
- Verified opt-ins

CONTENT QUALITY:
- Avoid spam triggers
- Image-to-text ratio
- Link quality
- Personalization (good)
- Generic templates (bad)

ENGAGEMENT METRICS:
- Open rates (positive signal)
- Click rates (positive)
- Reply rates (very positive)
- Spam complaints (very negative)
- Unsubscribes (neutral if low)

AUTHENTICATION:
- SPF setup correctly
- DKIM signing
- DMARC alignment
- BIMI (newer)

SENDING PATTERNS:
- Consistent volume
- Predictable timing
- No sudden spikes
- Warm-up new IPs
- Domain reputation building

LIST HYGIENE:
- Email validation
- Bounce handling
- Suppression management
- Regular cleaning
```

---

## 2. Autentizace (SPF / DKIM / DMARC) per platforma

### 2.1 Autentizace standardy

```
EMAIL AUTHENTICATION STANDARDS:

SPF (Sender Policy Framework):
- Verifies sending server authorized
- DNS TXT record
- Required for deliverability

DKIM (DomainKeys Identified Mail):
- Cryptographic signature
- Verifies email integrity
- DNS TXT record (selector)
- Required for Gmail/Yahoo 2024+

DMARC (Domain-based Message Authentication):
- Policy + reporting
- Builds on SPF + DKIM
- DNS TXT record
- Required for bulk senders 2024+

BIMI (Brand Indicators):
- Logo display in inbox
- Requires DMARC enforced
- Newer (2022+)
- Trust signal
```

### 2.2 Yahoo/Google 2024+ requirements

```
NEW REQUIREMENTS 2024+:

Pro Gmail + Yahoo bulk senders (5K+ emails/day):

✅ SPF authentication required
✅ DKIM signing required
✅ DMARC published required
✅ Easy unsubscribe (RFC 8058)
✅ Spam rate < 0.3%
✅ Authenticated subdomain recommended

KONSEKVENCE NESPLNĚNÍ:
- Emails to spam folder
- Bouncing
- Domain reputation damage
- Significant deliverability impact
```

### 2.3 Per platforma autentizace setup

```
AUTENTIZACE SUPPORT (všechny mainstream tools):

ŠPIČKOVÉ (best practices guidance):
- Mailchimp (clear docs)
- Klaviyo (good guidance)
- HubSpot (B2B focused)
- ActiveCampaign
- Brevo
- Bloomreach Engagement
- Salesforce MC (enterprise)
- SAP Emarsys (enterprise)

DOBRÉ (functional setup):
- MailerLite
- GetResponse
- Constant Contact
- Klaviyo
- SmartEmailing
- Ecomail
- CleverReach
- rapidmail

ENTERPRISE STANDARDS:
- Salesforce MC
- SAP Emarsys
- Bloomreach
- Braze
- Inxmail
- Mapp/Evalanche
- Mailkit

TRANSAKČNÍ FOCUS:
- EmailLabs (PL)
- Mailkit (CZ)
- Brevo Transactional
- Mailchimp Transactional (ex-Mandrill)
```

### 2.4 BIMI support

```
BIMI (newer, 2022+):

✅ Native BIMI support:
- Salesforce MC
- Bloomreach
- Klaviyo (announced)
- Mailchimp (configurable)

⚠️ BIMI requires:
- DMARC enforced (p=quarantine or reject)
- VMC (Verified Mark Certificate) optional
- Trust signal in inbox

⚠️ BIMI status 2026:
- Gmail/Yahoo support
- Apple Mail support
- Outlook limited
- BIMI logo display = visual trust
```

---

## 3. GDPR compliance level

### 3.1 GDPR požadavky 2026

```
GDPR (2018+) klíčové požadavky:

CONSENT MANAGEMENT:
- Explicit opt-in (not pre-checked)
- Granular consent options
- Easy withdrawal
- Documented consent
- Verifiable consent

DATA RIGHTS:
- Right to access
- Right to deletion (right to be forgotten)
- Right to portability
- Right to rectification
- Right to object

DATA PROCESSING:
- Lawful basis required
- Purpose limitation
- Data minimization
- Storage limitation
- Accuracy

SECURITY:
- Appropriate technical measures
- Encryption (at rest + transit)
- Access controls
- Audit logs
- Breach notification (72 hodin)

TRANSFER:
- EU → outside EU restrictions
- Standard Contractual Clauses (SCC)
- Adequacy decisions
- Schrems II implications
```

### 3.2 Per platforma GDPR level

```
GDPR COMPLIANCE LEVELS:

⭐⭐⭐⭐⭐ FULL GDPR (EU-built):
- Brevo (FR origin)
- Newsletter2Go (DE origin)
- CleverReach (DE)
- rapidmail (DE)
- Inxmail (DE)
- Mapp (DE + CH)
- SAP Emarsys (DE/AT)
- MailerLite (LT)
- GetResponse (PL)
- SARE (PL)
- SALESmanago (PL)
- ExpertSender (PL)
- EmailLabs (PL)
- SmartEmailing (CZ)
- Ecomail (CZ)
- Mailkit (CZ)
- Boldem (CZ)
- Leadhub (CZ)
- Targito (CZ)
- Bloomreach (SK/CZ origin, USA HQ)

⭐⭐⭐⭐ FULL GDPR (US with EU presence):
- Mailchimp (US, with EU compliance)
- HubSpot (US, with EU compliance)
- Klaviyo (US, with EU compliance)
- ActiveCampaign (US, with EU compliance)
- Constant Contact (US, with EU compliance)
- Salesforce MC (US, full compliance suite)
- Braze (US, with EU compliance)

⭐⭐⭐⭐ SCC + EU data centers:
- Mailchimp (EU data centers)
- Klaviyo (EU data centers)
- HubSpot (EU data centers)
- Salesforce (EU pods)
- Most enterprise tools
```

### 3.3 Schrems II + data transfers

```
SCHREMS II (2020) IMPACT:

US → EU data transfer challenges:
- Privacy Shield invalidated
- Standard Contractual Clauses (SCC) used
- Supplementary measures required
- EU customers concerned about US tools

CURRENT STATE 2026:
- Most US tools have EU data residency
- Mailchimp: EU data center option
- Klaviyo: EU servers
- HubSpot: EU instance
- Salesforce: EU pods
- ActiveCampaign: EU servers
- Brevo: native EU (FR)
- All German/Polish/Czech tools: EU native

KEY INSIGHT:
- US tools require careful DPA review
- EU-native tools = simpler compliance
- Document data flows
```

### 3.4 Cookie consent + ePrivacy

```
ePrivacy + cookies (EU):

REQUIREMENTS:
- Cookie banner
- Granular consent
- Pre-checked boxes prohibited
- Reject all option
- Storage of consent records

PLATFORMA SUPPORT:
- Tracking cookies management
- Consent capture forms
- Documentation
- Integration s consent managers
- CMPs (Consent Management Platforms)
```

---

## 4. Per platforma: deliverability profile

### 4.1 Mailchimp – deliverability profile

```
DELIVERABILITY MAILCHIMP:

CLAIMS:
- 96-99% delivery rate
- Tier-dependent

INFRASTRUCTURE:
- Shared IPs (most plans)
- Dedicated IP (Premium add-on)
- Multi-region data centers
- AWS hybrid

AUTHENTICATION:
- SPF + DKIM automatic
- DMARC support
- BIMI configurable

GDPR:
- Full GDPR compliance
- EU data center option
- Standard DPA available
- Data residency choice

ISSUES:
- Free plan shared IPs less reliable
- Spam rates higher on lower tiers
- Reputation IP-dependent

BEST FOR DELIVERABILITY:
- Mailchimp Premium
- Authenticated domain
- Active engagement
```

### 4.2 HubSpot – deliverability

```
DELIVERABILITY HUBSPOT:

CLAIMS:
- Enterprise-grade
- B2B focused
- Tier-dependent

INFRASTRUCTURE:
- Shared IPs default
- Dedicated IP (Enterprise)
- Multi-region

AUTHENTICATION:
- SPF + DKIM standard
- DMARC support
- BIMI configurable

GDPR:
- Full GDPR
- EU data center
- B2B focus = different patterns

B2B SPECIFIC:
- Lower volume than B2C
- Higher engagement expected
- Sales sequences impact
```

### 4.3 Brevo – deliverability

```
DELIVERABILITY BREVO:

HISTORICAL CONTEXT:
- Older (Sendinblue) had deliverability issues
- Improved 2020-2024
- Now 95%+ claims

INFRASTRUCTURE:
- Shared IPs default
- Dedicated IPs (Business+)
- Multi-region
- Transactional infrastructure separate

AUTHENTICATION:
- SPF + DKIM standard
- DMARC support
- BIMI configurable

GDPR:
- Full GDPR (FR native)
- EU data centers
- Strong privacy posture

PRICING ADVANTAGE:
- Unlimited contacts pricing
- = no incentive to remove unsubscribes
- Can hurt deliverability if not careful
```

### 4.4 Klaviyo – deliverability

```
DELIVERABILITY KLAVIYO:

CLAIMS:
- 95-98% inbox placement
- Continuous reputation monitoring

INFRASTRUCTURE:
- Dedicated IPs encouraged (high volume)
- Shared IPs available
- Multi-region

AUTHENTICATION:
- SPF + DKIM automatic
- DMARC + BIMI support

GDPR:
- Full GDPR
- EU servers available
- Strong DTC focus

DTC SPECIFIC:
- High engagement expected
- Behavior-based segmentation
- Engagement-weighted reputation
```

### 4.5 ActiveCampaign – deliverability

```
DELIVERABILITY ACTIVECAMPAIGN:

CLAIMS:
- Standard industry
- Mid-market focus

INFRASTRUCTURE:
- Shared IPs
- Dedicated IPs (Enterprise)
- Multi-region

AUTHENTICATION:
- SPF + DKIM standard
- DMARC support

GDPR:
- Full GDPR
- EU servers
```

### 4.6 GetResponse – deliverability

```
DELIVERABILITY GETRESPONSE:

CLAIMS:
- 99% delivery rate (industry standard)
- PL origin = strong EU compliance

INFRASTRUCTURE:
- Shared IPs default
- Dedicated IPs (Enterprise)
- EU-first focus

AUTHENTICATION:
- SPF + DKIM standard
- DMARC support

GDPR:
- Full GDPR (PL native)
- Strong EU compliance
- PL data center
```

### 4.7 MailerLite – deliverability

```
DELIVERABILITY MAILERLITE:

CLAIMS:
- High deliverability (specific % not published)
- Modern infrastructure

INFRASTRUCTURE:
- Shared IPs
- Dedicated IPs available
- Multi-region

AUTHENTICATION:
- SPF + DKIM automatic
- DMARC support

GDPR:
- Full GDPR (LT origin)
- Strong EU compliance
- EU data centers
```

### 4.8 Constant Contact – deliverability

```
DELIVERABILITY CONSTANT CONTACT:

CLAIMS:
- 97% (oficiálně publikováno!)
- "We're proud of that"

INFRASTRUCTURE:
- Shared IPs
- Dedicated IPs (Premium)
- US-primary

AUTHENTICATION:
- SPF + DKIM automatic
- DMARC support

GDPR:
- Full GDPR (US-based, EU compliant)
- EU data center option

ISSUES:
- 97% může být "delivered to server" metric
- Skutečné inbox placement = nepublikováno
- Auto-upgrade trap impacts list quality
```

### 4.9 SAP Emarsys – deliverability

```
DELIVERABILITY SAP EMARSYS:

CLAIMS:
- Enterprise-grade
- Retail focus
- Tier-dependent

INFRASTRUCTURE:
- Dedicated IPs standard (enterprise)
- Multi-region
- SAP cloud backbone

AUTHENTICATION:
- Full enterprise authentication
- SPF + DKIM + DMARC + BIMI
- Custom domains

GDPR:
- Full GDPR (DE/AT native)
- EU data centers
- Strong enterprise compliance
- SAP corporate standards
```

### 4.10 Salesforce MC – deliverability

```
DELIVERABILITY SALESFORCE MC:

CLAIMS:
- Enterprise-grade
- Per-customer tiered

INFRASTRUCTURE:
- Dedicated IPs (Enterprise)
- Multi-region pods
- Salesforce cloud backbone
- Premium Sender Reputation

AUTHENTICATION:
- Full enterprise authentication
- SPF + DKIM + DMARC + BIMI
- Custom domains
- Sender Authentication Package (SAP)

GDPR:
- Full GDPR
- EU pods available
- Strong enterprise compliance
- Salesforce corporate standards

ENTERPRISE SPECIFIC:
- Sender Reputation Management
- ISP relationships
- Compliance team support
```

### 4.11 Bloomreach Engagement – deliverability

```
DELIVERABILITY BLOOMREACH:

CLAIMS:
- Enterprise-grade
- 95%+ typical

INFRASTRUCTURE:
- Shared + dedicated IPs
- EU + US data centers
- In-memory framework
- Real-time processing

AUTHENTICATION:
- Full enterprise authentication
- SPF + DKIM + DMARC
- BIMI configurable

GDPR:
- Full GDPR (SK/CZ origin)
- EU compliance native
- EU data centers
- DPA standard
```

### 4.12 SALESmanago – deliverability

```
DELIVERABILITY SALESMANAGO:

CLAIMS:
- Enterprise focus
- PL origin = strong EU

INFRASTRUCTURE:
- Shared + dedicated IPs
- EU servers
- Multi-region

AUTHENTICATION:
- Standard enterprise
- SPF + DKIM + DMARC

GDPR:
- Full GDPR (PL native)
- EU data centers
- Strong CEE compliance
```

### 4.13 SmartEmailing – deliverability

```
DELIVERABILITY SMARTEMAILING:

CLAIMS:
- CZ infrastructure
- Strong CZ ISP relationships

INFRASTRUCTURE:
- CZ data centers
- Shared IPs default
- Dedicated available

AUTHENTICATION:
- SPF + DKIM standard
- DMARC support
- CZ-specific best practices

GDPR:
- Full GDPR (CZ native)
- CZ data residency
- Strong local compliance
```

### 4.14 Ecomail – deliverability

```
DELIVERABILITY ECOMAIL:

CLAIMS:
- CZ infrastructure
- Strong CZ deliverability

INFRASTRUCTURE:
- CZ + EU data centers
- Shared IPs default
- Modern infrastructure

AUTHENTICATION:
- SPF + DKIM automatic
- DMARC support
- CZ-specific guidance

GDPR:
- Full GDPR (CZ native)
- CZ data residency
- Strong local compliance
```

### 4.15 Mailkit – deliverability ⭐

```
DELIVERABILITY MAILKIT:

CLAIMS:
- 98%+ deliverability
- Transactional specialist

INFRASTRUCTURE:
- Dedicated CZ infrastructure
- Multi-region
- High-volume bulk
- Specialized transactional

AUTHENTICATION:
- Best practice enforcement
- SPF + DKIM + DMARC
- ISP relationships

GDPR:
- Full GDPR (CZ native)
- CZ data residency
- Banking-grade compliance

ENTERPRISE CZ:
- ČSOB, Česká spořitelna, Vodafone CZ
- Banking + telco customers
- Highest CZ deliverability claims
```

### 4.16 Boldem – deliverability

```
DELIVERABILITY BOLDEM:

CLAIMS:
- Standard SMB
- CZ infrastructure

INFRASTRUCTURE:
- CZ servers
- Shared IPs
- Newer company (2018)

AUTHENTICATION:
- SPF + DKIM standard
- DMARC support

GDPR:
- Full GDPR (CZ native)
- CZ data residency
```

### 4.17 Targito – deliverability

```
DELIVERABILITY TARGITO:

CLAIMS:
- CDP-driven
- CZ enterprise focus

INFRASTRUCTURE:
- CZ + EU
- Enterprise grade
- Custom IPs available

AUTHENTICATION:
- Full enterprise
- SPF + DKIM + DMARC

GDPR:
- Full GDPR (CZ native)
- Strong local compliance
- 360° customer view
```

### 4.18 Leadhub – deliverability

```
DELIVERABILITY LEADHUB:

CLAIMS:
- Standard mid-market
- CZ/SK focus

INFRASTRUCTURE:
- CZ servers
- Shared + dedicated
- Mid-market focus

AUTHENTICATION:
- Standard
- SPF + DKIM + DMARC

GDPR:
- Full GDPR
- CZ/SK compliance
```

### 4.19 CleverReach – deliverability

```
DELIVERABILITY CLEVERREACH:

CLAIMS:
- DACH SMB focus
- "Made in Germany"

INFRASTRUCTURE:
- DE data centers
- Shared IPs default
- Dedicated available

AUTHENTICATION:
- SPF + DKIM standard
- DMARC support
- DE best practices

GDPR:
- Full GDPR (DE native)
- DE data residency
- Strong DACH compliance
```

### 4.20 rapidmail – deliverability

```
DELIVERABILITY RAPIDMAIL:

CLAIMS:
- "100% server in Germany"
- DACH SMB ultra-simple

INFRASTRUCTURE:
- DE data centers exclusively
- Shared IPs default
- "Made in Germany" badge

AUTHENTICATION:
- SPF + DKIM standard
- DMARC support
- Simple setup

GDPR:
- Full GDPR (DE native)
- DE data residency
- "ISO 27001 certified"
```

### 4.21 Inxmail – deliverability

```
DELIVERABILITY INXMAIL:

CLAIMS:
- Enterprise B2B grade
- DACH focus

INFRASTRUCTURE:
- DE data centers
- Enterprise infrastructure
- Dedicated IPs standard

AUTHENTICATION:
- Full enterprise
- SPF + DKIM + DMARC + BIMI
- ISP relationships

GDPR:
- Full GDPR (DE native)
- Enterprise compliance
- ISO 27001
- 25+ years compliance history
```

### 4.22 Mapp / Evalanche – deliverability

```
DELIVERABILITY MAPP/EVALANCHE:

CLAIMS:
- Enterprise grade
- DACH + EU

INFRASTRUCTURE:
- DE + CH data centers
- Multi-region
- Enterprise scale

AUTHENTICATION:
- Full enterprise
- BIMI ready
- ISP relationships

GDPR:
- Full GDPR (DE + CH)
- Strong DACH compliance
- ISO 27001
- Enterprise SLAs
```

### 4.23 SARE – deliverability

```
DELIVERABILITY SARE:

CLAIMS:
- PL infrastructure
- Mid-market focus

INFRASTRUCTURE:
- PL data centers
- Shared + dedicated
- Mid-market focus

AUTHENTICATION:
- Standard
- SPF + DKIM + DMARC

GDPR:
- Full GDPR (PL native)
- Strong PL compliance
```

### 4.24 ExpertSender – deliverability

```
DELIVERABILITY EXPERTSENDER:

CLAIMS:
- EU enterprise grade
- Mid-market+ focus

INFRASTRUCTURE:
- EU data centers
- Dedicated IPs standard
- Enterprise scale

AUTHENTICATION:
- Full enterprise
- SPF + DKIM + DMARC

GDPR:
- Full GDPR (PL native)
- EU compliance
- ISO 27001
```

### 4.25 EmailLabs – deliverability ⭐

```
DELIVERABILITY EMAILLABS:

CLAIMS:
- 99%+ deliverability (transactional)
- "Best deliverability in Poland"

INFRASTRUCTURE:
- Dedicated transactional infrastructure
- High-volume optimized
- Pure SMTP relay

AUTHENTICATION:
- Best practices enforced
- Forced authentication
- SPF + DKIM + DMARC mandatory

GDPR:
- Full GDPR (PL native)
- Strong compliance

TRANSACTIONAL SPECIALIST:
- Banking + finance customers
- Order confirmations, etc.
- Lower spam rates than marketing
```

### 4.26 Newsletter2Go → Brevo

```
Migrating to Brevo Engage:
- Same deliverability as Brevo
- EU data centers
- Full GDPR
```

### 4.27 Braze – deliverability

```
DELIVERABILITY BRAZE:

CLAIMS:
- Enterprise mobile-first
- High volume scale

INFRASTRUCTURE:
- Multi-region
- Mobile-first architecture
- Real-time scale

AUTHENTICATION:
- Full enterprise
- SPF + DKIM + DMARC

GDPR:
- Full GDPR
- EU + US data centers
- Enterprise compliance
```

---

## 5. Compliance certifikace (ISO, SOC 2, atd.)

### 5.1 Enterprise compliance certifikace

```
COMPLIANCE CERTIFIKACE:

⭐⭐⭐⭐⭐ FULL ENTERPRISE COMPLIANCE:

Salesforce MC:
- ISO 27001
- ISO 27017
- ISO 27018
- SOC 1, 2, 3
- HIPAA (Healthcare)
- FedRAMP
- PCI DSS Level 1
- GDPR
- C5 (DE)

SAP Emarsys:
- ISO 27001
- ISO 27018
- SOC 1, 2
- GDPR
- C5 (DE)
- Enterprise certifications

Bloomreach Engagement:
- ISO 27001
- SOC 2 Type II
- GDPR
- PCI DSS

Braze:
- ISO 27001
- SOC 2 Type II
- GDPR
- HIPAA (some plans)

HubSpot:
- ISO 27001
- SOC 2 Type II
- GDPR
- Privacy Shield (legacy)

Klaviyo:
- ISO 27001
- SOC 2 Type II
- GDPR
- HIPAA option

ActiveCampaign:
- ISO 27001
- SOC 2 Type II
- GDPR

Mapp / Evalanche:
- ISO 27001
- GDPR
- DACH compliance

Inxmail:
- ISO 27001
- GDPR
- 25+ years compliance

ExpertSender:
- ISO 27001
- GDPR
- EU enterprise

Mailkit:
- ISO 27001
- GDPR
- Banking-grade

⭐⭐⭐⭐ MID-LEVEL COMPLIANCE:

Mailchimp:
- SOC 2
- GDPR
- ISO 27001 (some products)

Brevo:
- ISO 27001
- GDPR
- SOC 2

GetResponse:
- ISO 27001
- GDPR
- SOC 2

SALESmanago:
- ISO 27001
- GDPR

MailerLite:
- ISO 27001 (newer)
- GDPR

Constant Contact:
- SOC 2
- GDPR
- CAN-SPAM
- (less certifications publicly visible)

rapidmail:
- ISO 27001
- GDPR
- DE-native compliance

CleverReach:
- GDPR
- DE-native
- ISO under way

Targito:
- GDPR
- CZ compliance
- ISO under consideration

⭐⭐⭐ BASIC COMPLIANCE:

SmartEmailing, Ecomail, Boldem, Leadhub:
- GDPR full
- CZ data residency
- Smaller scale = fewer certifications

SARE, EmailLabs:
- GDPR
- PL compliance
- Industry standards

Newsletter2Go:
- Brevo compliance applies
```

### 5.2 Industry-specific compliance

```
HEALTHCARE (HIPAA - USA):

✅ HIPAA available:
- Salesforce MC (Health Cloud)
- HubSpot (Enterprise)
- Klaviyo (with BAA)
- Braze (some plans)

⚠️ NOT HIPAA:
- Mailchimp (not HIPAA)
- Constant Contact (limited)
- Most EU tools (not certified)

FINANCIAL (PCI DSS):

✅ PCI DSS Level 1:
- Salesforce MC
- Bloomreach
- Klaviyo
- HubSpot
- SAP Emarsys
- Mailkit (CZ banking)

GOVERNMENT (FedRAMP - USA):

✅ FedRAMP:
- Salesforce MC

EDUCATION (FERPA):

- Most platforms support
- Specific configuration needed
```

---

## 6. Blacklist management + IP reputation

### 6.1 IP reputation monitoring

```
REPUTATION MONITORING APPROACHES:

PROACTIVE (best practice):
- Real-time monitoring
- Senders Score tracking
- Blacklist checking
- Engagement metrics
- Bounce + complaint tracking

DELIVERABILITY TOOLS:
- Built-in reputation dashboards
- IP warming guidance
- Deliverability scoring
- Sender Score integration
```

### 6.2 Per platforma IP reputation

```
IP REPUTATION MANAGEMENT:

⭐⭐⭐⭐⭐ ENTERPRISE GRADE:
- Salesforce MC (dedicated team)
- SAP Emarsys
- Bloomreach Engagement
- Klaviyo (deliverability team)
- Braze
- HubSpot
- Mapp / Evalanche
- Inxmail
- ExpertSender
- Mailkit (banking-grade)

⭐⭐⭐⭐ STRONG:
- Mailchimp Premium
- ActiveCampaign
- Brevo
- GetResponse
- SALESmanago
- EmailLabs (transactional)

⭐⭐⭐ STANDARD:
- MailerLite
- Constant Contact
- Newsletter2Go → Brevo
- Targito
- Leadhub
- SmartEmailing
- Ecomail
- rapidmail
- CleverReach

⭐⭐ BASIC:
- SARE
- Boldem
- Older Mailchimp plans
- Free tier tools
```

### 6.3 Common blacklists

```
KLÍČOVÉ BLACKLISTY:

Spamhaus:
- SBL (Spamhaus Block List)
- XBL (Exploit Block List)
- PBL (Policy Block List)
- DBL (Domain Block List)
- Most critical = avoid at all costs

Barracuda:
- Barracuda Reputation Block List
- Anti-spam product

URIBL:
- URI Blacklist
- Domain-focused

SURBL:
- URI blacklists
- Link reputation

CBL (Composite Blocking List):
- Botnet detection

SORBS:
- Multiple lists

DNSBL.info:
- Aggregator
```

### 6.4 Blacklist removal flow

```
BLACKLIST REMOVAL:

1. Detect blacklist
2. Identify cause:
   - Compromised account
   - Spam content
   - List quality issue
   - Honeypot trap hit
3. Fix root cause
4. Request delisting:
   - Spamhaus removal request
   - Barracuda removal
   - Other blacklist
5. Wait + monitor
6. Implement preventive measures

PLATFORM SUPPORT:
- Enterprise tools: hands-on team
- SMB tools: documentation
- Self-help typically
```

---

## 7. Opt-in praktiky + double opt-in

### 7.1 Opt-in standardy

```
OPT-IN PRAKTIKY:

SINGLE OPT-IN:
- User submits form
- Added immediately
- Easy + frictionless
- Higher list growth
- ALE: more spam, more fake addresses

DOUBLE OPT-IN (DOI):
- User submits form
- Confirmation email sent
- User clicks confirm
- Added after confirmation
- Higher quality lists
- Required in DE/AT
- Recommended in EU

CONFIRMED OPT-IN:
- Variant of DOI
- Welcome email confirms
- Less strict than DOI

OPT-IN BEST PRACTICES:
- Clear language
- Granular options
- Easy unsubscribe
- Documented consent
- Verifiable timestamps
```

### 7.2 Per platforma DOI support

```
DOUBLE OPT-IN PODPORA:

⭐⭐⭐⭐⭐ DOI REQUIRED/STRONGLY ENCOURAGED (EU tools):
- CleverReach (DE - required for DE)
- rapidmail (DE - required for DE)
- Inxmail (DE - enterprise)
- Brevo
- GetResponse
- MailerLite
- SmartEmailing
- Ecomail
- Newsletter2Go → Brevo
- Mapp / Evalanche
- SAP Emarsys

⭐⭐⭐⭐ DOI ENABLED OPTIONALLY:
- Mailchimp (option)
- HubSpot (option)
- Klaviyo (option)
- ActiveCampaign (option)
- Constant Contact (option)
- Salesforce MC (option)
- Bloomreach
- Braze
- SALESmanago
- Targito
- Leadhub
- Boldem

⭐⭐⭐ DOI AVAILABLE BUT DEFAULT SOI:
- Mailchimp (US default SOI)
- Constant Contact (US default SOI)
- Klaviyo (US default SOI)
```

### 7.3 GDPR + opt-in

```
GDPR OPT-IN REQUIREMENTS:

✅ EXPLICIT CONSENT required:
- Active opt-in (not pre-checked)
- Specific purpose
- Granular if multiple purposes
- Withdrawable
- Documented

✅ LAWFUL BASIS:
- Consent (typical for marketing)
- Legitimate interest (B2B sometimes)
- Contract (transactional)
- Legal obligation
- Vital interest
- Public task

✅ DOCUMENTATION:
- Timestamp of consent
- Source (form, etc.)
- IP address
- Wording shown
- Method (DOI, etc.)

⚠️ COMMON VIOLATIONS:
- Pre-checked boxes
- "Bundled" consent
- No granular options
- Forced consent
- Unclear withdrawal
```

---

## 8. Dedicated IPs + Shared IPs

### 8.1 IP strategie

```
SHARED IPs:

PROS:
- Cheaper (included v plans)
- Pre-warmed reputation
- Hands-off management
- Suitable pro low volume

CONS:
- Reputation shared (others can hurt you)
- Less control
- Sudden blacklisting possible
- Lower for high-volume senders

VHODNÉ PRO:
- SMB
- Low volume (< 100K/month)
- Beginners
- Lower stakes

DEDICATED IPs:

PROS:
- Full control
- Your reputation, your responsibility
- High volume support
- Premium deliverability potential
- Brand isolation

CONS:
- Cost (extra fee)
- Warm-up required (4-8 týdnů)
- Active management needed
- Requires expertise
- Volume requirement (typically 50K+/month)

VHODNÉ PRO:
- High volume (100K+/month)
- Enterprise senders
- Brand-critical communications
- Sophisticated teams
```

### 8.2 Per platforma IP strategie

```
DEDICATED IP DOSTUPNOST:

ZAHRNUTÉ V PLÁNECH (enterprise):
- Salesforce MC (Enterprise)
- SAP Emarsys (all)
- Bloomreach (event volume)
- Braze
- Inxmail
- Mapp / Evalanche
- ExpertSender
- Mailkit (transactional)

ADD-ON (volitelné):
- Mailchimp (Premium tier)
- Klaviyo (large customers)
- ActiveCampaign (Enterprise)
- HubSpot (Enterprise)
- Brevo (Business+)
- GetResponse (MAX/Custom)
- Constant Contact (Premium)
- SALESmanago (Enterprise)

JEN SHARED (typicky):
- Mailchimp Free/Essentials
- MailerLite Free/Growing
- Brevo Free/Starter
- Klaviyo Free
- Constant Contact Lite/Standard
- Boldem
- Většina entry tiers
```

### 8.3 IP warm-up proces

```
IP WARM-UP STRATEGY:

WEEK 1:
- Day 1: 50 emails (most engaged)
- Day 2: 100
- Day 3: 200
- Day 4: 500
- Day 5: 1000
- Day 6: 2000
- Day 7: 5000

WEEK 2:
- Scale to 10K → 25K → 50K
- Monitor reputation

WEEK 3-4:
- Scale to full volume
- Continuous monitoring

KEY MONITORING:
- Bounce rate (<2%)
- Spam complaint rate (<0.1%)
- Open rate (engagement signal)
- Sender Score
```

---

## 9. Regulatorní compliance per region

### 9.1 Per region requirements

```
🇪🇺 EU (GDPR + ePrivacy):
- Explicit consent
- DOI required in DE/AT
- Cookie consent
- Data subject rights
- Strict transfer rules

🇩🇪 Germany (BDSG + DOI required):
- Double opt-in mandatory
- ICANN compliance
- Strictest in EU
- All German tools = DOI default

🇨🇿 Czechia (Czech Personal Data Act):
- GDPR-equivalent
- Czech data residency preferred
- Local language UI helpful

🇸🇰 Slovakia:
- GDPR
- Similar to CZ

🇵🇱 Poland:
- GDPR
- Strong privacy stance
- PL data centers preferred

🇺🇸 USA (CAN-SPAM):
- Identification of sender
- Opt-out mechanism
- Physical address
- Less strict than GDPR
- Single opt-in OK

🇨🇦 Canada (CASL):
- Express consent required
- Stricter than CAN-SPAM
- DOI recommended
- Higher penalties

🇬🇧 UK (UK GDPR + PECR):
- Similar to EU GDPR
- Post-Brexit autonomy
- Privacy and Electronic
   Communications Regulations

🇦🇺 Australia (Spam Act):
- Consent required
- Identification
- Unsubscribe required

🇧🇷 Brazil (LGPD):
- GDPR-like
- Data subject rights
- Local data residency
```

### 9.2 Multi-region compliance

```
MULTI-REGION OPERATIONS:

CHALLENGE:
- Each region different rules
- Strictest typically applies
- Documentation complexity

PLATFORM SUPPORT:

⭐⭐⭐⭐⭐ MULTI-REGION READY:
- Salesforce MC (global)
- Bloomreach Engagement (global)
- SAP Emarsys (DACH + global)
- Braze (global)
- HubSpot (global with EU instance)
- Mailchimp (US + EU)
- Klaviyo (US + EU + global)
- Brevo (EU native + global)

⭐⭐⭐⭐ REGIONAL FOCUS:
- ActiveCampaign (US + EU)
- GetResponse (PL + global)
- MailerLite (EU + global)
- Constant Contact (US-primary)

⭐⭐⭐ LOCAL FOCUS:
- SmartEmailing, Ecomail (CZ + SK)
- SALESmanago (PL + CEE)
- CleverReach, rapidmail (DACH)
- SARE (PL)
- Inxmail (DACH)
- Mailkit (CZ)
- Boldem (CZ)
- Leadhub (CZ/SK)
- Targito (CZ)
```

---

## 10. Red flags + známé problémy

### 10.1 Per platforma red flags

```
RED FLAGS:

MAILCHIMP:
- Free plan shared IPs less reliable
- Free plan = lower deliverability
- Mass user base = some bad actors
- Spam complaint sensitive

HUBSPOT:
- B2B focused = less optimized for B2C bulk
- Subdomain authentication required

BREVO:
- Historical deliverability issues (improved)
- Unlimited contacts = list hygiene less incentivized

KLAVIYO:
- High engagement expected
- Free tier = limited IP reputation
- Active list culling encouraged

ACTIVECAMPAIGN:
- Free trial only
- New account warmup needed

GETRESPONSE:
- Free plan limitations
- Subdomain setup encouraged

MAILERLITE:
- Aggressive list cleaning required
- Lower-tier users impact shared IPs

CONSTANT CONTACT:
- 97% claim = "delivered to server" interpretation
- Inbox placement actual rate lower likely
- Auto-upgrade trap impacts list quality
- US-primary = international weaker

SAP EMARSYS:
- Enterprise only
- Setup complex

SALESFORCE MC:
- Enterprise complexity
- Implementation cost massive
- Multi-product confusion

BRAZE:
- Mobile-first = email secondary
- Enterprise-only pricing

BLOOMREACH:
- Event-based pricing eskalace
- Setup complexity 6-12 months

INXMAIL:
- Enterprise B2B only
- Limited self-service

MAPP / EVALANCHE:
- Enterprise complexity
- DACH-primary focus

SALESMANAGO:
- Custom pricing
- Implementation complexity

EXPERTSENDER:
- Sales-driven
- Limited public info

SARE:
- PL-primary
- Limited international UI

EMAILLABS:
- Pure transactional (not marketing)
- Polish UI primary

CLEVERREACH:
- DACH-primary
- Less international features

RAPIDMAIL:
- Ultra-simple = limited features
- DACH-primary

NEWSLETTER2GO:
- Phasing out → Brevo
- Migration ongoing

SMARTEMAILING:
- CZ-primary
- Less mature global features

ECOMAIL:
- CZ-primary
- Less mature global features

MAILKIT:
- Transactional focus
- Less marketing automation

BOLDEM:
- Mladší (2018)
- Méně reference customers
- CZ-primary

LEADHUB:
- Méně reference customers
- Custom pricing

TARGITO:
- Smaller team than global
- Méně AI než Bloomreach
- Custom pricing opaque
```

### 10.2 Universal compliance red flags

```
UNIVERSAL RED FLAGS:

1. NO PUBLIC DPA (Data Processing Agreement):
   - Avoid for EU operations
   - GDPR violation risk

2. UNCLEAR DATA RESIDENCY:
   - Avoid if EU/CZ/PL operations
   - Schrems II concerns

3. NO ENCRYPTION DOCUMENTATION:
   - In-transit + at-rest required
   - Encryption keys management

4. NO ISO 27001 OR SOC 2:
   - For enterprise = serious concern
   - For SMB = acceptable

5. NO BREACH NOTIFICATION POLICY:
   - GDPR 72-hour requirement
   - Documented process needed

6. SHARED IPs ONLY ON HIGH VOLUME:
   - Need dedicated IPs at scale
   - Otherwise reputation risk

7. NO AUTHENTICATION ENFORCEMENT:
   - SPF + DKIM + DMARC default
   - Yahoo/Gmail 2024+ requirements

8. NO BIMI SUPPORT:
   - Increasingly important
   - Trust signal

9. NO LIST CLEANING SUPPORT:
   - Bounce handling automatic
   - Suppression management
   - Engagement-based sunset

10. NO GRANULAR CONSENT:
    - Single "subscribe" button
    - Bundled consent = GDPR violation
```

### 10.3 Major incidents (historical)

```
KLÍČOVÉ INCIDENTY:

MAILCHIMP 2022 BREACH:
- API key compromise
- Customer data exposure
- Affected: Trezor + crypto users
- Lesson: 2FA, API key rotation

CONSTANT CONTACT 2021 BREACH:
- Phishing campaigns
- Compromised accounts
- Lesson: account security

SENDGRID 2019:
- Compromised accounts
- Phishing emails sent
- Lesson: IP reputation management

YAHOO/GMAIL 2024 REQUIREMENTS:
- Enforced bulk sender rules
- Many platforms had to scramble
- Lesson: stay current with ISP requirements
```

---

## 11. Doporučení + best practices

### 11.1 Pro budoucí výběr platformy

```
DELIVERABILITY EVALUATION CHECKLIST:

1. ✅ Published deliverability rates
   (transparency signal)

2. ✅ Authentication support full
   (SPF + DKIM + DMARC + BIMI)

3. ✅ Dedicated IPs available (volume)

4. ✅ Multi-region data centers

5. ✅ GDPR + DPA standard

6. ✅ ISO 27001 + SOC 2 (enterprise)

7. ✅ Engagement-based reputation

8. ✅ Bounce handling automatic

9. ✅ Suppression management

10. ✅ Real-time monitoring dashboards

11. ✅ ISP relationships (enterprise)

12. ✅ Deliverability consultants (enterprise)

13. ✅ DOI support (especially DE/AT)

14. ✅ Granular consent management

15. ✅ Documentation comprehensive
```

### 11.2 Pro current users

```
DELIVERABILITY IMPROVEMENT TIPS:

LIST HYGIENE:
- Remove inactive (90+ days)
- Validate emails regularly
- Honor unsubscribes immediately
- Sunset non-engagers

CONTENT QUALITY:
- Personalization good
- Avoid spam triggers
- Balance text/images
- Quality CTAs

AUTHENTICATION:
- SPF setup correctly
- DKIM signing
- DMARC enforced (p=quarantine min)
- BIMI for brand

SENDING PATTERNS:
- Consistent volume
- Predictable timing
- Avoid sudden spikes
- Warm-up new IPs

ENGAGEMENT:
- Encourage replies
- Quality > quantity
- Segment for relevance
- A/B test continuously

MONITORING:
- Daily bounce rate check
- Spam complaint rate (<0.1%)
- Sender Score (Return Path)
- Inbox placement testing
- Blacklist monitoring
```

### 11.3 Per region best practices

```
🇨🇿 CZ best practices:
- CZ data residency preferred
- GDPR + Czech law
- CZ ISP relationships (Seznam.cz, etc.)
- Czech language compliance
- Mailkit / SmartEmailing / Ecomail / Targito

🇩🇪 DACH best practices:
- DOI mandatory
- ISO 27001 expected
- German data residency
- Mapp / Evalanche / Inxmail / CleverReach
- SAP Emarsys for retail

🇵🇱 PL best practices:
- Strong GDPR
- PL data residency
- SALESmanago / GetResponse / SARE
- ExpertSender / EmailLabs

🇺🇸 US best practices:
- CAN-SPAM compliance
- Less strict than EU
- SOI typically OK
- Mailchimp / Constant Contact / Klaviyo
```

---

## 12. Závěr

### 12.1 Klíčové insights

```
INSIGHTS 2026:

1. DELIVERABILITY = LIST QUALITY + AUTHENTICATION
   Platform = enabler, not solution

2. EU TOOLS = STRONGER GDPR BY DESIGN
   US tools require SCC + careful setup

3. ENTERPRISE = DEDICATED IPS + TEAM
   SMB = shared IPs OK

4. AUTHENTICATION STANDARDS RISING
   Yahoo/Gmail 2024+ enforced
   BIMI accelerating

5. DOI DOMINANT V EU
   Especially DE/AT
   Quality > quantity

6. ENGAGEMENT = REPUTATION
   ISPs measure engagement
   Klaviyo + Bloomreach leverage this

7. COMPLIANCE INVESTMENTS GROWING
   ISO 27001 standard
   SOC 2 expected
   Industry-specific (HIPAA, PCI)

8. SCHREMS II ONGOING
   Data residency increasingly required
   EU-native tools advantage

9. AI + COMPLIANCE TENSION
   AI uses data extensively
   GDPR data minimization
   AI Act 2025+ coming

10. BLACKLIST MGMT CRITICAL
    Proactive monitoring
    Quick response capabilities
    Vendor support important
```

### 12.2 Top recommendations

```
TOP DELIVERABILITY PLATFORMS 2026:

ENTERPRISE:
1. Salesforce MC (enterprise-grade everything)
2. SAP Emarsys (retail focus, DACH)
3. Bloomreach Engagement (CZ/SK origin advantage)
4. Mapp / Evalanche (DACH enterprise)
5. Klaviyo (DTC enterprise)
6. Mailkit (CZ banking-grade)
7. Braze (mobile enterprise)
8. Inxmail (DACH B2B)

MID-MARKET:
1. ActiveCampaign
2. Brevo
3. GetResponse
4. SALESmanago
5. ExpertSender
6. Targito (CZ)
7. Leadhub (CZ/SK)
8. Klaviyo (mid-DTC)

SMB:
1. MailerLite (modern)
2. Mailchimp Standard+
3. Ecomail (CZ)
4. SmartEmailing (CZ)
5. Boldem (CZ)
6. CleverReach (DACH)
7. rapidmail (DACH)
8. Constant Contact (US, 97% claim)

TRANSACTIONAL:
1. Mailkit (CZ enterprise)
2. EmailLabs (PL specialist)
3. Brevo Transactional
4. SendGrid (mimo seznam)
5. Postmark (mimo seznam)
```

---

_Tento dokument konsoliduje deliverability + compliance napříč 27 platformami z dokumentů 01-54. Pro detailní pohled na konkrétní platformu viz příslušný Features DeepDive dokument._
