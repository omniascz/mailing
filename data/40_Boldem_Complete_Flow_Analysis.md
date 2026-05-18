# Boldem – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v Boldem prochází data, lidé a akce – od demo request přes Shoptet integraci, CDP data sběr, vlastní události tracking, agenturní white-label management, až po koncového subscribera. Speciální focus na CZ kontext + sportovní kluby + neziskové reference + MailKomplet legacy.

> Tento dokument doplňuje `39_Boldem_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** Boldem umí, tento popisuje, **kdo s tím interaguje a jak data tečou**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
> - **České řešení** s vlastními servery v ČR
> - **MailKomplet legacy** – Boldem je nástupce klasického CZ tool
> - **CDP platform** integrované (ne jen email tool)
> - **Multikanálovost native** (email + SMS + PUSH + In-App)
> - **Agenturní white-label** UNIKÁTNÍ vs. Ecomail/SmartEmailing
> - **Sportovní kluby specialization** (UNIKÁTNÍ reference niche)
> - **Tarif Profi** pro pokročilé funkce (vlastní události, Limiter)
> - **Limiter** pro warm-up + ochranu webu
> - **AI v editoru** (přizpůsobení barev + loga)
> - **4 A/B varianty** (více než Ecomail/SmartEmailing základní)
> - **Power BI + Looker Studio** advanced reporting
> - **Rocketoo native integrace** (UNIKÁTNÍ)
> - **Tržby v aplikaci** (nemusí spoléhat na GA)
> - **Češko-slovenský sportovní marketing** primární vertikála
> - **"O marketingu bez obleků"** community events

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Sales & qualification flow](#2-sales-flow)
3. [Demo + konzultace flow](#3-demo-flow)
4. [Shoptet integrace flow (verifikační kód!)](#4-shoptet-flow)
5. [Onboarding flow](#5-onboarding-flow)
6. [User roles & permissions](#6-user-roles)
7. [Agenturní účet flow](#7-agency-flow)
8. [Daily Marketing user flow](#8-daily-workflow)
9. [Recipient lifecycle](#9-recipient-lifecycle)
10. [Email lifecycle](#10-email-lifecycle)
11. [Automatizace execution flow](#11-automation-flow)
12. [Opuštěný košík flow (e-commerce)](#12-cart-abandonment)
13. [Welcome kampaň flow](#13-welcome-flow)
14. [SMS + PUSH + In-App flow](#14-multi-channel-flow)
15. [CDP data ingestion flow](#15-cdp-flow)
16. [Vlastní události + tagování flow (Tarif Profi)](#16-custom-events-flow)
17. [A/B testing flow (4 varianty)](#17-ab-testing-flow)
18. [Limiter flow (warm-up + protection)](#18-limiter-flow)
19. [Sportovní klub use case flow](#19-sportovni-flow)
20. [Neziskové fundraising flow](#20-fundraising-flow)
21. [White-label flow pro agentury](#21-whitelabel-flow)
22. [API + Webhook flow](#22-api-flow)
23. [GDPR compliance flow](#23-gdpr-flow)
24. [Migration z MailKompletu / jiných systémů](#24-migration-flow)
25. [Datová mapa: co vidí kdo](#25-datová-mapa)
26. [Známé úzkoprofilové místa](#26-úzkoprofilové-místa)

---

## 1. Mapa všech aktérů

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│         BOLDEM PLATFORM ECOSYSTEM                                  │
│         České řešení · Vlastní servery v ČR · MailKomplet legacy   │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [Boldem (CZ provozovatel)]                                        │
│   ├─ Sales team (CZ primary, telefon + chat + e-mail)              │
│   ├─ Customer Support (skuteční lidé)                              │
│   ├─ Technical Support                                             │
│   ├─ CDP consultants (sales-driven)                                │
│   ├─ Implementation specialists                                    │
│   ├─ Migration team (z MailKomplet + jiných systémů)               │
│   ├─ Marketing community (O marketingu bez obleků events)          │
│   └─ Engineering / Product team                                    │
│           │                                                        │
│           ▼                                                        │
│                                                                    │
│   ┌──────────────────────────────────────────┐                     │
│   │   Boldem Account                         │                     │
│   │                                          │                     │
│   │   TARIFY:                                │                     │
│   │   ├─ E-mailing (samostatný ceník)        │                     │
│   │   ├─ SMS (samostatný ceník)              │                     │
│   │   ├─ Profi (advanced features)           │                     │
│   │   └─ CDP Boldem (custom, sales-driven)   │                     │
│   │                                          │                     │
│   │   USER ROLES:                            │                     │
│   │   ├─ Account Owner                       │                     │
│   │   ├─ Administrator                       │                     │
│   │   ├─ Marketing user                      │                     │
│   │   ├─ Designer / Editor                   │                     │
│   │   ├─ Analyst                             │                     │
│   │   ├─ Read-only / Viewer                  │                     │
│   │   ├─ Agency users (multi-tenant!)        │                     │
│   │   ├─ Per-uživatel práva (granular)       │                     │
│   │   └─ Neomezený počet uživatelů (agency)  │                     │
│   └──────────────┬───────────────────────────┘                     │
│                  │                                                 │
│                  ▼                                                 │
│   [Recipients / Subscribers]                                       │
│       │                                                            │
│       ├─→ E-mail kampaně                                           │
│       ├─→ SMS zprávy (hromadné + transakční)                       │
│       ├─→ PUSH oznámení                                            │
│       ├─→ In-App zprávy                                            │
│       ├─→ Transakční e-maily                                       │
│       ├─→ Welcome kampaně                                          │
│       ├─→ Opuštěný košík                                           │
│       └─→ Reaktivace                                               │
│                  │                                                 │
│                  ▼                                                 │
│   [Integrace - CZ-friendly]                                        │
│   ┌──────────────────────────────────────────┐                     │
│   │   E-commerce (native plugins):           │                     │
│   │   - Shoptet (CZ leader, ověřovací kód!) │                     │
│   │   - Shopify                              │                     │
│   │   - Upgates (CZ)                         │                     │
│   │   - Rocketoo (CZ niche, UNIKÁTNÍ!)       │                     │
│   │                                          │                     │
│   │   Reporting:                             │                     │
│   │   - Power BI                             │                     │
│   │   - Looker Studio                        │                     │
│   │                                          │                     │
│   │   API + Webhooks:                        │                     │
│   │   - REST API                             │                     │
│   │   - Webhook events                       │                     │
│   │   - Custom integrations                  │                     │
│   │                                          │                     │
│   │   Custom (Tarif Profi):                  │                     │
│   │   - Vlastní události tracking            │                     │
│   │   - Web/app event tracking               │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
│   [Infrastructure - vlastní servery]                               │
│   ┌──────────────────────────────────────────┐                     │
│   │   Servery EXCLUSIVELY v ČR               │                     │
│   │   Zabezpečený cloud                      │                     │
│   │   Vysoká doručitelnost                   │                     │
│   │   CZ ISP relationships                   │                     │
│   │   (Seznam.cz, Centrum.cz, Volný.cz)      │                     │
│   │   DKIM/SPF/DMARC                         │                     │
│   │   GDPR-compliant CZ jurisdikce           │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
│   [Reference customers]                                            │
│   ┌──────────────────────────────────────────┐                     │
│   │   Sportovní kluby (UNIKÁTNÍ niche):      │                     │
│   │   - Zbrojovka Brno                       │                     │
│   │   - Banská Bystrica (hokej)              │                     │
│   │   - Slovan Bratislava (futbal + hokej)   │                     │
│   │   - Baník Ostrava                        │                     │
│   │                                          │                     │
│   │   Neziskové:                             │                     │
│   │   - Cesta domů                           │                     │
│   │   - Arkadie                              │                     │
│   │   - Štěpán Hon kalendář (1,368M Kč 2024) │                     │
│   │                                          │                     │
│   │   E-shopy:                               │                     │
│   │   - wineofitaly.cz                       │                     │
│   │   - scandishop.cz                        │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér | Vstupní bod | Co dělá | Co vidí |
|---|---|---|---|
| **Account Owner** | Sign-up / contract | Full + billing + users | Vše |
| **Administrator** | Pozvánka | Operational lead | Per scope |
| **Marketing user** | Pozvánka | Daily marketing | Per permissions |
| **Designer / Editor** | Pozvánka | Content + templates | Per role |
| **Analyst** | Pozvánka | Reports + BI | Read + analyze |
| **Read-only / Viewer** | Pozvánka | View only | Read-only |
| **Agency uživatel** | Multi-client | Switch mezi klienty | Per assigned |
| **Recipient / Subscriber** | Form, integration | Receives multi-channel | Své zprávy |
| **Boldem Customer Support** | Telefon / chat / e-mail | Issue resolution | Read s consent |
| **Boldem Sales** | Inquiry | Upgrades + new contracts | Read s consent |
| **CDP consultant** | Sales-driven | CDP custom setup | Read s consent |
| **Migration team** | Migration request | Z MailKomplet / jiných | Read access |
| **API Client** | API key | Custom integration | Per scope |
| **Shoptet integrace** | Verifikační kód! | E-commerce sync | Per scope |
| **Rocketoo integrace** | UNIKÁTNÍ CZ | E-commerce sync | Per scope |

---

## 2. Sales & qualification flow

### 2.1 Lead acquisition

```
Lead sources:
- boldem.cz inbound (web form, chat)
- Shoptet doplňky directory
- Partnership s e-shop platformami
- "O marketingu bez obleků" události
- Sportovní marketing reference
- Neziskové marketing reference
- MailKomplet existing customers
- Word-of-mouth (CZ marketing community)
- Industry events
```

### 2.2 Discovery flow

```
Prospect contacts Boldem via:
- boldem.cz form
- Chat (zákaznická podpora)
- E-mail (support@boldem.cz)
- Telefon
   ↓
