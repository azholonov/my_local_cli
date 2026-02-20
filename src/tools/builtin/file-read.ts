import { readFileSync, existsSync } from 'fs';
import type { Tool, ToolResult, ToolExecutionContext } from '../types.js';

export class FileReadTool implements Tool {
  definition = {
    name: 'file_read',
    description:
      'Read the contents of a file. Returns the file content with line numbers.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute path to the file to read',
        },
        offset: {
          type: 'number',
          description: 'Line number to start reading from (1-based). Optional.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of lines to read. Optional, defaults to 2000.',
        },
      },
      required: ['file_path'],
    },
  };

  permissionLevel = 'safe' as const;

  async execute(
    input: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const filePath = input['file_path'] as string;
    const offset = (input['offset'] as number) ?? 1;
    const limit = (input['limit'] as number) ?? 2000;

    if (!existsSync(filePath)) {
      return { success: false, output: '', error: `File not found: ${filePath}` };
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const startIdx = Math.max(0, offset - 1);
      const endIdx = Math.min(lines.length, startIdx + limit);
      const selected = lines.slice(startIdx, endIdx);

      const numbered = selected
        .map((line, i) => {
          const lineNum = startIdx + i + 1;
          return `${String(lineNum).padStart(6)}\t${line}`;
        })
        .join('\n');

      return { success: true, output: numbered };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
