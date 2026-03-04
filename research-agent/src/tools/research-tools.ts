import type { ToolDef, SearchResult, SearchSource, EvaluatedFinding, Reflection } from "../types.js";
import { createSession, getSession, updateSession, listSessions, addFindings, addReflection, updateCoverage, trackBudget } from "../session.js";
import { evaluateFindings } from "../evaluator.js";
import { SearchManager } from "../apis/index.js";
import { getMemoriesForDomain } from "../memory.js";

const searchManager = new SearchManager();

export function researchTools(): ToolDef[] {
  return [
    {
      name: "research_start",
      description:
        "Create a new research session with decomposed sub-questions. This is the first step in a research loop. Returns a session ID, plan, coverage map, and any prior strategy memories for the domain.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The main research question." },
          subQuestions: {
            type: "array",
            description: "Decomposed sub-questions to investigate.",
            items: {
              type: "object",
              properties: {
                question: { type: "string", description: "The sub-question to answer." },
                priority: { type: "string", enum: ["high", "medium", "low"], description: "Priority level." },
                searchStrategies: {
                  type: "array",
                  items: { type: "string" },
                  description: "Suggested search queries/strategies for this sub-question.",
                },
              },
              required: ["question", "priority", "searchStrategies"],
            },
          },
          successCriteria: {
            type: "array",
            items: { type: "string" },
            description: "Criteria that define when research is sufficient.",
          },
          domain: { type: "string", description: "Research domain (e.g., 'ml', 'security'). Used for memory recall." },
        },
        required: ["query", "subQuestions", "successCriteria"],
      },
      handler: async (params) => {
        const query = params.query as string;
        const domain = params.domain as string | undefined;
        const subQuestionsInput = params.subQuestions as Array<{
          question: string;
          priority: "high" | "medium" | "low";
          searchStrategies: string[];
        }>;
        const successCriteria = params.successCriteria as string[];

        const subQuestions = subQuestionsInput.map((sq, i) => ({
          id: `sq_${i}`,
          question: sq.question,
          priority: sq.priority,
          searchStrategies: sq.searchStrategies,
          status: "pending" as const,
          coveragePercent: 0,
        }));

        const session = createSession({
          query,
          domain,
          subQuestions,
          successCriteria,
          createdAt: Date.now(),
        });

        // Recall prior strategies for this domain
        let priorStrategies: Record<string, unknown> = {};
        if (domain) {
          priorStrategies = getMemoriesForDomain(domain, "strategy");
        }

        return {
          sessionId: session.id,
          plan: session.plan,
          coverage: session.coverage,
          availableSources: searchManager.getAvailableSources(),
          priorStrategies: Object.keys(priorStrategies).length > 0 ? priorStrategies : undefined,
        };
      },
    },
    {
      name: "research_search",
      description:
        "Execute a search round for a sub-question across selected sources. Returns raw findings ready for evaluation. You should also use your own WebSearch for general web results and include them in research_evaluate.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Research session ID from research_start." },
          subQuestionId: { type: "string", description: "Sub-question ID to search for (e.g., sq_0)." },
          query: { type: "string", description: "The search query to execute." },
          sources: {
            type: "array",
            items: {
              type: "string",
              enum: ["semantic_scholar", "exa", "perplexity", "github", "papers_with_code", "xai", "gemini", "kimi"],
            },
            description:
              "Which sources to search. Default: semantic_scholar + exa. Choose based on sub-question type.",
          },
          maxResults: { type: "number", description: "Max results per source (default 10)." },
        },
        required: ["sessionId", "subQuestionId", "query"],
      },
      handler: async (params) => {
        const sessionId = params.sessionId as string;
        const subQuestionId = params.subQuestionId as string;
        const query = params.query as string;
        const sources = (params.sources as SearchSource[]) || ["semantic_scholar", "exa"];
        const maxResults = (params.maxResults as number) || 10;

        const session = getSession(sessionId);
        if (!session) {
          return { error: `Session ${sessionId} not found` };
        }

        // Check budget
        if (session.budget.spent >= session.budget.maxBudget) {
          return {
            error: `Budget exhausted ($${session.budget.spent.toFixed(2)} of $${session.budget.maxBudget.toFixed(2)})`,
          };
        }

        // Update sub-question status
        const sq = session.plan.subQuestions.find((s) => s.id === subQuestionId);
        if (sq) sq.status = "searching";
        updateSession(session);

        // Search all requested sources in parallel
        const allFindings: SearchResult[] = [];
        const errors: string[] = [];
        const costEstimates: Record<string, number> = {
          semantic_scholar: 0,
          github: 0,
          papers_with_code: 0,
          exa: 0.007,
          perplexity: 0.005,
          xai: 0.005,
          gemini: 0,
          kimi: 0.001,
        };

        const searchPromises = sources.map(async (source) => {
          try {
            const results = await searchManager.search(source, query, { maxResults });
            // Track cost
            trackBudget(sessionId, source, costEstimates[source] || 0);
            return { source, results };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`${source}: ${msg}`);
            return { source, results: [] };
          }
        });

        const searchResults = await Promise.all(searchPromises);
        for (const sr of searchResults) {
          allFindings.push(...sr.results);
        }

        return {
          sessionId,
          subQuestionId,
          query,
          sources,
          findingCount: allFindings.length,
          findings: allFindings,
          ...(errors.length > 0 ? { errors } : {}),
          budgetRemaining: `$${(session.budget.maxBudget - session.budget.spent).toFixed(2)}`,
        };
      },
    },
    {
      name: "research_evaluate",
      description:
        "Score and filter findings from a search round using LLM-powered evaluation. Calls Claude to judge each finding on relevance, credibility, and novelty. Pre-filters duplicates before evaluation. Pass your own WebSearch findings here too.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Research session ID." },
          subQuestionId: { type: "string", description: "Sub-question ID these findings relate to." },
          findings: {
            type: "array",
            description:
              "Findings to evaluate. Can include results from research_search and your own WebSearch.",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                url: { type: "string" },
                snippet: { type: "string" },
                source: { type: "string" },
                metadata: { type: "object" },
              },
              required: ["id", "title", "snippet", "source"],
            },
          },
          reflectionSummary: {
            type: "string",
            description:
              "Your reflection on this round: what you found, key themes, what's still missing. Stored for context in future rounds.",
          },
        },
        required: ["sessionId", "subQuestionId", "findings"],
      },
      handler: async (params) => {
        const sessionId = params.sessionId as string;
        const subQuestionId = params.subQuestionId as string;
        const findings = params.findings as SearchResult[];
        const reflectionSummary = params.reflectionSummary as string | undefined;

        const session = getSession(sessionId);
        if (!session) {
          return { error: `Session ${sessionId} not found` };
        }

        // Find the sub-question text
        const sq = session.plan.subQuestions.find((s) => s.id === subQuestionId);
        if (!sq) {
          return { error: `Sub-question ${subQuestionId} not found` };
        }

        // Evaluate findings
        const evaluated = await evaluateFindings(sq.question, findings, session.findings);

        // Track eval cost
        const evalCostEstimate = findings.length * 0.001; // ~$0.001 per finding with Haiku
        trackBudget(sessionId, "llm_eval", evalCostEstimate);

        // Save findings to session
        addFindings(sessionId, evaluated);

        // Save reflection if provided
        if (reflectionSummary) {
          const roundNumber = session.reflections.length + 1;
          addReflection(sessionId, {
            round: roundNumber,
            subQuestionId,
            summary: reflectionSummary,
            timestamp: Date.now(),
          });
        }

        // Update sub-question status
        sq.status = "evaluated";
        updateSession(session);

        // Summarize results
        const kept = evaluated.filter((e) => e.score.verdict === "keep");
        const discarded = evaluated.filter((e) => e.score.verdict === "discard");
        const uncertain = evaluated.filter((e) => e.score.verdict === "uncertain");
        const contradictions = evaluated.flatMap((e) => e.score.contradictions);

        return {
          sessionId,
          subQuestionId,
          summary: {
            total: evaluated.length,
            kept: kept.length,
            discarded: discarded.length,
            uncertain: uncertain.length,
            contradictions: contradictions.length,
          },
          keptFindings: kept.map((e) => ({
            id: e.finding.id,
            title: e.finding.title,
            keyInsight: e.score.keyInsight,
            relevance: e.score.relevance,
            credibility: e.score.credibility,
            novelty: e.score.novelty,
          })),
          contradictions: contradictions.length > 0 ? contradictions : undefined,
          uncertainFindings: uncertain.map((e) => ({
            id: e.finding.id,
            title: e.finding.title,
            reason: `R:${e.score.relevance} C:${e.score.credibility} N:${e.score.novelty}`,
          })),
        };
      },
    },
    {
      name: "research_gaps",
      description:
        "Analyze coverage across all sub-questions. Returns coverage percentages, unanswered aspects, emergent questions, contradictions, diminishing returns flag, and a recommendation on whether to keep searching or synthesize.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Research session ID." },
        },
        required: ["sessionId"],
      },
      handler: async (params) => {
        const sessionId = params.sessionId as string;

        const session = getSession(sessionId);
        if (!session) {
          return { error: `Session ${sessionId} not found` };
        }

        // Calculate coverage per sub-question
        const bySubQuestion: Record<string, {
          percent: number;
          keptFindings: number;
          totalSearched: number;
          unansweredAspects: string[];
          emergentQuestions: string[];
          contradictions: string[];
        }> = {};

        for (const sq of session.plan.subQuestions) {
          const sqFindings = session.findings.filter((f) => {
            // Match findings to sub-questions by checking reflections
            const relatedReflections = session.reflections.filter((r) => r.subQuestionId === sq.id);
            return relatedReflections.length > 0 || sq.status !== "pending";
          });

          const kept = sqFindings.filter((f) => f.score.verdict === "keep");
          const total = sqFindings.length;

          // Estimate coverage based on findings quality and quantity
          let coveragePercent = 0;
          if (kept.length >= 5) coveragePercent = 80;
          else if (kept.length >= 3) coveragePercent = 60;
          else if (kept.length >= 1) coveragePercent = 30;
          else if (sq.status !== "pending") coveragePercent = 10;

          // Boost if high-quality findings
          const avgRelevance = kept.length > 0
            ? kept.reduce((sum, f) => sum + f.score.relevance, 0) / kept.length
            : 0;
          if (avgRelevance >= 8) coveragePercent = Math.min(100, coveragePercent + 15);

          const contradictions = sqFindings
            .flatMap((f) => f.score.contradictions)
            .map((c) => c.description);

          bySubQuestion[sq.id] = {
            percent: coveragePercent,
            keptFindings: kept.length,
            totalSearched: total,
            unansweredAspects: coveragePercent < 70
              ? [`Needs more findings for: "${sq.question}"`]
              : [],
            emergentQuestions: [],
            contradictions: [...new Set(contradictions)],
          };

          sq.coveragePercent = coveragePercent;
        }

        // Calculate overall coverage
        const coverageValues = Object.values(bySubQuestion).map((c) => c.percent);
        const overall = coverageValues.length > 0
          ? coverageValues.reduce((a, b) => a + b, 0) / coverageValues.length
          : 0;

        // Detect diminishing returns: if recent evaluations mostly discard
        const recentFindings = session.findings.slice(-20);
        const recentKeptRate = recentFindings.length > 0
          ? recentFindings.filter((f) => f.score.verdict === "keep").length / recentFindings.length
          : 1;
        const diminishingReturns = recentFindings.length >= 10 && recentKeptRate < 0.2;

        // Generate recommendation
        let recommendation: string;
        if (overall >= 80 || diminishingReturns) {
          recommendation = "Good coverage achieved. Ready for synthesis.";
        } else if (overall >= 50) {
          const gaps = Object.entries(bySubQuestion)
            .filter(([, c]) => c.percent < 50)
            .map(([id]) => id);
          recommendation = `Moderate coverage. Focus on gaps: ${gaps.join(", ")}`;
        } else {
          recommendation = "Continue searching for uncovered sub-questions.";
        }

        const coverage = {
          bySubQuestion,
          overall,
          diminishingReturns,
          recommendation,
        };

        updateCoverage(sessionId, coverage);

        return {
          sessionId,
          coverage,
          budgetStatus: {
            spent: `$${session.budget.spent.toFixed(2)}`,
            remaining: `$${(session.budget.maxBudget - session.budget.spent).toFixed(2)}`,
            atLimit: session.budget.spent >= session.budget.maxBudget * 0.8,
          },
        };
      },
    },
    {
      name: "research_synthesize",
      description:
        "Gather all kept findings for final report writing. Returns findings grouped by sub-question (sorted by score), citation list, reflections summary, contradictions, and remaining gaps. Use this data to write the final research report.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Research session ID." },
        },
        required: ["sessionId"],
      },
      handler: async (params) => {
        const sessionId = params.sessionId as string;

        const session = getSession(sessionId);
        if (!session) {
          return { error: `Session ${sessionId} not found` };
        }

        // Group kept findings by sub-question
        const keptFindings = session.findings.filter((f) => f.score.verdict === "keep");

        // Sort by composite score (avg of relevance, credibility, novelty)
        const sorted = [...keptFindings].sort((a, b) => {
          const scoreA = (a.score.relevance + a.score.credibility + a.score.novelty) / 3;
          const scoreB = (b.score.relevance + b.score.credibility + b.score.novelty) / 3;
          return scoreB - scoreA;
        });

        // Build citation list
        const citations = sorted
          .filter((f) => f.finding.url)
          .map((f, i) => ({
            index: i + 1,
            title: f.finding.title,
            url: f.finding.url,
            source: f.finding.source,
            authors: f.finding.metadata.authors,
            year: f.finding.metadata.year,
          }));

        // Collect all contradictions
        const contradictions = session.findings
          .flatMap((f) => f.score.contradictions)
          .filter((c, i, arr) => arr.findIndex((x) => x.description === c.description) === i);

        // Remaining gaps
        const gaps = session.plan.subQuestions
          .filter((sq) => sq.coveragePercent < 50)
          .map((sq) => ({ id: sq.id, question: sq.question, coverage: sq.coveragePercent }));

        // Update session status
        session.status = "synthesized";
        session.updatedAt = Date.now();
        updateSession(session);

        return {
          sessionId,
          query: session.plan.query,
          findingsBySubQuestion: session.plan.subQuestions.map((sq) => ({
            subQuestion: sq.question,
            id: sq.id,
            coverage: sq.coveragePercent,
            findings: sorted
              .map((f) => ({
                title: f.finding.title,
                url: f.finding.url,
                source: f.finding.source,
                keyInsight: f.score.keyInsight,
                relevance: f.score.relevance,
                credibility: f.score.credibility,
                novelty: f.score.novelty,
              })),
          })),
          citations,
          reflections: session.reflections.map((r) => r.summary),
          contradictions,
          remainingGaps: gaps,
          totalFindings: {
            kept: keptFindings.length,
            total: session.findings.length,
          },
        };
      },
    },
    {
      name: "research_status",
      description:
        "Get session state or list all sessions. If sessionId is provided, returns that session's details. Otherwise returns a list of all sessions.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Session ID to get details for. Omit to list all sessions." },
        },
      },
      handler: async (params) => {
        const sessionId = params.sessionId as string | undefined;

        if (sessionId) {
          const session = getSession(sessionId);
          if (!session) {
            return { error: `Session ${sessionId} not found` };
          }
          return {
            id: session.id,
            query: session.plan.query,
            status: session.status,
            subQuestions: session.plan.subQuestions.map((sq) => ({
              id: sq.id,
              question: sq.question,
              status: sq.status,
              coverage: sq.coveragePercent,
            })),
            findingCount: session.findings.length,
            keptCount: session.findings.filter((f) => f.score.verdict === "keep").length,
            reflectionCount: session.reflections.length,
            budget: {
              spent: `$${session.budget.spent.toFixed(2)}`,
              max: `$${session.budget.maxBudget.toFixed(2)}`,
            },
            createdAt: new Date(session.createdAt).toISOString(),
            updatedAt: new Date(session.updatedAt).toISOString(),
          };
        }

        const sessions = listSessions();
        return {
          sessionCount: sessions.length,
          sessions,
        };
      },
    },
  ];
}
