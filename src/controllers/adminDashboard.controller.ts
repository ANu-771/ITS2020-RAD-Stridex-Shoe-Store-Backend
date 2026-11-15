import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { OrderModel } from '../models/order.model';
import { ProductModel } from '../models/product.model';
import { ProductVariantModel } from '../models/productVariant.model';
import { UserModel, UserRole } from '../models/user.model';
import { CategoryModel } from '../models/category.model';
import { BrandModel } from '../models/brand.model';

export const adminDashboardController = {
  // GET /api/v1/admin/dashboard/stats
  getDashboardStats: async (_req: AuthenticatedRequest, res: Response) => {
    try {
      // 1. Core Counts
      const [totalOrders, totalCustomers, totalProducts, allOrders, allVariants] = await Promise.all([
        OrderModel.countDocuments(),
        UserModel.countDocuments({ role: UserRole.CUSTOMER }),
        ProductModel.countDocuments({ isActive: true }),
        OrderModel.find().sort({ createdAt: -1 }),
        ProductVariantModel.find({ isActive: true }).populate('productId', 'name slug basePrice images'),
      ]);

      // 2. Revenue calculation
      const totalRevenue = allOrders
        .filter((o) => o.paymentStatus === 'PAID')
        .reduce((sum, o) => sum + (o.finalTotal || 0), 0);

      // 3. Low stock and out of stock calculations
      let lowStockCount = 0;
      let outOfStockCount = 0;
      const lowStockAlerts: any[] = [];

      for (const v of allVariants) {
        const threshold = v.minStockThreshold ?? 5;
        if (v.stockQuantity === 0) {
          outOfStockCount++;
          if (lowStockAlerts.length < 10) {
            lowStockAlerts.push({
              variantId: v._id,
              productName: (v.productId as any)?.name || 'Shoe',
              image: (v.productId as any)?.images?.[0] || '',
              SKU: v.SKU,
              size: v.size,
              color: v.color,
              stockQuantity: v.stockQuantity,
              threshold,
              severity: 'OUT_OF_STOCK',
            });
          }
        } else if (v.stockQuantity <= threshold) {
          lowStockCount++;
          if (lowStockAlerts.length < 10) {
            lowStockAlerts.push({
              variantId: v._id,
              productName: (v.productId as any)?.name || 'Shoe',
              image: (v.productId as any)?.images?.[0] || '',
              SKU: v.SKU,
              size: v.size,
              color: v.color,
              stockQuantity: v.stockQuantity,
              threshold,
              severity: 'LOW_STOCK',
            });
          }
        }
      }

      // 4. Monthly Sales & Revenue Trend (Last 6 Months for Recharts)
      const monthlyDataMap: { [key: string]: { month: string; orders: number; revenue: number } } = {};
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const now = new Date();

      // Seed previous 6 months
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        monthlyDataMap[key] = {
          month: monthNames[d.getMonth()],
          orders: 0,
          revenue: 0,
        };
      }

      for (const order of allOrders) {
        const d = new Date(order.createdAt);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (monthlyDataMap[key]) {
          monthlyDataMap[key].orders++;
          if (order.paymentStatus === 'PAID') {
            monthlyDataMap[key].revenue += order.finalTotal || 0;
          }
        }
      }

      const monthlySales = Object.values(monthlyDataMap);

      // 5. Recent 6 Orders
      const recentOrders = allOrders.slice(0, 6).map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customerDetails?.fullName || 'Guest',
        date: o.createdAt,
        finalTotal: o.finalTotal,
        paymentStatus: o.paymentStatus,
        orderStatus: o.orderStatus,
        itemsCount: o.items?.length || 0,
      }));

      // 6. Top Selling Shoes
      const productSalesMap: { [key: string]: { name: string; image: string; pairsSold: number; revenue: number } } = {};
      for (const order of allOrders) {
        if (order.orderStatus === 'CANCELLED') continue;
        for (const item of order.items) {
          const pId = String((item.productId as any)?._id || item.productId);
          if (!productSalesMap[pId]) {
            productSalesMap[pId] = {
              name: item.name,
              image: item.image,
              pairsSold: 0,
              revenue: 0,
            };
          }
          productSalesMap[pId].pairsSold += item.quantity;
          productSalesMap[pId].revenue += item.totalPrice;
        }
      }

      const topSellingShoes = Object.values(productSalesMap)
        .sort((a, b) => b.pairsSold - a.pairsSold)
        .slice(0, 5);

      return res.status(200).json({
        success: true,
        data: {
          totalRevenue,
          totalOrders,
          totalCustomers,
          totalProducts,
          lowStockProducts: lowStockCount,
          outOfStockProducts: outOfStockCount,
          monthlySales,
          recentOrders,
          topSellingShoes,
          lowStockAlerts,
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to retrieve admin dashboard metrics',
      });
    }
  },

  // GET /api/v1/admin/customers
  getCustomers: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.max(1, parseInt(req.query.limit as string, 10) || 20);
      const search = (req.query.search as string || '').trim();

      const query: any = { role: UserRole.CUSTOMER };
      if (search) {
        query.$or = [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ];
      }

      const totalItems = await UserModel.countDocuments(query);
      const customers = await UserModel.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      // Attach customer order stats
      const customersWithStats = await Promise.all(
        customers.map(async (c) => {
          const orders = await OrderModel.find({ userId: c._id });
          const totalSpent = orders
            .filter((o) => o.paymentStatus === 'PAID')
            .reduce((sum, o) => sum + (o.finalTotal || 0), 0);

          return {
            ...c.toJSON(),
            ordersCount: orders.length,
            totalSpent,
            lastOrderDate: orders.length > 0 ? orders[0].createdAt : null,
          };
        })
      );

      return res.status(200).json({
        success: true,
        data: customersWithStats,
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
        message: err.message || 'Failed to retrieve customers',
      });
    }
  },

  // GET /api/v1/admin/reports/sales
  getSalesReport: async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const orders = await OrderModel.find({ paymentStatus: 'PAID', orderStatus: { $ne: 'CANCELLED' } })
        .populate('items.productId', 'brandId categoryId');

      const totalSalesRevenue = orders.reduce((sum, o) => sum + (o.finalTotal || 0), 0);
      const totalPairsSold = orders.reduce(
        (sum, o) => sum + o.items.reduce((itemSum, i) => itemSum + i.quantity, 0),
        0
      );

      return res.status(200).json({
        success: true,
        data: {
          totalSalesRevenue,
          totalOrders: orders.length,
          totalPairsSold,
          averageOrderValue: orders.length > 0 ? Math.round(totalSalesRevenue / orders.length) : 0,
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to generate sales report',
      });
    }
  },

  // GET /api/v1/admin/reports/inventory-valuation
  getInventoryValuation: async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const variants = await ProductVariantModel.find({ isActive: true })
        .populate('productId', 'name basePrice brandId categoryId');

      let totalValuation = 0;
      let totalUnits = 0;

      for (const v of variants) {
        const prod = v.productId as any;
        const price = prod?.basePrice || 0;
        totalUnits += v.stockQuantity;
        totalValuation += price * v.stockQuantity;
      }

      return res.status(200).json({
        success: true,
        data: {
          totalUnits,
          totalValuation,
          activeVariantsCount: variants.length,
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to calculate inventory valuation',
      });
    }
  },
};
