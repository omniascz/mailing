# HubSpot – hloubková analýza funkcí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Zdroje:** oficiální dokumentace knowledge.hubspot.com, hubspot.com/pricing, hubspot.com/products + analytické weby (Featurebase, EmailVendorSelection, Cargas, Zeeg, RevPartners, Sidekick Strategies, INSIDEA) ověřené v dubnu–květnu 2026.
**Rozsah:** kompletní funkcionalita platformy v roce 2026 – primárně **Marketing Hub** s důležitými přesahy do Smart CRM, Sales Hub, Service Hub, Content Hub, Operations/Data Hub, Commerce Hub, dále role/permissions, automatizace, integrace, Breeze AI.

> **Důležitý kontext:** HubSpot není „email tool". Je to **multi-hub platforma** postavená nad jednotným Smart CRM. Email je jen jedna z mnoha schopností. Tento dokument se soustředí na marketing/email use-case, ale popisuje i CRM základ, který je pro každou pochopení nutný.
>
> **Velký posun 2024–2026:** HubSpot přešel na **seat-based pricing** (5. března 2024). Místo "user license fee" se platí za seat type (Core, Sales, Service, Commerce, View-Only). Tento model se postupně rolluje do všech tarifů. Pozdě 2025 byly „Permission Sets" přejmenovány na „**Roles**" (alignment s RBAC standardem).

---

## Obsah

