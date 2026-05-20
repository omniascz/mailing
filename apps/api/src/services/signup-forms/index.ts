/**
 * Signup form service (task 6.5).
 *
 * Handles form CRUD, JavaScript embed snippet generation,
 * and public form submissions (contact upsert + list add + workflow trigger).
 */

import { and, eq, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  signupForms,
  signupFormSubmissions,
  signupFormVariants,
  contacts,
  type SignupForm,
  type SignupFormVariant,
  type FormField,
  type FormConfig,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createSignupForm(
  orgId: string,
  data: {
    name: string;
    listId?: string;
    fields?: FormField[];
    embedType?: 'inline' | 'popup' | 'slide' | 'floating';
    config?: FormConfig;
  },
): Promise<SignupForm> {
  const [form] = await db
    .insert(signupForms)
    .values({
      orgId,
      listId: data.listId,
      name: data.name,
      fields: data.fields ?? defaultFields(),
      embedType: data.embedType ?? 'inline',
      config: data.config ?? {},
    })
    .returning();
  return form!;
}

export async function getSignupForm(id: string, orgId: string): Promise<SignupForm> {
  const [form] = await db
    .select()
    .from(signupForms)
    .where(and(eq(signupForms.id, id), eq(signupForms.orgId, orgId)))
    .limit(1);

  if (!form) throw AppError.notFound('SignupForm');
  return form;
}

export async function listSignupForms(orgId: string): Promise<SignupForm[]> {
  return db
    .select()
    .from(signupForms)
    .where(eq(signupForms.orgId, orgId))
    .orderBy(desc(signupForms.createdAt));
}

export async function updateSignupForm(
  id: string,
  orgId: string,
  data: Partial<{
    name: string;
    listId: string | null;
    fields: FormField[];
    embedType: 'inline' | 'popup' | 'slide' | 'floating';
    config: FormConfig;
    active: boolean;
  }>,
): Promise<SignupForm> {
  const [form] = await db
    .update(signupForms)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(signupForms.id, id), eq(signupForms.orgId, orgId)))
    .returning();

  if (!form) throw AppError.notFound('SignupForm');
  return form;
}

export async function deleteSignupForm(id: string, orgId: string): Promise<void> {
  const [row] = await db
    .delete(signupForms)
    .where(and(eq(signupForms.id, id), eq(signupForms.orgId, orgId)))
    .returning({ id: signupForms.id });

  if (!row) throw AppError.notFound('SignupForm');
}

// ─── Embed script generator ───────────────────────────────────────────────────

/**
 * Returns a self-contained JavaScript snippet that renders the form and
 * submits to the public /public/forms/:id/submit endpoint.
 */
export function generateEmbedScript(formId: string, apiBaseUrl: string): string {
  return `<!-- ForgeMsg Signup Form -->
<script>
(function(w,d,s,id){
  var js,fjs=d.getElementsByTagName(s)[0];
  if(d.getElementById(id))return;
  js=d.createElement(s);js.id=id;
  js.src='${apiBaseUrl}/public/forms/loader.js';
  js.setAttribute('data-form-id','${formId}');
  fjs.parentNode.insertBefore(js,fjs);
}(window,document,'script','fm-form-${formId}'));
</script>
<div id="fm-form-${formId}-container"></div>`;
}

/**
 * Returns the JSON representation that the loader script uses to render the form.
 */
export async function getFormDefinition(id: string): Promise<SignupForm | null> {
  const [form] = await db
    .select()
    .from(signupForms)
    .where(and(eq(signupForms.id, id), eq(signupForms.active, true)))
    .limit(1);

  return form ?? null;
}

// ─── Public submission handler ────────────────────────────────────────────────

export interface SubmissionData {
  [key: string]: string;
}

export interface SubmissionResult {
  contactId: string | null;
  success: boolean;
  message: string;
}

