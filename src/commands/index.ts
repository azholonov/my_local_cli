import type { SlashCommand, CommandContext } from './types.js';

export type { SlashCommand, CommandContext };

const commands = new Map<string, SlashCommand>();

function registerCommand(cmd: SlashCommand): void {
  commands.set(cmd.name, cmd);
}

export function getCommand(name: string): SlashCommand | undefined {
  return commands.get(name);
}

export function getAllCommands(): SlashCommand[] {
  return Array.from(commands.values());
}

export function isSlashCommand(input: string): boolean {
  return input.startsWith('/') && commands.has(input.split(' ')[0]!.slice(1));
}

export function parseSlashCommand(input: string): { name: string; args: string } | null {
  if (!input.startsWith('/')) return null;
  const parts = input.slice(1).split(' ');
  const name = parts[0]!;
  const args = parts.slice(1).join(' ');
  if (!commands.has(name)) return null;
  return { name, args };
}

// Register built-in commands

registerCommand({
  name: 'help',
  description: 'Show available commands',
  async execute() {
    const lines = ['Available commands:', ''];
    for (const cmd of commands.values()) {
      lines.push(`  /${cmd.name} - ${cmd.description}`);
    }
    return lines.join('\n');
  },
});

registerCommand({
  name: 'clear',
  description: 'Clear conversation history',
  async execute(_args, context) {
    context.clearConversation();
    return 'Conversation cleared.';
  },
});

registerCommand({
  name: 'model',
  description: 'Switch model (e.g. /model gpt-4o)',
  async execute(args, context) {
    if (!args.trim()) {
      return `Current model: ${context.model}`;
    }
    context.setModel(args.trim());
    return `Model switched to: ${args.trim()}`;
  },
});

registerCommand({
  name: 'models',
  description: 'List available models',
  async execute(_args, context) {
    const catalog = context.getModelCatalog();
    const lines: string[] = ['Available models:', ''];
    for (const [provider, models] of Object.entries(catalog)) {
      lines.push(`  ${provider}:`);
      for (const m of models) {
        const current = m.id === context.model ? ' (active)' : '';
        lines.push(`    ${m.id} - ${m.label}${current}`);
      }
      lines.push('');
    }
    lines.push('Switch with: /model <model-id>');
    lines.push('Add models in: ~/.my_local_ai/config.json → "models"');
    return lines.join('\n');
  },
});

registerCommand({
  name: 'compact',
  description: 'Compress conversation history to save context',
  async execute(_args, context) {
    await context.compactConversation();
    return 'Conversation compressed.';
  },
});

registerCommand({
  name: 'status',
  description: 'Show current session status',
  async execute(_args, context) {
    return [
      `Model: ${context.model}`,
      `Provider: ${context.provider}`,
      `Messages: ${context.getMessageCount()}`,
    ].join('\n');
  },
});

registerCommand({
  name: 'exit',
  description: 'Exit the application',
  async execute() {
    return '__EXIT__'; // Special token handled by the App
  },
});

registerCommand({
  name: 'quit',
  description: 'Exit the application',
  async execute() {
    return '__EXIT__';
  },
});
