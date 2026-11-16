import { Response, NextFunction } from "express"
import { AuthenticatedRequest } from "../types"
import { verifyAccessToken } from "../util/jwt"
import { UserModel } from "../models/user.model"

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication token missing or malformed",
    })
  }

  const token = authHeader.split(" ")[1]

  try {
    const payload = verifyAccessToken(token)

    // Verify live user existence and active status in MongoDB
    const liveUser = await UserModel.findById(payload.sub).select("role isActive email fullName")
    if (!liveUser) {
      return res.status(401).json({
        success: false,
        message: "User account no longer exists",
      })
    }

    if (!liveUser.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact support.",
      })
    }

    // Attach updated live user permissions and attributes to request
    req.user = {
      ...payload,
      role: liveUser.role,
    }
    next()
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Authentication token has expired. Please refresh your session.",
      })
    }
    return res.status(401).json({
      success: false,
      message: "Invalid authentication token",
    })
  }
}
