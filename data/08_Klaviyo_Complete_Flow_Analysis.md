# Klaviyo – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v Klaviyo prochází data, lidé a akce – od Account Ownera přes specializované uživatele a integrace až po koncového customer profile.

> Tento dokument doplňuje `07_Klaviyo_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** Klaviyo umí, tento popisuje, **kdo s tím interaguje a jak data tečou**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
> - **7 default rolí** (Owner, Admin, Manager, Analyst, Campaign Coordinator, Content Creator, Support) – víc než Mailchimp (5), méně diferenciace než HubSpot
> - **Custom User Roles** (2025+) s **permission sets** – lze build vlastní role
> - **SCIM provisioning** podporováno (Enterprise) – auto user lifecycle
> - **Active profile-based billing** mění úvahy o subscriber lifecycle (lazy unsubscribed = nepočítají; ale subscribed inactives = počítají)
> - **Event-driven data model** – flows triggered eventy, ne audience-membership
> - **E-commerce-centric flow** – assumption Shopify/WooCommerce všude

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Static User Roles (7 default)](#2-static-roles)
3. [Custom User Roles & Permission Sets](#3-custom-roles)
4. [Owner flow](#4-owner-flow)
5. [Admin flow](#5-admin-flow)
6. [Manager flow](#6-manager-flow)
7. [Analyst flow](#7-analyst-flow)
8. [Campaign Coordinator flow](#8-campaign-coordinator-flow)
9. [Content Creator flow](#9-content-creator-flow)
10. [Support flow](#10-support-flow)
11. [Profile lifecycle](#11-profile-lifecycle)
12. [Email lifecycle](#12-email-lifecycle)
13. [Flow execution model](#13-flow-execution)
14. [E-commerce data flow](#14-e-commerce-flow)
15. [Predictive analytics flow](#15-predictive-flow)
16. [API & Integration flow](#16-integration-flow)
17. [GDPR & Compliance flow](#17-gdpr-flow)
18. [Datová mapa: co vidí kdo](#18-datová-mapa)
19. [Známé úzkoprofilové místa](#19-úzkoprofilové-místa)

---

## 1. Mapa aktérů

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│         KLAVIYO B2C CRM ECOSYSTEM                                  │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [Klaviyo Staff (Internal Support)]                                │
│   ├─ Customer Success Manager (CSM, jen Klaviyo One)               │
│   ├─ Technical Support 24/7                                        │
│   ├─ Deliverability team (Enterprise)                              │
│   └─ Trust & Safety                                                │
│           │ (limited debug access with consent)                    │
│           ▼                                                        │
│                                                                    │
│   ┌──────────────────────────────────────────┐                     │
│   │   Klaviyo Account                        │                     │
│   │                                          │                     │
│   │   Static Roles (default):                │                     │
│   │   ├─ Owner (1 osoba)                     │◄── full + close acc │
│   │   ├─ Admin (multiple)                    │◄── nearly full      │
│   │   ├─ Manager                             │◄── most features    │
│   │   ├─ Analyst                             │◄── view + analytics │
│   │   ├─ Campaign Coordinator                │◄── send campaigns   │
│   │   ├─ Content Creator                     │◄── design only      │
│   │   └─ Support                             │◄── Inbox + Profile  │
│   │                                          │                     │
│   │   + Custom User Roles (2025+)            │                     │
│   │     (built from Permission Sets)         │                     │
│   │                                          │                     │
│   │   + SCIM provisioning (Enterprise)       │                     │
│   │   + SSO/SAML (Enterprise)                │                     │
│   └──────────────┬───────────────────────────┘                     │
│                  │                                                 │
│                  ▼                                                 │
│   [Profiles / Customers]                                           │
│       │                                                            │
│       ├─→ marketing emails, SMS, WhatsApp, push                    │
│       ├─→ flows triggered by events                                │
│       ├─→ predictive analytics (CLV, churn, next order)            │
│       ├─→ behavioral tracking (web events, app events)             │
│       └─→ reviews requests                                         │
│                  │                                                 │
│                  ▼                                                 │
│   [E-commerce stores, ISPs, Apps, Integrations]                    │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér | Vstupní bod | Co dělá | Co vidí |
|---|---|---|---|
| **Owner** | Account creation | Vše + close account + transfer ownership | Vše |
| **Admin** | Pozvánka od Owner/Admin | Vše krom close account | Vše |
| **Manager** | Pozvánka | Core features + limited list/flow mgmt | Most |
| **Analyst** | Pozvánka | Reports + view-only | Read-only |
| **Campaign Coordinator** | Pozvánka | Create/send campaigns + edit templates | Campaigns + content |
| **Content Creator** | Pozvánka | Design templates only | Templates only |
| **Support** | Pozvánka | Inbox + Profile only | Customer service tools |
| **Custom Role User** | Per role definition | Per permission sets | Per role |
| **Profile / Customer** | Form, import, integration | Otevírá emaily, klikne, browses, nakupuje | Své emaily + preference center |
| **API Client** | Private API key | Per scope (Full / Read-only / Custom) | Per scope |
| **Integration** (Shopify) | OAuth/plugin | Sync data oboustranně | Per OAuth scope |
| **Klaviyo Staff** | Interní s consentem | Debug/support | Limited |

---

## 2. Static User Roles (7 default)

Klaviyo přechází od jednoduchého 5-role modelu (původně) na **7 static + custom roles** (2025+).

### 2.1 Owner

- **Vždy 1 per account**
- První user, který vytvoří account
- Receives billing notifications
- Manages who receives important account notifications
- Only role that can:
  - **Close account**
  - **Transfer ownership** to another user
  - Manage domain authentication (limited to 1 per account)
- Default access ke všemu

### 2.2 Admin

- Téměř identical s Owner
- **Cannot close account** (only Owner)
- Manages content, billing, users, API keys, domain auth
- **Multiple Admins** per account possible
- **Cannot remove themselves** if no Owner present

### 2.3 Manager

- Access ke core features
- **Some limitations v Flows a List management** (cannot delete certain lists)
- Manage campaigns, segments, profiles
- **Cannot manage billing** ani **invite Admins**

### 2.4 Analyst

- **Focus: data + reporting**
- Access reports, dashboards, analytics
- **Cannot create** or send campaigns
- **Cannot edit** profiles, lists, segments
- Ideal pro stakeholdery, consultants

### 2.5 Campaign Coordinator

- **Create and send campaigns**
- Edit templates
- **Limited access to Flows**
- Cannot delete profiles or modify list structure deeply
- Ideal pro junior marketers focusing na kampaně

### 2.6 Content Creator

- **Design email templates only**
- **Cannot send campaigns** (creates drafts)
- **Cannot access customer data**
- Ideal pro external designer, copywriter

### 2.7 Support

- **Limited to Inbox a Profile tabs**
- View customer profiles (per support need)
- Reply to customer messages
- **Cannot edit campaigns, flows, lists**

### 2.8 Permission matrix

| Akce | Owner | Admin | Manager | Analyst | Campaign Coord | Content Creator | Support |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Account & Billing** |  |  |  |  |  |  |  |
| Close account | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage billing | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Transfer ownership | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **User management** |  |  |  |  |  |  |  |
| Invite users | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Edit user roles | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Remove users | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create custom roles | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **API & Security** |  |  |  |  |  |  |  |
| Create API keys | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage SSO/SAML | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Profiles** |  |  |  |  |  |  |  |
| View profiles | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Edit profiles | ✅ | ✅ | ✅ | ❌ | limited | ❌ | limited |
| Delete profiles | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Import profiles | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Export profiles | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Lists & Segments** |  |  |  |  |  |  |  |
| Create lists | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit lists | ✅ | ✅ | limited | ❌ | ❌ | ❌ | ❌ |
| Delete lists | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create segments | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Campaigns** |  |  |  |  |  |  |  |
| Create campaign | ✅ | ✅ | ✅ | ❌ | ✅ | drafts only | ❌ |
| Send campaign | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Delete campaign | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Flows** |  |  |  |  |  |  |  |
| Create flow | ✅ | ✅ | limited | ❌ | ❌ | ❌ | ❌ |
| Activate flow | ✅ | ✅ | limited | ❌ | ❌ | ❌ | ❌ |
| Edit live flow | ✅ | ✅ | limited | ❌ | ❌ | ❌ | ❌ |
| **Templates** |  |  |  |  |  |  |  |
| Create template | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Edit template | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Delete template | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Forms** |  |  |  |  |  |  |  |
| Create form | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit form | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Reviews** (add-on) |  |  |  |  |  |  |  |
| Manage reviews | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | limited |
| **Reports & Analytics** |  |  |  |  |  |  |  |
| View reports | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Create custom reports | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Domain & Deliverability** |  |  |  |  |  |  |  |
| Manage domains | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Integrations** |  |  |  |  |  |  |  |
| Connect integrations | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Coupons** |  |  |  |  |  |  |  |
| Create/manage coupons | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |

### 2.9 Special pravidla

- **Account musí mít vždy 1 Ownera** – pokud Owner odejde, musí převést ownership přes Klaviyo Support (může být zdlouhavé)
- **Transfer ownership** přes UI: Settings → Account → Transfer ownership
- **Removing Admin:** Admin nemůže sám sebe odstranit pokud je jediný Admin + Owner pohřešovaný
- **Invitation valid:** 12 hodin (krátký okno!) – pak musí re-invite

---

## 3. Custom User Roles & Permission Sets

V 2025 Klaviyo zavedlo **Custom User Roles** – vlastní role složené z **Permission Sets**.

### 3.1 Co je Permission Set

Atomic permission unit organized by product area. Příklady:
- Content View
- Content Edit
- Campaigns Send
- Flows Edit
- Lists Manage
- Profiles Edit
- Reports View
- Reports Create
- Account Settings Edit
- Billing Edit
- User Management

### 3.2 Custom Role flow

```
Owner/Admin: Settings → Users → Roles tab
   ↓
