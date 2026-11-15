import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../types';
import { ProductModel } from '../models/product.model';
import { ProductVariantModel } from '../models/productVariant.model';
import { StockMovementModel } from '../models/stockMovement.model';
import { stockAdjustmentSchema, updateThresholdSchema } from '../validators/inventory.validator';

export const inventoryController = {
  // GET /api/v1/inventory/dashboard
  getDashboardStats: async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const variants = await ProductVariantModel.find({ isActive: true }).populate(
        'productId',
        'name basePrice brandId categoryId images'
      );

      const totalVariants = variants.length;
      let availableStock = 0;
      let lowStockCount = 0;
      let outOfStockCount = 0;
      let totalStockValueLKR = 0;

      for (const v of variants) {
        availableStock += v.stockQuantity;
        const threshold = v.minStockThreshold ?? 5;
        if (v.stockQuantity === 0) {
          outOfStockCount++;
        } else if (v.stockQuantity <= threshold) {
          lowStockCount++;
        }

        const prod = v.productId as any;
        const price = prod?.basePrice || 0;
        totalStockValueLKR += price * v.stockQuantity;
      }

      // Recent 15 movements
      const recentMovements = await StockMovementModel.find()
        .sort({ createdAt: -1 })
        .limit(15)
        .populate('productId', 'name slug images')
        .populate('variantId', 'SKU size color minStockThreshold')
        .populate('performedBy', 'fullName email role');

      return res.status(200).json({
        success: true,
        data: {
          totalVariants,
          availableStock,
          lowStockCount,
          outOfStockCount,
          totalStockValueLKR,
          recentMovements,
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to load inventory dashboard metrics',
      });
    }
  },

  // GET /api/v1/inventory/variants
  getVariants: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.max(1, parseInt(req.query.limit as string, 10) || 20);
      const search = (req.query.search as string || '').trim().toLowerCase();
      const statusFilter = (req.query.status as string || 'ALL').toUpperCase();

      // Find all active products or filtered by search if needed
      let productFilter: any = { isActive: true };
      if (search) {
        productFilter = {
          isActive: true,
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { slug: { $regex: search, $options: 'i' } },
          ],
        };
      }

      const matchingProducts = await ProductModel.find(productFilter, '_id name basePrice images');
      const matchingProductIds = matchingProducts.map((p) => p._id);

      const variantQuery: any = {
        isActive: true,
        $or: [
          { productId: { $in: matchingProductIds } },
          { SKU: { $regex: search, $options: 'i' } },
          { color: { $regex: search, $options: 'i' } },
          { size: isNaN(Number(search)) ? search : Number(search) },
        ],
      };

      if (!search) {
        delete variantQuery.$or;
      }

      const allVariants = await ProductVariantModel.find(variantQuery)
        .populate('productId', 'name slug basePrice images brandId categoryId')
        .sort({ updatedAt: -1 });

      // Apply status filter based on configurable threshold
      const filtered = allVariants.filter((v) => {
        const threshold = v.minStockThreshold ?? 5;
        if (statusFilter === 'OUT_OF_STOCK') return v.stockQuantity === 0;
        if (statusFilter === 'LOW_STOCK') return v.stockQuantity > 0 && v.stockQuantity <= threshold;
        if (statusFilter === 'IN_STOCK') return v.stockQuantity > threshold;
        return true;
      });

      const totalItems = filtered.length;
      const paginated = filtered.slice((page - 1) * limit, page * limit);

      return res.status(200).json({
        success: true,
        data: paginated.map((v) => {
          const threshold = v.minStockThreshold ?? 5;
          let stockStatus = 'HEALTHY';
          if (v.stockQuantity === 0) stockStatus = 'OUT_OF_STOCK';
          else if (v.stockQuantity <= threshold) stockStatus = 'LOW_STOCK';

          return {
            ...v.toJSON(),
            stockStatus,
            effectiveThreshold: threshold,
          };
        }),
        pagination: {
          page,
          limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to retrieve inventory variants',
      });
    }
  },

  // POST /api/v1/inventory/adjust
  adjustStock: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = stockAdjustmentSchema.parse(req.body);
      const userId = req.user?.sub;

      const variant = await ProductVariantModel.findById(parsed.variantId);
      if (!variant) {
        return res.status(404).json({ success: false, message: 'Shoe variant not found' });
      }

      const previousQuantity = variant.stockQuantity;
      let changedQuantity = 0;
      let newQuantity = previousQuantity;

      if (parsed.movementType === 'STOCK_IN') {
        changedQuantity = parsed.quantity;
        newQuantity = previousQuantity + parsed.quantity;
      } else if (parsed.movementType === 'STOCK_OUT' || parsed.movementType === 'DAMAGED') {
        if (previousQuantity < parsed.quantity) {
          return res.status(400).json({
            success: false,
            message: `Cannot deduct ${parsed.quantity} pairs. Available stock is only ${previousQuantity}.`,
          });
        }
        changedQuantity = -parsed.quantity;
        newQuantity = previousQuantity - parsed.quantity;
      } else if (parsed.movementType === 'ADJUSTMENT') {
        changedQuantity = parsed.quantity - previousQuantity;
        newQuantity = parsed.quantity;
      }

      // Update variant stock atomically
      variant.stockQuantity = newQuantity;
      await variant.save();

      // Log immutable audit movement
      const movement = await StockMovementModel.create({
        productId: variant.productId,
        variantId: variant._id,
        movementType: parsed.movementType,
        previousQuantity,
        changedQuantity,
        newQuantity,
        reason: parsed.reason,
        performedBy: userId,
      });

      const populatedMovement = await StockMovementModel.findById(movement._id)
        .populate('productId', 'name')
        .populate('variantId', 'SKU size color')
        .populate('performedBy', 'fullName email');

      return res.status(200).json({
        success: true,
        message: `Inventory updated successfully: ${parsed.movementType} (${changedQuantity > 0 ? '+' : ''}${changedQuantity} pairs)`,
        data: {
          variant: variant.toJSON(),
          movement: populatedMovement,
        },
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: err.issues.map((e: any) => e.message).join(', '),
        });
      }
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to perform stock adjustment',
      });
    }
  },

  // PATCH /api/v1/inventory/variants/:id/threshold
  updateThreshold: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = updateThresholdSchema.parse(req.body);

      const variant = await ProductVariantModel.findByIdAndUpdate(
        id,
        { minStockThreshold: parsed.minStockThreshold },
        { new: true }
      );

      if (!variant) {
        return res.status(404).json({ success: false, message: 'Variant not found' });
      }

      return res.status(200).json({
        success: true,
        message: `Minimum stock alert threshold updated to ${parsed.minStockThreshold}`,
        data: variant,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: err.issues.map((e: any) => e.message).join(', '),
        });
      }
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to update threshold',
      });
    }
  },

  // GET /api/v1/inventory/movements
  getMovements: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.max(1, parseInt(req.query.limit as string, 10) || 20);
      const type = req.query.type as string;

      const query: any = {};
      if (type && type !== 'ALL') {
        query.movementType = type;
      }

      const totalItems = await StockMovementModel.countDocuments(query);
      const movements = await StockMovementModel.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('productId', 'name slug images')
        .populate('variantId', 'SKU size color')
        .populate('performedBy', 'fullName email role');

      return res.status(200).json({
        success: true,
        data: movements,
        pagination: {
          page,
          limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to retrieve stock movement history',
      });
    }
  },

  // GET /api/v1/inventory/low-stock-report
  getLowStockReport: async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const variants = await ProductVariantModel.find({ isActive: true })
        .populate('productId', 'name slug basePrice images')
        .sort({ stockQuantity: 1 });

      const lowStockVariants = variants
        .filter((v) => v.stockQuantity <= (v.minStockThreshold ?? 5))
        .map((v) => ({
          ...v.toJSON(),
          severity: v.stockQuantity === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
        }));

      return res.status(200).json({
        success: true,
        data: lowStockVariants,
        total: lowStockVariants.length,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to generate low-stock report',
      });
    }
  },
};
