# Mailchimp – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v Mailchimpu prochází data, lidé a akce – od majitele účtu přes uživatele a integrace až po koncového příjemce emailu.

> Tento dokument doplňuje `01_Mailchimp_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** Mailchimp umí, tento popisuje, **kdo s tím interaguje a jak data tečou**.

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Role uživatelů v účtu](#2-role-uživatelů)
3. [Account-level flow: Owner perspektiva](#3-owner-flow)
4. [Admin flow](#4-admin-flow)
5. [Manager flow](#5-manager-flow)
6. [Author flow](#6-author-flow)
7. [Viewer flow](#7-viewer-flow)
8. [Subscriber flow: od přihlášení po unsubscribe](#8-subscriber-flow)
9. [Email lifecycle: od kompozice k inboxu](#9-email-lifecycle)
10. [Automation Flow execution](#10-automation-flow-execution)
11. [E-commerce flow](#11-e-commerce-flow)
12. [API & Integration flow](#12-api-integration-flow)
13. [Compliance flow (GDPR, právo být zapomenut)](#13-compliance-flow)
14. [Mailchimp ↔ ISP flow (deliverability)](#14-mailchimp-isp-flow)
15. [Agenturní / Multi-client flow](#15-agenturní-flow)
16. [Datová mapa: co vidí kdo](#16-datová-mapa)

---

## 1. Mapa aktérů

V Mailchimp ekosystému je sedm hlavních typů aktérů. **Pozor – Mailchimp nemá „master admin"** (nadřazený nad Ownerem) v běžném pochopení. Nejvyšší role v rámci jednoho účtu je **Owner**. „Master admin" v praxi znamená:

1. **Mailchimp Staff / Support** – interní zaměstnanci Intuitu/Mailchimpu; mají omezený debug přístup po explicitním souhlasu
2. **Agency Admin** – uživatel s přístupem k více klientským účtům (via Account Switcher), ale **v každém klientském účtu je jen běžný Admin** – není to nadřazená role nad Ownerem klienta

```
┌─────────────────────────────────────────────────────────────────┐
│                  MAILCHIMP ECOSYSTEM                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   [Mailchimp Staff (Intuit)] ── (limited debug access)          │
│              │                                                  │
│              ▼                                                  │
│   ┌────────────────────────────────┐                            │
│   │      ACCOUNT (top-level)       │                            │
│   │   ┌────────────────────────┐   │                            │
│   │   │  Owner (1 person)      │◄──┼── Billing, deletion, all   │
│   │   ├────────────────────────┤   │                            │
│   │   │  Admin (multiple)      │◄──┼── Same as Owner − close    │
│   │   ├────────────────────────┤   │                            │
│   │   │  Manager (multiple)    │◄──┼── Send campaigns, audience │
│   │   ├────────────────────────┤   │                            │
│   │   │  Author                │◄──┼── Create/edit, can't send  │
│   │   ├────────────────────────┤   │                            │
│   │   │  Viewer                │◄──┼── Reports only             │
│   │   └────────────────────────┘   │                            │
│   └────────────┬───────────────────┘                            │
│                │ sends to                                       │
│                ▼                                                │
│   [Subscribers / Contacts]    ── recipients                     │
│                │                                                │
│                ▼                                                │
│   [External: ISPs, Web, Apps] ── delivery, integrations, forms  │
└─────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér | Vstupní bod | Co dělá | Co vidí |
|---|---|---|---|
| **Owner** | Mailchimp login | Vše: billing, role, close account | Vše |
| **Admin** | Pozvánka od Owner/Admin | Vše kromě close account | Vše |
| **Manager** | Pozvánka od Admin+ | Posílá kampaně, audience, automation | Vše kromě billing, users |
| **Author** | Pozvánka | Tvoří kampaně, **nemůže odeslat** | Designs, audience, ne reports detailně |
| **Viewer** | Pozvánka | Read-only reports | Reports + dashboards |
| **Subscriber** | Sign-up form / import | Otevírá, klikne, manage preferences, unsubscribe | Jen své emaily + preference center |
| **API klient** | API key / OAuth | Cokoliv povolí klíč | Co API endpointy vrací |
| **Integrace (Shopify, WP)** | OAuth/API | Synchronizuje data | Co umožní integrace |
| **Mailchimp Staff** | Interní | Debug/support | Po explicitním souhlasu |
| **ISP (Gmail, Outlook...)** | SMTP příjem | Doručuje / filtruje / posílá feedback | Email + autentizační hlavičky |

