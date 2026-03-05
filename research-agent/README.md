# research-agent

Multi-source research MCP server with gap analysis and self-improving memory. Claude drives the loop — decomposing queries, searching across academic papers, code repos, and community discussions, evaluating findings, and synthesizing results.

## Why This Exists

Claude already has built-in `WebSearch` and `WebFetch` for general web search. This server adds what Claude can't do natively:

| Capability | Why you can't get this from WebSearch |
|---|---|
| **Academic papers** | Semantic Scholar: 214M papers, citation graphs, TLDRs |
| **Code search** | Exa searches repos by meaning; Papers With Code links papers → GitHub |
| **Community opinions** | Reddit, HN, forums via Exa neural search (finds real discussions, not SEO) |
| **X/Twitter** | xAI Grok is the only API with native X search access |
| **Cross-validation** | Perplexity, Gemini, Kimi — three independent AI perspectives to check against |
| **Session persistence** | Research state saved to disk; resume across context windows |
| **Memory** | Learns which search strategies work for different domains |

## Setup

```bash
cd research-agent
npm install
npm run build
```

### Add to Claude Code

In your Claude Code MCP config (`.claude/settings.json` or a project `.mcp.json`):

```json
{
  "mcpServers": {
    "research-agent": {
      "command": "node",
      "args": ["/path/to/research-agent/build/index.js"],
      "env": {
        "EXA_API_KEY": "..."
      }
    }
  }
}
```

That's the minimum. Add more keys to unlock more tools.

### API Keys

| Key | Required? | What it unlocks |
|-----|-----------|-----------------|
| `EXA_API_KEY` | Recommended | `code_search` + `search_opinions`. Free tier: 1,000 searches/month |
| `PERPLEXITY_API_KEY` | Optional | `ask_perplexity` — synthesized answers with citations |
| `XAI_API_KEY` | Optional | `search_x` — X/Twitter search |
| `SEMANTIC_SCHOLAR_API_KEY` | Optional | Higher rate limits (10 RPS vs 1 RPS). Papers work without it. |
| `GITHUB_TOKEN` | Optional | Higher rate limits (5,000 req/hr vs 60/hr). GitHub works without it. |
| `KIMI_API_KEY` | Optional | `ask_kimi` — Moonshot AI cross-validation |
| `ANTHROPIC_API_KEY` | Optional | Enables internal LLM pre-scoring of findings. Not needed when using Claude Code — Claude evaluates findings directly. |

**No key needed for:** Semantic Scholar, GitHub, Papers With Code (all free).

The server starts with warnings for missing keys but never crashes. Tools that need an unconfigured API return a helpful error.

### Cross-validation CLIs (optional)

```bash
# For ask_gemini (free, 1,000 req/day):
npm install -g @google/gemini-cli
gemini  # run once to authenticate

# For ask_kimi:
brew install kimi-cli  # or: npm install -g kimiai-cli
```

---

## Tools (18)

### Papers
| Tool | Description |
|------|-------------|
| `paper_search` | Search 214M+ academic papers via Semantic Scholar. Returns abstracts, citation counts, venues, DOIs, TLDRs. |
| `paper_citations` | Explore the citation graph for a paper — who cited it, what it cites. |

### Code
| Tool | Description |
|------|-------------|
| `code_search` | Find repos via Exa semantic search + GitHub API in parallel. |
| `paper_implementations` | Find GitHub implementations of papers via Papers With Code. |

### Opinions
| Tool | Description |
|------|-------------|
| `ask_perplexity` | Synthesized answer + citations from Perplexity Sonar — a second AI's perspective. |
| `search_opinions` | Community discussions via Exa neural search (Reddit, HN, forums, blogs). |
| `search_x` | X/Twitter search via xAI Grok — the only API with native X access. |

### Cross-Validation
| Tool | Description |
|------|-------------|
| `ask_gemini` | Answer grounded in Google Search via Gemini CLI. Free (1,000 req/day). |
| `ask_kimi` | Answer via Kimi CLI (Moonshot AI). Different training data and source access. |

