# Provider Portal Consumer Guide

**Purpose:** Database integration guide for healthcare provider portal development  
**Target:** Backend/Frontend developers building provider-facing features  
**Reference:** [Provider Portal Architecture](../features/provider-portal.md)

---

## Overview

This guide outlines database access patterns for healthcare providers accessing patient data through Guardian's provider portal, with emphasis on proper access control and compliance.

## Provider Portal → Database Mapping

### Provider Authentication & Registry

```yaml
provider_authentication:
  database_tables: ["healthcare_providers", "provider_credentials"]
  features:
    - NPI-based provider verification
    - Credential validation and renewal tracking
    - Multi-organization provider support
  access_patterns:
    - Provider lookup by NPI number
    - Organization-based provider lists
    - Specialty and credential filtering

provider_registry:
  database_tables: ["healthcare_providers", "healthcare_organizations"]
  api_endpoints: ["/api/providers/registry", "/api/providers/search"]
  features:
    - Universal provider directory
    - Provider-patient relationship mapping
    - Cross-organization provider coordination
```

### Patient Access Control

```yaml
patient_access_permissions:
  database_tables: ["provider_access_permissions", "user_profiles"]
  access_control_levels:
    full_access: "Complete clinical record access"
    limited_access: "Specific encounter or date range only"
    emergency_access: "Break-glass emergency access with audit trail"
    family_coordinator: "Access to family member profiles with consent"
  
patient_consent_management:
  database_tables: ["enhanced_consent", "consent_audit_logs"]
  features:
    - Granular consent per provider
    - Family member consent coordination
    - Consent withdrawal and expiration
  compliance: "GDPR Article 7, HIPAA 164.508"
```

### Clinical Data Access

```yaml
clinical_record_access:
  database_tables: ["patient_clinical_events", "patient_observations", "patient_interventions"]
  provider_views:
    clinical_summary: "Latest results and active conditions"
    encounter_history: "Provider-specific visit history"
    medication_list: "Current and historical medications"
    allergy_alerts: "Critical safety information"
  
family_healthcare_coordination:
  database_tables: ["user_profiles", "healthcare_timeline_events"]
  features:
    - Multi-profile family view for pediatricians
    - Parent/guardian access to child records
    - Family appointment coordination
    - Cross-profile health trend analysis
```

## Provider Access Patterns

### Multi-Profile Family Practice

```typescript
// Provider accessing family healthcare data
interface FamilyHealthcareView {
  primary_patient: UserProfile;
  family_members: UserProfile[];
  shared_providers: HealthcareProvider[];
  family_health_summary: FamilyHealthMetrics;
}

class FamilyPracticeService {
  async getFamilyView(
    providerId: string, 
    primaryPatientId: string
  ): Promise<FamilyHealthcareView> {
    
    // Verify provider access to primary patient
    await this.verifyProviderAccess(providerId, primaryPatientId);
    
    // Get primary patient profile
    const primaryProfile = await this.getPatientProfile(primaryPatientId);
    
    // Get accessible family members (with consent)
    const familyMembers = await this.getAccessibleFamilyMembers(
      providerId, 
      primaryProfile.account_owner_id
    );
    
    // Get shared providers across family
    const sharedProviders = await this.getSharedProviders(
      [primaryPatientId, ...familyMembers.map(m => m.id)]
    );
    
    return {
      primary_patient: primaryProfile,
      family_members: familyMembers,
      shared_providers: sharedProviders,
      family_health_summary: await this.calculateFamilyMetrics(
        [primaryProfile, ...familyMembers]
      )
    };
  }
}
```

### Provider-Specific Clinical Views

