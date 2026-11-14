import { z } from 'zod';

export const addToCartSchema = z.object({
  productId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Product ID format'),
  variantId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid Variant ID format')
    .optional()
    .or(z.literal('')),
  size: z.union([z.string().min(1, 'Size is required'), z.number().positive('Size must be positive')]),
  color: z.string().min(1, 'Color is required').trim(),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(50, 'Cannot exceed 50 items per line').default(1),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(50, 'Cannot exceed 50 items'),
});

export const syncCartSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Product ID format'),
      variantId: z
        .string()
        .regex(/^[0-9a-fA-F]{24}$/, 'Invalid Variant ID format')
        .optional()
        .or(z.literal('')),
      size: z.union([z.string(), z.number()]),
      color: z.string().min(1),
      quantity: z.number().int().min(1).max(50),
    })
  ),
});
