import {
  expiryBucketCounts,
  expiryLevel,
  isQuantityPrecisionOk,
  quantityPrecisionProblem,
} from '@skladnik/shared';

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

expect(isQuantityPrecisionOk(1, 'PCS'), 'whole pcs');
expect(isQuantityPrecisionOk(2, 'PACK'), 'whole pack');
expect(isQuantityPrecisionOk(3, 'CASE'), 'whole case');
expect(!isQuantityPrecisionOk(0.5, 'PCS'), 'fractional pcs rejected');
expect(isQuantityPrecisionOk(0.5, 'KG'), 'kg allows decimals');
expect(isQuantityPrecisionOk(1.25, 'L'), 'litres allow decimals');
// CAF barista write-off: 0,5 л of milk is accepted; 0,5 бр of a piece product is not.
expect(isQuantityPrecisionOk(0.5, 'L'), '0,5 л of milk');
expect(!isQuantityPrecisionOk(0.5, 'PCS'), '0,5 бр rejected');
expect(!isQuantityPrecisionOk(1.2345, 'KG'), 'kg max 3 dp');
expect(Boolean(quantityPrecisionProblem(0.5, 'PCS', 'Beer')?.includes('Beer')), 'names the product');

expect(expiryLevel(-1) === 'expired', 'expired level');
expect(expiryLevel(2) === 'critical', 'critical band');
expect(expiryLevel(5) === 'urgent', 'urgent band');
expect(expiryLevel(10) === 'warning', 'warning band');
expect(expiryLevel(20) === 'watch', 'watch band');
expect(expiryLevel(40) === 'safe', 'safe band');

const buckets = expiryBucketCounts([-2, 1, 2, 5, 10, 20, 40]);
expect(buckets[0].count === 1 && buckets[0].days === 30, `watch bucket: ${JSON.stringify(buckets[0])}`);
expect(buckets[1].count === 1 && buckets[1].days === 14, `warning bucket: ${JSON.stringify(buckets[1])}`);
expect(buckets[2].count === 1 && buckets[2].days === 7, `urgent bucket: ${JSON.stringify(buckets[2])}`);
expect(buckets[3].count === 2 && buckets[3].days === 3, `critical bucket: ${JSON.stringify(buckets[3])}`);
expect(buckets.reduce((sum, row) => sum + row.count, 0) === 5, 'expired excluded; bands non-cumulative');

console.log('quantity / expiry bucket tests passed');
