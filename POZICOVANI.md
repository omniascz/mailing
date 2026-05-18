# Pozicování — Mailforge / ForgeMsg

> Strategický dokument: kam Mailforge patří na trhu, proti komu soutěží, čím vyhrává.
> Status: pracovní; revidovat čtvrtletně.
> Autor: omniascz@gmail.com
> Datum: 2026-05-18

---

## TL;DR

**Mailforge** je **omnichannel messaging + lehký CRM** pro **CZ/SK SMB → EU mid-market → global**, postavený na **vlastní MTA infrastruktuře** s **AI nativní** integrací.

USP, které žádný velký hráč neposkytuje **současně**:

1. **CZ/SK lokalizace na úrovni jazyka** (skloňování 7 pádů, gender inference, vocative) — nikdo z globálních ne, lokální (EcoMail, SmartEmailing) jen částečně
2. **Omnichannel z jednoho dashboardu** (email + SMS + voice + WhatsApp + push) — EcoMail/SmartEmailing nemá; Mailchimp/MailerLite jen email; HubSpot drahý a B2B-only
3. **AI voice robot vestavěný** — nikdo na CZ/SK trhu, Twilio AI je B2B/dev-only
4. **HLR lookup integrace** — unikátní pro Východní Evropu, validace telefonních čísel před SMS kampaní
5. **Vlastní MTA + diverzifikované IP poole** — vyšší deliverability než shared-IP nástroje (MailerLite na shared, EcoMail částečně)
6. **GDPR-native** — DPA, sub-processor list, EU compute (Hetzner DE/FI + Vercel EU edge), CZ právní compliance vestavěná

**Pozice ve 3 vlnách:**

- **Vlna 1 (Roky 1–2):** CZ + SK SMB (10–500 zaměstnanců). Cíl: 200 platících klientů × průměrně 1 500 Kč/měs = **300k Kč MRR** do 18 měsíců.
- **Vlna 2 (Roky 2–3):** Polsko, Maďarsko, Rakousko, Slovinsko — V4+. Lokalizace na polský trh (PL je 4× větší než CZ).
- **Vlna 3 (Roky 3+):** EU mid-market (Brevo/MailerLite konkurence) + global s niche (e-commerce, eventy, fitness/wellness chain).

---

## 1. Trh & TAM

### 1.1 Velikost trhu

| Region | TAM email marketing SaaS | TAM omnichannel | Naše addressable share |
|---|---|---|---|
| **ČR** | ~250 mil. Kč/rok | ~600 mil. Kč/rok | 5–10 % do 5 let realistická |
| **SK** | ~80 mil. Kč/rok | ~200 mil. Kč/rok | 3–8 % |
| **V4+ (PL, HU, AT, SI)** | ~1.5 mld. Kč | ~3.5 mld. Kč | 0.5–2 % |
| **EU (vyjma V4)** | ~80 mld. Kč | ~150 mld. Kč | 0.01–0.1 % (niche only) |

Globální MarketingTechnology trh: ~$500 mld., omnichannel customer engagement segment ~$80 mld.

**Závěr:** CZ+SK trh sám o sobě je dost na **financování runway pro ~5 let** plus team 5 lidí. EU expansion je upside, ne nutnost pro break-even.

### 1.2 Typický klient (ICP — Ideal Customer Profile)

**Primary (Vlna 1, CZ/SK SMB):**

- E-commerce s 10k–200k registrovaných zákazníků (Shoptet, Shopify, WooCommerce)
- Fitness studia / wellness chainy (PulseUp-typ klientů — již máš návaznost)
- Eventy / divadla / koncert venues (Ticketarium-typ klientů — má návaznost)
- B2B SaaS s ~500–5 000 leads
- Restaurace s rezervačním systémem a věrnostním programem
- Cestovní agentury

**Volume profile:**
- Kontakty: 5 000 – 100 000
- Emaily/měs: 5 000 – 200 000
- SMS: 0 – 20 000 (drop-shipping reminders, marketing)
- Voice (Vlna 2+): debt collection, schůzková připomenutí, surveys

