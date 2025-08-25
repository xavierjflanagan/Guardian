# File Upload Component Architecture

## Document Status
- **Created**: 25 August 2025
- **Purpose**: Define the file upload system architecture for medical document ingestion
- **Status**: Component specification for implementation
- **Related**: Precedes `02-file-preprocessing-architecture.md`. References `04-ai-processing-architecture.md` for downstream AI processing

## Executive Summary

The file upload component serves as the entry point for medical documents into the Guardian processing pipeline. It handles user interactions, client-side validation, secure uploads to Supabase Storage, and initial database record creation while maintaining strict user data isolation through Row Level Security (RLS).

## Architecture Overview

```yaml
File Upload Flow:
  1. User Interface Layer: Drag-drop, file selection, progress tracking
  2. Client Validation Layer: Format checking, size limits, security pre-checks
  3. Upload Transport Layer: Multipart uploads with resumable functionality
  4. Storage Integration Layer: Supabase Storage with user-specific folders
  5. Database Recording Layer: Initial document metadata creation
  6. Handoff Layer: Triggers downstream pre-processing pipeline
```

## Component Specifications

### 1. User Interface Layer

#### Upload Interface Components
```typescript
interface UploadUIProps {
  maxFileSize: number;          // Default: 50MB per file
  maxFiles: number;             // Default: 10 files per batch
  acceptedFormats: string[];    // MIME types and extensions
  dragDropEnabled: boolean;     // Default: true
  progressTracking: boolean;    // Default: true
}

// Supported formats (aligned with pre-processing capabilities)
const SUPPORTED_FORMATS = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/heic', 'image/heif',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv'
];
```

#### Progress Tracking System
```typescript
interface UploadProgress {
  fileId: string;
  fileName: string;
  totalBytes: number;
  uploadedBytes: number;
  percentage: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
  estimatedTimeRemaining?: number;
  error?: string;
}
```

#### Drag-and-Drop Implementation
- **Zone highlighting**: Visual feedback during drag operations
- **File validation on drop**: Immediate format and size checking
- **Batch selection**: Support for multiple file selection
- **Error messaging**: Clear feedback for rejected files

### 2. Client-Side Validation Layer

#### File Type Validation
```typescript
interface FileValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  metadata: FileMetadata;
}

interface FileMetadata {
  detectedMimeType: string;
  fileExtension: string;
  fileSize: number;
  lastModified: Date;
  estimatedPages?: number;     // For PDFs and multi-page documents
  isHealthcareDocument?: boolean;  // Basic content detection
}
```

#### Security Pre-Checks
- **MIME type verification**: Check file headers against extensions
- **File signature validation**: Verify file magic numbers
- **Size limit enforcement**: Configurable per file and batch limits
- **Malicious content detection**: Basic client-side scanning
- **Duplicate prevention**: SHA-256 hash calculation for client-side deduplication

#### Validation Rules
```typescript
const VALIDATION_RULES = {
  maxFileSize: 50 * 1024 * 1024,        // 50MB per file
  maxBatchSize: 500 * 1024 * 1024,      // 500MB total batch
  maxFilesPerBatch: 10,
  requiredExtensions: ['.pdf', '.jpg', '.png', '.heic', '.docx', '.xlsx', '.txt'],
  blockedExtensions: ['.exe', '.bat', '.sh', '.js', '.html'],
  minFileSize: 1024                      // 1KB minimum
};
```

### 3. Upload Transport Layer

#### Supabase Storage Integration
```typescript
interface UploadStrategy {
  // Standard upload for files < 6MB
  singleUpload: (file: File) => Promise<UploadResult>;
  
  // Multipart upload for large files
  multipartUpload: (file: File) => Promise<UploadResult>;
  
  // Resumable upload for unreliable connections
  resumableUpload: (file: File, checkpointData?: string) => Promise<UploadResult>;
}
```

#### User-Specific Storage Structure
```
medical-docs/
├── {userId}/
│   ├── {timestamp}_{originalFileName}
│   └── metadata/
│       └── {timestamp}_{originalFileName}.json
```

#### Upload Optimization
- **Progressive upload**: Start with smaller files first
- **Parallel processing**: Multiple files uploaded concurrently
- **Connection retry**: Automatic retry with exponential backoff
- **Bandwidth throttling**: Optional to prevent network congestion
- **Compression detection**: Skip compression for already-compressed formats

### 4. Authentication & Authorization

#### User Session Validation
```typescript
interface UploadAuth {
  validateSession: () => Promise<User | null>;
  checkStorageQuota: (userId: string) => Promise<QuotaStatus>;
  enforceRLS: (userId: string, operation: string) => boolean;
}

interface QuotaStatus {
  used: number;          // Bytes used
  limit: number;         // Bytes allowed
  available: number;     // Bytes remaining
  percentUsed: number;   // Usage percentage
}
```

#### Row Level Security (RLS) Policies
- **Upload permissions**: Users can only upload to their own folders
- **Storage isolation**: Automatic user-specific folder creation
- **Metadata protection**: Document records isolated by user_id
- **Session validation**: Verify authentication before upload initiation

