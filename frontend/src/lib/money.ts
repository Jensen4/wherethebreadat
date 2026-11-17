import type { Payment, Paystub } from '../types';

export function toCents(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) {
    throw new Error('Enter an amount with up to two decimal places.');
  }
  const [whole, fraction = ''] = value.trim().split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > 1e12) throw new Error('That amount is too large.');
  return cents;
}

export function money(cents: number, currency = 'CAD'): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(cents / 100);
}

export function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function dateLabel(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function summarize(paystubs: Paystub[], payments: Payment[], month: string, currency: string) {
  const income = paystubs.filter(p => p.currency === currency && p.pay_date.startsWith(month));
  const expenses = payments.filter(p => p.currency === currency && p.status === 'paid' && p.paid_date?.startsWith(month));
  const pending = payments.filter(p => p.currency === currency && p.status === 'pending' && p.due_date.startsWith(month));
  const net = income.reduce((sum, p) => sum + p.net_cents, 0);
  const spent = expenses.reduce((sum, p) => sum + p.amount_cents, 0);
  const upcoming = pending.reduce((sum, p) => sum + p.amount_cents, 0);
  return { income, expenses, pending, net, spent, upcoming, remaining: net - spent };
}
