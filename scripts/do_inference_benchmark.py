#!/usr/bin/env python3
"""
DigitalOcean Serverless Inference benchmark - standalone Droplet runner.

Runs the full benchmark and prints a sectioned report (Warmup, TTFT by
concurrency, OTPS/TPOT by concurrency, Sustained load) with the actual measured
results only. No customer-specific targets or pass/fail criteria.

Recommended client: a CPU-Optimized Droplet (16 vCPU / 32 GB), Ubuntu 24.04.

Usage:
  export DO_MODEL_ACCESS_KEY=...        # your Model Access Key
  pip install requests
  python3 do_inference_benchmark.py --model llama3.3-70b-instruct

Common options:
  --model            model ID (see docs.digitalocean.com/products/inference/details/models/)
  --input-tokens     approx input length per request           (default 1500)
  --output-tokens    max output tokens                          (default 64)
  --cache-ratio      fraction of input sent as a shared prefix  (default 0.8)
  --warmup           sequential warmup requests                 (default 10)
  --concurrency      comma list of concurrency levels           (default 1,2,4,8)
  --requests         requests per concurrency level             (default 20)
  --rps              sustained requests/sec                      (default 5)
  --duration         sustained duration in seconds              (default 120)
  --no-sustained     skip the sustained load test
  --out              write the report to this file too

To reproduce a heavy, Tencent-style run:
  python3 do_inference_benchmark.py --model kimi-k2.6 \
    --input-tokens 15000 --output-tokens 64 --cache-ratio 0.8 \
    --warmup 30 --concurrency 1,2,4,8,16,32 --requests 40 \
    --rps 11 --duration 1800
"""

import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

try:
    import requests
except ImportError:
    sys.exit("This script needs 'requests'. Install it with: pip install requests")

DEFAULT_BASE_URL = os.environ.get("DO_INFERENCE_BASE_URL", "https://inference.do-ai.run/v1")

WORDS = (
    "data model token latency throughput vector context window prompt cache infer "
    "gpu cluster region scale request response stream chunk sample compare cost "
    "speed quality agent rag pipeline embed rerank serve deploy platform droplet "
    "ocean gradient kernel matrix weight bias layer attention head decode encode"
).split()


# ----------------------------- helpers -----------------------------

def words(n, seed=0):
    if n <= 0:
        return ""
    out = []
    s = seed & 0x7FFFFFFF
    for _ in range(n):
        s = (s * 1103515245 + 12345) & 0x7FFFFFFF
        out.append(WORDS[s % len(WORDS)])
    return " ".join(out)


def build_messages(input_tokens, cache_ratio, output_tokens, idx):
    ratio = min(1.0, max(0.0, cache_ratio))
    prefix = round(input_tokens * ratio)
    unique = max(1, input_tokens - prefix)
    system = "You are a benchmarking assistant. Reference corpus follows.\n" + words(prefix, 7)
    user = f"req-{idx} " + words(unique, idx + 1) + f"\n\nWrite a detailed continuation of about {output_tokens} tokens."
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def percentile(sorted_vals, p):
    if not sorted_vals:
        return 0.0
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    idx = (p / 100.0) * (len(sorted_vals) - 1)
    lo, hi = int(idx), min(int(idx) + 1, len(sorted_vals) - 1)
    w = idx - lo
    return sorted_vals[lo] * (1 - w) + sorted_vals[hi] * w


def summarize(values):
    v = sorted(x for x in values if x is not None)
    if not v:
        return {"min": 0, "mean": 0, "p10": 0, "p50": 0, "p90": 0, "p95": 0, "p99": 0, "max": 0}
    return {
        "min": v[0],
        "mean": sum(v) / len(v),
        "p10": percentile(v, 10),
        "p50": percentile(v, 50),
        "p90": percentile(v, 90),
        "p95": percentile(v, 95),
        "p99": percentile(v, 99),
        "max": v[-1],
    }


