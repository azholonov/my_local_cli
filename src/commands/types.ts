export interface CommandContext {
  model: string;
  provider: string;
  setModel: (model: string) => void;
  clearConversation: () => void;
  compactConversation: () => Promise<void>;
  getMessageCount: () => number;
}

export interface SlashCommand {
  name: string;
  description: string;
  execute(args: string, context: CommandContext): Promise<string>;
}
