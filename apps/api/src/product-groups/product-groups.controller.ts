import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import type { AuthUser } from '@skladnik/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateProductGroupDto } from './dto/create-product-group.dto';
import { UpdateProductGroupDto } from './dto/update-product-group.dto';
import { ProductGroupsService } from './product-groups.service';

@Controller('product-groups')
export class ProductGroupsController {
  constructor(private readonly groups: ProductGroupsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.groups.list(user);
  }

  @Post()
  @Roles('OWNER', 'ACCOUNTANT')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductGroupDto) {
    return this.groups.create(user, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ACCOUNTANT')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductGroupDto,
  ) {
    return this.groups.update(user, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ACCOUNTANT')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.groups.remove(user, id);
  }
}
