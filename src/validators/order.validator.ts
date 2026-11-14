import { z } from 'zod';

export const createOrderSchema = z.object({
  customerDetails: z.object({
    fullName: z.string().min(2, 'Full name must be at least 2 characters long').trim(),
    phone: z.string().min(7, 'Phone number must be at least 7 digits').trim(),
    email: z.string().email('Invalid email address format').trim().toLowerCase(),
    deliveryAddress: z.string().min(5, 'Delivery address must be at least 5 characters long').trim(),
    city: z.string().min(2, 'City must be at least 2 characters long').trim(),
    postalCode: z.string().min(3, 'Postal code must be at least 3 characters long').trim(),
    deliveryNotes: z.string().optional().default(''),
  }),
  // Optional explicit items array. If omitted or empty, order is fulfilled from customer's MongoDB cart!
  items: z
    .array(
      z.object({
        productId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Product ID format'),
        variantId: z
          .string()
          .regex(/^[0-9a-fA-F]{24}$/, 'Invalid Variant ID format')
          .optional()
          .or(z.literal('')),
        size: z.union([z.string(), z.number()]),
        color: z.string().min(1),
        quantity: z.number().int().min(1, 'Quantity must be at least 1').max(50),
      })
    )
    .optional(),
  paymentMethod: z.enum(['CASH_ON_DELIVERY', 'ONLINE_CARD', 'BANK_TRANSFER']).default('CASH_ON_DELIVERY'),
});
