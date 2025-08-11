/**
 * AI Model Output Validation Tool
 * 
 * This utility validates the accuracy and completeness of AI-extracted medical data
 * before it gets normalized into relational tables. Ensures data quality meets
 * medical accuracy standards (>98% for critical information).
 * 
 * Usage:
 * - Manual validation during development
 * - Automated quality checks in production
 * - Data integrity verification before normalization
 */

export interface MedicalData {
  documentType?: string;
  patientInfo?: {
    name?: string | null;
    dateOfBirth?: string | null;
    mrn?: string | null;
    insuranceId?: string | null;
  };
  medicalData?: {
    medications?: Array<{name: string, dosage: string, frequency: string}>;
    allergies?: Array<{allergen: string, severity: string}>;
    labResults?: Array<{test: string, value: string, unit: string, reference: string}>;
    conditions?: Array<{condition: string, status: string}>;
    vitals?: {bloodPressure?: string, heartRate?: string, temperature?: string};
    procedures?: Array<{procedure: string, date: string}>;
  };
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
    overall?: number;
    ocrMatch?: number;
    extraction?: number;
  };
  notes?: string;
}

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  criticalIssues: string[];
  warnings: string[];
  qualityScore: number; // 0-100
  fieldCompleteness: {
    patientInfo: number;
    medicalData: number;
    provider: number;
    dates: number;
  };
  medicalAccuracy: {
    medicationsValid: boolean;
    allergiesValid: boolean;
    vitalsValid: boolean;
    labResultsValid: boolean;
    datesValid: boolean;
  };
  recommendations: string[];
}

export class AIOutputValidator {
  
  /**
   * Main validation function - validates AI-extracted medical data
   */
  static validateMedicalData(
    medicalData: MedicalData,
    ocrText: string,
    documentId: string
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      confidence: 0,
      criticalIssues: [],
      warnings: [],
      qualityScore: 100,
      fieldCompleteness: {
        patientInfo: 0,
        medicalData: 0,
        provider: 0,
        dates: 0
      },
      medicalAccuracy: {
        medicationsValid: true,
        allergiesValid: true,
        vitalsValid: true,
        labResultsValid: true,
        datesValid: true
      },
      recommendations: []
    };

    try {
      // 1. Structure validation
      this.validateStructure(medicalData, result);
      
      // 2. Confidence validation
      this.validateConfidence(medicalData, result);
      
      // 3. Medical data accuracy validation
      this.validateMedicalAccuracy(medicalData, result);
      
      // 4. Field completeness analysis
      this.analyzeCompleteness(medicalData, result);
      
      // 5. OCR cross-validation
      this.crossValidateWithOCR(medicalData, ocrText, result);
      
      // 6. Calculate overall quality score
      this.calculateQualityScore(result);
      
      // 7. Final validation decision
      result.isValid = result.criticalIssues.length === 0 && result.qualityScore >= 80;
      
    } catch (error) {
      result.isValid = false;
      result.criticalIssues.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
      result.qualityScore = 0;
    }

