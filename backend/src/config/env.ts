import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(10),
  BOOKING_HOLD_MINUTES: z.coerce.number().int().positive().default(10),
  SERVICE_FEE_PER_TICKET: z.coerce.number().int().nonnegative().default(250),
  DEFAULT_MAX_TICKETS_PER_USER: z.coerce.number().int().positive().default(8),
  DEFAULT_LOCALE: z.enum(['hu', 'en']).default('hu'),
  SUPPORTED_LOCALES: z.string().default('hu,en'),
  SMTP_HOST: z.string().min(1).default('mailhog'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z
    .string()
    .default('false')
    .refine((v) => v === 'true' || v === 'false'),
  MAIL_FROM_NAME: z.string().min(1).default('Jegyzo'),
  MAIL_FROM_ADDRESS: z.string().min(1).default('noreply@jegyzo.local'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
});

export type Env = z.infer<typeof Env>;

export function validateEnv(raw: Record<string, string | undefined>): Env {
  const parsed = Env.safeParse(raw);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => `- ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Invalid or missing configuration (hu: hiányzó vagy érvénytelen környezeti változó):\n${missing}`,
    );
  }
  return parsed.data;
}

export function validateEnvProcess(): Env {
  return validateEnv(process.env as unknown as Record<string, string | undefined>);
}
