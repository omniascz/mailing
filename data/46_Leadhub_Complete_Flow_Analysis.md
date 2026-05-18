# Leadhub – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v Leadhubu prochází data, lidé a akce – od sales přes Shoptet/Upgates instalaci, sledovací pixel deployment, drag & drop editor design, RFM analýzu, předpřipravené automatizace, slevové kódy bidirectional, Facebook/Sklik audience sync, až po monitoring, podporu, a long-term retention. Speciální focus na **Leadhub jako český CDP pro e-shopy** s 12 zaměstnanci a hlubokou Shoptet integrací.

> Tento dokument doplňuje `45_Leadhub_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** Leadhub umí, tento popisuje, **kdo s tím interaguje a jak data tečou**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
> - **Leadhub je menší česká firma** (~12 zaměstnanců per RocketReach)
> - **Founder & CEO:** Lada Hrbáček
> - **CSO:** Rudolf Červený
> - **Sídlo:** Praha 3 – Žižkov (Jilmová 1456/75)
> - **IČO:** 04466683
> - **Specializace:** Shoptet + Upgates e-shopy v ČR/SK
> - **CDP s 360° profily** + real-time pixel tracking
> - **Starter plán ZDARMA** (až 500 přihlášených)
> - **Platform Pro od 216 Kč/měsíc** (zvýhodněno pro Shoptet/Upgates)
> - **RFM analýza zdarma** v rámci předplatného
> - **České skloňování jmen** – unikátní pro CZ trh
> - **Sklik integrace** – CZ trh advantage (Seznam.cz)
> - **Bidirectional slevové kódy** ze Shoptetu
> - **Předpřipravené automatizace** (sleva na první nákup nejúspěšnější)
> - **Docházející produkty** (predikce per-customer)
> - **Ellity loyalty integrace**
> - **Long-term retention:** 5-7+ let zákazníků
> - **Migrace z konkurence** = pattern u zákazníků

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Sales & qualification flow (e-shop-driven)](#2-sales-flow)
3. [Registrace a Starter plán (zdarma!)](#3-registrace)
4. [Shoptet doplněk installation flow](#4-shoptet-install)
5. [Upgates plugin installation flow](#5-upgates-install)
6. [Sledovací pixel deployment](#6-pixel-deploy)
7. [Data sync ze Shoptetu / Upgates](#7-data-sync)
8. [Database management + import kontaktů](#8-database)
9. [Drag & drop editor flow](#9-editor-flow)
10. [České skloňování v praxi](#10-skoionvani-prakticky)
11. [Personalizace bez merge tagů](#11-personalizace-flow)
12. [Předpřipravená kampaň "Sleva na první nákup"](#12-sleva-prvni-flow)
13. [Opuštěný košík automation flow](#13-kosik-flow)
14. [Docházející produkty flow](#14-dochazejici-flow)
15. [Win-back kampaně dle RFM](#15-winback-flow)
16. [Děkovačka po nákupu flow](#16-dekovacka-flow)
17. [RFM analýza setup flow](#17-rfm-flow)
18. [Segmentace flow](#18-segmentace-flow)
19. [SMS kampaň flow (od 0,80 Kč)](#19-sms-flow)
20. [Pop-up + webové prvky deployment](#20-popup-flow)
21. [Slevové kódy bidirectional Shoptet](#21-slevovy-kod-flow)
22. [Facebook / Meta Ads sync flow](#22-facebook-flow)
23. [Google Ads + Sklik sync flow](#23-google-sklik-flow)
24. [Ellity loyalty flow](#24-ellity-flow)
25. [Multi-shop management flow (agentury)](#25-multi-shop)
26. [Reporting + revenue tracking](#26-reporting)
27. [Migrace od konkurence (Mailchimp, Ecomail)](#27-migrace)
28. [Customer support flow (česká podpora)](#28-support)
29. [Datová mapa: co vidí kdo](#29-data-map)
30. [Známé úzkoprofilové místa](#30-bottlenecks)

---

## 1. Mapa všech aktérů

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│         LEADHUB PLATFORM ECOSYSTEM                                   │
│         Leadhub s.r.o. · IČO 04466683 · Praha 3 – Žižkov             │
│         CDP pro e-shopy · Český nástroj                              │
│         ~12 zaměstnanců · 5-7+ let customer retention                │
│         Starter ZDARMA · Platform Pro od 216 Kč                      │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [Leadhub s.r.o. tým]                                                │
│   ├─ Lada Hrbáček (Founder & CEO)                                    │
│   ├─ Rudolf Červený (CSO)                                            │
│   ├─ Monika Zavadská (Marketing Automation Specialist)               │
│   ├─ Tým podpory (česká!)                                            │
│   ├─ Tým vývoje (~12 lidí celkem)                                    │
│   └─ Onboarding specialisté                                          │
│           │                                                          │
│           ▼                                                          │
│                                                                      │
│   ┌────────────────────────────────────────────┐                     │
│   │   Leadhub uživatelský účet                 │                     │
│   │                                            │                     │
│   │   USER ROLES (per Podmínky použití):       │                     │
│   │   ├─ Vlastník (full access + billing)      │                     │
│   │   ├─ Analytik (read-only, reports)         │                     │
│   │   ├─ Editor (upravy kampaní)               │                     │
│   │   └─ Technická integrace (DNS + setup)     │                     │
│   │                                            │                     │
│   │   PLATFORM FEATURES:                       │                     │
│   │   ├─ CDP + 360° profily                    │                     │
│   │   ├─ Email kampaně                         │                     │
│   │   ├─ SMS kampaně                           │                     │
│   │   ├─ Automatizace                          │                     │
│   │   ├─ Segmentace                            │                     │
│   │   ├─ Personalizace (skloňování CZ)        │                     │
│   │   ├─ Pop-up + webové prvky                 │                     │
│   │   ├─ Slevové kódy                          │                     │
│   │   ├─ RFM analýza                           │                     │
│   │   ├─ Statistiky + reporting                │                     │
│   │   └─ API přístup                           │                     │
│   │                                            │                     │
│   │   MULTI-SHOP MANAGEMENT:                   │                     │
│   │   ├─ E-shop A account                      │                     │
│   │   ├─ E-shop B account                      │                     │
│   │   ├─ Zahraniční mutace (CS, SK)            │                     │
│   │   └─ Přepínání mezi účty                   │                     │
│   └──────────────┬─────────────────────────────┘                     │
│                  │                                                   │
│                  ▼                                                   │
│   [E-shop platforma]                                                 │
│       │                                                              │
│       ├─→ SHOPTET (deepest integration!)                             │
│       │   - Doplněk z Shoptet Marketplace                            │
│       │   - Real-time sync                                           │
│       │   - Bidirectional slevové kódy                               │
│       │                                                              │
│       ├─→ UPGATES (native integration)                               │
│       │   - Plugin z Upgates Marketplace                             │
│       │   - Sync objednávek + produktů                               │
│       │                                                              │
│       ├─→ Custom platforma (API only)                                │
│       │   - Leadhub API                                              │
│       │   - Custom integration                                       │
│       │                                                              │
│       └─→ Sledovací pixel (na webu)                                  │
│           - JavaScript pixel                                         │
│           - Real-time event tracking                                 │
│                  │                                                   │
│                  ▼                                                   │
│   [Customers / Zákazníci e-shopu]                                    │
│       │                                                              │
│       ├─→ Email subscribers                                          │
│       ├─→ SMS subscribers                                            │
│       ├─→ Web visitors (tracked)                                     │
│       ├─→ Buyers (active)                                            │
│       ├─→ Win-back targets (lapsed)                                  │
│       └─→ Lost customers                                             │
│                                                                      │
│   [Marketing channels]                                               │
│   ┌────────────────────────────────────────────┐                     │
│   │   1. Email (newsletter + automation)       │                     │
│   │   2. SMS (od 0,80 Kč/SMS)                  │                     │
│   │   3. Pop-up na webu                        │                     │
│   │   4. Webové prvky + notifikace             │                     │
│   │   5. Facebook / Meta Ads (audience sync)   │                     │
│   │   6. Google Ads (audience sync)            │                     │
│   │   7. Sklik (CZ unikátní!)                  │                     │
│   │   8. Instagram (přes Meta)                 │                     │
│   └────────────────────────────────────────────┘                     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér | Vstupní bod | Co dělá | Co vidí |
|---|---|---|---|
| **Vlastník účtu** | Login + ownership | Settings, billing, users | Vše |
| **Analytik** | Login (read-only) | Reports, statistiky | Read-only |
| **Editor** | Login | Kampaně, automatizace | Per scope |
| **Technická integrace** | Login (limited) | DNS, integrace | Setup only |
| **Konečný zákazník (e-shop)** | Email / SMS / pop-up | Engage | Své interakce |
| **Lada Hrbáček (CEO)** | Strategy | Vedení firmy | Strategic |
| **Tým podpory** | Tickets | Issue resolution | s consent |
| **Onboarding specialista** | Nový account | Setup pomoc | s consent |
| **Shoptet platforma** | Doplněk install | Sync | – |
| **Upgates platforma** | Plugin install | Sync | – |
| **Sledovací pixel** | JavaScript on web | Real-time tracking | Web visitors |
| **API klient** | REST API | Programmatic akce | Per scope |
| **Facebook / Meta** | Audience sync | Reklama | Customer audiences |
| **Google Ads** | Audience sync | Reklama | Customer match |
| **Sklik** | Audience sync | CZ reklama | Custom audiences |
| **Ellity** | Loyalty integration | Body sync | Loyalty data |

---

## 2. Sales & qualification flow (e-shop-driven)

### 2.1 Lead acquisition

```
Lead sources:
- leadhub.co inbound (přímý web)
- Shoptet Marketplace (doplnky.shoptet.cz)
- Upgates Marketplace (doplnky.upgates.cz)
- Word-of-mouth (CZ e-commerce community)
- Referrals from existing customers
- Blog content (leadhub.co/blog/cs)
- YouTube tutorials (@leadhub2660)
- Social media (Facebook, LinkedIn, Instagram)
- E-commerce events (Reshoper, conference)
- Direct outreach (limited - menší tým)
```

### 2.2 Self-service první kontakt

```
Typický flow:
1. E-shopař Googluje "email marketing pro Shoptet"
   nebo
   Vidí Leadhub v Shoptet Marketplace
   ↓
