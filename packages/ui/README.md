# Guardian UI Component Library

A comprehensive React component library designed specifically for healthcare applications, built with TypeScript and Tailwind CSS.

## 🏥 Healthcare-First Design

Guardian UI is purpose-built for healthcare applications with:
- **Medical data patterns** optimized for clinical workflows
- **Accessibility** meeting healthcare industry standards
- **Security-conscious** design patterns
- **Multi-profile** support for family healthcare management
- **Confidence scoring** for AI-processed medical data

## 🚀 Quick Start

```bash
npm install @guardian/ui
```

```tsx
import { MedicalCard, Timeline, StatusBadge } from '@guardian/ui';
import '@guardian/ui/styles/base.css';

function HealthcareDashboard() {
  return (
    <div>
      <MedicalCard 
        title="Blood Pressure Reading"
        severity="high"
        confidenceScore={92}
        date="2025-01-15"
        provider="Dr. Smith"
      >
        <p>Systolic: 145 mmHg, Diastolic: 95 mmHg</p>
      </MedicalCard>
      
      <StatusBadge status="warning">
        Abnormal Reading
      </StatusBadge>
    </div>
  );
}
```

## 🎨 Design System

Guardian UI implements a comprehensive design system optimized for healthcare:

### Color Palette

```tsx
import { guardianTheme } from '@guardian/ui';

// Primary healthcare colors
guardianTheme.colors.primary    // Medical blue - trust, reliability
guardianTheme.colors.secondary  // Healthcare teal - healing, wellness

// Profile-specific colors
guardianTheme.colors.profiles.self      // #3b82f6 - Primary user
guardianTheme.colors.profiles.child     // #22c55e - Children/dependents  
guardianTheme.colors.profiles.pet       // #f97316 - Pets
guardianTheme.colors.profiles.dependent // #a855f7 - Other dependents

// Medical severity indicators
guardianTheme.colors.severity.critical  // #dc2626 - Urgent/critical
guardianTheme.colors.severity.high      // #f59e0b - Important
guardianTheme.colors.severity.medium    // #3b82f6 - Routine
guardianTheme.colors.severity.resolved  // #22c55e - Resolved/healthy
```

### Typography

Healthcare-optimized typography with high readability:

```tsx
// Medical text styles
.diagnostic-code    // Monospace for medical codes (ICD-10, etc.)
.medication-name    // Emphasized medication names
.clinical-note     // Readable clinical documentation
```

## 🧩 Components

### Base Components

#### Avatar
Multi-profile avatar with healthcare context support.

```tsx
import { Avatar, ProfileAvatar, AvatarGroup } from '@guardian/ui';

// Basic avatar
<Avatar profile={userProfile} size="lg" showOnlineStatus />

// Avatar with name display
<ProfileAvatar profile={userProfile} showName namePosition="right" />

// Multiple profiles
<AvatarGroup profiles={familyProfiles} max={3} showCount />
```

#### Button
Healthcare-appropriate button variants with loading states.

```tsx
import { Button, IconButton, FloatingActionButton } from '@guardian/ui';

// Primary actions
<Button variant="primary" size="md" isLoading loadingText="Saving...">
  Save Medical Record
</Button>

// Icon-only actions  
<IconButton icon={Edit} aria-label="Edit record" variant="ghost" />

// Critical actions
<FloatingActionButton icon={Plus} position="bottom-right" />
```

#### Dropdown
Accessible dropdown menus with healthcare-specific variants.

```tsx
import { Dropdown, SelectDropdown, MenuDropdown } from '@guardian/ui';

// Form select
<SelectDropdown
  options={[
    { value: 'outpatient', label: 'Outpatient Visit' },
    { value: 'emergency', label: 'Emergency Care' }
  ]}
  placeholder="Select appointment type..."
/>

// Action menu
<MenuDropdown
  trigger={<Button variant="ghost">Actions</Button>}
  items={[
    { label: 'View Details', onClick: handleView, icon: Eye },
    { label: 'Delete', onClick: handleDelete, variant: 'danger', icon: Trash }
  ]}
/>
```

