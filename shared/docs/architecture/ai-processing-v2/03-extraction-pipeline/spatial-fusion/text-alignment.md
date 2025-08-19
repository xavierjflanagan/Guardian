# Text Alignment Engine

**Purpose:** Map AI-extracted clinical facts to OCR spatial coordinates for precise document provenance  
**Focus:** Spatial coordinate alignment, text matching algorithms, and bounding box generation  
**Priority:** PHASE 2+ - Enhancement for healthcare-grade spatial precision  
**Dependencies:** AI clinical fact extraction, OCR spatial data, PostGIS integration

---

## System Overview

The Text Alignment Engine solves the critical challenge of mapping AI-extracted clinical concepts to precise spatial coordinates on medical documents. While AI vision models excel at understanding medical content, they cannot provide the pixel-perfect spatial accuracy required for healthcare compliance, click-to-zoom functionality, and regulatory audit trails.

### Core Challenge and Solution
```yaml
spatial_alignment_challenge:
  problem: "AI models extract clinical facts but cannot provide precise spatial coordinates"
  healthcare_requirement: "Regulatory compliance demands exact document provenance"
  technical_gap: "Need to map AI concepts to OCR spatial regions"
  
solution_architecture:
  ocr_foundation: "Google Cloud Vision API provides pixel-perfect spatial coordinates"
  ai_intelligence: "GPT-4o Mini provides medical concept understanding"
  alignment_bridge: "Text alignment algorithms connect AI concepts to OCR regions"
  output: "Clinical facts with PostGIS-compatible bounding boxes"
```

---

## Text Alignment Architecture

