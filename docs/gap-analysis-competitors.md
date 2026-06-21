# Competitor Gap Analysis — Email Marketing & Omnichannel Platforms
*Stav: červen 2026 | Metodologie: adversariální deep research (110 agentů, 27 zdrojů, 25 verifikovaných claimů) + syntetické znalosti*

> **Důležitá meta-poznámka:** Adversariální verifikace zabila 75 % nároků ze sekundárních zdrojů (blogy, srovnávací weby) jako nepřesných nebo zastaralých. Kde je claim označen ✅ OVĚŘENO, pochází z primárního zdroje (oficiální docs). Kde je označen ⚠️ SYNTETICKÉ, je to z tréninkových dat — ověřit z aktuálních pricing pages.

---

## ČÁST 1 — OVĚŘENÉ NÁLEZY (primární zdroje, červen 2026)

### 1. Free-tier caps (leden 2026 — SNÍŽENÍ)
✅ OVĚŘENO — Mailchimp i Omnisend snížily free tier:
- **Mailchimp Free**: 250 kontaktů, 500 emailů/měsíc nebo 250/den (byl: 500 kontaktů, 2 500 emailů)
- **Omnisend Free**: 250 dosažitelných kontaktů/cyklus, 500 emailů/měsíc (kontakty importovat lze neomezeně, ale odesílat pouze segmentu ≤250)
- **Implication pro ForgeMsg**: ani jedna z největších platforem nedává smysluplný free tier. Prostor pro diferenciaci: 1 000 kontaktů free.

### 2. Omnisend Standard — cenový model
✅ OVĚŘENO — Standard = kontakty × 12 emailů/měsíc
- 3 000 kontaktů = 36 000 emailů/měsíc
- Základní cena $16/měsíc (s 30% slevou viděno $11,20)

### 3. Klaviyo Flow Builder — struktura
✅ OVĚŘENO (2-1) — 3 kategorie akcí:
- **Messages**: email, SMS, push notification (s draft/manual/live statusy)
- **Data**: update profile properties, přidat/odebrat ze seznamu, webhook
- **Logic**: time delay, conditional split, trigger split

### 4. MailerLite — chybějící trigger
✅ OVĚŘENO — automation builder NEMÁ trigger "website page visit"
- Existuje 7 triggerů: Joins a group, Completes a form, Clicks a link, Updated field, Joins a segment, Event anniversary, Exact date + e-commerce triggery
- Tracking script existuje, ale data NEJSOU dostupná jako automation trigger
- **Gap pro ForgeMsg**: website behavioral triggers jsou výhoda oproti MailerLite

### 5. ActiveCampaign — trigger šířka
✅ OVĚŘENO — 7+ typů triggerů (nejširší z ověřených platforem):
- List subscription, Tag applied, Form submission, Site visit, Email interaction (opens/clicks/replies), Ecommerce event (purchase/cart/product view), Date-based
- Po aktualizaci Active Intelligence (prosinec 2025): deal status, contact field changes, score changes, event tracking, task completed, goal triggers, 3rd-party triggery

---

## ČÁST 2 — PLATFORMY DETAIL (⚠️ syntetické znalosti, ověřit z docs)

---

### 1. MAILCHIMP

**Plány**: Free → Essentials → Standard → Premium

| Feature | Free | Essentials | Standard | Premium |
|---|---|---|---|---|
| Kontakty | 250 ✅ | dle tarifu | dle tarifu | dle tarifu |
| Emaily/měsíc | 500 ✅ | 10× kontakty | 12× kontakty | neomezené |
| Audiences (seznamy) | 1 | 3 | 5 | neomezené |
| Email editor D&D | ✅ | ✅ | ✅ | ✅ |
| HTML editor | ✅ | ✅ | ✅ | ✅ |
| Templates | základní | +prémiové | +prémiové | +prémiové |
| A/B testing (subject line) | ✗ | ✅ | ✅ | ✅ |
| Multivariate testing | ✗ | ✗ | ✗ | ✅ |
| Segmentation - basic | ✅ | ✅ | ✅ | ✅ |
| Segmentation - behavioral | ✗ | ✗ | ✅ | ✅ |
| Segmentation - predictive | ✗ | ✗ | ✅ | ✅ |
| Customer Journeys (automation) | 1 journey | 3 journeys | neomezené | neomezené |
| Send-time optimization | ✗ | ✗ | ✅ | ✅ |
| Retargeting ads (FB/Google) | ✅ | ✅ | ✅ | ✅ |
| Landing pages | ✅ | ✅ | ✅ | ✅ |
| Signup forms | ✅ | ✅ | ✅ | ✅ |
| SMS (native) | ✗ | add-on (US) | add-on (US) | add-on (US) |
| Social media posting | ✅ | ✅ | ✅ | ✅ |
| Content Studio (assets) | ✅ | ✅ | ✅ | ✅ |
| AI content generation | ✗ | ✅ (Intuit Assist) | ✅ | ✅ |
| AI subject line suggestions | ✗ | ✅ | ✅ | ✅ |
| Shopify integration | ✅ | ✅ | ✅ | ✅ |
| WooCommerce integration | ✅ | ✅ | ✅ | ✅ |
| Revenue attribution | ✗ | ✗ | ✅ | ✅ |
| Click maps (heatmaps) | ✅ | ✅ | ✅ | ✅ |
| Comparative reports | ✗ | ✗ | ✅ | ✅ |
| Dedicated IP | ✗ | ✗ | ✗ | ✅ |
| Custom domains | ✗ | ✅ | ✅ | ✅ |
| API | ✅ | ✅ | ✅ | ✅ |
| Webhooks | ✗ | ✗ | ✅ | ✅ |
| Users/seats | 1 | 3 | 5 | neomezené |
| Role-based permissions | ✗ | ✗ | ✗ | ✅ |
| GDPR tools | základní | ✅ | ✅ | ✅ |
| Transactional email | ✗ | ✗ | ✗ | add-on (Mandrill) |
| Support | email (30 dní) | email+chat | email+chat | phone+priority |

**Uživatelský flow:**
1. **Onboarding**: signup → verifikace emailu → wizard (typ podnikání, co posíláš, počet kontaktů) → doporučení tarifu
2. **Import kontaktů**: CSV/XLSX upload → mapování polí → deduplikace → potvrdit opt-in status → assign do audience
3. **Tvorba kampaně**: Campaigns → Create → Regular/Automated/A-B Test/Multivariate → název → vybrat audience → design emailu (D&D editor) → plain-text verze → subject + preview text → schedule/send
4. **Automation (Customer Journeys)**: Journeys → Create → vybrat starting point (signup/purchase/date/custom) → přidat action bloky (email, delay, if/else, update contact) → publish
5. **Reporting**: dashboard → campaign report → opens/clicks/bounces → click map → revenue (pokud e-shop) → comparisons

**Unikátní diferenciátory:**
- Content Studio (centrální asset management)
- Retargeting ads přímo z platformy (Facebook, Instagram, Google)
- Postcard campaigns (fyzická pošta, USA)
- Intuit Assist AI napříč celou platformou (2025+)
- Audience Insights (demografická data z Intuit ekosystému)

---

### 2. BREVO (dříve Sendinblue)

**Plány**: Free → Starter → Business → Enterprise

