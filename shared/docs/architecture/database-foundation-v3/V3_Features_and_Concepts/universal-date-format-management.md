# Universal Date Format Management System

**Status**: Complete Implementation Specification  
**Purpose**: Global date format detection, normalization, and user preference-based display system for international healthcare document processing

## Overview

The Universal Date Format Management System ensures that Exora can accurately process dates from healthcare documents worldwide, normalize them to a consistent internal format, and display them according to each user's cultural preferences. This system is critical for supporting Australia's diverse population where 1/3 are born overseas.

**Key Integration Points**:
- Feeds normalized dates into [`./temporal-data-management/temporal-conflict-resolution.md`](./temporal-data-management/temporal-conflict-resolution.md)
- Supports [`./temporal-data-management/clinical-identity-policies.md`](./temporal-data-management/clinical-identity-policies.md) with reliable date handling
- Referenced by Pass 2 AI processing for date extraction guidance

## Architecture Overview

### Three-Layer Date Processing Pipeline

```typescript
// Layer 1: Raw Date Detection & Normalization
const rawDate = "15/03/2024"; // From document
const normalizedDate = await detectAndNormalizeDate(rawDate, documentContext);

// Layer 2: Temporal Precedence Resolution (temporal-conflict-resolution.md)
const authoritativeDate = await selectTemporalPrecedence(allNormalizedDates);

// Layer 3: User Preference Display
const displayDate = formatForUser(authoritativeDate, userPreferences);
```

### Core Components

1. **Global Format Detection Engine**: Identifies likely date format from document origin
2. **Universal Normalization Service**: Converts all dates to ISO 8601 format
3. **User Preference Management**: Stores and applies user's cultural date preferences
4. **Confidence Propagation System**: Tracks uncertainty through entire pipeline
5. **Dashboard Display Engine**: Real-time format conversion for UI

## Global Format Detection Engine

### Supported International Date Formats

```typescript
interface GlobalDateFormat {
  pattern: RegExp;
  format_code: string;
  regions: string[];
  confidence_indicators: string[];
}

const GLOBAL_DATE_FORMATS: GlobalDateFormat[] = [
  // European/Australian/British formats
  {
    pattern: /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    format_code: 'DD/MM/YYYY',
    regions: ['AU', 'GB', 'IE', 'NZ', 'ZA'],
    confidence_indicators: ['NHS', 'Medicare', 'GP letter', 'Royal Hospital']
  },
  
  // American format
  {
    pattern: /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    format_code: 'MM/DD/YYYY',
    regions: ['US', 'CA'],
    confidence_indicators: ['Insurance', 'Copay', 'Social Security', 'FDA']
  },
  
  // European dot notation
  {
    pattern: /(\d{1,2})\.(\d{1,2})\.(\d{4})/,
    format_code: 'DD.MM.YYYY',
    regions: ['DE', 'AT', 'CH', 'NL', 'NO', 'DK', 'SE'],
    confidence_indicators: ['Krankenhaus', 'Ziekenhuis', 'Sjukhus']
  },
  
  // ISO 8601 international standard
  {
    pattern: /(\d{4})-(\d{1,2})-(\d{1,2})/,
    format_code: 'YYYY-MM-DD',
    regions: ['GLOBAL'],
    confidence_indicators: ['ISO', 'UTC', 'GMT', 'API']
  },
  
  // Asian formats
  {
    pattern: /(\d{4})年(\d{1,2})月(\d{1,2})日/,
    format_code: 'YYYY年MM月DD日',
    regions: ['CN', 'TW'],
    confidence_indicators: ['医院', '诊断', '治疗']
  },
  
  // French format
  {
    pattern: /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    format_code: 'DD/MM/YYYY',
    regions: ['FR', 'BE', 'LU'],
    confidence_indicators: ['Hôpital', 'Médecin', 'Ordonnance']
  },
  
  // Additional 15+ regional formats...
];
```

