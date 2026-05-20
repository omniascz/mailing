# Hosting Detail — Hetzner produkty, Coolify, IP plánování

> Doplňuje `PIVOT_AWS_TO_HETZNER.md` o konkrétní volby hardware, software stacku a network topologie.
> Status: doporučení, akce zařadit do Fáze 0.5.

---

## 1. Hetzner — který produkt na co

Hetzner má **tři produktové linie**, lišící se cenou, výkonem a flexibilitou:

### 1.1 Hetzner Cloud (HC)

Plně virtualizovaný cloud, srovnatelný s DigitalOcean / Linode. **Stabilní, snadno škálovatelný, podporuje snapshotting, private networks.**

| Plán      | CPU                 | RAM   | Disk       | Bandwidth | Cena/měs | Vhodné pro                            |
| --------- | ------------------- | ----- | ---------- | --------- | -------- | ------------------------------------- |
| **CX22**  | 2 vCPU (AMD)        | 4 GB  | 40 GB SSD  | 20 TB     | €4.49    | Coolify management node, dev          |
| **CCX13** | 2 vCPU (dedicated)  | 8 GB  | 80 GB SSD  | 20 TB     | €12.49   | API node, worker node (low)           |
| **CCX23** | 4 vCPU (dedicated)  | 16 GB | 160 GB SSD | 20 TB     | €23.99   | API, workers, ClickHouse (dev)        |
| **CCX33** | 8 vCPU (dedicated)  | 32 GB | 240 GB SSD | 30 TB     | €47.99   | Postgres staging, Kafka node          |
| **CCX43** | 16 vCPU (dedicated) | 64 GB | 360 GB SSD | 40 TB     | €95.99   | Postgres prod fallback, large workers |

**Klíčové vlastnosti pro nás:**

- ✅ Private networking zdarma (Cloud Networks)
- ✅ Snapshots, automated backups (+20 % ceny)
- ✅ Floating IPs (přesunout mezi servery)
- ⚠️ **SMTP port 25 zablokován defaultně** — žádost přes support ticket (24–72h)
- ❌ Nelze žádat /29 subnet (jen single IPs nebo Primary IPs)
- ⚠️ Sdílený AS24940 — bulk reputace závisí na sousedech

### 1.2 Hetzner Dedicated (Robot/Serverbörse)

Bare-metal servery, vlastní hardware, vlastní IP rozsah. **Nejlepší cena/výkon, ale operační režie.**

| Server      | CPU                           | RAM             | Disk            | Network                     | Cena/měs | Vhodné pro                            |
| ----------- | ----------------------------- | --------------- | --------------- | --------------------------- | -------- | ------------------------------------- |
| **EX44**    | AMD Ryzen 7700 (8/16)         | 64 GB DDR5      | 2× 1 TB NVMe    | 1 Gbit                      | €39      | MTA node, Postgres primary (small)    |
| **EX101**   | Intel Core i9-13900 (24/32)   | 64 GB DDR5      | 2× 1.92 TB NVMe | 1 Gbit                      | €76      | Postgres primary (medium), ClickHouse |
| **AX42**    | AMD Ryzen 9 7900 (12/24)      | 64 GB ECC DDR5  | 2× 1 TB NVMe    | 1 Gbit                      | €56      | Postgres replica, Kafka cluster node  |
| **AX52**    | AMD Ryzen 9 9900X (12/24)     | 64 GB ECC DDR5  | 2× 1 TB NVMe    | 1 Gbit                      | €69      | Postgres prod primary                 |
| **AX102**   | AMD Ryzen 9 7950X3D (16/32)   | 128 GB ECC DDR5 | 2× 1.92 TB NVMe | 1 Gbit                      | €123     | ClickHouse prod, multi-tenant DB      |
| **EX130-S** | Intel Xeon Gold 5412U (24/48) | 128 GB ECC DDR5 | 2× 3.84 TB NVMe | 1 Gbit (10 Gbit upgrade €€) | €189     | Enterprise scale primary              |

**Klíčové vlastnosti:**

- ✅ /29 subnet (6 použitelných IPv4) zdarma k serveru (€5–8 setup fee)
- ✅ Vlastní rDNS na všech IPs
- ✅ Můžeme žádat o **odblokování SMTP** (vyšší pravděpodobnost než HC)
- ✅ ECC RAM na AX linii — pro DB **povinné**
- ⚠️ One-time setup fee €39–129
- ⚠️ Manuální OS install (Ubuntu 24.04, Rocky 9, …)
- ⚠️ Žádný auto-failover — musíme si zařídit replikaci a HA

