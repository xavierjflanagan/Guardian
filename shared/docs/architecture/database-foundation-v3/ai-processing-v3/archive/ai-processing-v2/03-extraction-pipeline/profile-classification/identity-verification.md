# Identity Verification System

**Purpose:** Extract and validate identity information from medical documents for profile matching  
**Focus:** Text and vision-based identity extraction with multi-modal validation  
**Priority:** CRITICAL - Foundation for profile classification accuracy  
**Dependencies:** OCR systems, vision AI, user_profiles table structure

---

## System Overview

The Identity Verification system extracts patient identity information from uploaded medical documents using multiple extraction methods, validates the extracted data, and provides confidence-scored identity profiles for downstream profile matching algorithms.

### Core Identity Data Model
```typescript
interface ExtractedIdentity {
  // Primary identity fields
  names: IdentityName[];              // All detected names with confidence
  dateOfBirth: IdentityDate | null;   // DOB with validation status
  medicalIdentifiers: MedicalId[];    // Medicare, insurance numbers
  addresses: IdentityAddress[];       // Current and historical addresses
  phoneNumbers: IdentityPhone[];      // Contact numbers with validation
  
  // Extraction metadata
  confidence: number;                 // Overall extraction confidence (0-1)
  extractionMethods: string[];        // Methods used for extraction
  rawText: string;                    // Full document text for context
  
  // Validation results
  consistencyScore: number;           // Cross-field validation score
  medicalContext: MedicalContext;     // Clinical context for validation
  qualityMetrics: ExtractionQuality; // Quality assessment data
}

interface IdentityName {
  fullName: string;                   // Complete name as extracted
  firstName: string;                  // Parsed first name
  lastName: string;                   // Parsed last name
  middleNames: string[];              // Middle names/initials
  confidence: number;                 // Name extraction confidence
  source: 'header' | 'body' | 'signature' | 'metadata';
  variants: string[];                 // Detected name variations
}

interface IdentityDate {
  date: Date;                         // Parsed date object
  originalText: string;               // Raw text as extracted
  format: string;                     // Detected date format
  confidence: number;                 // Date parsing confidence
  validation: DateValidation;         // Age and consistency checks
}

interface MedicalId {
  type: 'medicare' | 'insurance' | 'patient' | 'member';
  value: string;                      // Identifier value
  confidence: number;                 // Extraction confidence
  validation: IdValidation;           // Format and checksum validation
}
```

---

## Identity Extraction Engine

