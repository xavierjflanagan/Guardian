# Guardian Frontend Architecture v7

**Status:** Production Implementation Ready  
**Date:** 2025-08-07  
**Framework:** Next.js 15+ with React 19  
**Database Foundation:** ✅ Complete (47 tables, 917 functions)  
**Implementation Timeline:** 8 weeks to "Most Valuable Product"

---

## Executive Summary

This document defines the unified frontend architecture for Guardian v7, incorporating best-practice refinements from collaborative review across multiple AI systems (GPT-5, Gemini, Claude). The result: a production-ready implementation strategy that balances platform vision with pragmatic Next.js execution.

**Core Principle:** Think platform, build pragmatic, deliver excellence.

### Core Technical Principles (Unified Plan)

1. **Unified Provider Composition:** Single `<Providers>` wrapper in `app/providers.tsx` composing context hierarchy (Auth → Profile → Privacy → QueryClient → Notification) for clean, performant state management
2. **Standardized Data Fetching:** TanStack Query as global standard with healthcare-optimized defaults (5min staleTime, 30min gcTime, enhanced retry logic)
3. **Pragmatic Real-time Strategy:** Real-time updates for document processing status initially; timeline and other data fetch-first with robust caching
4. **Formalized Event Logging:** Strict `user_events` schema with PII redaction, privacy-preserving hashes, and no-PII enforcement
5. **Strict Profile Scoping:** All hooks remain profile-scoped while internally resolving appropriate patient_id(s) for clinical data queries, ensuring proper access control and data isolation
6. **Automated Quality Gates:** Lighthouse CI and bundle analysis integrated into deployment pipeline enforcing performance and accessibility standards

### Key Architectural Decisions

- **Foundation:** Standard Next.js/React patterns with industry-best-practice tooling
- **Approach:** "Most Valuable Product" with production-grade quality gates
- **Privacy:** Built-in from day one, with zero-knowledge upgrade path
- **Multi-Profile:** Family healthcare management as core architecture
- **Extensibility:** Component APIs designed for platform evolution
- **Quality:** Performance budgets and accessibility compliance as CI requirements

---

## The Four-Phase Implementation Blueprint

### Phase 1: Foundation & Shell (Weeks 1-2)
**Status:** Next Priority ⚡

#### Pragmatic Implementation
```
├── Application Shell
│   ├── Next.js 15+ App Router
│   ├── Tailwind CSS responsive design
│   ├── Tab-based navigation system
│   └── Profile switcher component
│
├── Supabase Integration
│   ├── Client configuration
│   ├── Real-time subscriptions setup
│   ├── RLS policy integration
│   └── Existing 47 tables connected
│
└── Core Layout Structure
    ├── Persistent sidebar/header
    ├── Main content area (tab container)
    ├── Profile context display
    └── Notification system
```

#### Strategic Enhancement: Unified Provider Architecture
```tsx
// Single Providers wrapper - production-ready composition
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>              // Authentication state management
      <ProfileProvider>         // Multi-profile family management
        <PrivacyProvider>       // Zero-knowledge upgrade path  
          <QueryClientProvider client={queryClient}> // TanStack Query
            <NotificationProvider> // Real-time updates
              {children}
            </NotificationProvider>
          </QueryClientProvider>
        </PrivacyProvider>
      </ProfileProvider>
    </AuthProvider>
  );
}

// Usage in app/layout.tsx
<Providers>
  <Shell>
    {children}
  </Shell>
</Providers>
```

**Week 1 Deliverables:**
- [ ] Single Providers wrapper with unified composition
- [ ] TanStack Query configured with healthcare defaults
- [ ] Next.js shell with tab navigation
- [ ] Profile switcher (multi-profile ready)
- [ ] Basic responsive layout

**Week 2 Deliverables:**
- [ ] Real-time subscriptions (documents table only)
- [ ] user_events table schema and logUserEvent function
- [ ] CI pipeline with Lighthouse and bundle analysis
- [ ] Error boundaries and fallbacks
- [ ] Performance budget enforcement

### Phase 2: Component Library with Platform DNA (Weeks 3-4)

