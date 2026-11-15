import { z } from 'zod';
import { APPROVED_VOUCHER_VALUES } from '../models/giftVoucher.model';

export const purchaseVoucherSchema = z.object({
  amount: z
    .number()
    .refine(
      (val) => (APPROVED_VOUCHER_VALUES as readonly number[]).includes(val),
      'Voucher amount must be one of the approved STRIDEX tiers: Rs. 2,500, Rs. 5,000, Rs. 10,000, or Rs. 15,000'
    ),
  recipientName: z
    .string()
    .trim()
    .min(2, 'Recipient name must be at least 2 characters long')
    .max(100, 'Recipient name cannot exceed 100 characters'),
  recipientEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please provide a valid recipient email address'),
  personalMessage: z
    .string()
    .trim()
    .max(500, 'Personal message cannot exceed 500 characters')
    .optional()
    .default(''),
  paymentMethod: z.enum(['BANK_TRANSFER', 'CASH_ON_DELIVERY', 'ONLINE_CARD']),
  bankTransferReference: z.string().trim().optional().default(''),
});

export const validateVoucherSchema = z.object({
  code: z
    .string()
    .trim()
    .min(5, 'Invalid voucher code format')
    .toUpperCase(),
  orderSubtotal: z
    .number()
    .min(0, 'Order subtotal must be greater than or equal to 0')
    .optional()
    .default(0),
});

export const verifyVoucherPaymentSchema = z.object({
  adminNotes: z.string().trim().optional(),
});

export const revokeVoucherSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Revocation reason must be at least 3 characters long'),
});