2. Navštíví leadhub.co
   ↓
3. Zaregistruje se zdarma (Starter plán)
   ↓
4. Instaluje doplněk v Shoptetu / Upgates
   ↓
5. Začne používat Leadhub okamžitě
   ↓
6. Případně upgrade na Platform Pro
```

⚠️ **Self-service first** = nízká vstupní bariéra.

### 2.3 Qualification criteria

```
Leadhub fits pokud:

✅ Provozuje e-shop na Shoptet nebo Upgates (idealní)
✅ Český nebo slovenský trh (primary)
✅ B2C e-commerce
✅ 0-50 000 přihlášených (Platform Pro)
✅ Rozpočtová citlivost
✅ Cíl: nízkonákladová alternativa
✅ Hodnota: česká podpora + skloňování
✅ Potřeba: integrace s Shoptet/Upgates
✅ Migrace z dražšího nástroje (Mailchimp)

❌ Non-Shoptet/non-Upgates platforma (menší fit)
❌ B2B SaaS (HubSpot lepší)
❌ Mobile-first app (Braze lepší)
❌ Velmi velký e-shop (1M+) (Klaviyo Enterprise lepší)
❌ DACH/PL trh primárně (lokální alternativy lepší)
❌ AI-driven marketing focus (Klaviyo/SALESmanago lepší)
```

### 2.4 Pricing transparency

```
Leadhub pricing:
- Starter: ZDARMA (0-500 přihlášených)
- Platform Pro: od 216 Kč/měsíc (0-500)
- Cena škáluje s počtem přihlášených
- Individual: custom (∞)
- SMS: od 0,80 Kč
   ↓
Pricing dostupný na webu
Není sales-driven (jak u enterprise nástrojů)
```

### 2.5 21denní trial Platform Pro

Per oficiální:
> *"21denní bezplatné zkušební období"* (pro Platform Pro)

```
Trial workflow:
1. Registrace
2. Spustit Platform Pro trial
3. 21 dní plný přístup
4. Testování všech funkcí
5. Po 21 dnech:
   - Konverze na placený
   - Nebo přechod na Starter
   - Nebo cancellation
```

⚠️ **Risk-free testing** pro mid-tier features.

---

## 3. Registrace a Starter plán (zdarma!)

### 3.1 Registrace flow

```
1. leadhub.co/registrace
2. Vyplnit:
   - Email
   - Heslo
   - Jméno společnosti
   - Telefon (optional)
3. Verifikace emailu
4. Login → Starter plán aktivní
```

### 3.2 Starter plán reality

Per oficiální ceník:
- **0-500 přihlášených**
- **Cena: ZDARMA**
- ✅ Všechny funkce
- ✅ Podpora emailem
- ⚠️ Logo "Leadhub" v patičkách kampaní
- ⚠️ Limit 500 přihlášených

### 3.3 Typický Starter use case

```
Začínající e-shopař:
- 100 zákazníků na začátek
- Žádný rozpočet na nástroj
- Chce zkusit email marketing
- Žádný technický team
   ↓
Leadhub Starter:
- Zdarma
- Plný feature set
- Logo akceptovatelné (na začátku)
   ↓
Začne sbírat data, posílat newslettery
   ↓
Když databáze roste 500+:
- Nutný upgrade na Platform Pro
- Nebo limity začnou tlačit
   ↓
Konverze na placený
```

### 3.4 Upgrade ze Starter na Platform Pro

```
Triggery pro upgrade:
- Limit 500 přihlášených dosažen
- Branding na vlastní (bez Leadhub loga)
- Telefonní podpora potřeba
- Advanced features (méně přístupné v Starteru)
   ↓
Upgrade flow:
1. Settings → Upgrade plán
2. Vybrat Platform Pro
3. Vyplnit billing info
4. Aktivovat plán
5. Logo Leadhub zmizí z kampaní
```

---

## 4. Shoptet doplněk installation flow

### 4.1 Per Shoptet Doplňky

> *"Leadhub je český CRM nástroj navržený výhradně pro e-shopy, které chtějí zvyšovat tržby e-mailingem a marketingovými automatizacemi."*

### 4.2 Installation steps

```
Shoptet doplněk install:

1. Přihlásit se do Shoptetu
2. Doplňky → Marketplace → vyhledat "Leadhub"
3. Klik "Instalovat"
4. Přijmout oprávnění (API přístup k objednávkám, produktům, zákazníkům)
5. Shoptet propojí účet s Leadhubem
6. Pokud nemá Leadhub účet: vytvořit
7. Pokud má: párovat existující
8. Sync inicializace začne
9. Importují se:
   - Produkty
   - Objednávky (historie!)
   - Zákazníci
   - Slevové kódy nastavení
10. Po importu (záleží na velikosti): Leadhub plně funkční
```

### 4.3 Per oficiální Shoptet page

> *"Po instalaci se do Leadhubu automaticky synchronizují objednávky, produkty i zákaznické profily. Díky tomu můžete během pár minut spouštět přesně cílené e‑mailové i SMS kampaně."*

⚠️ **Plug-and-play** – pár minut po instalaci dispatchable.

### 4.4 Real-time sync po instalaci

```
Continuous sync Shoptet → Leadhub:
- Nová objednávka → Leadhub events
- Nový zákazník → Leadhub kontakt
- Update produktu → Leadhub catalog
- Slevový kód použit → tracked
- Cancel objednávky → tracked
   ↓
Vše v reálném čase
Žádné manual exports/imports
```

### 4.5 Per Shoptet Marketplace recenze

> *"Skvělý doplněk. V Leadhubu je potřeba se trochu zorientovat, ale to je spíš pohled laika. Super jsou šablony, které si lze opravdu lehce upravit. Doporučuji."*

> *"S Leadhubem jsme spokojení. Veškeré nastavení bylo jednoduché a rychlé. Přecházeli jsme z jiného doplňku, takže jsme ocenili pomoc při přenosu šablon, ušetřilo nám to spoustu času. Chválíme taky podporu, která vždy ochotně poradí."*

### 4.6 Initial setup po instalaci

```
Po Shoptet install:
1. Verify import (kontakty, objednávky)
2. Nastavit DNS records (SPF, DKIM, DMARC)
3. Verify domain (sender)
4. Spustit Leadhub pixel na webu
5. Definovat first segments
6. Spustit první předpřipravenou automatizaci
7. Vytvořit první newsletter
   ↓
Production ready
```

---

## 5. Upgates plugin installation flow

### 5.1 Per Upgates Marketplace

```
Upgates plugin install:

1. Přihlásit do Upgates admin
2. Doplňky → Marketplace → "Leadhub"
3. Instalovat
4. API connection
5. Sync inicializace
6. Setup pixel
7. Production ready
```

### 5.2 Funkce identické se Shoptet

```
Upgates → Leadhub:
- Objednávky sync
- Produkty sync
- Zákazníci sync
- Slevové kódy (bidirectional)
- Real-time pixel
- Stejné automatizace
- Stejné šablony
```

### 5.3 Per Upgates Marketplace

> *"Jednoduchá segmentace a personalizace - Leadhub vám umožní doručovat obsah na míru podle zájmů, nákupního chování, preferencí či aktivit."*

> *"Předpřipravené automatické kampaně - nemusíte tápat a nemusíte na nic čekat."*

> *"Podpora - český nástroj, česká podpora, která je pohotová a ochotná."*

---

## 6. Sledovací pixel deployment

### 6.1 Pixel install

```
Leadhub pixel deployment:

PRO SHOPTET / UPGATES:
- Pixel automaticky aktivován po install
- Nahrán přes doplněk
- Žádná manual práce nutná

