# rapidmail – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v rapidmail prochází data, lidé a akce – od free signupu / pay-per-mail credit purchase, přes basic Autoresponders, e-commerce integrace (limited), až po koncového subscribera. Speciální focus na pay-per-mail flow (unikátní v industry).

> Tento dokument doplňuje `29_rapidmail_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** rapidmail umí, tento popisuje, **kdo s tím interaguje a jak data tečou**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
> - **Německý produkt z Freiburgu im Breisgau (Schwarzwald, založeno 2008)** – jeden z dlouhodobých DACH SMB hráčů
> - **"Made in Germany"** core branding – servery EXCLUSIVELY v Německu
> - **CSA-certified** (whitelisted by GMX, web.de, T-Online)
> - **UNIKÁTNÍ pay-per-mail model** + Subscription model option
> - **Free phone support v němčině** s **~9 min průměrná response**!
> - **Filozofie "Weniger ist mehr"** (Less is more) – záměrně omezené features
> - **3 jazyky UI** (EN, DE, FR) – limited international
> - **DSGVO native compliance** (German jurisdiction guaranteed)
> - **No API** – limit pro developer integrations
> - **250+ templates + 1.5M+ free images**
> - **Multiple form types** (klassisch, popup, exit-intent)
> - **80K-200K customers** (varies per source)
> - **Pro Versand option:** 1 user only, **Subscription options:** more users
> - **Self-serve sign-up** s free tier (10 recipients)

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Sign-up flow (self-serve)](#2-signup-flow)
3. [Pay-per-Mail flow (UNIKÁTNÍ!)](#3-pay-per-mail-flow)
4. [Subscription flow (Starter / Premium / Unlimited)](#4-subscription-flow)
5. [Onboarding flow](#5-onboarding-flow)
6. [User roles & permissions (limited)](#6-user-roles)
7. [Account Owner flow](#7-account-owner-flow)
8. [Marketing user flow](#8-marketing-user-flow)
9. [Recipient lifecycle](#9-recipient-lifecycle)
10. [Email lifecycle (CSA-certified flow)](#10-email-lifecycle)
11. [Basic automation execution (Autoresponders)](#11-automation-execution)
12. [Forms flow (multiple types)](#12-forms-flow)
13. [Limited e-commerce integration flow](#13-ecommerce-flow)
14. [Display test + Spam test flow](#14-test-flow)
15. [Pre-send checks flow](#15-pre-send-flow)
16. [Phone support flow (UNIKÁTNÍ pro SaaS)](#16-phone-support-flow)
17. [No API – workaround flow (Zapier, plugins)](#17-no-api-flow)
18. [Transactional add-on flow](#18-transactional-flow)
19. [Deliverability flow (CSA + Made in Germany)](#19-deliverability-flow)
20. [DSGVO compliance flow](#20-dsgvo-flow)
21. [Datová mapa: co vidí kdo](#21-datová-mapa)
22. [Známé úzkoprofilové místa](#22-úzkoprofilové-místa)

---

## 1. Mapa všech aktérů

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│         RAPIDMAIL PLATFORM ECOSYSTEM                               │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [rapidmail Internal Team (Freiburg, Germany)]                     │
│   ├─ Customer Support (German native, EN, FR)                      │
│   ├─ Phone Support team (free for ALL plans!)                      │
│   ├─ Live Chat team                                                │
│   ├─ Technical Support                                             │
│   ├─ Migration assistance                                          │
│   ├─ Deliverability team (CSA membership)                          │
│   ├─ Sales (DACH primary)                                          │
│   ├─ Compliance team (DSGVO leadership)                            │
│   └─ Account / billing team                                        │
│           │ (~9 min average response time!!!)                      │
│           ▼                                                        │
│                                                                    │
│   ┌──────────────────────────────────────────┐                     │
│   │   rapidmail Account                      │                     │
│   │                                          │                     │
│   │   USER ROLES (limited):                  │                     │
│   │   ├─ Account Owner (1)                   │◄── full access     │
│   │   ├─ Additional users (per plan limit)   │◄── per role         │
│   │                                          │                     │
│   │   USER LIMITS PER PLAN:                  │                     │
│   │   - Pro Versand: 1 user only             │                     │
│   │   - Starter: 1-2 users                   │                     │
│   │   - Premium / Performance: more users    │                     │
│   │   - Unlimited: unlimited users           │                     │
│   │                                          │                     │
│   │   ⚠️ Limited multi-user vs. CleverReach   │                     │
│   └──────────────┬───────────────────────────┘                     │
│                  │                                                 │
│                  ▼                                                 │
│   [Recipients / Subscribers]                                       │
│       │                                                            │
│       ├─→ marketing newsletter emails                              │
│       ├─→ basic automation emails (welcome, birthday)              │
│       ├─→ transactional emails (add-on)                            │
│       ├─→ form submissions                                         │
│       └─→ preference management                                    │
│                  │                                                 │
│                  ▼                                                 │
│   [Limited Integrations]                                           │
│   ┌──────────────────────────────────────────┐                     │
│   │   E-commerce:                            │                     │
│   │   - Shopify (basic)                      │                     │
│   │   - WooCommerce (WP plugin)              │                     │
│   │   - Magento (limited)                    │                     │
│   │   - Shopware (limited)                   │                     │
│   │                                          │                     │
│   │   CMS:                                   │                     │
│   │   - WordPress (plugin)                   │                     │
│   │                                          │                     │
│   │   iPaaS:                                 │                     │
│   │   - Zapier (limited functionality)       │                     │
│   │                                          │                     │
│   │   ⚠️ NO PUBLIC API!                       │                     │
│   │   Custom integration via:                │                     │
│   │   - Zapier                               │                     │
│   │   - WordPress plugin                     │                     │
│   │   - CSV import/export                    │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
│   [Made in Germany Infrastructure]                                 │
│   ┌──────────────────────────────────────────┐                     │
│   │   Servers EXCLUSIVELY v Německu          │                     │
│   │   - Freiburg-based                       │                     │
│   │   - NO US subprocessors                  │                     │
│   │   - NO cross-border transfers            │                     │
│   │   - German jurisdiction guaranteed       │                     │
│   │                                          │                     │
│   │   CSA-certified sender                   │                     │
│   │   - Whitelisted by major DE ISPs:        │                     │
│   │     GMX, web.de, T-Online, 1&1           │                     │
│   │                                          │                     │
│   │   Dedicated IP pools (DACH market)       │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér | Vstupní bod | Co dělá | Co vidí |
|---|---|---|---|
| **Account Owner** | Self-serve sign-up | Full + billing + users | Vše |
| **Additional user** | Pozvánka od Owner | Per role permissions | Per role |
| **Recipient / Subscriber** | Form, integration | Receives newsletters | Své emaily |
| **Pay-per-mail credit holder** | Purchase credits | Send within credit | Send dashboard |
| **Subscription plan user** | Monthly subscription | Unlimited sends within plan | Standard access |
| **WordPress plugin user** | WP plugin install | Form embed + tracking | Via WP |
| **Shopify integration** | App install | Limited sync | Per integration scope |
| **rapidmail Support** | Phone / Email / Chat | Issue resolution | Read s consent |
| **rapidmail Sales** | Inquiry / contact | Enterprise inquiries | Read s consent |
| **CSA / ISP** | Sender reputation | Whitelisting | Per agreement |

---

## 2. Sign-up flow (self-serve)

rapidmail má **self-serve sign-up** – low friction onboarding.

### 2.1 Sign-up flow

```
Visit rapidmail.com / rapidmail.de
   ↓
