import { Router } from "express"
import {
  getMyDetails,
  getRefreshToken,
  login,
  logout,
  register,
  forgotPassword,
  resetPassword,
} from "../controllers/auth.controller"
import { authenticate } from "../middleware/auth"
import { requireRole } from "../middleware/role"
import { UserRole } from "../models/user.model"
import { validateRequest } from "../middleware/validate"
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validators/auth.validator"

const router = Router()

// Public authentication routes
router.post("/register", validateRequest(registerSchema), register)
router.post("/login", validateRequest(loginSchema), login)
router.post("/refresh", getRefreshToken)
router.post("/logout", logout)
router.post(
  "/forgot-password",
  validateRequest(forgotPasswordSchema),
  forgotPassword
)
router.post(
  "/reset-password",
  validateRequest(resetPasswordSchema),
  resetPassword
)

// Protected user routes
router.get("/me", authenticate, getMyDetails)

// Role-protected test routes for verification
router.get(
  "/admin-only",
  authenticate,
  requireRole([UserRole.ADMIN]),
  (req: any, res) => {
    res.status(200).json({
      success: true,
      message: "Admin authorization verified. Access granted to administrative control plane.",
      user: req.user,
    })
  }
)

router.get(
  "/inventory-only",
  authenticate,
  requireRole([UserRole.INVENTORY_MANAGER, UserRole.ADMIN]),
  (req: any, res) => {
    res.status(200).json({
      success: true,
      message: "Inventory Manager authorization verified. Access granted to warehouse inventory management.",
      user: req.user,
    })
  }
)

export default router
