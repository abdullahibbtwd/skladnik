// Measures AI reading time and accuracy over a set of invoice photos (audit F-17: target under 20 s).
//
//   node scripts/bench-extraction.cjs export --out=../../.tmp-ocr/bench            # capture photos from DATABASE_URL + MinIO
//   node scripts/bench-extraction.cjs run --dir=../../.tmp-ocr/bench --label=baseline
//   node scripts/bench-extraction.cjs run --dir=… --label=small --max-edge=1600 --quality=85 --effort=low \
//     [--model=glm-5.3-flash] [--header-model=glm-5.3-flashx] [--limit=20]
//   node scripts/bench-extraction.cjs run --dir=… --variants="now:quality=1;low:quality=85,effort=low"   # interleaved
//   node scripts/bench-extraction.cjs compare --baseline=baseline --against=small
//
// Settings come from the repo's .env (GLM_API_KEY/ZAI_API_KEY, GLM_MODEL, MINIO_*, DATABASE_URL) unless already set.
// Results go to .tmp-ocr/bench-results/<label>.json; the photos are real invoices, keep them out of git.
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', esModuleInterop: true });
require('ts-node/register/transpile-only');

const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const RESULTS = path.join(ROOT, '.tmp-ocr/bench-results');

for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
}

const [command, ...rest] = process.argv.slice(2);
const args = Object.fromEntries(
  rest.map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.length ? value.join('=') : 'true'];
  }),
);

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

const seconds = (ms) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`);

async function exportCaptures() {
  const { S3Client, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
  const out = path.resolve(args.out ?? path.join(ROOT, '.tmp-ocr/bench'));
  fs.mkdirSync(out, { recursive: true });
  const bucket = process.env.MINIO_BUCKET ?? 'invoices';
  const s3 = new S3Client({
    region: 'us-east-1',
    endpoint: `${process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http'}://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`,
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.MINIO_ACCESS_KEY, secretAccessKey: process.env.MINIO_SECRET_KEY },
  });
  const keys = [];
  let token;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
    keys.push(...(page.Contents ?? []).map((object) => object.Key).filter((key) => MIME[path.extname(key).toLowerCase()]));
    token = page.NextContinuationToken;
  } while (token);

  const seen = new Set();
  let written = 0;
  for (const key of keys) {
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const buffer = Buffer.from(await object.Body.transformToByteArray());
    const hash = createHash('sha256').update(buffer).digest('hex');
    if (seen.has(hash)) continue;
    seen.add(hash);
    fs.writeFileSync(path.join(out, `${hash.slice(0, 16)}${path.extname(key).toLowerCase()}`), buffer);
    written += 1;
  }
  console.log(`Exported ${written} distinct photo(s) of ${keys.length} image object(s) to ${out}`);
}

/** "max-edge=1280,effort=low,model=…" (or the matching --flags) → { model, tuning }. */
function variantSettings(options) {
  return {
    model: options.model ?? process.env.GLM_MODEL ?? 'glm-5.3-flash',
    tuning: {
      ...(options['max-edge'] ? { maxEdge: Number(options['max-edge']) } : {}),
      ...(options.quality ? { quality: Number(options.quality) } : {}),
      ...(options.effort ? { effort: options.effort } : {}),
      ...(options.compact ? { compact: options.compact !== 'off' } : {}),
      ...(options['header-model'] ? { headerModel: options['header-model'] } : {}),
    },
  };
}

function summary(label, results) {
  const times = results.filter((row) => row.ok).map((row) => row.ms).sort((a, b) => a - b);
  const mean = times.length ? times.reduce((sum, ms) => sum + ms, 0) / times.length : null;
  const retries = results.reduce((sum, row) => sum + (row.retries ?? 0), 0);
  return (
    `${label}: ${times.length}/${results.length} read · p50 ${seconds(percentile(times, 50))} · p95 ${seconds(percentile(times, 95))}` +
    ` · mean ${seconds(mean)} · max ${seconds(times.at(-1) ?? null)} · under 20s ${times.filter((ms) => ms < 20_000).length}/${times.length}` +
    ` · overload retries ${retries}`
  );
}

const OVERLOADED = /\b(1302|1305)\b|overloaded|rate limit/i;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reads one photo, retrying when the provider says it is overloaded. `ms` is the attempt that
 * answered; the waits are reported as retries, since they measure the provider, not our settings.
 */
