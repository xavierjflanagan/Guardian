# Clinical Fact Extraction Engine

**Purpose:** Transform extracted text into structured clinical concepts with healthcare standard coding and O3 classification  
**Focus:** Medical concept identification, clinical event mapping, and database population preparation  
**Priority:** CRITICAL - Bridge between AI extraction and database integration  
**Dependencies:** AI text extraction, medical knowledge bases, O3 classification framework, healthcare coding standards

---

## System Overview

The Clinical Fact Extraction Engine transforms raw medical text into structured, coded clinical data that directly populates Guardian's healthcare database tables. This system implements the O3 two-axis clinical classification framework and integrates with healthcare coding standards to ensure clinical accuracy and regulatory compliance.

### Clinical Data Architecture
```yaml
clinical_extraction_pipeline:
  input: "Raw medical text with spatial coordinates and confidence scores"
  processing_stages:
    - "Medical concept identification and entity recognition"
    - "O3 clinical event classification (activity_type × clinical_purposes)"
    - "Healthcare standards coding (SNOMED-CT, LOINC, CPT, ICD-10)"
    - "Clinical relationship mapping and timeline integration"
    - "Database population preparation and validation"
  output: "Structured clinical events ready for patient_clinical_events table"
  
database_integration_targets:
  primary_tables:
    - "patient_clinical_events (core clinical data with O3 classification)"
    - "patient_observations (detailed observation data with LOINC codes)"
    - "patient_interventions (procedures and treatments with CPT codes)"
    - "healthcare_timeline_events (timeline metadata for clinical progression)"
  
  supporting_tables:
    - "smart_health_features (auto-activation based on detected health data)"
    - "clinical_fact_sources (provenance tracking with spatial coordinates)"
    - "medical_data_relationships (clinical entity relationships)"
```

---

## O3 Clinical Classification Framework Integration

