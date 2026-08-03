// @forgemsg/voice-bot — AI voice robot (Twilio + STT/TTS + Claude)
import { createStreamingServer } from './api/streaming.js';
import { createTwilioBridge } from './api/twilio-bridge.js';
import { resolveAdapters } from './adapters/index.js';

const port = Number(process.env.VOICE_BOT_PORT) || 8787;

const adapters = resolveAdapters();

// Twilio Media Streams bridge — live phone calls. Only starts when all three
// real providers are configured (a telephony call with stubs is pointless).
const dgKey = process.env.DEEPGRAM_API_KEY;
const elKey = process.env.ELEVENLABS_API_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;
let twilioBridge: { close: () => Promise<void> } | null = null;
if (dgKey && elKey && anthropicKey) {
  const twilioPort = Number(process.env.VOICE_BOT_TWILIO_PORT) || 8788;
  const bridge = createTwilioBridge({
    deepgramKey: dgKey,
    elevenLabsKey: elKey,
    anthropicKey,
    port: twilioPort,
    language: process.env.VOICE_BOT_LANGUAGE ?? 'cs',
    voiceId: process.env.VOICE_BOT_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM',
  });
  twilioBridge = bridge;
  bridge.wss.on('listening', () =>
    console.log(`ForgeMsg Voice Bot Twilio Media Streams bridge listening on :${twilioPort}`),
  );
} else {
  console.warn('[voice-bot] Twilio bridge disabled — needs DEEPGRAM/ELEVENLABS/ANTHROPIC keys.');
}

const { wss, close } = createStreamingServer({
  stt: adapters.stt,
  llm: adapters.llm,
  tts: adapters.tts,
  port,
  defaultLanguage: process.env.VOICE_BOT_LANGUAGE ?? 'cs',
  // A real ElevenLabs voice id (not a model id). Override with VOICE_BOT_VOICE_ID.
  defaultVoiceId: process.env.VOICE_BOT_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM',
});

wss.on('listening', () => {
  console.log(
    `ForgeMsg Voice Bot streaming API listening on :${port} ` +
      `[stt:${adapters.mode.stt} llm:${adapters.mode.llm} tts:${adapters.mode.tts}]`,
  );
  if (
    adapters.mode.stt === 'stub' ||
    adapters.mode.llm === 'stub' ||
    adapters.mode.tts === 'stub'
  ) {
    console.warn(
      '[voice-bot] Some adapters are running in STUB mode — set DEEPGRAM_API_KEY / ' +
        'ANTHROPIC_API_KEY / ELEVENLABS_API_KEY for real STT/LLM/TTS.',
    );
  }
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`Received ${sig}, closing voice-bot...`);
    void Promise.all([close(), twilioBridge?.close()]).then(() => process.exit(0));
  });
}
