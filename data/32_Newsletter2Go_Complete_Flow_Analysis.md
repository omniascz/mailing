# Newsletter2Go – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v Newsletter2Go prochází data, lidé a akce – od pre-acquisition full operation přes acquisition transition po současný legacy stav s migration assistant flow do Brevo.

> Tento dokument doplňuje `31_Newsletter2Go_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** Newsletter2Go umí, tento popisuje, **kdo s tím interaguje a jak data tečou** v současném legacy stavu.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
>
> - **Legacy product (acquired 2019, rebranded 2020, parent rebranded 2023)**
> - **NO new sign-ups** – existing customers only
> - **Migration assistant to Brevo** built-in
> - **Servers v Německu** preserved (Brevo retained Newsletter2Go infrastructure)
> - **Berlin office + team** retained post-acquisition
> - **6-day support** (Saturday email since April 2020)
> - **LITE10 free tier** maintained pro backup access
> - **Pricing per emails sent** (not per contacts) – unique
> - **1-Click-Produktübernahme** for Shopware + Shopify
> - **Eventual sunset** announced (no date)
> - **DSGVO compliance** maintained
> - **Parent company:** Brevo (legally Brevo GmbH)

---

## Obsah

1. [Mapa všech aktérů (současný stav)](#1-mapa-aktérů)
2. [Historical context flow (2011-2026)](#2-historical-flow)
3. [Why no new sign-ups flow](#3-no-signups-flow)
4. [Existing customer login flow](#4-login-flow)
5. [Bestandskunden access maintenance](#5-bestandskunden-flow)
6. [User roles & permissions](#6-user-roles)
7. [Daily user workflow](#7-daily-workflow)
8. [Recipient lifecycle (Adressbuch + Gruppen)](#8-recipient-lifecycle)
9. [Email campaign creation flow](#9-campaign-flow)
10. [1-Click-Produktübernahme flow](#10-product-takeover-flow)
11. [Conversion tracking flow](#11-conversion-tracking-flow)
12. [Form creation + Double Opt-in flow](#12-forms-flow)
13. [Basic automation execution](#13-automation-flow)
14. [Migration Assistant to Brevo (detailed flow)](#14-migration-flow)
15. [Post-migration account management flow](#15-post-migration-flow)
16. [What migrates vs. what doesn't](#16-migration-data-flow)
17. [Account closure flow (3 options)](#17-account-closure-flow)
18. [Support flow (6-day, German)](#18-support-flow)
19. [DSGVO + Right to Be Forgotten flow](#19-dsgvo-flow)
20. [Datová mapa: co vidí kdo](#20-datová-mapa)
21. [Známé úzkoprofilové místa](#21-úzkoprofilové-místa)

---

## 1. Mapa všech aktérů (současný stav)

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│         NEWSLETTER2GO ECOSYSTEM (LEGACY MODE 2026)                 │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [Brevo (formerly Sendinblue) – Parent Company]                    │
│   Legal entity: Brevo GmbH (Berlin)                                │
│   ├─ Newsletter2Go Berlin office + team (retained)                 │
│   ├─ Brevo support team (6-day, Saturday email since Apr 2020)     │
│   ├─ Migration assistance team                                     │
│   ├─ Newsletter2Go technical support                               │
│   ├─ Engineering (maintenance only - legacy mode)                  │
│   └─ Brevo sales (no new Newsletter2Go signups!)                   │
│           │                                                        │
│           ▼                                                        │
│                                                                    │
│   ┌──────────────────────────────────────────┐                     │
│   │   Newsletter2Go Account (LEGACY)         │                     │
│   │                                          │                     │
│   │   ⚠️ ONLY BESTANDSKUNDEN                  │                     │
│   │   (existing customers since pre-2019)    │                     │
│   │                                          │                     │
│   │   User roles:                            │                     │
│   │   ├─ Account Owner                       │◄── full access      │
│   │   ├─ Additional users (per plan)         │◄── per role         │
│   │                                          │                     │
│   │   Tarif options:                         │                     │
│   │   ├─ LITE10 (free, 1000 emails/month)    │                     │
│   │   ├─ Higher email-volume tiers           │                     │
│   │   └─ Prepaid Credits                     │                     │
│   │                                          │                     │
│   │   PRICING: per emails sent (unique!)     │                     │
│   │                                          │                     │
│   │   Account status options:                │                     │
│   │   ├─ Active (regular usage)              │                     │
│   │   ├─ Migrated to Brevo + active here     │                     │
│   │   ├─ Migrated + LITE10 (free backup)     │                     │
│   │   └─ Cancelled / deleted                 │                     │
│   └──────────────┬───────────────────────────┘                     │
│                  │                                                 │
│                  ▼                                                 │
│   [Recipients / Adressbuch]                                        │
│       │                                                            │
│       ├─→ Active recipients (in Adressbücher, Gruppen)             │
│       ├─→ Inactive recipients (deleted after 7 days!)              │
│       ├─→ Double opt-in confirmation flow                          │
│       └─→ Receive newsletters                                      │
│                  │                                                 │
│                  ▼                                                 │
│   [Schnittstellen / Integrations]                                  │
│   ┌──────────────────────────────────────────┐                     │
│   │   E-commerce (1-Click-Produktübernahme): │                     │
│   │   - Shopware                             │                     │
│   │   - Shopify                              │                     │
│   │                                          │                     │
│   │   Other integrations:                    │                     │
│   │   - API endpoints                        │                     │
│   │   - Webhooks                             │                     │
│   │   - Some legacy integrations             │                     │
│   │                                          │                     │
│   │   ⚠️ NOT ALL integrations available       │                     │
│   │   v Brevo (per migration FAQ)            │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
│   [Migration Path to Brevo]                                        │
│   ┌──────────────────────────────────────────┐                     │
│   │   Migration Assistant (in dashboard)     │                     │
│   │   ├─ Free of charge                      │                     │
│   │   ├─ Overnight processing                │                     │
│   │   ├─ One-time migration                  │                     │
│   │   ├─ Active recipients only              │                     │
│   │   └─ Custom fields + static groups       │                     │
│   │                                          │                     │
│   │   Post-migration Newsletter2Go options:  │                     │
│   │   - Keep active (paid)                   │                     │
│   │   - Switch to LITE10 (free backup)       │                     │
│   │   - Delete completely (written request)  │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
│   [Brevo Platform (target for migration)]                          │
│       └─→ Full modern features available                           │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér                                 | Vstupní bod                | Co dělá                  | Co vidí        |
| ------------------------------------- | -------------------------- | ------------------------ | -------------- |
| **Bestandskunde (existing customer)** | Login s legacy credentials | Newsletter operations    | Account data   |
| **Account Owner**                     | Pre-2019 sign-up creator   | Full account control     | Vše            |
| **Additional users**                  | Pozvánka                   | Per role permissions     | Per role       |
| **Recipient**                         | Form, integration          | Receives newsletters     | Své emaily     |
| **Brevo Support (DE)**                | Email, phone, ticket       | Issue resolution         | Read s consent |
| **Migration assistant**               | In-product dashboard       | Migration to Brevo       | Account data   |
| **Brevo Sales**                       | Inquiry contact            | Brevo upgrade promotion  | Read           |
| **API Client**                        | API key                    | Per scope                | Per scope      |
| **Shopware integration**              | Schnittstelle              | 1-Click product takeover | Per scope      |
| **Shopify integration**               | Schnittstelle              | 1-Click product takeover | Per scope      |

---

## 2. Historical context flow (2011-2026)

```
2011 ────────► Newsletter2Go founded
   │              ├─ Berlin, Germany
   │              ├─ Founders: Steffen Schebesta + Christoph Beuck
   │              └─ Pricing per emails sent model established
   │
   │ 8 let independent growth
   │
