# HubSpot – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v HubSpotu prochází data, lidé a akce – od Super Admina přes specializované uživatele a integrace až po koncového kontakt/lead.

> Tento dokument doplňuje `03_HubSpot_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** HubSpot umí, tento popisuje, **kdo s tím interaguje a jak data tečou**.

> **Klíčový rozdíl od Mailchimpu:** HubSpot není „seznam kontaktů". Je to **CRM-centric platforma**, kde Contact existuje napříč marketing + sales + service + commerce flow. Email je jen jedna z výstupních možností. Roles a permissions jsou výrazně sofistikovanější.

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Seat types vs. Permission Sets (Roles)](#2-seats-vs-roles)
3. [Super Admin flow](#3-super-admin-flow)
4. [Admin flow (non-Super)](#4-admin-flow)
5. [Marketing user flow](#5-marketing-user-flow)
6. [Sales user flow](#6-sales-user-flow)
7. [Service user flow](#7-service-user-flow)
8. [View-Only user flow](#8-view-only-flow)
9. [Partner / Agency flow](#9-partner-flow)
10. [Developer flow](#10-developer-flow)
11. [Contact / Lead flow](#11-contact-lead-flow)
12. [Email lifecycle](#12-email-lifecycle)
13. [Workflow execution model](#13-workflow-execution)
14. [Lifecycle Stage progression](#14-lifecycle-progression)
15. [Lead handoff Marketing → Sales](#15-lead-handoff)
16. [Service flow (ticket)](#16-service-flow)
17. [E-commerce flow](#17-e-commerce-flow)
18. [Integration & data sync flow](#18-integration-flow)
19. [Compliance flow (GDPR)](#19-compliance-flow)
20. [Datová mapa: co vidí kdo](#20-datová-mapa)
21. [Známé úzkoprofilové místa](#21-úzkoprofilové-místa)

---

## 1. Mapa aktérů

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│         HUBSPOT CUSTOMER PLATFORM ECOSYSTEM                        │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [HubSpot Staff (Internal Support)]                                │
│   ├─ Customer Success Manager                                      │
│   ├─ Technical Support                                             │
│   └─ Trust & Safety (security flags)                               │
│           │ (limited debug access)                                 │
│           ▼                                                        │
│   ┌──────────────────────────────────────┐                         │
│   │   ACCOUNT / PORTAL (top-level)       │                         │
│   │                                      │                         │
│   │   Super Admin(s)                     │◄── neomezený přístup    │
│   │   ├─ Admin (custom permissions)      │                         │
│   │   │  ├─ Add/edit users perm          │                         │
│   │   │  ├─ Modify billing perm          │                         │
│   │   │  ├─ Marketing access perm        │                         │
│   │   │  ├─ Sales access perm            │                         │
│   │   │  └─ Service access perm          │                         │
│   │   │                                  │                         │
│   │   ├─ Marketing User (Core seat)      │                         │
│   │   ├─ Sales User (Sales seat)         │                         │
│   │   ├─ Service User (Service seat)     │                         │
│   │   ├─ Commerce User (Commerce seat)   │                         │
│   │   ├─ Partner Admin / Partner Seat    │                         │
│   │   ├─ Developer (Developer seat)      │                         │
│   │   └─ View-Only User (free seat)      │                         │
│   │                                      │                         │
│   │   + Teams (hierarchical grouping)    │                         │
│   │   + Permission Sets (custom roles)   │                         │
│   └──────────────┬───────────────────────┘                         │
│                  │                                                 │
│                  ▼                                                 │
│   [Contacts / Companies / Deals / Leads / Tickets]                 │
│       │                                                            │
│       ├─→ marketing emails, ads, social, content                   │
│       ├─→ sales sequences, calls, meetings, quotes                 │
│       ├─→ service tickets, chat, knowledge base                    │
│       └─→ commerce payments, invoices                              │
│                  │                                                 │
│                  ▼                                                 │
│   [ISPs, Browsers, Apps, Integrations]                             │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér                         | Vstupní bod                  | Co dělá                                      | Co vidí                        |
| ----------------------------- | ---------------------------- | -------------------------------------------- | ------------------------------ |
| **Super Admin**               | Account creation / promotion | Vše bez omezení (krom hub features bez seat) | Vše                            |
| **Admin (with permissions)**  | Pozvánka od Super Admin      | Vše co Super Admin nastaví v permissions     | Per permissions                |
| **Marketing User**            | Pozvánka, Core seat          | Email, forms, landing pages, workflows       | Marketing tools + CRM          |
| **Sales User**                | Pozvánka, Core+Sales seat    | Sequences, deals, prospecting                | Sales tools + CRM              |
| **Service User**              | Pozvánka, Core+Service seat  | Inbox, tickets, KB                           | Service tools + CRM            |
| **Commerce User**             | Pozvánka, Core+Commerce seat | Quotes, invoices, payments                   | Commerce + CRM                 |
| **View-Only User**            | Pozvánka, free seat          | Read dashboards, reports                     | Reports + content              |
| **Partner Admin**             | Solutions Partner program    | Manage klientského účtu                      | Per partner access             |
| **Developer**                 | Developer seat               | Custom apps, dev sandbox                     | Dev tools                      |
| **Contact / Lead**            | Form, import, integration    | Otevírá emaily, klikne, browses, nakupuje    | Své emaily + preference center |
| **API klient**                | Private App / OAuth          | Cokoliv povolí scopes                        | Per scope                      |
| **Integrace** (Shopify, etc.) | OAuth                        | Sync data oboustranně                        | Per OAuth scope                |
| **HubSpot Staff**             | Interní                      | Debug/support s consentem                    | Limited                        |

---

## 2. Seats vs. Roles

Klíčové: v HubSpotu je **dvouvrstevný access control**.

### 2.1 Seat = co můžeš dělat funkčně

Seat určuje **jaké tooly můžeš použít** – ne datovou granularitu.

```
User
 │
 ├── Seat assigned (1+ z následujících):
 │   ├── View-Only (free) ── jen čtení
 │   ├── Core ── editace marketing/content/operations/starter
 │   ├── Sales ── + sequences, playbooks, prospecting (Pro+)
 │   ├── Service ── + advanced service tools (Pro+)
 │   ├── Commerce ── + advanced commerce (Pro+)
 │   ├── Partner ── solutions partner access
 │   └── Developer ── dev tools (nelze kombinovat)
 │
 └── Permissions / Permission Set (Role)
     ├── CRM object permissions (Contacts, Companies, Deals, etc.)
     │   ├── View: All / Team / Owned / None
     │   ├── Edit: All / Team / Owned / None
     │   └── Delete: All / Team / Owned / None
     │
     ├── Tool permissions (Marketing, Sales, Service)
     │   └── Per tool: View, Create, Edit, Publish, Delete
     │
     ├── Reports permissions
     │   └── View, Edit dashboards/reports
     │
     ├── Account access permissions
     │   ├── Add and edit users
     │   ├── Add and edit teams
     │   ├── Modify billing
     │   ├── Edit account defaults
     │   └── Super Admin (override everything)
     │
     ├── Data Privacy permissions
     │   └── Delete contacts (GDPR)
     │
     ├── AI permissions
     │   └── Per-Breeze-Agent access
     │
     └── Property-level permissions (Enterprise)
         └── Restrict edit on specific properties
