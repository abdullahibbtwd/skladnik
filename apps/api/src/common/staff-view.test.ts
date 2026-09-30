import assert from 'node:assert/strict';
import {
  collectJsonKeys,
  presentDocumentDetailForRole,
  presentProductForRole,
  presentReorderForRole,
  presentStockItemForRole,
  STAFF_FORBIDDEN_FIELD_NAMES,
  stripStaffFinancialTree,
} from './staff-view';

const product = {
  id: 'p1',
  name: 'Beer',
  purchasePrice: 1.2,
  sellingPrice: 2.5,
  code: 'B1',
};

const stockItem = {
  productId: 'p1',
  name: 'Beer',
  purchasePrice: 1.2,
  avgCost: 1.1,
  value: 55,
  sellingPrice: 2.5,
  onHand: 50,
  batches: [{ batchId: 'b1', batchNumber: 'L1', onHand: 50, unitCost: 1.1, value: 55 }],
};

{
  const staff = presentProductForRole('STAFF', product);
  assert.equal(staff.sellingPrice, 2.5);
  assert.equal('purchasePrice' in staff, false);
  const mgr = presentProductForRole('SITE_MANAGER', product);
  assert.equal(mgr.purchasePrice, 1.2);
}

{
  const staff = presentStockItemForRole('STAFF', stockItem);
  assert.equal(staff.onHand, 50);
  assert.equal(staff.sellingPrice, 2.5);
  assert.equal('value' in staff, false);
  assert.equal('avgCost' in staff, false);
  assert.equal('purchasePrice' in staff, false);
  assert.equal('unitCost' in (staff.batches as object[])[0], false);
}

{
  const reorder = presentReorderForRole('STAFF', {
    siteId: 's1',
    suppliers: [
      {
        partner: { id: 'x', name: 'Metro', phone: '02', email: 'a@b.c', eik: '1', vatNumber: 'BG1' },
        lines: [{ productId: 'p1', name: 'Beer', suggestedQty: 10, unitPrice: 1.2, lineTotal: 12 }],
        total: 12,
      },
    ],
  });
  const group = reorder.suppliers[0] as {
    partner: Record<string, unknown>;
    lines: Record<string, unknown>[];
    total?: number;
  };
  assert.deepEqual(group.partner, { id: 'x', name: 'Metro' });
  assert.equal(group.lines[0].suggestedQty, 10);
  assert.equal('unitPrice' in group.lines[0], false);
  assert.equal('total' in group, false);
}

{
  const detail = presentDocumentDetailForRole('STAFF', {
    document: {
      id: 'd1',
      totals: { calculated: { total: 10 } },
      partner: { id: 'x', name: 'Metro', eik: '123', phone: '1' },
      lines: [{ id: 'l1', quantity: 2, unitPrice: 5, lineTotal: 10, product: { name: 'Beer' } }],
      stocktake: { shortageValue: -3, counted: 1 },
    },
    posting: { ok: true },
  });
  const doc = detail.document as Record<string, unknown>;
  assert.equal('totals' in doc, false);
  assert.deepEqual(doc.partner, { id: 'x', name: 'Metro' });
  const line = (doc.lines as Record<string, unknown>[])[0];
  assert.equal(line.quantity, 2);
  assert.equal('unitPrice' in line, false);
  assert.equal('lineTotal' in line, false);
}

{
  const tree = stripStaffFinancialTree('STAFF', { a: { cost: 1, profit: 2, name: 'ok' }, bankAccount: 'IBAN' });
  assert.deepEqual(tree, { a: { name: 'ok' } });
  const keys = collectJsonKeys(tree);
  for (const forbidden of STAFF_FORBIDDEN_FIELD_NAMES) {
    assert.equal(keys.has(forbidden), false, `leaked ${forbidden}`);
  }
}

console.log('staff-view tests passed');
