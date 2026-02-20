# my-local-ai

AI agent CLI tool similar to Claude Code. TypeScript, ESM, Ink (React for CLI).

## Commands

```bash
npm run dev                          # Run the CLI
npm run dev -- --model gpt-4o       # Run with specific model
npm run typecheck                    # Type check (tsc --noEmit)
npm run test                         # Run tests (vitest)
```

## Architecture

```
bin/cli.ts          → Entry point (commander, parses args)
src/index.ts        → Bootstrap (wires providers, tools, MCP, UI)
src/agent/loop.ts   → Core agent loop: prompt → stream → tool calls → continue
src/providers/      → Multi-provider abstraction (Anthropic, OpenAI, Ollama)
src/tools/          → Tool registry + 7 built-in tools
src/mcp/            → MCP client manager + tool adapter
src/ui/             → Ink/React terminal UI components
src/commands/       → Slash command registry (/help, /models, /clear, etc.)
src/permissions/    → Permission checker (safe/ask/dangerous)
src/conversation/   → History, session persistence, context compression
src/config/         → Zod-validated config from ~/.my_local_ai/config.json + env
```

## Key Patterns

- **Provider interface** (`src/providers/types.ts`): All providers implement `stream()` returning `AsyncIterable<StreamEvent>`. Add new providers by implementing this interface.
- **Tool interface** (`src/tools/types.ts`): Tools declare `definition` (JSON Schema), `permissionLevel`, and `execute()`. Register in `src/tools/index.ts`.
- **MCP tools** plug into the same tool registry via `McpToolAdapter` (`src/mcp/client.ts`).
- **Slash commands** (`src/commands/index.ts`): Register with `registerCommand()`. Return `'__EXIT__'` to quit.
- **Model catalog** (`src/config/schema.ts`): `defaultModels` object maps model IDs to `{ provider, label }`. Default model: `claude-3-haiku-20240307`.

## Config

File: `~/.my_local_ai/config.json`
Env vars: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OLLAMA_HOST`
Env vars override config file values.

## Conventions

- ESM only (`"type": "module"` in package.json). All imports use `.js` extensions.
- JSX uses `react-jsx` transform (no `import React` needed in .tsx, but used explicitly).
- Zod v4 — `z.record()` requires two args: `z.record(z.string(), valueSchema)`.
- Ink v5 with React 18.
- Tool permission levels: `safe` (auto-allow), `ask` (prompt user), `dangerous` (auto-deny).
- Provider auto-detection via model catalog first, then prefix matching (`claude-` → anthropic, `gpt-` → openai), then fallback order.

## Adding a New Tool

1. Create `src/tools/builtin/my-tool.ts` implementing `Tool` interface
2. Export from `src/tools/index.ts`
3. Register in `createBuiltinToolRegistry()`

## Adding a New Provider

1. Create `src/providers/my-provider.ts` implementing `Provider` interface
2. Add to `ProviderRegistry` constructor in `src/providers/registry.ts`
3. Add model entries to `defaultModels` in `src/config/schema.ts`

## Adding a Slash Command

1. Call `registerCommand()` in `src/commands/index.ts`
2. If it needs new context, extend `CommandContext` in `src/commands/types.ts` and wire in `src/ui/App.tsx`
