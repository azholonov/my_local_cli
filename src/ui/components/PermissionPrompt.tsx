import React, { useState } from 'react';
import { Text, Box, useInput } from 'ink';
import { theme } from '../theme.js';

interface PermissionPromptProps {
  toolName: string;
  toolInput: Record<string, unknown>;
  onDecision: (decision: 'allow' | 'allow_all' | 'deny') => void;
}

export function PermissionPrompt({
  toolName,
  toolInput,
  onDecision,
}: PermissionPromptProps) {
  const [selected, setSelected] = useState(0);
  const options = ['Allow', 'Allow All (this tool)', 'Deny'];

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelected((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelected((prev) => Math.min(options.length - 1, prev + 1));
    } else if (key.return) {
      const decisions = ['allow', 'allow_all', 'deny'] as const;
      onDecision(decisions[selected]!);
    }
  });

  // Show a summary of the tool input
  const inputSummary = JSON.stringify(toolInput, null, 2).slice(0, 300);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text>{theme.warning('Permission Required')}</Text>
      <Text>
        Tool: {theme.tool(toolName)}
      </Text>
      <Text dimColor>{inputSummary}</Text>
      <Box marginTop={1} flexDirection="column">
        {options.map((opt, i) => (
          <Text key={opt}>
            {i === selected ? theme.accent('> ') : '  '}
            {opt}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