PRO CUSTOM PLATFORMY:
1. V Leadhubu: získat pixel kód (JS snippet)
2. Vložit na všechny stránky webu
3. Před </head> nebo </body>
4. Verify (Leadhub kontrola)
5. Test (návštěva → event v Leadhubu)
   ↓
Pixel live
```

### 6.2 GDPR Centrum soukromí

Per oficiální:
> *"Pokud se návštěvník webu neodhlásí poté, co je o této skutečnosti informován pomocí Centra soukromí, bude jeho chování na webu sledováno v zájmu pro něj více relevantního, méně otravného marketingu."*

```
Centrum soukromí flow:

Visitor přijde na e-shop:
   ↓
Cookie banner zobrazen
   ↓
Visitor volí:
- "Souhlasím" → pixel tracked
- "Nesouhlasím" → pixel NOT tracked
- "Personalizace" → granular settings
   ↓
GDPR compliance maintained
```

### 6.3 Co pixel sleduje

```
Real-time tracked events:
- Visit (any page)
- Product view
- Category view
- Search
- Add to cart
- Begin checkout
- Order completed
- Custom events (via JS API)
```

### 6.4 Per oficiální (Upgates description)

> *"Leadhub zpracovává miliony událostí v reálném čase. Sbírá data z vašeho e-shopu. Zaznamená veškerou aktivitu zákazníků od otevření e-mailu nebo kliknutí na reklamu, přes zhlédnutí stránky nebo produktu až po průběh nákupu."*

⚠️ **Million events/real-time** capability.

---

## 7. Data sync ze Shoptetu / Upgates

### 7.1 Initial sync

```
První sync po install:

Importuje se:
1. Všechny historické objednávky
   - Datum
   - Hodnota
   - Produkty
   - Zákazník
2. Všichni zákazníci
   - Email, telefon, jméno
   - Pohlaví (pro skloňování!)
   - Adresa
3. Všechny produkty
   - SKU, název, cena
   - Dostupnost
   - Kategorie
   - Obrázky
4. Slevové kódy (typy + nastavení)
   ↓
Duration závisí na velikosti:
- Malý e-shop: minuty
- Střední: hodiny
- Velký: dny (background sync)
```

### 7.2 Ongoing real-time sync

```
After initial:

Continuous sync events:
- Nová objednávka → Leadhub (sekundy)
- Update produktu → Leadhub
- Nový zákazník → Leadhub
- Cancel objednávky → status updated
- Změna ceny → Leadhub catalog updated
- Slevový kód použit → conversion tracked
   ↓
Real-time accuracy
```

### 7.3 Bidirectional flow

```
Slevové kódy (special case):

Leadhub → Shoptet:
- Generated kody se ukládají do Shoptetu
- Aktivované pro použití
- Tracking připraven

Shoptet → Leadhub:
- Použití kódů → konverze tracked
- ROI measurement per kód
- Per-kampaň attribution
```

### 7.4 Data sync v RFM

```
RFM data sync flow:

1. Shoptet sync → Leadhub
   - Order history (M)
   - Order frequency (F)
   - Recency timestamps (R)
2. Leadhub vypočítá RFM scores
3. Auto-segmentace do RFM segmentů
4. Real-time updates při nových objednávkách
   ↓
Vždy aktuální RFM
```

---

## 8. Database management + import kontaktů

### 8.1 Per nápovědy

V nápovědě: **"Správa kontaktů a práce s databází"**.

### 8.2 Import kontaktů metody

```
Import options:

1. Auto-sync ze Shoptet/Upgates (default)
   - Žádná manual práce
   - Real-time
   - Bidirectional

2. Manual import (CSV)
   - Upload CSV souboru
   - Mapping fields
   - Validation
   - Suppression check
   - Import

3. API import
   - Leadhub API endpoint
   - Programmatic add/update
   - Bulk operations

4. Lead Ads (Facebook)
   - Auto-import z FB Lead Ads
   - Trigger uvítací sekvence
```

### 8.3 Suppression management

```
Suppression handling:
- Unsubscribe odkaz v každém emailu
- Automatic suppression on opt-out
- Hard bounces auto-suppress
- Spam complaints auto-suppress
- Manual suppression management
   ↓
GDPR compliant
```

### 8.4 Database hygiene

```
List cleaning:
- Identifikovat neaktivní (90+ dní)
- Re-engagement try (last attempt)
- Pokud neúspěch → suppress
- RFM "Lost" segment → consider remove
   ↓
Kvalitnější deliverability
Nižší náklady (méně přihlášených)
```

---

## 9. Drag & drop editor flow

### 9.1 Per Shoptet Doplňky

> *"Intuitivní drag&drop editor, ve kterém i začátečníci vytvoří krásné e-maily."*

### 9.2 Email creation flow

```
Drag & drop email flow:

1. Nová kampaň → vybrat typ
2. Vybrat šablonu:
   - Předpřipravená
   - Nebo blank canvas
   - Nebo HTML custom

3. Drag bloky:
   - Text
   - Obrázek
   - Tlačítko CTA
   - Produkt (z feedu)
   - Odpočet
   - Sociální sítě
   - Separator
   - Spacer
   - Container (column layout)

4. Personalizace:
   - Klik na text → vložit jméno
   - Skloňování auto (1./5. pád)
   - Dynamic content per segment

5. Test preview:
   - Desktop view
   - Mobile view
   - Pro muže view
   - Pro ženy view
   - Pro neznámé pohlaví view

6. Subject line + preheader

7. Send settings:
   - Audience (segment)
   - Send time (now / scheduled)
   - A/B test (optional)
   - UTMs

8. Review checklist:
   - Links checked
   - Personalization correct
   - Mobile responsive
   - Spam check

9. Send / Schedule
```

### 9.3 Vlastní HTML

Per oficiální:
> *"Leadhub umožňuje vkládání vlastního HTML kódu a přizpůsobení šablon přesně tak, jak potřebujete."*

```
HTML override:
- Pokročilí uživatelé
- Custom design
- Vlastní CSS
- Komplexní layouts
- Brand customization
```

### 9.4 Per oficiální Google fonts

> *"V editoru najdete všechny Google fonty. Můžete tak sjednotit design e-mailu s vaším webem. Do editoru můžeme přidat a jakýkoli jiný font na vaše požádání."*

⚠️ **Custom font on request** = personal touch (díky 12-člennému týmu).

---

## 10. České skloňování v praxi

### 10.1 Per oficiální workflow

> *"Před každou zkontrolujete přímo v editoru, zda je oslovení a personalizace textu správně nastavena pro muže a ženy, ale také pro kontakty, u kterých nemáte tyto údaje k dispozici. Oslovení v 1. nebo 5. pádě. Automatické skloňování jména nebo příjmení."*

### 10.2 Skloňování flow

```
Marketér v editoru:

1. Klik na pole pro text
2. Volba "Vložit oslovení"
3. Vybrat:
   - Pád (1. nebo 5.)
   - Formálnost (Ahoj / Vážený)
   - Fallback text (pro nesignalizované pohlaví)
4. Auto-inserted personalization
5. Náhled:
   - Pro muže: "Ahoj Lukáši"
   - Pro ženu: "Ahoj Petro"
   - Bez pohlaví: "Ahoj zákazníku"
6. Test preview každý variant
7. Confident send
```

### 10.3 Per oficiální claim

> *"Leadhub je jediný český nástroj, kde personalizaci sdělení i produktové nabídky jednoduše naklikáte přímo v editoru – bez nutnosti programování a vkládání složitých merge tagů."*

⚠️ **"Jediný" = silný marketing claim** (USP claim).

### 10.4 Use case příklady

```
Příklad 1 - Newsletter:
"Ahoj {jméno|5.pád},
máme pro tebe novinky..."
   ↓
Pro muže Lukáš: "Ahoj Lukáši, máme pro tebe novinky..."
Pro ženu Petra: "Ahoj Petro, máme pro tebe novinky..."

Příklad 2 - Formální:
"Vážený/á {pán/paní} {příjmení|5.pád},
oznamujeme vám..."
   ↓
Muž Novák: "Vážený pane Nováku, oznamujeme vám..."
Žena Nováková: "Vážená paní Nováková, oznamujeme vám..."
```

### 10.5 Vs. konkurence problém

```
Mailchimp (zahraniční):
"Hi *|FNAME|*,..."
- *|FNAME|* = Petr
- Result: "Hi Petr,..."

Problem v CZ kontextu:
- Email typically v CZ jazyce
- "Ahoj Petr" = chybné!
- Měla by být: "Ahoj Petře"
- Mailchimp neumí
   ↓
