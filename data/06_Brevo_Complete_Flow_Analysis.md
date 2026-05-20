# Brevo – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v Brevo prochází data, lidé a akce – od Account Ownera přes specializované uživatele a sub-organizations až po koncového subscribera.

> Tento dokument doplňuje `05_Brevo_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** Brevo umí, tento popisuje, **kdo s tím interaguje a jak data tečou**.

> **Klíčové rozdíly od Mailchimpu a HubSpotu:**
>
> - **Owner-Manager-Restricted User** model (3 role, ne 5 jako Mailchimp ani 100+ permission sets jako HubSpot)
> - **Per-feature toggle permissions** od Business plánu (granulárnější než Mailchimp, méně než HubSpot Enterprise)
> - **Sub-organizations** (jen Enterprise) pro multi-brand / agency model
> - **Volume-based billing** mění úvahy o subscriber lifecycle (unsubscribe se nepočítá do billing!)
> - **EU-hosted data** mění některé compliance flow

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Role uživatelů (permission matrix)](#2-role-uživatelů)
3. [Account Owner flow](#3-account-owner-flow)
4. [Manager flow](#4-manager-flow)
5. [Restricted User flow](#5-restricted-user-flow)
6. [User Role flow (Enterprise předdefinované role)](#6-user-role-flow)
7. [Sub-organization flow (Enterprise)](#7-sub-organization-flow)
8. [Admin Account flow (multi-brand)](#8-admin-account-flow)
9. [Subscriber flow](#9-subscriber-flow)
10. [Email lifecycle](#10-email-lifecycle)
11. [Automation execution](#11-automation-execution)
12. [Transactional email flow](#12-transactional-flow)
13. [E-commerce flow](#13-e-commerce-flow)
14. [Sales Platform flow](#14-sales-flow)
15. [Conversations flow](#15-conversations-flow)
16. [API & Integration flow](#16-integration-flow)
17. [GDPR & Compliance flow](#17-gdpr-flow)
18. [Datová mapa: co vidí kdo](#18-datová-mapa)
19. [Známé úzkoprofilové místa](#19-úzkoprofilové-místa)

---

## 1. Mapa aktérů

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│         BREVO PLATFORM ECOSYSTEM                                   │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [Brevo Staff (Internal Support)]                                  │
│   ├─ Customer Success Manager (CSM, jen Enterprise)                │
│   ├─ Technical Support                                             │
│   └─ Trust & Safety                                                │
│           │ (limited debug access)                                 │
│           ▼                                                        │
│                                                                    │
│   ┌──────────────────────────────────────────┐                     │
│   │   Admin Account (jen Enterprise!)        │                     │
│   │   ├─ Admin User: Owner                   │                     │
│   │   ├─ Admin User: Manager (s perm)        │                     │
│   │   └─ Sub-organization User               │                     │
│   │      │                                   │                     │
│   │      ▼                                   │                     │
│   │   ┌────────────────────────────┐         │                     │
│   │   │ Sub-organization (Brand A) │         │                     │
│   │   ├────────────────────────────┤         │                     │
│   │   │ Sub-organization (Brand B) │         │                     │
│   │   ├────────────────────────────┤         │                     │
│   │   │ Sub-organization (Brand C) │         │                     │
│   │   └────────────────────────────┘         │                     │
│   └──────────────────┬───────────────────────┘                     │
│                      │                                             │
│   ┌──────────────────▼────────────────────┐                        │
│   │   Standard Account (non-Enterprise)   │                        │
│   │                                       │                        │
│   │   ├─ Owner (1 osoba)                  │◄── billing, all access │
│   │   ├─ Manager(s)                       │◄── most access         │
│   │   └─ Restricted User(s)               │◄── feature toggles     │
│   │       │                               │                        │
│   │       └── User Roles (Enterprise)     │                        │
│   │           – předdefinované permission sets                     │
│   │                                       │                        │
│   │   Marketing seats + Sales seats       │                        │
│   │   (samostatně účtováno)               │                        │
│   └──────────┬────────────────────────────┘                        │
│              │                                                     │
│              ▼                                                     │
│   [Contacts / Companies / Deals]                                   │
│       │                                                            │
│       ├─→ marketing emails, SMS, WhatsApp, push                    │
│       ├─→ transactional via API/SMTP                               │
│       ├─→ sales activities, deals, meetings                        │
│       ├─→ conversations (chat, social, email)                      │
│       └─→ phone calls (Brevo Phone)                                │
│              │                                                     │
│              ▼                                                     │
│   [ISPs, Browsers, Apps, Integrations]                             │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér                                  | Vstupní bod               | Co dělá                                   | Co vidí                        |
| -------------------------------------- | ------------------------- | ----------------------------------------- | ------------------------------ |
| **Account Owner**                      | Account creation          | Billing, all features, user management    | Vše                            |
| **Manager**                            | Pozvánka od Owner         | Marketing, Sales, contact mgmt, settings  | Většina (no billing)           |
| **Restricted User**                    | Pozvánka od Owner/Manager | Jen toggled features                      | Jen toggled                    |
| **User Role** (Enterprise)             | Předdefinovaný set        | Per role definition                       | Per role                       |
| **Sub-organization User** (Enterprise) | Pozvánka z Admin Account  | Pracuje v specific sub-org                | Per sub-org access             |
| **Admin User** (Enterprise)            | Pozvánka v Admin Account  | Multi-org management                      | Cross-org                      |
| **Marketing User**                     | Marketing seat            | Marketing tools                           | Marketing features             |
| **Sales User**                         | Sales seat                | Sales Platform                            | CRM + Sales                    |
| **Phone User**                         | Phone seat                | Brevo Phone                               | Phone interface                |
| **Contact / Subscriber**               | Form, import, integration | Otevírá email, klikne, manage preferences | Své emaily + preference center |
| **API Client**                         | API key                   | Cokoliv povolí scopes                     | Per scope                      |
| **Integration** (Shopify, WP)          | OAuth/plugin              | Sync data                                 | Per integration                |
| **Brevo Staff**                        | Interní                   | Debug/support s consentem                 | Limited                        |

---

## 2. Role uživatelů (permission matrix)

Brevo používá **3-tier role model** + **per-feature toggle permissions** (Business+) + **User Roles** (Enterprise).

### 2.1 Tři default role

#### A) Owner

- Top-level role
- **Vždy 1 per account**
- Plný přístup ke všemu
- **Nelze remove** ani **transfer ownership** přes UI – jen kontakt podpory
- Billing, user management, all features

#### B) Manager

- Plný přístup **kromě managing company profile**
- Může pozvat další users (pokud má permission)
- Marketing + Sales + Contact management

#### C) Restricted User

- Custom permission toggles per feature area
- **Pouze toggled features** dostupné
- Granular access na Business+ plan

### 2.2 Permission matrix

| Akce                                  |        Owner         | Manager  | Restricted User |
| ------------------------------------- | :------------------: | :------: | :-------------: |
| **Account / Billing**                 |                      |          |                 |
| Manage plan, billing, payment         |          ✅          | per perm |    per perm     |
| Manage company profile                |          ✅          |    ❌    |       ❌        |
| **User management**                   |                      |          |                 |
| Invite users                          |          ✅          | per perm |       ❌        |
| Edit user permissions                 |          ✅          | per perm |       ❌        |
| Revoke user access                    |          ✅          | per perm |       ❌        |
| Transfer ownership                    | ⚠️ (jen via support) |    ❌    |       ❌        |
| **API & Security**                    |                      |          |                 |
| Create API keys                       |          ✅          |    ✅    |    per perm     |
| Create SMTP keys                      |          ✅          |    ✅    |    per perm     |
| Manage authorized IPs                 |          ✅          |    ✅    |    per perm     |
| **Contacts**                          |                      |          |                 |
| View contacts                         |          ✅          |    ✅    |    per perm     |
| Create/edit/delete contacts           |          ✅          |    ✅    |    per perm     |
| Import contacts                       |          ✅          |    ✅    |    per perm     |
| Export contacts                       |          ✅          |    ✅    |    per perm     |
| Manage attributes & CRM fields        |          ✅          |    ✅    |    per perm     |
| **Lists & Segments**                  |                      |          |                 |
| Create/edit lists                     |          ✅          |    ✅    |    per perm     |
| Create segments                       |          ✅          |    ✅    |    per perm     |
| **Email Campaigns**                   |                      |          |                 |
| Create/edit/delete campaigns          |          ✅          |    ✅    |    per perm     |
| Send/schedule/suspend                 |          ✅          |    ✅    |    per perm     |
| **SMS Campaigns**                     |                      |          |                 |
| Create/edit/delete SMS                |          ✅          |    ✅    |    per perm     |
| Send/schedule                         |          ✅          |    ✅    |    per perm     |
| **Templates**                         |                      |          |                 |
| Create/edit/delete templates          |          ✅          |    ✅    |    per perm     |
| Share templates                       |          ✅          |    ✅    |    per perm     |
| **Automation**                        |                      |          |                 |
| Create/edit/delete automations        |          ✅          |    ✅    |    per perm     |
| Activate/deactivate/pause             |          ✅          |    ✅    |    per perm     |
| Manage tracker settings               |          ✅          |    ✅    |    per perm     |
| **Landing Pages**                     |                      |          |                 |
| Create/edit/publish/delete            |          ✅          |    ✅    |    per perm     |
| **Forms**                             |                      |          |                 |
| Create/edit/delete                    |          ✅          |    ✅    |    per perm     |
| **Facebook Ads**                      |                      |          |                 |
| Create/edit/delete                    |          ✅          |    ✅    |    per perm     |
| Schedule/pause                        |          ✅          |    ✅    |    per perm     |
| **Push Notifications**                |                      |          |                 |
| View campaigns                        |          ✅          |    ✅    |    per perm     |
| Create/edit/delete                    |          ✅          |    ✅    |    per perm     |
| **Transactional**                     |                      |          |                 |
| Access all transactional pages        |          ✅          |    ✅    |    per perm     |
| Preview/resend/delete logs            |          ✅          |    ✅    |    per perm     |
| **Sales features**                    |                      |          |                 |
| Manage deals                          |          ✅          | per perm |    per perm     |
| Manage tasks                          |          ✅          | per perm |    per perm     |
| Manage meetings                       |          ✅          | per perm |    per perm     |
| **Reports & Analytics** (Admin level) |                      |          |                 |
| Download data                         |          ✅          | per perm |    per perm     |
| Create alerts                         |          ✅          | per perm |    per perm     |
| Explore & create custom dashboards    |          ✅          | per perm |    per perm     |
| Manage Looks                          |          ✅          | per perm |    per perm     |

### 2.3 Permission groups

Permission toggles jsou organizované do skupin:

```
General features
├── Plan and billing
├── SMTP
├── API Keys
├── Authorized IPs
└── Transactional emails
    ├── Access to all pages/manage settings
    └── Preview/resend/delete logs

