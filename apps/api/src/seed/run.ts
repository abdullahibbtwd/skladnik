import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { seedDemo } from './demo-seed';
import { seedDevTenants } from './dev-tenants';

const DEFAULT_PASSWORD = 'DevPassword123!';

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO !== '1') {
    throw new Error('Refusing to seed demo users in production. Set SEED_DEMO=1 (and ideally SEED_PASSWORD) to do it anyway.');
  }
  const password = process.env.SEED_PASSWORD?.trim() || DEFAULT_PASSWORD;
  const passwordHash = await bcrypt.hash(password, 12);

  const prisma = new PrismaService();
  try {
    const users = [
      ...(await seedDevTenants(prisma, passwordHash)),
      ...(await seedDemo(prisma, passwordHash, { reset: process.env.SEED_RESET === '1' })),
    ];
    console.log(`\nSeed users (password: ${password}):`);
    for (const user of users) {
      console.log(`  ${user.email.padEnd(32)} ${user.company.padEnd(22)} ${user.role}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
