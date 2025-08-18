# Phase 1: Intake Screening Implementation

**Duration:** Week 1 (5 business days)  
**Focus:** Intelligent upfront validation before expensive AI processing  
**Status:** Ready for implementation  

---

## **Phase 1 Objectives**

### **Primary Goals**
1. **Identity Verification**: Ensure documents belong to correct user/profile
2. **Content Classification**: Filter health vs non-health content early
3. **Security Screening**: Malware detection and quarantine
4. **Cost Protection**: Block expensive processing for invalid content

### **Success Criteria**
- *>95% health documents correctly identified and accepted
- *>98% identity matching accuracy for clear cases
- <500ms average screening latency
- <$0.05 average cost per screening decision
- 100% malware detection for known threats

---

## **Day-by-Day Implementation Plan**

### **Day 1: Database Schema & Infrastructure**

**Morning (4 hours): Database Setup**
```sql
-- Core intake screening table
CREATE TABLE intake_screening (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id),
  account_id UUID REFERENCES auth.users(id),
  
  -- Decision outcome
  decision intake_decision_enum NOT NULL,
  decision_reasons JSONB NOT NULL,
  confidence_score DECIMAL(3,2),
  
  -- Identity extraction
  extracted_identities JSONB,
  matched_profile_id UUID REFERENCES user_profiles(id),
  
  -- Processing metadata  
  model_provider TEXT,
  model_version TEXT,
  used_ocr_context BOOLEAN DEFAULT false,
  cost_cents INTEGER,
  processing_time_ms INTEGER,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Decision types enum
CREATE TYPE intake_decision_enum AS ENUM (
  'accept',              -- Document accepted for processing
  'needs_selection',     -- Multiple profiles matched, user must choose
  'reject_non_health',   -- Not health-related content
  'quarantine_malware',  -- Security threat detected
  'needs_manual_verify', -- Identity unclear, needs user attestation
  'rejected_user_deny'   -- User confirmed it's not theirs
);

-- Profile match candidates for disambiguation
CREATE TABLE profile_match_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id),
  profile_id UUID REFERENCES user_profiles(id),
  
  match_score DECIMAL(3,2) NOT NULL,
  match_reasons JSONB NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rejection tracking and appeals
CREATE TABLE intake_rejections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id),
  account_id UUID REFERENCES auth.users(id),
  
  reason_code TEXT NOT NULL,
  explanation TEXT NOT NULL,
  user_notified_at TIMESTAMP WITH TIME ZONE,
  
  -- Appeal process
  appeal_token UUID,
  appeal_submitted_at TIMESTAMP WITH TIME ZONE,
  appeal_resolution TEXT,
  
  -- Retention policy
  retention_until TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS policies for all tables
ALTER TABLE intake_screening ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_match_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_rejections ENABLE ROW LEVEL SECURITY;

-- Only account owners can see their intake records
CREATE POLICY "Users can view own intake screening" ON intake_screening
  FOR SELECT USING (account_id = auth.uid());

CREATE POLICY "Users can view own profile matches" ON profile_match_candidates
  FOR SELECT USING (
    document_id IN (
      SELECT documents.id FROM documents 
      WHERE documents.patient_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own rejections" ON intake_rejections
  FOR SELECT USING (account_id = auth.uid());
```

**Afternoon (4 hours): Configuration System**
```sql
-- Global intake configuration
CREATE TABLE intake_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Enable/disable features
  enable_intake_screening BOOLEAN DEFAULT true,
  enable_malware_scanning BOOLEAN DEFAULT true,
  enable_health_classification BOOLEAN DEFAULT true,
  enable_profile_matching BOOLEAN DEFAULT true,
  enable_ai_ocr_context BOOLEAN DEFAULT false,
  
  -- Cost controls
  max_screening_cost_cents INTEGER DEFAULT 5,
  daily_screening_budget_cents INTEGER DEFAULT 1000,
  
  -- Confidence thresholds
  auto_accept_threshold DECIMAL(3,2) DEFAULT 0.90,
  profile_selection_threshold DECIMAL(3,2) DEFAULT 0.60,
  reject_threshold DECIMAL(3,2) DEFAULT 0.90,
  
  -- Retention policies
  quarantine_retention_days INTEGER DEFAULT 7,
  rejection_retention_days INTEGER DEFAULT 30,
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Per-user intake preferences
CREATE TABLE user_intake_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  
  -- Custom thresholds
  auto_accept_threshold DECIMAL(3,2),
  manual_verify_threshold DECIMAL(3,2),
  
  -- Notification preferences
  notify_on_rejection BOOLEAN DEFAULT true,
  notify_on_quarantine BOOLEAN DEFAULT true,
  
  -- Profile hints for faster matching
  default_child_profiles UUID[],
  common_names TEXT[],  -- Nickname/alias tracking
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default global config
INSERT INTO intake_config DEFAULT VALUES;
```