Leadhub umí
Trapas = neexistuje
```

---

## 11. Personalizace bez merge tagů

### 11.1 Per oficiální

> *"Oslovení do předmětu nebo těla e-mailu a personalizaci textu podle pohlaví vložíte jedním kliknutím. Není třeba vkládat žádné složité merge tagy."*

### 11.2 One-click personalization

```
Marketér flow:
1. V editoru: click na text
2. Toolbar zobrazí "Vložit personalizaci"
3. Dropdown menu:
   - Jméno (1./5. pád)
   - Příjmení
   - Email
   - Telefon
   - Pohlaví
   - Datum narození
   - Produkty z poslední objednávky
   - Doporučené produkty
   - Slevový kód
   - Loyalty body
   - Custom atribut
4. Vybrat → auto-inserted
5. Konfigurovat fallback (pokud chybí data)
6. Done
   ↓
Žádné merge tagy
Žádné syntax errors
Žádné typo problémy
```

### 11.3 Per Markéta Kocichová (cistedrevo.cz)

> *"Práce s proměnnými je jednoduchá, nástroj celkově intuitivní."*

⚠️ **"Práce s proměnnými je jednoduchá"** = zákaznický feedback potvrzuje USP.

### 11.4 Per oficiální produkty z poslední objednávky

> *"Produkty z poslední objednávky jsou vhodné do automatizací s žádostí o zpětnou vazbou po nákupu nebo do retenčních automatizací. Do e-mailu je vložíte pouhým kliknutím a po jejich odeslání se automaticky vygenerují příjemci produkty, které obsahovala jeho poslední objednávka."*

```
Per-recipient dynamic content:

Marketér jednou vloží blok "Produkty z poslední objednávky"
   ↓
Při odeslání:
- Zákazník A: vidí jeho produkty
- Zákazník B: vidí jeho produkty (jiné!)
- Zákazník C: vidí jeho produkty (jiné!)
   ↓
1 email šablona = N personalized email
```

---

## 12. Předpřipravená kampaň "Sleva na první nákup"

### 12.1 Per Upgates Marketplace

> *"Například předpřipravenou kampaň Sleva na první nákup (konverzně nejúspěšnější) můžete spustit okamžitě po instalaci Leadhubu."*

⚠️ **Označená oficiálně jako konverzně nejúspěšnější** předpřipravená kampaň.

### 12.2 Kompletní flow

```
"Sleva na první nákup" workflow:

1. SETUP (jednou):
   - Marketér v Leadhubu otevře předpřipravenou kampaň
   - Customize:
     - Výši slevy (např. 10%)
     - Min. hodnota objednávky
     - Časová platnost kódu (např. 14 dní)
     - Design pop-upu
     - Design uvítacího emailu
   - Aktivovat

2. VISITOR FLOW:
   - Návštěvník přijde na web
   - Pop-up se zobrazí (delay 5s nebo exit intent)
   - Pop-up obsah:
     "Získejte 10% slevu na první nákup"
     - Email input
     - Tlačítko "Chci slevu"
   - Návštěvník vyplní email + souhlas s marketingem

3. LEAD CAPTURE:
   - Email → Leadhub kontakt
   - Auto-tag "Nově registrovaný"
   - Auto-tag "Sleva na první nákup"

4. UNIKÁTNÍ KÓD GENERATION:
   - Leadhub generuje unikátní kód
   - Kód je per-user, časově omezený
   - Pushed to Shoptet (bidirectional)

5. UVÍTACÍ EMAIL:
   - Auto-send within seconds
   - Personalizovaný (skloňování!)
   - Obsahuje:
     - Welcome message
     - Unikátní slevový kód
     - Odpočet času platnosti
     - CTA "Použít kód"

6. KONVERZE TRACKING:
   - Zákazník přijde zpět na web
   - Použije kód v košíku (Shoptet)
   - Konverze tracked v Leadhubu
   - Per-kampaň ROI

7. FOLLOW-UP:
   - Pokud nákup → trigger Děkovačku
   - Pokud nenakoupil za X dní → reminder
   - Pokud nikdy nenakoupil → win-back sekvence

8. RFM SHIFT:
   - Nový zákazník → "New Customer" RFM segment
   - Triggery další onboarding automatizace
```

### 12.3 Proč funguje

```
Reasons of success:
- Imediate incentive (slevu hned)
- Time pressure (odpočet)
- Low barrier (jen email)
- Personalizovaný (skloňování, kód)
- Sub-second deliverability (real-time)
- Bidirectional integrace (Shoptet)
- A/B testovatelné
- ROI měřitelné
```

---

## 13. Opuštěný košík automation flow

### 13.1 Per oficiální (CDP slovník)

> *"Jakmile zákazník splní podmínku (opustí košík, přejde do rizikového RFM segmentu, uskuteční první nákup,...), CDP nástroj automaticky spustí odpovídající kampaň."*

### 13.2 Cart abandonment flow

```
Opuštěný košík automation:

TRIGGER:
- Zákazník přidal produkt(y) do košíku
- Zákazník nepokračoval k checkout (15 min+ neaktivita)
- Nebo: opustil checkout proces

PIXEL DETECTION:
- Sledovací pixel zachytí "add_to_cart" event
- Žádný "purchase" event nenásleduje
- Po X minutách → trigger

EMAIL 1 (T+1 hod):
- Subject: "Zapomněli jste na svůj košík?"
- Personalizovaný:
  - Jméno (skloňované)
  - Produkty v košíku (z feedu)
  - Ceny
  - Total
- CTA: "Dokončit nákup"

EMAIL 2 (T+24 hod):
- Pokud nákup → automation stop
- Pokud ne → email s incentivem
- Subject: "Máme pro vás 5% slevu"
- Obsah: produkty + unikátní kód

EMAIL 3 (T+72 hod):
- Pokud nákup → stop
- Pokud ne → final attempt
- Subject: "Poslední šance: 10% sleva"
- Vyšší incentiv

KONVERZE / EXIT:
- Pokud nákup → success, attribution
- Pokud po 7 dnech ne → exit sequence
- Optional: re-add do general newsletteru
```

### 13.3 Per-cart personalization

```
Email obsahuje:
- Produkty v opuštěném košíku (auto-vložené!)
- Aktuální ceny
- Dostupnost
- Obrázky produktů
- Direct link na košík (deep link)
- Continue shopping CTA
```

### 13.4 ROI měření

```
Cart abandonment ROI:
- Industry standard: ~10% recovery
- S Leadhub: tracked per-kampaň
- Revenue attributed automaticky
- Per-email performance
- Per-incentiv performance
```

---

## 14. Docházející produkty flow

### 14.1 Per oficiální (leadhub.co/dochazejici-produkty)

> *"Připomeňte zákazníkům docházející produkty ve chvíli, kdy je nejspíš budou znovu potřebovat. Automatizace, která zvýší opakované nákupy – bez manuální práce a složitého nastavování."*

### 14.2 Mechanika ML predikce

Per oficiální:
> *"Každý zákazník má jinou spotřebu. Leadhub automaticky vypočítá, kdy mu produkty pravděpodobně docházejí – a přesně v ten moment odešle připomínkový e-mail."*

### 14.3 Workflow

```
Docházející produkty AI flow:

ANALÝZA (background, continuous):
- Per zákazník: nákupní historie
- Per produkt: standardní cyklus
- Predikce: kdy dojde
   ↓
Příklad:
- Zákazník Petr koupil kávu 1.1.
- Druhá káva 31.1. (30 dní cyklus)
- Třetí káva 2.3. (~30 dní)
- Predikce: další nákup ~1.4.
   ↓
TRIGGER:
- Datum predikce mínus X dní (např. 3 dny před)
- Auto-trigger email

EMAIL FLOW:
- Subject: "Petře, vaše káva už možná dochází?"
- Personalizovaný:
  - Jméno (skloňované!)
  - Konkrétní produkt
  - Datum posledního nákupu
  - CTA: "Doobjednat"
- Direct link na produkt
   ↓
KONVERZE:
- Zákazník klikne
- Přidá do košíku
- Dokončí nákup
- Cycle resetuje
```

### 14.4 Per oficiální

> *"Produkty vložíte do e-mailu jednoduše – tahem myši v drag & drop editoru. Bez programování, bez složitých merge tagů."*

> *"Nastavit kampaň zvládnete během pár minut. Najdete ji už připravenou ve svém účtu – stačí ji jen spustit."*

⚠️ **Plug-and-play retention automation** s AI-like funkcí.

### 14.5 Vhodné pro

```
Produkty s opakovanou spotřebou:
- Drogerie (krémy, šampóny)
- Doplňky stravy (vitamíny)
- Hygiena (toaletní papír, plenky)
- Krmivo pro zvířata
- Náplně (kávovary, tiskárny)
- Kontaktní čočky
- Vitamíny a léky
- Kosmetika
- Spotřební materiál
```

⚠️ Nevhodné pro one-time purchases (móda, elektronika).

---

## 15. Win-back kampaně dle RFM

### 15.1 At Risk + Lost segments

```
RFM trigger pro win-back:

At Risk segment:
- Byl high-value (M)
- Frekvence klesá (F klesající)
- Recency vysoká (R = delší doba bez nákupu)
   ↓
"At Risk" auto-segment

Lost segment:
- Žádný nákup 6+ měsíců
- Předtím byl aktivní
- Total spend > 0
   ↓
