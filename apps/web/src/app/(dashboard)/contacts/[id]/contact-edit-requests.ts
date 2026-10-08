/**
 * The requests the contact editor sends, as data.
 *
 * Pure and dependency-free on purpose: the API's integration suite imports
 * this file and sends exactly what it returns against the real routes, so the
 * form and the API cannot drift apart unseen again.
 *
 * Why two requests. The editor used to put `lifecycleStage` into the PUT body.
 * PUT /api/v1/contacts/:id does not read it — zod strips unknown keys — so the
 * change was dropped and the form said "Contact updated" (probe Z112). The
 * stage has its own route, POST /api/v1/contacts/:id/lifecycle, and that route
 * is the one that records the transition in lifecycle_stage_history and fires
 * the lifecycle_stage_changed workflows. Writing the column through PUT would
 * have skipped both, so the stage goes there, and only when it changed (the
 * route refuses a no-op transition).
 */

/**
 * The stages the API accepts — the lifecycle_stage enum. The form used to
 * offer 'mql' and 'sql', which are not values of it, and lacked 'opportunity'.
 */
export const LIFECYCLE_STAGES = [
  'subscriber',
  'lead',
  'marketing_qualified_lead',
  'sales_qualified_lead',
  'opportunity',
  'customer',
  'evangelist',
  'other',
] as const;

export interface ContactEditForm {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  status: string;
  /** '' when the form has no stage selected. */
  lifecycleStage: string;
}

export interface ApiRequest {
  method: 'PUT' | 'POST';
  path: string;
  body: Record<string, unknown>;
}

export function buildContactEditRequests(
  contactId: string,
  currentStage: string | null,
  form: ContactEditForm,
): ApiRequest[] {
  const requests: ApiRequest[] = [
    {
      method: 'PUT',
      path: `/api/v1/contacts/${contactId}`,
      body: {
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        status: form.status,
      },
    },
  ];

  if (form.lifecycleStage && form.lifecycleStage !== currentStage) {
    requests.push({
      method: 'POST',
      path: `/api/v1/contacts/${contactId}/lifecycle`,
      // A person editing the contact picked this stage on purpose, so moving
      // back down the pipeline is allowed — the route refuses it otherwise.
      body: { toStage: form.lifecycleStage, allowDowngrade: true },
    });
  }

  return requests;
}
