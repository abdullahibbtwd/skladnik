import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { seedDemo } from './demo-seed';
import { seedDevTenants } from './dev-tenants';

const DEFAULT_PASSWORD = 'DevPassword123!';

async function main() {
  const password = process.env.SEED_PASSWORD?.trim() || DEFAULT_PASSWORD;
  const passwordHash = await bcrypt.hash(password, 12);
  const inProduction = process.env.NODE_ENV === 'production';
  const wantDemo = !inProduction || process.env.SEED_DEMO === '1';

  if (inProduction && !wantDemo) {
    console.warn(
      'NODE_ENV=production: seeding empty tenants only. Set SEED_DEMO=1 to include demo companies too.',
    );
  }

  const prisma = new PrismaService();
  try {
    // Same password hash for every seed user (empty tenants + demo).
    const users = [...(await seedDevTenants(prisma, passwordHash))];
    if (wantDemo) {
      users.push(...(await seedDemo(prisma, passwordHash, { reset: process.env.SEED_RESET === '1' })));
    }

    console.log(`\nSeed users (password: ${password}):`);
    for (const user of users) {
      console.log(`  ${user.email.padEnd(32)} ${user.company.padEnd(22)} ${user.role}`);
    }
    if (!wantDemo) {
      console.log('\nDemo companies were skipped. Re-run with SEED_DEMO=1 to add them (same password).');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