### Multi-Modal Extraction Strategy
```typescript
class IdentityExtractionEngine {
  async extractIdentity(document: ProcessedDocument): Promise<ExtractedIdentity> {
    const extractionResults = await Promise.all([
      this.textBasedExtraction(document.text),
      this.visionBasedExtraction(document.imagePath),
      this.metadataExtraction(document.metadata),
      this.structuredDataExtraction(document.parsedData)
    ]);
    
    // Merge and validate extraction results
    return this.mergeExtractionResults(extractionResults);
  }

  private async textBasedExtraction(text: string): Promise<TextExtractionResult> {
    const patterns = this.getExtractionPatterns();
    const results: Partial<ExtractedIdentity> = {};
    
    // Name extraction with multiple patterns
    results.names = await this.extractNames(text, patterns.namePatterns);
    
    // Date of birth extraction
    results.dateOfBirth = await this.extractDateOfBirth(text, patterns.dobPatterns);
    
    // Medical identifier extraction  
    results.medicalIdentifiers = await this.extractMedicalIds(text, patterns.medicalIdPatterns);
    
    // Address and contact extraction
    results.addresses = await this.extractAddresses(text, patterns.addressPatterns);
    results.phoneNumbers = await this.extractPhoneNumbers(text, patterns.phonePatterns);
    
    return {
      ...results,
      confidence: this.calculateTextExtractionConfidence(results),
      extractionMethod: 'text-based'
    };
  }

  private getExtractionPatterns(): ExtractionPatterns {
    return {
      namePatterns: [
        // Patient field patterns
        /Patient(?:\s*Name)?:\s*([A-Za-z\s\-'\.]+)/i,
        /Name:\s*([A-Za-z\s\-'\.]+)/i,
        /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})(?=\s*[\n\r])/m, // Full name at line start
        
        // Letter/document salutations
        /Dear\s+([A-Za-z\s\-'\.]+)/i,
        /Dear\s+(Mr|Mrs|Ms|Dr|Prof)\.?\s+([A-Za-z\s\-'\.]+)/i,
        
        // Insurance/member patterns
        /Member(?:\s*Name)?:\s*([A-Za-z\s\-'\.]+)/i,
        /Insured:\s*([A-Za-z\s\-'\.]+)/i,
        /Policy\s*Holder:\s*([A-Za-z\s\-'\.]+)/i,
        
        // Clinical document patterns
        /Patient\s+Information[:\s]*([A-Za-z\s\-'\.]+)/i,
        /(?:Name|Patient):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
      ],
      
      dobPatterns: [
        // Standard date formats
        /DOB:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,
        /Date\s*of\s*Birth:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,
        /Birth\s*Date:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,
        /Born:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,
        
        // Alternative formats
        /DOB:?\s*(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/i, // YYYY-MM-DD
        /(\d{1,2}(?:st|nd|rd|th)\s+[A-Za-z]+\s+\d{4})/i,    // 1st January 2000
        /([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?\s*,?\s+\d{4})/i, // January 1st, 2000
      ],
      
      medicalIdPatterns: [
        // Australian Medicare
        /Medicare\s*(?:Number|#)?:?\s*(\d{10}|\d{4}\s*\d{6})/i,
        /Medicare\s*Card:?\s*(\d{10}|\d{4}\s*\d{6})/i,
        
        // Insurance member IDs
        /Member\s*(?:Number|ID|#)?:?\s*([A-Z0-9]{6,15})/i,
        /Policy\s*(?:Number|#)?:?\s*([A-Z0-9]{6,15})/i,
        /Insurance\s*ID:?\s*([A-Z0-9]{6,15})/i,
        
        // Patient IDs
        /Patient\s*(?:ID|Number|#):?\s*([A-Z0-9]{6,20})/i,
        /Medical\s*Record\s*(?:Number|#):?\s*([A-Z0-9]{6,20})/i,
        /MRN:?\s*([A-Z0-9]{6,20})/i,
      ],
      
      addressPatterns: [
        /Address:?\s*([^\n\r]+(?:\n[^\n\r]+)*?)(?=\n\s*\n|\n[A-Z]|$)/i,
        /(?:Street|Home|Residential)\s*Address:?\s*([^\n\r]+)/i,
        /(?:Address|Addr):\s*([^\n]+(?:\n[^A-Z\n][^\n]*)*)/i,
      ],
      
      phonePatterns: [
        // Australian phone formats
        /(?:Phone|Tel|Mobile|Cell):?\s*((?:\+?61\s*)?[0-9\s\-\(\)]{10,15})/i,
        /(\(\d{2,3}\)\s*\d{4}\s*\d{4})/,                    // (03) 1234 5678
        /(\d{4}\s*\d{3}\s*\d{3})/,                          // 0412 345 678
        /(\+61\s*[0-9\s\-]{9,12})/,                         // +61 formats
      ]
    };
  }
}
```

### Vision-Based Identity Extraction
```typescript
class VisionIdentityExtractor {
  async extractFromImage(imagePath: string): Promise<VisionExtractionResult> {
    const prompt = this.buildVisionExtractionPrompt();
    
    try {
      const response = await this.visionAPI.analyze(imagePath, prompt);
      
      return {
        identity: this.parseVisionResponse(response),
        confidence: response.confidence || 0.8,
        extractionMethod: 'vision-ai',
        cost: this.estimateCost(imagePath),
        regions: response.detectedRegions // Spatial data for click-to-zoom
      };
      
    } catch (error) {
      console.warn('Vision extraction failed, falling back to OCR:', error);
      return this.fallbackOCRExtraction(imagePath);
    }
  }

  private buildVisionExtractionPrompt(): string {
    return `
Analyze this medical document image and extract patient identity information.