+ Create custom role
   ↓
Name + Description
   ↓
Select permission sets (toggle each)
   ↓
Review
   ↓
Save → Custom Role created
   ↓
Assign to users (existing or new)
```

### 3.3 Custom Role best practices

- **No limit na počet custom rolí**
- **Align role names to job functions** (e.g. "Email Designer", "RevOps Analyst")
- **Use Content Permissions** for external agencies (view-only, no edit)
- **Limit Billing Edit** to minimum users
- **Quarterly audit** rolí + user assignments
- **Clear descriptions** ("Can build flows; no billing access")

### 3.4 SCIM provisioning (Enterprise)

- SCIM 2.0 endpoint pro:
  - Create user
  - Update user (incl. role)
  - Deactivate user
- Použití pro auto-provisioning z Okta, OneLogin, Azure AD
- **Po vytvoření custom role:** copy "Custom SCIM ID" pro use v IdP

### 3.5 New features inheritance

- Klaviyo přidá new permission set
- Existing custom roles **inherit closest existing permission set**
- Doporučení: review release notes + adjust roles per quarter

### 3.6 Static role customization

- **Static roles nelze deletovat ani editovat**
- Můžete jen vytvořit Custom Role s identickými permissions a používat ji místo

---

## 4. Owner flow

### 4.1 Onboarding (první přihlášení)

```
1. Sign-up na klaviyo.com → automatically Owner
   ↓
