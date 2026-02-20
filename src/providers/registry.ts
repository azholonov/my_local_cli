import type { Provider } from './types.js';
import type { AppConfig } from '../config/types.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { OllamaProvider } from './ollama.js';

/** Known model prefixes to auto-detect provider */
const MODEL_PROVIDER_MAP: Record<string, string> = {
  'claude-': 'anthropic',
  'gpt-': 'openai',
  'o1': 'openai',
  'o3': 'openai',
  'o4': 'openai',
};

export class ProviderRegistry {
  private providers = new Map<string, Provider>();

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
  }

  /** Get a provider by explicit name */
  get(name: string): Provider | undefined {
    return this.providers.get(name);
  }

  /** Auto-detect provider from model name */
  getForModel(model: string): Provider {
    // Check model prefix map
    for (const [prefix, providerName] of Object.entries(MODEL_PROVIDER_MAP)) {
      if (model.startsWith(prefix)) {
        const provider = this.providers.get(providerName);
        if (provider) return provider;
      }
    }

    // Default: try anthropic, then openai, then ollama
    for (const name of ['anthropic', 'openai', 'ollama']) {
      const provider = this.providers.get(name);
      if (provider) return provider;
    }

    throw new Error(
      `No provider available for model "${model}". Configure an API key in ~/.my_local_ai/config.json or environment variables.`,
    );
  }

  /** List available provider names */
  list(): string[] {
    return Array.from(this.providers.keys());
  }
}
