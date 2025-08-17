# Exora Health Monitoring Implementation Plan

## Overview

This document outlines the implementation plan for monitoring and alerting infrastructure for Exora Health, designed specifically for solo founder operations with AI-powered analysis capabilities.

## Phase 1: Standard Monitoring Setup (Week 1-2)

### Objectives
- Implement basic error tracking and alerting
- Set up uptime monitoring for critical user journeys
- Establish notification channels
- Enable performance monitoring

**Target Cost**: $0-15/month  
**Time Investment**: 2-4 hours  
**Result**: Professional-grade monitoring without complexity

### 1.1 Error Tracking with Sentry

**Setup Steps:**

1. **Create Sentry Account**
   - Sign up at sentry.io
   - Create new project: "Exora Health Web"
   - Note the DSN (Data Source Name)

2. **Install Sentry in Next.js App**
   ```bash
   cd apps/web
   pnpm add @sentry/nextjs
   ```

3. **Configure Sentry**
   ```typescript
   // sentry.client.config.ts
   import * as Sentry from "@sentry/nextjs";
   
   Sentry.init({
     dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
     environment: process.env.NODE_ENV,
     tracesSampleRate: 1.0,
     debug: false,
   });
   ```

4. **Add Environment Variables**
   ```bash
   # .env.local
   NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn-here
   ```

5. **Configure Sentry for Edge Functions**
   ```typescript
   // In each Supabase function
   import { Sentry } from "https://deno.land/x/sentry/index.ts";
   
   Sentry.init({
     dsn: Deno.env.get("SENTRY_DSN"),
   });
   ```

**What You'll Get:**
- Real-time error alerts
- Stack traces with source code context
- User context (which user hit the error)
- Performance tracking for slow operations

### 1.2 Uptime Monitoring with UptimeRobot

**Setup Steps:**

1. **Create UptimeRobot Account**
   - Sign up at uptimerobot.com (free tier: 50 monitors)

2. **Create Critical Path Monitors**

   **Monitor 1: Homepage**
   - Type: HTTP(s)
   - URL: `https://www.exorahealth.com.au`
   - Keyword: "Exora" (ensure page loads correctly)
   - Interval: 5 minutes

   **Monitor 2: Dashboard Authentication**
   - Type: HTTP(s) 
   - URL: `https://www.exorahealth.com.au/dashboard`
   - Expected Status: 200 or 302 (redirect to login)
   - Interval: 5 minutes

   **Monitor 3: API Health Check**
   - Type: HTTP(s)
   - URL: `https://www.exorahealth.com.au/api/health`
   - Expected: Status 200 + JSON response
   - Interval: 2 minutes

   **Monitor 4: Document Upload API**
   - Type: HTTP(s)
   - URL: `https://www.exorahealth.com.au/api/v1/functions/audit-events`
   - Method: OPTIONS (CORS preflight check)
   - Expected: Status 204
   - Interval: 10 minutes

   **Monitor 5: Edge Function Health**
   - Type: HTTP(s)
   - URL: `https://[supabase-project].functions.supabase.co/audit-events`
   - Method: OPTIONS
   - Expected: Status 204 + proper CORS headers
   - Interval: 10 minutes

3. **Configure Alert Contacts**
   - Add email: `alerts@exora.au`
   - Set alert threshold: 2 failed checks
   - Enable SMS for critical monitors (optional)

### 1.3 Notification Setup

**Create Dedicated Email Address:**
```
alerts@exora.au
```

**Email Filtering Rules:**
- `[UptimeRobot]` → Folder: "Uptime Alerts"
- `[Sentry]` → Folder: "Error Alerts"  
- `[Vercel]` → Folder: "Deployment Alerts"

**Mobile Notifications:**
- Enable email push notifications on phone
- Set VIP/priority for alerts@exora.au

### 1.4 Performance Monitoring

**Vercel Analytics (Built-in):**
1. Enable in Vercel Dashboard → Project → Analytics
2. Monitor Core Web Vitals automatically
3. Track API response times

**Supabase Logs:**
1. Dashboard → Logs → Configure log retention
2. Set up log drains if needed (future)

## Phase 2: AI-Powered Admin Platform (Month 2-3)

### Objectives
- Build intelligent error analysis and reporting
- Create mobile admin interface
- Implement automated fix suggestions
- Develop unified monitoring dashboard

**Target Cost**: $50-100/month  
**Advanced Features**: AI analysis, mobile app, voice commands

### 2.1 AI Analysis Service Architecture

```
Error/Alert → Webhook → AI Service → Analysis Report → Notification
                ↓
        Codebase Context API
        (GitHub + Vector Search)
```

**Core Components:**

1. **Webhook Receiver Service**
   ```typescript
   // Receives alerts from Sentry, UptimeRobot, etc.
   // Deployed on Vercel/Railway as serverless function
   ```

2. **Codebase Context Engine**
   ```typescript
   // GitHub API integration
   // Vector embeddings for code search (like Cursor)
   // Recent commit analysis
   ```

3. **AI Analysis Engine**
   ```typescript
   // OpenAI/Claude API integration
   // Structured prompts for error interpretation
   // Fix suggestion generation
   ```

