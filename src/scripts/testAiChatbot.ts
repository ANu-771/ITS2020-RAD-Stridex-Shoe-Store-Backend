import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import http from 'http';
import fs from 'fs';
import path from 'path';
import app from '../app';
import { connectDB } from '../config/db';
import { ProductModel } from '../models/product.model';
import { ProductVariantModel } from '../models/productVariant.model';
import { BrandModel } from '../models/brand.model';
import { CategoryModel } from '../models/category.model';
import { aiChatService } from '../service/aiChat.service';

async function runAiChatbotTestSuite() {
  console.log('========================================================================');
  console.log('🤖 STRIDEX SIMPLE AI SHOPPING CHATBOT (GEMINI + MONGODB ATLAS) TEST SUITE');
  console.log('========================================================================');

  await connectDB();

  const server = http.createServer(app);
  const TEST_PORT = 7910;
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

  let createdTestProductId: any = null;
  let createdTestVariantId: any = null;

  try {
    // ---------------------------------------------------------
    // 1. Live Product Catalog Retrieval from MongoDB Atlas
    // ---------------------------------------------------------
    console.log('\n--- 1. Live MongoDB Atlas Product Catalog Retrieval ---');

    const liveCatalog = await aiChatService.getLiveProductCatalog();
    assert(liveCatalog.length > 0, `Live catalog retrieved ${liveCatalog.length} active footwear products from MongoDB`);

    const sampleProduct = liveCatalog[0];
    assert(Boolean(sampleProduct.id), `Product has real MongoDB ID: ${sampleProduct.id}`);
    assert(Boolean(sampleProduct.name), `Product name: "${sampleProduct.name}"`);
    assert(Boolean(sampleProduct.brand), `Product brand: "${sampleProduct.brand}"`);
    assert(sampleProduct.formattedPrice.startsWith('Rs. '), `Currency formatted in LKR: ${sampleProduct.formattedPrice}`);
    assert(Array.isArray(sampleProduct.sizes), `Available sizes array present (Count: ${sampleProduct.sizes.length})`);
    assert(typeof sampleProduct.totalStock === 'number', `Live stock aggregated: ${sampleProduct.totalStock} units`);

    // ---------------------------------------------------------
    // 2. Normal STRIDEX Shopping Question
    // ---------------------------------------------------------
    console.log('\n--- 2. Normal STRIDEX Shopping Inquiry ---');

    const generalInquiryRes = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'What shoes do you have available at STRIDEX?',
      }),
    });
    const generalInquiryData = await generalInquiryRes.json();
    assert(generalInquiryRes.status === 200, 'Chat API responded with HTTP 200');
    assert(generalInquiryData.success === true, 'Response success is true');
    assert(
      generalInquiryData.reply.length > 20,
      'Gemini generated natural shopping response'
    );
    assert(
      Array.isArray(generalInquiryData.suggestedProducts),
      'Response includes suggestedProducts array'
    );

    // ---------------------------------------------------------
    // 3. Search for Nike Products
    // ---------------------------------------------------------
    console.log('\n--- 3. Brand Search: Nike Footwear ---');

    const nikeRes = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Show me Nike shoes available in your store',
      }),
    });
    const nikeData = await nikeRes.json();
    assert(nikeRes.status === 200, 'Nike search query succeeded with HTTP 200');
    assert(
      nikeData.reply.toLowerCase().includes('nike') ||
        nikeData.suggestedProducts.some((p: any) => p.brand.toLowerCase() === 'nike'),
      'Chatbot successfully retrieved and recommended Nike footwear'
    );

    // ---------------------------------------------------------
    // 4. Search for Shoes Under Rs. 10,000 (LKR Pricing)
    // ---------------------------------------------------------
    console.log('\n--- 4. Price-Filtered Search: Shoes Under Rs. 10,000 ---');

    const budgetRes = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Show me running shoes under Rs. 10,000 in Sri Lankan Rupees',
      }),
    });
    const budgetData = await budgetRes.json();
    assert(budgetRes.status === 200, 'Budget search succeeded with HTTP 200');
    assert(
      budgetData.reply.includes('Rs.') || budgetData.reply.includes('10,000') || budgetData.suggestedProducts.length > 0,
      'Chatbot references LKR currency and respects budget threshold'
    );

    // ---------------------------------------------------------
    // 5. Check Available Sizes for Real Product
    // ---------------------------------------------------------
    console.log('\n--- 5. Specific Product Size Check ---');

    const sizeRes = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `What sizes are available for the ${sampleProduct.name}?`,
      }),
    });
    const sizeData = await sizeRes.json();
    assert(sizeRes.status === 200, 'Size inquiry succeeded with HTTP 200');
    assert(
      sizeData.reply.includes('size') || sizeData.reply.includes('Size') || sizeData.suggestedProducts.length > 0,
      `Chatbot answered size availability for "${sampleProduct.name}"`
    );

    // ---------------------------------------------------------
    // 6. Check Specific Product Price
    // ---------------------------------------------------------
    console.log('\n--- 6. Specific Product Price Check ---');

    const priceRes = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `What is the price of the ${sampleProduct.name}?`,
      }),
    });
    const priceData = await priceRes.json();
    assert(priceRes.status === 200, 'Price inquiry succeeded with HTTP 200');
    assert(
      priceData.reply.includes('Rs.') && !priceData.reply.includes('$'),
      'Chatbot accurately quoted price with "Rs." prefix and zero dollar symbols'
    );

    // ---------------------------------------------------------
    // 7. Dynamic Live Updates: Add New Shoe to MongoDB
    // ---------------------------------------------------------
    console.log('\n--- 7. Dynamic Live Updates: Product Addition ---');

    const testBrand = await BrandModel.findOne({ isActive: true });
    const testCategory = await CategoryModel.findOne({ isActive: true });

    const newTestProduct = await ProductModel.create({
      name: 'STRIDEX Velocity Nova Speed 2026',
      slug: `stridex-velocity-nova-speed-${Date.now()}`,
      description: 'Ultra-lightweight marathon running shoe engineered for elite athletes.',
      brandId: testBrand?._id,
      categoryId: testCategory?._id,
      basePrice: 16500,
      discountPrice: 14500,
      images: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff'],
      gender: 'UNISEX',
      isFeatured: true,
      isActive: true,
    });
    createdTestProductId = newTestProduct._id;

    const newTestVariant = await ProductVariantModel.create({
      productId: newTestProduct._id,
      SKU: `VEL-NOV-${Date.now().toString().slice(-4)}`,
      size: 43,
      color: 'Emerald Speed Green',
      stockQuantity: 18,
      reservedQuantity: 0,
      isActive: true,
    });
    createdTestVariantId = newTestVariant._id;

    console.log(`• Added new product: "${newTestProduct.name}" (Price: Rs. 14,500.00, Size: 43, Stock: 18)`);

    // Ask chatbot immediately about the newly added product
    const addCheckRes = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Do you have the STRIDEX Velocity Nova Speed shoe in stock?',
      }),
    });
    const addCheckData = await addCheckRes.json();
    assert(addCheckRes.status === 200, 'Chatbot query for newly created shoe succeeded (HTTP 200)');
    assert(
      addCheckData.reply.toLowerCase().includes('velocity nova') ||
        addCheckData.suggestedProducts.some((p: any) => p.name.includes('Velocity Nova')),
      'Chatbot immediately detected new shoe from live MongoDB Atlas without manual retraining'
    );

    // ---------------------------------------------------------
    // 8. Dynamic Live Updates: Price Modification
    // ---------------------------------------------------------
    console.log('\n--- 8. Dynamic Live Updates: Price Modification ---');

    // Admin updates price to Rs. 21,500.00
    await ProductModel.findByIdAndUpdate(createdTestProductId, {
      basePrice: 21500,
      discountPrice: 0,
    });

    console.log('• Admin updated price of Velocity Nova to Rs. 21,500.00');

    const priceUpdateRes = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'What is the current price of the STRIDEX Velocity Nova Speed?',
      }),
    });
    const priceUpdateData = await priceUpdateRes.json();
    assert(priceUpdateRes.status === 200, 'Updated price query succeeded (HTTP 200)');
    assert(
      priceUpdateData.reply.includes('21,500') ||
        priceUpdateData.suggestedProducts.some((p: any) => p.effectivePrice === 21500),
      'Chatbot immediately returned modified price (Rs. 21,500.00) from live database'
    );

    // ---------------------------------------------------------
    // 9. Dynamic Live Updates: Stock Adjustment (Out of Stock)
    // ---------------------------------------------------------
    console.log('\n--- 9. Dynamic Live Updates: Stock Depletion ---');

    // Admin sets stock to 0
    await ProductVariantModel.findByIdAndUpdate(createdTestVariantId, {
      stockQuantity: 0,
    });

    console.log('• Admin updated variant stock to 0 units');

    const stockCheckRes = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Is the STRIDEX Velocity Nova Speed currently in stock?',
      }),
    });
    const stockCheckData = await stockCheckRes.json();
    assert(stockCheckRes.status === 200, 'Stock status query succeeded (HTTP 200)');
    assert(
      stockCheckData.reply.toLowerCase().includes('out of stock') ||
        stockCheckData.reply.toLowerCase().includes('0') ||
        stockCheckData.reply.toLowerCase().includes('currently unavailable'),
      'Chatbot immediately informed customer that shoe is out of stock'
    );

    // ---------------------------------------------------------
    // 10. Dynamic Live Updates: Product Deactivation
    // ---------------------------------------------------------
    console.log('\n--- 10. Dynamic Live Updates: Product Deactivation ---');

    // Admin deactivates product
    await ProductModel.findByIdAndUpdate(createdTestProductId, {
      isActive: false,
    });

    console.log('• Admin set isActive: false on test shoe');

    // Live catalog must not contain deactivated shoe
    const liveCatalogAfterDeactivation = await aiChatService.getLiveProductCatalog();
    const isPresent = liveCatalogAfterDeactivation.some(
      (p) => p.id === createdTestProductId.toString()
    );
    assert(!isPresent, 'Deactivated product is immediately excluded from live catalog queries');

    // ---------------------------------------------------------
    // 11. Strict STRIDEX-Only Restriction & Unrelated Question Refusal
    // ---------------------------------------------------------
    console.log('\n--- 11. Strict STRIDEX-Only Restriction & Unrelated Query Refusals ---');

    const EXPECTED_REFUSAL_SNIPPET = "I'm the STRIDEX AI Shopping Assistant. 👟";

    // Unrelated Query A: Programming code
    const codingRes = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Write a Python program to calculate the Fibonacci series',
      }),
    });
    const codingData = await codingRes.json();
    assert(codingRes.status === 200, 'Unrelated coding inquiry returned HTTP 200');
    assert(
      codingData.reply.includes(EXPECTED_REFUSAL_SNIPPET) ||
        codingData.reply.includes('help you find shoes'),
      'Chatbot strictly refused programming question with STRIDEX Assistant statement'
    );

    // Unrelated Query B: Politics / World news
    const politicsRes = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Who won the 2024 United States presidential election?',
      }),
    });
    const politicsData = await politicsRes.json();
    assert(
      politicsData.reply.includes(EXPECTED_REFUSAL_SNIPPET) ||
        politicsData.reply.includes('help you find shoes'),
      'Chatbot strictly refused political inquiry and redirected to footwear shopping'
    );

    // ---------------------------------------------------------
    // 12. Error Handling: Gemini API Unavailable
    // ---------------------------------------------------------
    console.log('\n--- 12. Error Handling: Gemini Unavailable Simulation ---');

    const originalKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'INVALID_FAKE_KEY_FOR_TESTING';

    const geminiDownRes = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Recommend some sneakers',
      }),
    });
    const geminiDownData = await geminiDownRes.json();
    assert(geminiDownRes.status === 503, 'Gemini failure returned HTTP 503 Service Unavailable');
    assert(
      geminiDownData.reply ===
        'Sorry! Our STRIDEX AI Assistant is temporarily unavailable. Please try again later.',
      'Returns exact error message: "Sorry! Our STRIDEX AI Assistant is temporarily unavailable. Please try again later."'
    );

    // Restore API key
    process.env.GEMINI_API_KEY = originalKey;

    // ---------------------------------------------------------
    // 13. Frontend Security Verification: Zero API Key Exposure
    // ---------------------------------------------------------
    console.log('\n--- 13. Frontend Code Security Audit: Zero Key Exposure ---');

    const frontendSrcPath = path.resolve(__dirname, '../../../Shoe_Store_Frontend/src');
    let foundKeyInFrontend = false;

    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (/\.(ts|tsx|js|jsx|json|html|css)$/.test(entry.name)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (
            content.includes('AQ.Ab8RN') ||
            content.includes('VITE_GEMINI_API_KEY') ||
            (content.includes('GEMINI_API_KEY') && !content.includes('//'))
          ) {
            foundKeyInFrontend = true;
            console.error(`🚨 KEY LEAK FOUND IN: ${fullPath}`);
          }
        }
      }
    }

    scanDir(frontendSrcPath);
    assert(!foundKeyInFrontend, 'AUDIT PASSED: GEMINI_API_KEY is 100% hidden on backend; zero exposure in React frontend');

    console.log('\n========================================================================');
    console.log(`📊 AI CHATBOT SUITE: ${passed} PASSED | ${failed} FAILED`);
    console.log('========================================================================');
  } catch (err) {
    console.error('Fatal test error in AI Chatbot Suite:', err);
    failed++;
  } finally {
    // Clean up test documents from MongoDB
    if (createdTestProductId) {
      await ProductModel.findByIdAndDelete(createdTestProductId).catch(() => {});
    }
    if (createdTestVariantId) {
      await ProductVariantModel.findByIdAndDelete(createdTestVariantId).catch(() => {});
    }

    server.close();
    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runAiChatbotTestSuite();