---

## 2. Role uživatelů (přesné permission matrix)

Mailchimp používá **fixní 5-role model** bez možnosti custom rolí ani granular toggles. Permissions jsou bundlované, neexistuje per-audience scoping.

### 2.1 Matrix permissions

| Akce | Owner | Admin | Manager | Author | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|
| **Billing** |  |  |  |  |  |
| Změnit plán | ✅ | ✅ | ❌ | ❌ | ❌ |
| Aktualizovat kartu | ✅ | ✅ | ❌ | ❌ | ❌ |
| Stáhnout faktury | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Account management** |  |  |  |  |  |
| Pozvat uživatele | ✅ | ✅ | ❌ | ❌ | ❌ |
| Změnit user role | ✅ | ✅ | ❌ | ❌ | ❌ |
| Revoke user access | ✅ | ✅ (krom Owner) | jen svůj | jen svůj | jen svůj |
| Transfer Ownership | ✅ | ❌ | ❌ | ❌ | ❌ |
| Close account | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Audience** |  |  |  |  |  |
| Create audience | ✅ | ✅ | ✅ | ❌ | ❌ |
| Import contacts | ✅ | ✅ | ✅ | ❌ | ❌ |
| Export contacts | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit subscriber profile | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete subscriber (GDPR) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage tags/groups/segments | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage signup forms | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Campaigns** |  |  |  |  |  |
| Create campaign | ✅ | ✅ | ✅ | ✅ | ❌ |
| Edit campaign | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Send campaign** | ✅ | ✅ | ✅ | **❌** | ❌ |
| Schedule campaign | ✅ | ✅ | ✅ | ❌ | ❌ |
| Cancel scheduled | ✅ | ✅ | ✅ | ❌ | ❌ |
| Pause/resume | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Templates** |  |  |  |  |  |
| Create template | ✅ | ✅ | ✅ | ✅ | ❌ |
| Delete template | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Automation** |  |  |  |  |  |
| Create flow | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Activate flow** | ✅ | ✅ | ✅ | ❌ | ❌ |
| Pause/edit live flow | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Integrations & API** |  |  |  |  |  |
| Connect integration | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create API key | ✅ | ✅ | ✅ | ✅ | ❌ |
| Manage webhooks | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Domains** |  |  |  |  |  |
| Add/verify domain | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage DKIM/DMARC | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Reports** |  |  |  |  |  |
| View reports | ✅ | ✅ | ✅ | ✅ | ✅ |
| Export reports | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Add-ons** |  |  |  |  |  |
| Buy SMS credits | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage Mandrill | ✅ | ✅ | ❌ | ❌ | ❌ |

### 2.2 Speciální pravidla

- Účet **musí mít vždy 1 Ownera**. Před revoke Ownera nutno převést ownership.
- Když Owner převede ownership → automaticky se stává **Admin**.
- **Free plán = single user only** (jen Owner). Pro multi-user nutno Essentials+.
- **Počet seats per plán:**
  - Essentials: 3 (Owner + 2)
  - Standard: 5
  - Premium: unlimited
- Pozvánky **expirují** – po expiraci nutné re-invite.
- Pozvánka funguje na **email adresu** – příjemce musí mít vlastní Mailchimp účet (založí při akceptaci, nebo se napojí existující).
- Když Admin revoke jiného usera, **všechny API klíče vytvořené tím userem se okamžitě smažou**.

---

## 3. Owner flow

**Owner = osoba, která účet zakládá.** Je jediná role, kterou nelze udělit přes pozvánku – vzniká registrací.

### 3.1 Onboarding (první přihlášení)

```
1. Sign-up na mailchimp.com
   ↓
2. Email verification (ověření vlastní emailové adresy)
   ↓
3. Setup wizard:
   a. Industry selection
   b. Company size
   c. Marketing goals
   ↓
4. Audience creation (jméno listu, default from name/email, fyzická adresa pro CAN-SPAM)
   ↓
5. Domain authentication nudge (DKIM + DMARC via Entri nebo manuální DNS)
   ↓
6. Volba plánu (Free / 14-day trial Standard nebo Essentials)
   ↓
7. Připojení integrací (Shopify, WordPress...)
   ↓
8. První import / first signup form
   ↓
9. První kampaň
```

### 3.2 Kritické Owner-only akce

#### Transfer Ownership

```
Settings → Users → vybrat usera → Promote to Owner
   ↓
Confirmation modal (typicky 2FA + opětovné potvrzení emailem)
   ↓
Bývalý Owner se stává Admin
   ↓
Nový Owner může bývalého Admina kdykoliv revoke
```

