import React from 'react';
import { Text, Box } from 'ink';
import { theme } from '../theme.js';

interface ToolCallInfo {
  toolName: string;
  toolCallId: string;
  input?: Record<string, unknown>;
  result?: {
    success: boolean;
    output: string;
    error?: string;
  };
}

interface ToolCallDisplayProps {
  toolCall: ToolCallInfo;
}

export function ToolCallDisplay({ toolCall }: ToolCallDisplayProps) {
  return (
    <Box flexDirection="column" marginLeft={2}>
      <Text>
        {theme.tool(`> ${toolCall.toolName}`)}
        {toolCall.input && (
          <Text dimColor>
            {' '}
            {JSON.stringify(toolCall.input).slice(0, 100)}
            {JSON.stringify(toolCall.input).length > 100 ? '...' : ''}
          </Text>
        )}
      </Text>
      {toolCall.result && (
        <Text dimColor wrap="truncate-end">
          {toolCall.result.success
            ? toolCall.result.output.slice(0, 200)
            : theme.error(toolCall.result.error ?? 'Error')}
        </Text>
      )}
    </Box>
  );
}