### 5. Database Recording Layer

#### Initial Document Record Creation
```sql
-- Document metadata table structure
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    original_filename VARCHAR(255) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    file_hash VARCHAR(64),  -- SHA-256 for deduplication
    upload_status VARCHAR(50) DEFAULT 'uploaded',
    created_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);
```

#### Upload Status Tracking
```typescript
interface DocumentStatus {
  id: string;
  status: 'uploaded' | 'processing' | 'completed' | 'failed';
  processingStarted?: Date;
  processingCompleted?: Date;
  errorDetails?: string;
  retryCount: number;
}
```

### 6. Error Handling & Recovery

#### Error Categories
```typescript
enum UploadErrorType {
  VALIDATION_ERROR = 'validation_error',
  NETWORK_ERROR = 'network_error',
  STORAGE_ERROR = 'storage_error',
  AUTH_ERROR = 'auth_error',
  QUOTA_ERROR = 'quota_error',
  SERVER_ERROR = 'server_error'
}

interface UploadError {
  type: UploadErrorType;
  message: string;
  details?: Record<string, any>;
  retryable: boolean;
  suggestedAction?: string;
}
```

#### Recovery Strategies
- **Auto-retry**: Network and server errors with exponential backoff
- **Manual retry**: User-initiated retry for failed uploads
- **Partial upload recovery**: Resume incomplete multipart uploads
- **Batch failure handling**: Continue with successful uploads, retry failed ones
- **Quota management**: Clear guidance when storage limits reached

## Integration Points

### Pre-Processing Pipeline Handoff
```typescript
interface PreProcessingTrigger {
  documentId: string;
  storagePath: string;
  metadata: DocumentMetadata;
  uploadTimestamp: Date;
  priority: 'high' | 'normal' | 'low';  // Based on file type/size
}
```

### Event System Integration
```typescript
// Events emitted by upload component
const UPLOAD_EVENTS = {
  UPLOAD_STARTED: 'upload:started',
  UPLOAD_PROGRESS: 'upload:progress',
  UPLOAD_COMPLETED: 'upload:completed',
  UPLOAD_FAILED: 'upload:failed',
  BATCH_COMPLETED: 'batch:completed',
  PROCESSING_TRIGGERED: 'processing:triggered'
};
```

## Performance Considerations

### Upload Optimization
- **File size routing**: Small files (<6MB) use direct upload, large files use multipart
- **Concurrent uploads**: Maximum 3 simultaneous uploads per user
- **Bandwidth detection**: Adapt upload strategy based on connection speed
- **Progress granularity**: Update progress every 100KB or 1% completion

### Storage Efficiency
- **Deduplication**: SHA-256 hash checking before upload
- **Compression detection**: Skip client-side compression for PDFs and images
- **Metadata optimization**: Store only essential metadata during upload
- **Cleanup procedures**: Remove failed uploads and temporary files

## Security Framework

### Upload Security
- **Content validation**: Verify file contents match declared MIME type
- **Malware scanning**: Integration point for server-side malware detection
- **Input sanitization**: Clean all user-provided metadata and filenames
- **Rate limiting**: Prevent abuse through upload frequency limits

### Data Protection
- **Encryption in transit**: HTTPS for all upload communications
- **User isolation**: Strict RLS enforcement and folder separation
- **Audit logging**: Track all upload activities for compliance
- **PII handling**: No processing of document contents during upload phase

## Monitoring & Analytics

### Upload Metrics
```typescript
interface UploadMetrics {
  totalUploads: number;
  successRate: number;
  averageUploadTime: number;
  fileFormatDistribution: Record<string, number>;
  errorTypeDistribution: Record<UploadErrorType, number>;
  quotaUtilization: number;
}
```

### Health Monitoring
- **Success rate tracking**: Monitor upload completion rates
- **Performance metrics**: Track upload speeds and processing times
- **Error pattern detection**: Identify recurring upload issues
- **User experience metrics**: Time to completion, retry rates

## Implementation Phases

### Phase 1: Basic Upload (MVP)
- Single file drag-and-drop upload
- Basic validation (type, size)
- Supabase Storage integration
- Simple progress tracking

### Phase 2: Enhanced Features
- Multiple file batch uploads
- Resumable uploads for large files
- Advanced validation and error handling
- Quota management and monitoring

### Phase 3: Optimization
- Intelligent upload routing
- Advanced progress tracking
- Performance analytics
- User experience enhancements

## Success Criteria

- **Upload Success Rate**: >99.5% for valid files
- **Performance**: <10 seconds for 10MB file upload
- **User Experience**: Clear progress feedback and error messaging
- **Security**: Zero successful malicious file uploads
- **Reliability**: Automatic recovery from network interruptions

---

*This file upload architecture provides a robust, secure, and user-friendly foundation for medical document ingestion into the Guardian processing pipeline, with clear handoff points to the pre-processing and AI analysis components.*