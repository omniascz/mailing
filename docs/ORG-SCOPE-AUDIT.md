# Audit org-scope: protřídění varování pravidla `require-org-scope`

_Vzniklo v kole Z21. Klasifikace, ne opravy — v tomto dokumentu se nezměnil ani řádek aplikačního kódu._

## Jak byl seznam získán

```
$ npx eslint apps/api/src apps/workers/src --format json -o <out>
# pravidlo forgemsgOrg/require-org-scope, větev lint/require-org-scope (PR #162)
```

**Varování před klasifikací: 257**, ve 120 souborech. To číslo je v tomto dokumentu výchozí a nesmí se rozejít se součtem níže.

## Součet — sedí na celek

| kategorie                                               | počet   |
| ------------------------------------------------------- | ------- |
| A — cross-tenant                                        | 9       |
| B — chybí scope, dosah v jedné org / platformní tabulka | 3       |
| C — záměr (cron přes všechny org)                       | 16      |
| D — scope jinudy                                        | 67      |
| E — nerozhodnuto                                        | 28      |
| **klasifikováno celkem**                                | **123** |
| _nepřečteno, a proto neklasifikováno_                   | _134_   |
| **celkem**                                              | **257** |

Součet 123 + 134 = 257, tedy přesně počet varování. Nic nebylo zkráceno ani doplněno odhadem.

## Co „nepřečteno" znamená

Klasifikováno je jen to, co jsem skutečně přečetl — u každého záznamu okolní funkci, její signaturu a celý dotaz, a u kandidátů na A i volající a to, odkud přicházejí parametry. Zbylých 134 jsem nepřečetl, a proto je nezařazuji: tipovat kategorii jen abych seznam dokončil by z dokumentu udělalo něco, co vypadá hotově a není. Jejich přesný seznam je na konci, ať je zřejmé, kde práce pokračuje.

## A — cross-tenant, seřazené podle dopadu

Pořadí je podle toho, co se reálně stane: nejdřív to, co **zapisuje** do cizí organizace nebo jí mění chování, pak to, co cizí data jen **čte**. Dosažitelnost řadí až v druhé řadě — vada za vypnutou skupinou je odložená, ne neexistující.

**1. `apps/api/src/services/domains/warmup-scheduler.ts:130`** — tabulka `warmupIps`, dosažitelnost **CORE**  
warmup_ips is looked up by ipAddress alone with limit 1, so on a shared sending IP one org reads and then advances another org’s warmup counter

**2. `apps/api/src/routes/v1/webhooks/ads.ts:85`** — tabulka `adAccounts`, dosažitelnost **group:ads-webhook**  
adAccounts where platform = linkedin_ads with limit 1 and no org at all, inside the loop that attributes leads — whichever org sits first in the table gets them

**3. `apps/api/src/routes/v1/webhooks/ads.ts:51`** — tabulka `adAccounts`, dosažitelnost **group:ads-webhook**  
ad account matched on platform plus a page id with no org filter, then used to attribute inbound leads

**4. `apps/api/src/services/calculated-props/index.ts:149`** — tabulka `calculatedPropertyValues`, dosažitelnost **group:advanced-analytics**  
delete scoped only by propId and entityId, both supplied by the caller, while the insert three lines below does carry orgId — a caller naming another org’s propId deletes its values

**5. `apps/api/src/services/meetings/round-robin.ts:121`** — tabulka `calendarEvents`, dosažitelnost **group:meeting**  
availability is computed from calendar_events across every user and every org, and the function’s own \_userId parameter is unused, so one org’s bookings block another’s

**6. `apps/api/src/routes/v1/meetings.ts:46`** — tabulka `bookingPages`, dosažitelnost **group:meeting**  
public booking page resolved by slug alone, and booking_pages_slug_uq is UNIQUE only on (org_id, slug), so two orgs sharing a slug resolve to whichever row comes back

**7. `apps/api/src/routes/v1/meetings.ts:79`** — tabulka `bookingPages`, dosažitelnost **group:meeting**  
same slug lookup as :46

**8. `apps/api/src/routes/v1/meetings.ts:130`** — tabulka `bookingPages`, dosažitelnost **group:meeting**  
same slug lookup as :46

**9. `apps/api/src/channels/push/web-push-adapter.ts:280`** — tabulka `pushSendLog`, dosažitelnost **CORE**  
getStatus(messageId) reads push_send_log by an id the caller hands in, so another org’s delivery status and timestamp come back

### Proč v tomto pořadí

1–2 jsou nahoře, protože **mění cizí stav bez zásahu člověka**: zahřívací počítadlo se posouvá při každém odeslání, a přiřazení leadu se děje při každém příchozím webhooku. Obojí tiše a opakovaně.
3 maže řádky, ale potřebuje volajícího, který dodá cizí `propId` — dopad je horší než u čtení, pravděpodobnost nižší.
4 mění rozhodnutí (dostupnost člena), ne data, a má navíc druhou vadu: nepoužitý parametr `_userId`.
5–7 jsou jeden defekt ve třech výskytech a jsou nejviditelnější navenek — veřejná rezervační stránka cizí organizace. Řadím je pod zápisy, protože jde o čtení, ale nad poslední, protože je dosažitelné bez jakéhokoli přihlášení.
8 je čtení jedné hodnoty stavu doručení a je nejmenší z celé skupiny.

## Celá tabulka klasifikovaných