```

### 2.2 Pravidlo: Seat + Permission = Final access

Příklad konfliktu:

- **Super Admin s jen Core seatem** → nemůže používat Sales Hub Pro features (např. sequences), i když by je Super Admin permission dovolovala. Protože **seat to neumožňuje**.
- **Core user s Edit-All-Contacts permission** → vidí a edituje všechny contacty, ale **nemůže používat Sequences** (vyžaduje Sales seat).

### 2.3 Permission Sets (Roles) – Enterprise

- Vytvořit až **100 permission sets**
- Klonovat existující
- Compare sets navzájem
- Assign na multiple users at once
- Override individual permissions
- Pozdě 2025 přejmenováno na **Roles** (RBAC alignment)

**Typické role v praxi:**

- Marketing Manager
- Marketing Specialist
- Marketing Designer
- SDR (Sales Development Rep)
- AE (Account Executive)
- Sales Manager
- Customer Success
- Support Agent
- Tier-2 Support
- RevOps Analyst
- CRM Admin
- Finance / Billing

### 2.4 Teams

Teams = **hierarchické seskupení uživatelů**.

- Lze multi-level (parent team, child teams)
- Per-team CRM data scoping (Owned by Team)
- Per-team content access (Enterprise – partitioning)
- Reporting groupování

Příklad:

```
EMEA Team
├── EMEA Marketing
├── EMEA Sales
│   ├── EMEA Sales DACH
│   ├── EMEA Sales France
│   └── EMEA Sales UK
└── EMEA Customer Success

NA Team
├── NA Marketing
└── NA Sales
```

### 2.5 Permission updates – časování

- Permissions update může trvat **až 5 minut** napříč HubSpot systémy
- User **musí log out a log in** pro accept changes
- Mobile app – někdy nutno close & reopen

---

## 3. Super Admin flow

Super Admin = top-level permissionable role, **bez které účet nemůže fungovat**. Vždy minimálně 1 Super Admin.

### 3.1 Onboarding (první přihlášení, account creation)

```
1. Sign-up na hubspot.com → automaticky Super Admin
   ↓
2. Setup wizard:
   - Company size
   - Industry
   - Goals
   ↓
3. Account language, currency, timezone
   ↓
4. Import contacts / connect existing CRM
   ↓
5. Connect email account (Gmail/Outlook)
   ↓
6. Domain authentication (DKIM, DMARC, MX optional)
   ↓
7. Install tracking code on website
   ↓
8. Invite team members (assign seats + permissions)
   ↓
9. Configure pipelines (deal, ticket stages)
   ↓
10. Set up lifecycle stages
   ↓
11. (Pro+) Build first workflow
   ↓
12. (Pro+) Setup lead scoring
```

### 3.2 Kritické Super Admin akce

#### Promote / Demote Super Admin

```
Settings → Users & Teams → hover user → Actions → Make Super Admin
   ↓
2FA confirmation (často)
   ↓
User notification email
```

#### Manage billing

```
Settings → Account & Billing
   ↓
Plan management (upgrade/downgrade)
Add additional seats
Add marketing contacts add-ons
Manage payment methods
Download invoices
```

#### Delete account

```
Settings → Account → Close account
   ↓
HubSpot vyžaduje cancelační proces (často s phone call)
   ↓
Data retention period
   ↓
GDPR delete
```

#### Permission Set management (Enterprise)

```
Settings → Users & Teams → Permission Sets tab
   ↓
Create permission set
   ↓
Configure permissions napříč:
- CRM objects (Contacts, Companies, Deals, etc.)
- Marketing tools
- Sales tools
- Service tools
- Reports
- Account access
- Privacy
- AI
   ↓
Save → Assign users
```

### 3.3 Daily Super Admin checklist

```
Login → Notifications check
   ↓
Account Health:
- Deliverability score (per audience)
- Failed integrations
- Workflow errors
- API usage near limit
- License utilization
   ↓
Security audit:
- New users this week
- Permission changes
- API key creations
- Failed login attempts
   ↓
Strategic:
- Pipeline health
- Marketing campaign performance
- Lifecycle conversion rates
```

---

## 4. Admin flow (non-Super)

Admin = user s elevated permissions ale ne Super Admin. Často:

- Modify billing ❌ (pokud Super Admin neudělil)
- Add and edit users ✅
- Add and edit teams ✅
- All CRM access ✅
- All tool access ✅

### 4.1 User invitation flow

```
Admin: Settings → Users & Teams → Create user
   ↓
