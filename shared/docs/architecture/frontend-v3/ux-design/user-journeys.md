# User Journeys - V3 Frontend Experience

**Date:** September 5, 2025  
**Purpose:** Define core user experience flows for V3 frontend implementation  
**Based on:** Xavier's deliberations from frontend-v3/README.md  
**Status:** UX Planning Phase  

---

## Core User Personas

### Primary Persona: Health-Conscious Individual
- **Need:** Centralized health record management with AI insights
- **Pain Points:** Scattered medical records, difficulty tracking health patterns
- **Goals:** Easy document upload, clear health summaries, personalized health guidance

---

## Primary User Journeys

### 1. First-Time User Onboarding (Soft Authentication)

**Journey:** Document upload → Profile auto-creation → Health dashboard access

**Steps:**
1. **Landing Page:** User arrives, sees value proposition
2. **Upload Prompt:** "Upload your first health document to get started"
3. **Document Processing:** AI extracts patient details (name, DOB, contact info)
4. **Profile Confirmation:** "Is this information about you?" with extracted data preview
5. **Auto-Profile Creation:** Profile created with extracted data + confidence scores
6. **Welcome Dashboard:** Immediate access to basic health management features

**Key Benefits:**
- Zero-friction onboarding
- Immediate value demonstration
- Profile auto-population from real health data

---

### 2. Document Upload & Processing Flow

**Journey:** File selection → Upload → AI processing → Health data integration

**Steps:**
1. **File Selection:** Drag & drop or file picker interface
2. **Upload Progress:** Real-time upload status with progress bar
3. **AI Processing Status Visualization:** Live status updates from Render.com workers
   - "Analyzing document structure..."
   - "Extracting medical information..."
   - "Integrating with your health profile..."
4. **Processing Results:** Summary of extracted data with confidence indicators
5. **Manual Review Prompts:** Flag low-confidence extractions for user validation
6. **Profile Integration:** New data appears in relevant dashboard sections

**Technical Integration Points:**
- `shell-file-processor-v3` Edge Function coordination
- Real-time job status via `job_queue` subscriptions
- V3 database population with confidence scoring

---

### 3. Health Dashboard Navigation

**Journey:** Dashboard overview → Detailed sections → Individual data management

**Core Navigation Flow:**
1. **Main Dashboard:** Health summary with key metrics and recent activity
2. **Section Deep-Dive:** Click medications → Medications page with full list
3. **Individual Entry:** Click specific medication → Detailed view with timeline
4. **Data Management:** Edit, validate, or add manual entries

**Dashboard Sections:**
- **Health Summary:** Key conditions, current medications, recent activity
- **Clinical Timeline:** Chronological health events with semantic narratives
- **Document Library:** Uploaded files with processing status
- **Usage Analytics:** Upload limits, processing status, subscription info

---

### 4. AI Health Assistant Interaction

**Journey:** Health question → AI chat → Personalized response with health context

**Two Assistant Modes:**

**Role A: Health Assistant ("Dr Google" with Personal Context):**
1. **Question Input:** "Should I be concerned about this new symptom?"
2. **Context Analysis:** AI accesses user's complete clinical profile
3. **Personalized Response:** Tailored advice considering user's conditions/medications
4. **Follow-up Actions:** Suggest logging symptom, scheduling appointment, etc.

**Role B: App Assistant (CLI-style Navigation):**
1. **Task Request:** "Help me find a local GP appointment"
2. **Guided Workflow:** AI walks through appointment booking process
3. **Action Execution:** Performs app functions on user's behalf
4. **Confirmation:** "Appointment request sent, added to your calendar"

---

### 5. Clinical Data Interaction & Validation

**Journey:** View extracted data → Notice confidence indicator → Manual validation → Profile update

**Steps:**
1. **Data Discovery:** User sees medication with yellow confidence indicator (73%)
2. **Interaction:** Clicks confidence indicator to open validation modal
3. **Source Review:** Modal shows original document snippet + AI extraction
4. **Validation/Correction:** User confirms or corrects extracted information
5. **Profile Update:** Confidence updates to 100% (human-verified)
6. **Quality Improvement:** Validated data improves future AI extractions

**Visual Design Pattern:**
- High confidence (90%+): No visual indicator (clean interface)
- Medium confidence (70-89%): Subtle yellow dot/badge
- Low confidence (<70%): Orange warning with review prompt

---

## Advanced User Journeys

### 6. Health Sharing & Emergency Access

**Journey:** Configure sharing → Generate access codes → External party access

**Steps:**
1. **Sharing Setup:** Define what health information to share
2. **Access Control:** Set permissions (view-only, specific sections, time limits)
3. **Code Generation:** Create secure sharing codes/links
4. **External Access:** Doctor/family member accesses via provided code
5. **Audit Trail:** User sees access logs and shared information history

### 7. Provider Integration & Appointment Management

**Journey:** Find provider → Book appointment → Receive follow-up data

**Steps:**
1. **Provider Search:** Browse "Exora provider profiles" with ratings/reviews
2. **Booking Interface:** Schedule appointment with Exora-integrated providers
3. **Pre-Visit Sharing:** Automatically share relevant health data with provider
4. **Post-Visit Integration:** Receive appointment notes back into Exora profile
5. **Continuous Care:** Provider updates feed into user's clinical timeline

### 8. Health Email Inbox Processing

**Journey:** Receive health email → Forward to Exora → AI processing → Profile integration

**Steps:**
1. **Email Forwarding:** User forwards health-related email to Exora address
2. **AI Classification:** System identifies document type and relevance
3. **Data Extraction:** Extract appointment details, test results, etc.
4. **Profile Integration:** Information appears in appropriate dashboard sections
5. **Timeline Updates:** New events added to clinical timeline

---

## Mobile-First Considerations

### Camera-First Document Capture
- **Instant Processing:** Photograph document → immediate AI analysis
- **Guided Capture:** Frame guides for optimal document scanning
- **Batch Processing:** Multiple document pages in single session

### Offline Capabilities
- **Cached Data:** Essential health information available offline
- **Sync Resume:** Automatic sync when connection restored
- **Emergency Access:** Critical health data always accessible

---

## Technical Implementation Notes

### State Management Requirements
- **Real-time Updates:** Job processing status, confidence scores
- **Optimistic Updates:** Immediate UI feedback for user actions
- **Data Synchronization:** Keep dashboard in sync with database changes

### Performance Considerations
- **Progressive Loading:** Load dashboard sections as user navigates
- **Image Optimization:** Efficient document preview and thumbnail generation
- **Background Processing:** Non-blocking AI analysis with status updates

### Accessibility Requirements
- **Screen Reader Support:** Full accessibility for vision-impaired users
- **Keyboard Navigation:** Complete app functionality without mouse
- **High Contrast Mode:** Support for users with visual difficulties

---

This document provides the foundation for detailed wireframes and technical implementation specifications, focusing on user-centered design principles while leveraging V3's advanced AI and semantic architecture capabilities.