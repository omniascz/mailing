# CleverReach – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v CleverReach prochází data, lidé a akce – od free signupu přes multi-user collaboration, THEA workflows, e-commerce integrace, až po koncového subscribera.

> Tento dokument doplňuje `27_CleverReach_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** CleverReach umí, tento popisuje, **kdo s tím interaguje a jak data tečou**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
> - **Německý produkt z Rastede (Niedersachsen, založeno 2007)** – jeden z předních DACH hráčů
> - **"Made in Germany"** core branding – security + compliance focus
> - **210 000+ klientů ve 152 zemích** (Spotify, DHL, Amnesty International)
> - **Multi-user s customizable access levels at NO extra cost** – UNIKÁTNÍ
> - **Self-serve sign-up** s free plan (250 recipients, 1000 emails/month)
> - **6 jazyků UI** (EN, DE, FR, ES, IT, NL) – no CZ/SK/PL
> - **DSGVO compliance leadership** (German GDPR)
> - **EU hosting** guaranteed
> - **THEA AI assistant** – CleverReach's AI feature
> - **Free webinars + support**
> - **DACH e-commerce native** (Shopware, JTL-Shop integrations)
> - **Wide CMS integration** (TYPO3, Contao, WordPress)

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Sign-up & free plan flow](#2-signup-flow)
3. [Onboarding flow](#3-onboarding-flow)
4. [User roles & customizable access levels](#4-user-roles)
5. [Account Owner flow](#5-account-owner-flow)
6. [Admin user flow](#6-admin-user-flow)
7. [Marketing user flow](#7-marketing-user-flow)
8. [Designer / Editor user flow](#8-designer-flow)
9. [Recipient lifecycle](#9-recipient-lifecycle)
10. [Email lifecycle](#10-email-lifecycle)
11. [THEA Workflows execution](#11-thea-workflows)
12. [Forms flow](#12-forms-flow)
13. [E-commerce integration flow (Shopware, Shopify)](#13-ecommerce-flow)
14. [CMS integration flow (TYPO3, WordPress)](#14-cms-flow)
15. [API & Zapier flow](#15-api-flow)
16. [THEA AI assistant flow](#16-thea-ai-flow)
17. [Deliverability flow](#17-deliverability-flow)
18. [GDPR/DSGVO compliance flow](#18-gdpr-flow)
19. [Support & Webinar flow](#19-support-flow)
20. [Datová mapa: co vidí kdo](#20-datová-mapa)
21. [Známé úzkoprofilové místa](#21-úzkoprofilové-místa)

---

## 1. Mapa aktérů

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│         CLEVERREACH PLATFORM ECOSYSTEM                             │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [CleverReach Internal Team (Rastede, Germany)]                    │
│   ├─ Customer Support (German + English native, FR/ES/IT/NL)       │
│   ├─ Premium support team (paid add-on)                            │
│   ├─ Technical Support                                             │
│   ├─ Migration assistance                                          │
│   ├─ Deliverability team (DACH ISP relationships)                  │
│   ├─ Sales (DACH primary, international)                           │
│   ├─ Webinar / Training team                                       │
│   ├─ Compliance team (DSGVO leadership)                            │
│   └─ Account / billing team                                        │
│           │ (free support pro all users, German excellence)        │
│           ▼                                                        │
│                                                                    │
│   ┌──────────────────────────────────────────┐                     │
│   │   CleverReach Account                    │                     │
│   │                                          │                     │
│   │   USER ACCESS LEVELS (CUSTOMIZABLE):     │                     │
│   │   ├─ Account Owner (1, signup creator)   │◄── full access      │
│   │   ├─ Administrator                       │◄── full operational │
│   │   ├─ Marketing user                      │◄── daily tasks      │
│   │   ├─ Designer / Editor                   │◄── content only     │
│   │   ├─ Read-only / Viewer                  │◄── reports only     │
│   │   └─ Custom roles per business needs     │◄── per definition   │
│   │                                          │                     │
│   │   **UNLIMITED USERS WITHOUT EXTRA COST!**│                     │
│   │   (per EmailTooltester confirmed)        │                     │
│   │                                          │                     │
│   │   Per-user granular permissions:         │                     │
│   │   - Recipients (view/edit/manage)        │                     │
│   │   - Campaigns (view/create/send)         │                     │
│   │   - Templates (view/edit)                │                     │
│   │   - Reports (view/export)                │                     │
│   │   - Integrations (manage)                │                     │
│   │   - Account settings (edit)              │                     │
│   └──────────────┬───────────────────────────┘                     │
│                  │                                                 │
│                  ▼                                                 │
│   [Recipients / Subscribers]                                       │
│       │                                                            │
│       ├─→ marketing emails (campaigns + THEA workflows)            │
│       ├─→ transactional emails                                     │
│       ├─→ form submissions                                         │
│       └─→ preference management                                    │
│                  │                                                 │
│                  ▼                                                 │
│   [Integrations]                                                   │
│   ┌──────────────────────────────────────────┐                     │
│   │   DACH-specific (KEY!):                  │                     │
│   │   - Shopware (DOMINANT DACH E-COMMERCE)  │                     │
│   │   - JTL-Shop (German e-shop)             │                     │
│   │   - TYPO3 (German CMS)                   │                     │
│   │   - Contao (German CMS)                  │                     │
│   │                                          │                     │
│   │   Global e-commerce:                     │                     │
│   │   - Shopify, Shopify Plus                │                     │
│   │   - WooCommerce (WordPress)              │                     │
│   │   - Magento (Adobe Commerce)             │                     │
│   │                                          │                     │
│   │   CRM:                                   │                     │
│   │   - SugarCRM (native)                    │                     │
│   │   - Salesforce, HubSpot (Zapier)         │                     │
│   │                                          │                     │
│   │   CMS:                                   │                     │
│   │   - WordPress (plugin)                   │                     │
│   │   - Joomla, Drupal                       │                     │
│   │                                          │                     │
│   │   iPaaS:                                 │                     │
│   │   - Zapier (5 000+ apps)                 │                     │
│   │                                          │                     │
│   │   API + Webhooks for custom needs        │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
│   [Free Webinars + Knowledge Base]                                 │
│       ├─→ Regular DE + EN sessions                                 │
│       ├─→ Use case driven content                                  │
│       └─→ Open to all users + prospects                            │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér | Vstupní bod | Co dělá | Co vidí |
|---|---|---|---|
| **Account Owner** | Self-serve sign-up | Full + billing + close account | Vše |
| **Administrator** | Pozvánka od Owner | Operational + user mgmt | Vše krom Owner exclusive |
| **Marketing user** | Pozvánka | Daily marketing | Per granular permissions |
| **Designer / Editor** | Pozvánka | Content + templates | Per role |
| **Viewer / Read-only** | Pozvánka | View reports | Read-only |
| **Custom role users** | Pozvánka s custom perms | Per granular config | Per assigned permissions |
| **Recipient / Subscriber** | Form, integration | Receives emails | Své emaily |
| **API Client** | API key | Per scope | Per scope |
| **Shopware integration** | Plugin install | Sync data | Per integration scope |
| **Shopify integration** | OAuth | Sync data | Per integration scope |
| **WordPress plugin** | Plugin install | Form + tracking | Per integration scope |
| **CleverReach Support** | Ticket / email | Issue resolution | Read s consent |
| **Premium Support team** | Paid add-on | Faster response, phone | Read s consent |

---

## 2. Sign-up & free plan flow

CleverReach má **self-serve sign-up** s **generous free plan**.

### 2.1 Free plan signup

```
Visit cleverreach.com → "Free trial" / "Start free"
   ↓
