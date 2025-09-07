# Guardian Frontend V3 Architecture

**Date:** September 4, 2025  
**Purpose:** V3-specific frontend architecture building on V2 foundation with backend integration  
**Status:** Initial Design - Crash Recovery Document  
**Foundation:** Built upon [frontend-v2/](../frontend-v2/) production-ready architecture  

---

## Executive Summary

**Frontend V3 Architecture** extends the excellent V2 foundation with V3 backend integration, semantic clinical UX, real-time worker processing, and mobile-first preparation.

**Core V3 Differentiators:**
- **V3 Backend Integration:** Operational Supabase + Render.com infrastructure
- **Semantic Clinical UX:** Russian Babushka Doll data layering with clinical narratives
- **Real-time Processing UI:** Live worker job status and AI processing visualization
- **Usage Analytics Dashboard:** Subscription management and usage tracking interface
- **Mobile-First Components:** Camera integration, offline capabilities, React Native prep

---

## Frontend V3 Architecture Overview

### **Foundation: Leveraging V2 Excellence**

**Inherited from V2 (Production-Ready):**
- ✅ Unified Provider composition (Auth → Profile → Privacy → QueryClient → Notification)
- ✅ Standardized component APIs with profile scoping and capability detection
- ✅ TanStack Query integration with healthcare-optimized defaults
- ✅ Real-time Supabase subscriptions and event logging infrastructure
- ✅ Performance optimization (virtual scrolling, bundle analysis, Lighthouse CI)
- ✅ 4-tab layout foundation (Dashboard, Documents, Timeline, Insights)

### **V3 Enhancements: Backend Integration & Semantic UX**

**New V3 Integration Points:**
```typescript
// V3 Backend Integration
- V3 Database Schema (50 tables with semantic architecture)
- Render.com Worker Status (real-time job processing updates)  
- Usage Analytics APIs (subscription management and usage tracking)
- Clinical Narrative System (semantic medical data with storytelling UX)
- Mobile-Optimized Components (camera, offline, push notifications)
```

---

## Directory Structure

```
frontend-v3/
├── README.md                          # This file - V3 architecture overview
├── integration/                       # V3 Backend Integration Specifications
│   ├── semantic-architecture-ux.md    # Clinical narrative UX patterns
│   ├── realtime-job-status.md        # Render worker status integration
│   ├── usage-analytics-ui.md         # Usage tracking dashboard components  
│   └── v3-data-queries.md            # V3 schema query patterns and hooks
├── implementation/                    # V3-Specific Implementation Phases
│   ├── phase-1-v3-integration.md     # V3 backend integration and data layer
│   ├── phase-2-semantic-ux.md        # Rich clinical narrative UX implementation
│   ├── phase-3-mobile-prep.md        # Mobile app preparation and optimization
│   └── phase-4-ai-pipeline-ui.md     # AI processing visualization and status
├── components/                       # V3-Enhanced Component Specifications
│   ├── clinical-narratives/          # Semantic UX components (medication stories, condition timelines)
│   ├── job-processing/               # Worker status components (real-time processing UI)
│   ├── usage-analytics/              # Analytics UI components (dashboards, usage tracking)
│   └── mobile-optimized/             # Mobile-first components (camera, offline, responsive)
├── mobile/                           # Mobile App Architecture Planning
│   ├── react-native-architecture.md  # React Native implementation strategy
│   ├── camera-integration.md         # Document capture and photo upload
│   └── offline-capabilities.md       # Cached clinical data and offline functionality
└── migration/                        # V2 to V3 Transition Strategy
    ├── component-migration-guide.md  # Upgrading V2 components for V3 integration
    ├── data-layer-updates.md         # V2 → V3 database integration changes
    └── testing-strategy.md           # V3 testing approach and validation
```

---

## V3 Core Features & Components

### **1. Semantic Clinical UX (NEW)**
**Reference:** [SEMANTIC_ARCHITECTURE_UX_EXAMPLES.md](../database-foundation-v3/SEMANTIC_ARCHITECTURE_UX_EXAMPLES.md)

**Clinical Narrative Components:**
- **Medication Stories:** Click "Metformin 500mg" → popup with prescription context, treating condition, therapeutic outcome
- **Condition Timelines:** Interactive diagnosis journey with discovery circumstances and clinical impact  
- **Cross-Referenced Data:** Smart connections showing relationships between conditions, medications, and treatments
- **Russian Babushka Doll Layering:** Timeline event → clinical event → detailed data → specialized context

