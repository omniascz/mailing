# Klaviyo vs MailForge — gap audit (2026-07-01)

Metodika: 9 doménových agentů, každý ověřil skutečné funkce Klaviyo z jeho vlastní dokumentace (help.klaviyo.com, developers.klaviyo.com — URL v detailech) a reálnou implementaci MailForge v kódu (file:path). Zaměřeno na **kde MailForge zaostává za Klaviyo**. Legenda: ✅ parita/výš · 🟡 částečné/slabší/nezapojené · 🔴 chybí/stub.

> **Klaviyo = e-commerce-first leader.** Jeho síla je: real-time segmentace, Flows (automatizace) s revenue analytikou, prediktiva, hluboká Shopify integrace, mobilní push, Reviews. Přesně tam jsou naše největší mezery.

---

## 🔴 TOP strategické mezery (napříč doménami)

1. **Nativní mobilní push + SDK** — úplně chybí (iOS/Swift, Android/Kotlin, React Native, Flutter, in-app messaging, geofencing, APNs/FCM). MailForge má jen web-push. Klaviyo core. *(Channels + Platform)*
2. **E-commerce lifecycle jádro** — žádný **„Checkout Started" event** (Klaviyo #1 flow = abandoned checkout nemožný), žádné **generování kupónů do storu** (Shopify/Woo discounts), a back-in-stock/price-drop/browse-abandonment **nemají crony** (fungují jen přes manuální HTTP). *(E-commerce)*
3. **Segmentace nižší třída** — žádný **trigger „vstup do segmentu"** (Klaviyo nejpoužívanější automation entry), žádné **real-time materializované členství** (jen on-read query), slabá **event-based segmentace** (custom eventy nejde segmentovat, žádné „udělal X N-krát s hodnotou ≥ $100"), žádný **reverse ETL**. *(Segmentation/CDP)*
4. **Flows bez analytiky a intelligence** — žádná **flow analytika / revenue-per-recipient**, Smart Sending + quiet-hours + send-time optimization **existují, ale nejsou zapojené** do flow send path, condition node **nečte data triggeru** (→ 60+ šablon má neaktivní podmínky), chybí backpopulation, needs-review, A/B winner selection, AI flow builder. *(Flows)*
5. **Reporting mělký** — **scheduled report emaily nefungují** (stub, není cron, 1 ze 4 typů), žádný **custom report builder**, žádné **custom dashboardy**, **statické benchmarky** (bez peer percentilů), žádný **portfolio/multi-account aggregate reporting**. *(Reporting)*
6. **Client-side/API zralost** — **žádný public-key model** (a `web-sdk` leakuje **privátní klíč do prohlížeče** = security anti-pattern), žádné date-based API versioning, ploché rate-limity (100/min). *(Platform)*

---

## Přehled po doménách (kde zaostáváme)

