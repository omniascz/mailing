import { describe, it, expect } from 'vitest';
import {
  renderDoiConfirmEmail,
  renderPasswordResetEmail,
  renderEmailVerificationEmail,
  renderTeamInviteEmail,
} from './index.js';

const base = { orgName: 'Acme' };

describe('renderDoiConfirmEmail', () => {
  it('produces CZ content by default', () => {
    const { subject, html, text } = renderDoiConfirmEmail({
      locale: 'cs',
      confirmUrl: 'https://app.example/confirm/abc',
      ...base,
    });
    expect(subject).toBe('Potvrďte svou registraci');
    expect(html).toContain('Potvrdit e-mail');
    expect(html).toContain('https://app.example/confirm/abc');
    expect(html).toContain('lang="cs"');
    expect(text).toContain('Potvrdit e-mail');
  });

  it('produces SK content', () => {
    const { subject } = renderDoiConfirmEmail({
      locale: 'sk',
      confirmUrl: 'https://app/x',
      ...base,
    });
    expect(subject).toBe('Potvrďte svoju registráciu');
  });

  it('produces EN content', () => {
    const { subject } = renderDoiConfirmEmail({
      locale: 'en',
      confirmUrl: 'https://app/x',
      ...base,
    });
    expect(subject).toBe('Confirm your subscription');
  });

  it('sets lang attribute per locale', () => {
    const en = renderDoiConfirmEmail({
      locale: 'en',
      confirmUrl: 'https://app/x',
      ...base,
    });
    expect(en.html).toContain('lang="en"');
  });

  it('includes org name in footer', () => {
    const { html } = renderDoiConfirmEmail({
      locale: 'cs',
      confirmUrl: 'https://app/x',
      orgName: 'Kavárna U Lípy',
    });
    expect(html).toContain('Kavárna U Lípy');
  });
});

describe('renderPasswordResetEmail', () => {
  it('interpolates the user email into the intro', () => {
    const { html, text } = renderPasswordResetEmail({
      locale: 'cs',
      resetUrl: 'https://app/reset/x',
      userEmail: 'petr@example.cz',
      ...base,
    });
    expect(html).toContain('petr@example.cz');
    expect(html).toContain('https://app/reset/x');
    expect(text).toContain('petr@example.cz');
  });
});

describe('renderEmailVerificationEmail', () => {
  it('renders SK content with brand interpolated', () => {
    const { html, subject } = renderEmailVerificationEmail({
      locale: 'sk',
      verifyUrl: 'https://app/verify/x',
      userEmail: 'anna@example.sk',
      ...base,
    });
    expect(subject).toBe('Overte svoj e-mail');
    expect(html).toContain('ForgeMsg');
    expect(html).toContain('anna@example.sk');
  });
});

describe('renderTeamInviteEmail', () => {
  it('interpolates inviter and org into subject', () => {
    const { subject } = renderTeamInviteEmail({
      locale: 'cs',
      acceptUrl: 'https://app/accept/x',
      inviterName: 'Jan Novák',
      orgName: 'Acme',
    });
    expect(subject).toBe('Jan Novák vás zve do Acme');
  });
});
