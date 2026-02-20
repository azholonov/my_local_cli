import { glob } from 'glob';
import type { Tool, ToolResult, ToolExecutionContext } from '../types.js';

export class GlobTool implements Tool {
  definition = {
    name: 'glob',
    description:
      'Find files matching a glob pattern. Returns matching file paths sorted by modification time.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The glob pattern to match (e.g. "**/*.ts", "src/**/*.tsx")',
        },
        path: {
          type: 'string',
          description: 'The directory to search in. Defaults to working directory.',
        },
      },
      required: ['pattern'],
    },
  };

  permissionLevel = 'safe' as const;

  async execute(
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const pattern = input['pattern'] as string;
    const searchPath = (input['path'] as string) ?? context.workingDirectory;

    try {
      const matches = await glob(pattern, {
        cwd: searchPath,
        absolute: true,
        nodir: true,
        ignore: ['**/node_modules/**', '**/.git/**'],
      });

      if (matches.length === 0) {
        return { success: true, output: 'No files found matching pattern.' };
      }

      return {
        success: true,
        output: matches.join('\n'),
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `Glob failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
