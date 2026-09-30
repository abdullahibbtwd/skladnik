import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChefHat, Percent, Plus, Save, Tag, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_MARKUP_PERCENT,
  MAX_WASTAGE_PERCENT,
  grossQuantity,
  isSalesManager,
  recipeCosting,
  recipeQtyToStock,
  recipeQuantityUnits,
  type ContentUnit,
  type UnitOfMeasure,
} from '@skladnik/shared';
import { useAuthRole } from '../../lib/auth-store';
import { cn } from '../../lib/cn';
import { formatEuro } from '../../lib/dashboard-data';
import { parseAmount } from '../../lib/till-cart';
import type { ProductRecord, RecipeCard, RecipeDish } from '../../lib/workspace-api';
import {
  useCreateProduct,
  useDeleteRecipe,
  useRecipeQuery,
  useRecipesQuery,
  useSaveRecipe,
  useSitesQuery,
  useStockQuery,
  useUpdateProduct,
} from '../../lib/workspace-session';
import { FieldError, FieldLabel } from '../PasswordField';
import { confirm } from '../ui/Dialog';
import { Select } from '../ui/Select';
import { toast } from '../ui/Toaster';
import { CatalogProductSearch } from './CatalogProductSearch';
import { useDashboard } from './dashboard-context';
import { ActionButton, GlassPanel, MetricCard, MetricGrid, PageHeader, tableHeadRowClass, tableRowClass } from './dashboard-ui';

const inputClass =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-[0.84rem] text-ops-ink outline-none focus:border-ops-teal/50 disabled:bg-slate-50';

const VAT_OPTIONS = ['20', '9', '0'] as const;

