// @forgemsg/voice-bot — AI voice robot (Twilio + STT/TTS + Claude)
import { createStreamingServer } from './api/streaming.js';
import { resolveAdapters } from './adapters/index.js';

const port = Number(process.env.VOICE_BOT_PORT) || 8787;

const adapters = resolveAdapters();

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
  if (adapters.mode.stt === 'stub' || adapters.mode.llm === 'stub' || adapters.mode.tts === 'stub') {
    console.warn(
      '[voice-bot] Some adapters are running in STUB mode — set DEEPGRAM_API_KEY / ' +
        'ANTHROPIC_API_KEY / ELEVENLABS_API_KEY for real STT/LLM/TTS.',
    );
  }
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`Received ${sig}, closing voice-bot...`);
    void close().then(() => process.exit(0));
  });
}
