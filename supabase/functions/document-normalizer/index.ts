import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

interface NormalizationTrigger {
  document_id: string
  user_id: string
  medical_data: MedicalData
  trigger_type: 'insert' | 'update' | 'manual'
}

interface MedicalData {
  documentType?: string
  patientInfo?: {
    name?: string | null
    dateOfBirth?: string | null
    mrn?: string | null
    insuranceId?: string | null
  }
  medicalData?: {
    medications?: Array<{name: string, dosage?: string, frequency?: string}>
    allergies?: Array<{allergen: string, severity?: string, reaction?: string}>
    labResults?: Array<{test: string, value: string, unit?: string, reference?: string, date?: string}>
    conditions?: Array<{condition: string, status?: string, date?: string}>
    vitals?: {
      bloodPressure?: string
      heartRate?: string
      temperature?: string
      weight?: string
      height?: string
      date?: string
    }
    procedures?: Array<{procedure: string, date?: string}>
  }
  dates?: {
    documentDate?: string | null
    serviceDate?: string | null
  }
  provider?: {
    name?: string | null
    facility?: string | null
    phone?: string | null
  }
  confidence?: {
    overall?: number
    ocrMatch?: number
    extraction?: number
  }
  notes?: string
}

interface ProcessedCounts {
  medications: number
  allergies: number
  conditions: number
  labResults: number
  vitals: number
  providers: number
  errors: string[]
}

serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🔄 Document Normalizer: Starting normalization process...')
    
    const { document_id, user_id, medical_data, trigger_type }: NormalizationTrigger = await req.json()
    
    if (!document_id || !user_id || !medical_data) {
      throw new Error('Missing required fields: document_id, user_id, or medical_data')
    }

    console.log(`📄 Processing document ${document_id} for user ${user_id}`)
    console.log(`📊 Trigger type: ${trigger_type}`)

    // Update document normalization status to 'processing'
    await supabase
      .from('documents')
      .update({ 
        normalization_status: 'processing',
        normalization_errors: null
      })
      .eq('id', document_id)

    // Initialize normalization pipeline
    const normalizer = new MedicalDataNormalizer(user_id, document_id, medical_data)
    
    // Process each medical data category in parallel
    const results = await Promise.allSettled([
      normalizer.processMedications(),
      normalizer.processAllergies(),
      normalizer.processConditions(),
      normalizer.processLabResults(),
      normalizer.processVitals(),
      normalizer.processProviders()
    ])
    
    // Collect processing results and errors
    const processedCounts = normalizer.getProcessedCounts()
    const allErrors: string[] = []
    
    results.forEach((result, index) => {
      const categories = ['medications', 'allergies', 'conditions', 'labResults', 'vitals', 'providers']
      if (result.status === 'rejected') {
        const error = `${categories[index]}: ${result.reason}`
        allErrors.push(error)
        console.error(`❌ Error processing ${categories[index]}:`, result.reason)
      }
    })
    
    // Update document normalization status
    const finalStatus = allErrors.length > 0 ? 'failed' : 'completed'
    const updateData: any = {
      normalization_status: finalStatus,
      normalized_at: new Date().toISOString()
    }
    
    if (allErrors.length > 0) {
      updateData.normalization_errors = allErrors
    }
    
    await supabase
      .from('documents')
      .update(updateData)
      .eq('id', document_id)

    console.log(`✅ Normalization completed for document ${document_id}`)
    console.log(`📊 Processed: ${Object.entries(processedCounts).map(([k, v]) => `${k}: ${v}`).join(', ')}`)
    
    if (allErrors.length > 0) {
      console.log(`⚠️  Errors encountered: ${allErrors.length}`)
    }

    return new Response(JSON.stringify({ 
      success: true,
      status: finalStatus,
      processed_counts: processedCounts,
      errors: allErrors
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })
    
  } catch (error) {
    console.error('❌ Normalization failed:', error)
    
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})

class MedicalDataNormalizer {
  private processedCounts: ProcessedCounts = {
    medications: 0,
    allergies: 0,
    conditions: 0,
    labResults: 0,
    vitals: 0,
    providers: 0,
    errors: []
  }

  constructor(
    private userId: string,
    private documentId: string,
    private medicalData: MedicalData
  ) {}