| Feature | Free | Starter | Business | Enterprise |
|---|---|---|---|---|
| Kontakty | neomezené | neomezené | neomezené | neomezené |
| Emaily/měsíc | 300/den | 20k–100k | 20k–neomezené | custom |
| Transactional email | ✅ | ✅ | ✅ | ✅ |
| Email D&D editor | ✅ | ✅ | ✅ | ✅ |
| HTML editor | ✅ | ✅ | ✅ | ✅ |
| A/B testing | ✗ | ✗ | ✅ | ✅ |
| Marketing automation | základní | základní | pokročilá | pokročilá |
| Automation – advanced workflows | ✗ | ✗ | ✅ | ✅ |
| SMS marketing | add-on | add-on | add-on | add-on |
| WhatsApp campaigns | ✗ | ✗ | add-on | add-on |
| Live chat | add-on | add-on | add-on | add-on |
| CRM (Brevo CRM) | základní | základní | ✅ | ✅ |
| Deal pipeline | ✗ | ✗ | ✅ | ✅ |
| Landing pages | ✗ | ✗ | ✅ | ✅ |
| Signup forms | ✅ | ✅ | ✅ | ✅ |
| Segmentation | základní | základní | pokročilá | pokročilá |
| Send-time optimization | ✗ | ✗ | ✅ | ✅ |
| Heatmaps | ✗ | ✗ | ✅ | ✅ |
| Revenue attribution | ✗ | ✗ | ✅ | ✅ |
| Dedicated IP | ✗ | ✗ | add-on | ✅ |
| API | ✅ | ✅ | ✅ | ✅ |
| Webhooks | ✅ | ✅ | ✅ | ✅ |
| Multi-user | ✗ | ✗ | ✅ | ✅ |
| SSO | ✗ | ✗ | ✗ | ✅ |
| Brevo logo removal | ✗ | ✅ | ✅ | ✅ |
| Support | základní | email | phone+chat | dedicated |
| GDPR tools | ✅ | ✅ | ✅ | ✅ |
| Shopify integration | ✅ | ✅ | ✅ | ✅ |
| WooCommerce integration | ✅ | ✅ | ✅ | ✅ |
| Web push notifications | add-on | add-on | add-on | add-on |

**Uživatelský flow:**
1. **Onboarding**: signup → confirm email → nastavit sender domain (SPF/DKIM) → import kontaktů nebo ruční přidání → volba kanálu
2. **Import**: CSV upload → mapování → automatický double opt-in flow (nastavitelný)
3. **Kampaň**: Campaigns → Emails → New campaign → název → configure (sender, subject) → D&D/HTML editor → segment → schedule
4. **Automation**: Automations → Create workflow → trigger (form submit, page visit, tag, date, API event) → drag-and-drop kroky (send email, SMS, wait, if/else, update contact, notify team) → activate
5. **CRM flow**: Contacts → CRM tab → pipeline view → deals → aktivita logy

**Unikátní diferenciátory:**
- **Neomezené kontakty na VŠECH plánech** (platíš za odeslané emaily, ne kontakty) — velká diferenciace
- Transakční email nativně v platformě (ostatní ho mívají odděleně)
- WhatsApp campaigns (jeden z mála nativně)
- Live chat ve stejné platformě
- Brevo Meetings (video calls integrace)
- SMTP relay jako standalone produkt

---

### 3. KLAVIYO

**Plány**: Free → Email → Email+SMS

| Feature | Free | Email | Email+SMS |
|---|---|---|---|
| Kontakty | 250 ✅ (active profiles) | dle tarifu | dle tarifu |
| Emaily/měsíc | 500 ✅ | 10× active profiles | 10× active profiles |
| SMS | ✗ | ✗ | ✅ |
| Flow builder | ✅ (omezeno) | ✅ plný | ✅ plný |
| Flow kategorie | Messages/Data/Logic ✅ | Messages/Data/Logic ✅ | +SMS messages |
| Pre-built flows | ✅ | ✅ | ✅ |
| A/B testing v flows | ✅ | ✅ | ✅ |
| Trigger typy | metric/list/segment/date/price-drop | všechny | všechny |
| Conditional splits | ✅ | ✅ | ✅ |
| Trigger splits | ✅ | ✅ | ✅ |
| Predictive analytics (LTV, churn) | ✗ | ✅ | ✅ |
| Customer lifetime value | ✗ | ✅ | ✅ |
| Churn prediction | ✗ | ✅ | ✅ |
| Product recommendations | ✗ | ✅ | ✅ |
| Dynamic product blocks | ✗ | ✅ | ✅ |
| Segmentation – behavioral | ✅ | ✅ | ✅ |
| Segmentation – predictive | ✗ | ✅ | ✅ |
| RFM segments | ✗ | ✅ | ✅ |
| Revenue attribution | ✅ | ✅ | ✅ |
| Multi-touch attribution | ✅ | ✅ | ✅ |
| Benchmark reports | ✅ | ✅ | ✅ |
| Cohort analysis | ✅ | ✅ | ✅ |
| Email D&D editor | ✅ | ✅ | ✅ |
| HTML editor | ✅ | ✅ | ✅ |
| Dynamic content blocks | ✗ | ✅ | ✅ |
| AI subject line (Klaviyo AI) | ✅ | ✅ | ✅ |
| AI send-time optimization | ✗ | ✅ | ✅ |
| AI product recommendations | ✗ | ✅ | ✅ |
| Shopify integration | ✅ best-in-class | ✅ | ✅ |
| WooCommerce integration | ✅ | ✅ | ✅ |
| BigCommerce integration | ✅ | ✅ | ✅ |
| Signup forms | ✅ | ✅ | ✅ |
| Landing pages | ✗ | ✗ | ✗ |
| API | ✅ | ✅ | ✅ |
| Webhooks | ✅ | ✅ | ✅ |
| Push notifications | ✗ | add-on | add-on |
| Multi-user | ✗ | ✅ | ✅ |
| GDPR tools | ✅ | ✅ | ✅ |
| Support | email | email+chat | priority |

**Uživatelský flow:**
1. **Onboarding**: signup → connect e-shop (Shopify wizard je 1-klik) → automaticky se importují produkty, orders, customers → setup klaviyo.js tracking snippet
2. **Import**: buď z e-shopu automaticky, nebo CSV → profilové vlastnosti → custom properties
3. **Flows (automation)**: Flows → Create Flow → z knihovny (welcome/abandoned cart/post-purchase/win-back/browse abandonment) nebo prázdný → trigger selection → drag bloky do canvasu → každý blok má preview emailu přímo v canvasu
4. **Kampaň**: Campaigns → Create Campaign → název → segment → D&D editor (nebo HTML) → preview na mobilech → A/B test setup (pokud chceš) → schedule
5. **Analytics**: Home dashboard → Revenue dashboard → Flow analytics → Campaign analytics → Segments analytics → Benchmarks (srovnání s odvětvím)

**Unikátní diferenciátory:**
- **Nejlepší Shopify integrace** — real-time sync orders, products, site events
- Predictive analytics (LTV, churn probability, next order date) — native, bez ML setupu
- Price-drop flow trigger (kontakt viděl produkt → cena klesla → automatický email)
- Browse abandonment (trackuje konkrétní produkty, ne jen košík)
- Benchmark reports (srovnávání deliverability a engagement s odvětvím)
- Klaviyo Data Platform (KDP) — zpracování miliard events real-time

---

### 4. ACTIVECAMPAIGN

**Plány**: Starter → Plus → Professional → Enterprise

