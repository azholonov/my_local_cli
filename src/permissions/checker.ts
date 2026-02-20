import type { PermissionDecision, PermissionRequest } from './types.js';
import type { PermissionLevel } from '../tools/types.js';

export class PermissionChecker {
  /** Tools the user has said "allow all" for this session */
  private sessionAllowed = new Set<string>();

  /** Check whether a tool call should proceed, be denied, or needs user approval */
  check(request: PermissionRequest): PermissionDecision {
    // Session-level override
    if (this.sessionAllowed.has(request.toolName)) {
      return 'allow';
    }

    // Check permission level
    switch (request.permissionLevel) {
      case 'safe':
        return 'allow';
      case 'ask':
        return 'ask';
      case 'dangerous':
        return 'deny';
    }
  }

  /** Grant session-level permission for a tool */
  allowForSession(toolName: string): void {
    this.sessionAllowed.add(toolName);
  }

  /** Revoke session-level permission */
  revokeForSession(toolName: string): void {
    this.sessionAllowed.delete(toolName);
  }

  /** Allow all tools for this session (trust mode) */
  allowAll(): void {
    this.sessionAllowed.add('*');
  }

  /** Check if all tools are allowed */
  isAllAllowed(): boolean {
    return this.sessionAllowed.has('*');
  }

  /** Override check: if '*' is in session allowed, always allow */
  checkWithWildcard(request: PermissionRequest): PermissionDecision {
    if (this.sessionAllowed.has('*')) return 'allow';
    return this.check(request);
  }
}
