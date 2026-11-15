import { Router } from 'express';
import { reviewController } from '../controllers/review.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { UserRole } from '../models/user.model';

const router = Router();

// Public / Authenticated read reviews
router.get('/', reviewController.getReviews);

// Customer submits review
router.post('/', authenticate, reviewController.createReview);

// Admin-only review moderation
router.patch('/:id/status', authenticate, requireRole([UserRole.ADMIN]), reviewController.updateReviewStatus);
router.delete('/:id', authenticate, requireRole([UserRole.ADMIN]), reviewController.deleteReview);

export default router;
