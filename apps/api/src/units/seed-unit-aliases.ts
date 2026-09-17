import { Prisma, PrismaClient } from '@prisma/client';
import { DEFAULT_UNIT_ALIASES } from '@skladnik/shared';

type Db = PrismaClient | Prisma.TransactionClient;

export async function seedUnitAliases(db: Db, companyId: string) {
  await db.unitAlias.createMany({
    data: DEFAULT_UNIT_ALIASES.map((alias) => ({
      companyId,
      raw: alias.raw,
      unit: alias.unit,
    })),
    skipDuplicates: true,
  });
}
