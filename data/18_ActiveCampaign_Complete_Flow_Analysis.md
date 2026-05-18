# ActiveCampaign – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v ActiveCampaign prochází data, lidé a akce – od Account Admin přes specializované user groups, CRM users, integrace, až po koncového kontakta.

> Tento dokument doplňuje `17_ActiveCampaign_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** ActiveCampaign umí, tento popisuje, **kdo s tím interaguje a jak data tečou**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
> - **Group-based permissions** (ne user-based) – uživatelé patří do groups, groups mají permissions
> - **Žádné pre-defined role** – všechno custom groups (kromě Admin)
> - **Account Admin** = nejvyšší role (always v Admin group)
> - **Per-feature permissions** + **list access** + **limits** per group
> - **Per-pipeline access** v CRM
> - **Per-automation user group access**
> - **Deal owner visibility** rules (admin sees all, owner sees own)
> - **API credentials per user** – deletion breaks integrations (kritické!)
> - **14-day free trial** s Pro features, no credit card
> - **No free plan** (vs. Mailchimp, MailerLite, Brevo)
> - **180K+ zákazníků**, modular add-on architektura
> - **November 2025 billing change:** new users billed for ALL contacts (incl. unsubscribed)

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [User & Group based permissions](#2-permissions-model)
3. [Default groups & custom groups](#3-default-groups)
4. [User management flow](#4-user-management)
5. [Account Admin flow](#5-account-admin-flow)
6. [Marketing user flow](#6-marketing-user-flow)
7. [Sales user flow (CRM)](#7-sales-user-flow)
8. [API credentials per user (kritický bod)](#8-api-credentials)
9. [Onboarding flow](#9-onboarding-flow)
10. [Contact lifecycle](#10-contact-lifecycle)
11. [Email lifecycle](#11-email-lifecycle)
12. [Automation execution model](#12-automation-execution)
13. [Site Tracking & Site Messages flow](#13-site-tracking-flow)
14. [CRM lifecycle (Deals & Pipelines)](#14-crm-flow)
15. [Account ↔ Contact relationship](#15-account-contact)
16. [Sales Engagement flow (B2B)](#16-sales-engagement-flow)
17. [E-commerce data flow](#17-ecommerce-flow)
18. [API & Integration flow](#18-integration-flow)
19. [GDPR & Compliance flow](#19-gdpr-flow)
20. [Datová mapa: co vidí kdo](#20-datová-mapa)
21. [Známé úzkoprofilové místa](#21-úzkoprofilové-místa)

---

## 1. Mapa aktérů

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│         ACTIVECAMPAIGN PLATFORM ECOSYSTEM                          │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [ActiveCampaign Internal Team]                                    │
│   ├─ Customer Success (Enterprise dedicated, others shared)        │
│   ├─ Technical Support (24/7 standard, priority Pro+)              │
│   ├─ Migration team (free migration assistance)                    │
│   ├─ Deliverability team                                           │
│   ├─ Sales (for upgrades + add-ons)                                │
│   └─ Account / billing team                                        │
│           │ (touchpoints based on plan tier)                       │
│           ▼                                                        │
│                                                                    │
│   ┌──────────────────────────────────────────┐                     │
│   │   ActiveCampaign Account                 │                     │
│   │                                          │                     │
│   │   GROUP-BASED PERMISSIONS:               │                     │
│   │   ├─ Admin group (always exists)         │◄── full access     │
│   │   ├─ Custom groups (you create)          │◄── per perms       │
│   │   │   - Marketing                        │                     │
│   │   │   - Sales                            │                     │
│   │   │   - Support                          │                     │
│   │   │   - Designer                         │                     │
│   │   │   - External agency                  │                     │
│   │   │   - Read-only stakeholder            │                     │
│   │   │   - ... (per business needs)         │                     │
│   │   │                                      │                     │
│   │   └─ Users assigned to ONE group         │                     │
│   │                                          │                     │
│   │   User seats limits:                     │                     │
│   │   - Starter: 1 user                      │                     │
│   │   - Plus: 1 user (purchase more)         │                     │
│   │   - Pro: 3 users included                │                     │
│   │   - Enterprise: 5 users included         │                     │
│   │   - Additional seats purchasable         │                     │
│   │                                          │                     │
│   │   + Sub-accounts (Plus+ limited,         │                     │
│   │     Enterprise full)                     │                     │
│   └──────────────┬───────────────────────────┘                     │
│                  │                                                 │
│                  ▼                                                 │
│   [Contacts (no separate "subscribers" entity)]                    │
│       │                                                            │
│       ├─→ marketing emails (campaigns + automations)               │
│       ├─→ behavior tracking (site tracking)                        │
│       ├─→ site messages (on-site personalization)                  │
│       ├─→ 1:1 emails (from CRM)                                    │
│       ├─→ SMS / WhatsApp (add-ons)                                 │
│       ├─→ transactional (Postmark)                                 │
│       ├─→ form submissions                                         │
│       └─→ subscription preference management                       │
│                  │                                                 │
│                  ▼                                                 │
│   [CRM Layer (add-on)]                                             │
│       ├─→ Accounts (companies)                                     │
│       ├─→ Deals (opportunities)                                    │
│       ├─→ Pipelines (sales process)                                │
│       ├─→ Tasks & Activities                                       │
│       └─→ 1:1 Emails                                               │
│                  │                                                 │
│                  ▼                                                 │
│   [Integrations (970+)]                                            │
│   E-commerce, CRM, Productivity, iPaaS                             │
│                                                                    │
│   ┌──────────────────────────────────────────┐                     │
│   │   Postmark (Transactional Email add-on)  │                     │
│   │   Acquired 2022, integrated platform     │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér | Vstupní bod | Co dělá | Co vidí |
|---|---|---|---|
| **Account Admin** | First user during signup | Vše + billing + close account + user management | Vše |
| **Admin group users** | Pozvánka do Admin group | Full access | Vše |
| **Marketing user** | Pozvánka do Marketing group | Marketing tasks per permissions | Per group perms |
| **Sales user** | Pozvánka do Sales group | CRM tasks per permissions | Per group perms |
| **Designer user** | Pozvánka s custom group | Template + landing page work | Per role |
| **External agency** | Pozvánka s restricted group | Limited per permissions | Per role |
| **Read-only user** | Pozvánka s view-only group | View reports only | Per role |
| **Contact / Customer** | Form, integration, anon tracking | Receives emails, browses, buys | Své komunikace |
| **API Client** | Per-user API key | Per scope | Per scope |
| **Integration (Shopify, WP)** | OAuth via user | Sync data | Per integration scope |
| **Postmark API** | API key (Transactional add-on) | Transactional sends | Postmark scope |
| **ActiveCampaign Staff** | Interní s consent | Support, debug | Limited |

---

## 2. User & Group based permissions

ActiveCampaign **unique permissioning model**: **group-based, not role-based**.

### 2.1 Architectural difference

```
HubSpot/Klaviyo/Mailchimp:
- Pre-defined roles (Admin, Manager, Editor, Viewer)
- Each role has fixed permissions
- User assigned to one role

