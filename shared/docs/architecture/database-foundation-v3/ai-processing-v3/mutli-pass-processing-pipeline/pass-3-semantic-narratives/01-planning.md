# Phase 4: Pass 3 Semantic Narratives - Planning

**Date:** 26 September 2025
**Status:** Planning Phase
**Dependencies:** Phase 3 (Pass 2 Clinical Enrichment) completion
**Purpose:** Create clinical storylines from structured Pass 2 data

---

## 🎯 **PASS 3 OVERVIEW**

### **Purpose: Semantic Clinical Narratives**
**Goal:** Transform structured clinical data into meaningful medical storylines
**AI Model:** GPT-4 (optimized for narrative coherence and clinical storytelling)
**Cost Target:** ~$0.001-0.003 per document (processes structured JSON vs raw text)

### **Enhancement Layer Design**
```typescript
interface Pass3Architecture {
  input: 'Structured Pass 2 clinical data (JSON format)',
  processing: 'Clinical storyline creation with narrative coherence',
  output: 'Semantic narratives + shell file synthesis',
  system_impact: 'OPTIONAL - system works without Pass 3',
  user_benefit: 'Rich clinical storytelling and document synthesis'
}
```

---

## 🏗️ **IMPLEMENTATION APPROACH**

### **Pass 3 Semantic Narratives Class**
```typescript
class Pass3SemanticNarratives {
  constructor(
    private openaiClient: OpenAI,
    private databaseClient: SupabaseClient
  ) {}

  async createClinicalNarratives(
    clinicalData: ClinicalData,
    shellFileId: string,
    patientId: string
  ): Promise<Pass3ProcessingResult> {
    // Input: Structured clinical data from Pass 2 (NOT raw document text)
    const narrativeCreationPrompt = this.buildNarrativePrompt(
      clinicalData,
      shellFileId
    );

    const response = await this.openaiClient.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: narrativeCreationPrompt }],
      temperature: 0.2, // Slightly higher for narrative creativity
      max_tokens: 3000
    });

    const narrativeResult = this.parseNarrativeResponse(response);

    // Write narratives to database
    const narrativeRecords = await this.writeNarrativesToDatabase(
      narrativeResult.narratives,
      shellFileId,
      patientId
    );

    // Update shell file with AI synthesis
    await this.updateShellFileWithSynthesis(
      shellFileId,
      narrativeResult.shellFileSynthesis
    );

    return {
      shell_file_id: shellFileId,
      narratives: narrativeRecords,
      shell_file_synthesis: narrativeResult.shellFileSynthesis,
      narrative_links: narrativeResult.narrativeLinks
    };
  }

  private buildNarrativePrompt(
    clinicalData: ClinicalData,
    shellFileId: string
  ): string {
    return `
    Create clinical narratives from this structured medical data:

    Clinical Events: ${JSON.stringify(clinicalData.clinical_events)}
    Observations: ${JSON.stringify(clinicalData.observations)}
    Interventions: ${JSON.stringify(clinicalData.interventions)}

    Tasks:
    1. Group related clinical events into coherent medical storylines
    2. Create narrative summaries that span document sections meaningfully
    3. Generate overall document synthesis highlighting key clinical findings
    4. Maintain clinical accuracy while creating readable narratives

    Output Format: JSON with narratives array and shell_file_synthesis
    `;
  }
}
```

### **Clinical Storyline Architecture**
```typescript
interface ClinicalNarrativeResult {
  narratives: {
    narrative_id: string;
    narrative_purpose: string;  // "hypertension_management", "surgical_follow_up"
    ai_narrative_summary: string;
    source_page_ranges: number[]; // Can span non-contiguous pages
    clinical_confidence: number;
  }[];

  shell_file_synthesis: {
    ai_document_summary: string;  // Synthesis of all narratives
    ai_document_purpose: string;  // Overall document purpose
    ai_key_findings: string[];    // Key clinical findings across narratives
    processing_confidence: number;
  };

  narrative_links: {
    narrative_id: string;
    linked_clinical_events: string[];
    relationship_type: 'contains' | 'relates_to' | 'caused_by';
  }[];
}
```

