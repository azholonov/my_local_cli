import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { SESSIONS_DIR } from '../constants.js';
import type { ProviderMessage } from '../providers/types.js';
import type { ConversationSession } from './types.js';

export class ConversationHistory {
  private session: ConversationSession;

  constructor(model: string) {
    this.session = {
      id: this.generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model,
      messages: [],
    };
  }

  get messages(): ProviderMessage[] {
    return this.session.messages;
  }

  get sessionId(): string {
    return this.session.id;
  }

  addMessage(message: ProviderMessage): void {
    this.session.messages.push(message);
    this.session.updatedAt = Date.now();
  }

  clear(): void {
    this.session.messages = [];
    this.session.updatedAt = Date.now();
  }

  /** Replace all messages (used after compression) */
  setMessages(messages: ProviderMessage[]): void {
    this.session.messages = messages;
    this.session.updatedAt = Date.now();
  }

  /** Save session to disk */
  save(): void {
    if (!existsSync(SESSIONS_DIR)) {
      mkdirSync(SESSIONS_DIR, { recursive: true });
    }
    const filePath = join(SESSIONS_DIR, `${this.session.id}.json`);
    writeFileSync(filePath, JSON.stringify(this.session, null, 2), 'utf-8');
  }

  /** Load a session from disk */
  static load(sessionId: string): ConversationHistory | null {
    const filePath = join(SESSIONS_DIR, `${sessionId}.json`);
    if (!existsSync(filePath)) return null;

    try {
      const raw = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw) as ConversationSession;
      const history = new ConversationHistory(data.model);
      history.session = data;
      return history;
    } catch {
      return null;
    }
  }

  /** List recent sessions */
  static listRecent(limit = 10): Array<{ id: string; updatedAt: number; model: string }> {
    if (!existsSync(SESSIONS_DIR)) return [];

    const files = readdirSync(SESSIONS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const raw = readFileSync(join(SESSIONS_DIR, f), 'utf-8');
          const data = JSON.parse(raw) as ConversationSession;
          return { id: data.id, updatedAt: data.updatedAt, model: data.model };
        } catch {
          return null;
        }
      })
      .filter((s): s is { id: string; updatedAt: number; model: string } => s !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);

    return files;
  }

  private generateId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
