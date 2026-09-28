import { grossQuantity, ingredientIssue, recipeCosting, suggestedPrice } from '@skladnik/shared';

function expectEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

// Wastage is a share of the gross: 100 g net with 20% loss means issuing 125 g.
expectEqual(grossQuantity(0.1, 20), 0.125, 'gross with wastage');
expectEqual(grossQuantity(0.1, 0), 0.1, 'gross without wastage');
expectEqual(grossQuantity(1, 95), 10, 'wastage is capped at 90%');

// Issue scales from the recipe yield to the portions sold, rounded to the ledger's 3 decimals.
expectEqual(ingredientIssue(0.125, 1, 2), 0.25, 'two portions of a single-portion card');
expectEqual(ingredientIssue(2.5, 20, 3), 0.375, 'three portions of a 20-portion pot');
expectEqual(ingredientIssue(0.0074, 1, 1), 0.007, 'rounded to grams');

// Suggested price: cost × (1 + markup) × (1 + VAT), rounded up to the cent.
expectEqual(suggestedPrice(1, 200, 20), 3.6, 'suggested price');
expectEqual(suggestedPrice(0.333, 200, 20), 1.2, 'suggested price rounds up');
expectEqual(suggestedPrice(0, 200, 20), 0, 'no cost, no suggestion');

const soup = recipeCosting({
  yieldPortions: 10,
  sellingPrice: 3.6,
  vatRate: 20,
  markupPercent: 200,
  ingredients: [
    { quantity: 2, wastagePercent: 20, unitCost: 1 },
    { quantity: 0.5, wastagePercent: 0, unitCost: 0 },
  ],
});
expectEqual(
  soup,
  {
    lines: [
      { gross: 2.5, perPortion: 0.25, costed: true, cost: 0.25 },
      { gross: 0.5, perPortion: 0.05, costed: false, cost: 0 },
    ],
    costPerPortion: 0.25,
    missingCosts: 1,
    netPrice: 3,
    profit: 2.75,
    marginPercent: 91.7,
    foodCostPercent: 8.3,
    suggestedPrice: 0.9,
  },
  'costing a 10-portion pot with one uncosted ingredient',
);

const unpriced = recipeCosting({
  yieldPortions: 1,
  sellingPrice: 0,
  vatRate: 20,
  markupPercent: 200,
  ingredients: [{ quantity: 0.018, wastagePercent: 0, unitCost: 20 }],
});
expectEqual([unpriced.costPerPortion, unpriced.marginPercent, unpriced.suggestedPrice], [0.36, null, 1.3], 'no selling price yet');

console.log('recipe-math tests passed');
