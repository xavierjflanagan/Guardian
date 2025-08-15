# Patient Communications Architecture

**Status:** Core Platform Feature  
**Date:** 2025-08-15  
**Priority:** CRITICAL - Defines core user experience  

---

## Overview

The Patient Communications system is the heart of Exora Health - a unified hub for all health-related communications across email, messaging, and provider portals. This revolutionary approach gives patients permanent, portable health communication addresses they own for life.

---

## Core Innovation

Every Exora user receives a **permanent health identity** consisting of:

### 1. Primary: Health Email (Free, Permanent, Portable)
```
X24-K57D1@exora.au
```
- **Format:** `{Initial}{BirthDay}-{UniqueID}@exora.au`
- **Example:** `J15-B92X3@exora.au` (John, born 15th)
- **Routing flexibility:** Accepts `-`, `.`, or `_` as separator
- **Cost:** Zero marginal cost per user
- **Purpose:** Primary channel for all health data

### 2. Secondary: Exora ID (Derived from Email)
```
X24-K57D1
```
- **Same as email prefix** - Easy to remember
- **Use cases:** Verbal sharing, quick entry, QR codes
- **Provider lookup:** Quick patient identification

### 3. Tertiary: Phone Number (Convenience Only)
```
+61 4XX XXX XXX
```
- **User's existing number** - Not a virtual number
- **Purpose:** Provider quick-connect, notifications only
- **NOT for PHI transmission** - Only for identity verification
- **Optional:** Users can choose not to share

---

## Architecture Components

### [Unified Health Inbox](./unified-health-inbox.md)
Single timeline view aggregating all health communications:
- Emails
- SMS/Messages
- Provider portal messages
- Appointment reminders
- Lab results

### [Email Ingestion System](./email-ingestion.md)  
- Catch-all routing for `@exora.au`
- AI extraction pipeline
- Provider verification
- Attachment processing

### [Messaging Hub](./messaging-hub.md)
- Pooled virtual numbers (5-20 shared)
- WhatsApp Business integration
- SMS forwarding
- iOS/Android workarounds

### [Identification System](./identification-system.md)
- Four-tier identification strategy
- Dual-tier ID architecture (Global + Local)
- Provider verification flows
- Patient consent mechanisms
- Multi-script international support

### [Provider Connect](./provider-connect.md)
- Quick-connect via phone lookup
- Time-limited access grants
- Audit trails

### [Frictionless Forwarding](./frictionless-forwarding.md)
- One-touch forwarding to Exora
- Contact card integration
- Share extensions
- Email auto-forwarding

---

## Key Design Principles

### 1. Email-First Strategy
- **Zero cost** per user for addresses
- **Permanent** - Follows patient for life
- **Portable** - Independent of providers
- **Universal** - Works everywhere

### 2. Privacy by Design
- **No PHI over SMS** - Notifications only
- **Encrypted storage** - AES-256 at rest
- **Audit everything** - Complete access logs
- **Patient control** - Granular permissions

### 3. Frictionless Experience
- **Auto-sync** where possible
- **One-touch forwarding** for manual items
- **Smart contact cards** with both phone and email
- **Share extensions** for iOS/Android

---

## Implementation Roadmap

### Phase 1: Email Foundation (Immediate)
- [x] Domain setup (@exora.au)
- [ ] Email routing infrastructure
- [ ] Basic inbox UI
- [ ] AI extraction v1

### Phase 2: Messaging Integration (Month 2-3)
- [ ] Pooled virtual numbers (5-10)
- [ ] WhatsApp Business setup
- [ ] Contact card generation
- [ ] Share extensions

### Phase 3: Provider Ecosystem (Month 4-6)
- [ ] Provider quick-connect
- [ ] Portal integrations
- [ ] Audit dashboard
- [ ] Bulk export tools

---

## Cost Analysis

### Email System
- **Per user:** $0.004/month
- **At 10k users:** $40/month

### Messaging System (Pooled)
- **Infrastructure:** $30-300/month (5-20 numbers)
- **Per user at scale:** <$0.05/month
- **Message costs:** Usage-based

### Total Platform Cost
- **Under $0.06 per user/month at scale**

---

## Success Metrics

- **Email adoption:** >80% provide health email to providers
- **Message capture:** >60% of health SMS captured
- **Provider connections:** >2 per user per month
- **Zero PHI breaches:** 100% secure transmission

---

## Why This Architecture?

Traditional approaches fail because they require behavior change. Our system works because:

1. **Patients already receive health emails** - We just give them a dedicated address
2. **Providers already send communications** - We just capture them centrally
3. **No new apps needed** for providers - Just send to patient's Exora address
4. **Frictionless forwarding** - One touch to add any health content

This isn't just data ingestion - it's a fundamental reimagining of how health communications should work.

---

## See Also

- [Business Email Infrastructure](../../business/email-infrastructure.md)
- [Security & Compliance](../../security/)