import { getEnvFirst } from './lib/env.js';
import {
  createLicenseForOrder,
  getOrderBySessionId,
  markEventProcessed,
  recordOrderEvent,
  updateOrder,
  upsertCustomerForOrder,
} from './lib/order-store.js';
import { getRawBody, verifyStripeSignature } from './lib/stripe-webhook.js';
import { enqueueDeliveryWorkflowForOrder } from './lib/workflow-store.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function applyCheckoutCompleted(session) {
  const orderId = session.metadata?.orderId;
  const order = orderId ? await updateOrder(orderId, {}) : await getOrderBySessionId(session.id);
  if (!order) return { handled: false, reason: 'Order not found' };

  const paymentTime = new Date().toISOString();
  const updatedOrder = await updateOrder(order.orderId, {
    status: 'active',
    paymentStatus: session.payment_status || 'paid',
    stripeSessionId: session.id,
    stripeCustomerId: session.customer || null,
    stripeSubscriptionId: session.subscription || null,
    timeline: {
      payment: { time: paymentTime, label: 'Zahlung bestaetigt', step: 2 },
    },
  });

  if (!order.licenseId) {
    await createLicenseForOrder(order.orderId);
  }
  const customerOrder = await updateOrder(order.orderId, {});
  await upsertCustomerForOrder(customerOrder || updatedOrder);
  await recordOrderEvent(order.orderId, 'order.paid', {
    stripeSessionId: session.id,
    stripeCustomerId: session.customer || null,
    stripeSubscriptionId: session.subscription || null,
  });
  await recordOrderEvent(order.orderId, 'checkout.session.completed', {
    stripeSessionId: session.id,
    stripeCustomerId: session.customer || null,
    stripeSubscriptionId: session.subscription || null,
  });
  const workflow = await enqueueDeliveryWorkflowForOrder(order.orderId);

  return {
    handled: true,
    action: 'order_activated_workflow_queued',
    orderId: order.orderId,
    workflowId: workflow.workflowId,
    workflowCreated: workflow.created,
  };
}

async function applyCheckoutExpired(session) {
  const orderId = session.metadata?.orderId;
  const order = orderId ? await updateOrder(orderId, {}) : await getOrderBySessionId(session.id);
  if (!order) return { handled: false, reason: 'Order not found' };

  await updateOrder(order.orderId, {
    status: 'expired',
    paymentStatus: 'expired',
    stripeSessionId: session.id,
  });
  await recordOrderEvent(order.orderId, 'checkout.session.expired', { stripeSessionId: session.id });
  return { handled: true, action: 'order_expired', orderId: order.orderId };
}

async function handleStripeEvent(event) {
  if (event.id) {
    const firstSeen = await markEventProcessed(event.id);
    if (!firstSeen) return { handled: true, duplicate: true };
  }

  const object = event.data?.object || {};
  switch (event.type) {
    case 'checkout.session.completed':
      return applyCheckoutCompleted(object);
    case 'checkout.session.expired':
      return applyCheckoutExpired(object);
    case 'invoice.payment_failed':
      return { handled: true, action: 'payment_failed' };
    default:
      return { handled: false, reason: `Unhandled event type: ${event.type}` };
  }
}

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const webhookSecret = getEnvFirst(['STRIPE_WEBHOOK_SECRET']);
  const rawBody = getRawBody(req);
  const signature = req.headers?.['stripe-signature'];
  const verification = verifyStripeSignature(rawBody, signature, webhookSecret);

  if (!verification.valid) {
    console.warn('[checkout-webhook] Signature failed:', verification.reason);
    return res.status(400).json({ error: 'Webhook verification failed' });
  }

  try {
    const result = await handleStripeEvent(verification.event);
    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    console.error('[checkout-webhook] Handler error:', error);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}

export { handleStripeEvent };
