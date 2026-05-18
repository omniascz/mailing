# SmartEmailing – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v SmartEmailing prochází data, lidé a akce – od Account Ownera přes specializované uživatele, integrace s Shoptetem a dalšími platformami, až po koncového subscribera.

> Tento dokument doplňuje `21_SmartEmailing_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** SmartEmailing umí, tento popisuje, **kdo s tím interaguje a jak data tečou**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
> - **Český produkt z Brna (založeno 2009)** – 16+ let v industry
> - **#1 nebo top 2 na CZ trhu** (vedle Ecomailu)
> - **Native česká + slovenská UI + phone support**
> - **GDPR evidence built-in** – auto-tracking source, purpose, validity per kontakt
> - **CZ/SK calendar** s jmeniny + Czech grammar (5. pád)
> - **Self-positioning: leader v CZ deliverabilitě**
> - **B2B + B2C širší pokrytí** než Ecomail
> - **Deep Shoptet integrace** (CZ e-shop platform)
> - **SmartSelling parent ekosystém** (info-business, online courses)
> - **14-day free trial** (žádný free plan jako Ecomail)
> - **Pricing v CZK + EUR** (od ~€7.60/měsíc)

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Sign-up & trial flow](#2-signup-flow)
3. [Onboarding flow](#3-onboarding-flow)
4. [User roles & permissions](#4-user-roles)
5. [Account Owner flow](#5-account-owner-flow)
6. [Admin user flow](#6-admin-user-flow)
7. [Marketing user flow](#7-marketing-user-flow)
8. [Subscriber lifecycle](#8-subscriber-lifecycle)
9. [Email lifecycle](#9-email-lifecycle)
10. [Automation execution model](#10-automation-execution)
11. [GDPR evidence flow](#11-gdpr-evidence-flow)
12. [Czech personalization flow (jmeniny, pádování)](#12-czech-personalization-flow)
13. [Forms & Pop-ups flow](#13-forms-flow)
14. [Shoptet integration flow (deep)](#14-shoptet-flow)
15. [Other e-commerce flow (Shopify, WooCommerce, PrestaShop)](#15-other-ecommerce)
16. [SMS flow](#16-sms-flow)
17. [Transactional email flow](#17-transactional-flow)
18. [API & Integration flow (Make, Zapier)](#18-integration-flow)
19. [Deliverability flow](#19-deliverability-flow)
20. [Compliance flow](#20-compliance-flow)
21. [Datová mapa: co vidí kdo](#21-datová-mapa)
22. [Známé úzkoprofilové místa](#22-úzkoprofilové-místa)

---

## 1. Mapa aktérů

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│         SMARTEMAILING PLATFORM ECOSYSTEM                           │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [SmartEmailing Internal Team (Brno)]                              │
│   ├─ Customer Support (Czech + Slovak native, English)             │
│   ├─ Phone support (CZ + SK)                                       │
│   ├─ Technical Support                                             │
│   ├─ Migration assistance                                          │
│   ├─ Deliverability team (claimed CZ leader)                       │
│   ├─ Sales (CZ + SK + EU expansion)                                │
│   ├─ SmartSelling parent team (broader ecosystem)                  │
│   └─ Account / billing team                                        │
│           │ (free support pro all users, fast Czech response)      │
│           ▼                                                        │
│                                                                    │
│   ┌──────────────────────────────────────────┐                     │
│   │   SmartEmailing Account                  │                     │
│   │                                          │                     │
│   │   User roles (typically):                │                     │
│   │   ├─ Account Owner (1, založeno při      │                     │
│   │   │   signup)                            │◄── full access     │
│   │   ├─ Administrator                       │◄── full operational │
│   │   ├─ Marketing user                      │◄── marketing tasks  │
│   │   ├─ Designer / Editor                   │◄── content only     │
│   │   └─ Read-only / Viewer                  │◄── reports only     │
│   │                                          │                     │
│   │   User seats limits per plan:            │                     │
│   │   - Standard: 1-3 users                  │                     │
│   │   - Higher tiers: more users             │                     │
│   │   - Enterprise: per agreement            │                     │
│   └──────────────┬───────────────────────────┘                     │
│                  │                                                 │
│                  ▼                                                 │
│   [Subscribers / Contacts]                                         │
│       │                                                            │
│       ├─→ marketing emails (campaigns + automations)               │
│       ├─→ SMS messages                                             │
│       ├─→ transactional emails                                     │
│       ├─→ form submissions                                         │
│       ├─→ jmeniny / birthday personalized communications           │
│       └─→ preference management                                    │
│                  │                                                 │
│                  ▼                                                 │
│   [Integrations]                                                   │
│   ┌──────────────────────────────────────────┐                     │
│   │   CZ-specific:                           │                     │
│   │   - Shoptet (DOMINANT CZ E-SHOP, deep)   │                     │
│   │   - Luigi's Box (CZ search)              │                     │
│   │   - Zenamu (CZ)                          │                     │
│   │                                          │                     │
│   │   Global e-commerce:                     │                     │
│   │   - PrestaShop (native plugin)           │                     │
│   │   - Shopify (API/Make)                   │                     │
│   │   - WooCommerce (WP plugin)              │                     │
│   │   - Magento (via API/Make)               │                     │
│   │                                          │                     │
│   │   CMS / Productivity:                    │                     │
│   │   - WordPress (plugin)                   │                     │
│   │   - Make (Integromat) - deep             │                     │
│   │   - Zapier (5 000+ apps)                 │                     │
│   │                                          │                     │
│   │   Validation:                            │                     │
│   │   - Emailable                            │                     │
│   │                                          │                     │
│   │   API + Webhooks for custom needs        │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
│   [SmartSelling parent ekosystém]                                  │
│   ├─ MioWeb (websites for info-business)                           │
│   ├─ SmartSelling kurzy (courses platform)                         │
│   └─ Cross-pollination s SmartEmailing customers                   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér | Vstupní bod | Co dělá | Co vidí |
|---|---|---|---|
| **Account Owner** | Sign-up (account creator) | Full + billing + close account | Vše |
| **Administrator** | Pozvánka od Owner | Operational + user mgmt | Vše krom Owner exclusive |
| **Marketing user** | Pozvánka | Daily marketing | Per role permissions |
| **Designer / Editor** | Pozvánka s custom role | Content + templates | Per role |
| **Viewer / Read-only** | Pozvánka | View reports | Per role |
| **Custom role users** | Pozvánka | Per permissions | Per role |
| **Subscriber / Contact** | Form, integration | Receives emails, browses | Své emaily |
| **API Client** | API key | Per scope | Per scope |
| **Shoptet integration** | Plugin install | Sync data | Per integration scope |
| **Shopify / WooCommerce** | API / plugin | Sync data | Per integration scope |
| **PrestaShop integration** | Plugin | Sync data | Per integration scope |
| **Make / Zapier** | OAuth | Workflow automation | Per integration scope |
| **Luigi's Box** | API integration | Product search/recommendations | Per scope |
| **SmartEmailing Staff** | Interní | Support, debug | Limited |

---

## 2. Sign-up & trial flow

### 2.1 Free trial signup

```
Visit smartemailing.cz
   ↓
"Vyzkoušet zdarma" / "Free trial" button
   ↓
Email + basic info form
   ↓
**No credit card required**
   ↓
Email verification
   ↓
Account created:
- **14-day full feature trial**
- All features unlocked
- Czech support active immediately
- Phone support available
   ↓