"Jetzt kostenlos testen" / "Free trial"
   ↓
Sign-up form:
- Email
- Password
- Company name (Firma)
- Country (default DE)
- Language preference (3 options: DE, EN, FR)
   ↓
**No credit card required**
   ↓
Email verification (Bestätigungsmail)
   ↓
Account created:
- **Free tier: 10 recipients always free**
- All core features available for testing
- Phone support immediately active!
   ↓
First login → dashboard
```

### 2.2 Free tier limits

Per Trusted:
> *"Versendungen an bis zu maximal 10 Empfänger:innen sind immer kostenlos."*

- **10 recipients FREE always**
- Test campaigns
- All UI features
- Cannot send to >10 unless upgrade

### 2.3 First send free up to 2 000

Per Trusted:
> *"der erste Versand an bis zu 2.000 Empfänger:innen ist gratis"*

**One-time bonus:**
- **First send FREE** up to **2 000 recipients**
- Trial run rapidmail full experience
- No credit card

### 2.4 Plan selection

After free tier or first send:

```
User exceeds free tier limits
   ↓
Plan selection screen:
A) Pro Versand (Pay-per-Mail) – UNIKÁTNÍ
B) Starter (€9-15/měsíc subscription)
C) Premium / Performance (€25-29+/měsíc)
D) Unlimited / Enterprise (custom)
   ↓
Recommendation based on usage pattern:
- Send 1-12x/year → Pro Versand (Pay-per-Mail)
- Send weekly+ → Subscription tiers
```

### 2.5 DACH-friendly billing

- **rapidmail GmbH invoicing** (German company)
- **VAT/MwSt compliance**
- **Bank transfer** (SEPA Überweisung)
- **Credit card**
- **EUR pricing primary**
- **Monatlich kündbar** (monthly cancellation)
- **Annual subscriptions** s discount

### 2.6 Migration from competitors

```
rapidmail migration support:
- From Mailchimp (most common)
- From CleverReach
- From Newsletter2Go (acquired)
- From Brevo
- From custom platforms
   ↓
Migration steps:
- Recipients export → rapidmail import (CSV)
- GDPR consent confirmation required
- Field mapping
- Templates recreation (rebuild required)
- Form embedding update
- Basic automation recreation
   ↓
Free support assistance v němčině
```

---

## 3. Pay-per-Mail flow (UNIKÁTNÍ!)

**rapidmail's defining differentiator.** No competitor offers comparable model.

### 3.1 Pay-per-Mail principle

Per EuropeanStack:
> *"pay-as-you-go option requires no subscription: you purchase mailing credits, with pricing starting from EUR 16 per mailing for up to 250 recipients. Credits remain valid for 12 months."*

```
**Per send pricing model:**
- No monthly subscription
- Buy credits when you need
- Use within 12 months
- Pay only for actual sends
- Cancel anytime (no commitment)
```

### 3.2 Pay-per-Mail credit purchase flow

```
User wants to send newsletter
   ↓
Login → Account
   ↓
Tarif: Pro Versand active
   ↓
Calculate credits needed:
- 250 recipients = €16 per send (typical entry)
- 500 recipients = ~€25-30
- 1000 recipients = ~€40-50
- 2500 recipients = ~€80-100
- 5000 recipients = ~€150-200
- 10 000 recipients = ~€300+
   ↓
Purchase credits:
- Credit card OR
- Bank transfer (Überweisung)
- Invoice (Rechnung pro Firmen)
   ↓
Credits added to account
   ↓
**Credits valid 12 months from purchase**
   ↓
[Ready to send]
```

### 3.3 Send flow s Pay-per-Mail

```
User: Newsletter → Create campaign
   ↓
Build campaign normally
   ↓
At send time:
- rapidmail calculates exact cost based on recipient count
- Deducts credits from balance
- If insufficient credits → prompt to buy more
   ↓
Send executed
   ↓
Credits balance updated
   ↓
Confirmation email s breakdown
```

### 3.4 When Pay-per-Mail makes sense

Per EuropeanStack:
> *"For businesses sending fewer than 12 newsletters per year, this is dramatically cheaper than any subscription-based competitor."*

**Optimal pro:**
- **Occasional senders** (1-12 newsletters/year)
- **Seasonal businesses** (Christmas peaks, January quiet)
- **Yoga studios** (monthly class schedules)
- **Associations** (quarterly updates)
- **Accountancy firms** (quarterly newsletters)
- **Restaurants** (special event invites)
- **Local businesses** s small lists

### 3.5 Pay-per-Mail example calculation

Per Business.digital example:
> *"Ein Handwerksbetrieb verschickt viermal im Jahr einen Saisonalnewsletter an 800 Kunden. Mit rapidmail wird der Newsletter im Drag-and-Drop-Editor in einer Stunde erstellt, geprüft und versendet. Kosten: Pay-per-Mail, unter €5 für 800 Empfänger. Kein Monatsbeitrag zwischen den Versänden."*

**Example: Handwerksbetrieb (craftsman business):**
- 4 newsletters/year
- 800 recipients
- Pay-per-Mail cost: **~€5 per send** (per Business.digital, smaller volume)
- **Annual cost: €20** (versus subscription €180+)
- **Saves 80-90%** vs. subscription model!

### 3.6 Credits validity 12 months

```
Credits purchased: January 2026
   ↓
Validity: until January 2027
   ↓
If not used by validity:
- Credits expire
- Re-purchase needed
   ↓
Best practice:
- Buy credits as needed
- Don't over-stockpile
- Track expiration dates
```

### 3.7 Pro Versand tier limitations

Per Trusted:
- **1 user only**
- **3 automated mailings max**
- **Basic features**
- **No A/B testing**
- **Limited segmentation**
- **No advanced features**

### 3.8 Upgrade from Pay-per-Mail

```
User outgrows Pay-per-Mail (frequent sending)
   ↓
Calculate cost comparison:
- Current monthly Pay-per-Mail cost
- vs. Subscription tier cost
   ↓
Threshold:
- If sending 4+ times/month → Subscription likely cheaper
   ↓
Upgrade to Starter / Premium / Unlimited
   ↓
Unused Pay-per-Mail credits often convertible (check with support)
```

---

## 4. Subscription flow (Starter / Premium / Unlimited)

### 4.1 Subscription model overview

Per oficiální + EuropeanStack:
- **Starter:** €9-15/měsíc
- **Premium / Performance:** €25-29/měsíc
- **Unlimited:** Custom

Features:
- **Unlimited mailings** within plan
- **Monthly cancellation** (monatlich kündbar)
- **Annual discount** available
- **Predictable costs**

### 4.2 Starter tier flow

```
User selects Starter
   ↓
Configure:
- 250-500 recipients typical entry
- Monthly billing (€9-15/měsíc)
- Annual option (10% off)
   ↓
Account upgraded
   ↓
Features active:
- Unlimited monthly mailings
- Basic automation
- Email support
- Phone support FREE
- Standard segmentation
- Templates (250+)
- Forms (limited count)
- No A/B testing
   ↓
