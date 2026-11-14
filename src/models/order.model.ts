import { Document, model, Schema, Types } from 'mongoose';
import { IProduct } from './product.model';
import { IProductVariant } from './productVariant.model';
import { IUser } from './user.model';

export type PaymentMethod = 'CASH_ON_DELIVERY' | 'ONLINE_CARD' | 'BANK_TRANSFER';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

export interface IOrderItem {
  productId: Types.ObjectId | IProduct;
  variantId: Types.ObjectId | IProductVariant;
  name: string;
  image: string;
  size: number | string;
  color: string;
  unitPrice: number; // Stored in Sri Lankan Rupees (LKR)
  quantity: number;
  totalPrice: number; // Stored in LKR
}

export interface ICustomerDetails {
  fullName: string;
  phone: string;
  email: string;
  deliveryAddress: string;
  city: string;
  postalCode: string;
  deliveryNotes?: string;
}

export interface IOrderTimeline {
  status: OrderStatus;
  timestamp: Date;
  title: string;
  description: string;
}

export interface IPaymentDetails {
  transactionId?: string;
  paidAt?: Date;
  simulatedStatus?: string;
  note?: string;
}

export interface IOrder extends Document {
  orderNumber: string;
  userId: Types.ObjectId | IUser;
  customerDetails: ICustomerDetails;
  deliveryAddress: string; // Direct top-level access as specified in requirements
  items: IOrderItem[];
  subtotal: number; // In LKR
  deliveryFee: number; // In LKR
  totalAmount: number; // In LKR
  finalTotal: number; // In LKR (alias of totalAmount)
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  stockRestored: boolean; // Prevents duplicate stock restoration on cancellation
  cancelledAt?: Date;
  cancellationReason?: string;
  paymentDetails?: IPaymentDetails;
  trackingTimeline: IOrderTimeline[];
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
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
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    image: {
      type: String,
      required: [true, 'Product image is required'],
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
    unitPrice: {
      type: Number,
      required: [true, 'Unit price in LKR is required'],
      min: [0, 'Unit price cannot be negative'],
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
    },
    totalPrice: {
      type: Number,
      required: [true, 'Total price in LKR is required'],
      min: [0, 'Total price cannot be negative'],
    },
  },
  { _id: false }
);

const customerDetailsSchema = new Schema<ICustomerDetails>(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters long'],
    },
    phone: {
      type: String,
      required: [true, 'Contact phone number is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email address is required'],
      trim: true,
      lowercase: true,
    },
    deliveryAddress: {
      type: String,
      required: [true, 'Delivery address is required'],
      trim: true,
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
    },
    postalCode: {
      type: String,
      required: [true, 'Postal code is required'],
      trim: true,
    },
    deliveryNotes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: {
      type: String,
      required: [true, 'Order number is required'],
      unique: true,
      index: true,
      uppercase: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    customerDetails: {
      type: customerDetailsSchema,
      required: [true, 'Customer details are required'],
    },
    deliveryAddress: {
      type: String,
      required: [true, 'Delivery address is required'],
      trim: true,
    },
    items: {
      type: [orderItemSchema],
      required: [true, 'Order items are required'],
      validate: [(val: IOrderItem[]) => val.length > 0, 'Order must contain at least one item'],
    },
    subtotal: {
      type: Number,
      required: [true, 'Subtotal in LKR is required'],
      min: [0, 'Subtotal cannot be negative'],
    },
    deliveryFee: {
      type: Number,
      required: [true, 'Delivery fee in LKR is required'],
      min: [0, 'Delivery fee cannot be negative'],
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total amount in LKR is required'],
      min: [0, 'Total amount cannot be negative'],
    },
    finalTotal: {
      type: Number,
      required: [true, 'Final total in LKR is required'],
      min: [0, 'Final total cannot be negative'],
    },
    paymentMethod: {
      type: String,
      enum: ['CASH_ON_DELIVERY', 'ONLINE_CARD', 'BANK_TRANSFER'],
      default: 'CASH_ON_DELIVERY',
    },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'],
      default: 'PENDING',
    },
    orderStatus: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
      default: 'PENDING',
    },
    stockRestored: {
      type: Boolean,
      default: false,
    },
    cancelledAt: {
      type: Date,
    },
    cancellationReason: {
      type: String,
      trim: true,
    },
    paymentDetails: {
      transactionId: { type: String },
      paidAt: { type: Date },
      simulatedStatus: { type: String },
      note: { type: String },
    },
    trackingTimeline: [
      {
        status: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        title: { type: String, required: true },
        description: { type: String, required: true },
        _id: false,
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

export const OrderModel = model<IOrder>('Order', orderSchema);