"Lost" auto-segment
```

### 15.2 At Risk win-back flow

```
At Risk automation:

T+0: Detection
- RFM segment shift → trigger
- Tag: "At Risk"

EMAIL 1 (T+0):
- Subject: "Petře, dlouho jsme se neviděli"
- Soft re-engagement
- Bez slevy
- "Co je nového v našem e-shopu"

EMAIL 2 (T+7):
- Pokud reagoval → stop, return to normal
- Pokud ne → escalate
- Subject: "Speciální nabídka jen pro vás"
- 10-15% sleva

EMAIL 3 (T+14):
- Pokud reagoval → stop
- Pokud ne → final
- Subject: "Naposledy: 20% sleva"
- Higher incentiv, time-limited

EXIT:
- Pokud konverze → return to normal
- Pokud ne → graduate to "Lost"
- Final: suppress nebo low-frequency
```

### 15.3 Lost segment přístup

```
Lost segment:
- Možná suppress (snížit náklady)
- Možná last attempt s velkou slevou
- Možná re-permission ask
- Možná FB Custom Audience (last touch via paid)
```

### 15.4 RFM transition tracking

```
RFM transitions:
- Champions → At Risk (warning!)
- New → Promising (good!)
- At Risk → Hibernating (bad)
- Hibernating → Lost (worst)
- Lost → Won Back (great!)
   ↓
Leadhub tracks all transitions
Reporting per RFM cohort
```

---

## 16. Děkovačka po nákupu flow

### 16.1 Per nápovědy

V nápovědě: **"Děkovačka"** sekce.

### 16.2 Post-purchase flow

```
Děkovačka workflow:

TRIGGER:
- Shoptet/Upgates: order_completed event
- Real-time sync → Leadhub

EMAIL 1 (T+0, immediate):
- Subject: "Petře, děkujeme za objednávku!"
- Obsah:
  - Personalizované poděkování
  - Shrnutí objednávky (auto-vložené!)
  - Číslo objednávky
  - Doba doručení
  - Kontakt na zákaznický servis

EMAIL 2 (T+1 den):
- Subject: "Vaše zásilka je na cestě"
- Tracking info (pokud k dispozici)
- Tips for arrival

EMAIL 3 (T+5 dní, předpoklad doručení):
- Subject: "Doufáme, že jste spokojeni"
- Asking about delivery
- Customer service kontakt

EMAIL 4 (T+7 dní):
- Subject: "Jak hodnotíte produkty?"
- Asking for review
- Link na review platformu
- Loyalty body za review (Ellity)

EMAIL 5 (T+14 dní):
- Subject: "Pro vás vybrané"
- Cross-sell doporučení
- Personalizované per nákup
- Slevový kód (optional)

EMAIL 6 (T+30 dní):
- Subject: "Loyalty program - zaregistrujte se"
- Ellity nabídka
- VIP benefits
```

### 16.3 Per oficiální

> *"Produkty z poslední objednávky jsou vhodné do automatizací s žádostí o zpětnou vazbou po nákupu nebo do retenčních automatizací."*

⚠️ **Per-customer dynamic content** = každý dostane shrnutí svých produktů.

---

## 17. RFM analýza setup flow

### 17.1 Per oficiální

> *"V Leadhubu vytvoříte v rámci vašeho předplatného RFM analýzu zdarma."*

### 17.2 Setup flow

```
RFM setup:

PREREQUISITES:
- Shoptet/Upgates integrace aktivní
- Historie objednávek synced
- Minimum data (cca 3+ měsíce, ideálně 12+)

INITIAL CALCULATION:
- Leadhub spočítá per kontakt:
  - Recency (dnů od poslední objednávky)
  - Frequency (počet objednávek)
  - Monetary (total spend)
- Normalizace scores (1-5)
- Asignace do RFM segmentů

VISUALIZACE:
- RFM matrix display
- Per-segment counts
- Drill-down per zákazník

SEGMENT DEFINITIONS:
- Champions: 555, 554, ... (top tier)
- Loyal: 543, ...
- New: high R, low F
- At Risk: high F+M, but high R
- Lost: low R, low F
- (etc., ~10-12 segmentů)

REAL-TIME UPDATES:
- Každá nová objednávka → recalculate
- Segment shift detection
- Auto-trigger pro relevantní automatizace
```

### 17.3 Use cases per RFM segment

```
Per-segment marketing strategies:

Champions (5-10% databáze):
- VIP nabídky
- Early access
- Loyalty rewards
- Refer-a-friend
- High-margin products

Loyal (10-20%):
- Cross-sell
- Up-sell
- Brand engagement
- Community building

Potential Loyalists (5-15%):
- Onboarding intenzivní
- Cross-sell první nabídky
- Engagement-building

New Customers (10-20%):
- Welcome sequence
- Brand education
- Habit formation

At Risk (5-15%):
- Win-back kampaně
- Re-engagement
- Surveys (proč klesající?)

Lost (10-30%):
- Last attempt
- Or suppress
- Or low-frequency
```

---

## 18. Segmentace flow

### 18.1 Per oficiální

> *"Jednoduché nastavení a rozsáhlá segmentační pravidla. Rozdělte databázi kontaktů do menších segmentů podle jejich chování na webu a aktivity v e-mailových kampaních. Díky tomu oslovíte vždy pouze příjemce, pro které je vaše sdělení nebo nabídka relevantní."*

### 18.2 Segment builder flow

```
Segmentace v Leadhubu:

1. Settings → Segmenty → Nový segment

2. Definovat pravidla (AND/OR logic):
   - Demographic:
     - Pohlaví = muž
     - Věk 30-50
     - Lokace = Praha
   - Behavioral:
     - Prohlédl produkt X
     - Otevřel email X
     - Klik na CTA X
   - Purchase:
     - Total spend > 5 000 Kč
     - Frekvence > 3 objednávky
     - Last purchase < 30 dní
   - RFM:
     - Segment = Champions
   - Custom:
     - Tag = "VIP"
     - Custom field = ...

3. Preview počet kontaktů

4. Save segment

5. Auto-update real-time
   - Noví kontakty co splní → add
   - Existující co splní → check continuous
   - Existující co nesplní → remove

6. Use segment v:
   - Kampani (audience)
   - Automatizaci (trigger condition)
   - Facebook Ads sync
   - Google Ads sync
   - Sklik sync
```

### 18.3 Příklady use cases

```
Příklady segmentů:

"VIP-Champion-Praha":
- RFM = Champion
- Lokace = Praha
- Pohlaví = irrelevant
- → 200 kontaktů
- Use: VIP event invite

"Cart Abandoner Past Week":
- Add to cart < 7 dní
- Žádný nákup
- → 1500 kontaktů
- Use: Win-back

"New Customer + Loyalty Eligible":
- First purchase < 30 dní
- Total spend > 1000 Kč
- Not in Ellity program
- → 300 kontaktů
- Use: Loyalty invite

"At Risk High Value":
- RFM = At Risk
- Lifetime value > 10 000 Kč
- → 80 kontaktů
- Use: Personalized win-back
```

---

## 19. SMS kampaň flow (od 0,80 Kč)

### 19.1 SMS setup

```
SMS prerequisites:
- Telefon v profilu (collected via opt-in)
- SMS opt-in souhlas (GDPR)
- Sender ID nastavený:
  - Random číslo (default, 0,80 Kč)
  - Nebo vlastní jméno (1,10 Kč)
```

### 19.2 SMS kampaň flow

```
SMS campaign:

1. Nová SMS kampaň
2. Audience selection (SMS-eligible only)
3. Compose:
   - 160 chars (1 SMS)
   - Personalizace (jméno, kód)
   - Liquid-like syntax
   - Link shortener (UTM tracking)
4. Compliance check:
   - Opt-out language
   - Sender ID
5. Test send (test number)
6. Send:
   - Immediate
   - Or scheduled
7. Tracking:
   - Delivery
   - Clicks (přes link)
   - Conversion (přes pixel)
8. Per-SMS náklady billed
```

### 19.3 Pricing model

```
SMS pricing reality:

Random number (0,80 Kč):
- 100 SMS = 80 Kč
- 1000 SMS = 800 Kč
- 10 000 SMS = 8 000 Kč
- Bez měsíčního poplatku

Vlastní jméno (1,10 Kč):
- 100 SMS = 110 Kč
- 1000 SMS = 1 100 Kč
- 10 000 SMS = 11 000 Kč
- Vyšší trust, vyšší cena
```

### 19.4 Use cases

```
SMS effective for:
- Order updates (transactional-like)
- Urgent promo (flash sale)
- Cart abandonment recovery (high impact)
- VIP exclusive
- Time-sensitive (event reminder)
- High-value notifications
```

---

## 20. Pop-up + webové prvky deployment

### 20.1 Pop-up creation

```
Pop-up flow:

1. Nový pop-up
2. Trigger settings:
   - Delay (e.g., 5 sekund)
   - Exit intent
   - Scroll (e.g., 50% stránky)
   - Specific page visit
   - Returning visitor only
