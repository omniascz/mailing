/**
 * genderize.io API integration (#640) — international gender fallback.
 *
 * Used when CZ/SK inference returns 'unknown'. The genderize.io API
 * returns probability scores; we only accept results above threshold.
 *
 * API is free for 100 req/day; paid plans go higher. Cache responses
 * in Redis (7-day TTL) to avoid burning the free tier.
 */

import type { Gender, GenderResult } from './cz-sk-inference.js';

const GENDERIZE_API = 'https://api.genderize.io';
const CONFIDENCE_THRESHOLD = 0.75;

interface GenderizeResponse {
  name: string;
  gender: 'male' | 'female' | null;
  probability: number;
  count: number;
}

let _redis: { get(k: string): Promise<string | null>; set(k: string, v: string, ex: number): Promise<unknown> } | null = null;

async function getRedis() {
  if (_redis) return _redis;
  try {
    const { Redis } = await import('ioredis');
    const client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    _redis = {
      get: (k) => client.get(k),
      set: (k, v, ex) => client.set(k, v, 'EX', ex),
    };
  } catch {
    _redis = { get: async () => null, set: async () => null };
  }
  return _redis;
}

/**
 * Infer gender via genderize.io, with Redis caching.
 * Returns 'unknown' on API error or low-confidence results.
 */
export async function inferGenderInternational(
  firstName: string,
  countryCode?: string,
): Promise<GenderResult> {
  const key = `genderize:${firstName.toLowerCase()}:${countryCode ?? 'all'}`;
  const redis = await getRedis();

  // Cache hit
  const cached = await redis.get(key);
  if (cached) {
    return JSON.parse(cached) as GenderResult;
  }

  // Call genderize.io
  const params = new URLSearchParams({ name: firstName.toLowerCase() });
  if (countryCode) params.set('country_id', countryCode.toUpperCase());

  const apiKey = process.env.GENDERIZE_API_KEY;
  if (apiKey) params.set('apikey', apiKey);

  let result: GenderResult;
  try {
    const res = await fetch(`${GENDERIZE_API}?${params.toString()}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`genderize.io HTTP ${res.status}`);

    const data = (await res.json()) as GenderizeResponse;
    const gender: Gender =
      data.gender && data.probability >= CONFIDENCE_THRESHOLD
        ? (data.gender as Gender)
        : 'unknown';
    result = {
      gender,
      confidence: data.probability ?? 0,
      source: gender === 'unknown' ? 'unknown' : 'dictionary',
    };
  } catch {
    result = { gender: 'unknown', confidence: 0, source: 'unknown' };
  }

  // Cache for 7 days
  await redis.set(key, JSON.stringify(result), 7 * 86_400);
  return result;
}

/**
 * Full inference pipeline: CZ/SK first, then genderize.io fallback.
 */
export async function inferGenderFull(
  firstName: string,
  countryCode?: string,
): Promise<GenderResult> {
  const { inferGender } = await import('./cz-sk-inference.js');
  const local = inferGender(firstName);
  if (local.gender !== 'unknown') return local;
  return inferGenderInternational(firstName, countryCode);
}
