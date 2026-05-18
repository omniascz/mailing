# MailerLite – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v MailerLite prochází data, lidé a akce – od Account Ownera přes specializované uživatele a integrace až po koncového subscribera.

> Tento dokument doplňuje `11_MailerLite_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** MailerLite umí, tento popisuje, **kdo s tím interaguje a jak data tečou**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
> - **5 default user typů** (Administrator, Manager, Viewer, Accountant, Custom user) – přehledná struktura
> - **Multi-user feature jen Growing Business+** – Free omezeno na 1 user (Owner)
> - **Growing Business: 3 users included**; **Advanced: unlimited users**
> - **Single account model** – ne sub-accounts ani Multiple Accounts jako MAX/MAX2 v GetResponse
> - **MailerSend = separate flow** pro transactional (paralelní platforma stejné firmy)
> - **14-day premium trial** – full access, no credit card
> - **Subscriber lifecycle** s 6 stavy: Active, Unsubscribed, Bounced, Spam, Pending, Unconfirmed
> - **Anti-spam policy strict** – account suspensions možné pro porušení

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [User typy a permissions](#2-user-typy)
3. [Account Owner flow](#3-account-owner-flow)
4. [Administrator flow](#4-administrator-flow)
5. [Manager flow](#5-manager-flow)
6. [Viewer flow](#6-viewer-flow)
7. [Accountant flow](#7-accountant-flow)
8. [Custom user flow](#8-custom-user-flow)
9. [14-day premium trial flow](#9-trial-flow)
10. [Subscriber lifecycle](#10-subscriber-lifecycle)
11. [Email lifecycle](#11-email-lifecycle)
12. [Workflow execution model](#12-workflow-execution)
13. [Survey & Quiz flow](#13-survey-quiz-flow)
14. [E-commerce flow](#14-ecommerce-flow)
15. [Digital products & Paid newsletter flow](#15-digital-products-flow)
16. [MailerSend separation flow](#16-mailersend-flow)
17. [API & Integration flow](#17-integration-flow)
18. [GDPR & Compliance flow](#18-gdpr-flow)
19. [Datová mapa: co vidí kdo](#19-datová-mapa)
20. [Známé úzkoprofilové místa](#20-úzkoprofilové-místa)

---

## 1. Mapa aktérů

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│         MAILERLITE PLATFORM ECOSYSTEM                              │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [MailerLite Staff (Internal Support)]                             │
│   ├─ Customer Success Manager (Enterprise only)                    │
│   ├─ Technical Support 24/7 (email; live chat Advanced+)           │
│   ├─ Deliverability team                                           │
│   ├─ Trust & Safety (anti-spam enforcement)                        │
│   └─ Migration team (esp. for FreshMail migrations)                │
│           │ (limited debug access with consent)                    │
│           ▼                                                        │
│                                                                    │
│   ┌──────────────────────────────────────────┐                     │
│   │   MailerLite Account                     │                     │
│   │   (Single account – no sub-accounts)     │                     │
│   │                                          │                     │
│   │   Default users:                         │                     │
│   │   ├─ Account Owner (1 osoba)             │◄── full + close acc │
│   │   ├─ Administrator (multiple)            │◄── full operational │
│   │   ├─ Manager (Growing+)                  │◄── most features    │
│   │   ├─ Viewer (Growing+)                   │◄── reports only     │
│   │   ├─ Accountant (Growing+)               │◄── billing only     │
│   │   └─ Custom user (Growing+)              │◄── per checkboxes   │
│   │                                          │                     │
│   │   User seats limits:                     │                     │
│   │   - Free: 1 (Owner only)                 │                     │
│   │   - Growing Business: 3 incl.            │                     │
│   │   - Advanced: Unlimited                  │                     │
│   │   - Enterprise: Unlimited + SSO          │                     │
│   └──────────────┬───────────────────────────┘                     │
│                  │                                                 │
│                  ▼                                                 │
│   [Subscribers / Contacts]                                         │
│       │                                                            │
│       ├─→ marketing emails (campaigns + automations)               │
│       ├─→ workflows triggered by events                            │
│       ├─→ form submissions                                         │
│       ├─→ survey/quiz responses                                    │
│       ├─→ paid newsletter / digital product purchases              │
│       └─→ subscription preference management                       │
│                  │                                                 │
│                  ▼                                                 │
│   [Integrations, Forms, Websites, External Apps]                   │
│                                                                    │
│   ┌──────────────────────────────────────────┐                     │
│   │   MailerSend (separate platform)         │                     │
│   │   - Same company, different product      │                     │
│   │   - API-first transactional email + SMS  │                     │
│   │   - Separate account, separate billing   │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér | Vstupní bod | Co dělá | Co vidí |
|---|---|---|---|
| **Account Owner** | Account creation | Vše + billing + close account | Vše |
| **Administrator** | Pozvánka od Owner | Full access incl. billing + user mgmt + export | Vše |
| **Manager** | Pozvánka | Most features, ne export/billing/users | Most |
| **Viewer** | Pozvánka | View reports only | Reports only |
| **Accountant** | Pozvánka | Billing only | Billing only |
| **Custom user** | Pozvánka s custom permissions | Per checkbox-defined permissions | Per role |
| **Subscriber** | Form, import, integration, API | Otevírá emaily, kupuje, vyplňuje quiz | Své emaily + preference center |
| **API Client** | API key | Per scope | Per scope |
| **Integration** (WordPress, Shopify) | OAuth/plugin | Sync data | Per OAuth scope |
| **MailerSend user** | Separate account | Transactional API only | MailerSend only |
| **MailerLite Staff** | Interní s consent | Debug/support, anti-spam review | Limited |

---

## 2. User typy a permissions

MailerLite má **5 default user typů** se striktně definovanými permissions + 1 Custom user model.

### 2.1 Administrator

- **Plný přístup k účtu**
- Equivalent to Account Owner functionally (kromě close account):
  - Manage subscribers (import, export, delete)
  - Send campaigns
  - Build automations
  - Manage integrations
  - Manage API keys
  - **Manage billing** (přístup k payment, plans)
  - **Manage users** (create, edit, delete)
  - **Export subscribers** (data export)
  - Manage account settings
  - View all reports

### 2.2 Manager

- **Most operational features**
- Cannot:
  - **Export subscribers** (data security)
  - **Access billing**
  - **Create/edit/delete users**
- Can:
  - Manage subscribers (add/edit/delete)
  - Send campaigns
  - Build automations
  - Manage integrations
  - View reports
  - Manage forms, websites, landing pages

Ideal pro **marketing team lead** without finance/admin responsibilities.

### 2.3 Viewer

- **Read-only access**
- Can only **view reports**
- Cannot:
  - Edit anything
  - Send campaigns
  - Access subscribers detail
  - Manage automations

Ideal pro:
- Stakeholders
- C-level reviewing performance
- External consultants
- Auditors

### 2.4 Accountant

- **Billing-only access**
- Can only access billing section:
  - View invoices
  - Update payment method
  - Change plan (with restrictions)
  - View subscription history
- Cannot:
  - Send anything
  - View subscribers
  - View reports
  - Access campaigns

Ideal pro:
- Finance team member
- External accountant
- Bookkeeper

### 2.5 Custom user

**Most flexible** – build per-feature permission set:

Per feature checkbox model:
- **Campaigns:**
  - View all
  - View created or assigned
  - Add/change/remove
  - Send
- **Automations:**
  - View
  - Create/edit
  - Activate
- **Subscribers:**
  - View
  - Add/edit
  - Delete
  - Export
- **Forms:**
  - View
  - Create/edit
  - Publish
- **Landing pages:**
  - View
  - Create/edit
  - Publish
- **Websites:**
  - View
  - Create/edit
  - Publish
- **Surveys:**
  - View
  - Create/edit
- **Integrations:**
  - View
  - Manage
- **Reports:**
  - View
- **Billing:**
  - View
  - Manage

#### Custom user examples

**"External Copywriter"** custom user:
- Campaigns: View created or assigned + Add/change/remove
- Subscribers: View only
- Reports: View
- Everything else: No

**"Designer"** custom user:
- Campaigns: View + Add/change/remove (no send)
- Forms: View + Create/edit (no publish)
- Landing pages: View + Create/edit (no publish)
- Everything else: No

### 2.6 Permission matrix (default roles)

| Akce | Owner | Admin | Manager | Viewer | Accountant | Custom |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Account** |  |  |  |  |  |  |
| Close account | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Account settings | ✅ | ✅ | ❌ | ❌ | ❌ | per checkbox |
| **Billing** |  |  |  |  |  |  |
| View billing | ✅ | ✅ | ❌ | ❌ | ✅ | per checkbox |
| Manage billing | ✅ | ✅ | ❌ | ❌ | ✅ | per checkbox |
| **Users** |  |  |  |  |  |  |
| Add/edit/delete users | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Subscribers** |  |  |  |  |  |  |
| View subscribers | ✅ | ✅ | ✅ | ❌ | ❌ | per checkbox |
| Add/edit | ✅ | ✅ | ✅ | ❌ | ❌ | per checkbox |
| Delete | ✅ | ✅ | ✅ | ❌ | ❌ | per checkbox |
| **Export subscribers** | ✅ | ✅ | ❌ | ❌ | ❌ | per checkbox |
| Import | ✅ | ✅ | ✅ | ❌ | ❌ | per checkbox |
| **Campaigns** |  |  |  |  |  |  |
| Create | ✅ | ✅ | ✅ | ❌ | ❌ | per checkbox |
| Edit | ✅ | ✅ | ✅ | ❌ | ❌ | per checkbox |
| Send | ✅ | ✅ | ✅ | ❌ | ❌ | per checkbox |
| **Automations** |  |  |  |  |  |  |
| View | ✅ | ✅ | ✅ | ❌ | ❌ | per checkbox |
| Create/edit | ✅ | ✅ | ✅ | ❌ | ❌ | per checkbox |
| Activate | ✅ | ✅ | ✅ | ❌ | ❌ | per checkbox |
| **Forms/Popups** |  |  |  |  |  |  |
| Create/edit | ✅ | ✅ | ✅ | ❌ | ❌ | per checkbox |
| Publish | ✅ | ✅ | ✅ | ❌ | ❌ | per checkbox |
| **Landing pages** |  |  |  |  |  |  |
| Create/edit | ✅ | ✅ | ✅ | ❌ | ❌ | per checkbox |
| Publish | ✅ | ✅ | ✅ | ❌ | ❌ | per checkbox |
| **Websites** |  |  |  |  |  |  |
| Create/edit | ✅ | ✅ | ✅ | ❌ | ❌ | per checkbox |
| Publish | ✅ | ✅ | ✅ | ❌ | ❌ | per checkbox |
| **Reports** |  |  |  |  |  |  |
| View | ✅ | ✅ | ✅ | ✅ | ❌ | per checkbox |
| **Integrations** |  |  |  |  |  |  |
| Manage | ✅ | ✅ | ✅ | ❌ | ❌ | per checkbox |
| **API keys** |  |  |  |  |  |  |
| Manage | ✅ | ✅ | ❌ | ❌ | ❌ | per checkbox |

### 2.7 User seat allowances per plan

| Plán | Users incl. | Multi-user support |
|---|---|---|
| **Free** | 1 (Owner only) | ❌ |
| **Growing Business** | **3** | ✅ |
| **Advanced** | **Unlimited** | ✅ |
| **Enterprise** | Unlimited | ✅ + SSO/SAML |

⚠️ Pozor: na Free plánu **nelze přidat dalšího uživatele**. Upgrade na Growing Business minimum.

### 2.8 Invitation flow

```
Owner/Admin: Settings → Users → Add user
   ↓
