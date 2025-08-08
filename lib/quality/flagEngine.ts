/**
 * Quality Guardian Engine
 * 
 * Core flagging logic that extends existing contamination prevention system
 * Integrates with existing functions from multi-profile-management.md:
 * - check_document_profile_compatibility() 
 * - verify_document_before_processing()
 * - detect_profile_from_document()
 */

import { createClient } from '@supabase/supabase-js';

// Types for extracted medical data
interface ExtractedData {
  patient_info?: {
    name?: string;
    date_of_birth?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  appointments?: Array<{
    date: string;
    provider: string;
    type: string;
    location?: string;
  }>;
  medications?: Array<{
    name: string;
    dosage?: string;
    frequency?: string;
    prescribed_date?: string;
  }>;
  lab_results?: Array<{
    test_name: string;
    value: string;
    unit?: string;
    reference_range?: string;
    date: string;
  }>;
  diagnoses?: Array<{
    condition: string;
    icd_code?: string;
    date?: string;
    provider?: string;
  }>;
  vitals?: Array<{
    type: string;
    value: string;
    unit?: string;
    date: string;
  }>;
}

interface Profile {
  profile_id: string;
  profile_type: 'self' | 'child' | 'pet' | 'dependent';
  display_name: string;
  date_of_birth?: string;
  relationship_type?: string;
  species?: string; // For pets
  created_at: string;
}

export interface DataQualityFlag {
  flag_id?: string;
  profile_id: string;
  document_id: string;
  record_table: string;
  record_id?: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'temporal' | 'demographic' | 'clinical' | 'profile_mismatch' | 'extraction_quality';
  problem_code: string;
  field_name?: string;
  raw_value?: any;
  suggested_correction?: any;
  confidence_score: number;
  auto_resolvable: boolean;
  explanation: string; // Human-readable explanation
  resolution_options: ResolutionOption[];
}

interface ResolutionOption {
  action: 'confirm' | 'edit' | 'delete' | 'merge' | 'ignore';
  label: string;
  description: string;
  suggested_value?: any;
  confidence?: number;
}

interface ValidationRule {
  name: string;
  category: DataQualityFlag['category'];
  severity: DataQualityFlag['severity'];
  confidence_threshold: number;
  enabled: boolean;
}

export class QualityGuardianEngine {
  private supabase;
  private validationRules: ValidationRule[];

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.validationRules = this.initializeValidationRules();
  }

  private initializeValidationRules(): ValidationRule[] {
    return [
      // Temporal validation rules
      { name: 'future_date_check', category: 'temporal', severity: 'warning', confidence_threshold: 0.8, enabled: true },
      { name: 'ancient_date_check', category: 'temporal', severity: 'warning', confidence_threshold: 0.7, enabled: true },
      { name: 'appointment_weekend_check', category: 'temporal', severity: 'info', confidence_threshold: 0.6, enabled: true },
      { name: 'birth_date_consistency', category: 'temporal', severity: 'critical', confidence_threshold: 0.9, enabled: true },
      
      // Demographic validation rules
      { name: 'name_similarity_check', category: 'demographic', severity: 'critical', confidence_threshold: 0.8, enabled: true },
      { name: 'age_consistency_check', category: 'demographic', severity: 'warning', confidence_threshold: 0.7, enabled: true },
      { name: 'contact_format_check', category: 'demographic', severity: 'info', confidence_threshold: 0.6, enabled: true },
      
      // Clinical validation rules
      { name: 'age_appropriate_condition', category: 'clinical', severity: 'warning', confidence_threshold: 0.7, enabled: true },
      { name: 'gender_specific_condition', category: 'clinical', severity: 'warning', confidence_threshold: 0.8, enabled: true },
      { name: 'species_appropriate_condition', category: 'clinical', severity: 'critical', confidence_threshold: 0.9, enabled: true },
      { name: 'impossible_vital_ranges', category: 'clinical', severity: 'warning', confidence_threshold: 0.8, enabled: true },
      
      // Profile matching rules
      { name: 'profile_demographic_mismatch', category: 'profile_mismatch', severity: 'critical', confidence_threshold: 0.8, enabled: true },
      { name: 'provider_specialty_mismatch', category: 'profile_mismatch', severity: 'warning', confidence_threshold: 0.6, enabled: true },
      
      // Extraction quality rules
      { name: 'low_ocr_confidence', category: 'extraction_quality', severity: 'info', confidence_threshold: 0.5, enabled: true },
      { name: 'incomplete_extraction', category: 'extraction_quality', severity: 'warning', confidence_threshold: 0.6, enabled: true },
      { name: 'conflicting_data_points', category: 'extraction_quality', severity: 'warning', confidence_threshold: 0.7, enabled: true }
    ];
  }

