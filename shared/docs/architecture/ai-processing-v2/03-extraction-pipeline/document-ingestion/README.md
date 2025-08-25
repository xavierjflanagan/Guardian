# Document Ingestion - Stage 1 Processing

**Purpose:** Handle document upload, preprocessing, and metadata extraction  
**Position:** Stage 1 of the extraction pipeline  
**Dependencies:** User authentication, file storage, profile resolution  
**Output:** Preprocessed documents ready for text extraction

---

## Overview

Document ingestion is the first stage of Guardian's AI processing pipeline, responsible for receiving uploaded medical documents, validating formats, extracting metadata, resolving patient profiles, and preparing documents for subsequent text extraction and clinical analysis.

### Ingestion Objectives
```yaml
primary_responsibilities:
  validation: "Ensure document quality and format compatibility"
  preprocessing: "Optimize documents for OCR and AI processing"
  metadata_extraction: "Capture document context and provenance"
  profile_resolution: "Assign documents to correct patient profiles"
  quality_assurance: "Assess and improve document processing readiness"
```

---

## Document Ingestion Architecture

### Input Document Support
```yaml
supported_formats:
  image_formats:
    - "JPEG (.jpg, .jpeg)"
    - "PNG (.png)"  
    - "TIFF (.tif, .tiff)"
    - "BMP (.bmp)"
    - "WebP (.webp)"
    - "HEIC (.heic) - CRITICAL: iPhone photos (5-8% of uploads)"
    - "AVIF (.avif) - Modern format"
    - "JPEG-XL (.jxl) - Future format"
    
  document_formats:
    - "PDF (.pdf)"
    - "Multi-page PDF documents"
    - "Scanned PDF documents"
    - "DOCX (.docx) - HIGH PRIORITY: Medical reports (3-5% of uploads)"
    - "XLSX (.xlsx) - HIGH PRIORITY: Lab results"
    - "PPTX (.pptx) - Medical presentations"
    
  medical_formats:
    - "DICOM (.dcm) - limited support"
    - "HL7 FHIR documents (future)"
    
  archive_formats:
    - "ZIP archives containing supported formats"
    - "RAR archives"
    - "Multi-document uploads"

format_validation:
  mime_type_checking: "Verify actual format matches file extension"
  file_header_validation: "Detect format tampering or corruption"
  size_limits: "50MB per individual file, 200MB per batch"
  security_scanning: "Malware and virus detection"
```

### Document Quality Assessment
```yaml
quality_metrics:
  image_quality:
    resolution_check: "Minimum 300 DPI recommended, 150 DPI minimum"
    clarity_assessment: "Blur detection and sharpness analysis"
    contrast_evaluation: "Text readability assessment"
    orientation_detection: "Auto-rotation for proper text orientation"
    
  pdf_quality:
    text_layer_detection: "Native text vs. scanned PDF identification"
    page_structure_analysis: "Multi-page document organization"
    embedded_content_check: "Images, forms, annotations detection"
    encryption_status: "Password protection and accessibility"
    
  content_validation:
    medical_content_indicators: "Healthcare document pattern detection"
    text_density_check: "Sufficient text content for processing"
    language_detection: "Primary language identification"
    protected_information_scanning: "PHI and sensitive data detection"
```

### Preprocessing Operations
```yaml
image_preprocessing:
  quality_enhancement:
    - "Automatic brightness and contrast adjustment"
    - "Noise reduction and image sharpening"
    - "Skew correction and orientation normalization"
    - "Resolution upscaling for low-quality images"
    
  format_standardization:
    - "Convert all image formats to standardized PNG"
    - "Normalize color space to RGB"
    - "Standardize resolution to optimal OCR settings"
    
  size_optimization:
    - "Compress for efficient storage and processing"
    - "Maintain quality while reducing file size"
    - "Generate multiple resolution versions if needed"

pdf_preprocessing:
  text_extraction_preparation:
    - "Separate native text from image content"
    - "Extract embedded images for OCR processing"
    - "Preserve page structure and layout information"
    
  multi_page_handling:
    - "Page separation for independent processing"
    - "Maintain page order and document structure"
    - "Generate page thumbnails for user interface"
    
  security_handling:
    - "Handle password-protected PDFs with user consent"
    - "Respect document permissions and restrictions"
    - "Maintain audit trail for security compliance"
```