Enter email
   ↓
Select user type:
   - Administrator
   - Manager
   - Viewer
   - Accountant
   - Custom user (then configure permissions checkboxes)
   ↓
[Custom user only]: Check permission boxes per feature
   ↓
Send invitation
   ↓
User receives email
   ↓
User clicks "Accept invitation" link
   ↓
Set password + complete profile
   ↓
[Active user]
```

### 2.9 Special pravidla

- **Account musí mít vždy 1 Ownera**
- Ownership transfer **přes support** (ne self-service jako Klaviyo/HubSpot)
- **One account per email** – email lze re-use jen po removal
- **Re-added user loses past access history** to created assets (notable!)
- **Custom user permissions stack additively** – checkbox = grant
- **Permission changes immediate** – no delay

---

## 3. Account Owner flow

### 3.1 Onboarding (první přihlášení)

```
1. Sign-up na mailerlite.com (no credit card)
   ↓
2. Email verification
   ↓
3. Account info wizard:
   - Company name
   - Industry
   - List size estimate
   - Goals (newsletters / e-commerce / content monetization / mixed)
   ↓
4. **14-day premium trial automatically activated** – full features
   ↓
5. Onboarding tour:
   - Create first group (list)
   - Verify sender email
   - Create first form / popup
   ↓
6. Optional: import contacts
   - CSV upload
   - Copy-paste
   - Integration (Shopify, WP, etc.)
   ↓
7. Optional: connect domain
   - DKIM + SPF setup wizard
   ↓
8. Create first campaign (with AI assist on Advanced)
   ↓
9. Optional: build first automation
   ↓
10. Optional: install website tracking script
   ↓
11. After 14 days: trial ends → choose plan or stay Free
```

### 3.2 Kritické Owner-only akce

#### Close account

```
Account Settings → Account → Close account
   ↓
Reasoning survey
   ↓
Confirmation
   ↓
Account scheduled for deletion
   ↓
GDPR retention period applies
```

#### Transfer ownership

```
Ownership transfer is NOT self-service v MailerLite
   ↓
Owner must contact support
   ↓
Provide proof + identity verification
   ↓
Support processes transfer manually
   ↓
New owner credentials activated
```

⚠️ Pozor: pokud Owner pohřešovaný nebo nedostupný → komplikovaný process s legal proof.

### 3.3 Owner daily flow

```
Login → Dashboard
   ↓
