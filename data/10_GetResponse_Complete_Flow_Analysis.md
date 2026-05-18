# GetResponse – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v GetResponse prochází data, lidé a akce – od Account Ownera přes specializované uživatele a integrace až po koncového subscribera.

> Tento dokument doplňuje `09_GetResponse_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** GetResponse umí, tento popisuje, **kdo s tím interaguje a jak data tečou**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
> - **3 predefinované role** (Administrator, Marketer, Designer) + **unlimited custom roles** s **role-based access control** (Marketer+)
> - **Multi-user (Team feature)** jen jako add-on nebo include v MAX – ne unlimited zdarma jako Klaviyo
> - **Multiple Accounts** (MAX/MAX2) – multi-brand / agency model
> - **Approval workflow** – Designer drafts → Admin reviews → publishes (unique mezi platformami)
> - **Web channel automation** (nový 2024+) – workflows pro **visitor-based**, ne jen subscriber-based
> - **Paralelní autoresponders + workflows** – legacy + new coexist (matoucí pro nové users)
> - **27-jazyčné UI** včetně češtiny, slovenštiny, polštiny – jedinečné mezi velkými hráči

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Role uživatelů (predefined + custom)](#2-role-uživatelů)
3. [Account Owner flow](#3-account-owner-flow)
4. [Administrator flow](#4-administrator-flow)
5. [Marketer flow](#5-marketer-flow)
6. [Designer flow (with approval workflow)](#6-designer-flow)
7. [Custom Role flow](#7-custom-role-flow)
8. [Multiple Accounts flow (MAX/MAX2)](#8-multiple-accounts-flow)
9. [Subscriber lifecycle](#9-subscriber-lifecycle)
10. [Email lifecycle](#10-email-lifecycle)
11. [Workflow execution model](#11-workflow-execution)
12. [Autoresponder flow (legacy)](#12-autoresponder-flow)
13. [Webinar flow](#13-webinar-flow)
14. [Course / Content Monetization flow](#14-course-flow)
15. [E-commerce flow](#15-ecommerce-flow)
16. [API & Integration flow](#16-integration-flow)
17. [GDPR & Compliance flow](#17-gdpr-flow)
18. [Datová mapa: co vidí kdo](#18-datová-mapa)
19. [Známé úzkoprofilové místa](#19-úzkoprofilové-místa)

---

## 1. Mapa aktérů

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│         GETRESPONSE PLATFORM ECOSYSTEM                             │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [GetResponse Staff (Internal Support)]                            │
│   ├─ Customer Success Manager (dedicated, MAX+)                    │
│   ├─ Technical Support 24/7 (chat, email; phone MAX+)              │
│   ├─ Deliverability team                                           │
│   └─ Trust & Safety                                                │
│           │ (limited debug access with consent)                    │
│           ▼                                                        │
│                                                                    │
│   ┌──────────────────────────────────────────┐                     │
│   │   MAX / MAX2 Owner Account               │                     │
│   │   (Multi-brand, agency model)            │                     │
│   │   │                                      │                     │
│   │   ├─ Account Owner                       │                     │
│   │   └─ Multiple Accounts (one-to-many):    │                     │
│   │      │                                   │                     │
│   │      ▼                                   │                     │
│   │   ┌────────────────────────────┐         │                     │
│   │   │ Account A (Brand A)        │         │                     │
│   │   │  └─ Admin (per account)    │         │                     │
│   │   │  └─ Users + Roles          │         │                     │
│   │   ├────────────────────────────┤         │                     │
│   │   │ Account B (Brand B)        │         │                     │
│   │   ├────────────────────────────┤         │                     │
│   │   │ Account C (Brand C)        │         │                     │
│   │   └────────────────────────────┘         │                     │
│   └──────────────────┬───────────────────────┘                     │
│                      │                                             │
│   ┌──────────────────▼────────────────────┐                        │
│   │   Standard Account                    │                        │
│   │   (Starter/Marketer/Creator/Ecom)     │                        │
│   │                                       │                        │
│   │   ├─ Owner (account creator)          │◄── full access         │
│   │   ├─ Administrator(s)                 │◄── full except billing │
│   │   ├─ Marketer(s)                      │◄── content + analytics │
│   │   ├─ Designer(s)                      │◄── drafts only         │
│   │   └─ Custom Role users (unlimited)    │◄── per definition      │
│   │                                       │                        │
│   │   Limits per plan:                    │                        │
│   │   - Starter: 3 users incl.            │                        │
│   │   - Marketer: 5 users incl.           │                        │
│   │   - Creator: 5 users incl.            │                        │
│   │   - Team add-on: +5 users $20/m       │                        │
│   │   - Per user: +$5/month               │                        │
│   └──────────┬────────────────────────────┘                        │
│              │                                                     │
│              ▼                                                     │
│   [Subscribers / Contacts]                                         │
│       │                                                            │
│       ├─→ marketing emails (newsletters, automation)               │
│       ├─→ SMS (MAX+), web push, live chat                          │
│       ├─→ workflows triggered by events                            │
│       ├─→ webinar registrations + attendance                       │
│       ├─→ course enrollments + lesson progress                     │
│       ├─→ funnel conversions                                       │
│       └─→ form submissions                                         │
│              │                                                     │
│              ▼                                                     │
│   [ISPs, Browsers, Apps, Integrations]                             │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér | Vstupní bod | Co dělá | Co vidí |
|---|---|---|---|
| **Account Owner** | Account creation | Vše + billing + close account | Vše |
| **Administrator** | Pozvánka od Owner | Vše krom billing, Team, Affiliate | Vše krom billing |
| **Marketer** | Pozvánka | Email, automation, analytics | Marketing tools |
| **Designer** | Pozvánka | Drafts only (newsletters, forms, landing pages) | Design + drafts |
| **Custom Role User** | Pozvánka s custom role | Per role definition | Per role |
| **Account-specific Admin (MAX)** | Created v parent account | Manage one specific account | One account |
| **Subscriber / Contact** | Form, import, webhook, API | Otevírá emaily, klikne, registruje se na webinar | Své emaily + preference center |
| **Webinar attendee** | Webinar registration | Watches webinar, chats, polls | Webinar interface |
| **Course student** | Course enrollment | Watches lessons, takes quizzes | Course portal |
| **API Client** | API key | Per scope | Per scope |
| **Integration** (Shopify, WP) | OAuth/plugin | Sync data | Per OAuth scope |
| **GetResponse Staff** | Interní s consentem | Debug/support | Limited |

---

## 2. Role uživatelů

GetResponse má **3 default predefinované role + unlimited custom roles**.

### 2.1 Tři predefinované role

#### A) Administrator
- **Full control** krom Billing, Team management, Affiliate program
- Manage **vše** co Owner může krom finančních operací
- **Can manage other users** (kromě Owner-level changes)
- Most often role pro internal team leads

#### B) Marketer
- **Access to specific features** (configurable)
- Plný přístup k:
  - Email marketing (create, send, view stats)
  - Marketing automation (create, edit, activate workflows)
  - Landing pages (full control)
  - Forms (full control)
  - Webinars (schedule, manage – if has email send rights)
  - Push notifications
  - Live chat
- Typicky **NOT to:**
  - User management
  - Billing
  - Account settings
- **Per-list access** – může být restricted na specific lists

#### C) Designer
- **Design only role** – creates drafts
- Permissions:
  - Design newsletters (CANNOT send)
  - Design landing pages (CANNOT publish)
  - Design forms (CANNOT publish)
  - Access specific lists (configurable)
- **Approval workflow** – Admin/Marketer reviews and publishes
- **Unique GetResponse feature** – moderation built-in
- Ideal pro external designer, copywriter

### 2.2 Permission categories (full list)

Custom roles + predefined roles define permissions in těchto kategoriích:

#### Account & Billing
- Manage plan, billing
- Account settings
- Brand management

#### User Management
- Team management
- Add/edit users
- Create/edit roles

#### Lists & Contacts
- View contacts
- Edit contacts
- Import contacts
- Export contacts
- Custom fields management
- Tags management
- Suppression list

#### Email Marketing (Newsletters)
- No access
- **Design only** (cannot send)
- **Full control** (design + send)
- View statistics

#### Autoresponders
- Manage autoresponders
- View statistics

#### Marketing Automation
- View workflows
- Create/edit workflows
- Activate/deactivate workflows
- View workflow statistics
- **Note:** Access to MA automatically gives access to lists used in workflows (cross-permission!)

#### Forms & Popups
- No access
- Design only
- Full control
- View statistics

#### Landing Pages
- No access
- Design only
- Full control
- View statistics

#### Websites
- No access
- Full control

#### Webinars
- No access
- Schedule and manage (if has email send rights)
- Full control

#### Funnels
- No access
- Create funnels
- Full control

#### Live Chat (Chats)
- View chats
- Operator role (handle chats)
- Full administrator

#### Quick Transactional Emails
- No access
- Create/edit + view stats

#### Online Courses (Content Monetization)
- No access
- Create/edit courses
- Full control

#### Push Notifications
- No access
- Create/edit/send

#### SMS (MAX+)
- No access
- Full control

#### Integrations
- No access
- Manage integrations

#### API
- No access
- Manage API keys

#### Reports
- View specific reports

### 2.3 Permission matrix (predefined roles)

| Akce | Owner | Administrator | Marketer | Designer |
|---|:---:|:---:|:---:|:---:|
| **Account & Billing** |  |  |  |  |
| Manage plan, billing | ✅ | ❌ | ❌ | ❌ |
| Close account | ✅ | ❌ | ❌ | ❌ |
| Manage affiliate program | ✅ | ❌ | ❌ | ❌ |
| **User Management** |  |  |  |  |
| Manage Team (users + roles) | ✅ | ❌* | ❌ | ❌ |
| **Lists & Contacts** |  |  |  |  |
| View contacts | ✅ | ✅ | ✅ | ✅* |
| Edit contacts | ✅ | ✅ | ✅ | ❌ |
| Import contacts | ✅ | ✅ | ✅ | ❌ |
| Export contacts | ✅ | ✅ | ✅ | ❌ |
| **Email Marketing** |  |  |  |  |
| Design newsletters | ✅ | ✅ | ✅ | ✅ |
| Send newsletters | ✅ | ✅ | ✅ | ❌ |
| View statistics | ✅ | ✅ | ✅ | ❌ |
| **Marketing Automation** |  |  |  |  |
| Create/edit workflows | ✅ | ✅ | ✅ | ❌ |
| Activate workflows | ✅ | ✅ | ✅ | ❌ |
| **Forms & Landing Pages** |  |  |  |  |
| Design | ✅ | ✅ | ✅ | ✅ |
| Publish | ✅ | ✅ | ✅ | ❌ |
| **Webinars** |  |  |  |  |
| Schedule webinars | ✅ | ✅ | ✅ | ❌ |
| Run webinars | ✅ | ✅ | ✅ | ❌ |
| **Online Courses** |  |  |  |  |
| Create courses | ✅ | ✅ | ✅ | ❌ |
| **Funnels** |  |  |  |  |
| Create funnels | ✅ | ✅ | ✅ | ❌ |
| **Live Chat** |  |  |  |  |
| Handle chats | ✅ | ✅ | ✅ | ❌ |
| Admin chat settings | ✅ | ✅ | ❌ | ❌ |
| **Push Notifications** |  |  |  |  |
| Create/send push | ✅ | ✅ | ✅ | ❌ |
| **SMS (MAX+)** |  |  |  |  |
| Send SMS | ✅ | ✅ | ✅ | ❌ |
| **Integrations & API** |  |  |  |  |
| Manage integrations | ✅ | ✅ | ❌ | ❌ |
| Manage API keys | ✅ | ✅ | ❌ | ❌ |
| **Reports** |  |  |  |  |
| View reports | ✅ | ✅ | ✅ | view drafts only |

*Asterisks:* Administrator může mít user management povolen, pokud Owner explicitně povolí v custom role.

### 2.4 Custom Roles

GetResponse umožňuje **unlimited custom roles** (jen Marketer+ plans s Team feature).

#### Vytvoření custom role

```
Profile menu → Team → Manage roles → Add role
   ↓
