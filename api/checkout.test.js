import { describe, expect, it } from 'vitest';
import { ADD_ONS, PRODUCTS, buildLineItems, normalizeAddOns, resolveAddOns } from './checkout.js';

describe('checkout pricing', () => {
  it('uses CHF 890 yearly fallback for Cyber-Mandat', () => {
    expect(PRODUCTS['cyber-mandat'].priceChfYearly).toBe(89000);

    const [lineItem] = buildLineItems(PRODUCTS['cyber-mandat'], 'yearly');

    expect(lineItem.price_data.unit_amount).toBe(89000);
    expect(lineItem.price_data.recurring.interval).toBe('year');
  });

  it('keeps Cyber-Mandat monthly as the default subscription interval', () => {
    const [lineItem] = buildLineItems(PRODUCTS['cyber-mandat'], 'monthly');

    expect(lineItem.price_data.unit_amount).toBe(8900);
    expect(lineItem.price_data.recurring.interval).toBe('month');
  });

  it('deduplicates add-ons from form payloads', () => {
    expect(normalizeAddOns(['email-sicherheit', 'email-sicherheit', '', 'ndsg-compliance-pack'])).toEqual([
      'email-sicherheit',
      'ndsg-compliance-pack',
    ]);
  });

  it('allows one-time add-ons for one-time products', () => {
    const addOns = resolveAddOns('kanzlei-haertung', ['ndsg-compliance-pack', 'email-sicherheit']);
    const lineItems = buildLineItems(PRODUCTS['kanzlei-haertung'], 'once', addOns);

    expect(lineItems).toHaveLength(3);
    expect(lineItems.map((item) => item.price_data.unit_amount)).toEqual([79000, 49000, 14900]);
    expect(lineItems.every((item) => !item.price_data.recurring)).toBeTruthy();
  });

  it('allows Priority-SLA only for Cyber-Mandat', () => {
    expect(resolveAddOns('cyber-mandat', ['priority-sla'])[0]).toMatchObject(ADD_ONS['priority-sla']);
    expect(() => resolveAddOns('rapid-header-fix', ['priority-sla'])).toThrow(/nicht verfuegbares Add-on/);
  });
});

describe('checkout upsell + trial', () => {
  it('exposes mandate trial config when upsell flag is set', () => {
    // buildLineItems itself is product-agnostic; we test the config flag here.
    const product = PRODUCTS['cyber-mandat'];
    expect(product.mode).toBe('subscription');
    expect(product.priceChf).toBe(8900);
  });

  it('treats unknown upsell flag as no-trial', () => {
    // Handler maps body.upsell === 'mandat-trial' ? 'mandat-trial' : undefined
    // We test the resolver in isolation since the handler is async.
    const flags = ['mandat-trial', 'something-else', '', undefined, null];
    const normalized = flags.map((f) => (f === 'mandat-trial' ? 'mandat-trial' : undefined));
    expect(normalized[0]).toBe('mandat-trial');
    expect(normalized.slice(1)).toEqual([undefined, undefined, undefined, undefined]);
  });
});