Account overview:
- Active subscribers count
- Recent campaign performance
- Active automations
- Form submissions
- Recent forms/popups conversion
- Website traffic (if hosted)
   ↓
Strategic:
- Plan tier vs. subscriber growth (auto-upgrade alerts)
- Add-on usage (dedicated IP, etc.)
- Team performance
- Custom users audit
- Anti-spam compliance review
```

### 3.4 Manage billing

```
Account → Billing & Plan
   ↓
View:
- Current plan + tier
- Current subscriber count + limit
- Next billing date + amount
- Payment method
- Invoice history
- Trial status
- Add-ons
   ↓
Actions:
- Change plan (Growing/Advanced/Enterprise)
- Change billing cycle (monthly → annual saves 10%)
- Update payment method
- Cancel auto-renewal
- Apply discount code
```

---

## 4. Administrator flow

Administrator = top-level operational role, **functionally equivalent to Owner kromě close account**.

### 4.1 Daily Administrator workflow

```
Login → Dashboard
   ↓
Operational checks:
- Failed automations
- Bounce rate
- Spam complaint rate
- Subscriber growth
- Form/popup performance
- Integration sync status
- New user invitations pending
   ↓
Actions:
- User management (invite, edit, delete)
- Domain authentication checks
- Add/remove integrations
- API key management
- Manage trial expirations
```

### 4.2 User invitation flow

```
Settings → Users → + Add user
   ↓
Email + Select user type
   ↓
[Custom user only]: configure permissions checkboxes
   ↓
Send invitation
   ↓
[Invitee accepts + sets password]
   ↓
[Active user]
```

### 4.3 API key creation

```
Settings → Integrations → API
   ↓
Generate new API key
   ↓
Name the key + scope (if applicable)
   ↓
**API key displayed**
   ↓
Copy + store securely
```

### 4.4 Domain authentication

```
Settings → Domains
   ↓
Add domain (e.g. mail.yourstore.com)
   ↓
DKIM setup wizard (CNAME records)
   ↓
SPF instructions
   ↓
You add to DNS provider
   ↓
MailerLite validates (5 min – 48h)
   ↓
[Authenticated]
   ↓
Emails now signed with your domain
```

---

## 5. Manager flow

Manager = výkonný marketing role pro daily operations.

### 5.1 Daily Manager workflow

```
Login → Dashboard
   ↓
Activities:
- Build/edit segments
- Schedule campaigns
- Review automation performance
- Update workflow logic
- Manage forms/popups
- Create surveys/quizzes
   ↓
Cannot:
- Export subscribers (security)
- Access billing
- Manage other users
```

### 5.2 Create campaign

```
Campaigns → Create campaign
   ↓
Type selection:
- Regular
- A/B test (s 2-5 variants)
- Auto-resend (Growing+)
- RSS campaign
   ↓
Setup:
- Subject + preview text (with AI assist on Advanced)
- From name + email (verified)
- Reply-to
- Language
   ↓
Recipients:
- Groups (multi-select)
- Segments
- Exclude groups
   ↓
Design:
- Drag-drop / Rich-text / Custom HTML (Advanced)
- Templates library (Growing+)
- AI Writing Assistant (Advanced)
- Brand kit
   ↓
Tracking:
- Click tracking
- Open tracking
- Google Analytics integration
- UTM parameters
   ↓
Preview & Test:
- Preview per device
- Inbox preview
- Test send
   ↓
Send or Schedule:
- Send now
- Schedule
- Smart sending (Advanced)
- Time-zone send
   ↓
Confirm
```

### 5.3 Build automation

```
Automations → Create workflow
   ↓
A) From scratch OR B) Template
   ↓
Step 1: Choose trigger
   - Joins a group
   - Updated field
   - Date-based (anniversary, exact date, offset)
   - Clicks a link
   - Form completion
   - Joins a segment
   - E-commerce trigger (Growing+)
   ↓
Advanced plan: add up to 3 triggers (multiple entry paths)
   ↓
Step 2: Build workflow body
   - Add Rule (Delay, Condition, A/B test)
   - Add Action (Send email, Update field, Add tag, Webhook, etc.)
   ↓
Step 3: Configure each step
   - Delay: time / specific date / event-based
   - Condition: branches based on field/group/campaign activity
   - Send email: design email inline
   ↓
Step 4: Workflow settings
   - Allow re-entry (checkbox)
   - Add existing subscribers (when activating)
   ↓
Step 5: Test
   - Send through workflow to test profile
   - Preview as specific subscriber
   ↓
Step 6: Activate
   ↓
[Workflow Active]
```

---

## 6. Viewer flow

Viewer = read-only stakeholder role.

### 6.1 Daily Viewer workflow

```
Login → Limited view (reports only)
   ↓
View:
- Campaign reports
- Automation performance
- Subscriber statistics
- Form/popup conversion
- Click maps
- Geographic distribution
   ↓
Cannot:
- Edit anything
- Send campaigns
- Manage automations
- View subscriber-level data
- Export reports
```

### 6.2 Use case

- Executive reviewing performance
- External consultant
- Marketing leadership not actively managing
- Compliance auditor

---

## 7. Accountant flow

Accountant = billing-only role.

### 7.1 Daily Accountant workflow

```
Login → Billing section only
   ↓
View:
- Current invoices
- Subscription details
- Payment history
- Plan changes
- Add-on charges
   ↓
Actions:
- Update payment method
- Download invoices
- View transaction history
   ↓
Cannot:
- Access subscribers
- Send campaigns
- View reports
- Manage anything else
```

### 7.2 Use case

- External accountant
- Finance department member
- Bookkeeper
- CFO (read-only finance overview)

---

## 8. Custom user flow

Custom user = flexible role s checkbox permissions.

### 8.1 Create Custom user

```
Settings → Users → Add user
   ↓
Email + select "Custom user" type
   ↓
Permission configuration per feature:
   Campaigns:
     □ View all
     □ View created or assigned
     □ Add/change/remove
     □ Send
   Automations:
     □ View
     □ Create/edit
     □ Activate
   Subscribers:
     □ View
     □ Add/edit
     □ Delete
     □ Export
   ... (per feature kategorie)
   ↓
Send invitation
   ↓
[Active custom user]
```

### 8.2 Common custom user patterns

#### Pattern 1: External agency (limited)
- Campaigns: View created or assigned + Add/change/remove (no send – approval workflow effectively)
- Subscribers: View only
- Reports: View
- Everything else: No

#### Pattern 2: Senior copywriter
- Campaigns: View all + Add/change/remove + Send
- Subscribers: View only
- Reports: View
- Forms: View + Create/edit
- Everything else: No

#### Pattern 3: Reports analyst
- All sections: View only where applicable
- Reports: Full view
- No edit anywhere

#### Pattern 4: API integration service account
- Best practice: use API key, not user account
- But if user needed: Custom with API: Manage + minimal else

### 8.3 Permission changes

```
Settings → Users → Edit user
   ↓
Modify checkboxes
   ↓
Save
   ↓
