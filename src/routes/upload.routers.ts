import { Router } from 'express';
import {
  handleSingleUpload,
  handleMultipleUpload,
} from '../controllers/upload.controller';
import { upload } from '../middleware/upload';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { UserRole } from '../models/user.model';

const router = Router();

// Single image upload
router.post(
  '/single',
  authenticate,
  requireRole([UserRole.ADMIN, UserRole.INVENTORY_MANAGER]),
  upload.single('image'),
  handleSingleUpload
);

// Multiple images upload (up to 5 images)
router.post(
  '/multiple',
  authenticate,
  requireRole([UserRole.ADMIN, UserRole.INVENTORY_MANAGER]),
  upload.array('images', 5),
  handleMultipleUpload
);

export default router;
