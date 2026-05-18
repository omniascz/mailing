# Deliverability — Vlastní MTA na Hetzneru (a externí IP poolech)

> Doplňuje `FORGEMSG_ROADMAP.md` Fázi 3 (Email sending engine). Roadmap pokrývá kód a logiku; tento dokument pokrývá **fyzickou infrastrukturu reputace** — věci, které musí existovat mimo aplikační kód, jinak vlastní MTA nepřežije první týden v inboxu Gmailu.
>
> Předpoklad: pivot na Hetzner + Vercel (viz `PIVOT_AWS_TO_HETZNER.md`).
> Status: plán, status implementace tracking v `TODO.md` per úkol.

---

## Železné pravidlo

> **Reputace IP a domény jsou náš jediný marketingový asset.** Jakmile se IP spálí, nejen že přestane doručovat — nelze ji "vyčistit" během dnů. Trvá to týdny až měsíce a u Gmailu/Microsoftu může být doživotní.

Z toho plyne všechno, co následuje.

---

## 1. IP infrastruktura

### 1.1 Kolik IP potřebujeme

| Fáze | Mailů/měs | IP počet | Důvod |
|---|---|---|---|
| MVP (Týden 12–16) | <100k | 2 | Jedna pro warming, jedna pro test/transactional |
| Closed beta (Týden 45–46) | <500k | 4 | Marketing pool 2× + transactional 1× + warming 1× |
| Open beta (Týden 47–48) | <5M | 8 | Marketing pool 4× + transactional 2× + dedicated klienti 2× |
| Scale (Phase 10) | <50M | 16–32 | Multi-tenant izolace, ASN diversity, regional |

### 1.2 Kde IP brát

| Zdroj | Cena | Kvalita reputace | Risk |
|---|---|---|---|
| **Hetzner /29 subnet** k dedicated serveru | €5–8/měs | Smíšená (Hetzner AS24940 má ostatní bulk senders) | Sdílíme AS s neznámými sousedy |
| **OVH /29 nebo additional IPv4** | €3–5/IP/měs | Lepší než Hetzner pro EU bulk | Některé /16 už blacklistnuté |
| **Vultr additional IP** | $3/měs | Slušné, ne výborné | US-heavy traffic |
| **Inception Hosting / Mailbaby** | $5–15/IP/měs | Specialized email-friendly | Drazší, ale stojí to za to pro warming |
| **Vlastní /24 leasing přes IPv4.global** | $0.50–1/IP/měs (lease) | Nejlepší — vlastní reputace od 0 | Setup složitý, vyžaduje BGP + ASN registraci |

**Doporučená skladba pro Mailforge:**

- **MVP**: 2× Hetzner IPv4 (z /29 subnetu k dedicated serveru) — €10/měs
- **Growth**: 8× IPs napříč **3 ASN**:
  - 4× Hetzner (AS24940) v DE
  - 2× OVH (AS16276) v FR
  - 2× Vultr (AS20473) v DE
- **Scale**: 24+ IPs napříč 4 ASN + vlastní /24 pro top klienty

**Proč AS diversity:** Spamhaus a další blacklisty operují per-IP, ale Gmail/Microsoft sledují AS-level patterns. Pokud všech 16 sender IPs sedí v jednom /24 z jednoho AS, posíláš "snowshoe" signál a Gmail tě penalizuje hromadně.

### 1.3 rDNS / PTR — povinné

**Každá** sending IP musí mít forward + reverse DNS shoda:
- A: `mta-1.mailforge.io → 49.13.X.X`
- PTR: `49.13.X.X → mta-1.mailforge.io`

Bez tohohle Outlook a Gmail odmítnou 5xx s `policy reasons`. Hetzner umožňuje PTR setup přes Robot UI — vyřídit Týden 2.5.

### 1.4 IP pool struktura