[Permission change immediate]
   ↓
User must refresh to see new UI
```

### 8.4 Custom user limitations

- **No "approval workflow"** like GetResponse – jen permission per asset (no send vs. send)
- **No per-list access restriction** – user sees all groups within their permission
- **No time-based permissions** (no auto-expire)
- **Permission changes affect user immediately** – no transition state

---

## 9. 14-day premium trial flow

### 9.1 Trial activation

```
New account creation
   ↓
14-day premium trial automatically active
   ↓
Full feature access during trial:
- All Advanced features
- AI Writing Assistant
- Multi-trigger automations
- Custom HTML editor
- All templates
- 24/7 live chat support
- Unlimited users
   ↓
No credit card required
```

### 9.2 During trial

```
User explores features
   ↓
Can:
- Send campaigns (within Free plan limits)
- Build complex automations (with multiple triggers)
- Test AI features
- Use templates
   ↓
Subscriber + email limits still apply per Free plan (500 subs / 12K emails)
```

### 9.3 Trial ending (3 days before)

```
Email notification: "Trial ending in 3 days"
   ↓
User can:
A) Upgrade to paid (immediate)
B) Let trial expire → revert to Free plan
   ↓
If revert to Free:
- All data preserved (subscribers, automations, forms, sites)
- Premium features locked
- Existing automations using premium triggers may pause
- Templates remain visible but cannot be edited
```

### 9.4 Trial expiration

```
Day 14 ends
   ↓
Features downgrade to Free plan capabilities
   ↓
Account data intact
   ↓
User prompted to upgrade if uses premium features
   ↓
**Can re-upgrade anytime**
```

### 9.5 Paid plan also has trial

```
Existing user upgrades to paid plan
   ↓
14-day free trial of premium tier
   ↓
After 14 days → billing starts
   ↓
Pro Advanced: try Advanced features for 14 days
```

---

## 10. Subscriber lifecycle

### 10.1 Sign-up methods

#### A) Form submission
```
Visitor fills MailerLite form (popup, embedded, landing page)
   ↓
Submit
   ↓
MailerLite:
- Validation (syntax, captcha)
- Duplicate check
- Blacklist check
- GDPR consent recorded
   ↓
Status: Pending (if double opt-in) OR Active
   ↓
Add to selected group
   ↓
Workflow trigger fires (if matches)
```

#### B) Double opt-in flow
```
Form submission
   ↓
Status: Pending (does NOT count toward billing yet)
   ↓
MailerLite sends confirmation email
   ↓
Subscriber clicks confirm link
   ↓
IP + timestamp + user agent logged
   ↓
Status: Active (counts toward billing)
   ↓
Add to specified group
   ↓
Welcome workflow trigger fires
```

#### C) E-commerce integration sync
```
Customer creates account / orders on Shopify
   ↓
Shopify webhook → MailerLite
   ↓
Subscriber created with marketing_consent flag
   ↓
Add to designated group
   ↓
Workflow trigger
```

#### D) Manual import (CSV)
```
Admin: Subscribers → Import
   ↓
CSV upload OR copy-paste
   ↓
Field mapping (email, name, custom fields)
   ↓
Choose:
- Group destination (multi-select)
- Consent confirmation required
- Skip duplicates option
- Update existing option
- Tag with import source
   ↓
Validation processed
   ↓
**MailerLite anti-spam check** – list quality assessment
   ↓
If suspicious (high bounces likely) → review possible
   ↓
Subscribers imported
```

#### E) API
```
External system POST /api/subscribers
   ↓
Body: { email, name, fields, groups }
   ↓
MailerLite validates + creates
   ↓
Add to specified groups
   ↓
Workflow trigger
```

### 10.2 Subscriber status lifecycle

```
[Pending] ──────────┐
   (double opt-in)  │
   ↓                │
[Active] ───────────┤
   ↓                │
Various transitions:
- Unsubscribed (opt-out)
- Bounced (hard bounce)
- Spam (complaint)
- Unconfirmed (form not confirmed in X days)
- Deleted (manual / GDPR)
```

### 10.3 Engagement & tracking

```
Subscribed contact
   ↓
Receives campaign or automation email
   ↓
Tracking pixel loads → Open recorded
   ↓
Click on link → MailerLite redirect tracker → Click recorded
   ↓
If MailerLite JS installed:
- Site activity tracking
- Form interactions tracked
   ↓
Subscriber profile updates:
- Last activity timestamp
- Activity timeline
- Tags (if workflow triggers)
   ↓
Segments auto-update
   ↓
Workflows trigger if matches
```

### 10.4 Preference Center

```
Email footer: "Update preferences" link
   ↓
MailerLite-hosted preference page (s tokenem)
   ↓
Subscriber vidí:
- Subscribed groups (with toggles per group)
- Personal info (editable)
- Custom field values
- "Unsubscribe from all" master toggle
   ↓
Update preferences
   ↓
Profile updated
   ↓
Workflow trigger (if "Updated field" matches)
```

### 10.5 Unsubscribe

```
Subscriber clicks Unsubscribe link
   ↓
MailerLite unsubscribe page:
- Options: from specific group / all
- Optional: reason survey
   ↓
Status: Unsubscribed
   ↓
**Does NOT count toward billing** ✓
   ↓
Data retained per GDPR
   ↓
Workflow trigger "Unsubscribed" fires
```

### 10.6 Re-subscribe

```
Previously unsubscribed subscriber fills form again
   ↓
MailerLite recognizes existing email
   ↓
If was Unsubscribed (not deleted):
- Resubscribe to specified group
- Status: Active
- Welcome workflow triggers (if matches)
- Confirmation requested per double opt-in setting
```

### 10.7 Bounce handling

#### Hard bounce
```
ISP returns 5xx
   ↓
MailerLite marks Hard Bounce
   ↓
Status: Bounced
   ↓
**Does NOT count toward billing**
   ↓
Excluded from future sends
```

#### Soft bounce
```
ISP returns 4xx (mailbox full, etc.)
   ↓
MailerLite retries
   ↓
After repeated failures → Hard bounce escalation
```

### 10.8 Spam complaint

```
Subscriber clicks "Report spam"
   ↓
ISP FBL → MailerLite
   ↓
Status: Spam
   ↓
**Auto-suppression** – never receives again
   ↓
Sender reputation impact tracking
   ↓
