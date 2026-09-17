export function roundMoney(value: number, places = 4): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function computeLineAmounts(quantity: number, unitPrice: number, discountPercent = 0) {
  const discount = Math.min(Math.max(Number(discountPercent) || 0, 0), 100);
  const finalUnitPrice = roundMoney(Number(unitPrice) * (1 - discount / 100), 4);
  const lineTotal = roundMoney(finalUnitPrice * Number(quantity), 4);
  return { discountPercent: discount, finalUnitPrice, lineTotal };
}
