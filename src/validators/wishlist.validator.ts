import { z } from 'zod';

export const toggleWishlistSchema = z.object({
  productId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Product ID format'),
});

export const syncWishlistSchema = z.object({
  productIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Product ID format')),
});