If complaint rate > threshold → account anti-spam review
```

---

## 11. Email lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  1. USER drafts campaign/automation email                       │
│     - Select audience (groups/segments)                         │
│     - Configure trigger (for automation)                        │
│     - Design + personalization                                  │
│                            │                                    │
│                            ▼                                    │
│  2. PRE-SEND CHECKS (MailerLite auto):                          │
│     - Sender verified?                                          │
│     - Domain authentication status                              │
│     - Audience valid?                                           │
│     - Plan limits OK?                                           │
│     - Anti-spam content check                                   │
│     - GDPR compliance footer                                    │
│                            │                                    │
│                            ▼                                    │
│  3. SEND TIME determination:                                    │
│     - Send now                                                  │
│     - Scheduled                                                 │
│     - Smart sending (Advanced – per-recipient AI optimal)       │
│     - Time-zone send                                            │
│                            │                                    │
│                            ▼                                    │
│  4. PER-RECIPIENT EMAIL GENERATION                              │
│     - Merge fields resolved                                     │
│     - Dynamic content evaluated (Growing+)                      │
│     - Tracking pixels embedded                                  │
│     - Click trackers wrapped                                    │
│                            │                                    │
│                            ▼                                    │
│  5. SMTP SEND from MailerLite EU infra (Lithuania)              │
│     - From: configured verified sender                          │
│     - DKIM signed with your domain key                          │
│     - SPF: MailerLite's mailfrom                                │
│     - DMARC compliant                                           │
│     - List-Unsubscribe header (RFC 8058)                        │
│     - One-click unsubscribe                                     │
│                            │                                    │
│                            ▼                                    │
│  6. ISP RECEIVES (Gmail/Outlook/Yahoo):                         │
│     - SPF check                                                 │
│     - DKIM verify                                               │
│     - DMARC alignment                                           │
│     - Reputation check                                          │
│     - Content filters                                           │
│                            │                                    │
│                            ▼                                    │
│  7. ROUTING:                                                    │
│     - Inbox / Primary                                           │
│     - Promotions                                                │
│     - Spam                                                      │
│     - Rejected                                                  │
│                            │                                    │
│                            ▼                                    │
│  8. RECIPIENT INTERACTION:                                      │
│     - Open → pixel → "Opened"                                   │
│     - Click → MailerLite proxy → "Clicked" + redirect           │
│     - Web tracker fires page events                             │
│                            │                                    │
│                            ▼                                    │
│  9. SUBSCRIBER UPDATE:                                          │
│     - Activity timeline updated                                 │
│     - Engagement metrics updated                                │
│     - Segments re-evaluated                                     │
│                            │                                    │
│                            ▼                                    │
│ 10. AUTO-RESEND check (Growing+):                               │
│     - If campaign has auto-resend enabled                       │
│     - Wait X hours                                              │
│     - If subscriber didn't open → resend s different subject    │
│                            │                                    │
│                            ▼                                    │
│ 11. AUTOMATION TRIGGERS:                                        │
│     - "Clicks a link" trigger fires                             │
│     - "Updated field" if engagement changes                     │
│                            │                                    │
│                            ▼                                    │
│ 12. REPORTING:                                                  │
│     - Real-time campaign stats                                  │
│     - Click maps + heatmaps                                     │
│     - Geographic data (Advanced)                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 12. Workflow execution

### 12.1 Workflow activation

```
User builds workflow (drag-drop)
   ↓
Save as Draft
   ↓
Test (optional):
- Send through to test subscriber
- Preview as specific subscriber
   ↓
Activate workflow
   ↓
MailerLite validation:
- All steps complete (green checkmarks)
- No incomplete elements
- Trigger valid
- All emails designed
   ↓
**If incomplete: error message** with incomplete steps highlighted
   ↓
[Status: Active]
   ↓
Workflow engine starts evaluating
```

### 12.2 Activation - existing subscribers prompt

When workflow activates, MailerLite asks **what to do with existing subscribers** who match trigger:

```
[Add existing subscribers?]
   - No, only add new subscribers (default)
   - Yes, add them to the start
   - Yes, add them to a specific step (choose step)
```

### 12.3 Trigger evaluation

```
Event occurs (e.g. Joins a group)
   ↓
MailerLite workflow engine evaluates active workflows
   ↓
For each workflow with matching trigger:
- Check trigger conditions
- Check if subscriber already in workflow
- Check re-entry settings
- Add subscriber to workflow execution
```

### 12.4 Workflow execution per subscriber

```
Subscriber enters at trigger
   ↓
Each step processed sequentially:
- Action: execute (send email, update field, add tag, webhook, etc.)
- Rule:
  - Delay: queue + resume
  - Condition: branch yes/no
  - A/B test: split
   ↓
Continue until:
- End of flow
- Subscriber removed from trigger group (if Joins a group trigger)
- Workflow turned off
- Subscriber unsubscribed (cancels email sends)
```

### 12.5 Re-entry rules

- Per workflow checkbox
- **Allow subscribers re-enter automation**:
  - Unchecked (default): subscriber completes once
  - Checked: re-triggers each time condition met
- Useful for: "Clicks a link" trigger (re-trigger every click)
- Not useful for: Welcome series (one-time entry)

### 12.6 Add subscribers manually

```
Automations → workflow → three-dot menu → Add subscribers
OR
Automation preview → Add subscribers
   ↓
Select subscribers (search/filter)
   ↓
Choose:
- From the beginning (default)
- From specific step
   ↓
**Bypasses trigger checks**
   ↓
**Still follows conditions within workflow**
   ↓
Subscriber starts at chosen step
```

⚠️ **Cannot add if:**
- Subscriber already in workflow
- Subscriber already completed workflow

### 12.7 Re-add failed/canceled subscribers

```
Automation → Activity tab
   ↓
Filter: Failed OR Canceled
   ↓
Select subscribers (checkboxes)
   ↓
Actions → Re-add to the sequence
   ↓
Choose step (last failed OR other step)
   ↓
Confirm
```

### 12.8 Date-based trigger execution

```
System checks date fields DAILY at 4:00 AM GMT/UTC +00:00
   ↓
For each subscriber matching date criteria:
- Trigger workflow
   ↓
Time-zone considerations:
- Date format YYYY-MM-DD required
- Default GMT/UTC +00:00 (not local TZ)
- Plan accordingly for local-time sends
```

### 12.9 Webhook step execution

```
Subscriber reaches webhook step
   ↓
MailerLite POSTs to configured URL:
   POST [webhook URL]
   Header: X-MailerLite-Secret: [secret key]
   Body: { subscriber data + workflow context }
   ↓
External system processes
   ↓
Subscriber continues to next step
```

### 12.10 Workflow logs & activity

```
Automations → workflow → Activity tab
   ↓
View:
- In queue (currently in workflow)
- Completed
- Canceled
- Failed
   ↓
Per-subscriber detail:
- Steps completed
- Where they exited
- Email metrics
```

---

## 13. Survey & Quiz flow

### 13.1 Setup

```
Surveys & Quizzes → Create survey/quiz
   ↓
Choose type:
- Survey (feedback collection)
- Quiz (with scoring)
   ↓
Step 1: Title + description
   ↓
Step 2: Questions
- Multiple choice (single/multi-select)
- Rating scale
- Text response
- Yes/No
- Date
   ↓
Step 3: Conditional logic
- Different paths per answer
- Skip questions
- End early
   ↓
Step 4 (Quiz only): Scoring
- Points per answer
- Result categories (Low / Medium / High score)
- Results page configuration
   ↓
Step 5: Settings
- Update subscriber fields based on answers
- Add tags based on answers
- Trigger automation after submission
- GDPR consent
   ↓
Step 6: Design + branding
   ↓
Publish
   ↓
