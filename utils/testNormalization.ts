/**
 * Normalization Testing Utility
 * 
 * This utility helps test the normalization system with sample medical data
 * and validates that the Edge Function and database triggers are working correctly.
 */

import { createClient } from '@supabase/supabase-js'

// Sample medical data for testing
export const sampleMedicalDocuments = [
  {
    fileName: "lab_results_sample.jpg",
    medicalData: {
      documentType: "lab_results",
      patientInfo: {
        name: "John Smith",
        dateOfBirth: "1985-03-15",
        mrn: "MRN123456"
      },
      medicalData: {
        labResults: [
          {
            test: "Total Cholesterol",
            value: "195",
            unit: "mg/dL",
            reference: "<200"
          },
          {
            test: "HDL Cholesterol",
            value: "45",
            unit: "mg/dL", 
            reference: ">40"
          },
          {
            test: "LDL Cholesterol",
            value: "125",
            unit: "mg/dL",
            reference: "<100"
          },
          {
            test: "Triglycerides",
            value: "150",
            unit: "mg/dL",
            reference: "<150"
          }
        ]
      },
      dates: {
        documentDate: "2024-07-20",
        serviceDate: "2024-07-20"
      },
      provider: {
        name: "Dr. Sarah Johnson",
        facility: "City Medical Lab",
        phone: "(555) 123-4567"
      },
      confidence: {
        overall: 0.95,
        ocrMatch: 0.98,
        extraction: 0.92
      },
      notes: "Clear lab results with good OCR accuracy"
    }
  },
  {
    fileName: "prescription_sample.jpg",
    medicalData: {
      documentType: "prescription",
      patientInfo: {
        name: "John Smith",
        dateOfBirth: "1985-03-15"
      },
      medicalData: {
        medications: [
          {
            name: "Lisinopril",
            dosage: "10mg",
            frequency: "once daily"
          },
          {
            name: "Metformin",
            dosage: "500mg",
            frequency: "twice daily with meals"
          }
        ]
      },
      dates: {
        documentDate: "2024-07-22",
        serviceDate: "2024-07-22"
      },
      provider: {
        name: "Dr. Michael Chen",
        facility: "Family Medicine Clinic",
        phone: "(555) 987-6543"
      },
      confidence: {
        overall: 0.93,
        ocrMatch: 0.95,
        extraction: 0.91
      },
      notes: "Prescription with clear medication details"
    }
  },
  {
    fileName: "medical_record_sample.jpg",
    medicalData: {
      documentType: "medical_record",
      patientInfo: {
        name: "John Smith",
        dateOfBirth: "1985-03-15"
      },
      medicalData: {
        conditions: [
          {
            condition: "Hypertension",
            status: "active"
          },
          {
            condition: "Type 2 Diabetes Mellitus",
            status: "active"
          }
        ],
        allergies: [
          {
            allergen: "Penicillin",
            severity: "severe",
            reaction: "Hives and swelling"
          }
        ],
        vitals: {
          bloodPressure: "142/85",
          heartRate: "78 bpm",
          temperature: "98.6 F",
          date: "2024-07-22"
        }
      },
      dates: {
        documentDate: "2024-07-22",
        serviceDate: "2024-07-22"
      },
      provider: {
        name: "Dr. Emily Rodriguez",
        facility: "Internal Medicine Associates"
      },
      confidence: {
        overall: 0.89,
        ocrMatch: 0.92,
        extraction: 0.87
      },
      notes: "Comprehensive medical record with multiple data types"
    }
  }
]

export interface NormalizationTestResult {
  documentId: string
  fileName: string
  insertSuccess: boolean
  normalizationTriggered: boolean
  normalizationCompleted: boolean
  normalizedData: {
    medications: number
    allergies: number
    conditions: number
    labResults: number
    vitals: number
    providers: number
  }
  errors: string[]
  processingTime: number
}