2015-2018 ──► Growth phase
   │              ├─ DACH market expansion
   │              ├─ Premium templates introduced
   │              ├─ Shopware integration (DACH e-commerce leader)
   │              ├─ Shopify integration
   │              └─ 1-Click-Produktübernahme launched
   │
2019 Jan 31 ─► Sendinblue acquires 100% Newsletter2Go GmbH shares
   │              │
   │              ├─ Goal: European market leader
   │              ├─ Rival US + China digital companies
   │              ├─ Shared DNA + values
   │              └─ Newsletter2Go software continues operating
   │
   │ 1.5 roky integration period
   │
2020 Apr 1 ──► 6-day support starts (Saturday email!)
   │
2020 Apr 14 ─► Single brand strategy announced
   │              │
   │              ├─ Newsletter2Go + Sendinblue under single brand
   │              ├─ Newsletter2Go software remains for Bestandskunden
   │              ├─ New customers redirected to Sendinblue
   │              └─ Berlin office + team retained
   │
   │ 2 roky stabilní legacy operation
   │
2022 End ─────► Migration assistant beta start
   │              ├─ First Lite users offered migration
   │              └─ Limited functionality features users first
   │
2023 May ────► Sendinblue rebrands to Brevo
   │              │
   │              ├─ Single platform name: Brevo
   │              ├─ Newsletter2Go software still operates legacy
   │              ├─ Per Brevo: "Während sich die Plattform Sendinblue
   │              │   in Brevo umbenannt hat, bleibt für Sie alles
   │              │   beim Alten"
   │              └─ Login URL: brevo.com/de/company/newsletter2go-login
   │
2023 End ─────► Migration assistant fully deployed
   │              ├─ All Newsletter2Go users have access
   │              ├─ Self-service in dashboard
   │              └─ Free migration
   │
2024-2026 ──► Legacy mode operation
   │              ├─ Stable maintenance
   │              ├─ No new features
   │              ├─ Migration encouraged
   │              ├─ Bestandskunden still served
   │              └─ Eventual sunset (no date)
   │
[Future] ────► Eventual end-of-life
                  ├─ Per Brevo: "alles Gute hat mal ein Ende"
                  ├─ Date not announced
                  ├─ Migration will likely become mandatory
                  └─ Software shutdown eventually
```

---

## 3. Why no new sign-ups flow

### 3.1 New customer attempting Newsletter2Go signup

```
Prospect visits newsletter2go.com (old URL)
   ↓
Redirected to brevo.com/de/landing/newsletter2go
   ↓
Page explains:
- Newsletter2Go merger s Brevo
- Brand history
- New customers cannot register
- Brevo offers identical/better features
   ↓
**Call to action: "Kostenloses Brevo-Konto erstellen"**
   ↓
Sign-up form for Brevo (not Newsletter2Go)
   ↓
[New customer onboarded to Brevo]
```

### 3.2 Why Brevo enforces this

**Strategic reasoning:**

- **Avoid splitting customer base** (one platform > two)
- **Future-proof customer journey** (Newsletter2Go will sunset)
- **Cross-sell modern features** (multi-channel, AI, CRM)
- **Reduce technical debt** (no need to develop two products)
- **Unified support** experience

### 3.3 Per Brevo FAQ

> _"Im Januar 2019 hat Brevo (damals noch Sendinblue) sämtliche Unternehmensanteile der Newsletter2Go GmbH erworben, um einen europäischen Marktführer für digitales Marketing aufzubauen."_
>
> _"Neukund:innen können sich ab sofort einen kostenlosen Account bei Brevo erstellen."_

**Translation:**

- 2019: Sendinblue (now Brevo) acquired Newsletter2Go shares
- New customers can register Brevo account for free immediately
- **NOT Newsletter2Go**

### 3.4 No exceptions

Per Brevo's policy:

- **No way** to sign up for Newsletter2Go
- **No "small exception"** even pro existing partners
- **All new business** goes to Brevo
- **Clear customer journey** maintained

---

## 4. Existing customer login flow

### 4.1 Login URL evolution

```
Pre-2019:
   newsletter2go.com (login)
   ↓
2020-2023 (Sendinblue era):
   newsletter2go-help-de.sendinblue.com (help)
   sendinblue.com (with Newsletter2Go option)
   ↓
2023-current (Brevo era):
   **brevo.com/de/company/newsletter2go-login**
   newsletter2go-help-de.sendinblue.com (help still operational)
```

### 4.2 Current login flow (2026)

```
Bestandskunde wants to login
   ↓
Visit: brevo.com/de/company/newsletter2go-login
   ↓
Per Brevo:
"Während sich die Plattform Sendinblue in Brevo umbenannt hat, bleibt
 für Sie alles beim Alten: Ihre gewohnte Newsletter2Go-Software läuft
 unter dem Namen Sendinblue unverändert weiter."
   ↓
Login form:
- Email
- Password
- (Same credentials as always)
   ↓
2FA if configured
   ↓
[Newsletter2Go dashboard]
```

### 4.3 No changes to UI

Per Brevo:

> _"Auch nach der Umbenennung kannst du dich wie gewohnt in die Software einloggen."_

- **Same UI** as pre-acquisition
- **Same features** familiar
- **Same workflow**
- **Familiar German interface**

### 4.4 Tip from Brevo

Per Brevo:

> _"Tip: Bookmark the new login page in your browser."_

**Customers encouraged to:**

- Bookmark new URL
- Avoid older URLs
- Use current Brevo-hosted login

---

## 5. Bestandskunden access maintenance

### 5.1 Why "nothing changes" for existing customers

Per Brevo oficiální:

> _"For existing Newsletter2Go customers, nothing will change. ... The Newsletter2Go software will remain unaffected by the rebrand. You can continue to use it as normal."_

**Maintained for Bestandskunden:**

- ✅ Same software
- ✅ Same login credentials
- ✅ Same UI
- ✅ Same prices
- ✅ Same features
- ✅ Same Berlin team
- ✅ German servers
- ✅ DSGVO compliance
- ✅ German support (now 6-day!)

### 5.2 Per Brevo on legal continuity

> _"Sie auch keinen neuen Vertrag ausfüllen müssen."_

**No new contract required:**

- Original agreement still valid
- Brevo legally assumed Newsletter2Go GmbH
- Legal entity: Brevo GmbH (post-rename)
- DPA continues
- Privacy policy continuity

### 5.3 Bestandskunden privileges

**What Bestandskunden retain:**

#### Pricing grandfathered

- **Per emails sent** model preserved
- **Original price tiers** maintained
- **No surprise increases** post-acquisition
- **Long-term price commitment**

#### Feature access

- **All Newsletter2Go features** continue
- **Premium templates** continue work
- **Custom Schnittstellen** continue
- **Workflows + automation** continue

#### Account ownership

- **Account control** maintained
- **Data ownership** preserved
- **Export rights** preserved
- **Right to delete** preserved

### 5.4 What changed post-acquisition (positive)

#### 6-day support

Per Brevo (Apr 1, 2020):

- **Saturday email** support added
- **Better availability**
- **Multi-channel**

#### Migration option

- **Free migration assistant**
- **Flexibility** to move to Brevo
- **Choice** preserved

#### Continued investment in infrastructure

- **Servers maintained**
- **Security updates**
- **Bug fixes**
- **DSGVO updates**

### 5.5 What WILL change eventually

Per Brevo FAQ:

> _"Wir haben noch kein Datum, wann wir unsere Newsletter2Go Software offline schalten, doch es wird sicherlich kommen, das vorab."_

**Eventual sunset:**

- **Date not announced** (2026)
- **Will happen eventually**
- **Customers will be migrated** (forced if needed)
- **Plan ahead** advised

---

## 6. User roles & permissions

### 6.1 Default role structure

Newsletter2Go's role model is **simpler** than modern competitors (legacy product):

#### Account Owner

- **Highest tier**
- **Created during pre-2019 signup**
- Full account access
- Billing management
- User management
- Account settings

#### Additional users (per plan)

- **Limited per tier**
- LITE10: typically 1 user only
- Higher tiers: more users
- Basic role permissions

### 6.2 Permission categories

Limited granularity vs. modern platforms:

- Account access
- Adressbuch management
- Campaign creation
- Sending permissions
- Template access
- Reports access

### 6.3 No advanced multi-user features

⚠️ Newsletter2Go's multi-user **less sophisticated** than:

- **CleverReach** (unlimited users free + granular permissions)
- **Brevo** (modern multi-user)
- **HubSpot** (Seat-Permission-Team)

### 6.4 User invitation flow

```
Owner: Konto → Benutzer
   ↓
