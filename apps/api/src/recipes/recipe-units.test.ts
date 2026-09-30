import {
  netContentProblem,
  recipeQtyToStock,
  recipeQuantityUnits,
  recipeUnitProblem,
} from '@skladnik/shared';

function expectEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

const cheese = { unit: 'PCS', netContent: 400, netContentUnit: 'G' as const };
const milk = { unit: 'L', netContent: null, netContentUnit: null };
const flour = { unit: 'KG', netContent: null, netContentUnit: null };
const cola = { unit: 'PCS', netContent: 500, netContentUnit: 'ML' as const };
const plain = { unit: 'PCS', netContent: null, netContentUnit: null };

expectEqual(recipeQuantityUnits(cheese), ['PCS', 'G'], 'cheese offers pcs and g');
expectEqual(recipeQuantityUnits(milk), ['L', 'ML'], 'litres offer ml');
expectEqual(recipeQuantityUnits(flour), ['KG', 'G'], 'kg offers g');
expectEqual(recipeQuantityUnits(plain), ['PCS'], 'no content → stock unit only');

// F-32: 40 g of a 400 g pack = 0.1 pcs
expectEqual(recipeQtyToStock(40, 'G', cheese), 0.1, '40 g of 400 g pack');
expectEqual(recipeQtyToStock(0.1, null, cheese), 0.1, 'stock unit unchanged');
expectEqual(recipeQtyToStock(100, 'G', flour), 0.1, '100 g of kg product');
expectEqual(recipeQtyToStock(250, 'ML', milk), 0.25, '250 ml of litre product');
expectEqual(recipeQtyToStock(100, 'ML', cola), 0.2, '100 ml of 500 ml bottle');
expectEqual(recipeQtyToStock(40, 'G', plain), null, 'grams without net content');

expectEqual(netContentProblem(400, 'G'), null, 'valid pair');
expectEqual(netContentProblem(null, null), null, 'both empty');
expectEqual(Boolean(netContentProblem(400, null)), true, 'qty without unit');
expectEqual(Boolean(netContentProblem(null, 'G')), true, 'unit without qty');

expectEqual(recipeUnitProblem('G', cheese), null, 'cheese allows g');
expectEqual(Boolean(recipeUnitProblem('G', plain)), true, 'plain blocks g');

console.log('recipe-units tests passed');
