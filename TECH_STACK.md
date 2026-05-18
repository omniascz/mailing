# ForgeMsg — Tech Stack Validation

> Finalized: 2026-04-11
> **Infrastructure section revised: 2026-05-18** — pivot AWS EKS → Hetzner + Vercel. Důvod: AWS odmítl onboarding marketing mailů; vlastní MTA infrastruktura potřebuje bulk-friendly hosting; ~75 % úspora nákladů. Detail v `infra/PIVOT_AWS_TO_HETZNER.md`, `infra/HOSTING_DETAIL.md`, `infra/DELIVERABILITY.md`.
> Status: ✅ Validated for MVP through Scale (50k users)

This document captures the **why** behind every technology choice, alternatives that were considered, and the trade-offs we accepted. It is the source of truth for architectural decisions; CLAUDE.md remains the operational reference.

---

## Decision Framework

Every component is evaluated against:
1. **Cost at scale** — what does 10k → 50k users actually cost?
2. **Operational burden** — can a small team operate this without an SRE?
3. **Vendor lock-in** — how hard is migration if we need to change?
4. **Talent availability** — can we hire engineers who know it?
5. **Failure mode** — what happens when this component dies?

---

## Backend

### API Framework — Fastify (TypeScript)

**Chosen**: Fastify 5.x with TypeScript strict mode, Zod validation, OpenAPI auto-gen.

**Why**:
- ~30k req/s on a single Node 22 process — 2–3× faster than Express
- First-class TypeScript and async/await
- Plugin architecture matches our needs (auth, rate-limit, cors as composable units)
- Built-in JSON schema validation; pairs naturally with `@fastify/swagger` for OpenAPI

**Alternatives considered**:
| Option | Rejected because |
|--------|------------------|
| **Express** | Slower, weaker TS story, no built-in validation |
| **Hono** | Newer ecosystem, fewer battle-tested plugins for our needs (rate-limit, swagger) |
| **NestJS** | Decorator/DI overhead; team prefers explicit composition |
| **Go (Gin/Echo)** | Splits language across team; we keep Go for performance-critical paths only (engine, sms-gateway) |

**Trade-offs accepted**:
- Plugin loading order matters; documented in CLAUDE.md
- Schema validation via JSON Schema OR Zod (we use Zod, then convert for OpenAPI)

### Sending Engine — Go

**Chosen**: Go 1.23 for the email MTA (`apps/engine`) and SMS SMPP gateway (`apps/sms-gateway`).

**Why**:
- Goroutines = cheap concurrency for thousands of simultaneous SMTP/SMPP connections
- Low GC pauses → predictable latency under load
- Native `net/smtp` and SMPP libraries (`fiorix/go-smpp`)
- Single static binary → trivial Docker/K8s deploys

**Alternatives considered**:
| Option | Rejected because |
|--------|------------------|
| **Node.js** | Connection pooling for 10k+ persistent SMTP/SMPP sockets is awkward; GC pauses hurt throughput |
| **Rust** | Steeper learning curve, smaller hiring pool, build times |
| **Java/Kotlin** | JVM startup overhead, heavier ops |

**Trade-offs accepted**:
- Two languages in the codebase (TS + Go). Justified by clear boundary: TS for everything except the hot path of message dispatch.
- Cross-language gRPC contract maintenance.

### Frontend — Next.js 15 App Router + React 19 + Tailwind v4

**Chosen**: Next.js 15 with App Router, React 19 server components, Tailwind v4 (CSS-based config).

**Why**:
- Server components reduce client JS by default
- App Router handles auth-gated routes via layout composition naturally
- Tailwind v4's CSS-first config plays well with our design tokens (no JS config file)
- Vercel-grade DX even when self-hosted

