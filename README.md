# my-local-ai

A full-featured AI agent CLI tool with multi-provider support. Built with TypeScript, ESM, and [Ink](https://github.com/vadimdemedes/ink) (React for the terminal).

Think of it as your own local coding assistant that can read, write, and edit files, run shell commands, search your codebase, and fetch web content — all from an interactive terminal UI.

## Features

- **Multi-provider support** — Anthropic (Claude), OpenAI (GPT), and Ollama (local models) out of the box
- **7 built-in tools** — file read/write/edit, bash execution, glob search, grep search, web fetch
- **MCP integration** — connect any [Model Context Protocol](https://modelcontextprotocol.io/) server to extend tool capabilities
- **Interactive terminal UI** — React-based (Ink v5) with streaming responses, tool call display, and permission prompts
- **Slash commands** — `/model`, `/models`, `/compact`, `/status`, `/help`, and more
- **Permission system** — three-tier (`safe` / `ask` / `dangerous`) with session-level overrides
- **Session persistence** — conversations are saved to disk and can be resumed
- **Context compression** — summarize long conversations to stay within context limits
- **Hot-swappable models** — switch models and providers mid-conversation

## Quick Start

### Prerequisites

- Node.js 18+
- At least one provider configured (API key or local Ollama server)

### Installation

```bash
git clone <repo-url>
cd my-local-ai
npm install
```

### Configuration

Set API keys via environment variables (recommended) or a config file.

**Environment variables:**

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export OLLAMA_HOST="http://localhost:11434"  # default, only needed if non-standard
```

You can also place these in a `.env` file in the project root — it's loaded automatically via dotenv.

**Config file** (`~/.my_local_ai/config.json`):

```json
{
  "defaultModel": "claude-sonnet-4-20250514",
  "maxTokens": 8192,
  "temperature": 0,
  "anthropicApiKey": "sk-ant-...",
  "openaiApiKey": "sk-...",
  "ollamaHost": "http://localhost:11434",
  "models": {},
  "mcpServers": {}
}
```

Environment variables take precedence over the config file.

### Run

```bash
npm run dev                          # Start with default model
npm run dev -- --model gpt-4o       # Use a specific model
npm run dev -- --model llama3       # Use a local Ollama model
npm run dev -- -p openai -m o3     # Specify provider explicitly
```

## CLI Options

```
Usage: my-local-ai [options]

Options:
  -V, --version             output the version number
  -m, --model <model>       model to use (overrides config default)
  -p, --provider <provider> provider: anthropic, openai, ollama
  -h, --help                display help for command
```

## Supported Models

Models are auto-detected by prefix or looked up in the model catalog.

| Model ID | Provider | Label | Max Tokens |
|---|---|---|---|
| `claude-sonnet-4-20250514` | Anthropic | Claude Sonnet 4 | 8192 |
| `claude-opus-4-20250514` | Anthropic | Claude Opus 4 | 8192 |
| `claude-haiku-4-20250414` | Anthropic | Claude Haiku 4 | 8192 |
| `claude-3-haiku-20240307` | Anthropic | Claude Haiku 3 | 4096 |
| `gpt-4o` | OpenAI | GPT-4o | 16384 |
| `gpt-4o-mini` | OpenAI | GPT-4o Mini | 16384 |
| `o3` | OpenAI | o3 | 16384 |
| `o4-mini` | OpenAI | o4 Mini | 16384 |
| `llama3` | Ollama | Llama 3 | 4096 |
| `mistral` | Ollama | Mistral | 4096 |
| `codellama` | Ollama | Code Llama | 4096 |

You can add custom models in `~/.my_local_ai/config.json`:

```json
{
  "models": {
    "my-custom-model": {
      "provider": "ollama",
      "label": "My Custom Model",
      "maxTokens": 8192
    }
  }
}
```

Provider auto-detection order:
1. Model catalog lookup
2. Prefix matching (`claude-` → Anthropic, `gpt-`/`o1`/`o3`/`o4` → OpenAI)
3. Fallback: Anthropic → OpenAI → Ollama

## Built-in Tools

| Tool | Permission | Description |
|---|---|---|
| `file_read` | `safe` | Read file contents with line numbers |
| `file_write` | `ask` | Write content to a file (creates directories if needed) |
| `file_edit` | `ask` | Replace exact string matches in a file |
| `bash` | `ask` | Execute shell commands (120s default timeout) |
| `glob` | `safe` | Find files matching a glob pattern |
| `grep` | `safe` | Search file contents with regex |
| `web_fetch` | `ask` | Fetch and return content from a URL |

### Permission Levels

- **`safe`** — executed automatically, no user prompt
- **`ask`** — requires user approval before execution; can be granted for the session per-tool
- **`dangerous`** — automatically denied (no built-in tools use this level currently)

When a tool requires approval, an interactive prompt lets you:
- **Allow** — approve this single execution
- **Allow All (this tool)** — grant session-level permission for this tool
- **Deny** — reject the execution

## Slash Commands

Type these in the input prompt during a conversation:

| Command | Description |
|---|---|
| `/help` | Show available commands |
| `/model [id]` | Show or switch the current model |
| `/models` | List all available models grouped by provider |
| `/compact` | Compress conversation history to save context |
| `/status` | Show current model, provider, and message count |
| `/clear` | Clear conversation history |
| `/exit` | Exit the application |
| `/quit` | Exit the application |

## MCP Server Integration

Connect external tools via the [Model Context Protocol](https://modelcontextprotocol.io/). MCP servers run as child processes communicating over stdio.

Configure in `~/.my_local_ai/config.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
      "env": {}
    }
  }
}
```

MCP tools are namespaced as `mcp__<serverName>__<toolName>` and integrated into the same tool registry as built-in tools. All MCP tools use the `ask` permission level.

## Architecture

```
bin/cli.ts              → Entry point (Commander.js, parses args)
src/index.ts            → Bootstrap (wires providers, tools, MCP, UI)
src/agent/
  loop.ts               → Core agent loop: prompt → stream → tool calls → repeat
  planner.ts            → Plan mode modifier (instructs model to plan before acting)
