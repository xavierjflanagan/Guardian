/**
 * Healthcare Test Data Factory - Guardian Healthcare Platform
 * 
 * Generates realistic healthcare test data for RLS policy testing
 * Ensures compliance with healthcare data standards while providing
 * comprehensive test coverage for patient data isolation.
 * 
 * @see shared/docs/architecture/security/rls-policy-testing-framework.md
 */

import { faker } from '@faker-js/faker'

// Healthcare document types from Guardian schema
type DocumentType = 
  | 'medical_record' 
  | 'lab_result' 
  | 'imaging_report' 
  | 'prescription'
  | 'discharge_summary' 
  | 'referral' 
  | 'insurance_card' 
  | 'id_document' 
  | 'other'

// Medical condition severity levels
type ConditionSeverity = 'mild' | 'moderate' | 'severe' | 'critical'

// Medical condition status
type ConditionStatus = 'active' | 'resolved' | 'inactive' | 'remission' | 'relapse'

// Profile types from Guardian multi-profile system
type ProfileType = 'self' | 'child' | 'pet' | 'dependent'

// Test patient data structure
export interface TestPatientData {
  id: string
  email: string
  profile: TestProfileData
  documents: TestDocumentData[]
  conditions: TestConditionData[]
  allergies: TestAllergyData[]
  vitals: TestVitalSignsData[]
}

export interface TestProfileData {
  id: string
  account_owner_id: string
  profile_type: ProfileType
  display_name: string
  full_name?: string
  date_of_birth?: string
  relationship?: string
  patient_id: string // References auth.users.id
}

export interface TestDocumentData {
  id: string
  patient_id: string
  filename: string
  original_filename: string
  file_size_bytes: number
  mime_type: string
  storage_path: string
  document_type: DocumentType
  document_subtype?: string
  contains_phi: boolean
  provider_name?: string
  facility_name?: string
  service_date?: string
}

export interface TestConditionData {
  id: string
  patient_id: string
  condition_name: string
  condition_code?: string
  condition_system?: string
  severity: ConditionSeverity
  status: ConditionStatus
  onset_date?: string
  diagnosed_date?: string
  diagnosed_by?: string
  notes?: string
}

export interface TestAllergyData {
  id: string
  patient_id: string
  allergen_name: string
  allergen_category: string
  reaction_severity: ConditionSeverity
  reaction_description?: string
  verified: boolean
  notes?: string
}

export interface TestVitalSignsData {
  id: string
  patient_id: string
  measurement_date: string
  vital_type: string
  value: number
  unit: string
  normal_range_min?: number
  normal_range_max?: number
  recorded_by?: string
}

export interface TestProviderData {
  id: string
  provider_id: string
  provider_name: string
  specialty: string
  license_number: string
  facility_name: string
  contact_info: Record<string, any>
}

/**
 * Comprehensive healthcare test data factory
 * 
 * Generates realistic but synthetic healthcare data for testing
 * RLS policies while ensuring no real patient data is used.
 */
export class HealthcareTestDataFactory {
  private static readonly DOCUMENT_TYPES: DocumentType[] = [
    'medical_record', 'lab_result', 'imaging_report', 'prescription',
    'discharge_summary', 'referral', 'insurance_card', 'id_document'
  ]

  private static readonly MEDICAL_CONDITIONS = [
    'Type 2 Diabetes', 'Hypertension', 'Asthma', 'Osteoarthritis',
    'Depression', 'Anxiety', 'Migraine', 'GERD', 'Obesity', 'Hypothyroidism'
  ]

  private static readonly COMMON_ALLERGENS = [
    { name: 'Penicillin', category: 'medication' },
    { name: 'Peanuts', category: 'food' },
    { name: 'Shellfish', category: 'food' },
    { name: 'Pollen', category: 'environmental' },
    { name: 'Latex', category: 'environmental' },
    { name: 'Ibuprofen', category: 'medication' }
  ]

