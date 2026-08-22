/**
 * Server-only half of the capability lookup.
 *
 * Kept apart from lib/capabilities.ts because that one is imported by client
 * components (the sidebar, the command palette) and this one reaches for
 * apiFetch, which uses next/headers. Importing the two together pulled
 * next/headers into the browser bundle and broke the build — the reason this
 * split exists rather than a preference.
 */
import { apiFetch } from './api';
import { NOTHING_AVAILABLE, type Capabilities } from './capabilities';

export async function getCapabilities(): Promise<Capabilities> {
  return apiFetch<Capabilities>('/api/v1/capabilities', { fallback: NOTHING_AVAILABLE });
}
