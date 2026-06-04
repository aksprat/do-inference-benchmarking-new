import OpenAI from "openai";
import { buildPrompt } from "./prompt";
import { buildStats } from "./stats";
import {
  BenchmarkRequest,
  ConcurrencyPoint,
  ProgressEvent,
  RequestSample,
} from "./types";

const DEFAULT_BASE_URL =
  process.env.DO_INFERENCE_BASE_URL || "https://inference.do-ai.run/v1";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const estimateTokens = (text: string) => Math.max(1, Math.round(text.length / 4));

function makeClient(req: BenchmarkRequest): OpenAI {
  const apiKey = req.apiKey || process.env.DO_MODEL_ACCESS_KEY || "";
  return new OpenAI({
    apiKey,
    baseURL: DEFAULT_BASE_URL,
    maxRetries: 0,
    timeout: 120_000,
  });
}

async function runRealRequest(
  client: OpenAI,
  model: string,
  req: BenchmarkRequest,
  idx: number,
): Promise<RequestSample> {
  const { system, user } = buildPrompt(
    req.inputTokens,
    req.cacheHitRatio,
    req.outputTokens,
    idx,
  );
  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
  const start = performance.now();
  let ttft: number | null = null;
  let outText = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let cachedTokens = 0;

  try {
    if (req.streaming) {
      const stream = await client.chat.completions.create({
        model,
        messages,
        max_tokens: req.outputTokens,
        temperature: req.temperature,
        stream: true,
        stream_options: { include_usage: true },
      });
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          if (ttft === null) ttft = performance.now() - start;
          outText += delta;
        }
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens ?? promptTokens;
          completionTokens = chunk.usage.completion_tokens ?? completionTokens;
          cachedTokens =
            (chunk.usage as any).prompt_tokens_details?.cached_tokens ??
            cachedTokens;
        }
      }
    } else {
      const resp = await client.chat.completions.create({
        model,
        messages,
        max_tokens: req.outputTokens,
        temperature: req.temperature,
        stream: false,
      });
      outText = resp.choices?.[0]?.message?.content ?? "";
      promptTokens = resp.usage?.prompt_tokens ?? 0;
      completionTokens = resp.usage?.completion_tokens ?? 0;
      cachedTokens =
        (resp.usage as any)?.prompt_tokens_details?.cached_tokens ?? 0;
    }

    const totalMs = performance.now() - start;
    const outTok = completionTokens || estimateTokens(outText);
    const genMs =
      req.streaming && ttft != null ? Math.max(1, totalMs - ttft) : totalMs;
    const tokensPerSec = outTok > 0 ? outTok / (genMs / 1000) : 0;
    const tpotMs = outTok > 0 ? genMs / outTok : 0;

    return {
      ok: true,
      ttftMs: req.streaming ? ttft : null,
      totalMs,
      outputTokens: outTok,
      promptTokens,
      cachedTokens,
      tokensPerSec,
      tpotMs,
    };
  } catch (e: any) {
    return {
      ok: false,
      ttftMs: null,
      totalMs: performance.now() - start,
      outputTokens: 0,
      promptTokens: 0,
      cachedTokens: 0,
      tokensPerSec: 0,
      tpotMs: 0,
      error: e?.message || String(e),
    };
  }
}

