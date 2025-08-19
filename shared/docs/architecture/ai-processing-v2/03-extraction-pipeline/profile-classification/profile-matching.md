# Profile Matching Algorithm

**Purpose:** Match extracted identity information to appropriate user profiles in multi-profile accounts  
**Focus:** Advanced similarity scoring, family relationship detection, and confidence-based decisions  
**Priority:** CRITICAL - Core profile classification functionality  
**Dependencies:** Identity verification system, user_profiles table, similarity algorithms

---

## System Overview

The Profile Matching Algorithm takes extracted identity information and determines which profile within a user's account (self, child, adult dependent, pet) should be assigned to the document. The system uses multi-factor similarity scoring with sophisticated decision logic to ensure accurate profile assignment while minimizing user intervention.

### Core Matching Data Model
```typescript
interface ProfileMatchingResult {
  // Primary matching decision
  decision: 'auto_accept' | 'profile_selection' | 'manual_verification' | 'create_new';
  assignedProfileId: string | null;     // Final profile assignment
  confidence: number;                   // Overall confidence (0-1)
  
  // Detailed scoring
  profileScores: ProfileScore[];        // All profiles scored
  matchingFactors: MatchingFactor[];    // Detailed factor analysis
  reasoning: string[];                  // Human-readable explanation
  
  // Decision context
  requiresUserInput: boolean;           // User interaction needed
  alternativeOptions: ProfileOption[]; // Alternative profile choices
  warningFlags: string[];              // Potential issues detected
  
  // Metadata
  processingTime: number;               // Matching latency in ms
  algorithmsUsed: string[];            // Matching algorithms applied
  fallbackReason?: string;             // If fallback logic used
}

interface ProfileScore {
  profileId: string;                    // User profile identifier
  profileType: 'self' | 'child' | 'adult_dependent' | 'pet';
  overallScore: number;                 // Combined similarity score (0-1)
  
  // Individual factor scores
  nameScore: number;                    // Name similarity (0-1)
  dobScore: number;                     // Date of birth match (0-1) 
  medicalIdScore: number;               // Medical identifier match (0-1)
  addressScore: number;                 // Address similarity (0-1)
  contextScore: number;                 // Medical context appropriateness (0-1)
  
  // Matching details
  nameMatches: NameMatch[];             // Detailed name matching results
  exactMatches: string[];               // Fields with perfect matches
  partialMatches: string[];             // Fields with partial matches
  mismatches: string[];                 // Fields that don't match
  
  // Metadata
  profileData: ProfileSummary;          // Profile information used for matching
  matchingConfidence: number;           // Confidence in this specific match
}

interface NameMatch {
  extractedName: string;                // Name from document
  profileName: string;                 // Name from profile
  similarity: number;                   // Similarity score (0-1)
  matchType: 'exact' | 'partial' | 'phonetic' | 'nickname' | 'initials';
  algorithm: string;                    // Matching algorithm used
  normalizedExtracted: string;          // Normalized extracted name
  normalizedProfile: string;            // Normalized profile name
}
```

---

## Multi-Factor Similarity Scoring