#### Close Account

```
Profile → Settings → Account → Close account
   ↓
Mailchimp varuje o nevratnosti
   ↓
Volba: smazat všechna data nebo zachovat pro X dní
   ↓
Email confirmation
   ↓
Account uzavřen; data smazána per GDPR po retention období
```

### 3.3 Owner billing flow

```
Faktura/měsíční cyklus:
- Generace 1. den měsíce (nebo billing anniversary)
- Kontaktní počet zafixován k tomu dni
- Při překročení limitu během měsíce → overage charge na další faktuře (paid plans)
- Free plan při překročení = stop sending (žádné automatické přechody)
```

---

## 4. Admin flow

Admin má **stejná práva jako Owner kromě**: nemůže zavřít účet, nemůže transfer ownership, nemůže revoke Ownera.

### 4.1 Typický pracovní den Admina

```
Login → Dashboard
   ↓
Kontrola:
- Audience growth (last 24h signups, unsubscribes)
- Campaign performance (last sent campaign open rate)
- Automation flow stats (kontakty v progress)
- E-commerce revenue from email
   ↓
Akční rozhodnutí:
- Update segmentace
- Audit nedoručitelnosti
- Review user actions (kdo co poslal)
- Approve obsah kampaní od Authorů
```

### 4.2 User management workflow

```
Pozvat usera:
   Profile → Users → Invite a user
      ↓
   Email + role selection (Admin/Manager/Author/Viewer)
      ↓
   Send invite
      ↓
   Pozvánka v inboxu příjemce → click Accept
      ↓
   Login / Sign-up na Mailchimp
      ↓
   User je přidán s vybranou rolí
```

### 4.3 Domain authentication setup

Typicky první z větších úkolů Admina po onboardu:

```
Settings → Domains → Add a Domain
   ↓
Zadat doménu (ne free mailbox jako gmail.com)
   ↓
Email verification (Mailchimp pošle ověřovací email na adresu @té doméně)
   ↓
[Domain Verified]
   ↓
"Authenticate" tlačítko → výběr způsobu:
   A) Entri automatic (přihlášení k DNS provideru, automatický zápis)
   B) Manual DNS:
      - CNAME 1: k1._domainkey → dkim host
      - CNAME 2: k2._domainkey → dkim host
      - TXT: _dmarc → DMARC policy
   ↓
Wait for validation (5 min – 48h)
   ↓
[Domain Authenticated] – status zelený
   ↓
Email notification, že je hotovo
```

---

## 5. Manager flow

Manager je „výkonný" uživatel: tvoří, posílá, ale nemůže měnit účet samotný.

### 5.1 Daily flow

```
Login → Dashboard
   ↓
Create campaign:
   Campaigns → Create → Email
      ↓
   1. To: Audience selection + segment/tag/group
   2. From: From name + email (z verified domain)
   3. Subject: subject + preview text (s AI Subject Line Helper)
   4. Content: drag-drop editor / template
   5. Preview & test (send test email)
   6. Schedule or Send Now
      ↓
   Mailchimp zařazuje email do queue
      ↓
   ESP processing → ISP delivery
      ↓
   Real-time stats v Reports
```

### 5.2 Co Manager nemůže

- Pozvat nového usera (vidí jen Users list)
- Změnit billing
- Connect novou integraci
- Verify/authenticate domain
- Close account

### 5.3 Common stuck point

- Manager často potřebuje něco od Admina (DKIM, nová integrace) → typicky řešeno ticketem nebo Slack pingem v týmu.

---

## 6. Author flow

Author = „content creator". Pracuje primárně v Email Editoru.

### 6.1 Author's restricted workflow

```
Login → Vidí Dashboard read-only-ish
   ↓
Create email:
   - Campaigns → Create → Email
   - Plně edituje obsah, design, šablonu
   - Může uložit jako Draft
   - **Nemůže** stisknout "Send" nebo "Schedule"
   ↓
Save campaign as Draft
   ↓
Notify Manager+ via shared inbox / Slack
   ↓
Manager kampaň zkontroluje a odešle
```

### 6.2 Use case

- Externí copywriter v agentuře
- Junior marketér v týmu
- Klient, kterému dáváte přístup tvořit, ale nemá oprávnění poslat na celou listu

---

## 7. Viewer flow

Read-only přístup, primárně pro analytiku.

### 7.1 Viewer dashboard

