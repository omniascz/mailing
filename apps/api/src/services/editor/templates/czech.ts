/**
 * Czech template library — written in Czech, not translated from English.
 *
 * Three things separate these from the 71 that came before.
 *
 * 1. The greeting declines. `{{contact.first_name|vocative}}` renders
 *    "Dobrý den Petro," not "Dobrý den Petra," — measured against the real
 *    renderer with registerLocaleFilters() applied, which apps/api does at boot
 *    (index.ts:321). It is the one thing a Czech tool can do that Mailchimp
 *    cannot, and not one of the previous templates used it.
 *
 * 2. Every one carries a footer block. The postal address and the unsubscribe
 *    link are appended inside renderFooter (apps/editor/src/render/render.ts:431)
 *    — that is, ONLY when the template has a footer block. 61 of the previous
 *    71 have none, so unless the org has switched on a custom footer in mail
 *    settings, those render with no unsubscribe link at all. The block is not
 *    decoration; it is where the legally required parts attach.
 *
 * 3. No two share a layout. The previous library has 20 distinct layouts across
 *    71 templates, and two of them cover 46.
 *
 * NOT used: `countdown`. Two existing templates carry a block of that type and
 * the renderer has no branch for it — measured, it produces no output at all.
 * Using it here would only have added more emails with an invisible hole.
 *
 * Block ids are literal strings rather than the Math.random() the other files
 * use, so the same source always produces the same schema.
 */

import type { TemplateMeta } from './index.js';

const GS = {
  backgroundColor: '#f1f5f9',
  contentBackgroundColor: '#ffffff',
  fontFamily: 'Arial, Helvetica, sans-serif',
  linkColor: '#2563eb',
  textColor: '#1f2937',
  contentWidth: 600,
};

/** Greeting that declines the first name. The point of the whole file. */
const OSLOVENI = '{{contact.first_name|vocative|default:"zákazníku"}}';

const sp = (id: string, h = 20) => ({ id, type: 'spacer', height: h });

const div = (id: string) => ({
  id,
  type: 'divider',
  color: '#e2e8f0',
  thickness: 1,
  widthPercent: 100,
});

const txt = (id: string, content: string, size = '15px', color = '#374151', align = 'left') => ({
  id,
  type: 'text',
  content,
  fontSize: size,
  fontFamily: GS.fontFamily,
  color,
  lineHeight: '1.6',
  textAlign: align,
});

const btn = (id: string, text: string, url: string, bg = '#2563eb') => ({
  id,
  type: 'button',
  text,
  url,
  backgroundColor: bg,
  textColor: '#ffffff',
  borderRadius: '6px',
  fontSize: '16px',
  fontFamily: GS.fontFamily,
  paddingX: '28px',
  paddingY: '13px',
  align: 'center',
  fullWidth: false,
});

const hero = (id: string, title: string, sub: string, bg = '#1e293b') => ({
  id,
  type: 'hero',
  backgroundColor: bg,
  minHeight: '150px',
  content: [
    txt(
      id + 't',
      '<h1 style="color:#ffffff;margin:0;font-size:26px;">' + title + '</h1>',
      '26px',
      '#ffffff',
      'center',
    ),
    txt(
      id + 's',
      '<p style="color:#e2e8f0;margin:6px 0 0;">' + sub + '</p>',
      '15px',
      '#e2e8f0',
      'center',
    ),
  ],
});

/** Footer block — what the renderer attaches the postal address and opt-out to. */
const paticka = (id: string, content: string) => ({
  id,
  type: 'footer',
  content,
  showUnsubscribe: true,
  textAlign: 'center',
  fontSize: '12px',
  color: '#6b7280',
});

const produkt = (id: string, prefix: string, cta = 'Zobrazit v e-shopu') => ({
  id,
  type: 'product',
  title: '{{' + prefix + '.title|default:"Název produktu"}}',
  imageSrc: '{{' + prefix + '.image_url}}',
  price: '{{' + prefix + '.price|default:"0 Kč"}}',
  compareAtPrice: '{{' + prefix + '.compare_at_price|default:""}}',
  description: '{{' + prefix + '.description|default:""}}',
  productUrl: '{{' + prefix + '.url}}',
  ctaText: cta,
  ctaBackgroundColor: '#2563eb',
  ctaTextColor: '#ffffff',
  titleColor: '#111827',
  priceColor: '#111827',
  fontFamily: GS.fontFamily,
  imagePosition: 'left',
  align: 'left',
});

