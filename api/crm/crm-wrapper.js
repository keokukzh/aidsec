/**
 * AidSec CRM Wrapper
 *
 * Central wrapper for CRM operations.
 * Provides unified interface for lead sync and status updates.
 */

import { getEnvFirst } from '../lib/env.js';
import { createLead, updateLead, getLead } from '../lib/airtable.js';

const CRM_ENABLED = !!(getEnvFirst(['AIRTABLE_API_KEY']) && getEnvFirst(['AIRTABLE_BASE_ID']));

/**
 * Sync a new lead to CRM
 * @param {{ email: string, name: string, company?: string, source?: string, score?: number }} leadData
 * @returns {{ success: boolean, airtableId?: string, error?: string }}
 */
export async function syncLead(leadData) {
  if (!CRM_ENABLED) {
    return { success: false, error: 'CRM not configured' };
  }

  const result = await createLead({
    email: leadData.email,
    name: leadData.name || '',
    company: leadData.company || '',
    source: leadData.source || 'checkout',
    score: leadData.score || 0,
  });

  return result;
}

/**
 * Update lead status based on lifecycle event
 * @param {string} email
 * @param {'checkout.session.completed'|'subscription.created'|'subscription.cancelled'|'followup.sent'|'contact.submitted'} eventType
 * @param {{ name?: string, company?: string, score?: number }} eventData
 * @returns {{ success: boolean, error?: string }}
 */
export async function updateLeadStatus(email, eventType, eventData = {}) {
  if (!CRM_ENABLED) {
    return { success: false, error: 'CRM not configured' };
  }

  const statusMap = {
    'checkout.session.completed': { status: 'qualified' },
    'subscription.created': { status: 'customer' },
    'subscription.cancelled': { status: 'churned' },
    'followup.sent': { status: 'contacted' },
    'contact.submitted': { status: 'new' },
  };

  const updates = { ...(statusMap[eventType] || {}) };

  if (eventData.name) updates.name = eventData.name;
  if (eventData.company) updates.company = eventData.company;
  if (eventData.score !== undefined) updates.score = eventData.score;

  return await updateLead(email, updates);
}

/**
 * Get lead from CRM by email
 * @param {string} email
 * @returns {{ success: boolean, lead?: { id: string, fields: object }, error?: string }}
 */
export async function fetchLead(email) {
  if (!CRM_ENABLED) {
    return { success: false, error: 'CRM not configured' };
  }

  return await getLead(email);
}

/**
 * Check if CRM is configured
 * @returns {boolean}
 */
export function isCrmEnabled() {
  return CRM_ENABLED;
}