EXTRACT THE FOLLOWING INFORMATION:
1. PATIENT NAME(S):
   - Look for: "Patient:", "Name:", header areas, letterhead recipients
   - Include: All name variations found (full name, first/last combinations)
   - Format: Provide confidence score for each name (0-1)

2. DATE OF BIRTH:
   - Look for: "DOB:", "Date of Birth:", "Born:", age calculations
   - Formats: MM/DD/YYYY, DD/MM/YYYY, Month DD, YYYY, etc.
   - Validate: Check if date makes sense (not future, not impossibly old)

3. MEDICAL IDENTIFIERS:
   - Medicare numbers (10 digits, may have spaces)
   - Insurance member IDs (alphanumeric)
   - Patient ID numbers from headers/footers
   - Medical record numbers (MRN)

4. CONTACT INFORMATION:
   - Addresses (full addresses, not just cities)
   - Phone numbers (all formats)
   - Email addresses if present

5. DOCUMENT CONTEXT:
   - Type of document (prescription, lab report, clinical note, etc.)
   - Medical facility/provider information
   - Date of document/service
   - Any family relationship indicators (parent of, guardian of, etc.)

IMPORTANT RULES:
- Be conservative with confidence scores (only >0.9 for crystal clear text)
- Mark low-quality/unclear text with confidence <0.6
- Include spatial coordinates for each extracted field when possible
- Distinguish between patient name and doctor/provider names
- Handle multiple names in family documents appropriately

Return JSON format:
{
  "names": [{"fullName": "string", "confidence": 0.95, "region": {"x": 0, "y": 0, "width": 100, "height": 20}}],
  "dateOfBirth": {"date": "YYYY-MM-DD", "originalText": "string", "confidence": 0.9},
  "medicalIds": [{"type": "medicare", "value": "1234567890", "confidence": 0.85}],
  "addresses": [{"fullAddress": "string", "confidence": 0.8}],
  "phoneNumbers": [{"number": "string", "confidence": 0.7}],
  "documentContext": {"type": "prescription", "provider": "string", "date": "YYYY-MM-DD"},
  "overallConfidence": 0.85
}
`;
  }

  private parseVisionResponse(response: VisionAPIResponse): ExtractedIdentity {
    const data = JSON.parse(response.text);
    
    return {
      names: data.names?.map(name => ({
        fullName: name.fullName,
        firstName: this.parseFirstName(name.fullName),
        lastName: this.parseLastName(name.fullName),
        middleNames: this.parseMiddleNames(name.fullName),
        confidence: name.confidence,
        source: 'vision',
        variants: this.generateNameVariants(name.fullName),
        region: name.region
      })) || [],
      
      dateOfBirth: data.dateOfBirth ? {
        date: new Date(data.dateOfBirth.date),
        originalText: data.dateOfBirth.originalText,
        format: this.detectDateFormat(data.dateOfBirth.originalText),
        confidence: data.dateOfBirth.confidence,
        validation: this.validateDateOfBirth(new Date(data.dateOfBirth.date))
      } : null,
      
      medicalIdentifiers: data.medicalIds?.map(id => ({
        type: id.type,
        value: id.value,
        confidence: id.confidence,
        validation: this.validateMedicalId(id.type, id.value)
      })) || [],
      
      // ... additional fields
      
      confidence: data.overallConfidence,
      extractionMethods: ['vision-ai'],
      rawText: response.ocrText || '',
      medicalContext: this.analyzeMedicalContext(data.documentContext)
    };
  }
}
```

---

## Identity Validation System