export class NormalizationTester {
  private supabase: any

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey)
  }

  /**
   * Test the complete normalization pipeline with sample data
   */
  async testNormalizationPipeline(userId: string): Promise<NormalizationTestResult[]> {
    console.log('🧪 Starting Normalization Pipeline Test')
    console.log('=====================================')
    
    const results: NormalizationTestResult[] = []

    for (let i = 0; i < sampleMedicalDocuments.length; i++) {
      const sample = sampleMedicalDocuments[i]
      console.log(`\n📄 Testing document ${i + 1}/${sampleMedicalDocuments.length}: ${sample.fileName}`)
      
      const startTime = Date.now()
      const result: NormalizationTestResult = {
        documentId: '',
        fileName: sample.fileName,
        insertSuccess: false,
        normalizationTriggered: false,
        normalizationCompleted: false,
        normalizedData: {
          medications: 0,
          allergies: 0,
          conditions: 0,
          labResults: 0,
          vitals: 0,
          providers: 0
        },
        errors: [],
        processingTime: 0
      }

      try {
        // Step 1: Insert test document
        console.log('  📝 Inserting test document...')
        const { data: document, error: insertError } = await this.supabase
          .from('documents')
          .insert({
            user_id: userId,
            s3_key: `test/${Date.now()}_${sample.fileName}`,
            original_name: sample.fileName,
            mime_type: 'image/jpeg',
            status: 'completed',
            medical_data: sample.medicalData,
            overall_confidence: sample.medicalData.confidence.overall * 100,
            vision_confidence: sample.medicalData.confidence.extraction * 100,
            ocr_confidence: sample.medicalData.confidence.ocrMatch * 100,
            processing_method: 'test'
          })
          .select()
          .single()

        if (insertError) {
          result.errors.push(`Document insert failed: ${insertError.message}`)
          results.push(result)
          continue
        }

        result.documentId = document.id
        result.insertSuccess = true
        console.log(`  ✅ Document inserted with ID: ${document.id}`)

        // Step 2: Wait for normalization trigger (give trigger time to fire)
        console.log('  ⏳ Waiting for normalization trigger...')
        await new Promise(resolve => setTimeout(resolve, 2000))

        // Step 3: Check if normalization was triggered
        const { data: docStatus } = await this.supabase
          .from('documents')
          .select('normalization_status, normalization_errors')
          .eq('id', document.id)
          .single()

        if (docStatus) {
          result.normalizationTriggered = docStatus.normalization_status !== 'pending'
          console.log(`  📊 Normalization status: ${docStatus.normalization_status}`)
          
          if (docStatus.normalization_errors) {
            result.errors.push(...docStatus.normalization_errors)
          }
        }

        // Step 4: Wait for normalization completion
        if (result.normalizationTriggered) {
          console.log('  ⏳ Waiting for normalization completion...')
          let attempts = 0
          const maxAttempts = 10

          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000))
            
            const { data: statusCheck } = await this.supabase
              .from('documents')
              .select('normalization_status')
              .eq('id', document.id)
              .single()

            if (statusCheck?.normalization_status === 'completed') {
              result.normalizationCompleted = true
              console.log('  ✅ Normalization completed')
              break
            } else if (statusCheck?.normalization_status === 'failed') {
              result.errors.push('Normalization failed')
              console.log('  ❌ Normalization failed')
              break
            }

            attempts++
          }

          if (attempts >= maxAttempts) {
            result.errors.push('Normalization timeout - did not complete within expected time')
          }
        }

        // Step 5: Count normalized data
        if (result.normalizationCompleted) {
          console.log('  📊 Counting normalized records...')
          
          const counts = await Promise.all([
            this.supabase.from('patient_medications').select('*', { count: 'exact' }).eq('user_id', userId).contains('source_document_ids', [document.id]),
            this.supabase.from('patient_allergies').select('*', { count: 'exact' }).eq('user_id', userId).contains('source_document_ids', [document.id]),
            this.supabase.from('patient_conditions').select('*', { count: 'exact' }).eq('user_id', userId).contains('source_document_ids', [document.id]),
            this.supabase.from('patient_lab_results').select('*', { count: 'exact' }).eq('user_id', userId).eq('source_document_id', document.id),
            this.supabase.from('patient_vitals').select('*', { count: 'exact' }).eq('user_id', userId).eq('source_document_id', document.id),
            this.supabase.from('patient_providers').select('*', { count: 'exact' }).eq('user_id', userId).contains('source_document_ids', [document.id])
          ])

          result.normalizedData = {
            medications: counts[0].count || 0,
            allergies: counts[1].count || 0,
            conditions: counts[2].count || 0,
            labResults: counts[3].count || 0,
            vitals: counts[4].count || 0,
            providers: counts[5].count || 0
          }

          console.log('  📈 Normalized records created:')
          Object.entries(result.normalizedData).forEach(([type, count]) => {
            if (count > 0) {
              console.log(`    ${type}: ${count}`)
            }
          })
        }

        result.processingTime = Date.now() - startTime

      } catch (error) {
        result.errors.push(`Test error: ${error instanceof Error ? error.message : String(error)}`)
        console.log(`  ❌ Test error: ${error}`)
      }

      results.push(result)
    }

    return results
  }

  /**
   * Generate a comprehensive test report
   */
  generateTestReport(results: NormalizationTestResult[]): string {
    const report = [
      '🧪 NORMALIZATION TEST REPORT',
      '============================',
      `Test Date: ${new Date().toISOString()}`,
      `Documents Tested: ${results.length}`,
      ''
    ]

    // Summary statistics
    const successfulInserts = results.filter(r => r.insertSuccess).length
    const triggeredNormalizations = results.filter(r => r.normalizationTriggered).length
    const completedNormalizations = results.filter(r => r.normalizationCompleted).length
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0)

    report.push('📊 SUMMARY STATISTICS')
    report.push('====================')
    report.push(`Successful Document Inserts: ${successfulInserts}/${results.length}`)
    report.push(`Normalization Triggers: ${triggeredNormalizations}/${results.length}`)
    report.push(`Completed Normalizations: ${completedNormalizations}/${results.length}`)
    report.push(`Total Errors: ${totalErrors}`)
    
    if (results.length > 0) {
      const avgProcessingTime = results.reduce((sum, r) => sum + r.processingTime, 0) / results.length
      report.push(`Average Processing Time: ${avgProcessingTime.toFixed(0)}ms`)
    }
    
    report.push('')

    // Individual test results
    report.push('📄 INDIVIDUAL TEST RESULTS')
    report.push('==========================')

    results.forEach((result, index) => {
      report.push(`\n${index + 1}. ${result.fileName}`)
      report.push(`   Document ID: ${result.documentId || 'N/A'}`)
      report.push(`   Insert Success: ${result.insertSuccess ? '✅' : '❌'}`)
      report.push(`   Normalization Triggered: ${result.normalizationTriggered ? '✅' : '❌'}`)
      report.push(`   Normalization Completed: ${result.normalizationCompleted ? '✅' : '❌'}`)
      report.push(`   Processing Time: ${result.processingTime}ms`)
      
      if (result.normalizationCompleted) {
        const totalRecords = Object.values(result.normalizedData).reduce((sum, count) => sum + count, 0)
        report.push(`   Normalized Records: ${totalRecords}`)
        Object.entries(result.normalizedData).forEach(([type, count]) => {
          if (count > 0) {
            report.push(`     - ${type}: ${count}`)
          }
        })
      }
      
      if (result.errors.length > 0) {
        report.push(`   Errors:`)
        result.errors.forEach(error => {
          report.push(`     - ${error}`)
        })
      }
    })

    // Overall assessment
    report.push('\n🎯 OVERALL ASSESSMENT')
    report.push('====================')
    
    if (completedNormalizations === results.length && totalErrors === 0) {
      report.push('✅ ALL TESTS PASSED - Normalization system is working correctly')
    } else if (completedNormalizations > 0) {
      report.push('⚠️  PARTIAL SUCCESS - Some tests passed but issues detected')
      report.push('   Recommended actions:')
      if (triggeredNormalizations < results.length) {
        report.push('   - Check database triggers are properly configured')
      }
      if (completedNormalizations < triggeredNormalizations) {
        report.push('   - Review Edge Function logs for processing errors')
      }
      if (totalErrors > 0) {
        report.push('   - Address the specific errors listed above')
      }
    } else {
      report.push('❌ TESTS FAILED - Normalization system has critical issues')
      report.push('   Check:')
      report.push('   - Database migrations have been applied')
      report.push('   - Edge Function is deployed and accessible')
      report.push('   - Environment variables are configured')
      report.push('   - Network connectivity between database and Edge Function')
    }

    return report.join('\n')
  }

  /**
   * Clean up test data
   */
  async cleanupTestData(userId: string): Promise<void> {
    console.log('🧹 Cleaning up test data...')
    
    // Get test documents
    const { data: testDocs } = await this.supabase
      .from('documents')
      .select('id')
      .eq('user_id', userId)
      .eq('processing_method', 'test')

    if (testDocs && testDocs.length > 0) {
      const testDocIds = testDocs.map(doc => doc.id)
      
      // Delete normalized data
      await Promise.all([
        this.supabase.from('patient_medications').delete().eq('user_id', userId).overlaps('source_document_ids', testDocIds),
        this.supabase.from('patient_allergies').delete().eq('user_id', userId).overlaps('source_document_ids', testDocIds),
        this.supabase.from('patient_conditions').delete().eq('user_id', userId).overlaps('source_document_ids', testDocIds),
        this.supabase.from('patient_lab_results').delete().eq('user_id', userId).in('source_document_id', testDocIds),
        this.supabase.from('patient_vitals').delete().eq('user_id', userId).in('source_document_id', testDocIds),
        this.supabase.from('patient_providers').delete().eq('user_id', userId).overlaps('source_document_ids', testDocIds)
      ])
      
      // Delete test documents
      await this.supabase
        .from('documents')
        .delete()
        .eq('user_id', userId)
        .eq('processing_method', 'test')
      
      console.log(`✅ Cleaned up ${testDocs.length} test documents and associated data`)
    } else {
      console.log('ℹ️  No test data found to clean up')
    }
  }
}