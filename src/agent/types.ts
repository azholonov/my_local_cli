import type { ContentBlock } from '../providers/types.js';

export type AgentMode = 'chat' | 'plan';

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  success: boolean;
  output: string;
  error?: string;
}

export type AgentEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call_start'; toolName: string; toolCallId: string }
  | { type: 'tool_call_input'; toolCallId: string; input: Record<string, unknown> }
  | { type: 'tool_call_complete'; toolCallId: string; result: ToolResult }
  | { type: 'permission_required'; toolCall: ToolCall; resolve: (approved: boolean) => void }
  | { type: 'turn_complete' }
  | { type: 'error'; error: Error };

export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
  timestamp: number;
}
