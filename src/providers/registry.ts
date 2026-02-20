import type { Provider } from './types.js';
import type { AppConfig } from '../config/types.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { OllamaProvider } from './ollama.js';

/** Fallback prefix matching for models not in the catalog */
const MODEL_PREFIX_MAP: Record<string, string> = {
  'claude-': 'anthropic',
  'gpt-': 'openai',
  'o1': 'openai',
  'o3': 'openai',
  'o4': 'openai',
};

interface ModelEntry {
  provider: string;
  label?: string;
  maxTokens?: number;
}

export class ProviderRegistry {
  private providers = new Map<string, Provider>();
  private models: Record<string, ModelEntry>;

  constructor(config: AppConfig) {
    // Register available providers based on config
    if (config.anthropicApiKey) {
      this.providers.set(
        'anthropic',
        new AnthropicProvider(config.anthropicApiKey),
      );
    }
    if (config.openaiApiKey) {
      this.providers.set('openai', new OpenAIProvider(config.openaiApiKey));
    }
    // Ollama is always available (local)
    this.providers.set('ollama', new OllamaProvider(config.ollamaHost));

    // Store model catalog
    this.models = config.models ?? {};
  }

  /** Get a provider by explicit name */
  get(name: string): Provider | undefined {
    return this.providers.get(name);
  }

  /** Auto-detect provider from model name */
  getForModel(model: string): Provider {
    // 1. Check the model catalog first
    const entry = this.models[model];
    if (entry) {
      const provider = this.providers.get(entry.provider);
      if (provider) return provider;
    }

    // 2. Fallback to prefix matching
    for (const [prefix, providerName] of Object.entries(MODEL_PREFIX_MAP)) {
      if (model.startsWith(prefix)) {
        const provider = this.providers.get(providerName);
        if (provider) return provider;
      }
    }

    // 3. Default: try anthropic, then openai, then ollama
    for (const name of ['anthropic', 'openai', 'ollama']) {
      const provider = this.providers.get(name);
      if (provider) return provider;
    }

    throw new Error(
      `No provider available for model "${model}". Configure an API key in ~/.my_local_ai/config.json or environment variables.`,
    );
  }

  /** Get model catalog entry */
  getModelEntry(model: string): ModelEntry | undefined {
    return this.models[model];
  }

  /** List all models in the catalog, grouped by provider */
  getModelCatalog(): Record<string, Array<{ id: string; label: string }>> {
    const grouped: Record<string, Array<{ id: string; label: string }>> = {};
    for (const [id, entry] of Object.entries(this.models)) {
      const providerName = entry.provider;
      if (!grouped[providerName]) {
        grouped[providerName] = [];
      }
      grouped[providerName].push({ id, label: entry.label ?? id });
    }
    return grouped;
  }

  /** List available provider names */
  list(): string[] {
    return Array.from(this.providers.keys());
  }
}
