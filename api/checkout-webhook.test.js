import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./lib/order-store.js', () => ({
  getOrderBySessionId: vi.fn(),
  updateOrder: vi.fn(),
  markEventProcessed: vi.fn(),
  recordOrderEvent: vi.fn(),
  createLicenseForOrder: vi.fn(),
  upsertCustomerForOrder: vi.fn(),
}));

vi.mock('./lib/workflow-store.js', () => ({
  enqueueDeliveryWorkflowForOrder: vi.fn(),
}));

vi.mock('./lib/stripe-webhook.js', () => ({
  getRawBody: vi.fn(),
  verifyStripeSignature: vi.fn(),
}));

const { handleStripeEvent } = await import('./checkout-webhook.js');
const {
  getOrderBySessionId,
  updateOrder,
  markEventProcessed,
  recordOrderEvent,
  createLicenseForOrder,
  upsertCustomerForOrder,
} = await import('./lib/order-store.js');
const { enqueueDeliveryWorkflowForOrder } = await import('./lib/workflow-store.js');

describe('handleStripeEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markEventProcessed.mockResolvedValue(true);
  });

  it('handles checkout.session.completed', async () => {
    getOrderBySessionId.mockResolvedValue({ orderId: 'ord_test123', licenseId: null });
    updateOrder.mockResolvedValue({ orderId: 'ord_test123', status: 'active' });
    createLicenseForOrder.mockResolvedValue({ licenseId: 'lic_test' });
    upsertCustomerForOrder.mockResolvedValue({});
    recordOrderEvent.mockResolvedValue({});
    enqueueDeliveryWorkflowForOrder.mockResolvedValue({ workflowId: 'wf_test', created: true });

    const event = {
      id: 'evt_test_123',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test', metadata: { orderId: 'ord_test123' } } },
    };

    const result = await handleStripeEvent(event);

    expect(result.handled).toBe(true);
    expect(result.action).toBe('order_activated_workflow_queued');
  });

  it('handles subscription.created', async () => {
    recordOrderEvent.mockResolvedValue({});

    const event = {
      id: 'evt_sub_456',
      type: 'subscription.created',
      data: { object: { id: 'sub_test', customer: 'cus_test', status: 'active' } },
    };

    const result = await handleStripeEvent(event);

    expect(result.handled).toBe(true);
    expect(result.action).toBe('subscription_created');
    expect(result.subscriptionId).toBe('sub_test');
  });

  it('handles subscription.cancelled', async () => {
    recordOrderEvent.mockResolvedValue({});

    const event = {
      id: 'evt_sub_789',
      type: 'subscription.cancelled',
      data: { object: { id: 'sub_cancel', customer: 'cus_cancel', status: 'canceled' } },
    };

    const result = await handleStripeEvent(event);

    expect(result.handled).toBe(true);
    expect(result.action).toBe('subscription_cancelled');
  });

  it('marks duplicate events as handled', async () => {
    markEventProcessed
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    recordOrderEvent.mockResolvedValue({});

    const event = {
      id: 'evt_duplicate',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test', metadata: {} } },
    };

    const firstResult = await handleStripeEvent(event);
    expect(firstResult.handled).toBe(true);
    expect(firstResult.duplicate).toBeUndefined();

    const secondResult = await handleStripeEvent(event);
    expect(secondResult.handled).toBe(true);
    expect(secondResult.duplicate).toBe(true);
  });

  it('returns handled:false for unhandled event types', async () => {
    const event = {
      id: 'evt_unknown',
      type: 'customer.updated',
      data: { object: {} },
    };

    const result = await handleStripeEvent(event);

    expect(result.handled).toBe(false);
    expect(result.reason).toContain('Unhandled event type');
  });
});