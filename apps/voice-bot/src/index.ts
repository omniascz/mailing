// @forgemsg/voice-bot — AI voice robot (Twilio + STT/TTS + Claude)
import { createStreamingServer, createStubAdapters } from './api/streaming.js';

const port = Number(process.env.VOICE_BOT_PORT) || 8787;

const { wss, close } = createStreamingServer({
  ...createStubAdapters(),
  port,
  defaultLanguage: process.env.VOICE_BOT_LANGUAGE ?? 'cs',
  defaultVoiceId: process.env.VOICE_BOT_VOICE_ID ?? 'eleven_multilingual_v2',
});

wss.on('listening', () => {
  console.log(`ForgeMsg Voice Bot streaming API listening on :${port}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`Received ${sig}, closing voice-bot...`);
    void close().then(() => process.exit(0));
  });
}
