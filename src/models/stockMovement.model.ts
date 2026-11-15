import { Document, model, Schema, Types } from 'mongoose';
import { IProduct } from './product.model';
import { IProductVariant } from './productVariant.model';
import { IUser } from './user.model';

export type StockMovementType =
  | 'STOCK_IN'
  | 'STOCK_OUT'
  | 'DAMAGED'
  | 'ADJUSTMENT'
  | 'ORDER_FULFILLMENT'
  | 'ORDER_CANCELLATION';

export interface IStockMovement extends Document {
  productId: Types.ObjectId | IProduct;
  variantId: Types.ObjectId | IProductVariant;
  movementType: StockMovementType;
  previousQuantity: number;
  changedQuantity: number;
  newQuantity: number;
  reason: string;
  performedBy: Types.ObjectId | IUser;
  createdAt: Date;
  updatedAt: Date;
}

const stockMovementSchema = new Schema<IStockMovement>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
      index: true,
    },
    variantId: {
      type: Schema.Types.ObjectId,
      ref: 'ProductVariant',
      required: [true, 'Variant reference is required'],
      index: true,
    },
    movementType: {
      type: String,
      enum: [
        'STOCK_IN',
        'STOCK_OUT',
        'DAMAGED',
        'ADJUSTMENT',
        'ORDER_FULFILLMENT',
        'ORDER_CANCELLATION',
      ],
      required: [true, 'Movement type is required'],
      index: true,
    },
    previousQuantity: {
      type: Number,
      required: [true, 'Previous stock quantity is required'],
      min: 0,
    },
    changedQuantity: {
      type: Number,
      required: [true, 'Changed quantity delta is required'],
    },
    newQuantity: {
      type: Number,
      required: [true, 'New stock quantity is required'],
      min: 0,
    },
    reason: {
      type: String,
      required: [true, 'Adjustment reason is required'],
      trim: true,
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User who performed action is required'],
      index: true,
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

export const StockMovementModel = model<IStockMovement>('StockMovement', stockMovementSchema);
