/**
 * The body the campaign form PUTs.
 *
 * A pure function rather than an object literal inside the submit handler, so
 * that a test can check what gets sent. `environment: 'node'` has no DOM and
 * the handler cannot be fired; without this split, "the field is on the screen"
 * and "the field reaches the API" are two different claims and only the first
 * one was ever provable — which is how a field ends up rendered, bound to
 * state, and quietly never sent.
 */

export interface SaveFields {
  subject: string;
  preheader: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  listId: string;
  segmentId: string;
  excludeSegmentId: string;
  /** Already built and validated; `{}` (AB_OFF) when the test is switched off. */
  abConfig: Record<string, unknown>;
  timewarpOn: boolean;
  timewarpHour: number;
  timewarpFallback: string;
  utmOn: boolean;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  html: string;
  plainText: string;
  /** True when the visual editor owns this campaign's content. */
  hasEditorSchema: boolean;
}

export function buildSavePayload(f: SaveFields): Record<string, unknown> {
  return {
    subject: f.subject.trim() || undefined,
    preheader: f.preheader.trim() || undefined,
    fromName: f.fromName.trim() || undefined,
    fromEmail: f.fromEmail.trim() || undefined,
    replyTo: f.replyTo.trim() || undefined,
    listId: f.listId || undefined,
    // A segment narrows the list, it does not replace it: the send path's
    // validateCampaignReadiness still requires a listId.
    segmentId: f.segmentId || undefined,
    excludeSegmentId: f.excludeSegmentId || undefined,
    // Always sent, `{}` when off — the route's schema is
    // z.record(z.unknown()).optional(), so null is rejected and an absent key
    // would leave a stored test running.
    abConfig: f.abConfig,
    // Sent on every save, including when switched off, so turning it off
    // actually turns it off. `undefined` would leave the stored value in
    // place and the campaign would keep time-warping.
    timewarp: {
      enabled: f.timewarpOn,
      localHour: f.timewarpHour,
      fallbackTimezone: f.timewarpFallback.trim() || undefined,
    },
    // Sent whether on or off, for the same reason as timewarp above:
    // an absent key is not an instruction to clear.
    utmTracking: {
      enabled: f.utmOn,
      source: f.utmSource.trim() || undefined,
      medium: f.utmMedium.trim() || undefined,
      campaign: f.utmCampaign.trim() || undefined,
    },
    // A campaign the visual editor owns does NOT get its content written
    // from here. This form used to PUT `{ html, plainText }` whatever the
    // campaign was, which replaced the whole content object and dropped
    // the block schema — the banner on the page says the editor is the source
    // of truth, and this is what makes that true rather than advisory.
    // Since the send path renders from the schema, dropping it also
    // silently downgraded the campaign to the raw-HTML branch.
    ...(f.hasEditorSchema
      ? {}
      : { content: { html: f.html || undefined, plainText: f.plainText || undefined } }),
  };
}
