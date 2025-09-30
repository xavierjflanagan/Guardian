# Phase 1.1: OpenAI GPT-4 Integration Implementation Plan

**Date**: 8 September 2025  
**Phase**: 1.1 - OpenAI GPT-4 Integration  
**Priority**: CRITICAL - Foundation for three-pass AI processing  
**Dependencies**: Phase 1.0 V3 Bridge Schema Update MUST be complete first  
**Estimated Time**: 2-3 days (after Phase 1.0)  
**Status**: Planning Complete - Waiting for Phase 1.0  

---

## **EXECUTIVE SUMMARY**

**Objective**: Replace simulation code in `processShellFile()` method with real OpenAI GPT-4 three-pass AI processing pipeline

**Current State**: 
- ✅ Infrastructure operational (worker, job queue, database)
- ✅ OpenAI API key configured in environment
- ❌ Worker using simulation code only (`await this.sleep(2000)`)
- ❌ **BLOCKING**: V3 bridge schemas not yet created (Phase 1.0 required)

**Target State**:
- ✅ Phase 1.0 V3 bridge schemas operational
- ✅ Real file download from Supabase Storage
- ✅ Three-pass AI processing with bridge schema integration
- ✅ Clinical data extraction to V3 database tables
- ✅ Error handling and recovery

---

## **CRITICAL DEPENDENCY: Phase 1.0 Bridge Schemas**

**⚠️ BLOCKING DEPENDENCY**: This phase cannot begin until Phase 1.0 is complete.

**Why Bridge Schemas Are Required**:
1. **Pass 2 Clinical Enrichment** requires bridge schemas to structure AI output correctly
2. **Database Compatibility**: AI output must match V3 table structure exactly  
3. **Dynamic Schema Loading**: Pass 1 entity detection → bridge schema selection → Pass 2
4. **Current State**: Existing bridge schemas target V2 tables (incompatible)

**Phase 1.0 Deliverables Needed**:
- ✅ V3 bridge schemas for all clinical tables
- ✅ Dynamic schema loading system (`V3BridgeSchemaLoader`)
- ✅ Entity category → table mapping
- ✅ Schema versioning (minimal/detailed/source)

**Integration Points**:
- Task 1.1.4 (Pass 2) depends on `V3BridgeSchemaLoader.getSchemasForEntityCategories()`
- Task 1.1.6 (processShellFile) uses bridge schema system throughout

**Status Check Before Implementation**: Verify Phase 1.0 deliverables exist and are tested.

---

## **IMPLEMENTATION TASKS**

### **Task 1.1.1: Worker Class Enhancement**
**File**: `apps/render-worker/src/worker.ts`
**Lines**: 71-85 (constructor area)

**Changes Required**:
```typescript
class V3Worker {
  private supabase: SupabaseClient;
  private openai: OpenAI;  // ADD THIS
  private workerId: string;
  // ... existing properties

  constructor() {
    this.workerId = config.worker.id;
    this.supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
    
    // ADD OpenAI client initialization
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });
    
    console.log(`[${this.workerId}] V3 Worker initialized with AI processing`);
  }
}
```

**Validation**: Console log shows "with AI processing" on startup

---

### **Task 1.1.2: File Download Implementation**
**File**: `apps/render-worker/src/worker.ts`
**Method**: `processShellFile()` lines 204-238
**Dependency**: Supabase Storage integration

**Implementation**:
```typescript
private async downloadShellFile(shellFileId: string): Promise<{
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
}> {
  // Get shell file metadata from database
  const { data: shellFile, error: dbError } = await this.supabase
    .from('shell_files')
    .select('original_filename, storage_path, mime_type')
    .eq('id', shellFileId)
    .single();

  if (dbError || !shellFile) {
    throw new Error(`Shell file not found: ${dbError?.message}`);
  }

  // Download file from Supabase Storage
  const { data: fileData, error: storageError } = await this.supabase.storage
    .from('medical-docs')
    .download(shellFile.storage_path);

  if (storageError || !fileData) {
    throw new Error(`File download failed: ${storageError?.message}`);
  }

  // Convert to Buffer for processing
  const fileBuffer = Buffer.from(await fileData.arrayBuffer());

  return {
    fileBuffer,
    fileName: shellFile.original_filename,
    mimeType: shellFile.mime_type
  };
}
```

**Error Cases**:
- Shell file not found in database
- File not found in storage
- Storage download failure
- Buffer conversion failure

**Validation**: Successfully download and log file size

---