[Subscription active]
```

### 4.3 Premium / Performance tier

```
User selects Premium / Performance
   ↓
Configure:
- 1 000+ recipients
- €25-29/měsíc base
- Annual option
   ↓
Account upgraded
   ↓
Features active (beyond Starter):
- A/B testing ✅
- Versandzeitpunkt terminieren (advanced scheduling)
- Multiple users
- 1-Click-Design (auto-template from website)
- Erweiterte Statistiken (advanced statistics)
- Erweiterte Segmentierungen
- Priority support
- More automation
   ↓
[Subscription active]
```

### 4.4 Unlimited tier

```
User selects Unlimited
   ↓
Configure (via sales contact):
- Unlimited automation
- Unlimited forms
- Unlimited recipient lists
- Unlimited sender addresses
- Unlimited users
- 5 mailing attachments
- Dedicated IP (some configurations)
- Custom contract
   ↓
[Premium service active]
```

### 4.5 Plan comparison decision flow

```
User assesses needs:
- How many recipients?
- How often sending?
- Need A/B testing?
- Need multiple users?
- Need advanced automation?
   ↓
Decision matrix:
- < 250 recipients, occasional → Free or Pay-per-Mail
- 250-1000 recipients, regular → Starter
- 1000+ recipients, A/B + automation → Premium / Performance
- Complex needs → Unlimited
   ↓
Self-serve upgrade OR contact sales
```

### 4.6 Annual vs. monthly billing

```
Monthly:
- More flexibility
- Higher per-month cost
- Easier to cancel

Annual:
- 10% discount typically
- 12-month commitment
- Better cash flow planning
```

---

## 5. Onboarding flow

### 5.1 First-time setup

```
Day 1:
- Email verification
- Sender details setup (Absender)
- Domain authentication (rapidmail handles SPF/DKIM/DMARC)
- Brand setup (colors, fonts, logo)
- First test send (free up to 2000 recipients!)

Day 2-3:
- Recipient import (CSV)
- GDPR consent confirmation
- First list creation
- First sign-up form

Day 4-7:
- First campaign sent
- Basic automation (welcome email)
- Phone support consultation (free!)

Day 7-14:
- Plan decision (Pro Versand vs. Subscription)
- A/B testing exploration (Premium+)
- Knowledge base / tutorial review
```

### 5.2 DACH-specific onboarding

```
For DACH businesses (90%+ of customers):
- Domain registration verify (.de / .at / .ch)
- EUR billing setup
- Rechnung (invoice) configuration
- MwSt (VAT) compliance
- DSGVO-compliant settings (double opt-in default!)
- Auftragsverarbeitungsvertrag (DPA) signed
   ↓
German support team available immediately
- Free phone calls
- Live chat
- Email/ticket
- Knowledge base v němčině
```

### 5.3 Domain authentication

```
rapidmail handles automatically (per EuropeanStack):
"The platform handles SPF, DKIM, and DMARC configuration"
   ↓
For custom domain (recommended):
- Sender verification (email confirmation)
- Optional: rapidmail-managed domain
- Optional: dedicated IP (higher tiers)
   ↓
[Authentication complete]
   ↓
Better DACH deliverability
```

### 5.4 Phone onboarding (UNIKÁTNÍ)

```
New user wants help
   ↓
Call rapidmail support (free!)
   ↓
~9 min response (per European Purpose)
   ↓
Native German support team
   ↓
Help with:
- Initial setup
- Template design
- Strategy
- DSGVO questions
- Deliverability
   ↓
[No-cost onboarding consultation]
```

### 5.5 Tutorial + knowledge base

```
rapidmail Support hub:
- Getting started guides (DE primary)
- Video tutorials
- Webinars (occasional)
- API documentation (limited, since no API)
- Best practices
- DSGVO compliance guides
   ↓
Multi-language (DE > EN > FR)
   ↓
Self-service learning
```

### 5.6 Migration support

```
For users migrating from competitors:
- Mailchimp, CleverReach, Newsletter2Go common
   ↓
rapidmail migration steps:
- CSV recipient export → import
- Templates rebuild required (rapidmail tools)
- Forms re-embed
- Automation re-create
- Domain authentication
   ↓
Free phone support throughout
- Native German assistance
- Strategy consultation
```

---

## 6. User roles & permissions (limited)

⚠️ rapidmail's multi-user support **is limited** compared to CleverReach's "unlimited users at no extra cost".

### 6.1 User roles (typical)

#### Account Owner
- **Highest tier** access
- **Created during sign-up**
- Full administrative control
- Billing access
- Manages users
- Account settings
- Close account

#### Additional users (per plan)
- **Limited count per plan**
- Various permission levels (basic)
- Per role permissions

### 6.2 Per plan user limits

| Plan | User limit |
|---|---|
| **Free / Pro Versand** | 1 user only |
| **Starter** | 1-2 users typically |
| **Premium / Performance** | More users |
| **Unlimited** | Unlimited users |

### 6.3 User invitation flow

```
Owner: Settings → Benutzer / Users
   ↓
+ Add user
   ↓
Configure:
- Email
- Name
- Role / permissions (basic)
   ↓
Send invitation
   ↓
User receives email
   ↓
User activates + sets password
   ↓
[Active user per assigned permissions]
```

### 6.4 Permission categories (basic)

- Account settings access
- Recipient management (view/edit)
- Campaign creation
- Campaign sending
- Reports access
- Forms management
- (Less granular than CleverReach)

### 6.5 Multi-user limitations

⚠️ vs. CleverReach which has **unlimited users at no extra cost**:
- rapidmail charges per plan tier
- Limited granularity of permissions
- Less flexibility pro agencies

For agency use cases: **CleverReach may be better choice**.

### 6.6 No SSO/SAML

- **No SSO/SAML**
- **2FA** (TOTP) available
- **Standard email/password**

---

## 7. Account Owner flow

### 7.1 Owner responsibilities

```
Account Owner = highest tier
   ↓
Created during sign-up
   ↓
Manages:
- Billing + payment (Pay-per-Mail credits OR subscription)
- Plan changes
- User management
- Account settings
- Recipient lists
- All campaigns
- All automation
```

### 7.2 Daily Owner workflow

```
Login → Dashboard
   ↓
Account overview:
- Recent campaign performance
- Credit balance (Pay-per-Mail)
- Subscription status
- Recipient count
- Bounce rates
- Form submissions
   ↓
Activities:
- Plan management
- Team management
- Billing oversight
```

### 7.3 Billing management

#### Pay-per-Mail flow
```
Owner: Account → Credits
   ↓
View:
- Current credit balance
- Credit expiration dates
- Recent purchases
- Send history (cost per campaign)
   ↓
Actions:
- Buy more credits
- View invoices (Rechnungen)
- Update payment method
- Track credit usage
```

#### Subscription flow
```
Owner: Account → Tarif
   ↓
View:
- Current plan
- Recipient count vs. limit
- Next billing date
- Invoice history
   ↓
Actions:
- Upgrade / Downgrade plan
- Switch from Pay-per-Mail to Subscription
- Update payment method
- Cancel subscription (monatlich kündbar)
- Annual switch (10% discount)
```

### 7.4 Close account / cancel

```
Owner: Account → Konto schließen
   ↓
Confirmation
   ↓
