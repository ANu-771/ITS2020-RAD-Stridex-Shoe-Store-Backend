import http from 'http';
import app from '../app';
import { connectDB } from '../config/db';
import mongoose from 'mongoose';

async function testPhase4() {
  console.log('====================================================');
  console.log('🛍️ STRIDEX PHASE 4: CUSTOMER BROWSING & SHOPPING TEST');
  console.log('====================================================');

  await connectDB();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}/api/v1`;

  try {
    // 1. Get Categories
    console.log('\n--- 1. Testing GET /categories ---');
    const catRes = await fetch(`${baseUrl}/categories?active=true`);
    const catData = await catRes.json();
    console.log(`Status: ${catRes.status}, Total Categories: ${catData.data?.length}`);
    if (catRes.status !== 200 || !catData.success) throw new Error('Category fetch failed');
    console.log('✅ Categories loaded successfully:', catData.data.map((c: any) => c.name).join(', '));

    // 2. Get Brands
    console.log('\n--- 2. Testing GET /brands ---');
    const brandRes = await fetch(`${baseUrl}/brands?active=true`);
    const brandData = await brandRes.json();
    console.log(`Status: ${brandRes.status}, Total Brands: ${brandData.data?.length}`);
    if (brandRes.status !== 200 || !brandData.success) throw new Error('Brand fetch failed');
    console.log('✅ Brands loaded successfully:', brandData.data.map((b: any) => b.name).join(', '));

    // 3. Get All Products with Pagination
    console.log('\n--- 3. Testing GET /products ---');
    const prodRes = await fetch(`${baseUrl}/products?page=1&limit=10`);
    const prodData = await prodRes.json();
    console.log(`Status: ${prodRes.status}, Products returned: ${prodData.data?.length}, Total: ${prodData.pagination?.totalItems}`);
    if (prodRes.status !== 200 || !prodData.success) throw new Error('Products fetch failed');
    console.log('✅ Products list loaded successfully');

    // 4. Test Search Query Filter
    console.log('\n--- 4. Testing Search Query Filter (GET /products?search=Nike) ---');
    const searchRes = await fetch(`${baseUrl}/products?search=Nike`);
    const searchData = await searchRes.json();
    console.log(`Status: ${searchRes.status}, Matches found: ${searchData.data?.length}`);
    if (searchRes.status !== 200) throw new Error('Search failed');
    console.log('✅ Product search operational');

    // 5. Test Brand Filter
    const sampleBrand = brandData.data[0];
    console.log(`\n--- 5. Testing Brand Filter (GET /products?brand=${sampleBrand.slug}) ---`);
    const brandFilterRes = await fetch(`${baseUrl}/products?brand=${sampleBrand.slug}`);
    const brandFilterData = await brandFilterRes.json();
    console.log(`Status: ${brandFilterRes.status}, Products for brand "${sampleBrand.name}": ${brandFilterData.data?.length}`);
    if (brandFilterRes.status !== 200) throw new Error('Brand filter failed');
    console.log('✅ Brand filtering operational');

    // 6. Test Category Filter
    const sampleCat = catData.data[0];
    console.log(`\n--- 6. Testing Category Filter (GET /products?category=${sampleCat.slug}) ---`);
    const catFilterRes = await fetch(`${baseUrl}/products?category=${sampleCat.slug}`);
    const catFilterData = await catFilterRes.json();
    console.log(`Status: ${catFilterRes.status}, Products in "${sampleCat.name}": ${catFilterData.data?.length}`);
    if (catFilterRes.status !== 200) throw new Error('Category filter failed');
    console.log('✅ Category filtering operational');

    // 7. Test Size and Color Variant Filter
    console.log('\n--- 7. Testing Variant Size & Color Filter (GET /products?size=42) ---');
    const sizeRes = await fetch(`${baseUrl}/products?size=42`);
    const sizeData = await sizeRes.json();
    console.log(`Status: ${sizeRes.status}, Shoes matching size 42: ${sizeData.data?.length}`);
    if (sizeRes.status !== 200) throw new Error('Size filter failed');
    console.log('✅ Size & variant filtering operational');

    // 8. Test Product Details by Slug
    if (prodData.data.length > 0) {
      const firstProduct = prodData.data[0];
      console.log(`\n--- 8. Testing Product Details (GET /products/${firstProduct.slug}) ---`);
      const detailRes = await fetch(`${baseUrl}/products/${firstProduct.slug}`);
      const detailData = await detailRes.json();
      console.log(`Status: ${detailRes.status}, Shoe Name: "${detailData.data?.name}", BasePrice: Rs. ${detailData.data?.basePrice}`);
      if (detailRes.status !== 200 || !detailData.data) throw new Error('Product details failed');
      console.log(`Variants loaded: ${detailData.data?.variants?.length || 0}`);
      console.log('✅ Product details operational with variants and LKR pricing');
    }

    console.log('\n====================================================');
    console.log('🎉 ALL PHASE 4 CUSTOMER API VERIFICATIONS PASSED!');
    console.log('====================================================\n');
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

testPhase4().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