ActiveCampaign:
- Custom groups (you create)
- Each group has fully customizable permissions
- User assigned to ONE group
- "Admin" is the only built-in group
- Everyone else is custom
```

### 2.2 Group structure

Each group has 3 tabs of configuration:

#### "Info" tab
- **Title** (group name)
- **Description**
- **Lists access** – which contact lists this group can see

#### "Permissions" tab
- Per-feature permissions across all platform sections:
  - Contacts
  - Campaigns
  - Automations
  - Forms
  - Landing pages
  - Deals (CRM)
  - Reports
  - Settings
  - Account
  - User Management
  - Integrations
  - API
  - and more

Each section has granular checkboxes:
- View
- Create
- Edit
- Delete
- Send (for campaigns)
- Activate (for automations)
- Export
- Per-feature specifics

#### "Limits" tab
- **Limit campaigns sent** per group
- **Limit contacts** they can manage
- **Limit features** they can use beyond X
- **Limit emails sent** beyond X

### 2.3 Why group-based?

**Advantage:** Highly flexible per business needs. No "wasted" permissions on built-in roles.

**Disadvantage:**
- **Steeper learning curve** vs. predefined roles
- **More configuration** required upfront
- **Easier to misconfigure**

### 2.4 Permission inheritance

- User inherits **all permissions of their group**
- **Cannot override** per user
- **Multiple users in same group** = identical access
- **Move user between groups** to change permissions

### 2.5 Per-feature permission examples

#### Marketing group (typical)
- **Campaigns:** View, Create, Edit, Send
- **Templates:** View, Create, Edit
- **Forms:** View, Create, Edit
- **Landing pages:** View, Create, Edit, Publish
- **Automations:** View, Create, Edit, Activate
- **Contacts:** View (all lists), Edit, Add
- **Reports:** View
- **No access:** Deals (CRM), Account settings, Billing, User management

#### Sales group (typical)
- **Deals:** View, Create, Edit, Delete (with deal owner rules)
- **Tasks:** Full
- **Accounts:** View, Create, Edit
- **Contacts:** View (per lists assigned), Edit
- **1:1 emails:** Send
- **Reports:** View (sales-specific)
- **No access:** Campaigns, Automations (typically), Account settings

#### Designer group (typical)
- **Templates:** View, Create, Edit
- **Landing pages:** View, Create, Edit
- **Forms:** View, Create, Edit
- **Campaigns:** View, Create, Edit (NO send)
- **Contacts:** View limited (typically no access)
- **No access:** Deals, Automations editing, Settings, Billing

#### Stakeholder / Executive (typical)
- **All sections:** View only
- **Reports:** View
- **No edit anywhere**
- **No send / activate**

### 2.6 Special: Admin group

- **Built-in, cannot be deleted**
- **Always has full access**
- **At least one user must be Admin**
- **First user during signup** = Admin
- **Admin can configure all other groups**
- **Admin sees all deals** regardless of deal ownership
- **Admin can manage users + billing**

### 2.7 Permission matrix (typical custom groups)

| Akce | Admin | Marketing | Sales | Designer | View-only |
|---|:---:|:---:|:---:|:---:|:---:|
| **Account & Billing** |  |  |  |  |  |
| Account settings | ✅ | ❌ | ❌ | ❌ | ❌ |
| Billing | ✅ | ❌ | ❌ | ❌ | ❌ |
| Close account | ✅ | ❌ | ❌ | ❌ | ❌ |
| **User Management** |  |  |  |  |  |
| Add/edit/delete users | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage groups | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Contacts** |  |  |  |  |  |
| View contacts | ✅ | ✅ | per list | view | view |
| Add/edit contacts | ✅ | ✅ | per list | ❌ | ❌ |
| Export contacts | ✅ | per perm | per perm | ❌ | ❌ |
| Import contacts | ✅ | ✅ | per perm | ❌ | ❌ |
| Delete contacts | ✅ | per perm | ❌ | ❌ | ❌ |
| **Campaigns** |  |  |  |  |  |
| View | ✅ | ✅ | ❌ | ✅ | view |
| Create/edit | ✅ | ✅ | ❌ | ✅ | ❌ |
| Send | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Automations** |  |  |  |  |  |
| View | ✅ | ✅ | per perm | ❌ | view |
| Create/edit | ✅ | ✅ | ❌ | ❌ | ❌ |
| Activate | ✅ | ✅ | ❌ | ❌ | ❌ |
| Per-automation access | ✅ | per perm | per perm | ❌ | ❌ |
| **Forms / Landing pages** |  |  |  |  |  |
| View | ✅ | ✅ | ❌ | ✅ | view |
| Create/edit | ✅ | ✅ | ❌ | ✅ | ❌ |
| Publish | ✅ | ✅ | ❌ | per perm | ❌ |
| **Templates** |  |  |  |  |  |
| View | ✅ | ✅ | ❌ | ✅ | view |
| Create/edit | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Deals (CRM)** |  |  |  |  |  |
| View deals | ✅ | ❌ | own only | ❌ | view |
| Create/edit deals | ✅ | ❌ | ✅ | ❌ | ❌ |
| Pipeline access | ✅ | ❌ | per pipeline | ❌ | ❌ |
| Reassign deals | ✅ | ❌ | per perm | ❌ | ❌ |
| **Accounts (B2B)** |  |  |  |  |  |
| View accounts | ✅ | view | ✅ | ❌ | view |
| Edit accounts | ✅ | ❌ | ✅ | ❌ | ❌ |
| Reassign accounts | ✅ | ❌ | per perm | ❌ | ❌ |
| **Tasks & Activities** |  |  |  |  |  |
| Manage tasks | ✅ | ❌ | ✅ | ❌ | view |
| **Reports** |  |  |  |  |  |
| View | ✅ | ✅ | per perm | ❌ | ✅ |
| Custom reports | ✅ | per perm | per perm | ❌ | view |
| **Integrations** |  |  |  |  |  |
| Manage | ✅ | per perm | ❌ | ❌ | ❌ |
| **API** |  |  |  |  |  |
| Manage API keys | ✅ | ❌ | ❌ | ❌ | ❌ |
| Per-user API key | ✅ (own) | per perm | per perm | per perm | per perm |
| **Settings** |  |  |  |  |  |
| Account settings | ✅ | ❌ | ❌ | ❌ | ❌ |
| User settings | each user own | each user own | each user own | each user own | each user own |

### 2.8 User seat allowances per plan

| Plán | Users incl. |
|---|---|
| **Starter** | 1 |
| **Plus** | 1 (purchase more) |
| **Pro** | 3 |
| **Enterprise** | 5 |

- **Additional seats purchasable** from Billing & Upgrade
- **Sub-accounts** (multi-account) at higher tiers

---

## 3. Default groups & custom groups

### 3.1 Default: Admin group only

ActiveCampaign creates **only Admin group** by default.

```
New account created
   ↓
First user = Account Admin (in Admin group)
   ↓
**No other groups exist initially**
   ↓
Admin must create custom groups as needed
```

### 3.2 Building custom groups

Most accounts build groups per team structure:

#### Marketing
- Marketing manager
- Email specialist
- Content creator
- Marketing coordinator

#### Sales
- Sales manager
- SDR (Sales Development Rep)
- AE (Account Executive)
- Customer Success

#### Operations
- Marketing operations
- Sales operations
- Data analyst

#### External
- Agency partners
- Contractors
- Freelancers

#### Special
- Executives (read-only)
- Auditors
- Compliance team

### 3.3 Best practices group naming

```
By Function: Marketing, Sales, Customer Success, Support
By Team: Email Team, Design Team, Content Team, Sales Team
By Role: Senior Marketer, Junior Marketer, Lead Designer
By Access Level: Full Marketing, Marketing View Only
By Project: Agency Project A, Internal Team B
```

### 3.4 Group lifecycle

```
Admin: Settings → Users & Groups → Groups tab
   ↓
+ Add a new group
   ↓
Configure:
- Info tab (title, description, lists access)
- Permissions tab (per-feature checkboxes)
- Limits tab (optional usage limits)
   ↓
Save
   ↓
[Group ready]
   ↓
Assign users to this group during user creation
OR
Move existing users to this group
```

### 3.5 Group modification

- **Edit group permissions** anytime
- **Changes immediate** to all users in group
- **No history** of changes (limited audit trail)
- **Cannot rename Admin group**
- **Delete group:** users must be moved first

---

## 4. User management flow

### 4.1 Add new user

```
Admin: Settings → Users and Groups → "Add a new user"
   ↓
Modal opens, complete fields:
- **Group** (select from existing groups)
- **First name, Last name**
- **Email** (becomes login)
- **Phone** (optional)
- **Purchase Permissions** – allow billing changes?
- **Multi-Factor Authentication** – force 2FA?
- Other personal details
   ↓
Save
   ↓
**Invitation email sent** to user
   ↓
User clicks invitation link
   ↓
Sets password
   ↓
