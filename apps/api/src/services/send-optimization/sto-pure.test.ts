import { describe, it, expect } from 'vitest';
import {
  computeStoFromCounts,
  normalizeHistogram,
  uniformPrior,
  HOURS,
  KAPPA,
} from './sto-pure.js';

function hist(entries: Record<number, number>): number[] {
  const c = new Array(HOURS).fill(0) as number[];
  for (const [h, n] of Object.entries(entries)) c[Number(h)] = n;
  return c;
}

describe('empirical-Bayes STO shrinkage', () => {
  it('a single open does NOT confidently override the population best hour', () => {
    // Population strongly prefers 09:00; the contact has ONE open at 23:00.
    const prior = normalizeHistogram(hist({ 9: 1000, 10: 800, 11: 600 }));
    const sto = computeStoFromCounts(hist({ 23: 1 }), prior);
    // With one open vs κ=20 pseudo-opens, the prior dominates → not 23.
    expect(sto.bestHourUtc).not.toBe(23);
    expect(sto.bestHourUtc).toBe(9); // shrinks to population favourite
    expect(sto.confidence).toBeCloseTo(1 / (1 + KAPPA), 5); // low confidence
  });

  it('lots of opens DO override the prior (own pattern wins)', () => {
    const prior = normalizeHistogram(hist({ 9: 1000 }));
    // 60 opens at 23:00 should beat the prior's 09:00.
    const sto = computeStoFromCounts(hist({ 23: 60 }), prior);
    expect(sto.bestHourUtc).toBe(23);
    expect(sto.confidence).toBeGreaterThan(0.7); // 60/(60+20)
  });

  it('confidence = total / (total + κ)', () => {
    expect(computeStoFromCounts(hist({}), uniformPrior()).confidence).toBe(0); // no data
    expect(computeStoFromCounts(hist({ 8: KAPPA }), uniformPrior()).confidence).toBeCloseTo(0.5, 5);
  });

  it('no data → falls back to the population best hour', () => {
    const prior = normalizeHistogram(hist({ 14: 500, 15: 100 }));
    const sto = computeStoFromCounts(hist({}), prior);
    expect(sto.bestHourUtc).toBe(14);
    expect(sto.sampleSize).toBe(0);
  });

  it('posterior rates form a distribution (sum ≈ 1) and are finite', () => {
    const sto = computeStoFromCounts(hist({ 7: 3, 19: 2 }), uniformPrior());
    const sum = sto.rates.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(sto.rates.every((r) => Number.isFinite(r))).toBe(true);
  });

  it('normalizeHistogram returns a uniform prior for all-zero input', () => {
    expect(normalizeHistogram(new Array(HOURS).fill(0))).toEqual(uniformPrior());
  });
});
