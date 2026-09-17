import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { AuthModule } from './auth/auth.module';
import { DocumentsModule } from './documents/documents.module';
import { ExtractionModule } from './extraction/extraction.module';
import { HealthModule } from './health/health.module';
import { InvitesModule } from './invites/invites.module';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';
import { PartnersModule } from './partners/partners.module';
import { ProductGroupsModule } from './product-groups/product-groups.module';
import { ProductsModule } from './products/products.module';
import { SitesModule } from './sites/sites.module';
import { StorageModule } from './storage/storage.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { UnitAliasesModule } from './unit-aliases/unit-aliases.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.SKLADNIK_IN_DOCKER === '1',
      envFilePath: [
        join(process.cwd(), '.env'),
        join(process.cwd(), '..', '..', '.env'),
        join(__dirname, '..', '.env'),
        join(__dirname, '..', '..', '..', '.env'),
      ],
    }),
    PrismaModule,
    RedisModule,
    MailModule,
    QueueModule,
    AuthModule,
    TenancyModule,
    SitesModule,
    UsersModule,
    InvitesModule,
    ProductGroupsModule,
    PartnersModule,
    ProductsModule,
    UnitAliasesModule,
    DocumentsModule,
    ExtractionModule,
    StorageModule,
    HealthModule,
  ],
})
export class AppModule {}