[Active user with group's permissions]
```

### 4.2 Seat assignment

- **One seat per user**
- **Seats limited by plan** (Starter 1, Plus 1, Pro 3, Enterprise 5)
- **Purchase additional seats** from Billing & Upgrade page
- **Reassign seats** between people (after delete + create new)

### 4.3 User deletion (KRITICKÝ FLOW!)

Per oficiální docs:

```
Admin: Settings → Users and Groups → locate user
   ↓
Click checkbox + Delete OR caret + Delete
   ↓
**WARNING modal:**
- If integrations setup with this user's API credentials → **integrations will break**
- Must update affected integrations with another user's API credentials
- **No account-default API** – per user only
   ↓
**Pre-deletion cleanup required:**
- Reassign lists owned by this user
- Reassign Accounts owned by this user
- Reassign Deals owned by this user
- Reassign Tasks owned by this user
   ↓
Confirm delete
   ↓
**This action CANNOT be undone**
   ↓
User removed
   ↓
**Seat NOT removed** (still counted in plan)
- Can reassign seat or leave empty
- Reduce seats from Billing & Upgrade
```

⚠️ **API key cascade impact** je největší známé úzkoprofilové místo!

### 4.4 Purchase additional seats

```
Two paths:
A) Billing & Upgrade
B) Usage page

Click "Edit" next to "X User Seat" (under plan name)
   ↓
Modal opens
   ↓
Use +/- buttons to choose
   ↓
Continue
   ↓
Review pricing
   ↓
Confirm purchase
   ↓
[Seats added]
```

### 4.5 User profile

Each user has:
- **Personal info** (name, email, phone)
- **API credentials** (per-user, view from profile)
- **Multi-Factor Auth setting**
- **Purchase Permissions toggle**
- **Group assignment** (single group)
- **Email signature** (for 1:1 sends)
- **Notification preferences**
- **Time zone**
- **Language preference**

### 4.6 Move user between groups

```
Admin: Settings → Users → locate user → Edit
   ↓
Change "Group" dropdown
   ↓
Save
   ↓
[User's permissions change immediately]
- They inherit new group's full permissions
- Lose previous group's permissions
- API credentials remain (still per-user)
```

---

## 5. Account Admin flow

### 5.1 Becoming Account Admin

```
Account created (after signup or contract)
   ↓
First user = Account Admin (in Admin group)
   ↓
This is the founding user
   ↓
**Always has Admin group access**
```

### 5.2 Daily Account Admin workflow

```
Login → Dashboard
   ↓
Account overview:
- Today's campaign metrics
- Active automation count
- Total contacts vs. plan limit
- Recent activity
- Deal pipeline summary (if CRM)
- Failed/error states
- New form submissions
   ↓
Strategic:
- Plan tier vs. usage
- Add-ons usage review (SMS credits, etc.)
- User audit
- Group permission audit
- Integration health
- API key audit
```

### 5.3 Kritické Admin akce

#### Billing management
```
Account → Billing & Upgrade
   ↓
View:
- Current plan + tier
- Contact count vs. limit
- Email sends vs. limit
- Add-ons (SMS, WhatsApp, Transactional, CRM)
- Next billing date
- Payment method
   ↓
Actions:
- Change plan (upgrade/downgrade)
- Adjust user seats
- Add/remove add-ons
- Update payment method
- Apply discount codes
- Annual vs. monthly toggle
```

#### Manage users + groups
```
Settings → Users and Groups
   ↓
Tabs:
- Users (list, add, edit, delete)
- Groups (list, add, edit permissions, delete)
   ↓
For each group:
- Info tab
- Permissions tab (granular per feature)
- Limits tab
   ↓
Save changes
```

#### Account settings
```
Settings → various sections:
- Account Info
- Email Defaults (sender, footer, unsubscribe)
- Plan & Billing
- Email Marketing (compliance)
- Integrations
- API
- Tracking (site tracking script)
- Forms defaults
- Deal defaults (CRM)
- Notifications
```

### 5.4 Close account / cancel

```
Account Admin: Billing & Upgrade
   ↓
Cancel plan option
   ↓
Confirmation flow:
- Reasoning survey
- Confirm cancellation
   ↓
Account scheduled for cancellation
   ↓
End of billing period:
- Account closes
- Data retention per GDPR
   ↓
**Reactivate option** within retention period
```

### 5.5 Ownership transfer (manual)

ActiveCampaign **doesn't have explicit "ownership transfer"** flow:

```
To transfer:
1. New user created in Admin group
2. They activate account
3. Original Admin can be deleted (after data reassignment)
4. New Admin is effectively the "owner"
   ↓
**No automatic transfer** of personal API keys, etc.
- Each Admin has own API key
- Integrations should be updated to use new Admin's key
```

⚠️ **No formal "transfer ownership" feature** – workaround flow required.

---

## 6. Marketing user flow

Marketing users typically v custom "Marketing" group.

### 6.1 Daily Marketing user workflow

```
Login → Dashboard (filtered per permissions)
   ↓
Activities:
- Build segments
- Create + schedule campaigns
- Build automations
- Manage forms + popups
- Update landing pages
- A/B test setup
- Review performance
- Create site messages
- Manage templates
```

### 6.2 Create campaign

```
Campaigns → "Create a campaign"
   ↓
Type selection:
- Standard
- Automated (within workflow)
- Auto-responder
- RSS triggered
- Split test
- Date-based
   ↓
Setup:
- Campaign name (internal)
- Sender details (from name, email, reply-to)
- Lists / segments to send to
   ↓
Design:
- Drag-drop editor
- Template selection
- Personalization tags
- Conditional content (Pro+)
- AI Writing assistance (Plus+)
   ↓
Test:
- Send test to yourself
- Preview per device
- Spam test
   ↓
Send / Schedule:
- Send now
- Schedule (date + time)
- Time-zone send
- Predictive sending (Pro+)
   ↓
Confirm
```

### 6.3 Build automation

```
Automations → "New Automation"
   ↓
Choose:
A) Start from scratch
B) Use recipe (900+ pre-built)
C) Template
   ↓
A) From scratch:
   ↓
   Choose trigger:
   - Subscribes to list
   - Tag added/removed
   - Submits form
   - Visits page
   - Email opened/clicked
   - Custom event
   - Order placed
   - Date in field
   - Deal stage changed
   - + 5 triggers max per automation
   ↓
   Build canvas:
   - Drag nodes from sidebar:
     - Send email
     - Send SMS (add-on)
     - Wait (delay)
     - If/Else (condition)
     - Goal (conversion event)
     - Update field
     - Add/remove tag
     - Add to list / Remove from list
     - Notify user (internal)
     - Webhook
     - Create/update deal
     - Update lead score
     - A/B split test
   ↓
   Configure each node
   ↓
   Test:
   - Preview as contact
   - Send through automation
   ↓
   Activate
   ↓
   [Automation Live]

B) Recipe:
   ↓
   Browse recipe library
   ↓
   Filter by category/use case
   ↓
   Preview recipe
   ↓
   Click "Use this recipe"
   ↓
   Customize (content, timing, branching)
   ↓
   Test + Activate
```

### 6.4 Segment building

```
Contacts → Segments (or build during campaign)
   ↓
Save segment
   ↓
Add conditions:
- Contact data (fields, tags, lists)
- Email engagement
- Site activity
- Custom events
- E-commerce
- Lead score
- Geolocation
- Date conditions
- Custom fields
- Deal data (CRM)
   ↓
Combine with AND/OR/NOT
   ↓
Preview segment size
   ↓
Save (dynamic)
   ↓
[Segment auto-updates real-time]
```

### 6.5 Site Messages

```
Site Messages → New site message
   ↓
Type:
- Banner (top/bottom)
- Modal popup
- Slide-in
- Notification
   ↓
Trigger conditions:
- Page visited
- Time on page
- Scroll depth
- Exit intent
- Frequency caps
   ↓
Audience (segment match)
   ↓
Design content
   ↓
Publish
   ↓
[Live on website]
```

### 6.6 Marketing user limits

Per group configuration, marketing user typically **cannot**:
- Manage other users
- Access billing
- Configure account settings
- Manage API keys
- Manage integrations (depending on perms)
- Edit Sales (CRM) data

---

## 7. Sales user flow (CRM)

Sales users v custom "Sales" group (s CRM add-on).

### 7.1 Daily Sales user workflow

```
Login → CRM dashboard
   ↓
