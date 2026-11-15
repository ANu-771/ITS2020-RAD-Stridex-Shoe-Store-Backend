import { Request, Response } from 'express';
import { z } from 'zod';
import { chatRequestSchema } from '../validators/ai.validator';
import { aiChatService } from '../service/aiChat.service';

export const aiController = {
  /**
   * One Simple AI Chat API Endpoint
   * POST /api/v1/ai/chat
   *
   * Body: { message: string, history?: Array<{ role: string, text: string }> }
   * Returns: { success: true, reply: string, suggestedProducts: [...] }
   */
  chat: async (req: Request, res: Response) => {
    try {
      // 1. Validate request body
      const parsed = chatRequestSchema.parse(req.body);

      // 2. Generate conversational response with live MongoDB catalog
      const result = await aiChatService.generateChatResponse(
        parsed.message,
        parsed.history
      );

      return res.status(200).json({
        success: true,
        reply: result.reply,
        suggestedProducts: result.suggestedProducts,
      });
    } catch (err: any) {
      console.error('AI Chatbot error:', err);

      // Validation error
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          reply: err.issues.map((i) => i.message).join(', ') || 'Invalid message format',
          suggestedProducts: [],
        });
      }

      // MongoDB retrieval failure
      if (err.code === 'MONGODB_UNAVAILABLE') {
        return res.status(500).json({
          success: false,
          reply:
            "Sorry! I couldn't retrieve the latest product information. Please try again shortly.",
          suggestedProducts: [],
        });
      }

      // Gemini API service unavailable
      if (err.code === 'GEMINI_UNAVAILABLE') {
        return res.status(503).json({
          success: false,
          reply:
            'Sorry! Our STRIDEX AI Assistant is temporarily unavailable. Please try again later.',
          suggestedProducts: [],
        });
      }

      return res.status(500).json({
        success: false,
        reply:
          err.message ||
          'Sorry! Our STRIDEX AI Assistant encountered an unexpected error. Please try again later.',
        suggestedProducts: [],
      });
    }
  },
};
