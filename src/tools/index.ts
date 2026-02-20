export type { Tool, ToolResult, ToolExecutionContext, PermissionLevel } from './types.js';
export { ToolRegistry } from './registry.js';

// Built-in tools
export { FileReadTool } from './builtin/file-read.js';
export { FileWriteTool } from './builtin/file-write.js';
export { FileEditTool } from './builtin/file-edit.js';
export { BashTool } from './builtin/bash.js';
export { GlobTool } from './builtin/glob.js';
export { GrepTool } from './builtin/grep.js';
export { WebFetchTool } from './builtin/web-fetch.js';

import { ToolRegistry } from './registry.js';
import { FileReadTool } from './builtin/file-read.js';
import { FileWriteTool } from './builtin/file-write.js';
import { FileEditTool } from './builtin/file-edit.js';
import { BashTool } from './builtin/bash.js';
import { GlobTool } from './builtin/glob.js';
import { GrepTool } from './builtin/grep.js';
import { WebFetchTool } from './builtin/web-fetch.js';

/** Create a ToolRegistry pre-loaded with all built-in tools */
export function createBuiltinToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(new FileReadTool());
  registry.register(new FileWriteTool());
  registry.register(new FileEditTool());
  registry.register(new BashTool());
  registry.register(new GlobTool());
  registry.register(new GrepTool());
  registry.register(new WebFetchTool());
  return registry;
}
