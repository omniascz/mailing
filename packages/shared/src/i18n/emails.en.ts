import type { EmailsBundle } from './types.js';

export const en: EmailsBundle = {
  common: {
    brand: 'ForgeMsg',
    view_in_browser: 'View in browser',
    footer_sent_by: 'This email was sent by {{org}}.',
    footer_no_longer:
      'If you no longer want to receive these emails, you can {{unsubscribe_link}}.',
    unsubscribe_link_label: 'unsubscribe here',
  },

  doi_confirm: {
    subject: 'Confirm your subscription',
    heading: 'Confirm your email',
    body_intro:
      'Thanks for signing up. To complete your subscription, please confirm your email address by clicking the link below.',
    cta: 'Confirm email',
    ignore_if_not_yours:
      'If you did not request this subscription, simply ignore this email — without confirmation we will not send you any further messages.',
    expires_in: 'The link is valid for 48 hours.',
  },

  doi_confirmed_page: {
    title: 'Subscription confirmed',
    heading: "You're subscribed ✓",
    body: 'Your subscription has been confirmed. Thank you!',
  },

  doi_expired_page: {
    title: 'Link expired',
    heading: 'Link expired',
    body: 'This confirmation link has expired or was already used. Please subscribe again.',
  },

  unsubscribe_page: {
    title: 'Unsubscribed',
    heading: "You've been unsubscribed",
    body: 'You have been successfully removed from this mailing list. You will no longer receive emails from us.',
  },

  unsubscribe_invalid_page: {
    title: 'Invalid link',
    heading: 'Invalid or expired link',
    body: 'This unsubscribe link is invalid or has already been used.',
  },

  preferences_page: {
    title: 'Subscription preferences',
    heading: 'Manage your subscriptions',
    intro: 'Choose which messages you want to receive from us.',
    unsubscribe_all_cta: 'Unsubscribe from all',
    save_cta: 'Save preferences',
    updated_body: 'Your preferences have been saved.',
  },

  password_reset: {
    subject: 'Password reset',
    heading: 'Password reset',
    body_intro:
      'We received a request to reset the password for your account {{email}}. Click the link below to set a new password.',
    cta: 'Reset password',
    ignore_if_not_yours: 'If you did not request a password reset, simply ignore this email.',
    expires_in: 'The link is valid for 60 minutes.',
  },

  email_verification: {
    subject: 'Verify your email',
    heading: 'Verify your email address',
    body_intro:
      'Welcome to {{brand}}! Click the link below to verify that {{email}} is your address.',
    cta: 'Verify email',
  },

  team_invite: {
    subject: '{{inviter}} invites you to {{org}}',
    heading: "You've been invited to a team",
    body_intro: '{{inviter}} is inviting you to collaborate in {{org}} on {{brand}}.',
    cta: 'Accept invitation',
  },
};
