import { homedir } from 'os';
import { join } from 'path';

export const APP_NAME = 'my-local-ai';
export const APP_VERSION = '0.1.0';

export const CONFIG_DIR = join(homedir(), '.my_local_ai');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
export const SESSIONS_DIR = join(CONFIG_DIR, 'sessions');

export const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
export const DEFAULT_MAX_TOKENS = 8192;
export const DEFAULT_TEMPERATURE = 0;

export const CONTEXT_COMPRESSION_THRESHOLD = 0.8; // Compress at 80% of context window