Step 1: Name the role
   - E.g. "Copy Editor", "External Agency", "VIP Reviewer"
   ↓
Step 2: Question-based wizard:
   - Can users access email marketing? No / Design only / Full control
   - Can users access marketing automation? No / Full control
   - Can users access forms? No / Design only / Full control
   - Can users access webinars? No / Schedule and manage / Full control
   - Can users access courses?
   - Can users access live chat?
   - ... (per kategorie)
   ↓
Step 3: Specify lists access (if partial access chosen)
   - All lists
   - Specific lists (multi-select)
   ↓
Save
```

#### Limity custom rolí

- **Only one role per user** – nelze multi-role (změna oproti starší verzi)
- **Cannot edit predefined roles** – jen klonovat
- **Account-specific** (v MAX) – role v Account A neexistuje v Account B
- **Predefined roles can be migrated** – mohou mít slightly different permissions po migraci

### 2.5 User Seats and Pricing

#### Per plan limity (default included)

| Plán | Users included |
|---|---|
| Free | 1 (Owner only) |
| Starter | 3 (Owner + 2) |
| Marketer | 5 (Owner + 4) |
| Creator | 5 (Owner + 4) |
| Ecommerce Marketing | 5 (Owner + 4) |
| MAX | 10+ (custom) |
| MAX2 | Unlimited |

#### Team add-on

- **$20/měsíc** + **$5 per additional user**
- Adds 5 more users to Starter (max)
- Charge per 30 days, auto-renews

#### MAX Multi-User

- Built-in unlimited users (within reason)
- Multi-Account support
- Per-account user assignment

### 2.6 Invitation flow

```
Administrator: Profile → Team → Add user
   ↓
Step 1: Personal details
   - Name
   - Email (unique – nelze re-use)
   - Phone (optional)
   ↓
Step 2: Assign role
   - Predefined: Administrator / Marketer / Designer
   - OR Custom role
   ↓
