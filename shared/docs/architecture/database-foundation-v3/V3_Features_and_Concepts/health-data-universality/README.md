# Health Data Universality

**Status**: DEFERRED - Phase 4 Implementation
**Created**: 16 September 2025
**Last Updated**: 17 September 2025
**Implementation Priority**: Phase 4 (after foundation modules)

## ⚠️ IMPLEMENTATION DEFERRED

**Decision Date**: 17 September 2025

**Implementation postponed to Phase 4** to enable optimal architectural sequencing. This module will be implemented after:
1. **temporal-data-management** (supersession framework, silver tables)
2. **medical-code-resolution** (standardized codes, semantic matching)
3. **narrative-architecture** (master/sub-narratives, clinical coherence)

**Rationale**: Translation features will be more robust and efficient when built on mature foundation modules with clean data and rich narrative content.

**Status of Documentation**: All specifications are complete and production-ready for Phase 4 implementation.

## Overview

This folder addresses the critical need for making healthcare information accessible across language barriers and medical literacy levels using a three-layer database architecture. The system provides two orthogonal capabilities that can be combined: multi-language translation and medical complexity adjustment, ensuring every user can understand their health information regardless of their linguistic background or medical knowledge level.

## Problem Domain

Healthcare information accessibility presents unique challenges:
- International users need healthcare information in their native/desired language
- Medical terminology creates barriers for patients without medical training
- Healthcare providers require full medical detail while patients need simplified explanations
- Translation accuracy is critical for medical safety
- Premium features need proper access control and feature flagging
- Language availability depends on AI model capabilities and may expand over time

## Core Capabilities

### **1. Multi-Language Translation**
Complete healthcare profile translation supporting international users, travelers, and native language preferences using a three-layer architecture:
- **Backend Tables**: Existing clinical tables (patient_medications, patient_conditions, etc.) store source language data
- **Translation Tables**: Per-domain tables (medication_translations, condition_translations, etc.) store AI translations with confidence scores
- **Display Tables**: Per-domain UI cache (medications_display, conditions_display, etc.) for sub-5ms dashboard performance

Hybrid approach supports both planned languages (2-5 minutes background processing) and emergency translation scenarios (10-30 seconds frontend fallback).

### **2. Medical Literacy Levels**
Two-tier complexity system integrated into the translation layer, allowing users to toggle between medical jargon and patient-friendly language. Each translation table includes complexity_level columns ('medical_jargon', 'simplified') targeting 14-year-old reading comprehension for simplified versions. Healthcare providers default to medical terminology with "Patient View" toggle capability.

## Key Files Planning

### **Core Architecture Files**

#### **`multi-language-architecture.md`**
**Focus**: Three-layer database architecture for optimal translation performance
- Per-domain table architecture: backend tables (unchanged) + translation tables + display tables
- Backend tables (patient_medications, patient_conditions, etc.) remain source of truth with minimal additions
- Translation tables (medication_translations, condition_translations, etc.) store normalized translations per clinical domain
- Display tables (medications_display, conditions_display, etc.) provide lazily-populated UI cache with partitioning
- Content fingerprinting and staleness detection for efficient sync between layers
- Translation workflow: AI translation → translation tables → display table population
- Foreign language file upload: three-step process through all layers with proper deduplication
- TTL/LRU expiry mechanisms for unused translations and automatic cleanup

#### **`medical-literacy-levels.md`**
**Focus**: Complexity-aware three-layer architecture implementation
- Backend tables store medical jargon as source of truth, simplified versions in translation layer
- Per-domain translation tables include complexity_level column ('medical_jargon', 'simplified')
- Display tables support fast complexity toggling with pre-populated variants
- Query functions use display tables first with fallbacks to translation tables then backend tables
- Medical terminology simplification database with automated reading level validation
- Healthcare provider "Patient View" functionality integrated with display table lookups
- Complexity-aware dashboard queries optimized for sub-5ms performance
- Session-based complexity overrides for healthcare providers viewing patient perspectives

#### **`supported-languages-management.md`**
**Focus**: Language availability with translation table coverage monitoring
- Dynamic language availability based on AI model capabilities and translation table coverage
- Quality assessment includes translation coverage across per-domain tables (medication_translations, condition_translations, etc.)
- Display table population triggers for languages with low coverage
- Language selection triggers background translation sync queue jobs for user's clinical entities
- Three-layer fallback strategies: display tables → translation tables → backend tables → language hierarchy
- User language addition automatically queues translation jobs for existing clinical data

#### **`translation-quality-assurance.md`**
**Focus**: Per-domain confidence tracking and quality assurance
- Confidence scores integrated directly into per-domain translation tables
- Quality metrics table linking to specific translation records across domains
- Display table quality indicators for fast UI confidence display
- Error handling with per-domain table fallback chains
- Translation quality monitoring across medication_translations, condition_translations, etc.
- User feedback collection linked to specific translation table records

