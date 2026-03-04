// Evaluator unit tests — run without API keys (tests pre-filtering and cost estimation)
import { estimateEvalCost } from "../build/evaluator.js";

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

console.log("=== Evaluator Tests ===\n");

// Test cost estimation
console.log("Cost estimation:");

const haikuCost10 = estimateEvalCost(10);
assert(haikuCost10 > 0, `10 findings cost > 0 (got $${haikuCost10.toFixed(4)})`);
assert(haikuCost10 < 0.05, `10 findings cost < $0.05 (got $${haikuCost10.toFixed(4)})`);

const haikuCost50 = estimateEvalCost(50);
assert(haikuCost50 > haikuCost10, `50 findings costs more than 10 findings`);
assert(haikuCost50 < 0.15, `50 findings cost < $0.15 (got $${haikuCost50.toFixed(4)})`);

const haikuCost0 = estimateEvalCost(0);
assert(haikuCost0 === 0, `0 findings cost is $0`);

// Test that batching reduces overhead (50 findings should cost less than 5x 10 findings)
const ratio = haikuCost50 / (haikuCost10 * 5);
assert(ratio <= 1.0, `Batching reduces cost (ratio: ${ratio.toFixed(2)})`);

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
