#!/usr/bin/env npx tsx
import 'dotenv/config';
import { Command } from 'commander';
import { APP_NAME, APP_VERSION } from '../src/constants.js';
import { startApp } from '../src/index.js';

const program = new Command();

program
  .name(APP_NAME)
  .description('AI agent CLI with multi-provider support')
  .version(APP_VERSION)
  .option('-m, --model <model>', 'model to use')
  .option('-p, --provider <provider>', 'provider (anthropic, openai, ollama)')
  .action(async (options) => {
    await startApp({
      model: options.model,
      provider: options.provider,
    });
  });

program.parse();
