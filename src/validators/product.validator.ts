import { z } from 'zod';

export const createProductSchema = z
  .object({
    name: z.string().min(2, 'Product name must be at least 2 characters long').trim(),
    description: z.string().min(5, 'Product description must be at least 5 characters long').trim(),
    brandId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Brand ID format'),
    categoryId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Category ID format'),
    basePrice: z.number().nonnegative('Base price in LKR must be a non-negative number'),
    discountPrice: z.number().nonnegative('Discount price in LKR must be non-negative').optional().default(0),
    images: z.array(z.string()).optional().default([]),
    gender: z.enum(['MEN', 'WOMEN', 'UNISEX', 'KIDS']).optional().default('UNISEX'),
    material: z.string().optional().default(''),
    isFeatured: z.boolean().optional().default(false),
    isActive: z.boolean().optional().default(true),
  })
  .refine(
    (data) => {
      if (data.discountPrice && data.discountPrice > 0) {
        return data.discountPrice <= data.basePrice;
      }
      return true;
    },
    {
      message: 'Discount price in LKR cannot exceed the base price',
      path: ['discountPrice'],
    }
  );

export const updateProductSchema = z
  .object({
    name: z.string().min(2).trim().optional(),
    description: z.string().min(5).trim().optional(),
    brandId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
    categoryId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
    basePrice: z.number().nonnegative().optional(),
    discountPrice: z.number().nonnegative().optional(),
    images: z.array(z.string()).optional(),
    gender: z.enum(['MEN', 'WOMEN', 'UNISEX', 'KIDS']).optional(),
    material: z.string().optional(),
    isFeatured: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.basePrice !== undefined && data.discountPrice !== undefined && data.discountPrice > 0) {
        return data.discountPrice <= data.basePrice;
      }
      return true;
    },
    {
      message: 'Discount price in LKR cannot exceed the base price',
      path: ['discountPrice'],
    }
  );
