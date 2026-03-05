#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${CLAUDE_FIREFOX_HOME:-$HOME/.claude-firefox}"

echo "=== Claude Firefox MCP - Install ==="
echo

# Create config directory
mkdir -p "$CONFIG_DIR"

# Install dependencies
echo "Installing dependencies..."
cd "$PROJECT_DIR"
npm install

# Build the project
echo "Building..."
npm run build

# Generate shared secret
echo "Generating shared secret..."
SECRET=$(node scripts/generate-secret.js)
echo

echo "=== Setup Complete ==="
echo
echo "Shared secret: $SECRET"
echo
echo "Next steps:"
echo "  1. Open Firefox and go to about:debugging#/runtime/this-firefox"
echo "  2. Click 'Load Temporary Add-on...'"
echo "  3. Select: $PROJECT_DIR/extension/manifest.json"
echo "  4. Click the extension icon and enter the secret above"
echo "  5. Restart your MCP client (Codex or Claude) so it picks up the new MCP server"
echo
