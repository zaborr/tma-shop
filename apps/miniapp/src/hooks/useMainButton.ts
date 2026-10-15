import { useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { mainButton } from '@telegram-apps/sdk-react';

export interface MainButtonOptions {
  text: string;
  visible: boolean;
  enabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}

function hideMainButton(): void {
  try {
    if (mainButton.isMounted()) mainButton.setParams({ isVisible: false, isLoaderVisible: false });
  } catch {
    // Not inside Telegram (or too old a client): nothing to hide.
  }
}

/**
 * Declaratively drives the Telegram MainButton from a component. The button is
 * hidden automatically when the owning component unmounts.
 */
export function useMainButton({
  text,
  visible,
  enabled = true,
  loading = false,
  onClick,
}: MainButtonOptions): void {
  // Re-applied after every screen change, so a hide from the screen we left
  // can never win over the screen we are on.
  const { pathname } = useLocation();

  useEffect(() => {
    if (!mainButton.mount.isAvailable()) return;
    if (!mainButton.isMounted()) mainButton.mount();

    mainButton.setParams({
      text,
      isVisible: visible,
      isEnabled: enabled && !loading,
      isLoaderVisible: loading && visible,
    });

    const off = mainButton.onClick(onClick);
    return () => {
      off();
      hideMainButton();
    };
  }, [text, visible, enabled, loading, onClick, pathname]);
}

/**
 * Hides the MainButton whenever the screen changes. It runs before the new
 * screen's own `useMainButton` (layout effects run first), so only a screen
 * that wants the button shows it — going back never leaves a stale
 * "Add to cart" or "Place order" behind, even after a reload of the page.
 */
export function useMainButtonReset(): void {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    hideMainButton();
  }, [pathname]);
}
