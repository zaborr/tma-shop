import { AppRoot, Placeholder } from '@telegram-apps/telegram-ui';
import { t } from '../i18n/index.js';

/** Shown when the app is opened outside a supported Telegram environment. */
export function EnvUnsupported(): React.JSX.Element {
  return (
    <AppRoot>
      <Placeholder
        header={t('env.title')}
        description={t('env.description')}
      >
        <span style={{ fontSize: 56 }}>📱</span>
      </Placeholder>
    </AppRoot>
  );
}
