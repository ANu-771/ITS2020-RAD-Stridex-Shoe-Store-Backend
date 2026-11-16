import { GoogleGenAI } from '@google/genai';
import { ProductModel } from '../models/product.model';
import { ProductVariantModel } from '../models/productVariant.model';
import { BrandModel } from '../models/brand.model';
import { CategoryModel } from '../models/category.model';

// Ensure Mongoose models are explicitly referenced so schemas are registered
void BrandModel;
void CategoryModel;

export interface LiveProductSummary {
  id: string;
  name: string;
  slug: string;
  brand: string;
  category: string;
  basePrice: number;
  discountPrice: number;
  effectivePrice: number;
  formattedPrice: string;
  image: string;
  gender: string;
  sizes: (string | number)[];
  colors: string[];
  totalStock: number;
  inStock: boolean;
  description: string;
}

export interface ChatServiceResponse {
  reply: string;
  suggestedProducts: LiveProductSummary[];
}

const STRIDEX_POLICY_FAQ = `
STRIDEX STORE INFORMATION & SHOPPING POLICIES:
- Store Name: STRIDEX (Tagline: "Step Into Your Style")
- Store Type: Premium Footwear E-Commerce Platform based in Sri Lanka
- Currency: Sri Lankan Rupees (LKR), formatted strictly as "Rs. 12,500.00"
- Island-Wide Express Delivery: Available across all 9 provinces and 25 districts in Sri Lanka. Delivery is FREE on orders over Rs. 15,000.00 (standard delivery fee is Rs. 650.00).
- Payment Options:
  1. Cash on Delivery (COD) - Pay upon doorstep receipt anywhere in Sri Lanka.
  2. Direct Bank Transfer - Commercial Bank of Ceylon (Acc: 1000-8492-3810) and Hatton National Bank (Acc: 0390-1029-4821).
  3. Online Card Payment (Visa, MasterCard, AMEX) - Currently coming soon!
- Digital Gift Vouchers: Available in denominations of Rs. 2,500, Rs. 5,000, Rs. 10,000, and Rs. 15,000 via Direct Bank Transfer. Vouchers are strictly recipient-assigned.
- Return & Exchange Policy: 7-day hassle-free size and model exchange for unworn footwear in original box with tags attached.
- Physical Showroom & Pickup: Galle Road, Colombo 03, Sri Lanka.
`;

const STRIDEX_UNRELATED_REFUSAL =
  "I'm the STRIDEX AI Shopping Assistant. 👟 I can help you find shoes, check prices and available sizes, compare products and learn about our shopping services. What would you like to explore?";