### Cross-Field Consistency Validation
```typescript
class IdentityValidator {
  async validateExtractedIdentity(identity: ExtractedIdentity): Promise<ValidationResult> {
    const validations = await Promise.all([
      this.validateNameConsistency(identity.names),
      this.validateDateOfBirth(identity.dateOfBirth),
      this.validateMedicalIdentifiers(identity.medicalIdentifiers),
      this.validateContactInformation(identity.addresses, identity.phoneNumbers),
      this.validateMedicalContext(identity.medicalContext)
    ]);
    
    return this.combineValidationResults(validations);
  }

  private async validateNameConsistency(names: IdentityName[]): Promise<NameValidation> {
    if (names.length === 0) {
      return { valid: false, confidence: 0, issues: ['No names extracted'] };
    }
    
    // Check for name consistency across multiple extractions
    const uniqueNames = this.normalizeAndDeduplicateNames(names);
    
    if (uniqueNames.length === 1) {
      return { 
        valid: true, 
        confidence: names[0].confidence,
        issues: [],
        canonicalName: uniqueNames[0]
      };
    }
    
    // Multiple names detected - check if they're variants of the same person
    const nameGroups = this.groupSimilarNames(uniqueNames);
    
    if (nameGroups.length === 1) {
      // All names appear to be variants of the same person
      return {
        valid: true,
        confidence: Math.min(...names.map(n => n.confidence)),
        issues: [`Multiple name variants detected: ${uniqueNames.join(', ')}`],
        canonicalName: this.selectBestName(nameGroups[0])
      };
    }
    
    // Multiple distinct names - family document or unclear
    return {
      valid: false,
      confidence: 0.5,
      issues: [`Multiple distinct names detected: ${uniqueNames.join(', ')}`],
      requiresDisambiguation: true,
      nameOptions: nameGroups.map(group => this.selectBestName(group))
    };
  }

  private async validateDateOfBirth(dob: IdentityDate | null): Promise<DateValidation> {
    if (!dob) {
      return { valid: false, confidence: 0, issues: ['No date of birth extracted'] };
    }
    
    const now = new Date();
    const age = now.getFullYear() - dob.date.getFullYear();
    
    // Basic sanity checks
    if (dob.date > now) {
      return { 
        valid: false, 
        confidence: 0, 
        issues: ['Date of birth is in the future'] 
      };
    }
    
    if (age > 150 || age < 0) {
      return { 
        valid: false, 
        confidence: 0.2, 
        issues: [`Unrealistic age: ${age} years`] 
      };
    }
    
    // Age-based confidence adjustments
    let confidence = dob.confidence;
    
    // Very young or very old patients might need additional verification
    if (age < 1) {
      confidence *= 0.9; // Infants
    } else if (age > 100) {
      confidence *= 0.8; // Centenarians
    }
    
    return {
      valid: true,
      confidence,
      issues: [],
      age,
      ageCategory: this.categorizeAge(age)
    };
  }

  private async validateMedicalIdentifiers(ids: MedicalId[]): Promise<IdValidation> {
    const validations = await Promise.all(
      ids.map(id => this.validateSingleMedicalId(id))
    );
    
    const validIds = validations.filter(v => v.valid);
    const invalidIds = validations.filter(v => !v.valid);
    
    if (validIds.length === 0 && invalidIds.length > 0) {
      return {
        valid: false,
        confidence: 0.3,
        issues: ['All medical identifiers failed validation'],
        invalidIds: invalidIds.map(v => v.identifier)
      };
    }
    
    return {
      valid: validIds.length > 0,
      confidence: validIds.length > 0 ? Math.max(...validIds.map(v => v.confidence)) : 0,
      issues: invalidIds.map(v => `Invalid ${v.identifier?.type}: ${v.issues.join(', ')}`),
      validatedIds: validIds.map(v => v.identifier)
    };
  }

  private async validateSingleMedicalId(id: MedicalId): Promise<SingleIdValidation> {
    switch (id.type) {
      case 'medicare':
        return this.validateMedicareNumber(id);
      case 'insurance':
        return this.validateInsuranceId(id);
      case 'patient':
      case 'member':
        return this.validateGenericMedicalId(id);
      default:
        return { 
          valid: false, 
          confidence: 0, 
          issues: [`Unknown identifier type: ${id.type}`],
          identifier: id 
        };
    }
  }

  private validateMedicareNumber(id: MedicalId): SingleIdValidation {
    const cleanNumber = id.value.replace(/\s/g, '');
    
    // Australian Medicare numbers are 10 digits
    if (!/^\d{10}$/.test(cleanNumber)) {
      return {
        valid: false,
        confidence: 0,
        issues: ['Medicare number must be 10 digits'],
        identifier: id
      };
    }
    
    // Basic checksum validation for Australian Medicare
    const checkDigit = this.calculateMedicareChecksum(cleanNumber.substring(0, 8));
    const providedCheck = cleanNumber.substring(8, 10);
    
    if (checkDigit !== providedCheck) {
      return {
        valid: false,
        confidence: 0.2,
        issues: ['Medicare number failed checksum validation'],
        identifier: id
      };
    }
    
    return {
      valid: true,
      confidence: Math.min(id.confidence, 0.95), // High confidence for valid Medicare
      issues: [],
      identifier: { ...id, value: cleanNumber }
    };
  }

  private calculateMedicareChecksum(eightDigits: string): string {
    // Simplified Australian Medicare checksum calculation
    const weights = [1, 3, 7, 9, 1, 3, 7, 9];
    let sum = 0;
    
    for (let i = 0; i < 8; i++) {
      sum += parseInt(eightDigits[i]) * weights[i];
    }
    
    const check = sum % 10;
    const reference = Math.floor(Math.random() * 10); // Reference digit (1-9)
    
    return `${check}${reference}`;
  }
}
```

