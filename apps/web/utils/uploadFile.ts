import { createClient } from "@/lib/supabaseClientSSR";

/**
 * Uploads a file to Supabase Storage and triggers V3 processing pipeline.
 * Uses shell-file-processor-v3 Edge Function for OCR + Pass 1 entity detection.
 *
 * @param file The file to upload
 * @param patientId The patient's unique ID (references user_profiles.id in V3)
 * @returns The shell_file_id if successful
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

  // 2. Trigger V3 processing pipeline via Edge Function
  // This will: Upload → OCR (Google Vision) → Pass 1 Job → Worker Processing
  const { data, error: processingError } = await supabase.functions.invoke(
    'shell-file-processor-v3',
    {
      body: {
        filename: file.name,
        file_path: filePath,
        file_size_bytes: file.size,
        mime_type: file.type,
        patient_id: patientId,
        estimated_pages: 1, // Default, will be updated by OCR
      },
    }
  );

  if (processingError) {
    // If processing fails, try to clean up the uploaded file
    await supabase.storage.from("medical-docs").remove([filePath]);
    throw processingError;
  }

  // Return shell_file_id for tracking
  return data.shell_file_id;
} 