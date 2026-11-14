import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../types';
import { OrderModel } from '../models/order.model';
import { CartModel } from '../models/cart.model';
import { ProductModel } from '../models/product.model';
import { ProductVariantModel } from '../models/productVariant.model';
import { createOrderSchema } from '../validators/order.validator';

const FREE_SHIPPING_THRESHOLD = 15000; // in LKR
const STANDARD_DELIVERY_FEE = 650; // in LKR

export const orderController = {
  // POST /api/v1/orders - Create & complete a customer order
  createOrder: async (req: AuthenticatedRequest, res: Response) => {
    // Keep track of successfully decremented variants for atomic rollback in case of concurrency conflict
    const decrementedVariants: Array<{ variantId: string; quantity: number }> = [];

    try {
      const userId = req.user?.sub;
      const parsed = createOrderSchema.parse(req.body);

      // 1. Determine raw items to process
      let rawItems = parsed.items;
      let isFromCart = false;

      if (!rawItems || rawItems.length === 0) {
        const cart = await CartModel.findOne({ userId });
        if (!cart || cart.items.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Your shopping bag is empty. Please add shoes before checking out.',
          });
        }
        rawItems = cart.items.map((i) => ({
          productId: i.productId.toString(),
          variantId: i.variantId.toString(),
          size: i.size,
          color: i.color,
          quantity: i.quantity,
        }));
        isFromCart = true;
      }

      if (rawItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No order items specified',
        });
      }

      // 2. Validate products, calculate server-verified prices, and perform atomic stock deduction
      const orderItems = [];
      let subtotal = 0;

      for (const item of rawItems) {
        // Fetch Product from trusted MongoDB database
        const product = await ProductModel.findById(item.productId);
        if (!product || !product.isActive) {
          throw new Error(`Product "${product?.name || item.productId}" is no longer available`);
        }

        // Fetch Variant from trusted MongoDB database
        let variant = null;
        if (item.variantId && /^[0-9a-fA-F]{24}$/.test(String(item.variantId))) {
          variant = await ProductVariantModel.findById(item.variantId);
        }

        // Auto-resolve variant by (productId, size, color) if variantId was not provided or not found
        if (!variant) {
          variant = await ProductVariantModel.findOne({
            productId: product._id,
            size: item.size,
            color: new RegExp(`^${item.color}$`, 'i'),
            isActive: true,
          });
        }

        // Fallback: match by size if color had minor difference
        if (!variant) {
          variant = await ProductVariantModel.findOne({
            productId: product._id,
            size: item.size,
            isActive: true,
          });
        }

        // Final fallback: any active variant with available stock
        if (!variant) {
          variant = await ProductVariantModel.findOne({
            productId: product._id,
            isActive: true,
            stockQuantity: { $gt: 0 },
          });
        }

        if (!variant || !variant.isActive || variant.productId.toString() !== product._id.toString()) {
          throw new Error(`Shoe variant (Size ${item.size}, ${item.color}) for "${product.name}" is unavailable`);
        }

        // ATOMIC CONCURRENCY CHECK & STOCK DEDUCTION
        // Uses atomic $gte check and $inc decrement to prevent race condition overselling
        const updatedVariant = await ProductVariantModel.findOneAndUpdate(
          {
            _id: variant._id,
            stockQuantity: { $gte: item.quantity },
            isActive: true,
          },
          {
            $inc: { stockQuantity: -item.quantity },
          },
          { new: true }
        );

        if (!updatedVariant) {
          const liveVariant = await ProductVariantModel.findById(variant._id);
          const liveStock = liveVariant?.stockQuantity ?? 0;
          throw new Error(
            `Insufficient stock for "${product.name}" (Size ${variant.size}, ${variant.color}). Requested: ${item.quantity}, Available: ${liveStock}`
          );
        }

        // Record for rollback if subsequent items fail
        decrementedVariants.push({
          variantId: variant._id.toString(),
          quantity: item.quantity,
        });

        // Calculate verified unit price (NEVER trust prices sent from client)
        const unitPrice =
          product.discountPrice && product.discountPrice > 0 && product.discountPrice < product.basePrice
            ? product.discountPrice
            : product.basePrice;

        const lineTotal = unitPrice * item.quantity;
        subtotal += lineTotal;

        orderItems.push({
          productId: product._id as any,
          variantId: variant._id as any,
          name: product.name,
          image: product.images?.[0] || '',
          size: variant.size,
          color: variant.color,
          unitPrice,
          quantity: item.quantity,
          totalPrice: lineTotal,
        });
      }

      // 3. Compute delivery fee and final total strictly in Sri Lankan Rupees (LKR)
      const deliveryFee = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_DELIVERY_FEE;
      const finalTotal = subtotal + deliveryFee;

      // 4. Generate unique human-readable Order Number (e.g. STX-20261114-8392)
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomPart = Math.floor(1000 + Math.random() * 9000);
      const orderNumber = `STX-${datePart}-${randomPart}`;

      // 5. Create Order document in MongoDB Atlas
      const order = await OrderModel.create({
        orderNumber,
        userId,
        customerDetails: parsed.customerDetails,
        items: orderItems,
        subtotal,
        deliveryFee,
        finalTotal,
        paymentMethod: parsed.paymentMethod,
        paymentStatus: 'PENDING',
        orderStatus: 'CONFIRMED',
      });

      // 6. Clear customer's cart in MongoDB after successful order
      if (userId) {
        await CartModel.findOneAndUpdate({ userId }, { $set: { items: [] } }).catch(() => {});
      }

      return res.status(201).json({
        success: true,
        message: 'Order placed successfully! Thank you for shopping with STRIDEX.',
        data: order,
      });
    } catch (err: any) {
      // ATOMIC ROLLBACK: Restore stock for all variants successfully decremented prior to failure
      if (decrementedVariants.length > 0) {
        for (const dec of decrementedVariants) {
          await ProductVariantModel.findByIdAndUpdate(dec.variantId, {
            $inc: { stockQuantity: dec.quantity },
          }).catch((rollbackErr) => {
            console.error('Critical: Failed to rollback variant stock', rollbackErr);
          });
        }
      }

      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: err.issues.map((e: any) => e.message).join(', '),
          errors: err.issues,
        });
      }

      return res.status(400).json({
        success: false,
        message: err.message || 'Failed to complete order checkout',
      });
    }
  },

  // GET /api/v1/orders - Retrieve authenticated customer's order history
  getMyOrders: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.sub;
      const orders = await OrderModel.find({ userId })
        .sort({ createdAt: -1 })
        .populate('items.productId', 'slug brandId');

      return res.status(200).json({
        success: true,
        data: orders,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to retrieve your orders',
      });
    }
  },

  // GET /api/v1/orders/:id - Retrieve order details by ID or orderNumber
  getOrderById: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.sub;
      const role = req.user?.role;
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : String(rawId || '');

      const query: any = id.startsWith('STX-') ? { orderNumber: id.toUpperCase() } : { _id: id };

      // Normal customer can only view their own order; Admins can view any
      if (role !== 'ADMIN' && role !== 'INVENTORY_MANAGER') {
        query.userId = userId;
      }

      const order = await OrderModel.findOne(query)
        .populate('items.productId', 'slug brandId material')
        .populate('items.variantId', 'SKU');

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found or unauthorized access',
        });
      }

      return res.status(200).json({
        success: true,
        data: order,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to retrieve order details',
      });
    }
  },

  // GET /api/v1/orders/admin/all - Admin order overview
  getAllOrders: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.max(1, parseInt(req.query.limit as string, 10) || 20);
      const status = req.query.status as string;

      const query: any = {};
      if (status) query.orderStatus = status;

      const totalItems = await OrderModel.countDocuments(query);
      const orders = await OrderModel.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'fullName email');

      return res.status(200).json({
        success: true,
        data: orders,
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
        message: err.message || 'Failed to retrieve orders',
      });
    }
  },
};
