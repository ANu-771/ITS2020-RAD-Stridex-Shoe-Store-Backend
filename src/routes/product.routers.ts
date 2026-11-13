import { Router } from 'express';
import {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../controllers/product.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { validate } from '../middleware/validate';
import { UserRole } from '../models/user.model';
import {
  createProductSchema,
  updateProductSchema,
} from '../validators/product.validator';

const router = Router();

// Public routes
router.get('/', getAllProducts);
router.get('/:id', getProductById);

// Admin-only management routes
router.post(
  '/',
  authenticate,
  requireRole([UserRole.ADMIN]),
  validate(createProductSchema),
  createProduct
);

router.put(
  '/:id',
  authenticate,
  requireRole([UserRole.ADMIN]),
  validate(updateProductSchema),
  updateProduct
);

router.delete(
  '/:id',
  authenticate,
  requireRole([UserRole.ADMIN]),
  deleteProduct
);

export default router;
