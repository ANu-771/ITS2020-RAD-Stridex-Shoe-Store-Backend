import { Router } from 'express';
import { orderController } from '../controllers/order.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { UserRole } from '../models/user.model';

const router = Router();

// All order routes require authentication
router.use(authenticate);

router.post('/', orderController.createOrder);
router.get('/', orderController.getMyOrders);
router.get('/admin/all', requireRole([UserRole.ADMIN, UserRole.INVENTORY_MANAGER]), orderController.getAllOrders);
router.get('/:id', orderController.getOrderById);

export default router;
