import { getEnvFirst } from './lib/env.js';
import { processDeliveryWorkflow } from './lib/delivery-workflow.js';
import { sendOpsEmail, sendPaymentFailedEmail } from './lib/mailer.js';
import {
  createLicenseForOrder,
  getOrder,
  getOrderBySessionId,
  markEventProcessed,
  recordOrderEvent,
  updateOrder,
  upsertCustomerForOrder,
} from './lib/order-store.js';
import { readRawBody, verifyStripeSignature } from './lib/stripe-webhook.js';
import { enqueueDeliveryWorkflowForOrder } from './lib/workflow-store.js';

export const config = {
  maxDuration: 60,
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

  // Process the delivery workflow right away — there is no minute-level cron on
  // this plan. Failures are non-fatal: the job stays queued for the daily cron.
  let workflowResult = null;
  try {
    workflowResult = await processDeliveryWorkflow(workflow.workflowId);
  } catch (error) {
    console.error('[checkout-webhook] Inline workflow processing failed:', error.message);
  }

  return {
    handled: true,
    action: 'order_activated_workflow_queued',
    orderId: order.orderId,
    workflowId: workflow.workflowId,
    workflowCreated: workflow.created,
    workflowStatus: workflowResult?.status || 'queued',
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

async function applySubscriptionCreated(subscription) {
  const orderId = subscription.metadata?.orderId || null;
  if (orderId) {
    await updateOrder(orderId, { stripeSubscriptionId: subscription.id });
    await recordOrderEvent(orderId, 'subscription.created', {
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer,
      status: subscription.status,
    });
  }
  return {
    handled: true,
    action: 'subscription_created',
    subscriptionId: subscription.id,
    orderId,
  };
}

async function applySubscriptionDeleted(subscription) {
  const orderId = subscription.metadata?.orderId || null;
  if (!orderId) return { handled: true, action: 'subscription_cancelled', orderId: null };

  const order = await updateOrder(orderId, { status: 'cancelled' });
  if (order) await upsertCustomerForOrder(order);
  await recordOrderEvent(orderId, 'subscription.cancelled', {
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: subscription.customer,
    status: subscription.status,
  });
  return { handled: true, action: 'subscription_cancelled', orderId };
}

function orderIdFromInvoice(invoice) {
  return (
    invoice.subscription_details?.metadata?.orderId ||
    invoice.parent?.subscription_details?.metadata?.orderId ||
    invoice.lines?.data?.[0]?.metadata?.orderId ||
    null
  );
}

async function applyInvoicePaymentFailed(invoice) {
  const orderId = orderIdFromInvoice(invoice);
  const order = orderId ? await getOrder(orderId) : null;

  if (order) {
    await updateOrder(order.orderId, { paymentStatus: 'past_due' });
    await recordOrderEvent(order.orderId, 'invoice.payment_failed', {
      stripeInvoiceId: invoice.id,
      stripeCustomerId: invoice.customer || null,
      amountDue: invoice.amount_due ?? null,
    });
    try {
      await sendPaymentFailedEmail(order);
    } catch (error) {
      console.error('[checkout-webhook] Dunning email failed:', error.message);
    }
  }

  try {
    await sendOpsEmail(`Stripe Zahlung fehlgeschlagen${orderId ? `: ${orderId}` : ''}`, [
      `Invoice: ${invoice.id}`,
      `Kunde: ${invoice.customer_email || invoice.customer || 'unbekannt'}`,
      `Betrag: ${invoice.amount_due ?? '?'} ${invoice.currency || ''}`,
      `Auftrag: ${orderId || 'nicht zuordenbar'}`,
    ]);
  } catch (error) {
    console.error('[checkout-webhook] Ops alert failed:', error.message);
  }

  return { handled: true, action: 'payment_failed', orderId };
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
    case 'customer.subscription.created':
      return applySubscriptionCreated(object);
    case 'customer.subscription.deleted':
      return applySubscriptionDeleted(object);
    case 'invoice.payment_failed':
      return applyInvoicePaymentFailed(object);
    default:
      return { handled: false, reason: `Unhandled event type: ${event.type}` };
  }
}

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const webhookSecret = getEnvFirst(['STRIPE_WEBHOOK_SECRET']);
  const rawBody = await readRawBody(req);
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
