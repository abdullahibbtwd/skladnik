import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { SALES_MANAGER_ROLES, type AuthUser } from '@skladnik/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SiteScoped } from '../auth/decorators/site-scoped.decorator';
import { SiteAccessGuard } from '../auth/guards/site-access.guard';
import { RecipeSiteQueryDto, SaveRecipeDto } from './dto/recipe.dto';
import { RecipesService } from './recipes.service';

/** Cards and their costs are for managers; the till only reads the menu (no costs). */
@Controller('recipes')
export class RecipesController {
  constructor(private readonly recipes: RecipesService) {}

  @Get()
  @Roles(...SALES_MANAGER_ROLES)
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
  @Roles(...SALES_MANAGER_ROLES)
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
  @Roles(...SALES_MANAGER_ROLES)
  save(@CurrentUser() user: AuthUser, @Param('productId', ParseUUIDPipe) productId: string, @Body() dto: SaveRecipeDto) {
    return this.recipes.save(user, productId, dto);
  }

  @Delete(':productId')
  @Roles(...SALES_MANAGER_ROLES)
  remove(@CurrentUser() user: AuthUser, @Param('productId', ParseUUIDPipe) productId: string) {
    return this.recipes.remove(user, productId);
  }
}