+ Add user
   ↓
Email + name
   ↓
Basic permissions
   ↓
Invitation sent
   ↓
User activates
   ↓
[Active]
```

---

## 7. Daily user workflow

### 7.1 Daily Newsletter2Go user flow

```
Login → Dashboard
   ↓
Dashboard sections:
- Recent campaigns performance
- Adressbuch overview
- Active subscriptions
- Migration to Brevo (if enabled)
- Pending tasks
   ↓
Daily activities:
- Build campaign
- Manage recipients
- Update templates
- Review reports
- Configure forms
- Check automation
```

### 7.2 Typical activities

#### Build campaign

```
Newsletter → Neue Kampagne
   ↓
Configure setup
   ↓
Select Adressbuch
   ↓
Design (drag-drop)
   ↓
1-Click-Produktübernahme (if applicable)
   ↓
Test send
   ↓
Send / Schedule
```

#### Manage recipients

```
Adressbuch → Aktive Empfänger
   ↓
Actions:
- Import new (CSV)
- Add manually
- Edit fields (Merkmale)
- Manage groups
- Export
```

#### Check reports

```
Reports → Campaign performance
   ↓
View:
- Opens, clicks
- Bounces, unsubscribes
- Geographic data
- Conversion (if tracking enabled)
```

---

## 8. Recipient lifecycle (Adressbuch + Gruppen)

### 8.1 Recipient creation paths

#### A) Form submission s Double Opt-in

```
Visitor fills Newsletter2Go form
   ↓
Submit
   ↓
Newsletter2Go:
- Validates email
- Captcha check
- **GDPR consent recorded**
   ↓
Status: Pending (Double Opt-in default)
   ↓
**Bestätigungsmail** sent
   ↓
Recipient clicks confirm
   ↓
IP + timestamp logged
   ↓
Status: Active
   ↓
Add to Adressbuch / Gruppe
   ↓
[DSGVO compliance documented]
```

#### B) CSV import

```
Admin: Adressbuch → Import
   ↓
CSV upload
   ↓
Field mapping (Merkmale zuordnen)
   ↓
Choose Adressbuch destination
   ↓
**GDPR consent confirmation required**
   ↓
Validation
   ↓
Import processed
   ↓
[Recipients added]
```

#### C) API integration

```
External system API call
   ↓
Newsletter2Go API receives
   ↓
Validates auth
   ↓
Creates/updates recipient
   ↓
Adds to Adressbuch
   ↓
Status: Pending (default DOI) or Active
```

#### D) Shopware / Shopify integration

```
Customer registers v shop
   ↓
Shop webhook → Newsletter2Go
   ↓
Recipient created
   ↓
Marketing consent flag transferred
   ↓
Add to designated Adressbuch
   ↓
[Integration sync]
```

### 8.2 Recipient status lifecycle

```
[Pending] (Double Opt-in default)
   ↓
[Active] ← can receive newsletters
   ↓
Various transitions:
- Unsubscribed
- Bounced (auto-detection)
- Spam complaint
- Inactive (manual or auto)
   ↓
**Inactive lifecycle:**
- Status: Inactive
- **Anonymized + encrypted** after some time
- **Auto-deleted after 7 days**
   ↓
[Deleted permanently]
```

### 8.3 Inactive recipient handling (UNIQUE)

Per Brevo migration FAQ:

> _"Inaktive Empfänger werden standardmäßig nach 7 Tagen gelöscht. Somit ist die Liste Ihrer inaktiven Empfänger nicht vollständig. Da diese nur noch anonymisiert und verschlüsselt in der Datenbank gespeichert sind, ist eine vollständige Übertragung der inaktiven Empfänger nicht möglich."_

**Newsletter2Go's inactive policy:**

- **7-day window** after marking inactive
- **Anonymized + encrypted** in database
- **Auto-deleted** after 7 days
- **Cannot fully restore**

⚠️ **Implication pro migration:**

- **Export inactive within 7 days** if needed
- **Re-import to Brevo** manually
- **Otherwise lost permanently**

### 8.4 Adressbuch structure

```
Account level
└── Adressbuch 1 (LITE10 limited to 1)
    ├── Aktive Empfänger
    │   ├── Gruppe A
    │   ├── Gruppe B
    │   └── Ungrouped
    └── Inaktive Empfänger (7-day window)
```

Higher tiers:

```
Account level
├── Adressbuch 1
├── Adressbuch 2
├── Adressbuch 3
└── ... (multiple)
```

### 8.5 Custom fields (Merkmale)

```
Adressbuch → Merkmale → Configure
   ↓
Add custom fields:
- Text
- Number
- Date
- Selection (dropdown)
   ↓
Use v personalization
Use v segmentation (basic)
   ↓
[Fields available per recipient]
```

### 8.6 Groups (Gruppen)

```
Adressbuch → Gruppen
   ↓
+ New group
   ↓
Type:
- Static (manual member assignment)
- Dynamic (based on criteria - limited)
   ↓
Use pro:
- Segmented campaigns
- Different newsletter audiences
- Behavioral targeting
```

### 8.7 Export flow

Per Newsletter2Go Help:

> _"Aus dem Adressbuch können Sie die Daten ausgewählter aktiver oder inaktiver Empfänger oder ganzer Gruppen exportieren."_

```
Adressbuch → Select recipients / group
   ↓
Click "Exportieren"
   ↓
Choose format (CSV typical)
   ↓
Choose fields to include
   ↓
Download
   ↓
[Use externally OR import to Brevo etc.]
```

### 8.8 Unsubscribe flow

```
Recipient clicks "Abmelden" v email footer
   ↓
Newsletter2Go-hosted page
   ↓
Options:
- Specific Adressbuch unsubscribe
- All marketing unsubscribe
- Reason survey (optional)
   ↓
