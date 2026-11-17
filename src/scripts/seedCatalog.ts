import { connectDB } from '../config/db';
import { CategoryModel } from '../models/category.model';
import { BrandModel } from '../models/brand.model';
import { ProductModel } from '../models/product.model';
import { ProductVariantModel } from '../models/productVariant.model';
import { slugify } from '../util/slug';

const seedCatalog = async () => {
  try {
    await connectDB();
    console.log('Seeding STRIDEX Phase 3 Shoe Catalog (LKR Currency)...');

    // 1. Seed Brands (All 12 Banner Brands + 'Other' Generic Option)
    const brandData = [
      {
        name: 'Nike',
        description: 'World-renowned athletic footwear, iconic streetwear silhouettes, and cutting-edge performance innovation.',
        logo: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&auto=format&fit=crop&q=80',
      },
      {
        name: 'Adidas',
        description: 'Pioneering performance engineering and streetwear culture with Boost foam and timeless 3-stripes heritage.',
        logo: 'https://images.unsplash.com/photo-1518002171953-a080ee817e1f?w=300&auto=format&fit=crop&q=80',
      },
      {
        name: 'Puma',
        description: 'Fast, bold sports fashion engineered for athletic speed, modern street culture, and lifestyle flair.',
        logo: 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=300&auto=format&fit=crop&q=80',
      },
      {
        name: 'New Balance',
        description: 'Iconic heritage runners, archival silhouettes, and premium American/UK craftsmanship built for creators.',
        logo: 'https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?w=300&auto=format&fit=crop&q=80',
      },
      {
        name: 'DSI Premier',
        description: 'Leading Sri Lankan footwear artisan brand offering refined leather craftsmanship and executive comfort.',
        logo: 'https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?w=300&auto=format&fit=crop&q=80',
      },
      {
        name: 'Under Armour',
        description: 'High-performance athletic footwear engineered with responsive UA HOVR cushioning and maximum gym stability.',
        logo: 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=300&auto=format&fit=crop&q=80',
      },
      {
        name: 'Reebok',
        description: 'Retro fitness roots and classic court heritage engineered for cross-training, movement, and casual style.',
        logo: 'https://images.unsplash.com/photo-1579338559194-a162d19bf842?w=300&auto=format&fit=crop&q=80',
      },
      {
        name: 'Converse',
        description: 'Timeless Chuck Taylor canvas classics and authentic court heritage embraced by artists and counterculture.',
        logo: 'https://images.unsplash.com/photo-1607522370275-f14206abe5d3?w=300&auto=format&fit=crop&q=80',
      },
      {
        name: 'Skechers',
        description: 'Comfort-first footwear innovations featuring Air-Cooled Memory Foam and lightweight everyday walking support.',
        logo: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=300&auto=format&fit=crop&q=80',
      },
      {
        name: 'Timberland',
        description: 'Rugged outdoor waterproof boots and lifestyle leather silhouettes crafted for durability and all-weather protection.',
        logo: 'https://images.unsplash.com/photo-1520639888713-7851133b1ed0?w=300&auto=format&fit=crop&q=80',
      },
      {
        name: 'Columbia',
        description: 'All-terrain outdoor adventure and trail hiking shoes engineered with Omni-Grip traction and waterproof barriers.',
        logo: 'https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?w=300&auto=format&fit=crop&q=80',
      },
      {
        name: 'Allbirds',
        description: 'Naturally sustainable lifestyle runners crafted with merino wool, sugarcane SweetFoam, and eucalyptus fibers.',
        logo: 'https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=300&auto=format&fit=crop&q=80',
      },
      {
        name: 'Other',
        description: 'Independent, boutique, and specialty footwear brands curated by STRIDEX.',
        logo: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=300&auto=format&fit=crop&q=80',
      },
    ];

    const seededBrands: Record<string, any> = {};
    for (const b of brandData) {
      const slug = slugify(b.name);
      let brand = await BrandModel.findOne({ slug });
      if (!brand) {
        brand = await BrandModel.create({
          name: b.name,
          slug,
          description: b.description,
          logo: b.logo,
          isActive: true,
        });
        console.log(`+ Brand created: ${brand.name}`);
      }
      seededBrands[b.name] = brand;
    }

    // 2. Seed Categories
    const categoryData = [
      {
        name: 'Performance Running',
        description: 'Engineered for speed, built for distance with responsive energy return.',
        image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=700&q=80',
        badge: 'Popular',
        isFeatured: true,
      },
      {
        name: 'Street & Casual Sneakers',
        description: 'Iconic silhouettes crafted for all-day comfort and trendsetting aesthetics.',
        image: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=700&q=80',
        badge: 'Trending',
        isFeatured: true,
      },
      {
        name: 'Executive & Formal',
        description: 'Refined leather classics meticulously crafted for timeless sophistication.',
        image: 'https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?auto=format&fit=crop&w=700&q=80',
        badge: 'Premium',
        isFeatured: true,
      },
      {
        name: 'Limited Release Drops',
        description: 'Rare collector sneakers and exclusive designer athletic collaborations.',
        image: 'https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&w=700&q=80',
        badge: 'Exclusive',
        isFeatured: true,
      },
      {
        name: 'Training & Gym',
        description: 'High-stability trainers providing lockdown support for cross-training and weightlifting.',
        image: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?auto=format&fit=crop&w=700&q=80',
        badge: 'Athletic',
        isFeatured: true,
      },
    ];

    const seededCategories: Record<string, any> = {};
    for (const c of categoryData) {
      const slug = slugify(c.name);
      let cat = await CategoryModel.findOne({ slug });
      if (!cat) {
        cat = await CategoryModel.create({
          name: c.name,
          slug,
          description: c.description,
          image: c.image,
          badge: c.badge,
          isFeatured: c.isFeatured,
          isActive: true,
        });
        console.log(`+ Category created: ${cat.name}`);
      } else {
        cat.badge = c.badge;
        cat.isFeatured = c.isFeatured;
        if (c.description) cat.description = c.description;
        if (c.image) cat.image = c.image;
        await cat.save();
        console.log(`~ Category synced: ${cat.name}`);
      }
      seededCategories[c.name] = cat;
    }

    // 3. Seed Products with numeric LKR prices
    const productData = [
      {
        name: 'Nike Air Max 270 React',
        brandName: 'Nike',
        categoryName: 'Street & Casual Sneakers',
        basePrice: 28500, // Rs. 28,500.00
        discountPrice: 24990, // Rs. 24,990.00
        description: 'Lightweight, layered materials meet modern art aesthetics in the Nike Air Max 270 React. Delivers unmatched all-day comfort with responsive Max Air 270 cushioning.',
        gender: 'UNISEX' as const,
        material: 'Breathable Mesh & Synthetics',
        isFeatured: true,
        images: [
          'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1608231387042-66d1773070a5?auto=format&fit=crop&w=800&q=80',
        ],
        variants: [
          { size: 40, color: 'Core Black', stockQuantity: 12 },
          { size: 41, color: 'Core Black', stockQuantity: 18 },
          { size: 42, color: 'Core Black', stockQuantity: 15 },
          { size: 41, color: 'Fresh Mint', stockQuantity: 10 },
          { size: 42, color: 'Fresh Mint', stockQuantity: 14 },
          { size: 43, color: 'Fresh Mint', stockQuantity: 8 },
        ],
      },
      {
        name: 'Adidas Adizero Aruku Speed',
        brandName: 'Adidas',
        categoryName: 'Performance Running',
        basePrice: 34500, // Rs. 34,500.00
        discountPrice: 29900, // Rs. 29,900.00
        description: 'Inspired by Tokyo street runners, the Adizero Aruku combines race-day propulsion with everyday rocker comfort. Engineered with Lightstrike Pro foam for smooth transitions.',
        gender: 'UNISEX' as const,
        material: 'Engineered Monomesh',
        isFeatured: true,
        images: [
          'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=800&q=80',
        ],
        variants: [
          { size: 40, color: 'Cloud White', stockQuantity: 8 },
          { size: 41, color: 'Cloud White', stockQuantity: 15 },
          { size: 42, color: 'Cloud White', stockQuantity: 20 },
          { size: 43, color: 'Cloud White', stockQuantity: 12 },
          { size: 41, color: 'Signal Green', stockQuantity: 9 },
          { size: 42, color: 'Signal Green', stockQuantity: 11 },
        ],
      },
      {
        name: 'Puma Velocity Nitro 3',
        brandName: 'Puma',
        categoryName: 'Performance Running',
        basePrice: 22500, // Rs. 22,500.00
        discountPrice: 0, // No discount
        description: 'An industry favorite neutral daily trainer featuring cutting-edge NITRO foam technology for superior responsiveness and lightweight propulsion across any distance.',
        gender: 'MEN' as const,
        material: 'Engineered Jacquard Knit',
        isFeatured: false,
        images: [
          'https://images.unsplash.com/photo-1608231387042-66d1773070a5?auto=format&fit=crop&w=800&q=80',
        ],
        variants: [
          { size: 41, color: 'Fire Lime', stockQuantity: 14 },
          { size: 42, color: 'Fire Lime', stockQuantity: 16 },
          { size: 43, color: 'Fire Lime', stockQuantity: 10 },
          { size: 42, color: 'Puma Black', stockQuantity: 22 },
        ],
      },
      {
        name: 'New Balance 574 Heritage Classic',
        brandName: 'New Balance',
        categoryName: 'Street & Casual Sneakers',
        basePrice: 19500, // Rs. 19,500.00
        discountPrice: 17200, // Rs. 17,200.00
        description: 'The most New Balance shoe ever. Reliable comfort, uncomplicated design, and ENCAP midsole cushioning make the 574 a timeless wardrobe staple around the world.',
        gender: 'UNISEX' as const,
        material: 'Premium Suede & Breathable Mesh',
        isFeatured: true,
        images: [
          'https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?auto=format&fit=crop&w=800&q=80',
        ],
        variants: [
          { size: 39, color: 'Vintage Grey', stockQuantity: 7 },
          { size: 40, color: 'Vintage Grey', stockQuantity: 14 },
          { size: 41, color: 'Vintage Grey', stockQuantity: 19 },
          { size: 42, color: 'Vintage Grey', stockQuantity: 15 },
          { size: 41, color: 'Forest Green', stockQuantity: 10 },
          { size: 42, color: 'Forest Green', stockQuantity: 12 },
        ],
      },
      {
        name: 'DSI Premier Regent Brogue Oxford',
        brandName: 'DSI Premier',
        categoryName: 'Executive & Formal',
        basePrice: 14500, // Rs. 14,500.00
        discountPrice: 12500, // Rs. 12,500.00
        description: 'Handcrafted in Sri Lanka using top-grain bovine leather, wingtip perforations, and a cushioned orthopedic insole for all-day boardroom comfort and enduring elegance.',
        gender: 'MEN' as const,
        material: 'Full Grain Leather',
        isFeatured: true,
        images: [
          'https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?auto=format&fit=crop&w=800&q=80',
        ],
        variants: [
          { size: 40, color: 'Chestnut Brown', stockQuantity: 8 },
          { size: 41, color: 'Chestnut Brown', stockQuantity: 12 },
          { size: 42, color: 'Chestnut Brown', stockQuantity: 14 },
          { size: 41, color: 'Gloss Black', stockQuantity: 15 },
          { size: 42, color: 'Gloss Black', stockQuantity: 18 },
        ],
      },
    ];

    for (const p of productData) {
      const slug = slugify(p.name);
      const brand = seededBrands[p.brandName];
      const category = seededCategories[p.categoryName];

      if (!brand || !category) continue;

      let product = await ProductModel.findOne({ slug });
      if (!product) {
        product = await ProductModel.create({
          name: p.name,
          slug,
          description: p.description,
          brandId: brand._id,
          categoryId: category._id,
          basePrice: p.basePrice,
          discountPrice: p.discountPrice,
          images: p.images,
          gender: p.gender,
          material: p.material,
          isFeatured: p.isFeatured,
          isActive: true,
        });
        console.log(`+ Product created: ${product.name} (Rs. ${product.basePrice.toLocaleString('en-LK')})`);

        // Seed variants
        for (const v of p.variants) {
          const sku = `${slug.toUpperCase().substring(0, 10)}-${v.size}-${v.color.replace(/\s+/g, '').toUpperCase()}`;
          const existingVariant = await ProductVariantModel.findOne({ SKU: sku });
          if (!existingVariant) {
            await ProductVariantModel.create({
              productId: product._id,
              SKU: sku,
              size: v.size,
              color: v.color,
              stockQuantity: v.stockQuantity,
              reservedQuantity: 0,
              isActive: true,
            });
            console.log(`  + Variant: SKU=${sku}, Size=${v.size}, Color=${v.color}, Stock=${v.stockQuantity}`);
          }
        }
      }
    }

    console.log('✅ STRIDEX Phase 3 Catalog Seeding Complete!');
    process.exit(0);
  } catch (error) {
    console.error('Failed to seed catalog:', error);
    process.exit(1);
  }
};

seedCatalog();
