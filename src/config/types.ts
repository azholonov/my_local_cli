import type { ConfigSchema } from './schema.js';

export type McpServerConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

// AppConfig is derived from the Zod schema to stay in sync
export type AppConfig = ConfigSchema;