### Core Similarity Algorithms
```typescript
class ProfileSimilarityEngine {
  private readonly SCORING_WEIGHTS = {
    nameMatch: 0.50,        // 50% - Primary identifier
    dobMatch: 0.25,         // 25% - Strong unique identifier  
    medicalIdMatch: 0.15,   // 15% - Very strong when available
    addressMatch: 0.05,     // 5% - Weak (people move frequently)
    contextMatch: 0.05      // 5% - Medical context appropriateness
  };

  async scoreProfile(
    extractedIdentity: ExtractedIdentity,
    profile: UserProfile
  ): Promise<ProfileScore> {
    
    // Calculate individual factor scores
    const nameScore = await this.calculateNameSimilarity(
      extractedIdentity.names,
      profile.personalInfo.names
    );
    
    const dobScore = await this.calculateDOBSimilarity(
      extractedIdentity.dateOfBirth,
      profile.personalInfo.dateOfBirth
    );
    
    const medicalIdScore = await this.calculateMedicalIdSimilarity(
      extractedIdentity.medicalIdentifiers,
      profile.medicalIdentifiers
    );
    
    const addressScore = await this.calculateAddressSimilarity(
      extractedIdentity.addresses,
      profile.personalInfo.addresses
    );
    
    const contextScore = await this.calculateContextAppropriatenesss(
      extractedIdentity.medicalContext,
      profile
    );
    
    // Calculate weighted overall score
    const overallScore = (
      nameScore * this.SCORING_WEIGHTS.nameMatch +
      dobScore * this.SCORING_WEIGHTS.dobMatch +
      medicalIdScore * this.SCORING_WEIGHTS.medicalIdMatch +
      addressScore * this.SCORING_WEIGHTS.addressMatch +
      contextScore * this.SCORING_WEIGHTS.contextMatch
    );
    
    // Apply bonuses and penalties
    const adjustedScore = await this.applyScoreAdjustments(
      overallScore,
      extractedIdentity,
      profile,
      { nameScore, dobScore, medicalIdScore, addressScore, contextScore }
    );
    
    return {
      profileId: profile.id,
      profileType: profile.profileType,
      overallScore: adjustedScore,
      nameScore,
      dobScore,
      medicalIdScore,
      addressScore,
      contextScore,
      nameMatches: nameScore.detailedMatches,
      exactMatches: this.identifyExactMatches(extractedIdentity, profile),
      partialMatches: this.identifyPartialMatches(extractedIdentity, profile),
      mismatches: this.identifyMismatches(extractedIdentity, profile),
      profileData: this.createProfileSummary(profile),
      matchingConfidence: this.calculateMatchingConfidence(adjustedScore, extractedIdentity, profile)
    };
  }

  private async calculateNameSimilarity(
    extractedNames: IdentityName[],
    profileNames: ProfileName[]
  ): Promise<NameSimilarityResult> {
    
    if (extractedNames.length === 0 || profileNames.length === 0) {
      return { score: 0, detailedMatches: [], bestMatch: null };
    }
    
    const allMatches: NameMatch[] = [];
    
    // Compare each extracted name against each profile name
    for (const extractedName of extractedNames) {
      for (const profileName of profileNames) {
        const match = await this.compareNames(extractedName, profileName);
        allMatches.push(match);
      }
    }
    
    // Find the best match and calculate overall score
    const bestMatch = allMatches.reduce((best, current) => 
      current.similarity > best.similarity ? current : best
    );
    
    // Calculate overall name similarity score
    const overallScore = this.calculateOverallNameScore(allMatches, bestMatch);
    
    return {
      score: overallScore,
      detailedMatches: allMatches.sort((a, b) => b.similarity - a.similarity),
      bestMatch,
      confidence: this.calculateNameConfidence(bestMatch, extractedNames, profileNames)
    };
  }

  private async compareNames(
    extractedName: IdentityName,
    profileName: ProfileName
  ): Promise<NameMatch> {
    
    // Normalize names for comparison
    const normalizedExtracted = this.normalizeName(extractedName.fullName);
    const normalizedProfile = this.normalizeName(profileName.fullName);
    
    // Apply multiple similarity algorithms
    const similarities = {
      exact: this.exactMatch(normalizedExtracted, normalizedProfile),
      levenshtein: this.levenshteinSimilarity(normalizedExtracted, normalizedProfile),
      jaro: this.jaroWinklerSimilarity(normalizedExtracted, normalizedProfile),
      soundex: this.soundexSimilarity(normalizedExtracted, normalizedProfile),
      fuzzy: this.fuzzyMatch(normalizedExtracted, normalizedProfile),
      nickname: await this.nicknameSimilarity(normalizedExtracted, normalizedProfile),
      initials: this.initialsSimilarity(normalizedExtracted, normalizedProfile)
    };
    
    // Determine best matching type and score
    const bestAlgorithm = Object.entries(similarities)
      .reduce((best, [alg, score]) => score > best.score ? { algorithm: alg, score } : best, 
              { algorithm: 'exact', score: 0 });
    
    // Determine match type based on best algorithm and score
    let matchType: NameMatch['matchType'];
    if (similarities.exact === 1.0) {
      matchType = 'exact';
    } else if (similarities.nickname > 0.8) {
      matchType = 'nickname';
    } else if (similarities.soundex > 0.8) {
      matchType = 'phonetic';
    } else if (similarities.initials > 0.7) {
      matchType = 'initials';
    } else {
      matchType = 'partial';
    }
    
    return {
      extractedName: extractedName.fullName,
      profileName: profileName.fullName,
      similarity: bestAlgorithm.score,
      matchType,
      algorithm: bestAlgorithm.algorithm,
      normalizedExtracted,
      normalizedProfile
    };
  }

  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '')              // Remove punctuation
      .replace(/\s+/g, ' ')                 // Normalize whitespace
      .replace(/\b(mr|mrs|ms|dr|prof|sir|dame)\b/g, '') // Remove titles
      .replace(/\b(jr|sr|ii|iii|iv)\b/g, '') // Remove suffixes
      .trim();
  }

  private async nicknameSimilarity(name1: string, name2: string): Promise<number> {
    const nicknameDatabase = await this.getNicknameDatabase();
    
    // Check if either name is a nickname of the other
    const variants1 = this.getAllNameVariants(name1, nicknameDatabase);
    const variants2 = this.getAllNameVariants(name2, nicknameDatabase);
    
    // Check for overlap in variants
    const commonVariants = variants1.filter(v1 => 
      variants2.some(v2 => this.exactMatch(v1, v2) === 1.0)
    );
    
    return commonVariants.length > 0 ? 0.9 : 0.0;
  }

  private getAllNameVariants(name: string, nicknameDB: NicknameDatabase): string[] {
    const variants = [name];
    const words = name.split(' ');
    
    // Check each word for nickname variants
    for (const word of words) {
      // Get formal names for this word if it's a nickname
      const formalNames = nicknameDB.getFormalNames(word);
      variants.push(...formalNames);
      
      // Get nicknames for this word if it's a formal name
      const nicknames = nicknameDB.getNicknames(word);
      variants.push(...nicknames);
    }
    
    return [...new Set(variants)]; // Remove duplicates
  }
}
```

