"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { ConcurrencyResult, SpeedResult } from "@/lib/types";
import { colorFor, labelFor } from "./colors";

const AXIS = { stroke: "#8aa0c2", fontSize: 11 };
const GRID = "#1e2d4d";

const tooltipStyle = {
  backgroundColor: "#0f1b33",
  border: "1px solid #1e2d4d",
  borderRadius: 8,
  fontSize: 12,
};

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="mb-3">
        <div className="text-sm font-medium text-white">{title}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>{children as any}</ResponsiveContainer>
      </div>
    </div>
  );
}

export function SpeedCharts({ results }: { results: SpeedResult[] }) {
  if (results.length === 0) return null;

  const ttftData = results.map((r) => ({
    model: labelFor(r.model),
    p50: Math.round(r.stats.ttftMs.p50),
    p95: Math.round(r.stats.ttftMs.p95),
  }));
  const tpsData = results.map((r) => ({
    model: labelFor(r.model),
    tps: Math.round(r.stats.tokensPerSec.p50),
  }));
  const scatterData = results.map((r, i) => ({
    model: labelFor(r.model),
    latency: Math.round(r.stats.totalMs.p50),
    tps: Math.round(r.stats.tokensPerSec.p50),
    color: colorFor(i),
  }));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ChartCard title="Time to first token" hint="lower is better (ms)">
        <BarChart data={ttftData} margin={{ top: 8, right: 8, left: -8, bottom: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey="model" tick={AXIS} interval={0} angle={-12} textAnchor="end" height={50} />
          <YAxis tick={AXIS} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="p50" name="TTFT p50" fill="#00c2ff" radius={[3, 3, 0, 0]} />
          <Bar dataKey="p95" name="TTFT p95" fill="#0069ff" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartCard>

      <ChartCard title="Output throughput" hint="higher is better (tokens/sec, p50)">
        <BarChart data={tpsData} margin={{ top: 8, right: 8, left: -8, bottom: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey="model" tick={AXIS} interval={0} angle={-12} textAnchor="end" height={50} />
          <YAxis tick={AXIS} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="tps" name="tokens/sec" fill="#22c55e" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartCard>

      <ChartCard
        title="Latency vs throughput"
        hint="top-left is ideal: fast first token, high tok/sec"
      >
        <ScatterChart margin={{ top: 8, right: 16, left: -8, bottom: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="latency"
            name="latency"
            unit="ms"
            tick={AXIS}
          />
          <YAxis
            type="number"
            dataKey="tps"
            name="tok/s"
            tick={AXIS}
          />
          <ZAxis range={[120, 120]} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: "3 3" }} />
          {scatterData.map((d) => (
            <Scatter key={d.model} name={d.model} data={[d]} fill={d.color} />
          ))}
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </ScatterChart>
      </ChartCard>
    </div>
  );
}

export function ConcurrencyCharts({
  results,
}: {
  results: ConcurrencyResult[];
}) {
  if (results.length === 0) return null;

  const levels = Array.from(
    new Set(results.flatMap((r) => r.points.map((p) => p.concurrency))),
  ).sort((a, b) => a - b);

  const latencyData = levels.map((c) => {
    const row: Record<string, number> = { concurrency: c };
    results.forEach((r) => {
      const pt = r.points.find((p) => p.concurrency === c);
      if (pt) row[labelFor(r.model)] = Math.round(pt.stats.totalMs.p95);
    });
    return row;
  });

  const tputData = levels.map((c) => {
    const row: Record<string, number> = { concurrency: c };
    results.forEach((r) => {
      const pt = r.points.find((p) => p.concurrency === c);
      if (pt) row[labelFor(r.model)] = Math.round(pt.aggTokensPerSec);
    });
    return row;
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ChartCard
        title="p95 latency under load"
        hint="end-to-end ms as concurrency rises (lower/flatter is better)"
      >
        <LineChart data={latencyData} margin={{ top: 8, right: 16, left: -8, bottom: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey="concurrency" tick={AXIS} />
          <YAxis tick={AXIS} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {results.map((r, i) => (
            <Line
              key={r.model}
              type="monotone"
              dataKey={labelFor(r.model)}
              stroke={colorFor(i)}
              strokeWidth={2}
              dot={{ r: 2 }}
            />
          ))}
        </LineChart>
      </ChartCard>

      <ChartCard
        title="Aggregate throughput under load"
        hint="total tokens/sec across all concurrent requests (higher is better)"
      >
        <LineChart data={tputData} margin={{ top: 8, right: 16, left: -8, bottom: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey="concurrency" tick={AXIS} />
          <YAxis tick={AXIS} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {results.map((r, i) => (
            <Line
              key={r.model}
              type="monotone"
              dataKey={labelFor(r.model)}
              stroke={colorFor(i)}
              strokeWidth={2}
              dot={{ r: 2 }}
            />
          ))}
        </LineChart>
      </ChartCard>
    </div>
  );
}