#### **`user-experience-flows.md`**
**Focus**: Three-layer architecture user experience optimization
- Language switching with display table existence checks and translation sync queue triggers
- Fast dashboard queries using display tables with automatic translation table fallbacks
- Emergency translation sessions with cost estimation based on backend table entity counts
- Shared profile creation with display table population for target language/complexity
- Foreign language document processing through three-layer integration workflow
- Premium subscription flows with translation coverage monitoring
- Healthcare provider patient view using display table complexity variants

### **Supporting Architecture Files**

#### **`feature-flag-integration.md`**
**Focus**: Access control and subscription tier management
- Feature flag architecture for language support (language translation only available to premium subscription tiers)
- Medical literacy features available across all subscription tiers
- Language translation paywall implementation
- Subscription upgrade prompts for language translation features
- A/B testing framework for language features

#### **`database-integration.md`**
**Focus**: Three-layer integration with existing V3 architecture
- Backend tables (patient_medications, patient_conditions, etc.) remain unchanged as source of truth
- Per-domain translation tables integrated with supersession logic and temporal data management
- Display tables enhance silver table concept with UI-optimized caching layer
- Migration strategy: add translation/display tables → populate → update application queries
- Sync queue architecture for propagating changes between layers
- Content hash-based staleness detection and automatic display table updates

#### **`business-model-integration.md`**
**Focus**: Commercial strategy and international expansion
- Freemium language support model (primary language free, additional languages premium)
- Initial 'X days' free trial to experience language translation features (all users at sign up provided with premium subscrition tier trial, enabling language translation features, but maybe only one additional language during free trial)
- International market expansion strategy using translation capabilities
- Cost analysis and pricing strategy for language support
- Target market analysis for different language communities
- Revenue projection from translation feature adoption

## System Architecture Integration

### **Upstream Dependencies**
- **`../temporal-data-management/`**: Provides deduplicated clinical data as source for translation
- **`../medical-code-resolution/`**: Supplies medical codes that may have localized equivalents

### **Downstream Consumers**
- **`../narrative-architecture/`**: Master and sub-narratives require both translation and literacy level adaptation
- **Dashboard Systems**: All user-facing clinical data presentation
- **Shared Profile Links**: International healthcare provider access

### **Cross-Cutting Concerns**
- **Feature Flag System**: Premium language support and subscription management
- **AI Processing Pipeline**: Translation integration points in Pass 2 and beyond
- **User Profile System**: Language and complexity preference storage

## Implementation Philosophy

### **Medical Safety First**
- Source of truth remains in original high-complexity medical terminology
- AI translation disclaimers for all translated content
- Clear hierarchy: original language → AI translation with warnings
- Conservative approach to medical terminology simplification

### **User-Centric Design**
- Default to patient-friendly complexity for patients, medical jargon for providers
- Instant toggling between languages and complexity levels
- 14-year-old reading level target for simplified medical explanations
- Seamless integration with existing clinical data presentation

### **Commercial Viability**
- Clear premium tier value proposition through advanced language support
- Foundation for international market expansion
- Feature flag architecture supporting freemium model
- Scalable approach to adding new languages based on AI model evolution

## Three-Layer Architecture Summary

### **Architecture Benefits**
✅ **Zero Backend Disruption**: Existing clinical tables (patient_medications, patient_conditions, etc.) unchanged  
✅ **Per-Domain Performance**: Translation tables optimized per clinical domain for better indexing  
✅ **UI Performance**: Display tables provide sub-5ms dashboard queries with lazy population  
✅ **Scalable Translation**: Content hashing and sync queues enable efficient background processing  
✅ **Clinical Safety**: Source of truth preserved in backend tables with confidence tracking throughout layers  

### **Data Flow**
```
Backend Tables (Source) → Translation Tables (AI Processing) → Display Tables (UI Cache)
     ↓                           ↓                              ↓
Source language data    Per-domain translations with      Fast lookups with
Medical jargon         confidence scores and             partitioning and
Unchanged schema       complexity levels                 TTL/LRU expiry
```

## Operational SLOs and Cost Guardrails

### **Service Level Objectives (SLOs)**

**Performance SLOs**:
- **Dashboard Query Response**: <100ms p95 for display table queries
- **Cache Hit Rate**: >95% for active users (7-day login window)
- **Cold Start Latency**: <150ms p95 when display cache miss occurs
- **Translation Queue Processing**: <2 minutes p95 for user profile translation
- **Display Table Staleness**: <30 seconds to detect backend table changes

**Availability SLOs**:
- **Translation System Availability**: 99.9% uptime (excluding planned maintenance)
- **Display Cache Availability**: 99.95% (higher than translation processing)
- **Emergency Fallback Success**: 99.99% (backend table fallback always available)
- **Human Review Queue Processing**: <24 hours for non-urgent reviews

**Accuracy SLOs**:
- **Translation Confidence**: >90% automated approval rate for medications/allergies
- **Protected Term Preservation**: 100% accuracy for dosages, medical codes, critical instructions
- **Human Review Queue**: <5% of translations require manual intervention
- **Display Cache Consistency**: <0.1% stale record rate during normal operations