### Document Origin Detection

```typescript
interface DocumentOriginAnalysis {
  suspected_country: string;
  confidence: number;
  evidence: OriginEvidence[];
  recommended_format: string;
  alternative_formats: string[];
}

interface OriginEvidence {
  type: 'healthcare_system' | 'currency' | 'language' | 'institution' | 'date_pattern';
  indicator: string;
  confidence_weight: number;
}

async function analyzeDocumentOrigin(
  documentContent: string,
  metadata: DocumentMetadata
): Promise<DocumentOriginAnalysis> {
  
  const evidence: OriginEvidence[] = [];
  
  // Healthcare system indicators
  const healthcarePatterns = {
    australia: [
      /medicare\s+number/i,
      /PBS/i,
      /TGA/i,
      /AHPRA/i,
      /Royal.*Hospital/i,
      /GP\s+(letter|referral)/i,
      /specialist.*referral/i
    ],
    usa: [
      /social\s+security/i,
      /insurance.*copay/i,
      /FDA/i,
      /medicare.*medicaid/i,
      /health\s+insurance/i,
      /hospital\s+system/i
    ],
    uk: [
      /NHS/i,
      /National\s+Health/i,
      /consultant.*letter/i,
      /A&E\s+department/i,
      /GP\s+surgery/i
    ],
    germany: [
      /Krankenhaus/i,
      /Arztbrief/i,
      /Krankenkasse/i,
      /Hausarzt/i
    ]
  };
  
  // Currency indicators
  const currencyPatterns = {
    australia: [/\$\d+\.\d{2}\s*(AUD|AU)/i, /\$\d+\s*dollar/i],
    usa: [/\$\d+\.\d{2}\s*(USD|US)/i, /\$\d+\s*dollar/i],
    uk: [/£\d+\.\d{2}/i, /\d+\s*pound/i],
    eurozone: [/€\d+\.\d{2}/i, /\d+\s*euro/i]
  };
  
  // Date pattern frequency analysis
  const datePatterns = extractDatePatterns(documentContent);
  
  for (const [country, patterns] of Object.entries(healthcarePatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(documentContent)) {
        evidence.push({
          type: 'healthcare_system',
          indicator: pattern.source,
          confidence_weight: 0.3
        });
      }
    }
  }
  
  // Calculate overall confidence
  const totalWeight = evidence.reduce((sum, e) => sum + e.confidence_weight, 0);
  const topCountry = determineTopCountry(evidence);
  
  return {
    suspected_country: topCountry.country,
    confidence: Math.min(totalWeight, 1.0),
    evidence: evidence,
    recommended_format: getDefaultFormatForCountry(topCountry.country),
    alternative_formats: getAlternativeFormats(topCountry.country)
  };
}
```

### AI Pass 2 Integration Guidelines

```typescript
// Enhanced AI prompt for date extraction
const universalDateExtractionPrompt = `
CRITICAL: Universal Date Format Detection Required

Document Analysis:
- Suspected Origin: ${originAnalysis.suspected_country} (confidence: ${originAnalysis.confidence})
- Recommended Format: ${originAnalysis.recommended_format}
- Alternative Formats: ${originAnalysis.alternative_formats.join(', ')}

Evidence for Format Determination:
${originAnalysis.evidence.map(e => `- ${e.type}: ${e.indicator}`).join('\n')}

EXTRACTION REQUIREMENTS:
1. Extract ALL dates found in document with explicit format analysis
2. For ambiguous dates (01/02/2024), provide BOTH interpretations with confidence scores
3. Use origin context to determine most likely interpretation
4. Flag uncertain dates for user review

