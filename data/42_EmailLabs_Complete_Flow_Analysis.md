# EmailLabs – kompletní analýza flow a rolí

**Verze dokumentu:** 1.0 · **Datum:** květen 2026
**Rozsah:** Všechna flow, kterými v EmailLabs prochází data, lidé a akce – od sales přes SMTP/API setup, marketing/transactional separation, dedicated IP warm-up, ISP advocacy, S/MIME signing, až po monitoring a optimization. Speciální focus na **EmailLabs jako delivery infrastructure** (NE campaign builder!) doplňující existing systems (SALESmanago, Bloomreach, CRM, ERP, e-commerce).

> Tento dokument doplňuje `41_EmailLabs_Features_DeepDive.md` o **procesní pohled**. Zatímco první dokument popisuje, **co** EmailLabs umí, tento popisuje, **kdo s tím interaguje a jak data tečou**.

> **Klíčové rozdíly od ostatních platforem v této sérii:**
>
> - **EmailLabs NENÍ campaign builder!** Je to **delivery infrastructure**.
> - Marketing automation systémy (SALESmanago, Bloomreach, Mautic) **používají** EmailLabs jako delivery layer
> - **Plug-and-play** SMTP relay nebo Email API
> - **Pod 5 minut** start sending
> - **Polish CPaaS** (Vercom S.A. Group) – ne all-in-one platform
> - **6 billion+ messages annually** – massive scale
> - **700,000+ companies** trust
> - **Marketing vs. Transactional IP separation** UNIKÁTNÍ
> - **Local market expertise** (PL/CZ/DE/FR ISP relationships)
> - **S/MIME signing** + digital certificates (banking-grade)
> - **EU hosting** pro privacy
> - **Free plan 24,000 emails/měsíc** (nejštědřejší v EU prostoru)
> - **Email Deliverability Academy** (thought leadership)
> - **ISP advocacy** support (EmailLabs talks to ISPs pro customer)
> - **English + Polish UI only**

---

## Obsah