First login s wizard
```

### 2.2 Onboarding wizard

```
First login:
   ↓
Welcome dialog s Czech onboarding:
- Co je váš primární use case?
  - E-commerce newsletters
  - B2B komunikace
  - Online courses / info-business
  - Non-profit
  - Government / public sector
  - Jiné
- Velikost firmy
- Existing tool (migrating from?)
- E-commerce platform (Shoptet first!)
   ↓
Setup recommendations:
- Suggested integrace (Shoptet first pro CZ)
- Suggested templates
- Pre-prepared automation scenarios
   ↓
Optional: Schedule onboarding call (Czech)
```

### 2.3 Trial expiration

```
14-day trial ending:
- Email notifications 3 days, 1 day before
   ↓
Options:
A) Upgrade to paid (continue seamlessly)
B) Cancel (data retained for retention period)
   ↓
**No free plan** (unlike Ecomail's 40K contacts free plan)
- Must commit to paid to continue
```

### 2.4 Trial features

- Full feature access
- Send campaigns (within trial limits)
- Build automations
- Test SMS module
- All integrations available
- Limited send volume during trial

---

## 3. Onboarding flow

### 3.1 First-time setup

```
Day 1:
- Email verification
- Sender details setup (from name, email)
- Domain authentication (DKIM, SPF, DMARC)
- Brand setup (colors, logo, fonts)
- Czech / Slovak language preference

Day 2-3:
- E-commerce integration (Shoptet primary, or others)
- Initial contact import (with GDPR consent verification!)
- First list / segment creation
- First form / popup

Day 4-7:
- First campaign send
- First automation (welcome series from pre-prepared scenarios)
- Tracking script install
- SMS module setup (if applicable)

Day 7-14:
- Trial expires - choose plan
- Add team users (if applicable)
- Pre-prepared scenarios activation (additional)
- Reports configuration
- GDPR evidence audit
```

### 3.2 Czech-specific onboarding

```
For CZ businesses:
- Verify doména.cz / .sk
- Configure CZK billing
- Faktura setup (CZ invoicing)
- DPH compliance
- ÚOOÚ-compliant settings
   ↓
Czech onboarding call available (free)
Phone support: +420 ... (Czech business hours)
```

### 3.3 Shoptet onboarding (if applicable)

```
Most CZ e-shops use Shoptet
   ↓
Shoptet Doplňky → Install SmartEmailing
   ↓
One-click OAuth
   ↓
Configure:
- Default list for new customers
- Sync historical data
- Field mapping
- Tag rules (e.g. "Source: Shoptet")
   ↓
Product feed URL auto-detected!
   ↓
Forms embed code provided pro Shoptet template
   ↓
Initial sync (hours for large stores):
- Customers, orders, products
   ↓
[Integration live, real-time sync]
```

### 3.4 Migration from competitors

```
SmartEmailing migration support:
- From Mailchimp (most common)
- From Ecomail (CZ alternative)
- From SendinBlue / Brevo
- From MailerLite
- Custom platforms
   ↓
Migration steps:
- Subscribers export → SmartEmailing import (with GDPR consent verification!)
- Field mapping
- Templates recreation
- Automations recreation
- Integrations reconnection
   ↓
Czech migration team assistance available
```

---

## 4. User roles & permissions

### 4.1 Default roles (typical for SmartEmailing)

⚠️ **SmartEmailing role naming** specifically not always publicly documented – typical structure pro CZ platforms:

#### A) Account Owner
- **Highest tier** access
- **Vytvořen při signup** (account creator)
- Cannot be deleted directly
- Manages billing
- Closes account
- Manages all settings + users

#### B) Administrator
- **Full operational** access
- User management
- Integration management
- Cannot close account
- Cannot transfer ownership

#### C) Marketing user
- **Daily marketing** tasks
- Campaigns + automations + segments
- View contacts, edit
- No billing access
- No user management

#### D) Designer / Editor
- **Content focused**
- Templates + design
- Limited contact data access
- No send permissions typically

#### E) Read-only / Viewer
- **View reports** only
- No editing
- For stakeholders, executives

#### F) Custom roles
- Per business needs (higher tier feature)

### 4.2 Permission categories (typical)

#### Account & Settings
- Account info
- Billing access
- User management
- Integration management
- Domain settings
- API key management

#### Contacts
- View contacts
- Edit contacts
- Import contacts
- Export contacts
- Delete contacts
- GDPR evidence view

#### Lists
- View lists
- Create/edit lists

#### Segments
- View segments
- Create/edit segments

#### Campaigns
- View campaigns
- Create / edit
- Send campaigns

#### Automations
- View automations
- Create / edit
- Activate / deactivate

#### Templates
- View templates
- Create / edit

#### Forms / Pop-ups
- View forms
- Create / edit
- Publish

#### SMS
- Send SMS
- Manage credits

#### Reports
- View reports
- Export reports

#### Integrations
- View integrations
- Manage integrations

### 4.3 Permission matrix (typical default)

| Akce | Owner | Admin | Marketing | Designer | Viewer | Custom |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Account & Billing** |  |  |  |  |  |  |
| Close account | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage billing | ✅ | ❌ | ❌ | ❌ | ❌ | per role |
| Account settings | ✅ | ✅ | ❌ | ❌ | ❌ | per role |
| **User Management** |  |  |  |  |  |  |
| Add/edit/delete users | ✅ | ✅ | ❌ | ❌ | ❌ | per role |
| **Contacts** |  |  |  |  |  |  |
| View contacts | ✅ | ✅ | ✅ | limited | view | per role |
| Edit contacts | ✅ | ✅ | ✅ | ❌ | ❌ | per role |
| Import contacts | ✅ | ✅ | ✅ | ❌ | ❌ | per role |
| Export contacts | ✅ | ✅ | per role | ❌ | ❌ | per role |
| GDPR evidence view | ✅ | ✅ | ✅ | view | view | per role |
| **Lists / Segments** |  |  |  |  |  |  |
| Manage lists | ✅ | ✅ | ✅ | ❌ | view | per role |
| Create segments | ✅ | ✅ | ✅ | ❌ | view | per role |
| **Campaigns** |  |  |  |  |  |  |
| Create / edit | ✅ | ✅ | ✅ | ✅ | view | per role |
| Send | ✅ | ✅ | ✅ | ❌ | ❌ | per role |
| **Automations** |  |  |  |  |  |  |
| Create / edit | ✅ | ✅ | ✅ | ❌ | view | per role |
| Activate | ✅ | ✅ | ✅ | ❌ | ❌ | per role |
| **Templates** |  |  |  |  |  |  |
| Create / edit | ✅ | ✅ | ✅ | ✅ | view | per role |
| **Forms / Pop-ups** |  |  |  |  |  |  |
| Create / edit | ✅ | ✅ | ✅ | ✅ | view | per role |
| Publish | ✅ | ✅ | ✅ | per role | ❌ | per role |
| **SMS** |  |  |  |  |  |  |
| Send SMS | ✅ | ✅ | ✅ | ❌ | ❌ | per role |
| Manage credits | ✅ | ✅ | ❌ | ❌ | ❌ | per role |
| **Transactional** |  |  |  |  |  |  |
| API access | ✅ | ✅ | per role | ❌ | ❌ | per role |
| **Reports** |  |  |  |  |  |  |
| View | ✅ | ✅ | ✅ | view | ✅ | per role |
| Export | ✅ | ✅ | per role | ❌ | per role | per role |
| **Integrations** |  |  |  |  |  |  |
| Manage | ✅ | ✅ | per role | ❌ | ❌ | per role |
| **API** |  |  |  |  |  |  |
| Manage API keys | ✅ | ✅ | ❌ | ❌ | ❌ | per role |
| **Domains** |  |  |  |  |  |  |
| Domain authentication | ✅ | ✅ | ❌ | ❌ | ❌ | per role |

### 4.4 User invitation flow

```
Owner/Admin: Nastavení → Uživatelé
   ↓
+ Přidat uživatele
   ↓
Email + Personal details
   ↓
Role selection:
- Default role (Admin, Marketing, Designer, Viewer)
- OR Custom role
   ↓
Send invitation
   ↓
User receives email v češtině
   ↓
User clicks activation link
   ↓
Sets password
   ↓
[Active user]
```

### 4.5 Limits per plan

- **User seats vary per plan**
- **Standard plans:** 1-3 users typically
- **Higher tiers:** more users
- **Enterprise:** custom

### 4.6 No SSO/SAML

- **No SSO/SAML** typically (vs. enterprise platforms)
- **No SCIM provisioning**
- **2FA available** (TOTP)
- **Standard email/password** authentication

---

## 5. Account Owner flow

### 5.1 Account Owner responsibilities

```
Account Owner = highest tier
   ↓
Setup at account creation (sign-up)
   ↓
Manages:
- Billing + payment
- Plan changes
- User management (incl. delete)
- Account settings
- Domain settings
- Integration access
- Compliance settings
- Close account option
```

### 5.2 Daily Owner workflow

```
Login → Dashboard
   ↓
Account overview:
- Today's campaign performance
- Active automation count
- Total subscribers vs. plan limit
- Recent form submissions
- Integration health
- Failed sends / bounces alerts
- GDPR evidence summary
   ↓
Strategic activities:
- Plan tier vs. growth
- Add-on usage (SMS credits)
- Team performance audit
- ROI tracking
- Deliverability monitoring
```

### 5.3 Billing management

```
Owner: Nastavení → Tarif / Fakturace
   ↓
View:
- Current plan + tier
- Subscriber count vs. limit
- Email sends vs. limit (monthly)
- Next billing date
- Payment method
- Invoice history (CZ faktura)
- Add-ons (SMS credits)
   ↓
Actions:
- Change plan (upgrade/downgrade)
- Update payment method
- Download CZ faktura
- Billing frequency (monthly/annual)
- DPH adjustments
- CZK / EUR pricing
```

### 5.4 Close account

```
Owner: Nastavení → Zrušit účet
   ↓
Confirmation flow:
- Reasoning survey (optional)
- Confirm cancellation
   ↓
**Final notification email**
   ↓
Account scheduled for cancellation (end of billing period)
   ↓
Data retention period (per GDPR)
   ↓
Final deletion
```

### 5.5 Ownership transfer

```
NOT explicit self-service workflow:
   ↓
Methods:
A) Add another user as Admin → transfer responsibilities
B) Contact SmartEmailing support for formal transfer
   ↓