function mockProfile(model: string): { baseTtft: number; msPerToken: number } {
  let h = 2166136261;
  for (let i = 0; i < model.length; i++) {
    h ^= model.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = (h >>> 0) % 1000 / 1000;
  const b = (h >>> 9) % 1000 / 1000;
  return {
    baseTtft: 110 + a * 420, // 110..530 ms
    msPerToken: 4 + b * 26, // 4..30 ms/token  ->  ~33..250 tok/s
  };
}

async function runMockRequest(
  model: string,
  req: BenchmarkRequest,
  idx: number,
): Promise<RequestSample> {
  const { baseTtft, msPerToken } = mockProfile(model);
  const jitter = (f: number) => f * (0.85 + Math.random() * 0.3);
  const cacheFactor = 1 - 0.6 * req.cacheHitRatio; // cache shaves prefill
  const ttft = jitter(baseTtft + req.inputTokens * 0.05 * cacheFactor);
  const outTok = Math.max(
    1,
    Math.round(req.outputTokens * (0.7 + Math.random() * 0.3)),
  );
  const genMs = jitter(outTok * msPerToken);
  const totalMs = ttft + genMs;

  // keep simulated runs snappy while reporting realistic timings
  await sleep(Math.min(totalMs / 8, 80));

  if (Math.random() < 0.01) {
    return {
      ok: false,
      ttftMs: null,
      totalMs,
      outputTokens: 0,
      promptTokens: req.inputTokens,
      cachedTokens: 0,
      tokensPerSec: 0,
      tpotMs: 0,
      error: "simulated timeout",
    };
  }

  return {
    ok: true,
    ttftMs: req.streaming ? ttft : null,
    totalMs,
    outputTokens: outTok,
    promptTokens: req.inputTokens,
    cachedTokens: Math.round(req.inputTokens * req.cacheHitRatio),
    tokensPerSec: outTok / (genMs / 1000),
    tpotMs: outTok > 0 ? genMs / outTok : 0,
  };
}

export async function* runBenchmark(
  req: BenchmarkRequest,
): AsyncGenerator<ProgressEvent> {
  yield { type: "start", models: req.models, tests: req.tests };

  const client = req.mock ? null : makeClient(req);
  if (!req.mock) {
    const key = req.apiKey || process.env.DO_MODEL_ACCESS_KEY;
    if (!key) {
      yield {
        type: "error",
        message:
          "No model access key found. Set DO_MODEL_ACCESS_KEY, paste a key in the UI, or enable Mock mode.",
      };
      yield { type: "done" };
      return;
    }
  }

  const runOne = (model: string, idx: number) =>
    req.mock
      ? runMockRequest(model, req, idx)
      : runRealRequest(client!, model, req, idx);

  for (const model of req.models) {
    yield { type: "model-start", model };

    // Speed test - sequential single requests
    if (req.tests.includes("speed")) {
      const samples: RequestSample[] = [];
      for (let i = 0; i < req.speedSamples; i++) {
        samples.push(await runOne(model, i));
        yield {
          type: "speed-progress",
          model,
          done: i + 1,
          total: req.speedSamples,
        };
      }
      yield {
        type: "speed-result",
        result: { model, stats: buildStats(samples), samples },
      };
    }

    // Concurrency sweep
    if (req.tests.includes("concurrency")) {
      const points: ConcurrencyPoint[] = [];
      for (const level of req.concurrencyLevels) {
        const total = req.requestsPerLevel;
        const results: RequestSample[] = [];
        const inflight = new Map<
          number,
          Promise<{ key: number; sample: RequestSample }>
        >();
        let launched = 0;
        let key = 0;
        let completed = 0;
        const wallStart = performance.now();

        const launch = (i: number) => {
          const k = key++;
          inflight.set(
            k,
            runOne(model, i).then((sample) => ({ key: k, sample })),
          );
        };
        while (launched < total && inflight.size < level) launch(launched++);

        while (inflight.size > 0) {
          const { key: k, sample } = await Promise.race(inflight.values());
          inflight.delete(k);
          results.push(sample);
          completed++;
          yield {
            type: "concurrency-progress",
            model,
            concurrency: level,
            done: completed,
            total,
          };
          while (launched < total && inflight.size < level) launch(launched++);
        }

        const wallMs = performance.now() - wallStart;
        const ok = results.filter((r) => r.ok);
        const aggOut = ok.reduce((a, r) => a + r.outputTokens, 0);
        const point: ConcurrencyPoint = {
          concurrency: level,
          stats: buildStats(results),
          reqPerSec: ok.length / (wallMs / 1000),
          aggTokensPerSec: aggOut / (wallMs / 1000),
          wallMs,
        };
        points.push(point);
        yield { type: "concurrency-level", model, point };
      }
      yield { type: "concurrency-result", result: { model, points } };
    }

    yield { type: "model-done", model };
  }

  yield { type: "done" };
}
