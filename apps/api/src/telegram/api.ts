/** Minimal Telegram Bot API client covering the methods the shop needs. */

export interface LabeledPrice {
  label: string;
  amount: number;
}

export interface CreateInvoiceLinkParams {
  title: string;
  description: string;
  payload: string;
  currency: string;
  prices: LabeledPrice[];
  /** Empty string for Telegram Stars (XTR). */
  providerToken?: string;
}

/** Inline keyboard under a message; `web_app` buttons open the Mini App. */
export interface InlineKeyboard {
  inline_keyboard: Array<Array<{ text: string; web_app?: { url: string }; url?: string }>>;
}

export interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
}

export interface TelegramChatMember {
  status: string;
  /** For "restricted" members: whether they are still in the chat. */
  is_member?: boolean;
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export class TelegramApi {
  constructor(
    private readonly botToken: string,
    private readonly baseUrl = 'https://api.telegram.org',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async call<T>(method: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}/bot${this.botToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as TelegramResponse<T>;
    if (!data.ok || data.result === undefined) {
      throw new Error(`Telegram ${method} failed: ${data.description ?? res.statusText}`);
    }
    return data.result;
  }

  /** Returns an invoice link suitable for `WebApp.openInvoice`. */
  createInvoiceLink(params: CreateInvoiceLinkParams): Promise<string> {
    return this.call<string>('createInvoiceLink', {
      title: params.title,
      description: params.description,
      payload: params.payload,
      currency: params.currency,
      prices: params.prices,
      provider_token: params.providerToken ?? '',
    });
  }

  /** Sends a file to a chat. The user must have started the bot first. */
  async sendDocument(
    chatId: number,
    fileName: string,
    data: Buffer,
    contentType: string,
    caption?: string,
  ): Promise<unknown> {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    if (caption) form.append('caption', caption.slice(0, 1024));
    form.append('document', new Blob([new Uint8Array(data)], { type: contentType }), fileName);
    const res = await this.fetchImpl(`${this.baseUrl}/bot${this.botToken}/sendDocument`, {
      method: 'POST',
      body: form,
    });
    const body = (await res.json()) as TelegramResponse<unknown>;
    if (!body.ok) {
      throw new Error(`Telegram sendDocument failed: ${body.description ?? res.statusText}`);
    }
    return body.result;
  }

  /** Sends a plain-text message. The user must have started the bot first. */
  sendMessage(chatId: number, text: string, replyMarkup?: InlineKeyboard): Promise<unknown> {
    return this.call<unknown>('sendMessage', {
      chat_id: chatId,
      text,
      link_preview_options: { is_disabled: true },
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }

  /** A group, supergroup or channel, by numeric id or "@publicname". */
  getChat(chatId: number | string): Promise<TelegramChat> {
    return this.call<TelegramChat>('getChat', { chat_id: chatId });
  }

  /** Someone's membership of a chat. The bot must be in it (an admin, for channels). */
  getChatMember(chatId: number, userId: number): Promise<TelegramChatMember> {
    return this.call<TelegramChatMember>('getChatMember', { chat_id: chatId, user_id: userId });
  }

  /** Points Telegram's updates at this API, authenticated with `secret`. */
  setWebhook(url: string, secret: string, allowedUpdates: string[]): Promise<true> {
    return this.call<true>('setWebhook', {
      url,
      secret_token: secret,
      allowed_updates: allowedUpdates,
    });
  }

  /** The bot's default menu button, as set up in @BotFather. */
  getChatMenuButton(): Promise<{ type: string; text?: string; web_app?: { url: string } }> {
    return this.call('getChatMenuButton', {});
  }

  answerPreCheckoutQuery(
    preCheckoutQueryId: string,
    ok: boolean,
    errorMessage?: string,
  ): Promise<true> {
    return this.call<true>('answerPreCheckoutQuery', {
      pre_checkout_query_id: preCheckoutQueryId,
      ok,
      ...(errorMessage ? { error_message: errorMessage } : {}),
    });
  }
}
