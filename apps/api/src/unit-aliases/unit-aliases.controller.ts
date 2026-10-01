import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import type { AuthUser } from '@skladnik/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateUnitAliasDto } from './dto/create-unit-alias.dto';
import { UpdateUnitAliasDto } from './dto/update-unit-alias.dto';
import { UnitAliasesService } from './unit-aliases.service';

@Controller('unit-aliases')
export class UnitAliasesController {
  constructor(private readonly aliases: UnitAliasesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.aliases.list(user);
  }

  @Post()
  @Roles('OWNER')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUnitAliasDto) {
    return this.aliases.create(user, dto);
  }

  @Patch(':id')
  @Roles('OWNER')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUnitAliasDto,
  ) {
    return this.aliases.update(user, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.aliases.remove(user, id);
  }
}
