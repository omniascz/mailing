import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../../db/client.js';
import { users, organizations } from '../../db/schema/index.js';
import { hashPassword, verifyPassword } from '../../services/auth/password.js';
import { evaluatePasswordStrength } from '../../services/auth/password-strength.js';
import { createSession, revokeSession } from '../../services/auth/sessions.js';
import {
  getGoogleAuthUrl,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  isGoogleConfigured,
} from '../../services/auth/google-oauth.js';
import { AppError } from '../../lib/app-error.js';
import { sendTransactionalEmail } from '../../lib/queues.js';
import { notifyOperatorOfSignup } from '../../services/notifications/operator-alerts.js';

const SESSION_COOKIE = 'fm_session';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days
// `secure: true` is required in production but breaks local dev where
// the API serves http://localhost. NODE_ENV gate keeps both working.
const COOKIE_SECURE = process.env.NODE_ENV === 'production';

const registerSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  orgName: z.string().min(1).max(255).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

// ─── Per-route rate limits ───────────────────────────────────────────────────
// The global limiter is 100 req/min/IP — fine for normal traffic but the
// auth surface needs to assume bots. These caps are deliberately
// aggressive; legit users won't hit them on a typical session.
const REGISTER_LIMIT = { max: 5, timeWindow: '1 hour' } as const;
const LOGIN_LIMIT = { max: 10, timeWindow: '15 minutes' } as const;
const VERIFY_EMAIL_LIMIT = { max: 20, timeWindow: '1 hour' } as const;
const RESEND_VERIFICATION_LIMIT = { max: 3, timeWindow: '1 hour' } as const;
const FORGOT_PASSWORD_LIMIT = { max: 3, timeWindow: '1 hour' } as const;
const RESET_PASSWORD_LIMIT = { max: 5, timeWindow: '15 minutes' } as const;

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

