import { Request, Response } from 'express';
import { ProductVariantModel } from '../models/productVariant.model';
import { ProductModel } from '../models/product.model';

// GET /api/v1/variants/product/:productId
export const getVariantsByProduct = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const variants = await ProductVariantModel.find({ productId }).sort({
      size: 1,
      color: 1,
    });

    res.status(200).json({
      success: true,
      data: variants.map((v) => v.toJSON()),
      total: variants.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch variants',
      error: error.message,
    });
  }
};

// GET /api/v1/variants/:id
export const getVariantById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const variant = await ProductVariantModel.findById(id).populate('productId', 'name slug basePrice discountPrice images');

    if (!variant) {
      return res.status(404).json({
        success: false,
        message: 'Product variant not found',
      });
    }

    res.status(200).json({
      success: true,
      data: variant.toJSON(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch variant',
      error: error.message,
    });
  }
};

// POST /api/v1/variants
export const createVariant = async (req: Request, res: Response) => {
  try {
    const {
      productId,
      SKU,
      size,
      color,
      stockQuantity,
      reservedQuantity,
      isActive,
    } = req.body;

    // Verify product exists
    const product = await ProductModel.findById(productId);
    if (!product) {
      return res.status(400).json({
        success: false,
        message: 'Parent product does not exist',
      });
    }

    // Check SKU uniqueness
    const existingSku = await ProductVariantModel.findOne({ SKU: SKU.toUpperCase() });
    if (existingSku) {
      return res.status(400).json({
        success: false,
        message: `SKU '${SKU.toUpperCase()}' is already in use`,
      });
    }

    // Check duplicate combination of (productId, size, color)
    const existingCombination = await ProductVariantModel.findOne({
      productId,
      size,
      color: { $regex: new RegExp(`^${color}$`, 'i') },
    });

    if (existingCombination) {
      return res.status(400).json({
        success: false,
        message: `A variant for Size ${size} and Color '${color}' already exists for this shoe`,
      });
    }

    const variant = new ProductVariantModel({
      productId,
      SKU: SKU.toUpperCase(),
      size,
      color,
      stockQuantity: Number(stockQuantity) || 0,
      reservedQuantity: Number(reservedQuantity) || 0,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    await variant.save();

    res.status(201).json({
      success: true,
      message: 'Product variant created successfully',
      data: variant.toJSON(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to create product variant',
      error: error.message,
    });
  }
};

// PUT /api/v1/variants/:id
export const updateVariant = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const variant = await ProductVariantModel.findById(id);

    if (!variant) {
      return res.status(404).json({
        success: false,
        message: 'Product variant not found',
      });
    }

    const { SKU, size, color, stockQuantity, reservedQuantity, isActive } = req.body;

    // SKU uniqueness check if changed
    if (SKU && SKU.toUpperCase() !== variant.SKU) {
      const duplicateSku = await ProductVariantModel.findOne({
        _id: { $ne: id },
        SKU: SKU.toUpperCase(),
      });
      if (duplicateSku) {
        return res.status(400).json({
          success: false,
          message: `SKU '${SKU.toUpperCase()}' is already in use by another variant`,
        });
      }
      variant.SKU = SKU.toUpperCase();
    }

    // Combination uniqueness check if size or color changed
    const targetSize = size !== undefined ? size : variant.size;
    const targetColor = color !== undefined ? color : variant.color;

    if (size !== undefined || color !== undefined) {
      const duplicateCombination = await ProductVariantModel.findOne({
        _id: { $ne: id },
        productId: variant.productId,
        size: targetSize,
        color: { $regex: new RegExp(`^${targetColor}$`, 'i') },
      });

      if (duplicateCombination) {
        return res.status(400).json({
          success: false,
          message: `Another variant with Size ${targetSize} and Color '${targetColor}' already exists for this product`,
        });
      }

      variant.size = targetSize;
      variant.color = targetColor;
    }

    if (stockQuantity !== undefined) variant.stockQuantity = Number(stockQuantity);
    if (reservedQuantity !== undefined) variant.reservedQuantity = Number(reservedQuantity);
    if (isActive !== undefined) variant.isActive = Boolean(isActive);

    await variant.save();

    res.status(200).json({
      success: true,
      message: 'Product variant updated successfully',
      data: variant.toJSON(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to update product variant',
      error: error.message,
    });
  }
};

// DELETE /api/v1/variants/:id
export const deleteVariant = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const variant = await ProductVariantModel.findById(id);

    if (!variant) {
      return res.status(404).json({
        success: false,
        message: 'Product variant not found',
      });
    }

    await ProductVariantModel.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Product variant deleted successfully',
      data: { id },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete product variant',
      error: error.message,
    });
  }
};
