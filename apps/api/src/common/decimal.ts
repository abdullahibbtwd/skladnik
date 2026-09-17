export function toNumber(value: { toString(): string } | number | string): number {
  return Number(value);
}
