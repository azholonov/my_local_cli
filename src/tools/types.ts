import type { ToolDefinition } from '../providers/types.js';

export type PermissionLevel = 'safe' | 'ask' | 'dangerous';

export interface ToolExecutionContext {
  workingDirectory: string;
  abortSignal?: AbortSignal;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface Tool {
  definition: ToolDefinition;
  permissionLevel: PermissionLevel;
  execute(
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult>;
}

export type { ToolDefinition };
