import { Document, model, Schema, Types } from 'mongoose';

export type AiProviderType = 'gemini' | 'groq';

export interface IBotSetting extends Document {
  primaryProvider: AiProviderType;
  fallbackEnabled: boolean;
  updatedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const botSettingSchema = new Schema<IBotSetting>(
  {
    primaryProvider: {
      type: String,
      enum: ['gemini', 'groq'],
      default: () => ((process.env.AI_PRIMARY_PROVIDER as AiProviderType) || 'gemini'),
      required: true,
    },
    fallbackEnabled: {
      type: Boolean,
      default: () => process.env.AI_FALLBACK_ENABLED !== 'false',
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
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

export const BotSettingModel = model<IBotSetting>('BotSetting', botSettingSchema);