    return result;
  }

  /**
   * Validates the basic structure of medical data
   */
  private static validateStructure(medicalData: MedicalData, result: ValidationResult): void {
    if (!medicalData || typeof medicalData !== 'object') {
      result.criticalIssues.push('Medical data is null, undefined, or not an object');
      return;
    }

    // Required fields validation
    if (!medicalData.documentType) {
      result.warnings.push('Document type is missing - affects categorization');
    }

    // Valid document types
    const validDocTypes = ['lab_results', 'prescription', 'medical_record', 'insurance_card', 'discharge_summary'];
    if (medicalData.documentType && !validDocTypes.includes(medicalData.documentType)) {
      result.warnings.push(`Unknown document type: ${medicalData.documentType}`);
    }

    // Medical data section validation
    if (!medicalData.medicalData || Object.keys(medicalData.medicalData).length === 0) {
      result.criticalIssues.push('No medical data extracted - document may not contain medical information');
    }
  }

  /**
   * Validates confidence scores and thresholds
   */
  private static validateConfidence(medicalData: MedicalData, result: ValidationResult): void {
    const confidence = medicalData.confidence;
    
    if (!confidence) {
      result.warnings.push('No confidence scores provided by AI model');
      return;
    }

    result.confidence = confidence.overall || 0;

    // Critical confidence thresholds for medical accuracy
    if (confidence.overall && confidence.overall < 0.8) {
      result.criticalIssues.push(`Overall confidence too low: ${(confidence.overall * 100).toFixed(1)}% (minimum 80% required)`);
    }

    if (confidence.extraction && confidence.extraction < 0.85) {
      result.warnings.push(`Extraction confidence below recommended threshold: ${(confidence.extraction * 100).toFixed(1)}% (recommended >85%)`);
    }

    if (confidence.ocrMatch && confidence.ocrMatch < 0.9) {
      result.warnings.push(`OCR match confidence low: ${(confidence.ocrMatch * 100).toFixed(1)}% (may indicate OCR-vision discrepancies)`);
    }
  }

  /**
   * Validates medical data accuracy and format
   */
  private static validateMedicalAccuracy(medicalData: MedicalData, result: ValidationResult): void {
    const medical = medicalData.medicalData;
    if (!medical) return;

    // Medication validation
    if (medical.medications) {
      for (const med of medical.medications) {
        if (!med.name || med.name.trim().length === 0) {
          result.criticalIssues.push('Medication found with missing or empty name');
          result.medicalAccuracy.medicationsValid = false;
        }
        
        // Dosage format validation
        if (med.dosage && !this.isValidDosage(med.dosage)) {
          result.warnings.push(`Potentially invalid dosage format: ${med.dosage}`);
        }
        
        // Frequency validation
        if (med.frequency && !this.isValidFrequency(med.frequency)) {
          result.warnings.push(`Potentially invalid frequency format: ${med.frequency}`);
        }
      }
    }

    // Allergy validation (critical for patient safety)
    if (medical.allergies) {
      for (const allergy of medical.allergies) {
        if (!allergy.allergen || allergy.allergen.trim().length === 0) {
          result.criticalIssues.push('Allergy found with missing allergen name - critical safety issue');
          result.medicalAccuracy.allergiesValid = false;
        }
        
        // Severity validation
        const validSeverities = ['mild', 'moderate', 'severe', 'life-threatening', 'unknown'];
        if (allergy.severity && !validSeverities.includes(allergy.severity.toLowerCase())) {
          result.warnings.push(`Non-standard allergy severity: ${allergy.severity}`);
        }
      }
    }

    // Vital signs validation
    if (medical.vitals) {
      if (medical.vitals.bloodPressure && !this.isValidBloodPressure(medical.vitals.bloodPressure)) {
        result.warnings.push(`Invalid blood pressure format: ${medical.vitals.bloodPressure}`);
        result.medicalAccuracy.vitalsValid = false;
      }
      
      if (medical.vitals.heartRate && !this.isValidHeartRate(medical.vitals.heartRate)) {
        result.warnings.push(`Invalid heart rate format: ${medical.vitals.heartRate}`);
        result.medicalAccuracy.vitalsValid = false;
      }
    }

    // Lab results validation
    if (medical.labResults) {
      for (const lab of medical.labResults) {
        if (!lab.test || !lab.value) {
          result.criticalIssues.push('Lab result missing test name or value');
          result.medicalAccuracy.labResultsValid = false;
        }
        
        if (lab.value && !this.isValidLabValue(lab.value)) {
          result.warnings.push(`Potentially invalid lab value format: ${lab.value}`);
        }
      }
    }

    // Date validation
    if (medicalData.dates) {
      if (medicalData.dates.documentDate && !this.isValidDate(medicalData.dates.documentDate)) {
        result.warnings.push(`Invalid document date format: ${medicalData.dates.documentDate}`);
        result.medicalAccuracy.datesValid = false;
      }
      
      if (medicalData.dates.serviceDate && !this.isValidDate(medicalData.dates.serviceDate)) {
        result.warnings.push(`Invalid service date format: ${medicalData.dates.serviceDate}`);
        result.medicalAccuracy.datesValid = false;
      }
    }
  }

  /**
   * Analyzes field completeness
   */
  private static analyzeCompleteness(medicalData: MedicalData, result: ValidationResult): void {
    // Patient info completeness
    const patientFields = ['name', 'dateOfBirth', 'mrn', 'insuranceId'];
    const patientComplete = patientFields.filter(field => 
      medicalData.patientInfo?.[field as keyof typeof medicalData.patientInfo]
    ).length;
    result.fieldCompleteness.patientInfo = (patientComplete / patientFields.length) * 100;

    // Medical data completeness
    const medicalFields = ['medications', 'allergies', 'labResults', 'conditions', 'vitals', 'procedures'];
    const medicalComplete = medicalFields.filter(field => 
      medicalData.medicalData?.[field as keyof typeof medicalData.medicalData]
    ).length;
    result.fieldCompleteness.medicalData = (medicalComplete / medicalFields.length) * 100;

    // Provider info completeness
    const providerFields = ['name', 'facility', 'phone'];
    const providerComplete = providerFields.filter(field => 
      medicalData.provider?.[field as keyof typeof medicalData.provider]
    ).length;
    result.fieldCompleteness.provider = (providerComplete / providerFields.length) * 100;

    // Date completeness
    const dateFields = ['documentDate', 'serviceDate'];
    const dateComplete = dateFields.filter(field => 
      medicalData.dates?.[field as keyof typeof medicalData.dates]
    ).length;
    result.fieldCompleteness.dates = (dateComplete / dateFields.length) * 100;

    // Recommendations based on completeness
    if (result.fieldCompleteness.patientInfo < 50) {
      result.recommendations.push('Consider improving patient information extraction');
    }
    if (result.fieldCompleteness.medicalData < 25) {
      result.recommendations.push('Low medical data extraction - verify document contains medical information');
    }
  }

  /**
   * Cross-validates extracted data with OCR text
   */
  private static crossValidateWithOCR(medicalData: MedicalData, ocrText: string, result: ValidationResult): void {
    if (!ocrText || ocrText.trim().length === 0) {
      result.warnings.push('No OCR text available for cross-validation');
      return;
    }

    const ocrLower = ocrText.toLowerCase();
    
    // Validate patient name appears in OCR
    if (medicalData.patientInfo?.name) {
      const nameWords = medicalData.patientInfo.name.toLowerCase().split(' ');
      const nameFoundInOCR = nameWords.some(word => word.length > 2 && ocrLower.includes(word));
      
      if (!nameFoundInOCR) {
        result.warnings.push(`Patient name "${medicalData.patientInfo.name}" not found in OCR text - may be inaccurate`);
      }
    }

    // Validate medications appear in OCR
    if (medicalData.medicalData?.medications) {
      for (const med of medicalData.medicalData.medications) {
        const medNameLower = med.name.toLowerCase();
        if (!ocrLower.includes(medNameLower.substring(0, Math.min(medNameLower.length, 6)))) {
          result.warnings.push(`Medication "${med.name}" not clearly found in OCR text`);
        }
      }
    }

    // Validate provider name appears in OCR
    if (medicalData.provider?.name) {
      const providerWords = medicalData.provider.name.toLowerCase().split(' ');
      const providerFoundInOCR = providerWords.some(word => word.length > 2 && ocrLower.includes(word));
      
      if (!providerFoundInOCR) {
        result.warnings.push(`Provider name "${medicalData.provider.name}" not found in OCR text`);
      }
    }
  }

  /**
   * Calculates overall quality score
   */
  private static calculateQualityScore(result: ValidationResult): void {
    let score = 100;

    // Deduct for critical issues (major impact)
    score -= result.criticalIssues.length * 25;

    // Deduct for warnings (minor impact)
    score -= result.warnings.length * 5;

    // Deduct for low confidence
    if (result.confidence > 0 && result.confidence < 0.9) {
      score -= (0.9 - result.confidence) * 20;
    }

    // Deduct for low completeness
    const avgCompleteness = (
      result.fieldCompleteness.patientInfo +
      result.fieldCompleteness.medicalData +
      result.fieldCompleteness.provider +
      result.fieldCompleteness.dates
    ) / 4;
    
    if (avgCompleteness < 50) {
      score -= (50 - avgCompleteness) * 0.5;
    }

    result.qualityScore = Math.max(0, Math.min(100, score));
  }

  // Validation helper methods
  private static isValidDosage(dosage: string): boolean {
    // Common dosage patterns: "10mg", "5 mg", "2.5mg", "1/2 tablet"
    return /^\d+(\.\d+)?(\s*)(mg|mcg|g|ml|tablet|capsule|unit|iu|tsp|tbsp)/i.test(dosage) ||
           /^\d+\/\d+(\s*)(tablet|capsule)/i.test(dosage);
  }

  private static isValidFrequency(frequency: string): boolean {
    // Common frequency patterns
    const validPatterns = [
      /daily/i, /once.*day/i, /twice.*day/i, /three.*times.*day/i,
      /every.*hours?/i, /bid/i, /tid/i, /qid/i, /q\d+h/i,
      /weekly/i, /monthly/i, /as.*needed/i, /prn/i
    ];
    return validPatterns.some(pattern => pattern.test(frequency));
  }

  private static isValidBloodPressure(bp: string): boolean {
    // Pattern: "120/80", "120/80 mmHg"
    return /^\d{2,3}\/\d{2,3}(\s*(mmhg|mm hg))?$/i.test(bp);
  }

  private static isValidHeartRate(hr: string): boolean {
    // Pattern: "72", "72 bpm"
    return /^\d{2,3}(\s*(bpm|beats.*min))?$/i.test(hr);
  }

  private static isValidLabValue(value: string): boolean {
    // Should contain numbers and potentially units
    return /\d/.test(value) && value.trim().length > 0;
  }

  private static isValidDate(dateStr: string): boolean {
    // ISO date format validation
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    
    const date = new Date(dateStr);
    return date.toString() !== 'Invalid Date' && 
           date.getFullYear() > 1900 && 
           date.getFullYear() <= new Date().getFullYear() + 1;
  }

  /**
   * Generate comprehensive validation report
   */
  static generateValidationReport(result: ValidationResult, documentId: string): string {
    const report = [
      `=== AI OUTPUT VALIDATION REPORT ===`,
      `Document ID: ${documentId}`,
      `Validation Status: ${result.isValid ? '✅ PASSED' : '❌ FAILED'}`,
      `Quality Score: ${result.qualityScore}/100`,
      `Overall Confidence: ${result.confidence > 0 ? (result.confidence * 100).toFixed(1) + '%' : 'Not provided'}`,
      '',
      '📊 FIELD COMPLETENESS:',
      `  Patient Info: ${result.fieldCompleteness.patientInfo.toFixed(1)}%`,
      `  Medical Data: ${result.fieldCompleteness.medicalData.toFixed(1)}%`,
      `  Provider Info: ${result.fieldCompleteness.provider.toFixed(1)}%`,
      `  Dates: ${result.fieldCompleteness.dates.toFixed(1)}%`,
      '',
      '🏥 MEDICAL ACCURACY:',
      `  Medications: ${result.medicalAccuracy.medicationsValid ? '✅' : '❌'}`,
      `  Allergies: ${result.medicalAccuracy.allergiesValid ? '✅' : '❌'}`,
      `  Vitals: ${result.medicalAccuracy.vitalsValid ? '✅' : '❌'}`,
      `  Lab Results: ${result.medicalAccuracy.labResultsValid ? '✅' : '❌'}`,
      `  Dates: ${result.medicalAccuracy.datesValid ? '✅' : '❌'}`,
    ];

    if (result.criticalIssues.length > 0) {
      report.push('', '🚨 CRITICAL ISSUES:');
      result.criticalIssues.forEach((issue, index) => {
        report.push(`  ${index + 1}. ${issue}`);
      });
    }

    if (result.warnings.length > 0) {
      report.push('', '⚠️  WARNINGS:');
      result.warnings.forEach((warning, index) => {
        report.push(`  ${index + 1}. ${warning}`);
      });
    }

    if (result.recommendations.length > 0) {
      report.push('', '💡 RECOMMENDATIONS:');
      result.recommendations.forEach((rec, index) => {
        report.push(`  ${index + 1}. ${rec}`);
      });
    }

    return report.join('\n');
  }
}

/**
 * Batch validation utility for multiple documents
 */
export class BatchValidator {
  static async validateDocuments(documentIds: string[]): Promise<{
    overallStats: {
      totalDocuments: number;
      validDocuments: number;
      averageQuality: number;
      averageConfidence: number;
    };
    individualResults: Array<{
      documentId: string;
      result: ValidationResult;
    }>;
    recommendations: string[];
  }> {
    // Implementation would fetch documents from database and validate each
    // This is a placeholder for the batch validation structure
    throw new Error('Batch validation not yet implemented - requires database integration');
  }
}