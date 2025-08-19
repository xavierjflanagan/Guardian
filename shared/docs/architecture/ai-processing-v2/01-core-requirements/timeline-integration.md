# Timeline Integration Requirement

**Database Target:** `healthcare_timeline_events` table  
**Priority:** HIGH - Phase 2 core processing requirement  
**Purpose:** Generate patient-friendly timeline metadata for healthcare journey visualization  
**Dependencies:** O3 clinical events framework, clinical details extraction

---

## Requirement Overview

Guardian must generate comprehensive timeline metadata for every clinical event to enable patient healthcare journey visualization, natural language search capabilities, and intuitive healthcare record navigation. This transforms raw clinical data into patient-accessible healthcare stories that improve engagement and health literacy.

### Strategic Importance
Timeline integration converts clinical data into patient experience narratives, making healthcare information accessible to patients and families while maintaining clinical precision for providers. This dual-layer approach enables both patient engagement and clinical decision support.

---

## Timeline Architecture Framework

### Healthcare Timeline Categories

#### Primary Display Categories
```yaml
visit:
  definition: "Healthcare appointments and consultations"
  examples: ["Annual physical", "Specialist consultation", "Emergency room visit"]
  icon: "calendar-medical"
  ui_priority: "high"
  patient_language: "Visit to [Provider Name]"

test_result:
  definition: "Laboratory tests, imaging, and diagnostic procedures"
  examples: ["Blood test results", "X-ray report", "MRI findings"]
  icon: "flask"
  ui_priority: "high"
  patient_language: "[Test Name] Results"

treatment:
  definition: "Medications, procedures, and therapeutic interventions"
  examples: ["Prescription medication", "Physical therapy", "Surgery"]
  icon: "pills"
  ui_priority: "high"
  patient_language: "[Treatment Type] Treatment"

vaccination:
  definition: "Immunizations and preventive shots"
  examples: ["Flu vaccine", "COVID-19 vaccination", "Child immunizations"]
  icon: "shield"
  ui_priority: "medium"
  patient_language: "[Vaccine Name] Vaccination"

screening:
  definition: "Health maintenance and preventive care activities"
  examples: ["Mammogram", "Colonoscopy", "Blood pressure check"]
  icon: "magnifying-glass"
  ui_priority: "medium"
  patient_language: "[Screening Type] Screening"
```

#### Contextual Subcategories
```yaml
test_result_subcategories:
  blood_test: "Blood work and laboratory analysis"
  imaging: "X-rays, CT scans, MRI, ultrasound"
  biopsy: "Tissue analysis and pathology"
  cardiac_test: "Heart-related testing (EKG, stress test)"
  respiratory_test: "Lung function and breathing tests"

treatment_subcategories:
  medication: "Prescription and over-the-counter drugs"
  procedure: "Medical procedures and interventions"
  therapy: "Physical therapy, occupational therapy"
  surgery: "Surgical procedures and operations"
  alternative: "Alternative and complementary medicine"

visit_subcategories:
  annual_exam: "Routine annual health maintenance"
  specialist: "Specialist consultation and care"
  urgent_care: "Urgent but non-emergency care"
  emergency: "Emergency department visits"
  follow_up: "Follow-up visits and monitoring"
```

---

## AI Timeline Generation Requirements

### Timeline Metadata Generation Algorithm

#### Step 1: Clinical Event Analysis
```python
def analyze_clinical_event_for_timeline(clinical_event):
    """Analyze clinical event to determine timeline categorization"""
    
    timeline_analysis = {
        'event_name': clinical_event.event_name,
        'activity_type': clinical_event.activity_type,
        'clinical_purposes': clinical_event.clinical_purposes,
        'context_clues': extract_context_clues(clinical_event),
        'medical_specialty': determine_medical_specialty(clinical_event)
    }
    
    return timeline_analysis

def extract_context_clues(clinical_event):
    """Extract contextual information for timeline categorization"""
    
    context_indicators = {
        'provider_type': extract_provider_type(clinical_event.source_text),
        'facility_type': extract_facility_type(clinical_event.source_text),
        'urgency_indicators': extract_urgency_context(clinical_event.source_text),
        'routine_indicators': extract_routine_context(clinical_event.source_text),
        'preventive_indicators': extract_preventive_context(clinical_event.source_text)
    }
    
    return context_indicators
```

