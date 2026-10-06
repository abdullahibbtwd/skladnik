/**
 * Create the first (or an additional) platform admin. No env-seeded password.
 *
 * Usage:
 *   npm run platform:create-admin -- --email admin@example.com --password '…' --name 'Ops'
 */
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const parts: string[] = [];
  for (let i = idx + 1; i < process.argv.length; i++) {
    const value = process.argv[i]!;
    if (value.startsWith('--')) break;
    parts.push(value);
  }
  return parts.length ? parts.join(' ') : undefined;
}

function usage(): never {
  console.error(
    'Usage: npm run platform:create-admin -- --email <email> --password <password> --name <name>',
  );
  process.exit(1);
}

async function main() {
  const email = arg('email')?.trim().toLowerCase();
  const password = arg('password');
  const name = arg('name')?.trim();
  if (!email || !password || !name) usage();
  if (password.length < 12) {
    console.error('Password must be at least 12 characters.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.platformAdmin.findUnique({ where: { email } });
    if (existing) {
      console.error(`Platform admin already exists: ${email}`);
      process.exit(1);
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await prisma.platformAdmin.create({
      data: {
        email,
        passwordHash,
        name,
        totpEnabled: false,
        isActive: true,
      },
    });
    console.log('Created platform admin:');
    console.log(`  id:    ${admin.id}`);
    console.log(`  email: ${admin.email}`);
    console.log(`  name:  ${admin.name}`);
    console.log('TOTP is not enabled yet — enroll on first login via POST /platform-auth/totp/enroll.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
