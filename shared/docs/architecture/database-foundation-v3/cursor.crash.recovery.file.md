Im just a bit overwhelmed, we've got his recent idea and plan 
  shared/docs/architecture/user-analytics-and-subscription-management/usage-tracking-and-billing-system-v1.md which is sort of
   one piece of this larger plan shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md which is 
  again part of this larger plan shared/docs/architecture/database-foundation-v3/V3_FRESH_START_BLUEPRINT.md which is the 
  overall blurprint for the freshstart clean slate V3 backend build out... So you can see how im a bit overhwelmed and not 
  sure where to focus. What are you thoughts and recommendations. Obviously we work on 
  shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md as that is where we are up to in the 
  shared/docs/architecture/database-foundation-v3/V3_FRESH_START_BLUEPRINT.md ... but where best does this new usage analutics
   piece best fit into all of this? should we utitlize the fact that are currently building out the backend functions and 
  tables and so fold in the user analtics along with it, or do we do it another time and forsake the efficiency gains of doing
   it all together

⏺ You're absolutely right to feel overwhelmed - we have 3 layers of planning that need to be properly sequenced. Let me help
   clarify the priority and integration strategy.

  Current Planning Hierarchy:

  1. V3_FRESH_START_BLUEPRINT.md - Master plan (overall V3 architecture)
  2. v3-phase2-implementation-plan-v4.md - Current focus (job coordination + API rate limiting)
  3. usage-tracking-and-billing-system-v1.md - New idea (analytics + billing)

  Strategic Recommendation: Integrate Now

  ✅ YES - Fold usage analytics into v4 implementation

  Why integrate now:
  - Efficiency: You're already creating tables/functions - add 3 more tables while you're at it
  - Foundation: Usage tracking needs to be there from Day 1 of user activity
  - Clean Architecture: Better to build it properly from the start than retrofit later
  - Single Deployment: One migration, one testing cycle, one rollout

  ❌ Don't delay to later

  - Data Loss: Every day without tracking = lost early adopter insights
  - Retrofit Complexity: Adding usage tracking to existing uploads is messier
  - Missed Opportunities: Can't understand user behavior without data

  Integration Strategy: Update v4 Plan

  Add Section 7 to v4-phase2-implementation-plan-v4.md:

  ## 7. User Analytics Infrastructure (New Addition)

  ### 7a. Analytics Tables (Add to 08_job_coordination.sql)
  - user_usage_tracking - Monthly usage aggregates
  - subscription_plans - Plan configuration
  - usage_events - Detailed event logging

  ### 7b. Analytics Functions
  - track_file_upload_usage() - Called from shell_files creation
  - track_ai_processing_usage() - Called from Render workers
  - get_user_usage_status() - For frontend dashboard

  ### 7c. Integration Points
  - Shell file upload: Add usage tracking call
  - Job completion: Add AI usage tracking call
  - Feature flags: Keep billing features disabled initially

  Deployment Sequence (Updated):

  1. V3 Core Schema (01-07.sql) - ✅ Ready
  2. Job Coordination + Analytics (08_job_coordination.sql) - Updated to include both
  3. Functions + RPCs - All job functions + analytics functions together
  4. Frontend - Job UI + usage dashboard together

  Practical Implementation Plan:

  This Week Focus:

  1. Finish v4 job coordination system (80% complete)
  2. Add analytics tables to 08_job_coordination.sql (20% additional work)
  3. Add usage tracking to upload flow (30 minutes integration)
  4. Build basic usage dashboard (2 hours)

  Why This Sequence Works:

  - Job system handles the complex AI processing coordination
  - Analytics system tracks what the job system does
  - Single codebase deployment with both features
  - Feature flags let you enable analytics immediately, billing later

  Updated v4 Plan Structure:

  v3-phase2-implementation-plan-v4.md:
  ├── 1-5. Job Coordination (Current focus)
  ├── 6. Deploy DDL (08_job_coordination.sql)
  ├── 7. User Analytics Infrastructure (NEW)
  ├── 8. Frontend Integration (Jobs + Analytics)
  └── 9. Validation & Rollout

  Bottom Line Recommendation:

  Integrate usage analytics into v4 implementation now:

  ✅ Pros:
  - Efficient single deployment
  - Complete backend foundation
  - Early adopter data from Day 1
  - Clean architecture from start

  ❌ Cons:
  - Slightly more complex deployment
  - Additional testing required

  The efficiency gains and architectural cleanliness far outweigh the complexity cost.

  Action Plan:
  1. I'll update the v4 plan to include analytics as Section 7
  2. Merge the analytics DDL into 08_job_coordination.sql
  3. Add integration points to job functions
  4. Keep billing features behind feature flags

  This gives you one cohesive backend upgrade that handles both job coordination AND user analytics. Much cleaner than doing
   two separate deployments.

  Want me to update the v4 plan document to integrate the analytics system?

> proceed. Before you do tho make sure you open and read every line fo the file so that everything that needs to be udpated is
   updated, adn updated in the right way

