import { existsSync } from 'node:fs';
import { join } from 'node:path';

// The Docker image ships only dist/, not src/, so fall back to the compiled seed there.
const source = join(__dirname, '../src/seed/run.ts');
require(existsSync(source) ? source : join(__dirname, '../dist/seed/run.js'));
