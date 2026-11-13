import { Router } from 'express';
import {
  getAllBrands,
  getBrandById,
  createBrand,
  updateBrand,
  deleteBrand,
} from '../controllers/brand.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { validate } from '../middleware/validate';
import { UserRole } from '../models/user.model';
import {
  createBrandSchema,
  updateBrandSchema,
} from '../validators/brand.validator';

const router = Router();

// Public routes
router.get('/', getAllBrands);
router.get('/:id', getBrandById);

// Admin-only management routes
router.post(
  '/',
  authenticate,
  requireRole([UserRole.ADMIN]),
  validate(createBrandSchema),
  createBrand
);

router.put(
  '/:id',
  authenticate,
  requireRole([UserRole.ADMIN]),
  validate(updateBrandSchema),
  updateBrand
);

router.delete(
  '/:id',
  authenticate,
  requireRole([UserRole.ADMIN]),
  deleteBrand
);

export default router;