**Alternatives considered**:
| Option | Rejected because |
|--------|------------------|
| **Remix/React Router 7** | Smaller plugin ecosystem for our needs (analytics, dashboards) |
| **SvelteKit** | Smaller hiring pool; team is React-fluent |
| **Vite + React Router** | We'd reinvent SSR for SEO-relevant pages (marketing, docs) |

**Trade-offs accepted**:
- App Router learning curve for engineers used to Pages Router
- React 19 compiler still maturing — we accept occasional escape hatches

---

## Data Layer

### Primary Database — PostgreSQL 16

**Chosen**: PostgreSQL 16 with Drizzle ORM, multi-AZ RDS in production.

**Why**:
- JSONB for flexible fields (custom_fields, conditions, metadata) without schema migrations
- `pg_trgm` for full-text contact search
- Mature replication, point-in-time recovery, broad ops familiarity
- UUID v7 support via `crypto.randomUUID()` keeps inserts sequential-ish

**Alternatives considered**:
| Option | Rejected because |
|--------|------------------|
| **MySQL/MariaDB** | Weaker JSONB story, weaker FTS |
| **CockroachDB** | Operational cost not justified at our scale; we accept single-region writes |
| **PlanetScale** | Vitess constraints (no FK enforcement) clash with our relational model |
| **DynamoDB** | Wrong shape for relational data (campaigns ↔ contacts ↔ events) |

**Trade-offs accepted**:
- Single-region writes until we have a real reason for global deployment
- Vertical scaling first, sharding only if `r7g.16xlarge` runs out

### ORM — Drizzle

**Chosen**: Drizzle ORM with `postgres.js` driver.

**Why**:
- Type-safe SQL builder, **not** a leaky abstraction (queries look like SQL)
- Generates migrations from TypeScript schema; Studio for inspection
- Zero runtime overhead — compiles to plain SQL
- Plays well with edge runtimes if we ever need them

**Alternatives considered**:
| Option | Rejected because |
|--------|------------------|
| **Prisma** | Heavy runtime, generates a separate engine binary, schema-first DSL is awkward for complex queries |
| **Kysely** | Excellent type safety but lacks first-party migration tooling |
| **Raw `pg` + manual types** | Loses too much type safety on complex joins |
| **TypeORM** | Decorator-heavy, weaker types |

**Trade-offs accepted**:
- Drizzle is younger than Prisma; some bleeding-edge features (RLS helpers) are still WIP

### Analytics Database — ClickHouse

**Chosen**: ClickHouse 24.x for event pipeline (sends, opens, clicks, bounces).

**Why**:
- Designed for append-only, time-partitioned event data
- 10–100× faster than PostgreSQL for aggregations on billions of events
- Materialized views recompute campaign stats incrementally
- TTL on partitions = automatic 2-year retention

**Alternatives considered**:
| Option | Rejected because |
|--------|------------------|
| **TimescaleDB** | Solid, but ClickHouse wins on aggregation throughput at our event volume |
| **BigQuery** | Pay-per-query is unpredictable; we want flat infra cost |
| **Druid/Pinot** | Operationally heavier than ClickHouse |
| **Just PostgreSQL** | Falls over above ~100M events per campaign report query |

**Trade-offs accepted**:
- Two databases to operate — we mitigate by keeping ClickHouse strictly append-only
- Joins between OLTP (PG) and OLAP (CH) happen in app code, not in SQL

### Cache + Queue — Redis 7

**Chosen**: Redis 7 (ElastiCache cluster mode in production) for sessions, BullMQ, rate limiting.

**Why**:
- Single dependency for multiple needs (one less moving part)
- BullMQ is production-proven for our queue volumes (hundreds of jobs/sec)
- Sorted sets enable elegant frequency capping and rate limiting

**Alternatives considered**:
| Option | Rejected because |
|--------|------------------|
| **Memcached** | No persistence, no pub/sub, no sorted sets |
| **KeyDB / Dragonfly** | Smaller ecosystems; ElastiCache compatibility matters more |