### **Day 2: Malware Scanning & Basic Content Classification**

**Morning (4 hours): Malware Scanner Integration**
```typescript
// supabase/functions/intake-screening/malware-scanner.ts
import { createClient } from '@supabase/supabase-js';

interface MalwareScanResult {
  isClean: boolean;
  threats?: string[];
  scanProvider: string;
  scanTime: number;
}

export class MalwareScanner {
  private supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  async scanFile(filePath: string): Promise<MalwareScanResult> {
    const startTime = Date.now();
    
    try {
      // Step 1: File type validation
      const fileValidation = await this.validateFileType(filePath);
      if (!fileValidation.isValid) {
        return {
          isClean: false,
          threats: [`Invalid file type: ${fileValidation.reason}`],
          scanProvider: 'file-validation',
          scanTime: Date.now() - startTime
        };
      }

      // Step 2: File size and entropy checks
      const { data: fileBuffer } = await this.supabase.storage
        .from('medical-docs')
        .download(filePath);
      
      if (!fileBuffer) {
        throw new Error('Failed to download file for scanning');
      }

      const entropyCheck = this.checkEntropy(fileBuffer);
      if (entropyCheck.suspicious) {
        return {
          isClean: false,
          threats: ['High entropy suggesting encryption/obfuscation'],
          scanProvider: 'entropy-analysis',
          scanTime: Date.now() - startTime
        };
      }

      // Step 3: Basic signature detection
      const signatureCheck = this.checkKnownSignatures(fileBuffer);
      if (!signatureCheck.isClean) {
        return {
          isClean: false,
          threats: signatureCheck.threats,
          scanProvider: 'signature-detection',
          scanTime: Date.now() - startTime
        };
      }

      // All checks passed
      return {
        isClean: true,
        scanProvider: 'guardian-scanner',
        scanTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('Malware scan failed:', error);
      
      // Fail secure: quarantine on scan failure
      return {
        isClean: false,
        threats: [`Scan failure: ${error.message}`],
        scanProvider: 'error-handler',
        scanTime: Date.now() - startTime
      };
    }
  }

  private validateFileType(filePath: string): { isValid: boolean; reason?: string } {
    const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.heic'];
    const extension = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
    
    if (!allowedExtensions.includes(extension)) {
      return { isValid: false, reason: `Extension ${extension} not allowed` };
    }

    return { isValid: true };
  }

  private checkEntropy(buffer: ArrayBuffer): { suspicious: boolean; entropy?: number } {
    // Basic entropy calculation to detect encrypted/packed files
    const bytes = new Uint8Array(buffer);
    const frequency = new Array(256).fill(0);
    
    for (const byte of bytes) {
      frequency[byte]++;
    }
    
    let entropy = 0;
    const length = bytes.length;
    
    for (const freq of frequency) {
      if (freq > 0) {
        const probability = freq / length;
        entropy -= probability * Math.log2(probability);
      }
    }
    
    // High entropy threshold (normal PDFs/images should be lower)
    const suspicious = entropy > 7.5;
    
    return { suspicious, entropy };
  }

  private checkKnownSignatures(buffer: ArrayBuffer): { isClean: boolean; threats?: string[] } {
    const bytes = new Uint8Array(buffer);
    const header = Array.from(bytes.slice(0, 32))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Known malicious signatures (simplified for demo)
    const maliciousSignatures = [
      '4d5a',        // PE executable
      '7f454c46',    // ELF executable  
      'd0cf11e0',    // OLE/COM compound document (risky)
    ];

    for (const signature of maliciousSignatures) {
      if (header.startsWith(signature)) {
        return {
          isClean: false,
          threats: [`Detected executable content: ${signature}`]
        };
      }
    }

    return { isClean: true };
  }
}
```

