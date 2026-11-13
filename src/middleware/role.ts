import { Response, NextFunction } from "express"
import { AuthenticatedRequest } from "../types"
import { UserRole } from "../models/user.model"

export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: authentication required",
      })
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: requires one of [${allowedRoles.join(", ")}] roles`,
      })
    }

    next()
  }
}