**Trade-offs accepted**:
- Single Redis cluster handles multiple workloads — we monitor memory pressure and split if needed

### Message Queue — BullMQ → Kafka

**Chosen**: BullMQ on Redis for Phases 0–6; Kafka for event pipeline starting Phase 3.

**Why**:
- BullMQ is operationally simple and meets MVP needs (priority queues, scheduled jobs, retries)
- Kafka is the right tool for the high-volume event firehose (sends, opens, clicks → ClickHouse)
- We avoid running Kafka until we actually need it

**Alternatives considered**:
| Option | Rejected because |
|--------|------------------|
| **RabbitMQ** | Splits between two queues conceptually — complexity without payoff |
| **AWS SQS/SNS** | Vendor lock-in for the most critical infra component |
| **NATS** | Smaller ecosystem; team unfamiliar |

**Trade-offs accepted**:
- Two queue systems eventually (BullMQ for jobs, Kafka for events). We document the split clearly.

### Object Storage — MinIO (dev) / S3 (prod)

**Chosen**: MinIO for local dev, AWS S3 in production. Same SDK either way.

**Why**:
- S3 protocol is the universal standard
- MinIO matches S3 for local dev — no conditional code paths

**Alternatives**: R2 (Cloudflare) is on the table for egress-heavy workloads (recordings, screenshots) — revisit at Phase 8.

---

## AI Layer

### Claude API — Sonnet 4.6 + Haiku 4.5

**Chosen**: Anthropic Claude API.
- **Sonnet 4.6** for quality-sensitive features (copywriting, voice conversation, analytics summaries, translations)
- **Haiku 4.5** for high-volume cheap checks (content moderation, smart channel selection)

**Why**:
- Single vendor for all AI features — one billing relationship, one auth system, one set of SDKs
- Sonnet 4.6 quality is ahead of comparable-cost competitors for our text-heavy use cases
- Haiku 4.5 hits the price/latency sweet spot for pre-send checks
- Batch API gives 50% discount for non-real-time work (call analytics post-processing)
- Prompt caching reduces costs significantly on repeated system prompts

**Alternatives considered**:
| Option | Rejected because |
|--------|------------------|
| **OpenAI** | Comparable quality but we don't want to spread credits across vendors |
| **Open-source (Llama, Mistral)** | Hosting/ops cost outweighs API savings at our volume |
| **Cohere** | Smaller, less mature SDK ecosystem |

**Trade-offs accepted**:
- Vendor concentration risk on Anthropic. Mitigation: every AI feature has a fallback path that degrades gracefully (no AI = manual workflow), and AI calls are abstracted behind an `IAIProvider` interface so we can swap.

---

## Infrastructure

> ⚠️ **REVIZE 2026-05-18**: AWS EKS plán **zrušen** kvůli AWS odmítnutí onboardingu pro marketing maily. Nahrazeno Hetzner + Vercel stackem. Sekce dále reflektuje aktuální stav.

### Frontend hosting — Vercel

**Chosen**: Vercel Pro plán, Frankfurt region pinned pro `apps/web` (Next.js 15).

**Why**:
- Next.js native platforma (Edge runtime, ISR, image optimization, preview deployments per PR)
- EU data residency pro hlavní user-facing app
- Žádné DevOps pro frontend tier

**Alternatives**: Self-hosted Next.js na Coolify (úspora $20/měs, ale ztráta edge features) — revisit při migraci na k3s v Phase 5+.

### Compute orchestration — Coolify (MVP) → k3s (Phase 5+)

**Chosen MVP**: Coolify self-hosted na 3× Hetzner Cloud CCX23 (Falkenstein). Spravuje API, workers, voice-bot, sms-gateway, mcp-server, internal Postgres/Redis/Kafka/ClickHouse pro dev.

**Chosen Phase 5+**: Migrace na **k3s** (lightweight Kubernetes) pro multi-region a HA. Helm + ArgoCD GitOps zachovat.

