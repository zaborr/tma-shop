import '@telegram-apps/telegram-ui/dist/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { mockEnvForDev } from './mockEnv.js';
import { init } from './init.js';
import { App } from './App.js';

// Must run before init() so a browser launch has a mocked environment.
mockEnvForDev();

const container = document.getElementById('root');
if (!container) throw new Error('Root container #root not found');
const root = createRoot(container);

init(import.meta.env.DEV)
  .then(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((err) => {
    console.error('[tma-shop] Telegram SDK initialization failed:', err);

    root.render(
      <div
        style={{
          padding: '20px',
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        <h2>Telegram SDK error</h2>
        <pre>
          {err instanceof Error
            ? `${err.name}: ${err.message}\n\n${err.stack ?? ''}`
            : String(err)}
        </pre>
      </div>
    );
  });
