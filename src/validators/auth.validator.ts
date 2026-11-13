import { z } from "zod"

export const registerSchema = z.object({
  fullName: z
    .string()
    .min(2, "Full name must be at least 2 characters long")
    .max(80, "Full name cannot exceed 80 characters"),
  email: z
    .string()
    .email("Invalid email address format")
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters long")
    .max(100, "Password cannot exceed 100 characters"),
  phone: z
    .string()
    .optional()
    .default(""),
})

export const loginSchema = z.object({
  email: z
    .string()
    .email("Invalid email address format")
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(1, "Password is required"),
})

export const refreshTokenSchema = z.object({
  refreshToken: z.string().optional(),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>