**Afternoon (4 hours): Health Content Classifier**
```typescript
// supabase/functions/intake-screening/content-classifier.ts
interface ContentClassificationResult {
  isHealthRelated: boolean;
  confidence: number;
  categories: string[];
  reasoning: string[];
  classificationMethod: 'heuristic' | 'ai-vision' | 'ai-text';
}

export class ContentClassifier {
  async classifyDocument(
    filePath: string,
    quickOcrText?: string
  ): Promise<ContentClassificationResult> {
    
    // Step 1: Heuristic classification (fastest, cheapest)
    const heuristicResult = await this.heuristicClassification(filePath, quickOcrText);
    
    if (heuristicResult.confidence > 0.8) {
      return heuristicResult;
    }

    // Step 2: AI vision classification for uncertain cases
    const visionResult = await this.aiVisionClassification(filePath);
    
    return visionResult;
  }

  private async heuristicClassification(
    filePath: string,
    ocrText?: string
  ): Promise<ContentClassificationResult> {
    
    const healthKeywords = [
      'prescription', 'medication', 'doctor', 'hospital', 'clinic',
      'diagnosis', 'treatment', 'patient', 'medical', 'health',
      'lab result', 'blood test', 'x-ray', 'mri', 'scan',
      'allergy', 'dosage', 'pharmacy', 'physician', 'nurse',
      'medicare', 'insurance', 'copay', 'healthcare'
    ];

    const nonHealthKeywords = [
      'invoice', 'payment', 'bank', 'credit', 'loan', 'mortgage',
      'tax', 'salary', 'employment', 'contract', 'legal',
      'utility', 'electric', 'gas', 'water', 'internet',
      'shopping', 'receipt', 'purchase', 'warranty'
    ];

    let healthScore = 0;
    let nonHealthScore = 0;
    const foundKeywords: string[] = [];

    const textToAnalyze = (ocrText || '').toLowerCase();

    // Score based on keyword presence
    for (const keyword of healthKeywords) {
      if (textToAnalyze.includes(keyword)) {
        healthScore += 2;
        foundKeywords.push(`health:${keyword}`);
      }
    }

    for (const keyword of nonHealthKeywords) {
      if (textToAnalyze.includes(keyword)) {
        nonHealthScore += 1;
        foundKeywords.push(`non-health:${keyword}`);
      }
    }

    // File name analysis
    const fileName = filePath.toLowerCase();
    if (fileName.includes('medical') || fileName.includes('prescription')) {
      healthScore += 3;
      foundKeywords.push('filename:medical');
    }

    const totalScore = healthScore + nonHealthScore;
    const confidence = totalScore > 0 ? Math.min(0.9, totalScore / 10) : 0.1;
    const isHealthRelated = healthScore > nonHealthScore;

    return {
      isHealthRelated,
      confidence,
      categories: isHealthRelated ? ['medical-document'] : ['non-medical'],
      reasoning: foundKeywords,
      classificationMethod: 'heuristic'
    };
  }

  private async aiVisionClassification(filePath: string): Promise<ContentClassificationResult> {
    // Simplified AI vision call for content classification
    // In production, would use actual OpenAI Vision API
    
    const prompt = `
      Analyze this document image and determine if it contains healthcare-related content.
      
      HEALTHCARE CONTENT includes:
      - Medical records, prescriptions, lab results
      - Hospital discharge summaries, doctor notes
      - Insurance claims, medical bills, EOBs
      - Medical device readings, test results
      - Vaccination records, health certificates
      
      NON-HEALTHCARE CONTENT includes:
      - Financial documents, bank statements
      - Utility bills, receipts, invoices
      - Legal documents, contracts
      - Personal correspondence, emails
      - Entertainment, social media content
      
      Respond with JSON: {
        "isHealthRelated": boolean,
        "confidence": number (0-1),
        "categories": ["category1", "category2"],
        "reasoning": ["reason1", "reason2"]
      }
    `;

    try {
      // Mock AI response for now - replace with actual OpenAI Vision call
      const mockResponse = {
        isHealthRelated: true,
        confidence: 0.85,
        categories: ['prescription', 'medication-list'],
        reasoning: ['Contains medication names', 'Medical formatting detected']
      };

      return {
        ...mockResponse,
        classificationMethod: 'ai-vision'
      };

    } catch (error) {
      console.error('AI vision classification failed:', error);
      
      // Fallback to uncertain classification
      return {
        isHealthRelated: true,  // Err on the side of inclusion
        confidence: 0.5,
        categories: ['uncertain'],
        reasoning: [`AI classification failed: ${error.message}`],
        classificationMethod: 'ai-vision'
      };
    }
  }
}
```

### **Day 3: Identity Extraction & Profile Matching**

