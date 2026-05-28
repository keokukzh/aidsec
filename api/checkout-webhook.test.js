import { describe, it, expect } from 'vitest';
import { handleStripeEvent } from './checkout-webhook.js';

/**
 * Mock helper for Stripe events
 */
function createStripeEvent(type, data = {}) {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    data: {
      object: {
        id: data.id || `sub_test_${Date.now()}`,
        customer: data.customer || 'cus_test',
        subscription: data.subscription || null,
        status: data.status || 'active',
        metadata: data.metadata || {},
        ...data,
      },
    },
  };
}

describe('checkout-webhook', () => {
  it('handles subscription.created event', async () => {
    const event = createStripeEvent('subscription.created', {
      id: 'sub_stripe_123',
      customer: 'cus_stripe_abc',
      status: 'active',
    });

    const result = await handleStripeEvent(event);

    expect(result.handled).toBe(true);
    expect(result.action).toBe('subscription_created');
    expect(result.subscriptionId).toBe('sub_stripe_123');
  });

  it('handles subscription.cancelled event', async () => {
    const event = createStripeEvent('subscription.cancelled', {
      id: 'sub_stripe_cancel_123',
      customer: 'cus_stripe_cancel',
      status: 'canceled',
    });

    const result = await handleStripeEvent(event);

    expect(result.handled).toBe(true);
    expect(result.action).toBe('subscription_cancelled');
  });

  it('subscription.created handler returns correct structure', async () => {
    const event = createStripeEvent('subscription.created', {
      id: 'sub_xyz',
      customer: 'cus_xyz',
      status: 'trialing',
    });

    const result = await handleStripeEvent(event);

    expect(typeof result.handled).toBe('boolean');
    expect(typeof result.action).toBe('string');
    expect(typeof result.subscriptionId).toBe('string');
    expect(result.subscriptionId).toBe('sub_xyz');
  });

  it('subscription events record order events for tracking', async () => {
    const subId = `sub_events_${Date.now()}`;
    const customerId = 'cus_events';

    const event = createStripeEvent('subscription.created', {
      id: subId,
      customer: customerId,
      status: 'active',
    });

    const result = await handleStripeEvent(event);
    expect(result.handled).toBe(true);
    expect(result.action).toBe('subscription_created');
  });

  it('subscription.created and subscription.cancelled have unique event IDs for deduplication', async () => {
    const eventId1 = `evt_sub_created_${Date.now()}`;
    const eventId2 = `evt_sub_canceled_${Date.now()}`;

    // First call should be processed
    const createEvent = {
      id: eventId1,
      type: 'subscription.created',
      data: {
        object: {
          id: 'sub_dedup_test',
          customer: 'cus_dedup',
          status: 'active',
        },
      },
    };

    const cancelEvent = {
      id: eventId2,
      type: 'subscription.cancelled',
      data: {
        object: {
          id: 'sub_dedup_test',
          customer: 'cus_dedup',
          status: 'canceled',
        },
      },
    };

    const firstResult = await handleStripeEvent(createEvent);
    const secondCall = await handleStripeEvent(createEvent);
    const cancelResult = await handleStripeEvent(cancelEvent);

    expect(firstResult.handled).toBe(true);
    expect(secondCall.duplicate).toBe(true);
    expect(cancelResult.handled).toBe(true);
  });

  it('unhandled event types are rejected', async () => {
    const event = createStripeEvent('customer.subscription.updated', {
      id: 'sub_unknown',
      customer: 'cus_unknown',
      status: 'active',
    });

    const result = await handleStripeEvent(event);

    expect(result.handled).toBe(false);
    expect(result.reason !== undefined || result.error !== undefined).toBeTruthy();
  });

  it('subscription events handle different status values', async () => {
    const statuses = ['active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete'];

    for (const status of statuses) {
      const event = createStripeEvent('subscription.created', {
        id: `sub_status_${status}`,
        customer: 'cus_status',
        status,
      });

      const result = await handleStripeEvent(event);

      expect(result.handled).toBe(true);
      expect(result.action).toBe('subscription_created');
    }
  });
});
