/**
 * Tiny, dependency-free binary logistic regression — batch gradient descent with
 * feature standardisation and L2 regularisation. Deterministic (zero init, no
 * randomness) so the same data always yields the same model — unit-testable.
 *
 * This is the reusable "fit weights from data" primitive that replaces
 * hand-tuned constant weights across the scoring services.
 */

export interface LogisticModel {
  /** Standardised-space coefficients, one per feature. */
  weights: number[];
  bias: number;
  /** Per-feature standardisation params captured at fit time. */
  mean: number[];
  std: number[];
  /** Number of training rows the model was fit on (for confidence gating). */
  n: number;
}

export interface TrainOptions {
  iterations?: number;
  learningRate?: number;
  l2?: number;
}

export function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

function standardiseParams(X: number[][]): { mean: number[]; std: number[] } {
  const n = X.length;
  const d = X[0]?.length ?? 0;
  const mean = new Array(d).fill(0) as number[];
  const std = new Array(d).fill(0) as number[];
  for (const row of X) for (let j = 0; j < d; j++) mean[j]! += row[j]! / n;
  for (const row of X) for (let j = 0; j < d; j++) std[j]! += (row[j]! - mean[j]!) ** 2 / n;
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j]!) || 1; // guard zero-variance
  return { mean, std };
}

/** Fit a logistic model. X: rows of features, y: 0/1 labels. */
export function trainLogistic(X: number[][], y: number[], opts: TrainOptions = {}): LogisticModel {
  const iterations = opts.iterations ?? 600;
  const lr = opts.learningRate ?? 0.3;
  const l2 = opts.l2 ?? 1e-3;
  const n = X.length;
  const d = X[0]?.length ?? 0;

  const { mean, std } = standardiseParams(X);
  const Z = X.map((row) => row.map((v, j) => (v - mean[j]!) / std[j]!));

  const weights = new Array(d).fill(0) as number[];
  let bias = 0;

  for (let it = 0; it < iterations; it++) {
    const gradW = new Array(d).fill(0) as number[];
    let gradB = 0;
    for (let i = 0; i < n; i++) {
      const row = Z[i]!;
      let zsum = bias;
      for (let j = 0; j < d; j++) zsum += weights[j]! * row[j]!;
      const err = sigmoid(zsum) - y[i]!;
      for (let j = 0; j < d; j++) gradW[j]! += (err * row[j]!) / n;
      gradB += err / n;
    }
    for (let j = 0; j < d; j++) weights[j]! -= lr * (gradW[j]! + l2 * weights[j]!);
    bias -= lr * gradB;
  }

  return { weights, bias, mean, std, n };
}

/** Predict P(y=1) for a raw (un-standardised) feature vector. */
export function predictLogistic(model: LogisticModel, x: number[]): number {
  let z = model.bias;
  for (let j = 0; j < model.weights.length; j++) {
    const v = ((x[j] ?? 0) - (model.mean[j] ?? 0)) / (model.std[j] || 1);
    z += model.weights[j]! * v;
  }
  return sigmoid(z);
}
