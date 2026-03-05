# claude-firefox

Firefox browser automation via the Model Context Protocol (MCP).

29 tools for navigating, clicking, typing, extracting content, and interacting with any website. Connects to Firefox through a native messaging extension, giving it direct access to the browser's JavaScript engine and accessibility tree.

## How It Works

```
MCP Client → MCP Server (Node.js) → Unix Socket → Native Host → Firefox Extension → Page
```

The extension runs inside Firefox with full page access. The MCP server communicates with it over a Unix socket via the native messaging host. This means tool calls are direct — no screenshot parsing, no coordinate guessing.

## Features

- **Enriched accessibility tree** — Colors, font sizes, bounding boxes, region markers, editor detection
- **Stable element refs** — Same element always gets the same ref ID within a page lifecycle
- **Snapshot caching** — Fingerprint-based invalidation, ~0ms for unchanged pages
- **Stale ref detection** — Detects when elements have been removed from the DOM
- **Navigation-aware clicks** — Automatically detects full-page navigation vs SPA updates
- **Background tab support** — Works correctly even when the tab isn't focused

## Setup

### 1. Install dependencies

```bash
npm install
npm run build
```

### 2. Install the Firefox extension

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox" in the sidebar
3. Click "Load Temporary Add-on"
4. Select `extension/manifest.json` from this directory

### 3. Install the native host

```bash
./scripts/install-native-host.sh
```

This registers the native messaging host so Firefox can communicate with the MCP server.

### 4. Run

```bash
node build/index.js
```

The server starts, listens on a Unix socket, and waits for the Firefox extension to connect.

## MCP Configuration

Use the same MCP server definition in either client:

```json
{
  "mcpServers": {
    "claude-firefox": {
      "command": "node",
      "args": ["/absolute/path/to/claude-firefox/build/index.js"],
      "cwd": "/absolute/path/to/claude-firefox"
    }
  }
}
```

Only the config file location changes per client. The server command and args stay the same.

## Runtime Environment Variables

- `CLAUDE_FIREFOX_HOME` (default `~/.claude-firefox`): home directory for PID, socket, memory, and capture files.
- `CLAUDE_FIREFOX_CAPTURE_HOST` (default `127.0.0.1`): bind host for the capture endpoint.
- `CLAUDE_FIREFOX_CAPTURE_PORT` (default `7866`): bind port for the capture endpoint.
- `CLAUDE_FIREFOX_REQUEST_TIMEOUT_MS` (default `60000`, minimum `5000`): timeout for bridge requests.

## Tools

| Category | Tools |
|----------|-------|
| **Navigation** | `tab_create`, `tab_navigate`, `tab_list`, `tab_close` |
| **Snapshots** | `page_snapshot`, `page_content`, `page_screenshot` |
| **Interaction** | `element_click`, `element_type`, `element_fill`, `element_hover`, `element_double_click`, `element_right_click`, `element_drag` |
| **Keyboard** | `key_press` |
| **Waiting** | `wait_for`, `click_and_wait` |
| **Batch** | `batch_actions` |
| **Advanced** | `find`, `page_evaluate`, `set_push_focus`, `clear_push_focus`, `network_requests`, `bridge_status` |

## Troubleshooting

If tool calls time out, run `bridge_status` from your MCP client and confirm:
- `connected: true`
- `socketPath` matches your configured `CLAUDE_FIREFOX_HOME`
- Firefox extension is loaded and native host is installed

## Benchmark

```
55/57 (96%) | ~60s wall time | 145 tool calls
```

Tested against the-internet.herokuapp.com (auth, AJAX, dynamic controls, caching, keyboard, flash messages, large DOM, tab management) and production sites (TodoMVC, Wikipedia, Hacker News, GitHub, NPM, DuckDuckGo).
