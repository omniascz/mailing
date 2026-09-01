/**
 * The body the "new campaign" form POSTs.
 *
 * A pure function rather than an object literal inside the submit handler,
 * for the same reason buildSavePayload is one (#118): a literal inside a
 * handler cannot be read by anything, so the only way to find out which
 * campaign settings the product can actually set is to grep for their names —
 * and grepping is what let #117 report a shipped feature as missing.
 *
 * The campaign-field guard unions the keys of this function's output with the
 * other three builders and holds the result against the API's own schema.
 */

export type CampaignType = 'email' | 'sms' | 'whatsapp' | 'push' | 'voice';

export interface CreateFields {
  name: string;
  type: CampaignType;
  listId: string;
  subject: string;
  preheader: string;
  fromName: string;
  fromEmail: string;
}

export function buildCreatePayload(f: CreateFields): Record<string, unknown> {
  return {
    name: f.name.trim(),
    type: f.type,
    listId: f.listId || undefined,
    // The sender fields belong to an email and to nothing else. A push
    // campaign has no From address, and sending one would be describing the
    // draft wrong from the moment it is created.
    ...(f.type === 'email' && {
      subject: f.subject.trim() || undefined,
      preheader: f.preheader.trim() || undefined,
      fromName: f.fromName.trim() || undefined,
      fromEmail: f.fromEmail.trim() || undefined,
    }),
  };
}

/**
 * Every key this builder can produce, whatever the type of campaign.
 *
 * The guard needs the full set, and `buildCreatePayload` alone cannot give it:
 * for a non-email campaign the sender fields are spread away and their names
 * never appear in the result. Calling it once with `type: 'email'` is what
 * makes this honest, which is asserted in the guard's own self-test rather
 * than assumed here.
 */
export function createPayloadKeys(): string[] {
  return Object.keys(
    buildCreatePayload({
      name: 'x',
      type: 'email',
      listId: '',
      subject: '',
      preheader: '',
      fromName: '',
      fromEmail: '',
    }),
  );
}
