import { Request, Response } from 'express';
import { z } from 'zod';
import { CouponModel } from '../models/coupon.model';
import { createCouponSchema, updateCouponSchema, validateCouponSchema } from '../validators/coupon.validator';

export const couponController = {
  // GET /api/v1/coupons
  getAllCoupons: async (_req: Request, res: Response) => {
    try {
      const coupons = await CouponModel.find().sort({ createdAt: -1 });
      return res.status(200).json({ success: true, data: coupons });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message || 'Failed to fetch coupons' });
    }
  },

  // POST /api/v1/coupons
  createCoupon: async (req: Request, res: Response) => {
    try {
      const parsed = createCouponSchema.parse(req.body);
      const existing = await CouponModel.findOne({ code: parsed.code });
      if (existing) {
        return res.status(400).json({ success: false, message: `Coupon "${parsed.code}" already exists` });
      }

      const coupon = await CouponModel.create({
        ...parsed,
        startDate: parsed.startDate ? new Date(parsed.startDate) : new Date(),
        endDate: new Date(parsed.endDate),
      });

      return res.status(201).json({ success: true, message: 'Coupon created successfully', data: coupon });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: err.issues.map((e: any) => e.message).join(', '),
        });
      }
      return res.status(500).json({ success: false, message: err.message || 'Failed to create coupon' });
    }
  },

  // PUT /api/v1/coupons/:id
  updateCoupon: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = updateCouponSchema.parse(req.body);

      const updateData: any = { ...parsed };
      if (parsed.startDate) updateData.startDate = new Date(parsed.startDate);
      if (parsed.endDate) updateData.endDate = new Date(parsed.endDate);

      const coupon = await CouponModel.findByIdAndUpdate(id, updateData, { new: true });
      if (!coupon) {
        return res.status(404).json({ success: false, message: 'Coupon not found' });
      }

      return res.status(200).json({ success: true, message: 'Coupon updated successfully', data: coupon });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: err.issues.map((e: any) => e.message).join(', '),
        });
      }
      return res.status(500).json({ success: false, message: err.message || 'Failed to update coupon' });
    }
  },

  // DELETE /api/v1/coupons/:id
  deleteCoupon: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const coupon = await CouponModel.findByIdAndDelete(id);
      if (!coupon) {
        return res.status(404).json({ success: false, message: 'Coupon not found' });
      }
      return res.status(200).json({ success: true, message: 'Coupon removed successfully' });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message || 'Failed to delete coupon' });
    }
  },

  // POST /api/v1/coupons/validate
  validateCoupon: async (req: Request, res: Response) => {
    try {
      const { code, orderAmount } = validateCouponSchema.parse(req.body);
      const coupon = await CouponModel.findOne({ code, isActive: true });

      if (!coupon) {
        return res.status(404).json({ success: false, message: 'Invalid coupon code or expired' });
      }

      const now = new Date();
      if (now < coupon.startDate || now > coupon.endDate) {
        return res.status(400).json({ success: false, message: 'This coupon has expired' });
      }

      if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
        return res.status(400).json({ success: false, message: 'Coupon usage limit has been reached' });
      }

      if (orderAmount < coupon.minOrderAmount) {
        return res.status(400).json({
          success: false,
          message: `Minimum order of Rs. ${coupon.minOrderAmount.toLocaleString()} required for this coupon`,
        });
      }

      let discountAmount = 0;
      if (coupon.discountType === 'PERCENTAGE') {
        discountAmount = (orderAmount * coupon.discountValue) / 100;
        if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
          discountAmount = coupon.maxDiscountAmount;
        }
      } else {
        discountAmount = Math.min(orderAmount, coupon.discountValue);
      }

      return res.status(200).json({
        success: true,
        message: 'Coupon applied successfully',
        data: {
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          discountAmount: Math.round(discountAmount),
          finalAmount: Math.max(0, Math.round(orderAmount - discountAmount)),
        },
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: err.issues.map((e: any) => e.message).join(', '),
        });
      }
      return res.status(500).json({ success: false, message: err.message || 'Failed to validate coupon' });
    }
  },
};