```
Marketing pool A           Marketing pool B          Transactional pool
(warm, primary)            (warm, secondary)         (high engagement)
- 49.13.x.1 mta-1a-1       - 49.13.x.5 mta-1b-1      - 49.13.x.9  mta-2a-1
- 49.13.x.2 mta-1a-2       - 49.13.x.6 mta-1b-2      - 49.13.x.10 mta-2a-2
- 49.13.x.3 mta-1a-3       - 49.13.x.7 mta-1b-3      
- 49.13.x.4 mta-1a-4       - 49.13.x.8 mta-1b-4      Warming pool
                                                      (rotates in/out)
                                                      - 49.13.x.11 mta-wm-1

Dedicated klienti (Pro Plan add-on):
- 49.13.x.20+ — 1 IP per klient, klient platí $20/měs
```

**Pravidla použití:**
- Marketing → marketing pool, round-robin
- Transactional (welcome, password reset, receipt) → transactional pool (vysoká engagement udržuje reputaci)
- Warming → warming pool dokud nedosáhne 10k/den, pak se přesune do marketing
- **Nikdy nemíchat:** marketing email odeslaný přes transactional IP otráví reputaci

### 1.5 Frekvence rotace

- **NE** round-robin per email — Gmail to čte jako anomálii
- **ANO** sticky per (campaign, ISP) — Gmail kampaň jde celá přes IP X, Outlook kampaň přes IP Y
- IP allocation: hash(`campaign_id`) mod len(pool_for_ISP) → deterministická volba

---

## 2. Autentizace domén

### 2.1 Sender domény — dvě cesty

| Cesta | Kdo posílá | DKIM signing | DMARC alignment |
|---|---|---|---|
| **Subdomain delegation** | `klient.send.mailforge.io` od klienta | Naše klíče, naše DKIM | Naše DMARC; klient nemusí měnit svoje DNS |
| **Klientova vlastní doména** | `newsletter.klientova-firma.cz` | Klient přidá CNAME → naše DKIM | Klient přidá SPF include + DMARC; my pošleme |

**Default:** klientova vlastní doména (lepší branding a deliverability). Subdomain delegation jako fallback pro klienty, co neumí editovat DNS.

### 2.2 DNS záznamy, které klient přidá

```dns
; SPF — autorizuje naše MTAs
klient-domena.cz.        TXT   "v=spf1 include:_spf.mailforge.io ~all"

; DKIM — kanonický CNAME na náš key
mf2026._domainkey.klient-domena.cz.   CNAME   mf2026._domainkey.mailforge.io.

; DMARC — minimální (quarantine; relaxed)
_dmarc.klient-domena.cz.    TXT   "v=DMARC1; p=quarantine; rua=mailto:dmarc@mailforge.io; ruf=mailto:dmarc-forensic@mailforge.io; pct=100; adkim=r; aspf=r"

; Return-Path / bounce subdomain
bounce.klient-domena.cz.    CNAME   bounce.mailforge.io.
```

### 2.3 DKIM klíče

- **2048-bit RSA** (NE 1024 — některé filtry ho přestanou akceptovat)
- **Rotace 1× ročně** — generovat nový selector `mfYYYY`, nasadit, čekat 14 dní, deaktivovat starý
- **Per-doména klient klíče** uloženy v Postgres, zašifrované přes app-level encryption (libsodium), root klíč v Doppleru
- **NE Ed25519 zatím** — Gmail to zatím nepodporuje pro DKIM

### 2.4 DMARC reporting

- `rua=` aggregate reports (denní, XML/ZIP, ~10–100/měs per větší klient)
- Parser: vlastní Node.js worker → Postgres `dmarc_reports` tabulka → Grafana dashboard
- `ruf=` forensic reports (raw bouncing emails) — méně providerů to posílá, ale když ano, ukazuje konkrétní spoofing
- **Postupně přitvrzovat policy:** `p=none` (60 dní) → `p=quarantine; pct=10` → `pct=50` → `pct=100` → `p=reject`

### 2.5 BIMI (pozdější fáze, Phase 6+)

- Vyžaduje Verified Mark Certificate (VMC) — $1 500/rok na klienta
- Nabízet jako add-on pro Enterprise plán
- DNS: `default._bimi.klient-domena.cz` TXT s URL na SVG logo

