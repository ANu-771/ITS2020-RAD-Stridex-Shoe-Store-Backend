import { Router } from 'express';
import { inventoryController } from '../controllers/inventory.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { UserRole } from '../models/user.model';

const router = Router();

// Both ADMIN and INVENTORY_MANAGER have access to inventory functions
router.use(authenticate, requireRole([UserRole.ADMIN, UserRole.INVENTORY_MANAGER]));

router.get('/dashboard', inventoryController.getDashboardStats);
router.get('/variants', inventoryController.getVariants);
router.post('/adjust', inventoryController.adjustStock);
router.patch('/variants/:id/threshold', inventoryController.updateThreshold);
router.get('/movements', inventoryController.getMovements);
router.get('/low-stock-report', inventoryController.getLowStockReport);

export default router;