### 1.3 Hetzner Storage Box

S3-like object storage + SFTP/Borg/Restic kompatibilní. Pro **backupy a archivace**.

| Plán | Kapacita | Cena/měs |
| ---- | -------- | -------- |
| BX11 | 1 TB     | €3.81    |
| BX21 | 5 TB     | €13.10   |
| BX31 | 10 TB    | €25.20   |

Použití: pg_basebackup, WAL archiv, Restic backupy aplikačních dat. **NE** pro live serving (žádný HTTP API, jen storage).

### 1.4 Doporučená skladba per fázi

**MVP (Fáze 0.5):**

| Účel                           | Hardware                                         | Cena/měs         |
| ------------------------------ | ------------------------------------------------ | ---------------- |
| Coolify mgmt + reverse proxy   | CCX13 (Falkenstein)                              | €12.49           |
| API + workers (1 node)         | CCX23 (Falkenstein)                              | €23.99           |
| Postgres primary (dev/staging) | CCX23 (Falkenstein)                              | €23.99           |
| ClickHouse                     | **ClickHouse Cloud Dev**                         | $50 / ~€46       |
| **MTA node #1**                | **EX44 (Falkenstein) + /29 subnet**              | €39 + €5 = €44   |
| **MTA node #2**                | **EX44 (Helsinki) + /29 subnet** (geo diversity) | €39 + €5 = €44   |
| Backup storage                 | BX11 (1 TB)                                      | €3.81            |
| Bandwidth                      | included (60+ TB/měs)                            | €0               |
| **Hetzner total**              |                                                  | **€198 / ~$215** |
| Vercel Pro                     | apps/web                                         | $20              |
| Cloudflare R2 (50 GB)          | object storage                                   | $0.75            |
| ClickHouse Cloud               |                                                  | $50              |
| Doppler                        | secrets                                          | $0               |
| Grafana Cloud Free             | obs                                              | $0               |
| Better Stack Free              | uptime                                           | $0               |
| **MVP total**                  |                                                  | **~$285 / měs**  |

**Growth (Fáze 5–7):**

| Účel                        | Hardware                      | Cena/měs          |
| --------------------------- | ----------------------------- | ----------------- |
| Coolify mgmt + HA proxy     | 3× CCX23                      | €72               |
| API tier                    | 2× CCX33                      | €96               |
| Worker tier                 | 2× CCX23                      | €48               |
| Postgres primary            | AX52 (Falkenstein)            | €69               |
| Postgres replica            | AX42 (Helsinki)               | €56               |
| ClickHouse                  | **AX42 + dedicated NVMe**     | €56               |
| Kafka cluster               | 3× CCX23                      | €72               |
| Redis cluster               | 2× CCX13                      | €25               |
| **MTA cluster**             | **4× EX44 + 4× /29 (16 IPs)** | €196              |
| **Backup MTA pool**         | **2× OVH IPs + 2× Vultr IPs** | ~€30              |
| Backup storage              | BX21 (5 TB)                   | €13               |
| **Hetzner+ total**          |                               | **~€733 / $795**  |
| Vercel Pro + extras         |                               | $120              |
| Cloudflare R2 (500 GB)      |                               | $7.50             |
| ClickHouse Cloud Production |                               | $200              |
| **Growth total**            |                               | **~$1 120 / měs** |

---

## 2. Orchestrace: Coolify vs k3s vs raw Docker

### 2.1 Coolify (doporučeno pro MVP)

**Self-hosted alternativa k Vercel / Heroku / Render.** Open source, ~35k GitHub stars, aktivní vývoj.

**Plus:**

- ✅ Krásné UI — deploy z Gitu jedním kliknutím
- ✅ Auto Let's Encrypt certifikáty
- ✅ Built-in Postgres, Redis, MinIO, Clickhouse jako služby
- ✅ Preview deployments per PR
- ✅ Multi-server (manager + workers)
- ✅ Žádný YAML — UI configures everything
- ✅ Built-in CI integrace (GitHub webhooks)
- ✅ Vhodné pro 1–3 vývojáře (řekl bych až do ~$5M ARR)

**Minus:**