Support assists s ownership change
- Czech support phone call
- Identity verification
- Backend processing
```

---

## 6. Admin user flow

### 6.1 Daily Admin workflow

```
Login → Dashboard (full access)
   ↓
Operational checks:
- Yesterday's campaign metrics
- Active automation health
- Failed automations
- Bounce rates
- Spam complaint rates
- Integration sync status
- User management requests
   ↓
Actions:
- User management (invite, edit, deactivate)
- Custom role management
- Integration management
- API key management
- Domain settings
- GDPR evidence audits
```

### 6.2 User management

```
Admin: Nastavení → Uživatelé
   ↓
+ Přidat uživatele
   ↓
Configure:
- Email
- Role
- Personal info
   ↓
Send invitation
   ↓
[New user activates]
```

### 6.3 Integration management

```
Admin: Integrace → Vše
   ↓
Active integrations list
   ↓
Per integration:
- Status check
- Configuration edit
- Re-authorize
- Logs review
- Disable / Remove
   ↓
Add new integration:
- Shoptet (one-click)
- PrestaShop (plugin)
- WordPress
- Shopify (via Make)
- Make / Zapier (deep)
- Configure mapping
- Test sync
- Activate
```

### 6.4 API key management

```
Admin: Nastavení → API
   ↓
Generate new API key
   ↓
Name + scope
   ↓
**Key displayed** – copy + secure
   ↓
[API key active]
```

### 6.5 Domain authentication

```
Admin: Nastavení → Domény
   ↓
Add sending domain
   ↓
SmartEmailing provides DNS records:
- DKIM CNAME
- SPF include
- DMARC TXT (recommended)
   ↓
Add to DNS provider
   ↓
SmartEmailing validates
   ↓
[Authenticated]
```

---

## 7. Marketing user flow

### 7.1 Daily Marketing workflow

```
Login → Dashboard
   ↓
Activities:
- Build segments
- Create / send campaigns
- Build / monitor automations
- Manage forms + popups
- Update templates
- Review reports
- Deploy pre-prepared scenarios
```

### 7.2 Create campaign

```
Kampaně → Nová kampaň
   ↓
Step 1: Setup
- Název kampaně (interní)
- Předmět emailu
- Preheader
- Odesílatel (verified email)
- Reply-to
- UTM parameters
   ↓
Step 2: Příjemci
- Lists / segments selection
- Exclude lists
   ↓
Step 3: Šablona
- Drag-drop editor
- Template library
- Custom HTML option
   ↓
Step 4: Personalizace
- Insert tokens [JMÉNO], [PŘÍJMENÍ], custom fields
- Czech case forms auto (5. pád)
- Dynamic content blocks
   ↓
Step 5: Test
- Preview (desktop, mobile)
- Send test
   ↓
Step 6: Odeslat / Naplánovat
- Odeslat ihned
- Naplánovat datum/čas
- Time-zone send
   ↓
Confirm
```

### 7.3 Build automation

```
Automatizace → Nová automatizace
   ↓
A) From scratch
B) Use pre-prepared scenario template
   ↓
A) From scratch:
   - Choose trigger:
     - Subscribed to list
     - Tag added
     - Form submitted
     - Custom field updated
     - Order placed (e-commerce)
     - Cart abandoned (Shoptet etc.)
     - Birthday / Jmeniny (CZ unique!)
     - Custom date
   ↓
   - Build canvas:
     - Drag nodes:
       - Send email
       - Send SMS
       - Wait
       - Condition (if/else)
       - Update field
       - Add/remove tag
       - Add/remove from list
       - Goal
       - Webhook
   ↓
   - Configure each node
   ↓
   - Test mode
   ↓
   - Activate

B) Pre-prepared scenario:
   - Browse scenarios library
   - Choose template:
     - Welcome series
     - Abandoned cart
     - Birthday automation
     - Jmeniny automation (CZ unique!)
     - Post-purchase
     - Reactivation
   - Customize content + timing
   - Test
   - Activate
```

### 7.4 Czech-specific: Jmeniny automation

**UNIQUE feature for CZ/SK SmartEmailing:**

```
Trigger: Today is contact's name day (CZ/SK calendar)
   ↓
SmartEmailing checks daily:
- For each active contact
- Match name to CZ/SK calendar
- If match today → trigger workflow
   ↓
Send Email: "Šťastné jmeniny, [JMÉNO V 5. PÁDU]!"
- Auto vocative case: "Petře" not "Petr"
- Auto gender detection
- Personalized congratulation
- Special offer (e.g. 10% discount)
   ↓
