import type { Provider, ProviderMessage } from '../providers/types.js';

const COMPRESSION_PROMPT = `Summarize the following conversation concisely, preserving key context, decisions, and any important technical details that would be needed to continue the conversation. Focus on what was discussed and decided, not on the exact wording.`;

export class ConversationCompressor {
  constructor(private provider: Provider) {}

  /** Compress older messages into a summary, keeping recent messages intact */
  async compress(
    messages: ProviderMessage[],
    model: string,
    keepRecentCount = 4,
  ): Promise<ProviderMessage[]> {
    if (messages.length <= keepRecentCount) {
      return messages; // Nothing to compress
    }

    // Split into old messages (to compress) and recent messages (to keep)
    const oldMessages = messages.slice(0, messages.length - keepRecentCount);
    const recentMessages = messages.slice(messages.length - keepRecentCount);

    // Build a text representation of old messages for summarization
    const oldConversationText = oldMessages
      .map((m) => {
        const role = m.role.toUpperCase();
        const content =
          typeof m.content === 'string'
            ? m.content
            : m.content
                .filter((b) => b.type === 'text')
                .map((b) => b.text ?? '')
                .join('\n');
        return `[${role}]: ${content}`;
      })
      .join('\n\n');

    // Ask the provider to summarize
    const summaryResponse = await this.provider.complete(
      [
        {
          role: 'user',
          content: `${COMPRESSION_PROMPT}\n\n---\n\n${oldConversationText}`,
        },
      ],
      {
        model,
        maxTokens: 1024,
        temperature: 0,
      },
    );

    const summaryText =
      typeof summaryResponse.content === 'string'
        ? summaryResponse.content
        : summaryResponse.content
            .filter((b) => b.type === 'text')
            .map((b) => b.text ?? '')
            .join('');

    // Create compressed conversation: summary as first user message + recent messages
    const compressedMessages: ProviderMessage[] = [
      {
        role: 'user',
        content: `[Previous conversation summary]: ${summaryText}`,
      },
      {
        role: 'assistant',
        content: 'Understood. I have the context from our previous conversation. How can I help you?',
      },
      ...recentMessages,
    ];

    return compressedMessages;
  }
}
