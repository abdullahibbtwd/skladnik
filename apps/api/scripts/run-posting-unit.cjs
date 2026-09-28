process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS' });
require('ts-node/register/transpile-only');

(async () => {
  require('../src/documents/can-document-be-posted.test.ts');
  require('../src/documents/stock-availability.test.ts');
  await require('../src/documents/pdf-to-images.test.ts');
  require('../src/extraction/extracted-document.schema.test.ts');
  require('../src/extraction/ocr-errors.test.ts');
  require('../src/extraction/name-matching.test.ts');
  require('../src/extraction/parse-ocr-date.test.ts');
  require('../src/stock/stock-levels.test.ts');
  require('../src/stock/costing.test.ts');
  require('../src/stock/reorder.test.ts');
  require('../src/sales/fefo.test.ts');
  require('../src/sales/business-day.test.ts');
  require('../src/sales/sales-report.test.ts');
  require('../src/recipes/recipe-math.test.ts');
  require('../src/reports/report-math.test.ts');
  require('../src/reports/archive-plan.test.ts');
  await require('../src/reports/export/export.test.ts');
  require('../src/compliance/compliance.test.ts');
  require('../src/vat/vat-ledger.test.ts');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