Marketing features
├── Email campaigns (Create/edit/delete, Send/schedule/suspend)
├── SMS campaigns (Create/edit/delete, Send/schedule)
├── WhatsApp campaigns
├── Templates (Create/edit/delete, Share)
├── Automations (Create/edit/delete/share, Activate/deactivate/pause, Settings)
├── Facebook Ads (Create/edit/delete, Schedule/pause)
├── Landing pages
├── Forms
├── Push campaigns (View, Create/edit/delete)
├── Contacts (View, Create/edit/delete, Import, Export)
└── Lists, Segments, Attributes

Sales features
├── Deals
├── Tasks
├── Meetings
├── Calls
└── Sales reports

Conversations features
├── Conversation management
├── Chatbot management
└── Inbox routing

Admin features (jen Admin Account)
├── Manage admin users
├── Manage sub-organizations
└── SAML SSO configuration
```

### 2.4 User Roles (Enterprise)

**Vlastní předdefinované role** (similar to HubSpot Permission Sets):

- Vytvořit user role s custom permission set
- Re-use across users
- **No charge for creating role**, charged jen when assigned
- Edit later – pricing prorate při změně

Příklady typických User Roles:

- "Marketing Manager"
- "Email Designer"
- "SDR"
- "Sales Manager"
- "CRM Admin"
- "Reporting Analyst"
- "Developer / Integration"
- "Customer Support Agent"

### 2.5 Seats and licensing

#### Marketing seats

- Každý account zahrnuje **1 marketing seat zdarma pro Ownera**
- Dodatečné marketing seats = additional cost dle planu
- Marketing seat dává access k Marketing features

#### Sales seats

- **Sales package** je add-on – samostatně cena
- 1 Sales seat zdarma pro Ownera v default
- Sales Essentials ~$27.92/user/měsíc
- Sales Advanced ~$58.50/user/měsíc

#### Phone seats

- Brevo Phone má vlastní seat licensing
- Per-user pricing
- Plus call credits

#### Conversations seats

- Conversations plan $15/user/měsíc

### 2.6 Invitation flow

```
Owner/Manager: account dropdown → Settings → Users → Add users
   ↓