#### Component Standardization Pattern
```typescript
interface GuardianComponentProps {
  profileId: string;
  context: {
    user: User;
    permissions: Permission[];
    auditLog: boolean;
    encryptionLevel: 'standard' | 'enhanced' | 'zero-knowledge';
  };
  capabilities: Capability[];
  dateRange?: DateRange;
  onEvent?: (event: UserEvent) => void;
}

// Every component follows this standardized interface
<MedicationList
  profileId={currentProfile.id}
  context={securityContext}
  capabilities={['read', 'edit', 'request_refill']}
  dateRange={selectedRange}
  onEvent={logUserEvent}
/>
```

#### Core Component Library
```
├── Data Display Components
│   ├── <HealthTimeline />      - Virtual scrolling timeline
│   ├── <MedicationList />      - Current medications with sources
│   ├── <AllergyPanel />        - Critical allergy information
│   ├── <ConditionsHistory />   - Medical conditions over time
│   ├── <LabResultsChart />     - Trending lab values
│   └── <VitalSigns />          - Current vital signs display
│
├── Input & Processing Components
│   ├── <DocumentUploader />    - Drag-drop + camera capability
│   ├── <ProcessingStatus />    - Real-time job queue updates
│   ├── <DocumentViewer />      - Source document examination
│   └── <DataVerification />    - User confidence validation
│
├── Profile & Family Components
│   ├── <ProfileSwitcher />     - Family member navigation
│   ├── <ProfileManager />      - Add/edit family profiles
│   ├── <PermissionControl />   - Granular access management
│   └── <RelationshipMap />     - Family healthcare connections
│
├── Intelligence & Insights
│   ├── <HealthInsights />      - AI-powered health analysis
│   ├── <CareGapDetector />     - Missing healthcare activities
│   ├── <TrendAnalyzer />       - Long-term health patterns
│   └── <RiskAssessment />      - Predictive health indicators
│
└── System & Utility Components
    ├── <PrivacyIndicator />    - Current data protection level
    ├── <ConfidenceScore />     - AI extraction confidence
    ├── <SourceTracker />       - Document origin linking
    └── <AuditTrail />          - Activity history display
```

**Week 3 Deliverables:**
- [ ] Core data display components
- [ ] Document processing components
- [ ] Component testing framework
- [ ] Storybook component documentation
- [ ] TypeScript interface definitions

**Week 4 Deliverables:**
- [ ] Profile and family components
- [ ] Intelligence components foundation
- [ ] System utility components
- [ ] Component integration testing
- [ ] Performance optimization

### Phase 3: Feature Assembly & Integration (Weeks 5-6)

#### Tab Implementation: Value → Trust → Narrative → Intelligence

##### 1. Dashboard Tab (Value - Week 5)
**Purpose:** Immediate health status overview
```tsx
<DashboardTab>
  <HealthSummaryCard />
  <CurrentMedications source="normalized_tables" />
  <CriticalAllergies prominence="high" />
  <RecentActivity timeline="30_days" />
  <UpcomingAppointments />
  <QuickActions />
</DashboardTab>
```

**Data Sources:**
- `patient_medications` (materialized view)
- `patient_conditions` 
- `patient_allergies`
- `healthcare_timeline_events`
- `profile_appointments`

##### 2. Documents Tab (Trust - Week 5)
**Purpose:** Source verification and document management
```tsx
<DocumentsTab>
  <DocumentUploader capabilities={deviceCapabilities} />
  <ProcessingQueue realTime={true} />
  <DocumentLibrary searchable filterable />
  <ExtractionViewer confidence={true} />
  <SourceLinking bidirectional={true} />
</DocumentsTab>
```

**Data Sources:**
- `documents` table
- `job_queue` for processing status
- Supabase Storage for file management
- Real-time subscriptions for live updates

##### 3. Timeline Tab (Narrative - Week 6)
**Purpose:** Healthcare journey visualization
```tsx
<TimelineTab>
  <TimelineFilter 
    profiles={familyProfiles}
    categories={eventCategories}
    dateRange={customizable}
  />
  <HealthTimeline
    virtualized={true}
    chunkSize="3_months"
    infinite={true}
  />
  <EventDetails expandable modal />
</TimelineTab>
```

**Data Sources:**
- `healthcare_timeline_events`
- `patient_clinical_events`
- `healthcare_encounters`
- Cross-referenced with `documents`