### **Task 1.1.3: Pass 1 - Entity Detection Implementation**
**Method**: `executePass1EntityDetection()`
**AI Model**: GPT-4o-mini (cost optimization)
**Purpose**: Comprehensive entity identification with clinical context

**Implementation**:
```typescript
private async executePass1EntityDetection(
  fileContent: string, 
  fileName: string
): Promise<{
  entities: EntityDetectionResult[];
  totalEntities: number;
  processingMetadata: {
    model: string;
    tokenUsage: number;
    processingTime: number;
    confidence: number;
  };
}> {
  const startTime = Date.now();
  
  const prompt = `
MEDICAL DOCUMENT ENTITY CLASSIFICATION - Pass 1

DOCUMENT: ${fileName}
CONTENT:
${fileContent}

TASK: Identify ALL medical entities using 3-category classification:

1. CLINICAL_EVENT: Direct medical actions, observations, findings
   - Subtypes: vital_sign, lab_result, procedure, medication, diagnosis, allergy, immunization
   - Examples: "Blood pressure 120/80", "Prescribed Lisinopril", "Allergic to penicillin"

2. HEALTHCARE_CONTEXT: Provider and encounter information  
   - Subtypes: provider_info, facility_info, encounter_details, appointment_info
   - Examples: "Dr. Smith, Cardiologist", "Main Street Clinic", "Follow-up visit 2024-03-15"

3. DOCUMENT_STRUCTURE: Document formatting and administrative elements
   - Subtypes: header, footer, signature, date_stamp, page_number
   - Examples: Document headers, signatures, administrative text

OUTPUT FORMAT (JSON):
{
  "entities": [
    {
      "entity_id": "unique_id",
      "category": "clinical_event|healthcare_context|document_structure", 
      "subtype": "specific_subtype",
      "text_content": "extracted_text",
      "confidence": 0.0-1.0,
      "processing_priority": "high|medium|low"
    }
  ],
  "summary": {
    "total_entities": number,
    "clinical_events": number,
    "healthcare_context": number,
    "document_structure": number
  }
}
  `;

  try {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 4000
    });

    const aiResponse = response.choices[0]?.message?.content;
    if (!aiResponse) {
      throw new Error('No response from OpenAI Pass 1');
    }

    // Parse JSON response
    const result = JSON.parse(aiResponse);
    
    return {
      entities: result.entities,
      totalEntities: result.summary.total_entities,
      processingMetadata: {
        model: 'gpt-4o-mini',
        tokenUsage: response.usage?.total_tokens || 0,
        processingTime: Date.now() - startTime,
        confidence: this.calculateAverageConfidence(result.entities)
      }
    };
    
  } catch (error) {
    console.error(`[${this.workerId}] Pass 1 failed:`, error);
    throw new Error(`Pass 1 Entity Detection failed: ${error.message}`);
  }
}

private calculateAverageConfidence(entities: any[]): number {
  if (!entities.length) return 0;
  const total = entities.reduce((sum, entity) => sum + (entity.confidence || 0), 0);
  return Math.round((total / entities.length) * 100) / 100;
}
```

**Success Criteria**:
- JSON parsing successful
- Entities categorized into 3 categories
- Average confidence > 0.7
- Processing time < 30 seconds

**Error Handling**:
- JSON parsing failures
- API timeout/rate limiting
- Low confidence results
- Token limit exceeded

---

### **Task 1.1.4: Pass 2 - Clinical Enrichment Implementation**
**Method**: `executePass2ClinicalEnrichment()`  
**AI Model**: GPT-4 (high accuracy for medical analysis)
**Purpose**: Extract clinical data to V3 database schema using Phase 1.0 bridge schemas  
**Dependencies**: Phase 1.0 `V3BridgeSchemaLoader` system must be operational

**Implementation**:
```typescript
private async executePass2ClinicalEnrichment(
  entities: EntityDetectionResult[],
  fileContent: string,
  shellFileId: string
): Promise<{
  clinicalEvents: ClinicalEventV3[];
  observations: ObservationV3[];
  interventions: InterventionV3[];
  encounters: EncounterV3[];
}> {
  // Filter for clinical events only (high processing priority)
  const clinicalEntities = entities.filter(e => 
    e.category === 'clinical_event' && e.processing_priority === 'high'
  );

  if (clinicalEntities.length === 0) {
    console.log(`[${this.workerId}] No high-priority clinical entities found`);
    return { clinicalEvents: [], observations: [], interventions: [], encounters: [] };
  }

  const prompt = `
CLINICAL DATA ENRICHMENT - Pass 2

TASK: Extract clinical data for V3 database schema from identified entities.

