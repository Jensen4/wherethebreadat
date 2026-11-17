import { ArrowDownLeft, ArrowUpRight, CalendarDays, ChevronRight, Sprout } from 'lucide-react';
import { dateLabel, money, summarize, today } from '../lib/money';
import type { Editor, Payment, Paystub, View } from '../types';

export function Overview({ paystubs, payments, month, currency, onEdit, onView }: {
  paystubs: Paystub[]; payments: Payment[]; month: string; currency: string;
  onEdit: (editor: Editor) => void; onView: (view: View) => void;
}) {
  const summary = summarize(paystubs, payments, month, currency);
  const spentPercent = summary.net ? Math.round(summary.spent / summary.net * 100) : 0;
  const categories = Object.entries(summary.expenses.reduce<Record<string, number>>((totals, p) => {
    totals[p.category] = (totals[p.category] ?? 0) + p.amount_cents;
    return totals;
  }, {})).sort((a, b) => b[1] - a[1]);
  const bars = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(`${month}-15T12:00:00`);
    date.setMonth(date.getMonth() - 5 + index);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return { label: date.toLocaleDateString('en-CA', { month: 'short' }), ...summarize(paystubs, payments, key, currency) };
  });
  const max = Math.max(...bars.flatMap(b => [b.net, b.spent]), 1);
  const upcoming = [...summary.pending].sort((a, b) => a.due_date.localeCompare(b.due_date));

  return <>
    <section className="stats-grid" aria-label="Monthly summary">
      <article className="stat-card"><div className="stat-top"><span>Take-home income</span><span className="stat-icon green"><ArrowDownLeft size={19} /></span></div><strong>{money(summary.net, currency)}</strong><span className="stat-foot">From {summary.income.length} {summary.income.length === 1 ? 'paystub' : 'paystubs'} this month</span></article>
      <article className="stat-card"><div className="stat-top"><span>Payments made</span><span className="stat-icon peach"><ArrowUpRight size={19} /></span></div><strong>{money(summary.spent, currency)}</strong><span className="stat-foot">{summary.expenses.length} {summary.expenses.length === 1 ? 'payment' : 'payments'} taken care of</span></article>
      <article className="stat-card remaining"><div className="stat-top"><span>Remaining income</span><span className="stat-icon"><Sprout size={19} /></span></div><strong>{money(summary.remaining, currency)}</strong><span className="stat-foot">Take-home income minus paid expenses</span></article>
    </section>
    <div className="overview-grid">
      <section className="panel cashflow"><div className="panel-heading"><div><h2>The bigger picture</h2><p>Little steps, month by month.</p></div><span className="pill neutral">Last 6 months</span></div>
        <div className="chart-legend"><span><i className="legend-dot income-dot" />Income</span><span><i className="legend-dot expenses-dot" />Payments</span></div>
        <div className="bar-chart" role="img" aria-label={`Income and payments over six months, ending ${month}. ${bars.map(b => `${b.label}: income ${money(b.net, currency)}, payments ${money(b.spent, currency)}`).join('; ')}`}>
          <div className="chart-grid"><span>{money(max, currency)}</span><span>{money(Math.round(max / 2), currency)}</span><span>$0</span></div>
          <div className="chart-bars">{bars.map((bar, i) => <div className={`bar-group ${i === 5 ? 'selected' : ''}`} key={i}><div className="bar-pair" title={`${bar.label}: ${money(bar.net, currency)} income · ${money(bar.spent, currency)} paid`}><div className="bar income-bar" style={{ height: `${Math.max(bar.net / max * 100, 1)}%` }} /><div className="bar expense-bar" style={{ height: `${Math.max(bar.spent / max * 100, 1)}%` }} /></div><span>{bar.label}</span></div>)}</div>
        </div>
      </section>
      <section className="panel spending"><div className="panel-heading"><div><h2>Where it’s going</h2><p>Paid expenses this month.</p></div></div>
        <div className="spending-body"><div className="spending-ring" style={{ background: `conic-gradient(var(--green) ${Math.min(spentPercent, 100)}%, var(--ring-track, #edece4) 0)` }}><div><strong>{spentPercent}%</strong><span>of income spent</span></div></div><div className="category-list">{categories.length ? categories.slice(0, 3).map(([category, amount], i) => <div className="category" key={category}><span><i className={`category-dot dot-${i}`} />{category}</span><strong>{money(amount, currency)}</strong></div>) : <p className="muted">Your spending breakdown will grow as you add paid payments.</p>}</div></div>
      </section>
    </div>
    <section className="panel upcoming-panel"><div className="panel-heading"><div><h2>On the horizon <span className="count">{upcoming.length}</span></h2><p>{money(summary.upcoming, currency)} in pending payments due this month.</p></div><button className="text-button" onClick={() => onView('payments')}>All payments<ChevronRight size={16} /></button></div>
      {upcoming.length ? <div className="upcoming-list">{upcoming.slice(0, 4).map(payment => <button className="upcoming-row" key={payment.id} onClick={() => onEdit({ kind: 'payment', record: payment })}><span className="record-icon"><CalendarDays size={19} /></span><span className="row-name"><strong>{payment.recipient}</strong><span>{payment.category}</span></span><span className={`due-date ${payment.due_date < today() ? 'overdue' : ''}`}>{payment.due_date < today() ? 'Overdue · ' : 'Due '}{dateLabel(payment.due_date)}</span><strong>{money(payment.amount_cents, currency)}</strong><ChevronRight size={16} /></button>)}</div> : <div className="empty-inline"><span className="empty-icon"><CalendarDays size={24} /></span><div><strong>A little breathing room.</strong><p>No pending payments for this month. Add a payment to keep the next one in sight.</p></div><button className="button secondary" onClick={() => onEdit({ kind: 'payment' })}>Add payment</button></div>}
    </section>
    <div className="gentle-note"><Sprout size={17} /><span>A little attention today. A little more freedom tomorrow.</span><span className="currency-note">All amounts in {currency}</span></div>
  </>;
}
