import { Request, Response } from 'express';
import { CategoryModel } from '../models/category.model';
import { ProductModel } from '../models/product.model';
import { slugify } from '../util/slug';

// GET /api/v1/categories
export const getAllCategories = async (req: Request, res: Response) => {
  try {
    const { active, search, featured } = req.query;
    const filter: Record<string, any> = {};

    if (active !== undefined) {
      filter.isActive = active === 'true';
    }

    if (featured !== undefined) {
      filter.isFeatured = featured === 'true';
    }

    if (search) {
      filter.name = { $regex: String(search), $options: 'i' };
    }

    const categories = await CategoryModel.find(filter).sort({ isFeatured: -1, createdAt: 1 });

    // Count products per category
    const categoriesWithCount = await Promise.all(
      categories.map(async (cat) => {
        const productCount = await ProductModel.countDocuments({ categoryId: cat._id });
        const json = cat.toJSON();
        return { ...json, productCount };
      })
    );

    res.status(200).json({
      success: true,
      data: categoriesWithCount,
      total: categories.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message,
    });
  }
};

// GET /api/v1/categories/:id
export const getCategoryById = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);

    const category = isObjectId
      ? await CategoryModel.findById(id)
      : await CategoryModel.findOne({ slug: id });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    const productCount = await ProductModel.countDocuments({ categoryId: category._id });

    res.status(200).json({
      success: true,
      data: {
        ...category.toJSON(),
        productCount,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category',
      error: error.message,
    });
  }
};

// POST /api/v1/categories
export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, description, image, isActive, badge, isFeatured } = req.body;
    const slug = slugify(name);

    const existing = await CategoryModel.findOne({
      $or: [{ name: { $regex: new RegExp(`^${name}$`, 'i') } }, { slug }],
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Category with name '${name}' or slug '${slug}' already exists`,
      });
    }

    const category = new CategoryModel({
      name,
      slug,
      description: description || '',
      image: image || '',
      badge: badge || '',
      isFeatured: isFeatured !== undefined ? isFeatured : false,
      isActive: isActive !== undefined ? isActive : true,
    });

    await category.save();

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: category.toJSON(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to create category',
      error: error.message,
    });
  }
};

// PUT /api/v1/categories/:id
export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, image, isActive, badge, isFeatured } = req.body;

    const category = await CategoryModel.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    if (name && name !== category.name) {
      const newSlug = slugify(name);
      const duplicate = await CategoryModel.findOne({
        _id: { $ne: id },
        $or: [{ name: { $regex: new RegExp(`^${name}$`, 'i') } }, { slug: newSlug }],
      });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: 'Another category with this name or slug already exists',
        });
      }

      category.name = name;
      category.slug = newSlug;
    }

    if (description !== undefined) category.description = description;
    if (image !== undefined) category.image = image;
    if (badge !== undefined) category.badge = badge;
    if (isFeatured !== undefined) category.isFeatured = isFeatured;
    if (isActive !== undefined) category.isActive = isActive;

    await category.save();

    res.status(200).json({
      success: true,
      message: 'Category updated successfully',
      data: category.toJSON(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to update category',
      error: error.message,
    });
  }
};

// DELETE /api/v1/categories/:id
export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const category = await CategoryModel.findById(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    // Check if products reference this category
    const associatedProducts = await ProductModel.countDocuments({ categoryId: id });
    if (associatedProducts > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category: ${associatedProducts} product(s) are assigned to it. Reassign or delete those products first.`,
      });
    }

    await CategoryModel.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Category deleted successfully',
      data: { id },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete category',
      error: error.message,
    });
  }
};
