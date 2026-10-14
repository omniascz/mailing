/**
 * The one stored form of an e-mail address: trimmed, lower case.
 *
 * Contacts and the suppression list both store it and both look up by it, so
 * an address typed as Jan.Novak@Example.CZ and one imported as
 * jan.novak@example.cz are the same person to every gate. Two spellings used to
 * be two contacts (Z146, measured): POST /contacts stored what was typed, the
 * form, DOI and imports stored lower case, and every lookup compared exactly.
 *
 * ASCII only in effect: String.prototype.toLowerCase folds non-ASCII letters
 * too (Ž → ž), and Postgres lower() does the same only under a UTF-8 locale;
 * an IDN domain is compared as given, not as punycode.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