If subscription: cancel at end of period
If Pay-per-Mail: credits forfeit (or use within validity)
   ↓
Data retention period (per GDPR)
   ↓
Final deletion
```

---

## 8. Marketing user flow

### 8.1 Daily Marketing workflow

```
Login → Dashboard (per permissions)
   ↓
Activities:
- Create / send campaigns
- Build basic automation
- Manage recipient lists
- Update templates
- Review reports
- A/B testing (Premium+)
- Manage forms
```

### 8.2 Create campaign

```
Newsletter → Neuer Newsletter / New campaign
   ↓
Step 1: Setup
- Campaign name (interne Bezeichnung)
- Subject line (Betreff) + Personalisierung
- Sender (Absender, verified)
- Reply-to (Antwort-Adresse)
   ↓
Step 2: Recipients (Empfänger)
- Select lists / segments
- Exclusion options
   ↓
Step 3: Design
- Drag-drop editor
- Template library (250+)
- 1.5M+ images library
- Custom HTML option
- 1-Click-Design (Performance+)
   ↓
Step 4: Tests
- **Display test** (multi-device preview)
- **Spam test** (Vorab-Spam-Test)
- **Deliverability test**
- Send test email
   ↓
Step 5: Send / Schedule
- Versand ab sofort (Send now)
- Versandterminierung (Schedule, Performance+)
   ↓
Confirmation
   ↓
**Credit deduction (Pay-per-Mail) OR
 included in subscription**
```

### 8.3 Build automation (basic)

```
Automation → Neue Automation / New automation
   ↓
A) Pre-built template:
   - Welcome series
   - Birthday automation
   - Anniversary
   - Simple drip
B) Custom (limited):
   - Trigger (subscribed, tag added, date)
   - Action (send email, wait, basic condition)
   ↓
Configure each step
   ↓
Test mode
   ↓
Activate
   ↓
[Basic automation live]
```

### 8.4 Segment building

```
Recipients → Segments → New
   ↓
Configure conditions (basic to advanced per tier):
- Contact attributes
- Email engagement
- Subscription source
- Date conditions
- Custom fields
   ↓
Combine s AND/OR/NOT
   ↓
Save
   ↓
[Segment available]
```

### 8.5 Form creation

```
Forms → Neues Formular / New form
   ↓
Type:
- Klassische Anmeldebox (embedded)
- Pop-up
- Exit-Intent-Layer
- Slider (some setups)
   ↓
Configure:
- Fields (text, email, phone, dropdown, checkbox)
- **GDPR consent** (DSGVO required!)
- **Double opt-in default ON** (pre-configured!)
- Captcha
- Style
   ↓
Design content
   ↓
Connect:
- Default list
- Tags on submit
- Automation trigger
   ↓
Publish
   ↓
Embed code OR WordPress plugin
```

### 8.6 Template work

```
Templates → Neue Vorlage / New template
   ↓
Choose:
- Start blank
- From library (250+)
- 1-Click-Design (auto-generate from website, Performance+)
- Duplicate existing
   ↓
Drag-drop builder:
- Add blocks
- Apply brand colors / fonts
- Insert images (1.5M+ library)
- Personalization tokens
- Custom HTML if needed
   ↓
Save template
   ↓
[Available pro campaigns]
```

---

## 9. Recipient lifecycle

### 9.1 Recipient creation paths

#### A) Form submission
```
Visitor fills rapidmail form
- Klassische Anmeldebox
- Popup
- Exit-intent
- Slider
   ↓
Submit
   ↓
rapidmail:
- Validates email
- Duplicate check
- Captcha verification
- **GDPR consent recorded** (DSGVO!)
   ↓
Status: Pending (double opt-in default - pre-configured!)
   ↓
Confirmation email sent (Bestätigungsmail)
   ↓
Recipient clicks confirm
   ↓
Status: Active
   ↓
Add to list(s)
   ↓
Tag if configured
   ↓
Welcome automation triggers (if active)
```

#### B) Double opt-in flow (DACH standard)

Per EU Picks:
> *"Double-Opt-in ist standardmäßig aktiviert (nicht in den Einstellungen versteckt)."*

```
Form submission
   ↓
Status: Pending
   ↓
rapidmail sends Bestätigungsmail
   ↓
Recipient clicks confirm link
   ↓
IP + timestamp + user agent logged
   ↓
**GDPR/DSGVO audit trail complete**
   ↓
Status: Active
   ↓
Welcome workflow triggers
```

#### C) Manual import (CSV)
```
Admin: Empfänger → Import
   ↓
CSV upload OR copy-paste
   ↓
Field mapping (Felder zuordnen)
   ↓
Choose:
- List destination
- Skip duplicates
- Update existing
   ↓
**Mandatory GDPR consent confirmation:**
- Confirm source
- Confirm purpose
- Confirm consent collection method
   ↓
Validation processed
   ↓
Import completed
   ↓
[Recipients in account]
```

#### D) E-commerce integration sync (limited)
```
Shopify / WooCommerce customer
   ↓
rapidmail integration captures email
   ↓
Add to designated list
   ↓
GDPR consent flag transferred
   ↓
Welcome automation if active
```

#### E) No API option
⚠️ rapidmail nemá API, takže nelze:
- Programmatically add recipients (vyjma CSV / Zapier / plugin)
- Custom system integration directly

Workarounds:
- **Zapier** (limited)
- **WordPress plugin**
- **Manual CSV import**

### 9.2 Recipient status

```
[Pending] (double opt-in default - DACH standard)
   ↓
[Active] ← can receive
   ↓
Transitions:
- Unsubscribed (Abmeldung)
- Bounced (Bounce-Management automatic)
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
```

### 9.4 Preference center

```
Email footer: "Abmelden" / "Newsletter-Einstellungen"
   ↓
rapidmail-hosted preference page (DE/EN/FR)
   ↓
Recipient sees:
- Subscribed lists (toggles)
- Personal info (editable)
- Master unsubscribe
- GDPR rights
   ↓
Update
   ↓
Profile updated
```

### 9.5 Unsubscribe

```
Recipient clicks Abmelden
   ↓
rapidmail-hosted page
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
Data retained per GDPR
```

### 9.6 Bounce handling

Per Software Advice:
*"automatic bounce management, unsubscribing options, subscription notices, blacklists, recipient segmentation"*

#### Hard bounce
```
ISP 5xx response
   ↓
rapidmail Bounce-Management:
- Automatic detection
- Status: Bounced
- Auto-suppression
- Reputation tracking
```

#### Soft bounce
```
ISP 4xx response
   ↓
rapidmail retries
   ↓
If persistent → mark as bounced
```

#### Spam complaint
```
ISP FBL → rapidmail
   ↓
Automatic suppression
   ↓
**CSA membership compliance** maintained
```

### 9.7 GDPR delete (Right to Be Forgotten)

```
Recipient requests deletion (per DSGVO)
   ↓
Method A: Admin → recipient → Delete
Method B: Preference center self-service
Method C: Phone request (rapidmail support)
   ↓