ENTITIES TO PROCESS:
${JSON.stringify(clinicalEntities, null, 2)}

ORIGINAL DOCUMENT CONTEXT:
${fileContent}

EXTRACT TO V3 SCHEMA:

1. PATIENT_CLINICAL_EVENTS (Master timeline records):
   - event_date: Date/time of clinical event
   - event_type: 'observation' | 'intervention' | 'condition' | 'encounter' 
   - event_name: Human-readable event description
   - event_category: Specific clinical category
   - clinical_significance: 'routine' | 'significant' | 'critical'
   - confidence_score: AI extraction confidence (0.0-1.0)

2. PATIENT_OBSERVATIONS (Detailed measurements):
   - observation_type: 'vital_sign' | 'lab_result' | 'assessment'
   - observation_name: Specific observation name
   - value_numeric: Numeric value if applicable
   - value_text: Text description
   - unit: Measurement unit
   - interpretation: 'normal' | 'abnormal' | 'critical'
   - reference_range: Normal range if known

3. PATIENT_INTERVENTIONS (Treatments):
   - intervention_type: 'medication' | 'procedure' | 'therapy'
   - intervention_name: Treatment name
   - medication_name: If medication
   - dosage: Dose amount
   - frequency: Administration frequency
   - indication: Reason for treatment

OUTPUT (JSON):
{
  "clinical_events": [...],
  "observations": [...],
  "interventions": [...],
  "encounters": [...]
}
  `;

  try {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 6000
    });

    const aiResponse = response.choices[0]?.message?.content;
    if (!aiResponse) {
      throw new Error('No response from OpenAI Pass 2');
    }

    const result = JSON.parse(aiResponse);
    
    // Add shell_file_id to all extracted data
    result.clinical_events?.forEach(event => {
      event.shell_file_id = shellFileId;
      event.processing_job_id = this.currentJobId; // Track job origin
    });

    result.observations?.forEach(obs => {
      obs.shell_file_id = shellFileId;
    });

    result.interventions?.forEach(int => {
      int.shell_file_id = shellFileId;
    });

    return result;

  } catch (error) {
    console.error(`[${this.workerId}] Pass 2 failed:`, error);
    throw new Error(`Pass 2 Clinical Enrichment failed: ${error.message}`);
  }
}
```

**Success Criteria**:
- Clinical events extracted with proper categorization
- Observations include numeric values and units where applicable
- Interventions properly categorized (medications vs procedures)
- All records include confidence scores > 0.8

---

### **Task 1.1.5: Pass 3 - Semantic Narratives Implementation**
**Method**: `executePass3SemanticNarratives()`
**Purpose**: Create clinical storylines from structured data (cost-optimized)

**Implementation**:
```typescript
private async executePass3SemanticNarratives(
  clinicalData: any,
  shellFileId: string
): Promise<{
  narratives: ClinicalNarrativeV3[];
  shellFileSynthesis: string;
}> {
  // Process structured data (not raw text) for cost optimization
  const prompt = `
SEMANTIC NARRATIVE CREATION - Pass 3

TASK: Create clinical storylines from structured clinical data.

INPUT DATA:
${JSON.stringify(clinicalData, null, 2)}

Create clinical narratives based on medical meaning:

1. Group related clinical events into coherent storylines
2. Identify narrative purposes (e.g., "hypertension_management", "acute_episode")
3. Create clinically meaningful summaries
4. Generate overall shell file synthesis

OUTPUT (JSON):
{
  "narratives": [
    {
      "narrative_purpose": "clinical_storyline_name",
      "clinical_classification": "chronic_condition|acute_episode|reference_doc", 
      "ai_narrative_summary": "Clinical storyline summary",
      "semantic_coherence_score": 0.0-1.0,
      "related_event_ids": ["event_id_1", "event_id_2"]
    }
  ],
  "shell_file_synthesis": "Intelligent overview of all narratives in document"
}
  `;

  try {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 3000
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{}');
    
    // Add shell_file_id to narratives
    result.narratives?.forEach(narrative => {
      narrative.shell_file_id = shellFileId;
    });

    return result;

  } catch (error) {
    console.error(`[${this.workerId}] Pass 3 failed:`, error);
    throw new Error(`Pass 3 Semantic Narratives failed: ${error.message}`);
  }
}
```

---

### **Task 1.1.6: Updated processShellFile() Method**
**Purpose**: Replace simulation code with real three-pass processing

