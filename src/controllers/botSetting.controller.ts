import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { BotSettingModel, AiProviderType } from '../models/botSetting.model';
import { updateBotSettingSchema } from '../validators/botSetting.validator';
import { z } from 'zod';

export const botSettingController = {
  /**
   * GET /api/v1/admin/bot-controls/settings
   * Admin-only: Retrieves current AI provider configuration status and models.
   * Never exposes raw API keys.
   */
  getSettings: async (_req: AuthenticatedRequest, res: Response) => {
    try {
      let setting = await BotSettingModel.findOne();
      if (!setting) {
        const defaultPrimary = ((process.env.AI_PRIMARY_PROVIDER as AiProviderType) || 'gemini');
        const defaultFallback = process.env.AI_FALLBACK_ENABLED !== 'false';
        setting = await BotSettingModel.create({
          primaryProvider: defaultPrimary,
          fallbackEnabled: defaultFallback,
        });
      }

      const primary = setting.primaryProvider;
      const backup = primary === 'gemini' ? 'groq' : 'gemini';
      const geminiConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
      const groqConfigured = Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim());

      return res.status(200).json({
        success: true,
        settings: {
          primaryProvider: primary,
          backupProvider: backup,
          fallbackEnabled: setting.fallbackEnabled,
          geminiConfigured,
          groqConfigured,
          geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
          groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
          updatedAt: setting.updatedAt,
        },
      });
    } catch (err: any) {
      console.error('Error fetching bot settings:', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve chatbot configuration settings.',
      });
    }
  },

  /**
   * PATCH /api/v1/admin/bot-controls/settings
   * Admin-only: Updates AI primary provider and automatic fallback setting.
   */
  updateSettings: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = updateBotSettingSchema.parse(req.body);
      const userId = req.user?.sub;

      let setting = await BotSettingModel.findOne();
      if (!setting) {
        setting = new BotSettingModel({
          primaryProvider: parsed.primaryProvider,
          fallbackEnabled: parsed.fallbackEnabled,
          updatedBy: userId || null,
        });
      } else {
        setting.primaryProvider = parsed.primaryProvider;
        setting.fallbackEnabled = parsed.fallbackEnabled;
        if (userId) {
          setting.updatedBy = userId as any;
        }
      }

      await setting.save();

      const primary = setting.primaryProvider;
      const backup = primary === 'gemini' ? 'groq' : 'gemini';
      const geminiConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
      const groqConfigured = Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim());

      return res.status(200).json({
        success: true,
        message: 'Chatbot provider settings updated successfully.',
        settings: {
          primaryProvider: primary,
          backupProvider: backup,
          fallbackEnabled: setting.fallbackEnabled,
          geminiConfigured,
          groqConfigured,
          geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
          groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
          updatedAt: setting.updatedAt,
        },
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: err.issues.map((i) => i.message).join(', ') || 'Invalid setting payload',
        });
      }
      console.error('Error updating bot settings:', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to update chatbot configuration settings.',
      });
    }
  },
};