rapidmail:
- Removes personal data
- Anonymizes events
- Auto-suppression
- Audit log
- Confirmation email (DSGVO compliant)
```

---

## 10. Email lifecycle (CSA-certified flow)

```
┌─────────────────────────────────────────────────────────────────┐
│  1. USER drafts campaign                                        │
│     - Audience (lists, segments)                                │
│     - Design + personalize                                      │
│                            │                                    │
│                            ▼                                    │
│  2. PRE-SEND CHECKS                                             │
│     - Sender verified?                                          │
│     - Domain DKIM/SPF/DMARC? (rapidmail handles!)               │
│     - Audience valid?                                           │
│     - Credit balance OK? (Pay-per-Mail)                         │
│     - Plan limits OK? (Subscription)                            │
│     - DSGVO compliance footer (legally required)                │
│     - **Display test** completed?                               │
│     - **Spam test** passed?                                     │
│     - **Deliverability test** passed?                           │
│                            │                                    │
│                            ▼                                    │
│  3. SEND TIME                                                   │
│     - Versand ab sofort (Send now)                              │
│     - Versandterminierung (Schedule)                            │
│                            │                                    │
│                            ▼                                    │
│  4. PER-RECIPIENT GENERATION                                    │
│     - Personalization tokens resolved                           │
│     - Dynamic content evaluated (basic)                         │
│     - Tracking pixels embedded                                  │
│     - Click trackers wrapped                                    │
│                            │                                    │
│                            ▼                                    │
│  5. SMTP SEND from RAPIDMAIL GERMANY INFRASTRUCTURE             │
│     - **Servers EXCLUSIVELY v Německu (Freiburg)**              │
│     - **CSA-whitelisted infrastructure**                        │
│     - Dedicated IP pools (DACH market)                          │
│     - DKIM signed                                               │
│     - SPF compliant                                             │
│     - DMARC aligned                                             │
│     - List-Unsubscribe RFC 8058                                 │
│                            │                                    │
│                            ▼                                    │
│  6. ISP RECEIVES                                                │
│     - **CSA whitelisting active:**                              │
│        - GMX → fast inbox placement                             │
│        - web.de → fast inbox placement                          │
│        - T-Online → fast inbox placement                        │
│        - 1&1 → fast inbox placement                             │
│     - Other ISPs: standard auth checks                          │
│                            │                                    │
│                            ▼                                    │
│  7. ROUTING                                                     │
│     - **Inbox** (high probability for DACH ISPs!)               │
│     - Promotions                                                │
│     - Spam (rare due to CSA + reputation)                       │
│                            │                                    │
│                            ▼                                    │
│  8. RECIPIENT INTERACTION                                       │
│     - Open → pixel → tracked                                    │
│     - Click → rapidmail redirect → tracked                      │
│                            │                                    │
│                            ▼                                    │
│  9. PROFILE UPDATE                                              │
│     - Engagement metrics                                        │
│     - Segments re-evaluated                                     │
│     - Bounce-Management updates                                 │
│                            │                                    │
│                            ▼                                    │
│ 10. AUTOMATION TRIGGERS                                         │
│     - "Opened" / "Clicked" events fire if configured            │
│                            │                                    │
│                            ▼                                    │
│ 11. REPORTING                                                   │
│     - Real-time Versandstatistiken                              │
│     - Per-link click maps                                       │
│     - **Pay-per-Mail: credit deduction confirmed**              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. Basic automation execution (Autoresponders)

### 11.1 Automation activation

```
User builds basic automation
   ↓
Test mode (preview)
   ↓
Activate
   ↓
rapidmail validation
   ↓
[Active]
   ↓
Engine evaluates triggers
```

### 11.2 Trigger evaluation (limited)

```
Event occurs:
- New subscription
- Tag added
- Birthday today
- Custom date match
   ↓
rapidmail checks active automations
   ↓
For matching workflow:
- Add subscriber to execution
```

### 11.3 Per-subscriber execution (basic)

```
Subscriber enters at trigger
   ↓
Each step processed:
- Send email → queue
- Wait → schedule
- Basic condition → branch
   ↓
Continue until end
```

### 11.4 Basic automation use cases

#### Welcome series (basic)
```
Trigger: Subscribed
   ↓
Send Email 1: Welcome
   ↓
Wait 3 days
   ↓
Send Email 2: Brand intro
   ↓
Wait 5 days
   ↓
Send Email 3: Offer
   ↓
End
```

#### Birthday automation
```
Trigger: Birthday date today
   ↓
Send Email: Happy birthday + offer
   ↓
End
```

#### Follow-up sequence
```
Trigger: Subscribed to specific list
   ↓
Wait 7 days
   ↓
Send follow-up email
   ↓
End
```

### 11.5 Automation limitations

Per Newsletter-tools.de:
> *"Für komplexere Marketing-Automationen ist die Plattform jedoch nicht ausgelegt."*

⚠️ rapidmail **NEMÁ**:
- Complex branching workflows
- Multi-channel orchestration (email only)
- Lead scoring
- Cross-sell / upsell automation
- Cart abandonment (limited support)
- Behavioral triggers (advanced)
- Predictive sending

For complex automation: **migrate to ActiveCampaign / Brevo / CleverReach**.

### 11.6 Per plan automation limits

- **Pro Versand:** 3 automated mailings max
- **Starter:** Limited automation
- **Premium / Performance:** More automation
- **Unlimited:** No automation limits

---

## 12. Forms flow (multiple types)

### 12.1 Form types available

Per Newsletter-tools.de:
> *"rapidmail stellt verschiedene Formulartypen bereit: klassische Anmeldeboxen, Pop-ups und Exit-Intent-Layer."*

**Multiple form types:**
- **Klassische Anmeldebox** (classic embedded)
- **Pop-up** (modal)
- **Exit-Intent-Layer** (exit-intent overlay)
- **Slider** (some setups)

⚠️ **Better variety than CleverReach** (which has limited form types).

### 12.2 Form creation flow

```
Marketer: Forms → Neues Formular
   ↓
Type selection
   ↓
Configure:
- Fields (text, email, phone, dropdown, checkbox, radio, date)
- **GDPR consent** (DSGVO required for DACH!)
- **Double opt-in pre-configured ON**
- Captcha
- Submit button text
- Success message
   ↓
Trigger conditions (popup):
- Time on page
- Scroll depth
- Exit intent
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

### 12.3 Double opt-in default ON

Per EU Picks:
> *"Double-Opt-in ist standardmäßig aktiviert (nicht in den Einstellungen versteckt)."*

**UNIKÁTNÍ approach:**
- **Default ON** for all forms
- **DSGVO compliance by default**
- **No risk of forgetting**
- **Best practice automatically enforced**

### 12.4 Submission flow

```
Visitor fills form
   ↓
Submit
   ↓
rapidmail receives:
- Validate fields
- Captcha check
- Duplicate email check
- **GDPR consent logged**
   ↓
Recipient created:
- Add to specified list
- Apply tags
- Trigger automation
   ↓
Status: Pending (double opt-in)
   ↓
Confirmation email sent
   ↓
Recipient confirms
   ↓
Status: Active
   ↓
Welcome workflow if configured
```

### 12.5 Form deployment methods

```
A) Embed code (HTML/JS) – paste do website
B) WordPress plugin → shortcode
C) Manual link/button (less common)
```

### 12.6 Form limits per plan

Per EmailTooltester:
- **Pro Versand / Starter:** limited count
- **Performance:** up to 5 forms
- **Unlimited:** no limit

---

## 13. Limited e-commerce integration flow

⚠️ rapidmail has **limited e-commerce integrations** vs. competitors.

### 13.1 Available integrations

#### Shopify (basic)
```
Shopify admin → Apps → rapidmail (if available)
   ↓