| Feature | Starter | Plus | Professional | Enterprise |
|---|---|---|---|---|
| Kontakty | dle tarifu | dle tarifu | dle tarifu | dle tarifu |
| Emaily/měsíc | neomezené | neomezené | neomezené | neomezené |
| Email D&D editor | ✅ | ✅ | ✅ | ✅ |
| HTML editor | ✅ | ✅ | ✅ | ✅ |
| A/B testing (email) | ✅ | ✅ | ✅ | ✅ |
| Automation triggers (7+) ✅ | ✅ | ✅ | ✅ | ✅ |
| Site tracking | ✅ | ✅ | ✅ | ✅ |
| Event tracking (API) | ✅ | ✅ | ✅ | ✅ |
| Automation branching (if/else) | ✅ | ✅ | ✅ | ✅ |
| Goal steps v automation | ? | ✅ | ✅ | ✅ |
| Lead scoring | ✗ | ✅ | ✅ | ✅ |
| Contact scoring | ✗ | ✅ | ✅ | ✅ |
| CRM (Deals pipeline) | ✗ | ✅ | ✅ | ✅ |
| Deal automation | ✗ | ✅ | ✅ | ✅ |
| Win probability | ✗ | ✗ | ✅ | ✅ |
| Conversation Intelligence | ✗ | ✗ | ✅ | ✅ |
| Landing pages | ✗ | ✅ | ✅ | ✅ |
| Forms | ✅ | ✅ | ✅ | ✅ |
| SMS (native) | ✗ | add-on | add-on | add-on |
| Predictive send time | ✗ | ✗ | ✅ | ✅ |
| Predictive content | ✗ | ✗ | ✅ | ✅ |
| Attribution | ✗ | ✗ | ✅ | ✅ |
| Split automations | ✗ | ✗ | ✅ | ✅ |
| Custom reporting | ✗ | ✗ | ✅ | ✅ |
| Revenue reporting | ✗ | ✅ | ✅ | ✅ |
| Ecommerce deep integration | ✅ | ✅ | ✅ | ✅ |
| Shopify integration | ✅ | ✅ | ✅ | ✅ |
| Multi-user | ✅ (1) | ✅ (25) | ✅ (neomezeno) | ✅ |
| Custom user roles | ✗ | ✗ | ✗ | ✅ |
| SSO/SAML | ✗ | ✗ | ✗ | ✅ |
| Dedicated account rep | ✗ | ✗ | ✅ | ✅ |
| Onboarding | self-serve | self-serve | 1:1 | custom |
| API | ✅ | ✅ | ✅ | ✅ |
| Webhooks | ✅ | ✅ | ✅ | ✅ |
| Dedicated IP | ✗ | ✗ | ✗ | add-on |

**Uživatelský flow:**
1. **Onboarding**: signup → wizard (use-case: B2B sales / e-commerce / marketing) → nastavit sending domain → import kontaktů → "start building" guide
2. **Import**: CSV / Zapier / 900+ integrations / API → tag assignment při importu → automatické spuštění automation při přidání tagu
3. **Automation**: Automations → New automation → Start from scratch nebo template → trigger výběr → drag-and-drop builder s bloky (Send email, Wait, If/else, Go to, Notify, Create deal, Update contact, Run automation, Webhook, SMS) → podmínky v každém bloku → Goal bloky (skip to step when condition met) → Publish
4. **Kampaň**: Campaigns → New campaign → Standard/A-B/RSS/Date-based → design → recipients → schedule
5. **CRM flow**: Deals → Pipeline → drag kanban → automation trigrovaná změnou stage → Activity log → Win/loss reporting

**Unikátní diferenciátory:**
- **Nejširší automation trigger taxonomy** ze všech platforem (✅ ověřeno)
- Active Intelligence (prosinec 2025) — AI agent v automation builderu
- Goal Steps — kontak "přeskočí" kroky pokud dosáhne cíle dřív
- Conversation Intelligence — AI analýza telefonních hovorů (integrace s Whisper)
- 900+ nativních integrací
- CRM s deal automation plně integrovaný (ne bolt-on)
- Split automation — A/B testování celých automation větví (ne jen emailů)

---

### 5. GETRESPONSE

**Plány**: Free → Email Marketing → Marketing Automation → Ecommerce Marketing → MAX

| Feature | Free | Email Mktg | Mktg Auto | Ecomm Mktg | MAX |
|---|---|---|---|---|---|
| Kontakty | 500 | dle tarifu | dle tarifu | dle tarifu | custom |
| Emaily/měsíc | neomezené | neomezené | neomezené | neomezené | neomezené |
| Email editor D&D | ✅ | ✅ | ✅ | ✅ | ✅ |
| A/B testing | ✗ | ✅ | ✅ | ✅ | ✅ |
| Autoresponders | ✗ | ✅ | ✅ | ✅ | ✅ |
| Marketing automation (visual) | ✗ | ✗ | ✅ | ✅ | ✅ |
| Event-based triggers | ✗ | ✗ | ✅ | ✅ | ✅ |
| Web push notifications | ✗ | ✗ | ✅ | ✅ | ✅ |
| Webinars | ✗ | ✗ | ✅ (100 att.) | ✅ (300 att.) | ✅ (500+) |
| Landing pages | ✗ | ✅ | ✅ | ✅ | ✅ |
| Signup forms | ✅ | ✅ | ✅ | ✅ | ✅ |
| Popups | ✗ | ✅ | ✅ | ✅ | ✅ |
| Live chat | ✗ | ✗ | ✅ | ✅ | ✅ |
| SMS marketing | ✗ | ✗ | add-on | add-on | ✅ |
| Product recommendations | ✗ | ✗ | ✗ | ✅ | ✅ |
| Abandoned cart emails | ✗ | ✗ | ✗ | ✅ | ✅ |
| Promo codes | ✗ | ✗ | ✗ | ✅ | ✅ |
| Ecommerce tracking | ✗ | ✗ | ✗ | ✅ | ✅ |
| Advanced analytics | ✗ | ✅ | ✅ | ✅ | ✅ |
| AI email generator | ✗ | ✅ | ✅ | ✅ | ✅ |
| Transactional emails | ✗ | ✗ | ✗ | ✗ | ✅ |
| Dedicated IP | ✗ | ✗ | ✗ | ✗ | ✅ |
| Dedicated account manager | ✗ | ✗ | ✗ | ✗ | ✅ |
| SSO | ✗ | ✗ | ✗ | ✗ | ✅ |
| Custom DKIM domain | ✗ | ✅ | ✅ | ✅ | ✅ |
| Shopify integration | ✗ | ✅ | ✅ | ✅ | ✅ |
| API | ✅ | ✅ | ✅ | ✅ | ✅ |
| Webhooks | ✗ | ✗ | ✅ | ✅ | ✅ |
| Multi-user | ✗ | ✗ | ✅ (3) | ✅ (5) | ✅ (neomezeno) |

**Unikátní diferenciátory:**
- **Nativní webinářová platforma** — unikátní v tomto segmentu, integrované s email flow
- Paid ads creator přímo v platformě (Facebook/Instagram/Google)
- Conversion Funnel (dříve Autofunnel) — end-to-end funnel builder (landing page → email → prodej)
- GetResponse Chats — live chat přímo integrovaný s contact databází
- AI campaign generator — z jednoho popisu vygeneruje celou kampaň (emaily + landing page)

