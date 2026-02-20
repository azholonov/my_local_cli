import { readFileSync, existsSync, mkdirSync } from 'fs';
import { configSchema } from './schema.js';
import { CONFIG_DIR, CONFIG_FILE } from '../constants.js';
import type { AppConfig } from './types.js';

export function loadConfig(): AppConfig {
  // Ensure config directory exists
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // Load config file if it exists
  let fileConfig: Record<string, unknown> = {};
  if (existsSync(CONFIG_FILE)) {
    try {
      const raw = readFileSync(CONFIG_FILE, 'utf-8');
      fileConfig = JSON.parse(raw);
    } catch {
      // Invalid JSON — use defaults
    }
  }

  // Merge with environment variables (env vars take precedence)
  const merged = {
    ...fileConfig,
    ...(process.env['ANTHROPIC_API_KEY'] && { anthropicApiKey: process.env['ANTHROPIC_API_KEY'] }),
    ...(process.env['OPENAI_API_KEY'] && { openaiApiKey: process.env['OPENAI_API_KEY'] }),
    ...(process.env['OLLAMA_HOST'] && { ollamaHost: process.env['OLLAMA_HOST'] }),
    ...(process.env['DEFAULT_MODEL'] && { defaultModel: process.env['DEFAULT_MODEL'] }),
  };

  // Validate and return with defaults applied
  return configSchema.parse(merged);
}
