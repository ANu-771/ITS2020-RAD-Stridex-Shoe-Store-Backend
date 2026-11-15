import { z } from 'zod';

export const createReviewSchema = z.object({
  productId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Product ID format'),
  rating: z.number().int().min(1).max(5),
  title: z.string().min(2, 'Title must be at least 2 characters').trim(),
  comment: z.string().min(5, 'Review comment must be at least 5 characters').trim(),
});

export const updateReviewStatusSchema = z.object({
  status: z.enum(['APPROVED', 'PENDING', 'FLAGGED']),
});
