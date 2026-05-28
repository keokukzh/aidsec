import { getEnvFirst, isProduction } from '../lib/env.js';
import {
  getOrder,
  getCustomer,
  getCustomerIdByEmail,
  getWebsiteRecordByUrl,
  upsertCustomerForOrder,
} from '../lib/order-store.js';
import { generateMagicToken } from '../lib/order-token.js';
import { getWorkflowForOrder } from '../lib/workflow-store.js';

function validateInternalRequest(req) {
  if (!isProduction()) return true;
  const expected = getEnvFirst(['INTERNAL_API_SECRET']);
  const provided = req.headers?.['x-aidsec-internal-secret'];
  return !!expected && provided === expected;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', getEnvFirst(['ALLOWED_ORIGIN']) || 'https://aidsec.ch');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-AidSec-Internal-Secret');
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!validateInternalRequest(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { email, website, orderId } = req.query || {};

    if (!email && !website && !orderId) {
      return res.status(400).json({ error: 'Bitte geben Sie email, website oder orderId an' });
    }

    let customerId = null;

    if (orderId) {
      const order = await getOrder(orderId);
      if (order) {
        if (!order.customerId && order.customer?.email) {
          const customer = await upsertCustomerForOrder(order);
          customerId = customer?.customerId;
        } else {
          customerId = order.customerId;
        }
      }
    } else if (email) {
      customerId = await getCustomerIdByEmail(email);
    } else if (website) {
      const webRec = await getWebsiteRecordByUrl(website);
      customerId = webRec?.customerId;
    }

    if (!customerId) {
      return res.status(404).json({ error: 'Kunde oder Auftrag nicht gefunden' });
    }

    const customer = await getCustomer(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Kundendaten nicht gefunden' });
    }

    const orders = [];
    const workflows = [];
    const portalLinks = [];
    const baseUrl = getEnvFirst(['BASE_URL']) || 'https://aidsec.ch';

    if (Array.isArray(customer.orderIds)) {
      for (const id of customer.orderIds) {
        const order = await getOrder(id);
        if (order) {
          orders.push(order);
          const workflow = await getWorkflowForOrder(order.orderId);
          if (workflow) {
            workflows.push({
              workflowId: workflow.workflowId,
              orderId: workflow.orderId,
              productSlug: workflow.productSlug,
              status: workflow.status,
              currentStep: workflow.currentStep,
              attempts: workflow.attempts,
              approvalRequired: !!workflow.approvalRequired,
              lastError: workflow.lastError || null,
              updatedAt: workflow.updatedAt,
            });
          }
          if (customer.email) {
            const token = generateMagicToken(order.orderId, customer.email);
            portalLinks.push({
              orderId: order.orderId,
              productSlug: order.productSlug,
              status: order.status,
              portalUrl: `${baseUrl}/proof-center.html?orderId=${encodeURIComponent(order.orderId)}&token=${encodeURIComponent(token)}`,
              statusUrl: `${baseUrl}/auftrag/${order.orderId}?token=${token}`,
            });
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      customer: {
        customerId: customer.customerId,
        name: customer.name,
        email: customer.email,
        company: customer.company,
        activeProducts: customer.activeProducts,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
      orders,
      workflows,
      portalLinks,
    });
  } catch (error) {
    console.error('[crm-lookup] Error querying CRM data:', error);
    return res.status(500).json({ error: 'Fehler bei der CRM-Abfrage' });
  }
}