Sign-up form:
- Email
- Password
- Company name
- Country selection (location pro DSGVO)
- Language preference (6 options)
   ↓
**No credit card required**
   ↓
Email verification
   ↓
Account created:
- **Free plan: 250 recipients, 1000 emails/month**
- All core features active
- CleverReach branding v emails
- Email support active
   ↓
First login → onboarding wizard
```

### 2.2 Onboarding wizard

```
First login:
   ↓
Welcome dialog:
- Co je váš primární use case?
  - SMB newsletters
  - E-commerce (Shopify, Shopware, WooCommerce, etc.)
  - Non-profit
  - Agency multi-client
  - B2B
  - Other
- Estimated list size
- Existing tool (migrating from?)
- E-commerce platform (Shopware first pro DACH!)
- Industry vertical
   ↓
Setup recommendations:
- Suggested integrations (Shopware first pro DACH)
- Suggested templates
- Pre-built automation scenarios
   ↓
Optional: Schedule onboarding webinar (free!)
```

### 2.3 Free plan limitations

- **CleverReach branding** v emails (footer)
- **250 recipients** max
- **1 000 emails/month** max
- **Limited automation** features
- **Email support only**
- **No premium features** (some)

### 2.4 Upgrade flow

```
User exceeds free plan limits OR wants more features:
   ↓
Notification: "Upgrade to paid plan"
   ↓
Plan selection:
- Lite Plus (€15/month)
- Flex/Essentials (€41.25/month)
- High Volume (€495/month)
- Custom enterprise
   ↓
Payment method
- Credit card
- Bank transfer (DACH-friendly)
- Invoice (DE business)
   ↓
[Plan upgraded]
   ↓
Continue without disruption
```

### 2.5 DACH-friendly billing

- **CleverReach GmbH & Co. KG invoicing** (German company)
- **VAT/MwSt compliance** for German + EU customers
- **Bank transfer** option (Bezahlung per Überweisung)
- **EUR pricing primary**
- **Annual discount 10%**
- **Premium support add-on** (~$27/month)

### 2.6 Migration from competitors

```
CleverReach migration:
- From Mailchimp (most common)
- From rapidmail (DACH competitor)
- From Newsletter2Go (acquired company)
- From SendinBlue / Brevo
- From MailerLite
   ↓
Migration steps:
- Recipients export → CleverReach import
- Field mapping
- Templates recreation (rebuild required)
- Automation recreation
- Integration reconnection
   ↓
Migration assistance available (paid for complex cases)
```

---

## 3. Onboarding flow

### 3.1 First-time setup checklist

```
Day 1:
- Email verification
- Sender details setup (from name, email)
- Domain authentication (DKIM, SPF)
- Brand kit setup (colors, fonts, logo)
- First template customization

Day 2-3:
- E-commerce integration (Shopware/Shopify/etc.)
- Initial recipient import
- First list creation
- First sign-up form

Day 4-7:
- First campaign sent
- First automation (welcome series via THEA)
- Tracking setup (where possible)
- Multi-user team setup (add team members!)

Day 7-14:
- Decide on paid plan (if needed)
- Webinar attendance (free)
- THEA AI exploration
- Reports configuration
```

### 3.2 DACH-specific onboarding

```
For DACH businesses:
- Verify domain (.de / .at / .ch typical)
- Configure EUR billing
- Faktura / Rechnung setup
- MwSt compliance
- DSGVO-compliant settings
   ↓
German onboarding webinars available
Phone support (premium add-on)
```

### 3.3 Shopware onboarding (if applicable)

```
DACH e-shops often use Shopware
   ↓
Shopware backend → Plugin store → CleverReach
   ↓
Install + activate plugin
   ↓
Configure:
- API connection
- Default list for new customers
- Sync historical data toggle
- Field mapping
- GDPR consent transfer
   ↓
Initial sync (hours pro large stores):
- Customers, orders, products
   ↓
[Integration live, real-time sync]
```

### 3.4 Multi-user team setup (recommended early!)

```
Owner: Settings → Users → Invite team members
   ↓
Per team member:
- Email + name
- Role / Access level
- Granular permissions:
  - Recipients access
  - Campaigns access
  - Templates access
  - Reports access
  - Integrations access
   ↓
**Unlimited users at no extra cost!**
   ↓
Send invitations
   ↓
[Team active]
```

### 3.5 Free webinar attendance

```
CleverReach offers free webinars:
- Email marketing basics
- DSGVO compliance
- Automation strategies
- THEA AI usage
- E-commerce integrations
- Industry-specific best practices
   ↓
Available in DE + EN
   ↓
Live + recorded
   ↓
