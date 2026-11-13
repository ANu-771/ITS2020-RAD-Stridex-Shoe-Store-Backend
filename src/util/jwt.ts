import jwt from "jsonwebtoken"
import dotenv from "dotenv"
import { IUser, UserRole } from "../models/user.model"
import { JWTPayload } from "../types"

dotenv.config()

const JWT_SECRET = process.env.JWT_SECRET || "stridex_secure_jwt_access_secret_key_2026"
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "stridex_secure_jwt_refresh_secret_key_2026"

export const signAccessToken = (user: IUser): string => {
  const payload: JWTPayload = {
    sub: user._id.toString(),
    email: user.email,
    role: user.role,
    fullName: user.fullName,
  }

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "15m",
  })
}

export const signRefreshToken = (user: IUser): string => {
  const payload: { sub: string; role: UserRole } = {
    sub: user._id.toString(),
    role: user.role,
  }

  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: "7d",
  })
}

export const verifyAccessToken = (token: string): JWTPayload => {
  return jwt.verify(token, JWT_SECRET) as JWTPayload
}

export const verifyRefreshToken = (
  token: string
): { sub: string; role: UserRole } => {
  return jwt.verify(token, JWT_REFRESH_SECRET) as { sub: string; role: UserRole }
}