| Doména | Hlavní mezery vs Klaviyo | MailForge vede v |
|---|---|---|
| **Flows** | flow analytics/revenue (🔴), Smart Sending/quiet-hours/STO nezapojené (🟡), condition nečte event data (🔴), backpopulation/needs-review/A-B-winner/AI-builder (🔴) | víc kanálů (Viber/voice/in-app), sub-flows, run_code, CRM task, loyalty, CZ/SK date triggery |
| **Segmentace/CDP** | segment-entry trigger (🔴), real-time membership (🔴), event-frequency segmentace (🔴), reverse ETL (🔴), geo/typed custom-property (🟡) | identity graph, unified profile, per-channel consent, RFM |
| **Prediktiva/AI** | nevystavené fieldy (next-order date, #objednávek, AOV) (🔴), CLV historic/predicted/total split (🔴), peer benchmarky (🔴), reviews/forms AI (🔴), send-time jen opens/bez RL (🟡) | subject-line scorer na vlastních datech, NL→segment/SQL, fitted lead-scoring model |
| **Email/editor** | product blok (🔴), universal content (🔴), Video/HTML/Table bloky (🟡), preview/test tenký (🟡), personalized A/B variations (🟡) | spam/accessibility/dark-mode check, Litmus, AMP/connected-content/countdown, šíře A/B proměnných |
| **Kanály** | nativní mobil push/SDK (🔴), 10DLC/carrier registrace + číslo (🔴), SMS link-shortening+click (🔴), MMS (🟡), SMS compliance/coupons dead code (🟡), unified SMS/WA inbox (🟡) | Viber (3-provider), RCS, multi-provider SMS routing, Web Push |
| **Forms/Reviews** | forms targeting/behavior engine (🔴), reviews request→display loop nefunkční (🔴), consent capture nezapojený (🔴), display podmínky dle segmentu (🔴) | progressive profiling, autofill, bot protection, review moderace |
| **Reporting** | scheduled emaily (🔴), custom report builder (🔴), dashboardy (🔴), peer benchmarky (🔴), portfolio (🔴), conversion-metric výběr (🔴) | RFM, RPR, geo, device, 5-model atribuce |
| **E-commerce** | store coupon-gen (🔴), Checkout Started event (🔴), auto-trigger crony (🟡), 350+ integrací vs ~16 (🔴), catalog auto-sync (🟡), Shopify Flow connector (🔴) | Shopify webhook ingestion, recommendations engine, CZ storefronty, Heureka feeds, ISDOC |
| **Platform/deliverability** | mobilní SDK (🔴), public-key/`/client` API (🔴), date API versioning (🔴), rate-limit zralost (🟡), reputation-repair AI + shared-pool warmup (🟡/🔴) | vlastní Go MTA, SSO SAML+OIDC, izolované sandboxy, live/test klíče, self-serve dedicated IP pools, MCP, Seznam reputation |

---

## ⚠️ Nově nalezené „postaveno-ale-nezapojeno" + reálné bugy (mimo dřívějších 9 blokerů)

Klaviyo-parity domény odhalily **další** unwired věci a konkrétní bugy:

**Unwired (logika existuje, nic ji nevolá):**
- SMS **compliance** (quiet-hours/TCPA/consent) + SMS **coupon merge** — dead code, `routedSmsSend` je nevolá
- **back-in-stock / price-drop / browse-abandonment** — jen manuální HTTP, žádné crony (docstring slibuje 15-min BullMQ job, který neexistuje)
- **scheduled reports** — renderují, ale neposílají; není na cronu; 1 ze 4 typů
- **reviews request→display** — `createReviewRequest` + `{{review_url}}` nemají producery/callery; žádný veřejný widget
- **coupon injection** do sendu — `resolveEmailCouponTags` + `/internal/coupons/allocate-batch` bez callerů
- **forms conditional-logic** — evaluátory existují, ale `processFormSubmission` je při submitu neaplikuje
- **CDP `defineTrait`** — org traity jen v paměti (Map), nepersistují se

**Reálné bugy:**
- `activation.ts` čte `segment_members` tabulku, která se **nikdy neplní** (latentní broken path)
- segment custom fieldy se porovnávají jako **text** (`->>`) → numeric/date filtry vrací **špatné výsledky** (correctness bug)
- veřejná `/variant` route posílá **prázdný orgId** → `WHERE orgId=''` → 0 variant
- `web-sdk` vkládá **privátní `fm_live_` klíč do prohlížeče** (leak)
- CDP connector registry deklaruje 18 integrací, implementuje **3** (zbytek `throw not-implemented`)

---

## 🏆 Kde MailForge Klaviyo překonává
Vlastní Go MTA (ownership) · **Viber + RCS + Voice** kanály (Klaviyo nemá) · Web Push · **SSO SAML+OIDC** (Klaviyo jen SAML IdP-initiated) · **izolované sandboxy** (Klaviyo „test account" bilje naostro) · **live/test API klíče** · self-serve dedicated-IP pooly · MCP server · **Seznam.cz reputation + CZ/SK lokalizace** (skloňování, jmeniny, svátky, Shoptet/Heureka/ISDOC) · sub-flows + automation map · run_code/CRM task/loyalty flow akce · pre-send spam/accessibility/dark-mode check · AMP/countdown/connected-content · webhooky 50/org + replay-safe podpis · partner/white-label provisioning.

---

## Bottom line
**Datová/CDP/deliverability/platform páteř je na úrovni Klaviyo nebo výš, a v omnichannel (Viber/RCS/voice) + CZ trhu ho překonáváme.** Kde reálně zaostáváme za Klaviyo je jeho **e-commerce-first jádro**: nativní mobilní push, Checkout-Started + store coupon generation, real-time segmentace + segment-triggery, flow revenue-analytika, a on-site forms targeting + Reviews loop. Řada z toho je navíc „postaveno, ale nezapojeno" (crony/wiring) — tj. levnější dodělat než postavit od nuly.