Email + (optional Teams)
   ↓
Volba způsobu setup permissions:
- Don't narrow access (default per seat)
- Start with a template (Marketing Manager, Sales Rep, etc.)
- Copy from another user
- Start from scratch
- Apply Permission Set (Enterprise)
   ↓
Assign Seat (Core, Sales, Service, Commerce, View-Only)
   ↓
Configure specific permissions (per CRM object, per tool)
   ↓
Send Invite
   ↓
Invitee receives email → clicks Accept → sets up password / SSO
   ↓
Active user
```

### 4.2 Co Admin nemůže (pokud Super Admin neudělí)

- Make another user Super Admin
- Modify billing
- Close account
- Delete custom objects (Enterprise)
- Access certain Communications index page

---

## 5. Marketing user flow

Marketing user typicky má **Core seat + Marketing-focused permissions**.

### 5.1 Daily workflow

```
Login → Dashboard (Marketing Analytics)
   ↓
Quick check:
- Recent email performance
- Active campaign metrics
- Form submissions (last 24h)
- New marketing contacts
- Workflow enrollment trends
   ↓
Tasks:
- Draft new email campaign
- Update active lists
- A/B test analysis
- Lead nurture review
- Content calendar
```

### 5.2 Vytvoření Marketing Email

```
Marketing → Email → Create email
   ↓
Volba typu: Regular / Automated (Pro+) / Blog/RSS
   ↓
Template selection (template gallery)
   ↓
1. Email editor:
   - Drag-drop content
   - Insert personalization tokens
   - Apply brand kit
   - Add smart content (Pro+)
   ↓
2. Settings tab:
   - From name + email (z verified sender)
   - Reply-to
   - Subject + preview text (AI suggestion možná)
   - Subscription type
   - Internal campaign tag
   ↓
3. Send or Schedule tab:
   - Recipients: active list / static list / individual contacts
   - Exclude lists (suppression)
   - Send time:
     • Send now
     • Schedule specific date/time
     • Send time optimization (Pro+, AI)
     • Time zone send (Pro+)
   ↓
4. Preview & Test:
   - Preview as specific contact
   - Preview dark mode / plain text
   - Email client preview
   - Send test email to self
   ↓
5. Review checklist (HubSpot auto-checks):
   - Subject line OK?
   - Recipients defined?
   - From info OK?
   - Test sent?
   - Subscription type set?
   - Any errors?
   ↓
6. Send / Schedule
```

### 5.3 Vytvoření Workflow (Pro+)

```
Automation → Workflows → Create workflow
   ↓
Volba: From scratch / With AI (Breeze) / From template
   ↓
A) From scratch:
   1. Object type: Contact / Company / Deal / Ticket / etc.
   2. Enrollment trigger type:
      - When an event occurs
      - When filter criteria is met
      - Based on a schedule
      - Webhook (Data Hub Pro+)
      - Manual only
   3. Configure trigger details
   4. Add filters (až 250)
   5. Configure re-enrollment (opt-in)
   6. Configure suppression lists (opt-in)
   7. Configure unenrollment triggers (opt-in)
   8. Build workflow body:
      - Add actions
      - Add branches (if/then, value, random)
      - Add delays
      - Add goal step
   9. Workflow settings:
      - Run actions at specific times only
      - Pause dates (e.g. holidays)
      - Auto-turn-off date
      - Connections (unenroll from other workflows)
      - Performance notifications (Enterprise, Breeze)
   10. Test:
       - Test workflow with specific contact
       - Review enrollment criteria preview
   11. Turn on workflow
   ↓
B) With AI (Breeze):
   - Type prompt: "When [event], then [action]"
   - Breeze generates triggers + actions
   - User reviews and finalizes
   ↓
C) From template:
   - Browse template library
   - Preview template details
   - Use template → fill placeholder actions
   - Review and turn on
```

### 5.4 Marketing Campaign management

HubSpot **Campaigns** = cross-channel umbrella pro emails, ads, social, blog, landing pages.

```
Marketing → Campaigns → Create campaign
   ↓
Campaign details:
- Name, owner, color
- Goal (revenue, contacts, sessions, etc.)
- Audience
- Budget
- Spend tracking
   ↓
Associate assets:
- Marketing emails
- Forms
- CTAs
- Landing pages
- Blog posts
- Social posts
- Ads (Google, Meta, LinkedIn)
- Workflows
   ↓
Track:
- Sessions
- Submissions
- New contacts
- New deals
- Revenue (with attribution)
- ROI
```

---

## 6. Sales user flow

Sales user = Core seat + Sales seat (Pro+). Pracuje primárně v **Sales Workspace**.

### 6.1 Daily Sales workflow

```
Login → Sales Workspace
   ↓
Sections:
- Tasks (assigned, due today)
- Leads queue (new, in progress)
- Deal forecast
- Meeting calendar
- Sequence performance
   ↓
Activities:
- Email tracked sends (via Gmail/Outlook integration)
- Log calls
- Schedule meetings (Meetings tool)
- Add prospects to sequences
- Update deal stages
- Create quotes
```

### 6.2 Sequences flow

```
Sales → Sequences → Create / Use existing
   ↓
Build sequence:
- 5–10 steps (emails, tasks, LinkedIn touches)
- Delays between steps
- Personalization tokens
   ↓
Enroll prospects:
- From contact list
- From deal record
- From individual contact
- Bulk enroll (up to 50/day per rep)
   ↓
Sequence runs:
- Sends emails z osobní inbox (Gmail/Outlook integration)
- Creates tasks
- Tracks opens, clicks, replies
   ↓
Auto-unenroll:
- Contact replies (any way) → stop
- Contact books meeting → stop
- Manual unenroll
   ↓
Reporting:
- Per-step performance
- Per-rep performance
- Conversion to meetings/deals
```

### 6.3 Deal management

```
Deal record:
- Pipeline + stage
- Amount, close date
- Probability
- Associated contacts, company
- Line items (products)
- Activities timeline
- Quotes
- Meetings, calls, notes
   ↓