### Multi-Level Matching Strategy
```typescript
interface TextAlignmentEngine {
  // Primary alignment methods (in order of preference)
  alignmentMethods: {
    exact_text_match: "Direct string matching between AI and OCR text";
    fuzzy_text_match: "Levenshtein distance matching for OCR errors";
    semantic_region_match: "Map AI concepts to OCR semantic regions";
    positional_inference: "Infer location based on document structure";
    fallback_estimation: "Estimate coordinates using document layout";
  };
  
  // Alignment quality metrics
  qualityThresholds: {
    exact_match: 0.95;          // Perfect text alignment
    high_confidence: 0.85;      // Strong alignment confidence
    acceptable: 0.70;           // Acceptable for most use cases
    requires_review: 0.50;      // Manual review recommended
    unreliable: 0.30;           // Spatial data not trustworthy
  };
  
  // Spatial precision requirements
  spatialRequirements: {
    click_to_zoom: "Bounding box must contain complete text element";
    regulatory_compliance: "Spatial provenance must be auditable";
    postgis_integration: "Coordinates must be PostGIS GEOMETRY compatible";
    multi_page_support: "Handle multi-page document spatial mapping";
  };
}

class TextAlignmentEngine {
  async alignClinicalFactsToSpatialRegions(
    aiExtractedFacts: ClinicalFact[],
    ocrSpatialData: OCRSpatialData,
    documentMetadata: DocumentMetadata
  ): Promise<SpatiallyAlignedFacts> {
    
    const alignedFacts: SpatiallyAlignedFact[] = [];
    const alignmentMetrics: AlignmentMetrics = {
      totalFacts: aiExtractedFacts.length,
      successfulAlignments: 0,
      highConfidenceAlignments: 0,
      requiresReview: 0,
      unaligned: 0
    };
    
    for (const fact of aiExtractedFacts) {
      const alignment = await this.alignSingleFact(
        fact,
        ocrSpatialData,
        documentMetadata
      );
      
      alignedFacts.push({
        clinicalFact: fact,
        spatialAlignment: alignment,
        alignmentQuality: alignment.confidence,
        alignmentMethod: alignment.method
      });
      
      // Update metrics
      this.updateAlignmentMetrics(alignmentMetrics, alignment);
    }
    
    return {
      alignedFacts,
      alignmentMetrics,
      documentSpatialData: this.generateDocumentSpatialSummary(alignedFacts),
      qualityAssessment: this.assessOverallAlignmentQuality(alignmentMetrics)
    };
  }

  private async alignSingleFact(
    fact: ClinicalFact,
    ocrData: OCRSpatialData,
    documentMetadata: DocumentMetadata
  ): Promise<SpatialAlignment> {
    
    // Method 1: Exact text matching
    const exactMatch = await this.findExactTextMatch(fact.text, ocrData);
    if (exactMatch.confidence > 0.95) {
      return {
        boundingBox: exactMatch.boundingBox,
        confidence: exactMatch.confidence,
        method: 'exact_text_match',
        ocrRegionId: exactMatch.regionId,
        alignmentEvidence: exactMatch.evidence
      };
    }
    
    // Method 2: Fuzzy text matching for OCR errors
    const fuzzyMatch = await this.findFuzzyTextMatch(fact.text, ocrData);
    if (fuzzyMatch.confidence > 0.80) {
      return {
        boundingBox: fuzzyMatch.boundingBox,
        confidence: fuzzyMatch.confidence,
        method: 'fuzzy_text_match',
        ocrRegionId: fuzzyMatch.regionId,
        alignmentEvidence: fuzzyMatch.evidence,
        textVariations: fuzzyMatch.variations
      };
    }
    
    // Method 3: Semantic region matching
    const semanticMatch = await this.findSemanticRegionMatch(fact, ocrData);
    if (semanticMatch.confidence > 0.70) {
      return {
        boundingBox: semanticMatch.boundingBox,
        confidence: semanticMatch.confidence,
        method: 'semantic_region_match',
        ocrRegionId: semanticMatch.regionId,
        alignmentEvidence: semanticMatch.evidence,
        semanticContext: semanticMatch.context
      };
    }
    
    // Method 4: Positional inference
    const positionalMatch = await this.inferPositionalAlignment(
      fact,
      ocrData,
      documentMetadata
    );
    if (positionalMatch.confidence > 0.50) {
      return {
        boundingBox: positionalMatch.boundingBox,
        confidence: positionalMatch.confidence,
        method: 'positional_inference',
        alignmentEvidence: positionalMatch.evidence,
        inferenceReasoning: positionalMatch.reasoning
      };
    }
    
    // Method 5: Fallback estimation
    return this.generateFallbackAlignment(fact, ocrData, documentMetadata);
  }
}
```

---

## Exact Text Matching Algorithms

