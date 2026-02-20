import type { Tool, ToolResult, ToolExecutionContext } from '../types.js';

const MAX_RESPONSE_LENGTH = 50000;

export class WebFetchTool implements Tool {
  definition = {
    name: 'web_fetch',
    description:
      'Fetch content from a URL. Returns the response body as text. Useful for reading web pages, APIs, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch',
        },
      },
      required: ['url'],
    },
  };

  permissionLevel = 'ask' as const;

  async execute(
    input: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const url = input['url'] as string;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'my-local-ai/0.1.0',
          Accept: 'text/html, application/json, text/plain, */*',
        },
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        return {
          success: false,
          output: '',
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      let body = await response.text();

      // Basic HTML to text conversion (strip tags)
      if (
        response.headers.get('content-type')?.includes('text/html')
      ) {
        body = body
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      if (body.length > MAX_RESPONSE_LENGTH) {
        body =
          body.slice(0, MAX_RESPONSE_LENGTH) +
          `\n\n... (truncated, ${body.length} total characters)`;
      }

      return { success: true, output: body };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `Fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