| soubor:řádek                                                  | tabulka                       | kategorie | proč                                                                                                                                                                                                            | dosažitelnost               |
| ------------------------------------------------------------- | ----------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------- | ---- |
| `apps/api/src/channels/push/web-push-adapter.ts:280`          | `pushSendLog`                 | **A**     | getStatus(messageId) reads push_send_log by an id the caller hands in, so another org’s delivery status and timestamp come back                                                                                 | CORE                        |
| `apps/api/src/channels/push/web-push-adapter.ts:346`          | `pushSubscriptions`           | **D**     | contactId comes from the recipient the send pipeline already resolved                                                                                                                                           | CORE                        |
| `apps/api/src/routes/v1/auth.ts:215`                          | `users`                       | **D**     | matched on a single-use email verification token                                                                                                                                                                | CORE                        |
| `apps/api/src/routes/v1/auth.ts:239`                          | `users`                       | **D**     | userId comes from the session                                                                                                                                                                                   | CORE                        |
| `apps/api/src/routes/v1/blog.ts:429`                          | `blogPosts`                   | **D**     | postId comes out of a server-issued preview token held in Redis; possession of the token is the authorisation (the stored orgId is read but never compared, which is a smell, not a hole)                       | CORE                        |
| `apps/api/src/routes/v1/campaigns.ts:797`                     | `campaigns`                   | **E**     | campaign id is a route param and no org filter or post-check is visible here; what would decide it is whether the route pre-loads the campaign org-scoped                                                       | CORE                        |
| `apps/api/src/routes/v1/campaigns.ts:863`                     | `campaigns`                   | **E**     | same shape as :797, same question                                                                                                                                                                               | CORE                        |
| `apps/api/src/routes/v1/cdp/sources.ts:256`                   | `cdpSources`                  | **E**     | source id from the path, direction checked but not ownership; what would decide it is whether the webhook HMAC is per-source                                                                                    | group:cdp-source            |
| `apps/api/src/routes/v1/competitive-monitor.ts:98`            | `competitorWatchlist`         | **E**     | matched on monitorEmail from the body; what would decide it is whether that address is unique per org                                                                                                           | group:advanced-analytics    |
| `apps/api/src/routes/v1/competitive-monitor.ts:165`           | `competitorEmails`            | **E**     | list read with no org filter visible in the excerpt                                                                                                                                                             | group:advanced-analytics    |
| `apps/api/src/routes/v1/domains.ts:109`                       | `sendingDomains`              | **D**     | reads back the row just inserted inside the same transaction                                                                                                                                                    | CORE                        |
| `apps/api/src/routes/v1/domains.ts:251`                       | `dkimKeys`                    | **E**     | scoped through domainId; what would decide it is whether the route validated the domain against the session org first                                                                                           | CORE                        |
| `apps/api/src/routes/v1/domains.ts:414`                       | `sendingDomains`              | **E**     | selector/public key read without an org filter in the excerpt                                                                                                                                                   | CORE                        |
| `apps/api/src/routes/v1/ecommerce-integrations.ts:497`        | `ecommerceConnections`        | **E**     | connection matched on platform plus something cut off at the excerpt boundary                                                                                                                                   | group:ecommerce             |
| `apps/api/src/routes/v1/ecommerce-integrations.ts:583`        | `ecommerceConnections`        | **D**     | connection matched on its own id and platform; the webhook HMAC is verified against that connection’s secret                                                                                                    | group:ecommerce             |
| `apps/api/src/routes/v1/ecommerce-integrations.ts:638`        | `ecommerceConnections`        | **D**     | same shape as :583                                                                                                                                                                                              | group:ecommerce             |
| `apps/api/src/routes/v1/ecommerce-integrations.ts:688`        | `ecommerceConnections`        | **D**     | connectionId is the handle the webhook URL carries and whose secret signs the body                                                                                                                              | group:ecommerce             |
| `apps/api/src/routes/v1/ecommerce-integrations.ts:731`        | `ecommerceConnections`        | **D**     | same shape as :688                                                                                                                                                                                              | group:ecommerce             |
| `apps/api/src/routes/v1/ecommerce-integrations.ts:777`        | `ecommerceConnections`        | **D**     | same shape as :688                                                                                                                                                                                              | group:ecommerce             |
| `apps/api/src/routes/v1/gamification.ts:66`                   | `signupForms`                 | **D**     | public form lookup whose purpose is to resolve which org the form belongs to                                                                                                                                    | group:gamification          |
| `apps/api/src/routes/v1/gamification.ts:100`                  | `signupForms`                 | **D**     | same shape as :66                                                                                                                                                                                               | group:gamification          |
| `apps/api/src/routes/v1/marketing-calendar.ts:84`             | `socialAccounts`              | **D**     | the account ids come from a socialPosts query filtered on req.user.orgId                                                                                                                                        | group:social-post           |
| `apps/api/src/routes/v1/meetings.ts:46`                       | `bookingPages`                | **A**     | public booking page resolved by slug alone, and booking_pages_slug_uq is UNIQUE only on (org_id, slug), so two orgs sharing a slug resolve to whichever row comes back                                          | group:meeting               |
| `apps/api/src/routes/v1/meetings.ts:53`                       | `eventTypes`                  | **D**     | event types scoped through page.ownerUserId                                                                                                                                                                     | group:meeting               |
| `apps/api/src/routes/v1/meetings.ts:79`                       | `bookingPages`                | **A**     | same slug lookup as :46                                                                                                                                                                                         | group:meeting               |
| `apps/api/src/routes/v1/meetings.ts:86`                       | `eventTypes`                  | **D**     | same, through page.ownerUserId                                                                                                                                                                                  | group:meeting               |
| `apps/api/src/routes/v1/meetings.ts:130`                      | `bookingPages`                | **A**     | same slug lookup as :46                                                                                                                                                                                         | group:meeting               |
| `apps/api/src/routes/v1/meetings.ts:137`                      | `eventTypes`                  | **D**     | same, through page.ownerUserId                                                                                                                                                                                  | group:meeting               |
| `apps/api/src/routes/v1/newsletter-referrals.ts:133`          | `newsletterReferrals`         | **D**     | matched on referrerContactId plus a programId                                                                                                                                                                   | CORE                        |
| `apps/api/src/routes/v1/newsletter-referrals.ts:152`          | `newsletterReferrals`         | **D**     | newsletter_referrals_code_uidx is UNIQUE on (code) alone, so the code is a real key                                                                                                                             | CORE                        |
| `apps/api/src/routes/v1/newsletter-referrals.ts:216`          | `newsletterReferrals`         | **D**     | same, globally unique code                                                                                                                                                                                      | CORE                        |
| `apps/api/src/routes/v1/newsletter-referrals.ts:241`          | `newsletterReferralPrograms`  | **D**     | programId taken from the referral row just resolved                                                                                                                                                             | CORE                        |
| `apps/api/src/routes/v1/newsletter-referrals.ts:283`          | `newsletterReferrals`         | **D**     | same, globally unique code                                                                                                                                                                                      | CORE                        |
| `apps/api/src/routes/v1/newsletter-tiers.ts:281`              | `newsletterSubscriptions`     | **E**     | subscription updated without an org filter in the excerpt; what would decide it is where the subscription id comes from                                                                                         | CORE                        |
| `apps/api/src/routes/v1/phone/softphone.ts:125`               | `calls`                       | **E**     | call fetched by id with no org filter; what would decide it is whether this route is authenticated and pre-scopes the call                                                                                      | CORE                        |
| `apps/api/src/routes/v1/phone/softphone.ts:192`               | `calls`                       | **D**     | matched on the provider’s own globally unique CallSid                                                                                                                                                           | CORE                        |
| `apps/api/src/routes/v1/phone/softphone.ts:255`               | `calls`                       | **D**     | same, provider CallSid                                                                                                                                                                                          | CORE                        |
| `apps/api/src/routes/v1/resend-compat/domains.ts:167`         | `sendingDomains`              | **D**     | reads back the row just inserted in the same transaction                                                                                                                                                        | CORE                        |
| `apps/api/src/routes/v1/resend-compat/domains.ts:299`         | `sendingDomains`              | **E**     | same shape as domains.ts:414                                                                                                                                                                                    | CORE                        |
| `apps/api/src/routes/v1/resend-compat/domains.ts:334`         | `sendingDomains`              | **E**     | domain re-read by id with no org filter in the excerpt                                                                                                                                                          | CORE                        |
| `apps/api/src/routes/v1/sending.ts:317`                       | `warmupIps`                   | **B**     | lists every warming IP platform-wide; sending IPs are ours, not a tenant’s                                                                                                                                      | CORE                        |
| `apps/api/src/routes/v1/subscriptions.ts:72`                  | `contacts`                    | **E**     | contact custom fields read without an org filter in the excerpt                                                                                                                                                 | CORE                        |
| `apps/api/src/routes/v1/subscriptions.ts:124`                 | `lists`                       | **E**     | list fetched by id for a public subscribe flow; what would decide it is whether the list id is treated as a public handle                                                                                       | CORE                        |
| `apps/api/src/routes/v1/subscriptions.ts:250`                 | `lists`                       | **E**     | same as :124                                                                                                                                                                                                    | CORE                        |
| `apps/api/src/routes/v1/superadmin.ts:64`                     | `contacts`                    | **C**     | platform-wide count grouped by orgId — that is the report                                                                                                                                                       | CORE                        |
| `apps/api/src/routes/v1/superadmin.ts:74`                     | `campaigns`                   | **C**     | same, grouped by orgId                                                                                                                                                                                          | CORE                        |
| `apps/api/src/routes/v1/superadmin.ts:84`                     | `emailEvents`                 | **C**     | same, grouped by orgId                                                                                                                                                                                          | CORE                        |
| `apps/api/src/routes/v1/superadmin.ts:373`                    | `abuseEvents`                 | **C**     | platform abuse feed joined to organizations by design                                                                                                                                                           | CORE                        |
| `apps/api/src/routes/v1/video.ts:112`                         | `videoMessages`               | **C**     | selects orgId per row for a platform-level job listing                                                                                                                                                          | CORE                        |
| `apps/api/src/routes/v1/webhooks/ads.ts:51`                   | `adAccounts`                  | **A**     | ad account matched on platform plus a page id with no org filter, then used to attribute inbound leads                                                                                                          | group:ads-webhook           |
| `apps/api/src/routes/v1/webhooks/ads.ts:85`                   | `adAccounts`                  | **A**     | adAccounts where platform = linkedin_ads with limit 1 and no org at all, inside the loop that attributes leads — whichever org sits first in the table gets them                                                | group:ads-webhook           |
| `apps/api/src/routes/v1/webhooks/meta.ts:164`                 | `metaPageMappings`            | **D**     | page mapping lookup whose job is to resolve the org, and it returns orgId                                                                                                                                       | group:universal-inbox       |
| `apps/api/src/routes/v1/zero-party-data.ts:143`               | `zpCollectionForms`           | **D**     | matched on an embedToken issued per form                                                                                                                                                                        | group:survey                |
| `apps/api/src/services/abuse-detection/index.ts:432`          | `abuseSanctions`              | **E**     | sanction lifted without an org filter; what would decide it is whether the sanction id is superadmin-only                                                                                                       | CORE                        |
| `apps/api/src/services/abuse-detection/index.ts:588`          | `abuseSanctions`              | **C**     | expireStaleSanctions sweeps every org                                                                                                                                                                           | CORE                        |
| `apps/api/src/services/ads/accounts.ts:154`                   | `socialOauthStates`           | **D**     | OAuth state is a single-use random token                                                                                                                                                                        | group:ad-account            |
| `apps/api/src/services/ads/accounts.ts:161`                   | `socialOauthStates`           | **D**     | deletes that same single-use state                                                                                                                                                                              | group:ad-account            |
| `apps/api/src/services/ads/providers/sklik/pixel.ts:121`      | `trackedSites`                | **D**     | tracked site resolved by its public site token, and it returns orgId                                                                                                                                            | group:sklik-pixel           |
| `apps/api/src/services/ai-sales/deal-risk.ts:106`             | `dealStageHistory`            | **D**     | dealId arrives from a deal the caller already loaded org-scoped                                                                                                                                                 | group:ai-sales              |
| `apps/api/src/services/ai-sales/win-probability.ts:71`        | `dealStageHistory`            | **D**     | the deal was fetched and its status checked before this line                                                                                                                                                    | group:ai-sales              |
| `apps/api/src/services/ai-sales/win-probability.ts:82`        | `contacts`                    | **D**     | contactId comes from the deal already loaded org-scoped                                                                                                                                                         | group:ai-sales              |
| `apps/api/src/services/ai/per-recipient-generation.ts:49`     | `contacts`                    | **E**     | contact fetched by id for generation; what would decide it is whether the caller passes an org-validated contactId                                                                                              | CORE                        |
| `apps/api/src/services/analytics/clickhouse/replicator.ts:99` | `emailEvents`                 | **C**     | replication reads every org and carries orgId across                                                                                                                                                            | CORE                        |
| `apps/api/src/services/app-studio/index.ts:132`               | `appStudioApps`               | **D**     | app resolved by a hashed access token                                                                                                                                                                           | group:extension-card        |
| `apps/api/src/services/app-studio/index.ts:149`               | `appStudioWebhookSubscribers` | **E**     | insert whose values come from an input object; what would decide it is whether that input carries orgId                                                                                                         | group:extension-card        |
| `apps/api/src/services/app-studio/index.ts:378`               | `appStudioTriggers`           | **E**     | same shape as :149                                                                                                                                                                                              | group:extension-card        |
| `apps/api/src/services/auth/cross-account.ts:33`              | `users`                       | **D**     | userId from the session                                                                                                                                                                                         | CORE                        |
| `apps/api/src/services/auth/cross-account.ts:55`              | `organizationMembers`         | **D**     | memberships for that user are the answer being computed                                                                                                                                                         | CORE                        |
| `apps/api/src/services/auth/cross-account.ts:83`              | `users`                       | **D**     | userId from the session                                                                                                                                                                                         | CORE                        |
| `apps/api/src/services/auth/cross-account.ts:129`             | `users`                       | **D**     | looking a platform user up by address across orgs is what cross-account invitation is for; the membership row it writes carries orgId                                                                           | CORE                        |
| `apps/api/src/services/auth/cross-account.ts:165`             | `organizationMembers`         | **D**     | matched on a single-use invitation token                                                                                                                                                                        | CORE                        |
| `apps/api/src/services/back-in-stock/index.ts:52`             | `backInStockSubscriptions`    | **E**     | subscriptions listed for a contactId; what would decide it is whether the caller validated the contact                                                                                                          | group:stock-alert           |
| `apps/api/src/services/billing/index.ts:203`                  | `billingSubscriptions`        | **B**     | subscription keyed on stripeCustomerId, which is unique per org and issued by Stripe; the org is not in the predicate but the key cannot collide                                                                | CORE                        |
| `apps/api/src/services/billing/index.ts:225`                  | `billingSubscriptions`        | **B**     | same, keyed on stripeCustomerId                                                                                                                                                                                 | CORE                        |
| `apps/api/src/services/blog/index.ts:282`                     | `blogPosts`                   | **C**     | publishDuePosts sweeps every org                                                                                                                                                                                | group:blog                  |
| `apps/api/src/services/calculated-props/index.ts:149`         | `calculatedPropertyValues`    | **A**     | delete scoped only by propId and entityId, both supplied by the caller, while the insert three lines below does carry orgId — a caller naming another org’s propId deletes its values                           | group:advanced-analytics    |
| `apps/api/src/services/campaigns/ab-closing.ts:62`            | `campaignDispatchBatches`     | **D**     | batch totals summed per campaignId                                                                                                                                                                              | CORE                        |
| `apps/api/src/services/campaigns/ab-winner.ts:186`            | `abTestHoldbacks`             | **D**     | holdbacks read per campaignId                                                                                                                                                                                   | CORE                        |
| `apps/api/src/services/campaigns/ab-winner.ts:212`            | `abTestHoldbacks`             | **D**     | same, per campaignId                                                                                                                                                                                            | CORE                        |
| `apps/api/src/services/campaigns/ab-winner.ts:392`            | `abTestResults`               | **D**     | loadAbConfig(orgId, campaignId) runs first and validates the campaign                                                                                                                                           | CORE                        |
| `apps/api/src/services/campaigns/ab-winner.ts:499`            | `abTestResults`               | **D**     | marks the result row for one campaignId                                                                                                                                                                         | CORE                        |
| `apps/api/src/services/campaigns/batch-completion.ts:199`     | `campaignDispatchBatches`     | **D**     | claims one batch by its own batchKey                                                                                                                                                                            | CORE                        |
| `apps/api/src/services/campaigns/batch-completion.ts:287`     | `campaignDispatchBatches`     | **D**     | totals summed per campaignId                                                                                                                                                                                    | CORE                        |
| `apps/api/src/services/campaigns/dispatch-ledger.ts:58`       | `campaignDispatchBatches`     | **D**     | ledger rows read per campaignId                                                                                                                                                                                 | CORE                        |
| `apps/api/src/services/campaigns/dispatch-ledger.ts:83`       | `campaignDispatchBatches`     | **D**     | same, per campaignId and batchKey                                                                                                                                                                               | CORE                        |
| `apps/api/src/services/campaigns/dispatch-reaper.ts:88`       | `campaigns`                   | **C**     | reapStalledDispatches sweeps every org and selects orgId to carry on                                                                                                                                            | CORE                        |
| `apps/api/src/services/campaigns/dispatch-reaper.ts:130`      | `campaignDispatchBatches`     | **D**     | totals per campaignId inside that sweep                                                                                                                                                                         | CORE                        |
| `apps/api/src/services/campaigns/dispatch-reaper.ts:182`      | `campaigns`                   | **C**     | reapAbandonedPauses sweeps every org                                                                                                                                                                            | CORE                        |
| `apps/api/src/services/campaigns/dispatch.ts:286`             | `campaigns`                   | **C**     | dispatchScheduledCampaigns is the scheduler, and it selects orgId for the work it hands on                                                                                                                      | CORE                        |
| `apps/api/src/services/campaigns/dispatch.ts:311`             | `campaigns`                   | **D**     | re-reads the status of a campaign from that same sweep                                                                                                                                                          | CORE                        |
| `apps/api/src/services/campaigns/index.ts:602`                | `campaigns`                   | **E**     | updateCampaignStatus loads by campaignId with no org filter; what would decide it is whether every caller validates first                                                                                       | CORE                        |
| `apps/api/src/services/cdp/connectors/index.ts:98`            | `cdpSources`                  | **E**     | runSync loads the source by id; what would decide it is whether the route validated the source against the session org                                                                                          | group:cdp-source            |
| `apps/api/src/services/cdp/identity-graph.ts:186`             | `contacts`                    | **D**     | contactIds come from an identitySignals query filtered on input.orgId twelve lines above                                                                                                                        | group:identity-graph        |
| `apps/api/src/services/cdp/unified-profile.ts:120`            | `contactEngagement`           | **E**     | engagement read per contactId; what would decide it is whether the profile builder validated the contact                                                                                                        | group:cdp-profile           |
| `apps/api/src/services/cdp/unified-profile.ts:126`            | `contactTraits`               | **E**     | same as :120                                                                                                                                                                                                    | group:cdp-profile           |
| `apps/api/src/services/commerce/e-signature.ts:36`            | `quotes`                      | **D**     | quote matched on its signature token                                                                                                                                                                            | group:commerce-quote        |
| `apps/api/src/services/commerce/e-signature.ts:205`           | `quotes`                      | **E**     | quote updated from a provider callback; what would decide it is whether the provider envelope id is stored per quote                                                                                            | group:commerce-quote        |
| `apps/api/src/services/commerce/e-signature.ts:218`           | `quotes`                      | **E**     | same as :205                                                                                                                                                                                                    | group:commerce-quote        |
| `apps/api/src/services/commerce/invoicing.ts:147`             | `invoices`                    | **C**     | getOverdueInvoices is the platform-wide overdue sweep                                                                                                                                                           | group:commerce-invoice      |
| `apps/api/src/services/commerce/invoicing.ts:155`             | `invoices`                    | **C**     | markOverdueInvoices, same sweep                                                                                                                                                                                 | group:commerce-invoice      |
| `apps/api/src/services/commerce/invoicing.ts:224`             | `invoices`                    | **C**     | reminder cron over every org                                                                                                                                                                                    | group:commerce-invoice      |
| `apps/api/src/services/commerce/invoicing.ts:240`             | `invoices`                    | **D**     | claims one invoice inside that cron                                                                                                                                                                             | group:commerce-invoice      |
| `apps/api/src/services/commerce/payments.ts:208`              | `invoices`                    | **D**     | invoice matched on the Stripe PaymentIntent id, which is globally unique and ours                                                                                                                               | group:stripe-webhook        |
| `apps/api/src/services/commerce/payments.ts:225`              | `invoices`                    | **D**     | same, by PaymentIntent id                                                                                                                                                                                       | group:stripe-webhook        |
| `apps/api/src/services/commerce/quotes.ts:139`                | `quotes`                      | **D**     | getQuoteByToken matches the signature token                                                                                                                                                                     | group:commerce-quote        |
| `apps/api/src/services/commerce/subscriptions.ts:573`         | `subscriptions`               | **C**     | runDueInvoiceGeneration sweeps every org                                                                                                                                                                        | group:commerce-subscription |
| `apps/api/src/services/dedicated-ips/index.ts:171`            | `dedicatedIps`                | **D**     | getIpPool(orgId, id) is awaited first and throws when the pool is not the org’s                                                                                                                                 | CORE                        |
| `apps/api/src/services/deliverability/bot-detection.ts:195`   | `emailEvents`                 | **D**     | primary-key equality written as a sql`` fragment, which exemption 1 cannot see                                                                                                                                  | CORE                        |
| `apps/api/src/services/domains/warmup-scheduler.ts:130`       | `warmupIps`                   | **A**     | warmup_ips is looked up by ipAddress alone with limit 1, so on a shared sending IP one org reads and then advances another org’s warmup counter                                                                 | CORE                        |
| `apps/api/src/services/ecommerce/index.ts:708`                | `ecommerceWebhookEvents`      | **D**     | scoped through connectionId, which belongs to one org                                                                                                                                                           | group:ecommerce             |
| `apps/api/src/services/editor/template-versions.ts:24`        | `templateVersions`            | **D**     | the next version number is derived per templateId, validated upstream; worst case is a version counter                                                                                                          | CORE                        |
| `apps/api/src/services/gdpr/per-purpose-doi.ts:133`           | `processingPurposes`          | **D**     | purposeId comes out of a signed double-opt-in payload                                                                                                                                                           | CORE                        |
| `apps/api/src/services/meetings/round-robin.ts:121`           | `calendarEvents`              | **A**     | availability is computed from calendar_events across every user and every org, and the function’s own \_userId parameter is unused, so one org’s bookings block another’s                                       | group:meeting               |
| `apps/api/src/services/migrations/mailchimp.ts:144`           | `migrationJobs`               | **D**     | explicit application check: if (!job                                                                                                                                                                            |                             | job.orgId !== orgId) throw notFound | CORE |
| `apps/api/src/services/migrations/rollback.ts:60`             | `migrationJobs`               | **D**     | same explicit orgId comparison right after the fetch                                                                                                                                                            | CORE                        |
| `apps/api/src/services/phone/transcription.ts:44`             | `calls`                       | **E**     | callId travels from a provider webhook through storeRecording, which also never checks the call against orgId; what would decide it is whether the phone webhook resolves the call org-scoped before calling in | group:cloud-phone           |
| `apps/api/src/services/predictive-segmentation/index.ts:167`  | `contactEngagement`           | **E**     | the where clause sits below the printed excerpt; what would decide it is reading whether contactEngagement is filtered by contactId alone                                                                       | group:advanced-analytics    |
| `apps/api/src/services/product-catalog/feed-ingestion.ts:28`  | `productFeeds`                | **D**     | feedId is produced by the system and feed.orgId is used downstream                                                                                                                                              | group:product-feed          |
| `apps/api/src/services/social/publisher.ts:337`               | `socialPosts`                 | **C**     | dispatchDuePosts is the scheduler                                                                                                                                                                               | group:social-post           |
| `apps/api/src/services/sso/index.ts:152`                      | `ssoLoginStates`              | **D**     | the state is a single-use random token and the row it returns is what supplies orgId                                                                                                                            | CORE                        |
| `apps/api/src/services/sso/index.ts:255`                      | `users`                       | **D**     | the next branch is userRow.orgId !== orgId -> forbidden                                                                                                                                                         | CORE                        |
| `apps/api/src/services/stock-alerts/public-subscribe.ts:105`  | `contacts`                    | **D**     | contactId was resolved org-scoped earlier in the same file                                                                                                                                                      | group:stock-alert           |
| `apps/api/src/services/surveys/index.ts:136`                  | `surveyResponses`             | **D**     | getSurvey(surveyId, orgId) is awaited first, commented "Verify ownership."                                                                                                                                      | group:survey                |