Shareable link OR embed code
```

### 13.2 Subscriber takes survey/quiz

```
Visitor lands on survey/quiz
   ↓
Answers questions
   ↓
[Quiz only]: Score calculated
   ↓
Submit
   ↓
MailerLite:
- Creates/updates subscriber
- Updates custom fields (per Q&A)
- Adds tags (per Q&A)
- Triggers automation (if configured)
   ↓
Results page shown (Quiz)
OR
Thank you page (Survey)
```

### 13.3 Quiz lead-magnet pattern

Popular use case:
- Personality / type quiz
- Pre-question collection (email required to see results)
- Auto-segment based on results
- Targeted welcome series per quiz result type

```
Quiz: "What kind of marketer are you?"
   ↓
Question flow: 5-10 questions
   ↓
Score → category (e.g. "Data-driven" / "Creative" / "Strategist")
   ↓
Email field required for results
   ↓
Subscriber created
- Tag: "QuizResult:DataDriven"
- Custom field: quiz_result = "Data-driven"
   ↓
Trigger: "Joins a group" or "Updated field"
   ↓
Result-specific welcome series
   ↓
Personalized content per result category
```

---

## 14. E-commerce flow

### 14.1 Integration setup

```
Owner: Integrations → Choose e-commerce (Shopify, WooCommerce, etc.)
   ↓
OAuth authorize / plugin install
   ↓
Initial sync:
- Customers → subscribers (with consent flag)
- Orders → custom fields + events
- Products → catalog
- Abandoned cart events
   ↓
Continuous sync via webhooks
   ↓
[Integration active]
```

### 14.2 Abandoned cart flow

```
Customer adds to cart on store
   ↓
Store webhook → MailerLite: abandoned cart event
   ↓
If checkout not completed in X hours:
- Workflow trigger: "Abandoned cart"
- (E-commerce automation trigger)
   ↓
Email 1 (1 hour delay): "Forgot something?"
- E-commerce blocks display cart items
- Direct checkout link
   ↓
Wait 24 hours
   ↓
Condition: Did they purchase?
   YES → Exit
   NO → Email 2 with 10% discount
   ↓
Wait 48 hours
   ↓
Condition: Did they purchase?
   YES → Exit
   NO → Email 3 (final reminder)
```

### 14.3 Post-purchase flow

```
Order placed → "Purchases a specific product" event (or generic "Purchase")
   ↓
Trigger: Post-purchase workflow
   ↓
Email 1: Order confirmation (typically sent by store, but MailerLite can do)
   ↓
Wait 7 days
   ↓
Email 2: "How are you enjoying your product?" + tutorial
   ↓
Wait 14 days
   ↓
Email 3: Review request
- E-commerce review block
- Link to review platform
   ↓
Wait 30 days
   ↓
Cross-sell / upsell email
- Recommendations based on purchase
```

### 14.4 First-time buyer welcome

```
Trigger: "First purchase" e-commerce event
   ↓
Welcome series for new customers:
- Brand story
- Care instructions
- Loyalty program intro (if applicable)
- Early access offers
```

### 14.5 E-commerce blocks v emailech

V email editoru (Growing+):
- **Product block** – dynamic product showcase
- **Cart block** – display abandoned cart contents
- **Recommendations block** – similar/related products
- **Order details block** – for confirmation emails
- **Discount code block** – generated code per subscriber
- **Review request block**

### 14.6 E-commerce reports

```
Reports → E-commerce
   ↓
View:
- Revenue per campaign
- Top products sold (attributed)
- Customer lifetime value (basic)
- Conversion rate per email
- ROI per automation
```

---

## 15. Digital products & Paid newsletter flow

### 15.1 Digital product sale flow

```
Setup (Growing+):
   Sites → Create site OR Landing page → Add digital product
   ↓
   Configure:
   - Product name, description, images
   - File upload (eBook PDF, video, etc.)
   - Price + currency
   - Stripe / PayPal connection
   ↓
   Publish product page
   ↓
Customer visits page
   ↓
Clicks "Buy"
   ↓
Stripe checkout
   ↓
Payment processed
   ↓
MailerLite:
- Creates subscriber (if new)
- Adds to "Customers" group (configurable)
- Tags: "Bought: [product_name]"
- Auto-delivery email with download link
- Trigger post-purchase workflow
   ↓
Customer receives product
   ↓
Optional: post-purchase upsell workflow
```

### 15.2 Paid newsletter flow

```
Setup paid newsletter (Growing+):
   Subscribers → Paid newsletter
   ↓
   Configure:
   - Newsletter name
   - Pricing tiers (monthly $X, yearly $Y)
   - Stripe integration
   - Free preview content (optional)
   - Members-only group designation
   ↓
   Publish subscription page
   ↓
Subscriber visits page
   ↓
Selects tier + payment
   ↓
Stripe recurring subscription created
   ↓
MailerLite:
- Adds subscriber to paid group
- Tag: "Paid:[tier_name]"
- Welcome workflow triggered
   ↓
Future paid newsletters sent only to paid group
   ↓
If subscription cancels (Stripe webhook):
- Auto-tag "Cancelled"
- Remove from paid group
- Trigger winback workflow (optional)
```

### 15.3 Subscriber management for paid content

```
Paid subscriber profile shows:
- Subscription tier
- Billing status
- Payment history
- Member-since date
- Future renewal date
   ↓
Cancellation flow:
- Manual via UI (Admin)
- Subscriber self-service via portal
- Stripe webhook handles backend
```

### 15.4 Limitations

- **No native member management** like dedicated platforms (Substack, Ghost)
- **No comment system** for paid newsletters
- **No podcast hosting**
- **Limited author profiles** / multi-author
- **Stripe transaction fees 2.9% + $0.30** standard

---

## 16. MailerSend separation flow

**Klíčový flow:** MailerLite a MailerSend jsou **separate platforms** stejné společnosti.

### 16.1 Architectural difference

```
MailerLite (Marketing):
- Subscribers, groups, segments
- Campaigns + automations
- Forms, popups, landing pages
- Websites
- User accounts

MailerSend (Transactional):
- API-first transactional email
- Templates with variables
- Recipients (one-off, ad-hoc)
- SMTP relay
- SMS API (limited regions)
- Inbound parsing
- Email validation
- Separate user accounts
```

### 16.2 No unified contact view

```
Customer signs up in MailerLite (marketing list)
   ↓ separate system
MailerSend sends them order confirmation (transactional)
   ↓
**No automatic profile merge between systems**
   ↓
Same email but separate records in each
```

### 16.3 Recommended integration pattern

```
E-commerce store (Shopify)
   ↓
   ├─→ MailerLite (marketing subscribers, campaigns, automations)
   │      - Customer in "Customers" group
   │      - Targeted with cross-sell/upsell
   │
   └─→ MailerSend (transactional)
          - Order confirmations
          - Shipping notifications
          - Password resets
   ↓
**Two separate API integrations needed**
```

### 16.4 MailerLite → MailerSend handoff

Pokud chcete trigger transactional z MailerLite workflow:

```
MailerLite automation reaches webhook step
   ↓
