import type { EmailsBundle } from './types.js';

export const cs: EmailsBundle = {
  common: {
    brand: 'ForgeMsg',
    view_in_browser: 'Zobrazit v prohlížeči',
    footer_sent_by: 'Tento e-mail vám byl odeslán službou {{org}}.',
    footer_no_longer:
      'Pokud již nechcete dostávat tyto e-maily, můžete se {{unsubscribe_link}}.',
    unsubscribe_link_label: 'odhlásit zde',
  },

  doi_confirm: {
    subject: 'Potvrďte svou registraci',
    heading: 'Potvrďte svůj e-mail',
    body_intro:
      'Děkujeme za registraci. Pro dokončení přihlášení k odběru prosím potvrďte svou e-mailovou adresu kliknutím na odkaz níže.',
    cta: 'Potvrdit e-mail',
    ignore_if_not_yours:
      'Pokud jste tuto registraci nezadali, tento e-mail ignorujte — bez potvrzení vám žádné další zprávy nezašleme.',
    expires_in: 'Odkaz je platný 48 hodin.',
  },

  doi_confirmed_page: {
    title: 'Registrace potvrzena',
    heading: 'Jste přihlášeni ✓',
    body: 'Vaše registrace byla potvrzena. Děkujeme!',
  },

  doi_expired_page: {
    title: 'Odkaz vypršel',
    heading: 'Odkaz vypršel',
    body: 'Tento potvrzovací odkaz vypršel nebo byl již použit. Zaregistrujte se prosím znovu.',
  },

  unsubscribe_page: {
    title: 'Odhlášeno',
    heading: 'Byli jste odhlášeni',
    body: 'Byli jste úspěšně odstraněni z této mailingové databáze. Již od nás nebudete dostávat e-maily.',
  },

  unsubscribe_invalid_page: {
    title: 'Neplatný odkaz',
    heading: 'Neplatný nebo vypršený odkaz',
    body: 'Tento odhlašovací odkaz je neplatný nebo byl již použit.',
  },

  preferences_page: {
    title: 'Nastavení odběru',
    heading: 'Spravovat vaše odběry',
    intro: 'Zvolte, které zprávy od nás chcete dostávat.',
    unsubscribe_all_cta: 'Odhlásit se od všech',
    save_cta: 'Uložit nastavení',
    updated_body: 'Vaše nastavení bylo uloženo.',
  },

  password_reset: {
    subject: 'Obnovení hesla',
    heading: 'Obnovení hesla',
    body_intro:
      'Obdrželi jsme žádost o obnovení hesla k vašemu účtu {{email}}. Kliknutím na odkaz níže nastavíte nové heslo.',
    cta: 'Obnovit heslo',
    ignore_if_not_yours:
      'Pokud jste obnovení hesla nevyžádali, tento e-mail ignorujte.',
    expires_in: 'Odkaz je platný 60 minut.',
  },

  email_verification: {
    subject: 'Ověřte svůj e-mail',
    heading: 'Ověřte svou e-mailovou adresu',
    body_intro:
      'Vítejte v {{brand}}! Kliknutím na odkaz níže ověřte, že {{email}} je vaše adresa.',
    cta: 'Ověřit e-mail',
  },

  team_invite: {
    subject: '{{inviter}} vás zve do {{org}}',
    heading: 'Byli jste pozváni do týmu',
    body_intro:
      '{{inviter}} vás zve ke spolupráci v organizaci {{org}} na {{brand}}.',
    cta: 'Přijmout pozvánku',
  },
};
