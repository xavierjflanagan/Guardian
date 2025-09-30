# Standardized AI Extraction JSON Format

**Purpose:** Define the standardized JSON format that AI extraction outputs to hand over to the existing database normalization pipeline  
**Status:** Implementation Ready  
**Last updated:** August 19, 2025

---

## **Overview**

This document defines the exact JSON schema that AI processing produces and the existing Guardian database normalization pipeline expects. This ensures clean separation between AI extraction (raw → JSON) and database normalization (JSON → 47 tables).

## **Core Design Principles**

1. **Clean Handover**: AI extraction ends at standardized JSON blob
2. **Database Compatibility**: JSON structure maps directly to existing normalization tables
3. **Profile-Aware**: Includes profile context for multi-profile family management
4. **Confidence Tracking**: Maintains AI confidence scores throughout normalization
5. **Audit Trail**: Full provenance tracking from extraction to storage

---

## **Standardized JSON Schema**

### **Root Schema Structure**
```typescript
interface GuardianAIExtractionResult {
  // Document metadata
  documentMetadata: DocumentMetadata;
  
  // Patient identification (for profile matching)
  patientIdentification: PatientIdentification;
  
  // Extracted medical data (core clinical information)
  medicalData: MedicalData;
  
  // Quality and confidence metrics
  qualityMetrics: QualityMetrics;
  
  // Processing provenance (for audit compliance)
  processingProvenance: ProcessingProvenance;
}
```

### **Document Metadata**
```typescript
interface DocumentMetadata {
  documentType: 'lab_results' | 'prescription' | 'medical_record' | 'imaging_report' | 
                'insurance_card' | 'discharge_summary' | 'appointment_summary' | 'other';
  documentDate: string | null; // ISO 8601 date (YYYY-MM-DD)
  serviceDate: string | null;  // ISO 8601 date when service was performed
  documentSource: {
    facilityName: string | null;
    providerName: string | null;
    address: string | null;
    phone: string | null;
    fax: string | null;
  };
  pageCount: number;
  originalFilename: string;
}
```

### **Patient Identification**
```typescript
interface PatientIdentification {
  // Core identifiers for profile matching
  patientName: {
    full: string | null;
    first: string | null;
    last: string | null;
    middle: string | null;
    confidence: number; // 0-1
  };
  dateOfBirth: {
    value: string | null; // ISO 8601 date (YYYY-MM-DD)
    confidence: number;
  };
  medicalRecordNumber: {
    value: string | null;
    facility: string | null;
    confidence: number;
  };
  insuranceInfo: {
    memberID: string | null;
    groupNumber: string | null;
    planName: string | null;
    confidence: number;
  };
  
  // Profile matching context
  profileMatchingHints: {
    likelyProfileId: string | null; // Best guess based on name/DOB
    alternativeMatches: string[];   // Other possible profile IDs
    requiresUserSelection: boolean; // If multiple profiles match
    confidence: number;
  };
}
```

