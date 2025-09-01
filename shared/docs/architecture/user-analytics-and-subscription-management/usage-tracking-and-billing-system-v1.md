# Usage Tracking and Subscription Management System v1

Date Created: 31/08/2025

## Overview

Comprehensive system for tracking user file uploads, processing usage, and enabling freemium subscription tiers. Designed for early adopter analytics and future monetization through usage-based billing.

## Business Goals

### **Phase 1: Analytics & Data Collection**
- Track early adopter usage patterns
- Understand file upload volume and processing demands
- Collect data on user behavior and engagement
- Build foundation for future billing system

### **Phase 2: Freemium Model (Future)**
- Free tier with usage limits
- Paid tiers with increased capacity
- Usage-based billing integration
- Subscription management

## Current V3 Database State

**❌ No existing usage tracking infrastructure**
- `shell_files` table tracks individual uploads but no aggregated usage metrics
- No billing or subscription tables
- No usage limits or tracking functions
- Perfect clean slate for implementation

### Current shell_files Table Structure
```sql
CREATE TABLE shell_files (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL,  -- For user isolation
    filename TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    status TEXT DEFAULT 'uploaded',
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Proposed System Architecture

### **1. Core Usage Tracking Table**

```sql
CREATE TABLE user_usage_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    
    -- Billing Period
    billing_cycle_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW()),
    billing_cycle_end TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', NOW()) + interval '1 month'),
    
    -- File Upload Metrics
    shell_files_uploaded INTEGER DEFAULT 0,
    total_pages_processed INTEGER DEFAULT 0,
    total_file_size_mb NUMERIC(10,2) DEFAULT 0,
    
    -- AI Processing Metrics
    ai_tokens_used INTEGER DEFAULT 0,
    ai_processing_jobs INTEGER DEFAULT 0,
    ai_processing_minutes INTEGER DEFAULT 0,
    
    -- Storage Metrics
    storage_used_mb NUMERIC(10,2) DEFAULT 0,
    
    -- Plan Configuration
    plan_type TEXT DEFAULT 'free' CHECK (plan_type IN ('free', 'basic', 'premium', 'enterprise')),
    
    -- Usage Limits (Dynamic based on plan_type)
    shell_files_limit INTEGER DEFAULT 10,        -- Free: 10 files/month
    pages_limit INTEGER DEFAULT 100,             -- Free: 100 pages/month  
    ai_tokens_limit INTEGER DEFAULT 50000,       -- Free: 50K tokens/month
    storage_limit_mb INTEGER DEFAULT 100,        -- Free: 100MB storage
    
    -- Status Flags
    is_over_limit BOOLEAN DEFAULT FALSE,
    upgrade_required BOOLEAN DEFAULT FALSE,
    warnings_sent INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one record per user per billing cycle
    UNIQUE(profile_id, billing_cycle_start)
);

