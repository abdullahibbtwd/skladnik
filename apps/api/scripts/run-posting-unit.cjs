process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS' });
require('ts-node/register/transpile-only');

(async () => {
  require('../src/documents/can-document-be-posted.test.ts');
  await require('../src/documents/pdf-to-images.test.ts');
  require('../src/extraction/extracted-document.schema.test.ts');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