Recommended for new users
```

---

## 4. User roles & customizable access levels

CleverReach's **multi-user s customizable access levels at no extra cost** je KEY differentiator.

### 4.1 Default roles (typical)

#### Account Owner
- **Highest tier** access
- **Created during signup**
- Cannot be deleted directly
- Manages billing
- Closes account
- Manages all settings + users

#### Administrator
- **Full operational** access
- User management
- Integration management
- Cannot close account
- Cannot manage billing typically

#### Marketing user
- **Daily marketing** tasks
- Campaigns + automations + segments
- Content creation
- Reports
- No user management
- No billing

#### Designer / Editor
- **Content focused**
- Templates + design
- Limited recipient data
- No send permissions typically

#### Read-only / Viewer
- **View reports** only
- No editing
- For stakeholders, executives

#### Custom roles
- **Fully customizable**
- Per business needs
- Granular permissions

### 4.2 Granular permission categories

Per EmailTooltester confirmed:
*"You can assign specific permissions so each user only sees or manages certain areas, such as recipient data, reports, or campaigns."*

Configurable per user:

#### Account & Settings
- Account info view/edit
- Billing access
- User management
- Integration management
- Domain settings
- API key management

#### Recipients
- View recipients
- Edit recipients
- Import recipients
- Export recipients
- Delete recipients

#### Lists / Segments
- View lists
- Create/edit lists
- Delete lists

#### Campaigns
- View campaigns
- Create campaigns
- Edit campaigns
- Send campaigns
- Delete campaigns

#### Automations (THEA Workflows)
- View workflows
- Create/edit workflows
- Activate workflows

#### Templates
- View templates
- Create/edit templates
- Brand kit management

#### Forms / Sign-ups
- View forms
- Create/edit forms
- Publish forms

#### Reports
- View reports
- Export reports

#### Integrations
- View integrations
- Manage integrations

### 4.3 Permission matrix (typical defaults)

| Akce | Owner | Admin | Marketing | Designer | Viewer | Custom |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Account & Billing** |  |  |  |  |  |  |
| Close account | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage billing | ✅ | ❌ | ❌ | ❌ | ❌ | per role |
| Account settings | ✅ | ✅ | ❌ | ❌ | ❌ | per role |
| **User Management** |  |  |  |  |  |  |
| Add/edit/delete users | ✅ | ✅ | ❌ | ❌ | ❌ | per role |
| **Recipients** |  |  |  |  |  |  |
| View recipients | ✅ | ✅ | ✅ | limited | view | per role |
| Edit recipients | ✅ | ✅ | ✅ | ❌ | ❌ | per role |
| Import recipients | ✅ | ✅ | ✅ | ❌ | ❌ | per role |
| Export recipients | ✅ | ✅ | per role | ❌ | ❌ | per role |
| Delete recipients | ✅ | ✅ | per role | ❌ | ❌ | per role |
| **Lists / Segments** |  |  |  |  |  |  |
| Manage lists | ✅ | ✅ | ✅ | ❌ | view | per role |
| Create segments | ✅ | ✅ | ✅ | ❌ | view | per role |
| **Campaigns** |  |  |  |  |  |  |
| Create/edit | ✅ | ✅ | ✅ | ✅ | view | per role |
| Send | ✅ | ✅ | ✅ | ❌ | ❌ | per role |
| **Automations (THEA)** |  |  |  |  |  |  |
| Create/edit | ✅ | ✅ | ✅ | ❌ | view | per role |
| Activate | ✅ | ✅ | ✅ | ❌ | ❌ | per role |
| **Templates** |  |  |  |  |  |  |
| Create/edit | ✅ | ✅ | ✅ | ✅ | view | per role |
| Brand kit | ✅ | ✅ | ✅ | ✅ | view | per role |
| **Forms / Sign-ups** |  |  |  |  |  |  |
| Create/edit | ✅ | ✅ | ✅ | ✅ | view | per role |
| Publish | ✅ | ✅ | ✅ | per role | ❌ | per role |
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
Owner/Admin: Settings → Users / Mitarbeiter
   ↓
+ Add user / Mitarbeiter hinzufügen
   ↓
Email + Personal details
   ↓
Role selection:
- Default role (Admin, Marketing, Designer, Viewer)
- OR Custom role
   ↓
**Granular permission configuration:**
- Per area: recipients, campaigns, templates, etc.
- View/Edit/Manage levels
- Customizable to specific needs
   ↓
Send invitation
   ↓
User receives email v selected language
   ↓
User clicks activation link
   ↓
Sets password
   ↓
[Active user s custom permissions]
```

### 4.5 Multi-user advantages

**vs. competitors:**
- **Mailchimp:** limited free users
- **MailerLite:** 1 user free
- **ActiveCampaign:** 1 Plus, 3 Pro
- **CleverReach: UNLIMITED users at NO extra cost!**

This is **significant cost advantage** pro:
- Agencies managing multiple campaigns
- Marketing teams s 5+ members
- Client-agency collaboration
- Cross-functional teams

### 4.6 No SSO/SAML

- **No SSO/SAML** typically (vs. enterprise platforms)
- **2FA available** (TOTP)
- **Standard email/password** authentication

---

## 5. Account Owner flow

### 5.1 Owner responsibilities

```
Account Owner = highest tier
   ↓
Created during sign-up (account creator)
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
- Active workflow count
- Total recipients vs. plan limit
- Recent form submissions
- Integration health
- Failed sends / bounces alerts
   ↓
Strategic activities:
- Plan tier vs. growth
- Team performance audit
- ROI tracking
- Webinar attendance
```

### 5.3 Billing management

```
Owner: Settings → Plan & Billing / Tarif
   ↓
View:
- Current plan + tier
- Recipient count vs. limit
- Email sends vs. limit
- Add-ons (Premium support)
- Next billing date
- Payment method
- Invoice history (DE Rechnungen)
   ↓
Actions:
- Plan changes (upgrade/downgrade)
- Update payment method
- Apply discount codes
- Billing frequency (monthly/annual, 10% annual discount)
- Add-on management
```

### 5.4 Domain authentication

```
Owner/Admin: Settings → Domains / Domäne
   ↓
Add sending domain
   ↓
CleverReach provides DNS records:
- DKIM CNAME
- SPF include
- DMARC TXT (recommended)
- Branded tracking domain (CNAME)
   ↓
Add to DNS provider
   ↓
CleverReach validates
   ↓
[Authenticated]
   ↓
Emails signed s vaší doménou
```

### 5.5 Close account

