import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "./config.js";
import { SearchResult, EvaluationScore, EvaluatedFinding } from "./types.js";

const DOMAIN_BLOCKLIST = [
  "bestreviews.guide",
  "top10things.com",
  "reviewgeek.net",
  "buzzfeed.com",
  "listverse.com",
  "thetoptens.com",
  "ranker.com",
  "ezvid.com",
  "besttopreviews.com",
  "top5reviewed.com",
  "reviewedbyexperts.com",
  "guru99.com",
  "wisebread.com",
  "makeuseof.com",
] as const;

const BATCH_SIZE = 10;

function getModelId(model: "haiku" | "sonnet"): string {
  return model === "haiku" ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6";
}

function isDomainBlocked(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return DOMAIN_BLOCKLIST.some((blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`));
  } catch {
    return false;
  }
}

function isDuplicate(
  finding: SearchResult,
  existingFindings: EvaluatedFinding[]
): boolean {
  for (const existing of existingFindings) {
    // Deduplicate by URL
    if (finding.url && existing.finding.url && finding.url === existing.finding.url) {
      return true;
    }
    // Deduplicate by DOI
    if (
      finding.metadata.doi &&
      existing.finding.metadata.doi &&
      finding.metadata.doi === existing.finding.metadata.doi
    ) {
      return true;
    }
  }
  return false;
}

function buildSystemPrompt(): string {
  return `You are a research evaluator. For each finding, assess:
- relevance (0-10): How directly does this address the sub-question?
- credibility (0-10): How trustworthy is this source? Consider venue, author reputation, citation count, methodology.
- novelty (0-10): How much new information does this add beyond what we already have?
- contradictions: Does this contradict any existing findings?
- keyInsight: One sentence capturing the unique contribution.
- verdict: "keep" if useful (avg score >= 5), "discard" if not (avg < 3), "uncertain" otherwise.

Metadata context is provided for each finding (citations, venue, year, etc.) — use it to inform your judgment.`;
}

function buildUserMessage(
  subQuestion: string,
  batch: SearchResult[],
  existingKept: EvaluatedFinding[]
): string {
  let msg = `## Sub-question\n${subQuestion}\n\n`;

  if (existingKept.length > 0) {
    msg += `## Existing kept findings (for novelty/contradiction assessment)\n`;
    for (const ef of existingKept) {
      msg += `- [${ef.finding.id}] "${ef.finding.title}": ${ef.score.keyInsight}\n`;
    }
    msg += `\n`;
  }

  msg += `## Findings to evaluate\n`;
  for (const f of batch) {
    msg += `### Finding: ${f.id}\n`;
    msg += `**Title:** ${f.title}\n`;
    if (f.url) msg += `**URL:** ${f.url}\n`;
    msg += `**Source:** ${f.source}\n`;
    msg += `**Snippet:** ${f.snippet}\n`;

    const meta = f.metadata;
    if (meta.authors?.length) msg += `**Authors:** ${meta.authors.join(", ")}\n`;
    if (meta.year) msg += `**Year:** ${meta.year}\n`;
    if (meta.citationCount !== undefined) msg += `**Citations:** ${meta.citationCount}\n`;
    if (meta.venue) msg += `**Venue:** ${meta.venue}\n`;
    if (meta.doi) msg += `**DOI:** ${meta.doi}\n`;
    if (meta.tldr) msg += `**TL;DR:** ${meta.tldr}\n`;
    if (meta.stars !== undefined) msg += `**Stars:** ${meta.stars}\n`;
    if (meta.language) msg += `**Language:** ${meta.language}\n`;
    if (meta.framework) msg += `**Framework:** ${meta.framework}\n`;
    if (meta.model) msg += `**Model:** ${meta.model}\n`;
    msg += `\n`;
  }

  msg += `Evaluate each finding using the evaluate_findings tool. Include all ${batch.length} findings in a single call.`;

  return msg;
}

const EVAL_TOOL: Anthropic.Tool = {
  name: "evaluate_findings",
  description: "Evaluate a batch of research findings",
  input_schema: {
    type: "object" as const,
    properties: {
      evaluations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            findingId: { type: "string" },
            relevance: { type: "number" },
            relevanceReasoning: { type: "string" },
            credibility: { type: "number" },
            credibilityReasoning: { type: "string" },
            novelty: { type: "number" },
            noveltyReasoning: { type: "string" },
            contradictions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  findingId: { type: "string" },
                  description: { type: "string" },
                },
                required: ["findingId", "description"],
              },
            },
            keyInsight: { type: "string" },
            verdict: { type: "string", enum: ["keep", "discard", "uncertain"] },
          },
          required: [
            "findingId",
            "relevance",
            "relevanceReasoning",
            "credibility",
            "credibilityReasoning",
            "novelty",
            "noveltyReasoning",
            "contradictions",
            "keyInsight",
            "verdict",
          ],
        },
      },
    },
    required: ["evaluations"],
  },
};

interface RawEvaluation {
  findingId: string;
  relevance: number;
  relevanceReasoning: string;
  credibility: number;
  credibilityReasoning: string;
  novelty: number;
  noveltyReasoning: string;
  contradictions: { findingId: string; description: string }[];
  keyInsight: string;
  verdict: "keep" | "discard" | "uncertain";
}