Activities:
- Review pipeline
- Update deal stages
- Send 1:1 emails
- Add notes / activities
- Schedule tasks
- Call contacts
- Update lead scores
- Move deals through stages
- Win/lose deals
```

### 7.2 Deal management

```
Deals → Pipeline view
   ↓
View deals:
- **Admin sees all deals**
- **Sales rep sees only own deals** (if group setting enabled)
- Filter, sort, group
   ↓
Per deal:
- View details
- Update stage (drag-drop between stages)
- Add notes
- Add tasks
- Send 1:1 email
- Update contact info
- Update Deal Roles
- Move to next stage
- Win / Lose
   ↓
Activity recorded:
- All actions logged
- Visible in contact + account timeline
```

### 7.3 Deal Roles management

Per oficiální docs:
```
Open deal record
   ↓
View associated contacts
   ↓
Per contact, assign Deal Role:
- Default: Contributor or Decision Maker
- Custom roles (created in Deal Settings)
   ↓
**Roles visible only on Deal Details page**
**Roles NOT visible on contact profile**
   ↓
Use roles for:
- Quick reach-out priority (decision-makers first)
- Segmentation in marketing
- Reporting
```

### 7.4 Send 1:1 emails

```
From Deal record:
   "Send Email" button
   ↓
Compose:
- Template selection (1:1 templates)
- Personalize
- Subject + body
- Attachments
   ↓
Send
   ↓
**Email tracked:**
- Open + click tracking
- Reply parsing (Sales Engagement)
- Sentiment analysis (Sales Engagement)
   ↓
**Visibility:**
- Per user setting:
  - "Only I can see emails from this address"
  - "Anyone can see emails from this address"
```

### 7.5 1:1 Email visibility rules

Per oficiální docs:
```
Both contact AND email permissions checked:

Contact permissions:
- User must have access to at least one of the contacts associated with the email activity

Email permissions:
- User must have an email account connected to the Deals CRM
- Email permissions configurable per user:
  - "Only I" or "Anyone"

If both pass → user sees email in activity stream
```

### 7.6 Tasks management

```
Deal → + Add Task
OR
Tasks → All tasks
   ↓
Configure:
- Task type (Call, Email, Meeting, custom)
- Title
- Description
- Due date + time
- Assigned to (default: self)
- Associated deal/contact
- Reminder time
   ↓
Save
   ↓
Task appears in:
- My Tasks
- Deal record
- Contact record
- Account record
- Activity stream
   ↓
Complete task:
- Mark as done
- Optional: trigger automation
- Activity logged
```

### 7.7 Pipeline access restrictions

```
Per oficiální docs:
Deals → Pipeline dropdown → select pipeline
   ↓
Gear icon → Options
   ↓
"Group Access" dropdown:
- All Groups
- Specific Groups
   ↓
Set per pipeline
   ↓
[Restricted access enforced]
```

### 7.8 Account access

```
Sales user: Contacts → Accounts
   ↓
View accounts (per permissions)
   ↓
Per account:
- View details
- Edit info
- View associated contacts
- View associated deals
- Add notes
- View activity stream
   ↓
**Account ownership rules:**
- Only Admins + users with "Reassign Accounts" permission can change Account Owner
- Standard sales users can view + edit account info but not reassign
```

---

## 8. API credentials per user (kritický bod)

### 8.1 API credentials model

**ActiveCampaign UNIQUE situation:** API credentials are **per-user**, ne per-account.

```
Each user has:
- Their own URL (API endpoint)
- Their own API key (token)
- Permissions based on their group
```

### 8.2 Critical implication

**Pokud user deletion → integrations break.**

Per oficiální docs:
*"If integrations are set up with a user's API credentials, deleting the user will cause integrations to break. You must update affected integrations with another user's API credentials, since there is no account-default API."*

### 8.3 Best practice flow

```
**Recommended pattern:**

1. Create dedicated "Service Account" user
   - Email: integrations@yourcompany.com (or aktivní mailbox)
   - Group: Admin (or custom group with API access)
   - Purchase Permissions: No
   - 2FA: Yes
   ↓
2. Use this user's API credentials for ALL integrations:
   - Shopify
   - WooCommerce
   - WordPress
   - Custom scripts
   - Zapier
   - Make
   - etc.
   ↓
3. NEVER delete this user
   ↓
4. If person leaves:
   - Their personal user can be deleted
   - Integrations remain intact
   - Continuity preserved
   ↓
5. Rotate API key periodically (s integration updates)
```

### 8.4 Real-world disaster scenario

```
**BAD scenario:**

CMO sets up Shopify + Zapier + WordPress integrations s their own API key
   ↓
CMO leaves company
   ↓
Admin deletes CMO user
   ↓
ALL integrations break
   ↓
Customer data sync stops
   ↓
Welcome flows fail
   ↓
Order events not received
   ↓
**Disaster** requires emergency rebuild
```

### 8.5 Recovery

```
If user with active API keys deleted:
   ↓
Identify all integrations affected
   ↓
For each integration:
   - Get another user's API credentials
   - Update integration config
   - Test connection
   - Verify data flow
   ↓
**Slow process** if many integrations
```

### 8.6 Audit recommendations

```
Quarterly API audit:
1. List all integrations
2. Identify which user's credentials each uses
3. Check if those users still exist
4. Migrate to service account if needed
5. Document for handover
```

---

## 9. Onboarding flow

### 9.1 Free trial signup

```
Visit activecampaign.com → Sign up free trial
   ↓
**No credit card required**
   ↓
Email + basic info
   ↓
Email verification
   ↓
Account created (14-day Pro trial)
   ↓
Limits:
- 100 contacts
- 100 emails
- Email-only support
- All Pro features unlocked
- Sales Engagement add-on testable
- Salesforce integration testable
```

### 9.2 Trial onboarding wizard

```
First login:
   ↓
Onboarding questions:
- Business type
- Industry
- Team size
- Email volume
- Primary use case
- Existing tools
   ↓
Setup recommendations:
- Suggested integrations
- Suggested recipes
- Templates relevant to industry
   ↓
Optional: Schedule onboarding call (free)
```

### 9.3 Migration assistance (free)

```
Free services included with paid plan:
- 1:1 onboarding call
- Migration from other platforms (Mailchimp, Klaviyo, Constant Contact, etc.)
- Help with initial setup
- Template import/recreation
- List import + validation
- Initial automation setup
   ↓
**Migration team available** ne all customers (mostly Pro+)
```

### 9.4 Standard onboarding steps

```
Day 1:
- Verify sender domain (DKIM, SPF, DMARC)
- Import contacts (or initial test list)
- Set sender info
- Configure account settings
   ↓
Day 2-3:
- Install site tracking script
- Set up first integration (e.g. Shopify)
- Create first form
- Create first template
   ↓
Day 4-7:
- Build first automation (welcome series)
- Set up A/B test
- Configure CRM (if applicable)
- Add team users (groups)
   ↓
Day 7-14:
- Trial expires
- Choose plan
- Continue setup
```

### 9.5 Contract / commitment after trial

```
Trial ends:
- Choose plan + contact tier
- Add-ons (CRM, SMS, etc.)
- Select billing cycle (annual saves 20%)
- Setup payment
- Confirm contract
   ↓
[Paid account active]
   ↓
**No data loss** from trial
```

---

## 10. Contact lifecycle

### 10.1 Contact creation paths

#### A) Form submission
```
Visitor fills form
   ↓
Submit
   ↓
ActiveCampaign:
- Validates email
- Duplicate check
- GDPR consent recorded
   ↓
Status: Active (or Unconfirmed if double opt-in)
   ↓
Add to selected list(s)
   ↓
Tag (if configured)
   ↓
Automation trigger fires
```

#### B) Double opt-in
```
Form submission
   ↓
Status: Unconfirmed (NEPOČÍTÁ pro old billing, COUNTS for new billing post-Nov 2025)
   ↓
ActiveCampaign sends confirmation email
   ↓
Contact clicks confirm
   ↓
Status: Active
   ↓
Add to list
   ↓
Welcome workflow triggers
```

#### C) E-commerce integration
```
Customer creates account na Shopify
   ↓
