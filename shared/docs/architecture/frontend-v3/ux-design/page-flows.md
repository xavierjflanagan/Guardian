# Page Flows - V3 Frontend Architecture

**Date:** September 5, 2025  
**Purpose:** Define core page structure and navigation flows for V3 frontend implementation  
**Based on:** Xavier's deliberations and V3 database schema capabilities  
**Status:** UX Planning Phase  

---

## Core Page Architecture

### Navigation Hierarchy
```
App Shell
├── Authentication Pages
│   ├── Landing/Signup Page
│   ├── Login Page
│   └── Logout Flow
├── Main Application
│   ├── Health Dashboard (Primary)
│   ├── Document Management
│   ├── Clinical Data Pages
│   ├── AI Assistant
│   ├── Profile & Settings
│   └── Advanced Features
```

---

## Authentication Flow Pages

### 1. Landing/Signup Page
**Route:** `/` or `/signup`  
**Purpose:** First-time user entry point with soft authentication option

**Key Features:**
- Value proposition messaging
- **Primary CTA:** "Upload your first health document"
- **Secondary CTA:** Traditional signup form
- Progressive disclosure of features

**Database Integration:**
- Creates initial `user_profiles` entry on document upload
- Triggers soft authentication workflow

### 2. Login Page  
**Route:** `/login`  
**Purpose:** Returning user authentication

**Key Features:**
- Magic link authentication (primary)
- Email input with instant link sending
- Session restoration for returning users

**Database Integration:**
- `auth.users` authentication
- `user_profiles` session restoration

---

## Core Application Pages

### 3. Health Dashboard (Primary Landing)
**Route:** `/dashboard`  
**Purpose:** Central hub showing health overview and recent activity

**Layout Sections:**
- **Health Summary Card:** Key conditions, current medications, alerts
- **Recent Activity:** Latest uploads, processing status, new extractions
- **Quick Actions:** Upload document, chat with AI, view timeline
- **Usage Analytics:** Upload limits, subscription status (if applicable)

**Database Queries:**
- `patient_clinical_events` - Recent health events
- `medications` - Current medication list
- `conditions` - Active conditions with confidence scores
- `shell_files` - Recent uploads and processing status
- `user_usage_tracking` - Usage analytics and limits

**V3 Integration:**
- Real-time job processing status via `job_queue` subscriptions
- Semantic clinical narratives from AI processing pipeline
- Confidence scoring display for all extracted data

### 4. Document Upload Page
**Route:** `/upload`  
**Purpose:** File upload interface with processing visualization

**Key Features:**
- Drag & drop interface with file preview
- **Real-time Processing Status:** Connected to Render.com workers
- Batch upload capability for multiple documents
- Processing history and retry options

**Processing Flow:**
1. File upload → Supabase Storage
2. Trigger `shell-file-processor-v3` Edge Function
3. Job queue coordination with Render.com workers
4. Real-time status updates via WebSocket/polling
5. Processing completion → automatic dashboard redirect

**Database Integration:**
- `shell_files` - Document metadata and processing status
- `job_queue` - Worker coordination and status tracking
- `patient_clinical_events` - Populated by AI processing results

### 5. Document Library Page
**Route:** `/documents`  
**Purpose:** Comprehensive document management interface

**Features:**
- **List View:** Sortable/filterable document table
- **Individual Document View:** Click-through to see document pages
- **Processing Status:** Clear indicators for upload/processing/completed states
- **Export Capabilities:** Download originals or processed data
- **Batch Operations:** Delete, reprocess, export multiple documents

**Database Queries:**
- `shell_files` - All user documents with metadata
- `patient_clinical_events` - Extracted data linked to each document
- `processing_audit_logs` - Processing history and error logs

---

## Clinical Data Pages

### 6. Health Timeline Page
**Route:** `/timeline`  
**Purpose:** Chronological view of health events with semantic narratives

**Features:**
- **Interactive Timeline:** Time-ordered health events
- **Clinical Narratives:** AI-generated stories connecting health events
- **Filtering Options:** By date range, event type, confidence level
- **Future Events:** Upcoming appointments, medication schedules

**Database Integration:**
- `patient_clinical_events` - All timestamped health events
- `clinical_narratives` - AI-generated contextual stories
- `appointments` - Past and future healthcare encounters

**V3 Semantic Architecture:**
- Russian Babushka Doll data layering
- Cross-referenced medication interactions
- Condition progression tracking

### 7. Medications Page
**Route:** `/medications`  
**Purpose:** Comprehensive medication management

**Features:**
- **Current Medications:** Active prescriptions with dosages
- **Medication History:** Start/stop dates, dosage changes
- **Interaction Warnings:** AI-powered drug interaction alerts
- **Adherence Tracking:** Manual logging capability

**Database Queries:**
- `medications` - Current and historical medication data
- `medication_interactions` - AI-detected interaction warnings
- `patient_clinical_events` - Medication-related events

### 8. Conditions Page
**Route:** `/conditions`  
**Purpose:** Health conditions management and tracking

**Features:**
- **Active Conditions:** Current diagnoses with management status
- **Condition Timeline:** Progression tracking over time
- **Related Information:** Connected medications, appointments, tests
- **Severity Indicators:** AI-assessed condition severity levels

