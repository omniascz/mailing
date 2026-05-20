# Ecomail – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v Ecomailu prochází data, lidé a akce – od Account Ownera přes specializované uživatele, agency sub-accounts, integrace s Shoptetem a dalšími platformami, až po koncového subscribera.

> Tento dokument doplňuje `19_Ecomail_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** Ecomail umí, tento popisuje, **kdo s tím interaguje a jak data tečou**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
>
> - **Český produkt s českou UI + supportem** – unikátní pro CZ/SK trh
> - **User roles s tailored permissions** (per Research.com: "Enables setting up multiple user roles with tailored permissions")
> - **Agency model** s multiple sub-accounts pod jedním master accountem + commission
> - **Free plan up to 40 000 contacts** (per oficiální pricing claim) – jeden z nejštědřejších free plans v industry
> - **Plná Shoptet integrace** – primární diferenciátor v CZ kontextu
> - **Pre-made automation scenarios** out of the box (welcome, abandoned cart, birthday, etc.)
> - **EU hosting + ÚOOÚ compliant**
> - **GDPR-friendly** by design (double opt-in built-in)
> - **Tarify od €5/měsíc** – very affordable
> - **Non-profit 50% discount** annual

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Sign-up & trial flow](#2-signup-flow)
3. [Onboarding flow](#3-onboarding-flow)
4. [User roles & permissions](#4-user-roles)
5. [Agency / Sub-accounts flow](#5-agency-flow)
6. [Account Owner flow](#6-account-owner-flow)
7. [Marketing user flow](#7-marketing-user-flow)
8. [Designer user flow (custom role)](#8-designer-flow)
9. [Subscriber lifecycle](#9-subscriber-lifecycle)
10. [Email lifecycle](#10-email-lifecycle)
11. [Automation execution model](#11-automation-execution)
12. [Pre-made scenario deployment](#12-scenarios-flow)
13. [Forms & Pop-ups flow](#13-forms-flow)
14. [Shoptet integration flow (deep)](#14-shoptet-flow)
15. [Shopify / WooCommerce flow](#15-shopify-flow)
16. [Facebook & Instagram channel flow](#16-fb-ig-flow)
17. [SMS flow](#17-sms-flow)
18. [Transactional email flow](#18-transactional-flow)
19. [API & Integration flow](#19-integration-flow)
20. [GDPR & Compliance flow](#20-gdpr-flow)
21. [Datová mapa: co vidí kdo](#21-datová-mapa)
22. [Známé úzkoprofilové místa](#22-úzkoprofilové-místa)

---

## 1. Mapa aktérů

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│         ECOMAIL PLATFORM ECOSYSTEM                                 │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [Ecomail Internal Team (Praha)]                                   │
│   ├─ Customer Support (Czech native, English)                      │
│   ├─ Technical Support                                             │
│   ├─ Migration assistance                                          │
│   ├─ Deliverability team                                           │
│   ├─ Sales (CZ + EU)                                               │
│   └─ Account / billing team                                        │
│           │ (free support pro all users, fast response)            │
│           ▼                                                        │
│                                                                    │
│   ┌──────────────────────────────────────────┐                     │
│   │   Ecomail Account                        │                     │
│   │                                          │                     │
│   │   User roles (multiple per docs):        │                     │
│   │   ├─ Account Owner (1, založeno při      │                     │
│   │   │   signup)                            │◄── full access     │
│   │   ├─ Admin users                         │◄── full operational │
│   │   ├─ Marketing users                     │◄── marketing tasks  │
│   │   ├─ Designer / Editor users             │◄── content only     │
│   │   ├─ Read-only / Viewer                  │◄── reports only     │
│   │   └─ Custom roles per business needs     │◄── per definition   │
│   │                                          │                     │
│   │   + Sub-accounts (Agency model):         │                     │
│   │   ├─ Master Agency Account               │                     │
│   │   │   ├─ Client A sub-account            │                     │
│   │   │   ├─ Client B sub-account            │                     │
│   │   │   └─ Client C sub-account            │                     │
│   │   + Agency commission per new customer    │                     │
│   │                                          │                     │
│   │   User seats limits per plan:             │                     │
│   │   - Free: limited                         │                     │
│   │   - Paid: scaling with plan tier          │                     │
│   └──────────────┬───────────────────────────┘                     │
│                  │                                                 │
│                  ▼                                                 │
│   [Subscribers / Contacts]                                         │
│       │                                                            │
│       ├─→ marketing emails (campaigns + automations)               │
│       ├─→ behavior tracking (site tracking)                        │
│       ├─→ SMS messages                                             │
│       ├─→ Facebook / Instagram retargeting                         │
│       ├─→ transactional emails                                     │
│       ├─→ form submissions                                         │
│       └─→ subscription preference management                       │
│                  │                                                 │
│                  ▼                                                 │
│   [Integrations]                                                   │
│   ┌──────────────────────────────────────────┐                     │
│   │   CZ-specific:                           │                     │
│   │   - Shoptet (DOMINANT CZ E-SHOP, deep)   │                     │
│   │                                          │                     │
│   │   Global e-commerce:                     │                     │
│   │   - Shopify + Shopify Plus               │                     │
│   │   - WooCommerce                          │                     │
│   │   - Magento (Adobe Commerce)             │                     │
│   │   - BigCommerce                          │                     │
│   │   - OpenCart, Ecwid, PrestaShop          │                     │
│   │                                          │                     │
│   │   Marketing / Productivity:              │                     │
│   │   - Facebook / Instagram Ads             │                     │
│   │   - Zapier, Make (Integromat)            │                     │
│   │   - WordPress plugin                     │                     │
│   │                                          │                     │
│   │   API + Webhooks for custom needs        │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér                    | Vstupní bod               | Co dělá                        | Co vidí                  |
| ------------------------ | ------------------------- | ------------------------------ | ------------------------ |
| **Account Owner**        | Sign-up (account creator) | Full + billing + close account | Vše                      |
| **Admin user**           | Pozvánka od Owner         | Operational + user mgmt        | Vše krom Owner exclusive |
| **Marketing user**       | Pozvánka                  | Daily marketing                | Per role permissions     |
| **Designer / Editor**    | Pozvánka s custom role    | Content + templates            | Per role                 |
| **Viewer / Read-only**   | Pozvánka                  | View reports                   | Per role                 |
| **Custom role users**    | Pozvánka                  | Per permissions                | Per role                 |
| **Agency master user**   | Agency contract           | Manage all sub-accounts        | All sub-accounts         |
| **Sub-account user**     | Per sub-account           | Per sub-account perms          | Just one sub-account     |
| **Subscriber / Contact** | Form, integration         | Receives emails, browses       | Své emaily               |
| **API Client**           | API key                   | Per scope                      | Per scope                |
| **Shoptet integration**  | Plugin install            | Sync data                      | Per integration scope    |
| **Shopify integration**  | OAuth                     | Sync data                      | Per integration scope    |
| **Facebook integration** | OAuth                     | Lead Ads + Custom Audiences    | Per integration scope    |
| **Ecomail Staff**        | Interní                   | Support, debug                 | Limited                  |

---

## 2. Sign-up & trial flow

### 2.1 Free trial / Free plan signup

```
Visit ecomail.app / ecomail.cz
   ↓