### Document Fingerprinting
```yaml
duplicate_detection:
  method: "SHA-256 hash of raw file content"
  process:
    - "Generate fingerprint upon initial upload."
    - "Query document_fingerprints table before processing."
    - "If hash exists, link to existing document and skip processing."
    - "If hash is new, store it upon successful pipeline completion."
  rationale: "Prevents costly reprocessing of identical files and avoids data duplication."
```

---

## Patient Profile Resolution

### Profile Assignment Strategy
```yaml
profile_resolution_methods:
  automatic_detection:
    name_extraction: "Extract patient names from document content"
    context_analysis: "Analyze document context for profile clues"
    provider_matching: "Match healthcare providers to known profiles"
    date_correlation: "Correlate dates with existing profile timelines"
    
  user_guided_assignment:
    manual_selection: "User selects target profile during upload"
    suggested_profiles: "AI suggests most likely profile matches"
    new_profile_creation: "Guided creation of new profiles when needed"
    
  validation_checks:
    consistency_verification: "Validate assignment against document content"
    duplicate_detection: "Prevent duplicate document storage"
    cross_reference_checking: "Verify against existing medical history"
```

### Multi-Profile Document Handling
```yaml
multi_profile_scenarios:
  family_documents:
    description: "Documents containing multiple family member information"
    handling: "Split into individual profile-specific documents"
    examples: ["Family vaccination records", "Insurance summaries"]
    
  shared_encounters:
    description: "Single appointment covering multiple profiles"
    handling: "Create linked documents for each affected profile"
    examples: ["Family medicine visits", "Group therapy sessions"]
    
  pediatric_care:
    description: "Parent managing child's healthcare documents"
    handling: "Assign to child profile with parent access permissions"
    examples: ["School physicals", "Pediatric specialist reports"]
    
  pet_care:
    description: "Veterinary documents for household pets"
    handling: "Assign to appropriate pet profile"
    examples: ["Annual vet exams", "Vaccination certificates"]
```

---

## Metadata Extraction

### Document Metadata Capture
```yaml
essential_metadata:
  document_properties:
    - "File name and original path"
    - "File size and format information"
    - "Creation and modification timestamps"
    - "Upload timestamp and source"
    
  content_metadata:
    - "Document type classification (lab result, prescription, etc.)"
    - "Healthcare provider identification"
    - "Document date extraction"
    - "Patient identifiers found in document"
    
  technical_metadata:
    - "Image resolution and quality metrics"
    - "OCR readiness assessment"
    - "Processing requirements and complexity"
    - "Estimated processing time"
```

### Healthcare Context Extraction
```yaml
clinical_context_detection:
  document_classification:
    laboratory_results: "Blood tests, imaging reports, pathology"
    prescriptions: "Medication orders, pharmacy records"
    clinical_notes: "Provider visit notes, assessments"
    administrative: "Insurance forms, appointment summaries"
    
  provider_identification:
    name_extraction: "Healthcare provider names and credentials"
    facility_identification: "Hospital, clinic, and practice names"
    contact_information: "Addresses, phone numbers, reference numbers"
    specialty_detection: "Medical specialty and department identification"
    
  temporal_context:
    document_dates: "Service dates, report dates, issue dates"
    timeline_placement: "Position within patient healthcare journey"
    urgency_indicators: "Stat results, critical values, emergency notes"
```

---

## Quality Assurance and Validation

### Document Quality Gates
```yaml
processing_readiness_criteria:
  minimum_quality_standards:
    resolution: ">= 150 DPI for images"
    text_clarity: "Text readability score >= 70%"
    content_completeness: "Sufficient medical content detected"
    format_integrity: "No corruption or format errors"
    
  optimal_quality_indicators:
    resolution: ">= 300 DPI for best OCR results"
    text_clarity: "Text readability score >= 90%"
    orientation: "Proper text orientation detected"
    contrast: "High contrast for clear text extraction"

quality_improvement_suggestions:
  low_resolution_handling:
    - "Suggest document re-scan at higher resolution"
    - "Apply AI upscaling with quality warnings"
    - "Provide user guidance for better document capture"
    
  poor_clarity_remediation:
    - "Apply automatic image enhancement"
    - "Suggest alternative document source if available"
    - "Flag for manual review and correction"
```

### Security and Compliance Validation
```yaml
security_checks:
  malware_scanning:
    - "Virus and malware detection"
    - "Suspicious content pattern analysis"
    - "Safe file handling protocols"
    
  privacy_protection:
    - "PHI detection and handling protocols"
    - "Sensitive information flagging"
    - "HIPAA compliance verification"
    
  access_control:
    - "User authorization for document upload"
    - "Profile access permission verification"
    - "Audit trail creation for compliance"
```

