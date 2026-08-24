/**
 * Czech template library, second batch.
 *
 * The first ten established the shape; this one is about coverage. What it
 * adds, and why each one is not a recolour of something already there:
 *
 *  - A WELCOME SERIES, which the first batch had no part of at all. A welcome
 *    is a sequence, not an email: the first says who we are and gives a reason
 *    to buy now, the second arrives days later with what we actually sell. One
 *    template covering both would be neither.
 *  - THE THIRD CART STEP. Batch one has products-reminder and
 *    objection-handling; the step that closes is the one with an incentive, and
 *    neither of the first two carries a coupon.
 *  - THE PARCEL AFTER IT SHIPS. Batch one stops at "on its way". Delivered and
 *    "waiting at the pickup point" are different emails with different
 *    deadlines, and in this market most orders go to a pickup point with a
 *    collection window that expires.
 *  - AN UNPAID BANK TRANSFER. Bank transfer is still ordinary here and an order
 *    sits unpaid until it clears; the email carries the payment details and a
 *    QR code.
 *  - A NAME DAY. Jmeniny are an occasion in this country and the product
 *    already has the data (the `name_day_today` trigger, @forgemsg/i18n-cs).
 *    Mailchimp cannot send this at all.
 *  - CONTENT. Every one of the first ten is transactional or promotional. A
 *    digest is the only kind of email people forward, which is where the new
 *    `share` block belongs.
 *  - CROSS-SELL AFTER DELIVERY, distinct from the review request: one asks for
 *    something, the other offers something.
 *  - A CHANGE OF TERMS. Legally required, sent by every shop sooner or later,
 *    and deliberately the plainest layout in the library — a promotional
 *    treatment of a terms notice reads as a trick.
 *
 * Deliberately NOT included, having been considered and rejected as recolours:
 * a second seasonal sale (Black Friday with different colours), a "last pieces"
 * email (back-in-stock inverted), a loyalty sign-up (the points email already
 * explains the programme), and a satisfaction survey (the review request
 * already asks).
 *
 * `family` here means what it means in batch one: THIS email, so a future
 * English or Slovak version of the same thing can be paired with it. It is not
 * a series grouping — batch one gave the two cart steps
 * `abandoned-cart-products` and `abandoned-cart-reassurance`, and the third
 * step follows that with `abandoned-cart-incentive`.
 *
 * Same rules as batch one: no `countdown` (the renderer has no branch for it
 * and it produces no output), a footer block on every template because that is
 * where the address and opt-out attach, literal block ids, and no two layouts
 * alike — asserted across the whole Czech set, not just this file.
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

/** Greeting that declines the first name — the point of the whole library. */
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
  border = '#dc2626',
) => ({
  id,
  type: 'coupon',
  code,
  headline,
  description: desc,
  expiryText: expiry,
  codeBackgroundColor: '#f3f4f6',
  codeTextColor: '#111827',
  borderColor: border,
  borderStyle: 'dashed',
  ctaText: cta,
  ctaUrl: url,
  ctaBackgroundColor: border,
  ctaTextColor: '#ffffff',
  fontFamily: GS.fontFamily,
  align: 'center',
});

/**
 * Share buttons for the reader — new in PR #55, and only used on the content
 * emails. A digest is the kind of thing someone forwards; an invoice is not.
 * Renders nothing when the campaign has no public archive URL, which is
 * correct: there is then nothing to share.
 */
const sdilet = (id: string, label: string) => ({
  id,
  type: 'share',
  networks: ['email', 'facebook', 'whatsapp'],
  shareText: '{{share_text|default:"Tohle by se ti mohlo hodit"}}',
  label,
  align: 'center',
  fontSize: '13px',
  color: '#2563eb',
});

