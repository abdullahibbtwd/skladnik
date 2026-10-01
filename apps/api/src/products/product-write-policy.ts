/**
 * Site managers may touch only minStock (and siteId for ProductSiteMin) on a product.
 * Any other catalog field in the PATCH body is refused so prices, names and archive
 * status stay Owner/Accountant-only.
 * SKL-12/18: siteId scopes the minimum to ProductSiteMin for that site (Group 7).
 */
export function managerMinStockOnlyPatch(dto: Record<string, unknown>):
  | { ok: true; minStock: number | undefined; siteId: string | undefined }
  | { ok: false; extra: string[] } {
  const allowed = new Set(['minStock', 'siteId']);
  const extra = Object.keys(dto).filter((key) => dto[key] !== undefined && !allowed.has(key));
  if (extra.length) return { ok: false, extra };
  const minStock = dto.minStock;
  if (minStock !== undefined && (typeof minStock !== 'number' || !Number.isFinite(minStock) || minStock < 0)) {
    return { ok: false, extra: ['minStock'] };
  }
  const siteId = dto.siteId;
  if (siteId !== undefined && (typeof siteId !== 'string' || !siteId)) {
    return { ok: false, extra: ['siteId'] };
  }
  return {
    ok: true,
    minStock: minStock as number | undefined,
    siteId: siteId as string | undefined,
  };
}
