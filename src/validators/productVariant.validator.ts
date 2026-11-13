import { z } from 'zod';

export const createProductVariantSchema = z.object({
  productId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Product ID format'),
  SKU: z.string().min(2, 'SKU must be at least 2 characters').trim().toUpperCase(),
  size: z.union([z.number(), z.string()]),
  color: z.string().min(2, 'Color is required').trim(),
  stockQuantity: z.number().int().nonnegative('Stock quantity must be a non-negative integer'),
  reservedQuantity: z.number().int().nonnegative('Reserved quantity must be non-negative').optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export const updateProductVariantSchema = z.object({
  SKU: z.string().min(2).trim().toUpperCase().optional(),
  size: z.union([z.number(), z.string()]).optional(),
  color: z.string().min(2).trim().optional(),
  stockQuantity: z.number().int().nonnegative().optional(),
  reservedQuantity: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});
