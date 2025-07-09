import { createClient } from "@/lib/supabaseClientSSR";

/**
 * Uploads a file to the 'medical-docs' bucket in Supabase Storage under the user's folder.
 * Also creates a document record in the database.
 * @param file The file to upload
 * @param userId The user's unique ID (used as folder prefix)
 * @returns The file path in storage if successful
 * @throws Error if upload fails
 */
export async function uploadFile(file: File, userId: string): Promise<string> {
  const supabase = createClient();
  const filePath = `${userId}/${Date.now()}_${file.name}`;
  
  // 1. Upload file to storage
  const { error: uploadError } = await supabase.storage
    .from("medical-docs")
    .upload(filePath, file, { contentType: file.type });
  
  if (uploadError) throw uploadError;
  
  // 2. Create document record in database
  const { error: dbError } = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      original_name: file.name,
      s3_key: filePath,
      mime_type: file.type,
      status: 'uploaded'
    });
  
  if (dbError) {
    // If database insert fails, try to clean up the uploaded file
    await supabase.storage.from("medical-docs").remove([filePath]);
    throw dbError;
  }
  
  return filePath;
} 