Output Format:
{
  "extracted_dates": [
    {
      "original_text": "15/03/2024",
      "assumed_format": "DD/MM/YYYY",
      "normalized_iso": "2024-03-15",
      "confidence": 0.9,
      "ambiguity_analysis": {
        "is_ambiguous": false,
        "alternative_interpretation": null,
        "disambiguation_reasoning": "Day > 12, unambiguous DD/MM format"
      },
      "source_context": "Started medication on 15/03/2024",
      "date_type": "clinical_content"
    },
    {
      "original_text": "03/02/2024", 
      "assumed_format": "DD/MM/YYYY",
      "normalized_iso": "2024-02-03",
      "confidence": 0.7,
      "ambiguity_analysis": {
        "is_ambiguous": true,
        "alternative_interpretation": "2024-03-02",
        "alternative_format": "MM/DD/YYYY",
        "disambiguation_reasoning": "Australian healthcare context suggests DD/MM, but ambiguous"
      },
      "source_context": "Report dated 03/02/2024",
      "date_type": "document_date"
    }
  ],
  "format_confidence_summary": {
    "overall_format_confidence": 0.8,
    "ambiguous_dates_count": 1,
    "requires_user_verification": true
  }
}
`;
```

## Universal Normalization Service

### Core Normalization Function

```typescript
interface UniversalDateNormalization {
  normalized_iso: string;          // Always ISO 8601: YYYY-MM-DD
  original_format: string;         // Raw text from document
  detected_format: string;         // Detected pattern (DD/MM/YYYY, etc.)
  confidence: number;              // 0.0 to 1.0
  ambiguity_flags: AmbiguityFlag[];
  alternative_interpretations: AlternativeInterpretation[];
  origin_analysis: DocumentOriginAnalysis;
}

interface AmbiguityFlag {
  flag_type: 'format_ambiguous' | 'low_confidence_origin' | 'conflicting_evidence' | 'unparseable_format';
  description: string;
  impact: 'high' | 'medium' | 'low';
}

interface AlternativeInterpretation {
  format: string;
  iso_date: string;
  confidence: number;
  reasoning: string;
}

async function normalizeUniversalDate(
  rawDateString: string,
  documentContext: DocumentContext
): Promise<UniversalDateNormalization> {
  
  // Step 1: Analyze document origin
  const originAnalysis = await analyzeDocumentOrigin(
    documentContext.content,
    documentContext.metadata
  );
  
  // Step 2: Apply global format detection
  const formatMatches = GLOBAL_DATE_FORMATS.filter(format =>
    format.pattern.test(rawDateString)
  );
  
  if (formatMatches.length === 0) {
    throw new Error(`Unparseable date format: ${rawDateString}`);
  }
  
  // Step 3: Disambiguate based on origin and date components
  const disambiguation = await disambiguateDateFormat(
    rawDateString,
    formatMatches,
    originAnalysis
  );
  
  // Step 4: Generate alternative interpretations for ambiguous cases
  const alternatives = await generateAlternativeInterpretations(
    rawDateString,
    formatMatches,
    disambiguation
  );
  
  return {
    normalized_iso: disambiguation.selected_iso_date,
    original_format: rawDateString,
    detected_format: disambiguation.selected_format,
    confidence: disambiguation.confidence,
    ambiguity_flags: disambiguation.flags,
    alternative_interpretations: alternatives,
    origin_analysis: originAnalysis
  };
}
```

### Format Disambiguation Logic