```
Owner: Settings → Account → Cancel / Konto schließen
   ↓
Confirmation flow:
- Reasoning survey (optional)
- Confirm cancellation
   ↓
**Final notification email**
   ↓
Account scheduled for cancellation
   ↓
Data retention period (per GDPR)
   ↓
Final deletion
```

---

## 6. Admin user flow

### 6.1 Daily Admin workflow

```
Login → Dashboard (full access except billing)
   ↓
Operational checks:
- Yesterday's campaign metrics
- Active automation health
- Failed automations
- Bounce rates
- Integration sync status
- User management requests
   ↓
Actions:
- User management (invite, edit, deactivate)
- Custom role management
- Integration management
- API key management
- Domain settings
```

### 6.2 User management

```
Admin: Settings → Users
   ↓
+ Add user
   ↓
Configure:
- Email
- Role (or custom)
- **Granular permissions per area**
- 2FA requirement (optional)
   ↓
Send invitation
   ↓
[User active]
```

### 6.3 Integration management

```
Admin: Integrations → All / Alle
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
Add new:
- Shopware (one-click for DACH!)
- Shopify
- WooCommerce
- Magento
- TYPO3 plugin
- WordPress plugin
- Configure mapping
- Test sync
- Activate
```

### 6.4 API key management

```
Admin: Settings → API
   ↓
Generate new API key
   ↓
Name + scope
   ↓
**Key displayed** – copy + secure
   ↓
[API key active]
```

---

## 7. Marketing user flow

### 7.1 Daily Marketing workflow

```
Login → Dashboard (per permissions)
   ↓
Activities:
- Build segments
- Create / send campaigns
- Build / monitor THEA workflows
- Update templates
- Review reports
- A/B testing
- Manage forms
```

### 7.2 Create campaign

```
Newsletter / E-mailings → New / Neue Kampagne
   ↓
Step 1: Setup
- Campaign name (internal)
- Subject line + personalization
- Sender (verified)
- Reply-to
- UTM parameters
   ↓
Step 2: Recipients
- Lists / segments selection
- Exclusion options
   ↓
Step 3: Design
- Drag-drop editor
- Template library (200+)
- Brand kit application
- Personalization tokens
- Custom HTML option
   ↓
Step 4: Test
- Preview (desktop, mobile)
- Send test
- Spam test
   ↓
Step 5: Send / Schedule
- Send now
- Schedule date + time
- Time-zone based
   ↓
Confirm
```

### 7.3 Build THEA workflow

```
Automation / Automatisierung → New / Neue
   ↓
A) Blank canvas
B) Pre-built template
   ↓
A) Blank:
   - Choose trigger:
     - Subscribed to list
     - Tag added
     - Form submitted
     - Email opened/clicked
     - Custom field updated
     - Order placed (s integration)
     - Cart abandoned (s integration)
     - Birthday
     - Custom date
   ↓
   - Build canvas:
     - Send email
     - Wait
     - Condition (if/else)
     - Update field / tag
     - Goal
   ↓
   - **THEA AI suggestions** along the way
   ↓
   - Configure each node
   ↓
   - Test
   ↓
   - Activate

B) Pre-built:
   - Browse library (welcome, cart abandonment, birthday, etc.)
   - Customize
   - Test
   - Activate
```

### 7.4 Segment building

```
Recipients → Segments → New / Neu
   ↓
Add conditions:
- Contact data (custom fields, tags)
- Email engagement
- Subscription source
- Date conditions
- Geographic
- Behavior-based
   ↓
Combine s AND/OR/NOT
   ↓
Preview segment size
   ↓
Save
   ↓
[Dynamic segment]
```

### 7.5 Form management

```
Forms / Formulare → New / Neues Formular
   ↓
Type (limited per CleverReach):
- Standard embedded form
- Basic pop-up (some setups)
   ↓
Configure:
- Fields
- GDPR consent (required, DSGVO!)
- Captcha
- Style
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

## 8. Designer / Editor user flow

### 8.1 Use case

- **Specialized designer**
- Content creation focus
- External agency designers
- Brand consistency owner

### 8.2 Daily Designer workflow

```
Login → Limited dashboard
   ↓
Activities:
- Create/edit templates
- Update brand kit (colors, fonts, logos)
- Build campaign content (draft only)
- Manage image library
- Create saved blocks
- Form design
   ↓
Cannot (typically):
- Send campaigns
- Activate workflows
- Access recipient data deeply
- Change billing
- Manage users
```

### 8.3 Template work

```
Templates → New / Neue Vorlage
   ↓
Choose:
- Start from blank
- From library (200+)
- Duplicate existing
   ↓
Drag-drop builder:
- Add blocks
- Configure design
- Apply brand kit
- Add personalization
- Add product blocks (e-commerce)
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
- Colors (primary, secondary)
- Fonts
- Logo variants
- Saved blocks
- Email defaults (header, footer)
- Image library
   ↓
Save
   ↓
[Apply across all templates]
```

---

## 9. Recipient lifecycle

### 9.1 Recipient creation paths

#### A) Form submission
```
Visitor fills CleverReach form (embedded or basic popup)
   ↓
Submit
   ↓
CleverReach:
- Validates email
- Duplicate check
- Captcha verification
- GDPR consent recorded
   ↓
Status: Pending (double opt-in default for DACH!) OR Active
   ↓
Add to list(s)
   ↓
Tag (if configured)
   ↓
THEA workflow trigger fires
```

#### B) Double opt-in (DACH standard)
```
Form submission
   ↓
Status: Pending
   ↓
CleverReach sends Bestätigungsmail / confirmation email
   ↓
Recipient clicks confirm
   ↓
IP + timestamp + user agent logged
   ↓
**GDPR/DSGVO evidence captured**
   ↓
Status: Active
   ↓
Add to specified list
   ↓
Welcome workflow triggers
```

#### C) Shopware integration sync
```
Customer registers na Shopware shop
   ↓
Shopware webhook → CleverReach
   ↓
Contact created s marketing consent flag
   ↓
Add to designated list
   ↓
Tag: "Source: Shopware"
   ↓
Welcome workflow trigger
```

#### D) Shopify / WooCommerce sync
Similar flow per integration.

#### E) Manual import (CSV)
```
Admin: Recipients → Import
   ↓
CSV upload
   ↓