#### Step 2: Timeline Category Assignment
```python
def assign_timeline_category(clinical_event, timeline_analysis):
    """Assign primary display category and subcategory"""
    
    category_assignment = {}
    
    # Priority-based category assignment
    if timeline_analysis['clinical_purposes'][0] == 'preventive':
        if 'vaccine' in clinical_event.event_name.lower():
            category_assignment = {
                'display_category': 'vaccination',
                'display_subcategory': determine_vaccine_subcategory(clinical_event)
            }
        else:
            category_assignment = {
                'display_category': 'screening',
                'display_subcategory': determine_screening_subcategory(clinical_event)
            }
    
    elif clinical_event.activity_type == 'observation':
        if timeline_analysis['context_clues']['facility_type'] == 'laboratory':
            category_assignment = {
                'display_category': 'test_result',
                'display_subcategory': 'blood_test'
            }
        elif 'imaging' in clinical_event.method:
            category_assignment = {
                'display_category': 'test_result', 
                'display_subcategory': 'imaging'
            }
        elif timeline_analysis['context_clues']['provider_type'] in ['primary_care', 'specialist']:
            category_assignment = {
                'display_category': 'visit',
                'display_subcategory': determine_visit_subcategory(timeline_analysis)
            }
    
    elif clinical_event.activity_type == 'intervention':
        if 'medication' in clinical_event.event_name.lower():
            category_assignment = {
                'display_category': 'treatment',
                'display_subcategory': 'medication'
            }
        elif 'surgery' in clinical_event.event_name.lower():
            category_assignment = {
                'display_category': 'treatment',
                'display_subcategory': 'surgery'
            }
        else:
            category_assignment = {
                'display_category': 'treatment',
                'display_subcategory': 'procedure'
            }
    
    return category_assignment
```

#### Step 3: Patient-Friendly Content Generation
```python
def generate_patient_friendly_content(clinical_event, category_assignment):
    """Generate patient-accessible titles, summaries, and descriptions"""
    
    # Generate patient-friendly title
    title = generate_timeline_title(clinical_event, category_assignment)
    
    # Generate brief summary
    summary = generate_timeline_summary(clinical_event, category_assignment)
    
    # Generate searchable content for AI chatbot
    searchable_content = generate_searchable_content(clinical_event, category_assignment)
    
    # Generate event tags for filtering
    event_tags = generate_event_tags(clinical_event, category_assignment)
    
    # Determine UI icon
    icon = determine_timeline_icon(category_assignment)
    
    return {
        'title': title,
        'summary': summary,
        'searchable_content': searchable_content,
        'event_tags': event_tags,
        'icon': icon
    }

def generate_timeline_title(clinical_event, category_assignment):
    """Generate patient-friendly timeline title"""
    
    if category_assignment['display_category'] == 'test_result':
        if 'blood' in clinical_event.event_name.lower():
            return f"Blood Test: {extract_primary_test_name(clinical_event.event_name)}"
        elif 'imaging' in category_assignment['display_subcategory']:
            return f"Imaging: {simplify_imaging_name(clinical_event.event_name)}"
        else:
            return f"Test Results: {simplify_medical_name(clinical_event.event_name)}"
    
    elif category_assignment['display_category'] == 'treatment':
        if 'medication' in category_assignment['display_subcategory']:
            return f"Medication: {extract_medication_name(clinical_event.event_name)}"
        else:
            return f"Treatment: {simplify_medical_name(clinical_event.event_name)}"
    
    elif category_assignment['display_category'] == 'vaccination':
        vaccine_name = extract_vaccine_name(clinical_event.event_name)
        return f"{vaccine_name} Vaccination"
    
    elif category_assignment['display_category'] == 'visit':
        provider_type = extract_provider_type(clinical_event.source_text)
        return f"Visit: {format_provider_name(provider_type)}"
    
    else:
        return simplify_medical_name(clinical_event.event_name)
```

