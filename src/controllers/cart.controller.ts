import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../types';
import { CartModel } from '../models/cart.model';
import { ProductModel } from '../models/product.model';
import { ProductVariantModel } from '../models/productVariant.model';
import { addToCartSchema, updateCartItemSchema, syncCartSchema } from '../validators/cart.validator';

const FREE_SHIPPING_THRESHOLD = 15000; // in LKR
const STANDARD_DELIVERY_FEE = 650; // in LKR

// Helper to calculate totals from populated cart
export const computeCartTotals = (items: any[]) => {
  let subtotal = 0;
  const formattedItems = [];

  for (const item of items) {
    const product = item.productId;
    const variant = item.variantId;

    if (!product || !variant) continue;

    const unitPrice =
      product.discountPrice && product.discountPrice > 0 && product.discountPrice < product.basePrice
        ? product.discountPrice
        : product.basePrice;

    const itemTotal = unitPrice * item.quantity;
    subtotal += itemTotal;

    const availableStock = Math.max(0, variant.stockQuantity - (variant.reservedQuantity || 0));

    formattedItems.push({
      id: item._id?.toString() || `${product._id}-${variant.size}-${variant.color}`,
      itemId: item._id?.toString(),
      productId: product._id?.toString(),
      variantId: variant._id?.toString(),
      name: product.name,
      slug: product.slug,
      image: product.images?.[0] || '',
      brandName: product.brandId?.name || 'STRIDEX',
      size: item.size,
      color: item.color,
      price: unitPrice,
      originalPrice: product.discountPrice ? product.basePrice : undefined,
      quantity: item.quantity,
      maxStock: availableStock,
      totalPrice: itemTotal,
      isAvailable: availableStock >= item.quantity && variant.isActive && product.isActive,
    });
  }

  const deliveryFee = subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : STANDARD_DELIVERY_FEE;
  const finalTotal = subtotal + deliveryFee;

  return {
    items: formattedItems,
    subtotal,
    deliveryFee,
    finalTotal,
    freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
    qualifiesForFreeShipping: subtotal >= FREE_SHIPPING_THRESHOLD,
  };
};

