# Infrastruktura — Pivot AWS → Hetzner + Vercel

> Rozhodnuto: 2026-05-18
> Důvod: AWS odmítl onboarding pro bulk/marketing maily; vlastní MTA infrastruktura potřebuje bulk-friendly hosting; cena Hetzneru je 3–5× pod AWS na ekvivalentní hardware.
> Status: Souhlas vlastníka. Aktualizovat `TECH_STACK.md` po implementaci Fáze 0.

---

## Proč pivotujeme

| Faktor | AWS EKS plán | Reálné riziko / problém |
|---|---|---|
| **Marketing mail allowance** | Závisel na AWS SES nebo vlastním MTA na EC2 | SES uživatele odmítl; EC2 SMTP port 25 je defaultně blokovaný a uvolnění vyžaduje schválení které u marketing mailů často nepřijde |
| **Cena Compute** | Graviton4 ARM, ale stále premium AWS pricing | Při 1M mailů/měs a omnichannel scope ~$1 400 → $27 500 přes 3 fáze |
| **IP reputace** | Sdílené IPs (SES) nebo EIP omezené na 5/účet | Nemůžeme stavět IP pool s diverzifikovaným AS pro snowshoe resistance |
| **Lock-in** | EKS, RDS, ElastiCache, S3, Route53, ACM, IAM | Migrace později = přepsání IaC a všech provozních runbooků |

**Co tím neřešíme:** Kompetenci AWS pro veřejné API/web nebo S3. AWS jsme nezatratili — jen je nevhodný pro **odesílací infrastrukturu marketing emailů.**

---

## Cílová topologie

```
                       ┌─────────────────────────────────────┐
                       │           Cloudflare DNS + CDN       │
                       │  (mailforge.io, *.mailforge.io,      │
                       │   click.mailforge.io tracking)       │
                       └────────────┬────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────────────────┐
              │                     │                                 │
              ▼                     ▼                                 ▼
      ┌──────────────┐       ┌─────────────────┐         ┌────────────────────┐
      │   Vercel     │       │  Hetzner Cloud  │         │  Hetzner Dedicated │
      │   (Frankfurt)│       │  (Falkenstein)  │         │  (Falkenstein/HEL) │
      │              │       │                 │         │                    │
      │  apps/web    │       │  Coolify cluster│         │  MTA cluster       │
      │  (Next.js 15)│ HTTPS │  - apps/api     │ gRPC    │  apps/engine (Go)  │
      │              │◀─────▶│  - apps/workers │◀───────▶│  - sending node 1  │
      │              │       │  - apps/voice-bot         │  - sending node 2  │
      │              │       │  - apps/mcp-server        │                    │
      │  Edge: TLS,  │       │  - apps/sms-gw  │         │  Each node:        │
      │  CSP, rate-  │       │                 │         │  - 4-8 IPv4 /node  │
      │  limit       │       │  Postgres 16    │         │  - rDNS configured │
      │              │       │  ClickHouse     │         │  - Postal? NO,     │
      │              │       │  Redis 7        │         │    vlastní Go MTA  │
      │              │       │  Kafka (KRaft)  │         │                    │
      │              │       │  MinIO (dev)    │         │                    │
      └──────────────┘       └─────────────────┘         └────────────────────┘
              │                     │                                 │
              │                     │                                 │
              │              ┌──────▼──────┐                  ┌───────▼──────┐
              │              │ Hetzner     │                  │ Sekundární   │
              │              │ Storage Box │                  │ MTA pool     │
              │              │ (backups)   │                  │ (OVH/Vultr)  │
              │              └─────────────┘                  │ ASN diversity│
              │                                                └──────────────┘
              ▼
      ┌──────────────────┐
      │ Cloudflare R2    │  object storage (šablony, obrázky, attachments,
      │ (S3 compatible)  │  campaign screenshots, voice recordings)
      └──────────────────┘

      ┌──────────────────────────────────────────────────────────────────────┐
      │ Grafana Cloud (Prom + Loki + Tempo)  +  Sentry  +  Better Stack      │
      │ All providers feed observability stack (provider-agnostic)           │
      └──────────────────────────────────────────────────────────────────────┘
```

---

## Mapování komponent: AWS → Hetzner + Vercel

