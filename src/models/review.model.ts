import { Document, model, Schema, Types } from 'mongoose';
import { IProduct } from './product.model';
import { IUser } from './user.model';

export type ReviewStatus = 'APPROVED' | 'PENDING' | 'FLAGGED';

export interface IReview extends Document {
  productId: Types.ObjectId | IProduct;
  userId: Types.ObjectId | IUser;
  rating: number; // 1 to 5
  title: string;
  comment: string;
  status: ReviewStatus;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Minimum rating is 1'],
      max: [5, 'Maximum rating is 5'],
    },
    title: {
      type: String,
      required: [true, 'Review title is required'],
      trim: true,
      maxlength: [120, 'Title cannot exceed 120 characters'],
    },
    comment: {
      type: String,
      required: [true, 'Review comment is required'],
      trim: true,
      minlength: [5, 'Comment must be at least 5 characters'],
    },
    status: {
      type: String,
      enum: ['APPROVED', 'PENDING', 'FLAGGED'],
      default: 'APPROVED',
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

export const ReviewModel = model<IReview>('Review', reviewSchema);
