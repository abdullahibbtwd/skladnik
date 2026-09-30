/** Weight/volume units for product net content and recipe line quantities (F-32). */
export const CONTENT_UNITS = ['G', 'ML'] as const;
export type ContentUnit = (typeof CONTENT_UNITS)[number];

export const CONTENT_UNIT_LABELS: Record<ContentUnit, string> = {
  G: 'g',
  ML: 'ml',
};

export type ProductContent = {
  unit: string;
  netContent: number | null;
  netContentUnit: ContentUnit | null;
};

/** Which units a recipe ingredient line may use for this product. */
export function recipeQuantityUnits(product: ProductContent): string[] {
  const units: string[] = [product.unit];
  if (product.unit === 'KG' || product.netContentUnit === 'G') units.push('G');
  if (product.unit === 'L' || product.netContentUnit === 'ML') units.push('ML');
  return units;
}

/**
 * Convert a recipe quantity into the product's stock unit.
 * Returns null when g/ml was requested but no conversion exists (missing net content).
 */
export function recipeQtyToStock(
  quantity: number,
  quantityUnit: ContentUnit | null | undefined,
  product: ProductContent,
): number | null {
  if (!Number.isFinite(quantity)) return null;
  if (!quantityUnit) return quantity;

  if (quantityUnit === 'G') {
    if (product.unit === 'KG') return quantity / 1000;
    if (product.netContentUnit === 'G' && product.netContent != null && product.netContent > 0) {
      return quantity / product.netContent;
    }
    return null;
  }

  if (quantityUnit === 'ML') {
    if (product.unit === 'L') return quantity / 1000;
    if (product.netContentUnit === 'ML' && product.netContent != null && product.netContent > 0) {
      return quantity / product.netContent;
    }
    return null;
  }

  return null;
}

/** True when both sides of the product net-content pair are empty or both are valid. */
export function isNetContentPairOk(netContent: number | null | undefined, netContentUnit: ContentUnit | null | undefined) {
  const hasQty = netContent != null && Number.isFinite(netContent);
  const hasUnit = netContentUnit != null;
  if (!hasQty && !hasUnit) return true;
  if (!hasQty || !hasUnit) return false;
  return (netContent as number) > 0;
}

export function netContentProblem(
  netContent: number | null | undefined,
  netContentUnit: ContentUnit | null | undefined,
): string | null {
  if (isNetContentPairOk(netContent, netContentUnit)) return null;
  if (netContentUnit && (netContent == null || !(netContent > 0))) {
    return 'Net content must be a positive amount when a unit (g/ml) is set';
  }
  if (netContent != null && netContent > 0 && !netContentUnit) {
    return 'Choose g or ml for the net content';
  }
  return 'Net content and its unit must be set together';
}

export function recipeUnitProblem(
  quantityUnit: ContentUnit | null | undefined,
  product: ProductContent,
  productName?: string,
): string | null {
  if (!quantityUnit) return null;
  if (recipeQtyToStock(1, quantityUnit, product) != null) return null;
  const who = productName ? `${productName}: ` : '';
  if (quantityUnit === 'G') {
    return `${who}set net content in g on the product (e.g. 1 ${product.unit.toLowerCase()} = 400 g) to use grams in recipes`;
  }
  return `${who}set net content in ml on the product (e.g. 1 ${product.unit.toLowerCase()} = 500 ml) to use millilitres in recipes`;
}
