/**
 * Centralised env loader for the voice-bot process.
 * See `apps/api/src/config/env.ts` for design notes.
 */
import { z } from 'zod';

const isProduction = process.env.NODE_ENV === 'production';

const prodRequired = (schema: z.ZodString) => (isProduction ? schema : schema.optional());

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Listener
  VOICE_BOT_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  VOICE_BOT_LANGUAGE: z.string().default('cs'),
  VOICE_BOT_VOICE_ID: z.string().default('eleven_multilingual_v2'),

  // Provider credentials — required in prod (the bot can't operate without them).
  TWILIO_ACCOUNT_SID: prodRequired(z.string()),
  TWILIO_AUTH_TOKEN: prodRequired(z.string()),
  DEEPGRAM_API_KEY: prodRequired(z.string()),
  ELEVENLABS_API_KEY: prodRequired(z.string()),
  ANTHROPIC_API_KEY: prodRequired(z.string()),

  // For posting call summaries back to the API
  API_BASE_URL: z.string().url().default('http://localhost:3001'),
  INTERNAL_API_SECRET: prodRequired(z.string().min(32)),
});

export type Env = z.infer<typeof Env>;

function loadEnv(): Env {
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(
        (i: { path: PropertyKey[]; message: string }) =>
          `  - ${i.path.join('.') || '<root>'}: ${i.message}`,
      )
      .join('\n');

    console.error(`✖ Invalid environment configuration:\n${issues}`);
    if (isProduction) process.exit(1);
    throw new Error('Invalid environment configuration');
  }
  return parsed.data;
}

export const env: Env = loadEnv();
