import React from 'react';
import { Text, Box } from 'ink';
import { theme } from '../theme.js';

interface StatusBarProps {
  model: string;
  provider: string;
  isStreaming: boolean;
}

export function StatusBar({ model, provider, isStreaming }: StatusBarProps) {
  return (
    <Box>
      <Text dimColor>
        [{provider}:{model}]
        {isStreaming ? theme.accent(' streaming...') : ''}
      </Text>
    </Box>
  );
}