---

## Error Handling and Recovery

### Ingestion Error Categories
```yaml
format_errors:
  unsupported_formats:
    description: "Files in unsupported or corrupted formats"
    handling: "Format conversion attempts, user notification with guidance"
    recovery: "Suggest alternative formats or document capture methods"
    
  corrupted_files:
    description: "Files with corruption or incomplete data"
    handling: "File repair attempts, partial processing if possible"
    recovery: "Request document re-upload or alternative source"

quality_issues:
  poor_image_quality:
    description: "Images too blurry or low resolution for reliable processing"
    handling: "Enhancement attempts, quality warnings"
    recovery: "User guidance for better document capture"
    
  insufficient_content:
    description: "Documents with minimal or no extractable medical content"
    handling: "Content detection attempts, user confirmation"
    recovery: "Manual content verification or document type clarification"

profile_resolution_errors:
  ambiguous_assignment:
    description: "Unable to determine correct patient profile"
    handling: "Present profile options to user for selection"
    recovery: "Manual profile assignment with validation"
    
  new_profile_needed:
    description: "Document requires new profile creation"
    handling: "Guide user through profile creation process"
    recovery: "Create new profile with document assignment"
```

### Recovery Strategies
```yaml
graceful_degradation:
  partial_processing: "Process extractable portions while flagging issues"
  quality_warnings: "Continue processing with user notifications"
  manual_intervention: "Queue for human review and assistance"
  
retry_mechanisms:
  automatic_retry: "Retry failed operations with different parameters"
  alternative_methods: "Try different preprocessing approaches"
  user_assisted_retry: "Guide user through corrective actions"
```

---

## Performance and Scalability

### Processing Performance
```yaml
performance_targets:
  single_document_ingestion: 5_seconds      # Average preprocessing time
  batch_document_processing: 20_documents_per_minute
  concurrent_upload_support: 5_users        # Simultaneous upload sessions
  storage_optimization: 70_percent_compression # File size reduction

scalability_considerations:
  concurrent_processing:
    - "Parallel document preprocessing"
    - "Independent quality assessment pipelines"
    - "Batch optimization for multiple documents"
    
  resource_management:
    - "Memory-efficient image processing"
    - "Temporary file cleanup and management"
    - "Storage optimization and compression"
    
  load_balancing:
    - "Distribute processing across available resources"
    - "Queue management for high-volume periods"
    - "Priority handling for urgent documents"
```

### Storage Management
```yaml
storage_strategy:
  original_document_preservation:
    - "Maintain original files for audit and reference"
    - "Secure storage with appropriate encryption"
    - "Efficient compression without quality loss"
    
  processed_document_variants:
    - "Store optimized versions for OCR processing"
    - "Generate thumbnails for user interface"
    - "Create page-separated versions for multi-page documents"
    
  metadata_storage:
    - "Structured metadata in database"
    - "Document processing history and audit trail"
    - "User interaction history and preferences"
```

---

## Integration Points

### Database Integration
```sql
-- Document ingestion populates documents table
INSERT INTO documents (
    id,
    patient_id,                  -- Resolved patient profile
    filename,
    file_type,
    file_size,
    document_type,               -- Classified document category
    upload_date,
    document_date,               -- Extracted from content
    provider_name,               -- Identified healthcare provider
    processing_status,
    quality_score,
    metadata                     -- JSON with extraction results
) VALUES (
    gen_random_uuid(),
    $1::UUID,                    -- From profile resolution
    $2::TEXT,                    -- Original filename
    $3::TEXT,                    -- Validated file type
    $4::INTEGER,                 -- File size in bytes
    $5::TEXT,                    -- Document classification
    NOW(),                       -- Upload timestamp
    $6::DATE,                    -- Extracted document date
    $7::TEXT,                    -- Healthcare provider
    'ingested',                  -- Ready for text extraction
    $8::NUMERIC,                 -- Quality assessment score
    $9::JSONB                    -- Preprocessing metadata
);

-- Document processing session tracking
INSERT INTO document_processing_sessions (
    document_id,
    stage,
    started_at,
    processing_node,
    quality_metrics,
    preprocessing_results
) VALUES (
    $1::UUID,
    'ingestion',
    NOW(),
    $2::TEXT,                    -- Processing server ID
    $3::JSONB,                   -- Quality assessment results
    $4::JSONB                    -- Preprocessing operation results
);

-- Store document fingerprint for duplicate detection
INSERT INTO document_fingerprints (
    fingerprint_hash,            -- SHA-256 hash of the raw file
    document_id                  -- Foreign key to the documents table
) VALUES (
    $1::TEXT,
    $2::UUID
) ON CONFLICT (fingerprint_hash) DO NOTHING;
```

