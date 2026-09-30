import { PrismaClient, SiteType, UserRole } from '@prisma/client';
import { seedUnitAliases } from '../units/seed-unit-aliases';

async function upsertCompany(prisma: PrismaClient, name: string) {
  const existing = await prisma.company.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.company.create({ data: { name } });
}

async function upsertUser(
  prisma: PrismaClient,
  params: { email: string; name: string; role: UserRole; companyId: string; passwordHash: string },
) {
  return prisma.user.upsert({
    where: { email: params.email },
    update: {
      name: params.name,
      role: params.role,
      companyId: params.companyId,
      passwordHash: params.passwordHash,
      isActive: true,
    },
    create: params,
  });
}

async function upsertSite(prisma: PrismaClient, companyId: string, name: string, type: SiteType) {
  return prisma.site.upsert({
    where: { companyId_name: { companyId, name } },
    update: { type },
    create: { companyId, name, type },
  });
}

/** Empty tenants for tenancy / permission checks: users and sites only. */
export async function seedDevTenants(prisma: PrismaClient, passwordHash: string) {
  const metro = await upsertCompany(prisma, 'Metro Corner Market');
  const riverside = await upsertCompany(prisma, 'Riverside Cafe');

  const mainStore = await upsertSite(prisma, metro.id, 'Main Store', SiteType.STORE);
  await upsertSite(prisma, metro.id, 'Warehouse', SiteType.WAREHOUSE);
  await upsertSite(prisma, riverside.id, 'Kitchen', SiteType.KITCHEN);

  await upsertUser(prisma, {
    email: 'owner-a@skladnik.dev',
    name: 'Ada Owner',
    role: UserRole.OWNER,
    companyId: metro.id,
    passwordHash,
  });

  const managerA = await upsertUser(prisma, {
    email: 'manager-a@skladnik.dev',
    name: 'Sam Manager',
    role: UserRole.SITE_MANAGER,
    companyId: metro.id,
    passwordHash,
  });

  await prisma.userSite.upsert({
    where: { userId_siteId: { userId: managerA.id, siteId: mainStore.id } },
    update: {},
    create: { userId: managerA.id, siteId: mainStore.id },
  });

  const staffA = await upsertUser(prisma, {
    email: 'staff-a@skladnik.dev',
    name: 'Casey Cashier',
    role: UserRole.STAFF,
    companyId: metro.id,
    passwordHash,
  });

  await prisma.userSite.upsert({
    where: { userId_siteId: { userId: staffA.id, siteId: mainStore.id } },
    update: {},
    create: { userId: staffA.id, siteId: mainStore.id },
  });

  await upsertUser(prisma, {
    email: 'accountant-a@skladnik.dev',
    name: 'Alex Accountant',
    role: UserRole.ACCOUNTANT,
    companyId: metro.id,
    passwordHash,
  });

  await upsertUser(prisma, {
    email: 'owner-b@skladnik.dev',
    name: 'Ben Owner',
    role: UserRole.OWNER,
    companyId: riverside.id,
    passwordHash,
  });

  await seedUnitAliases(prisma, metro.id);
  await seedUnitAliases(prisma, riverside.id);

  return [
    { email: 'owner-a@skladnik.dev', company: metro.name, role: 'OWNER, all sites' },
    { email: 'manager-a@skladnik.dev', company: metro.name, role: 'SITE_MANAGER, Main Store only' },
    { email: 'staff-a@skladnik.dev', company: metro.name, role: 'STAFF, Main Store only' },
    { email: 'accountant-a@skladnik.dev', company: metro.name, role: 'ACCOUNTANT, all sites' },
    { email: 'owner-b@skladnik.dev', company: riverside.name, role: 'OWNER, all sites' },
  ];
}
