/**
 * Inbox-preview provider interface (Sprint E.8).
 *
 * Two real providers in scope — Litmus and Email on Acid — and a mock used
 * by tests / dev. The shape is intentionally narrow: kick off a render,
 * later ask whether it's done. Polling beats per-provider webhook plumbing
 * for an MVP because each vendor uses a different signing scheme and the
 * "done in 30–90 seconds" SLA makes polling cheap.
 */

export interface PreviewClient {
  /** Provider-specific client identifier (e.g. "gmailapp_chrome"). */
  id: string;
  /** Human label ("Gmail (Chrome)"). */
  label: string;
  /** "desktop" | "mobile" | "webmail" */
  category: 'desktop' | 'mobile' | 'webmail';
}

export interface PreviewResult {
  client: string;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  /**
   * True when this render was not produced by a rendering service.
   *
   * Reaching the mock now takes INBOX_PREVIEW_PROVIDER=mock — createPreviewJob
   * refuses with 501 when nothing is configured, so nobody gets it by accident
   * any more. What was still wrong is what opting in returns: status
   * 'completed' and image URLs on preview.mock.local, a domain that does not
   * resolve. The screen showed three broken images and said nothing, which is
   * indistinguishable from a real render that failed to load.
   */
  simulated?: boolean;
}

export interface PreviewProvider {
  readonly name: string;
  /** Static list of clients the provider supports. */
  listClients(): PreviewClient[];
  /** Submit a render job — returns the provider's own job id. */
  startJob(input: {
    html: string;
    subject?: string;
    clients: string[];
  }): Promise<{ providerJobId: string }>;
  /** Poll a job's state. Mock returns instantly; Litmus/EoA polled by a worker. */
  pollJob(providerJobId: string): Promise<{
    status: 'pending' | 'running' | 'completed' | 'failed';
    results?: PreviewResult[];
    error?: string;
  }>;
}

/**
 * Mock provider — used in dev + tests. Returns a static "completed" set
 * of fake preview URLs immediately. Lets the API surface be exercised
 * without burning Litmus credits on each pnpm dev restart.
 */
export const mockProvider: PreviewProvider = {
  name: 'mock',
  listClients() {
    return [
      { id: 'gmail_chrome', label: 'Gmail (Chrome)', category: 'webmail' },
      { id: 'outlook_2021', label: 'Outlook 2021', category: 'desktop' },
      { id: 'apple_mail', label: 'Apple Mail', category: 'desktop' },
      { id: 'iphone_ios17', label: 'iPhone (iOS 17)', category: 'mobile' },
      { id: 'android_gmail', label: 'Android Gmail', category: 'mobile' },
    ];
  },
  async startJob(input) {
    return { providerJobId: `mock-${Date.now()}-${input.clients.length}` };
  },
  async pollJob(providerJobId) {
    // Mock always resolves instantly with deterministic URLs derived from
    // the provider job id so consumers can verify download flows.
    const clients = ['gmail_chrome', 'outlook_2021', 'apple_mail'];
    return {
      status: 'completed',
      results: clients.map((c) => ({
        client: c,
        url: `https://preview.mock.local/${encodeURIComponent(providerJobId)}/${c}.png`,
        thumbnailUrl: `https://preview.mock.local/${encodeURIComponent(providerJobId)}/${c}_thumb.png`,
        width: 600,
        height: 800,
        simulated: true,
      })),
    };
  },
};

/**
 * Litmus provider — thin REST wrapper. Doesn't run in tests; only
 * exercised when LITMUS_API_KEY is set and the org has it on their plan.
 *
 * Litmus API surface used:
 *   POST   /v1/emails                   create an email
 *   POST   /v1/emails/{id}/email_tests  trigger renders against client list
 *   GET    /v1/email_tests/{id}         poll status
 */
export function createLitmusProvider(apiKey: string): PreviewProvider {
  const auth = 'Basic ' + Buffer.from(`${apiKey}:`).toString('base64');
  const base = 'https://litmus.com/api/v1';

  async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: auth, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`Litmus ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  return {
    name: 'litmus',
    listClients() {
      // Litmus has ~90 clients; we expose the popular subset. Full list
      // can be fetched lazily from /v1/clients on demand.
      return [
        { id: 'gmailnew', label: 'Gmail (new)', category: 'webmail' },
        { id: 'gmailnewchromemac', label: 'Gmail (Chrome, macOS)', category: 'webmail' },
        { id: 'outlook2021win', label: 'Outlook 2021 (Windows)', category: 'desktop' },
        { id: 'outlookmac2019', label: 'Outlook 2019 (macOS)', category: 'desktop' },
        { id: 'appmail16', label: 'Apple Mail 16', category: 'desktop' },
        { id: 'iphone15', label: 'iPhone 15', category: 'mobile' },
        { id: 'androidgmailapp', label: 'Gmail (Android)', category: 'mobile' },
        { id: 'yahoo', label: 'Yahoo Mail', category: 'webmail' },
        { id: 'outlookcom', label: 'Outlook.com', category: 'webmail' },
      ];
    },
    async startJob({ html, subject, clients }) {
      const email = await fetchJson<{ id: string }>(`${base}/emails`, {
        method: 'POST',
        body: JSON.stringify({ html_body: html, subject: subject ?? '' }),
      });
      const test = await fetchJson<{ id: string }>(`${base}/emails/${email.id}/email_tests`, {
        method: 'POST',
        body: JSON.stringify({ applications: clients }),
      });
      return { providerJobId: test.id };
    },
    async pollJob(providerJobId) {
      const data = await fetchJson<{
        state: string;
        test_result_clients?: Array<{
          application_id: string;
          state: string;
          screenshot_url?: string;
          thumb_url?: string;
        }>;
      }>(`${base}/email_tests/${providerJobId}`);

      const allDone =
        data.state === 'complete' ||
        (data.test_result_clients ?? []).every(
          (c) => c.state === 'completed' || c.state === 'failed',
        );

      const results: PreviewResult[] = (data.test_result_clients ?? [])
        .filter((c) => c.screenshot_url)
        .map((c) => ({
          client: c.application_id,
          url: c.screenshot_url!,
          thumbnailUrl: c.thumb_url,
        }));

      if (allDone) return { status: 'completed', results };
      return { status: 'running', results };
    },
  };
}

/**
 * Resolve which provider to use. Order: explicit override, env API key,
 * fallback to mock. Test code can monkey-patch this module to force one.
 */
export function selectProvider(): PreviewProvider {
  if (process.env.INBOX_PREVIEW_PROVIDER === 'mock') return mockProvider;
  if (process.env.LITMUS_API_KEY) return createLitmusProvider(process.env.LITMUS_API_KEY);
  return mockProvider;
}
