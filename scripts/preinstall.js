#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Check if using pnpm
const userAgent = process.env.npm_config_user_agent || '';
if (!userAgent.includes('pnpm')) {
  console.error('\n\x1b[31m\x1b[1mError: This project requires pnpm\x1b[22m\n');
  console.error('Please install dependencies using:');
  console.error('  \x1b[36mpnpm install\x1b[0m\n');
  console.error('To set up pnpm, run:');
  console.error('  \x1b[36mnpm install -g corepack && corepack enable\x1b[0m\n');
  process.exit(1);
}

// Check if running from workspace root
let dir = process.cwd();
while (dir !== path.parse(dir).root) {
  if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
    if (dir !== process.cwd()) {
      console.error('\n\x1b[31mError: Please run \x1b[1mpnpm install\x1b[22m from the workspace root, not from a workspace package.\x1b[0m\n');
      process.exit(1);
    }
    break;
  }
  dir = path.dirname(dir);
}