### **Medical Data**
```typescript
interface MedicalData {
  // Medications
  medications: {
    name: string;
    genericName: string | null;
    brandName: string | null;
    dosage: {
      amount: string;
      unit: string;
      form: string | null; // tablet, capsule, liquid, etc.
    };
    frequency: string;
    route: string | null; // oral, injection, topical, etc.
    prescriber: string | null;
    pharmacy: string | null;
    startDate: string | null;
    endDate: string | null;
    instructions: string | null;
    refillsRemaining: number | null;
    confidence: number;
    sourceLocation: {
      page: number;
      coordinates: { x: number; y: number; width: number; height: number; } | null;
    };
  }[];
  
  // Medical conditions
  conditions: {
    diagnosis: string;
    icdCode: string | null;
    snomedCode: string | null;
    status: 'active' | 'resolved' | 'chronic' | 'suspected' | 'history_of';
    severity: 'mild' | 'moderate' | 'severe' | null;
    onsetDate: string | null;
    resolvedDate: string | null;
    diagnosedBy: string | null;
    notes: string | null;
    confidence: number;
    sourceLocation: {
      page: number;
      coordinates: { x: number; y: number; width: number; height: number; } | null;
    };
  }[];
  
  // Laboratory results
  labResults: {
    testName: string;
    testCode: string | null; // LOINC code if available
    value: {
      numeric: number | null;
      text: string;
      unit: string | null;
    };
    referenceRange: {
      low: number | null;
      high: number | null;
      unit: string | null;
      text: string | null;
    };
    abnormalFlag: boolean | null;
    criticalFlag: boolean | null;
    testDate: string | null;
    collectionDate: string | null;
    orderingProvider: string | null;
    performingLab: string | null;
    specimenType: string | null;
    confidence: number;
    sourceLocation: {
      page: number;
      coordinates: { x: number; y: number; width: number; height: number; } | null;
    };
  }[];
  
  // Procedures
  procedures: {
    name: string;
    cptCode: string | null;
    snomedCode: string | null;
    date: string | null;
    provider: string | null;
    facility: string | null;
    outcome: string | null;
    complications: string | null;
    notes: string | null;
    confidence: number;
    sourceLocation: {
      page: number;
      coordinates: { x: number; y: number; width: number; height: number; } | null;
    };
  }[];
  
  // Allergies
  allergies: {
    allergen: string;
    allergenType: 'medication' | 'food' | 'environmental' | 'other';
    reaction: string;
    severity: 'mild' | 'moderate' | 'severe' | 'life_threatening';
    onsetDate: string | null;
    notes: string | null;
    confidence: number;
    sourceLocation: {
      page: number;
      coordinates: { x: number; y: number; width: number; height: number; } | null;
    };
  }[];
  
  // Vital signs
  vitals: {
    type: 'blood_pressure' | 'heart_rate' | 'temperature' | 'respiratory_rate' | 
          'oxygen_saturation' | 'weight' | 'height' | 'bmi' | 'pain_scale';
    value: {
      systolic: number | null; // for blood pressure
      diastolic: number | null; // for blood pressure
      numeric: number | null;  // for single-value vitals
      text: string;
      unit: string;
    };
    measuredDate: string | null;
    measuredBy: string | null;
    notes: string | null;
    confidence: number;
    sourceLocation: {
      page: number;
      coordinates: { x: number; y: number; width: number; height: number; } | null;
    };
  }[];
  
  // Immunizations
  immunizations: {
    vaccine: string;
    vaccineCode: string | null; // CVX code if available
    manufacturer: string | null;
    lotNumber: string | null;
    administrationDate: string | null;
    route: string | null;
    site: string | null;
    provider: string | null;
    facility: string | null;
    nextDueDate: string | null;
    confidence: number;
    sourceLocation: {
      page: number;
      coordinates: { x: number; y: number; width: number; height: number; } | null;
    };
  }[];
}
```

### **Quality Metrics**
```typescript
interface QualityMetrics {
  // Overall extraction confidence
  overallConfidence: number; // 0-1, aggregate confidence score
  
  // AI vs OCR validation
  aiOcrAgreement: {
    textMatchScore: number; // 0-1, how well AI extraction matches OCR text
    keyDataPointsValidated: number; // count of critical data validated by OCR
    conflictingExtractions: string[]; // list of fields where AI and OCR disagreed
  } | null; // null if OCR not used
  
  // Completeness assessment
  completeness: {
    documentsExpectedFields: number; // total fields expected for this document type
    fieldsExtracted: number; // fields successfully extracted
    completenessScore: number; // 0-1, fieldsExtracted / documentsExpectedFields
    missingCriticalFields: string[]; // critical fields not found
  };
  
  // Medical accuracy flags
  medicalValidation: {
    dosageRangesValid: boolean; // medication dosages within therapeutic ranges
    temporalConsistency: boolean; // dates make logical sense
    terminologyValid: boolean; // medical terms properly recognized
    duplicatesDetected: string[]; // detected duplicate extractions
    safetyConcerns: string[]; // potential safety issues identified
  };
  
  // Review recommendation
  humanReviewRecommendation: {
    required: boolean;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    reasons: string[];
    suggestedReviewType: 'standard' | 'clinical' | 'pharmacist' | 'specialist';
  };
}
```