### High-Precision Text Matching
```typescript
class ExactTextMatcher {
  async findExactTextMatch(
    clinicalText: string,
    ocrData: OCRSpatialData
  ): Promise<ExactMatchResult> {
    
    // Normalize text for comparison
    const normalizedClinicalText = this.normalizeForMatching(clinicalText);
    
    // Search through OCR text elements
    for (const ocrElement of ocrData.textElements) {
      const normalizedOCRText = this.normalizeForMatching(ocrElement.text);
      
      // Direct exact match
      if (normalizedClinicalText === normalizedOCRText) {
        return {
          confidence: 1.0,
          boundingBox: ocrElement.boundingBox,
          regionId: ocrElement.id,
          evidence: {
            matchType: 'exact_complete',
            clinicalText: clinicalText,
            ocrText: ocrElement.text,
            matchScore: 1.0
          }
        };
      }
      
      // Substring exact match
      if (normalizedOCRText.includes(normalizedClinicalText)) {
        const substringAlignment = this.calculateSubstringAlignment(
          normalizedClinicalText,
          normalizedOCRText,
          ocrElement.boundingBox
        );
        
        return {
          confidence: 0.98,
          boundingBox: substringAlignment.adjustedBoundingBox,
          regionId: ocrElement.id,
          evidence: {
            matchType: 'exact_substring',
            clinicalText: clinicalText,
            ocrText: ocrElement.text,
            matchScore: 0.98,
            substringPosition: substringAlignment.position
          }
        };
      }
    }
    
    // Multi-element spanning match
    const spanningMatch = await this.findSpanningTextMatch(
      normalizedClinicalText,
      ocrData.textElements
    );
    
    if (spanningMatch.confidence > 0.90) {
      return spanningMatch;
    }
    
    return { confidence: 0, evidence: { matchType: 'no_exact_match' } };
  }

  private normalizeForMatching(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')                    // Normalize whitespace
      .replace(/[^\w\s\.\-\/]/g, '')          // Remove special chars except medical ones
      .replace(/(\d+)\s*([a-z]+)/g, '$1$2')   // Join numbers with units (e.g., "10 mg" -> "10mg")
      .replace(/\b(dr|mr|mrs|ms)\.?\s+/g, '')  // Remove titles
      .replace(/\b(the|a|an)\s+/g, '');       // Remove articles
  }

  private async findSpanningTextMatch(
    clinicalText: string,
    ocrElements: OCRTextElement[]
  ): Promise<SpanningMatchResult> {
    
    // Try to find clinical text spanning multiple OCR elements
    const words = clinicalText.split(' ');
    
    for (let startIdx = 0; startIdx < ocrElements.length; startIdx++) {
      const spanningResult = this.attemptSpanningMatch(
        words,
        ocrElements,
        startIdx
      );
      
      if (spanningResult.confidence > 0.90) {
        return {
          confidence: spanningResult.confidence,
          boundingBox: this.calculateSpanningBoundingBox(spanningResult.elements),
          regionId: this.generateSpanningRegionId(spanningResult.elements),
          evidence: {
            matchType: 'spanning_exact',
            spanningElements: spanningResult.elements.length,
            coverage: spanningResult.coverage,
            alignment: spanningResult.alignment
          }
        };
      }
    }
    
    return { confidence: 0, evidence: { matchType: 'no_spanning_match' } };
  }

  private attemptSpanningMatch(
    words: string[],
    ocrElements: OCRTextElement[],
    startIdx: number
  ): SpanningAttemptResult {
    
    let wordIdx = 0;
    let elementIdx = startIdx;
    const matchedElements: OCRTextElement[] = [];
    const wordMatches: WordMatch[] = [];
    
    while (wordIdx < words.length && elementIdx < ocrElements.length) {
      const element = ocrElements[elementIdx];
      const elementWords = element.text.toLowerCase().split(/\s+/);
      
      // Try to match words within this element
      let elementWordIdx = 0;
      let foundWordInElement = false;
      
      while (wordIdx < words.length && elementWordIdx < elementWords.length) {
        if (words[wordIdx] === elementWords[elementWordIdx]) {
          wordMatches.push({
            clinicalWord: words[wordIdx],
            ocrWord: elementWords[elementWordIdx],
            elementId: element.id,
            confidence: 1.0
          });
          
          wordIdx++;
          foundWordInElement = true;
        }
        elementWordIdx++;
      }
      
      if (foundWordInElement) {
        matchedElements.push(element);
      }
      
      elementIdx++;
    }
    
    const coverage = wordIdx / words.length;
    const confidence = coverage > 0.8 ? coverage * 0.95 : coverage * 0.7;
    
    return {
      confidence,
      coverage,
      elements: matchedElements,
      wordMatches,
      alignment: this.calculateWordAlignment(wordMatches)
    };
  }
}
```

---

## Fuzzy Text Matching for OCR Errors

