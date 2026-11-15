import { Router } from 'express';
import { couponController } from '../controllers/coupon.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { UserRole } from '../models/user.model';

const router = Router();

// Validate coupon (accessible to authenticated customers or at checkout)
router.post('/validate', couponController.validateCoupon);

// Admin-only management endpoints
router.get('/', authenticate, requireRole([UserRole.ADMIN]), couponController.getAllCoupons);
router.post('/', authenticate, requireRole([UserRole.ADMIN]), couponController.createCoupon);
router.put('/:id', authenticate, requireRole([UserRole.ADMIN]), couponController.updateCoupon);
router.delete('/:id', authenticate, requireRole([UserRole.ADMIN]), couponController.deleteCoupon);

export default router;