| Vrstva | AWS plán (TECH_STACK.md 2026-04-11) | Pivot (2026-05-18) | Poznámka |
|---|---|---|---|
| **Frontend hosting** | EKS pod (apps/web) + ALB | **Vercel** (Frankfurt region) | Next.js 15 native; Edge runtime; preview deployments per PR |
| **API hosting** | EKS pod (apps/api) | **Hetzner Cloud + Coolify** | Fastify chce dlouhý běh, ne serverless |
| **Worker hosting** | EKS pod (apps/workers) | **Hetzner Cloud + Coolify** | BullMQ jobs, není stateless serverless |
| **MTA cluster** | EKS pod (apps/engine) na EC2 | **Hetzner Dedicated bare-metal** | Engine musí mít fixní IPs s rDNS — kontejner s NAT to neumí |
| **SMS gateway** | EKS pod (apps/sms-gateway) | **Hetzner Cloud + Coolify** | SMPP TCP perzistent connections — Cloud VM stačí |
| **Voice bot** | EKS pod (apps/voice-bot) | **Hetzner Cloud + Coolify** | WebSocket + Twilio Voice — Cloud VM stačí |
| **MCP server** | EKS pod (apps/mcp-server) | **Hetzner Cloud + Coolify** | Náhrada za AWS Fargate task |
| **Postgres primary** | RDS Multi-AZ | **Hetzner Dedicated** + manual replica | $30/měs server vs $400/měs RDS na ekvivalentu |
| **Postgres backup** | RDS automated snapshots | **Hetzner Storage Box** (1 TB ~€3/měs) + pg_basebackup + WAL archiv | + Volitelně Cloudflare R2 jako off-site |
| **ClickHouse** | EKS StatefulSet | **Hetzner Dedicated** OR **ClickHouse Cloud** | Doporučení: ClickHouse Cloud (managed, ~$50/měs starter) v Phase 0–4, Hetzner dedicated od Phase 5+ |
| **Redis** | ElastiCache Cluster | **Hetzner Cloud + Redis na Coolify** | Pro queue + cache; HA = Sentinel mode později |
| **Kafka** | MSK | **Hetzner Cloud + Kafka KRaft** | KRaft eliminuje Zookeeper. 3-node cluster od Phase 3+ |
| **Object storage** | S3 | **Cloudflare R2** | S3-compatible API, žádné egress fee, $0.015/GB/měs storage |
| **CDN** | CloudFront | **Cloudflare** | Free tier pokrývá 99 % našeho traffic; tracking pixely na own subdomain přes Cloudflare Workers |
| **DNS** | Route53 | **Cloudflare DNS** | $0/měs; lepší propagation; API friendly |
| **TLS certifikáty** | ACM | **Cloudflare TLS + Caddy reverse proxy** na Coolify | Coolify má auto-Let's-Encrypt vestavěno |
| **Identity** | IAM + Cognito | **Vlastní auth (existující plán)** | JWT + Redis session zůstává |
| **Secret management** | AWS Secrets Manager | **Doppler** OR **HashiCorp Vault** OR Coolify env vars | Doporučení: Doppler ($0 do 5 users) v MVP |
| **Container orchestration** | EKS + ArgoCD + Helm | **Coolify** (MVP) → **k3s** (Phase 5+) | Coolify = self-hosted Vercel/Heroku, krásné UI, Git deploys |
| **IaC** | Terraform AWS provider | **Terraform Hetzner provider** + **Pulumi pro Vercel** | Stav v Hetzner Storage Box, ne v S3 |
| **CI/CD** | GitHub Actions → ECR → ArgoCD | **GitHub Actions → Coolify webhook** + **Vercel Git integration** | Trunk-based development zůstává |
| **Monitoring** | Grafana Cloud | **Grafana Cloud** (beze změny) | Provider-agnostic |
| **Logs** | CloudWatch | **Better Stack (Logtail)** OR Loki na Grafana Cloud | $0 free tier do 1 GB/měs |
| **Alerting** | PagerDuty | **Better Stack on-call** OR PagerDuty | Better Stack je 5× levnější pro malý tým |

---

## Co se NEMĚNÍ (důležité)

- **Aplikační kód** — Fastify, Drizzle, Go MTA, Next.js, BullMQ, Kafka klienti, React komponenty zůstávají bez úpravy
- **Datový model** — Postgres schema, ClickHouse schema beze změny
- **Channel adapter pattern** — `IChannelAdapter` interface zůstává
- **AI vrstva** — Anthropic API (Sonnet 4.6 + Haiku 4.5), Redis cache, prompt caching zůstává
- **Roadmap fází 0–10** — pořadí a obsah se nemění; mění se jen jak ji nasazujeme

---

## Změny v konvencích / `.env`

`.env.example` se rozšíří o:

```
# Object storage (Cloudflare R2)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=mailforge-assets

# MTA cluster (gRPC endpoint)
MTA_GRPC_ENDPOINTS=mta-1.internal:50051,mta-2.internal:50051

# DNS pro autentizaci klientských domén
CLOUDFLARE_API_TOKEN=
DKIM_SELECTOR_PREFIX=mf

# Secrets management
DOPPLER_TOKEN=
```

Zaniká: `AWS_*`, `MINIO_*` (prod), všechny AWS-specific proměnné.

---

## Náklady — před / po

### MVP fáze (0–1k users, ~0.1M mailů/měs)

| Položka | AWS plán | Hetzner+Vercel | Úspora |
|---|---|---|---|
| Compute (K8s) | $350 | $80 (3× CX22 Cloud + Coolify) | -77 % |
| Postgres | RDS db.t4g.micro | Hetzner CCX13 €15 | -50 % |
| ClickHouse | EKS StatefulSet ~$60 | ClickHouse Cloud Dev $50 | -17 % |
| Cache | ElastiCache t4g.micro | Redis na Coolify $0 | -100 % |
| Object storage | S3 + CloudFront | Cloudflare R2 | -80 % |
| **MTA cluster** | EC2 t4g.small + EIP | **2× Hetzner EX44** dedicated €78 | base |
| **IPs** | 2× EIP $7 | **8× Hetzner IPv4** €12 | base |
| Vercel | — | Hobby $0 / Pro $20 | + |
| Domain + DNS | Route53 $15 | Cloudflare $0 | -100 % |
| Monitoring | Grafana Cloud | Grafana Cloud | = |
| **Celkem MVP** | **~$1 400/měs** | **~$350/měs** | **-75 %** |

### Growth fáze (1–10k users, ~5M mailů/měs)

| Položka | AWS plán | Hetzner+Vercel |
|---|---|---|
| Compute | $1 430 | $300 (5× CCX23 + Coolify HA) |
| DB primary + replica | $820 | €120 (Hetzner AX42 + AX42) |
| ClickHouse | $300 | $200 (Cloud Production) |
| **MTA cluster** | EKS + 8× EIP $200 | **4× EX44 + 16 IPs** €170 |
| Object storage | $170 | $40 R2 |
| Vercel | — | Pro $20 + extras $100 |
| **Celkem Growth** | **~$6 300/měs** | **~$1 100/měs** | 

### Scale fáze (10–50k users, ~30M mailů/měs)

| Položka | AWS plán | Hetzner+Vercel |
|---|---|---|
| Compute | $5 420 | $1 200 (k3s cluster 8 nodes) |
| DB | $3 000 | €400 (AX52 primary + 2 replicas) |
| ClickHouse | $1 200 | $800 |
| **MTA cluster** | $2 350 | **8× EX44 + 32 IPs + ASN diversity** ~€500 |
| Object storage | $700 | $150 R2 |
| Vercel | — | Enterprise $500 |
| **Celkem Scale** | **~$27 500/měs** | **~$4 500/měs** | 

**Sumární úspora ~75–85 %** napříč fázemi.

---

## Trade-offs přijaté pivotem

| Kompromis | Důsledek | Mitigace |
|---|---|---|
| **Hetzner SLA** je horší než AWS (99.9 % vs 99.99 % per service) | Občasné outages datacentra (FSN1, NBG1 měly několik incidentů ročně) | Multi-DC od Phase 5+ (Falkenstein + Helsinki), client failover na DNS úrovni |
| **Sami provozujeme Postgres** místo RDS | Backupy, replikace, upgrady jsou naše | Hetzner Storage Box + pg_basebackup + barman + měsíční DR drill |
| **Sami provozujeme Redis a Kafka** | Operační režie | Coolify zjednodušuje; ne-HA v MVP, HA v Phase 3+ |
| **Coolify zatím nemá multi-region** | Single region (DE/FI) v MVP | Plánovaný přesun na k3s v Phase 5+ pro multi-region |
| **Vercel není v EU s data residency garancí pro všechny edge nodes** | Customer compute běží globálně | Edge funkce pro statiku/UI; všechen citlivý compute (API, DB, MTA) v EU jen |
| **Hetzner zakazuje SMTP defaultně, musí se žádat** | Onboarding 24–72h delay | Žádat hned v Týdnu 1, mít fallback OVH/Vultr account ready |

---

## Akční plán pivota (přidat do Fáze 0)

> Doporučuji zařadit jako **"Fáze 0.5 — Infra setup"** mezi stávající Týden 2 a Fázi 1.