2. Email verification
   ↓
3. Setup wizard:
   - Company info
   - Industry
   - Estimated profile count
   - Primary platform (Shopify, WooCommerce, Custom, etc.)
   ↓
4. Connect e-commerce store (key step):
   - OAuth Shopify / WooCommerce plugin / etc.
   - Initial data sync (customers, orders, products)
   ↓
5. Install Klaviyo tracking JS na website
   ↓
6. Domain authentication:
   - Add sending domain (e.g. mail.yourstore.com)
   - Setup DKIM (2× CNAME)
   - Setup DMARC
   - Optional: branded tracking domain
   ↓
7. Set sender details (from email, address)
   ↓
8. Create first List (Newsletter)
   ↓
9. Create first Signup Form (popup)
   ↓
10. Create Welcome Flow
   ↓
11. Pozvat tým
   ↓
12. První kampaň
```

### 4.2 Kritické Owner-only akce

#### Close account

```
Settings → Account → Close account
   ↓
Important: Klaviyo retains data per GDPR
   ↓
Confirmation flow (multi-step)
   ↓
Account closed
```

#### Transfer ownership

```
Settings → Account → Users → Choose user to promote
   ↓
"Transfer ownership"
   ↓
2FA confirmation
   ↓
New owner accepts via email link
   ↓
Bývalý Owner → automatically Admin
```

**Pozor:** Pokud Owner odešel z firmy bez transferu, je velmi obtížné – musí přes Klaviyo Support s proof.

### 4.3 Owner daily flow

```
Login → Dashboard
   ↓
Check:
- Active profiles count (billing trigger)
- Recent campaign performance
- Active flows health
- Deliverability metrics
- New profile sources
- Account quota usage
   ↓
Strategic:
- Plan & budget review
- Custom role audits
- Add-on cost review (Reviews, Analytics, AI agents)
- Team performance review
```

---

## 5. Admin flow

Admin = top-level operational role. Téměř všechno krom close account.

### 5.1 Daily Admin workflow

```
Login → Account dashboard
   ↓
Operational checks:
- Failed flows
- Bounce rate spikes
- Spam complaint rate
- Integration sync status
- API key usage
- New user invitations pending
- Custom role audits
   ↓
Actions:
- User management
- Domain authentication review
- Billing adjustments
- Add-on management
- Approve pending campaigns
```

### 5.2 User invitation flow

```
Admin: Settings → Users → + Add user
   ↓
Enter email + role selection:
- Static role (Manager, Analyst, etc.)
- Custom role
   ↓
Send invitation
   ↓
Invitee receives email
   ↓
**12-hour window** to accept
   ↓
Accept → set password → active user
   ↓
If expired → must re-invite
```

### 5.3 API key creation

```
Admin: Settings → API Keys
   ↓
+ Create Private API Key
   ↓
Name the key (best practice: descriptive)
   ↓
Select scope:
- Full Access Key (all CRUD)
- Read-Only Key
- Custom Key (per-endpoint scopes)
   ↓
Save
   ↓
**Key displayed ONCE** – copy + store in vault
   ↓
After display, even Admin cannot view key value
```

### 5.4 Domain authentication

```
Admin: Settings → Domains and hosting
   ↓
Add sending domain (e.g. mail.yourstore.com)
   ↓
Klaviyo generates:
- DKIM CNAME 1
- DKIM CNAME 2
- DMARC TXT
- Optional: branded tracking domain CNAME
   ↓
You add to DNS provider
   ↓
Klaviyo validates (5 min – 48h)
   ↓
[Authenticated]
   ↓
Email sends now use your domain
```

---

## 6. Manager flow

Manager = výkonný user pro daily marketing operations.

### 6.1 Daily Manager workflow

```
Login → Dashboard
   ↓
Activities:
- Build/edit segments
- Schedule campaigns
- Review flow performance
- Update templates
- Manage form configurations
- Profile data cleanup
   ↓
Send permission BUT limited:
- Cannot delete certain lists (esp. system lists)
- Some flow management restrictions
```

### 6.2 Create campaign

```
Campaigns → + Create campaign
   ↓
1. Select campaign type: Email / SMS / WhatsApp / Push
   ↓
2. Audience:
   - Send to: list or segment
   - Don't send to: exclusions
   ↓
3. Configure send settings:
   - From email/name
   - Reply-to
   - Subject + preview text
   - Smart Send Time toggle (Pro+)
   ↓
4. Design email:
   - Drag-drop editor
   - Personalization tokens
   - Dynamic content blocks
   - Product blocks (catalog)
   ↓
5. Tracking:
   - Conversion goal (default: Placed Order)
   - UTM parameters
   - Branded tracking domain
   ↓
6. Preview & Test:
   - Send test
   - Preview as specific profile
   - Mobile preview
   ↓
7. Schedule or Send Now
   ↓
8. Klaviyo queues → sends
   ↓
9. Real-time analytics v Reports
```

### 6.3 Create flow

```
Flows → + Create flow
   ↓
Volba:
A) From scratch
B) From template (Welcome Series, Abandoned Cart, etc.)
C) AI-generated (Marketing Agent prompt)
   ↓