```typescript
async function disambiguateDateFormat(
  dateString: string,
  candidateFormats: GlobalDateFormat[],
  originAnalysis: DocumentOriginAnalysis
): Promise<FormatDisambiguation> {
  
  // Parse date components
  const components = parseDateComponents(dateString);
  const { first, second, year } = components;
  
  // Unambiguous cases (mathematical impossibility)
  if (first > 12) {
    return {
      selected_format: 'DD/MM/YYYY',
      selected_iso_date: `${year}-${second.padStart(2, '0')}-${first.padStart(2, '0')}`,
      confidence: 0.95,
      reasoning: 'First component > 12, must be day',
      flags: []
    };
  }
  
  if (second > 12) {
    return {
      selected_format: 'MM/DD/YYYY',
      selected_iso_date: `${year}-${first.padStart(2, '0')}-${second.padStart(2, '0')}`,
      confidence: 0.95,
      reasoning: 'Second component > 12, must be day in MM/DD format',
      flags: []
    };
  }
  
  // Ambiguous case - use origin analysis
  const flags: AmbiguityFlag[] = [];
  let confidence = originAnalysis.confidence;
  
  if (confidence < 0.6) {
    flags.push({
      flag_type: 'low_confidence_origin',
      description: 'Uncertain document origin affects date format confidence',
      impact: 'medium'
    });
  }
  
  // Regional format preference
  const regionalFormat = getRegionalFormatPreference(originAnalysis.suspected_country);
  
  if (regionalFormat === 'DD/MM/YYYY') {
    return {
      selected_format: 'DD/MM/YYYY',
      selected_iso_date: `${year}-${second.padStart(2, '0')}-${first.padStart(2, '0')}`,
      confidence: Math.max(confidence, 0.6),
      reasoning: `Regional preference for ${originAnalysis.suspected_country}`,
      flags: flags
    };
  } else if (regionalFormat === 'MM/DD/YYYY') {
    return {
      selected_format: 'MM/DD/YYYY',
      selected_iso_date: `${year}-${first.padStart(2, '0')}-${second.padStart(2, '0')}`,
      confidence: Math.max(confidence, 0.6),
      reasoning: `Regional preference for ${originAnalysis.suspected_country}`,
      flags: flags
    };
  }
  
  // Conservative fallback - mark as highly ambiguous
  flags.push({
    flag_type: 'format_ambiguous',
    description: 'Unable to determine format with confidence',
    impact: 'high'
  });
  
  return {
    selected_format: 'DD/MM/YYYY', // Default fallback
    selected_iso_date: `${year}-${second.padStart(2, '0')}-${first.padStart(2, '0')}`,
    confidence: 0.4,
    reasoning: 'Conservative fallback to DD/MM/YYYY',
    flags: flags
  };
}
```

## User Preference Management

### User Profile Schema

```sql
-- Enhanced user profile with date preferences
ALTER TABLE user_profiles ADD COLUMN
  date_preferences JSONB DEFAULT '{
    "preferred_format": "DD/MM/YYYY",
    "home_country": "AU", 
    "timezone": "Australia/Sydney",
    "show_confidence_badges": true,
    "format_switching_enabled": true,
    "confidence_threshold_for_badges": 0.7
  }'::jsonb;

-- Index for efficient preference lookups
CREATE INDEX idx_user_date_preferences 
  ON user_profiles USING GIN (date_preferences);
```

### User Preference Types

```typescript
interface UserDatePreferences {
  // Core display preferences
  preferred_format: GlobalDateFormat;
  home_country: string;           // ISO 3166-1 alpha-2 code
  timezone: string;              // IANA timezone identifier
  
  // Confidence display settings
  show_confidence_badges: boolean;
  confidence_threshold_for_badges: number; // 0.0 to 1.0
  badge_style: 'icon' | 'text' | 'color' | 'none';
  
  // Advanced features
  format_switching_enabled: boolean;  // Travel mode
  auto_detect_location: boolean;      // Use browser/device location
  show_alternative_interpretations: boolean; // For ambiguous dates
  
  // Accessibility
  date_verbosity: 'minimal' | 'standard' | 'verbose';
  screen_reader_optimized: boolean;
}

// Global format definitions
type GlobalDateFormat = 
  | 'DD/MM/YYYY'    // Australian, British, European
  | 'MM/DD/YYYY'    // American, Canadian
  | 'YYYY-MM-DD'    // ISO 8601 International
  | 'DD.MM.YYYY'    // German, Swiss, Nordic
  | 'DD-MM-YYYY'    // Alternative European
  | 'YYYY年MM月DD日'  // Chinese, Japanese
  | 'DD/MM/YY'      // Short format variants
  | 'MM/DD/YY'      // Short American
  | 'MMMM DD, YYYY' // Verbose American (January 15, 2024)
  | 'DD MMMM YYYY'  // Verbose British (15 January 2024)
  // Additional 15+ formats for global coverage
```

