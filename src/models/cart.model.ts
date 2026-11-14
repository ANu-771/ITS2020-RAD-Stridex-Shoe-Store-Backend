import { Document, model, Schema, Types } from 'mongoose';
import { IProduct } from './product.model';
import { IProductVariant } from './productVariant.model';
import { IUser } from './user.model';

export interface ICartItem {
  _id?: Types.ObjectId;
  productId: Types.ObjectId | IProduct;
  variantId: Types.ObjectId | IProductVariant;
  size: number | string;
  color: string;
  quantity: number;
}

export interface ICart extends Document {
  userId: Types.ObjectId | IUser;
  items: ICartItem[];
  createdAt: Date;
  updatedAt: Date;
}

const cartItemSchema = new Schema<ICartItem>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product ID is required'],
    },
    variantId: {
      type: Schema.Types.ObjectId,
      ref: 'ProductVariant',
      required: [true, 'Variant ID is required'],
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
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
      default: 1,
    },
  },
  { _id: true }
);

const cartSchema = new Schema<ICart>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      unique: true,
      index: true,
    },
    items: [cartItemSchema],
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

export const CartModel = model<ICart>('Cart', cartSchema);