### Date of Birth Matching
```typescript
class DOBMatchingEngine {
  async calculateDOBSimilarity(
    extractedDOB: IdentityDate | null,
    profileDOB: Date | null
  ): Promise<DOBSimilarityResult> {
    
    if (!extractedDOB || !profileDOB) {
      return { score: 0, matchType: 'missing', confidence: 0 };
    }
    
    // Exact date match
    if (this.isSameDate(extractedDOB.date, profileDOB)) {
      return { 
        score: 1.0, 
        matchType: 'exact', 
        confidence: Math.min(extractedDOB.confidence, 0.95),
        details: 'Exact date of birth match'
      };
    }
    
    // Check for common date format errors (DD/MM vs MM/DD)
    const formatVariations = this.generateDateFormatVariations(extractedDOB.originalText);
    
    for (const variation of formatVariations) {
      if (this.isSameDate(variation.date, profileDOB)) {
        return {
          score: 0.9,
          matchType: 'format_variation',
          confidence: Math.min(extractedDOB.confidence * 0.9, 0.85),
          details: `Date match with format correction: ${variation.format}`
        };
      }
    }
    
    // Partial date matching (year and month, or year only)
    const partialScore = this.calculatePartialDateScore(extractedDOB.date, profileDOB);
    
    if (partialScore > 0) {
      return {
        score: partialScore,
        matchType: 'partial',
        confidence: Math.min(extractedDOB.confidence * 0.7, 0.75),
        details: 'Partial date match (year/month components)'
      };
    }
    
    // Age consistency check (for documents with age but no DOB)
    const ageConsistencyScore = this.checkAgeConsistency(extractedDOB, profileDOB);
    
    if (ageConsistencyScore > 0) {
      return {
        score: ageConsistencyScore,
        matchType: 'age_consistent',
        confidence: 0.6,
        details: 'Age consistency with estimated DOB'
      };
    }
    
    return { score: 0, matchType: 'no_match', confidence: 0 };
  }

  private generateDateFormatVariations(originalText: string): DateVariation[] {
    const variations: DateVariation[] = [];
    
    // Common date format patterns
    const datePatterns = [
      { pattern: /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/, formats: ['MM/DD/YYYY', 'DD/MM/YYYY'] },
      { pattern: /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/, formats: ['YYYY/MM/DD', 'YYYY/DD/MM'] },
      { pattern: /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})/, formats: ['MM/DD/YY', 'DD/MM/YY'] }
    ];
    
    for (const { pattern, formats } of datePatterns) {
      const match = originalText.match(pattern);
      if (match) {
        const [, part1, part2, part3] = match;
        
        for (const format of formats) {
          try {
            let date: Date;
            if (format.includes('MM/DD')) {
              date = new Date(parseInt(part3) < 50 ? 2000 + parseInt(part3) : 1900 + parseInt(part3), 
                             parseInt(part1) - 1, parseInt(part2));
            } else if (format.includes('DD/MM')) {
              date = new Date(parseInt(part3) < 50 ? 2000 + parseInt(part3) : 1900 + parseInt(part3), 
                             parseInt(part2) - 1, parseInt(part1));
            } else if (format.includes('YYYY/MM/DD')) {
              date = new Date(parseInt(part1), parseInt(part2) - 1, parseInt(part3));
            } else {
              date = new Date(parseInt(part1), parseInt(part3) - 1, parseInt(part2));
            }
            
            if (!isNaN(date.getTime())) {
              variations.push({ date, format });
            }
          } catch (error) {
            // Skip invalid date variations
            continue;
          }
        }
      }
    }
    
    return variations;
  }

  private calculatePartialDateScore(extractedDate: Date, profileDate: Date): number {
    let score = 0;
    
    // Year match (most important)
    if (extractedDate.getFullYear() === profileDate.getFullYear()) {
      score += 0.6;
      
      // Month match (additional points)
      if (extractedDate.getMonth() === profileDate.getMonth()) {
        score += 0.3;
      }
    }
    
    return score;
  }
}
```