Webhook → custom middleware (server) OR direct to MailerSend API
   ↓
Middleware/integration:
- Receives webhook
- Calls MailerSend API
- POST /email with template + recipient + variables
   ↓
MailerSend sends transactional email
```

Většinou ale **MailerSend sends transactionals directly** when triggered by store/app events, ne přes MailerLite workflow.

### 16.5 MailerSend access for MailerLite users

```
Existing MailerLite account does NOT include MailerSend
   ↓
Owner: Visit mailersend.com → Sign up separately
   ↓
Create MailerSend account
   ↓
Separate billing
   ↓
Both can be managed by same team but separately
```

### 16.6 MailerSend pricing

- **Free tier:** 3 000 emails/month
- **Hobby:** $28/měsíc pro 50K emails
- Scales by volume

### 16.7 Limitations comparison

| Feature | MailerLite (built-in) | MailerSend (separate) |
|---|---|---|
| Marketing campaigns | ✅ | ❌ |
| Transactional API | ❌ | ✅ |
| SMTP relay | ❌ | ✅ |
| Templates | ✅ (marketing) | ✅ (transactional) |
| Subscriber management | ✅ | – |
| Drag-drop editor | ✅ | ✅ |
| Automations / workflows | ✅ | ❌ |
| Webhooks (events out) | Limited | ✅ |
| Email validation API | ❌ | ✅ |
| SMS API | ❌ | ✅ (limited) |

Pro firmy chtějící marketing + transactional v jednom: **Brevo lepší** (jediná platforma).

---

## 17. API & Integration flow

### 17.1 API key creation

```
Settings → Integrations → API
   ↓
Generate new API key
   ↓
Name the key (descriptive)
   ↓
**Key generated and displayed**
   ↓
Copy + store securely
   ↓
**Note:** key remains visible v UI (lze později view) – nezvykle (jiné platformy displayonly-once)
```

### 17.2 API request flow

```
Application code:
   POST https://connect.mailerlite.com/api/subscribers
   Headers:
     Authorization: Bearer {api_key}
     Content-Type: application/json
   Body: { "email": "...", "fields": { "name": "..." }, "groups": ["group_id"] }
   ↓
MailerLite:
- Validates auth
- Rate limit check
- Validates payload
   ↓
Response 200/201
   ↓
Subscriber created/updated
   ↓
Workflow triggered if applicable
```

### 17.3 Webhook flow

```
Integration setup:
   Settings → Integrations → Webhooks
   ↓
   Add webhook:
   - Target URL
   - Events to subscribe (multi-select)
   ↓
For each subscribed event:
- MailerLite POSTs to URL
- Includes secret key in header for verification
   ↓
Application receives webhook
   ↓
Verify signature
   ↓
Process event
```

### 17.4 Available webhook events

- subscriber.create
- subscriber.update
- subscriber.unsubscribe
- subscriber.bounce
- subscriber.spam_report
- campaign.sent
- campaign.opened
- campaign.clicked
- form.subscribe
- automation.completed
- automation.cancelled

### 17.5 Plugin install (WordPress example)

```
Admin: WordPress → Plugins → MailerLite for WordPress → Install
   ↓
Activate
   ↓
Configure:
- API key
- Default group
- Form display options
- WooCommerce integration toggle
   ↓
Plugin auto-syncs:
- WP users → MailerLite subscribers
- WooCommerce orders → events
- Embedded forms via shortcode
```

### 17.6 iPaaS integration (Zapier example)

```
Zapier: Create new Zap
   ↓
Trigger: MailerLite event (e.g. New subscriber)
   ↓
Auth: MailerLite API key
   ↓
Action: Some external app (Google Sheets, Slack, etc.)
   ↓
Test
   ↓
Activate Zap
   ↓
[Real-time sync active]
```

---

## 18. GDPR & Compliance flow

### 18.1 EU hosting advantage

```
MailerLite servers v Litvě (EU)
   ↓
ISO 27001 certified data center
   ↓
EU data residency default
   ↓
GDPR by design
   ↓
DPA available electronically
```

### 18.2 Right to Be Forgotten

```
Subscriber requests deletion
   ↓
Method A: UI
- Admin: Subscriber → Actions → Delete permanently
- Confirmation
- Delete

Method B: API
- DELETE /api/subscribers/{id}
- Permanent removal

Method C: Subscriber self-service
- Unsubscribe page may include delete option
- User confirms identity
   ↓
MailerLite:
- Removes subscriber data
- Anonymizes related events
- Adds to suppression list
- Logs deletion event
- Email confirmation
```

### 18.3 Data export per subscriber

```
Admin: Subscriber profile → Actions → Download subscriber data
OR
API: GET /api/subscribers/{id} + related data
   ↓
MailerLite generates JSON/CSV with:
- Profile data
- Activity history
- Subscriptions
- Form submissions
- Event log
   ↓
Provides download
```

### 18.4 Consent tracking

For each subscriber:
- Per-form consent timestamp + IP
- Per-group opt-in source
- Double opt-in audit (if applicable)
- GDPR consent fields per submission

### 18.5 GDPR consent fields

```
Forms → Edit form → Add GDPR consent field
   ↓
Configure:
- Consent text shown to subscribers
- Required vs. optional
- Linked to specific opt-in type
   ↓
Subscriber must check to subscribe
   ↓
Consent recorded
   ↓
Workflow filter: subscribers with specific consent
```

### 18.6 Anti-spam policy flow

MailerLite monitoruje accounts:

```
List quality check (import / send time):
- Email syntax validation
- Bounce rate prediction
- Spam complaint rate monitoring
- Engagement scoring
   ↓
If suspicious signals:
- Internal review
- Account warning
- Send pause possible
- In severe cases: account suspension
   ↓