### Two-Axis Classification System
```typescript
interface O3ClassificationSystem {
  // Primary axis: Activity Type (What was done/observed)
  activityTypes: {
    observation: "Clinical observations, measurements, assessments";
    intervention: "Treatments, procedures, therapies";
    diagnostic: "Diagnostic tests, imaging, laboratory work";
    medication: "Drug prescriptions, administration, monitoring";
    encounter: "Healthcare visits, consultations, admissions";
    prevention: "Preventive care, screening, vaccinations";
    education: "Patient education, counseling, guidance";
    monitoring: "Ongoing monitoring, follow-up, surveillance";
  };
  
  // Secondary axis: Clinical Purpose (Why it was done)
  clinicalPurposes: [
    'screening',           // Preventive screening for asymptomatic conditions
    'diagnosis',           // Diagnostic workup for suspected conditions
    'monitoring',          // Ongoing monitoring of known conditions
    'treatment',           // Therapeutic interventions
    'prevention',          // Primary/secondary prevention activities
    'assessment',          // Clinical assessment and evaluation
    'surveillance',        // Population health surveillance
    'research',            // Clinical research activities
    'quality_improvement', // Healthcare quality initiatives
    'education',           // Patient or provider education
    'administration',      // Healthcare administration activities
    'emergency'            // Emergency/urgent care activities
  ];
}

class O3ClinicalClassifier {
  async classifyMedicalEvent(
    extractedConcept: ExtractedMedicalConcept,
    documentContext: DocumentContext
  ): Promise<O3Classification> {
    
    // Classify primary activity type
    const activityType = await this.classifyActivityType(
      extractedConcept,
      documentContext
    );
    
    // Classify clinical purposes (can have multiple)
    const clinicalPurposes = await this.classifyClinicalPurposes(
      extractedConcept,
      activityType,
      documentContext
    );
    
    // Generate clinical event structure
    const clinicalEvent = await this.generateClinicalEvent(
      extractedConcept,
      activityType,
      clinicalPurposes,
      documentContext
    );
    
    return {
      activityType,
      clinicalPurposes,
      clinicalEvent,
      confidence: this.calculateClassificationConfidence(
        activityType,
        clinicalPurposes,
        extractedConcept
      ),
      reasoning: this.generateClassificationReasoning(
        activityType,
        clinicalPurposes,
        extractedConcept
      )
    };
  }

  private async classifyActivityType(
    concept: ExtractedMedicalConcept,
    context: DocumentContext
  ): Promise<ActivityTypeClassification> {
    
    // Apply rule-based classification first
    const ruleBasedClassification = this.applyActivityTypeRules(concept);
    
    if (ruleBasedClassification.confidence > 0.8) {
      return ruleBasedClassification;
    }
    
    // Use AI-assisted classification for ambiguous cases
    const aiClassification = await this.aiClassifyActivityType(concept, context);
    
    // Combine and validate classifications
    return this.combineActivityTypeClassifications(
      ruleBasedClassification,
      aiClassification
    );
  }

  private applyActivityTypeRules(concept: ExtractedMedicalConcept): ActivityTypeClassification {
    const conceptText = concept.text.toLowerCase();
    const conceptType = concept.type;
    
    // Observation patterns
    if (this.isObservationConcept(conceptText, conceptType)) {
      return {
        activityType: 'observation',
        confidence: 0.9,
        reasoning: 'Medical measurement or clinical finding detected',
        evidencePatterns: this.getObservationEvidence(conceptText)
      };
    }
    
    // Intervention patterns
    if (this.isInterventionConcept(conceptText, conceptType)) {
      return {
        activityType: 'intervention',
        confidence: 0.9,
        reasoning: 'Medical procedure or treatment detected',
        evidencePatterns: this.getInterventionEvidence(conceptText)
      };
    }
    
    // Diagnostic patterns
    if (this.isDiagnosticConcept(conceptText, conceptType)) {
      return {
        activityType: 'diagnostic',
        confidence: 0.9,
        reasoning: 'Diagnostic test or investigation detected',
        evidencePatterns: this.getDiagnosticEvidence(conceptText)
      };
    }
    
    // Medication patterns
    if (this.isMedicationConcept(conceptText, conceptType)) {
      return {
        activityType: 'medication',
        confidence: 0.9,
        reasoning: 'Medication prescription or administration detected',
        evidencePatterns: this.getMedicationEvidence(conceptText)
      };
    }
    
    // Default to observation with low confidence
    return {
      activityType: 'observation',
      confidence: 0.3,
      reasoning: 'Unable to clearly classify activity type, defaulting to observation',
      evidencePatterns: []
    };
  }

  private isObservationConcept(text: string, type: string): boolean {
    const observationPatterns = [
      // Vital signs
      /blood pressure|bp|systolic|diastolic/i,
      /heart rate|pulse|hr|bpm/i,
      /temperature|temp|fever/i,
      /respiratory rate|breathing|respiration/i,
      /oxygen saturation|spo2|o2 sat/i,
      
      // Physical examination findings
      /examination|exam|physical|assessment/i,
      /auscultation|palpation|percussion|inspection/i,
      /heart sounds|lung sounds|bowel sounds/i,
      /reflexes|muscle strength|range of motion/i,
      
      // Laboratory values
      /hemoglobin|hematocrit|white blood cell|platelet/i,
      /glucose|cholesterol|triglyceride|protein/i,
      /sodium|potassium|chloride|creatinine/i,
      /liver enzymes|cardiac enzymes|troponin/i,
      
      // Clinical findings
      /pain scale|pain level|mobility|functional status/i,
      /mental status|cognitive|mood|affect/i,
      /symptom|complaint|finding|sign/i
    ];
    
    return observationPatterns.some(pattern => pattern.test(text)) ||
           type === 'vital_sign' || type === 'lab_result' || type === 'clinical_finding';
  }

  private isInterventionConcept(text: string, type: string): boolean {
    const interventionPatterns = [
      // Surgical procedures
      /surgery|surgical|procedure|operation/i,
      /incision|suture|repair|removal/i,
      /laparoscopic|endoscopic|arthroscopic/i,
      /transplant|implant|replacement/i,
      
      // Medical procedures
      /injection|infusion|transfusion/i,
      /catheter|intubation|ventilation/i,
      /dialysis|chemotherapy|radiation/i,
      /biopsy|drainage|aspiration/i,
      
      // Therapeutic interventions
      /therapy|treatment|intervention/i,
      /physical therapy|occupational therapy/i,
      /counseling|education|rehabilitation/i,
      /wound care|dressing change/i
    ];
    
    return interventionPatterns.some(pattern => pattern.test(text)) ||
           type === 'procedure' || type === 'surgery' || type === 'therapy';
  }
}
```

---

## Healthcare Standards Coding Integration