  async processMedications(): Promise<void> {
    const medications = this.medicalData.medicalData?.medications
    if (!medications || medications.length === 0) {
      console.log('📋 No medications found in document')
      return
    }

    console.log(`💊 Processing ${medications.length} medications...`)

    for (const medication of medications) {
      try {
        if (!medication.name || medication.name.trim().length === 0) {
          this.processedCounts.errors.push('Medication with empty name skipped')
          continue
        }

        // Step 1: Normalize medication name for deduplication
        const normalizedName = this.normalizeMedicationName(medication.name)
        
        // Step 2: Check for existing medication
        const { data: existingMeds } = await supabase
          .from('patient_medications')
          .select('*')
          .eq('user_id', this.userId)
          .eq('normalized_name', normalizedName)
          .eq('status', 'active')

        if (existingMeds && existingMeds.length > 0) {
          // Update existing medication with new source document
          const existingMed = existingMeds[0]
          const updatedSourceDocs = [...new Set([...existingMed.source_document_ids, this.documentId])]
          
          await supabase
            .from('patient_medications')
            .update({
              source_document_ids: updatedSourceDocs,
              last_confirmed_at: new Date().toISOString(),
              // Update other fields if new data is more recent or higher confidence
              ...(medication.dosage && { dosage: medication.dosage }),
              ...(medication.frequency && { frequency: medication.frequency })
            })
            .eq('id', existingMed.id)
          
          console.log(`🔄 Updated existing medication: ${medication.name}`)
        } else {
          // Create new medication record
          await supabase
            .from('patient_medications')
            .insert({
              user_id: this.userId,
              medication_name: medication.name,
              dosage: medication.dosage || null,
              frequency: medication.frequency || null,
              normalized_name: normalizedName,
              source_document_ids: [this.documentId],
              confidence_score: this.extractConfidenceScore(),
              status: 'active'
            })
          
          console.log(`➕ Created new medication: ${medication.name}`)
        }
        
        this.processedCounts.medications++
      } catch (error) {
        const errorMsg = `Error processing medication "${medication.name}": ${error}`
        this.processedCounts.errors.push(errorMsg)
        console.error(errorMsg)
      }
    }
  }

  async processAllergies(): Promise<void> {
    const allergies = this.medicalData.medicalData?.allergies
    if (!allergies || allergies.length === 0) {
      console.log('🚫 No allergies found in document')
      return
    }

    console.log(`⚠️  Processing ${allergies.length} allergies...`)

    for (const allergy of allergies) {
      try {
        if (!allergy.allergen || allergy.allergen.trim().length === 0) {
          this.processedCounts.errors.push('Allergy with empty allergen skipped')
          continue
        }

        const normalizedAllergen = this.normalizeAllergen(allergy.allergen)
        
        // Check for existing allergy
        const { data: existingAllergies } = await supabase
          .from('patient_allergies')
          .select('*')
          .eq('user_id', this.userId)
          .eq('normalized_allergen', normalizedAllergen)
          .eq('status', 'active')

        if (existingAllergies && existingAllergies.length > 0) {
          // Update existing allergy
          const existing = existingAllergies[0]
          const updatedSourceDocs = [...new Set([...existing.source_document_ids, this.documentId])]
          
          await supabase
            .from('patient_allergies')
            .update({
              source_document_ids: updatedSourceDocs,
              last_confirmed_at: new Date().toISOString(),
              ...(allergy.severity && { severity: allergy.severity.toLowerCase() }),
              ...(allergy.reaction && { reaction_description: allergy.reaction })
            })
            .eq('id', existing.id)
          
          console.log(`🔄 Updated existing allergy: ${allergy.allergen}`)
        } else {
          // Create new allergy record
          await supabase
            .from('patient_allergies')
            .insert({
              user_id: this.userId,
              allergen: allergy.allergen,
              severity: allergy.severity?.toLowerCase() || null,
              reaction_description: allergy.reaction || null,
              normalized_allergen: normalizedAllergen,
              source_document_ids: [this.documentId],
              confidence_score: this.extractConfidenceScore(),
              status: 'active'
            })
          
          console.log(`➕ Created new allergy: ${allergy.allergen}`)
        }
        
        this.processedCounts.allergies++
      } catch (error) {
        const errorMsg = `Error processing allergy "${allergy.allergen}": ${error}`
        this.processedCounts.errors.push(errorMsg)
        console.error(errorMsg)
      }
    }
  }

