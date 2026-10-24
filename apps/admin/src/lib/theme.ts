'use client';

import { useCallback, useEffect, useState } from 'react';
import { THEME_STORAGE_KEY } from './themeKey';

export type ThemePreference = 'light' | 'dark' | 'system';

function systemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(pref: ThemePreference) {
  document.documentElement.classList.toggle('dark', pref === 'dark' || (pref === 'system' && systemDark()));
}

function read(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

/** Light / dark / follow-the-system preference, remembered per browser. */
export function useThemePreference(): [ThemePreference, (p: ThemePreference) => void] {
  const [pref, setPref] = useState<ThemePreference>('system');

  useEffect(() => {
    setPref(read());
  }, []);

  useEffect(() => {
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  const update = useCallback((next: ThemePreference) => {
    setPref(next);
    apply(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the choice still applies for this visit.
    }
  }, []);

  return [pref, update];
}