Field mapping
   ↓
Choose:
- List destination
- Skip duplicates
- Update existing
- Tag with source
- Confirm GDPR consent
   ↓
Validation
   ↓
Import processed
   ↓
[Contacts in account]
```

#### F) API import
```
External system POST /receivers
   ↓
CleverReach creates / updates
   ↓
Add to lists, tags
   ↓
Workflow trigger
```

### 9.2 Recipient status

```
[Pending] (if double opt-in, DACH standard)
   ↓
[Active] ← can receive
   ↓
Transitions:
- Unsubscribed (opt-out)
- Bounced (hard bounce)
- Spam complaint
- Deleted (manual / GDPR)
```

### 9.3 Engagement tracking

```
Active recipient receives email
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
**No native site tracking** (per critique – limitation)
- E-commerce data via integration
- Manual setup possible
```

### 9.4 Preference center

```
Email footer: "Abmelden" / "Manage preferences" link
   ↓
CleverReach-hosted preference page (per language)
   ↓
Recipient sees:
- Subscribed lists (toggles)
- Personal info (editable)
- Master unsubscribe
- GDPR rights (download data, delete)
   ↓
Update
   ↓
Profile updated
```

### 9.5 Unsubscribe

```
Recipient clicks Abmelden / Unsubscribe
   ↓
CleverReach-hosted page
   ↓
Options:
- Specific list
- All marketing
- Reason survey (optional)
   ↓
Status: Unsubscribed
   ↓
GDPR audit logged
   ↓
Workflow trigger fires
   ↓
Data retained per GDPR
```

### 9.6 Bounce + spam handling

#### Hard bounce
```
ISP 5xx
   ↓
Status: Bounced
   ↓
Auto-suppression
   ↓
**DACH ISP reputation tracking**
```

#### Spam complaint
```
ISP FBL → CleverReach
   ↓
Status: Spam complaint
   ↓
Auto-suppression
   ↓
DACH ISP reputation impact
```

### 9.7 GDPR delete (Right to Be Forgotten)

```
Recipient requests deletion:
A) Admin manual
B) API DELETE
C) Preference center self-service
   ↓
CleverReach:
- Removes personal data
- Anonymizes events
- Auto-suppression
- Audit log
- Confirmation email (DSGVO compliant)
```

---

## 10. Email lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│  1. USER drafts campaign / THEA workflow email                  │
│     - Audience (lists, segments)                                │
│     - Configure trigger (for workflow)                          │
│     - Design + personalize                                      │
│                            │                                    │
│                            ▼                                    │
│  2. PRE-SEND CHECKS                                             │
│     - Sender verified?                                          │
│     - Domain DKIM/SPF/DMARC?                                    │
│     - Audience valid?                                           │
│     - Plan limits OK?                                           │
│     - GDPR/DSGVO compliance footer                              │
│                            │                                    │
│                            ▼                                    │
│  3. SEND TIME                                                   │
│     - Send now                                                  │
│     - Schedule                                                  │
│     - Time-zone based                                           │
│     - THEA AI send time suggestions                             │
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
│  5. SMTP SEND from CleverReach EU infrastructure (Germany)      │
│     - DKIM signed                                               │
│     - SPF compliant                                             │
│     - DMARC aligned                                             │
│     - List-Unsubscribe RFC 8058                                 │
│     - **Made in Germany infrastructure**                        │
│                            │                                    │
│                            ▼                                    │
│  6. ISP RECEIVES                                                │
│     - **Strong DACH ISP relationships** (web.de, GMX, etc.)     │
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
│     - Click → CleverReach redirect → tracked                    │
│     - (No native site tracking on landing)                      │
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
│     - Real-time stats                                           │
│     - Revenue attribution (s e-commerce integration)            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. THEA Workflows execution

### 11.1 Workflow activation

```
Marketer builds THEA workflow
   ↓
Test mode (preview as contact)
   ↓
Activate
   ↓
CleverReach validation:
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
Event occurs (subscription, order, tag, birthday, atd.)
   ↓
CleverReach evaluates active workflows
   ↓
For each matching workflow:
- Check entry conditions
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
- Manually removed
```

### 11.4 Re-entry rules

```
Per workflow:
- Run once vs. multiple
- Minimum gap between re-entries
   ↓
Useful for:
- Welcome series: Run once
- Birthday: Yearly recurring
- Cart abandonment: Per cart event
```

### 11.5 Workflow analytics

```
Per workflow:
- Active subscribers
- Completed
- Goal achieved
- Per-step performance
- Drop-off analysis
- Revenue attributed (s e-commerce)
```

---

## 12. Forms flow

### 12.1 Form creation

```
Marketer / Designer: Forms → New / Neues Formular
   ↓
Type (limited per CleverReach):
- Standard embedded
- Basic pop-up (some setups)
   ↓
Configure:
- Fields (text, email, phone, dropdown, checkbox)
- **GDPR consent** (DSGVO required for DACH!)
- Captcha
- Submit button text
- Success message
   ↓
Trigger conditions (basic):
- Page load
- After X seconds
- Basic exit-intent (some setups)
   ↓
Design:
- Visual builder
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

### 12.2 Form deployment methods

```
A) Embed code (HTML/JS) – paste do website
B) Shopware plugin (DACH e-commerce!)
C) WordPress plugin → shortcode
D) Shopify integration (via app)
E) TYPO3 plugin → render
```

### 12.3 Submission flow

```
Visitor fills form
   ↓
Submit
   ↓
CleverReach receives:
- Validate fields
- Captcha check
- Duplicate email check
- **GDPR consent confirmation logged**
   ↓
Recipient created or updated:
- Add to specified list
- Apply tags
- Trigger workflow
- GDPR evidence created
   ↓
Status: Pending (double opt-in) OR Active
   ↓
If double opt-in (DACH standard):
   - Confirmation email sent
   - User clicks confirm
   - Status: Active
   ↓
Welcome workflow if configured
```

### 12.4 Form types limitations

Per EmailTooltester:
*"limited form types"*

⚠️ **Less variety** than competitors:
- No native exit-intent (advanced)
- No slider forms
- No sticky bar
- No floating forms
- Workarounds: Custom JS, third-party tools via Zapier

---

## 13. E-commerce integration flow (Shopware, Shopify)

