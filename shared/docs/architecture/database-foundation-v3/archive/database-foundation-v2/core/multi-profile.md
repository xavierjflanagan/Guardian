# Guardian v7 Multi-Profile Management System

**Status:** Architecture Complete  
**Date:** 2025-07-31  
**Purpose:** Comprehensive multi-profile architecture supporting dependent profiles (children, pets, etc.) with advanced security, authentication, and data integrity features

---

## Overview

The Multi-Profile Management System extends Guardian's single-user model to support complex family healthcare scenarios while maintaining security, data integrity, and user experience excellence. This system enables primary account holders to manage healthcare data for dependents including children, pets, and other family members.

**Key Features:**
- 🏠 **Family Healthcare Management** - Unified platform for managing multiple profiles under one account
- 🔒 **Progressive Authentication** - Frictionless onboarding with soft → hard authentication progression  
- 🛡️ **Profile Contamination Prevention** - AI-powered data integrity protection across profiles
- 🎯 **Smart Profile Detection** - Automatic profile assignment based on document content analysis
- 👶 **Pregnancy Journey Integration** - Seamless transition from pregnancy tracking to child profiles
- 🔄 **Profile Switching & Context** - Intuitive profile management with visual differentiation
- 📋 **Unified Appointment Management** - Family-wide appointment coordination with color-coded calendar

---

## 1. Core Architecture Components

### 1.1. Profile Management Tables

*Detailed implementation available in [core-schema.md](./core-schema.md) Section 2*

The system builds on these core tables:
- `user_profiles` - Primary profile management with relationship tracking
- `profile_access_permissions` - Granular access control with time-based restrictions  
- `user_profile_context` - Profile switching and context management
- `smart_health_features` - Auto-activating UI features based on health data detection
- `pregnancy_journey_events` - Specialized pregnancy and family planning tracking

### 1.2. Profile Types & Relationships

```typescript
interface ProfileType {
  self: 'Primary account holder profile';
  child: 'Dependent child profile';  
  pet: 'Pet/animal profile';
  dependent: 'General dependent profile';
}

interface RelationshipType {
  legal_status: 'guardian' | 'parent' | 'caregiver' | 'self' | 'owner';
  relationship: 'self' | 'daughter' | 'son' | 'mother' | 'father' | 'dog' | 'cat' | string;
  species?: string; // For pets: 'dog', 'cat', 'bird', etc.
  breed?: string;   // For pets: breed information
}
```

---

## 2. Progressive Authentication System

### 2.1. Authentication Levels

 User has three options upon app download to start building out their account:
   1. Do nothing, no personal details entered (intial state)
   2. Manually enter personal details, or with smart tech UI, such as drivers license photo upload. (Soft Authentication)
   3. Simply upload their first healthcare document, which, if containing patient personal contact details will subsequently be auto-populated (Soft Authentication)

**None Authentication (Initial State)**
- New profiles start with no authentication
- Entering in personal details optional at this stage.
- Can view basic interface and educational content
- Can view demo of messy common file being uploaded and transformed into pretty dashboard profile.
- Cannot upload documents or access advanced features

**Soft Authentication (First Document Upload)**
- Activated when first document is uploaded and processed.
- Patient details extracted from document (name, DOB, address, etc.)
- User confirms extracted details belong to them. 
- User able to manually contribute further personal contact details.
- Confidence score calculated based on data completeness
- Enables basic healthcare data management

