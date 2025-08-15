# Exora Health Email Infrastructure Strategy

**Status:** Planning & Implementation  
**Date:** August 15, 2025  
**Priority:** CRITICAL - Blocking business operations  

## Executive Summary

Email infrastructure serves two distinct but complementary purposes for Exora Health:
1. **Immediate:** Professional business communications
2. **Strategic:** Revolutionary healthcare data aggregation via patient-owned email addresses

This document outlines our comprehensive email strategy, implementation plan, and the innovative vision for email-based Patient-Generated Health Data (PGHD) collection.

---

## A. Business Requirements

### Immediate Needs (Business Operations)
- Professional email addresses for business communications
- Support/feedback channels for users  
- HIPAA-ready email infrastructure
- Clean, memorable email addresses
- Australian data sovereignty compliance

### Future Vision (Healthcare Data Ecosystem)
- Email-based health data aggregation pipeline
- Patient-owned health email addresses  
- Automated parsing of healthcare emails (lab results, appointments, prescriptions)
- Integration with existing healthcare systems (MyChart, patient portals)
- End-to-end encrypted health data collection

---

## B. Hybrid Domain Strategy Decision

### Phase 1: Australian Market Strategy

**Website Domain:** exorahealth.com.au  
**Business Email Domain:** @exora.au

**Rationale for Hybrid Approach:**
- ✅ **Professional website** - exorahealth.com.au establishes clear healthcare positioning
- ✅ **Ultra-short emails** - @exora.au for daily business communications (13 vs 23 characters)
- ✅ **Best of both worlds** - Healthcare credibility + practical usability
- ✅ **Market optimization** - Leverages our domain portfolio strategically

**Phase 1 Email addresses:**
- xavier@exora.au (CEO/Founder)
- support@exora.au (User support)
- hello@exora.au (General inquiries)
- privacy@exora.au (Compliance/data requests)
- noreply@exora.au (System notifications)

### Phase 2: International Expansion Strategy

**Global Email Domain:** @exoracare.com

**Rationale for International Expansion:**
- ✅ **"Care" universally understood** - More approachable than "health"
- ✅ **Global .com standard** - Familiar across all markets
- ✅ **No geographic limitations** - Works everywhere
- ✅ **Brand flexibility** - Not locked into "health" positioning

**Phase 2 Email Strategy:**
```
Australian Users:    xavier@exora.au
International Users: xavier@exoracare.com
Global Support:      support@exoracare.com
Regional Variations: xavier@exoracare.co.uk, etc.
```

### Domain Portfolio Utilization
Based on our acquired domains:
- **exora.au** - Primary Australian business email
- **exorahealth.com.au** - Primary website and marketing
- **exoracare.com** - International expansion email
- **exoracare.au** - Alternative Australian healthcare focus
- **Other domains** - Redirects and future expansion

---

## C. Email Provider Analysis

### Selected: FastMail (Immediate Implementation)

**Cost:** $6 AUD/user/month (Business Standard)

**Pros:**
- 🇦🇺 **Australian servers** - Data sovereignty for healthcare
- ✅ **Excellent deliverability** - Critical for magic links
- ✅ **600+ aliases** - Unlimited departmental addresses
- ✅ **Custom domains** - Professional branding
- ✅ **API access** - Integration capabilities
- ✅ **Fast setup** - Can be operational today

**Cons:**
- ❌ No native end-to-end encryption (acceptable for Phase 1)
- ❌ Limited collaboration features vs Google Workspace

### Alternatives Evaluated

#### Google Workspace
- **Cost:** $7.20-14.40 AUD/user/month
- **Pros:** HIPAA BAA available, familiar interface, excellent collaboration
- **Cons:** US-based servers, complex HIPAA configuration
- **Decision:** Consider for Phase 2 if collaboration needs increase

#### ProtonMail
- **Cost:** $7.99-12.99 USD/user/month  
- **Pros:** End-to-end encryption, Swiss privacy laws
- **Cons:** Higher cost, foreign jurisdiction, less familiar
- **Decision:** Overkill for current needs, revisit for secure health emails

---

## D. Implementation Plan

### Phase 1: Immediate Setup (Today - August 15, 2025)

#### 1. FastMail Configuration
- [ ] Sign up for FastMail Business Standard
- [ ] Add exora.au domain (Phase 1 primary email)
- [ ] Configure DNS records:
  - MX records for email routing
  - SPF record for sender verification
  - DKIM for email authentication
  - DMARC for policy enforcement
- [ ] Create initial email accounts
- [ ] Set up email aliases for departments
- [ ] Configure email signatures with company details