### 13.1 Shopware integration (DACH KEY)

**Shopware = dominant German e-commerce platform**.

```
Shopware admin → Plugin Manager / App Store
   ↓
Search "CleverReach"
   ↓
Install CleverReach Connector
   ↓
Authorize:
- Shopware → CleverReach OAuth
- API credentials configured
   ↓
CleverReach configuration:
- Default list for new customers
- Sync historical data toggle
- Custom field mapping
- Tag rules (e.g., "Source: Shopware")
   ↓
Initial sync (hours pro large stores):
- Customers, orders, products
   ↓
[Integration live, real-time sync]
```

### 13.2 Shopify integration

```
Shopify admin → Apps → CleverReach
   ↓
OAuth authorization
   ↓
Configure:
- Default customer list
- Sync historical data
- Field mapping
- Tag rules
   ↓
Webhooks auto-subscribed
   ↓
Initial sync
   ↓
[Integration live]
```

### 13.3 WooCommerce / WordPress

```
WordPress admin → Plugins → CleverReach for WP
   ↓
Activate plugin
   ↓
Configure:
- API key
- Default list
- WooCommerce integration toggle
- Form embed shortcodes
   ↓
WooCommerce orders sync
   ↓
[Integration live]
```

### 13.4 What syncs

#### Customer data
- Email (primary)
- Name, last name
- Phone, address
- Marketing consent (transferred to CleverReach!)
- Registration date

#### Order data
- Order ID
- Date
- Status
- Total value (EUR primary)
- Items
- Shipping/payment method

#### Product data
- Product ID
- Name (multi-language for international shops)
- Category
- Price
- Image URL
- Description

### 13.5 Use cases enabled

- **Abandoned cart automation** (s integrations supporting it)
- **Post-purchase** sequences
- **VIP customer** segmentation (LTV-based)
- **Browse abandonment** (limited – no native tracking)
- **Replenishment** reminders
- **Revenue attribution**
- **Segment by order data**

### 13.6 Abandoned cart flow specific (s Shopware)

```
Customer adds to cart na Shopware
   ↓
Shopware tracks cart state
   ↓
After 30 min without checkout → cart abandoned event
   ↓
Webhook → CleverReach (depending on plugin capabilities)
   ↓
THEA workflow trigger: "Abandoned cart"
   ↓
Pre-built scenario:

Wait 1h
   ↓
Send Email 1:
- "Sie haben etwas im Warenkorb vergessen!"
- Dynamic cart contents (s integration)
- Direct checkout link
   ↓
Wait 24h
   ↓
Condition: Purchased?
   YES → Exit (success)
   NO → Send Email 2 (s discount)
   ↓
Exit
```

### 13.7 Revenue attribution

```
Email send recorded
   ↓
Recipient clicks link
   ↓
Lands on shop
   ↓
Conversion window (default 7 days):
   - If order placed → revenue attributed
   ↓
Reports show:
- Revenue per campaign
- Revenue per workflow
- ROI per channel
```

---

## 14. CMS integration flow (TYPO3, WordPress)

### 14.1 TYPO3 integration (DACH advantage)

**TYPO3 = popular German CMS** for enterprise.

```
TYPO3 admin → Extension Manager
   ↓
Install CleverReach extension
   ↓
Configure:
- API connection
- Form embed
- Subscriber management
- Default list
   ↓
[Integration live]
```

### 14.2 Contao integration (DACH)

Similar to TYPO3 – another popular German CMS.

```
Contao admin → Extensions → CleverReach
   ↓
Install + configure
   ↓
[Form embed + subscriber management]
```

### 14.3 WordPress plugin

```
WordPress admin → Plugins → CleverReach
   ↓
Activate plugin
   ↓
Configure:
- API key
- Default list
- WooCommerce toggle (if applicable)
   ↓
Form shortcodes available
   ↓
[Integration live]
```

### 14.4 CMS form embedding

```
Per CMS:
- Form shortcode (WordPress)
- Plugin (TYPO3, Contao)
- Custom HTML embed (any CMS)
   ↓
Forms render natively v site
   ↓
Submissions flow to CleverReach
```

### 14.5 No native website tracking

Per EmailTooltester critique:
*"no native website tracking"*

⚠️ **CleverReach NEMÁ native site tracking script** like:
- Klaviyo
- ActiveCampaign
- SmartEmailing

**Implications:**
- Less behavior-based automation
- Less personalization data
- Workarounds:
  - E-commerce integration provides some data
  - Manual API tracking events
  - Third-party analytics + Zapier

---

## 15. API & Zapier flow

### 15.1 API key creation

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

### 15.2 API request flow

```
External system:
   POST https://rest.cleverreach.com/v3/[endpoint]
   Headers:
     Authorization: Bearer {api_key}
   Body: { data }
   ↓
CleverReach:
- Validates auth
- Rate limit check
- Validates payload
   ↓
Response 200/201
   ↓
Action performed
```

### 15.3 API endpoints (typical)

| Resource | Operace |
|---|---|
| `/groups` | Lists management |
| `/receivers` | CRUD recipients |
| `/forms` | Forms management |
| `/mailings` | Campaigns |
| `/events` | Event tracking |
| `/reports` | Analytics |

### 15.4 Webhooks

- Subscriber events
- Campaign events
- Order events (e-commerce)
- Form submissions

### 15.5 Zapier integration (5000+ apps)

```
Zapier:
- CleverReach trigger options:
  - New subscriber
  - Unsubscribe
  - Campaign sent
  - Form submission
- CleverReach action options:
  - Add to list
  - Update recipient
  - Trigger automation
  - Send transactional
   ↓
Connect with 5 000+ apps
   ↓
Easy for non-technical users
```

### 15.6 Make (Integromat) alternative

- Available via Zapier-style approach
- Visual workflow builder
- More complex automation potential

---

## 16. THEA AI assistant flow

### 16.1 THEA capabilities

**CleverReach's AI marketing assistant.**

THEA helps with:
- Subject line optimization
- Send time recommendations
- Content suggestions
- Audience insights
- Performance prediction
- Workflow recommendations

### 16.2 THEA flow in campaign creation

