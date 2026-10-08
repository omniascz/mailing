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

/**
 * Every value of the contact_status enum, so the form can show the status the
 * contact actually has. It used to list five; for the other two
 * (non_subscribed, archived) it showed 'active' — and sent it.
 */
export const CONTACT_STATUSES = [
  'active',
  'unsubscribed',
  'bounced',
  'complained',
  'pending',
  'non_subscribed',
  'archived',
] as const;

export interface ApiRequest {
  method: 'PUT' | 'POST';
  path: string;
  body: Record<string, unknown>;
}

/** What the contact is now, as loaded into the form. */
export interface ContactEditCurrent {
  status: string;
  lifecycleStage: string | null;
}

/**
 * The form's starting values: the contact as it is. The status in particular
 * is the contact's own — the form used to start at 'active' for any status it
 * did not list.
 */
export function initialContactForm(contact: {
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  status: string;
  lifecycleStage: string | null;
}): ContactEditForm {
  return {
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    firstName: contact.firstName ?? '',
    lastName: contact.lastName ?? '',
    status: contact.status,
    lifecycleStage: contact.lifecycleStage ?? '',
  };
}

export function buildContactEditRequests(
  contactId: string,
  current: ContactEditCurrent,
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
        // Only a status the person changed. Saving a name is not a decision
        // about consent: this used to send the form's status on every save, so
        // a non_subscribed contact opened and saved came back 'active' (Z114).
        ...(form.status !== current.status ? { status: form.status } : {}),
      },
    },
  ];

  if (form.lifecycleStage && form.lifecycleStage !== current.lifecycleStage) {
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
