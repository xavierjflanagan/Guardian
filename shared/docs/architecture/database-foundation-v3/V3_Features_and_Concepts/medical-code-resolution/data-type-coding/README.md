# Data Type Coding Framework

**Overview**: Comprehensive medical coding strategies for each clinical data type in the V3 medical code resolution system.

## File Structure

This subfolder contains detailed coding frameworks for each major clinical data type:

### **Core Data Type Files**

1. **[medication-coding.md](./medication-coding.md)**
   - RxNorm, PBS, ATC medication coding
   - Brand vs generic resolution strategies
   - Cross-reactivity and therapeutic equivalence
   - Australian TGA integration

2. **[condition-coding.md](./condition-coding.md)**
   - SNOMED-CT primary with ICD-10-AM secondary
   - Acute vs chronic condition handling
   - Diagnostic certainty and clinical context
   - Australian Medicare integration

3. **[procedure-coding.md](./procedure-coding.md)**
   - SNOMED-CT procedures with MBS billing codes
   - Surgical vs diagnostic vs therapeutic procedures
   - ACHI classification integration
   - Emergency vs elective procedure contexts

4. **[allergy-coding.md](./allergy-coding.md)**
   - Drug allergies with RxNorm substance codes
   - Cross-reactivity family management
   - Severity classification and safety alerts
   - Emergency medical information integration

5. **[observation-coding.md](./observation-coding.md)**
   - LOINC codes for pathology and laboratory results
   - UCUM standardized units of measure
   - Vital signs and physiological measurements
   - Reference ranges and clinical interpretation

## Common Architecture Patterns

### **Shared Coding Principles**

All data type coding files follow consistent architectural patterns:

- **2-Level Hierarchy**: Universal codes (Level 1) + Country-specific codes (Level 2)
- **Safety-First Confidence Scoring**: Conservative thresholds for clinical safety
- **No AI Code Hallucination**: Deterministic selection from candidate lists only
- **Complete Audit Trails**: Full provenance tracking for all code assignments
- **Cross-Country Support**: Framework for international expansion

### **Integration Points**

- **Pass 1/Pass 2 Pipeline**: Structured data extraction and enhancement
- **Embedding Strategy**: Semantic similarity with clinical context preservation
- **Database Storage**: Optimized schemas for each data type
- **Clinical Validation**: Professional review workflows for complex cases

### **Australian Healthcare Focus**

All files include specific integration with Australian healthcare systems:
- Medicare Benefits Schedule (MBS) billing codes
- Pharmaceutical Benefits Scheme (PBS) medication codes
- Therapeutic Goods Administration (TGA) regulatory alignment
- Private health insurance compatibility

## Implementation Dependencies

### **Prerequisites**
- [simple-database-schema.md](../simple-database-schema.md) - Split code libraries and regional systems reference
- [pass-integration.md](../pass-integration.md) - Fork-style parallel vector search and AI pipeline integration

### **Vector Storage Decision**
All data type coding depends on Phase 0 vector storage architecture decision:
- **Option A**: pgvector in Supabase for embedding storage
- **Option B**: External vector service (Pinecone/Weaviate)
- **Option C**: Deterministic matching with future vector enhancement

## Usage Guidelines

### **For Implementation**
1. Review the specific data type file for detailed requirements
2. Understand embedding strategies and confidence scoring
3. Implement database schemas per data type specifications
4. Configure clinical validation and review workflows

### **For Clinical Validation**
1. Each file includes clinical review triggers and requirements
2. Safety-critical thresholds require professional oversight
3. Quality assurance metrics for ongoing validation
4. Performance monitoring and accuracy assessment

### **For International Expansion**
1. Universal codes (Level 1) provide international compatibility
2. Country-specific implementation patterns (Level 2) for localization
3. Cross-border healthcare and travel use case support
4. Multi-language and cultural considerations

## Success Metrics

### **Technical Performance**
- Code resolution accuracy >85% for all data types
- Response time <150ms p95 for embedding queries
- Zero hallucinated codes across all implementations
- Complete clinical audit trail coverage

### **Clinical Quality**
- Healthcare professional validation agreement >90%
- Clinical safety incident rate <0.1%
- Patient outcome correlation tracking
- Regulatory compliance adherence

## Future Enhancements

### **Advanced AI Integration**
- Pharmacogenomics and personalized medicine
- Clinical decision support integration
- Population health analytics
- Precision medicine biomarker coding

### **International Standards**
- FHIR interoperability for global healthcare
- HL7 standard alignment
- WHO international classification adoption
- Cross-border emergency medical information

---

**Implementation Status**: Phase 1 Foundation Files Complete
**Next Steps**: Proceed with Phase 2 Australian healthcare codes and database design implementation