### Error-Tolerant Matching Algorithms
```typescript
class FuzzyTextMatcher {
  async findFuzzyTextMatch(
    clinicalText: string,
    ocrData: OCRSpatialData,
    maxDistance: number = 3
  ): Promise<FuzzyMatchResult> {
    
    const normalizedClinicalText = this.normalizeForFuzzyMatching(clinicalText);
    let bestMatch: FuzzyMatch | null = null;
    
    for (const ocrElement of ocrData.textElements) {
      const normalizedOCRText = this.normalizeForFuzzyMatching(ocrElement.text);
      
      // Calculate Levenshtein distance
      const distance = this.calculateLevenshteinDistance(
        normalizedClinicalText,
        normalizedOCRText
      );
      
      // Calculate similarity score
      const maxLength = Math.max(normalizedClinicalText.length, normalizedOCRText.length);
      const similarity = 1 - (distance / maxLength);
      
      if (similarity > 0.80 && distance <= maxDistance) {
        const fuzzyMatch: FuzzyMatch = {
          confidence: similarity,
          boundingBox: ocrElement.boundingBox,
          regionId: ocrElement.id,
          levenshteinDistance: distance,
          textVariations: this.identifyTextVariations(
            clinicalText,
            ocrElement.text
          ),
          ocrErrors: this.identifyOCRErrors(
            normalizedClinicalText,
            normalizedOCRText
          )
        };
        
        if (!bestMatch || fuzzyMatch.confidence > bestMatch.confidence) {
          bestMatch = fuzzyMatch;
        }
      }
    }
    
    if (bestMatch) {
      return {
        confidence: bestMatch.confidence,
        boundingBox: bestMatch.boundingBox,
        regionId: bestMatch.regionId,
        evidence: {
          matchType: 'fuzzy_text',
          levenshteinDistance: bestMatch.levenshteinDistance,
          textVariations: bestMatch.textVariations,
          ocrErrors: bestMatch.ocrErrors
        }
      };
    }
    
    return { confidence: 0, evidence: { matchType: 'no_fuzzy_match' } };
  }

  private calculateLevenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => 
      Array(str1.length + 1).fill(null)
    );
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private identifyOCRErrors(
    clinicalText: string,
    ocrText: string
  ): OCRError[] {
    const errors: OCRError[] = [];
    
    // Common OCR error patterns in medical documents
    const ocrErrorPatterns = [
      { pattern: /0/g, likely: ['O', 'o'], type: 'digit_letter_confusion' },
      { pattern: /1/g, likely: ['l', 'I'], type: 'digit_letter_confusion' },
      { pattern: /5/g, likely: ['S', 's'], type: 'digit_letter_confusion' },
      { pattern: /rn/g, likely: ['m'], type: 'character_fusion' },
      { pattern: /cl/g, likely: ['d'], type: 'character_fusion' },
      { pattern: /\./g, likely: [',', ':'], type: 'punctuation_confusion' }
    ];
    
    for (const errorPattern of ocrErrorPatterns) {
      const clinicalMatches = clinicalText.match(errorPattern.pattern);
      const ocrMatches = ocrText.match(errorPattern.pattern);
      
      if (clinicalMatches && ocrMatches && 
          clinicalMatches.length !== ocrMatches.length) {
        errors.push({
          type: errorPattern.type,
          pattern: errorPattern.pattern.source,
          expectedCount: clinicalMatches.length,
          actualCount: ocrMatches.length,
          likelyCorrections: errorPattern.likely
        });
      }
    }
    
    return errors;
  }

  private identifyTextVariations(
    clinicalText: string,
    ocrText: string
  ): TextVariation[] {
    const variations: TextVariation[] = [];
    
    // Medical abbreviation variations
    const medicalVariations = this.findMedicalAbbreviationVariations(
      clinicalText,
      ocrText
    );
    variations.push(...medicalVariations);
    
    // Number format variations
    const numberVariations = this.findNumberFormatVariations(
      clinicalText,
      ocrText
    );
    variations.push(...numberVariations);
    
    // Unit variations
    const unitVariations = this.findUnitVariations(clinicalText, ocrText);
    variations.push(...unitVariations);
    
    return variations;
  }
}
```

---

## Semantic Region Matching

