# AI Browser Automation: Comprehensive Research

> Last updated: 2026-02-26
> Goal: Build a browser agent faster than a human at retrieving information

---

## Table of Contents

1. [MCP Browser Tools](#1-mcp-browser-tools)
2. [AI Browser Agent Frameworks](#2-ai-browser-agent-frameworks)
3. [Research Papers & Benchmarks](#3-research-papers--benchmarks)
4. [Page Representation Strategies](#4-page-representation-strategies)
5. [Action Grounding Techniques](#5-action-grounding-techniques)
6. [Browser Control Layer: CDP vs Playwright vs WebExtension](#6-browser-control-layer-cdp-vs-playwright-vs-webextension)
7. [Speed Optimization Techniques](#7-speed-optimization-techniques)
8. [Commercial Products](#8-commercial-products)
9. [Architectural Patterns & Takeaways](#9-architectural-patterns--takeaways)
10. [The Skills Pattern (mcp-browser-use)](#10-the-skills-pattern-mcp-browser-use-deep-dive)
11. [WebArena Benchmark: The Target](#11-webarena-benchmark-the-target)
12. [How the Top WebArena Agents Work](#12-how-the-top-webarena-agents-work)
13. [What Techniques Actually Matter](#13-what-techniques-actually-matter-ranked-by-impact)

---

## 1. MCP Browser Tools

### Tier 1: Major Projects (1000+ stars)

#### microsoft/playwright-mcp
- **Stars:** ~27,700
- **Engine:** Playwright (Chromium, Firefox, WebKit)
- **Architecture:** Standalone MCP server that launches and controls a browser via Playwright. Communicates over stdio or SSE transport. No browser extension needed.
- **Page representation:** Structured accessibility snapshots (Playwright's built-in AXTree). Purely text-based, no vision model required. Elements referenced via `@e1`, `@e2` etc.
- **Key tools:** Navigate, click, type, select, hover, drag-and-drop, key press, file upload, tab management, PDF saving, screenshots (optional with `--caps vision`), console logs, network requests, JS execution, accessibility snapshot, trace recording.
- **Performance:** Fast and lightweight. Deterministic tool application. Low token usage since it avoids screenshots by default.
- **Limitations:** Launches a separate browser instance (not your logged-in browser). Does not pierce shadow DOM in accessibility snapshots by default.
- **URL:** https://github.com/microsoft/playwright-mcp

#### ChromeDevTools/chrome-devtools-mcp
- **Stars:** ~26,400
- **Engine:** Chrome (via CDP)
- **Architecture:** MCP server that auto-launches or connects to a Chrome instance via CDP. Official Google project. Offers "slim" mode (3 tools) and full mode (27 tools).
- **Page representation:** Accessibility tree text snapshots, DOM CSS selector queries, screenshots.
- **Key tools:** Navigation, wait for text, page scripting, screenshots, console messages, DOM queries, network request listing, performance trace recording, memory heapsnapshots, emulation (dark mode, network throttle), accessibility snapshots.
- **Limitations:** Chrome-only. Primarily debugging/inspection -- no built-in click/type by element ref.
- **URL:** https://github.com/ChromeDevTools/chrome-devtools-mcp

#### modelcontextprotocol/servers (Puppeteer) -- Anthropic Official
- **Stars:** Parent repo ~16,000+
- **Engine:** Puppeteer (Chromium/Chrome)
- **Architecture:** Reference MCP server by Anthropic. Standalone process, no extension.
- **Page representation:** Screenshots (primary). Also JS execution and console monitoring.
- **Key tools:** `puppeteer_navigate`, `puppeteer_click`, `puppeteer_screenshot`, `puppeteer_fill`, `puppeteer_select`, `puppeteer_hover`, `puppeteer_evaluate`.
- **Limitations:** Screenshot-based (requires vision LLM). No accessibility tree. Limited tool set. Now archived, superseded by playwright-mcp.
- **URL:** https://github.com/modelcontextprotocol/servers

#### hangwin/mcp-chrome
- **Stars:** ~9,100 - 10,400
- **Engine:** Chrome (via Chrome Extension)
- **Architecture:** Chrome WebExtension + MCP server via stdio. Uses user's real browser profile (logged-in sessions, cookies).
- **Page representation:** Screenshots, semantic search via built-in vector database, AI-powered text extraction with similarity matching.
- **Key tools:** 20+ tools -- screenshots, network monitoring, click, type, bookmark management, browsing history, console capture, semantic search across tab content.
- **Performance:** SIMD-accelerated WebAssembly for vector operations (4-8x faster). Local execution, no network latency.
- **Limitations:** Chrome-only.
- **URL:** https://github.com/hangwin/mcp-chrome

#### AgentDeskAI/browser-tools-mcp
- **Stars:** ~7,000
- **Engine:** Chrome (via Chrome Extension)
- **Architecture:** Chrome Extension + MCP server + intermediary Node.js server. Designed primarily as a debugging bridge between browser and Cursor IDE.
- **Page representation:** Screenshots, console logs, network activity, DOM element selection, Lighthouse audit results.
- **Limitations:** Primarily read-only monitoring/debugging. Not full browser automation (no click/type/navigate). Chrome-only.
- **URL:** https://github.com/AgentDeskAI/browser-tools-mcp

#### BrowserMCP/mcp
- **Stars:** ~5,700
- **Engine:** Chrome (via Chrome Extension)
- **Architecture:** Chrome Extension + MCP server. Uses user's real browser with existing profile.
- **Key tools:** Web navigation, form filling, data extraction, automated testing.
- **Performance:** Fast local execution. Avoids bot detection by using real browser fingerprint.
- **URL:** https://github.com/BrowserMCP/mcp

#### executeautomation/mcp-playwright
- **Stars:** ~5,200
- **Engine:** Playwright (Chromium, Firefox, WebKit + 143 device emulations)
- **Architecture:** Standalone MCP server. Supports device presets (iPhone, iPad, Pixel, Galaxy, Desktop).
- **Page representation:** Full HTML content extraction, visible text extraction, screenshots. No accessibility tree mode.
- **Key tools:** Navigate, click, fill, select, hover, screenshots, HTML retrieval, text extraction, console logs, iframe interactions, code generation/recording session.
- **Limitations:** Separate browser instance. HTML-based representation is token-heavy.
- **URL:** https://github.com/executeautomation/mcp-playwright

### Tier 2: Notable Projects (100-5000 stars)

#### remorses/playwriter
- **Stars:** ~2,000
- **Engine:** Chrome Extension + Playwright API via WebSocket
- **Architecture:** Chrome Extension connects via WebSocket (port 19988) to local server. Single `execute` tool that accepts Playwright code snippets. Runs in user's main Chrome browser.
- **Key innovation:** LLM writes Playwright code directly. Full API without per-tool overhead.
- **URL:** https://github.com/remorses/playwriter

#### kontext-dev/browser-use-mcp-server
- **Stars:** ~777
- **Engine:** Playwright (via browser-use Python library)
- **Architecture:** Python MCP server wrapping browser-use (79k stars). Supports SSE and stdio transports. Optional VNC streaming.
- **URL:** https://github.com/kontext-dev/browser-use-mcp-server

#### browserbase/mcp-server-browserbase (Stagehand)
- **Stars:** ~603
- **Engine:** Cloud-hosted Chromium (Browserbase) + Stagehand
- **Architecture:** Cloud browser service. Natural language browser automation via Stagehand.
- **Key tools:** `stagehand_navigate`, `stagehand_act` (NL actions), `stagehand_extract` (structured data), `stagehand_observe` (preview actions), screenshots.
- **Limitations:** Requires Browserbase cloud account (paid). Network latency.
- **URL:** https://github.com/browserbase/mcp-server-browserbase

#### Saik0s/mcp-browser-use
- **Stars:** ~376
- **Engine:** Playwright (via browser-use)
- **Key innovation:** "Skills" feature -- teach agent a task once, replay 50x faster using discovered API endpoints (1-3s vs 60-120s for full browser nav).
- **URL:** https://github.com/Saik0s/mcp-browser-use

#### angiejones/mcp-selenium
- **Stars:** ~339
- **Engine:** Selenium WebDriver (Chrome, Firefox, Edge, Safari)
- **Key tools:** Start session, navigate, find elements (CSS/XPath/ID/name/tag), click, type, hover, drag-and-drop, screenshots, file upload.
- **URL:** https://github.com/angiejones/mcp-selenium

### Tier 3: Firefox-Specific MCP Servers

#### eyalzh/browser-control-mcp
- **Engine:** Firefox WebExtension
- **Architecture:** Security-focused. Read-only by default. Extension-side audit log.
- **Key tools:** Open/close tabs, list tabs, browsing history, read text content and links.
- **Limitations:** Read-only. No click/type/fill.
- **URL:** https://github.com/eyalzh/browser-control-mcp

#### kstrikis/MCPMonkey
- **Engine:** Firefox (Violentmonkey fork) + WebSocket (port 3025)
- **Key tools:** Tab management, page style extraction, userscript support, custom `.mcp.js` files.
- **URL:** https://github.com/kstrikis/MCPMonkey

#### freema/firefox-devtools-mcp
- **Engine:** Firefox via Selenium WebDriver + WebDriver BiDi
- **Key tools:** Snapshot-based element interaction, network monitoring, console capture, screenshots.
- **URL:** https://github.com/freema/firefox-devtools-mcp

#### gruence/firefox-mcp
- **Engine:** Firefox WebExtension + Native Messaging
- **Architecture:** WebSocket server (ws://localhost:8080) with zero dependencies. JSON-RPC 2.0.
- **Limitations:** Minimal tool set. Early stage.
- **URL:** https://github.com/gruence/firefox-mcp

#### menonpg/browser-control-mcp-firefox
- **Engine:** Firefox WebExtension. Fork of browser-control-mcp for Firefox.
- **URL:** https://github.com/menonpg/browser-control-mcp-firefox

### Tier 3: Other Specialized

| Project | Engine | Focus |
|---------|--------|-------|
| [lxe/chrome-mcp](https://github.com/lxe/chrome-mcp) | Chrome CDP (Bun) | Minimal, direct CDP, near-instant startup |
| [lars-hagen/mcp-playwright-cdp](https://github.com/lars-hagen/mcp-playwright-cdp) | Playwright + CDP | Bridges Playwright tools with CDP attach to running Chrome |
| [apify/actor-playwright-mcp](https://github.com/apify/actor-playwright-mcp) | Playwright (Apify cloud) | Serverless cloud execution with proxy support |
| [withLinda/puppeteer-real-browser-mcp-server](https://github.com/withLinda/puppeteer-real-browser-mcp-server) | Puppeteer | Anti-detection, stealth, CAPTCHA solving |
| [djannot/puppeteer-vision-mcp](https://github.com/djannot/puppeteer-vision-mcp) | Puppeteer + AI vision | Screenshot + AI for cookie/CAPTCHA handling, Readability extraction |
| [badchars/mcp-browser](https://github.com/badchars/mcp-browser) | Playwright | XSS scanning, security analysis |
| [InDate/cdp-tools-mcp](https://github.com/InDate/cdp-tools-mcp) | Chrome CDP | Full debugger control (breakpoints, stepping, call stack) |
| [nicholmikey/chrome-tools-MCP](https://github.com/nicholmikey/chrome-tools-MCP) | Chrome CDP | Tab listing, JS execution, AI-optimized screenshots |
| [djyde/browser-mcp](https://github.com/djyde/browser-mcp) | Chrome/Edge/Firefox Extension | Markdown extraction, CSS injection, history search |
| [blazickjp/web-browser-mcp-server](https://github.com/blazickjp/web-browser-mcp-server) | BeautifulSoup4 (no browser) | HTTP fetch + CSS selector extraction |
| [jae-jae/fetcher-mcp](https://github.com/jae-jae/fetcher-mcp) | Playwright (headless) | Fetch/extract only. Resource blocking. Not interactive |

---

## 2. AI Browser Agent Frameworks

### Top-Tier Frameworks (10,000+ stars)

#### browser-use/browser-use
- **Stars:** ~79,000 | **License:** MIT
- **What:** Most popular open-source AI browser automation framework. $17M+ seed funding.
- **Engine:** Playwright (Chromium). Migrated element extraction to raw CDP for 5x speed improvement.
- **Page representation:** Hybrid -- screenshots + DOM element indices. Interactive elements presented as clickable indices.
- **Action space:** Navigate, click, type, screenshot, fill forms, inspect state, custom tools.
- **LLMs:** ChatBrowserUse (proprietary, 3-5x faster), OpenAI, Gemini, Claude, Ollama.
- **Performance:** 89% on WebVoyager. ~3s per step. ~75% prompt cache hit rate.
- **Key innovation:** Proprietary ChatBrowserUse model optimized for browser tasks.
- **URL:** https://github.com/browser-use/browser-use

#### OpenHands/OpenHands (formerly OpenDevin)
- **Stars:** ~68,200 | **License:** MIT
- **What:** AI development platform with browser agent component built on BrowserGym.
- **Engine:** Playwright via BrowserGym
- **Page representation:** Multimodal (accessibility trees, HTML, screenshots via BrowserGym).
- **Performance:** 77.6% SWEBench, 15% WebArena, 79% HumanEvalFix.
- **URL:** https://github.com/OpenHands/OpenHands

#### bytedance/UI-TARS-desktop (Agent TARS)
- **Stars:** ~28,300 | **License:** Apache-2.0
- **What:** ByteDance's multimodal AI agent. Desktop app with browser + computer operators.
- **Page representation:** Screenshots + optional DOM element detection (hybrid).
- **LLMs:** Claude 3.7, Doubao 1.5, UI-TARS-1.5, Seed series.
- **Performance:** UI-TARS-2: 88.2 Online-Mind2Web, 47.5 OSWorld, 50.6 WindowsAgentArena.
- **Key innovation:** Hybrid browser control (GUI agent + DOM-based). Event Stream protocol.
- **URL:** https://github.com/bytedance/UI-TARS-desktop

#### browserbase/stagehand
- **Stars:** ~21,300 | **License:** MIT
- **What:** TypeScript SDK blending natural language + programmatic code.
- **Engine:** CDP (Chromium). v3 removed Playwright dependency, added modular driver system.
- **Action space:** `act()` for AI actions, `agent()` for multi-step tasks, `extract()` for structured data with Zod schemas.
- **Key innovation:** Auto-caching (remembers previous actions); self-healing; 44% faster in v3; 500K+ weekly downloads.
- **URL:** https://github.com/browserbase/stagehand

#### Skyvern-AI/skyvern
- **Stars:** ~20,500 | **License:** AGPL-3.0
- **What:** Browser automation using LLMs + computer vision. RPA-adjacent.
- **Engine:** Playwright with CDP
- **Page representation:** Vision-first -- LLM analysis of screenshots, no DOM parsing needed.
- **Key innovation:** Swarm-based agents (Interactable Element Agent, Navigation Agent, Data Extraction Agent). One workflow runs across site redesigns.
- **Performance:** 64.4% on WebBench (SOTA for WRITE tasks).
- **URL:** https://github.com/Skyvern-AI/skyvern

#### vercel-labs/agent-browser
- **Stars:** ~15,800 | **License:** Apache-2.0
- **What:** Headless browser automation CLI for AI agents. Rust CLI with Node.js fallback.
- **Engine:** Chromium default; also Firefox, WebKit via Playwright protocol.
- **Page representation:** Accessibility tree with semantic refs (`@e1`, `@e2`). Also annotated screenshots and JS eval.
- **Action space:** click, dblclick, hover, focus, type, fill, keyboard, select, check/uncheck, scroll, drag-and-drop, file upload, dialog handling, tab management.
- **Key innovation:** Rust-based CLI for sub-millisecond parsing; daemon persistence = sub-100ms latency; 93% context window savings vs raw DOM.
- **URL:** https://github.com/vercel-labs/agent-browser

#### anthropics/claude-quickstarts (Computer Use)
- **Stars:** ~14,800 | **License:** MIT
- **What:** Reference implementation for Claude's computer use capability.
- **Engine:** Playwright for browser; native screen control for desktop.
- **Page representation:** Screenshots. Claude counts pixels from screen edges.
- **Performance:** SOTA on WebArena among single-agent systems.
- **URL:** https://github.com/anthropics/claude-quickstarts

### Mid-Tier Frameworks (1,000-10,000 stars)

#### microsoft/UFO (UFO3 Galaxy)
- **Stars:** ~8,000 | **License:** MIT
- **What:** Windows UI-focused agent framework. Controls apps via OS-level GUI interactions.
- **Engine:** Windows UI Automation (UIA), Win32, WinCOM APIs.
- **Key innovation:** Speculative multi-action batching reduces LLM calls by 51%. Cross-device orchestration (UFO3).
- **URL:** https://github.com/microsoft/UFO

#### lavague-ai/LaVague
- **Stars:** ~6,300 | **License:** Apache-2.0
- **What:** Large Action Model framework. World Model (planning) + Action Engine (execution).
- **Engine:** Selenium, Playwright, or Chrome Extension driver.
- **LLMs:** Default GPT-4o. Supports Llama 3, Azure, Gemini, Ollama.
- **Limitations:** Last commit January 2025. Activity declining.
- **URL:** https://github.com/lavague-ai/LaVague

#### steel-dev/steel-browser
- **Stars:** ~4,100
- **What:** Open-source browser API/sandbox for AI agents. Infrastructure layer.
- **Engine:** Puppeteer/CDP. Compatible with Playwright and Selenium.
- **Key tools:** Page to markdown, readability, screenshots, PDFs. Session management with state persistence.
- **URL:** https://github.com/steel-dev/steel-browser

#### google-gemini/computer-use-preview
- **Stars:** ~2,800 | **License:** Apache-2.0
- **What:** Google's Gemini computer use implementation.
- **Engine:** Playwright or Browserbase
- **LLMs:** Gemini 2.5, 3 Flash, 3 Pro.
- **URL:** https://github.com/google-gemini/computer-use-preview

#### reworkd/tarsier
- **Stars:** ~1,800 | **License:** MIT
- **What:** Perception/vision library for web agents. Converts webpages to LLM-readable formats.
- **Engine:** Playwright (async API)
- **Page representation:** Two modes:
  1. Visual element tagging with bracketed IDs (`[23]` general, `[#ID]` inputs, `[@ID]` links, `[$ID]` buttons)
  2. OCR to whitespace-structured ASCII text
- **Key finding:** "Unimodal GPT-4 + Tarsier-Text beats GPT-4V + Tarsier-Screenshot by 10-20%"
- **URL:** https://github.com/reworkd/tarsier

#### showlab/computer_use_ootb
- **Stars:** ~1,800
- **What:** Out-of-the-box GUI agent for Windows/macOS. No Docker required.
- **LLMs:** Claude 3.5 (API), ShowUI, UI-TARS (local).
- **URL:** https://github.com/showlab/computer_use_ootb

#### OpenAdaptAI/OpenAdapt
- **Stars:** ~1,500 | **License:** MIT
- **What:** Generative RPA. Records human GUI demos, trains ML models, deploys adaptive agents.
- **Key innovation:** Learn-by-demonstration. Demo-aware prompting improved accuracy from 46.7% to 100% in controlled tests.
- **URL:** https://github.com/OpenAdaptAI/OpenAdapt

#### openai/openai-cua-sample-app
- **Stars:** ~1,300 | **License:** MIT
- **What:** OpenAI's Computer Using Agent reference implementation.
- **Engine:** Playwright (primary); also Docker, Browserbase, Scrapybara.
- **Action space:** `click(x,y)`, `double_click(x,y)`, `scroll(x,y,dx,dy)`, `type(text)`, `keypress(keys)`, `move(x,y)`, `drag(path)`, `wait(ms)`.
- **Performance:** Operator achieves 83.5% on WebVoyager.
- **URL:** https://github.com/openai/openai-cua-sample-app

#### EmergenceAI/Agent-E
- **Stars:** ~1,200 | **License:** MIT
- **What:** Multi-agent system for browser automation via natural language. Planner + Browser Navigation Agent.
- **Engine:** Chrome + Playwright
- **Page representation:** DOM distillation via `get_dom_with_content_type` skill. Three modes: `text_only`, `input_fields`, `all_fields`.
- **Key innovation:** Skill-based architecture. Atomic skills return natural language descriptions. FastAPI endpoint.
- **URL:** https://github.com/EmergenceAI/Agent-E

#### THUDM/CogAgent
- **Stars:** ~1,100 | **License:** Apache-2.0
- **What:** End-to-end VLM for GUI agents. 18B parameters (11B visual + 7B language). CVPR 2024.
- **Page representation:** Raw screenshots at 1120x1120 resolution.
- **Action space:** CLICK (with coordinates), TYPE, SCROLL_DOWN, RIGHT_CLICK.
- **Performance:** SOTA on Screenspot (GUI localization), OmniAct (single-step).
- **Limitations:** Requires 29GB+ VRAM.
- **URL:** https://github.com/THUDM/CogAgent

#### ServiceNow/BrowserGym
- **Stars:** ~1,100 | **License:** Apache-2.0
- **What:** Gym environment (standardized RL interface) for web task research. Unifies 8+ benchmarks.
- **Engine:** Chromium via Playwright
- **Integrates:** MiniWoB++, WebArena, VisualWebArena, WorkArena, AssistantBench, WebLINX, OpenApps.
- **URL:** https://github.com/ServiceNow/BrowserGym

### Additional Notable Projects

| Project | Stars | What | URL |
|---------|-------|------|-----|
| MinorJerry/WebVoyager | ~1,000 | End-to-end web agent + benchmark (643 tasks, 15 sites) | https://github.com/MinorJerry/WebVoyager |
| OSU-NLP-Group/Mind2Web | ~950 | First large-scale generalist web agent dataset (2,350 tasks) | https://github.com/OSU-NLP-Group/Mind2Web |
| aws/nova-act | ~890 | Amazon's browser agent SDK with `act()` and `act_get()` | https://github.com/aws/nova-act |
| OSU-NLP-Group/SeeAct | ~825 | Generalist web agent with Set-of-Mark grounding. ICML 2024 | https://github.com/OSU-NLP-Group/SeeAct |
| hyperbrowserai/HyperAgent | ~807 | AI-native Playwright extension. Y Combinator backed | https://github.com/hyperbrowserai/HyperAgent |
| sentient-engineering/agent-q | ~503 | MCTS + DPO for autonomous agents. Boosted Llama-3 70B from 18.6% to 95.4% | https://github.com/sentient-engineering/agent-q |
| McGill-NLP/weblinx | ~160 | Conversational web navigation benchmark (100K+ interactions) | https://github.com/McGill-NLP/weblinx |
| magnitudedev/browser-agent | - | Pure-vision browser agent. 94% WebVoyager (SOTA mid-2025) | https://github.com/magnitudedev/browser-agent |

---

## 3. Research Papers & Benchmarks

### WebArena
- **Paper:** "WebArena: A Realistic Web Environment for Building Autonomous Agents" (arXiv: 2307.13854)
- **Venue:** ICLR 2024
- **Size:** 812 tasks from 241 templates across 4 domains (e-commerce, forums, GitLab, CMS)
- **Environment:** Self-hosted real websites (not simulated)
- **Human performance:** 78.24%
- **Initial GPT-4 baseline (2023):** 14.41%
- **Current SOTA:** ~60% (improving rapidly)
- **URL:** https://webarena.dev/

### VisualWebArena
- **Paper:** arXiv: 2401.13649 | **Venue:** ACL 2024
- **Size:** 910 tasks requiring visual understanding
- **Best agent (GPT-4V + SoM):** 16.4% | **Human:** 88.7%
- **Key contribution:** First benchmark requiring genuine visual understanding for web tasks
- **URL:** https://github.com/web-arena-x/visualwebarena

### Mind2Web
- **Paper:** arXiv: 2306.06070 | **Venue:** NeurIPS 2023 (Spotlight)
- **Size:** 2,350 tasks, 137 websites, 31 domains
- **Key contribution:** First large-scale dataset for generalist web agents on real websites
- **Innovation:** Two-stage filtering (small LM ranks elements, then LLM processes top-k)
- **Extensions:** Mind2Web-2 (130 long-horizon tasks), Online-Mind2Web (300 live tasks)

### WebVoyager
- **Paper:** arXiv: 2401.13919 | **Venue:** ACL 2024
- **Size:** 643 tasks across 15 high-traffic websites
- **Most-competed benchmark.** Current SOTA: Magnitude 94%, Browser-Use 89%, Operator 83.5%, Project Mariner 83.5%

### OSWorld
- **Paper:** arXiv: 2404.07972 | **Venue:** NeurIPS 2024
- **Size:** 369 tasks across Ubuntu, Windows, macOS (full desktop, not just browser)
- **Human performance:** 72.36% | **Best model:** 12.24%
- **URL:** https://github.com/xlang-ai/OSWorld

### WorkArena
- **Paper:** arXiv: 2403.07718 | **Venue:** ICML 2024
- **Size:** 33 tasks, 19,912 instances on ServiceNow platform
- **WorkArena++:** 682 compositional tasks (NeurIPS 2024)

### WebLINX
- **Paper:** arXiv: 2402.05930 | **Venue:** ICML 2024
- **Size:** 100K interactions, 2,300 demonstrations, 150+ websites
- **Key finding:** Smaller finetuned decoders surpass zero-shot GPT-4V

### AssistantBench
- **Paper:** arXiv: 2407.15711 | **Venue:** EMNLP 2024
- **Size:** 214 tasks, 258 websites
- **Best model accuracy:** <26 points
- **Introduced:** SeePlanAct (SPA) -- planning + memory buffer on top of SeeAct

### MiniWoB++
- **Size:** 100+ synthetic web interaction environments
- **Role:** Foundational benchmark. Simpler tasks. Follows Gymnasium API.
- **URL:** https://github.com/Farama-Foundation/miniwob-plusplus

### BrowserGym (Meta-Framework)
- **By:** ServiceNow Research
- **Unifies:** MiniWoB, WebArena, VisualWebArena, WorkArena, AssistantBench, WebLINX
- **Companion:** AgentLab (https://github.com/ServiceNow/AgentLab)

### Key Academic Papers

| Paper | Year/Venue | Key Contribution |
|-------|-----------|-----------------|
| Set-of-Mark Prompting (arXiv: 2310.11441) | 2023 / Microsoft Research | Visual grounding from 25.7% to 86.4% by overlaying numbered marks on images |
| Agent-E (arXiv: 2407.13032) | 2024 | DOM distillation + skill-based architecture for multi-agent browser automation |
| CogAgent (CVPR 2024) | 2024 | 18B VLM for GUI agents, 1120x1120 screenshot input, SOTA on GUI grounding |
| D2Snap (arXiv: 2508.04412) | 2025 | DOM downsampling. Hierarchy is the strongest UI feature |
| Prune4Web (arXiv: 2511.21398) | 2025 | LLMs write Python scripts to filter/rank DOM elements. 25x-50x fewer candidates |
| Agentic Plan Caching (arXiv: 2506.14852) | NeurIPS 2025 | Cache execution plans. 46.62% cost reduction, 96.61% performance maintained |
| Building Browser Agents Survey (arXiv: 2511.19477) | 2025 | Comprehensive survey of the field |

---

## 4. Page Representation Strategies

### 4.1 Accessibility Tree (Structured Text)

The most token-efficient approach. No vision model needed.

**Playwright's approach (`page.accessibility.snapshot()`):**
- Calls browser's built-in accessibility API via CDP `Accessibility.getFullAXTree`
- Returns JSON tree with role, name, value, description, state
- playwright-mcp serializes to YAML-like indented text with element refs (`@e1`, `@e2`)
- Token cost: ~200-400 tokens for a typical page (vs ~3,000-5,000 for full DOM)

**Vercel agent-browser:**
- Rust CLI + Node.js daemon with Playwright
- `snapshot` command returns compact AXTree with unique refs
- Sub-100ms latency due to daemon persistence
- 93% context window savings vs raw DOM

**claude-firefox (this project):**
- Custom `buildAccessibilityTree()` walks DOM directly in content script
- Computes roles via `getRole()`, names via `getAccessibleName()`
- Enrichments: bounding boxes `@{x,y,w,h}`, tag annotations, color, font size, editor detection, icon labels, href
- Stable refs via WeakMap, live mirror via MutationObserver
- Region markers for landmarks

**Token cost comparison** (DEV Community analysis):
- Full untruncated AXTree: format choices alone can reduce tokens by 51-79%
- playwright-mcp default can burn 114K+ tokens per test without optimization
- File output option (save snapshot to disk) eliminates context window cost entirely

### 4.2 Set-of-Marks (SoM)

**Paper:** "Set-of-Mark Prompting Unleashes Extraordinary Visual Grounding in GPT-4V" (arXiv: 2310.11441, Microsoft Research)

**How it works:** Uses segmentation models (SEEM/SAM) to partition screenshots into regions, overlays alphanumeric marks on each region. Vision-language model references marks by ID.

**Performance:** On RefCOCOg, improved GPT-4V from 25.7% to 86.4% accuracy.

**Projects using SoM:** VisualWebArena, SeeAct (tested but not primary), BrowserGym (optional)

**Limitation for web agents:** Designed for general images, not web pages. Web pages have dense, small interactive elements that segmentation models handle poorly. SeeAct found ~25% performance gap vs oracle grounding.

### 4.3 Screenshot-Based (Pure Vision)

| Project | Approach |
|---------|----------|
| OpenAI CUA (Operator) | Screenshot-only. Pixel coordinates. RL-trained reasoning |
| Anthropic Computer Use | Screenshot-only. Claude counts pixels from screen edges |
| CogAgent | Dual encoder, 1120x1120 input. Returns coordinates from screenshots |
| Magnitude | Pure vision. 94% WebVoyager SOTA. Last 20 turns context limit |
| Skyvern | Vision-first LLM analysis of screenshots |

### 4.4 Hybrid (Screenshots + DOM/AXTree)

| Project | Approach |
|---------|----------|
| browser-use | Primarily DOM-based, screenshots when visual context needed. Each screenshot adds ~0.8s |
| SeeAct | GPT-4V for planning via screenshots, grounds actions via HTML structure |
| UI-TARS-desktop | Screenshots + optional DOM element detection |
| Agent-E | DOM distillation to JSON + optional screenshots |
| OpenHands | Configurable via BrowserGym (HTML, AXTree, screenshots) |

### 4.5 Tagged Visual (Overlays on Screenshots)

| Project | Approach |
|---------|----------|
| SeeAct | Set-of-Mark visual markers for element identification |
| Tarsier | Bracketed IDs: `[23]` general, `[#ID]` inputs, `[@ID]` links, `[$ID]` buttons |

### 4.6 DOM Pruning/Filtering Techniques

**D2Snap (DOM Downsampling)** -- arXiv: 2508.04412
- Downsamples DOM based on UI features with configurable parameters
- Merges container elements (section, div)
- Key finding: **hierarchy is the strongest UI feature** -- flattening the DOM performs worse

**Prune4Web (DOM Tree Pruning Programming)** -- arXiv: 2511.21398
- LLMs output Python scoring scripts that programmatically filter/rank DOM elements
- 25x-50x fewer candidate elements
- Grounding accuracy jumps from 46.80% to 88.28%

**Agent-E's DOM Distillation**
- Three representation modes per sub-task: `text_only`, `input_fields`, `all_fields`
- Converts to JSON snapshot, not raw HTML

**Mind2Web's Two-Stage Filtering**
- Pass 1: Small LM (DeBERTa) ranks/filters HTML elements
- Pass 2: LLM processes only top-k relevant elements
- First dataset to demonstrate that raw HTML is too large but small LM filter makes it tractable

**Common simplification techniques:**
1. Attribute stripping (remove `style`, `class`, `data-*`)
2. Invisible element removal (`display:none`, `visibility:hidden`, zero-dimension)
3. Container merging (collapse nested `<div>`/`<span>` wrappers)
4. Text truncation (limit text content per element)
5. Selective extraction (only interactive elements, headings, landmarks)
6. Markdown conversion (for text extraction tasks)

---

## 5. Action Grounding Techniques

### 5.1 Grounding Approaches Compared

| Approach | Used By | Pros | Cons |
|----------|---------|------|------|
| **Pixel coordinates** | OpenAI CUA, Anthropic CU, CogAgent, Magnitude | Works on any interface; no DOM access needed | Requires vision model; resolution-sensitive; fragile to layout shifts |
| **Element refs** (numbered IDs) | playwright-mcp, browser-use, agent-browser, claude-firefox | Deterministic; fast; survives minor DOM changes | Requires page instrumentation; refs go stale on navigation |
| **CSS selectors** | Traditional Selenium/Cypress | Precise; well-understood | Brittle to redesigns; verbose |
| **XPath** | Legacy tools | Can target any node | Extremely brittle; long paths; LLMs generate poorly |
| **ARIA role + name** | Stagehand | Semantic; stable across redesigns | Not all elements have good ARIA markup |
| **Natural language** | Skyvern, SeeClick | Most flexible; no DOM needed | Ambiguous; requires visual/semantic matching |

### 5.2 LLM Output to Browser Action

**Structured JSON output** (most modern agents):
```json
{"action": "click", "element_ref": 42}
{"action": "type", "element_ref": 15, "text": "hello"}
```

**Agent-E's hierarchical architecture:**
1. Planner agent breaks task into sub-tasks (natural language)
2. Browser Navigation agent maps each sub-task to concrete actions via DOM distillation
3. Sub-task delegation prevents context loss over long horizons

**SeeAct's three grounding strategies:**
1. Element Attributes -- LLM outputs description, system matches to DOM
2. Textual Choices -- present numbered candidates, LLM selects number
3. Image Annotation -- SoM marks on screenshot, LLM references mark IDs

### 5.3 Action Reliability

| Project | Approach |
|---------|----------|
| OpenAI CUA | Built-in backtracking via RL. Re-evaluates and tries alternative paths |
| browser-use | Change observation after each action. Compares DOM state before/after |
| Agent-E | Explicit "change observation" -- checks if page state changed as expected |
| Stagehand | `observe()` previews actions before execution; cached for reuse |
| claude-firefox | `click_and_wait` races CS response against `tabs.onUpdated`. `wait_for` retries on CS errors. Stale ref detection via `document.contains(el)` |

---

## 6. Browser Control Layer: CDP vs Playwright vs WebExtension

### 6.1 Chrome DevTools Protocol (CDP)

**What it gives you:**
- Full DOM access and manipulation (`DOM`, `DOMSnapshot` domains)
- JS execution in any context (`Runtime.evaluate`)
- Network interception and monitoring (`Network`, `Fetch` domains)
- Screenshots and screencasting (`Page.captureScreenshot`)
- **isTrusted input events** (`Input.dispatchMouseEvent`, `Input.dispatchKeyEvent`)
- Accessibility tree (`Accessibility.getFullAXTree`)
- Performance profiling, memory snapshots, CSS coverage
- Service worker and cache manipulation

**Performance:** Direct WebSocket connection. No intermediate layers. Lowest possible latency.

**Who uses it:** browser-use (migrated from Playwright, 5x faster element extraction), Stagehand v3, cdp-use, Puppeteer, chromedp

**Limitations:** Chrome/Chromium only (Firefox dropped CDP for WebDriver BiDi). Low-level (you rebuild waiting, visibility checks yourself). Protocol changes between Chrome versions.

### 6.2 Playwright

**What it gives you:**
- Cross-browser (Chromium, Firefox, WebKit) via unified API
- Auto-waiting for elements, navigation
- Network interception
- `page.accessibility.snapshot()` for AXTree
- Screenshot/PDF generation
- Persistent contexts, browser profiles
- CDP session passthrough for Chromium

**Performance overhead:** Node.js server process proxies commands. Puppeteer exchanges 11KB of WebSocket messages vs Playwright's 326KB for identical tasks. **15-20% slower than raw CDP on Chromium.** Firefox/WebKit uses JS injection (not native protocol) -- even slower.

**Who uses it:** playwright-mcp, WebArena, VisualWebArena, most academic benchmarks, agent-browser

### 6.3 WebExtension APIs

**What it gives you:**
- Content script injection into any page (including before load)
- Full DOM access from content scripts (same rendering context)
- Privileged background APIs (tabs, bookmarks, history, cookies)
- Tab containerization (Firefox)
- Native messaging for host process communication
- **Works on user's actual browser profile** (cookies, logins, installed extensions)

**What it does NOT give you:**
- No `isTrusted: true` input events (synthetic events always `isTrusted: false`)
- No CDP-level performance profiling
- CSP restrictions on `eval()` in some pages
- Background script throttling (Firefox: `setTimeout` throttled to ~1s in inactive tabs)
- Cannot easily access `chrome.debugger` in Manifest V3

**Performance:** Content script runs in page's rendering process -- zero network hops for DOM access. But message passing between content script and background script adds latency.

**Who uses it:** claude-firefox, mcp-chrome, BrowserMCP, browser-tools-mcp, MCPMonkey

### 6.4 WebDriver BiDi (Emerging Standard)

- W3C Working Draft: https://www.w3.org/TR/webdriver-bidi/
- Bidirectional WebSocket protocol (browser can push events)
- Designed to combine best of WebDriver Classic + CDP
- **Current adoption:** Cypress 14.1+ uses BiDi for Firefox. Selenium 4+ supports it. Puppeteer adopted it.
- **Status:** Not yet feature-complete enough for demanding AI automation

### 6.5 Comparison Matrix

| Feature | CDP | Playwright | WebExtension |
|---------|-----|-----------|-------------|
| isTrusted events | Yes | Yes (via CDP) | No |
| Cross-browser | Chrome only | Chromium/Firefox/WebKit | Per-browser |
| User's profile | Via flags | Via persistent context | Native |
| DOM access speed | Fast (WebSocket) | Fast (proxied) | Fastest (same process) |
| Network interception | Yes | Yes | Yes (webRequest) |
| AXTree | Yes | Yes (via CDP) | Custom build |
| Screenshots | Yes | Yes | Limited |
| Shadow DOM | Yes | Partial | Yes (open) |
| Bot detection | Detectable | Detectable | Undetectable |
| Setup complexity | Medium | Low | High |

---

## 7. Speed Optimization Techniques

### 7.1 Reducing LLM Calls (the biggest bottleneck)

**Agentic Plan Caching** (arXiv: 2506.14852, NeurIPS 2025):
- Cache execution plans from completed workflows
- Match new requests to cached plans via keyword extraction + semantic similarity
- Adapt cached plans with lightweight model instead of expensive planning
- **Result: 46.62% cost reduction, 96.61% performance maintained**

**Speculative Multi-Action Batching** (Microsoft UFO3):
- Predict multiple actions at once instead of one per LLM call
- **Result: 51% fewer LLM calls**

**Stagehand's observe/cache pattern:**
- Preview actions before executing, cache for reuse
- Higher-level agents re-use cached action plans

**browser-use's extract tool:**
- When page has 20,000+ tokens, separate lightweight LLM call extracts only relevant info
- Returns targeted answer instead of full page context

### 7.2 Reducing Per-Step Latency

| Technique | Who | Improvement |
|-----------|-----|-------------|
| Raw CDP over Playwright | browser-use | 5x faster element extraction |
| Daemon persistence | agent-browser | Sub-100ms operation latency |
| DOM-first, screenshots optional | browser-use | Each screenshot adds ~0.8s |
| Flash mode (skip eval/thinking) | browser-use | Minimal page load wait (0.1s) |
| Rust CLI parsing | agent-browser | Sub-millisecond parsing |

### 7.3 Caching Strategies

**Prompt caching:**
- browser-use reports ~75% of input tokens served from cache in production
- Cache warming before parallel processing is essential

**Semantic caching** (arXiv: 2411.05276):
- Cache query embeddings to identify semantically similar past queries
- Hit rates: 61.6-68.8%, positive hit rates >97%

**claude-firefox's live mirror:**
- MutationObserver (100ms debounce) triggers proactive `fullRebuild()`
- Returns cached `_mirrorTree` if `_mirrorDirty=false`
- Proactive prebuild on `tabs.onUpdated` "complete"

**Saik0s/mcp-browser-use "Skills":**
- Teach agent a task once, replay 50x faster using discovered API endpoints
- 1-3s vs 60-120s for full browser navigation

### 7.4 Pre-computation and Prediction

- Build accessibility tree in background before agent requests it
- Proactive snapshot on tab load complete (claude-firefox)
- DOM change detection thresholds to avoid unnecessary rebuilds

### 7.5 Task Completion Speed Benchmarks

| Agent | Benchmark | Avg Task Time | Avg Step Time |
|-------|-----------|---------------|---------------|
| browser-use 1.0 | OnlineMind2Web | 68 seconds | ~3 seconds |
| Magnitude | WebVoyager | N/A | Last 20 turns context |
| agent-browser | General | N/A | Sub-100ms per operation |

---

## 8. Commercial Products

### 8.1 Browserbase
- **URL:** https://www.browserbase.com/
- **Funding:** $40M Series B (June 2025) at $300M valuation
- **Scale:** 50M sessions in 2025, 1,000+ customers
- **Product:** Cloud-hosted headless browser infrastructure. Stagehand SDK (open-source).
- **Open source:** https://github.com/browserbase/stagehand

### 8.2 OpenAI Operator / CUA
- **URL:** https://openai.com/index/introducing-operator/
- **Architecture:** GPT-4o vision + RL-trained reasoning. Screenshot-based loop.
- **Integration:** Merged into ChatGPT as "agent mode" (July 2025).
- **Performance:** SOTA on WebArena and WebVoyager.
- **API:** CUA model available via Responses API.

### 8.3 Google Project Mariner
- **Powered by:** Gemini 2.0 (2M+ token context window)
- **Architecture:** Originally Chrome extension, now cloud VMs. 10 concurrent tasks.
- **Performance:** 83.5% WebVoyager.
- **Price:** $249.99/month (Google AI Ultra subscribers).
- **Planned:** Mariner Studio Q2 2026.

### 8.4 Anthropic Computer Use
- **Architecture:** Claude screenshot analysis + pixel coordinate counting.
- **Available via:** Anthropic API, Amazon Bedrock, Google Vertex AI.
- **Status:** Public beta since October 2024.

### 8.5 Amazon Nova Act
- **URL:** https://github.com/aws/nova-act
- **Architecture:** Chromium/Chrome via Playwright. Python SDK.
- **Features:** Human-in-the-loop workflow, multi-session parallel execution, MCP integration.
- **Status:** GA in us-east-1 since re:Invent 2025.

### 8.6 MultiOn
- **Architecture:** Proprietary cloud browser with native proxy and bot protection.
- **Scale:** Millions of concurrent agents. LangChain and LlamaIndex integrations.
- **Focus:** Multi-step workflows at scale.

### 8.7 Skyvern
- **URL:** https://www.skyvern.com/
- **Backed by:** Y Combinator
- **Approach:** Vision-first. No selectors needed. One workflow survives redesigns.

### 8.8 Fellou
- **URL:** https://fellou.ai
- **Users:** 1,000,000+ since April 2025
- **Engine:** Eko 2.0 framework (80% on Online-Mind2Web vs 43% for competitors)
- **Innovation:** Agentic Memory learns from user behavior. 3D spatial workspace (Fellou CE).

### 8.9 Induced.ai
- **URL:** https://induced.ai
- **Approach:** NL instructions to pseudocode. No programming. Anti-bot, session memory.

### 8.10 Other Notable Products

| Product | Focus |
|---------|-------|
| Perplexity Comet (July 2025) | Search-focused AI browser |
| OpenAI Atlas (October 2025) | Dedicated browser with Agent Mode |
| Bright Data | Enterprise proxy + browser infra for AI agents |
| Steel | Remote browser infrastructure. Curates awesome-web-agents |
| Lightpanda | High-performance headless browser built for AI |
| Anchor Browser | AI agent browser infrastructure |
| Hyperbrowser | Cloud browser infrastructure |

---

## 9. Architectural Patterns & Takeaways

### 9.1 The Field Has Converged on Key Patterns

**Page representation is the critical differentiator:**

1. **Vision-first** (screenshots to LLM) -- Resistant to layout changes but expensive and slow
2. **AXTree-first** (structured text) -- Efficient and deterministic but misses visual context
3. **Hybrid** (both) -- Best of both worlds but more complex
4. **Tagged visual** (overlays on screenshots) -- Bridge between vision and structured

**Action grounding:**
- Element references (numbered IDs from AXTree) for text agents
- Pixel coordinates for vision agents
- CSS/XPath are considered legacy/fragile

**Agent architecture:**
- Two-tier (planner + executor) dominates
- Planner uses expensive models; executor uses cheaper/faster models or cached plans

### 9.2 Speed Hierarchy

From fastest to slowest per-action:
1. Cached API replay (Saik0s skills) -- 1-3s vs 60-120s
2. Raw CDP + DOM-first -- sub-100ms operations
3. Playwright + AXTree -- ~200ms per operation
4. Screenshot + vision LLM -- adds ~0.8s per step
5. Full page analysis each step -- 3-5s

### 9.3 What Makes claude-firefox Unique

Compared to the landscape, claude-firefox has several distinctive properties:

| Feature | claude-firefox | Most Others |
|---------|---------------|-------------|
| Browser | Firefox (real profile) | Chrome/Chromium (separate instance) |
| Architecture | WebExtension + Native Messaging + Unix Socket + MCP | Playwright/CDP/Cloud |
| Bot detection | Undetectable (real extension) | Detectable (automation flags) |
| User sessions | Uses user's actual cookies/logins | Requires explicit auth setup |
| Page representation | Custom enriched AXTree with bounding boxes, colors, fonts, editor detection | Standard AXTree or screenshots |
| DOM updates | Live MutationObserver mirror with proactive rebuild | On-demand snapshot |
| Stable refs | WeakMap-based, survives DOM mutations | Re-assigned each snapshot |
| isTrusted events | No (synthetic) | Yes (CDP/Playwright) |
| Shadow DOM | Not pierced | Partial support |

### 9.4 Opportunities for Improvement

Based on this research, potential improvements for claude-firefox:

1. **Speed:** Proactive plan caching (46% cost reduction per research). "Skills" system for repeated tasks.
2. **Hybrid page representation:** Add optional screenshot capability for visual-heavy pages.
3. **DOM pruning:** Implement D2Snap-style hierarchy-preserving downsampling for large pages.
4. **isTrusted events:** Explore `browser.debugger` API or WebDriver BiDi for trusted input dispatch.
5. **Shadow DOM traversal:** Pierce open shadow roots in the tree walker.
6. **Stagehand-style `observe()`:** Preview available actions before executing, cache for reuse.
7. **Two-tier architecture:** Separate planning from execution to reduce per-step LLM cost.
8. **Change verification:** Explicit before/after DOM comparison after each action (browser-use pattern).
9. **Context management:** Limit conversation context to last N turns (Magnitude pattern) for speed.
10. **CDP bridge:** Consider optional CDP connection via `browser.debugger` for isTrusted events and richer capabilities.

---

## 10. The Skills Pattern (mcp-browser-use Deep Dive)

### How It Works: Learn Once, Replay 50x Faster

The core insight: **most browser tasks end up hitting a JSON API under the hood.** When you search NPM, your browser sends `fetch()` to `/search?q=react` and gets JSON. The Skills system records that API call during the first run, then replays it directly -- skipping the entire browser navigation loop.

**Repo:** [Saik0s/mcp-browser-use](https://github.com/Saik0s/mcp-browser-use) (902 stars, MIT)

### 10.1 The Learn Phase (slow, one-time)

1. **Prompt injection:** When `learn=True`, appends instructions telling the agent to watch network requests, not DOM scraping.

2. **CDP network recording:** A `SkillRecorder` hooks into Chrome's CDP events (`Network.requestWillBeSent`, `Network.responseReceived`) and captures every XHR/Fetch request with headers, POST data, and response bodies (truncated to 128KB). Sensitive headers are redacted.

3. **Agent runs normally** while the recorder silently captures all traffic.

4. **LLM analysis:** After the task, a `SkillAnalyzer` feeds all captured API calls to an LLM and asks: "Which is the money request?" The LLM identifies the endpoint, parameterizes the URL (`{search_term}`), and specifies a JMESPath expression for data extraction.

5. **Saved as YAML** to `~/.config/browser-skills/`:
```yaml
name: npm-search
request:
  url: https://www.npmjs.com/search?q={search_term}
  method: GET
  response_type: json
  extract_path: objects[*].package
parameters:
  - name: search_term
    type: string
    required: true
auth_recovery:
  trigger_on_status: [401, 403]
  recovery_page: https://www.npmjs.com/login
  max_retries: 1
```

### 10.2 The Replay Phase (fast)

1. **Load skill** by exact name, substitute parameters into URL template.
2. **SSRF validation** -- checks URL isn't targeting localhost/private IPs.
3. **Navigate to domain** via CDP `Page.navigate` (establishes cookie context).
4. **Execute `fetch()` inside the browser page** via CDP `Runtime.evaluate`:
```javascript
response = await fetch("https://www.npmjs.com/search?q=react", {
  credentials: "include"  // sends browser's cookies automatically
});
```
5. **Parse response** with JMESPath, return data.

**The key trick:** The `fetch()` runs inside the browser's page context, not from Python. Cookies are automatically included, no CORS issues, auth state preserved. Looks like a normal browser request.

**Result:** 1-3 seconds vs 60-120 seconds (20x-120x speedup).

### 10.3 Fallback Chain

If direct fetch fails (401/403, API changed), falls back to full agent execution but injects "hints" from the skill (navigation URLs, endpoint info) to guide it faster.

### 10.4 Limitations

- Only works for sites with discoverable JSON APIs (server-rendered = no useful XHR)
- Skills are domain-specific (NPM skill won't work on PyPI)
- Skills match by **exact name** only, no fuzzy/semantic matching
- Cookie-dependent -- if user logs out, skills break
- Beta feature, disabled by default
- 2-3 LLM calls per `memory.add()` in learn phase

### 10.5 Deep Research Feature

`run_deep_research` implements a 3-phase pipeline:
1. **Planning:** LLM generates N search queries covering different angles
2. **Searching:** For each query, spawns a new `browser-use.Agent` (max 15 steps) to search, navigate, extract
3. **Synthesis:** LLM combines all findings into structured markdown report

---

## 11. WebArena Benchmark: The Target

### 11.1 What It Is

812 tasks across 5 self-hosted web applications (e-commerce, Reddit clone, GitLab, Wikipedia, OpenStreetMap) running in Docker. Tasks are natural language instructions requiring multi-step browser interaction.

**Task examples:**
- "How much did I spend in March 2023 on shopping at One Stop Market?" (navigate, find orders, calculate)
- "Create a repo named nolan_honest_fans with movies directed by Christopher Nolan in a README file" (GitLab multi-step)
- "Show me the path and travel time from home of the 1980 Super Bowl champions to home of the 1991 Super Bowl champions" (cross-site: Wikipedia + Maps)

**Evaluation:** Deterministic, automated. String matching + backend state verification. No LLM judge.

**WebArena Verified** (by ServiceNow): Cleaned version fixing evaluation bugs. "Hard" subset = 258 tasks (68% less runtime, same discriminative power).

### 11.2 Current Leaderboard (Feb 2026)

| Rank | Agent | Model | Score |
|------|-------|-------|-------|
| 1 | **Meka** | o3/Sonnet 4/Opus 4 (vision) | **72.7%** |
| 2 | **OpAgent** | Gemini-3-Pro + Qwen2.5VL-72B | **71.6%** |
| 3 | **ColorBrowserAgent** | GPT-5 | **71.2%** |
| 4 | GBOX AI | Claude Code | 68.0% |
| 5 | DeepSky Agent | Claude Sonnet 3.5 | 66.9% |
| 6 | Narada AI | -- | 64.2% |
| 7 | IBM CUGA | -- | 61.7% |
| 8 | OpenAI Operator | CUA | 58.1% |
| 9 | AWA 1.5 (Jace.AI) | Fine-tuned open-source | 57.1% |
| 10 | ScribeAgent | Qwen2.5-32B + GPT-4o | 53.0% |
| -- | **Human** | -- | **78.2%** |
| -- | GPT-4 (2023 baseline) | -- | 14.4% |

**Leaderboard:** [WebArena Leaderboard (Google Sheets)](https://docs.google.com/spreadsheets/d/1M801lEpBbKSNwP-vDBkC_pF7LdyGU1f_ufZb_NWNBZQ/edit)

### 11.3 What Score You Need

| Score | Impact |
|-------|--------|
| 55-60% | Competitive with OpenAI Operator |
| 65% | Top 5. People notice |
| >72.7% | **New SOTA. Headline news** |
| >78% | Superhuman |

### 11.4 WebVoyager Leaderboard (for comparison)

Live-web benchmark, 643 tasks across 15 real websites. GPT-4V judge evaluation.

| Agent | Score |
|-------|-------|
| Magnitude | 93.9% |
| Surfer-H | 92.2% |
| Browser Use | 89.1% |
| OpenAI Operator | 87.0% |
| Skyvern 2.0 | 85.9% |
| Google Mariner | 83.5% |

**Leaderboard:** [leaderboard.steel.dev](https://leaderboard.steel.dev/)

### 11.5 The Firefox Angle

Every agent on the WebArena leaderboard uses Chromium. Being the **first Firefox-based agent** to post a competitive score would itself be noteworthy. You don't need #1 -- 60%+ on Firefox would be a first.

WebArena's task definitions and evaluators are separate from the browser automation layer. You can drive the browser through your MCP tools instead of Playwright and run the same evaluators.

### 11.6 How to Run It

```bash
# WebArena Verified (cleaned version)
pip install webarena-verified

# Start Docker environments
webarena-verified env start --site shopping
webarena-verified env start --site shopping_admin
webarena-verified env start --site reddit
webarena-verified env start --site gitlab
webarena-verified env start --site wikipedia
webarena-verified env start --site map

# Or use AWS AMI (pre-built, us-east-2)
# Instance: t3a.xlarge, 1000GB EBS

# Cost per full run: $200-600 (mostly LLM API)
# Hard subset (258 tasks): $70-150
```

---

## 12. How the Top WebArena Agents Work

### 12.1 Meka (72.7%) -- #1

**GitHub:** [trymeka/agent](https://github.com/trymeka/agent)

**Architecture:** Single-agent loop with **Mixture-of-Agents (MoA)** -- two "Ground" models alternate turns. Model A proposes an action, Model B reviews and builds on it. They correct each other's weaknesses.

**Page representation:** Pure vision (screenshots only). No DOM, no AXTree. The agent sees the screen like a human. This lets it handle system-level UI (dropdown menus, browser alerts, file upload dialogs) that are invisible to Playwright/CDP.

**LLMs:** OpenAI o3 + Claude Sonnet 4/Opus 4 (alternating) + Gemini 2.5 Flash (evaluator).

**Memory:** Dual -- 7-step short-term lookback + CRUD long-term memory for persistent recall.

**Key techniques:**
1. MoA alternation (two models refining each other)
2. Vision-first (handles OS-level UI invisible to AXTree)
3. Reflexion-style evaluator for self-correction
4. OS-level control via Anchor Browser VMs
5. Zero fine-tuning -- pure prompting

### 12.2 OpAgent (71.6%) -- #2

**Paper:** [arXiv 2602.13559](https://arxiv.org/abs/2602.13559) | **GitHub:** [codefuse-ai/OpAgent](https://github.com/codefuse-ai/OpAgent)

**Architecture:** Four-agent pipeline in a loop:
1. **Reflector** (Gemini 3-Pro) -- analyzes previous action result, extracts goal-relevant notes, detects blockers
2. **Planner** (Gemini 3-Pro) -- generates high-level instructions with domain-specific tips
3. **Grounder** (Qwen 2.5-VL-72B, custom fine-tuned) -- translates intent to precise (x,y) coordinates on screenshots
4. **Summarizer** (Gemini 3-Pro) -- holistic task completion assessment

**Page representation:** Vision-centric. Screenshots as primary input. **Critical: text-only history** -- only the current screenshot is provided. All prior reasoning is text. This specifically prevents VLM hallucination from multi-image sequences.

**Training:** The Grounder model has a two-stage post-training:
- Stage 1: Multi-task supervised fine-tuning on WebDreamer + Mind2Web + Aguvis + UGround
- Stage 2: Online RL (GRPO) with hybrid reward (format reward + WebJudge outcome + rule-based process verification including SSIM change detection)

**Key insight:** Single model achieves 38.1%. Full framework achieves 71.6%. **The multi-agent orchestration adds 33.5 points** -- the largest performance multiplier of any technique.

### 12.3 ColorBrowserAgent (71.2%) -- #3

**Paper:** [arXiv 2601.07262](https://arxiv.org/abs/2601.07262)

**Architecture:** Two-loop system:
- **Online loop:** Observation -> AKB Retrieval -> Summarizer -> Operator -> Action
- **Offline loop:** Adaptor monitors failures, human experts distill tips into Adaptive Knowledge Base (AKB)

**Page representation:** Full multimodal -- Screenshots with Set-of-Marks + AXTree + DOM structure.

**LLM:** GPT-5 for all components. Zero fine-tuning.

**The AKB (Adaptive Knowledge Base):** 52 hand-crafted domain-specific rules across 5 environments (GitLab: 13, Map: 7, Reddit: 5, Shopping: 9, Admin: 18). Took <1 person-day to write. Retrieved via cascade: URL pattern matching -> keyword search -> visual-semantic embedding.

**Summarizer:** O(1) memory footprint via hierarchical retention -- fine-grained details for active subgoals, collapsed summaries for completed history.

**Ablation results (on WebArena-Lite, 165 tasks):**
| Component removed | Score drop |
|------------------|-----------|
| AKB/Adaptor | **-7.2 points** |
| Summarizer | -3.8 points |

**The AKB contributes more than the Summarizer.** Domain-specific knowledge is more limiting than context management.

**Per-domain breakdown:**
| Domain | Score | vs Prior SOTA |
|--------|-------|---------------|
| Shopping | 72.9% | +25.0% |
| Admin | 76.4% | +22.0% |
| Multisite | 64.8% | +83.1% |
| Map | 55.9% | -14.2% |

### 12.4 DeepSky Agent (66.9%) -- #5

**Blog:** [deepskyai.substack.com](https://deepskyai.substack.com/p/building-a-practical-browser-agent)

**Architecture:** Two-tier:
- **Inner loop (Browser Agent):** A*-inspired pathfinding via model spec. Explicitly outlines explore/exploit tradeoffs.
- **Outer loop (Planner Agent):** Handles planning, sequencing, reflection, course correction.

**Page representation:** All four modalities simultaneously -- screenshots, DOM, AXTree, peripheral actions. **Each modality covers failure modes of the others:**
- AXTree reveals `<select>` elements invisible in screenshots
- DOM access collapses long scrolling into single actions
- Screenshots catch visual context DOM misses

**LLMs:** Claude Sonnet 3.5 (browser) + proprietary planner.

**Ablation:** Removing any major component drops accuracy by ~6-7 points. Balanced architecture with no single dominant component.

### 12.5 ScribeAgent (53.0%)

**Paper:** [arXiv 2411.15004](https://arxiv.org/abs/2411.15004) | **GitHub:** [colonylabs/ScribeAgent](https://github.com/colonylabs/ScribeAgent)

**Architecture:** Four-stage pipeline:
1. GPT-4o refines vague objectives into step-by-step plans
2. ScribeAgent (fine-tuned Qwen2.5-32B) generates actions
3. GPT-4o maps HTML-based outputs to AXTree format
4. GPT-4o evaluates completion

**Page representation:** Processed HTML-DOM only. No screenshots, no AXTree. Novel **tokenizer-based pruning**: if `len(string) / len(tokenizer(string)) < 2`, the string is nonsensical and removed. Reduces context ~5-7 tokens with <0.2% false positive rate.

**Training data:** **6 billion tokens** from Scribe's production platform -- 250+ domains, 10,000+ subdomains, real user workflows. Average 11 steps per workflow.

**Key insight:** 7B model competitive with 70B+ proprietary models. Specialization beats size.

### 12.6 AWA 1.5 / Jace.AI (57.1%)

**Architecture:** Two-layer -- JACE (chat/planning LLM) + AWA-1 (browser action agent). Fine-tuned with RLAIF on synthetic web interaction data.

**Key innovation:** Multi-action batching -- generates multiple form-fill actions at once instead of one per step.

---

## 13. What Techniques Actually Matter (Ranked by Impact)

Synthesized from ablation studies across all top agents:

### 13.1 Ranked by Score Impact

| Rank | Technique | Impact | Evidence |
|------|-----------|--------|----------|
| 1 | **Multi-agent orchestration** | +33.5 pts | OpAgent: 38.1% single -> 71.6% framework |
| 2 | **Domain-specific knowledge (AKB/tips)** | +7.2 pts | ColorBrowserAgent ablation |
| 3 | **Vision + text hybrid observation** | +6-7 pts each | DeepSky ablation per modality |
| 4 | **Progressive context compression** | +3.8 pts | ColorBrowserAgent Summarizer ablation |
| 5 | **Specialized fine-tuning on real data** | +17.1 pts | ScribeAgent: 34.2% GPT-4o -> 51.3% |
| 6 | **Self-correction / reflection loops** | Present in all top-5 | Meka, OpAgent, DeepSky, ColorBrowserAgent |
| 7 | **A*-inspired pathfinding** | +6-7 pts | DeepSky ablation |
| 8 | **Multi-action batching** | Reduces total steps | AWA 1.5 form filling |

### 13.2 What Does NOT Seem Critical

- **MCTS / tree search:** WebOperator uses it explicitly, scores only 54.6%. Top agents use simpler planning + reflection.
- **Raw model size:** ScribeAgent 7B outperforms GPT-4o. Architecture > parameters.
- **Training on benchmark tasks:** ColorBrowserAgent (71.2%) uses zero fine-tuning. AKB tips are site-specific, not task-specific.

### 13.3 The Standard Model (Convergent Architecture)

All top-5 agents share this structure:
1. **Planner** -- decomposes tasks into subgoals
2. **Grounded executor** -- translates intent to precise actions
3. **Memory/Summarizer** -- manages context (O(1) footprint)
4. **Reflector/Evaluator** -- validates actions, enables self-correction

### 13.4 Remaining Gap to Human (78.2%)

All agents struggle with:
- Map manipulation tasks (drag interactions)
- Long-horizon data aggregation requiring exact counting
- Tasks requiring preference adherence after long context
- Drag-and-drop interactions

### 13.5 Implications for claude-firefox

To compete on WebArena, the highest-impact additions would be:

1. **Multi-agent loop** (biggest impact by far): Add a Planner that decomposes tasks + a Reflector that validates each action result. Even without fine-tuning, this alone could add 20-30 points.

2. **Domain-specific AKB** (7+ points): Write ~50 site-specific tips for the 5 WebArena environments. Takes <1 day. Examples: "On GitLab, commit to main unless specified otherwise", "Shopping admin date format is MM/DD/YYYY".

3. **Screenshot capability** (6-7 points per modality): Add optional screenshots alongside your enriched AXTree. AXTree alone misses visual context that screenshots provide.

4. **Context compression** (3.8 points): Summarize completed subgoals instead of keeping full history. O(1) memory.

5. **Text-only history** (prevents hallucination): Only include the current page snapshot, keep all prior steps as text summaries. This is OpAgent's key finding.

---

## 14. Meka Deep Dive: How #1 Works and How to Beat It

### 14.1 The MoA Is Just Odd/Even Step Alternation

```typescript
// From agent.ts lines 296-309
return step % 2 === 1
  ? { model: groundModelName, provider: ground }        // o3 on odd steps
  : { model: alternateModelName, provider: alternateGround }  // Claude on even steps
```

No intelligent routing, no specialization detection. Step 1 = o3, Step 2 = Claude, Step 3 = o3. Both see the same conversation history. The hypothesis is different models have different visual blind spots.

### 14.2 Pure Screenshots, Zero DOM

Screenshots at 1366x768 of the **entire desktop** (not just browser page) via Anchor Browser cloud VM. The LLM sees only the screenshot and must estimate pixel coordinates. No DOM, no AXTree, no HTML, no element refs.

### 14.3 The Agent Loop

1. Take screenshot of desktop
2. Send screenshot + last 7 steps of history + system prompt to LLM
3. LLM returns tool call: `click(x,y)`, `type(text)`, `scroll`, `keypress`, or `complete_task`
4. Execute action via Anchor Browser REST API (OS-level input)
5. **Wait 2 seconds** (hardcoded: `await new Promise(resolve => setTimeout(resolve, 2000))`)
6. Take new screenshot
7. Repeat until `complete_task` or 100 steps

### 14.4 The Evaluator

Only fires when the agent calls `complete_task`. A cheaper model (Gemini Flash) checks if the claimed completion matches conversation history. If rejected, feedback is injected and agent retries. **After 3 rejections, force-completes anyway.**

### 14.5 Memory

- **Short-term:** Last 7 steps. `CONVERSATION_LOOK_BACK = 7`. Everything before that is permanently dropped. Initial task instruction always prepended.
- **Long-term:** Simple `Map<string, string>`. LLM must decide to call the memory tool. No automatic saving.

### 14.6 Meka's Exploitable Weaknesses

| Weakness | Impact | Our Advantage |
|----------|--------|--------------|
| **Cannot read structured data** -- OCR-ing tables row by row from screenshots | Slow, error-prone data extraction | AXTree extracts entire tables in one pass |
| **Cannot see hidden page state** -- form values, disabled states, unchecked boxes, `<select>` options | Misses critical UI state | AXTree has all form state, values, checked/disabled |
| **2s hardcoded wait per action** -- 50-step task = 100s of dead time | Massive speed penalty | MutationObserver knows when page is ready (~150ms) |
| **7-step memory cliff** -- forgets everything before step N-6 unless manually saved | Data loss on multi-page tasks | Can design progressive compression |
| **No mid-task evaluation** -- evaluator only at completion | Wastes steps going down wrong paths | Per-action domChanged verification |
| **Pixel coordinate guessing** -- LLM estimates where to click | Imprecise on dense UIs | Element refs are exact by definition |
| **Cannot access off-screen content** -- must scroll and visually scan | Slow content discovery | Full DOM access regardless of viewport |
| **o3 at reasoningEffort: "low"** -- sacrifices depth for speed | Weak on complex reasoning | Can use full reasoning models |
| **No DOM event interception** -- can't see AJAX, console errors, network | Blind to non-visual changes | Extension has full network/console access |
| **Single-tab limitation** -- `getPage()` returns one page | Multi-tab tasks harder | Full tab management |

### 14.7 How to Beat Meka

Our structural advantages are model-independent:

| Capability | Meka (screenshot OCR) | claude-firefox (enriched AXTree) |
|-----------|----------------------|--------------------------------|
| Table extraction | Read cell-by-cell from pixels | Single AXTree traversal |
| Form state | Invisible unless visual indicator | Complete (value, disabled, checked) |
| Click precision | LLM estimates coordinates | Exact element ref |
| Page ready detection | 2s hardcoded sleep | MutationObserver (~150ms) |
| Off-screen content | Must scroll | Full DOM instant access |
| Action verification | Only at task completion | Per-action domChanged |
| Hidden elements | Invisible | Full AXTree visibility |

**To exceed 72.7%, combine our observation advantage with their architectural patterns:**
1. Multi-agent loop (Planner + Reflector + Summarizer) -- this is Meka's real source of strength, not MoA
2. Domain-specific tips for WebArena environments
3. Optional screenshots for visual-context tasks (maps, images)
4. Auto-save data to memory after every extraction (don't depend on LLM remembering)
5. Mid-task progress evaluation every N steps

---

## 15. MCP vs Standalone Agent: Key Distinction

### 15.1 None of the Top WebArena Agents Use MCP

Every top agent is a standalone framework with its own agent loop:

| Agent | Architecture | Browser Control |
|-------|-------------|----------------|
| Meka | TypeScript monorepo, Vercel AI SDK | Anchor Browser cloud VM REST API |
| OpAgent | Python multi-agent pipeline | Playwright |
| ColorBrowserAgent | Python, BrowserGym | Playwright |
| ScribeAgent | Python, fine-tuned model | Playwright |
| DeepSky | Proprietary framework | Playwright + CDP |
| GBOX | TypeScript, Claude Code | MCP (only exception, sort of) |

They all manage their own agent loop, call LLMs directly, and control the browser through Playwright or cloud VM APIs. MCP is not involved.

### 15.2 claude-firefox Is Different

claude-firefox is an **MCP server** that exposes browser tools to Claude. Claude (via Claude Code, Claude Desktop, etc.) **is** the agent. The agent loop lives in Claude's runtime, not in your code.

This means the **orchestration layer** (planner, reflector, evaluator) that provides 20-30+ points of improvement would need to come from either:
- Claude's own reasoning (limited to what the MCP client does)
- A wrapper that sits between the user and Claude, managing multi-step tasks

### 15.3 Three Paths to Compete

**Option A: Stay Pure MCP**
- Feed WebArena tasks to Claude via MCP, let Claude use your browser tools
- Agent loop = Claude itself
- Simpler, but limited by Claude's built-in reasoning and context management
- Good for the real goal (faster than human at info retrieval)

**Option B: Build Standalone Agent**
- Write your own agent loop (Planner + Executor + Reflector) that uses your Firefox extension as the browser backend
- Full control over architecture, memory, evaluation
- Best for beating benchmarks

**Option C: Hybrid (Recommended)**
- **MCP for daily use** -- your real goal: faster than a human at retrieval
- **Standalone agent harness for benchmarking** -- wraps your extension with a proper multi-agent loop for WebArena
- Same browser tools, two different orchestration layers
- The benchmark runner validates the tools; the MCP server delivers the value

### 15.4 Why MCP May Actually Be an Advantage

For your real goal (faster information retrieval), MCP has properties the standalone agents don't:

1. **Real user profile** -- logged into everything, cookies, extensions. No auth flows needed.
2. **Interactive** -- user can course-correct mid-task. Standalone agents run blind.
3. **Claude as the agent** -- Opus/Sonnet reasoning is competitive with o3. No need to build your own planning.
4. **Zero infrastructure** -- no cloud VMs, no Playwright instances. Just the user's Firefox.
5. **Composable** -- MCP tools can be combined with other MCP servers (filesystem, databases, APIs).

The top WebArena agents optimize for unattended benchmark execution. Your tool optimizes for **human-in-the-loop speed** -- a different and arguably more valuable problem.

---

## Sources

### GitHub Repositories
- https://github.com/microsoft/playwright-mcp
- https://github.com/ChromeDevTools/chrome-devtools-mcp
- https://github.com/modelcontextprotocol/servers
- https://github.com/hangwin/mcp-chrome
- https://github.com/AgentDeskAI/browser-tools-mcp
- https://github.com/BrowserMCP/mcp
- https://github.com/executeautomation/mcp-playwright
- https://github.com/remorses/playwriter
- https://github.com/browserbase/mcp-server-browserbase
- https://github.com/Saik0s/mcp-browser-use
- https://github.com/kontext-dev/browser-use-mcp-server
- https://github.com/angiejones/mcp-selenium
- https://github.com/eyalzh/browser-control-mcp
- https://github.com/kstrikis/MCPMonkey
- https://github.com/freema/firefox-devtools-mcp
- https://github.com/gruence/firefox-mcp
- https://github.com/browser-use/browser-use
- https://github.com/browser-use/cdp-use
- https://github.com/OpenHands/OpenHands
- https://github.com/bytedance/UI-TARS-desktop
- https://github.com/browserbase/stagehand
- https://github.com/Skyvern-AI/skyvern
- https://github.com/vercel-labs/agent-browser
- https://github.com/anthropics/claude-quickstarts
- https://github.com/microsoft/UFO
- https://github.com/lavague-ai/LaVague
- https://github.com/steel-dev/steel-browser
- https://github.com/google-gemini/computer-use-preview
- https://github.com/reworkd/tarsier
- https://github.com/OpenAdaptAI/OpenAdapt
- https://github.com/openai/openai-cua-sample-app
- https://github.com/EmergenceAI/Agent-E
- https://github.com/THUDM/CogAgent
- https://github.com/ServiceNow/BrowserGym
- https://github.com/web-arena-x/webarena
- https://github.com/web-arena-x/visualwebarena
- https://github.com/OSU-NLP-Group/Mind2Web
- https://github.com/OSU-NLP-Group/SeeAct
- https://github.com/MinorJerry/WebVoyager
- https://github.com/sentient-engineering/agent-q
- https://github.com/McGill-NLP/weblinx
- https://github.com/xlang-ai/OSWorld
- https://github.com/ServiceNow/WorkArena
- https://github.com/aws/nova-act
- https://github.com/hyperbrowserai/HyperAgent
- https://github.com/magnitudedev/browser-agent
- https://github.com/showlab/computer_use_ootb
- https://github.com/Farama-Foundation/miniwob-plusplus
- https://github.com/microsoft/SoM
- https://github.com/steel-dev/awesome-web-agents

### Papers
- arXiv: 2310.11441 (Set-of-Mark)
- arXiv: 2307.13854 (WebArena)
- arXiv: 2306.06070 (Mind2Web)
- arXiv: 2401.13649 (VisualWebArena)
- arXiv: 2401.13919 (WebVoyager)
- arXiv: 2402.05930 (WebLINX)
- arXiv: 2403.07718 (WorkArena)
- arXiv: 2404.07972 (OSWorld)
- arXiv: 2407.13032 (Agent-E)
- arXiv: 2407.15711 (AssistantBench)
- arXiv: 2401.01614 (SeeAct)
- arXiv: 2508.04412 (D2Snap)
- arXiv: 2511.21398 (Prune4Web)
- arXiv: 2506.14852 (Agentic Plan Caching)
- arXiv: 2411.05276 (Semantic Caching)
- arXiv: 2511.19477 (Building Browser Agents Survey)
- arXiv: 2602.13559 (OpAgent)
- arXiv: 2601.07262 (ColorBrowserAgent)
- arXiv: 2411.15004 (ScribeAgent)
- arXiv: 2504.19413 (mem0 Research)
- CogAgent (CVPR 2024)

### Top Agent Resources
- https://github.com/trymeka/agent (Meka)
- https://github.com/codefuse-ai/OpAgent (OpAgent)
- https://github.com/colonylabs/ScribeAgent (ScribeAgent)
- https://github.com/babelcloud/gbox (GBOX)
- https://blog.withmeka.com (Meka blog)
- https://deepskyai.substack.com (DeepSky blog)
- https://narada.ai/blog (Narada blog)
- https://jace.ai/blog/awa-1-5 (AWA 1.5 blog)
- https://leaderboard.steel.dev (WebVoyager leaderboard)
- https://docs.google.com/spreadsheets/d/1M801lEpBbKSNwP-vDBkC_pF7LdyGU1f_ufZb_NWNBZQ (WebArena leaderboard)

### Memory Systems
- https://github.com/mem0ai/mem0
- https://mem0.ai/research
- https://github.com/Saik0s/mcp-browser-use