---

## Decision Matrix Engine

### Confidence-Based Decision Logic
```typescript
class ProfileMatchingDecisionEngine {
  private readonly DECISION_THRESHOLDS = {
    AUTO_ACCEPT: 0.90,           // High confidence single match
    PROFILE_SELECTION: 0.60,     // Multiple viable options
    MANUAL_VERIFICATION: 0.30,   // Low confidence needs review
    AUTO_REJECT: 0.10            // Very low confidence
  };

  async makeMatchingDecision(
    profileScores: ProfileScore[],
    extractedIdentity: ExtractedIdentity,
    accountContext: AccountContext
  ): Promise<ProfileMatchingResult> {
    
    // Sort profiles by score
    const sortedScores = profileScores.sort((a, b) => b.overallScore - a.overallScore);
    const topScore = sortedScores[0];
    const secondScore = sortedScores[1];
    
    // Calculate decision factors
    const decisionFactors = this.analyzeDecisionFactors(
      topScore,
      secondScore,
      extractedIdentity,
      accountContext
    );
    
    // Apply decision logic
    const decision = await this.applyDecisionRules(
      sortedScores,
      decisionFactors,
      extractedIdentity,
      accountContext
    );
    
    return {
      decision: decision.type,
      assignedProfileId: decision.profileId,
      confidence: decision.confidence,
      profileScores: sortedScores,
      matchingFactors: decisionFactors.factors,
      reasoning: decision.reasoning,
      requiresUserInput: decision.requiresUserInput,
      alternativeOptions: decision.alternativeOptions,
      warningFlags: decision.warningFlags,
      processingTime: Date.now() - decision.startTime,
      algorithmsUsed: decision.algorithmsUsed
    };
  }

  private async applyDecisionRules(
    sortedScores: ProfileScore[],
    decisionFactors: DecisionFactors,
    extractedIdentity: ExtractedIdentity,
    accountContext: AccountContext
  ): Promise<DecisionResult> {
    
    const topScore = sortedScores[0];
    const secondScore = sortedScores[1];
    const scoreGap = topScore.overallScore - (secondScore?.overallScore || 0);
    
    // Rule 1: High confidence single match
    if (topScore.overallScore >= this.DECISION_THRESHOLDS.AUTO_ACCEPT && scoreGap > 0.15) {
      return {
        type: 'auto_accept',
        profileId: topScore.profileId,
        confidence: topScore.overallScore,
        reasoning: [
          `High confidence match (${(topScore.overallScore * 100).toFixed(1)}%)`,
          `Clear winner with ${(scoreGap * 100).toFixed(1)}% gap over next option`,
          ...this.getTopMatchingReasons(topScore)
        ],
        requiresUserInput: false,
        alternativeOptions: [],
        warningFlags: await this.checkWarningConditions(topScore, extractedIdentity),
        algorithmsUsed: this.getUsedAlgorithms(sortedScores),
        startTime: Date.now()
      };
    }
    
    // Rule 2: Perfect medical identifier match overrides lower name scores
    if (decisionFactors.hasExactMedicalIdMatch && topScore.overallScore > 0.50) {
      return {
        type: 'auto_accept',
        profileId: topScore.profileId,
        confidence: Math.min(topScore.overallScore + 0.2, 1.0),
        reasoning: [
          'Exact medical identifier match detected',
          'Medical ID match overrides lower name similarity',
          `Medicare/Insurance number: ${decisionFactors.exactMedicalIdType}`
        ],
        requiresUserInput: false,
        alternativeOptions: [],
        warningFlags: ['medical_id_override'],
        algorithmsUsed: this.getUsedAlgorithms(sortedScores),
        startTime: Date.now()
      };
    }
    
    // Rule 3: Exact DOB match provides strong signal
    if (decisionFactors.hasExactDOBMatch && topScore.overallScore > 0.45) {
      return {
        type: 'auto_accept',
        profileId: topScore.profileId,
        confidence: Math.min(topScore.overallScore + 0.15, 1.0),
        reasoning: [
          'Exact date of birth match provides strong confidence',
          `DOB match: ${decisionFactors.dobMatchDetails}`,
          'Name variations acceptable with exact DOB'
        ],
        requiresUserInput: false,
        alternativeOptions: [],
        warningFlags: ['dob_override'],
        algorithmsUsed: this.getUsedAlgorithms(sortedScores),
        startTime: Date.now()
      };
    }
    
    // Rule 4: Close competition between profiles
    if (secondScore && 
        topScore.overallScore >= this.DECISION_THRESHOLDS.PROFILE_SELECTION && 
        scoreGap < 0.15) {
      
      const viableOptions = sortedScores
        .filter(score => score.overallScore > 0.40)
        .slice(0, 3)
        .map(score => this.createProfileOption(score));
      
      return {
        type: 'profile_selection',
        profileId: null,
        confidence: topScore.overallScore,
        reasoning: [
          'Multiple profiles with similar confidence scores',
          `Top choice: ${topScore.profileData.displayName} (${(topScore.overallScore * 100).toFixed(1)}%)`,
          `Alternative: ${secondScore.profileData.displayName} (${(secondScore.overallScore * 100).toFixed(1)}%)`,
          'User selection recommended for accuracy'
        ],
        requiresUserInput: true,
        alternativeOptions: viableOptions,
        warningFlags: [],
        algorithmsUsed: this.getUsedAlgorithms(sortedScores),
        startTime: Date.now()
      };
    }
    
    // Rule 5: Single moderate match
    if (topScore.overallScore >= this.DECISION_THRESHOLDS.PROFILE_SELECTION) {
      return {
        type: 'auto_accept',
        profileId: topScore.profileId,
        confidence: topScore.overallScore,
        reasoning: [
          `Moderate confidence match (${(topScore.overallScore * 100).toFixed(1)}%)`,
          ...this.getTopMatchingReasons(topScore)
        ],
        requiresUserInput: false,
        alternativeOptions: [],
        warningFlags: await this.checkWarningConditions(topScore, extractedIdentity),
        algorithmsUsed: this.getUsedAlgorithms(sortedScores),
        startTime: Date.now()
      };
    }
    
    // Rule 6: Low confidence requires manual verification
    if (topScore.overallScore >= this.DECISION_THRESHOLDS.MANUAL_VERIFICATION) {
      return {
        type: 'manual_verification',
        profileId: null,
        confidence: topScore.overallScore,
        reasoning: [
          'Low confidence match requires manual verification',
          `Best option: ${topScore.profileData.displayName} (${(topScore.overallScore * 100).toFixed(1)}%)`,
          'Please confirm this document belongs to the suggested profile'
        ],
        requiresUserInput: true,
        alternativeOptions: [this.createProfileOption(topScore)],
        warningFlags: ['low_confidence'],
        algorithmsUsed: this.getUsedAlgorithms(sortedScores),
        startTime: Date.now()
      };
    }
    
    // Rule 7: No clear match - suggest new profile creation
    return {
      type: 'create_new',
      profileId: null,
      confidence: 0,
      reasoning: [
        'No existing profiles match the extracted identity',
        'This may be a new family member or profile',
        'Consider creating a new profile for this document'
      ],
      requiresUserInput: true,
      alternativeOptions: [],
      warningFlags: ['no_matching_profile'],
      algorithmsUsed: this.getUsedAlgorithms(sortedScores),
      startTime: Date.now()
    };
  }

  private async checkWarningConditions(
    topScore: ProfileScore,
    extractedIdentity: ExtractedIdentity
  ): Promise<string[]> {
    
    const warnings: string[] = [];
    
    // Age-inappropriate medical context
    if (await this.isAgeInappropriateContext(topScore, extractedIdentity)) {
      warnings.push('age_inappropriate_procedure');
    }
    
    // Gender-inappropriate medical context
    if (await this.isGenderInappropriateContext(topScore, extractedIdentity)) {
      warnings.push('gender_inappropriate_procedure');
    }
    
    // Temporal inconsistency (document date vs profile age)
    if (await this.isTemporallyInconsistent(topScore, extractedIdentity)) {
      warnings.push('temporal_inconsistency');
    }
    
    // Name format significantly different
    if (topScore.nameScore < 0.6 && topScore.overallScore > 0.8) {
      warnings.push('name_format_difference');
    }
    
    return warnings;
  }
}
```

