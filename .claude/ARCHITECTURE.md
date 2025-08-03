# Guardian AI System Architecture

**Version**: 1.0  
**Date**: August 2025  
**System**: Claude Code Subagent Architecture for Guardian Healthcare Platform

---

## 🎯 System Design Overview

```
                    ┌─────────────────────────────────────────┐
                    │            USER INPUT                   │
                    │    "Optimize database performance"      │
                    └─────────────────┬───────────────────────┘
                                      │
                    ┌─────────────────▼───────────────────────┐
                    │         MAIN CLAUDE CODE             │
                    │      (Delegation & Routing)           │
                    └─────────────────┬───────────────────────┘
                                      │
           ┌──────────────────────────┼──────────────────────────┐
           │                          │                          │
           ▼                          ▼                          ▼
    ┌─────────────┐          ┌─────────────┐          ┌─────────────┐
    │   SERGEI    │          │   TESSA     │          │    PRUE     │
    │Infrastructure│          │ AI Pipeline │          │  Frontend   │
    └─────────────┘          └─────────────┘          └─────────────┘
           │                          │                          │
           ▼                          ▼                          ▼
    ┌─────────────┐          ┌─────────────┐          ┌─────────────┐
    │   QUINN     │          │    CLEO     │          │     ANA     │
    │   Quality   │          │ Healthcare  │          │  Analytics  │
    └─────────────┘          └─────────────┘          └─────────────┘
                                      │
                                      ▼
                              ┌─────────────┐
                              │    GROOT    │
                              │   Growth    │
                              └─────────────┘
```

---

## 🧠 Agent Specialization Map

### **Technical Agents**

#### **🔧 Sergei (Infrastructure Specialist)**
```yaml
Domain: Backend Infrastructure
Expertise:
  - Supabase (Database, Auth, Edge Functions)
  - Render.com (Deployment, Scaling)
  - PostgreSQL (Optimization, RLS, Migrations)
  - Security & Compliance (HIPAA, Audit Trails)
  
Context Paths:
  - supabase/
  - lib/supabase*
  - middleware.ts
  - Database migrations
  
Memory Focus:
  - Deployment patterns
  - Database optimizations
  - Security configurations
  - Performance tuning
```

#### **🤖 Tessa (AI Processing Specialist)**
```yaml
Domain: Document Processing & AI
Expertise:
  - Document Processing Pipeline
  - OCR & Vision AI (Google Cloud Vision, GPT-4o Mini)
  - Cost Optimization
  - Medical Data Extraction
  
Context Paths:
  - supabase/functions/document-*
  - utils/validateAIOutput.ts
  - AI pipeline documentation
  
Memory Focus:
  - Processing improvements
  - Model performance comparisons
  - Cost optimization strategies
  - Accuracy patterns
```

#### **🎨 Prue (Frontend Specialist)**
```yaml
Domain: User Interface & Experience
Expertise:
  - Next.js 15 & React 19
  - Healthcare UI Patterns
  - Accessibility & Compliance
  - Component Architecture
  
Context Paths:
  - app/
  - components/
  - Frontend documentation
  
Memory Focus:
  - UI patterns and components
  - User feedback insights
  - Accessibility improvements
  - Performance optimizations
```

### **Quality & Healthcare Agents**

#### **✅ Quinn (Quality Specialist)**
```yaml
Domain: Testing & Data Quality
Expertise:
  - Medical Data Validation
  - Automated Testing
  - Quality Assurance
  - Error Detection & Prevention
  
Context Paths:
  - utils/test*
  - scripts/validate*
  - Quality systems
  
Memory Focus:
  - Test strategies
  - Validation patterns
  - Quality improvements
  - Error analysis
```

#### **🏥 Cleo (Healthcare Data Specialist)**
```yaml
Domain: Medical Standards & Workflows
Expertise:
  - FHIR/HL7 Standards
  - Medical Terminology
  - Clinical Workflows
  - Multi-Profile Healthcare
  
Context Paths:
  - docs/architecture/v7/
  - Healthcare journey documentation
  - Clinical event schemas
  
Memory Focus:
  - Medical data mappings
  - Clinical patterns
  - Healthcare standards
  - Compliance requirements
```

### **Business Intelligence Agents**

#### **📊 Ana (Analytics Specialist)**
```yaml
Domain: Data Analysis & Business Intelligence
Expertise:
  - Product Metrics & KPIs
  - User Behavior Analysis
  - Performance Monitoring
  - Data Visualization
  
Context Paths:
  - Dashboard components
  - Metrics tracking systems
  
Memory Focus:
  - KPI patterns
  - User insights
  - Metric correlations
  - Performance trends
```

#### **📈 Groot (Growth Specialist)**
```yaml
Domain: Marketing & User Growth
Expertise:
  - User Acquisition
  - Growth Experiments
  - Conversion Optimization
  - Retention Strategies
  
Context Paths:
  - Landing pages
  - Onboarding flows
  - Marketing components
  
Memory Focus:
  - Growth experiments
  - Conversion patterns
  - User acquisition strategies
  - Retention insights
```

---

## 🔄 Data Flow Architecture

### **1. User Request Processing**
```
User Input → Main Claude → Intent Analysis → Agent Selection → Specialized Response
```

