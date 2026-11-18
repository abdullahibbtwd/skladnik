#!/usr/bin/env node
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const source = join(__dirname, '../src/mail/send-test-welcome.ts');
if (existsSync(source)) {
  process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS' });
  require('ts-node/register/transpile-only');
  require(source);
} else {
  require(join(__dirname, '../dist/mail/send-test-welcome.js'));
}