"Start free trial" / "Try Free" button
   ↓
Email + basic info form
   ↓
**No credit card required**
   ↓
Email verification
   ↓
Account created:
- **14-day full feature trial** (per oficiální)
- **Free plan up to 40 000 contacts** (per oficiální claim)
- **Unlimited emails** during trial
- Full feature access
- Czech support active immediately
   ↓
First login s wizard
```

### 2.2 Onboarding wizard

```
First login:
   ↓
Questions:
- Co je váš primární use case?
  - E-commerce newsletters
  - Blog / content
  - Restaurant / lokální business
  - Agency multi-client
  - Non-profit
  - Jiné
- Tým size
- Existing tool (migrating from?)
- E-commerce platform (Shoptet, Shopify, WooCommerce, atd.)
   ↓
Setup recommendations:
- Suggested integrations (Shoptet first for CZ users!)
- Suggested templates
- Pre-made automation recommendations
   ↓
Optional: Schedule onboarding call (Czech)
```

### 2.3 Migration from competitors

```
Standard migration support:
- From Mailchimp (popular migration path)
- From SmartEmailing
- From SendinBlue / Brevo
- From MailerLite
- Custom platforms
   ↓
Migration team assistance:
- Subscribers export → Ecomail import
- Field mapping
- Templates recreation (rebuild required, not import)
- Automation recreation (manual)
- Integration reconnection
   ↓
Free pro Czech customers typically
```

### 2.4 Trial expiration

```
14-day trial ending:
- Email notification 3 days before
- Email notification day of
   ↓
Options:
A) Upgrade to paid (continue seamlessly)
B) Stay on Free plan (data preserved, limits apply)
C) Cancel (data eventually deleted per retention)
   ↓
**Free plan generous:** 40 000 contacts limit (very high!)
```

---

## 3. Onboarding flow

### 3.1 First-time setup checklist

```
Day 1:
- Email verification
- Sender details setup (from name, email)
- Domain authentication (DKIM, SPF)
- Brand kit (colors, fonts, logo)
- First template customization

Day 2-3:
- E-commerce integration setup (Shoptet/Shopify/etc.)
- Initial contact import
- First list creation
- First form / popup

Day 4-7:
- First campaign sent
- First automation (welcome series)
- Site tracking script install
- Facebook Ads connect

Day 7-14:
- Trial expires - choose plan
- Add team users
- Pre-made scenarios activation
- Reports configuration
```

### 3.2 Czech-specific onboarding

```
For CZ businesses:
- Verify domena.cz / .sk
- Configure CZK / EUR billing
- Faktura setup (CZ invoicing)
- DPH / VAT compliance
- Czech sender verification
   ↓
Czech support team available for help in Czech
```

### 3.3 Shoptet onboarding (if applicable)

```
Most CZ e-shops use Shoptet
   ↓
Shoptet App Store → Install Ecomail
   ↓
One-click OAuth
   ↓
Configure:
- Default list for new customers
- Tag rules
- Sync historical data toggle
- Custom field mapping
   ↓
Initial sync (hours for large stores):
- Customers, orders, products
   ↓
Tracking script auto-installed on Shoptet template
   ↓
[Integration live, real-time sync]
```

---

## 4. User roles & permissions

### 4.1 Default roles (typical for Ecomail)

Per Research.com confirmation: _"User, Role, and Access Management: Enables setting up multiple user roles with tailored permissions"_

Exact role naming může vary, but typical structure:

#### A) Account Owner

- **Highest tier** access
- **Vytvořen při signup** (account creator)
- Cannot be deleted directly
- Manages billing
- Closes account
- Manages all settings

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
- Limited contact data
- No send permissions typically
- No automation activation

#### E) Read-only / Viewer

- **View reports** only
- No editing
- No send
- For stakeholders, executives

#### F) Custom roles

- Per business needs
- Granular permissions

### 4.2 Permission categories

#### Account & Settings

- Account info
- Billing access
- User management
- Integration management
- Domain settings
- API key management

#### Contacts / Subscribers

- View contacts
- Edit contacts
- Import contacts
- Export contacts
- Delete contacts

#### Lists

- View lists
- Create/edit lists
- Delete lists

#### Segments

- View segments
- Create/edit segments

#### Campaigns

- View campaigns
- Create campaigns
- Edit campaigns
- Send campaigns
- Delete campaigns

#### Automations

- View automations
- Create/edit automations
- Activate automations
- Delete automations

#### Templates

- View templates
- Create/edit templates
- Brand kit management

#### Forms / Pop-ups

- View forms
- Create/edit forms
- Publish forms

#### Reports

- View reports
- Export reports

#### Integrations

- View integrations
- Manage integrations

### 4.3 Permission matrix (typical default)

| Akce                  | Owner | Admin | Marketing | Designer |  Viewer  |  Custom  |
| --------------------- | :---: | :---: | :-------: | :------: | :------: | :------: |
| **Account & Billing** |       |       |           |          |          |          |
| Close account         |  ✅   |  ❌   |    ❌     |    ❌    |    ❌    |    ❌    |
| Manage billing        |  ✅   |  ❌   |    ❌     |    ❌    |    ❌    | per role |
| Account settings      |  ✅   |  ✅   |    ❌     |    ❌    |    ❌    | per role |
| **User Management**   |       |       |           |          |          |          |
| Add/edit/delete users |  ✅   |  ✅   |    ❌     |    ❌    |    ❌    | per role |
| **Contacts**          |       |       |           |          |          |          |
| View contacts         |  ✅   |  ✅   |    ✅     | limited  |   view   | per role |
| Edit contacts         |  ✅   |  ✅   |    ✅     |    ❌    |    ❌    | per role |
| Import contacts       |  ✅   |  ✅   |    ✅     |    ❌    |    ❌    | per role |
| Export contacts       |  ✅   |  ✅   | per role  |    ❌    |    ❌    | per role |
| Delete contacts       |  ✅   |  ✅   | per role  |    ❌    |    ❌    | per role |
| **Lists / Segments**  |       |       |           |          |          |          |
| Manage lists          |  ✅   |  ✅   |    ✅     |    ❌    |   view   | per role |
| Create segments       |  ✅   |  ✅   |    ✅     |    ❌    |   view   | per role |
| **Campaigns**         |       |       |           |          |          |          |
| Create/edit           |  ✅   |  ✅   |    ✅     |    ✅    |   view   | per role |
| Send                  |  ✅   |  ✅   |    ✅     |    ❌    |    ❌    | per role |
| **Automations**       |       |       |           |          |          |          |
| Create/edit           |  ✅   |  ✅   |    ✅     |    ❌    |   view   | per role |
| Activate              |  ✅   |  ✅   |    ✅     |    ❌    |    ❌    | per role |
| **Templates**         |       |       |           |          |          |          |
| Create/edit           |  ✅   |  ✅   |    ✅     |    ✅    |   view   | per role |
| Brand kit             |  ✅   |  ✅   |    ✅     |    ✅    |   view   | per role |
| **Forms / Pop-ups**   |       |       |           |          |          |          |
| Create/edit           |  ✅   |  ✅   |    ✅     |    ✅    |   view   | per role |
| Publish               |  ✅   |  ✅   |    ✅     | per role |    ❌    | per role |
| **Reports**           |       |       |           |          |          |          |
| View                  |  ✅   |  ✅   |    ✅     |   view   |    ✅    | per role |
| Export                |  ✅   |  ✅   | per role  |    ❌    | per role | per role |
| **Integrations**      |       |       |           |          |          |          |
| Manage                |  ✅   |  ✅   | per role  |    ❌    |    ❌    | per role |
| **API**               |       |       |           |          |          |          |
| Manage API keys       |  ✅   |  ✅   |    ❌     |    ❌    |    ❌    | per role |
| **Domains**           |       |       |           |          |          |          |
| Domain authentication |  ✅   |  ✅   |    ❌     |    ❌    |    ❌    | per role |

### 4.4 User invitation flow

```
Owner/Admin: Settings → Users
   ↓