Configure connection
   ↓
Basic sync:
- Customers
- Marketing consent
- Email lists
   ↓
[Basic integration active]
```

⚠️ Less deep than Klaviyo's Shopify integration.

#### WooCommerce (WordPress plugin)
```
WordPress admin → Plugins → rapidmail
   ↓
Activate plugin
   ↓
Configure:
- API key (limited)
- Default list
- WooCommerce hook
- Form shortcodes
   ↓
WooCommerce orders sync (basic)
   ↓
[Integration live]
```

#### Magento (limited)
- Basic email capture
- Limited automation
- Less developed than competitors

#### Shopware (limited)
- Less native than CleverReach's Shopware integration
- DACH e-shops may prefer CleverReach pro Shopware

### 13.2 What syncs (limited)

#### Customer data (basic)
- Email
- Name
- Marketing consent flag

#### Order data (limited - depending on integration)
- Order events
- Basic order data
- Limited custom fields

#### Product data (rare)
- Limited product feed support
- Not built for product recommendations

### 13.3 No cart abandonment native

⚠️ rapidmail **doesn't have native cart abandonment** automation like Klaviyo.

Workarounds:
- **Custom JavaScript** + form submission
- **WordPress plugin** capabilities
- **Zapier** for trigger forwarding

### 13.4 Limited revenue attribution

- Basic email → click tracking
- No native order-to-email attribution
- Limited ROI reporting

### 13.5 For deep e-commerce:

**Outgrow rapidmail to:**
- **Klaviyo** (DTC Shopify deep)
- **Brevo** (multi-channel + transactional)
- **CleverReach** (Shopware native)
- **ActiveCampaign** (deep automation)

---

## 14. Display test + Spam test flow

### 14.1 Display test flow

Per Software Suggest:
*"Display tests simulate the view on different devices."*

```
User creates campaign
   ↓
Pre-send → Display test
   ↓
rapidmail simulates view on:
- Desktop (Windows / Mac)
- Tablet (iPad / Android)
- Mobile (iPhone / Android)
- Email clients:
  - Gmail
  - Outlook (various versions)
  - Apple Mail
  - GMX
  - web.de
- Dark mode preview
   ↓
User reviews multi-device previews
   ↓
Fix rendering issues if any
   ↓
[Ready to send]
```

### 14.2 Spam test flow

Per Trusted:
*"Vorab-Spam-Test"*

```
User builds campaign
   ↓
Pre-send → Spam test
   ↓
rapidmail analyzes:
- Subject line
- Content
- HTML structure
- Image-to-text ratio
- Link patterns
- Spam-trigger words
- Authentication
   ↓
Spam score generated:
- Low risk → green
- Medium → yellow (suggestions)
- High → red (action required)
   ↓
User reviews + adjusts
   ↓
[Better deliverability]
```

### 14.3 Deliverability test

Per Software Suggest:
*"Companies can carry out deliverability tests to identify weak points in the mailing and rectify them before sending."*

```
Pre-send → Deliverability test
   ↓
rapidmail checks:
- Domain authentication (DKIM, SPF, DMARC)
- Sender reputation
- Content quality
- Link reputation
- HTML standards
- Mobile responsiveness
   ↓
Issue report:
- Specific issues identified
- Recommendations provided
   ↓
User addresses issues
   ↓
[Optimized send]
```

### 14.4 Why these tests matter

Per rapidmail's CSA membership:
- Tests **protect rapidmail's CSA standing**
- Tests **maintain DACH ISP reputation**
- Tests **improve user success rate**
- Tests **reduce support tickets**

---

## 15. Pre-send checks flow

```
User: Send / Versenden button clicked
   ↓
rapidmail validates:
   ↓
1. Sender verified?
   - Email confirmed?
   - Domain authentication active?
   ↓
2. Authentication?
   - SPF record valid?
   - DKIM record present?
   - DMARC policy aligned?
   ↓
3. Audience valid?
   - List exists?
   - Recipients have valid status?
   - GDPR consent on file?
   - Suppression list checked?
   ↓
4. Credit/Plan check?
   - Pay-per-Mail: sufficient credits?
   - Subscription: within plan limits?
   ↓
5. Content checks?
   - GDPR footer present (legally required)?
   - Unsubscribe link present?
   - Sender info complete?
   ↓
6. Spam test passed?
   - Spam score acceptable?
   ↓
7. Display test reviewed?
   - Multi-device rendering OK?
   ↓
If all pass → Send confirmed
If any fail → User prompted to fix
   ↓
[Send executed]
```

---

## 16. Phone support flow (UNIKÁTNÍ pro SaaS)

### 16.1 Phone support availability

Per European Purpose:
> *"All customers receive free support via phone, email, and the ticket system"*

**Phone support FREE for ALL plans:**
- Pay-per-Mail
- Starter
- Premium / Performance
- Unlimited

### 16.2 Response time excellence

Per European Purpose:
> *"The average response time is reported to be approximately 9 minutes, which is exceptional for a SaaS platform."*

**~9 min average response** = **industry-leading**.

### 16.3 Phone support flow

```
User has issue / question
   ↓
Call rapidmail support number (visible on dashboard)
   ↓
**Free for all plans**
   ↓
~9 min average answer time
   ↓
Native German agent (English/French available)
   ↓
Help with:
- Technical questions
- Template design
- Campaign strategy
- DSGVO compliance
- Deliverability issues
- Integration questions
- Billing questions
- Migration assistance
   ↓
Resolution OR escalation
   ↓
Follow-up email s details
```

### 16.4 Why this matters

**Competitive advantage:**
- **Most SaaS:** email-only, 24-48h response
- **rapidmail:** phone + ~9 min response
- **Critical for SMB** non-technical users
- **DACH cultural expectation** of phone availability

### 16.5 Multi-channel support flow

Per GetApp:
*"rapidmail offers the following support options: Email/Help Desk, Phone Support, Knowledge Base, Chat, FAQs/Forum"*

Channels:
1. **Phone** (~9 min response, free)
2. **Live Chat** (available)
3. **Email / Ticket system**
4. **Knowledge Base** (self-service)
5. **FAQs / Forum**

User can choose preferred channel.

### 16.6 Support quality

Per real customers:
> *"Am besten gefallen hat mir der Support. Der ist aussergewöhnlich!!! Sofort immer ein kompetenter Ansprechpartner. Das findet sich in Deutschland sehr selten!"*

> *"rapidmail ist wirklich einfach zu bedienen. Und der Support hat bei einer Frage umgehend geantwortet."*

---

## 17. No API – workaround flow (Zapier, plugins)

⚠️ **rapidmail nemá public API.**

Per GetApp:
*"Q. Does rapidmail offer an API? No, rapidmail does not have an API available."*

### 17.1 Workaround options

#### Option A: Zapier (limited)
```
External app (e.g., Shopify, WordPress, custom)
   ↓
Zapier trigger configured
   ↓
Zapier action: rapidmail
- Add subscriber to list
- Update subscriber
- Limited operations
   ↓
[Workflow executes]
```

⚠️ Less comprehensive than direct API.

#### Option B: WordPress plugin
```
WordPress admin → rapidmail plugin
   ↓
