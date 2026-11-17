import { connectDB } from '../config/db';
import { BrandModel } from '../models/brand.model';
import { slugify } from '../util/slug';

export const ALL_BRANDS_CATALOG = [
  {
    name: 'Nike',
    slug: 'nike',
    description: 'World-renowned athletic footwear, iconic streetwear silhouettes, and cutting-edge performance innovation.',
    logo: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&auto=format&fit=crop&q=80',
  },
  {
    name: 'Adidas',
    slug: 'adidas',
    description: 'Pioneering performance engineering and streetwear culture with Boost foam and timeless 3-stripes heritage.',
    logo: 'https://images.unsplash.com/photo-1518002171953-a080ee817e1f?w=300&auto=format&fit=crop&q=80',
  },
  {
    name: 'Puma',
    slug: 'puma',
    description: 'Fast, bold sports fashion engineered for athletic speed, modern street culture, and lifestyle flair.',
    logo: 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=300&auto=format&fit=crop&q=80',
  },
  {
    name: 'New Balance',
    slug: 'new-balance',
    description: 'Iconic heritage runners, archival silhouettes, and premium American/UK craftsmanship built for creators.',
    logo: 'https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?w=300&auto=format&fit=crop&q=80',
  },
  {
    name: 'DSI Premier',
    slug: 'dsi-premier',
    description: 'Leading Sri Lankan footwear artisan brand offering refined leather craftsmanship and executive comfort.',
    logo: 'https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?w=300&auto=format&fit=crop&q=80',
  },
  {
    name: 'Under Armour',
    slug: 'under-armour',
    description: 'High-performance athletic footwear engineered with responsive UA HOVR cushioning and maximum gym stability.',
    logo: 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=300&auto=format&fit=crop&q=80',
  },
  {
    name: 'Reebok',
    slug: 'reebok',
    description: 'Retro fitness roots and classic court heritage engineered for cross-training, movement, and casual style.',
    logo: 'https://images.unsplash.com/photo-1579338559194-a162d19bf842?w=300&auto=format&fit=crop&q=80',
  },
  {
    name: 'Converse',
    slug: 'converse',
    description: 'Timeless Chuck Taylor canvas classics and authentic court heritage embraced by artists and counterculture.',
    logo: 'https://images.unsplash.com/photo-1607522370275-f14206abe5d3?w=300&auto=format&fit=crop&q=80',
  },
  {
    name: 'Skechers',
    slug: 'skechers',
    description: 'Comfort-first footwear innovations featuring Air-Cooled Memory Foam and lightweight everyday walking support.',
    logo: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=300&auto=format&fit=crop&q=80',
  },
  {
    name: 'Timberland',
    slug: 'timberland',
    description: 'Rugged outdoor waterproof boots and lifestyle leather silhouettes crafted for durability and all-weather protection.',
    logo: 'https://images.unsplash.com/photo-1520639888713-7851133b1ed0?w=300&auto=format&fit=crop&q=80',
  },
  {
    name: 'Columbia',
    slug: 'columbia',
    description: 'All-terrain outdoor adventure and trail hiking shoes engineered with Omni-Grip traction and waterproof barriers.',
    logo: 'https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?w=300&auto=format&fit=crop&q=80',
  },
  {
    name: 'Allbirds',
    slug: 'allbirds',
    description: 'Naturally sustainable lifestyle runners crafted with merino wool, sugarcane SweetFoam, and eucalyptus fibers.',
    logo: 'https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=300&auto=format&fit=crop&q=80',
  },
  {
    name: 'Other',
    slug: 'other',
    description: 'Independent, boutique, and specialty footwear brands curated by STRIDEX.',
    logo: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=300&auto=format&fit=crop&q=80',
  },
];

const syncBrands = async () => {
  try {
    await connectDB();
    console.log('🔄 Connecting to MongoDB to synchronize full brand catalog...');

    let createdCount = 0;
    let existingCount = 0;

    for (const b of ALL_BRANDS_CATALOG) {
      const slug = b.slug || slugify(b.name);
      let brand = await BrandModel.findOne({ slug });

      if (!brand) {
        brand = await BrandModel.create({
          name: b.name,
          slug,
          description: b.description,
          logo: b.logo,
          isActive: true,
        });
        console.log(`+ [CREATED] ${brand.name} (${brand.slug}) - ID: ${brand._id}`);
        createdCount++;
      } else {
        brand.isActive = true;
        if (!brand.description) brand.description = b.description;
        if (!brand.logo) brand.logo = b.logo;
        await brand.save();
        console.log(`= [SYNCED]  ${brand.name} (${brand.slug}) - ID: ${brand._id}`);
        existingCount++;
      }
    }

    console.log(`\n✅ Synchronization complete: ${createdCount} created, ${existingCount} verified/synced.`);
    const totalBrands = await BrandModel.countDocuments();
    console.log(`📊 Total brands in database: ${totalBrands}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to sync brands:', error);
    process.exit(1);
  }
};

syncBrands();
