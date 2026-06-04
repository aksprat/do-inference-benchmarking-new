export type TestType = "speed" | "concurrency";

export interface BenchmarkRequest {
  models: string[];
  inputTokens: number;
  outputTokens: number;
  /** 0..1 - fraction of the input that is sent as a reused, cacheable prefix */
  cacheHitRatio: number;
  tests: TestType[];
  /** sequential requests used for the single-request speed test */
  speedSamples: number;
  /** concurrency levels to sweep, e.g. [1, 5, 10, 25] */
  concurrencyLevels: number[];
  /** total requests fired at each concurrency level */
  requestsPerLevel: number;
  streaming: boolean;
  temperature: number;
  /** run with simulated timings, no API key required */
  mock: boolean;
  /** optional client-supplied model access key (overrides server env) */
  apiKey?: string;
}

export interface RequestSample {
  ok: boolean;
  ttftMs: number | null;
  totalMs: number;
  outputTokens: number;
  promptTokens: number;
  cachedTokens: number;
  tokensPerSec: number;
  tpotMs: number;
  error?: string;
}

export interface Percentiles {
  min: number;
  mean: number;
  p10: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
}

export interface Stats {
  count: number;
  errors: number;
  ttftMs: Percentiles;
  totalMs: Percentiles;
  tokensPerSec: Percentiles;
  tpotMs: Percentiles;
  avgOutputTokens: number;
  avgPromptTokens: number;
  avgCachedTokens: number;
}

export interface SpeedResult {
  model: string;
  stats: Stats;
  samples: RequestSample[];
}

export interface ConcurrencyPoint {
  concurrency: number;
  stats: Stats;
  /** completed requests per second across the whole level */
  reqPerSec: number;
  /** aggregate output tokens per second across the whole level */
  aggTokensPerSec: number;
  wallMs: number;
}

export interface ConcurrencyResult {
  model: string;
  points: ConcurrencyPoint[];
}

export type ProgressEvent =
  | { type: "start"; models: string[]; tests: TestType[] }
  | { type: "log"; message: string }
  | { type: "model-start"; model: string }
  | { type: "speed-progress"; model: string; done: number; total: number }
  | { type: "speed-result"; result: SpeedResult }
  | { type: "concurrency-progress"; model: string; concurrency: number; done: number; total: number }
  | { type: "concurrency-level"; model: string; point: ConcurrencyPoint }
  | { type: "concurrency-result"; result: ConcurrencyResult }
  | { type: "model-done"; model: string }
  | { type: "error"; model?: string; message: string }
  | { type: "done" };