- ⚠️ Není K8s — pokud později přejdeme na multi-cloud / multi-region, migrace bude netriviální
- ⚠️ Networking limitace pro low-level věci (MTA s vlastními IPs → držet mimo Coolify)
- ⚠️ Méně zralé než K8s ekosystém pro enterprise věci (RBAC, audit logs, …)

**Verdikt:** Coolify pro **aplikační layer** (api, workers, voice-bot, sms-gateway, mcp-server). NE pro MTA cluster.

### 2.2 k3s (doporučeno pro Phase 5+)

**Lightweight Kubernetes** od Ranchera. Jeden binární soubor, ARM/x86 kompatibilní, plné API.

**Plus:**

- ✅ Full Kubernetes API
- ✅ Vše co znáš z EKS funguje (Helm, ArgoCD, kubectl)
- ✅ Lehký — Hetzner CCX23 unese single-node k3s s 20+ pods
- ✅ Multi-region snadné (k3s + Cilium / Tailscale mesh)
- ✅ Migrace na "velký" K8s (EKS, GKE) později snadná
- ⚠️ Steeper learning curve než Coolify
- ⚠️ Více setupu (ingress controller, cert-manager, monitoring stack)

**Kdy přejít z Coolify na k3s:**

- Multi-region (Hetzner Falkenstein + Helsinki + USA)
- Tým 3+ devs / 1+ SRE
- Phase 9–10 (closed beta → launch)
- Kdykoliv Coolify začne brzdit

### 2.3 Raw Docker + systemd (pro MTA cluster)

**MTA cluster nedoporučujeme spravovat přes Coolify ani k3s.** Důvod:

- MTA musí mít **fixní binding na konkrétní IP** (pro outbound SMTP). Container abstrakce s NAT to komplikuje.
- rDNS / PTR jsou per fyzická IP, ne per kontejner
- Systemd cgroup limity stačí pro proces izolaci
- Single binární Go MTA (`apps/engine`) — žádné dependencies, deploy = `scp` + `systemctl restart`

**Setup:**

```
/etc/systemd/system/mailforge-mta@.service
[Unit]
Description=Mailforge MTA worker on IP %i
After=network.target

[Service]
Type=notify
User=mailforge
ExecStart=/opt/mailforge/engine --bind-ip %i --grpc-port 50051 --config /etc/mailforge/engine.yaml
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable per IP:

```bash
systemctl enable mailforge-mta@49.13.x.1
systemctl enable mailforge-mta@49.13.x.2
...
```

Deploy = GitHub Actions → SSH + scp + `systemctl restart` (Ansible role v `infra/ansible/`).

---

## 3. Vercel — co tam dát a co ne

### 3.1 Co JE pro Vercel ideální

- **`apps/web`** (Next.js 15) — Vercel je její nativní platforma, Edge runtime, ISR, image optimization
- **Statika** (marketing site, docs site) — pokud bude součástí monorepa
- **Edge funkce** pro:
  - Tracking pixel (`/o/:id.gif` → log to Kafka → 1px GIF response) — edge funkce s nízkou latencí globálně
  - Click tracking (`/c/:id` → log → 302 redirect)
  - **WAIT** — tohle by ideálně mělo být **na vlastní subdoméně přes Cloudflare Workers**, ne přes Vercel — viz níže

### 3.2 Co NE na Vercel

- **`apps/api`** (Fastify) — Vercel serverless functions mají cold start, 10s timeout (Hobby) / 60s (Pro), bez WebSocketu. Fastify chce dlouhý běh.
- **Workers** (BullMQ) — long-running, ne serverless
- **Voice bot** — WebSocket + Twilio Voice, dlouhý běh
- **MTA engine** — Go binary, fixní IP
- **DB, Redis, Kafka, ClickHouse** — serverful, vlastní volume

### 3.3 Tracking pixel — kam?

| Volba                                                  | Pro                                                       | Proti                                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Cloudflare Workers** + Workers KV + Kafka REST proxy | Globálně nejnižší latence; Cloudflare zdarma 100k req/den | Logika sice jednoduchá, ale potřebujeme dostat do Kafka (rest-proxy nebo direct queue) |
| Vercel Edge Function                                   | Stejně dobré jako CF                                      | Vendor lock-in; Vercel logy pro debugging horší                                        |
| Vlastní Go endpoint na Hetzneru                        | Plná kontrola                                             | Latence z USA ~150ms                                                                   |

**Doporučení:** Cloudflare Workers — `https://track.mailforge.io/o/:id.gif` a `/c/:id`. Worker:

1. Log event do Cloudflare Queues (managed)
2. Cloudflare Queue → custom consumer na Hetzner → Kafka → ClickHouse
3. Response: 1×1 GIF (open) nebo 302 redirect (click)

Edge latence < 50 ms globálně.

---

## 4. Networking topology

```
Internet
   │
   │
   ├─────────────────────────────────────────────────────────┐
   │                                                          │
   ▼                                                          ▼
[Cloudflare DNS]                                       [Hetzner Dedicated]
   │                                                   MTA cluster
   │ A/AAAA, CNAME, MX, TXT                            (NO Cloudflare proxy!
   │                                                    bulk SMTP musí mít
   ├─→ app.mailforge.io ─→ Vercel                      přímé IP)
   ├─→ api.mailforge.io ─→ Hetzner Coolify LB
   ├─→ track.mailforge.io ─→ Cloudflare Workers
   └─→ mta-{1..N}.mailforge.io ─→ Hetzner Dedicated IPs


Privátní síť (Hetzner Cloud Network 10.0.0.0/16)
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  10.0.1.0/24  ┌─────────────────┐                          │
│  Coolify      │ Coolify mgmt    │←─ admin přes Tailscale   │
│  Apps         │ Coolify worker1 │                          │
│               │ Coolify worker2 │                          │
│               │ API pods        │                          │
│               │ Worker pods     │                          │
│               │ voice-bot pod   │                          │
│               └─────┬───────────┘                          │
│                     │                                      │
│  10.0.2.0/24       │                                       │
│  Data layer  ┌─────▼───────────┐                          │
│               │ Postgres primary│                          │
│               │ Redis           │                          │
│               │ Kafka 1/2/3     │                          │
│               │ MinIO (dev)     │                          │
│               └─────┬───────────┘                          │
│                     │                                      │
│  10.0.3.0/24       │                                       │
│  MTA gRPC    ┌─────▼───────────┐    public 49.13.x.0/29   │
│  bridge      │ MTA bridge svc  │←──→ Dedicated MTA cluster │
│               │ (Coolify)       │       (bare metal)        │
│               └─────────────────┘       /29 + /29           │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Admin acces přes Tailscale mesh (free do 100 devices)
Bandwidth privátní = unmetered
```

**Klíčové rules:**

- Dedicated MTA cluster má **public IPs** pro outbound SMTP (port 25 outbound), ale **inbound** jen na port 50051 (gRPC) přijímá jen z `10.0.0.0/16` (privátní síť přes vSwitch).
- Aplikační tier (Coolify) komunikuje s MTA přes gRPC na privátní bridge IPs
- Bounce inbound: dedikované MX záznamy pro `bounce.mailforge.io` → dedicated MTA s receive logic
- WireGuard / Tailscale pro admin SSH access — žádné SSH port 22 veřejně

---

## 5. ASN diversity — proč ne jen Hetzner

Pokud bys měl všech 16 sending IPs v `49.13.0.0/16` (Hetzner AS24940), Gmail tě vyhodnotí jako:

- High volume sender
- Single AS origin
- → "snowshoe" pattern (rozmazání spamu přes mnoho IPs jednoho prefixu)

**Diversifikace pro Phase 5+:**

| Provider              | AS          | Region   | Cena IP              | Reputace pro bulk                         |
| --------------------- | ----------- | -------- | -------------------- | ----------------------------------------- |
| **Hetzner**           | AS24940     | DE/FI    | €1.20/IP             | Mixed (closer to bulk-friendly post-2023) |
| **OVH**               | AS16276     | FR/UK    | €2/IP                | Mixed; FR sender často horší než DE       |
| **Vultr**             | AS20473     | DE/JP/US | $3/IP                | Slušné, mladší IPs                        |
| **Linode (Akamai)**   | AS63949     | DE/UK    | $5/IP                | Velmi dobré                               |
| **Inception Hosting** | AS50673     | UK       | $5/IP                | Specialized email-friendly                |
| **vlastní /24 (BGP)** | vlastní ASN | —        | €0.50/IP/měs (lease) | Nejlepší dlouhodobě                       |

**Růstová strategie:**

