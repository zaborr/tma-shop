import type { Env } from '../config/env.js';
import { TelegramApi, type InlineKeyboard } from '../telegram/api.js';
import type { TelegramUpdate } from '../telegram/types.js';

const BUTTON_TEXT = 'Open shop';
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
): { text: string; keyboard?: InlineKeyboard } {
  const hello = firstName ? `Hi ${firstName}!` : 'Hi!';
  const updates =
    'From now on I will message you here when your orders change: payment confirmed, shipped, delivered…';
  if (!url) {
    return {
      text: [`${hello} Open the shop with the menu button next to the message box.`, '', updates].join(
        '\n',
      ),
    };
  }
  return {
    text: [`${hello} Tap the button below to open the shop.`, '', updates].join('\n'),
    keyboard: { inline_keyboard: [[{ text: BUTTON_TEXT, web_app: { url } }]] },
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
): Promise<void> {
  const message = update.message;
  if (!message?.text || message.chat?.type !== 'private') return;
  const reply = buildStartReply(await miniAppUrl(telegram), message.from?.first_name);
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
