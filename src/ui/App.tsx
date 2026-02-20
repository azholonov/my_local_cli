import React, { useState, useCallback } from 'react';
import { Text, Box, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { theme } from './theme.js';
import { StreamingText } from './components/StreamingText.js';
import { ToolCallDisplay } from './components/ToolCallDisplay.js';
import { StatusBar } from './components/StatusBar.js';
import { parseSlashCommand, getCommand } from '../commands/index.js';
import type { CommandContext } from '../commands/types.js';
import type { AgentLoop } from '../agent/loop.js';
import type { ProviderRegistry } from '../providers/registry.js';
import type { PermissionChecker } from '../permissions/index.js';
import type { ToolRegistry } from '../tools/index.js';

interface DisplayMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: Array<{
    toolName: string;
    toolCallId: string;
    input?: Record<string, unknown>;
    result?: { success: boolean; output: string; error?: string };
  }>;
}

interface AppProps {
  agentLoop: AgentLoop;
  model: string;
  provider: string;
  providerRegistry?: ProviderRegistry;
  permissionChecker?: PermissionChecker;
  toolRegistry?: ToolRegistry;
}

export function App({ agentLoop, model: initialModel, provider: initialProvider, providerRegistry }: AppProps) {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentModel, setCurrentModel] = useState(initialModel);
  const [currentProvider, setCurrentProvider] = useState(initialProvider);
  const [activeToolCalls, setActiveToolCalls] = useState<
    Map<
      string,
      {
        toolName: string;
        toolCallId: string;
        input?: Record<string, unknown>;
        result?: { success: boolean; output: string; error?: string };
      }
    >
  >(new Map());

  const commandContext: CommandContext = {
    model: currentModel,
    provider: currentProvider,
    setModel: (newModel: string) => {
      setCurrentModel(newModel);
      const modelEntry = providerRegistry?.getModelEntry(newModel);
      agentLoop.setModel(newModel, modelEntry?.maxTokens);
      // Try to switch provider if providerRegistry is available
      if (providerRegistry) {
        try {
          const newProvider = providerRegistry.getForModel(newModel);
          agentLoop.setProvider(newProvider);
          setCurrentProvider(newProvider.name);
        } catch {
          // Keep current provider if no match found
        }
      }
    },
    clearConversation: () => {
      setMessages([]);
      agentLoop.clearMessages();
    },
    compactConversation: async () => {
      // TODO: wire ConversationCompressor here
    },
    getMessageCount: () => agentLoop.getMessages().length,
    getModelCatalog: () => providerRegistry?.getModelCatalog() ?? {},
  };

  const handleSubmit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || isStreaming) return;
      setInput('');

      // Handle slash commands via the command registry
      const parsed = parseSlashCommand(trimmed);
      if (parsed) {
        const cmd = getCommand(parsed.name);
        if (cmd) {
          const result = await cmd.execute(parsed.args, commandContext);

          // Special exit token
          if (result === '__EXIT__') {
            exit();
            return;
          }

          // Show command output as a system message
          setMessages((prev) => [
            ...prev,
            { role: 'system', content: result },
          ]);
          return;
        }
      }

      // Regular message — send to agent
      setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
      setIsStreaming(true);
      setStreamingText('');
      setActiveToolCalls(new Map());

      let accumulatedText = '';
      const toolCallMap = new Map<
        string,
        {
          toolName: string;
          toolCallId: string;
          input?: Record<string, unknown>;
          result?: { success: boolean; output: string; error?: string };
        }
      >();

      try {
        for await (const event of agentLoop.runTurn(trimmed)) {
          switch (event.type) {
            case 'text_delta':
              accumulatedText += event.text;
              setStreamingText(accumulatedText);
              break;

            case 'tool_call_start':
              toolCallMap.set(event.toolCallId, {
                toolName: event.toolName,
                toolCallId: event.toolCallId,
              });
              setActiveToolCalls(new Map(toolCallMap));
              break;

            case 'tool_call_input': {
              const tc = toolCallMap.get(event.toolCallId);
              if (tc) {
                tc.input = event.input;
                setActiveToolCalls(new Map(toolCallMap));
              }
              break;
            }

            case 'tool_call_complete': {
              const tc = toolCallMap.get(event.toolCallId);
              if (tc) {
                tc.result = event.result;
                setActiveToolCalls(new Map(toolCallMap));
              }

              // When a tool completes, commit current text + tool calls as a message,
              // then reset for the next response segment
              if (accumulatedText || toolCallMap.size > 0) {
                setMessages((prev) => [
                  ...prev,
                  {
                    role: 'assistant',
                    content: accumulatedText,
                    toolCalls: Array.from(toolCallMap.values()),
                  },
                ]);
                accumulatedText = '';
                setStreamingText('');
                toolCallMap.clear();
                setActiveToolCalls(new Map());
              }
              break;
            }

            case 'turn_complete':
              // Commit any remaining text
              if (accumulatedText) {
                setMessages((prev) => [
                  ...prev,
                  { role: 'assistant', content: accumulatedText },
                ]);
              }
              break;

            case 'error':
              setMessages((prev) => [
                ...prev,
                {
                  role: 'assistant',
                  content: theme.error(`Error: ${event.error.message}`),
                },
              ]);
              break;
          }
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: theme.error(
              `Error: ${err instanceof Error ? err.message : String(err)}`,
            ),
          },
        ]);
      }

      setIsStreaming(false);
      setStreamingText('');
    },
    [agentLoop, isStreaming, exit, commandContext],
  );

  // Ctrl+C to exit
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <StatusBar model={currentModel} provider={currentProvider} isStreaming={isStreaming} />
      </Box>

      {/* Message history */}
      {messages.map((msg, i) => (
        <Box key={i} flexDirection="column" marginBottom={1}>
          <Text>
            {msg.role === 'user'
              ? theme.user('You: ')
              : msg.role === 'system'
                ? theme.system('System: ')
                : theme.assistant('AI: ')}
          </Text>
          {msg.content && <Text>{msg.content}</Text>}
          {msg.toolCalls?.map((tc, j) => (
            <ToolCallDisplay key={j} toolCall={tc} />
          ))}
        </Box>
      ))}

      {/* Streaming response */}
      {isStreaming && (
        <Box flexDirection="column" marginBottom={1}>
          <Text>{theme.assistant('AI: ')}</Text>
          {streamingText && <StreamingText text={streamingText} />}
          {Array.from(activeToolCalls.values()).map((tc, i) => (
            <ToolCallDisplay key={i} toolCall={tc} />
          ))}
          {!streamingText && activeToolCalls.size === 0 && (
            <Text>
              <Spinner type="dots" />{' '}
              <Text dimColor>Thinking...</Text>
            </Text>
          )}
        </Box>
      )}

      {/* Input */}
      <Box>
        <Text bold color="cyan">
          {'> '}
        </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder={isStreaming ? 'Waiting for response...' : 'Type a message...'}
        />
      </Box>
    </Box>
  );
}