```sql
-- Provider-specific clinical event access
CREATE VIEW provider_clinical_access AS
SELECT 
    pce.*,
    pap.access_level,
    pap.access_start_date,
    pap.access_end_date,
    hp.provider_name,
    hp.specialty
FROM patient_clinical_events pce
JOIN provider_access_permissions pap 
    ON pce.patient_id = pap.patient_id
JOIN healthcare_providers hp 
    ON pap.provider_id = hp.id
WHERE 
    pap.active = true
    AND (pap.access_end_date IS NULL OR pap.access_end_date > NOW())
    AND pce.archived = false;

-- Family coordination view for pediatric providers
CREATE VIEW pediatric_family_view AS
SELECT 
    up.id as child_profile_id,
    up.display_name as child_name,
    up.date_of_birth,
    parent_profile.display_name as parent_name,
    pce.event_name,
    pce.event_date,
    pce.activity_type
FROM user_profiles up
JOIN user_profiles parent_profile 
    ON up.account_owner_id = parent_profile.account_owner_id 
    AND parent_profile.profile_type = 'self'
JOIN patient_clinical_events pce 
    ON up.id = pce.patient_id
WHERE 
    up.profile_type = 'child'
    AND EXISTS (
        SELECT 1 FROM provider_access_permissions pap
        JOIN healthcare_providers hp ON pap.provider_id = hp.id
        WHERE pap.patient_id = up.id 
        AND hp.specialty ILIKE '%pediatric%'
        AND pap.active = true
    );
```

### Emergency Access Patterns

```typescript
// Break-glass emergency access with audit trail
class EmergencyAccessService {
  async requestEmergencyAccess(
    providerId: string,
    patientId: string,
    emergencyReason: string
  ): Promise<EmergencyAccessGrant> {
    
    // Verify provider credentials
    const provider = await this.verifyProvider(providerId);
    
    // Create emergency access grant
    const accessGrant = await supabase
      .from('emergency_access_grants')
      .insert({
        provider_id: providerId,
        patient_id: patientId,
        emergency_reason: emergencyReason,
        access_level: 'emergency',
        granted_at: new Date(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        requires_review: true
      })
      .select()
      .single();
    
    // Audit emergency access
    await this.auditEmergencyAccess({
      provider_id: providerId,
      patient_id: patientId,
      access_type: 'EMERGENCY_BREAK_GLASS',
      justification: emergencyReason,
      granted_by_system: true
    });
    
    // Notify patient of emergency access
    await this.notifyPatientEmergencyAccess(patientId, provider, emergencyReason);
    
    return accessGrant;
  }
  
  async getEmergencyPatientData(
    accessGrantId: string
  ): Promise<EmergencyPatientView> {
    
    // Verify active emergency grant
    const grant = await this.verifyEmergencyGrant(accessGrantId);
    
    // Get essential clinical data for emergency care
    return {
      patient_demographics: await this.getPatientDemographics(grant.patient_id),
      active_medications: await this.getActiveMedications(grant.patient_id),
      known_allergies: await this.getKnownAllergies(grant.patient_id),
      recent_clinical_events: await this.getRecentEvents(grant.patient_id, 30), // 30 days
      emergency_contacts: await this.getEmergencyContacts(grant.patient_id),
      critical_conditions: await this.getCriticalConditions(grant.patient_id)
    };
  }
}
```

## Provider Portal UI Integration

### Multi-Patient Dashboard

```typescript
// Provider dashboard with family coordination
function ProviderDashboard() {
  const { provider } = useProviderAuth();
  const { data: patients } = useSWR(
    `/api/provider/patients?provider_id=${provider.id}`,
    fetcher
  );
  
  // Group patients by family
  const familyGroups = useMemo(() => {
    return patients?.reduce((groups, patient) => {
      const familyId = patient.account_owner_id;
      if (!groups[familyId]) {
        groups[familyId] = [];
      }
      groups[familyId].push(patient);
      return groups;
    }, {} as Record<string, UserProfile[]>);
  }, [patients]);
  
  return (
    <div className="provider-dashboard">
      {Object.entries(familyGroups || {}).map(([familyId, family]) => (
        <FamilyHealthCard 
          key={familyId}
          family={family}
          providerId={provider.id}
        />
      ))}
    </div>
  );
}

// Family health coordination card
function FamilyHealthCard({ 
  family, 
  providerId 
}: { 
  family: UserProfile[]; 
  providerId: string; 
}) {
  const primaryPatient = family.find(p => p.profile_type === 'self');
  const dependents = family.filter(p => p.profile_type !== 'self');
  
  return (
    <Card className="family-health-card">
      <CardHeader>
        <h3>{primaryPatient?.display_name} Family</h3>
        <Badge>{family.length} members</Badge>
      </CardHeader>
      
      <CardContent>
        {family.map(patient => (
          <PatientSummaryRow 
            key={patient.id}
            patient={patient}
            providerId={providerId}
          />
        ))}
      </CardContent>
      
      <CardActions>
        <Button onClick={() => coordinateFamilyAppointment(family)}>
          Schedule Family Visit
        </Button>
      </CardActions>
    </Card>
  );
}
```

