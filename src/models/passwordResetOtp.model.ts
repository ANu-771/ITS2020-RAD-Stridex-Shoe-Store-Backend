import { Document, Schema, model } from 'mongoose';

export interface IPasswordResetOtp extends Document {
  email: string;
  otpHash: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  isUsed: boolean;
  lastResendAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const passwordResetOtpSchema = new Schema<IPasswordResetOtp>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: [true, 'OTP hash is required'],
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration time is required'],
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
    },
    isUsed: {
      type: Boolean,
      default: false,
      index: true,
    },
    lastResendAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to quickly find active OTPs for an email
passwordResetOtpSchema.index({ email: 1, isUsed: 1, expiresAt: 1 });

// Automatic TTL cleanup index: delete documents 1 hour after creation
passwordResetOtpSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

export const PasswordResetOtpModel = model<IPasswordResetOtp>(
  'PasswordResetOtp',
  passwordResetOtpSchema
);
