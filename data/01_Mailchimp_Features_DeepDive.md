# Mailchimp – hloubková analýza funkcí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Zdroje:** oficiální dokumentace mailchimp.com/help, mailchimp.com/developer, mailchimp.com/pricing + analytické weby (EmailToolTester, Mailmeteor, Retainful, EmailVendorSelection) ověřené v dubnu–květnu 2026.
**Rozsah:** kompletní funkcionalita platformy v roce 2026 – od free planu po enterprise/Premium, včetně API, integrací, automatizací, segmentace, reportingu a deliverability.

> **Poznámka k aktuálnosti:** Mailchimp byl v roce 2021 akvírován Intuitem (za 12 miliard USD). Od té doby probíhá postupné přesouvání funkcí do vyšších tarifů a snižování free planu. Tento dokument popisuje stav k roku 2026.

---

## Obsah

1. [Základní info o platformě](#1-základní-info)
2. [Tarify a cenová struktura](#2-tarify-a-cenová-struktura)
3. [Account & Audience – datová struktura](#3-account--audience)
4. [Segmentace: Tags, Groups, Segments, Merge fields](#4-segmentace)
5. [Sign-up forms a Landing pages](#5-sign-up-forms-a-landing-pages)
6. [Email Campaigns – editor a typy kampaní](#6-email-campaigns)
7. [Marketing Automation Flows (dříve Customer Journeys)](#7-marketing-automation-flows)
8. [Classic Automations](#8-classic-automations)
9. [SMS a Transactional email (Mandrill)](#9-sms-a-transactional)
10. [E-commerce funkce](#10-e-commerce-funkce)
11. [AI a Intuit Assist](#11-ai-a-intuit-assist)
12. [Reports & Analytics](#12-reports--analytics)
13. [Deliverability & Authentication](#13-deliverability--authentication)
14. [API, Webhooks a integrace](#14-api-webhooks-a-integrace)
15. [Mailchimp Websites & Domains](#15-websites--domains)
16. [Compliance, GDPR, archive](#16-compliance-gdpr)
17. [Limity a známé nedostatky](#17-limity-a-nedostatky)

---

## 1. Základní info

**Mailchimp** je email marketing a marketing-automation platforma založená 2001 (Ben Chestnut, Dan Kurzius). V roce 2021 akvírována Intuitem.

- **Velikost:** 11+ milionů aktivních účtů (duben 2026, Automation Atlas)
- **Objem:** 500+ milionů odeslaných emailů denně
- **Pozice:** SMB segment + rostoucí mid-market. Klientela: drobní podnikatelé, e-shopy, agentury, neziskovky.
- **Mateřská společnost:** Intuit Inc. (USA)
- **HQ:** Atlanta, GA (USA) – data hostována primárně v USA
- **Lokalizace UI:** angličtina, španělština, francouzština, němčina, portugalština + další (~10 jazyků). Čeština, slovenština ani polština **nejsou** podporovány.

---

## 2. Tarify a cenová struktura

Mailchimp má v roce 2026 čtyři tarify + transactional/SMS add-ony.

### 2.1 Free

| Parametr                | Hodnota                                               |
| ----------------------- | ----------------------------------------------------- |
| Kontakty                | max **250**                                           |
| Měsíční odesílací limit | **500 emailů**                                        |
| Denní limit             | 250 emailů                                            |
| Audience                | 1                                                     |
| Branding                | povinné Mailchimp logo v patičce                      |
| Uživatelské role        | jen Owner (single-user)                               |
| Šablony                 | omezený výběr                                         |
| Email support           | pouze prvních 30 dní                                  |
| Automation              | jen single-step welcome (multi-step zrušen 2025)      |
| Pozn.                   | Free byl 2022: 2 000 kontaktů → 2023: 500 → 2026: 250 |

> **Důležité:** při překročení limitu free plán **úplně pauzuje** odesílání (na placeném tarifu jen účtuje overage).

### 2.2 Essentials – od cca $13/měsíc (500 kontaktů)

- Až **50 000 kontaktů** a **3 audience listy**
- Měsíční limit: **10× počet kontaktů** v emailech
- Odstranění Mailchimp brandingu
- A/B testing (klasický, 2 varianty)
- All email templates
- 24/7 email + chat podpora
- 3 uživatelské sloty (Owner + 2 další)
- Basic Automation flows: **až 4 kroky** (steps)
- **Bez** multi-step automation s větvením
- Send Time / Time-zone send: **ne**

### 2.3 Standard – od cca $20/měsíc (500 kontaktů)

Nejčastěji doporučovaný tarif. Zahrnuje vše z Essentials plus:

- Měsíční limit: **12× počet kontaktů**
- 5 audience listů
- **5 uživatelských slotů**
- **Plný Customer Journey / Automation Flow Builder** – až **200 kroků**, větvení (if/else), percentage split, wait-for-trigger
- **Send Time Optimization** (ML predikce nejlepšího času pro každý kontakt)
- **Delivery by Time Zone**
- **Dynamic Content** (podmíněné bloky v emailu)
- **Behavioral Targeting** (cílení podle chování na webu)
- Predictive segmentation (CLV, churn risk, predicted purchase)
- Retargeting ads (Facebook, Instagram, Google)
- Custom-coded HTML templates

### 2.4 Premium – od cca $350/měsíc (10 000 kontaktů; min. tier!)

- **Unlimited audiences**
- **Unlimited user seats**
- Měsíční limit: **15× kontaktů**
- Multivariate testing (až 8 variant najednou, ne 2)
- **Comparative reporting** (přímé porovnání kampaní)
- **Advanced segmentation** (25 podmínek místo 5)
- **Phone support** + priority support
- 5 personalizovaných onboarding sezení
- Role-based access (granulárnější permissions)
- **High-volume sender** plán pro 200 000+ kontaktů (jednání s prodejem)

### 2.5 Add-ony

| Add-on                         | Cena 2026                                                     |
| ------------------------------ | ------------------------------------------------------------- |
| Transactional Email (Mandrill) | bloky 25 000 emailů za ~$20 / blok (do 500K), pak ~$18 / blok |
| SMS Marketing                  | samostatné credit packs, podle země; není ve free             |
| Dedicated IP                   | pouze Premium + min. 5 000 mailů/den × 3 dny v týdnu          |

### 2.6 Skryté náklady – co kritici nejčastěji uvádějí

1. **Unsubscribed kontakty se počítají do tarifu.** Odhlášený kontakt zůstává ve fakturaci, dokud ho ručně neArchivujete (Archive) nebo neodstraníte. U starších účtů často **20–40 % listu je „mrtvá váha".**
2. **Duplicity přes audience listy.** Stejný email ve dvou audiences = dva billovaní kontakty.
3. **Tier rounding nahoru.** 8 000 kontaktů zaplatí jako 10 000.
4. **Promo discounts mizí.** 15 % sleva pro 10K+ kontaktů platí jen prvních 12 měsíců.
5. **Premium nemá tier pod 10 000 kontaktů** – i pro 500 kontaktů platíte plnou cenu.

---

## 3. Account & Audience

### 3.1 Datová hierarchie

```
Account (Owner-level)
└── Audience (list) – až 5 v Standard, unlimited v Premium
    ├── Contacts (subscribers, unsubscribed, non-subscribed, cleaned, archived)
    │   ├── Profile (audience merge fields)
    │   ├── Tags (libovolný počet, plochá struktura)
    │   ├── Groups (hierarchické kategorie pro preference)
    │   ├── E-commerce data (orders, products)
    │   ├── Activity log (sends, opens, clicks)
    │   └── Predictive attributes (CLV, churn risk, age/gender estimate)
    ├── Signup forms (embedded, popup, landing page)
    ├── Segments (auto/static)
    └── Settings (defaults, opt-in method, compliance)
```

### 3.2 Stavy kontaktu

| Stav               | Popis                                                    | Účtováno do tarifu?                 |
| ------------------ | -------------------------------------------------------- | ----------------------------------- |
| **Subscribed**     | Aktivní příjemce                                         | **Ano**                             |
| **Unsubscribed**   | Odhlásil se                                              | **Ano** (často přehlíženo)          |
| **Non-subscribed** | Někde v účtu se vyskytl (např. objednávka), ale neopt-in | **Ano**                             |
| **Cleaned**        | Hard bounce nebo opakovaně soft bounce                   | Ne                                  |
| **Archived**       | Ručně archivován uživatelem                              | **Ne** – jediná cesta jak nepočítat |
| **Pending**        | Čeká na potvrzení double opt-in                          | Ne                                  |
| **Transactional**  | Příjemce transakčních emailů                             | Závisí                              |

### 3.3 Multi-Audience strategie – nedoporučeno

Praktici (Pure Firefly, ALM Corp) doporučují **jeden audience list + tags/groups/segments**, protože:

- Duplicity se počítají vícekrát
- Subscriber neví, kolik listů ho má → komplikované preferencí
- Reportování je oddělené (žádný cross-audience report bez Premium)

---

## 4. Segmentace

Mailchimp nabízí **čtyři vrstvy** pro organizaci kontaktů, často matoucí:

### 4.1 Merge Fields (Audience fields)

- **Cesta:** Audience → Manage Audience → Audience fields and _|MERGE|_ tags
- Sloty pro data jako FNAME, LNAME, EMAIL, PHONE, ADDRESS, BIRTHDAY, libovolná vlastní pole
- **Typy polí:** text, číslo, datum, adresa, telefon, dropdown, radio, checkbox, image, website, zip code, birthday
- Merge tagy slouží i k **personalizaci v emailech**: `*|FNAME|*` nahradí jméno
- **System merge tagy:** `*|UNSUB|*`, `*|UPDATE_PROFILE|*`, `*|ARCHIVE|*`, `*|REWARDS|*`, `*|LIST:COMPANY|*` atd.
- **Dynamický obsah:** `*|IF:FNAME|* Hi *|FNAME|* *|ELSE:|* Hello *|END:IF|*`

### 4.2 Tags

- **Ploché štítky** bez hierarchie
- Přidávány automaticky (přes import, integraci, signup form, automation flow) nebo ručně
- Subscriber **nevidí**, že je otagován
- Použití: zdroj signupu, lifecycle milestones (např. „attended_webinar_2025"), interní flagy
- Lze trigger pro automation flow
- **Doporučení (Tailored Edge):** držet tagy úzké, audit kvartálně, mazat redundance

### 4.3 Groups

- **Hierarchické kategorie** s podskupinami
- Zobrazují se subscriberovi (typicky v signup form / preference center)
- Slouží **k self-selection preferencí** – např. „O čem chcete dostávat info?" → Produkty / Akce / Tipy
- Mohou být zobrazeny jako: dropdown, checkboxes, radio buttons, hidden

### 4.4 Segments

- **Dynamické nebo statické skupiny** vytvořené kombinací podmínek
- Až **5 podmínek** v Essentials/Standard, **25** v Premium
- **Auto-update segment:** Mailchimp automaticky přepočítává, kdo do něj patří
- **Saved segment:** uloží se konfigurace pro opakované použití

#### Segmenting options – co lze filtrovat

- **Profile data** – merge field hodnoty
- **Subscriber rating** – 1–5 hvězd (engagement score)
- **Date added / signup source**
- **Email activity** – otevřel kampaň X, kliknul, neotevřel posledních N
- **Tag membership / Group membership**
- **Geolocation** – země, region (Mailchimp detekuje z IP)
- **Email client / device**
- **Predicted demographics** – odhad věku, pohlaví (Standard+)
- **Predicted CLV / Churn risk** – Standard+
- **E-commerce data** – počet objednávek, total spent, last purchase, product purchased, abandoned cart
- **Survey / Poll responses**
- **Page views & link clicks** (s Mailchimp tracking script)
- **Landing page signup**
- **SMS subscription status**

---

## 5. Sign-up forms a Landing pages

### 5.1 Sign-up forms – varianty

1. **Hosted form** – Mailchimp-hostovaná URL
2. **Embedded form** – JS/HTML k vložení do vlastního webu
3. **Pop-up form** – modal, slide-in nebo top bar; trigger podle scroll, exit-intent, time on page
4. **Landing page form** – součást Mailchimp landing page
5. **API/integrace** – přímé volání z vlastní aplikace

### 5.2 Opt-in metody

- **Single opt-in** – přihláška = okamžitě subscribed
- **Double opt-in** – po přihlášce mu přijde confirmation email; bez kliknutí zůstává **Pending** a nezapočítává se
- **Mailchimp default:** double opt-in (z hlediska deliverability žádoucí; nicméně i confirmation emaily někdy končí ve spamu)

### 5.3 Hidden fields, source tracking, GDPR

- Forms umí předávat **hidden fields** (UTM, source)
- **GDPR/compliance fields** – checkbox „Souhlasím se zpracováním" + textace; nutné explicitně zapnout
- **ReCAPTCHA** v3 podpora

### 5.4 Landing pages

- Drag-and-drop builder
- Vlastní subdoména (např. `signup.example.com`) nebo Mailchimp URL
- Šablony pro: lead gen, product launch, event, promo
- Připojení k audience / tagům / groups
- Tracking pixel, Facebook Pixel, GA integrace
- Mobile responsive

### 5.5 Preference Center

- Subscriber vidí seznam **Groups**, do kterých je zapsán, a může je libovolně měnit
- Vlastní text v patičce ke každému emailu
- Pole pro editaci profile dat (jméno, město, narozeniny atd.)
- **Unsubscribe link** povinně v každé kampani – Mailchimp pomocí merge tagu `*|UNSUB|*`
- Po unsubscribe lze nabídnout: úplné unsubscribe vs. update preferences vs. pause emails

---

## 6. Email Campaigns

### 6.1 Typy kampaní

| Typ               | Popis                                                          |
| ----------------- | -------------------------------------------------------------- |
| **Regular**       | klasický newsletter                                            |
| **Plain-text**    | bez formátování                                                |
| **A/B Test**      | 2 varianty (Essentials+) nebo Multivariate 8 variant (Premium) |
| **RSS-to-email**  | automatický odběr blogu, generuje email                        |
| **Automated**     | spouštěné automation flow                                      |
| **Transactional** | přes Mandrill add-on                                           |

### 6.2 Email Editor

#### New Email Builder (default 2026)

- Drag-and-drop bloky: text, image, button, divider, social, video, code, payment, signup, survey, poll
- **Content blocks knihovna** – uložené reusable bloky
- **Brand kit** – uložené barvy, fonty, logo
- **Image editor** – built-in (crop, filter, text overlay)
- **Stock image library** – Unsplash, Giphy, Adobe Stock integrace

#### Classic Builder (legacy)

- Stále dostupný; tabbed view (Design, Content, Preview)

### 6.3 Šablony

- **100+ pre-built templates** (Essentials+)
- Custom-coded HTML templates (Standard+)
- Saved templates – vlastní knihovna
- **MJML-podobná struktura** za scénou (responsive)
- Snippets – malé re-usable kousky obsahu

### 6.4 Personalization

- Audience + system merge tags
- **Dynamic content blocks** (Standard+) – „Pokud kontakt je v segmentu X, zobraz tento blok"
- **Product recommendations** – AI doporučení produktů z connected store (Standard+)
- **Country/timezone aware delivery**

### 6.5 A/B Testing – co lze testovat

- Subject line
- From name / From email
- Send time
- Content (celé tělo)
- **Multivariate (Premium):** kombinace všech čtyř

### 6.6 Send-Time Optimization

- **Send Time Optimization (STO)** – Standard+; ML predikuje nejlepší hodinu na kontakt
- **Time-Warp / Time-Zone delivery** – Standard+; odesílá v lokálním čase každého příjemce
- **Schedule** – jednoduché naplánování konkrétního data/času

### 6.7 Scheduling & Throttling

- Okamžité odeslání
- Plánované odeslání
- Send by batches (manual throttling)
- RSS-driven send schedule (daily, weekly, monthly)

---

## 7. Marketing Automation Flows

> Pozn.: dříve „Customer Journeys", v 2025 přejmenováno na „Automation Flows".

### 7.1 Plán dostupnosti

| Tarif      | Co lze                                         |
| ---------- | ---------------------------------------------- |
| Free       | Single welcome email (1 step)                  |
| Essentials | Až **4 steps**, 1 trigger                      |
| Standard   | Až **200 steps**, **3 triggers**, plné větvení |
| Premium    | Vše + unlimited flows                          |

### 7.2 Komponenty flow

#### Triggers (starting points) – plný výčet

**Audience-based**

- Tag added / Tag removed
- Signs up for email
- Audience field updated
- Joins group
- Subscriber rating changes
- Birthday / specific date

**Engagement-based**

- Sent an email
- Opens email
- Unopened campaign
- Clicks any email link
- Clicks specific link
- API-triggered (Events API)
- Customer Journeys API trigger

**E-commerce**

- Makes a purchase
- Purchases specific product / category
- **Abandons cart** (generic)
- **Abandons cart with specific products**
- Performs checkout action in Shopify (start/payment/complete)
- Adds low-inventory product to cart
- **Product back in stock** (s back-in-stock form)

**Predictive (Standard+)**

- **Customer churn risk** – High/Medium/Low
- **Time until predicted purchase** – X dní před predikovaným nákupem
- **Customer lifetime value** thresholds

**Reviews (Standard+ with integration)**

- Judge.me / Yotpo review submitted (filtruje podle star ratingu)

#### Rules (control flow)

- **Conditional split** – if/else podle až 5 podmínek (Standard+)
- **Percentage split** – A/B/X procentuální rozdělení cesty (Standard+)
- **Wait for trigger** – pauza dokud kontakt nesplní další podmínku
- **Time delay** – wait X hours/days/weeks, nebo wait until specific day of week / hour
- **Wait until specific date**

#### Actions

- **Send email** – plnohodnotný kampaňový editor
- **Send SMS** (s SMS add-on, schválený program)
- **Add tag / Remove tag**
- **Add to group / Remove from group**
- **Update audience field** (libovolný field na libovolnou hodnotu)
- **Notify via email** – pošle interní notifikaci adminovi
- **Notify via SMS**
- **End the flow** (exit action)

#### Filters

- Až **5 filtrů per trigger** – upřesňuje, kdo do flow vstoupí
- Stejné možnosti jako Segments

#### Exit conditions

- Goal step – ukončí cestu při dosažení cíle (např. nákup)
- Tag remove
- Unsubscribe (vždy implicitně)

### 7.3 Flow templates (předpřipravené)

- Welcome new contacts
- Abandoned cart recovery
- Post-purchase follow-up
- Re-engagement / win-back
- Birthday / anniversary
- Product back-in-stock
- Lead nurture
- Educational drip series
- Webinar registration → reminder → follow-up

### 7.4 Reporting v rámci flow

- Per-step stats: počet kontaktů aktuálně v kroku, dokončili, vystoupili
- Per-email stats: open, click, revenue, bounce
- View Report tlačítko na paused flow

---

## 8. Classic Automations

**Legacy systém**, existuje paralelně s Automation Flows.

- Lineární sekvence emailů (ne canvas builder)
- Single-trigger
- Použití hlavně pro:
  - Welcome series
  - Birthday / anniversary
  - Abandoned cart email (typ `abandonedCart`)
  - Product retargeting (typ `abandonedBrowse`)
  - Email follow-up
- **Classic Automation Builder byl deprecated v červnu 2025** – multi-step jen v novém Flow builderu
- Existující classic automation lze pauzovat / replikovat, nelze vytvořit nové

---

## 9. SMS a Transactional

### 9.1 SMS Marketing

- Samostatný add-on, není ve free
- Vyžaduje **schválený SMS program** (anti-spam compliance)
- Lze jako akce v Automation Flow nebo standalone kampaň
- **Geografie:** USA, Kanada, UK + omezeně další (mění se)
- Subscribery se ukládají s telefonním číslem v audience
- Reportování: delivered, click, opt-out, revenue
- TCPA / CAN-SPAM / GDPR consent flow

### 9.2 Mailchimp Transactional Email (Mandrill)

- **Add-on** dostupný od Standard plánu
- API-based posílání transakčních emailů (objednávky, hesla, notifikace)
- **Pricing:** bloky 25 000 emailů ~$20 (≤500K), ~$18 (>1M)
- Vlastní DKIM podepisování, vlastní DMARC alignment
- **Dedicated IP** k dispozici (vlastní rozhodování + min. objemy)
- Featury:
  - Templates s Handlebars syntax
  - Webhooks pro events (sent, open, click, bounce, reject, spam, unsub)
  - Subaccounts (oddělená reputace per klient/projekt)
  - Comparative reporting
  - Whitelisting / Blacklisting per subaccount
  - Inbound email parsing (přijaté emaily přes SMTP)
- **Compliance:** Mandrill **nepošle z neverifikovaného domain ani bez DMARC policy** (od 2024 striktní)

---

## 10. E-commerce funkce

### 10.1 Store integrace

Native:

- Shopify (oficiální app re-launched 2023)
- WooCommerce (Mailchimp for WooCommerce plugin)
- Magento / Adobe Commerce
- BigCommerce
- Squarespace Commerce
- Wix Stores
- PrestaShop

E-commerce platformy přenášejí: orders, products, customers, abandoned carts, browse data.

### 10.2 E-commerce specifické featury

- **Product recommendations** – AI doporučení v emailech (Standard+)
- **Abandoned cart automation** – generic i product-specific
- **Browse abandonment** – kontakt prohlížel produkt, neorderoval
- **Post-purchase follow-up** – delay → review request, cross-sell
- **Back-in-stock alerts** – form + trigger
- **Customer journey based on order count** – first-time vs. repeat customers
- **Promo codes** – generování unikátních kódů per kontakt (Shopify integrace)
- **Order notifications** – transactional přes Mandrill

### 10.3 E-commerce reporting

- Revenue per email
- Revenue per audience
- Top-performing products
- New vs. returning customer ratio
- **Customer Lifetime Value (CLV)** predikce
- **Purchase likelihood / churn risk** scoring

---

## 11. AI a Intuit Assist

Od akvizice Intuitem (2021) Mailchimp postupně integruje AI – sjednoceno pod brand **Intuit Assist** (beta).

### 11.1 Intuit Assist – funkce (Standard, Premium, Legacy plány)

- **Email Content Generator** – z promptu vygeneruje subject + tělo
- **Subject Line Helper** – návrhy a hodnocení šance na otevření
- **Content Optimizer** – analyzuje stávající email, doporučuje úpravy (tone, length, structure)
- **Creative Assistant** – generuje brand-aligned designy z URL webu
- **AI Image generation** (přes integrované providery)
- **Audience insights** – AI sumáře nad daty

### 11.2 Předikční modely (Standard+)

- **Customer Lifetime Value (CLV)**
- **Purchase Likelihood** – pravděpodobnost nákupu v X dnech
- **Churn Risk** – High / Medium / Low
- **Predicted Demographics** – odhad věku a pohlaví (z chování, ne ze samodeklarace)
- **Send Time Optimization** – ML predikce nejlepšího času

### 11.3 Limitace

- Intuit Assist je **jen v angličtině, španělštině, portugalštině** (pro Premium); pro Standard jen anglicky
- Beta status; funkce se mění
- Není dostupné ve všech zemích (Anthropic-style restrictions per region)

---

## 12. Reports & Analytics

### 12.1 Campaign Report – plné metriky

- **Delivery:** Sent, Successful deliveries, Bounce rate (hard/soft)
- **Engagement:** Opens (unique + total), Open rate, Last opened, Click rate (unique + total)
- **Click map** – heatmap nad emailem
- **Top links clicked**
- **Subscriber activity** – kdo kdy otevřel/klikl
- **Unsubscribes / Complaints (spam reports)**
- **Forwarded count / Social shares**
- **Geo-tracking** – mapa otevření
- **Device breakdown** – mobile vs. desktop, email client
- **24-hour performance chart**

### 12.2 E-commerce report

- Total revenue from campaign
- Orders generated
- Average order value
- New vs. returning customers
- Top products

### 12.3 Audience report

- Growth chart (sign-ups vs. unsubscribes)
- Top sources
- Subscriber demographics
- Geo distribution
- Engagement breakdown (highly engaged → cold)

### 12.4 Comparative Reporting (Premium)

- Side-by-side porovnání kampaní
- Custom benchmark groups (vlastní + průmysl)
- Multi-account reporting (pro agentury)

### 12.5 Industry Benchmarks

Mailchimp publikuje globální benchmarky podle industry (e-commerce, education, finance atd.) – přístupné v UI a periodicky.

### 12.6 Custom reports & exports

- CSV export reportů
- Scheduled reports via email (Premium)
- API přístup ke všem report datům

### 12.7 Integrace s GA / Pixely

- Google Analytics 4 link tracking
- Facebook Pixel
- Custom UTM parameters

---

## 13. Deliverability & Authentication

### 13.1 Sending infrastruktura

- **Shared IP pools** (default pro všechny plány)
- **Dedicated IP** – Premium / Mandrill; podmínky:
  - min. **5 000 emailů/den × 3 dny v týdnu**
  - 1 dedicated IP zvládne až 500 000 emailů/den
- **Edge servers** – globální PoPs pro rychlost
- **Feedback loops (FBL)** – Mailchimp automaticky řeší s ISP

### 13.2 Autentizace

| Protokol  | Mailchimp setup                                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **SPF**   | Mailchimp používá vlastní return-path → SPF alignment vždy fails; **není potřeba upravovat váš SPF** kvůli DMARC (DMARC projde přes DKIM) |
| **DKIM**  | 2× CNAME na váš sending domain (k1.\_domainkey, k2.\_domainkey)                                                                           |
| **DMARC** | 1× TXT na \_dmarc.yourdomain; doporučeno start na p=none, pak quarantine/reject                                                           |
| **BIMI**  | Možné po splnění DMARC reject + verified logo (SVG)                                                                                       |
| **Entri** | Automated DNS setup integrace (encrypted login do DNS providera)                                                                          |

### 13.3 Domain verification vs. authentication

- **Verification** – jednorázový email-ownership check, povinné
- **Authentication** – DKIM + DMARC, doporučené, od **února 2024 povinné pro odesílatele 5000+ emailů/den na Gmail/Yahoo**

### 13.4 List hygiene

- **Hard bounces** → automaticky Cleaned (odstraněno)
- **Soft bounces** → po opakování taky Cleaned
- **Spam complaints** → automaticky Unsubscribed + reportováno
- **Není zabudované email verification** (G2 hodnocení 0/5 v této kategorii) – nutné použít externí tool (NeverBounce, Prospeo, Kickbox)

### 13.5 Compliance s Gmail/Yahoo 2024+ pravidly

- Authentication SPF + DKIM + DMARC
- **One-click unsubscribe header** (RFC 8058) – Mailchimp automaticky implementuje
- Spam complaint rate **< 0.3 %** (cílí < 0.1 %)
- Functional unsubscribe do 2 dnů – Mailchimp řeší okamžitě

### 13.6 Známé deliverability problémy

- Shared IP poolu klesá kvalita (2024–2026 user complaints)
- SPF alignment fail je „by design" → některé DMARC strict policies mohou hatit
- Double opt-in confirmation emaily někdy končí ve spamu (Yahoo)
- Bez vlastní domain authentication → emaily jdou „via mailchimp.com"

---

## 14. API, Webhooks a integrace

### 14.1 Marketing API (v3.0)

Současná stabilní verze. Base URL: `https://<dc>.api.mailchimp.com/3.0/`

- Autentizace: API key (basic auth) nebo OAuth2
- Rate limit: 10 simultaneous connections per account
- Datacenter (`<dc>`) z API key suffixu (např. `us19`)

#### Hlavní endpointy

| Resource                                                      | Operace                                                   |
| ------------------------------------------------------------- | --------------------------------------------------------- |
| `/lists` (audiences)                                          | CRUD audience, member operations                          |
| `/lists/{id}/members`                                         | Add/update/delete subscriber, tags, merge fields          |
| `/lists/{id}/segments`                                        | Manage segments                                           |
| `/lists/{id}/interest-categories`                             | Manage groups                                             |
| `/lists/{id}/signup-forms`                                    | Form management                                           |
| `/lists/{id}/webhooks`                                        | Subscribe to events                                       |
| `/campaigns`                                                  | Create, schedule, send campaigns                          |
| `/campaigns/{id}/content`                                     | Set HTML/template                                         |
| `/automations`                                                | Legacy Classic Automations (CRUD, start, pause, archive)  |
| `/customer-journeys/journeys/{id}/steps/{id}/actions/trigger` | Trigger Automation Flow step pro kontakt                  |
| `/reports`                                                    | Campaign reports, click details, open details, e-commerce |
| `/batches`                                                    | Bulk operations (max 500 ops per batch, async)            |
| `/lists/{id}/members/{email}/events`                          | Custom events – trigger flows                             |
| `/ecommerce/stores`                                           | Manage connected stores (orders, products)                |
| `/ping`                                                       | Health check                                              |

### 14.2 Webhooks

- Subscribe / unsubscribe / profile update / email change / cleaned / campaign sent
- POST na vlastní endpoint
- Batch webhooks pro bulk operace

### 14.3 Transactional (Mandrill) API

- Oddělené API: `https://mandrillapp.com/api/1.0/`
- `messages/send` (regular) vs. `messages/send-template`
- Events webhooks (28 typů: sent, opens, clicks, bounces, rejects, spam, soft_bounce, hard_bounce, blacklisted, unsub atd.)
- Inbound API – přijímání emailů + parsování

### 14.4 SDK / klientské knihovny

Oficiální:

- Node.js
- Python
- PHP
- Ruby
- .NET

### 14.5 Native integrace (300+, údaj G2/2026)

Vybrané:

- **E-commerce:** Shopify, WooCommerce, BigCommerce, Magento, Squarespace, Wix
- **CRM:** Salesforce, HubSpot, Zoho, Pipedrive
- **CMS:** WordPress, Drupal, Webflow, Wix
- **Forms:** Typeform, Jotform, Google Forms, SurveyMonkey, Wufoo
- **Analytics:** Google Analytics, Mixpanel
- **Ads:** Facebook/Meta Ads, Google Ads, Instagram
- **Events:** Eventbrite, Cvent
- **Booking:** Calendly, Acuity
- **Productivity:** Slack, Google Calendar, Trello, Asana
- **iPaaS:** Zapier, Make (Integromat), Workato, Tray.io

### 14.6 Mailchimp Mobile App

- iOS a Android nativní apps
- Compose & send campaigns
- Reports a stats
- Subscriber management
- Push notifications pro real-time stats

---

## 15. Websites & Domains

Mailchimp se snaží být víc než email tool – nabízí:

### 15.1 Mailchimp Websites

- **Free plan:** základní jednostránkový web
- **Core plan:** $10/měsíc – custom doména, 24/7 podpora, 3 seats
- Drag-and-drop builder
- Connect domain (nákup přes Mailchimp nebo registrace)
- SSL automaticky

### 15.2 Domains

- Nákup domain přímo (Mailchimp Domain Registrar)
- Connect existing domain pro email + landing page + website

### 15.3 Stores (nyní v útlumu)

- E-commerce funkce uvnitř Mailchimp – v 2023–2024 omezeny, primárně pushuje integraci s Shopify/WooCommerce

### 15.4 Content Studio

- Centralní úložiště pro brand assets
- Connect Google Drive, Dropbox, Adobe Creative Cloud, Instagram, Canva
- Auto-resize obrázků
- Brand kit (barvy, fonty, logo)

---

## 16. Compliance, GDPR

### 16.1 GDPR

- **GDPR forms** – speciální typ form s explicitními consent checkboxy
- Subscriber má v Preference Centeru tlačítka: **Pause**, **Update**, **Forget me**
- **Right to be forgotten:** Audience → Compliance → Permanently delete contact (vymaže veškerá data)
- **Data Processing Agreement (DPA)** – Mailchimp jako processor
- **EU–US Data Privacy Framework** – cert
- Servery primárně v USA, datový transfer řešen DPA + DPF

### 16.2 CAN-SPAM / CASL / TCPA

- Povinný unsubscribe link v každé kampani
- Physical mailing address v patičce (povinné)
- TCPA pro SMS (US) – explicit opt-in, time-of-day restrictions

### 16.3 Archive & Forward

- **Email archive** – veřejně dostupná URL každé sent kampaně (`*|ARCHIVE|*`)
- **Forward to a friend** – built-in funkce, trackováno
- **Archive page** per audience – seznam všech sent emailů

### 16.4 Two-factor authentication

- 2FA pro user accounts (TOTP, SMS, security key)
- Required pro Owner u Premium plánů
- Mailchimp Authenticator app (vlastní) + 3rd party support

### 16.5 Activity / Audit log

- Limited audit log – kdo co kdy poslal
- Není plnohodnotný audit pro enterprise governance (G2 mention jako weakness)

---

## 17. Limity a nedostatky

### 17.1 Často zmiňované problémy (G2, Capterra, Reddit)

| Problém                        | Detail                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| **Cena**                       | Skok mezi tiery, počítání unsubscribed                                              |
| **Tier rounding**              | Vždy nahoru                                                                         |
| **Limited Features**           | 58 G2 zmínek v 2026                                                                 |
| **Missing Features**           | 55 G2 zmínek (chybí: e-mail verification, granular permissions, A/B na automations) |
| **Customer support**           | Phone jen na Premium                                                                |
| **Free plan reductions**       | 2022: 2 000 → 2023: 500 → 2026: 250 kontaktů                                        |
| **Multi-step automation**      | jen Standard+ od 2025                                                               |
| **No custom roles**            | jen 5 fixních rolí                                                                  |
| **No audit log (granular)**    | žádný compliance-grade logging                                                      |
| **Shared IP quality**          | klesá s růstem userbase                                                             |
| **Žádné multibrand prostředí** | jen audiences, ne brand-level segregace                                             |
| **Cancelace**                  | musí Admin/Owner, žádný self-service v US v některých case-ech                      |

### 17.2 Co Mailchimp neumí (per květen 2026)

- **Email address verification** vestavěná (G2: 0/5)
- **Custom user roles / granular permissions**
- **Per-audience permissions** (user buď vidí vše, nebo nic)
- **Native cold-email features**
- **WhatsApp** kanál
- **Web push notifications**
- **In-app messaging**
- **Native A/B testing v Automation Flows** (jen v regular campaigns + percentage split)
- **Český / slovenský / polský UI**
- **Dynamic IP routing** (multi-region delivery)

### 17.3 Migrační překážky

- Export kontaktů: snadný (CSV via Audience → Export)
- Export automation flows: **nelze** – musí se znovu postavit
- Export templates: jen jako HTML kód
- Webhook history: omezeně

---

## 18. Shrnutí: Pro koho a proti komu

### Mailchimp je dobrá volba pokud

- Začínáte s email marketingem a chcete osvědčenou značku
- Máte malou až střední listu (< 50K kontaktů)
- Posíláte typické newslettery + jednoduchou automation
- Potřebujete širokou integrační síť (Shopify, WooCommerce, WordPress)
- Cení si si polished UI a velkého community

### Mailchimp není dobrá volba pokud

- Máte 50K+ kontaktů (cena letí nahoru)
- Chcete pokročilé automation s minimální cenou (lepší ActiveCampaign, Brevo)
- Pracujete primárně v češtině/slovenštině/polštině (žádná lokalizace UI)
- Potřebujete granular permissions / multi-brand setup (Klaviyo / Customer.io)
- Vaše hlavní use-case je e-commerce a Shopify (Klaviyo je tam silnější)
- Velký objem transactional emailů (Postmark, SendGrid, AWS SES levnější)

---

_Dokument zpracován z veřejně dostupných oficiálních zdrojů Mailchimpu a renomovaných analytických webů. Pro nejaktuálnější ceny vždy ověřit na mailchimp.com/pricing._
