# Phase 3: Pass 2 Clinical Enrichment - Planning

**Date:** 26 September 2025
**Status:** Planning Phase
**Dependencies:** Phase 2 (Pass 1 Entity Detection) completion
**Purpose:** Extract structured medical data using entity-specific bridge schemas

---

## 🎯 **PASS 2 OVERVIEW**

### **Purpose: Structured Clinical Data Extraction**
**Goal:** Convert classified entities into structured clinical data for V3 database storage
**AI Model:** GPT-4 (accuracy-optimized for medical precision)
**Cost Target:** ~$0.003-0.006 per document (70% reduction vs single comprehensive call)

### **Dynamic Processing Based on Pass 1 Results**
```typescript
interface Pass2ProcessingStrategy {
  clinical_event: {
    processing: 'FULL_ENRICHMENT',
    schemas: ['patient_clinical_events', 'patient_observations', 'patient_interventions'],
    ai_calls: 'Multiple targeted calls per entity category',
    database_writes: 'Complete clinical data extraction'
  },

  healthcare_context: {
    processing: 'LIMITED_ENRICHMENT',
    schemas: ['healthcare_encounters', 'patient_demographics'],
    ai_calls: 'Single context extraction call',
    database_writes: 'Contextual data only'
  },

  document_structure: {
    processing: 'AUDIT_ONLY',
    schemas: [],
    ai_calls: 'None - skip AI processing',
    database_writes: 'Audit trail logging only'
  }
}
```

---

## 🏗️ **IMPLEMENTATION APPROACH**

### **Pass 2 Clinical Enrichment Class**
```typescript
class Pass2ClinicalEnrichment {
  constructor(
    private openaiClient: OpenAI,
    private schemaLoader: V3BridgeSchemaLoader,
    private databaseClient: SupabaseClient
  ) {}

  async enrichClinicalData(
    entities: EntityDetectionResult[],
    schemas: BridgeSchema[],
    documentContext: DocumentContext
  ): Promise<Pass2ProcessingResult> {
    const results: ClinicalEvent[] = [];

    // Process each entity category with appropriate AI calls
    for (const category of ['clinical_event', 'healthcare_context']) {
      if (entities[category]?.length > 0) {
        const enrichedData = await this.processEntityCategory(
          category,
          entities[category],
          schemas.filter(s => s.category === category),
          documentContext
        );
        results.push(...enrichedData);
      }
    }

    // Write clinical data to V3 database
    const databaseWrites = await this.writeClinicalDataToDatabase(results);

    return {
      clinicalEvents: results,
      databaseWrites: databaseWrites,
      processingMetadata: this.generateProcessingMetadata()
    };
  }

  private async processEntityCategory(
    category: EntityCategory,
    entities: EntityDetectionResult[],
    schemas: BridgeSchema[],
    context: DocumentContext
  ): Promise<ClinicalEvent[]> {
    // AI processing with dynamic schema application
    const clinicalEnrichmentPrompt = this.buildEnrichmentPrompt(
      entities,
      schemas,
      context
    );

    const response = await this.openaiClient.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: clinicalEnrichmentPrompt }],
      temperature: 0.1,
      max_tokens: 4000
    });

    return this.parseClinicalEnrichmentResponse(response, schemas);
  }
}
```

### **Database Integration**
```typescript
interface DatabaseWriteStrategy {
  // Hierarchical data writes following V3 architecture
  async writeClinicalDataToDatabase(
    clinicalEvents: ClinicalEvent[]
  ): Promise<DatabaseWriteResult[]> {
    const results: DatabaseWriteResult[] = [];

    for (const event of clinicalEvents) {
      // 1. Write to central hub (patient_clinical_events)
      const hubRecord = await this.writeToPatientClinicalEvents(event);

      // 2. Write to appropriate detail table based on activity_type
      if (event.activity_type === 'observation') {
        await this.writeToPatientObservations(event, hubRecord.id);
      } else if (event.activity_type === 'intervention') {
        await this.writeToPatientInterventions(event, hubRecord.id);
      }

      // 3. Update timeline optimization table
      await this.writeToHealthcareTimelineEvents(event, hubRecord.id);

      results.push({
        event_id: hubRecord.id,
        tables_written: this.getWrittenTables(event),
        audit_trail: this.createAuditRecord(event, hubRecord.id)
      });
    }

    return results;
  }
}
```

---

## 📊 **SUCCESS METRICS**

### **Clinical Data Extraction**
- **Extraction Completeness:** >95% of clinical entities successfully extracted
- **Database Write Success:** >99% successful writes to V3 tables
- **Data Integrity:** 100% referential integrity maintained (foreign keys valid)

### **Performance Targets**
- **Processing Time:** 3-5 seconds per document
- **Cost per Document:** $0.003-0.006
- **Token Efficiency:** 70% reduction vs single comprehensive AI call

### **System Functionality**
- **Pass 2 Completion:** System fully functional after this phase
- **Timeline Integration:** Clinical events appear in UI timeline immediately
- **Audit Trail:** Complete processing provenance captured

---

**Critical Success Factor:** After Pass 2 completion, the system is fully functional with clinical data extraction, database storage, and UI display operational.

**Dependencies:**
- Phase 1: Bridge schema system for dynamic schema loading
- Phase 2: Pass 1 entity detection for processing strategy
- Database: V3 tables operational for clinical data writes

**Next Phase:** Pass 3 Semantic Narratives (optional enhancement layer)