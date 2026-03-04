// Session CRUD tests
import { createSession, getSession, updateSession, listSessions, addFindings, addReflection, updateCoverage, trackBudget } from "../build/session.js";
import { existsSync, rmSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const SESSIONS_DIR = join(homedir(), ".research-agent", "sessions");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

console.log("=== Session Tests ===\n");

// Test create session
console.log("Create session:");
const session = createSession({
  query: "Test research query",
  domain: "test",
  subQuestions: [
    {
      id: "sq_0",
      question: "What is X?",
      priority: "high",
      searchStrategies: ["search for X"],
      status: "pending",
      coveragePercent: 0,
    },
    {
      id: "sq_1",
      question: "How does Y work?",
      priority: "medium",
      searchStrategies: ["search for Y"],
      status: "pending",
      coveragePercent: 0,
    },
  ],
  successCriteria: ["Find at least 3 sources for each sub-question"],
  createdAt: Date.now(),
});

assert(session.id.startsWith("rs_"), `Session ID starts with rs_ (got ${session.id})`);
assert(session.status === "active", "Status is active");
assert(session.plan.subQuestions.length === 2, "Two sub-questions");
assert(session.findings.length === 0, "No findings initially");
assert(session.budget.maxBudget > 0, "Budget set from config");

// Test get session
console.log("\nGet session:");
const retrieved = getSession(session.id);
assert(retrieved !== null, "Session retrieved from disk");
assert(retrieved?.id === session.id, "Same session ID");
assert(retrieved?.plan.query === "Test research query", "Same query");

// Test add findings
console.log("\nAdd findings:");
addFindings(session.id, [
  {
    finding: {
      id: "test_1",
      title: "Test Finding",
      snippet: "A test finding snippet",
      source: "semantic_scholar",
      metadata: { citationCount: 42 },
    },
    score: {
      relevance: 8,
      relevanceReasoning: "Directly relevant",
      credibility: 7,
      credibilityReasoning: "Peer reviewed",
      novelty: 9,
      noveltyReasoning: "New approach",
      contradictions: [],
      keyInsight: "Test insight",
      verdict: "keep",
    },
    evaluatedAt: Date.now(),
  },
]);

const withFindings = getSession(session.id);
assert(withFindings?.findings.length === 1, "One finding added");
assert(withFindings?.findings[0].finding.title === "Test Finding", "Correct finding title");
assert(withFindings?.findings[0].score.verdict === "keep", "Verdict is keep");

// Test add reflection
console.log("\nAdd reflection:");
addReflection(session.id, {
  round: 1,
  subQuestionId: "sq_0",
  summary: "Found one relevant paper on X",
  timestamp: Date.now(),
});

const withReflection = getSession(session.id);
assert(withReflection?.reflections.length === 1, "One reflection added");
assert(withReflection?.reflections[0].summary === "Found one relevant paper on X", "Correct reflection");

// Test update coverage
console.log("\nUpdate coverage:");
updateCoverage(session.id, {
  bySubQuestion: {
    sq_0: {
      percent: 50,
      keptFindings: 1,
      totalSearched: 5,
      unansweredAspects: ["Need more sources"],
      emergentQuestions: [],
      contradictions: [],
    },
    sq_1: {
      percent: 0,
      keptFindings: 0,
      totalSearched: 0,
      unansweredAspects: ["Not started"],
      emergentQuestions: [],
      contradictions: [],
    },
  },
  overall: 25,
  diminishingReturns: false,
  recommendation: "Continue searching",
});

const withCoverage = getSession(session.id);
assert(withCoverage?.coverage.overall === 25, "Overall coverage 25%");
assert(withCoverage?.coverage.bySubQuestion.sq_0.percent === 50, "sq_0 at 50%");

// Test track budget
console.log("\nTrack budget:");
const budget = trackBudget(session.id, "exa", 0.007);
assert(budget.spent === 0.007, `Budget spent: $${budget.spent}`);
assert(budget.breakdown.exa === 0.007, "Exa cost tracked");

const budget2 = trackBudget(session.id, "perplexity", 0.005);
assert(budget2.spent === 0.012, `Total spent: $${budget2.spent}`);

// Test list sessions
console.log("\nList sessions:");
const sessions = listSessions();
assert(sessions.length >= 1, "At least one session listed");
assert(sessions.some((s) => s.id === session.id), "Our session is in the list");

// Test update session status
console.log("\nUpdate session:");
const toUpdate = getSession(session.id);
if (toUpdate) {
  toUpdate.status = "synthesized";
  updateSession(toUpdate);
  const updated = getSession(session.id);
  assert(updated?.status === "synthesized", "Status updated to synthesized");
}

// Test null session
console.log("\nEdge cases:");
const nonExistent = getSession("rs_nonexistent");
assert(nonExistent === null, "Non-existent session returns null");

// Clean up test session
try {
  rmSync(join(SESSIONS_DIR, session.id), { recursive: true, force: true });
} catch { /* ok */ }

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
