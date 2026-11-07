import { z } from 'zod';

export const createOrganizationSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
  })
  .strict();

export const changeMemberRoleSchema = z
  .object({
    role: z.enum(['owner', 'admin', 'member', 'viewer']),
  })
  .strict();