Stage transitions:
- Manual update
- Workflow auto-update
- Deal stage automation (e.g. task creation per stage)
   ↓
Closed-won:
- Triggers post-purchase workflow
- Updates lifecycle stage of contacts → Customer
- (Commerce Hub) generates invoice
```

---

## 7. Service user flow

Service user = Core + Service seat. Pracuje v **Help Desk**.

### 7.1 Ticket flow

```
Customer sends email / chat / form
   ↓
HubSpot auto-creates ticket
- Associated with contact
- Status: New
- Pipeline + stage
- Priority (manual or AI-determined)
   ↓
Assignment:
- Round-robin
- Skill-based routing
- Team-based
   ↓
Agent works:
- Replies in unified inbox
- Internal notes
- Knowledge base linking
- Add to playbook
- Status transitions
   ↓
Resolution:
- Status: Closed
- CSAT survey auto-sent
- Workflow triggers follow-up
```

### 7.2 Knowledge Base

```
Service → Knowledge Base → Create article
   ↓
- Rich text editor
- Categories, tags
- Multi-language (Pro+)
- AI-generated articles (Breeze Knowledge Base Agent)
- Public or member-only
   ↓
Publish → Customer Portal / KB site
```

---

## 8. View-Only user flow

Free seat, unlimited number. Pro stakeholdery, external auditory, executive overview.

### 8.1 Capabilities

- View dashboards & reports
- Browse contacts, companies, deals (per CRM permissions)
- View published content (emails, pages, blogs)
- Export reports (per permissions)
- Cannot: create, edit, publish, delete anything

### 8.2 Use cases

- **C-level executive** – chce vidět revenue dashboards, ne pracovat v CRM
- **Finance** – kontrola revenue tracking
- **External auditor**
- **Investor / board member**
- **Stakeholder** v sister company

---

## 9. Partner / Agency flow

Solutions Partners HubSpotu = oficiální agentury.

### 9.1 Partner Seat

- **Zdarma** pro eligible Solutions Partners
- Plný přístup ke client account (jako Super Admin)
- Lze **Partner Admin** permission template
- Solutions Partners mají vlastní HubSpot Partner Portal

### 9.2 Multi-client management

```
Agentura má vlastní HubSpot Partner Account
   ↓
Klient pozve agency user jako Partner Seat
   ↓
Agency user vidí v UI „Account Switcher" – multi-account switching
   ↓
Pro každý klient může mít custom Partner Admin permission set
   ↓
Reporting cross-client v Partner Portal
```

### 9.3 Onboarding nový klient (typický agency flow)

```
Klient si zakládá HubSpot account
   ↓
Klient pozve agency jako Super Admin / Partner
   ↓
Agency:
- Audit existující setup
- Domain authentication
- Tracking code installation
- Property cleanup
- Lifecycle stage configuration
- Lead scoring setup
- Welcome workflow build
- Form & landing page creation
- Reporting setup
   ↓
Handoff:
- Documentation
- Training pro klient team
- Ongoing management retainer
```

---

## 10. Developer flow

Developer Seat = pro app builders.

### 10.1 Capabilities

- Access HubSpot Developer Portal
- Create test accounts (sandboxes)
- Build private apps (per-portal integrations)
- Build public apps (App Marketplace)
- API access s scopes
- Webhook management
- Custom workflow actions (Operations Hub)

### 10.2 Limitations

- Cannot combine s ostatními seats
- No Super Admin permission s Developer seat
- Pro production use → Super Admin grants "Developer tools access" separately

### 10.3 Custom App build flow

```
HubSpot Developer Account
   ↓
Create app
- App name, description
- OAuth scopes
- Webhook subscriptions
- Redirect URLs
   ↓
Implement OAuth flow / Private App API key
   ↓
Test v sandbox account
   ↓
(For Public app) Submit to App Marketplace
   ↓
Review by HubSpot team
   ↓
Listed publicly
```

---

## 11. Contact / Lead flow

Tohle je nejdůležitější sekce z marketing pohledu. Contact lifecycle v HubSpotu.

### 11.1 Acquisition

```
[Anonymous visitor]
   ↓
Browses website
   ↓
HubSpot tracking script (hs-script-loader.js) drops cookie
   ↓
Tracks: pages visited, referrer, UTMs, device
   ↓
[Anonymous activity recorded under cookie ID]
   ↓
Visitor:
- Fills form / Subscribes
- Books meeting
- Opens chat with bot
- Downloads content
   ↓
Contact record created in CRM
   ↓
Cookie ID linked to Contact
   ↓
[Anonymous history retroactively assigned to Contact]
```

### 11.2 Marketing Contact status assignment

```
Contact created
   ↓
Marketing Contact?
   ├── Yes (if from marketing source / explicit toggle / workflow)
   │   → Counts toward marketing tier
   │   → Can receive marketing emails
   │
   └── No (default for sales-imported contacts, sync contacts)
       → Free in CRM
       → Cannot receive marketing emails
       → Can still receive 1-to-1 sales emails
```

### 11.3 Subscription assignment

```
Form submission z page X
   ↓
HubSpot ptá: "Do you opt in to receive Newsletter?"
   ↓
Subscriber chooses: Newsletter (yes), Promotional (no), Product Updates (yes)
   ↓
3 separate subscription records, 2 active
   ↓
Marketing emaily se posílají jen, pokud Contact je subscribed na specific subscription type
```

### 11.4 Engagement & Lifecycle progression

```
[Subscriber stage]
   ↓ – browses, opens emails
[Lead stage] (manual or workflow)
   ↓ – fills high-intent form, visits pricing
[MQL stage] (lead score threshold, or workflow)
   ↓ – sales kvalifikace, demo booked
[SQL stage] (sales accept)
   ↓ – sub-status Lead Status: New → Open → In Progress
   ↓ – associated Deal created