### Context-Aware Spatial Alignment
```typescript
class SemanticRegionMatcher {
  async findSemanticRegionMatch(
    clinicalFact: ClinicalFact,
    ocrData: OCRSpatialData
  ): Promise<SemanticMatchResult> {
    
    // Identify document regions by semantic content
    const semanticRegions = await this.identifySemanticRegions(ocrData);
    
    // Determine which semantic region should contain this clinical fact
    const expectedRegions = this.getExpectedRegionsForFact(clinicalFact);
    
    // Search for the fact within expected regions
    for (const regionType of expectedRegions) {
      const region = semanticRegions[regionType];
      
      if (region) {
        const regionMatch = await this.searchWithinSemanticRegion(
          clinicalFact,
          region
        );
        
        if (regionMatch.confidence > 0.70) {
          return {
            confidence: regionMatch.confidence,
            boundingBox: regionMatch.boundingBox,
            regionId: region.id,
            evidence: {
              matchType: 'semantic_region',
              regionType: regionType,
              semanticContext: region.context,
              matchDetails: regionMatch.details
            }
          };
        }
      }
    }
    
    return { confidence: 0, evidence: { matchType: 'no_semantic_match' } };
  }

  private async identifySemanticRegions(
    ocrData: OCRSpatialData
  ): Promise<SemanticRegions> {
    
    const regions: SemanticRegions = {};
    
    // Header region identification
    regions.header = this.identifyHeaderRegion(ocrData);
    
    // Patient information region
    regions.patientInfo = this.identifyPatientInfoRegion(ocrData);
    
    // Laboratory results section
    regions.labResults = this.identifyLabResultsRegion(ocrData);
    
    // Medication section
    regions.medications = this.identifyMedicationRegion(ocrData);
    
    // Clinical notes section
    regions.clinicalNotes = this.identifyClinicalNotesRegion(ocrData);
    
    // Provider information section
    regions.providerInfo = this.identifyProviderInfoRegion(ocrData);
    
    return regions;
  }

  private identifyLabResultsRegion(ocrData: OCRSpatialData): SemanticRegion | null {
    const labIndicators = [
      'test name', 'result', 'reference range', 'normal range',
      'lab results', 'laboratory', 'specimen', 'collection date',
      'hemoglobin', 'glucose', 'cholesterol', 'creatinine'
    ];
    
    // Find OCR elements that contain lab indicators
    const labElements = ocrData.textElements.filter(element =>
      labIndicators.some(indicator =>
        element.text.toLowerCase().includes(indicator)
      )
    );
    
    if (labElements.length === 0) return null;
    
    // Calculate region boundaries
    const regionBounds = this.calculateRegionBounds(labElements, ocrData);
    
    return {
      id: 'lab_results_region',
      type: 'labResults',
      boundingBox: regionBounds,
      confidence: this.calculateRegionConfidence(labElements, labIndicators),
      context: {
        elementCount: labElements.length,
        indicatorMatches: this.getMatchedIndicators(labElements, labIndicators),
        spatialCharacteristics: this.analyzeRegionSpatialCharacteristics(regionBounds)
      },
      textElements: labElements
    };
  }

  private getExpectedRegionsForFact(clinicalFact: ClinicalFact): SemanticRegionType[] {
    switch (clinicalFact.type) {
      case 'laboratory_result':
        return ['labResults', 'clinicalNotes'];
        
      case 'medication':
        return ['medications', 'clinicalNotes'];
        
      case 'vital_sign':
        return ['clinicalNotes', 'patientInfo'];
        
      case 'diagnosis':
        return ['clinicalNotes', 'header'];
        
      case 'patient_demographics':
        return ['patientInfo', 'header'];
        
      case 'provider_information':
        return ['providerInfo', 'header'];
        
      default:
        return ['clinicalNotes', 'patientInfo', 'labResults'];
    }
  }

  private async searchWithinSemanticRegion(
    clinicalFact: ClinicalFact,
    region: SemanticRegion
  ): Promise<RegionSearchResult> {
    
    // Use multiple search strategies within the region
    const searchStrategies = [
      this.keywordProximitySearch(clinicalFact, region),
      this.structuralPatternSearch(clinicalFact, region),
      this.contextualSimilaritySearch(clinicalFact, region)
    ];
    
    const searchResults = await Promise.all(searchStrategies);
    
    // Select best search result
    const bestResult = searchResults.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );
    
    if (bestResult.confidence > 0.60) {
      return {
        confidence: bestResult.confidence * region.confidence, // Factor in region confidence
        boundingBox: bestResult.boundingBox,
        details: {
          searchStrategy: bestResult.strategy,
          regionMatch: bestResult.regionMatch,
          textAlignment: bestResult.textAlignment
        }
      };
    }
    
    return { confidence: 0, details: { searchStrategy: 'none_successful' } };
  }
}
```

