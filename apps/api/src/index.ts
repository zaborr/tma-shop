import { serve } from '@hono/node-server';
import { loadEnv } from './config/env.js';
import { createDb, createPool } from './db/client.js';
import { createApp } from './app.js';
import { importLegacyWallets } from './services/shop.js';
import { configureBot } from './services/bot.js';
import { scheduleRetention } from './services/retention.js';

const env = loadEnv();
const pool = createPool(env.DATABASE_URL);
const db = createDb(pool);
const app = createApp({ env, db });

// One-time move of the old PAYMENT_METHODS env wallets into the first shop.
importLegacyWallets(db, env).catch((error: unknown) => {
  console.error('Could not import PAYMENT_METHODS wallets:', error);
});

// Webhook (so the bot answers /start) and the chat's menu button.
void configureBot(env);

// Deletes personal data past its retention period, now and every 6 hours.
scheduleRetention(db);

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
