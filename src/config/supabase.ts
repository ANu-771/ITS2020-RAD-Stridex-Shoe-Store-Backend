import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  '';

export const SUPABASE_STORAGE_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET || 'stridex-products';

/**
 * Validate Supabase environment configuration on startup
 */
export const validateSupabaseConfig = (): boolean => {
  if (!SUPABASE_URL) {
    console.warn(
      '⚠️  [Supabase] SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is not defined in environment.'
    );
    return false;
  }
  if (!SUPABASE_KEY) {
    console.warn(
      '⚠️  [Supabase] SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) is not defined in environment.'
    );
    return false;
  }

  if (SUPABASE_KEY.startsWith('sb_publishable_')) {
    console.warn(
      '⚠️  [Supabase Warning] You are using a publishable (anon) key. Supabase Storage requires Row-Level Security (RLS) policies for publishable keys. For backend servers, the secret key (SUPABASE_SERVICE_ROLE_KEY) is strongly recommended.'
    );
  }

  return true;
};

/**
 * Reusable Supabase client instance configured for server-side operations
 */
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_KEY || 'placeholder-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        'User-Agent': 'STRIDEX-Backend/1.0.0 (Node.js)',
      },
    },
  }
);

/**
 * Ensure the designated storage bucket exists and is set to public.
 * If it doesn't exist, it automatically creates it with 5MB max size and image MIME filters.
 */
export const ensureStorageBucketExists = async (): Promise<void> => {
  if (!validateSupabaseConfig()) return;

  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      console.warn('⚠️  [Supabase Storage] Could not query buckets:', listError.message);
      return;
    }

    const bucketFound = buckets?.some((b) => b.name === SUPABASE_STORAGE_BUCKET);
    if (!bucketFound) {
      const { error: createError } = await supabase.storage.createBucket(
        SUPABASE_STORAGE_BUCKET,
        {
          public: true,
          fileSizeLimit: 50 * 1024 * 1024, // 50MB limit
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
        }
      );
      if (createError) {
        console.warn('⚠️  [Supabase Storage] Failed to auto-create bucket:', createError.message);
      } else {
        console.log(`✅ [Supabase Storage] Initialized public bucket: '${SUPABASE_STORAGE_BUCKET}'`);
      }
    } else {
      console.log(`✅ [Supabase Storage] Ready. Using bucket: '${SUPABASE_STORAGE_BUCKET}'`);
    }
  } catch (err: any) {
    console.warn('⚠️  [Supabase Storage] Error verifying storage bucket:', err.message);
  }
};