Enter email addresses (multiple, comma-separated)
   ↓
Volba permission setup:
A) Full permissions (Manager-level) – default
B) Custom permissions – pick & toggle
C) User role – preset (Enterprise only)
   ↓
Send invitation
   ↓
Invitee receives email → click Accept
   ↓
Set up password / login
   ↓
Active user
```

**Pozn.:** Invitation **expires po 7 dnech** pokud neaccepted. Resend nutný.

### 2.7 Permission rules

- **Jen Owner nebo users s "Manage users" permission** mohou pozvat
- **Pending invitations** lze cancel
- **Multi-user invitation** najednou = **same role & permissions** pro všechny
- **Per-user different roles** = invite individually
- **Sub-organization users** consume seats per permissions

---

## 3. Account Owner flow

### 3.1 Onboarding (první přihlášení)

```
1. Sign-up na brevo.com
   ↓
2. Email verification
   ↓
3. Setup wizard:
   - Company name
   - Industry, company size
   - Marketing goals
   - Estimated monthly send volume
   ↓
4. Account language, timezone
   ↓
5. Verify sender email
   ↓
6. Domain authentication (DKIM, DMARC)
   - Manual DNS setup nebo
   - Brevo automation guidance
   ↓
7. (Optional) Import contacts
   ↓
8. (Optional) Connect integration:
   - WordPress / WooCommerce
   - Shopify
   - WixStores
   - etc.
   ↓
9. (Optional) Install Brevo tracker (web tracking)
   ↓
10. (Optional) Install Brevo Conversations widget
   ↓
11. Volba plánu:
   - Free start (300 emails/den limit)
   - Upgrade na Starter / Business / Pro
   ↓
12. (Optional) Pozvat tým
   ↓
13. První kampaň
```

### 3.2 Kritické Owner-only akce

#### Manage subscription

```
Account dropdown → Plans & Pricing
   ↓
Vidí current plan + usage
   ↓
Upgrade / downgrade / change billing cycle
   ↓
Confirmation
   ↓
Pro-rated billing
```

#### Add credits (SMS, Phone, prepaid emails)

```
Account dropdown → My Plan
   ↓
Choose: Email credits / SMS credits / Phone credits
   ↓
Volba balíčku
   ↓
Payment
   ↓
Credits added okamžitě
```

#### Close account

```
Account dropdown → Settings → Close account
   ↓
Important: Brevo requires confirmation + reasoning
   ↓
Email confirmation
   ↓
Data retention period (per GDPR)
   ↓
Account closed
```

### 3.3 Owner daily flow

```
Login → Dashboard (account overview)
   ↓
Check:
- Total contacts (unlimited, but track growth)
- Email send usage / day quota
- Plan utilization
- Recent campaigns performance
- Active workflows
- New conversations
- Sales pipeline (pokud Sales Platform)
   ↓
Activities:
- Approve outgoing campaigns (if approval flow set up internally)
- Review user requests
- Strategic planning
```

---

## 4. Manager flow

### 4.1 Daily Manager workflow

```
Login → Dashboard
   ↓
Check:
- Yesterday's campaign performance
- New form submissions
- Active workflows status
- Inbox new conversations
   ↓
Tasks:
- Create new email campaign
- Update segmentation
- Review automation logs
- Workflow optimization
```

### 4.2 Create Email Campaign

```
Campaigns → Email → Create a campaign
   ↓
1. Campaign settings:
   - Name
   - Subject + preview text (s AI assist via Aura)
   - From name + email (verified sender)
   - Reply-to
   ↓
2. Design:
   - Drag-drop editor / template / HTML
   - Brand kit apply
   - Personalization tags
   - Test image rendering
   ↓
3. Recipients:
   - Lists
   - Segments
   - Exclude lists/segments
   ↓
4. Preview & Test:
   - Send test email
   - Preview as specific contact
   - Mobile preview
   - Inbox preview
   ↓
5. Send / Schedule:
   - Send now
   - Schedule (date + time)
   - Send at best time (Aura AI)
   ↓
6. Confirm send
   ↓
Brevo queues + sends
   ↓
Real-time tracking v Reports
```

### 4.3 Manager limitations

- Nemůže manage company profile (Brevo's own profile vs. account profile)
- Pokud Owner nepoví billing permission, nemůže upgrade plan

---

## 5. Restricted User flow

Granular access per toggled features. Use cases:

### 5.1 Use case: Email Copywriter

```
Owner toggles permissions:
- Email campaigns: Create/edit/delete (NO send/schedule)
- Templates: Create/edit/delete
- Contacts: View only
   ↓
Restricted user vidí v UI:
- Campaigns section (full)
- Templates section
- Contacts (read-only)
- VŠECHNO OSTATNÍ skryto
   ↓
Worker drafts campaigns → saves
   ↓
Notifikuje Manager via Slack/email → Manager approves & sends
```

### 5.2 Use case: Developer

```
Owner toggles:
- API Keys: Yes
- SMTP: Yes
- Authorized IPs: Yes
- Transactional Settings: Yes
- Contacts: NONE
- Marketing features: NONE
   ↓
Developer pracuje v Settings → SMTP & API
   ↓
Generuje API keys
   ↓
Configures webhooks
   ↓
Builds integrations
```

### 5.3 Use case: Reporting Analyst

```
Owner toggles:
- Email campaigns: View only
- SMS campaigns: View only
- Automations: View only
- Reports: Yes (download, alerts, custom dashboards)
   ↓
Analyst vidí read-only data + může vytvářet custom dashboards a alerty
   ↓
