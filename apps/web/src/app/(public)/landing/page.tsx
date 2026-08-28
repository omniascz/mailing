import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  Languages,
  Phone,
  Mail as MailIcon,
  MessageSquare,
  Sparkles,
  Workflow,
  Shield,
} from 'lucide-react';

export const metadata = {
  title: 'Mailforge — Omnichannel messaging postavený v EU',
  description:
    'Email, SMS, voice agent a WhatsApp pod jednou střechou. Česká lokalizace, AI agenti v ceně, hosting v EU.',
};

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-secondary-200 bg-gradient-to-b from-primary-50 to-white">
        <div className="mx-auto max-w-6xl px-6 py-20 lg:py-28">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white px-3 py-1 text-xs font-medium text-primary-700">
              <Sparkles className="h-3.5 w-3.5" />
              Beta — přijímáme prvních 100 týmů
            </p>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-secondary-900 sm:text-5xl lg:text-6xl">
              Omnichannel messaging. <span className="text-primary-600">Postavený v EU.</span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-secondary-600">
              Email, SMS, voice agent a WhatsApp v jednom nástroji. Hluboká česká lokalizace
              (skloňování, jmeniny, svátky), AI agenti v ceně, vlastní MTA. Bez kompromisů, které
              vás drží u Mailchimpu.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-5 py-3 text-sm font-medium text-white hover:bg-primary-700"
              >
                Vyzkoušet zdarma
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-md border border-secondary-300 bg-white px-5 py-3 text-sm font-medium text-secondary-700 hover:border-secondary-400"
              >
                Zobrazit ceny
              </Link>
            </div>
            <p className="mt-4 text-xs text-secondary-500">
              Free plán — 1 000 kontaktů a 5 000 emailů měsíčně. Bez platební karty.
            </p>
          </div>
        </div>
      </section>

      {/* Channels */}
      <section className="border-b border-secondary-200">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="mb-12 max-w-2xl">
            <h2 className="text-3xl font-semibold text-secondary-900">Čtyři kanály, jeden plán</h2>
            <p className="mt-3 text-secondary-600">
              Shared frequency cap, jednotné segmenty, jeden audit log. Žádné přepínání mezi šesti
              produkty jako u Brevo.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Channel
              icon={MailIcon}
              title="Email"
              copy="Vlastní Go MTA, DKIM/SPF/DMARC, IP warming, FBL."
            />
            <Channel
              icon={MessageSquare}
              title="SMS"
              copy="SMPP gateway, DLR tracking, CZ/SK operátoři."
            />
            <Channel
              icon={Phone}
              title="Voice agent"
              copy="Outbound AI hovory s Claude + ElevenLabs, spouštěné přes API."
            />
            <Channel
              icon={MessageSquare}
              title="WhatsApp"
              copy="Cloud API, šablony, two-way inbox."
            />
          </div>
        </div>
      </section>

      {/* Differentiators */}
      <section className="border-b border-secondary-200 bg-secondary-50">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="mb-12 max-w-2xl">
            <h2 className="text-3xl font-semibold text-secondary-900">
              Co tu dostanete jinde dráž nebo vůbec
            </h2>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              icon={Languages}
              title="CZ/SK lokalizace v jádru"
              copy="Vokativ (5. pád) v merge-tags, jmeniny jako trigger, české svátky, gender inference podle příjmení. Mailchimp ani Brevo to nezvládnou."
            />
            <Feature
              icon={Bot}
              title="AI agenti v ceně"
              copy="Claude Sonnet 4.6 + Haiku 4.5 zahrnuté v Pro+ plánech. Žádný add-on za 200 $ jako u Klaviyo."
            />
            <Feature
              icon={Workflow}
              title="50+ pre-built workflows"
              copy="Welcome series, abandoned cart, post-purchase, winback, jmeniny, narozeniny. Fork & customize."
            />
            <Feature
              icon={Shield}
              title="EU sovereign"
              copy="Data v EU. Hosting Hetzner (Falkenstein/Helsinki). DPA + sub-processors transparentně."
            />
            <Feature
              icon={Sparkles}
              title="Predictive CLV + Churn"
              copy="RFM auto-cohorts, scoring, send-time optimization. Daily-run orchestrátor počítá vše za vás."
            />
            <Feature
              icon={MailIcon}
              title="Vlastní MTA, vlastní IPs"
              copy="Žádné sdílené šedé IP. Dedicated IP add-on za 20 $/měs, full reputation control."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="text-3xl font-semibold text-secondary-900">
            Postaveno pro týmy, co berou doručitelnost vážně
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-secondary-600">
            Spusťte si free účet, importujte kontakty z CSV nebo Shoptetu, odešlete první kampaň
            ještě dnes.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-5 py-3 text-sm font-medium text-white hover:bg-primary-700"
            >
              Vyzkoušet zdarma <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-md border border-secondary-300 bg-white px-5 py-3 text-sm font-medium text-secondary-700 hover:border-secondary-400"
            >
              Ceník
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function Channel({
  icon: Icon,
  title,
  copy,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  copy: string;
}) {
  return (
    <div className="rounded-lg border border-secondary-200 bg-white p-5">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-primary-50 text-primary-600">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-medium text-secondary-900">{title}</h3>
      <p className="mt-1 text-sm text-secondary-600">{copy}</p>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  copy,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  copy: string;
}) {
  return (
    <div>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-white text-primary-600 ring-1 ring-secondary-200">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-medium text-secondary-900">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-secondary-600">{copy}</p>
    </div>
  );
}