src/providers/
  types.ts              → Provider interface (stream() → AsyncIterable<StreamEvent>)
  registry.ts           → Auto-detects provider from model name
  anthropic.ts          → Anthropic Claude provider
  openai.ts             → OpenAI provider
  ollama.ts             → Ollama local models provider
src/tools/
  types.ts              → Tool interface (definition, permissionLevel, execute)
  index.ts              → Tool registry + built-in tool registration
  builtin/              → 7 built-in tool implementations
src/mcp/
  manager.ts            → Manages multiple MCP server connections
  client.ts             → McpToolAdapter wraps MCP tools as internal Tools
src/ui/
  App.tsx               → Root Ink component (messages, streaming, input)
  components/           → StatusBar, StreamingText, ToolCallDisplay, PermissionPrompt
  theme.ts              → Chalk-based color theme
src/commands/
  index.ts              → Slash command registry
  types.ts              → CommandContext interface
src/permissions/
  checker.ts            → Permission checker with session-level overrides
src/conversation/
  history.ts            → Session persistence (~/.my_local_ai/sessions/)
  compressor.ts         → LLM-powered conversation summarization
src/config/
  schema.ts             → Zod-validated config + default model catalog
src/constants.ts        → App-wide constants
```

### Agent Loop

The core loop in `src/agent/loop.ts` follows this cycle:

1. Send user message + conversation history to the provider
2. Stream the response, collecting text and tool calls
3. If tool calls are present, execute them (with permission checks)
4. Push tool results back as messages
5. Repeat from step 2 until no more tool calls
6. Yield `turn_complete`

### Streaming Events

Providers emit a common `StreamEvent` type:

```typescript
type StreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call_start'; toolCallId: string; toolName: string }
  | { type: 'tool_call_delta'; toolCallId: string; inputDelta: string }
  | { type: 'tool_call_end'; toolCallId: string }
  | { type: 'message_end'; finishReason: string }
  | { type: 'error'; error: string }
```

## Extending

### Adding a New Provider

1. Create `src/providers/my-provider.ts` implementing the `Provider` interface
2. Register it in the `ProviderRegistry` constructor (`src/providers/registry.ts`)
3. Add model entries to `defaultModels` in `src/config/schema.ts`

### Adding a New Tool

1. Create `src/tools/builtin/my-tool.ts` implementing the `Tool` interface
2. Export from `src/tools/index.ts`
3. Register in `createBuiltinToolRegistry()`

### Adding a Slash Command

1. Call `registerCommand()` in `src/commands/index.ts`
2. If it needs additional context, extend `CommandContext` in `src/commands/types.ts` and wire it in `src/ui/App.tsx`

## Development

```bash
npm run dev           # Run the CLI (via tsx)
npm run typecheck     # Type-check without emitting (tsc --noEmit)
npm run build         # Compile TypeScript to dist/
npm run test          # Run tests (vitest)
npm run test:watch    # Run tests in watch mode
npm run lint          # Lint with ESLint
npm run format        # Format with Prettier
```

## Tech Stack

- **TypeScript** (ES2022, ESM-only)
- **Ink v5** + **React 18** — terminal UI
- **Commander.js** — CLI argument parsing
- **Zod v4** — config validation
- **@anthropic-ai/sdk** — Anthropic Claude API
- **openai** — OpenAI API
- **ollama** — Ollama local models
- **@modelcontextprotocol/sdk** — MCP client
- **chalk** — terminal colors
- **vitest** — test runner

## License

MIT