Wait 3 days
   ↓
Condition: Used the offer?
   YES → Tag "Jmeniny: 2026 Used"
   NO → Send reminder
   ↓
End
```

### 7.5 Segment building

```
Kontakty → Segmenty → Nový segment
   ↓
Add conditions:
- Contact data (custom fields, tags)
- Email engagement
- E-commerce data (s integrací)
- Subscription source
- GDPR consent status
- Activity timeline
- Date conditions (birthday, jmeniny)
   ↓
Combine s AND/OR/NOT
   ↓
Preview segment size
   ↓
Save
   ↓
[Dynamic segment]
```

### 7.6 Form / Pop-up management

```
Formuláře → Nový formulář
   ↓
Type:
- Klasický embed
- Pop-up modal
- Exit-intent
- Slider
- Sticky bar
   ↓
Configure:
- Fields (text, email, phone, dropdown, checkbox)
- GDPR consent (required for CZ!)
- Captcha
- Trigger conditions
   ↓
Design content
   ↓
Connect:
- Default list
- Tags
- Automation trigger
   ↓
Publish
   ↓
Embed code OR plugin install
```

---

## 8. Subscriber lifecycle

### 8.1 Subscription creation paths

#### A) Form submission
```
Visitor fills SmartEmailing form (embedded, pop-up, exit-intent)
   ↓
Submit
   ↓
SmartEmailing:
- Validates email
- Duplicate check
- Captcha verification
- GDPR consent recorded:
  - Source (which form)
  - Purpose (marketing, transactional)
  - Validity period
  - Consent text version
   ↓
Status: Pending (double opt-in default) OR Active
   ↓
Add to list(s)
   ↓
Tag (if configured)
   ↓
Automation trigger fires
```

#### B) Double opt-in flow
```
Form submission
   ↓
Status: Pending
   ↓
SmartEmailing sends confirmation email
   ↓
Subscriber clicks confirm
   ↓
IP + timestamp + user agent logged
   ↓
**GDPR evidence updated** (consent confirmed)
   ↓
Status: Active
   ↓
Add to specified list
   ↓
Welcome workflow triggers
```

#### C) Shoptet integration sync
```
Customer creates account na Shoptet
   ↓
Shoptet webhook → SmartEmailing
   ↓
Contact created with marketing consent flag
   ↓
Add to designated list (e.g. "Shoptet customers")
   ↓
Tag: "Source: Shoptet"
   ↓
**GDPR evidence:** source = "Shoptet sync"
   ↓
Workflow trigger (welcome new customer)
```

#### D) Manual import (CSV)
```
Admin: Kontakty → Import
   ↓
CSV upload OR copy-paste
   ↓
Field mapping
   ↓
Choose:
- List destination
- Skip duplicates option
- Update existing
- Tag with import source
   ↓
**Mandatory GDPR consent confirmation:**
- Confirm consent source
- Confirm purpose
- Confirm validity
- Confirm text version
   ↓
Validation processed
   ↓
Import processed
   ↓
[Contacts in account with GDPR evidence!]
```

#### E) API
```
External system POST /contactlists/{id}/contacts
   ↓
SmartEmailing creates / updates
   ↓
Add to lists, tags
   ↓
GDPR evidence requires:
- Source identification
- Purpose
- Consent details
   ↓
Trigger workflows
```

#### F) E-commerce via Make/Zapier
```
Custom platform → Make/Zapier
   ↓
Make routes to SmartEmailing API
   ↓
Contact created s consent validation
   ↓
Workflow trigger
```

### 8.2 Subscriber status

```
[Pending] (if double opt-in)
   ↓
[Active] ← can receive
   ↓
Various transitions:
- Unsubscribed (opt-out)
- Bounced (hard bounce)
- Spam complaint
- Deleted (manual / GDPR)
```

### 8.3 Engagement tracking

```
Active subscriber receives email
   ↓
Open tracked (pixel)
Click tracked (URL wrapper)
   ↓
Profile updates:
- Last activity
- Engagement metrics
- Tags (if workflow triggers)
- Segments re-evaluated
```

### 8.4 Preference center

```
Email footer: "Změnit nastavení odběru" link
   ↓
SmartEmailing-hosted preference page (v češtině)
   ↓
Subscriber sees:
- Subscribed lists (toggles)
- Personal info (editable)
- Master unsubscribe
- GDPR rights (download data, delete)
   ↓
Update
   ↓
Profile updated
```

### 8.5 Unsubscribe

```
Subscriber clicks Odhlásit odběr
   ↓
SmartEmailing-hosted unsubscribe page
   ↓
Options:
- Odhlásit z konkrétního seznamu
- Odhlásit ze všech
- Důvod (optional survey)
   ↓
Status: Unsubscribed
   ↓
**GDPR evidence updated** (opt-out timestamp)
   ↓
Data retained per GDPR / business
   ↓
"Unsubscribed" workflow trigger fires
```

### 8.6 Bounce + spam handling

#### Hard bounce
```
ISP 5xx
   ↓
Status: Bounced
   ↓
Auto-suppression
   ↓
**Sender reputation tracking** (CZ deliverability!)
```

#### Spam complaint
```
ISP FBL → SmartEmailing
   ↓
Status: Spam complaint
   ↓
Auto-suppression
   ↓
Internal alert if pattern emerges
```

### 8.7 GDPR delete (Right to Be Forgotten)

```
Subscriber requests deletion:
A) Via preference center
B) Direct email request
C) Admin manual
   ↓
SmartEmailing:
- Removes personal data
- Anonymizes events
- Auto-suppression
- **GDPR evidence retains deletion record** (audit)
- Confirmation email
```

---

## 9. Email lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│  1. USER drafts campaign / automation email                     │
│     - Audience selection (lists, segments)                      │
│     - Configure trigger (for automation)                        │
│     - Design + personalize (Czech case forms!)                  │
│                            │                                    │
│                            ▼                                    │
│  2. PRE-SEND CHECKS                                             │
│     - Sender verified?                                          │
│     - Domain DKIM/SPF/DMARC?                                    │
│     - Audience valid?                                           │
│     - Plan limits OK?                                           │
│     - GDPR compliance footer (CZ legal)                         │
│                            │                                    │
│                            ▼                                    │
│  3. SEND TIME                                                   │
│     - Odeslat ihned                                             │
│     - Naplánovat                                                │
│     - Time-zone send                                            │
│                            │                                    │
│                            ▼                                    │
│  4. PER-RECIPIENT GENERATION                                    │
│     - Tokens resolved                                           │
│     - **Czech case forms auto-applied** (5. pád)                │
│     - **Czech grammar correctness**                             │
│     - Dynamic content evaluated                                 │
│     - Product feed blocks rendered                              │
│     - Tracking pixels embedded                                  │
│     - Click trackers wrapped                                    │
│                            │                                    │
│                            ▼                                    │
│  5. SMTP SEND from SmartEmailing infrastructure (EU)            │
│     - DKIM signed                                               │
│     - SPF compliant                                             │
│     - DMARC aligned                                             │
│     - List-Unsubscribe RFC 8058                                 │
│     - **Deliverability optimization (CZ leader claim)**         │
│                            │                                    │
│                            ▼                                    │
│  6. ISP RECEIVES (Seznam.cz, Gmail, Outlook, etc.)              │
│     - **Strong relationships s Seznam.cz** (CZ #1 ISP)          │
│     - Auth checks                                               │
│     - Reputation check                                          │
│     - Content filters                                           │
│                            │                                    │
│                            ▼                                    │
│  7. ROUTING                                                     │
│     - Inbox / Promotions / Spam                                 │
│                            │                                    │
│                            ▼                                    │
│  8. RECIPIENT INTERACTION                                       │
│     - Open → pixel → tracked                                    │
│     - Click → SmartEmailing redirect → tracked                  │
│     - Site tracker fires on landing page                        │
│                            │                                    │
│                            ▼                                    │
│  9. PROFILE UPDATE                                              │
│     - Engagement metrics                                        │
│     - Segments re-evaluated                                     │
│     - Czech analytics (CZ-specific metrics)                     │
│                            │                                    │
│                            ▼                                    │
│ 10. WORKFLOW TRIGGERS                                           │
│     - "Otevřeno" / "Kliknuto" events fire                       │
│                            │                                    │
│                            ▼                                    │
│ 11. REPORTING                                                   │
│     - Real-time stats                                           │
│     - Revenue attribution (e-commerce s integrací)              │
│     - Czech analytics dashboard                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. Automation execution model

### 10.1 Automation activation

```
Marketer builds automation
   ↓