[Opportunity stage] (deal association)
   ↓ – deal stages: discovery → proposal → negotiation
[Customer stage] (deal closed-won)
   ↓ – post-purchase workflow
[Evangelist] (manual / NPS-based)
```

### 11.5 Email engagement flow (subscriber's perspective)

```
Subscriber dostane email
   ↓
Tracking pixel (HubSpot CDN) → Open recorded
   ↓
Subscriber clicks link
   ↓
HubSpot redirect: track.hubspot.com/click/... → real URL
   ↓
Click recorded; UTM auto-appended
   ↓
Subscriber lands on website
   ↓
Tracking script links session to Contact
   ↓
Page views, scrolls, clicks tracked
   ↓
If converts on form / chat → conversion attributed
   ↓
If purchases (with commerce/ecommerce integration) → revenue attributed
```

### 11.6 Preference Center

```
Email footer: "Manage preferences" / "Unsubscribe"
   ↓
HubSpot-hosted Preference Center (URL with token)
   ↓
Contact vidí:
- Své subscription types (zaškrtnuté = active)
- Frequency preferences
- Pause emails option (e.g. "Pause for 30 days")
- "Unsubscribe from all"
   ↓
Updates → reflect immediately
   ↓
Workflow trigger fires (Subscription change event)
```

### 11.7 Unsubscribe

```
Contact clicks Unsubscribe v email footer
   ↓
HubSpot Preference Center → "We've unsubscribed you from [Subscription Type]"
   ↓
Subscription status: subscribed → unsubscribed
   ↓
Contact stále v CRM (different than Mailchimp)
   ↓
Pro this subscription type už nedostane emails
   ↓
Contact je ALE stále Marketing Contact (počítá do limitu, dokud not toggled off)
```

> **Důležité:** HubSpot nemá „delete unsubscribed contacts" funkci jako Mailchimp Archive. Pokud chceš ušetřit, musíš toggle **Marketing Contact status na No** manuálně nebo přes workflow.

### 11.8 Spam complaint

```
Contact označí email jako spam v Gmailu
   ↓
Gmail FBL → HubSpot
   ↓
