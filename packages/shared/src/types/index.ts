// Common types used across all packages

export interface PaginatedResult<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
  total: number;
}

export interface AppError {
  code: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
}

export type UserRole = 'owner' | 'admin' | 'editor' | 'viewer' | 'system_admin';

/** Every value of the contact_status enum (apps/api db/schema/enums.ts). */
export type ContactStatus =
  | 'active'
  | 'unsubscribed'
  | 'bounced'
  | 'complained'
  | 'pending'
  | 'non_subscribed'
  | 'archived';

/**
 * The contact statuses that get no marketing e-mail, whatever the suppression
 * list says: they opted out, the address bounced, they complained, they have
 * not confirmed the double opt-in yet (no consent, zákon 480/2004 Sb.), or
 * they were archived.
 *
 * 'archived' is "Removed from marketing" in the enum, and every campaign
 * audience already leaves it out (listAudienceWhere,
 * services/campaigns/auto-resend.ts). A flow e-mail still reached it, on the
 * inline branch of the dispatch and on the template branch alike (measured,
 * Z152 MIMO 1); listing it here closes both. Z153.
 *
 * 'non_subscribed' is deliberately NOT here, although the campaign audience
 * leaves it out too: whether a flow may mail it waits on the owner's decision
 * about § 7(3) zákona 480/2004 Sb. Until then it gets what it got.
 *
 * One list for both readers: the workers batch-sender (every broadcast and
 * triggered send) and the API's inline-HTML branch of the workflow dispatch
 * (routes/v1/internal/workflow-dispatch.ts), which sends a flow's e-mail on
 * the transactional stream and so never meets the batch-sender's check (Z152).
 */
export const MARKETING_REFUSED_CONTACT_STATUSES: readonly ContactStatus[] = [
  'unsubscribed',
  'bounced',
  'complained',
  'pending',
  'archived',
];

/** Does this contact status refuse marketing e-mail (MARKETING_REFUSED_CONTACT_STATUSES)? */
export function refusesMarketing(status: string | null | undefined): boolean {
  return (MARKETING_REFUSED_CONTACT_STATUSES as readonly string[]).includes(status ?? '');
}

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled';

export type PhoneType = 'mobile' | 'landline' | 'voip' | 'unknown';

export type PhoneStatus = 'active' | 'inactive' | 'unknown' | 'invalid';

export interface PhoneInfo {
  country: string;
  countryCode: string;
  type: PhoneType;
  originalOperator: string | null;
  region: string | null;
  district: string | null;
  isValid: boolean;
}
