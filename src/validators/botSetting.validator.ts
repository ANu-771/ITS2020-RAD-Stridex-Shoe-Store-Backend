import { z } from 'zod';

export const updateBotSettingSchema = z.object({
  primaryProvider: z.enum(['gemini', 'groq'], {
    error: 'Primary provider must be either gemini or groq',
  }),
  fallbackEnabled: z.boolean({
    error: 'Fallback enabled must be a boolean value',
  }),
});

export type UpdateBotSettingInput = z.infer<typeof updateBotSettingSchema>;