Status: Unsubscribed
   ↓
GDPR audit logged
   ↓
**Will become Inactive eventually**
   ↓
**Auto-deleted after 7 days inactive**
```

### 8.9 GDPR delete (Right to Be Forgotten)

```
Recipient requests deletion
   ↓
Method A: Admin → Adressbuch → Delete
Method B: API DELETE
Method C: Self-service via preference center (some setups)
Method D: Written request to support
   ↓
Newsletter2Go:
- Removes personal data
- Anonymizes events
- Auto-deletion within 7 days
- Audit log entry
- Confirmation email (DSGVO compliant)
```

---

## 9. Email campaign creation flow

### 9.1 Campaign workflow

```
Newsletter → Neue Kampagne
   ↓
Step 1: Setup
- Campaign name (interne Bezeichnung)
- Subject (Betreff)
- Preheader (limited support)
- Sender (Absender, verified)
- Reply-to (Antwort-Adresse)
   ↓
Step 2: Recipients
- Select Adressbuch (or Gruppe)
- Exclusions (basic)
   ↓
Step 3: Design
- Drag-drop editor
- Template selection:
  - Free templates
  - Premium templates (paid add-on)
  - Custom HTML
- Insert content blocks
- **1-Click-Produktübernahme** (Shopware/Shopify)
- Personalization tokens (Platzhalter)
- Mediathek images
   ↓
Step 4: Test
- Send test email
- Spam test
- Preview (desktop/mobile)
   ↓
Step 5: Send / Schedule
- Send immediately
- Schedule for later
   ↓
Confirmation
   ↓
**Conversion tracking JavaScript active on target page**
```

### 9.2 Premium template limitation

Per Brevo migration FAQ:

> _"Aus technischen Gründen ist es leider nicht möglich, Ihr Premium Template zu Brevo zu migrieren."_

⚠️ **Premium templates DO NOT migrate to Brevo:**

- Custom premium designs lost during migration
- Rebuild required v Brevo
- Significant migration effort

### 9.3 A/B testing flow

```
Create A/B campaign
   ↓
Configure variants:
- Subject A vs. B
- Sender variants
- Content variants
   ↓
Sample size
   ↓
Winner criteria (open/click)
   ↓
Auto-winner send to majority
   ↓
Results tracked
```

### 9.4 Conversion tracking integration

```
Per campaign:
- Conversion tracking active?
- JavaScript on landing page?
   ↓
After send:
- Track clicks
- Track conversions on landing page
- Attribute to specific email/recipient
- ROI calculation
```

---

## 10. 1-Click-Produktübernahme flow

### 10.1 Setup flow (one-time)

```
Newsletter2Go: Einstellungen → Schnittstellen
   ↓
Select shop integration:
- Shopware
- Shopify
- Other e-commerce
   ↓
Configure connection:
- Shop URL
- API key / OAuth
- Product feed
   ↓
Test connection
   ↓
[Schnittstelle active]
   ↓
1-Click-Produktübernahme available v editoru
```

### 10.2 Use in newsletter creation

Per Newsletter2Go Help:

> _"Mit der 1-Klick-Produktübernahme von Newsletter2Go können Sie ganze Shop-Produkte übernehmen und in Ihren Newsletter einfügen."_

```
User creates newsletter v editor
   ↓
Add product block
   ↓
Click "Produkt aus Shop einfügen"
   ↓
Search dialog opens:
- Browse products
- Search by name/category
- Filter by availability
   ↓
Select product
   ↓
**1-Click insertion:**
- Image (auto-fetched from shop)
- Title
- Price
- Description
- Direct link to shop product
   ↓
Product block appears v editor
   ↓
Continue building newsletter
```

### 10.3 What gets auto-populated

```
From shop:
- Product image (URL or upload)
- Product name
- Price (current)
- Description (short)
- Link to product page
- Availability status
   ↓
Newsletter block formatted:
- Brand colors
- Layout consistent
- Mobile responsive
```

### 10.4 Migration to Brevo

Per Brevo migration FAQ:

> _"Für Shopware und Shopify funktioniert die 1-Klick-Produkt-Übernahme. Je nachdem, welche Anpassungen wir hier für Sie vorgenommen haben, unter Umständen in eingeschränkter Form."_

⚠️ **Migration nuances:**

- ✅ **Shopware + Shopify** 1-Click works v Brevo
- ⚠️ **Custom adjustments** may need rework
- ⚠️ **Some advanced features** may be limited

### 10.5 Schnittstellen migration

Per Brevo migration FAQ:

> _"Schnittstellen müssen in Ihrem Brevo Account neu eingerichtet werden. Bitte beachten Sie an dieser Stelle, dass nicht alle Integrationen, die für Newsletter2Go angeboten werden, für Brevo verfügbar sind."_

⚠️ **CRITICAL:**

- **Schnittstellen NOT migrate automatically**
- Must reconfigure v Brevo
- **Some Newsletter2Go integrations NOT available v Brevo**
- Custom dev may be needed

---

## 11. Conversion tracking flow

### 11.1 Conversion tracking setup

Per Newsletter2Go Help:

> _"Das Conversion-Tracking können Sie unter 'E-Mail-Einstellungen → Tracking' aktivieren. Hier erhalten Sie dann ein JavaScript-Snippet von uns, das Sie auf Ihrer Zielseite einbinden und mit Ihrer Account-ID..."_

```
Admin: E-Mail-Einstellungen → Tracking
   ↓
Activate Conversion-Tracking
   ↓
Newsletter2Go generates JavaScript snippet
   ↓
Snippet contains Account-ID
   ↓
Copy snippet
   ↓
Embed v website target pages:
- Landing pages
- Product pages
- Checkout success page
- Custom conversion events
   ↓
[Tracking active]
```

### 11.2 How tracking works

```
Newsletter sent
   ↓
Recipient clicks link
   ↓
**URL contains tracking parameters** (rmid, etc.)
   ↓
Lands on website
   ↓
**JavaScript snippet executes:**
- Captures tracking parameters
- Identifies specific email/campaign
- Tracks recipient activity
   ↓
Conversion event (e.g. purchase):
- Snippet records conversion
- Sends data to Newsletter2Go
   ↓
Reports show:
- Conversions per campaign
- ROI calculation
- Per-recipient conversion path
```

### 11.3 Comparison to modern tracking

⚠️ **Newsletter2Go's tracking is basic** vs. modern competitors:

| Aspect                      | Newsletter2Go     | Klaviyo / Modern |
| --------------------------- | ----------------- | ---------------- |
| **Setup**                   | Manual JS snippet | Auto-installed   |
| **Real-time**               | Limited           | Real-time        |
| **Multi-touch attribution** | No                | Yes              |
| **Custom events**           | Limited           | Extensive        |
| **Predictive analytics**    | No                | Yes              |
| **Cross-device tracking**   | Limited           | Yes              |

---

## 12. Form creation + Double Opt-in flow

### 12.1 Form creation

```
Marketer: Formulare → Neues Formular
   ↓
Configure:
- Form name
- Fields (text, email, phone, dropdown, etc.)
- **GDPR consent checkbox** (mandatory!)
- **Double Opt-in enabled** (default!)
- Captcha
- Style customization
- Success message
   ↓
Connect:
- Target Adressbuch
- Group assignment (if any)
- Trigger automation (if any)
   ↓
Save form
   ↓
Get embed code
   ↓