**Morning (4 hours): Identity Extraction**
```typescript
// supabase/functions/intake-screening/identity-extractor.ts
interface ExtractedIdentity {
  names: string[];
  dateOfBirth?: string;
  addresses?: string[];
  identifiers?: {
    medicare?: string;
    patientId?: string;
    memberNumber?: string;
    phoneNumber?: string;
  };
  confidence: number;
  extractionMethod: 'ocr' | 'vision' | 'metadata';
  rawText?: string;
}

export class IdentityExtractor {
  async extractIdentity(filePath: string): Promise<ExtractedIdentity> {
    try {
      // Step 1: Quick OCR extraction from first page/header
      const ocrText = await this.quickOcrExtraction(filePath);
      
      // Step 2: Pattern-based extraction from OCR text
      const ocrIdentity = await this.extractFromOcrText(ocrText);
      
      if (ocrIdentity.confidence > 0.7) {
        return ocrIdentity;
      }

      // Step 3: AI vision extraction for unclear cases
      const visionIdentity = await this.extractFromVision(filePath);
      
      return visionIdentity;

    } catch (error) {
      console.error('Identity extraction failed:', error);
      
      return {
        names: [],
        confidence: 0,
        extractionMethod: 'ocr',
        rawText: `Extraction failed: ${error.message}`
      };
    }
  }

  private async quickOcrExtraction(filePath: string): Promise<string> {
    // Use Google Cloud Vision for cheap, fast OCR of first page only
    // This is a simplified mock - replace with actual Google Vision API
    
    try {
      // Mock OCR response
      const mockOcrText = `
        Patient: John Smith
        DOB: 01/15/1980
        Address: 123 Main St, Sydney NSW 2000
        Medicare: 1234567890
        Date: August 15, 2025
        
        Prescription for blood pressure medication...
      `;
      
      return mockOcrText;

    } catch (error) {
      console.error('Quick OCR failed:', error);
      return '';
    }
  }

  private async extractFromOcrText(ocrText: string): Promise<ExtractedIdentity> {
    const names: string[] = [];
    const identifiers: any = {};
    let dateOfBirth: string | undefined;
    const addresses: string[] = [];

    // Name extraction patterns
    const namePatterns = [
      /Patient:\s*([A-Za-z\s]+)/i,
      /Name:\s*([A-Za-z\s]+)/i,
      /^([A-Z][a-z]+\s+[A-Z][a-z]+)/m,
    ];

    for (const pattern of namePatterns) {
      const match = ocrText.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        if (name.length > 2 && !names.includes(name)) {
          names.push(name);
        }
      }
    }

    // Date of birth patterns
    const dobPatterns = [
      /DOB:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /Birth\s*Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /Date\s*of\s*Birth:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    ];

    for (const pattern of dobPatterns) {
      const match = ocrText.match(pattern);
      if (match && match[1]) {
        dateOfBirth = match[1];
        break;
      }
    }

    // Medicare number extraction
    const medicareMatch = ocrText.match(/Medicare[:\s]*(\d{10})/i);
    if (medicareMatch) {
      identifiers.medicare = medicareMatch[1];
    }

    // Patient ID extraction
    const patientIdMatch = ocrText.match(/Patient\s*ID[:\s]*([A-Z0-9]+)/i);
    if (patientIdMatch) {
      identifiers.patientId = patientIdMatch[1];
    }

    // Address extraction (simplified)
    const addressMatch = ocrText.match(/Address[:\s]*([^\n]+)/i);
    if (addressMatch) {
      addresses.push(addressMatch[1].trim());
    }

    // Calculate confidence based on extracted information
    let confidence = 0;
    if (names.length > 0) confidence += 0.4;
    if (dateOfBirth) confidence += 0.3;
    if (Object.keys(identifiers).length > 0) confidence += 0.2;
    if (addresses.length > 0) confidence += 0.1;

    return {
      names,
      dateOfBirth,
      addresses: addresses.length > 0 ? addresses : undefined,
      identifiers: Object.keys(identifiers).length > 0 ? identifiers : undefined,
      confidence: Math.min(confidence, 0.95),
      extractionMethod: 'ocr',
      rawText: ocrText.substring(0, 500) // First 500 chars for debugging
    };
  }

  private async extractFromVision(filePath: string): Promise<ExtractedIdentity> {
    // AI vision extraction for cases where OCR fails
    // Mock implementation - replace with actual AI vision call
    
    return {
      names: ['John Smith'],
      dateOfBirth: '01/15/1980',
      identifiers: { medicare: '1234567890' },
      confidence: 0.8,
      extractionMethod: 'vision'
    };
  }
}
```

