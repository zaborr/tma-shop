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
 */
export async function init(debug: boolean): Promise<void> {
  setDebug(debug);

  initSDK();

  if (backButton.isSupported()) {
    backButton.mount();
  }

  if (miniApp.mount.isAvailable()) {
    await miniApp.mount();

    if (miniApp.bindCssVars.isAvailable()) {
      miniApp.bindCssVars();
    }
  }

  if (themeParams.bindCssVars.isAvailable()) {
    themeParams.bindCssVars();
  }

  if (viewport.mount.isAvailable()) {
    await viewport.mount();

    if (viewport.bindCssVars.isAvailable()) {
      viewport.bindCssVars();
    }
  }

  initData.restore();
}