Paste na website
```

### 12.2 Double Opt-in (DSGVO compliance)

```
Visitor submits form
   ↓
Newsletter2Go receives:
- Validates email
- Captcha check
- GDPR consent recorded
- IP + timestamp logged
   ↓
**Status: Pending**
   ↓
Newsletter2Go sends **Bestätigungsmail** (confirmation email)
- Custom designed template
- Single CTA: "Anmeldung bestätigen"
- Confirmation URL with token
   ↓
**Recipient must click confirmation link**
   ↓
Newsletter2Go verifies:
- Token valid
- Email matches
- Not expired
   ↓
Status: Active
   ↓
IP + timestamp of confirmation logged
   ↓
**Full DSGVO audit trail:**
- Source form
- Submission timestamp
- Submission IP
- Consent text version
- Confirmation timestamp
- Confirmation IP
   ↓
Add to Adressbuch
   ↓
Trigger welcome automation (if configured)
```

### 12.3 Form migration challenge

⚠️ **Forms CANNOT migrate to Brevo:**

- **Forms must be rebuilt v Brevo**
- **Embed code on website changes**
- **Double Opt-in setup new**
- **GDPR fields re-configured**
- **Significant migration effort**

### 12.4 Form management

```
Formulare → All forms list
   ↓
Per form:
- Edit
- Duplicate
- Pause submissions
- View statistics:
  - Submissions count
  - Conversion rate
  - Recent activity
- Delete
```

---

## 13. Basic automation execution

### 13.1 Automation overview

⚠️ **Limited automation** (legacy product):

- Basic welcome series
- Birthday emails
- Simple follow-up sequences
- **No complex branching**
- **No multi-channel**

### 13.2 LITE10 limitation

- **No automation v LITE10!**
- Higher tiers required
- Common pre-acquisition Bestandskunden have automation

### 13.3 Automation activation flow

```
User builds simple workflow
   ↓
Configure:
- Trigger (subscribed, tag added, date)
- Wait period
- Send email
- Basic condition (limited)
   ↓
Test mode
   ↓
Activate
   ↓
[Workflow runs]
```

### 13.4 Common automation use cases

#### Welcome series

```
Trigger: Subscribed to Adressbuch
   ↓
Send Welcome Email 1
   ↓
Wait 3 days
   ↓
Send Email 2
   ↓
End
```

#### Birthday automation

```
Trigger: Birthday today (date field)
   ↓
Send Birthday Email
   ↓
End
```

#### Simple follow-up

```
Trigger: 7 days after subscription
   ↓
Send follow-up Email
   ↓
End
```

### 13.5 Migration impact on automation

Per Brevo migration FAQ:

> _"Andere Daten, wie ... Aktivitäten ..."_

⚠️ **Automation activities NOT migrate:**

- Workflow definitions: must rebuild
- Activation history: lost
- Active workflow members: must re-trigger
- Performance data: lost

### 13.6 Activities lost

**"Aktivitäten" (activities) include:**

- Workflow execution log
- Step completion records
- Active subscribers v workflows
- Performance metrics per step

All lost during migration → fresh start v Brevo.

---

## 14. Migration Assistant to Brevo (detailed flow)

### 14.1 Migration request flow

```
User decides to migrate
   ↓
Option A: Wait for Newsletter2Go to enable migration
   - Brevo phases rollout
   - Lite users first
   - Complex accounts later
   ↓
Option B: Contact Brevo support directly
   - Email Brevo support
   - Request migration
   - Brevo team evaluates
   - Migration activated v dashboard
   ↓
[Migration option available]
```

### 14.2 Migration activation

Per Brevo migration FAQ:

> _"Sobald die Migration für Sie aktiviert ist, finden Sie in Ihrem Account auf dem Dashboard einen separaten Bereich, mit dem Sie unseren Migrations-Assistenten starten können."_

```
Brevo activates migration in account
   ↓
User logs into Newsletter2Go dashboard
   ↓
**New "Migration zu Brevo" section appears**
   ↓
Click "Migration starten"
   ↓
[Migrations-Assistent opens]
```

### 14.3 Migration Assistant configuration

```
Migrations-Assistent:
   ↓
Step 1: Choose target Brevo account
- Existing Brevo account OR
- Create new Brevo account
   ↓
Step 2: Email verification
- Newsletter2Go account email
- Brevo account email
- **Must match!** (if existing Brevo account)
   ↓
Step 3: Select data to migrate
- Which Adressbücher
- All vs. specific
- Custom fields (Merkmale)
- Static groups
   ↓
Step 4: Configure Newsletter2Go account post-migration
- Keep active (paid subscription)
- Switch to LITE10 (free)
- Schedule deletion (written request needed)
   ↓
Step 5: Schedule
- Migration runs OVERNIGHT
- User informed about timing
   ↓
Confirm migration
   ↓
[Migration queued]
```

### 14.4 Email match requirement

Per Brevo migration FAQ:

> _"Sollten Sie zu einem bereits vorhandenen Brevo Account migrieren wollen, muss die E-Mail-Adresse Ihres Newsletter2Go Accounts und des Brevo Accounts übereinstimmen."_

**Critical:**

- **Same email** required for both accounts (if existing Brevo)
- If different emails:
  - Create new Brevo account, OR
  - Change one email to match

### 14.5 Migration execution (overnight)

Per Brevo migration FAQ:

> _"Um Sie in Ihren Abläufen so wenig wie möglich zu beeinträchtigen, führen wir die Migration über Nacht durch. Sie gehen also mit Ihrem Newsletter2Go in den Feierabend und starten mit Brevo Ihren neuen Tag. Ganz unkompliziert!"_

```
Evening: User confirms migration
   ↓
Overnight (Brevo systems):
- Extract Newsletter2Go data
- Transform to Brevo format
- Load into Brevo account
- Validate completeness
- Send confirmation email
   ↓
Morning: User wakes up
   ↓
Brevo account ready:
- Active recipients available
- Adressbücher mapped
- Custom fields preserved
- Static groups intact
   ↓
[Migration complete]
```

### 14.6 Cost

Per Brevo migration FAQ:

> _"Die Migration ist kostenfrei."_

- **FREE migration**
- No charges
- No fees for assistance

### 14.7 One-time migration

Per Brevo migration FAQ:

> _"Die aktuelle Migration sieht nicht vor, nach einem Transfer noch weitere Daten von Ihrem Newsletter2Go zu ihrem Brevo Account zu migrieren. In der bisherigen Planung der Migration liegt es in Ihrer Verantwortung, diese auf Brevo zu übertragen."_

⚠️ **One-time process:**

- **No incremental sync** post-migration
- **No follow-up migrations** of new data
- **User responsibility** to manage future data

**Implications:**

- If still adding contacts to Newsletter2Go post-migration: **must manually sync to Brevo**
- Best practice: **stop using Newsletter2Go for new data** after migration

### 14.8 Post-migration verification

```
Morning: User logs into Brevo
   ↓
Verify migrated data:
- Active recipients count matches?
- Adressbücher properly mapped?
- Custom fields populated?
- Static groups intact?
   ↓
If issues: contact Brevo support
   ↓
