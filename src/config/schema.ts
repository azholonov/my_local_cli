import { z } from 'zod';

const mcpServerSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export const configSchema = z.object({
  defaultModel: z.string().default('claude-sonnet-4-20250514'),
  maxTokens: z.number().int().positive().default(8192),
  temperature: z.number().min(0).max(2).default(0),
  anthropicApiKey: z.string().optional(),
  openaiApiKey: z.string().optional(),
  ollamaHost: z.string().default('http://localhost:11434'),
  mcpServers: z.record(z.string(), mcpServerSchema).default({}),
});

export type ConfigSchema = z.infer<typeof configSchema>;
