# Brevo – hloubková analýza funkcí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Zdroje:** oficiální dokumentace help.brevo.com, developers.brevo.com, brevo.com/pricing + analytické weby (Venture Harbour, EmailToolTester, Sender, SalesHive, Stitchflow, Marketing Automation Insider, That Marketing Buddy) ověřené v dubnu–květnu 2026.
**Rozsah:** kompletní funkcionalita platformy v roce 2026 – Marketing Platform, Sales Platform (CRM), Conversations, Phone, Customer Data Platform, Loyalty + transactional API.

> **Důležitý kontext:** Brevo bylo do dubna 2023 známé pod jménem **Sendinblue** (založeno 2012 v Paříži). V roce 2023 rebrand. V prosinci 2025 prošlo financováním €500M (vedené General Atlantic) a stalo se **unicornem**. ARR překročil $218M, společnost obsluhuje **600 000+ zákazníků ve 180+ zemích**.
>
> **Hlavní odlišení od Mailchimpu/HubSpotu:** Brevo účtuje **podle objemu odeslaných emailů**, ne podle počtu kontaktů. Můžete mít 100 000 kontaktů zdarma a platit jen za objem odeslaných emailů.

---

## Obsah

1. [Co je Brevo a jak je strukturováno](#1-co-je-brevo)
2. [Produktové moduly](#2-produktové-moduly)
3. [Tarify a cenová struktura](#3-tarify)
4. [Volume-based pricing model](#4-volume-pricing)
5. [Marketing Platform – features](#5-marketing-features)
6. [Email Campaigns](#6-email-campaigns)
7. [Marketing Automation](#7-marketing-automation)
8. [Forms, Landing Pages, Push notifications](#8-forms-landing-pages)
9. [SMS, WhatsApp, Web push, Mobile push](#9-multichannel)
10. [Transactional Email (Email API)](#10-transactional-email)
11. [Sales Platform (CRM)](#11-sales-platform)
12. [Conversations (Chat & Inbox)](#12-conversations)
13. [Brevo Phone](#13-brevo-phone)
14. [Customer Data Platform (CDP)](#14-cdp)
15. [Loyalty & Wallet](#15-loyalty)
16. [Aura AI – AI vrstva](#16-aura-ai)
17. [Contacts, Segmentation, Scoring](#17-contacts-segmentation)
18. [Reports & Analytics](#18-reports)
19. [Deliverability & Authentication](#19-deliverability)
20. [API, Webhooks, Integrace](#20-api-integrace)
21. [Compliance, GDPR, EU hosting](#21-compliance)
22. [Limity a nedostatky](#22-limity)

---

## 1. Co je Brevo

- **Společnost:** Brevo (dříve Sendinblue), francouzský původ
- **HQ:** Paříž, Francie + offices Severní Amerika, Evropa, Indie
- **Vznik:** 2012, founder Armand Thiberge
- **Rebrand:** Sendinblue → Brevo (duben 2023)
- **Velikost (2026):** 600 000+ zákazníků v 180+ zemích
- **Financování:** €500M / $583M Series funding (prosinec 2025) – led by General Atlantic; **unicorn status**
- **ARR:** $218M+ (Q4 2025)
- **Pozice:** evropský all-in-one customer engagement platform, **GDPR-first alternativa** k US-centric Mailchimp/HubSpot/Klaviyo
- **Lokalizace UI:** angličtina, francouzština, němčina, italština, španělština, portugalština + další ~6 jazyků. **Čeština, slovenština, polština NEJSOU** podporovány v UI.

### Filozofie produktu

Brevo se pozicionuje jako **„customer engagement platform"** – ne email tool, ne CRM, ale jejich konvergence + multichannel + AI vrstva. Po akvizici **Newsletter2Go (DE)** v 2017 a postupné expanzi je dnes mnohem víc než pouhý email sender.

```
┌─────────────────────────────────────────────────────────────────┐
│                  BREVO PLATFORM                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Marketing      │  │ Sales        │  │ Conversations   │      │
│  │ Platform       │  │ Platform     │  │ (Chat + Inbox)  │      │
│  │ (email, SMS,   │  │ (CRM,        │  │                 │      │
│  │  WhatsApp,     │  │  pipelines,  │  │                 │      │
│  │  automation)   │  │  meetings)   │  │                 │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Transactional  │  │ Brevo Phone  │  │ Loyalty &       │      │
│  │ Email & SMS    │  │ (cloud       │  │ Wallet          │      │
│  │ API / SMTP     │  │  telephony)  │  │                 │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│       Customer Data Platform (CDP) + Aura AI layer              │
│       Contacts │ Companies │ Deals │ Events │ Lists             │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│   EU-hosted infrastructure (Paris, Frankfurt)                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Produktové moduly

Brevo není „jeden plán" – je to **více platforem**, které lze kombinovat. Account může mít:

1. **Marketing Platform** (email + SMS + WhatsApp + automation + ads + push + landing pages)
2. **Sales Platform** (CRM, pipelines, meetings) – přidává se jako "Sales package"
3. **Conversations** (live chat + inbox unified)
4. **Brevo Phone** (cloud telephony, plně VoIP)
5. **Customer Data Platform** (Enterprise)
6. **Loyalty & Wallet** (Pro+)
7. **Transactional email & SMS API** – součást Marketing Platform na všech tarifech

Tato modularita odlišuje Brevo od HubSpotu (kde jsou Huby plně oddělené) a od Mailchimpu (kde je jen email + landing pages).

---

## 3. Tarify a cenová struktura

Brevo má v 2026 **čtyři hlavní marketing tarify** + samostatné Sales pricing + Phone pricing.

### 3.1 Marketing Platform tarify

| Tarif | Cena (annual) | Měsíční emails | Kontakty | Klíčové |
|---|---|---|---|---|
| **Free** | $0 | **300/den** (~9 000/měsíc) | **až 100 000** | Drag-drop editor, basic automation (max 2 000 kontaktů ve workflow), transactional API, Aura AI assistant, Brevo branding |
| **Starter** | od **$9/měsíc** (5 000 emails) až $69/měsíc (100 000 emails) | dle volby | unlimited | Basic email marketing, SMS, templates, segmentation; logo removal = +$10.80/měsíc add-on |
| **Business / Standard** | $18 (5K) → $129/měsíc (100K) | dle volby | unlimited | + Marketing Automation (full), A/B testing, send time optimization (Aura), web & event tracking, landing pages, dynamic content, multi-user |
| **Professional** | od **$499/měsíc** | vyšší volume | unlimited | + Contact scoring (RFM, CLV), advanced ecommerce (AI recommendations, back-in-stock, coupons), AI segmentation (Aura), AI Data Analyst, phone support, WhatsApp |
| **Enterprise (Brevo Plus)** | **custom quote** | custom | 1M+ | + Sub-accounts/sub-organizations, dedicated IP, SSO/SAML, tailored onboarding, CSM support, custom integrations |

> **Pozn.:** Cenové bandy se mohou lehce lišit podle regionu (USA vs. EU vs. další). Tarif "Business" byl v říjnu 2025 přejmenován na "Standard" + zaveden Professional tier. Aktuální stav viz brevo.com/pricing.

### 3.2 Pay-as-you-go (prepaid email credits)

Pro low-volume nebo unpredictable senders. Koupíte balíček emails:
- 5 000 credits za jednorázovou cenu
- 10 000 credits
- 20 000 credits
- atd.

**Nevýhody:** žádné landing pages, omezené automation.

### 3.3 Sales Platform add-on (oddělené pricing)

Samostatný produkt přidáván k Marketing Platform:
- **Sales Free** – 1 user, basic CRM
- **Sales Essentials** – ~$27.92/user/měsíc
- **Sales Pro / Advanced** – ~$58.50/user/měsíc

Sales add-on dává user „Sales seat". Marketing user + Sales user = každý platí svůj seat.

### 3.4 Conversations pricing

- **Free** – limited live chat
- **Conversations plan** – $15/user/měsíc

### 3.5 Brevo Phone

Samostatný produkt s vlastním pricing + SMS/voice credits.

### 3.6 Skryté náklady – co je třeba vědět

Brevo je mezi cheapest platformami na trhu, ale stále existují **add-on costs**:

1. **Logo removal** – +$10.80/měsíc (jen Free a Starter, na Business+ je remove součástí)
2. **Dedicated IP** – jen Professional+ a Enterprise
3. **Sales features** – $27.92–$58.50 per user
4. **Phone support** – jen Professional+
5. **SMS credits** – samostatně se kupují (cena se liší per země)
6. **WhatsApp** – jen Professional+
7. **Sub-accounts** – jen Enterprise
8. **SSO/SAML** – jen Enterprise

---

## 4. Volume-based pricing

Klíčový **strukturální rozdíl** od Mailchimpu a HubSpotu.

### 4.1 Jak to funguje

```
Brevo NEÚČTUJE za počet kontaktů.
Brevo ÚČTUJE za počet odeslaných emailů per měsíc.
```

Důsledky:
- Můžete mít **unlimited contacts** na všech placených plánech
- Můžete mít 100 000 kontaktů na Free planu
- **Unsubscribed kontakty se nepočítají do billing** (vs. Mailchimp, kde počítají)
- **Cena se liší podle toho, jak často posíláte**

### 4.2 Kdy je to výhodné

Mailing scenario: **25 000 kontaktů**

| Platform | Send frequency: 1× měsíc (25K emails) | 4× měsíc (100K emails) | 8× měsíc (200K emails) |
|---|---|---|---|
| **Brevo Standard** | ~$65/měsíc | ~$129/měsíc | ~$249/měsíc |
| **Mailchimp Standard** | $260/měsíc | $260/měsíc | $260/měsíc |
| **ActiveCampaign Plus** | $389/měsíc | $389/měsíc | $389/měsíc |

Brevo wins meaningfully when:
- Large list with **moderate send frequency**
- E-commerce s velkou databází nepropagovaných customerů
- Newsletters posílaný 1–2× týdně

Mailchimp/AC wins when:
- Small list (méně než 5 000) s velmi častými sends
- Daily/twice-daily campaigns

### 4.3 Sendings limit + overages

- Free: hard limit **300 emails/den** (paused if exceeded)
- Paid: limit dle plánu; **overage charges** at higher rates pokud přesáhnete

### 4.4 Sjednocený stream (marketing + transactional)

**Důležité:** Free plan **sčítá marketing + transactional** do 300/den limitu. Paid plány často **počítají oba** v rámci monthly send limit.

---

## 5. Marketing Platform features

### 5.1 Free tier features

- Drag-and-drop email editor
- Pre-built responsive templates
- Basic segmentation
- Transactional email API + SMTP
- Real-time reporting
- Forms (basic)
- Basic automation (up to 2 000 contacts within active workflows)
- **Aura AI assistant** (content gen, subject line)
- Mobile responsive editor
- Brevo branding required

### 5.2 Starter tier

+ Basic email marketing
+ Email + SMS sends (SMS credits separately)
+ Industry templates
+ AI content generator
+ Advanced segmentation
+ Forms (lead capture, auto-trigger emails)
+ Basic reporting & analytics
+ Email support (6 languages)
+ **Add-on:** logo removal ($10.80/měsíc)

### 5.3 Business / Standard tier

+ **Marketing Automation (plné):** drag-drop workflow editor, multi-step, branching
+ **A/B testing** subject lines, content
+ **AI send time optimization** (Aura)
+ **Web & event tracking** (custom event triggers)
+ **Landing pages** (1 page included)
+ **No Brevo logo** (built-in, ne add-on)
+ **Multi-user access** (per seat pricing)
+ **Dynamic personalization** v emailech
+ **Heat maps** v reports

### 5.4 Professional tier

+ **Contact scoring** – Recency Frequency Monetary (RFM), Customer Lifetime Value (CLV), Purchase Timing Deviation, custom rules
+ **Advanced commerce features:** AI product recommendations, back-in-stock alerts, dynamic coupons
+ **AI segmentation** – Aura suggests audience groups
+ **AI Data Analyst** – natural language data questions
+ **WhatsApp campaigns**
+ **Phone support**
+ **Predictive lead scoring** (2026+, novinka)
+ **Dedicated IP** option (additional cost)

### 5.5 Enterprise (Brevo Plus)

+ **Sub-organizations / sub-accounts** (multi-brand, agency management)
+ **SSO & SAML** authentication
+ **Tailored onboarding**
+ **CSM (Customer Success Manager)** support
+ **Custom integrations**
+ **Custom data residency** options
+ **Volume discounts** + custom contract
+ **Advanced security features**
+ **Custom data export & retention** options

---

## 6. Email Campaigns

### 6.1 Typy kampaní

| Typ | Kdy použít |
|---|---|
| **Regular campaign** | Single newsletter / promo |
| **A/B test campaign** | 2 varianty (Business+) |
| **Automated email** | Email odeslaný z automation workflow |
| **RSS-to-email** | Auto-generated z RSS feedu |
| **Transactional** | Přes API/SMTP, ne UI |

### 6.2 Email Editor

#### Drag-and-drop editor (default)

- **Modules:** Text, image, button, heading, divider, spacer, video, social, HTML, RSS, conditional, product (e-commerce), survey, file
- **Predefined templates library** – stovky šablon
- **Industry templates** – e-commerce, B2B, healthcare, nonprofits, education
- **Custom HTML editor** (alternativa k drag-drop)
- **MJML support** (pod kapotou pro responsive)
- **Image library** – upload + integrace s Unsplash, Giphy
- **Brand kit** – uložené barvy, fonty, logo

#### Test send & preview

- Preview as specific contact
- Preview by device (desktop, mobile, tablet)
- Email client preview (Outlook, Gmail, Apple Mail, etc.)
- Inbox preview test (3rd party integration option)
- Send test email to multiple recipients

### 6.3 Personalization

- **Personalization tags / merge tags:** `{{ contact.FIRSTNAME }}`, `{{ contact.COMPANY }}`, etc.
- **Default fallback values** – per tag
- **Dynamic content blocks** (Business+) – condition-based bloky
- **AI content generation** (Aura) – subject lines, body copy, tone adjustment
- **Conditional content** – per segment

### 6.4 A/B Testing (Business+)

- Test variants: **subject line, sender name, content, CTAs**
- Split: 50/50 nebo custom %
- **Winning metric:** open rate, click rate
- Test period configurable
- **Auto winner send** – po určení vítěze se zbytek poslal vítěznou variantou

### 6.5 Send-time options

- **Send now** – okamžitě
- **Schedule** – konkrétní datum/čas
- **Send at best time** (Aura AI, Business+) – per-contact optimal delivery time
- **Time-zone send** – v lokálním čase recipient
- **Frequency cap** – nezasílat víc než X emailů per kontakt per period

### 6.6 Aura "Send at best time"

- AI-powered (since květen 2025)
- Analyzuje engagement data per contact
- Volíte den, Aura volí hodinu
- **Nedostupné při:** A/B test, dedicated IP warmup, anonymous email tracking
- **Doporučení:** nejlepší výsledky po několika campaign sends, aby Aura natrénovala

### 6.7 Subscription management

- **Subscription preference center** – Brevo-hosted page
- Contact může spravovat preferences per list
- **Multi-language preference center**
- **Unsubscribe** = global vs. per-list
- **One-click unsubscribe** (RFC 8058) – automaticky implementováno

---

## 7. Marketing Automation

Brevo má **dva paralelní editory**:
- **Classic editor** – legacy
- **New editor (BETA → GA 2026)** – moderní drag-drop canvas

Probíhá postupná migrace na new editor. Termíny jsou:
- **Entry points / Triggers** – classic vs. new
- **Conditions / Rules** – classic vs. new
- **Actions** – stejné napříč oběma

### 7.1 Workflow plán dostupnosti

| Tarif | Co lze |
|---|---|
| Free | Basic, **max 2 000 contacts** v active workflows |
| Starter | Bez full automation (jen základní auto-emails) |
| Business / Standard | **Plné Marketing Automation** – plný workflow editor |
| Professional | + Advanced features + AI |
| Enterprise | + Sub-org workflow sharing |

### 7.2 Triggers (Entry points) – plný výčet

**List & Contact-based:**
- **Contact added to list** – kontakt přidán do specific list
- **Contact removed from list**
- **Form submitted** – form ID specific
- **Contact attribute updated** – specific field changes
- **Subscription update** – subscribed/unsubscribed

**Behavioral (with tracker):**
- **Web page visited** – specific URL pattern
- **Web event** – custom JS-tracked event
- **Email opened** – specific campaign
- **Email clicked** – specific link
- **Email engagement** – aggregate engagement metric

**E-commerce events (s integrace):**
- **Abandoned cart** – cart not checked out in X time
- **Order placed**
- **Product viewed**
- **Specific product purchased**
- **Cart value > threshold**

**Time-based:**
- **Date-based** – e.g. birthday, anniversary, custom date attribute
- **Scheduled** – recurring (daily/weekly/monthly)

**SMS & WhatsApp events:**
- SMS reply received
- WhatsApp message received

**CRM activity (with Sales Platform):**
- Deal stage changed
- Task completed
- Meeting booked

**API/Manual:**
- **API trigger** – external system enrolls contact via API
- **Manual enrollment**

### 7.3 Actions

**Marketing:**
- **Send an email** (configurable per step)
- **Send an SMS**
- **Send a WhatsApp message**
- **Send a push notification** (web/mobile)

**Contact management:**
- **Add to list**
- **Remove from list**
- **Update contact attribute** – set hodnota
- **Increment/decrement** – numeric field
- **Add to blacklist**
- **Unsubscribe contact** – z marketing
- **Add tag** / Remove tag

**Workflow control:**
- **Wait** – fixed delay (minutes, hours, days)
- **Wait until event** – behavior-based wait
- **Wait until date** – specific calendar date
- **Conditional split** – if/else branching
- **Percentage split** – % distribution
- **Start another automation** – enroll do jiného workflow
- **Go to another step** – jump w/in workflow
- **End workflow**

**Sales (with Sales Platform):**
- **Create deal**
- **Update deal**
- **Assign deal owner**
- **Create task**
- **Update task**

**Notifications:**
- **Email notification** – pošle interní notifikaci
- **Slack notification** (via integration)

**Webhooks / API:**
- **Trigger webhook** – call external URL
- **Custom API call**

### 7.4 Rules / Conditions

- **If/else split** – až N podmínek
- **Has tag**
- **Is in list / segment**
- **Has attribute value**
- **Has engaged with email**
- **Has visited page**
- **Has purchased product**

### 7.5 Limity v automation

- **Start another automation** – max **15× per kontakt per 30 dní** (loop prevention)
- Contact se nedostane do paused/inactive workflow přes "Start another automation"
- Re-entry pravidla per workflow (configurable)

### 7.6 Pre-built templates

- Welcome series
- Abandoned cart recovery
- Birthday / Anniversary
- Re-engagement / Win-back
- Lead nurture
- Post-purchase upsell
- Event registration follow-up
- New product launch
- VIP customer rewards

### 7.7 Exit & restart conditions

- **Exit condition** – kontakt opustí workflow při splnění (e.g. converted)
- **Restart condition** – kontakt restartuje workflow od začátku
- Plně configurable per workflow

---

## 8. Forms, Landing Pages, Push

### 8.1 Forms

**Typy:**
- Embed form (HTML/JS code)
- Pop-up form (modal, slide-in, banner)
- Inline form (na landing page)
- Subscription form

**Features:**
- Drag-drop builder
- Field types: text, email, phone, dropdown, multi-select, radio, checkbox, date, hidden, GDPR consent
- **Conditional logic** – pole se zobrazují/skrývají dle voleb
- **CAPTCHA**
- **Auto-add to list** – per form
- **Auto-trigger welcome workflow**
- **Embed customization** – CSS overrides
- **Multi-language forms**

### 8.2 Landing Pages

- Drag-drop page builder
- **Templates library** per use case
- Custom domain support
- Mobile responsive
- A/B testing landing pages (Business+)
- **Form integration** – built-in
- **Page analytics** – conversion tracking
- **SEO basics** – meta tags, OG tags

Limity: 1 landing page on Business, vyšší tier = více.

### 8.3 Web Push Notifications

- Cross-browser podpora (Chrome, Firefox, Safari, Edge)
- **Trigger:** manuální campaign / automation action
- **Personalization** + scheduling
- **Geo-targeting**
- **Frequency caps**
- **Click tracking**

### 8.4 Mobile Push (s SDK)

- iOS & Android SDK
- Push token management
- Multi-channel campaigns (push + email + SMS)

---

## 9. Multichannel (SMS, WhatsApp, Push)

### 9.1 SMS

- **Worldwide reach** – 180+ countries
- **Pricing:** per-SMS credit, varies by country
- **Marketing SMS** – campaigns + automation
- **Transactional SMS** – přes API/SMTP-like service
- **Two-way messaging** (selected regions)
- **Inbound reply tracking**
- **TCPA compliance** (US) – opt-in flow

### 9.2 WhatsApp (Professional+)

- **WhatsApp Business API** integration
- **Templates** musí být schválené WhatsApp pre-send
- **Marketing messages** + **transactional**
- **Two-way conversations** in Conversations module
- **Media support** – images, video, documents
- **Click tracking**
- **GDPR consent** – explicit opt-in required

### 9.3 Web Push

- Web push subscription via service worker
- Trigger via campaign or automation
- Cross-browser

### 9.4 Mobile Push

- SDK pro iOS/Android
- Token storage v Brevo
- Personalization & segmentation

---

## 10. Transactional Email

**Brevo's heritage product** – Sendinblue started as a transactional ESP a stále je top-tier v této kategorii.

### 10.1 Email API

- **RESTful API** – JSON-based
- Endpoint: `https://api.brevo.com/v3/smtp/email`
- **Authentication:** API key (header `api-key`) nebo OAuth 2.0
- **Send modes:**
  - Static HTML/text content
  - Template ID + dynamic params
  - URL-based HTML content
- **Personalization variables** – pass via `params` object
- **Attachments** – up to 10MB total
- **Reply-to** customization
- **CC, BCC** support
- **Custom headers**

### 10.2 SMTP Relay

- **Brevo SMTP** – standardní SMTP server pro any client
- **Credentials:** SMTP login + API key
- **Plugins:** WordPress, WooCommerce, PrestaShop, Magento (drop-in)
- **Any CMS / email client** může konfigurovat (Outlook, Thunderbird)

### 10.3 Templates pro transactional

- Visual editor (same as marketing)
- **Template ID** referenceable v API
- **Test mode** s real contact data
- **Multi-language templates**

### 10.4 Webhooks

Real-time event notifications:
- **delivered**
- **opened**
- **clicked**
- **soft_bounce**
- **hard_bounce**
- **spam**
- **invalid**
- **deferred**
- **unique_opened**
- **complaint**
- **blocked**
- **proxy_open** (Apple MPP)

Webhook signature verification pro security.

### 10.5 Transactional reports

- **Logs:** every individual email send
- **Unlimited log retention** (standard volume; 24 months at very high volume)
- **Statistics:** opens, clicks, bounces, spam, blocked, deferred
- **Per-template stats**
- **Geo & device breakdown**

### 10.6 Rate limits

- **Free:** 300 emails/day, 1 000 req/sec
- **Paid:** no daily limit, 1 000–6 000 req/sec dle plánu
- **429 status** when exceeded

### 10.7 Why Brevo wins v transactional

- **Best-in-class deliverability** (99%+ inbox placement claim)
- **Free SMTP relay** included on all plans
- **Same platform** jako marketing → unified contact view
- **EU hosting** – GDPR-friendly bydlište data
- **Long log retention** (unlimited for normal volumes)

Konkurence: Postmark, Mailgun, SendGrid, AWS SES, Resend, Mailtrap.

---

## 11. Sales Platform (CRM)

Brevo's CRM, často underrated. Konkuruje Pipedrive a HubSpot Sales Hub.

### 11.1 CRM objekty

- **Contacts** – sdílené s Marketing Platform
- **Companies** – auto-asociace via email domain
- **Deals** – sales opportunities
- **Tasks** – per contact/deal/company
- **Activities** – calls, meetings, notes, emails

### 11.2 Pipelines

- **Multiple pipelines** (Pro+ Sales)
- **Custom stages** per pipeline
- **Probability per stage**
- **Deal value tracking**
- **Forecasting**
- **Kanban view**
- **List view**

### 11.3 Meetings

- **Booking page** (Calendly-like)
- **Real-time sync** s Google Workspace, Microsoft Outlook (2026+ feature)
- **Round-robin team booking**
- **Buffer times, working hours, lead time**
- **Custom questions** pre-meeting
- **Auto-create deal/contact** on booking
- **Activity auto-logging** v deal record

### 11.4 Activities

- **Call logging** – manual nebo přes Brevo Phone
- **Meeting notes**
- **Tasks** s due dates
- **Email tracking** (s Gmail/Outlook extension)
- **Sequences** – series of automated touchpoints (Pro+ Sales)

### 11.5 Reports & Forecasting

- **Deal pipeline reports**
- **Sales rep performance**
- **Win/loss analysis**
- **Forecasting** (Pro+ Sales)

### 11.6 Mobile App

- iOS + Android
- Launch/pause campaigns
- Reply to Conversations
- Manage CRM tasks
- View pipelines
- Log activities

---

## 12. Conversations

Live chat + unified inbox modul. Brevo's competitor k Intercom, Drift, Zendesk Chat.

### 12.1 Channels

- **Website live chat** (widget)
- **Email** (shared inbox)
- **Facebook Messenger**
- **Instagram DM**
- **WhatsApp**
- **SMS**

### 12.2 Features

- **Unified inbox** napříč kanály
- **Chatbots** – rule-based + AI-assisted
- **AI auto-replies** (Aura)
- **Agent routing** – round-robin, skill-based
- **Working hours** + off-hour responses
- **Internal notes** – team collaboration
- **Canned responses**
- **Conversation tags**
- **Conversation reports** – CSAT, response time, resolution
- **Mobile app** – respond from phone

### 12.3 Integrace s Marketing/Sales

- Conversation **automaticky linkuje na Contact record**
- Conversation **může triggrovat Marketing Automation** workflow
- **Create Deal** z conversation
- **Add to list** z conversation

---

## 13. Brevo Phone

Cloud telephony platform. Plně VoIP + integrace s Brevo CRM.

### 13.1 Features

- **Local numbers** ve 60+ zemích
- **Toll-free numbers**
- **Call routing** – IVR menus, queue, round-robin
- **Call recording** – cloud-stored
- **Voicemail** + transcription
- **Click-to-call** v CRM
- **Call analytics** – duration, outcome, recording
- **Mobile + desktop app**

### 13.2 Pricing

- Separate Phone subscription
- Per-user pricing
- Per-minute call credits
- Per-country pricing for outbound

### 13.3 Use case

- Sales teams making outbound calls
- Support teams handling inbound
- Auto-log to CRM = full call history per contact

---

## 14. Customer Data Platform (CDP)

Enterprise feature, launched 2024+.

### 14.1 Co dělá

- **Unified customer profile** napříč Brevo modules + external sources
- **Real-time ingestion** – events z web, app, CRM, ad platforms
- **Identity resolution** – stitching anonymous → known
- **Custom event tracking** – fully customizable schema
- **Audience builder** – cross-source segmentation
- **Sync out** – send audiences to ads platforms (Meta, Google, TikTok)

### 14.2 Integrace

- **Native:** all Brevo modules
- **Webhooks** – any external source
- **APIs** – import/export
- **Connectors** – BigQuery, Snowflake (Enterprise)

---

## 15. Loyalty & Wallet

Pro+ feature (2024+).

### 15.1 Loyalty Program

- **Points-based** systém
- **Tiers** (Bronze, Silver, Gold, etc.)
- **Earning rules** – per purchase, per referral, per review
- **Redemption** – discounts, products
- **Auto-generated loyalty program** with AI suggestions

### 15.2 Wallet

- **Mobile wallet passes** (Apple Wallet, Google Pay)
- **Coupons, gift cards, loyalty cards**
- **Push updates** na pass
- **Geo-targeted notifications**

---

## 16. Aura AI

Brevo's AI vrstva. Launched May 2025 (subject lines, content gen, send-time). Postupně rozšířena.

### 16.1 Aura features (per tier)

**Free / Starter / Business / Pro:**
- **Aura content generator** – subject lines, body copy, tone adjustment, summarization
- **AI translation** – emails in any language
- **AI image generator** (limited credits per tier)

**Business+:**
- **AI send time optimization** – per-contact best time
- **AI subject line testing** – predicts open rate

**Professional+:**
- **AI segmentation** – Aura suggests audience groups based on behavior
- **AI Data Analyst** – natural language data questions ("how did last campaign perform vs. average?")
- **Predictive lead scoring** (2026+)
- **AI product recommendations** v emailech

### 16.2 Aura AI Lab

- **€50M / 5-year investment** announced February 2025
- Dedicated AI research team
- Continuous feature ship-rate (monthly updates)

### 16.3 Co Aura NEMÁ (vs. konkurence)

- No autonomous agents jako HubSpot Breeze (yet)
- No AI workflow generation (yet)
- No AI per-contact predictive sending (jen send time)
- No AI split-testing automation paths

---

## 17. Contacts & Segmentation

### 17.1 Contact data model

| Atribut typu | Příklad |
|---|---|
| **Default attributes** | EMAIL, FIRSTNAME, LASTNAME, SMS, OPT_IN |
| **Custom attributes** | text, number, date, boolean, category, multiple choice |
| **Calculated attributes** | RFM score, CLV (Pro+) |
| **Transactional attributes** | order count, last purchase, total spent |
| **Behavioral data** | last email open, last page visit |
| **System data** | created_at, source, IP, browser, language |

### 17.2 Lists

- **Multiple lists per account**
- Contact lze v multiple lists současně
- **List import** – CSV, API, integrations
- **Import validation** – Brevo kontroluje formát + označuje problematic emails

### 17.3 Segments

- **Dynamic segments** – auto-update based on conditions
- **Static segments** – snapshot
- **Filter criteria:**
  - Contact attribute
  - List membership
  - Email engagement (opened/clicked specific campaign)
  - Web behavior (visited page, custom event)
  - E-commerce data (order count, total spent, product purchased)
  - Date-based
  - Source/origin
- **Unlimited segments** na všech plánech
- **Cross-list segments** – contacts napříč lists

### 17.4 Contact Scoring (Pro+)

**Score types:**
- **Recency** – jak nedávno engaged
- **Frequency** – jak často engaged
- **Monetary** – kolik utratil (s e-commerce sync)
- **Purchase Timing Deviation** – odchylka od typického purchase pattern
- **Custom scoring rules** – per attribute, per event

**Použití:**
- Workflow triggers based on score threshold
- Segment definition
- Sales prioritization

### 17.5 Tags

- **Flat tag system** – plně customizable
- Add via: manual, automation action, import, API
- Use jako trigger or segment filter

### 17.6 Blacklist

- Suppress emails per contact
- Auto-add hard bounces
- API endpoint pro programmatic blacklist

---

## 18. Reports

### 18.1 Email campaign reports

- **Sent, Delivered, Bounced (hard/soft)**
- **Opens** (unique + total), Open rate
- **Clicks**, CTR, top links clicked
- **Click map** – heatmap nad emailem
- **Subscriber activity** – per-contact timeline
- **Unsubscribes, Complaints**
- **Geo distribution**
- **Device & email client breakdown**
- **24h performance chart**

### 18.2 Marketing Automation reports

- Per-workflow stats: enrolled, in progress, completed, exited
- Per-step stats: passing rate, time spent
- **Conversion goal tracking**
- **Revenue attribution** (with e-commerce sync)

### 18.3 Transactional reports

- **Logs** – every email s status
- **Aggregated stats** – similar to campaign
- **Webhook delivery logs**
- **API request logs**

### 18.4 SMS, WhatsApp, Push reports

- Sent, delivered, clicked
- Reply tracking (SMS, WhatsApp)
- Cost tracking per send

### 18.5 Aggregate reports

- **Account overview**
- **List growth**
- **Top-performing campaigns**
- **Industry benchmarks**

### 18.6 Custom dashboards & AI Data Analyst (Pro+)

- **AI Data Analyst** – ptáte se v natural language: "What's my email engagement vs. last quarter?"
- **Custom reports** – build with metric/dimension picker
- **Looker-powered** (Brevo uses Looker pod kapotou pro analytics)
- **Scheduled reports** – email delivery
- **Export** – CSV, PDF

---

## 19. Deliverability

### 19.1 Infrastruktura

- **EU-hosted servers** (Paris, Frankfurt)
- **Shared IPs** – multi-tier reputation
- **Dedicated IPs** (Pro+, Enterprise) – managed warmup
- **Sender Reputation** monitoring – real-time
- **ISP feedback loops** (FBLs) – integrated

### 19.2 Authentication

| Protokol | Brevo setup |
|---|---|
| **SPF** | Add `include:spf.brevo.com` to your domain SPF record (recommended) |
| **DKIM** | TXT record on subdomain (`mail._domainkey.yourdomain.com`) |
| **DMARC** | TXT on _dmarc, start p=none → p=quarantine → p=reject |
| **BIMI** | Po splnění DMARC reject + verified logo |
| **Automatic configuration** | UI nudges + step-by-step DNS instructions |
| **Brevo Authenticator** (2026+) | Auto-DNS configuration via integration partners |

### 19.3 Sender verification

- **Email verification** – sender email confirmed via click
- **Domain verification** – DNS record check
- **Required pro production** – nelze sednout production bez verified domain
- **Multi-sender** – verify multiple senders per account

### 19.4 List hygiene

- **Hard bounce auto-clean** – removes from sends
- **Soft bounce** – retries, eventually removes
- **Spam complaint** – auto-unsubscribe
- **Email validation API** (paid add-on) – pre-send verification
- **Suppression list** – manual management

### 19.5 Deliverability features

- **99%+ inbox placement** claim (across Gmail, Outlook, Yahoo)
- **Optimized shared IPs** – multi-tier reputation
- **Sender warmup** – automatic gradual volume ramp pro new senders
- **Dedicated IP option** – Pro+ ($custom add-on)
- **Inbox placement reports** – Brevo Tracker

### 19.6 Compliance s Gmail/Yahoo 2024+

- **Authentication required** (DKIM + DMARC)
- **One-click unsubscribe** (RFC 8058) – automatic
- **Spam complaint < 0.3 %** – Brevo monitors
- **Functional unsubscribe** – immediate processing

### 19.7 EU hosting advantage

- Data stored v EU (Paris, Frankfurt)
- **GDPR by design**
- No US data residency by default (option pro Enterprise)
- Better latency for EU customers

---

## 20. API, Integrace

### 20.1 API v3

- Base URL: `https://api.brevo.com/v3/`
- **Authentication:** API key header (`api-key`) nebo OAuth 2.0
- **JSON request/response**
- **Rate limits:** 1 000–6 000 req/sec dle planu

### 20.2 Hlavní API endpoints

| Resource | Operace |
|---|---|
| `/contacts` | CRUD contacts, attributes, lists |
| `/contacts/lists` | List management |
| `/contacts/folders` | Folder organization |
| `/contacts/segments` | Read segments |
| `/contacts/import` | Bulk import (async) |
| `/contacts/export` | Bulk export |
| `/emailCampaigns` | Create, send, schedule campaigns |
| `/transactionalEmails` | Send transactional |
| `/transactionalSMS/sms` | Send transactional SMS |
| `/smtp/email` | Transactional via API |
| `/smtp/templates` | Template management |
| `/process` | Bulk operations status |
| `/account` | Account info, plan, limits |
| `/webhooks` | Webhook subscriptions |
| `/senders` | Sender management |
| `/domains` | Domain auth status |
| `/automation` | Workflow management |
| `/companies` | Companies (CRM) |
| `/deals` | Deals (CRM) |
| `/tasks` | Tasks (CRM) |
| `/conversations` | Conversation management |
| `/whatsappCampaigns` | WhatsApp campaigns |

### 20.3 Webhooks

- **Marketing events** – open, click, unsubscribe, bounce
- **Transactional events** – all 12+ event types
- **Inbound events** – inbound email parsing
- **Contact lifecycle** – created, updated, deleted
- **CRM events** – deal created, stage changed

Webhook signature verification.

### 20.4 SDKs (oficiální)

- **Node.js**
- **Python**
- **PHP**
- **Ruby**
- **Java**
- **C#/.NET**
- **Go**

### 20.5 Plugins

- **WordPress** (Brevo for WordPress)
- **WooCommerce** (deep integration)
- **PrestaShop**
- **Magento / Adobe Commerce**
- **Shopify**
- **WixStores**
- **Squarespace**
- **OpenCart**
- **Drupal**

### 20.6 Native integrace

200+ aplikací včetně:
- **CRM:** Salesforce, Pipedrive, HubSpot
- **E-commerce:** Shopify, WooCommerce, Magento, BigCommerce
- **Booking:** Calendly
- **Forms:** Typeform, Jotform
- **Productivity:** Slack, Zapier, Make
- **Analytics:** Google Analytics, Mixpanel
- **Ads:** Meta, Google Ads
- **Webinar:** Zoom, GoToWebinar
- **Accounting:** QuickBooks, Stripe
- **Helpdesk:** Zendesk
- **And more**

### 20.7 iPaaS

- **Zapier** – 200+ pre-built zaps
- **Make (Integromat)**
- **Workato**
- **n8n** (self-hosted option)

---

## 21. Compliance, GDPR, EU hosting

### 21.1 EU hosting

- Primary data centers v **Paříž (FR)** a **Frankfurt (DE)**
- **GDPR by design** – EU-based company
- **Default EU data residency**
- **No US data transfer** unless explicitly configured

### 21.2 GDPR features

- **GDPR-friendly forms** – explicit consent checkboxes
- **Subscription type management** – granular opt-in
- **Right to be forgotten:**
  - UI: Contact → Delete permanently
  - API: `DELETE /contacts/{email}`
  - Adds to permanent suppression list
- **Data export** – per-contact JSON export
- **DPA** – sign electronically
- **Sub-processor list** – publicly available
- **Privacy policy generator** (helpful tool)

### 21.3 Consent tracking

- **Opt-in source** – per contact
- **Opt-in IP + timestamp** – audit trail
- **Double opt-in** – optional, recommended for GDPR
- **Consent string** – stored per subscription type

### 21.4 Certifications

- **ISO 27001**
- **ISO 27018** (cloud personal data)
- **SOC 2 Type II**
- **HIPAA** (Pro+ optional, US healthcare)
- **PCI DSS** (for payment processing in Loyalty & Wallet)

### 21.5 Security features

- **2FA** (TOTP, SMS)
- **SSO/SAML** (Enterprise)
- **IP whitelist** for API access (Enterprise)
- **Audit logs** (Enterprise)
- **Encryption at rest + in transit**
- **Role-based access** (RBAC)

---

## 22. Limity a nedostatky

### 22.1 Funkční limity

- **Automation depth** – plně, ale ne tak hluboko jako ActiveCampaign
- **No split-testing automation paths** (jen per-email A/B)
- **No per-contact predictive sending** (jen send time)
- **No AI-generated workflows** (Aura nemá yet)
- **Workflow templates limited** vs. HubSpot

### 22.2 User management

- **No custom roles** mimo Enterprise
- **3 role tiers default** (Owner, Manager, Restricted User) – fixed na neEnterprise tarifech
- **Granular permission toggles** jen Business+
- **No SCIM** pro automated provisioning
- **No suspend state** – jen revoke access
- **No inactive-user reporting**

### 22.3 UI/UX

- **No Czech/Slovak/Polish UI** – jen 10–11 jazyků (EN, FR, DE, IT, ES, PT, NL + další)
- **Two parallel editors** (classic + new automation) – matoucí během migrace
- **Sub-account management** – jen Enterprise

### 22.4 Limity v reportingu

- **Looker-based dashboards** vyžadují learning curve
- **Cross-campaign comparative reporting** méně sofistikované než HubSpot

### 22.5 Multichannel limity

- **WhatsApp jen Pro+**
- **SMS credits** samostatně se kupují – per země pricing
- **Push notifications** – základní, ne tak pokročilé jako OneSignal

### 22.6 Sales Platform limity

- **Less feature-dense než Salesforce** nebo HubSpot Sales Hub
- **No advanced sales territory management**
- **No complex sales playbooks** (only basic sequences)
- **Forecasting** méně sofistikované

### 22.7 Migration

- **No native automation import/export** v běžně použitelném formátu
- **Templates export** jen jako HTML
- **Custom attributes export** přes API

### 22.8 Pricing pitfalls

- **Logo removal** je add-on na Free/Starter
- **Sales seats** se přidávají per user (může se nakupit)
- **Phone support** jen Pro+
- **Phone product** je úplně separate pricing
- **Email volume overage** se účtuje at higher rates

---

## 23. Shrnutí: Pro koho a proti komu

### Brevo je dobrá volba pokud
- Máte **velkou kontaktní databázi** + moderate send frequency (perfect fit)
- Potřebujete **email + SMS + WhatsApp + transactional** v jednom systému
- **GDPR-first approach** je důležitý (EU hosting)
- Hledáte **transactional email** s top-tier deliverability za rozumnou cenu
- Chcete **all-in-one** (marketing + CRM + chat + phone) za frakci ceny HubSpotu
- Cíl je **multichannel automation** s rozumnou ceninou
- Máte **e-commerce store** a chcete unified data view
- **Bootstrappujete** nebo jste startup s tight budget

### Brevo není dobrá volba pokud
- Potřebujete **enterprise-grade B2B CRM** (HubSpot/Salesforce lepší)
- Vyžadujete **deep automation logic** s split-testing paths (ActiveCampaign deeper)
- Posíláte **velmi často** malému listu (Mailchimp/MailerLite levnější)
- Pracujete primárně v **češtině/slovenštině/polštině** – UI nepodporuje
- Hledáte **most polished UI** v kategorii (Mailchimp / HubSpot dále)
- Vyžadujete **advanced sales territory management** + complex playbooks
- Potřebujete **autonomní AI agents** (HubSpot Breeze dále)
- **High-frequency Shopify e-commerce** s heavy product recommendations (Klaviyo silnější)

### Brevo vs. konkurence (matice)

| Konkurence | Kdy lepší než Brevo |
|---|---|
| **Mailchimp** | Brand recognition; ad-hoc malé sends; polished UI |
| **HubSpot** | Enterprise B2B; deep CRM; account-based marketing; multi-Hub vision |
| **ActiveCampaign** | Deep automation logic, split-test paths |
| **Klaviyo** | Shopify-native e-commerce, AI product recommendations |
| **Postmark / Mailgun** | Pure transactional focus, more developer features |
| **MailerLite** | Cheaper for small lists |
| **Salesforce Pardot** | Enterprise s existing SF investment |

---

*Dokument zpracován z oficiálních zdrojů help.brevo.com, developers.brevo.com, brevo.com/pricing a renomovaných analytických webů (Venture Harbour, EmailToolTester, Sender, SalesHive, Stitchflow, Marketing Automation Insider, That Marketing Buddy, Authencio). Pro nejaktuálnější ceny vždy ověřit na brevo.com/pricing.*