**Why Coolify pro MVP**:
- UI-first, deploy z Gitu bez YAML
- Auto Let's Encrypt, vstavěné databáze, monitoring
- Vhodné pro 1–3 vývojáře
- Migrace na k3s je later upgrade, ne side-grade

**Alternatives considered**:
| Option | Rejected because |
|--------|------------------|
| **AWS EKS** (původní plán) | AWS odmítl marketing mailing onboarding; cena 4–5× nad Hetznerem |
| **Bare Docker + systemd** | Pro app tier příliš nízká úroveň; Coolify dělá tu samou věc s UI |
| **Nomad** | Menší ekosystém, ale dobrá alternativa pro Phase 5+ pokud k3s nezvládneme |
| **Fly.io / Railway** | Drahé pro náš objem; lock-in |

### MTA cluster — Hetzner Dedicated + vlastní Go MTA

**Chosen**: 2× Hetzner Dedicated EX44 (Falkenstein + Helsinki) v MVP, škálovat na 4–8 serverů + multi-ASN (OVH, Vultr) v Phase 5+. Provozováno přes systemd, ne kontejnery (důvod: fixní IP binding + rDNS + outbound port 25).

**Why**:
- Bulk-friendly hosting (Hetzner SMTP unblock přes ticket)
- /29 IPv4 subnet zdarma s každým dedicated serverem (= 6 sending IPs)
- Vlastní rDNS / PTR records
- AS24940 sdílíme s tisíci sender peers — postupně zlepšit přes ASN diversifikaci (OVH, Vultr)

**Trade-offs accepted**:
- Sami operujeme bare metal (žádný managed)
- Postgres a Redis primary jdou na Dedicated od Phase 5+ pro ECC RAM
- Multi-region složitější bez K8s — řešíme přes DNS-level failover

### Database hosting — Hetzner Dedicated (Postgres) + ClickHouse Cloud

**Chosen**:
- **Postgres**: Hetzner AX52 primary + AX42 replica (od Phase 5+). MVP na CCX23 cloud node.
- **ClickHouse**: ClickHouse Cloud Dev tier ($50/měs) v MVP; přechod na Hetzner AX102 v Phase 5+ pokud cost-benefit.
- **Redis**: Coolify managed Redis 7 cluster.
- **Kafka**: KRaft mode 3-node Hetzner Cloud cluster od Phase 3+.

**Why**:
- Hetzner Dedicated má **ECC RAM** (povinné pro DB)
- $400/měs AX52 = ekvivalent ~$2 000/měs RDS r6g
- ClickHouse Cloud zbavuje ops režie v MVP fázi

### Object storage — Cloudflare R2

**Chosen**: Cloudflare R2 (S3-compatible API) pro šablony, obrázky, attachmenty, screenshoty, voice recordings.

**Why**:
- Žádné egress fees (vs S3 $0.09/GB)
- $0.015/GB/měs storage
- Free tier 10 GB
- Cloudflare CDN integrace zdarma

### CDN + DNS — Cloudflare

**Chosen**: Cloudflare pro DNS, CDN, edge funkce (tracking pixel + click redirect).

**Why**:
- Free tier pokrývá 99 % traffic
- Workers pro low-latency tracking (50ms globálně)
- DNS API friendly pro per-klient sender domain automatizaci
- TLS automatika
- **Pozor**: MX/SMTP záznamy MUSÍ být "DNS only" (proxy off)

### Secret management — Doppler

**Chosen**: Doppler workspace s envs `development`, `staging`, `production`.

**Why**: Free do 5 uživatelů, lepší DX než HashiCorp Vault pro náš size, syncing do Coolify a Vercel.

### IaC — Terraform (Hetzner) + Pulumi (Vercel)

