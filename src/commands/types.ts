export interface CommandContext {
  model: string;
  provider: string;
  setModel: (model: string) => void;
  clearConversation: () => void;
  compactConversation: () => Promise<void>;
  getMessageCount: () => number;
  getModelCatalog: () => Record<string, Array<{ id: string; label: string }>>;
}

export interface SlashCommand {
  name: string;
  description: string;
  execute(args: string, context: CommandContext): Promise<string>;
}
