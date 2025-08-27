# Clinical Journeys Architecture: Patient-Scoped Healthcare Narratives

**Created:** 2025-08-27  
**Status:** Future Architecture Vision  
**Purpose:** Define cross-document clinical journey tracking for longitudinal patient care narratives  
**Prerequisites:** Semantic Document Architecture (07-semantic-document-architecture.md)

## Executive Summary

While our Semantic Document Architecture solves **document-scoped** multi-narrative issues, this document explores the next evolution: **patient-scoped clinical journeys** that span multiple documents over time. This transforms healthcare data from isolated document events into meaningful longitudinal care stories that reflect how patients and providers actually experience healthcare.

## The Evolution: From Documents to Journeys

### Current Achievement (Document-Scoped)
```
1 Shell File → Multiple Clinical Narratives (within document boundaries)
Example: 20-page GP summary → [Hypertension management, UTI episode, Medication list]
```

### Future Vision (Patient-Scoped)  
```
Multiple Shell Files → Single Clinical Journey (across document boundaries)
Example: 9-month pregnancy → 10 documents → 1 unified "Pregnancy Journey" narrative
```

## Core Concept: Clinical Journey

**Definition:** A **Clinical Journey** is a semantically coherent healthcare narrative that spans multiple documents, timeframes, and potentially providers, unified by a common clinical purpose or condition.

### Journey vs Narrative Distinction

| **Clinical Narratives** | **Clinical Journeys** |
|-------------------------|------------------------|
| Document-scoped | Patient-scoped |
| Single upload analysis | Multi-upload synthesis |
| Immediate creation | Longitudinal detection |
| Weeks to months timeframe | Months to years timeframe |
| Reactive (from document) | Proactive (from pattern detection) |

## Journey Classification Framework

### Journey Types

#### 1. **Condition Management Journeys**
**Characteristics:** Chronic conditions requiring ongoing management
**Examples:**
- Diabetes management evolution (diagnosis → optimization → maintenance)
- Hypertension control journey (detection → medication trials → stabilization)  
- Mental health treatment progression (assessment → therapy → medication management)

**Typical Span:** 1-5+ years across 10-50+ documents

#### 2. **Episode Care Journeys**
**Characteristics:** Acute medical episodes with clear beginning and resolution
**Examples:**
- Pregnancy journey (conception → delivery → postpartum)
- Surgical care pathway (consultation → surgery → recovery → follow-up)
- Cancer treatment journey (diagnosis → treatment → monitoring → survivorship)

**Typical Span:** 3 months to 2 years across 5-20 documents

#### 3. **Preventive Care Journeys**  
**Characteristics:** Ongoing health maintenance and screening
**Examples:**
- Cardiac prevention program (risk assessment → lifestyle modification → monitoring)
- Cancer screening compliance (mammograms, colonoscopies, skin checks over decades)
- Pediatric development tracking (well-child visits, vaccinations, growth monitoring)

**Typical Span:** Ongoing/lifelong across hundreds of documents

#### 4. **Rehabilitation Journeys**
**Characteristics:** Recovery and functional improvement processes
**Examples:**
- Physical therapy rehabilitation (injury → treatment → recovery)
- Addiction recovery journey (treatment → maintenance → relapse prevention)
- Cognitive rehabilitation (stroke → therapy → functional improvement)

**Typical Span:** 3 months to 2 years across 10-30 documents

## Architectural Components

### Database Schema Extension