### Research Loop
| Tool | Description |
|------|-------------|
| `research_start` | Create a session with decomposed sub-questions. Returns session ID + any prior memories for this domain. |
| `research_search` | Search one or more sources for a sub-question. Returns raw findings. |
| `research_evaluate` | Deduplicate, filter spam, and score findings. Returns cleaned results for Claude to evaluate. |
| `research_gaps` | Coverage map across all sub-questions. Returns recommendation: keep searching or synthesize. |
| `research_synthesize` | Return all kept findings grouped by sub-question with citations. Claude writes the report from this. |
| `research_status` | Session details or list of all sessions. |

### Memory
| Tool | Description |
|------|-------------|
| `memory_save` | Save a strategy, source quality note, or preference. Key: `domain::category::identifier` |
| `memory_recall` | Recall memories for a domain. Loaded automatically at `research_start`. |
| `memory_list` | List all saved memories. |

---

## The Research Loop

Claude drives the loop. The server handles data fetching and persistence; Claude handles all reasoning and judgment.

```
research_start
     ↓
research_search  ──→  research_evaluate  ──→  research_gaps
     ↑                                              │
     └──────────── (gaps remain) ──────────────────┘
                                                    │
                                          research_synthesize
                                                    │
                                          Claude writes report
```

**Example session:**

```
You: "Research multi-agent AI architectures"

Claude calls research_start(query, subQuestions=[
  "What architectures exist?",
  "What are the trade-offs?",
  "What's running in production?"
])
→ sessionId: "rs_1234_abc", loads any prior ml::strategy memories

Claude calls research_search(sessionId, "sq_0", "multi-agent AI architecture survey",
  sources: ["semantic_scholar", "exa"])
→ 15 raw findings from Semantic Scholar + Exa

Claude also uses its own WebSearch for general web results

Claude calls research_evaluate(sessionId, "sq_0", [all findings])
→ server dedupes + strips spam → returns 12 cleaned findings
→ Claude reads them and notes which are relevant

Claude calls research_gaps(sessionId)
→ sq_0: 60%, sq_1: 0%, sq_2: 0% → "Continue searching"

[2-3 more rounds for remaining sub-questions]

Claude calls research_gaps(sessionId)
→ overall: 82% → "Ready for synthesis"

Claude calls research_synthesize(sessionId)
→ findings by sub-question, sorted by score, with citations

Claude writes the final report

Claude calls memory_save("ml::strategy::survey_first",
  "Start with Semantic Scholar surveys. Anthropic/Google engineering blogs
   found via WebSearch were most useful for production examples.")
```

---

## How Evaluation Works

`research_evaluate` does two things:

1. **Deterministic pre-filtering** (always runs):
   - Removes duplicates by URL or DOI
   - Removes known SEO spam domains

2. **Scoring** (depends on context):
   - **With Claude Code**: Returns cleaned findings with metadata. Claude reads them and naturally judges quality — no extra API call needed.
   - **With `ANTHROPIC_API_KEY` set**: Server calls Claude Haiku to batch-score findings on relevance, credibility, and novelty before returning them. Useful when running the server from a non-Claude client.

---

## Cost

Estimated per session (3 sub-questions, 2 rounds, ~30 findings):

| Source | Cost |
|--------|------|
| Semantic Scholar, GitHub, Papers With Code | Free |
| Exa (6 searches) | ~$0.04 |
| Perplexity (3 queries) | ~$0.015 |
| xAI (2 queries) | ~$0.01 |
| Internal LLM eval (if `ANTHROPIC_API_KEY` set) | ~$0.03 |
| **Total** | **~$0.07–$0.10** |

---

## Data Storage

| Path | Contents |
|------|----------|
| `~/.research-agent/memory.json` | Saved strategies and source quality notes |
| `~/.research-agent/sessions/{id}/plan.json` | Sub-questions and success criteria |
| `~/.research-agent/sessions/{id}/findings.json` | All evaluated findings |
| `~/.research-agent/sessions/{id}/reflections.json` | Round summaries |
| `~/.research-agent/sessions/{id}/coverage.json` | Coverage map |

Sessions persist across context windows — pass the same `sessionId` to resume.

---

## Tests

```bash
npm test
```

45 tests covering evaluator cost estimation, memory persistence and decay, and session CRUD.
