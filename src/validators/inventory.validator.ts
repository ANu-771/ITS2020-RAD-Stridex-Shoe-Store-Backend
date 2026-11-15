import { z } from 'zod';

export const stockAdjustmentSchema = z.object({
  variantId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Variant ID format'),
  movementType: z.enum(['STOCK_IN', 'STOCK_OUT', 'DAMAGED', 'ADJUSTMENT']),
  quantity: z.number().int().min(0, 'Quantity cannot be negative'),
  reason: z.string().min(3, 'Reason must be at least 3 characters long').trim(),
}).refine(
  (data) => {
    if (data.movementType !== 'ADJUSTMENT') {
      return data.quantity > 0;
    }
    return data.quantity >= 0;
  },
  {
    message: 'Quantity must be at least 1 for Stock-In, Stock-Out, or Damaged stock movements',
    path: ['quantity'],
  }
);

export const updateThresholdSchema = z.object({
  minStockThreshold: z.number().int().min(0, 'Minimum stock threshold cannot be negative'),
});