---

### 6. MAILERLITE

**Plány**: Free → Growing Business → Advanced → Enterprise

| Feature | Free | Growing Biz | Advanced | Enterprise |
|---|---|---|---|---|
| Kontakty | 1 000 | dle tarifu | dle tarifu | custom |
| Emaily/měsíc | 12 000 | neomezené | neomezené | neomezené |
| Email editor D&D | ✅ | ✅ | ✅ | ✅ |
| Rich-text editor | ✅ | ✅ | ✅ | ✅ |
| HTML editor | ✗ | ✅ | ✅ | ✅ |
| Email templates | ✗ | ✅ | ✅ | ✅ |
| A/B testing | ✗ | ✅ | ✅ | ✅ |
| Send-time optimization | ✗ | ✗ | ✅ | ✅ |
| Auto-resend to non-openers | ✅ | ✅ | ✅ | ✅ |
| Automation triggers (7) ✅ | ✅ | ✅ | ✅ | ✅ |
| Website page visit trigger | ✗ ✅ OVĚŘENO | ✗ | ✗ | ✗ |
| E-commerce triggers | ✗ | ✅ | ✅ | ✅ |
| Signup forms | ✅ | ✅ | ✅ | ✅ |
| Landing pages | ✗ | ✅ | ✅ | ✅ |
| Websites (full website builder) | ✗ | ✅ | ✅ | ✅ |
| Newsletter editor (nový 2024) | ✅ | ✅ | ✅ | ✅ |
| Unsubscribe page builder | ✗ | ✅ | ✅ | ✅ |
| Stripe integration (payments) | ✗ | ✅ | ✅ | ✅ |
| Sell digital products | ✗ | ✅ | ✅ | ✅ |
| Ecommerce integrations | ✅ | ✅ | ✅ | ✅ |
| Shopify integration | ✅ | ✅ | ✅ | ✅ |
| AI writing assistant | ✗ | ✗ | ✅ | ✅ |
| AI subject line | ✗ | ✗ | ✅ | ✅ |
| Multi-user | ✗ | ✗ | ✅ (neomezeno) | ✅ |
| Custom user roles | ✗ | ✗ | ✅ | ✅ |
| White-label | ✗ | ✗ | ✗ | ✅ |
| Dedicated account manager | ✗ | ✗ | ✗ | ✅ |
| Newsletter monetization | ✗ | ✅ (MailerLite Paid Subscriptions) | ✅ | ✅ |
| API | ✅ | ✅ | ✅ | ✅ |
| Webhooks | ✅ | ✅ | ✅ | ✅ |
| GDPR tools | ✅ | ✅ | ✅ | ✅ |
| Support | email (24h) | email (24h) | priority email+chat | dedicated |

**Unikátní diferenciátory:**
- **Newsletter monetizace** — Paid Subscriptions nativně (Substack competitor)
- Sell digital products přes email platformu (e-books, courses)
- Čistý, jednoduchý UX — nejméně zahlcující onboarding ze všech testovaných
- Full website builder (nejen landing pages)
- Auto-resend to non-openers — velice populární feature dostupná i na free

---

### 7. OMNISEND

**Plány**: Free → Standard → Pro

| Feature | Free | Standard | Pro |
|---|---|---|---|
| Kontakty (dosažitelné) | 250 ✅ | neomezené | neomezené |
| Emaily/měsíc | 500 ✅ | kontakty × 12 ✅ | neomezené |
| SMS kredity | 60 | bez prémiových funkcí | neomezené |
| Web push | ✅ | ✅ | ✅ |
| Email D&D editor | ✅ | ✅ | ✅ |
| Product Picker (drag product z shopu) | ✅ | ✅ | ✅ |
| Product Recommender | ✅ | ✅ | ✅ |
| Pre-built automation recipes | ✅ | ✅ | ✅ |
| Custom automation | ✅ | ✅ | ✅ |
| Segmentation | ✅ | ✅ | ✅ |
| Signup forms | ✅ | ✅ | ✅ |
| Landing pages | ✗ | ✗ | ✗ |
| Gamification forms (Wheel of Fortune) | ✅ | ✅ | ✅ |
| A/B testing | ✅ | ✅ | ✅ |
| Conditional content | ✗ | ✗ | ✅ |
| AI product recommendations | ✗ | ✗ | ✅ |
| Customer lifecycle mapping | ✅ | ✅ | ✅ |
| Advanced reporting | ✅ | ✅ | ✅ |
| Revenue attribution | ✅ | ✅ | ✅ |
| Shopify integration | best-in-class | best-in-class | best-in-class |
| WooCommerce integration | ✅ | ✅ | ✅ |
| BigCommerce integration | ✅ | ✅ | ✅ |
| Multi-user | ✅ (1) | ✅ | ✅ |
| Customer success manager | ✗ | ✗ | ✅ |
| API | ✅ | ✅ | ✅ |
| Webhooks | ✅ | ✅ | ✅ |

**Unikátní diferenciátory:**
- **Gamification forms** — Wheel of Fortune spin-to-win nativně (unique)
- Product Picker v editoru (drag produkty přímo z katalogu)
- SMS + email + push v jedné automation sekvenci (jeden z nejlepších cross-channel)
- Lifecycle mapping nativní (customer journey visualization)
- Ecommerce-first DNA — každý feature navržen pro e-shopy

---

### 8. HUBSPOT MARKETING HUB

**Plány**: Free → Starter → Professional → Enterprise

| Feature | Free | Starter | Professional | Enterprise |
|---|---|---|---|---|
| Kontakty (mktg) | neomezené (1M CRM) | 1 000 marketing | dle tarifu | dle tarifu |
| Emaily/měsíc | 2 000 | 5× limit | neomezené | neomezené |
| Email D&D editor | ✅ | ✅ | ✅ | ✅ |
| A/B testing | ✗ | ✗ | ✅ | ✅ |
| Marketing automation (Workflows) | ✗ | základní | ✅ plný | ✅ pokročilý |
| Custom properties | ✅ | ✅ | ✅ | ✅ |
| Lead scoring | ✗ | ✗ | ✅ | ✅ |
| Predictive lead scoring | ✗ | ✗ | ✗ | ✅ |
| Landing pages | ✗ | ✅ | ✅ | ✅ |
| Forms | ✅ | ✅ | ✅ | ✅ |
| Signup forms (smart) | ✗ | ✗ | ✅ | ✅ |
| Blog | ✗ | ✗ | ✅ | ✅ |
| SEO tools | ✗ | ✗ | ✅ | ✅ |
| Social media management | ✗ | ✗ | ✅ | ✅ |
| Paid ads management | ✅ ($1k spend) | ✅ ($1k) | ✅ | ✅ |
| Live chat / Chatbot | ✅ (basic) | ✅ | ✅ | ✅ |
| In-app messaging | ✗ | ✗ | ✅ | ✅ |
| SMS | ✗ | ✗ | add-on | add-on |
| Push notifications | ✗ | ✗ | ✗ | ✗ |
| Revenue attribution (multi-touch) | ✗ | ✗ | ✅ | ✅ |
| Custom reporting | ✗ | ✗ | ✅ (25 dashboards) | ✅ (neomezeno) |
| Behavioral events (custom) | ✗ | ✗ | ✗ | ✅ |
| Custom objects | ✗ | ✗ | ✗ | ✅ |
| Partitioning | ✗ | ✗ | ✗ | ✅ |
| Sandboxes | ✗ | ✗ | ✗ | ✅ |
| Hierarchical teams | ✗ | ✗ | ✗ | ✅ |
| SSO | ✗ | ✗ | ✗ | ✅ |
| Dedicated IP | ✗ | ✗ | ✗ | ✅ |
| Transactional email | ✗ | ✗ | ✗ | add-on |
| CRM integrace | ✅ nativní | ✅ | ✅ | ✅ |
| Shopify integration | ✅ | ✅ | ✅ | ✅ |
| API | ✅ | ✅ | ✅ | ✅ |
| Webhooks | ✅ | ✅ | ✅ | ✅ |

