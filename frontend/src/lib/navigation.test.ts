import { afterEach, describe, expect, it, vi } from 'vitest';
import { navigate, pagePaths, viewFromPath } from './navigation';

afterEach(() => vi.unstubAllGlobals());

describe('page navigation', () => {
  it('recognizes every page URL, including trailing slashes', () => {
    for (const [view, path] of Object.entries(pagePaths)) {
      expect(viewFromPath(path)).toBe(view);
      expect(viewFromPath(`${path}/`)).toBe(view);
    }
  });

  it('uses overview for root and unknown URLs', () => {
    expect(viewFromPath('/')).toBe('overview');
    expect(viewFromPath('/missing')).toBe('overview');
    expect(viewFromPath('/payments/unrecognized')).toBe('overview');
  });

  it('updates history and notifies the app without reloading the document', () => {
    const events = new EventTarget();
    const location = { pathname: '/overview' };
    const pushState = vi.fn((_state: unknown, _title: string, path: string) => { location.pathname = path; });
    vi.stubGlobal('window', {
      location, history: { pushState },
      dispatchEvent: (event: Event) => events.dispatchEvent(event),
    });
    vi.stubGlobal('PopStateEvent', Event);
    const onChange = vi.fn(() => viewFromPath(location.pathname));
    events.addEventListener('popstate', onChange);

    navigate('settings');
    expect(pushState).toHaveBeenCalledWith(null, '', '/settings');
    expect(onChange).toHaveReturnedWith('settings');
    navigate('payments');
    expect(onChange).toHaveLastReturnedWith('payments');

    // Selecting the active page must not add duplicate browser history entries.
    navigate('payments');
    expect(pushState).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