Nelze sahat na konfiguraci
```

### 5.4 Limitations

- **Per-feature toggle jen Business+** (Free a Starter mají binary access)
- **No partial scope** (např. „can edit contacts in list X only") – buď ano, nebo ne
- **No custom property-level permissions**

---

## 6. User Role flow (Enterprise)

Předdefinované role pro re-use across users.

### 6.1 Create User Role

```
Owner: Settings → Users → User roles tab
   ↓
Click + Create a user role
   ↓
Select permissions (full toggle list)
   ↓
Name the role (e.g. "Marketing Manager")
   ↓
Save → User Role created
   ↓
**No immediate charge**
```

### 6.2 Assign User Role

```
Owner: Settings → Users → Create user
   ↓
Email + Continue
   ↓
Select "User role"
   ↓
From dropdown → select existing role
   ↓
Send invitation
   ↓
**Charging occurs at assignment** (pro-rate)
```

### 6.3 Edit User Role

```
Settings → Users → User roles
   ↓
Click role name → Continue (confirms editing)
   ↓
Edit name OR edit permissions
   ↓
Save
   ↓
If role assigned to users + additional cost:
   - Pricing summary
   - Confirm modifications
```

### 6.4 Delete User Role

```
Cannot delete if assigned to any user
   ↓
First: unassign from all users
   ↓
Then: Settings → User roles → 3-dot menu → Delete
```

---

## 7. Sub-organization flow (Enterprise)

**Klíčový Enterprise feature** pro multi-brand a agency use cases.

### 7.1 Co je Sub-organization

Až do října 2025 se to nazývalo "Sub-accounts". Sub-organization je **úplně oddělená Brevo entity** v rámci **Admin Account**:

- Vlastní dashboard, lists, attributes
- Vlastní API key
- Vlastní dedicated IP (option)
- Vlastní users s permissions
- Vlastní senders & domains

### 7.2 Použití

- **Marketing agency** – jeden Admin Account, multiple klient sub-orgs
- **Multi-brand company** – mateřská společnost s několika brandy
- **Multi-region** – samostatné sub-orgs per země
- **Multi-developer** – production vs. staging sub-org

### 7.3 Architecture

```
Admin Account (parent)
├── Admin Users (multi-org access)
└── Sub-organizations
    ├── Sub-org A (Brand A)
    │   ├── Sub-org Users (assigned to this sub-org)
    │   ├── Contacts (isolated)
    │   ├── Lists, Segments
    │   ├── Campaigns
    │   ├── Automations
    │   ├── API Key (unique)
    │   ├── Senders
    │   └── (Optional) Dedicated IP
    │
    ├── Sub-org B (Brand B)
    │   └── ...
    │
    └── Sub-org C (Brand C)
        └── ...
```

### 7.4 Create Sub-organization

```
Admin Account: Settings → Sub-organizations
   ↓
Click "Create sub-organization"
   ↓
Configure:
- Name
- Industry
- Default sender email
- Default language
- Initial plan allocation (emails, SMS)
   ↓
Sub-org created
   ↓
Inherits some Admin Account settings
   ↓
Independent operation from here
```

### 7.5 Sub-organization Groups

Admin can organize sub-orgs into **Groups** (např. "EMEA brands", "APAC brands", "Demo accounts").

### 7.6 Cross-sub-org reporting

```
Admin Account → Reports
   ↓
Aggregate metrics across sub-orgs
   ↓
Per-sub-org breakdowns
   ↓
Export consolidated reports
```

### 7.7 Sub-organization User invitation

```
Admin Account: Users → Sub-organization users tab
   ↓
Add a user
- Email
- Permissions:
  ✓ All access (full per sub-org) OR
  ✓ Custom access (per feature toggles)
- Sub-organizations to associate:
  - Sub-org A: full access
  - Sub-org B: marketing only
  - Sub-org C: view only
   ↓
Send invitation
   ↓
**Separate invitation email per sub-org**
   ↓
User accepts → has access to those sub-orgs
   ↓
**User consumes seats** based on permissions
```

### 7.8 Admin Users (Admin Account level)

Separate od Sub-org users. Manage **Admin Account itself**.

- Manage all sub-orgs
- View aggregate reports
- Configure SAML SSO
- Manage Admin users
- Plan & billing for Admin Account

---

## 8. Admin Account flow (multi-brand)

### 8.1 Setup new Admin Account

Brevo Enterprise comes with Admin Account by default. Otherwise upgrade needed.

```
Standard Account → Upgrade to Enterprise
   ↓
Contact Sales → quote
   ↓
Sign contract
   ↓
Admin Account provisioned
   ↓
Existing Standard Account může být převedeno na first Sub-org
   ↓
Admin Account is now top-level
```

### 8.2 Multi-brand operations

Agency typical day:

```
Admin User login → Admin Account
   ↓
Sees:
- Top-level dashboard
- All sub-orgs s health metrics
- Aggregate volumes
- Alerts per sub-org
   ↓
Drill-down do sub-org:
- Switch via Sub-org Switcher
- Access sub-org normally
- Manage campaigns, contacts, etc.
   ↓
Back to Admin:
- Switch via top-right menu
```

### 8.3 SAML SSO config (Admin Account)

```
Admin Account Settings → Security → SAML SSO
   ↓
Configure IdP (Okta, OneLogin, Azure AD, Google Workspace)
   ↓
Apply SSO za:
- Admin Users
- Sub-org Users (optional per sub-org)
   ↓
Users now log in via IdP
```

---

## 9. Subscriber flow

### 9.1 Sign-up flow

#### Single opt-in

```
Visitor fills form
   ↓
Form submit (Brevo form / API)
   ↓
Brevo validation:
- Email syntax
- Duplicate check (per list)
- Already blacklisted? → reject silently
- Captcha (if enabled)
   ↓
Add to list
   ↓
[Status: Subscribed]
   ↓
Trigger workflow (if "Contact added to list" trigger active)
   ↓
Welcome email
```

#### Double opt-in (recommended)

```
Visitor fills form
   ↓
Brevo sends Confirmation email
   ↓
[Status: Pending] – nepočítá se kontakt? záleží na implementaci
   ↓
Subscriber clicks confirm link
   ↓
Brevo logs: IP + timestamp + user agent
   ↓
[Status: Subscribed]
   ↓
