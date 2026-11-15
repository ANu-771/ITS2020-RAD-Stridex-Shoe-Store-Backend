import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import mongoose from 'mongoose';
import http from 'http';
import bcrypt from 'bcryptjs';
import app from '../app';
import { connectDB } from '../config/db';
import { UserModel, UserRole } from '../models/user.model';
import { ProductModel } from '../models/product.model';
import { ProductVariantModel } from '../models/productVariant.model';
import { CartModel } from '../models/cart.model';
import { WishlistModel } from '../models/wishlist.model';

async function runCartWishlistIsolationTests() {
  console.log('================================================================');
  console.log('🛡️ STRIDEX: CART & WISHLIST MULTI-ACCOUNT ISOLATION TEST SUITE');
  console.log('================================================================');

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
    // 0. Locate sample products & variants for testing
    const products = await ProductModel.find({ isActive: true }).limit(3);
    if (products.length < 2) {
      throw new Error('Need at least 2 active products in database for isolation testing');
    }

    const prodA = products[0];
    const prodB = products[1];

    const varA = await ProductVariantModel.findOne({ productId: prodA._id, isActive: true });
    const varB = await ProductVariantModel.findOne({ productId: prodB._id, isActive: true });

    if (!varA || !varB) {
      throw new Error('Need active variants for products A and B');
    }

    // 1. Create or ensure three isolated test accounts: Account A, Account B, Account C
    console.log('\n--- 1. Setting up Test Customer Accounts (A, B, C) ---');
    const accountsData = [
      {
        fullName: 'Account Alpha',
        email: 'alpha_isolation@stridex.com',
        password: 'StridexIsolation2026!',
        phone: '0771112222',
        role: UserRole.CUSTOMER,
        isActive: true,
      },
      {
        fullName: 'Account Beta',
        email: 'beta_isolation@stridex.com',
        password: 'StridexIsolation2026!',
        phone: '0773334444',
        role: UserRole.CUSTOMER,
        isActive: true,
      },
      {
        fullName: 'Account Charlie',
        email: 'charlie_isolation@stridex.com',
        password: 'StridexIsolation2026!',
        phone: '0775556666',
        role: UserRole.CUSTOMER,
        isActive: true,
      },
    ];

    const users: Record<string, any> = {};
    const tokens: Record<string, string> = {};

    for (const acc of accountsData) {
      let user = await UserModel.findOne({ email: acc.email });
      if (!user) {
        user = await UserModel.create(acc);
      } else {
        user.password = 'StridexIsolation2026!';
        await user.save();
      }
      users[acc.email] = user;

      // Clean up previous test cart & wishlist
      await CartModel.deleteOne({ userId: user._id });
      await WishlistModel.deleteOne({ userId: user._id });

      // Log in to obtain JWT tokens
      const loginRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: acc.email, password: 'StridexIsolation2026!' }),
      });
      const loginJson = await loginRes.json();
      tokens[acc.email] = loginJson.data.accessToken;
      assert(Boolean(tokens[acc.email]), `Token generated successfully for ${acc.fullName} (${acc.email})`);
    }

    const tokenA = tokens['alpha_isolation@stridex.com'];
    const tokenB = tokens['beta_isolation@stridex.com'];
    const tokenC = tokens['charlie_isolation@stridex.com'];
    const userA = users['alpha_isolation@stridex.com'];
    const userB = users['beta_isolation@stridex.com'];
    const userC = users['charlie_isolation@stridex.com'];

    // 2. Unauthenticated Security Boundary: 401 Unauthorized for Guest on Server Endpoints
    console.log('\n--- 2. Testing Unauthenticated Server Security Boundaries ---');
    const guestCartGet = await fetch(`${baseUrl}/cart`);
    assert(guestCartGet.status === 401, 'Guest GET /cart returns 401 Unauthorized');

    const guestCartAdd = await fetch(`${baseUrl}/cart/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: prodA._id.toString(),
        variantId: varA._id.toString(),
        size: varA.size,
        color: varA.color,
        quantity: 1,
      }),
    });
    assert(guestCartAdd.status === 401, 'Guest POST /cart/items returns 401 Unauthorized');

    const guestWishlistGet = await fetch(`${baseUrl}/wishlist`);
    assert(guestWishlistGet.status === 401, 'Guest GET /wishlist returns 401 Unauthorized');

    // 3. Account A Adds 2 Items to Cart and 1 Item to Wishlist
    console.log('\n--- 3. Account A Adds Items to Cart & Wishlist ---');
    const addA1 = await fetch(`${baseUrl}/cart/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        productId: prodA._id.toString(),
        variantId: varA._id.toString(),
        size: varA.size,
        color: varA.color,
        quantity: 1,
      }),
    });
    const addA1Json = await addA1.json();
    assert(addA1.status === 200 && addA1Json.data.items.length === 1, 'Account A added shoe 1 to cart');

    const addA2 = await fetch(`${baseUrl}/cart/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        productId: prodB._id.toString(),
        variantId: varB._id.toString(),
        size: varB.size,
        color: varB.color,
        quantity: 2,
      }),
    });
    const addA2Json = await addA2.json();
    assert(addA2.status === 200 && addA2Json.data.items.length === 2, 'Account A added shoe 2 to cart (total 2 items)');

    const wishA = await fetch(`${baseUrl}/wishlist/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ productId: prodA._id.toString() }),
    });
    const wishAJson = await wishA.json();
    assert(wishA.status === 200 && wishAJson.isWishlisted === true, 'Account A added shoe 1 to wishlist');

    // 4. Account B Logs In: Verify Cart and Wishlist are completely Empty (0 items)
    console.log('\n--- 4. Account B Verification: Strict Isolation from Account A ---');
    const cartBRes = await fetch(`${baseUrl}/cart`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const cartBJson = await cartBRes.json();
    assert(cartBRes.status === 200, 'Account B GET /cart succeeds');
    assert(cartBJson.data.items.length === 0, 'Account B cart is completely empty (0 items - does NOT contain A items)');

    const wishBRes = await fetch(`${baseUrl}/wishlist`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const wishBJson = await wishBRes.json();
    assert(wishBRes.status === 200, 'Account B GET /wishlist succeeds');
    assert(wishBJson.data.length === 0, 'Account B wishlist is completely empty (0 items - does NOT contain A items)');

    // 5. Account B Adds 1 Item to Cart
    console.log('\n--- 5. Account B Adds Independent Item to Cart ---');
    const addB = await fetch(`${baseUrl}/cart/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({
        productId: prodB._id.toString(),
        variantId: varB._id.toString(),
        size: varB.size,
        color: varB.color,
        quantity: 3,
      }),
    });
    const addBJson = await addB.json();
    assert(addB.status === 200 && addBJson.data.items.length === 1, 'Account B cart now contains 1 item (Quantity: 3)');

    // 6. Security & Parameter Tampering Attack: User B tries to delete User A's cart item
    console.log('\n--- 6. Parameter Tampering & Cross-User Security Check ---');
    const cartAItem = addA1Json.data.items[0];
    const userAItemId = cartAItem.itemId || cartAItem._id;

    // User B tries to delete User A's item using User B's token
    const deleteAttempt = await fetch(`${baseUrl}/cart/items/${userAItemId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert(
      deleteAttempt.status === 404,
      `User B cannot delete User A's cart item (Status ${deleteAttempt.status} Not Found)`
    );

    // Verify User A's item was NOT deleted
    const cartAVerify = await fetch(`${baseUrl}/cart`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const cartAVerifyJson = await cartAVerify.json();
    assert(
      cartAVerifyJson.data.items.length === 2,
      "Account A's cart still contains exactly 2 items intact after tampering attempt"
    );

    // 7. Safe Guest Migration: Guest items synced to Account C upon Login
    console.log('\n--- 7. Guest Safe Merge into Account C ---');
    // Simulated guest cart items created in guest mode
    const simulatedGuestItems = [
      {
        productId: prodA._id.toString(),
        variantId: varA._id.toString(),
        size: varA.size,
        color: varA.color,
        quantity: 1,
      },
    ];

    const syncCRes = await fetch(`${baseUrl}/cart/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenC}`,
      },
      body: JSON.stringify({ items: simulatedGuestItems }),
    });
    const syncCJson = await syncCRes.json();
    assert(syncCRes.status === 200, 'Guest items successfully merged into Account C upon login');
    assert(syncCJson.data.items.length === 1, 'Account C cart has exactly 1 merged item');
    assert(
      syncCJson.data.items[0].productId.toString() === prodA._id.toString(),
      'Account C has only the guest product, none of Account B shoes'
    );

    // 8. Account A Consistency Check: Confirm Account A remained completely untouched
    console.log('\n--- 8. Final Multi-Account State Verification ---');
    const finalCartA = await fetch(`${baseUrl}/cart`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const finalCartAJson = await finalCartA.json();
    assert(finalCartAJson.data.items.length === 2, 'Account A cart still contains exactly 2 items');

    const finalWishA = await fetch(`${baseUrl}/wishlist`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const finalWishAJson = await finalWishA.json();
    assert(finalWishAJson.data.length === 1, 'Account A wishlist still contains exactly 1 item');

    const finalCartB = await fetch(`${baseUrl}/cart`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const finalCartBJson = await finalCartB.json();
    assert(finalCartBJson.data.items.length === 1, 'Account B cart still contains exactly 1 item');

    const finalCartC = await fetch(`${baseUrl}/cart`, {
      headers: { Authorization: `Bearer ${tokenC}` },
    });
    const finalCartCJson = await finalCartC.json();
    assert(finalCartCJson.data.items.length === 1, 'Account C cart still contains exactly 1 item');

    // 9. MongoDB Database Level Isolation: Confirm separate documents exist
    const docA = await CartModel.findOne({ userId: userA._id });
    const docB = await CartModel.findOne({ userId: userB._id });
    const docC = await CartModel.findOne({ userId: userC._id });

    assert(
      docA !== null && docB !== null && docC !== null,
      'MongoDB Atlas contains 3 distinct, independent Cart documents'
    );
    assert(
      docA!._id.toString() !== docB!._id.toString() && docB!._id.toString() !== docC!._id.toString(),
      'MongoDB Cart document IDs are unique per user'
    );

    console.log('\n================================================================');
    console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================');

    server.close();
    await mongoose.disconnect();

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('❌ Test execution error:', err);
    server.close();
    await mongoose.disconnect();
    process.exit(1);
  }
}

runCartWishlistIsolationTests();
