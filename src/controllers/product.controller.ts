import { Request, Response } from 'express';
import { ProductModel } from '../models/product.model';
import { BrandModel } from '../models/brand.model';
import { CategoryModel } from '../models/category.model';
import { ProductVariantModel } from '../models/productVariant.model';
import { slugify } from '../util/slug';

// GET /api/v1/products
export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 12,
      search,
      brand,
      category,
      gender,
      featured,
      active,
      minPrice,
      maxPrice,
      sort = 'newest',
    } = req.query;

    const queryFilter: Record<string, any> = {};

    // Active status filter
    if (active !== undefined) {
      queryFilter.isActive = active === 'true';
    }

    // Featured status filter
    if (featured !== undefined) {
      queryFilter.isFeatured = featured === 'true';
    }

    // Gender filter
    if (gender) {
      queryFilter.gender = String(gender).toUpperCase();
    }

    // Brand filter (ID or slug)
    if (brand) {
      if (/^[0-9a-fA-F]{24}$/.test(String(brand))) {
        queryFilter.brandId = brand;
      } else {
        const foundBrand = await BrandModel.findOne({ slug: String(brand).toLowerCase() });
        if (foundBrand) queryFilter.brandId = foundBrand._id;
      }
    }

    // Category filter (ID or slug)
    if (category) {
      if (/^[0-9a-fA-F]{24}$/.test(String(category))) {
        queryFilter.categoryId = category;
      } else {
        const foundCat = await CategoryModel.findOne({ slug: String(category).toLowerCase() });
        if (foundCat) queryFilter.categoryId = foundCat._id;
      }
    }

    // Price range filters in Sri Lankan Rupees (LKR numeric)
    if (minPrice !== undefined || maxPrice !== undefined) {
      queryFilter.basePrice = {};
      if (minPrice !== undefined) queryFilter.basePrice.$gte = Number(minPrice);
      if (maxPrice !== undefined) queryFilter.basePrice.$lte = Number(maxPrice);
    }

    // Text search filter
    if (search) {
      const regex = new RegExp(String(search), 'i');
      queryFilter.$or = [{ name: regex }, { description: regex }, { material: regex }];
    }

    // Sort mappings
    let sortOptions: Record<string, 1 | -1> = { createdAt: -1 };
    if (sort === 'price_asc') sortOptions = { basePrice: 1 };
    else if (sort === 'price_desc') sortOptions = { basePrice: -1 };
    else if (sort === 'name_asc') sortOptions = { name: 1 };
    else if (sort === 'oldest') sortOptions = { createdAt: 1 };

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Math.min(100, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [products, totalCount] = await Promise.all([
      ProductModel.find(queryFilter)
        .populate('brandId', 'name slug logo')
        .populate('categoryId', 'name slug image')
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum),
      ProductModel.countDocuments(queryFilter),
    ]);

    // Attach variant statistics (total stock and variant count) to each product
    const productsWithVariants = await Promise.all(
      products.map(async (prod) => {
        const variants = await ProductVariantModel.find({ productId: prod._id, isActive: true });
        const totalStock = variants.reduce((sum, v) => sum + v.stockQuantity, 0);
        const sizes = Array.from(new Set(variants.map((v) => v.size)));
        const colors = Array.from(new Set(variants.map((v) => v.color)));

        return {
          ...prod.toJSON(),
          totalStock,
          variantCount: variants.length,
          availableSizes: sizes,
          availableColors: colors,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: productsWithVariants,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        hasNextPage: pageNum * limitNum < totalCount,
        hasPrevPage: pageNum > 1,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message,
    });
  }
};

// GET /api/v1/products/:id
export const getProductById = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);

    const product = isObjectId
      ? await ProductModel.findById(id)
          .populate('brandId', 'name slug logo description')
          .populate('categoryId', 'name slug image description')
      : await ProductModel.findOne({ slug: id })
          .populate('brandId', 'name slug logo description')
          .populate('categoryId', 'name slug image description');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Fetch all variants associated with this product
    const variants = await ProductVariantModel.find({ productId: product._id }).sort({
      size: 1,
      color: 1,
    });
    const totalStock = variants.reduce((acc, curr) => acc + (curr.isActive ? curr.stockQuantity : 0), 0);

    res.status(200).json({
      success: true,
      data: {
        ...product.toJSON(),
        variants: variants.map((v) => v.toJSON()),
        totalStock,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product details',
      error: error.message,
    });
  }
};

