import { z } from 'zod';

const passwordSchema = z.string().refine((password) => {
  const bytes = Buffer.byteLength(password, 'utf8');
  return bytes >= 10 && bytes <= 72;
}, 'Password must be 10 to 72 bytes');

export const registerSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    email: z
      .string()
      .trim()
      .email()
      .transform((email) => email.toLowerCase()),
    password: passwordSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .transform((email) => email.toLowerCase()),
    password: z
      .string()
      .min(1)
      .refine(
        (password) => Buffer.byteLength(password, 'utf8') <= 72,
        'Password must be no more than 72 bytes',
      ),
  })
  .strict();
