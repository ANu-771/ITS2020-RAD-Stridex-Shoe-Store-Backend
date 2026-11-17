import { Request, Response } from 'express';
import { z } from 'zod';
import { chatRequestSchema } from '../validators/ai.validator';
import { aiChatService } from '../service/aiChat.service';
import { verifyAccessToken } from '../util/jwt';

export const aiController = {
  /**
   * Public / Authenticated AI Shopping Assistant Endpoint
   * POST /api/v1/ai/chat
   *
   * Body: { message: string, history?: Array<{ role: string, text: string }> }
   * Returns: { success: true, reply: string, suggestedProducts: [...], remainingMessages?: number }
   */
  chat: async (req: Request, res: Response) => {
    try {
      // 1. Validate request body
      const parsed = chatRequestSchema.parse(req.body);

      // 2. Identify customer identity if authenticated via Bearer token
      let customerId: string | undefined;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
          const payload = verifyAccessToken(token);
          if (payload && payload.sub) {
            customerId = payload.sub;
          }
        } catch {
          // Token expired or invalid; treat as guest for shopping inquiries
          customerId = undefined;
        }
      }

      // Generate client identifier for 10-message/10-minute rate limiting
      const forwarded = req.headers['x-forwarded-for'];
      const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') || req.ip || req.socket.remoteAddress || 'unknown';
      const clientKey = customerId ? `user_${customerId}` : `guest_${ip}`;

      // 3. Generate response with dual provider support, fallback and dynamic DB context
      const result = await aiChatService.generateChatResponse(
        parsed.message,
        parsed.history,
        {
          customerId,
          clientKey,
        }
      );

      return res.status(200).json({
        success: true,
        reply: result.reply,
        suggestedProducts: result.suggestedProducts,
        remainingMessages: result.remainingMessages,
      });
    } catch (err: any) {
      console.error('AI Chatbot error:', err);

      // Validation error (HTTP 400)
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          reply: err.issues.map((i) => i.message).join(', ') || 'Invalid message format',
          suggestedProducts: [],
        });
      }

      // Rate limit reached (HTTP 429)
      if (err.code === 'RATE_LIMIT_EXCEEDED') {
        return res.status(429).json({
          success: false,
          reply: err.message,
          suggestedProducts: [],
          remainingMessages: 0,
          resetInSeconds: err.resetInSeconds,
        });
      }

      // Provider service unavailable / all providers down (HTTP 503)
      if (err.code === 'AI_ALL_PROVIDERS_UNAVAILABLE' || err.code === 'GEMINI_UNAVAILABLE') {
        return res.status(503).json({
          success: false,
          reply:
            'Sorry! Our STRIDEX AI Assistant is temporarily unavailable. Please try again later.',
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

      return res.status(500).json({
        success: false,
        reply:
          'Sorry! Our STRIDEX AI Assistant encountered an unexpected error. Please try again later.',
        suggestedProducts: [],
      });
    }
  },
};