### Healthcare-Specific Components

#### MedicalCard
Specialized cards for displaying medical information.

```tsx
import { MedicalCard, DiagnosticCard, MedicationCard, LabResultCard } from '@guardian/ui';

// Generic medical card
<MedicalCard
  title="Annual Physical Exam"
  severity="medium"
  confidenceScore={95}
  sourceDocument="physical_exam_2025.pdf"
  date="2025-01-15"
  provider="Dr. Sarah Johnson"
  hasWarning={false}
>
  <p>Complete physical examination with routine lab work.</p>
</MedicalCard>

// Specialized variants
<DiagnosticCard
  diagnosis="Hypertension"
  icd10Code="I10"
  diagnosisDate="2025-01-15"
  provider="Dr. Smith"
  severity="high"
/>

<MedicationCard
  medicationName="Lisinopril"
  dosage="10mg"
  frequency="Once daily"
  prescribedDate="2025-01-15"
  isActive={true}
/>

<LabResultCard
  testName="Total Cholesterol"
  result="245"
  unit="mg/dL"
  referenceRange="< 200 mg/dL"
  isAbnormal={true}
/>
```

#### Timeline
Healthcare timeline for chronological medical events.

```tsx
import { Timeline, CompactTimeline, TimelineFilters } from '@guardian/ui';

const healthcareEvents = [
  {
    id: '1',
    type: 'appointment',
    title: 'Cardiology Consultation',
    description: 'Follow-up for hypertension management',
    date: new Date('2025-01-15'),
    provider: 'Dr. Sarah Johnson',
    severity: 'medium',
    confidenceScore: 92
  },
  {
    id: '2', 
    type: 'lab_result',
    title: 'Blood Work Results',
    description: 'Complete metabolic panel results available',
    date: new Date('2025-01-10'),
    severity: 'high',
    confidenceScore: 98
  }
];

// Full timeline
<Timeline
  events={healthcareEvents}
  groupByDate={true}
  onEventClick={handleEventClick}
  sortOrder="descending"
/>

// Compact version for dashboards
<CompactTimeline
  events={healthcareEvents}
  maxEvents={5}
  onEventClick={handleEventClick}
/>

// With filters
<TimelineFilters
  eventTypes={['appointment', 'medication', 'lab_result']}
  selectedTypes={selectedEventTypes}
  onTypeChange={setSelectedEventTypes}
/>
```

#### StatusBadge
Medical context-aware status indicators.

```tsx
import { 
  StatusBadge, 
  MedicalStatusBadge, 
  MedicationStatusBadge,
  AppointmentStatusBadge,
  SeverityBadge,
  ConfidenceBadge 
} from '@guardian/ui';

// Medical test results
<MedicalStatusBadge status="abnormal" size="sm" />

// Medication status
<MedicationStatusBadge status="active" size="md" />

// Appointment tracking
<AppointmentStatusBadge status="confirmed" />

// Severity indicators
<SeverityBadge severity="critical" showIcon />

// AI confidence scoring
<ConfidenceBadge score={87} showScore />
```

#### ConfidenceIndicator
Visual confidence scoring for AI-processed medical data.

```tsx
import { ConfidenceIndicator, ConfidenceComparison } from '@guardian/ui';

// Progress bar style
<ConfidenceIndicator 
  score={87} 
  variant="bar" 
  size="md" 
  showIcon 
  showPercentage 
  label="Data Extraction"
/>

// Badge style
<ConfidenceIndicator 
  score={92} 
  variant="badge" 
  threshold={{ high: 85, medium: 65 }}
/>

// Circular progress
<ConfidenceIndicator 
  score={76} 
  variant="circular" 
  size="lg"
/>

// Before/after comparison
<ConfidenceComparison 
  before={73} 
  after={91} 
  size="md"
/>
```