### **2. Real-time Job Processing UI (NEW)**
**Integration:** Render.com worker status via V3 job_queue table

**Processing Status Components:**
- **Live Upload Status:** Real-time file upload progress with storage confirmation
- **AI Processing Visualization:** "Analyzing document..." → "Extracting medical data..." → "Generating clinical timeline..." → "Complete"
- **Worker Health Monitoring:** Connection status to Render.com workers with retry mechanisms
- **Error Recovery UI:** User-friendly display of processing failures with retry options

### **3. Usage Analytics Dashboard (NEW)**
**Integration:** V3 usage tracking tables and subscription management

**Analytics Components:**
- **Usage Metrics Display:** Files uploaded, AI tokens used, storage utilization per billing cycle
- **Subscription Management:** Plan comparison, upgrade prompts, usage limit warnings
- **Family Analytics:** Multi-profile usage tracking and plan allocation
- **Billing Integration Prep:** Ready for future subscription billing features

### **4. V3 Data Integration Layer (ENHANCED)**
**Database:** V3 50-table schema with semantic architecture

**Enhanced Data Hooks:**
```typescript
// V3-Specific Hooks
useV3ClinicalTimeline()    // Semantic timeline with narrative linking
useJobProcessingStatus()   // Real-time worker job status
useUsageAnalytics()        // Subscription and usage tracking
useSemanticSearch()        // AI-powered clinical data search
useClinicalNarratives()    // Medication/condition storytelling data
```

---

## Implementation Strategy

### **Phase 1: V3 Backend Integration (Weeks 1-2)**
- ✅ V3 database query patterns and data hooks
- ✅ Render.com worker status integration
- ✅ Usage analytics API connections
- ✅ Real-time job processing subscriptions

### **Phase 2: Semantic Clinical UX (Weeks 3-4)**  
- ✅ Clinical narrative popup components
- ✅ Interactive medical timeline with storytelling
- ✅ Cross-referenced data visualization
- ✅ Medication/condition detail modals

### **Phase 3: Mobile-First Optimization (Weeks 5-6)**
- ✅ Responsive component enhancements for mobile  
- ✅ Camera integration preparation
- ✅ Offline data caching strategies
- ✅ React Native architecture planning

### **Phase 4: AI Pipeline UI Integration (Weeks 7-8)**
- ✅ Complete AI processing visualization
- ✅ Advanced semantic search interfaces  
- ✅ Clinical intelligence dashboards
- ✅ Production readiness and optimization

---

## Mobile App Strategy

### **React Native Architecture**
**Approach:** Shared backend, mobile-optimized UI with native capabilities

**Key Mobile Features:**
- **Camera Integration:** Direct document capture from phone camera
- **Photo Library Access:** Batch upload from phone photos  
- **Offline Clinical Data:** Cached medical information for offline viewing
- **Push Notifications:** Processing completion, medication reminders
- **Email Integration:** Email inbox scanning per [patient-communications](../patient-communications/) architecture

### **Mobile-First Components**
- **Touch-Optimized Navigation:** Large touch targets, swipe gestures
- **Camera Capture UI:** Document scanning with edge detection
- **Offline Sync Indicators:** Data freshness and sync status
- **Native Notifications:** Integration with platform notification systems

---

## Integration with AI Processing Pipeline

### **Coordination with AI Pipeline Development**
**Reference:** [AI Processing V3](../ai-processing-v3/) and [V3 Phase 3 Planning](../database-foundation-v3/v3-phase3-frontend-integration-planning.md)

**Frontend Requirements for AI Pipeline:**
- **Job Status Display:** Real-time processing progress from Render.com workers
- **Confidence Scoring UI:** Display AI extraction confidence levels  
- **Error Handling:** User-friendly display of AI processing failures
- **Manual Review Interface:** Allow users to validate/correct AI extractions

**AI Pipeline Requirements for Frontend:**
- **Structured Progress Updates:** Consistent job status format for UI consumption
- **Error Message Standardization:** User-friendly error messages from worker failures
- **Confidence Metadata:** Structured confidence data for UI display
- **Processing Time Estimates:** User expectation management for long-running jobs

---

## Testing Strategy