**Afternoon (4 hours): Profile Matching Algorithm**
```typescript
// supabase/functions/intake-screening/profile-matcher.ts
interface ProfileMatchResult {
  decision: 'accept' | 'needs_selection' | 'needs_manual_verify' | 'reject';
  matchedProfileId?: string;
  candidateProfiles?: Array<{
    profileId: string;
    score: number;
    reasons: string[];
  }>;
  confidence: number;
  reasoning: string[];
}

export class ProfileMatcher {
  private supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  async matchProfiles(
    accountId: string,
    extractedIdentity: ExtractedIdentity
  ): Promise<ProfileMatchResult> {
    
    // Get all profiles for this account (user + children)
    const { data: profiles, error } = await this.supabase
      .from('user_profiles')
      .select('id, profile_type, personal_info')
      .eq('account_id', accountId);

    if (error || !profiles) {
      return {
        decision: 'needs_manual_verify',
        confidence: 0,
        reasoning: ['Failed to load user profiles']
      };
    }

    // Score each profile against extracted identity
    const profileScores = await Promise.all(
      profiles.map(profile => this.scoreProfile(profile, extractedIdentity))
    );

    // Sort by score descending
    profileScores.sort((a, b) => b.score - a.score);

    return this.makeMatchingDecision(profileScores, extractedIdentity);
  }

  private async scoreProfile(
    profile: any,
    identity: ExtractedIdentity
  ): Promise<{ profileId: string; score: number; reasons: string[] }> {
    
    const reasons: string[] = [];
    let score = 0;

    const personalInfo = profile.personal_info || {};
    const profileName = `${personalInfo.first_name || ''} ${personalInfo.last_name || ''}`.trim();

    // Name matching (most important)
    if (identity.names.length > 0 && profileName) {
      const nameScore = this.calculateNameSimilarity(identity.names, profileName);
      score += nameScore * 0.5; // 50% weight for names
      
      if (nameScore > 0.8) {
        reasons.push(`Strong name match: ${nameScore.toFixed(2)}`);
      } else if (nameScore > 0.5) {
        reasons.push(`Partial name match: ${nameScore.toFixed(2)}`);
      }
    }

    // Date of birth matching (very strong signal)
    if (identity.dateOfBirth && personalInfo.date_of_birth) {
      if (this.normalizeDob(identity.dateOfBirth) === this.normalizeDob(personalInfo.date_of_birth)) {
        score += 0.4; // 40% weight for exact DOB match
        reasons.push('Exact date of birth match');
      }
    }

    // Medicare number matching (strong identifier)
    if (identity.identifiers?.medicare && personalInfo.medicare_number) {
      if (identity.identifiers.medicare === personalInfo.medicare_number) {
        score += 0.3; // 30% weight for Medicare match
        reasons.push('Medicare number match');
      }
    }

    // Address matching (weaker signal, people move)
    if (identity.addresses && personalInfo.address) {
      const addressScore = this.calculateAddressSimilarity(
        identity.addresses,
        personalInfo.address
      );
      score += addressScore * 0.1; // 10% weight for address
      
      if (addressScore > 0.5) {
        reasons.push(`Address similarity: ${addressScore.toFixed(2)}`);
      }
    }

    return {
      profileId: profile.id,
      score: Math.min(score, 1.0),
      reasons
    };
  }

  private calculateNameSimilarity(extractedNames: string[], profileName: string): number {
    if (!profileName || extractedNames.length === 0) return 0;

    let bestScore = 0;

    for (const extractedName of extractedNames) {
      const score = this.stringSimilarity(
        extractedName.toLowerCase().trim(),
        profileName.toLowerCase().trim()
      );
      bestScore = Math.max(bestScore, score);
    }

    return bestScore;
  }

  private stringSimilarity(str1: string, str2: string): number {
    // Simple Levenshtein distance-based similarity
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
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
          matrix[j - 1][i - 1] + indicator  // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private normalizeDob(dob: string): string {
    // Normalize date formats for comparison
    return dob.replace(/[\/\-\.]/g, '').replace(/\s/g, '');
  }

  private calculateAddressSimilarity(extractedAddresses: string[], profileAddress: string): number {
    // Simplified address matching - in production would use geocoding
    let bestScore = 0;

    for (const address of extractedAddresses) {
      const score = this.stringSimilarity(
        address.toLowerCase().replace(/[^\w\s]/g, ''),
        profileAddress.toLowerCase().replace(/[^\w\s]/g, '')
      );
      bestScore = Math.max(bestScore, score);
    }

    return bestScore;
  }

  private makeMatchingDecision(
    profileScores: Array<{ profileId: string; score: number; reasons: string[] }>,
    identity: ExtractedIdentity
  ): ProfileMatchResult {
    
    if (profileScores.length === 0) {
      return {
        decision: 'needs_manual_verify',
        confidence: 0,
        reasoning: ['No profiles found for account']
      };
    }

    const topScore = profileScores[0];
    const secondScore = profileScores[1]?.score || 0;

    // High confidence match
    if (topScore.score >= 0.9) {
      return {
        decision: 'accept',
        matchedProfileId: topScore.profileId,
        confidence: topScore.score,
        reasoning: [`High confidence match: ${topScore.score.toFixed(2)}`, ...topScore.reasons]
      };
    }

    // Ambiguous between multiple profiles
    if (secondScore > 0.6 && (topScore.score - secondScore) < 0.2) {
      return {
        decision: 'needs_selection',
        candidateProfiles: profileScores.filter(p => p.score > 0.5).slice(0, 3),
        confidence: 0.7,
        reasoning: ['Multiple possible profile matches', `Top scores: ${topScore.score.toFixed(2)}, ${secondScore.toFixed(2)}`]
      };
    }

    // Moderate confidence single match
    if (topScore.score >= 0.6) {
      return {
        decision: 'accept',
        matchedProfileId: topScore.profileId,
        confidence: topScore.score,
        reasoning: [`Moderate confidence match: ${topScore.score.toFixed(2)}`, ...topScore.reasons]
      };
    }

    // Low confidence or no identity information
    if (identity.names.length === 0 && !identity.dateOfBirth) {
      return {
        decision: 'needs_manual_verify',
        confidence: 0.3,
        reasoning: ['No clear identity information found in document']
      };
    }

    // Default to manual verification
    return {
      decision: 'needs_manual_verify',
      confidence: topScore.score,
      reasoning: [`Low confidence match: ${topScore.score.toFixed(2)}`, 'Manual verification required']
    };
  }
}
```

