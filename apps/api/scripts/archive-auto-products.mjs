// Audit F-03: scanning used to create a "pending review" product (code OCR-…) for every line it couldn't
// match, and cancelling the draft left them behind. Scans no longer create products; this archives the
// ones already created that nothing live depends on.
//
//   DATABASE_URL=… node scripts/archive-auto-products.mjs            # dry run: lists every pending product
//   DATABASE_URL=… node scripts/archive-auto-products.mjs --apply    # archives the safe ones
//
// Options:
//   --company=<id or name fragment>   limit to one company
//   --apply                           write the change
//
// A pending product is archived when no draft or posted document uses it and it has no stock movements.
// Ones still on an open draft are left for the reviewer (posting is blocked until they pick a product);
// ones on a posted document are only reported, since stock was booked against them.
import { PrismaClient } from '@prisma/client';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.length ? rest.join('=') : true];
  }),
);
const apply = args.apply === true;

const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany({
    where:
      typeof args.company === 'string'
        ? { OR: [{ id: args.company }, { name: { contains: args.company, mode: 'insensitive' } }] }
        : {},
    select: { id: true, name: true },
  });
  if (!companies.length) throw new Error(`No company matches ${args.company}`);

  const products = await prisma.product.findMany({
    where: { companyId: { in: companies.map((company) => company.id) }, status: 'PENDING_REVIEW' },
    select: {
      id: true,
      companyId: true,
      code: true,
      name: true,
      createdAt: true,
      createdFrom: { select: { number: true, status: true } },
      documentLines: { select: { document: { select: { id: true, number: true, status: true } } } },
      _count: { select: { stockMovements: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const archive = [];
  for (const product of products) {
    const documents = [...new Map(product.documentLines.map((line) => [line.document.id, line.document])).values()];
    const open = documents.filter((doc) => doc.status === 'DRAFT' || doc.status === 'REVIEW');
    const posted = documents.filter((doc) => doc.status === 'POSTED');
    const company = companies.find((row) => row.id === product.companyId)?.name;
    const source = product.createdFrom ? `${product.createdFrom.number ?? '(no number)'} ${product.createdFrom.status}` : 'unknown';
    let verdict = 'archive';
    if (posted.length || product._count.stockMovements) {
      verdict = `keep: on posted ${posted.map((doc) => doc.number ?? doc.id).join(', ') || '—'}, ${product._count.stockMovements} movement(s). Review by hand`;
    } else if (open.length) {
      verdict = `keep: still on open draft ${open.map((doc) => doc.number ?? doc.id).join(', ')}`;
    }
    console.log(`${company} | ${product.code} | ${product.name} | from ${source} | ${verdict}`);
    if (verdict === 'archive') archive.push(product.id);
  }

  console.log(`\n${products.length} pending product(s); ${archive.length} safe to archive.`);
  if (!apply) {
    if (archive.length) console.log('Dry run. Re-run with --apply to archive them.');
    return;
  }
  if (!archive.length) return;
  const { count } = await prisma.product.updateMany({
    where: { id: { in: archive }, status: 'PENDING_REVIEW' },
    data: { status: 'ARCHIVED' },
  });
  console.log(`Archived ${count} product(s).`);
}

main()
  .catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