+ Add user
   ↓
Email + Personal details
   ↓
Role selection:
- Default role (Admin, Marketing, Designer, Viewer)
- OR Custom role
   ↓
Send invitation
   ↓
User receives email
   ↓
User clicks activation link
   ↓
Sets password
   ↓
[Active user]
```

### 4.5 Limits per plan

- **User seats vary per plan**
- **Free plan:** limited users (typically 1-2)
- **Paid plans:** scaling with tier
- **Agency plans:** more users + sub-accounts

---

## 5. Agency / Sub-accounts flow

### 5.1 Agency model

Per oficiální pricing page:
_"Do you manage emailing for multiple clients? With us, you can have several sub-accounts under one agency account. Plus, you'll earn a commission for each new customer in your agency account."_

### 5.2 Architecture

```
Master Agency Account
├── Agency owner (manages all)
├── Agency team users (multi-account access)
└── Sub-accounts:
    ├── Client A
    │   ├── Their own list, contacts
    │   ├── Their campaigns, automations
    │   ├── Their settings, brand kit
    │   ├── Isolated billing (can be at agency level OR client)
    │   ├── Client-specific users (optional)
    │   └── Agency users with cross-access
    │
    ├── Client B
    │   └── ...
    │
    └── Client C
        └── ...
```

### 5.3 Agency setup flow

```
Agency contacts Ecomail sales
   ↓
Agency contract setup:
- Master agency account
- Pricing model agreed
- Commission structure agreed
   ↓
Agency Owner credentials
   ↓
Setup workflow:
- Configure master account
- Set commission preferences
- Setup agency team users
   ↓
Onboard first client:
- Create sub-account
- Configure client settings
- Migrate client data (if applicable)
- Setup integrations (Shoptet, atd.)
- Invite client users (if applicable)
- Activate sub-account
   ↓
[Sub-account live]
   ↓
Repeat for additional clients
```

### 5.4 Cross-account navigation

```
Agency user logs in
   ↓
Sees account selector
   ↓
Choose:
- Master agency view (overview)
- Specific client sub-account
   ↓
UI loads in selected account context
   ↓
Switch between accounts via top menu
```

### 5.5 Agency commission

```
Agency adds new customer to sub-account:
- New e-shop client signs up via agency
- Agency configures, manages
   ↓
Ecomail commission system:
- Agency earns commission per new customer
- Commission terms per agreement
- Tracked v master account
   ↓
Periodic payout to agency
```

### 5.6 Client transparency

```
Sub-account visible to:
- Agency master users (full access)
- Client users (if invited, limited per role)
   ↓
**Client can be given own login** if desired:
- Access only their sub-account
- Per role permissions
- Cannot see other clients
```

### 5.7 Agency reports

```
Master agency view:
- Aggregate metrics across all clients
- Per-client performance
- Commission tracking
- Subscriber totals across portfolio
- Revenue per client (their billing)
```

### 5.8 Use cases

- **Marketing agencies** managing multiple e-shops
- **Freelance email marketers** s portfolio
- **Reseller programs** with bundled service
- **Multi-brand companies** (corporate using agency model)

---

## 6. Account Owner flow

### 6.1 Account Owner responsibilities

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

### 6.2 Daily Owner workflow

```
Login → Dashboard
   ↓
Account overview:
- Today's campaign performance
- Active automation count
- Total subscribers vs. plan limit
- Recent form submissions
- Integration health
- Failed sends / bounces alert
   ↓
Strategic activities:
- Plan tier vs. growth
- Add-on usage review
- Team performance audit
- ROI tracking
```

### 6.3 Billing management

```
Owner: Settings → Plan & Billing (or similar)
   ↓
View:
- Current plan + tier
- Subscriber count vs. limit
- Email sends vs. limit (monthly)
- Next billing date
- Payment method
- Invoice history
- Add-ons (SMS credits)
   ↓
Actions:
- Change plan (upgrade/downgrade)
- Update payment method
- Apply discount codes (non-profit 50%)
- Billing frequency (monthly/annual)
- Download invoices (CZ fakturу)
- VAT/DPH adjustments
```

### 6.4 Close account

```
Owner: Settings → Account → Cancel / Close
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

### 6.5 Ownership transfer

```
NOT explicit self-service workflow:
   ↓
Methods:
A) Add another user as Admin → transfer responsibilities
B) Contact Ecomail support for formal transfer
   ↓
Support assists s ownership change
- Identity verification
- Authorization
- Backend processing
```

---

## 7. Marketing user flow

### 7.1 Daily Marketing workflow

```
Login → Dashboard (filtered per permissions)
   ↓
Activities:
- Build segments
- Create campaigns
- Schedule sends
- Build / monitor automations
- Manage forms + popups
- Update templates
- Review reports
- Deploy pre-made scenarios
```

### 7.2 Create campaign

