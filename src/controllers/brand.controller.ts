import { Request, Response } from 'express';
import { BrandModel } from '../models/brand.model';
import { ProductModel } from '../models/product.model';
import { slugify } from '../util/slug';

// GET /api/v1/brands
export const getAllBrands = async (req: Request, res: Response) => {
  try {
    const { active, search } = req.query;
    const filter: Record<string, any> = {};

    if (active !== undefined) {
      filter.isActive = active === 'true';
    }

    if (search) {
      filter.name = { $regex: String(search), $options: 'i' };
    }

    const brands = await BrandModel.find(filter).sort({ createdAt: -1 });

    const brandsWithCount = await Promise.all(
      brands.map(async (brand) => {
        const productCount = await ProductModel.countDocuments({ brandId: brand._id });
        const json = brand.toJSON();
        return { ...json, productCount };
      })
    );

    res.status(200).json({
      success: true,
      data: brandsWithCount,
      total: brands.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch brands',
      error: error.message,
    });
  }
};

// GET /api/v1/brands/:id
export const getBrandById = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);

    const brand = isObjectId
      ? await BrandModel.findById(id)
      : await BrandModel.findOne({ slug: id });

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found',
      });
    }

    const productCount = await ProductModel.countDocuments({ brandId: brand._id });

    res.status(200).json({
      success: true,
      data: {
        ...brand.toJSON(),
        productCount,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch brand',
      error: error.message,
    });
  }
};

// POST /api/v1/brands
export const createBrand = async (req: Request, res: Response) => {
  try {
    const { name, description, logo, isActive } = req.body;
    const slug = slugify(name);

    const existing = await BrandModel.findOne({
      $or: [{ name: { $regex: new RegExp(`^${name}$`, 'i') } }, { slug }],
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Brand with name '${name}' or slug '${slug}' already exists`,
      });
    }

    const brand = new BrandModel({
      name,
      slug,
      description: description || '',
      logo: logo || '',
      isActive: isActive !== undefined ? isActive : true,
    });

    await brand.save();

    res.status(201).json({
      success: true,
      message: 'Brand created successfully',
      data: brand.toJSON(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to create brand',
      error: error.message,
    });
  }
};

// PUT /api/v1/brands/:id
export const updateBrand = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, logo, isActive } = req.body;

    const brand = await BrandModel.findById(id);
    if (!brand) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found',
      });
    }

    if (name && name !== brand.name) {
      const newSlug = slugify(name);
      const duplicate = await BrandModel.findOne({
        _id: { $ne: id },
        $or: [{ name: { $regex: new RegExp(`^${name}$`, 'i') } }, { slug: newSlug }],
      });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: 'Another brand with this name or slug already exists',
        });
      }

      brand.name = name;
      brand.slug = newSlug;
    }

    if (description !== undefined) brand.description = description;
    if (logo !== undefined) brand.logo = logo;
    if (isActive !== undefined) brand.isActive = isActive;

    await brand.save();

    res.status(200).json({
      success: true,
      message: 'Brand updated successfully',
      data: brand.toJSON(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to update brand',
      error: error.message,
    });
  }
};

// DELETE /api/v1/brands/:id
export const deleteBrand = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const brand = await BrandModel.findById(id);

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found',
      });
    }

    const associatedProducts = await ProductModel.countDocuments({ brandId: id });
    if (associatedProducts > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete brand: ${associatedProducts} product(s) are assigned to it. Reassign or delete those products first.`,
      });
    }

    await BrandModel.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Brand deleted successfully',
      data: { id },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete brand',
      error: error.message,
    });
  }
};
