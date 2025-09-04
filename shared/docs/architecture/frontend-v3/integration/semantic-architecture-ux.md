# Semantic Architecture UX Integration

**Date:** September 4, 2025  
**Purpose:** Clinical narrative UX patterns and implementation guide for V3 semantic architecture  
**Reference:** [SEMANTIC_ARCHITECTURE_UX_EXAMPLES.md](../../database-foundation-v3/SEMANTIC_ARCHITECTURE_UX_EXAMPLES.md)  

---

## Clinical Narrative UX Patterns

### **Medication Story Popups**
**User Flow:** Click medication → see complete clinical story

**Component Pattern:**
```tsx
<MedicationStoryModal>
  <MedicationHeader name="Metformin 500mg" status="Active" />
  <TreatingCondition condition="Type 2 Diabetes" link={true} />
  <PrescriptionContext prescriber="Dr. Martinez" date="March 2022" />
  <TherapeuticOutcome outcome="A1C reduced to 6.8%" />
  <ClinicalNarrative story="Started after failed dietary modifications..." />
  <RelatedDocuments documents={linkedDocs} />
</MedicationStoryModal>
```

### **Condition Timeline Discovery**
**User Flow:** Click condition → see discovery journey

### **Cross-Referenced Medical Data**
**Pattern:** Smart connections showing relationships between clinical elements

---

## Russian Babushka Doll Data Layering

### **Layer 1: Timeline Event**
- User-facing display with icons and summaries

### **Layer 2: Clinical Event**  
- O3 classification and healthcare coding

### **Layer 3: Encounter Context**
- Provider and facility information

### **Layer 4: Detailed Data**
- Specific measurements and clinical details

### **Layer 5: Specialized Context**
- Domain-specific information and cross-references

---

## Implementation Components

### **Core Narrative Components**
- `<ClinicalStoryModal />` - Main narrative display
- `<MedicationStoryPopup />` - Medication-specific stories
- `<ConditionTimelineModal />` - Condition discovery journey
- `<CrossReferenceLinks />` - Smart data connections
- `<NarrativeSourceMapping />` - Document page references

### **Data Integration Hooks**
```typescript
useClinicalNarrative(itemId, itemType)
useConditionStory(conditionId)  
useMedicationContext(medicationId)
useCrossReferences(clinicalEventId)
```