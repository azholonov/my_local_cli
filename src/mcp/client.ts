import type { Tool, ToolResult, ToolExecutionContext } from '../tools/types.js';

/**
 * Adapter that wraps an MCP tool to conform to our Tool interface.
 * This is used by the McpManager to bridge MCP tools into the tool registry.
 */
export class McpToolAdapter implements Tool {
  definition;
  permissionLevel = 'ask' as const;

  constructor(
    private mcpClient: {
      callTool: (params: {
        name: string;
        arguments?: Record<string, unknown>;
      }) => Promise<{ content: Array<{ type: string; text?: string }>; isError?: boolean }>;
    },
    private mcpTool: {
      name: string;
      description?: string;
      inputSchema?: Record<string, unknown>;
    },
    serverName: string,
  ) {
    this.definition = {
      name: `mcp__${serverName}__${mcpTool.name}`,
      description: mcpTool.description ?? `MCP tool: ${mcpTool.name}`,
      inputSchema: (mcpTool.inputSchema as Record<string, unknown>) ?? {
        type: 'object',
        properties: {},
      },
    };
  }

  async execute(
    input: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      const result = await this.mcpClient.callTool({
        name: this.mcpTool.name,
        arguments: input,
      });

      const text = result.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('\n');

      return {
        success: !result.isError,
        output: text,
        error: result.isError ? text : undefined,
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `MCP tool error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