async function readOnce(file, settings) {
  const { extractDocumentFromImage } = require('../src/extraction/extract-document');
  let retries = 0;
  for (;;) {
    const startedAt = Date.now();
    const result = await extractDocumentFromImage({
      apiKey: (process.env.GLM_API_KEY ?? process.env.ZAI_API_KEY ?? '').trim(),
      baseUrl: process.env.GLM_BASE_URL ?? process.env.ZAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4',
      model: settings.model,
      image: fs.readFileSync(file),
      mimeType: MIME[path.extname(file).toLowerCase()],
      tuning: settings.tuning,
    });
    const ms = Date.now() - startedAt;
    if (!result.ok && OVERLOADED.test(result.error) && retries < 4) {
      retries += 1;
      await sleep(5000 * retries);
      continue;
    }
    return result.ok
      ? { file, ok: true, ms, retries, ...result.timings, model: result.model, lines: result.data.lines.length, data: result.data }
      : { file, ok: false, ms, retries, error: result.error };
  }
}

/**
 * One label, or several with --variants="a:quality=85;b:quality=85,max-edge=1280,effort=low".
 * Variants take turns on each photo (order rotated), so a slow patch at the provider hits all of them.
 */
async function run() {
  const dirs = (args.dir ?? path.join(ROOT, '.tmp-ocr/bench')).split(',').map((dir) => path.resolve(dir));
  const files = dirs
    .flatMap((dir) => fs.readdirSync(dir).filter((file) => MIME[path.extname(file).toLowerCase()]).map((file) => path.join(dir, file)))
    .sort()
    .slice(0, Number(args.limit ?? 1000));
  const variants = args.variants
    ? args.variants.split(';').map((spec) => {
        const [label, options = ''] = spec.split(':');
        const parsed = Object.fromEntries(options.split(',').filter(Boolean).map((pair) => pair.split('=')));
        return { label, ...variantSettings(parsed), results: [] };
      })
    : [{ label: args.label ?? 'run', ...variantSettings(args), results: [] }];
  for (const variant of variants) {
    console.log(`${variant.label}: ${files.length} photo(s), model ${variant.model}, tuning ${JSON.stringify(variant.tuning)}`);
  }

  fs.mkdirSync(RESULTS, { recursive: true });
  for (const [index, file] of files.entries()) {
    const order = variants.map((_, i) => variants[(i + index) % variants.length]);
    for (const variant of order) {
      const row = await readOnce(file, variant);
      variant.results.push(row);
      console.log(
        `  ${path.basename(file).slice(0, 20).padEnd(20)} ${variant.label.padEnd(10)} ${seconds(row.ms).padStart(6)}` +
          `${row.retries ? ` (${row.retries} retr${row.retries === 1 ? 'y' : 'ies'})` : ''}  ` +
          `${row.ok ? `${row.lines} lines, ${row.imageBytes} B ${row.width}×${row.height}, ${row.outputTokens ?? '?'} tok (${row.reasoningTokens ?? '?'} reasoning)` : `FAILED ${row.error}`}`,
      );
      const { results, label, model, tuning } = variant;
      fs.writeFileSync(path.join(RESULTS, `${label}.json`), JSON.stringify({ label, model, tuning, results }, null, 2));
    }
  }
  console.log('');
  for (const variant of variants) console.log(summary(variant.label, variant.results));
}

const norm = (value) => (value === null || value === undefined ? null : String(value).trim().toLowerCase().replace(/\s+/g, ' '));
const sameNumber = (a, b) => (a === null && b === null) || (a !== null && b !== null && Math.abs(Number(a) - Number(b)) < 0.005);