**Unikátní diferenciátory:**
- **HubSpot CRM je základ** — marketing hub je nástavba nad CRM, ne samostatný produkt
- Content Hub (blog + SEO + landing pages + podcasts) v jedné platformě
- Customer Journey Analytics (vizualizace celé customer journey)
- Breeze AI — content generation, prospecting, konverzační AI (2024+)
- Nejvíce B2B zaměřené řešení ze všech platforem
- Operations Hub sync (obousměrná sync s externími CRM/databázemi)
- Reporting API — exportovat libovolné reporty programaticky

---

### 9. CONSTANT CONTACT

**Plány**: Lite → Standard → Premium

| Feature | Lite | Standard | Premium |
|---|---|---|---|
| Kontakty | dle tarifu | dle tarifu | dle tarifu |
| Emaily/měsíc | 10× limit | neomezené | neomezené |
| Email D&D editor | ✅ | ✅ | ✅ |
| A/B testing (subject) | ✗ | ✅ | ✅ |
| Marketing automation | ✗ | ✅ | ✅ |
| Event marketing | ✅ | ✅ | ✅ |
| Signup forms | ✅ | ✅ | ✅ |
| Landing pages | ✗ | ✅ | ✅ |
| SMS marketing | ✗ | add-on | add-on |
| Social media scheduling | ✗ | ✅ | ✅ |
| Google/Facebook ads | ✗ | ✅ | ✅ |
| Segmentation | základní | pokročilá | pokročilá |
| Analytics | základní | pokročilá | pokročilá |
| SEO tools | ✗ | ✗ | ✅ |
| Custom automation paths | ✗ | ✗ | ✅ |
| Dedicated account manager | ✗ | ✗ | ✅ |
| Phone support | ✗ | ✗ | ✅ |
| API | ✅ | ✅ | ✅ |
| Shopify integration | ✅ | ✅ | ✅ |
| WooCommerce integration | ✅ | ✅ | ✅ |
| GDPR | ✅ | ✅ | ✅ |

**Unikátní diferenciátory:**
- **Event marketing** nativně — create events, sell tickets, manage RSVPs
- Very US-focused — silná telefonní podpora (unique)
- Logo Design tool integrovaný (AI logo generator)
- Silná integrace s QuickBooks, Etsy, Mindbody (SMB ecosystem)

---

### 10. CONVERTKIT (KIT)

**Plány**: Free → Creator → Creator Pro

| Feature | Free | Creator | Creator Pro |
|---|---|---|---|
| Subscribers | 10 000 | dle tarifu | dle tarifu |
| Emaily/měsíc | neomezené | neomezené | neomezené |
| Broadcasts | ✅ | ✅ | ✅ |
| Email sequences (autoresponders) | ✗ | ✅ | ✅ |
| Visual automation | ✗ | ✅ | ✅ |
| Tags system | ✅ | ✅ | ✅ |
| Segments | ✅ | ✅ | ✅ |
| Custom fields | ✅ | ✅ | ✅ |
| Landing pages | ✅ | ✅ | ✅ |
| Signup forms | ✅ | ✅ | ✅ |
| Commerce (digital products) | ✅ | ✅ | ✅ |
| Paid newsletters (Stripe) | ✅ | ✅ | ✅ |
| Tips / Pay-what-you-want | ✅ | ✅ | ✅ |
| Referral system (SparkLoop) | ✗ | ✗ | ✅ |
| Subscriber scoring | ✗ | ✗ | ✅ |
| Advanced reporting | ✗ | ✗ | ✅ |
| Newsletter referral network | ✗ | ✗ | ✅ |
| Priority support | ✗ | ✗ | ✅ |
| A/B testing | ✗ | ✗ | ✅ |
| API | ✅ | ✅ | ✅ |
| Integrations (Zapier etc.) | ✅ | ✅ | ✅ |

**Unikátní diferenciátory:**
- **Creator Network** — cross-promotion mezi 10 000+ creatory (unikátní feature)
- Tag-based systém místo listů (flexibilnější než list-based přístupy)
- Commerce nativně — sell courses, memberships, digital downloads přímo z platformy
- SparkLoop referral program nativní (doporučení odběratelů)
- Design ethos "opinionated minimal" — záměrně omezené pro focuseného writera

---

### 11. DRIP

**Plán**: Single tier (kontakt-based pricing)

| Feature | Drip |
|---|---|
| Emaily/měsíc | neomezené |
| Visual workflow builder | ✅ |
| E-commerce triggers (purchase, browse, cart) | ✅ |
| Custom events | ✅ |
| Multi-step automation | ✅ |
| A/B testing | ✅ |
| Dynamic content | ✅ |
| Product recommendations | ✅ |
| RFM segmentation | ✅ |
| Revenue attribution | ✅ |
| Multi-touch attribution | ✅ |
| Shopify integration | ✅ best-in-class |
| WooCommerce integration | ✅ |
| Magento integration | ✅ |
| SMS marketing | ✅ (nativní) |
| On-site campaigns (popups) | ✅ |
| Webhooks | ✅ |
| API | ✅ |
| Multi-user | ✅ |

**Unikátní diferenciátory:**
- Jeden tarif — vše v ceně, bez tier tier-ování features
- **Nejpokročilejší e-commerce segmentation** ze specificky e-commerce platforem
- People-based marketing (track zákazníka přes sessionsrozlišit lidi)
- Liquid-like templating v emailech (podmíněný obsah per-customer)
- Revenue per email metrics (unikátní granularita)

---

### 12. MOOSEND

**Plány**: Free trial → Pro → Enterprise

| Feature | Pro | Enterprise |
|---|---|---|
| Emaily/měsíc | neomezené | neomezené |
| Email D&D editor | ✅ | ✅ |
| HTML editor | ✅ | ✅ |
| A/B testing | ✅ | ✅ |
| Automation (visual) | ✅ | ✅ |
| Segmentation | pokročilá | pokročilá |
| Landing pages | ✅ | ✅ |
| Signup forms | ✅ | ✅ |
| Subscription forms | ✅ | ✅ |
| Product recommendations (AI) | ✅ | ✅ |
| Weather-based recommendations | ✅ | ✅ |
| Movie/music recommendations | ✅ | ✅ |
| Lead scoring | ✅ | ✅ |
| Countdown timers | ✅ | ✅ |
| GDPR tools | ✅ | ✅ |
| Dedicated IP | ✗ | ✅ |
| White-label | ✗ | ✅ |
| Custom reporting | ✅ | ✅ |
| Shopify / WooCommerce | ✅ | ✅ |
| API | ✅ | ✅ |
| Webhooks | ✅ | ✅ |
| SAML SSO | ✗ | ✅ |

