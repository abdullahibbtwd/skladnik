process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', esModuleInterop: true });
require('ts-node/register/transpile-only');

const { readFileSync } = require('fs');
const { extname } = require('path');
const { extractDocumentFromImage } = require('../src/extraction/extract-document');

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run extract:image -- /path/to/invoice.jpg');
  process.exit(1);
}

const apiKey = (process.env.GLM_API_KEY ?? process.env.ZAI_API_KEY ?? '').trim();
if (!apiKey) {
  console.error('Set GLM_API_KEY or ZAI_API_KEY');
  process.exit(1);
}

const ext = extname(file).toLowerCase();
const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

extractDocumentFromImage({
  apiKey,
  baseUrl: process.env.GLM_BASE_URL ?? process.env.ZAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4',
  model: process.env.GLM_MODEL ?? process.env.ZAI_VISION_MODEL ?? 'glm-5v-turbo',
  image: readFileSync(file),
  mimeType: mime,
})
  .then((result) => {
    if (!result.ok) {
      console.error(result.error);
      process.exit(1);
    }
    console.log(JSON.stringify(result.data, null, 2));
    console.log(
      `\nlines=${result.data.lines.length} type=${result.data.documentType} confidence=${result.data.confidence}`,
    );
    console.log(`supplier=${result.data.supplier.name} taxId=${result.data.supplier.taxId}`);
    console.log(`client=${result.data.client.name} taxId=${result.data.client.taxId}`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
