/**
 * Smart scheduling slots (#211)
 *
 * Selects the best available meeting slots for a recipient based on:
 *   1. Recipient's inferred timezone (from contact.country / contact.customFields.timezone)
 *   2. Sender's calendar availability (injected as a simple availability window)
 *   3. Business-hours heuristic (Mon–Fri 09:00–17:00 recipient local time)
 *
 * In production, the calendar availability would come from Google Calendar / Outlook.
 * For now we generate synthetic slots that respect the recipient's business hours.
 */

export interface CalendarSlot {
  /** ISO 8601 UTC datetime string */
  startUtc: string;
  /** ISO 8601 UTC datetime string */
  endUtc: string;
  /** Human-readable in recipient's local time */
  localDisplay: string;
  /** IANA timezone */
  timezone: string;
}

export interface SmartSlotInput {
  /** Rep's email — would be used to fetch calendar availability */
  repEmail: string;
  /** Rep's configured availability: 0–23 hour range (UTC) */
  availabilityWindowUtc?: { startHour: number; endHour: number };
  /** Contact's IANA timezone (e.g. 'Europe/Prague') */
  contactTimezone?: string;
  /** ISO date to start searching from (default: tomorrow) */
  fromDate?: string;
  /** Number of slots to return (default: 3) */
  count?: number;
  /** Meeting duration in minutes (default: 30) */
  durationMinutes?: number;
}

/**
 * Map of country codes to IANA timezones (common subset).
 */
const COUNTRY_TZ: Record<string, string> = {
  CZ: 'Europe/Prague',
  SK: 'Europe/Bratislava',
  PL: 'Europe/Warsaw',
  DE: 'Europe/Berlin',
  AT: 'Europe/Vienna',
  GB: 'Europe/London',
  US: 'America/New_York',
  FR: 'Europe/Paris',
  NL: 'Europe/Amsterdam',
  ES: 'Europe/Madrid',
  IT: 'Europe/Rome',
};

export function inferTimezone(contact: {
  country?: string | null;
  customFields?: Record<string, unknown>;
}): string {
  const explicit = contact.customFields?.['timezone'];
  if (typeof explicit === 'string' && explicit) return explicit;
  if (contact.country) return COUNTRY_TZ[contact.country] ?? 'UTC';
  return 'UTC';
}

/**
 * Generate N smart meeting slots for a contact.
 *
 * Strategy:
 *   - Start from tomorrow (or `fromDate`)
 *   - Skip weekends in recipient's local time
 *   - Propose slots at 10:00, 14:00, 16:00 local time
 *   - Filter by rep's UTC availability window
 */
export function getSmartSlots(input: SmartSlotInput): CalendarSlot[] {
  const {
    availabilityWindowUtc = { startHour: 8, endHour: 18 },
    contactTimezone = 'UTC',
    count = 3,
    durationMinutes = 30,
  } = input;

  const slots: CalendarSlot[] = [];
  // Preferred local hours for meeting proposals
  const preferredLocalHours = [10, 14, 16];

  // Start from tomorrow
  const from = input.fromDate ? new Date(input.fromDate) : new Date();
  from.setDate(from.getDate() + 1);
  from.setHours(0, 0, 0, 0);

  let candidate = new Date(from);
  let attempts = 0;

  while (slots.length < count && attempts < 60) {
    attempts++;

    // Get local day-of-week (0=Sun, 6=Sat) in contact's timezone
    const localDayStr = candidate.toLocaleDateString('en-US', {
      weekday: 'short',
      timeZone: contactTimezone,
    });
    const isWeekend = localDayStr === 'Sat' || localDayStr === 'Sun';

    if (!isWeekend) {
      // Get the local date string in the contact's timezone
      const localDateStr = candidate.toLocaleDateString('en-CA', { timeZone: contactTimezone }); // YYYY-MM-DD

      for (const localHour of preferredLocalHours) {
        if (slots.length >= count) break;

        // Build a local datetime string and convert to UTC
        // Convert local → UTC using Intl
        const utcMs = localDtToUtcMs(localDateStr, localHour, contactTimezone);
        if (utcMs === null) continue;

        const startUtc = new Date(utcMs);
        const endUtc = new Date(utcMs + durationMinutes * 60_000);

        // Check rep's UTC availability
        const utcHour = startUtc.getUTCHours();
        if (utcHour < availabilityWindowUtc.startHour || utcHour >= availabilityWindowUtc.endHour) {
          continue;
        }

        // Build display string in contact's timezone
        const localDisplay = startUtc.toLocaleString('en-US', {
          timeZone: contactTimezone,
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        slots.push({
          startUtc: startUtc.toISOString(),
          endUtc: endUtc.toISOString(),
          localDisplay,
          timezone: contactTimezone,
        });
      }
    }

    // Move to next day
    candidate = new Date(candidate);
    candidate.setDate(candidate.getDate() + 1);
  }

  return slots;
}

/**
 * Converts a local date + hour to UTC milliseconds using Intl.DateTimeFormat.
 * Returns null if conversion fails.
 */
function localDtToUtcMs(dateStr: string, hour: number, tz: string): number | null {
  try {
    // Create a date in the given timezone by formatting a UTC date and comparing
    // We construct the candidate UTC time iteratively
    // Simple approach: use the offset from the timezone
    const testDate = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00Z`);

    // Get what local time this UTC timestamp corresponds to in the target tz
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(testDate);

    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
    const localHourActual = parseInt(get('hour'), 10);

    // Compute offset: desired local hour - actual local hour
    const offsetHours = hour - localHourActual;
    return testDate.getTime() - offsetHours * 3_600_000;
  } catch {
    return null;
  }
}
