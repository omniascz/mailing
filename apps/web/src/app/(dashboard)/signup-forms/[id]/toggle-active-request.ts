/**
 * The request the Pause/Resume button sends, as data.
 *
 * Pure and dependency-free so the API's integration suite can import it and
 * send exactly this against the real route (see
 * apps/api/src/integration/signup-form-toggle.integration.test.ts).
 */
export function toggleActiveRequest(formId: string, active: boolean) {
  return {
    method: 'PUT' as const,
    path: `/api/v1/signup-forms/${formId}`,
    body: { active: !active },
  };
}
