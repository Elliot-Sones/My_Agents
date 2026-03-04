import { ApiConfig } from "./types.js";

let config: ApiConfig | null = null;

export function loadConfig(): ApiConfig {
  if (config) return config;

  config = {
    semanticScholarApiKey: process.env.SEMANTIC_SCHOLAR_API_KEY,
    exaApiKey: process.env.EXA_API_KEY,
    githubToken: process.env.GITHUB_TOKEN,
    perplexityApiKey: process.env.PERPLEXITY_API_KEY,
    xaiApiKey: process.env.XAI_API_KEY,
    kimiApiKey: process.env.KIMI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    evalModel: (process.env.EVAL_MODEL as "haiku" | "sonnet") || "haiku",
    researchBudget: parseFloat(process.env.RESEARCH_BUDGET || "1.00"),
  };

  // Log warnings for missing keys
  const warnings: string[] = [];
  if (!config.anthropicApiKey) warnings.push("ANTHROPIC_API_KEY not set — internal LLM evaluation disabled (Claude Code will evaluate findings directly)");
  if (!config.exaApiKey) warnings.push("EXA_API_KEY not set — code_search and search_opinions disabled");
  if (!config.perplexityApiKey) warnings.push("PERPLEXITY_API_KEY not set — ask_perplexity disabled");
  if (!config.xaiApiKey) warnings.push("XAI_API_KEY not set — search_x disabled");
  if (!config.kimiApiKey) warnings.push("KIMI_API_KEY not set — ask_kimi disabled");
  if (!config.semanticScholarApiKey) warnings.push("SEMANTIC_SCHOLAR_API_KEY not set — using lower rate limits (1 RPS)");
  if (!config.githubToken) warnings.push("GITHUB_TOKEN not set — using lower rate limits (60 req/hr)");

  for (const w of warnings) {
    console.error(`[config] WARNING: ${w}`);
  }

  return config;
}

export function getConfig(): ApiConfig {
  if (!config) return loadConfig();
  return config;
}