-- Performance indexes
CREATE INDEX idx_user_usage_profile_cycle ON user_usage_tracking(profile_id, billing_cycle_start);
CREATE INDEX idx_user_usage_over_limit ON user_usage_tracking(profile_id) WHERE is_over_limit = TRUE;
```

### **2. Plan Configuration Table**

```sql
CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_type TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    
    -- Monthly Limits
    shell_files_limit INTEGER,        -- NULL = unlimited
    pages_limit INTEGER,              -- NULL = unlimited
    ai_tokens_limit INTEGER,          -- NULL = unlimited  
    storage_limit_mb INTEGER,         -- NULL = unlimited
    
    -- Pricing (in cents)
    monthly_price_cents INTEGER DEFAULT 0,
    
    -- Features
    features JSONB DEFAULT '[]',      -- ['priority_processing', 'advanced_ai', 'api_access']
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed data
INSERT INTO subscription_plans (plan_type, display_name, description, shell_files_limit, pages_limit, ai_tokens_limit, storage_limit_mb, monthly_price_cents, sort_order) VALUES
('free', 'Free', 'Perfect for getting started', 10, 100, 50000, 100, 0, 1),
('basic', 'Basic', 'For regular users', 100, 1000, 500000, 1000, 999, 2),  -- $9.99/month
('premium', 'Premium', 'For power users', 500, 5000, 2500000, 5000, 2999, 3), -- $29.99/month
('enterprise', 'Enterprise', 'Unlimited usage', NULL, NULL, NULL, NULL, 9999, 4); -- $99.99/month
```

### **3. Usage Events Tracking (Detailed Analytics)**

```sql
CREATE TABLE usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    
    -- Event Details
    event_type TEXT NOT NULL CHECK (event_type IN (
        'file_uploaded', 'file_processed', 'ai_processing_started', 'ai_processing_completed',
        'page_extracted', 'storage_used', 'plan_upgraded', 'plan_downgraded', 'limit_hit'
    )),
    
    -- Metrics (flexible JSONB for different event types)
    metrics JSONB DEFAULT '{}', -- { "file_size_mb": 2.5, "pages": 10, "tokens_used": 1500 }
    
    -- References
    shell_file_id UUID REFERENCES shell_files(id),
    job_id UUID,  -- References job_queue when implemented
    
    -- Metadata
    user_agent TEXT,
    ip_address INET,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX idx_usage_events_profile_type ON usage_events(profile_id, event_type, created_at);