### Dynamic Format Management

```typescript
class UserDatePreferenceManager {
  
  async getUserPreferences(userId: string): Promise<UserDatePreferences> {
    const profile = await db.query(`
      SELECT date_preferences 
      FROM user_profiles 
      WHERE id = $1
    `, [userId]);
    
    return profile.rows[0]?.date_preferences || getDefaultPreferences();
  }
  
  async updateUserPreferences(
    userId: string, 
    preferences: Partial<UserDatePreferences>
  ): Promise<void> {
    await db.query(`
      UPDATE user_profiles 
      SET date_preferences = date_preferences || $2::jsonb
      WHERE id = $1
    `, [userId, JSON.stringify(preferences)]);
  }
  
  // Travel mode - temporary format switching
  async enableTravelMode(
    userId: string,
    temporaryCountry: string,
    duration: number // days
  ): Promise<void> {
    const temporaryFormat = getDefaultFormatForCountry(temporaryCountry);
    
    await this.updateUserPreferences(userId, {
      preferred_format: temporaryFormat,
      format_switching_enabled: true,
      travel_mode: {
        enabled: true,
        temporary_country: temporaryCountry,
        expires_at: new Date(Date.now() + duration * 24 * 60 * 60 * 1000)
      }
    });
  }
}
```

## Dashboard Display Engine

### Real-Time Format Conversion

```typescript
interface DateDisplayResult {
  formatted_date: string;
  confidence_badge?: ConfidenceBadge;
  tooltip_info?: string;
  accessibility_label?: string;
  alternative_formats?: string[];
}

interface ConfidenceBadge {
  level: 'high' | 'medium' | 'low' | 'uncertain';
  icon: string;
  color: string;
  tooltip: string;
  show: boolean;
}

class DashboardDateDisplay {
  
  async formatDateForUser(
    isoDate: string,
    confidence: number,
    ambiguityFlags: AmbiguityFlag[],
    userPreferences: UserDatePreferences
  ): Promise<DateDisplayResult> {
    
    // Convert ISO to user's preferred format
    const formattedDate = await this.convertToUserFormat(isoDate, userPreferences);
    
    // Generate confidence badge if needed
    const badge = await this.generateConfidenceBadge(
      confidence,
      ambiguityFlags,
      userPreferences
    );
    
    // Create accessibility label
    const accessibilityLabel = await this.generateAccessibilityLabel(
      formattedDate,
      confidence,
      userPreferences
    );
    
    return {
      formatted_date: formattedDate,
      confidence_badge: badge,
      accessibility_label: accessibilityLabel,
      alternative_formats: userPreferences.show_alternative_interpretations 
        ? await this.generateAlternativeFormats(isoDate) 
        : undefined
    };
  }
  
  private async convertToUserFormat(
    isoDate: string,
    preferences: UserDatePreferences
  ): Promise<string> {
    
    const date = new Date(isoDate);
    
    switch (preferences.preferred_format) {
      case 'DD/MM/YYYY':
        return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
      
      case 'MM/DD/YYYY':
        return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()}`;
      
      case 'YYYY-MM-DD':
        return isoDate; // Already in ISO format
      
      case 'DD.MM.YYYY':
        return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
      
      case 'MMMM DD, YYYY':
        return date.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
      
      case 'DD MMMM YYYY':
        return date.toLocaleDateString('en-GB', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
      
      default:
        return formattedDate; // Fallback
    }
  }
  
  private async generateConfidenceBadge(
    confidence: number,
    flags: AmbiguityFlag[],
    preferences: UserDatePreferences
  ): Promise<ConfidenceBadge | undefined> {
    
    if (!preferences.show_confidence_badges || 
        confidence >= preferences.confidence_threshold_for_badges) {
      return undefined;
    }
    
    const level = this.determineConfidenceLevel(confidence, flags);
    const badgeConfig = this.getBadgeConfig(level, preferences.badge_style);
    
    return {
      level: level,
      icon: badgeConfig.icon,
      color: badgeConfig.color,
      tooltip: this.generateBadgeTooltip(confidence, flags),
      show: true
    };
  }
}
```

### Confidence Badge System

```typescript
interface BadgeConfiguration {
  high: { icon: string; color: string; message: string; };
  medium: { icon: string; color: string; message: string; };
  low: { icon: string; color: string; message: string; };
  uncertain: { icon: string; color: string; message: string; };
}

