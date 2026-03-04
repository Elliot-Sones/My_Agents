import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { Memory, parseMemoryKey } from "./types.js";

const MEMORY_PATH = join(homedir(), ".claude-firefox", "memory.json");

let memories: Record<string, Memory> = {};

export function loadMemories(): Record<string, Memory> {
  if (existsSync(MEMORY_PATH)) {
    memories = JSON.parse(readFileSync(MEMORY_PATH, "utf-8"));
  } else {
    memories = {};
  }
  return memories;
}

export function saveMemories(): void {
  const dir = dirname(MEMORY_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(MEMORY_PATH, JSON.stringify(memories, null, 2));
}

export function getMemoriesForDomain(
  domain: string,
  context?: string
): Record<string, Memory> {
  const result: Record<string, Memory> = {};
  for (const [key, mem] of Object.entries(memories)) {
    const parsed = parseMemoryKey(key);
    if (parsed.domain !== domain) continue;
    if (context && parsed.category !== context) continue;
    result[key] = mem;
  }
  return result;
}

export function saveMemory(key: string, value: string): void {
  // Never save password values
  const parsed = parseMemoryKey(key);
  if (parsed.identifier.toLowerCase().includes("password")) return;

  const now = Date.now();
  const existing = memories[key];

  if (existing) {
    existing.history.push({ old: existing.value, changed: now });
    existing.value = value;
    existing.version++;
    existing.last_used = now;
    existing.confidence = Math.min(1.0, existing.confidence + 0.02);
  } else {
    memories[key] = {
      value,
      confidence: 1.0,
      version: 1,
      created: now,
      last_used: now,
      history: [],
    };
  }
  saveMemories();
}

export function deleteMemory(key: string): boolean {
  if (key in memories) {
    delete memories[key];
    saveMemories();
    return true;
  }
  return false;
}

export function decayMemories(): void {
  const toDelete: string[] = [];
  for (const [key, mem] of Object.entries(memories)) {
    mem.confidence *= 0.99;
    if (mem.confidence < 0.1) {
      toDelete.push(key);
    }
  }
  for (const key of toDelete) {
    delete memories[key];
  }
  if (toDelete.length > 0 || Object.keys(memories).length > 0) {
    saveMemories();
  }
}

export function touchMemory(key: string, success: boolean): void {
  const mem = memories[key];
  if (!mem) return;

  mem.last_used = Date.now();
  if (success) {
    mem.confidence = Math.min(1.0, mem.confidence + 0.02);
  } else {
    mem.confidence = 0;
  }
  saveMemories();
}
