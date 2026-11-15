import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../types';
import { ReviewModel } from '../models/review.model';
import { ProductModel } from '../models/product.model';
import { createReviewSchema, updateReviewStatusSchema } from '../validators/review.validator';

export const reviewController = {
  // GET /api/v1/reviews
  getReviews: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { productId, status } = req.query;
      const query: any = {};

      if (productId) {
        query.productId = productId;
      }

      // If user is not admin, only show APPROVED reviews
      if (req.user?.role !== 'ADMIN') {
        query.status = 'APPROVED';
      } else if (status) {
        query.status = status;
      }

      const reviews = await ReviewModel.find(query)
        .sort({ createdAt: -1 })
        .populate('userId', 'fullName email')
        .populate('productId', 'name slug images');

      return res.status(200).json({ success: true, data: reviews });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message || 'Failed to fetch reviews' });
    }
  },

  // POST /api/v1/reviews
  createReview: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.sub;
      const parsed = createReviewSchema.parse(req.body);

      const product = await ProductModel.findById(parsed.productId);
      if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }

      const review = await ReviewModel.create({
        ...parsed,
        userId,
        status: 'APPROVED', // Default approved, admin can moderate
      });

      const populated = await ReviewModel.findById(review._id)
        .populate('userId', 'fullName')
        .populate('productId', 'name');

      return res.status(201).json({
        success: true,
        message: 'Review submitted successfully',
        data: populated,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: err.issues.map((e: any) => e.message).join(', '),
        });
      }
      return res.status(500).json({ success: false, message: err.message || 'Failed to submit review' });
    }
  },

  // PATCH /api/v1/reviews/:id/status
  updateReviewStatus: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = updateReviewStatusSchema.parse(req.body);

      const review = await ReviewModel.findByIdAndUpdate(id, { status }, { new: true });
      if (!review) {
        return res.status(404).json({ success: false, message: 'Review not found' });
      }

      return res.status(200).json({
        success: true,
        message: `Review marked as ${status}`,
        data: review,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: err.issues.map((e: any) => e.message).join(', '),
        });
      }
      return res.status(500).json({ success: false, message: err.message || 'Failed to update review status' });
    }
  },

  // DELETE /api/v1/reviews/:id
  deleteReview: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const review = await ReviewModel.findByIdAndDelete(id);
      if (!review) {
        return res.status(404).json({ success: false, message: 'Review not found' });
      }
      return res.status(200).json({ success: true, message: 'Review deleted successfully' });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message || 'Failed to delete review' });
    }
  },
};
