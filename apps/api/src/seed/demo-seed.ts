import { SiteType, UserRole, type UnitOfMeasure } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { AuthUser, DocumentType, PaymentMethod, WriteOffReason } from '@skladnik/shared';
import { DocumentsService } from '../documents/documents.service';
import type { OcrJobData } from '../extraction/ocr.constants';
import { PrismaService } from '../prisma/prisma.service';
import { RecipesService } from '../recipes/recipes.service';
import { addDays, businessDate, dayStart } from '../sales/business-day';
import { SalesService } from '../sales/sales.service';
import type { StorageService } from '../storage/storage.service';
import { seedUnitAliases } from '../units/seed-unit-aliases';

export type SeedUser = { email: string; company: string; role: string };

type UserSeed = { email: string; name: string; role: UserRole; sites?: string[] };

type ProductSeed = {
  code: string;
  name: string;
  group?: string;
  unit: UnitOfMeasure;
  /** Purchase price per unit, excluding VAT. */
  cost: number;
  /** Till price per unit, including VAT. 0 for ingredients that are never sold on their own. */
  price: number;
  batch?: boolean;
  minStock?: number;
  barcode?: string;
};

type PartnerSeed = { name: string; taxId: string; kind: 'SUPPLIER' | 'CUSTOMER'; address: string; mol: string; phone: string };

type LineSeed = { code: string; qty: number; price?: number; batch?: string; expiresInDays?: number };

type DocSeed = {
  daysAgo: number;
  site: string;
  type: DocumentType;
  number: string;
  status: 'POSTED' | 'REVIEW' | 'DRAFT';
  partnerTaxId?: string;
  targetSite?: string;
  writeOffReason?: WriteOffReason;
  notes?: string;
  lines: LineSeed[];
};

type RecipeSeed = { dish: string; ingredients: { code: string; qty: number; wastagePercent?: number }[] };

