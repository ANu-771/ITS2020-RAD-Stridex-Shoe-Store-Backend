import { Router } from 'express';
import {
  getVariantsByProduct,
  getVariantById,
  createVariant,
  updateVariant,
  deleteVariant,
} from '../controllers/productVariant.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { validate } from '../middleware/validate';
import { UserRole } from '../models/user.model';
import {
  createProductVariantSchema,
  updateProductVariantSchema,
} from '../validators/productVariant.validator';

const router = Router();

// Public routes
router.get('/product/:productId', getVariantsByProduct);
router.get('/:id', getVariantById);

// Admin & Inventory Manager management routes
router.post(
  '/',
  authenticate,
  requireRole([UserRole.ADMIN, UserRole.INVENTORY_MANAGER]),
  validate(createProductVariantSchema),
  createVariant
);

router.put(
  '/:id',
  authenticate,
  requireRole([UserRole.ADMIN, UserRole.INVENTORY_MANAGER]),
  validate(updateProductVariantSchema),
  updateVariant
);

router.delete(
  '/:id',
  authenticate,
  requireRole([UserRole.ADMIN, UserRole.INVENTORY_MANAGER]),
  deleteVariant
);

export default router;
