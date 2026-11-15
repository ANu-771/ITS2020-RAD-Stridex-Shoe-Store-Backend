import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../types';
import { GiftVoucherModel, IGiftVoucher } from '../models/giftVoucher.model';
import { VoucherRedemptionModel } from '../models/voucherRedemption.model';
import { UserModel } from '../models/user.model';
import { generateVoucherCode } from '../util/voucherCode.util';
import {
  purchaseVoucherSchema,
  validateVoucherSchema,
  verifyVoucherPaymentSchema,
  revokeVoucherSchema,
} from '../validators/giftVoucher.validator';

const BANK_PAYMENT_INSTRUCTIONS = {
  commercialBank: {
    bankName: 'Commercial Bank of Ceylon',
    accountNumber: '1000-8492-3810',
    accountName: 'STRIDEX Footwear Ltd',
    branch: 'Colombo 03',
  },
  hnb: {
    bankName: 'Hatton National Bank (HNB)',
    accountNumber: '0390-1029-4821',
    accountName: 'STRIDEX Footwear Ltd',
    branch: 'Kollupitiya',
  },
  note: 'Please transfer the exact voucher amount to either corporate bank account and include your registered email or Voucher Reference in the deposit description.',
};

export const giftVoucherController = {
  // =========================================================================
  // 1. CUSTOMER: Purchase Digital Gift Voucher
  // POST /api/v1/vouchers/purchase
  // =========================================================================
  purchase: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'You must be logged in to purchase a digital gift voucher',
        });
      }

      const parsed = purchaseVoucherSchema.parse(req.body);

      // Rule: Cash on Delivery is strictly prohibited for digital vouchers
      if (parsed.paymentMethod === 'CASH_ON_DELIVERY') {
        return res.status(400).json({
          success: false,
          message:
            'Cash on Delivery is not available for digital gift vouchers because there is no physical delivery. Please select Direct Bank Transfer.',
        });
      }

      // Rule: Online Card payment is currently unavailable
      if (parsed.paymentMethod === 'ONLINE_CARD') {
        return res.status(400).json({
          success: false,
          message:
            'Visa, MasterCard and AMEX online payments are currently unavailable. Please select Direct Bank Transfer to purchase your digital voucher.',
        });
      }

      // Check purchaser account exists
      const user = await UserModel.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Purchaser account not found',
        });
      }

      // Create voucher in PENDING_PAYMENT state (No active code generated yet!)
      const voucher = await GiftVoucherModel.create({
        originalValue: parsed.amount,
        remainingBalance: parsed.amount,
        purchaserId: user._id,
        purchaserEmail: user.email.trim().toLowerCase(),
        recipientName: parsed.recipientName.trim(),
        recipientEmail: parsed.recipientEmail.trim().toLowerCase(),
        personalMessage: parsed.personalMessage?.trim() || '',
        purchaseStatus: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
        paymentMethod: 'BANK_TRANSFER',
        bankTransferReference: parsed.bankTransferReference?.trim() || '',
        status: 'PENDING',
      });

      return res.status(201).json({
        success: true,
        message:
          'Gift voucher purchase initiated successfully! Please complete your Direct Bank Transfer to activate your voucher code.',
        data: {
          voucherId: voucher._id,
          amount: voucher.originalValue,
          recipientName: voucher.recipientName,
          recipientEmail: voucher.recipientEmail,
          personalMessage: voucher.personalMessage,
          purchaseStatus: voucher.purchaseStatus,
          paymentStatus: voucher.paymentStatus,
          paymentMethod: voucher.paymentMethod,
          bankInstructions: BANK_PAYMENT_INSTRUCTIONS,
          createdAt: voucher.createdAt,
        },
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: err.issues.map((e) => e.message).join(', '),
          errors: err.issues,
        });
      }
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to initiate gift voucher purchase',
      });
    }
  },

  // =========================================================================
  // 2. CUSTOMER: Get Customer's Vouchers (Purchased & Received)
  // GET /api/v1/vouchers/my-vouchers
  // =========================================================================
  getMyVouchers: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.sub;
      const userEmail = req.user?.email?.trim().toLowerCase();

      if (!userId || !userEmail) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required to view your vouchers',
        });
      }

      // 1. RECIPIENT-ONLY ISSUED VOUCHERS:
      // Filter My Vouchers using the authenticated recipient email.
      // The purchaser's account must NOT show the voucher as an available redeemable voucher.
      const issuedVouchers = await GiftVoucherModel.find({
        recipientEmail: userEmail,
        purchaseStatus: 'COMPLETED',
        code: { $exists: true, $ne: null },
      })
        .sort({ createdAt: -1 })
        .populate('purchaserId', 'fullName email phone');

      // 2. GIFTS PURCHASED FOR OTHERS (For purchaser audit tracking; secret code excluded)
      const purchasedGiftsRaw = await GiftVoucherModel.find({
        $or: [{ purchaserId: userId }, { purchaserEmail: userEmail }],
        recipientEmail: { $ne: userEmail },
        purchaseStatus: 'COMPLETED',
      })
        .sort({ createdAt: -1 })
        .lean();

      // Mask/sanitize so purchaser cannot view or copy recipient's private code
      const purchasedGifts = purchasedGiftsRaw.map((g) => ({
        _id: g._id,
        originalValue: g.originalValue,
        recipientName: g.recipientName,
        recipientEmail: g.recipientEmail,
        personalMessage: g.personalMessage,
        purchaseStatus: g.purchaseStatus,
        paymentStatus: g.paymentStatus,
        status: g.status,
        isIssued: Boolean(g.code),
        issuedAt: g.issuedAt,
        createdAt: g.createdAt,
      }));

      // 3. PENDING BANK PAYMENT PURCHASES (Initiated by this user)
      const pendingPurchases = await GiftVoucherModel.find({
        $or: [{ purchaserId: userId }, { purchaserEmail: userEmail }],
        purchaseStatus: 'PENDING_PAYMENT',
      }).sort({ createdAt: -1 });

      return res.status(200).json({
        success: true,
        data: {
          issuedVouchers, // Only vouchers where authenticated customer is the recipient
          purchasedGifts, // Gifts sent to other people (purchaser tracking)
          pendingPurchases, // Pending bank deposit purchases
          totalIssued: issuedVouchers.length,
          totalPurchasedGifts: purchasedGifts.length,
          totalPending: pendingPurchases.length,
          bankInstructions: BANK_PAYMENT_INSTRUCTIONS,
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to fetch customer vouchers',
      });
    }
  },

  // =========================================================================
  // 3. CUSTOMER / ADMIN: Get Voucher Details by ID
  // GET /api/v1/vouchers/:id
  // =========================================================================
  getVoucherById: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user?.sub;
      const userRole = req.user?.role;
      const userEmail = req.user?.email?.trim().toLowerCase();

      const voucher = await GiftVoucherModel.findById(id).populate(
        'purchaserId',
        'fullName email phone'
      );

      if (!voucher) {
        return res.status(404).json({
          success: false,
          message: 'Digital gift voucher not found',
        });
      }

      // Check authorization: must be recipient, purchaser, or admin
      const isPurchaser =
        voucher.purchaserId?._id?.toString() === userId ||
        voucher.purchaserId?.toString() === userId ||
        voucher.purchaserEmail?.trim().toLowerCase() === userEmail;
      const isRecipient = voucher.recipientEmail.trim().toLowerCase() === userEmail;
      const isAdmin = userRole === 'ADMIN';

      if (!isPurchaser && !isRecipient && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to view this gift voucher',
        });
      }

      // If voucher has been redeemed, fetch redemption records
      const redemptions = await VoucherRedemptionModel.find({ voucherId: voucher._id })
        .sort({ redeemedAt: -1 })
        .populate('orderId', 'orderNumber finalTotal createdAt');

      const voucherObj = voucher.toObject();
      // Only the intended recipient and administrators can view the secret redeemable code
      if (!isRecipient && !isAdmin) {
        delete (voucherObj as any).code;
      }

      return res.status(200).json({
        success: true,
        data: {
          voucher: voucherObj,
          redemptions: isRecipient || isAdmin ? redemptions : [],
          bankInstructions: voucher.purchaseStatus === 'PENDING_PAYMENT' ? BANK_PAYMENT_INSTRUCTIONS : undefined,
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to fetch voucher details',
      });
    }
  },

  // =========================================================================
  // 4. CHECKOUT / CUSTOMER: Validate Voucher Code for Checkout
  // POST /api/v1/vouchers/validate
  // =========================================================================
  validateVoucher: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userEmail = req.user?.email?.trim().toLowerCase();
      if (!userEmail) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required. Please sign in to apply a gift voucher.',
        });
      }

      const parsed = validateVoucherSchema.parse(req.body);
      const code = parsed.code.trim().toUpperCase();
      const orderSubtotal = parsed.orderSubtotal || 0;

      // 1. Look up voucher by unique code
      const voucher = await GiftVoucherModel.findOne({ code });
      if (!voucher) {
        return res.status(404).json({
          success: false,
          message: `Voucher code "${code}" is invalid or does not exist`,
        });
      }

      // 2. RECIPIENT-ONLY REDEMPTION SECURITY CHECK
      // Match the authenticated user's verified account email against the voucher's recipient email
      if (voucher.recipientEmail.trim().toLowerCase() !== userEmail) {
        return res.status(403).json({
          success: false,
          message: 'This gift voucher is assigned to another recipient and cannot be redeemed using your account.',
        });
      }

      // 3. Check payment & purchase status
      if (voucher.purchaseStatus !== 'COMPLETED' || voucher.paymentStatus !== 'PAID') {
        return res.status(400).json({
          success: false,
          message: 'This gift voucher is currently pending bank payment verification and is not yet active',
        });
      }

      // 4. Check voucher status
      if (voucher.status === 'REVOKED') {
        return res.status(400).json({
          success: false,
          message: `This gift voucher has been revoked: ${voucher.revocationReason || 'Contact STRIDEX customer care'}`,
        });
      }

      if (voucher.status === 'EXPIRED') {
        return res.status(400).json({
          success: false,
          message: 'This gift voucher has expired',
        });
      }

      if (voucher.status === 'USED' || voucher.remainingBalance <= 0) {
        return res.status(400).json({
          success: false,
          message: 'This gift voucher has already been fully redeemed (remaining balance: Rs. 0.00)',
        });
      }

      if (voucher.status !== 'ACTIVE') {
        return res.status(400).json({
          success: false,
          message: `This gift voucher is not active (current status: ${voucher.status})`,
        });
      }

      // 5. Check expiry date
      if (voucher.expiresAt && new Date(voucher.expiresAt) < new Date()) {
        voucher.status = 'EXPIRED';
        await voucher.save();
        return res.status(400).json({
          success: false,
          message: 'This gift voucher has expired',
        });
      }

      // 6. Calculate applicable discount and remaining balance
      const applicableDiscount = Math.min(voucher.remainingBalance, orderSubtotal);
      const remainingPayable = Math.max(0, orderSubtotal - applicableDiscount);
      const newVoucherBalanceAfterRedemption = voucher.remainingBalance - applicableDiscount;

      return res.status(200).json({
        success: true,
        message: 'Gift voucher applied successfully!',
        data: {
          valid: true,
          voucherId: voucher._id,
          code: voucher.code,
          originalValue: voucher.originalValue,
          remainingBalance: voucher.remainingBalance,
          applicableDiscount,
          remainingPayable,
          newVoucherBalanceAfterRedemption,
          recipientName: voucher.recipientName,
          expiresAt: voucher.expiresAt,
        },
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: err.issues.map((e) => e.message).join(', '),
        });
      }
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to validate gift voucher',
      });
    }
  },

  // =========================================================================
  // 5. ADMIN: List All Gift Vouchers with Analytics & Filtering
  // GET /api/v1/admin/vouchers
  // =========================================================================
  getAdminVouchers: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status, paymentStatus, purchaseStatus, search, page = '1', limit = '15' } = req.query;

      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 15));
      const skip = (pageNum - 1) * limitNum;

      // Build search query
      const query: any = {};

      if (status && status !== 'ALL') {
        query.status = status;
      }
      if (paymentStatus && paymentStatus !== 'ALL') {
        query.paymentStatus = paymentStatus;
      }
      if (purchaseStatus && purchaseStatus !== 'ALL') {
        query.purchaseStatus = purchaseStatus;
      }

      if (search) {
        const searchRegex = new RegExp(String(search).trim(), 'i');
        query.$or = [
          { code: searchRegex },
          { recipientName: searchRegex },
          { recipientEmail: searchRegex },
          { bankTransferReference: searchRegex },
        ];
      }

      const [vouchers, totalCount] = await Promise.all([
        GiftVoucherModel.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .populate('purchaserId', 'fullName email phone'),
        GiftVoucherModel.countDocuments(query),
      ]);

      // Calculate aggregated metrics for the Admin Dashboard
      const [
        totalPurchases,
        pendingVerification,
        issuedActive,
        fullyRedeemed,
        revokedOrExpired,
        allVouchersSummary,
      ] = await Promise.all([
        GiftVoucherModel.countDocuments(),
        GiftVoucherModel.countDocuments({ purchaseStatus: 'PENDING_PAYMENT' }),
        GiftVoucherModel.countDocuments({ status: 'ACTIVE' }),
        GiftVoucherModel.countDocuments({ status: 'USED' }),
        GiftVoucherModel.countDocuments({ status: { $in: ['REVOKED', 'EXPIRED'] } }),
        GiftVoucherModel.aggregate([
          {
            $group: {
              _id: null,
              totalIssuedValue: {
                $sum: {
                  $cond: [{ $eq: ['$paymentStatus', 'PAID'] }, '$originalValue', 0],
                },
              },
              totalRemainingBalance: {
                $sum: {
                  $cond: [{ $eq: ['$status', 'ACTIVE'] }, '$remainingBalance', 0],
                },
              },
            },
          },
        ]),
      ]);

      const totalIssuedValue = allVouchersSummary[0]?.totalIssuedValue || 0;
      const totalRemainingBalance = allVouchersSummary[0]?.totalRemainingBalance || 0;
      const totalRedeemedValue = Math.max(0, totalIssuedValue - totalRemainingBalance);

      return res.status(200).json({
        success: true,
        data: {
          vouchers,
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalItems: totalCount,
            totalPages: Math.ceil(totalCount / limitNum),
          },
          metrics: {
            totalPurchases,
            pendingVerification,
            issuedActive,
            fullyRedeemed,
            revokedOrExpired,
            totalIssuedValue,
            totalRedeemedValue,
            totalRemainingBalance,
          },
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to fetch admin gift vouchers',
      });
    }
  },

  // =========================================================================
  // 6. ADMIN: Verify Bank Payment & Issue Voucher Code
  // PATCH /api/v1/admin/vouchers/:id/verify-payment
  // =========================================================================
  verifyPaymentAndIssue: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = verifyVoucherPaymentSchema.parse(req.body);

      const voucher = await GiftVoucherModel.findById(id);
      if (!voucher) {
        return res.status(404).json({
          success: false,
          message: 'Digital gift voucher not found',
        });
      }

      if (voucher.purchaseStatus === 'COMPLETED' && voucher.paymentStatus === 'PAID') {
        return res.status(400).json({
          success: false,
          message: `This voucher payment has already been verified and issued under code ${voucher.code}`,
        });
      }

      if (voucher.status === 'REVOKED') {
        return res.status(400).json({
          success: false,
          message: 'Cannot verify payment for a revoked voucher',
        });
      }

      // Generate a unique digital voucher code (STRIDEX-XXXX-XXXX-XXXX)
      let uniqueCode = '';
      let isUnique = false;
      let attempts = 0;

      while (!isUnique && attempts < 10) {
        uniqueCode = generateVoucherCode();
        const existing = await GiftVoucherModel.findOne({ code: uniqueCode });
        if (!existing) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        throw new Error('Could not generate a unique voucher code. Please try again.');
      }

      // Issue and activate the voucher for 1 year (365 days)
      const now = new Date();
      const oneYearExpiry = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

      voucher.code = uniqueCode;
      voucher.purchaseStatus = 'COMPLETED';
      voucher.paymentStatus = 'PAID';
      voucher.status = 'ACTIVE';
      voucher.issuedAt = now;
      voucher.expiresAt = oneYearExpiry;
      voucher.adminNotes = parsed.adminNotes || 'Bank payment verified by administrator';

      await voucher.save();

      return res.status(200).json({
        success: true,
        message: `Payment verified successfully! Digital voucher ${voucher.code} is now active and ready for redemption.`,
        data: voucher,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: err.issues.map((e) => e.message).join(', '),
        });
      }
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to verify payment and issue voucher',
      });
    }
  },

  // =========================================================================
  // 7. ADMIN: Revoke Voucher
  // PATCH /api/v1/admin/vouchers/:id/revoke
  // =========================================================================
  revoke: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = revokeVoucherSchema.parse(req.body);

      const voucher = await GiftVoucherModel.findById(id);
      if (!voucher) {
        return res.status(404).json({
          success: false,
          message: 'Digital gift voucher not found',
        });
      }

      if (voucher.status === 'REVOKED') {
        return res.status(400).json({
          success: false,
          message: 'This voucher is already revoked',
        });
      }

      voucher.status = 'REVOKED';
      voucher.revokedAt = new Date();
      voucher.revocationReason = parsed.reason;

      await voucher.save();

      return res.status(200).json({
        success: true,
        message: `Voucher ${voucher.code || voucher._id} has been revoked successfully`,
        data: voucher,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: err.issues.map((e) => e.message).join(', '),
        });
      }
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to revoke voucher',
      });
    }
  },

  // =========================================================================
  // 8. ADMIN: View Voucher Redemptions
  // GET /api/v1/admin/vouchers/:id/redemptions
  // =========================================================================
  getRedemptions: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const redemptions = await VoucherRedemptionModel.find({ voucherId: id })
        .sort({ redeemedAt: -1 })
        .populate('customerId', 'fullName email')
        .populate('orderId', 'orderNumber finalTotal createdAt');

      return res.status(200).json({
        success: true,
        data: redemptions,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to fetch voucher redemption history',
      });
    }
  },
};
