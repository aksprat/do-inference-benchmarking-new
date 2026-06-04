import { Percentiles, RequestSample, Stats } from "./types";

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

export function summarize(values: number[]): Percentiles {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) {
    return { min: 0, mean: 0, p10: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0 };
  }
  const sum = v.reduce((a, b) => a + b, 0);
  return {
    min: v[0],
    mean: sum / v.length,
    p10: percentile(v, 10),
    p50: percentile(v, 50),
    p90: percentile(v, 90),
    p95: percentile(v, 95),
    p99: percentile(v, 99),
    max: v[v.length - 1],
  };
}

export function buildStats(samples: RequestSample[]): Stats {
  const ok = samples.filter((s) => s.ok);
  const errors = samples.length - ok.length;
  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

  return {
    count: samples.length,
    errors,
    ttftMs: summarize(ok.map((s) => s.ttftMs).filter((x): x is number => x != null)),
    totalMs: summarize(ok.map((s) => s.totalMs)),
    tokensPerSec: summarize(ok.map((s) => s.tokensPerSec)),
    tpotMs: summarize(ok.map((s) => s.tpotMs).filter((x) => x > 0)),
    avgOutputTokens: avg(ok.map((s) => s.outputTokens)),
    avgPromptTokens: avg(ok.map((s) => s.promptTokens)),
    avgCachedTokens: avg(ok.map((s) => s.cachedTokens)),
  };
}
