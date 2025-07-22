# Bolt.new Prompt: Guardian Medical Dashboard

**Purpose:** Complete Bolt.new prompt for generating Guardian's medical document processing dashboard  
**Created:** July 21, 2025  
**Context:** Implements ADR-0008 frontend AI development workflow  
**Related:** GitHub Issue #9, Two-stage data pipeline architecture  

---

## Overview

This prompt is designed for use with Bolt.new to generate a comprehensive medical dashboard for Guardian's healthcare platform. It follows the Option B architecture decision for clean, organized data structures and implements the Bolt → Claude workflow outlined in ADR-0008.

## Architecture Context

Based on the two-stage LLM pipeline decision:
```
Stage 1: Document → OCR + Vision → Raw messy JSON (current GPT-4o Mini)
Stage 2: Raw JSON → Normalizer LLM → Clean structured JSON → Relational tables
```

This prompt designs for the **clean Stage 2 output** with organized relational database structure.

---

## BOLT PROMPT: Guardian Medical Dashboard

```
Create a comprehensive medical document processing dashboard for a HIPAA-compliant healthcare application.

## PROJECT CONTEXT
- **Framework**: Next.js 15.3.4 + React 19 + TypeScript
- **Database**: Supabase with Row Level Security (RLS) 
- **Styling**: Tailwind CSS with Inter font
- **Theme**: Healthcare professional design with primary blue (#0066CC)
- **Target Users**: Patients managing their own medical records

## DATABASE SCHEMA (Clean, Organized Structure)
```typescript
interface Patient {
  id: string
  user_id: string
  name: string
  date_of_birth: string
  mrn?: string
}

interface Medication {
  id: string
  patient_id: string
  name: string
  dosage: string
  frequency: string
  start_date?: string
  confidence_score: number
  source_document_id: string
}

interface Allergy {
  id: string
  patient_id: string
  allergen: string
  severity: 'mild' | 'moderate' | 'severe'
  reaction_type?: string
  confidence_score: number
  source_document_id: string
}

interface LabResult {
  id: string
  patient_id: string
  test_name: string
  value: string
  unit: string
  reference_range?: string
  test_date: string
  confidence_score: number
  source_document_id: string
}

interface Condition {
  id: string
  patient_id: string
  diagnosis: string
  icd_code?: string
  diagnosed_date?: string
  confidence_score: number
  source_document_id: string
}
```

## REQUIRED COMPONENTS

### 1. **Medical Dashboard Overview**
- Patient profile header with name, DOB, MRN
- Key metrics summary cards (total medications, active conditions, recent tests)
- Quick navigation to detailed sections
- Document processing status indicator

### 2. **Medications Section**
- List of current medications with dosage, frequency
- Visual confidence indicators (green >95%, yellow 80-95%, red <80%)
- Source document attribution ("From Lab Results - July 15, 2024")
- Interactive medication details with click-to-expand

### 3. **Allergies & Reactions Section**  
- Critical allergies displayed prominently with severity indicators
- Clear visual hierarchy (severe allergies highlighted in red)
- Reaction type descriptions when available
- Confidence scores for each allergy entry

### 4. **Medical Conditions Section**
- Current diagnosed conditions with dates
- ICD-10 codes when available (in smaller text)
- Timeline view of condition history
- Source document traceability

### 5. **Lab Results Section**
- Test results organized by type and date
- Visual indicators for values outside reference ranges
- Trend charts for repeated tests (e.g., cholesterol over time)
- Reference ranges clearly displayed

### 6. **Document Sources Panel**
- List of uploaded documents with processing status
- Click to view original document
- Processing confidence scores
- Upload date and document type

## UX/UI REQUIREMENTS

### Design Principles
- **Medical-grade professionalism**: Clean, trustworthy, clinical appearance
- **Information hierarchy**: Critical medical data prominently displayed
- **Confidence transparency**: Clear AI confidence indicators throughout
- **Source attribution**: Every data point links back to original document
- **Accessibility**: WCAG 2.1 AA compliant with proper color contrast

### Visual Design
- **Color palette**: Primary healthcare blue (#0066CC), success green (#10B981), warning yellow (#F59E0B), error red (#EF4444)
- **Typography**: Inter font with clear hierarchy (32px headers, 16px body text)
- **Cards**: Clean white cards with subtle shadows and proper spacing
- **Icons**: Use Lucide React icons for medical consistency
- **Responsive**: Mobile-first design that works on tablets and phones

### Confidence Indicators
```typescript
// Visual confidence system
const getConfidenceColor = (score: number) => {
  if (score >= 95) return 'bg-green-100 text-green-800' // High confidence
  if (score >= 80) return 'bg-yellow-100 text-yellow-800' // Medium confidence  
  return 'bg-red-100 text-red-800' // Low confidence - requires review
}
```

### Interactive Elements
- **Hover states**: Subtle transitions on cards and buttons
- **Click interactions**: Expand/collapse for detailed information
- **Loading states**: Skeleton loaders during data fetching
- **Empty states**: Helpful messages when no data is available

## HEALTHCARE COMPLIANCE

### HIPAA Requirements
- No patient data displayed without proper authentication
- Audit trail for all data access
- Secure display of sensitive medical information
- Clear data source attribution for liability

### Medical Data Standards
- Dosages displayed exactly as extracted (no interpretation)
- Clear distinction between AI-extracted and professionally-verified data
- Confidence scores visible for all medical information
- Reference ranges included for all lab values

### Error Handling
- Graceful handling of missing or incomplete data
- Clear error messages in medical context
- Retry mechanisms for failed data loads
- Fallback displays when confidence is too low

## MOCK DATA STRUCTURE
```typescript
const mockPatient = {
  id: '123',
  user_id: 'user_456', 
  name: 'Sarah Johnson',
  date_of_birth: '1985-03-15',
  mrn: 'MRN12345'
}