### Storage Service Integration
```yaml
file_storage:
  original_documents:
    location: "supabase_storage/medical-docs/{user_id}/originals/"
    encryption: "AES-256 encryption at rest"
    access_control: "User-specific folder isolation"
    
  processed_documents:
    location: "supabase_storage/medical-docs/{user_id}/processed/"
    optimization: "OCR-ready format conversion"
    variants: "Multiple resolutions and formats"
    
  temporary_processing:
    location: "temporary_storage/processing/{session_id}/"
    cleanup: "Automatic deletion after processing completion"
    isolation: "Session-specific temporary folders"
```

---

## API Specifications

### Document Upload API
```typescript
interface DocumentUploadRequest {
  files: File[];                          // Uploaded document files
  target_profile_id?: string;             // Optional profile assignment
  document_type_hint?: DocumentType;      // Optional classification hint
  metadata?: DocumentMetadata;            // Additional metadata
}

interface DocumentUploadResponse {
  uploaded_documents: UploadedDocument[];
  processing_session_id: string;
  estimated_processing_time: number;      // Seconds
  quality_warnings: QualityWarning[];
}

interface UploadedDocument {
  document_id: string;
  filename: string;
  file_size: number;
  document_type: DocumentType;
  assigned_profile_id: string;
  quality_score: number;
  processing_status: 'ingested' | 'error';
  error_details?: ErrorDetails;
}
```

### Profile Resolution API
```typescript
interface ProfileResolutionRequest {
  document_id: string;
  extracted_names: string[];
  document_context: DocumentContext;
  user_profiles: UserProfile[];
}

interface ProfileResolutionResponse {
  recommended_profile_id: string;
  confidence_score: number;
  alternative_profiles: ProfileSuggestion[];
  requires_user_confirmation: boolean;
  new_profile_suggestion?: NewProfileSuggestion;
}
```

---

## Quality Metrics and Monitoring

### Ingestion Quality Metrics
```yaml
success_metrics:
  document_ingestion_rate: 98%           # Successful preprocessing rate
  quality_assessment_accuracy: 90%       # Correct quality predictions
  profile_resolution_accuracy: 85%       # Correct profile assignments
  processing_time_compliance: 95%        # Within target processing time

error_tracking:
  format_rejection_rate: 2%              # Documents rejected for format issues
  quality_improvement_rate: 15%          # Documents enhanced via preprocessing
  manual_intervention_rate: 5%           # Documents requiring human assistance
  retry_success_rate: 80%                # Successful processing after retry
```

### Monitoring and Alerting
```yaml
real_time_monitoring:
  upload_volume: "Documents uploaded per hour"
  processing_queue_depth: "Pending documents awaiting processing"
  quality_score_distribution: "Document quality assessment results"
  error_rate_tracking: "Failed ingestion attempts and reasons"

alert_conditions:
  high_error_rate: "Ingestion failures > 5%"
  quality_degradation: "Average quality score < 70%"
  processing_delays: "Queue depth > 50 documents"
  storage_capacity: "Storage utilization > 85%"
```

---

## Implementation Roadmap

### Phase 1: Core Ingestion (Week 1)
- **Basic file upload** with format validation
- **Simple quality assessment** and preprocessing
- **Profile resolution** for single-profile documents
- **Database integration** for document metadata

### Phase 2: Advanced Processing (Week 2)
- **Multi-format support** including PDF processing
- **Advanced quality enhancement** and image optimization
- **Multi-profile document handling** and family coordination
- **Comprehensive error handling** and recovery

### Phase 3: Performance Optimization (Week 3)
- **Batch processing** capabilities
- **Concurrent upload** support
- **Storage optimization** and compression
- **Performance monitoring** and alerting

---

*Document ingestion establishes the foundation for Guardian's AI processing pipeline, ensuring that every uploaded medical document is properly validated, optimized, and prepared for accurate clinical data extraction while maintaining security, quality, and patient profile integrity.*