import { readFileSync } from 'fs';
import { glob } from 'glob';
import { join } from 'path';
import type { Tool, ToolResult, ToolExecutionContext } from '../types.js';

export class GrepTool implements Tool {
  definition = {
    name: 'grep',
    description:
      'Search file contents using a regex pattern. Returns matching lines with file paths and line numbers.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Regular expression pattern to search for',
        },
        path: {
          type: 'string',
          description: 'File or directory to search in. Defaults to working directory.',
        },
        file_glob: {
          type: 'string',
          description: 'Glob pattern to filter files (e.g. "*.ts", "*.{js,jsx}")',
        },
        context: {
          type: 'number',
          description: 'Number of context lines before and after each match (default: 0)',
        },
      },
      required: ['pattern'],
    },
  };

  permissionLevel = 'safe' as const;

  async execute(
    input: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<ToolResult> {
    const pattern = input['pattern'] as string;
    const searchPath = (input['path'] as string) ?? ctx.workingDirectory;
    const fileGlob = (input['file_glob'] as string) ?? '**/*';
    const contextLines = (input['context'] as number) ?? 0;

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, 'g');
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `Invalid regex: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    try {
      const files = await glob(fileGlob, {
        cwd: searchPath,
        absolute: true,
        nodir: true,
        ignore: ['**/node_modules/**', '**/.git/**', '**/*.lock'],
      });

      const results: string[] = [];
      let matchCount = 0;
      const maxMatches = 500;

      for (const file of files) {
        if (matchCount >= maxMatches) break;

        let content: string;
        try {
          content = readFileSync(file, 'utf-8');
        } catch {
          continue; // Skip binary or unreadable files
        }

        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (matchCount >= maxMatches) break;

          const line = lines[i]!;
          regex.lastIndex = 0;
          if (regex.test(line)) {
            matchCount++;
            const start = Math.max(0, i - contextLines);
            const end = Math.min(lines.length - 1, i + contextLines);

            results.push(`${file}:${i + 1}:`);
            for (let j = start; j <= end; j++) {
              const prefix = j === i ? '>' : ' ';
              results.push(`${prefix} ${j + 1}\t${lines[j]}`);
            }
            results.push('');
          }
        }
      }

      if (results.length === 0) {
        return { success: true, output: 'No matches found.' };
      }

      let output = results.join('\n');
      if (matchCount >= maxMatches) {
        output += `\n(Showing first ${maxMatches} matches)`;
      }

      return { success: true, output };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