const sloupce = (id: string, left: object[], right: object[], ratios = [1, 1]) => ({
  id,
  type: 'columns',
  columnRatios: ratios,
  gap: '16px',
  columns: [left, right],
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

export const CZECH_TEMPLATES_2: TemplateMeta[] = [
  // 1 — uvítací e-mail, první díl série
  t(
    'cs-welcome-1',
    'Uvítací e-mail (1/2)',
    'onboarding',
    'welcome-intro',
    'První e-mail po přihlášení: kdo jsme, co čekat a důvod nakoupit hned.',
    'Vítejte u nás, {{contact.first_name|vocative|default:"zákazníku"}}',
    'Co od nás budete dostávat a co jsme vám nachystali na první nákup.',
    [
      hero('uv1a', 'Vítejte', 'Jsme rádi, že jste tady', '#0f766e'),
      txt(
        'uv1b',
        '<p>Dobrý den ' +
          OSLOVENI +
          ',</p><p>děkujeme za přihlášení. Posíláme zhruba {{email_frequency|default:"dva e-maily měsíčně"}} — novinky, tipy a občas slevu. Nic jiného, a odhlásit se dá jedním kliknutím kdykoli.</p>',
      ),
      kupon(
        'uv1c',
        'Na první nákup',
        '{{welcome_coupon_code|default:"VITEJTE"}}',
        'Sleva {{welcome_discount|default:"10 %"}} na cokoli ze sortimentu.',
        'Platí {{coupon_valid_days|default:"14"}} dní od přihlášení',
        'Vybrat si',
        '{{shop_url|default:"#"}}',
        '#0f766e',
      ),
      sp('uv1d', 16),
      btn('uv1e', 'Prohlédnout si nabídku', '{{shop_url|default:"#"}}', '#0f766e'),
      sp('uv1f', 16),
      paticka(
        'uv1g',
        '{{company|default:"Váš e-shop"}} · Přihlásili jste se {{signup_date|default:"nedávno"}}.',
      ),
    ],
  ),

  // 2 — uvítací e-mail, druhý díl: co vlastně prodáváme
  t(
    'cs-welcome-2',
    'Uvítací e-mail (2/2)',
    'onboarding',
    'welcome-brand-story',
    'Druhý díl série po několika dnech: čím se lišíme a co u nás lidé kupují nejčastěji.',
    'Čím se lišíme od ostatních e-shopů',
    'Krátce o tom, jak to u nás chodí — a co si u nás lidé berou nejčastěji.',
    [
      txt(
        'us1a',
        '<p>Dobrý den ' +
          OSLOVENI +
          ',</p><p>před pár dny jste se u nás přihlásili. Tady je zbytek toho, co má smysl vědět dřív, než u nás poprvé nakoupíte.</p>',
      ),
      sloupce(
        'us1b',
        [
          txt(
            'us1b1',
            '<p><strong>Odesíláme týž den</strong><br>Objednávky přijaté do {{cutoff_time|default:"14:00"}} expedujeme ještě ten den.</p>',
          ),
        ],
        [
          txt(
            'us1b2',
            '<p><strong>Vrácení do {{return_days|default:"14"}} dnů</strong><br>Bez vysvětlování. Zpáteční štítek přiložíme do balíku.</p>',
          ),
        ],
      ),
      div('us1c'),
      txt('us1d', '<h2 style="margin:0 0 4px;font-size:19px;">Co si u nás berou nejčastěji</h2>'),
      produkt('us1e', 'bestseller_1'),
      sp('us1f', 12),
      sdilet('us1g', 'Znáte někoho, komu by se to hodilo?'),
      sp('us1h', 16),
      paticka('us1i', '{{company|default:"Váš e-shop"}} · Druhý díl uvítací série.'),
    ],
  ),

  // 3 — opuštěný košík, třetí krok: pobídka
  t(
    'cs-cart-lastchance',
    'Opuštěný košík — poslední pobídka',
    'ecommerce',
    'abandoned-cart-incentive',
    'Třetí a poslední krok série: sleva na dokončení objednávky, s koncem platnosti.',
    'Poslední připomínka — a sleva {{cart_discount|default:"5 %"}} na dokončení',
    'Košík vám držíme do {{cart_expiry|default:"zítřejšího večera"}}.',
    [
      txt(
        'kk1a',
        '<p>Dobrý den ' +
          OSLOVENI +
          ',</p><p>tohle je od nás poslední připomínka. Košík vám držíme do {{cart_expiry|default:"zítřejšího večera"}}, pak ho uvolníme zpátky do skladu.</p>',
      ),
      kupon(
        'kk1b',
        'Ať to není kvůli ceně',
        '{{cart_coupon_code|default:"DOKONCIT"}}',
        'Sleva {{cart_discount|default:"5 %"}} na obsah vašeho košíku.',
        'Platí do {{cart_expiry|default:"zítřejšího večera"}}',
        'Dokončit objednávku',
        '{{cart_url|default:"#"}}',
        '#b45309',
      ),
      sp('kk1c', 16),
      produkt('kk1d', 'cart_item_1', 'Zpět do košíku'),
      txt(
        'kk1e',
        '<p style="font-size:13px;color:#6b7280;">Pokud jste si to rozmysleli, nevadí — tenhle e-mail už od nás k tomuhle košíku nepřijde.</p>',
      ),
      paticka('kk1f', '{{company|default:"Váš e-shop"}} · Třetí a poslední připomínka košíku.'),
    ],
  ),

  // 4 — zásilka doručena
  t(
    'cs-delivered',
    'Zásilka doručena',
    'transactional',
    'delivery-confirmation',
    'Potvrzení doručení s nabídkou pomoci dřív, než se z problému stane špatná recenze.',
    'Zásilka {{shipment.tracking_number|default:"—"}} je doručena',
    'Dorazilo všechno v pořádku? Kdyby ne, ozvěte se nám.',
    [
      hero('dr1a', 'Doručeno', 'Zásilka je u vás', '#15803d'),
      txt(
        'dr1b',
        '<p>Dobrý den ' +
          OSLOVENI +
          ',</p><p>dopravce nám potvrdil doručení {{delivered_at|default:"dnes"}}. Zkontrolujte prosím obsah — kdyby něco chybělo nebo se cestou poškodilo, vyřešíme to nejrychleji hned teď.</p>',
      ),
      sloupce(
        'dr1c',
        [
          txt(
            'dr1c1',
            '<p><strong>Něco chybí nebo je rozbité</strong><br>Napište nám na {{support_email|default:"info@vas-eshop.cz"}} a přiložte fotku.</p>',
          ),
        ],
        [
          txt(
            'dr1c2',
            '<p><strong>Chcete zboží vrátit</strong><br>Máte na to {{return_days|default:"14"}} dní. Štítek najdete v balíku.</p>',
          ),
        ],
      ),
      btn('dr1d', 'Nahlásit problém', '{{support_url|default:"#"}}', '#15803d'),
      paticka(
        'dr1e',
        '{{company|default:"Váš e-shop"}} · Objednávka {{order.number|default:"—"}}.',
      ),
    ],
  ),

  // 5 — připraveno na výdejním místě
  t(
    'cs-pickup-ready',
    'Připraveno na výdejním místě',
    'transactional',
    'pickup-notification',
    'Zásilka čeká na výdejním místě: adresa, otevírací doba a datum, do kdy si ji lze vyzvednout.',
    'Zásilka čeká na {{pickup.point_name|default:"výdejním místě"}}',
    'Vyzvedněte si ji do {{pickup.deadline|default:"sedmi dnů"}}, pak putuje zpátky k nám.',
    [
      txt(
        'vm1a',
        '<p>Dobrý den ' +
          OSLOVENI +
          ',</p><p>vaše objednávka {{order.number|default:"—"}} dorazila na výdejní místo a čeká na vás. Kód pro vyzvednutí najdete níž.</p>',
      ),
      sloupce(
        'vm1b',
        [
          txt(
            'vm1b1',
            '<p><strong>{{pickup.point_name|default:"Výdejní místo"}}</strong><br>{{pickup.address|default:"—"}}</p><p><strong>Otevřeno</strong><br>{{pickup.opening_hours|default:"—"}}</p>',
          ),
        ],
        [
          txt(
            'vm1b2',
            '<p><strong>Kód pro vyzvednutí</strong><br><span style="font-size:20px;font-weight:700;color:#111827;">{{pickup.code|default:"—"}}</span></p><p><strong>Vyzvednout do</strong><br>{{pickup.deadline|default:"—"}}</p>',
          ),
        ],
      ),
      txt(
        'vm1c',
        '<p>Vezměte si s sebou kód a doklad totožnosti. Po uvedeném datu zásilku pošlou zpátky k nám a peníze vracíme na účet.</p>',
      ),
      paticka(
        'vm1d',
        '{{company|default:"Váš e-shop"}} · Objednávka {{order.number|default:"—"}}.',
      ),
    ],
  ),

  // 6 — objednávka čeká na platbu převodem
  t(
    'cs-payment-pending',
    'Čeká na platbu převodem',
    'transactional',
    'payment-pending',
    'Nezaplacená objednávka na bankovní převod: platební údaje, QR platba a lhůta.',
    'Objednávka {{order.number|default:"—"}} čeká na zaplacení',
    'Platební údaje máte níž. Zboží rezervujeme {{payment.hold_days|default:"3"}} dny.',
    [
      hero('pl1a', 'Zbývá zaplatit', 'Objednávku máme, platbu zatím ne', '#b45309'),
      txt(
        'pl1b',
        '<p>Dobrý den ' +
          OSLOVENI +
          ',</p><p>vaši objednávku {{order.number|default:"—"}} evidujeme, ale platba k nám zatím nedorazila. Zboží držíme {{payment.hold_days|default:"3"}} dny; pak objednávku rušíme a nic vám neúčtujeme.</p>',
      ),
      sloupce(
        'pl1c',
        [
          txt(
            'pl1c1',
            '<p><strong>Číslo účtu</strong><br>{{payment.account_number|default:"—"}}</p><p><strong>Variabilní symbol</strong><br>{{payment.variable_symbol|default:"—"}}</p><p><strong>Částka</strong><br>{{order.total|default:"—"}}</p>',
          ),
        ],
        [
          txt(
            'pl1c2',
            '<p><strong>Zaplatit QR kódem</strong><br>Načtěte ho v bankovní aplikaci — částka i symbol se vyplní samy.</p><p><img src="{{payment.qr_url}}" alt="QR platba" width="140" height="140" /></p>',
          ),
        ],
      ),
      btn('pl1d', 'Zaplatit kartou online', '{{payment.url|default:"#"}}', '#b45309'),
      txt(
        'pl1e',
        '<p style="font-size:13px;color:#6b7280;">Jestli jste už zaplatili v posledních hodinách, tenhle e-mail nás jen minul — platby párujeme několikrát denně.</p>',
      ),
      paticka(
        'pl1f',
        '{{company|default:"Váš e-shop"}} · Objednávka {{order.number|default:"—"}}.',
      ),
    ],
  ),

  // 7 — svátek (jmeniny)
  t(
    'cs-nameday',
    'Přání k svátku',
    'seasonal',
    'nameday',
    'Přání k jmeninám s dárkem. Vychází z jmenného kalendáře, který má produkt v @forgemsg/i18n-cs.',
    'Všechno nejlepší k svátku, {{contact.first_name|vocative|default:"zákazníku"}}',
    'Máme pro vás malou pozornost.',
    [
      hero('sv1a', 'Všechno nejlepší', 'Dnes slavíte svátek', '#9333ea'),
      kupon(
        'sv1b',
        'Dárek k svátku',
        '{{nameday_coupon_code|default:"SVATEK"}}',
        'Sleva {{nameday_discount|default:"15 %"}} na cokoli. Bez podmínek a minimální útraty.',
        'Platí {{coupon_valid_days|default:"7"}} dní',
        'Vybrat si dárek',
        '{{shop_url|default:"#"}}',
        '#9333ea',
      ),
      txt(
        'sv1c',
        '<p style="text-align:center;">Nic po vás nechceme — jen jsme si všimli, že máte svátek, a přišlo nám hloupé nic neposlat.</p>',
        '15px',
        '#374151',
        'center',
      ),
      paticka('sv1d', '{{company|default:"Váš e-shop"}} · Přání posíláme jednou za rok.'),
    ],
  ),

  // 8 — obsahový newsletter
  t(
    'cs-digest',
    'Obsahový newsletter',
    'newsletter',
    'content-digest',
    'Přehled článků a tipů se sdílecími tlačítky — jediný typ e-mailu, který lidé posílají dál.',
    'Co jsme pro vás sepsali v {{digest_month|default:"tomhle měsíci"}}',
    'Tři tipy, u kterých nejde o to, abyste něco koupili.',
    [
      txt(
        'nl1a',
        '<p>Dobrý den ' +
          OSLOVENI +
          ',</p><p>tenhle e-mail nic neprodává. Sepsali jsme, co se nám osvědčilo a na co se nás nejčastěji ptáte.</p>',
      ),
      div('nl1b'),
      sloupce(
        'nl1c',
        [
          txt(
            'nl1c1',
            '<h3 style="margin:0 0 4px;font-size:17px;">{{article_1.title|default:"První článek"}}</h3><p>{{article_1.excerpt|default:""}}</p><p><a href="{{article_1.url|default:\'#\'}}">Přečíst</a></p>',
          ),
        ],
        [
          txt(
            'nl1c2',
            '<h3 style="margin:0 0 4px;font-size:17px;">{{article_2.title|default:"Druhý článek"}}</h3><p>{{article_2.excerpt|default:""}}</p><p><a href="{{article_2.url|default:\'#\'}}">Přečíst</a></p>',
          ),
        ],
      ),
      div('nl1d'),
      txt(
        'nl1e',
        '<h3 style="margin:0 0 4px;font-size:17px;">{{article_3.title|default:"Třetí článek"}}</h3><p>{{article_3.excerpt|default:""}}</p><p><a href="{{article_3.url|default:\'#\'}}">Přečíst</a></p>',
      ),
      sdilet('nl1f', 'Přišlo vám to užitečné? Pošlete to dál.'),
      sp('nl1g', 16),
      paticka('nl1h', '{{company|default:"Váš e-shop"}} · Newsletter, ne nabídka.'),
    ],
  ),

  // 9 — doplňky k objednávce
  t(
    'cs-crosssell',
    'Doplňky k objednávce',
    'ecommerce',
    'cross-sell',
    'Nabídka příslušenství k tomu, co si zákazník koupil; obsah se liší podle toho, jestli nakupuje opakovaně.',
    'K {{order.main_item|default:"vaší objednávce"}} se hodí ještě tohle',
    'Vybráno podle toho, co jste si objednali.',
    [
      txt(
        'ds1a',
        '<p>Dobrý den ' +
          OSLOVENI +
          ',</p><p>zboží už máte doma, tak jen krátce: k tomu, co jste si vybrali, se obvykle dokupuje ještě tohle.</p>',
      ),
      {
        id: 'ds1b',
        type: 'dynamic',
        label: 'Podle počtu objednávek',
        condition: {
          operator: 'AND',
          rules: [{ field: 'contact.total_orders', op: 'gt', value: 1 }],
        },
        ifContent: [
          txt(
            'ds1b1',
            '<p>Nakupujete u nás opakovaně, takže na doplňky máte {{repeat_discount|default:"5 %"}} navíc — strhne se v košíku samo.</p>',
          ),
        ],
        elseContent: [
          txt(
            'ds1b2',
            '<p>Při objednávce nad {{free_shipping_threshold|default:"1 500 Kč"}} je doprava zdarma, takže se vyplatí přibrat to rovnou.</p>',
          ),
        ],
      },
      produkt('ds1c', 'accessory_1', 'Přidat do košíku'),
      sp('ds1d', 12),
      btn('ds1e', 'Zobrazit další doplňky', '{{accessories_url|default:"#"}}'),
      paticka(
        'ds1f',
        '{{company|default:"Váš e-shop"}} · Podle objednávky {{order.number|default:"—"}}.',
      ),
    ],
  ),

  // 10 — změna obchodních podmínek
  t(
    'cs-terms-change',
    'Změna obchodních podmínek',
    'transactional',
    'terms-change',
    'Oznámení o změně podmínek nebo zpracování údajů. Záměrně nejstřídmější layout v knihovně.',
    'Měníme obchodní podmínky od {{terms.effective_date|default:"příštího měsíce"}}',
    'Co se mění a co s tím můžete udělat.',
    [
      txt(
        'op1a',
        '<p>Dobrý den ' +
          OSLOVENI +
          ',</p><p>od {{terms.effective_date|default:"příštího měsíce"}} upravujeme {{terms.document_name|default:"obchodní podmínky"}}. Posíláme to předem, abyste měli čas si to přečíst.</p>',
      ),
      sloupce(
        'op1b',
        [
          txt(
            'op1b1',
            '<p><strong>Co se mění</strong><br>{{terms.summary|default:"Shrnutí změn najdete v dokumentu."}}</p>',
          ),
        ],
        [
          txt(
            'op1b2',
            '<p><strong>Od kdy</strong><br>{{terms.effective_date|default:"—"}}</p><p><strong>Co dělat</strong><br>Nic. Pokud u nás nakoupíte po tomto datu, platí nové znění.</p>',
          ),
        ],
        [2, 1],
      ),
      btn('op1c', 'Přečíst si celé znění', '{{terms.url|default:"#"}}', '#475569'),
      paticka(
        'op1d',
        '{{company|default:"Váš e-shop"}} · Tenhle e-mail posíláme, protože nám to ukládá zákon.',
      ),
    ],
  ),
];
