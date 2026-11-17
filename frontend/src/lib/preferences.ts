const currencyKey = 'bread-preferred-currency';
const themeKey = 'bread-theme';
export type Theme = 'light' | 'dark' | 'system';

export function readThemePreference(): Theme {
  try {
    const value = localStorage.getItem(themeKey);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch { /* Follow the system when storage is unavailable. */ }
  return 'system';
}

export function saveThemePreference(theme: Theme) {
  try { localStorage.setItem(themeKey, theme); }
  catch { throw new Error('Could not save your theme. Allow browser storage and try again.'); }
}

export function applyTheme(theme: Theme, systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.dataset.theme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
}

export function readCurrencyPreference(): string {
  try {
    const value = localStorage.getItem(currencyKey);
    if (value && /^[A-Z]{3}$/.test(value)) {
      new Intl.NumberFormat('en-CA', { style: 'currency', currency: value });
      return value;
    }
  } catch { /* Use the default when browser storage is unavailable. */ }
  return 'CAD';
}

export function saveCurrencyPreference(currency: string) {
  try { localStorage.setItem(currencyKey, currency); }
  catch { throw new Error('Could not save your preference. Allow browser storage and try again.'); }
}
