import { describe, it, expect } from 'vitest';
import { computePositionalHeatmap } from './index.js';

const html = `<html><body>
  <a href="https://top.example.com">Top</a>
  ...lots of content...
  <a href="https://middle.example.com">Middle</a>
  ...more content...
  <a href="https://bottom.example.com">Bottom</a>
</body></html>`;

describe('computePositionalHeatmap', () => {
  it('orders links by their vertical position in the HTML', () => {
    const result = computePositionalHeatmap(
      [
        { url: 'https://bottom.example.com', clicks: 5, uniqueClicks: 4 },
        { url: 'https://top.example.com', clicks: 10, uniqueClicks: 8 },
        { url: 'https://middle.example.com', clicks: 2, uniqueClicks: 2 },
      ],
      html,
    );
    expect(result.links.map((l) => l.url)).toEqual([
      'https://top.example.com',
      'https://middle.example.com',
      'https://bottom.example.com',
    ]);
    expect(result.links.map((l) => l.ordinal)).toEqual([1, 2, 3]);
    expect(result.hasPositions).toBe(true);
  });

  it('computes intensity relative to the most-clicked link', () => {
    const result = computePositionalHeatmap(
      [
        { url: 'https://top.example.com', clicks: 10, uniqueClicks: 8 },
        { url: 'https://middle.example.com', clicks: 5, uniqueClicks: 5 },
      ],
      html,
    );
    const top = result.links.find((l) => l.url.includes('top'))!;
    const mid = result.links.find((l) => l.url.includes('middle'))!;
    expect(top.intensity).toBe(1);
    expect(mid.intensity).toBe(0.5);
  });

  it('assigns increasing relativeY down the document', () => {
    const result = computePositionalHeatmap(
      [
        { url: 'https://top.example.com', clicks: 1, uniqueClicks: 1 },
        { url: 'https://bottom.example.com', clicks: 1, uniqueClicks: 1 },
      ],
      html,
    );
    const first = result.links[0]!;
    const second = result.links[1]!;
    expect(first.relativeY!).toBeLessThan(second.relativeY!);
    expect(first.relativeY!).toBeGreaterThanOrEqual(0);
    expect(second.relativeY!).toBeLessThanOrEqual(1);
  });

  it('sorts unlocatable links last with relativeY null', () => {
    const result = computePositionalHeatmap(
      [
        { url: 'https://gone.example.com', clicks: 99, uniqueClicks: 50 },
        { url: 'https://top.example.com', clicks: 1, uniqueClicks: 1 },
      ],
      html,
    );
    expect(result.links[0]!.url).toBe('https://top.example.com');
    const gone = result.links.find((l) => l.url.includes('gone'))!;
    expect(gone.relativeY).toBeNull();
    expect(result.links[result.links.length - 1]!.url).toBe('https://gone.example.com');
  });

  it('handles empty HTML gracefully', () => {
    const result = computePositionalHeatmap(
      [{ url: 'https://x.example.com', clicks: 3, uniqueClicks: 2 }],
      '',
    );
    expect(result.hasPositions).toBe(false);
    expect(result.links[0]!.relativeY).toBeNull();
    expect(result.totalClicks).toBe(3);
  });
});