Webhook → ActiveCampaign
   ↓
Contact created with order data
   ↓
Marketing_consent flag respected
   ↓
Add to "Customers" list
   ↓
Tags: "Customer", "Source: Shopify"
   ↓
Workflow trigger
```

#### D) Manual import (CSV)
```
Admin: Contacts → Import
   ↓
CSV upload or paste
   ↓
Field mapping
   ↓
Choose:
- List destination
- Tag with import source
- Update existing vs. skip
- Confirm consent
   ↓
Validation
   ↓
Import processed
   ↓
[Contacts in account]
```

#### E) API
```
External system POST /contacts
   ↓
ActiveCampaign creates / updates
   ↓
Identity resolution by email
   ↓
Add to lists, tags
   ↓
Trigger automations
```

#### F) Site tracking + form
```
Anonymous visitor browses (cookie tracked)
   ↓
Site activity recorded (anonymous)
   ↓
Later visitor fills form
   ↓
**Cookie + email matched**
   ↓
Previous anonymous activity attributed to new contact
   ↓
Full timeline preserved
```

### 10.2 Contact status lifecycle

```
[Unconfirmed] (if double opt-in)
   ↓ (confirmed)
[Active] ← can receive
   ↓
Various transitions:
- Unsubscribed (opt-out)
- Bounced (hard bounce)
- Spam complaint
- Deleted (manual or GDPR)
```

### 10.3 Engagement tracking

```
Active contact receives email
   ↓
Open tracked (pixel)
Click tracked (URL wrapper)
   ↓
Profile updates:
- Last activity
- Engagement score
- Tags (if workflow triggers)
   ↓
Segments re-evaluated
   ↓
Workflows trigger if match
   ↓
Site tracking continues for active subscribers
```

### 10.4 Unsubscribe

```
Contact clicks Unsubscribe link
   ↓
ActiveCampaign-hosted unsubscribe page
   ↓
Options:
- Unsubscribe from specific list
- Unsubscribe from all
- Optional: reason survey
   ↓
Status: Unsubscribed (from list or all)
   ↓
**Billing impact:**
- Pre-Nov 2025 (old users): doesn't count
- Post-Nov 2025 (new users): still counts toward billing
   ↓
Workflow trigger "Unsubscribed" fires
   ↓
Data retained per GDPR
```

### 10.5 Bounce handling

#### Hard bounce
```
ISP returns 5xx
   ↓
Mark Bounced
   ↓
Auto-suppression
   ↓
Status: Bounced
```

#### Soft bounce
```
ISP returns 4xx
   ↓
ActiveCampaign retries
   ↓
After repeated failures → Hard bounce escalation
```

### 10.6 Spam complaint

```
Recipient marks as spam
   ↓
ISP FBL → ActiveCampaign
   ↓
Status: Spam complaint
   ↓
Auto-suppression
   ↓
Sender reputation tracking
```

### 10.7 Contact deletion (GDPR)

```
Admin: Contact → Actions → Delete
OR
Contact requests via Preference Center
   ↓
GDPR delete:
- Personal data removed
- Anonymize related records
- Audit log entry
- Email confirmation
   ↓
**Frees up contact slot** (billing impact)
```

---

## 11. Email lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│  1. USER drafts campaign / automation email                     │
│     - Choose audience (lists, segments)                         │
│     - Configure trigger (for automation)                        │
│     - Design + personalize                                      │
│                            │                                    │
│                            ▼                                    │
│  2. PRE-SEND CHECKS                                             │
│     - Sender verified?                                          │
│     - Domain DKIM/SPF setup?                                    │
│     - Audience valid?                                           │
│     - Plan limits OK?                                           │
│     - Test passed?                                              │
│                            │                                    │
│                            ▼                                    │
│  3. SEND TIME DETERMINATION                                     │
│     - Send now                                                  │
│     - Scheduled                                                 │
│     - Predictive sending (Pro+ AI per recipient)                │
│     - Time-zone send                                            │
│                            │                                    │
│                            ▼                                    │
│  4. PER-RECIPIENT GENERATION                                    │
│     - Personalization tags resolved                             │
│     - Conditional content evaluated (Pro+)                      │
│     - Dynamic blocks rendered                                   │
│     - Tracking pixels embedded                                  │
│     - Click trackers wrapped                                    │
│                            │                                    │
│                            ▼                                    │
│  5. SMTP SEND                                                   │
│     - From: verified sender                                     │
│     - DKIM signed                                               │
│     - SPF compliant                                             │
│     - DMARC aligned                                             │
│     - One-click unsubscribe (RFC 8058)                          │
│                            │                                    │
│                            ▼                                    │
│  6. ISP RECEIVES                                                │
│     - Auth checks                                               │
│     - Reputation check                                          │
│     - Content filters                                           │
│                            │                                    │
│                            ▼                                    │
│  7. ROUTING                                                     │
│     - Inbox / Primary                                           │
│     - Promotions                                                │
│     - Spam                                                      │
│                            │                                    │
│                            ▼                                    │
│  8. RECIPIENT INTERACTION                                       │
│     - Open → pixel → recorded                                   │
│     - Click → AC proxy → recorded + redirect                    │
│     - Site tracker fires on landing pages                       │
│                            │                                    │
│                            ▼                                    │
│  9. PROFILE UPDATE                                              │
│     - Activity timeline                                         │
│     - Engagement metrics                                        │
│     - Lead score updated                                        │
│     - Segments re-evaluated                                     │
│                            │                                    │
│                            ▼                                    │
│ 10. AUTOMATION TRIGGERS                                         │
│     - "Opened" trigger fires (if applicable)                    │
│     - "Clicked" trigger fires                                   │
│     - Custom workflow paths activated                           │
│                            │                                    │
│                            ▼                                    │
│ 11. REPORTING                                                   │
│     - Real-time campaign stats                                  │
│     - Revenue attribution (e-commerce)                          │
│     - Lead score impact                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 12. Automation execution model

### 12.1 Automation activation

```
Marketer builds automation
   ↓
Test mode (preview as contact)
   ↓
Activate
   ↓
ActiveCampaign validation:
- All triggers configured
- All actions valid
- No broken paths
   ↓
[Active]
   ↓
Engine evaluates triggers continuously
```

### 12.2 Trigger evaluation

```
Event occurs (e.g. tag added)
   ↓
ActiveCampaign engine checks all active automations
   ↓
For each automation matching trigger:
- Check entry conditions
- Check if contact already in workflow
- Check re-entry settings
- Add contact to workflow execution
```

### 12.3 Per-contact execution

```
Contact enters at trigger
   ↓
Each node processed sequentially:
- Send email → SMTP queue
- Wait → schedule continuation
- If/Else → evaluate condition, branch
- Update field → modify contact
- Goal → check if achieved
- Webhook → call external URL
   ↓
Continue until:
- End of flow
- Goal achieved (success exit)
- Removed from trigger condition
- Manually removed by admin
```

### 12.4 Re-entry rules

```
Per automation setting:
- "Run multiple times" – contact can re-enter each time trigger fires
- "Run once per contact" – only first trigger counts
- "Run after wait time" – minimum gap between re-entries
   ↓
Useful for:
- Welcome series: Run once
- Re-engagement: Multiple times
- Birthday: Yearly recurring
```

### 12.5 Workflow paths

```
A/B Split test (Pro+):
- Split contacts into paths randomly
- Different content / timing per path
- Measure performance
- Auto-winner OR manual review
```

### 12.6 Goals

```
Conversion event mid-workflow
   ↓
Goal node placed in workflow
   ↓
Goal condition:
- Tag added
- Custom field value
- Page visited
- Custom event
   ↓
Contact achieves goal:
- Workflow exits (success)
- Goal achievement tracked
- Conversion rate calculated per workflow
```

### 12.7 Per-automation user group access

Per oficiální docs:

```
Two methods for restricting access:

Method 1: Per-group access (default = all groups)
- Admin: Settings → Users and Groups → Groups
- Edit group → Permissions tab
- Click "Automations" section
- Configure access permissions

Method 2: Per-automation access
- Automations → click automation
- Settings → "User groups who can access this automation"
- Check/uncheck groups
- Save
   ↓