##### 4. Insights Tab (Intelligence - Week 6)
**Purpose:** AI-powered health intelligence
```tsx
<InsightsTab>
  <HealthTrends charts={true} anomalies={true} />
  <CareGaps recommendations={true} />
  <FamilyPatterns multiProfile={true} />
  <PredictiveInsights confidence={required} />
  <AIContextPrep chatbotReady={true} />
</InsightsTab>
```

#### Strategic Event Logging System
```typescript
// Lightweight, privacy-aware event capture
const logUserEvent = (action: string, metadata: any) => {
  supabase.from('user_events').insert({
    action,
    metadata: sanitizeMetadata(metadata),
    profile_id: currentProfile.id,
    session_id: currentSession.id,
    timestamp: new Date(),
    privacy_level: currentPrivacySettings.eventLogging
  });
};

// Usage examples throughout application
logUserEvent('medication_viewed', { 
  medicationId, 
  viewDuration, 
  scrollDepth,
  sourceDocument 
});

logUserEvent('timeline_filtered', {
  filters: selectedFilters,
  dateRange: selectedRange,
  resultCount: filteredEvents.length
});
```

**Week 5 Deliverables:**
- [ ] Dashboard and Documents tabs complete
- [ ] Real-time processing status
- [ ] Source traceability working
- [ ] Event logging operational
- [ ] Cross-tab navigation

**Week 6 Deliverables:**
- [ ] Timeline and Insights tabs complete
- [ ] Virtual scrolling performance
- [ ] AI context preparation
- [ ] Family profile switching
- [ ] Data visualization charts

### Phase 4: Polish & Platform Readiness (Weeks 7-8)

#### Essential Polish & Performance
```
├── User Experience
│   ├── Loading states & skeleton screens
│   ├── Error boundaries with recovery
│   ├── Smooth animations & transitions
│   ├── Progressive Web App features
│   └── Mobile-optimized interactions
│
├── Performance Optimization
│   ├── Component lazy loading
│   ├── Data prefetching strategies
│   ├── Virtual scrolling tuning
│   ├── Bundle size optimization
│   └── Caching strategies
│
├── Quality Assurance
│   ├── Comprehensive error handling
│   ├── Accessibility audit (WCAG 2.1 AA)
│   ├── Cross-browser compatibility
│   ├── Performance benchmarks
│   └── Security review
│
└── Platform Preparations
    ├── Component API documentation
    ├── Extension point definitions
    ├── Mobile app preparation
    ├── Provider portal readiness
    └── Deployment optimization
```

#### Privacy & Security Hardening
```tsx
// Privacy-first data handling
const PrivacyProvider = ({ children }) => {
  const [encryptionLevel, setEncryptionLevel] = useState('standard');
  const [auditLevel, setAuditLevel] = useState('comprehensive');
  const [dataRetention, setDataRetention] = useState('user_controlled');
  
  // Progressive privacy enhancement
  const upgradeToZeroKnowledge = async () => {
    // Client-side encryption preparation
    // Key derivation from user password
    // Encrypted blob storage
  };

  return (
    <PrivacyContext.Provider value={{
      encryptionLevel,
      auditLevel,
      dataRetention,
      upgradeToZeroKnowledge
    }}>
      {children}
    </PrivacyContext.Provider>
  );
};
```

**Week 7 Deliverables:**
- [ ] Complete UI polish
- [ ] Performance optimization
- [ ] Error handling robustness
- [ ] Privacy review completion
- [ ] Mobile responsiveness perfection

**Week 8 Deliverables:**
- [ ] Production deployment readiness
- [ ] Component documentation
- [ ] Extension architecture
- [ ] Testing coverage completion
- [ ] Launch preparation

---

## Supporting the 11 Future Requirements

### Architectural Foundation Support

#### 1. AI Chatbot Integration
**Foundation Ready:**
- Event logging captures user behavior patterns
- Structured clinical data from 47 normalized tables
- RAG-ready data format with confidence scores
- Context compilation system for personalized responses

**Implementation Path:**
```tsx
// Future chatbot integration point
<AIAssistant
  context={compiledHealthContext}
  eventHistory={userEventHistory}
  confidenceThreshold={0.85}
  personalityProfile={userPreferences}
/>
```