## 🎨 Styling & Theming

### CSS Variables

Guardian UI uses CSS custom properties for consistent theming:

```css
:root {
  /* Profile colors */
  --guardian-profile-self: #3b82f6;
  --guardian-profile-child: #22c55e;
  --guardian-profile-pet: #f97316;
  
  /* Medical severity */
  --guardian-severity-critical: #dc2626;
  --guardian-severity-high: #f59e0b;
  --guardian-severity-resolved: #22c55e;
  
  /* Healthcare spacing */
  --guardian-card-padding: 1rem;
  --guardian-section-gap: 1.5rem;
  --guardian-timeline-gap: 0.75rem;
}
```

### CSS Classes

Pre-built CSS classes for common healthcare UI patterns:

```css
/* Medical cards */
.medical-card
.medical-card-header
.medical-card-content
.medical-card-footer

/* Profile indicators */
.profile-indicator
.profile-indicator-self
.profile-indicator-child

/* Timeline components */
.timeline-container
.timeline-item
.timeline-marker
.timeline-line

/* Status badges */
.status-badge
.status-success
.status-warning
.status-error

/* Animation utilities */
.animate-fade-in
.animate-slide-up
.animate-pulse-gentle
```

### Tailwind Integration

Extend your Tailwind config with Guardian tokens:

```js
// tailwind.config.js
import { guardianTailwindConfig } from '@guardian/ui/themes/tailwind-config';

export default {
  // Merge with Guardian configuration
  presets: [guardianTailwindConfig],
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './node_modules/@guardian/ui/**/*.{js,ts,jsx,tsx}'
  ]
};
```

## ♿ Accessibility

Guardian UI components are built with accessibility in mind:

- **WCAG 2.1 AA** compliance
- **Keyboard navigation** support
- **Screen reader** optimization
- **Focus management** for complex interactions
- **High contrast** medical data display
- **Reduced motion** support for sensitive users

### Focus Management

```tsx
// Automatic focus management in dropdowns
<Dropdown trigger={<Button>Options</Button>}>
  <DropdownItem onClick={handleAction}>
    Action Item
  </DropdownItem>
</Dropdown>

// Proper ARIA labels on icon buttons
<IconButton 
  icon={Edit} 
  aria-label="Edit medical record"
  onClick={handleEdit}
/>
```

## 🔧 Development

### Local Development

```bash
# Clone the monorepo
git clone https://github.com/guardian/healthcare-platform
cd packages/ui

# Install dependencies
npm install

# Start development
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

### Contributing

1. Follow healthcare data sensitivity guidelines
2. Ensure WCAG 2.1 AA compliance
3. Test with screen readers
4. Include accessibility documentation
5. Add TypeScript types for all props

## 📦 Package Structure

```
packages/ui/
├── components/          # React components
│   ├── Avatar.tsx
│   ├── Button.tsx
│   ├── MedicalCard.tsx
│   ├── Timeline.tsx
│   └── index.ts
├── styles/              # CSS and styling
│   ├── base.css
│   └── index.ts
├── themes/              # Design tokens
│   ├── guardian-theme.ts
│   ├── tailwind-config.ts
│   └── index.ts
├── utils/               # Utility functions
└── types/               # TypeScript definitions
```

## 🚀 Roadmap

### Phase 2 Completed
- ✅ Design system foundation
- ✅ Base components (Avatar, Button, Dropdown)
- ✅ Healthcare-specific components
- ✅ Timeline visualization
- ✅ Medical status indicators
- ✅ Component documentation

### Phase 3 Planned
- [ ] Form components (Input, Select, Textarea)
- [ ] Layout components (Shell, Header, Sidebar)
- [ ] Data visualization components
- [ ] Advanced medical patterns
- [ ] Storybook integration
- [ ] Testing utilities

## 📄 License

MIT License - Built for healthcare applications with patient data privacy in mind.