### SNOMED-CT Code Assignment
```typescript
class SNOMEDCTCoder {
  async assignSNOMEDCodes(
    clinicalConcepts: ClinicalConcept[],
    clinicalContext: ClinicalContext
  ): Promise<SNOMEDCodedConcepts> {
    
    const codedConcepts: SNOMEDCodedConcept[] = [];
    
    for (const concept of clinicalConcepts) {
      const snomedCoding = await this.findBestSNOMEDMatch(concept, clinicalContext);
      
      if (snomedCoding.confidence > 0.7) {
        codedConcepts.push({
          originalConcept: concept,
          snomedCode: snomedCoding.code,
          snomedTerm: snomedCoding.preferredTerm,
          confidence: snomedCoding.confidence,
          codeSystem: 'SNOMED-CT',
          codeSystemVersion: this.snomedVersion,
          mappingMethod: snomedCoding.method,
          alternativeCodes: snomedCoding.alternatives
        });
      } else {
        // Handle low-confidence mappings
        codedConcepts.push({
          originalConcept: concept,
          snomedCode: null,
          snomedTerm: null,
          confidence: 0,
          codeSystem: 'SNOMED-CT',
          mappingIssue: 'No suitable SNOMED-CT code found',
          requiresManualCoding: true
        });
      }
    }
    
    return {
      codedConcepts,
      overallCodingRate: this.calculateCodingRate(codedConcepts),
      qualityMetrics: this.calculateCodingQuality(codedConcepts),
      unmappedConcepts: codedConcepts.filter(c => !c.snomedCode)
    };
  }

  private async findBestSNOMEDMatch(
    concept: ClinicalConcept,
    context: ClinicalContext
  ): Promise<SNOMEDMapping> {
    
    // Direct terminology matching
    const directMatch = await this.directTerminologyMatch(concept.text);
    if (directMatch.confidence > 0.9) {
      return directMatch;
    }
    
    // Semantic similarity matching
    const semanticMatch = await this.semanticSimilarityMatch(concept, context);
    if (semanticMatch.confidence > 0.8) {
      return semanticMatch;
    }
    
    // Context-enhanced matching
    const contextMatch = await this.contextEnhancedMatch(concept, context);
    if (contextMatch.confidence > 0.7) {
      return contextMatch;
    }
    
    // Hierarchical matching (broader terms)
    const hierarchicalMatch = await this.hierarchicalMatch(concept);
    
    return hierarchicalMatch;
  }

  private async directTerminologyMatch(conceptText: string): Promise<SNOMEDMapping> {
    // Clean and normalize concept text
    const normalizedText = this.normalizeConceptText(conceptText);
    
    // Search SNOMED-CT terminology
    const exactMatches = await this.snomedService.searchExact(normalizedText);
    
    if (exactMatches.length > 0) {
      const bestMatch = exactMatches[0]; // Highest ranked exact match
      
      return {
        code: bestMatch.conceptId,
        preferredTerm: bestMatch.preferredTerm,
        confidence: 0.95,
        method: 'direct_terminology_match',
        alternatives: exactMatches.slice(1, 3).map(m => ({
          code: m.conceptId,
          term: m.preferredTerm,
          confidence: 0.85
        }))
      };
    }
    
    // Try fuzzy matching for spelling variations
    const fuzzyMatches = await this.snomedService.searchFuzzy(normalizedText);
    
    if (fuzzyMatches.length > 0 && fuzzyMatches[0].similarity > 0.85) {
      return {
        code: fuzzyMatches[0].conceptId,
        preferredTerm: fuzzyMatches[0].preferredTerm,
        confidence: fuzzyMatches[0].similarity * 0.9, // Slight penalty for fuzzy match
        method: 'fuzzy_terminology_match',
        alternatives: fuzzyMatches.slice(1, 3).map(m => ({
          code: m.conceptId,
          term: m.preferredTerm,
          confidence: m.similarity * 0.8
        }))
      };
    }
    
    return { confidence: 0, method: 'no_direct_match' };
  }

  private async semanticSimilarityMatch(
    concept: ClinicalConcept,
    context: ClinicalContext
  ): Promise<SNOMEDMapping> {
    
    // Use medical embeddings for semantic similarity
    const conceptEmbedding = await this.medicalEmbeddings.getConceptEmbedding(
      concept.text,
      concept.type,
      context
    );
    
    // Find semantically similar SNOMED concepts
    const similarConcepts = await this.snomedService.findSimilarConcepts(
      conceptEmbedding,
      {
        minSimilarity: 0.7,
        maxResults: 5,
        domainFilter: this.getDomainFilter(context.medicalSpecialty)
      }
    );
    
    if (similarConcepts.length > 0) {
      const bestMatch = similarConcepts[0];
      
      // Validate semantic match with clinical context
      const contextValidation = await this.validateWithClinicalContext(
        bestMatch,
        context
      );
      
      return {
        code: bestMatch.conceptId,
        preferredTerm: bestMatch.preferredTerm,
        confidence: bestMatch.similarity * contextValidation.confidence,
        method: 'semantic_similarity_match',
        semanticScore: bestMatch.similarity,
        contextValidation,
        alternatives: similarConcepts.slice(1, 3).map(c => ({
          code: c.conceptId,
          term: c.preferredTerm,
          confidence: c.similarity * 0.8
        }))
      };
    }
    
    return { confidence: 0, method: 'no_semantic_match' };
  }
}
```

