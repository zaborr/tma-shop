import { serve } from '@hono/node-server';
import { loadEnv } from './config/env.js';
import { createDb, createPool } from './db/client.js';
import { createApp } from './app.js';
import { convertLegacyWallets } from './services/shop.js';
import { configureBot } from './services/bot.js';
import { scheduleRetention } from './services/retention.js';
import { scheduleAutoCancel } from './services/autoCancel.js';
import { resumePaymentChecks } from './services/paymentCheck.js';

const env = loadEnv();
const pool = createPool(env.DATABASE_URL);
const db = createDb(pool);
const app = createApp({ env, db });

// One-time conversion of old free-text wallets into the network catalog.
convertLegacyWallets(db).catch((error: unknown) => {
  console.error('Could not convert the old wallets:', error);
});

// Webhook (so the bot answers /start) and the chat's menu button.
void configureBot(env);

// Deletes personal data past its retention period, now and every 6 hours.
scheduleRetention(db);

// Cancels unpaid orders past each shop's deadline, now and every hour.
scheduleAutoCancel(db, env);

// Payment checks that were running before a restart.
resumePaymentChecks(db, env).catch((error: unknown) => {
  console.error('Could not resume payment checks:', error);
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`tma-shop API listening on http://localhost:${info.port}`);
});

function shutdown(signal: string): void {
  console.log(`\n${signal} received, shutting down…`);
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