Boldem responds:
- Standard plan: zákaznická podpora
- CDP plan: obchodník consultation
   ↓
**Discovery call (česky):**
- Business type (e-shop? agentura? sportovní klub? neziskový?)
- Velikost databáze
- Email volume potřeba
- SMS volume
- PUSH/In-App potřeby
- Existing tool (migration?)
- Shoptet/Shopify/Upgates?
- Agency model (white-label)?
- CDP rozšíření?
- Budget
- Timeline
   ↓
Qualification:
- SMB / mid-market / enterprise?
- CZ/SK focus?
- E-shop fit?
- Agency fit?
```

### 2.3 Tarif recommendation

```
Boldem sales doporučuje tarif:

Scenario 1: Malý CZ e-shop (< 5000 kontaktů)
→ E-mailing standard
→ Možná +SMS basic

Scenario 2: Střední e-shop s automation
→ E-mailing + Profi tarif
→ Custom events + vlastní tagy

Scenario 3: Větší e-shop + multi-channel
→ Profi tarif + SMS + PUSH

Scenario 4: Střední/větší e-shop s deep CDP
→ CDP Boldem custom řešení
→ Konzultace s obchodníkem

Scenario 5: Agentura
→ Agency tarif
→ White-label setup
→ Multi-client management

Scenario 6: Sportovní klub
→ Email + SMS + PUSH
→ Newsletter + lístky systém
→ Custom integrace

Scenario 7: Neziskový sektor
→ Direct mailing
→ Custom solution
→ Fundraising focus
```

### 2.4 Demo + tour

```
Per Shoptet:
"Ten vás provede systémem, představí jeho funkce
a pomůže zvolit vhodný tarif."

Demo content:
- Boldem platform walkthrough
- Editor demo
- Automation showcase
- E-commerce integration (Shoptet)
- Reports + dashboards
- Reference customers
- Q&A
   ↓
Tarif recommendation
   ↓
Dočasný přístup do systému (per dohoda)
```

### 2.5 Dočasný přístup

Per Shoptet:
> *"Na základě domluvy může být součástí i dočasný přístup do systému."*

```
Sales-approved trial:
- Sandbox environment
- Time-limited
- Sales-managed
- Test reálnými daty (omezeně)
   ↓
Evaluation
   ↓
Decision
```

### 2.6 Contract signing

```
Contract documents:
- Service agreement
- DPA (GDPR compliant, česky)
- SLA (per tier)
- Statement of Work (implementation, pokud CDP)
   ↓
Signed
   ↓
Project kickoff
```

---

## 3. Demo + konzultace flow

### 3.1 Standard demo request

```
Visit boldem.cz
   ↓
Form submission
- Name, e-mail
- Company
- Phone
- Use case
   ↓
Sales kontaktuje (typicky 1-2 dny)
   ↓
Demo / konzultace v češtině
```

### 3.2 CDP-specific consultation

Per Shoptet:
> *"Pokud se chcete blíže seznámit s tím, co Boldem nabízí, doporučujeme domluvit si konzultaci s obchodníkem."*

```
CDP consultation:
- Obchodník provede systémem
- Představí funkce
- Pomůže zvolit vhodný tarif
- Dočasný přístup (per dohoda)
   ↓
Custom CDP scope definition
   ↓
Custom proposal s pricing
```

### 3.3 Multi-channel kontakt

Per Shoptet:
> *"Pro více informací lze využít také chat, e-mail nebo telefonickou podporu Boldem."*

**Pre-sales channels:**
- **Web form**
- **Chat na boldem.cz**
- **E-mail** (support@boldem.cz)
- **Telefon**
- **"O marketingu bez obleků" události**

### 3.4 "O marketingu bez obleků" community events

Per oficiální:
> *"Pravidelně proto pořádáme zdarma akce O marketingu bez obleků, kde:*
> *Na každém setkání zaznívá praktická prezentace od hosta z praxe (např. CEO Angry Beards, CMO Textilomanie, apod.), který ukáže, jak řeší marketing reálně, bez zbytečné teorie a 'omáčky' kolem."*
>
> *"Po úvodní přednášce následuje neformální Q&A spolu s networkingem u kávy a občerstvení."*

**Community-driven approach:**
- **Free pro veřejnost**
- **Praktické prezentace**
- **Reference hosts:** Angry Beards CEO, Textilomanie CMO
- **Q&A + networking**
- **Boldem builds brand + customer relationships**

---

## 4. Shoptet integrace flow (verifikační kód!)

### 4.1 Shoptet integrace process

Per Shoptet doplňky:
> *"Spusťte instalaci kliknutím na Objednat doplněk. Zkontrolujte e-mailovou schránku, na kterou máte zaregistrovaný účet Shoptet. V e-mailu najdete ověřovací kód. Kód si zkopírujte a použijte ho ke spárování s vaším účtem Boldem."*

```
Step 1: Shoptet admin
   ↓
Step 2: Doplňky → Boldem
   ↓
Step 3: Klik "Objednat doplněk"
   ↓
Step 4: Boldem doplněk se nainstaluje
   ↓
Step 5: Boldem odešle e-mail s ověřovacím kódem
- E-mail na adresu Shoptet účtu
   ↓
Step 6: Kontrola e-mailové schránky
- Ověřovací kód
   ↓
Step 7: Zkopírovat kód
   ↓
Step 8: Vložit kód do Boldem admin
- Spárování s Boldem účtem
   ↓
Step 9: Integrace aktivována
   ↓
[Shoptet + Boldem propojeno]
```

### 4.2 Co se synchronizuje

```
Shoptet → Boldem:
- Customer data
- Order data
- Cart events
- Product data
- Marketing consent

Boldem → Shoptet:
- Email engagement tracking
- Campaign attribution
- Customer segments
```

### 4.3 Use cases post-integration

```
Automatization scenarios:
1. Welcome campaign on registration
2. Cart abandonment workflow
3. Post-purchase upsell
4. Loyalty program emails
5. Re-engagement of inactive customers
6. Birthday discounts
```

### 4.4 Per Shoptet review

> *"E-mailing je nedílnou součástí naší komunikace se zákazníky. Líbí se nám, že v Boldemu velice rychle připravíme kampaň v rychlém editoru. Využíváme i pokročilé kampaně jako opuštěný košík, welcome kampaň a jiné. Určitě doporučujeme."* – Lukáš Nejedlý, scandishop.cz

### 4.5 Other e-commerce integrations

**Shopify:**
- Native plugin
- OAuth connection
- Customer + order sync

**Upgates:**
- Native CZ e-shop integrace
- Customer sync

**Rocketoo:**
- UNIKÁTNÍ CZ niche
- Native integration

**Custom via API:**
- API tracking script
- "Vložením kódu do hlavičky" (per oficiální)

---

## 5. Onboarding flow

### 5.1 Project kickoff (Week 1)

```
Contract signed (nebo standard tarif aktivován)
   ↓
**Boldem assigns:**
- Customer Success contact
- Technical Support contact
- (Pro CDP: dedicated obchodník)
   ↓
**Client side:**
- Marketing manager
- E-commerce manager (pokud aplikuje)
- IT lead (pokud potřeba integrace)
   ↓
**Kickoff:**
- Welcome call
- Account setup
- Plán implementace
```

### 5.2 Setup (Week 1-2)

```
Account provisioning:
- Boldem account
- User invitations
- Brand kit (logo, barvy)
   ↓
Domain authentication:
- DKIM records
- SPF
- DMARC
- Branded tracking
   ↓
Verify configurations
   ↓
[Foundation ready]
```

### 5.3 Integrace fáze (Week 2-4)

```
E-commerce integration:
- Shoptet → ověřovací kód → spárování
- Shopify → OAuth
- Upgates → plugin
- Rocketoo → native
   ↓
Custom integrations:
- API setup (pokud potřeba)
- Webhook configuration
- Tracking script (vlastní)
   ↓
Verify data flow
   ↓
[Integrace live]
```

### 5.4 Data migrace (Week 2-4)

Per oficiální FAQ:
> *"Samozřejmě. Běžně pomáháme klientům přenést data při přechodu z jiného systému. Vhodné je se na přenosu domluvit předem."*

```
Migration support:
- Domluva předem (chat / e-mail)
- Boldem zákaznická podpora assistance
- Migration team
   ↓
Migrace contacts:
- Z MailKomplet (nejjednodušší - same family)
- Z Ecomail / SmartEmailing
- Z Mailchimp / jiných
   ↓
Data preparation:
- CSV export
- Field mapping
- GDPR consent confirmation
   ↓
Import do Boldem
   ↓
Validace data
   ↓
[Contacts ready]
```

### 5.5 Brand kit + templates (Week 3-5)

```
Brand kit setup:
- Logo upload
- Colors definition
- Fonts
- Default header / footer
   ↓
