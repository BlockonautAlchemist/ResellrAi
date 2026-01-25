import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

// Supabase client for server-side operations (uses service key)
export const supabase: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Storage bucket name for item photos
export const PHOTOS_BUCKET = 'item-photos';

/**
 * Upload a photo to Supabase Storage
 * @param fileBuffer - The image buffer
 * @param fileName - Name for the file (should include extension)
 * @param contentType - MIME type (e.g., 'image/jpeg')
 * @returns The public URL or signed URL for the uploaded file
 */
export async function uploadPhoto(
  fileBuffer: Buffer,
  fileName: string,
  contentType: string
): Promise<{ url: string; path: string }> {
  const filePath = `uploads/${Date.now()}-${fileName}`;
  
  const { data, error } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(filePath, fileBuffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload photo: ${error.message}`);
  }

  // Get a signed URL (valid for 1 hour)
  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrl(filePath, 3600);

  if (signedUrlError) {
    throw new Error(`Failed to create signed URL: ${signedUrlError.message}`);
  }

  return {
    url: signedUrlData.signedUrl,
    path: filePath,
  };
}

/**
 * Delete a photo from Supabase Storage
 * @param filePath - The path of the file to delete
 */
export async function deletePhoto(filePath: string): Promise<void> {
  const { error } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .remove([filePath]);

  if (error) {
    throw new Error(`Failed to delete photo: ${error.message}`);
  }
}

/**
 * Test Supabase connection
 * @returns true if connection is successful
 */
export async function testConnection(): Promise<boolean> {
  try {
    // Try to list buckets to verify connection
    const { data, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.error('Supabase connection test failed:', error.message);
      return false;
    }
    
    console.log('✅ Supabase connection successful');
    console.log(`   Found ${data.length} storage bucket(s)`);
    
    // Check if our bucket exists
    const photosBucket = data.find((b) => b.name === PHOTOS_BUCKET);
    if (photosBucket) {
      console.log(`   ✅ '${PHOTOS_BUCKET}' bucket exists`);
    } else {
      console.log(`   ⚠️  '${PHOTOS_BUCKET}' bucket not found - please create it`);
    }
    
    return true;
  } catch (err) {
    console.error('Supabase connection test error:', err);
    return false;
  }
}