3. Design:
   - Drag-drop editor
   - Image + text + CTA
   - Form (email, gender, etc.)
4. Conditions:
   - Pouze first visitors
   - Pouze logged out
   - Pouze specifické zdroje
5. Frequency cap:
   - 1x per session
   - 1x per týden
   - Once dismissed → don't show
6. A/B testing variants
7. Publish
   ↓
Pop-up live na webu
```

### 20.2 Pop-up performance

```
Pop-up metrics:
- Impressions
- Conversions (form fills)
- Conversion rate (typically 1-5%)
- Bounce impact
- Revenue per visitor
```

### 20.3 Webové prvky

```
Webové prvky beyond pop-up:
- Slide-in banners
- Top/bottom notification bars
- Sticky CTAs
- Personalized hero sections
- Social proof widgets
- Cookie consent (Centrum soukromí)
- Live counters (limited stock)
```

---

## 21. Slevové kódy bidirectional Shoptet

### 21.1 Per oficiální

> *"Spravujte slevové kódy přímo v Leadhubu. Odběratelům snadno odešlete unikátní kódy s časově omezenou platností – rychle, automatizovaně a bez zbytečné práce. Nastavení v Leadhubu totiž přesně odpovídá možnostem nastavení v Shoptetu."*

### 21.2 Bidirectional flow

```
Discount code lifecycle:

CREATION (v Leadhubu):
1. Nový slevový kód
2. Konfigurace:
   - Typ slevy (%/Kč)
   - Hodnota
   - Min. nákup
   - Časová platnost
   - Unikátní vs. univerzální
   - Per-recipient vs. shared
3. Save

SYNC → SHOPTET:
1. Auto-pushed do Shoptetu
2. Kód aktivní v Shoptetu
3. Tracking link nastavený

EMAIL/SMS DELIVERY:
1. Kód vložen do emailu (per-recipient, unikátní)
2. Personalizovaný subject
3. Time countdown (per-recipient unikátní)

CUSTOMER REDEMPTION:
1. Zákazník otevře email
2. Klik → kód do clipboard nebo direct apply
3. Přidá produkty do košíku
4. V checkoutu zadá kód
5. Shoptet ověří kód
6. Sleva aplikována

CONVERSION SYNC ← SHOPTET:
1. Order completed event
2. Pushed back to Leadhub
3. Conversion attributed:
   - Per kampaň
   - Per kód
   - Per recipient
4. ROI calculation
```

### 21.3 Per Markéta Kocichová

> *"Generování unikátních slevových kupónů přímo v prostředí Leadhubu a jejich automatický přenos do Shoptetu mi přijde přímo geniální."*

⚠️ **Customer quote = "geniální"** → indication of feature value.

### 21.4 Vs. konkurence

```
Konkurence flow:
- Marketér v Mailchimpu (separátní svět)
- Nutno manuálně create kódy v Shoptetu
- Nutno track manually
- Bez per-recipient unikátnosti
- Bez automatického tracking
   ↓
Leadhub:
- Vše integrované
- Per-recipient unikátní
- Automatic tracking
- ROI per kód
```

---

## 22. Facebook / Meta Ads sync flow

### 22.1 Per oficiální features

> *"Na příjemce, kteří newsletter neotevřeli nebo z něj neprokliknuli, můžete zacílit reklamou na Facebooku. Reklamu vytvoříte přímo v Leadhubu a dle nastaveného času se začne tomuto publiku automaticky zobrazovat."*

### 22.2 Per Shoptet Doplňky

> *"Propojeni s Facebook (Meta) Business managerem - synchronizace audiencí, napojení na Lead Ads, vytváření reklam na FB a IG."*

### 22.3 Audience sync flow

```
Leadhub → Facebook audience:

1. Definovat segment v Leadhubu
   - Např. "non-openers last 7 days"
2. V kampani → "Sync to Facebook"
3. Connect Facebook Business Manager
4. Authorization
5. Audience auto-pushed to FB
   - Custom Audience created
   - Hashed email matching
6. Match rate (~50-80% obvykle)
7. Dostupné v FB Ads Manager
8. Create FB/IG reklamy:
   - Buď v Leadhubu (zjednodušený workflow)
   - Nebo v FB Ads Manager (full features)
```

### 22.4 Lead Ads → Leadhub flow

```
Facebook Lead Ads → Leadhub:

1. Marketér vytvoří Lead Ad na FB
2. Connect to Leadhub
3. Lead Form fields mapped to Leadhub:
   - Email → email
   - Name → first_name
   - Gender → gender
4. Visitor klikne na reklamu
5. Vyplní Lead Form (na FB, fast!)
6. Submit → Auto-sync to Leadhub
7. Auto-trigger uvítací sekvence:
   - Welcome email
   - Slevový kód
   - Onboarding flow
```

⚠️ **Lead capture bez landing page** = high conversion.

### 22.5 Retargeting non-openers use case

```
Non-openers retargeting:

1. Newsletter odeslán → 60% otevřelo
2. Segment "non-openers" auto-created
3. 24 hodin po odeslání → sync to FB
4. Facebook reklama:
   - Stejný obsah jako newsletter
   - Visual format
   - Reach non-engagers na FB/IG
5. Result:
   - Extra reach
   - +15-25% celkový reach
   - Multi-touch attribution
```

---

## 23. Google Ads + Sklik sync flow

### 23.1 Google Ads sync

```
Google Customer Match flow:

1. Segment v Leadhubu
2. Sync to Google Ads
3. Google Customer Match audience
4. Targeting na:
   - Google Search
   - YouTube
   - Display Network
   - Discover
5. Match rate (~50-70%)
6. Reklamy spuštěny
```

### 23.2 Sklik sync (CZ unikátní!)

Per Sklik (Seznam.cz) Nápověda:
> *"Linking Leadhub with Sklik allows you to use e-mailing data for precise ad targeting. Precisely defined segments of potential customers that you have in the database can be captured at the right moment in the Seznam search engine and on other most visited Czech websites."*

```
Sklik sync flow:

1. Segment v Leadhubu
2. Sync to Sklik
3. Sklik "Vlastní seznam zákazníků"
4. Targeting na:
   - Seznam.cz vyhledávání
   - Email.cz
   - Mapy.cz
   - Nejvyšší navštěvované CZ weby
5. Match rate dle databáze
6. Reklamy live
   ↓
Reach na CZ-specific ecosystem
```

### 23.3 Per Sklik Nápověda

> *"Precisely defined segments of potential customers that you have in the database can be captured at the right moment in the Seznam search engine and on other most visited Czech websites."*

⚠️ **CZ trh = Seznam.cz ecosystem důležitý** – Leadhub má integraci.

### 23.4 Cross-channel orchestrace

```
Email → FB → Sklik combo:

1. Email odeslán
2. Non-openers → FB retargeting (visual)
3. Non-converters → Sklik retargeting (CZ web)
4. High-intent (visited product) → Google Ads (search)
   ↓
Coverage celé customer journey
Multi-touch attribution
```

---

## 24. Ellity loyalty flow

### 24.1 Per nápovědy

V nápovědě: **"Propojení s věrnostním programem Ellity"**.

### 24.2 Integration flow

```
Leadhub + Ellity:

SETUP:
1. Ellity account musí existovat
2. Connect Ellity ↔ Leadhub
3. API auth
4. Sync inicializace

ONGOING SYNC:
- Loyalty body per zákazník → Leadhub kontakt
- Tier změny → Leadhub
- Rewards earned → triggers v Leadhubu
- Points expiring → triggers

AUTOMATIZACE based on loyalty:

"Brzké získání úrovně":
- Trigger: body do dalšího tieru < 100
- Email: "Jen X bodů k VIP úrovni"
- Motivace k nákupu

"Body expirují":
- Trigger: body expire < 30 dní
- Email: "Vaše body brzy expirují"
- CTA: použít nyní

"Tier upgrade":
- Trigger: posun do vyššího tieru
- Email: "Gratulujeme k VIP"
- Personalized rewards

"VIP exclusivity":
- Segment: VIP tier
- Special campaigns
- Early access
- Premium products
```

### 24.3 Loyalty + RFM combo

```
RFM × Loyalty matrix:

Champions + VIP loyalty:
- Top priority
- Personal account management
- Exclusive products
- High frequency engagement

Champions but Bronze loyalty:
- Loyalty program upgrade nabídka
- Education o benefitech
- Convert to VIP

Lost but had VIP:
- High priority win-back
- Personalized outreach
- Custom incentive
```

---

## 25. Multi-shop management flow (agentury)

### 25.1 Per Markéta Kocichová (cistedrevo.cz)

> *"Máme více e-shopů, mezi kterými jde v doplňku jednoduše přepínat a duplikovat kampaně z jednoho účtu do druhého."*

### 25.2 Multi-shop architektura

```
Leadhub multi-shop:

