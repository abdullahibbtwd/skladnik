import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '@skladnik/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateSupplierCodeDto } from './dto/create-supplier-code.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';
import { Tenant } from '../auth/decorators/auth-realm.decorator';

@Tenant()
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListProductsQueryDto) {
    return this.products.list(user, query);
  }

  @Post()
  @Roles('OWNER')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.products.create(user, dto);
  }

  /** Owner: full catalog. Site manager: minStock only (enforced in the service). ACC-01: Accountant read-only. */
  @Patch(':id')
  @Roles('OWNER', 'SITE_MANAGER')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(user, id, dto);
  }

  /** CAF-03: manager turns batch tracking on without changing the stock total. */
  @Post(':id/enable-batch-tracking')
  @Roles('OWNER', 'SITE_MANAGER')
  enableBatchTracking(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.enableBatchTracking(user, id);
  }

  /** CAF-02: merge a pending scan product into an existing catalog product. */
  @Post(':id/merge')
  @Roles('OWNER', 'SITE_MANAGER')
  merge(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: { productId?: string }) {
    if (!body?.productId) {
      return this.products.mergePending(user, id, '');
    }
    return this.products.mergePending(user, id, body.productId);
  }

  @Delete(':id')
  @Roles('OWNER')
  archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.archive(user, id);
  }

  @Post(':id/supplier-codes')
  @Roles('OWNER')
  addSupplierCode(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSupplierCodeDto,
  ) {
    return this.products.addSupplierCode(user, id, dto);
  }

  @Delete(':id/supplier-codes/:mappingId')
  @Roles('OWNER')
  removeSupplierCode(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mappingId', ParseUUIDPipe) mappingId: string,
  ) {
    return this.products.removeSupplierCode(user, id, mappingId);
  }
}
