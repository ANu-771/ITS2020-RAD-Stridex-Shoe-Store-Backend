import path from 'path';
import crypto from 'crypto';
import { supabase, SUPABASE_STORAGE_BUCKET } from '../config/supabase';

export interface SupabaseUploadResult {
  url: string;
  path: string;
  bucket: string;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

/**
 * Upload an image buffer to Supabase Storage bucket
 */
export const uploadImageToSupabase = async (
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string,
  folder: string = 'products'
): Promise<SupabaseUploadResult> => {
  // 1. Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase())) {
    throw new Error(
      `Invalid file type: ${mimeType}. Allowed formats are JPEG, PNG, and WebP.`
    );
  }

  // 2. Validate file size
  if (fileBuffer.length > MAX_FILE_SIZE) {
    throw new Error(
      `File size exceeds 5MB limit (${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB).`
    );
  }

  // 3. Generate unique, clean filename
  const ext = path.extname(originalName).toLowerCase() || (mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.jpg');
  const randomSuffix = crypto.randomBytes(8).toString('hex');
  const uniqueFileName = `stridex_${Date.now()}_${randomSuffix}${ext}`;
  const storagePath = `${folder.replace(/^\/+|\/+$/g, '')}/${uniqueFileName}`;

  // 4. Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error || !data) {
    throw new Error(
      `Supabase storage upload failed: ${error?.message || 'Unknown storage error'}`
    );
  }

  // 5. Retrieve public URL
  const { data: publicUrlData } = supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  return {
    url: publicUrlData.publicUrl,
    path: storagePath,
    bucket: SUPABASE_STORAGE_BUCKET,
  };
};

/**
 * Extract storage relative path from a Supabase public URL
 * Example:
 * https://<project>.supabase.co/storage/v1/object/public/stridex-products/products/image.png
 * returns: products/image.png
 */
export const extractStoragePathFromUrl = (urlOrPath: string): string | null => {
  if (!urlOrPath) return null;

  // Already a relative path
  if (!urlOrPath.startsWith('http://') && !urlOrPath.startsWith('https://')) {
    return urlOrPath;
  }

  // Match /object/public/<bucket>/<path>
  const marker = `/object/public/${SUPABASE_STORAGE_BUCKET}/`;
  const index = urlOrPath.indexOf(marker);
  if (index !== -1) {
    return urlOrPath.substring(index + marker.length);
  }

  // General match for /storage/v1/object/
  const regex = new RegExp(`/storage/v1/object/(?:public|authenticated)/[^/]+/(.+)`);
  const match = urlOrPath.match(regex);
  if (match && match[1]) {
    return match[1];
  }

  return null;
};

/**
 * Delete an image from Supabase Storage
 */
export const deleteImageFromSupabase = async (
  urlOrPath: string
): Promise<boolean> => {
  try {
    const storagePath = extractStoragePathFromUrl(urlOrPath);
    if (!storagePath) {
      console.warn(`[Supabase Storage] Cannot parse path for deletion: ${urlOrPath}`);
      return false;
    }

    const { error } = await supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .remove([storagePath]);

    if (error) {
      console.warn(
        `[Supabase Storage] Failed to delete file '${storagePath}':`,
        error.message
      );
      return false;
    }

    return true;
  } catch (err: any) {
    console.warn(`[Supabase Storage] Deletion error for '${urlOrPath}':`, err.message);
    return false;
  }
};
