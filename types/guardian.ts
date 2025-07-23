export interface Document {
  id: string;
  user_id: string;
  original_name: string | null;
  s3_key: string;
  mime_type: string | null;
  status: 'uploaded' | 'processing' | 'completed' | 'failed';
  created_at: string;
  processed_at?: string | null;
  error_log?: string | null;
  medical_data?: {
    documentType?: string;
    patientInfo?: {
      name?: string | null;
      dateOfBirth?: string | null;
      mrn?: string | null;
      insuranceId?: string | null;
    };
    medicalData?: any; // Flexible object for medications, labs, etc.
    dates?: {
      documentDate?: string | null;
      serviceDate?: string | null;
    };
    provider?: {
      name?: string | null;
      facility?: string | null;
      phone?: string | null;
    };
    confidence?: {
      overall?: number; // 0.0 to 1.0
      ocrMatch?: number;
      extraction?: number;
    };
    notes?: string;
  } | null;
  ocr_confidence?: number | null;
  vision_confidence?: number | null;
  overall_confidence?: number | null;
  processing_method?: string | null;
}

export interface PatientInfo {
  name?: string | null;
  dateOfBirth?: string | null;
  mrn?: string | null;
  insuranceId?: string | null;
}

export interface MedicalData {
  medications?: any[];
  allergies?: any[];
  labResults?: any[];
  conditions?: any[];
  vitals?: any;
  procedures?: any[];
}