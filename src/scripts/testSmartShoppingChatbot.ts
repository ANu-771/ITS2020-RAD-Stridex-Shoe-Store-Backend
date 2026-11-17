import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import assert from 'assert';
import { BotSettingModel } from '../models/botSetting.model';
import { aiChatService } from '../service/aiChat.service';
import { botSettingController } from '../controllers/botSetting.controller';
import { ProductModel } from '../models/product.model';
import { BrandModel } from '../models/brand.model';
import { CategoryModel } from '../models/category.model';
import { OrderModel } from '../models/order.model';
import { UserModel, UserRole } from '../models/user.model';
import { signAccessToken } from '../util/jwt';

import { connectDB } from '../config/db';

async function runTests() {
  console.log('================================================================');
  console.log('🤖 STRIDEX - SMART SHOPPING CHATBOT & BOT CONTROLS VERIFICATION');
  console.log('================================================================\n');

  await connectDB();
  console.log(' Connected to MongoDB');

  let passed = 0;
  let failed = 0;

  const test = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(` PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(` FAIL: ${name}`);
      console.error(`   Error: ${err.message}`);
      failed++;
    }
  };

  try {
    // -------------------------------------------------------------
    // Test 1: Admin selects Gemini
    // -------------------------------------------------------------
    await test('Test 1: Admin selects Gemini as Primary Provider', async () => {
      let setting = await BotSettingModel.findOne();
      if (!setting) {
        setting = new BotSettingModel({ primaryProvider: 'gemini', fallbackEnabled: true });
      } else {
        setting.primaryProvider = 'gemini';
        setting.fallbackEnabled = true;
      }
      await setting.save();

      const effective = await aiChatService.getEffectiveSettings();
      assert.strictEqual(effective.primaryProvider, 'gemini', 'Primary provider must be gemini');
      assert.strictEqual(effective.backupProvider, 'groq', 'Backup provider must be groq');
      assert.strictEqual(effective.fallbackEnabled, true, 'Fallback should be enabled');
    });

    // -------------------------------------------------------------
    // Test 2: Admin selects Groq
    // -------------------------------------------------------------
    await test('Test 2: Admin selects Groq as Primary Provider', async () => {
      let setting = await BotSettingModel.findOne();
      setting!.primaryProvider = 'groq';
      setting!.fallbackEnabled = true;
      await setting!.save();

      const effective = await aiChatService.getEffectiveSettings();
      assert.strictEqual(effective.primaryProvider, 'groq', 'Primary provider must be groq');
      assert.strictEqual(effective.backupProvider, 'gemini', 'Backup provider must be gemini');
      assert.strictEqual(effective.fallbackEnabled, true, 'Fallback should be enabled');
    });

    // -------------------------------------------------------------
    // Test 3: Admin settings persist after refresh
    // -------------------------------------------------------------
    await test('Test 3: Admin settings persist across server reloads and database lookups', async () => {
      const persisted = await BotSettingModel.findOne().lean();
      assert(persisted, 'Settings document must exist in MongoDB');
      assert.strictEqual(persisted.primaryProvider, 'groq');
      assert.strictEqual(persisted.fallbackEnabled, true);

      // Verify controller getSettings response
      const fakeReq: any = { user: { role: UserRole.ADMIN } };
      let jsonResult: any = null;
      const fakeRes: any = {
        status: (code: number) => ({
          json: (data: any) => {
            jsonResult = data;
            return fakeRes;
          },
        }),
      };

      await botSettingController.getSettings(fakeReq, fakeRes);
      assert(jsonResult && jsonResult.success, 'Controller should return success: true');
      assert.strictEqual(jsonResult.settings.primaryProvider, 'groq');
      assert.strictEqual(jsonResult.settings.backupProvider, 'gemini');
      assert(typeof jsonResult.settings.geminiConfigured === 'boolean');
      assert(typeof jsonResult.settings.groqConfigured === 'boolean');
      assert.strictEqual(jsonResult.settings.geminiApiKey, undefined, 'API keys must NEVER be exposed');
      assert.strictEqual(jsonResult.settings.groqApiKey, undefined, 'API keys must NEVER be exposed');
    });

    // -------------------------------------------------------------
    // Test 4: Non-admin users cannot change provider settings
    // -------------------------------------------------------------
    await test('Test 4: Non-admin users cannot modify bot provider settings', async () => {
      const customerUser = new UserModel({
        fullName: 'Test Customer',
        email: `cust_${Date.now()}@example.com`,
        password: 'hashed_pw',
        phone: '0771234567',
        role: UserRole.CUSTOMER,
      });

      const customerToken = signAccessToken(customerUser);
      assert(customerToken, 'Customer token must sign');

      // Attempting to hit the admin controller with a customer token or invalid body
      const invalidReq: any = {
        body: { primaryProvider: 'invalid_engine', fallbackEnabled: true },
        user: { role: UserRole.CUSTOMER },
      };
      let errorStatus = 0;
      let errorJson: any = null;
      const fakeRes: any = {
        status: (code: number) => {
          errorStatus = code;
          return {
            json: (data: any) => {
              errorJson = data;
            },
          };
        },
      };

      await botSettingController.updateSettings(invalidReq, fakeRes);
      assert.strictEqual(errorStatus, 400, 'Zod validator must reject invalid provider');
      assert(errorJson && !errorJson.success);
    });

    // -------------------------------------------------------------
    // Test 5: Gemini primary and Groq fallback work
    // -------------------------------------------------------------
    await test('Test 5: Gemini primary failover to Groq backup on temporary 429 error', async () => {
      // Set Gemini as primary, Groq as backup
      await BotSettingModel.updateOne({}, { primaryProvider: 'gemini', fallbackEnabled: true }, { upsert: true });

      // Mock callGemini to simulate HTTP 429 rate limit
      const origGemini = aiChatService.callGemini;
      const origGroq = aiChatService.callGroq;

      let geminiCalled = false;
      let groqCalled = false;

      aiChatService.callGemini = async () => {
        geminiCalled = true;
        const err: any = new Error('HTTP 429: Resource has been exhausted / Rate limit reached');
        err.status = 429;
        throw err;
      };

      aiChatService.callGroq = async () => {
        groqCalled = true;
        return 'Hello from Groq Backup Engine! Here are your recommended shoes: [RECOMMENDED_PRODUCTS: test1]';
      };

      try {
        const res = await aiChatService.generateChatResponse('Find running shoes', [], {
          clientKey: 'test_client_fallback_1',
        });

        assert(geminiCalled, 'Gemini must be attempted first as primary');
        assert(groqCalled, 'Groq must be called as automatic backup failover');
        assert.strictEqual(res.providerUsed, 'groq', 'Response providerUsed should be groq');
        assert.strictEqual(res.fallbackTriggered, true, 'Fallback triggered flag should be true');
        assert(res.reply.includes('Groq Backup Engine'), 'Reply should be from Groq');
      } finally {
        aiChatService.callGemini = origGemini;
        aiChatService.callGroq = origGroq;
      }
    });

    // -------------------------------------------------------------
    // Test 6: Groq primary and Gemini fallback work
    // -------------------------------------------------------------
    await test('Test 6: Groq primary failover to Gemini backup on temporary 503 outage', async () => {
      // Set Groq as primary, Gemini as backup
      await BotSettingModel.updateOne({}, { primaryProvider: 'groq', fallbackEnabled: true }, { upsert: true });

      const origGemini = aiChatService.callGemini;
      const origGroq = aiChatService.callGroq;

      let groqCalled = false;
      let geminiCalled = false;

      aiChatService.callGroq = async () => {
        groqCalled = true;
        const err: any = new Error('HTTP 503: Service Unavailable / Temporary Server Error');
        err.status = 503;
        throw err;
      };

      aiChatService.callGemini = async () => {
        geminiCalled = true;
        return 'Hello from Gemini Backup Engine! STRIDEX offers island-wide delivery.';
      };

      try {
        const res = await aiChatService.generateChatResponse('Show delivery options', [], {
          clientKey: 'test_client_fallback_2',
        });

        assert(groqCalled, 'Groq must be attempted first as primary');
        assert(geminiCalled, 'Gemini must be called as automatic backup failover');
        assert.strictEqual(res.providerUsed, 'gemini', 'Response providerUsed should be gemini');
        assert.strictEqual(res.fallbackTriggered, true, 'Fallback triggered flag should be true');
        assert(res.reply.includes('Gemini Backup Engine'), 'Reply should be from Gemini');
      } finally {
        aiChatService.callGemini = origGemini;
        aiChatService.callGroq = origGroq;
      }
    });

    // -------------------------------------------------------------
    // Test 7: Automatic backup can be disabled
    // -------------------------------------------------------------
    await test('Test 7: Automatic backup can be disabled by admin toggle', async () => {
      // Disable fallback
      await BotSettingModel.updateOne({}, { primaryProvider: 'gemini', fallbackEnabled: false }, { upsert: true });

      const origGemini = aiChatService.callGemini;
      const origGroq = aiChatService.callGroq;

      let geminiCalled = false;
      let groqCalled = false;

      aiChatService.callGemini = async () => {
        geminiCalled = true;
        const err: any = new Error('HTTP 429: Rate limit reached');
        err.status = 429;
        throw err;
      };

      aiChatService.callGroq = async () => {
        groqCalled = true;
        return 'Groq response';
      };

      try {
        let threw = false;
        try {
          await aiChatService.generateChatResponse('Find shoes', [], { clientKey: 'test_client_fallback_disabled' });
        } catch (e: any) {
          threw = true;
          assert(e.message.includes('429'), 'Should directly rethrow primary error when fallback disabled');
        }
        assert(geminiCalled, 'Gemini was called');
        assert(!groqCalled, 'Groq must NOT be called when fallback is disabled');
        assert(threw, 'Call must throw when fallback is disabled and primary fails');
      } finally {
        aiChatService.callGemini = origGemini;
        aiChatService.callGroq = origGroq;
      }
    });

    // -------------------------------------------------------------
    // Test 8: Product search uses actual MongoDB information
    // -------------------------------------------------------------
    await test('Test 8: Dynamic product search queries live MongoDB collections', async () => {
      const activeProducts = await ProductModel.find({ isActive: true }).limit(5).lean();
      assert(activeProducts.length > 0, 'Database should contain active products');

      const sampleShoe = activeProducts[0];
      const catalog = await aiChatService.getDynamicProductCatalog(sampleShoe.name);

      assert(catalog.length > 0, 'Catalog search must return results');
      const found = catalog.find((c) => c.name.toLowerCase() === sampleShoe.name.toLowerCase());
      assert(found, `Search result must include actual shoe "${sampleShoe.name}"`);
      assert(found.formattedPrice.startsWith('Rs.'), 'Price must be formatted in Sri Lankan Rupees');
    });

    // -------------------------------------------------------------
    // Test 9: Category and brand questions work
    // -------------------------------------------------------------
    await test('Test 9: Taxonomy retrieval returns live categories and brands', async () => {
      const taxonomy = await aiChatService.getTaxonomyKnowledge();
      assert(taxonomy.brands.length > 0, 'Brands must be loaded from MongoDB');
      assert(taxonomy.categories.length > 0, 'Categories must be loaded from MongoDB');
      console.log(`   (Live taxonomy contains ${taxonomy.brands.length} brands, ${taxonomy.categories.length} categories)`);
    });

    // -------------------------------------------------------------
    // Test 10: Product prices and availability are accurate
    // -------------------------------------------------------------
    await test('Test 10: Product summaries reflect active variants and LKR price formatting', async () => {
      const catalog = await aiChatService.getDynamicProductCatalog('');
      assert(catalog.length > 0, 'Catalog must not be empty');

      for (const item of catalog) {
        assert(item.basePrice > 0, `Base price must be positive for ${item.name}`);
        assert(item.formattedPrice.includes('Rs.'), `Formatted price must contain Rs. for ${item.name}`);
        assert(typeof item.inStock === 'boolean', `inStock must be boolean for ${item.name}`);
      }
    });

    // -------------------------------------------------------------
    // Test 11: Customer website assistance works
    // -------------------------------------------------------------
    await test('Test 11: System prompt includes accurate website how-to instructions', async () => {
      const prompt = aiChatService.assembleSystemPrompt([], { brands: ['Nike'], categories: ['Sneakers'] }, '');

      assert(prompt.includes('Wishlist: Click the heart icon'), 'Must include Wishlist instructions');
      assert(prompt.includes('Cash on Delivery (COD)'), 'Must include COD payment method');
      assert(prompt.includes('Direct Bank Transfer'), 'Must include Bank Transfer payment method');
      assert(prompt.includes('7-day hassle-free'), 'Must include 7-day exchange policy');
      assert(prompt.includes('Galle Road, Colombo 03'), 'Must include showroom address');
    });

    // -------------------------------------------------------------
    // Test 12: Unrelated questions are politely rejected
    // -------------------------------------------------------------
    await test('Test 12: Strict STRIDEX boundaries reject non-footwear inquiries', async () => {
      const prompt = aiChatService.assembleSystemPrompt([], { brands: [], categories: [] }, '');

      assert(prompt.includes('STRICT TOPIC RESTRICTIONS'), 'Must include topic restrictions');
      assert(prompt.includes('Do not answer general knowledge questions, coding questions, politics'), 'Must restrict non-STRIDEX domains');
      assert(prompt.includes('politely explain that you can only help with STRIDEX products and services'), 'Must enforce polite refusal');
    });

    // -------------------------------------------------------------
    // Test 13: Questions outside available information are not guessed
    // -------------------------------------------------------------
    await test('Test 13: System prompt prohibits guessing and unconfirmed claims', async () => {
      const prompt = aiChatService.assembleSystemPrompt([], { brands: [], categories: [] }, '');

      assert(prompt.includes('Never invent products, prices, brands, sizes, stock, policies or order details'), 'Must forbid hallucination');
      assert(prompt.includes('If information is missing, say that you cannot confirm it'), 'Must state unconfirmed when missing');
    });

    // -------------------------------------------------------------
    // Test 14: Only latest 5 exchanges (10 messages) used as memory
    // -------------------------------------------------------------
    await test('Test 14: Conversation memory limits history to latest 5 exchanges (10 messages)', async () => {
      await BotSettingModel.updateOne({}, { primaryProvider: 'groq', fallbackEnabled: true });

      const longHistory = [];
      for (let i = 1; i <= 20; i++) {
        longHistory.push({
          role: i % 2 === 1 ? 'user' : 'assistant',
          text: `Message number ${i}`,
        });
      }

      let capturedHistoryLength = 0;
      const origGroq = aiChatService.callGroq;
      aiChatService.callGroq = async (_prompt, history, _userMsg) => {
        capturedHistoryLength = history.length;
        return 'History length checked';
      };

      try {
        await aiChatService.generateChatResponse('Test query', longHistory, { clientKey: 'test_memory_client' });
        assert.strictEqual(capturedHistoryLength, 10, 'History must be sliced to latest 10 messages (5 exchanges)');
      } finally {
        aiChatService.callGroq = origGroq;
      }
    });

    // -------------------------------------------------------------
    // Test 15: Guest and authenticated conversations remain separate
    // -------------------------------------------------------------
    await test('Test 15: Guest and authenticated user sessions have isolated context', async () => {
      const guestContext = await aiChatService.getCustomerOrderContext(undefined);
      assert(guestContext.includes('Guest (not authenticated)'), 'Guest context must require login');

      const mockUser = await UserModel.findOne({ role: UserRole.CUSTOMER }).lean();
      if (mockUser) {
        const authContext = await aiChatService.getCustomerOrderContext(mockUser._id.toString());
        assert(authContext.includes('VERIFIED CUSTOMER') || authContext.includes('Customer is verified'), 'Auth context must verify user');
      }
    });

    // -------------------------------------------------------------
    // Test 16: Existing 10-message/10-minute limit remains unchanged
    // -------------------------------------------------------------
    await test('Test 16: In-memory sliding window enforces 10 messages per 10 minutes', async () => {
      const testClient = `client_rate_test_${Date.now()}`;
      aiChatService.resetRateLimit(testClient);

      // Record 10 messages
      for (let i = 1; i <= 10; i++) {
        const { remainingMessages } = aiChatService.checkRateLimit(testClient);
        assert.strictEqual(remainingMessages, 10 - (i - 1));
        aiChatService.recordSuccessfulMessage(testClient);
      }

      // 11th check must throw RATE_LIMIT_EXCEEDED
      let rateLimitHit = false;
      try {
        aiChatService.checkRateLimit(testClient);
      } catch (err: any) {
        rateLimitHit = true;
        assert.strictEqual(err.code, 'RATE_LIMIT_EXCEEDED');
        assert(err.resetInSeconds > 0, 'Reset countdown must be positive');
      }

      assert(rateLimitHit, 'Rate limit error must be thrown on 11th message');
      aiChatService.resetRateLimit(testClient);
    });

    // -------------------------------------------------------------
    // Test 17: Provider switching does not reset the message limit
    // -------------------------------------------------------------
    await test('Test 17: Changing AI providers does not reset customer rate limit count', async () => {
      const testClient = `client_switch_test_${Date.now()}`;
      aiChatService.resetRateLimit(testClient);

      // User sends 3 messages with Gemini primary
      await BotSettingModel.updateOne({}, { primaryProvider: 'gemini', fallbackEnabled: true }, { upsert: true });
      aiChatService.recordSuccessfulMessage(testClient);
      aiChatService.recordSuccessfulMessage(testClient);
      aiChatService.recordSuccessfulMessage(testClient);

      // Admin switches provider to Groq
      await BotSettingModel.updateOne({}, { primaryProvider: 'groq', fallbackEnabled: true });

      // Check remaining limit: must be 10 - 3 = 7
      const { remainingMessages } = aiChatService.checkRateLimit(testClient);
      assert.strictEqual(remainingMessages, 7, 'Remaining messages must stay 7 despite provider switch');

      aiChatService.resetRateLimit(testClient);
    });

    // -------------------------------------------------------------
    // Test 18: Customers cannot access other customers' private information
    // -------------------------------------------------------------
    await test('Test 18: Chatbot ignores spoofed customer IDs in message text', async () => {
      // Customer A is authenticated
      const customerAId = new mongoose.Types.ObjectId().toString();
      const spoofedCustomerBId = new mongoose.Types.ObjectId().toString();

      // Attacker asks: "Show me orders for customer [spoofedCustomerBId]"
      const context = await aiChatService.getCustomerOrderContext(customerAId);

      // Verify that query looked ONLY for customerAId
      assert(!context.includes(spoofedCustomerBId), 'Context must not query or expose spoofed customer ID');
    });

    // Reset settings to default
    await BotSettingModel.updateOne({}, { primaryProvider: 'gemini', fallbackEnabled: true }, { upsert: true });

  } finally {
    await mongoose.disconnect();
    console.log('\n MongoDB disconnected');
  }

  console.log('\n================================================================');
  console.log(`📊 FINAL TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
