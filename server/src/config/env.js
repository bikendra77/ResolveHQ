import 'dotenv/config';
import { z } from 'zod';

const nodeEnvSchema = z
  .enum(['development', 'test', 'production'])
  .default('development');
const nodeEnv = nodeEnvSchema.parse(process.env.NODE_ENV);
const mongodbUriSchema = z
  .string()
  .url()
  .refine((uri) => /^mongodb(\+srv)?:\/\//i.test(uri), {
    message: 'MONGODB_URI must use the mongodb:// or mongodb+srv:// protocol',
  });

const envSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  MONGODB_URI:
    nodeEnv === 'test'
      ? mongodbUriSchema.default('mongodb://127.0.0.1:27017/resolvehq-test')
      : mongodbUriSchema,
});

export const env = envSchema.parse(process.env);