export async function processFormSubmission(
  formId: string,
  data: SubmissionData,
  meta: { ipAddress?: string; userAgent?: string },
): Promise<SubmissionResult> {
  const [form] = await db
    .select()
    .from(signupForms)
    .where(and(eq(signupForms.id, formId), eq(signupForms.active, true)))
    .limit(1);

  if (!form) {
    return { contactId: null, success: false, message: 'Form not found or inactive' };
  }

  const fields = form.fields as FormField[];
  const config = form.config as FormConfig;

  // Validate required fields
  for (const field of fields) {
    if (field.required && !data[field.name]) {
      return { contactId: null, success: false, message: `Field '${field.label}' is required` };
    }
  }

  // Extract contact fields
  const email = data['email']?.trim().toLowerCase();
  const firstName = data['first_name'] ?? data['firstName'];
  const lastName = data['last_name'] ?? data['lastName'];
  const phone = data['phone'];

  let contactId: string | null = null;

  try {
    // Upsert contact by email
    if (email) {
      const existing = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.orgId, form.orgId), eq(contacts.email, email)))
        .limit(1);

      if (existing.length > 0) {
        contactId = existing[0]!.id;
        await db
          .update(contacts)
          .set({
            firstName: firstName ?? undefined,
            lastName: lastName ?? undefined,
            phone: phone ?? undefined,
            updatedAt: new Date(),
          })
          .where(eq(contacts.id, contactId));
      } else {
        const [newContact] = await db
          .insert(contacts)
          .values({
            orgId: form.orgId,
            email,
            firstName: firstName ?? null,
            lastName: lastName ?? null,
            phone: phone ?? null,
            source: 'signup_form',
            sourceDetails: { formId },
          })
          .returning({ id: contacts.id });
        contactId = newContact!.id;
      }
    }

    // Add to list
    if (form.listId && contactId) {
      const { contactLists } = await import('../../db/schema/index.js');
      await db
        .insert(contactLists)
        .values({ contactId, listId: form.listId })
        .onConflictDoNothing()
        .catch(() => {});
    }

    // Apply auto-tags
    if (config.tags && config.tags.length > 0 && contactId) {
      const { tags, contactTags } = await import('../../db/schema/index.js');
      for (const tagName of config.tags) {
        const [tag] = await db
          .select({ id: tags.id })
          .from(tags)
          .where(and(eq(tags.orgId, form.orgId), eq(tags.name, tagName)))
          .limit(1);
        if (tag) {
          await db
            .insert(contactTags)
            .values({ contactId, tagId: tag.id })
            .onConflictDoNothing()
            .catch(() => {});
        }
      }
    }

    // Trigger workflow (fire-and-forget)
    if (config.workflowId && contactId) {
      import('../../services/workflows/triggers.js')
        .then(({ triggerManual }) => triggerManual(config.workflowId!, form.orgId, contactId!))
        .catch(() => {});
    }

    // Log submission
    await db.insert(signupFormSubmissions).values({
      formId,
      orgId: form.orgId,
      contactId,
      data,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    // Increment submit counter
    await db
      .update(signupForms)
      .set({ submitCount: sql`${signupForms.submitCount} + 1` })
      .where(eq(signupForms.id, formId));

    // Dispatch webhook event
    import('../../services/webhooks/index.js')
      .then(({ dispatchEvent }) =>
        dispatchEvent(form.orgId, 'contact.created', { contactId, formId, email }),
      )
      .catch(() => {});
  } catch (_err) {
    return { contactId: null, success: false, message: 'Submission failed. Please try again.' };
  }

  return {
    contactId,
    success: true,
    message: (config as FormConfig).successMessage ?? 'Thank you for subscribing!',
  };
}

export async function trackFormView(formId: string): Promise<void> {
  await db
    .update(signupForms)
    .set({ viewCount: sql`${signupForms.viewCount} + 1` })
    .where(eq(signupForms.id, formId))
    .catch(() => {});
}

// ─── Default fields ───────────────────────────────────────────────────────────

