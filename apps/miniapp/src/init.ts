import {
  backButton,
  initData,
  init as initSDK,
  miniApp,
  setDebug,
  themeParams,
  viewport,
} from '@telegram-apps/sdk-react';

/**
 * Initializes the Telegram SDK (v3) and mounts the components the app relies on.
 * Each mount is guarded with `isSupported`/`isAvailable` so the call is a no-op
 * in environments where a feature is missing instead of throwing.
 */
export function init(debug: boolean): void {
  setDebug(debug);
  initSDK();

  // Restore initData state from the launch parameters.
  initData.restore();

  if (backButton.isSupported()) {
    backButton.mount();
  }
  
  if (!miniApp.isMounted()) {
    miniApp.mount();
  }

  if (miniApp.bindCssVars.isAvailable()) {
    miniApp.bindCssVars();
  }

  if (!themeParams.isMounted()) {
    themeParams.mount();
  }

  if (themeParams.bindCssVars.isAvailable()) {
    themeParams.bindCssVars();
  }

  if (viewport.mount.isAvailable()) {
    void viewport.mount().then(() => {
      viewport.bindCssVars();
    });
  }
}
