# Ecomail – hloubková analýza funkcí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Zdroje:** oficiální dokumentace ecomail.cz, ecomail.app, help.ecomail.cz, support.ecomail.cz + analytické weby a recenze (G2, Capterra, GetApp, SoftwareAdvice, Research.com, Gartner Peer Insights, Wikipedia.cz, Shoptet partneři, Loudavymkrokem.cz, Effectix) ověřené v dubnu–květnu 2026.
**Rozsah:** kompletní funkcionalita platformy v roce 2026 – e-mail marketing, SMS, marketing automation, integrované CDP features, on-site formuláře, integrace s e-shopovými platformami.

> **Důležitý kontext:** Ecomail je **česká firma** (ECOMAIL.CZ, s.r.o., IČO: 027 62 943, sídlo Na Zderaze 1275/15, 120 00 Praha 2). Založeno **2014** Jakubem Stupkou a Janem Tlapákem.
>
> **Filozofie:** **"Lokální alternativa k Mailchimpu/ActiveCampaign s důrazem na CEE region"** – čeština (a slovenština) v UI + supportu + dokumentaci, plně lokalizovaný pro místní e-commerce (Shoptet, FastCentrik, Upgates atd.).
>
> **Expanze 2024+:** V červenci 2024 Ecomail **vstoupil na polský trh** – bilingvální tým, integrace s polskými platformami.
>
> **Klíčový pivot 2024–2025:** Spuštění **CDP tarifu** (Customer Data Platform) s pokročilým reportingem (RFM analýza, konverze, produktová analýza). Posun od pure email tool k **data-driven marketing platform** pro e-shopy.
>
> **Velikost:** Klienti odeslali v 2023 přes Ecomail **přes 3 miliardy e-mailů** (38% nárůst yoy). Black Friday = nejvytíženější den s 115+ miliony e-mailů přes Seznam schránky.
>
> **Hlavní vlastnictví:** Jan Tlapák (CEO) + Jakub Stupka (zakladatel).

---

## Obsah

