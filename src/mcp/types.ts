export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpServerInfo {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  toolCount: number;
  error?: string;
}
