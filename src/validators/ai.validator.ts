import { z } from 'zod';

export const chatMessageHistorySchema = z.object({
  role: z.enum(['user', 'model', 'assistant']),
  text: z.string().min(1, 'Message text cannot be empty'),
});

export const chatRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Please enter a question or message')
    .max(1000, 'Message cannot exceed 1000 characters'),
  history: z.array(chatMessageHistorySchema).optional().default([]),
});

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
