import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { OPERATIONAL_MANAGER_ROLES, type AuthUser } from '@skladnik/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SiteScoped } from '../auth/decorators/site-scoped.decorator';
import { SiteAccessGuard } from '../auth/guards/site-access.guard';
import { RecipeSiteQueryDto, SaveRecipeDto } from './dto/recipe.dto';
import { RecipesService } from './recipes.service';
import { Tenant } from '../auth/decorators/auth-realm.decorator';

/** Cards and their costs are for operational managers; ACC-01 Accountant excluded. Till uses /menu. */
@Tenant()
@Controller('recipes')
export class RecipesController {
  constructor(private readonly recipes: RecipesService) {}

  @Get()
  @Roles(...OPERATIONAL_MANAGER_ROLES)
  @UseGuards(SiteAccessGuard)
  @SiteScoped('siteId')
  list(@CurrentUser() user: AuthUser, @Query() query: RecipeSiteQueryDto) {
    return this.recipes.list(user, query.siteId);
  }

  @Get('menu')
  @UseGuards(SiteAccessGuard)
  @SiteScoped('siteId')
  menu(@CurrentUser() user: AuthUser, @Query() query: RecipeSiteQueryDto) {
    return this.recipes.menu(user, query.siteId);
  }

  @Get(':productId')
  @Roles(...OPERATIONAL_MANAGER_ROLES)
  @UseGuards(SiteAccessGuard)
  @SiteScoped('siteId')
  get(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query() query: RecipeSiteQueryDto,
  ) {
    return this.recipes.get(user, productId, query.siteId);
  }

  @Put(':productId')
  @Roles(...OPERATIONAL_MANAGER_ROLES)
  save(@CurrentUser() user: AuthUser, @Param('productId', ParseUUIDPipe) productId: string, @Body() dto: SaveRecipeDto) {
    return this.recipes.save(user, productId, dto);
  }

  @Delete(':productId')
  @Roles(...OPERATIONAL_MANAGER_ROLES)
  remove(@CurrentUser() user: AuthUser, @Param('productId', ParseUUIDPipe) productId: string) {
    return this.recipes.remove(user, productId);
  }
}