Add to list + workflow
```

### 9.2 Engagement tracking

```
[Subscribed]
   ↓
Campaign sent → email arrives
   ↓
Tracking pixel (Brevo CDN) loads → Open recorded
   ↓
Click on link → Brevo redirect tracker → Click recorded
   ↓
Web tracking (s Brevo tracker installed):
- Page views attributed to contact
- Custom events captured
- Cart events tracked
   ↓
Contact attributes auto-updated:
- Last open date
- Last click date
- Click count
- Engagement score (if Pro+)
```

### 9.3 Preference Center

```
Subscriber clicks "Manage preferences" v patičce
   ↓
Brevo-hosted preference page (s tokenem)
   ↓
Subscriber vidí:
- Current subscription status
- List of subscription types / lists
- Personal info editable (per available fields)
- Frequency preferences (where supported)
- Pause emails option
- "Unsubscribe from all"
   ↓
Update preferences
   ↓
Contact attributes & list memberships updated
   ↓
Workflow trigger "Subscription update" fires
```

### 9.4 Unsubscribe

```
Subscriber clicks Unsubscribe
   ↓
Brevo unsubscribe page:
- "We've unsubscribed you" message
- Option: provide reason (optional feedback)
- Option: resubscribe link
   ↓
[Status: Unsubscribed]
   ↓
Webhook "unsubscribed" fires
   ↓
Contact stays in account but excluded from sends
   ↓
**Volume-based billing means unsubscribed cost nothing** (advantage!)
```

### 9.5 One-click Unsubscribe (RFC 8058)

- Gmail "Unsubscribe" button v header
- Automaticky implementováno Brevoem
- Confirmation flow per Gmail/Yahoo requirements

### 9.6 Spam complaint

```
Subscriber clicks "Report spam" v Gmailu
   ↓
Gmail FBL → Brevo
   ↓
Brevo:
- Marks "spam" status
- Auto-unsubscribes from all lists
- Updates Sender Reputation
- Logs event
- Webhook "spam" fires (if subscribed)
```

### 9.7 Hard bounce

```
ISP returns 5xx
   ↓
Brevo marks as Hard Bounce
   ↓
Auto-add to suppression list
   ↓
Excluded from future sends
   ↓
Webhook "hard_bounce" fires
   ↓
Contact stays in CRM
```

### 9.8 Resubscribe

```
Previously unsubscribed contact fills form again
   ↓
Brevo recognizes existing email
   ↓
If blacklisted from spam complaint → reject silently
If unsubscribed normally:
   - With double opt-in: confirmation required
   - With single opt-in: re-add to list
   ↓
[Status: Subscribed]
```

---

## 10. Email lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  1. USER drafts campaign                                        │
│     - Volba audience (list, segment)                            │
│     - Subject + content                                         │
│     - Sender info (verified)                                    │
│                            │                                    │
│                            ▼                                    │
│  2. PRE-SEND VALIDATION (Brevo auto-checks):                    │
│     - All required fields                                       │
│     - Domain authentication status                              │
│     - Sender verified?                                          │
│     - Volume within plan limit?                                 │
│     - Daily limit ok? (Free)                                    │
│                            │                                    │
│                            ▼                                    │
│  3. SEND OR SCHEDULE                                            │
│                            │                                    │
│                            ▼                                    │
│  4. BREVO QUEUE: per-recipient processing                       │
│     Filter recipients:                                          │
│     - Subscribed to selected list/segment? ✓                    │
│     - Not blacklisted? ✓                                        │
│     - Not unsubscribed? ✓                                       │
│     - Frequency cap not exceeded? ✓                             │
│                            │                                    │
│                            ▼                                    │
│  5. PER-RECIPIENT EMAIL GENERATION                              │
│     - Personalization tags resolved                             │
│     - Dynamic content evaluated                                 │
│     - Tracking pixels embedded                                  │
│     - Click trackers wrapped                                    │
│                            │                                    │
│                            ▼                                    │
│  6. SMTP SEND (from Brevo's EU-hosted infra)                    │
│     - From: configured sender                                   │
│     - DKIM signed (with your domain key)                        │
│     - Return-Path: Brevo's bounce domain                        │
│     - List-Unsubscribe header                                   │
│     - One-click unsubscribe URL                                 │
│     - Aura send-time (per recipient, if enabled)                │
│                            │                                    │
│                            ▼                                    │
│  7. ISP RECEIVES (Gmail/Outlook/Yahoo/etc.):                    │
│     - SPF check (passes if include:spf.brevo.com)               │
│     - DKIM verify (PASS)                                        │
│     - DMARC alignment (PASS via DKIM/SPF)                       │
│     - Reputation check                                          │
│     - Content filters                                           │
│     - Engagement history                                        │
│                            │                                    │
│                            ▼                                    │
│  8. ROUTING:                                                    │
│     - Inbox / Primary                                           │
│     - Promotions (Gmail)                                        │
│     - Spam                                                      │
│     - Bounced                                                   │
│                            │                                    │
│                            ▼                                    │
│  9. RECIPIENT INTERACTION:                                      │
│     - Open → tracking pixel → recorded                          │
│     - Click → Brevo proxy → tracked + redirect                  │
│     - Forward → not directly tracked but redirect tracked       │
│     - Reply → may be tracked if reply-to is configured          │
│                            │                                    │
│                            ▼                                    │
│ 10. CONTACT UPDATE:                                             │
│     - Last open, last click attributes                          │
│     - Engagement score recalculated                             │
│     - Workflow triggers fire                                    │
│                            │                                    │
│                            ▼                                    │
│ 11. REPORT UPDATE:                                              │
│     - Real-time stats                                           │
│     - Click maps                                                │
│     - Per-recipient activity log                                │
│                            │                                    │
│                            ▼                                    │
│ 12. ATTRIBUTION:                                                │
│     - Web tracking ties email → page → purchase                 │
│     - Revenue attributed to campaign                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. Automation execution

### 11.1 Workflow activation

```
User builds workflow (drag-drop)
   ↓
Configure triggers, actions, conditions
   ↓
Save as Draft
   ↓
Test (optional) – send to test contact
   ↓
**Activate**
   ↓
Brevo runs validation:
- All steps configured
- No infinite loops detected
- Workflows referenced via "Start another automation" are valid
   ↓