  async processConditions(): Promise<void> {
    const conditions = this.medicalData.medicalData?.conditions
    if (!conditions || conditions.length === 0) {
      console.log('🏥 No conditions found in document')
      return
    }

    console.log(`🩺 Processing ${conditions.length} conditions...`)

    for (const condition of conditions) {
      try {
        if (!condition.condition || condition.condition.trim().length === 0) {
          this.processedCounts.errors.push('Condition with empty name skipped')
          continue
        }

        const normalizedCondition = this.normalizeCondition(condition.condition)
        
        // Check for existing condition
        const { data: existingConditions } = await supabase
          .from('patient_conditions')
          .select('*')
          .eq('user_id', this.userId)
          .eq('normalized_condition', normalizedCondition)

        if (existingConditions && existingConditions.length > 0) {
          // Update existing condition
          const existing = existingConditions[0]
          const updatedSourceDocs = [...new Set([...existing.source_document_ids, this.documentId])]
          
          await supabase
            .from('patient_conditions')
            .update({
              source_document_ids: updatedSourceDocs,
              last_confirmed_at: new Date().toISOString(),
              ...(condition.status && { status: condition.status.toLowerCase() }),
              ...(condition.date && { diagnosis_date: condition.date })
            })
            .eq('id', existing.id)
          
          console.log(`🔄 Updated existing condition: ${condition.condition}`)
        } else {
          // Create new condition record
          await supabase
            .from('patient_conditions')
            .insert({
              user_id: this.userId,
              condition_name: condition.condition,
              status: condition.status?.toLowerCase() || 'active',
              diagnosis_date: condition.date || null,
              normalized_condition: normalizedCondition,
              source_document_ids: [this.documentId],
              confidence_score: this.extractConfidenceScore()
            })
          
          console.log(`➕ Created new condition: ${condition.condition}`)
        }
        
        this.processedCounts.conditions++
      } catch (error) {
        const errorMsg = `Error processing condition "${condition.condition}": ${error}`
        this.processedCounts.errors.push(errorMsg)
        console.error(errorMsg)
      }
    }
  }

  async processLabResults(): Promise<void> {
    const labResults = this.medicalData.medicalData?.labResults
    if (!labResults || labResults.length === 0) {
      console.log('🧪 No lab results found in document')
      return
    }

    console.log(`🔬 Processing ${labResults.length} lab results...`)

    for (const lab of labResults) {
      try {
        if (!lab.test || !lab.value || lab.test.trim().length === 0) {
          this.processedCounts.errors.push('Lab result with missing test name or value skipped')
          continue
        }

        const normalizedTestName = this.normalizeTestName(lab.test)
        const numericValue = this.extractNumericValue(lab.value)
        const testDate = lab.date || this.medicalData.dates?.serviceDate || this.medicalData.dates?.documentDate
        
        if (!testDate) {
          this.processedCounts.errors.push(`Lab result "${lab.test}" skipped: no date available`)
          continue
        }

        await supabase
          .from('patient_lab_results')
          .insert({
            user_id: this.userId,
            test_name: lab.test,
            result_value: lab.value,
            unit: lab.unit || null,
            reference_range: lab.reference || null,
            test_date: testDate,
            normalized_test_name: normalizedTestName,
            numeric_value: numericValue,
            source_document_id: this.documentId,
            confidence_score: this.extractConfidenceScore()
          })
        
        console.log(`➕ Created lab result: ${lab.test} = ${lab.value}`)
        this.processedCounts.labResults++
      } catch (error) {
        const errorMsg = `Error processing lab result "${lab.test}": ${error}`
        this.processedCounts.errors.push(errorMsg)
        console.error(errorMsg)
      }
    }
  }