def one_request(session, base_url, api_key, model, cfg, idx):
    """Single streaming chat completion. Returns a result dict."""
    messages = build_messages(cfg["input_tokens"], cfg["cache_ratio"], cfg["output_tokens"], idx)
    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": cfg["output_tokens"],
        "temperature": cfg["temperature"],
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    t0 = time.perf_counter()
    ttft = None
    text = ""
    prompt_tokens = completion_tokens = cached_tokens = 0
    try:
        resp = session.post(
            f"{base_url}/chat/completions", json=payload, headers=headers, stream=True, timeout=300
        )
        if resp.status_code != 200:
            return _fail(time.perf_counter() - t0, f"HTTP {resp.status_code}: {resp.text[:120]}")
        for raw in resp.iter_lines():
            if not raw:
                continue
            if raw.startswith(b"data: "):
                data = raw[6:]
                if data == b"[DONE]":
                    break
                try:
                    obj = json.loads(data)
                except json.JSONDecodeError:
                    continue
                choices = obj.get("choices") or []
                if choices:
                    delta = (choices[0].get("delta") or {}).get("content")
                    if delta:
                        if ttft is None:
                            ttft = time.perf_counter() - t0
                        text += delta
                usage = obj.get("usage")
                if usage:
                    prompt_tokens = usage.get("prompt_tokens", prompt_tokens)
                    completion_tokens = usage.get("completion_tokens", completion_tokens)
                    details = usage.get("prompt_tokens_details") or {}
                    cached_tokens = details.get("cached_tokens", cached_tokens)
        total = time.perf_counter() - t0
        out_tok = completion_tokens or max(1, len(text) // 4)
        gen = max(1e-3, total - ttft) if ttft is not None else total
        return {
            "ok": True,
            "ttft": ttft,
            "total": total,
            "out_tokens": out_tok,
            "prompt_tokens": prompt_tokens,
            "cached_tokens": cached_tokens,
            "otps": out_tok / gen,
            "tpot_ms": (gen / out_tok) * 1000.0,
            "error": None,
        }
    except Exception as e:  # noqa: BLE001
        return _fail(time.perf_counter() - t0, str(e))


def _fail(total, error):
    return {
        "ok": False, "ttft": None, "total": total, "out_tokens": 0,
        "prompt_tokens": 0, "cached_tokens": 0, "otps": 0, "tpot_ms": 0, "error": error,
    }


# ----------------------------- table printing -----------------------------

def render_table(headers, rows):
    cols = len(headers)
    widths = [len(str(h)) for h in headers]
    for r in rows:
        for i in range(cols):
            widths[i] = max(widths[i], len(str(r[i])))
    line = "  ".join(str(h).ljust(widths[i]) for i, h in enumerate(headers))
    sep = "  ".join("-" * widths[i] for i in range(cols))
    body = "\n".join("  ".join(str(r[i]).ljust(widths[i]) for i in range(cols)) for r in rows)
    return f"{line}\n{sep}\n{body}"


# ----------------------------- test phases -----------------------------

def run_warmup(session, base_url, api_key, model, cfg, out):
    out("\n1. WARMUP RESULTS")
    samples = []
    for i in range(cfg["warmup"]):
        s = one_request(session, base_url, api_key, model, cfg, i)
        samples.append(s)
        print(f"  warmup {i + 1}/{cfg['warmup']}  {s['total']:.2f}s  {'OK' if s['ok'] else 'ERR'}",
              file=sys.stderr)
    ok = [s for s in samples if s["ok"]]
    fastest = min(ok, key=lambda s: s["total"]) if ok else None
    excl_first = [s for j, s in enumerate(samples) if s["ok"] and j != 0]
    slowest = max(excl_first, key=lambda s: s["total"]) if excl_first else None
    rows = []
    for i, s in enumerate(samples):
        note = []
        if i == 0:
            note.append("Cold start")
        if s is fastest:
            note.append("Fastest")
        if s is slowest:
            note.append("Slowest")
        rows.append([
            i + 1, "OK" if s["ok"] else "ERR", f"{s['total']:.2f}",
            s["out_tokens"] if s["ok"] else "-", ", ".join(note),
        ])
    avg = sum(s["total"] for s in ok) / len(ok) if ok else 0
    out(f"  {len(ok)}/{len(samples)} successful, average latency {avg:.2f}s")
    out(render_table(["Request", "Status", "Latency (s)", "Output Tokens", "Note"], rows))
    return samples


def run_concurrency(session, base_url, api_key, model, cfg, out):
    out("\n2. TTFT BY CONCURRENCY  /  3. OTPS / TPOT BY CONCURRENCY")
    ttft_rows, otps_rows = [], []
    for level in cfg["concurrency"]:
        results = []
        with ThreadPoolExecutor(max_workers=level) as ex:
            futures = [ex.submit(one_request, session, base_url, api_key, model, cfg, i)
                       for i in range(cfg["requests"])]
            for f in as_completed(futures):
                results.append(f.result())
        ok = [r for r in results if r["ok"]]
        errs = len(results) - len(ok)
        ttft = summarize([r["ttft"] for r in ok if r["ttft"] is not None])
        otps = summarize([r["otps"] for r in ok])
        tpot = summarize([r["tpot_ms"] for r in ok])
        ttft_rows.append([
            level, f"{ttft['p50']:.2f}", f"{ttft['p90']:.2f}",
            f"{ttft['p95']:.2f}", f"{ttft['mean']:.2f}", errs,
        ])
        otps_rows.append([
            level, f"{otps['mean']:.1f}", f"{otps['p50']:.1f}",
            f"{otps['p10']:.1f}", f"{tpot['mean']:.1f}",
        ])
        print(f"  concurrency {level} done ({len(ok)}/{len(results)} ok)", file=sys.stderr)
    out("\nTTFT (seconds)")
    out(render_table(["Concurrency", "P50", "P90", "P95", "Avg", "Errors"], ttft_rows))
    out("\nOTPS (tokens/s) and TPOT (ms)")
    out(render_table(["Concurrency", "Avg OTPS", "P50 OTPS", "P10 OTPS", "Avg TPOT(ms)"], otps_rows))


def run_sustained(session, base_url, api_key, model, cfg, out):
    out("\n4. SUSTAINED LOAD TEST")
    rps, duration = cfg["rps"], cfg["duration"]
    out(f"  Target: {rps} RPS for {duration}s")
    interval = 1.0 / rps
    workers = max(16, rps * 4)
    results = []
    start = time.perf_counter()
    next_checkpoint = 60.0
    checkpoints = []
    sent = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = []
        while True:
            now = time.perf_counter() - start
            if now >= duration:
                break
            futures.append(ex.submit(one_request, session, base_url, api_key, model, cfg, sent))
            sent += 1
            # drain finished futures so memory stays bounded
            done = [f for f in futures if f.done()]
            for f in done:
                results.append(f.result())
                futures.remove(f)
            if now >= next_checkpoint:
                ok = [r for r in results if r["ok"]]
                avg_ttft = (sum(r["ttft"] for r in ok if r["ttft"] is not None) /
                            max(1, len([r for r in ok if r["ttft"] is not None])))
                succ = 100.0 * len(ok) / max(1, len(results))
                checkpoints.append([
                    datetime.now().strftime("%H:%M:%S"), f"+{int(next_checkpoint // 60)} min",
                    len(results), f"{succ:.2f}%", f"{avg_ttft:.2f}s",
                ])
                print(f"  checkpoint {int(next_checkpoint)}s: {len(results)} done, {succ:.1f}% ok",
                      file=sys.stderr)
                next_checkpoint += 60.0
            time.sleep(interval)
        for f in as_completed(futures):
            results.append(f.result())

    ok = [r for r in results if r["ok"]]
    ttft_vals = [r["ttft"] for r in ok if r["ttft"] is not None]
    avg_ttft = sum(ttft_vals) / len(ttft_vals) if ttft_vals else 0
    elapsed_min = (time.perf_counter() - start) / 60.0
    total_tokens = sum(r["prompt_tokens"] + r["out_tokens"] for r in ok)
    tpm = total_tokens / elapsed_min if elapsed_min else 0
    succ = 100.0 * len(ok) / max(1, len(results))
    out(render_table(["Metric", "Result"], [
        ["Total requests sent", len(results)],
        ["Overall success rate", f"{succ:.2f}%"],
        ["Average TTFT", f"{avg_ttft:.2f}s"],
        ["TTFT range (min to max)", f"{min(ttft_vals):.2f}s to {max(ttft_vals):.2f}s" if ttft_vals else "n/a"],
        ["Tokens per minute (in+out)", f"~{tpm:,.0f} TPM"],
    ]))
    if checkpoints:
        out("\nCheckpoint Log (every 60 seconds)")
        out(render_table(["Time", "Elapsed", "Requests", "Success %", "Avg TTFT"], checkpoints))


# ----------------------------- main -----------------------------

def main():
    ap = argparse.ArgumentParser(description="DigitalOcean Serverless Inference benchmark")
    ap.add_argument("--model", required=True)
    ap.add_argument("--base-url", default=DEFAULT_BASE_URL)
    ap.add_argument("--input-tokens", type=int, default=1500)
    ap.add_argument("--output-tokens", type=int, default=64)
    ap.add_argument("--cache-ratio", type=float, default=0.8)
    ap.add_argument("--temperature", type=float, default=0.7)
    ap.add_argument("--warmup", type=int, default=10)
    ap.add_argument("--concurrency", default="1,2,4,8")
    ap.add_argument("--requests", type=int, default=20)
    ap.add_argument("--rps", type=float, default=5)
    ap.add_argument("--duration", type=int, default=120)
    ap.add_argument("--no-sustained", action="store_true")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    api_key = os.environ.get("DO_MODEL_ACCESS_KEY", "")
    if not api_key:
        sys.exit("Set DO_MODEL_ACCESS_KEY in your environment first.")

    cfg = {
        "input_tokens": args.input_tokens,
        "output_tokens": args.output_tokens,
        "cache_ratio": args.cache_ratio,
        "temperature": args.temperature,
        "warmup": args.warmup,
        "concurrency": [int(x) for x in args.concurrency.split(",") if x.strip()],
        "requests": args.requests,
        "rps": args.rps,
        "duration": args.duration,
    }

    lines = []

    def out(s=""):
        print(s)
        lines.append(s)

    out("=" * 72)
    out("DIGITALOCEAN SERVERLESS INFERENCE - BENCHMARK REPORT")
    out("=" * 72)
    out(render_table(["Parameter", "Value"], [
        ["Model", args.model],
        ["Endpoint", args.base_url],
        ["Input length (ISL)", f"~{args.input_tokens:,} tokens"],
        ["Output length (OSL)", f"max {args.output_tokens} tokens"],
        ["Cache simulation", f"{int(args.cache_ratio * 100)}% shared prefix"],
        ["Concurrency levels", ", ".join(map(str, cfg["concurrency"]))],
        ["Warmup requests", str(args.warmup)],
        ["Requests per level", str(args.requests)],
        ["Sustained test", "disabled" if args.no_sustained else f"{args.rps} RPS for {args.duration}s"],
        ["Test date", datetime.now().strftime("%Y-%m-%d %H:%M:%S")],
    ]))

    session = requests.Session()
    run_warmup(session, args.base_url, api_key, args.model, cfg, out)
    run_concurrency(session, args.base_url, api_key, args.model, cfg, out)
    if not args.no_sustained:
        run_sustained(session, args.base_url, api_key, args.model, cfg, out)

    out("\n" + "=" * 72)
    out("End of report. All figures are measured results.")

    if args.out:
        with open(args.out, "w") as f:
            f.write("\n".join(lines) + "\n")
        print(f"\nReport written to {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
