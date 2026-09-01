/**
 * Every campaign setting the API accepts is either something the product can
 * set, or a decision recorded with a reason. Nothing in between.
 *
 * This class of defect is documented nine times in this repository: the block
 * palette (#93), the property panels (#95), UTM (#117), time-warp (#116), STO
 * (#117), locale (#49), postal_address (#46), VERP (#41), the form_submit
 * trigger — and most recently the poll report, the A/B result and segments
 * (#118). Each time the backend was finished and there was no way to reach it.
 * The shape is always the same: a field is added to the route's schema, the
 * work behind it is done, and nobody decides whether a person can set it.
 *
 * HOW THE TWO SIDES ARE OBTAINED — AND WHY NOT BY GREP
 * ----------------------------------------------------
 * Both sides are RUNTIME values, not text searches.
 *
 *   API side  `Object.keys(createSchema.shape)` — the zod object the route
 *             parses request bodies with, imported directly.
 *   web side  the union of `Object.keys(...)` over the four functions that
 *             build a campaign body in this app. They exist as pure functions
 *             precisely so that they can be read here.
 *
 * A grep-based version was considered and rejected on evidence. The #117 probe
 * searched for the literal string `/api/v1/campaigns/:id/folder`, found
 * nothing, and reported folder assignment as missing from the UI — while
 * FolderPicker had been shipping it all along, composing the URL as
 * `${endpoint}/${itemId}/folder`, a string that never appears anywhere. A
 * guard built on literals inherits that blind spot exactly.
 *
 * WHAT THIS GUARD CANNOT SEE
 * --------------------------
 * - ROUTES. It covers FIELDS only. There is no runtime list of the campaign
 *   endpoints this app calls, because a URL is a string assembled at the call
 *   site; `:id/folder`, `:id/utm`, `:id/schedule` and the rest are invisible
 *   here. Making them visible would need every call to go through a typed
 *   client naming the route, or the route paths exported as constants that
 *   callers import. Neither exists, and inventing a literal search for them
 *   would rebuild the #117 mistake.
 * - REACHABILITY. It proves a builder produces a key, not that a person can
 *   get to the screen that calls it. A form behind a dead link, a disabled
 *   button, or a capability flag that is off still counts as covered.
 *   #95 is the precedent: panels existed and the palette could not open them.
 * - CORRECTNESS. Nothing here checks the VALUE sent is valid, or that the
 *   server does anything with it.
 * - FIELDS OUTSIDE createSchema. Its universe is what POST/PUT /campaigns
 *   accepts. `folderId` is set by its own endpoint and is not in this schema,
 *   so this guard neither covers it nor claims to.
 * - Anything reached from apps/editor, the mobile app, or the SDKs.
 */

import { describe, it, expect } from 'vitest';
import {
  createSchema,
  updateSchema,
} from '../../../../../api/src/routes/v1/campaign-settings-schema.js';
import { buildSavePayload } from './[id]/edit/save-payload';
import { createPayloadKeys } from './new/create-payload';
import { clonePayloadKeys } from './[id]/clone-payload';
import { editorSavePayloadKeys } from '../../editor/campaigns/[id]/editor-save-payload';

/** A decision about a field, carried as data. A comment can be deleted in silence. */
interface FieldDecision {
  field: string;
  reason: string;
}

/**
 * Settings that stay API-only on purpose.
 *
 * `type` is deliberately NOT here even though it looks like it belongs: the
 * new-campaign form has a type picker and the clone button copies it, so the
 * web does send it. Listing it would be a false record, and the guard rejects
 * an entry whose field the product already sets — see the third case below.
 */
const API_ONLY: FieldDecision[] = [
  {
    field: 'templateId',
    reason:
      'Starting a campaign from a template is the template gallery’s job, not a field on the campaign form. The form owns the body; picking a template replaces it.',
  },
  {
    field: 'locale',
    reason:
      'Inherited from the template, and English when there is none. An explicit per-campaign override is an API-level escape hatch; exposing it invites a locale that disagrees with the content that was actually written.',
  },
  {
    field: 'configurationSet',
    reason:
      'Names an IP pool and a TLS policy. That is deliverability configuration for a whole account, set once by whoever owns the sending infrastructure, not per campaign by whoever writes the copy.',
  },
  {
    field: 'category',
    reason:
      'SendGrid-parity label used to group statistics. Only meaningful to an integrator who is already driving the API and wants their own taxonomy in the reports.',
  },
];

/**
 * Settings with no way to set them from the product, recorded rather than
 * quietly excluded.
 *
 * This list is not a synonym for API_ONLY. API_ONLY says "a person should not
 * set this"; this one says "a person cannot, and that is a gap". Keeping them
 * apart is the point — merged, the gaps would disappear into a list of
 * decisions and stop being visible.
 */
const KNOWN_GAPS: FieldDecision[] = [
  {
    field: 'scheduledAt',
    reason:
      'A campaign cannot be scheduled for later from the UI. POST /campaigns/:id/schedule exists and nothing in apps/web calls it — campaign-actions.tsx offers send, pause, resume, cancel and schedule-resend, and no date picker. Measured, not assumed: the #117 probe recorded this field as reachable through campaign-actions, and it is not.',
  },
  {
    field: 'timezone',
    reason:
      'A dead column. Written on create and update with a default of UTC, read by nothing — no service in apps/api and no worker. Time-warp does not use it; that has its own fallbackTimezone. Deliberately out of scope here: giving it a UI would be building a control for a value with no effect.',
  },
];

