# Australian Privacy Act 1988 Compliance

**Regulation:** Privacy Act 1988 (Cth) + Privacy Amendment (Notifiable Data Breaches) Scheme  
**Jurisdiction:** Australia (Primary market)  
**Last Updated:** 2025-08-13  
**Compliance Status:** In progress (Phase 3.2)

---

## **Regulatory Overview**

The Privacy Act 1988 governs the handling of personal information by organizations in Australia. As a healthcare platform processing sensitive health information, Guardian must comply with the Australian Privacy Principles (APPs) and maintain appropriate security safeguards.

### **Key Regulatory Components**
- **Australian Privacy Principles (APPs)** - 13 principles governing personal information handling
- **Notifiable Data Breaches (NDB) Scheme** - Mandatory breach notification requirements
- **Health Records and Information Privacy Act** - Additional state-level requirements (varies by state)

---

## **Australian Privacy Principles (APPs) Compliance**

### **APP 1: Open and Transparent Management of Personal Information**

**Requirement:** Have a clear and current privacy policy

**Guardian Implementation:**
- [ ] **Privacy Policy:** Comprehensive privacy policy published and accessible
- [ ] **Collection Notice:** Clear notice at point of data collection
- [ ] **Regular Updates:** Privacy policy reviewed and updated regularly
- [ ] **Contact Information:** Privacy officer contact details provided

**Technical Implementation:**
```typescript
// Privacy notice integration in forms
const CollectionNotice = () => (
  <div className="privacy-notice">
    <p>By uploading medical documents, you consent to Guardian processing 
       your health information in accordance with our Privacy Policy.</p>
    <Link href="/privacy-policy">Read our Privacy Policy</Link>
  </div>
);
```

### **APP 2: Anonymity and Pseudonymity**

**Requirement:** Give individuals option to remain anonymous or use pseudonym where practicable

**Guardian Implementation:**
- [ ] **Profile Names:** Allow pseudonymous profile names (not full legal names required)
- [ ] **Optional Fields:** Make non-essential personal details optional
- [ ] **De-identification:** Implement data de-identification for analytics

### **APP 3: Collection of Solicited Personal Information**

**Requirement:** Only collect personal information that is reasonably necessary

**Guardian Implementation:**
- [ ] **Data Minimization:** Collect only health information necessary for services
- [ ] **Purpose Limitation:** Clear statement of collection purposes
- [ ] **Consent Mechanisms:** Explicit consent for health information collection

**Current Collection Purposes:**
- Medical document storage and organization
- Health timeline generation
- Provider portal access facilitation
- Service improvement and analytics (de-identified)

### **APP 4: Dealing with Unsolicited Personal Information**

**Requirement:** Destroy or de-identify unsolicited personal information if not permitted to collect

**Guardian Implementation:**
- [ ] **OCR Filtering:** Remove incidental personal information from OCR processing
- [ ] **Automated Detection:** PII detection in uploaded documents
- [ ] **Purge Procedures:** Automatic removal of unsolicited information

### **APP 5: Notification of Collection**

**Requirement:** Notify individuals when collecting their personal information

**Guardian Implementation:**
- [ ] **Collection Notice:** Prominent notice on all data collection forms
- [ ] **Purpose Statement:** Clear explanation of why information is collected
- [ ] **Disclosure Information:** Details of who information may be shared with

**Collection Notice Template:**
```
We collect your health information to:
- Store and organize your medical documents
- Generate your health timeline
- Facilitate secure provider access (with consent)
- Improve our services (de-identified data only)

Your information may be shared with:
- Healthcare providers you authorize
- Cloud storage providers (with encryption)
- Analytics services (de-identified data only)
```

### **APP 6: Use or Disclosure**

**Requirement:** Only use or disclose personal information for stated purposes

**Guardian Implementation:**
- [ ] **Purpose Enforcement:** Technical controls prevent use beyond stated purposes
- [ ] **Provider Consent:** Explicit consent required for provider access
- [ ] **Analytics De-identification:** Remove personal identifiers before analytics

### **APP 7: Direct Marketing**

**Requirement:** Restrictions on using personal information for direct marketing

**Guardian Implementation:**
- [ ] **No Health Data Marketing:** Never use health information for marketing
- [ ] **Opt-out Mechanisms:** Easy unsubscribe from marketing communications
- [ ] **Consent Tracking:** Record marketing consent separately

### **APP 8: Cross-border Disclosure**

**Requirement:** Restrictions on disclosing personal information overseas

**Guardian Implementation:**
- [ ] **Data Residency:** Primary data storage in Australia (Supabase AU region)
- [ ] **Cloud Provider Agreements:** Ensure overseas providers meet APP standards
- [ ] **Encryption Requirements:** Strong encryption for any overseas transfer

**Current Overseas Disclosures:**
- Supabase (US company, Australian data center)
- Vercel (US company, global CDN with Australian presence)
- OpenAI/Google Cloud (AI processing - requires explicit consent)

### **APP 9: Government Related Identifiers**

**Requirement:** Restrictions on adopting government identifiers

**Guardian Implementation:**
- [ ] **Medicare Number Protection:** Never use Medicare number as primary identifier
- [ ] **Internal IDs:** Use UUID-based internal identifier system
- [ ] **Consent for Government IDs:** Explicit consent for storing government identifiers

### **APP 10: Quality of Personal Information**

**Requirement:** Ensure personal information is accurate, up-to-date and complete

**Guardian Implementation:**
- [ ] **Data Validation:** Input validation and verification procedures
- [ ] **Update Mechanisms:** Easy ways for users to update their information
- [ ] **Quality Checks:** Regular data quality assessments

### **APP 11: Security**

**Requirement:** Protect personal information with reasonable security measures

