// ── Memory ──

export interface Memory {
  value: string;
  confidence: number;
  version: number;
  created: number;
  last_used: number;
  history: MemoryHistoryEntry[];
}

export interface MemoryHistoryEntry {
  old: string;
  changed: number;
}

export type MemoryCategory = "strategy" | "source_quality" | "preference";

export interface MemoryKey {
  domain: string;
  category: MemoryCategory;
  identifier: string;
}

export function parseMemoryKey(key: string): MemoryKey {
  const [domain, category, ...rest] = key.split("::");
  return {
    domain,
    category: category as MemoryCategory,
    identifier: rest.join("::"),
  };
}

export function formatMemoryKey(key: MemoryKey): string {
  return `${key.domain}::${key.category}::${key.identifier}`;
}

// ── Search Results ──

export interface SearchResult {
  id: string;
  title: string;
  url?: string;
  snippet: string;
  source: SearchSource;
  metadata: SearchMetadata;
  raw?: unknown;
}

export type SearchSource =
  | "semantic_scholar"
  | "exa"
  | "perplexity"
  | "github"
  | "papers_with_code"
  | "xai"
  | "gemini"
  | "kimi";

export interface SearchMetadata {
  authors?: string[];
  year?: number;
  citationCount?: number;
  venue?: string;
  doi?: string;
  openAccess?: boolean;
  tldr?: string;
  stars?: number;
  language?: string;
  lastUpdated?: string;
  framework?: string;
  citations?: string[];
  model?: string;
}

// ── Evaluation ──

export interface EvaluationScore {
  relevance: number;
  relevanceReasoning: string;
  credibility: number;
  credibilityReasoning: string;
  novelty: number;
  noveltyReasoning: string;
  contradictions: ContradictionFlag[];
  keyInsight: string;
  verdict: "keep" | "discard" | "uncertain";
}

export interface ContradictionFlag {
  findingId: string;
  description: string;
}

export interface EvaluatedFinding {
  finding: SearchResult;
  score: EvaluationScore;
  evaluatedAt: number;
}

// ── Research Session ──

export interface SubQuestion {
  id: string;
  question: string;
  priority: "high" | "medium" | "low";
  searchStrategies: string[];
  status: "pending" | "searching" | "evaluated" | "complete";
  coveragePercent: number;
}

export interface ResearchPlan {
  query: string;
  domain?: string;
  subQuestions: SubQuestion[];
  successCriteria: string[];
  createdAt: number;
}

export interface ResearchSession {
  id: string;
  plan: ResearchPlan;
  findings: EvaluatedFinding[];
  reflections: Reflection[];
  coverage: CoverageMap;
  budget: BudgetTracker;
  createdAt: number;
  updatedAt: number;
  status: "active" | "synthesized" | "archived";
}

export interface Reflection {
  round: number;
  subQuestionId: string;
  summary: string;
  timestamp: number;
}

export interface CoverageMap {
  bySubQuestion: Record<string, SubQuestionCoverage>;
  overall: number;
  diminishingReturns: boolean;
  recommendation: string;
}

export interface SubQuestionCoverage {
  percent: number;
  keptFindings: number;
  totalSearched: number;
  unansweredAspects: string[];
  emergentQuestions: string[];
  contradictions: string[];
}

export interface BudgetTracker {
  maxBudget: number;
  spent: number;
  breakdown: Record<string, number>;
}

// ── API Config ──

export interface ApiConfig {
  semanticScholarApiKey?: string;
  exaApiKey?: string;
  githubToken?: string;
  perplexityApiKey?: string;
  xaiApiKey?: string;
  kimiApiKey?: string;
  anthropicApiKey?: string;
  evalModel: "haiku" | "sonnet";
  researchBudget: number;
}

// ── Tool Definition (matches claude-firefox pattern) ──

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}
