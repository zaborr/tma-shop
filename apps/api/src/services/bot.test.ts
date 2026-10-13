import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import { TelegramApi } from '../telegram/api.js';
import { buildStartReply, handleBotMessage, webhookUrl } from './bot.js';

const env = {
  BOT_TOKEN: '1:abc',
  TELEGRAM_WEBHOOK_SECRET: 'secret',
  MINIAPP_URL: 'https://shop.example.app',
  RENDER_EXTERNAL_URL: 'https://api.example.com/',
} as unknown as Env;

describe('bot', () => {
  it('builds the webhook URL from Render or PUBLIC_URL', () => {
    expect(webhookUrl(env)).toBe('https://api.example.com/webhook/telegram');
    expect(webhookUrl({ ...env, TELEGRAM_WEBHOOK_SECRET: undefined } as unknown as Env)).toBeNull();
  });

  it('answers /start with a button that opens the Mini App', () => {
    const reply = buildStartReply('https://shop.example.app', 'Ana');
    expect(reply.text).toContain('Hi Ana!');
    expect(reply.keyboard?.inline_keyboard[0]?.[0]?.web_app?.url).toBe('https://shop.example.app');
  });

  it('only replies in private chats', async () => {
    const telegram = new TelegramApi('1:abc');
    const send = vi.spyOn(telegram, 'sendMessage').mockResolvedValue(true);
    await handleBotMessage(
      env,
      { update_id: 1, message: { text: '/start', chat: { id: 5, type: 'group' } } },
      telegram,
    );
    expect(send).not.toHaveBeenCalled();
    await handleBotMessage(
      env,
      { update_id: 2, message: { text: '/start', chat: { id: 5, type: 'private' } } },
      telegram,
    );
    expect(send).toHaveBeenCalledWith(5, expect.stringContaining('Tap the button'), expect.anything());
  });
});
