import { describe, it, expect } from 'vitest';
import { buildSinchMessage, sinchEndpoint } from './sinch.js';

describe('buildSinchMessage', () => {
  it('builds a text message with suggested replies', () => {
    const msg = buildSinchMessage('text', { text: 'Hi there', suggestedReplies: ['Yes', 'No'] });
    expect(msg).toHaveProperty('text_message');
    const tm = (msg as { text_message: { text: string; suggestions: unknown[] } }).text_message;
    expect(tm.text).toBe('Hi there');
    expect(tm.suggestions).toHaveLength(2);
  });

  it('builds a carousel with cards + url/reply buttons', () => {
    const msg = buildSinchMessage('carousel', {
      carousel: [
        {
          title: 'Card A',
          description: 'desc',
          imageUrl: 'https://x/img.png',
          buttons: [
            { label: 'Open', url: 'https://x/open' },
            { label: 'Reply', postback: 'pb1' },
          ],
        },
      ],
    });
    const cards = (msg as { carousel_message: { cards: Array<Record<string, unknown>> } })
      .carousel_message.cards;
    expect(cards).toHaveLength(1);
    expect(cards[0]!['title']).toBe('Card A');
    expect((cards[0]!['suggestions'] as unknown[])).toHaveLength(2);
  });

  it('builds a media message with caption', () => {
    const msg = buildSinchMessage('media', { mediaUrl: 'https://x/v.mp4', text: 'watch' });
    expect(msg).toHaveProperty('media_message');
    expect((msg as { media_message: { url: string } }).media_message.url).toBe('https://x/v.mp4');
  });

  it('falls back to text for unknown types', () => {
    const msg = buildSinchMessage('weird', { text: 'fallback' });
    expect(msg).toHaveProperty('text_message');
  });

  it('builds region-specific endpoint', () => {
    expect(sinchEndpoint({ token: 't', botId: 'bot1', region: 'eu' })).toBe(
      'https://eu.rcs.api.sinch.com/rcs/v1/bot1/messages',
    );
    expect(sinchEndpoint({ token: 't', botId: 'bot1' })).toContain('https://us.rcs.api.sinch.com');
  });
});