```sql
-- Evolution of clinical_narratives to support cross-document journeys
clinical_journeys (
    journey_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id),
    
    -- Journey Classification
    journey_type TEXT NOT NULL CHECK (journey_type IN (
        'condition_management', 'episode_care', 'preventive_care', 'rehabilitation'
    )),
    journey_purpose TEXT NOT NULL, -- "pregnancy_journey", "diabetes_management_evolution"
    clinical_classification TEXT, -- "reproductive_health", "chronic_disease_progression"
    
    -- Journey Lifecycle
    journey_status TEXT NOT NULL DEFAULT 'active' CHECK (journey_status IN (
        'active', 'completed', 'paused', 'discontinued', 'merged'
    )),
    journey_start_date TIMESTAMPTZ NOT NULL,
    journey_end_date TIMESTAMPTZ, -- Nullable for ongoing journeys
    estimated_duration INTERVAL, -- Clinical expectation for journey length
    
    -- Journey Intelligence
    ai_journey_summary TEXT NOT NULL,
    ai_journey_purpose TEXT NOT NULL, 
    ai_key_milestones TEXT[],
    ai_journey_confidence NUMERIC(3,2) NOT NULL CHECK (ai_journey_confidence BETWEEN 0 AND 1),
    
    -- Source Attribution  
    source_shell_files UUID[], -- Array of contributing shell files
    source_narratives UUID[], -- Array of contributing clinical narratives
    contributing_providers TEXT[], -- Providers involved in journey
    primary_condition_codes TEXT[], -- ICD-10/SNOMED codes for primary conditions
    
    -- Journey Metrics
    total_documents INTEGER DEFAULT 0,
    total_encounters INTEGER DEFAULT 0,
    journey_complexity_score NUMERIC(3,2), -- Simple to complex journey indicator
    
    -- Audit and Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_date TIMESTAMPTZ, -- Most recent contributing document
    archived BOOLEAN DEFAULT FALSE
);

-- Junction table linking clinical narratives to journeys (many-to-many)
journey_narrative_links (
    link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journey_id UUID NOT NULL REFERENCES clinical_journeys(id) ON DELETE CASCADE,
    narrative_id UUID NOT NULL REFERENCES clinical_narratives(id) ON DELETE CASCADE,
    
    -- Link Metadata
    contribution_type TEXT CHECK (contribution_type IN (
        'primary_narrative', 'supporting_narrative', 'contextual_narrative'
    )),
    chronological_order INTEGER, -- Order within journey timeline
    clinical_significance TEXT CHECK (clinical_significance IN (
        'milestone', 'routine', 'complication', 'resolution'
    )),
    
    -- Temporal Context
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    journey_phase TEXT, -- "initiation", "active_treatment", "maintenance", "resolution"
    
    UNIQUE(journey_id, narrative_id)
);

-- Journey milestones and key events
journey_milestones (
    milestone_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journey_id UUID NOT NULL REFERENCES clinical_journeys(id) ON DELETE CASCADE,
    
    -- Milestone Definition
    milestone_name TEXT NOT NULL, -- "Initial Diagnosis", "Treatment Initiation", "Remission Achieved"
    milestone_description TEXT,
    milestone_type TEXT CHECK (milestone_type IN (
        'diagnosis', 'treatment_start', 'treatment_change', 'complication', 
        'improvement', 'resolution', 'maintenance_milestone'
    )),
    
    -- Clinical Context
    milestone_date TIMESTAMPTZ NOT NULL,
    contributing_narrative_id UUID REFERENCES clinical_narratives(id),
    clinical_significance INTEGER CHECK (clinical_significance BETWEEN 1 AND 10), -- 1=routine, 10=critical
    
    -- Provider and Location
    milestone_provider TEXT,
    milestone_facility TEXT,
    
    -- Outcomes and Metrics
    outcome_measures JSONB DEFAULT '{}', -- {"blood_pressure": "140/90", "a1c": "7.2%"}
    patient_reported_outcomes TEXT, -- Subjective patient experience
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Journey Detection Engine

```typescript
interface JourneyDetectionConfig {
  temporal_window: string; // "2 years" - look-back period for journey detection
  semantic_similarity_threshold: number; // 0.8 - minimum similarity for journey continuation
  minimum_narrative_count: number; // 3 - minimum narratives to constitute a journey
  journey_gap_tolerance: string; // "6 months" - maximum gap between related narratives
}

