#!/usr/bin/env node
const { existsSync } = require('node:fs');
const { join } = require('node:path');

// Local: TypeScript via ts-node. Docker/Coolify: compiled dist only.
const source = join(__dirname, '../src/platform-auth/create-platform-admin.ts');
if (existsSync(source)) {
  process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS' });
  require('ts-node/register/transpile-only');
  require(source);
} else {
  require(join(__dirname, '../dist/platform-auth/create-platform-admin.js'));
}
