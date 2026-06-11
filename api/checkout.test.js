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
