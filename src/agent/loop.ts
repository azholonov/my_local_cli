import type {
  Provider,
  ProviderMessage,
  ProviderOptions,
  StreamEvent,
  ContentBlock,
  ToolDefinition,
} from '../providers/types.js';
import type { AgentEvent, ToolCall, Message } from './types.js';

export interface AgentLoopOptions {
  provider: Provider;
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  toolDefinitions?: ToolDefinition[];
  onToolExecute?: (
    toolCall: ToolCall,
  ) => Promise<{ success: boolean; output: string; error?: string }>;
}

export class AgentLoop {
  private messages: ProviderMessage[] = [];
  private options: AgentLoopOptions;

  constructor(options: AgentLoopOptions) {
    this.options = options;
  }

  /** Get the conversation messages (for display) */
  getMessages(): ProviderMessage[] {
    return [...this.messages];
  }

  /** Clear conversation history */
  clearMessages(): void {
    this.messages = [];
  }

  /** Update the model at runtime */
  setModel(model: string, maxTokens?: number): void {
    this.options.model = model;
    if (maxTokens) {
      this.options.maxTokens = maxTokens;
    }
  }

  /** Update the provider at runtime */
  setProvider(provider: Provider): void {
    this.options.provider = provider;
  }

  /** Run a single turn: user sends a message, agent responds (possibly with tool calls) */
  async *runTurn(userMessage: string): AsyncIterable<AgentEvent> {
    // Add user message
    this.messages.push({ role: 'user', content: userMessage });

    // Loop until the agent produces a final text response (no more tool calls)
    let continueLoop = true;

    while (continueLoop) {
      continueLoop = false;

      const providerOptions: ProviderOptions = {
        model: this.options.model,
        maxTokens: this.options.maxTokens,
        temperature: this.options.temperature,
        systemPrompt: this.options.systemPrompt,
        tools: this.options.toolDefinitions,
      };

      // Accumulate the assistant response
      let textContent = '';
      const toolCalls: ToolCall[] = [];
      const toolCallInputs = new Map<string, string>(); // id -> accumulated JSON string

      try {
        for await (const event of this.options.provider.stream(
          this.messages,
          providerOptions,
        )) {
          switch (event.type) {
            case 'text_delta':
              textContent += event.text ?? '';
              yield { type: 'text_delta', text: event.text ?? '' };
              break;

            case 'tool_call_start':
              toolCallInputs.set(event.toolCallId ?? '', '');
              yield {
                type: 'tool_call_start',
                toolName: event.toolName ?? '',
                toolCallId: event.toolCallId ?? '',
              };
              break;

            case 'tool_call_delta': {
              const id = event.toolCallId ?? '';
              const current = toolCallInputs.get(id) ?? '';
              toolCallInputs.set(id, current + (event.inputDelta ?? ''));
              break;
            }

            case 'tool_call_end': {
              const id = event.toolCallId ?? '';
              const inputJson = toolCallInputs.get(id) ?? '{}';
              let input: Record<string, unknown> = {};
              try {
                input = JSON.parse(inputJson);
              } catch {
                input = {};
              }
              const tc: ToolCall = {
                id,
                name: event.toolName ?? '',
                input,
              };
              toolCalls.push(tc);
              yield { type: 'tool_call_input', toolCallId: id, input };
              break;
            }

            case 'error':
              yield { type: 'error', error: new Error(event.error ?? 'Provider error') };
              break;
          }
        }
      } catch (err) {
        yield { type: 'error', error: err instanceof Error ? err : new Error(String(err)) };
        return;
      }

      // Build the assistant message content blocks
      const contentBlocks: ContentBlock[] = [];
      if (textContent) {
        contentBlocks.push({ type: 'text', text: textContent });
      }
      for (const tc of toolCalls) {
        contentBlocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.input,
        });
      }

      // Add assistant message
      if (contentBlocks.length > 0) {
        this.messages.push({ role: 'assistant', content: contentBlocks });
      }

      // Execute tool calls if any
      if (toolCalls.length > 0 && this.options.onToolExecute) {
        const toolResultBlocks: ContentBlock[] = [];

        for (const tc of toolCalls) {
          const result = await this.options.onToolExecute(tc);
          toolResultBlocks.push({
            type: 'tool_result',
            toolUseId: tc.id,
            content: result.output,
            isError: !result.success,
          });
          yield {
            type: 'tool_call_complete',
            toolCallId: tc.id,
            result: {
              toolCallId: tc.id,
              success: result.success,
              output: result.output,
              error: result.error,
            },
          };
        }

        // Add tool results as a user message (Anthropic format)
        this.messages.push({ role: 'user', content: toolResultBlocks });

        // Continue the loop — the agent may want to make more tool calls or give a final answer
        continueLoop = true;
      }
    }

    yield { type: 'turn_complete' };
  }
}