### **Cost Guardrails and Budget Controls**

#### **Translation Cost Management**
```
Per-User Monthly Cost Targets:
- Free Tier Users: $0.00 (no AI translation)
- Premium Users: <$2.50 per month per additional language
- Healthcare Provider Users: <$5.00 per month (unlimited languages)
- Enterprise Users: Custom pricing based on volume

Per-Entity Translation Costs:
- Tier 1 Priority Users: $0.20 per entity (immediate processing)
- Tier 2-3 Batch Users: $0.10 per entity (batch processing)
- Long-tail Users: $0.05 per entity (background processing)
- Emergency Translations: $0.30 per entity (real-time API calls)
```

#### **Infrastructure Cost Controls**
```
Monthly Infrastructure Budget Limits:
- OpenAI API Costs: <$5,000/month (with auto-scaling limits)
- Google Cloud Vision OCR: <$1,500/month (document processing)
- Database Storage (display tables): <$2,000/month (with TTL cleanup)
- Compute (background workers): <$3,000/month (Render.com scaling)

Rate Limiting Configuration:
- Free Users: 10 AI translations per month
- Premium Users: 1,000 AI translations per month
- Healthcare Providers: 5,000 AI translations per month
- Emergency Override: 50 translations per day (all tiers)
```

#### **Resource Scaling Thresholds**
```
Auto-scaling Triggers:
- Queue Depth: Scale workers when >100 pending jobs
- API Rate Limits: Implement exponential backoff at 80% quota
- Database Connections: Alert at >70% connection pool usage
- Storage Growth: Alert when display tables >5GB total
- Cost Velocity: Alert when daily costs exceed monthly budget/20

Emergency Circuit Breakers:
- Daily Cost Limit: $500/day automatic shutdown trigger
- API Error Rate: >10% error rate triggers read-only mode
- Queue Backlog: >1,000 pending jobs triggers priority-only processing
- Database Load: >80% CPU triggers display table degradation
```

### **Infrastructure Mapping and Responsibilities**

#### **Service Architecture**
```
Component Mapping:
┌─────────────────────────────────────────────────────────────┐
│ Frontend (Vercel)                                           │
│ - Dashboard queries (display tables)                       │
│ - Language/complexity toggles                              │
│ - Emergency translation fallbacks                          │
│ - Feature flag evaluation                                  │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend API (Vercel Edge Functions)                        │
│ - Display table population triggers                        │
│ - Translation sync queue management                        │
│ - User language preference updates                         │
│ - Emergency rollback procedures                            │
│ - NO SIDE EFFECTS IN READ OPERATIONS                       │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Database (Supabase PostgreSQL)                             │
│ - Backend tables (source of truth)                         │
│ - Translation tables (per-domain)                          │
│ - Display tables (partitioned cache)                       │
│ - RLS policies (tenant isolation)                          │
│ - Queue tables (job coordination)                          │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Background Workers (Render.com)                            │
│ - Translation job processing                               │
│ - Display table population                                 │
│ - Queue cleanup and maintenance                            │
│ - Migration tier processing                                │
│ - Cost monitoring and alerting                             │
└─────────────────────────────────────────────────────────────┘
```

#### **Monitoring and Alerting**
```
Critical Alerts (PagerDuty):
- Translation system downtime >5 minutes
- Daily cost exceeds $500 threshold
- Display cache hit rate <90% for >1 hour
- Human review queue >100 pending items
- Emergency rollback activation

Warning Alerts (Slack):
- Queue processing lag >10 minutes
- Translation confidence <80% for >50 consecutive jobs
- Display table storage growth >20% week-over-week
- API rate limiting approaching 80% quota
- Cost trending >110% of monthly budget

Health Check Endpoints:
- GET /health/translation-system (overall system health)
- GET /health/cost-budget (current spend vs limits)
- GET /health/cache-performance (hit rates and latency)
- GET /health/queue-status (processing lag and depth)
```

### **Operational Principles**

#### **Core Principles**
1. **No Side Effects in DB Read Functions**: All queue management and write operations handled at API layer
2. **Backend Tables Sacred**: Existing clinical tables never modified during normal translation operations
3. **Graceful Degradation**: System always falls back to backend tables if translation layers fail
4. **Cost-Conscious Scaling**: Intelligent tier-based processing prioritizes active users
5. **Healthcare Safety First**: Protected terms, confidence thresholds, and human review for critical translations

#### **Deployment Strategy**
1. **Feature Flag Rollout**: 10% → 25% → 50% → 100% rollout with segment targeting
2. **Cost Monitoring**: Real-time cost tracking with automatic circuit breakers
3. **Performance Validation**: SLO monitoring during each rollout phase
4. **Emergency Procedures**: One-click rollback to backend-only mode available 24/7

This comprehensive operational framework ensures the health data universality system operates within defined performance, cost, and reliability parameters while maintaining healthcare safety standards.