Test mode (preview as contact)
   ↓
Activate
   ↓
SmartEmailing validation:
- All triggers configured
- All actions valid
- No broken paths
   ↓
[Active]
   ↓
Engine evaluates continuously
```

### 10.2 Trigger evaluation

```
Event occurs (subscription, order, tag, jmeniny, atd.)
   ↓
SmartEmailing evaluates active automations
   ↓
For each matching workflow:
- Check entry conditions
- Check if subscriber already in workflow
- Check re-entry settings
- Add subscriber to workflow execution
```

### 10.3 Per-subscriber execution

```
Subscriber enters at trigger
   ↓
Each node processed sequentially:
- Send email → SMTP queue (s Czech grammar processing!)
- Send SMS → SMS gateway
- Wait → schedule continuation
- Condition → evaluate, branch
- Update field → modify subscriber
- Goal → check if achieved
   ↓
Continue until:
- End of workflow
- Goal achieved
- Removed from trigger condition
- Manually removed
```

### 10.4 Re-entry rules

```
Per workflow:
- Run multiple times
- Run once per contact
- Minimum gap between re-entries
   ↓
Useful for:
- Welcome series: Run once
- Jmeniny: Yearly recurring (auto)
- Birthday: Yearly recurring (auto)
- Browse abandonment: Multiple times
```

### 10.5 Date-based trigger execution

```
SmartEmailing checks date fields daily:
- Birthday matches today (CZ calendar)
- Jmeniny matches today (CZ/SK calendar)
- Custom date offsets
   ↓
For each matching subscriber:
- Trigger workflow
- Personalize s Czech grammar
- Send communication
```

### 10.6 Workflow analytics

```
Per automation:
- Active subscribers
- Completed
- Failed
- Goal achievement rate
- Per-step performance
- Drop-off analysis
- Revenue attributed (s e-commerce)
```

---

## 11. GDPR evidence flow

**SmartEmailing's unique GDPR evidence feature** je core differentiator pro CZ trh.

### 11.1 GDPR evidence per contact

Per oficiální claim:
*"GDPR evidenciou, s ktorou máte neustále prehľad o pôvode vašich kontaktov, účelom spracovania a platnosťou súhlasu."*

Tracked per contact:
- **Source** (původ – which form, integration, import)
- **Purpose** (účel – marketing, transactional, etc.)
- **Validity period** (platnost souhlasu)
- **Timestamp + IP** (when + where)
- **Consent text version** (legal text shown to user)
- **Consent method** (form, double opt-in, integration, manual)
- **Channel consent** (email, SMS separately)

### 11.2 GDPR evidence creation flow

#### Form submission with consent
```
Visitor fills form s GDPR consent checkbox
   ↓
Submit s consent checked
   ↓
SmartEmailing records:
- Email
- Timestamp (UTC + CZ time)
- IP address
- User agent
- Form ID
- Consent text version
- Purpose (marketing, transactional, atd.)
- Validity period (default per business setting)
   ↓
GDPR evidence entry created
   ↓
Audit trail v contact profile
```

#### Manual import with consent
```
Admin imports CSV
   ↓
**Mandatory consent confirmation modal:**
- Confirm consent source
- Confirm purpose
- Confirm validity period
- Confirm consent text used
   ↓
GDPR evidence entries created bulk
   ↓
Audit trail
```

#### Integration sync (Shoptet)
```
Customer registered na Shoptet s marketing consent
   ↓
Sync to SmartEmailing
   ↓
GDPR evidence:
- Source: "Shoptet [shop_name]"
- Purpose: "Marketing emails"
- Validity: per business setting
- Timestamp: registration time on Shoptet
```

### 11.3 GDPR evidence audit

```
Admin / Compliance team: Kontakty → contact detail → GDPR evidence
   ↓
View per contact:
- All consent records (multiple per channel possible)
- Source breakdown
- Purpose breakdown
- Validity status
- History (changes, opt-outs)
   ↓
Compliance audit ready
```

### 11.4 GDPR rights flow

#### Right to access (DSAR)
```
Subscriber requests data
   ↓
Admin / API: Generate GDPR export
   ↓
SmartEmailing produces JSON/CSV:
- Profile data
- All events
- GDPR evidence (all consent records)
- Activity timeline
- Communications history
- Form submissions
   ↓
Provide to subscriber within 30 days
```

#### Right to be Forgotten
```
Subscriber requests deletion
   ↓
Method A: Admin manual
Method B: API DELETE
Method C: Preference center self-service
   ↓
SmartEmailing:
- Removes personal data
- Anonymizes events
- **Retains GDPR evidence deletion record** (audit)
- Confirmation
   ↓
Compliance log
```

### 11.5 GDPR evidence importance pro CZ

CZ regulations (ÚOOÚ) are stricter v některých aspectech vs. EU general GDPR. SmartEmailing's evidence feature explicitly addresses:
- **ÚOOÚ kontrola** (Czech data protection authority audits)
- **Proof of consent** required during audits
- **Source provenance** must be demonstrable
- **Validity period** must be documented

Per oficiální: *"Proti kontrole z úradu sa ubránite GDPR evidenciou"*

---

## 12. Czech personalization flow (jmeniny, pádování)

### 12.1 Czech grammar handling

**Unique SmartEmailing feature pro CZ market:**

```
User uses [JMÉNO V 5. PÁDU] token in email
   ↓
At send time, per recipient:
   - Check first name in profile
   - SmartEmailing language engine determines:
     - Nominative form (Petr, Jana)
     - Vocative form (Petře, Jano)
     - Gender detection
   - Replace token with correct case
   ↓
Email sent s grammatically correct salutation:
- "Dobrý den, Petře!"
- "Dobrý den, Jano!"
```

**Pro Czech/Slovak languages this is critical** because:
- Nominative (Petr) ≠ Vocative (Petře)
- Incorrect case sounds wrong
- Globální platformy (Mailchimp, ActiveCampaign) tohle nedělají

### 12.2 Czech calendar lookup

```
Czech calendar built-in:
- Each day of year mapped to traditional Czech name
- E.g. May 17 = Aneta
- Slovak calendar separately
   ↓
SmartEmailing matches contact's first name to calendar day
- If contact named "Aneta" → May 17 is her jmeniny
- Trigger workflow on that day
```

### 12.3 Jmeniny automation example

```
Trigger: Today is contact's name day (CZ calendar)
   ↓
