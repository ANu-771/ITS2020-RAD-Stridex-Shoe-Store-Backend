import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { OrderModel } from '../models/order.model';
import { ProductModel } from '../models/product.model';
import { ProductVariantModel } from '../models/productVariant.model';
import { UserModel, UserRole } from '../models/user.model';
import { CategoryModel } from '../models/category.model';
import { BrandModel } from '../models/brand.model';

const parseReportDateRange = (startDateStr?: string, endDateStr?: string, rangePreset?: string) => {
  const now = new Date();
  let start: Date | null = null;
  let end: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (rangePreset === 'today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  } else if (rangePreset === 'last7days') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  } else if (rangePreset === 'last30days') {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  } else if (rangePreset === 'thisMonth') {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  } else if (startDateStr || endDateStr) {
    if (startDateStr) {
      const parsedStart = new Date(startDateStr);
      if (!isNaN(parsedStart.getTime())) {
        start = new Date(parsedStart.getFullYear(), parsedStart.getMonth(), parsedStart.getDate(), 0, 0, 0, 0);
      }
    }
    if (endDateStr) {
      const parsedEnd = new Date(endDateStr);
      if (!isNaN(parsedEnd.getTime())) {
        end = new Date(parsedEnd.getFullYear(), parsedEnd.getMonth(), parsedEnd.getDate(), 23, 59, 59, 999);
      }
    }
  }

  return { start, end, range: rangePreset || (startDateStr || endDateStr ? 'custom' : 'all') };
};

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

      // 2. Revenue calculation - STRICT: Only PAID and NON-CANCELLED orders constitute realized revenue
      const totalRevenue = allOrders
        .filter((o) => o.paymentStatus === 'PAID' && o.orderStatus !== 'CANCELLED')
        .reduce((sum, o) => sum + (o.finalTotal || 0), 0);

      // Pending revenue awaiting confirmation/delivery (e.g. pending COD or unverified bank transfers)
      const pendingRevenue = allOrders
        .filter((o) => o.paymentStatus !== 'PAID' && o.orderStatus !== 'CANCELLED')
        .reduce((sum, o) => sum + (o.finalTotal || 0), 0);

      const cancelledOrders = allOrders.filter((o) => o.orderStatus === 'CANCELLED').length;

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
        if (order.orderStatus === 'CANCELLED') continue;
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

      // 6. Top Selling Shoes (Only non-cancelled orders; revenue strictly from paid orders)
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
          if (order.paymentStatus === 'PAID') {
            productSalesMap[pId].revenue += item.totalPrice;
          }
        }
      }

      const topSellingShoes = Object.values(productSalesMap)
        .sort((a, b) => b.pairsSold - a.pairsSold)
        .slice(0, 5);

      return res.status(200).json({
        success: true,
        data: {
          totalRevenue,
          pendingRevenue,
          cancelledOrders,
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
            .filter((o) => o.paymentStatus === 'PAID' && o.orderStatus !== 'CANCELLED')
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
  getSalesReport: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate, range } = req.query as {
        startDate?: string;
        endDate?: string;
        range?: string;
      };

      const { start, end, range: resolvedRange } = parseReportDateRange(startDate, endDate, range);

      const dateQuery: any = {};
      if (start) dateQuery.$gte = start;
      if (end) dateQuery.$lte = end;

      const orderFilter: any = {};
      if (start || end) {
        orderFilter.createdAt = dateQuery;
      }

      // Fetch all orders matching the date range
      const orders = await OrderModel.find(orderFilter)
        .sort({ createdAt: -1 })
        .populate('items.productId', 'name slug images brandId categoryId');

      // 1. Paid and Non-Cancelled Orders (Strict Realized Revenue)
      const paidOrders = orders.filter(
        (o) => o.paymentStatus === 'PAID' && o.orderStatus !== 'CANCELLED'
      );

      const totalSalesRevenue = paidOrders.reduce((sum, o) => sum + (o.finalTotal || 0), 0);
      const totalPairsSold = paidOrders.reduce(
        (sum, o) => sum + o.items.reduce((itemSum, i) => itemSum + i.quantity, 0),
        0
      );
      const averageOrderValue = paidOrders.length > 0 ? Math.round(totalSalesRevenue / paidOrders.length) : 0;
      const totalDiscountsGiven = paidOrders.reduce((sum, o) => sum + (o.discountAmount || 0), 0);

      // 2. Pending Unpaid Orders
      const pendingOrders = orders.filter(
        (o) => o.paymentStatus !== 'PAID' && o.orderStatus !== 'CANCELLED'
      );
      const pendingRevenue = pendingOrders.reduce((sum, o) => sum + (o.finalTotal || 0), 0);
      const pendingOrdersCount = pendingOrders.length;

      // 3. Cancelled Orders
      const cancelledOrders = orders.filter((o) => o.orderStatus === 'CANCELLED');
      const cancelledOrdersCount = cancelledOrders.length;

      // 4. Payment Method Breakdown
      const paymentMethodMap: Record<string, { method: string; label: string; orderCount: number; revenue: number }> = {
        CASH_ON_DELIVERY: { method: 'CASH_ON_DELIVERY', label: 'Cash on Delivery (COD)', orderCount: 0, revenue: 0 },
        BANK_TRANSFER: { method: 'BANK_TRANSFER', label: 'Direct Bank Transfer', orderCount: 0, revenue: 0 },
      };

      for (const o of orders) {
        if (o.orderStatus === 'CANCELLED') continue;
        const m = o.paymentMethod || 'OTHER';
        if (!paymentMethodMap[m]) {
          paymentMethodMap[m] = { method: m, label: m.replace(/_/g, ' '), orderCount: 0, revenue: 0 };
        }
        paymentMethodMap[m].orderCount++;
        if (o.paymentStatus === 'PAID') {
          paymentMethodMap[m].revenue += o.finalTotal || 0;
        }
      }
      const paymentMethodBreakdown = Object.values(paymentMethodMap);

      // 5. Order Status Breakdown
      const statusCounts: Record<string, number> = {
        PENDING: 0,
        CONFIRMED: 0,
        PROCESSING: 0,
        SHIPPED: 0,
        DELIVERED: 0,
        CANCELLED: 0,
      };
      for (const o of orders) {
        if (statusCounts[o.orderStatus] !== undefined) {
          statusCounts[o.orderStatus]++;
        } else {
          statusCounts[o.orderStatus] = 1;
        }
      }
      const orderStatusBreakdown = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

      // 6. Top Selling Products in Date Range
      const productSalesMap: Record<string, { productId: string; name: string; image: string; pairsSold: number; revenue: number }> = {};
      for (const order of paidOrders) {
        for (const item of order.items) {
          const pId = String((item.productId as any)?._id || item.productId);
          if (!productSalesMap[pId]) {
            productSalesMap[pId] = {
              productId: pId,
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
      const topSellingProducts = Object.values(productSalesMap)
        .sort((a, b) => b.pairsSold - a.pairsSold)
        .slice(0, 10);

      // 7. Daily Sales Trend within the selected period
      const dailyMap: Record<string, { date: string; orders: number; revenue: number }> = {};
      for (const order of orders) {
        if (order.orderStatus === 'CANCELLED') continue;
        const dStr = new Date(order.createdAt).toISOString().slice(0, 10);
        if (!dailyMap[dStr]) {
          dailyMap[dStr] = { date: dStr, orders: 0, revenue: 0 };
        }
        dailyMap[dStr].orders++;
        if (order.paymentStatus === 'PAID') {
          dailyMap[dStr].revenue += order.finalTotal || 0;
        }
      }
      const dailyTrend = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

      return res.status(200).json({
        success: true,
        data: {
          totalSalesRevenue,
          totalOrders: paidOrders.length,
          totalPairsSold,
          averageOrderValue,
          pendingRevenue,
          pendingOrdersCount,
          cancelledOrdersCount,
          totalDiscountsGiven,
          dateRange: {
            startDate: start ? start.toISOString() : null,
            endDate: end ? end.toISOString() : null,
            range: resolvedRange,
          },
          paymentMethodBreakdown,
          orderStatusBreakdown,
          topSellingProducts,
          dailyTrend,
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
      const [variants, categories, brands] = await Promise.all([
        ProductVariantModel.find({ isActive: true }).populate(
          'productId',
          'name slug basePrice discountPrice images brandId categoryId'
        ),
        CategoryModel.find({ isActive: true }).lean(),
        BrandModel.find({ isActive: true }).lean(),
      ]);

      const categoryLookup = new Map<string, string>();
      for (const c of categories) {
        categoryLookup.set(String(c._id), c.name);
      }

      const brandLookup = new Map<string, string>();
      for (const b of brands) {
        brandLookup.set(String(b._id), b.name);
      }

      let totalValuation = 0;
      let totalUnits = 0;
      let healthyStockCount = 0;
      let lowStockCount = 0;
      let outOfStockCount = 0;

      const categoryValMap: Record<string, { categoryId: string; categoryName: string; units: number; valuation: number }> = {};
      const brandValMap: Record<string, { brandId: string; brandName: string; units: number; valuation: number }> = {};
      const productValMap: Record<string, { productId: string; name: string; image: string; basePrice: number; totalStock: number; totalValuation: number }> = {};

      for (const v of variants) {
        const prod = v.productId as any;
        const price = prod?.basePrice || 0;
        const units = Math.max(0, v.stockQuantity || 0);
        const itemVal = price * units;
        const threshold = v.minStockThreshold ?? 5;

        totalUnits += units;
        totalValuation += itemVal;

        if (units === 0) {
          outOfStockCount++;
        } else if (units <= threshold) {
          lowStockCount++;
        } else {
          healthyStockCount++;
        }

        if (prod) {
          const pId = String(prod._id || v.productId);
          if (!productValMap[pId]) {
            productValMap[pId] = {
              productId: pId,
              name: prod.name || 'Shoe',
              image: prod.images?.[0] || '',
              basePrice: price,
              totalStock: 0,
              totalValuation: 0,
            };
          }
          productValMap[pId].totalStock += units;
          productValMap[pId].totalValuation += itemVal;

          const catId = String(prod.categoryId?._id || prod.categoryId || 'unknown');
          const catName = categoryLookup.get(catId) || 'Uncategorized';
          if (!categoryValMap[catId]) {
            categoryValMap[catId] = { categoryId: catId, categoryName: catName, units: 0, valuation: 0 };
          }
          categoryValMap[catId].units += units;
          categoryValMap[catId].valuation += itemVal;

          const bId = String(prod.brandId?._id || prod.brandId || 'unknown');
          const bName = brandLookup.get(bId) || 'Other';
          if (!brandValMap[bId]) {
            brandValMap[bId] = { brandId: bId, brandName: bName, units: 0, valuation: 0 };
          }
          brandValMap[bId].units += units;
          brandValMap[bId].valuation += itemVal;
        }
      }

      const topValuedProducts = Object.values(productValMap)
        .sort((a, b) => b.totalValuation - a.totalValuation)
        .slice(0, 5);

      const categoryBreakdown = Object.values(categoryValMap)
        .sort((a, b) => b.valuation - a.valuation);

      const brandBreakdown = Object.values(brandValMap)
        .sort((a, b) => b.valuation - a.valuation);

      return res.status(200).json({
        success: true,
        data: {
          totalUnits,
          totalValuation,
          activeVariantsCount: variants.length,
          healthyStockCount,
          lowStockCount,
          outOfStockCount,
          categoryBreakdown,
          brandBreakdown,
          topValuedProducts,
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
