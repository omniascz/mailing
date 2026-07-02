import { describe, it, expect } from 'vitest';
import { buildLoaderScript, renderHostedFormPage } from './render.js';
import type { SignupForm } from '../../db/schema/index.js';

const form = {
  id: '11111111-1111-1111-1111-111111111111',
  orgId: 'org',
  listId: null,
  name: 'Newsletter <signup>',
  fields: [
    { name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@x.com' },
    { name: 'first_name', label: 'First name', type: 'text', required: false },
    { name: 'plan', label: 'Plan', type: 'select', required: true, options: ['Free', 'Pro'] },
    { name: 'consent', label: 'I agree', type: 'checkbox', required: true },
    { name: 'ref', label: 'ref', type: 'hidden', required: false, defaultValue: 'home' },
  ],
  embedType: 'inline',
  config: {
    submitButtonText: 'Join now',
    successMessage: 'Welcome!',
    honeypotField: 'company_website',
  },
  active: true,
  viewCount: 0,
  submitCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as SignupForm;

describe('buildLoaderScript', () => {
  const js = buildLoaderScript('https://api.test');
  it('is form-agnostic and reads data-form-id', () => {
    expect(js).toContain("getAttribute('data-form-id')");
    expect(js).toContain('https://api.test/public/forms/');
    expect(js).toContain('/submit');
    expect(js).toContain('should-show'); // honours targeting
  });
});

describe('renderHostedFormPage', () => {
  const html = renderHostedFormPage(form, 'https://api.test');

  it('is a full HTML document', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('</html>');
    expect(html).toContain('name="viewport"');
  });

  it('escapes the form name (no XSS via name)', () => {
    expect(html).toContain('Newsletter &lt;signup&gt;');
    expect(html).not.toContain('<h1>Newsletter <signup>');
  });

  it('renders each field type', () => {
    expect(html).toContain('type="email"');
    expect(html).toContain('name="first_name"');
    expect(html).toContain('<select id="fm-plan"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('type="hidden" name="ref" value="home"');
  });

  it('includes the honeypot off-screen', () => {
    expect(html).toContain('name="company_website"');
    expect(html).toContain('left:-9999px');
  });

  it('uses the configured submit button text and posts to the submit endpoint', () => {
    expect(html).toContain('>Join now<');
    expect(html).toContain("https://api.test/public/forms/'+formId+'/submit");
    expect(html).toContain("'11111111-1111-1111-1111-111111111111'"); // formId passed to fmSubmit
  });
});