**Annual contract value (ACV):**
- Starter (≤10k kontaktů, ≤50k emailů): 19 € / ~500 Kč
- Pro (≤50k kontaktů, ≤250k emailů): 79 € / ~2 000 Kč
- Business (≤200k kontaktů, ≤1M emailů): 199 € / ~5 000 Kč
- Pass-through SMS/Voice ~2× markup

**Cíl Vlna 1:** 100 Starter + 80 Pro + 20 Business = 100 × 500 + 80 × 2 000 + 20 × 5 000 = **310k Kč MRR** = **3.7M Kč ARR** (~140k €).

---

## 2. Konkurenční landscape

### 2.1 Lokální (CZ/SK)

#### EcoMail (Smailo s.r.o.)

- **Pozice:** Dominantní CZ email marketing platform
- **Klienti:** ~10k aktivních
- **Cena:** Free 200 kontaktů → Premium 1 200 Kč/měs / 10k kontaktů
- **Silné:** Český support, levné, fungující doručitelnost, etablovaná značka
- **Slabé:** **Jen email** (žádné SMS/voice/WhatsApp), zastaralé UI, slabá automatizace, žádné AI features
- **Risk pro nás:** Nejtěžší konkurent v Vlně 1 — známí, levní, věrný uživatel
- **Jak vyhrát:** Omnichannel + AI + modernější UX + ne dražší než ekomail v Starter tieru

#### SmartEmailing (Imper.cz)

- **Pozice:** B2B email + marketing automation
- **Klienti:** ~5k
- **Cena:** 690–4 990 Kč/měs podle volume
- **Silné:** Marketing automation (workflows), B2B integrace (Raynet, Pipedrive)
- **Slabé:** Dražší než EcoMail, UI z let 2018, žádný omnichannel, slabé AI
- **Jak vyhrát:** Lepší workflow builder, omnichannel, AI features za stejnou cenu

#### Mailkit (Apparel.cz)

- **Pozice:** Enterprise email, high-deliverability claim
- **Klienti:** velcí brandi (O2, ČSOB, Czech Airlines)
- **Cena:** custom, od ~10k Kč/měs
- **Silné:** Deliverability, IPs, certifikace, dlouho na trhu
- **Slabé:** Drahé, B2B only, žádné omnichannel, archaické UI
- **Jak vyhrát:** **Nesoupeřit přímo** v Enterprise; vzít jejich SMB exoduses

#### Anabix CRM, Raynet CRM

- **Pozice:** Lokální CRM, email je add-on
- **Silné:** CRM features, lokalizace
- **Slabé:** Email je slabý, žádný omnichannel, žádné AI
- **Jak vyhrát:** Integrovat se s nimi jako bi-directional sync; jejich klienti si od nás kupují email/SMS

### 2.2 EU

#### Brevo (ex-Sendinblue, FR)

- **Pozice:** EU lídr omnichannel pro SMB (~500k klientů globálně)
- **Cena:** Free → €19/měs Starter → €49 Business → €69+ Enterprise
- **Silné:** Email + SMS + WhatsApp + chat + landing pages + CRM lite; EU GDPR; široké funkce; transaction emails (SMTP relay) silné
- **Slabé:** Generic CZ překlad, žádná hluboká lokalizace, slabší voice (jen Twilio relay), UI overwhelming
- **Risk pro nás:** Pokud nás Vlna 2 (PL, HU) zavalí, Brevo je tam silný
- **Jak vyhrát:** CZ/SK/PL hluboká lokalizace, dedikovaný voice robot, AI features, levnější Starter

#### MailerLite (LT)

- **Pozice:** Email marketing pro creators/SMB, "krásné UI"
- **Cena:** Free 1 000 kontaktů → €9/měs → škála
- **Silné:** Nejhezčí UI v segmentu, levné, dobrá automatizace, transactional API (MailerSend)
- **Slabé:** Jen email (žádný SMS/voice/WhatsApp); slabší pro B2B; deliverability na shared IPs občas problém
- **Jak vyhrát:** Omnichannel, lepší B2B features (CRM, workflow), srovnatelný UX

