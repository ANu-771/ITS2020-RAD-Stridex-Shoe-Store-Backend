import { Document, model, Schema, Types } from 'mongoose';
import { IProduct } from './product.model';
import { IUser } from './user.model';

export interface IWishlist extends Document {
  userId: Types.ObjectId | IUser;
  products: (Types.ObjectId | IProduct)[];
  createdAt: Date;
  updatedAt: Date;
}

const wishlistSchema = new Schema<IWishlist>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      unique: true,
      index: true,
    },
    products: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Product',
      },
    ],
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

export const WishlistModel = model<IWishlist>('Wishlist', wishlistSchema);
