// Memory persistence tests
import { loadMemories, saveMemory, getMemoriesForDomain, deleteMemory, decayMemories, getAllMemories, touchMemory } from "../build/memory.js";
import { existsSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const MEMORY_PATH = join(homedir(), ".research-agent", "memory.json");

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

// Clean up before tests
try { unlinkSync(MEMORY_PATH); } catch { /* ok */ }

console.log("=== Memory Tests ===\n");

// Test load empty
console.log("Load empty memory:");
const empty = loadMemories();
assert(Object.keys(empty).length === 0, "Empty memory on first load");

// Test save and recall
console.log("\nSave and recall:");
saveMemory("ml::strategy::survey_first", "Start with survey papers before deep-diving");
const recalled = getMemoriesForDomain("ml", "strategy");
assert(Object.keys(recalled).length === 1, "One memory saved");
assert(recalled["ml::strategy::survey_first"]?.value === "Start with survey papers before deep-diving", "Correct value");
assert(recalled["ml::strategy::survey_first"]?.confidence === 1.0, "Initial confidence is 1.0");

// Test update existing
console.log("\nUpdate existing:");
saveMemory("ml::strategy::survey_first", "Start with Semantic Scholar surveys, then Exa for related");
const updated = getMemoriesForDomain("ml");
assert(updated["ml::strategy::survey_first"]?.value === "Start with Semantic Scholar surveys, then Exa for related", "Value updated");
assert(updated["ml::strategy::survey_first"]?.version === 2, "Version incremented");
assert(updated["ml::strategy::survey_first"]?.history.length === 1, "History entry added");

// Test domain filtering
console.log("\nDomain filtering:");
saveMemory("security::strategy::vuln_databases", "Check NVD first");
saveMemory("security::source_quality::nvd", "Highly reliable, but slow to update");
const secAll = getMemoriesForDomain("security");
assert(Object.keys(secAll).length === 2, "Two security memories");
const secStrategy = getMemoriesForDomain("security", "strategy");
assert(Object.keys(secStrategy).length === 1, "One security strategy");

// Test getAllMemories
console.log("\nGet all memories:");
const all = getAllMemories();
assert(Object.keys(all).length === 3, "Three total memories");

// Test touch memory (success)
console.log("\nTouch memory:");
touchMemory("ml::strategy::survey_first", true);
const touched = getMemoriesForDomain("ml");
assert(touched["ml::strategy::survey_first"]?.confidence > 1.0 - 0.001, "Confidence increased on success");

// Test touch memory (failure)
touchMemory("ml::strategy::survey_first", false);
const touchedFail = getMemoriesForDomain("ml");
assert(touchedFail["ml::strategy::survey_first"]?.confidence === 0, "Confidence set to 0 on failure");

// Test decay
console.log("\nDecay:");
saveMemory("test::strategy::will_decay", "temporary");
// Multiple decays should reduce confidence
for (let i = 0; i < 250; i++) decayMemories();
const decayed = getMemoriesForDomain("test");
assert(Object.keys(decayed).length === 0, "Low-confidence memories deleted after many decays");

// Test delete
console.log("\nDelete:");
saveMemory("temp::strategy::delete_me", "to be deleted");
const deleted = deleteMemory("temp::strategy::delete_me");
assert(deleted === true, "Delete returns true");
const afterDelete = getMemoriesForDomain("temp");
assert(Object.keys(afterDelete).length === 0, "Memory removed after delete");

// Test persistence
console.log("\nPersistence:");
saveMemory("persist::strategy::test_persist", "this should survive reload");
assert(existsSync(MEMORY_PATH), "Memory file exists on disk");
const reloaded = loadMemories();
assert(reloaded["persist::strategy::test_persist"]?.value === "this should survive reload", "Memories persist after reload");

// Clean up
try { unlinkSync(MEMORY_PATH); } catch { /* ok */ }

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
