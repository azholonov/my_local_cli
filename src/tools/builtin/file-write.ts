import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { Tool, ToolResult, ToolExecutionContext } from '../types.js';

export class FileWriteTool implements Tool {
  definition = {
    name: 'file_write',
    description: 'Write content to a file. Creates the file if it does not exist, or overwrites it.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute path to the file to write',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file',
        },
      },
      required: ['file_path', 'content'],
    },
  };

  permissionLevel = 'ask' as const;

  async execute(
    input: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const filePath = input['file_path'] as string;
    const content = input['content'] as string;

    try {
      // Ensure parent directory exists
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, content, 'utf-8');
      return { success: true, output: `File written: ${filePath}` };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `Failed to write file: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