  private static readonly VITAL_TYPES = [
    { type: 'blood_pressure_systolic', unit: 'mmHg', normalMin: 90, normalMax: 120 },
    { type: 'blood_pressure_diastolic', unit: 'mmHg', normalMin: 60, normalMax: 80 },
    { type: 'heart_rate', unit: 'bpm', normalMin: 60, normalMax: 100 },
    { type: 'temperature', unit: '°C', normalMin: 36.1, normalMax: 37.2 },
    { type: 'weight', unit: 'kg', normalMin: 40, normalMax: 120 },
    { type: 'height', unit: 'cm', normalMin: 140, normalMax: 200 }
  ]

  /**
   * Create a complete test patient with all associated healthcare data
   */
  static createTestPatient(options: {
    profileType?: ProfileType
    includeDocuments?: number
    includeConditions?: number
    includeAllergies?: number
    includeVitals?: number
    accountOwnerId?: string
  } = {}): TestPatientData {
    const patientId = faker.datatype.uuid()
    const accountOwnerId = options.accountOwnerId || patientId
    
    const patient: TestPatientData = {
      id: patientId,
      email: faker.internet.email().toLowerCase(),
      profile: this.createTestProfile(patientId, accountOwnerId, options.profileType),
      documents: [],
      conditions: [],
      allergies: [],
      vitals: []
    }

    // Generate documents
    const docCount = options.includeDocuments ?? 3
    for (let i = 0; i < docCount; i++) {
      patient.documents.push(this.createTestDocument(patientId))
    }

    // Generate medical conditions
    const conditionCount = options.includeConditions ?? 2
    for (let i = 0; i < conditionCount; i++) {
      patient.conditions.push(this.createTestCondition(patientId))
    }

    // Generate allergies
    const allergyCount = options.includeAllergies ?? 1
    for (let i = 0; i < allergyCount; i++) {
      patient.allergies.push(this.createTestAllergy(patientId))
    }

    // Generate vital signs
    const vitalCount = options.includeVitals ?? 5
    for (let i = 0; i < vitalCount; i++) {
      patient.vitals.push(this.createTestVitalSigns(patientId))
    }

    return patient
  }

  /**
   * Create test profile data
   */
  static createTestProfile(
    patientId: string, 
    accountOwnerId: string, 
    profileType: ProfileType = 'self'
  ): TestProfileData {
    const firstName = faker.name.firstName()
    const lastName = faker.name.lastName()
    
    return {
      id: faker.datatype.uuid(),
      account_owner_id: accountOwnerId,
      profile_type: profileType,
      display_name: profileType === 'pet' 
        ? faker.animal.dog() 
        : `${firstName} ${lastName}`,
      full_name: profileType !== 'pet' ? `${firstName} ${lastName}` : undefined,
      date_of_birth: profileType !== 'pet' 
        ? faker.date.birthdate({ min: 1, max: 80, mode: 'age' }).toISOString().split('T')[0]
        : faker.date.recent({ days: 365 * 5 }).toISOString().split('T')[0], // Pet age
      relationship: this.getRelationshipForProfileType(profileType),
      patient_id: patientId
    }
  }

  /**
   * Create realistic medical document test data
   */
  static createTestDocument(patientId: string): TestDocumentData {
    const documentType = faker.helpers.arrayElement(this.DOCUMENT_TYPES)
    const baseFilename = faker.system.fileName('pdf')
    
    return {
      id: faker.datatype.uuid(),
      patient_id: patientId,
      filename: `${patientId}_${Date.now()}_${baseFilename}`,
      original_filename: baseFilename,
      file_size_bytes: faker.datatype.number({ min: 50000, max: 5000000 }),
      mime_type: 'application/pdf',
      storage_path: `medical-docs/${patientId}/${faker.datatype.uuid()}_${baseFilename}`,
      document_type: documentType,
      document_subtype: this.getDocumentSubtype(documentType),
      contains_phi: true,
      provider_name: faker.company.name() + ' Medical Center',
      facility_name: faker.company.name() + ' Hospital',
      service_date: faker.date.recent({ days: 365 }).toISOString().split('T')[0]
    }
  }