HubSpot:
- Marks contact as "Marked as spam"
- Auto-unsubscribes from all subscription types
- Excludes from future sends
- Decrements deliverability score
```

### 11.9 Hard bounce

```
ISP returns 5xx (mailbox doesn't exist)
   ↓
HubSpot marks email status: Bounced
   ↓
Contact excluded from future marketing sends
   ↓
Contact stays in CRM (sales může stále kontaktovat)
```

---

## 12. Email lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  1. MARKETING USER: drafts email                                │
│     - Choose recipients (list, segment)                         │
│     - Choose subscription type (HubSpot specific)               │
│     - Configure send time                                       │
│                            │                                    │
│                            ▼                                    │
│  2. REVIEW CHECKLIST (HubSpot auto-checks):                     │
│     - All required fields                                       │
│     - Subscription compliance                                   │
│     - Domain authentication status                              │
│     - Send time appropriateness                                 │
│                            │                                    │
│                            ▼                                    │
│  3. SEND OR SCHEDULE                                            │
│                            │                                    │
│                            ▼                                    │
│  4. HUBSPOT QUEUE: filter recipients                            │
│     - Subscribed to this subscription type? ✓                   │
│     - Not bounced? ✓                                            │
│     - Not unsubscribed? ✓                                       │
│     - Not on suppression list? ✓                                │
│     - Frequency cap not exceeded? (Enterprise) ✓                │
│     - Marketing contact status active? ✓                        │
│                            │                                    │
│                            ▼                                    │
│  5. PER-RECIPIENT EMAIL GENERATION                              │
│     - Personalization tokens resolved                           │
│     - Smart content evaluated (Pro+)                            │
│     - Dynamic content from CRM                                  │
│                            │                                    │
│                            ▼                                    │
│  6. SMTP SEND from HubSpot infrastructure                       │
│     - From: configured sender                                   │
│     - DKIM signed (s vaším domain key)                          │
│     - SPF: HubSpot's mailfrom (alignment fails ale OK)          │
│     - List-Unsubscribe RFC 8058 header                          │
│     - Tracking pixel embedded                                   │
│     - Click trackers wrapped                                    │
│                            │                                    │
│                            ▼                                    │
│  7. ISP RECEIVES (Gmail/Outlook/Yahoo):                         │
│     - SPF check (often fails – OK)                              │
│     - DKIM verify (PASS)                                        │
│     - DMARC alignment (PASS via DKIM)                           │
│     - Reputation check                                          │
│     - Content filters                                           │
│     - Engagement history per recipient                          │
│                            │                                    │
│                            ▼                                    │
│  8. ROUTING:                                                    │
│     - Inbox / Primary                                           │
│     - Promotions / Updates                                      │
│     - Spam                                                      │
│     - Rejected                                                  │
│                            │                                    │
│                            ▼                                    │
│  9. RECIPIENT INTERACTION:                                      │
│     - Open → pixel load → tracked                               │
│     - Click → HubSpot proxy → tracked + redirect                │
│     - Reply → if connected inbox, logs to CRM                   │
│     - Forward → tracked                                         │
│                            │                                    │
│                            ▼                                    │
│ 10. CRM UPDATE:                                                 │
│     - Contact activity timeline updated                         │
│     - Email engagement properties:                              │
│       • Last email open                                         │
│       • Last email click                                        │
│       • Number of email opens (sum)                             │
│     - Subscriber rating recalculated                            │
│                            │                                    │
│                            ▼                                    │
│ 11. WORKFLOW TRIGGERS:                                          │
│     - "Opened email" event triggers                             │
│     - "Clicked link" event triggers                             │
│     - Lead scoring updates                                      │
│                            │                                    │
│                            ▼                                    │
│ 12. ATTRIBUTION:                                                │
│     - Email → page visit → form fill → deal                     │
│     - Multi-touch attribution (Enterprise)                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 13. Workflow execution

### 13.1 Activation

```
Workflow Draft → User clicks "Review & Publish"
   ↓
HubSpot validation:
- All required fields filled
- No circular references (workflow → enroll in itself)
- All used actions are licensed
- No orphan branches
   ↓
Confirmation modal:
- "Existing records that meet criteria will/won't enroll"
- Re-enrollment behavior
- Final review
   ↓
Activate
   ↓
[Status: Active]
   ↓
Enrollment evaluator runs (per trigger type)
```

### 13.2 Per-record execution

```
Record meets enrollment trigger
   ↓
Filters evaluated (sequentially, AND/OR groups)
   ↓
Suppression lists check
   ↓
If passes → ENROLLED
   ↓
Start at step 1
   ↓
For each step:
   - Delay → record waits in queue
   - Branch → conditions evaluated, path chosen
   - Action → executed (send email, update property, create task, etc.)
   - Goal step → if criteria met, exit workflow
   - End workflow → exit
   ↓
Unenrollment triggers checked continuously:
   - If record meets unenrollment criteria → exit
   - If record is deleted → exit
   - If contact unsubscribes → continue but may skip email actions
```

### 13.3 Re-enrollment

```
Record completes workflow
   ↓
If re-enrollment enabled:
   - Check selected re-enrollment trigger conditions
   - If property changes (any selected trigger condition) → re-enroll
   - If record was deleted then restored → does NOT re-enroll automatically
```

### 13.4 Pause dates

```
Workflow → Settings → Pause Dates
   ↓
Add date range (e.g. December 24–26)
   ↓
Actions scheduled within pause date → defer to next available day
   ↓
Records in delays/branches continue (they're in waiting state)
   ↓
On pause date, no email sends, no actions execute
```

### 13.5 AI Audit Cards (2026)

```
Workflow contains AI action (e.g. Breeze classify, generate)
   ↓
Action executes per record
   ↓
HubSpot saves Audit Card:
- Input data
- AI decision/output
- Confidence score
- Model version
   ↓
Available in workflow history per record
   ↓
Used for: debugging, compliance, retroactive analysis
```

---

## 14. Lifecycle Stage progression

Klíčové pro celý B2B sales flow.

### 14.1 Subscriber → Lead

```
Trigger: Form submission (any marketing form)
   ↓
Workflow:
   - If Lifecycle stage = unknown OR Subscriber:
       Set Lifecycle stage = Lead
   - Else: do nothing (don't move backwards)
   ↓
Notification to marketing
```

### 14.2 Lead → MQL

```
Method A: Manual rule-based
   - Lead score reaches threshold (e.g. 50)
   - Workflow trigger: Lead score >= 50
   - Action: Set Lifecycle stage = MQL

Method B: Active list (recommended)
   - Active list: MQL Criteria (score >= 50 + behavior signals)
   - Workflow trigger: Joins active list "MQL Criteria"
   - Action: Set Lifecycle stage = MQL
```

### 14.3 MQL → SQL (handoff to sales)

```
SDR/AE reviews MQL queue
   ↓
Qualification call / research
   ↓
Decision:
   - SQL → workflow action OR manual update
   - Disqualify → return to Lead or Other stage
   ↓
If SQL:
   - Lifecycle stage = SQL
   - Lead Status set (New)
   - Create Lead record (Sales Workspace)
   - Assign owner (round-robin or rule)
   - Trigger sales sequence
```

### 14.4 SQL → Opportunity

```
SDR/AE creates Deal record associated with Contact
   ↓
Workflow trigger: Deal created associated with Contact
   ↓
Action: Set Contact Lifecycle stage = Opportunity
```

### 14.5 Opportunity → Customer

```
Deal stage changes to "Closed Won"
   ↓
Workflow trigger: Deal stage = Closed Won
   ↓
Actions:
- Set Contact Lifecycle stage = Customer
- Set Company Lifecycle stage = Customer
- Trigger onboarding workflow
- (Commerce) generate invoice
- Notify CS team
- Subscribe to "Customer Communications" subscription type
```

### 14.6 Customer → Evangelist

```
NPS Survey response = 9 or 10
   ↓
Workflow trigger: NPS = 9-10
   ↓
Set Lifecycle stage = Evangelist
   ↓
Trigger referral program workflow
```

---

## 15. Lead handoff Marketing → Sales

Tradicionálně nejcitlivější přechod. HubSpot ho řeší přes:

### 15.1 Triggering events

- Lead score reaches threshold
- Form submission on bottom-of-funnel page
- Meeting booked
- Demo request
- Manual marketer assignment

### 15.2 Workflow handoff

```
Marketing workflow triggers SQL transition
   ↓
Actions:
1. Set Lifecycle stage = SQL
2. Set Lead Status = New
3. Create Lead record (Sales Workspace)
4. Lead routing (rotate to SDR / assign by rule)
5. Send Slack notification: "New SQL: John Doe at Acme Corp"
6. Create task: "Reach out within 24 hours"
7. Set first task due date
8. Optionally: enroll in sales sequence
```

### 15.3 Sales rep workflow

```
Sales rep gets:
- Slack notification
- Task in HubSpot
- Lead appears in Sales Workspace queue
   ↓
Reviews lead:
- Activity timeline
- Lead score breakdown
- Recent web pages visited
- Forms submitted
- Email engagement
   ↓
Action:
- Accept lead (update Lead Status: Open)
- OR disqualify → back to Marketing
   ↓
If accepted:
- Sequence enrollment
- Cold call
- LinkedIn touch
- Email
   ↓
If response:
- Update Lead Status: In Progress
- Schedule meeting
- Create Deal
```

---

## 16. Service flow (ticket)

```
Customer issue:
- Email to support@company.com
- Chat widget on website
- Form submission
- Phone call (with integration)
- Social media (with monitoring)
   ↓
Auto-create Ticket
- Associate with Contact (or create new)
- Set Status: New
- Default Pipeline + Stage
- AI-assisted priority (Breeze, optional)
- Assignment: round-robin or skill-based
   ↓
Agent picks up:
- Reply in Unified Inbox
- Internal notes for team
- Knowledge base linking
- Playbook reference
   ↓
Resolution paths:
- Quick reply
- Escalation to Tier 2
- Bug created in linked Jira (integration)
- Refund processed (Commerce Hub)
- Knowledge base article created
   ↓
Status: Closed
   ↓
Automated:
- CSAT survey (after 1h)
- Workflow: if low CSAT, alert manager
- Workflow: if customer at risk, trigger save campaign
   ↓
Reporting: SLA compliance, CSAT, resolution time
```

---

## 17. E-commerce flow

### 17.1 Shopify integration flow

```
Admin: connect Shopify via App Marketplace
   ↓
OAuth authorize
   ↓
HubSpot creates Shopify Cart, Order, Product data model
   ↓
Initial sync:
- Customers → Contacts (with marketing_consent flag)
- Orders → Deals (with line items)
- Products → Product catalog
- Abandoned carts → Cart records
   ↓
Continuous sync (webhooks):
- New order → new Deal
- Order updated → Deal update
- Customer created → Contact created
- Cart abandoned → Cart record
- Product back in stock → trigger workflow
```

### 17.2 Abandoned cart workflow

```
Customer adds to cart on Shopify
   ↓
Cart event sent to HubSpot
   ↓
If checkout not completed in X hours:
   - Workflow trigger: Cart abandoned
   - Filter: Cart total > $50
   ↓
Action sequence:
- 1h delay: send cart reminder email
- 24h delay: send 10% discount code
- 48h delay: final reminder
- Goal: Purchase completed → exit
```

### 17.3 Post-purchase

```
Order placed
   ↓
Workflow: Order created
   ↓
- Send order confirmation
- Set Contact lifecycle = Customer
- Wait 7 days
- If product = X, send education email series
- Wait 30 days
- Send review request
- Wait 90 days
- Send replenishment reminder (if applicable)
```

---

## 18. Integration & data sync flow

### 18.1 HubSpot Data Sync (Operations Hub)

```
Connect external app (e.g. Salesforce, NetSuite, QuickBooks)
   ↓
OAuth authorize
   ↓
HubSpot Data Sync wizard:
- Choose object mapping
- Two-way or one-way sync
- Filter criteria (e.g. only sync deals > $1000)
- Field mapping (HubSpot field ↔ external field)
- Conflict resolution rules
   ↓
Initial sync runs
   ↓
Continuous sync:
- Real-time on each side
- Change detection
- Conflict resolution per rules
```

### 18.2 Webhook flow

```
External system → POST to HubSpot webhook endpoint
   ↓
HubSpot validates signature
   ↓
Webhook event:
- Workflow trigger (Data Hub Pro+)
- Custom event (anywhere)
   ↓
Process per rules
```

### 18.3 Custom-coded action (Operations Hub Pro+)

```
Workflow step: Custom code action
   ↓
JS or Python code (HubSpot serverless function)
   ↓
Access:
- Enrolled record data
- Workflow context
- Secrets (encrypted)
- HubSpot API
- External APIs (via fetch)
   ↓
Execute → return outputs
   ↓
Outputs available in subsequent workflow steps
```

---

## 19. Compliance flow

### 19.1 GDPR consent

```
Form submission with GDPR fields
   ↓
HubSpot stores:
- Marketing consent (true/false, timestamp, IP)
- Legitimate interest (if applicable)
- Communication subscription consent per type
   ↓
Available in Contact properties:
- "I agree to the legal text" (consent timestamp)
- "Subscribed to: Newsletter"
- "Consent source"
```

### 19.2 Right to be Forgotten

```
Contact requests data deletion
   ↓
Admin: Contact record → Actions → Permanently delete
   OR via API: DELETE /crm/v3/objects/contacts/{id} with GDPR flag
   ↓
Confirmation modal
   ↓
HubSpot:
- Removes all contact data
- Adds email to permanent suppression
- Anonymizes related records (deal pointer, activity)
- Logs deletion event for audit
   ↓
Confirmation email to requestor (optional)
```

### 19.3 Data export

```
Contact requests data export
   ↓
Admin → Contact record → Actions → Download contact data
   ↓
HubSpot generates ZIP with:
- Profile properties
- Activity timeline
- Email history
- Form submissions
- Custom events
   ↓
Provides download link (time-limited)
```

### 19.4 Subscription management compliance

- Every marketing email has unsubscribe link (mandatory)
- One-click unsubscribe header (RFC 8058)
- Granular per-subscription-type unsubscribe
- "Unsubscribe from all" master toggle
- Resubscribe requires explicit action (single opt-in unless EU)

---

## 20. Datová mapa: co vidí kdo

| Data                        | Super Admin | Admin (full perm) | Marketing User | Sales User | Service User | View-Only |    Contact    |      API       |
| --------------------------- | :---------: | :---------------: | :------------: | :--------: | :----------: | :-------: | :-----------: | :------------: |
| Billing & subscription      |     ✅      |     per perm      |       ❌       |     ❌     |      ❌      |    ❌     |      ❌       |   per scope    |
| User management             |     ✅      |     per perm      |       ❌       |     ❌     |      ❌      |    ❌     |      ❌       |   per scope    |
| All contacts                |     ✅      |        ✅         |      ✅\*      |    ✅\*    |     ✅\*     |   ✅\*    |   jen sebe    |       ✅       |
| Team-only contacts          |     ✅      |        ✅         |    per perm    |  per perm  |   per perm   | per perm  |      ❌       |       –        |
| Owned contacts              |     ✅      |        ✅         |       ✅       |     ✅     |      ✅      |     –     |       –       |       –        |
| Marketing emails            |     ✅      |        ✅         |       ✅       |    view    |     view     |   view    | jen co dostal |       ✅       |
| Marketing email reports     |     ✅      |        ✅         |       ✅       |     ✅     |      ✅      |    ✅     |      ❌       |       ✅       |
| Sales sequences             |     ✅      |        ✅         |       ❌       |     ✅     |      ❌      |   view    |      ❌       | per seat scope |
| Deals                       |     ✅      |        ✅         |      view      |     ✅     |     view     |   view    |    jen své    |       ✅       |
| Service tickets             |     ✅      |        ✅         |      view      |    view    |      ✅      |   view    |    jen své    |       ✅       |
| Workflows                   |     ✅      |        ✅         |       ✅       |    ✅\*    |     ✅\*     |   view    |      ❌       |       ✅       |
| Custom reports              |     ✅      |        ✅         |       ✅       |     ✅     |      ✅      |   view    |      ❌       |       ✅       |
| Domain settings             |     ✅      |     per perm      |       ❌       |     ❌     |      ❌      |    ❌     |      ❌       |       ❌       |
| API keys / Private Apps     |     ✅      |     per perm      |    jen své     |  jen své   |   jen své    |    ❌     |      ❌       |       –        |
| Properties / Custom objects |     ✅      |     per perm      |      view      |    view    |     view     |   view    |    jen své    |       ✅       |
| GDPR delete                 |     ✅      |     per perm      |       ❌       |     ❌     |      ❌      |    ❌     |    request    |   per scope    |
| Audit log                   |     ✅      |     per perm      |       ❌       |     ❌     |      ❌      |    ❌     |      ❌       |       ❌       |

\* Per-scope (All/Team/Owned/None) configurable

---

## 21. Známé úzkoprofilové místa

### 21.1 Permission complexity

- **Seat + Permission Set + Team scope** je 3D matice. Onboardování nového usera často trvá hodiny, ne minuty.
- **Bulk edit jen pro stejný seat type** – nelze najednou updatovat permissions pro Sales + Marketing usera.
- **Permission changes can take 5 minutes** napříč systémy. Frustruje při debugging.
- **No granular property-level permissions** mimo Enterprise.

### 21.2 Seat licensing pitfalls

- **Super Admin still needs seat** pro hub features – často chyba u nových account ownerů.
- **Inactive users zachovávají seat** – kvartální audit potřeba.
- **Developer Seat nelze kombinovat** – frustrující při code review by Super Admin.
- **Removed user's API keys deactivate** – produkční integrace mohou padnout.

### 21.3 Workflow troubles

- **Event triggers nepokrývají existing records** – nutno separately run filter-based workflow nebo manual enroll.
- **Re-enrollment limitations** – ne všechny properties lze use pro re-enroll.
- **Workflow action log jen 90 dní** – pro audit kratších cyklů.
- **Custom-coded actions vyžadují Operations Hub Pro+** – často $800/měsíc add-on.

### 21.4 Marketing Contact gotchas

- **Imported contacts default mark as marketing** – snadno přeskočit limit.
- **Subscription unsubscribe ≠ Marketing Contact off** – stále se počítá!
- **Workflow potřeba pro automatic non-marketing toggle** – není default.

### 21.5 Integration friction

- **Salesforce two-way sync** vyžaduje Marketing Pro+ (silně pushováno HubSpotem).
- **Native integration ≠ data sync** – některé jsou jednostranné.
- **API rate limits** mohou hatit heavy users (Enterprise zvyšuje).

### 21.6 Email-specific

- **Frequency caps jen Enterprise** – malé tými trpí email fatigue.
- **Shared IP quality variabilní** – některé HubSpot IP bloky historicky na blacklistech.
- **Transactional email = separate add-on** (~$600/month na top).
- **Deliverability metrics nelze granular per-recipient** v stable reports.

### 21.7 UI/UX

- **No Czech/Slovak/Polish UI** – pro CEE marketers stále angličtina/němčina.
- **Navigation depth** – některé settings hluboce nested.
- **Mobile app limitations** – plný workflow editor neexistuje na mobile.

### 21.8 Compliance gaps

- **Audit log granularity** – ne vše je auditované per-field-change.
- **Team-level permissions** vyžadují Enterprise.
- **Data residency** – HubSpot primárně US-hosted (EU option dostupný od 2022 pro Enterprise s premium).

---

## 22. Doporučení pro design vlastních procesů

Pokud HubSpot používáte v týmu, doporučujeme:

1. **Permission Sets od prvního dne** (Enterprise) – ne ad-hoc per-user
2. **Team structure před onboarding** – nelze easily restructure
3. **Lifecycle stage SOP** – dokumentovat kdo updatuje co, kdy
4. **Lead routing rules** – round-robin vs. territory vs. skill
5. **Marketing Contact policy** – jak označovat, kdy odoznačit
6. **Naming conventions** – workflows, lists, properties (e.g. „MKT_2026_Q2_Newsletter")
7. **Quarterly cleanup**:
   - Inactive users → revoke seats
   - Inactive contacts → toggle non-marketing
   - Failed workflows → review and fix
   - Duplicate lists → consolidate
8. **Sandbox environment** (Enterprise) pro test before production
9. **Audit log review** monthly
10. **DR / backup plan** – HubSpot není zálohovací nástroj, exporty pravidelně
11. **Domain authentication** první den po sign-up
12. **API key rotation** policy pro produkční integrace (servisní účet, ne user-bound key)
13. **Subscription type taxonomy** – jasné kategorie, ne tucet duplikací
14. **Sales-Marketing SLA** – kdy MQL musí být v sales workspace, kdy sales musí accept

---

_Dokument zpracován z oficiálních zdrojů knowledge.hubspot.com a praktických příruček (RevPartners, INSIDEA, Hublead, Sidekick Strategies, Automation Strategists, ProcessPro Consulting, Onthefuze, Bardeen). Pro nejaktuálnější detaily vždy konzultovat HubSpot Knowledge Base._
