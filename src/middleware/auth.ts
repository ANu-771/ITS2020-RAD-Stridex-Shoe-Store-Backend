import { Response, NextFunction } from "express"
import { AuthenticatedRequest } from "../types"
import { verifyAccessToken } from "../util/jwt"

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
    req.user = payload
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
