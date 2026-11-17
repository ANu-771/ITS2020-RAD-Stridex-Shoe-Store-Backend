import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import http from 'http';
import app from '../app';
import { connectDB } from '../config/db';
import { OrderModel } from '../models/order.model';
import { ProductModel } from '../models/product.model';
import { ProductVariantModel } from '../models/productVariant.model';
import { UserModel, UserRole } from '../models/user.model';

async function runPhase8ReportTests() {
  console.log('================================================================');
  console.log('📊 STRIDEX PHASE 8: ADMIN REPORTS REVIEW & ACCURACY TEST SUITE');
  console.log('================================================================');

  await connectDB();

  const testPort = 7890;
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(testPort, resolve));
  const baseUrl = `http://127.0.0.1:${testPort}/api/v1`;
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
    // 1. Role Authentication & Access Control Verification
    // ---------------------------------------------------------
    console.log('\n--- 1. Testing Role Authentication & Report Security Boundaries ---');

    // Admin login
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@stridex.com', password: 'Admin@Stridex2026!' }),
    });
    const adminData = await adminLoginRes.json();
    assert(adminLoginRes.status === 200 && adminData.success, 'Admin authenticated successfully');
    const adminToken = adminData.data?.accessToken;
    const adminHeaders = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };

    // Customer login (or register customer if not exists)
    let customerToken = '';
    const customerLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'customer@stridex.com', password: 'Customer@Stridex2026!' }),
    });
    if (customerLoginRes.status === 200) {
      const custData = await customerLoginRes.json();
      customerToken = custData.data?.accessToken;
    } else {
      const regRes = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Reports Test Customer',
          email: 'report_customer@stridex.com',
          password: 'CustomerPassword123!',
          phone: '+94771234567',
        }),
      });
      const regData = await regRes.json();
      customerToken = regData.data?.accessToken;
    }
    const customerHeaders = { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' };

    // Test Security Boundaries (Unauthenticated & Customer Access Prohibited)
    const unauthSalesRes = await fetch(`${baseUrl}/admin/reports/sales`);
    assert(unauthSalesRes.status === 401, 'Unauthenticated request to /admin/reports/sales rejected with HTTP 401');

    const customerSalesRes = await fetch(`${baseUrl}/admin/reports/sales`, { headers: customerHeaders });
    assert(customerSalesRes.status === 403, 'Customer request to /admin/reports/sales rejected with HTTP 403 Forbidden');

    const unauthValuationRes = await fetch(`${baseUrl}/admin/reports/inventory-valuation`);
    assert(unauthValuationRes.status === 401, 'Unauthenticated request to /admin/reports/inventory-valuation rejected with HTTP 401');

    const customerValuationRes = await fetch(`${baseUrl}/admin/reports/inventory-valuation`, { headers: customerHeaders });
    assert(customerValuationRes.status === 403, 'Customer request to /admin/reports/inventory-valuation rejected with HTTP 403 Forbidden');

    // ---------------------------------------------------------
    // 2. Dashboard Statistics & Revenue Accuracy
    // ---------------------------------------------------------
    console.log('\n--- 2. Testing Dashboard Statistics & Cancelled Order Revenue Handling ---');

    const statsRes = await fetch(`${baseUrl}/admin/dashboard/stats`, { headers: adminHeaders });
    assert(statsRes.status === 200, 'Admin dashboard stats fetched successfully (HTTP 200)');
    const statsData = await statsRes.json();
    const stats = statsData.data;

    // Database verification of revenue
    const allDbOrders = await OrderModel.find();
    const expectedRealizedRevenue = allDbOrders
      .filter((o) => o.paymentStatus === 'PAID' && o.orderStatus !== 'CANCELLED')
      .reduce((sum, o) => sum + (o.finalTotal || 0), 0);

    assert(
      stats.totalRevenue === expectedRealizedRevenue,
      `Total Revenue strictly equals realized paid orders (Rs. ${stats.totalRevenue.toLocaleString()} === expected Rs. ${expectedRealizedRevenue.toLocaleString()})`
    );

    // Check that cancelled orders are NOT in realized revenue
    const cancelledDbOrders = allDbOrders.filter((o) => o.orderStatus === 'CANCELLED');
    const cancelledWithPaidFlag = cancelledDbOrders.filter((o) => o.paymentStatus === 'PAID');
    const cancelledPaidTotal = cancelledWithPaidFlag.reduce((sum, o) => sum + (o.finalTotal || 0), 0);
    console.log(`ℹ️ Cancelled orders in DB: ${cancelledDbOrders.length} (Paid: ${cancelledWithPaidFlag.length}, Total Rs. ${cancelledPaidTotal})`);

    // Verify monthly sales excludes cancelled orders from revenue
    let monthlyRevenueSum = 0;
    for (const m of stats.monthlySales) {
      monthlyRevenueSum += m.revenue;
    }
    assert(
      monthlyRevenueSum <= expectedRealizedRevenue,
      'Monthly sales revenue sum does not exceed total database realized revenue'
    );

    // ---------------------------------------------------------
    // 3. Sales Report & Date Range Filters
    // ---------------------------------------------------------
    console.log('\n--- 3. Testing Sales Report Calculations & Date Filters ---');

    // All Time Range
    const salesAllRes = await fetch(`${baseUrl}/admin/reports/sales?range=all`, { headers: adminHeaders });
    assert(salesAllRes.status === 200, 'Sales report (All Time) fetched successfully');
    const salesAll = (await salesAllRes.json()).data;

    assert(typeof salesAll.totalSalesRevenue === 'number', 'Sales report returns numeric totalSalesRevenue');
    assert(salesAll.totalSalesRevenue === expectedRealizedRevenue, 'Sales report totalSalesRevenue matches exact DB realized revenue');
    assert(typeof salesAll.totalOrders === 'number', 'Sales report returns numeric totalOrders');
    assert(typeof salesAll.totalPairsSold === 'number', 'Sales report returns numeric totalPairsSold');
    assert(typeof salesAll.averageOrderValue === 'number', 'Sales report returns numeric averageOrderValue');
    assert(Array.isArray(salesAll.paymentMethodBreakdown), 'Sales report returns paymentMethodBreakdown array');
    assert(Array.isArray(salesAll.orderStatusBreakdown), 'Sales report returns orderStatusBreakdown array');
    assert(Array.isArray(salesAll.topSellingProducts), 'Sales report returns topSellingProducts array');

    // Preset Date Filters: Today
    const salesTodayRes = await fetch(`${baseUrl}/admin/reports/sales?range=today`, { headers: adminHeaders });
    assert(salesTodayRes.status === 200, 'Sales report (Today) fetched successfully');
    const salesToday = (await salesTodayRes.json()).data;
    assert(salesToday.dateRange.range === 'today', 'Date range preset confirmed as "today"');

    // Preset Date Filters: Last 7 Days
    const sales7Res = await fetch(`${baseUrl}/admin/reports/sales?range=last7days`, { headers: adminHeaders });
    assert(sales7Res.status === 200, 'Sales report (Last 7 Days) fetched successfully');
    const sales7 = (await sales7Res.json()).data;
    assert(sales7.dateRange.range === 'last7days', 'Date range preset confirmed as "last7days"');

    // Preset Date Filters: Last 30 Days
    const sales30Res = await fetch(`${baseUrl}/admin/reports/sales?range=last30days`, { headers: adminHeaders });
    assert(sales30Res.status === 200, 'Sales report (Last 30 Days) fetched successfully');
    const sales30 = (await sales30Res.json()).data;
    assert(sales30.dateRange.range === 'last30days', 'Date range preset confirmed as "last30days"');

    // Custom Date Range (Inclusive End of Day Verification)
    const customStart = '2026-01-01';
    const customEnd = '2026-12-31';
    const salesCustomRes = await fetch(
      `${baseUrl}/admin/reports/sales?startDate=${customStart}&endDate=${customEnd}`,
      { headers: adminHeaders }
    );
    assert(salesCustomRes.status === 200, 'Sales report with custom date range fetched successfully');
    const salesCustom = (await salesCustomRes.json()).data;
    assert(salesCustom.dateRange.range === 'custom', 'Custom range successfully resolved');
    assert(
      new Date(salesCustom.dateRange.endDate).getHours() === 23,
      'Custom end date correctly set to inclusive end of day (23:59:59.999)'
    );

    // Empty Period Verification (Future Date Range where 0 orders exist)
    const futureSalesRes = await fetch(
      `${baseUrl}/admin/reports/sales?startDate=2030-01-01&endDate=2030-01-31`,
      { headers: adminHeaders }
    );
    assert(futureSalesRes.status === 200, 'Future date range request returns HTTP 200 without crashing');
    const futureSales = (await futureSalesRes.json()).data;
    assert(futureSales.totalSalesRevenue === 0, 'Empty range correctly yields 0 totalSalesRevenue');
    assert(futureSales.totalOrders === 0, 'Empty range correctly yields 0 totalOrders');
    assert(futureSales.totalPairsSold === 0, 'Empty range correctly yields 0 totalPairsSold');
    assert(futureSales.topSellingProducts.length === 0, 'Empty range yields empty topSellingProducts array');

    // ---------------------------------------------------------
    // 4. Inventory Valuation & Stock Health Verification
    // ---------------------------------------------------------
    console.log('\n--- 4. Testing Inventory Asset Valuation & Category/Brand Breakdowns ---');

    const valRes = await fetch(`${baseUrl}/admin/reports/inventory-valuation`, { headers: adminHeaders });
    assert(valRes.status === 200, 'Inventory valuation report fetched successfully');
    const valData = (await valRes.json()).data;

    // Verify against actual database ProductVariant documents
    const dbVariants = await ProductVariantModel.find({ isActive: true }).populate('productId', 'basePrice');
    let dbCalculatedUnits = 0;
    let dbCalculatedValuation = 0;
    let dbHealthy = 0;
    let dbLow = 0;
    let dbOut = 0;

    for (const v of dbVariants) {
      const u = Math.max(0, v.stockQuantity || 0);
      const p = (v.productId as any)?.basePrice || 0;
      const t = v.minStockThreshold ?? 5;
      dbCalculatedUnits += u;
      dbCalculatedValuation += p * u;
      if (u === 0) dbOut++;
      else if (u <= t) dbLow++;
      else dbHealthy++;
    }

    assert(valData.totalUnits === dbCalculatedUnits, `Total warehouse units matches DB variants (${valData.totalUnits} === ${dbCalculatedUnits})`);
    assert(valData.totalValuation === dbCalculatedValuation, `Total warehouse valuation matches DB calculation (Rs. ${valData.totalValuation.toLocaleString()} === Rs. ${dbCalculatedValuation.toLocaleString()})`);
    assert(valData.healthyStockCount === dbHealthy, `Healthy stock SKUs matches DB (${valData.healthyStockCount} === ${dbHealthy})`);
    assert(valData.lowStockCount === dbLow, `Low stock SKUs matches DB (${valData.lowStockCount} === ${dbLow})`);
    assert(valData.outOfStockCount === dbOut, `Out of stock SKUs matches DB (${valData.outOfStockCount} === ${dbOut})`);
    assert(Array.isArray(valData.categoryBreakdown), 'Valuation report returns categoryBreakdown array');
    assert(Array.isArray(valData.brandBreakdown), 'Valuation report returns brandBreakdown array');
    assert(Array.isArray(valData.topValuedProducts), 'Valuation report returns topValuedProducts array');

    // ---------------------------------------------------------
    // 5. Low-Stock Audit Report (Inventory Controller)
    // ---------------------------------------------------------
    console.log('\n--- 5. Testing Low-Stock & Out-of-Stock Audit Report ---');

    const lowStockReportRes = await fetch(`${baseUrl}/inventory/low-stock-report`, { headers: adminHeaders });
    assert(lowStockReportRes.status === 200, 'Low-stock report fetched successfully (HTTP 200)');
    const lowStockReport = await lowStockReportRes.json();
    assert(Array.isArray(lowStockReport.data), 'Low-stock report returns data array');
    assert(lowStockReport.total === (dbLow + dbOut), `Total low/out stock items matches DB calculation (${lowStockReport.total} === ${dbLow + dbOut})`);

    // Verify all returned items have valid severity tag
    const allSeveritiesValid = lowStockReport.data.every(
      (item: any) => item.severity === 'LOW_STOCK' || item.severity === 'OUT_OF_STOCK'
    );
    assert(allSeveritiesValid, 'All low-stock report items have valid severity tags (LOW_STOCK or OUT_OF_STOCK)');

    // ---------------------------------------------------------
    // 6. Admin Orders Overview Summary Accuracy
    // ---------------------------------------------------------
    console.log('\n--- 6. Testing Admin Orders Overview Summary Consistency ---');

    const ordersOverviewRes = await fetch(`${baseUrl}/orders/admin/all`, { headers: adminHeaders });
    assert(ordersOverviewRes.status === 200, 'Admin orders overview fetched successfully');
    const ordersOverview = await ordersOverviewRes.json();
    const summary = ordersOverview.summary;

    assert(
      summary.totalRevenue === expectedRealizedRevenue,
      `Orders overview totalRevenue strictly matches realized paid orders (Rs. ${summary.totalRevenue.toLocaleString()} === Rs. ${expectedRealizedRevenue.toLocaleString()})`
    );
    assert(summary.totalOrders === allDbOrders.length, `Orders overview totalOrders matches DB count (${summary.totalOrders} === ${allDbOrders.length})`);
    assert(summary.cancelledCount === cancelledDbOrders.length, `Orders overview cancelledCount matches DB (${summary.cancelledCount} === ${cancelledDbOrders.length})`);

    console.log('\n================================================================');
    console.log(`📊 PHASE 8 REPORT TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================');

    server.close();
    process.exit(failed > 0 ? 1 : 0);
  } catch (error: any) {
    console.error('❌ Test suite encountered unhandled exception:', error);
    server.close();
    process.exit(1);
  }
}

runPhase8ReportTests();
