import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { WishlistModel } from '../models/wishlist.model';
import { ProductModel } from '../models/product.model';
import { ProductVariantModel } from '../models/productVariant.model';
import { CartModel } from '../models/cart.model';
import { toggleWishlistSchema, syncWishlistSchema } from '../validators/wishlist.validator';

export const wishlistController = {
  // GET /api/v1/wishlist - Get customer's saved products
  getWishlist: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.sub;
      let wishlist = await WishlistModel.findOne({ userId }).populate({
        path: 'products',
        populate: [
          { path: 'brandId', select: 'name slug logo' },
          { path: 'categoryId', select: 'name slug' },
        ],
      });

      if (!wishlist) {
        wishlist = await WishlistModel.create({ userId, products: [] });
      }

      // Filter out any deleted/inactive products
      const activeProducts = (wishlist.products || []).filter(
        (p: any) => p && p.isActive !== false
      );

      return res.status(200).json({
        success: true,
        data: activeProducts,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to retrieve saved shoes',
      });
    }
  },

  // POST /api/v1/wishlist/toggle - Add or remove shoe from wishlist
  toggleWishlist: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.sub;
      const { productId } = toggleWishlistSchema.parse(req.body);

      const product = await ProductModel.findById(productId);
      if (!product || !product.isActive) {
        return res.status(404).json({
          success: false,
          message: 'Product not found or unavailable',
        });
      }

      let wishlist = await WishlistModel.findOne({ userId });
      if (!wishlist) {
        wishlist = new WishlistModel({ userId, products: [] });
      }

      const existingIndex = wishlist.products.findIndex(
        (p) => p.toString() === productId
      );

      let isAdded = false;
      if (existingIndex > -1) {
        wishlist.products.splice(existingIndex, 1);
        isAdded = false;
      } else {
        wishlist.products.push(product._id as any);
        isAdded = true;
      }

      await wishlist.save();

      return res.status(200).json({
        success: true,
        message: isAdded
          ? `Added "${product.name}" to your saved shoes`
          : `Removed "${product.name}" from your saved shoes`,
        isWishlisted: isAdded,
        productId,
      });
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        message: err.message || 'Failed to update saved shoes',
      });
    }
  },

  // DELETE /api/v1/wishlist/:productId - Explicitly remove from wishlist
  removeFromWishlist: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.sub;
      const { productId } = req.params;

      const wishlist = await WishlistModel.findOne({ userId });
      if (!wishlist) {
        return res.status(404).json({ success: false, message: 'Wishlist not found' });
      }

      wishlist.products = wishlist.products.filter(
        (p) => p.toString() !== productId
      );

      await wishlist.save();

      return res.status(200).json({
        success: true,
        message: 'Shoe removed from saved list',
        productId,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to remove from saved shoes',
      });
    }
  },

  // POST /api/v1/wishlist/:productId/move-to-cart - Move from wishlist to bag
  moveToCart: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.sub;
      const { productId } = req.params;

      const product = await ProductModel.findById(productId);
      if (!product || !product.isActive) {
        return res.status(404).json({ success: false, message: 'Product is not available' });
      }

      // Find an in-stock active variant
      const variants = await ProductVariantModel.find({
        productId: product._id,
        isActive: true,
        stockQuantity: { $gt: 0 },
      });

      if (!variants || variants.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'All sizes for this shoe are currently out of stock',
        });
      }

      const selectedVariant = variants[0];

      // Remove from wishlist
      await WishlistModel.findOneAndUpdate(
        { userId },
        { $pull: { products: product._id } }
      );

      // Add to Cart
      let cart = await CartModel.findOne({ userId });
      if (!cart) {
        cart = new CartModel({ userId, items: [] });
      }

      const existingItem = cart.items.find(
        (i) => i.variantId.toString() === selectedVariant._id.toString()
      );

      if (existingItem) {
        existingItem.quantity = Math.min(
          selectedVariant.stockQuantity,
          existingItem.quantity + 1
        );
      } else {
        cart.items.push({
          productId: product._id as any,
          variantId: selectedVariant._id as any,
          size: selectedVariant.size,
          color: selectedVariant.color,
          quantity: 1,
        });
      }

      await cart.save();

      return res.status(200).json({
        success: true,
        message: `Moved "${product.name}" (Size ${selectedVariant.size}) to your bag`,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to move shoe to bag',
      });
    }
  },

  // POST /api/v1/wishlist/sync - Merge guest local storage wishlist into MongoDB
  syncWishlist: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.sub;
      const { productIds } = syncWishlistSchema.parse(req.body);

      let wishlist = await WishlistModel.findOne({ userId });
      if (!wishlist) {
        wishlist = new WishlistModel({ userId, products: [] });
      }

      const currentIds = new Set(wishlist.products.map((p) => p.toString()));

      for (const pId of productIds) {
        if (!currentIds.has(pId)) {
          const product = await ProductModel.findById(pId);
          if (product && product.isActive) {
            wishlist.products.push(product._id as any);
            currentIds.add(pId);
          }
        }
      }

      await wishlist.save();

      return res.status(200).json({
        success: true,
        message: 'Saved shoes synchronized with your account',
        totalItems: wishlist.products.length,
      });
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        message: err.message || 'Failed to synchronize wishlist',
      });
    }
  },
};