**Unikátní diferenciátory:**
- **Weather-based recommendations** (email obsah přizpůsoben aktuálnímu počasí příjemce) — unikátní
- AI product recommendations (movie-style collaborative filtering)
- Nízká cena za enterprise features
- Countdown timers nativní v email editoru

---

### 13. CAMPAIGN MONITOR

**Plány**: Basic → Unlimited → Premier

| Feature | Basic | Unlimited | Premier |
|---|---|---|---|
| Emaily/měsíc | 2 500 (5× limit) | neomezené | neomezené |
| Email D&D editor | ✅ | ✅ | ✅ |
| HTML editor | ✅ | ✅ | ✅ |
| Templates | 50+ | 50+ | 50+ |
| A/B testing | ✗ | ✅ | ✅ |
| Automation | základní | pokročilá | pokročilá |
| Segmentation | základní | pokročilá | pokročilá |
| Time-zone sending | ✗ | ✅ | ✅ |
| Spam testing | ✗ | ✅ | ✅ |
| Inbox preview | ✗ | ✅ | ✅ |
| Advanced link tracking | ✗ | ✅ | ✅ |
| Priority support | ✗ | ✗ | ✅ |
| Dedicated account manager | ✗ | ✗ | ✅ |
| API | ✅ | ✅ | ✅ |
| Multi-user | ✅ | ✅ | ✅ |
| Transactional email (Postmark) | add-on | add-on | add-on |

**Unikátní diferenciátory:**
- **Transactional email přes Postmark** (dceřiná společnost)
- Timezone-aware sending (doručení v 9:00 local time každého příjemce)
- Silné šablony — nejlépe designované out-of-box
- Link review tool (detekce broken links před odesláním)
- Agency zaměření — multi-client management

---

### 14. ZOHO CAMPAIGNS

**Plány**: Free → Standard → Professional

| Feature | Free | Standard | Professional |
|---|---|---|---|
| Kontakty | 2 000 | dle tarifu | dle tarifu |
| Emaily/měsíc | 6 000 | neomezené | neomezené |
| Email D&D editor | ✅ | ✅ | ✅ |
| A/B testing | ✗ | ✅ | ✅ |
| Autoresponders | ✗ | ✅ | ✅ |
| Workflow automation | ✗ | ✗ | ✅ |
| Segmentation | základní | pokročilá | pokročilá |
| Forms | ✅ | ✅ | ✅ |
| Landing pages | ✗ | ✗ | ✅ |
| SMS campaigns | ✗ | ✅ | ✅ |
| Social campaigns | ✅ | ✅ | ✅ |
| Zoho CRM integration | ✅ nativní | ✅ | ✅ |
| Zoho SalesIQ (chat) | ✅ | ✅ | ✅ |
| API | ✅ | ✅ | ✅ |
| GDPR | ✅ | ✅ | ✅ |

**Unikátní diferenciátory:**
- **Zoho ekosystém** — nejsilnější pokud zákazník používá Zoho CRM/Books/Desk
- SMS nativní (Standard+)
- Relativně nízká cena v rámci Zoho One bundle
- Social campaigns (LinkedIn, Twitter, Facebook) ze stejné platformy

---

### 15. BENCHMARK EMAIL

**Plány**: Free → Pro

| Feature | Free | Pro |
|---|---|---|
| Kontakty | 500 | dle tarifu |
| Emaily/měsíc | 3 500 | neomezené |
| Email D&D editor | ✅ | ✅ |
| HTML editor | ✅ | ✅ |
| A/B testing | ✗ | ✅ |
| Automation | základní | pokročilá |
| Segmentation | základní | pokročilá |
| Forms | ✅ | ✅ |
| Landing pages | ✗ | ✅ |
| Smart Content (AI) | ✗ | ✅ |
| RSS feeds | ✅ | ✅ |
| Inbox Checker | ✗ | ✅ |
| API | ✅ | ✅ |
| Shopify integration | ✅ | ✅ |
| GDPR | ✅ | ✅ |
| Multilingual support | ✅ (9 jazyků) | ✅ |

**Unikátní diferenciátory:**
- Podpora v 9 jazycích (rare v segmentu)
- Smart Content AI (automaticky zjistí nejlepší obsah pro segment)
- Velmi jednoduché — zaměřeno na absolute beginners

---

### 16. MAILJET

**Plány**: Free → Essential → Premium → Custom

| Feature | Free | Essential | Premium | Custom |
|---|---|---|---|---|
| Emaily/měsíc | 6 000 | 15k–150k | 15k–150k+ | custom |
| Denní limit | 200 | ✗ | ✗ | ✗ |
| Kontakty | neomezené | neomezené | neomezené | neomezené |
| Transactional email | ✅ | ✅ | ✅ | ✅ |
| Email D&D editor | ✅ | ✅ | ✅ | ✅ |
| A/B testing | ✗ | ✗ | ✅ | ✅ |
| Segmentation | ✗ | ✗ | ✅ | ✅ |
| Marketing automation | ✗ | ✗ | ✅ | ✅ |
| Real-time monitoring | ✅ | ✅ | ✅ | ✅ |
| Advanced statistics | ✗ | ✅ | ✅ | ✅ |
| Multi-user | ✗ | ✗ | ✅ (neomezeno) | ✅ |
| Role-based access | ✗ | ✗ | ✅ | ✅ |
| Sub-accounts | ✗ | ✗ | ✗ | ✅ |
| Dedicated IP | ✗ | ✗ | add-on | ✅ |
| Inbox preview | ✗ | ✗ | add-on | ✅ |
| Spam score | ✗ | ✗ | add-on | ✅ |
| API (REST) | ✅ | ✅ | ✅ | ✅ |
| SMTP | ✅ | ✅ | ✅ | ✅ |
| Webhooks | ✅ | ✅ | ✅ | ✅ |
| GDPR | ✅ | ✅ | ✅ | ✅ |

**Unikátní diferenciátory:**
- **Developer-first** — SMTP + REST API je primo v centru produktu
- Neomezené kontakty na VŠECH plánech
- Sub-accounts pro agentury (Custom)
- Real-time event monitoring (webhooks/API events)
- Velmi silné v transactional+marketing combo

---

### 17. SENDGRID MARKETING CAMPAIGNS

**Plány**: Free → Essentials → Pro → Premier

| Feature | Free | Essentials | Pro | Premier |
|---|---|---|---|---|
| Emaily/den | 100 | — | — | — |
| Emaily/měsíc | — | 50k–100k | 150k+ | custom |
| Kontakty (marketing) | 2 000 | 5 000 | 10 000+ | custom |
| Email D&D editor | ✅ | ✅ | ✅ | ✅ |
| HTML editor | ✅ | ✅ | ✅ | ✅ |
| A/B testing | ✅ | ✅ | ✅ | ✅ |
| Automation | ✗ | ✗ | ✅ | ✅ |
| Segmentation | základní | pokročilá | pokročilá | pokročilá |
| Signup forms | ✅ | ✅ | ✅ | ✅ |
| Landing pages | ✗ | ✗ | ✗ | ✗ |
| Dedicated IP | ✗ | add-on | ✅ | ✅ |
| Email validation API | ✗ | ✗ | ✅ | ✅ |
| Subuser management | ✗ | ✗ | ✅ | ✅ |
| Transactional (SMTP/API) | ✅ | ✅ | ✅ | ✅ |
| Dynamic templates | ✅ | ✅ | ✅ | ✅ |
| Click/open tracking | ✅ | ✅ | ✅ | ✅ |
| API | ✅ | ✅ | ✅ | ✅ |
| Webhooks (Event) | ✅ | ✅ | ✅ | ✅ |
| IP warmup | ✗ | ✗ | ✅ | ✅ |
| Expert support | ✗ | ✗ | ✗ | ✅ |

