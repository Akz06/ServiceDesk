import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initialServiceDeskState } from '../src/data/repairShop';

const queryMock = vi.fn();
const clientQueryMock = vi.fn(async (sql: string, params?: unknown[]) => {
  void sql;
  void params;
  return { rows: [], rowCount: 0 };
});
const withTransactionMock = vi.fn(async (callback: (client: { query: typeof clientQueryMock }) => Promise<unknown>) =>
  callback({ query: clientQueryMock }),
);

vi.mock('./db', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  withTransaction: (callback: (client: { query: typeof clientQueryMock }) => Promise<unknown>) => withTransactionMock(callback),
}));

const { replaceAllData } = await import('./repository');

beforeEach(() => {
  queryMock.mockReset();
  clientQueryMock.mockClear();
  withTransactionMock.mockClear();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('replaceAllData', () => {
  it('namespaces the fixed sample-data ids per organization so two orgs never collide', async () => {
    await replaceAllData(initialServiceDeskState, 'org-aaa');
    const insertsForOrgA = clientQueryMock.mock.calls.map(([sql, params]) => ({ sql, params }));

    clientQueryMock.mockClear();
    await replaceAllData(initialServiceDeskState, 'org-bbb');
    const insertsForOrgB = clientQueryMock.mock.calls.map(([sql, params]) => ({ sql, params }));

    const customerInsertA = insertsForOrgA.find((call) => (call.sql as string).includes('INSERT INTO customers'));
    const customerInsertB = insertsForOrgB.find((call) => (call.sql as string).includes('INSERT INTO customers'));
    const customerIdA = (customerInsertA?.params as unknown[])[0];
    const customerIdB = (customerInsertB?.params as unknown[])[0];

    expect(customerIdA).not.toBe(customerIdB);
    expect(customerIdA).toContain('org-aaa');
    expect(customerIdB).toContain('org-bbb');

    // Cross-references (work item -> customer/technician, invoice -> work item/customer) must
    // use the exact same namespaced id as the row they point to, not the original fixed id.
    const workItemInsert = insertsForOrgA.find((call) => (call.sql as string).includes('INSERT INTO work_items'));
    const workItemParams = workItemInsert?.params as unknown[];
    expect(workItemParams[0]).toBe(`org-aaa:${initialServiceDeskState.workItems[0].id}`);
    expect(workItemParams[1]).toBe(1);
    expect(workItemParams[3]).toBe(`org-aaa:${initialServiceDeskState.workItems[0].customerId}`);

    const invoiceInsert = insertsForOrgA.find((call) => (call.sql as string).includes('INSERT INTO invoices'));
    const invoiceParams = invoiceInsert?.params as unknown[];
    expect(invoiceParams[1]).toBe(1);
    expect(invoiceParams[3]).toBe(`org-aaa:${initialServiceDeskState.invoices[0].workItemId}`);
    expect(invoiceParams[4]).toBe(`org-aaa:${initialServiceDeskState.invoices[0].customerId}`);
  });

  it('leaves inventory part skus unscoped since that table already has a composite (organization_id, sku) key', async () => {
    await replaceAllData(initialServiceDeskState, 'org-aaa');
    const partInsert = clientQueryMock.mock.calls.find(([sql]) => (sql as string).includes('INSERT INTO inventory_parts'));
    const params = partInsert?.[1] as unknown[];
    expect(params[0]).toBe(initialServiceDeskState.inventoryParts[0].sku);
  });
});