SmartEmailing daily evaluation (early AM):
   - For each Active contact
   - Match name to today's calendar entry
   - If match → trigger workflow
   ↓
Workflow:
   - Send email s Czech grammar
   - Subject: "Šťastné jmeniny, [JMÉNO V 5. PÁDU]!"
   - Body: Personalized congratulation + offer
   ↓
Send to all matching contacts
   ↓
Track engagement
   ↓
Yearly recurring (auto)
```

### 12.4 Birthday flow s Czech calendar

```
Subscriber profile has datum_narozeni custom field
   ↓
SmartEmailing checks daily:
   - Match birthday to today
   ↓
Trigger workflow:
   - Send congratulation
   - With special offer
   - Personalized greeting
   ↓
Yearly recurring (auto)
```

### 12.5 Gender detection

```
Contact has first name "Petra"
   ↓
SmartEmailing detects: female
   ↓
Available v segmentation + workflows:
- Send female-targeted content
- Use feminine pronouns / endings
- Different product recommendations
```

---

## 13. Forms & Pop-ups flow

### 13.1 Form creation

```
Marketer / Designer: Formuláře → Nový formulář
   ↓
Type:
- Klasický (embedded)
- Pop-up (modal)
- Exit-intent
- Slider
- Sticky bar
   ↓
Configure:
- Fields (text, email, phone, dropdown, checkbox, radio, date)
- **GDPR consent field** (required, CZ)
- Captcha (anti-spam)
- Submit button text
- Success message
   ↓
Trigger conditions (popup):
- Time on page
- Scroll depth %
- Exit intent
- URL targeting
- Frequency caps
   ↓
Design:
- Brand colors / fonts
- Custom CSS
   ↓
Connect:
- Default list
- Tags on submit
- Automation trigger
   ↓
Save + Publish
```

### 13.2 Form deployment methods

```
A) Embed code (HTML/JS) – paste do website
B) Shoptet plugin → one-click přidání do e-shopu
C) WordPress plugin → shortcode
D) PrestaShop plugin
E) Make/Zapier custom workflows
```

### 13.3 Submission flow

```
Visitor fills form
   ↓
Submit
   ↓
SmartEmailing receives:
- Validate fields
- Captcha check
- Duplicate email check
- **GDPR consent confirmation logged**
   ↓
Subscriber created or updated:
- Add to specified list
- Apply tags
- Trigger workflow
- GDPR evidence created
   ↓
Status: Pending (double opt-in) OR Active
   ↓
If double opt-in:
   - Confirmation email sent
   - User clicks confirm
   - GDPR evidence updated
   - Status: Active
   ↓
Welcome workflow if configured
```

---

## 14. Shoptet integration flow (deep)

### 14.1 Installation

Per oficiální Shoptet doplnek docs:

```
Shoptet admin → Doplňky / Aplikace
   ↓
Search "SmartEmailing"
   ↓
Install SmartEmailing doplněk
   ↓
Authorize:
- Shoptet → SmartEmailing OAuth
- Permissions granted
   ↓
SmartEmailing configuration:
- Default list for new customers
- Sync historical data toggle
- Custom field mapping
- Tag rules
   ↓
**Product feed URL auto-detected**
   ↓
Forms embed code provided pro Shoptet
   ↓
Initial sync (hours pro large stores):
- Customers → contacts
- Orders → events + LTV
- Products → catalog
   ↓
[Integration live, real-time sync]
```

### 14.2 Continuous data flow

```
Shoptet event occurs
   ↓
Webhook → SmartEmailing
   ↓
SmartEmailing processes:
- Contact create/update
- Order record
- Cart state update
   ↓
Profile updates:
- Activity timeline
- Engagement metrics
- Segments re-evaluated
- GDPR evidence (per consent flag)
   ↓
Automation triggers fire (if match)
```

### 14.3 Data synced

#### Customer data
- Email (primary)
- Jméno, příjmení (with case forms support)
- Telefon
- Adresa
- Marketing consent (transferred to GDPR evidence!)
- Datum narození (pro birthday triggers)
- Pohlaví (z first name detection)
- Registration date

#### Order data
- Order ID
- Date
- Status
- Total value (CZK / EUR)
- Items (product IDs, quantities, prices)
- Shipping method
- Payment method
- Various Shoptet fields

#### Product data
- Auto-imported via product feed URL
- Product images, names, prices
- Categories
- Descriptions
- Real-time updates

#### Cart events
- Cart abandoned (>30 min default)
- Cart items dynamically

### 14.4 Form embed

Per oficiální:
*"jednoduché vloženie smartemailingového formulára na váš e-shop"*

```
SmartEmailing form embed do Shoptet:
- Choose form type (klasický, pop-up)
- One-click install do Shoptet template
- Double opt-in config v SmartEmailing
- GDPR consent automatic
   ↓
[Form live na e-shopu]
```

### 14.5 Abandoned cart flow specific

```
Customer adds to cart na Shoptet
   ↓
Shoptet tracks cart state
   ↓
After 30 min without checkout → cart abandoned event
   ↓
Webhook → SmartEmailing
   ↓
Workflow trigger: "Cart abandoned"
   ↓
Pre-prepared scenario:

Wait 1h
   ↓
Send Email 1:
- "Zapomněl jste v košíku, [JMÉNO V 5. PÁDU]!"
- Czech grammar correct salutation
- Dynamic cart contents block (from Shoptet product feed)
- Direct checkout link
   ↓
Wait 24h
   ↓
Condition: Purchased? (check Shoptet order data)
   YES → Exit (success)
   NO → Send Email 2 (s discount)
   ↓
Wait 48h
   ↓
Condition: Purchased?
   YES → Exit
   NO → Send SMS (if opted in)
   ↓
Exit
```

### 14.6 Revenue attribution

```
Email send recorded
   ↓
Subscriber clicks link
   ↓
Lands on Shoptet store
   ↓
Conversion window (default 7 days):
   - If order placed → revenue attributed to email
   ↓
Reports show:
- Revenue per campaign
- Revenue per automation
- ROI per channel
```

---

## 15. Other e-commerce flow (Shopify, WooCommerce, PrestaShop)

### 15.1 PrestaShop native plugin

```
PrestaShop admin → Modules → Install SmartEmailing
   ↓
Configure:
- API key
- Default list
- Field mapping
   ↓
Auto-sync:
- Customers
- Orders
- Products
- Cart events
```

### 15.2 WooCommerce via WordPress

```
WordPress admin → Plugins → SmartEmailing for WordPress
   ↓
Activate plugin
   ↓
Configure:
- API key
- Default list
- WooCommerce integration toggle
- Form embed shortcodes
   ↓
WooCommerce orders sync → SmartEmailing
   ↓
[Integration live]
```

### 15.3 Shopify via API / Make

```
Shopify NEMÁ native SmartEmailing plugin (per současný stav)
   ↓
Options:
A) Direct API integration (custom dev)
B) Make (Integromat) workflow
C) Zapier integration
   ↓
Make/Zapier approach:
- Trigger: Shopify event (new customer, new order, abandoned cart)
- Action: SmartEmailing API call
- Map fields
- Activate scenario
```

### 15.4 Custom platforms via API

```
Custom e-shop → SmartEmailing API
   ↓
Direct integration:
- Customer create/update endpoint
- Order webhook
- Product feed
- Event tracking
   ↓
Configure per integration
   ↓
Test thoroughly
```

---

## 16. SMS flow

### 16.1 SMS setup

```
Admin: Nastavení → SMS
   ↓