```
Login → Dashboard (campaigns přehled)
   ↓
Reports section:
- Per-campaign reports (opens, clicks, revenue)
- Audience reports
- E-commerce reports
- Industry benchmarks
   ↓
Export CSV (✅ Viewer to umí, na rozdíl od mnoha jiných systémů)
   ↓
Nic dalšího nelze měnit
```

### 7.2 Use case

- Klient agentury, který chce vidět výsledky bez možnosti zasahovat
- Stakeholder, manažer
- Externí konzultant pro audit

---

## 8. Subscriber flow

Tohle je strana, kterou často marketéři podceňují. Subscriber má **vlastní řadu touchpointů s Mailchimpem**, často aniž by věděl, že je to Mailchimp.

### 8.1 Sign-up flow

#### Single opt-in

```
Vyplní form na vašem webu
   ↓
Form submit (JS → Mailchimp API nebo hosted)
   ↓
Mailchimp validuje:
- Email syntax
- Audience-level Honeypot / reCAPTCHA
- Duplicity check
- Already cleaned? → reject
   ↓
[Status: Subscribed] okamžitě
   ↓
Welcome email (pokud spuštěn flow trigger "Signs up")
```

#### Double opt-in (default)

```
Vyplní form
   ↓
Mailchimp odešle Confirmation email s confirm linkem
   ↓
[Status: Pending] – nezapočítává se do billing
   ↓
Subscriber klikne na confirm link
   ↓
Mailchimp ověří token + IP/timestamp + uloží jako důkaz consent
   ↓
[Status: Subscribed]
   ↓
Welcome email
```

> **Confirm email obsahuje:** "Yes, subscribe me to this list" button. Při kliku Mailchimp uloží IP, timestamp, user agent → audit trail pro GDPR.

### 8.2 Engagement lifecycle

```
[Subscribed]
   ↓
First campaign sent
   ↓
ISP doručuje → subscriber v inboxu
   ↓
Tracking pixel (1×1 GIF) v emailu loaduje obrázek z Mailchimp serveru
   ↓
Open zaznamenáno v Mailchimp (s timestampem, IP, device, email client)
   ↓
Click na link → Mailchimp click tracker:
   email-link → mailchimp.us10.list-manage.com/track?... → real-destination
   ↓
Click zaznamenán, redirect transparentní
   ↓
Subscriber Rating se zvyšuje (algoritmus engagement scoring 1–5 hvězd)
```

### 8.3 Preference Center flow

```
Subscriber klikne "Update preferences" v patičce
   ↓
Tokenizovaná URL (mailchimp hosted page)
   ↓
Vidí:
- Své merge field hodnoty (jméno, telefon...)
- Members of these groups: [checkboxy s vašimi groups]
- Možnost upravit / pause / unsubscribe
   ↓
Submit
   ↓
Audience field update + group membership update
   ↓
Profile updated webhook fires (if subscribed)
   ↓
Confirmation page
```

### 8.4 Unsubscribe flow

```
Subscriber klikne "Unsubscribe" v patičce nebo One-Click Unsubscribe v header (RFC 8058)
   ↓
Mailchimp unsubscribe page:
- "We've removed you" potvrzení
- Možnost: provide reason (optional)
   ↓
[Status: Unsubscribed]
   ↓
Webhook "unsubscribe" fires
   ↓
Subscriber stále počítán do billing (!) dokud někdo nearchivuje/nesmaže
   ↓
Pokud Resubscribe (nový form fill):
- Mailchimp pamatuje historii
- Vyžaduje re-confirmation
- Status: Pending → Subscribed
```

### 8.5 Forward to Friend

```
Email obsahuje *|FORWARD|* merge tag
   ↓
Subscriber klikne "Forward"
   ↓
Mailchimp hosted page: enter friend's email
   ↓
Mailchimp pošle email forward (originál + krátká poznámka)
   ↓
Forward tracked v Reports
```

### 8.6 Archive view

```
*|ARCHIVE|* merge tag → veřejná URL emailu
   ↓
Email lze sdílet, indexovat
   ↓
Audience má i archivní stránku: https://us10.campaign-archive.com/?id=...
```

### 8.7 Spam complaint

```
Subscriber v Gmailu klikne "Report spam"
   ↓
Gmail postmaster → Mailchimp feedback loop (FBL)
   ↓
Mailchimp automaticky:
- Označí jako Unsubscribed (s důvodem "Abuse")
- Spočítá complaint rate per kampaň
- Nad threshold (~0.1 %) může pozastavit account a vyžadovat audit
```