---

## Family Document Handling

### Parent-Child Relationship Detection
```typescript
class FamilyDocumentProcessor {
  async processFamily Document(identity: ExtractedIdentity): Promise<FamilyProcessingResult> {
    // Detect family relationship indicators
    const familyContext = this.detectFamilyContext(identity.rawText);
    
    if (familyContext.hasParentChildIndicators) {
      return this.processParentChildDocument(identity, familyContext);
    }
    
    if (familyContext.hasMultipleNames) {
      return this.processMultiPatientDocument(identity, familyContext);
    }
    
    // Single patient document
    return {
      documentType: 'single-patient',
      primaryIdentity: identity,
      familyMembers: [],
      confidence: identity.confidence
    };
  }

  private detectFamilyContext(text: string): FamilyContext {
    const relationshipPatterns = [
      /parent\s*(?:of|for):?\s*([A-Za-z\s\-']+)/i,
      /guardian\s*(?:of|for):?\s*([A-Za-z\s\-']+)/i,
      /(?:mother|father|mom|dad)\s*(?:of|for):?\s*([A-Za-z\s\-']+)/i,
      /child(?:ren)?\s*(?:of|for):?\s*([A-Za-z\s\-']+)/i,
      /dependent:?\s*([A-Za-z\s\-']+)/i
    ];
    
    const childIndicators = [
      /pediatric|paediatric/i,
      /child(?:ren)?|minor|infant|baby/i,
      /school\s*(?:nurse|health)/i,
      /parent(?:al)?\s*consent/i,
      /guardian\s*authorization/i
    ];
    
    const familyContext: FamilyContext = {
      hasParentChildIndicators: false,
      hasMultipleNames: false,
      relationships: [],
      childIndicators: [],
      ageContexts: []
    };
    
    // Check for explicit relationship mentions
    for (const pattern of relationshipPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        familyContext.hasParentChildIndicators = true;
        familyContext.relationships.push({
          type: 'parent-child',
          parentName: this.extractParentName(text, matches[0]),
          childName: matches[1].trim(),
          confidence: 0.8
        });
      }
    }
    
    // Check for child/pediatric indicators
    for (const indicator of childIndicators) {
      if (indicator.test(text)) {
        familyContext.childIndicators.push(indicator.source);
      }
    }
    
    return familyContext;
  }

  private async processParentChildDocument(
    identity: ExtractedIdentity, 
    familyContext: FamilyContext
  ): Promise<FamilyProcessingResult> {
    
    const relationship = familyContext.relationships[0];
    
    // Determine which extracted name corresponds to parent vs child
    const parentName = this.findBestNameMatch(
      identity.names, 
      relationship.parentName
    );
    
    const childName = this.findBestNameMatch(
      identity.names, 
      relationship.childName
    );
    
    // Create separate identity profiles
    const parentIdentity: ExtractedIdentity = {
      ...identity,
      names: parentName ? [parentName] : [],
      confidence: parentName?.confidence || 0.3
    };
    
    const childIdentity: ExtractedIdentity = {
      ...identity,
      names: childName ? [childName] : [],
      dateOfBirth: this.estimateChildDOB(identity, familyContext),
      confidence: childName?.confidence || 0.5
    };
    
    return {
      documentType: 'parent-child',
      primaryIdentity: childIdentity, // Assume document is about the child
      secondaryIdentity: parentIdentity,
      familyRelationship: relationship,
      confidence: Math.min(childIdentity.confidence, parentIdentity.confidence)
    };
  }

  private estimateChildDOB(
    identity: ExtractedIdentity, 
    familyContext: FamilyContext
  ): IdentityDate | null {
    
    // Look for age mentions in the document
    const agePatterns = [
      /age:?\s*(\d{1,2})\s*(?:years?|yrs?|y\.o\.)/i,
      /(\d{1,2})\s*(?:year|yr)\s*old/i,
      /(\d{1,2})\s*(?:month|mo)\s*old/i
    ];
    
    for (const pattern of agePatterns) {
      const match = identity.rawText.match(pattern);
      if (match) {
        const age = parseInt(match[1]);
        const estimatedDOB = new Date();
        estimatedDOB.setFullYear(estimatedDOB.getFullYear() - age);
        
        return {
          date: estimatedDOB,
          originalText: match[0],
          format: 'estimated-from-age',
          confidence: 0.7,
          validation: this.validateDateOfBirth({
            date: estimatedDOB,
            originalText: match[0],
            format: 'estimated',
            confidence: 0.7
          } as IdentityDate)
        };
      }
    }
    
    return null;
  }
}
```