**AI v editoru:**
- Auto-detekce barev
- Inteligentní přizpůsobení
- Brand consistency
   ↓
Master templates designed:
- Newsletter template
- Promotional template
- Welcome series templates
- Cart abandonment templates
- Sportovní klub templates (pokud aplikuje)
   ↓
[Templates ready]
```

### 5.6 Automation setup (Week 4-6)

```
Workflow design:
- Welcome series
- Opuštěný košík
- Post-purchase
- Re-engagement
- Birthday automation
- Custom workflows
   ↓
Build v Boldem
   ↓
Test thoroughly
   ↓
Activate
   ↓
[Automation live]
```

### 5.7 CDP setup (pokud CDP tarif, Week 4-10)

```
CDP custom setup:
- Custom events definition
- Data sources connection
- Custom fields schema
- Tagging strategy
- Vlastní události implementation (s developery)
   ↓
Test data flow
   ↓
360° customer profile validated
   ↓
[CDP live]
```

### 5.8 Training (Week 6-8)

```
Training tracks:
- Marketing team (campaign creation, segmentation)
- Designers (templates, brand kit)
- Analysts (reports, dashboards)
- Admins (user management, integrations)
- IT / Developers (API, custom events)
```

### 5.9 Go-live (Week 8-12)

```
Pre-launch QA → Soft launch → Full launch → Hypercare
   ↓
[BAU transition]
```

---

## 6. User roles & permissions

### 6.1 User roles (typical)

#### Account Owner
- **Highest tier** access
- **Sign-up creator** nebo contract owner
- Full administrative control
- Billing access
- User management
- Close account

#### Administrator
- **Full operational** access
- User management v rámci scope
- Integration management
- Configuration

#### Marketing user
- **Daily marketing** tasks
- Campaigns + segments
- Content creation
- Reports

#### Designer / Editor
- **Content focused**
- Templates + design
- Limited recipient data

#### Analyst
- **Reports + dashboards**
- Power BI / Looker Studio
- Data export

#### Read-only / Viewer
- **View only**
- For stakeholders, executives

#### Agency users
- **Multi-tenant access**
- **Switch mezi klienty**
- **Per-uživatel práva**

### 6.2 Per-uživatel práva

Per oficiální FAQ:
> *"Ano. Boldem nabízí možnost agenturního účtu. Počet uživatelů k jednomu účtu není omezen a každému můžete nastavit různá práva."*

**Granular permissions:**
- **Neomezený počet uživatelů** v účtu
- **Per-uživatel práva**
- **Per-funkce permissions**
- **Per-action permissions**

### 6.3 User invitation flow

```
Owner/Admin: Účet → Uživatelé
   ↓
+ Přidat uživatele
   ↓
E-mail + jméno
   ↓
Role + práva (granular)
   ↓
Pozvánka odeslána
   ↓
Uživatel aktivuje + nastaví heslo
   ↓
[Aktivní per role]
```

### 6.4 Multi-client management

Per oficiální FAQ:
> *"Pokud provozujete agenturu, nebo spravujete portfolio více klientů, můžete mít pod sebou v Boldem všechny účty, ke kterým vám vaši klienti udělí přístup."*

```
Agency uživatel:
- Single login
- Switch mezi účty klientů
- Per-klient přístup
- Per-klient role
- Centralizovaný overview
```

### 6.5 Sportovní klub use case

Pro sportovní klub typicky:
- **Owner:** Marketing manager klubu
- **Administrator:** PR oddělení
- **Marketing user:** Specialista
- **Designer:** Externí grafik
- **Read-only:** Vedení klubu

---

## 7. Agenturní účet flow

### 7.1 Agency account features

Per oficiální FAQ:
> *"Ano. Boldem nabízí možnost agenturního účtu. Počet uživatelů k jednomu účtu není omezen a každému můžete nastavit různá práva."*

**Agency features:**
- **Neomezený počet uživatelů**
- **Per-uživatel práva**
- **Multi-client management**
- **White-label řešení**

### 7.2 Agency setup flow

```
Agentura aktivuje agency tarif
   ↓
Configure:
- Agency staff (multiple users)
- Per-uživatel role
- White-label setup
   ↓
Pro každého klienta:
- Boldem accept access od klienta
- Klient = vlastní účet
- Agentura má přístup
- Per-klient tenant
   ↓
Agency staff:
- Login do agency account
- Switch mezi klienty
- Manage per-klient kampaně
- Cross-client analytics (optional)
```

### 7.3 Multi-client management

Per FAQ:
> *"můžete mít pod sebou v Boldem všechny účty, ke kterým vám vaši klienti udělí přístup"*

```
Agency dashboard:
- Klient A account
- Klient B account
- Klient C account
- ... (až stovky klientů)
   ↓
Per-klient:
- Isolated data
- Custom branding (white-label)
- Per-klient billing (může být)
- Per-klient reports
   ↓
Agency-level:
- Cross-client metrics
- Resource utilization
- Team productivity
```

### 7.4 White-label flow

```
Agency configuration:
- Custom domain pro per-klient subdomain
- Custom branding (logo, colors)
- Hidden Boldem branding
- Per-klient customization
   ↓
Klient sees:
- Branded interface
- Agency-supported experience
- Vlastní zkušenost
```

### 7.5 Per-uživatel granular permissions

```
Agency uživatel A: Full access ke klientovi 1, read-only klient 2
Agency uživatel B: Limited access ke klientovi 1, full ke klientovi 3
Agency uživatel C: Cross-client analytics access
   ↓
Flexible team structure
   ↓
Security maintained
```

---

## 8. Daily Marketing user flow

### 8.1 Daily workflow

```
Login → Dashboard
   ↓
Activities:
- Build segments
- Create kampaně
- Manage workflows
- Update templates
- Review reports + tržby
- Use AI editor
- A/B testing (až 4 varianty)
- Vlastní události monitoring (Tarif Profi)
```

### 8.2 Create campaign

```
Kampaně → Nová kampaň
   ↓
Step 1: Setup
- Název kampaně
- Předmět + personalizace
- Odesílatel
- Reply-to
- UTM parametry
   ↓
Step 2: Příjemci
- Seznam / segment
- Vlastní události filter (Tarif Profi)
- Tagy
- Exclusion lists
   ↓
Step 3: Design
- AI editor (přizpůsobení barev + loga)
- Templates
- Drag-drop blocks
- Personalization tokens
- Vlastní HTML option
   ↓
Step 4: A/B testing (až 4 varianty)
- Variant A
- Variant B
- Variant C (optional)
- Variant D (optional)
- Winner criteria
   ↓
Step 5: Testy
- Náhled (desktop/mobile)
- Test send
- **Automatická kontrola** (spam slova, chybějící odkazy)
   ↓
Step 6: Odeslání
- Odeslat ihned
- Naplánovat
- **Limiter** (Tarif Profi, pro 1000+ příjemců)
   ↓
Potvrdit
```

### 8.3 Build workflow / automation

```
Automatizace → Nová automation
   ↓
A) Předpřipravená automation
- Welcome
- Opuštěný košík
- Reaktivace
B) Custom automation
   ↓
Configure trigger:
- Behavioral
- Transactional
- Date-based
- Vlastní událost (Tarif Profi)
   ↓
Build canvas:
- Send e-mail
- Send SMS
- Send PUSH
- Send In-App
- Wait
- Condition
- Update fields
- Tagy
- Webhook
   ↓
Test
   ↓
Activate
   ↓
[Workflow live]
```

### 8.4 Segment building

```
Příjemci → Segmenty → Nový
   ↓
Configure conditions:
- Atributy
- Custom fields
- Tagy
- Engagement
- Vlastní události (Tarif Profi)
- Transactional data
- Datum-based
   ↓
Combine AND/OR/NOT
   ↓
Preview velikost
   ↓
Save (dynamic / static)
   ↓
[Segment available]
```

### 8.5 Sloučení / rozdělení seznamů

Per Freshstart.cz:
> *"Boldem přidává funkci sloučení a rovnoměrného rozdělení seznamů podle potřeby."*

```
Seznamy → Operace
   ↓
A) Sloučit dva seznamy
B) Rozdělit seznam rovnoměrně
   ↓
Configure
   ↓
Execute
   ↓
[Lists managed]
```

---

## 9. Recipient lifecycle

### 9.1 Recipient creation paths

#### A) Form submission (web/landing)
```
Visitor fills Boldem form
   ↓
Submit
   ↓
Boldem:
- Validates e-mail
- Captcha check
- **GDPR consent recorded**
   ↓
Status: Nepotvrzený (Double Opt-in default)
   ↓
**Confirmation e-mail sent**
   ↓
Recipient clicks confirm
   ↓
IP + timestamp logged
   ↓
**Full GDPR audit trail**
   ↓
Status: Aktivní
   ↓
Welcome workflow triggered
```

#### B) Shoptet integration sync
```
Customer registers v Shoptet shop
   ↓
Shoptet webhook → Boldem
   ↓
Contact created s marketing consent flag
   ↓
Add do designated seznam
   ↓
Tag: "Zdroj: Shoptet"
   ↓
Welcome workflow if active
   ↓
[CZ e-commerce native flow]
```

#### C) Shopify / Upgates / Rocketoo
```
E-shop customer event
   ↓
Native plugin / webhook → Boldem
   ↓
Recipient created
   ↓
