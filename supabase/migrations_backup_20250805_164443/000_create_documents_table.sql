-- Create documents table with base schema
-- This migration creates the core documents table structure

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create documents table
CREATE TABLE documents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users on delete cascade,
  s3_key text not null,
  original_name text,
  mime_type text,
  status text default 'uploaded',
  created_at timestamptz default now()
);

-- Enable Row-Level Security
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for user access
CREATE POLICY "user can read own docs"
  ON documents FOR SELECT USING ( auth.uid() = user_id );

CREATE POLICY "user can insert own docs"
  ON documents FOR INSERT WITH CHECK ( auth.uid() = user_id );

CREATE POLICY "user can update own docs"
  ON documents FOR UPDATE USING ( auth.uid() = user_id );

CREATE POLICY "user can delete own docs"
  ON documents FOR DELETE USING ( auth.uid() = user_id );

-- Create indexes for efficient querying
CREATE INDEX documents_user_id_idx ON documents(user_id);
CREATE INDEX documents_created_at_idx ON documents(created_at);
CREATE INDEX documents_status_idx ON documents(status);

-- Add comment for documentation
COMMENT ON TABLE documents IS 'User medical documents with metadata and processing status';