Recreate non-migrated items:
- Forms (rebuild)
- Templates (rebuild premium)
- Automation workflows (rebuild)
- Schnittstellen (reconfigure)
- Reports baseline (start fresh)
```

---

## 15. Post-migration account management flow

### 15.1 Newsletter2Go account post-migration

Per Brevo migration FAQ:

> _"Ihr Newsletter2Go Account bleibt nach der Migration weiterhin unverändert bestehen, sowie auch Ihr aktuelles Abonnement."_

**After migration:**

- ✅ Newsletter2Go account **stays active**
- ✅ Subscription **unchanged** (still paying current plan)
- ✅ All data **still in Newsletter2Go**
- ✅ Can use both platforms (transition period)

### 15.2 3 Options post-migration

#### Option A: Keep Newsletter2Go active s subscription

```
Continue using BOTH platforms
   ↓
Pay pro Newsletter2Go subscription
+ Pay pro Brevo (if paid tier)
   ↓
Maximum flexibility but most expensive
   ↓
Use cases:
- Transition period
- Testing both
- Avoid disruption
```

#### Option B: Switch Newsletter2Go to LITE10 (free)

Per Brevo migration FAQ:

> _"Sie möchten Ihren Newsletter2Go Account bestehen lassen, aber nicht dafür zahlen, so ändern Sie Ihr Paket auf LITE10 bzw. kündigen Sie das aktuelle Abonnement. Im LITE10 Paket steht Ihnen die Software kostenfrei, in eingeschränkter Form zur Verfügung."_

```
Migrate primary use to Brevo
   ↓
Newsletter2Go: Konto → Abo verwalten → Switch to LITE10
   ↓
Cancel current subscription billing
   ↓
LITE10 free tier activates
   ↓
[Free backup access continues]
   ↓
Use cases:
- Backup if Brevo issues
- Reference historical data
- Familiarity preserved
- **Most popular post-migration option**
```

#### Option C: Delete Newsletter2Go account completely

Per Brevo migration FAQ:

> _"Sie haben selbstverständlich die Möglichkeit den Account und alle dazugehörigen Daten löschen zu lassen. Hierzu erteilen Sie uns bitte schriftlich von der im Account hinterlegten E-Mail-Adresse einen expliziten Auftrag."_

```
Decide to fully transition to Brevo
   ↓
Email Brevo support from account email
   ↓
Written request: "Bitte löschen Sie meinen Newsletter2Go Account und alle Daten"
   ↓
Brevo support processes:
- Verify email match
- Confirm intent
- Execute deletion
- Confirm completion
   ↓
[Account + data fully deleted]
   ↓
**Cannot recover** post-deletion
```

### 15.3 Recommended approach

**Best practice for most users:**

```
Day 1: Use Migration Assistant
Day 2: Verify migration in Brevo
Day 3-7: Recreate forms, premium templates, workflows
Day 8: Test Brevo for normal use
Day 9-30: Use both platforms transition
Day 30+: Switch Newsletter2Go to LITE10 (free)
After Brevo proves stable: Delete Newsletter2Go account
```

### 15.4 Unsubscribes after migration

Per Brevo migration FAQ:

> _"Was passiert mit meinen Empfängern die sich abmelden, nachdem ich mein Account zu Brevo migriert habe?"_
>
> _"Die aktuelle Migration sieht nicht vor, nach einem Transfer noch weitere Daten von Ihrem Newsletter2Go zu ihrem Brevo Account zu migrieren. In der bisherigen Planung der Migration liegt es in Ihrer Verantwortung, diese auf Brevo zu übertragen."_

⚠️ **Unsubscribes post-migration:**

- If still using Newsletter2Go: unsubscribe stays on Newsletter2Go only
- **Not synced to Brevo automatically**
- **Could send to "unsubscribed" recipients v Brevo**
- **Best practice: stop using Newsletter2Go** post-migration

---

## 16. What migrates vs. what doesn't

### 16.1 Data flow diagram

```
NEWSLETTER2GO ACCOUNT
   ↓
[Migration Assistant Filter]
   ↓
   ┌─ Migrates ✅
   │   ├─ Active recipients (email, name, status)
   │   ├─ Custom fields (Merkmale)
   │   ├─ Adressbücher (structure + organization)
   │   ├─ Static groups (manual memberships)
   │   ├─ Standard newsletter templates
   │   └─ 1-Click-Produktübernahme (Shopware + Shopify support)
   │
   └─ Does NOT migrate ❌
       ├─ Forms (Formulare)
       ├─ Activities (workflow execution)
       ├─ Inactive recipients (auto-deleted after 7 days)
       ├─ Reports (historical performance)
       ├─ Premium templates (technical limitation)
       ├─ Schnittstellen (must reconfigure)
       ├─ Conversion tracking history
       ├─ Some integrations (not available v Brevo)
       └─ Custom configurations (varies)
   ↓
BREVO ACCOUNT
   ↓
Post-migration:
- Migrated data accessible
- Forms must be rebuilt
- Templates premium must be rebuilt
- Workflows must be rebuilt
- Integrations must be reconfigured
```

### 16.2 Migration data table

| Data                            |   Migration status    | Recovery option                        |
| ------------------------------- | :-------------------: | -------------------------------------- |
| Active recipients               |   ✅ Full transfer    | –                                      |
| Email + name                    |      ✅ Standard      | –                                      |
| Custom fields (Merkmale)        | ✅ Structure + values | –                                      |
| Adressbücher                    |     ✅ Structure      | –                                      |
| Static groups                   |   ✅ Manual groups    | –                                      |
| Standard templates              |      ✅ Migrated      | –                                      |
| Premium templates               |        ❌ Lost        | Rebuild manually                       |
| 1-Click product takeover        | ✅ Shopware + Shopify | Some custom may need work              |
| Forms (Formulare)               |        ❌ Lost        | Rebuild in Brevo                       |
| Activities (workflow execution) |        ❌ Lost        | Accept fresh start                     |
| Inactive recipients             |    ❌ Auto-deleted    | Export within 7 days if needed         |
| Reports (Berichte)              |        ❌ Lost        | Export before migration                |
| Schnittstellen (interfaces)     |        ❌ Lost        | Reconfigure in Brevo                   |
| Custom integrations             |       ❌ Varies       | Custom dev may be needed               |
| Conversion tracking history     |        ❌ Lost        | Fresh tracking v Brevo                 |
| Dynamic groups                  |        varies         | Static migrates, dynamic less reliable |

### 16.3 Pre-migration preparation checklist

```
Before clicking "Start migration":

✅ Export reports for historical reference
✅ Export inactive recipients (within 7 days)
✅ Document premium template designs (screenshots, etc.)
✅ Document custom Schnittstellen configurations
✅ List all forms for rebuilding v Brevo
✅ List all workflows for rebuilding v Brevo
✅ Note all integrations for verification v Brevo
✅ Backup any custom code
✅ Communicate s team about migration date
✅ Plan post-migration tasks (form rebuilding, etc.)
```

---

## 17. Account closure flow (3 options)

### 17.1 Option A: Stay s Newsletter2Go (no migration)

```
User decides NOT to migrate (yet)
   ↓
Continue normal usage:
- All features active
- Subscription continues
- No changes
   ↓
[Status quo maintained]
   ↓
But: eventual sunset coming
```

### 17.2 Option B: Migration + LITE10 (free backup)

```
User migrates to Brevo s assistant
   ↓
Post-migration: Konto → Abo verwalten
   ↓
Select LITE10 tier
   ↓
Cancel current subscription billing
   ↓
LITE10 activates:
- 1000 emails/month free
- 1 Adressbuch
- No automation
- Basic features
   ↓