A) From scratch flow:
   1. Choose trigger:
      - Metric (any event)
      - List trigger
      - Segment trigger
      - Date-based
      - API trigger
   ↓
   2. Configure trigger filters:
      - Property filters
      - Behavioral filters
   ↓
   3. Flow filters (apply at flow level):
      - Exclude from flow under conditions
   ↓
   4. Build flow body:
      - Email/SMS/WhatsApp/Push actions
      - Conditional splits
      - Trigger splits
      - Time delays (with Smart Send Time option)
      - Profile updates
      - List add/remove
      - Webhook actions
   ↓
   5. Configure each email step:
      - Template selection
      - Subject line
      - From sender
      - Smart Sending toggle
      - Conversion goal
   ↓
   6. Test flow:
      - Live preview as specific profile
      - Send test through all steps
   ↓
   7. Set to **Live**
   ↓
[Status: Live]
```

---

## 7. Analyst flow

Analyst = data + reporting role.

### 7.1 Daily Analyst workflow

```
Login → Analytics dashboard
   ↓
Check:
- Custom dashboards
- Marketing Analytics (if add-on)
- Recent campaign performance
- Flow performance
- Revenue attribution
- Predictive metrics trends
   ↓
Build:
- Custom reports
- Cohort analyses
- Funnel reports
- Multi-touch attribution
   ↓
Export:
- CSV exports
- Scheduled reports (email delivery)
   ↓
Cannot:
- Send campaigns
- Edit profiles
- Create flows
```

### 7.2 Use case

- C-level executive (only viewing)
- External consultant
- RevOps analyst
- Finance reviewer

---

## 8. Campaign Coordinator flow

Campaign Coordinator = focus na campaigns specifically.

### 8.1 Daily workflow

```
Login → Campaigns
   ↓
Activities:
- Build campaigns
- Edit templates
- A/B test setup
- Schedule sends
   ↓
Cannot:
- Manage profiles deeply
- Build/edit flows fully
- Manage billing
- User management
```

### 8.2 Use case

- Junior marketer focused na batch sends
- External agency person managing campaigns

---

## 9. Content Creator flow

Content Creator = design role.

### 9.1 Workflow

```
Login → Templates
   ↓
Activities:
- Design email templates
- Edit existing templates
- Use brand kit
- Create reusable content blocks
   ↓
Cannot:
- Send campaigns
- Access customer data (profiles, lists)
- View reports
- Manage flows
```

### 9.2 Use case

- External designer
- Copywriter
- Brand consultant
- Junior creative

---

## 10. Support flow

Support role = customer-facing role.

### 10.1 Workflow

```
Login → Inbox (if Service Hub) / Profiles
   ↓
Activities:
- Reply to customer support emails/SMS
- Search & view individual profiles
- Update profile properties (basic)
- Log internal notes
   ↓
Cannot:
- Send marketing campaigns
- Build flows
- Edit segments
- View deep analytics
```

### 10.2 Use case

- Customer service agents
- Support tier 1 / 2
- Account management for VIPs

---

## 11. Profile lifecycle

Klaviyo's core concept – kompletní lifecycle profile.

### 11.1 Profile creation

```
Method A: Form submission
   - Visitor fills form (popup, embedded, etc.)
   - Profile created with form fields
   - List added (based on form config)
   - Welcome flow triggered (if active)

Method B: E-commerce sync
   - Customer creates account on Shopify
   - Shopify webhook → Klaviyo
   - Profile created with customer data
   - Marketing consent based on opt-in flag

Method C: Manual import
   - Admin uploads CSV
   - Profiles imported with consent flag
   - Optional: trigger welcome flow

Method D: API
   - External system POSTs to /profiles
   - Profile created/updated
   - List add optional

Method E: Tracking script (anonymous)
   - Visitor browses website
   - Klaviyo JS drops cookie
   - Tracked as anonymous profile
   - When email captured (form/checkout) → identity resolved
```

### 11.2 Identity resolution

```
Anonymous profile (cookie ID): kv_xxx
   ↓
Visitor identifies (email entered)
   ↓
Klaviyo merges anonymous + identified profiles
   ↓
Cross-device stitching:
- Same email seen on mobile → matches
- Phone number provided → links SMS profile
   ↓
Single unified profile
```

### 11.3 Subscription flow (single opt-in default)

```
Form submission → "Subscribed to email"
   ↓
Profile.subscription.email = subscribed
   ↓
"Subscribed to List" event fires
   ↓
Welcome flow trigger fires (if matches)
   ↓
First welcome email sent
```

### 11.4 Double opt-in flow

```
Form submission
   ↓
Profile created but NOT yet subscribed
   ↓
Klaviyo sends confirmation email
   ↓
Visitor clicks confirm link
   ↓
Klaviyo logs IP + timestamp + user agent
   ↓
Profile.subscription.email = subscribed
   ↓
"Subscribed to List" fires
   ↓
Welcome flow
```

### 11.5 Engagement & tracking

```
Profile subscribed
   ↓
Campaign sent → email received
   ↓
Tracking pixel loads → "Opened Email" event
   ↓
Click on link → Klaviyo redirector → "Clicked Email" event
   ↓
On website, Klaviyo JS tracks:
- Active on Site
- Viewed Product
- Added to Cart
- Started Checkout
   ↓
Each = event with properties
   ↓
Predictive analytics updates:
- CLV recalculated
- Churn risk recalculated
- Next order date predicted
   ↓
