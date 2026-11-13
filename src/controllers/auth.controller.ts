import { Request, Response } from "express"
import { UserModel, UserRole } from "../models/user.model"
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../util/jwt"
import { AuthenticatedRequest } from "../types"

// Cookie configuration for refresh tokens
const REFRESH_COOKIE_NAME = "refreshToken"
const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: (process.env.NODE_ENV === "production" ? "strict" : "lax") as
    | "strict"
    | "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/",
})

/**
 * Public User Registration (Defaults strictly to CUSTOMER role)
 * POST /api/v1/auth/register
 */
export const register = async (req: Request, res: Response) => {
  try {
    const { fullName, email, password, phone } = req.body

    // 1. Check if user already exists
    const existingUser = await UserModel.findOne({ email: email.toLowerCase() })
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "An account with this email address already exists",
      })
    }

    // 2. Create new user with enforced CUSTOMER role
    const newUser = new UserModel({
      fullName,
      email: email.toLowerCase(),
      password,
      phone: phone || "",
      role: UserRole.CUSTOMER, // Never allow public role escalation
      isActive: true,
    })

    await newUser.save()

    // 3. Issue authentication tokens
    const accessToken = signAccessToken(newUser)
    const refreshToken = signRefreshToken(newUser)

    // 4. Set secure HTTP-only refresh cookie
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getCookieOptions())

    return res.status(201).json({
      success: true,
      message: "Customer account registered successfully",
      data: {
        user: newUser.toJSON(),
        accessToken,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Registration error:", message)
    return res.status(500).json({
      success: false,
      message: "Registration failed due to a server error",
    })
  }
}

/**
 * User Login
 * POST /api/v1/auth/login
 */
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    // 1. Find user by email and explicitly select password
    const user = await UserModel.findOne({ email: email.toLowerCase() }).select(
      "+password"
    )

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      })
    }

    // 2. Verify account is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact support.",
      })
    }

    // 3. Verify password
    const isMatch = await user.comparePassword(password)
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      })
    }

    // 4. Issue tokens
    const accessToken = signAccessToken(user)
    const refreshToken = signRefreshToken(user)

    // 5. Set HTTP-only refresh cookie
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getCookieOptions())

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: user.toJSON(),
        accessToken,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Login error:", message)
    return res.status(500).json({
      success: false,
      message: "Login failed due to a server error",
    })
  }
}

/**
 * Token Rotation & Refresh
 * POST /api/v1/auth/refresh
 */
export const getRefreshToken = async (req: Request, res: Response) => {
  try {
    // Read from HTTP-only cookie first, fallback to request body
    const token = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Refresh token is missing. Please log in again.",
      })
    }

    // Verify token validity and signature
    let decoded: { sub: string; role: UserRole }
    try {
      decoded = verifyRefreshToken(token)
    } catch {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token. Please log in again.",
      })
    }

    // Verify user exists and remains active in database
    const user = await UserModel.findById(decoded.sub)
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "User session is no longer active",
      })
    }

    // Rotate tokens
    const newAccessToken = signAccessToken(user)
    const newRefreshToken = signRefreshToken(user)

    // Update refresh cookie
    res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, getCookieOptions())

    return res.status(200).json({
      success: true,
      message: "Session refreshed successfully",
      data: {
        accessToken: newAccessToken,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Refresh token error:", message)
    return res.status(500).json({
      success: false,
      message: "Session refresh failed",
    })
  }
}

/**
 * User Logout
 * POST /api/v1/auth/logout
 */
export const logout = async (_req: Request, res: Response) => {
  // Clear the refresh cookie
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: (process.env.NODE_ENV === "production" ? "strict" : "lax") as
      | "strict"
      | "lax",
    path: "/",
  })

  return res.status(200).json({
    success: true,
    message: "Logged out successfully",
  })
}

/**
 * Get Current User Profile (Protected)
 * GET /api/v1/auth/me
 */
export const getMyDetails = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !req.user.sub) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      })
    }

    const user = await UserModel.findById(req.user.sub)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      })
    }

    return res.status(200).json({
      success: true,
      data: {
        user: user.toJSON(),
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Get profile error:", message)
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve user profile",
    })
  }
}