/** Every campaign field any screen in this app can send. */
function fieldsTheWebSends(): string[] {
  const save = Object.keys(
    buildSavePayload({
      subject: '',
      preheader: '',
      fromName: '',
      fromEmail: '',
      replyTo: '',
      listId: '',
      segmentId: '',
      excludeSegmentId: '',
      abConfig: {},
      timewarpOn: false,
      timewarpHour: 9,
      timewarpFallback: '',
      utmOn: false,
      utmSource: '',
      utmMedium: '',
      utmCampaign: '',
      html: '',
      plainText: '',
      hasEditorSchema: false,
    }),
  );
  return [
    ...new Set([
      ...save,
      ...createPayloadKeys(),
      ...clonePayloadKeys(),
      ...editorSavePayloadKeys(),
    ]),
  ].sort();
}

/**
 * The comparison itself, as a function, so the self-tests can drive it with
 * synthetic input. A guard whose logic can only be exercised by editing the
 * real schema is a guard nobody checks.
 */
function unclassified(apiFields: string[], webFields: string[], decided: string[]): string[] {
  return apiFields.filter((f) => !webFields.includes(f) && !decided.includes(f));
}

function decisionsWithoutAReason(decisions: FieldDecision[]): string[] {
  return decisions.filter((d) => d.reason.trim().length === 0).map((d) => d.field);
}

const API_FIELDS = Object.keys(createSchema.shape).sort();
const WEB_FIELDS = fieldsTheWebSends();
const DECISIONS = [...API_ONLY, ...KNOWN_GAPS];

describe('matcher self-test', () => {
  it('both sides are non-empty and are the real thing', () => {
    // If either side ever came back empty the guard would pass vacuously,
    // which is how a scan test in this repo went green six times.
    expect(API_FIELDS.length).toBeGreaterThan(10);
    expect(WEB_FIELDS.length).toBeGreaterThan(10);
    // Anchors on both sides, so an import resolving to something else fails.
    expect(API_FIELDS).toContain('utmTracking');
    expect(API_FIELDS).toContain('configurationSet');
    expect(WEB_FIELDS).toContain('abConfig');
    expect(WEB_FIELDS).toContain('segmentId');
  });

  it('the comparison really reports a field that nobody claims', () => {
    expect(unclassified(['a', 'b'], ['a'], ['b'])).toEqual([]);
    expect(unclassified(['a', 'b', 'c'], ['a'], ['b'])).toEqual(['c']);
    // ...and does not report one that is claimed twice.
    expect(unclassified(['a'], ['a'], ['a'])).toEqual([]);
  });

  it('the reason check really rejects a blank one', () => {
    expect(decisionsWithoutAReason([{ field: 'x', reason: 'because' }])).toEqual([]);
    expect(decisionsWithoutAReason([{ field: 'x', reason: '' }])).toEqual(['x']);
    expect(decisionsWithoutAReason([{ field: 'x', reason: '   \n\t ' }])).toEqual(['x']);
  });

  it('createPayloadKeys reports the sender fields the email branch spreads in', () => {
    // buildCreatePayload hides them behind `type === 'email'`; if that helper
    // ever stopped calling it with 'email', four fields would silently drop
    // out of the web side and this guard would start flagging them.
    for (const f of ['subject', 'preheader', 'fromName', 'fromEmail']) {
      expect(createPayloadKeys()).toContain(f);
    }
  });
});

describe('campaign settings: every field is claimed by somebody', () => {
  it('createSchema and updateSchema describe the same fields', () => {
    // updateSchema is createSchema.partial() today. If that ever stops being
    // true, one side could grow a field this guard never looks at.
    expect(Object.keys(updateSchema.shape).sort()).toEqual(API_FIELDS);
  });

  it('no field of createSchema is unreachable and undocumented', () => {
    const orphans = unclassified(
      API_FIELDS,
      WEB_FIELDS,
      DECISIONS.map((d) => d.field),
    );
    expect(
      orphans,
      `These campaign settings can be set through the API and by nothing in the product, and no ` +
        `decision has been recorded about them: ${orphans.join(', ')}. Either give them a control ` +
        `in the campaign form (and they will be picked up here automatically, because the web side ` +
        `is read off the payload builders), or add them to API_ONLY / KNOWN_GAPS in this file with ` +
        `a reason.`,
    ).toEqual([]);
  });

  it('every recorded decision carries a reason', () => {
    // Without this the exclusion list degenerates into the silence it exists
    // to replace: a field name and nothing said about it.
    expect(decisionsWithoutAReason(DECISIONS)).toEqual([]);
  });

  it('no decision names a field the product already sets', () => {
    // A stale exclusion is worse than none: it would absorb a control being
    // deleted. `type` is the live example — it looks API-only and is not.
    const stale = DECISIONS.filter((d) => WEB_FIELDS.includes(d.field)).map((d) => d.field);
    expect(
      stale,
      `Recorded as API-only or a known gap, but the product does send them: ${stale.join(', ')}.`,
    ).toEqual([]);
  });

  it('no decision names a field createSchema no longer has', () => {
    const gone = DECISIONS.filter((d) => !API_FIELDS.includes(d.field)).map((d) => d.field);
    expect(gone, `Recorded here but not in createSchema any more: ${gone.join(', ')}.`).toEqual([]);
  });

  it('no field is recorded as both a decision and a gap', () => {
    const both = API_ONLY.filter((a) => KNOWN_GAPS.some((g) => g.field === a.field)).map(
      (a) => a.field,
    );
    expect(both).toEqual([]);
  });

  it('the web sends nothing createSchema would reject', () => {
    // The other direction. A key the route does not know is dropped by zod
    // without a word, so the control would look like it worked.
    const unknown = WEB_FIELDS.filter((f) => !API_FIELDS.includes(f));
    expect(
      unknown,
      `Sent by the product, not accepted by the route: ${unknown.join(', ')}.`,
    ).toEqual([]);
  });
});
