import 'dotenv/config';
import { z } from 'zod';

const nodeEnvSchema = z
  .enum(['development', 'test', 'production'])
  .default('development');
const nodeEnv = nodeEnvSchema.parse(process.env.NODE_ENV);
const testMode = nodeEnv === 'test';
const mongodbUriSchema = z
  .string()
  .url()
  .refine((uri) => /^mongodb(\+srv)?:\/\//i.test(uri), {
    message: 'MONGODB_URI must use the mongodb:// or mongodb+srv:// protocol',
  });
const jwtSecretSchema = z
  .string()
  .min(32)
  .refine(
    (secret) => testMode || secret !== 'replace-with-at-least-32-random-bytes',
    'JWT_ACCESS_SECRET must be replaced with a random secret',
  );
const clientOriginSchema = z.string().url();

const envSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  MONGODB_URI: testMode
    ? mongodbUriSchema.default('mongodb://127.0.0.1:27017/resolvehq-test')
    : mongodbUriSchema,
  JWT_ACCESS_SECRET: testMode
    ? jwtSecretSchema.default('resolvehq-test-access-secret-not-for-production')
    : jwtSecretSchema,
  ACCESS_TOKEN_TTL: z.literal('15m').default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce
    .number()
    .int()
    .refine((days) => days === 7)
    .default(7),
  BCRYPT_COST: z.coerce
    .number()
    .int()
    .min(testMode ? 4 : 10)
    .max(14)
    .default(testMode ? 4 : 12),
  CLIENT_ORIGIN:
    nodeEnv === 'production'
      ? clientOriginSchema
      : clientOriginSchema.default('http://localhost:5173'),
});

const parsedEnvironment = envSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  const invalidVariables = [
    ...new Set(
      parsedEnvironment.error.issues
        .map((issue) => issue.path[0])
        .filter((variable) => typeof variable === 'string'),
    ),
  ];
  const variables =
    invalidVariables.length > 0
      ? invalidVariables.join(', ')
      : 'server environment variables';

  throw new Error(
    `Invalid server environment configuration. Check ${variables} in server/.env against server/.env.example. Values are not included in this error.`,
  );
}

export const env = parsedEnvironment.data;
