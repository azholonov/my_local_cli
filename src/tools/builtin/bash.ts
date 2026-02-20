import { spawn } from 'child_process';
import type { Tool, ToolResult, ToolExecutionContext } from '../types.js';

const MAX_OUTPUT_LENGTH = 30000;

export class BashTool implements Tool {
  definition = {
    name: 'bash',
    description:
      'Execute a bash command and return stdout/stderr. Use this for running commands, git operations, npm, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The bash command to execute',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 120000, max: 600000)',
        },
      },
      required: ['command'],
    },
  };

  permissionLevel = 'ask' as const;

  async execute(
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const command = input['command'] as string;
    const timeout = Math.min((input['timeout'] as number) ?? 120_000, 600_000);

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';

      const proc = spawn('bash', ['-c', command], {
        cwd: context.workingDirectory,
        timeout,
        env: process.env,
        signal: context.abortSignal,
      });

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        let output = stdout;
        if (stderr) {
          output += (output ? '\n' : '') + `STDERR:\n${stderr}`;
        }

        // Truncate if too long
        if (output.length > MAX_OUTPUT_LENGTH) {
          output =
            output.slice(0, MAX_OUTPUT_LENGTH) +
            `\n\n... (truncated, ${output.length} total characters)`;
        }

        resolve({
          success: code === 0,
          output,
          error: code !== 0 ? `Exit code ${code}` : undefined,
        });
      });

      proc.on('error', (err) => {
        resolve({
          success: false,
          output: '',
          error: `Command failed: ${err.message}`,
        });
      });
    });
  }
}
