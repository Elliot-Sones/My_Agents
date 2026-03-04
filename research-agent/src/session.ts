import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { randomBytes } from "crypto";
import {
  ResearchPlan,
  ResearchSession,
  EvaluatedFinding,
  Reflection,
  CoverageMap,
  BudgetTracker,
} from "./types.js";
import { getConfig } from "./config.js";

const SESSIONS_DIR = join(homedir(), ".research-agent", "sessions");

function ensureSessionsDir(): void {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

function sessionDir(sessionId: string): string {
  return join(SESSIONS_DIR, sessionId);
}

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

function generateSessionId(): string {
  return `rs_${Date.now()}_${randomHex(4)}`;
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

function writeJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function createSession(plan: ResearchPlan): ResearchSession {
  ensureSessionsDir();

  const id = generateSessionId();
  const dir = sessionDir(id);
  mkdirSync(dir, { recursive: true });

  const now = Date.now();
  const config = getConfig();

  const session: ResearchSession = {
    id,
    plan,
    findings: [],
    reflections: [],
    coverage: {
      bySubQuestion: {},
      overall: 0,
      diminishingReturns: false,
      recommendation: "Continue searching",
    },
    budget: {
      maxBudget: config.researchBudget,
      spent: 0,
      breakdown: {},
    },
    createdAt: now,
    updatedAt: now,
    status: "active",
  };

  writeJson(join(dir, "plan.json"), plan);
  writeJson(join(dir, "findings.json"), []);
  writeJson(join(dir, "reflections.json"), []);
  writeJson(join(dir, "coverage.json"), session.coverage);
  writeJson(join(dir, "session.json"), {
    id: session.id,
    status: session.status,
    budget: session.budget,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  });

  return session;
}

export function getSession(sessionId: string): ResearchSession | null {
  const dir = sessionDir(sessionId);
  if (!existsSync(dir)) return null;

  const meta = readJson<{
    id: string;
    status: ResearchSession["status"];
    budget: BudgetTracker;
    createdAt: number;
    updatedAt: number;
  }>(join(dir, "session.json"), null as never);

  if (!meta) return null;

  const plan = readJson<ResearchPlan>(join(dir, "plan.json"), null as never);
  if (!plan) return null;

  const findings = readJson<EvaluatedFinding[]>(join(dir, "findings.json"), []);
  const reflections = readJson<Reflection[]>(join(dir, "reflections.json"), []);
  const coverage = readJson<CoverageMap>(join(dir, "coverage.json"), {
    bySubQuestion: {},
    overall: 0,
    diminishingReturns: false,
    recommendation: "Continue searching",
  });

  return {
    id: meta.id,
    plan,
    findings,
    reflections,
    coverage,
    budget: meta.budget,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    status: meta.status,
  };
}

export function updateSession(session: ResearchSession): void {
  const dir = sessionDir(session.id);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  session.updatedAt = Date.now();

  writeJson(join(dir, "plan.json"), session.plan);
  writeJson(join(dir, "findings.json"), session.findings);
  writeJson(join(dir, "reflections.json"), session.reflections);
  writeJson(join(dir, "coverage.json"), session.coverage);
  writeJson(join(dir, "session.json"), {
    id: session.id,
    status: session.status,
    budget: session.budget,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  });
}

export function listSessions(): { id: string; query: string; status: string; createdAt: number }[] {
  ensureSessionsDir();

  const entries = readdirSync(SESSIONS_DIR, { withFileTypes: true });
  const sessions: { id: string; query: string; status: string; createdAt: number }[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const dir = join(SESSIONS_DIR, entry.name);
    const meta = readJson<{ id: string; status: string; createdAt: number } | null>(
      join(dir, "session.json"),
      null
    );
    const plan = readJson<{ query: string } | null>(join(dir, "plan.json"), null);

    if (meta && plan) {
      sessions.push({
        id: meta.id,
        query: plan.query,
        status: meta.status,
        createdAt: meta.createdAt,
      });
    }
  }

  return sessions.sort((a, b) => b.createdAt - a.createdAt);
}

export function addFindings(sessionId: string, findings: EvaluatedFinding[]): void {
  const dir = sessionDir(sessionId);
  if (!existsSync(dir)) return;

  const existing = readJson<EvaluatedFinding[]>(join(dir, "findings.json"), []);
  existing.push(...findings);
  writeJson(join(dir, "findings.json"), existing);

  // Update session timestamp
  const meta = readJson<Record<string, unknown>>(join(dir, "session.json"), {});
  meta.updatedAt = Date.now();
  writeJson(join(dir, "session.json"), meta);
}

export function addReflection(sessionId: string, reflection: Reflection): void {
  const dir = sessionDir(sessionId);
  if (!existsSync(dir)) return;

  const existing = readJson<Reflection[]>(join(dir, "reflections.json"), []);
  existing.push(reflection);
  writeJson(join(dir, "reflections.json"), existing);

  // Update session timestamp
  const meta = readJson<Record<string, unknown>>(join(dir, "session.json"), {});
  meta.updatedAt = Date.now();
  writeJson(join(dir, "session.json"), meta);
}

export function updateCoverage(sessionId: string, coverage: CoverageMap): void {
  const dir = sessionDir(sessionId);
  if (!existsSync(dir)) return;

  writeJson(join(dir, "coverage.json"), coverage);

  // Update session timestamp
  const meta = readJson<Record<string, unknown>>(join(dir, "session.json"), {});
  meta.updatedAt = Date.now();
  writeJson(join(dir, "session.json"), meta);
}

export function trackBudget(sessionId: string, source: string, cost: number): BudgetTracker {
  const dir = sessionDir(sessionId);

  const meta = readJson<{
    id: string;
    status: string;
    budget: BudgetTracker;
    createdAt: number;
    updatedAt: number;
  }>(join(dir, "session.json"), null as never);

  if (!meta) {
    return { maxBudget: 0, spent: 0, breakdown: {} };
  }

  meta.budget.spent += cost;
  meta.budget.breakdown[source] = (meta.budget.breakdown[source] || 0) + cost;
  meta.updatedAt = Date.now();

  writeJson(join(dir, "session.json"), meta);

  return meta.budget;
}