### 8.8 Hard bounce

```
ISP vrátí 5xx (mailbox neexistuje)
   ↓
Mailchimp označí jako [Cleaned]
   ↓
Cleaned se nepočítá do billing
   ↓
Cleaned už nelze "vzkřísit" – nutno re-import přes form (single opt-in by re-importu bere v potaz)
```

---

## 9. Email lifecycle: od kompozice k inboxu

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│  1. AUTHOR/MANAGER vytvoří kampaň v editoru                        │
│                            │                                       │
│                            ▼                                       │
│  2. Audience selection: list + segment/tag filter                  │
│                            │                                       │
│                            ▼                                       │
│  3. Schedule / Send Now                                            │
│                            │                                       │
│                            ▼                                       │
│  4. Mailchimp Queue: email se generuje per-recipient               │
│     (merge tagy se nahradí, dynamic content vyhodnotí)             │
│                            │                                       │
│                            ▼                                       │
│  5. Reputation check: shared/dedicated IP, sender reputation       │
│                            │                                       │
│                            ▼                                       │
│  6. Throttling: Mailchimp pomalu napumpuje do internetu            │
│     (i kdyby tlačítko Send bylo "now", samotné posílání trvá       │
│     v minutách až hodinách u velkých listů)                        │
│                            │                                       │
│                            ▼                                       │
│  7. SMTP outbound:                                                 │
│     - From: your@yourdomain.com (po authentication)                │
│     - Return-Path: bounces@bounces.mcsv.net (Mailchimp)            │
│     - DKIM signed s vaším k1._domainkey                            │
│     - List-Unsubscribe header                                      │
│                            │                                       │
│                            ▼                                       │
│  8. ISP příjem (Gmail/Outlook/Yahoo):                              │
│     - SPF check (často FAIL kvůli return-path, OK)                 │
│     - DKIM verify (PASS)                                           │
│     - DMARC alignment (PASS přes DKIM)                             │
│     - Reputation check IP + domain                                 │
│     - Content filters (spam keywords, attachments)                 │
│     - Engagement history (recipient otvíral dříve od vás?)         │
│                            │                                       │
│                            ▼                                       │
│  9. Routing:                                                       │
│     - Inbox / Primary tab                                          │
│     - Promotions tab (Gmail)                                       │
│     - Spam folder                                                  │
│     - Rejected (bounce)                                            │
│                            │                                       │
│                            ▼                                       │
│ 10. Subscriber otevře:                                             │
│     - 1×1 pixel loading → Open event                               │
│     - (Apple MPP může pre-loadnout, false positive)                │
│                            │                                       │
│                            ▼                                       │
│ 11. Subscriber klikne:                                             │
│     - Mailchimp proxy redirect → Click event                       │
│     - Subscriber arrives at landing/web                            │
│                            │                                       │
│                            ▼                                       │
│ 12. Konverze (e-commerce):                                         │
│     - Pokud connected store → Mailchimp tracking script naváže    │
│     - Order webhook from store → revenue attribution              │
│                            │                                       │
│                            ▼                                       │
│ 13. Real-time reporting v Mailchimp UI                             │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## 10. Automation Flow execution

### 10.1 Flow build phase

```
Manager+ vytváří flow:
   Automations → Build from scratch
      ↓
   1. Name + Audience selection
   2. Choose trigger (1–3 triggers in Standard+)
   3. Add filters (až 5 per trigger)
   4. Plot kroky na canvas: Rules, Actions
   5. Connect/save journey
   6. Save as Draft
      ↓
   Test run (s test contacts)
      ↓
   **Activate**
      ↓
   [Status: Active]
```

### 10.2 Runtime: kontakt vstupuje do flow

```
Trigger fires (např. "Tag added: VIP")
   ↓
Mailchimp scheduler vyhodnotí filtry
   ↓
Pokud kontakt projde filtry → ZAŘAZEN do flow
   ↓
Začíná na prvním kroku
   ↓
Step-by-step execution:
   - Wait step → kontakt sedí v queue do času
   - Conditional split → check podmínky → větvení
   - Send email step → vygeneruje + odešle email
   - Tag action → updatne profile
   - Update field → updatne merge field
   ↓
Pokud Exit condition splněna → kontakt opustí flow
   ↓
Pokud dojde k poslednímu kroku → kontakt completed
```

> **Důležité:** Automation flow triggery **se aplikují jen na události po aktivaci**. Existující kontakty, kteří už splňují podmínku, **nevstoupí zpětně**.

