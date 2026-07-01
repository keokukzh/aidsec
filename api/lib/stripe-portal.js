import { getEnvFirst, isProduction } from './env.js';

/**
 * Creates a Stripe Customer Portal Session for a given customer.
 * 
 * @param {Object} params
 * @param {string} params.stripeCustomerId - Stripe Customer ID
 * @param {string} params.returnUrl - Return URL after exiting the portal
 * @returns {Promise<Object>} The Stripe session object containing the redirect URL
 */
export async function createStripePortalSession({ stripeCustomerId, returnUrl }) {
  const stripeKey = getEnvFirst(['STRIPE_SECRET_KEY']);

  if (!stripeKey) {
    if (isProduction()) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    // Dummy session link in development
    return {
      url: returnUrl,
    };
  }

  const payload = {
    customer: stripeCustomerId,
    return_url: returnUrl,
  };

  const form = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => {
    form.append(key, String(value));
  });

  const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(`Stripe Portal session creation failed: ${errorPayload.error?.message || response.status}`);
  }

  return response.json();
}
