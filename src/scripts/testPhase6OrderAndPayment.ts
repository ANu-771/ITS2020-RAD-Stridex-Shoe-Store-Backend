import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import http from 'http';
import app from '../app';
import { connectDB } from '../config/db';
import { ProductModel } from '../models/product.model';
import { ProductVariantModel } from '../models/productVariant.model';
import { OrderModel } from '../models/order.model';

async function runPhase6Tests() {
  console.log('====================================================');
  console.log('📦 STRIDEX PHASE 6: ORDER MANAGEMENT & PAYMENT TEST');
  console.log('====================================================');

  await connectDB();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}/api/v1`;
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
    // 1. Authenticate Customer & Admin
    // ---------------------------------------------------------
    console.log('\n--- 1. Authenticating Customer and Admin Accounts ---');
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

    const customerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${customerToken}`,
    };

    const adminHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    };

    // Locate an active product & variant for testing
    const testProduct = await ProductModel.findOne({ isActive: true });
    if (!testProduct) throw new Error('No active products in database to test orders');

    let testVariant = await ProductVariantModel.findOne({
      productId: testProduct._id,
      isActive: true,
      stockQuantity: { $gt: 5 },
    });

    if (!testVariant) {
      // Create fresh variant for test if stock is low
      testVariant = await ProductVariantModel.create({
        productId: testProduct._id,
        SKU: `TEST-P6-${Date.now()}`,
        size: 42,
        color: 'Speed White',
        stockQuantity: 20,
        reservedQuantity: 0,
        isActive: true,
      });
    }

    console.log(`Test Footwear: "${testProduct.name}" (Variant: Size ${testVariant.size}, ${testVariant.color}, Initial Stock: ${testVariant.stockQuantity})`);

    // ---------------------------------------------------------
    // 2. Testing Cash on Delivery (COD) Order Creation
    // ---------------------------------------------------------
    console.log('\n--- 2. Testing Cash on Delivery (COD) Flow ---');
    const initialStock = testVariant.stockQuantity;

    const codOrderRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        customerDetails: {
          fullName: 'Kamal Perera',
          phone: '+94771234567',
          email: 'kamal.test@stridex.com',
          deliveryAddress: 'No. 45 Galle Road',
          city: 'Colombo',
          postalCode: '00300',
          deliveryNotes: 'Call upon arrival',
        },
        items: [
          {
            productId: testProduct._id.toString(),
            variantId: testVariant._id.toString(),
            size: testVariant.size,
            color: testVariant.color,
            quantity: 2,
          },
        ],
        paymentMethod: 'CASH_ON_DELIVERY',
      }),
    });

    const codOrderData = await codOrderRes.json();
    assert(codOrderRes.status === 201, 'COD order created with 201 Created');
    assert(codOrderData.data?.paymentMethod === 'CASH_ON_DELIVERY', 'Payment method recorded as CASH_ON_DELIVERY');
    assert(codOrderData.data?.orderStatus === 'CONFIRMED', 'COD order automatically allocated with CONFIRMED status');
    assert(codOrderData.data?.paymentStatus === 'PENDING', 'COD payment status is initially PENDING');
    assert(codOrderData.data?.items?.[0]?.name === testProduct.name, 'Order snapshot retained original product title');
    assert(typeof codOrderData.data?.finalTotal === 'number', `Total in LKR: Rs. ${codOrderData.data?.finalTotal}`);

    // Check stock decrement
    const afterCodVariant = await ProductVariantModel.findById(testVariant._id);
    assert(afterCodVariant!.stockQuantity === initialStock - 2, `Variant stock atomically decremented from ${initialStock} to ${afterCodVariant!.stockQuantity}`);

    const codOrderId = codOrderData.data?.id;

    // ---------------------------------------------------------
    // 3. Admin Cash Collection Recording
    // ---------------------------------------------------------
    console.log('\n--- 3. Admin Records COD Cash Collection ---');
    const updatePayRes = await fetch(`${baseUrl}/orders/${codOrderId}/payment-status`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        paymentStatus: 'PAID',
        note: 'Courier deposited collected cash into Colombo branch register',
      }),
    });
    const updatePayData = await updatePayRes.json();
    assert(updatePayRes.status === 200, 'Admin payment status update returned 200 OK');
    assert(updatePayData.data?.paymentStatus === 'PAID', 'COD Order payment status transitioned to PAID');
    assert(Boolean(updatePayData.data?.paymentDetails?.paidAt), 'Timestamp recorded for paidAt');

    // ---------------------------------------------------------
    // 4. Simulated Online Card Payment - Success Outcome
    // ---------------------------------------------------------
    console.log('\n--- 4. Simulated Online Card Payment (Success) ---');
    const onlineOrderRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        customerDetails: {
          fullName: 'Nimal Silva',
          phone: '+94779876543',
          email: 'nimal.test@stridex.com',
          deliveryAddress: 'No. 12 Kandy Road',
          city: 'Kandy',
          postalCode: '20000',
        },
        items: [
          {
            productId: testProduct._id.toString(),
            variantId: testVariant._id.toString(),
            size: testVariant.size,
            color: testVariant.color,
            quantity: 1,
          },
        ],
        paymentMethod: 'ONLINE_CARD',
      }),
    });
    const onlineOrderData = await onlineOrderRes.json();
    assert(onlineOrderRes.status === 201, 'Online card order registered with 201 Created');
    assert(onlineOrderData.data?.orderStatus === 'PENDING', 'Online card order status is initially PENDING payment');
    assert(onlineOrderData.data?.paymentStatus === 'PENDING', 'Payment status is initially PENDING');

    const onlineOrderId = onlineOrderData.data?.id;

    // Customer triggers Simulated Payment (Approved)
    const simSuccessRes = await fetch(`${baseUrl}/orders/${onlineOrderId}/pay`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        simulationResult: 'SUCCESS',
        cardBrand: 'Visa',
        last4: '4242',
      }),
    });
    const simSuccessData = await simSuccessRes.json();
    assert(simSuccessRes.status === 200, 'Payment simulator returned 200 OK');
    assert(simSuccessData.data?.paymentStatus === 'PAID', 'Order payment status updated to PAID');
    assert(simSuccessData.data?.orderStatus === 'CONFIRMED', 'Order status promoted to CONFIRMED');
    assert(simSuccessData.data?.paymentDetails?.transactionId?.startsWith('TXN-SIM-'), 'Demo transaction ID generated');

    // ---------------------------------------------------------
    // 5. Simulated Online Card Payment - Failure & Retry Flow
    // ---------------------------------------------------------
    console.log('\n--- 5. Simulated Online Card Payment (Failure & Retry) ---');
    const failOrderRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        customerDetails: {
          fullName: 'Saman Kumara',
          phone: '+94712223344',
          email: 'saman.test@stridex.com',
          deliveryAddress: 'No. 88 Marine Drive',
          city: 'Colombo',
          postalCode: '00300',
        },
        items: [
          {
            productId: testProduct._id.toString(),
            variantId: testVariant._id.toString(),
            size: testVariant.size,
            color: testVariant.color,
            quantity: 1,
          },
        ],
        paymentMethod: 'ONLINE_CARD',
      }),
    });
    const failOrderData = await failOrderRes.json();
    const failOrderId = failOrderData.data?.id;

    // Trigger failure simulation
    const simFailRes = await fetch(`${baseUrl}/orders/${failOrderId}/pay`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        simulationResult: 'FAILED',
        notes: 'Simulated Card Expired / Insufficient Balance',
      }),
    });
    const simFailData = await simFailRes.json();
    assert(simFailRes.status === 200, 'Simulator processed failure test');
    assert(simFailData.data?.paymentStatus === 'FAILED', 'Payment status updated to FAILED');

    // Retry simulation with SUCCESS
    const retryRes = await fetch(`${baseUrl}/orders/${failOrderId}/pay`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        simulationResult: 'SUCCESS',
        cardBrand: 'MasterCard',
        last4: '8888',
      }),
    });
    const retryData = await retryRes.json();
    assert(retryData.data?.paymentStatus === 'PAID', 'Retry payment simulation succeeded and updated to PAID');

    // ---------------------------------------------------------
    // 6. Order Cancellation & Stock Restoration
    // ---------------------------------------------------------
    console.log('\n--- 6. Order Cancellation & Safe Stock Restoration ---');
    const stockBeforeCancelOrder = (await ProductVariantModel.findById(testVariant._id))!.stockQuantity;

    // Place an order to cancel
    const cancelOrderRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        customerDetails: {
          fullName: 'Test Cancel User',
          phone: '+94715556677',
          email: 'cancel.test@stridex.com',
          deliveryAddress: 'Temple Road',
          city: 'Colombo',
          postalCode: '00300',
        },
        items: [
          {
            productId: testProduct._id.toString(),
            variantId: testVariant._id.toString(),
            size: testVariant.size,
            color: testVariant.color,
            quantity: 3,
          },
        ],
        paymentMethod: 'CASH_ON_DELIVERY',
      }),
    });
    const cancelOrderData = await cancelOrderRes.json();
    const orderToCancelId = cancelOrderData.data?.id;

    const stockAfterDeduct = (await ProductVariantModel.findById(testVariant._id))!.stockQuantity;
    assert(stockAfterDeduct === stockBeforeCancelOrder - 3, `Stock decremented by 3 before cancellation`);

    // Customer cancels order
    const cancelReqRes = await fetch(`${baseUrl}/orders/${orderToCancelId}/cancel`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({ reason: 'Ordered incorrect shoe size' }),
    });
    const cancelReqData = await cancelReqRes.json();
    assert(cancelReqRes.status === 200, 'Order cancel endpoint returned 200 OK');
    assert(cancelReqData.data?.orderStatus === 'CANCELLED', 'Order status marked as CANCELLED');
    assert(cancelReqData.data?.stockRestored === true, 'stockRestored flag set to true');

    const stockAfterCancel = (await ProductVariantModel.findById(testVariant._id))!.stockQuantity;
    assert(stockAfterCancel === stockBeforeCancelOrder, `Stock restored back to original: ${stockAfterCancel}`);

    // ---------------------------------------------------------
    // 7. Duplicate Stock Restoration Prevention
    // ---------------------------------------------------------
    console.log('\n--- 7. Prevention of Duplicate Stock Restoration ---');
    const duplicateCancelRes = await fetch(`${baseUrl}/orders/${orderToCancelId}/cancel`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({ reason: 'Second cancellation attempt' }),
    });
    assert(duplicateCancelRes.status === 400, 'Second cancellation attempt rejected with 400 Bad Request');

    const stockAfterDupCancel = (await ProductVariantModel.findById(testVariant._id))!.stockQuantity;
    assert(stockAfterDupCancel === stockBeforeCancelOrder, 'Variant stock remained identical (no duplicate increment)');

    // ---------------------------------------------------------
    // 8. Admin Status Management
    // ---------------------------------------------------------
    console.log('\n--- 8. Admin Order Status Workflow ---');
    const statusUpdateRes = await fetch(`${baseUrl}/orders/${codOrderId}/status`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        orderStatus: 'PROCESSING',
        note: 'Order dispatched to packaging line',
      }),
    });
    const statusUpdateData = await statusUpdateRes.json();
    assert(statusUpdateRes.status === 200, 'Admin status update succeeded');
    assert(statusUpdateData.data?.orderStatus === 'PROCESSING', 'Status moved to PROCESSING');

    const shipRes = await fetch(`${baseUrl}/orders/${codOrderId}/status`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        orderStatus: 'SHIPPED',
        note: 'Handed to Prompt Xpress courier tracking #PX-8291',
      }),
    });
    const shipData = await shipRes.json();
    assert(shipData.data?.orderStatus === 'SHIPPED', 'Status moved to SHIPPED');

    // ---------------------------------------------------------
    // 9. Insufficient Stock Prevention
    // ---------------------------------------------------------
    console.log('\n--- 9. Insufficient Stock Prevention ---');
    const overStockRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        customerDetails: {
          fullName: 'Greedy Buyer',
          phone: '+94770000000',
          email: 'greedy@stridex.com',
          deliveryAddress: 'Somewhere',
          city: 'Colombo',
          postalCode: '00300',
        },
        items: [
          {
            productId: testProduct._id.toString(),
            variantId: testVariant._id.toString(),
            size: testVariant.size,
            color: testVariant.color,
            quantity: 99999,
          },
        ],
        paymentMethod: 'CASH_ON_DELIVERY',
      }),
    });
    assert(overStockRes.status === 400, 'Excessive stock quantity safely rejected with 400 Bad Request');

    // ---------------------------------------------------------
    // 10. Admin Orders Overview, Search & Filter
    // ---------------------------------------------------------
    console.log('\n--- 10. Admin Orders Overview, Search & Filter ---');
    const adminOrdersRes = await fetch(`${baseUrl}/orders/admin/all?search=${codOrderData.data?.orderNumber}`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const adminOrdersData = await adminOrdersRes.json();
    assert(adminOrdersRes.status === 200, 'Admin retrieved orders overview');
    assert(adminOrdersData.data?.length >= 1, `Found matching order by search query: ${codOrderData.data?.orderNumber}`);
    assert(typeof adminOrdersData.summary?.totalOrders === 'number', 'Summary totalOrders metric returned');
    assert(typeof adminOrdersData.summary?.totalRevenue === 'number', 'Summary totalRevenue metric returned in LKR');

    console.log('\n====================================================');
    console.log(`📊 PHASE 6 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
    console.log('====================================================\n');
  } catch (err: any) {
    console.error('Fatal test error:', err);
  } finally {
    server.close();
    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runPhase6Tests();
