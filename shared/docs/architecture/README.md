# Guardian Architecture Documentation

**Purpose:** Complete architectural documentation for the Guardian healthcare platform  
**Last updated:** August 18, 2025  
**Status:** Production-ready database foundation, AI processing implementation ready  

---

## **Complete Guardian Pipeline**

Guardian processes healthcare data through a comprehensive pipeline designed for accuracy, security, and user experience:

```
Data Ingestion → AI Processing → Database Foundation → Frontend Experience
```

### **Pipeline Overview**

1. **Data Ingestion** - Multiple pathways for healthcare data entry
2. **AI Processing** - AI-first multimodal processing with intelligent intake screening  
3. **Database Foundation** - Secure storage, normalization, and compliance
4. **Frontend Experience** - User interfaces and healthcare journey visualization

---

## **Architecture Modules**

### **[Data Ingestion](./data-ingestion/)**
*How healthcare data enters the Guardian system*

- **[Manual Upload](./data-ingestion/manual-upload/)** - File upload portal for documents and images
- **[Automated Aggregation](./data-ingestion/automated-aggregation/)** - Email sync, photo library scanning
- **[External Integrations](./data-ingestion/external-integrations/)** - Wearables, lab systems, MyHealth APIs
- **Status:** Manual upload complete, automated systems planned

### **[AI Processing](./ai-processing/)**
*AI-first multimodal document processing with intelligent intake screening*

- **[Intake Screening](./ai-processing/intake-screening/)** - Identity verification and content classification
- **[AI Extraction](./ai-processing/ai-extraction/)** - Multi-provider AI framework for direct document processing
- **[OCR Integration](./ai-processing/ocr-integration/)** - Always-available OCR with intelligent adjunct strategies
- **[Processing Pipeline](./ai-processing/processing-pipeline/)** - PostgreSQL queue-based processing with Render workers
- **Status:** Implementation ready - 4-phase roadmap completed

### **[Database Foundation](./database-foundation/)**
*Secure storage, normalization, and healthcare compliance*

- **[Core Schema](./database-foundation/core/)** - Clinical events, multi-profile, security
- **[Features](./database-foundation/features/)** - Healthcare journey, appointments, user experience
- **[Implementation](./database-foundation/implementation/)** - Production deployment scripts and guides
- **[Integration](./database-foundation/integration/)** - FHIR, HL7, healthcare interoperability
- **Status:** Production-ready (47 tables, 917 functions, comprehensive validation)

### **[Frontend](./frontend/)**
*User interfaces and healthcare journey visualization*

- **[Design System](./frontend/design.md)** - UI components and design patterns
- **[Prompts](./frontend/prompts/)** - AI-assisted UI development specifications
- **Status:** Next phase - Timeline component development

---

## **Current Implementation Status**

| Pipeline Stage | Status | Key Achievements |
|---------------|--------|------------------|
| **Data Ingestion** | Foundation Complete | File upload, Supabase Storage integration |
| **AI Processing** | Implementation Ready | 4-phase roadmap, cost optimization (85% reduction target) |
| **Database Foundation** | Production Ready | 15 migration scripts deployed, comprehensive validation |
| **Frontend Experience** | In Development | Timeline component next priority |

---

## **Architecture Principles**

### **1. Healthcare-First Design**
- FHIR/HL7 standards integration
- HIPAA/GDPR compliance by design
- Clinical data accuracy and traceability

### **2. AI-First Multimodal Processing**
- Direct document processing with AI vision models
- Always-available OCR with intelligent adjunct strategies
- Multi-provider framework with cost-based routing
- Intelligent intake screening for cost protection

### **3. Family-Centric Architecture**
- Multi-profile support (patients, dependents, pets)
- Granular consent management
- Cross-profile healthcare coordination

### **4. Security & Privacy**
- Row-Level Security (RLS) policies
- Comprehensive audit trails
- Field-level encryption capabilities

### **5. Performance by Design**
- Sub-millisecond query performance
- Optimized indexing and partitioning
- Scalable to millions of records

---

## **Getting Started**

### **For Developers**
1. **Database Foundation** - Start with [implementation guide](./database-foundation/implementation/guide.md)
2. **AI Processing** - Review [4-phase implementation roadmap](./ai-processing/implementation/) for step-by-step development
3. **Frontend Development** - Check [design system](./frontend/design.md) and [component specifications](./frontend/prompts/)

### **For System Architects**
1. **AI Processing Pipeline** - Study [complete architecture overview](./ai-processing/) and implementation phases
2. **Integration Points** - Study [healthcare interoperability](./database-foundation/integration/healthcare-interoperability.md)
3. **Scaling Strategy** - Review [performance](./database-foundation/core/performance.md) and cost optimization targets

### **For Healthcare Professionals**
1. **Data Security** - Review [security & compliance](./database-foundation/core/security-compliance.md)
2. **Clinical Workflow** - Study [healthcare journey](./database-foundation/features/healthcare-journey.md)
3. **AI Processing Accuracy** - Review medical data extraction and quality assurance frameworks

---

## **Architecture Evolution**

- **v7.0** (August 2025): Production-ready database foundation with AI processing implementation ready
- **v7.1** (Planned): AI processing pipeline deployment with 4-phase rollout
- **v7.2** (Planned): Frontend timeline component and multi-profile dashboard
- **v8.0** (Future): Automated data ingestion and provider portal

---

## **Additional Documentation**

- **[Technical Debt Registry](../technical-debt/)** - Planned improvements and monitoring gaps
- **[Implementation Checklist](./database-foundation/implementation/checklist.md)** - Deployment verification
- **[API Documentation](../api/endpoints.md)** - REST API and integration guides
- **[Decision Records](./decisions/)** - Architectural decision rationale

---

## **Contributing**

When contributing to Guardian architecture:

1. **Pipeline Stage Focus** - Contribute to specific pipeline stages
2. **Healthcare Standards** - Maintain FHIR/HL7 compatibility
3. **Security First** - All changes must maintain security standards
4. **Documentation** - Update relevant architecture documentation
5. **Testing** - Include appropriate validation and testing

---

*For questions about Guardian architecture, refer to the specific module documentation or contact the development team.*