⏺ Read(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Read 1364 lines (ctrl+r to expand)

⏺ Now I need to fully understand the current v4 plan structure and integrate the usage analytics system properly. Let me
  analyze the key sections that need updating:

⏺ Update(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Updated shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md with 2 additions    
       19    - ✅ **Schema Verified:** All table references validated against actual V3 SQL files
       20    - ✅ **Technical Issues Resolved:** All production risks eliminated with proper security and consistency
       21    - ✅ **API Rate Limiting:** Comprehensive framework for 1000+ concurrent processing
       22 +  - ✅ **User Analytics Integration:** Usage tracking and subscription management foundation
       23    
       24    **Critical Success Factors:**
       25    1. Render.com worker services with API rate limiting for long-running OCR/AI processing
     ...
       26    3. V3-native Edge Functions built specifically for existing `shell_files` schema
       27    4. Vendor-agnostic rate limiting framework with backpressure management
       28    5. Production-ready security with service-role isolation and proper RPC permissions
       29 +  6. User analytics infrastructure for early adopter insights and future billing capability
       30    
       31    ---
       32    

⏺ Update(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Error editing file

⏺ Update(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Error editing file

⏺ Update(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Error editing file

⏺ Read(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Read 20 lines (ctrl+r to expand)

⏺ Update(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Error editing file

⏺ Update(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Error editing file

⏺ Let me find a more unique location to add the analytics tables:

⏺ Search(pattern: "OR is_service_role", path:
        "shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md", output_mode: "content")
  ⎿  Found 43 lines (ctrl+r to expand)

⏺ Update(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Updated shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md with 164 additions and 1 
     removal
       754            OR is_service_role()
       755        );
       756    
       757 -  -- 7. Add system configuration for timeouts and intervals
       757 +  -- 6c. Create user analytics infrastructure for early adopter insights
       758 +  -- Core usage tracking table for monthly usage aggregates
       759 +  CREATE TABLE IF NOT EXISTS user_usage_tracking (
       760 +      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       761 +      profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
       762 +      
       763 +      -- Billing Period
       764 +      billing_cycle_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW()),
       765 +      billing_cycle_end TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', NOW()) + interval '1 month'),
       766 +      
       767 +      -- Shell File Upload Metrics
       768 +      shell_files_uploaded INTEGER DEFAULT 0,
       769 +      total_pages_processed INTEGER DEFAULT 0,
       770 +      total_file_size_mb NUMERIC(10,2) DEFAULT 0,
       771 +      
       772 +      -- AI Processing Metrics
       773 +      ai_tokens_used INTEGER DEFAULT 0,
       774 +      ai_processing_jobs INTEGER DEFAULT 0,
       775 +      ai_processing_minutes INTEGER DEFAULT 0,
       776 +      
       777 +      -- Storage Metrics
       778 +      storage_used_mb NUMERIC(10,2) DEFAULT 0,
       779 +      
       780 +      -- Plan Configuration (for future billing)
       781 +      plan_type TEXT DEFAULT 'free' CHECK (plan_type IN ('free', 'basic', 'premium', 'enterprise')),
       782 +      
       783 +      -- Usage Limits (dynamic based on plan_type - feature flagged)
       784 +      shell_files_limit INTEGER DEFAULT 10,        -- Free: 10 files/month
       785 +      pages_limit INTEGER DEFAULT 100,             -- Free: 100 pages/month  
       786 +      ai_tokens_limit INTEGER DEFAULT 50000,       -- Free: 50K tokens/month
       787 +      storage_limit_mb INTEGER DEFAULT 100,        -- Free: 100MB storage
       788 +      
       789 +      -- Status Flags (feature flagged for billing)
       790 +      is_over_limit BOOLEAN DEFAULT FALSE,
       791 +      upgrade_required BOOLEAN DEFAULT FALSE,
       792 +      warnings_sent INTEGER DEFAULT 0,
       793 +      
       794 +      -- Timestamps
       795 +      created_at TIMESTAMPTZ DEFAULT NOW(),
       796 +      updated_at TIMESTAMPTZ DEFAULT NOW(),
       797 +      
       798 +      -- Ensure one record per user per billing cycle
       799 +      UNIQUE(profile_id, billing_cycle_start)
       800 +  );
       801 +  
       802 +  -- Performance indexes for usage tracking
       803 +  CREATE INDEX IF NOT EXISTS idx_user_usage_profile_cycle ON user_usage_tracking(profile_id, 
           + billing_cycle_start);
       804 +  CREATE INDEX IF NOT EXISTS idx_user_usage_over_limit ON user_usage_tracking(profile_id) WHERE is_over_limit
           +  = TRUE;
       805 +  
       806 +  -- Detailed usage events for analytics (early adopter insights)
       807 +  CREATE TABLE IF NOT EXISTS usage_events (
       808 +      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       809 +      profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
       810 +      
       811 +      -- Event Details
       812 +      event_type TEXT NOT NULL CHECK (event_type IN (
       813 +          'shell_file_uploaded', 'shell_file_processed', 'ai_processing_started', 'ai_processing_completed',
       814 +          'page_extracted', 'storage_used', 'plan_upgraded', 'plan_downgraded', 'limit_hit'
       815 +      )),
       816 +      
       817 +      -- Metrics (flexible JSONB for different event types)
       818 +      metrics JSONB DEFAULT '{}', -- { "file_size_mb": 2.5, "pages": 10, "tokens_used": 1500 }
       819 +      
       820 +      -- References
       821 +      shell_file_id UUID REFERENCES shell_files(id),
       822 +      job_id UUID,  -- References job_queue
       823 +      
       824 +      -- Metadata for analytics
       825 +      user_agent TEXT,
       826 +      ip_address INET,
       827 +      
       828 +      created_at TIMESTAMPTZ DEFAULT NOW()
       829 +  );
       830 +  
       831 +  -- Performance indexes for usage events
       832 +  CREATE INDEX IF NOT EXISTS idx_usage_events_profile_type ON usage_events(profile_id, event_type, 
           + created_at);
       833 +  CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON usage_events(created_at);
       834 +  
       835 +  -- Subscription plans configuration (future billing - feature flagged)
       836 +  CREATE TABLE IF NOT EXISTS subscription_plans (
       837 +      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       838 +      plan_type TEXT UNIQUE NOT NULL,
       839 +      display_name TEXT NOT NULL,
       840 +      description TEXT,
       841 +      
       842 +      -- Monthly Limits
       843 +      shell_files_limit INTEGER,        -- NULL = unlimited
       844 +      pages_limit INTEGER,              -- NULL = unlimited
       845 +      ai_tokens_limit INTEGER,          -- NULL = unlimited  
       846 +      storage_limit_mb INTEGER,         -- NULL = unlimited
       847 +      
       848 +      -- Pricing (in cents)
       849 +      monthly_price_cents INTEGER DEFAULT 0,
       850 +      
       851 +      -- Features
       852 +      features JSONB DEFAULT '[]',      -- ['priority_processing', 'advanced_ai', 'api_access']
       853 +      
       854 +      -- Status
       855 +      is_active BOOLEAN DEFAULT TRUE,
       856 +      sort_order INTEGER DEFAULT 0,
       857 +      
       858 +      created_at TIMESTAMPTZ DEFAULT NOW(),
       859 +      updated_at TIMESTAMPTZ DEFAULT NOW()
       860 +  );
       861 +  
       862 +  -- Seed subscription plan data
       863 +  INSERT INTO subscription_plans (plan_type, display_name, description, shell_files_limit, pages_limit, 
           + ai_tokens_limit, storage_limit_mb, monthly_price_cents, sort_order) VALUES
       864 +  ('free', 'Free', 'Perfect for getting started', 10, 100, 50000, 100, 0, 1),
       865 +  ('basic', 'Basic', 'For regular users', 100, 1000, 500000, 1000, 999, 2),  -- $9.99/month
       866 +  ('premium', 'Premium', 'For power users', 500, 5000, 2500000, 5000, 2999, 3), -- $29.99/month
       867 +  ('enterprise', 'Enterprise', 'Unlimited usage', NULL, NULL, NULL, NULL, 9999, 4) -- $99.99/month
       868 +  ON CONFLICT (plan_type) DO UPDATE SET
       869 +      display_name = EXCLUDED.display_name,
       870 +      description = EXCLUDED.description,
       871 +      shell_files_limit = EXCLUDED.shell_files_limit,
       872 +      pages_limit = EXCLUDED.pages_limit,
       873 +      ai_tokens_limit = EXCLUDED.ai_tokens_limit,
       874 +      storage_limit_mb = EXCLUDED.storage_limit_mb,
       875 +      monthly_price_cents = EXCLUDED.monthly_price_cents,
       876 +      sort_order = EXCLUDED.sort_order,
       877 +      updated_at = NOW();
       878 +  
       879 +  -- Enable RLS for user analytics tables (profile-based isolation)
       880 +  ALTER TABLE user_usage_tracking ENABLE ROW LEVEL SECURITY;
       881 +  CREATE POLICY "user_usage_tracking_profile_isolation" ON user_usage_tracking
       882 +      FOR ALL USING (
       883 +          profile_id = auth.uid()
       884 +          OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
       885 +          OR is_service_role()
       886 +      )
       887 +      WITH CHECK (
       888 +          profile_id = auth.uid()
       889 +          OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
       890 +          OR is_service_role()
       891 +      );
       892 +  
       893 +  ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
       894 +  CREATE POLICY "usage_events_profile_isolation" ON usage_events
       895 +      FOR ALL USING (
       896 +          profile_id = auth.uid()
       897 +          OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
       898 +          OR is_service_role()
       899 +      )
       900 +      WITH CHECK (
       901 +          profile_id = auth.uid()
       902 +          OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
       903 +          OR is_service_role()
       904 +      );
       905 +  
       906 +  ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
       907 +  CREATE POLICY "subscription_plans_read_all" ON subscription_plans
       908 +      FOR SELECT USING (true); -- Everyone can read plan options
       909 +  
       910 +  CREATE POLICY "subscription_plans_service_role_only" ON subscription_plans
       911 +      FOR ALL USING (
       912 +          current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
       913 +          OR is_service_role()
       914 +      )
       915 +      WITH CHECK (
       916 +          current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
       917 +          OR is_service_role()
       918 +      );
       919 +  
       920 +  -- 7. Add system configuration for timeouts, intervals, and feature flags
       921    INSERT INTO system_configuration (config_key, config_value, config_type, description, is_sensitive) VALUES
       922    ('worker.heartbeat_interval_seconds', '30', 'system', 'Heartbeat interval for worker health monitoring', 
             false),
       923    ('worker.timeout_seconds', '300', 'system', 'Worker timeout threshold (5 minutes)', false),

⏺ Now I need to add the feature flags configuration and analytics functions:

⏺ Update(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Error editing file

⏺ Update(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Updated shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md with 5 additions and 1    
     removal
       922    ('worker.heartbeat_interval_seconds', '30', 'system', 'Heartbeat interval for worker health monitoring', 
             false),
       923    ('worker.timeout_seconds', '300', 'system', 'Worker timeout threshold (5 minutes)', false),
       924    ('worker.reclaim_jitter_max_seconds', '60', 'system', 'Maximum jitter when reclaiming timed-out jobs', 
             false),
       925 -  ('queue.backpressure_delay_seconds', '30', 'system', 'Default backpressure delay for rate limiting', false)
       925 +  ('queue.backpressure_delay_seconds', '30', 'system', 'Default backpressure delay for rate limiting', false)
           +  ,
       926 +  -- Analytics and billing feature flags
       927 +  ('features.usage_tracking_enabled', 'true', 'boolean', 'Enable usage tracking and analytics', false),
       928 +  ('features.billing_enabled', 'false', 'boolean', 'Enable subscription billing features', false),
       929 +  ('features.upgrade_prompts_enabled', 'false', 'boolean', 'Show upgrade prompts when limits exceeded', 
           + false)
       930    ON CONFLICT (config_key) DO UPDATE SET
       931        config_value = EXCLUDED.config_value,
       932        updated_at = NOW();

⏺ Now I need to add the analytics functions to the RPC deployment section:

⏺ Search(pattern: "-- 8b. Job management RPCs"", path:
        "shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md", output_mode: "content")
  ⎿  Found 0 lines 

⏺ Search(pattern: "Job management RPCs"", path:
        "shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md", output_mode: "content")
  ⎿  Found 0 lines 

⏺ Search(pattern: "-- 8b"", path: "shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md",
        output_mode: "content")
  ⎿  Found 0 lines 

⏺ Search(pattern: "8b"", path: "shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md",
        output_mode: "content")
  ⎿  Found 0 lines 

⏺ Let me find where the RPCs are defined:

⏺ Search(pattern: "enqueue_job_v3"", path:
        "shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md", output_mode: "content")
  ⎿  Found 0 lines 

⏺ Search(pattern: "CREATE OR REPLACE FUNCTION enqueue"", path:
        "shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md", output_mode: "content")
  ⎿  Found 0 lines 

⏺ Search(pattern: ""RPC"", path: "shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md",
        output_mode: "content")
  ⎿  Found 0 lines 

⏺ Let me search for where functions are defined:

⏺ Search(pattern: "function"", path: "shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md",
        output_mode: "content", head_limit: 10)
  ⎿  Found 0 lines 

⏺ Search(pattern: "FUNCTION"", path: "shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md",
        output_mode: "content", head_limit: 10)
  ⎿  Found 0 lines 

⏺ Let me search for RPC deployment sections in the plan:

⏺ Search(pattern: "RPC"", path: "shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md",
        output_mode: "content", head_limit: 5)
  ⎿  Found 0 lines 

⏺ Search(pattern: "REVOKE.*EXECUTE"", path:
        "shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md", output_mode: "content")
  ⎿  Found 0 lines 

⏺ I'll read around the end of the DDL section:

⏺ Read(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Read 30 lines (ctrl+r to expand)

⏺ Great! I found the RPC section. Let me find where the job management RPCs end so I can add the analytics functions:

⏺ Read(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Read 30 lines (ctrl+r to expand)

⏺ Perfect! Now I'll add the analytics functions before section 9:

⏺ Update(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Updated shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md with 226 additions
       1273    END;
       1274    $$;
       1275    
       1276 +  -- 8c. User analytics functions (early adopter insights + future billing)
       1277 +  CREATE OR REPLACE FUNCTION track_shell_file_upload_usage(
       1278 +      p_profile_id UUID,
       1279 +      p_shell_file_id UUID,
       1280 +      p_file_size_bytes BIGINT,
       1281 +      p_estimated_pages INTEGER DEFAULT 1
       1282 +  ) RETURNS JSONB
       1283 +  LANGUAGE plpgsql
       1284 +  SECURITY DEFINER
       1285 +  AS $$
       1286 +  DECLARE
       1287 +      usage_record RECORD;
       1288 +      file_size_mb NUMERIC(10,2);
       1289 +      limits_exceeded BOOLEAN := FALSE;
       1290 +      tracking_enabled BOOLEAN := FALSE;
       1291 +  BEGIN
       1292 +      -- Check if usage tracking is enabled
       1293 +      SELECT (config_value)::BOOLEAN INTO tracking_enabled 
       1294 +      FROM system_configuration 
       1295 +      WHERE config_key = 'features.usage_tracking_enabled';
       1296 +      
       1297 +      IF NOT COALESCE(tracking_enabled, FALSE) THEN
       1298 +          RETURN jsonb_build_object('tracking_disabled', true);
       1299 +      END IF;
       1300 +      
       1301 +      file_size_mb := p_file_size_bytes::NUMERIC / 1048576; -- Convert bytes to MB
       1302 +      
       1303 +      -- Create or get current month usage record
       1304 +      INSERT INTO user_usage_tracking (profile_id, billing_cycle_start, billing_cycle_end)
       1305 +      VALUES (
       1306 +          p_profile_id, 
       1307 +          date_trunc('month', NOW()), 
       1308 +          date_trunc('month', NOW()) + interval '1 month'
       1309 +      )
       1310 +      ON CONFLICT (profile_id, billing_cycle_start) DO NOTHING;
       1311 +      
       1312 +      -- Increment usage counters
       1313 +      UPDATE user_usage_tracking SET
       1314 +          shell_files_uploaded = shell_files_uploaded + 1,
       1315 +          total_pages_processed = total_pages_processed + p_estimated_pages,
       1316 +          total_file_size_mb = total_file_size_mb + file_size_mb,
       1317 +          storage_used_mb = storage_used_mb + file_size_mb,
       1318 +          updated_at = NOW()
       1319 +      WHERE profile_id = p_profile_id 
       1320 +      AND billing_cycle_start = date_trunc('month', NOW())
       1321 +      RETURNING * INTO usage_record;
       1322 +      
       1323 +      -- Check if limits exceeded (feature flagged)
       1324 +      limits_exceeded := usage_record.shell_files_uploaded > usage_record.shell_files_limit 
       1325 +                      OR usage_record.total_pages_processed > usage_record.pages_limit
       1326 +                      OR usage_record.storage_used_mb > usage_record.storage_limit_mb;
       1327 +      
       1328 +      -- Update limit status
       1329 +      UPDATE user_usage_tracking SET
       1330 +          is_over_limit = limits_exceeded,
       1331 +          upgrade_required = limits_exceeded
       1332 +      WHERE id = usage_record.id;
       1333 +      
       1334 +      -- Log usage event for analytics
       1335 +      INSERT INTO usage_events (profile_id, event_type, metrics, shell_file_id)
       1336 +      VALUES (p_profile_id, 'shell_file_uploaded', 
       1337 +          jsonb_build_object(
       1338 +              'file_size_mb', file_size_mb,
       1339 +              'estimated_pages', p_estimated_pages,
       1340 +              'shell_files_used', usage_record.shell_files_uploaded,
       1341 +              'shell_files_limit', usage_record.shell_files_limit
       1342 +          ),
       1343 +          p_shell_file_id
       1344 +      );
       1345 +      
       1346 +      -- Return usage status for UI
       1347 +      RETURN jsonb_build_object(
       1348 +          'shell_files_used', usage_record.shell_files_uploaded,
       1349 +          'shell_files_limit', usage_record.shell_files_limit,
       1350 +          'pages_used', usage_record.total_pages_processed,
       1351 +          'pages_limit', usage_record.pages_limit,
       1352 +          'storage_used_mb', usage_record.storage_used_mb,
       1353 +          'storage_limit_mb', usage_record.storage_limit_mb,
       1354 +          'over_limit', limits_exceeded,
       1355 +          'upgrade_required', limits_exceeded,
       1356 +          'plan_type', usage_record.plan_type
       1357 +      );
       1358 +  END;
       1359 +  $$;
       1360 +  
       1361 +  CREATE OR REPLACE FUNCTION track_ai_processing_usage(
       1362 +      p_profile_id UUID,
       1363 +      p_job_id UUID,
       1364 +      p_tokens_used INTEGER,
       1365 +      p_processing_seconds INTEGER DEFAULT 0
       1366 +  ) RETURNS JSONB
       1367 +  LANGUAGE plpgsql
       1368 +  SECURITY DEFINER
       1369 +  AS $$
       1370 +  DECLARE
       1371 +      usage_record RECORD;
       1372 +      limits_exceeded BOOLEAN := FALSE;
       1373 +      tracking_enabled BOOLEAN := FALSE;
       1374 +  BEGIN
       1375 +      -- Check if usage tracking is enabled
       1376 +      SELECT (config_value)::BOOLEAN INTO tracking_enabled 
       1377 +      FROM system_configuration 
       1378 +      WHERE config_key = 'features.usage_tracking_enabled';
       1379 +      
       1380 +      IF NOT COALESCE(tracking_enabled, FALSE) THEN
       1381 +          RETURN jsonb_build_object('tracking_disabled', true);
       1382 +      END IF;
       1383 +      
       1384 +      -- Increment AI usage counters
       1385 +      UPDATE user_usage_tracking SET
       1386 +          ai_tokens_used = ai_tokens_used + p_tokens_used,
       1387 +          ai_processing_jobs = ai_processing_jobs + 1,
       1388 +          ai_processing_minutes = ai_processing_minutes + (p_processing_seconds / 60),
       1389 +          updated_at = NOW()
       1390 +      WHERE profile_id = p_profile_id 
       1391 +      AND billing_cycle_start = date_trunc('month', NOW())
       1392 +      RETURNING * INTO usage_record;
       1393 +      
       1394 +      -- Check AI token limits (feature flagged)
       1395 +      limits_exceeded := usage_record.ai_tokens_used > usage_record.ai_tokens_limit;
       1396 +      
       1397 +      -- Update limit status if AI limits exceeded
       1398 +      UPDATE user_usage_tracking SET
       1399 +          is_over_limit = CASE WHEN limits_exceeded THEN TRUE ELSE is_over_limit END,
       1400 +          upgrade_required = CASE WHEN limits_exceeded THEN TRUE ELSE upgrade_required END
       1401 +      WHERE id = usage_record.id;
       1402 +      
       1403 +      -- Log AI processing event for analytics
       1404 +      INSERT INTO usage_events (profile_id, event_type, metrics, job_id)
       1405 +      VALUES (p_profile_id, 'ai_processing_completed',
       1406 +          jsonb_build_object(
       1407 +              'tokens_used', p_tokens_used,
       1408 +              'processing_seconds', p_processing_seconds,
       1409 +              'total_tokens_used', usage_record.ai_tokens_used,
       1410 +              'tokens_limit', usage_record.ai_tokens_limit
       1411 +          ),
       1412 +          p_job_id
       1413 +      );
       1414 +      
       1415 +      RETURN jsonb_build_object(
       1416 +          'ai_tokens_used', usage_record.ai_tokens_used,
       1417 +          'ai_tokens_limit', usage_record.ai_tokens_limit,
       1418 +          'ai_processing_jobs', usage_record.ai_processing_jobs,
       1419 +          'over_limit', limits_exceeded
       1420 +      );
       1421 +  END;
       1422 +  $$;
       1423 +  
       1424 +  CREATE OR REPLACE FUNCTION get_user_usage_status(p_profile_id UUID)
       1425 +  RETURNS JSONB
       1426 +  LANGUAGE plpgsql
       1427 +  SECURITY DEFINER
       1428 +  AS $$
       1429 +  DECLARE
       1430 +      usage_record RECORD;
       1431 +      plan_record RECORD;
       1432 +      tracking_enabled BOOLEAN := FALSE;
       1433 +  BEGIN
       1434 +      -- Check if usage tracking is enabled
       1435 +      SELECT (config_value)::BOOLEAN INTO tracking_enabled 
       1436 +      FROM system_configuration 
       1437 +      WHERE config_key = 'features.usage_tracking_enabled';
       1438 +      
       1439 +      IF NOT COALESCE(tracking_enabled, FALSE) THEN
       1440 +          RETURN jsonb_build_object('tracking_disabled', true);
       1441 +      END IF;
       1442 +      
       1443 +      -- Get current month usage
       1444 +      SELECT * INTO usage_record
       1445 +      FROM user_usage_tracking
       1446 +      WHERE profile_id = p_profile_id
       1447 +      AND billing_cycle_start = date_trunc('month', NOW());
       1448 +      
       1449 +      -- Create record if doesn't exist
       1450 +      IF usage_record IS NULL THEN
       1451 +          -- Get plan limits
       1452 +          SELECT * INTO plan_record
       1453 +          FROM subscription_plans 
       1454 +          WHERE plan_type = 'free' AND is_active = TRUE;
       1455 +          
       1456 +          INSERT INTO user_usage_tracking (
       1457 +              profile_id, plan_type,
       1458 +              shell_files_limit, pages_limit, ai_tokens_limit, storage_limit_mb
       1459 +          ) VALUES (
       1460 +              p_profile_id, 'free',
       1461 +              plan_record.shell_files_limit, plan_record.pages_limit, 
       1462 +              plan_record.ai_tokens_limit, plan_record.storage_limit_mb
       1463 +          ) RETURNING * INTO usage_record;
       1464 +      END IF;
       1465 +      
       1466 +      RETURN jsonb_build_object(
       1467 +          'current_period', jsonb_build_object(
       1468 +              'start', usage_record.billing_cycle_start,
       1469 +              'end', usage_record.billing_cycle_end
       1470 +          ),
       1471 +          'usage', jsonb_build_object(
       1472 +              'shell_files', jsonb_build_object(
       1473 +                  'used', usage_record.shell_files_uploaded,
       1474 +                  'limit', usage_record.shell_files_limit,
       1475 +                  'percentage', ROUND((usage_record.shell_files_uploaded::NUMERIC / 
            + NULLIF(usage_record.shell_files_limit, 0)) * 100, 1)
       1476 +              ),
       1477 +              'pages', jsonb_build_object(
       1478 +                  'used', usage_record.total_pages_processed,
       1479 +                  'limit', usage_record.pages_limit,
       1480 +                  'percentage', ROUND((usage_record.total_pages_processed::NUMERIC / 
            + NULLIF(usage_record.pages_limit, 0)) * 100, 1)
       1481 +              ),
       1482 +              'ai_tokens', jsonb_build_object(
       1483 +                  'used', usage_record.ai_tokens_used,
       1484 +                  'limit', usage_record.ai_tokens_limit,
       1485 +                  'percentage', ROUND((usage_record.ai_tokens_used::NUMERIC / 
            + NULLIF(usage_record.ai_tokens_limit, 0)) * 100, 1)
       1486 +              ),
       1487 +              'storage', jsonb_build_object(
       1488 +                  'used_mb', usage_record.storage_used_mb,
       1489 +                  'limit_mb', usage_record.storage_limit_mb,
       1490 +                  'percentage', ROUND((usage_record.storage_used_mb::NUMERIC / 
            + NULLIF(usage_record.storage_limit_mb, 0)) * 100, 1)
       1491 +              )
       1492 +          ),
       1493 +          'status', jsonb_build_object(
       1494 +              'plan_type', usage_record.plan_type,
       1495 +              'over_limit', usage_record.is_over_limit,
       1496 +              'upgrade_required', usage_record.upgrade_required
       1497 +          )
       1498 +      );
       1499 +  END;
       1500 +  $$;
       1501 +  
       1502    -- 9. Set up proper RLS and security
       1503    -- Enable RLS on job_queue (service role only)
       1504    ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;

⏺ Now I need to add the analytics functions to the REVOKE/GRANT section:

⏺ Read(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Read 20 lines (ctrl+r to expand)

⏺ Update(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Updated shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md with 4 additions
       1520    REVOKE EXECUTE ON FUNCTION update_job_heartbeat(uuid, text) FROM PUBLIC;
       1521    REVOKE EXECUTE ON FUNCTION reschedule_job(uuid, integer, text, boolean) FROM PUBLIC;
       1522    REVOKE EXECUTE ON FUNCTION complete_job(uuid, text, jsonb) FROM PUBLIC;
       1523 +  -- Analytics functions security
       1524 +  REVOKE EXECUTE ON FUNCTION track_shell_file_upload_usage(uuid, uuid, bigint, integer) FROM PUBLIC;
       1525 +  REVOKE EXECUTE ON FUNCTION track_ai_processing_usage(uuid, uuid, integer, integer) FROM PUBLIC;
       1526 +  REVOKE EXECUTE ON FUNCTION get_user_usage_status(uuid) FROM PUBLIC;
       1527    
       1528    GRANT EXECUTE ON FUNCTION acquire_api_capacity(text, text, integer) TO service_role;
       1529    GRANT EXECUTE ON FUNCTION release_api_capacity(text, text, integer, integer) TO service_role;

⏺ Update(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Updated shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md with 4 additions    
       1532    GRANT EXECUTE ON FUNCTION update_job_heartbeat(uuid, text) TO service_role;
       1533    GRANT EXECUTE ON FUNCTION reschedule_job(uuid, integer, text, boolean) TO service_role;
       1534    GRANT EXECUTE ON FUNCTION complete_job(uuid, text, jsonb) TO service_role;
       1535 +  -- Analytics functions permissions - accessible to authenticated users
       1536 +  GRANT EXECUTE ON FUNCTION track_shell_file_upload_usage(uuid, uuid, bigint, integer) TO authenticated;
       1537 +  GRANT EXECUTE ON FUNCTION track_ai_processing_usage(uuid, uuid, integer, integer) TO service_role; -- 
            + Service role only for worker usage
       1538 +  GRANT EXECUTE ON FUNCTION get_user_usage_status(uuid) TO authenticated;
       1539    
       1540    COMMIT;
       1541    ```

⏺ Now I need to update the implementation roadmap to include analytics integration. Let me find the roadmap section:

⏺ Read(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Read 30 lines (ctrl+r to expand)

⏺ Update(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Updated shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md with 8 additions and 3    
     removals
       1556    4. Validate: enqueue → claim → heartbeat → reschedule → complete
       1557    ```
       1558    
       1559 -  #### **Days 6-7: V3 Native Edge Functions Development**
       1559 +  #### **Days 6-7: V3 Native Edge Functions Development + Analytics Integration**
       1560    ```typescript
       1561 -  // V3-native functions with all technical fixes:
       1562 -  // 1. shell-file-processor-v3: Idempotency + correlation IDs
       1561 +  // V3-native functions with all technical fixes + analytics integration:
       1562 +  // 1. shell-file-processor-v3: Idempotency + correlation IDs + usage tracking
       1563    // 2. audit-logger-v3: job_id correlation in all audit events
       1564    // 3. Service role key isolation verification
       1565 +  // 4. ADDED: Analytics integration in shell-file-processor-v3:
       1566 +  //    - Call track_shell_file_upload_usage() after file upload
       1567 +  //    - Log usage events for early adopter insights
       1568 +  //    - Feature flag controlled (usage_tracking_enabled=true)
       1569 +  // 5. ADDED: Basic usage dashboard component for internal analytics
       1570    ```
       1571    
       1572    ### **Week 5: OCR/AI Processing with Fixed Rate Limiting**

⏺ Update(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Updated shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md with 11 additions
       1623                    p_job_result: results
       1624                });
       1625                
       1626 +              // ADDED: Track AI processing usage for analytics
       1627 +              const profileId = await this.getProfileIdFromJobPayload(job);
       1628 +              if (profileId && results.tokens_used) {
       1629 +                  await this.supabase.rpc('track_ai_processing_usage', {
       1630 +                      p_profile_id: profileId,
       1631 +                      p_job_id: jobId,
       1632 +                      p_tokens_used: results.tokens_used,
       1633 +                      p_processing_seconds: processingTime
       1634 +                  });
       1635 +              }
       1636 +              
       1637            } catch (error) {
       1638                await this.handleJobError(job, error);
       1639            } finally {

⏺ Now let me add analytics to the cutover runbook:

⏺ Search(pattern: ""Cutover Runbook"", path:
        "shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md", output_mode: "content")
  ⎿  Found 0 lines 

⏺ Search(pattern: ""Pre-Cutover Checklist"", path:
        "shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md", output_mode: "content")
  ⎿  Found 0 lines 

⏺ Search(pattern: ""Pre-Cutover"", path: "shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md",
        output_mode: "content")
  ⎿  Found 0 lines 

⏺ Search(pattern: ""Checklist"", path: "shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md",
        output_mode: "content")
  ⎿  Found 0 lines 

⏺ Search(pattern: ""Implementation Ready"", path:
        "shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md", output_mode: "content")
  ⎿  Found 0 lines 

⏺ Search(pattern: ""\-\-\-"", path: "shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md",
        output_mode: "content")
  ⎿  Found 0 lines 

⏺ Let me search for the deployment sections:

⏺ Search(pattern: "deployment"", path: "shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md",
        output_mode: "content", head_limit: 5)
  ⎿  Found 0 lines 

⏺ Search(pattern: "Production"", path: "shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md",
        output_mode: "content", head_limit: 5)
  ⎿  Found 0 lines 

⏺ Let me find the end of the document to see the structure:

⏺ Read(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Read 51 lines (ctrl+r to expand)

⏺ Now let me find the production readiness section and update it:

⏺ Update(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Updated shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md with 3 additions  
       1747    - [ ] End-to-end processing validated
       1748    - [ ] Rollback procedures tested
       1749    - [ ] Team training completed
       1750 +  - [ ] **ADDED: User analytics infrastructure validated** - Usage tracking functions tested
       1751 +  - [ ] **ADDED: Analytics feature flags configured** - usage_tracking_enabled=true, billing features 
            + disabled
       1752 +  - [ ] **ADDED: Early adopter data collection confirmed** - Events logging to usage_events table
       1753    
       1754    ---
       1755    

⏺ Update(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Updated shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md with 1 addition      
       1761    - Job queue with heartbeat monitoring and dead letter management
       1762    - Service-role secured RPCs with proper permission isolation
       1763    - Comprehensive audit logging with job correlation IDs
       1764 +  - **ADDED: User analytics infrastructure** - Usage tracking, billing foundation, early adopter insights
       1765    
       1766    **Render.com (Processing Engine + Reliability):**
       1767    - Long-running workers with heartbeat health monitoring

⏺ Update(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Updated shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md with 3 additions and 2    
     removals
       1771    - Horizontal scaling with proper error handling and recovery
       1772    
       1773    **Production-Ready Integration:**
       1774 -  1. **Upload** → Storage + shell_files with idempotency_key
       1774 +  1. **Upload** → Storage + shell_files with idempotency_key + **usage tracking**
       1775    2. **Enqueue** → job_queue with token estimates and correlation
       1776    3. **Claim** → Worker with heartbeat and timeout detection
       1777 -  4. **Process** → API capacity management and structured error handling
       1777 +  4. **Process** → API capacity management + **AI usage tracking** + structured error handling
       1778    5. **Complete** → Audit logging with job_id correlation and cleanup
       1779 +  6. **ADDED: Analytics** → Real-time usage insights + early adopter behavior data
       1780    
       1781    ---
       1782    

⏺ Perfect! I have successfully integrated the usage analytics system into the v4 plan. Let me update the reference to the
  SQL filename:

⏺ Update(shared/docs/architecture/database-foundation-v3/v3-phase2-implementation-plan-v4.md)
  ⎿  Error editing file

✢ Sublimating… (esc to interrupt)