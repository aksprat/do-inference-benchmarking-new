// Synthetic prompt construction.
//
// Token sizing is approximate: for most tokenizers a short common English word
// is roughly one token, so we generate `n` words to target `n` tokens. The
// benchmark always reports the model's *actual* prompt/completion token counts
// from the API usage field, so this approximation only affects how big a prompt
// we send, not the numbers shown to the user.

const WORDS = (
  "data model token latency throughput vector context window prompt cache infer " +
  "gpu cluster region scale request response stream chunk sample compare cost " +
  "speed quality agent rag pipeline embed rerank serve deploy platform droplet " +
  "ocean gradient kernel matrix weight bias layer attention head decode encode"
).split(/\s+/);

function words(n: number, seed = 0): string {
  if (n <= 0) return "";
  const out: string[] = [];
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    // cheap deterministic-ish index so prefixes are stable when seed is fixed
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out.push(WORDS[s % WORDS.length]);
  }
  return out.join(" ");
}

export interface BuiltPrompt {
  system: string;
  user: string;
  prefixTokensApprox: number;
  uniqueTokensApprox: number;
}

// The system message is identical across requests (cacheable). The user message
// carries a unique nonce so it never caches. cacheHitRatio controls the split.
export function buildPrompt(
  inputTokens: number,
  cacheHitRatio: number,
  outputTokens: number,
  reqIndex: number,
): BuiltPrompt {
  const ratio = Math.min(1, Math.max(0, cacheHitRatio));
  const prefixTokens = Math.round(inputTokens * ratio);
  const uniqueTokens = Math.max(1, inputTokens - prefixTokens);

  const system =
    "You are a benchmarking assistant. Reference corpus follows.\n" +
    words(prefixTokens, 7);

  const user =
    `req-${reqIndex} ` +
    words(uniqueTokens, reqIndex + 1) +
    `\n\nWrite a detailed continuation of about ${outputTokens} tokens.`;

  return {
    system,
    user,
    prefixTokensApprox: prefixTokens,
    uniqueTokensApprox: uniqueTokens,
  };
}