#### Mailjet (FR, součást Sinch)

- **Pozice:** Transactional + marketing, vyšší B2B
- **Cena:** Free 6k emailů/měs → €15+/měs
- **Silné:** Silné transactional API, SOC2
- **Slabé:** Slabší marketing UI, žádný omnichannel z jedné platformy
- **Jak vyhrát:** Lepší marketing UX, omnichannel, AI

#### MailerSend (LT, Mailerlite sister)

- **Pozice:** Pure transactional / dev-focused
- **Cena:** Free 3k → $35+/měs
- **Silné:** Dev DX, dokumentace
- **Slabé:** Jen transactional, žádný marketing
- **Jak vyhrát:** Kombinujeme oba use cases v jedné platformě

### 2.3 Globální

#### Mailchimp (Intuit)

- **Pozice:** Legendarní brand, široký záběr (email + landing + CRM lite + commerce)
- **Cena:** Free 500 → $13+/měs škálovaně, drahé na velkém objemu
- **Silné:** Brand recognition, vyzrálé features, ekosystém
- **Slabé:** Po akvizici Intuitem snížená inovace, drahé nad 10k kontakty, žádný SMS/voice, slabý EU GDPR (US company), nulová CZ lokalizace
- **Jak vyhrát:** Pro CZ trh — lokalizace + cena. Pro globál — niche segmenty.

#### Klaviyo (US, IPO)

- **Pozice:** E-commerce email + SMS lídr, založeno na předpovědích chování
- **Cena:** Free 250 → $20+/měs do $1 200+ na velké objemy
- **Silné:** Nejlepší e-commerce features (product feeds, predikované segmenty), Shopify integrace
- **Slabé:** Drahé, jen e-commerce niche, omezené pro B2B, žádný voice, US GDPR overhead
- **Jak vyhrát:** Niche (eventy, fitness, restaurace), CZ lokalizace, omnichannel beyond email+SMS

#### HubSpot

- **Pozice:** All-in-one B2B CRM + marketing + sales + service
- **Cena:** Free → $50/měs (Starter) → $890+ Pro → enterprise
- **Silné:** Široký scope, integrace, brand
- **Slabé:** Drahé jakmile naroste velikost (typicky $5k+/měs), B2B-focused, slabší email engine sám o sobě
- **Jak vyhrát:** Lepší email/SMS/voice za zlomek ceny; integrace s nimi jako "email/SMS provider for HubSpot"

#### ActiveCampaign

- **Pozice:** Marketing automation pro SMB, "Mailchimp + better automation"
- **Cena:** $15+/měs
- **Silné:** Automation, B2B features, dobré integrace
- **Slabé:** UI klesající, slabší omnichannel
- **Jak vyhrát:** Modernější UX, voice robot, lepší AI

### 2.4 Pure ESP / dev-focused (Mailgun, Postmark, Sendgrid)

- **Pozice:** Transactional / API-first, ne marketing UI
- **Jak vyhrát:** **Nesoupeřit** — komplementární. Naši klienti potřebují marketing platform, ne jen API.
- **ALE** — vlastní MTA stack znamená, že **až jsme za inflexním bodem** (Phase 9+), můžeme nabídnout **levný transactional API tier** jako pull-through pro vývojáře. Mailgun je drahý — můžeme nabídnout 50% slevu při srovnatelné deliverability.

---

## 3. Pricing strategie

### 3.1 Konkurence ceny (1M emailů/měs srovnání)

| Provider | Cena za 1M emailů/měs | Kontakty included | Poznámka |
|---|---|---|---|
| **EcoMail** | ~5 000 Kč | 50 000 | Jen email |
| **SmartEmailing** | ~6 000 Kč | 50 000 | + workflow |
| **Mailchimp Standard 50k** | ~$200 (~5 000 Kč) | 50 000 | Globální brand |
| **MailerLite Advanced 50k** | ~$120 (~3 000 Kč) | 50 000 | Jen email |
| **Brevo Business** | ~€69+ (~1 800 Kč) | unlimited (pay per send) | Omnichannel |
| **Mailgun Foundation 1M** | $700 (~17 500 Kč) | API only | Transactional |
| **Sendgrid Pro 1.5M** | $89.95 (~2 200 Kč) | API only | Transactional |
| **AWS SES** | $100 (~2 500 Kč) | API only | Raw, vlastní setup |
| **Mailforge Business (návrh)** | **199 € (~5 000 Kč)** | 200 000 | **Omnichannel + AI + lokalizace** |