[Active]
```

#### D) API integration
```
External system POST to Boldem API
   ↓
Boldem validates auth
   ↓
Creates/updates recipient
   ↓
[Active]
```

#### E) Manual CSV import
```
Admin: Import → CSV upload
   ↓
Field mapping
   ↓
**GDPR consent confirmation required**
   ↓
Validation:
- Boldem hodnotí podle doručovací historie
- Auto-cleanup invalidních
   ↓
Import processed
   ↓
[Recipients added]
```

#### F) Vlastní událost (Tarif Profi)
```
Custom event tracking aktivní
   ↓
Web/app event captured
   ↓
Profile created/updated v Boldem
   ↓
Vlastní událost recorded
   ↓
Segmentation/automation triggered
```

### 9.2 Recipient status lifecycle

```
[Nepotvrzený] (Double Opt-in default)
   ↓
[Aktivní] ← can receive
   ↓
Transitions:
- Odhlášený (Unsubscribed)
- Vrácený (Bounced - soft/hard)
- Stížnost na spam
- Neaktivní (engagement decline)
- Smazaný (GDPR delete)
```

### 9.3 Engagement tracking

```
Aktivní recipient interacts:
- Otevření e-mailu (pixel)
- Kliknutí (URL wrapper)
- Web visit (tracking script)
- App event (s SDK)
- Vlastní událost (Tarif Profi)
- Tržby (revenue attribution)
   ↓
Profile updates:
- Last activity
- Engagement metrics
- Tagy (workflow-driven)
- Segments re-evaluated
- CDP profile enriched
```

### 9.4 Preference center

```
Email footer: "Odhlásit" / "Spravovat odběry"
   ↓
Boldem-hosted preference page (česky)
   ↓
Recipient sees:
- Seznamy (toggles)
- Osobní info (editable)
- Master unsubscribe
- GDPR práva
   ↓
Update
   ↓
Profile updated
```

### 9.5 Bounce management

Per oficiální FAQ:
> *"Bounce e-maily, tedy vrácené e-maily, jsou nedoručené zprávy."*

```
ISP 5xx response
   ↓
Boldem Bounce-Management:
- Hard bounces: auto-suppression
- Soft bounces: retry then suppress
- Spam complaints: immediate suppression
   ↓
Reputation protection
   ↓
List hygiene automated
```

### 9.6 GDPR delete

```
Recipient requests deletion (per GDPR)
   ↓
Method A: Admin manual
Method B: API DELETE
Method C: Preference center
Method D: Email request to support
   ↓
Boldem:
- Odstranění osobních dat
- Anonymizace events
- Auto-suppression
- Audit log entry
- Confirmation e-mail (GDPR-compliant)
- DPA documentation maintained
```

---

## 10. Email lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│  1. USER drafts kampaň                                          │
│     - Audience (seznam, segment)                                │
│     - Design (AI editor)                                        │
│     - Personalization                                           │
│                            │                                    │
│                            ▼                                    │
│  2. PRE-SEND CHECKS                                             │
│     - **Automatická kontrola kampaní:**                         │
│        - Spam slova                                             │
│        - Chybějící odkazy                                       │
│        - HTML validity                                          │
│     - Sender verified?                                          │
│     - Domain DKIM/SPF/DMARC?                                    │
│     - Audience valid?                                           │
│     - Plan limits OK?                                           │
│     - GDPR footer present?                                      │
│                            │                                    │
│                            ▼                                    │
│  3. SEND TIME                                                   │
│     - Odeslat ihned                                             │
│     - Naplánovat                                                │
│     - **Limiter** (Tarif Profi pro 1000+ příjemců)              │
│                            │                                    │
│                            ▼                                    │
│  4. PER-RECIPIENT GENERATION                                    │
│     - Personalization tokens resolved                           │
│     - Dynamic content evaluated                                 │
│     - Product blocks (e-commerce integration)                   │
│     - Tracking pixels embedded                                  │
│     - Click trackers wrapped                                    │
│                            │                                    │
│                            ▼                                    │
│  5. SMTP SEND from BOLDEM CZ INFRASTRUCTURE                     │
│     - **Vlastní servery v ČR**                                  │
│     - Zabezpečený cloud                                         │
│     - DKIM signed                                               │
│     - SPF compliant                                             │
│     - DMARC aligned                                             │
│     - List-Unsubscribe RFC 8058                                 │
│                            │                                    │
│                            ▼                                    │
│  6. ISP RECEIVES                                                │
│     - **CZ ISPs (Seznam.cz, Centrum.cz, Volný.cz)**             │
│     - International ISPs (Gmail, Outlook, etc.)                 │
│     - Auth + reputation checks                                  │
│                            │                                    │
│                            ▼                                    │
│  7. ROUTING                                                     │
│     - Inbox (CZ ISPs friendly)                                  │
│     - Promotions                                                │
│     - Spam (rare s vlastní infrastructure)                      │
│                            │                                    │
│                            ▼                                    │
│  8. RECIPIENT INTERACTION                                       │
│     - Open → pixel → tracked                                    │
│     - Click → Boldem redirect → tracked                         │
│     - Web visit (tracking script)                               │
│     - **Tržby tracking** (e-commerce integration)               │
│                            │                                    │
│                            ▼                                    │
│  9. PROFILE UPDATE (REAL-TIME)                                  │
│     - Engagement metrics                                        │
│     - Segments re-evaluated                                     │
│     - Workflow triggers fire                                    │
│     - CDP profile enriched                                      │
│                            │                                    │
│                            ▼                                    │
│ 10. REPORTING                                                   │
│     - Real-time stats                                           │
│     - **Tržby v aplikaci** (bez GA dependency!)                 │
│     - Per-link click maps                                       │
│     - Power BI / Looker Studio sync                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. Automatizace execution flow

### 11.1 Automation activation

```
User builds automation
   ↓
Test mode (preview)
   ↓
Activate
   ↓
Boldem validation:
- All triggers configured
- All actions valid
- No broken paths
   ↓
[Aktivní]
   ↓
Engine evaluates continuously
```

### 11.2 Trigger evaluation

```
Event occurs:
- Subscription (welcome)
- Cart abandonment
- Order completed (post-purchase)
- Date-based (birthday)
- Vlastní událost (Tarif Profi)
- Engagement decline (reaktivace)
   ↓
Boldem evaluates active automations
   ↓
For each matching:
- Check entry conditions
- Add recipient to execution
```

### 11.3 Per-recipient execution

```
Recipient enters at trigger
   ↓
Each node processed:
- Send e-mail → queue
- Send SMS → SMS gateway
- Send PUSH → notification
- Send In-App → mobile app
- Wait → schedule continuation
- Condition → evaluate
- Update field → modify profile
- Add/remove tag → CDP update
- Webhook → external call
   ↓
Continue until end / goal / removal
```

### 11.4 Common automation patterns

#### Welcome series
```
Trigger: Subscribed
   ↓
Send Welcome Email 1
   ↓
Wait 3 dní
   ↓
Send Brand Intro Email 2
   ↓
Wait 5 dní
   ↓
Send Offer Email 3
   ↓
End
```

#### Opuštěný košík (e-commerce)
```
Trigger: Cart abandoned > 1h
   ↓
Send reminder s obsahem košíku
   ↓
Wait 24h
   ↓
Condition: Nakoupil?
   YES → Goal (exit)
   NO → Send discount offer
   ↓
Wait 48h
   ↓
Final reminder s úzkostí
   ↓
Exit
```

#### Reaktivace
```
Trigger: Customer neaktivní 90 dní
   ↓
Send re-engagement e-mail
   ↓
Track engagement
   ↓
If still inactive:
- Send special offer
- Last attempt
   ↓
If still inactive after 30 dní:
- Move to "dormant" segment
- Stop marketing
```

### 11.5 Always-on transakční + automation

Per FAQ:
> *"Automatizace a transakční e-maily budou stále aktivní, přičemž kampaně jsou zastropovány aktuálním tarifem, který platíte."*

**Key:**
- **Automation pokračuje** i po vyčerpání tarifu (kampaně zastropeny)
- **Transakční pokračuje** vždy (kritické pro e-shop)
- **Marketing kampaně omezeny** na current tarif

---

## 12. Opuštěný košík flow (e-commerce)

### 12.1 Cart abandonment setup

Per Shoptet:
> *"Automatizace: Neomezené automatizované procesy pro získávání nových zákazníků a udržení těch stávajících, včetně funkcí jako je vítání nových uživatelů, sledování opuštěných košíků a reaktivace dřívějších zájemců o vaše produkty."*

```
E-commerce integration aktivní (Shoptet/Shopify/Upgates/Rocketoo)
   ↓
Cart tracking enabled
   ↓
Webhook setup pro cart events
   ↓
[Cart abandonment ready]
```

### 12.2 Cart abandonment workflow

```
Customer adds to cart
   ↓
Customer leaves bez checkout
   ↓
Webhook → Boldem (cart abandoned event)
   ↓
Wait 1h (configurable)
   ↓
**Workflow trigger fires:**
- Check recipient validity
- Generate cart contents
   ↓
Send reminder e-mail:
- Product images (from feed)
- Product names + ceny
- Direct link na košík
- "Dokončete nákup" CTA
   ↓
Wait 24h
   ↓
Condition: Nakoupil?
   YES → Exit (goal, success)
   NO → Continue
   ↓