**Chosen**:
- **Hetzner Cloud + Dedicated**: Terraform `hetznercloud/hcloud` provider. State v Hetzner Object Storage (S3-compatible) s lock přes Postgres.
- **Vercel**: Pulumi TypeScript (provider stabilnější než Terraform Vercel provider) — nebo manual UI configuration pro single project (Vercel project = jedna entita).

**Alternatives**:
- OpenTofu místo Terraformu — možnost po Phase 5+ pokud Terraform změní licenci
- Pulumi pro vše — sjednotí jazyk s appkou; revisit při expansion

### Observability — Grafana Cloud + Better Stack

**Chosen**:
- **Grafana Cloud Free** (Prometheus + Loki + Tempo) pro metrics, logs, traces
- **Better Stack** pro on-call + uptime monitoring (5× levnější PagerDuty)
- **Sentry** pro error tracking ($26/měs Team plan)

**Why**: Provider-agnostic stack — funguje nad AWS/Hetzner/Vercel/k3s. Free tier do 1 GB logs/měs pokrývá MVP.

### Backup strategie

- **Postgres**: pg_basebackup denně do **Hetzner Storage Box** (1 TB BX11 €3.81/měs) + continuous WAL archiv. Off-site copy do Cloudflare R2.
- **ClickHouse**: spravuje ClickHouse Cloud (managed). Pro Phase 5+ self-hosted: native ClickHouse backup → R2.
- **Aplikační data (R2)**: cross-region replication na druhý R2 bucket.

### Observability — Grafana Cloud (Prometheus + Loki + Tempo)

**Chosen**: Grafana Cloud for metrics, logs, and traces. PagerDuty for alerting.

**Why**:
- Single pane of glass for the whole stack
- Cheap free tier for MVP, scales linearly
- Avoids running our own Prometheus + Loki + Tempo + Grafana stack

**Alternatives considered**:
| Option | Rejected because |
|--------|------------------|
| **Datadog** | 5–10× the cost at our scale |
| **New Relic** | Pricing model unfriendly to high-cardinality data |
| **Self-hosted** | Ops time we don't have at MVP |

---

## Risk Register

### Resolved Risks
- ✅ **Two-language codebase (TS + Go)** — boundary is clear (Go only for hot dispatch paths)
- ✅ **BullMQ → Kafka migration** — feature-flagged switch in Phase 3
- ✅ **Single-region PostgreSQL** — vertical scaling headroom is large

### Active Risks (monitor)
- ⚠️ **Anthropic vendor concentration** — abstract behind `IAIProvider`, every feature has non-AI fallback
- ⚠️ **K8s operational burden** — invest in runbooks + ArgoCD GitOps from day 1
- ⚠️ **ClickHouse expertise** — rare; document patterns in CLAUDE.md as we develop them
- ⚠️ **SMPP provider quality variance** — multi-provider routing with auto-failover (Phase 9)

### Deferred Decisions
- 🕒 **Search engine** (Elasticsearch vs Meilisearch vs Postgres FTS) — Postgres FTS is sufficient until we cross 10M contacts
- 🕒 **CDN for tracking pixel** — CloudFront in Phase 3, revisit Cloudflare R2/Workers if egress costs spike
- 🕒 **Multi-region** — single region (eu-central-1) until Phase 10+

---

## Budget Validation

| Phase | Monthly cost | Validates assumption |
|-------|--------------|----------------------|
| MVP (0–1k users) | ~$1,400 | Single-AZ RDS, single-node ClickHouse, t4g instances |
| Growth (1–10k users) | ~$6,300 | Multi-AZ RDS, ClickHouse cluster start, warmed IPs |
| Scale (10–50k users) | ~$27,500 | r7g.large RDS, full HA, 4× workers |

Scale tier hits the price points where alternative architectures (e.g., DynamoDB-based) might look attractive — we re-evaluate at the boundary, not before.

---

## Sign-off

This stack is approved for implementation through **Phase 9** (closed beta). Phase 10+ items are deferred decisions and listed above. Any deviation from this document requires updating the doc and the rationale.
