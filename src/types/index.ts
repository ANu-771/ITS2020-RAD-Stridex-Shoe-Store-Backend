import { Request } from "express"
import { UserRole } from "../models/user.model"

export interface JWTPayload {
  sub: string
  email: string
  role: UserRole
  fullName?: string
  iat?: number
  exp?: number
}

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload
}

export interface ApiResponse<T = unknown> {
  success: boolean
  message: string
  data?: T
  errors?: unknown
}