function defaultFields(): FormField[] {
  return [
    {
      name: 'email',
      label: 'Email address',
      type: 'email',
      required: true,
      placeholder: 'you@example.com',
    },
    { name: 'first_name', label: 'First name', type: 'text', required: false, placeholder: 'Jane' },
  ];
}

// ─── A/B Variant CRUD ─────────────────────────────────────────────────────────

export async function listVariants(orgId: string, formId: string): Promise<SignupFormVariant[]> {
  return db
    .select()
    .from(signupFormVariants)
    .where(and(eq(signupFormVariants.formId, formId), eq(signupFormVariants.orgId, orgId)))
    .orderBy(desc(signupFormVariants.createdAt));
}

export async function createVariant(
  orgId: string,
  formId: string,
  input: { name: string; trafficSplit: number; fields?: FormField[]; config?: FormConfig },
): Promise<SignupFormVariant> {
  // Verify form belongs to org
  const [form] = await db
    .select({ id: signupForms.id })
    .from(signupForms)
    .where(and(eq(signupForms.id, formId), eq(signupForms.orgId, orgId)))
    .limit(1);
  if (!form) throw AppError.notFound('Form');

  const [variant] = await db
    .insert(signupFormVariants)
    .values({ orgId, formId, ...input })
    .returning();
  return variant!;
}

export async function updateVariant(
  orgId: string,
  variantId: string,
  input: Partial<{
    name: string;
    trafficSplit: number;
    fields: FormField[];
    config: FormConfig;
    active: boolean;
  }>,
): Promise<SignupFormVariant> {
  const [variant] = await db
    .update(signupFormVariants)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(signupFormVariants.id, variantId), eq(signupFormVariants.orgId, orgId)))
    .returning();
  if (!variant) throw AppError.notFound('Variant');
  return variant;
}

export async function deleteVariant(orgId: string, variantId: string): Promise<void> {
  await db
    .delete(signupFormVariants)
    .where(and(eq(signupFormVariants.id, variantId), eq(signupFormVariants.orgId, orgId)));
}

/**
 * Select which variant (if any) to show for a given visitor token.
 * Uses a simple hash-modulo approach so the same visitor always sees the same variant.
 * Returns null if no variants are active or visitor lands in the control bucket.
 *
 * @param formId     Parent form ID
 * @param orgId      Org ID
 * @param visitorToken Stable per-visitor string (e.g., localStorage UUID)
 */
export async function selectVariantForVisitor(
  formId: string,
  orgId: string,
  visitorToken: string,
): Promise<SignupFormVariant | null> {
  const variants = await db
    .select()
    .from(signupFormVariants)
    .where(
      and(
        eq(signupFormVariants.formId, formId),
        eq(signupFormVariants.orgId, orgId),
        eq(signupFormVariants.active, true),
      ),
    );

  if (variants.length === 0) return null;

  // Deterministic bucket 0–99 from visitor token
  let hash = 0;
  for (let i = 0; i < visitorToken.length; i++) {
    hash = (hash * 31 + visitorToken.charCodeAt(i)) >>> 0;
  }
  const bucket = hash % 100;

  // Walk through variants in stable order; assign buckets cumulatively
  let cursor = 0;
  for (const v of variants) {
    cursor += v.trafficSplit;
    if (bucket < cursor) return v;
  }

  return null; // control group
}

export async function trackVariantView(variantId: string): Promise<void> {
  await db
    .update(signupFormVariants)
    .set({ viewCount: sql`${signupFormVariants.viewCount} + 1` })
    .where(eq(signupFormVariants.id, variantId))
    .catch(() => {});
}

export async function trackVariantSubmit(variantId: string): Promise<void> {
  await db
    .update(signupFormVariants)
    .set({ submitCount: sql`${signupFormVariants.submitCount} + 1` })
    .where(eq(signupFormVariants.id, variantId))
    .catch(() => {});
}
