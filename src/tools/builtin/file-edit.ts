import { readFileSync, writeFileSync, existsSync } from 'fs';
import type { Tool, ToolResult, ToolExecutionContext } from '../types.js';

export class FileEditTool implements Tool {
  definition = {
    name: 'file_edit',
    description:
      'Edit a file by replacing an exact string match with new content. The old_string must be unique in the file.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute path to the file to edit',
        },
        old_string: {
          type: 'string',
          description: 'The exact string to find and replace',
        },
        new_string: {
          type: 'string',
          description: 'The replacement string',
        },
        replace_all: {
          type: 'boolean',
          description: 'Replace all occurrences (default: false)',
        },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
  };

  permissionLevel = 'ask' as const;

  async execute(
    input: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const filePath = input['file_path'] as string;
    const oldString = input['old_string'] as string;
    const newString = input['new_string'] as string;
    const replaceAll = (input['replace_all'] as boolean) ?? false;

    if (!existsSync(filePath)) {
      return { success: false, output: '', error: `File not found: ${filePath}` };
    }

    try {
      let content = readFileSync(filePath, 'utf-8');

      if (!content.includes(oldString)) {
        return {
          success: false,
          output: '',
          error: `old_string not found in file. Make sure it matches exactly.`,
        };
      }

      if (!replaceAll) {
        // Check uniqueness
        const count = content.split(oldString).length - 1;
        if (count > 1) {
          return {
            success: false,
            output: '',
            error: `old_string appears ${count} times in the file. Provide more context to make it unique, or set replace_all to true.`,
          };
        }
      }

      if (replaceAll) {
        content = content.split(oldString).join(newString);
      } else {
        content = content.replace(oldString, newString);
      }

      writeFileSync(filePath, content, 'utf-8');
      return { success: true, output: `File edited: ${filePath}` };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `Failed to edit file: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
