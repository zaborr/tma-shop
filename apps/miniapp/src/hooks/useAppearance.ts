import { useEffect, useState } from 'react';
import { isColorDark, themeParams, useSignal } from '@telegram-apps/sdk-react';

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
  );
}

/**
 * Light or dark: Telegram's theme when it gave us one, otherwise the
 * device/browser setting (and it follows changes to either).
 */
export function useAppearance(): 'light' | 'dark' {
  const background = useSignal(themeParams.backgroundColor);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (): void => setSystemDark(query.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  if (background) return isColorDark(background) ? 'dark' : 'light';
  return systemDark ? 'dark' : 'light';
}
