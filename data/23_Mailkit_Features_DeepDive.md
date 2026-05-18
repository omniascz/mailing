# Mailkit – hloubková analýza funkcí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Zdroje:** oficiální dokumentace mailkit.com + analytické weby a recenze (G2, SMTPedia, Crunchbase, Email Vendor Selection) ověřené v dubnu–květnu 2026.
**Rozsah:** kompletní funkcionalita platformy v roce 2026 – email + SMS marketing, automation, Engagement Score, sub-accounts (agency model), AMP support, vlastní infrastruktura, ISO certifikace, deliverability focus.

> **Důležitý kontext:** Mailkit je **český produkt s premium positioning** – jeden z nejstarších CZ hráčů (založen 2005-2006), unikátní v industry **vlastní uzavřenou infrastrukturou (no cloud, no third-party processors)**. Mateřská společnost: **Mailkit s.r.o.**, HQ **Praha, Česká republika**.
>
> **Pozice:** **premium B2B/B2C platform** pro **mid-market a enterprise** klienty. Per oficiální claim: *"leader in international mailing distribution"*. Reference klienti zahrnují KetoDiet a fashion e-shopy operující v 17+ trzích.
>
> **Klíčové diferenciátory (UNIKÁTNÍ v industry):**
> - **100% vlastní infrastruktura** – žádný cloud, žádní third-party processors
> - **ISO certifikace 7 standardů** (ISO 9001, 22301, 27001, 27701, 27017, 27018, 20000)
> - **Member of Certified Senders Alliance, M3AAWG, Signal Spam** (prestigious industry orgs)
> - **Engagement Score** – proprietary scoring system
> - **300+ drag & drop templates**
> - **AMP for Email** support integrated v editoru
> - **Premium positioning v deliverabilitě** – self-claim "world-class"
> - **API-first approach** s detailed documentation
> - **Helpdesk v angličtině + češtině**
> - **Sub-accounts** pro agency / multi-market companies
> - **4 levels access rights** per account/sub-account
>
> **NE pro masy:** Mailkit aktivně **selektuje klienty** – per oficiální: *"We want to get to know you better before establishing cooperation and if we find that something is preventing us from doing so with regard to best-practice procedures, we will try to find solution together."* – pricing "on demand", premium positioning.

---

## Obsah