```
User creates campaign
   ↓
After subject line entered:
- THEA analyzes:
  - Length, complexity
  - Engagement prediction
  - Spam risk
  - A/B test suggestions
   ↓
THEA provides feedback:
- "Subject line might perform better s emoji"
- "Consider shorter version"
- "Predicted open rate: X%"
   ↓
User can apply or ignore
```

### 16.3 THEA send time optimization

```
User schedules campaign
   ↓
THEA analyzes:
- Audience timezone
- Past engagement patterns
- Industry benchmarks
- Day-of-week patterns
   ↓
THEA recommends optimal send time
   ↓
User can accept or override
```

### 16.4 THEA workflow suggestions

```
User builds automation
   ↓
THEA suggests:
- Best trigger options
- Recommended wait times
- Conditional logic suggestions
- Goal definitions
   ↓
User incorporates THEA suggestions
```

### 16.5 THEA learning

- THEA learns from campaign results
- Per-account customization
- Improves over time s usage data

### 16.6 THEA limitations

- **Less sophisticated** than HubSpot Breeze, Klaviyo Marketing Agent
- **No autonomous AI agents** (vs. competitors v 2026)
- **Suggestions only** (not autonomous execution)
- **Primarily rule-based + ML**

---

## 17. Deliverability flow

### 17.1 "Made in Germany" infrastructure

```
Email send request:
   ↓
CleverReach EU infrastructure (Germany):
- Multi-IP pool selection
- Reputation-based routing
   ↓
Direct DACH ISP relationships:
- web.de
- GMX
- T-Online
- 1&1
- Major German ISPs
   ↓
Reputation-protected delivery
```

### 17.2 Authentication enforcement

```
Domain authentication mandatory:
- SPF (include for CleverReach)
- DKIM (CNAME records)
- DMARC (TXT record, policy recommended)
- Branded tracking domain (CNAME, recommended)
   ↓
CleverReach validates DNS
   ↓
Strong auth = better deliverability
```

### 17.3 DACH ISP excellence

- **CSA membership** likely (DACH industry standard)
- **Direct relationships** s German ISPs
- **CleverReach Made in Germany reputation**
- **DACH compliance expertise**

### 17.4 List hygiene

```
Continuous monitoring:
- Hard bounces → auto-suppression
- Soft bounces → tracking + retry
- Spam complaints → immediate suppression
- Inactive recipient detection
   ↓
Recommendations:
- Re-engage at-risk
- Suppress unrecoverable
- Maintain sender reputation
```

### 17.5 Gmail/Yahoo 2024+ compliance

- One-click unsubscribe (RFC 8058)
- DKIM + DMARC enforced
- Spam rate monitoring
- CleverReach handles compliance

---

## 18. GDPR/DSGVO compliance flow

### 18.1 EU hosting + Made in Germany

- **Servers v Germany** (primary)
- **DSGVO native compliance**
- **DPA available** electronically
- **German Datenschutzbeauftragter** (DPO) compliance

### 18.2 GDPR features

- **GDPR consent fields** v forms
- **Double opt-in default** (DACH standard)
- **Audit trail** per consent
- **Right to be Forgotten**
- **Data export** per subscriber (DSAR)
- **DPA available**

### 18.3 DSGVO leadership

```
Per kontakt CleverReach captures:
- Source (which form)
- Timestamp + IP
- Consent text version
- Purpose (marketing, transactional)
- Validity period
   ↓
GDPR/DSGVO-ready audit trail
   ↓
Audit-ready for German Datenschutzbehörden
```

### 18.4 Right to Be Forgotten

```
Recipient requests deletion
   ↓
Method A: Admin manual
Method B: API DELETE
Method C: Preference center self-service
   ↓
CleverReach:
- Removes personal data
- Anonymizes events
- Auto-suppression permanent
- Audit log entry
- Confirmation email (DSGVO compliant)
```

### 18.5 DSAR (Data Subject Access Request)

```
Recipient requests their data
   ↓
Admin: Generate GDPR export
   ↓
CleverReach produces:
- Profile data
- All events
- Consent records
- Communication history
   ↓
Provide within 30 days (DSGVO requirement)
```

### 18.6 Compliance certifications

- **GDPR/DSGVO compliant**
- **CAN-SPAM** (US)
- **CASL** (Canadian)
- **Likely ISO 27001** (typical for German ESPs)

### 18.7 Security features

- **2FA** (TOTP)
- **API key management**
- **Encryption** at rest + in transit
- **Role-based access** (granular!)
- **Audit logs**
- **EU data residency** guaranteed

---

## 19. Support & Webinar flow

### 19.1 Standard support flow

```
User has issue / question
   ↓
Options:
A) Knowledge Base (self-service)
B) Email ticket
C) Webinar Q&A
   ↓
Email ticket:
- Submit ticket via UI
- Multi-language support (DE, EN, FR, ES, IT, NL)
- Response typically within 24-48h (per reviews)
- Resolution-focused
```

### 19.2 Premium support flow

```
User upgrades to Premium Support add-on (~$27/month)
   ↓
Benefits:
- Faster response times
- Phone support
- Dedicated support contact
- Priority queue
   ↓
For complex issues
- Implementation help
- Custom workflows
- Migration assistance
```

### 19.3 Free webinars flow

```
CleverReach offers regular free webinars
   ↓
Topics:
- Email marketing basics
- DSGVO compliance
- Automation strategies
- THEA AI usage
- E-commerce integrations
- Industry best practices
   ↓
Language options: DE + EN
   ↓
Live + recorded
   ↓
Open to:
- Existing customers
- Prospects
- Free plan users
- General public
   ↓
Q&A session at end
```

### 19.4 Knowledge base

```
User: Help / Knowledge Base
   ↓
Searchable content:
- Getting started guides
- Feature documentation
- API reference
- Best practices
- Tutorials
- FAQs
   ↓
Multi-language (per platform language)
```

### 19.5 No live chat

Per EmailTooltester:
*"While there is no live chat assistance"*

⚠️ **No real-time chat** support – ticket/email only standard.

---

## 20. Datová mapa: co vidí kdo