const CONFIDENCE_BADGE_CONFIG: BadgeConfiguration = {
  high: {
    icon: '✓',
    color: '#22c55e', // Green
    message: 'Date format detected with high confidence'
  },
  medium: {
    icon: '⚠',
    color: '#f59e0b', // Amber
    message: 'Date format detected with moderate confidence'
  },
  low: {
    icon: '?',
    color: '#ef4444', // Red
    message: 'Date format uncertain - may need verification'
  },
  uncertain: {
    icon: '!',
    color: '#8b5cf6', // Purple
    message: 'Multiple date interpretations possible - click to review'
  }
};
```

## Performance Optimization

### Caching Strategy

```typescript
class UniversalDateCache {
  private formatCache = new Map<string, UniversalDateNormalization>();
  private preferenceCache = new Map<string, UserDatePreferences>();
  private readonly TTL = 60 * 60 * 1000; // 1 hour
  
  async getCachedNormalization(
    rawDate: string,
    documentOrigin: string
  ): Promise<UniversalDateNormalization | null> {
    
    const cacheKey = `${rawDate}:${documentOrigin}`;
    const cached = this.formatCache.get(cacheKey);
    
    if (cached && this.isValidCache(cached.timestamp)) {
      return cached;
    }
    
    return null;
  }
  
  async cacheNormalization(
    rawDate: string,
    documentOrigin: string,
    result: UniversalDateNormalization
  ): Promise<void> {
    
    const cacheKey = `${rawDate}:${documentOrigin}`;
    this.formatCache.set(cacheKey, {
      ...result,
      timestamp: Date.now()
    });
  }
}
```

### Database Optimization

```sql
-- Indexes for efficient date preference and format lookups
CREATE INDEX idx_user_date_preferences_format 
  ON user_profiles ((date_preferences->>'preferred_format'));

CREATE INDEX idx_user_date_preferences_country 
  ON user_profiles ((date_preferences->>'home_country'));

-- Materialized view for common format conversions
CREATE MATERIALIZED VIEW common_date_formats AS
SELECT 
  iso_date,
  to_char(iso_date::date, 'DD/MM/YYYY') as dd_mm_yyyy,
  to_char(iso_date::date, 'MM/DD/YYYY') as mm_dd_yyyy,
  to_char(iso_date::date, 'YYYY-MM-DD') as iso_format,
  to_char(iso_date::date, 'DD.MM.YYYY') as dd_dot_mm_yyyy
FROM generate_series('2000-01-01'::date, '2050-12-31'::date, '1 day') as iso_date;

CREATE UNIQUE INDEX idx_common_formats_iso ON common_date_formats (iso_date);
```

## Integration with AI Processing

### Pass 2 Enhancement Requirements

```typescript
interface EnhancedPass2DateExtraction {
  // Standard extraction
  clinical_events: ClinicalEvent[];
  
  // NEW: Universal date processing
  universal_date_analysis: {
    document_origin_detection: DocumentOriginAnalysis;
    total_dates_found: number;
    ambiguous_dates_count: number;
    normalized_dates: UniversalDateNormalization[];
    requires_user_verification: boolean;
    format_confidence_summary: FormatConfidenceSummary;
  };
}

