/**
 * AidSec Reporting Dashboard API
 * Monatliche Reports und KPI-Dashboard für AidSec Operations
 *
 * GET /api/reporting/dashboard — Dashboard-Daten
 * GET /api/reporting/kpis — KPI-Zusammenfassung
 * GET /api/reporting/export — Export als JSON
 */

import { storage } from '../cron/storage.js';
import { getEnvFirst, isProduction } from '../lib/env.js';
import { getOrder, getCustomer, listCustomerMonitoringTargets } from '../lib/order-store.js';

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('de-CH', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}

async function loadMonthlyReports() {
  const reports = [];
  try {
    const keys = await storage.list('reports/monthly/');
    for (const key of keys) {
      if (key.endsWith('.json')) {
        const data = await storage.get(key);
        if (data) reports.push(data);
      }
    }
  } catch (_) {}
  return reports.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

async function loadReauditReports() {
  const reports = [];
  try {
    const keys = await storage.list('reports/reaudit/');
    for (const key of keys) {
      if (key.endsWith('.json')) {
        const data = await storage.get(key);
        if (data) reports.push(data);
      }
    }
  } catch (_) {}
  return reports.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

async function computeKPIs() {
  const customers = await listCustomerMonitoringTargets().catch(() => []);
  let totalRevenue = 0;
  let activeSubscriptions = 0;
  let totalOrders = 0;

  const productRevenue = { 'rapid-header-fix': 0, 'kanzlei-haertung': 0, 'cyber-mandat': 0 };
  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };

  for (const customer of customers) {
    if (!customer.orderId) continue;
    try {
      const order = await getOrder(customer.orderId);
      if (!order) continue;
      totalOrders++;

      if (order.paymentStatus === 'paid') {
        if (order.productSlug === 'cyber-mandat') {
          activeSubscriptions++;
          totalRevenue += 89;
        } else if (order.productSlug === 'kanzlei-haertung') {
          totalRevenue += 790;
          productRevenue['kanzlei-haertung'] += 790;
        } else if (order.productSlug === 'rapid-header-fix') {
          totalRevenue += 390;
          productRevenue['rapid-header-fix'] += 390;
        }
      }

      if (order.monitoring?.grade) {
        const g = order.monitoring.grade.toUpperCase();
        if (gradeDistribution.hasOwnProperty(g)) {
          gradeDistribution[g]++;
        }
      }
    } catch (_) {}
  }

  return {
    totalRevenue,
    activeSubscriptions,
    totalCustomers: customers.length,
    totalOrders,
    productRevenue,
    gradeDistribution,
    mrr: activeSubscriptions * 89,
    arr: activeSubscriptions * 89 * 12,
  };
}

async function getRecentActivity() {
  const activities = [];
  try {
    const recent = await storage.list('reports/');
    const recentKeys = recent.filter(k => k.endsWith('.json')).sort().slice(-20);
    for (const key of recentKeys) {
      const data = await storage.get(key);
      if (data && data.timestamp) {
        activities.push({
          type: key.includes('monthly') ? 'monitoring' : key.includes('reaudit') ? 'reaudit' : 'audit',
          timestamp: data.timestamp,
          summary: data.summary || {},
          key,
        });
      }
    }
  } catch (_) {}
  return activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const internalSecret = getEnvFirst(['INTERNAL_API_SECRET']);

  if (isProduction() && internalSecret && authHeader !== `Bearer ${internalSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const url = new URL(req.url, 'https://aidsec.ch');
  const path = url.pathname.split('/').pop();

  try {
    if (path === 'kpis') {
      const kpis = await computeKPIs();
      return res.status(200).json({ success: true, kpis, generatedAt: new Date().toISOString() });
    }

    if (path === 'export') {
      const [kpis, monthly, reaudit] = await Promise.all([
        computeKPIs(),
        loadMonthlyReports(),
        loadReauditReports(),
      ]);
      return res.status(200).json({
        success: true,
        exportedAt: new Date().toISOString(),
        kpis,
        monthlyReports: monthly,
        reauditReports: reaudit,
      });
    }

    // Default: dashboard data
    const [kpis, monthlyReports, reauditReports, recentActivity] = await Promise.all([
      computeKPIs(),
      loadMonthlyReports(),
      loadReauditReports(),
      getRecentActivity(),
    ]);

    return res.status(200).json({
      success: true,
      dashboard: {
        kpis,
        monthlyReports: monthlyReports.slice(0, 12),
        reauditReports: reauditReports.slice(0, 12),
        recentActivity,
        generatedAt: new Date().toISOString(),
      }
    });
  } catch (error) {
    console.error('[reporting] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}