```
Campaigns → Vytvořit kampaň
   ↓
Step 1: Type
- Standard newsletter
- A/B test
- Automation email (from workflow)
   ↓
Step 2: Setup
- Název (internal)
- Předmět emailu
- Preheader
- Odesílatel (from name, verified email)
- Reply-to
- UTM parameters
   ↓
Step 3: Příjemci
- Vybrat lists / segments
- Exclude lists
   ↓
Step 4: Design
- Drag-drop editor
- Template selection
- Brand kit application
- Personalization tokens
- Product feed blocks (e-commerce)
   ↓
Step 5: Test
- Preview (desktop, mobile, dark mode)
- Send test
   ↓
Step 6: Send / Schedule
- Odeslat ihned
- Naplánovat na specifický čas
- Time-zone send
   ↓
Confirm
```

### 7.3 Build automation

```
Automace → Vytvořit automaci
   ↓
A) From scratch
B) Use pre-made scenario template
   ↓
A) From scratch:
   - Choose trigger:
     - Subscribed to list
     - Tag added
     - Form submitted
     - Custom field updated
     - Order placed (e-commerce)
     - Cart abandoned
     - Birthday
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
   ↓
   - Configure each node
   ↓
   - Test
   ↓
   - Activate

B) Pre-made scenario:
   - Browse scenarios library
   - Choose template (welcome series, abandoned cart, atd.)
   - Customize:
     - Content
     - Timing
     - Audience
   - Test
   - Activate
```

### 7.4 Segment building

```
Kontakty → Segmenty → Nový segment
   ↓
Add conditions:
- Contact data (custom fields, tags)
- Email engagement (opened/clicked specific campaigns)
- Site activity
- E-commerce data (orders, AOV, categories)
- Date conditions
- Geographic
   ↓
Combine s AND/OR/NOT
   ↓
Preview segment size
   ↓
Save
   ↓
[Dynamic segment]
```

### 7.5 Form / Pop-up management

```
Formuláře → Nový formulář
   ↓
Choose type:
- Embedded
- Pop-up
- Slider
- Sticky bar
- Floating
   ↓
Configure:
- Fields (text, email, dropdown, checkbox)
- GDPR consent
- Captcha (anti-spam)
- Trigger conditions (time, scroll, exit)
- Audience targeting
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
Embed code OR live on site (via tracking script)
```

---

## 8. Designer user flow (custom role)

### 8.1 Use case

- **Specialized designer** role
- Content creation focus
- No send permissions typically
- No customer data sensitivity
- External agency designers

### 8.2 Daily Designer workflow

```
Login → Limited dashboard
   ↓
Activities:
- Create/edit templates
- Update brand kit
- Design new forms / popups
- Build campaign content (draft, not send)
- Manage image library
- Create saved blocks
   ↓
Cannot:
- Send campaigns
- Activate automations
- Access detailed contact data
- Change billing
- Manage users
```

### 8.3 Template work

```
Šablony → Nová šablona
   ↓
Choose:
- Start from blank
- From template library (150+)
- Duplicate existing
   ↓
Drag-drop builder:
- Add blocks
- Configure design
- Apply brand kit
- Add personalization tokens
- Add product feed blocks (e-commerce)
- Custom HTML if needed
   ↓
Save template
   ↓
[Template available pro marketing team]
```

### 8.4 Brand kit management

```
Brand kit → Edit
   ↓
Configure:
- Colors (primary, secondary, accent)
- Fonts (header, body)
- Logo variants
- Image library
- Saved blocks
- Email defaults (header, footer)
   ↓
Save
   ↓
[Apply across all templates]
```

---

## 9. Subscriber lifecycle

### 9.1 Subscription creation paths

#### A) Form submission

```
Visitor fills form (popup, embedded, sticky bar)
   ↓
Submit
   ↓
Ecomail:
- Validates email
- Duplicate check
- Spam check (basic)
- GDPR consent recorded
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
Ecomail sends confirmation email
   ↓
Subscriber clicks confirm
   ↓
IP + timestamp logged
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
Shoptet webhook → Ecomail
   ↓
Contact created with marketing consent flag
   ↓
Add to designated list (typically "Shoptet customers")
   ↓
Tag: "Source: Shoptet"
   ↓
Workflow trigger (welcome new customer)
```

#### D) Shopify / other e-commerce sync

Same as Shoptet but via different integration.

#### E) Manual import (CSV)

```
Admin: Kontakty → Import
   ↓
CSV upload
   ↓
Field mapping
   ↓
Choose:
- List destination
- Skip duplicates option
- Update existing
- Tag with import source
- Confirm consent
   ↓
Validation
   ↓
**Spam emails detection limited** (per G2 critique)
   ↓
Import processed
   ↓
[Contacts in account]
```

#### F) API

```
External system POST /subscribers
   ↓
Ecomail creates / updates
   ↓
Add to lists, tags
   ↓
Trigger workflows
```

#### G) Facebook Lead Ads

```
Facebook Ads campaign creates lead
   ↓
Lead Ads sync → Ecomail
   ↓
Contact created
   ↓
Add to specified list
   ↓
Workflow trigger
```

### 9.2 Subscriber status

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

### 9.3 Engagement tracking

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
   ↓
Site tracking (if active):
- Page views
- Time on site
- Custom events
```

### 9.4 Preference center

```
Email footer: "Změnit nastavení" link
   ↓
Ecomail-hosted preference page
   ↓
Subscriber sees:
- Subscribed lists (toggles)
- Personal info (editable)
- Master unsubscribe
   ↓
Update
   ↓
Profile updated
```

### 9.5 Unsubscribe

```
Subscriber clicks Unsubscribe
   ↓
Ecomail-hosted unsubscribe page
   ↓
Options:
- Unsubscribe from list
- Unsubscribe from all
- Optional reason survey
   ↓
Status: Unsubscribed
   ↓
Data retained per GDPR
   ↓
"Unsubscribed" workflow trigger
```

### 9.6 Bounce + spam handling

#### Hard bounce

```
ISP 5xx
   ↓
Status: Bounced
   ↓
Auto-suppression
```

#### Spam complaint

```
ISP FBL → Ecomail
   ↓
Status: Spam complaint
   ↓
Auto-suppression
   ↓