### LOINC Code Assignment for Laboratory Data
```typescript
class LOINCCoder {
  async assignLOINCCodes(
    laboratoryResults: LaboratoryResult[],
    labContext: LaboratoryContext
  ): Promise<LOINCCodedResults> {
    
    const codedResults: LOINCCodedResult[] = [];
    
    for (const result of laboratoryResults) {
      const loincCoding = await this.findBestLOINCMatch(result, labContext);
      
      codedResults.push({
        originalResult: result,
        loincCode: loincCoding.code,
        loincLongName: loincCoding.longName,
        loincShortName: loincCoding.shortName,
        confidence: loincCoding.confidence,
        component: loincCoding.component,
        property: loincCoding.property,
        timing: loincCoding.timing,
        system: loincCoding.system,
        scale: loincCoding.scale,
        method: loincCoding.method,
        mappingQuality: loincCoding.quality
      });
    }
    
    return {
      codedResults,
      overallCodingRate: this.calculateLOINCCodingRate(codedResults),
      qualityMetrics: this.calculateLOINCQuality(codedResults)
    };
  }

  private async findBestLOINCMatch(
    labResult: LaboratoryResult,
    context: LaboratoryContext
  ): Promise<LOINCMapping> {
    
    // Extract test components for LOINC mapping
    const testComponents = this.extractTestComponents(labResult);
    
    // Search LOINC database with extracted components
    const loincCandidates = await this.loincService.searchTests({
      component: testComponents.component,
      property: testComponents.property,
      system: testComponents.system,
      scale: testComponents.scale,
      method: testComponents.method
    });
    
    if (loincCandidates.length === 0) {
      return this.handleNoLOINCMatch(labResult, testComponents);
    }
    
    // Score candidates based on component matching
    const scoredCandidates = await Promise.all(
      loincCandidates.map(candidate =>
        this.scoreLOINCCandidate(candidate, testComponents, context)
      )
    );
    
    // Select best match
    const bestMatch = scoredCandidates.reduce((best, current) =>
      current.score > best.score ? current : best
    );
    
    if (bestMatch.score > 0.8) {
      return {
        code: bestMatch.code,
        longName: bestMatch.longName,
        shortName: bestMatch.shortName,
        confidence: bestMatch.score,
        component: bestMatch.component,
        property: bestMatch.property,
        timing: bestMatch.timing,
        system: bestMatch.system,
        scale: bestMatch.scale,
        method: bestMatch.method,
        quality: 'high_confidence'
      };
    } else if (bestMatch.score > 0.6) {
      return {
        ...bestMatch,
        quality: 'moderate_confidence',
        requiresReview: true
      };
    } else {
      return {
        ...bestMatch,
        quality: 'low_confidence',
        requiresManualCoding: true
      };
    }
  }

  private extractTestComponents(labResult: LaboratoryResult): LOINCComponents {
    const testName = labResult.testName.toLowerCase();
    
    // Component identification (what is being measured)
    const component = this.identifyComponent(testName);
    
    // Property identification (mass, volume, etc.)
    const property = this.identifyProperty(testName, labResult.units);
    
    // System identification (blood, urine, etc.)
    const system = this.identifySystem(testName, labResult.specimenType);
    
    // Scale identification (quantitative, ordinal, etc.)
    const scale = this.identifyScale(labResult.resultType);
    
    // Method identification (if specified)
    const method = this.identifyMethod(testName, labResult.methodology);
    
    return {
      component,
      property,
      system,
      scale,
      method,
      confidence: this.calculateComponentConfidence(component, property, system)
    };
  }

  private identifyComponent(testName: string): ComponentIdentification {
    const componentPatterns = {
      'hemoglobin': {
        pattern: /hemoglobin|hgb|hb(?!\w)/i,
        loincComponent: 'Hemoglobin',
        confidence: 0.95
      },
      'glucose': {
        pattern: /glucose|blood sugar|bg/i,
        loincComponent: 'Glucose',
        confidence: 0.95
      },
      'creatinine': {
        pattern: /creatinine|creat/i,
        loincComponent: 'Creatinine',
        confidence: 0.95
      },
      'cholesterol_total': {
        pattern: /total cholesterol|cholesterol total|tc(?!\w)/i,
        loincComponent: 'Cholesterol',
        confidence: 0.95
      },
      'white_blood_cells': {
        pattern: /white blood cell|wbc|leukocyte/i,
        loincComponent: 'Leukocytes',
        confidence: 0.95
      }
    };
    
    for (const [key, componentDef] of Object.entries(componentPatterns)) {
      if (componentDef.pattern.test(testName)) {
        return {
          component: componentDef.loincComponent,
          confidence: componentDef.confidence,
          method: 'pattern_matching',
          originalText: testName
        };
      }
    }
    
    // Fallback to AI-based component identification
    return this.aiIdentifyComponent(testName);
  }
}
```