**Database Queries:**
- `conditions` - All diagnosed conditions
- `condition_progressions` - Timeline of condition changes
- `patient_clinical_events` - Condition-related health events

### 9. Individual Clinical Section Pages
**Routes:** `/allergies`, `/immunizations`, `/surgeries`, `/lab-results`, `/imaging`, `/vitals`  
**Purpose:** Specialized views for each clinical data category

**Common Features:**
- **Section-specific Data Display:** Optimized for data type
- **Confidence Scoring:** Visual indicators for AI extraction confidence
- **Manual Entry Options:** User-added data capabilities
- **Export Functions:** Section-specific data export

---

## AI Assistant Page

### 10. AI Chat Interface
**Route:** `/assistant`  
**Purpose:** Dual-mode AI assistant for health questions and app navigation

**Two Chat Modes:**

**Health Assistant Mode:**
- **Context-Aware Responses:** AI has access to complete user health profile
- **Medical Guidance:** "Dr Google" with personalized context
- **Symptom Analysis:** Intelligent triage based on user's conditions
- **Medication Questions:** Interaction warnings, side effects, timing

**App Assistant Mode (CLI-style):**
- **Navigation Help:** "Show me my recent lab results"
- **Task Automation:** "Schedule a reminder to take my medication"
- **Data Management:** "Add a manual entry for my blood pressure"
- **Feature Discovery:** "How do I share my profile with my doctor?"

**Database Integration:**
- Complete access to user's clinical profile for personalized responses
- `chat_history` - Conversation persistence and context
- `ai_insights` - Stored AI analysis and recommendations

---

## Settings & Profile Management

### 11. App Settings Page
**Route:** `/settings`  
**Purpose:** Comprehensive user preference and account management

**Settings Sections:**
- **Personal Information:** Profile details, emergency contacts
- **Privacy & Sharing:** Data sharing preferences, access controls
- **Usage Analytics:** Data usage dashboard, subscription management
- **Notifications:** Email, push notification preferences
- **Security:** Password, 2FA, session management
- **Data Export:** Complete health data export options

**Database Integration:**
- `user_profiles` - Personal information management
- `user_usage_tracking` - Usage analytics and limits
- `subscription_plans` - Billing and subscription status
- `privacy_settings` - Data sharing and access preferences

### 12. Profile Sharing Page
**Route:** `/sharing`  
**Purpose:** External access control and emergency sharing

**Key Features:**
- **Quick Share Codes:** Generate temporary access codes for doctors
- **Emergency Access:** Configure emergency contacts with automatic access
- **Sharing History:** Audit trail of who accessed what data when
- **Permission Controls:** Granular control over shared data sections

**Use Cases:**
- Doctor appointment: Quick code generation for clinical data sharing
- Emergency situations: Automatic access for designated emergency contacts
- Family sharing: Ongoing access for family members or caregivers

---

## Advanced Feature Pages

### 13. Health Email Inbox
**Route:** `/email-inbox`  
**Purpose:** Process health-related emails through AI extraction

**Features:**
- **Email Processing Status:** Track forwarded emails through AI analysis
- **Extracted Data Preview:** Review AI-extracted information before integration
- **Integration Options:** Choose which extracted data to add to profile
- **Email Archive:** History of processed health emails

### 14. Provider Directory
**Route:** `/providers`  
**Purpose:** Healthcare provider discovery and booking

**Features:**
- **Provider Search:** Filter by specialty, location, Exora integration
- **Provider Profiles:** Reviews, ratings, Exora compatibility indicators
- **Booking Interface:** Schedule appointments with integrated providers
- **Data Sharing:** Automatic pre-visit data sharing configuration

### 15. Appointments Management
**Route:** `/appointments`  
**Purpose:** Comprehensive appointment tracking and management

**Features:**
- **Upcoming Appointments:** Calendar view with preparation reminders
- **Appointment History:** Past visits with extracted follow-up data
- **Preparation Tools:** Auto-generate relevant health summaries for providers
- **Follow-up Integration:** Receive and process post-visit documentation

---

## Page Flow Integration Patterns

### Cross-Page Data Flow
1. **Document Upload** → **Processing Visualization** → **Dashboard Update** → **Clinical Section Population**
2. **AI Assistant Query** → **Profile Data Access** → **Personalized Response** → **Action Suggestions**
3. **Timeline View** → **Individual Event Details** → **Related Document Access** → **Manual Validation Options**

### Real-Time Update Patterns
- **Job Processing Status:** Live updates across upload, dashboard, and document library pages
- **AI Insights:** New clinical narratives appear in timeline and dashboard
- **Data Validation:** Confidence score updates reflect across all pages showing the data

### Mobile Navigation Considerations
- **Bottom Tab Navigation:** Primary pages accessible via persistent tab bar
- **Swipe Gestures:** Quick navigation between related clinical sections
- **Voice Input:** AI assistant accessible via voice commands from any page

---

This page flow architecture provides the foundation for detailed wireframe creation and technical implementation, ensuring seamless user experience while leveraging V3's advanced AI processing and semantic clinical architecture.