**Unikátní diferenciátory:**
- **Transactional email leader** — marketing campaigns jsou spíš doplněk
- Email validation API (ověření adresy před odesláním)
- Subuser management (agentury/whitelabel)
- Velmi silné SMTP credentials a IP reputation management

---

## ČÁST 3 — LOKÁLNÍ PLATFORMY CZ/SK

---

### 18. ECOMAIL

**Plány**: Free → Starter → Business → Enterprise (contact-based)

| Feature | Free | Starter | Business | Enterprise |
|---|---|---|---|---|
| Kontakty | 200 | dle tarifu | dle tarifu | custom |
| Emaily/měsíc | 400 | neomezené | neomezené | neomezené |
| Email D&D editor | ✅ | ✅ | ✅ | ✅ |
| HTML editor | ✅ | ✅ | ✅ | ✅ |
| A/B testing | ✗ | ✅ | ✅ | ✅ |
| Automation (visual) | ✗ | ✅ | ✅ | ✅ |
| Automation – Shoptet | ✗ | ✅ | ✅ | ✅ |
| Segmentation | základní | pokročilá | pokročilá | pokročilá |
| Signup forms | ✅ | ✅ | ✅ | ✅ |
| Landing pages | ✗ | ✗ | ✅ | ✅ |
| SMS (přes partnery) | ✗ | add-on | add-on | add-on |
| Shoptet integrace | ✅ nativní | ✅ | ✅ | ✅ |
| WooCommerce integrace | ✅ | ✅ | ✅ | ✅ |
| Shopify integrace | ✅ | ✅ | ✅ | ✅ |
| Abandoned cart | ✗ | ✅ | ✅ | ✅ |
| Product recommendations | ✗ | ✗ | ✅ | ✅ |
| Revenue attribution | ✗ | ✅ | ✅ | ✅ |
| Heureka integrace | ✅ | ✅ | ✅ | ✅ |
| CZ/SK podpora | ✅ | ✅ | ✅ | ✅ |
| API | ✅ | ✅ | ✅ | ✅ |
| Webhooks | ✅ | ✅ | ✅ | ✅ |
| CZK fakturace | ✅ | ✅ | ✅ | ✅ |
| GDPR tools | ✅ | ✅ | ✅ | ✅ |
| Multi-user | ✗ | ✅ | ✅ | ✅ |

**Unikátní diferenciátory (CZ/SK kontextu):**
- **Shoptet integrace jako první třída** — jeden z mála s nativní Shoptet sync
- Heureka integrace (product feed + reviews)
- CZK/EUR fakturace, IČO na faktuře
- Česká podpora v pracovní době
- UX lokalizovaný do češtiny

---

### 19. SMARTEMAILING

**Plány**: Free → Basic → Business → Enterprise (contact-based)

| Feature | Free | Basic | Business | Enterprise |
|---|---|---|---|---|
| Kontakty | 200 | dle tarifu | dle tarifu | custom |
| Emaily/měsíc | 400 | neomezené | neomezené | neomezené |
| Email editor | ✅ | ✅ | ✅ | ✅ |
| A/B testing | ✗ | ✅ | ✅ | ✅ |
| Automation (Scénáře) | ✗ | ✅ | ✅ | ✅ |
| Visual automation builder | ✗ | ✅ | ✅ | ✅ |
| GDPR souhlas management | ✅ | ✅ | ✅ | ✅ |
| GDPR purposes (granulární) | ✗ | ✗ | ✅ | ✅ |
| Double opt-in | ✅ | ✅ | ✅ | ✅ |
| Segmentation | základní | pokročilá | pokročilá | pokročilá |
| Dynamický obsah | ✗ | ✗ | ✅ | ✅ |
| Signup forms | ✅ | ✅ | ✅ | ✅ |
| Landing pages | ✗ | ✗ | ✅ | ✅ |
| SMS (nativní integrace) | ✗ | add-on | ✅ | ✅ |
| Shoptet integrace | ✅ | ✅ | ✅ | ✅ |
| WooCommerce | ✅ | ✅ | ✅ | ✅ |
| Abandoned cart | ✗ | ✅ | ✅ | ✅ |
| Webhooks | ✅ | ✅ | ✅ | ✅ |
| API | ✅ | ✅ | ✅ | ✅ |
| CZK fakturace | ✅ | ✅ | ✅ | ✅ |
| CZ podpora | ✅ | ✅ | ✅ | ✅ |
| Transakční emaily | ✗ | ✗ | ✅ | ✅ |
| Dedicated IP | ✗ | ✗ | ✗ | ✅ |
| Custom domain | ✗ | ✅ | ✅ | ✅ |

**Unikátní diferenciátory:**
- **GDPR purposes systém** — nejpokročilejší GDPR consent management v CZ/SK
- Granulární souhlasy (email marketing ≠ email newsletter ≠ slevové emaily)
- Silná tradice u CZ e-shopů (10+ let na trhu)
- Vlastní doručitelnostní infrastruktura s CZ IP reputation
- Scénáře (automation) vizuálně jasné i pro non-tech uživatele

---

### 20. MAILKIT

**Plány**: Pay-as-you-go / Enterprise

| Feature | Stav |
|---|---|
| Bulk email | ✅ |
| Transactional email | ✅ |
| Email editor | ✅ basic |
| HTML editor | ✅ |
| A/B testing | ✅ |
| Automation | omezená |
| Segmentation | ✅ |
| Personalization | ✅ |
| API | ✅ (velmi silné) |
| SMTP | ✅ |
| Webhooks | ✅ |
| Dedicated IP | ✅ |
| CZ podpora | ✅ |
| CZK fakturace | ✅ |
| Delivery reporting | ✅ pokročilé |
| ISP monitoring | ✅ |

**Unikátní diferenciátory:**
- **Deliverability-first** — zaměřeno na technické uživatele a doručitelnost
- ISP monitoring nativní (blacklist monitoring, bounce pattern analysis)
- Pay-as-you-go model (vzácné v segmentu)
- Silná API dokumentace — pro vývojáře
- Spíše infrastrukturní platforma, ne all-in-one marketing

---

### 21. TARGITO

**Platforma**: Enterprise e-commerce omnichannel

| Feature | Stav |
|---|---|
| Email marketing | ✅ |
| SMS | ✅ |
| Push notifications | ✅ |
| Automation / Scénáře | ✅ pokročilé |
| Segmentation (behavioral) | ✅ |
| RFM segmentation | ✅ |
| Product recommendations (AI) | ✅ |
| Personalized content | ✅ |
| A/B testing | ✅ |
| Abandoned cart | ✅ |
| Browse abandonment | ✅ |
| Revenue attribution | ✅ |
| Shoptet nativní | ✅ |
| Shopify | ✅ |
| WooCommerce | ✅ |
| Real-time behavioral data | ✅ |
| Custom events | ✅ |
| API | ✅ |
| CZ/SK podpora | ✅ |
| CZK fakturace | ✅ |
| Custom reporting | ✅ |
| Pricing | Enterprise (custom) |