Step 3: If role has partial list access:
   - Select specific lists user can access
   ↓
Step 4: Send invitation
   ↓
User receives email
   ↓
User clicks "Set password" link
   ↓
[Password setup]
   ↓
[Active user]
```

**Note:** No explicit expiration time published, but invitations should be accepted promptly. Re-invite available if expired.

---

## 3. Account Owner flow

### 3.1 Onboarding (první přihlášení)

```
1. Sign-up na getresponse.com → automatically Owner
   ↓
2. Email verification + activation
   ↓
3. Setup wizard:
   - Company name
   - Industry
   - Goal (lead gen, sales, content, etc.)
   - Estimated list size
   ↓
4. Account language, timezone (default per IP)
   ↓
5. Create first list (e.g. "Newsletter")
   ↓
6. Configure first "From" sender (verify email)
   ↓
7. Optional: import contacts (CSV, integration)
   ↓
8. Optional: connect e-commerce store (Shopify, WooCommerce, etc.)
   ↓
9. Optional: install GetResponse tracking script
   ↓
10. Onboarding tour:
   - Try AI Email Generator
   - Create first newsletter
   - Build first landing page
   ↓
11. Choose plan (or stay Free 30-day premium trial)
   ↓
12. (Optional) Domain authentication (DKIM, DMARC)
   ↓
13. (Optional) Invite team
```

### 3.2 Kritické Owner-only akce

#### Close account

```
Settings → My account → Close account
   ↓
Confirmation flow
   ↓
Reasoning survey
   ↓
Account scheduled for closure (GDPR retention period applies)
```

#### Manage billing

```
Settings → Billing
   ↓
View:
- Current plan
- List size + price
- Add-ons (Team, dedicated IP, etc.)
- Payment method
- Invoice history
- Discount codes
   ↓
Actions:
- Upgrade/downgrade plan
- Change billing cycle (monthly/annual – 18% discount)
- Add/remove add-ons
- Update payment method
- Cancel auto-renewal
```

#### Manage affiliate program

```
Settings → Affiliate program (Owner only)
   ↓
Apply for affiliate
   ↓
Get tracking link
   ↓
Track commissions (33% recurring)
```

### 3.3 Owner daily flow

```
Login → Dashboard
   ↓
Account overview:
- Active contacts
- Monthly email sends
- Recent campaign performance
- Active workflows
- Pending tasks
- Recent webinars
   ↓
Strategic:
- Review billing usage
- Plan upgrade thresholds
- Team performance
- Custom role audits
- Revenue from courses/funnels
```

---

## 4. Administrator flow

Administrator = top-level operational role.

### 4.1 Daily Administrator workflow

```
Login → Dashboard
   ↓
Operational checks:
- Yesterday's campaign metrics
- Active workflows status
- New form submissions
- Webinar registrations
- E-commerce sync status
- Failed deliveries
   ↓
Actions:
- Approve drafts from Designers
- Schedule campaigns
- Review automation logs
- Add/remove users
- Domain authentication checks
- Integration management
```

### 4.2 Vytvoření kampaně

```
Email Marketing → Newsletters → Create newsletter
   ↓
Step 1: Choose type
   - Quick (template + content)
   - From scratch
   - RSS to email
   - A/B test
   ↓
Step 2: Recipients
   - Select list(s)
   - Apply segment filter
   - Exclude lists
   ↓
Step 3: Setup
   - Subject + preview text (AI suggestion)
   - From name + email (verified sender)
   - Reply-to
   - Internal name (for organization)
   ↓
Step 4: Design
   - Drag-drop editor / HTML / template
   - Personalization with merge fields
   - Brand kit
   ↓
Step 5: Tracking
   - Conversion goal
   - Google Analytics integration
   - URL parameters (UTM)
   ↓
Step 6: Preview & Test
   - Test send
   - Preview as specific subscriber
   - Spam test (built-in)
   ↓
Step 7: Send or Schedule
   - Send now
   - Schedule date/time
   - Perfect Timing (AI per recipient)
   - Time Travel (local time)
   ↓
Confirm send
```

### 4.3 Approval workflow

```
Designer creates newsletter draft → submits for review
   ↓
Administrator notification
   ↓
Administrator: Moderate messages page
   ↓
Review draft:
- Accept (approves for send)
- Reject (with comment)
   ↓
If accepted → schedule/send
If rejected → Designer notified, revises
```

---

## 5. Marketer flow

Marketer = výkonný marketing user.

### 5.1 Daily Marketer workflow

```
Login → Dashboard
   ↓
Activities:
- Build segments
- Schedule email campaigns
- Review automation performance
- Update workflow logic
- Schedule webinars
- Manage course content
- Monitor live chat metrics
   ↓
Limited but capable:
- Cannot manage billing
- Cannot manage other users
- Cannot manage integrations (per role definition)
```

### 5.2 Build Marketing Automation Workflow

```
Automation → Workflows → Create workflow
   ↓
Volba způsobu:
A) From scratch (visual canvas)
B) From template
C) Import template
   ↓
A) From scratch:
   Step 1: Choose first condition (starting trigger)
   - Subscribed via form
   - Date-based trigger
   - Tag added
   - Webinar registration
   - Page visited
   - Custom event
   - ... (full list)
   ↓
   Step 2: Configure trigger details
   ↓
   Step 3: Add workflow elements:
   - Conditions (in-workflow checks)
   - Actions (send email, update field, tag, etc.)
   - Filters (segment narrowing)
   ↓
   Step 4: Connect with Yes/No connectors
   ↓
   Step 5: Configure each element:
   - Set wait times (with Time Travel option)
   - Configure email content
   - Set tag values
   ↓
   Step 6: Set workflow goal (conversion event)
   ↓
   Step 7: Set exit conditions (when to remove)
   ↓
   Step 8: Test workflow
   - Preview as specific contact
   - Send test through path
   ↓
   Step 9: Activate
   ↓
[Workflow Live]
```

---

## 6. Designer flow (with approval workflow)

**Unique feature** GetResponse – built-in moderation system.

### 6.1 Designer daily workflow

```
Login → Limited view
   - Only sections per role: Newsletters, Forms, Landing pages
   - Cannot see other features
   ↓
Activities:
- Create newsletter draft
- Design forms
- Design landing pages
   ↓
After creating:
- Click "Save as draft" (not "Send")
- Submits for review (depending on role config)
   ↓
[Draft waiting for moderation]
```

### 6.2 Approval workflow detail

```
Designer creates newsletter
   ↓
Save → draft v "Drafts" queue
   ↓
Administrator/Marketer (with publish rights) gets notification:
   - Email
   - In-app notification
   ↓
Reviewer: Moderate messages page
   - List of drafts waiting approval
   - Filter by Designer
   - View content
   ↓
Reviewer reviews:
- Click "Accept" → newsletter can be sent
- Click "Reject" with comment → Designer notified
- Click "Send now" → immediately sent (combined approve+send)
- Click "Schedule" → schedule for later
   ↓
Designer notified of decision
   ↓
