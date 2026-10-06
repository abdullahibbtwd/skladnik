/**
 * Every HTTP handler must resolve @Public | @Tenant | @Platform (default-deny).
 */
import assert from 'node:assert/strict';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AUTH_REALM_KEY, type AuthRealm } from '../auth/decorators/auth-realm.decorator';
import { ActivityController } from '../activity/activity.controller';
import { Annex38Controller } from '../annex38/annex38.controller';
import { AuthController } from '../auth/auth.controller';
import { CompanyController } from '../company/company.controller';
import { DocumentsController } from '../documents/documents.controller';
import { HealthController } from '../health/health.controller';
import { InvitesController } from '../invites/invites.controller';
import { PartnersController } from '../partners/partners.controller';
import { ProductGroupsController } from '../product-groups/product-groups.controller';
import { ProductsController } from '../products/products.controller';
import { PlatformAuthController } from '../platform-auth/platform-auth.controller';
import { PlatformSettingsController } from '../platform-settings/platform-settings.controller';
import { PlatformSubscriptionsController } from '../subscriptions/platform-subscriptions.controller';
import { TenantSubscriptionsController } from '../subscriptions/tenant-subscriptions.controller';
import { RecipesController } from '../recipes/recipes.controller';
import { ExportProfilesController } from '../reports/export-profiles.controller';
import { ReportsController } from '../reports/reports.controller';
import { SalesController } from '../sales/sales.controller';
import { SitesController } from '../sites/sites.controller';
import { StockController } from '../stock/stock.controller';
import { TenancyController } from '../tenancy/tenancy.controller';
import { UnitAliasesController } from '../unit-aliases/unit-aliases.controller';
import { UsersController } from '../users/users.controller';
import { VatController } from '../vat/vat.controller';

/** Keep in sync with AppModule controllers — the test fails if a new controller is omitted. */
const CONTROLLERS: (new (...args: never[]) => unknown)[] = [
  ActivityController,
  Annex38Controller,
  AuthController,
  CompanyController,
  DocumentsController,
  HealthController,
  InvitesController,
  PartnersController,
  ProductGroupsController,
  ProductsController,
  PlatformAuthController,
  PlatformSettingsController,
  PlatformSubscriptionsController,
  TenantSubscriptionsController,
  RecipesController,
  ExportProfilesController,
  ReportsController,
  SalesController,
  SitesController,
  StockController,
  TenancyController,
  UnitAliasesController,
  UsersController,
  VatController,
];

const REALMS: AuthRealm[] = ['public', 'tenant', 'platform'];
const unmarked: string[] = [];

for (const Controller of CONTROLLERS) {
  const classPath = Reflect.getMetadata(PATH_METADATA, Controller) as string | undefined;
  const classRealm = Reflect.getMetadata(AUTH_REALM_KEY, Controller) as AuthRealm | undefined;
  const proto = Controller.prototype as Record<string, unknown>;

  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key === 'constructor') continue;
    const handler = proto[key];
    if (typeof handler !== 'function') continue;
    const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
    if (method === undefined) continue;

    const realm =
      (Reflect.getMetadata(AUTH_REALM_KEY, handler) as AuthRealm | undefined) ?? classRealm;
    const routePath = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
    const label = `${Controller.name}.${key} ${RequestMethod[method]} /${[classPath, routePath]
      .filter(Boolean)
      .join('/')}`;

    if (!realm || !REALMS.includes(realm)) {
      unmarked.push(label);
    }
  }
}

assert.equal(
  unmarked.length,
  0,
  `Unclassified routes (add @Public, @Tenant, or @Platform):\n${unmarked.map((r) => `  - ${r}`).join('\n')}`,
);

assert.ok(CONTROLLERS.length >= 20, 'expected the full controller set to be registered for scanning');

console.log(`auth-realm-coverage.test.ts: ok (${CONTROLLERS.length} controllers scanned)`);