---

## Family Account Handling

### Parent-Child Relationship Processing
```typescript
class FamilyAccountMatcher {
  async processFamilyDocument(
    extractedIdentity: ExtractedIdentity,
    accountProfiles: UserProfile[],
    familyContext: FamilyContext
  ): Promise<FamilyMatchingResult> {
    
    // Detect explicit parent-child relationships in document
    const parentChildRelationships = await this.detectParentChildRelationships(
      extractedIdentity,
      accountProfiles,
      familyContext
    );
    
    if (parentChildRelationships.length > 0) {
      return this.processExplicitFamilyRelationships(
        parentChildRelationships,
        extractedIdentity
      );
    }
    
    // Process child profiles with age-based validation
    const childMatches = await this.matchChildProfiles(
      extractedIdentity,
      accountProfiles.filter(p => p.profileType === 'child'),
      familyContext
    );
    
    if (childMatches.bestMatch && childMatches.bestMatch.overallScore > 0.7) {
      return this.procesChildMatch(childMatches.bestMatch, extractedIdentity);
    }
    
    // Process adult profiles (self, adult dependents)
    const adultMatches = await this.matchAdultProfiles(
      extractedIdentity,
      accountProfiles.filter(p => p.profileType !== 'child'),
      familyContext
    );
    
    return this.processAdultMatches(adultMatches, extractedIdentity);
  }

  private async detectParentChildRelationships(
    extractedIdentity: ExtractedIdentity,
    accountProfiles: UserProfile[],
    familyContext: FamilyContext
  ): Promise<ParentChildRelationship[]> {
    
    const relationships: ParentChildRelationship[] = [];
    
    // Look for explicit relationship patterns in text
    const relationshipPatterns = [
      /parent\s*(?:of|for):?\s*([A-Za-z\s\-']+)/gi,
      /guardian\s*(?:of|for):?\s*([A-Za-z\s\-']+)/gi,
      /(?:mother|father|mom|dad)\s*(?:of|for):?\s*([A-Za-z\s\-']+)/gi,
      /child(?:ren)?\s*(?:of|for):?\s*([A-Za-z\s\-']+)/gi,
      /dependent:?\s*([A-Za-z\s\-']+)/gi
    ];
    
    for (const pattern of relationshipPatterns) {
      const matches = extractedIdentity.rawText.matchAll(pattern);
      
      for (const match of matches) {
        if (match[1]) {
          const childName = match[1].trim();
          
          // Try to find parent name in document
          const parentName = await this.findParentName(
            extractedIdentity.rawText,
            match[0],
            extractedIdentity.names
          );
          
          if (parentName) {
            // Match names to actual profiles
            const parentProfile = await this.findProfileByName(parentName, accountProfiles);
            const childProfile = await this.findProfileByName(childName, accountProfiles);
            
            if (parentProfile || childProfile) {
              relationships.push({
                type: 'parent-child',
                parentName,
                childName,
                parentProfile,
                childProfile,
                confidence: 0.8,
                source: 'explicit_text_pattern'
              });
            }
          }
        }
      }
    }
    
    return relationships;
  }

  private async matchChildProfiles(
    extractedIdentity: ExtractedIdentity,
    childProfiles: UserProfile[],
    familyContext: FamilyContext
  ): Promise<ChildMatchingResult> {
    
    const childScores: ChildProfileScore[] = [];
    
    for (const childProfile of childProfiles) {
      const baseScore = await this.scoreProfile(extractedIdentity, childProfile);
      
      // Apply child-specific scoring adjustments
      const childScore = await this.applyChildSpecificScoring(
        baseScore,
        extractedIdentity,
        childProfile,
        familyContext
      );
      
      childScores.push(childScore);
    }
    
    // Sort by adjusted scores
    childScores.sort((a, b) => b.adjustedScore - a.adjustedScore);
    
    return {
      bestMatch: childScores[0],
      allMatches: childScores,
      confidence: childScores[0]?.adjustedScore || 0,
      requiresParentVerification: this.requiresParentVerification(
        childScores[0],
        extractedIdentity,
        familyContext
      )
    };
  }

  private async applyChildSpecificScoring(
    baseScore: ProfileScore,
    extractedIdentity: ExtractedIdentity,
    childProfile: UserProfile,
    familyContext: FamilyContext
  ): Promise<ChildProfileScore> {
    
    let adjustedScore = baseScore.overallScore;
    const adjustmentReasons: string[] = [];
    
    // Pediatric context bonus
    if (familyContext.childIndicators.length > 0) {
      adjustedScore += 0.1;
      adjustmentReasons.push('Pediatric context detected');
    }
    
    // Age-appropriate medical procedures
    const ageAppropriateness = await this.checkAgeAppropriatenesss(
      extractedIdentity.medicalContext,
      childProfile
    );
    
    if (ageAppropriateness.appropriate) {
      adjustedScore += 0.05;
      adjustmentReasons.push('Age-appropriate medical context');
    } else if (ageAppropriateness.inappropriate) {
      adjustedScore -= 0.2;
      adjustmentReasons.push('Age-inappropriate procedures detected');
    }
    
    // School-related medical documents
    if (this.isSchoolMedicalDocument(extractedIdentity)) {
      adjustedScore += 0.1;
      adjustmentReasons.push('School medical document context');
    }
    
    // Parent consent language
    if (this.hasParentConsentLanguage(extractedIdentity.rawText)) {
      adjustedScore += 0.05;
      adjustmentReasons.push('Parental consent language present');
    }
    
    return {
      ...baseScore,
      adjustedScore: Math.min(adjustedScore, 1.0),
      adjustmentReasons,
      childSpecificFactors: {
        pediatricContext: familyContext.childIndicators.length > 0,
        ageAppropriateness: ageAppropriateness.appropriate,
        schoolContext: this.isSchoolMedicalDocument(extractedIdentity),
        parentConsent: this.hasParentConsentLanguage(extractedIdentity.rawText)
      }
    };
  }
}
```