**Bulk approach:**
- Automations → checkboxes for multiple
- Bulk edit → permission changes
- Apply
```

### 12.8 Re-add to automation

```
Admin: Automations → workflow → Contacts tab
   ↓
View contacts:
- Active in workflow
- Completed
- Failed
   ↓
Re-add subscribers:
- Bulk select
- Actions → Re-add to start OR specific step
- Confirm
```

---

## 13. Site Tracking & Site Messages flow

### 13.1 Site Tracking setup

```
Admin: Site & Event Tracking
   ↓
Enable Site Tracking
   ↓
Copy JavaScript snippet
   ↓
Install on website:
- Header (preferred) OR footer
- Every page where tracking desired
   ↓
Verify installation
   ↓
[Tracking active]
```

### 13.2 What's tracked

- **Page views** per contact
- **Time on page**
- **Pages viewed sequence**
- **Custom events** (configurable)
- **E-commerce events** (cart, browse)
- **Form submissions**

### 13.3 Identification flow

```
Anonymous visitor → cookie ID
   ↓
Pageviews tracked under cookie
   ↓
Visitor fills form / makes purchase / signs in
   ↓
Cookie + email matched
   ↓
**Anonymous activity attributed to contact**
   ↓
Future tracking under known contact
```

### 13.4 Site Messages (Plus+)

```
Marketer: Site Messages → New site message
   ↓
Configure:
- Type (banner, modal, slide-in)
- Trigger (page, time, scroll, exit)
- Frequency caps
- Audience (segment match)
- Content (drag-drop builder)
   ↓
Test mode (preview)
   ↓
Publish
   ↓
[Live on website]
```

### 13.5 Site Message trigger conditions

```
Page-based: URL match
Behavior-based: time, scroll, exit intent
Audience-based: segment membership
Behavior history-based: visited X previously
Frequency-based: max X views per visitor
```

### 13.6 Integration s automation

```
Site Message clicked
   ↓
Custom event triggered
   ↓
Workflow trigger fires (if configured)
   ↓
Follow-up email / SMS / action
```

---

## 14. CRM lifecycle (Deals & Pipelines)

### 14.1 Pipeline setup

```
Admin: Deals → + New Pipeline
   ↓
Configure:
- Pipeline name
- Currency
- Stages (customizable)
   - Stage name
   - Stage probability (% close)
- Group access (which user groups)
- Default deal owner rules
   ↓
Save pipeline
   ↓
[Pipeline ready]
```

### 14.2 Deal creation

```
Methods:
A) Manually from Deals page
B) From Contact record → Add deal
C) From Account record → Add deal
D) Via automation action "Add Deal"
E) Via API
   ↓
Per deal:
- Title
- Value
- Currency
- Pipeline + stage
- Owner (assigned)
- Expected close date
- Probability (% from stage)
- Associated contacts (with Deal Roles)
- Associated account
- Custom fields
- Tags
   ↓
Save
   ↓
Deal in pipeline
```

### 14.3 Deal lifecycle through stages

```
Lead (10% probability)
   ↓
Sales rep activities:
- Send 1:1 email
- Schedule call
- Add note
   ↓
Move to: Qualified (25%)
   ↓
Activities:
- Discovery call done
- Send proposal
   ↓
Move to: Proposal (50%)
   ↓
Activities:
- Follow up
- Negotiation calls
   ↓
Move to: Negotiation (75%)
   ↓
Outcomes:
A) Move to: Won (100%) ← success
B) Move to: Lost (0%) ← lost
```

### 14.4 Deal automation

Sales automations trigger on:
- Deal created
- Stage changed
- Field updated
- Days in stage (inactivity)
- Won/lost

Actions:
- Send 1:1 email
- Create task
- Update field
- Notify user
- Move stage
- Add note
- Update lead score

### 14.5 Deal ownership rules

Per oficiální docs:
```
Admin sees ALL deals regardless of ownership.

Per group setting "Enable Group Access to All Deals":
- Checked: group members see all deals
- Unchecked: members see ONLY their own deals (where deal_owner = themselves)

When unchecked:
- Deal Owner filter not visible to deal owners
- Deal tasks + notes visible only to owner on contact page
- Export limited to own deals (incl. API)
```

### 14.6 Deal reassignment

```
Reassignment options:
- Admin can reassign any deal
- Users with "Reassign Deals" permission can change
- Bulk reassignment supported
- During user deletion, deals must be reassigned first
```

---

## 15. Account ↔ Contact relationship

### 15.1 Account structure

```
Account (company)
├── Standard fields:
│   - Account name
│   - Website
│   - Industry
│   - Phone
│   - Address
│   - Account Owner
├── Custom account fields
├── Associated contacts (1 to many)
│   - Each contact can be on only ONE account
│   - Multiple contacts per account
├── Associated deals
├── Notes
├── Activity stream (3 recent)
└── Tasks
```

### 15.2 Account creation

```
Methods:
A) Manual: Contacts → Accounts → + Add Account
B) From contact: Contact record → Add to Account
C) Auto-create: From email domain (some configurations)
D) Via API
E) Via import
   ↓
Configure:
- Account fields
- Initial associated contacts
- Account Owner
   ↓
Save
```

### 15.3 Contact ↔ Account linking

```
**Single contact = single account** (limitation!)
   ↓
Contact A is on Account X
   ↓
If you try to add Contact A to Account Y:
- Will be removed from Account X
- Or warning shown
   ↓
For B2B with multiple buyer companies:
- May need separate contact records per company
- Or manage carefully
```

### 15.4 Account activity stream

Per oficiální docs:
```
Account Recent Activity stream shows:
- Contact + deal actions related to account
- 3 latest activities (top right of Account Overview)
- Click "View all activities" for more
   ↓
Activity types:
1. Emails (1:1 emails + automation emails sent to associated contacts)
2. Deal events (created, stage changed, won/lost)
3. Tasks (created, completed)
4. Notes (added)
5. Custom events
6. Field changes
   ↓
**For email activity to appear:**
- Contact must be associated with account at time of event
```

### 15.5 Account ownership

Per oficiální docs:
```
"Account Owner" field on every account
   ↓
**Only Admins + users with "Reassign Accounts" permission can update**
   ↓
Reassign flow:
- Settings → Users & Groups → group with this permission
- Standard sales users typically don't have this
```

### 15.6 Account deletion

```
Admin / authorized user: Accounts → select account → Delete
   ↓
**WARNING:**
- All account information lost
- Cannot be restored
- Associated deals DELETED
- Associated contacts REMAIN (in account)
- Recommendation: tag contacts before deleting for record-keeping
   ↓
Confirm
   ↓
Account removed
```

---

## 16. Sales Engagement flow (B2B)

### 16.1 Sales Engagement features

**B2B advanced add-on**:
- Email sequences (multi-step 1:1)
- AI Win Probability
- Sentiment Analysis
- AI insights
- Deeper Salesforce integration

### 16.2 Email sequence flow

```
Sales rep: Create email sequence
   ↓
Configure:
- Sequence name
- Audience criteria
- Email steps (1-10 typically):
  - Step 1: Initial outreach
  - Step 2: Follow-up (wait X days)
  - Step 3: Value proposition
  - Step 4: Case study
  - Step 5: Break-up email
- Exit conditions:
  - Reply received (auto-pause)
  - Specific action taken
  - Manual exit
   ↓
Enroll contacts
   ↓
Sequence runs per contact:
- Day 0: Email 1
- Day 3: Email 2 (if no reply)
- Day 7: Email 3
- etc.
   ↓
Reply detected → auto-pause
   ↓
Sentiment analysis on reply
   ↓
If positive → notify rep
If negative → escalation
```

### 16.3 Win Probability AI

```
Deal exists in pipeline
   ↓
AI analyzes:
- Deal stage history
- Contact engagement metrics
- Email response patterns
- Time in pipeline
- Activity volume
   ↓
Calculates % win probability
   ↓
Updates continuously
   ↓
Forecasting weighted by Win Probability
```

### 16.4 Sentiment Analysis flow

```
1:1 email reply received
   ↓
AI analyzes tone:
- Positive
- Neutral
- Negative
   ↓