**Strategie:**

- Není to závod o nejlevnější — být na úrovni Brevo, lehce pod EcoMail
- Hodnota = **omnichannel + AI + lokalizace**, ne nejlevnější email
- Free tier povinný (akvizice): 1 000 kontaktů, 5 000 emailů/měs, žádné SMS/voice
- **Annual discount** 17 % (typický SaaS standard)

### 3.2 Cenová struktura (zachovat z ROADMAP)

| Plan | Cena/měs | Kontakty | Emaily/měs | SMS | Voice | AI | Dedicated IP |
|---|---|---|---|---|---|---|---|
| **Free** | 0 Kč | 1 000 | 5 000 | — | — | 10/den | — |
| **Starter** | 500 Kč / $19 | 10 000 | 50 000 | pay-per-use | — | 50/den | — |
| **Pro** | 2 000 Kč / $79 | 50 000 | 250 000 | pay-per-use | $0.05/min | 200/den | + $20 |
| **Business** | 5 000 Kč / $199 | 200 000 | 1 000 000 | pay-per-use | $0.05/min | 500/den | + $20 |
| **Enterprise** | custom | unlimited | unlimited | volume rates | enterprise | unlimited | included |

**Pass-through náklady:**
- SMS: skutečný cost × 2 (CZ ~0.50 Kč → 1 Kč/SMS)
- WhatsApp business: meta cena × 2
- Voice robot: Twilio cost + našich $0.02/min markup
- HLR lookup: $0.003 cost → $0.005 sell

---

## 4. USP / poziční výroky

### 4.1 Hlavní message

> **"Jeden nástroj pro všechny zprávy. Email, SMS, voice, WhatsApp.
> Pro CZ a SK trh, ne globální generic."**

### 4.2 Sub-výroky podle persony

**E-commerce manager:**
> "Skončete s pěti samostatnými nástroji. Email kampaně, abandoned cart SMS, reminder volání — všechno z jednoho dashboardu, lokalizované do češtiny i s 7 pády."

**Fitness/wellness chain (PulseUp-typ):**
> "Notifikace o lekci, připomenutí termínu, marketing nabídky. Email tam, kde si klient čte. SMS tam, kde nečte. Volání tam, kde je důležitější."

**Event/divadlo (Ticketarium-typ):**
> "Připomeňte návštěvníkovi koupené vstupenky emailem ráno, SMS dvě hodiny před, a po představení získejte feedback krátkým hovorem od AI agenta."

**B2B SaaS:**
> "Marketing automation, transactional, in-app — všechno jedno API a jedna platforma. Bez Mailgunu vedle Mailchimpu vedle Twilia."

### 4.3 Negativní pozicování (čím NE jsme)

- ❌ NE "next Mailchimp" — Mailchimp je email-only, my omnichannel
- ❌ NE "AI marketing tool" — AI je doplněk, ne core
- ❌ NE "B2B sales platform" — to je Apollo / Outreach / HubSpot sales hub
- ❌ NE "transactional email API" — to je Mailgun / Postmark (transactional je side feature)

---

## 5. Go-to-market (Vlna 1, CZ/SK)

### 5.1 Pre-launch (Phase 9 — Týden 45–48)

- **Closed beta** 50 friendly klientů (PulseUp, Ticketarium klienti, network)
- Cíl: produkční validace, case studies
- Free roční licence pro beta + permanent 50% sleva
- Týdenní feedback call s každým

### 5.2 Public launch (Phase 10)