### **Day 4: Main Intake Controller & Edge Function**

**Morning (4 hours): Intake Controller Integration**
```typescript
// supabase/functions/intake-screening/index.ts
import { createClient } from '@supabase/supabase-js';
import { getCorsHeaders } from '../_shared/cors.ts';
import { MalwareScanner } from './malware-scanner.ts';
import { ContentClassifier } from './content-classifier.ts';
import { IdentityExtractor } from './identity-extractor.ts';
import { ProfileMatcher } from './profile-matcher.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

interface IntakeScreeningRequest {
  documentId: string;
  filePath: string;
  accountId: string;
}

interface IntakeScreeningResponse {
  success: boolean;
  decision: string;
  message: string;
  data?: {
    screeningId: string;
    matchedProfileId?: string;
    candidateProfiles?: Array<{
      profileId: string;
      score: number;
      reasons: string[];
    }>;
    appealToken?: string;
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  
  if (req.method === 'OPTIONS') {
    const requestHeaders = req.headers.get('access-control-request-headers');
    const corsHeaders = getCorsHeaders(origin, true, requestHeaders);
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { documentId, filePath, accountId }: IntakeScreeningRequest = await req.json();

    if (!documentId || !filePath || !accountId) {
      return new Response(JSON.stringify({
        success: false,
        decision: 'error',
        message: 'Missing required parameters'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    console.log(`Starting intake screening for document: ${documentId}`);

    // Step 1: Load configuration
    const config = await loadIntakeConfig();
    
    // Step 2: Initialize screening record
    const screeningId = await initializeScreeningRecord(documentId, accountId);

    const startTime = Date.now();
    let totalCost = 0;

    try {
      // Step 3: Malware scanning
      if (config.enable_malware_scanning) {
        console.log('Running malware scan...');
        const scanner = new MalwareScanner();
        const malwareResult = await scanner.scanFile(filePath);
        
        if (!malwareResult.isClean) {
          await finalizeScreeningRecord(screeningId, {
            decision: 'quarantine_malware',
            decision_reasons: { malware: malwareResult },
            confidence_score: 1.0,
            cost_cents: 0,
            processing_time_ms: Date.now() - startTime
          });

          await quarantineDocument(documentId, malwareResult.threats);
          
          return createResponse({
            success: true,
            decision: 'quarantine_malware',
            message: 'Document quarantined due to security threats'
          }, corsHeaders);
        }
      }

      // Step 4: Content classification
      if (config.enable_health_classification) {
        console.log('Running content classification...');
        const classifier = new ContentClassifier();
        const contentResult = await classifier.classifyDocument(filePath);
        totalCost += 1; // Estimated cost in cents

        if (!contentResult.isHealthRelated && contentResult.confidence > config.reject_threshold) {
          const appealToken = crypto.randomUUID();
          
          await finalizeScreeningRecord(screeningId, {
            decision: 'reject_non_health',
            decision_reasons: { content_classification: contentResult },
            confidence_score: contentResult.confidence,
            cost_cents: totalCost,
            processing_time_ms: Date.now() - startTime
          });

          await createRejectionRecord(documentId, accountId, 'non_health_content', contentResult, appealToken);
          
          return createResponse({
            success: true,
            decision: 'reject_non_health',
            message: 'Document appears to be non-health related',
            data: { screeningId, appealToken }
          }, corsHeaders);
        }
      }

      // Step 5: Identity extraction and profile matching
      if (config.enable_profile_matching) {
        console.log('Running identity extraction...');
        const extractor = new IdentityExtractor();
        const identity = await extractor.extractIdentity(filePath);
        totalCost += 2; // Estimated OCR cost

        console.log('Running profile matching...');
        const matcher = new ProfileMatcher();
        const matchResult = await matcher.matchProfiles(accountId, identity);
        
        const finalDecision = matchResult.decision === 'reject' ? 'needs_manual_verify' : matchResult.decision;
        
        await finalizeScreeningRecord(screeningId, {
          decision: finalDecision,
          decision_reasons: { 
            identity_extraction: identity,
            profile_matching: matchResult 
          },
          confidence_score: matchResult.confidence,
          extracted_identities: identity,
          matched_profile_id: matchResult.matchedProfileId,
          cost_cents: totalCost,
          processing_time_ms: Date.now() - startTime
        });

        // Store candidate profiles if selection needed
        if (matchResult.candidateProfiles) {
          await storeCandidateProfiles(documentId, matchResult.candidateProfiles);
        }

        // Handle different decision outcomes
        switch (finalDecision) {
          case 'accept':
            await updateDocumentStatus(documentId, 'uploaded', matchResult.matchedProfileId);
            await enqueueForProcessing(documentId);
            
            return createResponse({
              success: true,
              decision: 'accept',
              message: 'Document accepted for processing',
              data: { 
                screeningId, 
                matchedProfileId: matchResult.matchedProfileId 
              }
            }, corsHeaders);

          case 'needs_selection':
            await updateDocumentStatus(documentId, 'intake_pending');
            
            return createResponse({
              success: true,
              decision: 'needs_selection',
              message: 'Multiple profiles matched - user selection required',
              data: { 
                screeningId,
                candidateProfiles: matchResult.candidateProfiles 
              }
            }, corsHeaders);

          case 'needs_manual_verify':
            await updateDocumentStatus(documentId, 'intake_pending');
            
            return createResponse({
              success: true,
              decision: 'needs_manual_verify',
              message: 'Manual verification required',
              data: { screeningId }
            }, corsHeaders);

          default:
            throw new Error(`Unexpected decision: ${finalDecision}`);
        }
      }

      // If we get here, screening is disabled - default accept
      await finalizeScreeningRecord(screeningId, {
        decision: 'accept',
        decision_reasons: { screening_disabled: true },
        confidence_score: 1.0,
        cost_cents: 0,
        processing_time_ms: Date.now() - startTime
      });

      await updateDocumentStatus(documentId, 'uploaded');
      await enqueueForProcessing(documentId);

      return createResponse({
        success: true,
        decision: 'accept',
        message: 'Document accepted (screening disabled)',
        data: { screeningId }
      }, corsHeaders);

    } catch (error) {
      console.error('Screening process failed:', error);
      
      await finalizeScreeningRecord(screeningId, {
        decision: 'needs_manual_verify',
        decision_reasons: { error: error.message },
        confidence_score: 0,
        cost_cents: totalCost,
        processing_time_ms: Date.now() - startTime
      });

      return createResponse({
        success: false,
        decision: 'error',
        message: 'Screening failed - manual review required'
      }, corsHeaders, 500);
    }

  } catch (error) {
    console.error('Intake screening request failed:', error);
    
    return createResponse({
      success: false,
      decision: 'error',
      message: 'Invalid request or system error'
    }, corsHeaders, 400);
  }
});

// Helper functions
async function loadIntakeConfig() {
  const { data } = await supabase
    .from('intake_config')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  return data || {
    enable_malware_scanning: true,
    enable_health_classification: true,
    enable_profile_matching: true,
    reject_threshold: 0.9
  };
}

async function initializeScreeningRecord(documentId: string, accountId: string): Promise<string> {
  const { data, error } = await supabase
    .from('intake_screening')
    .insert({
      document_id: documentId,
      account_id: accountId,
      decision: 'processing',
      decision_reasons: { status: 'started' }
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

async function finalizeScreeningRecord(screeningId: string, updates: any) {
  const { error } = await supabase
    .from('intake_screening')
    .update(updates)
    .eq('id', screeningId);

  if (error) {
    console.error('Failed to finalize screening record:', error);
  }
}

async function updateDocumentStatus(documentId: string, status: string, profileId?: string) {
  const updates: any = { status };
  if (profileId) {
    // In the final implementation, we'll need to handle profile assignment properly
    updates.patient_id = profileId;
  }

  const { error } = await supabase
    .from('documents')
    .update(updates)
    .eq('id', documentId);

  if (error) {
    console.error('Failed to update document status:', error);
  }
}

async function enqueueForProcessing(documentId: string) {
  // Get document details for job payload
  const { data: document } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (!document) return;

  // Enqueue for AI processing
  const { error } = await supabase.rpc('enqueue_job', {
    p_type: 'document_processing',
    p_payload: {
      document_id: document.id,
      patient_id: document.patient_id,
      file_path: document.storage_path,
      filename: document.filename,
      processing_method: 'ai_first_multimodal',
      source_system: 'intake_screening'
    },
    p_priority: 1,
    p_scheduled_for: new Date().toISOString()
  });

  if (error) {
    console.error('Failed to enqueue document for processing:', error);
  }
}

async function quarantineDocument(documentId: string, threats: string[]) {
  await supabase
    .from('documents')
    .update({ 
      status: 'quarantined',
      processing_error: JSON.stringify({ threats, quarantined_at: new Date().toISOString() })
    })
    .eq('id', documentId);
}

async function createRejectionRecord(
  documentId: string, 
  accountId: string, 
  reasonCode: string, 
  details: any,
  appealToken: string
) {
  await supabase
    .from('intake_rejections')
    .insert({
      document_id: documentId,
      account_id: accountId,
      reason_code: reasonCode,
      explanation: JSON.stringify(details),
      appeal_token: appealToken,
      retention_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
    });
}

async function storeCandidateProfiles(documentId: string, candidates: any[]) {
  const records = candidates.map(candidate => ({
    document_id: documentId,
    profile_id: candidate.profileId,
    match_score: candidate.score,
    match_reasons: candidate.reasons
  }));

  await supabase
    .from('profile_match_candidates')
    .insert(records);
}

function createResponse(
  response: IntakeScreeningResponse, 
  corsHeaders: Record<string, string>,
  status: number = 200
) {
  return new Response(JSON.stringify(response), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status
  });
}
```