CREATE INDEX idx_usage_events_created_at ON usage_events(created_at);
```

## Core Functions

### **1. File Upload Usage Tracking**

```sql
CREATE OR REPLACE FUNCTION track_file_upload_usage(
    p_profile_id UUID,
    p_shell_file_id UUID,
    p_file_size_bytes BIGINT,
    p_estimated_pages INTEGER DEFAULT 1
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    usage_record RECORD;
    file_size_mb NUMERIC(10,2);
    limits_exceeded BOOLEAN := FALSE;
BEGIN
    file_size_mb := p_file_size_bytes::NUMERIC / 1048576; -- Convert bytes to MB
    
    -- Create or get current month usage record
    INSERT INTO user_usage_tracking (profile_id, billing_cycle_start, billing_cycle_end)
    VALUES (
        p_profile_id, 
        date_trunc('month', NOW()), 
        date_trunc('month', NOW()) + interval '1 month'
    )
    ON CONFLICT (profile_id, billing_cycle_start) DO NOTHING;
    
    -- Increment usage counters
    UPDATE user_usage_tracking SET
        shell_files_uploaded = shell_files_uploaded + 1,
        total_pages_processed = total_pages_processed + p_estimated_pages,
        total_file_size_mb = total_file_size_mb + file_size_mb,
        storage_used_mb = storage_used_mb + file_size_mb,
        updated_at = NOW()
    WHERE profile_id = p_profile_id 
    AND billing_cycle_start = date_trunc('month', NOW())
    RETURNING * INTO usage_record;
    
    -- Check if limits exceeded
    limits_exceeded := usage_record.shell_files_uploaded > usage_record.shell_files_limit 
                    OR usage_record.total_pages_processed > usage_record.pages_limit
                    OR usage_record.storage_used_mb > usage_record.storage_limit_mb;
    
    -- Update limit status
    UPDATE user_usage_tracking SET
        is_over_limit = limits_exceeded,
        upgrade_required = limits_exceeded
    WHERE id = usage_record.id;
    
    -- Log usage event
    INSERT INTO usage_events (profile_id, event_type, metrics, shell_file_id)
    VALUES (p_profile_id, 'file_uploaded', 
        jsonb_build_object(
            'file_size_mb', file_size_mb,
            'estimated_pages', p_estimated_pages,
            'files_used', usage_record.shell_files_uploaded,
            'files_limit', usage_record.shell_files_limit
        ),
        p_shell_file_id
    );
    
    -- Return usage status for UI
    RETURN jsonb_build_object(
        'shell_files_used', usage_record.shell_files_uploaded,
        'shell_files_limit', usage_record.shell_files_limit,
        'pages_used', usage_record.total_pages_processed,
        'pages_limit', usage_record.pages_limit,
        'storage_used_mb', usage_record.storage_used_mb,
        'storage_limit_mb', usage_record.storage_limit_mb,
        'over_limit', limits_exceeded,
        'upgrade_required', limits_exceeded,
        'plan_type', usage_record.plan_type
    );
END;
$$;
```

### **2. AI Processing Usage Tracking**

```sql
CREATE OR REPLACE FUNCTION track_ai_processing_usage(
    p_profile_id UUID,
    p_job_id UUID,
    p_tokens_used INTEGER,
    p_processing_seconds INTEGER DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    usage_record RECORD;
    limits_exceeded BOOLEAN := FALSE;
BEGIN
    -- Increment AI usage counters
    UPDATE user_usage_tracking SET
        ai_tokens_used = ai_tokens_used + p_tokens_used,
        ai_processing_jobs = ai_processing_jobs + 1,
        ai_processing_minutes = ai_processing_minutes + (p_processing_seconds / 60),
        updated_at = NOW()
    WHERE profile_id = p_profile_id 
    AND billing_cycle_start = date_trunc('month', NOW())
    RETURNING * INTO usage_record;
    
    -- Check AI token limits
    limits_exceeded := usage_record.ai_tokens_used > usage_record.ai_tokens_limit;
    
    -- Update limit status if AI limits exceeded
    UPDATE user_usage_tracking SET
        is_over_limit = CASE WHEN limits_exceeded THEN TRUE ELSE is_over_limit END,
        upgrade_required = CASE WHEN limits_exceeded THEN TRUE ELSE upgrade_required END
    WHERE id = usage_record.id;
    
    -- Log AI processing event
    INSERT INTO usage_events (profile_id, event_type, metrics, job_id)
    VALUES (p_profile_id, 'ai_processing_completed',
        jsonb_build_object(
            'tokens_used', p_tokens_used,
            'processing_seconds', p_processing_seconds,
            'total_tokens_used', usage_record.ai_tokens_used,
            'tokens_limit', usage_record.ai_tokens_limit
        ),
        p_job_id
    );
    
    RETURN jsonb_build_object(
        'ai_tokens_used', usage_record.ai_tokens_used,
        'ai_tokens_limit', usage_record.ai_tokens_limit,
        'ai_processing_jobs', usage_record.ai_processing_jobs,
        'over_limit', limits_exceeded
    );
END;
$$;
```

### **3. Usage Status Check (For UI)**

```sql
CREATE OR REPLACE FUNCTION get_user_usage_status(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    usage_record RECORD;
    plan_record RECORD;
BEGIN
    -- Get current month usage
    SELECT * INTO usage_record
    FROM user_usage_tracking
    WHERE profile_id = p_profile_id
    AND billing_cycle_start = date_trunc('month', NOW());
    
    -- Create record if doesn't exist
    IF usage_record IS NULL THEN
        -- Get plan limits
        SELECT * INTO plan_record
        FROM subscription_plans 
        WHERE plan_type = 'free' AND is_active = TRUE;
        
        INSERT INTO user_usage_tracking (
            profile_id, plan_type,
            shell_files_limit, pages_limit, ai_tokens_limit, storage_limit_mb
        ) VALUES (
            p_profile_id, 'free',
            plan_record.shell_files_limit, plan_record.pages_limit, 
            plan_record.ai_tokens_limit, plan_record.storage_limit_mb
        ) RETURNING * INTO usage_record;
    END IF;
    
    RETURN jsonb_build_object(
        'current_period', jsonb_build_object(
            'start', usage_record.billing_cycle_start,
            'end', usage_record.billing_cycle_end
        ),
        'usage', jsonb_build_object(
            'shell_files', jsonb_build_object(
                'used', usage_record.shell_files_uploaded,
                'limit', usage_record.shell_files_limit,
                'percentage', ROUND((usage_record.shell_files_uploaded::NUMERIC / NULLIF(usage_record.shell_files_limit, 0)) * 100, 1)
            ),
            'pages', jsonb_build_object(
                'used', usage_record.total_pages_processed,
                'limit', usage_record.pages_limit,
                'percentage', ROUND((usage_record.total_pages_processed::NUMERIC / NULLIF(usage_record.pages_limit, 0)) * 100, 1)
            ),
            'ai_tokens', jsonb_build_object(
                'used', usage_record.ai_tokens_used,
                'limit', usage_record.ai_tokens_limit,
                'percentage', ROUND((usage_record.ai_tokens_used::NUMERIC / NULLIF(usage_record.ai_tokens_limit, 0)) * 100, 1)
            ),
            'storage', jsonb_build_object(
                'used_mb', usage_record.storage_used_mb,
                'limit_mb', usage_record.storage_limit_mb,
                'percentage', ROUND((usage_record.storage_used_mb::NUMERIC / NULLIF(usage_record.storage_limit_mb, 0)) * 100, 1)
            )
        ),
        'status', jsonb_build_object(
            'plan_type', usage_record.plan_type,
            'over_limit', usage_record.is_over_limit,
            'upgrade_required', usage_record.upgrade_required
        )
    );
END;
$$;
```

## Integration Points

### **1. File Upload Flow Integration**

```typescript
// In file upload API/Edge Function
const uploadResult = await supabase.storage
  .from('medical-docs')
  .upload(filePath, file);

if (uploadResult.error) throw uploadResult.error;

// Track usage immediately after successful upload
const usageResult = await supabase.rpc('track_file_upload_usage', {
  p_profile_id: currentProfile.id,
  p_shell_file_id: shellFile.id,
  p_file_size_bytes: file.size,
  p_estimated_pages: estimatedPages
});

// Check if user hit limits
if (usageResult.over_limit) {
  return {
    success: true,
    file_uploaded: true,
    upgrade_required: true,
    usage_status: usageResult
  };
}
```

### **2. Job Queue Integration (V4 Plan)**

```sql
-- In enqueue_job_v3 function, add usage pre-check
CREATE OR REPLACE FUNCTION enqueue_job_v3(...)
AS $$
DECLARE
    usage_status JSONB;
BEGIN
    -- Check usage limits before creating job
    SELECT get_user_usage_status(get_profile_id_from_patient_id(patient_id)) INTO usage_status;
    
    IF (usage_status->'status'->>'over_limit')::BOOLEAN THEN
        RAISE EXCEPTION 'Usage limit exceeded. Upgrade required to continue processing.';
    END IF;
    
    -- Proceed with job creation...
END;
$$;
```

### **3. Render Worker Integration**

```python
# In Render worker after successful AI processing
async def complete_ai_processing(job_id, patient_id, tokens_used, processing_seconds):
    profile_id = await get_profile_id_from_patient_id(patient_id)
    
    # Track AI usage
    usage_result = await supabase.rpc('track_ai_processing_usage', {
        'p_profile_id': profile_id,
        'p_job_id': job_id,
        'p_tokens_used': tokens_used,
        'p_processing_seconds': processing_seconds
    })
    
    logger.info(f"AI usage tracked: {usage_result}")
```

## Frontend Components

### **1. Usage Dashboard Component**

```typescript
// components/UsageDashboard.tsx
export function UsageDashboard() {
  const { currentProfile } = useProfile();
  const [usageStatus, setUsageStatus] = useState(null);
  
  useEffect(() => {
    const fetchUsage = async () => {
      const { data } = await supabase.rpc('get_user_usage_status', {
        p_profile_id: currentProfile.id
      });
      setUsageStatus(data);
    };
    
    fetchUsage();
  }, [currentProfile.id]);
  
  if (!usageStatus) return <LoadingSpinner />;
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <UsageMetric
        label="Files Uploaded"
        used={usageStatus.usage.shell_files.used}
        limit={usageStatus.usage.shell_files.limit}
        percentage={usageStatus.usage.shell_files.percentage}
        icon={<FileIcon />}
        color="blue"
      />
      
      <UsageMetric
        label="Pages Processed"
        used={usageStatus.usage.pages.used}
        limit={usageStatus.usage.pages.limit}
        percentage={usageStatus.usage.pages.percentage}
        icon={<DocumentIcon />}
        color="green"
      />
      
      <UsageMetric
        label="AI Processing"
        used={usageStatus.usage.ai_tokens.used}
        limit={usageStatus.usage.ai_tokens.limit}
        percentage={usageStatus.usage.ai_tokens.percentage}
        icon={<BrainIcon />}
        color="purple"
        formatter={(value) => `${(value / 1000).toFixed(1)}K tokens`}
      />
      
      <UsageMetric
        label="Storage"
        used={Math.round(usageStatus.usage.storage.used_mb)}
        limit={usageStatus.usage.storage.limit_mb}
        percentage={usageStatus.usage.storage.percentage}
        icon={<DatabaseIcon />}
        color="orange"
        formatter={(value) => `${value} MB`}
      />
    </div>
  );
}
```

### **2. Upload Limit Check Component**

```typescript
// components/UploadLimitCheck.tsx
export function UploadLimitCheck({ onCanUpload, onUpgradeRequired }) {
  const { currentProfile } = useProfile();
  
  const checkUploadLimits = async () => {
    const { data: usageStatus } = await supabase.rpc('get_user_usage_status', {
      p_profile_id: currentProfile.id
    });
    
    if (usageStatus.status.over_limit) {
      onUpgradeRequired(usageStatus);
      return false;
    }
    
    // Show warning if close to limits (>80%)
    const maxPercentage = Math.max(
      usageStatus.usage.shell_files.percentage,
      usageStatus.usage.pages.percentage,
      usageStatus.usage.storage.percentage
    );
    
    if (maxPercentage > 80) {
      return (
        <UsageWarning 
          usageStatus={usageStatus}
          onContinue={() => onCanUpload(true)}
        />
      );
    }
    
    onCanUpload(true);
    return true;
  };
  
  return <button onClick={checkUploadLimits}>Check Upload Limits</button>;
}
```

### **3. Upgrade Prompt Component**

```typescript
// components/UpgradePrompt.tsx
export function UpgradePrompt({ usageStatus, onClose }) {
  const router = useRouter();
  
  const handleUpgrade = (planType: string) => {
    router.push(`/billing/upgrade?plan=${planType}`);
  };
  
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upgrade Required</DialogTitle>
          <DialogDescription>
            You've reached your monthly usage limits. Upgrade to continue using the app.
          </DialogDescription>
        </DialogHeader>
        
        <UsageProgressBars usageStatus={usageStatus} />
        
        <div className="grid grid-cols-2 gap-4 mt-4">
          <Button 
            onClick={() => handleUpgrade('basic')}
            variant="outline"
          >
            Basic Plan - $9.99/mo
          </Button>
          <Button 
            onClick={() => handleUpgrade('premium')}
          >
            Premium Plan - $29.99/mo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

## Analytics and Reporting

### **1. User Behavior Analytics Queries**

```sql
-- Most active users by file uploads
SELECT 
    p.display_name,
    p.email,
    u.shell_files_uploaded,
    u.total_pages_processed,
    u.ai_tokens_used,
    u.plan_type
FROM user_usage_tracking u
JOIN user_profiles p ON p.id = u.profile_id
WHERE u.billing_cycle_start = date_trunc('month', NOW())
ORDER BY u.shell_files_uploaded DESC
LIMIT 20;

-- Usage distribution by plan type
SELECT 
    plan_type,
    COUNT(*) as users,
    AVG(shell_files_uploaded) as avg_files,
    AVG(ai_tokens_used) as avg_tokens,
    COUNT(*) FILTER (WHERE is_over_limit) as users_over_limit
FROM user_usage_tracking
WHERE billing_cycle_start = date_trunc('month', NOW())
GROUP BY plan_type
ORDER BY plan_type;

-- Daily usage trends
SELECT 
    DATE(created_at) as date,
    COUNT(*) FILTER (WHERE event_type = 'file_uploaded') as files_uploaded,
    COUNT(*) FILTER (WHERE event_type = 'ai_processing_completed') as ai_jobs,
    SUM((metrics->>'tokens_used')::INTEGER) FILTER (WHERE event_type = 'ai_processing_completed') as total_tokens
FROM usage_events
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date;
```

### **2. Revenue Projection Queries**

```sql
-- Users likely to upgrade (>80% usage)
SELECT 
    u.profile_id,
    p.email,
    u.shell_files_uploaded,
    u.shell_files_limit,
    ROUND((u.shell_files_uploaded::NUMERIC / u.shell_files_limit) * 100, 1) as files_usage_pct,
    u.plan_type
FROM user_usage_tracking u
JOIN user_profiles p ON p.id = u.profile_id
WHERE u.billing_cycle_start = date_trunc('month', NOW())
AND u.plan_type = 'free'
AND (
    (u.shell_files_uploaded::NUMERIC / NULLIF(u.shell_files_limit, 0)) > 0.8 OR
    (u.total_pages_processed::NUMERIC / NULLIF(u.pages_limit, 0)) > 0.8 OR
    (u.ai_tokens_used::NUMERIC / NULLIF(u.ai_tokens_limit, 0)) > 0.8
)
ORDER BY files_usage_pct DESC;

-- Potential revenue from upgrades
SELECT 
    'Basic' as plan,
    COUNT(*) as eligible_users,
    COUNT(*) * 999 as potential_monthly_revenue_cents
FROM user_usage_tracking
WHERE plan_type = 'free' 
AND is_over_limit = TRUE
AND billing_cycle_start = date_trunc('month', NOW());
```

## Implementation Plan

### **Phase 1: Core Analytics (This Week)**
- [ ] Create usage tracking tables and functions
- [ ] Add usage tracking to file upload flow
- [ ] Build basic usage dashboard UI
- [ ] Add analytics queries for early adopter insights

### **Phase 2: Subscription Infrastructure (Future)**
- [ ] Add subscription management tables
- [ ] Integrate with Stripe/payment processor
- [ ] Build upgrade flow UI
- [ ] Add plan management

### **Phase 3: Advanced Features (Future)**
- [ ] Usage-based billing
- [ ] Plan downgrades/upgrades
- [ ] Usage alerts and notifications
- [ ] API access tracking

## Feature Flags

All billing-related features should be behind feature flags for gradual rollout:

```sql
-- Add to system_configuration
INSERT INTO system_configuration (config_key, config_value, config_type, description, is_sensitive) VALUES
('features.usage_tracking_enabled', 'true', 'boolean', 'Enable usage tracking and analytics', false),
('features.billing_enabled', 'false', 'boolean', 'Enable subscription billing features', false),
('features.upgrade_prompts_enabled', 'false', 'boolean', 'Show upgrade prompts when limits exceeded', false);
```

```typescript
// In frontend
const { data: config } = await supabase
  .from('system_configuration')
  .select('config_key, config_value')
  .in('config_key', ['features.billing_enabled', 'features.upgrade_prompts_enabled']);

const billingEnabled = config.find(c => c.config_key === 'features.billing_enabled')?.config_value === 'true';
```

## Security Considerations

1. **RLS Policies**: All usage tracking tables must have RLS enabled with profile-based access
2. **Data Privacy**: Usage analytics must respect user privacy preferences  
3. **PII Protection**: No sensitive medical data in usage tracking tables
4. **Audit Trail**: All billing changes must be logged to audit table
5. **Rate Limiting**: Prevent abuse of usage tracking functions

## Success Metrics

### **Analytics Metrics (Phase 1)**
- Daily/weekly/monthly active users
- Average files uploaded per user
- Processing success rates
- User retention rates
- Feature usage patterns

### **Business Metrics (Phase 2)**
- Conversion rate from free to paid
- Revenue per user
- Plan upgrade/downgrade rates
- Usage limit hit rates
- Customer lifetime value