If rejected → revise → re-submit
If accepted → newsletter in queue for send
```

### 6.3 Per-asset approval

- **Newsletters** – Designer creates → Admin approves & sends
- **Landing pages** – Designer creates → Admin publishes
- **Forms** – Designer creates → Admin publishes
- **Other assets** – per role definition

### 6.4 Designer use cases

- **External agency** with limited trust – drafts only, agency reviews
- **Copywriter** – designs content, doesn't send
- **Junior team member** – training phase
- **Brand consultant** – designs templates, doesn't have list access

---

## 7. Custom Role flow

### 7.1 Create custom role

```
Administrator/Owner: Profile → Team → Manage roles → Add role
   ↓
Name the role (descriptive)
   ↓
Question-based wizard for each feature area:
   - Email marketing: No / Design only / Full control
   - Marketing automation: No / Full control
   - Forms: No / Design only / Full control
   - Landing pages: ...
   - Webinars: ...
   - Courses: ...
   - Live chat: ...
   - Push: ...
   - SMS: ...
   - Integrations: ...
   - Reports: per view granular
   ↓
If "partial access" for any feature:
   - Specify which lists
   ↓
Save role
```

### 7.2 Assign custom role to user

```
Profile → Team → Add user (or edit existing)
   ↓
Email + Personal details
   ↓
Role: Custom roles dropdown → select created role
   ↓
If role has partial list access:
   - Specify which lists this user can access
   ↓
Send invitation OR save (if existing user)
```

### 7.3 Edit role permissions

```
Profile → Team → Manage roles
   ↓
Click role → Edit
   ↓
Re-run wizard with new selections
   ↓
Save → applies to ALL users with this role
```

### 7.4 Common custom role examples

#### "Copy Editor"
- Newsletter: Design only
- Lists: View only (specific lists)
- Reports: No
- Everything else: No

#### "Webinar Manager"
- Webinars: Full control
- Newsletters: Design only (for webinar invites)
- Marketing Automation: View workflow (for webinar workflows)
- Everything else: No

#### "Course Creator"
- Online Courses: Full control
- Newsletters: Send (for course communications)
- Lists: Full (specific course lists)
- Marketing Automation: Full
- Everything else: No

#### "Reporting Analyst"
- All sections: View only
- Reports: Full view
- No edit anywhere

### 7.5 Custom role gotchas

- **Cross-permission gotcha:** If user has Marketing Automation access, they automatically have access to lists used in workflows (even if list-level access not granted)
- **One role per user** – cannot stack multiple roles
- **Account-specific** (v MAX) – Account A's roles ≠ Account B's roles

---

## 8. Multiple Accounts flow (MAX/MAX2)

### 8.1 Architecture

```
MAX Owner Account (parent)
├── Account Owner (oversees all)
└── Multiple Accounts
    ├── Account A (Brand A)
    │   ├── Account-specific Admin (assigned by Owner)
    │   ├── Users (specific to Account A)
    │   ├── Roles (specific to Account A)
    │   ├── Contacts (isolated)
    │   ├── Lists, Segments, Workflows
    │   ├── Campaigns, Templates
    │   └── Optional: Dedicated IP
    │
    ├── Account B (Brand B)
    │   └── ...
    │
    └── Account C (Brand C)
        └── ...
```

### 8.2 Use cases

- **Marketing agency** – jeden parent account, multiple klient accounts
- **Multi-brand company** – parent + brands isolated
- **Multi-region** – per-region accounts (e.g. EU, US, APAC)
- **Sandbox + production**

### 8.3 Create new account

```
Owner: Profile menu → Accounts and users
   ↓
Section: Accounts → Add new account
   ↓
Enter:
- Account name (visible v Manage accounts list)
- Admin information:
  - Admin name + email
  - Initial password (admin gets email to set their own)
   ↓
Confirm
   ↓
New account created + Admin notification email sent
```

### 8.4 Account-specific admin

- Assigned at account creation
- Manages users + roles within that account
- **Cannot manage parent account** or other accounts
- **Account-isolated permissions**

### 8.5 Switch between accounts

```
Login → Sees Manage accounts page
   ↓
Click on account → switch into it
   ↓
UI shows only that account's data
   ↓
Top-right menu: Switch account → back to others
```

### 8.6 Centralized billing

- Single invoice per MAX parent
- Per-account usage tracked
- Plan thresholds at parent level

### 8.7 Cross-account reporting (MAX2)

```
Owner: Reports → Cross-account view
   ↓
Aggregate metrics:
- Total contacts napříč accounts
- Total emails sent
- Top performing campaigns per account
- Revenue per account
   ↓
Drill-down to specific account
```

### 8.8 Limitations

- **Cannot share contacts** between accounts (intentional isolation)
- **Templates can be shared** across accounts (with permission)
- **Workflows must be re-created** per account (no easy clone across)

---

## 9. Subscriber lifecycle

### 9.1 Sign-up methods

#### A) Form submission (popup, embedded)
```
Visitor fills GetResponse form
   ↓
Form data submitted
   ↓
GetResponse:
- Validation (email syntax, captcha)
- Duplicate check per list
- Blacklist check
- GDPR consent recorded (if configured)
   ↓
[Pending – if double opt-in] or [Active]
   ↓
Add to specified list
   ↓
Workflow trigger fires (if active)
```

#### B) Double opt-in (recommended)
```
Form submission
   ↓
[Pending state] – does NOT count toward billing
   ↓
GetResponse sends confirmation email
   ↓
Subscriber clicks confirm link
   ↓
IP + timestamp + user agent logged
   ↓
[Active state] – counts toward billing
   ↓
Workflow trigger fires
```

#### C) E-commerce integration sync
```
Customer creates account on Shopify
   ↓
Shopify webhook → GetResponse
   ↓
Contact created with marketing_consent flag
   ↓
Add to designated list (per integration config)
```

#### D) Manual import (CSV)
```
Admin: Contacts → Import contacts
   ↓
CSV upload
   ↓
Field mapping (email, name, custom fields)
   ↓
Choose import options:
- List destination
- Consent confirmation
- Skip duplicates
- Tag with import source
   ↓
Validation (Brevo-like email checking)
   ↓
Import processed
   ↓
Contacts added
```

#### E) API
```
External system → POST /v3/contacts
   ↓
Body: { email, name, dayOfCycle, customFields, tags, scoring, ... }
   ↓
GetResponse: validate + create
   ↓
Add to specified list
```

### 9.2 Engagement & tracking

```
Subscribed contact
   ↓
Receives newsletter / automation email
   ↓
Tracking pixel loads → Open recorded
   ↓
Click on link → GetResponse redirect tracker → Click recorded
   ↓
If GetResponse JS installed on website:
- Active on Site events
- Page view tracking
- Custom event tracking
   ↓
Contact attributes auto-update:
- Last activity
- Engagement score (if lead scoring active)
- Tags (if workflow triggers)
   ↓
Segments auto-update
   ↓
Workflows trigger if new conditions met
```

### 9.3 Preference Center

```
Email footer: "Update your preferences" link
   ↓
GetResponse-hosted preference center (s tokenem)
   ↓
Subscriber vidí:
- Subscribed lists (with toggle)
- Personal info (editable)
- Custom field values (editable)
- "Unsubscribe from all" master toggle
   ↓