[Free backup access preserved]
```

### 17.3 Option C: Full account deletion

```
User decides to fully exit Newsletter2Go
   ↓
Send written request to Brevo support
   ↓
Request format:
- From account-registered email
- Subject: "Newsletter2Go Account Löschung"
- Body: Explicit request to delete account + all data
- Optional: confirmation of migration completed
   ↓
Brevo support:
- Verifies email match
- Confirms intent (may follow up)
- Schedules deletion
- Executes deletion
- Confirmation email
   ↓
**All data permanently deleted**
   ↓
[Account closed forever]
```

### 17.4 Per Brevo on deletion

> _"Sie haben selbstverständlich die Möglichkeit den Account und alle dazugehörigen Daten löschen zu lassen. Hierzu erteilen Sie uns bitte schriftlich von der im Account hinterlegten E-Mail-Adresse einen expliziten Auftrag."_

**Requirements pro deletion:**

- **Written request** (not phone)
- **From account email** (verification)
- **Explicit deletion request**
- **GDPR-compliant process**

### 17.5 Why deletion is "manual"

- **Prevents accidental deletion**
- **Verification of intent**
- **Compliance documentation**
- **Forces consideration**

vs. self-service deletion which other platforms offer.

---

## 18. Support flow (6-day, German)

### 18.1 Support hours

Per Brevo (since April 2020):

- **Monday-Friday:** Standard business hours
- **Saturday 9:00-18:00:** Email support
- **Sunday:** Closed
- **6-day support week**

### 18.2 Support channels

- **Email / Ticket system**
- **Phone** (specific hours)
- **Help center / Knowledge base**
- **FAQ documentation**
- **Migration support**

### 18.3 Support flow

```
User has issue / question
   ↓
Options:
A) Help Center first (self-service)
B) Email ticket
C) Phone (during hours)
   ↓
Email ticket:
- Submit via UI
- German + English support
- Newsletter2Go-specific team v Berlíně
- 6-day response week
   ↓
[Response within hours/day]
```

### 18.4 Berlin team retention

Per Brevo:

> _"We'll still have the same office and Newsletter2Go team in Berlin."_

**Original Newsletter2Go team retained:**

- **Familiar with legacy product**
- **German-speaking**
- **Newsletter2Go expertise**
- **Migration knowledge**

### 18.5 Migration support

```
User wants to migrate
   ↓
Contact Brevo support:
- Email or phone
- Request migration activation
   ↓
Brevo team:
- Reviews account
- Activates migration in dashboard
- Provides guidance
- Available throughout process
   ↓
Post-migration:
- Help with rebuilding forms/templates
- Brevo onboarding assistance
- Issue resolution
```

### 18.6 Knowledge base structure

```
newsletter2go-help-de.sendinblue.com (still active)
   ↓
Sections:
- Allgemeine Informationen (general info)
- FAQs Migration (migration FAQs)
- Adressbuch (recipient management)
- Newsletter erstellen (creating newsletters)
- Schnittstellen (integrations)
- E-Mail-Einstellungen
- And more
   ↓
German language primary
   ↓
Comprehensive documentation
```

### 18.7 Live chat not available

- **No live chat** (typical for legacy product)
- Email + phone primary
- Help center self-service

---

## 19. DSGVO + Right to Be Forgotten flow

### 19.1 DSGVO compliance (preserved)

Per Brevo:

> _"As always, we'll continue to maintain the highest standards of data protection and maintain our servers in Germany."_

**Continued compliance:**

- **Servers v Německu**
- **DSGVO-compliant software**
- **Audit trail per consent**
- **Double Opt-in standard**
- **DPA available**
- **No new contract needed** (legal continuity)

### 19.2 Right to Be Forgotten flow

```
Recipient requests deletion (DSGVO)
   ↓
Method A: Admin manual (account holder)
- Login to Newsletter2Go
- Find recipient v Adressbuch
- Delete
- Auto-deletion within 7 days
- Audit log

Method B: API DELETE
- External system calls API
- Deletes recipient
- Audit log

Method C: Self-service preference center (some setups)
- Recipient clicks "Daten löschen" in email
- Self-service deletion request

Method D: Email request to support
- Recipient emails support
- Support processes deletion
   ↓
Confirmation email to recipient (DSGVO requirement)
   ↓
Data status:
- Active → Inactive (immediately)
- Inactive 7 days → fully deleted
- Anonymized + encrypted in interim
   ↓
[Data permanently removed]
```

### 19.3 Inactive recipient policy

⚠️ **UNIQUE Newsletter2Go policy:**

- **7-day window** after marking inactive
- **Anonymized + encrypted** in database
- **Auto-deleted** after 7 days

**Implications:**

- **Faster cleanup** than other platforms
- **DSGVO-friendly** (data minimization)
- **Migration challenge** (cannot export inactive after 7 days)

### 19.4 DSAR (Data Subject Access Request)

```
Recipient requests their data
   ↓
Admin: Generate GDPR export
OR Email request to support
   ↓
Newsletter2Go produces:
- Profile data (Adressbuch entry)
- Activity events (limited - per 7-day rule)
- Communication history
- Consent records
   ↓