Segments auto-update (if profile changes criteria)
   ↓
Flows trigger if profile enters new event/list/segment
```

### 11.6 Preference Center

```
Email footer: "Manage preferences" link
   ↓
Klaviyo-hosted preference page (s tokenem)
   ↓
Profile vidí:
- Current subscription status (per channel)
- Preferences (frequency, topics if configured)
- Personal info edit
- "Unsubscribe from all" master toggle
   ↓
Submit changes
   ↓
Profile updated
   ↓
Workflow triggers (Subscribed/Unsubscribed events)
```

### 11.7 Unsubscribe

```
Subscriber clicks Unsubscribe
   ↓
Klaviyo unsubscribe page:
- "We've unsubscribed you" message
- Optional: choose specific lists vs. all
   ↓
Profile.subscription.email = unsubscribed
   ↓
"Unsubscribed" event fires
   ↓
**Profile remains in Klaviyo** (active profile count goes down if was sole subscription)
   ↓
Excluded from all marketing
   ↓
Lze resubscribe via form
```

### 11.8 Suppression vs. Unsubscribed

| | Suppressed | Unsubscribed |
|---|---|---|
| Trigger | Bounce, complaint, manual | User opt-out |
| Profile stays | Yes | Yes |
| Counts in active profiles | No | No |
| Auto-reversible | No (manual remove from supression) | Yes (resubscribe form) |

### 11.9 Hard bounce flow

```
ISP returns 5xx
   ↓
Klaviyo marks Hard Bounce
   ↓
Profile auto-added to suppression
   ↓
Excluded from future sends
   ↓
"Marked Email as Spam" or "Bounced Email" event fires
```

### 11.10 Spam complaint

```
Recipient clicks "Report spam"
   ↓
Gmail FBL → Klaviyo
   ↓
Klaviyo:
- Marks profile suppressed
- Logs complaint
- Updates sender reputation
- Webhook fires
```

### 11.11 Profile activity timeline

V profile UI vidíte chronological timeline:
- Every event
- Email sends, opens, clicks
- SMS interactions
- Form submissions
- Order events
- Custom events
- Property changes
- Flow enrollments

---

## 12. Email lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  1. USER drafts campaign/flow email                             │
│     - Select audience (list/segment for campaign)               │
│     - Configure trigger (for flow)                              │
│     - Design + personalization                                  │
│     - Conversion goal set                                       │
│                            │                                    │
│                            ▼                                    │
│  2. PRE-SEND CHECKS (Klaviyo auto):                             │
│     - Sender authenticated?                                     │
│     - Audience valid?                                           │
│     - Profile count within plan tier?                           │
│     - Email volume within allowance?                            │
│     - Smart Sending: prevent over-emailing?                     │
│     - Quiet Hours config?                                       │
│                            │                                    │
│                            ▼                                    │
│  3. SEND TIME determination:                                    │
│     - Manual time                                               │
│     - Smart Send Time (AI per profile)                          │
│     - Time zone send                                            │
│                            │                                    │
│                            ▼                                    │
│  4. PER-RECIPIENT EMAIL GENERATION                              │
│     - Personalization tokens resolved                           │
│     - Dynamic content evaluated                                 │
│     - Product recommendations (AI, Pro+)                        │
│     - Branded tracking links wrapped                            │
│     - Tracking pixels embedded                                  │
│                            │                                    │
│                            ▼                                    │
│  5. SMTP SEND (from Klaviyo's infrastructure)                   │
│     - From: configured sender                                   │
│     - DKIM signed with your domain key                          │
│     - DMARC compliant                                           │
│     - List-Unsubscribe RFC 8058                                 │
│     - One-click unsubscribe                                     │
│                            │                                    │
│                            ▼                                    │
│  6. ISP RECEIVES (Gmail/Outlook/Yahoo):                         │
│     - SPF check                                                 │
│     - DKIM verify (PASS)                                        │
│     - DMARC alignment (PASS via DKIM)                           │
│     - Reputation check                                          │
│     - Content filters                                           │
│     - Engagement history                                        │
│                            │                                    │
│                            ▼                                    │
│  7. ROUTING:                                                    │
│     - Inbox / Primary                                           │
│     - Promotions                                                │
│     - Spam                                                      │
│     - Bounced                                                   │
│                            │                                    │
│                            ▼                                    │
│  8. RECIPIENT INTERACTION:                                      │
│     - Open → tracking pixel → "Opened Email" event              │
│     - Click → Klaviyo redirect → "Clicked Email" event          │
│     - Browse → web tracker → "Active on Site" event             │
│     - Purchase → "Placed Order" event (via Shopify webhook)     │
│                            │                                    │
│                            ▼                                    │
│  9. ATTRIBUTION:                                                │
│     - Email → page → purchase = revenue attribution             │
│     - Default conversion goal: Placed Order                     │
│     - Attribution window: configurable (default 5-day)          │
│                            │                                    │
│                            ▼                                    │
│ 10. PROFILE UPDATE:                                             │
│     - Engagement properties updated                             │
│     - Predictive metrics recalculated                           │
│     - Segments re-evaluated                                     │
│                            │                                    │
│                            ▼                                    │
│ 11. FLOW TRIGGERS:                                              │
│     - "Opened Email" event → if any flow trigger matches        │
│     - "Clicked Email" event → cross-sell, etc.                  │
│     - "Placed Order" event → post-purchase flows                │
│                            │                                    │
│                            ▼                                    │
│ 12. REPORTING:                                                  │
│     - Real-time stats v Klaviyo                                 │
│     - Revenue attributed                                        │
│     - Per-flow + per-campaign analytics                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 13. Flow execution

### 13.1 Flow activation

```
User builds flow → Configure trigger + filters + body
   ↓
