# shell-file-processor-v3 Edge Function

V3-native Edge Function for processing document uploads with job coordination and analytics tracking.

## Purpose

- Process document uploads to `shell_files` table (V3 schema)
- Enqueue processing jobs via `enqueue_job_v3()` RPC
- Track usage analytics for early adopter insights
- Implement idempotency for reliable uploads
- Proper CORS and error handling for healthcare applications

## Integration Points

### Database Tables
- **shell_files**: Document metadata and processing status
- **job_queue**: Background processing coordination
- **user_usage_tracking**: Analytics and billing foundation

### RPC Functions Used
- `enqueue_job_v3()` - Job coordination
- `track_shell_file_upload_usage()` - Usage analytics

## Request Format

```typescript
POST /functions/v1/shell-file-processor-v3

Headers:
- Content-Type: application/json
- x-correlation-id: [optional UUID for tracing]
- x-idempotency-key: [optional UUID for duplicate prevention]

Body:
{
  "filename": "medical-report.pdf",
  "file_path": "medical-docs/user123/20250902_medical-report.pdf",
  "file_size_bytes": 2048000,
  "mime_type": "application/pdf", 
  "patient_id": "uuid-of-patient-profile",
  "estimated_pages": 3
}
```

## Response Format

```typescript
// Success (201)
{
  "success": true,
  "data": {
    "shell_file_id": "uuid-of-shell-file",
    "job_id": "uuid-of-processing-job",
    "status": "enqueued",
    "estimated_processing_time": "2-5 minutes"
  },
  "correlation_id": "uuid-for-tracing"
}

// Error (400/500)
{
  "success": false,
  "error": "Detailed error message",
  "correlation_id": "uuid-for-tracing"
}
```

## Key Features

### Idempotency
- Uses `idempotency_key` to prevent duplicate uploads
- Returns existing record for duplicate requests
- Ensures reliable processing even with network retries

### Healthcare Security
- Service role client for system operations
- Proper patient_id validation
- PII-safe error logging
- CORS configured for healthcare domains

### V3 Architecture Integration
- Uses `shell_files` table (NOT legacy `documents`)
- Integrates with V3 job coordination system
- Supports analytics and usage tracking
- Correlation ID tracking for audit trails

### Error Handling
- Comprehensive validation of file types and sizes
- Graceful handling of database errors
- Non-critical analytics failures don't block uploads
- Sanitized error messages to prevent PII leaks

## Environment Variables

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key  # For future RLS operations
```

## Deployment

```bash
# Copy to deployment location
cp -r current_functions/shell-file-processor-v3 ../../supabase/functions/

# Deploy to Supabase
supabase functions deploy shell-file-processor-v3
```

## Testing

```bash
# Local testing
deno task dev

# Unit tests
deno task test

# Manual test
curl -X POST https://your-project.supabase.co/functions/v1/shell-file-processor-v3 \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.pdf","file_path":"test/path","file_size_bytes":1000,"mime_type":"application/pdf","patient_id":"test-uuid"}'
```