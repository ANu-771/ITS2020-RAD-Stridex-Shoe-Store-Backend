import { Document, Schema, model, Types } from 'mongoose';
import { IUser } from './user.model';

export type VoucherPurchaseStatus = 'PENDING_PAYMENT' | 'COMPLETED' | 'CANCELLED';
export type VoucherPaymentStatus = 'PENDING' | 'PAID' | 'FAILED';
export type VoucherStatus = 'PENDING' | 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';

export const APPROVED_VOUCHER_VALUES = [2500, 5000, 10000, 15000] as const;
export type ApprovedVoucherValue = (typeof APPROVED_VOUCHER_VALUES)[number];

export interface IGiftVoucher extends Document {
  code?: string;
  originalValue: number; // In LKR (Rs. 2,500, 5,000, 10,000, 15,000)
  remainingBalance: number; // In LKR
  purchaserId: Types.ObjectId | IUser;
  recipientName: string;
  recipientEmail: string;
  personalMessage?: string;
  purchaseStatus: VoucherPurchaseStatus;
  paymentStatus: VoucherPaymentStatus;
  paymentMethod: 'BANK_TRANSFER';
  bankTransferReference?: string;
  status: VoucherStatus;
  issuedAt?: Date;
  expiresAt?: Date;
  revokedAt?: Date;
  revocationReason?: string;
  adminNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const giftVoucherSchema = new Schema<IGiftVoucher>(
  {
    code: {
      type: String,
      unique: true,
      sparse: true, // Allows null/undefined while in PENDING_PAYMENT before admin verification
      uppercase: true,
      trim: true,
      index: true,
    },
    originalValue: {
      type: Number,
      required: [true, 'Voucher original value is required'],
      enum: {
        values: APPROVED_VOUCHER_VALUES,
        message: 'Original value must be an approved STRIDEX voucher amount (Rs. 2,500, 5,000, 10,000, 15,000)',
      },
    },
    remainingBalance: {
      type: Number,
      required: [true, 'Remaining balance is required'],
      min: [0, 'Remaining balance cannot be negative'],
    },
    purchaserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Purchaser user ID is required'],
      index: true,
    },
    recipientName: {
      type: String,
      required: [true, 'Recipient name is required'],
      trim: true,
      minlength: [2, 'Recipient name must be at least 2 characters long'],
    },
    recipientEmail: {
      type: String,
      required: [true, 'Recipient email is required'],
      trim: true,
      lowercase: true,
      index: true,
    },
    personalMessage: {
      type: String,
      trim: true,
      maxlength: [500, 'Personal message cannot exceed 500 characters'],
      default: '',
    },
    purchaseStatus: {
      type: String,
      enum: ['PENDING_PAYMENT', 'COMPLETED', 'CANCELLED'],
      default: 'PENDING_PAYMENT',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['BANK_TRANSFER'],
      default: 'BANK_TRANSFER',
    },
    bankTransferReference: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'USED', 'EXPIRED', 'REVOKED'],
      default: 'PENDING',
      index: true,
    },
    issuedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
      index: true,
    },
    revokedAt: {
      type: Date,
    },
    revocationReason: {
      type: String,
      trim: true,
    },
    adminNotes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Helpful compound index for queries by customer and status
giftVoucherSchema.index({ purchaserId: 1, status: 1 });
giftVoucherSchema.index({ recipientEmail: 1, status: 1 });

export const GiftVoucherModel = model<IGiftVoucher>('GiftVoucher', giftVoucherSchema);