**Implementation Structure**:
```typescript
private async processShellFile(job: Job): Promise<any> {
  const { shell_file_id, patient_id } = job.job_payload;
  this.currentJobId = job.id;
  
  console.log(`[${this.workerId}] Processing shell file ${shell_file_id} with AI`);
  
  try {
    // Step 1: Download file
    const fileData = await this.downloadShellFile(shell_file_id);
    
    // Step 2: Extract text (OCR if needed)
    const extractedText = await this.extractTextFromFile(fileData);
    
    // Step 3: Pass 1 - Entity Detection
    const pass1Result = await this.executePass1EntityDetection(extractedText, fileData.fileName);
    
    // Step 4: Pass 2 - Clinical Enrichment  
    const pass2Result = await this.executePass2ClinicalEnrichment(
      pass1Result.entities, extractedText, shell_file_id
    );
    
    // Step 5: Pass 3 - Semantic Narratives
    const pass3Result = await this.executePass3SemanticNarratives(pass2Result, shell_file_id);
    
    // Step 6: Write to database
    await this.writeClinicalDataToDatabase(pass2Result, pass3Result, patient_id);
    
    // Step 7: Update shell file status
    await this.updateShellFileComplete(shell_file_id, pass3Result.shellFileSynthesis);
    
    return {
      shell_file_id,
      patient_id,
      status: 'completed',
      processing_summary: {
        entities_detected: pass1Result.totalEntities,
        clinical_events: pass2Result.clinicalEvents.length,
        narratives_created: pass3Result.narratives.length,
        processing_time: pass1Result.processingMetadata.processingTime
      }
    };
    
  } catch (error) {
    console.error(`[${this.workerId}] Processing failed:`, error);
    
    // Update shell file with error status
    await this.supabase
      .from('shell_files')
      .update({
        status: 'failed',
        processing_error: error.message,
        processing_completed_at: new Date().toISOString()
      })
      .eq('id', shell_file_id);
      
    throw error;
  }
}
```

---

## **TESTING STRATEGY**

### **Unit Tests**
- [ ] File download with valid shell_file_id
- [ ] File download with invalid shell_file_id  
- [ ] OpenAI API responses parsing
- [ ] Error handling for each pass
- [ ] Database write validation

### **Integration Tests**
- [ ] End-to-end: File upload → Processing → Database → Timeline
- [ ] Real document processing with medical content
- [ ] Error recovery and job rescheduling
- [ ] Performance under normal load

### **Validation Checks**
- [ ] Clinical data appears in V3 tables (`patient_clinical_events`, etc.)
- [ ] Shell file status updates to 'completed'
- [ ] Processing metadata tracked correctly
- [ ] No simulation code remaining

---

## **SUCCESS CRITERIA**

### **Functional Requirements**
- [ ] Real file download from Supabase Storage
- [ ] Three-pass AI processing operational
- [ ] Clinical data extraction to V3 database
- [ ] Error handling prevents job failures
- [ ] No simulation code remaining

### **Performance Targets**
- [ ] Processing time: < 15 seconds per document
- [ ] Entity detection confidence: > 0.7 average
- [ ] Clinical enrichment confidence: > 0.8 average
- [ ] Success rate: > 95% for valid medical documents

### **Quality Gates**
- [ ] All extracted clinical events have valid dates
- [ ] Numeric observations include units
- [ ] Medications include dosage and frequency where available
- [ ] Confidence scores tracked for all AI processing

---

## **RISK MITIGATION**

### **Technical Risks**
- **OpenAI API failures**: Implement retry with exponential backoff
- **Large file processing**: Add token management and chunking
- **Database write failures**: Transaction rollback on errors
- **Memory usage**: Stream processing for large files

### **Medical Data Risks**
- **Low confidence extractions**: Flag for manual review (confidence < 0.7)
- **Missing critical information**: Validate required fields
- **Incorrect medical coding**: Cross-reference with medical databases
- **Patient safety**: Audit all medication and allergy extractions

---

## **DEPLOYMENT PLAN**

### **Phase 1.1 Rollout**
1. **Development**: Implement in local environment
2. **Testing**: Validate with test medical documents  
3. **Staging**: Deploy to staging Render.com worker
4. **Production**: Deploy to production after validation

### **Rollback Strategy**
- Keep simulation code commented out for emergency rollback
- Monitor processing success rates closely
- Immediate rollback if success rate drops below 90%

---

**Status**: READY FOR IMPLEMENTATION  
**Next Step**: Begin Task 1.1.1 - Worker Class Enhancement  
**Dependencies**: None (all infrastructure operational)  
**Estimated Completion**: 2-3 days with testing