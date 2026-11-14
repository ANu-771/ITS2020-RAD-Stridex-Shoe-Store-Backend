import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import app from '../app';
import { supabase, SUPABASE_STORAGE_BUCKET, ensureStorageBucketExists } from '../config/supabase';
import { ProductModel } from '../models/product.model';
import { BrandModel } from '../models/brand.model';
import { CategoryModel } from '../models/category.model';
import http from 'http';

// Helper to make multipart request via standard Node http/fetch
async function runTests() {
  console.log('====================================================');
  console.log('🧪 STRIDEX SUPABASE STORAGE INTEGRATION TEST SUITE');
  console.log('====================================================');

  await connectDB();
  await ensureStorageBucketExists();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}/api/v1`;
  console.log(`📡 In-process test server running at ${baseUrl}`);

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passedCount++;
    } else {
      console.error(`❌ [FAIL] ${title}`);
      failedCount++;
    }
  }

  try {
    // 1. Verify Supabase connection & bucket exists
    console.log('\n--- Test 1: Supabase Connection & Bucket Verification ---');
    const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
    const hasBucket = !bErr && buckets?.some((b) => b.name === SUPABASE_STORAGE_BUCKET);
    assert(hasBucket, `Supabase bucket '${SUPABASE_STORAGE_BUCKET}' exists and is reachable`);

    // 2. Obtain tokens: Admin & Customer
    console.log('\n--- Setup: Authenticate Admin & Customer ---');
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
    assert(Boolean(adminToken), 'Admin login successful and access token retrieved');

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
    assert(Boolean(customerToken), 'Customer login successful and access token retrieved');

    // 3. Unauthorized request blocked (No token)
    console.log('\n--- Test 2: Unauthorized Upload Blocked ---');
    const noAuthFormData = new FormData();
    const dummyBlob = new Blob(['sample-image-data'], { type: 'image/png' });
    noAuthFormData.append('image', dummyBlob, 'test.png');
    const noAuthRes = await fetch(`${baseUrl}/upload/single`, {
      method: 'POST',
      body: noAuthFormData,
    });
    assert(noAuthRes.status === 401, `Upload without token returns 401 Unauthorized (got ${noAuthRes.status})`);

    // 4. Forbidden request blocked (Customer role)
    console.log('\n--- Test 3: Customer Role Forbidden From Uploading ---');
    const custFormData = new FormData();
    custFormData.append('image', dummyBlob, 'test.png');
    const custRes = await fetch(`${baseUrl}/upload/single`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: custFormData,
    });
    assert(custRes.status === 403, `Upload with CUSTOMER token returns 403 Forbidden (got ${custRes.status})`);

    // 5. Invalid File Type Rejected (e.g. text/plain)
    console.log('\n--- Test 4: Invalid File Type Rejected ---');
    const invalidFormData = new FormData();
    const txtBlob = new Blob(['some text content'], { type: 'text/plain' });
    invalidFormData.append('image', txtBlob, 'notes.txt');
    const invalidRes = await fetch(`${baseUrl}/upload/single`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: invalidFormData,
    });
    assert(
      invalidRes.status === 400 || invalidRes.status === 500,
      `Invalid MIME type rejected with client/server error (got ${invalidRes.status})`
    );

    // 6. Oversized File Rejected (> 5MB)
    console.log('\n--- Test 5: Oversized File (> 5MB) Rejected ---');
    const oversizedBuffer = new Uint8Array(6 * 1024 * 1024); // 6 MB
    const oversizedBlob = new Blob([oversizedBuffer], { type: 'image/png' });
    const oversizedFormData = new FormData();
    oversizedFormData.append('image', oversizedBlob, 'huge.png');
    const oversizedRes = await fetch(`${baseUrl}/upload/single`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: oversizedFormData,
    });
    assert(
      oversizedRes.status === 400 || oversizedRes.status === 500,
      `Oversized file (>5MB) rejected with error (got ${oversizedRes.status})`
    );

    // 7. Authorized Admin Can Upload Valid Image
    console.log('\n--- Test 6: Authorized Admin Image Upload to Supabase Storage ---');
    // 1x1 valid PNG image
    const validPngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );
    const validBlob = new Blob([validPngBuffer], { type: 'image/png' });
    const validFormData = new FormData();
    validFormData.append('image', validBlob, 'stridex_runner.png');

    const uploadRes = await fetch(`${baseUrl}/upload/single`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: validFormData,
    });
    const uploadJson = await uploadRes.json();
    assert(uploadRes.status === 200 && uploadJson.success === true, 'Admin upload returned 200 OK');

    const publicUrl = uploadJson.data?.url;
    console.log('  Returned Public URL:', publicUrl);
    assert(
      typeof publicUrl === 'string' &&
        publicUrl.includes(SUPABASE_STORAGE_BUCKET) &&
        publicUrl.includes('.supabase.co'),
      'Public URL points to Supabase Storage bucket stridex-products'
    );

    // 8. Save Product in MongoDB with the Supabase Image URL
    console.log('\n--- Test 7: Save Product in MongoDB with Supabase Image URL ---');
    const brand = await BrandModel.findOne({ isActive: true });
    const category = await CategoryModel.findOne({ isActive: true });

    const createProdRes = await fetch(`${baseUrl}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: `Supabase Test Shoe ${Date.now()}`,
        description: 'Test shoe with Supabase Storage image',
        brandId: brand?._id?.toString(),
        categoryId: category?._id?.toString(),
        basePrice: 24500,
        discountPrice: 21500,
        images: [publicUrl],
        gender: 'UNISEX',
        material: 'Engineered Mesh',
      }),
    });
    const createProdJson = await createProdRes.json();
    assert(createProdRes.status === 201, `Product created in MongoDB with status 201 (got ${createProdRes.status})`);
    const createdProductId = createProdJson.data?.id;

    // Verify saved document in MongoDB
    const savedDoc = await ProductModel.findById(createdProductId);
    assert(
      Boolean(savedDoc && savedDoc.images.includes(publicUrl)),
      'MongoDB document contains the exact Supabase public URL in images array'
    );

    // 9. Image Replacement & Deletion Workflow
    console.log('\n--- Test 8: Product Deletion and Image Cleanup ---');
    const deleteProdRes = await fetch(`${baseUrl}/products/${createdProductId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(deleteProdRes.status === 200, `Product deleted successfully via API (status: ${deleteProdRes.status})`);

    // Verify product no longer in MongoDB
    const docAfterDelete = await ProductModel.findById(createdProductId);
    assert(!docAfterDelete, 'Product document deleted from MongoDB');

    // Test explicit image deletion endpoint
    console.log('\n--- Test 9: Explicit Delete Image Endpoint ---');
    const delImgRes = await fetch(`${baseUrl}/upload`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ url: publicUrl }),
    });
    const delImgJson = await delImgRes.json();
    assert(delImgRes.status === 200, `Delete image endpoint returned 200 OK (success: ${delImgJson.success})`);

    console.log('\n====================================================');
    console.log(`📊 TEST RESULTS: ${passedCount} PASSED | ${failedCount} FAILED`);
    console.log('====================================================');

    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  } finally {
    server.close();
    await mongoose.connection.close();
  }
}

runTests();
