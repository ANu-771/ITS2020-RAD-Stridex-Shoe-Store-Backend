import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import http from 'http';
import app from '../app';
import { connectDB } from '../config/db';
import { ProductModel } from '../models/product.model';
import { ProductVariantModel } from '../models/productVariant.model';
import { CartModel } from '../models/cart.model';
import { WishlistModel } from '../models/wishlist.model';
import { OrderModel } from '../models/order.model';

async function runPhase5Tests() {
  console.log('====================================================');
  console.log('🛒 STRIDEX PHASE 5: CART, WISHLIST & CHECKOUT TEST');
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
    console.log('\n--- 1. Authenticating Customer ---');
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'customer@stridex.com',
        password: 'Customer@Stridex2026!',
      }),
    });
    const loginData = await loginRes.json();
    const token = loginData.data?.accessToken;
    assert(Boolean(token), 'Customer authentication successful and token retrieved');

    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    // Find test product and variant in MongoDB
    const testProduct = await ProductModel.findOne({ isActive: true });
    if (!testProduct) throw new Error('No active test product found');
    const testVariant = await ProductVariantModel.findOne({
      productId: testProduct._id,
      isActive: true,
      stockQuantity: { $gt: 5 },
    });
    if (!testVariant) throw new Error('No active test variant with stock found');

    console.log(`Test Product: "${testProduct.name}" (ID: ${testProduct._id})`);
    console.log(`Test Variant: Size ${testVariant.size}, Color ${testVariant.color}, Stock: ${testVariant.stockQuantity}`);

    // Clear any previous cart/wishlist for test customer
    await CartModel.deleteOne({ userId: loginData.data.user.id });
    await WishlistModel.deleteOne({ userId: loginData.data.user.id });

    // 2. Shopping Cart - Add Item
    console.log('\n--- 2. Testing Add to Cart (POST /cart/items) ---');
    const addRes = await fetch(`${baseUrl}/cart/items`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        productId: testProduct._id.toString(),
        variantId: testVariant._id.toString(),
        size: testVariant.size,
        color: testVariant.color,
        quantity: 2,
      }),
    });
    const addData = await addRes.json();
    assert(addRes.status === 200 && addData.success, 'Successfully added 2 pairs to customer MongoDB cart');
    assert(addData.data.items.length === 1, 'Cart contains exactly 1 line item');
    assert(addData.data.subtotal > 0, `Cart subtotal calculated in LKR: Rs. ${addData.data.subtotal}`);

    // 3. Prevent Adding Out of Stock or Exceeding Available Stock
    console.log('\n--- 3. Testing Over-Stock Prevention ---');
    const overStockRes = await fetch(`${baseUrl}/cart/items`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        productId: testProduct._id.toString(),
        variantId: testVariant._id.toString(),
        size: testVariant.size,
        color: testVariant.color,
        quantity: 9999, // Exceeds available stock
      }),
    });
    const overStockData = await overStockRes.json();
    assert(overStockRes.status === 400 && !overStockData.success, 'Over-stock quantity correctly rejected with 400 Bad Request');

    // 4. Update Quantity in Cart
    console.log('\n--- 4. Testing Update Quantity (PUT /cart/items/:itemId) ---');
    const itemId = addData.data.items[0].itemId;
    const updateRes = await fetch(`${baseUrl}/cart/items/${itemId}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ quantity: 3 }),
    });
    const updateData = await updateRes.json();
    assert(updateRes.status === 200 && updateData.data.items[0].quantity === 3, 'Item quantity updated to 3');

    // 5. Wishlist - Add / Toggle
    console.log('\n--- 5. Testing Wishlist Toggle (POST /wishlist/toggle) ---');
    const wishRes = await fetch(`${baseUrl}/wishlist/toggle`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ productId: testProduct._id.toString() }),
    });
    const wishData = await wishRes.json();
    assert(wishRes.status === 200 && wishData.isWishlisted === true, 'Product added to customer wishlist');

    // Verify Wishlist Retrieval
    const getWishRes = await fetch(`${baseUrl}/wishlist`, { headers: authHeaders });
    const getWishData = await getWishRes.json();
    assert(getWishRes.status === 200 && getWishData.data.length >= 1, 'Customer wishlist retrieved from MongoDB');

    // 6. Wishlist - Move to Cart
    console.log('\n--- 6. Testing Move to Cart (POST /wishlist/:productId/move-to-cart) ---');
    const moveRes = await fetch(`${baseUrl}/wishlist/${testProduct._id}/move-to-cart`, {
      method: 'POST',
      headers: authHeaders,
    });
    const moveData = await moveRes.json();
    assert(moveRes.status === 200 && moveData.success, 'Moved product from wishlist to cart');

    // 7. Checkout & Order Creation
    console.log('\n--- 7. Testing Order Checkout (POST /orders) ---');
    const initialVariantStock = (await ProductVariantModel.findById(testVariant._id))!.stockQuantity;

    const orderRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        customerDetails: {
          fullName: 'Kasun Perera',
          phone: '+94 77 123 4567',
          email: 'customer@stridex.com',
          deliveryAddress: 'No. 120, Galle Road',
          city: 'Colombo 03',
          postalCode: '00300',
          deliveryNotes: 'Please call before delivery',
        },
        paymentMethod: 'CASH_ON_DELIVERY',
      }),
    });
    const orderData = await orderRes.json();
    assert(orderRes.status === 201 && orderData.success, 'Order placed successfully (Status 201 Created)');
    assert(Boolean(orderData.data.orderNumber), `Generated Order Number: ${orderData.data?.orderNumber}`);
    assert(orderData.data.finalTotal > 0, `Order Total in LKR: Rs. ${orderData.data?.finalTotal}`);

    // Verify Stock was Atomically Decremented in MongoDB
    const postOrderVariant = await ProductVariantModel.findById(testVariant._id);
    assert(
      postOrderVariant!.stockQuantity < initialVariantStock,
      `Variant stock atomically decremented in MongoDB from ${initialVariantStock} to ${postOrderVariant!.stockQuantity}`
    );

    // Verify Customer Cart Was Emptied
    const postCartRes = await fetch(`${baseUrl}/cart`, { headers: authHeaders });
    const postCartData = await postCartRes.json();
    assert(postCartData.data.items.length === 0, 'Customer shopping cart automatically cleared after order placement');

    // 8. Atomic Concurrency Protection Test (Preventing Overselling)
    console.log('\n--- 8. Testing Atomic Concurrency & Overselling Protection ---');
    // Set a variant to have exactly 1 item in stock
    const limitedVariant = await ProductVariantModel.create({
      productId: testProduct._id,
      SKU: `CONCURRENCY-TEST-${Date.now()}`,
      size: 44,
      color: 'Titanium',
      stockQuantity: 1, // Only 1 left in the entire warehouse!
      reservedQuantity: 0,
      isActive: true,
    });

    console.log(`Created limited stock variant (Stock: ${limitedVariant.stockQuantity})`);

    // Simulate two concurrent checkout requests competing for the exact same 1 unit
    const concurrentPayload = {
      customerDetails: {
        fullName: 'Rival Customer',
        phone: '+94 71 999 8888',
        email: 'customer@stridex.com',
        deliveryAddress: '24 Flower Road',
        city: 'Colombo',
        postalCode: '00700',
      },
      items: [
        {
          productId: testProduct._id.toString(),
          variantId: limitedVariant._id.toString(),
          size: 44,
          color: 'Titanium',
          quantity: 1,
        },
      ],
      paymentMethod: 'CASH_ON_DELIVERY',
    };

    const [compete1, compete2] = await Promise.all([
      fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(concurrentPayload),
      }),
      fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(concurrentPayload),
      }),
    ]);

    const res1 = await compete1.json();
    const res2 = await compete2.json();

    const statuses = [compete1.status, compete2.status];
    const successes = [res1.success, res2.success];

    const oneSucceeded = successes.filter((s) => s === true).length === 1;
    const oneFailed = successes.filter((s) => s === false).length === 1;

    assert(oneSucceeded && oneFailed, 'Atomic concurrency lock prevented overselling (1 succeeded, 1 failed)');
    console.log(`Request 1: Status ${statuses[0]} (Success: ${successes[0]})`);
    console.log(`Request 2: Status ${statuses[1]} (Success: ${successes[1]})`);

    // Cleanup concurrency variant
    await ProductVariantModel.deleteOne({ _id: limitedVariant._id });

    // 9. Customer Order History Retrieval
    console.log('\n--- 9. Testing Order History Retrieval (GET /orders) ---');
    const myOrdersRes = await fetch(`${baseUrl}/orders`, { headers: authHeaders });
    const myOrdersData = await myOrdersRes.json();
    assert(myOrdersRes.status === 200 && myOrdersData.data.length >= 1, 'Customer retrieved their placed orders');

    // Single Order by ID / Order Number
    const orderNo = orderData.data.orderNumber;
    const singleOrderRes = await fetch(`${baseUrl}/orders/${orderNo}`, { headers: authHeaders });
    const singleOrderData = await singleOrderRes.json();
    assert(singleOrderRes.status === 200 && singleOrderData.data.orderNumber === orderNo, `Retrieved single order by number: ${orderNo}`);

    console.log('\n====================================================');
    console.log(`📊 PHASE 5 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
    console.log('====================================================\n');
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

runPhase5Tests().catch((err) => {
  console.error('❌ Phase 5 Test Suite failed:', err);
  process.exit(1);
});