Activate SMS module
   ↓
Configure:
- Sender ID (country-specific, CZ + SK primary)
- Pre-paid credits
- Default settings (quiet hours)
- STOP keyword handling
   ↓
Buy SMS credits (CZK / EUR pricing)
   ↓
[SMS module ready]
```

### 16.2 SMS campaign

```
Kampaně → SMS kampaň
   ↓
Configure:
- Sender ID
- Recipients (segment / list)
- Message text (Czech grammar processing!)
- Link tracking
- Schedule
   ↓
Preview + Test
   ↓
Send / Schedule
   ↓
Recipients receive SMS
   ↓
Track delivery, clicks
```

### 16.3 SMS in automation

```
Workflow node "Poslat SMS":
- Configure message
- Insert tokens
- Set timing
   ↓
Per workflow execution:
- Personalize per contact
- Send via SMS gateway
- Track delivery
```

### 16.4 Compliance

- Opt-in required (separate from email!)
- STOP keyword auto-handling
- Quiet hours enforced
- ÚOOÚ compliant
- Sender ID per country

---

## 17. Transactional email flow

### 17.1 Setup

```
Admin: Nastavení → Transakční API
   ↓
Generate API key for transactional
   ↓
Configure default sender
   ↓
Create templates with variables
   ↓
[API ready]
```

### 17.2 API send

```
Application:
   POST /transactional-emails
   Headers:
     Authorization: Bearer {api_key}
   Body:
     - to
     - template_id (or HTML)
     - variables (merge data)
     - subject
   ↓
SmartEmailing:
- Validates auth
- Renders template
- Tracks open + click
- Sends via infrastructure
   ↓
Recipient receives email
   ↓
Logged v contact activity timeline (if matched)
```

### 17.3 Use cases

- Order confirmations
- Shipping notifications
- Password resets
- Account verifications
- Receipts

### 17.4 Limitations

- **Less feature-rich** than dedicated transactional (Postmark, Mailgun)
- **Shared infrastructure** with marketing typically
- Sufficient for SMB use cases

---

## 18. API & Integration flow

### 18.1 API key creation

```
Admin: Nastavení → API
   ↓
Generate API key
   ↓
Name + scope
   ↓
**Key displayed** – copy + secure
   ↓
[API key active]
```

### 18.2 API request flow

```
External system:
   POST https://app.smartemailing.cz/api/v3/[endpoint]
   Headers:
     Authorization: Basic {credentials}
   Body: { data }
   ↓
SmartEmailing:
- Validates auth
- Rate limit check
- Validates payload
   ↓
Response 200/201
   ↓
Action performed
```

### 18.3 API endpoints

| Resource | Operace |
|---|---|
| `/contactlists` | Lists management |
| `/contactlists/{id}/contacts` | Add to list |
| `/contacts` | Contact management |
| `/transactional-emails` | Send transactional |
| `/campaigns` | Campaign data |
| `/automations` | Workflow management |
| `/forms` | Form data |
| `/orders` | E-commerce orders |

### 18.4 Webhooks

- Subscriber events
- Campaign events
- Order events (e-commerce)
- Form submissions

### 18.5 Make (Integromat) integration

**Deep CZ-friendly integration:**
```
Make scenario builder
   ↓
SmartEmailing modules available:
- Search contacts
- Create / Update contact
- Add to list
- Send transactional
- Search campaigns
- Get campaign data
- Webhook trigger from SmartEmailing
   ↓
Connect with 1 000+ apps
```

### 18.6 Zapier integration

```
Zapier:
- SmartEmailing trigger options
- SmartEmailing action options
- Connect with 5 000+ apps
- Easier for non-technical users
```

### 18.7 Plugins ecosystem

- **Shoptet doplněk** (one-click)
- **WordPress plugin**
- **PrestaShop module**

---

## 19. Deliverability flow

### 19.1 SmartEmailing's claimed CZ deliverability leadership

Per oficiální: *"number one position in deliverability na CZ trhu"*

### 19.2 Infrastructure

- **EU hosting**
- **Multi-IP pools** (shared)
- **Dedicated IP** (higher tiers, add-on)
- **Sender reputation monitoring**
- **Engagement-based routing**

### 19.3 CZ ISP relationships

Strong relationships particularly:
- **Seznam.cz** (#1 CZ email provider)
- **Centrum.cz**
- **Atlas.cz**
- **Email.cz**
- **Volny.cz**

Local expertise advantage vs. globální platforms.

### 19.4 Authentication setup

| Protokol | Setup |
|---|---|
| **SPF** | Include for SmartEmailing |
| **DKIM** | DNS records |
| **DMARC** | TXT record |
| **Sender verification** | Email verification |
| **Branded tracking domain** | CNAME |

### 19.5 Domain authentication flow

```
Admin: Nastavení → Domény
   ↓
Add sending domain
   ↓
SmartEmailing provides DNS records (Czech-friendly docs)
   ↓
Add to DNS provider
   ↓
SmartEmailing validates
   ↓
[Authenticated]
```

### 19.6 List hygiene

- Auto-suppression hard bounces
- Spam complaint auto-suppression
- Inactive subscriber detection
- Re-engagement workflows recommended

### 19.7 Czech-specific list hygiene

- Email validation s **Emailable** integration
- CZ-specific spam pattern detection
- Czech regulatory compliance (no purchased lists!)

---

## 20. Compliance flow

### 20.1 EU + CZ hosting

- Servers v EU
- GDPR-friendly default
- ÚOOÚ (CZ) compliant
- ÚOOÚ-registered controller

### 20.2 GDPR features (built-in evidence)

```
Per kontakt:
- Source (původ)
- Purpose (účel)
- Validity period (platnost)
- Timestamp + IP
- Consent text version
- Method (form, double opt-in, integration)
- Channel consent
   ↓
Audit trail per contact
   ↓
Export available pro ÚOOÚ kontroly
```

### 20.3 Right to Be Forgotten

```
Subscriber requests deletion
   ↓
Method A: Admin → contact → Smazat trvale
Method B: API DELETE
Method C: Self-service preference center
   ↓
SmartEmailing:
- Removes personal data
- Anonymizes events
- Retains GDPR evidence deletion record
- Audit log entry
- Confirmation email
```

### 20.4 DSAR (Data Subject Access Request)

```
Subscriber requests their data
   ↓
Admin: Generate GDPR export
   ↓
SmartEmailing produces:
- Profile data
- Activity events
- All GDPR evidence records
- Communications history
- Form submissions
   ↓
