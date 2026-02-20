import Anthropic from '@anthropic-ai/sdk';
import type {
  Provider,
  ProviderMessage,
  ProviderOptions,
  StreamEvent,
  ContentBlock,
} from './types.js';

export class AnthropicProvider implements Provider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async *stream(
    messages: ProviderMessage[],
    options: ProviderOptions,
  ): AsyncIterable<StreamEvent> {
    const anthropicMessages = this.convertMessages(messages);

    const stream = this.client.messages.stream({
      model: options.model,
      max_tokens: options.maxTokens,
      temperature: options.temperature ?? 0,
      ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
      messages: anthropicMessages,
      ...(options.tools?.length
        ? {
            tools: options.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
            })),
          }
        : {}),
    });

    let currentToolId: string | undefined;
    let currentToolName: string | undefined;

    for await (const event of stream) {
      switch (event.type) {
        case 'content_block_start': {
          const block = event.content_block;
          if (block.type === 'tool_use') {
            currentToolId = block.id;
            currentToolName = block.name;
            yield {
              type: 'tool_call_start',
              toolCallId: block.id,
              toolName: block.name,
            };
          }
          break;
        }

        case 'content_block_delta': {
          const delta = event.delta;
          if (delta.type === 'text_delta') {
            yield { type: 'text_delta', text: delta.text };
          } else if (delta.type === 'input_json_delta') {
            yield {
              type: 'tool_call_delta',
              toolCallId: currentToolId,
              inputDelta: delta.partial_json,
            };
          }
          break;
        }

        case 'content_block_stop': {
          if (currentToolId) {
            yield {
              type: 'tool_call_end',
              toolCallId: currentToolId,
              toolName: currentToolName,
            };
            currentToolId = undefined;
            currentToolName = undefined;
          }
          break;
        }

        case 'message_stop': {
          yield { type: 'message_end' };
          break;
        }
      }
    }
  }

  async complete(
    messages: ProviderMessage[],
    options: ProviderOptions,
  ): Promise<ProviderMessage> {
    const anthropicMessages = this.convertMessages(messages);

    const response = await this.client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens,
      temperature: options.temperature ?? 0,
      ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
      messages: anthropicMessages,
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return { role: 'assistant', content: text };
  }

  private convertMessages(
    messages: ProviderMessage[],
  ): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        // Anthropic handles system prompt separately — skip here
        continue;
      }

      if (typeof msg.content === 'string') {
        result.push({ role: msg.role, content: msg.content });
      } else {
        // Convert ContentBlock[] to Anthropic's content format
        const blocks = msg.content.map((block) =>
          this.convertBlock(block, msg.role),
        );
        result.push({
          role: msg.role,
          content: blocks as Anthropic.ContentBlockParam[],
        });
      }
    }

    return result;
  }

  private convertBlock(
    block: ContentBlock,
    role: string,
  ): Anthropic.ContentBlockParam {
    switch (block.type) {
      case 'text':
        return { type: 'text', text: block.text ?? '' };

      case 'tool_use':
        return {
          type: 'tool_use',
          id: block.id ?? '',
          name: block.name ?? '',
          input: block.input ?? {},
        };

      case 'tool_result':
        return {
          type: 'tool_result',
          tool_use_id: block.toolUseId ?? '',
          content: block.content ?? '',
          ...(block.isError ? { is_error: true } : {}),
        };

      default:
        return { type: 'text', text: '' };
    }
  }
}