type TenantSeed = {
  company: string;
  sites: { name: string; type: SiteType; address: string }[];
  users: UserSeed[];
  groups: string[];
  products: ProductSeed[];
  partners: PartnerSeed[];
  recipes?: RecipeSeed[];
  documents: DocSeed[];
  sales: { site: string; cashier: string; days: number; perDay: [number, number]; items: string[]; seed: number };
};

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Valid EAN-13 from a 12-digit body, so the barcode scanner accepts it. */
function ean13(body: string) {
  const sum = [...body].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

/** Deterministic PRNG so every run produces the same demo history. */
function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MARKET: TenantSeed = {
  company: 'Demo Mini Market',
  sites: [
    { name: 'Main Store', type: SiteType.STORE, address: 'Sofia, bul. Vitosha 112' },
    { name: 'Warehouse', type: SiteType.WAREHOUSE, address: 'Sofia, Iliyantsi industrial zone, sklad 7' },
  ],
  users: [
    { email: 'demo-owner@skladnik.dev', name: 'Maria Petrova', role: UserRole.OWNER },
    { email: 'demo-manager@skladnik.dev', name: 'Georgi Ivanov', role: UserRole.SITE_MANAGER, sites: ['Main Store'] },
    { email: 'demo-cashier@skladnik.dev', name: 'Elena Dimitrova', role: UserRole.STAFF, sites: ['Main Store'] },
    { email: 'demo-storekeeper@skladnik.dev', name: 'Nikolay Stoyanov', role: UserRole.STAFF, sites: ['Warehouse'] },
    { email: 'demo-accountant@skladnik.dev', name: 'Vesela Koleva', role: UserRole.ACCOUNTANT },
  ],
  groups: ['Dairy', 'Meat & deli', 'Drinks', 'Bakery', 'Groceries', 'Household'],
  products: [
    { code: 'M-001', name: 'Прясно мляко 3% 1 л', group: 'Dairy', unit: 'L', cost: 0.95, price: 1.49, batch: true, barcode: ean13('380100000001') },
    { code: 'M-002', name: 'Кисело мляко 3.6% 400 г', group: 'Dairy', unit: 'PCS', cost: 0.55, price: 0.89, batch: true, barcode: ean13('380100000002') },
    { code: 'M-003', name: 'Сирене краве', group: 'Dairy', unit: 'KG', cost: 5.1, price: 7.99, batch: true },
    { code: 'M-004', name: 'Кашкавал Витоша 400 г', group: 'Dairy', unit: 'PCS', cost: 3.1, price: 4.79, batch: true, barcode: ean13('380100000004') },
    { code: 'M-005', name: 'Масло 82% 125 г', group: 'Dairy', unit: 'PCS', cost: 1.05, price: 1.69, batch: true, minStock: 30, barcode: ean13('380100000005') },
    { code: 'M-010', name: 'Луканка Смядовска 250 г', group: 'Meat & deli', unit: 'PCS', cost: 2.6, price: 3.99, batch: true, barcode: ean13('380100000010') },
    { code: 'M-011', name: 'Кренвирши 400 г', group: 'Meat & deli', unit: 'PCS', cost: 1.4, price: 2.29, batch: true, barcode: ean13('380100000011') },
    { code: 'M-012', name: 'Пилешко филе', group: 'Meat & deli', unit: 'KG', cost: 4.2, price: 6.49, batch: true },
    { code: 'M-020', name: 'Минерална вода 1.5 л', group: 'Drinks', unit: 'PCS', cost: 0.25, price: 0.49, minStock: 48, barcode: ean13('380100000020') },
    { code: 'M-021', name: 'Кока-Кола 0.5 л', group: 'Drinks', unit: 'PCS', cost: 0.5, price: 0.95, barcode: ean13('380100000021') },
    { code: 'M-022', name: 'Бира Загорка 0.5 л', group: 'Drinks', unit: 'PCS', cost: 0.55, price: 0.99, barcode: ean13('380100000022') },
    { code: 'M-023', name: 'Портокалов сок 1 л', group: 'Drinks', unit: 'PCS', cost: 0.85, price: 1.45, barcode: ean13('380100000023') },
    { code: 'M-024', name: 'Кафе мляно 250 г', group: 'Drinks', unit: 'PCS', cost: 2.2, price: 3.49, barcode: ean13('380100000024') },
    { code: 'M-030', name: 'Хляб Добруджа 650 г', group: 'Bakery', unit: 'PCS', cost: 0.6, price: 0.99, minStock: 25, barcode: ean13('380100000030') },
    { code: 'M-031', name: 'Кроасан с шоколад', group: 'Bakery', unit: 'PCS', cost: 0.3, price: 0.59 },
    { code: 'M-040', name: 'Ориз 1 кг', group: 'Groceries', unit: 'PCS', cost: 1.05, price: 1.69, barcode: ean13('380100000040') },
    { code: 'M-041', name: 'Олио слънчогледово 1 л', group: 'Groceries', unit: 'PCS', cost: 1.15, price: 1.89, barcode: ean13('380100000041') },
    { code: 'M-042', name: 'Захар 1 кг', group: 'Groceries', unit: 'PCS', cost: 0.65, price: 1.09, barcode: ean13('380100000042') },
    { code: 'M-043', name: 'Брашно 1 кг', group: 'Groceries', unit: 'PCS', cost: 0.48, price: 0.79, barcode: ean13('380100000043') },
    { code: 'M-044', name: 'Спагети 500 г', group: 'Groceries', unit: 'PCS', cost: 0.55, price: 0.89, barcode: ean13('380100000044') },
    { code: 'M-050', name: 'Препарат за съдове 500 мл', group: 'Household', unit: 'PCS', cost: 0.9, price: 1.49, barcode: ean13('380100000050') },
    { code: 'M-051', name: 'Тоалетна хартия 8 бр.', group: 'Household', unit: 'PACK', cost: 1.8, price: 2.89, barcode: ean13('380100000051') },
    { code: 'M-052', name: 'Прах за пране 2 кг', group: 'Household', unit: 'PCS', cost: 4.4, price: 6.99, minStock: 6, barcode: ean13('380100000052') },
  ],
  partners: [
    { name: 'Балкан Дистрибуция ООД', taxId: '204512873', kind: 'SUPPLIER', address: 'София, ул. Околовръстен път 251', mol: 'Иван Георгиев', phone: '0888123456' },
    { name: 'Млечен път ЕООД', taxId: '203998412', kind: 'SUPPLIER', address: 'Троян, ул. Васил Левски 14', mol: 'Петя Маринова', phone: '0877654321' },
    { name: 'Родопски деликатеси АД', taxId: '175632904', kind: 'SUPPLIER', address: 'Смолян, бул. България 3', mol: 'Христо Ангелов', phone: '0899111222' },
    { name: 'Хлебозавод Изгрев ЕООД', taxId: '131245780', kind: 'SUPPLIER', address: 'София, ж.к. Изгрев, ул. Сланина 5', mol: 'Стоян Колев', phone: '0887333444' },
    { name: 'Хотел Панорама ООД', taxId: '205331472', kind: 'CUSTOMER', address: 'Банско, ул. Пирин 40', mol: 'Анна Тодорова', phone: '0898555666' },
  ],
  documents: [
    {
      daysAgo: 30, site: 'Warehouse', type: 'INVOICE', number: '0000451201', status: 'POSTED', partnerTaxId: '204512873',
      lines: [
        { code: 'M-020', qty: 480 }, { code: 'M-021', qty: 240 }, { code: 'M-022', qty: 240 }, { code: 'M-023', qty: 120 },
        { code: 'M-024', qty: 60 }, { code: 'M-040', qty: 100 }, { code: 'M-041', qty: 100 }, { code: 'M-042', qty: 100 },
        { code: 'M-043', qty: 100 }, { code: 'M-044', qty: 150 }, { code: 'M-050', qty: 60 }, { code: 'M-051', qty: 60 },
      ],
    },
    {
      daysAgo: 25, site: 'Warehouse', type: 'TRANSFER', number: 'TR-0001', status: 'POSTED', targetSite: 'Main Store',
      notes: 'Weekly shelf refill',
      lines: [
        { code: 'M-020', qty: 120 }, { code: 'M-021', qty: 96 }, { code: 'M-022', qty: 96 }, { code: 'M-023', qty: 48 },
        { code: 'M-024', qty: 20 }, { code: 'M-040', qty: 30 }, { code: 'M-041', qty: 30 }, { code: 'M-042', qty: 30 },
        { code: 'M-043', qty: 30 }, { code: 'M-044', qty: 40 }, { code: 'M-050', qty: 30 }, { code: 'M-051', qty: 20 },
      ],
    },
    {
      daysAgo: 24, site: 'Main Store', type: 'INVOICE', number: '2000038814', status: 'POSTED', partnerTaxId: '203998412',
      lines: [
        { code: 'M-001', qty: 48, batch: 'MP-2409', expiresInDays: 3 },
        { code: 'M-002', qty: 60, batch: 'MP-2410', expiresInDays: 9 },
        { code: 'M-002', qty: 6, batch: 'MP-0815', expiresInDays: -1 },
        { code: 'M-003', qty: 12, batch: 'SR-118', expiresInDays: 40 },
        { code: 'M-004', qty: 24, batch: 'KV-0921', expiresInDays: 60 },
        { code: 'M-005', qty: 24, batch: 'MS-0930', expiresInDays: 45 },
      ],
    },
    {
      daysAgo: 22, site: 'Main Store', type: 'INVOICE', number: '0000093127', status: 'POSTED', partnerTaxId: '175632904',
      lines: [
        { code: 'M-010', qty: 30, batch: 'LK-5501', expiresInDays: 90 },
        { code: 'M-011', qty: 40, batch: 'KR-7730', expiresInDays: 12 },
        { code: 'M-012', qty: 15, batch: 'PF-2209', expiresInDays: 2 },
      ],
    },
    {
      daysAgo: 20, site: 'Main Store', type: 'RECEIPT', number: 'СР-004417', status: 'POSTED', partnerTaxId: '131245780',
      lines: [{ code: 'M-030', qty: 40 }, { code: 'M-031', qty: 60 }],
    },
    {
      daysAgo: 7, site: 'Main Store', type: 'INVOICE', number: '2000039102', status: 'POSTED', partnerTaxId: '203998412',
      lines: [
        { code: 'M-001', qty: 36, batch: 'MP-2415', expiresInDays: 10 },
        { code: 'M-002', qty: 24, batch: 'MP-2416', expiresInDays: 14 },
      ],
    },
    {
      daysAgo: 6, site: 'Warehouse', type: 'PROTOCOL', number: 'ИЗ-000112', status: 'POSTED', partnerTaxId: '205331472',
      notes: 'Delivery to the hotel bar',
      lines: [{ code: 'M-020', qty: 48, price: 0.35 }, { code: 'M-021', qty: 24, price: 0.7 }],
    },
    {
      daysAgo: 3, site: 'Main Store', type: 'PROTOCOL', number: 'ПБ-0001', status: 'POSTED', writeOffReason: 'EXPIRED',
      notes: 'Expired yoghurt removed from the fridge',
      lines: [{ code: 'M-002', qty: 6, batch: 'MP-0815', expiresInDays: -1 }],
    },
    {
      daysAgo: 2, site: 'Main Store', type: 'PROTOCOL', number: 'ПБ-0002', status: 'POSTED', writeOffReason: 'DAMAGED',
      notes: 'Bottles broken while unloading',
      lines: [{ code: 'M-041', qty: 2 }],
    },
    {
      daysAgo: 1, site: 'Main Store', type: 'INVOICE', number: '0000452877', status: 'REVIEW', partnerTaxId: '204512873',
      notes: 'Ready to post — check the lines and press Post',
      lines: [{ code: 'M-052', qty: 12 }, { code: 'M-042', qty: 20 }, { code: 'M-043', qty: 20 }],
    },
    {
      daysAgo: 0, site: 'Main Store', type: 'RECEIPT', number: 'СР-004533', status: 'DRAFT', partnerTaxId: '131245780',
      lines: [{ code: 'M-030', qty: 30 }, { code: 'M-031', qty: 40 }],
    },
  ],
  sales: {
    site: 'Main Store',
    cashier: 'demo-cashier@skladnik.dev',
    days: 13,
    perDay: [4, 9],
    items: ['M-001', 'M-002', 'M-003', 'M-004', 'M-005', 'M-010', 'M-011', 'M-012', 'M-020', 'M-021', 'M-022', 'M-023', 'M-024', 'M-030', 'M-031', 'M-040', 'M-041', 'M-042', 'M-044', 'M-050', 'M-051'],
    seed: 20260929,
  },
};

const CAFE: TenantSeed = {
  company: 'Demo Café',
  sites: [{ name: 'Café Bar', type: SiteType.BAR, address: 'Plovdiv, ul. Knyaz Alexander I 21' }],
  users: [
    { email: 'cafe-owner@skladnik.dev', name: 'Dimitar Nikolov', role: UserRole.OWNER },
    { email: 'cafe-barista@skladnik.dev', name: 'Iva Hristova', role: UserRole.STAFF, sites: ['Café Bar'] },
  ],
  groups: ['Ingredients', 'Coffee drinks', 'Pastry & drinks'],
  products: [
    { code: 'C-001', name: 'Кафе на зърна Арабика', group: 'Ingredients', unit: 'KG', cost: 16, price: 0, minStock: 2 },
    { code: 'C-002', name: 'Прясно мляко 3.5%', group: 'Ingredients', unit: 'L', cost: 0.95, price: 0, minStock: 10 },
    { code: 'C-003', name: 'Захар', group: 'Ingredients', unit: 'KG', cost: 0.65, price: 0 },
    { code: 'C-004', name: 'Сироп ванилия', group: 'Ingredients', unit: 'L', cost: 7.5, price: 0 },
    { code: 'C-010', name: 'Еспресо', group: 'Coffee drinks', unit: 'PCS', cost: 0, price: 1.5 },
    { code: 'C-011', name: 'Капучино', group: 'Coffee drinks', unit: 'PCS', cost: 0, price: 2.2 },
    { code: 'C-012', name: 'Лате с ванилия', group: 'Coffee drinks', unit: 'PCS', cost: 0, price: 2.8 },
    { code: 'C-020', name: 'Кроасан с масло', group: 'Pastry & drinks', unit: 'PCS', cost: 0.35, price: 1.2 },
    { code: 'C-021', name: 'Минерална вода 0.5 л', group: 'Pastry & drinks', unit: 'PCS', cost: 0.22, price: 1, barcode: ean13('380200000021') },
  ],
  partners: [
    { name: 'Кафе Импорт ООД', taxId: '206117345', kind: 'SUPPLIER', address: 'Пловдив, ул. Брезовско шосе 120', mol: 'Росен Динев', phone: '0886777888' },
  ],
  recipes: [
    { dish: 'C-010', ingredients: [{ code: 'C-001', qty: 0.008 }, { code: 'C-003', qty: 0.005 }] },
    { dish: 'C-011', ingredients: [{ code: 'C-001', qty: 0.008 }, { code: 'C-002', qty: 0.12, wastagePercent: 5 }] },
    { dish: 'C-012', ingredients: [{ code: 'C-001', qty: 0.008 }, { code: 'C-002', qty: 0.2, wastagePercent: 5 }, { code: 'C-004', qty: 0.015 }] },
  ],
  documents: [
    {
      daysAgo: 12, site: 'Café Bar', type: 'INVOICE', number: '0000007731', status: 'POSTED', partnerTaxId: '206117345',
      lines: [
        { code: 'C-001', qty: 5 }, { code: 'C-002', qty: 40 }, { code: 'C-003', qty: 5 }, { code: 'C-004', qty: 3 },
        { code: 'C-020', qty: 80 }, { code: 'C-021', qty: 96 },
      ],
    },
  ],
  sales: {
    site: 'Café Bar',
    cashier: 'cafe-barista@skladnik.dev',
    days: 10,
    perDay: [8, 14],
    items: ['C-010', 'C-010', 'C-011', 'C-011', 'C-011', 'C-012', 'C-020', 'C-021'],
    seed: 20260930,
  },
};

function documentsService(prisma: PrismaService) {
  const storage = {} as StorageService;
  const ocrQueue = { add: async () => undefined } as unknown as Queue<OcrJobData>;
  return new DocumentsService(prisma, storage, ocrQueue);
}

/** Removes a demo company and everything in it. Ledger and document rows use Restrict keys, so they go first. */
async function resetTenant(prisma: PrismaService, name: string) {
  const company = await prisma.company.findFirst({ where: { name }, select: { id: true } });
  if (!company) return;
  const where = { companyId: company.id };
  await prisma.$transaction([
    prisma.stockMovement.deleteMany({ where }),
    prisma.stockCost.deleteMany({ where }),
    prisma.documentLine.deleteMany({ where }),
    prisma.documentCapture.deleteMany({ where }),
    prisma.document.deleteMany({ where: { ...where, reversalOfId: { not: null } } }),
    prisma.document.deleteMany({ where }),
    prisma.recipeIngredient.deleteMany({ where }),
    prisma.recipe.deleteMany({ where }),
    prisma.batch.deleteMany({ where }),
    prisma.supplierProductCode.deleteMany({ where }),
    prisma.productBarcode.deleteMany({ where }),
    prisma.product.deleteMany({ where }),
    prisma.productGroup.updateMany({ where, data: { parentId: null } }),
    prisma.productGroup.deleteMany({ where }),
    prisma.invitation.deleteMany({ where }),
    prisma.company.delete({ where: { id: company.id } }),
  ]);
  console.log(`${name}: removed for a fresh seed.`);
}

async function seedTenant(prisma: PrismaService, tenant: TenantSeed, passwordHash: string, today: string): Promise<SeedUser[]> {
  const company =
    (await prisma.company.findFirst({ where: { name: tenant.company } })) ??
    (await prisma.company.create({ data: { name: tenant.company } }));
  await seedUnitAliases(prisma, company.id);

  const siteIds = new Map<string, string>();
  for (const site of tenant.sites) {
    const row = await prisma.site.upsert({
      where: { companyId_name: { companyId: company.id, name: site.name } },
      update: {},
      create: { companyId: company.id, name: site.name, type: site.type, address: site.address },
    });
    siteIds.set(site.name, row.id);
  }

  const authUsers = new Map<string, AuthUser>();
  for (const seed of tenant.users) {
    const user = await prisma.user.upsert({
      where: { email: seed.email },
      update: { name: seed.name, role: seed.role, companyId: company.id, passwordHash, isActive: true },
      create: { email: seed.email, name: seed.name, role: seed.role, companyId: company.id, passwordHash },
    });
    const assigned = (seed.sites ?? []).map((name) => siteIds.get(name)!);
    for (const siteId of assigned) {
      await prisma.userSite.upsert({
        where: { userId_siteId: { userId: user.id, siteId } },
        update: {},
        create: { userId: user.id, siteId },
      });
    }
    const allSites = seed.role === UserRole.OWNER || seed.role === UserRole.ACCOUNTANT;
    authUsers.set(seed.email, {
      id: user.id,
      email: user.email,
      name: user.name,
      role: seed.role,
      companyId: company.id,
      siteIds: allSites ? [...siteIds.values()] : assigned,
      allSites,
    });
  }
  const users = tenant.users.map((seed) => ({
    email: seed.email,
    company: tenant.company,
    role: seed.sites ? `${seed.role}, ${seed.sites.join(', ')} only` : `${seed.role}, all sites`,
  }));

  // Master data is upserted every run; the history below is written only once.
  if ((await prisma.document.count({ where: { companyId: company.id } })) > 0) {
    console.log(`${tenant.company}: already has documents, history left as it is.`);
    return users;
  }

  const groupIds = new Map<string, string>();
  for (const name of tenant.groups) {
    const group =
      (await prisma.productGroup.findFirst({ where: { companyId: company.id, name, parentId: null } })) ??
      (await prisma.productGroup.create({ data: { companyId: company.id, name } }));
    groupIds.set(name, group.id);
  }

  const products = new Map<string, { id: string; seed: ProductSeed }>();
  for (const seed of tenant.products) {
    const data = {
      name: seed.name,
      groupId: seed.group ? groupIds.get(seed.group)! : null,
      unit: seed.unit,
      vatRate: 20,
      purchasePrice: seed.cost,
      sellingPrice: seed.price,
      minStock: seed.minStock ?? 0,
      batchTracking: seed.batch ?? false,
      status: 'ACTIVE' as const,
    };
    const product = await prisma.product.upsert({
      where: { companyId_code: { companyId: company.id, code: seed.code } },
      update: data,
      create: { companyId: company.id, code: seed.code, ...data },
    });
    if (seed.barcode) {
      await prisma.productBarcode.createMany({
        data: [{ companyId: company.id, productId: product.id, barcode: seed.barcode }],
        skipDuplicates: true,
      });
    }
    products.set(seed.code, { id: product.id, seed });
  }

  const partnerIds = new Map<string, string>();
  for (const seed of tenant.partners) {
    const { taxId, ...rest } = seed;
    const partner = await prisma.partner.upsert({
      where: { companyId_taxId: { companyId: company.id, taxId } },
      update: rest,
      create: { companyId: company.id, taxId, ...rest },
    });
    partnerIds.set(taxId, partner.id);
  }

  const owner = [...authUsers.values()].find((user) => user.role === UserRole.OWNER)!;

  const recipes = new RecipesService(prisma);
  for (const recipe of tenant.recipes ?? []) {
    await recipes.save(owner, products.get(recipe.dish)!.id, {
      yieldPortions: 1,
      markupPercent: 200,
      ingredients: recipe.ingredients.map((row) => ({
        productId: products.get(row.code)!.id,
        quantity: row.qty,
        wastagePercent: row.wastagePercent,
      })),
    });
  }

  const documents = documentsService(prisma);
  for (const seed of [...tenant.documents].sort((a, b) => b.daysAgo - a.daysAgo)) {
    const issuedOn = addDays(today, -seed.daysAgo);
    const { document: created } = await documents.create(owner, {
      type: seed.type,
      siteId: siteIds.get(seed.site)!,
      partnerId: seed.partnerTaxId ? partnerIds.get(seed.partnerTaxId) : undefined,
      targetSiteId: seed.targetSite ? siteIds.get(seed.targetSite) : undefined,
      documentNumber: seed.number,
      issuedOn,
      writeOffReason: seed.writeOffReason,
      notes: seed.notes,
    });
    for (const line of seed.lines) {
      const product = products.get(line.code)!;
      await documents.addLine(owner, created.id, {
        productId: product.id,
        quantity: line.qty,
        unitPrice: line.price ?? product.seed.cost,
        batchNumber: line.batch,
        expiryDate: line.expiresInDays === undefined ? undefined : addDays(today, line.expiresInDays),
      });
    }
    if (seed.status === 'DRAFT') continue;
    await documents.submitForReview(owner, created.id);
    if (seed.status !== 'POSTED') continue;
    await documents.post(owner, created.id);
    await prisma.document.update({
      where: { id: created.id },
      data: { postedAt: new Date(dayStart(issuedOn).getTime() + 10 * 3_600_000) },
    });
  }

  const { made, skipped } = await seedSales(prisma, tenant, today, {
    cashier: authUsers.get(tenant.sales.cashier)!,
    siteId: siteIds.get(tenant.sales.site)!,
    products,
  });
  console.log(`${tenant.company}: ${tenant.documents.length} documents, ${made} till sales${skipped ? ` (${skipped} skipped for stock)` : ''}.`);
  return users;
}

/**
 * Till sales go through SalesService so FEFO, costs and stock checks are the real ones. It stamps every
 * sale with the current time, so each one is then moved back to its day and given that day's number.
 */
async function seedSales(
  prisma: PrismaService,
  tenant: TenantSeed,
  today: string,
  ctx: { cashier: AuthUser; siteId: string; products: Map<string, { id: string; seed: ProductSeed }> },
) {
  const sales = new SalesService(prisma);
  const rand = mulberry32(tenant.sales.seed);
  const [min, max] = tenant.sales.perDay;
  const now = Date.now();
  let made = 0;
  let skipped = 0;

  for (let daysAgo = tenant.sales.days; daysAgo >= 0; daysAgo -= 1) {
    const date = addDays(today, -daysAgo);
    const opensAt = dayStart(date).getTime();
    const count = min + Math.floor(rand() * (max - min + 1));
    const minutes = Array.from({ length: count }, () => 8 * 60 + Math.floor(rand() * 12 * 60)).sort((a, b) => a - b);
    let sequence = 0;

    for (const minute of minutes) {
      const at = new Date(opensAt + minute * 60_000);
      if (at.getTime() > now) break;
      const codes = new Set<string>();
      const lines = 1 + Math.floor(rand() * 3) + (rand() < 0.15 ? 1 : 0);
      while (codes.size < lines) codes.add(tenant.sales.items[Math.floor(rand() * tenant.sales.items.length)]);
      const items = [...codes].map((code) => {
        const product = ctx.products.get(code)!;
        const loose = product.seed.unit === 'KG';
        return {
          productId: product.id,
          quantity: loose ? round3(0.25 + rand() * 0.9) : 1 + Math.floor(rand() * (rand() < 0.8 ? 2 : 4)),
        };
      });
      const paymentMethod: PaymentMethod = rand() < 0.6 ? 'CASH' : 'CARD';

      try {
        const { sale } = await sales.create(ctx.cashier, { siteId: ctx.siteId, paymentMethod, items });
        sequence += 1;
        await prisma.$transaction([
          prisma.document.update({
            where: { id: sale.id },
            data: {
              number: `S${date.replaceAll('-', '')}-${String(sequence).padStart(4, '0')}`,
              issuedOn: new Date(`${date}T00:00:00Z`),
              postedAt: at,
              createdAt: at,
            },
          }),
          prisma.stockMovement.updateMany({ where: { documentId: sale.id }, data: { occurredAt: at, createdAt: at } }),
          prisma.activityLog.updateMany({ where: { entityId: sale.id }, data: { createdAt: at } }),
        ]);
        made += 1;
      } catch {
        skipped += 1;
      }
    }
  }
  return { made, skipped };
}

/** Demo dates are relative to the day of the run; `reset` rebuilds the demo companies so the history is current again. */
export async function seedDemo(prisma: PrismaService, passwordHash: string, options: { reset?: boolean } = {}) {
  const today = businessDate();
  const users: SeedUser[] = [];
  for (const tenant of [MARKET, CAFE]) {
    if (options.reset) await resetTenant(prisma, tenant.company);
    users.push(...(await seedTenant(prisma, tenant, passwordHash, today)));
  }
  return users;
}
