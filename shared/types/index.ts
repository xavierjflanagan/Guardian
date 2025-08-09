// Guardian Global TypeScript Definitions
// Shared types across all Guardian applications and packages

export interface User {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  display_name: string;
  profile_type: 'self' | 'child' | 'pet' | 'dependent' | 'guardian';
  avatar_url?: string;
  relationship?: string;
  birth_date?: string;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  filename: string;
  patient_id: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  status: 'uploaded' | 'processing' | 'completed' | 'failed';
  processing_metadata?: Record<string, any>;
  extracted_text?: string;
  ai_analysis?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// Add more global types as needed...