interface FormatConfidenceSummary {
  overall_confidence: number;
  high_confidence_dates: number;
  medium_confidence_dates: number;
  low_confidence_dates: number;
  uncertain_dates: number;
  recommended_user_action: 'none' | 'review_flagged' | 'verify_all';
}
```

### AI Model Training Enhancement

```typescript
// Enhanced training data structure for AI models
interface DateExtractionTrainingData {
  document_samples: {
    content: string;
    known_origin: string;
    ground_truth_dates: {
      raw_text: string;
      correct_iso: string;
      correct_format: string;
      confidence_expected: number;
    }[];
  }[];
  
  // Multi-country examples
  format_examples: {
    [country: string]: {
      healthcare_indicators: string[];
      common_date_patterns: string[];
      ambiguous_cases: TrainingAmbiguousCase[];
    };
  };
}

interface TrainingAmbiguousCase {
  raw_date: string;
  context: string;
  correct_interpretation: string;
  incorrect_interpretation: string;
  disambiguation_clues: string[];
}
```

## Quality Assurance & Validation

### Comprehensive Testing Framework

```typescript
interface UniversalDateTestSuite {
  format_detection_tests: FormatDetectionTest[];
  ambiguity_resolution_tests: AmbiguityTest[];
  user_preference_tests: PreferenceTest[];
  cross_cultural_tests: CrossCulturalTest[];
}

interface FormatDetectionTest {
  input_date: string;
  document_context: string;
  expected_format: string;
  expected_iso: string;
  expected_confidence_range: [number, number];
}

interface AmbiguityTest {
  ambiguous_date: string;
  context_clues: string[];
  expected_primary_interpretation: string;
  expected_alternatives: string[];
  expected_confidence: number;
}

async function runUniversalDateValidation(): Promise<ValidationReport> {
  const testSuite = await loadComprehensiveTestSuite();
  
  const results = await Promise.all([
    validateFormatDetectionAccuracy(testSuite.format_detection_tests),
    validateAmbiguityResolution(testSuite.ambiguity_resolution_tests),
    validateUserPreferenceDisplay(testSuite.user_preference_tests),
    validateCrossCulturalHandling(testSuite.cross_cultural_tests)
  ]);
  
  return generateValidationReport(results);
}
```

## Success Criteria

### Technical Performance
- **Sub-50ms date normalization** for 95% of date strings
- **95%+ format detection accuracy** across 20+ global formats
- **99.5% user preference application** success rate
- **Complete confidence propagation** from extraction to display

### Clinical Safety
- **Zero critical date misinterpretation** in medication start/stop dates
- **100% ambiguity flagging** for dates with <70% confidence
- **Complete audit trail** for all format detection decisions
- **Graceful degradation** to conservative interpretations

### User Experience
- **Seamless format switching** for travel/migration scenarios
- **Intuitive confidence indicators** without overwhelming users
- **Accessibility compliance** for screen readers and assistive technology
- **Cultural sensitivity** in date format presentation

### International Scalability
- **Support for 25+ countries** at launch with extensible framework
- **Localization ready** for additional healthcare systems
- **Performance maintained** with global user base
- **Regulatory compliance** with international healthcare data standards

## Future Enhancements

### Planned Extensions
1. **Machine Learning Integration**: Learn from user corrections to improve format detection
2. **Natural Language Date Processing**: Handle "last Tuesday", "three weeks ago" etc.
3. **Historical Date Context**: Different format expectations for older documents
4. **Multi-Language Support**: Date format detection in native healthcare languages
5. **Smart Migration Assistance**: Automatic format updates when users move countries

This Universal Date Format Management System provides the foundation for reliable, culturally-aware date processing in Exora's global healthcare platform while maintaining the highest standards of clinical safety and user experience.