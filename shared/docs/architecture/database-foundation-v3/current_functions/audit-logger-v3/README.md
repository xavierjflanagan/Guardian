# audit-logger-v3 Edge Function

V3-native Edge Function for centralized audit logging with job correlation and healthcare compliance.

## Purpose

- Centralized audit logging for all V3 operations
- Job ID correlation for complete audit trails
- Patient ID correlation for healthcare compliance
- Batch audit event processing for performance
- PII-safe logging with sanitization

## Integration Points

### Database Functions
- **log_audit_event()**: Core V3 audit logging RPC
- **audit_log table**: Stores all audit events with correlation

### Usage Patterns
- **Single Event Logging**: Direct audit event creation
- **Batch Event Logging**: Multiple events in single request
- **Job Correlation**: Link events to background jobs
- **Cross-Service Tracking**: Correlation ID across Edge Functions and Workers

## Request Formats

### Single Audit Event
```typescript
POST /functions/v1/audit-logger-v3

Headers:
- Content-Type: application/json
- x-correlation-id: [optional UUID for cross-service tracing]

Body:
{
  "table_name": "shell_files",
  "record_id": "uuid-of-record",
  "operation": "INSERT",
  "old_values": null,
  "new_values": { "filename": "medical-report.pdf", "status": "uploaded" },
  "description": "Document uploaded to shell_files",
  "job_id": "uuid-of-processing-job",
  "patient_id": "uuid-of-patient-profile",
  "metadata": {
    "source": "shell-file-processor-v3",
    "file_size": 2048000
  }
}
```

### Batch Audit Events
```typescript
POST /functions/v1/audit-logger-v3

Body:
{
  "events": [
    {
      "table_name": "shell_files",
      "record_id": "uuid-1",
      "operation": "INSERT",
      "description": "File uploaded"
    },
    {
      "table_name": "job_queue", 
      "record_id": "uuid-2",
      "operation": "INSERT",
      "description": "Processing job enqueued"
    }
  ],
  "correlation_id": "uuid-for-batch"
}
```

## Response Format

```typescript
// Single Event Success (201)
{
  "success": true,
  "data": {
    "event_logged": true,
    "correlation_id": "uuid-for-tracing"
  }
}

// Batch Events Success (201)
{
  "success": true,
  "data": {
    "events_logged": 2,
    "correlation_id": "uuid-for-tracing"
  }
}

// Error (400/500)
{
  "success": false,
  "error": "Detailed error message",
  "correlation_id": "uuid-for-tracing"
}
```

## Key Features

### Healthcare Compliance
- **PII-Safe Logging**: Sanitized error messages and metadata
- **Patient Correlation**: Links all events to patient profiles
- **Audit Trail Integrity**: Critical failures stop processing
- **GDPR Compliance**: Supports right to be forgotten with record correlation

### Job Correlation
- **Job ID Tracking**: Links events to background processing jobs
- **Cross-Service Correlation**: Traces operations across Edge Functions and Workers
- **Timeline Reconstruction**: Complete audit trail from upload to completion

### Performance Optimization
- **Batch Processing**: Multiple events in single request
- **Service Role Access**: Direct database access without RLS overhead
- **Efficient Validation**: Fast UUID format checking and operation validation

### Error Handling
- **Comprehensive Validation**: Operation types, UUID formats, required fields
- **Graceful Failures**: Clear error messages with correlation tracking
- **Healthcare-Safe Logging**: No PII exposure in logs or error messages

## Helper Functions

### Job Audit Helper (for other Edge Functions)
```typescript
import { createJobAuditHelper } from '../audit-logger-v3/index.ts';

const auditHelper = createJobAuditHelper(supabase, correlationId);

await auditHelper.logJobEvent({
  job_id: 'uuid-of-job',
  operation: 'PROCESS',
  table_name: 'shell_files',
  record_id: 'uuid-of-file',
  patient_id: 'uuid-of-patient',
  description: 'Document processing completed',
  metadata: { tokens_used: 1500, processing_time: 45 }
});
```

## Environment Variables

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
```

## Deployment

```bash
# Copy to deployment location
cp -r current_functions/audit-logger-v3 ../../supabase/functions/

# Deploy to Supabase
supabase functions deploy audit-logger-v3
```

## Integration Examples

### From shell-file-processor-v3
```typescript
// Log file upload with job correlation
const auditData = {
  table_name: 'shell_files',
  record_id: shellFileId,
  operation: 'INSERT',
  job_id: jobId,
  patient_id: data.patient_id,
  description: `Document uploaded: ${data.filename}`,
  metadata: {
    filename: data.filename,
    file_size: data.file_size_bytes,
    mime_type: data.mime_type,
  }
};

await fetch('/functions/v1/audit-logger-v3', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'x-correlation-id': correlationId 
  },
  body: JSON.stringify(auditData)
});
```

### From Render Workers
```typescript
// Log job completion with results
const auditData = {
  table_name: 'job_queue',
  record_id: jobId,
  operation: 'UPDATE',
  job_id: jobId,
  patient_id: patientId,
  description: 'Job processing completed',
  metadata: {
    processing_time: 45,
    tokens_used: 1500,
    ai_confidence: 0.92
  }
};
```

## Testing

```bash
# Local development
deno task dev

# Test single event
curl -X POST http://localhost:54321/functions/v1/audit-logger-v3 \
  -H "Content-Type: application/json" \
  -d '{"table_name":"test","record_id":"123","operation":"INSERT"}'

# Test batch events
curl -X POST http://localhost:54321/functions/v1/audit-logger-v3 \
  -H "Content-Type: application/json" \
  -d '{"events":[{"table_name":"test","record_id":"123","operation":"INSERT"}]}'
```