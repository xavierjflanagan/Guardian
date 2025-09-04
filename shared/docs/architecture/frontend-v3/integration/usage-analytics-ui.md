# Usage Analytics UI Integration

**Date:** September 4, 2025  
**Purpose:** Usage tracking dashboard and subscription management interface  
**Backend:** V3 usage tracking tables (user_usage_tracking, subscription_plans, usage_events)  

---

## Usage Analytics Dashboard

### **Dashboard Layout**
```tsx
<UsageAnalyticsPanel>
  <CurrentPlanCard plan="Free" upgradePrompt={true} />
  <UsageMetrics 
    filesUploaded="12/25"
    storageUsed="45 MB / 100 MB" 
    billingCycle="Monthly"
  />
  <UsageTrends chartData={monthlyUsage} />
  <UpgradePrompts visible={approaching_limits} />
</UsageAnalyticsPanel>
```

### **Family Usage Tracking**
- Multi-profile usage allocation
- Per-profile limits and tracking
- Family plan management

---

## Subscription Management

### **Plan Comparison Interface**
- Feature comparison grid
- Usage limit visibility  
- Upgrade/downgrade flows

### **Billing Integration Preparation**
- Payment method collection (future)
- Invoice history display (future)
- Usage-based billing calculations

---

## Components

### **Core Analytics Components**
- `<UsageDashboard />` - Main analytics overview
- `<PlanComparisonModal />` - Subscription plans
- `<UsageWarnings />` - Limit approaching alerts
- `<FamilyUsageBreakdown />` - Multi-profile tracking

### **Data Integration**
```typescript
useUsageAnalytics(profileId)
useSubscriptionStatus()
useFamilyUsageBreakdown()
```