Sender reputation tracking
```

---

## 10. Email lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│  1. USER drafts campaign / automation email                     │
│     - Audience selection (lists, segments)                      │
│     - Configure trigger (for automation)                        │
│     - Design + personalize                                      │
│                            │                                    │
│                            ▼                                    │
│  2. PRE-SEND CHECKS                                             │
│     - Sender verified?                                          │
│     - Domain DKIM/SPF/DMARC?                                    │
│     - Audience valid?                                           │
│     - Plan limits OK?                                           │
│     - GDPR compliance footer                                    │
│                            │                                    │
│                            ▼                                    │
│  3. SEND TIME                                                   │
│     - Odeslat ihned                                             │
│     - Naplánovat                                                │
│     - Time-zone send                                            │
│                            │                                    │
│                            ▼                                    │
│  4. PER-RECIPIENT GENERATION                                    │
│     - Personalization tokens resolved                           │
│     - Dynamic content evaluated                                 │
│     - Product feed blocks rendered                              │
│     - Tracking pixels embedded                                  │
│     - Click trackers wrapped                                    │
│                            │                                    │
│                            ▼                                    │
│  5. SMTP SEND from Ecomail infrastructure (EU)                  │
│     - DKIM signed                                               │
│     - SPF compliant                                             │
│     - DMARC aligned                                             │
│     - List-Unsubscribe RFC 8058                                 │
│                            │                                    │
│                            ▼                                    │
│  6. ISP RECEIVES                                                │
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
│     - Click → Ecomail redirect → tracked                        │
│     - Site tracker fires on landing page                        │
│                            │                                    │
│                            ▼                                    │
│  9. PROFILE UPDATE                                              │
│     - Engagement metrics                                        │
│     - Segments re-evaluated                                     │
│                            │                                    │
│                            ▼                                    │
│ 10. WORKFLOW TRIGGERS                                           │
│     - "Opened" / "Clicked" events fire if configured            │
│                            │                                    │
│                            ▼                                    │
│ 11. REPORTING                                                   │
│     - Real-time stats (s některým zpožděním)                    │
│     - Revenue attribution (e-commerce)                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. Automation execution model

### 11.1 Automation activation

```
Marketer builds automation
   ↓
Test mode (preview as contact)
   ↓
Activate
   ↓
Ecomail validation:
- All triggers configured
- All actions valid
- No broken paths
   ↓
[Active]
   ↓
Engine evaluates continuously
```

### 11.2 Trigger evaluation

```
Event occurs (subscription, order, tag, atd.)
   ↓
Ecomail evaluates active automations
   ↓
For each matching workflow:
- Check entry conditions
- Check if subscriber already in workflow
- Check re-entry settings
- Add subscriber to workflow execution
```

### 11.3 Per-subscriber execution

```
Subscriber enters at trigger
   ↓
Each node processed sequentially:
- Send email → SMTP queue
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

### 11.4 Re-entry rules

```
Per workflow:
- Run multiple times option
- Run once per contact
- Minimum gap between re-entries
   ↓
Useful for:
- Welcome series: Run once
- Birthday: Yearly recurring
- Browse abandonment: Multiple times
```

### 11.5 Workflow analytics

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

## 12. Pre-made scenario deployment

### 12.1 Scenario library

```
Automace → Pre-made scenarios
   ↓
Browse library:
- Welcome series
- Discount on first purchase
- Abandoned cart
- Birthday automation
- Reward for purchase
- eBook download
- Reactivation campaign
- Last viewed product
- Browse abandonment
- Post-purchase upsell
```

### 12.2 Scenario deployment flow

```
Select scenario template
   ↓
Click "Use template"
   ↓
Scenario downloaded into account
   ↓
Customize:
- Edit email templates (brand voice)
- Adjust timing
- Configure audience (list/segment)
- Configure goal
- Tweak conditions
   ↓
Test mode
   ↓
Activate
   ↓
[Live workflow]
```

### 12.3 Common scenarios detail

#### Welcome series

```
Trigger: Subscribed to "Newsletter" list
   ↓
Wait 1 hour
   ↓
Send Email 1: Welcome + brand story
   ↓
Wait 3 days
   ↓
Send Email 2: Free resource OR product highlight
   ↓
Wait 5 days
   ↓
Goal: Made first purchase?
   YES → Exit (success)
   NO → Send Email 3: Discount incentive
   ↓
Wait 7 days
   ↓
Exit
```

#### Abandoned cart (Shoptet integrated)

```
Trigger: Cart abandoned (>30 min, from Shoptet webhook)
   ↓
Wait 1 hour
   ↓
Send Email 1: "Zapomněl jsi v košíku?"
- Dynamic cart contents (from Shoptet)
- Direct checkout link
   ↓
Wait 24 hours
   ↓
Condition: Purchased?
   YES → Exit
   NO → Send Email 2: 10% sleva
   ↓
Wait 48 hours
   ↓
Condition: Purchased?
   YES → Exit
   NO → Send SMS (if opted in): Final reminder
   ↓
Exit
```

#### Birthday automation

```
Trigger: Birthday date approaching (X days before)
   ↓
Send Email: "Šťastné narozeniny + dárek"
   ↓
Wait 7 days
   ↓
Condition: Used birthday discount?
   YES → Add tag "Birthday Promoter"
   NO → Send reminder
   ↓
Exit
```

---

## 13. Forms & Pop-ups flow

### 13.1 Form creation

```
Marketer / Designer: Formuláře → Nový formulář
   ↓
Type selection:
- Embedded
- Pop-up
- Slider
- Sticky bar
- Floating
   ↓
Configure:
- Title + description
- Fields (text, email, phone, dropdown, checkbox)
- GDPR consent field (required for CZ)
- Captcha (anti-spam)
- Submit button text
- Success / thank you message
   ↓
Trigger conditions (popup):
- Time on page
- Scroll depth
- Exit intent
- URL targeting
- Frequency caps
   ↓
Design:
- Visual builder
- Brand colors / fonts
- Custom CSS option
   ↓
Connect:
- Default list
- Tags on submit
- Automation trigger
   ↓
Save + Publish
```

### 13.2 Form deployment

```
Embed form na website:
A) Embed code (HTML/JS) – paste into website
B) Tracking script enabled → pop-ups auto-render
C) Shoptet integration → form code provided
D) WordPress plugin → form shortcode
```

### 13.3 Submission flow

```
Visitor fills form
   ↓
Submit
   ↓
Ecomail receives via JS:
- Validate fields
- Captcha check
- Duplicate email check
- GDPR consent confirmation
   ↓
Subscriber created or updated:
- Add to specified list
- Apply tags
- Trigger workflow
   ↓
Status: Pending (double opt-in) OR Active
   ↓
If double opt-in:
   - Confirmation email sent
   - User clicks confirm
   - Status: Active
   ↓
Welcome workflow if configured
```

### 13.4 Facebook Lead Ads sync

```
Facebook Ads campaign with Lead Ads form
   ↓
Lead submits Facebook form
   ↓
Facebook → Ecomail webhook
   ↓
Lead added to Ecomail:
- Default list
- Tags from Facebook campaign
- Automation trigger
   ↓
Welcome flow begins
```

---

## 14. Shoptet integration flow (deep)

**Shoptet integration je klíčový pro Ecomail v CZ kontextu.**

### 14.1 Installation

