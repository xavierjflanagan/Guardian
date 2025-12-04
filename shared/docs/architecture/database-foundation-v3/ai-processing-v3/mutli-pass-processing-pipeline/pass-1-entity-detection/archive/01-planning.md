# Phase 2: Pass 1 Entity Detection - Planning

**Date:** 26 September 2025
**Status:** Planning Phase
**Dependencies:** Phase 1 (Bridge Schema System) completion
**Purpose:** Build 3-category entity classification system from scratch

---

## 🎯 **PASS 1 OVERVIEW**

### **Purpose: Document Content Classification**
**Goal:** Classify all document content into processing categories that determine Pass 2 workload
**AI Model:** GPT-4o-mini (cost-optimized for classification tasks)
**Cost Target:** ~$0.0002-0.0005 per document

### **Three-Category Classification System**
```typescript
const ENTITY_PROCESSING_CATEGORIES = {
  clinical_event: {
    definition: 'Medical observations, interventions, diagnoses requiring full analysis',
    examples: ['BP: 140/90 mmHg', 'Lisinopril 10mg daily', 'Hypertension'],
    processing: 'Full Pass 2 enrichment + comprehensive database storage',
    schemas: ['patient_clinical_events', 'patient_observations', 'patient_interventions'],
    timeline_relevance: 'high',
    cost_impact: 'highest_value'
  },

  healthcare_context: {
    definition: 'Contextual healthcare information for profile matching and care coordination',
    examples: ['Dr. Sarah Johnson', 'Memorial Hospital', 'Patient: John Smith'],
    processing: 'Limited Pass 2 enrichment + contextual database storage',
    schemas: ['healthcare_encounters', 'patient_demographics'],
    timeline_relevance: 'medium',
    cost_impact: 'medium_value'
  },

  document_structure: {
    definition: 'Formatting elements and non-clinical content for completeness',
    examples: ['[Signature]', 'Hospital letterhead', 'Page 1 of 3'],
    processing: 'Skip Pass 2 - logging only in audit trail',
    schemas: [],
    timeline_relevance: 'low',
    cost_impact: 'minimal_cost'
  }
};
```

---

## 🏗️ **IMPLEMENTATION APPROACH**

### **Pass 1 Entity Detection Class**
```typescript
class Pass1EntityDetector {
  constructor(
    private openaiClient: OpenAI,
    private schemaLoader: V3BridgeSchemaLoader
  ) {}

  async detectEntities(
    documentText: string,
    spatialData: BoundingBox[],
    patientContext: PatientContext
  ): Promise<Pass1ProcessingResult> {
    // Single AI call with 3-category taxonomy
    const entityDetectionPrompt = this.buildEntityDetectionPrompt(
      documentText,
      spatialData,
      patientContext
    );

    const response = await this.openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: entityDetectionPrompt }],
      temperature: 0.1,
      max_tokens: 2000
    });

    return this.parseEntityDetectionResponse(response);
  }

  private buildEntityDetectionPrompt(
    text: string,
    spatial: BoundingBox[],
    context: PatientContext
  ): string {
    // AI prompt construction with 3-category classification guidance
  }
}
```

### **Integration with Bridge Schema System**
**Pass 1 Output → Schema Loading:**
```typescript
interface Pass1ToPass2Integration {
  async loadSchemasForPass2(
    pass1Results: Pass1ProcessingResult,
    tokenBudget: number
  ): Promise<BridgeSchema[]> {
    // Determine which schemas are needed based on Pass 1 categories
    const activeCategories = Object.keys(pass1Results.entities_by_category)
      .filter(category => pass1Results.entities_by_category[category].length > 0);

    // Load appropriate bridge schemas
    return await this.schemaLoader.getSchemasForEntityCategories(activeCategories);
  }
}
```

---

## 📊 **SUCCESS METRICS**

### **Classification Accuracy**
- **Overall Accuracy:** >90% correct category assignment
- **Clinical Event Detection:** >95% (most critical for processing)
- **False Positive Rate:** <5% for document_structure category

### **Performance Targets**
- **Processing Time:** 1-2 seconds per document
- **Cost per Document:** $0.0002-0.0005
- **Token Usage:** <2000 tokens per classification call

---

**Dependencies:** Phase 1 bridge schema system operational
**Next Phase:** Pass 2 Clinical Enrichment using Pass 1 results