---

## Clinical Timeline Integration

### Healthcare Timeline Event Generation
```typescript
class ClinicalTimelineGenerator {
  async generateTimelineEvents(
    clinicalEvents: O3ClassifiedEvent[],
    documentMetadata: DocumentMetadata,
    patientContext: PatientContext
  ): Promise<TimelineEventGeneration> {
    
    const timelineEvents: HealthcareTimelineEvent[] = [];
    
    for (const clinicalEvent of clinicalEvents) {
      const timelineEvent = await this.createTimelineEvent(
        clinicalEvent,
        documentMetadata,
        patientContext
      );
      
      if (timelineEvent) {
        timelineEvents.push(timelineEvent);
      }
    }
    
    // Sort events chronologically
    const sortedEvents = this.sortEventsByTimeline(timelineEvents);
    
    // Identify clinical progressions and relationships
    const progressions = await this.identifyProgressions(sortedEvents);
    
    // Generate timeline metadata
    const timelineMetadata = await this.generateTimelineMetadata(
      sortedEvents,
      progressions,
      patientContext
    );
    
    return {
      timelineEvents: sortedEvents,
      progressions,
      timelineMetadata,
      qualityMetrics: this.calculateTimelineQuality(sortedEvents)
    };
  }

  private async createTimelineEvent(
    clinicalEvent: O3ClassifiedEvent,
    documentMetadata: DocumentMetadata,
    patientContext: PatientContext
  ): Promise<HealthcareTimelineEvent> {
    
    // Determine event timing
    const eventTiming = await this.determineEventTiming(
      clinicalEvent,
      documentMetadata,
      patientContext
    );
    
    // Calculate patient age at event
    const patientAgeAtEvent = this.calculatePatientAgeAtEvent(
      eventTiming.eventDate,
      patientContext.dateOfBirth
    );
    
    // Generate timeline context
    const timelineContext = await this.generateTimelineContext(
      clinicalEvent,
      eventTiming,
      patientAgeAtEvent
    );
    
    return {
      // Core identifiers
      timelineEventId: this.generateTimelineEventId(),
      clinicalEventId: clinicalEvent.id,
      patientId: patientContext.patientId,
      
      // Temporal information
      eventDate: eventTiming.eventDate,
      eventDateTime: eventTiming.eventDateTime,
      eventTimeConfidence: eventTiming.confidence,
      patientAgeAtEvent,
      
      // Clinical context
      activityType: clinicalEvent.activityType,
      clinicalPurposes: clinicalEvent.clinicalPurposes,
      eventSeverity: this.assessEventSeverity(clinicalEvent),
      clinicalSignificance: this.assessClinicalSignificance(clinicalEvent),
      
      // Timeline relationships
      relatedEvents: await this.findRelatedEvents(clinicalEvent, patientContext),
      eventSequence: this.determineEventSequence(clinicalEvent),
      progressionIndicators: this.identifyProgressionIndicators(clinicalEvent),
      
      // Provenance
      sourceDocument: documentMetadata.documentId,
      extractionConfidence: clinicalEvent.confidence,
      lastUpdated: new Date(),
      
      // Healthcare journey context
      careEpisode: await this.identifyCareEpisode(clinicalEvent, patientContext),
      treatmentPhase: this.identifyTreatmentPhase(clinicalEvent),
      outcomeCategory: this.categorizeOutcome(clinicalEvent)
    };
  }

  private async identifyProgressions(
    timelineEvents: HealthcareTimelineEvent[]
  ): Promise<ClinicalProgression[]> {
    
    const progressions: ClinicalProgression[] = [];
    
    // Group events by clinical domain
    const eventGroups = this.groupEventsByClinicalDomain(timelineEvents);
    
    for (const [domain, events] of eventGroups) {
      const domainProgressions = await this.analyzeProgressionInDomain(
        domain,
        events
      );
      progressions.push(...domainProgressions);
    }
    
    return progressions;
  }

  private async analyzeProgressionInDomain(
    domain: ClinicalDomain,
    events: HealthcareTimelineEvent[]
  ): Promise<ClinicalProgression[]> {
    
    const progressions: ClinicalProgression[] = [];
    
    // Sort events chronologically
    const sortedEvents = events.sort((a, b) => 
      a.eventDate.getTime() - b.eventDate.getTime()
    );
    
    // Identify progression patterns
    const progressionPatterns = await this.identifyProgressionPatterns(
      domain,
      sortedEvents
    );
    
    for (const pattern of progressionPatterns) {
      const progression = await this.createProgression(pattern, sortedEvents);
      progressions.push(progression);
    }
    
    return progressions;
  }
}
```