### Clinical Record Access

```typescript
// Provider clinical record access with audit
function PatientClinicalRecord({ 
  patientId, 
  providerId 
}: { 
  patientId: string; 
  providerId: string; 
}) {
  
  // Verify and audit access
  useEffect(() => {
    auditPatientAccess({
      provider_id: providerId,
      patient_id: patientId,
      access_type: 'CLINICAL_RECORD_VIEW',
      access_timestamp: new Date()
    });
  }, [patientId, providerId]);
  
  const { data: clinicalEvents, loading } = useSWR(
    `/api/provider/clinical-records?patient_id=${patientId}&provider_id=${providerId}`,
    fetcher
  );
  
  if (loading) return <ClinicalRecordSkeleton />;
  
  return (
    <div className="clinical-record">
      <PatientHeader patientId={patientId} />
      
      {/* Critical safety information always visible */}
      <CriticalAlertsSection patientId={patientId} />
      
      {/* Provider-specific clinical timeline */}
      <ProviderClinicalTimeline 
        events={clinicalEvents}
        providerId={providerId}
      />
      
      {/* Family context for pediatric/family providers */}
      <FamilyHealthContext 
        patientId={patientId}
        providerId={providerId}
      />
    </div>
  );
}
```

## Compliance & Security

### Audit Logging

```typescript
// Comprehensive provider access audit
interface ProviderAccessAudit {
  provider_id: string;
  patient_id: string;
  access_type: 'RECORD_VIEW' | 'RECORD_EXPORT' | 'FAMILY_COORDINATION' | 'EMERGENCY_ACCESS';
  access_timestamp: Date;
  session_id: string;
  ip_address: string;
  user_agent: string;
  data_accessed: string[]; // Array of accessed data types
  purpose_of_use: string;
}

async function auditProviderAccess(audit: ProviderAccessAudit) {
  await supabase
    .from('provider_access_audit')
    .insert({
      ...audit,
      audit_id: crypto.randomUUID(),
      compliance_flags: await calculateComplianceFlags(audit)
    });
  
  // Real-time compliance monitoring
  if (audit.access_type === 'EMERGENCY_ACCESS') {
    await triggerComplianceReview(audit);
  }
}
```

### Data Minimization

```sql
-- Provider-specific data views (data minimization principle)
CREATE VIEW provider_essential_patient_data AS
SELECT 
    up.id,
    up.display_name,
    up.date_of_birth,
    up.profile_type,
    -- Only include clinical data relevant to provider's specialty
    CASE 
        WHEN hp.specialty ILIKE '%pediatric%' 
        THEN jsonb_build_object(
            'growth_data', pce.event_name,
            'immunizations', pce.activity_type
        )
        WHEN hp.specialty ILIKE '%cardio%'
        THEN jsonb_build_object(
            'cardiac_events', pce.event_name,
            'medications', pi.substance_name
        )
        ELSE jsonb_build_object(
            'general_events', pce.event_name
        )
    END as specialty_relevant_data
FROM user_profiles up
JOIN provider_access_permissions pap ON up.id = pap.patient_id
JOIN healthcare_providers hp ON pap.provider_id = hp.id
LEFT JOIN patient_clinical_events pce ON up.id = pce.patient_id
LEFT JOIN patient_interventions pi ON pce.id = pi.clinical_event_id
WHERE pap.active = true;
```

