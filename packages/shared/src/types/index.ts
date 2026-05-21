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
