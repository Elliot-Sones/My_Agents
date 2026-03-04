#!/usr/bin/env bash
# End-to-end performance benchmark for claude-firefox MCP
# Spawns the MCP server, connects as client, times real tool calls.
#
# Requires: Firefox open with claude-firefox extension loaded
# The extension will auto-reconnect to the benchmark's server.

set -euo pipefail
cd "$(dirname "$0")"

echo "Building..."
npm run build 2>/dev/null

echo "Running benchmark (will kill existing MCP server if running)..."
node test/benchmark-perf.js
