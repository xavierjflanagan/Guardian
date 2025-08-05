import { createClient } from "@/lib/supabaseClientSSR";

/**
 * Uploads a file to the 'medical-docs' bucket in Supabase Storage under the user's folder.
 * Also creates a document record in the database.
 * Updated for Guardian v7 canonical schema.
 * 
 * @param file The file to upload
 * @param patientId The patient's unique ID (references auth.users)
 * @returns The file path in storage if successful
 * @throws Error if upload fails
 */
export async function uploadFile(file: File, patientId: string): Promise<string> {
  const supabase = createClient();
  const filePath = `${patientId}/${Date.now()}_${file.name}`;
  
  // 1. Upload file to storage
  const { error: uploadError } = await supabase.storage
    .from("medical-docs")
    .upload(filePath, file, { contentType: file.type });
  
  if (uploadError) throw uploadError;
  
  // 2. Create document record in database (using canonical schema fields + future-proofing)
  const { error: dbError } = await supabase
    .from("documents")
    .insert({
      patient_id: patientId,
      filename: `${Date.now()}_${file.name}`,
      original_filename: file.name,
      file_size_bytes: file.size,
      mime_type: file.type,
      storage_path: filePath,
      status: 'uploaded',
      source_system: 'guardian_native',
      raw_source: {}
    });
  
  if (dbError) {
    // If database insert fails, try to clean up the uploaded file
    await supabase.storage.from("medical-docs").remove([filePath]);
    throw dbError;
  }
  
  return filePath;
} 