---

## Smart Health Feature Detection

### Automated Feature Activation
```typescript
class SmartHealthFeatureDetector {
  async detectSmartFeatures(
    clinicalEvents: O3ClassifiedEvent[],
    patientProfile: PatientProfile
  ): Promise<SmartFeatureActivation> {
    
    const activatedFeatures: SmartHealthFeature[] = [];
    const featureRecommendations: FeatureRecommendation[] = [];
    
    // Analyze clinical events for feature triggers
    for (const event of clinicalEvents) {
      const eventFeatures = await this.analyzeEventForFeatures(event, patientProfile);
      activatedFeatures.push(...eventFeatures.activated);
      featureRecommendations.push(...eventFeatures.recommended);
    }
    
    // Deduplicate and prioritize features
    const uniqueFeatures = this.deduplicateFeatures(activatedFeatures);
    const prioritizedRecommendations = this.prioritizeRecommendations(featureRecommendations);
    
    return {
      activatedFeatures: uniqueFeatures,
      featureRecommendations: prioritizedRecommendations,
      activationSummary: this.generateActivationSummary(uniqueFeatures),
      nextReviewDate: this.calculateNextReviewDate(uniqueFeatures)
    };
  }

  private async analyzeEventForFeatures(
    event: O3ClassifiedEvent,
    profile: PatientProfile
  ): Promise<EventFeatureAnalysis> {
    
    const activated: SmartHealthFeature[] = [];
    const recommended: FeatureRecommendation[] = [];
    
    // Diabetes management features
    if (this.indicatesDiabetes(event)) {
      activated.push({
        featureId: 'diabetes_management',
        featureName: 'Diabetes Care Management',
        category: 'chronic_disease_management',
        activationReason: 'Diabetes-related clinical event detected',
        activationDate: new Date(),
        confidence: 0.9,
        clinicalEvidence: [event.id],
        autoActivated: true
      });
    }
    
    // Hypertension monitoring features
    if (this.indicatesHypertension(event)) {
      activated.push({
        featureId: 'blood_pressure_monitoring',
        featureName: 'Blood Pressure Tracking',
        category: 'vital_signs_monitoring',
        activationReason: 'Hypertension or elevated blood pressure detected',
        activationDate: new Date(),
        confidence: 0.85,
        clinicalEvidence: [event.id],
        autoActivated: true
      });
    }
    
    // Medication adherence features
    if (this.indicatesMedicationTherapy(event)) {
      recommended.push({
        featureId: 'medication_adherence',
        featureName: 'Medication Adherence Tracking',
        category: 'medication_management',
        recommendationReason: 'Ongoing medication therapy detected',
        confidence: 0.8,
        clinicalEvidence: [event.id],
        requiresUserConsent: true,
        estimatedBenefit: 'high'
      });
    }
    
    // Preventive care features
    const preventiveFeatures = await this.analyzePreventiveCareNeeds(event, profile);
    recommended.push(...preventiveFeatures);
    
    return { activated, recommended };
  }

  private indicatesDiabetes(event: O3ClassifiedEvent): boolean {
    const diabetesIndicators = [
      // Diagnosis codes
      'E10', 'E11', 'E12', 'E13', 'E14', // ICD-10 diabetes codes
      '250', // ICD-9 diabetes code
      
      // SNOMED-CT codes
      '73211009', // Diabetes mellitus
      '44054006', // Type 2 diabetes mellitus
      '46635009', // Type 1 diabetes mellitus
      
      // Clinical terms
      'diabetes', 'diabetic', 'dm type', 'insulin dependent',
      'non-insulin dependent', 'hyperglycemia', 'glucometer',
      
      // Medications
      'metformin', 'insulin', 'glipizide', 'glyburide',
      'pioglitazone', 'sitagliptin', 'liraglutide',
      
      // Laboratory tests
      'hba1c', 'hemoglobin a1c', 'glucose tolerance test',
      'fasting glucose', 'random glucose'
    ];
    
    const eventText = this.getEventSearchableText(event);
    
    return diabetesIndicators.some(indicator =>
      eventText.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  private indicatesHypertension(event: O3ClassifiedEvent): boolean {
    // Check for hypertension diagnosis
    if (this.hasHypertensionDiagnosis(event)) {
      return true;
    }
    
    // Check for elevated blood pressure values
    if (this.hasElevatedBloodPressure(event)) {
      return true;
    }
    
    // Check for antihypertensive medications
    if (this.hasAntihypertensiveMedications(event)) {
      return true;
    }
    
    return false;
  }

  private hasElevatedBloodPressure(event: O3ClassifiedEvent): boolean {
    // Extract blood pressure values from event
    const bpValues = this.extractBloodPressureValues(event);
    
    for (const bp of bpValues) {
      // Stage 1 hypertension: ≥130/80 mmHg
      if (bp.systolic >= 130 || bp.diastolic >= 80) {
        return true;
      }
    }
    
    return false;
  }

  private async analyzePreventiveCareNeeds(
    event: O3ClassifiedEvent,
    profile: PatientProfile
  ): Promise<FeatureRecommendation[]> {
    
    const recommendations: FeatureRecommendation[] = [];
    
    // Age-based screening recommendations
    const ageBasedScreenings = this.getAgeBasedScreenings(
      profile.age,
      profile.gender
    );
    
    for (const screening of ageBasedScreenings) {
      if (this.isScreeningDue(screening, profile.lastScreenings)) {
        recommendations.push({
          featureId: `preventive_${screening.type}`,
          featureName: screening.displayName,
          category: 'preventive_care',
          recommendationReason: `Age-appropriate ${screening.type} screening due`,
          confidence: 0.9,
          requiresUserConsent: true,
          estimatedBenefit: screening.benefit,
          clinicalGuidelines: screening.guidelines
        });
      }
    }
    
    // Risk-based screening recommendations
    const riskFactors = await this.identifyRiskFactors(event, profile);
    
    for (const riskFactor of riskFactors) {
      const riskBasedScreenings = this.getRiskBasedScreenings(riskFactor);
      recommendations.push(...riskBasedScreenings);
    }
    
    return recommendations;
  }
}
```

