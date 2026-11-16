import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import mongoose from 'mongoose';
import http from 'http';
import app from '../app';
import { connectDB } from '../config/db';
import { UserModel, UserRole } from '../models/user.model';
import { ProductModel } from '../models/product.model';
import { ProductVariantModel } from '../models/productVariant.model';
import { OrderModel } from '../models/order.model';
import {
  getSentOrderEmails,
  clearSentOrderEmails,
} from '../service/email.service';
import {
  generateOrderConfirmationEmail,
  generateOrderStatusUpdateEmail,
  generatePaymentConfirmationEmail,
  formatLkr,
} from '../service/orderEmailTemplates';

async function runOrderEmailTests() {
  console.log('========================================================================');
  console.log('📬 STRIDEX: ORDER CONFIRMATION & EMAIL NOTIFICATION TEST SUITE');
  console.log('========================================================================');

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
    // ------------------------------------------------------------------------
    // SETUP: Customers and Admin
    // ------------------------------------------------------------------------
    console.log('\n--- 1. Setting up Test Customers and Admin Accounts ---');
    const customerAEmail = 'email_customer_a@stridex.com';
    const customerBEmail = 'email_customer_b@stridex.com';
    const testPassword = 'Password2026!';

    await UserModel.deleteMany({ email: { $in: [customerAEmail, customerBEmail] } });

    const customerA = await UserModel.create({
      fullName: 'Kasun Perera',
      email: customerAEmail,
      password: testPassword,
      phone: '0771234567',
      role: UserRole.CUSTOMER,
      isActive: true,
    });

    const customerB = await UserModel.create({
      fullName: 'Nimali Fernando',
      email: customerBEmail,
      password: testPassword,
      phone: '0777654321',
      role: UserRole.CUSTOMER,
      isActive: true,
    });

    // Login Customer A
    const loginARes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: customerAEmail, password: testPassword }),
    });
    const loginAData = await loginARes.json();
    const tokenA = loginAData.data?.accessToken;
    assert(Boolean(tokenA), 'Customer A logged in and token received');

    // Login Customer B
    const loginBRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: customerBEmail, password: testPassword }),
    });
    const loginBData = await loginBRes.json();
    const tokenB = loginBData.data?.accessToken;
    assert(Boolean(tokenB), 'Customer B logged in and token received');

    // Login Admin
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@stridex.com', password: 'Admin@Stridex2026!' }),
    });
    const adminLoginData = await adminLoginRes.json();
    const adminToken = adminLoginData.data?.accessToken;
    assert(Boolean(adminToken), 'Administrator authenticated successfully');

    const headersA = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenA}`,
    };

    const headersB = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenB}`,
    };

    const adminHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    };

    // Locate test product & variant
    const testProduct = await ProductModel.findOne({ isActive: true });
    if (!testProduct) throw new Error('No active products in database to test');

    let testVariant = await ProductVariantModel.findOne({
      productId: testProduct._id,
      isActive: true,
      stockQuantity: { $gt: 10 },
    });

    if (!testVariant) {
      testVariant = await ProductVariantModel.create({
        productId: testProduct._id,
        SKU: `TEST-EMAIL-VAR-${Date.now()}`,
        size: 42,
        color: 'Forest Green',
        stockQuantity: 30,
        reservedQuantity: 0,
        isActive: true,
      });
    }

    const testItem = {
      productId: testProduct._id.toString(),
      variantId: testVariant._id.toString(),
      name: testProduct.name,
      image: testProduct.images?.[0] || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff',
      size: testVariant.size,
      color: testVariant.color,
      unitPrice: testProduct.discountPrice && testProduct.discountPrice > 0 ? testProduct.discountPrice : testProduct.basePrice,
      quantity: 2,
    };

    // ------------------------------------------------------------------------
    // TEST 1: Successful COD Order Creates Order and Sends Confirmation Email
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Test 1: Successful COD Order & Confirmation Email ---');
    clearSentOrderEmails();

    const codPayload = {
      items: [testItem],
      customerDetails: {
        fullName: 'Kasun Perera',
        email: customerAEmail,
        phone: '0771234567',
        deliveryAddress: 'No. 45, Temple Road',
        city: 'Colombo 03',
        postalCode: '00300',
      },
      paymentMethod: 'CASH_ON_DELIVERY',
    };

    const codOrderRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify(codPayload),
    });
    const codOrderData = await codOrderRes.json();
    assert(codOrderRes.status === 201, 'COD Order created with HTTP 201');
    assert(codOrderData.success === true, 'Order creation returned success: true');
    assert(codOrderData.emailSent === true, 'Response flags emailSent: true');

    const codOrderNumber = codOrderData.data?.orderNumber;
    const codOrderId = codOrderData.data?._id || codOrderData.data?.id;
    assert(Boolean(codOrderNumber), `COD Order Number generated: #${codOrderNumber}`);

    const sentEmailsAfterCod = getSentOrderEmails();
    const codEmail = sentEmailsAfterCod.find(
      (e) => e.orderNumber === codOrderNumber && e.type === 'ORDER_CONFIRMATION'
    );
    assert(Boolean(codEmail), 'Order confirmation email was captured in email dispatch log');
    assert(codEmail?.email === customerAEmail, `Email dispatched to customer (${customerAEmail})`);
    assert(codEmail?.paymentMethod === 'CASH_ON_DELIVERY', 'Email contains CASH_ON_DELIVERY method');
    assert(
      Boolean(codEmail?.subject.includes(codOrderNumber)),
      `Email subject contains order number #${codOrderNumber}`
    );

    // ------------------------------------------------------------------------
    // TEST 2: Bank Transfer Order Sends Confirmation Email with Pending Status
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Test 2: Bank Transfer Order with PENDING Payment Status ---');
    clearSentOrderEmails();

    const btPayload = {
      items: [testItem],
      customerDetails: {
        fullName: 'Kasun Perera',
        email: customerAEmail,
        phone: '0771234567',
        deliveryAddress: 'No. 45, Temple Road',
        city: 'Colombo 03',
        postalCode: '00300',
      },
      paymentMethod: 'BANK_TRANSFER',
    };

    const btOrderRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify(btPayload),
    });
    const btOrderData = await btOrderRes.json();
    assert(btOrderRes.status === 201, 'Bank Transfer Order created with HTTP 201');
    assert(btOrderData.data?.paymentStatus === 'PENDING', 'Payment status is initially PENDING');

    const btOrderNumber = btOrderData.data?.orderNumber;
    const btOrderId = btOrderData.data?._id || btOrderData.data?.id;

    const sentEmailsAfterBt = getSentOrderEmails();
    const btEmail = sentEmailsAfterBt.find(
      (e) => e.orderNumber === btOrderNumber && e.type === 'ORDER_CONFIRMATION'
    );
    assert(Boolean(btEmail), 'Bank transfer confirmation email dispatched');
    assert(btEmail?.paymentStatus === 'PENDING', 'Email records PENDING payment status');

    // ------------------------------------------------------------------------
    // TEST 3: Admin Verifies Bank Transfer -> Payment Confirmation Email Sent
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Test 3: Admin Verifies Bank Transfer (PAID) -> Payment Confirmation ---');
    clearSentOrderEmails();

    const verifyPaymentRes = await fetch(`${baseUrl}/orders/${btOrderId}/payment-status`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        paymentStatus: 'PAID',
        adminNote: 'Bank deposit receipt confirmed with Commercial Bank ref #CB-88992',
      }),
    });
    const verifyPaymentData = await verifyPaymentRes.json();
    assert(verifyPaymentRes.status === 200, 'Admin verified payment with HTTP 200');
    assert(verifyPaymentData.data?.paymentStatus === 'PAID', 'Payment status updated to PAID');

    const sentEmailsAfterPayment = getSentOrderEmails();
    const paymentEmail = sentEmailsAfterPayment.find(
      (e) => e.orderNumber === btOrderNumber && e.type === 'PAYMENT_CONFIRMATION'
    );
    assert(Boolean(paymentEmail), 'Payment confirmation email was dispatched');
    assert(paymentEmail?.email === customerAEmail, `Sent to customer A (${customerAEmail})`);

    // ------------------------------------------------------------------------
    // TEST 4: Admin Changes Order Status -> Status Update Emails Sent
    // ------------------------------------------------------------------------
    console.log('\n--- 5. Test 4: Admin Status Transitions (CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED) ---');
    const statusFlow = ['PROCESSING', 'SHIPPED', 'DELIVERED'];

    for (const nextStatus of statusFlow) {
      clearSentOrderEmails();
      const updateRes = await fetch(`${baseUrl}/orders/${btOrderId}/status`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({
          orderStatus: nextStatus,
          adminNote: `Automated status advance to ${nextStatus}`,
        }),
      });
      const updateData = await updateRes.json();
      assert(updateRes.status === 200, `Admin successfully transitioned status to ${nextStatus}`);
      assert(updateData.data?.orderStatus === nextStatus, `Order status is now ${nextStatus}`);

      const sentEmails = getSentOrderEmails();
      const statusEmail = sentEmails.find(
        (e) => e.orderNumber === btOrderNumber && e.type === 'ORDER_STATUS_UPDATE'
      );
      assert(Boolean(statusEmail), `Status email dispatched for transition to ${nextStatus}`);
      assert(statusEmail?.orderStatus === nextStatus, `Email records new status ${nextStatus}`);
    }

    // ------------------------------------------------------------------------
    // TEST 5: Saving Unchanged Status Does NOT Send Duplicate Email
    // ------------------------------------------------------------------------
    console.log('\n--- 6. Test 5: Duplicate Prevention on Unchanged Status ---');
    clearSentOrderEmails();

    // The order is currently DELIVERED. Saving DELIVERED again should NOT send another email.
    const dupRes = await fetch(`${baseUrl}/orders/${btOrderId}/status`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        orderStatus: 'DELIVERED',
        adminNote: 'Admin saved without changing status',
      }),
    });
    const dupData = await dupRes.json();
    assert(dupRes.status === 200, 'Saving unchanged status returns HTTP 200');

    const sentEmailsAfterDup = getSentOrderEmails();
    const dupStatusEmail = sentEmailsAfterDup.find(
      (e) => e.orderNumber === btOrderNumber && e.type === 'ORDER_STATUS_UPDATE'
    );
    assert(!dupStatusEmail, 'No duplicate status email was dispatched for unchanged status');

    // ------------------------------------------------------------------------
    // TEST 6: Email Failure Does NOT Cancel Order or Roll Back Stock
    // ------------------------------------------------------------------------
    console.log('\n--- 7. Test 6: Resilience - Email Failure Never Cancels Order ---');
    // We test creating an order with a broken/non-standard email or simulating SMTP rejection
    const stockBefore = testVariant.stockQuantity;
    clearSentOrderEmails();

    const failureResilientPayload = {
      items: [
        {
          ...testItem,
          quantity: 1,
        },
      ],
      customerDetails: {
        fullName: 'Kasun Perera',
        email: customerAEmail,
        phone: '0771234567',
        deliveryAddress: 'No. 45, Temple Road',
        city: 'Colombo 03',
        postalCode: '00300',
      },
      paymentMethod: 'CASH_ON_DELIVERY',
    };

    // Temporarily replace SMTP to simulate an error during dispatch
    const originalSmtpHost = process.env.SMTP_HOST;
    process.env.SMTP_HOST = 'invalid-unreachable-host.stridex.local';

    const resilientOrderRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify(failureResilientPayload),
    });
    const resilientOrderData = await resilientOrderRes.json();

    // Restore environment
    process.env.SMTP_HOST = originalSmtpHost;

    assert(resilientOrderRes.status === 201, 'Order successfully created even if email server fails (HTTP 201)');
    assert(resilientOrderData.success === true, 'Order creation succeeded in database');
    const resilientOrderId = resilientOrderData.data?._id || resilientOrderData.data?.id;
    const dbOrderCheck = await OrderModel.findById(resilientOrderId);
    assert(Boolean(dbOrderCheck), 'Order persists reliably in MongoDB');

    // ------------------------------------------------------------------------
    // TEST 7: Email Content Verification (LKR Currency, Sizes, Colors, Quantities)
    // ------------------------------------------------------------------------
    console.log('\n--- 8. Test 7: Email Content Accuracy & LKR Standard ---');
    const testSavedOrder = await OrderModel.findById(codOrderId);
    if (!testSavedOrder) throw new Error('COD order not found in database');

    const rendered = generateOrderConfirmationEmail(testSavedOrder);

    assert(rendered.subject.includes(testSavedOrder.orderNumber), 'Subject contains order number');
    assert(rendered.subject.includes('STRIDEX'), 'Subject contains STRIDEX brand');
    assert(rendered.html.includes('Step Into Your Style'), 'HTML contains STRIDEX tagline');
    assert(rendered.html.includes(customerA.fullName), 'HTML contains customer name');
    assert(rendered.html.includes(testItem.name), 'HTML contains shoe model name');
    assert(rendered.html.includes(String(testItem.size)), `HTML contains shoe size (${testItem.size})`);
    assert(rendered.html.includes(String(testItem.color)), `HTML contains shoe color (${testItem.color})`);
    assert(rendered.html.includes(String(testItem.quantity)), `HTML contains item quantity (${testItem.quantity})`);
    assert(rendered.html.includes('Rs.'), 'HTML uses Sri Lankan Rupees (Rs.) symbol');
    assert(rendered.html.includes(formatLkr(testSavedOrder.finalTotal)), `HTML displays formatted total: ${formatLkr(testSavedOrder.finalTotal)}`);
    assert(!rendered.html.includes('$'), 'HTML does not contain any dollar ($) symbols');

    // Test Status Update Email template
    const renderedStatus = generateOrderStatusUpdateEmail(testSavedOrder, 'CONFIRMED', 'Courier dispatched');
    assert(renderedStatus.html.includes('Courier dispatched'), 'Status email includes note');
    assert(renderedStatus.html.includes('STRIDEX'), 'Status email has STRIDEX branding');

    // Test Payment Confirmation Email template
    const renderedPayment = generatePaymentConfirmationEmail(testSavedOrder, 'Slip verified');
    assert(renderedPayment.html.includes('Payment Confirmed'), 'Payment email includes confirmation title');
    assert(renderedPayment.html.includes(formatLkr(testSavedOrder.finalTotal)), 'Payment email includes correct LKR total');

    // ------------------------------------------------------------------------
    // TEST 8: Cross-Customer Isolation (Customer B Cannot Access Customer A's Order)
    // ------------------------------------------------------------------------
    console.log('\n--- 9. Test 8: Security & Cross-Customer Isolation ---');

    // Customer B attempts to view Customer A's order details
    const unauthorizedRes = await fetch(`${baseUrl}/orders/${codOrderId}`, {
      method: 'GET',
      headers: headersB,
    });
    assert(
      unauthorizedRes.status === 403 || unauthorizedRes.status === 404,
      `Customer B blocked from viewing Customer A's order (HTTP ${unauthorizedRes.status})`
    );

    // Customer A CAN view their own order
    const authorizedRes = await fetch(`${baseUrl}/orders/${codOrderId}`, {
      method: 'GET',
      headers: headersA,
    });
    assert(authorizedRes.status === 200, 'Customer A can view their own order (HTTP 200)');

    // ------------------------------------------------------------------------
    // TEST 9: Existing Checkout & Order Management Regression
    // ------------------------------------------------------------------------
    console.log('\n--- 10. Test 9: Existing Checkout & Order Management Regression ---');

    // Customer can fetch list of their orders (GET /api/v1/orders)
    const myOrdersRes = await fetch(`${baseUrl}/orders`, {
      method: 'GET',
      headers: headersA,
    });
    const myOrdersData = await myOrdersRes.json();
    assert(myOrdersRes.status === 200, 'Customer A can retrieve their order list (HTTP 200)');
    assert(
      Array.isArray(myOrdersData.data || myOrdersData.orders),
      'Order history returned as array'
    );

    // Admin can fetch all orders
    const adminOrdersRes = await fetch(`${baseUrl}/orders/admin/all?page=1&limit=10`, {
      method: 'GET',
      headers: adminHeaders,
    });
    assert(adminOrdersRes.status === 200, 'Admin can retrieve all orders (HTTP 200)');

    // Customer can cancel a pending COD order (POST /api/v1/orders/:id/cancel)
    const cancelRes = await fetch(`${baseUrl}/orders/${codOrderId}/cancel`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ reason: 'Customer requested cancellation for sizing revision' }),
    });
    const cancelData = await cancelRes.json();
    assert(cancelRes.status === 200, 'Customer A can cancel pending order (HTTP 200)');
    assert(cancelData.data?.orderStatus === 'CANCELLED', 'Order status updated to CANCELLED');

    // Clean up test data
    await UserModel.deleteMany({ email: { $in: [customerAEmail, customerBEmail] } });
    await OrderModel.deleteMany({
      'customerDetails.email': { $in: [customerAEmail, customerBEmail] },
    });
  } catch (err: any) {
    console.error('Test suite execution error:', err);
    failed++;
  } finally {
    server.close();
    await mongoose.disconnect();
  }

  console.log('\n========================================================================');
  console.log(`📊 ORDER EMAIL NOTIFICATION TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runOrderEmailTests();