### Patient Language Optimization

#### Health Literacy Considerations
```python
def optimize_for_health_literacy(medical_text, target_literacy_level='8th_grade'):
    """Optimize medical text for patient health literacy"""
    
    # Medical term simplification mapping
    medical_simplifications = {
        'myocardial infarction': 'heart attack',
        'hypertension': 'high blood pressure',
        'diabetes mellitus': 'diabetes',
        'influenza': 'flu',
        'vaccination': 'shot',
        'immunization': 'shot',
        'laboratory': 'lab',
        'radiological': 'imaging',
        'pharmaceutical': 'medication'
    }
    
    simplified_text = medical_text
    for medical_term, simple_term in medical_simplifications.items():
        simplified_text = simplified_text.replace(medical_term, simple_term)
    
    # Check readability level
    readability_score = calculate_readability(simplified_text)
    
    if readability_score > target_literacy_level:
        simplified_text = further_simplify_language(simplified_text)
    
    return simplified_text

def generate_contextual_explanations(clinical_event):
    """Generate contextual explanations for complex medical concepts"""
    
    explanations = {}
    
    # Explain medical procedures
    if clinical_event.activity_type == 'intervention':
        explanations['procedure_purpose'] = explain_procedure_purpose(clinical_event)
        explanations['what_to_expect'] = generate_what_to_expect(clinical_event)
    
    # Explain test results
    elif clinical_event.activity_type == 'observation':
        explanations['test_purpose'] = explain_test_purpose(clinical_event)
        explanations['normal_ranges'] = explain_normal_ranges(clinical_event)
    
    # Explain medications
    if 'medication' in clinical_event.event_name.lower():
        explanations['medication_purpose'] = explain_medication_purpose(clinical_event)
        explanations['how_to_take'] = extract_medication_instructions(clinical_event)
    
    return explanations
```

---

## Database Integration Specifications  

### healthcare_timeline_events Table
```sql
CREATE TABLE healthcare_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Timeline categorization (AI generated)
    display_category TEXT NOT NULL CHECK (display_category IN ('visit', 'test_result', 'treatment', 'vaccination', 'screening')),
    display_subcategory TEXT,
    
    -- Patient-friendly content (AI generated)
    title TEXT NOT NULL,                -- Patient-friendly event title
    summary TEXT,                       -- Brief event description
    searchable_content TEXT,            -- Content optimized for natural language search
    
    -- UI and visualization (AI generated)
    icon TEXT NOT NULL,                 -- UI icon identifier
    event_tags TEXT[],                  -- Tags for filtering and categorization
    ui_priority TEXT DEFAULT 'medium', -- UI prominence (high/medium/low)
    
    -- Clinical context
    event_date DATE NOT NULL,           -- Date of clinical event
    clinical_event_ids UUID[],          -- References to patient_clinical_events
    encounter_id UUID,                  -- Reference to healthcare_encounters if grouped
    
    -- Patient experience metadata
    patient_impact_score INTEGER CHECK (patient_impact_score BETWEEN 1 AND 5), -- Patient significance
    health_literacy_level TEXT DEFAULT '8th_grade', -- Language complexity level
    explanations JSONB,                 -- Contextual explanations for complex concepts
    
    -- Multi-profile context
    profile_specific_language BOOLEAN DEFAULT FALSE, -- Pediatric, veterinary language
    family_coordination_context JSONB, -- Family appointment coordination context
    
    -- State and quality
    reviewed_by_patient BOOLEAN DEFAULT FALSE,
    patient_feedback JSONB,            -- Patient feedback on timeline entry
    ai_confidence_score NUMERIC(4,3),  -- Timeline generation confidence
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints and indexes
    CONSTRAINT timeline_category_consistency CHECK (
        (display_category = 'vaccination' AND array_length(event_tags, 1) > 0) OR
        (display_category != 'vaccination')
    )
);

-- Indexes for common timeline queries
CREATE INDEX idx_healthcare_timeline_patient_date 
ON healthcare_timeline_events (patient_id, event_date DESC);

CREATE INDEX idx_healthcare_timeline_category 
ON healthcare_timeline_events (patient_id, display_category);

CREATE INDEX idx_healthcare_timeline_search 
ON healthcare_timeline_events 
USING gin(to_tsvector('english', searchable_content));

CREATE INDEX idx_healthcare_timeline_tags 
ON healthcare_timeline_events 
USING gin(event_tags);
```

