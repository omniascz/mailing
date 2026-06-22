import { describe, it, expect } from 'vitest';
import { chunkUlaw, mediaFrame } from './twilio-bridge.js';

describe('chunkUlaw', () => {
  it('splits into 160-byte (20ms) frames by default', () => {
    const buf = Buffer.alloc(400, 1);
    const frames = chunkUlaw(buf);
    expect(frames).toHaveLength(3); // 160 + 160 + 80
    expect(frames[0]).toHaveLength(160);
    expect(frames[2]).toHaveLength(80);
  });

  it('handles an empty buffer', () => {
    expect(chunkUlaw(Buffer.alloc(0))).toHaveLength(0);
  });

  it('respects a custom frame size', () => {
    expect(chunkUlaw(Buffer.alloc(10), 4)).toHaveLength(3); // 4 + 4 + 2
  });
});

describe('mediaFrame', () => {
  it('builds a Twilio outbound media frame', () => {
    const frame = JSON.parse(mediaFrame('MZ123', 'YWJj')) as {
      event: string;
      streamSid: string;
      media: { payload: string };
    };
    expect(frame.event).toBe('media');
    expect(frame.streamSid).toBe('MZ123');
    expect(frame.media.payload).toBe('YWJj');
  });
});