### Týden 2.5 — Hetzner + Vercel bootstrap (5 dnů)

- [ ] **Hetzner účet + KYC + SMTP unblock request**
  - Otevřít účet, doložit firmu (IČO + DIČ), odeslat support ticket: "Request port 25 unblock for marketing email service. Volume: 5M emails/month target. Will provide DKIM, SPF, DMARC for all sending domains, run FBL processing, maintain bounce rate <2% and complaint rate <0.1%."
- [ ] **Vercel účet + Pro plán + Frankfurt region pin**
  - Connect GitHub repo `mailforge`, configure project pro `apps/web`
- [ ] **Cloudflare účet + transfer mailforge.io**
  - Nameserver change, configure DNS, enable proxy pro web tier, **vypnout proxy pro MX/SMTP záznamy** (jinak rozbije mail)
- [ ] **Doppler workspace** + project `mailforge` s envs `development`, `staging`, `production`
- [ ] **Hetzner Cloud projekt** `mailforge-prod`
  - 3× CCX23 (Falkenstein) pro Coolify cluster
  - 1× CCX23 pro Postgres primary (dev / staging only — prod jde na Dedicated)
  - Privátní síť 10.0.0.0/16
- [ ] **Coolify install** na první CCX23 nodu
- [ ] **Hetzner Dedicated serverbörse** — koupit 2× EX44 v Falkensteinu
  - Specs: AMD Ryzen 7700, 64 GB RAM, 2× 1 TB NVMe, 1 Gbit
  - Žádost o **subnet /29** (6 použitelných IPv4) pro MTA cluster
  - Ubuntu 24.04 LTS, vlastní setup (NE Coolify — bare metal s systemd)
- [ ] **Cloudflare R2 bucket** `mailforge-assets` + API token
- [ ] **ClickHouse Cloud Dev tier** ($50/měs, EU region)
- [ ] **Terraform Hetzner provider** scaffold v `infra/terraform/hetzner/`
- [ ] **GitHub Actions** — pipeline: lint → typecheck → test → build → deploy
  - `apps/web` → Vercel auto-deploy z `main`
  - Ostatní apps → Docker image build → push to GHCR → Coolify webhook
- [ ] **Wireguard / Tailscale** mesh pro admin přístup do privátní sítě

### Týden 2.6 — DNS a doménová příprava (3 dny)

- [ ] DNS zóna pro `mailforge.io` v Cloudflare
- [ ] Subdomény: `app.` (Vercel), `api.` (Hetzner Coolify), `mta-1.`, `mta-2.` (Dedicated), `track.` (tracking pixel přes Cloudflare Worker → ClickHouse), `dkim._domainkey.` (vlastní sender)
- [ ] **rDNS / PTR records** na všech MTA IPs — kontaktovat Hetzner support s mapováním `IP → mta-N.mailforge.io`
- [ ] SPF + DKIM + DMARC pro `mailforge.io` (sender domain pro transactional)
- [ ] **Postmaster URL** `https://postmaster.mailforge.io` (zatím statika)

### Týden 2.7 — Smoke test (2 dny)

- [ ] Deploy `apps/web` placeholder na Vercel
- [ ] Deploy `apps/api` placeholder na Coolify
- [ ] Postgres → Drizzle migrace běží
- [ ] Vercel ↔ API komunikace funguje
- [ ] Send první test email z Go engine na osobní gmail + outlook + protonmail
- [ ] Verifikuj inbox placement (ne spam)

**Až tehdy pokračujeme do Fáze 1 — Contact engine.**

---

## Migration risk

Existující kód v `apps/` zatím obsahuje pouze scaffolding (per `ls` apps/api, apps/engine, apps/web, atd. neobsahují produkční kód, jen package.json a strukturu). Pivot proto **nevyžaduje žádnou migraci runtime dat ani live služeb**. Riziko = 0; pivot uděláme **před** Fází 1.

---

## Související dokumenty

- `infra/HOSTING_DETAIL.md` — konkrétní volby serverů, IPů, AS diversity, Coolify vs k3s detail
- `infra/DELIVERABILITY.md` — IP warming, FBL, multi-tenant izolace, postmaster setup
- `POZICOVANI.md` — proč CZ/SK start dává smysl při této infrastruktuře
- `TECH_STACK.md` — aktualizovat sekci "Infrastructure" po dokončení smoke testu

---

*Dokument vytvořen: 2026-05-18*
*Vlastník: omniascz@gmail.com*
*Status: schváleno pro implementaci ve Fázi 0.5*