### Timeline Event Grouping and Encounters
```sql
-- Group related timeline events by healthcare encounter
CREATE TABLE healthcare_encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Encounter details
    encounter_date DATE NOT NULL,
    encounter_type TEXT NOT NULL, -- 'office_visit', 'emergency', 'procedure', 'follow_up'
    
    -- Provider and facility context
    provider_name TEXT,
    provider_specialty TEXT,
    facility_name TEXT,
    facility_type TEXT,
    
    -- Encounter summary (AI generated)
    encounter_title TEXT NOT NULL,      -- "Annual Physical with Dr. Smith"
    encounter_summary TEXT,             -- Brief encounter description
    chief_complaint TEXT,               -- Main reason for visit
    
    -- Clinical context
    clinical_event_count INTEGER DEFAULT 0,
    primary_clinical_events UUID[],     -- Most significant events from encounter
    
    -- Timeline integration
    timeline_event_ids UUID[],          -- Related timeline events
    encounter_tags TEXT[],              -- Tags for encounter categorization
    
    -- Quality and confidence
    encounter_confidence_score NUMERIC(4,3),
    requires_review BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Timeline Search and Filtering Support
```sql
-- Search views for natural language timeline queries
CREATE VIEW timeline_search_view AS
SELECT 
    te.id,
    te.patient_id,
    te.title,
    te.summary,
    te.display_category,
    te.event_date,
    te.searchable_content,
    te.event_tags,
    -- Combine clinical event details for search
    string_agg(ce.event_name, ' | ') as clinical_events,
    string_agg(COALESCE(obs.value_text, ''), ' | ') as observation_values,
    string_agg(COALESCE(int.substance_name, ''), ' | ') as intervention_substances
FROM healthcare_timeline_events te
LEFT JOIN unnest(te.clinical_event_ids) as ce_id ON true
LEFT JOIN patient_clinical_events ce ON ce.id = ce_id
LEFT JOIN patient_observations obs ON obs.event_id = ce.id  
LEFT JOIN patient_interventions int ON int.event_id = ce.id
GROUP BY te.id, te.patient_id, te.title, te.summary, te.display_category, 
         te.event_date, te.searchable_content, te.event_tags;