---

## Performance Optimization

### Caching and Efficiency Strategies
```typescript
class ProfileMatchingOptimizer {
  private readonly matchingCache = new Map<string, CachedMatchingResult>();
  private readonly similarityCache = new Map<string, SimilarityScore>();
  
  async optimizeProfileMatching(
    extractedIdentity: ExtractedIdentity,
    accountProfiles: UserProfile[]
  ): Promise<ProfileMatchingResult> {
    
    // Generate cache key from identity and profiles
    const cacheKey = this.generateMatchingCacheKey(extractedIdentity, accountProfiles);
    
    // Check for cached result
    const cachedResult = this.getCachedMatching(cacheKey);
    if (cachedResult && cachedResult.confidence > 0.8) {
      return cachedResult.result;
    }
    
    // Parallel processing of profile scores
    const profileScorePromises = accountProfiles.map(profile =>
      this.scoreProfileWithCaching(extractedIdentity, profile)
    );
    
    const profileScores = await Promise.all(profileScorePromises);
    
    // Apply decision engine
    const decision = await this.makeMatchingDecision(
      profileScores,
      extractedIdentity,
      { profileCount: accountProfiles.length }
    );
    
    // Cache high-confidence results
    if (decision.confidence > 0.7) {
      this.cacheMatchingResult(cacheKey, decision);
    }
    
    return decision;
  }

  private async scoreProfileWithCaching(
    extractedIdentity: ExtractedIdentity,
    profile: UserProfile
  ): Promise<ProfileScore> {
    
    const similarityCacheKey = this.generateSimilarityKey(extractedIdentity, profile);
    const cachedSimilarity = this.similarityCache.get(similarityCacheKey);
    
    if (cachedSimilarity && this.isCacheValid(cachedSimilarity)) {
      return this.convertCachedToProfileScore(cachedSimilarity, profile);
    }
    
    // Calculate fresh similarity scores
    const profileScore = await this.calculateProfileSimilarity(extractedIdentity, profile);
    
    // Cache for future use
    this.cacheSimilarityScore(similarityCacheKey, profileScore);
    
    return profileScore;
  }

  // Early exit optimization for clear matches
  async fastTrackObviousMatches(
    extractedIdentity: ExtractedIdentity,
    accountProfiles: UserProfile[]
  ): Promise<ProfileMatchingResult | null> {
    
    // Perfect medical identifier match
    for (const profile of accountProfiles) {
      const exactIdMatch = this.hasExactMedicalIdMatch(
        extractedIdentity.medicalIdentifiers,
        profile.medicalIdentifiers
      );
      
      if (exactIdMatch) {
        return {
          decision: 'auto_accept',
          assignedProfileId: profile.id,
          confidence: 0.95,
          profileScores: [await this.scoreProfile(extractedIdentity, profile)],
          matchingFactors: [{ type: 'exact_medical_id', value: 1.0, weight: 0.95 }],
          reasoning: ['Exact medical identifier match - fast track approval'],
          requiresUserInput: false,
          alternativeOptions: [],
          warningFlags: [],
          processingTime: Date.now(),
          algorithmsUsed: ['exact_medical_id_match']
        };
      }
    }
    
    // Perfect name + DOB match
    for (const profile of accountProfiles) {
      const perfectNameMatch = this.hasExactNameMatch(
        extractedIdentity.names,
        profile.personalInfo.names
      );
      
      const perfectDOBMatch = this.hasExactDOBMatch(
        extractedIdentity.dateOfBirth,
        profile.personalInfo.dateOfBirth
      );
      
      if (perfectNameMatch && perfectDOBMatch) {
        return {
          decision: 'auto_accept',
          assignedProfileId: profile.id,
          confidence: 0.98,
          profileScores: [await this.scoreProfile(extractedIdentity, profile)],
          matchingFactors: [
            { type: 'exact_name', value: 1.0, weight: 0.5 },
            { type: 'exact_dob', value: 1.0, weight: 0.25 }
          ],
          reasoning: ['Perfect name and date of birth match - fast track approval'],
          requiresUserInput: false,
          alternativeOptions: [],
          warningFlags: [],
          processingTime: Date.now(),
          algorithmsUsed: ['exact_name_dob_match']
        };
      }
    }
    
    return null; // No obvious matches found
  }
}
```