export const cartController = {
  // GET /api/v1/cart - Retrieve customer's active shopping cart
  getCart: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required to access shopping cart',
        });
      }

      let cart = await CartModel.findOne({ userId })
        .populate({
          path: 'items.productId',
          populate: { path: 'brandId', select: 'name slug' },
        })
        .populate('items.variantId');

      if (!cart) {
        cart = await CartModel.create({ userId, items: [] });
      }

      const summary = computeCartTotals(cart.items);

      return res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to retrieve shopping cart',
      });
    }
  },

  // POST /api/v1/cart/items - Add a shoe variant to customer's cart
  addToCart: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required to add items to bag',
        });
      }

      const parsed = addToCartSchema.parse(req.body);

      // 1. Verify Product exists and is active
      const product = await ProductModel.findById(parsed.productId);
      if (!product || !product.isActive) {
        return res.status(404).json({
          success: false,
          message: 'Selected product is not available for purchase',
        });
      }

      // 2. Verify ProductVariant exists, is active, and matches product
      let variant = null;
      if (parsed.variantId && /^[0-9a-fA-F]{24}$/.test(String(parsed.variantId))) {
        variant = await ProductVariantModel.findById(parsed.variantId);
      }
      if (!variant) {
        variant = await ProductVariantModel.findOne({
          productId: product._id,
          size: parsed.size,
          color: new RegExp(`^${parsed.color}$`, 'i'),
          isActive: true,
        });
      }
      if (!variant) {
        variant = await ProductVariantModel.findOne({
          productId: product._id,
          size: parsed.size,
          isActive: true,
        });
      }
      if (!variant) {
        variant = await ProductVariantModel.findOne({
          productId: product._id,
          isActive: true,
          stockQuantity: { $gt: 0 },
        });
      }
      if (!variant || !variant.isActive || variant.productId.toString() !== product._id.toString()) {
        return res.status(404).json({
          success: false,
          message: 'Selected shoe variant (size/color) is not available',
        });
      }

      // 3. Verify variant stock availability
      const availableStock = variant.stockQuantity - (variant.reservedQuantity || 0);
      if (availableStock <= 0) {
        return res.status(400).json({
          success: false,
          message: `Size ${variant.size} (${variant.color}) is currently out of stock`,
        });
      }

      // 4. Find or create Cart
      let cart = await CartModel.findOne({ userId });
      if (!cart) {
        cart = new CartModel({ userId, items: [] });
      }

      // Check if item already exists in cart
      const existingItemIndex = cart.items.findIndex(
        (i) => i.variantId.toString() === variant._id.toString()
      );

      if (existingItemIndex > -1) {
        const newQty = cart.items[existingItemIndex].quantity + parsed.quantity;
        if (newQty > availableStock) {
          return res.status(400).json({
            success: false,
            message: `Only ${availableStock} pairs available in stock for Size ${variant.size} (${variant.color})`,
          });
        }
        cart.items[existingItemIndex].quantity = newQty;
      } else {
        if (parsed.quantity > availableStock) {
          return res.status(400).json({
            success: false,
            message: `Only ${availableStock} pairs available in stock`,
          });
        }
        cart.items.push({
          productId: product._id as any,
          variantId: variant._id as any,
          size: variant.size,
          color: variant.color,
          quantity: parsed.quantity,
        });
      }

      await cart.save();

      // Return fully populated cart summary
      const populatedCart = await CartModel.findById(cart._id)
        .populate({
          path: 'items.productId',
          populate: { path: 'brandId', select: 'name slug' },
        })
        .populate('items.variantId');

      const summary = computeCartTotals(populatedCart?.items || []);

      return res.status(200).json({
        success: true,
        message: `Added "${product.name}" (Size ${variant.size}) to your bag`,
        data: summary,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: err.issues.map((e: any) => e.message).join(', '),
          errors: err.issues,
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message || 'Failed to add item to bag',
      });
    }
  },

  // PUT /api/v1/cart/items/:itemId - Update item quantity in cart
  updateItemQuantity: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required to update bag items',
        });
      }

      const { itemId } = req.params;
      const { quantity } = updateCartItemSchema.parse(req.body);

      const cart = await CartModel.findOne({ userId });
      if (!cart) {
        return res.status(404).json({ success: false, message: 'Cart not found' });
      }

      const item = cart.items.find(
        (i) => i._id?.toString() === itemId || i.variantId.toString() === itemId
      );
      if (!item) {
        return res.status(404).json({ success: false, message: 'Item not found in bag' });
      }

      // Check variant stock limit
      const variant = await ProductVariantModel.findById(item.variantId);
      if (!variant) {
        return res.status(404).json({ success: false, message: 'Variant no longer exists' });
      }

      const availableStock = variant.stockQuantity - (variant.reservedQuantity || 0);
      if (quantity > availableStock) {
        return res.status(400).json({
          success: false,
          message: `Only ${availableStock} pairs available in stock`,
        });
      }

      item.quantity = quantity;
      await cart.save();

      const populatedCart = await CartModel.findById(cart._id)
        .populate({
          path: 'items.productId',
          populate: { path: 'brandId', select: 'name slug' },
        })
        .populate('items.variantId');

      const summary = computeCartTotals(populatedCart?.items || []);

      return res.status(200).json({
        success: true,
        message: 'Cart updated successfully',
        data: summary,
      });
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        message: err.message || 'Failed to update bag item quantity',
      });
    }
  },

  // DELETE /api/v1/cart/items/:itemId - Remove item from cart
  removeItem: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required to remove items from bag',
        });
      }

      const { itemId } = req.params;
      const cart = await CartModel.findOne({ userId });
      if (!cart) {
        return res.status(404).json({ success: false, message: 'Cart not found' });
      }

      const itemExists = cart.items.some(
        (i) => i._id?.toString() === itemId || i.variantId.toString() === itemId
      );
      if (!itemExists) {
        return res.status(404).json({ success: false, message: 'Item not found in your bag' });
      }

      cart.items = cart.items.filter(
        (i) => i._id?.toString() !== itemId && i.variantId.toString() !== itemId
      );

      await cart.save();

      const populatedCart = await CartModel.findById(cart._id)
        .populate({
          path: 'items.productId',
          populate: { path: 'brandId', select: 'name slug' },
        })
        .populate('items.variantId');

      const summary = computeCartTotals(populatedCart?.items || []);

      return res.status(200).json({
        success: true,
        message: 'Item removed from bag',
        data: summary,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to remove item from bag',
      });
    }
  },

  // DELETE /api/v1/cart - Clear all items from customer's cart
  clearCart: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required to clear bag',
        });
      }

      await CartModel.findOneAndUpdate({ userId }, { $set: { items: [] } }, { upsert: true });

      return res.status(200).json({
        success: true,
        message: 'Bag cleared successfully',
        data: {
          items: [],
          subtotal: 0,
          deliveryFee: 0,
          finalTotal: 0,
          freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
          qualifiesForFreeShipping: false,
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to clear bag',
      });
    }
  },

  // POST /api/v1/cart/sync - Merge guest local storage items into MongoDB cart
  syncCart: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required to synchronize bag',
        });
      }

      const { items } = syncCartSchema.parse(req.body);

      let cart = await CartModel.findOne({ userId });
      if (!cart) {
        cart = new CartModel({ userId, items: [] });
      }

      for (const guestItem of items) {
        let variant = null;
        if (guestItem.variantId && /^[0-9a-fA-F]{24}$/.test(String(guestItem.variantId))) {
          variant = await ProductVariantModel.findById(guestItem.variantId);
        }
        if (!variant) {
          variant = await ProductVariantModel.findOne({
            productId: guestItem.productId,
            size: guestItem.size,
            color: new RegExp(`^${guestItem.color}$`, 'i'),
            isActive: true,
          });
        }
        if (!variant) {
          variant = await ProductVariantModel.findOne({
            productId: guestItem.productId,
            size: guestItem.size,
            isActive: true,
          });
        }
        if (!variant || !variant.isActive) continue;

        const availableStock = variant.stockQuantity - (variant.reservedQuantity || 0);
        if (availableStock <= 0) continue;

        const existingIdx = cart.items.findIndex(
          (i) => i.variantId.toString() === variant._id.toString()
        );

        if (existingIdx > -1) {
          cart.items[existingIdx].quantity = Math.min(
            availableStock,
            cart.items[existingIdx].quantity + guestItem.quantity
          );
        } else {
          cart.items.push({
            productId: variant.productId as any,
            variantId: variant._id as any,
            size: variant.size,
            color: variant.color,
            quantity: Math.min(availableStock, guestItem.quantity),
          });
        }
      }

      await cart.save();

      const populatedCart = await CartModel.findById(cart._id)
        .populate({
          path: 'items.productId',
          populate: { path: 'brandId', select: 'name slug' },
        })
        .populate('items.variantId');

      const summary = computeCartTotals(populatedCart?.items || []);

      return res.status(200).json({
        success: true,
        message: 'Cart synchronized with your account',
        data: summary,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: err.issues.map((e: any) => e.message).join(', '),
          errors: err.issues,
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message || 'Failed to sync bag',
      });
    }
  },
};