-- Function for natural language timeline search
CREATE OR REPLACE FUNCTION search_patient_timeline(
    p_patient_id UUID,
    p_search_query TEXT,
    p_date_range_start DATE DEFAULT NULL,
    p_date_range_end DATE DEFAULT NULL,
    p_categories TEXT[] DEFAULT NULL,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    timeline_event_id UUID,
    title TEXT,
    summary TEXT,
    event_date DATE,
    display_category TEXT,
    relevance_score REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tsv.id,
        tsv.title,
        tsv.summary, 
        tsv.event_date,
        tsv.display_category,
        ts_rank(
            to_tsvector('english', tsv.searchable_content || ' ' || 
                       COALESCE(tsv.clinical_events, '') || ' ' ||
                       COALESCE(tsv.observation_values, '') || ' ' ||
                       COALESCE(tsv.intervention_substances, '')),
            plainto_tsquery('english', p_search_query)
        ) as relevance_score
    FROM timeline_search_view tsv
    WHERE tsv.patient_id = p_patient_id
      AND (p_date_range_start IS NULL OR tsv.event_date >= p_date_range_start)
      AND (p_date_range_end IS NULL OR tsv.event_date <= p_date_range_end) 
      AND (p_categories IS NULL OR tsv.display_category = ANY(p_categories))
      AND to_tsvector('english', tsv.searchable_content || ' ' || 
                     COALESCE(tsv.clinical_events, '') || ' ' ||
                     COALESCE(tsv.observation_values, '') || ' ' ||
                     COALESCE(tsv.intervention_substances, '')) 
          @@ plainto_tsquery('english', p_search_query)
    ORDER BY relevance_score DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
```

---

## Frontend Integration Requirements

### Timeline Visualization Components

#### Main Timeline Component
```typescript
interface TimelineEvent {
  id: string;
  title: string;
  summary: string;
  display_category: 'visit' | 'test_result' | 'treatment' | 'vaccination' | 'screening';
  display_subcategory: string;
  event_date: Date;
  icon: string;
  event_tags: string[];
  ui_priority: 'high' | 'medium' | 'low';
  clinical_event_ids: string[];
  ai_confidence_score: number;
}

const HealthcareTimeline: React.FC<{
  patientId: string;
  dateRange?: { start: Date; end: Date };
  categoryFilter?: string[];
}> = ({ patientId, dateRange, categoryFilter }) => {
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  
  const fetchTimelineEvents = async () => {
    const params = new URLSearchParams({
      patient_id: patientId,
      ...(dateRange && {
        start_date: dateRange.start.toISOString().split('T')[0],
        end_date: dateRange.end.toISOString().split('T')[0]
      }),
      ...(categoryFilter && { categories: categoryFilter.join(',') }),
      ...(searchQuery && { search: searchQuery })
    });
    
    const response = await fetch(`/api/timeline?${params}`);
    const events = await response.json();
    setTimelineEvents(events);
    setLoading(false);
  };
  
  const handleTimelineSearch = async (query: string) => {
    setSearchQuery(query);
    // Trigger natural language search
    const searchResponse = await fetch('/api/timeline/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_id: patientId,
        search_query: query,
        date_range_start: dateRange?.start,
        date_range_end: dateRange?.end,
        categories: categoryFilter
      })
    });
    
    const searchResults = await searchResponse.json();
    setTimelineEvents(searchResults);
  };
  
  if (loading) return <TimelineSkeleton />;
  
  return (
    <div className="healthcare-timeline">
      <TimelineSearch 
        onSearch={handleTimelineSearch}
        placeholder="Search your health records..."
      />
      
      <TimelineFilters 
        categories={categoryFilter}
        onCategoryChange={setCategoryFilter}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      />
      
      <div className="timeline-events">
        {timelineEvents.map(event => (
          <TimelineEventCard 
            key={event.id}
            event={event}
            onEventClick={() => showEventDetails(event)}
          />
        ))}
      </div>
    </div>
  );
};
```

#### Timeline Event Card Component
```typescript
const TimelineEventCard: React.FC<{
  event: TimelineEvent;
  onEventClick: () => void;
}> = ({ event, onEventClick }) => {
  const getCategoryColor = (category: string) => {
    const colors = {
      visit: 'blue',
      test_result: 'green', 
      treatment: 'purple',
      vaccination: 'orange',
      screening: 'teal'
    };
    return colors[category] || 'gray';
  };
  
  const getCategoryIcon = (category: string, icon: string) => {
    // Map category and specific icon to actual icon component
    return <Icon name={icon} className={`text-${getCategoryColor(category)}-500`} />;
  };
  
  return (
    <div 
      className={`timeline-event-card ${event.ui_priority === 'high' ? 'high-priority' : ''}`}
      onClick={onEventClick}
    >
      <div className="timeline-event-header">
        <div className="event-icon">
          {getCategoryIcon(event.display_category, event.icon)}
        </div>
        
        <div className="event-meta">
          <span className="event-date">
            {formatEventDate(event.event_date)}
          </span>
          <span className={`category-badge ${getCategoryColor(event.display_category)}`}>
            {formatCategoryName(event.display_category)}
          </span>
        </div>
      </div>
      
      <div className="event-content">
        <h3 className="event-title">{event.title}</h3>
        {event.summary && (
          <p className="event-summary">{event.summary}</p>
        )}
      </div>
      
      <div className="event-tags">
        {event.event_tags.slice(0, 3).map(tag => (
          <span key={tag} className="event-tag">{tag}</span>
        ))}
      </div>
      
      {event.ai_confidence_score < 0.8 && (
        <div className="confidence-indicator" title="This entry may need review">
          <Icon name="alert-circle" className="text-yellow-500" size={16} />
        </div>
      )}
    </div>
  );
};
```

### Natural Language Search Integration
```typescript
const TimelineSearchInterface: React.FC<{
  patientId: string;
  onSearchResults: (results: TimelineEvent[]) => void;
}> = ({ patientId, onSearchResults }) => {
  const [searchInput, setSearchInput] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  
  const handleNaturalLanguageSearch = async (query: string) => {
    // Example queries:
    // "Show me my blood test results from last year"
    // "When was my last flu shot?"
    // "Find all visits to cardiologist"
    // "What medications am I taking?"
    
    const response = await fetch('/api/timeline/natural-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_id: patientId,
        natural_query: query
      })
    });
    
    const results = await response.json();
    onSearchResults(results.timeline_events);
  };
  
  const getSearchSuggestions = async (partial_query: string) => {
    // Get intelligent search suggestions based on patient's timeline
    const response = await fetch(`/api/timeline/search-suggestions?q=${partial_query}&patient_id=${patientId}`);
    const suggestions = await response.json();
    setSearchSuggestions(suggestions);
  };
  
  return (
    <div className="timeline-search">
      <SearchInput
        value={searchInput}
        onChange={(value) => {
          setSearchInput(value);
          getSearchSuggestions(value);
        }}
        onSubmit={handleNaturalLanguageSearch}
        placeholder="Ask about your health records..."
        suggestions={searchSuggestions}
      />
      
      <SearchShortcuts
        shortcuts={[
          { label: "Recent lab results", query: "recent blood tests" },
          { label: "All medications", query: "current medications" },
          { label: "Doctor visits", query: "doctor appointments" },
          { label: "Vaccinations", query: "immunizations and shots" }
        ]}
        onShortcutClick={handleNaturalLanguageSearch}
      />
    </div>
  );
};
```

---

## Implementation Examples

### Example 1: Laboratory Result Timeline Generation
```python
# Input: Clinical event from O3 classification
clinical_event = {
    'id': 'hemoglobin-event-001',
    'activity_type': 'observation', 
    'clinical_purposes': ['diagnostic', 'monitoring'],
    'event_name': 'Complete Blood Count - Hemoglobin Measurement',
    'event_date': '2024-07-15',
    'method': 'laboratory',
    'source_text': 'Complete Blood Count - Hemoglobin: 7.2 g/dL (Low)',
    'snomed_code': '33747003',
    'loinc_code': '718-7'
}

