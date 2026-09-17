import { Module } from '@nestjs/common';
import { ProductGroupsController } from './product-groups.controller';
import { ProductGroupsService } from './product-groups.service';

@Module({
  controllers: [ProductGroupsController],
  providers: [ProductGroupsService],
})
export class ProductGroupsModule {}
