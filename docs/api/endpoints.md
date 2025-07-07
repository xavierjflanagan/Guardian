# API Documentation - Guardian

**Purpose:** Complete reference for Guardian's API endpoints, authentication, and usage.
**Last updated:** July 2025
**Audience:** Developers, integrators, API consumers
**Prerequisites:** Familiarity with REST APIs, authentication, and JSON

**Version:** MVP v1.0  
**Base URL:** `https://your-app.vercel.app/api`

---

## 📋 Overview

The Guardian API provides endpoints for medical document processing, user authentication, and data management. All endpoints require authentication unless explicitly noted.

### Core Capabilities
- **Document Upload & Processing** - Upload medical documents for AI analysis
- **User Authentication** - Secure user management with magic links
- **Data Retrieval** - Access processed medical data and insights
- **File Management** - Manage uploaded documents and metadata

---

## 🔐 Authentication

Guardian uses Supabase Authentication with magic link sign-in for secure, passwordless access.

### Authentication Flow
1. **Request Magic Link** - User provides email address
2. **Email Verification** - User clicks link in email
3. **Session Creation** - Valid session token returned
4. **API Access** - Include session token in requests

### Headers
All authenticated requests must include:
```http
Authorization: Bearer <session_token>
Content-Type: application/json
```

### Example Authentication
```javascript
// Request magic link
const { data, error } = await supabase.auth.signInWithOtp({
  email: 'user@example.com'
});

// Use session token for API calls
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;
```

---

## 📄 Document Processing Endpoints

### POST /api/documents/upload
Upload and process medical documents through the AI pipeline.

**Authentication:** Required

#### Request
```http
POST /api/documents/upload
Content-Type: multipart/form-data

{
  "file": <binary_file_data>,
  "filename": "medical-report.pdf",
  "document_type": "medical_report"
}
```

#### Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file` | File | Yes | Medical document (PDF, PNG, JPG) |
| `filename` | String | Yes | Original filename |
| `document_type` | String | No | Type of medical document |

#### Response
```json
{
  "success": true,
  "data": {
    "document_id": "uuid-string",
    "filename": "medical-report.pdf",
    "status": "processing",
    "created_at": "2024-12-20T10:30:00Z",
    "estimated_completion": "2024-12-20T10:32:00Z"
  }
}
```

#### Error Response
```json
{
  "success": false,
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "File size exceeds 10MB limit",
    "details": "Maximum file size is 10MB"
  }
}
```

### GET /api/documents/:id
Retrieve processed document data and analysis results.

**Authentication:** Required

#### Request
```http
GET /api/documents/123e4567-e89b-12d3-a456-426614174000
```

#### Response
```json
{
  "success": true,
  "data": {
    "document_id": "123e4567-e89b-12d3-a456-426614174000",
    "filename": "medical-report.pdf",
    "status": "completed",
    "processed_at": "2024-12-20T10:32:15Z",
    "analysis": {
      "extracted_text": "Patient: John Doe...",
      "key_findings": [
        "Blood pressure: 120/80 mmHg",
        "Heart rate: 72 bpm"
      ],
      "document_type": "medical_report",
      "confidence_score": 0.95
    },
    "metadata": {
      "file_size": 2048576,
      "mime_type": "application/pdf",
      "pages": 3
    }
  }
}
```

### GET /api/documents
List all documents for the authenticated user.

**Authentication:** Required

#### Request
```http
GET /api/documents?limit=10&offset=0&status=completed
```

#### Query Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | Integer | 10 | Number of documents to return |
| `offset` | Integer | 0 | Number of documents to skip |
| `status` | String | all | Filter by status: `processing`, `completed`, `failed` |

#### Response
```json
{
  "success": true,
  "data": {
    "documents": [
      {
        "document_id": "uuid-1",
        "filename": "report-1.pdf",
        "status": "completed",
        "created_at": "2024-12-20T10:30:00Z"
      }
    ],
    "pagination": {
      "total": 25,
      "limit": 10,
      "offset": 0,
      "has_more": true
    }
  }
}
```

### DELETE /api/documents/:id
Delete a document and all associated data.

**Authentication:** Required

#### Request
```http
DELETE /api/documents/123e4567-e89b-12d3-a456-426614174000
```

#### Response
```json
{
  "success": true,
  "message": "Document deleted successfully"
}
```

---

## 📊 Data Endpoints

### GET /api/insights/summary
Get summarized health insights across all documents.

**Authentication:** Required

#### Response
```json
{
  "success": true,
  "data": {
    "total_documents": 15,
    "latest_update": "2024-12-20T10:32:15Z",
    "key_metrics": {
      "vital_signs": {
        "blood_pressure": "120/80 mmHg",
        "heart_rate": "72 bpm",
        "recorded_at": "2024-12-20T10:30:00Z"
      },
      "medications": ["Lisinopril 10mg", "Metformin 500mg"],
      "conditions": ["Hypertension", "Type 2 Diabetes"]
    },
    "trends": {
      "blood_pressure_trend": "stable",
      "weight_trend": "declining"
    }
  }
}
```

---

## 🔄 Processing Pipeline

### Document Processing Workflow
1. **Upload** - Document uploaded to secure storage
2. **Validation** - File type and size validation
3. **OCR** - Text extraction from document
4. **Analysis** - AI processing for key information
5. **Storage** - Processed data stored in database
6. **Notification** - User notified of completion

### Processing Status
- `uploading` - File being uploaded
- `validating` - File validation in progress
- `processing` - AI analysis in progress
- `completed` - Processing successful
- `failed` - Processing failed (see error details)

---

## ⚠️ Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Document not found |
| `FILE_TOO_LARGE` | 413 | File exceeds size limit |
| `UNSUPPORTED_FILE_TYPE` | 415 | File type not supported |
| `PROCESSING_FAILED` | 422 | Document processing failed |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## 📋 Rate Limits

- **Document Upload:** 10 files per hour per user
- **API Requests:** 100 requests per minute per user
- **File Size Limit:** 10MB per file
- **Total Storage:** 1GB per user (MVP tier)

---

## 🔧 Development

### Local Development
```bash
# Start development server
npm run dev

# API available at
http://localhost:3000/api
```

### Testing
```bash
# Run API tests
npm run test:api

# Test specific endpoint
curl -X GET http://localhost:3000/api/documents \
  -H "Authorization: Bearer <token>"
```

### Webhook Integration
For real-time processing updates, Guardian supports webhooks:

```javascript
// Configure webhook endpoint
const webhook = {
  url: 'https://your-app.com/webhooks/document-processed',
  events: ['document.completed', 'document.failed']
};
```

---

## 📚 SDK Examples

### JavaScript/TypeScript
```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, key);

// Upload document
const uploadDocument = async (file) => {
  const { data, error } = await supabase.storage
    .from('medical-docs')
    .upload(`${Date.now()}_${file.name}`, file);
  
  if (error) throw error;
  return data;
};

// Get document analysis
const getDocumentAnalysis = async (documentId) => {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();
  
  if (error) throw error;
  return data;
};
```

### cURL
```bash
# Upload document
curl -X POST https://your-app.vercel.app/api/documents/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@medical-report.pdf" \
  -F "filename=medical-report.pdf"

# Get document
curl -X GET https://your-app.vercel.app/api/documents/uuid \
  -H "Authorization: Bearer <token>"
```

---

## 🆘 Support

- **Issues:** Create GitHub issue for bugs
- **Questions:** Check [troubleshooting guide](../guides/troubleshooting.md)
- **Feature Requests:** Use GitHub discussions

---

*This documentation is updated with each API change. Last reviewed: December 2024*