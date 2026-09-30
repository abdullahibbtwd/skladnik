// Renders photographed-looking Bulgarian purchase invoices from the demo catalog, each with a
// <name>.truth.json answer file, for bench-extraction.cjs (speed and accuracy) and for checking that a
// read invoice matches the demo products (audit F-03). Invoice 01 is the audit's test invoice № 0000777001.
//
//   node scripts/make-bench-invoices.cjs [--out=../../.tmp-ocr/synthetic] [--count=24] [--seed=7]
const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=') || 'true'];
  }),
);
const out = path.resolve(args.out ?? path.join(ROOT, '.tmp-ocr/synthetic'));
const count = Number(args.count ?? 24);

let state = Number(args.seed ?? 7);
const random = () => ((state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (list) => list[Math.floor(random() * list.length)];
const between = (min, max) => min + random() * (max - min);
const round = (value, places) => Math.round((value + Number.EPSILON) * 10 ** places) / 10 ** places;

function ean13(stem) {
  const sum = [...stem].reduce((acc, digit, index) => acc + Number(digit) * (index % 2 ? 3 : 1), 0);
  return `${stem}${(10 - (sum % 10)) % 10}`;
}

// Demo catalog (apps/api/src/seed/demo-seed.ts) with the ways suppliers print the same product.
const PRODUCTS = [
  { code: 'M-001', name: 'Прясно мляко 3% 1 л', printed: ['Прясно мляко 3% 1 л', 'ПРЯСНО МЛЯКО 3% 1Л', 'Мляко прясно 3% 1 л'], unit: 'бр.', cost: 0.95, barcode: ean13('380100000001'), batch: true },
  { code: 'M-002', name: 'Кисело мляко 3.6% 400 г', printed: ['Кисело мляко 3.6% 400 г', 'КИСЕЛО МЛЯКО 3,6% 400Г', 'Кисело мляко 3,6 % 400гр'], unit: 'бр.', cost: 0.55, barcode: ean13('380100000002'), batch: true },
  { code: 'M-004', name: 'Кашкавал Витоша 400 г', printed: ['Кашкавал Витоша 400 г', 'КАШКАВАЛ ВИТОША 400Г'], unit: 'бр.', cost: 3.1, barcode: ean13('380100000004'), batch: true },
  { code: 'M-005', name: 'Масло 82% 125 г', printed: ['Масло 82% 125 г', 'МАСЛО 82% 125Г', 'Масло краве 82% 125 г'], unit: 'бр.', cost: 1.05, barcode: ean13('380100000005'), batch: true },
  { code: 'M-010', name: 'Луканка Смядовска 250 г', printed: ['Луканка Смядовска 250 г', 'ЛУКАНКА СМЯДОВСКА 250Г'], unit: 'бр.', cost: 2.6, barcode: ean13('380100000010'), batch: true },
  { code: 'M-011', name: 'Кренвирши 400 г', printed: ['Кренвирши 400 г', 'КРЕНВИРШИ 400Г'], unit: 'бр.', cost: 1.4, barcode: ean13('380100000011'), batch: true },
  { code: 'M-012', name: 'Пилешко филе', printed: ['Пилешко филе', 'ПИЛЕШКО ФИЛЕ охладено'], unit: 'кг', cost: 4.2, batch: true },
  { code: 'M-020', name: 'Минерална вода 1.5 л', printed: ['Минерална вода 1.5 л', 'МИНЕРАЛНА ВОДА 1,5Л'], unit: 'бр.', cost: 0.25, barcode: ean13('380100000020') },
  { code: 'M-021', name: 'Кока-Кола 0.5 л', printed: ['Кока-Кола 0.5 л', 'КОКА-КОЛА 0,5Л'], unit: 'бр.', cost: 0.5, barcode: ean13('380100000021') },
  { code: 'M-022', name: 'Бира Загорка 0.5 л', printed: ['Бира Загорка 0.5 л', 'БИРА ЗАГОРКА 0,5Л'], unit: 'бр.', cost: 0.55, barcode: ean13('380100000022') },
  { code: 'M-023', name: 'Портокалов сок 1 л', printed: ['Портокалов сок 1 л', 'Сок портокал 1 л'], unit: 'бр.', cost: 0.85, barcode: ean13('380100000023') },
  { code: 'M-024', name: 'Кафе мляно 250 г', printed: ['Кафе мляно 250 г', 'КАФЕ МЛЯНО 250Г'], unit: 'бр.', cost: 2.2, barcode: ean13('380100000024') },
  { code: 'M-030', name: 'Хляб Добруджа 650 г', printed: ['Хляб Добруджа 650 г', 'ХЛЯБ ДОБРУДЖА 650Г'], unit: 'бр.', cost: 0.6, barcode: ean13('380100000030') },
  { code: 'M-040', name: 'Ориз 1 кг', printed: ['Ориз 1 кг', 'ОРИЗ 1КГ'], unit: 'бр.', cost: 1.05, barcode: ean13('380100000040') },
  { code: 'M-041', name: 'Олио слънчогледово 1 л', printed: ['Олио слънчогледово 1 л', 'ОЛИО СЛЪНЧОГЛЕДОВО 1Л'], unit: 'бр.', cost: 1.15, barcode: ean13('380100000041') },
  { code: 'M-042', name: 'Захар 1 кг', printed: ['Захар 1 кг', 'ЗАХАР 1КГ'], unit: 'бр.', cost: 0.65, barcode: ean13('380100000042') },
  { code: 'M-043', name: 'Брашно 1 кг', printed: ['Брашно 1 кг', 'БРАШНО 1КГ тип 500'], unit: 'бр.', cost: 0.48, barcode: ean13('380100000043') },
  { code: 'M-044', name: 'Спагети 500 г', printed: ['Спагети 500 г', 'СПАГЕТИ 500Г'], unit: 'бр.', cost: 0.55, barcode: ean13('380100000044') },
  { code: 'M-050', name: 'Препарат за съдове 500 мл', printed: ['Препарат за съдове 500 мл', 'ПРЕПАРАТ ЗА СЪДОВЕ 500МЛ'], unit: 'бр.', cost: 0.9, barcode: ean13('380100000050') },
  { code: 'M-052', name: 'Прах за пране 2 кг', printed: ['Прах за пране 2 кг', 'ПРАХ ЗА ПРАНЕ 2КГ'], unit: 'бр.', cost: 4.4, barcode: ean13('380100000052') },
];
const SUPPLIERS = [
  { name: 'Балкан Дистрибуция ООД', taxId: '204512879', address: 'София, ул. Околовръстен път 251', mol: 'Иван Георгиев' },
  { name: 'Млечен път ЕООД', taxId: '203998410', address: 'Троян, ул. Васил Левски 14', mol: 'Петя Маринова' },
  { name: 'Родопски деликатеси АД', taxId: '175632901', address: 'Смолян, бул. България 3', mol: 'Христо Ангелов' },
  { name: 'Хлебозавод Изгрев ЕООД', taxId: '131245785', address: 'София, ж.к. Изгрев, ул. Сланина 5', mol: 'Стоян Колев' },
];
const CLIENT = { name: 'Демо Маркет ЕООД', taxId: '206117343', address: 'София, бул. Витоша 112' };
const PAYMENT = { BANK_TRANSFER: 'По банков път', CASH: 'В брой' };

const date = (day, month = 9, year = 2026) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const bgDate = (iso) => iso.split('-').reverse().join('.');
const money = (value) => value.toFixed(2).replace('.', ',');

function buildInvoice(index) {
  if (index === 0) {
    // The audit's clean invoice (F-03): batch and expiry printed after the name.
    const rows = [
      ['M-001', 24, 'MP-2501', date(28, 10)],
      ['M-005', 12, 'MS-1010', date(20, 11)],
      ['M-002', 20, 'KM-0412', date(14, 10)],
    ];
    return finish({
      number: '0000777001',
      issuedOn: date(27),
      supplier: SUPPLIERS[1],
      style: 'inline',
      payment: 'BANK_TRANSFER',
      lines: rows.map(([code, qty, batch, expiry]) => {
        const product = PRODUCTS.find((row) => row.code === code);
        return { product, printed: product.name, qty, unitPrice: product.cost, discount: 0, batch, expiry };
      }),
    });
  }
  const supplier = pick(SUPPLIERS);
  const size = pick([3, 4, 5, 6, 8, 10, 12, 15, 20, 25]);
  const chosen = [...PRODUCTS].sort(() => random() - 0.5).slice(0, Math.min(size, PRODUCTS.length));
  while (chosen.length < size) chosen.push(pick(PRODUCTS));
  const style = pick(['columns', 'columns', 'inline']);
  return finish({
    number: String(Math.floor(between(1, 9_999_999_999))).padStart(10, '0'),
    issuedOn: date(Math.floor(between(1, 29))),
    supplier,
    style,
    payment: pick(['BANK_TRANSFER', 'CASH']),
    lines: chosen.map((product) => {
      const qty = product.unit === 'кг' ? round(between(1, 12), 3) : Math.floor(between(2, 60));
      const tracked = product.batch;
      return {
        product,
        printed: pick(product.printed),
        qty,
        unitPrice: round(product.cost * between(0.95, 1.1), 2),
        discount: random() < 0.2 ? pick([2, 3, 5]) : 0,
        batch: tracked ? `${product.code.slice(2)}${Math.floor(between(100, 999))}` : null,
        expiry: tracked ? date(Math.floor(between(1, 28)), Math.floor(between(10, 13))) : null,
      };
    }),
  });
}

function finish(invoice) {
  invoice.supplierCodes = new Map(invoice.lines.map((line) => [line.product.code, `${invoice.supplier.taxId.slice(-2)}${line.product.code.slice(2)}`]));
  for (const line of invoice.lines) {
    line.finalUnitPrice = round(line.unitPrice * (1 - line.discount / 100), 4);
    line.lineTotal = round(line.finalUnitPrice * line.qty, 2);
  }
  const base = round(invoice.lines.reduce((sum, line) => sum + line.lineTotal, 0), 2);
  invoice.totals = { taxableBase: base, vatAmount: round(base * 0.2, 2), grossTotal: round(base + round(base * 0.2, 2), 2) };
  return invoice;
}

function render(invoice) {
  const W = 2100;
  const rowH = invoice.style === 'inline' ? 78 : 58;
  const H = Math.max(2970, 1250 + invoice.lines.length * rowH + 500);
  const page = createCanvas(W, H);
  const ctx = page.getContext('2d');
  ctx.fillStyle = '#fbfaf5';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1b1b1b';
  ctx.strokeStyle = '#333';
  const text = (value, x, y, size = 30, weight = '', align = 'left') => {
    ctx.font = `${weight} ${size}px Arial`.trim();
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  };

  text('ФАКТУРА', W / 2, 150, 64, 'bold', 'center');
  text('ОРИГИНАЛ', W / 2, 205, 30, '', 'center');
  text(`№ ${invoice.number}`, 140, 300, 40, 'bold');
  text(`Дата: ${bgDate(invoice.issuedOn)}г.`, W - 140, 300, 40, 'bold', 'right');
  const party = (label, who, x) => {
    ctx.strokeRect(x, 350, 880, 330);
    text(label, x + 20, 400, 32, 'bold');
    text(who.name, x + 20, 455, 34, 'bold');
    text(`ЕИК: ${who.taxId}`, x + 20, 510);
    text(`ИН по ДДС: BG${who.taxId}`, x + 20, 555);
    text(`Адрес: ${who.address}`, x + 20, 600, 28);
    if (who.mol) text(`МОЛ: ${who.mol}`, x + 20, 645, 28);
  };
  party('Доставчик', invoice.supplier, 120);
  party('Получател', CLIENT, 1100);

  const inline = invoice.style === 'inline';
  const cols = inline
    ? [['№', 120], ['Код', 190], ['Наименование на стоката', 360], ['Мярка', 1180], ['Кол.', 1320], ['Ед. цена', 1480], ['Отст.%', 1660], ['Стойност', 1800]]
    : [['№', 120], ['Код', 190], ['Баркод', 340], ['Наименование', 640], ['Партида', 1150], ['Годен до', 1330], ['Мярка', 1500], ['Кол.', 1600], ['Цена', 1720], ['Стойност', 1850]];
  let y = 760;
  ctx.strokeRect(110, y - 50, W - 220, 70);
  for (const [label, x] of cols) text(label, x, y, 26, 'bold');
  y += 60;
  invoice.lines.forEach((line, i) => {
    const code = invoice.supplierCodes.get(line.product.code);
    const name = inline
      ? `${line.printed}${line.batch ? `, партида ${line.batch}, годно до ${bgDate(line.expiry)}` : ''}`
      : line.printed;
    const cells = inline
      ? [String(i + 1), code, name, line.product.unit, String(line.qty).replace('.', ','), money(line.unitPrice), String(line.discount), money(line.lineTotal)]
      : [String(i + 1), code, line.product.barcode ?? '', name, line.batch ?? '', line.expiry ? bgDate(line.expiry) : '', line.product.unit, String(line.qty).replace('.', ','), money(line.finalUnitPrice), money(line.lineTotal)];
    cells.forEach((cell, c) => text(cell, cols[c][1], y, c === (inline ? 2 : 3) ? 26 : 25));
    ctx.beginPath();
    ctx.moveTo(110, y + rowH / 2);
    ctx.lineTo(W - 110, y + rowH / 2);
    ctx.lineWidth = 1;
    ctx.stroke();
    y += rowH;
  });
  y += 60;
  text(`Данъчна основа: ${money(invoice.totals.taxableBase)} €`, W - 140, y, 34, '', 'right');
  text(`ДДС 20%: ${money(invoice.totals.vatAmount)} €`, W - 140, y + 55, 34, '', 'right');
  text(`Сума за плащане: ${money(invoice.totals.grossTotal)} €`, W - 140, y + 115, 38, 'bold', 'right');
  text(`Начин на плащане: ${PAYMENT[invoice.payment]}`, 140, y + 115, 30);
  text('Съставил: ..................', 140, y + 260, 28);
  text('Получил: ..................', W - 700, y + 260, 28);

  // "Photograph" it: table background, slight rotation and scale, uneven light, phone-sized JPEG.
  const PW = 3024;
  const PH = Math.round((PW * 4) / 3);
  const photo = createCanvas(PW, PH);
  const p = photo.getContext('2d');
  p.fillStyle = pick(['#6b5a45', '#3d3d3d', '#8a7a62']);
  p.fillRect(0, 0, PW, PH);
  const scale = Math.min((PW * 0.9) / W, (PH * 0.93) / H);
  p.translate(PW / 2 + between(-60, 60), PH / 2 + between(-60, 60));
  p.rotate((between(-2.5, 2.5) * Math.PI) / 180);
  p.drawImage(page, (-W * scale) / 2, (-H * scale) / 2, W * scale, H * scale);
  p.setTransform(1, 0, 0, 1, 0, 0);
  const pixels = p.getImageData(0, 0, PW, PH);
  const data = pixels.data;
  const falloff = between(0.12, 0.25);
  for (let row = 0; row < PH; row += 1) {
    const shade = 1 - falloff * (row / PH);
    for (let col = 0, i = row * PW * 4; col < PW; col += 1, i += 4) {
      const noise = (random() - 0.5) * 18;
      const light = shade * (1 - 0.08 * (col / PW));
      data[i] = data[i] * light + noise;
      data[i + 1] = data[i + 1] * light + noise;
      data[i + 2] = data[i + 2] * light * 0.97 + noise;
    }
  }
  p.putImageData(pixels, 0, 0);
  return photo.toBuffer('image/jpeg', 90);
}

function truth(invoice) {
  return {
    documentNumber: invoice.number,
    issuedOn: invoice.issuedOn,
    supplier: { name: invoice.supplier.name, taxId: invoice.supplier.taxId },
    client: { name: CLIENT.name, taxId: CLIENT.taxId },
    taxableBase: invoice.totals.taxableBase,
    vatAmount: invoice.totals.vatAmount,
    grossTotal: invoice.totals.grossTotal,
    paymentMethod: invoice.payment,
    lines: invoice.lines.map((line) => ({
      productCode: line.product.code,
      productName: line.product.name,
      supplierCode: invoice.supplierCodes.get(line.product.code),
      barcode: invoice.style === 'inline' ? null : (line.product.barcode ?? null),
      qty: line.qty,
      unitPrice: invoice.style === 'inline' ? line.unitPrice : line.finalUnitPrice,
      discountPercent: line.discount,
      lineTotal: line.lineTotal,
      ocrBatchNumber: line.batch,
      ocrExpiryDate: line.expiry,
    })),
  };
}

fs.mkdirSync(out, { recursive: true });
for (let i = 0; i < count; i += 1) {
  const invoice = buildInvoice(i);
  const name = `inv-${String(i + 1).padStart(2, '0')}-${invoice.lines.length}lines`;
  fs.writeFileSync(path.join(out, `${name}.jpg`), render(invoice));
  fs.writeFileSync(path.join(out, `${name}.truth.json`), JSON.stringify(truth(invoice), null, 2));
}
console.log(`Wrote ${count} invoices to ${out}`);