---

## 🔄 **DATABASE INTEGRATION**

### **Narrative Storage Strategy**
```sql
-- Store in clinical_narratives table with Pass 3 enhancements
INSERT INTO clinical_narratives (
  patient_id,
  shell_file_id,
  narrative_purpose,
  ai_narrative_summary,
  source_page_ranges,
  clinical_confidence,
  narrative_embedding, -- Generated for future semantic search
  is_current,
  created_by
) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, 'pass_3_ai');

-- Link narratives to clinical events via narrative_event_links
INSERT INTO narrative_event_links (
  narrative_id,
  clinical_event_id,
  event_table,
  patient_id
) VALUES (?, ?, 'patient_clinical_events', ?);
```

### **Shell File Enhancement**
```sql
-- Update shell_files table with AI synthesis
UPDATE shell_files
SET
  ai_document_summary = ?,
  ai_synthesized_summary = ?,
  ai_key_findings = ?,
  processing_status = 'pass_3_complete',
  updated_at = NOW()
WHERE id = ?;
```

---

## 🎨 **USER EXPERIENCE ENHANCEMENT**

### **Dual-Lens Viewing System**
```typescript
interface DualLensViewing {
  shell_file_view: {
    purpose: 'Document-centric view for document-minded users',
    features: ['Original document structure', 'AI document synthesis', 'Page-by-page navigation'],
    data_source: 'shell_files.ai_document_summary + original structure'
  },

  narrative_view: {
    purpose: 'Story-centric view for clinical narrative exploration',
    features: ['Clinical storylines', 'Narrative relationships', 'Cross-document connections'],
    data_source: 'clinical_narratives + narrative_event_links'
  }
}
```

### **Rich Clinical Context**
- **Click medication → see prescription story**: Why was it prescribed, how has it evolved?
- **Click condition → see management journey**: Diagnosis, treatment progression, outcomes
- **Click procedure → see clinical context**: Indications, technique, recovery, follow-up

---

## 📊 **SUCCESS METRICS**

### **Narrative Quality**
- **Clinical Coherence:** >90% narratives tell coherent medical stories
- **Accuracy Preservation:** 100% clinical facts maintained from Pass 2 data
- **Narrative Completeness:** >85% of clinical events included in meaningful narratives

### **Performance Targets**
- **Processing Time:** 2-4 seconds per document
- **Cost Efficiency:** $0.001-0.003 per document (processes structured JSON)
- **Enhancement Value:** Significant UX improvement over raw clinical data

### **System Integration**
- **Optional Enhancement:** System remains fully functional without Pass 3
- **Graceful Degradation:** If Pass 3 fails, Pass 2 data is still available
- **Rich UX:** Narrative view provides significantly enhanced user experience

---

## 🔄 **GRACEFUL DEGRADATION STRATEGY**

### **System Resilience**
```typescript
interface GracefulDegradation {
  pass3_success: 'Rich narrative view + document synthesis available',
  pass3_partial_failure: 'Some narratives created, fallback to document view',
  pass3_complete_failure: 'System fully functional on Pass 2 data alone',

  user_experience: {
    with_pass3: 'Dual-lens viewing (document + narrative)',
    without_pass3: 'Single-lens viewing (document only) - still fully functional'
  }
}
```

**Critical Design Principle:** Pass 3 is purely an enhancement layer. The medical document processing system is complete and fully functional after Pass 2, with Pass 3 providing rich storytelling and narrative coherence as a value-added feature.

---

**Dependencies:**
- Phase 3: Pass 2 clinical enrichment providing structured clinical data
- Database: clinical_narratives table with vector embedding capabilities
- Infrastructure: Operational vector search for future narrative discovery

**Success Criteria:** Clinical storylines enhance user experience while maintaining system functionality independence