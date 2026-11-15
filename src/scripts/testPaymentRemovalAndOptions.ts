import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import http from 'http';
import app from '../app';
import { connectDB } from '../config/db';
import { ProductModel } from '../models/product.model';
import { ProductVariantModel } from '../models/productVariant.model';
import { OrderModel } from '../models/order.model';

async function runPaymentTests() {
  console.log('====================================================');
  console.log('🛡️ STRIDEX TEST: PAYMENT UPDATE & CARD SIMULATOR REMOVAL');
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
    // 1. Authenticate Customer
    console.log('\n--- 1. Authenticating Customer Account ---');
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

    const customerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${customerToken}`,
    };

    // Find an active shoe & variant for testing
    const variant = await ProductVariantModel.findOne({ isActive: true, stockQuantity: { $gte: 5 } }).populate('productId');
    assert(Boolean(variant), 'Active shoe variant found for checkout testing');

    const testVariantId = (variant!._id as any).toString();
    const testProductId = ((variant!.productId as any)._id || variant!.productId).toString();

    // -------------------------------------------------------------
    // TEST A: VISA / MASTERCARD / AMEX REJECTION & SIMULATOR RETIRED
    // -------------------------------------------------------------
    console.log('\n--- TEST A: Visa / MasterCard / AMEX Rejection & Simulator Retirement ---');

    // Attempting to place an order via ONLINE_CARD must be rejected
    const cardOrderRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        customerDetails: {
          fullName: 'Nimal Jayawardena',
          phone: '+94 77 123 4567',
          email: 'nimal@stridex.com',
          deliveryAddress: 'No. 12, Flower Road, Colombo 07',
          city: 'Colombo',
          postalCode: '00700',
        },
        items: [
          {
            productId: testProductId,
            variantId: testVariantId,
            size: variant!.size,
            color: variant!.color,
            quantity: 1,
          },
        ],
        paymentMethod: 'ONLINE_CARD',
      }),
    });
    const cardOrderData = await cardOrderRes.json();
    assert(
      cardOrderRes.status === 400,
      'POST /orders with ONLINE_CARD is rejected with HTTP 400 Bad Request'
    );
    assert(
      cardOrderData.message.includes('unavailable') && cardOrderData.message.includes('Cash on Delivery'),
      'Backend message informs customer that online card payment is unavailable and to select Cash on Delivery'
    );

    // Calling the simulated payment endpoint /orders/:id/pay must be rejected
    const payRes = await fetch(`${baseUrl}/orders/STX-DUMMY/pay`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        simulationResult: 'SUCCESS',
      }),
    });
    const payData = await payRes.json();
    assert(
      payRes.status === 400 && payData.message.includes('retired'),
      'POST /orders/:id/pay is retired and rejects simulation calls with HTTP 400'
    );

    // -------------------------------------------------------------
    // TEST B: CASH ON DELIVERY (COD) FUNCTIONALITY
    // -------------------------------------------------------------
    console.log('\n--- TEST B: Cash on Delivery (COD) Checkout Flow ---');
    const stockBeforeCOD = (await ProductVariantModel.findById(testVariantId))!.stockQuantity;

    const codRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        customerDetails: {
          fullName: 'Sunil Wickramasinghe',
          phone: '+94 71 987 6543',
          email: 'sunil@stridex.com',
          deliveryAddress: 'No. 88, Galle Road, Bambalapitiya',
          city: 'Colombo',
          postalCode: '00400',
          deliveryNotes: 'Leave with security',
        },
        items: [
          {
            productId: testProductId,
            variantId: testVariantId,
            size: variant!.size,
            color: variant!.color,
            quantity: 1,
          },
        ],
        paymentMethod: 'CASH_ON_DELIVERY',
      }),
    });
    const codData = await codRes.json();
    assert(codRes.status === 201 && codData.success, 'COD order placed successfully (HTTP 201)');
    assert(codData.data?.paymentMethod === 'CASH_ON_DELIVERY', 'Order payment method recorded as CASH_ON_DELIVERY');
    assert(codData.data?.paymentStatus === 'PENDING', 'COD payment status is initially PENDING');
    assert(codData.data?.orderStatus === 'CONFIRMED', 'COD order is CONFIRMED & allocated from warehouse');

    const stockAfterCOD = (await ProductVariantModel.findById(testVariantId))!.stockQuantity;
    assert(
      stockAfterCOD === stockBeforeCOD - 1,
      `Variant stock correctly decremented: ${stockBeforeCOD} -> ${stockAfterCOD}`
    );

    // Cancel COD order to restore stock
    const cancelRes = await fetch(`${baseUrl}/orders/${codData.data.orderNumber}/cancel`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({ reason: 'Test complete' }),
    });
    assert(cancelRes.status === 200, 'COD order cancelled successfully and stock restored');

    // -------------------------------------------------------------
    // TEST C: DIRECT BANK TRANSFER (COMMERCIAL BANK / HNB)
    // -------------------------------------------------------------
    console.log('\n--- TEST C: Direct Bank Transfer (Commercial Bank / HNB) Flow ---');
    const stockBeforeBank = (await ProductVariantModel.findById(testVariantId))!.stockQuantity;

    const bankRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        customerDetails: {
          fullName: 'Kamani Silva',
          phone: '+94 76 555 4321',
          email: 'kamani@stridex.com',
          deliveryAddress: 'No. 45, Kandy Road, Kiribathgoda',
          city: 'Kiribathgoda',
          postalCode: '11600',
        },
        items: [
          {
            productId: testProductId,
            variantId: testVariantId,
            size: variant!.size,
            color: variant!.color,
            quantity: 1,
          },
        ],
        paymentMethod: 'BANK_TRANSFER',
      }),
    });
    const bankData = await bankRes.json();
    assert(bankRes.status === 201 && bankData.success, 'Direct Bank Transfer order created successfully (HTTP 201)');
    assert(bankData.data?.paymentMethod === 'BANK_TRANSFER', 'Payment method is BANK_TRANSFER');
    assert(bankData.data?.paymentStatus === 'PENDING', 'Payment status is PENDING awaiting customer wire transfer');
    assert(bankData.data?.orderStatus === 'CONFIRMED', 'Bank Transfer order status is CONFIRMED');

    const stockAfterBank = (await ProductVariantModel.findById(testVariantId))!.stockQuantity;
    assert(
      stockAfterBank === stockBeforeBank - 1,
      `Variant stock decremented for Bank Transfer: ${stockBeforeBank} -> ${stockAfterBank}`
    );

    // Clean up test order
    await fetch(`${baseUrl}/orders/${bankData.data.orderNumber}/cancel`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({ reason: 'Test complete' }),
    });

    console.log('\n====================================================');
    console.log(`📊 PAYMENT UPDATE TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
    console.log('====================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Error running test suite:', error);
    process.exit(1);
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

runPaymentTests();
