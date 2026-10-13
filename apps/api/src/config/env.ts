import { z } from 'zod';
import { walletsEnvSchema } from './payment-methods.js';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  BOT_TOKEN: z.string().min(1),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  INITDATA_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(86_400),
  /** Platform super-admins: create shops, hide them and assign their admins. */
  ADMIN_TELEGRAM_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => Number(part)),
    )
    .pipe(z.array(z.number().int().positive())),
  /**
   * Secret Telegram sends with each webhook call (only needed for Telegram
   * Stars payments). Without it the webhook endpoint is switched off.
   */
  TELEGRAM_WEBHOOK_SECRET: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).optional(),
  ),
  SHOP_ID: z.uuid().optional(),
  CORS_ORIGIN: z.string().default('*'),
  /** Legacy: JSON array of wallets, imported once into the first shop. */
  PAYMENT_METHODS: walletsEnvSchema,
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates `process.env` once at startup and returns a typed, frozen config.
 * Throws with a readable message if anything required is missing.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return Object.freeze(parsed.data);
}
