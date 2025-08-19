# Identity Verification System

**Purpose:** Profile matching algorithms and identity extraction for document ownership validation  
**Status:** 🚧 Design Phase - Technical specifications ready for implementation  
**Last updated:** August 18, 2025

---

## 🎯 **Overview**

The Identity Verification system ensures uploaded documents belong to the correct user or their authorized profiles (children, dependents) through sophisticated pattern matching and machine learning algorithms.

## 🧠 **Core Components**

### **1. Identity Extraction Engine**

#### **Text-Based Extraction**
```typescript
interface IdentityExtractionPatterns {
  // Name extraction patterns
  namePatterns: [
    /Patient:\s*([A-Za-z\s\-']+)/i,
    /Name:\s*([A-Za-z\s\-']+)/i,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/m,  // Full name at start of line
    /Dear\s+([A-Za-z\s\-']+)/i,            // Letter salutation
    /Member:\s*([A-Za-z\s\-']+)/i          // Insurance member
  ];

  // Date of birth patterns
  dobPatterns: [
    /DOB:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,
    /Birth\s*Date:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,
    /Date\s*of\s*Birth:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,
    /Born:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i
  ];

  // Medical identifiers
  medicarePatterns: [
    /Medicare\s*(?:Number|#)?:?\s*(\d{10}|\d{4}\s*\d{6})/i,
    /Member\s*(?:Number|ID|#)?:?\s*([A-Z0-9]{8,15})/i
  ];

  // Address patterns
  addressPatterns: [
    /Address:?\s*([^\n\r]+(?:\n[^\n\r]+)*?)(?=\n\s*\n|\n[A-Z]|$)/i,
    /(?:Street|Home)\s*Address:?\s*([^\n\r]+)/i
  ];

  // Phone number patterns
  phonePatterns: [
    /(?:Phone|Tel|Mobile|Cell):?\s*((?:\+?61\s*)?[0-9\s\-\(\)]{10,15})/i,
    /(\(\d{2,3}\)\s*\d{4}\s*\d{4})/,  // Australian format
    /(\d{4}\s*\d{3}\s*\d{3})/         // Mobile format
  ];
}
```

#### **Vision-Based Extraction**
```typescript
interface VisionExtractionStrategy {
  // OCR regions to focus on
  priorityRegions: {
    headerRegion: { top: 0, height: 0.2 };      // Top 20% of document
    patientInfoBox: 'auto-detect';               // Patient information boxes
    signatureArea: { bottom: 0.2 };             // Bottom 20% for signatures
  };

  // Image preprocessing
  preprocessing: {
    contrastEnhancement: boolean;
    noiseReduction: boolean;
    skewCorrection: boolean;
    resolutionUpscaling: boolean;
  };

  // Text extraction confidence
  confidenceThresholds: {
    highConfidence: 0.9;    // Auto-accept
    mediumConfidence: 0.7;  // Verify with pattern matching
    lowConfidence: 0.5;     // Flag for manual review
  };
}
```

### **2. Profile Matching Algorithm**

