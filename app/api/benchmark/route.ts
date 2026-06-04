import { runBenchmark } from "@/lib/benchmark";
import { BenchmarkRequest, TestType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const clamp = (n: unknown, lo: number, hi: number, fallback: number): number => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.min(hi, Math.max(lo, Math.round(v)));
};

function sanitize(body: any): BenchmarkRequest {
  const allowedTests: TestType[] = ["speed", "concurrency"];
  const tests: TestType[] = Array.isArray(body?.tests)
    ? (body.tests.filter((t: any) => allowedTests.includes(t)) as TestType[])
    : ["speed"];

  const models: string[] = Array.isArray(body?.models)
    ? Array.from(
        new Set<string>(
          body.models
            .filter((m: any) => typeof m === "string" && m.trim().length > 0)
            .map((m: string) => m.trim()),
        ),
      ).slice(0, 6)
    : [];

  let levels: number[] = Array.isArray(body?.concurrencyLevels)
    ? body.concurrencyLevels
        .map((l: any) => clamp(l, 1, 100, 1))
        .filter((l: number) => l > 0)
    : [1, 5, 10];
  levels = Array.from(new Set<number>(levels))
    .sort((a, b) => a - b)
    .slice(0, 8);
  if (levels.length === 0) levels = [1];

  return {
    models,
    inputTokens: clamp(body?.inputTokens, 1, 200_000, 512),
    outputTokens: clamp(body?.outputTokens, 1, 8_000, 256),
    cacheHitRatio: Math.min(1, Math.max(0, Number(body?.cacheHitRatio) || 0)),
    tests: tests.length ? tests : ["speed"],
    speedSamples: clamp(body?.speedSamples, 1, 50, 5),
    concurrencyLevels: levels,
    requestsPerLevel: clamp(body?.requestsPerLevel, 1, 200, 20),
    streaming: body?.streaming !== false,
    temperature: Math.min(2, Math.max(0, Number(body?.temperature) ?? 0.7)),
    mock: body?.mock === true,
    apiKey:
      typeof body?.apiKey === "string" && body.apiKey.trim()
        ? body.apiKey.trim()
        : undefined,
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const req = sanitize(body);
  if (req.models.length === 0) {
    return new Response(
      JSON.stringify({ error: "Select at least one model." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const write = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        for await (const ev of runBenchmark(req)) write(ev);
      } catch (e: any) {
        write({ type: "error", message: e?.message || String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