**Unikátní diferenciátory:**
- **AI product recommendations** na úrovni Klaviyo — v CZ/SK unikátní
- Behavioral real-time tracking (page visits, product views, time on site)
- Omnichannel v jednom — email + SMS + push ze stejné automation
- Zaměření čistě na e-commerce, ne obecný marketing

---

## ČÁST 4 — FEATURE MATRIX (přehled gating per tier)

### Klíčové features — kde jsou FREE vs. PAID

| Feature | Free na | Gated za paywall na |
|---|---|---|
| Neomezené emaily | Brevo, MailerLite (12k), GetResponse, Kit | Mailchimp, Omnisend, Mailjet |
| Neomezené kontakty | Brevo, Mailjet, Zoho, Kit | Mailchimp (250!), Omnisend (250!), MailerLite |
| Visual automation builder | Klaviyo (flow), Drip | Mailchimp (Standard+), Brevo (Business+), MailerLite (Growing+) |
| A/B testing | Klaviyo (všechny), Drip, Kit Pro | Mailchimp (Standard+), Brevo (Business+), MailerLite (Growing+), HubSpot (Pro+) |
| Landing pages | HubSpot (Starter+), MailerLite (Growing+) | Brevo (Business+), GetResponse (Email+) |
| Website page visit trigger | AC, Brevo, HubSpot (Pro+) | **MailerLite: NIKDY** ✅ |
| SMS | Brevo (add-on all), Omnisend, Drip | Mailchimp (US only), MailerLite (Enterprise), HubSpot (add-on Pro+) |
| WhatsApp | Brevo (add-on) | Všichni ostatní: ✗ |
| Push notifications | GetResponse (Mktg Auto+), Omnisend | Klaviyo (add-on), Mailchimp (✗) |
| Transactional email | Brevo, Mailjet, SendGrid | Mailchimp (Mandrill add-on!), GetResponse (MAX only) |
| Predictive analytics | Klaviyo (Email+) | Mailchimp (Standard+), AC (Pro+) |
| Dedicated IP | AC (add-on Enterprise), Campaign Monitor (Premier) | MailerLite (✗ nikdy) |
| Multi-user | Most (paid) | MailerLite (Advanced+), ConvertKit (Pro) |
| White-label | Moosend Enterprise, Mailjet Custom | Naprostá většina: ✗ |
| Webináře | GetResponse (Mktg Auto+) | Všichni ostatní: ✗ |
| Event marketing | Constant Contact (all) | Všichni ostatní: ✗ |
| CRM nativní | HubSpot, AC (Plus+), Brevo (Business+) | Ostatní: ✗ nebo add-on |
| AI product recommendations | Klaviyo, Omnisend (Pro), Moosend, Drip | MailerLite (✗), Mailchimp (✗ nativně) |
| Revenue attribution | Klaviyo, Drip, Omnisend, AC | Mailchimp (Standard+), MailerLite (✗) |

---

## ČÁST 5 — UNIKÁTNÍ FEATURES (co dělá kdo jako JEDINÝ)

| Feature | Kdo jediný / kdo nejlépe |
|---|---|
| Wheel of Fortune forms | Omnisend (jediný nativně) |
| Nativní webináře | GetResponse (jediný) |
| Event ticketing | Constant Contact (jediný nativně) |
| Newsletter Creator Network | ConvertKit/Kit (jediný) |
| Physical postcards | Mailchimp (jediný, USA) |
| Weather-based content | Moosend (jediný) |
| Price-drop flow trigger | Klaviyo (jediný nativně) |
| Browse abandonment (product-level) | Klaviyo, Drip (nejlepší) |
| Conversation intelligence (calls) | ActiveCampaign (jediný v tomto segmentu) |
| Webinář → email automation | GetResponse (jediný) |
| Pay-as-you-go model | Mailkit (CZ), Mailjet (částečně) |
| Granulární GDPR purposes | SmartEmailing (nejlepší v CZ/SK) |
| Shoptet native integration | Ecomail, SmartEmailing, Targito (CZ only) |
| Heureka integration | Ecomail (CZ only) |
| WhatsApp campaigns | Brevo (jediný z mainstream) |

---

## ČÁST 6 — FORGEMSG GAP ANALYSIS

### Kde ForgeMsg může vyhrát (real gaps)

**1. Free tier s reálnou hodnotou**
- Mailchimp/Omnisend snížily na 250 kontaktů (leden 2026) — vyloženě nepoužitelné
- **Příležitost**: 1 000 kontaktů + 10 000 emailů/měsíc free (jako MailerLite ale s multichannel)

**2. Automation triggers šířka**
- MailerLite nemá website page visit trigger (✅ ověřeno)
- Mailchimp má omezené journey triggery
- **Příležitost**: všechny trigger typy od začátku (page visit, custom events, API events, behavioral)

**3. Multichannel v jedné platformě**
- Skutečná omnichannel (email + SMS + WhatsApp + voice + push) v jedné flow:
  - Klaviyo: email + SMS + push ✅
  - Brevo: email + SMS + WhatsApp ✅
  - Ostatní: email + 1-2 kanály max
  - **ForgeMsg cíl**: email + SMS + WhatsApp + voice bot + push — unikátní kombinace

**4. Transakční + marketing v jednom**
- Mailchimp: Mandrill je oddělená platba
- GetResponse: transakční jen MAX
- **Příležitost**: transactional + marketing z jednoho účtu od Starter planu

**5. CZ/SK lokalizace na globální platformě**
- Ecomail/SmartEmailing: lokální, ale omezené feature-set
- Globální platformy: bez Shoptet, bez CZK, bez Heureka
- **Příležitost**: globální feature-set + CZ/SK lokalizace (Shoptet, Raynet, Heureka, CZK, jmeniny, skloňování)

**6. AI features přístupné od nižších tierů**
- HubSpot: AI jen Enterprise+
- Klaviyo: predictive jen Email+
- **Příležitost**: AI subject line, send-time optimization, product recommendations od Growth tarifu

**7. Website visit triggers u všech plánů**
- MailerLite tracking existuje ale trigger nedostupný (✅ ověřeno)
- **Příležitost**: page visit trigger dostupný všem (ne jen enterprise)

**8. Transparentní pricing model**
- Omnisend ×12 formula je komplikovaná
- Klaviyo "active profiles" matoucí
- **Příležitost**: jasný model — kontakty, neomezené emaily, jednoduché

### Features které ForgeMsg má (oproti konkurenci)
Na základě TODO.md a existující implementace:
- ✅ AMP for Email (rare — Mailchimp, Gmail, AC to neumí nativně)
- ✅ SMS gateway (SMPP v3.4)
- ✅ Voice bot (Twilio + Deepgram + ElevenLabs + Claude)
- ✅ Webhook V2 signatures
- ✅ Bulk email validation
- ✅ DNS health monitoring
- ✅ Anomaly detection
- ✅ Review collection module (s moderací + sentiment)
- ✅ ISDOC/SPAYD integrace (unikátní CZ/SK)
- ✅ Shoptet integrace
- ✅ Raynet CRM bi-sync
- ✅ Heureka/Zboží/Google Shopping feeds

---

*Dokument vygenerován 2026-06-20. Ověřené claims označeny ✅ OVĚŘENO, ostatní ⚠️ SYNTETICKÉ — doporučeno ověřit z aktuálních pricing pages před strategickým rozhodnutím.*
