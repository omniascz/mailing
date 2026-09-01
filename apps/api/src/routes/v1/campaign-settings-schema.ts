/**
 * The settings a caller may put on a campaign, as one importable object.
 *
 * Lifted out of routes/v1/campaigns.ts unchanged. It has no imports but zod,
 * which is the whole point: the campaign-field guard in apps/web reads
 * `createSchema.shape` at RUNTIME to find out what the API accepts, and it
 * could not do that from a module that drags the database client and the
 * campaign services in behind it.
 *
 * Reading the keys rather than grepping for them is deliberate. The #117 probe
 * grepped for a literal route string, missed a caller that composed the URL,
 * and reported a feature as missing that had shipped. A guard built the same
 * way inherits the same blind spot.
 */

import { z } from 'zod';

export const campaignTypes = ['email', 'sms', 'whatsapp', 'push', 'voice'] as const;

/**
 * A UTM value is going into a URL and then into a GA report. Length-bounded
 * and stripped of the characters that would need escaping in either.
 */
export const utmValue = z
  .string()
  .max(120)
  .regex(/^[^\s?#&=]*$/, 'must not contain spaces or URL separators (? # & =)');

export const utmSettingsSchema = z.object({
  enabled: z.boolean(),
  source: utmValue.optional(),
  medium: utmValue.optional(),
  campaign: utmValue.optional(),
  content: utmValue.optional(),
  term: utmValue.optional(),
});

/**
 * Time-warp settings a campaign can carry.
 *
 * `localHour` is the hour in the RECIPIENT's timezone, which is the whole
 * point: 9 means nine in the morning wherever they are, not nine at the
 * sender's desk. The remaining fields have worker-side defaults and are here
 * so an org can override them; `baseDate` is deliberately absent — it is the
 * campaign's own send time and is filled in at dispatch, not by the caller.
 */
export const timewarpSettingsSchema = z.object({
  enabled: z.boolean(),
  localHour: z.number().int().min(0).max(23),
  /** IANA zone for contacts whose timezone is unknown. */
  fallbackTimezone: z.string().min(1).max(64).optional(),
  skipHolidays: z.boolean().optional(),
  holidayCountry: z.enum(['cz', 'sk']).optional(),
});

export const createSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(campaignTypes).optional(),
  subject: z.string().max(255).optional(),
  preheader: z.string().max(255).optional(),
  fromName: z.string().max(100).optional(),
  fromEmail: z.string().email().optional(),
  replyTo: z.string().email().optional(),
  templateId: z.string().uuid().optional(),
  // Explicit language for a campaign written from scratch. Omitted, it is
  // inherited from the template, and failing that it is English.
  locale: z.enum(['en', 'cs', 'sk']).optional(),
  content: z.record(z.unknown()).optional(),
  listId: z.string().uuid().optional(),
  segmentId: z.string().uuid().optional(),
  excludeSegmentId: z.string().uuid().optional(),
  abConfig: z.record(z.unknown()).optional(),
  // UTM auto-append. The column has existed since the campaigns table was
  // written; until now no route could set it, so the whole feature — schema,
  // dispatch, splitter, batch-sender, renderer — was unreachable.
  utmTracking: utmSettingsSchema.optional(),
  // Time-warp. Same story as utmTracking one line up: the column, the
  // splitter, the batch-sender and both scheduler endpoints were all built and
  // no route could set it, so nobody could switch it on.
  timewarp: timewarpSettingsSchema.optional(),
  configurationSet: z.string().max(128).optional(),
  category: z.string().max(128).optional(),
  scheduledAt: z.string().datetime().optional(),
  timezone: z.string().max(100).optional(),
});

export const updateSchema = createSchema.partial();