---

## Database Population Preparation

### Clinical Events Table Mapping
```typescript
class DatabasePopulationMapper {
  async prepareDatabaseInsertion(
    o3ClassifiedEvents: O3ClassifiedEvent[],
    timelineEvents: HealthcareTimelineEvent[],
    smartFeatures: SmartHealthFeature[],
    documentMetadata: DocumentMetadata
  ): Promise<DatabaseInsertionPlan> {
    
    const insertionPlan: DatabaseInsertionPlan = {
      patientClinicalEvents: [],
      patientObservations: [],
      patientInterventions: [],
      healthcareTimelineEvents: [],
      smartHealthFeatures: [],
      clinicalFactSources: [],
      medicalDataRelationships: []
    };
    
    // Map O3 classified events to patient_clinical_events
    for (const event of o3ClassifiedEvents) {
      const clinicalEventRecord = await this.mapToPatientClinicalEvent(
        event,
        documentMetadata
      );
      insertionPlan.patientClinicalEvents.push(clinicalEventRecord);
      
      // Create detailed observations if applicable
      if (event.activityType === 'observation') {
        const observations = await this.mapToPatientObservations(event);
        insertionPlan.patientObservations.push(...observations);
      }
      
      // Create intervention records if applicable
      if (event.activityType === 'intervention') {
        const interventions = await this.mapToPatientInterventions(event);
        insertionPlan.patientInterventions.push(...interventions);
      }
      
      // Create provenance records
      const provenance = await this.mapToClinicalFactSources(event, documentMetadata);
      insertionPlan.clinicalFactSources.push(provenance);
    }
    
    // Map timeline events
    insertionPlan.healthcareTimelineEvents = await Promise.all(
      timelineEvents.map(event => this.mapToTimelineEvent(event))
    );
    
    // Map smart features
    insertionPlan.smartHealthFeatures = await Promise.all(
      smartFeatures.map(feature => this.mapToSmartFeature(feature))
    );
    
    // Generate relationship mappings
    insertionPlan.medicalDataRelationships = await this.generateRelationshipMappings(
      insertionPlan
    );
    
    return insertionPlan;
  }

  private async mapToPatientClinicalEvent(
    event: O3ClassifiedEvent,
    documentMetadata: DocumentMetadata
  ): Promise<PatientClinicalEventRecord> {
    
    return {
      // Core identifiers
      event_id: event.id,
      patient_id: event.patientId,
      profile_id: event.profileId,
      
      // O3 Classification
      activity_type: event.activityType,
      clinical_purposes: event.clinicalPurposes,
      
      // Event details
      event_name: event.eventName,
      event_description: event.description,
      method: event.method,
      body_site: event.bodySite,
      
      // Healthcare coding
      snomed_code: event.snomedCode,
      icd10_code: event.icd10Code,
      cpt_code: event.cptCode,
      loinc_code: event.loincCode,
      
      // Clinical context
      severity: event.severity,
      urgency: event.urgency,
      clinical_status: event.clinicalStatus,
      verification_status: event.verificationStatus,
      
      // Temporal information
      event_date: event.eventDate,
      event_datetime: event.eventDateTime,
      onset_date: event.onsetDate,
      resolution_date: event.resolutionDate,
      
      // Quality and provenance
      confidence_score: event.confidence,
      extraction_method: event.extractionMethod,
      source_document_id: documentMetadata.documentId,
      
      // Metadata
      created_at: new Date(),
      updated_at: new Date(),
      data_version: '1.0'
    };
  }

  private async mapToPatientObservations(
    event: O3ClassifiedEvent
  ): Promise<PatientObservationRecord[]> {
    
    const observations: PatientObservationRecord[] = [];
    
    // Extract observation components from event
    const observationComponents = this.extractObservationComponents(event);
    
    for (const component of observationComponents) {
      observations.push({
        observation_id: this.generateObservationId(),
        clinical_event_id: event.id,
        patient_id: event.patientId,
        
        // Observation details
        observation_name: component.name,
        observation_value: component.value,
        observation_unit: component.unit,
        reference_range: component.referenceRange,
        abnormal_flag: component.abnormalFlag,
        
        // LOINC coding
        loinc_code: component.loincCode,
        loinc_display: component.loincDisplay,
        
        // Clinical context
        interpretation: component.interpretation,
        body_site: component.bodySite,
        method: component.method,
        
        // Temporal information
        observation_datetime: component.observationDateTime,
        
        // Quality metrics
        confidence_score: component.confidence,
        data_quality_score: component.dataQuality,
        
        // Metadata
        created_at: new Date()
      });
    }
    
    return observations;
  }

  private async mapToClinicalFactSources(
    event: O3ClassifiedEvent,
    documentMetadata: DocumentMetadata
  ): Promise<ClinicalFactSourceRecord> {
    
    return {
      source_id: this.generateSourceId(),
      clinical_event_id: event.id,
      patient_id: event.patientId,
      
      // Document provenance
      source_document_id: documentMetadata.documentId,
      source_document_type: documentMetadata.documentType,
      source_page_number: event.spatialData?.pageNumber,
      
      // Spatial coordinates (PostGIS GEOMETRY)
      bounding_box: event.spatialData ? this.createPostGISGeometry(event.spatialData) : null,
      
      // Extraction details
      extraction_method: event.extractionMethod,
      extraction_confidence: event.confidence,
      extraction_timestamp: new Date(),
      
      // Clinical validation
      medical_review_status: 'pending',
      validation_score: event.validationScore,
      quality_flags: event.qualityFlags,
      
      // Compliance and audit
      audit_trail: {
        extractor_version: '1.0',
        processing_pipeline: event.processingPipeline,
        validation_rules: event.validationRules
      },
      
      // Metadata
      created_at: new Date(),
      retention_category: 'clinical_extraction_provenance'
    };
  }
}
```

---

*The Clinical Fact Extraction Engine serves as the intelligent bridge between AI-extracted medical text and structured healthcare data, ensuring that every clinical concept is accurately classified, appropriately coded, and seamlessly integrated into Guardian's comprehensive healthcare database while maintaining the highest standards of medical accuracy and regulatory compliance.*