Provides:
- Form shortcodes
- Subscriber capture
- Basic sync
   ↓
[Plugin functionality only]
```

#### Option C: CSV import/export
```
External system → Generate CSV
   ↓
Manual upload to rapidmail
- Email mapping
- GDPR consent confirmation
   ↓
Periodic manual sync
```

#### Option D: Email piping
```
External system → Send email to rapidmail address
   ↓
rapidmail receives, parses
   ↓
Limited automation
```

### 17.2 Limitations of no API

- **Cannot programmatically:**
  - Add contacts in real-time (only via CSV/forms)
  - Trigger campaigns from external events
  - Pull reports programmatically
  - Manage campaigns from external systems
  - Custom integration with internal systems
  - Real-time subscriber updates
- **Limited custom integrations**
- **Less developer-friendly**

### 17.3 Implications

**rapidmail's positioning:**
- **SMB / non-technical focus**
- **No dev-heavy customers expected**
- **Pre-built integrations only**
- For dev-heavy needs: **outgrow to CleverReach / Brevo / ActiveCampaign / others s API**

⚠️ Check current state with rapidmail – some sources indicate basic API for higher tiers.

---

## 18. Transactional add-on flow

### 18.1 Transactional add-on activation

Per Trusted:
> *"Sie können bei Bedarf das Add-on für den Versand von Transaktions-E-Mails buchen."*

```
User: Account → Add-ons → Transactional
   ↓
Purchase add-on (separate cost)
   ↓
Configure:
- Transactional sender domain
- Templates with variables
- API credentials (if available)
   ↓
[Transactional active]
```

### 18.2 Transactional send flow

```
External application generates transactional event
- Order confirmation
- Password reset
- Account verification
- Receipt
   ↓
Application calls rapidmail (via add-on integration)
   ↓
rapidmail:
- Renders template
- Sends via infrastructure
- Tracks delivery
   ↓
Recipient receives email
   ↓
Logged in account
```

### 18.3 Use cases

- Order confirmations
- Shipping notifications
- Password resets
- Account verifications
- Receipts / invoices
- Authentication codes

### 18.4 Limitations vs. dedicated transactional

⚠️ Less feature-rich than:
- **Postmark**
- **Mailgun**
- **Brevo transactional**
- **SendGrid**

Sufficient for **SMB** use cases, ne pro high-volume / complex transactional needs.

---

## 19. Deliverability flow (CSA + Made in Germany)

### 19.1 Made in Germany infrastructure

```
Email send request:
   ↓
rapidmail GERMAN infrastructure (Freiburg):
- **Servers EXCLUSIVELY v Německu**
- **NO US subprocessors**
- **NO cross-border transfers**
- Multi-IP pool selection
- Dedicated IP pools (DACH market)
   ↓
Direct German ISP relationships:
- GMX, web.de, T-Online, 1&1
- Major German + DACH ISPs
   ↓
CSA-protected delivery
```

### 19.2 CSA membership benefits

Per EuropeanStack:
> *"As a CSA-certified sender, rapidmail benefits from whitelisting by major German and European ISPs"*

**Whitelisted by:**
- **GMX**
- **web.de**
- **T-Online**
- **1&1**
- **Other major DACH ISPs**

**Result:**
- **Faster inbox placement**
- **Higher open rates** (DACH-specific)
- **Less spam filter risk**
- **Sender reputation guaranteed**

### 19.3 Authentication

Per EuropeanStack:
> *"The platform handles SPF, DKIM, and DMARC configuration"*

**rapidmail manages:**
- SPF
- DKIM
- DMARC
- Branded tracking domain

User just verifies email/domain.

### 19.4 Dedicated IP option

Per EuropeanStack:
> *"provides dedicated IP options for high-volume senders"*

- **High-volume customers**
- **Better sender reputation control**
- **Premium / Unlimited tier**

### 19.5 List hygiene (automatic Bounce-Management)

Per Software Advice:
*"automatic bounce management, unsubscribing options, subscription notices, blacklists"*

```
Continuous monitoring:
- Hard bounces → auto-suppression
- Soft bounces → retry then suppress
- Spam complaints → immediate suppression
- Blacklist management
   ↓
Sender reputation protected
```

### 19.6 Gmail/Yahoo 2024+ compliance

- One-click unsubscribe (RFC 8058)
- DKIM + DMARC enforced
- Spam rate monitoring
- rapidmail handles compliance

### 19.7 DACH deliverability excellence

Per EU Picks:
> *"Hervorragende Zustellbarkeit im DACH-Raum"*

**Excellent DACH deliverability** due to:
- Made in Germany infrastructure
- Long-term ISP relationships (since 2008)
- CSA membership
- Direct German jurisdiction
- DACH-specific optimization

---

## 20. DSGVO compliance flow

### 20.1 100% Made in Germany

```
Data flow:
- All data → German servers exclusively
- NO US subprocessors
- NO cross-border transfers
- German jurisdiction guaranteed
- Schrems II issues: NONE (data never leaves Germany)
```

### 20.2 DSGVO features

- **Double opt-in default ON** (pre-configured!)
- **GDPR consent fields** v forms (mandatory!)
- **Audit trail per consent** (IP, timestamp, text version)
- **Right to be Forgotten**:
  - UI: contact delete
  - Self-service via preference center
  - Phone request via support
- **Data export** per subscriber
- **DPA standard** (Auftragsverarbeitungsvertrag)
- **German privacy law** native compliance

### 20.3 Auftragsverarbeitungsvertrag (DPA)

Per EuropeanStack:
> *"provides built-in double opt-in, consent tracking, and data processing agreements as standard."*

```
Account setup:
   ↓
DPA available immediately
   ↓
Pre-prepared template v němčině
   ↓
Customer signs (electronic)
   ↓
[DSGVO compliance documented]
```

### 20.4 Right to Be Forgotten flow

```
Recipient requests deletion (per DSGVO)
   ↓
Method A: Admin manual
Method B: Self-service preference center
Method C: Phone request to rapidmail support
   ↓
rapidmail:
- Removes personal data
- Anonymizes events
- Auto-suppression permanent
- Audit log entry
- Confirmation email (DSGVO compliant)
- **No subprocessors to notify** (only rapidmail/Germany!)
```

### 20.5 DSAR (Data Subject Access Request)

```
Recipient requests their data
   ↓
Admin: Generate GDPR export
OR phone request to support
   ↓
rapidmail produces:
- Profile data
- Activity events
- Consent records
- Communication history
   ↓