const mockMedications = [
  {
    id: '1',
    patient_id: '123',
    name: 'Lisinopril',
    dosage: '10mg',
    frequency: 'Daily',
    start_date: '2024-01-15',
    confidence_score: 96,
    source_document_id: 'doc_789'
  },
  {
    id: '2', 
    patient_id: '123',
    name: 'Metformin',
    dosage: '500mg',
    frequency: 'Twice daily with meals',
    confidence_score: 89,
    source_document_id: 'doc_790'
  }
]

const mockAllergies = [
  {
    id: '1',
    patient_id: '123',
    allergen: 'Penicillin',
    severity: 'severe',
    reaction_type: 'Anaphylaxis',
    confidence_score: 98,
    source_document_id: 'doc_788'
  }
]

const mockLabResults = [
  {
    id: '1',
    patient_id: '123',
    test_name: 'Total Cholesterol',
    value: '180',
    unit: 'mg/dL',
    reference_range: '<200',
    test_date: '2024-07-15',
    confidence_score: 95,
    source_document_id: 'doc_791'
  }
]
```

## TECHNICAL REQUIREMENTS

### TypeScript Implementation
- Strict type safety for all medical data
- Proper interface definitions matching database schema
- Generic types for reusable components
- Comprehensive prop validation

### Performance Requirements  
- Initial load <2 seconds on 3G networks
- Smooth animations and transitions
- Lazy loading for large data sets
- Efficient re-rendering with proper React optimization

### Accessibility Requirements
- Screen reader compatibility with proper ARIA labels
- Keyboard navigation for all interactive elements
- High contrast mode support
- Text scaling up to 200% without layout breaks

## COMPONENT ARCHITECTURE
```
MedicalDashboard/
├── PatientHeader.tsx          # Patient profile overview
├── MetricsSummary.tsx         # Key health metrics cards
├── MedicationsSection.tsx     # Current medications list
├── AllergiesSection.tsx       # Allergies and reactions
├── ConditionsSection.tsx      # Medical conditions timeline
├── LabResultsSection.tsx      # Test results with trends
├── DocumentSources.tsx        # Uploaded documents panel
└── shared/
    ├── ConfidenceIndicator.tsx
    ├── SourceAttribution.tsx
    └── MedicalCard.tsx
```

## SUCCESS CRITERIA
1. **Medical accuracy**: All data displays exactly as extracted with proper context
2. **Professional appearance**: Looks like a clinical application healthcare workers would trust
3. **Clear confidence**: Users understand AI confidence levels at all times
4. **Source traceability**: Every data point can be traced back to original document
5. **Mobile responsive**: Works perfectly on healthcare workers' mobile devices
6. **Accessibility**: Passes automated accessibility audits

Create a comprehensive, production-ready medical dashboard that demonstrates Guardian's value proposition: transforming scattered medical documents into organized, actionable health information that patients own and control.
```

---

## Usage Instructions

1. **Copy the prompt above** (between the triple backticks)
2. **Paste into Bolt.new** chat interface
3. **Let Bolt generate** the medical dashboard components
4. **Export components** to your local windsurf-assistant branch
5. **Use Claude Code** for integration with Guardian's Supabase architecture

## Integration Notes

After Bolt generation, Claude Code integration should add:
- Real Supabase queries using the clean database schema
- Proper authentication with Guardian's magic link system
- Error handling and loading states for medical data
- HIPAA-compliant data handling patterns
- Performance optimizations for healthcare use cases

## Related Documentation

- **ADR-0008**: Frontend AI Development Workflow Strategy
- **GitHub Issue #9**: Frontend Enhancement Strategy implementation
- **Database Schema**: Clean relational structure for Stage 2 pipeline
- **Guardian Architecture**: docs/architecture/system-design.md

---

**Note**: This prompt represents the first implementation of the ADR-0008 Bolt → Claude workflow for Guardian's healthcare frontend development.