---

## PostGIS Integration and Coordinate Conversion

### Spatial Data Preparation
```typescript
class PostGISCoordinateConverter {
  async convertToPostGISGeometry(
    alignedFacts: SpatiallyAlignedFact[],
    documentMetadata: DocumentMetadata
  ): Promise<PostGISGeometryData> {
    
    const geometries: PostGISGeometry[] = [];
    
    for (const alignedFact of alignedFacts) {
      if (alignedFact.spatialAlignment.confidence > 0.50) {
        const geometry = await this.createPostGISGeometry(
          alignedFact.spatialAlignment.boundingBox,
          documentMetadata
        );
        
        geometries.push({
          clinicalFactId: alignedFact.clinicalFact.id,
          geometry: geometry,
          confidence: alignedFact.spatialAlignment.confidence,
          coordinateSystem: 'document_relative',
          metaddata: {
            documentId: documentMetadata.documentId,
            pageNumber: alignedFact.spatialAlignment.pageNumber,
            documentDimensions: documentMetadata.dimensions
          }
        });
      }
    }
    
    return {
      geometries,
      documentSpatialReference: this.createDocumentSpatialReference(documentMetadata),
      qualityMetrics: this.calculateSpatialQualityMetrics(geometries)
    };
  }

  private async createPostGISGeometry(
    boundingBox: BoundingBox,
    documentMetadata: DocumentMetadata
  ): Promise<PostGISGeometryString> {
    
    // Convert relative coordinates to document coordinates
    const documentCoords = this.convertToDocumentCoordinates(
      boundingBox,
      documentMetadata.dimensions
    );
    
    // Create PostGIS POLYGON geometry
    const polygon = `POLYGON((
      ${documentCoords.topLeft.x} ${documentCoords.topLeft.y},
      ${documentCoords.topRight.x} ${documentCoords.topRight.y},
      ${documentCoords.bottomRight.x} ${documentCoords.bottomRight.y},
      ${documentCoords.bottomLeft.x} ${documentCoords.bottomLeft.y},
      ${documentCoords.topLeft.x} ${documentCoords.topLeft.y}
    ))`;
    
    return `ST_GeomFromText('${polygon}', ${this.getDocumentSRID(documentMetadata)})`;
  }

  private convertToDocumentCoordinates(
    boundingBox: BoundingBox,
    documentDimensions: DocumentDimensions
  ): DocumentCoordinates {
    
    // Convert percentage-based coordinates to actual pixel coordinates
    return {
      topLeft: {
        x: (boundingBox.x / 100) * documentDimensions.width,
        y: (boundingBox.y / 100) * documentDimensions.height
      },
      topRight: {
        x: ((boundingBox.x + boundingBox.width) / 100) * documentDimensions.width,
        y: (boundingBox.y / 100) * documentDimensions.height
      },
      bottomRight: {
        x: ((boundingBox.x + boundingBox.width) / 100) * documentDimensions.width,
        y: ((boundingBox.y + boundingBox.height) / 100) * documentDimensions.height
      },
      bottomLeft: {
        x: (boundingBox.x / 100) * documentDimensions.width,
        y: ((boundingBox.y + boundingBox.height) / 100) * documentDimensions.height
      }
    };
  }
}
```

---

