import { Ollama } from 'ollama';
import type {
  Provider,
  ProviderMessage,
  ProviderOptions,
  StreamEvent,
} from './types.js';

export class OllamaProvider implements Provider {
  readonly name = 'ollama';
  private client: Ollama;

  constructor(host?: string) {
    this.client = new Ollama({ host: host ?? 'http://localhost:11434' });
  }

  async *stream(
    messages: ProviderMessage[],
    options: ProviderOptions,
  ): AsyncIterable<StreamEvent> {
    const ollamaMessages = this.convertMessages(messages, options.systemPrompt);

    const response = await this.client.chat({
      model: options.model,
      messages: ollamaMessages,
      stream: true,
      options: {
        temperature: options.temperature ?? 0,
        num_predict: options.maxTokens,
      },
      ...(options.tools?.length
        ? {
            tools: options.tools.map((t) => ({
              type: 'function' as const,
              function: {
                name: t.name,
                description: t.description,
                parameters: {
                  type: 'object' as const,
                  ...t.inputSchema,
                },
              },
            })),
          }
        : {}),
    });

    let toolCallIndex = 0;

    for await (const chunk of response) {
      // Text content
      if (chunk.message.content) {
        yield { type: 'text_delta', text: chunk.message.content };
      }

      // Tool calls (Ollama returns them in the message)
      if (chunk.message.tool_calls) {
        for (const tc of chunk.message.tool_calls) {
          const callId = `ollama-tc-${toolCallIndex++}`;
          yield {
            type: 'tool_call_start',
            toolCallId: callId,
            toolName: tc.function.name,
          };
          yield {
            type: 'tool_call_delta',
            toolCallId: callId,
            inputDelta: JSON.stringify(tc.function.arguments),
          };
          yield {
            type: 'tool_call_end',
            toolCallId: callId,
            toolName: tc.function.name,
          };
        }
      }

      // Done
      if (chunk.done) {
        yield { type: 'message_end' };
      }
    }
  }

  async complete(
    messages: ProviderMessage[],
    options: ProviderOptions,
  ): Promise<ProviderMessage> {
    const ollamaMessages = this.convertMessages(messages, options.systemPrompt);

    const response = await this.client.chat({
      model: options.model,
      messages: ollamaMessages,
      stream: false,
      options: {
        temperature: options.temperature ?? 0,
        num_predict: options.maxTokens,
      },
    });

    return { role: 'assistant', content: response.message.content };
  }

  private convertMessages(
    messages: ProviderMessage[],
    systemPrompt?: string,
  ): Array<{ role: string; content: string }> {
    const result: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        result.push({ role: msg.role, content: msg.content });
      } else {
        // Flatten content blocks to text for Ollama
        const text = msg.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text ?? '')
          .join('');
        if (text) {
          result.push({ role: msg.role, content: text });
        }

        // Handle tool results
        const toolResults = msg.content.filter(
          (b) => b.type === 'tool_result',
        );
        for (const tr of toolResults) {
          result.push({ role: 'tool', content: tr.content ?? '' });
        }
      }
    }

    return result;
  }
}