#### 2. Telehealth Integration
**Foundation Ready:**
- Component capability detection system
- Provider registry integration (`provider_registry` table)
- Appointment management (`profile_appointments`)
- Real-time communication infrastructure

**Implementation Path:**
```tsx
// Telehealth component using capability detection
<TelehealthPortal
  capabilities={['video', 'audio', 'screen_share']}
  providers={verifiedProviders}
  appointments={scheduledAppointments}
  integration="third_party" // or "embedded"
/>
```

#### 3. UI Layout Flexibility
**Foundation Ready:**
- CSS Grid/Flexbox responsive design
- Component separation from layout
- Capability-driven UI adaptation
- Theme and layout configuration system

**Implementation Path:**
```css
/* Layout flexibility with CSS Grid */
.guardian-shell {
  display: grid;
  grid-template: var(--layout-template);
  /* Can be: sidebar-main, top-main, bottom-main, hamburger-main */
}

@media (max-width: 768px) {
  .guardian-shell {
    --layout-template: "header" auto "main" 1fr "nav" auto / 1fr;
  }
}
```

#### 4. Infinite Timeline Scrolling
**Foundation Ready:**
- Virtual scrolling architecture from day one
- Chunk-based data loading (3-month segments)
- Performance-optimized rendering
- Predictive pre-loading based on scroll velocity

#### 5. Map & Provider Booking
**Foundation Ready:**
- Provider registry tables populated
- Geographic data structure
- Appointment creation workflows
- Third-party service integration patterns

#### 6. Multi-Profile Family Management
**Foundation Ready:**
- Core architecture built around profiles
- Permission and relationship management
- Context switching infrastructure
- Family-aware data isolation

#### 7. Mobile App Development
**Foundation Ready:**
- Responsive web design
- Capability detection system
- Shared backend API
- Component reusability across platforms

#### 8. Privacy & De-identification
**Foundation Ready:**
- Progressive encryption levels
- Client-side encryption preparation
- Audit trail system
- Data anonymization utilities

**De-identification Tool for Testing:**
```tsx
// Standalone de-identification utility
<DocumentAnonymizer
  inputDocument={originalDocument}
  anonymizationLevel="full" // names, dates, locations
  preserveStructure={true}
  outputFormat="same_as_input"
  onComplete={handleAnonymizedDocument}
/>
```

#### 9. Multi-Source Data Ingestion
**Foundation Ready:**
- Unified job queue processing
- Adapter pattern for different sources
- Standardized data transformation
- Error handling and retry mechanisms

#### 10. Advanced Authentication
**Foundation Ready:**
- Progressive authentication levels
- Supabase Auth integration
- Biometric support (WebAuthn/Passkeys)
- ID verification service integration

#### 11. Data Visualization & Charts
**Foundation Ready:**
- Modular visualization system
- Multiple chart library support
- Time-series data optimization
- Anomaly detection and highlighting

---

## Technical Architecture

### Component Hierarchy
```
Guardian App
├── Providers (Context Hierarchy)
│   ├── AuthProvider
│   ├── ProfileProvider
│   ├── PrivacyProvider
│   ├── DataProvider
│   └── NotificationProvider
│
├── Shell Components
│   ├── Navigation
│   ├── ProfileSwitcher
│   ├── NotificationCenter
│   └── MainContent
│
├── Tab Components
│   ├── Dashboard
│   ├── Documents
│   ├── Timeline
│   └── Insights
│
├── Feature Components
│   ├── Health Data Display
│   ├── Document Processing
│   ├── Profile Management
│   └── Intelligence Systems
│
└── Utility Components
    ├── Privacy Controls
    ├── Event Logging
    ├── Error Boundaries
    └── Performance Monitors
```

### Data Flow Architecture
```
User Interaction
    ↓
Event Logging System
    ↓
Component State Management
    ↓
Context Providers (Auth, Profile, Privacy, Data)
    ↓
Supabase Client (RLS, Real-time, Storage)
    ↓
Database Foundation (47 tables, 917 functions)
    ↓
Real-time Updates Back to Components
```