Update preferences
   ↓
Profile updated
   ↓
Workflow trigger (if "Subscription updated" event)
```

### 9.4 Unsubscribe

```
Subscriber clicks Unsubscribe link
   ↓
GetResponse unsubscribe page:
- Confirms intent
- Optional: reason survey
- Optional: just unsubscribe from specific list
   ↓
If "Unsubscribe from all":
- All list memberships removed
- Status: "Removed"
- Audit trail recorded
   ↓
**Removed contact does NOT count toward billing** ← key billing advantage
   ↓
Contact data retained per GDPR
   ↓
Workflow trigger "Unsubscribed" fires
```

### 9.5 Re-subscribe

```
Previously unsubscribed contact fills form again
   ↓
GetResponse recognizes existing email
   ↓
If was unsubscribed normally:
- Subscriber back to Active state
- Re-add to list
- Trigger Welcome workflow (if applicable)
- Confirmation may be requested per double opt-in setting
```

### 9.6 Bounce handling

#### Hard bounce
```
ISP returns 5xx
   ↓
GetResponse marks Hard Bounce
   ↓
Auto-remove from list (or mark inactive per setting)
   ↓
Status: "Bounced"
   ↓
**Does NOT count toward billing**
```

#### Soft bounce
```
ISP returns 4xx (mailbox full, server issue)
   ↓
GetResponse marks Soft Bounce
   ↓
Retries N times over X days
   ↓
If still failing → escalate to Hard Bounce
```

### 9.7 Spam complaint

```
Subscriber clicks "Report spam" in inbox
   ↓
ISP FBL → GetResponse
   ↓
Auto-unsubscribe (status: Removed)
   ↓
Updated sender reputation tracking
   ↓
Workflow trigger fires
```

---

## 10. Email lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  1. USER drafts newsletter/automation email                     │
│     - Select audience (list/segment)                            │
│     - Configure trigger (for automation)                        │
│     - Design + personalization                                  │
│     - Conversion goal set                                       │
│                            │                                    │
│                            ▼                                    │
│  2. PRE-SEND CHECKS (GetResponse auto):                         │
│     - Sender verified?                                          │
│     - Domain authentication status                              │
│     - Audience valid?                                           │
│     - Plan limits OK? (unlimited emails on paid)                │
│     - GDPR compliance fields?                                   │
│                            │                                    │
│                            ▼                                    │
│  3. APPROVAL WORKFLOW (if Designer drafted):                    │
│     - Admin reviews                                             │
│     - Accept/Reject                                             │
│     - If accepted → continue to send                            │
│                            │                                    │
│                            ▼                                    │
│  4. SEND TIME determination:                                    │
│     - Manual time                                               │
│     - Perfect Timing (AI per recipient)                         │
│     - Time Travel (local time)                                  │
│                            │                                    │
│                            ▼                                    │
│  5. PER-RECIPIENT EMAIL GENERATION                              │
│     - Merge fields resolved                                     │
│     - Dynamic content evaluated                                 │
│     - Product blocks rendered (e-commerce)                      │
│     - Tracking pixels embedded                                  │
│     - Click trackers wrapped                                    │
│                            │                                    │
│                            ▼                                    │
│  6. SMTP SEND from GetResponse EU infra (Poland primary)        │
│     - From: configured verified sender                          │
│     - DKIM signed with your domain key                          │
│     - SPF: GetResponse's mailfrom                               │
│     - DMARC compliant                                           │
│     - List-Unsubscribe header (RFC 8058)                        │
│                            │                                    │
│                            ▼                                    │
│  7. ISP RECEIVES (Gmail/Outlook/Yahoo):                         │
│     - SPF check                                                 │
│     - DKIM verify (PASS)                                        │
│     - DMARC alignment (PASS via DKIM)                           │
│     - Reputation check                                          │
│     - Content filters                                           │
│                            │                                    │
│                            ▼                                    │
│  8. ROUTING:                                                    │
│     - Inbox / Primary                                           │
│     - Promotions                                                │
│     - Spam                                                      │
│     - Rejected                                                  │
│                            │                                    │
│                            ▼                                    │
│  9. RECIPIENT INTERACTION:                                      │
│     - Open → tracking pixel → recorded                          │
│     - Click → GetResponse proxy → tracked + redirect            │
│     - Web tracker fires page events                             │
│                            │                                    │
│                            ▼                                    │
│ 10. CONTACT UPDATE:                                             │
│     - Activity timeline updated                                 │
│     - Last open/click attributes                                │
│     - Lead scoring updated                                      │
│     - Segments re-evaluated                                     │
│                            │                                    │
│                            ▼                                    │
│ 11. WORKFLOW TRIGGERS:                                          │
│     - "Message opened" condition fires                          │
│     - "Link clicked" condition fires                            │
│     - Lead scoring threshold may trigger downstream             │
│                            │                                    │
│                            ▼                                    │
│ 12. CONVERSION TRACKING:                                        │
│     - Goal completion (purchase, form submit, etc.)             │
│     - Revenue attribution                                       │
│     - Funnel step conversion                                    │
│                            │                                    │
│                            ▼                                    │
│ 13. REPORTING:                                                  │
│     - Real-time campaign stats                                  │
│     - Industry benchmarks comparison                            │
│     - Custom dashboard updates                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. Workflow execution

### 11.1 Workflow activation

```
User builds workflow (drag-drop)
   ↓
Save as Draft
   ↓
Test (optional):
- Test as specific contact
- Send through each step
   ↓
Activate workflow
   ↓
GetResponse validation:
- All elements configured
- No infinite loops
- Triggers valid
- Filters specified
   ↓
[Status: Active]
   ↓
Workflow engine starts evaluating
```

### 11.2 Trigger evaluation

```
Event occurs (e.g. Subscribed to list)
   ↓
GetResponse workflow engine evaluates active workflows
   ↓
For each workflow with matching trigger:
- Check trigger conditions
- Check filters
- Check if contact already in workflow (reentry rules)
- Add contact to workflow execution
```

### 11.3 Workflow execution per contact

```
Contact enters at trigger
   ↓
First step typically wait or immediate action
   ↓
For each step:
- Action: execute (send email, update field, tag, etc.)
- Condition: evaluate, branch yes/no
- Filter: narrow per criteria, exit if not match
- Wait: queue, resume after delay
   ↓
Continue until:
- End of flow
- Exit condition met
- Workflow goal achieved
- Contact removed from account
```

### 11.4 Time Travel option

- **Per Wait element** lze enable Time Travel
- Wait considers recipient's local time zone (from profile)
- E.g. "Send 9am" → 9am IN recipient's TZ
- Recipient TZ determined from form data, IP, or set in profile

### 11.5 Run multiple times option

- Some workflow elements lze set to **run multiple times**
- E.g. Wait until [page visited] – multiple visits
- E.g. Score increase on repeat clicks

### 11.6 Web channel automation (newer, 2024+)

- **Visitor-based workflows** – not subscriber-based
- Tracks anonymous visitors via cookie
- Workflows fire on:
  - Page visits
  - Custom JS events
  - Behavior patterns
- When visitor becomes subscriber → workflow can continue
- **"Email subscriber filter (web channel)"** – differentiate between known and anonymous

### 11.7 Workflow analytics

- Per-workflow:
  - Total contacts entered
  - Currently in workflow
  - Completed (reached end)
  - Exited (via exit condition)
  - Goal achieved
- Per-step:
  - Contacts at each step
  - Email metrics (open, click)
  - Drop-off rates

### 11.8 Workflow logs

```
Automation → Logs
   ↓
