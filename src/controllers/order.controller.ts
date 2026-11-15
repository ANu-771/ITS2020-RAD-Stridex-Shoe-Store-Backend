import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../types';
import { OrderModel, OrderStatus } from '../models/order.model';
import { CartModel } from '../models/cart.model';
import { ProductModel } from '../models/product.model';
import { ProductVariantModel } from '../models/productVariant.model';
import { StockMovementModel } from '../models/stockMovement.model';
import {
  createOrderSchema,
  cancelOrderSchema,
  simulatePaymentSchema,
  updateOrderStatusSchema,
  updatePaymentStatusSchema,
} from '../validators/order.validator';

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

      // 5. Determine initial order status and tracking timeline
      const isOnlineCard = parsed.paymentMethod === 'ONLINE_CARD';
      const initialOrderStatus: OrderStatus = isOnlineCard ? 'PENDING' : 'CONFIRMED';
      const initialTimeline = [
        {
          status: initialOrderStatus,
          timestamp: new Date(),
          title: isOnlineCard
            ? 'Order Placed (Online Card)'
            : parsed.paymentMethod === 'CASH_ON_DELIVERY'
            ? 'Order Confirmed (Cash on Delivery)'
            : 'Order Placed (Bank Transfer)',
          description: isOnlineCard
            ? 'Order registered in STRIDEX. Awaiting online payment simulation.'
            : parsed.paymentMethod === 'CASH_ON_DELIVERY'
            ? 'Order confirmed and allocated from warehouse. Payment due in LKR upon delivery.'
            : 'Order received. Awaiting bank transfer confirmation.',
        },
      ];

      // 6. Create Order document in MongoDB Atlas
      const order = await OrderModel.create({
        orderNumber,
        userId,
        customerDetails: parsed.customerDetails,
        deliveryAddress: parsed.customerDetails.deliveryAddress,
        items: orderItems,
        subtotal,
        deliveryFee,
        totalAmount: finalTotal,
        finalTotal,
        paymentMethod: parsed.paymentMethod,
        paymentStatus: 'PENDING',
        orderStatus: initialOrderStatus,
        stockRestored: false,
        trackingTimeline: initialTimeline,
      });

      // 7. Clear customer's cart in MongoDB after successful order
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

  // GET /api/v1/orders/admin/all - Admin order overview with search, filters, pagination & summary statistics
  getAllOrders: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.max(1, parseInt(req.query.limit as string, 10) || 20);
      const status = req.query.status as string;
      const paymentStatus = req.query.paymentStatus as string;
      const paymentMethod = req.query.paymentMethod as string;
      const search = (req.query.search as string || '').trim();

      const query: any = {};
      if (status && status !== 'ALL') query.orderStatus = status;
      if (paymentStatus && paymentStatus !== 'ALL') query.paymentStatus = paymentStatus;
      if (paymentMethod && paymentMethod !== 'ALL') query.paymentMethod = paymentMethod;

      if (search) {
        query.$or = [
          { orderNumber: { $regex: search, $options: 'i' } },
          { 'customerDetails.fullName': { $regex: search, $options: 'i' } },
          { 'customerDetails.email': { $regex: search, $options: 'i' } },
          { 'customerDetails.phone': { $regex: search, $options: 'i' } },
          { 'customerDetails.city': { $regex: search, $options: 'i' } },
        ];
      }

      const totalItems = await OrderModel.countDocuments(query);
      const orders = await OrderModel.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'fullName email');

      // Calculate overview metrics for dashboard
      const allOrders = await OrderModel.find({}, 'orderStatus paymentStatus paymentMethod finalTotal');
      const totalRevenue = allOrders
        .filter((o) => o.paymentStatus === 'PAID')
        .reduce((sum, o) => sum + (o.finalTotal || 0), 0);
      const pendingCount = allOrders.filter((o) => o.orderStatus === 'PENDING').length;
      const confirmedCount = allOrders.filter((o) => o.orderStatus === 'CONFIRMED').length;
      const processingCount = allOrders.filter((o) => o.orderStatus === 'PROCESSING').length;
      const shippedCount = allOrders.filter((o) => o.orderStatus === 'SHIPPED').length;
      const deliveredCount = allOrders.filter((o) => o.orderStatus === 'DELIVERED').length;
      const cancelledCount = allOrders.filter((o) => o.orderStatus === 'CANCELLED').length;
      const codPendingCount = allOrders.filter(
        (o) => o.paymentMethod === 'CASH_ON_DELIVERY' && o.paymentStatus === 'PENDING' && o.orderStatus !== 'CANCELLED'
      ).length;

      return res.status(200).json({
        success: true,
        data: orders,
        summary: {
          totalOrders: allOrders.length,
          totalRevenue,
          pendingCount,
          confirmedCount,
          processingCount,
          shippedCount,
          deliveredCount,
          cancelledCount,
          codPendingCount,
        },
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

  // POST /api/v1/orders/:id/pay - Demo / Simulated Online Payment
  simulatePayment: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.sub;
      const role = req.user?.role;
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : String(rawId || '');
      const parsed = simulatePaymentSchema.parse(req.body);

      const query: any = id.startsWith('STX-') ? { orderNumber: id.toUpperCase() } : { _id: id };
      if (role !== 'ADMIN' && role !== 'INVENTORY_MANAGER') {
        query.userId = userId;
      }

      const order = await OrderModel.findOne(query);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found or unauthorized access',
        });
      }

      if (order.orderStatus === 'CANCELLED') {
        return res.status(400).json({
          success: false,
          message: 'Cannot process payment for a cancelled order',
        });
      }

      const txnId = `TXN-SIM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

      if (parsed.simulationResult === 'SUCCESS') {
        order.paymentStatus = 'PAID';
        if (order.orderStatus === 'PENDING') {
          order.orderStatus = 'CONFIRMED';
        }
        order.paymentDetails = {
          transactionId: txnId,
          paidAt: new Date(),
          simulatedStatus: 'SUCCESS',
          note: `Simulated online payment approved (${parsed.cardBrand} •••• ${parsed.last4}). Demo mode.`,
        };
        order.trackingTimeline.push({
          status: order.orderStatus,
          timestamp: new Date(),
          title: 'Payment Confirmed (Simulated)',
          description: `Online card payment of Rs. ${order.finalTotal.toLocaleString()} successfully processed.`,
        });
      } else if (parsed.simulationResult === 'FAILED') {
        order.paymentStatus = 'FAILED';
        order.paymentDetails = {
          transactionId: txnId,
          simulatedStatus: 'FAILED',
          note: parsed.notes || 'Simulated card payment declined (demo test)',
        };
        order.trackingTimeline.push({
          status: order.orderStatus,
          timestamp: new Date(),
          title: 'Payment Failed (Simulated)',
          description: 'Payment transaction failed in demo simulation. Customer may retry.',
        });
      } else {
        order.paymentStatus = 'PENDING';
        order.paymentDetails = {
          transactionId: txnId,
          simulatedStatus: 'PENDING',
          note: 'Payment simulation pending authorization',
        };
        order.trackingTimeline.push({
          status: order.orderStatus,
          timestamp: new Date(),
          title: 'Payment Pending',
          description: 'Awaiting 3D Secure / simulated bank authorization.',
        });
      }

      await order.save();

      return res.status(200).json({
        success: true,
        message:
          parsed.simulationResult === 'SUCCESS'
            ? 'Payment simulation succeeded! Order confirmed.'
            : parsed.simulationResult === 'FAILED'
            ? 'Payment simulation failed as requested.'
            : 'Payment simulation marked as pending.',
        data: order,
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
        message: err.message || 'Payment simulation failed',
      });
    }
  },

  // POST /api/v1/orders/:id/cancel - Customer or Admin Order Cancellation with Safe Stock Restoration
  cancelOrder: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.sub;
      const role = req.user?.role;
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : String(rawId || '');
      const parsed = cancelOrderSchema.parse(req.body);

      const query: any = id.startsWith('STX-') ? { orderNumber: id.toUpperCase() } : { _id: id };
      if (role !== 'ADMIN' && role !== 'INVENTORY_MANAGER') {
        query.userId = userId;
      }

      const order = await OrderModel.findOne(query);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found or unauthorized access',
        });
      }

      if (order.orderStatus === 'CANCELLED') {
        return res.status(400).json({
          success: false,
          message: 'This order is already cancelled',
        });
      }

      if (order.orderStatus === 'DELIVERED') {
        return res.status(400).json({
          success: false,
          message: 'Delivered orders cannot be cancelled directly. Please initiate an exchange/return request.',
        });
      }

      if (role !== 'ADMIN' && role !== 'INVENTORY_MANAGER' && order.orderStatus === 'SHIPPED') {
        return res.status(400).json({
          success: false,
          message: 'Order has already been dispatched and cannot be cancelled online. Please contact support.',
        });
      }

      // SAFE ATOMIC STOCK RESTORATION
      // Guarded by stockRestored boolean to prevent duplicate restorations
      if (!order.stockRestored) {
        for (const item of order.items) {
          if (item.variantId) {
            const vId = (item.variantId as any)._id || item.variantId;
            await ProductVariantModel.findByIdAndUpdate(vId, {
              $inc: { stockQuantity: item.quantity },
            }).catch((stockErr) => {
              console.error(`Failed to restore stock for variant ${vId}:`, stockErr);
            });
          }
        }
        order.stockRestored = true;
      }

      order.orderStatus = 'CANCELLED';
      order.cancelledAt = new Date();
      order.cancellationReason = parsed.reason || 'Cancelled by customer';
      order.trackingTimeline.push({
        status: 'CANCELLED',
        timestamp: new Date(),
        title: 'Order Cancelled',
        description: `Order cancelled (${order.cancellationReason}). Reserved footwear stock restored to warehouse inventory.`,
      });

      await order.save();

      return res.status(200).json({
        success: true,
        message: 'Order cancelled successfully and inventory stock restored.',
        data: order,
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
        message: err.message || 'Failed to cancel order',
      });
    }
  },

  // PATCH /api/v1/orders/:id/status - Admin status update
  updateOrderStatus: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : String(rawId || '');
      const parsed = updateOrderStatusSchema.parse(req.body);

      const query: any = id.startsWith('STX-') ? { orderNumber: id.toUpperCase() } : { _id: id };
      const order = await OrderModel.findOne(query);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      const previousStatus = order.orderStatus;
      const newStatus = parsed.orderStatus;

      if (previousStatus === newStatus) {
        return res.status(200).json({
          success: true,
          message: `Order status is already ${newStatus}`,
          data: order,
        });
      }

      // If transitioning to CANCELLED, restore stock safely (once only)
      if (newStatus === 'CANCELLED' && !order.stockRestored) {
        for (const item of order.items) {
          if (item.variantId) {
            const vId = (item.variantId as any)._id || item.variantId;
            await ProductVariantModel.findByIdAndUpdate(vId, {
              $inc: { stockQuantity: item.quantity },
            });
          }
        }
        order.stockRestored = true;
        order.cancelledAt = new Date();
        order.cancellationReason = parsed.note || 'Cancelled by administrator';
      }

      // If re-activating a previously cancelled order, re-deduct stock atomically
      if (previousStatus === 'CANCELLED' && order.stockRestored && newStatus !== 'CANCELLED') {
        for (const item of order.items) {
          if (item.variantId) {
            const vId = (item.variantId as any)._id || item.variantId;
            const updated = await ProductVariantModel.findOneAndUpdate(
              { _id: vId, stockQuantity: { $gte: item.quantity } } as any,
              { $inc: { stockQuantity: -item.quantity } },
              { new: true }
            );
            if (!updated) {
              return res.status(400).json({
                success: false,
                message: `Cannot reactivate order: insufficient stock for variant ${item.name} (${item.size})`,
              });
            }
          }
        }
        order.stockRestored = false;
        order.cancelledAt = undefined;
        order.cancellationReason = undefined;
      }

      order.orderStatus = newStatus;
      order.trackingTimeline.push({
        status: newStatus,
        timestamp: new Date(),
        title: `Status changed to ${newStatus}`,
        description: parsed.note || `Order marked as ${newStatus} by administrator.`,
      });

      await order.save();

      return res.status(200).json({
        success: true,
        message: `Order status updated to ${newStatus}`,
        data: order,
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
        message: err.message || 'Failed to update order status',
      });
    }
  },

  // PATCH /api/v1/orders/:id/payment-status - Admin payment status update (e.g. record COD collection)
  updatePaymentStatus: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : String(rawId || '');
      const parsed = updatePaymentStatusSchema.parse(req.body);

      const query: any = id.startsWith('STX-') ? { orderNumber: id.toUpperCase() } : { _id: id };
      const order = await OrderModel.findOne(query);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      const previousStatus = order.paymentStatus;
      order.paymentStatus = parsed.paymentStatus;

      if (parsed.paymentStatus === 'PAID') {
        order.paymentDetails = {
          ...order.paymentDetails,
          paidAt: new Date(),
          note:
            parsed.note ||
            (order.paymentMethod === 'CASH_ON_DELIVERY'
              ? 'Cash collected upon delivery'
              : 'Payment confirmed by administrator'),
        };
      }

      order.trackingTimeline.push({
        status: order.orderStatus,
        timestamp: new Date(),
        title: `Payment: ${parsed.paymentStatus}`,
        description: parsed.note || `Payment status changed from ${previousStatus} to ${parsed.paymentStatus}.`,
      });

      await order.save();

      return res.status(200).json({
        success: true,
        message: `Payment status updated to ${parsed.paymentStatus}`,
        data: order,
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
        message: err.message || 'Failed to update payment status',
      });
    }
  },
};
