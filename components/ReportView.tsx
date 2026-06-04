"use client";

import {
  ConcurrencyResult,
  RequestSample,
  SpeedResult,
  TestType,
} from "@/lib/types";
import { labelFor } from "./colors";

export interface RunConfig {
  models: string[];
  inputTokens: number;
  outputTokens: number;
  cachePct: number;
  tests: TestType[];
  speedSamples: number;
  concurrencyLevels: number[];
  requestsPerLevel: number;
  streaming: boolean;
  temperature: number;
  mock: boolean;
  generatedAt: string;
}

const secs = (msVal: number) => (msVal / 1000).toFixed(2);
const n1 = (x: number) => x.toFixed(1);
const n0 = (x: number) => Math.round(x).toString();

// Annotate warmup rows: cold start (first), fastest, slowest (excl. first)
function warmupNotes(samples: RequestSample[]): string[] {
  const notes: string[] = samples.map(() => "");
  const okIdx = samples
    .map((s, i) => ({ s, i }))
    .filter((x) => x.s.ok);
  if (okIdx.length) {
    let fastest = okIdx[0];
    for (const x of okIdx) if (x.s.totalMs < fastest.s.totalMs) fastest = x;
    const exclFirst = okIdx.filter((x) => x.i !== 0);
    let slowest = exclFirst[0];
    for (const x of exclFirst) if (x.s.totalMs > slowest.s.totalMs) slowest = x;
    if (fastest) notes[fastest.i] = "Fastest";
    if (slowest && slowest.i !== fastest.i)
      notes[slowest.i] = notes[slowest.i] ? notes[slowest.i] : "Slowest";
  }
  if (samples.length) notes[0] = notes[0] ? `Cold start, ${notes[0]}` : "Cold start";
  return notes;
}