ONE LEADHUB ACCOUNT
   ├─ E-shop A (Shoptet)
   ├─ E-shop B (Shoptet)
   ├─ E-shop C (Upgates)
   └─ E-shop D (CZ + SK + PL mutace)

PŘEPÍNÁNÍ:
- Dropdown selector
- 1 click switch
- Per-shop data isolated
- Per-shop campaigns
- Per-shop databases
```

### 25.3 Duplikace kampaní

```
Inter-shop duplication:

Marketér v E-shopu A:
- Vytvořil kampaň
- Optimalizoval
- ROI dobrý

Duplikovat to E-shopu B:
1. Klik "Duplikovat"
2. Vybrat cílový e-shop
3. Auto-copy:
   - Template
   - Audience definice (re-mapped)
   - Personalizace
   - Settings
4. Adjust per E-shop B context
5. Activate
   ↓
Time-saving pro agentury
```

### 25.4 Agency use cases

```
Marketingová agentura:
- Klient 1: E-shop A
- Klient 2: E-shop B
- Klient 3: E-shop C
   ↓
Leadhub workflow:
- Jeden Leadhub account
- Per-klient sub-accounts
- Centralizovaný management
- Best practices duplikace
- Per-klient billing oddělené
```

---

## 26. Reporting + revenue tracking

### 26.1 Per oficiální

> *"U kampaní měříme tržby, míru prokliku, otevření i odhlášení, čas strávený na webu, počet upravených košíků, nákupy od stávajících a nových zákazníků, a mnoho dalšího."*

### 26.2 Reporting hierarchy

```
Reporting levels:

OVERVIEW:
- Total revenue per měsíc/rok
- Average revenue per kontakt
- Total kontakty, growth
- RFM distribution
- Channel mix

KAMPAŇ LEVEL:
- Send count
- Delivery rate
- Open rate
- Click rate
- Conversion rate
- Revenue
- ROI

AUTOMATIZACE LEVEL:
- Total triggers
- Total emails sent
- Performance per step
- Drop-off analysis
- Revenue attributed
- Performance over time

SEGMENT LEVEL:
- Size over time
- Performance metrics
- Revenue contribution
- LTV
- Churn

INDIVIDUAL KONTAKT:
- Full timeline
- All interactions
- Revenue total
- RFM history
```

### 26.3 Per oficiální (Shoptet)

> *"Vždy budete mít také k dispozici detailní statistiky k jednotlivým kampaním a zároveň k celé skupině kampaní."*

### 26.4 Revenue tracking specificity

```
Revenue v Leadhubu:
- Source attribution (per email/kód)
- Per-kampaň ROI
- Per-segment revenue
- Repeat purchase tracking
- New vs. returning customer revenue
- Lifetime value tracking
- Per-channel comparison
```

### 26.5 Per oficiální benefits

> *"Bez Leadhubu by to už v iuvenio 'nešlo'. Z pohledu analytiky tvoří e-mailing stabilní obraty a skvěle se nám s ním daří pracovat s vracejícími se zákazníky. Hlavní plus jsou náklady. Ve srovnání s PPC rozhodně mnohem výkonnější kanál."*

⚠️ Customer claim: **email > PPC v ROI** pro returning customers.

---

## 27. Migrace od konkurence (Mailchimp, Ecomail)

### 27.1 Pattern u zákazníků

Per Klára Borlová (littleshoes.cz):
> *"Na Leadhub jsme přešli od konkurence. Potěšila nás aktivní podpora s celou migrací i vytvářením nových šablon a automatizací. Oceňujeme přehledný editor kampaní, se kterým newsletter sestaví i začátečník. A v neposlední řadě se nám povedlo ušetřit na měsíčních nákladech."*

⚠️ **Pattern:** migrate from competitor + save costs.

### 27.2 Migration flow

```
Migrace na Leadhub:

PHASE 1: SETUP
1. Registrace v Leadhubu
2. Trial Platform Pro
3. Shoptet/Upgates connection
4. DNS records (SPF, DKIM, DMARC)

PHASE 2: DATA IMPORT
1. Export ze starého nástroje:
   - Kontakty CSV
   - Suppression list
   - Tags / segments
2. Import do Leadhubu:
   - Field mapping
   - Validation
   - Duplicate handling

PHASE 3: ASSETS MIGRATION
1. Šablony emailů:
   - Manual recreation v Leadhubu
   - Nebo HTML copy-paste
   - Adjust pro Leadhub features (skloňování!)
2. Automatizace:
   - Rebuild v Leadhubu
   - Use předpřipravené jako baseline
3. Pop-ups + webové prvky

PHASE 4: PARALLEL RUN
1. Both platforms run
2. Test Leadhub sends
3. Verify deliverability
4. Verify tracking

PHASE 5: CUTOVER
1. DNS final switch
2. Send confirmation
3. Stop old platform
4. Cancel old subscription

PHASE 6: OPTIMIZATION
1. Leverage Leadhub-specific features:
   - České skloňování
   - Sklik integrace
   - Shoptet slevové kódy
2. Performance tuning
3. New automatizace
```

### 27.3 Per Synlab.cz (Marika Tomanová)

> *"Oceňuji především jejich nadstandardní zákaznickou podporu. Vždy se snaží skutečně pomoci, ne jen odkázat na články nebo tutoriály, což je dnes bohužel běžné. U Leadhubu máte pocit, že jim na vás opravdu záleží."*

⚠️ **Migration support** je často důvodem volby Leadhubu.

### 27.4 Cost savings argument

```
Typical savings:

Mailchimp Standard (2-3k contacts):
- ~$60-100/měsíc (~1 500-2 500 Kč)

Leadhub Platform Pro (cca 3 000 přihlášených):
- Cena dle ceníku (cca 500-800 Kč na 3000 přihlášených)
- Plus full features

Savings: ~50% nákladů
Plus: české skloňování + lepší integrace
```

⚠️ Konkrétní cenu nad 500 přihlášených nutno ověřit u Leadhubu.

---

## 28. Customer support flow (česká podpora)

### 28.1 Support kanály

```
Leadhub support kanály:
- Email: podpora@leadhub.co
- Telefon: +420 228 229 263
- Online nápověda: podpora.leadhub.co
- Video návody: leadhub.co/videonavody
- Blog: leadhub.co/blog/cs
- YouTube: @leadhub2660
- Facebook: facebook.com/leadhub.marketing
- LinkedIn
- Instagram: @leadhub.marketing
```

### 28.2 Per zákaznické feedbacky

Per Marika Tomanová (Synlab.cz):
> *"Oceňuji především jejich nadstandardní zákaznickou podporu. Vždy se snaží skutečně pomoci, ne jen odkázat na články nebo tutoriály, což je dnes bohužel běžné."*

Per Klára Seidlová (optikdodomu.cz):
> *"Zvláštní pochvalu si zaslouží jejich zákaznická podpora, která vždy okamžitě reaguje na naše dotazy a pomáhá vyřešit jakékoliv vzniklé situace."*

Per anonymní:
> *"Velké plus je i to, že jde o českou platformu s velmi ochotnou a rychlou podporou, která nám vždy poradila, když jsme si s čímkoliv nevěděli rady."*

⚠️ **Support = competitive advantage** Leadhubu.

### 28.3 Per Stanislava Musilová (bamboolik.cz)

> *"Při nastavování všech kampaní na našich e-shopech jsme ocenili hlavně intuitivní nastavení a perfektní práci podpory, včetně přípravy základních šablon na míru."*

⚠️ **"Šablony na míru"** = personalized support (díky malému 12-člennému týmu).

### 28.4 Support tier

```
Per ceník:

Starter (free):
- Pouze email support
- Standard response time
- Nápověda + tutoriály

Platform Pro:
- Email + telefonní podpora
- Přednostní response
- Custom šablony (na vyžádání)
- Custom fonty (na vyžádání)

Individual:
- Osobní Account Manager
- Přednostní podpora
- Strategic guidance
```

### 28.5 Support flow

```
Issue resolution flow:

1. Customer issue (email/phone/chat)
2. Triage:
   - Severity?
   - Type (bug, question, feature request)?
3. Resolution:
   - Simple → answer within hours
   - Complex → engineering involvement
   - Bug → engineering ticket
4. Follow-up:
   - Verify resolution
   - Document si potřeba (knowledge base)
5. Feedback loop:
   - Common questions → blog post
   - Feature requests → roadmap