#### **Similarity Scoring Framework**
```typescript
interface ProfileMatchingWeights {
  // Core identity fields (total = 1.0)
  nameMatch: 0.5;           // 50% - Most important
  dobMatch: 0.3;            // 30% - Very strong signal
  medicareMatch: 0.15;      // 15% - Strong identifier
  addressMatch: 0.05;       // 5% - Weak (people move)
  
  // Bonus factors
  multipleFieldBonus: 0.1;  // Bonus when multiple fields match
  exactMatchBonus: 0.05;    // Bonus for exact string matches
}

class ProfileMatcher {
  calculateNameSimilarity(extractedName: string, profileName: string): number {
    // Normalize names for comparison
    const normalized1 = this.normalizeName(extractedName);
    const normalized2 = this.normalizeName(profileName);
    
    // Multiple similarity algorithms
    const levenshtein = this.levenshteinSimilarity(normalized1, normalized2);
    const jaro = this.jaroWinklerSimilarity(normalized1, normalized2);
    const soundex = this.soundexMatch(normalized1, normalized2);
    const fuzzy = this.fuzzyMatch(normalized1, normalized2);
    
    // Weighted combination
    return (levenshtein * 0.3 + jaro * 0.3 + soundex * 0.2 + fuzzy * 0.2);
  }

  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '')  // Remove punctuation
      .replace(/\s+/g, ' ')     // Normalize whitespace
      .replace(/\b(mr|mrs|ms|dr|prof)\b/g, '') // Remove titles
      .trim();
  }

  private handleNicknames(name: string): string[] {
    const nicknameMap = {
      'william': ['bill', 'billy', 'will'],
      'robert': ['bob', 'bobby', 'rob'],
      'richard': ['rick', 'ricky', 'dick'],
      'michael': ['mike', 'micky'],
      'christopher': ['chris'],
      'matthew': ['matt'],
      'elizabeth': ['liz', 'beth', 'betty'],
      'katherine': ['kate', 'katie', 'kathy'],
      // Add more common nickname mappings
    };
    
    const variants = [name];
    const lowerName = name.toLowerCase();
    
    // Check if name has known nicknames
    if (nicknameMap[lowerName]) {
      variants.push(...nicknameMap[lowerName]);
    }
    
    // Check if name is a nickname for a formal name
    for (const [formal, nicknames] of Object.entries(nicknameMap)) {
      if (nicknames.includes(lowerName)) {
        variants.push(formal);
      }
    }
    
    return variants;
  }
}
```

#### **Decision Matrix**
```typescript
interface MatchingDecision {
  // Confidence thresholds
  autoAccept: number;        // >= 0.9 - Automatic acceptance
  profileSelection: number;  // 0.6-0.9 - Multiple profile choice
  manualVerify: number;      // 0.3-0.6 - Manual verification required
  autoReject: number;        // < 0.3 - Likely not a match

  // Special cases
  exactDobMatch: boolean;    // DOB exact match overrides low name score
  medicareMatch: boolean;    // Medicare number match is very strong
  multipleProfiles: boolean; // Handle family accounts
}

class MatchingDecisionEngine {
  makeDecision(scores: ProfileScore[]): MatchingDecision {
    const topScore = scores[0];
    const secondScore = scores[1]?.score || 0;
    const gap = topScore.score - secondScore;

    // High confidence single match
    if (topScore.score >= 0.9 && gap > 0.2) {
      return {
        decision: 'accept',
        profileId: topScore.profileId,
        confidence: topScore.score,
        reasoning: ['High confidence match', ...topScore.reasons]
      };
    }

    // Exact DOB match overrides lower name scores
    if (topScore.exactDobMatch && topScore.score >= 0.6) {
      return {
        decision: 'accept',
        profileId: topScore.profileId,
        confidence: Math.min(topScore.score + 0.2, 1.0),
        reasoning: ['DOB exact match override', ...topScore.reasons]
      };
    }

    // Close competition between profiles
    if (secondScore > 0.6 && gap < 0.2) {
      return {
        decision: 'needs_selection',
        candidates: scores.filter(s => s.score > 0.5).slice(0, 3),
        confidence: 0.7,
        reasoning: ['Multiple similar profiles found']
      };
    }

    // Moderate single match
    if (topScore.score >= 0.6) {
      return {
        decision: 'accept',
        profileId: topScore.profileId,
        confidence: topScore.score,
        reasoning: ['Moderate confidence match', ...topScore.reasons]
      };
    }

    // Low confidence or no clear identity
    return {
      decision: 'needs_manual_verify',
      confidence: topScore.score,
      reasoning: ['Low confidence match', 'Manual verification required']
    };
  }
}
```

### **3. Family Account Handling**