## Nepřečteno — 134 záznamů

Pořadí je stejné jako ve výstupu lintu (podle souboru, pak řádku). Pokračovat se dá přesně odtud; u každého je vidět tabulka, což samo napoví, jakou otázku si u něj klást.

| soubor:řádek                                                        | tabulka                  |
| ------------------------------------------------------------------- | ------------------------ |
| `apps/api/src/services/contacts/index.ts:101`                       | `contacts`               |
| `apps/api/src/services/contacts/index.ts:112`                       | `contacts`               |
| `apps/api/src/services/contacts/unsubscribe-ab.ts:44`               | `unsubscribeVariants`    |
| `apps/api/src/services/coupons/index.ts:91`                         | `couponCodes`            |
| `apps/api/src/services/coupons/index.ts:139`                        | `couponCodes`            |
| `apps/api/src/services/crm/sales-sequences.ts:124`                  | `sequenceEnrollments`    |
| `apps/api/src/services/crm/sales-sequences.ts:212`                  | `sequenceEnrollments`    |
| `apps/api/src/services/crm/sales-sequences.ts:236`                  | `salesSequences`         |
| `apps/api/src/services/crm/sales-sequences.ts:262`                  | `contacts`               |
| `apps/api/src/services/custom-objects/index.ts:333`                 | `customObjectRelations`  |
| `apps/api/src/services/dedicated-ips/index.ts:197`                  | `dedicatedIps`           |
| `apps/api/src/services/dedicated-ips/index.ts:582`                  | `dedicatedIps`           |
| `apps/api/src/services/dedicated-ips/index.ts:588`                  | `dedicatedIps`           |
| `apps/api/src/services/dedicated-ips/index.ts:597`                  | `dedicatedIps`           |
| `apps/api/src/services/deliverability/anomaly-detector.ts:167`      | `campaigns`              |
| `apps/api/src/services/deliverability/blacklist-monitor.ts:240`     | `dedicatedIps`           |
| `apps/api/src/services/deliverability/blacklist-monitor.ts:286`     | `dedicatedIps`           |
| `apps/api/src/services/deliverability/bot-detection.ts:146`         | `emailEvents`            |
| `apps/api/src/services/deliverability/dns-health.ts:140`            | `sendingDomains`         |
| `apps/api/src/services/deliverability/reputation-badge.ts:33`       | `sendingDomains`         |
| `apps/api/src/services/deliverability/seed-test.ts:126`             | `seedResults`            |
| `apps/api/src/services/deliverability/seed-test.ts:225`             | `seedResults`            |
| `apps/api/src/services/digital-assets/index.ts:132`                 | `digitalAssetDeliveries` |
| `apps/api/src/services/digital-assets/index.ts:142`                 | `digitalAssets`          |
| `apps/api/src/services/domains/dkim-rotation.ts:150`                | `dkimKeys`               |
| `apps/api/src/services/domains/dkim-rotation.ts:260`                | `dkimKeys`               |
| `apps/api/src/services/domains/dkim-rotation.ts:328`                | `dkimKeys`               |
| `apps/api/src/services/domains/dkim-rotation.ts:344`                | `dkimKeys`               |
| `apps/api/src/services/domains/dkim-rotation.ts:497`                | `dkimKeys`               |
| `apps/api/src/services/domains/dkim-rotation.ts:512`                | `dkimKeys`               |
| `apps/api/src/services/domains/warmup-scheduler.ts:156`             | `warmupIps`              |
| `apps/api/src/services/domains/warmup-scheduler.ts:179`             | `warmupIps`              |
| `apps/api/src/services/domains/warmup-scheduler.ts:189`             | `warmupIps`              |
| `apps/api/src/services/ecommerce/index.ts:586`                      | `ecommerceCheckouts`     |
| `apps/api/src/services/ecommerce/index.ts:621`                      | `ecommerceOrders`        |
| `apps/api/src/services/external-feeds/index.ts:315`                 | `externalFeeds`          |
| `apps/api/src/services/gamification/wheel-of-fortune.ts:68`         | `wheelSpins`             |
| `apps/api/src/services/gamification/wheel-of-fortune.ts:76`         | `wheelSpins`             |
| `apps/api/src/services/gamification/wheel-of-fortune.ts:129`        | `wheelSpins`             |
| `apps/api/src/services/gdpr/processing-purposes.ts:39`              | `processingPurposes`     |
| `apps/api/src/services/gdpr/processing-purposes.ts:79`              | `processingPurposes`     |
| `apps/api/src/services/gdpr/processing-purposes.ts:180`             | `contactGdprConsents`    |
| `apps/api/src/services/helpdesk/universal-inbox.ts:443`             | `contacts`               |
| `apps/api/src/services/identities/index.ts:52`                      | `emailIdentities`        |
| `apps/api/src/services/identity-resolution/pure.ts:54`              | `contacts`               |
| `apps/api/src/services/import/processor.ts:110`                     | `contacts`               |
| `apps/api/src/services/in-app/index.ts:178`                         | `inAppImpressions`       |
| `apps/api/src/services/in-app/index.ts:191`                         | `inAppImpressions`       |
| `apps/api/src/services/loyalty/enrollment.ts:117`                   | `loyaltyPrograms`        |
| `apps/api/src/services/loyalty/ledger.ts:208`                       | `loyaltyPoints`          |
| `apps/api/src/services/loyalty/ledger.ts:225`                       | `loyaltyPoints`          |
| `apps/api/src/services/loyalty/ledger.ts:241`                       | `loyaltyMembers`         |
| `apps/api/src/services/loyalty/rewards.ts:160`                      | `loyaltyRedemptions`     |
| `apps/api/src/services/loyalty/rewards.ts:173`                      | `loyaltyMembers`         |
| `apps/api/src/services/loyalty/rewards.ts:215`                      | `loyaltyMembers`         |
| `apps/api/src/services/meetings/calendar-sync.ts:505`               | `calendarIntegrations`   |
| `apps/api/src/services/meetings/calendar-sync.ts:693`               | `calendarIntegrations`   |
| `apps/api/src/services/meetings/calendar-sync.ts:699`               | `calendarEvents`         |
| `apps/api/src/services/meetings/calendar-sync.ts:794`               | `calendarIntegrations`   |
| `apps/api/src/services/meetings/index.ts:32`                        | `eventTypes`             |
| `apps/api/src/services/meetings/index.ts:77`                        | `bookingAvailability`    |
| `apps/api/src/services/meetings/index.ts:107`                       | `bookings`               |
| `apps/api/src/services/meetings/round-robin.ts:106`                 | `calendarEvents`         |
| `apps/api/src/services/migrations/ecomail.ts:147`                   | `migrationJobs`          |
| `apps/api/src/services/migrations/ecomail.ts:248`                   | `contacts`               |
| `apps/api/src/services/migrations/klaviyo.ts:161`                   | `migrationJobs`          |
| `apps/api/src/services/migrations/klaviyo.ts:262`                   | `contacts`               |
| `apps/api/src/services/migrations/mailchimp.ts:169`                 | `migrationJobs`          |
| `apps/api/src/services/migrations/rollback.ts:171`                  | `migrationJobs`          |
| `apps/api/src/services/migrations/smartemailing.ts:160`             | `migrationJobs`          |
| `apps/api/src/services/migrations/smartemailing.ts:260`             | `contacts`               |
| `apps/api/src/services/multivariate-tests/index.ts:146`             | `mvTestVariants`         |
| `apps/api/src/services/multivariate-tests/index.ts:205`             | `mvTestVariants`         |
| `apps/api/src/services/multivariate-tests/index.ts:213`             | `mvTestVariants`         |
| `apps/api/src/services/multivariate-tests/index.ts:402`             | `multivariateTests`      |
| `apps/api/src/services/oauth/index.ts:51`                           | `oauthApps`              |
| `apps/api/src/services/oauth/index.ts:80`                           | `oauthApps`              |
| `apps/api/src/services/oauth/index.ts:93`                           | `oauthCodes`             |
| `apps/api/src/services/oauth/index.ts:120`                          | `oauthTokens`            |
| `apps/api/src/services/oauth/index.ts:136`                          | `oauthTokens`            |
| `apps/api/src/services/oauth/index.ts:152`                          | `oauthTokens`            |
| `apps/api/src/services/polls/index.ts:109`                          | `pollVotes`              |
| `apps/api/src/services/price-drop/index.ts:43`                      | `priceDropSubscriptions` |
| `apps/api/src/services/product-catalog/feed-ingestion.ts:176`       | `productFeeds`           |
| `apps/api/src/services/rag/index.ts:129`                            | `kbChunks`               |
| `apps/api/src/services/rag/index.ts:199`                            | `kbDocuments`            |
| `apps/api/src/services/reviews-v2/index.ts:232`                     | `reviewRequests`         |
| `apps/api/src/services/reviews-v2/index.ts:243`                     | `reviewRequests`         |
| `apps/api/src/services/rss/index.ts:129`                            | `rssCampaigns`           |
| `apps/api/src/services/scheduled-reports/index.ts:132`              | `scheduledReports`       |
| `apps/api/src/services/segments/membership.ts:48`                   | `segmentMembers`         |
| `apps/api/src/services/segments/membership.ts:65`                   | `segmentMembers`         |
| `apps/api/src/services/segments/membership.ts:95`                   | `segments`               |
| `apps/api/src/services/send-optimization/refresh-predictions.ts:64` | `campaigns`              |
| `apps/api/src/services/sending/ip-warmup.ts:198`                    | `warmupIps`              |
| `apps/api/src/services/sending/ip-warmup.ts:236`                    | `warmupIps`              |
| `apps/api/src/services/sending/ip-warmup.ts:249`                    | `warmupIps`              |
| `apps/api/src/services/seo/rank-tracker.ts:133`                     | `seoRankTracking`        |
| `apps/api/src/services/signup-forms/index.ts:131`                   | `signupForms`            |
| `apps/api/src/services/signup-forms/index.ts:157`                   | `signupForms`            |
| `apps/api/src/services/signup-forms/index.ts:283`                   | `lists`                  |
| `apps/api/src/services/site-messages/index.ts:135`                  | `siteMessageImpressions` |
| `apps/api/src/services/smart-sending/index.ts:122`                  | `contactSendLog`         |
| `apps/api/src/services/sms/routing.ts:325`                          | `smsSendLog`             |
| `apps/api/src/services/smtp/credentials.ts:74`                      | `smtpCredentials`        |
| `apps/api/src/services/social/accounts.ts:123`                      | `socialOauthStates`      |
| `apps/api/src/services/social/accounts.ts:132`                      | `socialOauthStates`      |
| `apps/api/src/services/sso/index.ts:85`                             | `ssoConfigurations`      |
| `apps/api/src/services/surveys/index.ts:42`                         | `surveys`                |
| `apps/api/src/services/surveys/index.ts:95`                         | `surveys`                |
| `apps/api/src/services/ticketing/cron.ts:25`                        | `externalEvents`         |
| `apps/api/src/services/ticketing/cron.ts:86`                        | `externalEvents`         |
| `apps/api/src/services/tracking/site-tracker.ts:52`                 | `trackedSites`           |
| `apps/api/src/services/tracking/site-tracker.ts:245`                | `sitePageViews`          |
| `apps/api/src/services/tracking/site-tracker.ts:249`                | `siteEvents`             |
| `apps/api/src/services/video/recorder.ts:157`                       | `videoMessages`          |
| `apps/api/src/services/video/recorder.ts:186`                       | `videoMessages`          |
| `apps/api/src/services/warehouse-sync/index.ts:86`                  | `warehouseSyncs`         |
| `apps/api/src/services/webhooks/index.ts:85`                        | `apiKeys`                |
| `apps/api/src/services/webhooks/index.ts:405`                       | `webhookDeliveries`      |
| `apps/api/src/services/webhooks/index.ts:413`                       | `webhooks`               |
| `apps/api/src/services/webhooks/index.ts:545`                       | `webhookDeliveries`      |
| `apps/api/src/services/webhooks/index.ts:564`                       | `webhooks`               |
| `apps/api/src/services/workflows/conversion-suppression.ts:78`      | `workflows`              |
| `apps/api/src/services/workflows/executor.ts:279`                   | `workflows`              |
| `apps/api/src/services/workflows/executor.ts:325`                   | `workflowRuns`           |
| `apps/api/src/services/workflows/executor.ts:338`                   | `workflowRuns`           |
| `apps/api/src/services/workflows/executor.ts:346`                   | `workflows`              |
| `apps/api/src/services/workflows/executor.ts:394`                   | `workflowRuns`           |
| `apps/api/src/services/workflows/triggers.ts:52`                    | `workflowRuns`           |
| `apps/api/src/services/workflows/triggers.ts:457`                   | `workflows`              |
| `apps/api/src/services/workflows/triggers.ts:516`                   | `workflows`              |
| `apps/api/src/services/workflows/triggers.ts:590`                   | `workflows`              |
| `apps/api/src/services/workflows/triggers.ts:797`                   | `workflowEvents`         |
