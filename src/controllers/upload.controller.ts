import { Request, Response } from 'express';
import {
  uploadImageToSupabase,
  deleteImageFromSupabase,
} from '../service/supabase.service';

export const handleSingleUpload = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded',
      });
    }

    const folder = (req.body.folder as string) || 'products';

    const result = await uploadImageToSupabase(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      folder
    );

    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully to Supabase Storage',
      data: {
        url: result.url,
        path: result.path,
        bucket: result.bucket,
      },
    });
  } catch (error: any) {
    const isClientError =
      error.message?.includes('Invalid file type') ||
      error.message?.includes('exceeds 5MB');

    res.status(isClientError ? 400 : 500).json({
      success: false,
      message: error.message || 'Image upload to Supabase Storage failed',
    });
  }
};

export const handleMultipleUpload = async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No image files uploaded',
      });
    }

    const folder = (req.body.folder as string) || 'products';

    const uploadPromises = files.map((file) =>
      uploadImageToSupabase(file.buffer, file.originalname, file.mimetype, folder)
    );
    const results = await Promise.all(uploadPromises);

    res.status(200).json({
      success: true,
      message: `${results.length} images uploaded successfully to Supabase Storage`,
      data: {
        urls: results.map((r) => r.url),
        results,
      },
    });
  } catch (error: any) {
    const isClientError =
      error.message?.includes('Invalid file type') ||
      error.message?.includes('exceeds 5MB');

    res.status(isClientError ? 400 : 500).json({
      success: false,
      message: error.message || 'Multiple images upload failed',
    });
  }
};

export const handleDeleteUpload = async (req: Request, res: Response) => {
  try {
    const { url, path: filePath } = req.body;
    const target = url || filePath;

    if (!target) {
      return res.status(400).json({
        success: false,
        message: 'Image url or path is required for deletion',
      });
    }

    const deleted = await deleteImageFromSupabase(target);

    res.status(200).json({
      success: true,
      message: deleted
        ? 'Image deleted successfully from Supabase Storage'
        : 'Image file was not found or could not be removed',
      deleted,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete image from Supabase Storage',
      error: error.message,
    });
  }
};