**Afternoon (4 hours): Testing & Debugging**
- Create test cases for each screening scenario
- Test malware detection with sample files
- Test content classification with health/non-health documents
- Test identity extraction and profile matching
- Debug and fix integration issues

### **Day 5: Frontend Integration & User Experience**

**Morning (4 hours): Frontend UI Components**
```typescript
// Frontend components for handling screening decisions
// apps/web/components/intake/IntakeScreeningHandler.tsx

interface IntakeDecisionProps {
  decision: string;
  data?: any;
  onProfileSelect?: (profileId: string) => void;
  onManualVerify?: (verified: boolean) => void;
  onAppeal?: (reason: string) => void;
}

export function IntakeDecisionHandler({ decision, data, ...handlers }: IntakeDecisionProps) {
  switch (decision) {
    case 'needs_selection':
      return <ProfileSelectionDialog 
        candidates={data.candidateProfiles} 
        onSelect={handlers.onProfileSelect}
      />;
      
    case 'needs_manual_verify':
      return <ManualVerificationDialog 
        onVerify={handlers.onManualVerify}
      />;
      
    case 'reject_non_health':
      return <RejectionNotification 
        reason="This document appears to be non-health related"
        appealToken={data.appealToken}
        onAppeal={handlers.onAppeal}
      />;
      
    case 'quarantine_malware':
      return <SecurityAlert 
        message="Security threat detected in document"
      />;
      
    default:
      return null;
  }
}
```

