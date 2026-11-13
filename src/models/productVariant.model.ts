import { Document, model, Schema, Types } from 'mongoose';
import { IProduct } from './product.model';

export interface IProductVariant extends Document {
  productId: Types.ObjectId | IProduct;
  SKU: string;
  size: number | string;
  color: string;
  stockQuantity: number;
  reservedQuantity: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const productVariantSchema = new Schema<IProductVariant>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
      index: true,
    },
    SKU: {
      type: String,
      required: [true, 'SKU is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    size: {
      type: Schema.Types.Mixed,
      required: [true, 'Size is required'],
    },
    color: {
      type: String,
      required: [true, 'Color is required'],
      trim: true,
    },
    stockQuantity: {
      type: Number,
      required: [true, 'Stock quantity is required'],
      min: [0, 'Stock quantity cannot be negative'],
      default: 0,
    },
    reservedQuantity: {
      type: Number,
      min: [0, 'Reserved quantity cannot be negative'],
      default: 0,
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

// Enforce unique combination of size and color for the same product
productVariantSchema.index({ productId: 1, size: 1, color: 1 }, { unique: true });

export const ProductVariantModel = model<IProductVariant>(
  'ProductVariant',
  productVariantSchema
);
