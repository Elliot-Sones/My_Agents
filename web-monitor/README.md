# web-monitor MCP Server

An MCP server that monitors web pages for changes. It periodically fetches pages, detects content changes using MD5 hashing, and provides unified diffs of what changed.

## Tools

- **monitor_add** - Add a new web page monitor with optional CSS selector scoping
- **monitor_remove** - Remove a monitor by ID
- **monitor_list** - List all monitors with status
- **monitor_check** - Manually trigger an immediate check
- **monitor_status** - Get detailed status and recent history

## Setup

```bash
npm install
npm run build
```

## Usage

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "web-monitor": {
      "command": "node",
      "args": ["/path/to/web-monitor/build/index.js"],
      "env": {}
    }
  }
}
```

## Storage

Monitor data is stored at `~/.web-monitor/monitors.json`. Each monitor keeps the last 50 change history entries with unified diffs.

## Background Polling

The server runs a background polling loop every 60 seconds. Each monitor is checked when its configured interval has elapsed (default: 300 seconds / 5 minutes).
