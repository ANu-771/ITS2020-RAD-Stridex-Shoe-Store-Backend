import { Request, Response } from 'express';
import { uploadImageToCloud } from '../service/cloudinary.service';

export const handleSingleUpload = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded',
      });
    }

    const result = await uploadImageToCloud(req.file.buffer, 'stridex/products');

    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully',
      data: {
        url: result.url,
        publicId: result.publicId,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Image upload failed',
      error: error.message,
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

    const uploadPromises = files.map((file) =>
      uploadImageToCloud(file.buffer, 'stridex/products')
    );
    const results = await Promise.all(uploadPromises);

    res.status(200).json({
      success: true,
      message: `${results.length} images uploaded successfully`,
      data: {
        urls: results.map((r) => r.url),
        results,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Multiple images upload failed',
      error: error.message,
    });
  }
};
