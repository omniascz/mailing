/**
 * Signup form service (task 6.5).
 *
 * Handles form CRUD, JavaScript embed snippet generation,
 * and public form submissions (contact upsert + list add + workflow trigger).
 */

import { and, eq, desc, sql } from 'drizzle-orm';
import { emitWebhookEvent, toContactSummary } from '../webhooks/emit.js';
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
import { isHoneypotTripped, verifyCaptcha } from '../../lib/captcha.js';
import { validateRequiredFields } from '../forms/conditional-logic.js';
import { sendListDoiConfirmation } from '../subscriptions/doi.js';

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

// Re-export the loader.js + hosted-page renderers so route handlers can import
// everything from the service index.
export { buildLoaderScript, renderHostedFormPage } from './render.js';

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

  // Bot protection (honeypot + captcha) — before any DB writes.
  if (isHoneypotTripped(data, config.honeypotField)) {
    return { contactId: null, success: false, message: 'Submission rejected' };
  }
  if (config.captcha) {
    const token =
      data['captcha_token'] ??
      data['cf-turnstile-response'] ??
      data['g-recaptcha-response'] ??
      data['h-captcha-response'];
    const verdict = await verifyCaptcha({
      provider: config.captcha.provider,
      secret: config.captcha.secret,
      token,
      remoteIp: meta.ipAddress,
      minScore: config.captcha.minScore,
    });
    if (!verdict.success) {
      return { contactId: null, success: false, message: 'Captcha verification failed' };
    }
  }

  // Validate required fields — only those currently VISIBLE per the form's
  // conditional-logic rules (hidden fields aren't required). Previously all
  // required fields were validated regardless of visibility.
  const missing = validateRequiredFields(fields, data);
  if (missing.length > 0) {
    const f = fields.find((x) => x.name === missing[0]);
    return {
      contactId: null,
      success: false,
      message: `Field '${f?.label ?? missing[0]}' is required`,
    };
  }

  // Extract contact fields
  const email = data['email']?.trim().toLowerCase();
  const firstName = data['first_name'] ?? data['firstName'];
  const lastName = data['last_name'] ?? data['lastName'];
  const phone = data['phone'];

  // Double opt-in: when enabled + we have an email + a list, the contact must
  // confirm via email before we treat them as subscribed (status stays pending,
  // welcome workflow deferred to confirm). Previously this flag was ignored.
  const doubleOptIn = config.doubleOptIn === true && !!email && !!form.listId;

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
            status: doubleOptIn ? 'pending' : 'active',
            source: 'signup_form',
            sourceDetails: { formId },
          })
          .returning();
        contactId = newContact!.id;
        // Emitted here, from the row the insert already returned, rather than
        // from a second SELECT — a new contact is the only case where this
        // event is true, and the update branch above emits nothing because
        // contact.updated belongs to the contacts service.
        emitWebhookEvent(form.orgId, 'contact.created', {
          ...toContactSummary(newContact!),
          source: 'signup_form',
        });
      }
    }

    // Add to list (unconfirmed; confirmedAt is set by the DOI confirm handler
    // when double opt-in is on, or immediately below when it's off).
    if (form.listId && contactId) {
      const { contactLists } = await import('../../db/schema/index.js');
      await db
        .insert(contactLists)
        .values({
          contactId,
          listId: form.listId,
          ...(doubleOptIn ? {} : { confirmedAt: new Date() }),
        })
        .onConflictDoNothing()
        .catch(() => {});
    }

    // Double opt-in — send the confirmation email and stop here (no auto-tags/
    // welcome workflow until the contact confirms).
    if (doubleOptIn && email && form.listId && contactId) {
      const { lists } = await import('../../db/schema/index.js');
      const [list] = await db
        .select({ name: lists.name })
        .from(lists)
        .where(eq(lists.id, form.listId))
        .limit(1);
      await sendListDoiConfirmation({
        orgId: form.orgId,
        contactId,
        listId: form.listId,
        email,
        listName: list?.name ?? 'our newsletter',
        firstName,
      }).catch(() => {});
      await db.insert(signupFormSubmissions).values({
        formId,
        orgId: form.orgId,
        contactId,
        data,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      await db
        .update(signupForms)
        .set({ submitCount: sql`${signupForms.submitCount} + 1` })
        .where(eq(signupForms.id, formId));
      return {
        contactId,
        success: true,
        message: 'Almost there — check your inbox to confirm your subscription.',
      };
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

    // Fire `form_submit` workflow triggers. Separate from the branch above:
    // that one runs one specific workflow by id whatever its trigger type is,
    // this one runs every workflow that asked to be started by a form submit.
    if (contactId) {
      import('../../services/workflows/triggers.js')
        .then(({ onFormSubmit }) => onFormSubmit(form.orgId, contactId!, formId))
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

    // Confirm wheel-of-fortune spin if form has wheelConfig (fire-and-forget)
    if (email && contactId && (form.config as FormConfig & { wheelConfig?: unknown }).wheelConfig) {
      import('../gamification/wheel-of-fortune.js')
        .then(({ confirmSpin }) => confirmSpin(formId, email, contactId!))
        .catch(() => {});
    }

    // Auto-fill gender from first name if not already set
    if (firstName && contactId) {
      import('../gender/cz-sk-inference.js')
        .then(async ({ inferGender }) => {
          const result = inferGender(firstName);
          if (result.gender !== 'unknown') {
            await db
              .update(contacts)
              .set({ gender: result.gender })
              .where(and(eq(contacts.id, contactId!), eq(contacts.orgId, form.orgId)));
          }
        })
        .catch(() => {});
    }
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
  orgId: string | undefined,
  visitorToken: string,
): Promise<SignupFormVariant | null> {
  // formId is a globally-unique UUID, so it alone scopes the lookup. orgId is
  // an optional extra guard for authenticated callers; the public embed route
  // has no session and passes it undefined.
  const variants = await db
    .select()
    .from(signupFormVariants)
    .where(
      and(
        eq(signupFormVariants.formId, formId),
        orgId ? eq(signupFormVariants.orgId, orgId) : undefined,
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