[Status: Active]
```

### 11.2 Trigger evaluation

```
Event occurs (e.g. contact added to list)
   ↓
Brevo workflow evaluator runs
   ↓
For each active workflow with matching trigger:
   - Check filters
   - Check if contact already enrolled (re-entry rules)
   - Add contact to workflow execution queue
```

### 11.3 Workflow execution per contact

```
Contact enters at trigger step
   ↓
Move to first action/condition
   ↓
Process step:
   - Action: execute (send email, update attribute, etc.)
   - Condition: evaluate, branch accordingly
   - Wait: queue, resume after time elapsed
   ↓
Continue to next step
   ↓
Until:
   - End workflow
   - Exit condition met
   - "Start another automation" branches contact out
```

### 11.4 Start another automation – loop protection

```
Contact in Workflow A
   ↓
"Start another automation" action → enroll in Workflow B
   ↓
Brevo checks loop protection:
   - Max 15× per contact per 30 days A→B
   - If exceeded → skip enrollment
   ↓
If contact already in Workflow B and B disallows multiple entries:
   - Skip enrollment
   ↓
If Workflow B is paused/inactive:
   - Skip enrollment
   ↓
Contact proceeds in Workflow B from configured step
   ↓
Contact ALSO continues in Workflow A (parallel)
```

### 11.5 Exit & restart conditions

```
Exit condition (e.g. "Contact unsubscribed"):
   - Continuously evaluated
   - If met at any point → contact exits workflow immediately

Restart condition (e.g. "Re-enrolls after 30 days if attribute X = Y"):
   - When met → contact restarts from first step
   - Useful for recurring workflows (annual renewals, etc.)
```

### 11.6 Automation logs

- **Workflow logs:** every action execution
- **Event logs:** triggers, conditions met
- **Contacts in workflow:** current status, step
- Available for debugging + audit

---

## 12. Transactional flow

### 12.1 SMTP relay flow

```
Application (e.g. WordPress) triggers email
   ↓
SMTP client connects to smtp-relay.brevo.com
   ↓
Authentication: SMTP credentials (Brevo-provided)
   ↓
Send email via SMTP protocol
   ↓
Brevo receives → queues → sends
   ↓
Event tracking → logs
   ↓
Webhook fires (if subscribed)
```

### 12.2 API flow

```
Application code: POST /v3/smtp/email
   ↓
Brevo API:
   - Auth (API key header)
   - Validate sender (verified domain)
   - Validate recipient (not blacklisted)
   - Validate content (size, format)
   ↓
Process → queue → send via SMTP
   ↓
Response: 201 Created s messageId
   ↓
Async: events recorded, webhook fires
```

### 12.3 Template-based send

```
Pre-configure template v Brevo UI
   ↓
Template ID assigned (e.g. 42)
   ↓
API call:
   POST /v3/smtp/email
   {
     "templateId": 42,
     "to": [{"email": "user@example.com", "name": "User"}],
     "params": {"orderId": "12345", "amount": "$99"}
   }
   ↓
Brevo merges template + params → sends
   ↓
Personalized email delivered
```

### 12.4 Webhook flow

```
Subscribe webhook v Settings → Webhooks
   ↓
Configure URL + events (delivered, opened, clicked, etc.)
   ↓
Brevo sends signed POST request per event:
   {
     "event": "delivered",
     "email": "user@example.com",
     "messageId": "...",
     "date": "...",
     ...
   }
   ↓
Application verifies signature → processes
```

### 12.5 Inbound parsing

- Brevo supports inbound emails (receive emails to specified address)
- Auto-parses email content → API webhook
- Use case: support@yourdomain.com → ticket creation

---

## 13. E-commerce flow

### 13.1 Shopify integration

```
Owner: Integrations → Shopify
   ↓
OAuth authorize Shopify store
   ↓
Brevo creates Shopify connection
   ↓
Initial sync:
- Customers → Contacts (with marketing_consent flag)
- Orders → Order records
- Products → Product catalog
- Abandoned carts → Cart events
   ↓
Continuous webhook listening:
- Customer created/updated
- Order placed/updated/cancelled
- Cart abandoned (after configurable time)
- Product updated
```

### 13.2 Abandoned cart workflow

```
Customer adds to cart na Shopify
   ↓
Shopify webhook → Brevo
   ↓
Brevo stores cart record
   ↓
If cart not converted in X hours:
   - Workflow trigger "Abandoned cart" fires
   - Filter: cart total > $X
   ↓
Action: send email s product blokem
- Cart products dynamically inserted
- Direct checkout link
   ↓
Conditional split:
- If clicked → 24h delay → 10% discount email
- If not clicked → 48h delay → final reminder
   ↓
Exit condition: order completed
```

### 13.3 Post-purchase workflow

```
Order placed
   ↓
Workflow trigger "Order placed"
   ↓
- Send order confirmation (transactional)
- Wait 7 days
- Send tutorial / education content
- Wait 14 days
- Send review request
- Wait 60 days
- Send replenishment reminder (if consumable product)
```

### 13.4 Product recommendations (Pro+)

```
Customer profile + order history
   ↓
Brevo AI analyzes:
- Similar customers
- Purchase patterns
- Product affinity
   ↓
Email s "Recommended for you" block
   ↓
Dynamically generated per recipient
   ↓
Click tracked → conversion attribution
```

### 13.5 Back-in-stock alerts (Pro+)

```
Customer views out-of-stock product
   ↓
"Notify me when available" form
   ↓
Email saved with product reference
   ↓
When inventory updated (webhook from store):
- Trigger "Product back in stock" workflow
- Send email to all interested contacts
```

---

## 14. Sales Platform flow

### 14.1 Deal lifecycle

```
Lead source:
- Form submission
- Manual contact creation
- Imported contact
- API
- CRM sync
   ↓
Create Deal:
- Manually
- Auto via automation
- Auto via form (if configured)
   ↓
Deal record:
- Pipeline + stage
- Value
- Expected close date
- Associated contact + company
- Owner
   ↓
Stage progression:
- Manual update by sales rep
- Auto via workflow
- Auto via meeting booked
   ↓
Activities logged:
- Calls (via Brevo Phone)
- Meetings (via Meetings module)
- Notes
- Emails (with Gmail/Outlook extension)
- Tasks completed
   ↓