1. [Co je HubSpot a jak je strukturován](#1-co-je-hubspot)
2. [Huby a tarify](#2-huby-a-tarify)
3. [Seat-based pricing model](#3-seat-based-pricing)
4. [Smart CRM – základ všeho](#4-smart-crm)
5. [Marketing Hub – features by tier](#5-marketing-hub-features)
6. [Email Marketing tool](#6-email-marketing-tool)
7. [Lists, Segmentace, Lifecycle Stages](#7-lists-segmentace-lifecycle)
8. [Forms, Landing Pages, CTAs, Pop-ups](#8-forms-landing-pages)
9. [Workflows (Automation)](#9-workflows)
10. [Sequences (1-to-1 sales outreach)](#10-sequences)
11. [Lead Scoring & Predictive Models](#11-lead-scoring)
12. [Marketing Contacts vs. Non-Marketing](#12-marketing-contacts)
13. [Breeze AI a Breeze Agents](#13-breeze-ai)
14. [Reports, Dashboards, Analytics](#14-reports)
15. [Deliverability & dedicated IP](#15-deliverability)
16. [API, Integrace, App Marketplace](#16-api-integrace)
17. [Content Hub & Website CMS](#17-content-hub)
18. [Sales Hub, Service Hub, Commerce Hub (přehled)](#18-ostatní-huby)
19. [Compliance, GDPR, audit log](#19-compliance)
20. [Limity a nedostatky](#20-limity)

---

## 1. Co je HubSpot

- **Společnost:** HubSpot, Inc. – veřejně obchodovaná (NYSE: HUBS), HQ Cambridge, Massachusetts
- **Vznik:** 2005, zakladatelé Brian Halligan a Dharmesh Shah
- **Pozice:** lídr v segmentu „inbound marketing" + CRM platforma; ~38 % podíl trhu v marketing automation (2026, RevPartners)
- **Velikost:** 248 000+ zákazníků ve 135+ zemích (Q1 2026, oficiální claim)
- **Lokalizace UI:** angličtina, němčina, španělština, francouzština, italština, portugalština, japonština, čínština, holandština. **Čeština, slovenština, polština nejsou** v UI; obsah lze tvořit v libovolném jazyce.

### Filozofie produktu

HubSpot prodává **„Customer Platform"** – sjednocenou platformu, ne hromadu nástrojů. Centrální vrstva je **Smart CRM**, nad ní jsou Huby:

```
┌─────────────────────────────────────────────────────────────┐
│                  CUSTOMER PLATFORM                          │
├─────────────────────────────────────────────────────────────┤
│  Marketing Hub  │  Sales Hub  │  Service Hub               │
│  Content Hub    │  Operations │  Commerce Hub              │
│                 │     Hub     │                            │
├─────────────────┴─────────────┴─────────────────────────────┤
│                                                             │
│            SMART CRM (jeden datový model)                   │
│   Contacts │ Companies │ Deals │ Tickets │ Custom Objects   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│   Breeze AI (cross-hub AI layer, 2024+)                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Huby a tarify

HubSpot má v roce 2026 **šest produktových hubů**, každý se čtyřmi tarify (Free / Starter / Professional / Enterprise) + speciální **Starter Customer Platform** bundle.

### 2.1 Marketing Hub

| Tarif            | Cena (annual)                     | Contacts                  | Klíčové                                                                                                                                                                                              |
| ---------------- | --------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Free**         | $0                                | 100 marketing contacts    | Drag-drop email editor (limitovaný), formuláře, jednoduchá segmentace, HubSpot branding v emailech                                                                                                   |
| **Starter**      | **$20/seat/měsíc**                | 1 000 marketing contacts  | Plný email editor, email + chat support, žádný HubSpot branding, jednoduchá automatizace (10 automated email actions), 25 active lists, 1 000 static lists                                           |
| **Professional** | **$890/měsíc** (3 core seats vč.) | 2 000 marketing contacts  | + Workflows (plné), A/B testing email/landing pages, custom reporting, lead scoring, social media scheduling, ABM tools, SEO tools, smart content, omnichannel automation, **$3 000 onboarding fee** |
| **Enterprise**   | **$3 600/měsíc** (5 core seats)   | 10 000 marketing contacts | + custom objects, advanced reporting, hierarchical teams, multi-touch revenue attribution, partitioning, sandbox environment, **$6 000 onboarding fee** (některé zdroje uvádí $12 000)               |

**44× cenový skok** mezi Starter a Professional je nejčastěji kritizovaný moment.

### 2.2 Sales Hub

| Tarif        | Cena                                |
| ------------ | ----------------------------------- |
| Free         | $0                                  |
| Starter      | $20/seat/měsíc                      |
| Professional | $100/seat/měsíc + $1 500 onboarding |
| Enterprise   | $150/seat/měsíc + $3 500 onboarding |

### 2.3 Service Hub

Stejná struktura jako Sales Hub: $20 / $100 / $150 per seat.

### 2.4 Content Hub (dříve CMS Hub, přejmenováno 2024)

- Starter: $20/měsíc, 1 seat
- Professional: $500/měsíc, 3 seats
- Enterprise: $1 500/měsíc, 5 seats

### 2.5 Operations Hub / Data Hub

- Starter: $20/měsíc
- Professional: $800/měsíc
- Enterprise: $2 000/měsíc

### 2.6 Commerce Hub

- Available via Starter Customer Platform
- Professional / Enterprise s vlastními limity

### 2.7 Customer Platform Bundle

- Free Customer Platform – až 2 users, zdarma napříč všemi huby s omezeními
- Starter Customer Platform – bundling všech Starterů za zvýhodněnou cenu
- Professional/Enterprise Customer Platform – custom pricing

### 2.8 Pricing struktura

HubSpot je dražší než většina konkurence v SMB segmentu, ale **cílí na mid-market a enterprise**. Tři proměnné určují cenu:

1. **Tier** (Free/Starter/Pro/Enterprise)
2. **Počet seats** (Core, Sales, Service, Commerce paid seats)
3. **Marketing contacts** (jen Marketing Hub)

---

## 3. Seat-based pricing

Klíčový shift od 5. března 2024. Týká se nových účtů; starší účty zůstávají na legacy modelu nebo se postupně migrují.

### 3.1 Seat types

| Seat          | Cena                               | Co umožňuje                                                                      | Limit                 |
| ------------- | ---------------------------------- | -------------------------------------------------------------------------------- | --------------------- | -------- |
| **View-Only** | $0 (zdarma)                        | View dashboards, reports, content; nelze vytvořit/editovat                       | **unlimited**         |
| **Core**      | součást plánu / additional ~$50–75 | Edit access napříč Marketing/Content/Operations/Starter Sales                    | Service               | per plán |
| **Sales**     | součást Sales Hub seat / add-on    | Plné Sales Hub Professional/Enterprise tooly (sequences, playbooks, prospecting) | per plán              |
| **Service**   | součást Service Hub                | Service Hub Professional/Enterprise tooly                                        | per plán              |
| **Commerce**  | součást Commerce Hub               | Commerce-specific tooly (quotes editing, payments)                               | per plán              |
| **Partner**   | $0 pro Solutions Partners          | Plný přístup ke klientskému účtu                                                 | jen eligible partners |
| **Developer** | $0                                 | Developer tools, sandbox; nelze kombinovat s ostatními seats                     | –                     |

> **Pravidlo:** každý user, který má **edit access**, potřebuje minimálně Core seat. Hub-specific seats (Sales/Service/Commerce) jsou **additivní** nad Core.

### 3.2 Super Admin

- Super Admin je **permission flag**, ne seat type
- Super Admin má neomezený přístup ke všem nastavením a nástrojům
- **Super Admin stále potřebuje seat** odpovídající funkcionalitě, kterou používá (Super Admin s jen Core seatem nemůže používat Sales Hub features)
- Doporučeno: 1–2 Super Admins per účet
- Pouze Super Admin může nastavit jiného usera jako Super Admin
- Super Admin permission set **nelze modifikovat**

### 3.3 Permission Sets (Roles)

Enterprise: **Permission Sets** = custom roles. Lze:

- Vytvořit až **100 permission sets**
- Klonovat existující sets
- Porovnat sets (Professional+)
- Apply Permission Set na usera = override individual permissions

V late 2025 byly Permission Sets přejmenovány na **Roles** pro alignment s industry standard RBAC.

### 3.4 Permission scope

Permissions se nastavují v několika dimenzích:

- **CRM objects** – Contacts, Companies, Deals, Tickets, Custom Objects, Leads
- **Per-object level**: View / Edit / Delete + scope (All / Team / Owned only / None)
- **Marketing tools** – Email, Forms, Landing Pages, Workflows, Social, Ads, Lists, etc.
- **Sales tools** – Sequences, Playbooks, Forecasting, Quotes
- **Service tools** – Inbox, Tickets, Feedback
- **Reports** – Dashboards, Custom Reports, Analytics
- **Settings** – Account access, Add/edit users, Add/edit teams, Modify billing
- **Privacy** – GDPR, data deletion
- **AI** – Breeze permissions per agent
- **Property-level security** – lock kritická pole (Deal Amount, Close Date) jen pro managery (Enterprise)

---

## 4. Smart CRM

CRM je **datový základ** – pro všechny huby společný. Není ho lze „vypnout".

### 4.1 Standardní objekty

| Objekt                | Co reprezentuje                                              |
| --------------------- | ------------------------------------------------------------ |
| **Contact**           | Individuální osoba                                           |
| **Company**           | Organizace (auto-detected z domain)                          |
| **Deal**              | Sales opportunity (s pipeline a stages)                      |
| **Ticket**            | Service request                                              |
| **Product**           | Položka katalogu (Sales + Commerce)                          |
| **Line Item**         | Položka v dealu/quote                                        |
| **Quote**             | Cenová nabídka                                               |
| **Invoice**           | Faktura (Commerce)                                           |
| **Payment**           | Platba (Commerce)                                            |
| **Subscription**      | Předplatné                                                   |
| **Cart**              | Košík (Commerce)                                             |
| **Lead** (nový 2024+) | Pre-deal prospecting object, lives alongside Contact/Company |
| **Custom Objects**    | Vlastní (jen Enterprise)                                     |

### 4.2 Asociace mezi objekty

- Many-to-many s **typed associations** (např. Decision Maker, Influencer, Champion na Contact ↔ Deal)
- Hierarchické: Company → Parent Company, Deal → Line Items
- Auto-association rules (Contact patří k Company na základě email domain)

### 4.3 Properties

- **Default properties** – HubSpot dodává stovky výchozích polí
- **Custom properties** – text, number, date, datetime, dropdown, checkbox, file, calculation, score
- **Calculated properties** – computed z jiných polí (matematické operace, date arithmetic)
- **Score properties** – pro lead scoring
- **Per-property permissions** (Enterprise) – field-level security

### 4.4 Lifecycle Stages (kritický concept)

Default progression contacta v marketingovo-prodejním procesu:

1. **Subscriber** – přihlášený k odběru
2. **Lead** – známý, ale nekvalifikovaný
3. **MQL** (Marketing Qualified Lead) – marketing rozhodl, že je relevantní
4. **SQL** (Sales Qualified Lead) – sales kvalifikoval; má sub-statusy přes Lead Status property (e.g. New, Open, In Progress, Connected)
5. **Opportunity** – associated s open Deal
6. **Customer** – associated s closed-won Deal
7. **Evangelist** – customer, který advocates
8. **Other** – nezapadá

**Vlastnosti:**

- Plně customizovatelné (Enterprise)
- Nelze backwards (HubSpot blokuje regrese)
- Auto-update via workflows nebo lifecycle stage settings
- Calculated properties tracking: **Cumulative time in [stage]**, **Latest time in [stage]**, **Date entered/exited [stage]**

### 4.5 Leads object (2024+)

Nový top-level objekt pro **pre-deal prospecting**. Sales Workspace má dedikovanou „Leads" sekci.

- Sales rep vytvoří Lead z Contact/Company
- Lead má vlastní stages (custom)
- Když Lead konvertuje → vytvoří Deal
- Lze multiple Leads per Contact (long sales cycles, different product lines)
- Integrace s **Prospecting Agent** (Breeze AI)

---

## 5. Marketing Hub features

### 5.1 Free tier features

- Forms (basic)
- Landing pages s HubSpot brandingem
- Email marketing (basic editor, limit 2 000 emails/měsíc)
- Lists (jednoduché)
- Reports (10 dashboard limit)
- Live chat
- Conversational bots (jednoduché)
- Ad management (basic)

### 5.2 Starter ($20/seat/month)

- Remove HubSpot branding
- Email send limit: **5× počet kontaktů/měsíc**
- Up to 10 reporting dashboards, 10 reports per dashboard
- Simple automation (10 automated email actions per signup form)
- Pop-up forms
- 25 active lists, 1 000 static lists
- Blog (1)
- Email + in-app chat support
- Payment links

**Co Starter NEMÁ:**

- Workflows (full automation tool)
- A/B testing
- Custom reporting
- Lead scoring
- Social media scheduling
- ABM tools
- SEO tools
- Smart content
- Phone support

### 5.3 Professional ($890/month, 3 seats)

- **Plné Workflows** (multi-step automation, branching, kompletní triggers)
- Email send limit: **10× počet kontaktů**
- Phone support
- 100 shared inboxes
- **Marketing email A/B testing**
- **Custom reports & dashboards**
- **Lead scoring** (manual + nakonec predictive)
- **Social media** scheduling + monitoring (Facebook, Instagram, LinkedIn, X/Twitter, YouTube, TikTok)
- **Ad management** advanced (audience sync s Google, Meta, LinkedIn)
- **ABM (Account-Based Marketing)** tools
- **SEO tools** + content strategy
- **Smart content** – dynamic content per persona/segment
- **Marketing calendar**
- **Campaigns reporting** (cross-channel)
- **Multi-language content**
- **Salesforce integration** (full)
- **Custom event tracking**
- **Multichannel workflows** (email, ads, social, chat)
- **Personalization tokens** (full)
- **Custom CTAs**
- **Landing page A/B testing**
- **Goals & forecasts**

### 5.4 Enterprise ($3 600/month, 5 seats)

- Email send limit: **15× počet kontaktů**
- **Custom objects** (CRM)
- **Hierarchical teams**
- **Field-level permissions** (property-level security)
- **Sandbox environments**
- **Partitioning** (asset access podle teams)
- **Multi-touch revenue attribution**
- **Behavioral event triggers** (custom events workflow triggers)
- **Predictive lead scoring** (AI-based)
- **Calculated properties advanced**
- **Email frequency caps**
- **Marketing SMS** (selected regions)
- **Adaptive testing** (multivariate, AI-driven)
- **Account-Based Marketing** advanced
- **Single sign-on (SSO)** – SAML
- **Hierarchical reporting**
- **API rate limit increase**
- **Dedicated IP** option (separate add-on)
- **Brand kits** (multiple, multi-brand)

---

## 6. Email Marketing tool

### 6.1 Typy marketingových emailů

| Typ           | Kdy použít                         |
| ------------- | ---------------------------------- |
| **Regular**   | Single one-shot newsletter / promo |
| **Automated** | Email pro workflow (Pro+ jen)      |
| **Blog/RSS**  | Auto-generated z blog feedu        |
| **A/B test**  | 2 varianty regular (Pro+)          |
| **Test send** | Test do vašeho inboxu              |

### 6.2 Email Editor (drag-and-drop)

- **Templates library** – pre-built šablony per goal (newsletter, promo, transactional-look, welcome)
- **Modules**: Text, Image, Button, Divider, Spacer, Video, HTML, Whitespace, Footer, Header, RSS, Logo, Social Follow, Social Sharing, Payment, Survey, Meetings link
- **Brand kit** – uložené barvy, fonty, logo (Marketing Pro+ může mít multiple brand kits)
- **Smart content blocks** (Pro+) – per persona/segment/lifecycle stage
- **Personalization tokens** – pull data z libovolného Contact / Company / Deal / Ticket / Custom Object / Subscription / Invoice / Quote / Cart property
- **Fallback values** – pro každý token (pokud kontakt nemá hodnotu)
- **Dynamic CRM data** – kompletní CRM kontext v emailu

### 6.3 Personalization tokens (HubL syntax v pozadí)

```
Dear {{ contact.firstname|default("there") }},

Your company {{ contact.company }} has been with us since
{{ contact.createdate|datetimeformat('%B %Y') }}.
```

**Token kategorie:**

- Contact properties
- Company properties (auto-associated)
- Deal properties (workflow-triggered emails)
- Ticket properties (service)
- Custom object properties (Enterprise)
- Subscription, Invoice, Quote, Cart, Payment
- Owner properties (HubSpot user assigned to contact)
- System: signature, unsubscribe link, web view link

### 6.4 Email send settings

- **From name + email** – z verified domain
- **Reply-to** – může být odlišný
- **Subject line + Preview text** (s AI Subject Line Helper)
- **Recipient selection**:
  - Active list
  - Static list
  - Saved filter
  - Individual contacts
  - **Exclude lists** (suppression)
- **Subscription type** – HubSpot's GDPR-friendly model (níže)
- **Send time**:
  - Send immediately
  - Schedule for specific date/time
  - **Send time optimization** (AI predicts best time per recipient, Pro+)
  - **Time zone send** (per recipient's timezone)

### 6.5 A/B testing (Pro+)

- Test **subject line, preview text, content, sender, image**
- Split: **50/50 nebo custom %** (e.g. 10/90 winner rollout)
- **Winning metric**: open rate, click rate, click-through rate
- **Sample size** + **test duration** configurable
- **Winner auto-send**: po určení vítěze se zbytek listu pošle vítěznou variantu

### 6.6 Smart Content (Pro+)

Dynamický obsah, který se mění podle:

- Lifecycle stage
- Contact list membership
- Country
- Device type
- Referral source
- Language
- (Enterprise) custom property

Příklad: email má jeden „Smart Block" s 3 verzemi – MQL vidí verzi A, SQL verzi B, Customer verzi C.

### 6.7 Email frequency caps (Enterprise)

- Globální cap: max X emailů per kontakt per period
- Per-subscription-type caps
- Prevence email fatigue

### 6.8 Subscription Types (GDPR-friendly)

Místo „audience-level opt-in" jako Mailchimp, HubSpot má **multiple subscription types per účet**:

- E.g. „Newsletter", „Product Updates", „Promotional Offers", „Webinars"
- Kontakt může být subscribed jen k některým
- Každý email se posílá s referenčním subscription type
- Subscriber má v Preference Center možnost vybrat, co chce dostávat
- **One-click unsubscribe** per subscription type, nebo global

---

## 7. Lists, Segmentace, Lifecycle

### 7.1 Lists

| Typ             | Update                    | Use case                                    |
| --------------- | ------------------------- | ------------------------------------------- |
| **Active list** | Dynamicky (real-time)     | Behavior tracking, lifecycle stage grouping |
| **Static list** | Jednorázově při vytvoření | Specific point-in-time snapshot             |

**Limity:**

- Starter: 25 active, 1 000 static
- Professional: 1 200 active, 1 200 static
- Enterprise: vyšší limity / custom

**List filter criteria** – až **250 filtrů per list** (sloučeno AND/OR groups):

- Contact property (default + custom)
- Company property
- Deal property
- Ticket property
- Custom object property
- Form submission (specific form, any form, on specific page)
- Page view (specific URL, all URLs)
- Event completion (custom events)
- Email engagement (opened, clicked specific email, batch)
- Workflow status (in/completed/not in)
- List membership (in list X)
- Subscription status
- Marketing email subscription
- Privacy consent
- Import source
- CTA interactions
- Ad interactions
- Call interactions
- Conversation properties
- Meeting properties

### 7.2 Segments (CRM-wide, 2024+)

HubSpot zavedl **Segments** – obecnější než lists, mohou být napříč objekty.

- Použitelné jako enrollment criteria ve workflows
- Lze sdílet napříč tooly

### 7.3 Lifecycle Stage management

Viz sekce 4.4. Klíčové že:

- **Workflow trigger** může enrolovat při Lifecycle stage change
- **Lifecycle stage source** track (kdo updatnul – manually, by workflow, by integration)
- **Cumulative time in [stage]** – kolik dní celkově strávil
- **Latest time in [stage]** – aktuální nebo poslední pobyt

### 7.4 Lead Status (sub-stages SQL)

V rámci Sales Qualified Lead stage:

- **New** – právě se stal SQL
- **Open** – sales otevřel ho jako lead
- **In Progress** – aktivně working
- **Open Deal** – má associated deal
- **Unqualified** – nakonec nekvalifikováno
- **Attempted to Contact**
- **Connected**
- **Bad Timing**
- Custom values lze přidat

---

## 8. Forms, Landing Pages

### 8.1 Forms

**Typy:**

- **Embedded form** – HTML/JS k vložení na vlastní web
- **Standalone form** – HubSpot-hosted URL
- **Pop-up form** – modal, banner, drop-down, slide-in
- **Inline form** – součást Landing Page / Email
- **Multi-step forms** (Pro+)

**Features:**

- Drag-drop builder
- Field types: text, dropdown, multi-select, radio, checkbox, date, file upload, hidden, rich text
- **Progressive profiling** – další návštěva nahrazuje již vyplněná pole novými otázkami
- **Smart fields** – pole se schová, pokud HubSpot už ví hodnotu
- **Dependent fields** – conditional logic
- **Custom validation**
- **GDPR options** – consent checkboxy, language per region
- **CAPTCHA** (reCAPTCHA v3)
- **Auto-add to list / assign owner / set property / send notification**
- **Submit redirect** nebo inline thank-you message
- **A/B testing forms** (Pro+)

### 8.2 Landing Pages

- Drag-drop builder (stejný engine jako pro emails a website pages)
- Pre-built templates (Marketplace + custom)
- Mobile responsive
- **Smart content** per audience
- **A/B testing** (Pro+)
- **Adaptive testing** (Enterprise, multivariate AI)
- **Multi-language variants**
- **Custom domain**
- **Conversion tracking** (auto)
- **Heatmaps** via integrace

### 8.3 CTAs (Calls-to-Action)

- Embed library s tracking
- Buttons, banners, pop-ups, slide-ins, sticky bars
- **Smart CTAs** (Pro+) – different CTA per lifecycle stage / list / country
- **A/B test** CTA variants
- Click attribution → ke kampani

### 8.4 Pop-ups

- Trigger: exit intent, scroll depth %, time on page, page visit count, on-click
- Cooldown rules
- Frequency caps
- Smart targeting per visitor properties

---

## 9. Workflows (Automation)

**Jádro Marketing Hub Professional+.** HubSpot workflows = "marketing automation" + "operational automation" v jednom engine. Workflows fungují napříč všemi huby.

### 9.1 Workflow object types

Workflow má pevně přiřazený object type:

- **Contact-based** – nejčastější
- **Company-based**
- **Deal-based**
- **Ticket-based**
- **Quote-based**
- **Subscription-based**
- **Custom Object-based** (Enterprise)
- **Conversation-based**

Object type určuje, co workflow může enrolovat a měnit.

### 9.2 Enrollment trigger types

Pět typů:

#### A) When an event occurs (event-based)

Nejmodernější typ (rozšířen 2025+). Záznam se enrolne, když konkrétní událost nastane (po aktivaci workflow). **Nelze enrolnout existing records, kteří už event splnili.**

**Příklady event triggerů:**

- Form submission (specific form + page)
- Email events (opened, clicked, sent)
- Ad interactions
- Page view events
- Custom behavioral events (Enterprise)
- CTA click
- Conversation started
- Meeting booked
- Object created
- Object property updated
- File downloaded

#### B) When filter criteria is met

Záznam se enrolne, když splňuje set of filter conditions. Lze:

- Enrolnout jen new records that meet criteria
- Enrolnout i existing records that already meet criteria

Až **250 filtrů per workflow** trigger.

#### C) Based on a schedule

- Recurring (annual/monthly/weekly/daily – monthly+ vyžaduje Data Hub Pro/Ent)
- Once at specific date
- Based on date property (e.g. contact's birthday)

Bez additional filter criteria pouze enrolne manuálně.

#### D) When a webhook is received (Data Hub Pro+ only)

External system POSTNE webhook → HubSpot enrolne kontakt.

#### E) Trigger manually

Bez auto-enrollment. Lze enrolnout z:

- Other workflows (Enroll in another workflow action)
- Bot conversation
- Manual user action (CRM card)

### 9.3 Actions – plný výčet

**Communication actions:**

- Send email (marketing or one-to-one transactional)
- Send SMS (with SMS integration / Marketing Enterprise)
- Send WhatsApp message
- Send internal email notification
- Send in-app notification
- Send Slack notification

**Delays:**

- Delay for set amount of time
- Delay until specific day/time
- Delay until event occurs (with timeout)

**Branches:**

- **If/then branch** – up to 20 branches s conditions
- **Value equals branch** – branchuje podle hodnoty property
- **Random split** – % split

**CRM actions:**

- Create record (Contact, Company, Deal, Ticket, Custom Object)
- Copy record
- Associate records
- Update property value
- Clear property value
- Increase/decrease numeric property
- Append to multi-value
- Add to / Remove from list
- Set marketing contact status
- Manage subscription (subscribe/unsubscribe)
- Manage GDPR consent

**Workflow management:**

- Enroll in another workflow
- Unenroll from another workflow
- Send for approval
- End workflow / goto step

**Tasks:**

- Create task
- Update task

**Lead management:**

- Rotate leads (round-robin assignment)
- Assign owner (set Contact owner, Deal owner, etc.)
- Create lead record

**External actions (integrations):**

- Slack message
- Zoom meeting
- Google Calendar event
- Salesforce sync trigger
- Custom webhook (Operations Hub)
- Custom-coded action (Operations Hub) – JS/Python serverless
- App-specific actions from connected apps

**Data quality:**

- Format property value
- Convert phone number format
- Translate text

**AI actions (Breeze):**

- Generate email content with AI
- Summarize with AI
- Classify with AI
- Extract from text
- Translate
- Prospecting Agent enrollment

### 9.4 Re-enrollment

- Default: záznam enrolne se v workflow **jen poprvé**
- **Re-enrollment** lze zapnout per trigger
- Re-enrollment podmínky se vyhodnocují pokaždé, když property změní hodnotu
- Některé properties nelze use pro re-enrollment (e.g. Last modified date, privacy consent events, calculation properties)

### 9.5 Suppression lists

Per workflow:

- Lists records, které se NIKDY neenroll
- Lze multiple suppression lists

### 9.6 Unenrollment triggers

- Když záznam splní criteria → vystoupí z workflow
- Lze nastavit per workflow

### 9.7 Workflow settings

- **Run actions at specific times only** (e.g. jen Po–Pá 9–17h)
- **Pause dates** (např. svátky)
- **Schedule to turn off** at specific date
- **Connections** – „Unenroll from other workflows when enrolled here"
- **Performance notifications** (Enterprise) – AI Breeze Intelligence detekuje anomálie v enrollment rate
- **Goal step** – tracking conversion při dosažení cíle
- **Compare conversion for each branch/end-point** – branch performance analytics

### 9.8 AI Workflow Builder

Od 2025+: **Breeze Assistant** umí vygenerovat workflow z prompt:

> "When a contact submits the Demo Request form on the Pricing page, send them a confirmation email, create a Lead record, and notify the sales team via Slack."

→ Breeze vygeneruje triggers + actions.

### 9.9 Workflow limits

- HubSpot ukládá:
  - **90 dní** workflow action log data
  - **6 měsíců** historical enrollment data
- **Workflow asset limit** – per plan (e.g. Professional: 300 workflows; Enterprise: 1000)
- **Action limit per workflow** – několik tisíc (de facto unlimited pro praxi)

### 9.10 AI Audit Cards (2026)

Pro každou automated AI action workflow zobrazí Audit Card – proč AI rozhodla, jak modifikovala property. Compliance + debugging.

---

## 10. Sequences (Sales)

**Sequences ≠ Workflows!** Často matoucí.

|              | Workflows                    | Sequences                                  |
| ------------ | ---------------------------- | ------------------------------------------ |
| Typ          | Many-to-one mass automation  | **One-to-one personal outreach**           |
| Audience     | Lists, segments, dynamic     | Manuálně enrolled, malé skupiny            |
| Co posílá    | Marketing emaily (batch)     | Z osobní inbox sales rep                   |
| Stop trigger | Goal step / unenroll         | **Auto-stop on reply nebo booked meeting** |
| Použití      | Lead nurture, lifecycle, ops | Sales prospecting                          |
| Tarif        | Marketing Hub Pro+           | Sales Hub Pro+                             |

Sales rep vytvoří 5-step sequence, manually enrolle 50 prospects, sequence auto-pošle z jeho osobní inbox přes Gmail/Outlook integration. Pokud někdo odpoví, sequence se okamžitě zastaví (jen pro toho contacta).

---

## 11. Lead Scoring

### 11.1 Manual rule-based scoring (Pro+)

- **HubSpot Score** property (default)
- Lze přidat custom score properties
- Pravidla:
  - **Positive criteria** (+ N body): viewed pricing page, downloaded whitepaper, attended webinar, job title contains "VP", company size > 100
  - **Negative criteria** (− N body): no activity 30 days, unsubscribed, hard bounce, competitor email domain
- Score se přepočítává **v real time**
- **No native decay logic** – musí se manuálně přes workflow (subtract X bodů po 30 dnech bez activity)

### 11.2 Predictive Lead Scoring (Pro+, AI-driven)

- HubSpot AI model trénován na historických closed-won / closed-lost dealech
- **Minimum:** 100 closed-won + 100 closed-lost deals pro aktivaci
- Output: contact likelihood-to-close score
- Auto-update jak data rostou
- Použití: list segmentation, workflow enrollment, sales prioritization

### 11.3 Lead Scoring 2.0 (2025 update)

- Multi-property scoring – multiple score properties paralelně
- Score-based lifecycle transitions
- Visual scoring rule builder
- Score history tracking

---

## 12. Marketing Contacts

**Klíčová specialita HubSpot pricingu.** Ne všichni contacti v CRM se počítají do marketing tier.

### 12.1 Marketing Contact vs. Non-Marketing Contact

- **Marketing Contact** – kontakt, kterému lze posílat marketingové emaily; **počítá se do limitu** marketing tier
- **Non-Marketing Contact** – v CRM existuje, ale nelze mu posílat marketing email; **neúčtuje se**

User volí status:

- Manuálně (toggle na contact record)
- Workflow action „Set marketing contact status"
- Form submission (auto-mark as marketing pokud submitted marketing form)
- Import setting

Tým může mít **stovky tisíc kontaktů v CRM** (jako non-marketing) a platit jen za marketing subset.

### 12.2 Velký výhoda vs. Mailchimp

Na rozdíl od Mailchimpu, kde **každý kontakt v audience** se počítá (i unsubscribed), HubSpot oddělil databázi od marketingové fakturace.

### 12.3 Důsledky

- Sales může mít celou pipeline contactů v CRM, ne jen marketingové leads
- Service ticketingoví zákazníci nemusí být marketing contacts
- Imported lists – při importu se ptá, zda mark as marketing

---

## 13. Breeze AI

HubSpot's AI suite, launched 2024, evoluce přes 2025–2026. Nahradila „ChatSpot" branding.

### 13.1 Breeze Assistant

- Conversational AI v UI – natural language commands
- "Generate workflow to onboard new customers"
- "Summarize this contact's activity from last quarter"
- "Draft email to MQL contacts in EMEA region"

### 13.2 Breeze Agents

Autonomní specializovaní AI agents:

| Agent                    | Co dělá                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| **Prospecting Agent**    | Hledá nové prospekty, researchuje firmy, draftuje outreach emails    |
| **Content Agent**        | Generates blog posts, landing pages, email content podle brand voice |
| **Customer Agent**       | AI-powered customer support (chatbot+)                               |
| **Social Media Agent**   | Drafts social posts, suggests timing                                 |
| **Data Agent**           | Cleans CRM data, deduplicates, enriches properties                   |
| **Knowledge Base Agent** | Generates KB articles z historických tickets                         |

### 13.3 Breeze Intelligence

Embedded AI features napříč platformou:

- **Predictive lead scoring** (viz výše)
- **Send time optimization**
- **Subject line generation**
- **Email content suggestions** (write/improve/shorten/translate)
- **Content remix** – z 1 blog post vygeneruje email, social posts, video script
- **Form shortening** – AI doporučí, která pole odstranit pro lepší conversion
- **Workflow generation** (viz 9.8)
- **Workflow anomaly detection** – Breeze hlídá enrollment rate
- **AI Audit Cards** – transparentnost AI rozhodnutí

### 13.4 HubSpot Credits (2025+)

AI features konzumují **HubSpot Credits** – nová billing unit:

- Plány mají monthly allowance kreditů
- Heavy AI workloads vyžadují přikoupení kreditů
- Per-action cost se liší (basic completion vs. agent run)

---

## 14. Reports

### 14.1 Out-of-the-box reports

Stovky pre-built reports per Hub + general:

- Email performance
- Funnel reports (lifecycle stage funnels)
- Source attribution
- Contact growth
- Form conversion
- Landing page conversion
- Workflow performance
- Sales pipeline
- Customer service metrics

### 14.2 Custom Reports (Pro+)

- **Custom Report Builder**
- Dimensions, metrics, filters napříč objekty
- Chart types: bar, line, pie, donut, area, scatter, funnel, table, gauge, KPI
- Save & share s týmem

### 14.3 Dashboards

- Default + custom dashboards
- Per-user / per-team filtering
- Scheduled email delivery
- Limity:
  - Starter: 10 dashboards, 10 reports per dashboard
  - Pro: 25 dashboards, 30 reports per dashboard
  - Enterprise: 50 dashboards, 30 reports per dashboard

### 14.4 Marketing Analytics

- **Traffic Analytics** – sources, devices, country
- **Campaign Analytics** – cross-channel campaign performance
- **Attribution** (Enterprise): multi-touch revenue attribution
  - First-touch
  - Last-touch
  - Linear
  - U-shaped
  - W-shaped
  - Time-decay
  - Custom

### 14.5 Email Analytics

Per-email report obsahuje:

- Sent, Delivered, Bounce (hard/soft)
- Opens (raw + unique), Open rate
- Clicks, CTR, top links
- Unsubscribes, Spam complaints
- Conversion (form submissions, deals)
- Engagement timeline (24h, 7-day)
- Email client breakdown
- Device breakdown
- Geographic breakdown
- Recipient activity (kdo otevřel, klikl, kdy)

---

## 15. Deliverability

### 15.1 Sending infrastruktura

- **Shared IP pools** default (segmented by sender reputation – Pro+ se dostane do lepších poolů)
- **Dedicated IP** add-on (Enterprise) – $399/měsíc oficiálně
- Minimum send volume pro dedicated IP: 200 000+ marketing emails/month

### 15.2 Email Authentication

Stejný jako u Mailchimpu, ale s vlastními configy:

- **SPF** – HubSpot uses own MAIL FROM, doesn't require SPF update on customer domain (alignment fails ale OK)
- **DKIM** – 2× CNAME records (cm.\_domainkey, mta.\_domainkey) na customer's sending domain
- **DMARC** – customer publishes \_dmarc TXT record; passes via DKIM
- **BIMI** – po splnění DMARC reject + verified logo
- **Automated DNS** – HubSpot nemá vlastní Entri-like ale poskytuje DNS provider integrations

### 15.3 Sending Domains

- Verify domain → email-ownership confirmation
- Authenticate → DKIM + DMARC setup
- HubSpot pošle nudges v UI, pokud authentication chybí

### 15.4 List hygiene

- Auto-mark **hard bounces** jako bounced (excluded from future sends)
- Soft bounces – opakovaně → eventual bounce status
- Spam complaints → auto-unsubscribe
- **Email Health tool** (Pro+) – průběžné monitorování deliverability metrics
- **Email recommendations** – AI suggestion (e.g. „You're sending too frequently to inactive contacts")

### 15.5 Frequency caps (Enterprise)

- Per-account global cap
- Per-subscription-type cap
- Honors fatigue patterns

### 15.6 Známé deliverability issues

- Free tier emails (HubSpot branding) mají horší inbox placement
- Shared IP s tisíci dalšími senders – některé HubSpot IP bloky historicky na blacklistech
- HubSpot tracking pixely a click trackers triggrují u nicméně email klientů spam filters

---

## 16. API, Integrace

### 16.1 API

**API v3** je current. Base: `https://api.hubapi.com/`

**Authentication:**

- **Private Apps** (recommended) – API key per app, scoped permissions
- **OAuth 2.0** – pro public apps z App Marketplace
- **API Keys** (deprecated, ale stále funkční pro legacy)

### 16.2 Hlavní endpoint groups

| API                   | Endpoint examples                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| **CRM API**           | `/crm/v3/objects/contacts`, `/companies`, `/deals`, `/tickets`, `/leads`, `/products`, custom objects |
| **CMS API**           | Pages, Blog, HubDB, Templates                                                                         |
| **Marketing API**     | Emails, Forms, Landing Pages, Campaigns, CTAs                                                         |
| **Conversations API** | Inbox, channels                                                                                       |
| **Webhooks API**      | Subscribe to events                                                                                   |
| **Files API**         | File Manager upload/management                                                                        |
| **Workflow API**      | Enroll/unenroll contacts                                                                              |
| **Analytics API**     | Event tracking, custom behavioral events                                                              |
| **OAuth API**         | Token refresh, scopes                                                                                 |
| **Settings API**      | Users, teams, permission sets                                                                         |

### 16.3 Rate limits

- Free: 100 requests/10 sec, 250k/day
- Starter+: higher limits
- Enterprise: customizable

### 16.4 Webhooks

Subscribe to events:

- Contact created/updated/deleted/property change
- Deal lifecycle
- Form submissions
- Email subscription change
- Conversation events
- Custom event triggers

### 16.5 Custom Events API

Track behavioral events z jakékoli external systému → HubSpot může enrollnout do workflow.

### 16.6 App Marketplace

**1 700+ integrations** (2026). Vybrané:

- **CRM:** Salesforce (deep two-way sync), Microsoft Dynamics, Pipedrive
- **E-commerce:** Shopify, WooCommerce, BigCommerce, Magento
- **Email:** Gmail, Outlook integration (deep)
- **Calendar:** Google Calendar, Outlook Calendar
- **Communications:** Slack, Zoom, Microsoft Teams, WhatsApp
- **Ads:** Google Ads, Meta (Facebook/Instagram), LinkedIn Ads, X Ads
- **Analytics:** Google Analytics, Mixpanel
- **Survey:** SurveyMonkey, Typeform
- **Webinar:** Zoom Webinars, GoToWebinar, Demio
- **Customer support:** Zendesk, Intercom, Drift
- **Productivity:** Asana, Trello, Notion, Monday.com
- **Accounting:** QuickBooks, Xero, NetSuite
- **Documents:** Google Drive, Dropbox, DocuSign, PandaDoc
- **iPaaS:** Zapier, Make, Workato, Tray.io
- **Forms:** Jotform, Wufoo, Google Forms
- **Booking:** Calendly
- **AI/Data:** ChatGPT, Clearbit, ZoomInfo

### 16.7 Operations Hub / Data Hub (integration layer)

Vlastní iPaaS:

- **Data Sync** – two-way sync s 100+ apps (built-in, no Zapier middleman)
- **Custom-coded workflow actions** – JS/Python serverless
- **Programmable automation** – complex transformations
- **Webhook triggers** v workflow (Pro+)
- **Data Quality Command Center** – AI-assisted deduplication, format standardization
- **Snowflake / BigQuery sync** (Enterprise)

---

## 17. Content Hub

Dříve **CMS Hub**, přejmenováno 2024.

### 17.1 Features

- **Website CMS** – managed website hosting
- **Blog tool** – blogging platform
- **Drag-drop page editor**
- **HubL templating** language pro vlastní šablony
- **Theme marketplace**
- **Smart content per visitor**
- **Membership content** (gated, member-only)
- **Multi-language** (Pro+)
- **A/B testing pages**
- **Adaptive testing** (multivariate AI)
- **SEO tools** – on-page recommendations, content strategy
- **HubDB** – relational database tables k content
- **Site search**
- **Built-in CDN, SSL**
- **WAF / security**
- **Serverless functions** (Pro+)
- **AI content creation** (Breeze)
- **Content remix** – AI multiformat
- **Memberships** (Pro+)
- **Podcasts** (2024+)
- **AI translations**

### 17.2 HubSpot Forms vs. Content Hub forms

Stejný engine napříč.

---

## 18. Ostatní huby

### 18.1 Sales Hub

- **Email tracking** – opens, clicks, replies v Gmail/Outlook
- **Email templates** – team templates
- **Sequences** (viz sekce 10)
- **Meetings** – Calendly-like booking
- **Documents** – sales collateral s tracking
- **Playbooks** – sales rep guides v CRM
- **Quotes** – generate, e-sign
- **Forecasting** (Pro+) – AI-assisted
- **Call recording & transcription** (Pro+)
- **Prospecting Workspace** – dedicated UI pro SDRs
- **Lead routing** (round-robin, custom rules)
- **Deal pipelines** – multiple, customizable
- **Predictive deal scoring** (Pro+)

### 18.2 Service Hub

- **Help Desk / Inbox**
- **Tickets** – multi-channel
- **Knowledge Base**
- **Customer Portal**
- **Surveys** – NPS, CSAT, CES
- **Live chat & chatbots**
- **Customer feedback**
- **Service Level Agreements (SLA)**
- **Routing**
- **Service analytics**
- **Customer health score**

### 18.3 Commerce Hub

- **Payment links** – Stripe-powered
- **Invoices** – generate, e-sign
- **Subscriptions management**
- **Quotes**
- **Products catalog**
- **B2B checkout**
- **Customer portal pro payments**
- **Revenue recognition**

### 18.4 Operations Hub / Data Hub

Viz sekce 16.7. Cross-cutting infrastruktura.

---

## 19. Compliance

### 19.1 GDPR

- **Privacy & Consent settings** – per audience cookie banner, consent management
- **Consent properties** – per-contact tracking (Marketing consent, Cookie consent, Email subscription)
- **Subscription types** – granular opt-in per email type
- **Cookie scanner** – detect cookies on website
- **Cookie consent banner builder**
- **GDPR-compliant forms**
- **Right to be forgotten**:
  - Settings → Data Privacy → Delete contact permanently
  - Workflow action „Delete contact"
  - API endpoint pro GDPR delete
  - Removes from CRM + adds to permanent suppression
- **Data export per contact**
- **DPA** – sub-processor list, EU-US Data Privacy Framework

### 19.2 Audit logs

- **Security activity log** – Super Admin login attempts, password changes, 2FA events
- **Account activity** (Enterprise) – kdo co kdy editoval (limited per object)
- **Workflow history** – per-record enrollment log (90 days), enrollment data (6 months)

### 19.3 Compliance certifications

- SOC 2 Type II
- ISO 27001, ISO 27018, ISO 27017
- HIPAA (Service Hub + Enterprise)
- PCI DSS (Commerce Hub)
- EU-US Data Privacy Framework

### 19.4 Authentication

- **Two-factor authentication** (TOTP, SMS)
- **Single Sign-On (SSO)** – SAML 2.0 (Enterprise)
- **Session management**
- **API key rotation**

---

## 20. Limity

### 20.1 Cenové limity

- **Onboarding fees** povinné u Pro a Enterprise ($3 000–12 000+)
- **Annual contract** povinný u Pro/Enterprise (no monthly toggle)
- **44× cost gap** Starter→Pro
- **Premium Salesforce integration** jen Pro+
- **Marketing contacts** lze rozšířit (per-1000 add-ons)

### 20.2 Funkcionalita

- **No automation v Starter** – jen jednoduché autoresponders
- **Predictive lead scoring** vyžaduje 100 closed deals
- **Custom objects** jen Enterprise
- **Field-level permissions** jen Enterprise
- **SSO** jen Enterprise
- **Branding nelze v Free** (HubSpot logo v emailech)

### 20.3 UI/UX

- **Žádná čeština/slovenština/polština** v UI
- **Steep learning curve** – komplexnost je legendární
- **Many features cross-Hub** – pochopit, co je v jakém Hubu, je samo o sobě úkol
- **Settings hidden v menus** – často nejasná navigace

### 20.4 Workflow limity

- **Workflow history** jen 90 dní action log, 6 měsíců enrollment
- **No native version control** workflows
- **Event triggers nepokrývají existing records** – jen post-activation

### 20.5 API & Integration

- **Rate limits** mohou být restrictive pro heavy users
- **Webhooks v workflow** vyžadují Data Hub Pro+
- **Custom-coded actions** vyžadují Operations Hub Pro+

### 20.6 Email-specific

- **List management komplexnější** než dedicated email tools
- **Frequency caps** jen Enterprise
- **Transactional email** přes separate "Transactional Email" add-on (cca $600/měsíc)
- **Deliverability** na shared IPs proměnlivá

---

## 21. Shrnutí: Pro koho a proti komu

### HubSpot je dobrá volba pokud

- Hledáte **all-in-one platform** (CRM + marketing + sales + service)
- Máte **střední až velký B2B tým** s formálními procesy
- Cíl je **sales-led growth** s long sales cycles
- Potřebujete **multi-channel automation** (email + ads + social + chat + ticket)
- Hledáte **inbound marketing toolkit** (SEO + content + blog + landing pages)
- Máte budget na onboarding ($3k+) a annual commitment
- Vážíte si polished UX a velkého community + ekosystému partners

### HubSpot není dobrá volba pokud

- Hlavní use-case je **pouze email marketing** (Mailchimp/Brevo levnější)
- Jste **e-commerce-first** (Klaviyo silnější pro Shopify)
- Máte malý budget – Marketing Hub Pro je $890/měsíc base
- Potřebujete **transactional email** primárně (Postmark/SendGrid/SES)
- Pracujete primárně v **češtině/slovenštině/polštině** (UI nemá lokalizace)
- Chcete **per-feature pricing** – HubSpot vyžaduje commit na celý Hub
- **Bootstrappujete** a chcete start-small-scale-up flexibility
- Máte **vlastní CRM** a chcete jen email automation

### HubSpot vs. konkurence (matice)

| Konkurence              | Kdy lepší než HubSpot                                     |
| ----------------------- | --------------------------------------------------------- |
| **Mailchimp**           | Cheap email-only use case                                 |
| **Brevo**               | Volume-based pricing pro velké listy s low send frequency |
| **Klaviyo**             | E-commerce / Shopify-first                                |
| **ActiveCampaign**      | Mid-tier automation za frakci ceny                        |
| **Salesforce + Pardot** | Enterprise s existující SF investment                     |
| **Marketo**             | Enterprise B2B s heavy account-based motion               |
| **Customer.io**         | Product-led growth / SaaS s event-driven journeys         |

---

_Dokument zpracován z veřejně dostupných oficiálních zdrojů HubSpotu (knowledge.hubspot.com, hubspot.com/pricing, hubspot.com/products) a renomovaných analytických webů. Pro nejaktuálnější ceny vždy ověřit na hubspot.com/pricing._
