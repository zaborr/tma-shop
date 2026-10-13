import { langFrom, type Lang } from '@tma-shop/shared';
import type { Env } from '../config/env.js';
import type { Database } from '../db/client.js';
import { languagesOf } from './notifications.js';
import { tr } from '../i18n/messages.js';
import { TelegramApi, type InlineKeyboard } from '../telegram/api.js';
import type { TelegramUpdate } from '../telegram/types.js';

const MENU_CACHE_MS = 60 * 60 * 1000;

/** Where Telegram should send updates, or null when the webhook cannot be set up. */
export function webhookUrl(env: Env): string | null {
  const base = env.PUBLIC_URL ?? env.RENDER_EXTERNAL_URL;
  if (!base || !env.TELEGRAM_WEBHOOK_SECRET) return null;
  return `${base.replace(/\/+$/, '')}/webhook/telegram`;
}

let menuCache: { url: string | null; at: number } | null = null;

/**
 * The Mini App URL, read from the bot's menu button (set up in @BotFather), so
 * there is nothing else to configure. Cached for an hour.
 */
export async function miniAppUrl(telegram: TelegramApi, now = Date.now()): Promise<string | null> {
  if (menuCache && now - menuCache.at < MENU_CACHE_MS) return menuCache.url;
  let url: string | null = null;
  try {
    const button = await telegram.getChatMenuButton();
    url = button.type === 'web_app' ? (button.web_app?.url ?? null) : null;
  } catch (error) {
    console.error('Could not read the bot menu button:', error);
  }
  menuCache = { url, at: now };
  return url;
}

/** Test hook: forget the cached menu button. */
export function resetMiniAppUrlCache(): void {
  menuCache = null;
}

/** The bot's answer to /start (and to any other message in a private chat). */
export function buildStartReply(
  url: string | null,
  firstName: string | undefined,
  lang: Lang = 'en',
): { text: string; keyboard?: InlineKeyboard } {
  const hello = firstName ? tr(lang, 'start.hello', { name: firstName }) : tr(lang, 'start.helloAnon');
  const updates = tr(lang, 'start.updates');
  if (!url) {
    return { text: [`${hello} ${tr(lang, 'start.useMenu')}`, '', updates].join('\n') };
  }
  return {
    text: [`${hello} ${tr(lang, 'start.tapButton')}`, '', updates].join('\n'),
    keyboard: { inline_keyboard: [[{ text: tr(lang, 'start.button'), web_app: { url } }]] },
  };
}

/**
 * Answers people who write to the bot in a private chat: /start (or anything
 * else) gets a greeting with a button that opens the Mini App. Pressing Start
 * is also what lets the bot message the user later on.
 */
export async function handleBotMessage(
  env: Env,
  update: TelegramUpdate,
  telegram = new TelegramApi(env.BOT_TOKEN),
  db?: Database,
): Promise<void> {
  const message = update.message;
  if (!message?.text || message.chat?.type !== 'private') return;
  // The language chosen in the app wins over Telegram's.
  const fromId = message.from?.id;
  const known = db && fromId !== undefined ? (await languagesOf(db, [fromId])).get(fromId) : undefined;
  const reply = buildStartReply(
    await miniAppUrl(telegram),
    message.from?.first_name,
    known ?? langFrom(message.from?.language_code),
  );
  await telegram.sendMessage(message.chat.id, reply.text, reply.keyboard);
}

/** Best-effort bot setup at startup: registers the webhook so /start is answered. */
export async function configureBot(env: Env, telegram = new TelegramApi(env.BOT_TOKEN)): Promise<void> {
  const url = webhookUrl(env);
  if (!url || !env.TELEGRAM_WEBHOOK_SECRET) {
    console.warn(
      'Telegram webhook not set: the bot will not answer /start. ' +
        'Set TELEGRAM_WEBHOOK_SECRET (and PUBLIC_URL outside Render).',
    );
    return;
  }
  try {
    await telegram.setWebhook(url, env.TELEGRAM_WEBHOOK_SECRET, ['message', 'pre_checkout_query']);
    console.log(`Telegram webhook set to ${url}`);
  } catch (error) {
    console.error('Could not set the Telegram webhook:', error);
  }
}