```
Shoptet admin: App Store
   ↓
Search "Ecomail"
   ↓
Install Ecomail app
   ↓
Authorize:
- Shoptet → Ecomail OAuth
- Permissions granted
   ↓
Ecomail configuration:
- Default list for new customers
- Sync historical data toggle (initial backfill)
- Custom field mapping
- Tag rules (e.g. "Source: Shoptet", "VIP" if AOV > threshold)
   ↓
Tracking script auto-installed na Shoptet template
   ↓
Webhook configuration (automatic)
   ↓
Initial sync (30 min - hours):
- Customers → contacts
- Orders → events
- Products → catalog
- Cart events
- Customer LTV calculated
   ↓
[Integration live, real-time sync]
```

### 14.2 Continuous data flow

```
Shoptet event occurs
   ↓
Webhook → Ecomail (within seconds)
   ↓
Ecomail processes:
- Contact create/update
- Order record
- Cart state update
- Custom event recording
   ↓
Profile updates:
- Activity timeline
- Engagement metrics
- Segments re-evaluated
   ↓
Automation triggers fire (if match)
```

### 14.3 Data synced

#### Customer data

- Email (primary key)
- Jméno, příjmení
- Telefon
- Adresa
- Marketing consent
- Registration date
- Last login

#### Order data

- Order ID
- Date
- Status
- Total value (CZK / EUR)
- Items:
  - Product ID
  - Quantity
  - Price
- Shipping method
- Payment method

#### Product data

- Product ID
- Name (CZ + other languages)
- Category
- Brand
- Price
- Stock status
- Image URL
- Description
- Custom attributes

#### Cart events

- Cart abandoned (>30 min default)
- Cart items dynamically
- Cart total
- Updated cart events

#### Browse data (s tracking script)

- Page views
- Product views
- Search queries
- Category browses
- Session data

### 14.4 Abandoned cart specific flow

```
Customer adds to cart na Shoptet
   ↓
Shoptet tracks cart state
   ↓
After 30 min without checkout → cart abandoned event
   ↓
Webhook → Ecomail
   ↓
Workflow trigger: "Abandoned cart"
   ↓
Pre-made scenario activates:

Wait 1h
   ↓
Send Email 1:
- "Zapomněl jsi v košíku!"
- Dynamic cart contents block (from Shoptet feed)
- Product images + prices
- Direct checkout link
   ↓
Wait 24h
   ↓
Condition: Purchased? (check Shoptet order data)
   YES → Goal achieved (exit)
   NO → Send Email 2 (10% discount)
   ↓
Wait 48h
   ↓
Condition: Purchased?
   YES → Goal
   NO → Send SMS (if opted in)
   ↓
Exit
```

### 14.5 Revenue attribution

```
Email send recorded
   ↓
Subscriber clicks email link
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

### 14.6 Known issue: spam imports

Per G2 review:
_"We encountered an issue with spam emails that were collected through Shoptet and ended up in Ecomail. Although you could make educated guesses about which emails were most likely spam, Ecomail did not recognize them automatically. As a result, we had to manually review the entire database and remove the fake email addresses ourselves."_

⚠️ Doporučení:

- Pravidelná list hygiene
- Manual review po initial sync
- Použít Shoptet's own spam filtering before sync
- Anti-bot captcha na Shoptet forms

---

## 15. Shopify / WooCommerce flow

### 15.1 Shopify integration

```
Shopify admin → Apps → Install Ecomail
   ↓
OAuth authorization
   ↓
Configure:
- Default customer list
- Sync historical data
- Field mapping
- Tag rules
   ↓
Webhooks auto-subscribed:
- customers/create, customers/update
- orders/create, orders/updated, orders/cancelled
- carts/update (abandoned)
   ↓
Tracking script provided for theme install
   ↓
Initial sync
   ↓
[Live integration]
```

### 15.2 WooCommerce integration

```
WordPress admin → Plugins → Install Ecomail for WordPress
   ↓
Activate plugin
   ↓
Configure:
- API key
- Default list
- WooCommerce integration toggle
   ↓
WooCommerce orders sync → Ecomail
   ↓
Tracking script auto-included
   ↓
[Integration live]
```

### 15.3 Similarities cross-platform

All e-commerce integrations work similarly:

- OAuth or API key auth
- Initial sync customers + orders
- Continuous webhook updates
- Tracking script for browse data
- Product feed for recommendations
- Abandoned cart workflow

---

## 16. Facebook & Instagram channel flow

### 16.1 Setup

```
Marketing user / Admin: Integrace → Facebook
   ↓
OAuth connect Facebook Business Manager
   ↓
Authorize:
- Custom Audiences sync
- Lead Ads sync
- Pixel access (optional)
   ↓
Configure:
- Default lists for Lead Ads
- Tag mapping per campaign
- Auto-sync segments to Custom Audiences
   ↓
[Active integration]
```

### 16.2 Custom Audiences sync flow

```
Marketer creates segment v Ecomail
   ↓
Enable "Sync to Facebook Custom Audiences"
   ↓
Ecomail pushes:
- Hashed emails to Facebook
- Custom Audience created/updated
- Segment changes auto-sync
   ↓
Marketing v Facebook Ads:
- Target this Custom Audience
- Lookalike audience based on it
- Exclude (suppress existing customers from acquisition)
```

### 16.3 Lead Ads flow

```
Facebook Ads campaign s Lead Ads
   ↓
Lead submits Facebook form
   ↓
Facebook → Ecomail webhook
   ↓
Ecomail receives lead:
- Email + form fields
- Tag with Facebook source
- Add to specified list
   ↓
Automation trigger fires (welcome flow)
   ↓
Email sent within minutes
```

### 16.4 Cross-channel orchestration

Per Cuspera review:
_"Ads can be triggered by various actions, such as email opens, SMS messages, and website visits"_

```
Customer opens marketing email
   ↓
Ecomail records open event
   ↓
Ecomail pushes email-engaged to Facebook Custom Audience
   ↓
Facebook Ads campaign retargets s display ad
   ↓
Cross-channel reinforcement
```

---

## 17. SMS flow

### 17.1 SMS setup

```
Admin: Integrace → SMS
   ↓
Activate SMS module
   ↓
Configure:
- Sender ID (country-specific)
- Pre-paid credits
- Default settings (quiet hours, etc.)
- STOP keyword handling
   ↓
Buy SMS credits (per country pricing)
   ↓
[SMS module ready]
```

### 17.2 SMS campaign

```
Kampaně → SMS kampaň
   ↓
Configure:
- Sender ID
- Recipients (segment / list)
- Message text (160 chars per SMS typically)
- Link tracking (shortened URLs)
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

### 17.3 SMS in automation

```
Automation workflow:
- Add "Send SMS" node
- Configure message + recipient
- Insert merge fields ({JMENO}, etc.)
- Set as part of multi-channel sequence
```