Provide within 30 days (DSGVO requirement)
```

### 20.6 German jurisdiction advantage

Per EuropeanStack:
> *"For businesses in regulated industries or those that have experienced scrutiny from German data protection authorities, rapidmail provides a level of jurisdictional certainty that US-based platforms simply cannot match."*

Pro regulated industries:
- Banking
- Healthcare
- Government / public sector
- Legal services
- DACH companies s strict requirements

---

## 21. Datová mapa: co vidí kdo

| Data | Owner | Add. user | Subscriber | Plugin (WP) | Zapier | rapidmail Support |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Account settings | ✅ | per role | ❌ | ❌ | ❌ | read s consent |
| Billing / Credits | ✅ | ❌ | ❌ | ❌ | ❌ | read s consent |
| User management | ✅ | ❌ | ❌ | ❌ | ❌ | read s consent |
| All recipients | ✅ | per role | jen sebe | per scope | per scope | read s consent |
| Edit recipients | ✅ | per role | ❌ | per scope | per scope | per request |
| Import recipients | ✅ | per role | ❌ | ❌ | per scope | assist |
| Export recipients | ✅ | per role | request (DSAR) | ❌ | ❌ | assist |
| Lists | ✅ | per role | – | per scope | per scope | read |
| Segments | ✅ | per role | – | ❌ | ❌ | read |
| Tags | ✅ | per role | – | ❌ | ❌ | read |
| Campaigns | ✅ | per role | jen co dostal | ❌ | ❌ | read |
| Send campaigns | ✅ | per role | ❌ | ❌ | ❌ | ❌ |
| Pay-per-Mail credits | ✅ | per role | ❌ | ❌ | ❌ | read |
| Automation (basic) | ✅ | per role | ❌ | ❌ | ❌ | read |
| Templates | ✅ | per role | – | ❌ | ❌ | read |
| Forms | ✅ | per role | submit | per scope | per scope | read |
| Reports | ✅ | per role | ❌ | ❌ | ❌ | read |
| Display test | ✅ | per role | – | ❌ | ❌ | read |
| Spam test | ✅ | per role | – | ❌ | ❌ | read |
| Phone support access | ✅ | ✅ | – | – | – | provide |
| DSGVO delete | ✅ | per role | request | ❌ | ❌ | execute |

---

## 22. Známé úzkoprofilové místa

### 22.1 No API (critical limitation)

Per GetApp:
*"No, rapidmail does not have an API available."*

⚠️ **No public API** = significant limitation pro:
- Custom integrations
- Developer-driven organizations
- Real-time programmatic operations
- Custom system integration

### 22.2 Limited automation

Per Newsletter-tools.de:
> *"Für komplexere Marketing-Automationen ist die Plattform jedoch nicht ausgelegt."*

⚠️ **Basic automation only:**
- No complex branching workflows
- No multi-channel orchestration
- No lead scoring
- No CRM integration
- No predictive sending
- Limited behavioral triggers
- Limited cart abandonment

### 22.3 No CRM, SMS, landing pages

Per EuropeanStack:
> *"It does not offer CRM, SMS, landing pages, or marketing automation."*

**Intentional limitation:**
- Newsletter focus only
- For multi-channel: outgrow

### 22.4 Limited international

- **3 UI languages only** (EN, DE, FR)
- **No Spanish/Italian/Dutch** (vs. CleverReach 6 languages)
- **No CEE** (no CZ/SK/PL/HU)
- **DACH primary focus**

### 22.5 Limited user accounts per plan

- **Pro Versand:** 1 user only
- **Lower tiers:** few users
- **vs. CleverReach unlimited users**

For agencies / multi-user teams: **CleverReach may be better**.

### 22.6 Higher pricing vs. CleverReach

Per EmailTooltester:
> *"Im Vergleich zu anderen Newsletter-Tools wie CleverReach empfinde ich aber auch den Performance Tarif von rapidmail als etwas überteuert"*

- **Subscription slightly higher** than CleverReach for similar features
- **Justified by:** simplicity + phone support + Made in Germany
- **Pay-per-Mail** je clear winner pro occasional senders

### 22.7 No A/B testing in Essential

Per EmailTooltester:
- **A/B testing nedostupné** v lower tiers
- Available v Performance+ only

### 22.8 Limited e-commerce features

- **Less polished Shopify** integration vs. Klaviyo
- **Less Shopware native** vs. CleverReach
- **No native cart abandonment** automation
- **No product recommendations**
- **No predictive ML**

### 22.9 No autonomous AI

- **No AI agents** (vs. Klaviyo, HubSpot)
- **No generative AI** for content
- **1-Click-Design** is rule-based (Performance+)
- **No predictive sending AI per recipient**

### 22.10 No webinars / courses / paid newsletters

- **No webinar hosting** (vs. GetResponse)
- **No online courses**
- **No paid newsletters subscription**
- **No digital products** sale

### 22.11 Personalization limitations

- **Basic personalization** only
- **No Czech 5. pád** (CZ feature gap)
- **No CZ/SK calendar** (no jmeniny)
- **Limited dynamic content**
- **Less than SmartEmailing's depth**

### 22.12 Reporting limitations

- **Basic analytics**
- **No multi-touch attribution**
- **Limited custom dashboards**
- **Basic export options**

### 22.13 No mobile app

- **No native mobile app**
- **Most operations require desktop**

### 22.14 Form limits per plan

- **Limited form count** lower tiers
- **Up to 5 forms** v Performance
- **Unlimited** only v Unlimited tier

### 22.15 Pay-per-Mail credits expire

- **Credits valid 12 months**
- **If not used → forfeit**
- **Stock up risk** (don't over-purchase)

### 22.16 Migration challenges

- **No API** = limited automated migration
- **CSV import** primary method
- **Templates rebuild** required
- **Automation re-create** required

---

## 23. Doporučení pro design vlastních procesů

Pokud rapidmail používáte v týmu, doporučujeme:

1. **Domain authentication day 1** – rapidmail handles SPF/DKIM/DMARC, just verify
2. **Brand kit setup early** – consistency v templates
3. **Free phone support využívat** – ~9 min response je benchmark
4. **Choose pricing model carefully:**
   - **Pay-per-Mail** pro 1-12 sends/year (occasional)
   - **Starter** pro frequent + small lists
   - **Premium / Performance** pro A/B testing + advanced features
   - **Unlimited** pro complex needs
5. **Pay-per-Mail credits:** buy as needed, don't stockpile (12 month expiration)
6. **DSGVO consent fields** – DSGVO required for DACH (built-in!)
7. **Double opt-in default ON** – respect DACH compliance
8. **Display test** for every campaign – multi-device check
9. **Spam test** – pre-send safety net
10. **Deliverability test** – maintain CSA standing
11. **Tag taxonomy** flat structure
12. **Multi-user plan upgrade** if team grows beyond 1-2 users
13. **No API workarounds:**
    - Zapier for integrations
    - WordPress plugin
    - CSV manual import
14. **WordPress integration** if applicable
15. **Templates library** build reusable masters
16. **1-Click-Design** (Performance+) – auto-generate templates from website
17. **A/B testing** culture (Premium+ required)
18. **Plan migration plan** – if outgrow rapidmail, prepare for:
    - **Brevo** pro multi-channel
    - **CleverReach** pro more features + unlimited users
    - **ActiveCampaign** pro deep automation
    - **Klaviyo** pro Shopify DTC
19. **DSGVO documentation** – DPA on file, audit trail
20. **DACH deliverability monitoring** – CSA whitelisting active
21. **Backup strategy** – periodic CSV export
22. **Knowledge base + tutorials** – use rapidmail's resources
23. **Phone consultation** – use proactively for strategy

---

*Dokument zpracován z oficiálních zdrojů rapidmail.com a praktických zdrojů (GetApp, Software Advice, Software Suggest, EmailTooltester, EuropeanStack, European Purpose, EU Picks, Trusted, Business Digital, Newsletter-tools.de, customer testimonials). Pro nejaktuálnější detaily je nutný engagement s rapidmail support teamem (free phone v němčině!).*