1. [Mapa všech aktérů](#1-mapa-aktérů)
2. [Sales & qualification flow](#2-sales-flow)
3. [Sign-up flow (Free plan + Pro)](#3-signup-flow)
4. [Sub-5-minute setup flow](#4-setup-flow)
5. [Domain authentication setup (SPF/DKIM/DMARC)](#5-domain-auth)
6. [SMTP relay configuration flow](#6-smtp-flow)
7. [Email API integration flow](#7-api-flow)
8. [Dedicated IP warm-up flow](#8-ip-warmup)
9. [Marketing/Transactional separation flow](#9-mkt-trans-separation)
10. [Marketing automation integration flow](#10-mkt-automation-int)
11. [E-commerce integration flow (IdoSell, Magento, etc.)](#11-ecommerce-int)
12. [WordPress + WP Mail SMTP flow](#12-wordpress-flow)
13. [Email lifecycle s EmailLabs](#13-email-lifecycle)
14. [Real-time analytics flow](#14-analytics-flow)
15. [Reputation Defender + list health flow](#15-reputation-flow)
16. [Bounce handling flow](#16-bounce-flow)
17. [Spam complaint handling flow](#17-spam-complaint)
18. [Webhook events flow](#18-webhook-flow)
19. [ISP advocacy & support flow](#19-isp-advocacy)
20. [S/MIME signing flow](#20-smime-flow)
21. [Email Deliverability Academy flow](#21-academy-flow)
22. [Customer journey appropriately ESP](#22-customer-journey)
23. [Multi-account / multi-stream flow](#23-multi-account)
24. [GDPR compliance flow](#24-gdpr)
25. [Datová mapa: co vidí kdo](#25-data-map)
26. [Známé úzkoprofilové místa](#26-bottlenecks)

---

## 1. Mapa všech aktérů

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│         EMAILLABS PLATFORM ECOSYSTEM                               │
│         Polish CPaaS (Vercom S.A. Group)                           │
│         Cloud SMTP & Email API · 700,000+ companies                │
│         Email DELIVERY infrastructure (NOT campaign builder)       │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [Vercom S.A. Group (Polish parent)]                               │
│   └─ EmailLabs (CPaaS service)                                     │
│       ├─ Sales team (PL + EN)                                      │
│       ├─ Customer Success                                          │
│       ├─ Technical Support (phone + online)                        │
│       ├─ Deliverability specialists                                │
│       ├─ ISP relations team (PL/CZ/DE/FR)                          │
│       ├─ Engineering team                                          │
│       ├─ Email Deliverability Academy content team                 │
│       └─ Security team (S/MIME, certificates)                      │
│           │                                                        │
│           ▼                                                        │
│                                                                    │
│   ┌──────────────────────────────────────────┐                     │
│   │   EmailLabs Account                      │                     │
│   │                                          │                     │
│   │   USER TYPES:                            │                     │
│   │   ├─ Developer (API/SMTP integration)    │                     │
│   │   ├─ Marketer (analytics + optimization) │                     │
│   │   ├─ DevOps / IT admin                   │                     │
│   │   ├─ Email Specialist                    │                     │
│   │   └─ Account Admin                       │                     │
│   │                                          │                     │
│   │   ACCOUNT STREAMS:                       │                     │
│   │   ├─ Marketing stream (IP pool A)        │                     │
│   │   ├─ Transactional stream (IP pool B)    │                     │
│   │   └─ Sub-accounts (multi-brand/agency)   │                     │
│   └──────────────┬───────────────────────────┘                     │
│                  │                                                 │
│                  ▼                                                 │
│   [Customer Systems (using EmailLabs)]                             │
│       │                                                            │
│       ├─→ CRM (SAP, Salesforce, custom)                            │
│       ├─→ ERP (system emails)                                      │
│       ├─→ CMS (WordPress, Joomla)                                  │
│       ├─→ E-commerce (IdoSell, Magento, PrestaShop, WooCommerce)   │
│       ├─→ Marketing Automation (SALESmanago, Bloomreach, Mautic)   │
│       ├─→ Custom applications                                      │
│       │                                                            │
│       └─→ All send via EmailLabs:                                  │
│           - SMTP relay                                             │
│           - Email API                                              │
│                  │                                                 │
│                  ▼                                                 │
│   [Recipients / End Users]                                         │
│       │                                                            │
│       ├─→ Transactional emails:                                    │
│       │   - Password resets (0.16s!)                               │
│       │   - Order confirmations                                    │
│       │   - Shipping notifications                                 │
│       │   - Receipts / invoices                                    │
│       │   - OTP codes                                              │
│       │                                                            │
│       └─→ Marketing emails:                                        │
│           - Newsletters                                            │
│           - Promotional campaigns                                  │
│           - Bulk dispatch                                          │
│                                                                    │
│   [EmailLabs Infrastructure]                                       │
│   ┌──────────────────────────────────────────┐                     │
│   │   Servers EU hosting                     │                     │
│   │   Multiple datacenters (redundancy)      │                     │
│   │                                          │                     │
│   │   IP pools:                              │                     │
│   │   - Marketing IPs                        │                     │
│   │   - Transactional IPs                    │                     │
│   │   - Dedicated IPs (customer-specific)    │                     │
│   │   - Shared IPs (free / lower tiers)      │                     │
│   │                                          │                     │
│   │   Per-market optimization:               │                     │
│   │   - Polish ISPs                          │                     │
│   │   - Czech ISPs                           │                     │
│   │   - German ISPs                          │                     │
│   │   - French ISPs                          │                     │
│   │   - International                        │                     │
│   │                                          │                     │
│   │   Security:                              │                     │
│   │   - SPF/DKIM/DMARC                       │                     │
│   │   - TLS encryption                       │                     │
│   │   - S/MIME signing                       │                     │
│   │   - Trusted certificates                 │                     │
│   │                                          │                     │
│   │   Speed: 0.16s delivery                  │                     │
│   │   Volume: 6+ billion/year                │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
│   [ISPs (recipients receive)]                                      │
│   ┌──────────────────────────────────────────┐                     │
│   │   Polish ISPs:                           │                     │
│   │   - WP.pl, Onet.pl, Interia.pl           │                     │
│   │                                          │                     │
│   │   Czech ISPs:                            │                     │
│   │   - Seznam.cz, Centrum.cz, Volný.cz      │                     │
│   │                                          │                     │
│   │   German ISPs:                           │                     │
│   │   - GMX, web.de, T-Online, 1&1           │                     │
│   │                                          │                     │
│   │   French ISPs:                           │                     │
│   │   - Orange, Free.fr, Laposte.net         │                     │
│   │                                          │                     │
│   │   International:                         │                     │
│   │   - Gmail, Outlook, Yahoo, Apple Mail    │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Aktéři detailněji

| Aktér                        | Vstupní bod                   | Co dělá                              | Co vidí               |
| ---------------------------- | ----------------------------- | ------------------------------------ | --------------------- |
| **Account Admin**            | Sign-up / contract            | Account settings, billing, users     | Vše                   |
| **Developer**                | SMTP/API integration          | Code integration, webhooks           | API logs, integration |
| **DevOps / IT admin**        | Server config                 | DNS, SMTP servers, monitoring        | Infrastructure        |
| **Email Specialist**         | Daily monitoring              | Analytics, optimization, list health | Reports               |
| **Marketer**                 | Analytics review              | Engagement, ROI                      | Reports               |
| **Recipient**                | Email receive                 | Open/click                           | Své emaily            |
| **EmailLabs Support**        | Phone / online                | Issue resolution, ISP advocacy       | s consent             |
| **EmailLabs Sales**          | Inquiry                       | New contracts, upgrades              | s consent             |
| **EmailLabs Deliverability** | Per-account advisor           | Optimization, reputation             | s consent             |
| **Customer System**          | Generates emails              | Sends via SMTP/API                   | –                     |
| **Marketing Automation**     | SALESmanago, Bloomreach, etc. | Sends via EmailLabs                  | EmailLabs as delivery |
| **E-commerce platform**      | IdoSell, Magento, etc.        | Transactional sends                  | –                     |
| **CRM/ERP**                  | System emails                 | Transactional sends                  | –                     |
| **CMS (WordPress)**          | Site mailings                 | Form notifications, etc.             | –                     |
| **API Client**               | Webhook receiver              | Real-time event processing           | Per scope             |
| **ISPs**                     | Receive emails                | Deliver / reject                     | –                     |

---

## 2. Sales & qualification flow

### 2.1 Lead acquisition

```
Lead sources:
- emaillabs.io / emaillabs.pl inbound
- Free plan signups (24K emails self-serve!)
- Partner referrals (Vercom S.A. Group)
- Email Deliverability Academy content
- SALESmanago co-marketing
- Bloomreach co-marketing
- Industry events (Polish marketing)
- Direct sales outreach (high-volume prospects)
- Word-of-mouth (700K+ companies network)
- G2 / Capterra reviews
```

### 2.2 Self-serve discovery

```
Many customers start self-serve:
   ↓
Visit emaillabs.io
   ↓
Read documentation
   ↓
**Sign up free plan**
- 24,000 emails/měsíc
- Self-serve
- No credit card
   ↓
Test platform
   ↓
[If satisfied → continue]
[If need more → upgrade or sales contact]
```

### 2.3 Sales-driven flow (Enterprise)

```
High-volume prospect contacts EmailLabs:
- emaillabs.io form
- Phone (Polish + English)
- Direct email
- Partnership referral
   ↓
**Discovery call (Polish/English):**
- Volume needed (millions/month?)
- Current ESP (migration?)
- Use cases (transactional? marketing? both?)
- Existing systems (CRM, ERP, etc.)
- Marketing automation platform?
- Compliance requirements (GDPR, S/MIME?)
- Geographic markets (PL? CZ? DE? FR? international?)
- Budget
- Timeline
   ↓
Qualification:
- Volume fit (mid-market+)
- Industry expertise match
- Technical capability check
- Compliance fit
```

### 2.4 Use case identification

```
EmailLabs sales identifies:

A) "We have existing system, need delivery"
→ Standard EmailLabs offering
→ SMTP relay or API
→ Sub-5-minute setup

B) "We use SALESmanago"
→ Native integration
→ Delivery infrastructure layer
→ Improved deliverability vs. shared SMTP

C) "We need S/MIME for banking"
→ Custom S/MIME implementation
→ Trusted certificates
→ Banking-grade security

D) "We have very high volume (millions/month)"
→ Enterprise plan
→ Multiple dedicated IPs
→ Custom SLA
→ Dedicated support

E) "We're EU privacy-strict"
→ EU hosting emphasis
→ Polish jurisdiction
→ GDPR compliance evidence
```

### 2.5 Custom proposal

```
EmailLabs prepares custom proposal:
- Volume tier
- Number of dedicated IPs (if needed)
- Marketing/transactional separation setup
- S/MIME (if applicable)
- Custom integrations
- SLA tier
- Support tier
- Training (Email Deliverability Academy)
- Implementation services
   ↓
Proposal sent
   ↓
Negotiation
   ↓
Contract signing
```

### 2.6 Per G2 customer quote

> _"Contact our team, who will provide you with a customized plan that will allow you to deliver transactional and marketing messages regardless of the size of your company and the number of messages you send."_

---

## 3. Sign-up flow (Free plan + Pro)

### 3.1 Free plan self-serve

Per European Alternatives:

> _"EmailLabs offers a free plan that includes 24,000 emails."_

```
Step 1: Visit emaillabs.io
   ↓
Step 2: "Try for Free" / "Sign Up"
   ↓
Step 3: Account creation form
- Email
- Password
- Name
- Company (optional)
- Phone (typically)
   ↓
Step 4: Email verification
- Confirmation email
- Click confirm
   ↓
Step 5: Account active
- 24,000 emails/měsíc available
   ↓
Step 6: Sub-5-minute setup
- DNS records (SPF, DKIM)
- SMTP credentials
- Test send
   ↓
[Sending active]
```

### 3.2 Pro plan upgrade

```
Free user reaches limits OR wants advanced features
   ↓
Account → Upgrade
   ↓
Choose Pro plan:
- Pro from €23/month
- Higher volume tiers
- Dedicated IP (additional)
- Better support
   ↓
Payment setup (credit card / invoice)
   ↓
Pro features activated
```

### 3.3 Enterprise sales

```
For very high volume / custom needs:
   ↓
Contact sales
   ↓
Custom proposal
   ↓
Contract signing
   ↓
Onboarding s implementation specialist
   ↓
[Enterprise active]
```

### 3.4 Per G2 customer praise

> _"The platform is user-friendly and offers detailed analytics that help us optimize our campaigns and ensure high deliverability rates."_

---

## 4. Sub-5-minute setup flow

### 4.1 Per oficiální claim

> _"Plug EmailLabs into your transactional sends - start sending in less than 5 minutes."_

### 4.2 Sub-5-minute setup steps

```
Step 1: Sign up EmailLabs account (1 min)
   ↓
Step 2: Get SMTP/API credentials (instant)
- SMTP host
- Port
- Username
- Password / API key
   ↓
Step 3: Add DNS records (1-2 min):
- SPF: v=spf1 include:emaillabs.io ~all
- DKIM: TXT record provided by EmailLabs
   ↓
Step 4: DNS propagation wait (varies, often < 1 hour)
- During wait, you can still configure
   ↓
Step 5: Configure application SMTP (1 min):
- Replace existing SMTP config
- Use EmailLabs credentials
- Test SMTP from app
   ↓
Step 6: Test send (1 min):
- Send test email
- Verify delivery
- Check analytics
   ↓
[Production ready]
```

### 4.3 Real-world setup time

```
Realistic timing:
- Account creation: 2-3 min
- DNS records: 2-5 min (your IT team)
- DNS propagation: 5 min - 1 hour
- App configuration: 5-10 min
- Test sends: 5 min
   ↓
Total: 15-30 min realistic
- "Under 5 minutes" = sending capability
- Full production might take longer
```

### 4.4 What's NOT included

```
Sub-5-minute setup doesn't include:
- IP warm-up (dedicated IP needs gradual)
- Complex authentication (DMARC tuning)
- S/MIME configuration
- Multi-stream setup (marketing + transactional)
- Custom integration
- Full team training
   ↓
These take longer
```

---

## 5. Domain authentication setup (SPF/DKIM/DMARC)

### 5.1 Why authentication critical

Per emaillabs.io blog:

> _"In 2026, landing in the inbox consistently requires more than just sending volume. It depends on two foundational pillars: proper authentication and disciplined list hygiene."_

> _"Email authentication is the digital equivalent of showing your ID card. It verifies that your messages are legitimate and protects your domain from being used by spoofers or phishers. Without these protocols, providers cannot reliably trust your emails."_

### 5.2 SPF setup

```
Step 1: Check existing SPF
- Query: dig TXT yourdomain.com
- Find existing v=spf1 record
   ↓
Step 2: Add EmailLabs to SPF
- Existing: v=spf1 include:google.com ~all
- Updated: v=spf1 include:google.com include:emaillabs.io ~all
   ↓
Step 3: DNS record update
- Update TXT record
- Save in DNS
   ↓
Step 4: Verify
- Wait propagation
- EmailLabs validates
- Test send
   ↓
[SPF aligned]
```

### 5.3 DKIM setup

```
Step 1: EmailLabs generates DKIM key pair
- Public key shared
- Private key on EmailLabs servers
   ↓
Step 2: Add DKIM DNS record
- Selector._domainkey.yourdomain.com
- TXT record s public key
   ↓
Step 3: EmailLabs signs outgoing emails
- Private key signs
- Recipient ISPs verify with public key
   ↓
Step 4: Verify
- Send test email
- Check DKIM-Signature header
- Verify signature passes
   ↓
[DKIM signing active]
```

### 5.4 DMARC setup

```
Step 1: Define DMARC policy
- Start: p=none (monitoring only)
- Reporting: rua=mailto:dmarc@yourdomain.com
   ↓
Step 2: Add DMARC DNS record
- _dmarc.yourdomain.com
- TXT: v=DMARC1; p=none; rua=mailto:...
   ↓
Step 3: Monitor DMARC reports
- Daily/weekly reports
- Identify legitimate vs. spoofing
   ↓
Step 4: Tighten policy gradually
- p=none → p=quarantine → p=reject
- Over several weeks
   ↓
Step 5: Full DMARC enforcement
- p=reject
- Spoofers blocked
- Brand protected
   ↓
[Full DMARC enforcement]
```

### 5.5 Per emaillabs.io blog detail

> _"DMARC: (Domain-based Message Authentication, Reporting & Conformance): The ultimate policy layer."_

### 5.6 Gmail/Yahoo 2024+ compliance

```
Gmail/Yahoo 2024 requirements:
- SPF aligned ✅
- DKIM aligned ✅
- DMARC published ✅
- One-click unsubscribe ✅ (RFC 8058)
- Spam complaint rate < 0.1%
- Sender reputation high
   ↓
EmailLabs handles automatically:
- One-click unsubscribe headers
- Compliance by default
- Customers compliant
```

### 5.7 EmailLabs help

```
EmailLabs provides:
- Step-by-step setup guides
- DNS record templates
- Validation tools
- Support assistance
- Deliverability Academy content
   ↓
Authentication setup smooth
```

---

## 6. SMTP relay configuration flow

### 6.1 SMTP integration setup

Per docs.emaillabs.io:

> _"Połączenie z EmailLabs za pomocą protokołu SMTP oferuje szeroki wachlarz korzyści i możliwości związanych z efektywną wysyłką wiadomości e-mail oraz poprawą dostarczalności."_

### 6.2 SMTP setup steps

```
Step 1: Get SMTP credentials
- EmailLabs account → SMTP settings
- Hostname: smtp.emaillabs.io (or similar)
- Port: 587 (TLS) or 465 (SSL)
- Username: account-specific
- Password / SMTP key: generated
   ↓
Step 2: Configure your application
- CRM SMTP settings
- ERP outgoing email
- WordPress (WP Mail SMTP plugin)
- Magento mail config
- Custom app SMTP config
   ↓
Step 3: Replace existing SMTP
- Local sendmail → EmailLabs
- Gmail SMTP → EmailLabs
- Other provider → EmailLabs
   ↓
Step 4: Test
- Send test email
- Verify delivery
- Check headers (DKIM signed, etc.)
   ↓
Step 5: Monitor first sends
- Check EmailLabs analytics
- Verify deliverability
- Address issues
   ↓
[Production SMTP active]
```

### 6.3 SMTP advantages

Per emaillabs.io blog:

> _"SMTP Relay (Simple Mail Transfer Protocol): This acts as a bridge. You can configure your CRM, CMS (like WordPress or Magento), or marketing automation platform to route emails through a specialized SMTP server instead of your local outbox. This bypasses daily sending limits while keeping your current workflow intact."_

**Klíčové výhody:**

- **No code changes** required
- **Existing workflow** preserved
- **Bypass local limits**
- **EmailLabs handles everything**

### 6.4 SMTP use case: WordPress

```
Existing WordPress installation:
- Native mail() function unreliable
- Goes to spam often
- No deliverability tracking
   ↓
Install WP Mail SMTP plugin
   ↓
Configure EmailLabs as SMTP provider:
- Plugin settings → SMTP
- Host, port, username, password
- Save
   ↓
All WordPress emails now via EmailLabs:
- Form submissions
- User registrations
- Password resets
- WooCommerce orders
- Plugin notifications
   ↓
Better deliverability
Tracking available
```

### 6.5 SMTP use case: SALESmanago

Per oficiální:

> _"Integrating EmailLabs infrastructure with SALESmanago is extremely simple and fast."_

```
SALESmanago account
   ↓
SALESmanago settings → External SMTP
   ↓
Enter EmailLabs SMTP credentials
   ↓
Save + Test
   ↓
SALESmanago campaigns now via EmailLabs:
- Better deliverability
- Marketing IP pool
- Polish ISP optimization
- Up to 1,000 contacts per send (SALESmanago limit)
   ↓
[Integration active]
```

---

## 7. Email API integration flow

### 7.1 Email API setup

```
Step 1: EmailLabs account → API
   ↓
Step 2: Generate API key
- Name + description
- Scope (read/write)
- Rate limits
- IP whitelist (security)
   ↓
Step 3: API key generated
- Copy securely
- Never expose v code
   ↓
Step 4: Read API documentation
- docs.emaillabs.io
- Endpoint reference
- Code samples
- Libraries available
   ↓
Step 5: Implement v application
- Use SDK or direct REST calls
- Configure authentication
- Build email sending logic
   ↓
Step 6: Test
- Sandbox / test mode
- Verify API responses
- Check analytics
   ↓
[Production API active]
```

### 7.2 API send flow

```
Application event (e.g., password reset request)
   ↓
Application generates email content:
- Template selection
- Variables (user data)
- Personalization
   ↓
Application calls EmailLabs API:
   POST https://api.emaillabs.io/v1/send
   Headers: Authorization: Bearer {key}
   Body:
   {
     "from": "noreply@yourdomain.com",
     "to": "user@example.com",
     "subject": "Password Reset",
     "html": "...",
     "text": "...",
     "tags": ["password_reset"],
     "track_opens": true,
     "track_clicks": true
   }
   ↓
EmailLabs processes:
- Validates request
- Checks plan limits
- Applies DKIM signing
- Applies SPF
- Routes via optimal IP
- Selects best IP per recipient ISP
   ↓
Response (synchronous):
{
  "message_id": "abc123",
  "status": "queued"
}
   ↓
Async delivery:
- 0.16 seconds to recipient ISP
- ISP routing
- Inbox / Spam decision
   ↓
Webhook fires (async):
- delivered / bounced / opened / clicked
- POST to your webhook URL
   ↓
Your application updates records
```

### 7.3 API use cases

#### Password reset (urgent)

```
User clicks "Forgot Password"
   ↓
Application generates token + email
   ↓
API call to EmailLabs
   ↓
0.16s delivery
   ↓
User receives within seconds
   ↓
User clicks link, resets password
   ↓
Tracking: delivered + opened + clicked
```

#### Order confirmation

```
Customer places order
   ↓
Application generates confirmation
   ↓
API call to EmailLabs s template + variables
   ↓
EmailLabs renders + sends
   ↓
Customer receives immediately
   ↓
Tracking: complete lifecycle
```

#### Bulk dispatch

```
Marketing system needs to send 100K emails
   ↓
Batch API calls (or single bulk)
   ↓
EmailLabs queues efficiently
   ↓
High-throughput dispatch
   ↓
All delivered s respect to ISP limits
   ↓
Real-time analytics
```

### 7.4 Per oficiální advantages

> _"Email API: Designed for developers and product teams, a RESTful Email API enables deep integration into applications. It allows for automated transactional triggers (like password resets or invoices) and high-speed bulk dispatch with full programmatic control over the message content and timing."_

---

## 8. Dedicated IP warm-up flow

### 8.1 Why warm-up matters

```
New dedicated IP = no reputation
   ↓
ISPs don't know if it's spammy
   ↓
Initial sends: cautious filtering
- Some to spam folder
- Some throttled
- Some rejected
   ↓
Need to build reputation:
- Send low volume initially
- Engaged recipients only
- Gradually increase
   ↓
ISPs learn:
- "This IP sends legitimate emails"
- "Recipients engage"
- "Low complaint rate"
   ↓
Trust builds
```

### 8.2 Warm-up schedule

```
Standard warm-up (4-6 weeks):

Week 1:
- Day 1-2: 50-100 emails (most engaged)
- Day 3-4: 200-500
- Day 5-7: 1000-2000

Week 2:
- 5,000-10,000/day

Week 3:
- 25,000-50,000/day

Week 4:
- 100,000-500,000/day

Week 5+:
- Full volume
- Maintain consistency
```

### 8.3 EmailLabs warm-up support

```
Customer gets dedicated IP
   ↓
EmailLabs warm-up team:
- Recommends initial schedule
- Monitors reputation daily
- Adjusts pace
- Provides feedback
- Alerts on issues
   ↓
Customer implements:
- Sends per schedule
- Most engaged subscribers first
- Avoids bulk new lists
   ↓
**Reputation built over weeks**
   ↓
[Full production sending]
```

### 8.4 Warm-up best practices

```
Do:
✅ Send to most engaged subscribers first
✅ Gradually increase volume
✅ Monitor metrics closely
✅ Communicate w/ recipients (good content)
✅ Maintain consistent sending schedule

Don't:
❌ Blast full list day 1
❌ Send to old/dormant subscribers initially
❌ Have inconsistent volume
❌ Ignore early warnings
❌ Rush warm-up
```

### 8.5 Multiple dedicated IPs

For high-volume customers:

```
Strategy A: Single IP, full warm-up
- All marketing on one IP
- One reputation
- Simpler

Strategy B: Multiple IPs, parallel warm-up
- Multiple IPs warming together
- Per-stream IPs (marketing vs. trans)
- More complex but more resilient
- Better for enterprise

Strategy C: IP rotation
- Multiple IPs in rotation
- Spread load
- Per-ISP optimization
- Enterprise advanced
```

### 8.6 EmailLabs IP advisory

```
Per oficiální:
"can offer advice on optimization or how best to improve your ROI"

EmailLabs deliverability team:
- Per-customer monitoring
- IP performance analysis
- Reputation score tracking
- Proactive recommendations
- ISP feedback loop monitoring
- Blacklist monitoring
```

---

## 9. Marketing/Transactional separation flow

### 9.1 Why separation critical

Per oficiální:

> _"Choose to separate between transactional and marketing emails, and max your effective deliverability of the most important messages, and have that password reset email waiting for them before they are even able to open their email tab."_

### 9.2 Problem without separation

```
Single IP for everything:
   ↓
Marketing campaign (newsletter):
- Some recipients mark as spam
- Some bounce (old addresses)
- IP reputation slightly drops
   ↓
Same IP transactional:
- Password reset goes via same IP
- ISP filters based on recent reputation
- Password reset to spam folder
- User can't login
- Customer support ticket
- Bad UX
```

### 9.3 Solution: separated streams

```
Customer sets up 2 streams:

Stream A - Marketing:
- IP pool A (marketing IPs)
- Newsletter campaigns
- Promotional emails
- Bulk dispatches
- Some volatility OK

Stream B - Transactional:
- IP pool B (transactional IPs)
- Password resets
- Order confirmations
- Receipts
- Critical communications
- High reputation maintained
   ↓
Marketing issues don't affect transactional
Critical emails always delivered
```

### 9.4 Setup flow

```
Step 1: Determine email types
- List all email types in your application
- Categorize: marketing vs. transactional

Step 2: Configure EmailLabs streams
- Sub-account 1 (or separate API key) for marketing
- Sub-account 2 (or separate API key) for transactional
- Different SMTP credentials
- Different API endpoints (per sub-account)

Step 3: Update application code
- Marketing emails → marketing stream credentials
- Transactional emails → transactional stream credentials
- Code routes accordingly

Step 4: Configure dedicated IPs (optional)
- Dedicated IP for marketing
- Dedicated IP for transactional
- Higher control + cost

Step 5: Test
- Send test emails through each stream
- Verify routing
- Monitor analytics per stream

Step 6: Production
- All traffic flows through correct streams
- Separated reputations
- Optimized deliverability
```

### 9.5 Real-world example: e-shop

```
E-shop has:
- Order confirmations (transactional)
- Shipping notifications (transactional)
- Password resets (transactional)
- Account verifications (transactional)
- Newsletter campaigns (marketing)
- Promotional emails (marketing)
- Abandoned cart (marketing-like but urgency!)
   ↓
EmailLabs setup:
- Transactional stream: confirmations, shipping, passwords, verifications
- Marketing stream: newsletters, promotions
- Abandoned cart: typically marketing (some debate)
   ↓
Result:
- Transactional always reaches inbox
- Marketing volume doesn't impact transactional
- Better customer experience
- Higher conversions
```

### 9.6 Capterra customer experience

> _"Having a dedicated IP means we are in control of our own reputation and do not risk getting downrated due to other customers using the same IP for marketing emails so this was one main reason why we picked Email labs."_

⚠️ Real customer = explicit reason pro EmailLabs choice.

---

## 10. Marketing automation integration flow

### 10.1 Integration pattern

```
Customer's marketing automation platform handles:
- Campaign creation
- Segmentation
- Workflows / automation
- Subscribers
- Content
- Analytics (campaign-level)
   ↓
EmailLabs handles:
- Delivery infrastructure
- IP reputation
- ISP relationships
- Real-time delivery analytics
- List health monitoring
- Deliverability optimization
   ↓
Synergy: best of both worlds
```

### 10.2 SALESmanago integration

Per oficiální:

> _"Integrating EmailLabs infrastructure with SALESmanago is extremely simple and fast. One thing to keep in mind, however, is that you are able to send only one message to 1,000 contacts at a time using an external SMTP server."_

```
SALESmanago setup:

Step 1: SALESmanago account → Email settings
Step 2: External SMTP configuration
Step 3: Enter EmailLabs SMTP credentials
   - Host, port, user, password
Step 4: Save + Test
Step 5: Configure SALESmanago to use external SMTP
   ↓
SALESmanago campaigns:
- Campaign created v SALESmanago
- Audience selected (max 1,000 per send batch)
- Send button clicked
- SALESmanago hands off to EmailLabs SMTP
- EmailLabs delivers
- Analytics in both:
  - SALESmanago: campaign-level
  - EmailLabs: infrastructure-level
   ↓
Better deliverability vs. SALESmanago shared SMTP
```

### 10.3 Bloomreach Engagement integration

```
Bloomreach Engagement setup:

Step 1: Bloomreach account → Channels → Email
Step 2: Custom SMTP / Email provider
Step 3: Enter EmailLabs credentials
Step 4: Verify + activate
   ↓
Bloomreach campaigns:
- CDP-driven targeting
- Personalization
- Send via EmailLabs
- Deep DTC capabilities
   ↓
EU-friendly stack (both EU-rooted)
```

### 10.4 Mautic (open-source) integration

Per oficiální:

> _"For those using Mautic, the automation marketing platform, we have good news: you can integrate Mautic with EmailLabs, a RESTful API that provides the best email deliverability in Poland."_

```
Mautic setup:

Step 1: Mautic Configuration → Email settings
Step 2: Mail transport: EmailLabs (or SMTP)
Step 3: SMTP / API credentials
Step 4: Test send
   ↓
Mautic functions:
- Workflows
- Campaigns
- Segments
- Forms
   ↓
EmailLabs delivers
   ↓
Open-source automation + premium delivery
```

### 10.5 Multi-platform agency setup

```
Agency manages 50 clients across platforms:
- Client A: SALESmanago + EmailLabs
- Client B: Bloomreach + EmailLabs
- Client C: Mautic + EmailLabs
- Client D: Custom CRM + EmailLabs
   ↓
EmailLabs serves all uniformly:
- High deliverability
- Consistent analytics format
- Centralized billing (option)
- Multi-account management
   ↓
Agency benefits:
- Single delivery vendor
- Standardized quality
- Cost optimization
```

---

## 11. E-commerce integration flow (IdoSell, Magento, etc.)

### 11.1 IdoSell integration (PL leader)

```
IdoSell = Polish e-commerce platform leader
   ↓
Integration setup:
Step 1: IdoSell admin → Email settings
Step 2: External SMTP provider
Step 3: EmailLabs SMTP credentials
Step 4: Configure email types:
- Order confirmations
- Shipping notifications
- Account emails
- Newsletter (optional)
Step 5: Test
   ↓
[Live]
   ↓
Benefits:
- Polish ISP optimization (Polish e-shop priority!)
- Better deliverability
- Polish customer comm reliability
```

### 11.2 Magento / Adobe Commerce

```
Magento setup:
Step 1: Admin Panel → Stores → Configuration → Sales → Sales Emails / Customers / etc.
Step 2: Configure email senders
Step 3: System → Mail Settings (or plugin like Mageplaza SMTP)
Step 4: EmailLabs SMTP credentials
Step 5: Save + Test
   ↓
Magento emails via EmailLabs:
- Customer registration
- Order confirmations
- Shipping
- Account changes
- Newsletter (Magento marketing)
   ↓
Better deliverability for B2C
```

### 11.3 PrestaShop

Per docs.emaillabs.io:

> _"PrestaShop... Doskonale nadaje się do tworzenia, organizowania i publikowania treści na stronach internetowych."_

```
PrestaShop setup:
Step 1: Back Office → Advanced Parameters → Email
Step 2: Send emails: Set my own SMTP parameters
Step 3: EmailLabs SMTP host, port, encryption
Step 4: Username + password
Step 5: Test email
   ↓
[Live]
```

### 11.4 WooCommerce (WordPress)

```
WooCommerce setup (via WP Mail SMTP):
Step 1: Install WP Mail SMTP plugin
Step 2: Configure mailer: SMTP
Step 3: EmailLabs SMTP details
Step 4: Save + Test
   ↓
All WooCommerce + WordPress emails:
- Order confirmations
- New customer emails
- Account verification
- Password resets
- Custom form notifications
- Marketing (via Mailchimp/etc. integrated)
   ↓
[Live]
```

### 11.5 E-commerce best practices

```
For e-shops s EmailLabs:

1. Separate marketing vs. transactional
   - Critical for cart abandonment
   - Order confirmation MUST deliver

2. Authenticate domain properly
   - SPF includes EmailLabs
   - DKIM signing
   - DMARC monitoring → enforcement

3. Monitor metrics
   - Per-email-type performance
   - Identify problematic templates
   - Optimize subject lines

4. Use dedicated IP for transactional
   - Critical pro UX
   - Marketing can share

5. List hygiene
   - Remove inactive
   - Validate at form submission
   - Double opt-in for marketing

6. Compliance
   - GDPR consent records
   - Opt-out easy access
   - Polish/CZ/DE/etc. regulations
```

---

## 12. WordPress + WP Mail SMTP flow

### 12.1 Why WP Mail SMTP + EmailLabs

```
WordPress native mail() function:
- Unreliable
- Goes to spam often
- No deliverability tracking
- Domain reputation poor
   ↓
WP Mail SMTP plugin + EmailLabs:
- Better deliverability
- Professional infrastructure
- Tracking + analytics
- Reputation building
```

### 12.2 Setup flow

```
Step 1: Install WP Mail SMTP plugin
- WordPress admin → Plugins → Add New
- Search: "WP Mail SMTP"
- Install + Activate

Step 2: Get EmailLabs credentials
- EmailLabs account → SMTP

Step 3: Configure plugin
- WP Mail SMTP → Settings
- Mailer: Other SMTP
- Host: smtp.emaillabs.io
- Port: 587
- Encryption: TLS
- Authentication: Yes
- Username: provided
- Password: provided

Step 4: Save + Test
- Send test email
- Verify delivery
   ↓
[All WordPress emails via EmailLabs]
```

### 12.3 What emails are routed

```
WordPress emails routed:
- User registration
- Password reset
- Comment notifications
- Plugin notifications (WooCommerce, Contact Form 7, etc.)
- Admin notifications
- Newsletter (if Mailchimp WordPress)
- Form submissions (Gravity Forms, WPForms)
- Order confirmations (WooCommerce)
   ↓
ALL via EmailLabs reliable delivery
```

### 12.4 Polish WordPress sites

```
For PL WP sites particularly:
- Polish ISP relationships matter
- EmailLabs optimization for WP.pl, Onet.pl, Interia.pl
- Better than international SMTPs for PL audience
- Local market expertise
```

---

## 13. Email lifecycle s EmailLabs

```
┌─────────────────────────────────────────────────────────────────┐
│  1. APPLICATION/SYSTEM EVENT                                    │
│     - User clicks "Forgot Password"                             │
│     - Customer places order                                     │
│     - Marketing system triggers campaign                        │
│     - CMS auto-notification                                     │
│                            │                                    │
│                            ▼                                    │
│  2. EMAIL GENERATED                                             │
│     - Application/system creates email content                  │
│     - Template + variables                                      │
│     - Recipient identified                                      │
│                            │                                    │
│                            ▼                                    │
│  3. SEND VIA EMAILLABS                                          │
│     Option A: SMTP relay                                        │
│     - Standard SMTP connection                                  │
│     - Authentication                                            │
│     - Send envelope + content                                   │
│                                                                 │
│     Option B: Email API                                         │
│     - REST POST call                                            │
│     - JSON payload                                              │
│     - Return message_id                                         │
│                            │                                    │
│                            ▼                                    │
│  4. EMAILLABS PROCESSING                                        │
│     - Validates request                                         │
│     - Plan limits check                                         │
│     - Sender authorization                                      │
│     - DKIM signing                                              │
│     - SPF compliance                                            │
│     - Determines IP pool (marketing/transactional)              │
│     - Selects optimal IP (per recipient ISP)                    │
│                            │                                    │
│                            ▼                                    │
│  5. SMTP SEND from EMAILLABS                                    │
│     - EU servers                                                │
│     - DKIM signed                                               │
│     - SPF compliant                                             │
│     - DMARC aligned                                             │
│     - List-Unsubscribe RFC 8058                                 │
│     - S/MIME signed (if configured)                             │
│     - 0.16 seconds typical delivery                             │
│                            │                                    │
│                            ▼                                    │
│  6. ISP RECEIVES                                                │
│     - **Local market optimization:**                            │
│        - Polish ISPs (WP.pl, Onet.pl, Interia.pl)               │
│        - Czech ISPs (Seznam.cz, Centrum.cz)                     │
│        - German ISPs (GMX, web.de, T-Online)                    │
│        - French ISPs                                            │
│        - Gmail, Outlook, Yahoo, etc.                            │
│     - Auth checks (SPF/DKIM/DMARC)                              │
│     - Reputation check (per IP)                                 │
│     - Spam filter analysis                                      │
│                            │                                    │
│                            ▼                                    │
│  7. ROUTING                                                     │
│     - **Inbox (high probability)**                              │
│     - Promotions tab (Gmail)                                    │
│     - Spam (rare s good reputation)                             │
│                            │                                    │
│                            ▼                                    │
│  8. RECIPIENT INTERACTION                                       │
│     - Open → pixel → tracked                                    │
│     - Click → tracking URL → tracked                            │
│     - Reply → handled per setup                                 │
│     - Spam complaint → tracked                                  │
│                            │                                    │
│                            ▼                                    │
│  9. EMAILLABS ANALYTICS UPDATE                                  │
│     - Real-time metrics                                         │
│     - Per-IP analysis                                           │
│     - Per-ISP performance                                       │
│     - Reputation tracking                                       │
│                            │                                    │
│                            ▼                                    │
│ 10. WEBHOOK FIRES                                               │
│     - POST to your application URL                              │
│     - Event: delivered/opened/clicked/bounced/...               │
│     - Your application updates records                          │
│                            │                                    │
│                            ▼                                    │
│ 11. CUSTOMER REPORTING                                          │
│     - EmailLabs dashboard                                       │
│     - Custom dashboards                                         │
│     - API access to reports                                     │
│     - Marketing automation receives data back                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 14. Real-time analytics flow

### 14.1 Analytics access

```
EmailLabs Dashboard:
- Real-time view
- Customer login → Analytics
- All metrics visible
- Per-date drill-down
- Per-IP analysis
- Per-domain analysis
- Per-recipient timeline
```

### 14.2 Key metrics tracked

```
Delivery metrics:
- Sent count
- Delivered count
- Bounced (soft + hard) count
- Bounce rate
- Spam complaint rate

Engagement metrics:
- Open rate (with caveat: Apple Mail Privacy)
- Click rate (CTR)
- Unique opens / clicks
- Top clicked links

List health metrics:
- Spam trap hits
- Inactive recipients %
- New subscribers
- Unsubscribes

Reputation metrics:
- Per-IP reputation score
- Per-domain reputation
- ISP feedback loop signals
- Blacklist monitoring

Performance metrics:
- Delivery time (avg)
- Queue size
- Throughput
```

### 14.3 Real-time alerts

```
EmailLabs alerts (configurable):
- Bounce rate threshold exceeded
- Spam complaint rate exceeded
- Delivery rate drop
- IP reputation drop
- Spam trap hit
- ISP blocking detected
   ↓
Email + dashboard notification
   ↓
Customer can react quickly
```

### 14.4 Export options

```
Data export:
- CSV download (any date range)
- API access (JSON)
- Webhook events (real-time)
- Scheduled reports (email digest)
   ↓
Integration s:
- Google Analytics (UTM auto-add)
- Custom BI tools
- Data warehouses (via API)
```

### 14.5 Google Analytics integration

Per oficiální:

> _"EmailLabs provides an option to integrate with Google Analytics. With our new application, EmailLabs will automatically add UTM's to links included in your emails."_

```
GA integration:
- Enable in EmailLabs settings
- EmailLabs auto-adds UTM parameters to all links
- Recipients click → GA tracks
- Source: EmailLabs / Campaign: identifier
- Full conversion attribution
   ↓
Marketing teams see:
- Traffic from email
- Conversions from email
- ROI calculation
```

---

## 15. Reputation Defender + list health flow

### 15.1 Per oficiální / SourceForge

> _"Reputation Defender is SMTP's proprietary technology that uses big data to proactively monitor your email list health and safeguard your domain and IP reputation among ISPs by suppressing bad emails in your sends from hard and soft bounces."_

### 15.2 Continuous monitoring

```
EmailLabs continuously monitors:
- Hard bounces (permanent failures)
- Soft bounces (temporary failures)
- Spam complaints
- Spam trap hits
- Engagement decline patterns
- ISP feedback loop signals
- Blacklist mentions
   ↓
Per recipient + per IP + per domain analysis
   ↓
Health score calculation
```

### 15.3 Auto-suppression

```
Bad addresses identified:
- Hard bounces → immediate auto-suppression
- Multiple soft bounces → auto-suppression after threshold
- Spam complaints → immediate suppression
- Spam trap hits → recipient flagged
   ↓
Future sends to these addresses blocked
   ↓
Reputation protected
```

### 15.4 List health score

```
EmailLabs calculates health score:
- % active vs. inactive
- Recent engagement rate
- Bounce rate trend
- Complaint rate
- Spam trap incidents
- Domain reputation
   ↓
Score: 0-100 (or letter grade)
- 90+: Excellent
- 70-89: Good
- 50-69: Needs attention
- < 50: Poor (urgent action)
```

### 15.5 Customer actions

```
Health score declining:
   ↓
EmailLabs alerts customer
   ↓
Customer reviews:
- Identifies issue
- Removes inactive segments
- Reviews acquisition sources
- Validates new subscribers
- Re-engagement campaign
- Updates lists
   ↓
Health recovers
   ↓
Deliverability improves
```

### 15.6 Per oficiální benefit

> _"This ensures your delivery rates and inbox placement incrementally gets better over time."_

---

## 16. Bounce handling flow

### 16.1 Bounce types

```
Soft bounce (4xx response):
- Temporary issue
- Mailbox full
- Server temporarily unavailable
- Greylisting
   ↓
Retry: typically 3-5 times over 24-72 hours
   ↓
If persists: convert to hard bounce

Hard bounce (5xx response):
- Permanent failure
- Address doesn't exist
- Domain doesn't exist
- Blocked permanently
   ↓
Immediate suppression
```

### 16.2 Bounce flow

```
EmailLabs sends email
   ↓
ISP responds:
- 250 OK → delivered (success)
- 4xx → soft bounce
- 5xx → hard bounce
   ↓
EmailLabs records bounce:
- Bounce type + code
- ISP-specific reason
- Timestamp
- Recipient
   ↓
Action taken:
- Hard bounce → suppress recipient
- Soft bounce → schedule retry
- Recipient list updated
   ↓
Webhook fires:
- POST to customer URL
- Event: bounced
- Type: soft/hard
- Reason: ISP response
   ↓
Customer system updates:
- Mark recipient as bounced
- Stop future sends (if hard)
- Investigation
```

### 16.3 Bounce analysis

```
EmailLabs analytics show:
- Bounce rate trend
- Bounce reasons categorized
- Per-ISP bounce rates
- Per-campaign bounce rates
- Spam-related bounces flagged
   ↓
Customer identifies:
- Bad acquisition sources
- Outdated lists
- Domain reputation issues
- ISP-specific problems
   ↓
Actions taken
```

### 16.4 Best practices

```
Reduce bounces:
✅ Double opt-in
✅ Email verification at form submission
✅ Regular list hygiene
✅ Remove inactive 6+ months
✅ Don't import old lists
✅ Validate before mass sends
✅ Use Email Verification API (if available)
```

---

## 17. Spam complaint handling flow

### 17.1 Spam complaint flow

```
Recipient marks email as spam (Gmail/Yahoo/etc.)
   ↓
ISP feedback loop fires (ISP → EmailLabs)
   ↓
EmailLabs receives complaint:
- Recipient
- Campaign
- ISP
- Timestamp
   ↓
EmailLabs action:
- Suppress recipient immediately
- Future sends blocked
- Log complaint
- Update reputation tracking
   ↓
Webhook fires:
- POST to customer URL
- Event: spam_complaint
   ↓
Customer system:
- Mark as opted-out / complained
- Stop all future sends
- Investigation
```

### 17.2 Complaint rate thresholds

```
Industry standards:
- < 0.1%: Good
- 0.1-0.3%: Warning
- > 0.3%: Critical (deliverability impacted)
   ↓
EmailLabs alerts when approaching limit
   ↓
ISP feedback loop monitoring
```

### 17.3 Customer reaction

```
High complaint rate detected:
   ↓
EmailLabs notifies customer:
- "Complaint rate increasing"
- Specific campaign identified
- Recommendations provided
   ↓
Customer reviews:
- Content quality
- Acquisition sources
- Audience targeting
- Frequency
- Subject lines
- Unsubscribe ease
   ↓
Adjustments made
   ↓
Complaint rate decreases
   ↓
Reputation recovers
```

---

## 18. Webhook events flow

### 18.1 Webhook setup

```
EmailLabs account → Webhooks
   ↓
Configure:
- Target URL (your application)
- Events subscribed:
  - delivered
  - opened
  - clicked
  - bounced (soft/hard)
  - spam_complaint
  - unsubscribed
  - failed
- Signature verification (HMAC)
- Retry policy
   ↓
[Webhooks active]
```

### 18.2 Webhook event flow

```
Email event occurs (e.g., recipient opens)
   ↓
EmailLabs processes event
   ↓
EmailLabs fires webhook:
POST https://yourdomain.com/webhooks/emaillabs
Headers:
  Content-Type: application/json
  X-Signature: HMAC-SHA256...
Body:
{
  "event": "opened",
  "message_id": "abc123",
  "recipient": "user@example.com",
  "timestamp": "2026-05-18T10:23:45Z",
  "campaign": "newsletter_2026_05",
  "ip": "...",
  "user_agent": "..."
}
   ↓
Your application:
- Receives POST
- Verifies signature
- Processes event
- Updates database
- Returns 200 OK
```

### 18.3 Webhook use cases

```
1. CRM sync:
   - Recipient opens → mark as engaged v CRM
   - Click → log activity
   - Bounce → flag contact

2. Marketing automation:
   - Engagement events → trigger next workflow step
   - Spam complaint → exit workflow + suppress

3. Customer support:
   - Failed delivery → create support ticket
   - Account verification not opened → follow-up

4. Analytics:
   - Real-time dashboard updates
   - Custom reporting
   - Multi-source attribution

5. Subscription management:
   - Unsubscribe → remove from active list
   - Update preferences across systems
```

### 18.4 Webhook reliability

```
EmailLabs webhook delivery:
- Retry on failure
- Exponential backoff
- Multiple attempts (typically 3-5)
- Failed delivery logging
- Customer can replay (typically)
   ↓
Reliable event delivery
```

---

## 19. ISP advocacy & support flow

### 19.1 EmailLabs ISP advocacy

Per oficiální:

> _"We connect with ISPs on your behalf and can offer advice on optimization or how best to improve your ROI."_

⚠️ **UNIKÁTNÍ service:**

- EmailLabs **talks to ISPs** for customer
- ISP communication channels established
- Customer doesn't deal with ISPs directly

### 19.2 ISP issue scenarios

```
Scenario A: Sudden blacklist
- Customer's IP blocked by ISP
- Delivery drops
   ↓
Customer notifies EmailLabs
   ↓
EmailLabs:
- Identifies which ISP
- Reviews logs
- Investigates root cause
- Contacts ISP directly
- Requests delisting
- Negotiates resolution
   ↓
Customer back to normal

Scenario B: Throttling issues
- Slow delivery to specific ISP
   ↓
EmailLabs adjusts:
- Throughput per ISP
- IP rotation
- ISP feedback loop monitoring
- Direct communication
   ↓
Resolved

Scenario C: Reputation drop
- Spam complaints spiked
- ISP reputation tanking
   ↓
EmailLabs:
- Analyzes causes
- Recommends list cleanup
- Adjusts IP usage
- Communicates with ISP
- Reputation recovery plan
   ↓
Customer guided through recovery
```

### 19.3 Customer benefits

```
Without EmailLabs:
- Customer deals with ISPs directly
- No direct communication channels
- Difficult to resolve issues
- DIY reputation management
- Long downtime possible

With EmailLabs:
- Expert team handles
- Established ISP relationships
- Faster resolution
- Strategic guidance
- Better outcomes
```

### 19.4 Per G2 reviewer

> _"The customer support team responds quickly if needed, so we are not left alone with the platform."_

> _"We have been working with EmailLabs since 2020, and if any situation required a prompt response, the EmailLabs Team was there for us."_

---

## 20. S/MIME signing flow

### 20.1 S/MIME implementation

Per oficiální:

> _"Sending digitally signed and encrypted emails with S/MIME and other trusted certificates are avaliable on local markets, which is designed to protect your business from..."_

### 20.2 Implementation flow

```
Customer needs S/MIME signing:
   ↓
**Sales engagement:**
- Custom feature
- Local market certificate (Polish, Czech, etc.)
- Trusted CA partnership
   ↓
**Setup:**
- Customer obtains S/MIME certificate
  - From trusted CA
  - Or via EmailLabs partner
- Certificate installed on EmailLabs
- Configuration per sender domain
   ↓
**Configuration:**
- Which emails are signed?
  - All? Specific? Conditional?
- Encryption requirements?
  - Sign only?
  - Sign + encrypt?
   ↓
**Testing:**
- Send signed test emails
- Verify signature presence
- Verify recipient receives valid signature
- Test encryption (if applicable)
   ↓
**Production:**
- All applicable emails signed
- Anti-spoofing maximum
- Banking-grade security
```

### 20.3 Banking use case

```
Polish bank sends customer statements:
- Monthly statements
- Transaction notifications
- Investment reports
   ↓
S/MIME signed:
- Customer sees verification badge in email
- Signature cryptographically verifies sender
- Tamper detection
- Anti-phishing protection
   ↓
Trust + Security maximum
```

### 20.4 Healthcare use case

```
Healthcare provider sends:
- Patient communications (where allowed)
- Lab results
- Prescription info
   ↓
S/MIME ensures:
- Authentic sender
- Untampered content
- Confidentiality (if encrypted)
- Regulatory compliance
```

### 20.5 Vs. competitors

```
S/MIME support:
- EmailLabs: ✅ Local markets
- SendGrid: limited
- Mailgun: limited
- Brevo: -
- Mailchimp: -
- rapidmail: -
   ↓
UNIKÁTNÍ pro CEE/PL banking and finance customers
```

---

## 21. Email Deliverability Academy flow

### 21.1 Academy access

Per oficiální:

> _"Our Email Deliverability Academy is the place for anyone who wants to improve their deliverability and reach their subscribers with their messages."_

```
Customer access:
- Free pro all customers
- Self-paced learning
- Available on emaillabs.io
- Multiple content types:
  - Articles
  - Guides
  - Tutorials
  - Webinars (likely)
```

### 21.2 Content topics

```
Likely Academy topics:
- Email authentication (SPF/DKIM/DMARC)
- Deliverability best practices
- List hygiene strategies
- IP warm-up guidance
- ISP relationships
- Sender reputation
- Engagement optimization
- Compliance (GDPR, CAN-SPAM)
- Gmail/Yahoo 2024 requirements
- Marketing vs. transactional
- A/B testing principles
- Email design best practices
- Subject line optimization
- Mobile responsiveness
```

### 21.3 Customer journey

```
New EmailLabs customer:
   ↓
Discovers Academy via:
- Onboarding emails
- Documentation links
- Support team recommendations
- Newsletter
   ↓
Browses content
   ↓
Applies learnings:
- Better authentication
- Improved practices
- Higher deliverability
   ↓
EmailLabs ROI increases
Customer success maintains
```

### 21.4 Industry positioning

```
Academy positions EmailLabs as:
- Educational authority
- Thought leader
- Expert advisor
- Beyond tool vendor
- Strategic partner
   ↓
Brand differentiation
   ↓
Customer retention
   ↓
Prospect attraction
```

---

## 22. Customer journey appropriately ESP

### 22.1 Initial customer journey

```
Stage 1: Discovery
- Search: "best email delivery service"
- Find EmailLabs (organic, ads, referrals)
- Read website + docs
- Compare alternatives

Stage 2: Evaluation
- Sign up free plan (24K emails)
- Test setup (sub-5-min)
- Send test emails
- Verify deliverability
- Compare metrics

Stage 3: Decision
- Free plan suffices? Stay free.
- Need more? Upgrade to Pro.
- Enterprise needs? Contact sales.

Stage 4: Implementation
- Setup SMTP / API
- DNS authentication
- Application integration
- Test thoroughly

Stage 5: Production
- Daily sending
- Monitor metrics
- Optimize over time

Stage 6: Growth
- Volume increases
- Add dedicated IPs
- Set up marketing/transactional separation
- Maybe add S/MIME

Stage 7: Mastery
- Email Deliverability Academy
- Expert-level usage
- ROI optimization
- Long-term partnership
```

### 22.2 Customer lifecycle support

```
EmailLabs touchpoints:
- Onboarding emails
- Documentation
- Support tickets
- Phone consultations
- Quarterly check-ins (enterprise)
- Annual reviews
- Academy content
- Newsletter updates
- Webinars (likely)
- Industry events
   ↓
Long-term relationship maintained
```

### 22.3 Per Capterra long-term customer

> _"We have been using EmailLabs for more than 4 years. During that time, we have not experienced any problems that would force us to switch to other providers. The level of message delivery is very high."_

⚠️ **Long-term customer retention** evidence.

---

## 23. Multi-account / multi-stream flow

### 23.1 Multi-stream setup

```
Customer needs:
- Separate marketing vs. transactional
- Multiple brands
- Agency multi-client
- Department isolation
   ↓
EmailLabs supports:
- Multiple accounts
- Multiple API keys per account
- Sub-accounts (likely)
- Per-stream credentials
```

### 23.2 Sub-account structure

```
Master account:
├─ Sub-account A (Brand 1)
│   ├─ Marketing stream
│   └─ Transactional stream
├─ Sub-account B (Brand 2)
│   ├─ Marketing stream
│   └─ Transactional stream
└─ Sub-account C (Brand 3)
    └─ Single stream
   ↓
Per sub-account:
- Isolated reputation
- Separate analytics
- Independent IP pools
- Per-brand branding
- Per-brand billing (optional)
```

### 23.3 Use cases

```
Multi-brand company:
- Each brand: own sub-account
- Reputation isolated
- Analytics separated
- IP control per brand

Agency:
- Each client: own sub-account
- White-label option (if available)
- Per-client billing
- Centralized management

Enterprise:
- Per-department sub-account
- Per-application sub-account
- Compliance isolation
- Cost allocation
```

---

## 24. GDPR compliance flow

### 24.1 EU hosting

Per Capterra customer:

> _"For privacy reasons we needed a service fully hosted in the EU"_

**Key:**

- All data v EU
- Polish jurisdiction
- Schrems II compliant

### 24.2 GDPR features

```
GDPR compliance built-in:
- EU servers exclusively
- DPA (Data Processing Agreement) available
- Right to be Forgotten
- Data export (DSAR)
- Encryption at rest + in transit
- Audit logs
- Polish RODO compliance
```

### 24.3 Customer's GDPR responsibilities

```
Customer must:
- Have valid consent for marketing
- Honor unsubscribe requests
- Process deletion requests
- Maintain consent records
- Document compliance
- Notify EmailLabs of GDPR-related requests

EmailLabs supports:
- Processing infrastructure (technical role)
- Deletion API (right to be forgotten)
- Export capabilities (DSAR)
- Suppression management
```

### 24.4 Right to Be Forgotten flow

```
Recipient requests deletion (via customer system)
   ↓
Customer system:
- Marks contact for deletion
- API call to EmailLabs
   POST /recipients/{email}/delete
   ↓
EmailLabs:
- Removes recipient from active records
- Anonymizes events (where possible)
- Adds to permanent suppression
- Audit log entry
- Confirmation sent to customer
   ↓
GDPR compliance maintained
```

### 24.5 DPA + documentation

```
Enterprise customer needs:
- DPA (Auftragsverarbeitungsvertrag) signed
- Sub-processor list
- Security certifications
- Compliance evidence
   ↓
EmailLabs provides:
- Standard DPA template
- Custom DPA option
- Documentation package
- Audit support
```

### 24.6 Per oficiální security

> _"EmailLabs is heavily focused on providing and securing your email communication"_

**Security:**

- TLS in transit
- Encryption at rest
- Authentication mandatory
- Access controls
- Audit logging
- 2FA / MFA available

---

## 25. Datová mapa: co vidí kdo

| Data                         | Account Admin | Developer | DevOps | Marketer | Support | EmailLabs Team | Recipient | API Client |
| ---------------------------- | :-----------: | :-------: | :----: | :------: | :-----: | :------------: | :-------: | :--------: |
| Account settings             |      ✅       |   view    |  view  |   view   |  view   |   s consent    |    ❌     | per scope  |
| Billing                      |      ✅       |    ❌     |   ❌   |    ❌    |   ❌    |   s consent    |    ❌     | per scope  |
| User management              |      ✅       |   view    |  view  |   view   |  view   |   s consent    |    ❌     | per scope  |
| API keys                     |      ✅       | ✅ (own)  |  view  |    ❌    |   ❌    |   s consent    |    ❌     |     –      |
| SMTP credentials             |      ✅       |    ✅     |   ✅   |   view   |  view   |   s consent    |    ❌     |     –      |
| DNS records                  |      ✅       |   view    |   ✅   |   view   |  view   |   s consent    |    ❌     |    view    |
| Email sending logs           |      ✅       |    ✅     |   ✅   |    ✅    |   ✅    |   s consent    |  jen své  | per scope  |
| Real-time analytics          |      ✅       |    ✅     |  view  |    ✅    |   ✅    |   s consent    |    ❌     | per scope  |
| Per-IP performance           |      ✅       |   view    |   ✅   |    ✅    |   ✅    |   s consent    |    ❌     | per scope  |
| Bounce list                  |      ✅       |   view    |  view  |    ✅    |   ✅    |   s consent    |  jen své  | per scope  |
| Spam complaints              |      ✅       |   view    |  view  |    ✅    |   ✅    |   s consent    |  jen své  | per scope  |
| Webhook config               |      ✅       |    ✅     |   ✅   |   view   |  view   |   s consent    |    ❌     | per scope  |
| Reputation status            |      ✅       |   view    |   ✅   |    ✅    |   ✅    |   s consent    |    ❌     | per scope  |
| Dedicated IPs                |      ✅       |   view    |   ✅   |   view   |  view   |   s consent    |    ❌     | per scope  |
| S/MIME certs                 |      ✅       |   view    |   ✅   |    ❌    |  view   |   s consent    |    ❌     |     –      |
| Sub-accounts                 |      ✅       |   view    |  view  |   view   |  view   |   s consent    |    ❌     | per scope  |
| Custom reports               |      ✅       |   view    |  view  |    ✅    |  view   |   s consent    |    ❌     | per scope  |
| Email Deliverability Academy |      ✅       |    ✅     |   ✅   |    ✅    |   ✅    |    provide     |    ❌     |     –      |
| GDPR delete                  |      ✅       |    API    |  API   |    ❌    | execute |    execute     |  request  |     ✅     |

---

## 26. Známé úzkoprofilové místa

### 26.1 NENÍ campaign builder

⚠️ **Klíčový limit:**

- EmailLabs **NEMÁ** campaign creator
- No drag-drop editor
- No marketing templates
- **NE alternative** k Mailchimp/Brevo/Klaviyo
- Vyžaduje **existing system**

### 26.2 Limited UI languages

Per G2:

> _"EmailLabs supports these languages: English and Polish."_

⚠️ **Pouze 2 jazyky:**

- English
- Polish
- **No Czech UI**
- **No Slovak UI**
- **No German UI**
- **No French UI**

### 26.3 Sometimes Polish pages confuse EN users

Per Capterra:

> _"Sometimes you click on something and somehow end up in a page in Polish which may be confusing when you only know English"_

⚠️ EN users občas přistanou na Polish page.

### 26.4 Higher cost pro smaller businesses

Per Capterra:

> _"While the cost may be a hurdle for smaller businesses"_

⚠️ Pro velmi malé use cases:

- Free plan dobrý
- Pro plan €23+/měsíc
- Vs. Mailtrap $10 or self-hosted free

### 26.5 Advanced features learning curve

Per Capterra:

> _"It offers a lot of advanced features, which might take a bit of time to fully explore and utilize."_

⚠️ Learning curve:

- DMARC tuning
- IP warm-up
- S/MIME setup
- Reputation optimization

### 26.6 UI panel could be refreshed

Per Capterra:

> _"The user panel could be slightly refreshed, but in its current form it is still functional."_

⚠️ UI feel dated but functional.

### 26.7 SALESmanago integration limit

Per oficiální:

> _"you are able to send only one message to 1,000 contacts at a time using an external SMTP server"_

⚠️ Pro SALESmanago integration:

- Max 1000 contacts per batch
- SALESmanago limitation
- Larger campaigns: split sends

### 26.8 No marketing automation features

```
EmailLabs NEMÁ:
- Workflow builder
- Visual email editor
- Templates library (marketing)
- Forms builder
- Landing pages
- Customer journey maps
- Advanced segmentation tools
- CRM features
- Lead scoring
- A/B testing UI
   ↓
Customer needs separate tool pro tyto features
```

### 26.9 No SMS / multi-channel

- **Email only**
- **No SMS** (vs. SendGrid via Twilio)
- **No WhatsApp** (vs. Brevo)
- **No push notifications**
- **Single channel** focus

### 26.10 Less brand recognition globally

- Polish market leader
- Less known outside CEE
- Smaller community vs. SendGrid
- Fewer English resources online

### 26.11 Less integrations than market leaders

- ~17-18 listed integrations
- Vs. SendGrid hundreds (Twilio ecosystem)
- Vs. Mailchimp massive marketplace
- Adequate pro PL+CEE core

### 26.12 No native A/B testing tools

- Customer system handles A/B
- EmailLabs delivers both variants
- No EmailLabs-side A/B builder

### 26.13 No customer segmentation tools

- Customer system handles segmentation
- EmailLabs delivers per segment
- No segmentation v EmailLabs

### 26.14 Requires technical capability

```
EmailLabs vyžaduje:
- DNS management
- SMTP / API knowledge
- Webhook handling
- Integration capability
- Authentication understanding
   ↓
Není pro non-technical users
```

### 26.15 No paid newsletter business

- No subscription management
- No paid newsletter platform
- Vs. Beehiiv / Substack / Kit

---

## 27. Doporučení pro design vlastních procesů

### Pro EmailLabs users obecně:

1. **Domain authentication day 1** – SPF + DKIM + DMARC
2. **Test free plan first** (24K emails/měsíc)
3. **Sub-5-minute setup** dokumentovat
4. **Separate marketing vs. transactional** od začátku
5. **Dedicated IP** pro transactional (pokud volume justifikuje)
6. **IP warm-up plan** for new dedicated IPs
7. **Webhook events** integrate s vaším system
8. **Real-time monitoring** alerts setup
9. **List hygiene** automated (Reputation Defender)
10. **Email Deliverability Academy** absolvovat
11. **ISP advocacy** využívat (let EmailLabs help)
12. **Multi-stream setup** pro multi-brand / agency
13. **API + SMTP** combination strategicky
14. **S/MIME** pokud banking/financial (custom feature)
15. **Google Analytics integration** pro attribution
16. **Test thoroughly** before production
17. **Document setup** for team
18. **Monitor metrics daily** initial weeks
19. **Optimize gradually** based on data
20. **Stay updated** s EmailLabs blog + Academy

### Pro marketing automation users:

1. **SALESmanago + EmailLabs:** Native PL combo
2. **Bloomreach + EmailLabs:** EU-friendly CDXP stack
3. **Mautic + EmailLabs:** Open-source + premium delivery
4. **Configure external SMTP** v automation platform
5. **Test deliverability** vs. shared SMTP
6. **Monitor improvement** v deliverability
7. **Consider dedicated IP** pro volume
8. **Optimize for local ISPs** (PL/CZ/DE/FR)

### Pro e-commerce users:

1. **Separate transactional from marketing** critical
2. **Dedicated IP pro transactional** (recommended)
3. **Order confirmations** = highest priority
4. **0.16s delivery** pro password resets
5. **Authentication** strict (DMARC enforcement)
6. **Local ISP optimization** (Polish for PL e-shops)
7. **WP Mail SMTP plugin** for WordPress + WooCommerce
8. **Native integrations** s major platforms (IdoSell, Magento, etc.)

### Pro enterprise users:

1. **Custom proposal** consultation
2. **Multiple dedicated IPs** strategy
3. **Multi-stream architecture**
4. **SLA agreement** custom
5. **Premium support** tier
6. **S/MIME** if applicable
7. **GDPR/RODO** compliance documentation
8. **DPA** signed
9. **Quarterly business reviews**
10. **ISP advocacy** as needed

---

_Dokument zpracován z oficiálních zdrojů emaillabs.io / emaillabs.pl + docs.emaillabs.io a praktických zdrojů (G2, Capterra, SourceForge, European Alternatives, Base.com). Pro nejaktuálnější detaily je nutný engagement s EmailLabs sales / consultant teamem._