### Consent Management

```typescript
// Granular consent management for provider access
interface ProviderConsent {
  patient_id: string;
  provider_id: string;
  consent_type: 'FULL_RECORD' | 'SPECIFIC_CONDITIONS' | 'FAMILY_COORDINATION' | 'EMERGENCY_ONLY';
  data_categories: string[]; // ['medications', 'lab_results', 'imaging']
  purpose_limitation: string;
  retention_period: number; // days
  consent_method: 'ELECTRONIC' | 'WRITTEN' | 'VERBAL_WITNESSED';
  witness_signature?: string;
  expiration_date?: Date;
}

class ProviderConsentService {
  async requestPatientConsent(
    patientId: string,
    providerId: string,
    consentRequest: Partial<ProviderConsent>
  ): Promise<ConsentRequest> {
    
    // Create consent request
    const request = await supabase
      .from('provider_consent_requests')
      .insert({
        patient_id: patientId,
        provider_id: providerId,
        ...consentRequest,
        status: 'PENDING',
        requested_at: new Date()
      })
      .select()
      .single();
    
    // Notify patient of consent request
    await this.notifyPatientConsentRequest(patientId, providerId, request);
    
    return request;
  }
  
  async processConsentResponse(
    requestId: string,
    approved: boolean,
    patientSignature?: string
  ): Promise<void> {
    
    if (approved) {
      // Grant provider access based on consent terms
      await this.grantProviderAccess(requestId, patientSignature);
    }
    
    // Update consent request status
    await supabase
      .from('provider_consent_requests')
      .update({
        status: approved ? 'APPROVED' : 'DENIED',
        processed_at: new Date(),
        patient_signature: patientSignature
      })
      .eq('id', requestId);
  }
}
```

## Testing & Validation

### Provider Access Testing

```typescript
// Test provider access controls
describe('Provider Portal Access Control', () => {
  test('provider can only access patients with active consent', async () => {
    const provider = await createTestProvider();
    const patient = await createTestPatient();
    
    // No consent granted yet
    await expect(
      getPatientData(patient.id, provider.id)
    ).rejects.toThrow('Unauthorized access');
    
    // Grant consent
    await grantProviderAccess(patient.id, provider.id, {
      access_level: 'full_access',
      expiration_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    
    // Should now have access
    const data = await getPatientData(patient.id, provider.id);
    expect(data).toBeDefined();
    expect(data.patient_id).toBe(patient.id);
  });
  
  test('emergency access creates proper audit trail', async () => {
    const provider = await createTestProvider();
    const patient = await createTestPatient();
    
    // Request emergency access
    await requestEmergencyAccess(provider.id, patient.id, 'Cardiac emergency');
    
    // Verify audit entry
    const auditEntry = await getAuditEntry(provider.id, patient.id, 'EMERGENCY_ACCESS');
    expect(auditEntry).toBeDefined();
    expect(auditEntry.emergency_reason).toBe('Cardiac emergency');
    expect(auditEntry.requires_review).toBe(true);
  });
});
```

### Family Coordination Testing

```typescript
// Test family healthcare coordination
test('pediatric provider can access child profiles with parental consent', async () => {
  const family = await createTestFamily(); // Parent + 2 children
  const pediatricProvider = await createTestProvider({ specialty: 'pediatric' });
  
  // Parent grants consent for children's records
  await grantProviderAccess(family.children[0].id, pediatricProvider.id, {
    access_level: 'full_access',
    granted_by: family.parent.id // Parent consent
  });
  
  // Provider should access child data
  const familyView = await getFamilyView(pediatricProvider.id, family.parent.id);
  expect(familyView.family_members).toHaveLength(2);
  expect(familyView.family_members[0].profile_type).toBe('child');
});
```

---

*This guide ensures compliant, secure, and efficient provider portal integration with Guardian's clinical database foundation.*