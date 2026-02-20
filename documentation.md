# my-local-ai - Full Documentation

## Table of Contents

1. [What Is This?](#what-is-this)
2. [How It Works - The Big Picture](#how-it-works---the-big-picture)
3. [Boot Sequence](#boot-sequence)
4. [The Agent Loop - Core Engine](#the-agent-loop---core-engine)
5. [Provider Layer](#provider-layer)
6. [Tool System](#tool-system)
7. [Permission System](#permission-system)
8. [MCP Client](#mcp-client)
9. [Conversation Management](#conversation-management)
10. [Slash Commands](#slash-commands)
11. [Terminal UI](#terminal-ui)
12. [Configuration](#configuration)
13. [Plan Mode](#plan-mode)
14. [Does It Have RAG?](#does-it-have-rag)
15. [Data Flow Walkthrough](#data-flow-walkthrough)
16. [Glossary](#glossary)

---

## What Is This?

`my-local-ai` is an interactive terminal CLI tool that lets you chat with AI models (Claude, GPT, Ollama) and give them the ability to **take actions** on your computer — read files, write code, run commands, search your codebase. It's architecturally similar to Claude Code.

It is **not** a simple chatbot. It is an **agent** — an AI that can reason, decide to use tools, observe results, and continue reasoning until it has a complete answer.

**Tech stack:**
- TypeScript (ESM) — language
- Ink v5 (React 18 for CLI) — terminal UI framework
- Anthropic/OpenAI/Ollama SDKs — AI provider APIs
- MCP SDK — Model Context Protocol client
- Zod v4 — config validation

---

## How It Works - The Big Picture

```
You type a message
       │
       ▼
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Terminal UI │────▶│  Agent Loop  │────▶│   Provider   │
│   (Ink)      │◀────│              │◀────│  (Claude/    │
│              │     │              │     │   GPT/Ollama) │
└─────────────┘     └──────┬───────┘     └──────────────┘
                           │
                    ┌──────▼───────┐
                    │ Tool System  │
                    │ (read, write,│
                    │  bash, grep) │
                    └──────────────┘
```

1. You type a message in the terminal
2. The **Agent Loop** sends your message + conversation history + available tool definitions to the AI provider
3. The provider **streams** back a response — either text or tool calls
4. If the AI wants to use a tool (e.g., read a file), the agent loop **executes** the tool and sends the result back to the AI
5. The AI continues reasoning with the tool result and may call more tools or produce a final text answer
6. The final text is displayed to you in the terminal

This loop (steps 3-5) can repeat **multiple times** in a single turn. The AI might read a file, then edit it, then run a test — all in one response to your single message.

---

## Boot Sequence

When you run `npm run dev`, here's what happens step by step:

```
bin/cli.ts                          ← Entry point
  │
  ├─ Parse CLI args (--model, --provider) via Commander
  │
  └─ Call startApp() in src/index.ts
       │
       ├─ 1. loadConfig()           ← Read ~/.my_local_ai/config.json + env vars
       │                              Validate with Zod schema, apply defaults
       │
       ├─ 2. new ProviderRegistry() ← Create provider instances based on API keys
       │     ├─ AnthropicProvider   (if ANTHROPIC_API_KEY exists)
       │     ├─ OpenAIProvider      (if OPENAI_API_KEY exists)
       │     └─ OllamaProvider      (always, it's local)
       │
       ├─ 3. createBuiltinToolRegistry()
       │     └─ Register 7 built-in tools
       │
       ├─ 4. new McpManager()       ← Connect to configured MCP servers
       │     └─ Register MCP tools into the same tool registry
       │
       ├─ 5. new PermissionChecker()
       │
       ├─ 6. new AgentLoop()        ← Wire provider + tools + permissions together
       │
       ├─ 7. render(<App />)        ← Start the Ink terminal UI
       │
       └─ 8. Register shutdown handlers (SIGINT/SIGTERM)
```

**Key file:** `src/index.ts` — this is the orchestrator that creates all components and wires them together.

---

## The Agent Loop - Core Engine

**File:** `src/agent/loop.ts`

The agent loop is the heart of the application. It implements the **ReAct pattern** (Reason + Act):

```
User Message
     │
     ▼
┌─────────────────┐
│ Send to Provider │◄──────────────────────┐
│ (with tools)     │                       │
└────────┬────────┘                       │
         │                                │
         ▼                                │
    ┌─────────┐     Yes    ┌──────────┐   │
    │ Tool    │───────────▶│ Execute  │   │
    │ call?   │            │ Tool     │   │
    └────┬────┘            └────┬─────┘   │
         │ No                   │         │
         ▼                      │         │
    ┌─────────┐            ┌────▼─────┐   │
    │ Display │            │ Append   │   │
    │ text    │            │ result   │───┘
    └─────────┘            │ to msgs  │
                           └──────────┘
```

### How `runTurn()` works internally:

```typescript
async *runTurn(userMessage: string): AsyncIterable<AgentEvent>
```

This is an **async generator** — it yields events as they happen rather than waiting for everything to complete. This enables streaming.

**Step by step:**

1. **Push user message** onto the `messages` array
2. **Enter the while loop** — this loop continues as long as the AI makes tool calls
3. **Call `provider.stream(messages, options)`** — sends the full conversation + tool definitions to the AI
4. **Process the stream events:**
   - `text_delta` → accumulate text, yield to UI for display
   - `tool_call_start` → AI wants to use a tool, start accumulating the JSON input
   - `tool_call_delta` → partial JSON chunk of the tool's input parameters
   - `tool_call_end` → parse the complete JSON, record the tool call
5. **After stream ends**, build an assistant message with text + tool_use content blocks
6. **If there were tool calls:**
   - Execute each tool via `onToolExecute` callback
   - Build `tool_result` content blocks with the output
   - Push results as a new user message (Anthropic format requires this)
   - Set `continueLoop = true` → go back to step 3
7. **If no tool calls**, the loop exits and yields `turn_complete`

### Message Format

Messages use Anthropic's **content block** format internally:

```typescript
// Simple text message
{ role: 'user', content: 'Hello' }

// Assistant message with tool use
{ role: 'assistant', content: [
  { type: 'text', text: 'Let me read that file.' },
  { type: 'tool_use', id: 'tc_123', name: 'file_read', input: { file_path: '/foo.ts' } }
]}

// Tool result (sent as 'user' role for Anthropic compatibility)
{ role: 'user', content: [
  { type: 'tool_result', toolUseId: 'tc_123', content: '...file contents...' }
]}
```

Each provider adapter translates this internal format to the provider's native format.

---

## Provider Layer

**Directory:** `src/providers/`

The provider layer abstracts away the differences between AI APIs behind a unified interface.

### The Provider Interface

```typescript
interface Provider {
  readonly name: string;
  stream(messages, options): AsyncIterable<StreamEvent>;
  complete(messages, options): Promise<ProviderMessage>;
}
```

Every provider must implement two methods:
- **`stream()`** — for interactive chat. Returns an async iterable of `StreamEvent`s (text chunks, tool calls)
- **`complete()`** — for non-interactive use (conversation compression). Returns a single complete message.

### StreamEvent — The Unified Streaming Protocol

All providers emit the same event types, regardless of their native streaming format:

| Event | Meaning |
|---|---|
| `text_delta` | A chunk of text from the AI (could be a word, a sentence fragment) |
| `tool_call_start` | AI decided to use a tool — includes tool name and call ID |
| `tool_call_delta` | Partial JSON input for the tool (streamed incrementally) |
| `tool_call_end` | Tool call input is complete |
| `message_end` | The AI finished its response |
| `error` | Something went wrong |

### How Each Provider Maps to StreamEvent

**Anthropic** (`src/providers/anthropic.ts`):
- Uses `@anthropic-ai/sdk` with `messages.stream()`
- Anthropic streams `content_block_start` → `content_block_delta` → `content_block_stop` events
- Tool calls come as `tool_use` content blocks
- Tool results must be sent as content blocks inside a `user` message
- System prompt is a separate parameter (not a message)

**OpenAI** (`src/providers/openai.ts`):
- Uses `openai` SDK with `chat.completions.create({ stream: true })`
- OpenAI streams `delta` objects with `content` (text) or `tool_calls` (function calls)
- Tool calls use `function` type with `name` and `arguments` (JSON string)
- Tool results are sent as `tool` role messages with `tool_call_id`
- System prompt is a regular `system` role message

**Ollama** (`src/providers/ollama.ts`):
- Uses `ollama` SDK with `chat({ stream: true })`
- Ollama uses newline-delimited JSON, similar to OpenAI format
- Tool calls arrive in `message.tool_calls` array
- Runs 100% locally — no API key needed

### Provider Registry

**File:** `src/providers/registry.ts`

The registry manages provider instances and routes model names to the right provider:

1. **Model catalog lookup** — checks the `models` config section (exact match)
2. **Prefix matching** — `claude-` → anthropic, `gpt-` → openai
3. **Fallback order** — tries anthropic → openai → ollama

```typescript
const provider = registry.getForModel('gpt-4o');
// → Returns OpenAIProvider because 'gpt-4o' matches 'gpt-' prefix
```

---

## Tool System

**Directory:** `src/tools/`

Tools are the **actions** the AI can take on your computer. They're what make this an agent, not just a chatbot.

### The Tool Interface

```typescript
interface Tool {
  definition: ToolDefinition;        // Name, description, JSON Schema for inputs
  permissionLevel: PermissionLevel;  // 'safe' | 'ask' | 'dangerous'
  execute(input, context): Promise<ToolResult>;
}
```

Each tool has:
- **`definition`** — sent to the AI provider so it knows what tools are available and how to call them. The `inputSchema` is a JSON Schema that describes the parameters.
- **`permissionLevel`** — controls whether the tool runs automatically or requires user approval.
- **`execute()`** — the actual implementation. Receives parsed input and returns `{ success, output, error }`.

### Built-in Tools

| Tool | File | Permission | What It Does |
|---|---|---|---|
| `file_read` | `builtin/file-read.ts` | safe | Read file contents with line numbers. Supports `offset` and `limit` for large files. |
| `file_write` | `builtin/file-write.ts` | ask | Write/overwrite a file. Creates parent directories. |
| `file_edit` | `builtin/file-edit.ts` | ask | Find-and-replace in a file. Requires `old_string` to be unique unless `replace_all` is set. |
| `bash` | `builtin/bash.ts` | ask | Run a shell command. Captures stdout/stderr. Has configurable timeout (default 2min, max 10min). Truncates output at 30,000 chars. |
| `glob` | `builtin/glob.ts` | safe | Find files by pattern (e.g., `**/*.ts`). Ignores `node_modules` and `.git`. |
| `grep` | `builtin/grep.ts` | safe | Search file contents by regex. Returns matches with file paths and line numbers. Supports context lines. Caps at 500 matches. |
| `web_fetch` | `builtin/web-fetch.ts` | ask | HTTP GET a URL. Strips HTML tags. Truncates at 50,000 chars. 30-second timeout. |

### Tool Registry

**File:** `src/tools/registry.ts`

A simple `Map<string, Tool>` that provides:
- `register(tool)` — add a tool (built-in or MCP)
- `get(name)` — look up a tool by name
- `getDefinitions()` — get all tool definitions (sent to the AI provider)
- `execute(name, input, context)` — run a tool with error catching

### How Tool Definitions Are Sent to the AI

When the agent loop calls `provider.stream()`, it includes `tools: toolRegistry.getDefinitions()`. This sends something like:

```json
{
  "name": "file_read",
  "description": "Read the contents of a file...",
  "inputSchema": {
    "type": "object",
    "properties": {
      "file_path": { "type": "string", "description": "..." },
      "offset": { "type": "number", "description": "..." }
    },
    "required": ["file_path"]
  }
}
```

The AI sees this and decides **when and how** to call each tool based on the user's request.

---

## Permission System

**Directory:** `src/permissions/`

Not all tools should run without asking. The permission system gates tool execution.

### Permission Levels

| Level | Behavior | Tools |
|---|---|---|
| `safe` | Auto-allowed, runs immediately | `file_read`, `glob`, `grep` |
| `ask` | Requires user approval | `file_write`, `file_edit`, `bash`, `web_fetch` |
| `dangerous` | Auto-denied | (none currently, reserved for destructive patterns) |

### How It Works

```
Tool call received
       │
       ▼
┌─────────────────┐
│ Session override?│──Yes──▶ Allow
│ (user said       │
│  "allow all")    │
└────────┬────────┘
         │ No
         ▼
┌─────────────────┐
│ Check tool's     │
│ permissionLevel  │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
  safe      ask      dangerous
    │         │          │
    ▼         ▼          ▼
  Allow    Prompt     Deny
           User
```

### Session Overrides

The `PermissionChecker` tracks session-level overrides:
- `allowForSession('bash')` — auto-allow bash for the rest of this session
- `allowAll()` — trust mode, auto-allow everything
- These reset when you restart the CLI

---

## MCP Client

**Directory:** `src/mcp/`

MCP (Model Context Protocol) lets you connect to **external tool servers** that expose additional capabilities — databases, APIs, custom tools, etc.

### How It Works

```
~/.my_local_ai/config.json
  │
  │  "mcpServers": {
  │    "github": {
  │      "command": "npx",
  │      "args": ["-y", "@modelcontextprotocol/server-github"]
  │    }
  │  }
  │
  ▼
McpManager
  │
  ├─ Spawn subprocess (npx ... server-github)
  ├─ Connect via StdioClientTransport (stdin/stdout)
  ├─ client.listTools() → get available tools
  ├─ Wrap each in McpToolAdapter
  └─ Register in ToolRegistry (same as built-in tools)
```

### McpToolAdapter

**File:** `src/mcp/client.ts`

This is the **Adapter pattern** — it wraps an MCP tool to conform to our `Tool` interface:

```typescript
class McpToolAdapter implements Tool {
  // Tool name is prefixed: "mcp__github__create_issue"
  // execute() calls mcpClient.callTool() under the hood
}
```

From the agent loop's perspective, MCP tools are **indistinguishable** from built-in tools. They appear in the same tool registry, have the same interface, and the AI can call them the same way.

### MCP Server Lifecycle

- **Connect** — at startup, `McpManager.connectAll()` spawns all configured servers in parallel
- **Use** — tools are called via `client.callTool()` over the stdio connection
- **Shutdown** — on exit, `McpManager.shutdown()` gracefully closes all connections

---

## Conversation Management

**Directory:** `src/conversation/`

### History (`history.ts`)

Stores the conversation as an array of `ProviderMessage` objects:
- Persists to disk at `~/.my_local_ai/sessions/{session-id}.json`
- Can list recent sessions and reload them
- Each session has: `id`, `createdAt`, `updatedAt`, `model`, `messages`

### Compressor (`compressor.ts`)

When conversations get long, they can exceed the model's context window. The compressor handles this:

1. **Split messages** — older messages (to compress) vs. recent messages (to keep, default: last 4)
2. **Summarize** — send old messages to the AI with a compression prompt: "Summarize this conversation concisely, preserving key context..."
3. **Replace** — swap old messages with a compact summary + placeholder assistant reply
4. **Result** — conversation goes from N messages down to 2 (summary) + 4 (recent) = 6 messages

```
Before: [msg1, msg2, msg3, msg4, msg5, msg6, msg7, msg8]
                    ▲ compress these ▲     ▲ keep these ▲
After:  [summary, ack, msg5, msg6, msg7, msg8]
```

This is triggered by the `/compact` slash command (wiring is a TODO).

---

## Slash Commands

**File:** `src/commands/index.ts`

Commands are typed by the user starting with `/` and handled **before** the message reaches the agent loop.

| Command | Description |
|---|---|
| `/help` | List all available commands |
| `/clear` | Clear conversation history (UI + agent memory) |
| `/model [name]` | Show current model, or switch to a new one |
| `/models` | List all models in the catalog grouped by provider |
| `/compact` | Compress conversation history |
| `/status` | Show current model, provider, and message count |
| `/exit` | Exit the application |
| `/quit` | Exit the application |

### How Commands Are Processed

```
User types "/model gpt-4o"
       │
       ▼
parseSlashCommand("/model gpt-4o")
  → { name: "model", args: "gpt-4o" }
       │
       ▼
getCommand("model")
  → SlashCommand object
       │
       ▼
cmd.execute("gpt-4o", commandContext)
  → "Model switched to: gpt-4o"
       │
       ▼
Display as system message (yellow)
```

The `CommandContext` gives commands access to runtime state:
- `model` / `provider` — current values
- `setModel()` — changes the model and auto-switches provider
- `clearConversation()` — clears UI messages + agent loop history
- `getModelCatalog()` — returns all configured models for `/models`

---

## Terminal UI

**Directory:** `src/ui/`

Built with **Ink** — a React renderer for the terminal. Components work exactly like React web components but render to stdout instead of DOM.

### Component Tree

```
<App>
  ├── <StatusBar />           ← Shows [provider:model] and streaming indicator
  │
  ├── {messages.map(msg =>    ← Scrollable message history
  │     <Box>
  │       <Text>You: / AI: / System:</Text>
  │       <Text>{msg.content}</Text>
  │       {msg.toolCalls?.map(tc =>
  │         <ToolCallDisplay />   ← Shows tool name, args summary, result
  │       )}
  │     </Box>
  │   )}
  │
  ├── {isStreaming && (        ← Live streaming area
  │     <Box>
  │       <StreamingText />    ← Token-by-token text display
  │       <ToolCallDisplay />  ← Active tool calls
  │       <Spinner />          ← "Thinking..." when waiting
  │     </Box>
  │   )}
  │
  └── <TextInput />            ← User input bar with "> " prompt
```

### Components

| Component | File | Purpose |
|---|---|---|
| `App` | `App.tsx` | Root component. Manages state, handles input, processes events |
| `StreamingText` | `components/StreamingText.tsx` | Renders text as it arrives from the provider |
| `ToolCallDisplay` | `components/ToolCallDisplay.tsx` | Shows tool name, truncated args, and result |
| `StatusBar` | `components/StatusBar.tsx` | Bottom status: provider, model, streaming state |
| `PermissionPrompt` | `components/PermissionPrompt.tsx` | Approval dialog for dangerous tools |

### Event Flow: UI ↔ Agent Loop

The App component calls `agentLoop.runTurn(message)` which returns an `AsyncIterable<AgentEvent>`. The App consumes events in a `for await` loop and updates React state:

```
AgentEvent                    → React State Update
─────────────────────────────────────────────────
text_delta                    → setStreamingText(accumulated)
tool_call_start               → add to activeToolCalls map
tool_call_input               → update tool call with parsed input
tool_call_complete            → commit to messages[], reset streaming
turn_complete                 → commit final text, setIsStreaming(false)
error                         → show error message
```

---

## Configuration

**File:** `src/config/`

### Loading Priority

```
1. ~/.my_local_ai/config.json    ← Base config (file)
2. Environment variables          ← Override specific values
3. Zod defaults                   ← Fill in anything not specified
```

### Config Schema

```json
{
  "defaultModel": "claude-3-haiku-20240307",
  "maxTokens": 8192,
  "temperature": 0,
  "anthropicApiKey": "sk-ant-...",
  "openaiApiKey": "sk-...",
  "ollamaHost": "http://localhost:11434",
  "models": {
    "claude-sonnet-4-20250514": {
      "provider": "anthropic",
      "label": "Claude Sonnet 4",
      "maxTokens": 8192
    },
    "gpt-4o": {
      "provider": "openai",
      "label": "GPT-4o"
    },
    "llama3": {
      "provider": "ollama",
      "label": "Llama 3"
    }
  },
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "ghp_..." }
    }
  }
}
```

### Environment Variables

| Variable | Overrides |
|---|---|
| `ANTHROPIC_API_KEY` | `anthropicApiKey` |
| `OPENAI_API_KEY` | `openaiApiKey` |
| `OLLAMA_HOST` | `ollamaHost` |
| `DEFAULT_MODEL` | `defaultModel` |

---

## Plan Mode

**File:** `src/agent/planner.ts`

Plan mode changes the AI's behavior — instead of immediately acting, it first creates a plan and asks for approval.

When enabled, an additional system prompt is injected:

> "You are in PLAN MODE. Analyze the user's request. Create a numbered plan of steps. Do NOT execute any tools yet. Present the plan and ask for approval."

**Flow:**
1. User enables plan mode (via `/plan`)
2. User sends a message
3. AI analyzes and produces a numbered plan (no tool calls)
4. User reviews: approve / modify / reject
5. On approval → switch to execute mode, feed plan as context

**Current status:** The `Planner` class exists but the `/plan` command and approval UI are not yet wired.

---

## Does It Have RAG?

**No, this tool does not implement RAG (Retrieval-Augmented Generation).**

Here's what it does and doesn't do:

### What RAG is:
RAG = embedding documents into a vector database, then retrieving relevant chunks at query time to augment the AI's context. It involves:
1. **Indexing** — split documents, generate embeddings, store in vector DB
2. **Retrieval** — on each query, embed the query, find similar chunks
3. **Augmentation** — inject retrieved chunks into the prompt

### What this tool does instead:

This tool uses **agentic tool use** — a fundamentally different approach:

| | RAG | This Tool (Agentic) |
|---|---|---|
| **How it finds information** | Vector similarity search (automatic) | AI decides which files to read (intentional) |
| **When retrieval happens** | Before every query | Only when the AI decides it needs info |
| **What gets retrieved** | Pre-chunked, pre-embedded snippets | Full files, command outputs, search results |
| **Requires setup** | Yes (embedding pipeline, vector DB) | No (just point it at your codebase) |
| **Precision** | Approximate (similarity-based) | Exact (reads the actual file) |

### How this tool "knows" about your code:

1. **You tell it** — "fix the bug in src/auth.ts"
2. **AI uses tools** — it calls `file_read` to read the file, `grep` to search for patterns, `glob` to find related files
3. **AI reasons** — with the file contents in its context, it understands the code
4. **AI acts** — it calls `file_edit` to fix the bug, `bash` to run tests

The AI is essentially **browsing your codebase on demand** rather than having it pre-indexed.

### Could you add RAG?

Yes. You could add a RAG tool by:
1. Creating a new tool `src/tools/builtin/rag-search.ts`
2. Using an embedding model to index your codebase
3. The tool would search the vector DB and return relevant chunks
4. Register it in the tool registry like any other tool

But the current agentic approach is sufficient for most coding tasks and doesn't require maintaining an index.

---

## Data Flow Walkthrough

Let's trace a complete example: the user asks "read package.json and tell me the dependencies."

```
Step 1: User Input
──────────────────
User types: "read package.json and tell me the dependencies"
App.handleSubmit() is called
  → setMessages([...messages, { role: 'user', content: '...' }])
  → setIsStreaming(true)
  → Start consuming agentLoop.runTurn('read package.json...')

Step 2: Agent Loop - First Provider Call
────────────────────────────────────────
AgentLoop.runTurn():
  messages = [{ role: 'user', content: 'read package.json...' }]
  provider.stream(messages, { tools: [...7 tool definitions...] })

Step 3: Provider Streaming
──────────────────────────
Anthropic SDK streams back:
  content_block_start → { type: 'tool_use', id: 'tc_1', name: 'file_read' }
  content_block_delta → { partial_json: '{"file_' }
  content_block_delta → { partial_json: 'path":"/...' }
  content_block_delta → { partial_json: '/package.json"}' }
  content_block_stop

AnthropicProvider maps these to:
  → StreamEvent { type: 'tool_call_start', toolCallId: 'tc_1', toolName: 'file_read' }
  → StreamEvent { type: 'tool_call_delta', inputDelta: '{"file_' }
  → StreamEvent { type: 'tool_call_delta', inputDelta: 'path":"/...' }
  → StreamEvent { type: 'tool_call_delta', inputDelta: '/package.json"}' }
  → StreamEvent { type: 'tool_call_end', toolCallId: 'tc_1' }

Step 4: Tool Execution
──────────────────────
AgentLoop parses accumulated JSON: { file_path: '/Users/.../package.json' }
  → Calls onToolExecute({ id: 'tc_1', name: 'file_read', input: {...} })
    → PermissionChecker: file_read is 'safe' → allow
    → ToolRegistry.execute('file_read', { file_path: '...' }, { workingDirectory: '...' })
      → FileReadTool reads the file, returns { success: true, output: '1\t{...' }

AgentLoop appends to messages:
  messages = [
    { role: 'user', content: 'read package.json...' },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'tc_1', ... }] },
    { role: 'user', content: [{ type: 'tool_result', toolUseId: 'tc_1', content: '...' }] }
  ]
  continueLoop = true → go back to step 2

Step 5: Agent Loop - Second Provider Call
─────────────────────────────────────────
provider.stream(messages) — now with tool result in context

Anthropic sees the file contents and streams back text:
  content_block_start → { type: 'text' }
  content_block_delta → { text: 'Here are the' }
  content_block_delta → { text: ' dependencies:\n\n' }
  content_block_delta → { text: '- @anthropic-ai/sdk...' }
  ...
  message_stop

No tool calls this time → continueLoop stays false → yield turn_complete

Step 6: UI Update
──────────────────
App receives events:
  text_delta → setStreamingText('Here are the')
  text_delta → setStreamingText('Here are the dependencies:\n\n')
  ...
  turn_complete → commit to messages[], setIsStreaming(false)

User sees the formatted response in the terminal.
```

---

## Glossary

| Term | Definition |
|---|---|
| **Agent** | An AI system that can reason, decide to take actions, observe results, and iterate. More than a chatbot. |
| **Agent Loop** | The core cycle: send messages to AI → receive response → execute tools → send results back → repeat until done. |
| **Provider** | An AI model backend (Anthropic, OpenAI, Ollama). Each implements the same `Provider` interface. |
| **Tool** | An action the AI can take (read file, run command, etc.). Defined with a JSON Schema and an `execute()` function. |
| **Tool Use** | When the AI decides to call a tool. The AI generates the tool name and input parameters. |
| **Tool Result** | The output of executing a tool. Sent back to the AI as context for its next response. |
| **StreamEvent** | A typed event emitted during streaming: text chunks, tool call progress, errors. |
| **AgentEvent** | A higher-level event emitted by the agent loop to the UI: same concepts plus permission requests and turn completion. |
| **MCP** | Model Context Protocol. A standard for connecting AI agents to external tool servers via JSON-RPC over stdio. |
| **Content Block** | Anthropic's message format. A message can contain multiple blocks: text, tool_use, tool_result. Other providers are adapted to this format internally. |
| **Permission Level** | Controls whether a tool runs automatically (`safe`), requires approval (`ask`), or is blocked (`dangerous`). |
| **Slash Command** | A user command starting with `/` (e.g., `/help`, `/model`). Handled in the UI before reaching the agent loop. |
| **Context Window** | The maximum amount of text (tokens) an AI model can process at once. Conversations that exceed this need compression. |
| **Conversation Compression** | Summarizing old messages to free up context space. Uses the AI itself to generate the summary. |
| **Plan Mode** | A mode where the AI creates a step-by-step plan before executing. Useful for complex tasks. |
| **RAG** | Retrieval-Augmented Generation. Pre-indexes documents for similarity search. This tool does NOT use RAG — it uses agentic tool calls instead. |
| **Ink** | A React renderer for the terminal. Components like `<Text>`, `<Box>` render to stdout instead of the browser DOM. |
| **Zod** | A TypeScript schema validation library. Used to validate config files and ensure type safety at runtime. |
| **AsyncIterable** | A JavaScript pattern for producing values over time. Used for streaming — `for await (const event of stream) { ... }`. |