---

## Security and Audit Compliance

### Matching Decision Audit Trail
```typescript
class ProfileMatchingAuditor {
  async auditMatchingDecision(
    matchingResult: ProfileMatchingResult,
    extractedIdentity: ExtractedIdentity,
    accountContext: AccountContext,
    userId: string
  ): Promise<AuditTrailEntry> {
    
    // Create comprehensive audit record without PHI
    const auditEntry: AuditTrailEntry = {
      // Non-PHI identifiers
      userId,
      documentId: extractedIdentity.documentId,
      sessionId: extractedIdentity.sessionId,
      
      // Matching decision details
      decision: matchingResult.decision,
      assignedProfileId: matchingResult.assignedProfileId,
      confidence: matchingResult.confidence,
      
      // Algorithm transparency
      algorithmsUsed: matchingResult.algorithmsUsed,
      matchingFactors: matchingResult.matchingFactors.map(factor => ({
        type: factor.type,
        weight: factor.weight,
        confidence: factor.confidence
        // Value omitted to avoid PHI
      })),
      
      // Quality metrics
      processingTime: matchingResult.processingTime,
      alternativeOptionsCount: matchingResult.alternativeOptions.length,
      warningFlags: matchingResult.warningFlags,
      
      // Compliance metadata
      timestamp: new Date(),
      complianceVersion: '1.0',
      retentionCategory: 'healthcare_processing',
      
      // User interaction tracking (if any)
      requiresUserInput: matchingResult.requiresUserInput,
      userInteractionType: this.determineInteractionType(matchingResult)
    };
    
    // Store audit entry securely
    await this.storeAuditEntry(auditEntry);
    
    // Trigger compliance monitoring if needed
    if (this.requiresComplianceAlert(matchingResult)) {
      await this.triggerComplianceAlert(auditEntry, matchingResult);
    }
    
    return auditEntry;
  }

  private async triggerComplianceAlert(
    auditEntry: AuditTrailEntry,
    matchingResult: ProfileMatchingResult
  ): Promise<void> {
    
    const alerts: ComplianceAlert[] = [];
    
    // Low confidence profile assignment
    if (matchingResult.confidence < 0.6 && matchingResult.decision === 'auto_accept') {
      alerts.push({
        type: 'low_confidence_auto_assignment',
        severity: 'medium',
        description: 'Profile automatically assigned with confidence below recommended threshold',
        recommendedAction: 'Review assignment accuracy'
      });
    }
    
    // Age-inappropriate medical procedures
    if (matchingResult.warningFlags.includes('age_inappropriate_procedure')) {
      alerts.push({
        type: 'age_inappropriate_assignment',
        severity: 'high',
        description: 'Adult medical procedures assigned to child profile',
        recommendedAction: 'Immediate review required'
      });
    }
    
    // Process alerts
    for (const alert of alerts) {
      await this.processComplianceAlert(alert, auditEntry);
    }
  }
}
```

---

*Profile matching serves as the intelligent bridge between extracted identity information and the correct patient profile, ensuring that every document finds its accurate home within the complex multi-profile healthcare ecosystem while maintaining the highest standards of accuracy, privacy, and regulatory compliance.*