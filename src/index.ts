import React from 'react';
import { render } from 'ink';
import { loadConfig } from './config/index.js';
import { ProviderRegistry } from './providers/registry.js';
import { AgentLoop } from './agent/loop.js';
import { Planner } from './agent/planner.js';
import { createBuiltinToolRegistry } from './tools/index.js';
import { PermissionChecker } from './permissions/index.js';
import { McpManager } from './mcp/index.js';
import { App } from './ui/App.js';
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from './constants.js';

const SYSTEM_PROMPT = `You are a helpful AI coding assistant running in an interactive terminal CLI tool.
You help users with software engineering tasks including writing code, debugging, explaining code, and more.
Be concise in your responses. Use markdown formatting for code blocks.

You have access to tools that let you read files, write files, edit files, run bash commands, search for files, and search file contents. Use these tools to help the user with their tasks.

When reading files, always use the file_read tool rather than bash with cat.
When searching for files, use the glob tool rather than bash with find.
When searching file contents, use the grep tool rather than bash with grep.
Prefer editing existing files over creating new ones.`;

export interface StartOptions {
  model?: string;
  provider?: string;
}

export async function startApp(options: StartOptions): Promise<void> {
  const config = loadConfig();
  const model = options.model ?? config.defaultModel;
  const cwd = process.cwd();

  // Create provider registry and get the right provider
  const providerRegistry = new ProviderRegistry(config);
  const provider = options.provider
    ? providerRegistry.get(options.provider) ?? providerRegistry.getForModel(model)
    : providerRegistry.getForModel(model);

  // Create tool registry with built-in tools
  const toolRegistry = createBuiltinToolRegistry();

  // Create MCP manager and connect to configured servers
  const mcpManager = new McpManager();
  if (Object.keys(config.mcpServers).length > 0) {
    try {
      await mcpManager.connectAll(config.mcpServers);
      // Register MCP tools in the tool registry
      const mcpTools = await mcpManager.getAllTools();
      for (const tool of mcpTools) {
        toolRegistry.register(tool);
      }
    } catch {
      // MCP connection errors are logged inside McpManager
    }
  }

  // Create permission checker and planner
  const permissionChecker = new PermissionChecker();
  const planner = new Planner();

  // Create agent loop with tools
  const agentLoop = new AgentLoop({
    provider,
    model,
    maxTokens: providerRegistry.getModelEntry(model)?.maxTokens ?? config.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: config.temperature ?? DEFAULT_TEMPERATURE,
    systemPrompt: SYSTEM_PROMPT,
    toolDefinitions: toolRegistry.getDefinitions(),
    onToolExecute: async (toolCall) => {
      const tool = toolRegistry.get(toolCall.name);
      if (!tool) {
        return { success: false, output: '', error: `Unknown tool: ${toolCall.name}` };
      }

      // Check permissions
      const decision = permissionChecker.checkWithWildcard({
        toolName: toolCall.name,
        toolInput: toolCall.input,
        permissionLevel: tool.permissionLevel,
      });

      if (decision === 'deny') {
        return { success: false, output: '', error: 'Permission denied' };
      }

      return toolRegistry.execute(toolCall.name, toolCall.input, {
        workingDirectory: cwd,
      });
    },
  });

  // Render the Ink app
  const { waitUntilExit } = render(
    React.createElement(App, {
      agentLoop,
      model,
      provider: provider.name,
      providerRegistry,
      permissionChecker,
      toolRegistry,
    }),
  );

  // Graceful shutdown
  const shutdown = async () => {
    await mcpManager.shutdown();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await waitUntilExit();
  await shutdown();
}