| Data | Owner | Admin | Marketing | Designer | Viewer | Custom | Subscriber | API |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Account settings | ✅ | ✅ | ❌ | ❌ | ❌ | per role | ❌ | per scope |
| Billing | ✅ | ❌ | ❌ | ❌ | ❌ | per role | ❌ | per scope |
| User management | ✅ | ✅ | ❌ | ❌ | ❌ | per role | ❌ | per scope |
| Domains | ✅ | ✅ | ❌ | ❌ | ❌ | per role | ❌ | per scope |
| All recipients | ✅ | ✅ | ✅ | limited | view | per role | jen sebe | ✅ |
| Edit recipients | ✅ | ✅ | ✅ | ❌ | ❌ | per role | ❌ | ✅ |
| Export recipients | ✅ | ✅ | per role | ❌ | ❌ | per role | request | per scope |
| Lists | ✅ | ✅ | ✅ | ❌ | view | per role | – | ✅ |
| Segments | ✅ | ✅ | ✅ | ❌ | view | per role | – | ✅ |
| Tags | ✅ | ✅ | ✅ | ❌ | view | per role | – | ✅ |
| Campaigns | ✅ | ✅ | ✅ | ✅ | view | per role | jen co dostal | ✅ |
| Send campaigns | ✅ | ✅ | ✅ | ❌ | ❌ | per role | ❌ | ✅ |
| THEA Workflows | ✅ | ✅ | ✅ | ❌ | view | per role | ❌ | ✅ |
| THEA AI suggestions | ✅ | ✅ | ✅ | view | view | per role | – | per scope |
| Templates | ✅ | ✅ | ✅ | ✅ | view | per role | – | ✅ |
| Brand kit | ✅ | ✅ | ✅ | ✅ | view | per role | – | per scope |
| Forms / Sign-ups | ✅ | ✅ | ✅ | ✅ | view | per role | submit | per scope |
| Reports | ✅ | ✅ | ✅ | view | ✅ | per role | ❌ | ✅ |
| Integrations | ✅ | ✅ | per role | ❌ | ❌ | per role | – | per scope |
| API keys | ✅ | ✅ | ❌ | ❌ | ❌ | per role | ❌ | – |
| GDPR delete | ✅ | ✅ | per role | ❌ | ❌ | per role | request | per scope |
| Webinar access | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | – | – |

---

## 21. Známé úzkoprofilové místa

### 21.1 Pricing tier gaps

Per Capterra:
*"The pricing tiers jump from free, to €15 per month, to €41.25 per month and then an high volume option for €495 per month, which does not seem to make much sense."*

⚠️ **Significant gaps** between tiers feel unnatural.

### 21.2 No live chat support

Per EmailTooltester:
*"While there is no live chat assistance"*

⚠️ Email/ticket only.

### 21.3 Limited form types

Per EmailTooltester:
*"limited form types"*

⚠️ Fewer form options vs. competitors:
- No native exit-intent
- No slider
- No sticky bar
- No floating
- No advanced popup

### 21.4 No native website tracking

Per EmailTooltester:
*"no native website tracking"*

⚠️ Critical gap:
- Less behavior-based automation
- Less personalization data
- Workarounds required

### 21.5 Premium features add-ons

Per EmailTooltester:
*"Some features require paid add-ons or manual setup."*

- Premium support ($27/month)
- Manual configuration sometimes required

### 21.6 No autonomous AI agents

- **THEA AI** is helpful but rule-based + ML
- **No autonomous agents** v 2026 (vs. Klaviyo, HubSpot)
- AI roadmap evolving

### 21.7 No CEE language support

- **6 UI languages** but no:
  - Czech
  - Slovak
  - Polish
  - Hungarian
- **CEE region adoption limited**

### 21.8 Less automation depth

- Less sophisticated than ActiveCampaign / Klaviyo
- No multi-trigger workflows
- No conditional content advanced
- No predictive sending AI

### 21.9 No webinars / courses native (ironic given they host webinars!)

- CleverReach hosts free webinars but:
- **No built-in webinar hosting** for customers (vs. GetResponse)
- **No online courses** built-in
- **No paid newsletters**
- **No digital products** sale

### 21.10 No deep CRM

- No deals/pipelines
- Contact-centric
- B2B sales features limited

### 21.11 Less DTC-focused vs. Klaviyo

- Less polished Shopify integration
- Fewer DTC features
- Less predictive AI

### 21.12 Less enterprise vs. SAP Emarsys / Inxmail

- Less enterprise scale
- Less customization options pro large brands
- Less Gartner positioning

### 21.13 Migration challenges

- Workflows non-exportable
- Templates rebuild required
- Custom integrations re-built

### 21.14 Mobile experience

- Mobile app limited
- Most operations on desktop

### 21.15 Reporting customization

- Less customizable dashboards
- Some metrics limited export
- Premium features for advanced

---

## 22. Doporučení pro design vlastních procesů

Pokud CleverReach používáte v týmu, doporučujeme:

1. **Domain authentication day 1** – DKIM + SPF + DMARC + branded tracking
2. **Brand kit setup early** – consistency
3. **Multi-user team setup early** – využít unlimited users at no extra cost!
4. **Granular permissions** – plan per role carefully
5. **GDPR consent fields** – DSGVO required for DACH
6. **Double opt-in default** – DACH standard, better deliverability
7. **Custom field strategy** – plan upfront
8. **Tag taxonomy** – flat structure
9. **Shopware integration** (pokud DACH e-shop) – plně využít
10. **Shopify integration** (pokud applicable) – setup early
11. **TYPO3/Contao plugin** pokud CMS používáte
12. **Pre-built scenarios** – start s welcome series + abandoned cart
13. **THEA AI** – využívat suggestions for optimization
14. **Free webinar attendance** – ongoing learning
15. **Test profile dedicated** pro QA
16. **A/B testing culture** – subject lines, content, timing
17. **List cleanup pravidelný** – inactive subscribers
18. **No native site tracking workaround** – e-commerce integration nebo manual API events
19. **Zapier pro custom workflows** – beyond native integrations
20. **Backup strategy** – periodic export contacts + templates
21. **DACH deliverability monitoring** – web.de, GMX, T-Online primary
22. **Migration plan** – if scaling beyond CleverReach
23. **Premium support** – worth $27/month for complex setups

---

*Dokument zpracován z oficiálních zdrojů cleverreach.com a praktických zdrojů (Capterra, GetApp, Research.com, EmailTooltester, SaaSworthy, Techjockey, ITQlick). Pro nejaktuálnější detaily je nutný engagement s CleverReach support teamem.*
