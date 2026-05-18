/**
 * Industry benchmarks — hard-coded reference values derived from public
 * Mailchimp/Omnisend 2025 reports. Used to compare a campaign's open-rate,
 * click-rate and bounce-rate against the industry median.
 */

export interface Benchmark {
  industry: string;
  openRate: number;        // 0..1
  clickRate: number;
  bounceRate: number;
  unsubRate: number;
}

export const BENCHMARKS: Benchmark[] = [
  { industry: 'ecommerce',     openRate: 0.18, clickRate: 0.012, bounceRate: 0.006, unsubRate: 0.002 },
  { industry: 'retail',        openRate: 0.19, clickRate: 0.015, bounceRate: 0.005, unsubRate: 0.002 },
  { industry: 'saas',          openRate: 0.22, clickRate: 0.023, bounceRate: 0.008, unsubRate: 0.003 },
  { industry: 'media',         openRate: 0.23, clickRate: 0.025, bounceRate: 0.004, unsubRate: 0.002 },
  { industry: 'nonprofit',     openRate: 0.28, clickRate: 0.030, bounceRate: 0.005, unsubRate: 0.001 },
  { industry: 'travel',        openRate: 0.20, clickRate: 0.018, bounceRate: 0.006, unsubRate: 0.002 },
  { industry: 'finance',       openRate: 0.24, clickRate: 0.020, bounceRate: 0.005, unsubRate: 0.002 },
  { industry: 'education',     openRate: 0.28, clickRate: 0.030, bounceRate: 0.004, unsubRate: 0.002 },
  { industry: 'healthcare',    openRate: 0.25, clickRate: 0.021, bounceRate: 0.005, unsubRate: 0.002 },
  { industry: 'b2b',           openRate: 0.21, clickRate: 0.019, bounceRate: 0.007, unsubRate: 0.003 },
  { industry: 'other',         openRate: 0.21, clickRate: 0.018, bounceRate: 0.006, unsubRate: 0.002 },
];

export function getBenchmark(industry: string): Benchmark {
  const match = BENCHMARKS.find((b) => b.industry === industry.toLowerCase());
  return match ?? BENCHMARKS[BENCHMARKS.length - 1]!;
}

export function compareToBenchmark(stats: {
  openRate: number; clickRate: number; bounceRate: number; unsubRate: number;
}, industry: string) {
  const b = getBenchmark(industry);
  const diff = (actual: number, ref: number) => ({
    actual, benchmark: ref,
    deltaPct: ref > 0 ? Math.round(((actual - ref) / ref) * 1000) / 10 : 0,
    verdict: actual >= ref * 1.15 ? 'above' : actual <= ref * 0.85 ? 'below' : 'on_par' as const,
  });
  return {
    industry: b.industry,
    openRate: diff(stats.openRate, b.openRate),
    clickRate: diff(stats.clickRate, b.clickRate),
    bounceRate: diff(stats.bounceRate, b.bounceRate),
    unsubRate: diff(stats.unsubRate, b.unsubRate),
  };
}
