import type { PermissionLevel } from '../tools/types.js';

export type PermissionDecision = 'allow' | 'deny' | 'ask';

export interface PermissionRequest {
  toolName: string;
  toolInput: Record<string, unknown>;
  permissionLevel: PermissionLevel;
}

export type { PermissionLevel };
