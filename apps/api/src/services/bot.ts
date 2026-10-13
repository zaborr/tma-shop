import type { Env } from '../config/env.js';
import { TelegramApi, type InlineKeyboard } from '../telegram/api.js';
import type { TelegramUpdate } from '../telegram/types.js';

const BUTTON_TEXT = 'Open shop';

/** Where Telegram should send updates, or null when the webhook cannot be set up. */
export function webhookUrl(env: Env): string | null {
  const base = env.PUBLIC_URL ?? env.RENDER_EXTERNAL_URL;
  if (!base || !env.TELEGRAM_WEBHOOK_SECRET) return null;
  return `${base.replace(/\/+$/, '')}/webhook/telegram`;
}

/** The bot's answer to /start (and to any other message in a private chat). */
export function buildStartReply(
  miniAppUrl: string | undefined,
  firstName: string | undefined,
): { text: string; keyboard?: InlineKeyboard } {
  const hello = firstName ? `Hi ${firstName}!` : 'Hi!';
  if (!miniAppUrl) {
    return { text: `${hello} Open the shop with the menu button next to the message box.` };
  }
  return {
    text: [
      `${hello} Tap the button below to open the shop.`,
      '',
      'From now on I will message you here when your orders change: payment confirmed, shipped, delivered…',
    ].join('\n'),
    keyboard: { inline_keyboard: [[{ text: BUTTON_TEXT, web_app: { url: miniAppUrl } }]] },
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
  const reply = buildStartReply(env.MINIAPP_URL, message.from?.first_name);
  await telegram.sendMessage(message.chat.id, reply.text, reply.keyboard);
}

/**
 * Best-effort bot setup at startup: registers the webhook (so /start is
 * answered) and sets the chat menu button to open the Mini App.
 */
export async function configureBot(env: Env, telegram = new TelegramApi(env.BOT_TOKEN)): Promise<void> {
  const url = webhookUrl(env);
  if (url && env.TELEGRAM_WEBHOOK_SECRET) {
    try {
      await telegram.setWebhook(url, env.TELEGRAM_WEBHOOK_SECRET, ['message', 'pre_checkout_query']);
      console.log(`Telegram webhook set to ${url}`);
    } catch (error) {
      console.error('Could not set the Telegram webhook:', error);
    }
  } else {
    console.warn(
      'Telegram webhook not set: the bot will not answer /start. ' +
        'Set TELEGRAM_WEBHOOK_SECRET (and PUBLIC_URL outside Render).',
    );
  }

  if (env.MINIAPP_URL) {
    try {
      await telegram.setChatMenuButton(BUTTON_TEXT, env.MINIAPP_URL);
    } catch (error) {
      console.error('Could not set the chat menu button:', error);
    }
  }
}
