/**
 * CAF-03 data fix for an EXISTING Demo Café database.
 *
 * The seed only sets batch tracking when the company has no documents yet.
 * This script turns it on for the two perishable products and moves loose stock
 * into one lot named "без партида" (no expiry). Quantity on hand does not change:
 * each site gets an OUT of the loose quantity and an IN of the same quantity.
 *
 * NOT executed by the café audit implementation. Dry-run unless APPLY=1.
 *
 *   DATABASE_URL=… node scripts/cafe-perishable-batches.mjs
 *   DATABASE_URL=… APPLY=1 node scripts/cafe-perishable-batches.mjs
 *
 * Reverse: set batchTracking back to false on the printed product ids and delete
 * the matching OUT (batchId null) and IN (lot "без партида") pair, only when
 * that lot has no later movements. Do not delete the lot if a document posted against it.
 *
 * Company profile and partner ЕИК are corrected by the next seed run (no reset),
 * not by this script.
 */

const { PrismaClient } = require('@prisma/client');

const APPLY = process.env.APPLY === '1';
const LOT = 'без партида';
const NAMES = ['Прясно мляко 3.5%', 'Кроасан с масло'];

const prisma = new PrismaClient();

function looseOnHand(movements) {
  let qty = 0;
  for (const movement of movements) {
    if (movement.batchId) continue;
    const n = Number(movement.quantity);
    qty += movement.direction === 'IN' ? n : -n;
  }
  return Math.round(qty * 1000) / 1000;
}

function averageCost(movements) {
  let qty = 0;
  let value = 0;
  for (const movement of movements) {
    if (movement.batchId || movement.direction !== 'IN') continue;
    const n = Number(movement.quantity);
    qty += n;
    value += n * Number(movement.unitCost);
  }
  if (!(qty > 0)) return 0;
  return Math.round((value / qty) * 10000) / 10000;
}

async function main() {
  const company = await prisma.company.findFirst({ where: { name: 'Demo Café' } });
  if (!company) {
    console.log('Demo Café is not in this database. Nothing to do.');
    return;
  }
  const products = await prisma.product.findMany({
    where: { companyId: company.id, name: { in: NAMES } },
  });
  const sites = await prisma.site.findMany({ where: { companyId: company.id } });
  console.log(JSON.stringify({ apply: APPLY, companyId: company.id, products: products.map((p) => ({ id: p.id, name: p.name, batchTracking: p.batchTracking })) }, null, 2));

  for (const product of products) {
    for (const site of sites) {
      const movements = await prisma.stockMovement.findMany({
        where: { companyId: company.id, siteId: site.id, productId: product.id },
      });
      const qty = looseOnHand(movements);
      console.log(`${product.name} @ ${site.name}: loose ${qty}`);
      if (!APPLY || !(qty > 0)) continue;
      const unitCost = averageCost(movements);
      await prisma.$transaction(async (tx) => {
        const batch = await tx.batch.upsert({
          where: { companyId_productId_batchNumber: { companyId: company.id, productId: product.id, batchNumber: LOT } },
          create: { companyId: company.id, productId: product.id, batchNumber: LOT, expiryDate: null, isAutomatic: false },
          update: {},
        });
        await tx.stockMovement.create({
          data: {
            companyId: company.id,
            siteId: site.id,
            productId: product.id,
            batchId: null,
            direction: 'OUT',
            quantity: qty,
            unitCost,
          },
        });
        await tx.stockMovement.create({
          data: {
            companyId: company.id,
            siteId: site.id,
            productId: product.id,
            batchId: batch.id,
            direction: 'IN',
            quantity: qty,
            unitCost,
          },
        });
      });
    }
    if (APPLY && !product.batchTracking) {
      await prisma.product.update({ where: { id: product.id }, data: { batchTracking: true } });
    }
  }
  if (!APPLY) console.log('Dry run. Set APPLY=1 to write. Prefer the manager button when the API is the one that posts stock.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
