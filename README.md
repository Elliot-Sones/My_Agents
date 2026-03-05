<p align="center">
  <img src="assets/banner.svg" alt="My Agents" width="100%"/>
</p>

<p align="center">
  <strong>A collection of autonomous AI agents built on the Model Context Protocol (MCP)</strong>
</p>

<p align="center">
  <a href="#agents">Agents</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#getting-started">Getting Started</a> &bull;
  <a href="#contributing">Contributing</a>
</p>

---

## About

This repository contains production-grade AI agents designed to automate real workflows. Each agent connects to external tools via MCP servers and uses the Claude API to reason, plan, and act autonomously.

The focus is on agents that solve actual problems — not toy demos. Every agent here has been tested against real websites and real-world conditions, including background tab throttling, dynamic content loading, and complex multi-step interactions.

## Agents

| Agent | Description | Status |
|-------|-------------|--------|
| [**claude-firefox**](./claude-firefox) | Firefox browser automation via MCP. Enriched accessibility tree, stable element refs, snapshot caching, 29 tools. | Available |
| [**research-agent**](./research-agent) | Multi-source research with LLM-powered evaluation. Papers, code, opinions, cross-validation, 18 tools. | Available |
| *Web Monitor* | Track page changes and get alerts. | Planned |

## Architecture

```
┌─────────────────────────────────────┐
│           Claude API                │
│     (reasoning + tool selection)    │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│          MCP Protocol               │
│    (standardized tool interface)    │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│          MCP Servers                │
│  ┌───────────┐  ┌────────────────┐  │
│  │  Firefox   │  │   Research     │  │
│  │  Browser   │  │   Agent        │  │
│  │  Automation│  │   (18 tools)   │  │
│  └───────────┘  └────────────────┘  │
└─────────────────────────────────────┘
```

Each agent is an MCP server that exposes tools. Any MCP-compatible client (Claude Code, custom scripts, or the Claude API directly) can connect and use them.

## Getting Started

### Prerequisites

- Node.js 18+
- Firefox (for browser automation agents)

### Install an agent

Each agent has its own directory with setup instructions. For example:

```bash
cd claude-firefox
npm install
npm run build
```

### Use with Claude Code

Add to your Claude Code MCP config:

```json
{
  "mcpServers": {
    "firefox": {
      "command": "node",
      "args": ["/path/to/claude-firefox/build/index.js"]
    }
  }
}
```

### Use with the Claude API directly

```javascript
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Connect to the MCP server
const transport = new StdioClientTransport({
  command: "node",
  args: ["./claude-firefox/build/index.js"]
});
const mcp = new Client({ name: "my-agent", version: "1.0.0" });
await mcp.connect(transport);

// List available tools
const { tools } = await mcp.listTools();

// Use with Claude API
const client = new Anthropic();
const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 4096,
  tools: tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema
  })),
  messages: [{ role: "user", content: "Go to Hacker News and summarize the top 3 stories" }]
});
```

## Performance

The Firefox MCP server scores **96% (55/57)** on our comprehensive benchmark covering navigation, form filling, AJAX handling, caching, keyboard simulation, and real-world sites (Wikipedia, GitHub, NPM, Hacker News, DuckDuckGo).

| Metric | Firefox MCP | Chrome MCP (Claude Code built-in) |
|--------|------------|-----------------------------------|
| Benchmark score | 55/57 (96%) | 50/52 (96%) |
| Wall time | ~60s | ~13 min |
| Tool calls | Direct (no LLM overhead) | 1 LLM turn per call |
| Accessibility tree | Enriched (colors, fonts, bboxes, regions) | Basic |
| Snapshot caching | Fingerprint-based, ~0ms repeat reads | None |
| Stale ref detection | Yes | No |
| Client requirement | Any Node.js MCP client | Claude Code runtime only |

## License

MIT

## Author

**Elliot Sones** — [GitHub](https://github.com/Elliot-Sones)