1. [Co je Mailkit a pro koho je](#1-co-je-mailkit)
2. [Tarify a pricing model (on demand)](#2-tarify)
3. [Vlastní infrastruktura (UNIKÁTNÍ)](#3-vlastni-infrastruktura)
4. [ISO certifikace + prestižní členství](#4-iso)
5. [Sub-accounts (agency / multi-market)](#5-sub-accounts)
6. [User access rights (4 levels)](#6-user-rights)
7. [Lists, Contacts, Segmentation](#7-contacts-segmentation)
8. [Email Marketing & Campaigns](#8-email-campaigns)
9. [Visual creator + AMP support](#9-visual-creator)
10. [Templates (300+ drag&drop)](#10-templates)
11. [Marketing Automation](#11-automation)
12. [Dynamic content + variables, loops, conditions](#12-dynamic-content)
13. [Engagement Score (proprietary)](#13-engagement-score)
14. [SMS marketing](#14-sms)
15. [Transactional emails](#15-transactional)
16. [Reports & Analytics](#16-reports)
17. [Deliverability (claimed world-class)](#17-deliverability)
18. [API + integrace + data sources](#18-api-integrace)
19. [Compliance, security, GDPR](#19-compliance)
20. [Limity a nedostatky](#20-limity)

---

## 1. Co je Mailkit

- **Společnost:** Mailkit s.r.o.
- **HQ:** **Praha, Česká republika**
- **Vznik:** **2005–2006** (oficiální verze: "Since 2005" + "Since 2006 we have been developing the Mailkit mailing platform")
- **Pozice:** **Premium Czech multichannel marketing platform** s vlastní infrastrukturou
- **Specializace:** **B2C + B2B** companies different sizes, **international distribution**
- **Lokalizace UI:** **angličtina + čeština** (helpdesk available in both)
- **Web:** mailkit.com
- **Typ klientů:** mid-market + enterprise, **international companies**, **agencies**

### Filozofie produktu

**"Designed to deliver. Engineered to engage."** – marketing positioning.

Klíčový diferenciátor je **vlastní uzavřená infrastruktura**:

> *"Many companies often come across the fact that their ESP does not meet their requirements or legislative obligations because it is directly dependent on other data processors (cloud services, third party infrastructures). In the case of Mailkit, however, it is a 100% comprehensive solution. We do not share your data with anyone, there are no other processors, and therefore our clients have certainty that no mistake can be made."*

Marketing claim z oficiální:
> *"From the beginning, we didn't want to compromise, rely on anyone else and settle for what everyone else was doing. That is why we have built a comprehensive solution, including our own infrastructure, so that we have everything under complete control in order to achieve the best possible reputation, gain very specific know-how and a premium position on the international market. Mailkit is not just a tool, but a completely complex organism."*

```
┌─────────────────────────────────────────────────────────────────┐
│                  MAILKIT PLATFORM                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Email          │  │ SMS          │  │ Transactional   │      │
│  │ Marketing      │  │ campaigns    │  │ emails          │      │
│  │ + Campaigns    │  │              │  │                 │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Visual Creator │  │ 300+ ready-  │  │ AMP for Email   │      │
│  │ (drag & drop)  │  │ to-use       │  │ support (integ. │      │
│  │ + photo db     │  │ templates    │  │ v editoru)      │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Marketing      │  │ Dynamic      │  │ Engagement      │      │
│  │ Automation     │  │ content      │  │ Score           │      │
│  │ (advanced)     │  │ (vars, loops,│  │ (proprietary)   │      │
│  │                │  │  conditions) │  │                 │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Sub-accounts   │  │ 4 levels of  │  │ API + data      │      │
│  │ (agency,       │  │ access rights│  │ sources         │      │
│  │  multi-market) │  │ per account  │  │ integration     │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│   VLASTNÍ INFRASTRUKTURA (UNIKÁTNÍ V CZ INDUSTRY):              │
│   ├─ No cloud (closed infrastructure)                           │
│   ├─ No third-party data processors                             │
│   ├─ Direct contractual relationships s ISPs                    │
│   ├─ Full reputation control                                    │
│   └─ Pražské data centers                                       │
├─────────────────────────────────────────────────────────────────┤
│   ISO CERTIFIKACE (7 standardů):                                │
│   ├─ ISO 9001 (Quality Management)                              │
│   ├─ ISO 22301 (Business Continuity)                            │
│   ├─ ISO 27001 (Information Security)                           │
│   ├─ ISO 27701 (Privacy Information Mgmt)                       │
│   ├─ ISO 27017 (Cloud Security)                                 │
│   ├─ ISO 27018 (Personal Data v cloudu)                         │
│   └─ ISO 20000 (IT Service Management)                          │
├─────────────────────────────────────────────────────────────────┤
│   PRESTIŽNÍ ČLENSTVÍ:                                           │
│   ├─ Certified Senders Alliance                                 │
│   ├─ M3AAWG (Messaging Malware Mobile Anti-Abuse WG)            │
│   ├─ Signal Spam                                                │
│   └─ Další industry organizations                               │
├─────────────────────────────────────────────────────────────────┤
│   + Czech + English helpdesk                                    │
│   + International mailing distribution leader (CZ)              │
│   + Pricing "On Demand" (custom per klient)                     │
└─────────────────────────────────────────────────────────────────┘
```

### Typické use cases

- **Mid-market + enterprise** B2C / B2B companies
- **International e-commerce** (multi-market operations)
- **Fashion e-shops** v 17+ trzích (per reference customer)
- **Agencies** managing multiple client accounts
- **Companies s vlastní IT infrastrukturou** – API-first approach
- **Regulated industries** vyžadující ISO compliance
- **Companies s vysokými deliverability nároky**
- **Premium brands** s expectations of professional service

### Reference customers (per oficiální)

- **KetoDiet** – per testimonial: *"emailing is KetoDiet's 'TOP' performance channel"*
- **Fashion e-shop** v 17 markets
- Various B2B / B2C corporate clients
- Many long-term clients (per oficiální: *"Our clients stay with us for the long term"*)

---

## 2. Tarify a pricing model (on demand)

### 2.1 "On Demand" pricing

Per SMTPedia review:
*"The pricing is On Demand, which means, that you, as a company, you have to request a contact from them in order to check with you the number of emails that you expect to send every month. Based on that, they will quote a pricing which goes with your needs."*

⚠️ **Mailkit NEMÁ public pricing kalkulátor**:
- Sales-driven model
- Custom quote per klient
- Qualification process s account management
- "Discovery" před onboardingem

### 2.2 Three main packages

Per SMTPedia + oficiální:

#### Lite
- **Entry tier**
- Limited contacts
- Limited monthly emails
- Standard support requests
- Core features access

#### Pro
- **Mid-market tier**
- Higher contacts allowance
- Higher monthly email volume
- More support
- Advanced features

#### Enterprise
- **Top tier**
- Unlimited / very high contacts
- High monthly volume
- Premium support
- All features
- Dedicated account team
- Custom infrastructure options

### 2.3 Co je v ceně included (common across tiers)

Per oficiální features page:
- Email marketing campaigns
- SMS marketing
- Customer segmentation
- Marketing automation
- 300+ templates
- Visual creator + AMP support
- API + data sources
- Sub-accounts (per package)
- 4 levels of access rights
- Engagement Score
- Reporting + analytics
- Free photo database
- Czech + English helpdesk

### 2.4 Pricing factors

- **Number of contacts**
- **Monthly email send volume**
- **SMS volume** (if applicable)
- **Sub-accounts** (počet)
- **Support requests** per month
- **Advanced features** access
- **Custom integrations** (if needed)
- **Dedicated IP** (Enterprise typically)
- **Custom domain / white-label**

### 2.5 Qualification process

Per oficiální: *"We want to get to know you better before establishing cooperation"*:

```
Lead inquiry (form on mailkit.com)
   ↓
Discovery call:
- Business type
- Email volume needs
- Current ESP
- Deliverability concerns
- Compliance requirements
- Geographic distribution
- B2C vs. B2B
- Integration needs
   ↓
Qualifying check:
- Mailkit reviews best-practice fit
- If not fit → may decline OR suggest improvements
- If fit → custom proposal
   ↓
Proposal generated:
- Package recommendation (Lite/Pro/Enterprise)
- Pricing quote
- Implementation plan
- Support level
   ↓
Contract negotiation
   ↓
Onboarding
```

### 2.6 Per oficiální about qualification

> *"if we find that something is preventing us from doing so with regard to best-practice procedures, we will try to find solution together."*

Mailkit **may decline klienta** pokud:
- Klient porušuje best practices (purchased lists, spam patterns)
- Compliance issues
- Not fit pro Mailkit's reputation standards
- Tento přístup chrání **Mailkit's premium sender reputation**

### 2.7 Cenové porovnání (10K subscribers, 2026 estimate)

| Platform | Cena/měsíc (estimate) |
|---|---|
| **Mailkit** | Custom (on demand) – typicky premium tier |
| **SmartEmailing** | ~€100 |
| **Ecomail** | ~€60–70 |
| **Mailchimp Standard** | ~$135 (€125) |
| **MailerLite Advanced** | ~$80 (€75) |
| **Brevo Business** | ~€65 |

⚠️ Mailkit **premium pricing** – pricing-wise pravděpodobně srovnatelný nebo dražší než SmartEmailing, ale s premium service + vlastní infrastruktura.

### 2.8 Free trial / Free plan

- **Per SMTPedia:** "both free and paid versions of the app"
- Available trial period typically (custom per klient)
- Demo + pilot v rámci sales process

---

## 3. Vlastní infrastruktura (UNIKÁTNÍ)

**Mailkit's biggest competitive advantage** v industry.

### 3.1 Closed infrastructure

Per oficiální claim:
> *"We have been developing a mailing platform with our own infrastructure since 2006."*
>
> *"a purely Czech multichannel marketing platform with main focus on e-mail and SMS, which works on completely own and closed infrastructure (no cloud phase)."*

### 3.2 No third-party processors

> *"We do not share your data with anyone, there are no other processors, and therefore our clients have certainty that no mistake can be made."*

**Klíčové implikace:**
- **Data nikdy neopustí Mailkit infrastruktury**
- **Žádní subprocessors** (vs. competitors používající AWS, Google Cloud, Azure)
- **Full GDPR compliance** s simplified data flow
- **Žádné cross-border data transfers** (default EU only)
- **DPA flexibility** – fewer parties involved

### 3.3 Direct ISP contractual relationships

Per oficiální:
> *"the only one from the available competition, to conclude unique contractual relationships with all key providers"*

Mailkit má direct relationships s key ISPs:
- **Seznam.cz** (CZ #1 ISP)
- **Major international ISPs**
- Direct feedback loops
- Faster issue resolution
- Better reputation visibility

### 3.4 Reputation control

- **Full sender reputation control**
- **Multi-IP pool management**
- **Engagement-based routing**
- **Real-time reputation monitoring**
- **No "noisy neighbors"** problem (full control over who sends from infrastructure)

### 3.5 Data residency

- **EU data residency** (Czech republic primary)
- **No cloud dependency** – physical infrastructure
- **Sovereignty** for EU/CZ regulated clients
- **No US-based subprocessors**

### 3.6 Why this matters

For regulated industries:
- Banking, finance
- Healthcare (s GDPR strict)
- Government / public sector
- Legal services
- Critical infrastructure

For premium brands:
- Brand reputation protection
- No multi-tenant risks
- Full control over deliverability

For multi-market enterprise:
- Consistent infrastructure performance
- No geographic variability
- Predictable behavior

---

## 4. ISO certifikace + prestižní členství

Mailkit holds **7 ISO certifications** a member of **major industry organizations**.

### 4.1 ISO certifikace

Per oficiální:

#### ISO 9001 – Quality Management
- Quality management system standard
- Continuous improvement processes
- Customer focus

#### ISO 22301 – Business Continuity Management
- Continuity of operations
- Disaster recovery
- Risk management

#### ISO 27001 – Information Security Management
- Comprehensive information security
- Most recognized security certification
- Annual audits required

#### ISO 27701 – Privacy Information Management
- GDPR-aligned privacy management
- Personal data protection
- Privacy controls

#### ISO 27017 – Cloud Security
- Security controls for cloud services
- Even though Mailkit doesn't use cloud, certifikace existuje

#### ISO 27018 – Personally Identifiable Information v Cloudu
- PII protection v cloud environments
- Similar applicability comment

#### ISO 20000 – IT Service Management
- Service management standards
- IT operations excellence

### 4.2 Why 7 ISO certifications matter

**Few competitors mají ISO 27001 alone:**
- Mailchimp: SOC 2, ISO 27001
- SAP Emarsys: ISO 27001, SOC 2, ISO 22301
- HubSpot: SOC 2, ISO 27001
- Brevo: SOC 2, ISO 27001
- Most CZ competitors: GDPR only

**Mailkit's 7 certifikací = enterprise-grade compliance.**

### 4.3 Member of industry organizations

#### Certified Senders Alliance (CSA)
- **Strict sender reputation standards**
- **Whitelisted by major ISPs** (Gmail, Outlook, etc.)
- **Continuous monitoring** of sender behavior
- Pre-defined inbox placement

#### M3AAWG (Messaging Malware Mobile Anti-Abuse Working Group)
- **Industry-leading anti-abuse organization**
- Members include major ISPs, ESPs, security companies
- Sets industry best practices
- Anti-spam, anti-abuse standards

#### Signal Spam
- French anti-spam organization
- ISP feedback loops
- European cooperation

### 4.4 Implications for clients

- **Easier compliance audits** (e.g. SOX, HIPAA, banking regulations)
- **Trust signal** for enterprise customers
- **Insurance / liability** considerations
- **Regulated industries** can use Mailkit (banking, healthcare)
- **Faster procurement** s enterprise customers (vendor risk assessment passes)

---

## 5. Sub-accounts (agency / multi-market)

### 5.1 Sub-account architecture

Per oficiální features:
*"The Mailkit platform lets you manage your account in just a few clicks. Are you an agency that handles emailing for multiple clients or a large company active in multiple markets? Set up as many sub-accounts as you need."*

### 5.2 Use cases

#### Agency model
- **Multiple client accounts** under master agency account
- **Per-client isolation**
- **Centralized agency management**
- **Per-client billing** (optionally) OR consolidated agency billing
- **Cross-account reporting** for agency

#### Multi-market companies
- **International brands** active v multiple countries
- **Per-country sub-accounts** (UK, DE, CZ, etc.)
- **Local team access** to specific markets
- **Centralized brand HQ access**

#### Multi-brand companies
- **Per-brand sub-account** (e.g. parent company s several brands)
- **Brand isolation** of data + campaigns
- **Centralized HQ overview**

### 5.3 Sub-account hierarchy

```
Master Account
├── Master users (cross-account access)
│   ├── Admin (full master + sub-account access)
│   ├── Manager (operational across all)
│   └── Reporter (read-only across all)
│
├── Sub-account A (Client A / Market UK)
│   ├── Sub-account A-specific users
│   ├── Lists, contacts, campaigns
│   ├── Templates
│   └── Integration
│
├── Sub-account B (Client B / Market DE)
│   └── ...
│
└── Sub-account C (Client C / Market CZ)
    └── ...
```

### 5.4 Configuration

- **Unlimited sub-accounts** (per package – higher tiers more)
- **Per-sub-account settings:**
  - Brand kit
  - Sender domains
  - Integration
  - Users
  - Lists / contacts
- **Cross-account features:**
  - Master admin access
  - Aggregate reporting
  - Centralized billing

### 5.5 Data isolation

- **Contacts isolated** per sub-account (default)
- **Optional sharing** between sub-accounts (master settings)
- **Templates** can be shared OR isolated
- **Integration** per sub-account separately

---

## 6. User access rights (4 levels)

Per oficiální features:
*"Set up to 4 levels of access rights for each account and sub-account."*

### 6.1 4 levels access rights

Typical structure:

#### Level 1: Owner / Master Admin
- **Highest tier**
- Full administrative control
- Billing access
- User management across all sub-accounts
- Integration management
- Close account option

#### Level 2: Administrator
- **Operational lead per account/sub-account**
- User management within sub-account
- Configuration
- Cannot close account
- Cannot manage billing

#### Level 3: Manager / Marketing user
- **Daily operational**
- Campaigns, automation, segments
- Content creation
- No user management
- No settings

#### Level 4: Reporter / View-only
- **Read-only**
- Reports + analytics
- No editing, sending
- For stakeholders, executives

### 6.2 Per account/sub-account configuration

```
For each account:
  - Define 4 levels
  - Assign users to levels
  - Granular permissions per level
  - Apply settings

For each sub-account:
  - Same 4 levels available
  - User can have different level in different sub-account
  - Cross-account roles for master users
```

### 6.3 Granular permissions per level

Per level configurable:
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

### 6.4 User flow

```
Owner/Admin: Sub-account settings → User management
   ↓
Add new user OR Edit existing
   ↓
Configure:
- Email + name
- Level assignment (1-4)
- Granular permissions (per level)
- Cross-account access (if applicable)
- 2FA requirement
   ↓
Send invitation
   ↓
[User active per level permissions]
```

---

## 7. Lists, Contacts, Segmentation

### 7.1 Contacts (kontakty)

#### Standard fields
- Email (povinný)
- Jméno, příjmení
- Telefon
- Datum narození
- Pohlaví
- Adresa
- Společnost (pro B2B)
- Funkce
- Custom fields

#### Custom fields
- **Text, číslo, datum, dropdown, multi-select**
- **Unlimited custom fields**
- Per business need
- Used pro segmentation + personalization

### 7.2 Lists / databáze kontaktů

- **Unlimited lists** per account
- **Multi-list architektura**
- **Per-list opt-in tracking**
- **Double opt-in option**
- **List-specific tags**

### 7.3 Sophisticated segmentation

Per testimonial: *"sophisticated customer database segmentation"*

#### Filter criteria
- **Contact attributes** (custom fields, tags)
- **Email engagement** (opened/clicked specific campaigns)
- **SMS engagement**
- **E-commerce data** (orders, AOV, products, categories – s integrací)
- **Engagement Score** (proprietary)
- **Subscription source** (which form, integration)
- **Date conditions** (birthday, registration)
- **Geographic** (IP-based + custom)
- **Activity timeline**
- **Behavior history**

#### Operators
- AND, OR, NOT
- Nested conditions
- Equal, contains, between, before/after
- Greater than, less than

### 7.4 Dynamic vs. static segments

- **Dynamic segments** (auto-update real-time)
- **Static segments** (snapshot at point of creation)
- **Saved segments** reusable

### 7.5 Tags

- **Flat tag system**
- **Multi-tag per contact**
- Add via:
  - Manual
  - Automation
  - Form submission
  - API
  - Data source sync

### 7.6 Subscriber status

```
[Pending] (if double opt-in)
   ↓
[Active] ← can receive
   ↓
Various transitions:
- Unsubscribed
- Bounced
- Spam complaint
- Deleted (GDPR)
```

### 7.7 Import & Export

- **CSV upload** with field mapping
- **API import**
- **Data source integration** (live sync)
- **GDPR consent confirmation** required
- **Export per list/segment**

---

## 8. Email Marketing & Campaigns

### 8.1 Campaign types

| Typ | Use case |
|---|---|
| **Standard newsletter** | Regular sends |
| **A/B test campaign** | Test variants |
| **Triggered campaign** | Event-based |
| **Automation email** | V rámci workflow |
| **Transactional** | Order confirmations, etc. |
| **Trigger campaign** (per testimonial) | Advanced behavior-based |

### 8.2 Campaign builder workflow

```
Kampaně → Nová kampaň
   ↓
Step 1: Setup
- Název kampaně
- Předmět emailu (s personalization)
- Preheader
- Odesílatel (verified domain)
- Reply-to
   ↓
Step 2: Audience
- Lists / segments selection
- Exclusion lists
   ↓
Step 3: Design
- Visual creator (drag-drop)
- Template selection (300+)
- AMP support
- Custom HTML option
   ↓
Step 4: Personalization
- Insert variables
- Conditions
- Loops (for product feeds)
- Dynamic content
   ↓
Step 5: Test
- Preview (desktop, mobile, AMP)
- Send test
- Spam test
   ↓
Step 6: Schedule / Send
- Send now
- Schedule
- Time-zone delivery
- Throttled send
   ↓
Confirm
```

### 8.3 A/B Testing

- **Variants:**
  - Subject line
  - Sender name
  - Content
- **Multiple variants** support
- **Winner determination** by open/click rate
- **Auto-winner send** to remainder

### 8.4 Send authorized domains

Per oficiální:
*"Send campaigns from your authorized email addresses."*

- **Domain authentication required** (DKIM, SPF, DMARC)
- **Multiple sender domains** per account
- **Per-sub-account domains**
- **Branded tracking domains** (CNAME)

---

## 9. Visual creator + AMP support

### 9.1 Visual creator capabilities

Per oficiální features:
*"To make your messages eye-catching, you can use the visual creator, which offers over 300 ready-to-use drag & drop templates."*

- **Drag-and-drop visual builder**
- **Block-based structure**
- **Mobile responsive automatic**
- **Live preview**
- **Custom HTML option**
- **Saved blocks** reusable
- **Brand kit**

### 9.2 AMP for Email support

Per oficiální:
*"AMP support integrated directly into the editor"*

**AMP for Email = next-generation interactive email standard:**
- **Forms inside emails** (no need to click link)
- **Real-time content** (live pricing, inventory)
- **Interactive elements** (carousels, tabs)
- **Dynamic data** (e.g. live cart, account status)
- **Better engagement** vs. static emails

**Mailkit's AMP integration je advanced feature** – few competitors integrují AMP natively v editoru.

### 9.3 Free photo database

Per oficiální:
*"and a free photo database"*

- **Free stock photo library** built-in
- **No external service** needed
- **Cleared for commercial use**
- **Integrated v editoru**

### 9.4 Variables, loops, conditions

Per oficiální:
*"Work with variables, loops and conditions."*

#### Variables
- Personalization tokens
- Custom field values
- Computed variables

#### Loops
- **For-each loops** for product feeds
- Dynamic content arrays
- Repeating blocks

#### Conditions
- **If/Else logic** within email
- **Show/hide blocks** based on conditions
- **Per-recipient different content**

### 9.5 Use cases enabled

#### Dynamic newsletters
```
For each product v subscriber's last viewed:
  Show product block with image, price, link
End for
```

#### Conditional content
```
If subscriber.gender == "female":
  Show female-targeted hero
Else:
  Show male-targeted hero
End if
```

#### Loyalty program
```
If subscriber.tier == "Gold":
  Show Gold benefits + offer
ElseIf subscriber.tier == "Silver":
  Show Silver benefits + upsell
Else:
  Show Bronze benefits + tier-up offer
End if
```

---

## 10. Templates (300+ drag&drop)

Per oficiální:
*"over 300 ready-to-use drag & drop templates"*

### 10.1 Template categories

- **Newsletter** (standard, premium designs)
- **Promotional / Sales**
- **E-commerce** (product showcase, cart, post-purchase)
- **Welcome**
- **Event** (announcements, reminders)
- **Holiday/seasonal** (Vánoce, Velikonoce, atd.)
- **B2B** (corporate, professional)
- **Transactional templates**

### 10.2 Template features

- **Fully customizable**
- **Drag-drop editing**
- **Responsive** (mobile-optimized)
- **AMP-enabled** versions
- **Brand kit integration**
- **Industry-specific** designs

### 10.3 Custom templates

- **Custom HTML** option
- **MJML-like** responsive framework support
- **Developer-friendly** for agencies

---

## 11. Marketing Automation

Per testimonials:
- *"a wealth of automation and personalization options"*
- *"advanced trigger campaign creation"*

### 11.1 Automation builder

- **Visual workflow builder**
- **Multi-step workflows**
- **Branching conditions**
- **Multi-channel** (email + SMS)
- **Real-time evaluation**

### 11.2 Triggers

#### Behavioral
- Subscribed to list
- Tag added/removed
- Form submitted
- Email opened/clicked
- SMS clicked

#### Transactional / E-commerce
- Order placed (via integration)
- Cart abandoned
- Product viewed
- Specific product purchased

#### Date-based
- Birthday trigger
- Anniversary
- Custom date in field

#### Engagement-based
- Engagement Score threshold reached
- Inactive X days
- Custom event

#### API-triggered
- External event via API

### 11.3 Actions (nodes)

#### Sending
- Send email
- Send SMS
- Send transactional

#### Contact manipulation
- Add/remove tag
- Add/remove from list
- Update field
- Update Engagement Score

#### Logic
- Wait (time delay)
- Condition (if/else branch)
- Goal (conversion event)
- Random split (A/B)

#### External
- Webhook
- API call

### 11.4 Trigger campaigns (advanced)

Per testimonial: *"advanced trigger campaign creation"*

- **Real-time triggered** based on events
- **Multi-condition** triggers
- **Cross-channel orchestration**
- **Frequency caps**

### 11.5 Use case examples

#### Multi-touch welcome series
```
Trigger: Subscribed to "Newsletter"
   ↓
Send Email 1: Welcome
   ↓
Wait 3 days
   ↓
Send Email 2: Product/service intro
   ↓
Condition: Opened Email 2?
   YES → Send Email 3: Special offer
   NO → Send Email 3: Alternative angle
   ↓
Wait 5 days
   ↓
Update Engagement Score
   ↓
End
```

#### Cart abandonment s SMS escalation
```
Trigger: Cart abandoned >2h
   ↓
Wait 1h
   ↓
Send Email: Cart reminder s loop showing items
   ↓
Wait 24h
   ↓
Condition: Purchased?
   YES → Goal (exit)
   NO → Send Email with discount
   ↓
Wait 48h
   ↓
Condition: Purchased?
   YES → Goal
   NO → Send SMS final reminder
   ↓
Exit
```

---

## 12. Dynamic content + variables, loops, conditions

### 12.1 Advanced personalization

Per testimonial:
*"dynamic content combined with advanced trigger campaign creation and sophisticated customer database segmentation"*

### 12.2 Variables system

- **Personalization tokens** for every field
- **Computed variables** (e.g. age from birthdate)
- **Default fallback values**
- **Multi-language** variables

### 12.3 Loops

```
{% for product in subscriber.cart_items %}
  <div class="product-block">
    <img src="{{product.image}}" />
    <h3>{{product.name}}</h3>
    <p>{{product.price}} {{product.currency}}</p>
    <a href="{{product.url}}">Buy now</a>
  </div>
{% endfor %}
```

Use cases:
- Cart contents
- Product recommendations
- Order line items
- Multi-product newsletters

### 12.4 Conditions

```
{% if subscriber.tier == "VIP" %}
  Show VIP-exclusive offer block
{% elif subscriber.tier == "Premium" %}
  Show Premium offer
{% else %}
  Show standard offer
{% endif %}
```

Use cases:
- Loyalty tier-based content
- Gender-specific content
- Geographic targeting
- Engagement-based content

### 12.5 Variables + loops + conditions combined

Powerful combinations enable:
- **Personalized product recommendations** per subscriber
- **Dynamic loyalty status** displays
- **Per-recipient unique email** generation
- **Real-time data inclusion** (s AMP)

---

## 13. Engagement Score (proprietary)

Mailkit's **proprietary scoring system**.

### 13.1 What is Engagement Score

Per oficiální:
*"Our Engagement Score makes establishing and maintaining customer relationships way easier."*

**Numerical score per subscriber** indicating engagement level:
- Based on multiple behavioral signals
- Updated continuously
- Used for segmentation + workflows

### 13.2 Scoring factors (typical)

- **Email opens** (recent vs. historical)
- **Email clicks**
- **Time-decay** (recent engagement weighted higher)
- **Frequency** of engagement
- **Recency** of last engagement
- **SMS engagement**
- **Site activity** (s integrací)
- **Order data** (s integrací)
- **Custom events**

### 13.3 Use cases

#### Segment by engagement
- **High engagers** (top 10% score) – VIP segment
- **Medium engagers** – regular newsletters
- **Low engagers** – re-engagement campaigns
- **Inactive** – suppress or re-permission

#### Workflow triggers
- Engagement Score crossed threshold
- Engagement Score declining
- Re-engagement automation

#### Deliverability optimization
- **Send to high engagers first** (better reputation)
- **Suppress low engagers** (avoid spam complaints)
- **Engagement-based routing** (different IPs per engagement)

#### Lifecycle management
- Identify customer health
- Predict churn risk
- Identify upsell opportunities

---

## 14. SMS marketing

### 14.1 SMS capabilities

- **Bulk SMS campaigns**
- **SMS in automation workflows**
- **Two-way SMS** (limited regions)
- **Personalization** s variables
- **Link tracking** (shortened URLs)
- **STOP keyword handling**
- **Sender ID** configurable per country

### 14.2 Use cases

- Order/shipping notifications
- Time-sensitive promos
- Cart abandonment escalation
- VIP alerts
- Reservation confirmations
- Authentication (2FA)

### 14.3 Multi-channel orchestration

- Email + SMS coordinated
- Frequency caps cross-channel
- Per-channel preferences
- Engagement-based channel choice

### 14.4 Pricing

- **Pre-paid credits** (typically)
- Per-country pricing
- International coverage

---

## 15. Transactional emails

### 15.1 Transactional capabilities

- **High-volume transactional**
- **Templates with variables**
- **Real-time API**
- **Webhook events**
- **Delivery tracking**
- **Separated infrastructure** (vs. marketing)

### 15.2 Use cases

- Order confirmations
- Shipping notifications
- Password resets
- Account verifications
- Receipts / invoices
- Authentication codes
- Payment notifications

### 15.3 Mailkit advantages

- **Excellent deliverability** (per oficiální reputation)
- **Own infrastructure** = predictable performance
- **No shared pool risks**
- **Per-template tracking**
- **Inbound parsing** (some setups)

---

## 16. Reports & Analytics

Per oficiální focus:
*"accurate reporting"*

### 16.1 Campaign reports

- **Sent, delivered, bounced**
- **Opens** (unique + total)
- **Clicks**, CTR, top links
- **Conversion rate**
- **Revenue attribution** (e-commerce)
- **Geographic distribution**
- **Device + email client**
- **Click maps**
- **Per-element interaction**

### 16.2 Automation reports

- Per-workflow performance
- Per-step performance
- Drop-off analysis
- Conversion tracking
- Revenue attributed

### 16.3 Engagement Score reports

- Score distribution
- Score trends
- High vs. low engager analytics
- Score-based segments

### 16.4 SMS reports

- Delivered
- Click-through
- Per-campaign performance

### 16.5 Account-wide reports

- List growth
- Source attribution
- Revenue summaries
- Cross-channel performance

### 16.6 Sub-account reports

- Per-sub-account analytics
- Aggregate master view
- Cross-sub-account comparisons

### 16.7 Custom reporting

- Custom dashboards (per package)
- Export options (CSV, PDF)
- Scheduled reports
- API access to reports

---

## 17. Deliverability (claimed world-class)

**Mailkit's biggest competitive claim.**

### 17.1 "Unbeatable deliverability"

Per testimonial:
*"The unbeatable deliverability of our emails combined with dynamic content..."*

Per oficiální:
*"top worldwide deliverability"*

### 17.2 Reputation infrastructure

- **Own IP pools** (full control)
- **Direct ISP relationships**
- **Engagement-based routing** (Engagement Score)
- **Multi-IP reputation management**
- **Real-time monitoring**

### 17.3 CSA membership advantage

**Certified Senders Alliance:**
- Whitelisted by major German ISPs (web.de, GMX, etc.)
- Pre-defined inbox placement
- Continuous monitoring required
- High standards maintained

### 17.4 M3AAWG membership

- Industry-leading anti-abuse practices
- Best practices implementation
- Anti-spam standards
- Industry intelligence sharing

### 17.5 Authentication

- **DKIM** (mandatory)
- **SPF** (mandatory)
- **DMARC** (mandatory + reporting)
- **BIMI** support (newer)
- **Branded tracking domain** (CNAME)
- **MX-level monitoring**

### 17.6 List hygiene

- **Auto-suppression** hard bounces
- **Spam complaint** auto-suppression
- **Engagement Score-based** filtering
- **Inactive subscriber detection**
- **Pre-send validation**

### 17.7 Czech ISP excellence

- **Seznam.cz** strong relationship (top CZ ISP)
- **Centrum.cz**
- **Other CZ providers**
- Local expertise

### 17.8 International ISP relationships

- **Gmail** (Google) – established sender history
- **Outlook / Hotmail** (Microsoft)
- **Yahoo**
- **Apple Mail / iCloud**
- **Major European ISPs** (web.de, gmx, t-online, etc.)

### 17.9 Gmail/Yahoo 2024+ compliance

- One-click unsubscribe (RFC 8058)
- DKIM + DMARC enforced
- Spam rate monitoring
- Sender reputation tracked

---

## 18. API + integrace + data sources

### 18.1 API-first approach

Per testimonials:
*"easy to connect our internal system via API, which was helped by very detailed and well written documentation"*

- **Comprehensive REST API**
- **Detailed documentation**
- **Developer-friendly**
- **Webhook events**
- **Rate limits scalable**

### 18.2 API endpoints

Typical structure:
- `/contacts` – contact management
- `/lists` – list management
- `/segments` – segmentation
- `/campaigns` – campaign management
- `/automations` – workflow management
- `/templates` – template management
- `/transactional` – transactional sends
- `/sms` – SMS management
- `/reports` – analytics
- `/sub-accounts` – sub-account management

### 18.3 Data sources

Per oficiální features:
*"Interconnect using the API or data sources."*

**Data source integration:**
- Direct database connections (configured)
- CSV/FTP imports
- Webhook-based updates
- Custom integration projects

### 18.4 Native integrations

⚠️ **Mailkit má méně out-of-box integrations** než Mailchimp/Ecomail/SmartEmailing:
- API-first approach
- Custom integration projects typical
- Per-client integration setup

Known integrations (less prominently advertised):
- Various e-commerce platforms via API
- CRM systems via API
- ERP systems via API
- Custom data warehouses

### 18.5 Webhooks

- Subscriber events
- Campaign events
- Form submissions
- Real-time push

### 18.6 SFTP integration

- Bulk data exchange
- Scheduled imports/exports
- Automated workflows

---

## 19. Compliance, security, GDPR

### 19.1 EU + CZ hosting

- **Czech republic** primary
- **No cloud dependency**
- **Vlastní data centers**
- **EU data residency** guaranteed

### 19.2 ISO certifications

(See section 4)
- ISO 27001 – Information Security
- ISO 27701 – Privacy Information
- ISO 9001 – Quality Management
- + 4 more

### 19.3 GDPR compliance

- **GDPR-aligned design**
- **Double opt-in** support
- **Per-channel consent**
- **Audit trails**
- **Right to be Forgotten**
- **Data export** (DSAR)
- **DPA available**
- **No third-party processors** (simplifies compliance!)

### 19.4 CZ ÚOOÚ compliance

- ÚOOÚ-registered controller
- Czech privacy law (110/2019 Sb.) compliant
- Czech-specific guidelines followed

### 19.5 Industry-specific compliance

ISO certifications enable:
- **Banking / finance** compliance
- **Healthcare** (HIPAA-ready architecture)
- **Government** procurement
- **Critical infrastructure**

### 19.6 Security features

- **2FA** (mandatory pro Enterprise)
- **API key per scope**
- **Encryption** at rest + in transit
- **Audit logs** comprehensive
- **Role-based access** (4 levels)
- **Sub-account isolation**
- **Penetration testing** regular
- **ISO 27001 audited**

### 19.7 Data sovereignty

For multi-national enterprises:
- **No US subprocessors**
- **No GDPR Schrems II issues**
- **EU sovereign cloud equivalent**
- **Predictable jurisdiction**

---

## 20. Limity a nedostatky

### 20.1 Accessibility / pricing

- **No public pricing** (sales-driven only)
- **No self-serve sign-up** typically
- **Qualification process** before contract
- **Premium positioning** = higher costs
- **No free plan** (typically – check current)
- **Custom contracts** required
- **Less SMB-friendly** than Mailchimp / MailerLite

### 20.2 Premium positioning

- **Selektivní klientela** (Mailkit may decline)
- **Best-practice requirements** strict
- **Not for purchased lists** users
- **Compliance focus** = some users find restrictive

### 20.3 Less out-of-box integrace

- **Fewer native integrations** vs. globální (Mailchimp, ActiveCampaign 970+, Klaviyo)
- **Custom integration** required pro many platforms
- **No native Shopify** out-of-box (per current state – check)
- **No native Shoptet** (interesting given CZ origin!)
- **API-first approach** = development required
- **Less plug-and-play** experience

### 20.4 UI/UX

- **Less modern UI** than Mailchimp / MailerLite
- **More technical** interface
- **Steeper learning curve**
- **Mobile app limited**
- Aimed at **professional users**, not solopreneurs

### 20.5 Limited templates count vs. expectations

- **300+ templates** is decent, but:
- Mailchimp 1000+
- Klaviyo customizable
- ActiveCampaign large library
- Mailkit positions on quality over quantity

### 20.6 No deep CRM

- **No deals/pipelines** native (vs. ActiveCampaign, HubSpot)
- **Contact-centric** approach
- **B2B sales features limited**
- Companies need separate CRM

### 20.7 No deep e-commerce features

- **No Shopify native plugin** (per current state)
- **No automatic product recommendations** ML (vs. Klaviyo Predict)
- **No predictive CLV/churn**
- **No automatic RFM cohorts**
- Custom integration required

### 20.8 No webinars / courses native

- No built-in webinars (vs. GetResponse)
- No online courses
- No paid newsletters
- No digital products sale

### 20.9 No autonomous AI / generative AI

- **No generative AI** for content creation (vs. ActiveCampaign Active Intelligence)
- **No AI subject line generation**
- **No predictive sending AI** per recipient
- **Engagement Score is rule-based** not deep ML
- Less AI marketing than competitors v 2026

### 20.10 Sales cycle length

- **Discovery + qualification** takes time
- **Custom contract negotiation**
- **NOT a "sign up in 5 minutes" tool**
- **Pro velké klienty** acceptable, ale pro SMB friction

### 20.11 International scaling

- Strong CZ + EU
- US presence less developed
- Asia/Pacific limited
- Czech-first orientation

### 20.12 Form / landing page limited

- **Limited form builder** vs. competitors
- **No native landing page** builder (per current state)
- Heavy lift v custom development

### 20.13 Mobile experience

- **Mobile app limited**
- **Most operations** require desktop
- Less polished mobile editor

### 20.14 No agency commission program

- **Sub-accounts available** (agency model supported)
- **But no formal commission program** like Ecomail
- **Agency relationship per contract**

### 20.15 Documentation

- **Documentation good** for API (per testimonial)
- **English + Czech** docs available
- **Less marketing content** / blog posts than competitors
- **Less how-to videos** than Mailchimp/Klaviyo

---

## 21. Shrnutí: Pro koho a proti komu

### Mailkit je dobrá volba pokud
- Provozujete **mid-market nebo enterprise** business
- Vyžadujete **ISO 27001 + další compliance** certifikace
- Pracujete v **regulovaných odvětvích** (banking, healthcare, government, critical infrastructure)
- Cíl je **best-in-class deliverability**
- Provozujete **international company** s multi-market presence
- Provozujete **agency** managing multiple client accounts
- Potřebujete **vlastní infrastrukturu** (no cloud dependency)
- Hledáte **API-first approach** s dev capacity
- Cíl je **data sovereignty** v EU (no US processors)
- Hledáte **prestigious sender reputation** (CSA, M3AAWG membership)
- Provozujete **high-volume B2B/B2C**
- Vyžadujete **advanced dynamic content** (loops, conditions, AMP)
- Máte **long-term partnership** mindset
- Budget je **flexible** (premium positioning)

### Mailkit není dobrá volba pokud
- Jste **small business / solopreneur** – overkill + nedostupné
- Hledáte **self-service freemium** – Mailchimp, MailerLite, Ecomail lepší
- Nemáte **dev resources** pro API integration
- Hledáte **rychlé self-implementation** – Mailkit vyžaduje sales cycle
- Provozujete **Shoptet e-shop** – Ecomail/SmartEmailing lepší (native integrace)
- Hledáte **best Shopify integration** – Klaviyo lepší
- Potřebujete **deep CRM** s deals/pipelines – HubSpot, ActiveCampaign lepší
- Hlavní use case je **simple newsletter** – overkill
- Hledáte **AI agents / generative AI** – Klaviyo, ActiveCampaign, HubSpot dál
- Provozujete **content creator business** s paid newsletters – Beehiiv, Kit, Substack
- **Free trial / public pricing** required – Mailkit needs sales discovery

### Mailkit vs. konkurence

| Konkurence | Kdy lepší než Mailkit |
|---|---|
| **SmartEmailing** | Public pricing, jmeniny features, Shoptet deep integration, lower entry |
| **Ecomail** | Free plan up to 40K, modernější UI, lower entry price, Shoptet |
| **Mailchimp** | Brand recognition, self-service, free plan, larger template library |
| **MailerLite** | Solopreneur simplicity, public pricing, free plan |
| **Brevo** | Transactional v base, volume-based transparent pricing, multilingual |
| **Klaviyo** | DTC e-commerce, Shopify deep, predictive AI |
| **HubSpot** | Full B2B CRM, multi-Hub vision, sales-led |
| **ActiveCampaign** | Mid-market deep automation, integrated CRM, 970+ integrations |
| **GetResponse** | Webinars + courses + landing pages + 27 langs UI |
| **ExpertSender** | Polský origin, similar premium positioning, e-commerce CDP |
| **SAP Emarsys** | Enterprise scale, SAP ecosystem, Gartner Leader |

---

*Dokument zpracován z oficiálních zdrojů mailkit.com a praktických zdrojů (G2, SMTPedia, Crunchbase, Email Vendor Selection, customer testimonials). Pro nejaktuálnější detaily je nutný engagement s Mailkit sales teamem.*