#### 2. DNS Configuration Template (exora.au)
```dns
; MX Records (FastMail) for exora.au
@  MX  10  in1-smtp.messagingengine.com.
@  MX  20  in2-smtp.messagingengine.com.

; SPF Record
@  TXT  "v=spf1 include:spf.messagingengine.com ~all"

; DKIM (Will be provided by FastMail after domain verification)
fm1._domainkey  CNAME  fm1.exora.au.dkim.fmhosted.com.
fm2._domainkey  CNAME  fm2.exora.au.dkim.fmhosted.com.

; DMARC
_dmarc  TXT  "v=DMARC1; p=quarantine; rua=mailto:privacy@exora.au"
```

#### 3. Future DNS Setup (exoracare.com - International)
```dns
; For Phase 2 International Expansion
; MX Records (FastMail) for exoracare.com
@  MX  10  in1-smtp.messagingengine.com.
@  MX  20  in2-smtp.messagingengine.com.

; SPF Record
@  TXT  "v=spf1 include:spf.messagingengine.com ~all"

; DKIM (Will be provided by FastMail after domain verification)
fm1._domainkey  CNAME  fm1.exoracare.com.dkim.fmhosted.com.
fm2._domainkey  CNAME  fm2.exoracare.com.dkim.fmhosted.com.

; DMARC
_dmarc  TXT  "v=DMARC1; p=quarantine; rua=mailto:privacy@exoracare.com"
```

### Phase 2: Healthcare Data Infrastructure (3-6 months)

#### Custom Email Parser Service Architecture
```typescript
// Email Processing Pipeline
interface EmailHealthDataPipeline {
  // 1. Email Reception
  receiveEmail: (email: InboundEmail) => Promise<ProcessedEmail>;
  
  // 2. Document Extraction
  extractAttachments: (email: ProcessedEmail) => Promise<Document[]>;
  
  // 3. NLP Processing
  parseHealthData: (content: string) => Promise<HealthData>;
  
  // 4. FHIR Transformation
  transformToFHIR: (data: HealthData) => Promise<FHIRResource>;
  
  // 5. Validation & Storage
  validateAndStore: (resource: FHIRResource) => Promise<StorageResult>;
}
```

#### User Health Email Strategy Options

**Option A: Provided Addresses (username@health.exora.au)**
- Each user gets dedicated health email
- Full control over parsing pipeline
- Higher infrastructure cost
- Best privacy and control

**Option B: BYO Email with OAuth Forwarding**
- Users authorize email access via OAuth
- Read health-related emails from existing inbox
- Complex permissions and filtering
- Privacy concerns

**Option C: Hybrid Approach (Recommended)**
- Provide optional health emails
- Support email forwarding rules
- Parse both dedicated and forwarded emails
- Maximum flexibility

---

## E. Innovative Features

### 1. Passive Health Data Collection

**The Vision:** Users forward all medical communications to their Exora health email, creating a passive, comprehensive health record without manual data entry.

**How it works:**
1. User receives lab results email → forwards to `myhealth@exora.au`
2. System automatically extracts structured data
3. AI validates and categorizes information
4. Data appears in Guardian timeline with source attribution
5. User reviews and confirms additions

### 2. Smart Email Parsing Features

- **Provider Recognition:** Identify legitimate healthcare providers
- **Document Classification:** Categorize as lab result, prescription, appointment, etc.
- **Data Extraction:** Pull structured data from unstructured emails
- **Duplicate Detection:** Prevent redundant entries
- **Confidence Scoring:** Flag uncertain extractions for review

### 3. Integration Opportunities

**Current Gap in Market:**
- MyChart doesn't accept email data
- Apple Health has no email integration  
- Google Health discontinued
- **Opportunity:** First comprehensive email-based health aggregator

**Potential Integrations:**
- Hospital discharge summaries
- Pharmacy prescription notifications
- Pathology lab results
- Radiology reports
- Appointment reminders
- Insurance EOBs

---

## F. Security & Compliance

### Healthcare Email Requirements

#### Australian Privacy Act Compliance
- Data must remain in Australia (FastMail ✅)
- Clear consent for data processing
- Right to access and correction
- Breach notification procedures

#### HIPAA Readiness (Future US Expansion)
- Business Associate Agreements required
- Encryption in transit and at rest
- Audit logging of all access
- Minimum necessary principle

### Security Implementation

```typescript
// Email Security Layer
class SecureHealthEmail {
  // Encryption at rest
  private encryptContent(content: string): EncryptedData {
    return encrypt(content, this.patientKey);
  }
  
  // Zero-knowledge architecture
  private async processEmail(email: InboundEmail): Promise<void> {
    const encrypted = this.encryptContent(email.body);
    await this.store(encrypted);
    // Exora never sees unencrypted content
  }
  
  // Audit trail
  private logAccess(action: EmailAction): void {
    auditLog.record({
      timestamp: Date.now(),
      action: action.type,
      emailId: action.emailId,
      accessor: action.userId,
      purpose: action.purpose
    });
  }
}
```

---

## G. Cost Analysis

### Year 1 Projections

