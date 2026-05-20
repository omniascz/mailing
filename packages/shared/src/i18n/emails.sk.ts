import type { EmailsBundle } from './types.js';

export const sk: EmailsBundle = {
  common: {
    brand: 'ForgeMsg',
    view_in_browser: 'Zobraziť v prehliadači',
    footer_sent_by: 'Tento e-mail vám bol odoslaný službou {{org}}.',
    footer_no_longer: 'Ak už nechcete dostávať tieto e-maily, môžete sa {{unsubscribe_link}}.',
    unsubscribe_link_label: 'odhlásiť tu',
  },

  doi_confirm: {
    subject: 'Potvrďte svoju registráciu',
    heading: 'Potvrďte svoj e-mail',
    body_intro:
      'Ďakujeme za registráciu. Pre dokončenie prihlásenia na odber prosím potvrďte svoju e-mailovú adresu kliknutím na odkaz nižšie.',
    cta: 'Potvrdiť e-mail',
    ignore_if_not_yours:
      'Ak ste túto registráciu nezadali, tento e-mail ignorujte — bez potvrdenia vám žiadne ďalšie správy nezašleme.',
    expires_in: 'Odkaz je platný 48 hodín.',
  },

  doi_confirmed_page: {
    title: 'Registrácia potvrdená',
    heading: 'Ste prihlásení ✓',
    body: 'Vaša registrácia bola potvrdená. Ďakujeme!',
  },

  doi_expired_page: {
    title: 'Odkaz vypršal',
    heading: 'Odkaz vypršal',
    body: 'Tento potvrdzovací odkaz vypršal alebo bol už použitý. Zaregistrujte sa prosím znova.',
  },

  unsubscribe_page: {
    title: 'Odhlásené',
    heading: 'Boli ste odhlásení',
    body: 'Boli ste úspešne odstránení z tejto mailingovej databázy. Už od nás nebudete dostávať e-maily.',
  },

  unsubscribe_invalid_page: {
    title: 'Neplatný odkaz',
    heading: 'Neplatný alebo vypršaný odkaz',
    body: 'Tento odhlasovací odkaz je neplatný alebo bol už použitý.',
  },

  preferences_page: {
    title: 'Nastavenie odberu',
    heading: 'Spravovať vaše odbery',
    intro: 'Zvoľte, ktoré správy od nás chcete dostávať.',
    unsubscribe_all_cta: 'Odhlásiť sa od všetkých',
    save_cta: 'Uložiť nastavenie',
    updated_body: 'Vaše nastavenie bolo uložené.',
  },

  password_reset: {
    subject: 'Obnovenie hesla',
    heading: 'Obnovenie hesla',
    body_intro:
      'Dostali sme žiadosť o obnovenie hesla k vášmu účtu {{email}}. Kliknutím na odkaz nižšie nastavíte nové heslo.',
    cta: 'Obnoviť heslo',
    ignore_if_not_yours: 'Ak ste obnovenie hesla nevyžiadali, tento e-mail ignorujte.',
    expires_in: 'Odkaz je platný 60 minút.',
  },

  email_verification: {
    subject: 'Overte svoj e-mail',
    heading: 'Overte svoju e-mailovú adresu',
    body_intro:
      'Vitajte v {{brand}}! Kliknutím na odkaz nižšie overte, že {{email}} je vaša adresa.',
    cta: 'Overiť e-mail',
  },

  team_invite: {
    subject: '{{inviter}} vás pozýva do {{org}}',
    heading: 'Boli ste pozvaní do tímu',
    body_intro: '{{inviter}} vás pozýva na spoluprácu v organizácii {{org}} na {{brand}}.',
    cta: 'Prijať pozvánku',
  },
};