class ClinicalJourneyDetector {
  async detectJourneyOpportunities(
    patientId: string, 
    newNarratives: ClinicalNarrative[],
    config: JourneyDetectionConfig
  ): Promise<JourneyDetectionResult> {
    
    // Get all existing patient narratives within temporal window
    const existingNarratives = await this.getPatientNarratives(patientId, config.temporal_window);
    const existingJourneys = await this.getPatientJourneys(patientId);
    
    // Analyze for journey patterns
    const journeyAnalysis = await this.analyzeJourneyPatterns({
      existing_narratives: existingNarratives,
      existing_journeys: existingJourneys,
      new_narratives: newNarratives,
      config
    });
    
    return journeyAnalysis;
  }

  private async analyzeJourneyPatterns(input: JourneyAnalysisInput): Promise<JourneyDetectionResult> {
    // AI analyzes clinical narratives for journey continuation or initiation
    const prompt = this.generateJourneyDetectionPrompt(input);
    const aiResponse = await this.callJourneyAnalysisAI(prompt);
    
    return this.parseJourneyDetectionResponse(aiResponse);
  }

  private generateJourneyDetectionPrompt(input: JourneyAnalysisInput): string {
    return `
CLINICAL JOURNEY DETECTION ANALYSIS

PATIENT CONTEXT:
- Patient ID: ${input.patient_id}
- Analysis Window: ${input.config.temporal_window}

EXISTING NARRATIVES (${input.existing_narratives.length}):
${input.existing_narratives.map(n => 
  `- ${n.narrative_purpose}: ${n.ai_narrative_summary} (${n.timeline_span})`
).join('\n')}

EXISTING JOURNEYS (${input.existing_journeys.length}):
${input.existing_journeys.map(j => 
  `- ${j.journey_purpose}: ${j.ai_journey_summary} (${j.journey_status})`
).join('\n')}

NEW NARRATIVES (${input.new_narratives.length}):
${input.new_narratives.map(n => 
  `- ${n.narrative_purpose}: ${n.ai_narrative_summary} (${n.timeline_span})`
).join('\n')}

ANALYSIS TASK:
Determine if any new narratives should:
1. EXTEND existing clinical journeys (continuation of ongoing healthcare stories)
2. INITIATE new clinical journeys (beginning of new healthcare stories)  
3. MERGE existing journeys (recognition that separate narratives are actually same journey)
4. REMAIN STANDALONE (insufficient connection to warrant journey inclusion)

JOURNEY EVALUATION CRITERIA:
- Clinical coherence: Do narratives share common medical purpose/condition?
- Temporal continuity: Are narratives part of logical healthcare progression?
- Provider continuity: Same or coordinated care team involvement?
- Treatment continuity: Logical progression of diagnostic or therapeutic approach?

OUTPUT FORMAT:
{
  "journey_actions": [
    {
      "action_type": "extend_journey|create_journey|merge_journeys|standalone",
      "journey_id": "existing_journey_uuid_or_new",
      "journey_purpose": "descriptive_journey_name",
      "affected_narrative_ids": ["narrative_uuid_1", "narrative_uuid_2"],
      "confidence": 0.0-1.0,
      "clinical_rationale": "explanation_of_clinical_reasoning",
      "key_milestones": ["milestone_1", "milestone_2"],
      "estimated_journey_completion": "ongoing|6_months|1_year|completed"
    }
  ]
}

EXAMPLES:
- Pregnancy: Multiple prenatal visits → Single "Pregnancy Journey" 
- Diabetes: Diagnosis + ongoing management → "Diabetes Management Evolution"
- Surgery: Consultation + procedure + recovery → "Cardiac Surgery Care Pathway"
    `.trim();
  }
}
```

## Clinical Journey Examples

### Example 1: Pregnancy Journey (Episode Care)

**Timeline:** 9 months + 6 weeks postpartum  
**Documents:** 10 shell files uploaded over 11 months  
**Journey Status:** Completed

```json
{
  "journey_id": "pregnancy_001",
  "journey_purpose": "first_pregnancy_journey_2024",
  "journey_type": "episode_care",
  "clinical_classification": "reproductive_health_journey",
  "journey_status": "completed",
  "journey_start_date": "2024-01-15", // First positive pregnancy test
  "journey_end_date": "2024-11-30", // 6-week postpartum checkup
  "ai_journey_summary": "Complete first pregnancy journey from conception through postpartum recovery, including gestational diabetes management and successful vaginal delivery at 39 weeks",
  "source_shell_files": [
    "pregnancy_confirmation_labs.pdf", // Week 8
    "first_trimester_screening.pdf", // Week 12  
    "anatomy_scan_results.pdf", // Week 20
    "gestational_diabetes_screening.pdf", // Week 24
    "glucose_tolerance_test.pdf", // Week 26
    "third_trimester_monitoring.pdf", // Week 32
    "group_b_strep_results.pdf", // Week 36
    "final_prenatal_visit.pdf", // Week 39
    "delivery_discharge_summary.pdf", // Birth
    "postpartum_checkup_notes.pdf" // 6 weeks post
  ],
  "ai_key_milestones": [
    "Pregnancy confirmation and initial prenatal care",
    "Normal first trimester screening results",
    "Gestational diabetes diagnosis and dietary management",
    "Successful glucose control throughout third trimester", 
    "Spontaneous labor onset at 39 weeks",
    "Uncomplicated vaginal delivery of healthy infant",
    "Complete postpartum recovery and breastfeeding establishment"
  ],
  "total_documents": 10,
  "total_encounters": 15, // Some documents contain multiple visit notes
  "journey_complexity_score": 0.7 // Moderate complexity due to GDM
}
```

### Example 2: Diabetes Management Evolution (Condition Management)

**Timeline:** 2+ years ongoing  
**Documents:** 15+ shell files over 24 months  
**Journey Status:** Active

```json
{
  "journey_id": "diabetes_mgmt_001", 
  "journey_purpose": "type2_diabetes_diagnosis_to_optimization",
  "journey_type": "condition_management",
  "clinical_classification": "chronic_disease_progression",
  "journey_status": "active",
  "journey_start_date": "2022-03-15", // Initial elevated A1C discovery
  "journey_end_date": null, // Ongoing chronic condition management
  "ai_journey_summary": "Type 2 diabetes management journey from initial diagnosis (A1C 8.2%) through medication optimization and lifestyle intervention to current stable management (A1C 6.8%) with ongoing monitoring and care coordination",
  "source_shell_files": [
    "routine_physical_abnormal_glucose.pdf",
    "diabetes_confirmation_labs.pdf",
    "endocrinologist_referral.pdf",
    "diabetes_education_program.pdf",
    "metformin_initiation_followup.pdf",
    "quarterly_a1c_monitoring_2022.pdf",
    "dietary_consultation_notes.pdf",
    "medication_adjustment_visits.pdf",
    "annual_diabetes_comprehensive_exam.pdf",
    "quarterly_a1c_monitoring_2023.pdf",
    "eye_exam_diabetic_screening.pdf",
    "podiatry_preventive_care.pdf",
    "diabetes_medication_optimization.pdf",
    "continuous_glucose_monitor_trial.pdf",
    "latest_quarterly_monitoring.pdf"
  ],
  "ai_key_milestones": [
    "Initial type 2 diabetes diagnosis with A1C 8.2%",
    "Endocrinology referral and comprehensive diabetes evaluation",
    "Metformin initiation with diabetes education program",
    "Achievement of target A1C <7% after 6 months",
    "Successful lifestyle modification integration",
    "Addition of preventive care specialists (ophthalmology, podiatry)",
    "Current maintenance phase with stable glycemic control"
  ],
  "contributing_providers": [
    "Dr. Johnson - Primary Care",
    "Dr. Martinez - Endocrinology", 
    "Susan Chen, RD - Diabetes Educator",
    "Dr. Lee - Ophthalmology",
    "Dr. Patel - Podiatry"
  ],
  "journey_complexity_score": 0.8 // High complexity due to multi-provider coordination
}
```

## User Experience: Clinical Journeys Dashboard

### Navigation Enhancement
**Current Tabs:** Dashboard | Documents | Conditions | Medications  
**Enhanced Tabs:** Dashboard | Documents | Conditions | Medications | **Clinical Journeys** ← New

### Clinical Journeys Dashboard Features

#### Journey Categories
```
🤰 Active Journeys (3)
├── Pregnancy Journey (Week 32 of 40)
├── Physical Therapy Recovery (Week 8 of 12)  
└── Hypertension Optimization (Month 6 ongoing)