Flag on deal record
   ↓
Negative reply alert:
- Notify rep immediately
- Suggest follow-up
- Update deal probability potentially
```

### 16.5 AI insights

```
Per deal:
- "Reach out – contact hasn't engaged 14 days"
- "Send case study – contact viewed pricing"
- "Sentiment improving – good time for proposal"
- "Deal stuck in Negotiation 30+ days"
   ↓
Displayed on deal record
   ↓
Helps prioritize sales effort
```

---

## 17. E-commerce data flow

### 17.1 Integration setup

```
Admin: Apps → Shopify (or WooCommerce, BigCommerce, etc.)
   ↓
OAuth authorization
   ↓
Configure:
- Default list for new customers
- Sync historical data toggle (initial backfill)
- Tags/segments mapping
- Webhook subscription (automatic)
- Tracking script installation
- Product catalog sync
- Order events config
   ↓
Initial sync (30 min - hours for large stores):
- Customers → contacts
- Orders → events + revenue
- Products → catalog
- Abandoned carts → cart events
- Customer LTV calculated
   ↓
Continuous sync via webhooks
   ↓
[Integration active]
```

### 17.2 Real-time event flow

```
Shopify customer event
   ↓
Webhook → ActiveCampaign (within seconds)
   ↓
ActiveCampaign:
- Updates contact (or creates if new)
- Records event in profile
- Updates lead score
- Re-evaluates segments
   ↓
Automation triggers fire (if match)
   ↓
Per-channel actions:
- Email send
- SMS send
- Site message show
- Tag add
- Field update
```

### 17.3 Abandoned cart flow

```
Customer adds product to cart
   ↓
Shopify abandoned cart webhook (after timeout)
   ↓
ActiveCampaign trigger: "Abandoned cart"
   ↓
Workflow begins:

Wait 1 hour
   ↓
Email 1: "Forgot something?"
- Cart contents (dynamic block from Shopify)
- Direct checkout link
   ↓
Wait 24 hours
   ↓
If/Else: Did they purchase?
   YES → Goal achieved
   NO → Send Email 2 (10% discount)
   ↓
Wait 48 hours
   ↓
If/Else: Did they purchase?
   YES → Goal achieved
   NO → Send SMS (if opted in)
   ↓
Wait 7 days, exit if no purchase
```

### 17.4 Post-purchase flow

```
Order placed → Shopify webhook → AC event
   ↓
Workflow: Post-purchase

Wait 1 day
   ↓
Email 1: "Welcome / order confirmation companion"
   ↓
Wait 5 days
   ↓
Email 2: Tutorial / how to use
   ↓
Wait 7 days
   ↓
Email 3: Review request
   ↓
Wait 30 days
   ↓
Email 4: Cross-sell related products
   ↓
End
```

### 17.5 Revenue attribution

```
Email send recorded
   ↓
Contact clicks link
   ↓
Lands on store
   ↓
Conversion window (default 7 days)
   ↓
If order placed within window → revenue attributed to email
   ↓
Reports show:
- Revenue per campaign
- Revenue per automation
- Revenue per source
```

---

## 18. API & Integration flow

### 18.1 API key per user

```
Each user has:
- URL (account API endpoint)
- API key (token)
   ↓
View from Profile → My Settings → Developer
   ↓
**API key cannot be regenerated** (without contacting support)
   ↓
Each user has separate keys
```

### 18.2 API request flow

```
Application:
   POST https://[account].api-us1.com/api/3/contacts
   Headers:
     Api-Token: {user_api_key}
     Content-Type: application/json
   Body: { contact data }
   ↓
