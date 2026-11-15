import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import http from 'http';
import app from '../app';
import { connectDB } from '../config/db';
import { ProductModel } from '../models/product.model';
import { ProductVariantModel } from '../models/productVariant.model';
import { StockMovementModel } from '../models/stockMovement.model';
import { CouponModel } from '../models/coupon.model';
import { UserModel, UserRole } from '../models/user.model';

async function runPhase7Tests() {
  console.log('====================================================');
  console.log('🚀 STRIDEX PHASE 7: ADMIN & INVENTORY MANAGEMENT TEST');
  console.log('====================================================');

  await connectDB();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(7550, resolve));
  const baseUrl = `http://127.0.0.1:7550/api/v1`;
  console.log(`📡 In-process test server running at ${baseUrl}`);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title}`);
      failed++;
    }
  }

  try {
    // ---------------------------------------------------------
    // 1. Authenticate All Three Roles
    // ---------------------------------------------------------
    console.log('\n--- 1. Authenticating Admin, Inventory Manager & Customer ---');

    // Admin login
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@stridex.com',
        password: 'Admin@Stridex2026!',
      }),
    });
    const adminLoginData = await adminLoginRes.json();
    const adminToken = adminLoginData.data?.accessToken;
    assert(Boolean(adminToken), 'Administrator authenticated successfully');

    // Inventory Manager login
    const managerLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'inventory@stridex.com',
        password: 'Manager@Stridex2026!',
      }),
    });
    const managerLoginData = await managerLoginRes.json();
    const managerToken = managerLoginData.data?.accessToken;
    assert(Boolean(managerToken), 'Inventory Manager authenticated successfully');

    // Customer login
    const customerLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'customer@stridex.com',
        password: 'Customer@Stridex2026!',
      }),
    });
    const customerLoginData = await customerLoginRes.json();
    const customerToken = customerLoginData.data?.accessToken;
    assert(Boolean(customerToken), 'Customer authenticated successfully');

    const adminHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    };

    const managerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${managerToken}`,
    };

    const customerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${customerToken}`,
    };

    // ---------------------------------------------------------
    // 2. Role-Based Access Control (RBAC) Verification
    // ---------------------------------------------------------
    console.log('\n--- 2. Role Permissions & Endpoint Security ---');

    // Admin can access admin dashboard stats
    const adminStatsRes = await fetch(`${baseUrl}/admin/dashboard/stats`, {
      headers: adminHeaders,
    });
    assert(adminStatsRes.status === 200, 'ADMIN granted access to /admin/dashboard/stats (HTTP 200)');

    // Admin can access inventory dashboard
    const adminInvRes = await fetch(`${baseUrl}/inventory/dashboard`, {
      headers: adminHeaders,
    });
    assert(adminInvRes.status === 200, 'ADMIN granted access to /inventory/dashboard (HTTP 200)');

    // Inventory Manager can access inventory dashboard
    const mgrInvRes = await fetch(`${baseUrl}/inventory/dashboard`, {
      headers: managerHeaders,
    });
    assert(mgrInvRes.status === 200, 'INVENTORY_MANAGER granted access to /inventory/dashboard (HTTP 200)');

    // Inventory Manager BLOCKED from admin dashboard
    const mgrAdminRes = await fetch(`${baseUrl}/admin/dashboard/stats`, {
      headers: managerHeaders,
    });
    assert(mgrAdminRes.status === 403, 'INVENTORY_MANAGER forbidden from /admin/dashboard/stats (HTTP 403)');

    // Customer BLOCKED from inventory dashboard
    const custInvRes = await fetch(`${baseUrl}/inventory/dashboard`, {
      headers: customerHeaders,
    });
    assert(custInvRes.status === 403, 'CUSTOMER forbidden from /inventory/dashboard (HTTP 403)');

    // Customer BLOCKED from admin dashboard
    const custAdminRes = await fetch(`${baseUrl}/admin/dashboard/stats`, {
      headers: customerHeaders,
    });
    assert(custAdminRes.status === 403, 'CUSTOMER forbidden from /admin/dashboard/stats (HTTP 403)');

    // ---------------------------------------------------------
    // 3. Inventory Operations: Stock-In, Stock-Out, Damaged, Adjustment
    // ---------------------------------------------------------
    console.log('\n--- 3. Inventory Management Operations & Movement Audit ---');

    // Pick an existing variant for testing
    let testVariant = await ProductVariantModel.findOne();
    if (!testVariant) {
      const prod = await ProductModel.findOne();
      testVariant = await ProductVariantModel.create({
        productId: prod?._id,
        SKU: 'TEST-SKU-P7-01',
        size: 42,
        color: 'Black/Volt',
        stockQuantity: 20,
        reservedQuantity: 0,
        minStockThreshold: 5,
        isActive: true,
      });
    }

    const initialStock = testVariant.stockQuantity;
    const variantId = (testVariant._id as any).toString();

    // 3.1 Stock-In (+10 units)
    console.log(`\n• Performing Stock-In (+10 units) on variant ${variantId} (Initial: ${initialStock})...`);
    const stockInRes = await fetch(`${baseUrl}/inventory/adjust`, {
      method: 'POST',
      headers: managerHeaders,
      body: JSON.stringify({
        variantId,
        movementType: 'STOCK_IN',
        quantity: 10,
        reason: 'Phase 7 Supplier PO #9901 Restock',
      }),
    });
    const stockInData = await stockInRes.json();
    assert(stockInRes.status === 200, 'Stock-In request succeeded (HTTP 200)');
    assert(
      stockInData.data?.variant?.stockQuantity === initialStock + 10,
      `Stock-In quantity updated correctly: ${initialStock} -> ${initialStock + 10}`
    );

    // Verify Stock Movement Record in DB
    const stockInMovement = await StockMovementModel.findById(stockInData.data?.movement?.id || stockInData.data?.movement?._id);
    assert(
      Boolean(stockInMovement && stockInMovement.movementType === 'STOCK_IN' && stockInMovement.changedQuantity === 10),
      'Stock-In movement audit ledger entry logged with accurate delta and type'
    );

    // 3.2 Stock-Out (-4 units)
    console.log('\n• Performing Stock-Out (-4 units)...');
    const stockOutRes = await fetch(`${baseUrl}/inventory/adjust`, {
      method: 'POST',
      headers: managerHeaders,
      body: JSON.stringify({
        variantId,
        movementType: 'STOCK_OUT',
        quantity: 4,
        reason: 'Phase 7 Outlet showroom display transfer',
      }),
    });
    const stockOutData = await stockOutRes.json();
    assert(stockOutRes.status === 200, 'Stock-Out request succeeded (HTTP 200)');
    assert(
      stockOutData.data?.variant?.stockQuantity === initialStock + 10 - 4,
      `Stock-Out quantity updated correctly to ${initialStock + 10 - 4}`
    );

    // 3.3 Damaged Stock (-2 units)
    console.log('\n• Recording Damaged Stock (-2 units)...');
    const damagedRes = await fetch(`${baseUrl}/inventory/adjust`, {
      method: 'POST',
      headers: managerHeaders,
      body: JSON.stringify({
        variantId,
        movementType: 'DAMAGED',
        quantity: 2,
        reason: 'Water damage during warehouse transport',
      }),
    });
    const damagedData = await damagedRes.json();
    assert(damagedRes.status === 200, 'Damaged stock deduction recorded (HTTP 200)');
    assert(
      damagedData.data?.variant?.stockQuantity === initialStock + 10 - 4 - 2,
      `Damaged stock deducted correctly to ${initialStock + 10 - 4 - 2}`
    );

    // 3.4 Audit Count Adjustment (Set to exactly 50 units)
    console.log('\n• Performing Audit Count Adjustment (Set to 50)...');
    const adjustRes = await fetch(`${baseUrl}/inventory/adjust`, {
      method: 'POST',
      headers: managerHeaders,
      body: JSON.stringify({
        variantId,
        movementType: 'ADJUSTMENT',
        quantity: 50,
        reason: 'Physical inventory annual cycle count',
      }),
    });
    const adjustData = await adjustRes.json();
    assert(adjustRes.status === 200, 'Audit Adjustment count updated (HTTP 200)');
    assert(adjustData.data?.variant?.stockQuantity === 50, 'Stock quantity adjusted to exactly 50 units');

    // 3.5 Prevent Insufficient Stock-Out
    console.log('\n• Testing Oversell/Excess Deduction Prevention...');
    const excessDeductRes = await fetch(`${baseUrl}/inventory/adjust`, {
      method: 'POST',
      headers: managerHeaders,
      body: JSON.stringify({
        variantId,
        movementType: 'STOCK_OUT',
        quantity: 99999,
        reason: 'Impossible reduction test',
      }),
    });
    assert(excessDeductRes.status === 400, 'Excess stock reduction correctly blocked with HTTP 400');

    // ---------------------------------------------------------
    // 4. Configurable Minimum Stock Thresholds & Alerts
    // ---------------------------------------------------------
    console.log('\n--- 4. Configurable Thresholds & Low-Stock Alerts ---');

    // Set threshold to 15
    const thresholdRes = await fetch(`${baseUrl}/inventory/variants/${variantId}/threshold`, {
      method: 'PATCH',
      headers: managerHeaders,
      body: JSON.stringify({ minStockThreshold: 15 }),
    });
    assert(thresholdRes.status === 200, 'Variant minimum stock threshold updated to 15 (HTTP 200)');

    // Reduce stock to 10 (which is <= 15 threshold, > 0) -> LOW_STOCK
    await fetch(`${baseUrl}/inventory/adjust`, {
      method: 'POST',
      headers: managerHeaders,
      body: JSON.stringify({
        variantId,
        movementType: 'ADJUSTMENT',
        quantity: 10,
        reason: 'Trigger low stock warning test',
      }),
    });

    const lowStockReportRes = await fetch(`${baseUrl}/inventory/low-stock-report`, {
      headers: managerHeaders,
    });
    const lowStockReportData = await lowStockReportRes.json();
    assert(lowStockReportRes.status === 200, 'Low-stock report fetched successfully (HTTP 200)');

    const matchingAlert = lowStockReportData.data?.find((i: any) => (i._id || i.id) === variantId);
    assert(
      Boolean(matchingAlert && matchingAlert.severity === 'LOW_STOCK'),
      'Variant correctly flagged with LOW_STOCK warning when stock <= threshold'
    );

    // Reduce stock to 0 -> OUT_OF_STOCK
    await fetch(`${baseUrl}/inventory/adjust`, {
      method: 'POST',
      headers: managerHeaders,
      body: JSON.stringify({
        variantId,
        movementType: 'ADJUSTMENT',
        quantity: 0,
        reason: 'Trigger out of stock alert test',
      }),
    });

    const outStockReportRes = await fetch(`${baseUrl}/inventory/low-stock-report`, {
      headers: managerHeaders,
    });
    const outStockReportData = await outStockReportRes.json();
    const zeroStockAlert = outStockReportData.data?.find((i: any) => (i._id || i.id) === variantId);
    assert(
      Boolean(zeroStockAlert && zeroStockAlert.severity === 'OUT_OF_STOCK'),
      'Variant correctly flagged with OUT_OF_STOCK warning when stock === 0'
    );

    // Restore stock to healthy count
    await fetch(`${baseUrl}/inventory/adjust`, {
      method: 'POST',
      headers: managerHeaders,
      body: JSON.stringify({
        variantId,
        movementType: 'ADJUSTMENT',
        quantity: 30,
        reason: 'Restoring variant to healthy stock',
      }),
    });

    // ---------------------------------------------------------
    // 5. Inventory Dashboard & Movement Ledger API
    // ---------------------------------------------------------
    console.log('\n--- 5. Inventory Dashboard Metrics & Movement History ---');

    const invDashboardRes = await fetch(`${baseUrl}/inventory/dashboard`, {
      headers: managerHeaders,
    });
    const invDashboardData = await invDashboardRes.json();
    assert(invDashboardRes.status === 200, 'Inventory dashboard stats returned HTTP 200');
    assert(typeof invDashboardData.data?.totalVariants === 'number', 'Inventory dashboard contains totalVariants');
    assert(typeof invDashboardData.data?.availableStock === 'number', 'Inventory dashboard contains availableStock');
    assert(typeof invDashboardData.data?.totalStockValueLKR === 'number', 'Inventory dashboard contains totalStockValueLKR in Sri Lankan Rupees');
    assert(Array.isArray(invDashboardData.data?.recentMovements), 'Inventory dashboard contains recentMovements list');

    const movementsRes = await fetch(`${baseUrl}/inventory/movements?page=1&limit=10`, {
      headers: managerHeaders,
    });
    const movementsData = await movementsRes.json();
    assert(movementsRes.status === 200, 'Paginated movements ledger returned HTTP 200');
    assert(Array.isArray(movementsData.data), 'Movements ledger contains records array');
    assert(Boolean(movementsData.pagination), 'Movements ledger provides pagination info');

    // ---------------------------------------------------------
    // 6. Admin Dashboard, Analytics & Reporting APIs
    // ---------------------------------------------------------
    console.log('\n--- 6. Admin Analytics, Customers, and Reports ---');

    const adminStats = await (await fetch(`${baseUrl}/admin/dashboard/stats`, { headers: adminHeaders })).json();
    assert(typeof adminStats.data?.totalRevenue === 'number', 'Admin stats contains totalRevenue');
    assert(typeof adminStats.data?.totalOrders === 'number', 'Admin stats contains totalOrders');
    assert(typeof adminStats.data?.totalCustomers === 'number', 'Admin stats contains totalCustomers');
    assert(typeof adminStats.data?.totalProducts === 'number', 'Admin stats contains totalProducts');
    assert(Array.isArray(adminStats.data?.monthlySales), 'Admin stats contains monthlySales chart array');
    assert(Array.isArray(adminStats.data?.recentOrders), 'Admin stats contains recentOrders array');
    assert(Array.isArray(adminStats.data?.topSellingShoes), 'Admin stats contains topSellingShoes array');

    // Sales Report API
    const salesReportRes = await fetch(`${baseUrl}/admin/reports/sales`, { headers: adminHeaders });
    const salesReportData = await salesReportRes.json();
    assert(salesReportRes.status === 200, 'Sales report API returned HTTP 200');
    assert(typeof salesReportData.data?.totalSalesRevenue === 'number', 'Sales report contains totalSalesRevenue');
    assert(typeof salesReportData.data?.totalPairsSold === 'number', 'Sales report contains totalPairsSold');

    // Inventory Valuation API
    const valReportRes = await fetch(`${baseUrl}/admin/reports/inventory-valuation`, { headers: adminHeaders });
    const valReportData = await valReportRes.json();
    assert(valReportRes.status === 200, 'Inventory valuation API returned HTTP 200');
    assert(typeof valReportData.data?.totalValuation === 'number', 'Valuation report contains totalValuation');

    // Customers List API
    const customersRes = await fetch(`${baseUrl}/admin/customers`, { headers: adminHeaders });
    const customersData = await customersRes.json();
    assert(customersRes.status === 200, 'Customers list API returned HTTP 200');
    assert(Array.isArray(customersData.data), 'Customers list returns array with order count and total spend');

    // ---------------------------------------------------------
    // 7. Coupons & Reviews Moderation APIs
    // ---------------------------------------------------------
    console.log('\n--- 7. Coupons and Customer Review Moderation ---');

    // Create a coupon
    const testCouponCode = `TESTPROMO${Date.now().toString().slice(-4)}`;
    const createCouponRes = await fetch(`${baseUrl}/coupons`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        code: testCouponCode,
        discountType: 'PERCENTAGE',
        discountValue: 15,
        minOrderAmount: 5000,
        maxDiscountAmount: 3000,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 86400000 * 30).toISOString(),
        usageLimit: 100,
        isActive: true,
      }),
    });
    const couponData = await createCouponRes.json();
    assert(createCouponRes.status === 201, `Coupon ${testCouponCode} created by Admin (HTTP 201)`);

    // List coupons
    const listCouponsRes = await fetch(`${baseUrl}/coupons`, { headers: adminHeaders });
    const listCouponsData = await listCouponsRes.json();
    assert(listCouponsRes.status === 200, 'Coupons list returned HTTP 200');
    assert(
      listCouponsData.data?.some((c: any) => c.code === testCouponCode),
      'Created coupon found in coupons list'
    );

    // Reviews list
    const reviewsRes = await fetch(`${baseUrl}/reviews`, { headers: adminHeaders });
    assert(reviewsRes.status === 200, 'Reviews administration list returned HTTP 200');

    // ---------------------------------------------------------
    // Summary
    // ---------------------------------------------------------
    console.log('\n====================================================');
    console.log(`📊 PHASE 7 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Unhandled Exception in Phase 7 Test Suite:', error);
    process.exit(1);
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

runPhase7Tests();
