import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./lib/order-store.js', () => ({
  getOrder: vi.fn(),
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

vi.mock('./lib/delivery-workflow.js', () => ({
  processDeliveryWorkflow: vi.fn(),
}));

vi.mock('./lib/mailer.js', () => ({
  sendOpsEmail: vi.fn(),
  sendPaymentFailedEmail: vi.fn(),
}));

vi.mock('./lib/stripe-webhook.js', () => ({
  getRawBody: vi.fn(),
  readRawBody: vi.fn(),
  verifyStripeSignature: vi.fn(),
}));

const { handleStripeEvent } = await import('./checkout-webhook.js');
const {
  getOrder,
  getOrderBySessionId,
  updateOrder,
  markEventProcessed,
  recordOrderEvent,
  createLicenseForOrder,
  upsertCustomerForOrder,
} = await import('./lib/order-store.js');
const { enqueueDeliveryWorkflowForOrder } = await import('./lib/workflow-store.js');
const { processDeliveryWorkflow } = await import('./lib/delivery-workflow.js');
const { sendOpsEmail, sendPaymentFailedEmail } = await import('./lib/mailer.js');

describe('handleStripeEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markEventProcessed.mockResolvedValue(true);
  });

  it('handles checkout.session.completed and processes the workflow inline', async () => {
    getOrderBySessionId.mockResolvedValue({ orderId: 'ord_test123', licenseId: null });
    updateOrder.mockResolvedValue({ orderId: 'ord_test123', status: 'active' });
    createLicenseForOrder.mockResolvedValue({ licenseId: 'lic_test' });
    upsertCustomerForOrder.mockResolvedValue({});
    recordOrderEvent.mockResolvedValue({});
    enqueueDeliveryWorkflowForOrder.mockResolvedValue({ workflowId: 'wf_test', created: true });
    processDeliveryWorkflow.mockResolvedValue({ workflowId: 'wf_test', status: 'delivered' });

    const event = {
      id: 'evt_test_123',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test', metadata: { orderId: 'ord_test123' } } },
    };

    const result = await handleStripeEvent(event);

    expect(result.handled).toBe(true);
    expect(result.action).toBe('order_activated_workflow_queued');
    expect(processDeliveryWorkflow).toHaveBeenCalledWith('wf_test');
    expect(result.workflowStatus).toBe('delivered');
  });

  it('still acknowledges the order when inline workflow processing throws', async () => {
    getOrderBySessionId.mockResolvedValue({ orderId: 'ord_test123', licenseId: 'lic_x' });
    updateOrder.mockResolvedValue({ orderId: 'ord_test123', status: 'active' });
    upsertCustomerForOrder.mockResolvedValue({});
    recordOrderEvent.mockResolvedValue({});
    enqueueDeliveryWorkflowForOrder.mockResolvedValue({ workflowId: 'wf_test', created: true });
    processDeliveryWorkflow.mockRejectedValue(new Error('boom'));

    const result = await handleStripeEvent({
      id: 'evt_test_err',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test', metadata: { orderId: 'ord_test123' } } },
    });

    expect(result.handled).toBe(true);
    expect(result.workflowStatus).toBe('queued');
  });

  it('handles customer.subscription.created with order metadata', async () => {
    updateOrder.mockResolvedValue({ orderId: 'ord_sub1' });
    recordOrderEvent.mockResolvedValue({});

    const result = await handleStripeEvent({
      id: 'evt_sub_456',
      type: 'customer.subscription.created',
      data: {
        object: { id: 'sub_test', customer: 'cus_test', status: 'active', metadata: { orderId: 'ord_sub1' } },
      },
    });

    expect(result.handled).toBe(true);
    expect(result.action).toBe('subscription_created');
    expect(result.orderId).toBe('ord_sub1');
    expect(updateOrder).toHaveBeenCalledWith('ord_sub1', { stripeSubscriptionId: 'sub_test' });
  });

  it('cancels the order on customer.subscription.deleted', async () => {
    updateOrder.mockResolvedValue({ orderId: 'ord_sub2', status: 'cancelled', customer: { email: 'a@b.ch' } });
    upsertCustomerForOrder.mockResolvedValue({});
    recordOrderEvent.mockResolvedValue({});

    const result = await handleStripeEvent({
      id: 'evt_sub_789',
      type: 'customer.subscription.deleted',
      data: {
        object: { id: 'sub_cancel', customer: 'cus_cancel', status: 'canceled', metadata: { orderId: 'ord_sub2' } },
      },
    });

    expect(result.handled).toBe(true);
    expect(result.action).toBe('subscription_cancelled');
    expect(updateOrder).toHaveBeenCalledWith('ord_sub2', { status: 'cancelled' });
    expect(upsertCustomerForOrder).toHaveBeenCalled();
  });

  it('sends dunning + ops mail on invoice.payment_failed', async () => {
    getOrder.mockResolvedValue({ orderId: 'ord_pay1', customer: { email: 'k@kanzlei.ch' } });
    updateOrder.mockResolvedValue({});
    recordOrderEvent.mockResolvedValue({});
    sendPaymentFailedEmail.mockResolvedValue({ sent: true });
    sendOpsEmail.mockResolvedValue({ sent: true });

    const result = await handleStripeEvent({
      id: 'evt_inv_1',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_test',
          customer: 'cus_x',
          amount_due: 8900,
          currency: 'chf',
          subscription_details: { metadata: { orderId: 'ord_pay1' } },
        },
      },
    });

    expect(result.handled).toBe(true);
    expect(result.action).toBe('payment_failed');
    expect(updateOrder).toHaveBeenCalledWith('ord_pay1', { paymentStatus: 'past_due' });
    expect(sendPaymentFailedEmail).toHaveBeenCalled();
    expect(sendOpsEmail).toHaveBeenCalled();
  });

  it('marks duplicate events as handled', async () => {
    markEventProcessed.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    getOrderBySessionId.mockResolvedValue(null);
    updateOrder.mockResolvedValue(null);
    recordOrderEvent.mockResolvedValue({});

    const event = {
      id: 'evt_duplicate',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test', metadata: {} } },
    };

    const firstResult = await handleStripeEvent(event);
    expect(firstResult.handled).toBe(false);
    expect(firstResult.duplicate).toBeUndefined();

    const secondResult = await handleStripeEvent(event);
    expect(secondResult.handled).toBe(true);
    expect(secondResult.duplicate).toBe(true);
  });

  it('returns handled:false for unhandled event types (incl. legacy names)', async () => {
    for (const type of ['customer.updated', 'subscription.created', 'subscription.cancelled']) {
      const result = await handleStripeEvent({ id: `evt_${type}`, type, data: { object: {} } });
      expect(result.handled).toBe(false);
      expect(result.reason).toContain('Unhandled event type');
    }
  });
});