📚 Completed Journeys (8)
├── Appendectomy Care Pathway (Jan-Mar 2023)
├── COVID Recovery Journey (Dec 2022)
└── Annual Preventive Care Cycle (2023)

⏳ Planned/Anticipated Journeys (2)  
├── Colonoscopy Screening (Due 2024)
└── Cardiac Risk Assessment (Recommended)
```

#### Journey Detail View
**User clicks "Pregnancy Journey":**

```
🤰 Pregnancy Journey: First Pregnancy 2024
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Journey Overview
Status: Active (Week 32 of 40) | Expected completion: November 2024
Complexity: Moderate (gestational diabetes managed)

⏱️ Timeline Visualization  
Week 8  ●────Week 12───●─────Week 20────●─────Week 24────●─────Week 32────●─────Week 40
      Confirmed    NT Screen    Anatomy      GDM Screen   Current      Expected
                     Normal       Normal       Positive    Visit       Delivery

🏥 Care Team
Dr. Sarah Wilson - OB/GYN (Primary)
Maria Rodriguez, RN - Diabetes Educator  
Regional Hospital Maternity Unit

📋 Key Milestones Achieved
✅ Pregnancy confirmation and initial prenatal care
✅ Normal first trimester screening results
✅ Normal fetal anatomy at 20 weeks
✅ Gestational diabetes diagnosis and management plan
✅ Successful glucose control with dietary modifications
🔄 Current: Third trimester monitoring and preparation

