export interface ProviderMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;       // tool_use id
  name?: string;     // tool name
  input?: Record<string, unknown>;
  toolUseId?: string; // for tool_result, references the tool_use id
  content?: string;   // tool_result content
  isError?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
}

export interface StreamEvent {
  type:
    | 'text_delta'
    | 'tool_call_start'
    | 'tool_call_delta'
    | 'tool_call_end'
    | 'message_end'
    | 'error';
  text?: string;
  toolCallId?: string;
  toolName?: string;
  inputDelta?: string; // partial JSON for tool input
  finishReason?: string;
  error?: string;
}

export interface ProviderOptions {
  model: string;
  maxTokens: number;
  temperature?: number;
  systemPrompt?: string;
  tools?: ToolDefinition[];
}

export interface Provider {
  readonly name: string;

  stream(
    messages: ProviderMessage[],
    options: ProviderOptions,
  ): AsyncIterable<StreamEvent>;

  /** Non-streaming completion (used for summarization, etc.) */
  complete(
    messages: ProviderMessage[],
    options: ProviderOptions,
  ): Promise<ProviderMessage>;
}