Send second reminder:
- Special discount offer (např. 10%)
- Urgency (limited time)
   ↓
Wait 48h
   ↓
Final reminder:
- Last chance
- Higher discount (např. 15%)
- "Tento týden končí"
   ↓
Exit
```

### 12.3 Tržby attribution

Per Boldem blog:
> *"Díky sledování tržeb v Boldem přesně víte, jak si jednotlivé kampaně vedou, a na základě reálných dat můžete snadno přizpůsobit své marketingové strategie."*

```
Cart abandonment email click
   ↓
Customer lands on e-shop
   ↓
**Tracking attribution:**
- E-mail ID
- Customer ID
- Campaign ID
   ↓
If order placed within X dní:
- Revenue attributed to campaign
- Visible v Boldem reports
- ROI calculation
```

### 12.4 Per scandishop.cz review

> *"Využíváme i pokročilé kampaně jako opuštěný košík, welcome kampaň a jiné. Určitě doporučujeme."*

**Real CZ e-shop confirmation** že cart abandonment v Boldem funguje.

---

## 13. Welcome kampaň flow

### 13.1 Welcome flow trigger

```
Customer registers (form, e-shop, manual)
   ↓
Double Opt-in confirmation
   ↓
Status: Aktivní
   ↓
**Welcome workflow trigger fires**
```

### 13.2 Standard welcome flow

```
Day 0: Welcome Email 1
- Brand introduction
- Benefits subscription
- Sale items / promo
   ↓
Wait 3 dní
   ↓
Day 3: Welcome Email 2
- Brand story
- Sociální důkaz
- Top products
   ↓
Wait 5 dní
   ↓
Day 8: Welcome Email 3
- Special offer / discount
- Limited time
- Urgency
   ↓
End
```

### 13.3 E-commerce specific welcome

```
Customer registers v Shoptet
   ↓
Webhook → Boldem
   ↓
Welcome flow starts:

Email 1 (immediate):
- Welcome
- 10% off first order
- Featured products

Email 2 (3 dny):
- Brand story
- Customer reviews
- Best sellers

Email 3 (7 dní):
- Last chance 10% off
- Specific product recommendation
- Expires v 24h
```

### 13.4 Sportovní klub welcome

```
Fan registers na newsletter
   ↓
Welcome Email 1:
- Vítáme do fan komunity
- Aktuální zápasy
- Sezónní statistiky

Email 2 (3 dny):
- Klubové novinky
- Player spotlights
- Behind the scenes

Email 3 (7 dní):
- Offer na sezonní lístek
- Merch discount
- Exclusive content
```

---

## 14. SMS + PUSH + In-App flow

### 14.1 Multi-channel orchestration

```
Customer interaction:
- E-mail engagement
- SMS engagement
- PUSH engagement
- In-App engagement
   ↓
Boldem CDP captures all
   ↓
Profile + segments updated
   ↓
Workflows respect channel preferences
```

### 14.2 Cart abandonment multi-channel

```
Cart abandoned > 1h
   ↓
**Boldem channel decision:**
- Customer recently engaged email → SMS more impactful
- Customer mostly mobile → PUSH or In-App
- Customer prefers email → E-mail first
   ↓
Send via primary channel
   ↓
Wait 24h
   ↓
If no conversion:
- Try second channel
- Different content angle
   ↓
Continue multi-touch
```

### 14.3 SMS flow

```
SMS triggered:
- Order confirmation
- Shipping update
- Promotional offer
- Reminder
- OTP / auth code
   ↓
Boldem:
- Personalization tokens
- Short URL link tracking
- STOP keyword handling
   ↓
Send via SMS gateway
   ↓
Delivery confirmed
   ↓
Engagement tracked (click)
```

### 14.4 PUSH oznámení flow

```
PUSH triggered:
- Web push (browser subscribed)
- Mobile push (app installed)
   ↓
Boldem:
- Personalization
- Rich content (if mobile)
- Action buttons
- Tracking
   ↓
Send to user device
   ↓
Recipient interaction:
- Open
- Click action
- Dismiss
   ↓
Engagement tracked
```

### 14.5 In-App zprávy flow

```
User opens mobile app
   ↓
**Boldem SDK checks:**
- Active campaigns for this user
- Targeting criteria met?
- Frequency caps OK?
   ↓
Show In-App message:
- Modal overlay
- Slide-in
- Banner
- Full-screen
   ↓
User interaction:
- Tap action
- Dismiss
- Don't show again
   ↓
Engagement tracked
```

### 14.6 Sportovní klub multi-channel example

```
Match upcoming v 24h
   ↓
**Channel orchestration:**

Email 24h before:
- Match preview
- Squad news
- Tickets still available

PUSH oznámení 6h before:
- "Zápas začíná za 6 hod"
- Stadium info
- Last tickets

SMS 1h before:
- Stadium reminder
- Parking info

In-App during match:
- Live score updates
- Exclusive replays
- Fan polls
```

---

## 15. CDP data ingestion flow

### 15.1 CDP data sources

```
Multiple sources feed Boldem CDP:

1. Boldem tracking script (web)
   - Page views
   - Clicks
   - Searches

2. Mobile app SDK
   - App events
   - In-app behavior

3. E-commerce platforms
   - Shoptet (CZ leader)
   - Shopify
   - Upgates
   - Rocketoo
   - Customer + order + cart events

4. CRM integrations
   - Customer master data

5. Sociální média
   - Engagement signals

6. APIs + custom events (Tarif Profi)
   - Vlastní události
   - Business-specific events

7. Email/SMS/PUSH engagement
   - Captured natively

8. Form submissions
   - Direct lead capture
```

### 15.2 Real-time data flow

```
Event occurs (e.g., product viewed na webu)
   ↓
Boldem tracking script captures
   ↓
Sends to Boldem CDP
   ↓
**Identity resolution:**
- Cookie → email when known
- Customer ID match
- Cross-device link
   ↓
Profile updated v real-time
   ↓
**Trigger evaluation:**
- Segments re-evaluated
- Workflows triggered (pokud match)
- Vlastní události processed (Tarif Profi)
   ↓
Profile enriched
```

### 15.3 Per Shoptet description

> *"Konsolidace dat: Boldem centralizuje data z různých zdrojů, jako jsou webové stránky, CRM systémy, e-mailové kampaně a sociální média, do jednoho systému, což výrazně zjednodušuje jejich správu a analýzu."*

### 15.4 360° customer profile

```
Boldem CDP combines:
- Email engagement (kampaně)
- Web behavior (návštěvy)
- E-commerce (objednávky, košík)
- Mobile app (in-app events)
- Custom events (Tarif Profi)
- Demographic data
- Tagy
   ↓
**Single Customer View:**
- Comprehensive profile
- Activity timeline
- Predictive segments
- Recommended actions
```

### 15.5 CDP advantages

Per oficiální:
> *"Jednotná datová základna – snadný přístup ke všem kanálům klienta na jednom místě."*

**Benefits:**
- **Easier multi-channel campaigns**
- **Better segmentation**
- **Predictive insights**
- **Consistent customer experience**

---

## 16. Vlastní události + tagování flow (Tarif Profi)

### 16.1 Custom event tracking setup

Per oficiální:
> *"Sledujte události a aktivitu na webu, ve vaší aplikaci, nebo na dalších platformách. Sami si určíte, které události chcete sledovat."*

```
Tarif Profi aktivní
   ↓
Developer + business team session:
- Define events to track
- Map to business goals
- Implementation plan
   ↓
**Developer implementuje:**
- API calls do Boldem
- Event payload structure
- User identification
- Custom event names
   ↓
Test events flow
   ↓
[Custom events live]
```

### 16.2 Use cases custom events

#### E-shop
```
Custom events:
- "premium_membership_started"
- "wishlist_item_added"
- "product_review_left"
- "loyalty_points_redeemed"
- "abandoned_browse_category_X"
   ↓
Per event:
- Personalized automation
- Specific segments
- Targeted promotions
```

#### SaaS
```
Custom events:
- "feature_X_activated"
- "trial_day_3_reached"
- "upgrade_page_viewed"
- "support_ticket_created"
- "team_member_invited"
   ↓
Lifecycle automations
```

#### Sportovní klub
```
Custom events:
- "ticket_purchased_match_X"
- "merch_browse_jersey"
- "fan_zone_visited"
- "vip_box_inquiry"
- "season_pass_consideration"
   ↓
Targeted fan engagement
```

### 16.3 Tagging system

Per oficiální:
> *"Libovolné tagování (označování) uživatelů. Rozšířená segmentace uživatelů."*

```
Tagy use cases:
- "VIP customer"
- "Frequent buyer"
- "First-time buyer"
- "Cart abandoner"
- "High value"
- "Risk of churn"
- "Premium subscriber"
- Custom business tagy
   ↓
Tagy v segmentaci
Tagy v automation
Tagy v personalization
```

### 16.4 Custom event-driven automation

```
Custom event fires (e.g., "wishlist_item_added")
   ↓
Boldem CDP captures
   ↓
Profile updated
   ↓
**Automation trigger:**
- Wait 3 dny
   ↓
- Send: "Tento produkt na wishlist čeká!"
- Product image
- Special discount
   ↓
Track engagement
   ↓