### 10.3 Per-contact perspective

Kontakt může být v **několika flow current**, pokud spouštěče se nepřekrývají. Mailchimp neomezuje souběh.

### 10.4 Pause / Edit live flow

```
Active flow → Pause
   ↓
Kontakty zůstávají v aktuálním kroku (zamrznou)
   ↓
Edit: lze měnit obsah kroků, lze přidat kroky
   ↓
Resume → kontakty pokračují
   ↓
**Archive** = trvalé ukončení, kontakty vystoupí, reporty zachovány
```

### 10.5 Customer Journeys API trigger (Standard+)

Speciální typ triggeru pro externí systémy:
```
Flow má "Customer Journey API condition" jako vstupní bod
   ↓
Mailchimp vygeneruje unikátní URL s {journey_id} a {step_id}
   ↓
Externí systém volá POST na URL s contact emailem
   ↓
Mailchimp zařadí kontakt do flow
```

Užitečné pro: CRM-driven journeys, external event triggers.

---

## 11. E-commerce flow

### 11.1 Store connection flow

```
Admin → Integrations → Shopify (nebo WooCommerce, etc.)
   ↓
OAuth flow do storu
   ↓
Mailchimp získá API přístup
   ↓
Initial sync:
- Pull customers (s historií)
- Pull orders (do back-history limit)
- Pull products (catalog)
   ↓
Customers se importují do Audience (jako Non-subscribed nebo Subscribed dle marketing-opt-in flagu)
   ↓
Continuous webhook listener:
- Customer created
- Order created/updated
- Cart abandoned
- Product updated
```

### 11.2 Abandoned cart flow

```
Customer přidá do košíku → Shopify pošle webhook do Mailchimp
   ↓
Mailchimp eviduje cart s products, total, timestamp
   ↓
Pokud Customer nedokončí checkout v X minutách (typicky 1h):
   ↓
Automation trigger "Abandons cart" fires (pokud aktivní flow)
   ↓
Mailchimp pošle abandoned cart email s product blokem:
- Image
- Name
- Price
- "Complete purchase" link s checkout URL
```

### 11.3 Revenue attribution

```
Email obsahuje klikací link s UTM (auto-generováno Mailchimpem)
   ↓
Subscriber klikne → arrives na web
   ↓
Web má Mailchimp tracking script → cookie set
   ↓
Subscriber nakoupí
   ↓
Order webhook → Mailchimp matchuje:
- 90-day attribution window default
- Last-click model
   ↓
Revenue attribuován kampani
```

### 11.4 Product recommendations

```
Mailchimp ML model trénován na store datech:
- Co kdo nakupuje
- Co kdo prohlíží
- Similar customers
   ↓
V email editoru → "Product Recommendations" block
   ↓
Block se per-recipient personalizuje
   ↓
Klik = trackováno
   ↓
Vyhodnocení A/B (Standard+)
```

---

## 12. API & Integration flow

### 12.1 Auth flow

#### API Key (basic auth)

```
User (Author+) → Profile → Extras → API keys → Create key
   ↓
Mailchimp generuje:
- Key string: abc123-us10
- Datacenter: us10
   ↓
User uloží do své aplikace
   ↓
Use:
curl -u "anystring:abc123-us10" https://us10.api.mailchimp.com/3.0/...
```

> Pozn.: API key je vázán na konkrétního usera. Když user opustí účet, **klíč se okamžitě smaže**.

#### OAuth2 (pro 3rd party apps)

```
3rd party app inicializuje OAuth flow
   ↓
Redirect na Mailchimp authorize URL
   ↓
User schválí oprávnění
   ↓
Mailchimp vrátí authorization code
   ↓
App vymění code za access token (POST /oauth2/token)
   ↓
App používá Bearer token pro API volání
```

### 12.2 Typický integration flow (Webflow → Mailchimp)

```
Visitor vyplní form na Webflow webu
   ↓
Webflow → API call POST /lists/{id}/members
   - email_address
   - status_if_new: pending (double opt-in)
   - merge_fields: { FNAME, LNAME, ... }
   - tags: [ "source:webflow" ]
   ↓
Mailchimp vrací 201 Created nebo 200 OK
   ↓
Subscriber je v audience
```

### 12.3 Webhook flow

