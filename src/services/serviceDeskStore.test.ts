import { describe, expect, it, vi } from 'vitest';
import { initialServiceDeskState } from '../data/repairShop';
import type { WorkItemDraft } from '../types';
import { approveEstimateRecord, createWorkItemRecord, getMetrics, updateWorkItemRecord } from './serviceDeskStore';

const draft: WorkItemDraft = {
  customerName: 'Sam Taylor',
  customerPhone: '+1 555 0199',
  customerEmail: 'sam@example.com',
  source: 'Online',
  deviceType: 'Laptop',
  deviceModel: 'MacBook Air',
  serialNumber: 'MBA-11',
  issueSummary: 'Keyboard keys not responding',
  priority: 'High',
  assignedTechnicianId: 'tech-arun',
};

describe('serviceDeskStore', () => {
  it('creates a work item and customer record', () => {
    const next = createWorkItemRecord(initialServiceDeskState, draft, 'Agent User');

    expect(next.workItems[0]).toMatchObject({
      customerName: 'Sam Taylor',
      status: 'Assigned',
      assignedTechnicianId: 'tech-arun',
    });
    expect(next.customers[0]).toMatchObject({ email: 'sam@example.com' });
  });

  it('updates technician diagnosis and appends timeline updates', () => {
    vi.useFakeTimers();
    const next = updateWorkItemRecord(
      initialServiceDeskState,
      'WI-1024',
      { status: 'Estimate Shared', estimatedPrice: 175, analysis: 'Keyboard top case failed.' },
      'Technician',
      'Estimate shared.',
    );

    const item = next.workItems.find((workItem) => workItem.id === 'WI-1024');
    expect(item?.status).toBe('Estimate Shared');
    expect(item?.estimatedPrice).toBe(175);
    expect(item?.updates.at(-1)?.actor).toBe('Technician');
    vi.useRealTimers();
  });

  it('approves an estimate from customer view', () => {
    const next = approveEstimateRecord(initialServiceDeskState, 'WI-1026');
    const item = next.workItems.find((workItem) => workItem.id === 'WI-1026');

    expect(item?.approvedByCustomer).toBe(true);
    expect(item?.status).toBe('Customer Approved');
  });

  it('calculates operational metrics', () => {
    const metrics = getMetrics(initialServiceDeskState);

    expect(metrics.activeWorkItems).toBeGreaterThan(0);
    expect(metrics.lowStockParts).toBeGreaterThan(0);
    expect(metrics.estimatedRevenue).toBe(558);
  });
});
