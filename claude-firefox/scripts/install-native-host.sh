#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

NATIVE_HOST_SRC="$PROJECT_DIR/native-host/native-host.js"
INSTALL_DIR="$HOME/.claude-firefox"
INSTALLED_HOST="$INSTALL_DIR/native-host.js"
WRAPPER="$INSTALL_DIR/run.sh"
MANIFEST_DIR="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
MANIFEST_FILE="$MANIFEST_DIR/claude_browser_bridge.json"

# Find the absolute path to node (works with nvm, homebrew, etc.)
NODE_BIN="$(which node)"
if [ -z "$NODE_BIN" ]; then
  echo "Error: node not found in PATH. Make sure Node.js is installed."
  exit 1
fi
NODE_BIN="$(realpath "$NODE_BIN")"

echo "Installing native messaging host..."
echo "  Node: $NODE_BIN ($(node --version))"

# Create install directory and NativeMessagingHosts directory
mkdir -p "$INSTALL_DIR"
mkdir -p "$MANIFEST_DIR"

# Copy native host script to install directory (outside TCC-protected paths)
cp "$NATIVE_HOST_SRC" "$INSTALLED_HOST"
chmod +r "$INSTALLED_HOST"

# Create a wrapper shell script that uses the absolute node path.
# This is necessary because macOS GUI apps (Firefox) don't inherit
# the user's shell PATH, so #!/usr/bin/env node won't find nvm/homebrew node.
cat > "$WRAPPER" <<EOF
#!/bin/bash
exec "$NODE_BIN" "$INSTALLED_HOST"
EOF
chmod +x "$WRAPPER"

# Write the manifest pointing to the wrapper
cat > "$MANIFEST_FILE" <<EOF
{
  "name": "claude_browser_bridge",
  "description": "Claude Browser Bridge native host",
  "path": "$WRAPPER",
  "type": "stdio",
  "allowed_extensions": ["claude-browser-bridge@elliot18"]
}
EOF

echo "Done!"
echo "  Installed: $INSTALL_DIR/"
echo "  Manifest:  $MANIFEST_FILE"
echo "  Wrapper:   $WRAPPER"
echo "  Node:      $NODE_BIN"