```

---

## 29. Datová mapa: co vidí kdo

| Data | Vlastník | Editor | Analytik | Technická integrace | Koncový zákazník | Leadhub team | API |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Účet settings | ✅ | view | ❌ | ❌ | ❌ | s consent | per scope |
| Billing | ✅ | ❌ | ❌ | ❌ | ❌ | s consent | – |
| User management | ✅ | ❌ | ❌ | ❌ | ❌ | s consent | per scope |
| Databáze kontaktů | ✅ | ✅ | view | ❌ | own profile | s consent | ✅ |
| Segmenty | ✅ | ✅ | view | ❌ | ❌ | s consent | per scope |
| Kampaně | ✅ | ✅ | view | ❌ | ❌ | s consent | per scope |
| Automatizace | ✅ | ✅ | view | ❌ | ❌ | s consent | per scope |
| Šablony | ✅ | ✅ | view | ❌ | ❌ | s consent | per scope |
| Statistiky | ✅ | ✅ | ✅ | ❌ | ❌ | s consent | per scope |
| RFM analýza | ✅ | ✅ | ✅ | ❌ | ❌ | s consent | per scope |
| Sledovací pixel | ✅ | view | view | ✅ | ❌ | s consent | – |
| DNS records | ✅ | view | ❌ | ✅ | ❌ | s consent | – |
| Shoptet integrace | ✅ | view | view | ✅ | ❌ | s consent | – |
| Upgates integrace | ✅ | view | view | ✅ | ❌ | s consent | – |
| Slevové kódy | ✅ | ✅ | view | ❌ | own | s consent | ✅ |
| Facebook sync | ✅ | ✅ | view | ❌ | ❌ | s consent | per scope |
| Sklik sync | ✅ | ✅ | view | ❌ | ❌ | s consent | per scope |
| Ellity integrace | ✅ | view | view | ✅ | own loyalty | s consent | – |
| Webhooks | ✅ | view | ❌ | ✅ | ❌ | s consent | per scope |
| Audit logs | ✅ | ❌ | view | view | ❌ | s consent | – |

---

## 30. Známé úzkoprofilové místa

### 30.1 Velikost firmy = limit feature dev

```
Leadhub reality:
- ~12 zaměstnanců
- Vs. Mailchimp: 1000+
- Vs. Klaviyo: 1500+
   ↓
Implikace:
- Pomalejší vývoj
- Méně AI features
- Méně integrací
- Roadmap delay
```

⚠️ **Malá firma = limit scale**, ale silná pro CZ niche.

### 30.2 Limit Starter plánu

```
Starter plan:
- 500 přihlášených limit
- Logo Leadhub v patičce
   ↓
Branding compromise
Profesionální e-shop = upgrade nutný
```

### 30.3 Pricing transparency nad 500 přihlášených

```
Pricing reality:
- 0-500 přihlášených: 216 Kč/měsíc viditelné
- 500-50 000 přihlášených: cena škáluje, ale ne plně transparentní v ceníku
- Nutný kontakt podpory pro upřesnění větších databází
```

⚠️ **Pricing nad 500 přihlášených** by mohl být lépe komunikován.

### 30.4 Non-Shoptet/Upgates suboptimal

```
Custom platforma:
- Možné přes API
- Ale ne deepest integrace
- Více manual setup
- Méně automatizovaných sync
   ↓
Sweet spot = Shoptet + Upgates
```

### 30.5 Méně AI vs. konkurence

```
2026 trend AI marketing:
- Klaviyo: agentic AI
- Mailchimp: GenAI
- Braze: BrazeAI Suite
- SALESmanago: deeply AI
   ↓
Leadhub:
- AI v docházejících produktech
- Méně AI-driven obecně
- Ale stále silné v personalizaci CZ-specific
```

### 30.6 Méně mobilní features

```
Mobile-related limits:
- Žádné mobile push (vs. Braze, Klaviyo)
- Žádné in-app messaging
- Pouze SMS jako mobile channel
   ↓
Pro mobile-first app = nefit
Pro e-shop web-first = OK
```

### 30.7 Geo-limit (CZ/SK primary)

```
Geografický limit:
- Český jazyk primárně
- Slovenský jazyk podporován
- Polský jazyk (leadhub.co má pl_PL locale)
- EN omezeně
- DE chybí
   ↓
Pro mezinárodní expanzi = limit
```

### 30.8 Méně integrací než zahraniční nástroje

```
Integration ecosystem:
- Shoptet ✅
- Upgates ✅
- Facebook ✅
- Google Ads ✅
- Sklik ✅
- Ellity ✅
   ↓
Vs. Zapier ecosystem (1000+):
- Méně out-of-box
- Custom API nutné
```

### 30.9 Limited webinars / Academy

```
Vs. Klaviyo Academy:
- Online kurzy
- Certifikace
- Live workshops
- Community events

Leadhub:
- YouTube tutoriály
- Blog
- Email tips
- Méně formální training
```

### 30.10 No native WhatsApp / RCS

```
Modern channels missing:
- WhatsApp Business API
- RCS Messaging
- LINE
- iMessage Business
   ↓
Pro mladší demographics = limit
```

### 30.11 Méně advanced personalizace vs. Klaviyo

```
Klaviyo advanced:
- Predictive AI
- Liquid templating
- Advanced flows
- Predictive segmenty

Leadhub:
- Skloňování (USP)
- Produkty z objednávky
- RFM segmenty
- Solid but ne AI-cutting edge
```

### 30.12 SMS pricing průměrný

```
SMS cost:
- 0,80 Kč náhodné číslo
- 1,10 Kč vlastní jméno
   ↓
Industry: €0,02-0,05 (cca 0,50-1,25 Kč)
Leadhub střed
Plus: bez měsíčního fee (bonus)
```

### 30.13 Závislost na Shoptet ecosystem

```
Strategic risk:
- 95%+ Leadhub customers = Shoptet/Upgates
- Pokud Shoptet vyvine vlastní email
- Pokud Shoptet vybere partner
- Pokud Upgates vyvine vlastní
   ↓
Diversification limited
   ↓
Leadhub musí inovovat aby zůstal preferred
```

### 30.14 Community velikost

```
Mailchimp/Klaviyo:
- Tisíce expert agentur globálně
- Massive ecosystem
- Stack Overflow expertise

Leadhub:
- CZ niche community
- Méně expert agentur
- Závisí na in-house Leadhub teamu
```

### 30.15 Méně public case studies (číselné)

```
Klaviyo case studies:
- Public ROI data
- Quantified results
- Industry benchmarks

Leadhub:
- Testimonials primárně
- Méně quantified ROI publicly
- Word-of-mouth driven
```

---

## 31. Doporučení pro design vlastních procesů

### Pro Leadhub users obecně:

1. **Shoptet/Upgates first** – maximalizovat integraci
2. **Starter zdarma** – začít bez závazku
3. **Trial Platform Pro 21 dní** – test feature setu
4. **Sledovací pixel ASAP** – data sběr od dne 1
5. **DNS records setup** – deliverability foundation
6. **České skloňování zapnout** – CZ profesionalita
7. **Předpřipravené automatizace** – quick wins (sleva na první nákup, opuštěný košík)
8. **RFM analýza ze startu** – segmentace foundation
9. **Pop-up lead capture** – database growth
10. **Slevové kódy bidirectional** – Shoptet ROI tracking
11. **Multi-shop setup** – pokud více e-shopů
12. **Facebook sync** – cross-channel reach
13. **Sklik sync** – CZ-specific reach
14. **Docházející produkty** – pokud relevantní průmysl
15. **Děkovačka sekvence** – retention foundation
16. **Win-back kampaně** – At Risk + Lost recovery
17. **Ellity integrace** – pokud loyalty program
18. **A/B testing** – continuous optimization
19. **Performance reporting** – weekly review
20. **Migration support** – využít CZ podporu

### Pro multi-shop / agentury:

1. **Centralized account** management
2. **Per-shop best practices** documentation
3. **Template duplication** time-saving
4. **Cross-shop learnings** sharing
5. **Standardized RFM** approach
6. **Per-klient billing** clarity
7. **Audit logs** governance
8. **Performance benchmarking** per shop
9. **White-label considerations** (Individual tier)
10. **API integration** custom workflows

### Pro Shoptet e-shopy specificky:

1. **Doplněk install** ze Shoptet Marketplace
2. **Real-time sync** verification
3. **Slevové kódy** bidirectional setup
4. **Loyalty (Ellity)** pokud relevantní
5. **Migrace ze starého emailu** s Leadhub support
6. **České skloňování** maximalizovat (USP!)
7. **Sklik retargeting** (CZ trh advantage)
8. **Mobile-first templates** (responsive)
9. **GDPR Centrum soukromí** activated
10. **Long-term partnership** (5-7+ let standard)

### Pro non-Shoptet/Upgates platformy:

1. **API integrace** custom build
2. **Webhook setup** for event sync
3. **Custom event tracking** via JS API
4. **CSV imports** pravidelné
5. **Manual catalog upload** if no native
6. **More setup time** anticipated
7. **Leadhub support** intenzivnější use
8. **Evaluation: jiný nástroj?** (pokud non-CZ)
9. **Consider alternatives** (Klaviyo, Mailchimp)
10. **Hybrid approach** if needed

---

*Dokument zpracován z oficiálních zdrojů leadhub.co a doprovodných platforem (Shoptet Doplňky, Upgates Marketplace, Capterra, GetApp, RocketReach, Sklik Nápověda). Pro nejaktuálnější detaily je nutný kontakt s Leadhub teamem (podpora@leadhub.co, +420 228 229 263) nebo registrace zkušebního účtu.*