```
Admin nastaví webhook v Audience settings:
- URL: https://yoursite.com/mailchimp-webhook
- Events: subscribe, unsubscribe, profile, upemail, cleaned, campaign
   ↓
Když event nastane (např. unsubscribe):
   ↓
Mailchimp POST na URL:
   {
     "type": "unsubscribe",
     "data": { "email": "x@y.com", ... }
   }
   ↓
Vaše aplikace updatuje vlastní DB
```

### 12.4 Batch operations

Pro bulk updates:
```
POST /batches s array operací (max 500 per batch)
   ↓
Mailchimp vrací batch_id
   ↓
GET /batches/{id} pro polling status
   ↓
Mailchimp postupně zpracuje, finalizuje finished_operations
```

---

## 13. Compliance flow

### 13.1 GDPR Right to Be Forgotten

```
Subscriber kontaktuje firmu: "Vymažte mě"
   ↓
Admin/Manager: Audience → najít kontakt
   ↓
Více možností:
- "Unsubscribe" – opt-out, ale data zůstanou
- "Archive" – přesune do archive, nepočítá billing
- **"Permanently delete"** – kompletní výmaz
   ↓
"Permanently delete" otevírá GDPR-compliant flow:
- Confirmation modal
- Warning, že akce je nevratná
- Confirm
   ↓
Mailchimp maže:
- Profile data
- Activity history
- Tags / groups associations
- Survey responses
- E-commerce links (anonymizuje order pointers)
   ↓
**Důležité:** Email se přidá na "permanent delete" list – pokud někdo zkusí re-import, Mailchimp ho odmítne (důkaz výmazu).
```

### 13.2 Data Export pro subject

```
Subscriber žádá export svých dat
   ↓
Admin → Audience → search subscriber → View profile
   ↓
Export buď manuálně z profile view, nebo přes API:
   GET /lists/{id}/members/{subscriber_hash}/activity
   ↓
Output: CSV s veškerou aktivitou + profile fields
```

### 13.3 Consent audit trail

```
Pro každý subscriber:
- Signup source URL (pokud trackováno)
- Signup IP address
- Signup timestamp
- Confirmation IP + timestamp (double opt-in)
- GDPR field consent (pokud použito)
   ↓
Vidí v Subscriber profile → Member rating section
   ↓
Použitelné při právním sporu / audit
```

### 13.4 DPA & sub-processors

```
Owner → Compliance → DPA download
   ↓
Mailchimp Data Processing Agreement
   ↓
Seznam sub-processorů (AWS, Twilio pro SMS, atd.)
   ↓
Owner podepíše elektronicky
```

---

## 14. Mailchimp ↔ ISP flow

### 14.1 Pre-send: sender reputation evaluation

```
ISP (např. Gmail) udržuje per-IP a per-domain reputation:
   - Mailchimp shared IP block: částečně sdílená reputace
   - Vaše domain: vaše vlastní reputace
   ↓
Když Mailchimp pošle email:
   - From: vy
   - SPF: Mailchimp's mcsv.net (alignment fails s yourdomain)
   - DKIM: signed za yourdomain (alignment passes)
   - DMARC: passes via DKIM
   ↓
Gmail zhodnotí kombinaci:
   - Komu jste posílali dříve?
   - Otevírají vás recipients?
   - Kolik spam complaints?
   - Engagement rate vs. baseline
```

### 14.2 Post-send: feedback loops

```
ISP feedback signály:
- Hard bounce 5xx → Mailchimp marks Cleaned
- Soft bounce 4xx → retry, eventually Cleaned
- Spam complaint (subscriber report) → Mailchimp marks Unsubscribed (abuse)
- Engagement signals (open, reply, "Not spam" click) → reputation boost
   ↓
Mailchimp agreguje signály → updatuje sender reputation
   ↓
Zobrazuje Admin v Reports + nudges ("Your bounce rate is high")
```

### 14.3 Postmaster tools

Pro pokročilé sledování:
- **Google Postmaster Tools** – Admin nastavuje DKIM domain → vidí Gmail-specific reputation, spam rate
- **Microsoft SNDS** – pro Outlook/Hotmail
- **Mailchimp neagreguje tyto** – Admin musí sledovat externě

### 14.4 IP warming (Mandrill / Dedicated IP)

```
Nový dedicated IP má 0 reputation
   ↓
Mailchimp pomalu zvyšuje denní objemy:
- Den 1: 50 emailů
- Den 2: 100
- ...
- Týden 4+: full volume (max 500k/den)
   ↓
ISP postupně buduje reputation
   ↓
Bez warmup: emaily by skončily ve spamu
```

---

## 15. Agenturní / Multi-client flow