ActiveCampaign:
- Validates token
- Rate limit check
- Permission check (per user's group)
- Validates payload
   ↓
Response 201
   ↓
Contact created
   ↓
Workflows trigger
```

### 18.3 Webhook subscriptions

```
Admin: Settings → Developer → Webhooks
   ↓
Add webhook:
- URL
- Events (multi-select):
  - Contact events
  - Campaign events
  - Form events
  - Order events
  - Deal events
  - Automation events
   ↓
ActiveCampaign POSTs on each event
   ↓
Application processes
```

### 18.4 Integration types

#### Native integrations (970+)
- Pre-built, maintained by AC
- OAuth-based typically
- Real-time sync via webhooks
- Bi-directional in many cases

#### Zapier
- 5 000+ apps
- May have delays
- Per-event triggers

#### Make (Integromat)
- Similar to Zapier
- Visual workflow builder
- More complex automation possible

#### Custom API
- Direct API calls
- Full control
- Webhook-based real-time

### 18.5 Integration management

```
Admin: Apps → All integrations
   ↓
Per integration:
- Status (active, paused, error)
- Configuration
- Sync logs
- Disable / Reconnect / Delete
   ↓
Add new:
- Choose from list
- Authorize
- Configure mapping
- Activate
```

### 18.6 Postmark integration (Transactional)

```
Add-on activation:
- Settings → Plus & Add-ons → Transactional Email
- Activate add-on
- Pre-paid credits configured
   ↓
Postmark API access:
- Separate API key (Postmark-specific)
- Postmark endpoints accessible
- Templates synced
- Events flow back to ActiveCampaign profiles
```

---

## 19. GDPR & Compliance flow

### 19.1 Hosting

- **Primary US** (Chicago + Iowa data centers)
- **EU data residency** available (Dublin, Ireland)
- **AU data residency** available (Sydney)
- **GDPR compliant** all regions
- **ISO 27001 certified**

### 19.2 Right to Be Forgotten

```
Contact requests deletion
   ↓
Method A: Admin → Contact → Actions → Delete
Method B: API DELETE
Method C: Contact self-service via Preference Center
   ↓
ActiveCampaign:
- Removes contact data
- Anonymize related events
- Suppress email/phone permanently
- Audit log entry
- Email confirmation to contact
- Frees up contact slot (billing impact)
```

### 19.3 Data export per contact

```
Admin: Contact → Actions → Download contact data
OR API: GET /contacts/{id}/data-export
   ↓
JSON / CSV with:
- Profile data
- Activity history
- Email events
- Form submissions
- Custom fields
- Tag history
- Deal data (if CRM)
   ↓
Provided to contact
```

### 19.4 Consent tracking

Per contact:
- Per-list opt-in timestamp + IP
- Source (form, import, API, integration)
- Double opt-in audit (if applicable)
- GDPR consent fields per form
- Per-channel consent (email, SMS, WhatsApp)
- Versioned consent text

### 19.5 GDPR features

- **GDPR consent fields** v forms
- **Preference Center** customizable
- **Audit logs** for consent changes
- **DPA available** electronically
- **EU-US Data Privacy Framework** certified
- **Standard Contractual Clauses** (SCCs)

### 19.6 Compliance certifications

- **GDPR compliant**
- **ISO 27001**
- **SOC 2 Type II**
- **CCPA**
- **CASL** (Canadian)
- **CAN-SPAM**
- **HIPAA support** (Enterprise only)
- **EU-US Data Privacy Framework**

### 19.7 Security features

- **MFA / 2FA** (TOTP)
- **SSO/SAML** (Enterprise only)
- **IP allowlist** (Enterprise)
- **Audit logs** (limited outside Enterprise)
- **Encryption at rest + in transit**
- **API key per user**
- **Session management**

---

## 20. Datová mapa: co vidí kdo

| Data | Admin | Marketing | Sales | Designer | View-only | Custom | Contact | API |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Account settings | ✅ | ❌ | ❌ | ❌ | ❌ | per role | ❌ | per scope |
| Billing | ✅ | ❌ | ❌ | ❌ | ❌ | per role | ❌ | per scope |
| User management | ✅ | ❌ | ❌ | ❌ | ❌ | per role | ❌ | per scope |
| Group permissions | ✅ | ❌ | ❌ | ❌ | ❌ | per role | ❌ | per scope |
| All contacts | ✅ | per lists | per lists | limited | view | per role | jen sebe | ✅ |
| Edit contacts | ✅ | ✅ | per lists | ❌ | ❌ | per role | ❌ | ✅ |
| Export contacts | ✅ | per role | per role | ❌ | ❌ | per role | request | per scope |
| Lists | ✅ | per lists | per lists | per lists | per lists | per role | – | ✅ |
| Tags | ✅ | ✅ | per role | ❌ | view | per role | – | ✅ |
| Segments | ✅ | ✅ | per role | ❌ | view | per role | – | ✅ |
| Campaigns | ✅ | ✅ | ❌ | ✅ | view | per role | jen co dostal | ✅ |
| Send campaigns | ✅ | ✅ | ❌ | ❌ | ❌ | per role | ❌ | ✅ |
| Automations | ✅ | ✅ | per perm | ❌ | view | per role | ❌ | ✅ |
| Per-automation access | ✅ | per group | per group | per group | per group | per role | ❌ | per scope |
| Forms / Landing pages | ✅ | ✅ | ❌ | ✅ | view | per role | submit | per scope |
| Templates | ✅ | ✅ | ❌ | ✅ | view | per role | – | ✅ |
| Site Messages | ✅ | ✅ | ❌ | ❌ | view | per role | view (on site) | per scope |
| Deals | ✅ | ❌ | own/all | ❌ | view | per role | ❌ | ✅ |
| Pipelines | ✅ | ❌ | per perm | ❌ | view | per role | ❌ | per scope |
| Accounts (B2B) | ✅ | view | ✅ | ❌ | view | per role | ❌ | ✅ |
| 1:1 emails | ✅ | per role | ✅ | ❌ | per role | per role | jen své | per scope |
| Tasks | ✅ | per role | ✅ | ❌ | view | per role | ❌ | per scope |
| Reports | ✅ | ✅ | per role | ❌ | ✅ | per role | ❌ | ✅ |
| Custom Reports | ✅ | per role | per role | ❌ | view | per role | ❌ | per scope |
| Integrations | ✅ | per perm | ❌ | ❌ | ❌ | per role | ❌ | per scope |
| API keys (per user) | own + manage all | own only | own only | own only | own only | own only | ❌ | – |
| Audit logs | ✅ | ❌ | ❌ | ❌ | ❌ | per role | ❌ | per scope |
| GDPR delete | ✅ | per role | per role | ❌ | ❌ | per role | request | per scope |

---

## 21. Známé úzkoprofilové místa

### 21.1 User management gotchas

- **API credentials per user, NOT per account** – kritický bod
- **User deletion breaks integrations** if user owned API credentials
- **No account-default API** – muset migrate to another user
- **Seat counting** – deleted user doesn't free seat (must manually adjust)
- **Reassignment required** before deletion (lists, accounts, deals, tasks)
- **No formal "ownership transfer"** – workaround required
- **Group-based permissions** (not user-based) – flexibility vs. complexity tradeoff

### 21.2 Group permissions complexity

- **No pre-defined roles** except Admin
- **Every group is custom** – higher learning curve
- **Permission misconfigurations** common during initial setup
- **Per-automation access** can be confusing
- **Per-pipeline access** complex
- **Deal owner visibility rules** subtle (admin sees all)

### 21.3 Plan / billing concerns

- **No free plan** – 14-day trial only
- **Aggressive pricing scaling** as list grows
- **Starter plan severely limited** – most users outgrow within months
- **November 2025 billing change** for new users (all contacts count)
- **Add-ons stack quickly** (CRM, SMS, WhatsApp, Transactional, Custom Reporting)
- **Doubled bills reported** by some users after pricing changes
- **Feature lockouts behind upgrades** – forced upsell pattern

### 21.4 Starter plan limitations

- **Only 1 user** – limits team work
- **No landing pages, AI, predictive sending, conditional content**
- **Limited automation** (100 actions, 1 trigger)
- **Basic segmentation**
- **No advanced features** that most need
- **Forces upgrade quickly**

### 21.5 UI/UX issues

- **Reporting dashboard less visual** than Mailchimp
- **Older interface elements** in some sections
- **Mobile app limited** vs. desktop
- **Learning curve significant** for full power
- **Recipe library** not always discoverable for new users

### 21.6 Automation gotchas

- **Conditional automations workarounds** required on Starter
- **Re-entry rules** subtle, easy to misconfigure
- **Failed contacts** require manual re-add
- **Performance issues** with very complex workflows
- **A/B testing in automations** Pro+ only
- **Workflow templates** less polished than Klaviyo

### 21.7 CRM limitations

- **CRM is add-on cost** – significant
- **One contact per ONE account** (rigid limitation)
- **Account permissions less granular** than deal permissions
- **B2B features** less developed than HubSpot Sales Hub
- **Sales Engagement still maturing** vs. Outreach.io / Salesloft
- **Custom objects only Enterprise**

### 21.8 AI features behind some

- **Generative AI less mature** than HubSpot Breeze
- **No autonomous AI agents** (vs. Klaviyo Customer Agent)
- **Predictive features** decent but not best-in-class
- **AI roadmap catching up** to competitors

### 21.9 Channel limitations

- **MMS US only**
- **SMS expensive** internationally
- **WhatsApp newer** add-on
- **No native webinars** (use Zoom integration)
- **No native online courses**
- **No native digital products**
- **No paid newsletters**

### 21.10 Locale support

- **No Czech / Slovak** v UI
- **Documentation primarily English**
- **EU-specific support** limited
- **8-10 main UI languages**

### 21.11 Compliance limitations

- **HIPAA available Enterprise only**
- **SSO/SAML only Enterprise**
- **Sandbox accounts only Enterprise**
- **Audit logs limited** outside Enterprise
- **Custom domain** Enterprise only

### 21.12 E-commerce gaps vs. Klaviyo

- **Less polished Shopify integration**
- **No predictive analytics** (CLV, churn, NPD)
- **No automatic RFM cohorts**
- **No AI product recommendations** in emails
- **Less DTC-specific** features
- **Limited browse abandonment** vs. Klaviyo

### 21.13 Support quality

- **Email support standard** (Starter)
- **Live chat** Plus+
- **Priority support** Pro+
- **Dedicated team** Enterprise only
- **Response times** vary by tier
- **Knowledge base comprehensive** but not always current

### 21.14 Migration challenges

- **Workflows non-exportable** to other platforms
- **Custom objects** AC-specific
- **Lead scoring rules** not portable
- **CRM data export** requires careful planning
- **Some integrations** require complete rebuild

---

## 22. Doporučení pro design vlastních procesů

Pokud ActiveCampaign používáte v týmu, doporučujeme:

1. **Dedicated "Service Account" user** pro API credentials – nikdy ne osobní účty!
2. **2FA enforced** pro všechny users
3. **Group strategy upfront** – plan permissions per role
4. **Custom groups** per business function (Marketing, Sales, Designer, External Agency, View-only)
5. **Per-list access** carefully configured
6. **Per-pipeline access** v CRM
7. **Per-automation access** for sensitive workflows
8. **Domain authentication** day 1 (DKIM, SPF, DMARC, branded tracking)
9. **Naming convention** pro campaigns, automations, segments, tags, lists, pipelines
10. **Quarterly user audit** – remove inactive, audit permissions
11. **Tag taxonomy planned** – flat structure with prefixes (e.g. "Source:", "Behavior:", "Status:")
12. **Custom field strategy** – avoid bloat, document purpose
13. **Lead scoring rules** documented + reviewed
14. **Migration plan** – periodic export of contacts + automation definitions backup
15. **Annual contact cleanup** – delete bounced/unsubscribed (especially post-Nov 2025 billing!)
16. **Free trial extensively** – test in trial period before commit
17. **Add-ons evaluation** carefully – cost stacks fast
18. **Recipe usage** – start with proven patterns, customize
19. **Site tracking + tagging strategy** integrated
20. **Postmark setup** for transactional separation if scaling
21. **Document API integrations** per service account
22. **Sub-account strategy** if multi-brand (Enterprise feature)

---

*Dokument zpracován z oficiálních zdrojů activecampaign.com, help.activecampaign.com a praktických zdrojů (EmailVendorSelection, EmailToolTester, Sender, EngageBay, Marketer's Choice, GetAIPerks, Automation Atlas, BusinessEautomation, Spadoom). Pro nejaktuálnější detaily je nutný engagement s ActiveCampaign sales / support teamem.*
