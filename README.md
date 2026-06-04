# DigitalOcean Inference Benchmark

A web app for benchmarking any model on the DigitalOcean Serverless Inference
engine. Pick models by ID, set your token mix and cache-hit ratio, and compare
latency, throughput, and behavior under concurrency side by side. Built with
Next.js so it deploys to App Platform in a few clicks.

## What it measures

The app produces a sectioned **benchmark report** (raw measured numbers, no
preset targets):

**Warmup (sequential requests):**
- Per-request table: status, end-to-end latency, output tokens
- Cold-start / fastest / slowest flags and a success summary

**TTFT by concurrency:**
- Time to first token P50 / P90 / P95 / Avg at each concurrency level

**OTPS / TPOT by concurrency:**
- Output tokens/sec (Avg / P50 / P10) and time-per-output-token (ms) per level
- OTPS = output tokens per second per request. TPOT = generation time / output
  tokens.

Every figure comes from the model's reported usage. The report exports to a
clean, printable **HTML file**, and the raw data still exports to CSV / JSON.
Comparison **charts** for multiple models render below the report.

For the **sustained load test** (fixed RPS over a long duration with a 60s
checkpoint log), use the Droplet script described below. That kind of run does
not fit inside an App Platform web request.

## Inputs

- **Models**: any model ID from the
  [DigitalOcean model list](https://docs.digitalocean.com/products/inference/details/models/).
  Pick from the catalog or paste any ID. Up to 6 at once.
- **Input tokens / Output tokens**: target prompt size and max generation.
- **Cache hit ratio**: the fraction of the input sent as a reused, cacheable
  prefix. On cache-enabled models a higher ratio lowers TTFT and shows up as
  cached tokens in the usage data. See "How cache modeling works" below.
- **Concurrency levels** and **requests per level** for the load test.
- **Streaming** on/off, **temperature**, and **mock mode**.

## How cache modeling works

The app builds each prompt from two parts:

1. A **system message** that is identical across every request in a run. This is
   the cacheable prefix. Its size is `inputTokens * cacheHitRatio`.
2. A **user message** that carries a unique nonce so it never caches. Its size
   is the remainder.

Reusing an identical prefix lets whatever prompt caching the endpoint supports
kick in, so the TTFT and cached-token numbers you see reflect real caching
behavior rather than a formula. Token sizing of the synthetic prompt is
approximate, but every number shown comes from the model's reported usage, not
from our estimate.

## Run locally

```bash
npm install
cp .env.example .env.local   # add your Model Access Key
npm run dev                  # http://localhost:3000
```

Mock mode is on by default, so you can explore the UI with simulated timings and
no API key. Uncheck "mock mode" to hit the live endpoint.

### Environment variables

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DO_MODEL_ACCESS_KEY` | for live runs | none | Create one in the DO Control Panel. You can also paste a key in the UI instead. |
| `DO_INFERENCE_BASE_URL` | no | `https://inference.do-ai.run/v1` | OpenAI-compatible base URL. |

## Deploy to App Platform

**Option A: dashboard.** Push this folder to a Git repo, then in App Platform
choose Create App, import the repo, and App Platform auto-detects Next.js. Add
`DO_MODEL_ACCESS_KEY` as an encrypted environment variable.

**Option B: spec file.** Edit the `github` block in `.do/app.yaml`, then:

```bash
doctl apps create --spec .do/app.yaml
```

Set the `DO_MODEL_ACCESS_KEY` secret in the dashboard or with
`doctl apps update`.

## Run on a Droplet (recommended for real benchmarks)

App Platform sits behind a managed proxy with request timeouts and runs on small
shared instances, so streaming benchmarks can drop with network errors and the
client box becomes the bottleneck. For accurate, repeatable numbers, run on a
Droplet, ideally a CPU-Optimized Droplet (16 vCPU / 32 GB) in a region close to
the endpoint.

### Web app on a Droplet (Docker)

Get the repo onto the Droplet. It is private, so authenticate first:

```bash
# option 1: GitHub CLI
gh auth login
gh repo clone aksprat/do-inference-benchmarking-new
cd do-inference-benchmarking-new

# option 2: clone with a personal access token
git clone https://USERNAME:TOKEN@github.com/aksprat/do-inference-benchmarking-new.git
```

Then one command builds and runs it (Docker is installed automatically):

```bash
chmod +x scripts/droplet-setup.sh
export DO_MODEL_ACCESS_KEY=your_key   # optional; omit to let each user paste their own key in the UI
sudo -E ./scripts/droplet-setup.sh
```

Open the firewall for the port, ideally restricted to your IP:

```bash
sudo ufw allow from YOUR_IP to any port 3000 proto tcp
```

The app is then at `http://YOUR_DROPLET_IP:3000`. Because the API calls now
originate from the Droplet, latency and throughput numbers are clean. Manage it
with `docker logs -f do-bench` and `docker restart do-bench`.

Prefer no Docker? Install Node 20, then `npm ci && npm run build && npm start`
(set `PORT`, and keep it alive with `pm2` or a systemd unit).

### Command-line script on the Droplet

For the cleanest results and the sustained load test, run the bundled script
directly (next section). On a 16 vCPU box it comfortably drives the heavy
concurrency levels.

## Sustained load test → Droplet script

The web app covers warmup, TTFT, and OTPS/TPOT. The **sustained load test** is
not in the app on purpose: a fixed-RPS run over many minutes cannot survive an
App Platform web request (proxy and instance timeouts cut it off). Instead it
runs from a standalone script you launch on a Droplet, ideally a CPU-Optimized
Droplet (16 vCPU / 32 GB) in the same region as the endpoint so the client is
not the bottleneck.

The script ([`scripts/do_inference_benchmark.py`](scripts/do_inference_benchmark.py))
runs the full suite (warmup, concurrency sweep, and the sustained load test) and
prints the complete report in the same sections as the app, plus the sustained
section. It can also write the report to a file.

```bash
export DO_MODEL_ACCESS_KEY=...        # your Model Access Key
pip install requests
python3 scripts/do_inference_benchmark.py --model llama3.3-70b-instruct
```

### What the sustained load test measures

It fires requests at a fixed rate (`--rps`) for a fixed duration (`--duration`)
and reports measured numbers only (no targets):

- **Total requests sent** and **overall success rate**
- **Average TTFT** and the **TTFT range** (min to max) to show stability or drift
- **Tokens per minute (in + out)** actually achieved
- A **checkpoint log every 60 seconds**: timestamp, elapsed, requests so far,
  running success rate, and running average TTFT

### Reproduce a heavy, long run (15K input, 30-min sustained at 11 RPS)

```bash
python3 scripts/do_inference_benchmark.py --model kimi-k2.6 \
  --input-tokens 15000 --output-tokens 64 --cache-ratio 0.8 \
  --warmup 30 --concurrency 1,2,4,8,16,32 --requests 40 \
  --rps 11 --duration 1800 --out report.txt
```

### Options

| Flag | Default | Meaning |
| --- | --- | --- |
| `--model` | (required) | Model ID from the DigitalOcean model list |
| `--input-tokens` | 1500 | Approx input length per request |
| `--output-tokens` | 64 | Max output tokens |
| `--cache-ratio` | 0.8 | Fraction of input sent as a shared, cacheable prefix |
| `--warmup` | 10 | Sequential warmup requests |
| `--concurrency` | 1,2,4,8 | Comma list of concurrency levels |
| `--requests` | 20 | Requests per concurrency level |
| `--rps` | 5 | Sustained requests per second |
| `--duration` | 120 | Sustained duration in seconds |
| `--no-sustained` | off | Skip the sustained load test |
| `--out` | none | Also write the report to this file |
| `--base-url` | `https://inference.do-ai.run/v1` | OpenAI-compatible endpoint |

Run `python3 scripts/do_inference_benchmark.py --help` for the full list. Live
progress prints to stderr while the report prints to stdout, so `--out` captures
a clean report.

## Notes

- The app calls the inference endpoint server-side, so a key pasted in the UI is
  sent only to this app's own backend, never to the browser-exposed network.
- Long load tests run as a streamed response. Keep request counts reasonable on
  small instance sizes.
- Cost modeling and a small quality-eval mode are natural next additions; the
  result types already carry the token counts needed for cost math.