  async processVitals(): Promise<void> {
    const vitals = this.medicalData.medicalData?.vitals
    if (!vitals || Object.keys(vitals).length === 0) {
      console.log('💓 No vitals found in document')
      return
    }

    console.log('📊 Processing vital signs...')

    try {
      const measurementDate = vitals.date || this.medicalData.dates?.serviceDate || this.medicalData.dates?.documentDate
      
      if (!measurementDate) {
        this.processedCounts.errors.push('Vitals skipped: no measurement date available')
        return
      }

      // Parse blood pressure
      let systolic = null, diastolic = null
      if (vitals.bloodPressure) {
        const bpMatch = vitals.bloodPressure.match(/(\d+)\/(\d+)/)
        if (bpMatch) {
          systolic = parseInt(bpMatch[1])
          diastolic = parseInt(bpMatch[2])
        }
      }

      // Parse heart rate
      let heartRate = null
      if (vitals.heartRate) {
        const hrMatch = vitals.heartRate.match(/(\d+)/)
        if (hrMatch) {
          heartRate = parseInt(hrMatch[1])
        }
      }

      // Parse temperature
      let temperature = null, temperatureUnit = 'F'
      if (vitals.temperature) {
        const tempMatch = vitals.temperature.match(/([\d.]+)\s*([FC])?/)
        if (tempMatch) {
          temperature = parseFloat(tempMatch[1])
          temperatureUnit = tempMatch[2] || 'F'
        }
      }

      await supabase
        .from('patient_vitals')
        .insert({
          user_id: this.userId,
          measurement_date: measurementDate,
          blood_pressure_systolic: systolic,
          blood_pressure_diastolic: diastolic,
          heart_rate: heartRate,
          temperature: temperature,
          temperature_unit: temperatureUnit,
          source_document_id: this.documentId,
          confidence_score: this.extractConfidenceScore()
        })
      
      console.log(`➕ Created vital signs record for ${measurementDate}`)
      this.processedCounts.vitals++
    } catch (error) {
      const errorMsg = `Error processing vitals: ${error}`
      this.processedCounts.errors.push(errorMsg)
      console.error(errorMsg)
    }
  }

  async processProviders(): Promise<void> {
    const provider = this.medicalData.provider
    if (!provider || !provider.name || provider.name.trim().length === 0) {
      console.log('👩‍⚕️ No provider found in document')
      return
    }

    console.log(`👨‍⚕️ Processing provider: ${provider.name}`)

    try {
      const normalizedName = this.normalizeProviderName(provider.name)
      
      // Check for existing provider
      const { data: existingProviders } = await supabase
        .from('patient_providers')
        .select('*')
        .eq('user_id', this.userId)
        .eq('normalized_name', normalizedName)

      if (existingProviders && existingProviders.length > 0) {
        // Update existing provider
        const existing = existingProviders[0]
        const updatedSourceDocs = [...new Set([...existing.source_document_ids, this.documentId])]
        
        await supabase
          .from('patient_providers')
          .update({
            source_document_ids: updatedSourceDocs,
            last_seen_date: this.medicalData.dates?.serviceDate || this.medicalData.dates?.documentDate || new Date().toISOString().split('T')[0],
            ...(provider.facility && { facility_name: provider.facility }),
            ...(provider.phone && { phone: provider.phone })
          })
          .eq('id', existing.id)
        
        console.log(`🔄 Updated existing provider: ${provider.name}`)
      } else {
        // Create new provider record
        await supabase
          .from('patient_providers')
          .insert({
            user_id: this.userId,
            provider_name: provider.name,
            facility_name: provider.facility || null,
            phone: provider.phone || null,
            normalized_name: normalizedName,
            first_seen_date: this.medicalData.dates?.serviceDate || this.medicalData.dates?.documentDate || new Date().toISOString().split('T')[0],
            last_seen_date: this.medicalData.dates?.serviceDate || this.medicalData.dates?.documentDate || new Date().toISOString().split('T')[0],
            source_document_ids: [this.documentId],
            confidence_score: this.extractConfidenceScore()
          })
        
        console.log(`➕ Created new provider: ${provider.name}`)
      }
      
      this.processedCounts.providers++
    } catch (error) {
      const errorMsg = `Error processing provider "${provider.name}": ${error}`
      this.processedCounts.errors.push(errorMsg)
      console.error(errorMsg)
    }
  }

  // Normalization helper methods
  private normalizeMedicationName(name: string): string {
    return name.toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b(tablet|capsule|mg|mcg|ml|units?)\b/gi, '')
      .trim()
  }

  private normalizeAllergen(allergen: string): string {
    return allergen.toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  }

  private normalizeCondition(condition: string): string {
    return condition.toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  }

  private normalizeTestName(testName: string): string {
    return testName.toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  }

  private normalizeProviderName(name: string): string {
    return name.toLowerCase()
      .replace(/\b(dr\.?|doctor|md|do|np|pa)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private extractConfidenceScore(): number | null {
    return this.medicalData.confidence?.overall || null
  }

  private extractNumericValue(value: string): number | null {
    const match = value.match(/([\d.]+)/)
    return match ? parseFloat(match[1]) : null
  }

  getProcessedCounts(): ProcessedCounts {
    return this.processedCounts
  }
}