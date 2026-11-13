import { z } from 'zod';

export const createBrandSchema = z.object({
  name: z.string().min(2, 'Brand name must be at least 2 characters long').trim(),
  description: z.string().optional(),
  logo: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const updateBrandSchema = createBrandSchema.partial();
