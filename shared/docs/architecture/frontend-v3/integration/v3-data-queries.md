# V3 Data Queries Integration

**Date:** September 4, 2025  
**Purpose:** V3 database schema query patterns and React hooks  
**Schema Reference:** [DATABASE_V3_ARCHITECTURE_OVERVIEW.md](../../database-foundation-v3/DATABASE_V3_ARCHITECTURE_OVERVIEW.md)  

---

## V3 Database Integration

### **Core V3 Tables**
- `patient_clinical_events` - Central hub for all clinical activity  
- `patient_observations` - Lab results, measurements, assessments
- `patient_interventions` - Medications, procedures, treatments
- `healthcare_timeline_events` - UI timeline optimization
- `shell_files` - Document management with V3 semantic processing

### **Semantic Architecture Tables**
- `clinical_narratives` - AI-generated clinical stories
- `narrative_condition_links` - Story-to-condition mapping
- `narrative_medication_links` - Story-to-medication mapping

---

## V3-Enhanced React Hooks

### **Clinical Data Hooks**
```typescript
// V3 Central Hub Query
useV3ClinicalEvents(patientId, options?)
  // Returns: patient_clinical_events with related data

// V3 Timeline with Semantic Context
useV3HealthcareTimeline(patientId, dateRange?)
  // Returns: timeline events with narrative links

// V3 Semantic Clinical Search  
useV3SemanticSearch(query, patientId)
  // Returns: AI-powered search across clinical narratives

// V3 Clinical Narratives
useClinicalNarratives(patientId, eventId?)
  // Returns: AI-generated clinical stories linked to events
```

### **Real-time Processing Hooks**
```typescript
// Job Processing Status
useJobProcessingStatus(shellFileId)
  // Returns: real-time job queue status updates

// Document Processing Pipeline
useDocumentProcessingPipeline(shellFileId)
  // Returns: complete processing pipeline status
```

### **Usage Analytics Hooks**
```typescript  
// Usage Tracking Integration
useUsageAnalytics(profileId)
  // Returns: usage metrics, limits, billing cycle data

// Subscription Management
useSubscriptionStatus(userId)
  // Returns: current plan, usage limits, upgrade options
```

---

## Query Performance Patterns

### **V3 Optimized Queries**
- Hub-and-spoke queries for clinical events (< 300ms)
- Specialized table queries for life-critical data (< 50ms)
- Timeline queries with virtual scrolling support
- Semantic search with confidence scoring

### **Caching Strategy**
- TanStack Query with healthcare-optimized defaults
- Real-time invalidation for processing status
- Long-term caching for stable clinical data
- Profile-scoped cache keys for multi-profile support

---

## Error Handling

### **V3-Specific Error Patterns**
- Job processing failures with retry mechanisms
- Semantic data confidence threshold handling
- Real-time connection recovery
- Usage limit enforcement and user feedback