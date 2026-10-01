/**
 * ACC-06 data fix for EXISTING environments that still have the QA-invalid supplier ЕИКs
 * and/or a company without ЕИК / VAT / declarant.
 *
 * DO NOT run against production without a backup. The script is reversible via the
 * companion down-script comments below (restore from the printed before-snapshot).
 *
 * Usage (dry-run by default):
 *   DATABASE_URL=… node scripts/fix-acc06-master-data.mjs
 * Apply:
 *   DATABASE_URL=… APPLY=1 node scripts/fix-acc06-master-data.mjs
 *
 * Mapping (invalid → valid fictional checksums, same as demo seed):
 *   204512873 → 204512879  Балкан Дистрибуция
 *   203998412 → 203998410  Млечен път
 *   175632904 → 175632901  Родопски деликатеси
 *
 * Company (Demo Mini Market by name, or COMPANY_ID=…):
 *   eik 206400170, vat BG206400170, declarant from MOL / "Maria Petrova"
 *
 * Reverse: re-apply the "before" values printed in the dry-run JSON for each row.
 */

const { PrismaClient } = require('@prisma/client');
const { isValidEik } = require('@skladnik/shared');

const APPLY = process.env.APPLY === '1';
const prisma = new PrismaClient();

const PARTNER_FIXES = [
  { from: '204512873', to: '204512879', nameHint: 'Балкан' },
  { from: '203998412', to: '203998410', nameHint: 'Млечен' },
  { from: '175632904', to: '175632901', nameHint: 'Родопски' },
];

async function main() {
  for (const fix of PARTNER_FIXES) {
    if (!isValidEik(fix.to)) throw new Error(`target ЕИК ${fix.to} is invalid`);
    const partners = await prisma.partner.findMany({ where: { eik: fix.from } });
    for (const partner of partners) {
      const before = { id: partner.id, eik: partner.eik, vatNumber: partner.vatNumber };
      const after = { eik: fix.to, vatNumber: `BG${fix.to}` };
      console.log(JSON.stringify({ entity: 'Partner', before, after, apply: APPLY }));
      if (APPLY) {
        await prisma.partner.update({ where: { id: partner.id }, data: after });
      }
    }
  }

  const companyId = process.env.COMPANY_ID;
  const companies = companyId
    ? await prisma.company.findMany({ where: { id: companyId } })
    : await prisma.company.findMany({ where: { name: { contains: 'Demo Mini Market' } } });

  for (const company of companies) {
    const before = {
      id: company.id,
      eik: company.eik,
      vatNumber: company.vatNumber,
      declarant: company.declarant,
      address: company.address,
    };
    const after = {
      eik: company.eik && isValidEik(company.eik) ? company.eik : '206400170',
      vatNumber:
        company.vatNumber && String(company.vatNumber).startsWith('BG')
          ? company.vatNumber
          : `BG${company.eik && isValidEik(company.eik) ? company.eik : '206400170'}`,
      declarant: company.declarant?.trim() || company.mol || 'Maria Petrova',
      address: company.address || 'ул. Витоша 12',
      city: company.city || 'София',
    };
    console.log(JSON.stringify({ entity: 'Company', before, after, apply: APPLY }));
    if (APPLY) {
      await prisma.company.update({ where: { id: company.id }, data: after });
      await prisma.vatSettings.upsert({
        where: { companyId: company.id },
        create: { companyId: company.id, declarant: after.declarant },
        update: { declarant: after.declarant },
      });
    }
  }

  console.log(APPLY ? 'Applied ACC-06 master-data fixes.' : 'Dry-run only. Set APPLY=1 to write.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