### **Processing Provenance**
```typescript
interface ProcessingProvenance {
  // AI processing details
  aiProcessing: {
    provider: 'gpt4o-mini' | 'azure-openai' | 'google-document-ai' | 'claude-sonnet' | 'gemini-pro';
    model: string; // specific model version
    apiVersion: string;
    processingStrategy: 'ai_only' | 'ai_ocr_validated' | 'ai_ocr_fused' | 'ocr_fallback';
    processingTimeMs: number;
    costUsd: number;
    confidence: number | null;
  };
  
  // OCR processing details (if used)
  ocrProcessing: {
    provider: 'google-cloud-vision' | 'aws-textract' | 'azure-document-intelligence';
    processingTimeMs: number;
    costUsd: number;
    confidence: number | null;
    fullText: string; // complete OCR text for search indexing
  } | null;
  
  // Session tracking
  processingSession: {
    sessionId: string; // maps to ai_processing_sessions.id
    documentId: string;
    profileId: string | null;
    patientId: string;
    timestamp: string; // ISO 8601 timestamp
    userAgent: string | null;
    ipAddress: string | null; // for audit compliance
  };
  
  // Quality assurance
  qualityChecks: {
    checksPerformed: string[]; // list of validation checks run
    flagsRaised: {
      flagType: string;
      severity: 'info' | 'warning' | 'error' | 'critical';
      message: string;
      autoResolvable: boolean;
    }[];
    reviewRequired: boolean;
  };
}
```

---

## **Integration with Database Normalization Pipeline**

### **Handover Process**
1. **AI Processing Completes** → Produces standardized JSON
2. **JSON Validation** → Ensures schema compliance
3. **Profile Resolution** → Determines target profile/patient
4. **Database Normalization** → Existing 47-table pipeline processes JSON
5. **Frontend Display** → Normalized data appears in dashboard

### **Database Storage Mapping**
```typescript
// JSON → Database Table Mapping
const NORMALIZATION_MAPPING = {
  // Core document tracking
  'documentMetadata' → 'documents' table,
  'processingProvenance.processingSession' → 'ai_processing_sessions' table,
  
  // Clinical data normalization (existing pipeline)
  'medicalData.medications' → 'patient_medications' table,
  'medicalData.conditions' → 'patient_conditions' table, 
  'medicalData.labResults' → 'patient_lab_results' table,
  'medicalData.procedures' → 'patient_procedures' table,
  'medicalData.allergies' → 'patient_allergies' table,
  'medicalData.vitals' → 'patient_vitals' table,
  'medicalData.immunizations' → 'patient_immunizations' table,
  
  // Quality and audit
  'qualityMetrics' → 'quality_flags' audit entries,
  'processingProvenance.qualityChecks' → 'audit_log' entries
};
```

### **Profile Resolution Logic**
```typescript
interface ProfileResolution {
  // Automatic matching
  automaticMatch: {
    profileId: string | null;
    confidence: number;
    matchingFactors: ('name' | 'dob' | 'mrn' | 'insurance')[];
  };
  
  // User selection required
  userSelectionRequired: {
    required: boolean;
    candidateProfiles: {
      profileId: string;
      displayName: string;
      matchScore: number;
      matchingFactors: string[];
    }[];
    defaultSelection: string | null;
  };
  
  // New profile creation
  newProfileSuggestion: {
    suggested: boolean;
    extractedName: string;
    extractedDob: string | null;
    reason: string;
  };
}
```

---

## **Validation & Error Handling**

### **JSON Schema Validation**
```typescript
// Runtime validation ensures data integrity
const validateExtractionResult = (json: any): GuardianAIExtractionResult => {
  // Validate schema compliance
  // Ensure required fields present
  // Validate data types and ranges
  // Check confidence score validity (0-1)
  // Verify date format compliance (ISO 8601)
  // Return validated, typed object
};
```

### **Error Scenarios**
1. **Invalid JSON Structure** → Schema validation failure
2. **Missing Critical Fields** → Trigger human review
3. **Low Confidence Scores** → Queue for review workflow
4. **Profile Match Ambiguity** → Present user selection interface
5. **Medical Safety Flags** → Escalate to clinical review

---

## **Example JSON Output**