---

## 3. Feedback loops (FBL)

FBL = ISP nám reportuje "tenhle uživatel kliknul Mark as Spam".

| ISP | FBL Program | Setup | Co dělat s reporty |
|---|---|---|---|
| **Yahoo / AOL** | CFL (Complaint Feedback Loop) | Vyplnit formulář na `https://senders.yahooinc.com`, doložit DKIM+SPF, čekat 1–2 týdny | Auto-unsubscribe stěžovatele |
| **Microsoft (Outlook/Hotmail/Live)** | JMRP (Junk Mail Reporting) + SNDS (Smart Network Data Services) | Žádost na `https://sendersupport.olc.protection.outlook.com/snds/`, JMRP separátně | JMRP → unsubscribe. SNDS → dashboard s reputation per IP |
| **Apple iCloud / Me / Mac** | iCloud Postmaster (limited) | Vyplnit formulář, ale Apple zveřejnil jen omezené stats | Ručně sledovat bounce rate na @icloud.com, @me.com, @mac.com |
| **Comcast** | FBL via Cloudmark/Proofpoint | Žádost přes Cloudmark | Auto-unsubscribe |
| **Cox** | FBL přes Cloudmark | Žádost | Auto-unsubscribe |
| **Charter / Spectrum** | FBL via Cloudmark | Žádost | Auto-unsubscribe |
| **Google / Gmail** | **NE FBL** ❌ | Místo toho **Postmaster Tools** | Reputation dashboard per IP/doména |
| **Seznam.cz** | Žádný FBL | — | Manuálně sledovat bounce log na @seznam.cz |
| **Centrum.cz** | Žádný FBL | — | Manuálně sledovat |

**Krok 0 (Týden 14 v ROADMAP rozšíření):**

- Zaregistrovat FBL u všech provider který to poskytují
- Implementovat **ARF parser** (Abuse Reporting Format, RFC 5965)
- Endpoint `fbl@mailforge.io` přijímá zprávy → parser → `email_complaints` tabulka → trigger:
  - auto-unsubscribe kontakta
  - decrement org `health_score`
  - alert v dashboardu klienta
  - **pokud org complaint rate > 0.3 % za 24h → automatický pause kampaní** + ruční review

### 3.1 Gmail Postmaster Tools

Setup:
1. Verifikuj `mailforge.io` v Google Search Console (TXT DNS record)
2. Postmaster auto-přidá doménu po dosažení ~100 emailů/den z dané sender doiméně
3. Dashboard ukáže:
   - IP reputation (Bad / Low / Medium / High)
   - Domain reputation
   - Spam rate
   - Authentication success (DKIM/SPF/DMARC)
   - Delivery errors
   - Encryption rate

**Sledovat denně.** Alerting přes vlastní polling endpoint (Postmaster API není veřejné — scraping nebo manuální).

### 3.2 Microsoft SNDS

Po registraci dostáváš denně:
- Per-IP filtering rate
- Complaint rate
- Trap hits (spam trap = bývalá adresa které ISP nechal "naživu" pro detekci špatných seznamů)
- Sample message headers

**Trap hits = červený alarm.** Znamená že klient má buď purchased list nebo starý list. Okamžitě pozastav kampaň, kontaktuj klienta.

---

## 4. Multi-tenant izolace reputace

### 4.1 Problém

Jeden klient s purchased listem 50 000 adres pošle kampaň → 8 % complaint rate → Gmail nás zablokuje na úrovni domény `mailforge.io` a / nebo IP poolu → **všech 200 klientů přestane doručovat**.

### 4.2 Vrstvy izolace