If purchased: Goal (exit)
If not: Send follow-up
```

### 16.5 Tagy + custom events synergy

```
Customer browses category X 3+ times
   ↓
Custom event: "category_X_engaged"
   ↓
Auto-tag: "category_X_interested"
   ↓
Tag triggers segment membership
   ↓
Targeted campaigns:
- Category X products
- Personalized content
- Higher conversion rate
```

---

## 17. A/B testing flow (4 varianty)

### 17.1 A/B testing setup

Per Freshstart.cz:
> *"Boldem umožňuje otestovat až 4 varianty."*

```
Create campaign
   ↓
Enable A/B testing
   ↓
Configure variants:
- Variant A
- Variant B
- (Optional) Variant C
- (Optional) Variant D
   ↓
Sample size per variant
   ↓
Winner criteria:
- Open rate
- Click rate
- Custom metric
   ↓
Activate test
```

### 17.2 Variants typy

- **Subject line variations**
- **Sender name variations**
- **Content variations**
- **CTA variations**
- **Send time variations**
- **Mix kombinace**

### 17.3 Test execution flow

```
Test sample sent:
- Variant A → 10% audience
- Variant B → 10% audience
- Variant C → 10% audience
- Variant D → 10% audience
- (Total: 40% sample)
   ↓
Real-time tracking
   ↓
**Statistical significance check**
   ↓
Winner declared
   ↓
**Auto-send winner to remaining 60%**
   ↓
Reports show:
- Per-variant performance
- Winner explanation
- Statistical confidence
```

### 17.4 Vs. konkurence

```
Boldem: až 4 varianty
Ecomail: 2 varianty
SmartEmailing základní: 2 varianty
SmartEmailing PRO: neomezeně
   ↓
Boldem positioned mezi:
- Více než Ecomail/SmartEmailing základní
- Méně než SmartEmailing PRO
- Optimal pro většinu use cases
```

### 17.5 Use case: Newsletter optimalizace

```
Marketer testuje newsletter předmět:
- Variant A: "Jarní novinky pro vás"
- Variant B: "🌸 Jarní novinky pro vás"
- Variant C: "Tento týden v naší řadě..."
- Variant D: "Vy stále nemáte tyto produkty?"
   ↓
Sample test:
- 40% audience (10% each)
- 24h test window
   ↓
Winner: Variant D (highest CTR)
   ↓
Auto-send Variant D to 60% remaining
   ↓
Boldem learns: questions outperform statements
```

---

## 18. Limiter flow (warm-up + protection)

### 18.1 Limiter activation

Per oficiální:
> *"Limiter mají k dispozici uživatelé v účtu s tarifem Profi. Využít ho můžete při rozesílce, ve které je více než 1 000 příjemců."*

```
Requirements:
- Tarif Profi
- Rozesílka > 1000 příjemců
   ↓
User activates Limiter pro campaign
   ↓
Configure parameters
```

### 18.2 Configuration

```
Limiter setup:
- Total recipients (např. 10 000)
- Rozdělit do dávek (např. 10 dávek po 1000)
- Časový rozestup (např. 2 hodiny mezi dávkami)
- Per-hour limit (např. max 1500/h)
   ↓
Schedule generated:
- Dávka 1: 1000 příjemců @ 9:00
- Dávka 2: 1000 příjemců @ 11:00
- Dávka 3: 1000 příjemců @ 13:00
- ...
- Dávka 10: 1000 příjemců @ 27:00 (next day)
```

### 18.3 Use cases

#### Warm-up nového účtu
Per oficiální:
> *"Při prvních rozesílkách v novém nástroji je u větší databáze vždy potřeba 'zahřívat'."*

```
Nový Boldem account s 50 000 kontakty
   ↓
First send → Limiter aktivován
   ↓
Postupné rozesílání:
- Week 1: 5000/den
- Week 2: 10000/den
- Week 3: 20000/den
- Week 4+: full volume
   ↓
**Sender reputation built gradually**
   ↓
Better deliverability long-term
```

#### Warm-up importovaných seznamů
```
Import 30 000 nových kontaktů
   ↓
First send → Limiter
- Postupné rozesílání
- Monitor engagement
- Remove non-engagers
- Build reputation
```

#### Ochrana webu před přetížením
Per oficiální:
> *"Využití najdete také při komunikaci akce, u které může zvýšený počet návštěvníků omezit fungování webu."*

```
Black Friday kampaň 100K příjemců
   ↓
Bez Limiteru: všichni najednou → web crash
   ↓
S Limiterem: 5000/h
- Web zvládne
- Sales support handle
- Customer experience preserved
```

#### Ochrana customer support
Per oficiální:
> *"při posílání oznámení, které může zatížit vaši zákaznickou podporu"*

```
Service announcement 50K příjemcům
   ↓
Bez Limiteru: 1000 tickets za hodinu
   ↓
S Limiterem: 100 tickets za hodinu
- Manageable load
- Better response times
- Customer satisfaction
```

---

## 19. Sportovní klub use case flow

### 19.1 Sportovní klub setup

Per oficiální (reference):
- Zbrojovka Brno
- Banská Bystrica (hokej)
- Slovan Bratislava (futbal + hokej)
- Baník Ostrava

```
Sportovní klub onboarding:
- Boldem account setup
- Brand kit (klubové barvy, logo)
- Multi-channel setup (email + SMS + PUSH)
- Newsletter templates
- Lístkový systém integrace
- Fan database import
   ↓
[Live]
```

### 19.2 Fan engagement flow

Per oficiální:
> *"Boldem usnadňuje cílení na poli marketingu – pomáháme s newslettery, šablonami, usnadňujeme komunikaci s fanoušky, vytváříme systémy na prodej lístků a zařizujeme související marketingové aktivity."*

**Boldem services pro sportovní klub:**
- **Newslettery** (sezónní + týdenní)
- **Šablony** (klubové)
- **Komunikace s fanoušky** multi-channel
- **Systém na prodej lístků**
- **Související marketing aktivity**

### 19.3 Match-day workflow

```
Match upcoming (e.g., zítra 19:00)
   ↓
**24h before (Email):**
- Match preview
- Squad news
- Last available tickets
- Stadium info

**6h before (PUSH oznámení):**
- "Zápas začíná za 6 hod"
- Quick CTA: koupit lístky
- Stadium directions

**3h before (SMS to ticket holders):**
- Confirmation s parking
- Stadium gates info
- Weather forecast

**During match (In-App):**
- Live updates
- Player highlights
- Half-time poll

**Post-match (Email next day):**
- Match recap
- Player ratings
- Next match preview
- Merch discount
```

### 19.4 Season ticket flow

```
Spring approach (sezona končí):
   ↓
Segment: Loyal fans (3+ matches attended)
   ↓
Email: Season ticket pre-sale
- Loyalty discount 15%
- Same seat option
- Family deals
   ↓
Wait 2 týdny
   ↓
PUSH oznámení: "Sezónky brzy končí"
   ↓
SMS: Final reminder week before deadline
   ↓
Track conversions
```

### 19.5 Merchandise integration

```
New jersey launched
   ↓
Boldem campaign:
- Email newsletter announcement
- Player-signed photos showcase
- Limited edition badges

Cart abandonment:
- Customer adds jersey, leaves
- Boldem workflow triggers
- Reminder email 1h later
- Discount offer 24h later
```

### 19.6 Pre-match newsletter

```
Weekly newsletter (Friday):
- This weekend's match info
- Tickets available
- Star player spotlight
- Behind the scenes content
- Merch promotions
- Fan stories
```

---

## 20. Neziskové fundraising flow

### 20.1 Štěpán Hon kalendář example

Per oficiální:
> *"Štěpán Hon každý rok představuje kalendář s 12 známými osobnostmi v jejich domovech. Jsme rádi, že i díky naší spolupráci týkající se správy webů a poskytnutí aplikace k direct mailingu se mu opět daří generovat spoustu peněz pro neziskové organizace Cesta domů a Arkadie. Během roku 2024 se Štěpánovi podařilo skrze prodej kalendářů vybrat více než 1 368 000 korun!"*

**Boldem služby pro fundraising:**
- **Direct mailing**
- **Web správa**
- **Marketing aktivity**

### 20.2 Fundraising campaign flow

```
Setup: Annual calendar fundraiser
   ↓
**Pre-launch (October):**
- Email teaser
- Web update
- Sociální media content

**Launch (November):**
- Email announcement s preview
- Multi-channel push
- PR koordinace

**Sales phase (November-December):**
- Email follow-ups
- Reminder campaigns
- Limited stock alerts
- Last-minute Christmas push

**Post-purchase (December):**
- Thank you email
- Calendar arrives soon
- Stories about beneficiaries

**Impact reporting (January):**
- Total raised announcement
- Beneficiary stories
- Thank you to all donors
- Tease next year
```

### 20.3 Donor segmentation

```
Boldem CDP segmenty:
- First-time donors
- Recurring donors
- High-value donors
- Lapsed donors
- Volunteers
- Calendar buyers history
   ↓
Per-segment personalization:
- Different content
- Different appeals
- Different frequencies
```

### 20.4 Nonprofit specific automation

```
New donor registers
   ↓
Welcome series:
- Thank you
- Mission story
- Impact metrics
- How to help further

3 months after donation:
- Impact report
- Stories from field
- Next campaign

