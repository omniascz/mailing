/**
 * The body the clone button POSTs. See create-payload.ts for why this is a
 * function and not a literal.
 *
 * There is no clone endpoint; a clone is a create with the source campaign's
 * values. Which means this builder decides what a copy carries — and what it
 * silently drops.
 */

export interface CloneSource {
  id: string;
  name: string;
  type: string;
  subject: string | null;
  preheader: string | null;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  content: Record<string, unknown> | null;
  listId: string | null;
  segmentId: string | null;
  excludeSegmentId: string | null;
}

export function buildClonePayload(campaign: CloneSource): Record<string, unknown> {
  return {
    name: `Copy of ${campaign.name}`,
    type: campaign.type,
    subject: campaign.subject ?? undefined,
    preheader: campaign.preheader ?? undefined,
    fromName: campaign.fromName ?? undefined,
    fromEmail: campaign.fromEmail ?? undefined,
    replyTo: campaign.replyTo ?? undefined,
    content: campaign.content ?? undefined,
    listId: campaign.listId ?? undefined,
    segmentId: campaign.segmentId ?? undefined,
    excludeSegmentId: campaign.excludeSegmentId ?? undefined,
  };
}

/** Every key a clone can carry. */
export function clonePayloadKeys(): string[] {
  return Object.keys(
    buildClonePayload({
      id: 'x',
      name: 'x',
      type: 'email',
      subject: null,
      preheader: null,
      fromName: null,
      fromEmail: null,
      replyTo: null,
      content: null,
      listId: null,
      segmentId: null,
      excludeSegmentId: null,
    }),
  );
}