  /**
   * Main entry point for quality checking
   * Extends existing contamination prevention system
   */
  async checkDataQuality(
    extractedData: ExtractedData,
    documentId: string,
    profileId: string,
    profile: Profile
  ): Promise<DataQualityFlag[]> {
    const flags: DataQualityFlag[] = [];

    // Run all validation checks
    flags.push(...await this.checkTemporalFlags(extractedData, documentId, profileId, profile));
    flags.push(...await this.checkDemographicFlags(extractedData, documentId, profileId, profile));
    flags.push(...await this.checkClinicalFlags(extractedData, documentId, profileId, profile));
    flags.push(...await this.checkProfileMatchingFlags(extractedData, documentId, profileId, profile));
    flags.push(...await this.checkExtractionQualityFlags(extractedData, documentId, profileId, profile));

    // Filter flags based on confidence thresholds and enabled rules
    const filteredFlags = flags.filter(flag => {
      const rule = this.validationRules.find(r => r.name === flag.problem_code);
      return rule?.enabled && flag.confidence_score >= rule.confidence_threshold;
    });

    // Sort by severity (critical first, then warning, then info)
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    filteredFlags.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return filteredFlags;
  }

  /**
   * Temporal validation - extends existing temporal validation from contamination prevention
   */
  async checkTemporalFlags(
    data: ExtractedData,
    documentId: string,
    profileId: string,
    profile: Profile
  ): Promise<DataQualityFlag[]> {
    const flags: DataQualityFlag[] = [];
    const currentDate = new Date();
    const profileBirthDate = profile.date_of_birth ? new Date(profile.date_of_birth) : null;

    // Check appointments for future dates
    if (data.appointments) {
      for (const appointment of data.appointments) {
        const appointmentDate = new Date(appointment.date);
        
        // Future date check (beyond reasonable scheduling window)
        const monthsAhead = (appointmentDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
        if (monthsAhead > 12) {
          flags.push({
            profile_id: profileId,
            document_id: documentId,
            record_table: 'appointments',
            severity: 'warning',
            category: 'temporal',
            problem_code: 'future_date_check',
            field_name: 'date',
            raw_value: appointment.date,
            suggested_correction: this.suggestDateCorrection(appointment.date),
            confidence_score: 0.85,
            auto_resolvable: false,
            explanation: `Appointment date "${appointment.date}" is more than a year in the future. This might be a typo or OCR error.`,
            resolution_options: [
              { action: 'confirm', label: 'Keep as is', description: 'This date is correct' },
              { action: 'edit', label: 'Change date', description: 'Enter the correct date' },
              { action: 'delete', label: 'Remove appointment', description: 'This appointment was extracted in error' }
            ]
          });
        }

        // Ancient date check (before birth or unreasonably old)
        if (profileBirthDate && appointmentDate < profileBirthDate) {
          flags.push({
            profile_id: profileId,
            document_id: documentId,
            record_table: 'appointments',
            severity: 'critical',
            category: 'temporal',
            problem_code: 'birth_date_consistency',
            field_name: 'date',
            raw_value: appointment.date,
            suggested_correction: null,
            confidence_score: 0.95,
            auto_resolvable: false,
            explanation: `Appointment date "${appointment.date}" is before the profile birth date. This needs correction.`,
            resolution_options: [
              { action: 'edit', label: 'Correct date', description: 'Enter the correct appointment date' },
              { action: 'delete', label: 'Remove appointment', description: 'This appointment was extracted in error' }
            ]
          });
        }
      }
    }

    // Check lab results for temporal consistency
    if (data.lab_results) {
      for (const result of data.lab_results) {
        const resultDate = new Date(result.date);
        
        if (resultDate > currentDate) {
          const daysAhead = Math.ceil((resultDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
          flags.push({
            profile_id: profileId,
            document_id: documentId,
            record_table: 'lab_results',
            severity: daysAhead > 30 ? 'warning' : 'info',
            category: 'temporal',
            problem_code: 'future_date_check',
            field_name: 'date',
            raw_value: result.date,
            suggested_correction: this.suggestDateCorrection(result.date),
            confidence_score: 0.8,
            auto_resolvable: daysAhead <= 7, // Auto-resolvable if just a few days ahead
            explanation: `Lab result date "${result.date}" is in the future. This might be an OCR error.`,
            resolution_options: [
              { action: 'confirm', label: 'Keep as is', description: 'This is a scheduled/future test' },
              { action: 'edit', label: 'Change date', description: 'Enter the correct test date' },
              { action: 'delete', label: 'Remove result', description: 'This result was extracted in error' }
            ]
          });
        }
      }
    }

    return flags;
  }

  /**
   * Demographic validation - name, age, contact consistency
   */
  async checkDemographicFlags(
    data: ExtractedData,
    documentId: string,
    profileId: string,
    profile: Profile
  ): Promise<DataQualityFlag[]> {
    const flags: DataQualityFlag[] = [];

    if (data.patient_info) {
      const patientInfo = data.patient_info;

      // Name similarity check (extends existing contamination prevention)
      if (patientInfo.name && profile.display_name) {
        const similarity = this.calculateNameSimilarity(patientInfo.name, profile.display_name);
        if (similarity < 0.6) {
          flags.push({
            profile_id: profileId,
            document_id: documentId,
            record_table: 'patient_demographics',
            severity: 'critical',
            category: 'demographic',
            problem_code: 'name_similarity_check',
            field_name: 'name',
            raw_value: patientInfo.name,
            suggested_correction: profile.display_name,
            confidence_score: 1 - similarity,
            auto_resolvable: false,
            explanation: `Document name "${patientInfo.name}" doesn't match profile name "${profile.display_name}". This might be the wrong profile or an OCR error.`,
            resolution_options: [
              { action: 'confirm', label: 'Different person', description: 'Create new profile for this document' },
              { action: 'edit', label: 'OCR error', description: 'This is the same person, fix the extraction' },
              { action: 'ignore', label: 'Nickname/variation', description: 'This is an acceptable name variation' }
            ]
          });
        }
      }

      // Age consistency check
      if (patientInfo.date_of_birth && profile.date_of_birth) {
        const extractedAge = this.calculateAge(new Date(patientInfo.date_of_birth));
        const profileAge = this.calculateAge(new Date(profile.date_of_birth));
        
        if (Math.abs(extractedAge - profileAge) > 1) {
          flags.push({
            profile_id: profileId,
            document_id: documentId,
            record_table: 'patient_demographics',
            severity: 'warning',
            category: 'demographic',
            problem_code: 'age_consistency_check',
            field_name: 'date_of_birth',
            raw_value: patientInfo.date_of_birth,
            suggested_correction: profile.date_of_birth,
            confidence_score: 0.8,
            auto_resolvable: false,
            explanation: `Document birth date suggests age ${extractedAge}, but profile age is ${profileAge}. Please verify.`,
            resolution_options: [
              { action: 'confirm', label: 'Update profile', description: 'Update profile with document birth date' },
              { action: 'edit', label: 'Fix extraction', description: 'Correct the extracted birth date' },
              { action: 'ignore', label: 'Keep both', description: 'Both dates are valid for different purposes' }
            ]
          });
        }
      }

      // Contact format validation
      if (patientInfo.phone && !this.isValidPhoneFormat(patientInfo.phone)) {
        flags.push({
          profile_id: profileId,
          document_id: documentId,
          record_table: 'patient_demographics',
          severity: 'info',
          category: 'demographic',
          problem_code: 'contact_format_check',
          field_name: 'phone',
          raw_value: patientInfo.phone,
          suggested_correction: this.formatPhoneNumber(patientInfo.phone),
          confidence_score: 0.7,
          auto_resolvable: true,
          explanation: `Phone number "${patientInfo.phone}" format looks unusual. Consider reformatting.`,
          resolution_options: [
            { action: 'confirm', label: 'Keep as is', description: 'This format is correct' },
            { action: 'edit', label: 'Reformat', description: 'Apply standard formatting', suggested_value: this.formatPhoneNumber(patientInfo.phone) }
          ]
        });
      }
    }

    return flags;
  }

  /**
   * Clinical validation - age-appropriate conditions, impossible values
   */
  async checkClinicalFlags(
    data: ExtractedData,
    documentId: string,
    profileId: string,
    profile: Profile
  ): Promise<DataQualityFlag[]> {
    const flags: DataQualityFlag[] = [];
    const profileAge = profile.date_of_birth ? this.calculateAge(new Date(profile.date_of_birth)) : null;

    // Check diagnoses for age appropriateness
    if (data.diagnoses && profileAge !== null) {
      for (const diagnosis of data.diagnoses) {
        const ageAppropriate = this.isAgeAppropriateCondition(diagnosis.condition, profileAge, profile.profile_type);
        
        if (!ageAppropriate.appropriate) {
          flags.push({
            profile_id: profileId,
            document_id: documentId,
            record_table: 'diagnoses',
            severity: ageAppropriate.severity as 'warning' | 'info',
            category: 'clinical',
            problem_code: 'age_appropriate_condition',
            field_name: 'condition',
            raw_value: diagnosis.condition,
            suggested_correction: null,
            confidence_score: ageAppropriate.confidence,
            auto_resolvable: false,
            explanation: ageAppropriate.explanation,
            resolution_options: [
              { action: 'confirm', label: 'Condition is correct', description: 'This diagnosis is accurate despite being unusual for this age' },
              { action: 'edit', label: 'Correct condition', description: 'Fix the extracted condition name' },
              { action: 'delete', label: 'Remove condition', description: 'This was extracted in error' }
            ]
          });
        }
      }
    }

    // Check vitals for impossible ranges
    if (data.vitals) {
      for (const vital of data.vitals) {
        const vitalCheck = this.checkVitalRanges(vital.type, vital.value, profileAge, profile.profile_type);
        
        if (!vitalCheck.valid) {
          flags.push({
            profile_id: profileId,
            document_id: documentId,
            record_table: 'vitals',
            severity: vitalCheck.severity as 'warning' | 'info',
            category: 'clinical',
            problem_code: 'impossible_vital_ranges',
            field_name: 'value',
            raw_value: vital.value,
            suggested_correction: vitalCheck.suggested_range,
            confidence_score: vitalCheck.confidence,
            auto_resolvable: false,
            explanation: vitalCheck.explanation,
            resolution_options: [
              { action: 'confirm', label: 'Value is correct', description: 'This measurement is accurate' },
              { action: 'edit', label: 'Correct value', description: 'Fix the extracted measurement' },
              { action: 'delete', label: 'Remove measurement', description: 'This was extracted in error' }
            ]
          });
        }
      }
    }

    // Species-specific checks for pets
    if (profile.profile_type === 'pet' && profile.species) {
      flags.push(...await this.checkSpeciesAppropriate(data, documentId, profileId, profile));
    }

    return flags;
  }

  /**
   * Profile matching validation - extends existing profile detection
   */
  async checkProfileMatchingFlags(
    data: ExtractedData,
    documentId: string,
    profileId: string,
    profile: Profile
  ): Promise<DataQualityFlag[]> {
    const flags: DataQualityFlag[] = [];

    // Check if document content suggests different profile type
    const suggestedProfileType = this.detectProfileTypeFromContent(data);
    
    if (suggestedProfileType && suggestedProfileType !== profile.profile_type) {
      let severity: 'critical' | 'warning' = 'warning';
      let confidence = 0.7;

      // Higher severity for human vs pet mismatch
      if ((profile.profile_type === 'pet' && ['self', 'child'].includes(suggestedProfileType)) ||
          (['self', 'child'].includes(profile.profile_type) && suggestedProfileType === 'pet')) {
        severity = 'critical';
        confidence = 0.9;
      }

      flags.push({
        profile_id: profileId,
        document_id: documentId,
        record_table: 'documents',
        severity,
        category: 'profile_mismatch',
        problem_code: 'profile_demographic_mismatch',
        field_name: 'profile_assignment',
        raw_value: profile.profile_type,
        suggested_correction: suggestedProfileType,
        confidence_score: confidence,
        auto_resolvable: false,
        explanation: `Document content suggests this belongs to a ${suggestedProfileType} profile, but it's assigned to a ${profile.profile_type} profile.`,
        resolution_options: [
          { action: 'confirm', label: 'Keep current profile', description: 'This document belongs to the current profile' },
          { action: 'edit', label: 'Move to correct profile', description: `Reassign to appropriate ${suggestedProfileType} profile` },
          { action: 'merge', label: 'Create new profile', description: `Create new ${suggestedProfileType} profile for this document` }
        ]
      });
    }

    return flags;
  }

  /**
   * Extraction quality validation - OCR confidence, completeness
   */
  async checkExtractionQualityFlags(
    data: ExtractedData,
    documentId: string,
    profileId: string,
    profile: Profile
  ): Promise<DataQualityFlag[]> {
    const flags: DataQualityFlag[] = [];

    // Check for incomplete extractions
    const completenessScore = this.calculateCompletenessScore(data);
    if (completenessScore < 0.5) {
      flags.push({
        profile_id: profileId,
        document_id: documentId,
        record_table: 'documents',
        severity: 'warning',
        category: 'extraction_quality',
        problem_code: 'incomplete_extraction',
        field_name: 'extraction_completeness',
        raw_value: completenessScore,
        suggested_correction: null,
        confidence_score: 0.8,
        auto_resolvable: false,
        explanation: `Document extraction appears incomplete (${Math.round(completenessScore * 100)}% complete). Consider re-processing.`,
        resolution_options: [
          { action: 'confirm', label: 'Extraction is complete', description: 'This document has limited information' },
          { action: 'edit', label: 'Re-process document', description: 'Try extracting again with different settings' },
          { action: 'ignore', label: 'Accept as is', description: 'Use this extraction despite incompleteness' }
        ]
      });
    }

    // Check for conflicting data points
    const conflicts = this.detectDataConflicts(data);
    for (const conflict of conflicts) {
      flags.push({
        profile_id: profileId,
        document_id: documentId,
        record_table: conflict.table,
        severity: 'warning',
        category: 'extraction_quality',
        problem_code: 'conflicting_data_points',
        field_name: conflict.field,
        raw_value: conflict.values,
        suggested_correction: null,
        confidence_score: 0.75,
        auto_resolvable: false,
        explanation: conflict.explanation,
        resolution_options: [
          { action: 'edit', label: 'Choose correct value', description: 'Select which value is accurate' },
          { action: 'merge', label: 'Merge values', description: 'Combine information from both values' },
          { action: 'delete', label: 'Remove conflicting data', description: 'Remove the incorrect information' }
        ]
      });
    }

    return flags;
  }

  // Helper methods for validation logic

  private suggestDateCorrection(dateString: string): string {
    // Common OCR mistakes: 2035 -> 2025, etc.
    const date = new Date(dateString);
    const currentYear = new Date().getFullYear();
    
    if (date.getFullYear() > currentYear + 5) {
      // Likely OCR mistake - suggest current decade
      const suggestedYear = currentYear;
      date.setFullYear(suggestedYear);
      return date.toISOString().split('T')[0];
    }
    
    return dateString;
  }

  private calculateNameSimilarity(name1: string, name2: string): number {
    // Simple Levenshtein distance-based similarity
    const longer = name1.length > name2.length ? name1.toLowerCase() : name2.toLowerCase();
    const shorter = name1.length > name2.length ? name2.toLowerCase() : name1.toLowerCase();
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + substitutionCost
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private calculateAge(birthDate: Date): number {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  }

  private isValidPhoneFormat(phone: string): boolean {
    // Basic phone format validation
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(phone);
  }

  private formatPhoneNumber(phone: string): string {
    // Simple phone formatting
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return phone;
  }

  private isAgeAppropriateCondition(condition: string, age: number, profileType: string): {
    appropriate: boolean;
    severity: string;
    confidence: number;
    explanation: string;
  } {
    const lowerCondition = condition.toLowerCase();
    
    // Age-inappropriate conditions
    const pediatricOnlyConditions = ['colic', 'cradle cap', 'infant reflux'];
    const adultOnlyConditions = ['copd', 'alzheimer', 'osteoporosis', 'menopause'];
    const elderlyConditions = ['dementia', 'parkinson', 'heart failure'];
    
    if (age < 18 && adultOnlyConditions.some(c => lowerCondition.includes(c))) {
      return {
        appropriate: false,
        severity: 'warning',
        confidence: 0.8,
        explanation: `"${condition}" is unusual for someone age ${age}. Please verify this diagnosis.`
      };
    }
    
    if (age > 18 && pediatricOnlyConditions.some(c => lowerCondition.includes(c))) {
      return {
        appropriate: false,
        severity: 'warning',
        confidence: 0.7,
        explanation: `"${condition}" is typically seen in infants/children, not adults age ${age}.`
      };
    }
    
    if (age < 65 && elderlyConditions.some(c => lowerCondition.includes(c))) {
      return {
        appropriate: false,
        severity: 'info',
        confidence: 0.6,
        explanation: `"${condition}" is more common in elderly patients. Early onset at age ${age} should be noted.`
      };
    }
    
    return { appropriate: true, severity: 'info', confidence: 0.0, explanation: '' };
  }

  private checkVitalRanges(vitalType: string, value: string, age: number | null, profileType: string): {
    valid: boolean;
    severity: string;
    confidence: number;
    explanation: string;
    suggested_range?: string;
  } {
    const numericValue = parseFloat(value);
    if (isNaN(numericValue)) {
      return { valid: true, severity: 'info', confidence: 0.0, explanation: '' };
    }

    const vitalType2 = vitalType.toLowerCase();
    
    // Basic vital sign ranges (simplified)
    const ranges = {
      'blood pressure systolic': { min: 60, max: 250, units: 'mmHg' },
      'blood pressure diastolic': { min: 30, max: 150, units: 'mmHg' },
      'heart rate': { min: 20, max: 200, units: 'bpm' },
      'temperature': { min: 90, max: 110, units: 'F' },
      'weight': profileType === 'pet' ? { min: 0.5, max: 200, units: 'lbs' } : { min: 2, max: 800, units: 'lbs' },
      'height': { min: 10, max: 96, units: 'inches' }
    };
    
    for (const [type, range] of Object.entries(ranges)) {
      if (vitalType2.includes(type)) {
        if (numericValue < range.min || numericValue > range.max) {
          return {
            valid: false,
            severity: 'warning',
            confidence: 0.8,
            explanation: `${vitalType} value of ${value} is outside typical range (${range.min}-${range.max} ${range.units}).`,
            suggested_range: `${range.min}-${range.max} ${range.units}`
          };
        }
      }
    }
    
    return { valid: true, severity: 'info', confidence: 0.0, explanation: '' };
  }

  private async checkSpeciesAppropriate(
    data: ExtractedData,
    documentId: string,
    profileId: string,
    profile: Profile
  ): Promise<DataQualityFlag[]> {
    const flags: DataQualityFlag[] = [];
    const species = profile.species?.toLowerCase();
    
    // Check medications for species appropriateness
    if (data.medications && species) {
      const humanOnlyMeds = ['aspirin', 'ibuprofen', 'acetaminophen'];
      
      for (const medication of data.medications) {
        const medName = medication.name.toLowerCase();
        
        if (humanOnlyMeds.some(med => medName.includes(med))) {
          flags.push({
            profile_id: profileId,
            document_id: documentId,
            record_table: 'medications',
            severity: 'critical',
            category: 'clinical',
            problem_code: 'species_appropriate_condition',
            field_name: 'name',
            raw_value: medication.name,
            suggested_correction: null,
            confidence_score: 0.9,
            auto_resolvable: false,
            explanation: `Medication "${medication.name}" may be toxic to ${species}. Please verify with veterinarian.`,
            resolution_options: [
              { action: 'confirm', label: 'Vet approved', description: 'This medication is safe and prescribed by veterinarian' },
              { action: 'edit', label: 'Correct medication', description: 'Fix the extracted medication name' },
              { action: 'delete', label: 'Remove medication', description: 'This was extracted in error' }
            ]
          });
        }
      }
    }
    
    return flags;
  }

  private detectProfileTypeFromContent(data: ExtractedData): string | null {
    // Analyze content to suggest profile type
    let humanIndicators = 0;
    let petIndicators = 0;
    let childIndicators = 0;
    
    // Check provider types
    if (data.appointments) {
      for (const appointment of data.appointments) {
        const provider = appointment.provider?.toLowerCase() || '';
        if (provider.includes('veterinary') || provider.includes('vet')) {
          petIndicators += 2;
        }
        if (provider.includes('pediatric') || provider.includes('pediatrician')) {
          childIndicators += 2;
        }
        if (provider.includes('obgyn') || provider.includes('cardiologist')) {
          humanIndicators += 1;
        }
      }
    }
    
    // Check diagnoses
    if (data.diagnoses) {
      for (const diagnosis of data.diagnoses) {
        const condition = diagnosis.condition.toLowerCase();
        if (condition.includes('heartworm') || condition.includes('flea') || condition.includes('rabies vaccine')) {
          petIndicators += 2;
        }
        if (condition.includes('colic') || condition.includes('developmental')) {
          childIndicators += 1;
        }
      }
    }
    
    if (petIndicators > humanIndicators + childIndicators) return 'pet';
    if (childIndicators > humanIndicators && childIndicators > 0) return 'child';
    if (humanIndicators > 0) return 'self';
    
    return null;
  }

  private calculateCompletenessScore(data: ExtractedData): number {
    let totalFields = 0;
    let filledFields = 0;
    
    // Count expected vs filled fields
    const sections = [
      { data: data.patient_info, weight: 2 },
      { data: data.appointments, weight: 1.5 },
      { data: data.medications, weight: 1 },
      { data: data.lab_results, weight: 1 },
      { data: data.diagnoses, weight: 1.5 },
      { data: data.vitals, weight: 1 }
    ];
    
    for (const section of sections) {
      totalFields += section.weight;
      if (section.data && ((Array.isArray(section.data) && section.data.length > 0) || 
                          (!Array.isArray(section.data) && Object.keys(section.data).length > 0))) {
        filledFields += section.weight;
      }
    }
    
    return totalFields > 0 ? filledFields / totalFields : 0;
  }

  private detectDataConflicts(data: ExtractedData): Array<{
    table: string;
    field: string;
    values: any[];
    explanation: string;
  }> {
    const conflicts = [];
    
    // Check for conflicting patient info
    if (data.patient_info) {
      // Check for multiple different phone numbers, addresses, etc.
      // This would require more complex logic based on actual data structure
    }
    
    // Check for conflicting appointment times
    if (data.appointments && data.appointments.length > 1) {
      const sameDayAppointments = data.appointments.filter((apt, index, arr) => 
        arr.findIndex(other => 
          other.date === apt.date && 
          other !== apt && 
          Math.abs(new Date(other.date).getTime() - new Date(apt.date).getTime()) < 24 * 60 * 60 * 1000
        ) !== -1
      );
      
      if (sameDayAppointments.length > 0) {
        conflicts.push({
          table: 'appointments',
          field: 'date',
          values: sameDayAppointments.map(apt => apt.date),
          explanation: 'Multiple appointments detected on the same day. Please verify if these are separate appointments or duplicates.'
        });
      }
    }
    
    return conflicts;
  }

  /**
   * Generate AI suggestions for flag resolution
   */
  async generateSuggestions(flag: DataQualityFlag): Promise<any> {
    // This would integrate with the existing AI pipeline to suggest corrections
    // For now, return basic suggestions based on flag type
    
    switch (flag.problem_code) {
      case 'future_date_check':
        return this.suggestDateCorrection(flag.raw_value);
      case 'contact_format_check':
        return this.formatPhoneNumber(flag.raw_value);
      default:
        return null;
    }
  }

  /**
   * Store flags in audit system (Updated for Guardian v7 canonical schema)
   * Uses the new log_profile_audit_event function for proper ID resolution
   */
  async storeFlags(flags: DataQualityFlag[]): Promise<string[]> {
    const flagIds: string[] = [];
    
    for (const flag of flags) {
      // Use the new profile-aware audit function that resolves profile_id to patient_id
      const { data, error } = await this.supabase
        .rpc('log_profile_audit_event', {
          p_table_name: flag.record_table,
          p_record_id: flag.document_id,
          p_operation: 'QUALITY_FLAG',
          p_profile_id: flag.profile_id, // Pass profile_id, function will resolve to patient_id
          p_reason: `Quality validation flag: ${flag.problem_code}`,
          p_category: 'quality_control',
          p_metadata: {
            severity: flag.severity,
            category: flag.category,
            problem_code: flag.problem_code,
            field_name: flag.field_name,
            raw_value: flag.raw_value,
            suggested_correction: flag.suggested_correction,
            confidence_score: flag.confidence_score,
            auto_resolvable: flag.auto_resolvable,
            explanation: flag.explanation,
            resolution_options: flag.resolution_options
          }
        });
      
      if (error) {
        console.error('Error storing quality flag in audit system:', error);
        continue;
      }
      
      if (data) {
        flagIds.push(data);
      }
    }
    
    return flagIds;
  }
}