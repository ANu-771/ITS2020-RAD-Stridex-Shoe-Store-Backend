import { Router } from 'express';
import { botSettingController } from '../controllers/botSetting.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { UserRole } from '../models/user.model';

const router = Router();

// Strictly ADMIN only
router.use(authenticate, requireRole([UserRole.ADMIN]));

router.get('/settings', botSettingController.getSettings);
router.patch('/settings', botSettingController.updateSettings);

export default router;
