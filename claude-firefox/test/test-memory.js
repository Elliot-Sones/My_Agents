// Test the memory system
import { loadMemories, saveMemory, getMemoriesForDomain, deleteMemory, decayMemories, touchMemory, saveMemories } from "../build/memory.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const MEMORY_PATH = join(homedir(), ".claude-firefox", "memory.json");
const BACKUP_PATH = MEMORY_PATH + ".bak";

// Backup existing memories
if (existsSync(MEMORY_PATH)) {
  writeFileSync(BACKUP_PATH, readFileSync(MEMORY_PATH));
}

// Start clean
writeFileSync(MEMORY_PATH, "{}");

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

console.log("=== Memory System Tests ===\n");

// Test 1: Load empty memories
console.log("Test 1: Load empty memories");
const mems = loadMemories();
assert(Object.keys(mems).length === 0, "Empty memories loaded");

// Test 2: Save a memory
console.log("\nTest 2: Save a memory");
saveMemory("example.com::selector::login_btn", "#login-submit");
const saved = loadMemories();
assert("example.com::selector::login_btn" in saved, "Memory saved");
assert(saved["example.com::selector::login_btn"].value === "#login-submit", "Correct value");
assert(saved["example.com::selector::login_btn"].confidence === 1.0, "Confidence starts at 1.0");
assert(saved["example.com::selector::login_btn"].version === 1, "Version starts at 1");
assert(saved["example.com::selector::login_btn"].history.length === 0, "No history initially");

// Test 3: Update existing memory (upsert with history)
console.log("\nTest 3: Update existing memory");
saveMemory("example.com::selector::login_btn", "#new-login-btn");
const updated = loadMemories();
assert(updated["example.com::selector::login_btn"].value === "#new-login-btn", "Value updated");
assert(updated["example.com::selector::login_btn"].version === 2, "Version bumped");
assert(updated["example.com::selector::login_btn"].history.length === 1, "Old value in history");
assert(updated["example.com::selector::login_btn"].history[0].old === "#login-submit", "History has old value");

// Test 4: Password exclusion
console.log("\nTest 4: Password exclusion");
saveMemory("example.com::selector::password_field", "s3cret_val");
const afterPw = loadMemories();
assert(!("example.com::selector::password_field" in afterPw), "Password memory NOT saved");

// Test 5: Domain-scoped retrieval
console.log("\nTest 5: Domain-scoped retrieval");
saveMemory("other.com::pattern::cookie_popup", "Close with .accept-btn");
saveMemory("example.com::pattern::redirect", "Redirects to /dashboard after login");
const exampleMems = getMemoriesForDomain("example.com");
assert(Object.keys(exampleMems).length === 2, "Got 2 example.com memories");
assert(!("other.com::pattern::cookie_popup" in exampleMems), "No cross-domain leak");

const otherMems = getMemoriesForDomain("other.com");
assert(Object.keys(otherMems).length === 1, "Got 1 other.com memory");

// Test 6: Domain + category filtering
console.log("\nTest 6: Domain + category filtering");
const selectorOnly = getMemoriesForDomain("example.com", "selector");
assert(Object.keys(selectorOnly).length === 1, "Got 1 selector memory for example.com");

// Test 7: Touch memory (success)
console.log("\nTest 7: Touch memory (success boost)");
// First decay so confidence < 1.0, then boost
decayMemories();
const beforeTouch = loadMemories()["example.com::selector::login_btn"].confidence;
assert(beforeTouch < 1.0, `Confidence decayed below 1.0: ${beforeTouch}`);
touchMemory("example.com::selector::login_btn", true);
const afterTouch = loadMemories()["example.com::selector::login_btn"].confidence;
assert(afterTouch > beforeTouch, `Confidence boosted: ${beforeTouch.toFixed(4)} → ${afterTouch.toFixed(4)}`);

// Test 8: Touch memory (failure = kill)
console.log("\nTest 8: Touch memory (failure kills confidence)");
touchMemory("example.com::pattern::redirect", false);
const afterFail = loadMemories()["example.com::pattern::redirect"].confidence;
assert(afterFail === 0, "Confidence dropped to 0 on failure");

// Test 9: Decay memories
console.log("\nTest 9: Decay memories");
decayMemories();
const afterDecay = loadMemories();
assert(!("example.com::pattern::redirect" in afterDecay), "Zero-confidence memory deleted by decay");
assert("example.com::selector::login_btn" in afterDecay, "Healthy memory survives decay");

// Test 10: Delete memory
console.log("\nTest 10: Delete memory");
const delResult = deleteMemory("other.com::pattern::cookie_popup");
assert(delResult === true, "Delete returns true");
const afterDel = loadMemories();
assert(!("other.com::pattern::cookie_popup" in afterDel), "Memory deleted");

const delResult2 = deleteMemory("nonexistent::key::foo");
assert(delResult2 === false, "Delete nonexistent returns false");

// Test 11: Persistence across load/save
console.log("\nTest 11: Persistence");
const diskData = JSON.parse(readFileSync(MEMORY_PATH, "utf-8"));
assert("example.com::selector::login_btn" in diskData, "Data persisted to disk");

// Restore backup
if (existsSync(BACKUP_PATH)) {
  writeFileSync(MEMORY_PATH, readFileSync(BACKUP_PATH));
} else {
  writeFileSync(MEMORY_PATH, "{}");
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
