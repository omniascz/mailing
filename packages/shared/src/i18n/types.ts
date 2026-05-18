/** Structural type for email localization bundles — all leaves are plain strings. */
export interface EmailsBundle {
  common: {
    brand: string;
    view_in_browser: string;
    footer_sent_by: string;
    footer_no_longer: string;
    unsubscribe_link_label: string;
  };
  doi_confirm: {
    subject: string;
    heading: string;
    body_intro: string;
    cta: string;
    ignore_if_not_yours: string;
    expires_in: string;
  };
  doi_confirmed_page: {
    title: string;
    heading: string;
    body: string;
  };
  doi_expired_page: {
    title: string;
    heading: string;
    body: string;
  };
  unsubscribe_page: {
    title: string;
    heading: string;
    body: string;
  };
  unsubscribe_invalid_page: {
    title: string;
    heading: string;
    body: string;
  };
  preferences_page: {
    title: string;
    heading: string;
    intro: string;
    unsubscribe_all_cta: string;
    save_cta: string;
    updated_body: string;
  };
  password_reset: {
    subject: string;
    heading: string;
    body_intro: string;
    cta: string;
    ignore_if_not_yours: string;
    expires_in: string;
  };
  email_verification: {
    subject: string;
    heading: string;
    body_intro: string;
    cta: string;
  };
  team_invite: {
    subject: string;
    heading: string;
    body_intro: string;
    cta: string;
  };
}
