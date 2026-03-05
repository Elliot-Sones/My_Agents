<p align="center">
  <img src="assets/banner.svg" alt="My Agents" width="100%"/>
</p>

<p align="center">
  <strong>A collection of production-grade AI agents built on the Model Context Protocol (MCP)</strong>
</p>

<p align="center">
  <a href="#agents">Agents</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#getting-started">Getting Started</a> &bull;
  <a href="#contributing">Contributing</a>
</p>

---

## About

Production-grade MCP servers that give Claude real capabilities — browser automation, deep research, macOS desktop control, and web page monitoring. Each server is built to handle real-world conditions: dynamic content, auth flows, background processes, and failure recovery.

The focus is on agents that solve actual problems, not toy demos.

## Agents

| Agent | Tools | Description |
|-------|:-----:|-------------|
| [**claude-firefox**](./claude-firefox) | 29 | Firefox browser automation. Enriched accessibility tree, stable element refs, snapshot caching. 96% benchmark score. |
| [**research-agent**](./research-agent) | 18 | Multi-source research with LLM evaluation. Academic papers, code search, community opinions, cross-validation. |
| [**claude-macos**](./claude-macos) | 23 | macOS desktop automation. Mouse/keyboard input, accessibility API, window management, screenshots, AppleScript. |
| [**web-monitor**](./web-monitor) | 5 | Web page change monitoring. Hash-based diff detection, CSS selector scoping, persistent background polling. |

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         Claude API                           │
│                  (reasoning + tool selection)                │
└────────────┬──────────────┬──────────────┬───────────────────┘
             │              │              │              │
     MCP Protocol    MCP Protocol   MCP Protocol   MCP Protocol
             │              │              │              │
    ┌────────▼─────┐ ┌──────▼──────┐ ┌────▼────────┐ ┌──▼──────────┐
    │   Firefox    │ │  Research   │ │   macOS     │ │    Web      │
    │  Automation  │ │   Agent     │ │ Automation  │ │   Monitor   │
    │  (29 tools)  │ │ (18 tools)  │ │ (23 tools)  │ │  (5 tools)  │
    └──────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

Each agent is a self-contained MCP server. Any MCP-compatible client — Claude Code, the Claude API directly, or custom scripts — can connect and use them independently or together.

## Getting Started

### Prerequisites

- Node.js 18+
- Firefox (for `claude-firefox`)
- macOS 12+ (for `claude-macos`)

### Install an agent

```bash
cd claude-firefox   # or research-agent, claude-macos, web-monitor
npm install
npm run build
```

Each agent directory has a `.mcp.json` you can reference, plus a full README with setup details.

### Use with Claude Code

Add to your Claude Code MCP config:

```json
{
  "mcpServers": {
    "firefox": {
      "command": "node",
      "args": ["/path/to/claude-firefox/build/index.js"]
    },
    "research": {
      "command": "node",
      "args": ["/path/to/research-agent/build/index.js"]
    },
    "macos": {
      "command": "node",
      "args": ["/path/to/claude-macos/build/index.js"]
    },
    "web-monitor": {
      "command": "node",
      "args": ["/path/to/web-monitor/build/index.js"]
    }
  }
}
```

### Use with the Claude API directly

```javascript
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["./claude-firefox/build/index.js"]
});
const mcp = new Client({ name: "my-agent", version: "1.0.0" });
await mcp.connect(transport);

const { tools } = await mcp.listTools();

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

The Firefox MCP server scores **96% (55/57)** on a comprehensive benchmark covering navigation, form filling, AJAX handling, snapshot caching, keyboard simulation, and real-world sites.

| Metric | claude-firefox | Chrome MCP (Claude Code built-in) |
|--------|:--------------:|:---------------------------------:|
| Benchmark score | 55/57 (96%) | 50/52 (96%) |
| Wall time | ~60s | ~13 min |
| Accessibility tree | Enriched (colors, fonts, bboxes) | Basic |
| Snapshot caching | Fingerprint-based, ~0ms repeats | None |
| Stale ref detection | Yes | No |
| Client requirement | Any MCP client | Claude Code only |

## License

MIT

## Author

**Elliot Sones** — [GitHub](https://github.com/Elliot-Sones)
