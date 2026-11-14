import { Router } from 'express';
import {
  handleSingleUpload,
  handleMultipleUpload,
  handleDeleteUpload,
} from '../controllers/upload.controller';
import { upload } from '../middleware/upload';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { UserRole } from '../models/user.model';

const router = Router();

// Single image upload to Supabase Storage
router.post(
  '/single',
  authenticate,
  requireRole([UserRole.ADMIN, UserRole.INVENTORY_MANAGER]),
  upload.single('image'),
  handleSingleUpload
);

// Multiple images upload to Supabase Storage (up to 5 images)
router.post(
  '/multiple',
  authenticate,
  requireRole([UserRole.ADMIN, UserRole.INVENTORY_MANAGER]),
  upload.array('images', 5),
  handleMultipleUpload
);

// Delete uploaded image from Supabase Storage
router.delete(
  '/',
  authenticate,
  requireRole([UserRole.ADMIN, UserRole.INVENTORY_MANAGER]),
  handleDeleteUpload
);

export default router;