1 year after:
- Anniversary recognition
- Annual report
- Renewal appeal
```

### 20.5 Multi-channel pro fundraising

```
Email (primary):
- Stories
- Updates
- Appeals

SMS:
- Urgent campaigns
- Event reminders
- Volunteering opportunities

PUSH (web):
- Live campaign updates
- Donation milestones
```

---

## 21. White-label flow pro agentury

### 21.1 White-label setup

Per oficiální:
> *"Škálovatelné procesy – správa stovek klientů v jedné platformě s možností white-label řešení."*

```
Agentura objednává white-label tarif
   ↓
Boldem nastaví:
- Custom subdomain (per agency or per klient)
- Branded login page
- Hidden Boldem branding
- Custom support contact (agency-as-vendor)
   ↓
Agency configuration:
- Brand kit per klient
- Custom emails (from agency domain)
- Custom URLs
   ↓
[White-label live]
```

### 21.2 Agency workflow

```
Agentura má 50+ klientů:
   ↓
Per-klient setup:
- Klient přihlásí agency přístup
- Per-klient tenant/account
- Per-klient branding (white-label)
- Per-klient settings
   ↓
Agency dashboard:
- Cross-client overview
- Per-klient drill-down
- Resource utilization
- Team productivity
   ↓
Agency staff:
- Switch mezi klienty
- Manage per-klient
- Centralizovaný overview
```

### 21.3 Per-klient billing options

```
Option A: Agency bills clients
- Agentura platí Boldem
- Klient platí agentuře
- White-label complete

Option B: Direct client billing
- Boldem bills klientů přímo
- Agency provides services
- Less white-label

Option C: Hybrid
- Mix per arrangement
```

### 21.4 Multi-client value

```
Agentura benefits:
- Single platform pro multiple klienty
- Standardized processes
- Knowledge sharing
- Cross-client best practices
- Better margins

Klient benefits:
- Professional setup
- Agency expertise
- Lower setup cost
- Faster time-to-market

Boldem benefits:
- Higher volume
- Recurring revenue
- Agency referrals
- Lower CAC per klient
```

---

## 22. API + Webhook flow

### 22.1 API access

Per oficiální:
> *"V případě Boldem můžete prostřednictvím API využívat marketingové funkce přímo ve vaší aplikaci, nebo v podnikovém systému a jednoduše je automatizovat."*

```
Admin: Settings → API
   ↓
Generate API key:
- Name + description
- Scope (read/write per resource)
- Rate limits
- IP whitelist (optional security)
   ↓
**Key generated** – copy + secure
   ↓
[API key active]
```

### 22.2 Common API use cases

```
1. Add subscriber
   POST /subscribers
   Body: { email, name, custom_fields }

2. Update subscriber
   PUT /subscribers/{id}
   Body: { updated_fields }

3. Trigger campaign
   POST /campaigns/{id}/send

4. Send transactional email
   POST /transactional
   Body: { to, template_id, variables }

5. Custom event (Tarif Profi)
   POST /events
   Body: { event_name, user_id, properties }

6. Retrieve reports
   GET /reports/campaigns/{id}

7. Manage segments
   POST /segments
   Body: { name, criteria }
```

### 22.3 Webhook setup

Per oficiální:
> *"Specifický způsob komunikace, který umožňuje odeslat na adresu URL vaší aplikace informaci okamžitě poté, co v aplikaci Boldem dojde k nějaké akci, kterou potřebujete sledovat."*

```
Admin: Settings → Webhooks
   ↓
Configure:
- Target URL
- Events subscribed:
  - Soft bounce
  - Hard bounce
  - Spam complaints
  - Unsubscribes
  - Opens
  - Clicks
  - Custom events
  - Workflow milestones
- Signature verification (HMAC)
   ↓
[Webhooks active]
   ↓
On event:
- POST to target URL
- External app processes
```

### 22.4 E-shop doplněk pattern

Per oficiální:
> *"Rozhraní API využíváme také při přípravě doplňků pro různé e-shopové platformy. V takovém případě nemusíte nic programovat a stačí si doplněk nainstalovat v administraci dané platformy."*

```
E-shop doplněk pattern:
- Boldem provides API
- E-shop platform vyvíjí doplněk
- Plug-and-play installation
- No coding required

Boldem doplňky:
- Shoptet
- Shopify
- Upgates
- Rocketoo
```

### 22.5 Custom dev pattern

```
Custom CRM integration:
- Developer sets up
- Bidirectional sync
- Real-time webhook events
- Periodic batch sync
   ↓
Boldem benefits:
- CRM master data
- Customer enrichment

CRM benefits:
- Email engagement data
- Marketing attribution
```

---

## 23. GDPR compliance flow

### 23.1 GDPR features

```
Boldem GDPR compliance:
- Servery v ČR (no cross-border issues)
- Double Opt-in default
- GDPR consent fields v formech
- Audit trail per consent (IP + timestamp + text version)
- Right to be Forgotten
- Data export (DSAR)
- DPA available
- Preference center self-service
```

### 23.2 Double Opt-in flow

Per oficiální FAQ:
> *"Je to proces, kdy nový kontakt, který se přihlásí přes formulář do vašeho seznamu, musí potvrdit odběr vašich zpráv kliknutím na odkaz v e-mailu. Je tím tak zabráněno nevyžádanému posílání na nepotvrzené e-maily a na neplatné e-maily."*

```
Visitor submits form
   ↓
Boldem:
- Validates email
- Captcha check
- **GDPR consent logged** (IP + timestamp + text version)
   ↓
Status: Nepotvrzený
   ↓
Confirmation email sent (česky)
- Custom designed template
- Single CTA "Potvrdit odběr"
- Confirmation URL with token
   ↓
Recipient clicks confirm
   ↓
Boldem verifies token
   ↓
Status: Aktivní
   ↓
**Confirmation IP + timestamp logged**
   ↓
**Full GDPR audit trail:**
- Source form
- Submission IP + timestamp
- Consent text version
- Confirmation IP + timestamp
   ↓
Add to designated list
   ↓
Trigger welcome workflow
```

### 23.3 Right to Be Forgotten

```
Recipient requests deletion (per GDPR)
   ↓
Method A: Admin manual
   - Recipient details → Delete
Method B: API DELETE
   - External system call
Method C: Preference center
   - Self-service
Method D: Email to support@boldem.cz
   - Manual processing
   ↓
Boldem:
- Removes personal data
- Anonymizes events
- Auto-suppression permanent
- Audit log entry
- Confirmation email (GDPR-compliant)
- DPA documentation maintained
```

### 23.4 DSAR (Data Subject Access Request)

```
Recipient requests their data
   ↓
Method A: Admin generates export
Method B: Email support
   ↓
Boldem produces:
- Profile data
- Activity events
- Consent records
- Communication history
- Tagy
- CDP profile (pokud aplikuje)
   ↓
Provide within 30 dní (GDPR requirement)
```

### 23.5 Per Ecomail comparison advantage

Per Freshstart.cz:
> *"Ecomail je v českém prostoru dobře známý... Má však otázky týkající se zabezpečení dat uživatelů na zahraničních serverech."*

```
Boldem vs. Ecomail GDPR:
- Boldem: vlastní servery v ČR (clear jurisdiction)
- Ecomail: zahraniční servery (questions raised)
   ↓
Boldem advantage:
- CZ jurisdikce guaranteed
- No data security questions
- Clear DPA
```

### 23.6 CDP a GDPR

```
CDP centralizuje data ze všech zdrojů
   ↓
Single point of GDPR compliance:
- Easier audits
- Centralized control
- Unified deletion
- Consent management v one place
   ↓
Boldem CDP advantage pro GDPR
```

---

## 24. Migration z MailKompletu / jiných systémů

### 24.1 MailKomplet → Boldem migration

Per Freshstart.cz:
> *"Boldem, ačkoliv je nováčkem na trhu e-mailových nástrojů, čerpá zkušenosti ze svého předchůdce, MailKompletu."*

```
Migration scenario:
- Existing MailKomplet user
- Wants to migrate to Boldem
- Same family, easier transition
   ↓
Boldem migration team:
- Contact via chat / support@boldem.cz
- Specifický pro MailKomplet origin
- Smoother data preservation
   ↓
Data migration:
- Contacts s consent history
- Tagy (compatible structure)
- Templates (compatible)
- Workflows (re-create v Boldem moderner UI)
- Reports (export historical)
   ↓
Training na new Boldem UI
   ↓
[Migration complete]
```

### 24.2 General migration support

Per oficiální FAQ:
> *"Samozřejmě. Běžně pomáháme klientům přenést data při přechodu z jiného systému. Vhodné je se na přenosu domluvit předem. Stačí napsat do chatu naší zákaznické podpoře, nebo na e-mail support@boldem.cz."*

```
Migration request:
- Chat na boldem.cz
- E-mail support@boldem.cz
- Domluva předem
   ↓
Migration consultation:
- Source system identification
- Data scope (contacts? templates? workflows?)
- Custom integrations
- GDPR compliance
- Timeline
   ↓
Migration plan
   ↓
Execution
   ↓
