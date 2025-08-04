# Guardian Architecture Documentation

**Navigate Guardian's technical architecture, decisions, and implementation guides.**

---

## 🏗️ **Current Architecture (v7)**

**Active production architecture** - Guardian Healthcare Journey System

- **[Overview](current/README.md)** - v7 system overview and key features
- **[Core Components](current/core/)** - Database schema, security, performance, optimization
- **[Features](current/features/)** - Healthcare journey, appointments, user experience  
- **[Integration](current/integration/)** - FHIR/HL7, infrastructure integration
- **[Implementation](current/implementation/)** - Deployment guide, SQL scripts, testing

---

## 📋 **Architecture Decisions (ADRs)**

**All architectural decisions in one searchable location**

- **[Infrastructure](decisions/infrastructure/)** - Database, deployment architecture
- **[Pipeline](decisions/pipeline/)** - Document processing pipeline strategies
- **[Frontend](decisions/frontend/)** - Frontend development workflows

---

## 🔍 **Research & Analysis**

**Active research supporting architecture decisions**

- **[Health App RAG AI](research/health-app-rag-ai.md)** - AI chatbot strategy and implementation
- **[OCR Comparison](research/ocr-comparison.md)** - OCR technology evaluation
- **[Database Analysis](research/relational-db-analysis/)** - Relational database design research

---

## 📐 **System Overview**

**High-level architecture documentation**

- **[System Design](overview/system-design.md)** - Overall system architecture
- **[Vision](overview/vision.md)** - Product vision and architectural goals
- **[Prototype](overview/prototype.md)** - POC and prototype information

---

## 🎨 **Frontend Architecture**

**Frontend-specific architectural documentation**

- **[Design Principles](frontend/design.md)** - Frontend architecture and design patterns
- **[AI Prompts](frontend/prompts/)** - AI-assisted development prompts

---

## 📚 **Historical Archive**

**Complete architecture evolution history organized chronologically**

- **[v1-v6 Evolution](_archive/v1-v6/)** - Pre-v7 architecture iterations and unified data architecture development
- **[v7 Review Process](_archive/v7-reviews/)** - Multi-AI collaborative review methodology and complete v7 refinement process
  - **2025-08-04**: Initial independent AI reviews (O3, Gemini, Sonnet4) and synthesis
  - **2025-08-04**: Meta-reviews, implementation execution, and gap identification  
  - **2025-08-05**: Collaborative Gemini-Claude synthesis and final implementation strategy

**Note:** All archived materials have been fully implemented into the current v7 architecture. The archive preserves the complete collaborative AI review methodology for future reference.

---

## 🚀 **Quick Start**

1. **Start with Current**: Review [v7 Overview](current/README.md) for active architecture
2. **Implementation**: Follow [Implementation Guide](current/implementation/guide.md) for deployment
3. **Understanding Decisions**: Browse [ADRs](decisions/) to understand architectural choices

---

## 📖 **Documentation Standards**

- **Current**: Always up-to-date, ready for implementation
- **Decisions**: Immutable record of architectural choices
- **Research**: Analysis supporting decisions, clearly marked with status
- **Archive**: Historical versions for reference only

---

*For questions about Guardian's architecture, start with the [Current Architecture](current/) documentation or consult the relevant [Architecture Decision Records](decisions/).*