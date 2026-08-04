/**
 * Mail settings (SendGrid Mail Settings parity) — org-wide sending defaults
 * stored under organizations.settings.mailSettings.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { organizations } from '../../db/schema/index.js';

export interface MailFooterSettings {
  enabled: boolean;
  html: string;
  text: string;
}

export interface MailSettings {
  /** Custom footer appended to every outgoing email. */
  footer: MailFooterSettings;
  /** Default open-tracking when a send doesn't specify. */
  openTracking: boolean;
  /** Default click-tracking when a send doesn't specify. */
  clickTracking: boolean;
  /** Default subscription-tracking (List-Unsubscribe injection). */
  subscriptionTracking: boolean;
}

export const DEFAULT_MAIL_SETTINGS: MailSettings = {
  footer: { enabled: false, html: '', text: '' },
  openTracking: true,
  clickTracking: true,
  subscriptionTracking: true,
};

/**
 * Pure: merge a stored (possibly partial / legacy) settings blob onto the
 * defaults so callers always get a fully-populated object.
 */
export function mergeMailSettings(raw: unknown): MailSettings {
  const r = (raw ?? {}) as Partial<MailSettings> & { footer?: Partial<MailFooterSettings> };
  return {
    footer: {
      enabled: r.footer?.enabled ?? DEFAULT_MAIL_SETTINGS.footer.enabled,
      html: r.footer?.html ?? DEFAULT_MAIL_SETTINGS.footer.html,
      text: r.footer?.text ?? DEFAULT_MAIL_SETTINGS.footer.text,
    },
    openTracking: r.openTracking ?? DEFAULT_MAIL_SETTINGS.openTracking,
    clickTracking: r.clickTracking ?? DEFAULT_MAIL_SETTINGS.clickTracking,
    subscriptionTracking: r.subscriptionTracking ?? DEFAULT_MAIL_SETTINGS.subscriptionTracking,
  };
}

export async function getMailSettings(orgId: string): Promise<MailSettings> {
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return mergeMailSettings((org?.settings as { mailSettings?: unknown } | undefined)?.mailSettings);
}

export type MailSettingsPatch = Partial<Omit<MailSettings, 'footer'>> & {
  footer?: Partial<MailFooterSettings>;
};

export async function updateMailSettings(
  orgId: string,
  patch: MailSettingsPatch,
): Promise<MailSettings> {
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const current = mergeMailSettings(
    (org?.settings as { mailSettings?: unknown } | undefined)?.mailSettings,
  );
  const next = mergeMailSettings({
    ...current,
    ...patch,
    footer: { ...current.footer, ...patch.footer },
  });

  const settings = { ...((org?.settings as Record<string, unknown>) ?? {}), mailSettings: next };
  await db.update(organizations).set({ settings }).where(eq(organizations.id, orgId));
  return next;
}