Validation
```

### 24.3 Migration paths

#### Z Ecomail
```
- Export contacts CSV
- Field mapping to Boldem
- Templates: rebuild v Boldem (different structure)
- Workflows: re-create
- Integrations: re-configure
```

#### Z SmartEmailing
```
- Export contacts
- Field mapping
- Templates: rebuild
- Workflows: re-create v Boldem (vlastní logika)
- Sklik / sociální integrace: missing v Boldem
```

#### Z Mailchimp
```
- Export contacts
- Field mapping (Mailchimp tags → Boldem)
- Templates: rebuild
- Workflows: re-create
- Audience translation needed
```

#### Z Brevo (Sendinblue)
```
- Export contacts
- Field mapping
- Templates: rebuild
- Workflows: re-create
- Transactional re-configure
```

### 24.4 Data preservation guarantees

```
Boldem typicky migruje:
✅ Active contacts
✅ Custom fields
✅ Email addresses
✅ Consent records (per available data)
✅ Tagy / segmenty (mapped)
✅ Templates (rebuilt v Boldem editoru)
✅ Lists structure

⚠️ Often re-created (ne migrated):
- Workflows (different platform logic)
- Custom integrations (re-configured)
- Historical reports (export externally)
- Premium templates (rebuild)
- Advanced segmentation rules (re-define)
```

### 24.5 Hand-holding migration

Per Shoptet:
> *"Vhodné je se na přenosu domluvit předem."*

**Boldem approach:**
- **Hands-on support**
- **CZ native team**
- **Migration coordinated**
- **No data loss target**
- **Test prostředí často**

---

## 25. Datová mapa: co vidí kdo

| Data | Owner | Admin | Marketing | Designer | Analyst | Viewer | Agency | Subscriber | API |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Account settings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | per role | ❌ | per scope |
| Billing | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | per role | ❌ | per scope |
| User management | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | per role | ❌ | per scope |
| Per-uživatel práva | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | per role | ❌ | per scope |
| All recipients | ✅ | ✅ | ✅ | limited | view | view | per client | jen sebe | ✅ |
| Edit recipients | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | per role | ❌ | ✅ |
| Custom fields + Tagy | ✅ | ✅ | ✅ | view | view | view | per role | jen své | ✅ |
| Build segments | ✅ | ✅ | ✅ | ❌ | view | view | per role | – | ✅ |
| Email kampaně | ✅ | ✅ | ✅ | ✅ | view | view | per client | jen co dostal | ✅ |
| Send kampaně | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | per role | ❌ | ✅ |
| SMS kampaně | ✅ | ✅ | ✅ | ❌ | view | view | per role | jen co dostal | ✅ |
| PUSH oznámení | ✅ | ✅ | ✅ | ❌ | view | view | per role | receive | ✅ |
| In-App zprávy | ✅ | ✅ | ✅ | view | view | view | per role | in-app | ✅ |
| Transakční | ✅ | ✅ | per role | ❌ | view | view | per role | receive | ✅ |
| Automatizace | ✅ | ✅ | ✅ | view | view | view | per role | ❌ | ✅ |
| Activate automation | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | per role | ❌ | ✅ |
| Templates | ✅ | ✅ | ✅ | ✅ | view | view | per role | – | ✅ |
| Forms | ✅ | ✅ | ✅ | ✅ | view | view | per role | submit | ✅ |
| A/B testing | ✅ | ✅ | ✅ | view | view | view | per role | – | ✅ |
| Limiter (Tarif Profi) | ✅ | ✅ | ✅ | ❌ | view | view | per role | – | – |
| Vlastní události (Profi) | ✅ | ✅ | ✅ | view | ✅ | view | per role | tracked | ✅ |
| CDP profiles | ✅ | ✅ | ✅ | limited | ✅ | view | per role | jen sebe | ✅ |
| Reports | ✅ | ✅ | ✅ | view | ✅ | ✅ | per role | ❌ | ✅ |
| Tržby v aplikaci | ✅ | ✅ | ✅ | view | ✅ | ✅ | per role | ❌ | ✅ |
| Power BI / Looker Studio | ✅ | ✅ | per role | view | ✅ | view | per role | ❌ | ✅ |
| Integrace (Shoptet ...) | ✅ | ✅ | per role | ❌ | view | ❌ | per role | – | per scope |
| API keys | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | per role | – | – |
| Webhooks | ✅ | ✅ | per role | ❌ | view | ❌ | per role | – | per scope |
| White-label config | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | per role | ❌ | – |
| GDPR delete | ✅ | ✅ | per role | ❌ | per role | ❌ | per role | request | ✅ |

---

## 26. Známé úzkoprofilové místa

### 26.1 Méně automation templates

Per Freshstart.cz:
> *"Začínající uživatelé by mohli postrádat předpřipravené šablony pro automatizaci."*

⚠️ **Méně pre-built automation templates** než Ecomail / SmartEmailing.

### 26.2 Personalization tokens UI

Per Freshstart.cz:
> *"U Boldem je potřeba znát definici proměnné nebo ji vyhledat v nápovědě."*

⚠️ **Personalization tokens méně user-friendly** vs. Ecomail/SmartEmailing s "snadným výběrem".

### 26.3 Méně brand recognition

- **Mladší platforma** vs. Ecomail
- **Méně public presence**
- **Růstová fáze**
- **MailKomplet legacy** = některým neznámý

### 26.4 Limited public pricing transparency pro CDP

- E-mailing public ceník ✅
- SMS public ceník ✅
- CDP custom (sales-driven) ⚠️

### 26.5 Méně Sklik / sociální integrace

Per Freshstart.cz:
> *"Ecomail a SmartEmailing nabízejí funkci pro rozesílání promovaných příspěvků na sociální sítě nebo pro vytváření remarketingových kampaní přes Sklik."*

⚠️ **Boldem méně sociální/Sklik** integrace explicitně zmíněné.

### 26.6 Méně mezinárodní

- **CZ primary**
- **Některé funkce CZ-specific**
- **Méně global** vs. Mailchimp / Brevo

### 26.7 Méně global integrations

- **Core CZ e-shop** OK
- **Mezinárodní platforms** méně
- **Zapier** standardně

### 26.8 No formal CSA / ISO certification

- **Boldem nemá explicitně CSA** zmíněnou
- **Vs. Mailkit (7 ISO certifications)** méně formálních
- **Vs. Inxmail (CSA founding)** méně historie

### 26.9 Méně AI než modern competitors

- **AI editor** OK
- **Méně autonomous** než Klaviyo / HubSpot Breeze
- **Méně predictive ML**

### 26.10 Méně landing pages

- **Není primary landing page builder**
- **Vs. GetResponse / Mailchimp** méně komplexní
- **Workarounds** potřebné

### 26.11 Méně omnichannel hluboko

- **Email + SMS + PUSH + In-App** OK
- **Méně WhatsApp** native
- **Méně Facebook Messenger**
- **Méně mobile push deep features**

### 26.12 No webinars / courses

- **Není webinar hosting**
- **Vs. GetResponse** komplexní webinars

### 26.13 No paid newsletter business

- **Není podpora paid newsletter subscriptions**
- **Vs. Beehiiv / Substack / Kit**

### 26.14 Limit free trial

- **Dočasný přístup** sales-driven only
- **Není standardní free tier**
- **Vs. Mailchimp / MailerLite / Brevo free plans**

### 26.15 CDP setup vyžaduje sales engagement

- **Custom CDP** sales-driven only
- **Konzultace s obchodníkem** povinná
- **Méně self-serve** pro CDP

---

## 27. Doporučení pro design vlastních procesů

Pokud Boldem používáte v týmu, doporučujeme:

1. **Domain authentication day 1** – DKIM + SPF + DMARC
2. **AI editor využívat** strategicky (brand kit upload)
3. **Shoptet integrace day 1** (pokud e-shop) – verifikační kód flow
4. **Brand kit consistent** napříč kampaně
5. **Automation patterns** library:
   - Welcome (basic)
   - Cart abandonment (e-commerce)
   - Reaktivace (90+ dní)
   - Birthday (s datum field)
   - Custom events (Tarif Profi)
6. **Tagy taxonomy** flat structure s prefixes
7. **Custom events strategy** (Tarif Profi) – definovat business události
8. **4 A/B varianty** využívat strategicky
9. **Limiter pro velké rozesílky** (Tarif Profi, 1000+ příjemců)
10. **Double Opt-in always** (DACH-style GDPR compliance)
11. **Tržby v aplikaci** monitoring (nahrazuje GA pro email attribution)
12. **Power BI / Looker Studio** custom dashboards pro team
13. **Vlastní servery v ČR** leverage v procurement (CZ jurisdikce)
14. **Český tým podpory** využívat (telefon, e-mail, chat)
15. **"O marketingu bez obleků" události** návštěva pro CZ community
16. **MailKomplet legacy** pokud applicable – Boldem migration smooth
17. **Agency tarif** pokud agency model
18. **White-label setup** pokud agency
19. **Multi-channel orchestration** plan (email + SMS + PUSH + In-App)
20. **Sportovní klub setup** patterns (pokud klub)
21. **Neziskové templates** (pokud nonprofit)
22. **CDP investment** zvážit pro středně/větší e-shop
23. **GDPR compliance documentation** maintain
24. **API + webhooks** strategically (pokud developer team)
25. **Migration plan** pokud z jiné platformy

---

*Dokument zpracován z oficiálních zdrojů boldem.cz + Shoptet doplňky a praktických zdrojů (Freshstart.cz). Pro nejaktuálnější detaily je nutný engagement s Boldem sales / consultant teamem.*
