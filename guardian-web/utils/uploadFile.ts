import { supabase } from "@/lib/supabaseClient";

/**
 * Uploads a file to the 'medical-docs' bucket in Supabase Storage under the user's folder.
 * @param file The file to upload
 * @param userId The user's unique ID (used as folder prefix)
 * @returns The file path in storage if successful
 * @throws Error if upload fails
 */
export async function uploadFile(file: File, userId: string): Promise<string> {
  const filePath = `${userId}/${Date.now()}_${file.name}`;
  const { error } = await supabase.storage
    .from("medical-docs")
    .upload(filePath, file, { contentType: file.type });
  if (error) throw error;
  return filePath;
} 