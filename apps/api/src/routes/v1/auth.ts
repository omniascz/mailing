import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../../db/client.js';
import { users, organizations } from '../../db/schema/index.js';
import { hashPassword, verifyPassword } from '../../services/auth/password.js';
import { createSession, revokeSession } from '../../services/auth/sessions.js';
import {
  getGoogleAuthUrl,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  isGoogleConfigured,
} from '../../services/auth/google-oauth.js';
import { AppError } from '../../lib/app-error.js';

const SESSION_COOKIE = 'fm_session';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

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

export default async function authRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/register
  app.post(
    '/api/v1/auth/register',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Register a new user and organization',
      },
    },
    async (request, reply) => {
      const body = registerSchema.parse(request.body);

      // Check email uniqueness
      const existing = await db.query.users.findFirst({
        where: eq(users.email, body.email),
      });
      if (existing) throw AppError.conflict('Email already registered');

      // Create organization
      const orgName = body.orgName || `${body.name}'s workspace`;
      const slug = `${slugify(orgName)}-${crypto.randomBytes(3).toString('hex')}`;

      const [org] = await db
        .insert(organizations)
        .values({ name: orgName, slug })
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
        sameSite: 'lax',
        path: '/',
        maxAge: COOKIE_MAX_AGE,
      });

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

  // POST /api/v1/auth/login
  app.post(
    '/api/v1/auth/login',
    {
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

      await db
        .update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, user.id));

      const token = await createSession({
        userId: user.id,
        orgId: user.orgId,
        email: user.email,
        role: user.role,
      });

      reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
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

        const [org] = await db.insert(organizations).values({ name: orgName, slug }).returning();
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