const kupon = (
  id: string,
  headline: string,
  code: string,
  desc: string,
  expiry: string,
  cta: string,
  url: string,
) => ({
  id,
  type: 'coupon',
  code,
  headline,
  description: desc,
  expiryText: expiry,
  codeBackgroundColor: '#f3f4f6',
  codeTextColor: '#111827',
  borderColor: '#dc2626',
  borderStyle: 'dashed',
  ctaText: cta,
  ctaUrl: url,
  ctaBackgroundColor: '#dc2626',
  ctaTextColor: '#ffffff',
  fontFamily: GS.fontFamily,
  align: 'center',
});

function t(
  id: string,
  name: string,
  category: TemplateMeta['category'],
  family: string,
  description: string,
  subject: string,
  preheader: string,
  blocks: object[],
): TemplateMeta {
  return {
    id,
    name,
    category,
    description,
    thumbnailUrl: null,
    locale: 'cs',
    family,
    schema: { subject, preheader, globalStyles: GS, blocks },
  };
}

export const CZECH_TEMPLATES: TemplateMeta[] = [
  // 1 — potvrzení objednávky
  t(
    'cs-order-confirm',
    'Potvrzení objednávky',
    'transactional',
    'order-confirmation',
    'Rekapitulace objednávky s položkami, dopravou a platbou.',
    'Objednávka {{order.number|default:"č. —"}} přijata',
    'Máme ji. Tady je rekapitulace a co bude dál.',
    [
      txt(
        'oc1',
        '<h1 style="margin:0;font-size:24px;color:#065f46;">Děkujeme za objednávku</h1>',
        '24px',
        '#065f46',
      ),
      sp('oc2', 12),
      txt(
        'oc3',
        '<p>Dobrý den ' +
          OSLOVENI +
          ',</p><p>vaši objednávku <strong>{{order.number|default:"—"}}</strong> jsme přijali a začínáme ji chystat. O odeslání vám dáme vědět.</p>',
      ),
      div('oc4'),
      txt(
        'oc5',
        '<p><strong>Položky</strong></p>{{order.items_html|default:"<p>1× Ukázkové zboží — 499 Kč</p>"}}',
      ),
      txt(
        'oc6',
        '<p><strong>Doprava:</strong> {{order.shipping_method|default:"Zásilkovna"}} — {{order.shipping_price|default:"79 Kč"}}<br><strong>Platba:</strong> {{order.payment_method|default:"Kartou online"}}</p>',
      ),
      txt(
        'oc7',
        '<p style="font-size:18px;"><strong>Celkem k úhradě: {{order.total|default:"578 Kč"}}</strong></p>',
      ),
      sp('oc8', 12),
      btn('oc9', 'Sledovat objednávku', '{{order.status_url|default:"#"}}', '#065f46'),
      sp('oc10', 16),
      txt(
        'oc11',
        '<p style="font-size:13px;color:#6b7280;">Potřebujete něco upravit? Odpovězte na tento e-mail do hodiny, než objednávku předáme dopravci.</p>',
      ),
      paticka(
        'oc12',
        '{{company|default:"Váš e-shop"}} · Fakturační údaje najdete v přiloženém dokladu.',
      ),
    ],
  ),

  // 2 — opuštěný košík, provedení A: připomínka se zbožím
  t(
    'cs-cart-products',
    'Opuštěný košík — se zbožím',
    'ecommerce',
    'abandoned-cart-products',
    'Připomínka košíku s kartami konkrétního zboží.',
    'Zapomněli jste u nás {{cart.item_count|default:"pár"}} věcí',
    'Košík vám držíme, ale ne navždy.',
    [
      hero('ac1', 'Váš košík čeká', 'Zboží držíme dalších 48 hodin', '#0f766e'),
      sp('ac2'),
      txt('ac3', '<p>Dobrý den ' + OSLOVENI + ',</p><p>nechali jste u nás v košíku tohle:</p>'),
      produkt('ac4', 'cart.item_1'),
      produkt('ac5', 'cart.item_2'),
      sp('ac6', 12),
      btn('ac7', 'Dokončit objednávku', '{{cart.recovery_url|default:"#"}}', '#0f766e'),
      sp('ac8', 16),
      paticka(
        'ac9',
        '{{company|default:"Váš e-shop"}} · Košík vám držíme 48 hodin od odeslání tohoto e-mailu.',
      ),
    ],
  ),

  // 3 — opuštěný košík, provedení B: námitky, bez zboží
  t(
    'cs-cart-objections',
    'Opuštěný košík — proč u nás nakoupit',
    'ecommerce',
    'abandoned-cart-reassurance',
    'Druhá připomínka bez zboží: vyvrací obvyklé důvody k váhání.',
    'Ještě váháte? Doprava nad {{free_shipping_threshold|default:"1 500 Kč"}} zdarma',
    'Vrácení do 14 dnů, doprava zdarma, na dotazy odpovídáme týž den.',
    [
      txt(
        'co1',
        '<p>Dobrý den ' +
          OSLOVENI +
          ',</p><p>váš košík je pořád u nás. Jestli vás od dokončení něco drží, tady jsou nejčastější důvody — a jak to u nás funguje.</p>',
      ),
      div('co2'),
      txt(
        'co3',
        '<p><strong>Doprava se mi nevyplatí.</strong><br>Nad {{free_shipping_threshold|default:"1 500 Kč"}} ji neplatíte. Pod tím {{shipping_price|default:"79 Kč"}} Zásilkovnou.</p>',
      ),
      txt(
        'co4',
        '<p><strong>Co když mi to nesedne?</strong><br>Vracíte do 14 dnů bez udání důvodu, zpáteční štítek přikládáme.</p>',
      ),
      txt(
        'co5',
        '<p><strong>Kdy to dorazí?</strong><br>Skladem odesíláme týž den do 14:00, jinak do dvou pracovních dnů.</p>',
      ),
      div('co6'),
      btn('co7', 'Vrátit se do košíku', '{{cart.recovery_url|default:"#"}}', '#1d4ed8'),
      sp('co8', 16),
      paticka(
        'co9',
        '{{company|default:"Váš e-shop"}} · Na dotazy odpovídáme v pracovní dny do večera.',
      ),
    ],
  ),

  // 4 — zpět skladem
  t(
    'cs-back-in-stock',
    'Zpět skladem',
    'ecommerce',
    'back-in-stock',
    'Hlídací pes: zboží je naskladněné, s upozorněním na omezené množství.',
    '{{product.title|default:"Zboží"}} je zpátky skladem',
    'Naskladnili jsme kus, který jste si hlídali.',
    [
      hero('bs1', 'Je to zpátky', '{{product.title|default:"Vaše hlídané zboží"}}', '#7c3aed'),
      sp('bs2'),
      txt(
        'bs3',
        '<p>Dobrý den ' +
          OSLOVENI +
          ',</p><p>zboží, které jste si u nás nechali hlídat, je znovu skladem.</p>',
      ),
      produkt('bs4', 'product', 'Koupit hned'),
      txt(
        'bs5',
        '<p style="color:#b91c1c;"><strong>Naskladnili jsme {{product.stock_qty|default:"omezené"}} kusů.</strong> Hlídacího psa má zapnutého {{product.watcher_count|default:"více"}} zákazníků, takže to nemusí vydržet dlouho.</p>',
      ),
      sp('bs6', 12),
      paticka(
        'bs7',
        '{{company|default:"Váš e-shop"}} · Hlídání zboží můžete kdykoli zrušit ve svém účtu.',
      ),
    ],
  ),

  // 5 — doprava / sledování zásilky
  t(
    'cs-shipping-tracking',
    'Zásilka je na cestě',
    'transactional',
    'shipping-tracking',
    'Oznámení o odeslání s číslem zásilky a odkazem na sledování.',
    'Zásilka {{shipment.tracking_number|default:"—"}} je na cestě',
    'Odeslali jsme. Tady je číslo zásilky a kde ji sledovat.',
    [
      txt(
        'st1',
        '<h1 style="margin:0;font-size:24px;color:#1d4ed8;">Balíček vyrazil</h1>',
        '24px',
        '#1d4ed8',
      ),
      sp('st2', 12),
      txt(
        'st3',
        '<p>Dobrý den ' +
          OSLOVENI +
          ',</p><p>objednávku <strong>{{order.number|default:"—"}}</strong> jsme právě předali dopravci.</p>',
      ),
      div('st4'),
      // Two columns rather than a stack of paragraphs: the tracking number is
      // the one thing the reader came for, so it gets its own half of the row
      // instead of being the third line of a block of text.
      {
        id: 'st5',
        type: 'columns',
        columnRatios: [1, 1],
        gap: '16px',
        columns: [
          [
            txt(
              'st5a',
              '<p><strong>Dopravce</strong><br>{{shipment.carrier|default:"Zásilkovna"}}</p><p><strong>Číslo zásilky</strong><br>{{shipment.tracking_number|default:"—"}}</p>',
            ),
          ],
          [
            txt(
              'st5b',
              '<p><strong>Doručení</strong><br>{{shipment.eta|default:"do dvou pracovních dnů"}}</p><p><strong>Adresa</strong><br>{{shipment.address_html|default:"—"}}</p>',
            ),
          ],
        ],
      },
      sp('st7', 12),
      btn('st8', 'Sledovat zásilku', '{{shipment.tracking_url|default:"#"}}', '#1d4ed8'),
      sp('st9', 16),
      txt(
        'st10',
        '<p style="font-size:13px;color:#6b7280;">Dopravce načte zásilku do systému obvykle do několika hodin. Do té doby může sledování hlásit, že o ní neví.</p>',
      ),
      paticka('st11', '{{company|default:"Váš e-shop"}}'),
    ],
  ),

  // 6 — žádost o recenzi
  t(
    'cs-review-request',
    'Žádost o recenzi',
    'ecommerce',
    'review-request',
    'Prosba o hodnocení po doručení, s odkazem na konkrétní zboží.',
    'Jak jste spokojeni s nákupem?',
    'Dvě minuty vašeho času nám hodně pomůžou.',
    [
      txt(
        'rr1',
        '<p>Dobrý den ' +
          OSLOVENI +
          ',</p><p>před pár dny vám dorazila objednávka {{order.number|default:"—"}}. Jak se zboží osvědčilo?</p>',
      ),
      produkt('rr2', 'order.item_1', 'Napsat hodnocení'),
      div('rr3'),
      txt(
        'rr4',
        '<p>Hodnocení píšeme kvůli ostatním zákazníkům — nejvíc pomůže, když napíšete i to, co vás zklamalo. Nezveřejňujeme jen recenze s pěti hvězdami.</p>',
      ),
      btn('rr5', 'Ohodnotit nákup', '{{review_url|default:"#"}}', '#f59e0b'),
      sp('rr6', 16),
      txt(
        'rr7',
        '<p style="font-size:13px;color:#6b7280;">Něco nebylo v pořádku? Odpovězte rovnou na tento e-mail, vyřešíme to bez recenze.</p>',
      ),
      paticka('rr8', '{{company|default:"Váš e-shop"}}'),
    ],
  ),

  // 7 — věrnostní program
  t(
    'cs-loyalty-points',
    'Věrnostní body',
    'ecommerce',
    'loyalty-points',
    'Stav věrnostního účtu s body, úrovní a tím, co si za ně lze vzít.',
    'Máte {{loyalty.points|default:"0"}} bodů — co si za ně vezmete?',
    'Přehled vašeho věrnostního účtu.',
    [
      hero('lp1', 'Váš věrnostní účet', 'Úroveň {{loyalty.tier|default:"Bronz"}}', '#b45309'),
      sp('lp2'),
      txt(
        'lp3',
        '<p>Dobrý den ' +
          OSLOVENI +
          ',</p><p>na věrnostním účtu máte <strong>{{loyalty.points|default:"0"}} bodů</strong>. Do úrovně {{loyalty.next_tier|default:"Stříbro"}} vám chybí {{loyalty.points_to_next|default:"—"}}.</p>',
      ),
      div('lp4'),
      txt(
        'lp5',
        '<p><strong>Co si můžete vzít teď</strong></p><ul><li>{{loyalty.reward_1|default:"Doprava zdarma — 200 bodů"}}</li><li>{{loyalty.reward_2|default:"Sleva 100 Kč — 500 bodů"}}</li><li>{{loyalty.reward_3|default:"Dárek k objednávce — 800 bodů"}}</li></ul>',
      ),
      btn('lp6', 'Vybrat odměnu', '{{loyalty.rewards_url|default:"#"}}', '#b45309'),
      sp('lp7', 12),
      txt(
        'lp8',
        '<p style="font-size:13px;color:#6b7280;">Body platí {{loyalty.expiry_months|default:"12"}} měsíců od připsání. Nejstarší vám propadnou {{loyalty.next_expiry|default:"—"}}.</p>',
      ),
      paticka(
        'lp9',
        '{{company|default:"Váš e-shop"}} · Věrnostní program můžete kdykoli opustit ve svém účtu.',
      ),
    ],
  ),

  // 8 — sezónní sleva / Black Friday
  t(
    'cs-black-friday',
    'Black Friday sleva',
    'seasonal',
    'seasonal-sale',
    'Sezónní akce s kupónem a jasně uvedeným koncem platnosti.',
    'Black Friday: {{discount_pct|default:"30"}} % na celý sortiment',
    'Kód platí do neděle půlnoci. Pak končí.',
    [
      hero('bf1', 'BLACK FRIDAY', '{{discount_pct|default:"30"}} % na všechno', '#111827'),
      sp('bf2'),
      txt(
        'bf3',
        '<p>Dobrý den ' +
          OSLOVENI +
          ',</p><p>slevu jsme dali na celý sortiment, ne jen na to, co se neprodává. Kód zadáte v košíku.</p>',
      ),
      kupon(
        'bf4',
        'Váš slevový kód',
        '{{coupon_code|default:"BLACKFRIDAY"}}',
        'Platí na celý sortiment, i na zlevněné zboží.',
        'Do neděle {{sale_end_date|default:"—"}} do 23:59',
        'Nakoupit se slevou',
        '{{shop_url|default:"#"}}',
      ),
      div('bf5'),
      txt(
        'bf6',
        '<p style="font-size:13px;color:#6b7280;">Kód lze použít jednou na objednávku a nelze kombinovat s dárkovým poukazem. Zboží odesíláme průběžně, o víkendu se objednávky hromadí — čím dřív objednáte, tím dřív to máte.</p>',
      ),
      paticka('bf7', '{{company|default:"Váš e-shop"}}'),
    ],
  ),

  // 9 — reaktivace neaktivního zákazníka
  t(
    'cs-winback',
    'Reaktivace zákazníka',
    'ecommerce',
    'winback',
    'Oslovení zákazníka, který dlouho nenakoupil; obsah se liší podle toho, zda už někdy nakoupil.',
    'Dlouho jsme se neviděli, {{contact.first_name|vocative|default:"zákazníku"}}',
    'Co je u nás nového od vaší poslední návštěvy.',
    [
      txt(
        'wb1',
        '<p>Dobrý den ' +
          OSLOVENI +
          ',</p><p>od vaší poslední objednávky uběhlo {{months_since_order|default:"pár"}} měsíců. Mezitím se u nás něco změnilo.</p>',
      ),
      div('wb2'),
      {
        id: 'wb3',
        type: 'dynamic',
        label: 'Podle toho, jestli už zákazník nakoupil',
        condition: {
          operator: 'AND',
          rules: [{ field: 'contact.total_orders', op: 'gt', value: 0 }],
        },
        ifContent: [
          txt(
            'wb3a',
            '<p><strong>Vaše poslední objednávka</strong> byla {{last_order_date|default:"—"}}. Sortiment jsme od té doby rozšířili a doručujeme rychleji.</p>',
          ),
        ],
        elseContent: [
          txt(
            'wb3b',
            '<p>Zaregistrovali jste se, ale k nákupu nedošlo. Jestli vás tehdy něco odradilo, napište nám — zajímá nás to víc než objednávka.</p>',
          ),
        ],
      },
      kupon(
        'wb4',
        'Něco na uvítanou zpátky',
        '{{coupon_code|default:"VITEJTEZPET"}}',
        'Sleva {{discount_amount|default:"200 Kč"}} na příští nákup.',
        'Platí {{coupon_valid_days|default:"30"}} dní',
        'Podívat se, co je nového',
        '{{shop_url|default:"#"}}',
      ),
      sp('wb5', 16),
      paticka(
        'wb6',
        '{{company|default:"Váš e-shop"}} · Jestli o naše e-maily nestojíte, stačí kliknout níž.',
      ),
    ],
  ),

  // 10 — faktura / daňový doklad
  t(
    'cs-invoice',
    'Faktura — daňový doklad',
    'transactional',
    'invoice',
    'Daňový doklad s náležitostmi podle českých zvyklostí a variabilním symbolem.',
    'Faktura {{invoice.number|default:"—"}} k objednávce {{order.number|default:"—"}}',
    'Daňový doklad v příloze, splatnost {{invoice.due_date|default:"—"}}.',
    [
      txt(
        'in1',
        '<h1 style="margin:0;font-size:22px;">Daňový doklad {{invoice.number|default:"—"}}</h1>',
        '22px',
        '#111827',
      ),
      sp('in2', 12),
      txt(
        'in3',
        '<p>Dobrý den ' +
          OSLOVENI +
          ',</p><p>posíláme daňový doklad k objednávce {{order.number|default:"—"}}. Najdete ho i v příloze ve formátu PDF a ISDOC.</p>',
      ),
      div('in4'),
      // Supplier and customer side by side, the way a Czech tax document is
      // read. Stacking them turns the header of an invoice into a list.
      {
        id: 'in5',
        type: 'columns',
        columnRatios: [1, 1],
        gap: '16px',
        columns: [
          [
            txt(
              'in5a',
              '<p><strong>Dodavatel</strong><br>{{company|default:"Váš e-shop"}}<br>IČO: {{company.ico|default:"—"}}<br>DIČ: {{company.dic|default:"—"}}</p>',
            ),
          ],
          [
            txt(
              'in5b',
              '<p><strong>Odběratel</strong><br>{{invoice.customer_html|default:"—"}}</p>',
            ),
          ],
        ],
      },
      div('in7'),
      txt(
        'in8',
        '<p><strong>Datum vystavení:</strong> {{invoice.issue_date|default:"—"}}<br><strong>Datum zdanitelného plnění:</strong> {{invoice.taxable_date|default:"—"}}<br><strong>Splatnost:</strong> {{invoice.due_date|default:"—"}}<br><strong>Způsob úhrady:</strong> {{invoice.payment_method|default:"—"}}</p>',
      ),
      txt(
        'in9',
        '<p style="font-size:18px;"><strong>Celkem s DPH: {{invoice.total|default:"—"}}</strong><br><span style="font-size:13px;color:#6b7280;">Základ {{invoice.base|default:"—"}} · DPH {{invoice.vat_rate|default:"21"}} % {{invoice.vat|default:"—"}}</span></p>',
      ),
      sp('in10', 12),
      btn('in11', 'Stáhnout fakturu (PDF)', '{{invoice.pdf_url|default:"#"}}', '#374151'),
      sp('in12', 16),
      txt(
        'in13',
        '<p style="font-size:13px;color:#6b7280;">Platbu poznáme podle variabilního symbolu {{invoice.variable_symbol|default:"—"}}. QR kód k platbě je na faktuře.</p>',
      ),
      paticka(
        'in14',
        '{{company|default:"Váš e-shop"}} · Tento e-mail je daňový doklad zaslaný elektronicky.',
      ),
    ],
  ),
];