#### **Child Profile Detection**
```typescript
interface FamilyAccountLogic {
  // Child detection patterns
  childIndicators: [
    /pediatric|paediatric/i,
    /child|minor|infant|baby/i,
    /school\s*nurse|school\s*health/i,
    /parent|guardian|mother|father|mom|dad/i
  ];

  // Age-based routing
  ageThresholds: {
    infant: { min: 0, max: 2 };
    child: { min: 2, max: 12 };
    adolescent: { min: 12, max: 18 };
    adult: { min: 18, max: 120 };
  };

  // Parent-child relationship detection
  relationshipPatterns: [
    /parent\s*(?:of|for):?\s*([A-Za-z\s]+)/i,
    /guardian\s*(?:of|for):?\s*([A-Za-z\s]+)/i,
    /mother\s*(?:of|for):?\s*([A-Za-z\s]+)/i,
    /father\s*(?:of|for):?\s*([A-Za-z\s]+)/i
  ];
}

class FamilyAccountMatcher {
  async matchChildProfiles(
    extractedIdentity: ExtractedIdentity,
    parentAccount: UserAccount
  ): Promise<ChildMatchResult> {
    
    // Get all child profiles for the account
    const childProfiles = await this.getChildProfiles(parentAccount.id);
    
    // Check for explicit parent-child references
    const parentChildRef = this.detectParentChildReference(
      extractedIdentity.rawText,
      parentAccount.personalInfo
    );
    
    if (parentChildRef.found) {
      return this.matchByParentReference(parentChildRef, childProfiles);
    }
    
    // Standard profile matching against children
    const childScores = await Promise.all(
      childProfiles.map(child => 
        this.scoreChildProfile(child, extractedIdentity)
      )
    );
    
    return this.makeChildMatchingDecision(childScores, extractedIdentity);
  }

  private detectParentChildReference(
    text: string,
    parentInfo: PersonalInfo
  ): ParentChildReference {
    
    // Look for "Parent of [Child Name]" patterns
    for (const pattern of this.relationshipPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const childName = match[1].trim();
        
        // Verify parent name appears in document
        if (this.isParentNameInDocument(text, parentInfo)) {
          return {
            found: true,
            parentName: parentInfo.fullName,
            childName: childName,
            confidence: 0.9
          };
        }
      }
    }
    
    return { found: false };
  }
}
```

### **4. Edge Cases & Error Handling**

#### **Common Edge Cases**
```typescript
interface EdgeCaseHandling {
  // No identity information found
  noIdentityFound: {
    strategy: 'manual_attestation';
    userPrompt: 'This document contains no clear identity information. Please confirm this document belongs to you or one of your profiles.';
    options: ['Confirm it\'s mine', 'Select child profile', 'Not mine'];
  };

  // Multiple names in document
  multipleNames: {
    strategy: 'extract_all_and_score';
    logic: 'Score each name against all profiles, take highest confidence match';
    threshold: 0.7; // Minimum confidence for multi-name documents
  };

  // Partial name matches
  partialMatches: {
    firstNameOnly: { confidence: 0.4, requireAdditionalVerification: true };
    lastNameOnly: { confidence: 0.3, requireAdditionalVerification: true };
    initialsOnly: { confidence: 0.2, requireManualVerification: true };
  };

  // Common name variations
  nameVariations: {
    hyphenatedNames: 'Split and try both parts';
    marriedNames: 'Check both maiden and married names if available';
    culturalNames: 'Handle different cultural naming conventions';
    abbreviations: 'Expand common abbreviations (St. -> Saint, etc.)';
  };
}

class EdgeCaseProcessor {
  async handleAmbiguousIdentity(
    extractedIdentity: ExtractedIdentity,
    profiles: UserProfile[]
  ): Promise<AmbiguityResolution> {
    
    // Case 1: Multiple names extracted
    if (extractedIdentity.names.length > 1) {
      return await this.resolveMultipleNames(extractedIdentity, profiles);
    }
    
    // Case 2: Generic document (medication bottle, etc.)
    if (this.isGenericDocument(extractedIdentity)) {
      return {
        strategy: 'user_attestation',
        message: 'This appears to be a generic document without specific patient information. Please confirm ownership.',
        requiresUserInput: true
      };
    }
    
    // Case 3: Partial information only
    if (this.isPartialInformation(extractedIdentity)) {
      return await this.handlePartialInformation(extractedIdentity, profiles);
    }
    
    // Default: Manual verification required
    return {
      strategy: 'manual_verification',
      message: 'Unable to automatically verify document ownership. Manual review required.',
      escalateToHuman: true
    };
  }

  private isGenericDocument(identity: ExtractedIdentity): boolean {
    const genericIndicators = [
      'medication bottle',
      'prescription label',
      'over the counter',
      'supplement facts',
      'generic rx'
    ];
    
    const text = identity.rawText?.toLowerCase() || '';
    return genericIndicators.some(indicator => text.includes(indicator)) &&
           identity.names.length === 0;
  }
}
```

