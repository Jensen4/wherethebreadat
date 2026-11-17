import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, readThemePreference, saveThemePreference } from './preferences';

afterEach(() => vi.unstubAllGlobals());

describe('theme preference', () => {
  it('follows the system when no valid preference is saved', () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    expect(readThemePreference()).toBe('system');
    vi.stubGlobal('localStorage', { getItem: () => 'unknown' });
    expect(readThemePreference()).toBe('system');
  });

  it('restores a saved preference', () => {
    let stored: string | null = null;
    vi.stubGlobal('localStorage', {
      getItem: () => stored,
      setItem: (_key: string, value: string) => { stored = value; },
    });
    saveThemePreference('dark');
    expect(readThemePreference()).toBe('dark');
    saveThemePreference('light');
    expect(readThemePreference()).toBe('light');
    saveThemePreference('system');
    expect(readThemePreference()).toBe('system');
  });

  it('defaults safely and reports save failures when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Blocked'); },
      setItem: () => { throw new Error('Blocked'); },
    });
    expect(readThemePreference()).toBe('system');
    expect(() => saveThemePreference('dark')).toThrow('Could not save your theme');
  });

  it('tracks system appearance while respecting explicit choices', () => {
    const dataset: Record<string, string> = {};
    vi.stubGlobal('document', { documentElement: { dataset } });
    applyTheme('system', true);
    expect(dataset.theme).toBe('dark');
    applyTheme('system', false);
    expect(dataset.theme).toBe('light');
    applyTheme('light', true);
    expect(dataset.theme).toBe('light');
    applyTheme('dark', false);
    expect(dataset.theme).toBe('dark');
  });
});