const percentText = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value.toFixed(1)}%`);

function BackLink({ to, label }: { to: string; label: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className="flex w-fit items-center gap-1.5 font-display text-[0.8rem] font-medium text-slate-500 hover:text-ops-accent"
    >
      <ArrowLeft size={15} />
      {label}
    </button>
  );
}

export const RecipesPanel: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const manager = isSalesManager(useAuthRole());
  const { siteId } = useDashboard();
  const sitesQuery = useSitesQuery();
  const recipesQuery = useRecipesQuery(manager ? siteId : '');
  const siteName = sitesQuery.data?.sites.find((site) => site.id === siteId)?.name ?? '';
  const recipes = recipesQuery.data?.recipes ?? [];

  if (!manager) return <p className="font-sans text-[0.86rem] text-slate-500">{t('recipes.managersOnly')}</p>;

  const foodCosts = recipes.map((recipe) => recipe.foodCostPercent).filter((value): value is number => value !== null);
  const averageFoodCost = foodCosts.length ? foodCosts.reduce((sum, value) => sum + value, 0) / foodCosts.length : null;
  const underpriced = recipes.filter((recipe) => recipe.suggestedPrice > 0 && recipe.dish.sellingPrice < recipe.suggestedPrice).length;
  const newRecipe = () => navigate('/app/recipes/new');

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <PageHeader
        eyebrow={siteName || undefined}
        title={t('recipes.title')}
        description={t('recipes.desc')}
        action={<ActionButton icon={Plus} label={t('recipes.new')} onClick={newRecipe} primary />}
      />
      <button
        type="button"
        onClick={newRecipe}
        className="flex items-center justify-center gap-2 rounded-xl bg-ops-teal px-4 py-3 font-display text-[0.86rem] font-medium text-white md:hidden"
      >
        <Plus size={16} />
        {t('recipes.new')}
      </button>

      <MetricGrid columns={3}>
        <MetricCard label={t('recipes.count')} value={String(recipes.length)} hint={t('recipes.countHint')} icon={ChefHat} />
        <MetricCard label={t('recipes.avgFoodCost')} value={percentText(averageFoodCost)} hint={t('recipes.avgFoodCostHint')} icon={Percent} />
        <MetricCard
          label={t('recipes.underpriced')}
          value={String(underpriced)}
          hint={t('recipes.underpricedHint')}
          icon={Tag}
          iconColor={underpriced ? 'text-ops-warn' : 'text-ops-teal'}
        />
      </MetricGrid>

      <GlassPanel padded={false} title={t('recipes.listTitle')}>
        {recipesQuery.isLoading ? (
          <p className="px-4 py-6 font-sans text-[0.82rem] text-slate-500 sm:px-5">{t('common.loading')}</p>
        ) : recipesQuery.isError ? (
          <p className="px-4 py-6 font-sans text-[0.82rem] text-ops-danger sm:px-5">{recipesQuery.error.message}</p>
        ) : recipes.length === 0 ? (
          <div className="px-4 py-10 text-center sm:px-5">
            <ChefHat size={28} className="mx-auto text-slate-300" />
            <p className="mt-2 font-display text-[0.9rem] text-ops-ink">{t('recipes.emptyTitle')}</p>
            <p className="mx-auto mt-1 max-w-md font-sans text-[0.8rem] text-slate-500">{t('recipes.emptyBody')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left">
              <thead>
                <tr className={tableHeadRowClass()}>
                  <th className="px-4 py-2.5 font-medium sm:px-5">{t('recipes.dish')}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t('recipes.costPerPortion')}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t('recipes.price')}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t('recipes.foodCost')}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t('recipes.margin')}</th>
                  <th className="px-4 py-2.5 text-right font-medium sm:px-5">{t('recipes.suggested')}</th>
                </tr>
              </thead>
              <tbody>
                {recipes.map((recipe) => {
                  const below = recipe.suggestedPrice > 0 && recipe.dish.sellingPrice < recipe.suggestedPrice;
                  return (
                    <tr
                      key={recipe.dish.id}
                      onClick={() => navigate(`/app/recipes/${recipe.dish.id}`)}
                      className={cn(tableRowClass(), 'cursor-pointer')}
                    >
                      <td className="px-4 py-2.5 sm:px-5">
                        <p className="font-display text-[0.84rem] text-ops-ink">
                          {recipe.dish.name}
                          {recipe.dish.status === 'ARCHIVED' && (
                            <span className="ml-2 font-sans text-[0.7rem] text-slate-400">{t('recipes.archived')}</span>
                          )}
                        </p>
                        <p className="font-mono text-[0.66rem] text-slate-400">
                          {t('recipes.ingredientCount', { count: recipe.ingredientCount })} · {t('recipes.yieldShort', { count: recipe.yieldPortions })}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[0.8rem] tabular-nums">
                        {formatEuro(recipe.costPerPortion)}
                        {recipe.missingCosts ? <span className="text-amber-700">*</span> : null}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[0.8rem] tabular-nums">{formatEuro(recipe.dish.sellingPrice)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-[0.8rem] tabular-nums">{percentText(recipe.foodCostPercent)}</td>
                      <td
                        className={cn(
                          'px-3 py-2.5 text-right font-mono text-[0.8rem] font-medium tabular-nums',
                          recipe.profit < 0 ? 'text-ops-danger' : 'text-ops-teal',
                        )}
                      >
                        {percentText(recipe.marginPercent)}
                      </td>
                      <td className={cn('px-4 py-2.5 text-right font-mono text-[0.8rem] tabular-nums sm:px-5', below && 'text-ops-warn')}>
                        {recipe.suggestedPrice > 0 ? formatEuro(recipe.suggestedPrice) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>
      {recipes.some((recipe) => recipe.missingCosts) && (
        <p className="-mt-2 font-sans text-[0.74rem] text-amber-700">{t('recipes.missingCostNote')}</p>
      )}
    </div>
  );
};

/** Pick an existing product as the dish, or create a new one; then the card editor takes over. */
export const RecipeNewPanel: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const manager = isSalesManager(useAuthRole());
  const createProduct = useCreateProduct();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [vat, setVat] = useState<(typeof VAT_OPTIONS)[number]>('20');
  const [error, setError] = useState<string | null>(null);

  if (!manager) return <p className="font-sans text-[0.86rem] text-slate-500">{t('recipes.managersOnly')}</p>;

  const priceValue = parseAmount(price);
  const valid = name.trim().length > 0 && Number.isFinite(priceValue) && priceValue >= 0;

  const create = async () => {
    if (!valid || createProduct.isPending) return;
    setError(null);
    try {
      const created = await createProduct.mutateAsync({
        name: name.trim(),
        code: `DISH-${Date.now().toString(36).toUpperCase()}`,
        unit: 'PCS',
        vatRate: Number(vat),
        purchasePrice: 0,
        sellingPrice: Math.round(priceValue * 100) / 100,
      });
      navigate(`/app/recipes/${created.product.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('recipes.saveFailed'));
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <BackLink to="/app/recipes" label={t('recipes.back')} />
      <PageHeader title={t('recipes.newTitle')} description={t('recipes.newDesc')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassPanel title={t('recipes.createDish')}>
          <div className="flex flex-col gap-3">
            <div>
              <FieldLabel htmlFor="dish-name">{t('recipes.dishName')}</FieldLabel>
              <input
                id="dish-name"
                value={name}
                maxLength={180}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('recipes.dishNamePlaceholder')}
                className={cn(inputClass, 'font-sans')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="dish-price">{t('recipes.sellingPrice')}</FieldLabel>
                <input id="dish-price" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.00" className={inputClass} />
              </div>
              <div>
                <FieldLabel htmlFor="dish-vat">{t('recipes.vat')}</FieldLabel>
                <Select id="dish-vat" value={vat} onChange={setVat} options={VAT_OPTIONS.map((rate) => ({ value: rate, label: `${rate}%` }))} />
              </div>
            </div>
            <p className="font-sans text-[0.74rem] text-slate-500">{t('recipes.createDishHint')}</p>
            {error && <FieldError>{error}</FieldError>}
            <button
              type="button"
              onClick={() => void create()}
              disabled={!valid || createProduct.isPending}
              className="rounded-xl bg-ops-teal px-4 py-2.5 font-display text-[0.86rem] font-medium text-white hover:bg-ops-teal-hover disabled:opacity-50"
            >
              {createProduct.isPending ? t('common.saving') : t('recipes.createAndContinue')}
            </button>
          </div>
        </GlassPanel>
        <GlassPanel title={t('recipes.pickDish')}>
          <p className="mb-3 font-sans text-[0.78rem] text-slate-500">{t('recipes.pickDishHint')}</p>
          <CatalogProductSearch
            placeholder={t('recipes.searchCatalog')}
            onPick={(product) => navigate(`/app/recipes/${product.id}`, { replace: true })}
          />
          <p className="mt-3 font-sans text-[0.72rem] text-slate-400">{t('recipes.pickExistingNote')}</p>
        </GlassPanel>
      </div>
    </div>
  );
};