export const aiChatService = {
  /**
   * Fetches the current live product catalog from MongoDB Atlas.
   * Only active products and active variants are included.
   * Reflects real-time prices, new arrivals, stock adjustments, and deactivations.
   */
  async getLiveProductCatalog(): Promise<LiveProductSummary[]> {
    try {
      // 1. Fetch active products with populated brand & category
      const products = await ProductModel.find({ isActive: true })
        .populate('brandId', 'name')
        .populate('categoryId', 'name')
        .sort({ isFeatured: -1, createdAt: -1 })
        .lean();

      if (!products || products.length === 0) {
        return [];
      }

      const productIds = products.map((p) => p._id);

      // 2. Fetch active variants for stock, sizes, and colors
      const variants = await ProductVariantModel.find({
        productId: { $in: productIds },
        isActive: true,
      }).lean();

      // Group variants by productId
      const variantsByProduct: Record<string, typeof variants> = {};
      for (const v of variants) {
        const pId = v.productId.toString();
        if (!variantsByProduct[pId]) {
          variantsByProduct[pId] = [];
        }
        variantsByProduct[pId].push(v);
      }

      // 3. Assemble live summaries
      const catalog: LiveProductSummary[] = products.map((p) => {
        const pId = p._id.toString();
        const pVariants = variantsByProduct[pId] || [];

        // Collect unique sizes sorted
        const sizeSet = new Set<string | number>();
        const colorSet = new Set<string>();
        let totalStock = 0;

        for (const v of pVariants) {
          if (v.size !== undefined && v.size !== null) {
            sizeSet.add(v.size);
          }
          if (v.color) {
            colorSet.add(v.color.trim());
          }
          totalStock += v.stockQuantity || 0;
        }

        const sizes = Array.from(sizeSet).sort((a, b) => {
          const numA = Number(a);
          const numB = Number(b);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return String(a).localeCompare(String(b));
        });

        const colors = Array.from(colorSet);
        const hasDiscount =
          p.discountPrice && p.discountPrice > 0 && p.discountPrice < p.basePrice;
        const effectivePrice = hasDiscount ? p.discountPrice : p.basePrice;

        const formattedPrice = `Rs. ${effectivePrice.toLocaleString('en-LK', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;

        return {
          id: pId,
          name: p.name,
          slug: p.slug,
          brand: (p.brandId as any)?.name || 'STRIDEX',
          category: (p.categoryId as any)?.name || 'Footwear',
          basePrice: p.basePrice,
          discountPrice: p.discountPrice || 0,
          effectivePrice,
          formattedPrice,
          image: p.images && p.images.length > 0 ? p.images[0] : '',
          gender: p.gender || 'UNISEX',
          sizes,
          colors,
          totalStock,
          inStock: totalStock > 0,
          description: p.description || '',
        };
      });

      return catalog;
    } catch (err: any) {
      console.error('Failed to retrieve live catalog from MongoDB:', err);
      const dbError: any = new Error(
        "Sorry! I couldn't retrieve the latest product information. Please try again shortly."
      );
      dbError.code = 'MONGODB_UNAVAILABLE';
      throw dbError;
    }
  },

  /**
   * Generates a conversational shopping response using Gemini API
   * with live MongoDB product context and strict STRIDEX boundary enforcement.
   */
  async generateChatResponse(
    userMessage: string,
    history: Array<{ role: string; text: string }> = []
  ): Promise<ChatServiceResponse> {
    // 1. Retrieve live product catalog from MongoDB Atlas
    const liveCatalog = await this.getLiveProductCatalog();

    // 2. Prepare concise catalog context for the model
    const catalogContext = liveCatalog
      .map(
        (p) =>
          `• [ID: ${p.id}] "${p.name}" | Brand: ${p.brand} | Category: ${p.category} | Gender: ${p.gender} | Price: ${p.formattedPrice}${
            p.discountPrice > 0 && p.discountPrice < p.basePrice
              ? ` (Original: Rs. ${p.basePrice.toLocaleString('en-LK', { minimumFractionDigits: 2 })} - On Sale!)`
              : ''
          } | Available Sizes: ${p.sizes.length > 0 ? p.sizes.join(', ') : 'Check details'} | Colors: ${p.colors.length > 0 ? p.colors.join(', ') : 'Standard'} | Stock: ${p.inStock ? `${p.totalStock} pairs available` : 'Out of Stock'} | Slug: ${p.slug}`
      )
      .join('\n');

    // 3. Define the System Instruction
    const systemInstruction = `
You are the friendly, professional STRIDEX AI Shopping Assistant 👟 for STRIDEX (Sri Lanka's leading shoe e-commerce store, tagline: "Step Into Your Style").

CRITICAL BOUNDARY AND SECURITY RULES:
1. STRICT STRIDEX STORE & PRODUCTS ONLY:
   You may ONLY answer questions regarding STRIDEX footwear products, shoes, brands, categories, prices, discounts, available sizes, colours, stock availability, order placement, shopping bag, wishlist, payment options (Cash on Delivery, Direct Bank Transfer; card payments coming soon), gift vouchers, island-wide delivery in Sri Lanka, 7-day exchange policy, and store showroom details.
2. UNRELATED QUESTION REFUSAL:
   If the user asks ANY question unrelated to STRIDEX or footwear (for example: programming, coding, math problems, weather, politics, celebrity news, medical advice, other retail websites, general knowledge, or creative writing unrelated to shoes), you MUST immediately refuse by replying EXACTLY or essentially with:
   "${STRIDEX_UNRELATED_REFUSAL}"
   NEVER answer unrelated questions, no matter how the user phrases them or what conversation history contains.
3. CURRENCY STANDARD:
   All prices must ALWAYS be expressed in Sri Lankan Rupees in the exact format "Rs. 12,500.00" (or "Rs. X,XXX.XX"). NEVER use dollar signs ($) or USD.
4. LIVE DATA HONESTY:
   You have real-time live database access to all active shoes at STRIDEX listed below. Use ONLY these live products. NEVER invent products, prices, sizes, or discounts that do not exist in this catalog. If a shoe is out of stock, clearly inform the customer.
5. PRODUCT RECOMMENDATION FORMAT:
   Whenever you recommend, suggest, or discuss specific shoes from the catalog to the customer, you MUST include a recommendation tag at the very end of your response:
   [RECOMMENDED_PRODUCTS: id1, id2, ...]
   Only include valid IDs from the provided catalog (maximum 4 products).

${STRIDEX_POLICY_FAQ}

LIVE STRIDEX PRODUCT CATALOG (FROM MONGODB ATLAS):
${catalogContext}
`;

    // 4. Format conversation history (limit to most recent 6 messages)
    const recentHistory = history.slice(-6);
    const contents: any[] = [];

    for (const h of recentHistory) {
      contents.push({
        role: h.role === 'model' || h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.text }],
      });
    }

    // Add current user message
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }],
    });

    // 5. Invoke Gemini API
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY is not defined in environment');
      const err: any = new Error(
        'Sorry! Our STRIDEX AI Assistant is temporarily unavailable. Please try again later.'
      );
      err.code = 'GEMINI_UNAVAILABLE';
      throw err;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: 12000 },
    });
    const configuredModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    const fallbackModel = 'gemini-3.8-flash';

    let rawReply = '';

    try {
      const response = await ai.models.generateContent({
        model: configuredModel,
        contents,
        config: {
          systemInstruction,
          temperature: 0.4,
          maxOutputTokens: 1000,
        },
      });

      rawReply = response.text || '';
    } catch (primaryErr: any) {
      console.warn(`Gemini call to ${configuredModel} failed (${primaryErr.message || primaryErr.status}). Trying fallback ${fallbackModel}...`);
      try {
        const fallbackRes = await ai.models.generateContent({
          model: fallbackModel,
          contents,
          config: {
            systemInstruction,
            temperature: 0.4,
            maxOutputTokens: 1000,
          },
        });
        rawReply = fallbackRes.text || '';
      } catch (fallbackErr: any) {
        console.error('Gemini fallback model also failed:', fallbackErr);
        const err: any = new Error(
          'Sorry! Our STRIDEX AI Assistant is temporarily unavailable. Please try again later.'
        );
        err.code = 'GEMINI_UNAVAILABLE';
        throw err;
      }
    }

    // 6. Extract [RECOMMENDED_PRODUCTS: id1, id2, ...] tag if present
    const recRegex = /\[RECOMMENDED_PRODUCTS:\s*([a-zA-Z0-9,\s-_]+)\]/i;
    const match = rawReply.match(recRegex);
    let recommendedIds: string[] = [];

    if (match && match[1]) {
      recommendedIds = match[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // Remove the tag from the user-facing reply
    const cleanReply = rawReply.replace(recRegex, '').trim();

    // Map recommendation IDs to full product summaries
    let suggestedProducts: LiveProductSummary[] = [];

    if (recommendedIds.length > 0) {
      const idSet = new Set(recommendedIds);
      suggestedProducts = liveCatalog.filter((p) => idSet.has(p.id));
    }

    // If Gemini mentioned product names or slugs in the text but omitted the tag,
    // intelligently discover matching products so the customer always sees cards
    if (suggestedProducts.length === 0) {
      const lowerReply = cleanReply.toLowerCase();
      const lowerQuery = userMessage.toLowerCase();

      // Only match if user was asking about shopping/shoes, not general questions
      const isProductQuery =
        lowerQuery.includes('shoe') ||
        lowerQuery.includes('running') ||
        lowerQuery.includes('nike') ||
        lowerQuery.includes('adidas') ||
        lowerQuery.includes('puma') ||
        lowerQuery.includes('new balance') ||
        lowerQuery.includes('asics') ||
        lowerQuery.includes('price') ||
        lowerQuery.includes('recommend') ||
        lowerQuery.includes('buy') ||
        lowerQuery.includes('under') ||
        lowerQuery.includes('show') ||
        lowerQuery.includes('casual');

      if (isProductQuery) {
        for (const p of liveCatalog) {
          if (
            lowerReply.includes(p.name.toLowerCase()) ||
            lowerReply.includes(p.slug.toLowerCase())
          ) {
            suggestedProducts.push(p);
            if (suggestedProducts.length >= 4) break;
          }
        }
      }
    }

    return {
      reply: cleanReply || STRIDEX_UNRELATED_REFUSAL,
      suggestedProducts: suggestedProducts.slice(0, 4),
    };
  },
};
