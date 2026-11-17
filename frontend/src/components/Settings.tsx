import { useState } from 'react';
import { Coins, LogOut, UserRound } from 'lucide-react';
import { CurrencySelect } from './RecordEditor';
import type { Theme } from '../lib/preferences';

export function Settings({ email, currency, currencies, onCurrencyChange, theme, onThemeChange, onSignOut, signingOut }: {
  email: string;
  currency: string;
  currencies: string[];
  onCurrencyChange: (value: string) => void;
  theme: Theme;
  onThemeChange: (value: Theme) => void;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const [error, setError] = useState('');

  function changeCurrency(value: string) {
    setError('');
    try { onCurrencyChange(value); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save your preference.'); }
  }

  return <div className="settings-grid">
    <section className="panel settings-panel" aria-labelledby="account-settings-title">
      <div className="settings-heading"><span className="empty-icon"><UserRound size={22} /></span><div><h2 id="account-settings-title">Your account</h2><p>The space you call yours.</p></div></div>
      <div className="settings-row"><div><h3>Email address</h3><p className="settings-email">{email}</p></div></div>
      <div className="settings-row"><div><h3>Sign out</h3><p>End your current session on this device.</p></div><button className="button secondary" disabled={signingOut} onClick={onSignOut}><LogOut size={16} />{signingOut ? 'Signing out…' : 'Sign out'}</button></div>
    </section>
    <section className="panel settings-panel" aria-labelledby="preferences-title">
      <div className="settings-heading"><span className="empty-icon"><Coins size={22} /></span><div><h2 id="preferences-title">Your preferences</h2><p>Little details that make it feel like home.</p></div></div>
      <div className="settings-row"><div><label className="settings-label" htmlFor="website-theme">Website theme</label><p id="theme-description">Choose your look. Follow system automatically matches your device’s appearance.</p></div><div className="settings-theme"><select id="website-theme" value={theme} aria-describedby="theme-description" onChange={event => {
        setError('');
        try { onThemeChange(event.target.value as Theme); }
        catch (err) { setError(err instanceof Error ? err.message : 'Could not save your theme.'); }
      }}><option value="light">Light</option><option value="dark">Dark</option><option value="system">Follow system</option></select></div></div>
      <div className="settings-row"><div><h3 id="preferred-currency-label">Preferred currency</h3><p id="preferred-currency-description">Use this currency for your dashboard and new records. Changes save automatically in this browser.</p></div><div className="settings-currency" role="group" aria-labelledby="preferred-currency-label" aria-describedby="preferred-currency-description"><CurrencySelect value={currency} onChange={changeCurrency} extra={currencies} /></div></div>
      <p className="settings-note">Your existing records keep their original currencies. Amounts are shown separately by currency, with no conversion.</p>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  </div>;
}
