#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * AI Output Validation Script
 * 
 * This script validates the current AI model outputs in the Guardian database
 * to ensure accuracy and completeness before implementing normalization.
 * 
 * Usage:
 *   deno run --allow-net --allow-env --allow-read scripts/validateCurrentAIOutput.ts
 * 
 * Environment variables required:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AIOutputValidator, type MedicalData, type ValidationResult } from '../utils/validateAIOutput.ts'

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing required environment variables:')
  console.error('   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  console.error('   Please set these in your .env file or environment')
  Deno.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

interface Document {
  id: string
  user_id: string
  original_name: string | null
  status: string
  medical_data: MedicalData | null
  extracted_text: string | null
  overall_confidence: number | null
  vision_confidence: number | null
  ocr_confidence: number | null
  processing_method: string | null
  created_at: string
  processed_at: string | null
}

async function main() {
  console.log('🔍 Guardian AI Output Validation Tool')
  console.log('=====================================')
  console.log()

  try {
    // 1. Fetch completed documents with medical data
    console.log('📋 Fetching completed documents with medical data...')
    
    const { data: documents, error } = await supabase
      .from('documents')
      .select('*')
      .eq('status', 'completed')
      .not('medical_data', 'is', null)
      .order('processed_at', { ascending: false })
      .limit(20) // Validate last 20 processed documents

    if (error) {
      throw new Error(`Database query failed: ${error.message}`)
    }

    if (!documents || documents.length === 0) {
      console.log('⚠️  No completed documents with medical data found.')
      console.log('   This could mean:')
      console.log('   - No documents have been processed yet')
      console.log('   - All processed documents failed')
      console.log('   - Database connection issues')
      console.log()
      console.log('💡 Try uploading and processing a test document first.')
      return
    }

    console.log(`✅ Found ${documents.length} completed documents to validate`)
    console.log()

    // 2. Validate each document
    const validationResults: Array<{
      document: Document
      validation: ValidationResult
    }> = []

    for (const doc of documents) {
      console.log(`🔍 Validating: ${doc.original_name || doc.id}`)
      
      try {
        const validation = AIOutputValidator.validateMedicalData(
          doc.medical_data as MedicalData,
          doc.extracted_text || '',
          doc.id
        )
        
        validationResults.push({ document: doc, validation })
        
        // Quick status indicator
        const status = validation.isValid ? '✅' : '❌'
        const score = validation.qualityScore.toFixed(0)
        const confidence = validation.confidence > 0 ? `${(validation.confidence * 100).toFixed(0)}%` : 'N/A'
        
        console.log(`   ${status} Quality: ${score}/100, Confidence: ${confidence}`)
        
        if (validation.criticalIssues.length > 0) {
          console.log(`   🚨 ${validation.criticalIssues.length} critical issue(s)`)
        }
        
        if (validation.warnings.length > 0) {
          console.log(`   ⚠️  ${validation.warnings.length} warning(s)`)
        }
        
      } catch (validationError) {
        console.log(`   ❌ Validation failed: ${validationError}`)
        
        // Create failed validation result
        const failedValidation: ValidationResult = {
          isValid: false,
          confidence: 0,
          criticalIssues: [`Validation error: ${validationError}`],
          warnings: [],
          qualityScore: 0,
          fieldCompleteness: { patientInfo: 0, medicalData: 0, provider: 0, dates: 0 },
          medicalAccuracy: {
            medicationsValid: false,
            allergiesValid: false,
            vitalsValid: false,
            labResultsValid: false,
            datesValid: false
          },
          recommendations: ['Fix validation errors before proceeding']
        }
        
        validationResults.push({ document: doc, validation: failedValidation })
      }
    }

    console.log()

    // 3. Generate summary statistics
    console.log('📊 VALIDATION SUMMARY')
    console.log('=====================')
    
    const totalDocs = validationResults.length
    const validDocs = validationResults.filter(r => r.validation.isValid).length
    const averageQuality = validationResults.reduce((sum, r) => sum + r.validation.qualityScore, 0) / totalDocs
    const averageConfidence = validationResults
      .filter(r => r.validation.confidence > 0)
      .reduce((sum, r) => sum + r.validation.confidence, 0) / validationResults.filter(r => r.validation.confidence > 0).length || 0

    console.log(`📋 Documents Validated: ${totalDocs}`)
    console.log(`✅ Valid Documents: ${validDocs} (${((validDocs / totalDocs) * 100).toFixed(1)}%)`)
    console.log(`📈 Average Quality Score: ${averageQuality.toFixed(1)}/100`)
    console.log(`🎯 Average Confidence: ${averageConfidence > 0 ? (averageConfidence * 100).toFixed(1) + '%' : 'Not provided'}`)
    console.log()

    // 4. Processing method breakdown
    const processingMethods = validationResults.reduce((acc, r) => {
      const method = r.document.processing_method || 'unknown'
      acc[method] = (acc[method] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    console.log('🔧 Processing Methods:')
    Object.entries(processingMethods).forEach(([method, count]) => {
      console.log(`   ${method}: ${count} documents`)
    })
    console.log()

    // 5. Document type analysis
    const documentTypes = validationResults.reduce((acc, r) => {
      const type = r.validation.isValid && r.document.medical_data?.documentType || 'unknown'
      acc[type] = (acc[type] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    console.log('📄 Document Types:')
    Object.entries(documentTypes).forEach(([type, count]) => {
      console.log(`   ${type}: ${count} documents`)
    })
    console.log()

    // 6. Critical issues summary
    const allCriticalIssues = validationResults.flatMap(r => r.validation.criticalIssues)
    const allWarnings = validationResults.flatMap(r => r.validation.warnings)

    if (allCriticalIssues.length > 0) {
      console.log('🚨 CRITICAL ISSUES FOUND')
      console.log('========================')
      
      // Group and count similar issues
      const issueGroups = allCriticalIssues.reduce((acc, issue) => {
        acc[issue] = (acc[issue] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      Object.entries(issueGroups)
        .sort(([,a], [,b]) => b - a)
        .forEach(([issue, count]) => {
          console.log(`   ${count}x: ${issue}`)
        })
      console.log()
    }

    if (allWarnings.length > 0) {
      console.log('⚠️  COMMON WARNINGS')
      console.log('==================')
      
      // Group and count similar warnings
      const warningGroups = allWarnings.reduce((acc, warning) => {
        acc[warning] = (acc[warning] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      Object.entries(warningGroups)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10) // Top 10 warnings
        .forEach(([warning, count]) => {
          console.log(`   ${count}x: ${warning}`)
        })
      console.log()
    }

    // 7. Readiness assessment for normalization
    console.log('🎯 NORMALIZATION READINESS ASSESSMENT')
    console.log('====================================')
    
    const validPercentage = (validDocs / totalDocs) * 100
    const qualityThreshold = 85 // Minimum quality for normalization
    const confidenceThreshold = 80 // Minimum confidence for normalization

    if (validPercentage >= 95 && averageQuality >= qualityThreshold) {
      console.log('✅ READY FOR NORMALIZATION')
      console.log('   All quality thresholds met. Proceed with normalization implementation.')
    } else {
      console.log('⚠️  NOT READY FOR NORMALIZATION')
      console.log('   Address the following issues first:')
      
      if (validPercentage < 95) {
        console.log(`   - Validation rate too low: ${validPercentage.toFixed(1)}% (need ≥95%)`)
      }
      
      if (averageQuality < qualityThreshold) {
        console.log(`   - Average quality too low: ${averageQuality.toFixed(1)} (need ≥${qualityThreshold})`)
      }
      
      if (averageConfidence > 0 && averageConfidence * 100 < confidenceThreshold) {
        console.log(`   - Average confidence too low: ${(averageConfidence * 100).toFixed(1)}% (need ≥${confidenceThreshold}%)`)
      }
    }
    console.log()

    // 8. Detailed reports for failed validations
    const failedValidations = validationResults.filter(r => !r.validation.isValid)
    
    if (failedValidations.length > 0 && failedValidations.length <= 5) {
      console.log('📝 DETAILED REPORTS FOR FAILED VALIDATIONS')
      console.log('==========================================')
      
      for (const { document, validation } of failedValidations) {
        console.log()
        console.log(AIOutputValidator.generateValidationReport(validation, document.id))
        console.log()
      }
    }

    // 9. Next steps recommendations
    console.log('💡 NEXT STEPS')
    console.log('=============')
    
    if (validPercentage >= 95 && averageQuality >= qualityThreshold) {
      console.log('1. ✅ Proceed with normalization table creation')
      console.log('2. ✅ Implement normalization Edge Function')
      console.log('3. ✅ Set up database triggers')
      console.log('4. ✅ Test with sample data')
    } else {
      console.log('1. 🔧 Fix critical issues in AI model prompts')
      console.log('2. 🔧 Improve confidence scoring')
      console.log('3. 🔧 Test with more diverse document types')
      console.log('4. 🔧 Re-run validation until ready')
    }
    console.log()

  } catch (error) {
    console.error('❌ Validation failed:', error)
    console.error()
    console.error('Common causes:')
    console.error('- Database connection issues')
    console.error('- Missing environment variables')
    console.error('- Supabase permissions')
    Deno.exit(1)
  }
}

// Run the validation
if (import.meta.main) {
  await main()
}