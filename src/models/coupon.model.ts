import { Document, model, Schema } from 'mongoose';

export type CouponDiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';

export interface ICoupon extends Document {
  code: string;
  description?: string;
  discountType: CouponDiscountType;
  discountValue: number; // Percentage (e.g. 10 for 10%) or Fixed LKR (e.g. 2500)
  minOrderAmount: number; // Minimum order subtotal in LKR required
  maxDiscountAmount?: number; // Maximum discount cap in LKR for percentage discounts
  startDate: Date;
  endDate: Date;
  usageLimit?: number;
  usedCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new Schema<ICoupon>(
  {
    code: {
      type: String,
      required: [true, 'Coupon code is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    discountType: {
      type: String,
      enum: ['PERCENTAGE', 'FIXED_AMOUNT'],
      required: [true, 'Discount type is required'],
      default: 'PERCENTAGE',
    },
    discountValue: {
      type: Number,
      required: [true, 'Discount value is required'],
      min: [0, 'Discount value cannot be negative'],
    },
    minOrderAmount: {
      type: Number,
      required: [true, 'Minimum order amount in LKR is required'],
      min: [0, 'Minimum order amount cannot be negative'],
      default: 0,
    },
    maxDiscountAmount: {
      type: Number,
      min: [0, 'Max discount amount cannot be negative'],
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
      default: Date.now,
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required'],
    },
    usageLimit: {
      type: Number,
      min: [1, 'Usage limit must be at least 1'],
    },
    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, any>) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const CouponModel = model<ICoupon>('Coupon', couponSchema);
