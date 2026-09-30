import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  grossQuantity,
  recipeCosting,
  recipeQtyToStock,
  recipeUnitProblem,
  type AuthUser,
  type ContentUnit,
} from '@skladnik/shared';
import { toNumber } from '../common/decimal';
import { changes, recordActivity } from '../activity/record-activity';
import { PrismaService } from '../prisma/prisma.service';
import type { CostBook } from '../stock/costing';
import { loadCostBook } from '../stock/ledger';
import type { SaveRecipeDto } from './dto/recipe.dto';

const round4 = (value: number) => Math.round(value * 10000) / 10000;

const dishSelect = {
  id: true,
  name: true,
  code: true,
  unit: true,
  status: true,
  sellingPrice: true,
  vatRate: true,
  group: { select: { id: true, name: true } },
} satisfies Prisma.ProductSelect;

const ingredientProductSelect = {
  id: true,
  name: true,
  code: true,
  unit: true,
  status: true,
  batchTracking: true,
  netContent: true,
  netContentUnit: true,
} satisfies Prisma.ProductSelect;

const recipeInclude = {
  product: { select: dishSelect },
  ingredients: {
    orderBy: { position: 'asc' },
    include: {
      product: { select: ingredientProductSelect },
    },
  },
} satisfies Prisma.RecipeInclude;

type RecipeRow = Prisma.RecipeGetPayload<{ include: typeof recipeInclude }>;

type IngredientProduct = Prisma.ProductGetPayload<{ select: typeof ingredientProductSelect }>;

function productContent(product: Pick<IngredientProduct, 'unit' | 'netContent' | 'netContentUnit'>) {
  return {
    unit: product.unit,
    netContent: product.netContent === null ? null : toNumber(product.netContent),
    netContentUnit: product.netContentUnit as ContentUnit | null,
  };
}

/** Net quantity in stock units (for costing and stock issue). */
function stockNetQty(
  quantity: number,
  quantityUnit: ContentUnit | null | undefined,
  product: Pick<IngredientProduct, 'name' | 'unit' | 'netContent' | 'netContentUnit'>,
) {
  const content = productContent(product);
  const problem = recipeUnitProblem(quantityUnit, content, product.name);
  if (problem) throw new BadRequestException(problem);
  const stock = recipeQtyToStock(quantity, quantityUnit, content);
  if (stock == null) throw new BadRequestException(recipeUnitProblem(quantityUnit, content, product.name) ?? 'Invalid recipe unit');
  return stock;
}

/** What one unit of an ingredient costs at a site right now: on-hand value ÷ on hand, else the average / catalog price. */
function currentUnitCost(book: CostBook, productId: string) {
  const onHand = book.onHand(productId);
  return onHand > 0 ? round4(book.value(productId) / onHand) : book.average(productId);
}

function costRecipe(recipe: RecipeRow, book: CostBook) {
  return recipeCosting({
    yieldPortions: toNumber(recipe.yieldPortions),
    markupPercent: toNumber(recipe.markupPercent),
    sellingPrice: toNumber(recipe.product.sellingPrice),
    vatRate: toNumber(recipe.product.vatRate),
    ingredients: recipe.ingredients.map((row) => ({
      quantity: stockNetQty(toNumber(row.quantity), row.quantityUnit as ContentUnit | null, row.product),
      wastagePercent: toNumber(row.wastagePercent),
      unitCost: currentUnitCost(book, row.productId),
    })),
  });
}

function dishView(product: Prisma.ProductGetPayload<{ select: typeof dishSelect }>) {
  return { ...product, sellingPrice: toNumber(product.sellingPrice), vatRate: toNumber(product.vatRate) };
}

/**
 * Technological cards (§4.5). A recipe belongs to a dish product; selling the dish issues the
 * ingredients (see SalesService). Costs are per site, from the same weighted averages as stock value.
 */
