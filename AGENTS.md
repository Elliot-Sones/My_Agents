# Repository Guidelines

## Project Structure & Module Organization
This repository is a small monorepo of MCP servers:
- `claude-firefox/`: Firefox automation server (TypeScript source in `src/`, extension code in `extension/`, Node tests in `test/`).
- `research-agent/`: Multi-source research server (TypeScript source in `src/`, Node tests in `test/`).
- `assets/`: shared docs/media assets (for example `assets/banner.svg`).

Build output is written to each package’s `build/` directory and should not be committed.

## Build, Test, and Development Commands
Run commands from the package you are changing.

- `cd claude-firefox && npm install && npm run build`: install deps and compile to `build/`.
- `cd claude-firefox && npm run dev`: TypeScript watch mode.
- `cd claude-firefox && npm run start`: run the MCP server from `build/index.js`.
- `cd claude-firefox && ./benchmark.sh`: run end-to-end Firefox benchmark.
- `cd research-agent && npm install && npm run build`: install deps and compile.
- `cd research-agent && npm run dev`: watch mode for local development.
- `cd research-agent && npm test`: run evaluator, memory, and session tests.

## Coding Style & Naming Conventions
- Language: TypeScript (ES modules, `strict` mode enabled in both `tsconfig.json` files).
- Indentation: 2 spaces; keep imports grouped and use explicit `.js` import extensions in TS files.
- Naming: `camelCase` for variables/functions, `PascalCase` for classes/types, `SCREAMING_SNAKE_CASE` for constants.
- File patterns: source modules use kebab-case (for example `rate-limiter.ts`); tests use `test/test-*.js`.

## Testing Guidelines
- Primary test command: `cd research-agent && npm test`.
- For `claude-firefox`, run targeted scripts in `test/` (for example `node test/test-memory.js`) and benchmark flows when behavior affects browser interaction.
- Add or update tests whenever tool behavior, memory/session logic, or API integrations change.

## Commit & Pull Request Guidelines
Current history uses short, imperative commit subjects (for example `Add research-agent MCP server`). Follow that style:
- Keep subject lines concise and action-oriented.
- Scope commits to one logical change.
- In PRs, include: purpose, affected package(s), test/benchmark evidence, config/env changes, and screenshots/log snippets for browser-flow changes.

## Security & Configuration Tips
- Never commit API keys (`EXA_API_KEY`, `PERPLEXITY_API_KEY`, `XAI_API_KEY`, etc.).
- Keep secrets in local environment/config files and document required variables in PR descriptions.
