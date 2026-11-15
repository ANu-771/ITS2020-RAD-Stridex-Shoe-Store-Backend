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
import { UserModel, UserRole } from '../models/user.model';

async function runDigitalGiftVoucherTests() {
  console.log('========================================================================');
  console.log('🎁 STRIDEX PHASE 7 ADDITION: RECIPIENT-ONLY DIGITAL GIFT VOUCHER SUITE');
  console.log('========================================================================');

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
    // 1. Authenticate All Participant Accounts
    // ---------------------------------------------------------
    console.log('\n--- 1. Authenticating Accounts (Purchaser, Recipient, Stranger, Admin) ---');

    async function getOrCreateUser(fullName: string, email: string, password: string, role = UserRole.CUSTOMER): Promise<string> {
      let user = await UserModel.findOne({ email: email.toLowerCase() });
      if (!user) {
        user = new UserModel({
          fullName,
          email: email.toLowerCase(),
          password,
          role,
          isActive: true,
        });
        await user.save();
      } else {
        user.password = password;
        await user.save();
      }

      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase(), password }),
      });
      const data = await res.json();
      return data.data?.accessToken;
    }

    // Customer A: Purchaser
    const tokenCustomerA = await getOrCreateUser('Customer A (Purchaser)', 'customer@stridex.com', 'Customer@Stridex2026!');
    assert(Boolean(tokenCustomerA), 'Customer A (Purchaser: customer@stridex.com) authenticated successfully');

    // Customer B: Intended Recipient
    const tokenCustomerB = await getOrCreateUser('Customer B (Recipient)', 'recipient.test@stridex.com', 'Recipient@Stridex2026!');
    assert(Boolean(tokenCustomerB), 'Customer B (Intended Recipient: recipient.test@stridex.com) authenticated successfully');

    // Customer C: Unrelated Third-Party Customer
    const tokenCustomerC = await getOrCreateUser('Customer C (Stranger)', 'stranger.test@stridex.com', 'Stranger@Stridex2026!');
    assert(Boolean(tokenCustomerC), 'Customer C (Unrelated Stranger: stranger.test@stridex.com) authenticated successfully');

    // Admin
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@stridex.com',
        password: 'Admin@Stridex2026!',
      }),
    });
    const adminLoginData = await adminLoginRes.json();
    const tokenAdmin = adminLoginData.data?.accessToken;
    assert(Boolean(tokenAdmin), 'Administrator (admin@stridex.com) authenticated successfully');

    // Find active footwear product & variant for redemption checkout testing
    const activeProduct = await ProductModel.findOne({ isActive: true });
    const activeVariant = await ProductVariantModel.findOne({
      productId: activeProduct?._id,
      isActive: true,
      stockQuantity: { $gte: 10 },
    });
    assert(Boolean(activeVariant), `Active shoe variant found: ${activeProduct?.name} (Stock: ${activeVariant?.stockQuantity})`);

    // ---------------------------------------------------------
    // 2. Customer A Voucher Purchases & Safeguards
    // ---------------------------------------------------------
    console.log('\n--- 2. Customer A Voucher Purchases & Safeguards ---');

    // A. Rejection of unapproved voucher amount (e.g. Rs. 3,500)
    const invalidAmountRes = await fetch(`${baseUrl}/vouchers/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCustomerA}`,
      },
      body: JSON.stringify({
        amount: 3500,
        recipientName: 'Customer B',
        recipientEmail: 'recipient.test@stridex.com',
        paymentMethod: 'BANK_TRANSFER',
      }),
    });
    assert(invalidAmountRes.status === 400, 'Unapproved voucher amount (Rs. 3,500) rejected with HTTP 400');

    // B. Rejection of Cash on Delivery for digital vouchers
    const codRes = await fetch(`${baseUrl}/vouchers/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCustomerA}`,
      },
      body: JSON.stringify({
        amount: 2500,
        recipientName: 'Customer B',
        recipientEmail: 'recipient.test@stridex.com',
        paymentMethod: 'CASH_ON_DELIVERY',
      }),
    });
    assert(codRes.status === 400, 'Cash on Delivery for digital voucher purchase rejected with HTTP 400');
    const codData = await codRes.json();
    assert(
      codData.message.includes('not available for digital gift vouchers'),
      'COD rejection returns clear message that digital items have no physical delivery'
    );

    // C. Rejection of Online Card payment
    const cardRes = await fetch(`${baseUrl}/vouchers/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCustomerA}`,
      },
      body: JSON.stringify({
        amount: 2500,
        recipientName: 'Customer B',
        recipientEmail: 'recipient.test@stridex.com',
        paymentMethod: 'ONLINE_CARD',
      }),
    });
    assert(cardRes.status === 400, 'Online card payment for voucher rejected with HTTP 400');

    // D. Valid Voucher Purchase 1: Customer A purchases Rs. 2,500 voucher for Customer B
    const purchase1Res = await fetch(`${baseUrl}/vouchers/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCustomerA}`,
      },
      body: JSON.stringify({
        amount: 2500,
        recipientName: 'Customer B',
        recipientEmail: 'recipient.test@stridex.com',
        personalMessage: 'Happy Birthday Customer B! From Customer A.',
        paymentMethod: 'BANK_TRANSFER',
        bankTransferReference: 'COMM-DEP-RECIPIENT-01',
      }),
    });
    const purchase1Data = await purchase1Res.json();
    assert(purchase1Res.status === 201, 'Customer A purchases Rs. 2,500 voucher for Customer B (HTTP 201)');
    assert(purchase1Data.data.purchaseStatus === 'PENDING_PAYMENT', 'Voucher 1 purchaseStatus is PENDING_PAYMENT');
    assert(purchase1Data.data.paymentStatus === 'PENDING', 'Voucher 1 paymentStatus is PENDING');
    assert(!purchase1Data.data.code, 'No active voucher code generated before payment verification');
    const voucher1Id = purchase1Data.data.voucherId;

    // E. Valid Voucher Purchase 2: Customer A purchases Rs. 5,000 voucher for Customer B
    const purchase2Res = await fetch(`${baseUrl}/vouchers/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCustomerA}`,
      },
      body: JSON.stringify({
        amount: 5000,
        recipientName: 'Customer B',
        recipientEmail: 'recipient.test@stridex.com',
        personalMessage: 'Enjoy your shopping!',
        paymentMethod: 'BANK_TRANSFER',
        bankTransferReference: 'HNB-WIRE-RECIPIENT-02',
      }),
    });
    const purchase2Data = await purchase2Res.json();
    assert(purchase2Res.status === 201, 'Customer A purchases Rs. 5,000 voucher for Customer B (HTTP 201)');
    const voucher2Id = purchase2Data.data.voucherId;

    // ---------------------------------------------------------
    // 3. Customer A & B "My Vouchers" Before Payment Verification
    // ---------------------------------------------------------
    console.log('\n--- 3. "My Vouchers" Queries Before Payment Verification ---');

    // Customer A (Purchaser) sees pending purchases
    const myVouchersARes = await fetch(`${baseUrl}/vouchers/my-vouchers`, {
      headers: { Authorization: `Bearer ${tokenCustomerA}` },
    });
    const myVouchersAData = await myVouchersARes.json();
    assert(myVouchersARes.status === 200, 'Customer A fetches /my-vouchers successfully');
    const foundPending1 = myVouchersAData.data.pendingPurchases.find((v: any) => v._id === voucher1Id);
    assert(Boolean(foundPending1), 'Customer A sees initiated purchase in pendingPurchases list');

    // Customer B (Recipient) does NOT see pending unverified purchases
    const myVouchersBRes = await fetch(`${baseUrl}/vouchers/my-vouchers`, {
      headers: { Authorization: `Bearer ${tokenCustomerB}` },
    });
    const myVouchersBData = await myVouchersBRes.json();
    assert(myVouchersBRes.status === 200, 'Customer B fetches /my-vouchers successfully');
    const bHasVoucherBeforeVerification = myVouchersBData.data.issuedVouchers.some(
      (v: any) => v._id === voucher1Id
    );
    assert(!bHasVoucherBeforeVerification, 'Customer B does not see unverified voucher in issued vouchers');

    // ---------------------------------------------------------
    // 4. Admin Payment Verification & Unique Code Issuance
    // ---------------------------------------------------------
    console.log('\n--- 4. Admin Payment Verification & Unique Code Issuance ---');

    // Non-admin verification blocked
    const forbiddenVerifyRes = await fetch(`${baseUrl}/admin/vouchers/${voucher1Id}/verify-payment`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCustomerA}`,
      },
      body: JSON.stringify({ adminNotes: 'Customer attempting self-verification' }),
    });
    assert(forbiddenVerifyRes.status === 403, 'Customer A forbidden from verifying payment (HTTP 403)');

    // Admin verifies Voucher 1 (Rs. 2,500)
    const verify1Res = await fetch(`${baseUrl}/admin/vouchers/${voucher1Id}/verify-payment`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({ adminNotes: 'Verified against Commercial Bank deposit slip COMM-DEP-RECIPIENT-01' }),
    });
    const verify1Data = await verify1Res.json();
    assert(verify1Res.status === 200, 'Admin verifies Voucher 1 payment with HTTP 200');
    assert(verify1Data.data.status === 'ACTIVE', 'Voucher 1 status transitioned to ACTIVE');
    assert(verify1Data.data.paymentStatus === 'PAID', 'Voucher 1 paymentStatus updated to PAID');
    const voucher1Code = verify1Data.data.code;
    assert(/^STRIDEX-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(voucher1Code), `Cryptographically unique code generated: ${voucher1Code}`);

    // Admin verifies Voucher 2 (Rs. 5,000)
    const verify2Res = await fetch(`${baseUrl}/admin/vouchers/${voucher2Id}/verify-payment`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({ adminNotes: 'Verified HNB wire transfer HNB-WIRE-RECIPIENT-02' }),
    });
    const verify2Data = await verify2Res.json();
    assert(verify2Res.status === 200, 'Admin verifies Voucher 2 payment with HTTP 200');
    const voucher2Code = verify2Data.data.code;
    assert(voucher1Code !== voucher2Code, 'Generated voucher codes are strictly unique');

    // ---------------------------------------------------------
    // 5. Recipient-Only Visibility in "My Vouchers"
    // ---------------------------------------------------------
    console.log('\n--- 5. Recipient-Only Visibility in "My Vouchers" ---');

    // Customer B (Recipient) fetches /my-vouchers
    const myVouchersBAfterRes = await fetch(`${baseUrl}/vouchers/my-vouchers`, {
      headers: { Authorization: `Bearer ${tokenCustomerB}` },
    });
    const myVouchersBAfterData = await myVouchersBAfterRes.json();
    const bFoundIssued1 = myVouchersBAfterData.data.issuedVouchers.find((v: any) => v.code === voucher1Code);
    assert(Boolean(bFoundIssued1), 'Customer B (Intended Recipient) sees active redeemable voucher code in My Vouchers');
    assert(bFoundIssued1?.remainingBalance === 2500, 'Customer B sees correct remainingBalance of Rs. 2,500');

    // Customer A (Purchaser) fetches /my-vouchers
    const myVouchersAAfterRes = await fetch(`${baseUrl}/vouchers/my-vouchers`, {
      headers: { Authorization: `Bearer ${tokenCustomerA}` },
    });
    const myVouchersAAfterData = await myVouchersAAfterRes.json();
    const aFoundIssued1 = myVouchersAAfterData.data.issuedVouchers.find((v: any) => v.code === voucher1Code);
    assert(!aFoundIssued1, 'Customer A (Purchaser) does NOT see the voucher in issued redeemable vouchers');

    const aFoundGift1 = myVouchersAAfterData.data.purchasedGifts.find((g: any) => g._id === voucher1Id);
    assert(Boolean(aFoundGift1), 'Customer A sees voucher in "purchasedGifts" audit tracking list');
    assert(aFoundGift1.recipientName === 'Customer B', 'Purchased gift records recipientName "Customer B"');
    assert(aFoundGift1.code === undefined, 'Purchased gift strictly HIDES the secret redeemable code from purchaser');

    // ---------------------------------------------------------
    // 6. Strict Recipient-Only Redemption Security Rules
    // ---------------------------------------------------------
    console.log('\n--- 6. Strict Recipient-Only Redemption Security Rules ---');

    const EXACT_FORBIDDEN_MESSAGE =
      'This gift voucher is assigned to another recipient and cannot be redeemed using your account.';

    // A. Unauthenticated user calls /vouchers/validate -> HTTP 401
    const unauthValidateRes = await fetch(`${baseUrl}/vouchers/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: voucher1Code, orderSubtotal: 8000 }),
    });
    assert(unauthValidateRes.status === 401, 'Unauthenticated voucher validation rejected with HTTP 401 Unauthorized');

    // B. Customer A (Purchaser) tries to validate Customer B\'s voucher code -> HTTP 403
    const purchaserValidateRes = await fetch(`${baseUrl}/vouchers/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCustomerA}`,
      },
      body: JSON.stringify({ code: voucher1Code, orderSubtotal: 8000 }),
    });
    const purchaserValidateData = await purchaserValidateRes.json();
    assert(purchaserValidateRes.status === 403, 'Customer A (Purchaser) validation blocked with HTTP 403 Forbidden');
    assert(
      purchaserValidateData.message === EXACT_FORBIDDEN_MESSAGE,
      `Customer A validation returns exact message: "${EXACT_FORBIDDEN_MESSAGE}"`
    );

    // C. Customer A (Purchaser) tries to place checkout order using Customer B\'s voucher code -> HTTP 403
    const purchaserOrderRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCustomerA}`,
      },
      body: JSON.stringify({
        customerDetails: {
          fullName: 'Customer A (Attacker)',
          phone: '+94771112233',
          email: 'customer@stridex.com',
          deliveryAddress: '10 Flower Road',
          city: 'Colombo',
          postalCode: '00700',
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
    const purchaserOrderData = await purchaserOrderRes.json();
    assert(purchaserOrderRes.status === 403, 'Customer A checkout with Customer B\'s voucher blocked with HTTP 403 Forbidden');
    assert(
      purchaserOrderData.message === EXACT_FORBIDDEN_MESSAGE,
      `Customer A checkout returns exact message: "${EXACT_FORBIDDEN_MESSAGE}"`
    );

    // Verify Voucher 1 balance remains intact (Rs. 2,500)
    const checkVoucher1Untouched = await GiftVoucherModel.findById(voucher1Id);
    assert(checkVoucher1Untouched?.remainingBalance === 2500, 'Voucher 1 balance remains intact at Rs. 2,500 after blocked attempt');

    // D. Customer C (Stranger) tries to validate Customer B\'s voucher code -> HTTP 403
    const strangerValidateRes = await fetch(`${baseUrl}/vouchers/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCustomerC}`,
      },
      body: JSON.stringify({ code: voucher1Code, orderSubtotal: 8000 }),
    });
    const strangerValidateData = await strangerValidateRes.json();
    assert(strangerValidateRes.status === 403, 'Customer C (Stranger) validation blocked with HTTP 403 Forbidden');
    assert(
      strangerValidateData.message === EXACT_FORBIDDEN_MESSAGE,
      `Customer C validation returns exact message: "${EXACT_FORBIDDEN_MESSAGE}"`
    );

    // E. Customer C (Stranger) tries to place checkout order using Customer B\'s voucher code -> HTTP 403
    const strangerOrderRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCustomerC}`,
      },
      body: JSON.stringify({
        customerDetails: {
          fullName: 'Customer C (Stranger)',
          phone: '+94779998877',
          email: 'stranger.test@stridex.com',
          deliveryAddress: '99 Main Street',
          city: 'Galle',
          postalCode: '80000',
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
    const strangerOrderData = await strangerOrderRes.json();
    assert(strangerOrderRes.status === 403, 'Customer C checkout with Customer B\'s voucher blocked with HTTP 403 Forbidden');
    assert(
      strangerOrderData.message === EXACT_FORBIDDEN_MESSAGE,
      `Customer C checkout returns exact message: "${EXACT_FORBIDDEN_MESSAGE}"`
    );

    // ---------------------------------------------------------
    // 7. Intended Recipient Redemption (Customer B)
    // ---------------------------------------------------------
    console.log('\n--- 7. Intended Recipient Redemption (Customer B) ---');

    // Customer B validates voucher code
    const validValidateRes = await fetch(`${baseUrl}/vouchers/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCustomerB}`,
      },
      body: JSON.stringify({ code: voucher1Code, orderSubtotal: 8000 }),
    });
    const validValidateData = await validValidateRes.json();
    assert(validValidateRes.status === 200, 'Customer B (Intended Recipient) validates voucher successfully (HTTP 200)');
    assert(validValidateData.data.applicableDiscount === 2500, 'Applicable discount accurately calculated as Rs. 2,500');
    assert(validValidateData.data.remainingPayable === 5500, 'Remaining payable amount calculated as Rs. 5,500 (8000 - 2500)');

    // Customer B completes checkout with Voucher 1
    const orderWithVoucherRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCustomerB}`,
      },
      body: JSON.stringify({
        customerDetails: {
          fullName: 'Customer B (Recipient)',
          phone: '+94778894565',
          email: 'recipient.test@stridex.com',
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
    assert(orderWithVoucherRes.status === 201, 'Customer B successfully places order with voucher (HTTP 201)');
    assert(orderWithVoucherData.data.voucherDiscount === 2500, 'Order snapshot records voucherDiscount of Rs. 2,500');
    assert(orderWithVoucherData.data.voucherCode === voucher1Code, 'Order snapshot records redeemed voucherCode');

    // Verify voucher balance depleted to 0 and status is USED
    const usedVoucher1 = await GiftVoucherModel.findById(voucher1Id);
    assert(usedVoucher1?.remainingBalance === 0, 'Voucher 1 remainingBalance decremented to Rs. 0');
    assert(usedVoucher1?.status === 'USED', 'Voucher 1 status transitioned to USED');

    // Verify collection audit record
    const redemptionRecord = await VoucherRedemptionModel.findOne({
      voucherId: voucher1Id,
      orderId: placedOrderId,
    });
    assert(Boolean(redemptionRecord), 'VoucherRedemption audit collection record created');
    assert(redemptionRecord?.amountRedeemed === 2500, 'VoucherRedemption records exact redeemed amount (Rs. 2,500)');

    // Customer B cannot reuse fully redeemed voucher
    const reUseRes = await fetch(`${baseUrl}/vouchers/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCustomerB}`,
      },
      body: JSON.stringify({ code: voucher1Code, orderSubtotal: 8000 }),
    });
    assert(reUseRes.status === 400, 'Attempting to reuse fully-redeemed voucher rejected with HTTP 400');

    // ---------------------------------------------------------
    // 8. Self-Purchase Scenario (Customer Purchases For Themselves)
    // ---------------------------------------------------------
    console.log('\n--- 8. Self-Purchase Scenario (Purchaser is Recipient) ---');

    // Customer A purchases a voucher with their own email as recipient
    const selfPurchaseRes = await fetch(`${baseUrl}/vouchers/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCustomerA}`,
      },
      body: JSON.stringify({
        amount: 2500,
        recipientName: 'Customer A (Self)',
        recipientEmail: 'customer@stridex.com',
        personalMessage: 'Treating myself to new shoes!',
        paymentMethod: 'BANK_TRANSFER',
        bankTransferReference: 'COMM-SELF-PURCHASE-01',
      }),
    });
    const selfPurchaseData = await selfPurchaseRes.json();
    assert(selfPurchaseRes.status === 201, 'Customer A initiates self-voucher purchase (HTTP 201)');
    const selfVoucherId = selfPurchaseData.data.voucherId;

    // Admin verifies self-voucher
    const selfVerifyRes = await fetch(`${baseUrl}/admin/vouchers/${selfVoucherId}/verify-payment`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({ adminNotes: 'Verified self-purchase bank transfer' }),
    });
    const selfVerifyData = await selfVerifyRes.json();
    assert(selfVerifyRes.status === 200, 'Admin verifies self-voucher payment (HTTP 200)');
    const selfVoucherCode = selfVerifyData.data.code;

    // Customer A checks /my-vouchers: appears in issuedVouchers with code
    const myVouchersSelfRes = await fetch(`${baseUrl}/vouchers/my-vouchers`, {
      headers: { Authorization: `Bearer ${tokenCustomerA}` },
    });
    const myVouchersSelfData = await myVouchersSelfRes.json();
    const selfFoundIssued = myVouchersSelfData.data.issuedVouchers.find((v: any) => v.code === selfVoucherCode);
    assert(Boolean(selfFoundIssued), 'Self-purchased voucher appears in Customer A\'s issuedVouchers list with redeemable code');

    // Customer A can successfully validate own voucher
    const selfValidateRes = await fetch(`${baseUrl}/vouchers/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCustomerA}`,
      },
      body: JSON.stringify({ code: selfVoucherCode, orderSubtotal: 6000 }),
    });
    assert(selfValidateRes.status === 200, 'Customer A can validate self-purchased voucher (HTTP 200)');

    // Customer B or C cannot redeem Customer A\'s self-purchased voucher
    const strangerValidateSelfRes = await fetch(`${baseUrl}/vouchers/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCustomerB}`,
      },
      body: JSON.stringify({ code: selfVoucherCode, orderSubtotal: 6000 }),
    });
    assert(strangerValidateSelfRes.status === 403, 'Customer B blocked from redeeming Customer A\'s self-purchased voucher (HTTP 403)');

    // ---------------------------------------------------------
    // 9. Partial Redemption & Preserved Voucher Balance
    // ---------------------------------------------------------
    console.log('\n--- 9. Partial Redemption & Preserved Voucher Balance ---');

    // Validate Rs. 5,000 voucher (Voucher 2) for Customer B against small subtotal (Rs. 2,000)
    const partialValidateRes = await fetch(`${baseUrl}/vouchers/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCustomerB}`,
      },
      body: JSON.stringify({ code: voucher2Code, orderSubtotal: 2000 }),
    });
    const partialValidateData = await partialValidateRes.json();
    assert(partialValidateData.data.applicableDiscount === 2000, 'Partial redemption caps discount at order amount (Rs. 2,000)');
    assert(partialValidateData.data.newVoucherBalanceAfterRedemption === 3000, 'Projected remaining voucher balance is Rs. 3,000 (5000 - 2000)');

    // ---------------------------------------------------------
    // 10. Revoked and Expired Voucher Protections
    // ---------------------------------------------------------
    console.log('\n--- 10. Revoked and Expired Voucher Protections ---');

    // Admin revokes Voucher 2
    const revokeRes = await fetch(`${baseUrl}/admin/vouchers/${voucher2Id}/revoke`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({ reason: 'Customer requested cancellation and bank refund' }),
    });
    assert(revokeRes.status === 200, 'Admin revokes voucher with HTTP 200');

    // Customer B validates revoked voucher -> HTTP 400
    const revokedCheckRes = await fetch(`${baseUrl}/vouchers/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCustomerB}`,
      },
      body: JSON.stringify({ code: voucher2Code, orderSubtotal: 5000 }),
    });
    assert(revokedCheckRes.status === 400, 'Redeeming revoked voucher is blocked with HTTP 400');

    // ---------------------------------------------------------
    // 11. Order Cancellation & Safe Voucher Balance Restoration
    // ---------------------------------------------------------
    console.log('\n--- 11. Order Cancellation & Safe Voucher Balance Restoration ---');

    // Cancel Customer B\'s order that used Voucher 1
    const cancelRes = await fetch(`${baseUrl}/orders/${placedOrderId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCustomerB}`,
      },
      body: JSON.stringify({ reason: 'Changed mind regarding shoe size' }),
    });
    assert(cancelRes.status === 200, 'Order cancelled successfully with HTTP 200');

    // Check voucher balance was restored and status reverted to ACTIVE
    const restoredVoucher1 = await GiftVoucherModel.findById(voucher1Id);
    assert(restoredVoucher1?.remainingBalance === 2500, 'Voucher balance safely restored: 0 -> 2500');
    assert(restoredVoucher1?.status === 'ACTIVE', 'Voucher status safely restored back to ACTIVE');

    // ---------------------------------------------------------
    // 12. Regression Testing: COD & Bank Transfer Checkouts
    // ---------------------------------------------------------
    console.log('\n--- 12. Regression Testing: COD & Bank Transfer Checkouts ---');

    // Standard COD checkout without voucher
    const normalCodRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCustomerA}`,
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

    // Standard Bank Transfer checkout without voucher
    const normalBankRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCustomerA}`,
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

    console.log('\n========================================================================');
    console.log(`📊 RECIPIENT-ONLY VOUCHER SUITE: ${passed} PASSED | ${failed} FAILED`);
    console.log('========================================================================');
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