# Timeline generation result
timeline_event = {
    'display_category': 'test_result',
    'display_subcategory': 'blood_test',
    'title': 'Blood Test: Complete Blood Count',
    'summary': 'CBC showing low hemoglobin levels requiring follow-up',
    'searchable_content': 'complete blood count CBC hemoglobin anemia low iron deficiency laboratory blood test',
    'icon': 'flask',
    'event_tags': ['laboratory', 'blood_test', 'abnormal', 'requires_followup'],
    'ui_priority': 'high',  # Due to abnormal results
    'patient_impact_score': 4,  # High impact due to abnormal findings
    'explanations': {
        'test_purpose': 'This blood test checks your blood cells and can detect anemia',
        'normal_ranges': 'Normal hemoglobin for women is 12.0-16.0 g/dL',
        'what_results_mean': 'Your hemoglobin is low, which may indicate anemia'
    }
}
```

### Example 2: Vaccination Timeline Generation
```python
# Input: Vaccination clinical event
vaccination_event = {
    'id': 'flu-vaccine-001',
    'activity_type': 'intervention',
    'clinical_purposes': ['preventive'], 
    'event_name': 'Influenza Vaccination',
    'event_date': '2024-09-15',
    'method': 'injection',
    'source_text': 'Administered influenza vaccine, 0.5ml IM left deltoid',
    'snomed_code': '86198006',
    'cpt_code': '90686'
}