### State Management Strategy
- **Global State:** React Context API for user, profile, privacy settings
- **Server State:** TanStack Query for all data fetching, caching, and SSR hydration
- **Component State:** useState/useReducer for local UI state
- **Form State:** React Hook Form for complex forms
- **Real-time State:** Supabase subscriptions for live updates (documents initially)

---

## Development Guidelines

### Do This (Best Practices)
✅ **Component Design:**
- Use standardized props interface on all components
- Implement capability detection for cross-platform support
- Build with multi-profile awareness from day one
- Include event logging in significant user interactions

✅ **Data Management:**
- Leverage existing RLS policies for security
- Use real-time subscriptions for live updates
- Implement optimistic updates where appropriate
- Cache frequently accessed data

✅ **Privacy & Security:**
- Log all data access for audit trails
- Implement progressive privacy levels
- Use client-side encryption preparation
- Validate user permissions on every action

✅ **Performance:**
- Implement virtual scrolling for large data sets
- Use lazy loading for non-critical components
- Optimize bundle sizes with code splitting
- Monitor and measure performance metrics

### Don't Do This (Anti-Patterns)
❌ **Architecture:**
- Don't build custom frameworks when standard tools work
- Don't create tight coupling between components
- Don't ignore mobile from the start
- Don't hardcode single-profile assumptions

❌ **Data Management:**
- Don't bypass RLS policies for convenience
- Don't store sensitive data in browser storage
- Don't ignore real-time capabilities
- Don't create data silos between components

❌ **Development Process:**
- Don't skip TypeScript interfaces
- Don't ignore accessibility requirements
- Don't build without testing infrastructure
- Don't deploy without performance validation

---

## Success Criteria & Milestones

### Week 2 Milestone: Foundation Complete
- [ ] Multi-profile context switching functional
- [ ] Real-time Supabase integration working
- [ ] Event logging capturing user actions
- [ ] Responsive layout adapts to mobile/desktop
- [ ] Error boundaries catch and handle failures

### Week 4 Milestone: Components Operational
- [ ] All core components render real data
- [ ] Component APIs standardized and documented
- [ ] Privacy controls integrated into data flow
- [ ] Performance benchmarks established
- [ ] Cross-component communication working

### Week 6 Milestone: Features Complete
- [ ] All four tabs functional with real-time updates
- [ ] Document processing with live status updates
- [ ] Timeline with infinite scroll performance
- [ ] Family profile management operational
- [ ] AI context preparation active

### Week 8 Milestone: Production Ready
- [ ] Complete application polished and tested
- [ ] Performance targets met (<500ms load, <100ms updates)
- [ ] Accessibility compliance (WCAG 2.1 AA)
- [ ] Mobile responsiveness perfected
- [ ] Ready for first user testing

### Long-term Platform Readiness
- [ ] Component APIs support provider portal integration
- [ ] Privacy architecture ready for zero-knowledge upgrade
- [ ] Event logging sufficient for AI training
- [ ] Mobile app development can begin immediately
- [ ] All 11 future requirements have clear implementation path

---

## Next Steps

### Immediate Actions (This Week)
1. **Set up Next.js shell** with hierarchical context providers
2. **Define TypeScript interfaces** for standardized component props
3. **Implement basic profile switching** using existing `user_profiles` table
4. **Integrate Supabase real-time** for live data updates
5. **Create first platform-aware component** as proof of concept

### Implementation Order
1. **Week 1:** Application shell and context architecture
2. **Week 2:** Core infrastructure and real-time integration
3. **Week 3:** Component library development begins
4. **Week 4:** Component integration and testing
5. **Week 5:** Dashboard and Documents tabs
6. **Week 6:** Timeline and Insights tabs
7. **Week 7:** Polish, performance, and error handling
8. **Week 8:** Final testing and production preparation

---

## Conclusion

This architecture represents the synthesis of pragmatic startup execution with strategic platform thinking. We build a Next.js application that can delight users immediately while naturally evolving into a comprehensive Healthcare Operating System.

The foundation supports all future requirements without over-engineering the present. Every component is designed with platform DNA while using proven, efficient tools.

**Result:** A "Most Valuable Product" that establishes Guardian as the definitive personal healthcare platform, built in 8 weeks with the flexibility to grow for the next decade.

---

*For implementation questions, refer to the specific phase documentation or component specifications in the subfolders.*