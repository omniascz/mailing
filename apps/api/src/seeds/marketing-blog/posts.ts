/**
 * Marketing blog content fixtures (Sprint H.8).
 *
 * 10 SEO-targeted posts split across:
 *   • Migration guides (EN: Mailchimp, Klaviyo; CS: Ecomail, SmartEmailing, Brevo)
 *   • Comparisons (CS: Ecomail vs MailForge, SmartEmailing vs MailForge,
 *     Mailchimp cena 2026; EN: Klaviyo alternative)
 *   • Deliverability (EN: EU data residency)
 *
 * Each post is markdown body, ~250–450 words. Titles + meta lengths fit
 * Google SERP (title ≤ 60 chars, meta ≤ 160). All posts include canonical
 * CTAs at the end so /api/v1/blog can drive lead capture.
 */

export interface MarketingPost {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  metaTitle: string;
  metaDescription: string;
  tags: string[];
  category: 'migration' | 'comparisons' | 'deliverability';
  locale: 'en' | 'cs';
}

export const MARKETING_POSTS: MarketingPost[] = [
  {
    slug: 'switch-from-mailchimp-to-mailforge',
    title: 'How to switch from Mailchimp to MailForge — full migration guide',
    excerpt:
      'A practical, no-downtime path from Mailchimp to MailForge: audiences, automations, templates, DNS, and IP warm-up.',
    metaTitle: 'Switch from Mailchimp to MailForge — Migration Guide',
    metaDescription:
      'Step-by-step Mailchimp migration: export audiences, port automations, set up DKIM/SPF, warm a dedicated IP, and run a parallel cut-over.',
    tags: ['mailchimp', 'migration', 'esp', 'deliverability'],
    category: 'migration',
    locale: 'en',
    body: `Mailchimp is the default starter ESP — but customers outgrow it the moment their contact list crosses a few thousand or their automations stop fitting into Customer Journeys. MailForge is designed to be the next stop: same drag-and-drop editor, EU data residency, and a connector that pulls your existing Mailchimp data without a CSV in sight.

## Before you start

You need three things ready: API keys for both Mailchimp and your DNS provider, agreement on which sending domain you will use post-migration, and a clear cut-over window (we recommend two weeks of parallel sending).

## Step 1 — Connect Mailchimp

In the MailForge dashboard open *Settings → Migrations → Mailchimp*. Paste your Mailchimp API key and pick the audience to import. The connector pulls subscribers, merge fields, tags, suppression list, templates, and Customer Journeys, preserving every GDPR consent timestamp.

## Step 2 — Authenticate your domain

While the import runs, set up DKIM, SPF, and DMARC on your sending domain. MailForge generates one-click DNS records you paste into your registrar. If you already use Entri, the records auto-publish.

## Step 3 — Warm the IP

If you are on the dedicated-IP plan, MailForge schedules a 14-day warm-up. The engine starts at 50 emails/day to your most-engaged segment and ramps to full volume by day 14. You can keep sending from Mailchimp during warm-up — both run in parallel.

## Step 4 — Cut over

When IP reputation is solid and your automations look right, flip the source-of-truth flag in MailForge. From this point all triggered emails go through MailForge; Mailchimp remains read-only for 30 days in case you need to roll back.

## Why senders choose MailForge

Half the price at every tier, native Czech and Slovak localisation, a public preference centre that lawyers approve of, and unlimited seats — no Pro upgrade just to add a teammate. The full Mailchimp migration usually takes one afternoon.

[Start your free migration →](https://mailforge.io/migrate-from-mailchimp)`,
  },
  {
    slug: 'switch-from-klaviyo-to-mailforge',
    title: 'How to switch from Klaviyo to MailForge — feature-by-feature',
    excerpt:
      'Klaviyo cost spiralling? Here is how to migrate flows, segments, RFM bands, and the Shopify integration to MailForge.',
    metaTitle: 'Switch from Klaviyo to MailForge — Migration Guide',
    metaDescription:
      'Side-by-side Klaviyo to MailForge migration: flows, segments, RFM, Shopify webhooks, and how to preserve revenue attribution.',
    tags: ['klaviyo', 'migration', 'ecommerce', 'shopify'],
    category: 'migration',
    locale: 'en',
    body: `Klaviyo built a great product for high-revenue Shopify stores. The catch is the bill — Klaviyo prices grow with both contacts and SMS, and an EU GDPR audit usually pushes you to the European data centre tier. MailForge solves both with a single per-contact price and EU residency by default.

## Feature map

| Klaviyo | MailForge |
| --- | --- |
| Flows | Workflows (same node types, drag-and-drop) |
| Segments | Segments (same boolean + behavioural rules) |
| Predictive metrics | Native CLV, churn risk, purchase likelihood |
| Klaviyo SMS | MailForge SMS gateway + per-country routing |
| Shopify integration | Native Shopify + Shoptet + Upgates |

## Migrate in three passes

**1. Audiences** — connect Klaviyo via OAuth, MailForge imports all lists and segments with member counts intact. RFM band membership is preserved as a tag so the first send mirrors Klaviyo precisely.

**2. Flows** — the connector translates Klaviyo flow JSON into MailForge workflows. Smart Sending, A/B branches, and the Goal node port one-for-one. The few unsupported nodes (BigQuery sync, Klaviyo CDP enrichment) are flagged so you can rebuild them with MailForge equivalents.

**3. Shopify** — install the MailForge app on the same store. The webhook stream takes over for orders, refunds, and abandoned carts within five minutes. Klaviyo keeps receiving events too until you toggle it off, so attribution stays consistent.

## What you keep, what you lose

You keep: revenue attribution model, RFM bands, last-active date, predicted CLV (recomputed by MailForge with your historical data). You lose: nothing, if you give the import five days to settle.

## Where MailForge wins

Half the cost at the same contact count, EU data centre on every plan, and a Czech localisation layer that Klaviyo simply does not have. Plus a working preference centre that actually meets ePrivacy.

[Get the Klaviyo migration guide →](https://mailforge.io/migrate-from-klaviyo)`,
  },
  {
    slug: 'migrace-z-ecomailu-na-mailforge',
    title: 'Migrace z Ecomailu na MailForge — krok za krokem',
    excerpt:
      'Kompletní návod, jak přejít z Ecomailu na MailForge bez ztráty kontaktů, scénářů a Shoptet napojení.',
    metaTitle: 'Migrace z Ecomailu na MailForge — návod 2026',
    metaDescription:
      'Jak přejít z Ecomailu na MailForge: kontakty, scénáře, Shoptet, Raynet, GDPR souhlasy. Bez výpadku, do jednoho dne.',
    tags: ['ecomail', 'migrace', 'cz', 'shoptet'],
    category: 'migration',
    locale: 'cs',
    body: `Ecomail je dobrý český nástroj pro střední e‑shopy. Limity narazíte typicky ve třech bodech: chybí AI optimalizace odesílání, scénáře jsou ohraničené 6 kanály, a cena na 50 tisících kontaktech přestává být konkurenční. MailForge nabízí všechny tři věci v jednom balíku plus stejnou hlubokou českou lokalizaci.

## Co migrace přenese

Konektor přečte vaše Ecomail API a do MailForge zkopíruje:

- všechny kontakty (včetně skloňování jmen, jmenin a kategorií svátků)
- seznamy, segmenty a tagy
- transakční šablony a scénáře (mapování krok‑za‑krokem)
- Shoptet, Upgates a Raynet napojení (jen znovu autorizujete)
- záznamy GDPR souhlasu — datum, právní titul, zdroj

## Jak migrace probíhá

V dashboardu otevřete *Nastavení → Migrace → Ecomail*. Vložíte API klíč Ecomailu (najdete ho v *Nastavení → API*) a vyberete účet. Import obvykle trvá 5–60 minut podle velikosti databáze. Souběžně spustíte ověření doménového odesílání (DKIM, SPF, DMARC) — MailForge vygeneruje DNS záznamy.

## Paralelní odesílání

Doporučujeme nechat oba nástroje běžet 14 dní zároveň. Z MailForge posíláte uvítací sérii a opuštěné košíky, z Ecomailu pravidelný newsletter. Po dvou týdnech a kontrole doručitelnosti přepnete zdroj pravdy.

## Co MailForge umí navíc

- Predikce CLV, churn risk a pravděpodobnost nákupu pro každý kontakt
- AI optimalizace času odesílání per kontakt (STO)
- České jmeniny + svátky jako triggery workflow
- Sklik retargeting pixel a hashed audience sync
- Stejný balík funkcí v ceně 2× nižší než Ecomail Marketer

## Bez závazku

Migrace je vždy zdarma. Pokud po 30 dnech zůstáváte u Ecomailu, MailForge účet jen zavřete — Ecomail účet je po celou dobu netknutý.

[Začít migraci z Ecomailu →](https://mailforge.io/migrate-from-ecomail)`,
  },
  {
    slug: 'migrace-ze-smartemailingu-na-mailforge',
    title: 'Migrace ze SmartEmailingu na MailForge — proč a jak',
    excerpt:
      'Návod pro přechod ze SmartEmailingu: Sklik napojení, Viber, gender inference, GDPR účely zpracování — vše zachováme.',
    metaTitle: 'Migrace ze SmartEmailingu na MailForge',
    metaDescription:
      'Kompletní průvodce migrací ze SmartEmailingu: Sklik, Viber, účely zpracování. Bez ztráty dat, jeden den práce.',
    tags: ['smartemailing', 'migrace', 'cz', 'sklik', 'viber'],
    category: 'migration',
    locale: 'cs',
    body: `SmartEmailing je veterán českého email marketingu se silnou stránkou v B2B nástrojích a Sklik integraci. Slabší stránka: zastaralý editor a chybějící moderní AI funkce. MailForge převezme všechny vaše B2B nástroje a přidá modernější stack.

## Co konektor zachová

- Kontakty se všemi vlastními poli a tagy
- Účely zpracování (Processing purposes) — datum udělení, právní titul, expirace
- Sklik OAuth napojení a Custom Audiences (audience sync přes hash SHA‑256)
- Viber šablony a kampaňové fallbacky na SMS
- Skore kvality kontaktu z VirusFree (mapuje se na MailForge graymail signal)
- Sales pipeline a deal stage pokud používáte SmartEmailing B2B

## Postup migrace

1. **API klíč** — v SmartEmailing administraci v *Nastavení → API* vygenerujete klíč s read‑only oprávněním.
2. **Konektor** — v MailForge dashboardu *Migrace → SmartEmailing*, vložíte klíč, vyberete účty.
3. **Import** — typicky 30 minut. Konektor zachová původní timestamp souhlasu i zdroj registrace.
4. **Sklik znovu autorizujete** — OAuth tok je jednorázový, audience pak teče dál.
5. **Doména** — DKIM/SPF/DMARC pro odesílací doménu MailForge vám pomůže nastavit přes Entri.

## Proč přechod stojí za to

MailForge přidá nad SmartEmailing:

- AI Send Time Optimization per kontakt (jiný čas pro Petra, jiný pro Janu)
- Pre‑send tipy v Claude (subject line, A/B návrh, prediction)
- Bezpečné a moderní šifrované GDPR audit logy
- Klesající náklady při růstu počtu kontaktů
- Sklik retargeting pixel přímo z platformy bez nutnosti psát vlastní JS

## Časový plán

Den 1: konektor + DNS. Den 2–14: paralelní provoz. Den 15: cut‑over. Den 16–30: ostrý monitoring doručitelnosti.

[Spustit migraci ze SmartEmailingu →](https://mailforge.io/migrate-from-smartemailing)`,
  },
  {
    slug: 'brevo-alternativa-pro-cesky-trh',
    title: 'Brevo alternativa pro český trh — proč MailForge',
    excerpt:
      'Brevo (dříve Sendinblue) nemá český jazyk ani jmeniny. Co dostanete v MailForge a kolik ušetříte.',
    metaTitle: 'Brevo alternativa pro CZ — MailForge',
    metaDescription:
      'Brevo postrádá českou lokalizaci, Sklik a Shoptet. MailForge má vše plus AI funkce za poloviční cenu.',
    tags: ['brevo', 'sendinblue', 'cz', 'alternativa'],
    category: 'migration',
    locale: 'cs',
    body: `Brevo (přejmenovaný Sendinblue) je francouzský all‑in‑one nástroj. Pro globální týmy funguje dobře, pro český e‑shop má tři zásadní mezery: chybí česká lokalizace systémových emailů, neexistuje Sklik napojení a Shoptet integrace je jen přes Zapier.

## Co Brevo neumí pro CZ

| Funkce | Brevo | MailForge |
| --- | --- | --- |
| Český preference centrum | ne | ano |
| Skloňování jmen v subject line | ne | ano (7 pádů) |
| Jmeniny jako workflow trigger | ne | ano |
| Sklik (Seznam.cz) audience sync | ne | ano |
| Shoptet OAuth integrace | jen přes Zapier | nativní |
| Raynet CRM bi-sync | ne | ano |
| ISDOC export faktur | ne | ano |
| EU data residency | ano | ano |

## Cena

Brevo Business plán začíná na 65 EUR za 20 tisíc kontaktů. MailForge Pro plán je 32 EUR za stejnou kapacitu — a obsahuje Conversation Inbox, kalkulátor doručitelnosti i AI pre‑send tipy, které Brevo nabízí jen na Enterprise tier.

## Migrace z Brevo

Konektor je přímočarý: API klíč Brevo → vyberete účet → MailForge zkopíruje kontakty, listy, šablony a Automation Toolkit scénáře. Translation Layer se použije pro auto‑překlad anglických systémových emailů do češtiny a slovenštiny.

## Pro koho je MailForge lepší

E‑shopy na Shoptetu, Upgatesu, FastCentriku. B2B firmy s Raynetem. Klienti, kteří chtějí Sklik kampaně a hashed audiences přímo v platformě. Týmy s českým a slovenským trhem, kde dokonalá lokalizace přímo ovlivňuje doručitelnost u Seznamu.

[Začít migraci z Brevo →](https://mailforge.io/migrate-from-brevo)`,
  },
  {
    slug: 'ecomail-vs-mailforge-srovnani-2026',
    title: 'Ecomail vs MailForge: srovnání funkcí 2026',
    excerpt:
      'Srovnání dvou českých ESP po funkcích, ceně, doručitelnosti a integracích. Kdo je pro koho.',
    metaTitle: 'Ecomail vs MailForge — srovnání 2026',
    metaDescription:
      'Detailní srovnání Ecomail a MailForge: AI, integrace, cena, doručitelnost u Seznamu, podpora.',
    tags: ['ecomail', 'mailforge', 'srovnani', 'cz'],
    category: 'comparisons',
    locale: 'cs',
    body: `Ecomail je etablovaný český ESP od roku 2013, MailForge je novější platforma s důrazem na AI a hluboký Czech tech stack. Pro koho je který lepší?

## Společné body

Obě platformy mají český i slovenský preference centre, integrace Shoptet a Heureka, scénáře s drag‑and‑drop editorem a EU data residency. Obě podporují základní A/B testování a transakční API.

## V čem se liší

**AI funkce.** MailForge má nativní Send Time Optimization per kontakt, Pre‑send AI tipy s Claude a predikci CLV/churn risk/purchase likelihood pro každý kontakt. Ecomail nabízí jednoduché doporučení času odeslání pro celý seznam.

**Sklik.** MailForge má hotovou OAuth integraci, audience sync (hashed) a retargeting pixel. Ecomail Sklik nepodporuje — musíte řešit externě.

**Raynet CRM.** MailForge má dvousměrnou synchronizaci. Ecomail jen jednosměrný export přes Zapier.

**Voice Agent.** MailForge umí outbound voice kampaně přes Twilio + ElevenLabs + Claude. Ecomail tuto kategorii neřeší.

**Workflow recipes.** MailForge se 56 hotovými šablonami napříč 18 kategoriemi. Ecomail s ~15 šablonami.

## Cena

Ecomail Marketer 50 tisíc kontaktů: 5 990 Kč/měsíc. MailForge Pro 50 tisíc kontaktů: 2 990 Kč/měsíc. Při větších objemech rozdíl roste — MailForge účtuje per‑contact lineárně, Ecomail má skoky mezi balíčky.

## Doručitelnost u Seznamu

Obě platformy mají dedikované buckety pro Seznam, Volny.cz a Centrum.cz. MailForge navíc parser Seznam Postmaster feedback a topping header pro lepší inbox placement.

## Komu Ecomail?

Pokud potřebujete jen jednoduchý newsletter a dva scénáře, jste s Ecomailem rychle a v pohodě.

## Komu MailForge?

Pokud používáte Sklik, Raynet nebo chcete AI optimalizaci, MailForge je výrazně vpřed. Plus stojí polovinu.

[Vyzkoušet MailForge zdarma →](https://mailforge.io/signup)`,
  },
  {
    slug: 'smartemailing-vs-mailforge-srovnani',
    title: 'SmartEmailing vs MailForge: srovnání pro B2B',
    excerpt:
      'Který český ESP zvládne B2B lépe? Srovnání pipeline, sequenc, lead scoringu a Sklik integrace.',
    metaTitle: 'SmartEmailing vs MailForge — srovnání B2B',
    metaDescription:
      'B2B srovnání SmartEmailing a MailForge: Sales CRM, Sales sequences, lead scoring, Sklik a Viber.',
    tags: ['smartemailing', 'mailforge', 'b2b', 'srovnani'],
    category: 'comparisons',
    locale: 'cs',
    body: `SmartEmailing pokrývá B2B silně už od svých počátků. MailForge nastoupil B2B funkce v roce 2026 s důrazem na AI agenty a moderní stack. Pojďme se na to podívat.

## Sales pipeline

Obě platformy mají pipelines, deals, accounts a tasks. SmartEmailing má za sebou roky iterace a podporu pipeline customizace včetně kanban board. MailForge nabízí stejné jádro plus AI Win Probability model, deal risk assessment a sentiment analysis 1:1 emailů.

## Sales sequences

SmartEmailing má klasické email‑only sequences. MailForge přidá multi‑kanálové sequence (email → SMS → LinkedIn → call task) a smart channel selection podle preference kontaktu.

## Lead scoring

Obě platformy mají rule‑based scoring. MailForge přidá predictive lead scoring s ML modelem a AI Calendly block (smart scheduling).

## Sklik

Obě mají Sklik integraci. SmartEmailing s Sklikem začal a má hlubší conversion tracking. MailForge má novější OAuth + hashed audience sync + retargeting pixel.

## Viber

Obě podporují Viber Business Messages. MailForge má cascade fallback email → Viber → SMS automaticky podle dostupnosti.

## AI

SmartEmailing nemá první‑class AI funkce. MailForge má:

- AI Campaign Builder (autonomous agent)
- Pre‑send tipy s Claude
- Subject line generator a A/B variant generator
- Sentiment analysis a tone detection v 1:1 odpovědích
- Predictive metrics per kontakt (CLV, churn risk)

## Cena

SmartEmailing Sales 5K kontaktů: 990 Kč/měsíc, ale Sales add‑on je další 2 990 Kč. MailForge Pro 5K kontaktů: 690 Kč/měsíc, Sales je v ceně.

## Komu SmartEmailing?

B2B týmy s dlouhou historií na platformě, které mají customizované workflow a nechtějí migrovat.

## Komu MailForge?

Nové B2B týmy nebo ti, co chtějí AI agenty a moderní stack.

[Začít zdarma →](https://mailforge.io/signup)`,
  },
  {
    slug: 'mailchimp-cenik-2026-cz',
    title: 'Mailchimp ceník 2026 — kolik vás opravdu stojí',
    excerpt:
      'Skrytá cena Mailchimpu při 50K kontaktech: marketing contacts vs subscribed, EU data centrum, dedicated IP.',
    metaTitle: 'Mailchimp ceník 2026 — skutečná cena',
    metaDescription:
      'Detailní rozbor Mailchimp ceníku 2026 v Kč. Skryté náklady a kdy se vyplatí přejít na MailForge.',
    tags: ['mailchimp', 'cena', 'cz', 'srovnani'],
    category: 'comparisons',
    locale: 'cs',
    body: `Mailchimp má dva matoucí cenové modely zároveň. Začneme rozbít skutečnou cenu pro českého klienta s 50 tisíci kontakty.

## Co Mailchimp účtuje

Mailchimp účtuje za *Marketing Contacts* — což zahrnuje aktivní i nepřihlášené (unsubscribed) kontakty. Pokud máte 50 tisíc Marketing Contacts (z toho 30 tisíc subscribed), platíte za všech 50 tisíc.

## Reálná cena 50K kontaktů

- Mailchimp Standard 50K kontaktů: 350 USD/měsíc ≈ 8 050 Kč
- Mailchimp Premium (auto‑upgrade nad 150K kontaktů): 800 USD/měsíc ≈ 18 400 Kč
- EU data centrum: +20% (Mailchimp účtuje za EU residency)
- Dedicated IP: +199 USD/měsíc ≈ 4 580 Kč

Celkem pro Standard plán s EU + dedicated IP: ~14 250 Kč/měsíc.

## Skryté limity

- 6× měsíční odesílací cap (Standard) / 15× (Premium) — pak musíte na vyšší tier
- Customer Journey omezený na 100 emailů per workflow
- Žádný built‑in preference centre splňující české ePrivacy
- Czech lokalizace neexistuje
- Žádné pípy z dedicated IP warmup data (jen Pro tier)

## MailForge stejná velikost

- 50K kontaktů Pro plán: 2 990 Kč/měsíc
- EU data centrum: v ceně
- Dedicated IP: v ceně (Pro plán)
- Český preference centre: v ceně
- Sklik retargeting + audience sync: v ceně

Roční rozdíl pro 50K kontaktů: ~134 880 Kč.

## Kdy přejít

Pokud platíte přes 5 000 Kč měsíčně za Mailchimp a posíláte víc než dvakrát týdně, MailForge migrace se vyplatí. ROI typicky za dva měsíce.

## Bez rizika

Migrace je zdarma, Mailchimp zůstává netknutý 30 dní pro případné vrácení, a všechny GDPR souhlasy se přenesou.

[Vyzkoušet migraci →](https://mailforge.io/migrate-from-mailchimp)`,
  },
  {
    slug: 'klaviyo-alternative-eu-gdpr',
    title: 'Klaviyo alternative for European GDPR-first senders',
    excerpt:
      'Looking for a Klaviyo alternative that stores data in the EU and meets ePrivacy by default? Here is the comparison.',
    metaTitle: 'Klaviyo Alternative — EU GDPR-first ESP',
    metaDescription:
      'Klaviyo alternatives compared by GDPR readiness, data residency, EU pricing, and ecommerce feature parity.',
    tags: ['klaviyo', 'alternative', 'gdpr', 'eu'],
    category: 'comparisons',
    locale: 'en',
    body: `Klaviyo dominates Shopify ecommerce email globally — but European senders consistently hit three blockers: data residency outside the EU, ePrivacy preference center that requires custom development, and pricing that grows faster than store revenue. Here is a comparison of the realistic alternatives.

## Evaluation criteria

We score each alternative on:

1. Data residency: EU-only servers with no US fall-through
2. ePrivacy preference center: per-purpose consent, granular toggle, hosted
3. Shopify depth: orders, refunds, abandoned cart, browse abandonment
4. Predictive metrics: CLV, churn risk, purchase likelihood
5. SMS routing: per-country pricing transparency
6. Cost at 50K active profiles

## The shortlist

**MailForge** — EU residency by default, ePrivacy preference center is one click, Shopify and Shoptet integrations native, predictive metrics free on Pro plan, transparent SMS routing. 50K contacts: €128/month.

**Brevo (Sendinblue)** — EU residency available, preference center decent, Shopify limited to Zapier. 50K contacts: €65/month but premium tier needed for advanced flows.

**ActiveCampaign** — strong workflow builder but data centre choice costs extra, no native preference center. 50K contacts: €350/month.

**Emarsys** — enterprise EU player but no public pricing, multi-month sales cycle.

## Where MailForge wins

The combination of EU residency + ePrivacy + predictive metrics + transparent pricing is unique. Klaviyo and ActiveCampaign meet some of these but not all simultaneously. Brevo is cheaper but misses Shopify depth.

## Migration cost

MailForge ships a Klaviyo connector that imports lists, segments, flows, predictive metrics seed data, and Shopify webhooks. Parallel sending during the 14-day cut-over keeps revenue attribution intact.

[Compare full feature matrix →](https://mailforge.io/klaviyo-alternative)`,
  },
  {
    slug: 'eu-data-residency-email-marketing',
    title: 'EU data residency in email marketing — what really matters',
    excerpt:
      'GDPR + ePrivacy + the Schrems II ruling have killed quiet US data transfers. Here is what to check before you sign with an ESP.',
    metaTitle: 'EU Data Residency for ESPs — What Matters',
    metaDescription:
      'A practical guide to EU data residency for email senders: GDPR, ePrivacy, Schrems II, and what to verify in your ESP contract.',
    tags: ['gdpr', 'data-residency', 'eu', 'deliverability'],
    category: 'deliverability',
    locale: 'en',
    body: `Five years after GDPR went live, EU data residency for email senders is no longer a checkbox — it is a legal requirement that survives audit. Here is what actually matters when you evaluate an ESP for EU residency.

## What residency actually means

The bar is not just "EU servers." A compliant ESP must:

1. Store contact data at rest in EU regions (Frankfurt, Dublin, Stockholm, Warsaw)
2. Process tracking events in EU regions
3. Backups that never leave the EU
4. Sub-processors (CDN, SMS gateway, image storage) listed and EU-only
5. No personal data transfers to US affiliates under SCCs (Schrems II killed this)

The grey zone: many ESPs route email click-tracking through US CDNs. That alone is a personal data transfer under recent EU court rulings.

## How to verify

Ask the ESP for their sub-processor list, region certifications (ISO 27001 with EU scope), and DPA. Read the DPA — specifically the sub-processor list. If you see Cloudfront, Fastly with US POPs, or AWS US regions for *any* component, it is not EU-resident.

## What MailForge does

All MailForge infrastructure runs in EU regions only:

- Postgres database: Frankfurt and Stockholm
- Redis: Frankfurt
- Object storage: EU-only buckets
- SMS gateway: Telia (Sweden) and Orange (France) primary
- Voice agent: EU Twilio numbers
- Email tracking pixel and link redirects: EU CDN only

The sub-processor list is public and updated within 30 days of changes. Notification email goes to every DPA holder when the list changes.

## What about US senders?

US-headquartered ESPs typically offer "EU data centre" tier for an upcharge but retain US data lineage in metadata, billing, and support. That is incompatible with strict GDPR readings.

## The takeaway

EU residency is a deal-breaker for many EU senders post-Schrems II. Verify the entire stack, not just the marketing claim.

[Read MailForge DPA →](https://mailforge.io/legal/dpa)`,
  },
];