### 17.4 Compliance

- Opt-in required for SMS
- STOP keyword handling automatic
- Quiet hours enforced
- Sender ID country-specific
- Pre-paid credits prevent surprises

---

## 18. Transactional email flow

### 18.1 Setup

```
Admin: Integrace → Transactional API
   ↓
Generate API key for transactional
   ↓
Configure default sender
   ↓
Create templates with variables
   ↓
[API ready]
```

### 18.2 Transactional send via API

```
Application:
   POST /transactional/send
   Headers:
     Authorization: Bearer {api_key}
   Body:
     - to (recipient)
     - template_id (or HTML)
     - variables (merge data)
     - subject
   ↓
Ecomail:
- Validates auth
- Renders template
- Tracks open + click
- Sends via infrastructure
   ↓
Recipient receives email
   ↓
Logged in contact activity timeline (if matched)
```

### 18.3 Use cases

- Order confirmations
- Shipping notifications
- Password resets
- Account verifications
- Discount codes delivery

### 18.4 Limitations

- **Less feature-rich** than dedicated transactional (Postmark, Mailgun)
- **Shared infrastructure** with marketing typically
- **Basic API**
- Sufficient for SMB use cases

---

## 19. API & Integration flow

### 19.1 API key creation

```
Admin: Settings → API
   ↓
Generate API key
   ↓
Name + scope
   ↓
**Key displayed** – copy + secure
   ↓
[API key active]
```

### 19.2 API request

```
External system:
   POST https://api2.ecomailapp.cz/lists/{list_id}/subscribe
   Headers:
     Authorization: Bearer {api_key}
   Body: { email, name, fields }
   ↓
Ecomail:
- Validates auth
- Rate limit check
- Validates payload
   ↓
Response 201
   ↓
Subscriber created
   ↓
Workflow triggers if applicable
```

### 19.3 API endpoints (v2)

| Resource                  | Operace                |
| ------------------------- | ---------------------- |
| `/lists`                  | CRUD lists             |
| `/lists/{id}/subscribe`   | Add subscriber to list |
| `/lists/{id}/unsubscribe` | Remove from list       |
| `/subscribers`            | Subscriber management  |
| `/transactional`          | Send transactional     |
| `/automations`            | Workflow data          |
| `/campaigns`              | Campaign data          |
| `/templates`              | Template management    |

### 19.4 Webhooks

- Subscriber events
- Campaign events
- Order events (e-commerce)
- Form submissions
- Real-time push

### 19.5 Native integrations

#### CZ-specific

- **Shoptet** (deep, dominant)

#### Global e-commerce

- **Shopify** + Shopify Plus
- **WooCommerce**
- **Magento** (Adobe Commerce)
- **BigCommerce**
- **OpenCart**
- **Ecwid**
- **PrestaShop**

#### CMS

- **WordPress** plugin

#### iPaaS

- **Zapier** (5 000+ apps)
- **Make (Integromat)**

#### Forms (via Zapier)

- Typeform, Jotform, Google Forms

#### Social

- **Facebook Ads** (Lead Ads, Custom Audiences)
- **Instagram Ads**

#### Analytics

- Google Analytics
- Facebook Pixel

### 19.6 Plugins

- **Shoptet** (deep, mandatory for CZ)
- **WordPress + WooCommerce**
- **Shopify**

### 19.7 Embed library

- **JS tracking script** (custom events)
- **Form embed code**
- **Pop-up auto-render** (s tracking script)

---

## 20. GDPR & Compliance flow

### 20.1 EU hosting

- Servers v EU (Czech republic + EU region)
- GDPR-friendly default
- ÚOOÚ (CZ data protection authority) compliant
- DPA available

### 20.2 GDPR features

- **GDPR consent fields** v forms
- **Double opt-in** default option
- **Audit trail** per consent (IP, timestamp)
- **Right to Be Forgotten:**
  - UI: subscriber → Delete permanently
  - API: DELETE endpoint
- **Data export** per subscriber
- **DPA available** electronically

### 20.3 Consent tracking

Per subscriber:

- Email opt-in timestamp + IP + source
- Per-list consent
- GDPR consent fields
- Double opt-in audit
- Per-channel consent (email, SMS)
- Versioned consent text

### 20.4 Right to be Forgotten

```
Subscriber requests deletion (CZ: "Žádost o smazání")
   ↓
Method A: Admin
- Subscriber detail → Delete permanently
- Confirmation
- Delete

Method B: API
- DELETE /subscribers/{id}

Method C: Self-service
- Preference center → Delete account option
- Email verification
- Submit
   ↓
Ecomail:
- Removes personal data
- Anonymizes events
- Auto-suppression
- Audit log entry
- Email confirmation (optional)
```

### 20.5 Compliance certifications

- **GDPR compliant**
- **CZ ÚOOÚ** registered
- **CAN-SPAM** (US)
- **CASL** (Canada)
- **CCPA** (California - limited)

### 20.6 Security

- **2FA** (TOTP)
- **API key per user**
- **Encryption** at rest + in transit
- **Role-based access**
- **Audit logs** (limited)
- **EU data residency**

---

## 21. Datová mapa: co vidí kdo