📄 Contributing Documents (8 of estimated 10)
[Jan 15] Pregnancy confirmation labs → Week 8 visit notes
[Feb 12] First trimester screening → Normal results  
[Apr 15] Anatomy scan report → Normal fetal development
[May 20] Gestational diabetes screening → Elevated glucose
[Jun 05] Diabetes management plan → Dietary counseling
[Jul 10] Glucose monitoring logs → Excellent control
[Aug 15] Third trimester assessment → Normal progress
[Sep 12] Latest prenatal visit → Preparing for delivery

🔮 Upcoming Milestones
📅 Week 36: Group B Strep screening
📅 Week 38: Final prenatal assessment  
📅 Week 40: Expected delivery date
📅 6 weeks post: Postpartum checkup and journey completion
```

## Journey Intelligence Benefits

### For Patients
- **Coherent Healthcare Stories**: "My pregnancy journey" vs "Random prenatal documents"
- **Progress Visualization**: See how medical episodes unfold over time
- **Care Coordination Understanding**: Visualize how multiple providers contribute to single journey
- **Milestone Achievement**: Celebrate healthcare progress and completed phases
- **Future Planning**: Understand expected journey progression and upcoming milestones

### For Healthcare Providers  
- **Longitudinal Care Insights**: Complete patient journey context for clinical decision-making
- **Care Coordination**: Understand how their care fits into broader patient journey
- **Outcome Tracking**: Monitor journey progression and intervention effectiveness
- **Patient Communication**: Discuss care in context of meaningful healthcare narratives
- **Quality Improvement**: Analyze journey patterns for care pathway optimization

### For Healthcare System
- **Population Health**: Identify common journey patterns and intervention opportunities
- **Care Pathway Optimization**: Improve standard journey templates based on successful outcomes
- **Resource Planning**: Anticipate healthcare resource needs based on journey phases
- **Outcome Measurement**: Track journey completion rates and patient satisfaction
- **Clinical Research**: Analyze journey patterns for healthcare improvement insights

## Implementation Roadmap

### Phase 1: Foundation (6 months)
**Prerequisites:** Semantic Document Architecture fully implemented
1. **Database Schema Implementation**
   - Create clinical_journeys, journey_narrative_links, journey_milestones tables
   - Implement journey detection engine infrastructure
   - Create AI prompt templates for journey analysis

2. **Journey Detection Engine Development**
   - Implement temporal pattern analysis
   - Develop semantic similarity algorithms for narrative clustering
   - Create AI-powered journey classification system

3. **Basic Journey Management**
   - Journey creation and lifecycle management
   - Narrative-to-journey linking mechanisms
   - Journey milestone tracking system

### Phase 2: Intelligence Layer (4 months)
1. **Advanced Journey Detection**
   - Multi-condition journey handling (comorbidities)
   - Cross-provider journey recognition
   - Journey merge and split capabilities

2. **Journey Intelligence Enhancement**
   - Predictive milestone identification
   - Journey outcome prediction
   - Care pathway optimization suggestions

3. **Provider Integration**
   - Journey-aware clinical decision support
   - Provider dashboard journey insights
   - Care coordination journey sharing

### Phase 3: Patient Experience (4 months)
1. **Clinical Journeys Dashboard**
   - Journey visualization and timeline interface
   - Interactive journey exploration
   - Journey-based document organization

2. **Patient Engagement Features**
   - Journey progress notifications
   - Milestone achievement celebrations
   - Journey sharing with family/caregivers

3. **Advanced Analytics**
   - Journey outcome analytics
   - Population health journey insights  
   - Predictive healthcare planning

### Phase 4: Healthcare System Integration (6 months)
1. **Provider Portal Integration**
   - Journey-aware electronic health records
   - Multi-provider journey coordination
   - Journey-based quality metrics

2. **Healthcare System Analytics**
   - Journey pattern analysis for care improvement
   - Resource utilization journey optimization
   - Clinical pathway standardization

3. **Research and Quality Improvement**
   - Journey outcome research capabilities
   - Care pathway effectiveness analysis
   - Healthcare delivery optimization insights

## Success Metrics

### Technical Metrics
- [ ] Journey detection accuracy rate >90% for clear clinical progressions
- [ ] Journey timeline accuracy within 1 week for milestone predictions
- [ ] Cross-document narrative linking accuracy >95%
- [ ] Journey intelligence processing time <30 seconds per patient analysis

### Clinical Metrics  
- [ ] Healthcare provider adoption rate >75% within 12 months
- [ ] Clinical decision support improvement from journey context
- [ ] Care coordination efficiency improvement measured by provider feedback
- [ ] Patient outcome improvement in journey-managed conditions

### Patient Experience Metrics
- [ ] Patient engagement increase with journey-based healthcare organization
- [ ] Patient understanding improvement of their healthcare progression
- [ ] Patient satisfaction with longitudinal healthcare storytelling  
- [ ] Journey completion rate improvement for preventive care pathways

### Healthcare System Metrics
- [ ] Population health insights from journey pattern analysis
- [ ] Care pathway optimization resulting in improved outcomes
- [ ] Resource utilization efficiency from journey-based planning
- [ ] Healthcare cost reduction through improved care coordination

---

## Conclusion: From Documents to Healthcare Stories

Clinical Journeys represent the ultimate evolution of patient-centered healthcare data organization. By transcending document boundaries and creating meaningful longitudinal narratives, we transform healthcare from isolated events into coherent stories of human care and healing.

This architecture enables patients to understand their healthcare as **journeys of care** rather than **collections of documents**, while providing healthcare providers with **longitudinal clinical intelligence** that supports better decision-making and care coordination.

The pregnancy journey example demonstrates how this approach creates **emotionally meaningful** and **clinically valuable** healthcare narratives that span months of care across multiple providers and dozens of clinical encounters - all unified into a single, comprehensible story of healthcare.

**Next Evolution:** Implementation begins with journey detection engine development, building upon the semantic document architecture foundation to create the future of patient-centered healthcare data organization.