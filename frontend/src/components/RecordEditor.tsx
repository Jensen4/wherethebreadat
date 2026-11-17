import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { api } from '../lib/api';
import { money, today, toCents } from '../lib/money';
import type { Editor } from '../types';

export function RecordEditor({ defaultCurrency = 'CAD', editor, csrfToken, onClose, onSaved, onError }: {
  defaultCurrency?: string; editor: Editor; csrfToken: string; onClose: () => void; onSaved: () => void; onError: (error: unknown) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const paystub = editor.kind === 'paystub' ? editor.record : undefined;
  const payment = editor.kind === 'payment' ? editor.record : undefined;
  const [gross, setGross] = useState(paystub ? (paystub.gross_cents / 100).toFixed(2) : '');
  const [deductions, setDeductions] = useState(paystub ? (paystub.deductions_cents / 100).toFixed(2) : '0.00');
  const [currency, setCurrency] = useState(editor.record?.currency ?? defaultCurrency);
  const [status, setStatus] = useState(payment?.status ?? 'pending');
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  let net: number | null = null;
  try { net = toCents(gross) - toCents(deductions); } catch { /* Incomplete input. */ }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? '').trim();
    setBusy(true); setError('');
    try {
      if (editor.kind === 'paystub') {
        const grossCents = toCents(gross);
        const deductionCents = toCents(deductions);
        if (deductionCents > grossCents) throw new Error('Deductions cannot exceed gross pay.');
        await api.savePaystub(csrfToken, {
          employer: field('employer'), pay_date: field('pay_date'), currency,
          gross_cents: grossCents, deductions_cents: deductionCents, net_cents: grossCents - deductionCents,
        }, editor.record?.id);
      } else {
        const amount = toCents(field('amount'));
        if (amount === 0) throw new Error('Payment amount must be greater than zero.');
        await api.savePayment(csrfToken, {
          recipient: field('recipient'), category: field('category'), amount_cents: amount,
          due_date: field('due_date'), status, currency,
          paid_date: status === 'paid' ? field('paid_date') : null, notes: field('notes') || null,
        }, editor.record?.id);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
      onError(err);
    } finally { setBusy(false); }
  }

  return <dialog className="editor-dialog" ref={ref} onCancel={event => { if (busy) event.preventDefault(); else onClose(); }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }} aria-labelledby="editor-title">
    <div className="dialog-content">
      <div className="dialog-heading"><div><span className="eyebrow">KEEP IT ALL IN ONE PLACE</span><h2 id="editor-title">{editor.record ? 'Edit' : 'Add'} {editor.kind === 'paystub' ? 'paystub' : 'payment'}</h2></div><button className="icon-button" aria-label="Close form" disabled={busy} onClick={onClose}><X size={21} /></button></div>
      <p className="muted">{editor.kind === 'paystub' ? 'A few details from your paystub. We’ll do the math.' : 'From the everyday essentials to the little extras.'}</p>
      <form autoComplete="off" onSubmit={submit}><fieldset disabled={busy}>
        {editor.kind === 'paystub' ? <>
          <label>Employer<input autoComplete="off" name="employer" defaultValue={paystub?.employer} placeholder="e.g. Acme Studio" required maxLength={200} /></label>
          <div className="form-grid"><label>Pay date<input autoComplete="off" type="date" name="pay_date" defaultValue={paystub?.pay_date ?? today()} required /></label><label>Currency<CurrencySelect value={currency} onChange={setCurrency} /></label></div>
          <div className="form-grid"><label>Gross pay<input autoComplete="off" inputMode="decimal" value={gross} onChange={e => setGross(e.target.value)} placeholder="0.00" required /></label><label>Total deductions<input autoComplete="off" inputMode="decimal" value={deductions} onChange={e => setDeductions(e.target.value)} placeholder="0.00" required /></label></div>
          <div className="net-preview"><span>Your take-home pay</span><strong>{net !== null && net >= 0 ? money(net, currency) : '—'}</strong></div>
        </> : <>
          <label>Who’s it for?<input autoComplete="off" name="recipient" defaultValue={payment?.recipient} placeholder="e.g. Landlord or grocery store" required maxLength={200} /></label>
          <div className="form-grid"><label>Amount<input autoComplete="off" name="amount" inputMode="decimal" defaultValue={payment ? (payment.amount_cents / 100).toFixed(2) : ''} placeholder="0.00" required /></label><label>Currency<CurrencySelect value={currency} onChange={setCurrency} /></label></div>
          <div className="form-grid"><label>Category<select autoComplete="off" name="category" defaultValue={payment?.category ?? 'other'}>{[...new Set(['housing', 'groceries', 'transport', 'utilities', 'dining', 'health', 'shopping', 'subscriptions', 'other', ...(payment ? [payment.category] : [])])].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}</select></label><label>Due date<input autoComplete="off" name="due_date" type="date" defaultValue={payment?.due_date ?? today()} required /></label></div>
          <div className="form-grid"><label>Status<select autoComplete="off" value={status} onChange={e => setStatus(e.target.value as 'paid' | 'pending')}><option value="pending">Pending</option><option value="paid">Paid</option></select></label>{status === 'paid' && <label>Paid on<input autoComplete="off" name="paid_date" type="date" defaultValue={payment?.paid_date ?? today()} required /></label>}</div>
          <label>Notes <span className="muted optional">(optional)</span><textarea autoComplete="off" name="notes" defaultValue={payment?.notes ?? ''} placeholder="Anything you’d like to remember" maxLength={2000} rows={2} /></label>
        </>}
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save ' + editor.kind}<ArrowRight size={16} /></button></div>
      </form>
    </div>
  </dialog>;
}

export function CurrencySelect({ value, onChange, extra = [] }: { value: string; onChange: (value: string) => void; extra?: string[] }) {
  return <select autoComplete="off" aria-label="Currency" value={value} onChange={e => onChange(e.target.value)}>{[...new Set(['CAD', 'USD', 'EUR', 'GBP', value, ...extra])].map(c => <option key={c} value={c}>{c}</option>)}</select>;
}