Win/Loss:
- Deal stage → "Closed Won" / "Closed Lost"
- Auto-trigger post-purchase workflow (won)
- Auto-trigger nurture workflow (lost, save for later)
```

### 14.2 Meetings flow

```
Sales rep: My Profile → Meetings
   ↓
Configure availability:
- Working hours
- Buffer times
- Lead time
- Calendar sync (Google Workspace / Outlook)
   ↓
Generate booking link
   ↓
Share s prospect:
- Email signature
- Sequence step
- Embedded on web page
   ↓
Prospect books:
- Selects time slot
- Fills form (custom questions)
- Confirmation
   ↓
Auto:
- Calendar event created
- Contact created/updated v Brevo
- Deal created (optional)
- Activity logged
- Confirmation emails to both
- Reminders scheduled
```

### 14.3 Sequences (Pro+ Sales)

```
Sales rep creates sequence:
- 5–10 steps (emails + tasks)
- Delays between
- Personalization
   ↓
Enroll prospects
   ↓
Sequence sends from sales rep's inbox (Gmail/Outlook)
   ↓
Auto-stop on:
- Reply
- Meeting booked
- Manual unenroll
```

---

## 15. Conversations flow

### 15.1 Live chat flow

```
Visitor on website
   ↓
Brevo chat widget displayed (configured per page rules)
   ↓
Visitor types message
   ↓
Brevo:
- Creates conversation
- Notifies online agents
- Routes per rules (round-robin / skill-based)
   ↓
Agent picks up v Inbox
   ↓
Conversation:
- Agent replies
- Visitor responds
- File sharing (with limits)
- Emoji, typing indicators
   ↓
Conversation linked to Contact (if known)
- Or anonymous, becomes Contact upon form fill
   ↓
On close:
- CSAT survey
- Internal notes
- Tags
   ↓
History saved
```

### 15.2 Multi-channel conversations

Same Inbox handles:

- Live chat
- Email (shared inbox)
- Facebook Messenger
- Instagram DM
- WhatsApp
- SMS

Unified agent view, single workflow per conversation.

### 15.3 Chatbot flow

```
Visitor opens chat
   ↓
Bot greets, asks initial questions
   ↓
Rule-based flow:
- If "Sales question" → connect with sales
- If "Support" → check KB → escalate if needed
- If "Pricing" → send to pricing page
   ↓
Bot can:
- Answer FAQs (KB integration)
- Collect contact info → create Contact
- Trigger Marketing Automation workflow
- Hand off to human agent
- Schedule meeting (via Meetings integration)
```

---

## 16. API & Integration flow

### 16.1 API key creation

```
User: Settings → API Keys
   ↓
Click "Generate a new API key"
   ↓
Optional: name + IP whitelist (Enterprise)
   ↓
Key generated (display once)
   ↓
User saves key into application
```

### 16.2 OAuth 2.0 flow (3rd party apps)

```
3rd party app initiates OAuth
   ↓
Redirect to Brevo authorize
   ↓
User logs in + grants scopes
   ↓
Authorization code returned
   ↓
App exchanges code → access token
   ↓
App uses Bearer token for API
```

### 16.3 Plugin install (e.g. WordPress)

```
Admin: WordPress → Plugins → Brevo for WordPress → Install
   ↓
Configure:
- Brevo API key
- Sync settings
- Forms management
- Email opt-in defaults
   ↓
Plugin:
- Syncs subscribers from WordPress users
- Routes emails through Brevo SMTP
- Embeds forms
- Tracks page views (with consent)
```

### 16.4 Webhook subscription

```
Settings → Webhooks → Create
   ↓
Configure:
- Target URL (your endpoint)
- Events to subscribe (multi-select)
- Marketing or Transactional
   ↓
Brevo sends signed POST per event:
   - delivered, opened, clicked, etc.
   ↓
Application verifies + processes
```

---

## 17. GDPR & Compliance flow

### 17.1 EU hosting advantage

```
Brevo's data centers v EU (Paříž, Frankfurt)
   ↓
Default data residency: EU
   ↓
For EU customers: no data transfer outside
   ↓
US customers: standard agreement
   ↓
GDPR compliance built-in
```

### 17.2 Right to Be Forgotten

```
Subscriber requests deletion
   ↓
Method A: UI
   - Admin: Contacts → search → contact record
   - Actions → Delete permanently
   - Confirmation modal
   - Delete

Method B: API
   - DELETE /contacts/{identifier}
   - HTTP 204 No Content on success

Method C: Self-service preference center
   - Subscriber clicks "Delete me" v preference center
   - Brevo handles deletion request
   ↓
Brevo:
- Removes all contact data
- Anonymizes activity records
- Adds to permanent suppression
- Logs deletion event
- Email confirmation (optional)
   ↓
Cannot be reversed
```

### 17.3 Data export per contact

```
Admin: Contact record → 3-dot menu → Export contact data
   ↓
Brevo generates JSON with:
- Profile attributes
- Activity history
- Subscription history
- Form submissions
- Email engagement
- Transactional history
   ↓
