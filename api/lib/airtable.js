/**
 * AidSec Airtable API Wrapper
 *
 * Provides createLead and updateLead functions for CRM integration.
 * Uses AIRTABLE_API_KEY and AIRTABLE_BASE_ID from env.
 */

import { getEnvFirst } from './env.js';

const AIRTABLE_BASE_URL = 'https://api.airtable.com/v0';
const LEADS_TABLE = 'Leads';

/**
 * Get Airtable configuration
 * @returns {{ apiKey: string, baseId: string } | null}
 */
function getAirtableConfig() {
  const apiKey = getEnvFirst(['AIRTABLE_API_KEY']);
  const baseId = getEnvFirst(['AIRTABLE_BASE_ID']);
  if (!apiKey || !baseId) return null;
  return { apiKey, baseId };
}

/**
 * Create a new lead in Airtable
 * @param {{ email: string, name: string, company?: string, source?: string, score?: number, status?: string }} leadData
 * @returns {{ success: boolean, airtableId?: string, error?: string }}
 */
export async function createLead(leadData) {
  const config = getAirtableConfig();

  if (!config) {
    console.warn('[airtable] Airtable not configured (AIRTABLE_API_KEY or AIRTABLE_BASE_ID missing)');
    return { success: false, error: 'Airtable not configured' };
  }

  const { apiKey, baseId } = config;

  try {
    const response = await fetch(`${AIRTABLE_BASE_URL}/${baseId}/${encodeURIComponent(LEADS_TABLE)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          Email: leadData.email,
          Name: leadData.name,
          Company: leadData.company || '',
          Source: leadData.source || 'website',
          Score: leadData.score || 0,
          Status: leadData.status || 'new',
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      console.error('[airtable] Create lead error:', error.error?.message || response.statusText);
      return { success: false, error: error.error?.message || 'Failed to create lead' };
    }

    const record = await response.json();
    return { success: true, airtableId: record.id };
  } catch (err) {
    console.error('[airtable] Create lead exception:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Search for a lead by email address
 * @param {string} email
 * @returns {{ recordId?: string, fields?: object } | null}
 */
async function findLeadByEmail(email) {
  const config = getAirtableConfig();

  if (!config) {
    console.warn('[airtable] Airtable not configured');
    return null;
  }

  const { apiKey, baseId } = config;

  try {
    const filterFormula = encodeURIComponent(`{Email} = "${email.replace(/"/g, '\\"')}"`);
    const response = await fetch(
      `${AIRTABLE_BASE_URL}/${baseId}/${encodeURIComponent(LEADS_TABLE)}?filterByFormula=${filterFormula}&maxRecords=1`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!response.ok) {
      console.error('[airtable] Find lead error:', response.statusText);
      return null;
    }

    const data = await response.json();
    if (data.records && data.records.length > 0) {
      return { recordId: data.records[0].id, fields: data.records[0].fields };
    }

    return null;
  } catch (err) {
    console.error('[airtable] Find lead exception:', err.message);
    return null;
  }
}

/**
 * Update an existing lead in Airtable by email
 * @param {string} email - Email to search for
 * @param {{ status?: string, score?: number, name?: string, company?: string, source?: string }} updates
 * @returns {{ success: boolean, airtableId?: string, error?: string }}
 */
export async function updateLead(email, updates) {
  const config = getAirtableConfig();

  if (!config) {
    console.warn('[airtable] Airtable not configured (AIRTABLE_API_KEY or AIRTABLE_BASE_ID missing)');
    return { success: false, error: 'Airtable not configured' };
  }

  try {
    const lead = await findLeadByEmail(email);

    if (!lead?.recordId) {
      return { success: false, error: 'Lead not found' };
    }

    const fields = {};
    if (updates.status !== undefined) fields.Status = updates.status;
    if (updates.score !== undefined) fields.Score = updates.score;
    if (updates.name !== undefined) fields.Name = updates.name;
    if (updates.company !== undefined) fields.Company = updates.company;
    if (updates.source !== undefined) fields.Source = updates.source;

    const response = await fetch(
      `${AIRTABLE_BASE_URL}/${config.baseId}/${encodeURIComponent(LEADS_TABLE)}/${lead.recordId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      console.error('[airtable] Update lead error:', error.error?.message || response.statusText);
      return { success: false, error: error.error?.message || 'Failed to update lead' };
    }

    const record = await response.json();
    return { success: true, airtableId: record.id };
  } catch (err) {
    console.error('[airtable] Update lead exception:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get a lead by email
 * @param {string} email
 * @returns {{ success: boolean, lead?: { id: string, fields: object }, error?: string }}
 */
export async function getLead(email) {
  const result = await findLeadByEmail(email);
  if (!result) {
    return { success: false, error: 'Lead not found' };
  }
  return { success: true, lead: { id: result.recordId, fields: result.fields } };
}
