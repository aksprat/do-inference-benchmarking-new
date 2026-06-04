"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_MODELS,
  MODELS,
  MODELS_DOC_URL,
  ModelInfo,
} from "@/lib/models";
import {
  ConcurrencyResult,
  ProgressEvent,
  SpeedResult,
  TestType,
} from "@/lib/types";
import { ConcurrencyCharts, SpeedCharts } from "./Charts";
import ReportView, { RunConfig } from "./ReportView";
import { colorFor, labelFor } from "./colors";

const ms = (n: number) => `${Math.round(n)} ms`;
const f1 = (n: number) => n.toFixed(1);
const KEY_STORAGE = "do_model_access_key";

export default function Benchmarker() {
  const [selected, setSelected] = useState<string[]>(DEFAULT_MODELS);
  const [customId, setCustomId] = useState("");

  const [inputTokens, setInputTokens] = useState(512);
  const [outputTokens, setOutputTokens] = useState(256);
  const [cachePct, setCachePct] = useState(0);
  const [tests, setTests] = useState<TestType[]>(["speed", "concurrency"]);
  const [speedSamples, setSpeedSamples] = useState(5);
  const [levelsText, setLevelsText] = useState("1, 5, 10, 25");
  const [requestsPerLevel, setRequestsPerLevel] = useState(20);
  const [streaming, setStreaming] = useState(true);
  const [temperature, setTemperature] = useState(0.7);
  const [mock, setMock] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [rememberKey, setRememberKey] = useState(false);

  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [speedResults, setSpeedResults] = useState<SpeedResult[]>([]);
  const [concResults, setConcResults] = useState<ConcurrencyResult[]>([]);
  const [runConfig, setRunConfig] = useState<RunConfig | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY_STORAGE);
      if (saved) {
        setApiKey(saved);
        setRememberKey(true);
      }
    } catch {}
  }, []);

  const updateKey = (val: string) => {
    setApiKey(val);
    if (rememberKey) {
      try {
        localStorage.setItem(KEY_STORAGE, val);
      } catch {}
    }
  };

  const updateRemember = (val: boolean) => {
    setRememberKey(val);
    try {
      if (val) localStorage.setItem(KEY_STORAGE, apiKey);
      else localStorage.removeItem(KEY_STORAGE);
    } catch {}
  };

  const grouped = useMemo(() => {
    const g: Record<string, ModelInfo[]> = {};
    for (const m of MODELS) (g[m.provider] ||= []).push(m);
    return g;
  }, []);

  const toggleModel = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : s.length >= 6 ? s : [...s, id],
    );

  const addCustom = () => {
    const id = customId.trim();
    if (id && !selected.includes(id) && selected.length < 6) {
      setSelected((s) => [...s, id]);
    }
    setCustomId("");
  };

  const toggleTest = (t: TestType) =>
    setTests((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));

  const concurrencyLevels = useMemo(
    () =>
      levelsText
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0),
    [levelsText],
  );

  const canRun = !running && selected.length > 0 && tests.length > 0;

  async function run() {
    setRunning(true);
    setError("");
    setStatus("Starting...");
    setSpeedResults([]);
    setConcResults([]);
    setRunConfig({
      models: selected,
      inputTokens,
      outputTokens,
      cachePct,
      tests,
      speedSamples,
      concurrencyLevels: concurrencyLevels.length ? concurrencyLevels : [1],
      requestsPerLevel,
      streaming,
      temperature,
      mock,
      generatedAt: new Date().toISOString(),
    });

    const payload = {
      models: selected,
      inputTokens,
      outputTokens,
      cacheHitRatio: cachePct / 100,
      tests,
      speedSamples,
      concurrencyLevels: concurrencyLevels.length ? concurrencyLevels : [1],
      requestsPerLevel,
      streaming,
      temperature,
      mock,
      apiKey: apiKey || undefined,
    };

    try {
      const res = await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) {
        const e = await res.json().catch(() => ({ error: res.statusText }));
        setError(e.error || "Request failed");
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) handleEvent(JSON.parse(line) as ProgressEvent);
        }
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setRunning(false);
      setStatus("");
    }
  }

  function handleEvent(ev: ProgressEvent) {
    switch (ev.type) {
      case "model-start":
        setStatus(`Benchmarking ${labelFor(ev.model)}...`);
        break;
      case "speed-progress":
        setStatus(
          `${labelFor(ev.model)} - speed ${ev.done}/${ev.total}`,
        );
        break;
      case "speed-result":
        setSpeedResults((r) => [
          ...r.filter((x) => x.model !== ev.result.model),
          ev.result,
        ]);
        break;
      case "concurrency-progress":
        setStatus(
          `${labelFor(ev.model)} - load @${ev.concurrency} (${ev.done}/${ev.total})`,
        );
        break;
      case "concurrency-result":
        setConcResults((r) => [
          ...r.filter((x) => x.model !== ev.result.model),
          ev.result,
        ]);
        break;
      case "error":
        setError(ev.message);
        break;
      case "done":
        setStatus("Done");
        break;
    }
  }

  function downloadJSON() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            config: {
              models: selected,
              inputTokens,
              outputTokens,
              cacheHitRatio: cachePct / 100,
              tests,
              speedSamples,
              concurrencyLevels,
              requestsPerLevel,
              streaming,
              temperature,
              mock,
            },
            speedResults,
            concResults,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    triggerDownload(blob, "do-inference-benchmark.json");
  }

  function downloadCSV() {
    const rows: string[] = [];
    rows.push("section,model,concurrency,samples,errors,ttft_p50_ms,ttft_p95_ms,e2e_p50_ms,e2e_p95_ms,tok_per_sec_p50,req_per_sec,agg_tok_per_sec,avg_out_tokens,avg_cached_tokens");
    for (const r of speedResults) {
      const s = r.stats;
      rows.push(
        `speed,${r.model},1,${s.count},${s.errors},${f1(s.ttftMs.p50)},${f1(s.ttftMs.p95)},${f1(s.totalMs.p50)},${f1(s.totalMs.p95)},${f1(s.tokensPerSec.p50)},,,${f1(s.avgOutputTokens)},${f1(s.avgCachedTokens)}`,
      );
    }
    for (const r of concResults) {
      for (const p of r.points) {
        const s = p.stats;
        rows.push(
          `concurrency,${r.model},${p.concurrency},${s.count},${s.errors},${f1(s.ttftMs.p50)},${f1(s.ttftMs.p95)},${f1(s.totalMs.p50)},${f1(s.totalMs.p95)},${f1(s.tokensPerSec.p50)},${f1(p.reqPerSec)},${f1(p.aggTokensPerSec)},${f1(s.avgOutputTokens)},${f1(s.avgCachedTokens)}`,
        );
      }
    }
    triggerDownload(
      new Blob([rows.join("\n")], { type: "text/csv" }),
      "do-inference-benchmark.csv",
    );
  }

  const hasResults = speedResults.length > 0 || concResults.length > 0;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            DigitalOcean Inference Benchmark
          </h1>
          <p className="text-sm text-muted">
            Compare latency, throughput and concurrency across models on the
            Serverless Inference engine.
          </p>
        </div>
        <a
          className="btn-ghost"
          href={MODELS_DOC_URL}
          target="_blank"
          rel="noreferrer"
        >
          Model list and IDs
        </a>
      </header>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        {/* Config panel */}
        <section className="space-y-4">
          <div className="card">
            <div className="mb-2 flex items-center justify-between">
              <span className="label mb-0">Models ({selected.length}/6)</span>
              <button
                className="text-xs text-muted hover:text-white"
                onClick={() => setSelected([])}
              >
                clear
              </button>
            </div>

            <div className="mb-2 flex flex-wrap gap-1.5">
              {selected.map((id, i) => (
                <span
                  key={id}
                  className="chip"
                  style={{ borderColor: colorFor(i) }}
                >
                  {labelFor(id)}
                  <button
                    className="text-muted hover:text-white"
                    onClick={() => toggleModel(id)}
                  >
                    x
                  </button>
                </span>
              ))}
              {selected.length === 0 && (
                <span className="text-xs text-muted">none selected</span>
              )}
            </div>

            <div className="max-h-48 overflow-y-auto rounded-lg border border-edge bg-ink/40 p-2">
              {Object.entries(grouped).map(([provider, list]) => (
                <div key={provider} className="mb-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">
                    {provider}
                  </div>
                  {list.map((m) => (
                    <label
                      key={m.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-edge/40"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(m.id)}
                        onChange={() => toggleModel(m.id)}
                      />
                      <span className="truncate">{m.label}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>

            <div className="mt-2 flex gap-2">
              <input
                className="input"
                placeholder="add any model ID..."
                value={customId}
                onChange={(e) => setCustomId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustom()}
              />
              <button className="btn-ghost" onClick={addCustom}>
                add
              </button>
            </div>
          </div>

          <div className="card space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Input tokens</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={inputTokens}
                  onChange={(e) => setInputTokens(+e.target.value)}
                />
              </div>
              <div>
                <label className="label">Output tokens</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={outputTokens}
                  onChange={(e) => setOutputTokens(+e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="label">Cache hit ratio: {cachePct}%</label>
              <input
                type="range"
                min={0}
                max={100}
                value={cachePct}
                onChange={(e) => setCachePct(+e.target.value)}
                className="w-full accent-accent"
              />
              <p className="mt-1 text-[11px] text-muted">
                Fraction of input sent as a reused, cacheable prefix. On
                cache-enabled models this lowers TTFT and cached-token counts.
              </p>
            </div>

            <div>
              <label className="label">Tests</label>
              <div className="flex gap-2">
                <button
                  className={tests.includes("speed") ? "btn" : "btn-ghost"}
                  onClick={() => toggleTest("speed")}
                >
                  Speed
                </button>
                <button
                  className={
                    tests.includes("concurrency") ? "btn" : "btn-ghost"
                  }
                  onClick={() => toggleTest("concurrency")}
                >
                  Concurrency
                </button>
              </div>
            </div>

            {tests.includes("speed") && (
              <div>
                <label className="label">Speed samples (sequential)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={50}
                  value={speedSamples}
                  onChange={(e) => setSpeedSamples(+e.target.value)}
                />
              </div>
            )}

            {tests.includes("concurrency") && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Concurrency levels</label>
                  <input
                    className="input"
                    value={levelsText}
                    onChange={(e) => setLevelsText(e.target.value)}
                    placeholder="1, 5, 10, 25"
                  />
                </div>
                <div>
                  <label className="label">Requests / level</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={200}
                    value={requestsPerLevel}
                    onChange={(e) => setRequestsPerLevel(+e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Temperature</label>
                <input
                  className="input"
                  type="number"
                  step={0.1}
                  min={0}
                  max={2}
                  value={temperature}
                  onChange={(e) => setTemperature(+e.target.value)}
                />
              </div>
              <div className="flex items-end gap-4 pb-1">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={streaming}
                    onChange={(e) => setStreaming(e.target.checked)}
                  />
                  streaming
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={mock}
                    onChange={(e) => setMock(e.target.checked)}
                  />
                  mock mode
                </label>
              </div>
            </div>

            <div className="rounded-lg border border-edge bg-ink/40 p-3">
              <div className="mb-1 flex items-center justify-between">
                <label className="label mb-0">Your model access key</label>
                <span
                  className={`text-[11px] ${apiKey ? "text-ok" : "text-muted"}`}
                >
                  {apiKey ? "key set" : "none"}
                </span>
              </div>
              <input
                className="input"
                type="password"
                placeholder="paste your DO Model Access Key"
                value={apiKey}
                onChange={(e) => updateKey(e.target.value)}
                autoComplete="off"
              />
              <label className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                <input
                  type="checkbox"
                  checked={rememberKey}
                  onChange={(e) => updateRemember(e.target.checked)}
                />
                Remember in this browser
              </label>
              <p className="mt-1 text-[11px] text-muted">
                Each teammate uses their own key. It stays in your browser and is
                sent only to this app&apos;s server to call the inference
                endpoint. Leave blank to fall back to a shared server key, if one
                is configured.
              </p>
            </div>

            <button className="btn w-full" disabled={!canRun} onClick={run}>
              {running ? "Running..." : "Run benchmark"}
            </button>

            {mock && (
              <p className="text-center text-[11px] text-warn">
                Mock mode: simulated timings, no API calls. Uncheck to hit the
                live endpoint.
              </p>
            )}
          </div>
        </section>

        {/* Results panel */}
        <section className="space-y-4">
          {(running || status) && (
            <div className="card flex items-center gap-3">
              {running && (
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent2" />
              )}
              <span className="text-sm text-muted">{status || "Ready"}</span>
            </div>
          )}

          {error && (
            <div className="card border-bad/60 text-sm text-bad">{error}</div>
          )}

          {!hasResults && !running && (
            <div className="card text-sm text-muted">
              Pick models, set your token mix, and run. Speed measures TTFT,
              throughput and end-to-end latency per request. Concurrency sweeps
              load to show how p95 latency and aggregate throughput hold up.
            </div>
          )}

          {hasResults && (
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={downloadCSV}>
                Export CSV
              </button>
              <button className="btn-ghost" onClick={downloadJSON}>
                Export JSON
              </button>
            </div>
          )}

          {hasResults && runConfig && (
            <ReportView
              config={runConfig}
              speed={speedResults}
              conc={concResults}
            />
          )}

          {hasResults && (
            <>
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
                Charts (comparison)
              </h2>
              {speedResults.length > 0 && <SpeedCharts results={speedResults} />}
              {concResults.length > 0 && (
                <ConcurrencyCharts results={concResults} />
              )}
            </>
          )}
        </section>
      </div>

      <footer className="mt-8 text-center text-[11px] text-muted">
        Endpoint: inference.do-ai.run/v1 (OpenAI-compatible). Token counts shown
        are the model&apos;s reported usage.
      </footer>
    </main>
  );
}

function SpeedTable({ results }: { results: SpeedResult[] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="bench">
        <thead>
          <tr>
            <th>Model</th>
            <th>TTFT p50</th>
            <th>TTFT p95</th>
            <th>tok/s p50</th>
            <th>E2E p50</th>
            <th>E2E p95</th>
            <th>Out tok</th>
            <th>Cached</th>
            <th>Errors</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={r.model}>
              <td>
                <span
                  className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ background: colorFor(i) }}
                />
                {labelFor(r.model)}
              </td>
              <td>{ms(r.stats.ttftMs.p50)}</td>
              <td>{ms(r.stats.ttftMs.p95)}</td>
              <td>{f1(r.stats.tokensPerSec.p50)}</td>
              <td>{ms(r.stats.totalMs.p50)}</td>
              <td>{ms(r.stats.totalMs.p95)}</td>
              <td>{Math.round(r.stats.avgOutputTokens)}</td>
              <td>{Math.round(r.stats.avgCachedTokens)}</td>
              <td className={r.stats.errors ? "text-bad" : ""}>
                {r.stats.errors}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConcurrencyTable({ results }: { results: ConcurrencyResult[] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="bench">
        <thead>
          <tr>
            <th>Model</th>
            <th>Concurrency</th>
            <th>p50 E2E</th>
            <th>p95 E2E</th>
            <th>p99 E2E</th>
            <th>req/s</th>
            <th>agg tok/s</th>
            <th>Errors</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) =>
            r.points.map((p) => (
              <tr key={`${r.model}-${p.concurrency}`}>
                <td>
                  <span
                    className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                    style={{ background: colorFor(i) }}
                  />
                  {labelFor(r.model)}
                </td>
                <td>{p.concurrency}</td>
                <td>{ms(p.stats.totalMs.p50)}</td>
                <td>{ms(p.stats.totalMs.p95)}</td>
                <td>{ms(p.stats.totalMs.p99)}</td>
                <td>{f1(p.reqPerSec)}</td>
                <td>{f1(p.aggTokensPerSec)}</td>
                <td className={p.stats.errors ? "text-bad" : ""}>
                  {p.stats.errors}
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
