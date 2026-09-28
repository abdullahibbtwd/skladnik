import { suggestedOrderQty } from './reorder';

function expectEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

expectEqual(suggestedOrderQty(10, 0, null, 'PCS'), null, 'no minimum set');
expectEqual(suggestedOrderQty(10, 10, null, 'PCS'), null, 'at the minimum is fine');
expectEqual(suggestedOrderQty(3, 10, null, 'PCS'), 17, 'up to twice the minimum');
expectEqual(suggestedOrderQty(3, 10, 24, 'PCS'), 21, 'up to maxStock');
expectEqual(suggestedOrderQty(3, 10, 5, 'PCS'), 17, 'maxStock below the minimum is ignored');
expectEqual(suggestedOrderQty(-4, 10, null, 'PCS'), 20, 'negative stock counts as zero');
expectEqual(suggestedOrderQty(2.5, 10, null, 'PCS'), 18, 'countable units round up');
expectEqual(suggestedOrderQty(2.25, 5, null, 'KG'), 7.75, 'kilograms keep decimals');

console.log('reorder tests passed');