### **5. Performance Optimization**

#### **Caching Strategy**
```typescript
interface IdentityVerificationCache {
  // Cache extracted identities for similar documents
  extractionCache: {
    key: string;        // Hash of document content
    identity: ExtractedIdentity;
    expiresAt: Date;
    confidence: number;
  };

  // Cache profile matching results
  matchingCache: {
    key: string;        // Hash of identity + profile combination
    result: MatchingResult;
    expiresAt: Date;
  };

  // Cache nickname/alias mappings
  nicknameCache: Map<string, string[]>;
}

class PerformanceOptimizer {
  async optimizeIdentityExtraction(filePath: string): Promise<ExtractedIdentity> {
    // Check cache first
    const cacheKey = await this.generateContentHash(filePath);
    const cached = await this.getFromCache(cacheKey);
    
    if (cached && cached.confidence > 0.8) {
      return cached.identity;
    }
    
    // Perform extraction with early exit optimizations
    const identity = await this.extractWithEarlyExit(filePath);
    
    // Cache result if high confidence
    if (identity.confidence > 0.7) {
      await this.cacheResult(cacheKey, identity);
    }
    
    return identity;
  }

  private async extractWithEarlyExit(filePath: string): Promise<ExtractedIdentity> {
    // Start with fast heuristic extraction
    const heuristicResult = await this.heuristicExtraction(filePath);
    
    if (heuristicResult.confidence > 0.8) {
      return heuristicResult; // Early exit for clear cases
    }
    
    // Fall back to more expensive OCR extraction
    const ocrResult = await this.ocrExtraction(filePath);
    
    if (ocrResult.confidence > 0.7) {
      return ocrResult;
    }
    
    // Last resort: AI vision extraction
    return await this.aiVisionExtraction(filePath);
  }
}
```

## 🔒 **Security & Privacy**

### **PHI Protection**
```typescript
interface PHIProtection {
  // Redact sensitive information from logs
  logRedaction: {
    redactNames: boolean;
    redactDOB: boolean;
    redactMedicare: boolean;
    redactAddresses: boolean;
    keepConfidenceScores: boolean;
  };

  // Audit all identity verification attempts
  auditLogging: {
    logAttempts: boolean;
    logResults: boolean;
    logFailures: boolean;
    retentionDays: number;
  };

  // Access controls
  accessControls: {
    requireAuthentication: boolean;
    requireAccountOwnership: boolean;
    logAllAccess: boolean;
  };
}
```

---

## 📊 **Testing & Validation**

### **Test Dataset Requirements**
- **Clear Identity**: Documents with obvious patient information
- **Ambiguous Identity**: Multiple names, partial information
- **No Identity**: Generic documents, medication bottles
- **Family Documents**: Parent-child relationships
- **Edge Cases**: Unusual names, cultural variations

### **Performance Metrics**
- **Accuracy**: >98% correct profile assignment for clear cases
- **Precision**: <1% false positive profile matches
- **Recall**: >95% successful identity extraction when present
- **Latency**: <2 seconds average extraction time

---

*For implementation details, see [Phase 1: Intake Screening](../implementation/phase-1-intake-screening.md)*