# Timeline generation result
timeline_event = {
    'display_category': 'vaccination',
    'display_subcategory': 'annual_vaccination',
    'title': 'Flu Shot',
    'summary': 'Annual influenza vaccination for seasonal flu protection',
    'searchable_content': 'influenza flu shot vaccine vaccination annual preventive immunization seasonal',
    'icon': 'shield',
    'event_tags': ['vaccination', 'preventive', 'annual', 'influenza'],
    'ui_priority': 'medium',
    'patient_impact_score': 2,  # Routine preventive care
    'explanations': {
        'procedure_purpose': 'This shot protects you from getting the flu this season',
        'what_to_expect': 'You may have mild soreness at the injection site',
        'next_steps': 'Get your next flu shot in one year'
    }
}
```

### Example 3: Multi-Profile Pediatric Timeline
```python
# Input: Child vaccination event
child_vaccination = {
    'id': 'mmr-child-001',
    'activity_type': 'intervention',
    'clinical_purposes': ['preventive'],
    'event_name': 'MMR Vaccination (Second Dose)',
    'event_date': '2024-09-05',
    'patient_profile_type': 'child',
    'patient_age': 5,
    'source_text': 'Emma Rodriguez (Age: 5 years) - MMR vaccine second dose'
}

# Pediatric-specific timeline generation  
timeline_event = {
    'display_category': 'vaccination',
    'display_subcategory': 'childhood_immunization',
    'title': 'MMR Shot (2nd Dose)',
    'summary': 'Second MMR vaccination protecting against measles, mumps, and rubella',
    'searchable_content': 'MMR vaccination measles mumps rubella immunization school required second dose childhood',
    'icon': 'shield',
    'event_tags': ['vaccination', 'pediatric', 'school_required', 'MMR'],
    'ui_priority': 'medium',
    'patient_impact_score': 3,  # Important for school enrollment
    'profile_specific_language': True,
    'explanations': {
        'procedure_purpose': "This shot keeps Emma protected from three serious diseases",
        'what_to_expect': "Emma might have a small sore spot where she got the shot",
        'next_steps': "This completes Emma's MMR vaccination series"
    },
    'family_coordination_context': {
        'school_requirements': 'Required for kindergarten enrollment',
        'parent_notes': 'Completed series - bring record to school'
    }
}
```

---

## Success Criteria

### Technical Success Metrics
- **Every clinical event generates timeline metadata** - 100% timeline coverage
- **Patient-friendly language optimization** - 8th grade reading level or below
- **Natural language search effectiveness** - 85%+ relevant results for common queries
- **Timeline categorization accuracy** - 90%+ correct category assignment

### Patient Experience Metrics
- **Healthcare literacy improvement** - Measurable improvement in patient understanding
- **Timeline navigation efficiency** - Patients can find information 50% faster
- **Search success rate** - 80%+ of searches return useful results
- **Patient engagement increase** - Increased time spent reviewing health records

### Clinical Utility Metrics
- **Provider timeline review** - Healthcare providers find timeline useful for care coordination
- **Clinical context preservation** - Timeline maintains clinical accuracy while improving accessibility
- **Multi-profile coordination** - Families can effectively coordinate care across profiles
- **Integration with clinical workflows** - Timeline supports care decision-making

---

*Timeline integration transforms Guardian's clinical data into patient-accessible healthcare narratives, enabling both improved patient engagement and healthcare literacy while maintaining clinical precision for provider coordination and care decision support.*