  /**
   * Create realistic medical condition test data
   */
  static createTestCondition(patientId: string): TestConditionData {
    const conditionName = faker.helpers.arrayElement(this.MEDICAL_CONDITIONS)
    
    return {
      id: faker.datatype.uuid(),
      patient_id: patientId,
      condition_name: conditionName,
      condition_code: this.generateICD10Code(),
      condition_system: 'icd10',
      severity: faker.helpers.arrayElement<ConditionSeverity>(['mild', 'moderate', 'severe']),
      status: faker.helpers.arrayElement<ConditionStatus>(['active', 'resolved', 'inactive']),
      onset_date: faker.date.past({ years: 5 }).toISOString().split('T')[0],
      diagnosed_date: faker.date.past({ years: 3 }).toISOString().split('T')[0],
      diagnosed_by: 'Dr. ' + faker.name.fullName(),
      notes: faker.lorem.sentence()
    }
  }

  /**
   * Create test allergy data
   */
  static createTestAllergy(patientId: string): TestAllergyData {
    const allergen = faker.helpers.arrayElement(this.COMMON_ALLERGENS)
    
    return {
      id: faker.datatype.uuid(),
      patient_id: patientId,
      allergen_name: allergen.name,
      allergen_category: allergen.category,
      reaction_severity: faker.helpers.arrayElement<ConditionSeverity>(['mild', 'moderate', 'severe']),
      reaction_description: faker.lorem.sentence(),
      verified: faker.datatype.boolean(),
      notes: faker.lorem.sentence()
    }
  }

  /**
   * Create test vital signs data
   */
  static createTestVitalSigns(patientId: string): TestVitalSignsData {
    const vitalType = faker.helpers.arrayElement(this.VITAL_TYPES)
    const isNormal = faker.datatype.boolean({ probability: 0.8 })
    
    let value: number
    if (isNormal) {
      value = faker.datatype.float({ 
        min: vitalType.normalMin, 
        max: vitalType.normalMax, 
        precision: 0.1 
      })
    } else {
      // Generate abnormal value
      const isHigh = faker.datatype.boolean()
      value = isHigh 
        ? faker.datatype.float({ min: vitalType.normalMax, max: vitalType.normalMax * 1.5, precision: 0.1 })
        : faker.datatype.float({ min: vitalType.normalMin * 0.5, max: vitalType.normalMin, precision: 0.1 })
    }
    
    return {
      id: faker.datatype.uuid(),
      patient_id: patientId,
      measurement_date: faker.date.recent({ days: 90 }).toISOString(),
      vital_type: vitalType.type,
      value: Math.round(value * 10) / 10, // Round to 1 decimal
      unit: vitalType.unit,
      normal_range_min: vitalType.normalMin,
      normal_range_max: vitalType.normalMax,
      recorded_by: 'Nurse ' + faker.name.lastName()
    }
  }

  /**
   * Create test healthcare provider data
   */
  static createTestProvider(): TestProviderData {
    const specialties = [
      'Internal Medicine', 'Cardiology', 'Dermatology', 'Endocrinology',
      'Gastroenterology', 'Neurology', 'Oncology', 'Orthopedics', 'Pediatrics'
    ]
    
    return {
      id: faker.datatype.uuid(),
      provider_id: 'PROV-' + faker.datatype.number({ min: 100000, max: 999999 }),
      provider_name: 'Dr. ' + faker.name.fullName(),
      specialty: faker.helpers.arrayElement(specialties),
      license_number: 'LIC-' + faker.datatype.number({ min: 100000, max: 999999 }),
      facility_name: faker.company.name() + ' Medical Center',
      contact_info: {
        phone: faker.phone.number(),
        email: faker.internet.email(),
        address: faker.address.streetAddress()
      }
    }
  }

