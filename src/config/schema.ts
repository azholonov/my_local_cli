import { z } from 'zod';

const mcpServerSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const modelConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'ollama']),
  label: z.string().optional(),
  maxTokens: z.number().int().positive().optional(),
});

const defaultModels: Record<string, z.infer<typeof modelConfigSchema>> = {
  'claude-sonnet-4-20250514': { provider: 'anthropic', label: 'Claude Sonnet 4', maxTokens: 8192 },
  'claude-opus-4-20250514': { provider: 'anthropic', label: 'Claude Opus 4', maxTokens: 8192 },
  'claude-haiku-4-20250414': { provider: 'anthropic', label: 'Claude Haiku 4', maxTokens: 8192 },
  'claude-3-haiku-20240307': { provider: 'anthropic', label: 'Claude Haiku 3', maxTokens: 4096 },
  'gpt-4o': { provider: 'openai', label: 'GPT-4o', maxTokens: 16384 },
  'gpt-4o-mini': { provider: 'openai', label: 'GPT-4o Mini', maxTokens: 16384 },
  'o3': { provider: 'openai', label: 'o3', maxTokens: 16384 },
  'o4-mini': { provider: 'openai', label: 'o4 Mini', maxTokens: 16384 },
  'llama3': { provider: 'ollama', label: 'Llama 3', maxTokens: 4096 },
  'mistral': { provider: 'ollama', label: 'Mistral', maxTokens: 4096 },
  'codellama': { provider: 'ollama', label: 'Code Llama', maxTokens: 4096 },
};

export const configSchema = z.object({
  defaultModel: z.string().default('claude-3-haiku-20240307'),
  maxTokens: z.number().int().positive().default(8192),
  temperature: z.number().min(0).max(2).default(0),
  anthropicApiKey: z.string().optional(),
  openaiApiKey: z.string().optional(),
  ollamaHost: z.string().default('http://localhost:11434'),
  models: z.record(z.string(), modelConfigSchema).default(defaultModels),
  mcpServers: z.record(z.string(), mcpServerSchema).default({}),
});

export type ConfigSchema = z.infer<typeof configSchema>;
