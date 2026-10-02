export function toNumber(value: { toString(): string } | number | string | null | undefined): number {
  if (value == null || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