Provides download link (time-limited)
```

### 17.4 Consent tracking

For each contact:

- Opt-in source URL
- Opt-in IP
- Opt-in timestamp
- Confirmation IP + timestamp (double opt-in)
- Per-subscription consent
- GDPR field consent (if collected)

### 17.5 Sub-processor list

Public: brevo.com/legal/list-of-sub-processors

- AWS (US, EU regions)
- Twilio (SMS)
- Looker (Google) for analytics
- etc.

---

## 18. Datová mapa: co vidí kdo

| Data                      |  Owner   | Manager  | Restricted (full toggles) | Restricted (limited) | Sub-org User |    Admin User     |    Contact    |    API    |
| ------------------------- | :------: | :------: | :-----------------------: | :------------------: | :----------: | :---------------: | :-----------: | :-------: |
| Billing & subscription    |    ✅    | per perm |         per perm          |          ❌          | jen sub-org  | jen Admin Account |      ❌       | per scope |
| User management           |    ✅    | per perm |            ❌             |          ❌          | per sub-org  |    Admin only     |      ❌       | per scope |
| All contacts              |    ✅    |    ✅    |         per perm          |       per perm       | jen sub-org  |    per access     |   jen sebe    |    ✅     |
| Lists/Segments            |    ✅    |    ✅    |         per perm          |       per perm       | jen sub-org  |    per access     |       –       |    ✅     |
| Email campaigns           |    ✅    |    ✅    |         per perm          |       per perm       | jen sub-org  |    per access     | jen co dostal |    ✅     |
| Send campaigns            |    ✅    |    ✅    |         per perm          |       per perm       |   per perm   |    per access     |      ❌       |    ✅     |
| Templates                 |    ✅    |    ✅    |         per perm          |       per perm       | jen sub-org  |    per access     |      ❌       |    ✅     |
| Automations               |    ✅    |    ✅    |         per perm          |       per perm       | jen sub-org  |    per access     |      ❌       |    ✅     |
| Sales features            |    ✅    | per perm |         per perm          |       per perm       |   per perm   |    per access     |      ❌       | per scope |
| Transactional logs        |    ✅    |    ✅    |         per perm          |       per perm       | jen sub-org  |    per access     |      ❌       |    ✅     |
| API keys                  | per perm | per perm |         per perm          |          ❌          | jen sub-org  |    per access     |      ❌       |     –     |
| Reports                   |    ✅    |    ✅    |         per perm          |       per perm       | jen sub-org  |     aggregate     |      ❌       |    ✅     |
| Domain settings           |    ✅    | per perm |         per perm          |          ❌          | jen sub-org  |    per access     |      ❌       | per scope |
| Conversations             |    ✅    |    ✅    |         per perm          |       per perm       | jen sub-org  |    per access     |    jen své    | per scope |
| Phone (calls, recordings) |    ✅    | per perm |         per perm          |          ❌          | jen sub-org  |    per access     |    jen své    | per scope |
| GDPR delete               |    ✅    | per perm |         per perm          |          ❌          | jen sub-org  |    per access     |    request    | per scope |

---

## 19. Známé úzkoprofilové místa

### 19.1 Role complexity

- **Tři default role (Owner/Manager/Restricted)** jsou simple, ale méně sofistikované než HubSpot
- **Per-feature toggles jen Business+** – Free a Starter mají binary access
- **User Roles jen Enterprise** – pro střední firmy nutno spravovat individuální permissions
- **No native SCIM** – nelze automated provisioning (jen manual through UI)
- **No suspend state** – buď user existuje, nebo revoke

### 19.2 Sub-organization gotchas

- **Jen Enterprise** – pro malé firmy / agentury bez Enterprise není multi-brand izolovaná data
- **Data isolated** – nelze easily cross-sub-org reporting bez Admin Account level
- **Each sub-org consumes seats per permissions** – může být drahé pro velké teams
- **Switch UI** – frequent switching může být tedious

### 19.3 Account ownership

- **Owner transfer není self-service** – musí přes Brevo Support (slow)
- **Cannot remove Owner** – workaround: contact support

### 19.4 Two automation editors

- **Classic vs. New editor** – migration probíhající
- Features se mírně liší
- Nutno vědět, který editor v jaké chvíli
- Confusing pro nové users

### 19.5 Volume-based billing nuances

- **Daily limit na Free** (300/den) – sjednoceno marketing + transactional
- **Overage charges** – higher rate než plan rate
- **Plan tier mismatch** – jednorázový peak může nutit upgrade
- **Predicting send volume** je nutné pro správný plán

### 19.6 Automation limity

- **Max 2 000 contacts** v active workflows na Free
- **No split-testing automation paths** (jen email A/B)
- **No per-contact predictive sending** (jen send time)
- **No AI workflow generation** (yet)
- **15× max start-another-automation per contact per 30 dní**
- **Workflow templates limited** vs. HubSpot

### 19.7 UI/UX

- **No Czech/Slovak/Polish UI**
- **Multiple modules** – switching mezi Marketing / Sales / Conversations / Phone může být confusing
- **Two automation editors** – migration friction
- **Looker-based reports** – steep learning curve

### 19.8 Sales Platform limity

- **Less feature-dense** než Salesforce nebo HubSpot Sales Hub
- **Forecasting basic**
- **No advanced territory management**
- **Sequences less sophisticated**

### 19.9 Integration limity

- **Some integrations only via Zapier** – ne native
- **Limited app marketplace** vs. HubSpot's 1700+

### 19.10 Compliance gaps

- **Audit log granularita** – limitované pro non-Enterprise
- **Property-level permissions** chybí
- **HIPAA opt-in** jen Pro+

---

## 20. Doporučení pro design vlastních procesů

Pokud Brevo používáte v týmu, doporučujeme:

1. **Permission strategy první týden** – nastavit role per typický worker (Marketing Manager, Designer, etc.)
2. **API key servisní účet** – ne user-bound keys pro produkční integrace
3. **Domain authentication první den** – DKIM + DMARC
4. **Sender verification list** – udržovat seznam verified senders + responsible owners
5. **Naming conventions** – workflows, lists, segments (např. "MKT_2026_Q2_Newsletter_DACH")
6. **Volume forecasting** – sledovat send patterns, predikovat plan tier
7. **Workflow templates** – uložit kanonické workflows pro re-use
8. **Sub-organization strategy** (Enterprise) – per brand, per region, per environment
9. **Quarterly audit:**
   - Inactive users → revoke
   - Old API keys → rotate
   - Failed integrations → fix
   - Stale lists → archive
   - Unused workflows → archive
10. **GDPR compliance documentation** – consent audit trail (Brevo's záruka end-to-end stále potřebuje vaše dokumentování)
11. **Multi-channel strategy** – plánovat email + SMS + WhatsApp koordinaci, ne duplikované messaging
12. **Sender Reputation monitoring** – external tools (Google Postmaster, Microsoft SNDS) navíc k Brevo
13. **Migration plan classic → new automation editor** – jak Brevo migration roluje
14. **Sub-org users seats budgeting** – Enterprise může být drahé, monitor seat usage

---

_Dokument zpracován z oficiálních zdrojů help.brevo.com, developers.brevo.com, brevo.com a praktických příruček (Venture Harbour, Stitchflow, EmailToolTester, Sender, SalesHive, Marketing Automation Insider, That Marketing Buddy). Pro nejaktuálnější detaily vždy konzultovat Brevo Help Center._