Provide within 30 days (DSGVO requirement)
```

### 19.5 DPA (Auftragsverarbeitungsvertrag)

- **Continuity from pre-acquisition** DPA
- **No new contract needed**
- **Same standards**
- **Available v němčině**

---

## 20. Datová mapa: co vidí kdo

| Data                        | Owner | Add. user |   Recipient   |    API    |   Brevo Support   |  Brevo Sales   |
| --------------------------- | :---: | :-------: | :-----------: | :-------: | :---------------: | :------------: |
| Account settings            |  ✅   | per role  |      ❌       | per scope |  read s consent   | read s consent |
| Billing                     |  ✅   |    ❌     |      ❌       | per scope |  read s consent   | read s consent |
| User management             |  ✅   |    ❌     |      ❌       | per scope |  read s consent   | read s consent |
| All Adressbücher            |  ✅   | per role  |   jen sebe    | per scope |  read s consent   |       –        |
| Active recipients           |  ✅   | per role  |   jen sebe    |    ✅     |       read        |       –        |
| Inactive recipients (7-day) |  ✅   | per role  |      ❌       | per scope |       read        |       –        |
| Custom fields (Merkmale)    |  ✅   | per role  |    jen své    |    ✅     |       read        |       –        |
| Static groups               |  ✅   | per role  |       –       |    ✅     |       read        |       –        |
| Campaigns                   |  ✅   | per role  | jen co dostal |    ✅     |       read        |       –        |
| Send campaigns              |  ✅   | per role  |      ❌       |    ✅     |        ❌         |       ❌       |
| Templates (standard)        |  ✅   | per role  |       –       |    ❌     |       read        |       –        |
| Templates (premium)         |  ✅   | per role  |       –       |    ❌     |       read        |       –        |
| Forms                       |  ✅   | per role  |    submit     | per scope |       read        |       –        |
| Mediathek                   |  ✅   | per role  |       –       | per scope |       read        |       –        |
| 1-Click product takeover    |  ✅   | per role  |       –       | per scope |       read        |       –        |
| Schnittstellen              |  ✅   | per role  |       –       | per scope |       read        |       –        |
| Conversion tracking         |  ✅   | per role  |       –       | per scope |       read        |       –        |
| Reports                     |  ✅   | per role  |      ❌       |    ✅     |       read        |       –        |
| Automation (basic)          |  ✅   | per role  |      ❌       |    ✅     |       read        |       –        |
| Migration assistant         |  ✅   | per role  |      ❌       |    ❌     | activate + assist |    promote     |
| DSGVO delete                |  ✅   | per role  |    request    |    ✅     |      execute      |       –        |

---

## 21. Známé úzkoprofilové místa

### 21.1 Legacy product status

⚠️ **Newsletter2Go is legacy in 2026:**

- **No new feature development** (likely)
- **No new customer acquisition**
- **Eventual sunset announced** (no date)
- **Brevo investment focus** elsewhere

### 21.2 Migration limitations critical

⚠️ **What's lost during migration:**

- **Forms** (rebuild required)
- **Activities** (workflow history)
- **Inactive recipients** (after 7 days)
- **Reports** (historical performance)
- **Premium templates**
- **Custom Schnittstellen**

### 21.3 7-day inactive deletion (DSGVO-friendly but migration challenge)

⚠️ **Inactive recipients auto-delete after 7 days:**

- DSGVO-positive (data minimization)
- BUT migration challenge:
  - If migration delayed beyond 7 days
  - Inactive recipients lost
  - Cannot recreate in Brevo

### 21.4 One-time migration

⚠️ **No incremental sync:**

- Migration is one-time event
- No follow-up sync
- New Newsletter2Go data post-migration: user must manually transfer
- Best to stop using Newsletter2Go post-migration

### 21.5 Schnittstellen not fully available v Brevo

Per Brevo migration FAQ:

> _"nicht alle Integrationen, die für Newsletter2Go angeboten werden, für Brevo verfügbar sind"_

⚠️ **Some integrations unavailable v Brevo:**

- Custom development may be needed
- Migration may break some workflows
- Test thoroughly before fully transitioning

### 21.6 Premium templates rebuild

⚠️ **Premium templates DO NOT migrate:**

- Significant investment may be lost
- Rebuild from scratch v Brevo
- Time-consuming
- May lose design consistency

### 21.7 Forms rebuild required

⚠️ **Forms rebuild v Brevo:**

- Embed code on website changes
- Double Opt-in setup new
- GDPR fields re-configured
- Testing required

### 21.8 No new features

- **No AI features** (vs. modern competitors)
- **No autonomous AI**
- **No multi-channel orchestration** (SMS, WhatsApp)
- **No predictive analytics**
- **No advanced workflow branching**

### 21.9 Eventual sunset

- **Date not announced** (2026)
- **Will happen eventually**
- **Forced migration possible**
- **Plan ahead advised**

### 21.10 No new sign-ups

- **Cannot recommend** to new customers
- **Bestandskunden only**
- **Customer base shrinking** naturally
- **Less peer support**

### 21.11 Limited internationalization

- **DACH focus** primary
- **German + English** UI
- **Limited support** other languages
- **No CEE languages**

### 21.12 Less feature-rich vs. Brevo

- **Brevo cheaper** for similar volume
- **Brevo includes more** standard features
- **Brevo has multi-channel** (SMS, WhatsApp)
- **Brevo has CRM**
- **Brevo has landing pages**
- **Brevo has modern AI**

### 21.13 Reports lost during migration

- **Historical performance** lost
- **Year-over-year comparison** broken
- **Trend analysis** starts fresh
- **Export before migrating** crucial

### 21.14 Conversion tracking history lost

- **Historical conversion data** lost
- **Tracking setup new v Brevo**
- **ROI baselines** restart

### 21.15 No autonomous AI agents

- **No AI assistants** (vs. Klaviyo, HubSpot, Brevo Aura)
- **No generative AI**
- **Legacy product mindset**

---

## 22. Doporučení pro Bestandskunden v roce 2026

### 22.1 Strategic decision matrix

#### Scenario 1: Low-volume occasional sender (< 1000 emails/month)

**Recommendation:** Switch to LITE10 (free), continue as is

- No urgent need to migrate
- Free continued access
- Monitor sunset announcements
- Migrate when convenient

#### Scenario 2: Regular sender (1K-10K emails/month)

**Recommendation:** Plan migration to Brevo within 6-12 months

- Brevo cheaper for this volume
- More features
- Future-proofing
- Use migration assistant

#### Scenario 3: High-volume sender (>10K emails/month)

**Recommendation:** Migrate to Brevo NOW

- Significant cost savings
- Modern features
- Multi-channel options
- Better deliverability
- Future-proofing critical

#### Scenario 4: Heavy automation user

**Recommendation:** Migrate to Brevo s implementation plan

- Brevo automation more sophisticated
- Plan workflow rebuilding
- Use Brevo's new features
- Consider Brevo Aura AI

#### Scenario 5: Agency / Multi-account

**Recommendation:** Migrate to Brevo immediately

- Better multi-account management
- Modern features pro clients
- Better integration ecosystem
- Brevo Aura AI

### 22.2 Migration planning checklist

```
Before migration:
✅ Export all reports (historical reference)
✅ Export inactive recipients (within 7 days!)
✅ Screenshot all premium templates (rebuild reference)
✅ Document custom Schnittstellen configurations
✅ List all forms (with screenshots of embed locations on website)
✅ Document all workflows (for rebuild)
✅ List all integrations (for verification v Brevo)
✅ Backup any custom code / API integrations
✅ Communicate s team about migration date
✅ Plan post-migration tasks
✅ Schedule training na Brevo features

Migration day:
✅ Use Migration Assistant in dashboard
✅ Select all necessary data
✅ Confirm overnight schedule

Day after migration:
✅ Verify data in Brevo
✅ Check active recipients count
✅ Verify Adressbücher mapping
✅ Test custom fields
✅ Switch Newsletter2Go to LITE10 (free)

Week 1 post-migration:
✅ Rebuild critical forms in Brevo
✅ Update website embed codes
✅ Recreate premium templates
✅ Set up automation workflows
✅ Reconfigure Schnittstellen
✅ Activate conversion tracking
✅ Test all new setups

Month 1+:
✅ Use Brevo primarily
✅ Keep Newsletter2Go LITE10 as backup
✅ Train team na Brevo
✅ Explore Brevo modern features (multi-channel, AI)
✅ Consider full Newsletter2Go account deletion
```

### 22.3 What to evaluate before migration

```
Cost comparison:
- Current Newsletter2Go subscription cost
- Equivalent Brevo plan cost
- Savings calculation

Feature requirements:
- Current features used
- Brevo equivalents
- New Brevo features valuable

Effort estimate:
- Hours pro forms rebuild
- Hours pro templates rebuild
- Hours pro automation rebuild
- Hours pro integration reconfig
- Training time

Timing:
- Marketing campaign calendar
- Quiet period for migration
- Team availability
```

### 22.4 Key contacts

- **Brevo Support DE:** main contact channel
- **Newsletter2Go team v Berlíně:** legacy expertise
- **Migration team:** specific to migration assistance
- **Brevo Sales:** for upgrade scenarios

---

_Dokument zpracován z oficiálních zdrojů Brevo (newsletter2go-help-de.sendinblue.com + brevo.com/de/company/newsletter2go-login + brevo.com/de/landing/newsletter2go + brevo.com/newsletter2go) a analytických zdrojů (Tracxn, Crunchbase, Softools, IreneTheiss). Pro nejaktuálnější detaily migration je nutný engagement s Brevo support teamem._