| Vrstva | Mechanismus | Náklady | Kdy nasadit |
|---|---|---|---|
| 1. **Sender doména klienta** | Klient posílá z `newsletter.klient.cz`, ne z naší domény. Reputace domény je klientova. | $0 | Vždy (default) |
| 2. **DKIM doména klienta** | DKIM signing přes klientovu doménu (i když IP je naše). | $0 | Vždy (default) |
| 3. **Shared IP pool s engagement-based routing** | Klienti s vyšším engagement → premium IP; nový/podezřelí klienti → warming pool | $0 | Vždy |
| 4. **Health score per klient** | Skore = f(open_rate, bounce_rate, complaint_rate, list_age, growth_rate). Pod prahem → auto-throttle. | $0 | Od Týdne 14 |
| 5. **Dedikovaná IP (add-on $20/měs)** | Klient platí, dostane 1 IP exklusivně | base hardware + IP fee | Phase 6+ |
| 6. **Dedikovaný MTA node** (Enterprise) | Vlastní hardware + IP pool pro big-tier klienta | $200+/měs | Phase 9+ |

### 4.3 Health score algoritmus (návrh)

```
health_score = 100
  - 30 * max(0, bounce_rate - 0.02)         // penalty za bounce nad 2 %
  - 100 * max(0, complaint_rate - 0.001)    // ostrá penalty za complaint nad 0.1 %
  - 20 * max(0, 1 - open_rate / 0.10)       // penalty za open rate pod 10 %
  - 30 * list_age_under_30_days_pct         // penalty za seznam pod 30 dní starý
  + 10 * domain_authenticated                 // +10 za SPF+DKIM+DMARC

prahy:
  >= 80  → unrestricted (full speed, prime IP pool)
  60-79  → standard (default pool, normal throttle)
  40-59  → throttled (warming pool, 1000/h max, alert klientovi)
  < 40   → suspended (kampaně pozastaveny, vyžaduje ruční review)
```

Score se přepočítává hourly za rolling 7-day window. Implementace v ClickHouse materialized view.

### 4.4 Onboarding gating (povinná opatření pro nového klienta)

1. **Email verifikace** — klient potvrdí email
2. **Doménová verifikace** — DNS records musí být before send
3. **List origin attestation** — checkbox + krátký dotazník: kde seznam vznikl, jak staré, je opt-in?
4. **Pre-send list scan** — automaticky kontrola:
   - % známých spam traps (databáze od ZeroBounce)
   - % role-based addresses (info@, contact@) — over 20 % = warning
   - % free providers (@gmail, @seznam) vs business — vychylka může indikovat purchased B2B list
   - duplicates, syntax errors
5. **První kampaň: max 1 000 příjemců**, lock dokud nedoručí s <2 % bounce a <0.1 % complaint
6. **Druhá kampaň: max 5 000**
7. **Třetí: max 20 000**
8. **Poté: limit per plán**

---

## 5. IP warming — detailní schedule

Volíme **per ISP warming** místo uniform schedule. Důvod: Gmail je 5× přísnější než Yahoo.

| Den | Gmail/Google Workspace | Outlook/Live/Hotmail | Yahoo/AOL | Apple iCloud | Ostatní |
|---|---|---|---|---|---|
| 1–3 | 50 | 100 | 100 | 200 | 500 |
| 4–7 | 200 | 500 | 500 | 1 000 | 2 000 |
| 8–14 | 1 000 | 2 000 | 2 000 | 5 000 | 10 000 |
| 15–21 | 5 000 | 10 000 | 8 000 | 15 000 | 50 000 |
| 22–30 | 20 000 | 50 000 | 30 000 | 50 000 | unlimited |
| 31+ | unlimited (sledovat reputation) | unlimited | unlimited | unlimited | unlimited |

**Pravidla:**
- Pokud Gmail Postmaster reputation klesne na `Low` → **vrátit se o 1 týden zpět** v schedule
- Pokud bounce rate per ISP > 5 % v rámci 1h → pozastavit pro daný ISP na 30 minut, retry pomaleji
- Warming **jen smíšeným traffic** (klienti s dobrým engagement) — nikdy ne purchased lists ve warming

Implementace = redis token bucket per `(ip, isp)` pair s denně rotujícím limitem.

---

## 6. Content quality — pre-send filter

Než pustíme kampaň do MTA, lokálně skoreujeme přes **Rspamd** (lehčí než SpamAssassin, lépe maintained):

