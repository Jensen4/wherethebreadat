import { describe, expect, it } from 'vitest';
import { summarize, toCents } from './money';
import type { Payment, Paystub } from '../types';

describe('money inputs', () => {
  it('converts decimal strings to exact cents', () => {
    expect(toCents('0.29')).toBe(29);
    expect(toCents('1200.5')).toBe(120050);
    expect(toCents(' 15 ')).toBe(1500);
  });
  it('rejects negative, fractional-cent, exponent and oversized inputs', () => {
    for (const input of ['-2', '1.005', '1e3', '', 'NaN', '10000000001']) {
      expect(() => toCents(input)).toThrow();
    }
  });
});

describe('monthly summaries', () => {
  it('uses take-home pay, paid dates, due dates and separate currencies', () => {
    const stubs: Paystub[] = [
      { id: '1', employer: 'Acme', pay_date: '2026-11-15', gross_cents: 250000, deductions_cents: 50000, net_cents: 200000, currency: 'CAD' },
      { id: '2', employer: 'Acme', pay_date: '2026-11-15', gross_cents: 999, deductions_cents: 0, net_cents: 999, currency: 'USD' },
    ];
    const base = { recipient: 'Shop', category: 'other', currency: 'CAD', notes: null };
    const payments: Payment[] = [
      { ...base, id: '1', amount_cents: 30000, due_date: '2026-10-31', status: 'paid', paid_date: '2026-11-01' },
      { ...base, id: '2', amount_cents: 90000, due_date: '2026-11-30', status: 'paid', paid_date: '2026-12-01' },
      { ...base, id: '3', amount_cents: 50000, due_date: '2026-11-30', status: 'pending', paid_date: null },
      { ...base, id: '4', amount_cents: 9999, due_date: '2026-11-30', status: 'paid', paid_date: '2026-11-30', currency: 'USD' },
    ];
    expect(summarize(stubs, payments, '2026-11', 'CAD')).toMatchObject({ net: 200000, spent: 30000, upcoming: 50000, remaining: 170000 });
  });
  it('keeps negative remaining income visible', () => {
    const payments: Payment[] = [{ id: '1', recipient: 'Shop', category: 'other', currency: 'CAD', notes: null, amount_cents: 100, due_date: '2026-11-15', status: 'paid', paid_date: '2026-11-15' }];
    expect(summarize([], payments, '2026-11', 'CAD').remaining).toBe(-100);
  });
});
