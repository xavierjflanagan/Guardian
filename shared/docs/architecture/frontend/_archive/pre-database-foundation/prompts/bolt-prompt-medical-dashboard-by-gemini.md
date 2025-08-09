# Bolt.new Prompt: Guardian Medical Dashboard (Gemini Revision)

**Purpose:** Complete Bolt.new prompt for generating Guardian's medical document processing dashboard  
**Created:** July 22, 2025  
**Author:** Gemini (based on original prompt and full project context)
**Context:** Implements ADR-0008 frontend AI development workflow, aligned with current architecture
**Related:** GitHub Issue #9, Two-stage data pipeline architecture, `guardian-web/app/(main)/page.tsx`

---

## Overview

This prompt is designed for use with Bolt.new to generate a comprehensive medical dashboard for Guardian's healthcare platform. It has been revised to align with the **current "Stage 1" architecture**, where all extracted data resides in a single `medical_data` JSONB column. This ensures that generated components are directly usable with the existing backend.

## Architecture Context

This prompt designs for the **current "Stage 1" output**, not the future "Stage 2" relational model.

```
Stage 1: Document → OCR + Vision → Raw messy JSON → `documents.medical_data` (JSONB)
```

---

## BOLT PROMPT: Guardian Medical Dashboard

```
Create a comprehensive medical document processing dashboard for a HIPAA-compliant healthcare application.

## PROJECT CONTEXT
- **Framework**: Next.js 15.3.4 + React 19 + TypeScript
- **Database**: Supabase with a `documents` table that stores extracted medical data in a `medical_data` JSONB column.
- **Styling**: Tailwind CSS with Inter font
- **Theme**: Healthcare professional design with primary blue (#0066CC)
- **Target Users**: Patients managing their own medical records

## DATABASE SCHEMA (Current Implementation)
```typescript
interface Document {
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
```

## REQUIRED COMPONENTS

### 1. **Main Dashboard Layout**
- A two-column layout.
- The left column will contain the document management panel.
- The right column will display the extracted medical information from the selected document.

### 2. **Document Management Panel (Left Column)**
- **File Upload:** A prominent file upload component (drag-and-drop and file selector).
- **Documents List:** A real-time list of the user's uploaded documents.
- **Document Item:** Each item in the list should display:
    - The original filename.
    - The upload timestamp.
    - The processing status (`uploaded`, `processing`, `completed`, `failed`) with a corresponding visual indicator (e.g., a colored dot or badge).
    - An error message if the status is `failed`.
    - A button to view the extracted data for completed documents.

### 3. **Extracted Medical Information Panel (Right Column)**
- This panel should be empty by default, with a message prompting the user to select a completed document.
- When a document is selected, this panel should display the extracted information from the `medical_data` field of the selected document.
- **Patient Header:** Display the patient's name, date of birth, and MRN from `medical_data.patientInfo`.
- **Key Metrics:** Summary cards for key information found in `medical_data.medicalData` (e.g., number of medications, new lab results).
- **Dynamic Sections:** Dynamically render sections based on the content of `medical_data.medicalData`. For example:
    - **Medications Section:** If `medical_data.medicalData.medications` exists, display a list of medications with dosage and frequency.
    - **Allergies Section:** If `medical_data.medicalData.allergies` exists, display a list of allergies with severity.
    - **Lab Results Section:** If `medical_data.medicalData.labResults` exists, display a table of lab results with values, units, and reference ranges.
    - **Conditions Section:** If `medical_data.medicalData.conditions` exists, display a list of diagnosed conditions.
- **Source Attribution:** Every piece of extracted data must clearly state that it was "Extracted from [original_name]".
- **Confidence Indicators:** Display the `overall_confidence` score for the entire document, and if available, for individual data points. Use a visual indicator (e.g., a progress bar or colored text) to represent the confidence level.

## UX/UI REQUIREMENTS

### Design Principles
- **Medical-grade professionalism**: Clean, trustworthy, clinical appearance.
- **Information hierarchy**: Critical medical data prominently displayed.
- **Confidence transparency**: Clear AI confidence indicators throughout.
- **Source attribution**: Every data point links back to the original document.
- **Accessibility**: WCAG 2.1 AA compliant with proper color contrast.

### Visual Design
- **Color palette**: Primary healthcare blue (#0066CC), success green (#10B981), warning yellow (#F59E0B), error red (#EF4444).
- **Typography**: Inter font with clear hierarchy (32px headers, 16px body text).
- **Cards**: Clean white cards with subtle shadows and proper spacing.
- **Icons**: Use Lucide React icons for medical consistency.
- **Responsive**: Mobile-first design that works on tablets and phones.

### Confidence Indicators
```typescript
// Visual confidence system
const getConfidenceColor = (score: number) => {
  if (score >= 95) return 'bg-green-100 text-green-800'; // High confidence
  if (score >= 80) return 'bg-yellow-100 text-yellow-800'; // Medium confidence
  return 'bg-red-100 text-red-800'; // Low confidence - requires review
}
```

### Interactive Elements
- **Hover states**: Subtle transitions on cards and buttons.
- **Click interactions**: Selecting a document in the left panel should update the right panel.
- **Loading states**: Skeleton loaders while fetching data or when a document is processing.
- **Empty states**: Helpful messages when no documents are uploaded or when a selected document has no extractable data.

## HEALTHCARE COMPLIANCE

### HIPAA Requirements
- No patient data displayed without proper authentication.
- All extracted data must be displayed with its source document clearly attributed.
- Secure display of sensitive medical information.

### Medical Data Standards
- Dosages and other medical values should be displayed exactly as extracted, with no interpretation.
- A clear distinction should be made between AI-extracted data and professionally verified data (for future implementation).
- Confidence scores must be visible for all AI-generated information.

## MOCK DATA STRUCTURE
```typescript
const mockDocuments: Document[] = [
  {
    id: 'doc_1',
    user_id: 'user_123',
    original_name: 'Lab_Results_July_2024.pdf',
    s3_key: 'user_123/1626888000_Lab_Results_July_2024.pdf',
    mime_type: 'application/pdf',
    status: 'completed',
    created_at: '2024-07-21T12:00:00Z',
    processed_at: '2024-07-21T12:05:00Z',
    overall_confidence: 96.5,
    medical_data: {
      documentType: 'lab_results',
      patientInfo: { name: 'Sarah Johnson', dateOfBirth: '1985-03-15', mrn: 'MRN12345' },
      medicalData: {
        labResults: [
          { test_name: 'Total Cholesterol', value: '180', unit: 'mg/dL', reference_range: '<200' },
          { test_name: 'HDL Cholesterol', value: '60', unit: 'mg/dL', reference_range: '>40' },
        ],
      },
      confidence: { overall: 0.965 },
    },
  },
  {
    id: 'doc_2',
    user_id: 'user_123',
    original_name: 'Prescription_Update.jpg',
    s3_key: 'user_123/1626888100_Prescription_Update.jpg',
    mime_type: 'image/jpeg',
    status: 'processing',
    created_at: '2024-07-21T12:01:40Z',
  },
  {
    id: 'doc_3',
    user_id: 'user_123',
    original_name: 'Old_Medical_Record.tiff',
    s3_key: 'user_123/1626888200_Old_Medical_Record.tiff',
    mime_type: 'image/tiff',
    status: 'failed',
    created_at: '2024-07-21T12:03:20Z',
    error_log: 'Unsupported file format',
  },
];
```

## TECHNICAL REQUIREMENTS

### TypeScript Implementation
- Strict type safety for all data.
- Use the `Document` interface provided above.
- Comprehensive prop validation for all components.

### Performance Requirements
- Initial load <2 seconds on 3G networks.
- Lazy loading for the extracted medical information panel.
- Efficient re-rendering when a new document is selected.

### Accessibility Requirements
- Screen reader compatibility with proper ARIA labels.
- Keyboard navigation for all interactive elements.
- High contrast mode support.

## COMPONENT ARCHITECTURE
```
MedicalDashboard/
├── DocumentManagementPanel.tsx
│   ├── FileUpload.tsx
│   └── DocumentList.tsx
│       └── DocumentItem.tsx
├── ExtractedInfoPanel.tsx
│   ├── PatientHeader.tsx
│   ├── MetricsSummary.tsx
│   └── DynamicSection.tsx
└── shared/
    ├── ConfidenceIndicator.tsx
    └── MedicalCard.tsx
```

## SUCCESS CRITERIA
1. **Architectural Alignment:** The generated components must use the provided `Document` interface and expect data in the specified JSONB structure.
2. **Workflow Integration:** The dashboard must seamlessly integrate the file upload, processing status, and data display into a single, intuitive user experience.
3. **Medical Accuracy:** All data must be displayed exactly as it is extracted, with clear source attribution and confidence scores.
4. **Professional Appearance:** The UI must look like a clinical application that healthcare professionals would trust.
5. **Mobile Responsiveness:** The dashboard must be fully functional and usable on mobile devices.
```

---

## Integration Notes

After Bolt generation, Claude Code integration should add:
- Real Supabase queries using the actual `Document` interface.
- Proper authentication with Guardian's magic link system.
- State management to link the `DocumentManagementPanel` and `ExtractedInfoPanel`.
- Real-time updates for document processing status.
- HIPAA-compliant data handling patterns.
- Performance optimizations for healthcare use cases.

## Related Documentation

- **ADR-0008**: Frontend AI Development Workflow Strategy
- **GitHub Issue #9**: Frontend Enhancement Strategy implementation
- **Database Schema**: `002_add_vision_pipeline_fields.sql`
- **Guardian Architecture**: `docs/architecture/system-design.md`

---

**Note**: This prompt has been revised to align with the current "Stage 1" architecture, ensuring generated components are directly compatible with the existing system.