@Injectable()
export class RecipesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, siteId: string) {
    const recipes = await this.prisma.recipe.findMany({
      where: { companyId: user.companyId },
      include: recipeInclude,
      orderBy: { product: { name: 'asc' } },
    });
    const ingredientIds = [...new Set(recipes.flatMap((recipe) => recipe.ingredients.map((row) => row.productId)))];
    const { book } = await loadCostBook(this.prisma, user.companyId, siteId, ingredientIds);
    return {
      siteId,
      recipes: recipes.map((recipe) => {
        const costing = costRecipe(recipe, book);
        return {
          dish: dishView(recipe.product),
          yieldPortions: toNumber(recipe.yieldPortions),
          markupPercent: toNumber(recipe.markupPercent),
          ingredientCount: recipe.ingredients.length,
          costPerPortion: costing.costPerPortion,
          missingCosts: costing.missingCosts,
          profit: costing.profit,
          marginPercent: costing.marginPercent,
          foodCostPercent: costing.foodCostPercent,
          suggestedPrice: costing.suggestedPrice,
          updatedAt: recipe.updatedAt.toISOString(),
        };
      }),
    };
  }

  /** The card of one dish with each ingredient's current cost and stock at the site. `recipe` is null before the first save. */
  async get(user: AuthUser, productId: string, siteId: string) {
    const dish = await this.prisma.product.findFirst({ where: { id: productId, companyId: user.companyId }, select: dishSelect });
    if (!dish) throw new NotFoundException('Product not found');
    const recipe = await this.prisma.recipe.findUnique({ where: { productId }, include: recipeInclude });
    const usedIn = await this.prisma.recipeIngredient.count({ where: { companyId: user.companyId, productId } });
    if (!recipe) {
      return { dish: dishView(dish), usedAsIngredient: usedIn > 0, recipe: null, ingredients: [], costing: null };
    }

    const { book } = await loadCostBook(
      this.prisma,
      user.companyId,
      siteId,
      recipe.ingredients.map((row) => row.productId),
    );
    const costing = costRecipe(recipe, book);
    return {
      dish: dishView(dish),
      usedAsIngredient: usedIn > 0,
      recipe: {
        yieldPortions: toNumber(recipe.yieldPortions),
        markupPercent: toNumber(recipe.markupPercent),
        notes: recipe.notes,
        updatedAt: recipe.updatedAt.toISOString(),
      },
      ingredients: recipe.ingredients.map((row, index) => {
        const content = productContent(row.product);
        const quantityUnit = (row.quantityUnit as ContentUnit | null) ?? null;
        return {
          productId: row.productId,
          name: row.product.name,
          code: row.product.code,
          unit: row.product.unit,
          netContent: content.netContent,
          netContentUnit: content.netContentUnit,
          status: row.product.status,
          quantity: toNumber(row.quantity),
          quantityUnit,
          wastagePercent: toNumber(row.wastagePercent),
          gross: costing.lines[index].gross,
          unitCost: currentUnitCost(book, row.productId),
          onHand: book.onHand(row.productId),
        };
      }),
      costing,
    };
  }

  async save(user: AuthUser, productId: string, dto: SaveRecipeDto) {
    const dish = await this.prisma.product.findFirst({
      where: { id: productId, companyId: user.companyId },
      select: { id: true, name: true },
    });
    if (!dish) throw new NotFoundException('Product not found');

    const ids = dto.ingredients.map((row) => row.productId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Each ingredient can appear only once');
    if (ids.includes(productId)) throw new BadRequestException('A dish cannot be its own ingredient');

    const [ingredients, usedIn] = await Promise.all([
      this.prisma.product.findMany({
        where: { companyId: user.companyId, id: { in: ids } },
        select: { id: true, name: true, unit: true, netContent: true, netContentUnit: true, recipe: { select: { id: true } } },
      }),
      this.prisma.recipeIngredient.findFirst({
        where: { companyId: user.companyId, productId },
        select: { recipe: { select: { product: { select: { name: true } } } } },
      }),
    ]);
    if (ingredients.length !== ids.length) throw new NotFoundException('Ingredient not found');
    const nested = ingredients.find((row) => row.recipe);
    if (nested) throw new BadRequestException(`${nested.name} has its own recipe; recipes can't contain other dishes yet`);
    if (usedIn) {
      throw new BadRequestException(`${dish.name} is an ingredient of ${usedIn.recipe.product.name}; recipes can't contain other dishes yet`);
    }

    const byId = new Map(ingredients.map((row) => [row.id, row]));
    for (const row of dto.ingredients) {
      const product = byId.get(row.productId)!;
      stockNetQty(row.quantity, row.quantityUnit, product);
    }

    const previous = await this.prisma.recipe.findUnique({
      where: { productId },
      select: {
        yieldPortions: true,
        markupPercent: true,
        notes: true,
        ingredients: {
          orderBy: { position: 'asc' },
          select: { productId: true, quantity: true, quantityUnit: true, wastagePercent: true },
        },
      },
    });
    await this.prisma.$transaction(async (tx) => {
      const recipe = await tx.recipe.upsert({
        where: { productId },
        create: {
          companyId: user.companyId,
          productId,
          yieldPortions: dto.yieldPortions,
          markupPercent: dto.markupPercent,
          notes: dto.notes ?? null,
        },
        update: { yieldPortions: dto.yieldPortions, markupPercent: dto.markupPercent, notes: dto.notes ?? null },
        select: { id: true },
      });
      await tx.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
      await tx.recipeIngredient.createMany({
        data: dto.ingredients.map((row, position) => ({
          companyId: user.companyId,
          recipeId: recipe.id,
          productId: row.productId,
          position,
          quantity: row.quantity,
          quantityUnit: row.quantityUnit ?? null,
          wastagePercent: row.wastagePercent ?? 0,
        })),
      });
    });

    const saved = {
      yieldPortions: dto.yieldPortions,
      markupPercent: dto.markupPercent,
      notes: dto.notes ?? null,
      ingredients: dto.ingredients.map((row) => ({
        productId: row.productId,
        quantity: row.quantity,
        quantityUnit: row.quantityUnit ?? null,
        wastagePercent: row.wastagePercent ?? 0,
      })),
    };
    const diff = previous ? changes(previous, saved) : { after: saved };
    if (diff) await this.log(user, { id: productId, label: dish.name }, 'RECIPE_SAVE', diff);
    return { productId };
  }

  async remove(user: AuthUser, productId: string) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { productId, companyId: user.companyId },
      select: { id: true, yieldPortions: true, markupPercent: true, product: { select: { name: true } } },
    });
    if (!recipe) throw new NotFoundException('Recipe not found');
    await this.prisma.recipe.delete({ where: { id: recipe.id } });
    await this.log(user, { id: productId, label: recipe.product.name }, 'RECIPE_DELETE', {
      before: { yieldPortions: recipe.yieldPortions, markupPercent: recipe.markupPercent },
    });
    return { productId };
  }

  /** Dishes the till can sell at a site, with how much of each ingredient one portion takes. No costs. */
  async menu(user: AuthUser, siteId: string) {
    const recipes = await this.prisma.recipe.findMany({
      where: { companyId: user.companyId, product: { status: { not: 'ARCHIVED' } } },
      include: {
        product: { select: { ...dishSelect, barcodes: { select: { barcode: true } } } },
        ingredients: {
          orderBy: { position: 'asc' },
          select: {
            productId: true,
            quantity: true,
            quantityUnit: true,
            wastagePercent: true,
            product: { select: { unit: true, netContent: true, netContentUnit: true, name: true } },
          },
        },
      },
      orderBy: { product: { name: 'asc' } },
    });
    const ingredientIds = [...new Set(recipes.flatMap((recipe) => recipe.ingredients.map((row) => row.productId)))];
    const { book } = await loadCostBook(this.prisma, user.companyId, siteId, ingredientIds);
    return {
      siteId,
      dishes: recipes.map((recipe) => {
        const portions = toNumber(recipe.yieldPortions) || 1;
        const ingredients = recipe.ingredients.map((row) => {
          const stockQty = stockNetQty(toNumber(row.quantity), row.quantityUnit as ContentUnit | null, row.product);
          return {
            productId: row.productId,
            perPortion: round4(grossQuantity(stockQty, toNumber(row.wastagePercent)) / portions),
          };
        });
        const available = ingredients
          .filter((row) => row.perPortion > 0)
          .map((row) => Math.floor(Math.max(0, book.onHand(row.productId)) / row.perPortion + 1e-9));
        const { barcodes, ...product } = recipe.product;
        return {
          ...dishView(product),
          barcodes: barcodes.map((row) => row.barcode),
          ingredients,
          portionsAvailable: available.length ? Math.min(...available) : 0,
        };
      }),
    };
  }

  private async log(
    user: AuthUser,
    dish: { id: string; label: string },
    action: string,
    diff: { before?: Record<string, unknown>; after?: Record<string, unknown> },
  ) {
    await recordActivity(this.prisma, user, { entityType: 'Product', entityId: dish.id, label: dish.label, action, ...diff });
  }
}
