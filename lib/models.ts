// Curated chat/text models available on the DigitalOcean Serverless Inference
// endpoint. Source of truth (and the live list) lives here:
//   https://docs.digitalocean.com/products/inference/details/models/
// You can also type any model ID directly in the UI - this list is just for
// convenience. Image / video / audio / embedding / rerank models are omitted
// because the latency + concurrency tests target the chat completions API.

export interface ModelInfo {
  id: string;
  label: string;
  provider: string;
  contextWindow?: number;
  maxOutput?: number;
}

export const MODELS: ModelInfo[] = [
  // Anthropic
  { id: "anthropic-claude-opus-4.8", label: "Claude Opus 4.8", provider: "Anthropic", contextWindow: 1_000_000, maxOutput: 128_000 },
  { id: "anthropic-claude-opus-4.7", label: "Claude Opus 4.7", provider: "Anthropic", contextWindow: 1_000_000, maxOutput: 128_000 },
  { id: "anthropic-claude-opus-4.6", label: "Claude Opus 4.6", provider: "Anthropic", contextWindow: 1_000_000, maxOutput: 128_000 },
  { id: "anthropic-claude-opus-4.5", label: "Claude Opus 4.5", provider: "Anthropic", maxOutput: 64_000 },
  { id: "anthropic-claude-4.6-sonnet", label: "Claude Sonnet 4.6", provider: "Anthropic", contextWindow: 1_000_000, maxOutput: 64_000 },
  { id: "anthropic-claude-4.5-sonnet", label: "Claude Sonnet 4.5", provider: "Anthropic", contextWindow: 1_000_000, maxOutput: 64_000 },
  { id: "anthropic-claude-sonnet-4", label: "Claude Sonnet 4", provider: "Anthropic", contextWindow: 1_000_000, maxOutput: 64_000 },
  { id: "anthropic-claude-haiku-4.5", label: "Claude Haiku 4.5", provider: "Anthropic", maxOutput: 64_000 },
  { id: "anthropic-claude-4.1-opus", label: "Claude Opus 4.1", provider: "Anthropic", maxOutput: 32_000 },

  // OpenAI
  { id: "openai-gpt-5.4", label: "GPT-5.4", provider: "OpenAI", contextWindow: 1_000_000, maxOutput: 128_000 },
  { id: "openai-gpt-5.4-mini", label: "GPT-5.4 mini", provider: "OpenAI", maxOutput: 128_000 },
  { id: "openai-gpt-5.4-nano", label: "GPT-5.4 nano", provider: "OpenAI", maxOutput: 128_000 },
  { id: "openai-gpt-5.4-pro", label: "GPT-5.4 pro", provider: "OpenAI", maxOutput: 128_000 },
  { id: "openai-gpt-5.3-codex", label: "GPT-5.3 codex", provider: "OpenAI", contextWindow: 400_000, maxOutput: 128_000 },
  { id: "openai-gpt-5.2", label: "GPT-5.2", provider: "OpenAI", maxOutput: 128_000 },
  { id: "openai-gpt-5", label: "GPT-5", provider: "OpenAI", maxOutput: 128_000 },
  { id: "openai-gpt-5-mini", label: "GPT-5 mini", provider: "OpenAI", maxOutput: 128_000 },
  { id: "openai-gpt-5-nano", label: "GPT-5 nano", provider: "OpenAI", maxOutput: 128_000 },
  { id: "openai-gpt-4.1", label: "GPT-4.1", provider: "OpenAI", maxOutput: 32_768 },
  { id: "openai-gpt-4o", label: "GPT-4o", provider: "OpenAI", maxOutput: 16_384 },
  { id: "openai-gpt-4o-mini", label: "GPT-4o mini", provider: "OpenAI", maxOutput: 16_384 },
  { id: "openai-gpt-oss-120b", label: "GPT-OSS 120B", provider: "OpenAI", maxOutput: 131_072 },
  { id: "openai-gpt-oss-20b", label: "GPT-OSS 20B", provider: "OpenAI", maxOutput: 131_072 },
  { id: "openai-o3", label: "o3", provider: "OpenAI" },
  { id: "openai-o3-mini", label: "o3-mini", provider: "OpenAI" },
  { id: "openai-o1", label: "o1", provider: "OpenAI" },

  // Meta
  { id: "llama3.3-70b-instruct", label: "Llama 3.3 70B Instruct", provider: "Meta", maxOutput: 128_000 },
  { id: "llama-4-maverick", label: "Llama 4 Maverick", provider: "Meta", maxOutput: 16_384 },

  // DeepSeek
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", provider: "DeepSeek", contextWindow: 1_000_000, maxOutput: 1_048_576 },
  { id: "deepseek-4-flash", label: "DeepSeek 4 Flash", provider: "DeepSeek", maxOutput: 262_144 },
  { id: "deepseek-3.2", label: "DeepSeek 3.2", provider: "DeepSeek", maxOutput: 64_000 },
  { id: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 Distill Llama 70B", provider: "DeepSeek", maxOutput: 32_768 },

  // Alibaba / Qwen
  { id: "alibaba-qwen3-32b", label: "Qwen3 32B", provider: "Alibaba", maxOutput: 40_960 },
  { id: "qwen3-coder-flash", label: "Qwen3 Coder Flash", provider: "Alibaba", maxOutput: 65_536 },
  { id: "qwen3.5-397b-a17b", label: "Qwen3.5 397B A17B", provider: "Alibaba", maxOutput: 81_920 },

  // Others
  { id: "gemma-4-31B-it", label: "Gemma 4 31B IT", provider: "Google", maxOutput: 256_000 },
  { id: "mistral-3-14B", label: "Mistral 3 14B", provider: "Mistral", maxOutput: 128_000 },
  { id: "minimax-m2.5", label: "MiniMax M2.5", provider: "MiniMax", maxOutput: 128_000 },
  { id: "kimi-k2.6", label: "Kimi K2.6", provider: "Moonshot", maxOutput: 262_144 },
  { id: "kimi-k2.5", label: "Kimi K2.5", provider: "Moonshot", maxOutput: 32_768 },
  { id: "glm-5", label: "GLM-5", provider: "Zhipu", maxOutput: 128_000 },
  { id: "nvidia-nemotron-3-super-120b", label: "Nemotron 3 Super 120B", provider: "NVIDIA" },
  { id: "arcee-trinity-large-thinking", label: "Arcee Trinity Large (thinking)", provider: "Arcee", maxOutput: 128_000 },
];

export const DEFAULT_MODELS = [
  "llama3.3-70b-instruct",
  "openai-gpt-4o-mini",
  "anthropic-claude-haiku-4.5",
];

export const MODELS_DOC_URL =
  "https://docs.digitalocean.com/products/inference/details/models/";
