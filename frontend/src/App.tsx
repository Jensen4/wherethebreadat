import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, ChevronRight, CircleHelp, FileText, LayoutDashboard, LoaderCircle, LogOut, Plus, ReceiptText, RefreshCw, Settings as SettingsIcon, Sprout, X } from 'lucide-react';
import { api, ApiError } from './lib/api';
import { today } from './lib/money';
import type { Editor, Payment, Paystub, Session, View } from './types';
import { Auth } from './components/Auth';
import { Brand } from './components/Brand';
import { Overview } from './components/Overview';
import { Records } from './components/Records';
import { Settings } from './components/Settings';
import { applyTheme, readCurrencyPreference, readThemePreference, saveCurrencyPreference, saveThemePreference } from './lib/preferences';
import { RecordEditor } from './components/RecordEditor';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [view, setView] = useState<View>('overview');
  const [month, setMonth] = useState(today().slice(0, 7));
  const [preferredCurrency, setPreferredCurrency] = useState(readCurrencyPreference);
  const [theme, setTheme] = useState(readThemePreference);
  const [paystubs, setPaystubs] = useState<Paystub[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [version, setVersion] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleting, setDeleting] = useState<Editor | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [help, setHelp] = useState(false);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const generation = useRef(0);

  useEffect(() => {
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    const updateTheme = () => applyTheme(theme, system.matches);
    updateTheme();
    system.addEventListener('change', updateTheme);
    return () => system.removeEventListener('change', updateTheme);
  }, [theme]);

  const clearSession = useCallback((message = '') => {
    generation.current += 1;
    setSession(null); setPaystubs([]); setPayments([]);
    setEditor(null); setDeleting(null); setToast(''); setActionError(''); setNotice(message);
    setHelp(false); setView('overview');
  }, []);
  const handleError = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) clearSession('Your session has ended. Sign in to pick up where you left off.');
  }, [clearSession]);

  useEffect(() => {
    const controller = new AbortController();
    api.session(controller.signal)
      .then(value => { if (!controller.signal.aborted) setSession(value); })
      .catch(err => {
        if (!controller.signal.aborted && !(err instanceof ApiError && err.status === 401)) {
          setNotice(err instanceof Error ? err.message : 'Could not check your session.');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setCheckingSession(false); });
    return () => controller.abort();
  }, []);

  async function signOut() {
    if (!session || signingOut) return;
    setSigningOut(true); setActionError('');
    try { await api.logout(session.csrf_token); clearSession(); }
    catch (err) {
      if (err instanceof ApiError && err.status === 401) clearSession();
      else setActionError(err instanceof Error ? err.message : 'Could not sign out. Please try again.');
    } finally { setSigningOut(false); }
  }

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    setLoading(true); setLoadError('');
    Promise.all([api.paystubs(controller.signal), api.payments(controller.signal)])
      .then(([stubs, bills]) => { if (!controller.signal.aborted) { setPaystubs(stubs); setPayments(bills); } })
      .catch(err => { if (!controller.signal.aborted) { handleError(err); setLoadError(err instanceof Error ? err.message : 'Could not load records.'); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [session, version, handleError]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (deleting) deleteDialog.current?.showModal(); else deleteDialog.current?.close(); }, [deleting]);
  useEffect(() => { if (help) helpDialog.current?.showModal(); else helpDialog.current?.close(); }, [help]);

  function onLogin(value: Session) { setSession(value); setNotice(''); setLoading(true); }
  function refresh(message?: string) { setVersion(v => v + 1); if (message) setToast(message); }
  async function deleteRecord() {
    if (!session || !deleting?.record) return;
    const currentGeneration = generation.current;
    setBusyId(deleting.record.id); setActionError('');
    try {
      await api.remove(session.csrf_token, deleting.kind, deleting.record.id);
      if (generation.current === currentGeneration) { setDeleting(null); refresh('Record deleted.'); }
    } catch (err) { handleError(err); setActionError(err instanceof Error ? err.message : 'Could not delete record.'); }
    finally { setBusyId(null); }
  }
  async function markPaid(record: Payment) {
    if (!session) return;
    const currentGeneration = generation.current;
    setBusyId(record.id); setActionError('');
    try {
      await api.savePayment(session.csrf_token, { ...record, status: 'paid', paid_date: today() }, record.id);
      if (generation.current === currentGeneration) refresh('Payment marked as paid today.');
    } catch (err) { handleError(err); setActionError(err instanceof Error ? err.message : 'Could not update payment.'); }
    finally { setBusyId(null); }
  }

  if (checkingSession) return <main className="loading-state" style={{ minHeight: '100dvh' }} role="status"><LoaderCircle className="spin" size={28} /><p>Opening your space…</p></main>;
  if (!session) return <Auth onLogin={onLogin} notice={notice} />;
  const titles = { overview: 'A little clarity. A lot of possibility.', paystubs: 'Make every payday count.', payments: 'A place for every payment.', settings: 'Make yourself at home.' };
  const subtitles = { overview: 'Here’s where your bread is at. Let’s make it go a little further.', paystubs: 'Your hard work, all in one place. Keep track of what comes in.', payments: 'Keep the essentials covered and the little things in sight.', settings: 'A few preferences for your personal space.' };
  const nav = [{ id: 'overview' as const, label: 'Overview', Icon: LayoutDashboard }, { id: 'paystubs' as const, label: 'Paystubs', Icon: FileText }, { id: 'payments' as const, label: 'Payments', Icon: ReceiptText }, { id: 'settings' as const, label: 'Settings', Icon: SettingsIcon }];
  const allCurrencies = [...new Set([...paystubs, ...payments].map(p => p.currency))];

  return <div className="app-shell">
    <aside className="sidebar"><Brand /><span className="nav-caption">YOUR SPACE</span><nav aria-label="Main navigation">{nav.map(({ id, label, Icon }) => <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}><Icon size={19} strokeWidth={1.7} /><span>{label}</span>{view === id && <span className="nav-active-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-note"><Sprout size={25} strokeWidth={1.5} /><strong>Small habits.<br />Good things ahead.</strong><p>Knowing your money is a pretty good place to start.</p></div><button className="nav-item" onClick={() => setHelp(true)}><CircleHelp size={18} />A little help</button><div className="account"><span className="avatar">{session.email.slice(0, 1).toUpperCase()}</span><div><strong>Your personal space</strong><span title={session.email}>{session.email}</span></div><button className="icon-button" aria-label="Sign out" title="Sign out" disabled={signingOut} onClick={signOut}><LogOut size={17} /></button></div></div>
    </aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumbs">Your space<ChevronRight size={14} /><strong>{nav.find(n => n.id === view)?.label}</strong></div><span className="topbar-note"><span className="tiny-dot" /> A little more peace of mind.</span><button className="mobile-signout icon-button" aria-label="Sign out" disabled={signingOut} onClick={signOut}><LogOut size={18} /></button></header>
      <main className="main-content"><div className="page-heading"><div><span className="eyebrow">{view === 'settings' ? 'YOUR SPACE, YOUR WAY' : view === 'overview' ? 'THE EVERYDAY, A LITTLE EASIER' : 'YOUR MONEY, MADE CLEAR'}</span><h1>{titles[view]}</h1><p>{subtitles[view]}</p></div>{view !== 'settings' && <div className="heading-actions"><button className="button secondary" onClick={() => setEditor({ kind: 'paystub' })}><Plus size={17} />Add paystub</button><button className="button primary" onClick={() => setEditor({ kind: 'payment' })}><Plus size={17} />Add payment</button></div>}</div>
        {view !== 'settings' && <div className="period-bar"><div className="period-label"><span className="period-dot" /><h2>{view === 'overview' ? 'Your monthly snapshot' : view === 'paystubs' ? 'Your paystubs' : 'Your payments'}</h2></div><div className="period-controls"><label className="sr-only" htmlFor="month">Month</label><input autoComplete="off" id="month" type="month" value={month} min="1900-01" max="9999-12" required onChange={e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) setMonth(e.target.value); }} /><button className="icon-button" aria-label="Refresh records" disabled={loading} onClick={() => refresh()}><RefreshCw size={16} className={loading ? 'spin' : ''} /></button></div></div>}
        {actionError && !deleting && <div className="error dismissible" role="alert">{actionError}<button className="icon-button" aria-label="Dismiss error" onClick={() => setActionError('')}><X size={17} /></button></div>}
        {view === 'settings' ? <Settings theme={theme} onThemeChange={value => { saveThemePreference(value); applyTheme(value); setTheme(value); setToast('Theme preference saved.'); }} email={session.email} currency={preferredCurrency} currencies={allCurrencies} onCurrencyChange={value => { saveCurrencyPreference(value); setPreferredCurrency(value); setToast('Currency preference saved.'); }} onSignOut={signOut} signingOut={signingOut} /> : loading ? <div className="loading-state" role="status"><LoaderCircle className="spin" size={28} /><p>Finding your bread…</p></div> : loadError ? <div className="panel empty-state"><h2>Let’s try that again.</h2><p role="alert">{loadError}</p><button className="button primary" onClick={() => refresh()}><RefreshCw size={17} />Try again</button></div> : view === 'overview' ? <Overview paystubs={paystubs} payments={payments} month={month} currency={preferredCurrency} onEdit={setEditor} onView={setView} /> : <Records key={view} kind={view === 'paystubs' ? 'paystub' : 'payment'} paystubs={paystubs} payments={payments} month={month} currency={preferredCurrency} onEdit={setEditor} onDelete={value => { setDeleting(value); setActionError(''); }} onPaid={markPaid} busyId={busyId} />}
        <footer className="page-footer"><span>where the bread at.</span><span>Made for the everyday.</span></footer>
      </main>
    </div>
    {editor && <RecordEditor defaultCurrency={preferredCurrency} editor={editor} csrfToken={session.csrf_token} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); refresh('Saved. One less thing on your mind.'); }} onError={handleError} />}
    <dialog className="editor-dialog small-dialog" ref={deleteDialog} onCancel={e => { if (busyId) e.preventDefault(); else setDeleting(null); }} aria-labelledby="delete-title"><div className="dialog-content"><h2 id="delete-title">Delete this {deleting?.kind}?</h2><p className="muted">This removes the record permanently. You can add it again later if you need to.</p>{actionError && <p className="error" role="alert">{actionError}</p>}<div className="dialog-actions"><button className="button secondary" disabled={!!busyId} onClick={() => setDeleting(null)}>Keep record</button><button className="button danger-button" disabled={!!busyId} onClick={deleteRecord}>{busyId ? 'Deleting…' : 'Delete record'}</button></div></div></dialog>
    <dialog className="editor-dialog small-dialog" ref={helpDialog} onCancel={() => setHelp(false)} aria-labelledby="help-title"><div className="dialog-content"><div className="dialog-heading"><h2 id="help-title">A little help.</h2><button className="icon-button" aria-label="Close help" onClick={() => setHelp(false)}><X size={20} /></button></div><div className="help-item"><ArrowDownLeft size={22} /><div><h3>Start with your pay.</h3><p>Add your gross pay and deductions. Your take-home amount is calculated for you.</p></div></div><div className="help-item"><ArrowUpRight size={22} /><div><h3>Give payments a place.</h3><p>Track pending bills and mark them paid when money leaves your account.</p></div></div><div className="help-item"><Sprout size={22} /><div><h3>See what’s left.</h3><p>Remaining income is take-home pay minus paid expenses for the selected month and currency. It is not your bank balance. Pending bills are shown separately.</p></div></div><p className="muted">Paystubs are entered manually for now. Signing out revokes your session on the server. Sessions otherwise expire after one hour.</p></div></dialog>
    {toast && <div className="toast" role="status"><Check size={17} />{toast}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} /></button></div>}
  </div>;
}