export default async function authRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/register
  app.post(
    '/api/v1/auth/register',
    {
      config: { rateLimit: REGISTER_LIMIT },
      schema: {
        tags: ['Auth'],
        summary: 'Register a new user and organization',
      },
    },
    async (request, reply) => {
      const body = registerSchema.parse(request.body);

      // Password strength — zxcvbn down-weights matches against the
      // user's own name/email so `john@x.com` can't pick `john1234`.
      const strength = await evaluatePasswordStrength(body.password, [body.email, body.name]);
      if (!strength.acceptable) {
        throw AppError.badRequest(strength.feedback);
      }

      // Check email uniqueness
      const existing = await db.query.users.findFirst({
        where: eq(users.email, body.email),
      });
      if (existing) throw AppError.conflict('Email already registered');

      // Create organization
      const orgName = body.orgName || `${body.name}'s workspace`;
      const slug = `${slugify(orgName)}-${crypto.randomBytes(3).toString('hex')}`;

      // Data residency: derive the region from the signup country (GDPR
      // countries → EU, APAC → AP, else US). Never moved automatically later.
      const countrySignal =
        ((request.body as { country?: string }).country ??
          (request.headers['x-country'] as string) ??
          '') || '';
      const { suggestRegionForCountry } = await import('../../services/data-residency/index.js');
      const dataRegion = countrySignal ? suggestRegionForCountry(countrySignal) : 'us';

      const [org] = await db
        .insert(organizations)
        .values({ name: orgName, slug, sendingMode: 'sandbox', dataRegion })
        .returning();
      if (!org) throw AppError.internal('Failed to create organization');

      // Create owner user
      const passwordHash = await hashPassword(body.password);
      const emailVerificationToken = crypto.randomBytes(32).toString('hex');

      const [user] = await db
        .insert(users)
        .values({
          orgId: org.id,
          email: body.email,
          name: body.name,
          passwordHash,
          role: 'owner',
          authProvider: 'email',
          emailVerificationToken,
        })
        .returning();
      if (!user) throw AppError.internal('Failed to create user');

      // Issue session
      const token = await createSession({
        userId: user.id,
        orgId: org.id,
        email: user.email,
        role: user.role,
      });

      reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: COOKIE_SECURE,
        sameSite: 'lax',
        path: '/',
        maxAge: COOKIE_MAX_AGE,
      });

      // Fire-and-forget verification email. We don't await it because we
      // don't want a transient queue glitch to fail the register response
      // — the user already has a session and can resend later.
      const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
      const verifyUrl = `${appUrl}/verify-email/${emailVerificationToken}`;
      sendTransactionalEmail({
        to: user.email,
        toName: user.name ?? undefined,
        from: process.env.DOI_FROM_EMAIL ?? 'no-reply@example.com',
        fromName: 'Mailforge',
        subject: 'Verify your email',
        html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:24px;color:#1e293b">
<p style="font-size:16px">Hi ${user.name},</p>
<p style="font-size:16px">Welcome to <strong>${org.name}</strong>! Click below to verify your email — it unlocks deliverability checks and DKIM key publishing.</p>
<p style="margin:32px 0"><a href="${verifyUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Verify email</a></p>
<p style="font-size:13px;color:#64748b">If you didn't sign up, ignore this email.</p>
</body></html>`,
        text: `Hi ${user.name},\n\nVerify your email: ${verifyUrl}\n\nIf you didn't sign up, ignore this.`,
        orgId: org.id,
      }).catch((err) =>
        request.log.error({ err, event: 'verify_email_enqueue_failed', userId: user.id }),
      );

      // Notify platform operator (no-op when OPERATOR_EMAIL unset).
      notifyOperatorOfSignup({
        orgId: org.id,
        orgName: org.name,
        ownerEmail: user.email,
        ownerName: user.name,
      }).catch(() => {});

      return reply.status(201).send({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          orgId: org.id,
          orgName: org.name,
        },
        token,
      });
    },
  );

  // POST /api/v1/auth/verify-email/:token
  // Marks the user's email as verified. Token comes from emailVerificationToken
  // set at register. Idempotent — a second call with the same (now-cleared)
  // token returns 404 since the token's gone. UI handles the 404 gracefully.
  app.post(
    '/api/v1/auth/verify-email/:token',
    {
      config: { rateLimit: VERIFY_EMAIL_LIMIT },
      schema: { tags: ['Auth'], summary: 'Verify a user email by token' },
    },
    async (req, reply) => {
      const { token } = z.object({ token: z.string().min(16).max(128) }).parse(req.params);
      const [user] = await db
        .update(users)
        .set({ emailVerified: true, emailVerificationToken: null, updatedAt: new Date() })
        .where(eq(users.emailVerificationToken, token))
        .returning();
      if (!user) {
        throw AppError.notFound('Verification token (already used or expired)');
      }
      return reply.send({ data: { verified: true, email: user.email } });
    },
  );

  // POST /api/v1/auth/resend-verification
  // Issues a fresh token + re-sends the verification email. Rate-limited
  // by the global limiter so a stuck user can't spam their inbox.
  app.post(
    '/api/v1/auth/resend-verification',
    {
      config: { rateLimit: RESEND_VERIFICATION_LIMIT },
      preHandler: [app.authenticate],
      schema: { tags: ['Auth'], summary: 'Resend verification email' },
    },
    async (req, reply) => {
      const userId = req.user!.userId;
      const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!u) throw AppError.notFound('User');
      if (u.emailVerified) {
        return reply.send({ data: { alreadyVerified: true } });
      }

      const newToken = crypto.randomBytes(32).toString('hex');
      await db
        .update(users)
        .set({ emailVerificationToken: newToken, updatedAt: new Date() })
        .where(eq(users.id, userId));

      const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
      const verifyUrl = `${appUrl}/verify-email/${newToken}`;
      await sendTransactionalEmail({
        to: u.email,
        toName: u.name ?? undefined,
        from: process.env.DOI_FROM_EMAIL ?? 'no-reply@example.com',
        fromName: 'Mailforge',
        subject: 'Verify your email (resent)',
        html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:24px;color:#1e293b">
<p style="font-size:16px">Hi ${u.name},</p>
<p style="font-size:16px">Here's a fresh verification link:</p>
<p style="margin:32px 0"><a href="${verifyUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Verify email</a></p>
</body></html>`,
        text: `Hi ${u.name},\n\nFresh verification link: ${verifyUrl}`,
        orgId: u.orgId,
      });

      return reply.send({ data: { sent: true } });
    },
  );

  // POST /api/v1/auth/forgot-password
  // Always returns 200 regardless of whether the email exists — this
  // is the standard defense against email enumeration. If the user
  // exists we generate a token + email the reset link asynchronously.
  app.post(
    '/api/v1/auth/forgot-password',
    {
      config: { rateLimit: FORGOT_PASSWORD_LIMIT },
      schema: { tags: ['Auth'], summary: 'Request a password reset email' },
    },
    async (req, reply) => {
      const { email } = z.object({ email: z.string().email().max(255) }).parse(req.body);

      const user = await db.query.users.findFirst({ where: eq(users.email, email) });
      if (user) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
        await db
          .update(users)
          .set({
            passwordResetToken: token,
            passwordResetExpiresAt: expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));

        const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
        const resetUrl = `${appUrl}/reset-password/${token}`;
        // Fire and forget — enqueue failure shouldn't leak via response.
        sendTransactionalEmail({
          to: user.email,
          toName: user.name ?? undefined,
          from: process.env.DOI_FROM_EMAIL ?? 'no-reply@example.com',
          fromName: 'Mailforge',
          subject: 'Reset your password',
          html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:24px;color:#1e293b">
<p style="font-size:16px">Hi ${user.name ?? 'there'},</p>
<p style="font-size:16px">Someone requested a password reset for this Mailforge account. If that was you, click the button below within 30 minutes:</p>
<p style="margin:32px 0"><a href="${resetUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Reset password</a></p>
<p style="color:#64748b;font-size:14px">If you didn't request this, you can ignore this email — your password stays the same.</p>
</body></html>`,
          text: `Hi ${user.name ?? 'there'},\n\nReset link (valid for 30 minutes): ${resetUrl}\n\nIf you didn't request this, ignore this email.`,
          orgId: user.orgId,
        }).catch((err: unknown) => {
          req.log.error({ err, userId: user.id }, 'Password reset email enqueue failed');
        });
      }

      // Uniform response — same shape + latency posture either way.
      return reply.send({ data: { sent: true } });
    },
  );

  // POST /api/v1/auth/reset-password/:token
  // Consumes the token, sets a new password, clears the token. Returns
  // 404 for expired/used/invalid tokens with a generic message so we
  // don't leak token state.
  app.post(
    '/api/v1/auth/reset-password/:token',
    {
      config: { rateLimit: RESET_PASSWORD_LIMIT },
      schema: { tags: ['Auth'], summary: 'Reset password using the email token' },
    },
    async (req, reply) => {
      const { token } = z.object({ token: z.string().min(16).max(128) }).parse(req.params);
      const { password } = z.object({ password: z.string().min(8).max(128) }).parse(req.body);

      const user = await db.query.users.findFirst({
        where: eq(users.passwordResetToken, token),
      });
      if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
        throw AppError.notFound('Reset token (invalid or expired)');
      }

      const strength = await evaluatePasswordStrength(password, [user.email, user.name ?? '']);
      if (!strength.acceptable) {
        throw AppError.badRequest(strength.feedback);
      }

      const passwordHash = await hashPassword(password);
      await db
        .update(users)
        .set({
          passwordHash,
          passwordResetToken: null,
          passwordResetExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      return reply.send({ data: { reset: true, email: user.email } });
    },
  );

  // POST /api/v1/auth/login
  app.post(
    '/api/v1/auth/login',
    {
      config: { rateLimit: LOGIN_LIMIT },
      schema: {
        tags: ['Auth'],
        summary: 'Login with email and password',
      },
    },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);

      const user = await db.query.users.findFirst({
        where: eq(users.email, body.email),
      });
      if (!user || !user.passwordHash) {
        throw AppError.unauthorized('Invalid email or password');
      }

      const valid = await verifyPassword(body.password, user.passwordHash);
      if (!valid) throw AppError.unauthorized('Invalid email or password');

      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

      const token = await createSession({
        userId: user.id,
        orgId: user.orgId,
        email: user.email,
        role: user.role,
      });

      reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: COOKIE_SECURE,
        sameSite: 'lax',
        path: '/',
        maxAge: COOKIE_MAX_AGE,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          orgId: user.orgId,
        },
        token,
      };
    },
  );

  // POST /api/v1/auth/logout
  app.post(
    '/api/v1/auth/logout',
    {
      schema: { tags: ['Auth'], summary: 'Logout current session' },
    },
    async (request, reply) => {
      const cookies = request.cookies as Record<string, string> | undefined;
      const token =
        cookies?.[SESSION_COOKIE] ||
        (request.headers.authorization?.startsWith('Bearer ')
          ? request.headers.authorization.slice(7)
          : null);

      if (token) await revokeSession(token);
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return { success: true };
    },
  );

  // GET /api/v1/auth/me
  app.get(
    '/api/v1/auth/me',
    {
      schema: { tags: ['Auth'], summary: 'Get current user' },
      preHandler: [app.requireAuth],
    },
    async (request) => {
      const session = request.user!;
      const user = await db.query.users.findFirst({
        where: eq(users.id, session.userId),
      });
      if (!user) throw AppError.notFound('User');

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        orgId: user.orgId,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerified,
      };
    },
  );

  // GET /api/v1/auth/google — start OAuth flow
  app.get(
    '/api/v1/auth/google',
    {
      schema: { tags: ['Auth'], summary: 'Start Google OAuth flow' },
    },
    async (_request, reply) => {
      if (!isGoogleConfigured()) {
        throw AppError.badRequest('Google OAuth not configured');
      }
      const state = crypto.randomBytes(16).toString('hex');
      reply.setCookie('oauth_state', state, {
        httpOnly: true,
        secure: COOKIE_SECURE,
        sameSite: 'lax',
        path: '/',
        maxAge: 600,
      });
      return reply.redirect(getGoogleAuthUrl(state));
    },
  );

  // GET /api/v1/auth/google/callback
  app.get(
    '/api/v1/auth/google/callback',
    {
      schema: { tags: ['Auth'], summary: 'Google OAuth callback' },
    },
    async (request, reply) => {
      const query = request.query as { code?: string; state?: string };
      if (!query.code) throw AppError.badRequest('Missing authorization code');

      const cookies = request.cookies as Record<string, string> | undefined;
      const expectedState = cookies?.['oauth_state'];
      if (!expectedState || expectedState !== query.state) {
        throw AppError.badRequest('Invalid OAuth state');
      }

      const tokens = await exchangeCodeForTokens(query.code);
      const profile = await fetchGoogleUserInfo(tokens.access_token);

      // Find or create user
      let user = await db.query.users.findFirst({ where: eq(users.email, profile.email) });

      if (!user) {
        // Create org + user
        const orgName = `${profile.name}'s workspace`;
        const slug = `${slugify(orgName)}-${crypto.randomBytes(3).toString('hex')}`;

        const [org] = await db.insert(organizations).values({ name: orgName, slug, sendingMode: 'sandbox' }).returning();
        if (!org) throw AppError.internal('Failed to create organization');

        const [created] = await db
          .insert(users)
          .values({
            orgId: org.id,
            email: profile.email,
            name: profile.name,
            authProvider: 'google',
            googleId: profile.id,
            avatarUrl: profile.picture,
            emailVerified: profile.verified_email,
            role: 'owner',
          })
          .returning();
        if (!created) throw AppError.internal('Failed to create user');
        user = created;
      } else if (!user.googleId) {
        // Link existing email account to Google
        await db
          .update(users)
          .set({ googleId: profile.id, avatarUrl: profile.picture, emailVerified: true })
          .where(eq(users.id, user.id));
      }

      const token = await createSession({
        userId: user.id,
        orgId: user.orgId,
        email: user.email,
        role: user.role,
      });

      reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: COOKIE_SECURE,
        sameSite: 'lax',
        path: '/',
        maxAge: COOKIE_MAX_AGE,
      });
      reply.clearCookie('oauth_state', { path: '/' });

      const redirectUrl = process.env.WEB_URL || 'http://localhost:3000';
      return reply.redirect(`${redirectUrl}/dashboard`);
    },
  );
}