## Quality Assurance and Validation

### Alignment Quality Metrics
```typescript
class AlignmentQualityAssurance {
  async validateAlignmentQuality(
    alignedFacts: SpatiallyAlignedFact[],
    documentMetadata: DocumentMetadata
  ): Promise<AlignmentQualityReport> {
    
    const qualityChecks: QualityCheck[] = [];
    
    // Check 1: Alignment confidence distribution
    const confidenceDistribution = this.analyzeConfidenceDistribution(alignedFacts);
    qualityChecks.push({
      checkType: 'confidence_distribution',
      passed: confidenceDistribution.averageConfidence > 0.70,
      score: confidenceDistribution.averageConfidence,
      details: confidenceDistribution
    });
    
    // Check 2: Spatial coherence validation
    const spatialCoherence = this.validateSpatialCoherence(alignedFacts);
    qualityChecks.push({
      checkType: 'spatial_coherence',
      passed: spatialCoherence.coherenceScore > 0.80,
      score: spatialCoherence.coherenceScore,
      details: spatialCoherence
    });
    
    // Check 3: Coverage completeness
    const coverageCompleteness = this.analyzeCoverageCompleteness(alignedFacts);
    qualityChecks.push({
      checkType: 'coverage_completeness',
      passed: coverageCompleteness.coverageRate > 0.85,
      score: coverageCompleteness.coverageRate,
      details: coverageCompleteness
    });
    
    // Check 4: Method reliability
    const methodReliability = this.analyzeMethodReliability(alignedFacts);
    qualityChecks.push({
      checkType: 'method_reliability',
      passed: methodReliability.reliabilityScore > 0.75,
      score: methodReliability.reliabilityScore,
      details: methodReliability
    });
    
    const overallQuality = this.calculateOverallQuality(qualityChecks);
    
    return {
      overallQuality,
      qualityChecks,
      recommendedActions: this.generateQualityRecommendations(qualityChecks),
      alignmentStatistics: this.generateAlignmentStatistics(alignedFacts)
    };
  }

  private validateSpatialCoherence(
    alignedFacts: SpatiallyAlignedFact[]
  ): SpatialCoherenceAnalysis {
    
    const coherenceIssues: SpatialCoherenceIssue[] = [];
    let coherenceScore = 1.0;
    
    // Check for overlapping bounding boxes that shouldn't overlap
    const overlaps = this.detectInappropriateOverlaps(alignedFacts);
    if (overlaps.length > 0) {
      coherenceScore -= overlaps.length * 0.1;
      coherenceIssues.push({
        type: 'inappropriate_overlaps',
        count: overlaps.length,
        details: overlaps
      });
    }
    
    // Check for spatial ordering consistency
    const orderingIssues = this.validateSpatialOrdering(alignedFacts);
    if (orderingIssues.length > 0) {
      coherenceScore -= orderingIssues.length * 0.05;
      coherenceIssues.push({
        type: 'spatial_ordering_inconsistency',
        count: orderingIssues.length,
        details: orderingIssues
      });
    }
    
    // Check for reasonable bounding box sizes
    const sizeIssues = this.validateBoundingBoxSizes(alignedFacts);
    if (sizeIssues.length > 0) {
      coherenceScore -= sizeIssues.length * 0.05;
      coherenceIssues.push({
        type: 'unreasonable_bounding_box_sizes',
        count: sizeIssues.length,
        details: sizeIssues
      });
    }
    
    return {
      coherenceScore: Math.max(0, coherenceScore),
      coherenceIssues,
      spatialDistribution: this.analyzeSpatialDistribution(alignedFacts),
      recommendedImprovements: this.generateCoherenceImprovements(coherenceIssues)
    };
  }
}
```

---

*The Text Alignment Engine bridges the gap between AI's medical intelligence and OCR's spatial precision, enabling Guardian to provide healthcare-grade document provenance while maintaining the cost-effectiveness and clinical accuracy of AI-first processing.*