**Guardian Implementation:**
- [ ] **Encryption:** End-to-end encryption for health information
- [ ] **Access Controls:** Role-based access with audit trails
- [ ] **Security Monitoring:** Real-time security monitoring and alerting
- [ ] **Regular Assessments:** Quarterly security assessments

**Technical Security Measures:**
```typescript
// Data encryption
const encryptHealthData = (data: HealthRecord) => {
  return encrypt(data, process.env.HEALTH_DATA_KEY);
};

// Access logging
const logDataAccess = (userId: string, recordId: string) => {
  auditLog.info('Health data accessed', {
    userId,
    recordId,
    timestamp: new Date(),
    purpose: 'patient_access'
  });
};
```

### **APP 12: Access to Personal Information**

**Requirement:** Give individuals access to their personal information

**Guardian Implementation:**
- [ ] **Dashboard Access:** Complete access to all stored health information
- [ ] **Data Export:** Downloadable export of all personal data
- [ ] **Access Logging:** Log all access requests and responses
- [ ] **Timely Response:** Respond to access requests within 30 days

### **APP 13: Correction of Personal Information**

**Requirement:** Allow individuals to correct their personal information

**Guardian Implementation:**
- [ ] **Edit Functionality:** Easy editing of profile and health information
- [ ] **Correction Tracking:** Audit trail of all corrections made
- [ ] **Notification:** Notify relevant parties of corrections (if disclosed)

---

## **Notifiable Data Breaches (NDB) Scheme**

### **Breach Notification Requirements**

**Criteria for Notification:**
- Unauthorized access or disclosure of personal information
- Loss of personal information in circumstances likely to result in unauthorized access/disclosure
- Likely to result in serious harm to affected individuals

**Timeline Requirements:**
- **Assessment:** Determine if breach meets criteria (30 days maximum)
- **Notification:** Notify OAIC and affected individuals (as soon as practicable)
- **Documentation:** Maintain records of all data breaches

### **Guardian Breach Response Plan**

**Immediate Response (0-24 hours):**
1. [ ] **Contain Breach:** Immediate technical measures to stop ongoing breach
2. [ ] **Assessment Team:** Activate privacy breach response team
3. [ ] **Initial Assessment:** Determine scope and severity
4. [ ] **Preliminary Documentation:** Begin breach incident log

**Assessment Phase (1-30 days):**
1. [ ] **Detailed Investigation:** Full technical and impact assessment
2. [ ] **Legal Consultation:** Engage privacy lawyers for notification requirements
3. [ ] **Harm Assessment:** Evaluate likely serious harm to individuals
4. [ ] **Notification Decision:** Determine if OAIC notification required

**Notification Phase (As soon as practicable):**
1. [ ] **OAIC Notification:** Submit online notification form
2. [ ] **Individual Notification:** Direct notification to affected individuals
3. [ ] **Public Notification:** If individual notification not practicable
4. [ ] **Stakeholder Communication:** Notify relevant partners/providers

**Template Notification:**
```
Subject: Important Security Notice - Guardian Health Platform

We are writing to inform you of a privacy incident that may have affected 
your health information stored on the Guardian platform.

What Happened: [Brief description]
Information Involved: [Types of data]
What We Are Doing: [Response actions]
What You Can Do: [Recommended actions]

For more information, contact our Privacy Officer at privacy@guardian.com.au
```

---

## **Compliance Monitoring**

### **Regular Assessments**
- [ ] **Monthly:** Privacy impact assessment review
- [ ] **Quarterly:** APP compliance audit
- [ ] **Annually:** Full privacy compliance review
- [ ] **As needed:** Breach incident response drills

### **Key Performance Indicators**
- **Data Subject Requests:** Response time < 30 days (APP 12 requirement)
- **Breach Notification:** OAIC notification < 72 hours when required
- **Consent Rate:** 100% explicit consent for health data collection
- **Audit Completeness:** 100% of health data access logged

### **Documentation Requirements**
- [ ] Privacy policy current and accessible
- [ ] Collection notices on all forms
- [ ] Consent records maintained
- [ ] Breach incident register
- [ ] Staff privacy training records

---

## **Implementation Checklist**

### **Phase 3.2 Immediate Actions**
- [ ] **Privacy Policy:** Draft comprehensive privacy policy
- [ ] **Collection Notices:** Add to all data collection points
- [ ] **Consent Mechanisms:** Implement explicit consent for health data
- [ ] **Breach Procedures:** Document incident response procedures

### **Technical Implementation**
- [ ] **Data Classification:** Identify and tag all personal/health information
- [ ] **Access Controls:** Implement APP-compliant access restrictions
- [ ] **Audit Logging:** Comprehensive logging of health data access
- [ ] **Data Export:** Build user data export functionality

### **Operational Procedures**
- [ ] **Staff Training:** Privacy awareness training for all staff
- [ ] **Vendor Management:** Privacy clauses in all vendor contracts
- [ ] **Regular Reviews:** Quarterly privacy compliance reviews

---

## **Legal Considerations**

### **Professional Advice Required**
- [ ] **Privacy Lawyer:** Engage Australian privacy law specialist
- [ ] **Privacy Officer:** Designate qualified privacy officer
- [ ] **Health Law Expert:** Consult on health-specific privacy requirements

### **Ongoing Legal Obligations**
- Monitor regulatory changes and updates
- Maintain current privacy impact assessments
- Ensure staff privacy training currency
- Regular legal compliance reviews

---

**Next Review:** Quarterly or upon regulatory changes  
**Legal Sign-off Required:** Privacy lawyer review before production  
**OAIC Resources:** [Privacy business resource](https://www.oaic.gov.au/privacy/guidance-and-advice/)