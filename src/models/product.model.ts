import { Document, model, Schema, Types } from 'mongoose';
import { IBrand } from './brand.model';
import { ICategory } from './category.model';

export type ProductGender = 'MEN' | 'WOMEN' | 'UNISEX' | 'KIDS';

export interface IProduct extends Document {
  name: string;
  slug: string;
  description: string;
  brandId: Types.ObjectId | IBrand;
  categoryId: Types.ObjectId | ICategory;
  basePrice: number; // Stored as pure numeric value in Sri Lankan Rupees (LKR)
  discountPrice: number; // Stored as pure numeric value in LKR; 0 indicates no discount
  images: string[];
  gender: ProductGender;
  material?: string;
  isFeatured: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'Product slug is required'],
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Product description is required'],
      trim: true,
    },
    brandId: {
      type: Schema.Types.ObjectId,
      ref: 'Brand',
      required: [true, 'Brand reference is required'],
      index: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category reference is required'],
      index: true,
    },
    basePrice: {
      type: Number,
      required: [true, 'Base price in LKR is required'],
      min: [0, 'Base price must be a non-negative number'],
    },
    discountPrice: {
      type: Number,
      min: [0, 'Discount price must be a non-negative number'],
      default: 0,
    },
    images: {
      type: [String],
      default: [],
    },
    gender: {
      type: String,
      enum: ['MEN', 'WOMEN', 'UNISEX', 'KIDS'],
      default: 'UNISEX',
      index: true,
    },
    material: {
      type: String,
      trim: true,
      default: '',
    },
    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, any>) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

productSchema.pre('save', async function () {
  if (this.discountPrice && this.discountPrice > 0 && this.discountPrice > this.basePrice) {
    throw new Error('Discount price in LKR cannot exceed base price');
  }
});

// Virtual populate helper for variants
productSchema.virtual('variants', {
  ref: 'ProductVariant',
  localField: '_id',
  foreignField: 'productId',
});

export const ProductModel = model<IProduct>('Product', productSchema);
