import { z } from 'zod';

export const createCouponSchema = z.object({
  code: z.string().min(3, 'Coupon code must be at least 3 characters').trim().toUpperCase(),
  description: z.string().optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).default('PERCENTAGE'),
  discountValue: z.number().positive('Discount value must be positive'),
  minOrderAmount: z.number().nonnegative().default(0),
  maxDiscountAmount: z.number().positive().optional(),
  startDate: z.string().optional(),
  endDate: z.string().min(1, 'Expiry date is required'),
  usageLimit: z.number().int().positive().optional(),
  isActive: z.boolean().default(true),
});

export const updateCouponSchema = createCouponSchema.partial();

export const validateCouponSchema = z.object({
  code: z.string().min(1, 'Coupon code is required').trim().toUpperCase(),
  orderAmount: z.number().positive('Order amount must be positive'),
});