function ModelReport({
  model,
  speed,
  conc,
}: {
  model: string;
  speed?: SpeedResult;
  conc?: ConcurrencyResult;
}) {
  const okCount = speed ? speed.samples.filter((s) => s.ok).length : 0;
  const notes = speed ? warmupNotes(speed.samples) : [];

  // TTFT best/worst callouts
  let ttftCallout = "";
  if (conc && conc.points.length) {
    const byP50 = [...conc.points].sort(
      (a, b) => a.stats.ttftMs.p50 - b.stats.ttftMs.p50,
    );
    const best = byP50[0];
    const worst = byP50[byP50.length - 1];
    ttftCallout = `Best P50: ${secs(best.stats.ttftMs.p50)}s at concurrency ${best.concurrency}. Worst P50: ${secs(worst.stats.ttftMs.p50)}s at concurrency ${worst.concurrency}.`;
  }

  // OTPS peak callout
  let otpsCallout = "";
  if (conc && conc.points.length) {
    const byOtps = [...conc.points].sort(
      (a, b) => b.stats.tokensPerSec.mean - a.stats.tokensPerSec.mean,
    );
    const peak = byOtps[0];
    otpsCallout = `Peak avg OTPS: ${n1(peak.stats.tokensPerSec.mean)} tokens/s at concurrency ${peak.concurrency}.`;
  }

  return (
    <div className="card space-y-5">
      <h3 className="text-base font-semibold text-white">{labelFor(model)}</h3>

      {speed && (
        <section>
          <div className="mb-2 text-sm font-medium text-accent2">Warmup</div>
          <div
            className={`mb-2 rounded-md border px-3 py-2 text-xs ${
              okCount === speed.samples.length
                ? "border-ok/40 bg-ok/10 text-ok"
                : "border-warn/40 bg-warn/10 text-warn"
            }`}
          >
            {okCount}/{speed.samples.length} successful · avg latency{" "}
            {secs(speed.stats.totalMs.mean)}s · first request reflects cold start
          </div>
          <div className="overflow-x-auto">
            <table className="bench">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Status</th>
                  <th>Latency (s)</th>
                  <th>Output Tokens</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {speed.samples.map((s, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td className={s.ok ? "text-ok" : "text-bad"}>
                      {s.ok ? "OK" : "ERR"}
                    </td>
                    <td>{secs(s.totalMs)}</td>
                    <td>{s.ok ? n0(s.outputTokens) : "-"}</td>
                    <td className="text-muted">{notes[i]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {conc && conc.points.length > 0 && (
        <>
          <section>
            <div className="mb-2 text-sm font-medium text-accent2">
              TTFT by concurrency
            </div>
            <div className="overflow-x-auto">
              <table className="bench">
                <thead>
                  <tr>
                    <th>Concurrency</th>
                    <th>P50 (s)</th>
                    <th>P90 (s)</th>
                    <th>P95 (s)</th>
                    <th>Avg (s)</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {conc.points.map((p) => (
                    <tr key={p.concurrency}>
                      <td>{p.concurrency}</td>
                      <td>{secs(p.stats.ttftMs.p50)}</td>
                      <td>{secs(p.stats.ttftMs.p90)}</td>
                      <td>{secs(p.stats.ttftMs.p95)}</td>
                      <td>{secs(p.stats.ttftMs.mean)}</td>
                      <td className={p.stats.errors ? "text-bad" : ""}>
                        {p.stats.errors}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ttftCallout && (
              <p className="mt-1 text-[11px] text-muted">{ttftCallout}</p>
            )}
          </section>

          <section>
            <div className="mb-2 text-sm font-medium text-accent2">
              OTPS / TPOT by concurrency
            </div>
            <div className="overflow-x-auto">
              <table className="bench">
                <thead>
                  <tr>
                    <th>Concurrency</th>
                    <th>Avg OTPS</th>
                    <th>P50 OTPS</th>
                    <th>P10 OTPS</th>
                    <th>Avg TPOT (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {conc.points.map((p) => (
                    <tr key={p.concurrency}>
                      <td>{p.concurrency}</td>
                      <td>{n1(p.stats.tokensPerSec.mean)}</td>
                      <td>{n1(p.stats.tokensPerSec.p50)}</td>
                      <td>{n1(p.stats.tokensPerSec.p10)}</td>
                      <td>{n1(p.stats.tpotMs.mean)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {otpsCallout && (
              <p className="mt-1 text-[11px] text-muted">{otpsCallout}</p>
            )}
            <p className="mt-1 text-[11px] text-muted">
              OTPS = output tokens per second per request. TPOT = time per output
              token (generation time / output tokens).
            </p>
          </section>
        </>
      )}
    </div>
  );
}

export default function ReportView({
  config,
  speed,
  conc,
}: {
  config: RunConfig;
  speed: SpeedResult[];
  conc: ConcurrencyResult[];
}) {
  const endpoint = config.mock
    ? "mock (simulated, no API calls)"
    : "https://inference.do-ai.run/v1";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
          Benchmark report
        </h2>
        <button
          className="btn-ghost"
          onClick={() => downloadReportHtml(config, speed, conc)}
        >
          Download report (HTML)
        </button>
      </div>

      {/* Test Configuration */}
      <div className="card overflow-x-auto">
        <div className="mb-2 text-sm font-medium text-white">
          Test Configuration
        </div>
        <table className="bench">
          <tbody>
            <ConfigRow label="Models" value={config.models.map(labelFor).join(", ")} />
            <ConfigRow label="Endpoint" value={endpoint} />
            <ConfigRow
              label="Input length (ISL)"
              value={`~${config.inputTokens.toLocaleString()} tokens per request`}
            />
            <ConfigRow
              label="Output length (OSL)"
              value={`max ${config.outputTokens.toLocaleString()} tokens`}
            />
            <ConfigRow
              label="Cache simulation"
              value={`${config.cachePct}% of input sent as a shared, cacheable prefix`}
            />
            {config.tests.includes("speed") && (
              <ConfigRow
                label="Warmup requests"
                value={`${config.speedSamples} sequential`}
              />
            )}
            {config.tests.includes("concurrency") && (
              <>
                <ConfigRow
                  label="Concurrency levels"
                  value={config.concurrencyLevels.join(", ")}
                />
                <ConfigRow
                  label="Requests per level"
                  value={config.requestsPerLevel.toString()}
                />
              </>
            )}
            <ConfigRow label="Streaming" value={config.streaming ? "on" : "off"} />
            <ConfigRow label="Temperature" value={config.temperature.toString()} />
            <ConfigRow
              label="Generated"
              value={new Date(config.generatedAt).toLocaleString()}
            />
          </tbody>
        </table>
      </div>

      {config.models.map((m) => (
        <ModelReport
          key={m}
          model={m}
          speed={speed.find((s) => s.model === m)}
          conc={conc.find((c) => c.model === m)}
        />
      ))}
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="text-muted" style={{ width: "40%" }}>
        {label}
      </td>
      <td>{value}</td>
    </tr>
  );
}

// ---- Standalone (light, printable) HTML report export ----

function downloadReportHtml(
  config: RunConfig,
  speed: SpeedResult[],
  conc: ConcurrencyResult[],
) {
  const html = buildReportHtml(config, speed, conc);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "do-inference-benchmark-report.html";
  a.click();
  URL.revokeObjectURL(url);
}

function esc(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
}

function buildReportHtml(
  config: RunConfig,
  speed: SpeedResult[],
  conc: ConcurrencyResult[],
) {
  const endpoint = config.mock
    ? "mock (simulated, no API calls)"
    : "https://inference.do-ai.run/v1";

  const cfgRows = [
    ["Models", config.models.map(labelFor).join(", ")],
    ["Endpoint", endpoint],
    ["Input length (ISL)", `~${config.inputTokens.toLocaleString()} tokens per request`],
    ["Output length (OSL)", `max ${config.outputTokens.toLocaleString()} tokens`],
    ["Cache simulation", `${config.cachePct}% shared cacheable prefix`],
    ["Concurrency levels", config.concurrencyLevels.join(", ")],
    ["Requests per level", String(config.requestsPerLevel)],
    ["Warmup requests", `${config.speedSamples} sequential`],
    ["Streaming", config.streaming ? "on" : "off"],
    ["Temperature", String(config.temperature)],
    ["Generated", new Date(config.generatedAt).toLocaleString()],
  ]
    .map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`)
    .join("");

  const modelSections = config.models
    .map((m) => {
      const sp = speed.find((s) => s.model === m);
      const co = conc.find((c) => c.model === m);
      let out = `<h2>${esc(labelFor(m))}</h2>`;

      if (sp) {
        const ok = sp.samples.filter((s) => s.ok).length;
        const notes = warmupNotes(sp.samples);
        const rows = sp.samples
          .map(
            (s, i) =>
              `<tr><td>${i + 1}</td><td class="${s.ok ? "ok" : "bad"}">${s.ok ? "OK" : "ERR"}</td><td>${secs(s.totalMs)}</td><td>${s.ok ? n0(s.outputTokens) : "-"}</td><td>${esc(notes[i])}</td></tr>`,
          )
          .join("");
        out += `<h3>Warmup</h3><p class="note">${ok}/${sp.samples.length} successful, avg latency ${secs(sp.stats.totalMs.mean)}s</p>
        <table><thead><tr><th>Request</th><th>Status</th><th>Latency (s)</th><th>Output Tokens</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>`;
      }

      if (co && co.points.length) {
        const ttftRows = co.points
          .map(
            (p) =>
              `<tr><td>${p.concurrency}</td><td>${secs(p.stats.ttftMs.p50)}</td><td>${secs(p.stats.ttftMs.p90)}</td><td>${secs(p.stats.ttftMs.p95)}</td><td>${secs(p.stats.ttftMs.mean)}</td><td>${p.stats.errors}</td></tr>`,
          )
          .join("");
        const otpsRows = co.points
          .map(
            (p) =>
              `<tr><td>${p.concurrency}</td><td>${n1(p.stats.tokensPerSec.mean)}</td><td>${n1(p.stats.tokensPerSec.p50)}</td><td>${n1(p.stats.tokensPerSec.p10)}</td><td>${n1(p.stats.tpotMs.mean)}</td></tr>`,
          )
          .join("");
        out += `<h3>TTFT by concurrency</h3>
        <table><thead><tr><th>Concurrency</th><th>P50 (s)</th><th>P90 (s)</th><th>P95 (s)</th><th>Avg (s)</th><th>Errors</th></tr></thead><tbody>${ttftRows}</tbody></table>
        <h3>OTPS / TPOT by concurrency</h3>
        <table><thead><tr><th>Concurrency</th><th>Avg OTPS</th><th>P50 OTPS</th><th>P10 OTPS</th><th>Avg TPOT (ms)</th></tr></thead><tbody>${otpsRows}</tbody></table>`;
      }
      return out;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>DigitalOcean Inference Benchmark Report</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a2235;margin:32px;max-width:900px}
  h1{color:#0069ff;font-size:22px}
  h2{color:#0069ff;font-size:18px;margin-top:28px;border-bottom:2px solid #e3e9f5;padding-bottom:4px}
  h3{color:#1a2235;font-size:14px;margin-top:18px}
  table{border-collapse:collapse;width:100%;margin:8px 0;font-size:13px}
  th{background:#0069ff;color:#fff;text-align:left;padding:8px;font-weight:600}
  td{padding:8px;border-bottom:1px solid #eef2f9}
  tr:nth-child(even) td{background:#f6f9ff}
  td.k{color:#5b6b86;width:38%}
  .ok{color:#1a8f3c;font-weight:600}.bad{color:#d12c2c;font-weight:600}
  .note{color:#5b6b86;font-size:12px;margin:4px 0}
  .sub{color:#5b6b86;font-size:12px}
</style></head><body>
<h1>DigitalOcean Inference Benchmark Report</h1>
<p class="sub">Serverless Inference engine, OpenAI-compatible endpoint. All figures are measured results.</p>
<h2>Test Configuration</h2>
<table><tbody>${cfgRows}</tbody></table>
${modelSections}
</body></html>`;
}