```
campaign → render HTML/text → Rspamd scan → score
  score > 5.0 → reject (don't send) + alert klientovi
  score 3.0-5.0 → warning + send
  score < 3.0 → send
```

Sledovat **typické problémy:**
- Subject samé velké písmena / vykřičníky
- HTML/text mismatch
- Image-only emails (no text)
- Suspicious URL TLDs (.tk, .ml, recent .top)
- Missing List-Unsubscribe header
- Spammy words density (`free`, `winner`, `urgent`, `click here` …) — kalibrované per jazyk (CZ má jiná spam slova než EN)

---

## 7. Engagement-based sending (Phase 4)

Gmail oficiálně potvrdil: dlouhodobá deliverability je funkcí **engagement** (opens, replies, scrolls), ne jen pravidel.

Implementace:
- Per contact `engagement_score` (z opens, clicks za posledních 90 dnů)
- Při send: **prioritizovat aktivní příjemce** (high engagement) — Gmail vidí stabilní engagement pattern
- Naopak: kontakty s 0 opens za 180 dní → "sunset" segment, nesílatel automaticky
- Pravidlo: pošli 70 % aktivním + 30 % inactive (nesmí se přepálit, ale občas dej druhou šanci)

---

## 8. List hygiene — povinné integrace

| Funkce | Provider | Cena | Kdy |
|---|---|---|---|
| **Bulk list validation** (pre-import) | ZeroBounce nebo Kickbox | ~$0.005/adresa | Phase 1 (Týden 5) |
| **Real-time validation** (signup form) | ZeroBounce real-time API | ~$0.008/check | Phase 6 |
| **Spam trap database** | Kickbox / SparkPost trap lists | součást validation | Phase 3 |
| **Disposable email blocking** | Vestavěná regex + 10minutemail lists | $0 | Phase 1 |
| **Soft bounce retry → suppress** | Vlastní logic (3 retries → suppress) | $0 | Phase 3 (Týden 13) |

---

## 9. Compliance — povinné po EU právu

### 9.1 GDPR + ePrivacy

- **Consent storage** — `contacts.consent_at`, `consent_source`, `consent_text_version` (kdy + jak + co podepsal)
- **Right to be forgotten** — `DELETE /contacts/:id` skutečně mažeme (ne soft delete) z PG + ClickHouse (`ALTER TABLE … DELETE WHERE` async)
- **Right to data portability** — `GET /contacts/:id/export` → JSON se všemi events
- **DPA** — Data Processing Agreement s každým klientem (B2B), template draftnout Phase 6
- **Sub-processor list** — veřejně na `mailforge.io/legal/subprocessors`: Hetzner, Cloudflare, Vercel, ClickHouse Cloud, Anthropic, Stripe, Doppler
- **Tracking pixel a click tracking** — under ePrivacy je TO **cookie-like tracking** a vyžaduje souhlas příjemce. Buď:
  - vypnout tracking pro EU recipients by default (klient zapne s opt-in od kontakta)
  - nebo: argumentovat "legitimate interest" pro B2B (riziko)
  - **Doporučení**: per-org toggle `tracking_enabled` + `tracking_eu_strict` flag (default ON)

### 9.2 CAN-SPAM (US klienti)

- Fyzická adresa v každém emailu (povinné, klient nastaví v org profilu)
- Funkční unsubscribe do 10 dnů
- Žádné misleading subjects/headers
- "Sexually explicit" tagging pokud relevantní

### 9.3 CASL (Kanada)

- Express consent doložitelný (storage timestamp + IP + form)
- Sender identification (jméno + adresa)
- Express vs Implied consent + 24-měsíční limit pro implied

### 9.4 ČR — zákon 480/2004 Sb. o některých službách informační společnosti

- Souhlas s obchodním sdělením písemný / electronický doložitelný
- Možnost odhlášení v každé zprávě
- Označení obchodního sdělení jako takové

---

## 10. Monitoring — co sledovat denně / hodinně

### Dashboard "Deliverability Health" (Grafana)