### **V3-Specific Testing Approach**
**Foundation:** Build upon V2 Jest + React Testing Library framework

**V3 Testing Additions:**
- **Real-time Integration Tests:** Supabase subscriptions and worker status updates
- **Semantic UX Tests:** Clinical narrative linking and popup functionality  
- **Mobile Responsive Tests:** Cross-device compatibility and touch interactions
- **Usage Analytics Tests:** Subscription management and usage tracking accuracy
- **Performance Tests:** V3 query performance and real-time update efficiency

---

## Success Metrics

### **V3 Frontend Achievement Targets**

**User Experience:**
- ✅ Rich clinical data visualization with semantic storytelling  
- ✅ Real-time processing feedback with < 2-second status updates
- ✅ Mobile-responsive design ready for React Native transition
- ✅ Usage analytics providing clear subscription management

**Technical Performance:**
- ✅ V3 query performance < 300ms for timeline display  
- ✅ Real-time updates < 2-second latency from worker completion
- ✅ Bundle size optimized for mobile performance
- ✅ Accessibility compliance (WCAG 2.1 AA) maintained

**Platform Readiness:**
- ✅ React Native architecture ready for mobile development
- ✅ Component APIs support semantic clinical UX expansion
- ✅ AI processing pipeline integration complete  
- ✅ Production deployment ready with V3 backend operational

---

## Next Steps

### **Immediate Development Priorities**
1. **Create detailed integration specifications** in `integration/` folder
2. **Design V3-specific component patterns** in `components/` folder  
3. **Plan React Native architecture** in `mobile/` folder
4. **Update V3 Phase 3 planning doc** with frontend architecture references

### **Development Coordination**
- **Frontend V3 Development:** Can proceed with mock data while AI pipeline completes
- **Backend Integration:** V3 infrastructure operational and ready for frontend connection
- **Mobile Planning:** Parallel React Native architecture design
- **Testing Strategy:** Enhanced testing framework for V3 features

---

**This Frontend V3 Architecture provides the foundation for rich clinical UX experiences while maintaining the excellent V2 production patterns and preparing for mobile-first healthcare management.**




**Xaviers deliberations 5th Sep 2025**
Deliberation point 1: The frontend-v3/readme.md file doesnt really convey what the overall high level UX is when they open their app and use the app. 
This is fine for now i guess and maybe the readme shouldnt contain this kind of information, but it makes me wonder where it is that this high level planning/vision/design should be located and worked on?  - Whats your suggestion for a) where/how it should all be located and worked on? and b) what it should look like and contain in a broad high level sense for both engineers (file content, explanation) and users (UX)? 

Deliberation point 2: My initial thoughts are; 
- signup page (soft signup and soft authentication initially), sign in page and log out page etc, 
    - soft and hard authentication identification verfiication progressive system (this is documented somewhere in the codebase, maybe in old v1 or v2 sub folders)
- file upload page. 
    - Maybe not for the MVP product but the the file upload page is one of the first pages that arguably could appear in place of the signup page to allow for extraction of personal details to facilatiate and speed up sign up process 
    - See this old v2 file: shared/docs/architecture/database-foundation-v2/core/multi-profile.md : 
        - Lines 61-79: Describes the "Soft Authentication" system. 
        - Key concept: Users can simply upload their first healthcare document, and if it contains patient personal details, the system will auto-populate their profile
        - Process: Document uploaded → AI extracts patient details (name, DOB, address, etc.). User confirms extracted details belong to them. Profile automatically created/updated with extracted data. Confidence score calculated based on data completeness
    - For more potential info, here is another old v2 file that is outdate but could have some useful or inspiring material: shared/docs/architecture/ai-processing-v2/06-technical-specifications/database-bridge/ai-profile-classification.md and here is another: File: shared/docs/architecture/database-foundation-v2/implementation/sql/003_multi_profile_management.sql 
    - proposed v2 WORKFLOW SUMMARY:
            User uploads first healthcare document
            AI processes document and extracts: Patient name, Date of birth, Contact information, Medical context
            System prompts user to confirm extracted details belong to them
            Profile automatically created/updated with extracted data
            Confidence score calculated based on data completeness
            User gains access to basic healthcare data management features
