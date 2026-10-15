/** Subset of Telegram Update fields relevant to the Stars payment flow. */
export interface SuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  provider_payment_charge_id?: string;
}

export interface PreCheckoutQuery {
  id: string;
  from: { id: number };
  currency: string;
  total_amount: number;
  invoice_payload: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id?: number;
    chat?: { id: number; type: string };
    from?: { id: number; first_name?: string; language_code?: string };
    text?: string;
    successful_payment?: SuccessfulPayment;
  };
  pre_checkout_query?: PreCheckoutQuery;
  /** The bot was added to, or removed from, a chat. */
  my_chat_member?: {
    chat: { id: number; type: string; title?: string; username?: string };
    from: { id: number; first_name?: string; language_code?: string };
    new_chat_member: { status: string };
  };
}