**Afternoon (4 hours): Integration Testing & Documentation**
- End-to-end testing of complete intake workflow
- Performance testing and optimization
- Cost tracking and budget validation
- Documentation updates and deployment prep

---

## **Phase 1 Acceptance Criteria**

### **Technical Completeness**
- [ ] Database schema deployed with RLS policies
- [ ] Malware scanning functional with test cases
- [ ] Content classification achieving >90% accuracy on test set
- [ ] Identity extraction working for common document types
- [ ] Profile matching algorithm implemented and tested
- [ ] Main intake controller handling all decision paths
- [ ] Frontend UI components for all user interaction flows

### **Performance Metrics**
- [ ] Average screening latency <500ms
- [ ] Malware detection catching 100% of test threats
- [ ] Health content classification >95% precision
- [ ] Identity matching >95% accuracy on clear cases
- [ ] Cost per screening <$0.05 average

### **User Experience**
- [ ] Smooth profile selection flow for ambiguous cases
- [ ] Clear rejection notifications with appeal process
- [ ] Manual verification flow for edge cases
- [ ] Error handling with graceful user feedback

### **Security & Compliance**
- [ ] All PHI properly redacted from logs
- [ ] RLS policies preventing data leakage
- [ ] Audit trail complete for all decisions
- [ ] Quarantine process secure and isolated

---

## **Transition to Phase 2**

Upon successful completion of Phase 1:

1. **Deploy to Staging**: Full intake screening system
2. **Metrics Collection**: Begin tracking screening effectiveness
3. **User Feedback**: Collect feedback on UX flows
4. **Performance Tuning**: Optimize based on real usage patterns

**Phase 2 Prerequisites**:
- Phase 1 intake screening operational
- Baseline metrics established
- User acceptance of screening UX flows
- Cost tracking and budget controls validated

*Ready to proceed to [Phase 2: AI-First Pipeline](./phase-2-ai-pipeline.md)*