**Hard Authentication (Pre-Export/Sharing)**
- Required before data export, sharing, or ecosystem features
- Suggested post soft authentication, however, easily skippable following consequence warning.
- Multiple verification methods available:
  - ID document verification (passport, driver's license)
  - Bank relationship verification (modern identity services)
  - Telco relationship verification (mobile carrier confirmation)
  - Biometric verification (future enhancement)

### 2.2. Authentication Progression Functions

*Implementation details in [core-schema.md](./core-schema.md) Section 2.2*

Key functions:
- `perform_soft_authentication()` - Processes first document upload for identity extraction
- `initiate_hard_authentication()` - Begins formal identity verification process
- `complete_hard_authentication()` - Finalizes identity verification and unlocks features

### 2.3. Feature Restrictions by Authentication Level

| Feature | None | Soft | Hard |
|---------|------|------|------|
| Document Upload | ✅ | ✅ | ✅ |
| Timeline Viewing | ❌ | ✅ | ✅ |
| Data Export | ❌ | ❌ | ✅ |
| Provider Sharing | ❌ | ❌ | ✅ |
| Ecosystem Features | ❌ | ❌ | ✅ |
| Profile Management | ❌ | ✅ | ✅ |
| Family Coordination | ❌ | ❌  | ✅ |

---

## 3. Smart Profile Detection & Assignment

### 3.1. Profile Detection Pipeline

When documents are uploaded, the system automatically analyzes content to determine the correct profile assignment:

**Step 1: Content Analysis**
- Extract patient demographics (name, DOB, contact info)
- Identify medical context (pediatric vs adult care)
- Detect species-specific indicators for veterinary documents
- Analyze provider information and appointment types

**Step 2: Pattern Matching**
- Compare extracted data against existing profile patterns
- Calculate confidence scores for each potential profile match
- Consider relationship indicators and care contexts

**Step 3: Assignment Decision**
- High confidence (>80%): Automatic assignment with user notification
- Medium confidence (50-80%): Prompt user for confirmation with explanation
- Low confidence (<50%): Present options to user with detected information

### 3.2. Profile Detection Functions

*Implementation details in [core-schema.md](./core-schema.md) Section 2.2*

Key functions:
- `detect_profile_from_document()` - Main profile detection logic
- `check_document_profile_compatibility()` - Contamination prevention validation
- `verify_document_before_processing()` - Pre-processing verification workflow

### 3.3. Contamination Prevention System

**Demographic Validation**
- Name similarity checking for authenticated profiles
- Date of birth consistency verification
- Contact information cross-validation

**Clinical Logic Validation**
- Age-appropriate condition checking (e.g., COPD rarely affects children under 40)
- Gender-specific condition validation (e.g., pregnancy only affects females)
- Species-appropriate medical conditions for pets

**Temporal Validation**
- Future date detection and flagging
- Appointment date reasonableness checking
- Medical history timeline consistency

### 3.4. Enhanced Data Quality Guardian System

Building on the existing contamination prevention system, the Quality Guardian adds user validation and correction capabilities for detected issues. This system ensures data accuracy while providing users with clear, actionable feedback.

**Quality Flag Categories**
- **Temporal**: Date inconsistencies, future dates, timeline issues
- **Demographic**: Name mismatches, age inconsistencies, contact format issues
- **Clinical**: Age-inappropriate conditions, impossible vital ranges, species-specific validation
- **Profile Mismatch**: Document assigned to wrong profile type
- **Extraction Quality**: Low OCR confidence, incomplete extraction, conflicting data

**Severity Levels**
- **Critical**: Issues that block processing or require immediate attention
- **Warning**: Issues that should be reviewed but don't block processing
- **Info**: Minor issues or suggestions for improvement

**User Resolution Workflow**
1. **Detection**: AI identifies potential issues during document processing
2. **Flag Creation**: Issues stored in database with confidence scores and explanations
3. **User Notification**: Gentle, contextual flags displayed in UI with clear explanations
4. **Resolution Options**: Multiple resolution paths provided (confirm, edit, delete, ignore)
5. **ML Feedback**: User corrections improve future detection accuracy

**Integration Points**
- Extends existing `check_document_profile_compatibility()` function
- Enhances `verify_document_before_processing()` with user validation layer
- Builds on temporal/demographic validation with ML-powered suggestions
- Seamlessly integrates with document processing pipeline

---

## 4. Profile Switching & Context Management

### 4.1. Profile Context System

The system maintains user context to enable seamless switching between profiles:

**Current Profile Tracking**
- Active profile ID stored in user session
- Recent profile access history (last 5 profiles)
- Pinned profiles for quick access

**Visual Differentiation**
- Unique theme colors for each profile
- Custom avatars and icons
- Profile-specific UI customizations

**Context Preservation**
- Maintain filters and preferences per profile
- Separate notification settings
- Individual dashboard configurations

### 4.2. Profile Switching Interface Design

```typescript
interface ProfileSwitcher {
  currentProfile: {
    id: string;
    displayName: string;
    profileType: 'self' | 'child' | 'pet' | 'dependent';
    themeColor: string;
    avatar: string;
    icon: string;
  };
  
  recentProfiles: Profile[];
  pinnedProfiles: Profile[];
  
  // Quick actions
  actions: {
    switchProfile: (profileId: string) => Promise<void>;
    createNewProfile: () => void;
    manageProfiles: () => void;
  };
}
```

### 4.3. Profile Switching Functions

*Implementation details in [healthcare-journey.md](./healthcare-journey.md) Section 3*

Key functions:
- `switch_user_profile()` - Handle profile context switching
- `get_current_profile()` - Retrieve active profile information
- `get_family_appointments()` - Cross-profile appointment viewing

---

## 5. Smart Health Features Integration

### 5.1. Context-Aware UI Features

The system automatically activates specialized UI features based on detected health contexts:

**Family Planning Tab**
- Activated by fertility-related health data
- Ovulation tracking and conception planning tools
- Educational resources and milestone tracking

**Pregnancy Tab**
- Triggered by pregnancy-related medical data
- Week-by-week progress tracking
- Prenatal appointment scheduling and reminders
- Baby development milestones and educational content

**Pediatric Care Panel**
- Activated for child profiles
- Growth charts and vaccination schedules
- Development milestone tracking
- Pediatric-specific health resources

**Pet Care Panel**
- Activated for pet profiles
- Veterinary appointment tracking
- Vaccination and medication schedules
- Species-specific health information

### 5.2. Smart Feature Detection

*Implementation details in [user-experience.md](./user-experience.md) Section 6*

The system uses advanced pattern recognition to detect health contexts:
- LOINC code analysis for pregnancy tests and fertility markers
- SNOMED code detection for obstetric and pediatric care
- Provider type analysis (OB/GYN, pediatrics, veterinary)
- Document content analysis using NLP techniques

---

## 6. Pregnancy Journey & Profile Transitions

### 6.1. Pregnancy Profile Management

**Pregnancy Profile Creation**
- Automatically created when pregnancy-related health data is detected
- Special profile type with pregnancy-specific features
- Integration with family planning timeline and milestones

**Pregnancy Dashboard**
- Week-by-week progress tracking
- Baby development visualization
- Appointment and test scheduling
- Educational resources and community features

### 6.2. Transition to Child Profile

**Delivery Event Processing**
- Detect birth-related medical documents
- Prompt user to create child profile
- Transfer relevant pregnancy data to child profile
- Maintain pregnancy history for maternal records

**Profile Transition Functions**
- `transition_pregnancy_to_child_profile()` - Handle pregnancy to child transition
- `copy_prenatal_data_to_child()` - Transfer relevant medical history
- `archive_pregnancy_profile()` - Preserve pregnancy journey data

---

## 7. Family Appointment Coordination

### 7.1. Unified Family Calendar

**Color-Coded Organization**
- Each profile has unique theme color
- Visual appointment differentiation
- Priority-based display ordering

**Cross-Profile Appointment Views**
- Family-wide appointment timeline
- Profile-specific filtering options
- Appointment conflict detection and resolution

### 7.2. Appointment Management Features

**Appointment Categories**
- Routine checkups and preventive care
- Specialist consultations
- Emergency and urgent care
- Vaccination and treatment appointments

**Family Coordination Tools**
- Appointment scheduling for multiple profiles
- Reminder notifications with profile context
- Healthcare provider communication coordination
- Insurance and administrative management

---

## 8. Data Security & Privacy

### 8.1. Profile-Aware Security Model

**Row Level Security (RLS)**
- Profile-based access control policies
- Granular permission management
- Time-based access restrictions

**Access Control Levels**
- Owner: Full access to all profile features  
- Full Access: Complete read/write permissions
- Read/Write: Limited editing capabilities
- Read Only: View-only access
- Emergency: Restricted emergency access

### 8.2. Privacy Protection Features

**Data Isolation**
- Complete separation of profile data
- Secure cross-profile relationship management
- Audit trails for all profile access

**Consent Management**
- Profile-specific consent preferences
- Granular sharing controls
- Healthcare provider access management

---

## 9. Implementation Considerations

### 9.1. Fresh Implementation Strategy

**Clean Architecture Deployment**
- Multi-profile system built from ground up
- All tables include profile support from day one
- No backward compatibility concerns or migrations needed

**Database Schema Requirements**  
- Profile_id columns integrated into all clinical tables
- Profile-aware RLS policies from initial deployment
- Complete profile management infrastructure from launch

### 9.2. Performance Optimization

**Indexing Strategy**
- Profile-aware indexing on all clinical tables
- Optimized queries for cross-profile operations
- Efficient profile switching and context management

**Caching Considerations**
- Profile context caching for improved performance
- Appointment data caching across profiles
- Smart feature activation state management

---

## 10. User Experience Guidelines

### 10.1. Profile Creation Workflow

**Step 1: Profile Type Selection**
- Clear options for different profile types
- Relationship selection and customization
- Theme and visual customization

**Step 2: Basic Information Entry**
- Name, date of birth, and relationship details
- Species and breed information for pets
- Contact and emergency information

**Step 3: Healthcare Context Setup**
- Primary care provider information
- Insurance and administrative details
- Initial health preferences and settings

### 10.2. Profile Management Interface

**Profile Dashboard**
- Quick profile switching controls
- Visual profile identification
- Recent activity and notifications

**Profile Settings**
- Customization options (theme, avatar, name)
- Access permission management
- Healthcare preferences and settings

**Family Overview**
- All profiles summary view
- Upcoming appointments across profiles
- Health milestone and reminder tracking

---

## 11. Future Enhancements

### 11.1. Advanced Features Roadmap

**AI-Powered Profile Intelligence**
- Automatic health pattern recognition across profiles
- Family health trend analysis and insights
- Predictive healthcare recommendations

**Enhanced Security Features**
- Biometric authentication for sensitive operations
- Advanced contamination detection using ML
- Behavioral analysis for profile access patterns

### 11.2. Integration Opportunities

**Healthcare Provider Integration**
- Direct provider access to family profiles
- Appointment scheduling and coordination
- Clinical decision support across family members

**Ecosystem Partnerships**
- Pharmacy integration for family medication management
- Insurance coordination across multiple profiles
- Health device integration for family monitoring

---

## 12. Success Metrics & Validation

### 12.1. Key Performance Indicators

**User Adoption Metrics**
- Multi-profile adoption rate
- Profile switching frequency
- Feature utilization across profile types

**Data Quality Metrics**
- Profile contamination prevention success rate
- Document assignment accuracy
- User confirmation rates for profile detection

**User Experience Metrics**
- Profile creation completion rates
- User satisfaction with profile management
- Support requests related to profile issues

### 12.2. Validation Testing

**Functional Testing**
- Profile creation and management workflows
- Document upload and assignment accuracy
- Authentication progression functionality

**Security Testing**
- Access control validation across profiles
- Data isolation and privacy verification
- Contamination prevention system testing

**Performance Testing**
- Profile switching response times
- Cross-profile query performance
- Large family account scalability

---

This multi-profile management system provides Guardian with a comprehensive solution for family healthcare coordination while maintaining the security, privacy, and user experience standards required for healthcare applications. The architecture is designed to scale from simple two-person households to complex multi-generational families with diverse healthcare needs.