View:
- Workflow logs (which contacts entered/exited)
- Event logs (which conditions met)
- Contacts in workflow (current status, step)
   ↓
Filter by:
- Workflow
- Contact
- Time period
- Event type
```

---

## 12. Autoresponder flow (legacy)

### 12.1 Autoresponder logic

- **Sequential drip emails** based on subscription day
- E.g. Day 0 (welcome), Day 3, Day 7, Day 14
- **Single trigger:** subscribed to list
- **No conditional branching** (vs. workflows)

### 12.2 Autoresponder configuration

```
Email Marketing → Autoresponders → Create autoresponder
   ↓
Configure:
- Name
- List
- Day of cycle (0, 1, 3, 7, etc.)
- Specific time (e.g. 9:00)
- Specific days of week (optional)
- Subject + content
   ↓
Activate
   ↓
[Active autoresponder]
```

### 12.3 Subscriber's autoresponder journey

```
Subscriber joins list (Day 0)
   ↓
Autoresponder Day 0 sends at scheduled time
   ↓
Day 1 passes
   ↓
Day 3 autoresponder sends (if configured)
   ↓
... continues per cycle
   ↓
Reaches end of cycle → no more autoresponders
```

### 12.4 Autoresponders vs. Workflows

| Aspect | Autoresponders | Workflows |
|---|---|---|
| Setup complexity | Simple | Medium |
| Logic | Linear time-based | Conditional, event-based |
| Available on | All plans | Marketer+ |
| Best for | Simple welcome series, drip courses | Behavioral, complex journeys |
| Coexists | Yes – runs in parallel | Yes – can reference autoresponders |

### 12.5 Workflow referencing autoresponders

```
Workflow can call:
   "Subscribe to autoresponder cycle X"
   OR
   "Send specific autoresponder day N"
   ↓
Use case: complex workflow with simple drip as part of it
```

---

## 13. Webinar flow

### 13.1 Setup webinar

```
Webinars → Create webinar
   ↓
Step 1: Type
- Live webinar
- Auto webinar (evergreen)
- Hybrid
   ↓
Step 2: Details
- Title
- Date + time + duration
- Description
- Banner image
- Custom URL
- Host (you or another user)
- Co-hosts (optional)
   ↓
Step 3: Registration page
- Use template
- Customize design
- Form fields (default + custom)
- GDPR consent
   ↓
Step 4: Settings
- Recording (auto-record on/off)
- Replay (yes/no, expire after X days)
- Q&A enabled
- Polls (pre-create)
- Chat moderation
   ↓
Step 5: Email sequence (auto-generated, customizable):
- Confirmation email (after registration)
- 24h reminder
- 1h reminder
- "Live now" notification
- Post-webinar thank you (with replay link if enabled)
   ↓
Step 6: Workflow integration (optional)
- Trigger automation on registration
- Different paths for attended vs. no-show
   ↓
Activate webinar
```

### 13.2 Registration flow

```
Visitor visits registration page
   ↓
Fills form (name, email, custom fields)
   ↓
GetResponse:
- Creates contact
- Adds to webinar attendee list
- Sends confirmation email
- Schedules reminder emails
- Triggers workflows (if configured)
   ↓
Registration confirmed
```

### 13.3 Live webinar execution

```
Time of webinar → Host clicks "Start"
   ↓
Webinar room opens:
- Video + audio streaming
- Screen sharing
- Whiteboard
- Chat box
- Q&A panel
- Polls
- Files
- CTAs / buttons (with payment options)
   ↓
Attendees join (browser-based)
   ↓
Engagement tracking:
- Join time
- Watch duration
- Chat participation
- Poll votes
- CTA clicks
   ↓
Host can:
- Promote attendee to presenter
- Share screen / camera
- Run polls
- Show CTAs
- Process payments live
   ↓
Webinar ends
   ↓
Auto-record uploaded
   ↓
Post-webinar emails sent (different per attended/no-show)
```

### 13.4 Auto-webinar (evergreen)

```
Pre-recorded video uploaded
   ↓
Configure as scheduled webinar
- Visitors can register for "live" time slot
- Plays as live at that time
   ↓
Engagement features still active:
- Live chat (with host present)
- Polls
- Q&A
- CTAs at specific times
   ↓
Recurring schedule:
- Daily at X time
- Weekly
- Custom schedule
```

### 13.5 Post-webinar automation

```
Workflow trigger: "Webinar attended" / "Webinar registered but didn't attend"
   ↓
Different paths:
- Attended → thank you + offer
- No-show → replay link + offer
   ↓
Continue with sales sequence:
- Day 1: Replay link
- Day 3: Case study email
- Day 7: Limited offer
- Day 14: Final reminder
   ↓
Goal: purchase
```

### 13.6 Webinar reports

- Total registered
- Attended count + %
- Average watch time
- Engagement metrics (chat, polls, CTAs)
- Conversion (purchases during/post webinar)
- Revenue per webinar
- Replay views

---

## 14. Course / Content Monetization flow

### 14.1 Course creation flow

```
Online Courses → Create course
   ↓
Step 1: Course basics
- Name
- Description
- Cover image
- Category
- Pricing model:
  • Free
  • One-time payment
  • Subscription
  • Payment plan
   ↓
Step 2: Module + Lesson structure
- Modules (chapters)
- Lessons per module:
  - Video upload (built-in hosting)
  - Text + images
  - Files (PDFs, etc.)
  - Quizzes
   ↓
Step 3: Drip schedule
- All lessons immediate
- Or drip per day/week
- Or unlock on lesson completion
   ↓
Step 4: Access settings
- Public course
- Member-only
- Specific list members
   ↓
Step 5: Pricing setup
- Stripe integration (for paid courses)
- Currency
- Tax handling
   ↓
Step 6: Landing page for course
- Auto-generated, customizable
- Sales copy
- Curriculum overview
- Pricing table
- Testimonials
- CTA button
   ↓
Publish course
```

### 14.2 Student enrollment flow

```
Visitor lands on course page
   ↓
Free course: clicks "Enroll" → email signup form
Paid course: clicks "Buy" → checkout (Stripe)
   ↓
Payment processed (if paid)
   ↓
GetResponse:
- Creates contact
- Adds to course members list
- Sends welcome email with access link
- Triggers course welcome workflow
   ↓
Student lands on course portal
   ↓
Sees curriculum + first lesson unlocked
```

### 14.3 Course-driven workflows

```
Trigger: "Enrolled in course"
   ↓
Welcome email
   ↓
Wait until [Lesson 1 started]
   ↓
