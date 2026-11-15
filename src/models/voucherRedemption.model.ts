import { Document, Schema, model, Types } from 'mongoose';
import { IGiftVoucher } from './giftVoucher.model';
import { IUser } from './user.model';
import { IOrder } from './order.model';

export interface IVoucherRedemption extends Document {
  voucherId: Types.ObjectId | IGiftVoucher;
  customerId: Types.ObjectId | IUser;
  orderId: Types.ObjectId | IOrder;
  amountRedeemed: number; // Stored in LKR
  redeemedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const voucherRedemptionSchema = new Schema<IVoucherRedemption>(
  {
    voucherId: {
      type: Schema.Types.ObjectId,
      ref: 'GiftVoucher',
      required: [true, 'Voucher ID is required'],
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Customer ID is required'],
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order ID is required'],
      index: true,
    },
    amountRedeemed: {
      type: Number,
      required: [true, 'Redeemed amount in LKR is required'],
      min: [0.01, 'Redeemed amount must be greater than zero'],
    },
    redeemedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate redemption records for the same voucher and order
voucherRedemptionSchema.index({ voucherId: 1, orderId: 1 }, { unique: true });

export const VoucherRedemptionModel = model<IVoucherRedemption>(
  'VoucherRedemption',
  voucherRedemptionSchema
);
