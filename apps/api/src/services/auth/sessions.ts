import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { redis } from '../../lib/redis.js';
import type { UserRole } from '@forgemsg/shared';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface SessionData {
  userId: string;
  orgId: string;
  email: string;
  role: UserRole;
  /**
   * When the request authenticated via an API key, this carries the
   * key's mode: 'live' performs real sends, 'test' is a no-op sandbox
   * (Resend parity). Undefined for JWT-based sessions.
   */
  apiKeyMode?: 'live' | 'test';
}

export interface JwtPayload extends SessionData {
  jti: string; // session id
  iat: number;
  exp: number;
}

function sessionKey(jti: string): string {
  return `session:${jti}`;
}

function userSessionsKey(userId: string): string {
  return `user_sessions:${userId}`;
}

/**
 * Create a new session: stores data in Redis (hot path) and returns a JWT.
 */
export async function createSession(data: SessionData): Promise<string> {
  const jti = crypto.randomUUID();

  await redis
    .multi()
    .set(sessionKey(jti), JSON.stringify(data), 'EX', SESSION_TTL_SECONDS)
    .sadd(userSessionsKey(data.userId), jti)
    .expire(userSessionsKey(data.userId), SESSION_TTL_SECONDS)
    .exec();

  return jwt.sign({ ...data, jti }, JWT_SECRET, { expiresIn: SESSION_TTL_SECONDS });
}

/**
 * Verify a JWT and confirm the session is still active in Redis.
 */
export async function verifySession(token: string): Promise<SessionData | null> {
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }

  const cached = await redis.get(sessionKey(payload.jti));
  if (!cached) return null;

  return JSON.parse(cached) as SessionData;
}

/**
 * Revoke a single session by JTI (logout).
 */
export async function revokeSession(token: string): Promise<void> {
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as JwtPayload;
  } catch {
    return;
  }

  await redis
    .multi()
    .del(sessionKey(payload.jti))
    .srem(userSessionsKey(payload.userId), payload.jti)
    .exec();
}

/**
 * Revoke ALL sessions for a user (logout from every device).
 */
export async function revokeAllUserSessions(userId: string): Promise<number> {
  const sessionIds = await redis.smembers(userSessionsKey(userId));
  if (sessionIds.length === 0) return 0;

  const pipeline = redis.multi();
  for (const jti of sessionIds) {
    pipeline.del(sessionKey(jti));
  }
  pipeline.del(userSessionsKey(userId));
  await pipeline.exec();

  return sessionIds.length;
}
