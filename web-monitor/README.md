# web-monitor

MCP server for monitoring web pages for changes. Point it at any URL, optionally scope it to a CSS selector, and it will poll on a configurable interval and track every change with unified diffs.

## Features

- **Hash-based change detection** — MD5 comparison is fast and reliable; no false positives from irrelevant DOM noise
- **CSS selector scoping** — Monitor a specific section of a page (price, stock status, job listing) rather than the whole thing
- **Unified text diffs** — Every change is stored as a readable diff so you can see exactly what changed
- **Configurable polling intervals** — Per-monitor intervals from seconds to hours
- **Persistent history** — Last 50 changes per monitor survive server restarts
- **Manual checks** — Trigger an immediate check on any monitor without waiting for the next poll cycle

## Setup

```bash
npm install
npm run build
```

## MCP Configuration

```json
{
  "mcpServers": {
    "web-monitor": {
      "command": "node",
      "args": ["/path/to/web-monitor/build/index.js"]
    }
  }
}
```

## Tools

### `monitor_add`

Register a new page to monitor.

```
monitor_add(
  url: string,           // Page to monitor
  selector?: string,     // CSS selector to scope monitoring (optional)
  interval_seconds?: number,  // Poll interval, default 300 (5 min)
  label?: string         // Human-readable name
)
→ { monitor_id: string }
```

**Examples:**
- Monitor a whole page: `monitor_add(url: "https://example.com/pricing")`
- Monitor a specific element: `monitor_add(url: "https://example.com/jobs", selector: ".job-listings", label: "Job board")`
- Fast polling: `monitor_add(url: "https://example.com/stock", selector: "#price", interval_seconds: 60)`

### `monitor_remove`

```
monitor_remove(monitor_id: string)
```

### `monitor_list`

List all monitors with their current status, last check time, and change count.

```
monitor_list()
→ { monitors: Monitor[] }
```

### `monitor_check`

Immediately fetch and compare the page, regardless of the configured interval.

```
monitor_check(monitor_id: string)
→ { changed: boolean, diff?: string, hash: string, checked_at: number }
```

### `monitor_status`

Detailed status for one monitor (or all if no ID given), including recent change history with diffs.

```
monitor_status(monitor_id?: string)
→ { monitor: Monitor, history: HistoryEntry[] }
```

## How It Works

The server runs a background polling loop that ticks every 60 seconds. On each tick, it checks every monitor whose `(now - last_checked) >= interval_seconds`. For each check:

1. Fetch the page with `fetch()`
2. Extract text — full body text, or the content of the matched CSS selector
3. Compute MD5 hash and compare to the stored hash
4. If changed: compute a unified diff, push a history entry, update stored state

Change history is capped at 50 entries per monitor to keep storage bounded.

## Storage

All monitor state is persisted at `~/.web-monitor/monitors.json`. The server loads this on startup, so monitors survive restarts. There is no separate database required.

```
~/.web-monitor/
  monitors.json    # all monitor state, history, and last-seen content
```