  /**
   * Create family of related test patients (parent with children)
   */
  static createTestFamily(options: {
    includeChildren?: number
    includePets?: number
  } = {}): TestPatientData[] {
    const family: TestPatientData[] = []
    
    // Create parent
    const parent = this.createTestPatient({
      profileType: 'self',
      includeDocuments: 4,
      includeConditions: 3,
      includeAllergies: 2,
      includeVitals: 10
    })
    family.push(parent)
    
    // Create children
    const childCount = options.includeChildren ?? 2
    for (let i = 0; i < childCount; i++) {
      const child = this.createTestPatient({
        profileType: 'child',
        accountOwnerId: parent.id,
        includeDocuments: 2,
        includeConditions: 1,
        includeAllergies: 1,
        includeVitals: 5
      })
      family.push(child)
    }
    
    // Create pets
    const petCount = options.includePets ?? 1
    for (let i = 0; i < petCount; i++) {
      const pet = this.createTestPatient({
        profileType: 'pet',
        accountOwnerId: parent.id,
        includeDocuments: 1,
        includeConditions: 0,
        includeAllergies: 0,
        includeVitals: 3
      })
      family.push(pet)
    }
    
    return family
  }

  /**
   * Helper methods for generating realistic healthcare data
   */
  private static getRelationshipForProfileType(profileType: ProfileType): string {
    switch (profileType) {
      case 'self': return 'self'
      case 'child': return faker.helpers.arrayElement(['son', 'daughter'])
      case 'pet': return faker.helpers.arrayElement(['dog', 'cat', 'bird'])
      case 'dependent': return faker.helpers.arrayElement(['parent', 'spouse', 'sibling'])
      default: return 'self'
    }
  }

  private static getDocumentSubtype(documentType: DocumentType): string | undefined {
    const subtypes: Record<DocumentType, string[]> = {
      'medical_record': ['consultation_note', 'progress_note', 'specialist_report'],
      'lab_result': ['blood_work', 'urine_test', 'biopsy_result'],
      'imaging_report': ['x_ray', 'mri', 'ct_scan', 'ultrasound'],
      'prescription': ['medication', 'supplement', 'therapy'],
      'discharge_summary': ['hospital_discharge', 'er_discharge', 'surgery_summary'],
      'referral': ['specialist_referral', 'therapy_referral'],
      'insurance_card': ['health_insurance', 'medicare_card'],
      'id_document': ['drivers_license', 'passport'],
      'other': ['form', 'certificate']
    }
    
    return faker.helpers.arrayElement(subtypes[documentType] || ['general'])
  }

  private static generateICD10Code(): string {
    // Generate realistic ICD-10 code format (letter + 2 digits + optional decimal + 1-3 digits)
    const letter = faker.helpers.arrayElement(['E', 'I', 'J', 'K', 'M', 'N', 'R', 'Z'])
    const firstPart = faker.datatype.number({ min: 10, max: 99 })
    const hasDecimal = faker.datatype.boolean({ probability: 0.7 })
    
    if (hasDecimal) {
      const decimal = faker.datatype.number({ min: 0, max: 999 })
      return `${letter}${firstPart}.${decimal}`
    }
    
    return `${letter}${firstPart}`
  }
}

/**
 * Test scenario generator for common healthcare access patterns
 */
export class HealthcareTestScenarios {
  /**
   * Generate cross-tenant data isolation test scenario
   */
  static generateCrossTenantScenario(): {
    patient1: TestPatientData
    patient2: TestPatientData
    testDescription: string
  } {
    return {
      patient1: HealthcareTestDataFactory.createTestPatient({
        includeDocuments: 3,
        includeConditions: 2
      }),
      patient2: HealthcareTestDataFactory.createTestPatient({
        includeDocuments: 3,
        includeConditions: 2
      }),
      testDescription: 'Patient A should not be able to access Patient B\'s medical records'
    }
  }

  /**
   * Generate multi-profile family access scenario
   */
  static generateMultiProfileScenario(): {
    family: TestPatientData[]
    testDescription: string
  } {
    return {
      family: HealthcareTestDataFactory.createTestFamily({
        includeChildren: 2,
        includePets: 1
      }),
      testDescription: 'Parent should be able to access child and pet profiles, but children should not access each other'
    }
  }

  /**
   * Generate provider access scenario
   */
  static generateProviderAccessScenario(): {
    patient: TestPatientData
    provider: TestProviderData
    testDescription: string
  } {
    return {
      patient: HealthcareTestDataFactory.createTestPatient({
        includeDocuments: 5,
        includeConditions: 3
      }),
      provider: HealthcareTestDataFactory.createTestProvider(),
      testDescription: 'Provider should only access patient data with explicit consent'
    }
  }
}