type IngredientRow = {
  key: string;
  productId: string;
  name: string;
  code: string;
  unit: UnitOfMeasure;
  netContent: number | null;
  netContentUnit: ContentUnit | null;
  quantity: string;
  quantityUnit: '' | ContentUnit;
  wastage: string;
  unitCost: number;
  onHand: number | null;
};

function rowsFromCard(card: RecipeCard): IngredientRow[] {
  return card.ingredients.map((row) => ({
    key: row.productId,
    productId: row.productId,
    name: row.name,
    code: row.code,
    unit: row.unit,
    netContent: row.netContent,
    netContentUnit: row.netContentUnit,
    quantity: String(row.quantity),
    quantityUnit: row.quantityUnit ?? '',
    wastage: row.wastagePercent ? String(row.wastagePercent) : '',
    unitCost: row.unitCost,
    onHand: row.onHand,
  }));
}

function unitLabel(t: (key: string) => string, unit: string) {
  return t(`labels.unit.${unit}`);
}

function contentOf(row: Pick<IngredientRow, 'unit' | 'netContent' | 'netContentUnit'>) {
  return { unit: row.unit, netContent: row.netContent, netContentUnit: row.netContentUnit };
}

export const RecipeEditorPanel: React.FC = () => {
  const { productId = '' } = useParams();
  const { t } = useTranslation();
  const manager = isSalesManager(useAuthRole());
  const { siteId } = useDashboard();
  const cardQuery = useRecipeQuery(manager ? siteId : '', productId);

  if (!manager) return <p className="font-sans text-[0.86rem] text-slate-500">{t('recipes.managersOnly')}</p>;
  if (cardQuery.isError) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink to="/app/recipes" label={t('recipes.back')} />
        <FieldError>{cardQuery.error.message}</FieldError>
      </div>
    );
  }
  if (!cardQuery.data) return <p className="font-sans text-[0.86rem] text-slate-500">{t('common.loading')}</p>;
  return <RecipeEditor key={`${productId}:${siteId}`} card={cardQuery.data} />;
};

