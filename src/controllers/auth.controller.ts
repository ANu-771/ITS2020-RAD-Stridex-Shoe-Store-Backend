import { Request, Response } from "express"
import crypto from "crypto"
import bcrypt from "bcryptjs"
import { UserModel, UserRole } from "../models/user.model"
import { PasswordResetOtpModel } from "../models/passwordResetOtp.model"
import { sendPasswordResetEmail } from "../service/email.service"
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

/**
 * Request Password Reset OTP
 * POST /api/v1/auth/forgot-password
 */
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body
    const normalizedEmail = email.toLowerCase().trim()

    // 1. Check 60-second cooldown on active / recent OTPs
    const recentOtp = await PasswordResetOtpModel.findOne({
      email: normalizedEmail,
    }).sort({ createdAt: -1 })

    if (recentOtp) {
      const lastSentTime = new Date(
        recentOtp.lastResendAt || recentOtp.createdAt
      ).getTime()
      const elapsedMs = Date.now() - lastSentTime
      const COOLDOWN_MS = 60 * 1000

      if (elapsedMs < COOLDOWN_MS) {
        const remainingSeconds = Math.ceil((COOLDOWN_MS - elapsedMs) / 1000)
        return res.status(429).json({
          success: false,
          message: `Please wait ${remainingSeconds} seconds before requesting a new verification code.`,
          retryAfter: remainingSeconds,
        })
      }
    }

    // 2. Generic message to prevent email enumeration attacks
    const genericResponse = {
      success: true,
      message:
        "If an account with that email exists, a 6-digit verification code has been sent.",
    }

    // 3. Check if user exists and is active
    const user = await UserModel.findOne({
      email: normalizedEmail,
      isActive: true,
    })
    if (!user) {
      // Return generic success without revealing that account does not exist
      return res.status(200).json(genericResponse)
    }

    // 4. Invalidate any previously issued active OTPs for this email
    await PasswordResetOtpModel.updateMany(
      { email: normalizedEmail, isUsed: false },
      { isUsed: true }
    )

    // 5. Generate cryptographically secure 6-digit numeric OTP
    const otpNumber = crypto.randomInt(100000, 1000000)
    const otp = otpNumber.toString()

    // 6. Hash OTP with bcrypt before storing in database
    const salt = await bcrypt.genSalt(10)
    const otpHash = await bcrypt.hash(otp, salt)

    // 7. Save OTP record with 5-minute expiration and max 5 attempts
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000)
    await PasswordResetOtpModel.create({
      email: normalizedEmail,
      otpHash,
      expiresAt,
      attempts: 0,
      maxAttempts: 5,
      isUsed: false,
      lastResendAt: new Date(),
    })

    // 8. Send branded email via Nodemailer / Email Service
    await sendPasswordResetEmail(normalizedEmail, otp)

    return res.status(200).json(genericResponse)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Forgot password error:", message)
    return res.status(500).json({
      success: false,
      message: "Unable to process password reset request at this time.",
    })
  }
}

/**
 * Verify OTP & Reset Password
 * POST /api/v1/auth/reset-password
 */
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, otp, newPassword } = req.body
    const normalizedEmail = email.toLowerCase().trim()

    // 1. Find active OTP record
    const otpRecord = await PasswordResetOtpModel.findOne({
      email: normalizedEmail,
      isUsed: false,
    }).sort({ createdAt: -1 })

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification code. Please request a new one.",
      })
    }

    // 2. Check expiration (5 minutes)
    if (otpRecord.expiresAt.getTime() < Date.now()) {
      otpRecord.isUsed = true
      await otpRecord.save()
      return res.status(400).json({
        success: false,
        message: "Verification code has expired. Please request a new one.",
      })
    }

    // 3. Check attempt limit (max 5)
    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      otpRecord.isUsed = true
      await otpRecord.save()
      return res.status(400).json({
        success: false,
        message:
          "Maximum verification attempts exceeded. Please request a new verification code.",
      })
    }

    // 4. Securely compare OTP with bcrypt hash
    const isMatch = await bcrypt.compare(otp, otpRecord.otpHash)
    if (!isMatch) {
      otpRecord.attempts += 1
      if (otpRecord.attempts >= otpRecord.maxAttempts) {
        otpRecord.isUsed = true
      }
      await otpRecord.save()

      const remaining = Math.max(0, otpRecord.maxAttempts - otpRecord.attempts)
      return res.status(400).json({
        success: false,
        message:
          remaining > 0
            ? `Invalid verification code. ${remaining} attempt(s) remaining.`
            : "Maximum verification attempts exceeded. Please request a new verification code.",
      })
    }

    // 5. OTP is valid: Find customer account
    const user = await UserModel.findOne({ email: normalizedEmail })
    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        message: "User account not found or deactivated.",
      })
    }

    // 6. Update user password (triggers pre-save bcrypt hash)
    user.password = newPassword
    await user.save()

    // 7. Invalidate the verified OTP and any other OTPs for this account
    await PasswordResetOtpModel.updateMany(
      { email: normalizedEmail },
      { isUsed: true }
    )

    return res.status(200).json({
      success: true,
      message:
        "Password has been reset successfully. Please log in with your new password.",
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Reset password error:", message)
    return res.status(500).json({
      success: false,
      message: "Failed to reset password due to a server error.",
    })
  }
}