---

## Performance Optimization

### Caching and Efficiency
```typescript
class IdentityExtractionCache {
  private readonly extractionCache = new Map<string, CachedExtraction>();
  private readonly patternCache = new Map<string, PatternMatch[]>();
  
  async getCachedExtraction(documentHash: string): Promise<ExtractedIdentity | null> {
    const cached = this.extractionCache.get(documentHash);
    
    if (!cached || cached.expiresAt < new Date()) {
      return null;
    }
    
    // Return cached result if confidence is high
    if (cached.identity.confidence > 0.8) {
      return cached.identity;
    }
    
    return null;
  }
  
  async cacheExtraction(
    documentHash: string, 
    identity: ExtractedIdentity
  ): Promise<void> {
    
    // Only cache high-confidence extractions
    if (identity.confidence > 0.7) {
      this.extractionCache.set(documentHash, {
        identity,
        extractedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        hitCount: 0
      });
    }
  }

  // Progressive extraction with early exit
  async extractWithProgressiveSteps(document: ProcessedDocument): Promise<ExtractedIdentity> {
    // Step 1: Quick heuristic extraction
    const quickResult = await this.heuristicExtraction(document.text);
    
    if (quickResult.confidence > 0.85) {
      return quickResult; // Early exit for clear cases
    }
    
    // Step 2: Enhanced text processing
    const enhancedResult = await this.enhancedTextExtraction(document);
    
    if (enhancedResult.confidence > 0.8) {
      return enhancedResult;
    }
    
    // Step 3: Vision AI extraction (most expensive)
    return await this.visionExtractionWithFallback(document);
  }
}
```

---

## Security and Compliance