1. [Co je Ecomail a pro koho je](#1-co-je-ecomail)
2. [Tarify a pricing model](#2-tarify)
3. [Lokální focus + CEE expanze](#3-lokalni-focus)
4. [Kontakty, Seznamy, Štítky, Segmentace](#4-kontakty-segmentace)
5. [E-mailový editor a šablony](#5-editor-sablony)
6. [Kampaně a A/B testování](#6-kampane-ab)
7. [Marketing automatizace](#7-automatizace)
8. [Předpřipravené automatizace](#8-prepripravene)
9. [CDP tarif (Customer Data Platform)](#9-cdp)
10. [RFM analýza](#10-rfm)
11. [Formuláře a Pop-upy](#11-formulare)
12. [Sledování pohybu na webu](#12-sledovani-webu)
13. [SMS marketing](#13-sms)
14. [Facebook Lead Ads + Custom Audiences](#14-facebook)
15. [Transakční e-maily](#15-transakcni)
16. [Personalizace + dynamický obsah](#16-personalizace)
17. [Reporty + analytika](#17-reporty)
18. [Integrace + API](#18-integrace-api)
19. [Doručitelnost + GDPR + hosting](#19-doručitelnost)
20. [Limity a nedostatky](#20-limity)

---

## 1. Co je Ecomail

- **Společnost:** ECOMAIL.CZ, s.r.o.
- **IČO:** 027 62 943
- **Sídlo:** Na Zderaze 1275/15, 120 00 Praha 2, Česká republika
- **Vznik:** **2014** v Praze
- **Zakladatelé:** Jakub Stupka, Jan Tlapák
- **CEO 2026:** Jan Tlapák
- **Velikost:** klienti odeslali ~3 miliardy e-mailů ročně (2023+), 38% yoy růst
- **Pozice:** **top 3 v České republice + Slovensku** pro mid-segment e-shopů
- **Specializace:** **e-commerce, mid-market SMB**, lokální podpora
- **Lokalizace UI:** **čeština, slovenština (de facto stejné), angličtina, polština**
- **Webová doména:** ecomail.cz (CZ trh), ecomail.app (mezinárodní)

### Filozofie produktu

**"Lokální alternativa Mailchimpu/ActiveCampaign s důrazem na CEE region"** – primary diferenciátor je:

- **Čeština v UI a supportu** (lidi, ne roboti)
- **Lokální integrace** (Shoptet, FastCentrik, Upgates, Heureka, atd.)
- **CZ/SK podpora** v pracovní době
- **Příznivá cena** vs. globální nástroje
- **Doručitelnost na české schránky** (Seznam, atd.) – partnerství s Seznam.cz

```
┌─────────────────────────────────────────────────────────────────┐
│                    ECOMAIL PLATFORM                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ E-mail         │  │ Marketing    │  │ SMS Marketing   │      │
│  │ Marketing      │  │ Automatizace │  │                 │      │
│  │ + Kampaně      │  │              │  │                 │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Formuláře +    │  │ Sledování    │  │ Personalizace + │      │
│  │ Pop-upy        │  │ pohybu       │  │ dynamický obsah │      │
│  │                │  │ na webu      │  │                 │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐      │
│  │ Transakční     │  │ Facebook     │  │ Heatmapy +      │      │
│  │ e-maily        │  │ Lead Ads +   │  │ A/B testování   │      │
│  │                │  │ Audiences    │  │                 │      │
│  └────────────────┘  └──────────────┘  └─────────────────┘      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│   CDP TARIFNÍ ROZŠÍŘENÍ (2024+):                                │
│   ├─ Customer Data Platform Analytics                           │
│   ├─ RFM analýza (zákaznické segmenty dle behavior)             │
│   ├─ Pokročilé konverzní reporty                                │
│   ├─ Produktová analýza (cross-sell insights)                   │
│   └─ Sledování retence + zákaznických cyklů                     │
├─────────────────────────────────────────────────────────────────┤
│   KLÍČOVÉ LOKÁLNÍ INTEGRACE:                                    │
│   ├─ Shoptet (deep, real-time)                                  │
│   ├─ FastCentrik                                                │
│   ├─ Upgates                                                    │
│   ├─ WooCommerce                                                │
│   ├─ Shopify                                                    │
│   ├─ PrestaShop                                                 │
│   ├─ Opencart, Ecwid                                            │
│   ├─ Heureka, Zboží.cz                                          │
│   ├─ GoOut (vstupenky)                                          │
│   ├─ Zapier, Make                                               │
│   └─ Looker Studio (reporting)                                  │
├─────────────────────────────────────────────────────────────────┤
│   AGENTURNÍ MODEL: parent účet + sub-účty klientů                │
│   + provize za nové klienty agentury                            │
├─────────────────────────────────────────────────────────────────┤
│   EU hosting | GDPR compliant                                   │
│   Partnerství s Seznam.cz pro CZ doručitelnost                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Tarify a pricing model

Ecomail nabízí **transparentní pricing** s **3 hlavními tarify** + **free plan** + **kreditové balíčky**.

### 2.1 Free plan

- **Zdarma**
- **Do 200 kontaktů** v databázi
- **Max 200 odeslaných e-mailů měsíčně**
  - Např. 1× měsíčně kampaň na 200 e-mailových adres
  - Nebo 4× měsíčně na 50 e-mailových adres
- Drag-and-drop editor
- Základní automatizace
- Základní segmentace
- Personalizace
- Sign-up formuláře
- **Account expires po 1 roce neaktivity** (před expirací upozorněni)

### 2.2 Profi tarif

- Od **~5€/měsíc** (varies podle počtu kontaktů)
- **Pro menší weby + jednoduchý e-mailing**
- **Neomezené odesílání e-mailů**
- Vše z free planu +
- Pokročilejší segmentace
- Drag-and-drop editor + 160+ šablon
- Automatizace (základní)
- Pop-up formuláře
- Heatmapy v reportech
- A/B testování
- Statistiky v reálném čase
- Personalizace
- **CZ/SK support** v češtině

### 2.3 Marketer+ tarif (nejpopulárnější)

- **Pro e-shopy a pokročilý e-mailing**
- Vše z Profi tarifu +
- **Pokročilé automatizace** (Abandoned cart, post-purchase, atd.)
- **Personalizované bloky** (dynamický obsah)
- **Produktový feed** integrace
- **Sledování pohybu na webu**
- **Pop-up formuláře s pokročilými triggery**
- **Heatmapy + click maps**
- **Vlastní oprávnění uživatelů** (jen v tarifu Marketer+!)
- **Shoptet/WooCommerce/Shopify deep integrace**
- **Facebook Custom Audiences + Lead Ads**
- **Google Analytics integrace**
- **API + webhooks**

### 2.4 CDP tarif (nové od 2024)

- **Nejvyšší tarif**
- Vše z Marketer+ tarifu +
- **CDP Analytics** (Customer Data Platform)
- **RFM analýza** – automatické rozdělení databáze podle nákupní frekvence + hodnoty
- **Pokročilé konverzní reporty**
- **Produktová analýza:**
  - Nejčastěji prodávané produkty
  - Cross-sell insights (co kontakty nakupují společně/následně)
- **Retenční sledování** zákazníků
- **Záchranné scénáře** pro klesající retenci
- **Doporučování produktů** v newsletterech
- **Tracking pohybu mezi segmenty v čase**

### 2.5 Kreditový program (alternativa k tarifům)

- **Předplacené e-mailové kredity**
- **1 kredit = 1 odeslaný e-mail**
- **Platnost neomezená** (per Wikipedia/podmínky 24 měsíců, v některých případech)
- **Vhodné pro nepravidelné rozesílky**
- **Neomezený počet kontaktů** v účtu
- Při rozesílce kampaně na 500 kontaktů → odečte 500 kreditů
- **Možnost kombinovat** kreditové balíčky s tarify

### 2.6 Volba kredity vs. tarif

| Vhodné              | Kreditový balíček                    | Tarifní program   |
| ------------------- | ------------------------------------ | ----------------- |
| Frekvence rozesílky | Nepravidelná (1× za měsíc nebo méně) | Pravidelná        |
| Počet kontaktů      | Neomezený                            | Limit podle pásma |
| Počet e-mailů       | Podle koupených kreditů              | Neomezeno         |
| Pokročilé funkce    | Základní                             | Plně dostupné     |
| Cena vstupu         | Nižší                                | Vyšší             |

### 2.7 Cenová pásma podle kontaktů

Cena tarifu se odvíjí od:

- **Typu tarifu** (Profi / Marketer+ / CDP)
- **Limitu unikátních aktivních kontaktů** v databázi
- Cena škálovaná po pásmech (200, 500, 1 000, 2 500, 5 000, 10 000, atd.)
- Konkrétní ceny per pásmo se mění – check ecomail.cz/price

### 2.8 14-day free trial

- Zdarma 14 dní libovolného tarifu (na vyžádání u podpory)
- Plná funkčnost
- **Až 40 000 kontaktů** v trial!
- Možnost migrace dat
- Bez závazků

### 2.9 Slevy

- **Roční předplatné:** delší závazek (12 měsíců po sobě jdoucích)
- **Sleva 50%** pro neziskový sektor (na roční plán)
- **Měsíční předplatné:** 3 měsíce po sobě jdoucí minimum
- **Možnost přerušení:** 1× ročně, max 6 měsíců

### 2.10 SMS kredity (add-on)

- **Samostatné SMS kredity** – nemohou být nahrazeny e-mailovými kredity
- **1 SMS ≠ 1 kredit** – počet kreditů per SMS varies podle země odeslání
- **Pouze jako add-on** k tarifu nebo kreditovému balíčku
- **Nelze posílat SMS** v rámci free planu

### 2.11 Platby

- **Online card payment** (auto-debit na začátku každého billing period)
- **Převodem** (na základě faktury)
- **Veškeré ceny v Ceníku bez DPH** (DPH se účtuje navíc)

---

## 3. Lokální focus + CEE expanze

### 3.1 Český a slovenský trh

- **Top 3 v CZ** pro mid-market e-commerce
- **Český support** (chat, email, telefon v pracovní době)
- **České faktury + DPH**
- **Lokální platby** (CZK + EUR)
- **Lokální compliance** pro CZ/SK trh
- **Partnerství s Seznam.cz** – statistiky doručitelnosti na .cz domény

### 3.2 Polský trh (expanze 2024)

- **Vstup na PL trh** v červenci 2024
- **Bilingvální tým** specialistů
- **Polské integrace** v progress
- **Polská lokalizace** UI

### 3.3 Plánovaná další expanze

Per oficiální komunikace + Wikipedia:

- Maďarsko, Rumunsko (zvažováno)
- Plánovaná integrace **Darujme.cz** pro neziskovky

### 3.4 Lokální events + komunita

- **ShopMasters** – pravidelná setkání e-shopařů (organizováno společně s Zásilkovnou a Shoptetem)
- Webinary v češtině
- Případové studie českých značek (nanoSPACE, Freshlabels)
- LinkedIn aktivní komunita

### 3.5 Lokální integrace (klíčové diferenciátory)

**České e-commerce platformy:**

- **Shoptet** (deepest – #1 CZ platforma)
- **FastCentrik**
- **Upgates**
- **Webnode shop**

**Slovenské e-commerce platformy:**

- **Eshop-rychlo.sk**
- **Slovenia/Webglobe**

**Polské e-commerce platformy** (postupně):

- Shoper
- IdoSell
- PrestaShop (popular v PL)

**Mezinárodní platformy:**

- WooCommerce
- Shopify
- PrestaShop
- Opencart
- Ecwid
- BigCommerce

### 3.6 Lokální comparison sites

- **Heureka.cz integrace** – sběr emailů z Heureky
- **Zboží.cz integrace**
- **Hodnocení obchodu** propojení

### 3.7 Lokální vstupenky a další

- **GoOut.net** – vstupenková platforma, denní sync
- **Smartemailing**, **Mailkit** – ekosystém v ČR (nikoli partneři)

---

## 4. Kontakty, Seznamy, Štítky, Segmentace

### 4.1 Kontakty (core entity)

- **Standardní pole:**
  - Email (povinné, klíč)
  - Jméno
  - Příjmení
  - Telefon
  - Pohlaví (automaticky odhadnuto z jména v CZ kontextu!)
  - Datum svátku (automaticky určeno z jména!)
  - Datum narození
- **Vlastní pole** (custom fields)
- **Status kontaktu:**
  - Aktivní
  - Odhlášený
  - Bounced
  - Spam stížnost
  - Nepotvrzený (double opt-in pending)

### 4.2 Speciální features pro česká jména

**Unikátní pro Ecomail:**

- **Automatické skloňování jmen** v češtině
- **Automatické určení pohlaví** podle jména
- **Automatické určení data svátku** podle jména
- Užitečné pro:
  - Personalizované oslovení (5. pád)
  - Přání k svátku
  - Segmentace podle pohlaví

### 4.3 Seznamy kontaktů

- **Multi-list architektura** (kontakt může být v více seznamech)
- **Per-seznam:**
  - Vlastní opt-in
  - Vlastní opt-out
  - Vlastní zdroj (form, import, integration)
- **Default seznam** + vlastní seznamy

### 4.4 Štítky (Tags)

- **Flat tag system**
- **Multi-tag per kontakt**
- Štítky lze přidávat:
  - Manuálně
  - Automatizací
  - Při importu
  - Při form submission
  - Přes API
  - Z e-shopu (Shoptet posílá tagy)
- Použití:
  - Trigger automatizace
  - Filtr segmentace
  - Identifikace zdroje

### 4.5 Vlastní pole (Custom fields)

- **Vlastní pole** – Marketer+ / CDP
- Typy:
  - Text
  - Číslo
  - Datum
  - Výběr (dropdown)

### 4.6 Segmentace (advanced)

**Klíčový asset Ecomailu** – často chválený.

#### Kritéria segmentace

- **Vlastnosti kontaktu** (jméno, příjmení, pohlaví, atd.)
- **Vlastní pole**
- **Aktivita v kampaních** (otevřel, kliknul na konkrétní campaign)
- **Pohyb na webu** (navštěvované stránky, čas na stránce)
- **Dokončené nákupy** (e-commerce data ze Shoptetu)
- **Co prohlížel / nakoupil**
- **Datum posledního nákupu**
- **Celková hodnota nákupů**
- **Počet objednávek**
- **Stav objednávky**
- **Lokalita** (město, region)
- **Datum přihlášení k odběru**
- **Zdroj (formulář, integrace, import)**
- **Tagy**
- **Členství v jiných segmentech**

#### Operátory

- AND, OR, NOT
- Datum: před, po, mezi, je
- Číslo: rovno, menší, větší, mezi
- Text: obsahuje, neobsahuje
- **Nested conditions** (závorky)

#### Dynamické segmenty

- **Real-time update**
- Použití: cílení kampaní, trigger automatizací, reporting

### 4.7 Příklady segmentace

```
Příklad 1: "Muži z Prahy s nákupem >5 000 Kč"
- Pohlaví = muž
- Město = Praha
- Celková hodnota nákupů > 5000

Příklad 2: "Zákazníci respirátorů s 2+ objednávkami"
- Štítek "Koupil respirátor"
- Počet objednávek >= 2

Příklad 3: "Klesající retence: nenakoupili 6 měsíců"
- Datum posledního nákupu < (today - 180 days)
- Předchozí stav: aktivní zákazník
```

### 4.8 Import a export

#### Import

- **CSV upload**
- **Copy-paste**
- **API import**
- **Integrace** (Shoptet, WooCommerce, atd.)
- **Mapování polí**
- **Detekce duplicit**
- **Validace e-mailových adres**
- **Štítkování při importu**
- **Auto-skloňování jmen** po importu

#### Export

- **CSV download**
- **Filter před exportem**
- **Per-kontakt full data** (GDPR)
- **API export**

### 4.9 Limity database

- **Free:** max 200 kontaktů
- **Profi/Marketer+/CDP:** **podle tarifního pásma**
- **Při překročení:** account blokován do upgrade

---

## 5. E-mailový editor a šablony

### 5.1 Drag-and-drop editor

- **Moderní visual builder**
- **Mobile-responzivní automatický**
- **Block-based** struktura
- **Live preview** (desktop, tablet, mobil)
- **Brand kit** (uložené barvy, fonty, logo)
- **Uložené bloky** (reusable across kampaně)
- **Produktový feed integrace** – auto-insert produktů z e-shopu

### 5.2 Bloky v editoru

- **Text** (rich text editor)
- **Obrázek** (s editorem)
- **Tlačítko**
- **Video** (embed)
- **Rozdělovač / mezera**
- **Sociální sítě** (icons + links)
- **HTML blok** (vlastní kód)
- **Produktový blok** (z produktového feedu)
- **Personalizovaný blok** (poslední prohlédnuté/koupené produkty)
- **Doporučení produktů** (CDP tarif)
- **Slevový kupón blok**
- **Formulář embed**

### 5.3 Šablony

- **160+ optimalizovaných šablon**
- **Kategorie:**
  - Newsletter (obecné)
  - Promo / akce
  - E-commerce (produktové)
  - Sezónní (Vánoce, Black Friday, atd.)
  - Welcome / uvítací
  - Birthday / svátek
  - Re-engagement
  - Event
- **Customizable** vše
- **Vlastní šablony** – uložit + reuse

### 5.4 HTML editor

- **Pro pokročilé** uživatele
- **Vlastní HTML** kód
- **Custom CSS**

### 5.5 Personalizace v editoru

- **Slučovací značky** syntax `{nahradni_text}`
- **Default fallback** values pro chybějící data
- **Conditional content blocks** (Marketer+)
- **Dynamický obsah** (poslední koupený produkt, doporučení)

### 5.6 Produktový feed

**Klíčový e-commerce feature:**

- **Sync produktů** z e-shopu (Shoptet, WooCommerce, atd.)
- **Auto-insert produktů** do emailů
- **Personalizovaná doporučení** (CDP)
- **Cross-sell bloky**

---

## 6. Kampaně a A/B testování

### 6.1 Typy kampaní

- **Standard kampaň** (jednorázová)
- **Automatická** (v rámci workflow)
- **A/B test** kampaň
- **RSS-driven** (auto z RSS feedu)
- **Re-send** (poslat znovu non-openers s upraveným subject)

### 6.2 Tvorba kampaně

```
Kampaně → Vytvořit novou kampaň
   ↓
Typ:
- Standard
- A/B test
- Re-send (Marketer+)
   ↓
Nastavení:
- Název kampaně (interní)
- Předmět
- Pre-header (preview text)
- Odesílatel (jméno + email)
- Reply-to
- Jazyk
   ↓
Příjemci:
- Seznam(y)
- Segment(y)
- Vyloučené seznamy
   ↓
Design:
- Drag-drop editor
- Šablona
- Brand kit
- Personalizace
- Produktové bloky
   ↓
Test:
- Preview na zařízeních
- Test send
- Spam test
   ↓
Odeslat / Naplánovat:
- Odeslat ihned
- Naplánovat
- Časové pásmo
   ↓
Potvrdit
```

### 6.3 A/B testování

- **A/B test** kampaně
- **Testované varianty:**
  - **Předmět** e-mailu
  - **Odesílatel** (jméno)
  - **Obsah** (Marketer+)
- **Vzorek:** % z seznamu (např. 10-20%) na test
- **Kritérium vítěze:**
  - Open rate
  - Click rate
  - CTR
- **Auto-send vítěze** zbytku seznamu

### 6.4 Re-send kampaně (Marketer+)

- **Re-send non-openers**
- Po X hodinách (default 24h) re-send s **upraveným předmětem**
- Boost open rates typicky o 10-30%

---

## 7. Marketing automatizace

**Klíčový asset** Ecomailu – často chválený za jednoduchost + sílu.

### 7.1 Architektura automatizace

```
Automatizace = Trigger + "strom" akcí
   - Trigger: událost, která spustí workflow
   - Akce: co se stane s kontaktem
   - Větvení: yes/no podmínky
   - Frekvence: jednou / vícekrát / opakovaně
```

### 7.2 Trigger typy

#### Behavioral

- **Nový odběratel** v seznamu
- **Nová odběr e-mailem** (po sign-up)
- **Aktivita v kampani** (otevřel/kliknul na konkrétní campaign)
- **Vstup do segmentu**
- **Změna pole**
- **Klik na konkrétní link**

#### E-commerce (Shoptet, WooCommerce, atd.)

- **Provedl objednávku**
- **Opuštěný košík**
- **První nákup**
- **VIP zákazník** (limit nákupů)
- **Nákup konkrétního produktu**
- **Stav objednávky změněn**

#### Date-based

- **Datum v poli** (svátek, narozeniny, výročí)
- **Konkrétní datum**
- **Posun od data** (X dní před/po)
- **Roční výročí** (recurring)

#### Pohyb na webu

- **Návštěva konkrétní stránky**
- **Návštěva kategorie produktu**
- **Cart event (opuštění košíku, přidání produktu)**

#### Webhooks + API

- **Externí trigger** přes API

### 7.3 Akce ve workflow

#### Odesílání

- **Odeslat e-mail** (design inline)
- **Odeslat SMS** (s SMS kredity)
- **Odeslat notification** (interní team)

#### Manipulace s kontaktem

- **Přidat/odebrat štítek**
- **Přidat/odebrat ze seznamu**
- **Aktualizovat pole**

#### Logika / podmínky

- **Čekat** (delay – minuty/hodiny/dny)
- **Čekat do data**
- **Větvení (Pokud/Jinak)** – yes/no
- **Filtr** (omezit kontakty na pokračování)
- **Goal** (cíl konverze – exit on success)

#### Externí

- **Webhook** – call external URL
- **Facebook Audience** sync

### 7.4 Frekvence spouštění

Per oficiální docs:

- **Jednou per kontakt** (welcome series – jen 1×)
- **Vícekrát** (re-engagement, opakovaně)
- **S minimální mezerou** (X dní mezi opakováními)

### 7.5 Strom automatizace

Visual canvas:

- Drag-drop nodes
- Vizuální větvení
- Live testing
- Preview as kontakt

### 7.6 Heatmaps v automatizacích

Per oficiální docs:

- V automatizacích Ecomail **ukazuje:**
  - Zda kontakt do automatizace **vstoupil**
  - Jestli na něco **kliknul**
  - Jestli **otevřel e-mail**
  - Jestli už automatizaci **ukončil**
- Helps debug + optimize

### 7.7 Časté patterny automatizací

#### Welcome série

```
Trigger: Nový odběratel
   ↓
Čekat 0 min
   ↓
Odeslat E-mail 1: Uvítací + sleva 10%
   ↓
Čekat 3 dny
   ↓
Odeslat E-mail 2: Brand story
   ↓
Čekat 5 dní
   ↓
Pokud/Jinak: Nakoupil?
   ANO → Cíl achieved (exit)
   NE → Odeslat E-mail 3: Bestsellery
   ↓
Konec
```

#### Opuštěný košík

```
Trigger: Opuštěný košík (z e-shopu integrace)
   ↓
Čekat 1 hodinu
   ↓
Odeslat E-mail: "Zapomněli jste něco?" (s obsahem košíku!)
   ↓
Čekat 24 hodin
   ↓
Pokud/Jinak: Nakoupil?
   ANO → Cíl
   NE → Odeslat E-mail 2: 10% sleva
   ↓
Čekat 48 hodin
   ↓
Pokud/Jinak: Nakoupil?
   ANO → Cíl
   NE → Odeslat SMS (volitelně, s SMS kredity)
   ↓
Konec
```

#### Post-purchase + náhradní díly (z real case nanoSPACE)

```
Trigger: Provedl objednávku konkrétního produktu (čistička vzduchu)
   ↓
Čekat X dní (např. 80% životnosti náhradního dílu = 120 dní)
   ↓
Odeslat E-mail: "Pravděpodobně potřebujete vyměnit filtr"
- Direct link na náhradní díl
- Sleva pro stávající zákazníky
   ↓
Čekat 14 dní
   ↓
Pokud/Jinak: Nakoupil náhradní díl?
   ANO → Cíl
   NE → Připomínka 2 (s vyšší slevou)
```

### 7.8 Testování automatizace

- **Preview as kontakt** – walk through workflow
- **Test send** specific email
- **Real send** to test kontakt
- **Activity log** per kontakt

---

## 8. Předpřipravené automatizace

Per oficiální docs, Ecomail nabízí **8+ předpřipravených automatizací**:

### 8.1 Hlavní šablony

1. **Poděkování za přihlášení k odběru newsletteru**
2. **Sleva na první nákup po přihlášení**
3. **Připomenutí opuštěného nákupního košíku**
4. **Reaktivační kampaň pro e-shop**
5. **Přání k svátku**
6. **Přání k narozeninám**
7. **Výročí 1. nákupu**
8. **E-book ke stažení**
9. **Welcome série** (multi-step)
10. **Odměna za nákup (slevový kupón)**

### 8.2 Použití šablon

- **Pre-built** scenarios
- **Customizovatelné** (texty, časování, branding)
- **Stačí zapnout** a upravit
- **Best practice** zabudovaná

### 8.3 Časté kombinace

**E-commerce essential set:**

1. Welcome série (po sign-up)
2. Opuštěný košík
3. Sleva na první nákup
4. Reaktivace inaktivních
5. Birthday + svátek
6. Post-purchase upsell

---

## 9. CDP tarif (Customer Data Platform)

**Hlavní pivot 2024:** Ecomail rozšířil platformu o CDP features.

### 9.1 Co je CDP tarif

Per oficiální docs:
_"Tarif CDP obsahuje všechny funkce tarifu Marketer+ a navíc je obohacen o pokročilý reporting ve formě CDP (Customer Data Platform Analytics)."_

### 9.2 CDP komponenty

#### RFM analýza

- **Recency, Frequency, Monetary** scoring
- **Automatické rozdělení databáze** dle:
  - **Frekvence objednávek**
  - **Hodnoty objednávek**
  - **Recency** (kdy naposledy nakoupil)
- **Segmenty automaticky vytvořené:**
  - Top zákazníci (Champions)
  - Loajální zákazníci
  - Potenciální loajalisté
  - Spící zákazníci
  - Klesající zájem
  - Ztracení zákazníci
  - Noví zákazníci

#### Pokročilé konverzní reporty

- **Měření vlivu e-mailingu na tržby**
- **Per-kampaň revenue attribution**
- **Per-segment revenue**
- **Time-to-conversion**
- **AOV per segment**

#### Produktová analýza

- **Nejčastěji prodávané produkty**
- **Cross-sell insights:**
  - "Co kontakty nakupují v rámci stejné objednávky"
  - "Co nakupují v rámci další objednávky"
- **Doporučení produktů** v newsletterech (auto)
- **Per-kategorie performance**

#### Sledování retence

- **Pohyb mezi segmenty v čase**
- **Cohort analysis**
- **Retenční trendy**
- **Early warning** pro klesající retenci

### 9.3 Pro koho je CDP tarif

Per oficiální comm:

- **E-shopy s data ambicí**
- **Mid-to-large** e-shopy s 5 000+ zákazníky
- **Brand chtějící data-driven marketing**
- **Retenční focus** > pure acquisition

### 9.4 Záchranné scénáře

CDP umožňuje:

- **Identifikovat zákazníky s klesající retencí včas**
- **Spustit záchranné automatizace** dříve, než odejdou
- **Personalizované re-engagement** dle minulých nákupů

### 9.5 Limitace CDP tarifu

- **Cena vyšší** než Marketer+
- **Vyžaduje data** (minimální historie nákupů pro RFM)
- **Onboarding** komplexnější
- **Učící křivka** na pochopení RFM

### 9.6 Upgrade flow

Per oficiální docs:

```
Stávající tarif: Profi nebo Marketer+
   ↓
Správa účtu → Upgrade na CDP
OR
Kontaktovat podporu pro setup
   ↓
[CDP aktivní]
   ↓
Doporučeno:
- Webinář o CDP
- Demo call s e-mail marketingovým specialistou
```

---

## 10. RFM analýza

### 10.1 Co je RFM

**Recency, Frequency, Monetary** scoring:

- **R (Recency):** kdy naposledy nakoupil
- **F (Frequency):** jak často nakupuje
- **M (Monetary):** kolik utratil

### 10.2 RFM v Ecomail CDP

Per oficiální docs:

- **Automatické rozdělení databáze do segmentů**
- **Score** per kontakt
- **Cohort assignment** auto

### 10.3 RFM kohorty

Typical Ecomail/RFM kohorty:

- **Champions** (best customers, top R+F+M)
- **Loyal Customers** (consistent)
- **Potential Loyalists** (recent, multi-purchase)
- **Recent Customers** (new, not yet loyal)
- **Promising** (early signals)
- **Needs Attention** (declining)
- **About to Sleep** (recently declining)
- **At Risk** (high value but declining)
- **Cannot Lose Them** (top spenders going inactive)
- **Hibernating** (long inactive)
- **Lost** (churned)

### 10.4 Použití RFM

```
Champions cohort:
- Send: Exclusive VIP offers
- Reward: Loyalty bonuses
- Frequency: regular contact

At Risk cohort:
- Trigger: re-engagement workflow
- Offer: substantial discount
- Personalized: dle minulých nákupů

Hibernating cohort:
- Final re-engagement attempt
- If no response: move to "Lost"
- Eventually: archive or sunset
```

### 10.5 Pohyb mezi segmenty

Per oficiální docs:
_"Sledujte pohyb uživatelů mezi segmenty v čase."_

- **Time-series** analysis
- **Cohort velocity** (jak rychle se kohorty mění)
- **Trend detection** (rostoucí vs. klesající kohorty)
- **Early warning** signály

---

## 11. Formuláře a Pop-upy

### 11.1 Typy formulářů

- **Statický formulář** (embed na webu)
- **Pop-up formulář** (modal)
- **Vysouvací lišta** (sticky bar)
- **Slider** (slide-in)

### 11.2 Tvorba formuláře

```
Formuláře → Vytvořit nový
   ↓
Typ
   ↓
Pole:
- E-mail (povinné)
- Jméno
- Příjmení
- Telefon
- Pohlaví
- Custom pole
- GDPR consent checkbox
- Captcha
   ↓
Design:
- Drag-drop builder
- Brand kit
- Custom CSS
   ↓
Trigger (pop-up):
- Čas na stránce
- Scroll %
- Exit intent
- Klik na element
- Frekvence per visitor
- URL targeting
   ↓
Akce po submit:
- Přidat do seznamu
- Přidat štítek
- Spustit automatizaci
- Volitelná welcome zpráva
   ↓
Publikovat
```

### 11.3 Mobile responsive

- **Desktop + mobile verze**
- **Optimized pro mobil**
- **Touch-friendly** elements

### 11.4 Use cases

- **Lead magnet** (newsletter signup za eBook)
- **První slevová** nabídka
- **Exit intent rescue**
- **VIP program** signup
- **Survey/quiz** entry
- **Event registration**

---

## 12. Sledování pohybu na webu

### 12.1 Tracking script

**JavaScript snippet** na webu:

- Track page views per kontakt
- Time on page
- Custom events
- E-commerce events
- Returning vs new visitor

### 12.2 Identifikace kontaktu

```
Anonymní návštěvník (cookie)
   ↓
Aktivita zaznamenána pod cookie ID
   ↓
Návštěvník vyplní formulář / nakoupí
   ↓
**Cookie + email matched**
   ↓
Historická aktivita atribuována kontaktu
   ↓
Full timeline preserved
```

### 12.3 Use cases

#### Segmentace dle pohybu

```
Segment: "Viděli kategorii outdoor"
- Site activity: visited /outdoor/* in last 7 days
- + nemají nákup
   ↓
Cílená kampaň: "Outdoor sezóna začíná"
```

#### Trigger automatizace

```
Trigger: Návštěva stránky /vans-bez-tkaniček/
- Visit count >= 2
   ↓
Workflow: "Personalizovaný e-mail s nabídkou Vans"
```

### 12.4 Integrace s e-commerce

- **Auto-track** product views
- **Cart events**
- **Order events**
- **Customer ID** matching

---

## 13. SMS marketing

### 13.1 SMS capabilities

- **Bulk SMS kampaně**
- **SMS v automatizacích** (jako akce)
- **Personalizace** slučovacími značkami
- **STOP keyword** handling (auto opt-out)
- **Per-country pricing**

### 13.2 SMS kredity

Per oficiální docs:

- **Samostatné SMS kredity** (NE e-mailové)
- **1 SMS ≠ 1 kredit** – počet kreditů per SMS varies podle země
- **Pouze jako add-on** k tarifu (NE free plan)
- **Buy SMS credits** v aplikaci

### 13.3 Use cases

- **Flash sales** (časově citlivé)
- **Opuštěný košík** (po 24h+ od email)
- **Doručení objednávky**
- **VIP alerts**
- **Narozeniny / svátek** (personal)

### 13.4 Multi-channel s e-mailem

```
Workflow: Opuštěný košík (multichannel)

Trigger: Cart abandoned
   ↓
Čekat 1h → E-mail reminder
   ↓
Čekat 24h → Pokud nenakoupil:
   E-mail s 10% slevou
   ↓
Čekat 48h → Pokud nenakoupil + opted-in SMS:
   SMS: "Posledních X hodin pro slevu 10%!"
   ↓
Konec
```

### 13.5 Compliance

- **Opt-in tracking** per kontakt
- **STOP keyword** auto handling
- **GDPR consent** pro SMS marketing
- **Quiet hours** respektovány

---

## 14. Facebook Lead Ads + Custom Audiences

### 14.1 Facebook Lead Ads integrace

Per oficiální docs:

- **Facebook Lead Ads** sync direct s Ecomailem
- **Lead form submissions** → kontakty v Ecomailu
- **Automatic import** po podaných žádostech
- **Workflow trigger** (welcome series)

### 14.2 Custom Audiences sync

- **Vytváření Facebook publik** z Ecomail segmentů
- **Sync** segmentů kontaktů do FB
- **Targeted Facebook ads** based on Ecomail data
- **Lookalike audiences** od VIPs
- **Suppression** existing customers

### 14.3 Use cases

#### Lead acquisition

```
Facebook Lead Ad campaign
   ↓
Lead form submission
   ↓
Auto-import do Ecomailu (specifický seznam)
   ↓
Welcome workflow triggers
   ↓
Nurture nové leady
```

#### Re-targeting

```
Segment: "Opuštěný košík + nenakoupil 7 dní"
   ↓
Sync do FB Custom Audience
   ↓
Run FB retargeting ads s produktem z košíku
   ↓
Kombinace s e-mailing reminder
```

### 14.4 Facebook page tab

- **FB Page tab** s formulářem
- **Email collection** direct from FB profile
- **Newsletter signup** přímo z FB stránky

---

## 15. Transakční e-maily

### 15.1 Transakční e-maily v Ecomailu

- **Native podpora** (NE separate platform)
- **API endpoint** pro transactional sends
- **Templates** pre-built + customizable
- **Personalizace** via API parameters

### 15.2 Use cases

- **Potvrzení objednávky**
- **Potvrzení odeslání**
- **Sledování zásilky**
- **Reset hesla**
- **Faktury / účtenky**
- **Notifikace** systémové

### 15.3 Šablony

- **Pre-built transactional šablony**
- **Customizable** per brand
- **Dynamic variables** v textu + obrázky
- **Multi-language** support

### 15.4 Integrace

- **Shoptet automatic** – transakční eventy ze Shoptetu
- **WooCommerce plugin** support
- **Custom via API**

### 15.5 Pricing

- **Součást standardního tarifu** (NE add-on)
- **E-mailové kredity** se použijí
- **Žádná separate infrastructure**

---

## 16. Personalizace + dynamický obsah

### 16.1 Personalizační features

- **Merge tags** v textu (jméno, příjmení, atd.)
- **Auto-skloňování jmen** (CZ unique!)
- **Datum svátku** auto-determined
- **Dynamic blocks** (Marketer+):
  - Last viewed products
  - Last purchased products
  - Recommended products (CDP)
  - Cross-sell items
- **Conditional content** (Marketer+):
  - Show/hide per segment
  - If/then logic v emailu

### 16.2 Produktové bloky

```
V šabloně:
- Drag-drop "Produktový blok"
- Konfigurace:
  - Source (produktový feed)
  - Filtr (per kategorie, brand, cena)
  - Sort (popularita, novinky, sleva)
  - Počet produktů zobrazit
   ↓
Auto-render per recipient:
- Per recipient může být different products
- Based on browse / purchase history
```

### 16.3 Doporučení produktů (CDP)

CDP tarif:

- **AI doporučení** produktů per kontakt
- **Based on:**
  - Browse history
  - Purchase history
  - Cross-sell patterns
  - Segment affinity
- **Auto-insert** v emailech

### 16.4 Personalizace v subject line

- **Merge tags** v předmětu (např. "{jméno}, máme pro vás...")
- **Auto-skloňování** v 5. pádu
- **Dynamic subject** per segment (Marketer+)

---

## 17. Reporty + analytika

### 17.1 Kampaně reporty

#### Standard metriky

- **Odesláno**
- **Doručeno**
- **Bounced** (hard + soft)
- **Otevření** (unikátní + celkem), open rate
- **Prokliky**, CTR
- **Top odkazy**
- **Odhlášení**
- **Spam complaints**
- **Geografická** distribuce
- **Zařízení + email klient**

#### Vizualizace

- **Heatmapy** (click maps na emailu)
- **24h chart** performance
- **Komparace** s předchozími kampaněmi
- **Real-time updates**

### 17.2 Automatizace reporty

- **Per-workflow stats:**
  - Aktuálně v automatizaci
  - Dokončili
  - Dosáhli cíle (konverze)
- **Per-krok metriky:**
  - Open, click rates per email step
  - Drop-off per krok
  - Time-to-completion
- **Re-add failed contacts**

### 17.3 Formuláře reporty

- **Submissions** count
- **Konverze rate**
- **A/B test results** (Marketer+)

### 17.4 Web tracking reporty

- **Top pages** visited
- **Per-kontakt site activity**
- **Konverzní funnel**

### 17.5 CDP analytika (CDP tarif)

- **Měření vlivu na tržby**
- **Per-segment revenue**
- **Per-kampaň revenue** attribution
- **Time-to-conversion** analysis
- **RFM dashboard** (cohort distribution + trends)
- **Produktová analýza** (top products, cross-sell)

### 17.6 Looker Studio integrace

- **Google Looker Studio** native connector (nové 2024+)
- **Sledování reportů** v jednotném BI tool
- **Hodnocení vs. ostatní kanály**
- **Custom dashboards**

### 17.7 Google Analytics integrace

- **UTM parameters** auto v kampaních
- **Conversion tracking** v GA
- **Goals + funnels** napojení

### 17.8 Export reportů

- **CSV download**
- **PDF reports**
- **Scheduled reports** (some plans)
- **API access** to data

---

## 18. Integrace + API

### 18.1 API

- **REST API**
- **Authentication** přes API token (per účet, nebo per user)
- **JSON** request/response
- **Rate limits** vary by tarif
- **Dokumentace** plně v češtině + angličtině

### 18.2 API endpointy

- `/contacts` – CRUD kontakty
- `/lists` – seznamy
- `/segments` – segmenty
- `/campaigns` – kampaně
- `/automations` – workflows
- `/transactional` – transakční e-maily
- `/sms` – SMS API
- `/forms` – formuláře
- `/events` – custom tracking
- `/reports` – analytika

### 18.3 Webhooks

- **Real-time events**
- Konfigurovatelné per integration
- Events:
  - Contact created/updated/unsubscribed
  - Campaign sent/opened/clicked
  - Form submission
  - Automation completed
  - Order events

### 18.4 Lokální integrace (klíčové)

#### České e-commerce platformy

- **Shoptet** (DEEPEST – #1 v CZ)
  - Real-time přenos kontaktů
  - Objednávky + slevové kupóny
  - Sledování opuštěného košíku
  - Pohyb uživatelů na webu
- **FastCentrik**
- **Upgates**
- **Webnode shop**

#### Slovenské platformy

- **Eshop-rychlo.sk**
- **Webglobe / Slovenia**

#### Polské platformy (in progress)

- **Shoper**
- **IdoSell**
- **PrestaShop** (popular v PL)

### 18.5 Mezinárodní e-commerce

- **WooCommerce** (WordPress)
- **Shopify**
- **PrestaShop**
- **Opencart**
- **Ecwid**
- **BigCommerce**

### 18.6 CRM + sales

- **Raynet** (CZ CRM)
- **Pipedrive**
- **HubSpot CRM**
- Custom CRMs via API

### 18.7 Comparison + reviews

- **Heureka.cz** (sběr emailů, reviews)
- **Zboží.cz**
- **Hodnocení obchodu**

### 18.8 Marketing tools

- **Facebook (Lead Ads + Custom Audiences)**
- **Google Analytics**
- **Google Ads**
- **Looker Studio** (reporting, 2024+)

### 18.9 Vstupenky + events

- **GoOut.net** (CZ vstupenky)
- **Eventbrite** (mezinárodní)

### 18.10 Productivity

- **WordPress** plugin
- **Zapier** (5 000+ apps)
- **Make (Integromat)**
- **n8n**

---

## 19. Doručitelnost + GDPR + hosting

### 19.1 Hosting

- **EU hosting** (Czech Republic primary)
- **Data residency v EU**
- **GDPR compliant** by design
- **DPA available**

### 19.2 Doručitelnost CZ schránek

**Klíčový asset Ecomailu:**

- **Partnerství s Seznam.cz**
- Pravidelné statistiky doručitelnosti
- 2023: 115+ milionů e-mailů na Seznam.cz schránek (Black Friday)
- Anti-spam compliance enforcement

### 19.3 Authentication

| Protokol                    | Setup                              |
| --------------------------- | ---------------------------------- |
| **SPF**                     | Include for Ecomail's mail servers |
| **DKIM**                    | CNAME records                      |
| **DMARC**                   | TXT record                         |
| **Sender verification**     | Email verification                 |
| **Branded tracking domain** | CNAME setup                        |

### 19.4 GDPR features

- **GDPR consent fields** v formulářích
- **Per-seznam opt-in** tracking
- **Audit trail** (IP, timestamp, source)
- **Right to Be Forgotten:**
  - UI: Subscriber → Delete permanently
  - API: DELETE endpoint
  - Self-service via Preference Center
- **Data export per kontakt**
- **DPA** dostupné elektronicky

### 19.5 Compliance

- **GDPR compliant**
- **Česká právní compliance**

### 19.6 Anti-spam policy

- **List quality checks** při importu
- **Sender reputation monitoring**
- **Spam complaint rate** sledováno
- **Account block** pro porušení (purchased lists, atd.)

### 19.7 Gmail / Yahoo / Seznam 2024+ compliance

- **One-click unsubscribe** (RFC 8058) auto
- **DKIM + DMARC** enforced
- **Spam complaint rate** < 0.3% monitored
- **Functional unsubscribe** immediate

---

## 20. Limity a nedostatky

### 20.1 Globální dosah limitace

- **Primární CZ/SK/PL trh** – mimo CEE region méně rozšířený
- **Anglická lokalizace UI ok**, ale support primárně CZ
- **Menší mezinárodní ekosystém** vs. globální nástroje
- **Documentation** primárně CZ

### 20.2 Funkční omezení

- **Žádné AI features** generative (vs. Klaviyo, HubSpot)
- **Žádné autonomous AI agents**
- **Žádné webinars / courses** built-in (vs. GetResponse)
- **Žádné digital products sale**
- **Žádné paid newsletters**
- **Žádný integrated CRM** (deals, pipelines)
- **Multi-channel** primárně email + SMS (NE push, in-app, atd.)

### 20.3 Automatizace limity

- **Méně sofistikované branching** než ActiveCampaign / Klaviyo
- **Limited multi-trigger** workflows
- **No advanced filtering** v workflow
- **No predictive analytics** mimo CDP
- **No A/B testing v workflow paths**

### 20.4 CRM gaps

- **Žádný built-in CRM** (deals, pipelines)
- **Žádný sales automation**
- **Žádný lead scoring**
- Suitable pro pure e-commerce, ne B2B sales-led

### 20.5 UI/UX issues

- **Mobile app limited** (vs. desktop)
- **Některé sekce** mohou působit dated
- **Editor občas slower** s velkými šablonami

### 20.6 Pricing concerns

- **Vlastní oprávnění JEN na Marketer+** (limitace pro agency model)
- **Free plan velmi limitovaný** (200 kontaktů, 200 emailů)
- **CDP tarif** může být drahý pro menší e-shopy
- **SMS kredity** separate cost

### 20.7 Spam handling

Per Capterra review:

- **Shoptet někdy zasílá spam adresy** do Ecomailu, které Ecomail automaticky nedetekuje
- Vyžaduje **manuální cleanup** databáze
- Better filtering wished

### 20.8 Doplněk Shoptet limitations

Per real reviews:

- **Shoptet doplněk** je **placená 3-month minimum** subscription
- **Zkušební doba** může být zavádějící
- **Customer feedback:** "Bohužel, není možnost zrušit doplněk před 3 měsíci"

### 20.9 Limity per role

- **Vlastní oprávnění** jen v Marketer+ tarifu (a CDP)
- **5 default rolí** (Majitel, Administrátor, Editor, Support, Čtenář)
- **Limited granularity** ve free plánu
- **Per-funkce permissions** komplexnější setup

### 20.10 Account expiration

- **1 rok neaktivity** → account smazán (s notification)
- Klient musí být občas přihlášen

### 20.11 Cena srovnání s lokálními konkurenty

| Lokální alternativa | Pozice                                                     |
| ------------------- | ---------------------------------------------------------- |
| **SmartEmailing**   | Similar pricing, podobné features, méně e-commerce focused |
| **Mailkit**         | Vyšší pricing, enterprise focus                            |
| **Boldem**          | Levnější, méně features                                    |
| **Leadhub/Targito** | Specifický pro media + B2B                                 |

### 20.12 Mezinárodní expanze challenges

- **Polská lokalizace** stále in progress
- **Limited polish integrations** vs. SALESmanago
- **Less brand recognition** mimo CEE

---

## 21. Shrnutí: Pro koho a proti komu

### Ecomail je dobrá volba pokud

- Provozujete **český / slovenský / polský e-shop** (Shoptet, FastCentrik, WooCommerce, Shopify)
- Cílíte **mid-market SMB** segment
- Vážíte si **lokální podpory v češtině** (chat, telefon, email)
- Hledáte **transparentní pricing** v CZK / EUR
- Provozujete **běžný e-commerce** s 500 - 50 000 zákazníky
- Cíl je **automatizace + segmentace** pro retention
- Potřebujete **deep Shoptet/WooCommerce integraci**
- Hledáte **lokální compliance** + EU hosting + GDPR
- Provozujete **agenturní model** (multi-client management)
- Potřebujete **automatické skloňování jmen** v CZ
- Provozujete **subscription business** s opakovanými nákupy
- Vážíte si **doručitelnost na české schránky** (Seznam.cz)
- Hledáte **střední cenovou hladinu** (vs. drahé globální nástroje)
- Provozujete **neziskovku** v CZ (50% sleva)

### Ecomail není dobrá volba pokud

- Provozujete **mezinárodní enterprise** s 1M+ kontakty
- Hledáte **deep B2B CRM** (deals, pipelines, lead scoring) – HubSpot, Salesforce, Pipedrive
- Provozujete **DTC e-commerce na Shopify** s deep predictive analytics – Klaviyo
- Cíl je **AI-powered marketing** s autonomous agents – Klaviyo Agent, HubSpot Breeze
- Potřebujete **webinars + courses + funnels built-in** – GetResponse
- Provozujete **enterprise B2C s loyalty programem** – SAP Emarsys
- Hledáte **enterprise customization** (custom objects, advanced API) – Salesforce, Adobe
- Potřebujete **deep B2B sales engagement** – ActiveCampaign Sales Engagement, Outreach.io
- Vyžadujete **WhatsApp Business** v base – Brevo, GetResponse
- Provozujete **content monetization** (paid newsletter, courses) – Substack, MailerLite, GetResponse
- Hledáte **largest integration marketplace** (970+) – ActiveCampaign
- Potřebujete **CDP enterprise scale** (millions of customers) – SAP CDP, Treasure Data

### Ecomail vs. konkurence

| Konkurence         | Kdy lepší než Ecomail                                        |
| ------------------ | ------------------------------------------------------------ |
| **SmartEmailing**  | Větší brand recognition na CZ trhu, podobné features         |
| **Mailkit**        | Enterprise B2C, transactional focus, dlouhá historie         |
| **Boldem**         | Levnější, jednodušší pro malé klienty                        |
| **Mailchimp**      | Mezinárodní brand recognition, ekosystém, free tier          |
| **Klaviyo**        | DTC e-commerce, predictive analytics, Shopify deep           |
| **HubSpot**        | Full B2B CRM, sales-led, enterprise governance               |
| **ActiveCampaign** | Mid-market deep automation, 970+ integrations, B2B CRM       |
| **MailerLite**     | Pure content creators, paid newsletters, simpler             |
| **GetResponse**    | Webinars + courses + funnels, 27 jazyků UI                   |
| **Brevo**          | Volume-based pricing, transactional excellence, multilingual |
| **SAP Emarsys**    | Enterprise retail, loyalty, omnichannel                      |
| **ExpertSender**   | E-commerce CDP s dedicated CSM, polský origin                |
| **SALESmanago**    | Polský trh deep, advanced B2B + AI                           |

---

_Dokument zpracován z oficiálních zdrojů ecomail.cz, ecomail.app, help.ecomail.cz, support.ecomail.cz a praktických zdrojů (G2, Capterra, GetApp, Wikipedia.cz, Shoptet partneři, Loudavymkrokem.cz, Effectix). Pro nejaktuálnější ceny vždy ověřit na ecomail.cz/price._