Owner notification + appeal process
```

### 18.7 Compliance scenarios that trigger review

- **Purchased lists** – immediate suspension typical
- **Sudden large list import** with low engagement
- **High bounce rate** (> 5%) on initial sends
- **High spam complaint rate** (> 0.3%)
- **Content matching prohibited categories** (gambling, adult, certain financial)
- **Suspicious affiliate marketing patterns**

---

## 19. Datová mapa: co vidí kdo

| Data | Owner | Admin | Manager | Viewer | Accountant | Custom | Subscriber | API |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Account settings | ✅ | ✅ | ❌ | ❌ | ❌ | per role | ❌ | per scope |
| Billing | ✅ | ✅ | ❌ | ❌ | ✅ | per role | ❌ | per scope |
| User management | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | per scope |
| All subscribers | ✅ | ✅ | ✅ | ❌ | ❌ | per role | jen sebe | ✅ |
| Edit subscribers | ✅ | ✅ | ✅ | ❌ | ❌ | per role | ❌ | ✅ |
| Export subscribers | ✅ | ✅ | ❌ | ❌ | ❌ | per role | ❌ | ✅ |
| Groups | ✅ | ✅ | ✅ | ❌ | ❌ | per role | – | ✅ |
| Segments | ✅ | ✅ | ✅ | ❌ | ❌ | per role | – | ✅ |
| Campaigns | ✅ | ✅ | ✅ | ❌ | ❌ | per role | jen co dostal | ✅ |
| Send campaigns | ✅ | ✅ | ✅ | ❌ | ❌ | per role | ❌ | ✅ |
| Automations | ✅ | ✅ | ✅ | ❌ | ❌ | per role | ❌ | ✅ |
| Forms | ✅ | ✅ | ✅ | ❌ | ❌ | per role | submit only | ✅ |
| Landing pages | ✅ | ✅ | ✅ | ❌ | ❌ | per role | view only | ✅ |
| Websites | ✅ | ✅ | ✅ | ❌ | ❌ | per role | view only | per scope |
| Surveys/Quizzes | ✅ | ✅ | ✅ | ❌ | ❌ | per role | take only | per scope |
| Digital products | ✅ | ✅ | ✅ | ❌ | ❌ | per role | buy only | per scope |
| Paid newsletters | ✅ | ✅ | ✅ | ❌ | ❌ | per role | subscribe | per scope |
| Reports | ✅ | ✅ | ✅ | ✅ | ❌ | per role | ❌ | ✅ |
| API keys | ✅ | ✅ | ❌ | ❌ | ❌ | per role | ❌ | – |
| Integrations | ✅ | ✅ | ✅ | ❌ | ❌ | per role | ❌ | per scope |
| Domains | ✅ | ✅ | ❌ | ❌ | ❌ | per role | ❌ | per scope |
| GDPR delete | ✅ | ✅ | per role | ❌ | ❌ | per role | request | per scope |

---

## 20. Známé úzkoprofilové místa

### 20.1 Role/User management

- **No multi-user na Free** – Owner only
- **Growing Business: 3 users limit** – malé teams ok, ale agentury těsné
- **Advanced: unlimited users** – první tier s real team support
- **5 default roles fixed** – nelze rename / edit
- **Custom user permissions checkbox-based** – ne pre-built custom roles jako Klaviyo Permission Sets
- **No per-group access restriction** – user vidí všechny groups within permission
- **No SSO/SAML mimo Enterprise**
- **No SCIM provisioning**
- **Ownership transfer přes support** – ne self-service

### 20.2 Plán limitations

- **Free plan reduction Sept 2025** (1 000 → 500 subscribers) – mnoho users na hraně
- **Free: no templates** – frustrating for beginners
- **Free: 30-day support limit** – pak community only
- **Single trigger on Free + Growing** – multi-trigger jen Advanced
- **AI Writing Assistant jen Advanced**
- **24/7 live chat jen Advanced** – ostatní email only
- **Dedicated IP only Enterprise**
- **Auto-upgrade tier without manual approval** – billing surprises possible

### 20.3 Automation gotchas

- **Date-based trigger checks daily at 4 AM GMT/UTC** – ne real-time
- **Date format must be YYYY-MM-DD** – import data validation needed
- **Workflow validation:** must complete all steps before activation
- **Re-entry rules** can be subtle (re-trigger every click vs. once)
- **Existing subscribers prompt** at activation – easy to miss
- **Failed/canceled re-add** manual process
- **No advanced filtering** within workflow
- **No advanced branching** like ActiveCampaign / GetResponse
- **No A/B test goal automation** – manual analysis

### 20.4 Survey/Quiz limitations

- **No advanced logic chains** like Typeform
- **Limited question types** vs. dedicated survey tools
- **No data export per quiz response** beyond CSV

### 20.5 E-commerce gaps vs. Klaviyo

- **No predictive analytics** (CLV, churn)
- **No browse abandonment** (cart yes)
- **No RFM cohorts automatic**
- **No AI product recommendations** v emailech
- **Less polished Shopify integration**
- **Limited e-commerce reports** depth

### 20.6 UI/UX issues

- **No Czech/Slovak/Polish UI** (Polish jen v self-service docs after FreshMail)
- **Editor občas buggy v Safari** (reported issue)
- **Limited time-engaged metrics** in segmentation
- **Mobile app limited** vs. konkurence
- **Some templates aging**

### 20.7 Anti-spam policy issues

- **Strict enforcement** – occasional false-positive suspensions
- **Affiliate marketing restrictions** – některé use cases ne
- **Account review process** může being slow
- **Appeal mechanism** limited transparency

### 20.8 MailerSend separation pain points

- **Two separate accounts** for marketing + transactional
- **Separate billing** + dashboards
- **No unified contact view**
- **Marketing workflow cannot directly trigger transactional**
- **Setup complexity** for full e-commerce stack

### 20.9 Migration challenges

- **No native flow export to other platforms**
- **Templates: HTML export OK** but lose blocks
- **Historical campaign data limited** portability
- **Surveys/quizzes responses limited export**
- **Paid newsletter subscriber state** difficult to migrate
- **Custom user permissions** must be recreated per new platform

### 20.10 Pricing surprises

- **Free plan reduction Sept 2025** (mostly noted concern)
- **Auto-upgrade billing** without explicit consent
- **No refunds** policy
- **Stripe fees 2.9% + $0.30** on digital products / paid newsletters
- **Annual saves only 10%** vs. industry-typical 15-30%

---

## 21. Doporučení pro design vlastních procesů

Pokud MailerLite používáte v týmu, doporučujeme:

1. **Domain authentication první den** – DKIM + SPF + branded tracking
2. **Sender verification** – verify both domain + email
3. **List import hygiene** – nikdy purchase lists, vždy double opt-in
4. **Custom users strategy** – build per-job-function s pečlivými checkboxes
5. **Naming convention** pro workflows, groups, segments (e.g. "WELCOME_2026_Q2")
6. **Test subscriber** dedicated pro QA campaigns + workflows
7. **API key servisní účet** – named per integration (e.g. "Shopify Sync", "WordPress Plugin")
8. **Workflow templates** library – save canonical workflows
9. **Quarterly audit** users + permissions + integrations
10. **Subscriber cleanup** – pravidelný re-engagement → suprese plan (saves billing)
11. **Date format standardization** YYYY-MM-DD pro date-based automations
12. **GDPR consent fields** ve všech forms
13. **Anti-spam compliance** – monitor bounce + complaint rates
14. **Backup strategy** – pravidelný export subscribers + workflow definitions
15. **MailerSend evaluation** – pokud potřebujete transactional, nezapomeňte na separate setup
16. **E-commerce integration** – Shopify/WooCommerce deep configure
17. **Auto-resend** strategicky – nezneužívat (otravnost)
18. **Smart sending** (Advanced) – AI optimal time pro engagement
19. **A/B testing** plán – test pravidelně subject + content
20. **Plan threshold alerting** – monitor subscriber count vs. tier limit

---

*Dokument zpracován z oficiálních zdrojů mailerlite.com/help, mailerlite.com/pricing, mailerlite.com/features a praktických zdrojů (EmailToolTester, EmailVendorSelection, Sender, ThatMarketingBuddy, CostBench, Mailotrix, Sprout24, SendX). Pro nejaktuálnější detaily vždy konzultovat MailerLite Help Center.*
