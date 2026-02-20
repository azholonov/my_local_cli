import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { McpToolAdapter } from './client.js';
import type { McpServerConfig, McpServerInfo } from './types.js';

interface ManagedServer {
  name: string;
  config: McpServerConfig;
  client: Client;
  transport: StdioClientTransport;
  status: 'connected' | 'disconnected' | 'error';
  error?: string;
}

export class McpManager {
  private servers = new Map<string, ManagedServer>();

  /** Connect to all configured MCP servers */
  async connectAll(
    configs: Record<string, McpServerConfig>,
  ): Promise<void> {
    const entries = Object.entries(configs);
    const results = await Promise.allSettled(
      entries.map(([name, config]) => this.connect(name, config)),
    );

    // Log any failures
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        const name = entries[i]![0];
        console.error(`Failed to connect MCP server "${name}": ${result.reason}`);
      }
    });
  }

  /** Connect to a single MCP server */
  private async connect(name: string, config: McpServerConfig): Promise<void> {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: { ...process.env, ...config.env } as Record<string, string>,
    });

    const client = new Client({
      name: `my-local-ai-${name}`,
      version: '0.1.0',
    });

    try {
      await client.connect(transport);
      this.servers.set(name, {
        name,
        config,
        client,
        transport,
        status: 'connected',
      });
    } catch (err) {
      this.servers.set(name, {
        name,
        config,
        client,
        transport,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /** Get all tool adapters from all connected servers */
  async getAllTools(): Promise<McpToolAdapter[]> {
    const adapters: McpToolAdapter[] = [];

    for (const [serverName, server] of this.servers) {
      if (server.status !== 'connected') continue;

      try {
        const { tools } = await server.client.listTools();
        for (const tool of tools) {
          adapters.push(
            new McpToolAdapter(server.client as any, tool, serverName),
          );
        }
      } catch (err) {
        server.status = 'error';
        server.error = err instanceof Error ? err.message : String(err);
      }
    }

    return adapters;
  }

  /** Get info about all servers */
  getServerInfo(): McpServerInfo[] {
    return Array.from(this.servers.values()).map((s) => ({
      name: s.name,
      status: s.status,
      toolCount: 0, // Will be populated lazily
      error: s.error,
    }));
  }

  /** Gracefully disconnect all servers */
  async shutdown(): Promise<void> {
    for (const server of this.servers.values()) {
      try {
        await server.client.close();
      } catch {
        // Ignore errors during shutdown
      }
    }
    this.servers.clear();
  }
}
