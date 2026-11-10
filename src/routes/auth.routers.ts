import { Router } from "express"
import { getMyDetails, getRefreshToken, login, register } from "./../controllers/auth.controller"
import { authenticate } from "../middleware/auth"
import { requireRole } from "../middleware/role"
import { UserRole } from "../models/user.model"

const router = Router()

router.post("/login", login)
router.post("/register", register)
router.post("/refresh", getRefreshToken)

router.get("/me", authenticate ,getMyDetails)

//admin route
router.get("/admin", authenticate, requireRole([UserRole.ADMIN]), (_req, res) => {
    res.status(200).json({ message: "Admin access granted" })
})

//admin, manager route
router.get("/admin-manager", authenticate, requireRole([UserRole.ADMIN, UserRole.MANAGER]), (_req, res) => {
    res.status(200).json({ message: "Admin or manager access granted" })
})


export default router


//make article save for enrollemnts need dtitle content for article must make this