4. **Report Generation**
   ```typescript
   // Plain English incident reports
   // Suggested implementation plans
   // Priority scoring
   ```

### 2.2 Mobile Admin App

**Platform**: React Native or PWA

**Core Features:**
- **Alert Dashboard**: Real-time monitoring status
- **Incident Reports**: AI-generated analysis in plain English
- **Voice Commands**: "Approve the suggested database fix"
- **Quick Actions**: Restart services, deploy fixes, acknowledge alerts
- **Analytics Overview**: Performance metrics, user activity, system health

**Example Mobile Workflow:**
```
1. Push notification: "Database connection timeout detected"
2. Tap notification → Opens AI analysis
3. Read: "High traffic causing connection pool exhaustion in user-upload.ts"
4. Voice response: "Increase connection pool to 20"
5. App generates implementation plan
6. One-tap export to Cursor for implementation
```

### 2.3 Unified Monitoring Dashboard

**Web Interface Features:**
- **System Overview**: All services status at a glance
- **Error Trends**: Pattern analysis over time
- **Performance Metrics**: Response times, throughput, resource usage
- **User Impact**: Which errors affect the most users
- **AI Insights**: Automated pattern recognition and recommendations

**Data Sources Integration:**
- Sentry (errors)
- UptimeRobot (uptime)
- Vercel Analytics (performance)
- Supabase Logs (database)
- Custom business metrics

### 2.4 Implementation Roadmap

**Month 2:**
- Week 1: Build webhook receiver and basic AI analysis
- Week 2: Implement codebase context search
- Week 3: Create mobile PWA with basic features
- Week 4: Add voice command processing

**Month 3:**
- Week 1: Build unified dashboard web interface
- Week 2: Implement automated fix suggestions
- Week 3: Add advanced analytics and trending
- Week 4: Polish and production deployment

## Implementation Checklist

### Phase 1 Tasks

- [ ] Create Sentry account and project
- [ ] Install Sentry SDK in Next.js app
- [ ] Configure Sentry for Supabase Edge Functions
- [ ] Set up environment variables for Sentry DSN
- [ ] Create UptimeRobot account
- [ ] Configure 5 critical path monitors
- [ ] Set up alerts@exora.au email address
- [ ] Configure email filtering rules
- [ ] Enable Vercel Analytics
- [ ] Test all monitoring systems
- [ ] Document escalation procedures

### Phase 2 Tasks

- [ ] Design AI analysis service architecture
- [ ] Set up development environment for AI service
- [ ] Implement GitHub API integration
- [ ] Build vector search for codebase context
- [ ] Create AI analysis engine with structured prompts
- [ ] Develop webhook receiver service
- [ ] Build mobile PWA interface
- [ ] Implement voice command processing
- [ ] Create unified web dashboard
- [ ] Set up production deployment pipeline
- [ ] Conduct end-to-end testing
- [ ] Create user documentation

## Cost Breakdown

### Phase 1 (Monthly)
- Sentry Developer: $0 (free tier)
- UptimeRobot: $0 (free tier, 50 monitors)
- Email hosting: $0 (use existing domain)
- Vercel Analytics: $0 (included)
- **Total: $0/month**

### Phase 2 (Monthly)
- OpenAI API: $30-50 (analysis calls)
- Vercel Pro: $20 (for AI service hosting)
- Database for analytics: $10-20
- Mobile app hosting: $0 (PWA)
- **Total: $60-90/month**

## Success Metrics

### Phase 1
- **Mean Time to Detection (MTTD)**: < 5 minutes for critical issues
- **False Positive Rate**: < 5% of alerts
- **Coverage**: 100% of critical user journeys monitored
- **Response Time**: < 30 minutes to acknowledge alerts

### Phase 2
- **Mean Time to Resolution (MTTR)**: < 2 hours with AI assistance
- **Automated Analysis Accuracy**: > 80% useful insights
- **Mobile Response Time**: < 2 minutes from alert to action
- **Developer Productivity**: 50% reduction in debugging time

## Security Considerations

- **Alert Data**: Ensure no sensitive user data in error reports
- **API Keys**: Secure storage of monitoring service credentials
- **Access Control**: Restrict admin app access to authorized devices
- **Data Retention**: Configure appropriate log retention policies
- **Compliance**: Ensure monitoring practices align with healthcare regulations

## Maintenance and Updates

### Weekly Tasks
- Review error trends and patterns
- Check monitor reliability and adjust thresholds
- Update AI analysis prompts based on new error types

### Monthly Tasks
- Review cost and usage metrics
- Update monitoring coverage for new features
- Refine AI analysis accuracy based on feedback
- Security review of monitoring infrastructure

## Future Enhancements

- **Predictive Analytics**: Predict issues before they occur
- **Auto-Remediation**: Automatically fix common issues
- **Integration with CI/CD**: Monitoring-driven deployment decisions
- **Customer Impact Tracking**: Correlate errors with user experience
- **Multi-Environment Support**: Staging and production monitoring
- **Team Collaboration**: When hiring, add team-based workflows

---

**Document Version**: 1.0  
**Last Updated**: January 2025  
**Owner**: Exora Health Operations  
**Review Schedule**: Monthly
