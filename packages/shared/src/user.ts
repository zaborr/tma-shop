import { z } from 'zod';
import { isoDateTime } from './common.js';

/** Telegram user id (numeric, 64-bit — kept as number to match Bot API). */
export const telegramUserId = z.number().int().positive();

export const userRole = z.enum(['customer', 'admin']);
export type UserRole = z.infer<typeof userRole>;

export const user = z.object({
  telegramId: telegramUserId,
  firstName: z.string().min(1).max(128),
  username: z.string().max(64).nullable(),
  languageCode: z.string().max(8).nullable(),
  role: userRole,
  createdAt: isoDateTime,
});
export type User = z.infer<typeof user>;

/** Public-facing subset returned to the client after auth. */
export const sessionUser = user.pick({
  telegramId: true,
  firstName: true,
  username: true,
  languageCode: true,
  role: true,
});
export type SessionUser = z.infer<typeof sessionUser>;
