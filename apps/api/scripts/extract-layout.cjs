/**
 * Test GLM-OCR layout_parsing without changing the production vision OCR path.
 *
 * Usage:
 *   npx dotenv -e .env -- npm run extract:layout --workspace=@skladnik/api -- <file-or-url> [raw|structured]
 *
 * raw         — Markdown + meta from /layout_parsing only
 * structured  — layout Markdown → ExtractedDocument JSON (needs local file)
 */

const { readFileSync } = require('fs');
const { extname } = require('path');

const fileArg = process.argv[2];
const mode = (process.argv[3] || 'raw').toLowerCase();

if (!fileArg) {
  console.error('Usage: npm run extract:layout -- </path/to/invoice.jpg|https://...> [raw|structured]');
  process.exit(1);
}

const apiKey = (process.env.GLM_API_KEY ?? process.env.ZAI_API_KEY ?? '').trim();
if (!apiKey) {
  console.error('Set GLM_API_KEY or ZAI_API_KEY in .env');
  process.exit(1);
}

const baseUrl = (process.env.GLM_BASE_URL ?? process.env.ZAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4').replace(/\/$/, '');
const isUrl = /^https?:\/\//i.test(fileArg);

function mimeFor(path) {
  const ext = extname(path).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.pdf') return 'application/pdf';
  return 'image/jpeg';
}

async function parseLayoutRaw(file) {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/layout_parsing`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept-Language': 'en-US,en',
    },
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({ model: 'glm-ocr', file }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error?.message ?? payload.msg ?? payload.message ?? `HTTP ${response.status}`;
    const code = payload.error?.code ?? payload.code;
    throw new Error(code == null ? message : `${code}: ${message}`);
  }
  return { payload, layoutMs: Date.now() - startedAt };
}

async function main() {
  if (mode === 'structured') {
    if (isUrl) {
      console.error('structured mode needs a local image/PDF path');
      process.exit(1);
    }
    process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
      module: 'CommonJS',
      esModuleInterop: true,
      ignoreDeprecations: '6.0',
    });
    require('ts-node/register/transpile-only');
    const { extractDocumentViaLayout } = require('../src/extraction/extract-document-layout');
    const result = await extractDocumentViaLayout({
      apiKey,
      baseUrl,
      model: process.env.GLM_MODEL ?? process.env.ZAI_VISION_MODEL ?? 'glm-5.3-flash',
      structureModel: process.env.GLM_LAYOUT_STRUCT_MODEL || 'glm-4.5-flash',
      image: readFileSync(fileArg),
      mimeType: mimeFor(fileArg),
      tuning: { effort: process.env.GLM_REASONING_EFFORT || 'low', compact: true },
    });
    if (!result.ok) {
      console.error(result.error);
      process.exit(1);
    }
    console.log(JSON.stringify(result.data, null, 2));
    console.log(`\nmodel=${result.model} lines=${result.data.lines.length}`);
    console.log(
      `layoutMs≈${result.timings.visionMs} structureMs≈${result.timings.prepareMs} outputTokens=${result.timings.outputTokens}`,
    );
    console.log(
      `supplier=${result.data.supplier.name} taxId=${result.data.supplier.taxId} doc#=${result.data.documentNumber} date=${result.data.issuedOn}`,
    );
    return;
  }

  const file = isUrl
    ? fileArg
    : `data:${mimeFor(fileArg)};base64,${readFileSync(fileArg).toString('base64')}`;

  const { payload, layoutMs } = await parseLayoutRaw(file);
  console.log('--- md_results ---');
  console.log(payload.md_results || '(empty)');
  console.log('\n--- meta ---');
  console.log(
    JSON.stringify(
      {
        id: payload.id,
        model: payload.model,
        layoutMs,
        pages: payload.data_info,
        usage: payload.usage,
        layoutBlocks: payload.layout_details?.flat?.()?.length ?? 0,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
