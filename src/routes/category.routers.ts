import { Router } from 'express';
import {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/category.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { validate } from '../middleware/validate';
import { UserRole } from '../models/user.model';
import {
  createCategorySchema,
  updateCategorySchema,
} from '../validators/category.validator';

const router = Router();

// Public routes
router.get('/', getAllCategories);
router.get('/:id', getCategoryById);

// Admin-only management routes
router.post(
  '/',
  authenticate,
  requireRole([UserRole.ADMIN]),
  validate(createCategorySchema),
  createCategory
);

router.put(
  '/:id',
  authenticate,
  requireRole([UserRole.ADMIN]),
  validate(updateCategorySchema),
  updateCategory
);

router.delete(
  '/:id',
  authenticate,
  requireRole([UserRole.ADMIN]),
  deleteCategory
);

export default router;
