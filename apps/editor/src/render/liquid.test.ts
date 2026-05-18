import { describe, it, expect } from 'vitest';
import { renderLiquid, renderLiquidSync } from './liquid.js';

describe('renderLiquid (async)', () => {
  it('renders plain text unchanged', async () => {
    expect(await renderLiquid('Hello world')).toBe('Hello world');
  });

  it('interpolates variables', async () => {
    const out = await renderLiquid('Hello {{ name }}!', { name: 'Jan' });
    expect(out).toBe('Hello Jan!');
  });

  it('renders if/else', async () => {
    const tpl = '{% if vip %}VIP{% else %}Standard{% endif %}';
    expect(await renderLiquid(tpl, { vip: true })).toBe('VIP');
    expect(await renderLiquid(tpl, { vip: false })).toBe('Standard');
  });

  it('renders for loop', async () => {
    const tpl = '{% for item in items %}{{ item }} {% endfor %}';
    const out = await renderLiquid(tpl, { items: ['a', 'b', 'c'] });
    expect(out.trim()).toBe('a b c');
  });

  it('applies upcase filter', async () => {
    const out = await renderLiquid('{{ name | upcase }}', { name: 'hello' });
    expect(out).toBe('HELLO');
  });

  it('applies downcase filter', async () => {
    const out = await renderLiquid('{{ name | downcase }}', { name: 'WORLD' });
    expect(out).toBe('world');
  });

  it('applies capitalize filter', async () => {
    const out = await renderLiquid('{{ word | capitalize }}', { word: 'hello world' });
    expect(out).toBe('Hello world');
  });

  it('handles missing variable as empty string', async () => {
    const out = await renderLiquid('Hello {{ missing }}!');
    expect(out).toBe('Hello !');
  });

  it('handles default filter for missing variable', async () => {
    const out = await renderLiquid('{{ name | default: "friend" }}');
    expect(out).toBe('friend');
  });

  it('tags containing VIP', async () => {
    const tpl = '{% if contact.tags contains "VIP" %}VIP user{% else %}Regular{% endif %}';
    expect(await renderLiquid(tpl, { contact: { tags: ['VIP', 'Newsletter'] } })).toBe('VIP user');
    expect(await renderLiquid(tpl, { contact: { tags: ['Newsletter'] } })).toBe('Regular');
  });

  it('nested loops', async () => {
    const tpl = '{% for row in rows %}{% for cell in row %}{{ cell }},{% endfor %};{% endfor %}';
    const out = await renderLiquid(tpl, { rows: [[1, 2], [3, 4]] });
    expect(out).toBe('1,2,;3,4,;');
  });

  it('returns empty string for null/undefined input', async () => {
    // @ts-expect-error intentional invalid input test
    expect(await renderLiquid(null)).toBe('');
    // @ts-expect-error intentional invalid input test
    expect(await renderLiquid(undefined)).toBe('');
  });

  it('does not allow filesystem include', async () => {
    await expect(renderLiquid("{% include 'secret.txt' %}")).rejects.toThrow();
  });
});

describe('renderLiquidSync', () => {
  it('renders synchronously', () => {
    expect(renderLiquidSync('{{ x }}', { x: 42 })).toBe('42');
  });

  it('applies filters synchronously', () => {
    expect(renderLiquidSync('{{ s | upcase }}', { s: 'test' })).toBe('TEST');
  });

  it('handles empty string', () => {
    expect(renderLiquidSync('')).toBe('');
  });
});