function compare() {
  const load = (label) => JSON.parse(fs.readFileSync(path.join(RESULTS, `${label}.json`), 'utf8'));
  const base = load(args.baseline ?? 'baseline');
  const other = load(args.against);
  const byFile = new Map(other.results.map((row) => [row.file, row]));
  const score = { docs: 0, header: 0, headerFields: 0, lineCount: 0, lines: 0, lineFields: 0 };
  for (const a of base.results) {
    const b = byFile.get(a.file);
    if (!a.ok || !b?.ok) continue;
    score.docs += 1;
    const headers = [
      [a.data.documentNumber, b.data.documentNumber],
      [a.data.issuedOn, b.data.issuedOn],
      [a.data.supplier.taxId, b.data.supplier.taxId],
      [a.data.client.taxId, b.data.client.taxId],
    ];
    const numbers = [
      [a.data.taxableBase, b.data.taxableBase],
      [a.data.grossTotal, b.data.grossTotal],
    ];
    score.headerFields += headers.length + numbers.length;
    score.header += headers.filter(([x, y]) => norm(x) === norm(y)).length + numbers.filter(([x, y]) => sameNumber(x, y)).length;
    if (a.data.lines.length === b.data.lines.length) score.lineCount += 1;
    a.data.lines.forEach((line, index) => {
      const peer = b.data.lines[index];
      score.lineFields += 3;
      if (!peer) return;
      score.lines += [sameNumber(line.qty, peer.qty), sameNumber(line.unitPrice, peer.unitPrice), sameNumber(line.lineTotal, peer.lineTotal)].filter(Boolean).length;
    });
  }
  const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '—');
  console.log(`${other.label} vs ${base.label} over ${score.docs} document(s) both read:`);
  console.log(`  header fields agree ${pct(score.header, score.headerFields)} · same line count ${pct(score.lineCount, score.docs)} · qty/price/total agree ${pct(score.lines, score.lineFields)}`);
}

/** Scores a run against the <photo>.truth.json answers written by make-bench-invoices.cjs. */
function truth() {
  const runResult = JSON.parse(fs.readFileSync(path.join(RESULTS, `${args.label}.json`), 'utf8'));
  const s = { docs: 0, failed: 0, header: 0, headerFields: 0, lineCount: 0, lineFields: 0, lineOk: 0, batchFields: 0, batchOk: 0, names: 0, cleanNames: 0 };
  for (const row of runResult.results) {
    const truthFile = row.file.replace(/\.[a-z]+$/i, '.truth.json');
    if (!fs.existsSync(truthFile)) continue;
    const t = JSON.parse(fs.readFileSync(truthFile, 'utf8'));
    s.docs += 1;
    if (!row.ok) {
      s.failed += 1;
      continue;
    }
    const d = row.data;
    const checks = [
      norm(d.documentNumber) === norm(t.documentNumber),
      d.issuedOn === t.issuedOn,
      norm(d.supplier.taxId)?.replace(/^bg/, '') === t.supplier.taxId,
      norm(d.client.taxId)?.replace(/^bg/, '') === t.client.taxId,
      sameNumber(d.taxableBase, t.taxableBase),
      sameNumber(d.vatAmount, t.vatAmount),
      sameNumber(d.grossTotal, t.grossTotal),
      d.paymentMethod === t.paymentMethod,
    ];
    s.headerFields += checks.length;
    s.header += checks.filter(Boolean).length;
    if (d.lines.length === t.lines.length) s.lineCount += 1;
    t.lines.forEach((expected, index) => {
      const line = d.lines[index];
      s.lineFields += 3;
      s.batchFields += 2;
      s.names += 1;
      if (!line) return;
      const price = line.unitPrice ?? line.finalUnitPrice;
      s.lineOk += [sameNumber(line.qty, expected.qty), sameNumber(price, expected.unitPrice), sameNumber(line.lineTotal, expected.lineTotal)].filter(Boolean).length;
      s.batchOk += [norm(line.ocrBatchNumber) === norm(expected.ocrBatchNumber), line.ocrExpiryDate === expected.ocrExpiryDate].filter(Boolean).length;
      if (!/партида|годно|годен|\d{2}\.\d{2}\.\d{4}/i.test(line.ocrDescription)) s.cleanNames += 1;
    });
  }
  const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '—');
  console.log(`${runResult.label} against truth, ${s.docs} document(s), ${s.failed} failed:`);
  console.log(
    `  header ${pct(s.header, s.headerFields)} · line count ${pct(s.lineCount, s.docs - s.failed)} · qty/price/total ${pct(s.lineOk, s.lineFields)}` +
      ` · batch/expiry ${pct(s.batchOk, s.batchFields)} · names without batch/expiry ${pct(s.cleanNames, s.names)}`,
  );
}

const commands = { export: exportCaptures, run, compare, truth };
if (!commands[command]) {
  console.error('Usage: bench-extraction.cjs export|run|compare [options]');
  process.exit(1);
}
Promise.resolve(commands[command]()).catch((error) => {
  console.error(error);
  process.exit(1);
});