### PHI Protection Measures
```typescript
interface IdentitySecurityConfig {
  // Data encryption
  encryptExtractedIdentity: boolean;        // Encrypt identity data at rest
  encryptionKeyRotation: number;           // Days between key rotation
  
  // Access logging  
  logIdentityExtractions: boolean;         // Log all extraction attempts
  logIdentityAccess: boolean;              // Log all identity data access
  auditRetentionDays: number;              // Days to retain audit logs
  
  // Data minimization
  redactLogsAfterProcessing: boolean;      // Remove PHI from processing logs
  limitExtractionFields: boolean;          // Only extract necessary identity fields
  automaticDataPurging: boolean;           // Auto-purge cached extractions
  
  // Privacy controls
  consentVerification: boolean;            // Verify consent before extraction
  rightToErasure: boolean;                 // Support data deletion requests
  dataPortability: boolean;                // Support identity data export
}

class IdentitySecurityManager {
  async secureIdentityExtraction(
    identity: ExtractedIdentity,
    userId: string
  ): Promise<SecuredIdentity> {
    
    // Encrypt sensitive fields
    const encryptedIdentity = await this.encryptSensitiveFields(identity);
    
    // Log extraction event (without PHI)
    await this.logExtractionEvent({
      userId,
      extractionMethod: identity.extractionMethods.join(', '),
      confidence: identity.confidence,
      fieldsExtracted: this.getFieldsSummary(identity),
      timestamp: new Date()
    });
    
    // Apply retention policies
    const retentionPolicies = await this.getRetentionPolicies(userId);
    await this.applyRetentionPolicies(encryptedIdentity, retentionPolicies);
    
    return encryptedIdentity;
  }
  
  private async encryptSensitiveFields(identity: ExtractedIdentity): Promise<SecuredIdentity> {
    return {
      ...identity,
      names: await Promise.all(
        identity.names.map(name => this.encryptField(name.fullName))
      ),
      dateOfBirth: identity.dateOfBirth ? 
        await this.encryptField(identity.dateOfBirth.date.toISOString()) : null,
      medicalIdentifiers: await Promise.all(
        identity.medicalIdentifiers.map(id => this.encryptField(id.value))
      ),
      // Non-sensitive fields remain unencrypted for processing
      confidence: identity.confidence,
      extractionMethods: identity.extractionMethods
    };
  }
}
```

---

## Testing and Quality Assurance

### Test Data Categories
```typescript
interface IdentityExtractionTestSuite {
  clearIdentityDocuments: {
    description: "Documents with obvious, well-formatted identity information";
    testCases: [
      "Standard medical records with clear patient headers",
      "Prescription labels with patient name and DOB",
      "Lab results with complete patient information"
    ];
    expectedAccuracy: 0.98;
  };

  ambiguousIdentityDocuments: {
    description: "Documents with unclear or partial identity information";
    testCases: [
      "Handwritten notes with poor OCR quality",
      "Documents with multiple names (family documents)",
      "Partial information (first name only, initials)"
    ];
    expectedAccuracy: 0.75;
  };

  noIdentityDocuments: {
    description: "Documents without clear patient identity";
    testCases: [
      "Medication bottles with pharmacy labels only",
      "Generic health information pamphlets",
      "Medical device instruction manuals"
    ];
    expectedBehavior: "Request user attestation";
  };

  edgeCaseDocuments: {
    description: "Challenging documents requiring special handling";
    testCases: [
      "Non-English names with diacritics",
      "Hyphenated names and cultural naming conventions",
      "Documents with nicknames or name variations"
    ];
    expectedAccuracy: 0.85;
  };
}
```

### Performance Metrics and Monitoring
```typescript
interface IdentityExtractionMetrics {
  // Accuracy metrics
  nameExtractionAccuracy: number;          // Correct name extraction rate
  dobExtractionAccuracy: number;           // Correct DOB extraction rate
  medicalIdAccuracy: number;               // Medical identifier validation rate
  overallExtractionAccuracy: number;       // Combined accuracy score
  
  // Performance metrics
  averageExtractionLatency: number;        // Milliseconds per extraction
  cacheHitRate: number;                    // Percentage using cached results
  visionAPIUsageRate: number;              // Percentage requiring vision AI
  
  // Quality metrics
  confidenceCalibration: number;           // How well confidence matches accuracy
  falsePositiveRate: number;               // Incorrect high-confidence extractions
  falseNegativeRate: number;               // Missed identity information
  
  // Cost metrics
  averageCostPerExtraction: number;        // Including vision AI costs
  costPerAccurateExtraction: number;       // Cost efficiency metric
}
```

---

*Identity verification forms the foundation of accurate profile classification, ensuring that every medical document is correctly attributed to the appropriate patient profile while maintaining the highest standards of healthcare data accuracy and privacy protection.*