**Per IP (hourly):**
- Send count
- Delivery rate (= 1 - bounce_rate)
- Soft bounce %
- Hard bounce %
- Connection refused / timeout %
- Per-ISP delivery rate (Gmail, Outlook, Yahoo, Seznam separate panels)

**Per sending domain (daily):**
- Gmail Postmaster reputation score
- DMARC aggregate report stats (alignment fail %)
- Complaint rate
- Open rate
- Click rate

**Per org/tenant (real-time):**
- Health score
- Last 24h sent / delivered / bounced / complained
- Suspended kampaně (auto-pause)

### Alerty (PagerDuty / Better Stack on-call)

| Severity | Trigger | Akce |
|---|---|---|
| 🔴 P0 | Per-IP bounce rate > 10 % za 15 min | Auto-pause IP, oncall page |
| 🔴 P0 | Spamhaus listing detected (denní DNSBL check) | Auto-pause IP, oncall page |
| 🟠 P1 | Gmail reputation drop Medium → Low | Slack alert, ručně vyhodnotit |
| 🟠 P1 | Per-org complaint rate > 0.3 % | Auto-pause org, email klientovi |
| 🟡 P2 | DMARC report ukazuje SPF/DKIM fail > 5 % | Slack + ticket |
| 🟢 P3 | Open rate drop > 30 % WoW | Týdenní review |

---

## 11. Incident playbook — IP blacklist

**Detekce:** denní DNSBL check (Spamhaus, Barracuda, SORBS, SURBL) + Gmail Postmaster API/scrape.

**Postup:**

1. **Stop the bleeding** — auto-pause IP, přesměrovat traffic na zbytek poolu
2. **Identifikuj příčinu** — jaký klient/kampaň poslala těsně před listingem? Co je v logs? Pošla se purchased list? Spike v bounce?
3. **Suspend "viníka"** — pokud klient — pozastavit jeho kampaně, email s vysvětlením
4. **Delist request** — Spamhaus má webform; Barracuda taky; ostatní per-list různě
5. **Wait period** — po delist NE okamžitě plný traffic. Re-warming z 1 000/den
6. **Post-mortem** — co selhalo v onboarding/scanning?

---

## 12. Vztah k existující Fázi 3 v ROADMAP

Tento dokument **doplňuje** Týden 12–16 v ROADMAP. ROADMAP popisuje **co kódovat**; tento dokument popisuje **co konfigurovat ve fyzické infrastruktuře a procesech**.

**Konkrétní úkoly k přidání do TODO.md:**

- [ ] FBL registrace u Yahoo, Microsoft, Cloudmark providerů (Týden 14, paralelně s kódem)
- [ ] Gmail Postmaster verifikace + setup (Týden 14)
- [ ] Microsoft SNDS verifikace + setup (Týden 14)
- [ ] DNSBL daily monitoring script + Grafana panel (Týden 14)
- [ ] Health score per klient — algoritmus + auto-throttle (Týden 15)
- [ ] Onboarding gating — first kampaň limity 1k/5k/20k (Týden 15)
- [ ] Rspamd integrace pro pre-send content scoring (Týden 13)
- [ ] DMARC aggregate report parser (Týden 16)
- [ ] DPA template + sub-processor list page (Phase 6)
- [ ] Tracking opt-out per EU recipient (Phase 6)

---

## 13. Reference

- RFC 6376 — DomainKeys Identified Mail (DKIM)
- RFC 7208 — Sender Policy Framework (SPF)
- RFC 7489 — Domain-based Message Authentication, Reporting, and Conformance (DMARC)
- RFC 5965 — An Extensible Format for Email Feedback Reports (ARF)
- RFC 8058 — Signaling One-Click Functionality for List Email Headers
- Gmail Sender Guidelines: `https://support.google.com/mail/answer/81126`
- Microsoft Sender Recommendations: `https://sendersupport.olc.protection.outlook.com/pm/`
- Yahoo Sender Best Practices: `https://senders.yahooinc.com/best-practices/`
- M3AAWG Sender Best Common Practices

---

*Dokument vytvořen: 2026-05-18*
*Status: připraveno k implementaci souběžně s Fází 3 v ROADMAP*
