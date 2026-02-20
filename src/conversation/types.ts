import type { ProviderMessage } from '../providers/types.js';

export interface ConversationSession {
  id: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  messages: ProviderMessage[];
}