After 3 days without start:
   - Send reminder email
   ↓
On [Lesson 1 completed]:
   - Send congratulations + next lesson nudge
   - Unlock Lesson 2 (if drip)
   ↓
Continue for each lesson
   ↓
Course completed:
   - Generate certificate
   - Send congratulations email
   - Trigger upsell (next course)
```

### 14.4 Quiz flow

```
Lesson with quiz
   ↓
Student answers questions
   ↓
GetResponse:
- Auto-grades
- Records score
- Releases next lesson if passed
   ↓
If failed:
- Show "Try again" or "Review lesson"
- Trigger workflow: "Quiz failed" → send help email
```

### 14.5 Course analytics

- Enrollments per course
- Active vs. completed students
- Per-lesson completion rates
- Average time to complete
- Quiz pass rates
- Revenue (paid courses)
- Top performing courses

### 14.6 Paid Newsletters

```
Setup paid newsletter:
- Stripe integration
- Subscription tier (monthly, yearly)
- Member-only content
   ↓
Subscriber pays
   ↓
GetResponse:
- Creates contact in paid list
- Sends welcome
- Tags as "Paid Member"
   ↓
Future newsletters auto-send only to paid list
   ↓
Subscription expires (cancellation):
- Auto-tag "Cancelled"
- Trigger winback workflow
```

---

## 15. E-commerce flow

### 15.1 Integration setup

```
Owner: Integrations → Choose e-commerce platform (Shopify, WooCommerce, etc.)
   ↓
OAuth authorize / plugin install
   ↓
Initial sync:
- Customers → contacts (with consent flag)
- Orders → events with order data
- Products → catalog
- Abandoned carts → cart events
   ↓
Continuous sync via webhooks
   ↓
[Integration active]
```

### 15.2 Abandoned cart flow

```
Customer adds to cart on store
   ↓
Store webhook → GetResponse: cart event
   ↓
If checkout not completed in X hours:
- Workflow trigger: "Cart abandoned"
- Filter: cart value > threshold
   ↓
Email 1 (1 hour delay): "Forgot something?"
- Product images dynamically pulled
- Direct checkout link
   ↓
Email 2 (24 hours): 10% discount code
   ↓
Email 3 (48 hours): final reminder
   ↓
Goal: purchase completed → exit
```

### 15.3 Post-purchase flow

```
Order placed → "Order placed" event
   ↓
Trigger: "Order placed" workflow
   ↓
Actions:
- Send order confirmation (transactional)
- Wait 7 days → tutorial email
- Wait 21 days → review request
- Wait 60 days → cross-sell
- Predicted replenishment: send reorder reminder (consumables)
```

### 15.4 AI Product Recommendations (Ecommerce+)

```
Email contains "Recommendations" block
   ↓
GetResponse AI:
- Analyzes contact's purchase history
- Browse behavior
- Similar customers
- Trending products
   ↓
Dynamically inserts top N products
   ↓
Click tracked → attribution
```

### 15.5 E-commerce reporting

```
Reports → E-commerce
   ↓
View:
- Revenue per campaign
- Top products sold (attributed)
- AOV trends
- Customer lifetime value (basic)
- Cart abandonment rate
- Conversion funnel
```

---

## 16. API & Integration flow

### 16.1 API key creation

```
Owner/Admin: Integrations and API → API
   ↓
Generate new API key
   ↓
Name + Description
   ↓
Save → key displayed (copy!)
   ↓
**API key bound to user account level**
```

### 16.2 API request flow

```
Application code:
   POST https://api.getresponse.com/v3/contacts
   Headers:
     X-Auth-Token: api-key {key}
     Content-Type: application/json
   Body: { "email": "...", "name": "...", "campaign": {"campaignId": "..."}, ... }
   ↓
GetResponse:
- Validates auth
- Rate limit check
- Validates payload
   ↓
Response: 202 Accepted (queued)
   ↓
Contact added to specified list
   ↓
Workflows triggered if applicable
```

### 16.3 OAuth flow (for public apps)

```
3rd party app initiates OAuth
   ↓
Redirect to GetResponse authorize
   ↓
User logs in + grants scopes
   ↓
Authorization code returned
   ↓
App exchanges code → access token
   ↓
App uses Bearer token
```

### 16.4 Webhook subscription

```
Settings → Integrations → Webhooks
   ↓
Add webhook:
- Target URL
- Events to subscribe (multi-select)
   ↓
GetResponse POSTs on each event
   ↓
Application processes
```

### 16.5 Plugin install (WordPress example)

```
Admin: WordPress → Plugins → GetResponse → Install
   ↓
Activate
   ↓
Configure:
- API key
- Default list
- Form display options
- WooCommerce integration toggle
   ↓
Plugin:
- Syncs WordPress users to GetResponse
- Embeds GetResponse forms
- WooCommerce data sync (orders, customers)
```

---

## 17. GDPR & Compliance flow

### 17.1 EU hosting advantage

```
GetResponse servers primarily in Poland (Gdańsk + partners)
   ↓
EU data residency default
   ↓
For EU customers: no data transfer outside EU
   ↓
Lower latency for EU operations
   ↓
GDPR by design built-in
```

### 17.2 Right to Be Forgotten

```
Subscriber requests deletion
   ↓
Method A: UI
- Admin: search contact → Delete from account permanently
- Confirmation
- Delete

Method B: API
- DELETE /v3/contacts/{id}
- Response 204

Method C: Self-service preference center
- Click "Delete me" link (if enabled)
   ↓
GetResponse:
- Removes contact data
- Anonymizes related events
- Adds to permanent suppression
- Logs deletion event
- Email confirmation (optional)
```

### 17.3 Data export per contact

```
Admin: Contact → Export contact data
OR
API: GET /v3/contacts/{id} + related events
   ↓
GetResponse generates JSON / CSV with:
- Profile data
- Activity history
- Subscriptions
- Form submissions
- Event log
   ↓
Provides download link (time-limited)
```

### 17.4 Consent tracking

For each contact:
- Per-consent field timestamp + IP
- Opt-in source (form ID, import, API, integration)
- Double opt-in audit (if applicable)
- Per-list subscription status

### 17.5 Consent Fields

GetResponse-specific feature:
```
Settings → Custom fields → Add consent field
   ↓
Define:
- Consent name (e.g. "Marketing newsletter")
- Required text shown to subscribers
- Default value (unchecked recommended)
   ↓
Use in forms as required GDPR consent
   ↓
