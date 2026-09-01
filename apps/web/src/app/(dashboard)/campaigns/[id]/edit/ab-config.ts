/**
 * Turning what the A/B form holds into the `abConfig` the API stores.
 *
 * Kept out of the component on purpose: `environment: 'node'` has no DOM, so a
 * client component can be rendered but not driven. Everything that can be got
 * wrong — the percentages, the holdback, the per-variant content snapshot —
 * lives here, where a test can call it directly.
 *
 * The route takes `abConfig: z.record(z.unknown())` and validates NOTHING
 * inside it. The only server-side check is assertAbConfigCanFinish, at the
 * click on Send, and it covers exactly one case: a holdback with no test
 * duration. Every other rule below is this form's alone, which is why they are
 * mirrored here from the code that consumes them rather than invented:
 *
 *   - fewer than 2 variants is not an A/B test — campaign-splitter.ts
 *     parseAbConfig returns null and the campaign sends as an ordinary one
 *   - the splitter passes `subject: variant.subject` straight to the batch, so
 *     an empty subject sends an email with no subject line
 *   - it passes `content: variant.content` with no fallback, so a variant
 *     without content sends a batch with nothing in it
 */

/** One variant as the form holds it — percentages are text until submit. */
export interface AbVariantDraft {
  id: string;
  subject: string;
  percentage: string;
}

export interface AbFormState {
  variants: AbVariantDraft[];
  testDurationHours: string;
  winnerCriteria: 'click_rate' | 'open_rate';
  autoSendWinner: boolean;
  confidenceThreshold: string;
}

export interface AbConfigPayload {
  variants: {
    id: string;
    subject: string;
    content: Record<string, unknown>;
    percentage: number;
  }[];
  winnerCriteria: 'click_rate' | 'open_rate';
  testDurationHours?: number;
  autoSendWinner: boolean;
  confidenceThreshold: number;
}

export type BuildResult = { ok: true; config: AbConfigPayload } | { ok: false; error: string };

/**
 * The value that means "this campaign is not an A/B test".
 *
 * NOT null: the route's schema is `z.record(z.unknown()).optional()`, which
 * rejects null outright, and omitting the key leaves whatever is stored in
 * place — so switching the test off by not sending it would not switch it off.
 * An empty object is what both readers already treat as "no test":
 * parseAbConfig wants an array of at least two, assertAbConfigCanFinish returns
 * early on it.
 */
export const AB_OFF: Record<string, unknown> = {};

export function totalVariantPercentage(variants: { percentage: string }[]): number {
  return variants.reduce((sum, v) => sum + (Number(v.percentage) || 0), 0);
}

export function holdbackPercentage(variants: { percentage: string }[]): number {
  return Math.max(0, 100 - totalVariantPercentage(variants));
}

/**
 * @param content the campaign's own body, copied into every variant.
 *
 * A subject-line test is the only kind this form builds, so every variant
 * carries the same body — but it has to carry it explicitly, because the
 * splitter has no fallback to the campaign's content. The snapshot is taken
 * fresh on every save of this form, which is also the only way it stays
 * current when the body is edited in the visual editor instead.
 */
export function buildAbConfig(state: AbFormState, content: Record<string, unknown>): BuildResult {
  const variants = state.variants;

  if (variants.length < 2) {
    return { ok: false, error: 'An A/B test needs at least two variants.' };
  }

  const ids = new Set<string>();
  for (const [i, v] of variants.entries()) {
    const id = v.id.trim();
    if (!id) return { ok: false, error: `Variant ${i + 1} has no id.` };
    if (ids.has(id)) return { ok: false, error: `Two variants share the id "${id}".` };
    ids.add(id);

    if (!v.subject.trim()) {
      return {
        ok: false,
        error: `Variant ${id} has no subject line. That is the thing being tested — it cannot be blank.`,
      };
    }

    const pct = Number(v.percentage);
    if (!Number.isFinite(pct) || pct <= 0) {
      return { ok: false, error: `Variant ${id} needs a share of the audience above zero.` };
    }
  }

  const total = totalVariantPercentage(variants);
  if (total > 100) {
    return {
      ok: false,
      error: `The variants add up to ${total}% of the audience. They cannot exceed 100%.`,
    };
  }

  const holdback = 100 - total;
  const hours = Number(state.testDurationHours);
  if (holdback > 0 && (!Number.isFinite(hours) || hours <= 0)) {
    return {
      ok: false,
      error:
        `This test holds ${holdback}% of the audience back for the winner, so it has to say ` +
        'how long to wait before picking one. Set a test duration, or raise the variant shares ' +
        'to 100% so there is no holdback.',
    };
  }

  const threshold = Number(state.confidenceThreshold);

  return {
    ok: true,
    config: {
      variants: variants.map((v) => ({
        id: v.id.trim(),
        subject: v.subject.trim(),
        content,
        percentage: Number(v.percentage),
      })),
      winnerCriteria: state.winnerCriteria,
      // Omitted rather than sent as 0 when the whole audience is in the test:
      // there is no holdback to wait for and no winner to dispatch.
      ...(holdback > 0 ? { testDurationHours: hours } : {}),
      autoSendWinner: state.autoSendWinner,
      confidenceThreshold: Number.isFinite(threshold) ? threshold : 95,
    },
  };
}

/** Read a stored abConfig back into the form's shape. */
export function abFormStateFrom(stored: unknown): AbFormState | null {
  const cfg = stored as
    | {
        variants?: { id?: unknown; subject?: unknown; percentage?: unknown }[];
        winnerCriteria?: unknown;
        testDurationHours?: unknown;
        autoSendWinner?: unknown;
        confidenceThreshold?: unknown;
      }
    | null
    | undefined;
  if (!cfg || !Array.isArray(cfg.variants) || cfg.variants.length < 2) return null;

  return {
    variants: cfg.variants.map((v, i) => ({
      id: typeof v?.id === 'string' && v.id ? v.id : String.fromCharCode(97 + i),
      subject: typeof v?.subject === 'string' ? v.subject : '',
      percentage: String(Number(v?.percentage) || 0),
    })),
    winnerCriteria: cfg.winnerCriteria === 'open_rate' ? 'open_rate' : 'click_rate',
    testDurationHours: cfg.testDurationHours ? String(cfg.testDurationHours) : '',
    autoSendWinner: cfg.autoSendWinner !== false,
    confidenceThreshold: cfg.confidenceThreshold ? String(cfg.confidenceThreshold) : '95',
  };
}

/** Two variants at a tenth of the audience each, decided after four hours. */
export function defaultAbFormState(): AbFormState {
  return {
    variants: [
      { id: 'a', subject: '', percentage: '10' },
      { id: 'b', subject: '', percentage: '10' },
    ],
    winnerCriteria: 'click_rate',
    testDurationHours: '4',
    autoSendWinner: true,
    confidenceThreshold: '95',
  };
}