Mailchimp nemá nativní multi-tenant pro agentury. Existují dva approachy:

### 15.1 Agency Account Switcher

```
Agenturní user založí Mailchimp účet
   ↓
Klient (Owner svého účtu) pozve agenturu jako Admin
   ↓
Agenturní user vidí v top-right "Account Switcher":
- Klient A
- Klient B
- Klient C
- Vlastní agentura
   ↓
Switch mezi účty
   ↓
**Důležité:** každý klient platí svůj plán; agentura nemá centrální billing
```

### 15.2 Mailchimp & Co (legacy „Mailchimp Pro")

- Historicky pro velké agentury byla možnost Pro plánu s multi-account dashboardem
- Aktuálně v 2026 omezeno; doporučuje se buď Premium plán per klient, nebo OAuth-based custom dashboard

### 15.3 Tooly třetích stran (např. Leadsie)

Pro snadné získání agenturního přístupu ke Mailchimp účtu klienta:
```
Agentura používá Leadsie / podobný tool
   ↓
Pošle klientovi link
   ↓
Klient klikne → autorizuje pozvánku
   ↓
Agentura získá Admin role
   ↓
Pracuje normálně
```

---

## 16. Datová mapa: co vidí kdo

| Datový bod | Owner | Admin | Manager | Author | Viewer | Subscriber | API klient |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Billing/faktury | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | jen s billing scope |
| User list | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Audience contacts | ✅ | ✅ | ✅ | ✅* | ✅* | jen sebe | ✅ |
| Profile merge fields | ✅ | ✅ | ✅ | ✅ | ✅ | jen své | ✅ |
| Tags na kontaktech | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (skryto) | ✅ |
| Groups (subscriberovo membership) | ✅ | ✅ | ✅ | ✅ | ✅ | jen své | ✅ |
| Campaign content | ✅ | ✅ | ✅ | ✅ | ✅ | jen co dostal | ✅ |
| Reports/stats | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Automation flows | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Domain settings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| API keys | jen své | jen své | jen své | jen své | ❌ | ❌ | – |
| E-commerce orders | ✅ | ✅ | ✅ | ✅ | ✅ | jen své | ✅ |
| Survey responses | ✅ | ✅ | ✅ | ✅ | ✅ | jen své | ✅ |
| Compliance audit trail | ✅ | ✅ | omezeně | ❌ | ❌ | jen export sebe | omezeně |

\* Author/Viewer mají read-only přístup k audience, ne edit.

---

## 17. Známé úzkoprofilové místa flow

Pár věcí, které se v praxi často kazí:

1. **Author může vytvářet API klíče** → ze security pohledu nečekané; klíč dědí Author práva (nemůže odeslat kampaň)
2. **Owner musí převést ownership před opuštěním účtu** – mnoho firem se „uzamkne" když původní zakladatel odejde
3. **Pozvánky expirují** – často se ztratí v inboxu, nutno re-invite
4. **Free plan = single Owner** – pro malé týmy musí ihned upgrade
5. **Žádný granular permission** – Author vidí všechny audience data; nelze omezit na 1 list
6. **Žádný approval workflow** – Author nemůže poslat „k schválení" Managerovi nativně; jen jako Draft + ping
7. **Žádný audit log** – nelze zpětně dohledat „kdo provedl XY akci"
8. **API klíče vázané na usera** – při odchodu usera klíče zmizí, což může rozbít produkční integraci

---

## 18. Doporučení pro design vlastních procesů

Pokud Mailchimp používáte v týmu, doporučujeme zavést:

1. **Role naming convention** – využijte 5 rolí důsledně, ne všichni Admins
2. **API keys pro servisní účet** – vytvořte „integration@vasefirma.com" Admin a používejte jeho API keys (přežije fluktuaci)
3. **Domain authentication checklist** – DKIM + DMARC první den
4. **Quarterly audit tagů** – odstraňte redundance
5. **Archive policy** – pravidelně archivujte unsubscribed pro úspory billing
6. **Compliance archive** – externí backup consent audit trail (Mailchimp není záruka long-term)
7. **Test send pravidlo** – každá kampaň 2 test sends + min. 1 reviewer před odeslání
8. **Documented runbook** – co dělat při bounce spike, spam complaint spike, deliverability propad

---

*Dokument zpracován na základě oficiální Mailchimp dokumentace, podpůrných článků a praktických zkušeností z komunity (G2, Reddit r/Emailmarketing, Stitchflow user-management guide, Pure Firefly, Tailored Edge, ALM Corp).*
