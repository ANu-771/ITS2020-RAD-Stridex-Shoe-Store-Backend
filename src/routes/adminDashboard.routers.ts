import { Router } from 'express';
import { adminDashboardController } from '../controllers/adminDashboard.controller';
import { adminUserController } from '../controllers/adminUser.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { UserRole } from '../models/user.model';

const router = Router();

// Only ADMIN can access overall admin dashboard, user management, customer directory & financial reports
router.use(authenticate, requireRole([UserRole.ADMIN]));

router.get('/dashboard/stats', adminDashboardController.getDashboardStats);
router.get('/customers', adminDashboardController.getCustomers);
router.get('/reports/sales', adminDashboardController.getSalesReport);
router.get('/reports/inventory-valuation', adminDashboardController.getInventoryValuation);

// User & Role Management endpoints
router.get('/users', adminUserController.getUsers);
router.get('/users/:id', adminUserController.getUserById);
router.patch('/users/:id/role', adminUserController.updateUserRole);
router.patch('/users/:id/status', adminUserController.updateUserStatus);

export default router;