- page for viewing uploaded files (file library, in lists, but also with the the capability to click through and see individual uploaded files and flick through thier pages), 
- a page for viewing the user's actual summarized health info (main app dashboard, containing summaries and lists of all big hitting health points; i.e., speciality table data from the v3 schema system like conditions, medications, surgeries, allergies etc), 
- a page for timeline of events (healthcare journey timeline, all time-tagged past appointments, medication start/stop/change, new diagnoses, illnesses start/stop, healthcare encounters, etc). May also include future appointments, but not sure how this would look from a UX pov. 
- Individual pages for all sub sections (conditions tab, medications tab, allergies, immunizaations, past surgeries (maybe a subset of past interventions), past imaging reports, lab results, vitals etc), 
- a page for clinical narrative feature (semantic core feature), 
- a page for app settings etc (which i assume would include all the usage data stuff, billing and subscription stuff, admin data, personal details data, emergency contact data, user permissions toggle/adding page),
- a page for the 'health email inbox' feature, 
- a page for sharing profile 
    - for when doctor is quickly asking for your health info and you provide them with login code/link 
    - for exporting all previously uploaded health files (capability for this also present in file uplaod libary), 
    - For controlling and toggling access permissions and emergency contact etc 
    - i.e., this is the page for controlling one of the key aspects of the app which is user controlled external access/visiability to the outside world,
- a page for appointments / appointments timeline (upcoming and past), 
- a page for viewing, searching, and reviewing doctor profiles - 'Exora provider profiles'.
    - with eventual/future capability for a provider booking page for finding and reading about and booking GPs (and for finding any health provider/store such as pharmacies, imaging, path labs etc).
    - 'Exora provider profiles' for each doctor, containing user/patient reviews and ratings, whether theyre an active exora positive member contributer etc and will send data (the data they currently have about you, or at least the appointment report back to your exora profile)


Deliberation point 3: AND importantly something i havent mentioned or highlighted enough is one of the core features of the app which will be the in-app AI chat which will in serve multiple purposes; the main one being a 'Dr Google' for all users where they get an health specific ai chat that answers all their ehalth related question BUT with the huge benefit of that AI having constant access to their entire health profile, so every response is tailored and calibrated to the user (this will  hopefully help add 'stickiness' and increase 'user retention' for the app). The second big role for the in-app ai chat bot will be kind of like a command line interface CLI type role where any question you have thats more logistical or administrative about the app it can help you and perform actions for you on your behalf (such as general help service instructing you where and how to change your phone number for example, or suggesting and then helping you find a local GP appointment, or helping you to find the cheapest medication for that which is on your new script)

Deliberation point 4: I have always had an idea that along with ai extraction confidence values there could be another type of data metad-data labelling that helps quickly identify the quality of the source of the data. For example, if an uploaded file has a doctors header/footer or signature (isa  legit document) then all extracted data from that file gets highest source quality rating label, But if a file is uploaded that just is a handwritten list of medications on blank piece of paper it gets the lowest source quality rating etc. This source quality rating system idea would obviously need to be designed from the ground up (and maybe theres already systems like this available that we could learn and take from online). Also, there could be a tier rating for data that is updated/"validated" by the user in the app (lower tier), and a tier for data that is updated by a doctor in the app (hihgest tier). This is all off-the-cuff word vomit for now but the generla idea is there and something i would like to tease out much more. 



Confidence Scoring UI Vision:

  Per-data-piece granular display - confidence scores appear next to individual extracted medical data elements throughout the
  clinical timeline and dashboard UI.

  Implementation Pattern:
  // Clinical data display with confidence indicators
  <MedicationEntry>
    <MedicationName>Metformin 500mg</MedicationName>
    <ConfidenceIndicator score={0.95} /> {/* Green dot/badge */}
    <StartDate>
      2023-01-15 <ConfidenceIndicator score={0.73} /> {/* Yellow indicator */}
    </StartDate>
  </MedicationEntry>

  Visual Strategy:
  - High confidence (90%+): No visual indicator (trusted data)
  - Medium confidence (70-89%): Subtle yellow dot/badge
  - Low confidence (<70%): Orange warning indicator + review prompt

  Manual Review Interface:

  Contextual inline editing - users can click any flagged data element to validate/correct it directly within the clinical
  timeline.

  UX Flow:
  1. User sees yellow/orange confidence indicator on extracted data
  2. Clicks indicator → inline edit modal opens
  3. Shows: Original document snippet + AI extraction + correction field
  4. User validates/corrects → confidence updates to 100% (human-verified)