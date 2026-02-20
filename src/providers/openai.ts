import OpenAI from 'openai';
import type {
  Provider,
  ProviderMessage,
  ProviderOptions,
  StreamEvent,
  ContentBlock,
} from './types.js';

export class OpenAIProvider implements Provider {
  readonly name = 'openai';
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async *stream(
    messages: ProviderMessage[],
    options: ProviderOptions,
  ): AsyncIterable<StreamEvent> {
    const openaiMessages = this.convertMessages(messages, options.systemPrompt);

    const stream = await this.client.chat.completions.create({
      model: options.model,
      max_tokens: options.maxTokens,
      temperature: options.temperature ?? 0,
      messages: openaiMessages,
      stream: true,
      ...(options.tools?.length
        ? {
            tools: options.tools.map((t) => ({
              type: 'function' as const,
              function: {
                name: t.name,
                description: t.description,
                parameters: t.inputSchema,
              },
            })),
          }
        : {}),
    });

    const activeToolCalls = new Map<
      number,
      { id: string; name: string; args: string }
    >();

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta;

      // Text content
      if (delta.content) {
        yield { type: 'text_delta', text: delta.content };
      }

      // Tool calls
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (tc.id && tc.function?.name) {
            // New tool call starting
            activeToolCalls.set(idx, {
              id: tc.id,
              name: tc.function.name,
              args: '',
            });
            yield {
              type: 'tool_call_start',
              toolCallId: tc.id,
              toolName: tc.function.name,
            };
          }

          if (tc.function?.arguments) {
            const entry = activeToolCalls.get(idx);
            if (entry) {
              entry.args += tc.function.arguments;
              yield {
                type: 'tool_call_delta',
                toolCallId: entry.id,
                inputDelta: tc.function.arguments,
              };
            }
          }
        }
      }

      // Finish
      if (choice.finish_reason) {
        // Emit tool_call_end for all active tool calls
        for (const [idx, entry] of activeToolCalls) {
          yield {
            type: 'tool_call_end',
            toolCallId: entry.id,
            toolName: entry.name,
          };
        }
        activeToolCalls.clear();

        yield { type: 'message_end', finishReason: choice.finish_reason };
      }
    }
  }

  async complete(
    messages: ProviderMessage[],
    options: ProviderOptions,
  ): Promise<ProviderMessage> {
    const openaiMessages = this.convertMessages(messages, options.systemPrompt);

    const response = await this.client.chat.completions.create({
      model: options.model,
      max_tokens: options.maxTokens,
      temperature: options.temperature ?? 0,
      messages: openaiMessages,
    });

    const text = response.choices[0]?.message?.content ?? '';
    return { role: 'assistant', content: text };
  }

  private convertMessages(
    messages: ProviderMessage[],
    systemPrompt?: string,
  ): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === 'system') {
        result.push({ role: 'system', content: this.textContent(msg) });
        continue;
      }

      if (typeof msg.content === 'string') {
        if (msg.role === 'user') {
          result.push({ role: 'user', content: msg.content });
        } else {
          result.push({ role: 'assistant', content: msg.content });
        }
      } else {
        // Handle content blocks
        const blocks = msg.content;

        // Check if this is an assistant message with tool_use blocks
        const toolUseBlocks = blocks.filter((b) => b.type === 'tool_use');
        if (msg.role === 'assistant' && toolUseBlocks.length > 0) {
          const textContent = blocks
            .filter((b) => b.type === 'text')
            .map((b) => b.text ?? '')
            .join('');

          result.push({
            role: 'assistant',
            content: textContent || null,
            tool_calls: toolUseBlocks.map((b) => ({
              id: b.id ?? '',
              type: 'function' as const,
              function: {
                name: b.name ?? '',
                arguments: JSON.stringify(b.input ?? {}),
              },
            })),
          });
        }

        // Check if this contains tool_result blocks (goes as 'tool' messages in OpenAI)
        const toolResultBlocks = blocks.filter(
          (b) => b.type === 'tool_result',
        );
        for (const tr of toolResultBlocks) {
          result.push({
            role: 'tool',
            tool_call_id: tr.toolUseId ?? '',
            content: tr.content ?? '',
          });
        }

        // Plain text blocks from user
        if (
          msg.role === 'user' &&
          toolUseBlocks.length === 0 &&
          toolResultBlocks.length === 0
        ) {
          const text = blocks
            .filter((b) => b.type === 'text')
            .map((b) => b.text ?? '')
            .join('');
          if (text) {
            result.push({ role: 'user', content: text });
          }
        }
      }
    }

    return result;
  }

  private textContent(msg: ProviderMessage): string {
    if (typeof msg.content === 'string') return msg.content;
    return msg.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');
  }
}