### **2. Agent Memory System**
```
┌─────────────────────────────────────────────────────────────────┐
│                        AGENT MEMORY SYSTEM                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Private Memory Banks           Shared Memory                   │
│  ┌─────────────────┐           ┌─────────────────┐             │
│  │ Sergei's Memory │           │ Project-Wide    │             │
│  │ - DB patterns   │◄─────────►│ - Decisions     │             │
│  │ - Deploy logs   │           │ - Architecture  │             │
│  │ - Security tips │           │ - Best practices│             │
│  └─────────────────┘           └─────────────────┘             │
│                                                                 │
│  ┌─────────────────┐           External Data (MCP)             │
│  │ Tessa's Memory  │           ┌─────────────────┐             │
│  │ - AI improvements│◄─────────►│ Live Metrics   │             │
│  │ - Cost tracking │           │ - Supabase logs │             │
│  │ - Model perf    │           │ - Error tracking│             │
│  └─────────────────┘           └─────────────────┘             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### **3. Inter-Agent Communication**
```
Agent A (Problem) → Shared Memory → Agent B (Solution) → Combined Response
```

---

## ⚡ Command Routing System

### **Slash Command → Agent Mapping**
```yaml
Infrastructure Commands:
  /infra:* → Sergei
  - deploy, migrate, monitor, scale

AI Processing Commands:
  /ai:* → Tessa  
  - process, optimize, validate, pipeline

Frontend Commands:
  /ui:* → Prue
  - component, optimize, accessibility

Quality Commands:
  /test:* → Quinn
  - medical, validate, quality

Healthcare Commands:
  /health:* → Cleo
  - fhir, mapping, standards

Analytics Commands:
  /analytics:* → Ana
  - metrics, dashboard, funnel

Growth Commands:
  /growth:* → Groot
  - experiment, acquisition, retention
```

---

## 🔌 External Integration Architecture

### **MCP (Model Context Protocol) Integration**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   GUARDIAN DB   │    │  SUPABASE LOGS  │    │  RENDER METRICS │
│   (PostgreSQL)  │    │   (Analytics)   │    │  (Performance)  │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                │
                    ┌───────────▼──────────┐
                    │     MCP SERVERS      │
                    │  (External Data)     │
                    └───────────┬──────────┘
                                │
                    ┌───────────▼──────────┐
                    │    CLAUDE AGENTS     │
                    │  (With Live Data)    │
                    └──────────────────────┘
```

### **Hook System Architecture**
```yaml
Event Triggers:
  PostToolUse: File changes → Update agent context
  SubagentStop: Interaction complete → Save learnings
  SessionStart: New session → Refresh external data
  
Automation Flow:
  Code Change → Hook Trigger → Context Update → Agent Memory Update
```

---

## 📊 Performance & Scaling

### **Agent Load Distribution**
```
High-Usage Agents:
├── Sergei (Infrastructure) - 40% of requests
├── Tessa (AI Processing) - 25% of requests
└── Prue (Frontend) - 20% of requests

Medium-Usage Agents:
├── Quinn (Quality) - 10% of requests
└── Cleo (Healthcare) - 5% of requests

Analytical Agents:
├── Ana (Analytics) - On-demand analysis
└── Groot (Growth) - Weekly/monthly reviews
```

### **Memory Optimization**
```yaml
Memory Retention Strategy:
  - Keep last 30 days of interactions
  - Archive older learnings to compressed summaries
  - Prioritize high-impact insights
  - Regular memory cleanup and optimization
```

---

## 🔒 Security & Compliance

### **Data Protection Layers**
```
┌─────────────────────────────────────────────────────────────────┐
│                      SECURITY ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Agent Memory         Shared Context        External Data       │
│  ┌─────────────┐     ┌─────────────┐      ┌─────────────┐      │
│  │ Encrypted   │────►│ HIPAA       │─────►│ Secure APIs │      │
│  │ Local Files │     │ Compliant   │      │ (TLS/Auth)  │      │
│  │ (Private)   │     │ Sharing     │      │             │      │
│  └─────────────┘     └─────────────┘      └─────────────┘      │
│                                                                 │
│  Audit Trail: All agent interactions logged for compliance     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Deployment & Maintenance

### **System Health Monitoring**
```yaml
Key Metrics:
  - Agent response accuracy
  - Memory utilization
  - External data freshness
  - Command success rates
  - Inter-agent collaboration effectiveness

Maintenance Tasks:
  - Weekly memory optimization
  - Monthly agent performance review
  - Quarterly external data source updates
  - Continuous learning improvements
```

---

## 🔄 Evolution Strategy

### **Continuous Improvement Loop**
```
User Feedback → Agent Performance Analysis → Memory Updates → 
Prompt Refinement → External Data Enhancement → Better Responses
```

### **Scaling Plan**
```yaml
Phase 1: Core 7 agents with basic memory
Phase 2: External data integration via MCP
Phase 3: Advanced inter-agent collaboration
Phase 4: Predictive assistance and automation
```

---

This architecture creates a **specialized AI operations team** that grows smarter over time, understands your Guardian codebase deeply, and provides expert assistance across all domains of your healthcare platform development.