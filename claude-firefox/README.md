# claude-firefox

Firefox browser automation via the Model Context Protocol (MCP).

This is the core MCP server that powers the browser automation agents in this repository. It provides 28 tools for navigating, clicking, typing, extracting content, and interacting with any website through Firefox.

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
./install-native-host.sh
```

This registers the native messaging host so Firefox can communicate with the MCP server.

### 4. Run

```bash
node build/index.js
```

The server starts, listens on a Unix socket, and waits for the Firefox extension to connect.

## Tools

| Category | Tools |
|----------|-------|
| **Navigation** | `tab_create`, `tab_navigate`, `tab_list`, `tab_close` |
| **Snapshots** | `page_snapshot`, `page_content`, `page_screenshot` |
| **Interaction** | `element_click`, `element_type`, `element_fill`, `element_hover`, `element_double_click`, `element_right_click`, `element_drag` |
| **Keyboard** | `key_press` |
| **Waiting** | `wait_for`, `click_and_wait` |
| **Batch** | `batch_actions` |
| **Advanced** | `find`, `page_evaluate`, `set_push_focus`, `clear_push_focus`, `network_requests` |

## Benchmark

```
55/57 (96%) | ~60s wall time | 145 tool calls
```

Tested against the-internet.herokuapp.com (auth, AJAX, dynamic controls, caching, keyboard, flash messages, large DOM, tab management) and production sites (TodoMVC, Wikipedia, Hacker News, GitHub, NPM, DuckDuckGo).
