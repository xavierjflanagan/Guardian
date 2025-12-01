#!/bin/bash

curl -X POST https://napoydbbuvbpyciwjdci.supabase.co/functions/v1/shell-file-processor-v3 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hcG95ZGJidXZicHljaXdqZGNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE2Nzc5ODQsImV4cCI6MjA2NzI1Mzk4NH0.xEY4MeFA7nilS-LqT9KkybXjQCbwNOjgEv4lCxmsl6Q" \
  -d '{
    "filename": "v3-test-document.pdf",
    "file_path": "test/v3-deployment/test-document.pdf", 
    "file_size_bytes": 500000,
    "mime_type": "application/pdf",
    "patient_id": "3e11f635-d891-4e0b-83f2-fffa005e74b3"
  }'