#### Business Email (FastMail)
- 5 users × $6/month × 12 months = **$360 AUD**
- Domain costs (already paid): $0
- Total Year 1: **$360 AUD**

#### Future Health Email Infrastructure
- **Parse Service (Supabase Edge Functions):** ~$50/month
- **Email Storage (Supabase):** ~$20/month  
- **AI Processing (GPT-4o Mini):** ~$100/month
- **Estimated Monthly:** $170 AUD
- **Estimated Annual:** $2,040 AUD

---

## H. Success Metrics

### Phase 1 (Business Email)
- [ ] All team members have professional emails
- [ ] Support emails responded to within 24 hours
- [ ] Zero deliverability issues for magic links
- [ ] SPF/DKIM/DMARC properly configured

### Phase 2 (Health Email System)
- [ ] 50% of users try health email feature
- [ ] 95% accuracy in health data extraction
- [ ] <2 minute processing time per email
- [ ] Zero false positive provider identification
- [ ] 100% audit trail completeness

---

## I. Implementation Checklist

### Today (August 15, 2025)
- [ ] Sign up for FastMail Business Standard
- [ ] Configure exora.au domain (Phase 1 primary)
- [ ] Set up DNS records in domain registrar
- [ ] Create primary email accounts (xavier@exora.au, support@exora.au)
- [ ] Test email sending/receiving
- [ ] Update all business materials with new emails
- [ ] Document email access credentials securely

### This Week
- [ ] Configure Vercel with primary domain
- [ ] Transfer domains to Exora Health Pty Ltd
- [ ] Implement email templates for user communications
- [ ] Test magic link delivery with new email

### Next Month
- [ ] Design email parsing architecture diagrams
- [ ] Research HIPAA-compliant email forwarding
- [ ] Prototype healthcare email data extraction
- [ ] Evaluate NLP libraries for medical text

### Next Quarter
- [ ] Build production email ingestion pipeline
- [ ] Implement patient email provisioning system
- [ ] Create user documentation for health email
- [ ] Launch beta test with early adopters

---

## J. Key Insights & Strategic Advantages

### Market Differentiation
1. **Unique Position:** No major platform offers comprehensive email-based health data collection
2. **Patient Convenience:** Passive data collection requires zero behavior change
3. **Provider Friendly:** Works with existing healthcare communication systems
4. **Australian First:** Leverage local market before global expansion

### Technical Innovation
1. **Email as Healthcare API:** Transform unstructured emails into structured FHIR resources
2. **AI-Powered Extraction:** Use latest LLMs for medical document understanding
3. **Zero-Knowledge Architecture:** Patient data encrypted with patient keys
4. **Distributed Collection:** Each patient becomes a data collection node

### Business Model Opportunities
1. **Freemium:** Basic email parsing free, advanced features paid
2. **Provider Partnerships:** Hospitals pay for streamlined communication
3. **Insurance Integration:** Insurers pay for claims automation
4. **Research Platform:** Anonymized data for medical research

---

## K. Decision Summary

### Immediate Action (Today)
✅ **Phase 1: Use FastMail on @exora.au**
- Ultra-short, memorable email addresses
- Australian data sovereignty (.au domain)
- Immediate availability and setup
- Cost-effective start ($6/month)

✅ **Phase 2: International expansion with @exoracare.com**
- Global scalability without geographic limitations
- "Care" positioning more approachable than "health"
- Leverages existing domain portfolio
- Future-proofs international growth

### Strategic Vision
✅ **Build custom email parsing service as core differentiator**
- Addresses real gap in PGHD collection
- Leverages existing healthcare communication patterns
- Creates defensible competitive advantage
- Aligns with Guardian's patient-owned data philosophy

---

## Appendix: Technical Resources

### FastMail Setup Guide
- [FastMail Business Setup](https://www.fastmail.com/business/)
- [Custom Domain Configuration](https://www.fastmail.help/hc/en-us/articles/360058752854)
- [DNS Records Guide](https://www.fastmail.help/hc/en-us/articles/360058752834)

### Healthcare Standards
- [FHIR Email Communication](http://hl7.org/fhir/communication.html)
- [Australian Privacy Act Healthcare](https://www.oaic.gov.au/privacy/privacy-for-health-service-providers)
- [HIPAA Email Requirements](https://www.hhs.gov/hipaa/for-professionals/faq/570/does-hipaa-permit-health-care-providers-to-use-email-to-discuss-health-issues-with-patients/index.html)

### Email Parsing Libraries
- [MailParser (Node.js)](https://nodemailer.com/extras/mailparser/)
- [Python Email Parser](https://docs.python.org/3/library/email.parser.html)
- [Nylas Email API](https://www.nylas.com/products/email-api/)

---

*This document represents Exora Health's comprehensive email infrastructure strategy, balancing immediate business needs with innovative healthcare data collection vision.*