function parseEvalResponse(response: Anthropic.Message): RawEvaluation[] {
  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "evaluate_findings") {
      const input = block.input as { evaluations: RawEvaluation[] };
      return input.evaluations;
    }
  }
  return [];
}

function buildDefaultScore(findingId: string): EvaluationScore {
  return {
    relevance: 5,
    relevanceReasoning: "Evaluation failed — defaulting to uncertain",
    credibility: 5,
    credibilityReasoning: "Evaluation failed — defaulting to uncertain",
    novelty: 5,
    noveltyReasoning: "Evaluation failed — defaulting to uncertain",
    contradictions: [],
    keyInsight: "Unable to evaluate — marked as uncertain",
    verdict: "uncertain",
  };
}

async function evaluateBatch(
  client: Anthropic,
  modelId: string,
  subQuestion: string,
  batch: SearchResult[],
  existingKept: EvaluatedFinding[]
): Promise<EvaluatedFinding[]> {
  const now = Date.now();

  try {
    const response = await client.messages.create({
      model: modelId,
      max_tokens: 4096,
      system: buildSystemPrompt(),
      messages: [
        {
          role: "user",
          content: buildUserMessage(subQuestion, batch, existingKept),
        },
      ],
      tools: [EVAL_TOOL],
      tool_choice: { type: "tool", name: "evaluate_findings" },
    });

    const evaluations = parseEvalResponse(response);

    // Map evaluations back to findings by ID
    const evalMap = new Map<string, RawEvaluation>();
    for (const ev of evaluations) {
      evalMap.set(ev.findingId, ev);
    }

    return batch.map((finding) => {
      const ev = evalMap.get(finding.id);
      if (ev) {
        return {
          finding,
          score: {
            relevance: ev.relevance,
            relevanceReasoning: ev.relevanceReasoning,
            credibility: ev.credibility,
            credibilityReasoning: ev.credibilityReasoning,
            novelty: ev.novelty,
            noveltyReasoning: ev.noveltyReasoning,
            contradictions: ev.contradictions,
            keyInsight: ev.keyInsight,
            verdict: ev.verdict,
          },
          evaluatedAt: now,
        };
      }
      // Finding not in LLM response — default to uncertain
      return {
        finding,
        score: buildDefaultScore(finding.id),
        evaluatedAt: now,
      };
    });
  } catch (error) {
    console.error("[evaluator] LLM evaluation failed:", error);
    // Return all findings with default uncertain scores
    return batch.map((finding) => ({
      finding,
      score: buildDefaultScore(finding.id),
      evaluatedAt: now,
    }));
  }
}

export async function evaluateFindings(
  subQuestion: string,
  findings: SearchResult[],
  existingFindings: EvaluatedFinding[]
): Promise<EvaluatedFinding[]> {
  const config = getConfig();

  // Pre-filter: deduplicate and blocklist (always runs, regardless of API key)
  const filtered: SearchResult[] = [];
  for (const finding of findings) {
    if (isDuplicate(finding, existingFindings)) continue;
    if (finding.url && isDomainBlocked(finding.url)) continue;
    filtered.push(finding);
  }

  if (filtered.length === 0) return [];

  // If no API key configured, skip internal LLM call.
  // Return pre-filtered findings as "uncertain" — Claude Code evaluates them
  // directly when it reads the results and decides what to keep.
  if (!config.anthropicApiKey) {
    console.error("[evaluator] No ANTHROPIC_API_KEY — returning pre-filtered findings for Claude to evaluate");
    const now = Date.now();
    return filtered.map((finding) => ({
      finding,
      score: {
        relevance: 5,
        relevanceReasoning: "Not scored — evaluate based on snippet and metadata",
        credibility: 5,
        credibilityReasoning: "Not scored — evaluate based on source and authors",
        novelty: 5,
        noveltyReasoning: "Not scored — evaluate based on existing findings",
        contradictions: [],
        keyInsight: finding.snippet.slice(0, 120),
        verdict: "uncertain" as const,
      },
      evaluatedAt: now,
    }));
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const modelId = getModelId(config.evalModel);

  // Existing kept findings for novelty context
  const existingKept = existingFindings.filter((ef) => ef.score.verdict === "keep");

  // Batch and evaluate
  const results: EvaluatedFinding[] = [];

  for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
    const batch = filtered.slice(i, i + BATCH_SIZE);
    const batchResults = await evaluateBatch(client, modelId, subQuestion, batch, existingKept);
    results.push(...batchResults);

    // Add newly kept findings to context for subsequent batches
    for (const r of batchResults) {
      if (r.score.verdict === "keep") {
        existingKept.push(r);
      }
    }
  }

  return results;
}

export function estimateEvalCost(findingCount: number): number {
  const config = getConfig();
  const model = config.evalModel;

  const inputTokensPerFinding = 200;
  const outputTokensPerFinding = 150;

  const totalInputTokens = findingCount * inputTokensPerFinding;
  const totalOutputTokens = findingCount * outputTokensPerFinding;

  if (model === "haiku") {
    // Haiku: $0.80/1M input, $4/1M output
    return (totalInputTokens * 0.80) / 1_000_000 + (totalOutputTokens * 4) / 1_000_000;
  } else {
    // Sonnet: $3/1M input, $15/1M output
    return (totalInputTokens * 3) / 1_000_000 + (totalOutputTokens * 15) / 1_000_000;
  }
}