```json
{
  "documentMetadata": {
    "documentType": "lab_results",
    "documentDate": "2025-08-15",
    "serviceDate": "2025-08-14",
    "documentSource": {
      "facilityName": "City Medical Laboratory",
      "providerName": "Dr. Sarah Johnson",
      "address": "123 Medical Center Dr, Sydney NSW 2000",
      "phone": "(02) 9555-0123"
    },
    "pageCount": 2,
    "originalFilename": "lab_results_2025_08_15.pdf"
  },
  "patientIdentification": {
    "patientName": {
      "full": "John David Smith",
      "first": "John",
      "last": "Smith", 
      "middle": "David",
      "confidence": 0.98
    },
    "dateOfBirth": {
      "value": "1985-03-22",
      "confidence": 0.95
    },
    "medicalRecordNumber": {
      "value": "MRN123456",
      "facility": "City Medical Laboratory",
      "confidence": 0.92
    },
    "profileMatchingHints": {
      "likelyProfileId": "profile_uuid_abc123",
      "alternativeMatches": [],
      "requiresUserSelection": false,
      "confidence": 0.94
    }
  },
  "medicalData": {
    "medications": [],
    "conditions": [],
    "labResults": [
      {
        "testName": "Total Cholesterol",
        "testCode": "2093-3",
        "value": {
          "numeric": 185,
          "text": "185",
          "unit": "mg/dL"
        },
        "referenceRange": {
          "low": null,
          "high": 200,
          "unit": "mg/dL",
          "text": "<200 mg/dL"
        },
        "abnormalFlag": false,
        "criticalFlag": false,
        "testDate": "2025-08-14",
        "orderingProvider": "Dr. Sarah Johnson",
        "confidence": 0.96,
        "sourceLocation": {
          "page": 1,
          "coordinates": { "x": 120, "y": 350, "width": 200, "height": 25 }
        }
      }
    ],
    "procedures": [],
    "allergies": [],
    "vitals": [],
    "immunizations": []
  },
  "qualityMetrics": {
    "overallConfidence": 0.94,
    "aiOcrAgreement": {
      "textMatchScore": 0.97,
      "keyDataPointsValidated": 8,
      "conflictingExtractions": []
    },
    "completeness": {
      "documentsExpectedFields": 10,
      "fieldsExtracted": 8,
      "completenessScore": 0.80,
      "missingCriticalFields": ["patient_address"]
    },
    "medicalValidation": {
      "dosageRangesValid": true,
      "temporalConsistency": true,
      "terminologyValid": true,
      "duplicatesDetected": [],
      "safetyConcerns": []
    },
    "humanReviewRecommendation": {
      "required": false,
      "priority": "low",
      "reasons": [],
      "suggestedReviewType": "standard"
    }
  },
  "processingProvenance": {
    "aiProcessing": {
      "provider": "gpt4o-mini",
      "model": "gpt-4o-mini-2024-07-18",
      "apiVersion": "2024-07-01-preview",
      "processingStrategy": "ai_ocr_validated",
      "processingTimeMs": 3450,
      "costUsd": 0.023,
      "confidence": 0.94
    },
    "ocrProcessing": {
      "provider": "google-cloud-vision",
      "processingTimeMs": 1200,
      "costUsd": 0.0015,
      "confidence": 0.97,
      "fullText": "City Medical Laboratory\nPatient: John David Smith\nDOB: 03/22/1985\nMRN: MRN123456\n\nLab Results - Date: 08/14/2025\n\nTotal Cholesterol: 185 mg/dL (Ref: <200 mg/dL)\n..."
    },
    "processingSession": {
      "sessionId": "session_uuid_xyz789",
      "documentId": "doc_uuid_def456",
      "profileId": "profile_uuid_abc123",
      "patientId": "patient_uuid_ghi789",
      "timestamp": "2025-08-19T08:15:30.123Z",
      "userAgent": "Guardian/1.0 (Web)",
      "ipAddress": "203.123.45.67"
    },
    "qualityChecks": {
      "checksPerformed": ["name_similarity", "date_validation", "medical_terminology", "completeness_check"],
      "flagsRaised": [],
      "reviewRequired": false
    }
  }
}
```

---

## **Next Steps**

1. **✅ Schema Defined** - Standardized JSON format documented
2. **🔄 Implementation** - Update existing Edge Function to output this format
3. **🔄 Testing** - Validate JSON against database normalization pipeline
4. **🔄 Integration** - Connect AI extraction → JSON → Dashboard display

This standardized format ensures clean separation between AI processing and your existing normalization infrastructure while maintaining full audit compliance and medical accuracy.