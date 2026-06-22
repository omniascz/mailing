import { describe, it, expect } from 'vitest';
import { trainLogistic, predictLogistic, sigmoid } from './logistic-regression.js';

describe('sigmoid', () => {
  it('is 0.5 at 0 and monotonic + bounded', () => {
    expect(sigmoid(0)).toBeCloseTo(0.5, 6);
    expect(sigmoid(50)).toBeGreaterThan(0.99);
    expect(sigmoid(-50)).toBeLessThan(0.01);
  });
});

describe('trainLogistic (deterministic gradient descent)', () => {
  it('learns a separable rule: y = 1 when x0 > 0.5', () => {
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i <= 100; i++) {
      const v = i / 100;
      X.push([v]);
      y.push(v > 0.5 ? 1 : 0);
    }
    const model = trainLogistic(X, y);
    expect(model.weights[0]!).toBeGreaterThan(0); // positive correlation learned
    expect(predictLogistic(model, [0.9])).toBeGreaterThan(0.8);
    expect(predictLogistic(model, [0.1])).toBeLessThan(0.2);
  });

  it('is deterministic — identical data → identical model', () => {
    const X = [[0.1], [0.9], [0.2], [0.8]];
    const y = [0, 1, 0, 1];
    const a = trainLogistic(X, y);
    const b = trainLogistic(X, y);
    expect(a.weights).toEqual(b.weights);
    expect(a.bias).toEqual(b.bias);
  });

  it('learns feature signs: positive feature up, negative feature down', () => {
    // x0 drives conversion up, x1 drives it down.
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 200; i++) {
      const a = (i % 10) / 10;
      const b = ((i * 3) % 10) / 10;
      X.push([a, b]);
      y.push(a - b > 0 ? 1 : 0);
    }
    const model = trainLogistic(X, y);
    expect(model.weights[0]!).toBeGreaterThan(0);
    expect(model.weights[1]!).toBeLessThan(0);
  });

  it('handles a zero-variance feature without NaN', () => {
    const X = [[1, 0.2], [1, 0.8], [1, 0.3], [1, 0.9]];
    const y = [0, 1, 0, 1];
    const model = trainLogistic(X, y);
    expect(Number.isFinite(model.weights[0]!)).toBe(true);
    expect(Number.isFinite(predictLogistic(model, [1, 0.7]))).toBe(true);
  });
});