const RecipeEditor: React.FC<{ card: RecipeCard }> = ({ card }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { siteId } = useDashboard();
  const stockQuery = useStockQuery(siteId);
  const recipesQuery = useRecipesQuery(siteId);
  const saveRecipe = useSaveRecipe();
  const deleteRecipe = useDeleteRecipe();
  const updateProduct = useUpdateProduct();

  const dish: RecipeDish = card.dish;
  const [rows, setRows] = useState<IngredientRow[]>(() => rowsFromCard(card));
  const [yieldText, setYieldText] = useState(String(card.recipe?.yieldPortions ?? 1));
  const [markupText, setMarkupText] = useState(String(card.recipe?.markupPercent ?? DEFAULT_MARKUP_PERCENT));
  const [notes, setNotes] = useState(card.recipe?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Costs and stock refresh after sales or deliveries; entered quantities stay.
  useEffect(() => {
    const fresh = new Map(card.ingredients.map((row) => [row.productId, row]));
    setRows((current) =>
      current.map((row) => {
        const latest = fresh.get(row.productId);
        return latest ? { ...row, unitCost: latest.unitCost, onHand: latest.onHand } : row;
      }),
    );
  }, [card]);

  const qtyFormat = useMemo(() => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 4 }), [i18n.language]);
  const levelById = useMemo(() => new Map((stockQuery.data?.items ?? []).map((level) => [level.productId, level])), [stockQuery.data]);
  const excluded = useMemo(() => {
    const ids = new Set(rows.map((row) => row.productId));
    ids.add(dish.id);
    for (const recipe of recipesQuery.data?.recipes ?? []) ids.add(recipe.dish.id);
    return ids;
  }, [rows, dish.id, recipesQuery.data]);

  const yieldPortions = parseAmount(yieldText);
  const markupPercent = parseAmount(markupText);
  const parsed = rows.map((row) => {
    const quantity = parseAmount(row.quantity);
    const wastage = row.wastage.trim() === '' ? 0 : parseAmount(row.wastage);
    const quantityUnit = row.quantityUnit === '' ? null : row.quantityUnit;
    const stockQty =
      Number.isFinite(quantity) && quantity > 0
        ? recipeQtyToStock(quantity, quantityUnit, contentOf(row))
        : null;
    return {
      row,
      quantity,
      wastage,
      quantityUnit,
      stockQty,
      qtyOk: Number.isFinite(quantity) && quantity > 0 && quantity <= 100000 && stockQty != null,
      wastageOk: Number.isFinite(wastage) && wastage >= 0 && wastage <= MAX_WASTAGE_PERCENT,
    };
  });
  const yieldOk = Number.isFinite(yieldPortions) && yieldPortions > 0 && yieldPortions <= 10000;
  const markupOk = Number.isFinite(markupPercent) && markupPercent >= 0 && markupPercent <= 10000;
  const ready = yieldOk && markupOk && parsed.length > 0 && parsed.every((line) => line.qtyOk && line.wastageOk);

  const costing = recipeCosting({
    yieldPortions: yieldOk ? yieldPortions : 1,
    markupPercent: markupOk ? markupPercent : 0,
    sellingPrice: dish.sellingPrice,
    vatRate: dish.vatRate,
    ingredients: parsed.map((line) => ({
      quantity: line.qtyOk && line.stockQty != null ? line.stockQty : 0,
      wastagePercent: line.wastageOk ? line.wastage : 0,
      unitCost: line.row.unitCost,
    })),
  });
  const belowSuggested = costing.suggestedPrice > 0 && dish.sellingPrice < costing.suggestedPrice;

  const edit = (key: string, patch: Partial<IngredientRow>) => {
    setDirty(true);
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const addIngredient = (product: ProductRecord) => {
    const level = levelById.get(product.id);
    setDirty(true);
    setRows((current) => [
      ...current,
      {
        key: product.id,
        productId: product.id,
        name: product.name,
        code: product.code,
        unit: product.unit,
        netContent: product.netContent,
        netContentUnit: product.netContentUnit,
        quantity: '',
        quantityUnit: '',
        wastage: '',
        unitCost: level?.avgCost ?? product.purchasePrice ?? 0,
        onHand: level ? level.onHand : 0,
      },
    ]);
  };

  const save = async () => {
    if (!ready || saveRecipe.isPending) return;
    setError(null);
    try {
      await saveRecipe.mutateAsync({
        productId: dish.id,
        yieldPortions: Math.round(yieldPortions * 1000) / 1000,
        markupPercent: Math.round(markupPercent * 100) / 100,
        notes: notes.trim() || null,
        ingredients: parsed.map((line) => ({
          productId: line.row.productId,
          quantity: Math.round(line.quantity * 10000) / 10000,
          quantityUnit: line.quantityUnit,
          wastagePercent: Math.round(line.wastage * 100) / 100,
        })),
      });
      setDirty(false);
      toast.success(t('recipes.saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('recipes.saveFailed'));
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: t('recipes.deleteTitle'),
      description: t('recipes.deleteBody', { dish: dish.name }),
      confirmLabel: t('recipes.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteRecipe.mutateAsync(dish.id);
      toast.success(t('recipes.deleted'));
      navigate('/app/recipes', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('recipes.saveFailed'));
    }
  };

  const applySuggested = async () => {
    if (!costing.suggestedPrice) return;
    try {
      await updateProduct.mutateAsync({ id: dish.id, sellingPrice: costing.suggestedPrice });
      toast.success(t('recipes.priceUpdated', { price: formatEuro(costing.suggestedPrice) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('recipes.saveFailed'));
    }
  };

  const portionsLabel = yieldOk ? t('recipes.yieldShort', { count: yieldPortions }) : '—';

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <BackLink to="/app/recipes" label={t('recipes.back')} />
      <PageHeader
        eyebrow={card.recipe ? t('recipes.cardEyebrow') : t('recipes.newCardEyebrow')}
        title={dish.name}
        description={t('recipes.dishLine', { code: dish.code, price: formatEuro(dish.sellingPrice), vat: dish.vatRate })}
      />
      {card.usedAsIngredient && <FieldError>{t('recipes.usedAsIngredient')}</FieldError>}

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4 sm:gap-5">
          <GlassPanel title={t('recipes.batchTitle')}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="recipe-yield">{t('recipes.yield')}</FieldLabel>
                <input
                  id="recipe-yield"
                  inputMode="decimal"
                  value={yieldText}
                  onChange={(event) => {
                    setDirty(true);
                    setYieldText(event.target.value);
                  }}
                  className={cn(inputClass, !yieldOk && 'border-ops-danger/50')}
                />
              </div>
              <div>
                <FieldLabel htmlFor="recipe-markup">{t('recipes.markup')}</FieldLabel>
                <input
                  id="recipe-markup"
                  inputMode="decimal"
                  value={markupText}
                  onChange={(event) => {
                    setDirty(true);
                    setMarkupText(event.target.value);
                  }}
                  className={cn(inputClass, !markupOk && 'border-ops-danger/50')}
                />
              </div>
            </div>
            <p className="mt-2 font-sans text-[0.74rem] text-slate-500">{t('recipes.yieldHint')}</p>
          </GlassPanel>

          <GlassPanel padded={false} title={t('recipes.ingredientsTitle')}>
            <div className="px-4 pt-1 pb-3 sm:px-5">
              <p className="mb-3 font-sans text-[0.76rem] text-slate-500">{t('recipes.ingredientsHint', { portions: portionsLabel })}</p>
              <CatalogProductSearch placeholder={t('recipes.addIngredient')} onPick={addIngredient} excludeIds={excluded} />
            </div>
            {rows.length === 0 ? (
              <p className="border-t border-slate-100 px-4 py-6 text-center font-sans text-[0.8rem] text-slate-500 sm:px-5">{t('recipes.noIngredients')}</p>
            ) : (
              <ul className="border-t border-slate-100">
                {parsed.map((line, index) => {
                  const { row } = line;
                  const costLine = costing.lines[index];
                  const stockUnit = unitLabel(t, row.unit);
                  const qtyUnitKey = line.quantityUnit ?? row.unit;
                  const qtyUnit = unitLabel(t, qtyUnitKey);
                  const unitChoices = recipeQuantityUnits(contentOf(row));
                  const grossInRecipeUnit = line.qtyOk
                    ? Math.round((grossQuantity(line.quantity, line.wastage) / (yieldOk ? yieldPortions : 1)) * 10000) / 10000
                    : null;
                  return (
                    <li key={row.key} className="border-b border-slate-100 px-4 py-3 last:border-0 sm:px-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-display text-[0.86rem] text-ops-ink">{row.name}</p>
                          <p className="font-mono text-[0.66rem] text-slate-400">
                            {row.code} · {row.unitCost > 0 ? t('recipes.unitCost', { cost: formatEuro(row.unitCost), unit: stockUnit }) : t('recipes.noCost')}
                            {row.onHand !== null && ` · ${t('recipes.onHand', { qty: qtyFormat.format(row.onHand), unit: stockUnit })}`}
                            {row.netContent != null && row.netContentUnit
                              ? ` · ${t('recipes.netContentShort', { qty: row.netContent, unit: unitLabel(t, row.netContentUnit) })}`
                              : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setDirty(true);
                            setRows((current) => current.filter((item) => item.key !== row.key));
                          }}
                          className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-ops-danger"
                          aria-label={t('recipes.removeIngredient', { name: row.name })}
                        >
                          <X size={15} />
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                        <label className="block">
                          <span className="mb-1 block font-sans text-[0.68rem] text-slate-500">{t('recipes.netQty', { unit: qtyUnit })}</span>
                          <input
                            inputMode="decimal"
                            value={row.quantity}
                            onChange={(event) => edit(row.key, { quantity: event.target.value })}
                            placeholder="0"
                            className={cn(inputClass, row.quantity !== '' && !line.qtyOk && 'border-ops-danger/50')}
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block font-sans text-[0.68rem] text-slate-500">{t('recipes.qtyUnit')}</span>
                          <Select
                            value={row.quantityUnit}
                            onChange={(value) => edit(row.key, { quantityUnit: value as '' | ContentUnit })}
                            options={unitChoices.map((unit) => ({
                              value: unit === row.unit ? '' : unit,
                              label: unitLabel(t, unit),
                            }))}
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block font-sans text-[0.68rem] text-slate-500">{t('recipes.wastage')}</span>
                          <input
                            inputMode="decimal"
                            value={row.wastage}
                            onChange={(event) => edit(row.key, { wastage: event.target.value })}
                            placeholder="0"
                            className={cn(inputClass, !line.wastageOk && 'border-ops-danger/50')}
                          />
                        </label>
                        <div>
                          <span className="mb-1 block font-sans text-[0.68rem] text-slate-500">{t('recipes.grossPerPortion')}</span>
                          <p className="flex h-10 items-center font-mono text-[0.82rem] text-slate-600 tabular-nums">
                            {grossInRecipeUnit != null ? `${qtyFormat.format(grossInRecipeUnit)} ${qtyUnit}` : '—'}
                          </p>
                        </div>
                        <div>
                          <span className="mb-1 block font-sans text-[0.68rem] text-slate-500">{t('recipes.costPerPortionShort')}</span>
                          <p className="flex h-10 items-center font-mono text-[0.82rem] font-medium text-ops-ink tabular-nums">
                            {line.qtyOk ? (costLine.costed ? formatEuro(costLine.cost) : <span className="text-amber-700">{t('recipes.noCostShort')}</span>) : '—'}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </GlassPanel>

          <GlassPanel title={t('recipes.notes')}>
            <textarea
              value={notes}
              maxLength={2000}
              rows={3}
              onChange={(event) => {
                setDirty(true);
                setNotes(event.target.value);
              }}
              placeholder={t('recipes.notesPlaceholder')}
              className="w-full rounded-lg border border-slate-200 bg-ops-canvas px-3 py-2.5 font-sans text-[0.86rem] text-ops-ink outline-none focus:border-ops-teal/50 focus:bg-white"
            />
          </GlassPanel>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          <GlassPanel title={t('recipes.costingTitle')}>
            <dl className="flex flex-col gap-2 font-sans text-[0.82rem]">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-500">{t('recipes.costPerPortion')}</dt>
                <dd className="font-mono text-[1.05rem] font-semibold text-ops-ink tabular-nums">{formatEuro(costing.costPerPortion)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-500">{t('recipes.price')}</dt>
                <dd className="font-mono tabular-nums">{formatEuro(dish.sellingPrice)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-500">{t('recipes.netPrice')}</dt>
                <dd className="font-mono text-slate-500 tabular-nums">{formatEuro(costing.netPrice)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-500">{t('recipes.profitPerPortion')}</dt>
                <dd className={cn('font-mono font-medium tabular-nums', costing.profit < 0 ? 'text-ops-danger' : 'text-ops-teal')}>
                  {formatEuro(costing.profit)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-500">{t('recipes.margin')}</dt>
                <dd className="font-mono tabular-nums">{percentText(costing.marginPercent)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-500">{t('recipes.foodCost')}</dt>
                <dd className="font-mono tabular-nums">{percentText(costing.foodCostPercent)}</dd>
              </div>
            </dl>
            {costing.missingCosts > 0 && (
              <p className="mt-2 font-sans text-[0.74rem] text-amber-700">{t('recipes.missingCosts', { count: costing.missingCosts })}</p>
            )}
            <div className={cn('mt-4 rounded-xl border p-3', belowSuggested ? 'border-ops-warn/30 bg-orange-50' : 'border-slate-200 bg-ops-canvas')}>
              <p className="font-sans text-[0.74rem] text-slate-500">{t('recipes.suggestedAt', { markup: markupOk ? markupPercent : '—' })}</p>
              <p className="mt-0.5 font-mono text-[1.1rem] font-semibold text-ops-ink tabular-nums">
                {costing.suggestedPrice > 0 ? formatEuro(costing.suggestedPrice) : '—'}
              </p>
              {belowSuggested && <p className="mt-1 font-sans text-[0.72rem] text-ops-warn">{t('recipes.belowSuggested')}</p>}
              <button
                type="button"
                onClick={() => void applySuggested()}
                disabled={!costing.suggestedPrice || costing.suggestedPrice === dish.sellingPrice || updateProduct.isPending}
                className="mt-2 w-full rounded-lg border border-ops-accent/30 bg-white px-3 py-2 font-display text-[0.78rem] font-medium text-ops-accent hover:bg-indigo-50 disabled:opacity-40"
              >
                {updateProduct.isPending ? t('common.saving') : t('recipes.useSuggested')}
              </button>
            </div>
          </GlassPanel>

          {error && <FieldError>{error}</FieldError>}

          <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.25)] md:border-0 md:bg-transparent md:p-0 md:shadow-none">
            {card.recipe && (
              <button
                type="button"
                onClick={() => void remove()}
                disabled={deleteRecipe.isPending}
                aria-label={t('recipes.delete')}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-ops-danger/20 bg-ops-danger/5 px-3 py-2.5 font-display text-[0.8rem] font-medium text-ops-danger hover:bg-ops-danger/10 disabled:opacity-50"
              >
                <Trash2 size={15} />
                <span className="hidden sm:inline">{t('recipes.delete')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void save()}
              disabled={!ready || saveRecipe.isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-ops-teal px-4 py-2.5 font-display text-[0.86rem] font-medium text-white shadow-[0_6px_16px_rgba(13,148,136,0.28)] hover:bg-ops-teal-hover disabled:opacity-50"
            >
              <Save size={15} />
              {saveRecipe.isPending ? t('common.saving') : dirty || !card.recipe ? t('recipes.save') : t('recipes.savedState')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
