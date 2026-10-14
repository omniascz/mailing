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

export type ContactStatus = 'active' | 'unsubscribed' | 'bounced' | 'complained' | 'pending';

/**
 * The contact statuses that get no marketing e-mail, whatever the suppression
 * list says: they opted out, the address bounced, they complained, or they
 * have not confirmed the double opt-in yet (no consent, zákon 480/2004 Sb.).
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
