import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import http from 'http';
import app from '../app';
import { connectDB } from '../config/db';
import { GiftVoucherModel } from '../models/giftVoucher.model';
import { VoucherRedemptionModel } from '../models/voucherRedemption.model';
import { OrderModel } from '../models/order.model';
import { ProductModel } from '../models/product.model';
import { ProductVariantModel } from '../models/productVariant.model';
import { UserModel } from '../models/user.model';

async function runDigitalGiftVoucherTests() {
  console.log('====================================================');
  console.log('🎁 STRIDEX PHASE 7 ADDITION: DIGITAL GIFT VOUCHER SUITE');
  console.log('====================================================');

  await connectDB();

  const server = http.createServer(app);
  const TEST_PORT = 7890;
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  const baseUrl = `http://127.0.0.1:${TEST_PORT}/api/v1`;
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
    // 1. Authenticate Customer and Admin Accounts
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

    // Find an active footwear product & variant for redemption checkout testing
    const activeProduct = await ProductModel.findOne({ isActive: true });
    const activeVariant = await ProductVariantModel.findOne({
      productId: activeProduct?._id,
      isActive: true,
      stockQuantity: { $gte: 5 },
    });
    assert(Boolean(activeVariant), `Active shoe variant found: ${activeProduct?.name} (Stock: ${activeVariant?.stockQuantity})`);

    // ---------------------------------------------------------
    // 2. Customer Voucher Purchases & Validation Guardrails
    // ---------------------------------------------------------
    console.log('\n--- 2. Customer Voucher Purchases & Safeguards ---');

    // A. Rejection of unapproved voucher amount (e.g. Rs. 3,500)
    const invalidAmountRes = await fetch(`${baseUrl}/vouchers/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        amount: 3500,
        recipientName: 'Ruwan Silva',
        recipientEmail: 'ruwan@example.com',
        paymentMethod: 'BANK_TRANSFER',
      }),
    });
    assert(invalidAmountRes.status === 400, 'Unapproved voucher amount (Rs. 3,500) rejected with HTTP 400');

    // B. Rejection of Cash on Delivery for digital vouchers
    const codRes = await fetch(`${baseUrl}/vouchers/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        amount: 2500,
        recipientName: 'Ruwan Silva',
        recipientEmail: 'ruwan@example.com',
        paymentMethod: 'CASH_ON_DELIVERY',
      }),
    });
    assert(codRes.status === 400, 'Cash on Delivery for digital voucher purchase rejected with HTTP 400');
    const codData = await codRes.json();
    assert(
      codData.message.includes('not available for digital gift vouchers'),
      'COD rejection returns clear message that digital items have no physical delivery'
    );

    // C. Rejection of Online Card payment (SweetAlert2 on frontend, 400 on backend)
    const cardRes = await fetch(`${baseUrl}/vouchers/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        amount: 2500,
        recipientName: 'Ruwan Silva',
        recipientEmail: 'ruwan@example.com',
        paymentMethod: 'ONLINE_CARD',
      }),
    });
    assert(cardRes.status === 400, 'Online card payment for voucher rejected with HTTP 400');

    // D. Valid Voucher Purchase 1: Rs. 2,500 via Bank Transfer
    const purchase1Res = await fetch(`${baseUrl}/vouchers/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        amount: 2500,
        recipientName: 'Chathura Fernando',
        recipientEmail: 'chathura@example.com',
        personalMessage: 'Happy Graduation! Step into your style with STRIDEX.',
        paymentMethod: 'BANK_TRANSFER',
        bankTransferReference: 'COMM-DEP-9941',
      }),
    });
    const purchase1Data = await purchase1Res.json();
    assert(purchase1Res.status === 201, 'Rs. 2,500 voucher purchase initiated with HTTP 201');
    assert(purchase1Data.data.purchaseStatus === 'PENDING_PAYMENT', 'Voucher purchaseStatus is PENDING_PAYMENT');
    assert(purchase1Data.data.paymentStatus === 'PENDING', 'Voucher paymentStatus is PENDING');
    assert(!purchase1Data.data.code, 'No active voucher code generated before payment verification');
    const voucher1Id = purchase1Data.data.voucherId;

    // E. Valid Voucher Purchase 2: Rs. 5,000 via Bank Transfer
    const purchase2Res = await fetch(`${baseUrl}/vouchers/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        amount: 5000,
        recipientName: 'Anuki Jayawardena',
        recipientEmail: 'anuki@example.com',
        personalMessage: 'Happy Birthday! Get yourself some awesome kicks.',
        paymentMethod: 'BANK_TRANSFER',
        bankTransferReference: 'HNB-WIRE-4412',
      }),
    });
    const purchase2Data = await purchase2Res.json();
    assert(purchase2Res.status === 201, 'Rs. 5,000 voucher purchase initiated with HTTP 201');
    const voucher2Id = purchase2Data.data.voucherId;

    // ---------------------------------------------------------
    // 3. Customer "My Vouchers" Separation & Verification
    // ---------------------------------------------------------
    console.log('\n--- 3. Customer "My Vouchers" Queries ---');

    const myVouchersRes = await fetch(`${baseUrl}/vouchers/my-vouchers`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const myVouchersData = await myVouchersRes.json();
    assert(myVouchersRes.status === 200, 'Customer successfully fetches /api/v1/vouchers/my-vouchers');
    assert(myVouchersData.data.pendingPurchases.length >= 2, 'Pending purchases listed separately from issued vouchers');
    const foundPending1 = myVouchersData.data.pendingPurchases.find((v: any) => v._id === voucher1Id);
    assert(foundPending1 && foundPending1.originalValue === 2500, 'Pending voucher 1 found with Rs. 2,500 value');

    // ---------------------------------------------------------
    // 4. Admin Verification & Cryptographic Code Issuance
    // ---------------------------------------------------------
    console.log('\n--- 4. Admin Verification & Unique Code Generation ---');

    // Non-admin attempt to verify payment is blocked
    const forbiddenVerifyRes = await fetch(`${baseUrl}/admin/vouchers/${voucher1Id}/verify-payment`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({ adminNotes: 'Attempt by customer' }),
    });
    assert(forbiddenVerifyRes.status === 403, 'Non-admin forbidden from verifying payment (HTTP 403)');

    // Admin queries admin vouchers overview & metrics
    const adminOverviewRes = await fetch(`${baseUrl}/admin/vouchers`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminOverviewData = await adminOverviewRes.json();
    assert(adminOverviewRes.status === 200, 'Admin fetches vouchers overview with HTTP 200');
    assert(adminOverviewData.data.metrics.pendingVerification >= 2, 'Admin metrics accurately track pending verification count');

    // Admin verifies Bank Deposit for Voucher 1 (Rs. 2,500)
    const verify1Res = await fetch(`${baseUrl}/admin/vouchers/${voucher1Id}/verify-payment`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ adminNotes: 'Bank deposit verified against Commercial Bank statement #8492' }),
    });
    const verify1Data = await verify1Res.json();
    assert(verify1Res.status === 200, 'Admin verifies bank payment with HTTP 200');
    assert(verify1Data.data.status === 'ACTIVE', 'Voucher status updated to ACTIVE');
    assert(verify1Data.data.paymentStatus === 'PAID', 'Voucher paymentStatus updated to PAID');
    assert(verify1Data.data.purchaseStatus === 'COMPLETED', 'Voucher purchaseStatus updated to COMPLETED');
    const voucher1Code = verify1Data.data.code;
    assert(/^STRIDEX-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(voucher1Code), `Cryptographically unique code generated: ${voucher1Code}`);

    // Verify Voucher 2 (Rs. 5,000)
    const verify2Res = await fetch(`${baseUrl}/admin/vouchers/${voucher2Id}/verify-payment`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ adminNotes: 'HNB wire transfer confirmed' }),
    });
    const verify2Data = await verify2Res.json();
    assert(verify2Res.status === 200, 'Admin verifies Voucher 2 payment with HTTP 200');
    const voucher2Code = verify2Data.data.code;
    assert(voucher1Code !== voucher2Code, 'Generated voucher codes are strictly unique');

    // Customer re-checks My Vouchers: newly issued code appears in issuedVouchers
    const myVouchersAfterVerifyRes = await fetch(`${baseUrl}/vouchers/my-vouchers`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const myVouchersAfterVerifyData = await myVouchersAfterVerifyRes.json();
    const foundIssued1 = myVouchersAfterVerifyData.data.issuedVouchers.find((v: any) => v.code === voucher1Code);
    assert(Boolean(foundIssued1), 'Issued voucher code now visible in customer My Vouchers list');
    assert(foundIssued1?.remainingBalance === 2500, 'Issued voucher has full remainingBalance of Rs. 2,500');

    // ---------------------------------------------------------
    // 5. Voucher Validation API at Checkout
    // ---------------------------------------------------------
    console.log('\n--- 5. Voucher Validation API at Checkout ---');

    // A. Invalid voucher code
    const invalidCodeRes = await fetch(`${baseUrl}/vouchers/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'STRIDEX-FAKE-9999-0000', orderSubtotal: 8000 }),
    });
    assert(invalidCodeRes.status === 404, 'Invalid voucher code rejected with HTTP 404');

    // B. Valid voucher validation
    const validCheckRes = await fetch(`${baseUrl}/vouchers/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: voucher1Code, orderSubtotal: 8000 }),
    });
    const validCheckData = await validCheckRes.json();
    assert(validCheckRes.status === 200, 'Valid voucher code validates with HTTP 200');
    assert(validCheckData.data.applicableDiscount === 2500, 'Applicable discount accurately calculated as Rs. 2,500');
    assert(validCheckData.data.remainingPayable === 5500, 'Remaining payable amount calculated as Rs. 5,500 (8000 - 2500)');

    // ---------------------------------------------------------
    // 6. Checkout Order Creation with Voucher Redemption
    // ---------------------------------------------------------
    console.log('\n--- 6. Checkout Order Creation with Full Voucher Redemption ---');

    const initialStock = activeVariant?.stockQuantity || 0;

    const orderWithVoucherRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        customerDetails: {
          fullName: 'Kamal Perera',
          phone: '+94778894565',
          email: 'kamal@gmail.com',
          deliveryAddress: '42 Galle Road',
          city: 'Colombo',
          postalCode: '00300',
        },
        items: [
          {
            productId: activeProduct?._id.toString(),
            variantId: activeVariant?._id.toString(),
            size: activeVariant?.size,
            color: activeVariant?.color,
            quantity: 1,
          },
        ],
        voucherCode: voucher1Code,
        paymentMethod: 'CASH_ON_DELIVERY',
      }),
    });
    const orderWithVoucherData = await orderWithVoucherRes.json();
    const placedOrderId = orderWithVoucherData.data._id || orderWithVoucherData.data.id;
    assert(orderWithVoucherRes.status === 201, 'Order created with voucher discount (HTTP 201)');
    assert(orderWithVoucherData.data.voucherDiscount === 2500, 'Order snapshot records voucherDiscount of Rs. 2,500');
    assert(orderWithVoucherData.data.voucherCode === voucher1Code, 'Order snapshot records redeemed voucherCode');

    // Verify atomic voucher balance decrement and status transition to USED
    const refreshedVoucher1 = await GiftVoucherModel.findById(voucher1Id);
    assert(refreshedVoucher1?.remainingBalance === 0, 'Voucher remainingBalance decremented atomically: 2500 -> 0');
    assert(refreshedVoucher1?.status === 'USED', 'Voucher status transitioned to USED upon complete balance depletion');

    // Verify VoucherRedemption collection record
    const redemptionRecord = await VoucherRedemptionModel.findOne({
      voucherId: voucher1Id,
      orderId: placedOrderId,
    });
    assert(Boolean(redemptionRecord), 'VoucherRedemption record created linking voucher and order');
    assert(redemptionRecord?.amountRedeemed === 2500, 'VoucherRedemption records exact redeemed amount (Rs. 2,500)');

    // Attempting to redeem the same fully-used voucher again fails
    const reUseRes = await fetch(`${baseUrl}/vouchers/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: voucher1Code, orderSubtotal: 8000 }),
    });
    assert(reUseRes.status === 400, 'Attempting to reuse fully-redeemed voucher is rejected with HTTP 400');

    // ---------------------------------------------------------
    // 7. Partial Redemption & Preserved Voucher Balance
    // ---------------------------------------------------------
    console.log('\n--- 7. Partial Redemption & Preserved Voucher Balance ---');

    // Validate Rs. 5,000 voucher against smaller subtotal (Rs. 2,000)
    const partialValidateRes = await fetch(`${baseUrl}/vouchers/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: voucher2Code, orderSubtotal: 2000 }),
    });
    const partialValidateData = await partialValidateRes.json();
    assert(partialValidateData.data.applicableDiscount === 2000, 'Partial redemption caps discount at order amount (Rs. 2,000)');
    assert(partialValidateData.data.newVoucherBalanceAfterRedemption === 3000, 'Projected remaining voucher balance is Rs. 3,000 (5000 - 2000)');

    // ---------------------------------------------------------
    // 8. Revoked and Expired Vouchers Safeguards
    // ---------------------------------------------------------
    console.log('\n--- 8. Revoked and Expired Voucher Protections ---');

    // Admin revokes Voucher 2
    const revokeRes = await fetch(`${baseUrl}/admin/vouchers/${voucher2Id}/revoke`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ reason: 'Customer requested cancellation and bank refund' }),
    });
    assert(revokeRes.status === 200, 'Admin revokes voucher with HTTP 200');

    // Validation of revoked voucher fails
    const revokedCheckRes = await fetch(`${baseUrl}/vouchers/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: voucher2Code, orderSubtotal: 5000 }),
    });
    assert(revokedCheckRes.status === 400, 'Redeeming revoked voucher is blocked with HTTP 400');

    // ---------------------------------------------------------
    // 9. Order Cancellation & Safe Voucher Balance Restoration
    // ---------------------------------------------------------
    console.log('\n--- 9. Order Cancellation & Safe Voucher Balance Restoration ---');

    // Cancel the order that used Voucher 1
    const cancelRes = await fetch(`${baseUrl}/orders/${placedOrderId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({ reason: 'Changed mind regarding shoe size' }),
    });
    assert(cancelRes.status === 200, 'Order cancelled successfully with HTTP 200');

    // Check voucher balance was restored and status reverted to ACTIVE
    const restoredVoucher1 = await GiftVoucherModel.findById(voucher1Id);
    assert(restoredVoucher1?.remainingBalance === 2500, 'Voucher balance safely restored: 0 -> 2500');
    assert(restoredVoucher1?.status === 'ACTIVE', 'Voucher status safely restored back to ACTIVE');

    // ---------------------------------------------------------
    // 10. Regression Tests (Existing Checkout & Inventory Integrity)
    // ---------------------------------------------------------
    console.log('\n--- 10. Regression Testing: COD & Bank Transfer Checkouts ---');

    // A. Regular COD checkout without voucher
    const normalCodRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        customerDetails: {
          fullName: 'Nimal Bandara',
          phone: '+94712345678',
          email: 'nimal@gmail.com',
          deliveryAddress: '108 Kandy Road',
          city: 'Kandy',
          postalCode: '20000',
        },
        items: [
          {
            productId: activeProduct?._id.toString(),
            variantId: activeVariant?._id.toString(),
            size: activeVariant?.size,
            color: activeVariant?.color,
            quantity: 1,
          },
        ],
        paymentMethod: 'CASH_ON_DELIVERY',
      }),
    });
    assert(normalCodRes.status === 201, 'Standard COD checkout without voucher succeeds with HTTP 201');

    // B. Regular Bank Transfer checkout without voucher
    const normalBankRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        customerDetails: {
          fullName: 'Nimal Bandara',
          phone: '+94712345678',
          email: 'nimal@gmail.com',
          deliveryAddress: '108 Kandy Road',
          city: 'Kandy',
          postalCode: '20000',
        },
        items: [
          {
            productId: activeProduct?._id.toString(),
            variantId: activeVariant?._id.toString(),
            size: activeVariant?.size,
            color: activeVariant?.color,
            quantity: 1,
          },
        ],
        paymentMethod: 'BANK_TRANSFER',
      }),
    });
    assert(normalBankRes.status === 201, 'Standard Bank Transfer checkout without voucher succeeds with HTTP 201');

    console.log('\n====================================================');
    console.log(`📊 GIFT VOUCHER SUITE: ${passed} PASSED | ${failed} FAILED`);
    console.log('====================================================');
  } catch (err) {
    console.error('Fatal test error:', err);
    failed++;
  } finally {
    server.close();
    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runDigitalGiftVoucherTests();
