import { existsSync } from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';

/** Brand tokens aligned with apps/web ops theme. */
const BRAND = {
  teal: '#0d9488',
  tealDark: '#0f766e',
  ink: '#1e1b4b',
  muted: '#64748b',
  line: '#e2e8f0',
  canvas: '#f1f5f9',
  white: '#ffffff',
  accent: '#4f46e5',
};

export type InvoicePdfSnapshot = {
  number: string;
  title: string;
  currency: string;
  vatRate: number;
  subtotalMinor: number;
  vatMinor: number;
  totalMinor: number;
  issuedAt: Date;
  sellerName: string;
  sellerEik: string;
  sellerAddress: string;
  sellerEmail: string;
  buyerName: string;
  buyerEik: string;
  buyerAddress: string;
  buyerEmail: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitMinor: number;
    lineMinor: number;
  }>;
};

function resolveAsset(...parts: string[]): string | null {
  const bases = [
    join(__dirname, '..', '..', 'assets'),
    join(__dirname, 'assets'),
    join(process.cwd(), 'assets'),
    join(process.cwd(), 'apps', 'api', 'assets'),
  ];
  for (const base of bases) {
    const path = join(base, ...parts);
    if (existsSync(path)) return path;
  }
  return null;
}

function resolveFontPath(): string {
  const path = resolveAsset('fonts', 'DejaVuSans.ttf');
  if (!path) throw new Error('DejaVuSans.ttf not found (expected under apps/api/assets/fonts/)');
  return path;
}

function resolveLogoPath(): string | null {
  return resolveAsset('brand', 'logo.png');
}