Workflow filter: "Consent value: yes for [field]"
```

### 17.6 DPA

- Available for signing electronically
- Sub-processor list public
- Updates notified to customers

---

## 18. Datová mapa: co vidí kdo

| Data | Owner | Administrator | Marketer | Designer | Custom Role | MAX Account Admin | Subscriber | API |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Billing & subscription | ✅ | ❌ | ❌ | ❌ | per role | one account only | ❌ | per scope |
| Team management | ✅ | per role | ❌ | ❌ | per role | one account only | ❌ | per scope |
| All contacts | ✅ | ✅ | per role | view only | per role | one account only | jen sebe | ✅ |
| Edit contacts | ✅ | ✅ | per role | ❌ | per role | one account | ❌ | ✅ |
| Lists & segments | ✅ | ✅ | full/partial | view limited | per role | one account | – | ✅ |
| Email campaigns | ✅ | ✅ | full | drafts only | per role | one account | jen co dostal | ✅ |
| Send campaigns | ✅ | ✅ | full | ❌ | per role | one account | ❌ | ✅ |
| Marketing Automation | ✅ | ✅ | full | ❌ | per role | one account | ❌ | ✅ |
| Forms | ✅ | ✅ | full | drafts only | per role | one account | – | ✅ |
| Landing pages | ✅ | ✅ | full | drafts only | per role | one account | – | ✅ |
| Websites | ✅ | ✅ | per role | ❌ | per role | one account | – | per scope |
| Webinars | ✅ | ✅ | full | ❌ | per role | one account | jen registr. | per scope |
| Courses | ✅ | ✅ | full | ❌ | per role | one account | jen enrolled | per scope |
| Funnels | ✅ | ✅ | full | ❌ | per role | one account | ❌ | per scope |
| Live chat | ✅ | ✅ | operator | ❌ | per role | one account | own chats | per scope |
| Push notifications | ✅ | ✅ | full | ❌ | per role | one account | jen co dostal | per scope |
| SMS (MAX+) | ✅ | ✅ | full | ❌ | per role | one account | jen co dostal | per scope |
| Reports | ✅ | ✅ | full | drafts only | per role | one account | ❌ | ✅ |
| API keys | ✅ | ✅ | ❌ | ❌ | per role | one account | ❌ | – |
| Integrations | ✅ | ✅ | ❌ | ❌ | per role | one account | ❌ | per scope |
| Domain settings | ✅ | ✅ | ❌ | ❌ | per role | one account | ❌ | per scope |
| GDPR delete | ✅ | ✅ | per role | ❌ | per role | one account | request | per scope |
| Cross-account view (MAX2) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 19. Známé úzkoprofilové místa

### 19.1 Role/User management

- **3 predefined roles fixed** – Administrator, Marketer, Designer
- **Custom Roles jen Marketer+** – Starter má jen predefined
- **One role per user** – cannot stack multiple roles (změna oproti starší verzi)
- **Cannot edit predefined roles** – jen vytvořit identical custom
- **Team add-on cost stacks** – $20/měsíc + $5/user může být drahé pro velké teams
- **Invitations bez explicit expiration time** – best practice: prompt acceptance

### 19.2 Multiple Accounts limitations

- **Only MAX/MAX2** – pro malé agentury nedostupné
- **Cannot share contacts** between accounts
- **Templates limited cross-account** – sharing s permission
- **Workflows must be recreated** per account
- **Custom roles account-specific** – cannot share across accounts

### 19.3 Two automation paradigms

- **Autoresponders + Workflows coexist** – matoucí pro nové users
- Best practice: use Workflows pro all new automations
- Autoresponders not deprecated – continued support
- **Workflow elements lze use existing autoresponders** – integrace OK

### 19.4 Web channel automation novelty

- **Visitor-based workflows** – relatively new (2024+)
- Documentation evolving
- **"Email subscriber filter (web channel)"** – nutno správně použít
- Tracking script setup required

### 19.5 Plán limitations frustrace

- **Starter má jen 1 custom workflow** – frustrující pro testing
- **Webinars jen Marketer+** – limituje content creators na Starter
- **SMS jen MAX+** – nedostupné pro většinu
- **Dedicated IP jen MAX2** – ne add-on jako konkurence

### 19.6 UI/UX issues

- **Některé templates dated** – design ne tak polished jako Klaviyo / Mailchimp
- **Complex menu structure** – features napříč multiple sections
- **Navigation depth** – některá nastavení hluboko v menu
- **27-jazyčné UI** ale kvalita lokalizací varies

### 19.7 Approval workflow limitations

- **Per-asset approval** – ale není uniformní napříč asset types
- **No bulk approve** – per-asset přístup
- **Notifications can be missed** – pokud admin not regularly checking

### 19.8 E-commerce limitations

- **Less polished než Klaviyo** pro DTC e-commerce
- **No advanced predictive analytics** (CLV, churn risk auto-calculated)
- **Shopify integration ne tak deep** jako Klaviyo
- **Limited Customer Data Platform** capabilities

### 19.9 Webinar limitations

- **Browser-based** – no native app (jako Zoom)
- **1 000 attendees max** (MAX2) – pro large events Zoom levnější
- **Streaming quality dependent** on bandwidth
- **No simulive with hosts** – jen evergreen recordings

### 19.10 API & integration gotchas

- **API rate limits** vary by plan – not always clearly documented
- **Webhook latency** občas delayed
- **Some integrations via Zapier only** – ne native
- **Webhook signature verification** required for security

### 19.11 Migration challenges

- **No flow export to other platforms**
- **Templates: HTML export OK** but custom blocks lost
- **Contacts: CSV/API export OK**
- **Historical workflow data not portable**
- **Course content not portable** (member data, progress)

### 19.12 Compliance gaps

- **Audit logs limited** mimo MAX+
- **SSO/SAML jen MAX+**
- **GDPR delete may take days** to fully propagate
- **No HIPAA support** (vs. HubSpot Service Hub Enterprise)

---

## 20. Doporučení pro design vlastních procesů

Pokud GetResponse používáte v týmu, doporučujeme:

1. **Domain authentication první den** – DKIM + DMARC
2. **Custom roles strategy** – ne ad-hoc per-user permissions
3. **Naming convention** pro workflows, lists, segments (např. "WELCOME_NEWSLETTER_2026_Q2_CZ")
4. **Approval workflow utilization** – pro externí designery
5. **Multi-Account setup** (MAX) per brand / region / environment
6. **Quarterly user audit** – inactive users → revoke
7. **API key servisní účet** – ne user-bound (přežije fluktuaci)
8. **Workflow templates library** – uložit kanonické pro re-use
9. **Test contacts** – dedicated pro QA campaigns + flows
10. **Autoresponders migration plan** – postupně přejít na Workflows
11. **Web channel workflows** – využít pro visitor-based engagement
12. **GDPR compliance documentation** – consent audit + per-list reasoning
13. **Webinar strategy** – combine s funnels + courses
14. **E-commerce integration setup** – Shopify/WooCommerce s deep sync
15. **Lead scoring rules** – review + recalibrate quarterly
16. **Backup workflows** – periodic export of workflow definitions
17. **Multi-language strategy** – využít 27-jazyčné UI + AI translation
18. **Course monetization plan** – use pre-built workflows for student journeys
19. **Reports dashboard** – build per-team custom dashboards
20. **Industry benchmarks** – use as baseline pro performance review

---

*Dokument zpracován z oficiálních zdrojů getresponse.com/help, getresponse.com/features a praktických zdrojů (EmailVendorSelection, EmailToolTester, Sender, ITQlick, Research.com, TodayTesting, SoftHubTools, Tekpon, That Marketing Buddy, Ecommerce Paradise). Pro nejaktuálnější detaily vždy konzultovat GetResponse Help Center.*