Provide to subscriber (30 days max per GDPR)
```

### 20.5 Compliance certifications

- **GDPR compliant**
- **CZ ÚOOÚ** registered
- **CAN-SPAM** (US)
- **CASL** (Canadian)

### 20.6 Security

- **2FA** (TOTP)
- **API key per user**
- **Encryption** at rest + in transit
- **Audit logs**
- **EU data residency**

---

## 21. Datová mapa: co vidí kdo

| Data | Owner | Admin | Marketing | Designer | Viewer | Custom | Subscriber | API |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Account settings | ✅ | ✅ | ❌ | ❌ | ❌ | per role | ❌ | per scope |
| Billing | ✅ | ❌ | ❌ | ❌ | ❌ | per role | ❌ | per scope |
| User management | ✅ | ✅ | ❌ | ❌ | ❌ | per role | ❌ | per scope |
| Domains | ✅ | ✅ | ❌ | ❌ | ❌ | per role | ❌ | per scope |
| All subscribers | ✅ | ✅ | ✅ | limited | view | per role | jen sebe | ✅ |
| Edit subscribers | ✅ | ✅ | ✅ | ❌ | ❌ | per role | ❌ | ✅ |
| Export subscribers | ✅ | ✅ | per role | ❌ | ❌ | per role | request | per scope |
| GDPR evidence | ✅ | ✅ | view | view | view | per role | jen své | ✅ |
| Lists | ✅ | ✅ | ✅ | ❌ | view | per role | – | ✅ |
| Segments | ✅ | ✅ | ✅ | ❌ | view | per role | – | ✅ |
| Tags | ✅ | ✅ | ✅ | ❌ | view | per role | – | ✅ |
| Campaigns | ✅ | ✅ | ✅ | ✅ | view | per role | jen co dostal | ✅ |
| Send campaigns | ✅ | ✅ | ✅ | ❌ | ❌ | per role | ❌ | ✅ |
| Automations | ✅ | ✅ | ✅ | ❌ | view | per role | ❌ | ✅ |
| Pre-prepared scenarios | ✅ | ✅ | ✅ | ❌ | view | per role | – | ✅ |
| Templates | ✅ | ✅ | ✅ | ✅ | view | per role | – | ✅ |
| Forms / Pop-ups | ✅ | ✅ | ✅ | ✅ | view | per role | submit | per scope |
| SMS module | ✅ | ✅ | ✅ | ❌ | ❌ | per role | – | per scope |
| SMS credits | ✅ | ✅ | view | ❌ | ❌ | per role | – | per scope |
| Transactional | ✅ | ✅ | per role | ❌ | ❌ | per role | – | ✅ |
| Czech personalization (jmeniny) | ✅ | ✅ | ✅ | ✅ | view | per role | – | per scope |
| Reports | ✅ | ✅ | ✅ | view | ✅ | per role | ❌ | ✅ |
| Integrations | ✅ | ✅ | per role | ❌ | ❌ | per role | – | per scope |
| API keys | ✅ | ✅ | ❌ | ❌ | ❌ | per role | ❌ | – |
| GDPR delete | ✅ | ✅ | per role | ❌ | ❌ | per role | request | per scope |

---

## 22. Známé úzkoprofilové místa

### 22.1 Permission model

- **Less granular** než ActiveCampaign group system
- **Pre-defined roles** primarily
- **Custom roles** higher tier only
- **No SSO/SAML** typically (vs. enterprise platforms)
- **No SCIM provisioning**

### 22.2 No free plan

- **Only 14-day trial** (vs. Ecomail 40K contacts free plan)
- **Must commit to paid** after trial
- **Less accessible** pro malé use cases

### 22.3 UI/UX

- **Mature traditional UI** (less modern than Ecomail per některé reviews)
- **Steeper learning curve** v některých sekcích
- **Less polished** vs. globální platforms (Mailchimp, MailerLite)
- **Mobile app limited**

### 22.4 Pricing concerns

- **Higher entry pricing** než Ecomail (€7.60 vs. €5)
- **Add-ons stack** (SMS credits, dedicated IP)
- **Less price-competitive** na CZ trhu pro entry users

### 22.5 Automation depth limitations

- Solid mid-level automation, ale:
- **Less sophisticated** než ActiveCampaign branching
- **Fewer pre-prepared templates** než ActiveCampaign 900+
- **No multi-trigger workflows** (typically)
- **No conditional content** (per recipient v same email)
- **No predictive sending AI** per recipient
- **No advanced A/B testing in automations**

### 22.6 Missing features (vs. global)

- **No webinars** built-in
- **No online courses** native
- **No paid newsletters** subscription
- **No digital products** sale
- **No deep CRM** (no deals/pipelines)
- **No predictive analytics** (CLV, churn)
- **No autonomous AI agents**
- **No generative AI** for content
- **No Facebook Lead Ads** native (via Make/Zapier yes)
- **No landing page builder** (limited – per current state, varies)

### 22.7 International scaling

- **CZ/SK focus primarily**
- **English UI exists** but less developed
- **Less marketing v EU mimo CZ/SK**
- **Less international integrations** než ActiveCampaign 970+ / Mailchimp ecosystem
- **Documentation primarily Czech**

### 22.8 Integration breadth

- **CZ-specific deep** (Shoptet, Luigi's Box, Zenamu)
- **Fewer globální integrace** než Mailchimp / ActiveCampaign
- Heavy reliance na **Make/Zapier** pro nichova apps
- **No native Salesforce/HubSpot/Dynamics**

### 22.9 AI features

- **No generative AI** (vs. ActiveCampaign Active Intelligence, HubSpot Breeze)
- **No autonomous agents**
- **No AI subject line generation**
- **No predictive sending** AI
- **Traditional rule-based** automation

### 22.10 Enterprise features missing

- **No SSO/SAML**
- **No SCIM**
- **No HIPAA support**
- **No sandbox accounts**
- **Limited audit logs**

### 22.11 E-commerce gaps vs. Klaviyo

- **Less polished Shopify integration** (PrestaShop deeper)
- **No predictive CLV / churn**
- **No automatic RFM cohorts**
- **No AI product recommendations**
- **Less DTC-specific features**

### 22.12 Migration tools

- **Manual migration** typical
- **Templates rebuild** required
- **Automations** must be re-built
- Czech support assistance available

### 22.13 Designer / agency model

- **No formal sub-account / multi-tenant** like Ecomail Agency
- **Less developed agency features**
- **Multiple accounts** managed separately

### 22.14 Documentation in English

- **English docs** less comprehensive
- **Primary docs Czech**
- **International users** limited experience

---

## 23. Doporučení pro design vlastních procesů

Pokud SmartEmailing používáte v týmu, doporučujeme:

1. **Domain authentication day 1** – DKIM + SPF + DMARC + branded tracking domain
2. **Sender verification** – email + domain
3. **GDPR evidence audit** – pravidelný review consent records
4. **Brand setup** – consistent Czech market presence
5. **Double opt-in default** – better deliverability + CZ compliance
6. **Custom field strategy** – plan upfront
7. **Tag taxonomy** – flat structure s Czech prefixes (Zdroj:, Stav:, Chování:)
8. **Shoptet integration** (pokud CZ e-shop) – plně využít deep features
9. **Product feed auto-config** – Shoptet provides URL
10. **Pre-prepared scenarios** – start s welcome + abandoned cart
11. **Jmeniny automation** – unique CZ value, set up early
12. **Birthday automation** – datum_narozeni field strategy
13. **Czech grammar processing** – use 5. pád tokens always
14. **Czech support využívat** – fast phone responses
15. **Test profile** dedicated pro QA
16. **A/B test culture** – subject lines, content, timing
17. **Email cleanup** – pravidelný unsubscribed cleanup
18. **Make/Zapier** pro custom workflows
19. **Backup strategy** – periodic export contacts + GDPR evidence
20. **CZ deliverability monitoring** – Seznam.cz primary, others
21. **Mobile design** – CZ mobile users high
22. **Migration plan** – if scaling beyond SmartEmailing capabilities
23. **Document API integrations** s service accounts

---

*Dokument zpracován z oficiálních zdrojů smartemailing.cz, Shoptet doplnek SK docs, a praktických zdrojů (Slashdot, SourceForge, CompareYourTech, WProom, ostatní aggregátory). Pro nejaktuálnější detaily je nutný engagement s SmartEmailing support/sales teamem.*