Save as Draft
   ↓
Test mode:
- "Send test" through each step
- Live preview as specific profile
   ↓
**Set Live**
   ↓
Klaviyo:
- Validates flow logic
- Confirms triggers
- Activates engine
   ↓
[Status: Live]
```

### 13.2 Flow trigger evaluation

```
Event occurs (e.g. "Placed Order")
   ↓
Klaviyo flow engine evaluates all Live flows
   ↓
For each flow with matching trigger:
   - Check trigger filters
   - Check flow filters (account-level)
   - Check Smart Sending (don't over-email)
   - Check if profile already in flow (re-entry rules)
   ↓
If passes → ENROLLED at first step
```

### 13.3 Flow execution per profile

```
Profile enters at trigger
   ↓
First step: typically time delay (e.g. 1 hour)
   ↓
After delay → evaluate next step
   ↓
For each step:
   - Action: send email/SMS, update property, etc.
   - Conditional split: evaluate branches
   - Trigger split: evaluate trigger event properties
   - Time delay: wait
   ↓
Continue until:
   - End of flow
   - Conversion goal met (exits)
   - Flow filter no longer matches (exits)
   - Profile unsubscribed (skips sends)
```

### 13.4 Flow filters – continuous evaluation

- **Profile filter** evaluated **at every step**
- If profile no longer matches filter → exit flow
- Common filters:
  - "Subscribed to email" still TRUE
  - "Not currently in test segment"
  - "Has not converted in last 30 days"

### 13.5 Smart Sending

- Default ON for all sends
- Prevents over-emailing same profile
- Default rule: don't send within 16 hours of last email
- Configurable globally

### 13.6 Re-entry rules

- Default: profile can re-enter flow if trigger fires again
- Some flows configurable to enroll once-only
- E.g.: Welcome Series – enroll once; Abandoned Cart – can re-enroll multiple times

### 13.7 Flow analytics per step

- **Recipients** – who reached step
- **Email metrics** – opens, clicks, conversions per step
- **Revenue per step**
- **Drop-off rate** – who exited and where

---

## 14. E-commerce data flow

Klaviyo's **bread and butter**. Deep integration s Shopify (primárně) + WooCommerce/BigCommerce/Magento/Wix.

### 14.1 Initial sync (post-OAuth)

```
Owner: Integrations → Shopify → Connect
   ↓
OAuth authorize Shopify store
   ↓
Klaviyo initial sync:
- Customers → Profiles (with marketing_consent flag)
- Orders → "Placed Order" events historically
- Products → Catalog
- Abandoned carts → Cart events
- Discount codes → Coupon system
   ↓
Sync continues in real-time via webhooks
```

### 14.2 Continuous webhook flow

```
Shopify event happens (order placed)
   ↓
Shopify webhook → Klaviyo endpoint
   ↓
Klaviyo:
- Update/create profile
- Fire event (e.g. "Placed Order")
- Trigger matching flows
- Update predictive metrics
   ↓
Real-time
```

### 14.3 Abandoned cart flow

```
Customer browses Shopify, adds to cart
   ↓
Shopify webhook: cart event
   ↓
Klaviyo: "Started Checkout" event (only if customer started checkout with email)
   ↓
If 1+ hours pass without "Placed Order":
   - Abandoned Cart flow triggers
   ↓
Email 1 (after 1 hour): "Did you forget?"
   - Contains cart products dynamically
   - Direct checkout link
   ↓
Email 2 (after 24 hours): 10% discount
   ↓
Email 3 (after 48 hours): final reminder
   ↓
Goal: "Placed Order" within 5-day attribution window
```

### 14.4 Post-purchase flow

```
Order placed → "Placed Order" event
   ↓
Post-purchase flow trigger
   ↓
Branch by product category:
- If skincare → tutorial email
- If supplements → consumption guide
   ↓
After 7 days: review request (Klaviyo Reviews)
   ↓
After 30 days: replenishment reminder (if consumable)
   ↓
After 60 days: cross-sell campaign
   ↓
After 90 days: VIP welcome (if CLV > threshold)
```

### 14.5 Browse abandonment flow

```
Visitor browses product (Klaviyo JS tracks)
   ↓
"Viewed Product" event with product ID
   ↓
After 30 minutes without "Added to Cart":
   - If identified profile → Browse Abandonment flow
   ↓
Email: "Take another look"
   - Dynamically pull product details
   - Recommendations of similar items
```

### 14.6 Predictive triggers

```
Predicted Date of Next Order = 14 days from now
   ↓
Replenishment Reminder flow triggers 7 days before
   ↓
Email: "Time to restock?"
```

---

## 15. Predictive analytics flow

### 15.1 Predictive model training

```
Shopify integration provides order history
   ↓
Klaviyo's ML model trains on:
- Order frequency
- AOV
- Product categories
- Time between orders
- Customer cohorts
   ↓
Model assigns to each profile:
- Predicted CLV
- Churn risk (Low/Med/High)
- Predicted date of next order
- Expected number of orders next 12 months
   ↓
Models retrain as new data arrives (continuous)
```

### 15.2 Activation in segments

```
Create segment: "VIP customers"
   ↓
Filter: Predicted CLV > $500
   AND Has placed > 3 orders last 12 months
   ↓
Segment auto-updates as predictions update
   ↓
Use in:
- Campaigns
- Flows (as filter)
- Audience sync to Meta/Google Ads
```

### 15.3 Predictive flow triggers

```
Trigger: Profile enters segment "At-risk churners"
   ↓
Re-engagement flow:
- Email 1: "We miss you" + special offer
- Wait 5 days
- Email 2: Final reminder + larger discount
- Wait 10 days
- Suppression (if not engaged)
```

### 15.4 RFM analysis flow

```
RFM cohorts auto-assigned per profile
   ↓
Cohort transitions trigger workflows:
- Champion → continue VIP treatment
- About to Sleep → re-engagement
- Hibernating → winback
- Lost → suppression
```

---

## 16. API & Integration flow

### 16.1 Private API key creation

```
Owner/Admin/Manager: Settings → API Keys
   ↓
+ Create Private API Key
   ↓
Name (descriptive, e.g. "Production Shopify Sync")
   ↓
Select scope:
- Full Access (all CRUD)
- Read-Only
- Custom (specify per endpoint)
   ↓
Save → Key displayed ONCE
   ↓
Copy + store in vault (1Password, AWS Secrets Manager)
   ↓
**No way to view key value after this**
```

### 16.2 API request flow

```
Application code:
   POST https://a.klaviyo.com/api/profiles
   Headers:
     Authorization: Klaviyo-API-Key pk_xxxx
     revision: 2024-10-15
     Content-Type: application/json
   Body: { "data": { "type": "profile", "attributes": {...} } }
   ↓
Klaviyo validates:
- Auth
- Rate limit
- Payload validity
   ↓
Response: 200/201/etc.
```

### 16.3 Custom event tracking

```
Application code (server-side):
   POST /api/events
   {
     "data": {
       "type": "event",
       "attributes": {
         "metric": { "name": "Completed Lesson" },
         "profile": { "email": "user@example.com" },
         "properties": { "lesson_id": "intro-101", "duration_min": 12 }
       }
     }
   }
   ↓
Klaviyo:
- Resolves profile (create if not exists)
- Records event with properties
- Updates profile activity timeline
- Triggers flows if applicable
```

### 16.4 Webhook flow

```
External system → Klaviyo (data in)
   - POST /api/events for custom events
   - POST /api/profiles for profile updates

Klaviyo → External system (events out)
   - Configure webhook subscriptions
   - Klaviyo POSTs on:
     - Profile created
     - Profile subscribed/unsubscribed
     - Campaign sent
     - Flow event
   - Application verifies signature → processes
```

### 16.5 OAuth flow (public apps from App Marketplace)

```
3rd party app initiates OAuth
   ↓
Redirect to Klaviyo authorize
   ↓
User grants scopes
   ↓
Authorization code returned to app
   ↓
App exchanges code → access token
   ↓
App uses Bearer token for API
```

### 16.6 SCIM provisioning (Enterprise)

```
IdP (Okta/OneLogin/Azure AD) → Klaviyo SCIM endpoint
   ↓
Auto-create user with role assignment
   ↓
Auto-update user (role change)
   ↓
Auto-deactivate user on offboarding
```

---

## 17. GDPR & Compliance flow

### 17.1 Right to Be Forgotten

```
Subscriber requests deletion
   ↓
Method A: UI
   Admin: search profile → Actions → Delete profile (GDPR)
   ↓
Method B: API
   POST /api/data-privacy/deletion-jobs
   Body: { "data": { "type": "data-privacy-deletion-job",
                     "attributes": { "profile": { "email": "..." } } } }
   ↓
Klaviyo:
- Removes all profile data
- Anonymizes related events
- Adds to permanent suppression
- Logs deletion
- May take 30 days to fully process
```

### 17.2 Data export per profile

```
Admin: search profile → Actions → Download profile data
OR
API: GET /api/profiles/{id} + GET /api/profiles/{id}/events
   ↓
Klaviyo exports:
- Profile attributes
- All events
- List memberships
- Segment memberships
- Form submissions
- Subscription history
   ↓
Provides download (or returns JSON)
```

### 17.3 Consent tracking

For each profile:
- Email subscription source + timestamp + IP
- SMS opt-in source + timestamp + IP
- WhatsApp opt-in
- Push opt-in
- GDPR consent (if double opt-in used)

### 17.4 Data residency

- Default **US hosting** (Boston + AWS US)
- **EU data residency** dostupné jen pro **Klaviyo One (Enterprise)**
- DPA available
- EU-US Data Privacy Framework certified

### 17.5 Sub-processor list

Public on klaviyo.com – includes AWS, Twilio (SMS), etc.

---

## 18. Datová mapa: co vidí kdo

| Data | Owner | Admin | Manager | Analyst | Campaign Coord | Content Creator | Support | Custom Role | API |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Account & Billing | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | per role | per scope |
| User management | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | per role | per scope |
| All profiles | ✅ | ✅ | ✅ | view | view | ❌ | view | per role | ✅ |
| Edit profiles | ✅ | ✅ | ✅ | ❌ | limited | ❌ | limited | per role | ✅ |
| Lists | ✅ | ✅ | edit | view | ❌ | ❌ | ❌ | per role | ✅ |
| Segments | ✅ | ✅ | edit | view | ❌ | ❌ | ❌ | per role | ✅ |
| Campaigns | ✅ | ✅ | ✅ | view | ✅ | drafts | ❌ | per role | ✅ |
| Send campaigns | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | per role | ✅ |
| Flows | ✅ | ✅ | limited | view | ❌ | ❌ | ❌ | per role | ✅ |
| Templates | ✅ | ✅ | ✅ | view | ✅ | ✅ | ❌ | per role | ✅ |
| Forms | ✅ | ✅ | ✅ | view | ❌ | ❌ | ❌ | per role | ✅ |
| Reviews (add-on) | ✅ | ✅ | ✅ | view | ❌ | ❌ | limited | per role | ✅ |
| Reports | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | per role | ✅ |
| Custom analytics | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | per role | ✅ |
| Domains | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | per role | per scope |
| API keys | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | per role | – |
| Integrations | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | per role | per scope |
| Predictive analytics | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | per role | ✅ |
| GDPR delete | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | per role | per scope |

---

## 19. Známé úzkoprofilové místa

### 19.1 Role/User management

- **7 static rolí** ale fixed – jen custom roles plně flexible
- **Invitation expires v 12 hodinách** (krátký window!) – musí se často re-invite
- **Cannot rename static roles**
- **Ownership transfer přes UI** ale s constraints – pokud Owner pohřešovaný, support proces
- **No suspend state** – buď user exists nebo deactivated
- **Custom roles inheritance** when Klaviyo adds new permissions – auto-inherit closest

### 19.2 API key gotchas

- **Key displayed ONCE** – ztracený key = unrecoverable
- **Cannot edit private key after creation** – scope změna = delete + new
- **Old API keys deactivate** when private key authentication deprecated (June 30, 2025 deadline)
- **API key bound to account-level** – user-level keys neexistují

### 19.3 Active profile-based billing nuances

- **Subscribed inactives still cost** – pravidelný list cleanup nutný
- **Auto-upgrade tier** at next billing cycle – cannot easily roll back
- **Resubscribed contacts** count again
- **Manual billing > 250K profiles** – contact sales

### 19.4 Profile model gotchas

- **Anonymous profiles** count toward total? Depends on plan (some plans count identified only)
- **Cross-device stitching** sometimes imperfect – duplicate profiles possible
- **Phone-only profiles** (SMS-only) count separately from email-only

### 19.5 Flow limitations

- **Real-time trigger evaluation** but **Smart Sending** can suppress emails
- **Flow filter changes** apply at next step, not retrospectively
- **Cannot easily clone flow** s preservation of step-level reporting
- **Flow templates limited** vs. HubSpot's library
- **No A/B testing of flow paths** (jen per-email A/B)
- **Re-entry rules** can be confusing

### 19.6 Shopify dependency

- **Some predictive features require Shopify Plus** features
- **WooCommerce/BigCommerce** less polished
- **Custom platforms** need careful event setup
- **Subscription apps** (Recharge, Bold) integration variability

### 19.7 Add-on cost stacking

- Reviews + Marketing Analytics + Customer Agent + Service Hub = $500+/month easily
- Customer Agent overage ($0.70/conversation) can balloon
- WhatsApp credits per message
- International SMS expensive

### 19.8 Compliance gaps

- **Default US data residency** – pro EU companies suboptimal mimo Enterprise
- **Audit logs only Enterprise**
- **GDPR deletion can take 30 days** – not instant

### 19.9 UI/UX issues

- **No Czech/Slovak/Polish UI**
- **Settings spread across many menus** – configuration sprawl
- **Steep learning curve** – event-driven model is advanced
- **Two parallel automation paradigms** – campaigns vs. flows (each has own logic)

### 19.10 Migration challenges

- **No native flow export** – must rebuild on competitor
- **Custom event history not portable** – historical data stays in Klaviyo
- **Predictive models locked-in** – competitors must rebuild from scratch
- **Reviews data exportable** but loses Klaviyo-specific tagging

---

## 20. Doporučení pro design vlastních procesů

Pokud Klaviyo používáte v týmu, doporučujeme:

1. **Domain authentication první den** – DKIM + DMARC + branded tracking domain
2. **Custom roles strategy** (Pro+) – ne ad-hoc per-user permissions
3. **API key naming** + **per-integration scoping** – ne shared production keys
4. **API key servisní účet** – ne user-bound, přežije fluktuaci
5. **List cleanup policy** – kvartální, suprese non-engagers
6. **Active profile monitoring** – alert před tier upgrade
7. **Quarterly user audit** – odstranit inactive, rotovat keys
8. **Flow naming convention** – e.g. "WELCOME_2026_EN", "ABANDONED_CART_v3"
9. **Test profile setup** – dedicated profiles pro QA flows
10. **Smart Sending policy** – set globální + per-flow rules pro frequency caps
11. **Sunset flow** – auto-suprese long-inactive (e.g. no open 6 měsíců → sunset email → suprese)
12. **Predictive metrics threshold review** – CLV thresholds quarterly
13. **GDPR delete proces** – dokumentovat internally pro consistency
14. **Add-on cost monitoring** – measure ROI per add-on (Reviews, Analytics, Customer Agent)
15. **Migration plan** – pravidelný export profiles + flow definitions jako backup
16. **SCIM setup** (Enterprise) – auto provisioning pro security
17. **Reviews opt-in management** – ne všechny customers chtějí review request, segmentovat

---

*Dokument zpracován z oficiálních zdrojů help.klaviyo.com, developers.klaviyo.com, klaviyo.com a praktických zdrojů (CheckThat.ai, Stitchflow, FirstPier, Retainful, EmailToolTester, Hustler Marketing, Tekpon, Stormy AI, Flowium, Adviser Atlas). Pro nejaktuálnější detaily vždy konzultovat Klaviyo Help Center.*