function formatMoney(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Build a branded PDF buffer from an immutable invoice snapshot (Unicode via DejaVu). */
export async function renderInvoicePdf(invoice: InvoicePdfSnapshot): Promise<Buffer> {
  const fontPath = resolveFontPath();
  const logoPath = resolveLogoPath();
  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
  const chunks: Buffer[] = [];
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const marginX = 48;
  const contentW = pageW - marginX * 2;

  return new Promise((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('Body', fontPath);
    doc.font('Body');

    // Top brand bar
    doc.save();
    doc.rect(0, 0, pageW, 8).fill(BRAND.teal);
    doc.restore();

    // Header band
    doc.save();
    doc.rect(0, 8, pageW, 96).fill(BRAND.canvas);
    doc.restore();

    const headerY = 28;
    if (logoPath) {
      try {
        doc.image(logoPath, marginX, headerY, { width: 44, height: 44 });
      } catch {
        drawLogoFallback(doc, marginX, headerY);
      }
    } else {
      drawLogoFallback(doc, marginX, headerY);
    }

    doc.fillColor(BRAND.ink).fontSize(20).text('Skladnik', marginX + 56, headerY + 4, { width: 220 });
    doc
      .fillColor(BRAND.muted)
      .fontSize(9)
      .text('Platform billing', marginX + 56, headerY + 28, { width: 220 });

    doc
      .fillColor(BRAND.teal)
      .fontSize(16)
      .text(invoice.title, marginX, headerY + 4, { width: contentW, align: 'right' });
    doc
      .fillColor(BRAND.ink)
      .fontSize(10)
      .text(invoice.number, marginX, headerY + 28, { width: contentW, align: 'right' });
    doc
      .fillColor(BRAND.muted)
      .fontSize(9)
      .text(`Issued ${formatDate(invoice.issuedAt)}`, marginX, headerY + 44, {
        width: contentW,
        align: 'right',
      });

    let y = 130;

    // Seller / Buyer cards
    const cardGap = 16;
    const cardW = (contentW - cardGap) / 2;
    y = drawPartyCard(doc, marginX, y, cardW, 'From', invoice.sellerName, [
      `EIK ${invoice.sellerEik}`,
      invoice.sellerAddress,
      invoice.sellerEmail,
    ]);
    drawPartyCard(doc, marginX + cardW + cardGap, 130, cardW, 'Bill to', invoice.buyerName, [
      `EIK ${invoice.buyerEik}`,
      invoice.buyerAddress,
      invoice.buyerEmail,
    ]);
    y += 12;

    // Line items table header
    doc.save();
    doc.roundedRect(marginX, y, contentW, 28, 8).fill(BRAND.teal);
    doc.restore();
    doc.fillColor(BRAND.white).fontSize(9);
    doc.text('Description', marginX + 12, y + 9, { width: contentW * 0.46 });
    doc.text('Qty', marginX + contentW * 0.5, y + 9, { width: contentW * 0.1, align: 'right' });
    doc.text('Unit', marginX + contentW * 0.62, y + 9, { width: contentW * 0.16, align: 'right' });
    doc.text('Amount', marginX + contentW * 0.8, y + 9, { width: contentW * 0.18 - 12, align: 'right' });
    y += 36;

    for (const [index, line] of invoice.lineItems.entries()) {
      if (index % 2 === 0) {
        doc.save();
        doc.roundedRect(marginX, y - 4, contentW, 26, 6).fill('#f8fafc');
        doc.restore();
      }
      doc.fillColor(BRAND.ink).fontSize(9);
      doc.text(line.description, marginX + 12, y, { width: contentW * 0.46 });
      doc.fillColor(BRAND.muted);
      doc.text(String(line.quantity), marginX + contentW * 0.5, y, {
        width: contentW * 0.1,
        align: 'right',
      });
      doc.text(formatMoney(line.unitMinor, invoice.currency), marginX + contentW * 0.62, y, {
        width: contentW * 0.16,
        align: 'right',
      });
      doc.fillColor(BRAND.ink);
      doc.text(formatMoney(line.lineMinor, invoice.currency), marginX + contentW * 0.8, y, {
        width: contentW * 0.18 - 12,
        align: 'right',
      });
      y += 28;
    }

    y += 8;
    doc
      .strokeColor(BRAND.line)
      .lineWidth(1)
      .moveTo(marginX, y)
      .lineTo(marginX + contentW, y)
      .stroke();
    y += 16;

    // Totals box
    const totalsW = 220;
    const totalsX = marginX + contentW - totalsW;
    doc.save();
    doc.roundedRect(totalsX, y, totalsW, 92, 10).fill(BRAND.canvas);
    doc.restore();

    doc.fillColor(BRAND.muted).fontSize(9);
    doc.text('Subtotal', totalsX + 14, y + 14, { width: 100 });
    doc.fillColor(BRAND.ink).text(formatMoney(invoice.subtotalMinor, invoice.currency), totalsX + 14, y + 14, {
      width: totalsW - 28,
      align: 'right',
    });

    doc.fillColor(BRAND.muted).text(`VAT (${invoice.vatRate}%)`, totalsX + 14, y + 34, { width: 100 });
    doc.fillColor(BRAND.ink).text(formatMoney(invoice.vatMinor, invoice.currency), totalsX + 14, y + 34, {
      width: totalsW - 28,
      align: 'right',
    });

    doc
      .strokeColor(BRAND.line)
      .moveTo(totalsX + 14, y + 54)
      .lineTo(totalsX + totalsW - 14, y + 54)
      .stroke();

    doc.fillColor(BRAND.tealDark).fontSize(12).text('Total', totalsX + 14, y + 64, { width: 80 });
    doc
      .fillColor(BRAND.tealDark)
      .fontSize(12)
      .text(formatMoney(invoice.totalMinor, invoice.currency), totalsX + 14, y + 64, {
        width: totalsW - 28,
        align: 'right',
      });

    // Footer
    const footerY = pageH - 56;
    doc
      .strokeColor(BRAND.line)
      .moveTo(marginX, footerY)
      .lineTo(marginX + contentW, footerY)
      .stroke();
    doc
      .fillColor(BRAND.muted)
      .fontSize(8)
      .text(
        'Generated by Skladnik Platform · This document is a snapshot and cannot be edited after issue.',
        marginX,
        footerY + 12,
        { width: contentW, align: 'center' },
      );

    doc.end();
  });
}

function drawLogoFallback(doc: InstanceType<typeof PDFDocument>, x: number, y: number) {
  doc.save();
  doc.roundedRect(x, y, 44, 44, 10).fill(BRAND.teal);
  doc.fillColor(BRAND.white).fontSize(18).text('S', x, y + 12, { width: 44, align: 'center' });
  doc.restore();
}

function drawPartyCard(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  width: number,
  label: string,
  name: string,
  lines: string[],
): number {
  const height = 92;
  doc.save();
  doc.roundedRect(x, y, width, height, 10).lineWidth(1).strokeColor('#e2e8f0').stroke();
  doc.restore();
  doc.fillColor(BRAND.teal).fontSize(8).text(label.toUpperCase(), x + 12, y + 12);
  doc.fillColor(BRAND.ink).fontSize(11).text(name, x + 12, y + 28, { width: width - 24 });
  doc.fillColor(BRAND.muted).fontSize(8);
  let lineY = y + 48;
  for (const line of lines) {
    doc.text(line, x + 12, lineY, { width: width - 24 });
    lineY += 12;
  }
  return y + height;
}

/** Exposed for smoke tests that need the font path. */
export function invoicePdfFontPath(): string {
  return resolveFontPath();
}