// POST /api/v1/products
export const createProduct = async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      brandId,
      categoryId,
      basePrice,
      discountPrice,
      images,
      gender,
      material,
      isFeatured,
      isActive,
      variants, // optional initial variants array
    } = req.body;

    // Validate brand exists
    const brand = await BrandModel.findById(brandId);
    if (!brand) {
      return res.status(400).json({
        success: false,
        message: 'Specified Brand ID does not exist',
      });
    }

    // Validate category exists
    const category = await CategoryModel.findById(categoryId);
    if (!category) {
      return res.status(400).json({
        success: false,
        message: 'Specified Category ID does not exist',
      });
    }

    // Generate unique slug
    let slug = slugify(name);
    let counter = 1;
    while (await ProductModel.findOne({ slug })) {
      slug = `${slugify(name)}-${counter++}`;
    }

    // Numeric monetary validation in LKR
    const numericBasePrice = Number(basePrice);
    const numericDiscountPrice = discountPrice !== undefined ? Number(discountPrice) : 0;

    if (numericDiscountPrice > 0 && numericDiscountPrice > numericBasePrice) {
      return res.status(400).json({
        success: false,
        message: 'Discount price in LKR cannot exceed base price',
      });
    }

    const product = new ProductModel({
      name,
      slug,
      description,
      brandId,
      categoryId,
      basePrice: numericBasePrice,
      discountPrice: numericDiscountPrice,
      images: Array.isArray(images) ? images : [],
      gender: gender || 'UNISEX',
      material: material || '',
      isFeatured: Boolean(isFeatured),
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    await product.save();

    // If variants were provided in creation payload, persist them
    let createdVariants: any[] = [];
    if (Array.isArray(variants) && variants.length > 0) {
      createdVariants = await Promise.all(
        variants.map(async (v: any) => {
          const sku = v.SKU || `${slug.toUpperCase()}-${v.size}-${v.color}`.replace(/\s+/g, '');
          const variantDoc = new ProductVariantModel({
            productId: product._id,
            SKU: sku,
            size: v.size,
            color: v.color,
            stockQuantity: Number(v.stockQuantity) || 0,
            reservedQuantity: Number(v.reservedQuantity) || 0,
            isActive: v.isActive !== undefined ? v.isActive : true,
          });
          return await variantDoc.save();
        })
      );
    }

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: {
        ...product.toJSON(),
        variants: createdVariants.map((v) => v.toJSON()),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: error.message,
    });
  }
};

// PUT /api/v1/products/:id
export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const product = await ProductModel.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    const {
      name,
      description,
      brandId,
      categoryId,
      basePrice,
      discountPrice,
      images,
      gender,
      material,
      isFeatured,
      isActive,
    } = req.body;

    // Validate brand if changed
    if (brandId && brandId !== product.brandId.toString()) {
      const brand = await BrandModel.findById(brandId);
      if (!brand) return res.status(400).json({ success: false, message: 'Invalid Brand ID' });
      product.brandId = brandId;
    }

    // Validate category if changed
    if (categoryId && categoryId !== product.categoryId.toString()) {
      const category = await CategoryModel.findById(categoryId);
      if (!category) return res.status(400).json({ success: false, message: 'Invalid Category ID' });
      product.categoryId = categoryId;
    }

    // Update slug if name changed
    if (name && name !== product.name) {
      let newSlug = slugify(name);
      let counter = 1;
      while (await ProductModel.findOne({ slug: newSlug, _id: { $ne: id } })) {
        newSlug = `${slugify(name)}-${counter++}`;
      }
      product.name = name;
      product.slug = newSlug;
    }

    if (description !== undefined) product.description = description;

    // Validate prices
    const nextBase = basePrice !== undefined ? Number(basePrice) : product.basePrice;
    const nextDiscount = discountPrice !== undefined ? Number(discountPrice) : product.discountPrice;

    if (nextDiscount > 0 && nextDiscount > nextBase) {
      return res.status(400).json({
        success: false,
        message: 'Discount price in LKR cannot exceed base price',
      });
    }

    if (basePrice !== undefined) product.basePrice = nextBase;
    if (discountPrice !== undefined) product.discountPrice = nextDiscount;
    if (images !== undefined && Array.isArray(images)) product.images = images;
    if (gender !== undefined) product.gender = gender;
    if (material !== undefined) product.material = material;
    if (isFeatured !== undefined) product.isFeatured = isFeatured;
    if (isActive !== undefined) product.isActive = isActive;

    await product.save();

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: product.toJSON(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to update product',
      error: error.message,
    });
  }
};

// DELETE /api/v1/products/:id
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const product = await ProductModel.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Cascade delete associated variants
    const deletedVariants = await ProductVariantModel.deleteMany({ productId: id });
    await ProductModel.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Product and associated variants deleted successfully',
      data: {
        id,
        deletedVariantsCount: deletedVariants.deletedCount,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete product',
      error: error.message,
    });
  }
};
