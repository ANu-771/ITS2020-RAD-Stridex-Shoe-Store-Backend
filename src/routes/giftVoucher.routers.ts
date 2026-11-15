import { Router } from 'express';
import { giftVoucherController } from '../controllers/giftVoucher.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { UserRole } from '../models/user.model';

const router = Router();

// ==========================================
// Customer Endpoints
// ==========================================
// Purchase voucher (Initiate bank payment purchase)
router.post('/purchase', authenticate, giftVoucherController.purchase);

// Get authenticated customer's vouchers (purchased and received)
router.get('/my-vouchers', authenticate, giftVoucherController.getMyVouchers);

// Validate voucher code at checkout (enforces authenticated recipient-only ownership)
router.post('/validate', authenticate, giftVoucherController.validateVoucher);

// Get single voucher details by ID
router.get('/:id', authenticate, giftVoucherController.getVoucherById);

// ==========================================
// Admin Endpoints
// ==========================================
router.get('/', authenticate, requireRole([UserRole.ADMIN]), giftVoucherController.getAdminVouchers);
router.patch('/:id/verify-payment', authenticate, requireRole([UserRole.ADMIN]), giftVoucherController.verifyPaymentAndIssue);
router.patch('/:id/revoke', authenticate, requireRole([UserRole.ADMIN]), giftVoucherController.revoke);
router.get('/:id/redemptions', authenticate, requireRole([UserRole.ADMIN]), giftVoucherController.getRedemptions);

export default router;