| Data                  |    Owner    |    Admin    | Marketing | Designer |  Viewer  |  Custom  |  Subscriber   |    API    |
| --------------------- | :---------: | :---------: | :-------: | :------: | :------: | :------: | :-----------: | :-------: |
| Account settings      |     ✅      |     ✅      |    ❌     |    ❌    |    ❌    | per role |      ❌       | per scope |
| Billing               |     ✅      |     ❌      |    ❌     |    ❌    |    ❌    | per role |      ❌       | per scope |
| User management       |     ✅      |     ✅      |    ❌     |    ❌    |    ❌    | per role |      ❌       | per scope |
| Domains               |     ✅      |     ✅      |    ❌     |    ❌    |    ❌    | per role |      ❌       | per scope |
| All subscribers       |     ✅      |     ✅      |    ✅     | limited  |   view   | per role |   jen sebe    |    ✅     |
| Edit subscribers      |     ✅      |     ✅      |    ✅     |    ❌    |    ❌    | per role |      ❌       |    ✅     |
| Export subscribers    |     ✅      |     ✅      | per role  |    ❌    |    ❌    | per role |    request    | per scope |
| Lists                 |     ✅      |     ✅      |    ✅     |    ❌    |   view   | per role |       –       |    ✅     |
| Segments              |     ✅      |     ✅      |    ✅     |    ❌    |   view   | per role |       –       |    ✅     |
| Tags                  |     ✅      |     ✅      |    ✅     |    ❌    |   view   | per role |       –       |    ✅     |
| Campaigns             |     ✅      |     ✅      |    ✅     |    ✅    |   view   | per role | jen co dostal |    ✅     |
| Send campaigns        |     ✅      |     ✅      |    ✅     |    ❌    |    ❌    | per role |      ❌       |    ✅     |
| Automations           |     ✅      |     ✅      |    ✅     |    ❌    |   view   | per role |      ❌       |    ✅     |
| Pre-made scenarios    |     ✅      |     ✅      |    ✅     |    ❌    |   view   | per role |       –       |    ✅     |
| Templates             |     ✅      |     ✅      |    ✅     |    ✅    |   view   | per role |       –       |    ✅     |
| Brand kit             |     ✅      |     ✅      |    ✅     |    ✅    |   view   | per role |       –       | per scope |
| Forms / Pop-ups       |     ✅      |     ✅      |    ✅     |    ✅    |   view   | per role |    submit     | per scope |
| SMS module            |     ✅      |     ✅      |    ✅     |    ❌    |    ❌    | per role |       –       | per scope |
| Facebook integration  |     ✅      |     ✅      | per role  |    ❌    |    ❌    | per role |       –       | per scope |
| Transactional         |     ✅      |     ✅      | per role  |    ❌    |    ❌    | per role |       –       |    ✅     |
| Reports               |     ✅      |     ✅      |    ✅     |   view   |    ✅    | per role |      ❌       |    ✅     |
| Integrations          |     ✅      |     ✅      | per role  |    ❌    |    ❌    | per role |       –       | per scope |
| API keys              |     ✅      |     ✅      |    ❌     |    ❌    |    ❌    | per role |      ❌       |     –     |
| Sub-accounts (agency) | ✅ (master) | ✅ (master) | per role  |    ❌    | per role | per role |       –       | per scope |
| GDPR delete           |     ✅      |     ✅      | per role  |    ❌    |    ❌    | per role |    request    | per scope |

---

## 22. Známé úzkoprofilové místa

### 22.1 Permission model

- **Multiple user roles** s tailored permissions, ale **less granular** než ActiveCampaign groups
- **No SSO/SAML** typically (vs. enterprise platforms)
- **No detailed audit logs** outside premium
- **Per-list access control** limited

### 22.2 Free plan limits

- **Free plan up to 40 000 contacts** generous, ale:
- **Some features locked** for paid tiers
- **Branding** v emailech (Ecomail logo) on Free
- **Limited support** maybe (typical pattern)

### 22.3 Pricing variations

- **EUR + CZK** pricing varies
- **Plan tiers** ne always consistent across sources
- **Pricing transparency** could be better
- **Add-on costs** stack (SMS, dedicated IP)

### 22.4 UI/UX issues

Per reviews:

- _"WYSIWYG editor problem with it - I didn't get what I saw"_ (older)
- _"Statistics can take times to show up after sending"_
- _"No easier way to manage uploaded images"_
- _"Cannot re-order or modify saved blocks easily"_

### 22.5 List hygiene gap

- **Spam emails imported z Shoptet NEJSOU automatically detected**
- Manual review required
- Anti-bot v původu doporučeno

### 22.6 Reporting delays

- Real-time stats sometimes delayed
- Not always immediate dashboard update

### 22.7 Automation depth

- **Basic to mid-level** automation
- **Less sophisticated** než ActiveCampaign / HubSpot
- **No multi-trigger** workflows (typical)
- **No advanced branching** like ActiveCampaign Pro
- **No conditional content** (per recipient v same email)
- **No predictive sending** AI per recipient

### 22.8 Missing advanced features

- **No webinars** built-in (vs. GetResponse)
- **No online courses** (vs. GetResponse)
- **No landing page builder** (some plans? – check current)
- **No paid newsletters** subscription
- **No digital products** sale
- **No deep CRM** (deals/pipelines)
- **No predictive analytics** (CLV, churn)
- **No autonomous AI agents**

### 22.9 Product recommendations limited

- **Basic recommendations** (last viewed, bought)
- **Not deep ML** like Klaviyo Predict / Emarsys Predict
- **Sufficient for SMB** but not enterprise

### 22.10 International scaling

- **Less marketing v US/UK/DE** markets
- **Fewer integrations** than ActiveCampaign 970+ or Mailchimp ecosystem
- **CZ/CEE region focus**
- **Documentation** primarily Czech + English

### 22.11 Mobile app

- **Limited mobile features** vs. desktop
- Most operations require desktop

### 22.12 Migration tools

- **Manual recreation** typical
- **Templates rebuild** required
- **Automations** must be re-built
- Limited automated migration

### 22.13 Designer / agency model

- **Sub-accounts dostupné** but configuration complex
- **Commission tracking** transparency varies
- **Cross-client reporting** limited
- **Bulk operations** across sub-accounts limited

### 22.14 SSO + Enterprise gaps

- **No SSO/SAML** standard
- **No SCIM provisioning**
- **No HIPAA support**
- **Limited audit logs**
- **No sandbox accounts**

---

## 23. Doporučení pro design vlastních procesů

Pokud Ecomail používáte v týmu, doporučujeme:

1. **Domain authentication day 1** – DKIM + SPF + DMARC + branded tracking domain
2. **Sender verification** – email + domain
3. **Brand kit setup early** – konzistentní design
4. **GDPR consent fields** ve všech forms (CZ povinnost)
5. **Double opt-in default** – better deliverability + compliance
6. **Custom field strategy** – plan upfront, avoid bloat
7. **Tag taxonomy** – flat structure s prefixy (Source:, Status:, Behavior:)
8. **Shoptet integration** (pokud CZ e-shop) – plně využít
9. **Spam list hygiene** – manual review after Shoptet sync
10. **Pre-made scenarios** – start s welcome series + abandoned cart
11. **Test profile** dedicated pro QA
12. **Czech support** využívat – fast Czech responses
13. **Pravidelný list cleanup** – inactive subscribers (cost optimization)
14. **A/B test culture** – subject lines, content, send times
15. **Tracking script install** day 1 – behavior data foundation
16. **Facebook integration** – Custom Audiences sync pro cross-channel
17. **Reports check delay** – verify after few hours, not minutes
18. **Image management** – external CDN if heavy use (workaround limitations)
19. **Saved blocks** strategy – build reusable library
20. **Sub-account model** pro agencies – plan structure upfront
21. **Custom roles** – build per-job-function
22. **Backup strategy** – periodic export contacts + template HTML
23. **Migration plan** – if scaling beyond Ecomail capabilities

---

_Dokument zpracován z oficiálních zdrojů ecomail.app, ecomail.cz, support.ecomail.app a praktických zdrojů (G2, Capterra, GetApp, SoftwareAdvice, Research.com, Gartner Peer Insights, Cuspera). Pro nejaktuálnější detaily je nutný engagement s Ecomail support/sales teamem._
