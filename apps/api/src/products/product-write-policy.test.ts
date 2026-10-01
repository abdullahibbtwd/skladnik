import { managerMinStockOnlyPatch } from './product-write-policy';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const onlyMin = managerMinStockOnlyPatch({ minStock: 12 });
assert(onlyMin.ok && onlyMin.minStock === 12, 'minStock alone is allowed');

const withSite = managerMinStockOnlyPatch({ minStock: 8, siteId: 's1' });
assert(withSite.ok && withSite.siteId === 's1' && withSite.minStock === 8, 'siteId + minStock allowed');

const empty = managerMinStockOnlyPatch({});
assert(empty.ok && empty.minStock === undefined, 'empty patch is ok (no-op upstream)');

const withPrice = managerMinStockOnlyPatch({ minStock: 5, sellingPrice: 1.2 });
assert(!withPrice.ok && withPrice.extra.includes('sellingPrice'), 'price change blocked');

const archive = managerMinStockOnlyPatch({ status: 'ARCHIVED' });
assert(!archive.ok && archive.extra.includes('status'), 'status change blocked');

console.log('product-write-policy tests passed');
