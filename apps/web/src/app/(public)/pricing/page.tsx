import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';

export const metadata = {
  title: 'Ceník — Mailforge',
  description:
    'Transparentní cenové plány. Free start za 0 Kč, Starter 500 Kč, Pro 2 000 Kč, Business 5 000 Kč.',
};

interface Plan {
  name: string;
  price: string;
  unit: string;
  blurb: string;
  cta: string;
  highlight?: boolean;
  features: string[];
}

const PLANS: Plan[] = [
  {
    name: 'Free',
    price: '0',
    unit: 'Kč / měsíc',
    blurb: 'Pro vyzkoušení nebo malé osobní seznamy.',
    cta: 'Začít zdarma',
    features: [
      '1 000 kontaktů',
      '5 000 emailů měsíčně',
      'Drag-and-drop editor',
      'Základní automatizace',
      '10 AI dotazů denně',
      'Mailforge branding v patičce',
    ],
  },
  {
    name: 'Starter',
    price: '500',
    unit: 'Kč / měsíc',
    blurb: 'Malé e-shopy a podnikatelé.',
    cta: 'Vybrat Starter',
    features: [
      '10 000 kontaktů',
      '50 000 emailů měsíčně',
      'SMS pay-per-use (1,90 Kč)',
      'Vlastní doména',
      '50 AI dotazů denně',
      'Bez Mailforge brandingu',
    ],
  },
  {
    name: 'Pro',
    price: '2 000',
    unit: 'Kč / měsíc',
    blurb: 'Rostoucí týmy s vlastní automatizací.',
    cta: 'Vybrat Pro',
    highlight: true,
    features: [
      '50 000 kontaktů',
      '250 000 emailů měsíčně',
      'Voice agent (Claude + ElevenLabs)',
      'WhatsApp Business API',
      'Predictive CLV + Churn',
      '200 AI dotazů denně',
      'Pre-built workflow gallery',
      'Send-time optimization',
    ],
  },
  {
    name: 'Business',
    price: '5 000',
    unit: 'Kč / měsíc',
    blurb: 'Vyspělé marketingové operace.',
    cta: 'Vybrat Business',
    features: [
      '200 000 kontaktů',
      '1 000 000 emailů měsíčně',
      'Dedicated IP zdarma (1×)',
      'HIPAA mode + BAA',
      'Audit log retention 7 let',
      '500 AI dotazů denně',
      'Priority support (4h SLA)',
      'Multi-team workspaces',
    ],
  },
  {
    name: 'Enterprise',
    price: 'na dotaz',
    unit: '',
    blurb: 'Vlastní limity, dedikované IPs, SSO.',
    cta: 'Kontaktovat prodej',
    features: [
      'Neomezené kontakty',
      'Neomezené emaily',
      'Více dedicated IPs',
      'SSO / SAML / SCIM',
      'Custom data residency',
      'Dedicated CSM',
      '99,95 % SLA',
      'On-premise add-on',
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-secondary-900 sm:text-5xl">
          Jeden plán, čtyři kanály
        </h1>
        <p className="mt-4 text-secondary-600">
          Email, SMS, voice a WhatsApp ve všech plánech. Žádné šest licencí jako u konkurence.
          Zrušíte kdykoli.
        </p>
      </header>

      <div className="mt-12 grid gap-6 lg:grid-cols-3 xl:grid-cols-5">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={
              'flex flex-col rounded-lg border p-6 ' +
              (plan.highlight
                ? 'border-primary-500 bg-primary-50/40 ring-1 ring-primary-500'
                : 'border-secondary-200 bg-white')
            }
          >
            {plan.highlight ? (
              <p className="mb-3 inline-flex w-fit rounded-full bg-primary-600 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">
                Nejoblíbenější
              </p>
            ) : null}
            <h2 className="text-lg font-semibold text-secondary-900">{plan.name}</h2>
            <p className="mt-1 text-sm text-secondary-500">{plan.blurb}</p>

            <div className="mt-4">
              <span className="text-3xl font-semibold text-secondary-900">{plan.price}</span>
              {plan.unit ? (
                <span className="ml-1 text-xs text-secondary-500">{plan.unit}</span>
              ) : null}
            </div>

            <ul className="mt-5 flex-1 space-y-2 text-sm">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-secondary-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6">
              {plan.name === 'Enterprise' ? (
                <a
                  href="mailto:sales@mailforge.cz"
                  className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-secondary-300 bg-white px-3 py-2 text-sm font-medium text-secondary-700 hover:border-secondary-400"
                >
                  {plan.cta} <ArrowRight className="h-4 w-4" />
                </a>
              ) : (
                <Link
                  href="/register"
                  className={
                    'inline-flex w-full items-center justify-center gap-1 rounded-md px-3 py-2 text-sm font-medium ' +
                    (plan.highlight
                      ? 'bg-primary-600 text-white hover:bg-primary-700'
                      : 'border border-secondary-300 bg-white text-secondary-700 hover:border-secondary-400')
                  }
                >
                  {plan.cta} <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>

      <section className="mx-auto mt-16 max-w-3xl text-center text-sm text-secondary-600">
        <h3 className="text-lg font-semibold text-secondary-900">Add-ony</h3>
        <p className="mt-3">
          Dedicated IP: <strong>500 Kč / měs</strong> · HLR lookup: <strong>0,40 Kč / dotaz</strong>{' '}
          · Voice minuty mimo plán: <strong>2 Kč / minuta</strong> · SMS mimo plán:{' '}
          <strong>1,90 Kč / kus</strong>
        </p>
        <p className="mt-4">
          Všechny ceny bez DPH. Fakturace měsíčně, platba kartou nebo bankovním převodem (ISDOC).
        </p>
      </section>

      <section className="mx-auto mt-16 max-w-3xl">
        <h3 className="text-xl font-semibold text-secondary-900">Často kladené otázky</h3>
        <dl className="mt-6 space-y-6 text-sm">
          <Faq
            q="Kde jsou moje data?"
            a="V EU. Hostujeme v Hetzneru (Falkenstein nebo Helsinki). Při registraci si vyberete data region; přesun je možný po dohodě."
          />
          <Faq
            q="Mám dedicated IP?"
            a="V Free/Starter/Pro/Business používáte sdílené reputační poolování. V Business máte 1× dedicated IP zdarma; další za 500 Kč/měs. Enterprise dostává /29 nebo /28."
          />
          <Faq
            q="Co když překročím limit kontaktů nebo emailů?"
            a="Upozorníme vás na 80 % a 100 %. Posílání nezablokujeme — překročení se účtuje pay-per-use (0,02 Kč/email, 1 Kč/kontakt). Nebo upgradujte vyšší plán."
          />
          <Faq
            q="Lze zrušit kdykoli?"
            a="Ano, žádné minimální období. Při zrušení vám vyexportujeme data do CSV/JSON do 30 dnů."
          />
        </dl>
      </section>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <dt className="font-medium text-secondary-900">{q}</dt>
      <dd className="mt-1 text-secondary-600">{a}</dd>
    </div>
  );
}