| Kanál | Investice | Očekávaný outcome |
|---|---|---|
| **Product Hunt launch** | 0 Kč | 200–500 signups, awareness, $0–500 MRR |
| **Lupa.cz, CzechCrunch PR** | 0–20 000 Kč | 1–3 články, signups z tech komunity |
| **SEO blog** | čas (Claude content) | Long-term hlavní akviziční kanál |
| **Affiliate program** | 30 % první rok, 10 % thereafter | Drahé ale skálovatelné |
| **Comparison pages** ("Mailchimp vs Mailforge", …) | čas | SEO + buying intent |
| **CZ Shoptet/Comgate partnership** | Revenue share | Distribuce přes e-commerce platformy |
| **Konference (Reshoper, Marketing Festival)** | 50–100 000 Kč | Brand awareness |
| **Cold outreach** B2B na specific niches | čas | Volume sensitive |
| **LinkedIn/FB ads** (CZ targeting) | 10–30 000 Kč/měs | Acquisition test |
| **Existing PulseUp + Ticketarium klienti** | 0 Kč | Cross-sell, warm intro |

### 5.3 Důležité partnership v CZ

- **Shoptet** (#1 CZ e-commerce platform): aplikace v marketplace
- **Comgate** (platby): bundled email/SMS pro merchants
- **CzechCrunch / Lupa.cz**: editorial coverage
- **VŠE / FIT ČVUT karierní centra**: akvizice startups, hiring talent

### 5.4 Cíle Vlna 1 (18 měsíců po launch)

| Quartal | MRR Kč | Klienti platící | Klíčové milestone |
|---|---|---|---|
| Q1 | 30k | 30 | Public launch, first 30 paying |
| Q2 | 80k | 70 | Product-market fit validated |
| Q3 | 150k | 110 | Affiliate program live, partnerships |
| Q4 | 250k | 170 | Shoptet integration live |
| Q5 | 320k | 200 | **Cíl Vlna 1 splněn** |
| Q6 | 400k | 240 | Polské UI lokalizace start |

---

## 6. Rizika a mitigace

### 6.1 Risk: AWS-style ban na Hetzneru

- **Trigger:** Klient pošle masivní spam, Hetzner odpojí naše IPs, případně suspendne celý účet
- **Pravděpodobnost:** střední (3/10) ale fatální dopad
- **Mitigace:**
  - ASN diversity (Hetzner + OVH + Vultr) od Phase 5
  - Twin account na sekundárním provideru jako disaster recovery
  - Striktní onboarding / content scanning / health score (viz `DELIVERABILITY.md`)
  - Právní team contract: explicit ban purchased lists, B2C cold, casino, krypto, CBD

### 6.2 Risk: EcoMail / SmartEmailing reakce

- **Trigger:** Lokální competitor sníží cenu, dodá omnichannel
- **Pravděpodobnost:** střední po Vlně 1 (5/10)
- **Mitigace:**
  - Time-to-market: být první s plný omnichannel + voice + AI
  - Hluboká lokalizace (7 pádů, gender) — náročné dohnat
  - Network effects: Shoptet/Comgate integrace, switching costs

### 6.3 Risk: Brevo / MailerLite EU push

- **Trigger:** Brevo otevře CZ kancelář, lokalizuje, sníží ceny
- **Pravděpodobnost:** nízká–střední (3/10)
- **Mitigace:**
  - Hyper-lokalizace (7 pádů — generický překlad to nezvládne)
  - Network: lokální partnership, lokální podpora česky 24/7
  - Niche segmenty kde Brevo není silný (fitness, eventy, gastronomy)

### 6.4 Risk: Anthropic API issues / cena

- **Trigger:** Anthropic změní cenu, výpadek, omezí features
- **Pravděpodobnost:** nízká (2/10)
- **Mitigace:**
  - `IAIProvider` abstrakce (viz `TECH_STACK.md` Active Risks)
  - Fallback na OpenAI / Mistral / lokální Llama pro non-critical features
  - Prompt caching pro nižší cost

### 6.5 Risk: Klíčový tým / solo dev burnout

- **Trigger:** 52 týdnů solo + Claude je obrovský commitment
- **Pravděpodobnost:** vysoká (7/10)
- **Mitigace:**
  - Realistický plán s týdenními cíli
  - Po Vlna 1 ($30k+ MRR) hire první kolegu (Czech-speaking)
  - Externí kontrakt (deliverability konzultant, právník, designer)
  - Mental health: pravidelná pauza, ne 7-day weeks

### 6.6 Risk: GDPR / DSA pokuta

- **Trigger:** Incident s dat zákazníků, ÚOOÚ pokuta
- **Pravděpodobnost:** nízká (2/10), ale fatální dopad
- **Mitigace:**
  - DPA s každým klientem od day 1
  - Sub-processor list aktualizovat
  - Data residency EU only (Hetzner DE/FI + Vercel EU edge)
  - Roční penetration test od Phase 9
  - SOC 2 Type II do Phase 11 (po launch)

---

## 7. Brand & messaging

### 7.1 Název

**Mailforge** (workspace) → **ForgeMsg** (interní brand z ROADMAP)?

**Doporučení:** Ujasnit jméno **PŘED public launch**. Mailforge je intuitivnější pro CZ trh (mail = email, forge = výrobna). ForgeMsg je generičtější, ale "Msg" jako koncovka může být branded jako omnichannel.

**Návrh:**
- Public brand: **Mailforge**
- Tagline CZ: *"Vykuté zprávy. Email, SMS, voice — vše v jednom."*
- Tagline EN: *"Forge your messaging. Email, SMS, voice — one platform."*
- Doména: `mailforge.io` (primary), `mailforge.cz`, `mailforge.sk`

### 7.2 Vizuální identita

- Primary color: tmavá oranžová / měďový odstín (forge metaphor)
- Typografie: Inter (UI) + JetBrains Mono (code/docs)
- Logo: stylizovaná kovadlina + envelope hybridní
- Tone: profesionální, technicky důvěryhodný, lokálně přátelský

### 7.3 Slogany podle segmentu

- E-com: *"Vykuté kampaně. Větší prodej."*
- Fitness: *"Připomenout. Motivovat. Vrátit."*
- Eventy: *"Od pozvánky až po feedback."*
- B2B: *"Marketing engine bez kompromisů."*

---

## 8. Roadmap pozicování (long-term)

| Rok | Fokus | Hlavní mark |
|---|---|---|
| **Rok 1 (2026)** | Foundations + closed beta | 50 beta klientů, $0–5k MRR |
| **Rok 2 (2027)** | CZ/SK launch, product-market fit | $30k MRR, 200 paying, partnerships |
| **Rok 3 (2028)** | V4+ expansion, AI dominance | $100k MRR, PL lokalizace, voice mainstream |
| **Rok 4 (2029)** | EU mid-market, vertical specialization | $300k MRR, Shoptet/PrestaShop ekosystém vertikální moduly |
| **Rok 5 (2030)** | Global niche (fitness, events, e-com EU) | $1M MRR, M&A target nebo Series A |

---

## 9. Open questions

- [ ] Jméno: Mailforge vs ForgeMsg vs jiné — final volba před Phase 9
- [ ] Cílový tier pro launch: Free + Starter only, nebo Free + Starter + Pro?
- [ ] Voice robot v MVP nebo až Vlna 2? Hardware/cost intensivní feature.
- [ ] HLR lookup jako paid add-on nebo bundled v Pro+?
- [ ] CZ accounting integrace (Pohoda, Money S3, ABRA) — must-have Vlna 1 nebo nice-to-have?
- [ ] Affiliate program v MVP nebo až po Phase 10?

---

## Související

- `FORGEMSG_ROADMAP.md` — kompletní 52-týdenní plán
- `TECH_STACK.md` — technologické volby
- `PIVOT_AWS_TO_HETZNER.md` — infrastructure pivot
- `DELIVERABILITY.md` — proč vlastní MTA dělá rozdíl

---

*Dokument vytvořen: 2026-05-18*
*Status: pracovní; revize po Phase 0 dokončení*