- Fáze 0–4: Hetzner only (jednoduchost)
- Fáze 5–7: Přidat OVH (2× IP) a Vultr (2× IP) jako "secondary pool"
- Fáze 8+: vlastní /24 leasing přes IPv4.global (~$500/měs za /24 = 256 IPs) + ASN registrace u RIPE (€2 000/rok) — postaví dlouhodobou reputaci nezávislou na hosting providerovi

---

## 6. IaC: Terraform Hetzner + Pulumi Vercel

### 6.1 Hetzner Cloud

```hcl
# infra/terraform/hetzner/main.tf
terraform {
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
  }
  backend "s3" {
    endpoint = "https://nbg1.your-objectstorage.com"  # Hetzner Object Storage (S3 compatible)
    bucket   = "mailforge-tf-state"
    key      = "prod/terraform.tfstate"
    region   = "us-east-1"  # Hetzner ignoruje, ale Terraform required
    use_path_style = true
  }
}

resource "hcloud_network" "main" {
  name     = "mailforge-prod"
  ip_range = "10.0.0.0/16"
}

resource "hcloud_server" "coolify_mgmt" {
  name        = "coolify-mgmt-1"
  server_type = "ccx13"
  image       = "ubuntu-24.04"
  datacenter  = "fsn1-dc14"
  ssh_keys    = [hcloud_ssh_key.deploy.id]
  network {
    network_id = hcloud_network.main.id
    ip         = "10.0.1.10"
  }
  firewall_ids = [hcloud_firewall.coolify.id]
  labels = {
    role = "coolify-mgmt"
  }
}

# … další zdroje
```

### 6.2 Vercel

Vercel terraform provider je nezralý, raději Pulumi nebo přímo Vercel CLI / API:

```typescript
// infra/pulumi/vercel/index.ts
import * as vercel from '@pulumiverse/vercel';

const project = new vercel.Project('mailforge-web', {
  name: 'mailforge-web',
  framework: 'nextjs',
  rootDirectory: 'apps/web',
  gitRepository: {
    type: 'github',
    repo: 'omniascz/mailforge',
  },
  buildCommand: 'cd ../.. && pnpm turbo build --filter=@forgemsg/web',
  installCommand: 'cd ../.. && pnpm install --frozen-lockfile',
});
```

Nebo úplně skip IaC pro Vercel a configurovat ručně přes UI — pro single project to není overkill.

---

## 7. Konkrétní akce pro Týden 2.5

(Viz `PIVOT_AWS_TO_HETZNER.md` Akční plán pro plnou šíři.)

**Hardware nákupní seznam:**

- 1× CCX13 (Coolify mgmt)
- 1× CCX23 (API + workers dev)
- 1× CCX23 (Postgres dev)
- 2× EX44 + /29 subnety (MTA cluster Falkenstein + Helsinki)
- 1× BX11 (backupy)

**Účty:**

- Hetzner (Cloud + Robot/Dedicated)
- Vercel Pro ($20/měs)
- Cloudflare (free OK)
- ClickHouse Cloud Dev
- Doppler (free)
- Grafana Cloud (free)
- Better Stack (free)

**Žádosti:**

- Hetzner support: SMTP unblock pro Cloud servers (na všech IPs)
- Hetzner support: PTR/rDNS setup pro každou MTA IP
- ZeroBounce / Kickbox trial account (list validation)

---

## 8. Otázky stále otevřené

- [ ] **ASN diversity strategy** — Phase 5+ start s OVH/Vultr, ale konkrétní volba mezi nimi a Inception
- [ ] **Vlastní /24 leasing** — kdy přejít? Po prvních $50k MRR?
- [ ] **EU data residency** — Vercel edge funkce mohou běžet US nodes. Pro plnou EU compliance nutno omezit přes Vercel Edge Config nebo místo Vercelu použít Hetzner pro static asset serving.
- [ ] **HA Coolify** — Coolify zatím HA management neumí. Pro Phase 5+ buď zdvojit Coolify (active/passive) nebo migrace na k3s.

---

## Související

- `PIVOT_AWS_TO_HETZNER.md` — proč pivotujeme a kompletní mapování
- `DELIVERABILITY.md` — co s těmi IPs dělat pro inbox placement
- `POZICOVANI.md` — proč CZ/SK start s touto infra

---

_Dokument vytvořen: 2026-05-18_
