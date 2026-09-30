/**
 * Site managers may touch only minStock on a product. Any other catalog field in the
 * PATCH body is refused so prices, names and archive status stay Owner/Accountant-only.
 */
export function managerMinStockOnlyPatch(dto: Record<string, unknown>):
  | { ok: true; minStock: number | undefined }
  | { ok: false; extra: string[] } {
  const allowed = new Set(['minStock']);
  const extra = Object.keys(dto).filter((key) => dto[key] !== undefined && !allowed.has(key));
  if (extra.length) return { ok: false, extra };
  const minStock = dto.minStock;
  if (minStock !== undefined && (typeof minStock !== 'number' || !Number.isFinite(minStock) || minStock < 0)) {
    return { ok: false, extra: ['minStock'] };
  }
  return { ok: true, minStock: minStock as number | undefined };
}
