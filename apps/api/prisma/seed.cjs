const { existsSync } = require('node:fs');
const { join } = require('node:path');

// The Docker image ships only dist/ (no src/, no tsconfig), so it runs the compiled seed without ts-node.
const source = join(__dirname, '../src/seed/run.ts');
if (existsSync(source)) {
  process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS' });
  require('ts-node/register/transpile-only');
  require(source);
} else {
  require(join(__dirname, '../dist/seed/run.js'));
}
